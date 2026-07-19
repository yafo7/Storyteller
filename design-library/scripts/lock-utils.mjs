import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const exactVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/;
const schemaKeyByFilename = {
  "scope-manifest.schema.json": "scope",
  "work.schema.json": "work",
  "source-record.schema.json": "source",
  "claim.schema.json": "claim",
  "observation.schema.json": "observation",
  "title-dossier.schema.json": "dossier",
  "relation.schema.json": "relation",
  "design-pattern.schema.json": "pattern",
  "pattern-selection.schema.json": "selection",
  "library-lock.schema.json": "lock",
  "benchmark-case.schema.json": "benchmark",
  "pack-manifest.schema.json": "pack",
  "taxonomy.schema.json": "taxonomy",
  "perspective-adapter.schema.json": "adapter",
  "migration.schema.json": "migration",
  "library-release.schema.json": "libraryRelease"
};
const requiredSkillIds = [
  "build-interactive-stage-game-v03",
  "analyze-story-for-game",
  "art-direct-game-assets",
  "compile-script-game",
  "curate-game-design-library",
  "design-narrative-gameplay",
  "design-stage-and-levels",
  "direct-interactive-drama",
  "evaluate-script-game",
  "select-game-design-patterns"
];
const v03SkillIds = new Set([
  "build-interactive-stage-game-v03",
  "curate-game-design-library",
  "select-game-design-patterns"
]);

function fail(message) {
  const error = new Error(message);
  error.code = "LIBRARY_LOCK_INVALID";
  throw error;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function shaJson(value) {
  return sha(Buffer.from(JSON.stringify(value), "utf8"));
}

function codePointCompare(leftValue, rightValue) {
  const left = Array.from(leftValue.normalize("NFC"), (character) => character.codePointAt(0));
  const right = Array.from(rightValue.normalize("NFC"), (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function pathKey(target) {
  const normalized = path.normalize(path.resolve(target));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isContained(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function treeText(leaves) {
  return `${leaves.map((leaf) => `${leaf.sha256}  ${leaf.bytes}  ${leaf.path}`).join("\n")}\n`;
}

async function collectFiles(target, excludedKeys, output = []) {
  const info = await lstat(target);
  if (info.isSymbolicLink()) fail(`Symbolic links are forbidden in a lock tree: ${target}`);
  if (excludedKeys.has(pathKey(target))) return output;
  if (info.isFile()) {
    output.push(target);
    return output;
  }
  assert(info.isDirectory(), `Lock tree member is neither a regular file nor a directory: ${target}`);
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) fail(`Symbolic links are forbidden in a lock tree: ${path.join(target, entry.name)}`);
    await collectFiles(path.join(target, entry.name), excludedKeys, output);
  }
  return output;
}

async function canonicalLeaves(targetPath, { basePath, excludePaths = [] } = {}) {
  const target = path.resolve(targetPath);
  const targetInfo = await lstat(target);
  if (targetInfo.isSymbolicLink()) fail(`Symbolic links are forbidden in a lock tree: ${target}`);
  const base = path.resolve(basePath ?? (targetInfo.isDirectory() ? target : path.dirname(target)));
  const excludedKeys = new Set(excludePaths.map((item) => pathKey(item)));
  const files = await collectFiles(target, excludedKeys);
  const leaves = [];
  for (const filename of files) {
    const relative = path.relative(base, filename).replaceAll("\\", "/").normalize("NFC");
    assert(relative && relative !== ".." && !relative.startsWith("../") && !path.isAbsolute(relative), `Tree member escapes its declared root: ${filename}`);
    const bytes = await readFile(filename);
    leaves.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) });
  }
  leaves.sort((left, right) => codePointCompare(left.path, right.path));
  const paths = leaves.map((leaf) => leaf.path);
  assert(new Set(paths).size === paths.length, `Canonical tree contains duplicate normalized paths below ${target}`);
  return leaves;
}

export async function canonicalTreeHash(targetPath, options = {}) {
  const leaves = await canonicalLeaves(targetPath, options);
  return sha(Buffer.from(treeText(leaves), "utf8"));
}

export async function shaFile(targetPath) {
  const target = path.resolve(targetPath);
  const info = await lstat(target);
  assert(!info.isSymbolicLink() && info.isFile(), `Expected a regular, non-symlink file: ${target}`);
  return sha(await readFile(target));
}

async function readJson(target, label) {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    fail(`Cannot read ${label} at ${target}: ${error.message}`);
  }
}

function compileValidator(schema, label) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  assert(ajv.validateSchema(schema), `${label} is not a valid Draft 2020-12 schema: ${JSON.stringify(ajv.errors)}`);
  try {
    return ajv.compile(schema);
  } catch (error) {
    fail(`${label} did not strict-compile: ${error.message}`);
  }
}

function validateDocument(document, schema, label) {
  const validate = compileValidator(schema, `${label} schema`);
  assert(validate(document), `${label} failed schema validation: ${JSON.stringify(validate.errors)}`);
}

function assertExactVersion(value, label) {
  assert(typeof value === "string" && exactVersionPattern.test(value), `${label} must be an exact semantic version; received ${JSON.stringify(value)}`);
  assert(!/(?:latest|floating|snapshot|\*|\bx\b)/i.test(value), `${label} may not float; received ${value}`);
}

async function resolveRepoPath(relativePath, label) {
  assert(typeof relativePath === "string" && relativePath.length > 0, `${label} path is missing`);
  assert(!path.isAbsolute(relativePath), `${label} path must be repository-relative: ${relativePath}`);
  assert(!relativePath.includes("\\") && relativePath === relativePath.normalize("NFC"), `${label} path must use NFC and forward slashes: ${relativePath}`);
  const target = path.resolve(repoRoot, ...relativePath.split("/"));
  assert(isContained(repoRoot, target), `${label} path escapes the repository: ${relativePath}`);
  let resolvedTarget;
  try {
    resolvedTarget = await realpath(target);
  } catch (error) {
    fail(`${label} path does not exist: ${relativePath} (${error.message})`);
  }
  const resolvedRoot = await realpath(repoRoot);
  assert(isContained(resolvedRoot, resolvedTarget), `${label} path resolves outside the repository: ${relativePath}`);
  return target;
}

async function hashComponentPath(component, label) {
  assertExactVersion(component.version, `${label}.version`);
  const target = await resolveRepoPath(component.path, label);
  const info = await lstat(target);
  const actualHash = info.isDirectory() ? await canonicalTreeHash(target) : await shaFile(target);
  assert(actualHash === component.hash, `${label} hash drift: locked ${component.hash}, current ${actualHash}`);
  return { target, actualHash };
}

function sameSortedValues(left, right) {
  const leftSorted = [...left].sort(codePointCompare);
  const rightSorted = [...right].sort(codePointCompare);
  return leftSorted.length === rightSorted.length && leftSorted.every((value, index) => value === rightSorted[index]);
}

async function verifyManifestTree(entries, { label, scanRoot, baseRoot, excludePaths, expectedTreeHash }) {
  const actualLeaves = await canonicalLeaves(scanRoot, { basePath: baseRoot, excludePaths });
  const actualPaths = actualLeaves.map((leaf) => leaf.path);
  const entryPaths = entries.map((entry) => entry.path);
  assert(new Set(entryPaths).size === entryPaths.length, `${label} file manifest contains duplicate paths`);
  for (const entryPath of entryPaths) {
    assert(entryPath === entryPath.normalize("NFC") && !entryPath.includes("\\") && !entryPath.startsWith("/") && !entryPath.split("/").includes(".."), `${label} contains an unsafe manifest path: ${entryPath}`);
  }
  const sortedEntryPaths = [...entryPaths].sort(codePointCompare);
  assert(entryPaths.every((value, index) => value === sortedEntryPaths[index]), `${label} file manifest is not in Unicode code-point order`);
  assert(sameSortedValues(entryPaths, actualPaths), `${label} file manifest does not exactly match the current tree`);
  const actualByPath = new Map(actualLeaves.map((leaf) => [leaf.path, leaf]));
  for (const entry of entries) {
    const actual = actualByPath.get(entry.path);
    assert(actual && actual.bytes === entry.bytes && actual.sha256 === entry.sha256, `${label} leaf drift at ${entry.path}`);
  }
  const actualTreeHash = sha(Buffer.from(treeText(actualLeaves), "utf8"));
  assert(actualTreeHash === expectedTreeHash, `${label} tree hash drift: locked ${expectedTreeHash}, current ${actualTreeHash}`);
  return { treeHash: actualTreeHash, fileCount: actualLeaves.length };
}

function releaseLeaf(release, relativePath, label) {
  const libraryRelativePath = relativePath.startsWith("design-library/")
    ? relativePath.slice("design-library/".length)
    : relativePath;
  const leaf = release.fileManifest.find((entry) => entry.path === libraryRelativePath);
  assert(leaf, `${label} is absent from the Library release file manifest: ${libraryRelativePath}`);
  return leaf;
}

async function verifyIndexes(release) {
  const indexDirectory = path.join(libraryRoot, "indexes");
  const filenames = (await readdir(indexDirectory)).filter((name) => name.endsWith(".json")).sort(codePointCompare);
  const records = [];
  for (const filename of filenames) {
    const target = path.join(indexDirectory, filename);
    const document = await readJson(target, `index ${filename}`);
    const hash = await shaFile(target);
    const relativePath = `indexes/${filename}`;
    const leaf = releaseLeaf(release, relativePath, `Index ${document.indexId ?? filename}`);
    assert(leaf.sha256 === hash, `Library release leaf hash drift for ${relativePath}`);
    records.push({ id: document.indexId, version: document.indexVersion, hash, relativePath });
  }
  assert(records.every((record) => typeof record.id === "string" && typeof record.version === "string"), "Every index must declare indexId and indexVersion");
  assert(new Set(records.map((record) => record.id)).size === records.length, "Index IDs must be unique");
  assert(sameSortedValues(release.indexes.map((entry) => entry.indexId), records.map((entry) => entry.id)), "Library release index registry does not match current indexes");
  for (const lock of release.indexes) {
    assertExactVersion(lock.version, `release.indexes.${lock.indexId}.version`);
    const current = records.find((record) => record.id === lock.indexId);
    assert(current.version === lock.version && current.hash === lock.hash, `Index lock drift for ${lock.indexId}`);
  }
  const provenance = records.find((record) => record.id === "index.pattern-provenance-review-only");
  assert(provenance && provenance.hash === release.core.provenanceIndexHash, "Provenance index hash does not match the Library release core lock");
  return records;
}

async function verifySchemas(lock, release) {
  const releaseSchemaPaths = release.fileManifest
    .map((entry) => entry.path)
    .filter((value) => /^schemas\/[^/]+\.schema\.json$/.test(value))
    .map((value) => `design-library/${value}`);
  const lockSchemaPaths = lock.schemas.map((component) => component.path);
  assert(sameSortedValues(releaseSchemaPaths, lockSchemaPaths), "Lock schemas must exactly cover the released schema files");
  assert(new Set(lock.schemas.map((component) => component.id)).size === lock.schemas.length, "Lock schema IDs must be unique");
  for (const component of lock.schemas) {
    const { target, actualHash } = await hashComponentPath(component, `schema ${component.id}`);
    const schema = await readJson(target, `schema ${component.id}`);
    assert(schema.$id === component.id, `Schema component ID does not match $id at ${component.path}`);
    const version = schema.$id?.match(/\/schemas\/([^/]+)\//)?.[1];
    assert(version === component.version, `Schema component version does not match $id at ${component.path}`);
    const releaseKey = schemaKeyByFilename[path.basename(component.path)];
    assert(releaseKey && release.schemaVersions[releaseKey] === component.version, `Schema version is not closed by release.schemaVersions at ${component.path}`);
    assert(releaseLeaf(release, component.path, `Schema ${component.id}`).sha256 === actualHash, `Released schema leaf drift at ${component.path}`);
    const metaAjv = new Ajv2020({ strict: true, allErrors: true });
    assert(metaAjv.validateSchema(schema), `Schema failed Draft 2020-12 meta-validation at ${component.path}: ${JSON.stringify(metaAjv.errors)}`);
  }
}

async function verifyAdapters(lock, release, fixture) {
  const lockIds = lock.adapters.map((component) => component.id);
  assert(sameSortedValues(lockIds, release.core.adapterRefs), "Lock adapters must exactly match release.core.adapterRefs");
  const adapterSchema = await readJson(path.join(libraryRoot, "schemas", "perspective-adapter.schema.json"), "perspective adapter schema");
  for (const component of lock.adapters) {
    const { target, actualHash } = await hashComponentPath(component, `adapter ${component.id}`);
    const adapter = await readJson(target, `adapter ${component.id}`);
    validateDocument(adapter, adapterSchema, `Adapter ${component.id}`);
    assert(adapter.adapterId === component.id && adapter.adapterVersion === component.version, `Adapter identity/version drift at ${component.path}`);
    assert(adapter.targetProfile === fixture.productProfile?.id, `Adapter ${component.id} targets ${adapter.targetProfile}, not fixture profile ${fixture.productProfile?.id}`);
    assert(releaseLeaf(release, component.path, `Adapter ${component.id}`).sha256 === actualHash, `Released adapter leaf drift at ${component.path}`);
  }
}

async function verifyPacks(lock, release, disablePack) {
  const packSchema = await readJson(path.join(libraryRoot, "schemas", "pack-manifest.schema.json"), "Pack manifest schema");
  const released = new Map();
  for (const releasePack of release.packs) {
    assertExactVersion(releasePack.version, `release.packs.${releasePack.packId}.version`);
    const directoryName = releasePack.packId.replace(/^pack\./, "");
    assert(directoryName !== releasePack.packId && /^[a-z0-9-]+$/.test(directoryName), `Unsupported Pack ID: ${releasePack.packId}`);
    const packRoot = path.join(libraryRoot, "packs", directoryName);
    const manifestPath = path.join(packRoot, "pack-manifest.json");
    const manifest = await readJson(manifestPath, `Pack manifest ${releasePack.packId}`);
    validateDocument(manifest, packSchema, `Pack manifest ${releasePack.packId}`);
    assert(manifest.packId === releasePack.packId && manifest.packVersion === releasePack.version, `Pack identity/version drift for ${releasePack.packId}`);
    const manifestHash = await shaFile(manifestPath);
    assert(manifestHash === releasePack.manifestHash, `Pack manifest hash drift for ${releasePack.packId}`);
    const manifestRelative = `packs/${directoryName}/pack-manifest.json`;
    assert(releaseLeaf(release, manifestRelative, `Pack manifest ${releasePack.packId}`).sha256 === manifestHash, `Library release does not hash the current Pack manifest for ${releasePack.packId}`);
    await verifyManifestTree(manifest.fileManifest, {
      label: `Pack ${releasePack.packId}`,
      scanRoot: packRoot,
      baseRoot: libraryRoot,
      excludePaths: [manifestPath],
      expectedTreeHash: manifest.hashPolicy.treeHash
    });
    released.set(releasePack.packId, { manifest, manifestHash });
  }
  assert(new Set(release.packs.map((entry) => entry.packId)).size === release.packs.length, "Library release Pack IDs must be unique");
  const enabledIds = lock.provenancePolicy.enabledPackIds;
  const blockedIds = lock.provenancePolicy.blockedPackIds;
  const lockedPackIds = lock.packs.map((entry) => entry.id);
  assert(new Set(enabledIds).size === enabledIds.length && new Set(blockedIds).size === blockedIds.length && new Set(lockedPackIds).size === lockedPackIds.length, "Pack provenance IDs must be unique");
  assert(!enabledIds.some((id) => blockedIds.includes(id)), "Enabled and blocked Pack IDs overlap");
  assert(sameSortedValues(enabledIds, lockedPackIds), "Enabled Pack IDs must exactly match lock.packs");
  const releasedIds = [...released.keys()];
  if (disablePack) {
    assert(enabledIds.length === 0 && lock.packs.length === 0, "A disabled-Pack lock may not retain enabled Pack components");
    assert(sameSortedValues(blockedIds, releasedIds), "A disabled-Pack lock must close every released Pack under blockedPackIds");
  } else {
    assert(blockedIds.length === 0, "The enabled forward lock may not retain blocked Pack IDs");
    assert(sameSortedValues(enabledIds, releasedIds), "The enabled forward lock must close every released Pack under enabledPackIds");
  }
  for (const component of lock.packs) {
    assertExactVersion(component.version, `pack ${component.id}.version`);
    const current = released.get(component.id);
    assert(current, `Lock references a Pack absent from the Library release: ${component.id}`);
    assert(component.enabled === true, `Lock Pack ${component.id} must be explicitly enabled`);
    assert(component.version === current.manifest.packVersion, `Pack version drift for ${component.id}`);
    assert(component.manifestHash === current.manifestHash, `Pack manifest lock drift for ${component.id}`);
    assert(component.contentHash === current.manifest.hashPolicy.treeHash, `Pack content lock drift for ${component.id}`);
  }
  return released;
}

async function verifySkills(lock) {
  const skillComponents = [lock.orchestrator, ...lock.specialistSkills];
  assert(new Set(skillComponents.map((component) => component.id)).size === skillComponents.length, "Skill component IDs must be unique");
  assert(sameSortedValues(skillComponents.map((component) => component.id), requiredSkillIds), "Forward locks must include the V0.3 director, both knowledge Skills, and all seven production specialists");
  assert(lock.orchestrator.id === "build-interactive-stage-game-v03", "The V0.3 director must own the orchestrator lock");
  for (const component of skillComponents) {
    const expectedPath = `.codex/skills/${component.id}`;
    assert(component.path === expectedPath, `Skill ${component.id} must use canonical path ${expectedPath}`);
    if (v03SkillIds.has(component.id)) {
      assert(component.version === "0.3.0", `Skill ${component.id} must lock the current 0.3.0 interface`);
    } else {
      assert(/^0\.0\.0\+baseline\.[a-f0-9]{12}$/.test(component.version), `Reused Skill ${component.id} must lock an immutable legacy baseline version`);
    }
    const { target } = await hashComponentPath(component, `Skill ${component.id}`);
    const skillText = await readFile(path.join(target, "SKILL.md"), "utf8");
    const frontmatterName = skillText.match(/^---\r?\n[\s\S]*?^name:\s*([^\r\n]+)$/m)?.[1]?.trim();
    assert(frontmatterName === component.id, `Skill frontmatter name drift at ${component.path}`);
  }
}

async function verifyProfileAndRuntime(lock, fixture, release) {
  const profile = await hashComponentPath(lock.productProfile, "Product Profile");
  assert(lock.productProfile.id === fixture.productProfile?.id, `Product Profile lock does not match fixture profile ${fixture.productProfile?.id}`);
  assert(lock.productProfile.version === "0.21.0", "The preserved top-down pixel Product Profile must lock version 0.21.0");
  assert(profile.target.endsWith(path.join("build-interactive-stage-game-v021", "references", "top-down-pixel-profile.md")), "Forward fixture must lock the preserved V0.21 top-down pixel profile");

  const runtime = await hashComponentPath(lock.runtimeCapabilities, "Runtime capabilities");
  const runtimeDocument = await readJson(runtime.target, "runtime capability taxonomy");
  assert(runtimeDocument.taxonomyId === lock.runtimeCapabilities.id && runtimeDocument.taxonomyVersion === lock.runtimeCapabilities.version, "Runtime capability taxonomy identity/version drift");
  assert(lock.runtimeCapabilities.path === "design-library/taxonomies/runtime-capabilities.json", "Runtime capability lock must use the released taxonomy path");
  assert(releaseLeaf(release, lock.runtimeCapabilities.path, "Runtime capability taxonomy").sha256 === runtime.actualHash, "Released runtime capability taxonomy hash drift");
  const knownCapabilities = new Set(runtimeDocument.terms.map((term) => term.termId));
  assert(Array.isArray(fixture.runtimeCapabilities) && fixture.runtimeCapabilities.length > 0, "Fixture runtimeCapabilities are missing");
  assert(new Set(fixture.runtimeCapabilities).size === fixture.runtimeCapabilities.length, "Fixture runtimeCapabilities contain duplicates");
  const unknown = fixture.runtimeCapabilities.filter((capability) => !knownCapabilities.has(capability));
  assert(unknown.length === 0, `Fixture references unknown runtime capabilities: ${unknown.join(", ")}`);
}

async function verifyResolvedPatterns(lock, release) {
  if (lock.resolvedPatterns.length === 0) return;
  const registry = await readJson(path.join(libraryRoot, "packs", "zelda-mainline", "patterns", "released-patterns.json"), "released pattern registry");
  const byId = new Map(registry.map((pattern) => [pattern.patternId, pattern]));
  assert(new Set(lock.resolvedPatterns.map((entry) => entry.patternId)).size === lock.resolvedPatterns.length, "Resolved pattern IDs must be unique");
  for (const entry of lock.resolvedPatterns) {
    assertExactVersion(entry.version, `resolvedPatterns.${entry.patternId}.version`);
    const pattern = byId.get(entry.patternId);
    assert(pattern && release.core.patternRefs.includes(entry.patternId), `Resolved pattern is not released: ${entry.patternId}`);
    assert(pattern.patternVersion === entry.version && shaJson(pattern) === entry.hash, `Resolved pattern drift for ${entry.patternId}`);
  }
}

export async function validateAndVerifyLibraryLock(lockPath, { fixturePath, disablePack = false } = {}) {
  assert(typeof disablePack === "boolean", "disablePack must be a boolean");
  assert(fixturePath, "fixturePath is required to verify story, charter, Profile, and runtime locks");
  const absoluteLockPath = path.resolve(lockPath);
  const absoluteFixturePath = path.resolve(fixturePath);
  const lock = await readJson(absoluteLockPath, "Library lock");
  const fixture = await readJson(absoluteFixturePath, "forward fixture");
  const lockSchema = await readJson(path.join(libraryRoot, "schemas", "library-lock.schema.json"), "Library lock schema");
  validateDocument(lock, lockSchema, "Library lock");

  assert(lock.hashPolicy.algorithm === "canonical-tree-sha256/v1" && lock.hashPolicy.canonicalizationVersion === "1", "Unsupported lock hash policy");
  assertExactVersion(lock.schemaVersion, "lock.schemaVersion");
  assertExactVersion(lock.invalidationPolicyVersion, "lock.invalidationPolicyVersion");
  assert(lock.invalidationPolicyVersion === "1.0.0", "Unsupported invalidation policy version");
  assert(!Number.isNaN(Date.parse(lock.createdAt)), `lock.createdAt is not an ISO-compatible timestamp: ${lock.createdAt}`);
  assert(fixture.storyModel && fixture.productionCharter, "Fixture must contain storyModel and productionCharter before final lock creation");
  assert(lock.input.scriptHash === await shaFile(absoluteFixturePath), "Input fixture/script hash drift");
  assert(lock.input.storyModelHash === shaJson(fixture.storyModel), "Story model hash drift");
  assert(lock.input.productionCharterHash === shaJson(fixture.productionCharter), "Production charter hash drift");

  assertExactVersion(lock.library.version, "library.version");
  const releasePath = path.join(libraryRoot, "releases", `${lock.library.version}.json`);
  const release = await readJson(releasePath, `Library release ${lock.library.version}`);
  const releaseSchema = await readJson(path.join(libraryRoot, "schemas", "library-release.schema.json"), "Library release schema");
  validateDocument(release, releaseSchema, `Library release ${lock.library.version}`);
  assert(release.libraryId === lock.library.id && release.libraryVersion === lock.library.version, "Library identity/version drift");
  assert(await shaFile(releasePath) === lock.library.manifestHash, "Library release manifest hash drift");
  assert(release.hashPolicy.treeHash === lock.library.contentHash, "Library content hash drift");
  assert(lock.hashPolicy.fileManifestHash === release.hashPolicy.treeHash, "Lock fileManifestHash must equal the released canonical tree hash");
  const libraryTree = await verifyManifestTree(release.fileManifest, {
    label: `Library ${release.libraryId}@${release.libraryVersion}`,
    scanRoot: libraryRoot,
    baseRoot: libraryRoot,
    excludePaths: [releasePath],
    expectedTreeHash: release.hashPolicy.treeHash
  });

  const libraryManifest = await readJson(path.join(libraryRoot, "library-manifest.json"), "Library manifest");
  assert(libraryManifest.libraryId === release.libraryId && libraryManifest.libraryVersion === release.libraryVersion && libraryManifest.status === release.status, "Library manifest and release identity/status differ");
  await verifyPacks(lock, release, disablePack);
  await verifyIndexes(release);
  await verifySchemas(lock, release);
  await verifyAdapters(lock, release, fixture);
  await verifySkills(lock);
  await verifyProfileAndRuntime(lock, fixture, release);
  await verifyResolvedPatterns(lock, release);
  if (lock.toolchain?.node) assert(lock.toolchain.node === process.version, `Node toolchain drift: locked ${lock.toolchain.node}, current ${process.version}`);

  return {
    lock,
    fixture,
    verified: {
      lockPath: absoluteLockPath,
      fixturePath: absoluteFixturePath,
      disablePack,
      libraryId: release.libraryId,
      libraryVersion: release.libraryVersion,
      libraryTreeHash: libraryTree.treeHash,
      libraryFileCount: libraryTree.fileCount,
      enabledPackIds: lock.provenancePolicy.enabledPackIds,
      blockedPackIds: lock.provenancePolicy.blockedPackIds,
      schemaCount: lock.schemas.length,
      adapterCount: lock.adapters.length,
      skillCount: 1 + lock.specialistSkills.length
    }
  };
}

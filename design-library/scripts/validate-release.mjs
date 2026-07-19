import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packRoot = path.join(root, "packs", "zelda-mainline");
const releasePath = path.join(root, "releases", "0.3.0.json");
const packManifestPath = path.join(packRoot, "pack-manifest.json");
const errors = [];
const metrics = {};
const fail = (message) => errors.push(message);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (target) => path.relative(root, target).replaceAll("\\", "/").normalize("NFC");
const codePointCompare = (a, b) => {
  const left = Array.from(a.normalize("NFC"), (character) => character.codePointAt(0));
  const right = Array.from(b.normalize("NFC"), (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const load = async (target) => JSON.parse(await readFile(target, "utf8"));

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Release trees reject symbolic links or junctions: ${rel(target)}`);
    else if (entry.isDirectory()) output.push(...await filesUnder(target));
    else if (entry.isFile()) output.push(target);
    else fail(`Release trees accept only regular files: ${rel(target)}`);
  }
  return output.sort((a, b) => codePointCompare(rel(a), rel(b)));
}

function validManifestPath(value) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC") || value.includes("\\") || value.includes("\0") || /[\r\n]/.test(value)) return false;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function treeText(entries) {
  return `${entries.map((entry) => `${entry.sha256}  ${entry.bytes}  ${entry.path}`).join("\n")}\n`;
}

async function verifyTree(label, entries, actualTargets, expectedTreeHash) {
  const manifestPaths = entries.map((entry) => entry.path);
  const normalizedUnique = new Set(manifestPaths.map((value) => value.normalize("NFC")));
  if (normalizedUnique.size !== manifestPaths.length) fail(`${label}: duplicate canonical paths.`);
  for (const value of manifestPaths) if (!validManifestPath(value)) fail(`${label}: invalid manifest path ${JSON.stringify(value)}.`);
  const sortedPaths = [...manifestPaths].sort(codePointCompare);
  if (!same(manifestPaths, sortedPaths)) fail(`${label}: fileManifest is not in NFC Unicode code-point order.`);
  const actualPaths = actualTargets.map(rel).sort(codePointCompare);
  if (!same(manifestPaths, actualPaths)) {
    const listed = new Set(manifestPaths);
    const actual = new Set(actualPaths);
    fail(`${label}: file set mismatch; missing=${actualPaths.filter((value) => !listed.has(value)).join(",")}; extra=${manifestPaths.filter((value) => !actual.has(value)).join(",")}`);
  }
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const target of actualTargets) {
    const value = rel(target);
    const entry = byPath.get(value);
    if (!entry) continue;
    const bytes = await readFile(target);
    try { decoder.decode(bytes); } catch { fail(`${label}: ${value} is not valid UTF-8.`); }
    if (entry.bytes !== bytes.length) fail(`${label}: byte count mismatch for ${value}.`);
    if (entry.sha256 !== sha(bytes)) fail(`${label}: SHA-256 mismatch for ${value}.`);
  }
  const computedTreeHash = sha(Buffer.from(treeText(entries), "utf8"));
  if (computedTreeHash !== expectedTreeHash) fail(`${label}: tree hash mismatch ${expectedTreeHash} != ${computedTreeHash}.`);
  return computedTreeHash;
}

const packManifest = await load(packManifestPath);
const release = await load(releasePath);
const packTargets = (await filesUnder(packRoot)).filter((target) => target !== packManifestPath);
const libraryTargets = (await filesUnder(root)).filter((target) => target !== releasePath);
const packTreeHash = await verifyTree("Pack", packManifest.fileManifest, packTargets, packManifest.hashPolicy.treeHash);
const libraryTreeHash = await verifyTree("Library", release.fileManifest, libraryTargets, release.hashPolicy.treeHash);

const works = await load(path.join(packRoot, "works", "work-registry.json"));
const sources = await load(path.join(packRoot, "sources", "source-registry.json"));
const claims = await load(path.join(packRoot, "claims", "claim-registry.json"));
const observations = await load(path.join(packRoot, "observations", "observation-registry.json"));
const dossiers = await load(path.join(packRoot, "works", "title-dossier-registry.json"));
const patterns = await load(path.join(packRoot, "patterns", "released-patterns.json"));
const relations = await load(path.join(packRoot, "relations", "relation-registry.json"));
const benchmarkCases = await load(path.join(root, "benchmarks", "benchmark-cases.json"));
const actualCounts = { works: works.length, sources: sources.length, observations: observations.length, claims: claims.length, dossiers: dossiers.length, patterns: patterns.length, relations: relations.length, adapters: 0, benchmarks: 0 };
if (!same(packManifest.content, actualCounts)) fail(`Pack content counts are not authoritative-registry counts: ${JSON.stringify(packManifest.content)} != ${JSON.stringify(actualCounts)}.`);
for (const [label, values, key] of [["works", works, "workId"], ["sources", sources, "sourceId"], ["claims", claims, "claimId"], ["observations", observations, "observationId"], ["dossiers", dossiers, "dossierId"], ["patterns", patterns, "patternId"], ["relations", relations, "relationId"]]) {
  if (new Set(values.map((value) => value[key])).size !== values.length) fail(`${label}: duplicate authoritative IDs.`);
}
const scopeBytes = await readFile(path.join(packRoot, "corpus-scope.json"));
const scope = JSON.parse(scopeBytes);
if (packManifest.scope.scopeId !== scope.scopeId || packManifest.scope.scopeVersion !== scope.scopeVersion || packManifest.scope.scopeHash !== sha(scopeBytes)) fail("Pack scope lock does not close over corpus-scope.json.");

if (release.packs.length !== 1 || release.packs[0].packId !== packManifest.packId || release.packs[0].version !== packManifest.packVersion || release.status !== packManifest.status) fail("Library/Pack identity, version, or status mismatch.");
const packManifestBytes = await readFile(packManifestPath);
const libraryLeafMap = new Map(release.fileManifest.map((entry) => [entry.path, entry]));
if (release.packs[0].manifestHash !== sha(packManifestBytes) || libraryLeafMap.get(rel(packManifestPath))?.sha256 !== sha(packManifestBytes)) fail("Parent release does not hash the exact child Pack manifest.");

const indexTargets = (await filesUnder(path.join(root, "indexes"))).filter((target) => target.endsWith(".json"));
const indexRecords = [];
for (const target of indexTargets) {
  const value = await load(target);
  const bytes = await readFile(target);
  indexRecords.push({ indexId: value.indexId, version: value.indexVersion, hash: sha(bytes), path: rel(target) });
}
const declaredIndexes = release.indexes.map((entry) => ({ indexId: entry.indexId, version: entry.version, hash: entry.hash })).sort((a, b) => codePointCompare(a.indexId, b.indexId));
const actualIndexes = indexRecords.map(({ indexId, version, hash }) => ({ indexId, version, hash })).sort((a, b) => codePointCompare(a.indexId, b.indexId));
if (!same(declaredIndexes, actualIndexes)) fail("Release index set, internal IDs/versions, or hashes do not close.");
for (const index of indexRecords) if (libraryLeafMap.get(index.path)?.sha256 !== index.hash) fail(`Library leaf does not match ${index.indexId}.`);
const provenance = indexRecords.find((entry) => entry.indexId === "index.pattern-provenance-review-only");
if (!provenance || release.core.provenanceIndexHash !== provenance.hash) fail("Core provenanceIndexHash does not close over the provenance index.");

const releasedPatternRefs = patterns.filter((pattern) => pattern.status === "released" && pattern.autoSelectable).map((pattern) => pattern.patternId).sort(codePointCompare);
if (!same([...release.core.patternRefs].sort(codePointCompare), releasedPatternRefs)) fail("Release core.patternRefs is not the exact released+autoSelectable set.");
const adapter = await load(path.join(root, "core", "perspective-adapters", "2d-topdown-v021.json"));
if (!release.core.adapterRefs.includes(adapter.adapterId) || !libraryLeafMap.has("core/perspective-adapters/2d-topdown-v021.json")) fail("Adapter reference is unresolved or uncommitted.");
const composition = await load(path.join(root, "core", "composition-rules", "default-1-plus-3.json"));
if (!release.core.compositionRuleRefs.includes(composition.ruleId) || !libraryLeafMap.has("core/composition-rules/default-1-plus-3.json")) fail("Composition rule reference is unresolved or uncommitted.");

const schemaTargets = (await filesUnder(path.join(root, "schemas"))).filter((target) => target.endsWith(".schema.json"));
if (schemaTargets.length !== 16 || Object.keys(release.schemaVersions).length !== 16) fail("Release must close exactly 16 schemas and version keys.");
for (const target of schemaTargets) {
  const schema = await load(target);
  if (!schema.$id?.includes("/1.0.0/") || !libraryLeafMap.has(rel(target))) fail(`Schema version/file closure failed for ${rel(target)}.`);
}

const libraryManifest = await load(path.join(root, "library-manifest.json"));
if (libraryManifest.libraryId !== release.libraryId || libraryManifest.libraryVersion !== release.libraryVersion || libraryManifest.status !== release.status || libraryManifest.defaultPackRef !== `${packManifest.packId}@${packManifest.packVersion}` || libraryManifest.defaultAdapterRef !== `${adapter.adapterId}@${adapter.adapterVersion}`) fail("library-manifest.json identity/defaults do not close over the release.");

metrics.pack = { files: packManifest.fileManifest.length, treeHash: packTreeHash, counts: actualCounts, releasedPatterns: releasedPatternRefs.length };
metrics.library = { files: release.fileManifest.length, treeHash: libraryTreeHash, indexes: indexRecords.length, adapter: adapter.adapterId, benchmarkCases: benchmarkCases.length };
const report = { ok: errors.length === 0, errors, metrics };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`V0.3 release validation ${report.ok ? "passed" : "failed"}: Pack ${metrics.pack.files} files; Library ${metrics.library.files} files.`);
  for (const error of errors) console.error(`ERROR ${error}`);
}
if (!report.ok) process.exitCode = 1;

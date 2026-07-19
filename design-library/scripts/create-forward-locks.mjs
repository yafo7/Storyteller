import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalTreeHash, shaFile, validateAndVerifyLibraryLock } from "./lock-utils.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const fixturePath = path.join(libraryRoot, "benchmarks", "story-fixtures", "forward-unseen.json");
const outputRoot = path.join(repoRoot, "planning", "v03-zelda-mainline", "fixtures");
const skillVersion = "0.3.0";
const newSpecialistSkillIds = ["curate-game-design-library", "select-game-design-patterns"];
const reusedSpecialistSkillIds = [
  "analyze-story-for-game",
  "design-narrative-gameplay",
  "direct-interactive-drama",
  "design-stage-and-levels",
  "art-direct-game-assets",
  "compile-script-game",
  "evaluate-script-game"
];
const codePointCompare = (leftValue, rightValue) => {
  const left = Array.from(leftValue.normalize("NFC"), (character) => character.codePointAt(0));
  const right = Array.from(rightValue.normalize("NFC"), (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
};
const shaJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = async (target) => JSON.parse(await readFile(target, "utf8"));
const relative = (target) => path.relative(repoRoot, target).replaceAll("\\", "/").normalize("NFC");

async function component(id, version, target) {
  const info = await lstat(target);
  return {
    id,
    version,
    path: relative(target),
    hash: info.isDirectory() ? await canonicalTreeHash(target) : await shaFile(target)
  };
}

async function schemaComponents(release) {
  const filenames = (await readdir(path.join(libraryRoot, "schemas")))
    .filter((filename) => filename.endsWith(".schema.json"))
    .sort(codePointCompare);
  const output = [];
  for (const filename of filenames) {
    const target = path.join(libraryRoot, "schemas", filename);
    const schema = await readJson(target);
    const version = schema.$id?.match(/\/schemas\/([^/]+)\//)?.[1];
    if (!schema.$id || !version || !Object.values(release.schemaVersions).includes(version)) throw new Error(`Cannot derive a released schema lock for ${filename}.`);
    output.push(await component(schema.$id, version, target));
  }
  return output;
}

async function adapterComponents(release) {
  const directory = path.join(libraryRoot, "core", "perspective-adapters");
  const filenames = (await readdir(directory)).filter((filename) => filename.endsWith(".json")).sort(codePointCompare);
  const adapters = [];
  for (const filename of filenames) {
    const target = path.join(directory, filename);
    const adapter = await readJson(target);
    if (release.core.adapterRefs.includes(adapter.adapterId)) adapters.push(await component(adapter.adapterId, adapter.adapterVersion, target));
  }
  const lockedIds = adapters.map((entry) => entry.id).sort(codePointCompare);
  const releasedIds = [...release.core.adapterRefs].sort(codePointCompare);
  if (JSON.stringify(lockedIds) !== JSON.stringify(releasedIds)) throw new Error("Released adapter refs do not resolve to exact adapter files.");
  return adapters;
}

async function packComponents(release) {
  const packs = [];
  for (const releasePack of release.packs) {
    const directoryName = releasePack.packId.replace(/^pack\./, "");
    const manifestPath = path.join(libraryRoot, "packs", directoryName, "pack-manifest.json");
    const manifest = await readJson(manifestPath);
    if (!manifest.hashPolicy?.treeHash) throw new Error(`Pack ${releasePack.packId} has no compiled treeHash; regenerate the release before creating locks.`);
    packs.push({
      id: releasePack.packId,
      version: releasePack.version,
      manifestHash: await shaFile(manifestPath),
      contentHash: manifest.hashPolicy.treeHash,
      enabled: true
    });
  }
  return packs;
}

async function atomicJson(target, value) {
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

async function main() {
  const fixtureBytes = await readFile(fixturePath);
  const fixture = JSON.parse(fixtureBytes);
  if (!fixture.storyModel || !fixture.productionCharter) throw new Error("The forward fixture must contain an approved story model and production charter before locking.");

  const libraryManifest = await readJson(path.join(libraryRoot, "library-manifest.json"));
  const releasePath = path.join(libraryRoot, "releases", `${libraryManifest.libraryVersion}.json`);
  const release = await readJson(releasePath);
  const packs = await packComponents(release);
  const schemas = await schemaComponents(release);
  const adapters = await adapterComponents(release);
  const orchestrator = await component(
    "build-interactive-stage-game-v03",
    skillVersion,
    path.join(repoRoot, ".codex", "skills", "build-interactive-stage-game-v03")
  );
  const deployment = await readJson(path.join(repoRoot, "planning", "v03-zelda-mainline", "deployment-manifest.json"));
  const baselineVersion = `0.0.0+baseline.${deployment.legacyBaseline.sourceCommit.slice(0, 12)}`;
  const specialistSkills = [];
  for (const skillId of newSpecialistSkillIds) {
    specialistSkills.push(await component(skillId, skillVersion, path.join(repoRoot, ".codex", "skills", skillId)));
  }
  for (const skillId of reusedSpecialistSkillIds) {
    specialistSkills.push(await component(skillId, baselineVersion, path.join(repoRoot, ".codex", "skills", skillId)));
  }
  const productProfile = await component(
    fixture.productProfile.id,
    "0.21.0",
    path.join(repoRoot, ".codex", "skills", "build-interactive-stage-game-v021", "references", "top-down-pixel-profile.md")
  );
  const runtimeTaxonomyPath = path.join(libraryRoot, "taxonomies", "runtime-capabilities.json");
  const runtimeTaxonomy = await readJson(runtimeTaxonomyPath);
  const runtimeCapabilities = await component(runtimeTaxonomy.taxonomyId, runtimeTaxonomy.taxonomyVersion, runtimeTaxonomyPath);
  const retrievalIndex = await readJson(path.join(libraryRoot, "indexes", "retrieval-index.json"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrievalIndex.generatedAt)) throw new Error("The retrieval index has no deterministic YYYY-MM-DD generation date.");
  const createdAt = `${retrievalIndex.generatedAt}T00:00:00Z`;
  const common = {
    schemaVersion: "1.0.0",
    hashPolicy: {
      algorithm: "canonical-tree-sha256/v1",
      canonicalizationVersion: "1",
      fileManifestHash: release.hashPolicy.treeHash
    },
    input: {
      scriptHash: createHash("sha256").update(fixtureBytes).digest("hex"),
      storyModelHash: shaJson(fixture.storyModel),
      productionCharterHash: shaJson(fixture.productionCharter)
    },
    orchestrator,
    specialistSkills,
    library: {
      id: release.libraryId,
      version: release.libraryVersion,
      manifestHash: await shaFile(releasePath),
      contentHash: release.hashPolicy.treeHash
    },
    schemas,
    resolvedPatterns: [],
    adapters,
    productProfile,
    runtimeCapabilities,
    invalidationPolicyVersion: "1.0.0",
    createdAt,
    toolchain: { node: process.version }
  };
  const packIds = release.packs.map((entry) => entry.packId).sort(codePointCompare);
  const enabled = {
    ...common,
    lockId: "lock.forward-unseen.enabled",
    productionId: "production.forward-unseen.enabled",
    packs,
    provenancePolicy: {
      enabledPackIds: packIds,
      blockedPackIds: [],
      allowCorePromotedFromBlockedPack: false
    }
  };
  const blocked = {
    ...common,
    lockId: "lock.forward-unseen.blocked",
    productionId: "production.forward-unseen.blocked",
    packs: [],
    provenancePolicy: {
      enabledPackIds: [],
      blockedPackIds: packIds,
      allowCorePromotedFromBlockedPack: false
    }
  };

  const validationRoot = await mkdtemp(path.join(os.tmpdir(), "storyteller-forward-lock-"));
  try {
    const enabledTemporary = path.join(validationRoot, "forward-enabled-lock.json");
    const blockedTemporary = path.join(validationRoot, "forward-blocked-lock.json");
    await writeFile(enabledTemporary, `${JSON.stringify(enabled, null, 2)}\n`);
    await writeFile(blockedTemporary, `${JSON.stringify(blocked, null, 2)}\n`);
    await validateAndVerifyLibraryLock(enabledTemporary, { fixturePath, disablePack: false });
    await validateAndVerifyLibraryLock(blockedTemporary, { fixturePath, disablePack: true });
  } finally {
    await rm(validationRoot, { recursive: true, force: true });
  }

  await mkdir(outputRoot, { recursive: true });
  await atomicJson(path.join(outputRoot, "forward-enabled-lock.json"), enabled);
  await atomicJson(path.join(outputRoot, "forward-blocked-lock.json"), blocked);
  console.log(`Generated and verified forward locks outside the Library tree: ${relative(outputRoot)}`);
}

try {
  await main();
} catch (error) {
  console.error(`Forward lock generation refused: ${error.message}`);
  process.exitCode = 1;
}

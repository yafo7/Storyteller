import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const packRoot = path.join(libraryRoot, "packs", "zelda-mainline");
const maturityPath = path.join(packRoot, "patterns", "maturity-contracts.json");
const registryPath = path.join(libraryRoot, "benchmarks", "fixture-registry.json");
const fixtureRoot = path.join(libraryRoot, "benchmarks", "maturity-fixtures");
const maturity = JSON.parse(await readFile(maturityPath, "utf8"));
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const compare = (left, right) => left.localeCompare(right, "en", { sensitivity: "variant" });
const generatedEntries = [];
const fixtureIds = new Set();

function filenameFor(fixtureId) {
  return `${fixtureId.replace(/^fixture\./, "").replaceAll(".", "--")}.json`;
}

function atomicJson(target, value) {
  const temporary = `${target}.tmp-${process.pid}`;
  return writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    .then(() => rename(temporary, target));
}

await mkdir(fixtureRoot, { recursive: true });
for (const contract of Object.values(maturity.patterns)) {
  for (const test of contract.tests) {
    if (fixtureIds.has(test.fixtureRef)) throw new Error(`Duplicate maturity fixture ID: ${test.fixtureRef}`);
    fixtureIds.add(test.fixtureRef);
    const filename = filenameFor(test.fixtureRef);
    const relativePath = `maturity-fixtures/${filename}`;
    const purpose = `${test.kind} contract fixture for ${contract.patternId}; it defines an original scenario boundary and expected observable evidence, not a claim that a game runtime has already executed it.`;
    const payload = {
      fixtureVersion: "1.0.0",
      fixtureId: test.fixtureRef,
      patternId: contract.patternId,
      testId: test.testId,
      kind: test.kind,
      status: "authored-contract-fixture",
      originalityStatement: "This synthetic contract fixture was authored for Storyteller validation and contains no source map, character, dialogue, audiovisual signature, or encounter sequence.",
      purpose,
      sourceContract: "packs/zelda-mainline/patterns/maturity-contracts.json",
      scenarioBoundary: {
        subtype: contract.subtype,
        selectionRole: contract.selectionRole,
        requiredRuntimeCapabilities: contract.runtime.capabilities,
        recoveryRequirements: contract.composition.recovery
      },
      expectedAssertions: test.assertions.map((assertion) => ({
        evidencePath: assertion.path,
        operator: assertion.operator,
        expected: assertion.expected
      })),
      executionPolicy: {
        executableInP4: false,
        firstRuntimeExecutionPhase: "P7",
        failClosedUntilRuntimeEvidence: true
      }
    };
    await atomicJson(path.join(fixtureRoot, filename), payload);
    generatedEntries.push({ fixtureId: test.fixtureRef, purpose, path: relativePath, status: "authored-contract-fixture" });
  }
}

if (generatedEntries.length !== 60) throw new Error(`Expected 60 maturity fixtures, found ${generatedEntries.length}.`);
const retained = registry.fixtures.filter((entry) => !String(entry.path).startsWith("maturity-fixtures/"));
const fixtures = [...retained, ...generatedEntries].sort((left, right) => compare(left.fixtureId, right.fixtureId));
if (new Set(fixtures.map((entry) => entry.fixtureId)).size !== fixtures.length) throw new Error("Fixture registry contains duplicate IDs after maturity fixture compilation.");
await atomicJson(registryPath, { ...registry, fixtures });
console.log(`Compiled ${generatedEntries.length} explicit P4 contract fixtures; ${fixtures.length} total fixture registry entries.`);

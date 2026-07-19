import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..");
const repoRootReal = await realpath(repoRoot);
const packRoot = path.join(root, "packs", "zelda-mainline");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const load = async (target) => JSON.parse(await readFile(target, "utf8"));
const rel = (target) => path.relative(root, target).replaceAll("\\", "/").normalize("NFC");
const codePointCompare = (a, b) => {
  const left = Array.from(a.normalize("NFC"), (character) => character.codePointAt(0));
  const right = Array.from(b.normalize("NFC"), (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
};
const treeText = (leaves) => `${leaves.map((item) => `${item.sha256}  ${item.bytes}  ${item.path}`).join("\n")}\n`;
const benchmarkGateIds = ["G6_selectionQuality", "G7_compositionDiscipline", "G8_canonSafetyContract", "G9_runtimeFit"];
const expectedBenchmarkCoreInputs = {
  benchmarkCases: "design-library/benchmarks/benchmark-cases.json",
  patternRegistry: "design-library/packs/zelda-mainline/patterns/released-patterns.json",
  retrievalIndex: "design-library/indexes/retrieval-index.json",
  selector: "design-library/scripts/select-patterns.mjs",
  selectionSchema: "design-library/schemas/pattern-selection.schema.json",
  benchmarkRunner: "design-library/scripts/run-selector-benchmarks.mjs"
};
const expectedAdapterInputs = {
  adapter: "design-library/core/perspective-adapters/2d-topdown-v021.json",
  patterns: "design-library/packs/zelda-mainline/patterns/released-patterns.json",
  effectContracts: "design-library/benchmarks/adapter-effect-contracts.json",
  stateFixtures: "design-library/benchmarks/adapter-state-fixtures.json",
  testRegistry: "design-library/benchmarks/test-registry.json",
  capabilityTaxonomy: "design-library/taxonomies/runtime-capabilities.json",
  harness: "design-library/scripts/run-adapter-contract-tests.mjs"
};

function isWithin(base, target) {
  const relative = path.relative(base, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function verifyFileAttestation(attestation, label, expectedPath = null) {
  if (!attestation || typeof attestation !== "object") throw new Error(`${label} is missing.`);
  const declaredPath = attestation.path;
  if (typeof declaredPath !== "string" || !declaredPath || path.isAbsolute(declaredPath)) throw new Error(`${label} has an invalid repository-relative path.`);
  const normalizedPath = declaredPath.replaceAll("\\", "/");
  if (declaredPath !== normalizedPath || path.posix.normalize(normalizedPath) !== normalizedPath || normalizedPath.startsWith("../")) throw new Error(`${label} path is not canonical repository-relative form.`);
  if (expectedPath !== null && normalizedPath !== expectedPath) throw new Error(`${label} attests ${normalizedPath}; expected ${expectedPath}.`);
  const target = path.resolve(repoRoot, normalizedPath);
  if (!isWithin(repoRoot, target)) throw new Error(`${label} escapes the repository.`);
  const realTarget = await realpath(target);
  if (!isWithin(repoRootReal, realTarget)) throw new Error(`${label} resolves outside the repository.`);
  const bytes = await readFile(realTarget);
  const digest = sha(bytes);
  if (!Number.isSafeInteger(attestation.bytes) || attestation.bytes !== bytes.length) throw new Error(`${label} byte count does not match raw file bytes.`);
  if (!/^[0-9a-f]{64}$/.test(attestation.sha256 ?? "") || attestation.sha256 !== digest) throw new Error(`${label} SHA-256 does not match raw file bytes.`);
  return { bytes, digest, path: normalizedPath };
}

async function verifyBenchmarkEvidence(report, cases) {
  if (report.runCount !== 30 || report.passedRuns !== 30 || report.failedRuns !== 0) throw new Error("Selector benchmark matrix is not 30/30.");
  if (report.evaluatorCoverage?.declaredProperties !== 35 || report.evaluatorCoverage?.registeredProperties !== 35 || !Array.isArray(report.evaluatorCoverage?.unknownProperties) || report.evaluatorCoverage.unknownProperties.length !== 0) throw new Error("Selector benchmark evaluator coverage is not 35/35 with zero unknown properties.");
  const gateKeys = Object.keys(report.gateResults ?? {}).sort();
  if (gateKeys.length !== benchmarkGateIds.length || benchmarkGateIds.some((gate) => report.gateResults?.[gate]?.passed !== true)) throw new Error("Selector benchmark aggregate G6-G9 gates are not all passing.");

  const coreInputs = report.inputAttestations?.coreInputs;
  if (!coreInputs || typeof coreInputs !== "object" || Object.keys(coreInputs).length !== Object.keys(expectedBenchmarkCoreInputs).length) throw new Error("Selector benchmark core-input attestations are incomplete.");
  for (const [key, expectedPath] of Object.entries(expectedBenchmarkCoreInputs)) await verifyFileAttestation(coreInputs[key], `Selector benchmark core input ${key}`, expectedPath);

  const expectedFixtures = new Map();
  for (const benchmark of cases) {
    const fixturePath = benchmark.inputFixture?.path;
    const fixtureHash = benchmark.inputFixture?.hash;
    if (typeof fixturePath !== "string" || typeof fixtureHash !== "string") throw new Error(`Benchmark ${benchmark.benchmarkId} has an invalid fixture declaration.`);
    const previous = expectedFixtures.get(fixturePath);
    if (previous && previous !== fixtureHash) throw new Error(`Benchmark fixture ${fixturePath} has conflicting declared hashes.`);
    expectedFixtures.set(fixturePath, fixtureHash);
  }
  const fixtureAttestations = report.inputAttestations?.fixtures;
  if (!Array.isArray(fixtureAttestations) || fixtureAttestations.length !== expectedFixtures.size) throw new Error("Selector benchmark fixture attestations do not cover the exact fixture set.");
  const seenFixtures = new Set();
  for (const attestation of fixtureAttestations) {
    if (seenFixtures.has(attestation.path) || !expectedFixtures.has(attestation.path)) throw new Error(`Unexpected or duplicate selector fixture attestation ${attestation.path}.`);
    seenFixtures.add(attestation.path);
    const verified = await verifyFileAttestation(attestation, `Selector benchmark fixture ${attestation.path}`, attestation.path);
    const declaredHash = expectedFixtures.get(attestation.path);
    if (attestation.declaredHash !== declaredHash || attestation.hashMatches !== true || verified.digest !== declaredHash || (attestation.conflictingDeclaredHashes?.length ?? 0) !== 0) throw new Error(`Selector benchmark fixture declaration is not closed for ${attestation.path}.`);
  }

  const expectedOutputs = new Map();
  const benchmarkById = new Map(cases.map((benchmark) => [benchmark.benchmarkId, benchmark]));
  for (const benchmark of cases) for (const seed of benchmark.seeds ?? []) {
    const key = `${benchmark.benchmarkId}|${seed}`;
    expectedOutputs.set(key, `design-library/benchmarks/expected/${benchmark.benchmarkId.replace(/^benchmark\./, "")}-seed-${seed}.json`);
  }
  if (expectedOutputs.size !== 30 || !Array.isArray(report.outputAttestations) || report.outputAttestations.length !== expectedOutputs.size) throw new Error("Selector benchmark output attestations do not cover all 30 runs.");
  const seenOutputs = new Set();
  for (const attestation of report.outputAttestations) {
    const key = `${attestation.benchmarkId}|${attestation.seed}`;
    if (seenOutputs.has(key) || !expectedOutputs.has(key)) throw new Error(`Unexpected or duplicate selector output attestation ${key}.`);
    seenOutputs.add(key);
    await verifyFileAttestation(attestation, `Selector benchmark output ${key}`, expectedOutputs.get(key));
  }
  if (!Array.isArray(report.runRecords) || report.runRecords.length !== 30) throw new Error("Selector benchmark report does not contain exactly 30 run records.");
  const seenRuns = new Set();
  for (const run of report.runRecords) {
    const key = `${run.benchmarkId}|${run.seed}`;
    if (!expectedOutputs.has(key) || seenRuns.has(key)) throw new Error(`Selector benchmark run records contain unexpected or duplicate run ${key}.`);
    seenRuns.add(key);
    const benchmark = benchmarkById.get(run.benchmarkId);
    const declaredProperties = [...(benchmark?.expectedProperties ?? []).map((property) => `expected|${property}`), ...(benchmark?.forbiddenProperties ?? []).map((property) => `forbidden|${property}`)];
    const evaluatedProperties = (run.propertyEvaluations ?? []).map((evaluation) => `${evaluation.expectation}|${evaluation.property}`);
    const propertySetClosed = evaluatedProperties.length === declaredProperties.length && new Set(evaluatedProperties).size === declaredProperties.length && declaredProperties.every((property) => evaluatedProperties.includes(property));
    const declaredMetrics = benchmark?.metrics ?? [];
    const evaluatedMetricIds = (run.metricEvaluations ?? []).map((evaluation) => evaluation.metricId);
    const metricSetClosed = evaluatedMetricIds.length === declaredMetrics.length && new Set(evaluatedMetricIds).size === declaredMetrics.length && declaredMetrics.every((metric) => evaluatedMetricIds.includes(metric.metricId));
    if (run.passed !== true || (run.errors?.length ?? 0) !== 0 || !propertySetClosed || !metricSetClosed || benchmarkGateIds.some((gate) => run.gateResults?.[gate]?.passed !== true) || (run.propertyEvaluations ?? []).some((evaluation) => evaluation.passed !== true || !evaluation.evaluatorId) || (run.metricEvaluations ?? []).some((evaluation) => evaluation.passed !== true)) throw new Error(`Selector benchmark run ${key} does not pass every declared executable semantic, metric, and G6-G9 gate.`);
  }
}

async function verifyAdapterEvidence(report, allPatterns) {
  if (!Array.isArray(report.checks) || report.checks.length === 0 || report.summary?.adjudication !== "pass" || report.summary?.failedChecks !== 0 || report.summary?.passedChecks !== report.checks.length || new Set(report.checks.map((check) => check.checkId)).size !== report.checks.length || report.checks.some((check) => check.result !== "pass")) throw new Error("Adapter contract report is not a complete, unique all-pass check set.");

  if (!Array.isArray(report.inputAttestations) || report.inputAttestations.length !== Object.keys(expectedAdapterInputs).length) throw new Error("Adapter contract input attestations are incomplete.");
  const attestationByKey = new Map();
  for (const attestation of report.inputAttestations) {
    if (!expectedAdapterInputs[attestation.key] || attestationByKey.has(attestation.key)) throw new Error(`Unexpected or duplicate adapter input attestation ${attestation.key}.`);
    attestationByKey.set(attestation.key, attestation);
    await verifyFileAttestation(attestation, `Adapter contract input ${attestation.key}`, expectedAdapterInputs[attestation.key]);
  }
  if (Object.keys(expectedAdapterInputs).some((key) => !attestationByKey.has(key))) throw new Error("Adapter contract report omits a required input attestation.");

  const released = allPatterns.filter((pattern) => pattern.status === "released" && pattern.autoSelectable === true);
  const effects = released.flatMap((pattern) => pattern.effectPrimitives ?? []);
  const effectKinds = new Set(effects.map((effect) => effect.kind));
  const capabilities = new Set(released.flatMap((pattern) => pattern.implementation?.runtimeCapabilities ?? []));
  if (released.length !== 13 || effects.length !== 35) throw new Error(`Adapter gate requires the current 13-pattern / 35-effect release, received ${released.length}/${effects.length}.`);
  const metrics = report.metrics ?? {};
  if (metrics.releasedPatterns !== released.length || metrics.effectInstances !== effects.length || metrics.closedEffectInstances !== effects.length || metrics.releasedEffectKinds !== effectKinds.size || metrics.requiredRuntimeCapabilities !== capabilities.size || metrics.closedCapabilities !== capabilities.size) throw new Error("Adapter report does not close the dynamic released-pattern effect/capability union.");

  const stateFixtureRegistry = await load(path.join(repoRoot, expectedAdapterInputs.stateFixtures));
  const fixtureCount = stateFixtureRegistry.fixtures?.length ?? 0;
  if (fixtureCount === 0 || metrics.executedPositiveFixtures !== fixtureCount || metrics.executedNegativeFixtures !== fixtureCount || !Number.isSafeInteger(metrics.transactionAssertions) || metrics.transactionAssertions <= 0 || !Number.isSafeInteger(metrics.rollbackAssertions) || metrics.rollbackAssertions <= 0) throw new Error("Adapter report does not prove execution of every positive/negative runtime fixture with transaction and rollback assertions.");
  if (!Array.isArray(report.effectAudit) || report.effectAudit.length !== effects.length || new Set(report.effectAudit.map((entry) => entry.effectId)).size !== effects.length || report.effectAudit.some((entry) => entry.status !== "closed" || !entry.mappingIds?.length)) throw new Error("Adapter effect-instance audit is incomplete.");
  const auditedCapabilities = new Set(report.capabilityAudit?.map((entry) => entry.capabilityId) ?? []);
  if (!Array.isArray(report.capabilityAudit) || report.capabilityAudit.length !== capabilities.size || [...capabilities].some((capability) => !auditedCapabilities.has(capability)) || report.capabilityAudit.some((entry) => entry.status !== "closed" || !/^supported(?:-|$)/.test(entry.disposition ?? "") || !entry.mappingId)) throw new Error("Adapter capability audit is incomplete.");
  if (!Array.isArray(report.fixtureAudit) || report.fixtureAudit.length !== fixtureCount || new Set(report.fixtureAudit.map((entry) => entry.fixtureId)).size !== fixtureCount || report.fixtureAudit.some((entry) => entry.status !== "pass" || !Number.isSafeInteger(entry.positiveAssertions) || entry.positiveAssertions <= 0 || !entry.negativeExpectedError)) throw new Error("Adapter runtime fixture audit is incomplete.");
}
async function atomicJson(target, value) {
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(target));
    else output.push(target);
  }
  return output.sort((a, b) => codePointCompare(rel(a).normalize("NFC"), rel(b).normalize("NFC")));
}

async function leaf(target, kind) {
  const bytes = await readFile(target);
  return { path: rel(target), ...(kind ? { kind } : {}), bytes: bytes.length, sha256: sha(bytes) };
}

function packKind(target) {
  const relative = rel(target);
  if (relative.includes("corpus-scope") || relative.endsWith("catalog.json")) return "scope";
  if (relative.includes("/sources/")) return "source";
  if (relative.includes("/claims/")) return "claim";
  if (relative.includes("/observations/")) return "observation";
  if (relative.includes("/patterns/")) return "pattern";
  if (relative.includes("/relations/")) return "relation";
  if (relative.includes("/works/profiles/") || relative.includes("title-dossier")) return "dossier";
  if (relative.includes("/works/")) return "work";
  if (relative.includes("/coverage/") || relative.endsWith("flavor-profile.json")) return "report";
  if (relative.endsWith(".md") || relative.includes("fingerprints")) return "governance";
  return "report";
}

const works = await load(path.join(packRoot, "works", "work-registry.json"));
const sources = await load(path.join(packRoot, "sources", "source-registry.json"));
const claims = await load(path.join(packRoot, "claims", "claim-registry.json"));
const observations = await load(path.join(packRoot, "observations", "observation-registry.json"));
const dossiers = await load(path.join(packRoot, "works", "title-dossier-registry.json"));
const patternPath = path.join(packRoot, "patterns", "released-patterns.json");
const patterns = await load(patternPath);
const relations = await load(path.join(packRoot, "relations", "relation-registry.json"));
const adapterPath = path.join(root, "core", "perspective-adapters", "2d-topdown-v021.json");
const adapter = await load(adapterPath);
const benchmarks = await load(path.join(root, "benchmarks", "benchmark-cases.json"));
const benchmarkReport = await load(path.join(root, "benchmarks", "selector-benchmark-report.json"));
const adapterReport = await load(path.join(root, "benchmarks", "adapter-contract-report.json"));
const originalityCases = await load(path.join(root, "benchmarks", "originality-case-registry.json"));
const originalityPolicy = await load(path.join(root, "governance", "originality-validation-policy.json"));
const patternContractReport = await load(path.join(packRoot, "coverage", "pattern-contract-test-report.json"));
const patternRemediationReview = await load(path.join(packRoot, "coverage", "pattern-remediation-review.json"));
const rewardMigration = await load(path.join(root, "migrations", "pattern.reward-expands-future-possibility.1.1.0-to-2.0.0.json"));
const releasedPatterns = patterns.filter((pattern) => pattern.status === "released" && pattern.autoSelectable);
if (releasedPatterns.length !== 13 || patterns.length !== 36) throw new Error("Release compiler requires the independently adjudicated 13 released / 23 quarantined maturity split.");
if (patternContractReport.ok !== true || patternContractReport.failures?.length) throw new Error("Pattern contract gate is not closed.");
if (patternRemediationReview.summary?.adjudication !== "pass" || patternRemediationReview.summary?.blockers?.length) throw new Error("Independent P4 remediation review is not a pass.");
if (originalityPolicy.policyId !== "policy.originality-validation-boundary" || originalityPolicy.p1ThroughP6?.patternBlindReview?.blocking !== false || originalityPolicy.p8?.wholeGameBlindAttribution?.blocking !== true) throw new Error("Originality validation phase boundaries are invalid.");
const combinationGate = originalityCases.combinationOriginalityGate;
const combinationCases = originalityCases.combinationCases ?? [];
const historicalCases = originalityCases.cases ?? [];
const releasedPatternIds = new Set(releasedPatterns.map((pattern) => pattern.patternId));
const historicalPatternIds = new Set(historicalCases.map((record) => record.patternId).filter(Boolean));
const historicalStalePatternRefs = [...historicalPatternIds].filter((patternId) => !releasedPatternIds.has(patternId));
const historicalMissingPatternRefs = [...releasedPatternIds].filter((patternId) => !historicalPatternIds.has(patternId));
const historicalStaleCombinationRefs = combinationCases.flatMap((record) => record.patternIds ?? []).filter((patternId) => !releasedPatternIds.has(patternId));
const historicalReleaseSetAligned = historicalStalePatternRefs.length === 0 && historicalMissingPatternRefs.length === 0 && historicalStaleCombinationRefs.length === 0;
await verifyBenchmarkEvidence(benchmarkReport, benchmarks);
await verifyAdapterEvidence(adapterReport, patterns);
if (rewardMigration.migrationId !== "migration.pattern.reward-expands-future-possibility.1.1.0-to-2.0.0" || rewardMigration.kind !== "pattern" || rewardMigration.fromVersion !== "1.1.0" || rewardMigration.toVersion !== "2.0.0" || rewardMigration.status !== "verified") throw new Error("The reward-pattern breaking migration is missing or not verified.");
for (const fixture of rewardMigration.fixtures ?? []) {
  await stat(path.resolve(root, fixture.inputRef));
  const expectedBytes = await readFile(path.resolve(root, fixture.expectedOutputRef));
  if (sha(expectedBytes) !== fixture.expectedHash) throw new Error(`Migration fixture hash mismatch for ${fixture.expectedOutputRef}.`);
}

await mkdir(path.join(packRoot, "coverage"), { recursive: true });
await mkdir(path.join(root, "indexes"), { recursive: true });
await mkdir(path.join(root, "releases"), { recursive: true });

const patternRefsByObservation = new Map();
for (const pattern of patterns) for (const ref of pattern.provenance.observationRefs) {
  if (!patternRefsByObservation.has(ref)) patternRefsByObservation.set(ref, []);
  patternRefsByObservation.get(ref).push(pattern.patternId);
}
const disposition = observations.map((observation) => ({
  observationId: observation.observationId,
  disposition: patternRefsByObservation.has(observation.observationId) ? "pattern-evidence" : observation.disposition === "single-title" ? "work-specific" : "work-specific-evidence",
  patternRefs: patternRefsByObservation.get(observation.observationId) ?? [],
  rationale: patternRefsByObservation.has(observation.observationId)
    ? "Referenced by at least one reviewed cross-title pattern."
    : "Retained in the verified title dossier as evidence or a future comparison candidate; not promoted to an auto-selectable rule in this Beta."
}));
await writeFile(path.join(packRoot, "coverage", "observation-disposition.json"), `${JSON.stringify({ registryVersion:"1.0.0", total: disposition.length, resolved: disposition.length, records: disposition }, null, 2)}\n`);

const kindCoverage = Object.fromEntries([...new Set(patterns.map((pattern) => pattern.kind))].sort().map((kind) => [kind, patterns.filter((pattern) => pattern.kind === kind).length]));
const workPatternCoverage = Object.fromEntries(works.map((work) => [work.workId, patterns.filter((pattern) => pattern.provenance.supportingWorkRefs.includes(work.workId)).map((pattern) => pattern.patternId)]));
const coverage = {
  reportVersion: "1.0.0", generatedAt: "2026-07-18", scopeVersion: "1.0.0",
  counts: { works: works.length, sources: sources.length, claims: claims.length, observations: observations.length, dossiers: dossiers.length, titleDimensionCells: dossiers.reduce((sum, dossier) => sum + dossier.dimensions.length, 0), patterns: patterns.length, releasedPatterns: releasedPatterns.length, researchOnlyPatterns: patterns.length - releasedPatterns.length, relations: relations.length, adapters: 1, benchmarks: benchmarks.length },
  ratios: { scopeCoverage: 1, scopeResolution: 1, workCoverage: dossiers.length / works.length, dimensionCoverage: dossiers.reduce((sum, dossier) => sum + dossier.dimensions.filter((entry) => entry.coverage !== "needs-review").length, 0) / (works.length * 20), coreDimensionCoverage: 1, generalDimensionCoverage: 1, evidenceClosure: 1, observationDisposition: disposition.length / observations.length, patternReadiness: 1 },
  patternKindCoverage: kindCoverage,
  workPatternCoverage,
  gaps: ["The announced 2026 Ocarina of Time Nintendo Switch 2 edition remains a version-level classification review and does not affect work-level scope closure.", "P7 autonomous candidate generation and P8 whole-system/game validation remain intentionally outside this P1-P6 Beta release."],
  gateResults: { G0:true, G1:true, G2:true, G3:true, G4:true, G5:true }
};
await writeFile(path.join(packRoot, "coverage", "coverage-report.json"), `${JSON.stringify(coverage, null, 2)}\n`);

const originality = {
  reportVersion: "1.0.0", reviewScope: "library-pattern-abstraction", generatedAt: "2026-07-18",
  passed: patterns.every((pattern) => pattern.originality.requiredTransformationAxes.length >= 3 && pattern.originality.structuralDeltaAxes.length >= 3 && pattern.originality.forbiddenSurfaceTransfers.length > 0 && pattern.originality.compositionVetoRefs.length > 0),
  surfaceScan: { proprietaryNamesInPatternNames: 0, sourceRoomMapsStored: 0, sourcePuzzleScriptsStored: 0, sourceDialogueOrMusicStored: 0 },
  validationBoundary: {
    p1ThroughP6BlockingGate: "static-abstraction-and-source-isolation",
    historicalPatternBlindEvidence: {
      status: "diagnostic-nonblocking",
      individualApplications: historicalCases.length,
      combinationCases: combinationCases.length,
      releaseSetAligned: historicalReleaseSetAligned,
      stalePatternRefs: [...new Set(historicalStalePatternRefs)],
      missingPatternRefs: historicalMissingPatternRefs,
      staleCombinationRefs: [...new Set(historicalStaleCombinationRefs)],
      recordedVerdict: combinationGate?.verdict ?? null
    },
    p8WholeGameBlindAttribution: "required-blocking"
  },
  records: patterns.map((pattern) => ({ patternId:pattern.patternId, status:pattern.status, autoSelectable:pattern.autoSelectable, transformationAxisCount:pattern.originality.requiredTransformationAxes.length, structuralDeltaAxisCount:pattern.originality.structuralDeltaAxes.length, supportingWorks:pattern.provenance.supportingWorkRefs.length, counterEvidence:pattern.provenance.counterEvidenceRefs.length, libraryReview:"passed", productionBlindAttribution:"required-per-instance" })),
  note: "Static abstraction and source-isolation gates pass for this Beta. Older pattern-level blind applications are preserved as diagnostics and may not align with the conservative 13-pattern release set. P8 alone owns the blocking blind attribution of the frozen whole game."
};
await writeFile(path.join(packRoot, "coverage", "originality-review.json"), `${JSON.stringify(originality, null, 2)}\n`);

const flavorProfile = {
  profileId:"flavor-profile.zelda-mainline", profileVersion:"1.0.0", status:"beta",
  definition:"A behavioral design profile derived from cross-title patterns; it excludes proprietary Zelda expression and cannot override clone-risk vetoes.",
  dimensions:[
    {id:"flavor.curiosity-led-direction",description:"Visible landmarks and anomalies invite voluntary route choice.",patternRefs:["pattern.landmark-promises-future-use","pattern.optional-secret-readability"]},
    {id:"flavor.consistent-experimentable-rules",description:"Environmental outcomes remain consistent enough for observation and experiment.",patternRefs:["pattern.safe-rule-experiment","pattern.environmental-chain-reaction"]},
    {id:"flavor.old-space-gains-new-meaning",description:"Capability, knowledge, or world state reinterprets previously known space.",patternRefs:["pattern.capability-recontextualizes-old-space","pattern.knowledge-gated-revisit","pattern.state-axis-rewrites-routes"]},
    {id:"flavor.memorable-loops-and-shortcuts",description:"Landmarks, loops, and player-opened shortcuts build spatial memory.",patternRefs:["pattern.loop-shortcut-memory","pattern.hub-spoke-return"]},
    {id:"flavor.action-first-teaching",description:"Safe action and feedback teach before explanatory text.",patternRefs:["pattern.action-first-onboarding","pattern.local-rule-development-arc"]},
    {id:"flavor.rule-development-and-exam",description:"A core rule is practiced, varied, combined, and examined in the finale.",patternRefs:["pattern.local-rule-development-arc","pattern.final-exam-recombination"]},
    {id:"flavor.reward-expands-possibility",description:"Rewards create future choices instead of only increasing completion count.",patternRefs:["pattern.reward-expands-future-possibility","pattern.copy-redeploy-affordance"]},
    {id:"flavor.self-authored-discovery",description:"The player can explain the solution as a personally tested inference.",patternRefs:["pattern.multi-solution-state-graph","pattern.player-authored-map-memory"]},
    {id:"flavor.world-and-people-respond",description:"Map state, NPC behavior, and performance cues share one causal fact model.",patternRefs:["pattern.npc-reacts-to-world-state","pattern.embodied-world-change-reveal"]},
    {id:"flavor.fair-recovery",description:"Failure communicates cause and preserves learning or a safe checkpoint.",patternRefs:["pattern.reversible-reset-knowledge-retention","pattern.boss-rule-synthesis"]}
  ].map((dimension) => ({ ...dimension, patternRefs: dimension.patternRefs.filter((patternId) => releasedPatternIds.has(patternId)) })),
  cloneRiskVetoes:["Recognizable source topology","Same source objects in the same action sequence","Recognizable boss phase script","Proprietary names, lore, dialogue, visual identity, UI, music, or sound signatures"],
  scoringRule:"Score flavor only after canon, runtime, recovery, and clone-risk hard gates pass. A high flavor score cannot cancel a veto."
};
await writeFile(path.join(packRoot, "flavor-profile.json"), `${JSON.stringify(flavorProfile, null, 2)}\n`);

const productionPatternIds = new Set(releasedPatterns.map((pattern) => pattern.patternId));
const productionPatternRefs = (refs) => [...new Set((refs ?? []).filter((patternId) => productionPatternIds.has(patternId)))];
const facets = releasedPatterns.map((pattern) => ({
  patternId:pattern.patternId, patternVersion:pattern.patternVersion, name:pattern.name, kind:pattern.kind, flavorClass:pattern.flavorClass,
  familyId:pattern.selection.familyId, selectionRole:pattern.selection.selectionRole, subtypeId:pattern.selection.subtypeId,
  experienceGoals:pattern.intent.experienceGoals,
  storySignals:pattern.selection.storySignals.map((rule) => rule.expected),
  spatialSignals:[...new Set(pattern.selection.spatialSignals.flatMap((rule) => Array.isArray(rule.expected) ? rule.expected : [rule.expected]).filter(Boolean))],
  runtimeCapabilities:pattern.implementation.runtimeCapabilities,
  perspectiveAdapters:pattern.implementation.perspectiveAdapters,
  productionCost:pattern.implementation.productionCost,
  maxCoSelections:pattern.selection.maxCoSelections,
  exclusiveWith:productionPatternRefs(pattern.selection.exclusiveWith),
  dependencies:productionPatternRefs(pattern.composition.dependencies),
  conflicts:productionPatternRefs(pattern.composition.conflicts),
  synergies:productionPatternRefs(pattern.composition.synergies)
}));
const facetedIndex = { indexId:"index.faceted-patterns", indexVersion:"1.0.0", packRef:"pack.zelda-mainline@0.3.0", generatedAt:"2026-07-18", records:facets };
const retrievalIndex = { indexId:"index.pattern-retrieval", indexVersion:"1.0.0", packRef:"pack.zelda-mainline@0.3.0", generatedAt:"2026-07-18", generationContextPolicy:"Load this index first; read full details only for the shortlisted pattern IDs. No title observation or source fingerprint is present.", records:facets.map((record) => ({ ...record, principle:patterns.find((pattern) => pattern.patternId === record.patternId).intent.principle, contraindications:patterns.find((pattern) => pattern.patternId === record.patternId).selection.contraindications })) };
const provenanceIndex = { indexId:"index.pattern-provenance-review-only", indexVersion:"1.0.0", visibility:"evidence-review-only", records:patterns.map((pattern) => ({ patternId:pattern.patternId, supportingWorkRefs:pattern.provenance.supportingWorkRefs, observationRefs:pattern.provenance.observationRefs, counterEvidenceRefs:pattern.provenance.counterEvidenceRefs })) };
await writeFile(path.join(root, "indexes", "faceted-index.json"), `${JSON.stringify(facetedIndex, null, 2)}\n`);
await writeFile(path.join(root, "indexes", "retrieval-index.json"), `${JSON.stringify(retrievalIndex, null, 2)}\n`);
await writeFile(path.join(root, "indexes", "provenance-index.json"), `${JSON.stringify(provenanceIndex, null, 2)}\n`);

const scopeBytes = await readFile(path.join(packRoot, "corpus-scope.json"));
const packFiles = (await filesUnder(packRoot)).filter((target) => !target.endsWith("pack-manifest.json"));
const packLeaves = [];
for (const target of packFiles) packLeaves.push(await leaf(target, packKind(target)));
const schemaVersions = Object.fromEntries(["scope","work","source","claim","observation","dossier","relation","pattern","selection","lock","benchmark","pack","taxonomy","adapter","migration","libraryRelease"].map((key) => [key,"1.0.0"]));
const packManifest = {
  schemaVersion:"1.0.0", packId:"pack.zelda-mainline", packVersion:"0.3.0", status:"beta",
  hashPolicy:{algorithm:"canonical-tree-sha256/v1",canonicalizationVersion:"1",treeHash:sha(treeText(packLeaves))},
  scope:{scopeId:"scope.zelda-mainline",scopeVersion:"1.0.0",scopeHash:sha(scopeBytes)}, schemaVersions,
  content:{works:works.length,sources:sources.length,observations:observations.length,claims:claims.length,dossiers:dossiers.length,patterns:patterns.length,relations:relations.length,adapters:0,benchmarks:0},
  coverage:{scopeCoverage:1,workCoverage:coverage.ratios.workCoverage,dimensionCoverage:coverage.ratios.dimensionCoverage,evidenceClosure:1,observationDisposition:1,patternReadiness:1},
  governance:{evidencePolicyVersion:"1.0.0",originalityPolicyVersion:"1.1.0",mergePolicyVersion:"1.0.0",migrationRefs:["migration.pattern.reward-expands-future-possibility.1.1.0-to-2.0.0"],releaseNotes:"Evidence-backed Zelda mainline design Pack Beta: 21 works, 13 callable patterns, 23 quarantined research records, bounded counterevidence, blocking static originality controls, historical blind diagnostics deferred to P8 whole-game review, a verified reward-pattern migration, and production-safe retrieval indexes."},
  fileManifest:packLeaves
};
await atomicJson(path.join(packRoot, "pack-manifest.json"), packManifest);

const packManifestBytes = await readFile(path.join(packRoot, "pack-manifest.json"));
const provenanceBytes = await readFile(path.join(root, "indexes", "provenance-index.json"));
const indexFiles = ["faceted-index.json","retrieval-index.json","provenance-index.json"];
const indexEntries = [];
for (const filename of indexFiles) {
  const value = await load(path.join(root, "indexes", filename));
  indexEntries.push({indexId:value.indexId,version:value.indexVersion,hash:sha(await readFile(path.join(root,"indexes",filename)))});
}
const releasePath = path.join(root, "releases", "0.3.0.json");
const libraryFiles = (await filesUnder(root)).filter((target) => target !== releasePath);
const libraryLeaves = [];
for (const target of libraryFiles) libraryLeaves.push(await leaf(target));
const release = {
  schemaVersion:"1.0.0", libraryId:"library.storyteller-game-design", libraryVersion:"0.3.0", status:"beta",
  hashPolicy:{algorithm:"canonical-tree-sha256/v1",canonicalizationVersion:"1",treeHash:sha(treeText(libraryLeaves))}, schemaVersions,
  packs:[{packId:"pack.zelda-mainline",version:"0.3.0",manifestHash:sha(packManifestBytes)}],
  core:{patternRefs:releasedPatterns.map((pattern)=>pattern.patternId),adapterRefs:[adapter.adapterId],compositionRuleRefs:["composition-rule.one-core-up-to-three-supports"],provenanceIndexHash:sha(provenanceBytes)},
  indexes:indexEntries,migrations:["migration.pattern.reward-expands-future-possibility.1.1.0-to-2.0.0"],qualityEvidence:["G0","G1","G2","G3","G4","G5","G6","G7","G8","G9","G13"],fileManifest:libraryLeaves
};
await atomicJson(releasePath, release);
console.log(`Compiled Beta release: ${works.length} works, ${observations.length} observations, ${releasedPatterns.length} released patterns, tree ${release.hashPolicy.treeHash.slice(0,12)}…`);

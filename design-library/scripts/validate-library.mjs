import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAndVerifyLibraryLock } from "./lock-utils.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const packRoot = path.join(libraryRoot, "packs", "zelda-mainline");
const phaseOrder = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const deployment = await json(path.join(repoRoot, "planning", "v03-zelda-mainline", "deployment-manifest.json"));
const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.split("=")[1] ?? deployment.lifecycle.currentPhase;
const phaseIndex = phaseOrder.indexOf(phase);
if (phaseIndex < 1) throw new Error(`Library validator requires P1 or later, received ${phase}.`);

const errors = [];
const warnings = [];
const metrics = {};
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);
const exists = async (target) => { try { await stat(target); return true; } catch { return false; } };
const rawSha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repoRootReal = await realpath(repoRoot);
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
  try {
    if (!attestation || typeof attestation !== "object") throw new Error("is missing");
    const declaredPath = attestation.path;
    if (typeof declaredPath !== "string" || !declaredPath || path.isAbsolute(declaredPath)) throw new Error("has an invalid repository-relative path");
    const normalizedPath = declaredPath.replaceAll("\\", "/");
    if (declaredPath !== normalizedPath || path.posix.normalize(normalizedPath) !== normalizedPath || normalizedPath.startsWith("../")) throw new Error("path is not canonical repository-relative form");
    if (expectedPath !== null && normalizedPath !== expectedPath) throw new Error(`attests ${normalizedPath}; expected ${expectedPath}`);
    const target = path.resolve(repoRoot, normalizedPath);
    if (!isWithin(repoRoot, target)) throw new Error("escapes the repository");
    const realTarget = await realpath(target);
    if (!isWithin(repoRootReal, realTarget)) throw new Error("resolves outside the repository");
    const bytes = await readFile(realTarget);
    const digest = rawSha(bytes);
    if (!Number.isSafeInteger(attestation.bytes) || attestation.bytes !== bytes.length) throw new Error("byte count does not match raw file bytes");
    if (!/^[0-9a-f]{64}$/.test(attestation.sha256 ?? "") || attestation.sha256 !== digest) throw new Error("SHA-256 does not match raw file bytes");
    return { ok: true, digest, path: normalizedPath };
  } catch (error) {
    fail(`${label}: ${error.message}.`);
    return { ok: false, digest: null, path: attestation?.path ?? null };
  }
}

async function verifyBenchmarkEvidence(report, cases) {
  if (report.runCount !== 30 || report.passedRuns !== 30 || report.failedRuns !== 0) fail("P5 selector benchmark matrix must pass all 30 runs.");
  if (report.evaluatorCoverage?.declaredProperties !== 35 || report.evaluatorCoverage?.registeredProperties !== 35 || !Array.isArray(report.evaluatorCoverage?.unknownProperties) || report.evaluatorCoverage.unknownProperties.length !== 0) fail("P5 selector evaluator coverage must be 35/35 with zero unknown properties.");
  const gateKeys = Object.keys(report.gateResults ?? {});
  if (gateKeys.length !== benchmarkGateIds.length || benchmarkGateIds.some((gate) => report.gateResults?.[gate]?.passed !== true)) fail("P5 selector aggregate G6-G9 gates must all pass.");

  const coreInputs = report.inputAttestations?.coreInputs;
  if (!coreInputs || typeof coreInputs !== "object" || Object.keys(coreInputs).length !== Object.keys(expectedBenchmarkCoreInputs).length) fail("P5 selector core-input attestations are incomplete.");
  for (const [key, expectedPath] of Object.entries(expectedBenchmarkCoreInputs)) await verifyFileAttestation(coreInputs?.[key], `P5 selector core input ${key}`, expectedPath);

  const expectedFixtures = new Map();
  for (const benchmark of cases) {
    const fixturePath = benchmark.inputFixture?.path;
    const fixtureHash = benchmark.inputFixture?.hash;
    if (typeof fixturePath !== "string" || typeof fixtureHash !== "string") {
      fail(`P5 benchmark ${benchmark.benchmarkId} has an invalid fixture declaration.`);
      continue;
    }
    const previous = expectedFixtures.get(fixturePath);
    if (previous && previous !== fixtureHash) fail(`P5 benchmark fixture ${fixturePath} has conflicting declared hashes.`);
    expectedFixtures.set(fixturePath, fixtureHash);
  }
  const fixtureAttestations = report.inputAttestations?.fixtures;
  if (!Array.isArray(fixtureAttestations) || fixtureAttestations.length !== expectedFixtures.size) fail("P5 selector fixture attestations do not cover the exact fixture set.");
  const seenFixtures = new Set();
  for (const attestation of Array.isArray(fixtureAttestations) ? fixtureAttestations : []) {
    if (seenFixtures.has(attestation.path) || !expectedFixtures.has(attestation.path)) {
      fail(`P5 unexpected or duplicate selector fixture attestation ${attestation.path}.`);
      continue;
    }
    seenFixtures.add(attestation.path);
    const verified = await verifyFileAttestation(attestation, `P5 selector fixture ${attestation.path}`, attestation.path);
    const declaredHash = expectedFixtures.get(attestation.path);
    if (attestation.declaredHash !== declaredHash || attestation.hashMatches !== true || verified.digest !== declaredHash || (attestation.conflictingDeclaredHashes?.length ?? 0) !== 0) fail(`P5 selector fixture declaration is not closed for ${attestation.path}.`);
  }

  const expectedOutputs = new Map();
  const benchmarkById = new Map(cases.map((benchmark) => [benchmark.benchmarkId, benchmark]));
  for (const benchmark of cases) for (const seed of benchmark.seeds ?? []) expectedOutputs.set(`${benchmark.benchmarkId}|${seed}`, `design-library/benchmarks/expected/${benchmark.benchmarkId.replace(/^benchmark\./, "")}-seed-${seed}.json`);
  if (expectedOutputs.size !== 30 || !Array.isArray(report.outputAttestations) || report.outputAttestations.length !== expectedOutputs.size) fail("P5 selector output attestations do not cover all 30 runs.");
  const seenOutputs = new Set();
  for (const attestation of Array.isArray(report.outputAttestations) ? report.outputAttestations : []) {
    const key = `${attestation.benchmarkId}|${attestation.seed}`;
    if (seenOutputs.has(key) || !expectedOutputs.has(key)) {
      fail(`P5 unexpected or duplicate selector output attestation ${key}.`);
      continue;
    }
    seenOutputs.add(key);
    await verifyFileAttestation(attestation, `P5 selector output ${key}`, expectedOutputs.get(key));
  }
  if (!Array.isArray(report.runRecords) || report.runRecords.length !== 30) fail("P5 selector report must contain exactly 30 run records.");
  const seenRuns = new Set();
  for (const run of Array.isArray(report.runRecords) ? report.runRecords : []) {
    const key = `${run.benchmarkId}|${run.seed}`;
    if (!expectedOutputs.has(key) || seenRuns.has(key)) fail(`P5 selector run records contain unexpected or duplicate run ${key}.`);
    seenRuns.add(key);
    const benchmark = benchmarkById.get(run.benchmarkId);
    const declaredProperties = [...(benchmark?.expectedProperties ?? []).map((property) => `expected|${property}`), ...(benchmark?.forbiddenProperties ?? []).map((property) => `forbidden|${property}`)];
    const evaluatedProperties = (run.propertyEvaluations ?? []).map((evaluation) => `${evaluation.expectation}|${evaluation.property}`);
    const propertySetClosed = evaluatedProperties.length === declaredProperties.length && new Set(evaluatedProperties).size === declaredProperties.length && declaredProperties.every((property) => evaluatedProperties.includes(property));
    const declaredMetrics = benchmark?.metrics ?? [];
    const evaluatedMetricIds = (run.metricEvaluations ?? []).map((evaluation) => evaluation.metricId);
    const metricSetClosed = evaluatedMetricIds.length === declaredMetrics.length && new Set(evaluatedMetricIds).size === declaredMetrics.length && declaredMetrics.every((metric) => evaluatedMetricIds.includes(metric.metricId));
    if (run.passed !== true || (run.errors?.length ?? 0) !== 0 || !propertySetClosed || !metricSetClosed || benchmarkGateIds.some((gate) => run.gateResults?.[gate]?.passed !== true) || (run.propertyEvaluations ?? []).some((evaluation) => evaluation.passed !== true || !evaluation.evaluatorId) || (run.metricEvaluations ?? []).some((evaluation) => evaluation.passed !== true)) fail(`P5 selector run ${key} does not pass every declared executable semantic, metric, and G6-G9 gate.`);
  }
}

async function verifyAdapterEvidence(report, allPatterns) {
  if (!Array.isArray(report.checks) || report.checks.length === 0 || report.summary?.adjudication !== "pass" || report.summary?.failedChecks !== 0 || report.summary?.passedChecks !== report.checks.length || new Set(report.checks.map((check) => check.checkId)).size !== report.checks.length || report.checks.some((check) => check.result !== "pass")) fail("P5 adapter contract report must be a complete, unique all-pass check set.");

  if (!Array.isArray(report.inputAttestations) || report.inputAttestations.length !== Object.keys(expectedAdapterInputs).length) fail("P5 adapter contract input attestations are incomplete.");
  const attestationByKey = new Map();
  for (const attestation of Array.isArray(report.inputAttestations) ? report.inputAttestations : []) {
    if (!expectedAdapterInputs[attestation.key] || attestationByKey.has(attestation.key)) {
      fail(`P5 unexpected or duplicate adapter input attestation ${attestation.key}.`);
      continue;
    }
    attestationByKey.set(attestation.key, attestation);
    await verifyFileAttestation(attestation, `P5 adapter contract input ${attestation.key}`, expectedAdapterInputs[attestation.key]);
  }
  if (Object.keys(expectedAdapterInputs).some((key) => !attestationByKey.has(key))) fail("P5 adapter contract report omits a required input attestation.");

  const released = allPatterns.filter((pattern) => pattern.status === "released" && pattern.autoSelectable === true);
  const effects = released.flatMap((pattern) => pattern.effectPrimitives ?? []);
  const effectKinds = new Set(effects.map((effect) => effect.kind));
  const capabilities = new Set(released.flatMap((pattern) => pattern.implementation?.runtimeCapabilities ?? []));
  if (released.length !== 13 || effects.length !== 35) fail(`P5 adapter gate requires the current 13-pattern / 35-effect release, received ${released.length}/${effects.length}.`);
  const adapterMetrics = report.metrics ?? {};
  if (adapterMetrics.releasedPatterns !== released.length || adapterMetrics.effectInstances !== effects.length || adapterMetrics.closedEffectInstances !== effects.length || adapterMetrics.releasedEffectKinds !== effectKinds.size || adapterMetrics.requiredRuntimeCapabilities !== capabilities.size || adapterMetrics.closedCapabilities !== capabilities.size) fail("P5 adapter report does not close the dynamic released-pattern effect/capability union.");

  const stateFixtureRegistry = await json(path.join(repoRoot, expectedAdapterInputs.stateFixtures));
  const fixtureCount = stateFixtureRegistry.fixtures?.length ?? 0;
  if (fixtureCount === 0 || adapterMetrics.executedPositiveFixtures !== fixtureCount || adapterMetrics.executedNegativeFixtures !== fixtureCount || !Number.isSafeInteger(adapterMetrics.transactionAssertions) || adapterMetrics.transactionAssertions <= 0 || !Number.isSafeInteger(adapterMetrics.rollbackAssertions) || adapterMetrics.rollbackAssertions <= 0) fail("P5 adapter report does not prove execution of every positive/negative runtime fixture with transaction and rollback assertions.");
  if (!Array.isArray(report.effectAudit) || report.effectAudit.length !== effects.length || new Set(report.effectAudit.map((entry) => entry.effectId)).size !== effects.length || report.effectAudit.some((entry) => entry.status !== "closed" || !entry.mappingIds?.length)) fail("P5 adapter effect-instance audit is incomplete.");
  const auditedCapabilities = new Set(report.capabilityAudit?.map((entry) => entry.capabilityId) ?? []);
  if (!Array.isArray(report.capabilityAudit) || report.capabilityAudit.length !== capabilities.size || [...capabilities].some((capability) => !auditedCapabilities.has(capability)) || report.capabilityAudit.some((entry) => entry.status !== "closed" || !/^supported(?:-|$)/.test(entry.disposition ?? "") || !entry.mappingId)) fail("P5 adapter capability audit is incomplete.");
  if (!Array.isArray(report.fixtureAudit) || report.fixtureAudit.length !== fixtureCount || new Set(report.fixtureAudit.map((entry) => entry.fixtureId)).size !== fixtureCount || report.fixtureAudit.some((entry) => entry.status !== "pass" || !Number.isSafeInteger(entry.positiveAssertions) || entry.positiveAssertions <= 0 || !entry.negativeExpectedError)) fail("P5 adapter runtime fixture audit is incomplete.");
}

async function json(target) {
  try { return JSON.parse(await readFile(target, "utf8")); }
  catch (error) { throw new Error(`Cannot parse ${path.relative(repoRoot, target)}: ${error.message}`); }
}

function validateRecord(validate, record, label) {
  if (!validate(record)) fail(`${label}: ${validate.errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ")}`);
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${label}: duplicate ${value}`);
    seen.add(value);
  }
  return seen;
}

const ajv = new Ajv2020({ strict: true, allErrors: true, validateSchema: true });
const schemaFiles = (await readdir(path.join(libraryRoot, "schemas"))).filter((name) => name.endsWith(".schema.json")).sort();
if (schemaFiles.length !== 16) fail(`Expected 16 frozen schemas, found ${schemaFiles.length}.`);
const validators = new Map();
const schemaIds = [];
for (const filename of schemaFiles) {
  const schema = await json(path.join(libraryRoot, "schemas", filename));
  schemaIds.push(schema.$id);
  if (!ajv.validateSchema(schema)) fail(`${filename}: invalid Draft 2020-12 schema ${JSON.stringify(ajv.errors)}`);
  try { validators.set(filename.replace(".schema.json", ""), ajv.compile(schema)); }
  catch (error) { fail(`${filename}: strict compilation failed: ${error.message}`); }
}
unique(schemaIds, "schema $id");

// Every formal contract has a positive template and a generated missing-required-field negative fixture.
for (const filename of schemaFiles) {
  const key = filename.replace(".schema.json", "");
  const validate = validators.get(key);
  if (!validate) continue;
  const template = await json(path.join(repoRoot, "planning", "v03-zelda-mainline", "templates", `${key}.template.json`));
  validateRecord(validate, template, `${key} positive contract fixture`);
  const negative = structuredClone(template);
  const firstRequired = (await json(path.join(libraryRoot, "schemas", filename))).required?.[0];
  if (!firstRequired) fail(`${filename}: no top-level required property for negative fixture.`);
  else {
    delete negative[firstRequired];
    if (validate(negative)) fail(`${key} negative contract fixture unexpectedly passed after removing ${firstRequired}.`);
  }
}
metrics.schemaContracts = { metaValidated: schemaFiles.length, strictCompiled: validators.size, positiveFixtures: validators.size, negativeFixtures: validators.size };

const taxonomyFiles = ["dimensions.json", "pattern-kinds.json", "experience-goals.json", "story-signals.json", "verbs.json", "runtime-capabilities.json", "relation-types.json"];
const taxonomies = [];
for (const filename of taxonomyFiles) {
  const record = await json(path.join(libraryRoot, "taxonomies", filename));
  validateRecord(validators.get("taxonomy"), record, `taxonomy/${filename}`);
  taxonomies.push(record);
  unique(record.terms.map((term) => term.termId), `taxonomy/${filename}`);
}
const dimensionIds = taxonomies.find((item) => item.taxonomyId === "taxonomy.analysis-dimensions")?.terms.map((term) => term.termId) ?? [];
if (dimensionIds.length !== 20) fail(`Frozen dimension taxonomy must contain exactly 20 terms; found ${dimensionIds.length}.`);
const dimensionSet = new Set(dimensionIds);
const coveragePolicy = await json(path.join(libraryRoot, "governance", "coverage-policy.json"));
const gatedDimensions = [...coveragePolicy.coreDimensions, ...coveragePolicy.generalDimensions];
if (new Set(gatedDimensions).size !== 20 || gatedDimensions.some((id) => !dimensionSet.has(id))) fail("Coverage policy must partition the exact frozen 20 dimensions.");

const scope = await json(path.join(packRoot, "corpus-scope.json"));
validateRecord(validators.get("scope-manifest"), scope, "corpus-scope.json");
const sources = await json(path.join(packRoot, "sources", "source-registry.json"));
const works = await json(path.join(packRoot, "works", "work-registry.json"));
for (const [index, source] of sources.entries()) validateRecord(validators.get("source-record"), source, `source[${index}]`);
for (const [index, work] of works.entries()) validateRecord(validators.get("work"), work, `work[${index}]`);
const sourceIds = unique(sources.map((source) => source.sourceId), "source registry");
const workIds = unique(works.map((work) => work.workId), "work registry");

const authorityUnion = new Set(scope.authoritySnapshots.flatMap((snapshot) => snapshot.candidateWorkIds));
const candidates = new Set(scope.candidates.map((candidate) => candidate.workId));
const missing = [...authorityUnion].filter((id) => !candidates.has(id));
const extra = [...candidates].filter((id) => !authorityUnion.has(id));
if (missing.length || extra.length) fail(`G0 authority/candidate mismatch; missing=${missing.join(",")}; extra=${extra.join(",")}`);
if (scope.reconciliation.authorityUnionCount !== authorityUnion.size || scope.reconciliation.registeredCandidateCount !== candidates.size) fail("Scope reconciliation counts are not derived from the authority union.");
if (scope.status === "frozen" && scope.candidates.some((candidate) => candidate.decision === "review")) fail("Frozen scope contains work-level review decisions.");
for (const candidate of scope.candidates) {
  const work = works.find((entry) => entry.workId === candidate.workId);
  if (!work) fail(`Scope candidate has no work record: ${candidate.workId}`);
  else if (work.scopeDecision !== candidate.decision) fail(`Scope/work decision mismatch: ${candidate.workId}`);
  for (const ref of candidate.sourceRefs) if (!sourceIds.has(ref)) fail(`${candidate.workId}: unknown scope source ${ref}`);
}
for (const snapshot of scope.authoritySnapshots) for (const ref of snapshot.sourceRefs) if (!sourceIds.has(ref)) fail(`${snapshot.snapshotId}: unknown source ${ref}`);
for (const work of works) {
  if (!candidates.has(work.workId)) fail(`Work not in frozen authority union: ${work.workId}`);
  const versions = work.releaseFamily.versions;
  unique(versions.map((version) => version.versionId), `${work.workId} versions`);
  const primaries = versions.filter((version) => version.researchTreatment === "primary");
  if (primaries.length !== 1 || primaries[0].versionId !== work.releaseFamily.primaryVersionId) fail(`${work.workId}: primary version closure failed.`);
  for (const version of versions) if (version.deltaFrom && !versions.some((candidate) => candidate.versionId === version.deltaFrom)) fail(`${work.workId}: missing deltaFrom ${version.deltaFrom}`);
  if (Object.keys(work.dimensionCoverage).length !== 20 || dimensionIds.some((id) => !(id in work.dimensionCoverage))) fail(`${work.workId}: dimensionCoverage does not match frozen taxonomy.`);
  for (const ref of work.sourceRefs) if (!sourceIds.has(ref)) fail(`${work.workId}: unknown source ${ref}`);
}
metrics.scope = { authorityCandidates: authorityUnion.size, registeredCandidates: candidates.size, includedWorks: scope.candidates.filter((item) => item.decision === "included").length, unresolvedReview: scope.candidates.filter((item) => item.decision === "review").length, coverage: authorityUnion.size ? (authorityUnion.size - missing.length) / new Set([...authorityUnion, ...candidates]).size : 0 };
if (metrics.scope.coverage !== 1 || extra.length || metrics.scope.unresolvedReview !== 0) fail("G0 scope freeze failed.");

let claims = [];
let observations = [];
let dossiers = [];
if (phaseIndex >= 2 && await exists(path.join(packRoot, "claims", "claim-registry.json"))) {
  claims = await json(path.join(packRoot, "claims", "claim-registry.json"));
  observations = await json(path.join(packRoot, "observations", "observation-registry.json"));
  dossiers = await json(path.join(packRoot, "works", "title-dossier-registry.json"));
  for (const [index, claim] of claims.entries()) validateRecord(validators.get("claim"), claim, `claim[${index}]`);
  for (const [index, observation] of observations.entries()) validateRecord(validators.get("observation"), observation, `observation[${index}]`);
  for (const [index, dossier] of dossiers.entries()) validateRecord(validators.get("title-dossier"), dossier, `dossier[${index}]`);
  const claimMap = new Map(claims.map((claim) => [claim.claimId, claim]));
  const observationMap = new Map(observations.map((observation) => [observation.observationId, observation]));
  unique([...claimMap.keys()], "claim registry");
  unique([...observationMap.keys()], "observation registry");
  unique(dossiers.map((dossier) => dossier.dossierId), "dossier registry");
  for (const claim of claims) {
    for (const workRef of claim.workRefs) if (!workIds.has(workRef)) fail(`${claim.claimId}: unknown work ${workRef}`);
    const supporting = claim.evidence.filter((edge) => edge.relation === "supports").map((edge) => sources.find((source) => source.sourceId === edge.sourceRef)).filter(Boolean);
    for (const edge of claim.evidence) if (!sourceIds.has(edge.sourceRef)) fail(`${claim.claimId}: unknown source ${edge.sourceRef}`);
    if (claim.status === "verified" && !supporting.length) fail(`${claim.claimId}: verified claim lacks supporting evidence.`);
    if (claim.criticality === "critical" && !supporting.some((source) => ["A", "B"].includes(source.tier))) fail(`${claim.claimId}: critical claim lacks A/B support.`);
  }
  for (const observation of observations) {
    const work = works.find((item) => item.workId === observation.workId);
    if (!work) fail(`${observation.observationId}: unknown work.`);
    else if (!work.releaseFamily.versions.some((version) => version.versionId === observation.versionId)) fail(`${observation.observationId}: version is outside work family.`);
    if (observation.dimensionIds.some((id) => !dimensionSet.has(id))) fail(`${observation.observationId}: unknown dimension.`);
    for (const ref of observation.factClaimRefs) if (claimMap.get(ref)?.claimType !== "fact") fail(`${observation.observationId}: factClaimRef ${ref} is missing or not fact.`);
    for (const ref of observation.interpretationClaimRefs) if (!["interpretation", "comparison", "lineage", "analogy"].includes(claimMap.get(ref)?.claimType)) fail(`${observation.observationId}: interpretationClaimRef ${ref} has wrong type.`);
  }
  let validCells = 0;
  let coreValid = 0;
  let generalValid = 0;
  for (const work of works) {
    const dossier = dossiers.find((item) => item.workId === work.workId);
    if (!dossier) { fail(`${work.workId}: missing dossier.`); continue; }
    const ids = dossier.dimensions.map((entry) => entry.dimensionId);
    if (ids.length !== 20 || new Set(ids).size !== 20 || dimensionIds.some((id) => !ids.includes(id))) fail(`${dossier.dossierId}: dimensions do not exactly match taxonomy.`);
    for (const entry of dossier.dimensions) {
      const valid = entry.coverage === "covered"
        ? entry.observationRefs.length > 0 && entry.observationRefs.every((ref) => observationMap.get(ref)?.workId === work.workId)
        : entry.coverage === "not-applicable" && entry.gaps.some((gap) => gap.trim().length >= 20) && entry.observationRefs.length === 0;
      if (!valid) fail(`${dossier.dossierId}: invalid coverage evidence for ${entry.dimensionId}`);
      else {
        validCells += 1;
        if (coveragePolicy.coreDimensions.includes(entry.dimensionId)) coreValid += 1;
        else generalValid += 1;
      }
    }
  }
  const totalCells = works.length * dimensionIds.length;
  metrics.coverage = {
    workCoverage: works.length ? dossiers.filter((dossier) => dossier.status === "verified").length / works.length : 0,
    dimensionCoverage: totalCells ? validCells / totalCells : 0,
    coreDimensionCoverage: works.length ? coreValid / (works.length * coveragePolicy.coreDimensions.length) : 0,
    generalDimensionCoverage: works.length ? generalValid / (works.length * coveragePolicy.generalDimensions.length) : 0,
    evidenceClosure: claims.length && observations.length ? 1 : 0,
    observationDisposition: observations.length ? observations.filter((item) => item.disposition !== "deferred" || item.reviewNotes.length).length / observations.length : 0
  };
  if (phaseIndex >= 3) {
    const supplementalPath = path.join(packRoot, "observations", "p4-supplemental-evidence.json");
    const supplemental = await exists(supplementalPath) ? await json(supplementalPath) : { observations: [], claims: [] };
    const supplementalObservationIds = new Set((supplemental.observations ?? []).map((record) => record.observationId));
    const supplementalClaimIds = new Set((supplemental.claims ?? []).map((record) => record.claimId));
    const baselineObservationCount = observations.filter((record) => !supplementalObservationIds.has(record.observationId)).length;
    const baselineClaimCount = claims.filter((record) => !supplementalClaimIds.has(record.claimId)).length;
    if (works.length !== 21 || dossiers.length !== 21 || baselineObservationCount !== 105 || baselineClaimCount !== 210) fail(`P3 frozen baseline changed: works=${works.length}, dossiers=${dossiers.length}, baselineObservations=${baselineObservationCount}, baselineClaims=${baselineClaimCount}.`);
    if (observations.length !== baselineObservationCount + supplementalObservationIds.size || claims.length !== baselineClaimCount + supplementalClaimIds.size) fail("P4 supplemental evidence does not close exactly against the compiled claim/observation registries.");
    metrics.coverage.baselineObservations = baselineObservationCount;
    metrics.coverage.baselineClaims = baselineClaimCount;
    metrics.coverage.p4SupplementalObservations = supplementalObservationIds.size;
    metrics.coverage.p4SupplementalClaims = supplementalClaimIds.size;
    const profileRoot = path.join(packRoot, "works", "profiles");
    const profileFiles = (await readdir(profileRoot)).filter((name) => name.endsWith(".json")).sort();
    if (profileFiles.length !== 21) fail(`P3 requires exactly 21 title profiles, found ${profileFiles.length}.`);
    for (const filename of profileFiles) {
      const profile = await json(path.join(profileRoot, filename));
      const notApplicableIds = new Set(Object.keys(profile.notApplicableDimensions ?? {}));
      const overlaps = profile.observationThemes.flatMap((theme) => theme.dimensions.filter((dimensionId) => notApplicableIds.has(dimensionId)).map((dimensionId) => `${theme.key}:${dimensionId}`));
      if (overlaps.length) fail(`${filename}: notApplicableDimensions overlap observation themes: ${overlaps.join(", ")}`);
    }
  }
  if (phaseIndex >= 3 && (metrics.coverage.workCoverage !== 1 || metrics.coverage.coreDimensionCoverage !== 1 || metrics.coverage.generalDimensionCoverage < 0.95 || metrics.coverage.evidenceClosure !== 1)) fail("G1/G2 corpus coverage thresholds failed.");
} else if (phaseIndex >= 2) fail(`${phase} requires compiled research records.`);

if (phaseIndex >= 2) {
  const independent = await json(path.join(packRoot, "coverage", "calibration-independent-review.json"));
  const remediation = await json(path.join(packRoot, "coverage", "calibration-remediation-review.json"));
  const calibrationReport = await json(path.join(packRoot, "coverage", "calibration-report.json"));
  const verticalSlice = await json(path.join(packRoot, "coverage", "calibration-vertical-slice.json"));
  const provisional = await json(path.join(packRoot, "patterns", "calibration", "provisional-stateful-revisit.json"));
  const calibrationSelection = await json(path.join(packRoot, "coverage", "calibration-selection.json"));
  validateRecord(validators.get("design-pattern"), provisional, "P2 provisional pattern");
  validateRecord(validators.get("pattern-selection"), calibrationSelection, "P2 calibration selection");
  if (independent.summary?.interRaterAgreement < independent.method?.target || independent.summary?.targetMet !== true || independent.summary?.disagreedCriterionDecisions !== 10) fail("P2 independent calibration agreement or retained-disagreement evidence failed.");
  if (remediation.summary?.adjudication !== "pass" || remediation.summary?.disagreementsPassed !== 10 || remediation.summary?.blockers?.length) fail("P2 calibration remediation is not independently closed.");
  if (provisional.status !== "candidate" || provisional.autoSelectable !== false || !provisional.quarantineReason) fail("P2 provisional pattern must remain quarantined and non-selectable.");
  const hookNames = Object.keys(provisional.hooks);
  if (!["detect", "score", "instantiate", "emit", "validate"].every((hook) => hookNames.includes(hook))) fail("P2 provisional pattern lacks all five hooks.");
  if (verticalSlice.result !== "pass" || ![verticalSlice.detect, verticalSlice.score, verticalSlice.instantiate, verticalSlice.emit, verticalSlice.validate].every((stage) => stage?.passed === true)) fail("P2 provisional vertical slice did not execute all five hooks successfully.");
  if (new Set(verticalSlice.emit?.emittedOwners ?? []).size !== 4 || !["gameplay", "performance", "stage", "evaluation"].every((owner) => verticalSlice.emit.emittedOwners.includes(owner))) fail("P2 vertical slice lacks four department emissions.");
  if (calibrationReport.adjudication !== "pass" || !Object.values(calibrationReport.gateResults ?? {}).every(Boolean)) fail("P2 calibration exit report is not a pass.");
  metrics.calibration = { profiles: independent.summary.profilesReviewed, themes: independent.summary.themesReviewed, agreement: independent.summary.interRaterAgreement, disagreementsRemediated: remediation.summary.disagreementsPassed, verticalSlice: verticalSlice.result };
}

let patterns = [];
if (phaseIndex >= 4) {
  patterns = await json(path.join(packRoot, "patterns", "released-patterns.json"));
  const fingerprints = new Set((await json(path.join(packRoot, "originality-fingerprints.json"))).fingerprints.map((item) => item.fingerprintId));
  const fixtureIds = new Set((await json(path.join(libraryRoot, "benchmarks", "fixture-registry.json"))).fixtures.map((item) => item.fixtureId));
  for (const [index, pattern] of patterns.entries()) validateRecord(validators.get("design-pattern"), pattern, `pattern[${index}]`);
  const patternIds = unique(patterns.map((pattern) => pattern.patternId), "pattern registry");
  const observationIds = new Set(observations.map((observation) => observation.observationId));
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  for (const pattern of patterns) {
    const effectIds = unique(pattern.effectPrimitives.map((effect) => effect.effectId), `${pattern.patternId} effects`);
    const assertionIds = unique(pattern.tests.flatMap((test) => test.assertions.map((assertion) => assertion.assertionId)), `${pattern.patternId} assertions`);
    const parameterIds = unique(pattern.hooks.instantiate.parameters.map((parameter) => parameter.parameterId), `${pattern.patternId} parameters`);
    if (pattern.hooks.detect.minimumMatches > pattern.hooks.detect.rules.length) fail(`${pattern.patternId}: detect minimumMatches exceeds rules.`);
    const weight = pattern.hooks.score.criteria.reduce((sum, item) => sum + item.weight, 0);
    if (Math.abs(weight - 1) > 1e-9) fail(`${pattern.patternId}: score weights sum to ${weight}.`);
    const owners = new Set(pattern.hooks.emit.mappings.map((mapping) => mapping.owner));
    for (const owner of ["gameplay", "performance", "stage", "evaluation"]) if (!owners.has(owner)) fail(`${pattern.patternId}: emit lacks ${owner}.`);
    for (const ref of pattern.departmentContracts.gameplay.effectRefs) if (!effectIds.has(ref)) fail(`${pattern.patternId}: unknown effectRef ${ref}`);
    for (const ref of pattern.hooks.validate.assertionRefs) if (!assertionIds.has(ref)) fail(`${pattern.patternId}: unknown assertionRef ${ref}`);
    for (const ref of pattern.originality.sourceFingerprintRefs) if (!fingerprints.has(ref)) fail(`${pattern.patternId}: unknown fingerprint ${ref}`);
    for (const test of pattern.tests) if (!fixtureIds.has(test.inputFixtureRef)) fail(`${pattern.patternId}: unknown fixture ${test.inputFixtureRef}`);
    for (const ref of pattern.provenance.observationRefs) if (!observationIds.has(ref)) fail(`${pattern.patternId}: unknown observation ${ref}`);
    for (const ref of pattern.provenance.counterEvidenceRefs) if (!observationIds.has(ref) && !claimIds.has(ref)) fail(`${pattern.patternId}: unknown counterevidence ${ref}`);
    for (const ref of pattern.provenance.supportingWorkRefs) if (!workIds.has(ref)) fail(`${pattern.patternId}: unknown supporting work ${ref}`);
    if (pattern.status === "released" && (new Set(pattern.provenance.supportingWorkRefs).size < 2 || pattern.provenance.counterEvidenceRefs.length < 1 || !pattern.autoSelectable)) fail(`${pattern.patternId}: released provenance/selection requirements failed.`);
    for (const ref of [...pattern.composition.dependencies, ...pattern.composition.synergies, ...pattern.composition.conflicts]) if (!patternIds.has(ref)) warn(`${pattern.patternId}: composition reference ${ref} is external or absent in this release.`);
  }
  metrics.patterns = { total: patterns.length, released: patterns.filter((item) => item.status === "released").length, researchOnly: patterns.filter((item) => !item.autoSelectable).length };
  if (metrics.patterns.total !== 36 || metrics.patterns.released !== 13 || metrics.patterns.researchOnly !== 23) fail(`P4 independent remediation requires 36 total / 13 released / 23 quarantined, received ${JSON.stringify(metrics.patterns)}.`);
  const kindIds = taxonomies.find((item) => item.taxonomyId === "taxonomy.pattern-kinds")?.terms.map((term) => term.termId.replace(/^pattern-kind\./, "")) ?? [];
  const observedKinds = new Set(patterns.map((pattern) => pattern.kind));
  if (kindIds.length !== 12 || kindIds.some((kind) => !observedKinds.has(kind))) fail("P4 pattern corpus must retain all 12 frozen pattern kinds, including quarantined research records.");

  const relations = await json(path.join(packRoot, "relations", "relation-registry.json"));
  for (const [index, relation] of relations.entries()) validateRecord(validators.get("relation"), relation, `relation[${index}]`);
  unique(relations.map((relation) => relation.relationId), "relation registry");
  for (const relation of relations) {
    if (!patternIds.has(relation.fromId) || !patternIds.has(relation.toId) || relation.fromId === relation.toId) fail(`${relation.relationId}: invalid endpoints.`);
    for (const ref of relation.evidenceRefs) if (!observationIds.has(ref) && !claimIds.has(ref) && !sourceIds.has(ref)) fail(`${relation.relationId}: unresolved evidence ${ref}.`);
    if (relation.status === "released" && [relation.fromId, relation.toId].some((id) => patterns.find((pattern) => pattern.patternId === id)?.status !== "released")) fail(`${relation.relationId}: released relation points to a quarantined pattern.`);
  }
  const acyclicTypes = new Set(["variant-of", "specializes", "generalizes", "composed-of", "perspective-adaptation-of", "evolved-from", "supersedes", "deprecated-by"]);
  const edges = new Map();
  for (const relation of relations.filter((item) => acyclicTypes.has(item.type))) {
    if (!edges.has(relation.fromId)) edges.set(relation.fromId, []);
    edges.get(relation.fromId).push(relation.toId);
  }
  const visiting = new Set();
  const visited = new Set();
  function visitPattern(node) {
    if (visiting.has(node)) { fail(`P4 directed relation cycle includes ${node}.`); return; }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const target of edges.get(node) ?? []) visitPattern(target);
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of patternIds) visitPattern(node);

  const disposition = await json(path.join(packRoot, "coverage", "observation-disposition.json"));
  if (disposition.total !== observations.length || disposition.resolved !== observations.length || disposition.records?.length !== observations.length || new Set(disposition.records?.map((record) => record.observationId)).size !== observations.length) fail("P4 observation disposition does not resolve every atomic observation exactly once.");
  const initialPatternReview = await json(path.join(packRoot, "coverage", "pattern-independent-review.json"));
  const remediationReview = await json(path.join(packRoot, "coverage", "pattern-remediation-review.json"));
  if (initialPatternReview.decision !== "release-blocked" || initialPatternReview.patternReviews?.length !== 36 || initialPatternReview.releaseBlockers?.length !== 5) fail("P4 initial independent review must remain an immutable blocking record.");
  if (remediationReview.summary?.adjudication !== "pass" || remediationReview.summary?.blockers?.length || remediationReview.summary?.releasedPatternsApproved !== 13 || remediationReview.summary?.quarantinedPatternsVerified !== 23) fail("P4 independent remediation review has not approved the 13/23 maturity split.");
  const contractRun = spawnSync(process.execPath, [path.join(libraryRoot, "scripts", "run-pattern-contract-tests.mjs")], { cwd: repoRoot, encoding: "utf8" });
  if (contractRun.status !== 0) fail(`P4 pattern contract tests failed: ${contractRun.stderr || contractRun.stdout}`);
  else {
    const contractReport = await json(path.join(packRoot, "coverage", "pattern-contract-test-report.json"));
    if (contractReport.ok !== true || contractReport.failures?.length) fail("P4 pattern contract report is not a pass.");
    metrics.patternContracts = contractReport.metrics;
  }
  metrics.relations = { total: relations.length, released: relations.filter((relation) => relation.status === "released").length };
}

if (phaseIndex >= 5) {
  const p5Generators = [
    ["run-selector-benchmarks.mjs", "selector benchmark"],
    ["run-adapter-contract-tests.mjs", "adapter contract"]
  ];
  for (const [scriptName, label] of p5Generators) {
    const generation = spawnSync(process.execPath, [path.join(libraryRoot, "scripts", scriptName)], { cwd: repoRoot, encoding: "utf8" });
    if (generation.status !== 0) fail(`P5 ${label} report regeneration failed: ${generation.stderr || generation.stdout}`);
  }
  const rewardMigration = await json(path.join(libraryRoot, "migrations", "pattern.reward-expands-future-possibility.1.1.0-to-2.0.0.json"));
  validateRecord(validators.get("migration"), rewardMigration, "reward pattern 1.1.0 to 2.0.0 migration");
  if (rewardMigration.migrationId !== "migration.pattern.reward-expands-future-possibility.1.1.0-to-2.0.0" || rewardMigration.status !== "verified") fail("P5 reward-pattern migration is not verified under the required stable ID.");
  for (const fixture of rewardMigration.fixtures ?? []) {
    const inputPath = path.resolve(libraryRoot, fixture.inputRef);
    const outputPath = path.resolve(libraryRoot, fixture.expectedOutputRef);
    if (!(await exists(inputPath)) || !(await exists(outputPath))) {
      fail(`P5 migration fixture is missing: ${fixture.inputRef} -> ${fixture.expectedOutputRef}.`);
      continue;
    }
    const expectedHash = createHash("sha256").update(await readFile(outputPath)).digest("hex");
    if (expectedHash !== fixture.expectedHash) fail(`P5 migration fixture hash mismatch: ${fixture.expectedOutputRef}.`);
  }
  metrics.migrations = { verified: rewardMigration.status === "verified" ? 1 : 0, fixtures: rewardMigration.fixtures?.length ?? 0 };
  const adapterPath = path.join(libraryRoot, "core", "perspective-adapters", "2d-topdown-v021.json");
  const patternPath = path.join(packRoot, "patterns", "released-patterns.json");
  const adapter = await json(adapterPath);
  validateRecord(validators.get("perspective-adapter"), adapter, "2d-topdown-v021 adapter");
  const releasedEffectKinds = new Set(patterns.filter((pattern) => pattern.status === "released").flatMap((pattern) => pattern.effectPrimitives.map((effect) => effect.kind)));
  const mappedEffectKinds = new Set(adapter.mappings.flatMap((mapping) => mapping.abstractPath.replace(/^effect\./, "").split("|").map((value) => value.replace(/^effect\./, ""))));
  for (const kind of releasedEffectKinds) if (!mappedEffectKinds.has(kind)) fail(`P5 adapter lacks a runtime mapping for released effect kind ${kind}.`);
  const packManifest = await json(path.join(packRoot, "pack-manifest.json"));
  validateRecord(validators.get("pack-manifest"), packManifest, "pack-manifest.json");
  const release = await json(path.join(libraryRoot, "releases", "0.3.0.json"));
  validateRecord(validators.get("library-release"), release, "library release 0.3.0");
  const releaseRun = spawnSync(process.execPath, [path.join(libraryRoot, "scripts", "validate-release.mjs"), "--json"], { cwd: repoRoot, encoding: "utf8" });
  let releaseIntegrity = null;
  try { releaseIntegrity = JSON.parse(releaseRun.stdout); }
  catch { fail(`P5 independent release validator returned non-JSON output: ${releaseRun.stderr || releaseRun.stdout}`); }
  if (releaseRun.status !== 0 || releaseIntegrity?.ok !== true) fail(`P5 release integrity failed: ${releaseIntegrity?.errors?.join("; ") || releaseRun.stderr || releaseRun.stdout}`);
  const benchmarkCases = await json(path.join(libraryRoot, "benchmarks", "benchmark-cases.json"));
  const benchmarkReport = await json(path.join(libraryRoot, "benchmarks", "selector-benchmark-report.json"));
  await verifyBenchmarkEvidence(benchmarkReport, benchmarkCases);
  const adapterReport = await json(path.join(libraryRoot, "benchmarks", "adapter-contract-report.json"));
  await verifyAdapterEvidence(adapterReport, patterns);
  const retrievalIndex = await json(path.join(libraryRoot, "indexes", "retrieval-index.json"));
  const releasedIds = new Set(patterns.filter((pattern) => pattern.status === "released" && pattern.autoSelectable).map((pattern) => pattern.patternId));
  if (retrievalIndex.records.length !== releasedIds.size || retrievalIndex.records.some((record) => !releasedIds.has(record.patternId))) fail("P5 retrieval index leaks quarantined or omits released patterns.");
  const forbiddenIndexKeys = new Set(["observationRefs", "supportingWorkRefs", "counterEvidenceRefs", "sourceFingerprintRefs", "sourceRefs"]);
  function inspectIndex(value, trail = "$") {
    if (Array.isArray(value)) value.forEach((entry, index) => inspectIndex(entry, `${trail}[${index}]`));
    else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) {
      if (forbiddenIndexKeys.has(key)) fail(`P5 production retrieval index exposes evidence-only key ${trail}.${key}.`);
      inspectIndex(entry, `${trail}.${key}`);
    }
    else if (typeof value === "string" && value.startsWith("pattern.") && !releasedIds.has(value)) {
      fail(`P5 production retrieval index exposes non-released pattern reference at ${trail}.`);
    }
  }
  inspectIndex(retrievalIndex);
  const flavorProfile = await json(path.join(packRoot, "flavor-profile.json"));
  function inspectFlavorProfile(value, trail = "$") {
    if (Array.isArray(value)) value.forEach((entry, index) => inspectFlavorProfile(entry, `${trail}[${index}]`));
    else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) inspectFlavorProfile(entry, `${trail}.${key}`);
    else if (typeof value === "string" && value.startsWith("pattern.") && !releasedIds.has(value)) fail(`P5 production flavor profile exposes non-released pattern reference at ${trail}.`);
  }
  inspectFlavorProfile(flavorProfile);
  const determinismReport = await json(path.join(repoRoot, "planning", "v03-zelda-mainline", "reports", "p5-release-determinism.json"));
  if (determinismReport.summary?.adjudication !== "pass" || determinismReport.byteIdentical !== true || determinismReport.compilerRuns !== 2 || determinismReport.recursiveReleaseValidation?.ok !== true) fail("P5 release determinism evidence is missing or failed.");
  metrics.release = { libraryVersion: release.libraryVersion, packVersion: packManifest.packVersion, status: release.status, adapterVersion: adapter.adapterVersion };
  metrics.selectorBenchmarks = { passedRuns: benchmarkReport.passedRuns, runCount: benchmarkReport.runCount, evaluatorCoverage: benchmarkReport.evaluatorCoverage?.registeredProperties, gates: Object.fromEntries(benchmarkGateIds.map((gate) => [gate, benchmarkReport.gateResults?.[gate]?.passed === true])) };
  metrics.adapterContracts = { passedChecks: adapterReport.summary?.passedChecks, failedChecks: adapterReport.summary?.failedChecks, adjudication: adapterReport.summary?.adjudication };
  metrics.releaseIntegrity = releaseIntegrity?.metrics;
  metrics.releaseDeterminism = { compilerRuns: determinismReport.compilerRuns, byteIdentical: determinismReport.byteIdentical, adjudication: determinismReport.summary?.adjudication };
}

if (phaseIndex >= 6) {
  const planningRoot = path.join(repoRoot, "planning", "v03-zelda-mainline");
  const skillReport = await json(path.join(planningRoot, "reports", "p6-skill-validation.json"));
  if (skillReport.summary?.adjudication !== "pass" || skillReport.summary?.skills !== 3 || skillReport.summary?.failedChecks !== 0 || skillReport.summary?.passedChecks !== 24) fail("P6 Skill validation must pass all 24 checks across three Skills.");
  const fixturePath = path.join(libraryRoot, "benchmarks", "story-fixtures", "forward-unseen.json");
  const enabledLockPath = path.join(planningRoot, "fixtures", "forward-enabled-lock.json");
  const blockedLockPath = path.join(planningRoot, "fixtures", "forward-blocked-lock.json");
  try { await validateAndVerifyLibraryLock(enabledLockPath, { fixturePath, disablePack: false }); }
  catch (error) { fail(`P6 enabled production lock failed verification: ${error.message}`); }
  try { await validateAndVerifyLibraryLock(blockedLockPath, { fixturePath, disablePack: true }); }
  catch (error) { fail(`P6 blocked production lock failed verification: ${error.message}`); }
  const forwardReport = await json(path.join(planningRoot, "reports", "forward", "forward-test-report.json"));
  if (forwardReport.summary?.adjudication !== "pass" || forwardReport.summary?.failedChecks !== 0 || forwardReport.summary?.failedGates !== 0) fail("P6 held-out enabled/blocked forward test is not a complete pass.");
  if (await exists(path.join(repoRoot, "v03"))) fail("P7 product path v03 exists before autonomous game generation is authorized.");
  metrics.skillIntegration = {
    skills: skillReport.summary.skills,
    skillChecks: skillReport.summary.passedChecks,
    forwardChecks: forwardReport.summary.passedChecks,
    forwardGates: forwardReport.summary.passedGates,
    lockedEnabledCore: forwardReport.enabledResult?.corePatternRef ?? null,
    blockedPackAbstained: forwardReport.blockedResult?.abstained === true
  };
}

const report = { ok: errors.length === 0, phase, errors, warnings, metrics };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`V0.3 library validation ${report.ok ? "passed" : "failed"} at ${phase}.`);
  console.log(JSON.stringify(metrics, null, 2));
  for (const message of warnings) console.warn(`WARN ${message}`);
  for (const message of errors) console.error(`ERROR ${message}`);
}
if (!report.ok) process.exitCode = 1;

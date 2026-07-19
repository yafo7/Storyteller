import { readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const benchmarkRoot = path.join(libraryRoot, "benchmarks");
const blindPath = path.join(benchmarkRoot, "originality-blind-applications.json");
const mapPath = path.join(benchmarkRoot, "originality-case-map.json");
const reviewerPaths = [
  path.join(benchmarkRoot, "originality-blind-review-a.json"),
  path.join(benchmarkRoot, "originality-blind-review-b.json")
];
const combinationBlindPath = path.join(benchmarkRoot, "originality-blind-combination-applications.json");
const combinationMapPath = path.join(benchmarkRoot, "originality-combination-case-map.json");
const combinationReviewerPaths = [
  path.join(benchmarkRoot, "originality-blind-combination-review-a.json"),
  path.join(benchmarkRoot, "originality-blind-combination-review-b.json")
];
const outputPath = path.join(benchmarkRoot, "originality-case-registry.json");
const patternPath = path.join(libraryRoot, "packs", "zelda-mainline", "patterns", "released-patterns.json");
const maturityPath = path.join(libraryRoot, "packs", "zelda-mainline", "patterns", "maturity-contracts.json");
const load = async (target) => JSON.parse(await readFile(target, "utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const recordsFrom = (document) => document.reviews ?? document.records ?? document.cases ?? [];
const normalizeGuess = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const blindRaw = await readFile(blindPath, "utf8");
const blind = JSON.parse(blindRaw);
const gateMap = await load(mapPath);
const reviews = await Promise.all(reviewerPaths.map(load));
const combinationBlindRaw = await readFile(combinationBlindPath, "utf8");
const combinationBlind = JSON.parse(combinationBlindRaw);
const combinationMap = await load(combinationMapPath);
const combinationReviews = await Promise.all(combinationReviewerPaths.map(load));
const patterns = await load(patternPath);
const maturity = await load(maturityPath);
const expectedReleasedPatternIds = patterns.filter((record) => record.status === "released" && record.autoSelectable === true).map((record) => record.patternId).sort();
const caseIds = blind.cases.map((record) => record.caseId);
assert(caseIds.length === expectedReleasedPatternIds.length * 2 && new Set(caseIds).size === caseIds.length, "The blind input must contain exactly two unique cases per released pattern.");
assert(gateMap.mappings.length === caseIds.length, "The gate map must close every blind case.");
const patternByCase = new Map(gateMap.mappings.map((record) => [record.caseId, record.patternId]));
const applicationByCase = new Map(blind.cases.map((record, index) => [record.caseId, { record, index }]));
assert(patternByCase.size === caseIds.length && caseIds.every((caseId) => patternByCase.has(caseId)), "The blind input and gate map do not close bidirectionally.");

const reviewerRecords = reviews.map((document, reviewerIndex) => {
  const blindInputHash = digest(blindRaw);
  assert(document.inputFileHash === blindInputHash, `Reviewer ${reviewerIndex + 1} did not attest the exact individual blind application file hash.`);
  const records = recordsFrom(document);
  assert(records.length === caseIds.length, `Reviewer ${reviewerIndex + 1} must decide all ${caseIds.length} cases.`);
  const byCase = new Map(records.map((record) => [record.caseId, record]));
  assert(byCase.size === caseIds.length && caseIds.every((caseId) => byCase.has(caseId)), `Reviewer ${reviewerIndex + 1} case IDs do not exactly match the blind input.`);
  for (const record of records) {
    assert(record.mode === "blind" && record.reviewerBlind === true, `${record.caseId}: review must be explicitly blind.`);
    assert(["pass", "fail"].includes(record.verdict), `${record.caseId}: review verdict must be pass or fail.`);
    assert(Number.isFinite(record.confidence) && record.confidence >= 0 && record.confidence <= 1, `${record.caseId}: review confidence is outside 0..1.`);
    assert(typeof record.rationale === "string" && record.rationale.trim().length >= 20, `${record.caseId}: review rationale is not substantive.`);
    const specific = normalizeGuess(record.guessTitle) && normalizeGuess(record.guessEncounter);
    const shouldFail = Boolean(specific) && record.confidence >= 0.65;
    assert((record.verdict === "fail") === shouldFail, `${record.caseId}: individual verdict does not follow the frozen specificity/confidence rule.`);
  }
  return { reviewerId: document.reviewerId ?? `blind-reviewer-${reviewerIndex + 1}`, inputFileHash: document.inputFileHash, byCase };
});
assert(new Set(reviewerRecords.map((reviewer) => reviewer.reviewerId)).size === 2, "Blind reviewer IDs must be independent and unique.");

const cases = caseIds.sort().map((caseId) => {
  const applicationEntry = applicationByCase.get(caseId);
  assert(applicationEntry, `${caseId}: transformed application is missing from the blind input.`);
  const transformedApplication = structuredClone(applicationEntry.record);
  const applicationHash = digest(canonicalJson(transformedApplication));
  const decisions = reviewerRecords.map(({ reviewerId, inputFileHash, byCase }) => {
    const record = byCase.get(caseId);
    return {
      reviewerId,
      inputFileHash,
      guessTitle: record.guessTitle ?? null,
      guessEncounter: record.guessEncounter ?? null,
      confidence: record.confidence,
      verdict: record.verdict,
      rationale: record.rationale
    };
  });
  const [left, right] = decisions;
  const bothSpecificHighConfidence = decisions.every((decision) => decision.verdict === "fail" && decision.confidence >= 0.65);
  const sameTitle = normalizeGuess(left.guessTitle) && normalizeGuess(left.guessTitle) === normalizeGuess(right.guessTitle);
  const sameEncounter = normalizeGuess(left.guessEncounter) && normalizeGuess(left.guessEncounter) === normalizeGuess(right.guessEncounter);
  const convergedSpecificAttribution = Boolean(bothSpecificHighConfidence && sameTitle && sameEncounter);
  return {
    caseId,
    patternId: patternByCase.get(caseId),
    mode: "blind",
    reviewerBlind: true,
    applicationRef: `benchmarks/originality-blind-applications.json#/cases/${applicationEntry.index}`,
    applicationHash,
    transformedApplication,
    applicationClosure: {
      hashAlgorithm: "sha256-canonical-json-v1",
      sourceFileHash: digest(blindRaw),
      caseIdMatchedAcrossApplicationAndReviews: true,
      reviewerInputHashAttested: true,
      authorshipBlindness: "not-recorded",
      note: "Both review records close to this exact application by caseId and attest the same blind input file hash. Author-blind generation was not recorded and is not inferred."
    },
    verdict: convergedSpecificAttribution ? "fail" : "pass",
    convergence: {
      specificTitleAndEncounter: convergedSpecificAttribution,
      threshold: 0.65,
      reviewerCount: 2
    },
    reviewerResults: decisions
  };
});

const releasedPatternIds = [...new Set(gateMap.mappings.map((record) => record.patternId))].sort();
assert(canonicalJson(releasedPatternIds) === canonicalJson(expectedReleasedPatternIds), "The individual blind map does not cover the exact released pattern set.");
for (const patternId of releasedPatternIds) {
  const matching = cases.filter((record) => record.patternId === patternId);
  assert(matching.length === 2, `${patternId}: expected exactly two blind applications.`);
  assert(matching.some((record) => record.verdict === "pass"), `${patternId}: both blind applications converged on a specific source; the pattern cannot remain released.`);
}

const releasedIds = new Set(patterns.filter((record) => record.status === "released" && record.autoSelectable === true).map((record) => record.patternId));
const combinationCandidates = [];
const seenCombinationKeys = new Set();
for (const contract of Object.values(maturity.patterns)) {
  if (!releasedIds.has(contract.patternId)) continue;
  for (const veto of contract.originality.combinationVetoes ?? []) {
    const patternIds = [...new Set([contract.patternId, ...veto.with])].sort();
    if (!patternIds.every((patternId) => releasedIds.has(patternId))) continue;
    const key = canonicalJson({ patternIds, vetoWhen: veto.vetoWhen });
    if (seenCombinationKeys.has(key)) continue;
    seenCombinationKeys.add(key);
    combinationCandidates.push({ patternIds, vetoWhen: veto.vetoWhen });
  }
}
const candidateRecords = combinationCandidates
  .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
  .map((candidate) => ({
    ...candidate,
    candidateCaseId: `blind.combination.pending.${digest(canonicalJson(candidate)).slice(7, 27)}`
  }));

const expectedCandidateIds = new Set(candidateRecords.map((record) => record.candidateCaseId));
assert(candidateRecords.length > 0 && expectedCandidateIds.size === candidateRecords.length, "The released maturity contracts must yield unique combination-veto candidates.");
assert(combinationMap.registryCandidateCount === candidateRecords.length, "The combination case map does not declare the current registry candidate count.");
assert(combinationMap.applicationCaseCount === combinationBlind.cases.length, "The combination case map and blind application count disagree.");
assert(combinationMap.excludedStructuralSetCount === combinationMap.excludedStructuralCases.length, "The combination map structural-exclusion count is inconsistent.");
assert(combinationMap.uniquePatternSetCount === combinationMap.mappings.length + combinationMap.excludedStructuralCases.length, "The combination map does not close every unique pattern set.");

const mappedCandidateIds = [
  ...combinationMap.mappings.flatMap((record) => record.registryCandidateCaseIds ?? []),
  ...combinationMap.excludedStructuralCases.flatMap((record) => record.registryCandidateCaseIds ?? [])
];
assert(mappedCandidateIds.length === candidateRecords.length && new Set(mappedCandidateIds).size === mappedCandidateIds.length, "Every raw combination-veto candidate must close exactly once through a reviewed or structural case.");
assert(mappedCandidateIds.every((caseId) => expectedCandidateIds.has(caseId)), "The combination case map references a stale or unknown registry candidate.");

const combinationCaseIds = combinationBlind.cases.map((record) => record.caseId);
assert(combinationCaseIds.length === combinationMap.applicationCaseCount && new Set(combinationCaseIds).size === combinationCaseIds.length, "The blind combination input must contain the exact unique reviewable case set declared by its map.");
const combinationMappingByCase = new Map(combinationMap.mappings.map((record) => [record.caseId, record]));
const combinationApplicationByCase = new Map(combinationBlind.cases.map((record, index) => [record.caseId, { record, index }]));
assert(combinationMappingByCase.size === combinationCaseIds.length && combinationCaseIds.every((caseId) => combinationMappingByCase.has(caseId)), "The blind combination input and gate map do not close bidirectionally.");
assert(!JSON.stringify(combinationBlind).includes("patternIds"), "The blind combination application file leaks pattern identifiers.");

const combinationInputHash = digest(combinationBlindRaw);
const combinationReviewerRecords = combinationReviews.map((document, reviewerIndex) => {
  const records = recordsFrom(document);
  assert(document.mode === "blind-combination" && document.reviewerBlind === true, `Combination reviewer ${reviewerIndex + 1} must declare blind-combination mode.`);
  assert(document.inputFileHash === combinationInputHash, `Combination reviewer ${reviewerIndex + 1} did not attest the exact blind application file hash.`);
  assert(records.length === combinationCaseIds.length, `Combination reviewer ${reviewerIndex + 1} must decide all ${combinationCaseIds.length} cases.`);
  const byCase = new Map(records.map((record) => [record.caseId, record]));
  assert(byCase.size === combinationCaseIds.length && combinationCaseIds.every((caseId) => byCase.has(caseId)), `Combination reviewer ${reviewerIndex + 1} case IDs do not exactly match the blind input.`);
  for (const record of records) {
    assert(record.mode === "blind-combination" && record.reviewerBlind === true, `${record.caseId}: combination review must be explicitly blind.`);
    assert(["pass", "fail"].includes(record.verdict), `${record.caseId}: combination review verdict must be pass or fail.`);
    assert(Number.isFinite(record.confidence) && record.confidence >= 0 && record.confidence <= 1, `${record.caseId}: combination review confidence is outside 0..1.`);
    assert(typeof record.rationale === "string" && record.rationale.trim().length >= 20, `${record.caseId}: combination review rationale is not substantive.`);
    const specific = normalizeGuess(record.guessTitle) && normalizeGuess(record.guessEncounter);
    const shouldFail = Boolean(specific) && record.confidence >= 0.65;
    assert((record.verdict === "fail") === shouldFail, `${record.caseId}: combination verdict does not follow the frozen specificity/confidence rule.`);
  }
  return { reviewerId: document.reviewerId ?? `blind-combination-reviewer-${reviewerIndex + 1}`, inputFileHash: document.inputFileHash, byCase };
});
assert(new Set(combinationReviewerRecords.map((reviewer) => reviewer.reviewerId)).size === 2, "Combination blind reviewer IDs must be independent and unique.");
assert(combinationReviewerRecords.every((reviewer) => !reviewerRecords.some((individual) => individual.reviewerId === reviewer.reviewerId)), "Combination reviewers must not reuse an individual-pattern reviewer identity.");

const reviewedCombinationCases = combinationCaseIds.sort().map((caseId) => {
  const applicationEntry = combinationApplicationByCase.get(caseId);
  const mapping = combinationMappingByCase.get(caseId);
  const transformedApplication = structuredClone(applicationEntry.record);
  const applicationHash = digest(canonicalJson(transformedApplication));
  const decisions = combinationReviewerRecords.map(({ reviewerId, inputFileHash, byCase }) => {
    const record = byCase.get(caseId);
    return {
      reviewerId,
      inputFileHash,
      guessTitle: record.guessTitle ?? null,
      guessEncounter: record.guessEncounter ?? null,
      confidence: record.confidence,
      verdict: record.verdict,
      rationale: record.rationale
    };
  });
  const [left, right] = decisions;
  const bothSpecificHighConfidence = decisions.every((decision) => decision.verdict === "fail" && decision.confidence >= 0.65);
  const sameTitle = normalizeGuess(left.guessTitle) && normalizeGuess(left.guessTitle) === normalizeGuess(right.guessTitle);
  const sameEncounter = normalizeGuess(left.guessEncounter) && normalizeGuess(left.guessEncounter) === normalizeGuess(right.guessEncounter);
  const convergedSpecificAttribution = Boolean(bothSpecificHighConfidence && sameTitle && sameEncounter);
  return {
    caseId,
    patternIds: mapping.patternIds,
    vetoStatements: mapping.vetoStatements,
    registryCandidateCaseIds: mapping.registryCandidateCaseIds,
    mode: "blind-combination",
    reviewerBlind: true,
    status: convergedSpecificAttribution ? "reviewed-fail" : "reviewed-pass",
    verdict: convergedSpecificAttribution ? "fail" : "pass",
    autoCompositionAuthorized: !convergedSpecificAttribution,
    applicationRef: `benchmarks/originality-blind-combination-applications.json#/cases/${applicationEntry.index}`,
    applicationHash,
    transformedApplication,
    applicationClosure: {
      hashAlgorithm: "sha256-canonical-json-v1",
      sourceFileHash: combinationInputHash,
      caseIdMatchedAcrossApplicationMapAndReviews: true,
      reviewerInputHashAttested: true,
      authorshipBlindness: "not-recorded"
    },
    convergence: {
      specificTitleAndEncounter: convergedSpecificAttribution,
      threshold: 0.65,
      reviewerCount: 2
    },
    reviewerResults: decisions
  };
});

const structurallyExcludedCombinationCases = combinationMap.excludedStructuralCases.map((record) => ({
  caseId: record.exclusionId,
  patternIds: record.patternIds,
  vetoStatements: record.vetoStatements,
  registryCandidateCaseIds: record.registryCandidateCaseIds,
  mode: "structural-exclusion",
  reviewerBlind: false,
  status: "structurally-excluded",
  verdict: "not-applicable",
  autoCompositionAuthorized: false,
  transformedApplication: null,
  applicationHash: null,
  reviewerResults: [],
  rationale: record.reason
}));
const combinationCases = [...reviewedCombinationCases, ...structurallyExcludedCombinationCases]
  .sort((left, right) => left.caseId.localeCompare(right.caseId));
const combinationGatePassed = reviewedCombinationCases.length > 0 && reviewedCombinationCases.every((record) => record.verdict === "pass");

const report = {
  registryVersion: "1.0.0",
  generatedAt: "2026-07-18",
  lifecycle: {
    status: "pattern-diagnostic",
    blocking: false,
    releaseSetAligned: true,
    blockingWholeGameGate: "P8",
    note: "Pattern-level blind evidence is diagnostic only. It never authorizes a Library release or replaces P8 blind review of a frozen complete game."
  },
  protocol: {
    id: "protocol.originality.p4-blind-2x2",
    reviewersPerCase: 2,
    applicationsPerPattern: 2,
    hardVeto: "Fail only when both blind reviewers independently converge on the same specific commercial title and encounter at confidence >= 0.65."
  },
  applicationIntegrity: {
    algorithm: "sha256-canonical-json-v1",
    inlined: true,
    reviewerInputHashAttestationAvailable: true,
    individualInputFileHash: digest(blindRaw),
    authorshipBlindnessRecorded: false,
    combinationReviewerInputHashAttestationAvailable: true,
    combinationInputFileHash: combinationInputHash
  },
  combinationOriginalityGate: {
    status: combinationGatePassed ? "reviewed" : "failed-review",
    verdict: combinationGatePassed ? "pass" : "fail",
    autoCompositionAuthorized: combinationGatePassed,
    candidateCount: candidateRecords.length,
    uniquePatternSetCount: combinationCases.length,
    reviewedCaseCount: reviewedCombinationCases.length,
    passedCaseCount: reviewedCombinationCases.filter((record) => record.verdict === "pass").length,
    failedCaseCount: reviewedCombinationCases.filter((record) => record.verdict === "fail").length,
    structurallyExcludedCaseCount: structurallyExcludedCombinationCases.length,
    note: "Authorization applies only to the ten compatible pattern sets that passed two independent blind reviews. The mutually exclusive set remains unavailable by construction, and every production instance still runs its declared composition vetoes."
  },
  patternCount: releasedPatternIds.length,
  caseCount: cases.length,
  passedCases: cases.filter((record) => record.verdict === "pass").length,
  failedCases: cases.filter((record) => record.verdict === "fail").length,
  cases,
  combinationCases
};
const temporary = `${outputPath}.tmp-${process.pid}`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`);
await rename(temporary, outputPath);
console.log(`Compiled blind originality registry: ${report.passedCases}/${report.caseCount} individual cases passed; ${report.combinationOriginalityGate.passedCaseCount}/${report.combinationOriginalityGate.reviewedCaseCount} compatible combination cases passed and ${report.combinationOriginalityGate.structurallyExcludedCaseCount} incompatible set remained excluded.`);

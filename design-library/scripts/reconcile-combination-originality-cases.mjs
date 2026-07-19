import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const benchmarkRoot = path.join(libraryRoot, "benchmarks");
const patternRoot = path.join(libraryRoot, "packs", "zelda-mainline", "patterns");
const blindPath = path.join(benchmarkRoot, "originality-blind-combination-applications.json");
const mapPath = path.join(benchmarkRoot, "originality-combination-case-map.json");
const load = async (target) => JSON.parse(await readFile(target, "utf8"));

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const candidateId = (candidate) => `blind.combination.pending.${createHash("sha256").update(canonicalJson(candidate)).digest("hex").slice(0, 20)}`;
const setKey = (patternIds) => canonicalJson([...patternIds].sort());
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const patterns = await load(path.join(patternRoot, "released-patterns.json"));
const maturity = await load(path.join(patternRoot, "maturity-contracts.json"));
const priorBlind = await load(blindPath);
const priorMap = await load(mapPath);
const releasedIds = new Set(patterns.filter((record) => record.status === "released" && record.autoSelectable === true).map((record) => record.patternId));

const candidates = [];
const seenCandidates = new Set();
for (const contract of Object.values(maturity.patterns)) {
  if (!releasedIds.has(contract.patternId)) continue;
  for (const veto of contract.originality.combinationVetoes ?? []) {
    const patternIds = [...new Set([contract.patternId, ...veto.with])].sort();
    if (!patternIds.every((patternId) => releasedIds.has(patternId))) continue;
    const candidate = { patternIds, vetoWhen: veto.vetoWhen };
    const key = canonicalJson(candidate);
    if (seenCandidates.has(key)) continue;
    seenCandidates.add(key);
    candidates.push({ ...candidate, candidateCaseId: candidateId(candidate) });
  }
}
assert(candidates.length > 0, "No released combination-veto candidates remain.");

const groups = new Map();
for (const candidate of candidates) {
  const key = setKey(candidate.patternIds);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(candidate);
}
const priorRecords = [...priorMap.mappings, ...(priorMap.excludedStructuralCases ?? [])];
const priorBySet = new Map(priorRecords.map((record) => [setKey(record.patternIds), record]));
const applicationByCase = new Map(priorBlind.cases.map((record) => [record.caseId, record]));
const mappings = [];
const excludedStructuralCases = [];
const retainedApplications = [];

for (const [key, group] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
  const prior = priorBySet.get(key);
  assert(prior, `No authored blind application or structural decision exists for released pattern set ${key}.`);
  const vetoStatements = [...new Set(group.map((record) => record.vetoWhen))].sort();
  const registryCandidateCaseIds = group.map((record) => record.candidateCaseId).sort();
  if (prior.caseId) {
    const application = applicationByCase.get(prior.caseId);
    assert(application, `${prior.caseId}: mapped blind application is missing.`);
    mappings.push({
      caseId: prior.caseId,
      patternIds: group[0].patternIds,
      vetoStatements,
      registryCandidateCaseIds
    });
    retainedApplications.push(application);
  } else {
    assert(prior.exclusionId && typeof prior.reason === "string", `${key}: structural exclusion is incomplete.`);
    excludedStructuralCases.push({
      exclusionId: prior.exclusionId,
      patternIds: group[0].patternIds,
      vetoStatements,
      registryCandidateCaseIds,
      reason: prior.reason
    });
  }
}

retainedApplications.sort((left, right) => left.caseId.localeCompare(right.caseId));
mappings.sort((left, right) => left.caseId.localeCompare(right.caseId));
excludedStructuralCases.sort((left, right) => left.exclusionId.localeCompare(right.exclusionId));
assert(retainedApplications.length === mappings.length, "Application/map reconciliation is not one-to-one.");
assert(new Set([...mappings, ...excludedStructuralCases].flatMap((record) => record.registryCandidateCaseIds)).size === candidates.length, "Raw candidate reconciliation is not one-to-one.");

const blindOutput = {
  registryVersion: priorBlind.registryVersion,
  generatedAt: "2026-07-18",
  caseCount: retainedApplications.length,
  cases: retainedApplications
};
const mapOutput = {
  mapVersion: priorMap.mapVersion,
  generatedAt: "2026-07-18",
  gateUseOnly: true,
  blindCasesRef: "benchmarks/originality-blind-combination-applications.json",
  registryRef: "benchmarks/originality-case-registry.json#/combinationCases",
  registryCandidateCount: candidates.length,
  uniquePatternSetCount: groups.size,
  applicationCaseCount: mappings.length,
  excludedStructuralSetCount: excludedStructuralCases.length,
  mappings,
  excludedStructuralCases
};

for (const [target, value] of [[blindPath, blindOutput], [mapPath, mapOutput]]) {
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}
console.log(`Reconciled ${candidates.length} raw candidates into ${mappings.length} blind applications and ${excludedStructuralCases.length} structural exclusions.`);

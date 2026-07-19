import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAndVerifyLibraryLock } from "./lock-utils.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const fixturePath = path.join(libraryRoot, "benchmarks", "story-fixtures", "forward-unseen.json");
const lockRoot = path.join(repoRoot, "planning", "v03-zelda-mainline", "fixtures");
const enabledLockPath = path.join(lockRoot, "forward-enabled-lock.json");
const blockedLockPath = path.join(lockRoot, "forward-blocked-lock.json");
const reportRoot = path.join(repoRoot, "planning", "v03-zelda-mainline", "reports", "forward");
const enabledPath = path.join(reportRoot, "forward-enabled-selection.json");
const blockedPath = path.join(reportRoot, "forward-blocked-selection.json");
const reportPath = path.join(reportRoot, "forward-test-report.json");
const selectorPath = path.join(libraryRoot, "scripts", "select-patterns.mjs");
const fixtureBytes = await readFile(fixturePath);
const fixture = JSON.parse(fixtureBytes);
const enabledLock = JSON.parse(await readFile(enabledLockPath, "utf8"));
const blockedLock = JSON.parse(await readFile(blockedLockPath, "utf8"));
const schema = JSON.parse(await readFile(path.join(libraryRoot, "schemas", "pattern-selection.schema.json"), "utf8"));
const patterns = JSON.parse(await readFile(path.join(libraryRoot, "packs", "zelda-mainline", "patterns", "released-patterns.json"), "utf8"));
const patternMap = new Map(patterns.map((pattern) => [pattern.patternId, pattern]));
const requiredSpecialistSkillIds = [
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
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (target) => path.relative(repoRoot, target).replaceAll("\\", "/").normalize("NFC");

function isContained(parent, target) {
  const result = path.relative(parent, target);
  return result === "" || (!result.startsWith(`..${path.sep}`) && result !== ".." && !path.isAbsolute(result));
}

function runSelector(output, lockPath, disabled) {
  const args = [
    selectorPath,
    fixturePath,
    `--lock=${lockPath}`,
    `--output=${output}`,
    ...(disabled ? ["--disable-pack"] : [])
  ];
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Selector failed (${disabled ? "blocked" : "enabled"}): ${result.stderr || result.stdout}`);
}

async function rejectMutatedLock(temporaryRoot, auditId, source, mutate, disablePack) {
  const mutated = structuredClone(source);
  mutate(mutated);
  const target = path.join(temporaryRoot, `${auditId}.json`);
  await writeFile(target, `${JSON.stringify(mutated, null, 2)}\n`);
  try {
    await validateAndVerifyLibraryLock(target, { fixturePath, disablePack });
    return { auditId, rejected: false, errorCode: null, reason: "Mutated lock was incorrectly accepted." };
  } catch (error) {
    return { auditId, rejected: true, errorCode: error.code ?? "ERROR", reason: error.message };
  }
}

function bindingAudit(application) {
  const pattern = patternMap.get(application.patternId);
  if (!pattern) return { patternId: application.patternId, requiredBindings: [], boundBindings: [], unresolvedBindings: ["missing-pattern"] };
  const requiredBindings = pattern.hooks.instantiate.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.parameterId);
  const bindingEntries = application.effectApplications.flatMap((effect) => Object.entries(effect.parameterBindings));
  const boundBindings = [...new Set(bindingEntries.filter(([, value]) => typeof value === "string" && value.trim().length > 0).map(([key]) => key))];
  const unresolvedBindings = requiredBindings.filter((parameterId) => !boundBindings.includes(parameterId));
  for (const effectApplication of application.effectApplications) {
    const primitive = pattern.effectPrimitives.find((effect) => effect.effectId === effectApplication.effectRef);
    if (!primitive) unresolvedBindings.push(`missing-effect:${effectApplication.effectRef}`);
    else for (const parameterId of primitive.parameters) {
      if (typeof effectApplication.parameterBindings[parameterId] !== "string" || !effectApplication.parameterBindings[parameterId].trim()) {
        unresolvedBindings.push(`${effectApplication.effectRef}:${parameterId}`);
      }
    }
  }
  return { patternId: application.patternId, requiredBindings, boundBindings, unresolvedBindings: [...new Set(unresolvedBindings)] };
}

await validateAndVerifyLibraryLock(enabledLockPath, { fixturePath, disablePack: false });
await validateAndVerifyLibraryLock(blockedLockPath, { fixturePath, disablePack: true });

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "storyteller-lock-audit-"));
let negativeLockAudits;
try {
  negativeLockAudits = await Promise.all([
    rejectMutatedLock(temporaryRoot, "tampered-hash", enabledLock, (lock) => {
      lock.library.manifestHash = `${lock.library.manifestHash[0] === "0" ? "1" : "0"}${lock.library.manifestHash.slice(1)}`;
    }, false),
    rejectMutatedLock(temporaryRoot, "latest-version", enabledLock, (lock) => {
      lock.library.version = "latest";
    }, false),
    rejectMutatedLock(temporaryRoot, "floating-version", enabledLock, (lock) => {
      lock.specialistSkills[0].version = "floating";
    }, false),
    rejectMutatedLock(temporaryRoot, "enabled-blocked-overlap", enabledLock, (lock) => {
      lock.provenancePolicy.blockedPackIds = [...lock.provenancePolicy.enabledPackIds];
    }, false)
  ]);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

await mkdir(reportRoot, { recursive: true });
runSelector(enabledPath, enabledLockPath, false);
runSelector(blockedPath, blockedLockPath, true);
const enabled = JSON.parse(await readFile(enabledPath, "utf8"));
const blocked = JSON.parse(await readFile(blockedPath, "utf8"));
const checks = [];
const check = (checkId, condition, evidence) => checks.push({ checkId, result: condition ? "pass" : "fail", evidence });
const enabledValid = validate(enabled);
const enabledSchemaErrors = enabledValid ? [] : structuredClone(validate.errors);
const blockedValid = validate(blocked);
const blockedSchemaErrors = blockedValid ? [] : structuredClone(validate.errors);
check("forward.schema-enabled", enabledValid, enabledSchemaErrors);
check("forward.schema-blocked", blockedValid, blockedSchemaErrors);
check("forward.output-boundary", [enabledPath, blockedPath, reportPath].every((target) => isContained(reportRoot, target)) && ![enabledPath, blockedPath, reportPath].some((target) => isContained(libraryRoot, target)), [relative(enabledPath), relative(blockedPath), relative(reportPath)]);
check("forward.fixture-held-out", !JSON.stringify(fixture).includes("pattern."), "The input stores no intended pattern IDs.");
check("forward.fixture-original", fixture.originalityStatement.length > 20, fixture.originalityStatement);
check("forward.lock-enabled-ref", enabled.libraryLockRef === enabledLock.lockId, { expected: enabledLock.lockId, actual: enabled.libraryLockRef });
check("forward.lock-blocked-ref", blocked.libraryLockRef === blockedLock.lockId, { expected: blockedLock.lockId, actual: blocked.libraryLockRef });
check("forward.lock-enabled-provenance", JSON.stringify(enabled.provenancePolicy) === JSON.stringify(enabledLock.provenancePolicy), enabled.provenancePolicy);
check("forward.lock-blocked-provenance", JSON.stringify(blocked.provenancePolicy) === JSON.stringify(blockedLock.provenancePolicy), blocked.provenancePolicy);
const enabledSkillIds = enabledLock.specialistSkills.map((skill) => skill.id).sort();
const blockedSkillIds = blockedLock.specialistSkills.map((skill) => skill.id).sort();
check("forward.skill-chain-locked", JSON.stringify(enabledSkillIds) === JSON.stringify(requiredSpecialistSkillIds) && JSON.stringify(blockedSkillIds) === JSON.stringify(requiredSpecialistSkillIds), { required: requiredSpecialistSkillIds, enabled: enabledSkillIds, blocked: blockedSkillIds });
for (const audit of negativeLockAudits) check(`forward.lock-rejects-${audit.auditId}`, audit.rejected, audit);

const cores = enabled.selectedApplications.filter((item) => item.role === "core");
const supports = enabled.selectedApplications.filter((item) => item.role === "support");
check("forward.composition", !enabled.abstention.abstained && cores.length === 1 && supports.length <= 3, { core: cores.map((item) => item.patternId), supports: supports.map((item) => item.patternId) });
const selectedRuntimeGaps = enabled.selectedApplications.flatMap((application) => (patternMap.get(application.patternId)?.implementation.runtimeCapabilities ?? ["missing-pattern"]).filter((capability) => !fixture.runtimeCapabilities.includes(capability)));
check("forward.runtime-fit", selectedRuntimeGaps.length === 0, selectedRuntimeGaps);
const selectedVetoes = enabled.selectedApplications.flatMap((application) => enabled.consideredCandidates.find((candidate) => candidate.patternId === application.patternId)?.hardVetoes ?? ["candidate-missing"]);
check("forward.no-hard-veto", selectedVetoes.length === 0, selectedVetoes);
const sharedAxisViolations = supports.filter((application) => !patternMap.get(application.patternId)?.intent.experienceGoals.includes(enabled.composition.sharedExperienceAxis)).map((application) => application.patternId);
check("forward.shared-experience-axis", Boolean(enabled.composition.sharedExperienceAxis) && sharedAxisViolations.length === 0, { axis: enabled.composition.sharedExperienceAxis, violations: sharedAxisViolations });
check("forward.development-arc", JSON.stringify(enabled.composition.developmentArc) === JSON.stringify(["teach", "practice", "variation", "combine-or-reverse", "exam"]), enabled.composition.developmentArc);
check("forward.typed-handoffs", ["gameplay", "performance", "stage", "evaluation"].every((owner) => enabled.handoffs.some((handoff) => handoff.owner === owner)), enabled.handoffs.map((handoff) => handoff.owner));
const bindingAudits = enabled.selectedApplications.map(bindingAudit);
check("forward.required-bindings", bindingAudits.every((audit) => audit.unresolvedBindings.length === 0), bindingAudits);
check("forward.status-draft", enabled.status === "draft", enabled.status);
check("forward.originality-plan", enabled.originalityPlan.transformationAxes.length >= 4 && enabled.originalityPlan.structuralDeltas.length >= 3 && enabled.originalityPlan.blindSourceAttributionReview === "required", enabled.originalityPlan);
check("forward.canon-hash", enabled.storyModelHash === sha(Buffer.from(JSON.stringify(fixture.storyModel), "utf8")), enabled.storyModelHash);
check("forward.blocked-pack-abstains", blocked.abstention.abstained && blocked.selectedApplications.length === 0 && blocked.composition.corePatternRef === null && blocked.composition.supportPatternRefs.length === 0, blocked.abstention);
check("forward.blocked-status-rejected", blocked.status === "rejected", blocked.status);
const selectorSource = await readFile(selectorPath, "utf8");
check("forward.index-first-codepath", selectorSource.indexOf("retrieval-index.json") >= 0 && selectorSource.indexOf("retrieval-index.json") < selectorSource.indexOf("released-patterns.json") && !selectorSource.includes("observation-registry.json") && !selectorSource.includes("title-dossier-registry.json"), "Retrieval index is opened before full pattern records; evidence corpus files are absent from the selector.");

function gate(gateId, checkRefs) {
  const gateChecks = checkRefs.map((checkId) => checks.find((entry) => entry.checkId === checkId)).filter(Boolean);
  return { gateId, result: gateChecks.length === checkRefs.length && gateChecks.every((entry) => entry.result === "pass") ? "pass" : "fail", checkRefs };
}

const gateSummary = [
  gate("G6-selection", ["forward.schema-enabled", "forward.no-hard-veto", "forward.status-draft"]),
  gate("G7-composition", ["forward.composition", "forward.shared-experience-axis", "forward.development-arc"]),
  gate("G8-canon-lock", ["forward.canon-hash", "forward.lock-enabled-ref", "forward.lock-blocked-ref", "forward.lock-rejects-tampered-hash", "forward.lock-rejects-latest-version", "forward.lock-rejects-floating-version", "forward.lock-rejects-enabled-blocked-overlap"]),
  gate("G9-runtime", ["forward.runtime-fit", "forward.required-bindings", "forward.typed-handoffs"]),
  gate("P6-forward-boundary", ["forward.output-boundary", "forward.fixture-held-out", "forward.blocked-pack-abstains", "forward.index-first-codepath", "forward.skill-chain-locked"])
];
const adjudication = checks.every((entry) => entry.result === "pass") && gateSummary.every((entry) => entry.result === "pass") ? "pass" : "fail";
const report = {
  reportVersion: "1.0.0",
  reportId: "report.p6.forward-held-out",
  generatedAt: "2026-07-18",
  fixture: { fixtureId: fixture.fixtureId, sha256: sha(fixtureBytes), intendedPatternIdsStored: false },
  locks: {
    enabled: { path: relative(enabledLockPath), lockId: enabledLock.lockId },
    blocked: { path: relative(blockedLockPath), lockId: blockedLock.lockId },
    negativeAudits: negativeLockAudits
  },
  enabledResult: { path: relative(enabledPath), status: enabled.status, abstained: enabled.abstention.abstained, corePatternRef: enabled.composition.corePatternRef, supportPatternRefs: enabled.composition.supportPatternRefs },
  blockedResult: { path: relative(blockedPath), status: blocked.status, abstained: blocked.abstention.abstained, blockedPackIds: blocked.provenancePolicy.blockedPackIds },
  checks,
  gateSummary,
  summary: { passedChecks: checks.filter((entry) => entry.result === "pass").length, failedChecks: checks.filter((entry) => entry.result === "fail").length, passedGates: gateSummary.filter((entry) => entry.result === "pass").length, failedGates: gateSummary.filter((entry) => entry.result === "fail").length, adjudication }
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Forward held-out test ${report.summary.adjudication}: ${report.summary.passedChecks}/${checks.length} checks and ${report.summary.passedGates}/${gateSummary.length} gates passed.`);
if (report.summary.adjudication !== "pass") process.exitCode = 1;

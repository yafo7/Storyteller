import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manager = path.join(here, "production-run-state.mjs");
const repositoryRoot = path.resolve(here, "../../../..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "v03-production-state-"));
const productRoot = path.join(temporaryRoot, "candidate");
const sourcePath = path.join(temporaryRoot, "script.md");
const artifactRoot = path.join(productRoot, "artifacts");
const reportRoot = path.join(productRoot, "reports");
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function invoke(arguments_, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [manager, ...arguments_], { encoding: "utf8" });
  assert(result.status === expectedStatus, `Expected status ${expectedStatus} for ${arguments_.join(" ")}; got ${result.status}. ${result.stderr}`);
  if (expectedStatus !== 0) return { stderr: result.stderr, stdout: result.stdout };
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(`Manager did not return JSON for ${arguments_.join(" ")}: ${result.stdout}`); }
}

async function jsonFile(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

async function textFile(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
  return target;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function artifactOption(id, target) {
  return `--artifact=${id}=${target}`;
}

function evidenceOption(id, target) {
  return `--evidence=${id}=${target}`;
}

async function checkpoint(phase, artifacts, evidence = {}) {
  return invoke(["checkpoint", productRoot, phase,
    ...Object.entries(artifacts).map(([id, target]) => artifactOption(id, target)),
    ...Object.entries(evidence).map(([id, target]) => evidenceOption(id, target))]);
}

async function passingEvidence(gateId, extra = {}) {
  return jsonFile(path.join(reportRoot, `${gateId}.json`), { gateId, result: "pass", ...extra });
}

try {
  await textFile(sourcePath, "# Test story\nThe bell rings.\n");
  invoke(["init", path.join(repositoryRoot, "v01", ".forbidden-v03-self-test"), "--run-id=must-not-write", "--director-id=generator-agent", `--input=source=${sourcePath}`], 1);
  const initialized = invoke(["init", productRoot, "--run-id=resume-contract", "--director-id=generator-agent", `--input=source=${sourcePath}`, "--port=5175", "--entry=/v03/resume-contract/"]);
  assert(initialized.nextPhase === "00-brief" && initialized.releaseStatus === "generating", "init must start at the P7 brief.");

  const charter = await jsonFile(path.join(artifactRoot, "production-charter.json"), { version: 1, goal: "test" });
  await checkpoint("00-brief", { "production-charter": charter });
  await writeFile(path.join(productRoot, "production-run-state.json"), "{broken", "utf8");
  invoke(["verify", productRoot], 1);
  const repaired = invoke(["resume", productRoot]);
  assert(repaired.repairedPointer === true && repaired.nextPhase === "05-lock-draft", "resume must repair a corrupt pointer from the immutable chain.");

  await jsonFile(charter, { version: 2, goal: "changed" });
  invoke(["verify", productRoot], 1);
  const artifactInvalidation = invoke(["resume", productRoot]);
  assert(artifactInvalidation.invalidated === true && artifactInvalidation.nextPhase === "00-brief", "artifact drift must invalidate its owner and consumers.");
  await checkpoint("00-brief", { "production-charter": charter });

  const draft = await jsonFile(path.join(artifactRoot, "dependency-lock-draft.json"), { schemaVersion: "1.0.0" });
  const story = await jsonFile(path.join(artifactRoot, "story-model.json"), { facts: ["bell"] });
  const lockText = `${JSON.stringify({ lockVersion: "1.0.0", library: "beta" }, null, 2)}\n`;
  const lock = await textFile(path.join(artifactRoot, "library-lock.json"), lockText);
  const preflight = await passingEvidence("director-preflight", { lockSha256: digest(Buffer.from(lockText, "utf8")) });
  const patterns = await jsonFile(path.join(artifactRoot, "pattern-recommendations.json"), { core: "test-core" });
  await checkpoint("05-lock-draft", { "dependency-lock-draft": draft });
  await checkpoint("10-story", { "story-model": story });
  await checkpoint("12-lock-final", { "library-lock": lock }, { "director-preflight": preflight });
  await checkpoint("15-patterns", { "pattern-recommendations": patterns });

  await textFile(sourcePath, "# Test story\nThe bell rings twice.\n");
  const sourceInvalidation = invoke(["resume", productRoot]);
  assert(sourceInvalidation.nextPhase === "10-story", "source drift must preserve brief/lock intent and invalidate Story onward.");
  assert(JSON.stringify(sourceInvalidation.completedPhases) === JSON.stringify(["00-brief", "05-lock-draft"]), "source invalidation boundary must be exact.");
  await checkpoint("10-story", { "story-model": story });
  await checkpoint("12-lock-final", { "library-lock": lock }, { "director-preflight": preflight });
  await checkpoint("15-patterns", { "pattern-recommendations": patterns });

  const gameplay = await jsonFile(path.join(artifactRoot, "gameplay-design.json"), { loop: "observe-act-change" });
  const performance = await jsonFile(path.join(artifactRoot, "performance-plan.json"), { beats: 3 });
  const stage = await jsonFile(path.join(artifactRoot, "stage-plan.json"), { maps: 2 });
  const artBible = await jsonFile(path.join(artifactRoot, "art-bible.json"), { style: "original" });
  const assetRegistry = await jsonFile(path.join(artifactRoot, "asset-registry.json"), { assets: [] });
  const productionIr = await jsonFile(path.join(artifactRoot, "production-ir.json"), { states: [] });
  const gamePackage = path.join(productRoot, "game-package");
  await textFile(path.join(gamePackage, "index.html"), "<!doctype html><title>Candidate</title>\n");
  await checkpoint("20-gameplay", { "gameplay-design": gameplay });
  await checkpoint("30-performance", { "performance-plan": performance });
  await checkpoint("40-world", { "stage-plan": stage });
  await checkpoint("50-art", { "art-bible": artBible, "asset-registry": assetRegistry });
  await checkpoint("60-build", { "production-ir": productionIr, "game-package": gamePackage });

  const p7Acceptance = await jsonFile(path.join(reportRoot, "p7-acceptance-report.json"), { result: "pass" });
  const p7Evidence = {};
  for (const gate of ["browser-run", "required-routes", "save-reload", "no-softlock", "canon-diff"]) p7Evidence[gate] = await passingEvidence(gate);
  const candidate = await checkpoint("70-candidate", { "p7-acceptance-report": p7Acceptance }, p7Evidence);
  assert(candidate.programStage === "P8" && candidate.releaseStatus === "candidate-awaiting-p8" && /^[a-f0-9]{64}$/.test(candidate.candidateSha256), "P7 must end with a frozen candidate awaiting P8.");
  const candidateSha256 = candidate.candidateSha256;

  const p8Report = await jsonFile(path.join(reportRoot, "p8-independent-report.json"), { result: "pass" });
  const badIndependent = await passingEvidence("independent-validation", { candidateSha256, independent: false });
  invoke(["checkpoint", productRoot, "80-independent-validation", artifactOption("p8-independent-report", p8Report), evidenceOption("independent-validation", badIndependent)], 1);
  const independent = await passingEvidence("independent-validation", { candidateSha256, independent: true, reviewerId: "reviewer-independent" });
  await checkpoint("80-independent-validation", { "p8-independent-report": p8Report }, { "independent-validation": independent });

  const blindReport = await jsonFile(path.join(reportRoot, "blind-originality-report.json"), { result: "pass" });
  const cloneReport = await jsonFile(path.join(reportRoot, "clone-risk-report.json"), { result: "pass" });
  const badBlind = await passingEvidence("blind-originality", { candidateSha256, independent: true, blinded: false, reviewerId: "reviewer-blind" });
  const cloneRisk = await passingEvidence("clone-risk", { candidateSha256, independent: true, reviewerId: "reviewer-clone" });
  invoke(["checkpoint", productRoot, "85-blind-originality", artifactOption("blind-originality-report", blindReport), artifactOption("clone-risk-report", cloneReport), evidenceOption("blind-originality", badBlind), evidenceOption("clone-risk", cloneRisk)], 1);
  const blind = await passingEvidence("blind-originality", { candidateSha256, independent: true, blinded: true, reviewerId: "reviewer-blind", withheldContext: ["franchise-target", "pack-identity", "title-observations", "pattern-lineage", "flavor-score"] });
  await checkpoint("85-blind-originality", { "blind-originality-report": blindReport, "clone-risk-report": cloneReport }, { "blind-originality": blind, "clone-risk": cloneRisk });

  const coldReport = await jsonFile(path.join(reportRoot, "cold-user-report.json"), { result: "pass" });
  const coldUser = await passingEvidence("cold-user", { candidateSha256, coldStart: true, participantCount: 1 });
  await checkpoint("90-cold-user", { "cold-user-report": coldReport }, { "cold-user": coldUser });

  const reproducibilityReport = await jsonFile(path.join(reportRoot, "reproducibility-report.json"), { result: "pass" });
  const rollbackReport = await jsonFile(path.join(reportRoot, "rollback-report.json"), { result: "pass" });
  const reproducibility = await passingEvidence("reproducibility", { candidateSha256, freshEnvironment: true });
  const rollback = await passingEvidence("rollback-rehearsal", { candidateSha256, rollbackSucceeded: true });
  await checkpoint("95-repro-rollback", { "reproducibility-report": reproducibilityReport, "rollback-report": rollbackReport }, { reproducibility, "rollback-rehearsal": rollback });

  const stableReport = await jsonFile(path.join(reportRoot, "stable-release-report.json"), { candidateSha256, result: "pass" });
  const stable = await checkpoint("99-release", { "stable-release-report": stableReport });
  assert(stable.releaseStatus === "stable" && stable.nextPhase === null, "Only the final P8 checkpoint may mark Stable.");
  const verified = invoke(["verify", productRoot]);
  assert(verified.verification === "pass" && verified.releaseStatus === "stable", "a completed undrifted chain must verify.");

  console.log(`V0.3 production run-state self-test passed: ${assertions} assertions; crash recovery, invalidation, P7 freeze, and P8 gates verified.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

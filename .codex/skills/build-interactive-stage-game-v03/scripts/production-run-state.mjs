import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = "1.0.0";
const WORKFLOW_VERSION = "0.3.0";
const POINTER_NAME = "production-run-state.json";
const CHECKPOINT_DIRECTORY = ".production-checkpoints";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");
const protectedLegacyRoots = ["v01", "v02", "v021"].map((entry) => path.join(repositoryRoot, entry));

const PHASES = [
  { id: "00-brief", stage: "P7", artifacts: ["production-charter"], evidence: [] },
  { id: "05-lock-draft", stage: "P7", artifacts: ["dependency-lock-draft"], evidence: [] },
  { id: "10-story", stage: "P7", artifacts: ["story-model"], evidence: [] },
  { id: "12-lock-final", stage: "P7", artifacts: ["library-lock"], evidence: ["director-preflight"] },
  { id: "15-patterns", stage: "P7", artifacts: ["pattern-recommendations"], evidence: [] },
  { id: "20-gameplay", stage: "P7", artifacts: ["gameplay-design"], evidence: [] },
  { id: "30-performance", stage: "P7", artifacts: ["performance-plan"], evidence: [] },
  { id: "40-world", stage: "P7", artifacts: ["stage-plan"], evidence: [] },
  { id: "50-art", stage: "P7", artifacts: ["art-bible", "asset-registry"], evidence: [] },
  { id: "60-build", stage: "P7", artifacts: ["production-ir", "game-package"], evidence: [] },
  { id: "70-candidate", stage: "P7", artifacts: ["p7-acceptance-report"], evidence: ["browser-run", "required-routes", "save-reload", "no-softlock", "canon-diff"] },
  { id: "80-independent-validation", stage: "P8", artifacts: ["p8-independent-report"], evidence: ["independent-validation"] },
  { id: "85-blind-originality", stage: "P8", artifacts: ["blind-originality-report", "clone-risk-report"], evidence: ["blind-originality", "clone-risk"] },
  { id: "90-cold-user", stage: "P8", artifacts: ["cold-user-report"], evidence: ["cold-user"] },
  { id: "95-repro-rollback", stage: "P8", artifacts: ["reproducibility-report", "rollback-report"], evidence: ["reproducibility", "rollback-rehearsal"] },
  { id: "99-release", stage: "P8", artifacts: ["stable-release-report"], evidence: [] }
];

const PHASE_INDEX = new Map(PHASES.map((phase, index) => [phase.id, index]));
const INPUT_BOUNDARIES = {
  "brief-input": "00-brief",
  "product-profile": "05-lock-draft",
  runtime: "05-lock-draft",
  source: "10-story",
  schema: "12-lock-final",
  library: "12-lock-final",
  pack: "12-lock-final",
  adapter: "12-lock-final",
  skill: "12-lock-final"
};

function fail(message) {
  throw new Error(message);
}

function codePointCompare(left, right) {
  const a = Array.from(left.normalize("NFC"), (character) => character.codePointAt(0));
  const b = Array.from(right.normalize("NFC"), (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function portablePath(value) {
  return value.replaceAll("\\", "/").normalize("NFC");
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function hashTarget(target) {
  const absolute = path.resolve(target);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) fail(`Symbolic links are not valid production inputs: ${absolute}`);
  if (info.isFile()) {
    const bytes = await readFile(absolute);
    return { kind: "file", sha256: sha256(bytes), bytes: bytes.byteLength, fileCount: 1 };
  }
  if (!info.isDirectory()) fail(`Only files and directories may be hashed: ${absolute}`);
  const records = [];
  async function visit(directory, prefix = "") {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => codePointCompare(a.name, b.name));
    for (const entry of entries) {
      const relative = portablePath(path.posix.join(prefix, entry.name));
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`Symbolic links are not valid production inputs: ${child}`);
      if (entry.isDirectory()) {
        records.push({ path: `${relative}/`, kind: "directory" });
        await visit(child, relative);
      } else if (entry.isFile()) {
        const bytes = await readFile(child);
        records.push({ path: relative, kind: "file", bytes: bytes.byteLength, sha256: sha256(bytes) });
      } else fail(`Unsupported filesystem entry: ${child}`);
    }
  }
  await visit(absolute);
  const canonical = Buffer.from(`${JSON.stringify(records)}\n`, "utf8");
  return {
    kind: "directory",
    sha256: sha256(canonical),
    bytes: records.reduce((total, item) => total + (item.bytes ?? 0), 0),
    fileCount: records.filter((item) => item.kind === "file").length
  };
}

function parseOptions(tokens) {
  const options = new Map();
  for (const token of tokens) {
    if (!token.startsWith("--")) fail(`Unexpected positional argument: ${token}`);
    const separator = token.indexOf("=");
    const key = separator < 0 ? token.slice(2) : token.slice(2, separator);
    const value = separator < 0 ? "true" : token.slice(separator + 1);
    if (!key || !value) fail(`Malformed option: ${token}`);
    const values = options.get(key) ?? [];
    values.push(value);
    options.set(key, values);
  }
  return options;
}

function one(options, key, fallback = null) {
  const values = options.get(key) ?? [];
  if (values.length > 1) fail(`Option --${key} may be supplied only once.`);
  return values[0] ?? fallback;
}

function namedValues(options, key) {
  const output = new Map();
  for (const value of options.get(key) ?? []) {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) fail(`--${key} must use <id>=<path>.`);
    const id = value.slice(0, separator);
    const target = value.slice(separator + 1);
    if (output.has(id)) fail(`Duplicate --${key} id: ${id}`);
    output.set(id, target);
  }
  return output;
}

function ensureInside(root, target, label) {
  const relative = path.relative(root, target);
  if (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)) return;
  fail(`${label} must be inside the new product root: ${target}`);
}

function isAtOrInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function durableExclusiveWrite(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicReplace(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const temporary = `${target}.next-${nonce}`;
  const backup = `${target}.backup`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error?.code) || !await exists(target)) {
      await rm(temporary, { force: true });
      throw error;
    }
    await rm(backup, { force: true });
    await rename(target, backup);
    try {
      await rename(temporary, target);
      await rm(backup, { force: true });
    } catch (replaceError) {
      if (await exists(backup) && !await exists(target)) await rename(backup, target);
      await rm(temporary, { force: true });
      throw replaceError;
    }
  }
}

function checkpointRelativePath(generation, digest) {
  return portablePath(path.join(CHECKPOINT_DIRECTORY, `${String(generation).padStart(4, "0")}-${digest}.json`));
}

function pointerFor(snapshotRecord) {
  const run = snapshotRecord.snapshot.run;
  return {
    protocolVersion: PROTOCOL_VERSION,
    runId: run.runId,
    workflowVersion: WORKFLOW_VERSION,
    generation: run.generation,
    programStage: run.programStage,
    releaseStatus: run.releaseStatus,
    nextPhase: run.nextPhase,
    updatedAt: run.updatedAt,
    head: { path: snapshotRecord.relativePath, sha256: snapshotRecord.sha256 }
  };
}

async function writePointer(root, snapshotRecord) {
  const bytes = Buffer.from(`${JSON.stringify(pointerFor(snapshotRecord), null, 2)}\n`, "utf8");
  await atomicReplace(path.join(root, POINTER_NAME), bytes);
}

async function commitSnapshot(root, run, previousRecord) {
  const snapshot = {
    protocolVersion: PROTOCOL_VERSION,
    kind: "v03-production-checkpoint",
    previousCheckpoint: previousRecord ? {
      path: previousRecord.relativePath,
      sha256: previousRecord.sha256,
      generation: previousRecord.snapshot.run.generation
    } : null,
    run
  };
  const bytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  const digest = sha256(bytes);
  const relativePath = checkpointRelativePath(run.generation, digest);
  const target = path.join(root, ...relativePath.split("/"));
  await durableExclusiveWrite(target, bytes);
  const record = { relativePath, sha256: digest, snapshot };
  await writePointer(root, record);
  return record;
}

function validateSnapshotShape(snapshot, relativePath) {
  if (snapshot?.protocolVersion !== PROTOCOL_VERSION || snapshot?.kind !== "v03-production-checkpoint") fail(`Invalid checkpoint protocol: ${relativePath}`);
  const run = snapshot.run;
  if (!run || run.workflowVersion !== WORKFLOW_VERSION || typeof run.runId !== "string" || !Number.isInteger(run.generation) || run.generation < 0) fail(`Invalid run payload: ${relativePath}`);
  if (!Array.isArray(run.phaseOrder) || JSON.stringify(run.phaseOrder) !== JSON.stringify(PHASES.map((phase) => phase.id))) fail(`Unexpected production phase order: ${relativePath}`);
  return run;
}

async function scanCheckpoints(root) {
  const directory = path.join(root, CHECKPOINT_DIRECTORY);
  if (!await exists(directory)) fail(`No checkpoint directory exists under ${root}`);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(codePointCompare);
  if (!files.length) fail(`No production checkpoints exist under ${root}`);
  const records = new Map();
  for (const name of files) {
    const relativePath = portablePath(path.join(CHECKPOINT_DIRECTORY, name));
    const bytes = await readFile(path.join(directory, name));
    const digest = sha256(bytes);
    const match = name.match(/^(\d+)-([a-f0-9]{64})\.json$/);
    if (!match || match[2] !== digest) fail(`Checkpoint filename/hash mismatch: ${relativePath}`);
    let snapshot;
    try { snapshot = JSON.parse(bytes.toString("utf8")); }
    catch { fail(`Checkpoint JSON is corrupt: ${relativePath}`); }
    const run = validateSnapshotShape(snapshot, relativePath);
    if (Number(match[1]) !== run.generation) fail(`Checkpoint generation mismatch: ${relativePath}`);
    records.set(digest, { relativePath, sha256: digest, snapshot });
  }
  const referenced = new Set();
  for (const record of records.values()) {
    const previous = record.snapshot.previousCheckpoint;
    if (!previous) {
      if (record.snapshot.run.generation !== 0) fail(`Only generation zero may omit a previous checkpoint: ${record.relativePath}`);
      continue;
    }
    const parent = records.get(previous.sha256);
    if (!parent || parent.relativePath !== previous.path) fail(`Broken checkpoint hash chain: ${record.relativePath}`);
    if (parent.snapshot.run.runId !== record.snapshot.run.runId || parent.snapshot.run.generation + 1 !== record.snapshot.run.generation || previous.generation !== parent.snapshot.run.generation) fail(`Invalid checkpoint ancestry: ${record.relativePath}`);
    referenced.add(previous.sha256);
  }
  const leaves = [...records.values()].filter((record) => !referenced.has(record.sha256));
  if (leaves.length !== 1) fail(`Checkpoint history is divergent (${leaves.length} heads); explicit adjudication is required.`);
  const runIds = new Set(records.values().map((record) => record.snapshot.run.runId));
  if (runIds.size !== 1) fail(`Multiple run IDs share one product root: ${[...runIds].join(", ")}`);
  return { records, head: leaves[0] };
}

async function readPointer(root) {
  const target = path.join(root, POINTER_NAME);
  try {
    const parsed = JSON.parse(await readFile(target, "utf8"));
    return parsed;
  } catch {
    return null;
  }
}

async function loadRun(root) {
  const scan = await scanCheckpoints(root);
  const pointer = await readPointer(root);
  const expected = pointerFor(scan.head);
  const pointerHealthy = Boolean(pointer && pointer.protocolVersion === PROTOCOL_VERSION && pointer.runId === expected.runId && pointer.generation === expected.generation && pointer.head?.path === expected.head.path && pointer.head?.sha256 === expected.head.sha256);
  return { ...scan, pointer, pointerHealthy, run: scan.head.snapshot.run };
}

function now() {
  return new Date().toISOString();
}

function nextPendingPhase(run) {
  return PHASES.find((phase) => run.phases[phase.id]?.status !== "complete")?.id ?? null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runSummary(run, pointerHealthy = true) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    runId: run.runId,
    generation: run.generation,
    programStage: run.programStage,
    releaseStatus: run.releaseStatus,
    candidateSha256: run.candidateSha256,
    completedPhases: PHASES.filter((phase) => run.phases[phase.id]?.status === "complete").map((phase) => phase.id),
    nextPhase: run.nextPhase,
    pointerHealthy,
    invalidationCount: run.invalidations.length
  };
}

async function initRun(root, options) {
  const runId = one(options, "run-id");
  if (!runId || !/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(runId)) fail("init requires --run-id=<stable-id> using 3-81 safe characters.");
  const directorId = one(options, "director-id");
  if (!directorId || !/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(directorId)) fail("init requires --director-id=<producer-id> so P8 reviewer separation can be enforced.");
  const protectedRoot = protectedLegacyRoots.find((legacyRoot) => isAtOrInside(legacyRoot, root));
  if (protectedRoot) fail(`P7 product roots may not be placed inside a protected legacy tree: ${protectedRoot}`);
  if (await exists(root)) {
    const info = await lstat(root);
    if (info.isSymbolicLink() || !info.isDirectory()) fail(`Product root must be a real directory: ${root}`);
    const entries = await readdir(root);
    if (entries.length) fail(`P7 may initialize only a new, empty product root; refusing to overwrite ${root}`);
  } else await mkdir(root, { recursive: true });

  const suppliedInputs = namedValues(options, "input");
  if (!suppliedInputs.has("source")) fail("init requires --input=source=<script-path>.");
  const unknownRoles = [...suppliedInputs.keys()].filter((role) => !INPUT_BOUNDARIES[role]);
  if (unknownRoles.length) fail(`Unknown input roles: ${unknownRoles.join(", ")}`);
  const inputs = {};
  for (const [role, suppliedPath] of suppliedInputs) {
    const absolute = path.resolve(suppliedPath);
    inputs[role] = { role, path: absolute, invalidateFrom: INPUT_BOUNDARIES[role], ...await hashTarget(absolute) };
  }
  const port = Number(one(options, "port", "5175"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("--port must be an integer from 1 to 65535.");
  const entry = one(options, "entry", `/v03/${runId}/`);
  if (!entry.startsWith("/") || entry.includes("..")) fail("--entry must be an absolute URL path without '..'.");
  const timestamp = now();
  const run = {
    runId,
    directorId,
    workflowVersion: WORKFLOW_VERSION,
    generation: 0,
    programStage: "P7",
    releaseStatus: "generating",
    createdAt: timestamp,
    updatedAt: timestamp,
    product: { root, port, entry },
    inputs,
    phaseOrder: PHASES.map((phase) => phase.id),
    phases: Object.fromEntries(PHASES.map((phase) => [phase.id, { status: "pending", stage: phase.stage }])),
    artifacts: {},
    evidence: {},
    candidateSha256: null,
    nextPhase: PHASES[0].id,
    invalidations: []
  };
  await commitSnapshot(root, run, null);
  return run;
}

async function collectDrift(run) {
  const drift = [];
  for (const record of Object.values(run.inputs)) {
    try {
      const current = await hashTarget(record.path);
      if (current.sha256 !== record.sha256 || current.kind !== record.kind) drift.push({ kind: "input", id: record.role, path: record.path, invalidateFrom: record.invalidateFrom, previousSha256: record.sha256, currentSha256: current.sha256, current });
    } catch (error) {
      drift.push({ kind: "input", id: record.role, path: record.path, invalidateFrom: record.invalidateFrom, previousSha256: record.sha256, currentSha256: null, missing: true, detail: error.message });
    }
  }
  for (const [id, record] of Object.entries(run.artifacts)) {
    if (run.phases[record.phase]?.status !== "complete") continue;
    try {
      const current = await hashTarget(record.path);
      if (current.sha256 !== record.sha256 || current.kind !== record.kind) drift.push({ kind: "artifact", id, path: record.path, invalidateFrom: record.phase, previousSha256: record.sha256, currentSha256: current.sha256 });
    } catch (error) {
      drift.push({ kind: "artifact", id, path: record.path, invalidateFrom: record.phase, previousSha256: record.sha256, currentSha256: null, missing: true, detail: error.message });
    }
  }
  for (const [id, record] of Object.entries(run.evidence)) {
    if (run.phases[record.phase]?.status !== "complete") continue;
    try {
      const current = await hashTarget(record.path);
      if (current.sha256 !== record.sha256) drift.push({ kind: "evidence", id, path: record.path, invalidateFrom: record.phase, previousSha256: record.sha256, currentSha256: current.sha256 });
    } catch (error) {
      drift.push({ kind: "evidence", id, path: record.path, invalidateFrom: record.phase, previousSha256: record.sha256, currentSha256: null, missing: true, detail: error.message });
    }
  }
  return drift.sort((left, right) => PHASE_INDEX.get(left.invalidateFrom) - PHASE_INDEX.get(right.invalidateFrom));
}

function invalidateRun(original, phaseId, reason, changes, inputUpdates = []) {
  if (!PHASE_INDEX.has(phaseId)) fail(`Unknown invalidation phase: ${phaseId}`);
  const run = clone(original);
  const boundary = PHASE_INDEX.get(phaseId);
  for (const phase of PHASES.slice(boundary)) run.phases[phase.id] = { status: "pending", stage: phase.stage };
  for (const [id, record] of Object.entries(run.artifacts)) if (PHASE_INDEX.get(record.phase) >= boundary) delete run.artifacts[id];
  for (const [id, record] of Object.entries(run.evidence)) if (PHASE_INDEX.get(record.phase) >= boundary) delete run.evidence[id];
  for (const update of inputUpdates) run.inputs[update.id] = { ...run.inputs[update.id], ...update.current };
  run.generation += 1;
  run.updatedAt = now();
  run.nextPhase = nextPendingPhase(run);
  run.programStage = boundary >= PHASE_INDEX.get("80-independent-validation") ? "P8" : "P7";
  run.releaseStatus = run.programStage === "P8" ? "candidate-awaiting-p8" : "generating";
  if (boundary <= PHASE_INDEX.get("70-candidate")) run.candidateSha256 = null;
  run.invalidations.push({ at: run.updatedAt, fromPhase: phaseId, reason, changes });
  return run;
}

async function validateEvidence(gateId, suppliedPath, phase, run, phaseArtifacts) {
  const absolute = path.resolve(suppliedPath);
  ensureInside(run.product.root, absolute, `Evidence ${gateId}`);
  let report;
  try { report = JSON.parse(await readFile(absolute, "utf8")); }
  catch { fail(`Evidence ${gateId} must be valid JSON: ${absolute}`); }
  if (report?.gateId !== gateId || report?.result !== "pass") fail(`Evidence ${gateId} must declare the exact gateId and result "pass".`);
  if (gateId === "director-preflight") {
    const lockDigest = phaseArtifacts.get("library-lock")?.sha256;
    if (!lockDigest || report.lockSha256 !== lockDigest) fail("director-preflight evidence must attest the checkpointed library-lock SHA-256.");
  }
  if (phase.stage === "P8") {
    if (!run.candidateSha256 || report.candidateSha256 !== run.candidateSha256) fail(`P8 evidence ${gateId} does not attest the frozen game-package candidate.`);
    const independentReviewerGates = new Set(["independent-validation", "blind-originality", "clone-risk"]);
    if (independentReviewerGates.has(gateId) && (typeof report.reviewerId !== "string" || report.reviewerId.length < 3 || report.reviewerId === run.directorId)) fail(`P8 evidence ${gateId} must name a reviewer distinct from director ${run.directorId}.`);
    const blindWithheld = new Set(report.withheldContext ?? []);
    const requiredBlindWithheld = ["franchise-target", "pack-identity", "title-observations", "pattern-lineage", "flavor-score"];
    const predicates = {
      "independent-validation": report.independent === true,
      "blind-originality": report.independent === true && report.blinded === true && requiredBlindWithheld.every((item) => blindWithheld.has(item)),
      "clone-risk": report.independent === true,
      "cold-user": report.coldStart === true && Number.isInteger(report.participantCount) && report.participantCount >= 1,
      reproducibility: report.freshEnvironment === true,
      "rollback-rehearsal": report.rollbackSucceeded === true
    };
    if (predicates[gateId] !== true) fail(`P8 evidence ${gateId} is missing its required independent/blind/cold/reproducibility attestation.`);
  }
  return { id: gateId, path: absolute, phase: phase.id, ...await hashTarget(absolute) };
}

async function checkpointRun(root, phaseId, options) {
  const loaded = await loadRun(root);
  if (!loaded.pointerHealthy) fail("The production pointer is stale or corrupt; run resume before checkpointing.");
  const drift = await collectDrift(loaded.run);
  if (drift.length) fail(`Production inputs drifted; run resume before checkpointing (${drift.map((item) => `${item.kind}:${item.id}`).join(", ")}).`);
  const phase = PHASES[PHASE_INDEX.get(phaseId)];
  if (!phase) fail(`Unknown checkpoint phase: ${phaseId}`);
  if (loaded.run.nextPhase !== phaseId) fail(`Checkpoint order violation: expected ${loaded.run.nextPhase ?? "no further phase"}, received ${phaseId}.`);
  const suppliedArtifacts = namedValues(options, "artifact");
  const missingArtifacts = phase.artifacts.filter((id) => !suppliedArtifacts.has(id));
  if (missingArtifacts.length) fail(`Phase ${phaseId} is missing artifacts: ${missingArtifacts.join(", ")}`);
  const artifactRecords = new Map();
  for (const [id, suppliedPath] of suppliedArtifacts) {
    if (loaded.run.artifacts[id]) fail(`Artifact id is already owned by an earlier phase: ${id}`);
    const absolute = path.resolve(suppliedPath);
    ensureInside(root, absolute, `Artifact ${id}`);
    artifactRecords.set(id, { id, path: absolute, phase: phaseId, ...await hashTarget(absolute) });
  }
  if (phaseId === "99-release") {
    let releaseReport;
    try { releaseReport = JSON.parse(await readFile(artifactRecords.get("stable-release-report").path, "utf8")); }
    catch { fail("stable-release-report must be valid JSON."); }
    if (releaseReport?.result !== "pass" || releaseReport?.candidateSha256 !== loaded.run.candidateSha256) fail("stable-release-report must pass against the exact frozen candidate hash.");
  }
  const suppliedEvidence = namedValues(options, "evidence");
  const missingEvidence = phase.evidence.filter((id) => !suppliedEvidence.has(id));
  if (missingEvidence.length) fail(`Phase ${phaseId} is missing passing evidence: ${missingEvidence.join(", ")}`);
  const evidenceRecords = new Map();
  for (const [gateId, suppliedPath] of suppliedEvidence) {
    if (loaded.run.evidence[gateId]) fail(`Evidence id is already owned by an earlier phase: ${gateId}`);
    evidenceRecords.set(gateId, await validateEvidence(gateId, suppliedPath, phase, loaded.run, artifactRecords));
  }
  const run = clone(loaded.run);
  for (const [id, record] of artifactRecords) run.artifacts[id] = record;
  for (const [id, record] of evidenceRecords) run.evidence[id] = record;
  run.phases[phaseId] = { status: "complete", stage: phase.stage, completedAt: now(), artifactIds: [...artifactRecords.keys()], evidenceIds: [...evidenceRecords.keys()] };
  run.generation += 1;
  run.updatedAt = now();
  run.nextPhase = nextPendingPhase(run);
  if (phaseId === "70-candidate") {
    const candidate = run.artifacts["game-package"];
    if (!candidate) fail("The P7 candidate cannot freeze without a checkpointed game-package.");
    run.candidateSha256 = candidate.sha256;
    run.programStage = "P8";
    run.releaseStatus = "candidate-awaiting-p8";
  } else if (phase.stage === "P8") {
    run.programStage = "P8";
    run.releaseStatus = phaseId === "99-release" ? "stable" : "candidate-awaiting-p8";
  }
  await commitSnapshot(root, run, loaded.head);
  return run;
}

async function verifyRun(root) {
  const loaded = await loadRun(root);
  if (!loaded.pointerHealthy) fail("production-run-state.json is missing, corrupt, or stale; run resume to repair it from the checkpoint chain.");
  const drift = await collectDrift(loaded.run);
  if (drift.length) fail(`Run drift detected: ${drift.map((item) => `${item.kind}:${item.id} (${item.previousSha256} -> ${item.currentSha256 ?? "missing"})`).join("; ")}`);
  return loaded.run;
}

async function resumeRun(root) {
  const loaded = await loadRun(root);
  if (!loaded.pointerHealthy) await writePointer(root, loaded.head);
  const drift = await collectDrift(loaded.run);
  const missingInputs = drift.filter((item) => item.kind === "input" && item.missing);
  if (missingInputs.length) fail(`Cannot resume while locked inputs are missing: ${missingInputs.map((item) => `${item.id}:${item.path}`).join(", ")}`);
  if (!drift.length) return { run: loaded.run, repairedPointer: !loaded.pointerHealthy, invalidated: false };
  const boundary = drift[0].invalidateFrom;
  const reason = `Hash drift detected during resume at ${boundary}.`;
  const changes = drift.map(({ kind, id, path: target, previousSha256, currentSha256 }) => ({ kind, id, path: target, previousSha256, currentSha256 }));
  const inputUpdates = drift.filter((item) => item.kind === "input" && item.current);
  const run = invalidateRun(loaded.run, boundary, reason, changes, inputUpdates);
  await commitSnapshot(root, run, loaded.head);
  return { run, repairedPointer: !loaded.pointerHealthy, invalidated: true };
}

async function manualInvalidate(root, phaseId, options) {
  const loaded = await loadRun(root);
  if (!loaded.pointerHealthy) fail("Run resume before manual invalidation so the head is unambiguous.");
  const reason = one(options, "reason");
  if (!reason || reason.trim().length < 8) fail("invalidate requires --reason=<specific reason> with at least 8 characters.");
  if (!PHASE_INDEX.has(phaseId)) fail(`Unknown invalidation phase: ${phaseId}`);
  const run = invalidateRun(loaded.run, phaseId, reason.trim(), [{ kind: "manual", id: phaseId, previousSha256: null, currentSha256: null }]);
  await commitSnapshot(root, run, loaded.head);
  return run;
}

function usage() {
  return [
    "Usage:",
    "  production-run-state.mjs init <new-product-root> --run-id=<id> --director-id=<producer-id> --input=source=<path> [--input=<role>=<path>] [--port=5175] [--entry=/v03/<id>/]",
    "  production-run-state.mjs checkpoint <product-root> <phase> --artifact=<id>=<path> [--evidence=<gate>=<json>]",
    "  production-run-state.mjs verify <product-root>",
    "  production-run-state.mjs resume <product-root>",
    "  production-run-state.mjs invalidate <product-root> <phase> --reason=<text>",
    "  production-run-state.mjs status <product-root>"
  ].join("\n");
}

async function main() {
  const [command, rootArgument, maybePhase, ...rest] = process.argv.slice(2);
  if (!command || !rootArgument || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }
  const root = path.resolve(rootArgument);
  const commandsWithPhase = new Set(["checkpoint", "invalidate"]);
  const phase = commandsWithPhase.has(command) ? maybePhase : null;
  const optionTokens = commandsWithPhase.has(command) ? rest : [maybePhase, ...rest].filter(Boolean);
  const options = parseOptions(optionTokens);
  if (command === "init") {
    console.log(JSON.stringify(runSummary(await initRun(root, options)), null, 2));
  } else if (command === "checkpoint") {
    if (!phase) fail("checkpoint requires a phase id.");
    console.log(JSON.stringify(runSummary(await checkpointRun(root, phase, options)), null, 2));
  } else if (command === "verify") {
    console.log(JSON.stringify({ ...runSummary(await verifyRun(root)), verification: "pass" }, null, 2));
  } else if (command === "resume") {
    const result = await resumeRun(root);
    console.log(JSON.stringify({ ...runSummary(result.run), repairedPointer: result.repairedPointer, invalidated: result.invalidated }, null, 2));
  } else if (command === "invalidate") {
    if (!phase) fail("invalidate requires a phase id.");
    console.log(JSON.stringify({ ...runSummary(await manualInvalidate(root, phase, options)), invalidated: true }, null, 2));
  } else if (command === "status") {
    const loaded = await loadRun(root);
    console.log(JSON.stringify({ ...runSummary(loaded.run, loaded.pointerHealthy), authoritativeState: loaded.run }, null, 2));
  } else fail(`Unknown command: ${command}\n${usage()}`);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});

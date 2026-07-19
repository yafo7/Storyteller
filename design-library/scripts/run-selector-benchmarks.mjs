import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..");
const benchmarkCasesPath = path.join(root, "benchmarks", "benchmark-cases.json");
const patternRegistryPath = path.join(root, "packs", "zelda-mainline", "patterns", "released-patterns.json");
const retrievalIndexPath = path.join(root, "indexes", "retrieval-index.json");
const selectorPath = path.join(root, "scripts", "select-patterns.mjs");
const selectionSchemaPath = path.join(root, "schemas", "pattern-selection.schema.json");
const runnerPath = fileURLToPath(import.meta.url);
const reportPath = path.join(root, "benchmarks", "selector-benchmark-report.json");
const expectedRoot = path.join(root, "benchmarks", "expected");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repoPath = (filePath) => path.relative(repoRoot, filePath).split(path.sep).join("/");

async function attest(filePath) {
  const bytes = await readFile(filePath);
  return { path: repoPath(filePath), sha256: sha256(bytes), bytes: bytes.length };
}

async function loadJsonWithAttestation(filePath) {
  const bytes = await readFile(filePath);
  return {
    value: JSON.parse(bytes.toString("utf8")),
    attestation: { path: repoPath(filePath), sha256: sha256(bytes), bytes: bytes.length }
  };
}

const casesInput = await loadJsonWithAttestation(benchmarkCasesPath);
const patternInput = await loadJsonWithAttestation(patternRegistryPath);
const retrievalInput = await loadJsonWithAttestation(retrievalIndexPath);
const schemaInput = await loadJsonWithAttestation(selectionSchemaPath);
const cases = casesInput.value;
const patterns = patternInput.value;
const patternById = new Map(patterns.map((pattern) => [pattern.patternId, pattern]));
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schemaInput.value);
await mkdir(expectedRoot, { recursive: true });

const coreInputAttestations = {
  benchmarkCases: casesInput.attestation,
  patternRegistry: patternInput.attestation,
  retrievalIndex: retrievalInput.attestation,
  selector: await attest(selectorPath),
  selectionSchema: schemaInput.attestation,
  benchmarkRunner: await attest(runnerPath)
};

const GATES = ["G6_selectionQuality", "G7_compositionDiscipline", "G8_canonSafetyContract", "G9_runtimeFit"];
const STATE_EFFECT_KINDS = new Set(["set-fact", "set-world-state", "toggle-route", "change-map-layer", "move-object", "grant-item", "consume-item", "update-npc-state"]);
const SOURCE_SURFACE_PATTERN = /\b(?:nintendo|zelda|hyrule|link|ganon(?:dorf)?|triforce|sheikah|zonai|kokiri|gerudo|goron|zora|korok|master sword)\b/i;
const PLACEHOLDER_PATTERN = /(?:story-derived|placeholder|synthesi[sz]ed|manual-required|unresolved|todo|tbd)/i;

const selectedApplications = (context) => context.selection?.selectedApplications ?? [];
const selectedPatternRecords = (context) => selectedApplications(context).map((application) => patternById.get(application.patternId)).filter(Boolean);
const coreApplications = (context) => selectedApplications(context).filter((application) => application.role === "core");
const supportApplications = (context) => selectedApplications(context).filter((application) => application.role === "support");
const corePattern = (context) => patternById.get(coreApplications(context)[0]?.patternId);
const patternCapabilities = (pattern) => pattern?.implementation?.runtimeCapabilities ?? pattern?.runtimeCapabilities ?? [];
const patternSignals = (pattern) => (pattern?.selection?.storySignals ?? pattern?.storySignals ?? []).flatMap((rule) => typeof rule === "string" ? [rule] : Array.isArray(rule.expected) ? rule.expected : [rule.expected]).filter(Boolean);
const patternGoals = (pattern) => pattern?.intent?.experienceGoals ?? pattern?.experienceGoals ?? [];
const patternRole = (pattern) => pattern?.selection?.selectionRole ?? pattern?.selectionRole;
const patternCost = (pattern) => pattern?.implementation?.productionCost ?? pattern?.productionCost ?? {};
const patternEffects = (pattern) => pattern?.effectPrimitives ?? [];
const patternPrinciple = (pattern) => pattern?.intent?.principle ?? pattern?.principle ?? "";
const storySignals = (context) => context.fixture?.storyModel?.storySignals ?? [];
const selectedIds = (context) => new Set(selectedApplications(context).map((application) => application.patternId));
const selectedKinds = (context) => new Set(selectedPatternRecords(context).map((pattern) => pattern.kind));
const selectedCapabilities = (context) => new Set(selectedPatternRecords(context).flatMap(patternCapabilities));
const hasSelected = (context, patternId) => selectedIds(context).has(patternId);
const hasAnySelected = (context, patternIds) => patternIds.some((patternId) => hasSelected(context, patternId));
const selectedHasSignal = (context, signal) => selectedPatternRecords(context).some((pattern) => patternSignals(pattern).includes(signal));
const selectedHasGoal = (context, goal) => selectedPatternRecords(context).some((pattern) => patternGoals(pattern).includes(goal));
const result = (passed, explanation, evidence = []) => ({ passed: Boolean(passed), explanation, evidence });

function allDepartmentHandoffsPresent(context) {
  const owners = new Set((context.selection?.handoffs ?? []).map((handoff) => handoff.owner));
  return ["gameplay", "performance", "stage", "evaluation"].every((owner) => owners.has(owner));
}

function preservesProtectedCanon(context) {
  const protectedCanon = context.fixture?.storyModel?.protectedCanon ?? [];
  const handoffs = context.selection?.handoffs ?? [];
  return protectedCanon.length > 0
    && allDepartmentHandoffsPresent(context)
    && handoffs.every((handoff) => handoff.requirements?.preserveProtectedCanon === true)
    && selectedApplications(context).every((application) => application.storyRefs.includes("storyModel.protectedCanon"));
}

function originalityAudit(context) {
  const plan = context.selection?.originalityPlan ?? {};
  const applicationText = selectedApplications(context).flatMap((application) => [
    application.adaptationSummary,
    ...(application.retainedPrinciples ?? []),
    ...application.effectApplications.flatMap((effect) => [effect.effectRef, ...effect.expectedPostconditions, ...Object.values(effect.parameterBindings)])
  ]).join(" ");
  const sourceSurfaceHits = applicationText.match(SOURCE_SURFACE_PATTERN) ?? [];
  const passed = (plan.transformationAxes?.length ?? 0) >= 4
    && (plan.structuralDeltas?.length ?? 0) >= 3
    && selectedApplications(context).every((application) => (application.discardedSurfaceDetails?.length ?? 0) > 0)
    && sourceSurfaceHits.length === 0;
  return {
    passed,
    sourceSurfaceHits,
    evidence: [
      `transformationAxes=${plan.transformationAxes?.length ?? 0}`,
      `structuralDeltas=${plan.structuralDeltas?.length ?? 0}`,
      `sourceSurfaceHits=${sourceSurfaceHits.join(",") || "none"}`
    ]
  };
}

function selectedCandidateAudit(context) {
  const problems = [];
  for (const application of selectedApplications(context)) {
    const candidate = context.selection.consideredCandidates.find((item) => item.patternId === application.patternId);
    if (!candidate) problems.push(`${application.patternId}:missing-candidate`);
    else if (candidate.hardVetoes.length) problems.push(`${application.patternId}:hard-veto:${candidate.hardVetoes.join("+")}`);
    else if (candidate.verdict !== "selected") problems.push(`${application.patternId}:verdict:${candidate.verdict}`);
  }
  return problems;
}

function selectedRuntimeAudit(context) {
  const declaredRuntime = new Set(context.benchmark.runtimeCapabilities);
  const gaps = [];
  for (const application of selectedApplications(context)) {
    const pattern = patternById.get(application.patternId);
    if (!pattern) {
      gaps.push(`${application.patternId}:missing-pattern`);
      continue;
    }
    for (const capability of patternCapabilities(pattern)) if (!declaredRuntime.has(capability)) gaps.push(`${application.patternId}:${capability}`);
    for (const capability of application.runtimeMapping) if (!declaredRuntime.has(capability)) gaps.push(`${application.patternId}:application:${capability}`);
  }
  return [...new Set(gaps)];
}

function budgetAudit(context) {
  const selected = selectedIds(context);
  const failures = context.selection.consideredCandidates
    .filter((candidate) => selected.has(candidate.patternId))
    .filter((candidate) => candidate.scores.budgetFit < 3 || candidate.hardVetoes.includes("budget-impossible"))
    .map((candidate) => `${candidate.patternId}:budgetFit=${candidate.scores.budgetFit}`);
  return failures;
}

function recoveryAudit(context) {
  const failures = [];
  for (const pattern of selectedPatternRecords(context)) {
    const rollbacks = patternEffects(pattern).map((effect) => effect.rollback);
    const hasRecoveryContract = (pattern.composition?.recoveryRules?.length ?? 0) > 0 || patternCapabilities(pattern).includes("capability.checkpoints");
    if (!rollbacks.length || rollbacks.some((rollback) => !["reversible", "checkpoint-only", "irreversible-after-gate"].includes(rollback)) || !hasRecoveryContract) failures.push(pattern.patternId);
  }
  return failures;
}

function valueAtPath(rootValue, sourcePath) {
  if (!sourcePath?.startsWith("$.")) return [];
  const segments = sourcePath.slice(2).split(".");
  let values = [rootValue];
  for (const segment of segments) {
    const array = segment.endsWith("[*]");
    const key = array ? segment.slice(0, -3) : segment;
    values = values.flatMap((value) => {
      const next = value?.[key];
      if (next === undefined || next === null) return [];
      if (array) return Array.isArray(next) ? next : [];
      return [next];
    });
  }
  return values;
}

function explicitValues(value) {
  if (value === undefined || value === null) return [];
  if (["string", "number", "boolean"].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap(explicitValues);
  const preferred = Object.entries(value)
    .filter(([key, entry]) => /(?:id|ref)$/i.test(key) && ["string", "number", "boolean"].includes(typeof entry))
    .map(([, entry]) => String(entry));
  return preferred.length ? preferred : [JSON.stringify(value)];
}

function bindingParts(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return explicitValues(parsed);
  } catch {
    return value.split(/[|,]/).map((part) => part.trim()).filter(Boolean);
  }
}

function rewardDesign(context) {
  return context.fixture?.rewardDesign ?? context.fixture?.storyModel?.rewardDesign ?? {};
}

function rewardBindingAudit(context) {
  const rewardId = "pattern.reward-expands-future-possibility";
  const application = selectedApplications(context).find((item) => item.patternId === rewardId) ?? null;
  const pattern = patternById.get(rewardId);
  if (!application || !pattern) return { emitted: Boolean(application), complete: false, application, missing: [], placeholders: [], notExplicit: [], fixtureFailures: [] };
  const bindings = application.effectApplications[0]?.parameterBindings ?? {};
  const required = pattern.hooks.instantiate.parameters.filter((parameter) => parameter.required);
  const missing = required.filter((parameter) => !bindings[parameter.parameterId]).map((parameter) => parameter.parameterId);
  const placeholders = required
    .filter((parameter) => PLACEHOLDER_PATTERN.test(bindings[parameter.parameterId] ?? ""))
    .map((parameter) => `${parameter.parameterId}=${bindings[parameter.parameterId]}`);
  const notExplicit = [];
  for (const parameter of required) {
    const roots = [context.fixture, context.fixture?.storyModel, context.fixture?.productionCharter].filter(Boolean);
    const allowed = [...new Set(roots.flatMap((rootValue) => valueAtPath(rootValue, parameter.sourcePath)).flatMap(explicitValues))];
    const bound = bindingParts(bindings[parameter.parameterId]);
    if (!allowed.length || !bound.length || !bound.every((part) => allowed.includes(part))) notExplicit.push(`${parameter.parameterId}:${bound.join("|") || "missing"}`);
  }
  const design = rewardDesign(context);
  const transactions = design.acquisitionTransactions ?? [];
  const persistentStates = design.persistentStateRefs ?? [];
  const functions = design.rewardFunctions ?? [];
  const dimensions = new Set(functions.map((item) => item.functionalDimension ?? item.dimension).filter(Boolean));
  const incompleteFunctions = functions.filter((item) => !item.persistentStateRef || !item.futureUseContextRef || !item.feedbackRef || item.actionabilityDelta?.before === undefined || item.actionabilityDelta?.after === undefined);
  const nonImprovingFunctions = functions.filter((item) => typeof item.actionabilityDelta?.before !== "number" || typeof item.actionabilityDelta?.after !== "number" || item.actionabilityDelta.after <= item.actionabilityDelta.before);
  const persistentStateSet = new Set(persistentStates);
  const functionsOutsideStateSet = functions.filter((item) => !persistentStateSet.has(item.persistentStateRef));
  const transactionStateClosure = transactions.some((transaction) => transaction.atomicCommit === true && persistentStates.every((stateRef) => transaction.commitsPersistentStateRefs?.includes(stateRef)));
  const economy = context.fixture?.productionCharter?.rewardEconomy ?? context.fixture?.rewardEconomy;
  const fixtureFailures = [];
  if (!Array.isArray(transactions) || transactions.length < 1) fixtureFailures.push("acquisitionTransactions<1");
  if (!Array.isArray(persistentStates) || persistentStates.length < 1) fixtureFailures.push("persistentStateRefs<1");
  if (!Array.isArray(functions) || functions.length < 2) fixtureFailures.push("rewardFunctions<2");
  if (dimensions.size < 2) fixtureFailures.push("distinctFunctionalDimensions<2");
  if (incompleteFunctions.length) fixtureFailures.push(`incompleteFunctions=${incompleteFunctions.length}`);
  if (nonImprovingFunctions.length) fixtureFailures.push(`nonImprovingFunctions=${nonImprovingFunctions.length}`);
  if (functionsOutsideStateSet.length) fixtureFailures.push(`functionsOutsidePersistentStateSet=${functionsOutsideStateSet.length}`);
  if (!transactionStateClosure) fixtureFailures.push("acquisitionTransaction-not-atomic-or-incomplete");
  if (!economy) fixtureFailures.push("rewardEconomy-missing");
  else if (economy.protectedStoryOrderCheck?.status !== "pass") fixtureFailures.push("rewardEconomy-story-order-not-passed");
  const expectedEffectRefs = new Set(pattern.effectPrimitives.map((effect) => effect.effectId));
  const emittedEffectRefs = new Set(application.effectApplications.map((effect) => effect.effectRef));
  if (expectedEffectRefs.size !== emittedEffectRefs.size || [...expectedEffectRefs].some((effectRef) => !emittedEffectRefs.has(effectRef))) fixtureFailures.push("effect-set-does-not-match-pattern");
  const allEffectsCarryBindings = application.effectApplications.every((effect) => {
    const contract = pattern.effectPrimitives.find((candidate) => candidate.effectId === effect.effectRef);
    return contract && contract.parameters.every((parameterId) => effect.parameterBindings?.[parameterId] === bindings[parameterId]) && effect.expectedPostconditions.length > 0;
  });
  if (!allEffectsCarryBindings) fixtureFailures.push("effect-binding-or-postcondition-missing");
  return {
    emitted: true,
    complete: application.patternVersion === "2.0.0" && !missing.length && !placeholders.length && !notExplicit.length && !fixtureFailures.length,
    application,
    missing,
    placeholders,
    notExplicit,
    fixtureFailures
  };
}

function propertyEvaluator(gate, evaluatorId, evaluate) {
  return { gate, evaluatorId, evaluate };
}

const PROPERTY_EVALUATORS = new Map([
  ["Select one stateful core with observable before/after world consequences", propertyEvaluator("G6_selectionQuality", "selection.stateful-observable-core", (context) => {
    const core = corePattern(context);
    const stateEffects = patternEffects(core).filter((effect) => STATE_EFFECT_KINDS.has(effect.kind) || !["emit-performance-cue", "camera-transition"].includes(effect.kind));
    const observable = stateEffects.some((effect) => (effect.observableFeedback?.length ?? 0) > 0) && coreApplications(context)[0]?.effectApplications.some((effect) => effect.expectedPostconditions.length > 0);
    return result(coreApplications(context).length === 1 && stateEffects.length > 0 && observable, "Exactly one core must expose a state mutation with observable feedback and emitted postconditions.", [`core=${core?.patternId ?? "none"}`, `stateEffects=${stateEffects.map((effect) => effect.effectId).join(",") || "none"}`, `observable=${Boolean(observable)}`]);
  })],
  ["Include safe teaching and revisit development", propertyEvaluator("G7_compositionDiscipline", "composition.safe-teach-and-revisit", (context) => {
    const arc = context.selection.composition.developmentArc;
    const requiredArc = ["teach", "practice", "variation", "combine-or-reverse", "exam"];
    const core = corePattern(context);
    const safe = patternEffects(core).every((effect) => ["reversible", "checkpoint-only", "irreversible-after-gate"].includes(effect.rollback)) && patternCapabilities(core).includes("capability.checkpoints");
    const revisit = storySignals(context).includes("signal.revisited-place") && (patternSignals(core).includes("signal.revisited-place") || patternGoals(core).includes("experience.world-recontextualization"));
    return result(requiredArc.every((step) => arc.includes(step)) && safe && revisit, "The full development arc must be present, its teaching effects recoverable, and revisit intent grounded in both story and pattern.", [`arc=${arc.join(",")}`, `safe=${safe}`, `revisit=${revisit}`]);
  })],
  ["No cooperative-only or open-world scale pattern", propertyEvaluator("G6_selectionQuality", "selection.exclude-coop-open-scale", (context) => {
    const forbidden = ["pattern.cooperative-role-interdependence", "pattern.asymmetric-screen-information", "pattern.dense-overworld-as-challenge-space"].filter((id) => hasSelected(context, id));
    return result(!forbidden.length, "A compact single-player locked-room fixture may not select cooperative-only or dense-overworld patterns.", [`forbiddenSelected=${forbidden.join(",") || "none"}`]);
  })],
  ["No source-specific room or object sequence", propertyEvaluator("G8_canonSafetyContract", "canon.no-source-room-object-sequence", (context) => {
    const audit = originalityAudit(context);
    return result(audit.passed, "Applications must bind to the fixture while meeting transformation floors and containing no protected source surface in emitted application content.", audit.evidence);
  })],
  ["Prefer NPC state, schedule, or agency-performance patterns", propertyEvaluator("G6_selectionQuality", "selection.prefer-social-performance", (context) => {
    const matching = selectedPatternRecords(context).filter((pattern) => pattern.kind === "npc-quest" || pattern.kind === "performance-camera" || patternCapabilities(pattern).some((capability) => ["capability.npc-state", "capability.schedule-clock"].includes(capability)));
    return result(matching.length > 0, "At least one selected pattern must provide NPC state, schedule, or performance agency.", [`matching=${matching.map((pattern) => pattern.patternId).join(",") || "none"}`]);
  })],
  ["Keep spatial mechanics subordinate to relationship revelation", propertyEvaluator("G7_compositionDiscipline", "composition.relationship-over-space", (context) => {
    const core = corePattern(context);
    const hasSocialSupport = selectedPatternRecords(context).some((pattern) => pattern.kind === "npc-quest" || patternGoals(pattern).includes("experience.social-recognition"));
    const passed = core?.kind !== "spatial-level" && (core?.kind === "performance-camera" || hasSocialSupport);
    return result(passed, "Relationship drama requires a non-spatial core or explicit social/performance support, not a spatial-level core.", [`coreKind=${core?.kind ?? "none"}`, `socialSupport=${hasSocialSupport}`]);
  })],
  ["No combat boss or object-composition core", propertyEvaluator("G6_selectionQuality", "selection.exclude-combat-object-core", (context) => {
    const core = corePattern(context);
    const passed = core && !["combat-boss", "interaction-prop"].includes(core.kind) && !patternCapabilities(core).includes("capability.object-composition");
    return result(passed, "The core may not be combat/boss or require object composition for this relationship fixture.", [`core=${core?.patternId ?? "none"}`, `kind=${core?.kind ?? "none"}`]);
  })],
  ["No forced high-area exploration", propertyEvaluator("G9_runtimeFit", "runtime.exclude-high-area-exploration", (context) => {
    const forbidden = selectedPatternRecords(context).filter((pattern) => pattern.patternId === "pattern.dense-overworld-as-challenge-space" || patternPrinciple(pattern).toLowerCase().includes("overworld"));
    return result(!forbidden.length, "The selected contract must not impose dense/open-world exploration on a bounded relationship fixture.", [`forbidden=${forbidden.map((pattern) => pattern.patternId).join(",") || "none"}`]);
  })],
  ["Support route decisions under schedule pressure", propertyEvaluator("G6_selectionQuality", "selection.route-under-schedule", (context) => {
    const passed = storySignals(context).includes("signal.schedule-pressure") && selectedHasSignal(context, "signal.schedule-pressure") && selectedCapabilities(context).has("capability.route-gates");
    return result(passed, "Schedule pressure must be causally matched by a selected pattern that also maps route gates.", [`storySchedule=${storySignals(context).includes("signal.schedule-pressure")}`, `patternSchedule=${selectedHasSignal(context, "signal.schedule-pressure")}`, `routeGates=${selectedCapabilities(context).has("capability.route-gates")}`]);
  })],
  ["Preserve comedy and passenger response", propertyEvaluator("G8_canonSafetyContract", "canon.preserve-comedy-passengers", (context) => {
    const canon = context.fixture.storyModel.protectedCanon ?? [];
    const passengerCanon = canon.some((fact) => /passenger|cake|comic/i.test(typeof fact === "string" ? fact : JSON.stringify(fact)));
    const passed = passengerCanon && storySignals(context).includes("signal.relationship-memory") && preservesProtectedCanon(context);
    return result(passed, "Passenger/comedy facts must exist in the fixture and flow through all preserve-canon handoffs.", [`passengerCanon=${passengerCanon}`, `relationshipMemory=${storySignals(context).includes("signal.relationship-memory")}`, `handoffPreservation=${preservesProtectedCanon(context)}`]);
  })],
  ["No reset loop that erases comic continuity", propertyEvaluator("G8_canonSafetyContract", "canon.no-continuity-erasing-reset", (context) => {
    const forbidden = ["pattern.finite-schedule-loop", "pattern.reversible-reset-knowledge-retention"].filter((id) => hasSelected(context, id));
    return result(!forbidden.length, "No reset-loop pattern may be selected when continuity is a protected comic fact.", [`resetPatterns=${forbidden.join(",") || "none"}`]);
  })],
  ["No solitary contemplative core", propertyEvaluator("G6_selectionQuality", "selection.no-solitary-core", (context) => {
    const core = corePattern(context);
    const activeSignals = ["signal.schedule-pressure", "signal.multi-causal-problem", "signal.relationship-memory"].filter((signal) => patternSignals(core).includes(signal));
    return result(activeSignals.length > 0, "The chase core must causally address pressure, multiple causes, or relationships rather than solitary contemplation.", [`core=${core?.patternId ?? "none"}`, `activeSignals=${activeSignals.join(",") || "none"}`]);
  })],
  ["Selected patterns must tolerate fast feedback and comic failure", propertyEvaluator("G9_runtimeFit", "runtime.fast-feedback-recovery", (context) => {
    const recoveryFailures = recoveryAudit(context);
    const feedback = selectedPatternRecords(context).every((pattern) => patternEffects(pattern).some((effect) => (effect.observableFeedback?.length ?? 0) > 0));
    return result(!recoveryFailures.length && feedback, "Every selected pattern must define observable feedback and bounded rollback/checkpoint recovery.", [`recoveryFailures=${recoveryFailures.join(",") || "none"}`, `allHaveFeedback=${feedback}`]);
  })],
  ["At most one core and three supports", propertyEvaluator("G7_compositionDiscipline", "composition.one-plus-three", (context) => result(coreApplications(context).length <= 1 && supportApplications(context).length <= 3, "Composition is bounded to one core and no more than three supports.", [`coreCount=${coreApplications(context).length}`, `supportCount=${supportApplications(context).length}`]))],
  ["No solemn source surface or boss-script transfer", propertyEvaluator("G8_canonSafetyContract", "canon.no-boss-or-source-surface", (context) => {
    const audit = originalityAudit(context);
    const boss = selectedKinds(context).has("combat-boss");
    return result(audit.passed && !boss, "The emitted application must pass the static source-surface scan and contain no combat/boss pattern.", [...audit.evidence, `combatBossSelected=${boss}`]);
  })],
  ["No schedule system that makes recovery punitive", propertyEvaluator("G9_runtimeFit", "runtime.no-punitive-schedule", (context) => {
    const schedulePatterns = selectedPatternRecords(context).filter((pattern) => patternCapabilities(pattern).includes("capability.schedule-clock"));
    const punitive = schedulePatterns.filter((pattern) => !patternCapabilities(pattern).includes("capability.checkpoints") || patternEffects(pattern).some((effect) => !["reversible", "checkpoint-only"].includes(effect.rollback)));
    return result(!punitive.length, "Any selected schedule system must include checkpoints and only reversible/checkpoint rollback.", [`schedulePatterns=${schedulePatterns.map((pattern) => pattern.patternId).join(",") || "none"}`, `punitive=${punitive.map((pattern) => pattern.patternId).join(",") || "none"}`]);
  })],
  ["Prefer landmark, systemic rule, or possibility-expanding reward patterns", propertyEvaluator("G6_selectionQuality", "selection.prefer-exploration-system", (context) => {
    const matching = selectedPatternRecords(context).filter((pattern) => patternSignals(pattern).includes("signal.landmark-mystery") || pattern.kind === "world-state-rule" || pattern.patternId === "pattern.reward-expands-future-possibility");
    return result(matching.length > 0, "Open exploration must select a landmark, systemic-rule, or future-possibility pattern.", [`matching=${matching.map((pattern) => pattern.patternId).join(",") || "none"}`]);
  })],
  ["Permit multiple causal routes within runtime budget", propertyEvaluator("G9_runtimeFit", "runtime.multiple-routes-in-budget", (context) => {
    const routeCapable = selectedCapabilities(context).has("capability.route-gates") && selectedCapabilities(context).has("capability.route-simulation");
    const budgetFailures = budgetAudit(context);
    return result(routeCapable && !budgetFailures.length, "Selected exploration patterns must support route gates plus route simulation and clear budget-fit scoring.", [`routeCapable=${routeCapable}`, `budgetFailures=${budgetFailures.join(",") || "none"}`]);
  })],
  ["No forced fixed-order puzzle solution", propertyEvaluator("G7_compositionDiscipline", "composition.no-fixed-order-solution", (context) => {
    const forced = selectedPatternRecords(context).filter((pattern) => /fixed[- ]order|one action sequence|single solution/i.test(patternPrinciple(pattern)) || pattern.patternId === "pattern.dungeon-macro-state-machine");
    return result(!forced.length, "No selected principle may require one fixed solution sequence for the open-exploration fixture.", [`forced=${forced.map((pattern) => pattern.patternId).join(",") || "none"}`]);
  })],
  ["No long authored cutscene core", propertyEvaluator("G7_compositionDiscipline", "composition.no-cutscene-core", (context) => {
    const core = corePattern(context);
    const longPerformance = core?.kind === "performance-camera" && !(core.departmentContracts?.performance?.interactionWindows?.length > 0);
    return result(!longPerformance, "A performance core is only legal when it declares interaction windows; an authored cutscene-only core is forbidden.", [`coreKind=${core?.kind ?? "none"}`, `interactionWindows=${core?.departmentContracts?.performance?.interactionWindows?.length ?? 0}`]);
  })],
  ["Use interaction windows and NPC memory without rewriting authored facts", propertyEvaluator("G8_canonSafetyContract", "canon.npc-memory-interaction-windows", (context) => {
    const matching = selectedPatternRecords(context).filter((pattern) => (pattern.departmentContracts?.performance?.interactionWindows?.length ?? 0) > 0 && (pattern.kind === "npc-quest" || patternCapabilities(pattern).includes("capability.npc-state")));
    return result(matching.length > 0 && preservesProtectedCanon(context), "At least one NPC-state pattern must declare interaction windows and every handoff must preserve protected facts.", [`matching=${matching.map((pattern) => pattern.patternId).join(",") || "none"}`, `canonPreserved=${preservesProtectedCanon(context)}`]);
  })],
  ["Preserve reveal order", propertyEvaluator("G8_canonSafetyContract", "canon.preserve-reveal-order", (context) => {
    const storyHasReveal = (context.fixture.storyModel.revealOrder?.length ?? 0) > 0 || (context.fixture.storyModel.protectedCanon?.length ?? 0) > 0;
    const applicationsPreserve = selectedApplications(context).every((application) => application.storyRefs.includes("storyModel.revealOrder") && /preserv(?:e|ing).*reveal order/i.test(application.adaptationSummary));
    return result(storyHasReveal && applicationsPreserve && preservesProtectedCanon(context), "Each application must bind the reveal-order story reference, state preservation in its adaptation summary, and retain the canon handoff guard.", [`storyHasReveal=${storyHasReveal}`, `applicationsPreserve=${applicationsPreserve}`, `canonPreserved=${preservesProtectedCanon(context)}`]);
  })],
  ["No dialogue dump disguised as a mechanic", propertyEvaluator("G7_compositionDiscipline", "composition.no-dialogue-dump", (context) => {
    const core = corePattern(context);
    const embodied = patternEffects(core).some((effect) => !["emit-dialogue", "emit-performance-cue", "camera-transition"].includes(effect.kind));
    return result(Boolean(core) && embodied, "The core must emit at least one non-dialogue/non-cue causal effect.", [`core=${core?.patternId ?? "none"}`, `embodiedEffect=${embodied}`]);
  })],
  ["No spatial transformation unrelated to character action", propertyEvaluator("G8_canonSafetyContract", "canon.spatial-change-story-fit", (context) => {
    const core = corePattern(context);
    const matched = patternSignals(core).filter((signal) => storySignals(context).includes(signal));
    const social = selectedPatternRecords(context).some((pattern) => pattern.kind === "npc-quest" || patternSignals(pattern).includes("signal.relationship-memory"));
    return result(matched.length >= 2 && social, "A spatial/world change must match at least two causal story signals and retain a selected social/character consequence.", [`matchedSignals=${matched.join(",") || "none"}`, `socialConsequence=${social}`]);
  })],
  ["Prefer schedule, social response, or performance pacing over map replacement", propertyEvaluator("G6_selectionQuality", "selection.prefer-low-spatial-social", (context) => {
    const core = corePattern(context);
    const matching = selectedPatternRecords(context).filter((pattern) => pattern.kind === "npc-quest" || pattern.kind === "performance-camera" || patternCapabilities(pattern).some((capability) => ["capability.schedule-clock", "capability.performance-cues"].includes(capability)));
    return result(core?.kind !== "spatial-level" && matching.length > 0, "A low-spatial fixture requires a non-spatial core and at least one schedule/social/performance pattern.", [`coreKind=${core?.kind ?? "none"}`, `matching=${matching.map((pattern) => pattern.patternId).join(",") || "none"}`]);
  })],
  ["Keep topology cost low", propertyEvaluator("G9_runtimeFit", "runtime.low-topology-cost", (context) => {
    const spatialCore = corePattern(context)?.kind === "spatial-level";
    const heavy = selectedPatternRecords(context).filter((pattern) => pattern.patternId === "pattern.dense-overworld-as-challenge-space" || pattern.patternId === "pattern.perspective-shift-reframes-space");
    return result(!spatialCore && !heavy.length, "Low topology cost forbids a spatial-level core and known high-topology patterns.", [`spatialCore=${spatialCore}`, `heavy=${heavy.map((pattern) => pattern.patternId).join(",") || "none"}`]);
  })],
  ["No open-world or dense-overworld core", propertyEvaluator("G6_selectionQuality", "selection.no-open-world-core", (context) => {
    const core = corePattern(context);
    return result(core?.patternId !== "pattern.dense-overworld-as-challenge-space" && !/open[- ]world|dense overworld/i.test(patternPrinciple(core)), "The core may not impose open-world/dense-overworld structure.", [`core=${core?.patternId ?? "none"}`]);
  })],
  ["No multi-layer map requirement", propertyEvaluator("G9_runtimeFit", "runtime.no-map-layers", (context) => {
    const requiring = selectedApplications(context).filter((application) => application.runtimeMapping.includes("capability.map-layers") || patternCapabilities(patternById.get(application.patternId)).includes("capability.map-layers"));
    return result(!requiring.length, "No selected application may require capability.map-layers for the low-spatial-change fixture.", [`requiring=${requiring.map((application) => application.patternId).join(",") || "none"}`]);
  })],
  ["Abstain because uninterrupted fixed rhetoric has insufficient causal interaction fit", propertyEvaluator("G6_selectionQuality", "selection.fixed-rhetoric-abstention", (context) => {
    const reason = context.selection.abstention.reason ?? "";
    const passed = storySignals(context).includes("signal.low-interaction-fit") && context.selection.abstention.abstained && /fixed|uninterrupted|rhetorical/i.test(reason);
    return result(passed, "The low-interaction signal must produce an explicit fixed-rhetoric abstention.", [`lowInteraction=${storySignals(context).includes("signal.low-interaction-fit")}`, `abstained=${context.selection.abstention.abstained}`, `reason=${reason}`]);
  })],
  ["No Zelda-derived core pattern", propertyEvaluator("G8_canonSafetyContract", "canon.no-pack-core-on-abstention", (context) => result(context.selection.abstention.abstained && coreApplications(context).length === 0, "A principled abstention must emit no core or application from the inspiration pack.", [`abstained=${context.selection.abstention.abstained}`, `coreCount=${coreApplications(context).length}`]))],
  ["No invented spatial or inventory conflict", propertyEvaluator("G8_canonSafetyContract", "canon.no-invented-conflict-on-abstention", (context) => {
    const noApplications = selectedApplications(context).length === 0;
    const noSpatialQuery = (context.selection.query.spatialConstraints?.length ?? 0) === 0;
    const noApplicationHandoffs = context.selection.handoffs.every((handoff) => handoff.applicationRefs.length === 0 && handoff.requirements?.useStoryDerivedNoPackDesign === true);
    return result(noApplications && noSpatialQuery && noApplicationHandoffs, "Abstention must not synthesize spatial/inventory applications and must route all departments to story-derived no-Pack design.", [`applications=${selectedApplications(context).length}`, `spatialConstraints=${context.selection.query.spatialConstraints.length}`, `noPackHandoffs=${noApplicationHandoffs}`]);
  })],
  ["Select the Reward 2.0 pattern only with complete explicit bindings", propertyEvaluator("G6_selectionQuality", "selection.reward-v2-complete-bindings", (context) => {
    const audit = rewardBindingAudit(context);
    return result(audit.emitted && audit.complete, "Reward 2.0 may be selected only when every required binding resolves to explicit fixture data and the two-function contract is complete.", [`emitted=${audit.emitted}`, `version=${audit.application?.patternVersion ?? "none"}`, `missing=${audit.missing.join(",") || "none"}`, `placeholders=${audit.placeholders.join(",") || "none"}`, `notExplicit=${audit.notExplicit.join(",") || "none"}`, `fixtureFailures=${audit.fixtureFailures.join(",") || "none"}`]);
  })],
  ["Reject Reward 2.0 when explicit bindings are absent", propertyEvaluator("G6_selectionQuality", "selection.reject-unbound-reward-v2", (context) => {
    const audit = rewardBindingAudit(context);
    return result(!audit.emitted, "A fixture without explicit Reward 2.0 bindings must not emit the reward application.", [`rewardEmitted=${audit.emitted}`]);
  })],
  ["No synthesized placeholder may satisfy a Reward 2.0 manual binding", propertyEvaluator("G9_runtimeFit", "runtime.no-reward-binding-placeholder", (context) => {
    const audit = rewardBindingAudit(context);
    return result(!audit.emitted || (!audit.placeholders.length && !audit.notExplicit.length), "Designer-decision Reward 2.0 bindings must be copied from explicit fixture refs; generated placeholders are invalid.", [`rewardEmitted=${audit.emitted}`, `placeholders=${audit.placeholders.join(",") || "none"}`, `notExplicit=${audit.notExplicit.join(",") || "none"}`]);
  })],
  ["No incomplete Reward 2.0 application may be emitted", propertyEvaluator("G9_runtimeFit", "runtime.no-incomplete-reward-v2", (context) => {
    const audit = rewardBindingAudit(context);
    return result(!audit.emitted || audit.complete, "Any emitted Reward 2.0 application must close all required bindings, fixture functions, postconditions, and economy data.", [`rewardEmitted=${audit.emitted}`, `complete=${audit.complete}`, `missing=${audit.missing.join(",") || "none"}`, `fixtureFailures=${audit.fixtureFailures.join(",") || "none"}`]);
  })]
]);

function evaluateProperty(context, property, expectation) {
  const evaluator = PROPERTY_EVALUATORS.get(property);
  if (!evaluator) return {
    expectation,
    property,
    evaluatorId: null,
    gate: "G6_selectionQuality",
    passed: false,
    explanation: "Unknown benchmark property: no executable evaluator is registered; unrecognized text is a hard failure.",
    evidence: [property]
  };
  try {
    return { expectation, property, evaluatorId: evaluator.evaluatorId, gate: evaluator.gate, ...evaluator.evaluate(context) };
  } catch (error) {
    return { expectation, property, evaluatorId: evaluator.evaluatorId, gate: evaluator.gate, passed: false, explanation: `Evaluator threw: ${error.message}`, evidence: [] };
  }
}

function metricValue(selection, metricId) {
  if (metricId === "metric.hard-veto-count") {
    const selected = new Set(selection.selectedApplications.map((application) => application.patternId));
    return selection.consideredCandidates.filter((candidate) => selected.has(candidate.patternId)).reduce((count, candidate) => count + candidate.hardVetoes.length, 0);
  }
  if (metricId === "metric.core-count") return selection.selectedApplications.filter((application) => application.role === "core").length;
  if (metricId === "metric.support-count") return selection.selectedApplications.filter((application) => application.role === "support").length;
  return null;
}

function compareMetric(value, comparator, threshold) {
  if (value === null) return false;
  if (comparator === "equals") return value === threshold;
  if (comparator === "less-or-equal") return value <= threshold;
  if (comparator === "less-than") return value < threshold;
  if (comparator === "greater-or-equal") return value >= threshold;
  if (comparator === "greater-than") return value > threshold;
  return false;
}

function evaluateMetrics(benchmark, selection) {
  return benchmark.metrics.map((metric) => {
    const value = metricValue(selection, metric.metricId);
    const gate = metric.metricId === "metric.hard-veto-count" ? "G6_selectionQuality" : "G7_compositionDiscipline";
    return {
      metricId: metric.metricId,
      gate,
      comparator: metric.comparator,
      threshold: metric.threshold,
      actual: value,
      passed: compareMetric(value, metric.comparator, metric.threshold),
      explanation: value === null ? "Unknown metric ID or comparator; metrics are fail-closed." : `${value} ${metric.comparator} ${metric.threshold}`
    };
  });
}

function emptyGateChecks() {
  return Object.fromEntries(GATES.map((gate) => [gate, []]));
}

function addCheck(gateChecks, gate, check) {
  gateChecks[gate].push(check);
}

const fixtureAttestationByPath = new Map();
for (const benchmark of cases) {
  const fixturePath = path.join(repoRoot, benchmark.inputFixture.path);
  const fixtureAttestation = await attest(fixturePath);
  const existing = fixtureAttestationByPath.get(benchmark.inputFixture.path);
  if (existing && existing.declaredHash !== benchmark.inputFixture.hash) existing.conflictingDeclaredHashes.push(benchmark.inputFixture.hash);
  else if (!existing) fixtureAttestationByPath.set(benchmark.inputFixture.path, {
    ...fixtureAttestation,
    declaredHash: benchmark.inputFixture.hash,
    hashMatches: fixtureAttestation.sha256 === benchmark.inputFixture.hash,
    benchmarkRefs: [],
    conflictingDeclaredHashes: []
  });
  fixtureAttestationByPath.get(benchmark.inputFixture.path).benchmarkRefs.push(benchmark.benchmarkId);
}

const runs = [];
for (const benchmark of cases) {
  const fixturePath = path.join(repoRoot, benchmark.inputFixture.path);
  const fixtureAttestation = fixtureAttestationByPath.get(benchmark.inputFixture.path);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  for (const seed of benchmark.seeds) {
    const output = path.join(expectedRoot, `${benchmark.benchmarkId.replace(/^benchmark\./, "")}-seed-${seed}.json`);
    const gateChecks = emptyGateChecks();
    let selection = null;
    let outputAttestation = null;
    let command = null;

    addCheck(gateChecks, "G6_selectionQuality", {
      checkId: "input.fixture-sha256",
      passed: fixtureAttestation.hashMatches && fixtureAttestation.conflictingDeclaredHashes.length === 0,
      message: fixtureAttestation.hashMatches ? "Fixture raw SHA-256 matches its benchmark declaration." : `Fixture hash mismatch: declared ${benchmark.inputFixture.hash}, actual ${fixtureAttestation.sha256}.`,
      evidence: [fixtureAttestation.path, fixtureAttestation.sha256]
    });

    if (fixtureAttestation.hashMatches && fixtureAttestation.conflictingDeclaredHashes.length === 0) {
      await rm(output, { force: true });
      command = spawnSync(process.execPath, [selectorPath, fixturePath, `--output=${output}`, `--seed=${seed}`, "--benchmark-unlocked"], { cwd: repoRoot, encoding: "utf8" });
      addCheck(gateChecks, "G6_selectionQuality", { checkId: "selector.exit", passed: command.status === 0, message: command.status === 0 ? "Selector exited successfully." : `Selector exited ${command.status}: ${command.stderr || command.stdout}`, evidence: [] });
      if (command.status === 0) {
        try {
          const outputBytes = await readFile(output);
          outputAttestation = { path: repoPath(output), sha256: sha256(outputBytes), bytes: outputBytes.length };
          selection = JSON.parse(outputBytes.toString("utf8"));
        } catch (error) {
          addCheck(gateChecks, "G6_selectionQuality", { checkId: "selector.output-readable", passed: false, message: `Selector output could not be read: ${error.message}`, evidence: [repoPath(output)] });
        }
      }
    }

    const propertyEvaluations = [];
    const metricEvaluations = [];
    if (selection) {
      const schemaPassed = validate(selection);
      addCheck(gateChecks, "G6_selectionQuality", { checkId: "selection.schema", passed: schemaPassed, message: schemaPassed ? "Selection matches the formal schema." : `Schema: ${validate.errors.map((error) => `${error.instancePath} ${error.message}`).join("; ")}`, evidence: [coreInputAttestations.selectionSchema.sha256] });

      const context = { benchmark, fixture, selection };
      const mustAbstain = benchmark.abstentionExpectation === "must-abstain";
      const abstentionPassed = mustAbstain ? selection.abstention.abstained : benchmark.abstentionExpectation === "must-select" ? !selection.abstention.abstained : true;
      addCheck(gateChecks, "G6_selectionQuality", { checkId: "selection.abstention-expectation", passed: abstentionPassed, message: `Expected ${benchmark.abstentionExpectation}; selector abstained=${selection.abstention.abstained}.`, evidence: [selection.abstention.reason ?? "no-reason"] });

      const candidateProblems = selectedCandidateAudit(context);
      addCheck(gateChecks, "G6_selectionQuality", { checkId: "selection.selected-candidates", passed: !candidateProblems.length, message: candidateProblems.length ? `Selected candidate violations: ${candidateProblems.join("; ")}` : "Every application closes to a selected, non-vetoed candidate.", evidence: candidateProblems });

      const cores = coreApplications(context);
      const supports = supportApplications(context);
      const compositionPassed = selection.abstention.abstained ? selectedApplications(context).length === 0 : cores.length === 1;
      addCheck(gateChecks, "G7_compositionDiscipline", { checkId: "composition.one-plus-three-invariant", passed: compositionPassed && supports.length <= 3, message: `abstained=${selection.abstention.abstained}, cores=${cores.length}, supports=${supports.length}.`, evidence: [selection.composition.corePatternRef ?? "no-core", ...selection.composition.supportPatternRefs] });

      const originality = originalityAudit(context);
      addCheck(gateChecks, "G8_canonSafetyContract", { checkId: "canon.static-originality", passed: selection.abstention.abstained || originality.passed, message: originality.passed || selection.abstention.abstained ? "Static originality floor and source-surface scan passed." : "Static originality floor or source-surface scan failed.", evidence: originality.evidence });
      addCheck(gateChecks, "G8_canonSafetyContract", { checkId: "canon.typed-handoffs", passed: allDepartmentHandoffsPresent(context), message: allDepartmentHandoffsPresent(context) ? "All four typed department handoffs are present." : "Typed department handoffs are incomplete.", evidence: (selection.handoffs ?? []).map((handoff) => handoff.owner) });

      const runtimeGaps = selectedRuntimeAudit(context);
      addCheck(gateChecks, "G9_runtimeFit", { checkId: "runtime.capability-closure", passed: !runtimeGaps.length && (selection.runtimeAssessment.gaps?.length ?? 0) === 0, message: runtimeGaps.length ? `Runtime gaps: ${runtimeGaps.join("; ")}` : "Selected pattern and application capabilities are present in the benchmark runtime.", evidence: runtimeGaps });
      const budgetFailures = budgetAudit(context);
      addCheck(gateChecks, "G9_runtimeFit", { checkId: "runtime.budget-fit", passed: !budgetFailures.length, message: budgetFailures.length ? `Budget failures: ${budgetFailures.join("; ")}` : "Selected candidates clear the executable budget floor.", evidence: budgetFailures });

      for (const property of benchmark.expectedProperties) propertyEvaluations.push(evaluateProperty(context, property, "expected"));
      for (const property of benchmark.forbiddenProperties) propertyEvaluations.push(evaluateProperty(context, property, "forbidden"));
      for (const evaluation of propertyEvaluations) addCheck(gateChecks, evaluation.gate, { checkId: `property.${evaluation.evaluatorId ?? "unknown"}`, passed: evaluation.passed, message: `${evaluation.expectation}: ${evaluation.property} — ${evaluation.explanation}`, evidence: evaluation.evidence });

      metricEvaluations.push(...evaluateMetrics(benchmark, selection));
      for (const evaluation of metricEvaluations) addCheck(gateChecks, evaluation.gate, { checkId: `metric.${evaluation.metricId}`, passed: evaluation.passed, message: evaluation.explanation, evidence: [`actual=${evaluation.actual}`] });
    } else {
      addCheck(gateChecks, "G6_selectionQuality", { checkId: "selection.available", passed: false, message: "No selection was available for semantic evaluation.", evidence: [] });
    }

    const runGateResults = Object.fromEntries(GATES.map((gate) => {
      const checks = gateChecks[gate];
      const failures = checks.filter((check) => !check.passed);
      return [gate, { passed: failures.length === 0, checkCount: checks.length, failureCount: failures.length, failures }];
    }));
    const errors = GATES.flatMap((gate) => runGateResults[gate].failures.map((failure) => `[${gate}] ${failure.message}`));
    runs.push({
      benchmarkId: benchmark.benchmarkId,
      seed,
      passed: errors.length === 0,
      errors,
      inputFixture: { path: fixtureAttestation.path, declaredHash: benchmark.inputFixture.hash, actualHash: fixtureAttestation.sha256, hashMatches: fixtureAttestation.hashMatches },
      outputAttestation,
      selectorExitStatus: command?.status ?? null,
      abstained: selection?.abstention.abstained ?? null,
      corePatternRef: selection?.composition.corePatternRef ?? null,
      supportPatternRefs: selection?.composition.supportPatternRefs ?? [],
      propertyEvaluations,
      metricEvaluations,
      gateResults: runGateResults
    });
  }
}

const aggregateGateResults = Object.fromEntries(GATES.map((gate) => {
  const failed = runs.filter((run) => !run.gateResults[gate].passed);
  return [gate, {
    passed: failed.length === 0,
    passedRuns: runs.length - failed.length,
    failedRuns: failed.length,
    failureCount: failed.reduce((count, run) => count + run.gateResults[gate].failureCount, 0),
    failures: failed.flatMap((run) => run.gateResults[gate].failures.map((failure) => ({ benchmarkId: run.benchmarkId, seed: run.seed, checkId: failure.checkId, message: failure.message })))
  }];
}));

const failedRuns = runs.filter((run) => !run.passed).length;
const seedCounts = [...new Set(cases.map((benchmark) => benchmark.seeds.length))];
const report = {
  reportVersion: "2.0.0",
  generatedAt: "2026-07-18",
  selectorVersion: "0.3.0-beta.1",
  cases: cases.length,
  seedsPerCase: seedCounts.length === 1 ? seedCounts[0] : seedCounts,
  runCount: runs.length,
  passedRuns: runs.length - failedRuns,
  failedRuns,
  abstentionCases: runs.filter((run) => run.abstained).length,
  evaluatorCoverage: {
    declaredProperties: cases.reduce((count, benchmark) => count + benchmark.expectedProperties.length + benchmark.forbiddenProperties.length, 0),
    registeredProperties: new Set(cases.flatMap((benchmark) => [...benchmark.expectedProperties, ...benchmark.forbiddenProperties]).filter((property) => PROPERTY_EVALUATORS.has(property))).size,
    unknownProperties: [...new Set(cases.flatMap((benchmark) => [...benchmark.expectedProperties, ...benchmark.forbiddenProperties]).filter((property) => !PROPERTY_EVALUATORS.has(property)))]
  },
  inputAttestations: {
    coreInputs: coreInputAttestations,
    fixtures: [...fixtureAttestationByPath.values()]
  },
  outputAttestations: runs.map((run) => ({ benchmarkId: run.benchmarkId, seed: run.seed, ...run.outputAttestation })),
  gateResults: aggregateGateResults,
  runRecords: runs
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Selector benchmarks: ${report.passedRuns}/${report.runCount} passed; G6=${aggregateGateResults.G6_selectionQuality.passed}, G7=${aggregateGateResults.G7_compositionDiscipline.passed}, G8=${aggregateGateResults.G8_canonSafetyContract.passed}, G9=${aggregateGateResults.G9_runtimeFit.passed}.`);
if (failedRuns) process.exitCode = 1;

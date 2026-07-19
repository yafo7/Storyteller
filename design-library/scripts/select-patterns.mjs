import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAndVerifyLibraryLock } from "./lock-utils.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith("--"));
if (!inputPath) throw new Error("Usage: node select-patterns.mjs <story-fixture.json> --lock=<library-lock.json> [--output=path] [--disable-pack]");
const outputPath = args.find((arg) => arg.startsWith("--output="))?.split("=").slice(1).join("=");
const lockPath = args.find((arg) => arg.startsWith("--lock="))?.split("=").slice(1).join("=");
const benchmarkUnlocked = args.includes("--benchmark-unlocked");
const disablePack = args.includes("--disable-pack");
if (Boolean(lockPath) === benchmarkUnlocked) throw new Error("Select exactly one dependency mode: a verified --lock=<path>, or --benchmark-unlocked for pre-release benchmark calibration only.");
const resolvedInputPath = path.resolve(inputPath);
const verifiedLock = lockPath
  ? await validateAndVerifyLibraryLock(path.resolve(lockPath), { fixturePath: resolvedInputPath, disablePack })
  : null;
const bytes = await readFile(resolvedInputPath);
const input = JSON.parse(bytes);
const story = input.storyModel;
const runtimeSet = new Set(input.runtimeCapabilities ?? []);
const storySignals = story.storySignals ?? [];
const spatialSignals = story.spatialSignals ?? [];
const goals = story.experienceGoals ?? [];
const lowInteraction = storySignals.includes("signal.low-interaction-fit");
const round = (value) => Math.round(value * 1000) / 1000;
const rewardPatternId = "pattern.reward-expands-future-possibility";
const rewardManualValueTypes = new Set(["transaction-ref", "persistent-state-ref-array", "reward-function-ref-array", "economy-rule-ref"]);

const isExplicitRef = (value) => typeof value === "string"
  && value.trim().length >= 3
  && !/(?:placeholder|story-derived|fallback|unknown|tbd|todo)/i.test(value);
const hasBoundValue = (value) => value !== undefined
  && value !== null
  && (typeof value !== "string" || value.trim().length > 0);
const canonicalRefArray = (refs) => JSON.stringify([...new Set(refs)].sort((a, b) => a.localeCompare(b)));

function actionabilityIncreases(delta) {
  if (!delta || !hasBoundValue(delta.before) || !hasBoundValue(delta.after)) return false;
  const orderedTerms = new Map([
    ["none", 0], ["blocked", 0], ["unavailable", 0], ["inaccessible", 0], ["disabled", 0],
    ["limited", 1], ["partial", 1],
    ["available", 2], ["actionable", 2], ["accessible", 2], ["enabled", 2],
    ["expanded", 3], ["enhanced", 3]
  ]);
  const measurableValue = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string") return orderedTerms.get(value.trim().toLowerCase()) ?? null;
    if (value && typeof value === "object") {
      for (const key of ["score", "count", "rank", "level", "value", "actionable", "status"]) {
        if (Object.hasOwn(value, key)) {
          const measured = measurableValue(value[key]);
          if (measured !== null) return measured;
        }
      }
    }
    return null;
  };
  const before = measurableValue(delta.before);
  const after = measurableValue(delta.after);
  return before !== null && after !== null && after > before;
}

function resolveRewardManualBindings() {
  const reasons = [];
  const rewardDesign = input.rewardDesign;
  const rewardEconomy = input.rewardEconomy;
  const transactions = Array.isArray(rewardDesign?.acquisitionTransactions) ? rewardDesign.acquisitionTransactions : [];
  const transaction = transactions.length === 1 ? transactions[0] : null;
  const acquisitionTransactionRef = transaction?.transactionRef;
  const persistentStateRefs = Array.isArray(rewardDesign?.persistentStateRefs) ? rewardDesign.persistentStateRefs : [];
  const committedStateRefs = Array.isArray(transaction?.commitsPersistentStateRefs) ? transaction.commitsPersistentStateRefs : [];
  const functions = Array.isArray(rewardDesign?.rewardFunctions) ? rewardDesign.rewardFunctions : [];
  const economyRuleRef = rewardEconomy?.economyRuleRef;
  const protectedStoryOrderCheck = rewardEconomy?.protectedStoryOrderCheck;

  if (transactions.length !== 1 || !isExplicitRef(acquisitionTransactionRef)) reasons.push("exactly one explicit acquisition transaction is required");
  if (transaction?.atomicCommit !== true) reasons.push("the acquisition transaction must declare an atomic commit");
  if (!persistentStateRefs.length || persistentStateRefs.some((ref) => !isExplicitRef(ref))) reasons.push("one or more explicit persistent state refs are required");
  if (committedStateRefs.some((ref) => !isExplicitRef(ref)) || persistentStateRefs.some((ref) => !committedStateRefs.includes(ref))) reasons.push("the acquisition transaction must commit every declared persistent state ref");
  if (new Set(persistentStateRefs).size !== persistentStateRefs.length) reasons.push("persistent state refs must be unique");
  if (functions.length < 2) reasons.push("at least two explicit reward functions are required");

  const functionRefs = [];
  const dimensions = [];
  for (const fn of functions) {
    if (!isExplicitRef(fn?.functionRef)) reasons.push("every reward function needs an explicit function ref");
    else functionRefs.push(fn.functionRef);
    if (typeof fn?.functionalDimension !== "string" || fn.functionalDimension.trim().length < 2) reasons.push("every reward function needs a functional dimension");
    else dimensions.push(fn.functionalDimension.trim());
    if (!isExplicitRef(fn?.persistentStateRef) || !persistentStateRefs.includes(fn.persistentStateRef) || !committedStateRefs.includes(fn.persistentStateRef)) reasons.push("every reward function must bind a state committed by the acquisition transaction");
    if (!isExplicitRef(fn?.futureUseContextRef)) reasons.push("every reward function needs an explicit future-use context ref");
    if (!isExplicitRef(fn?.feedbackRef)) reasons.push("every reward function needs an explicit feedback ref");
    if (!actionabilityIncreases(fn?.actionabilityDelta)) reasons.push("every reward function needs a positive before/after actionability delta");
  }
  if (new Set(functionRefs).size !== functions.length) reasons.push("reward function refs must be explicit and unique");
  if (new Set(dimensions).size < 2) reasons.push("reward functions must span at least two distinct functional dimensions");
  if (!isExplicitRef(economyRuleRef)) reasons.push("an explicit economy rule ref is required");
  if (!Array.isArray(story.protectedCanon) || story.protectedCanon.length === 0) reasons.push("the story model must declare protected canon");
  if (protectedStoryOrderCheck?.status !== "pass" || !isExplicitRef(protectedStoryOrderCheck?.evidenceRef)) reasons.push("a passed, evidenced protected-story-order check is required");

  const uniqueReasons = [...new Set(reasons)];
  return {
    complete: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    parameterBindings: uniqueReasons.length ? null : {
      "parameter.future-reward.acquisition-transaction": acquisitionTransactionRef,
      "parameter.future-reward.persistent-state-set": canonicalRefArray(persistentStateRefs),
      "parameter.future-reward.function-set": canonicalRefArray(functionRefs),
      "parameter.future-reward.economy": economyRuleRef
    }
  };
}

const rewardManualBindings = resolveRewardManualBindings();

// Production retrieval is deliberately index-first. Raw observations and title
// dossiers are never opened here. Only full pattern records in the deterministic
// shortlist are admitted to scoring and generation.
const retrievalIndex = JSON.parse(await readFile(path.join(libraryRoot, "indexes", "retrieval-index.json"), "utf8"));
if (retrievalIndex.packRef !== "pack.zelda-mainline@0.3.0") throw new Error(`Unsupported retrieval index pack ${retrievalIndex.packRef}.`);
const productionPatternIds = new Set(retrievalIndex.records.map((record) => record.patternId));
if (productionPatternIds.size !== retrievalIndex.records.length) throw new Error("Production retrieval index contains duplicate pattern IDs.");
const roughRanked = retrievalIndex.records.map((record) => {
  const signalMatches = (record.storySignals ?? []).filter((signal) => storySignals.includes(signal)).length;
  const spatialMatches = (record.spatialSignals ?? []).filter((signal) => spatialSignals.includes(signal)).length;
  const goalMatches = (record.experienceGoals ?? []).filter((goal) => goals.includes(goal)).length;
  const missingCapabilities = (record.runtimeCapabilities ?? []).filter((capability) => !runtimeSet.has(capability)).length;
  const roughScore = signalMatches * 5 + spatialMatches * 3 + goalMatches * 2 - missingCapabilities * 8;
  return { patternId: record.patternId, roughScore, signalMatches, spatialMatches, missingCapabilities };
}).sort((a, b) => b.roughScore - a.roughScore || a.patternId.localeCompare(b.patternId));
const causallyMatched = roughRanked.filter((item) => item.signalMatches >= 2 && item.missingCapabilities === 0);
const shortlist = [...causallyMatched.slice(0, 16)];
for (const item of roughRanked) {
  if (shortlist.length >= 16) break;
  if (!shortlist.some((candidate) => candidate.patternId === item.patternId)) shortlist.push(item);
}
const shortlistIds = new Set(shortlist.map((item) => item.patternId));
const patternRegistry = JSON.parse(await readFile(path.join(libraryRoot, "packs", "zelda-mainline", "patterns", "released-patterns.json"), "utf8"));
const productionRefs = (refs) => [...new Set((refs ?? []).filter((patternId) => productionPatternIds.has(patternId)))];
const patterns = patternRegistry
  .filter((pattern) => shortlistIds.has(pattern.patternId))
  .map((pattern) => {
    if (!productionPatternIds.has(pattern.patternId) || pattern.status !== "released" || pattern.autoSelectable !== true) {
      throw new Error(`Production shortlist admitted a non-released pattern: ${pattern.patternId}.`);
    }
    const sanitized = structuredClone(pattern);
    sanitized.selection.exclusiveWith = productionRefs(sanitized.selection.exclusiveWith);
    sanitized.composition.dependencies = productionRefs(sanitized.composition.dependencies);
    sanitized.composition.conflicts = productionRefs(sanitized.composition.conflicts);
    sanitized.composition.synergies = productionRefs(sanitized.composition.synergies);
    return sanitized;
  });
if (patterns.length !== shortlistIds.size) throw new Error("Production retrieval index referenced a pattern missing from the reviewed registry.");
if (patterns.length < 3) throw new Error(`Retrieval shortlist produced only ${patterns.length} full candidates.`);

function candidate(pattern) {
  const expectedSignals = pattern.selection.storySignals.map((rule) => rule.expected);
  const matches = expectedSignals.filter((signal) => storySignals.includes(signal));
  const spatialExpected = pattern.selection.spatialSignals.flatMap((rule) => Array.isArray(rule.expected) ? rule.expected : [rule.expected]).filter(Boolean);
  const spatialMatches = spatialExpected.filter((signal) => spatialSignals.includes(signal));
  const goalMatches = pattern.intent.experienceGoals.filter((goal) => goals.includes(goal));
  const missingCapabilities = pattern.implementation.runtimeCapabilities.filter((capability) => !runtimeSet.has(capability));
  const requiredAdapter = input.productProfile?.adapterId ?? (input.productProfile?.id === "product-profile.v021-topdown-pixel" ? "adapter.2d-topdown-v021" : null);
  const adapterCompatible = !requiredAdapter || pattern.implementation.perspectiveAdapters.includes(requiredAdapter);
  const storyRelevance = round(5 * matches.length / expectedSignals.length);
  const dramaticIntegration = round(Math.min(5, 1.5 + goalMatches.length * 1.25 + (expectedSignals.some((signal) => ["signal.embodied-secret", "signal.relationship-memory"].includes(signal)) ? 1 : 0)));
  const systemicDepth = round(Math.min(5, 2 + pattern.effectPrimitives.length * 0.6 + (expectedSignals.includes("signal.multi-causal-problem") ? 1 : 0)));
  const stateCausality = round(Math.min(5, 2 + pattern.effectPrimitives.filter((effect) => !["emit-performance-cue", "camera-transition"].includes(effect.kind)).length));
  const spatialReinterpretation = round(Math.min(5, spatialMatches.length * 2 + (pattern.intent.experienceGoals.includes("experience.world-recontextualization") ? 1 : 0)));
  const runtimeFit = missingCapabilities.length ? round(Math.max(0, 5 - missingCapabilities.length * 2)) : 5;
  const costLevels = { low: 0, medium: 1, high: 2 };
  const budgetLevel = { small: 0, medium: 1, large: 2 }[input.budget] ?? 1;
  const peakCost = Math.max(...Object.values(pattern.implementation.productionCost).map((value) => costLevels[value]));
  const budgetFit = peakCost <= budgetLevel ? 5 : peakCost === budgetLevel + 1 ? 3 : 1;
  const originalityMargin = pattern.originality.requiredTransformationAxes.length >= 4 ? 5 : 3;
  const weightedTotal = round(storyRelevance * 0.25 + dramaticIntegration * 0.20 + systemicDepth * 0.15 + stateCausality * 0.10 + spatialReinterpretation * 0.10 + runtimeFit * 0.10 + budgetFit * 0.05 + originalityMargin * 0.05);
  const hardVetoes = [];
  if (missingCapabilities.length) hardVetoes.push("runtime-impossible");
  if (!adapterCompatible) hardVetoes.push("runtime-impossible");
  if (peakCost > budgetLevel + 1) hardVetoes.push("budget-impossible");
  if (!pattern.autoSelectable || pattern.status !== "released") hardVetoes.push("runtime-impossible");
  if (pattern.patternId === rewardPatternId && !rewardManualBindings.complete) hardVetoes.push("manual-binding-incomplete");
  const uniqueHardVetoes = [...new Set(hardVetoes)];
  const eligible = !disablePack && !lowInteraction && !uniqueHardVetoes.length && matches.length >= Math.min(2, expectedSignals.length) && weightedTotal >= 2.8;
  return {
    pattern,
    matches,
    missingCapabilities,
    eligible,
    output: {
      patternId: pattern.patternId, patternVersion: pattern.patternVersion,
      scores: { storyRelevance, dramaticIntegration, systemicDepth, stateCausality, spatialReinterpretation, runtimeFit, budgetFit, originalityMargin, weightedTotal },
      hardVetoes: uniqueHardVetoes, verdict: eligible ? "deferred" : "rejected",
      reasons: eligible
        ? [`Matched ${matches.length} causal story signals and passed runtime/originality prefilters.`]
        : [disablePack ? "The Zelda-derived pack is disabled by provenance policy." : lowInteraction ? "The source explicitly requires uninterrupted fixed-order language, so systemic selection must abstain." : pattern.patternId === rewardPatternId && !rewardManualBindings.complete ? `Reward 2.0 manual binding closure is incomplete: ${rewardManualBindings.reasons.join("; ")}.` : matches.length < 2 ? "Fewer than two causal story signals matched." : missingCapabilities.length ? `Runtime gaps: ${missingCapabilities.join(", ")}` : "Weighted fit remained below the calibrated threshold."]
    }
  };
}

const ranked = patterns.map(candidate).sort((a, b) => b.output.scores.weightedTotal - a.output.scores.weightedTotal || a.pattern.patternId.localeCompare(b.pattern.patternId));
const eligible = ranked.filter((item) => item.eligible);
const core = eligible.find((item) => item.pattern.selection.selectionRole === "core") ?? null;
const support = [];
const sharedExperienceAxis = core?.pattern.intent.experienceGoals.find((goal) => goals.includes(goal)) ?? null;
if (core) {
  for (const item of eligible.filter((candidate) => candidate !== core && ["support", "specialization", "orchestration"].includes(candidate.pattern.selection.selectionRole))) {
    if (support.length >= Math.min(3, core.pattern.selection.maxCoSelections)) break;
    if (item.pattern.selection.maxCoSelections === 0) continue;
    if (core.pattern.composition.conflicts.includes(item.pattern.patternId) || item.pattern.composition.conflicts.includes(core.pattern.patternId)) continue;
    const selectedIds = new Set([core.pattern.patternId, ...support.map((entry) => entry.pattern.patternId)]);
    if (item.pattern.composition.dependencies.some((dependency) => !selectedIds.has(dependency))) continue;
    if (item.pattern.selection.exclusiveWith.some((patternId) => selectedIds.has(patternId)) || [core, ...support].some((selectedItem) => selectedItem.pattern.selection.exclusiveWith.includes(item.pattern.patternId))) continue;
    if (!sharedExperienceAxis || !item.pattern.intent.experienceGoals.includes(sharedExperienceAxis)) continue;
    const alreadyKinds = new Set([core.pattern.kind, ...support.map((entry) => entry.pattern.kind)]);
    const explicitSynergy = core.pattern.composition.synergies.includes(item.pattern.patternId) || item.pattern.composition.synergies.includes(core.pattern.patternId);
    if (explicitSynergy || !alreadyKinds.has(item.pattern.kind)) support.push(item);
  }
}
const selected = core ? [core, ...support] : [];
for (const item of selected) item.output.verdict = "selected";
const consideredSource = [...ranked.slice(0, 12)];
for (const item of selected) if (!consideredSource.includes(item)) consideredSource.push(item);
const considered = consideredSource.map((item) => item.output);

function parameterValue(parameter, patternSlug, patternId) {
  if (patternId === rewardPatternId && rewardManualValueTypes.has(parameter.valueType)) {
    return rewardManualBindings.parameterBindings?.[parameter.parameterId] ?? null;
  }
  if (rewardManualValueTypes.has(parameter.valueType)) return null;
  const first = (value) => Array.isArray(value) ? value[0] : value;
  const ref = (value, keys = []) => {
    const item = first(value);
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item);
    for (const key of keys) if (item?.[key] !== undefined) return String(item[key]);
    return item?.id ? String(item.id) : null;
  };
  const byType = {
    "actor-ref": ref(story.playerRole, ["characterId", "actorId"]) ?? ref(story.characters, ["characterId", "actorId"]),
    "location-ref": ref(story.locations, ["locationId"]),
    "fact-ref": ref(story.facts, ["factId"]) ?? ref(story.protectedCanon, ["factId"]),
    "beat-ref": ref(story.revealOrder, ["beatId", "revealId"]),
    "capability-ref": ref(input.runtimeCapabilities),
    "prop-ref": `prop.${patternSlug}.story-derived`,
    "route-ref": `route.${patternSlug}.story-derived`,
    "state-axis-ref": `state-axis.${patternSlug}.story-derived`,
    "anchor-ref": `anchor.${patternSlug}.story-derived`,
    "solution-ref": `solution.${patternSlug}.story-derived`,
    "object-role-ref": `object-role.${patternSlug}.story-derived`,
    "vehicle-ref": `vehicle.${patternSlug}.story-derived`,
    "reward-ref": `reward.${patternSlug}.story-derived`,
    "secret-ref": `secret.${patternSlug}.story-derived`,
    "region-ref": `region.${patternSlug}.story-derived`,
    "lesson-ref": `lesson.${patternSlug}.story-derived`,
    "cue-ref": `cue.${patternSlug}.story-derived`,
    "string": story.premise,
    "number": String(input.productionCharter?.targetDurationMinutes ?? 30),
    "boolean": "true"
  };
  return byType[parameter.valueType] ?? `${parameter.valueType}.${patternSlug}.story-derived`;
}

function application(item, role, index) {
  const pattern = item.pattern;
  const patternSlug = pattern.patternId.slice("pattern.".length);
  const applicationId = `application.${input.fixtureId.replace(/^fixture\./, "")}.${index + 1}`;
  if (pattern.patternId === rewardPatternId && !rewardManualBindings.complete) throw new Error(`${rewardPatternId}: manual-binding-incomplete`);
  const instantiatedParameters = Object.fromEntries(pattern.hooks.instantiate.parameters.map((parameter) => [parameter.parameterId, String(parameterValue(parameter, patternSlug, pattern.patternId) ?? "")]));
  const missingRequiredBindings = pattern.hooks.instantiate.parameters.filter((parameter) => parameter.required && !instantiatedParameters[parameter.parameterId]);
  if (missingRequiredBindings.length) throw new Error(`${pattern.patternId}: unresolved required parameters ${missingRequiredBindings.map((parameter) => parameter.parameterId).join(", ")}`);
  return {
    applicationId, patternId: pattern.patternId, patternVersion: pattern.patternVersion, role,
    originPackRefs: ["pack.zelda-mainline"], storyRefs: pattern.patternId === rewardPatternId
      ? ["storyModel.protectedCanon", "rewardDesign.acquisitionTransactions", "rewardDesign.persistentStateRefs", "rewardDesign.rewardFunctions", "rewardEconomy.protectedStoryOrderCheck"]
      : ["storyModel.facts", "storyModel.locations", "storyModel.revealOrder", "storyModel.protectedCanon"],
    retainedPrinciples: pattern.originality.retainedPrinciples,
    adaptationSummary: `Instantiate ${pattern.name} from the fixture’s own actors, locations, facts, and props while preserving its reveal order and changing all source-facing expression.`,
    discardedSurfaceDetails: pattern.originality.forbiddenSurfaceTransfers,
    hookBindings: [
      { hook:"detect", sourceRef:"storyModel.storySignals", targetOwner:"gameplay", targetContract:"gameplay-design/v03", targetPath:`$.patternApplications.${index}.detect` },
      { hook:"score", sourceRef:"productionCharter.experienceGoals", targetOwner:"evaluation", targetContract:"acceptance/v03", targetPath:`$.patternApplications.${index}.score` },
      { hook:"instantiate", sourceRef:pattern.patternId === rewardPatternId ? "rewardDesign+rewardEconomy" : "storyModel", targetOwner:"gameplay", targetContract:"gameplay-design/v03", targetPath:`$.patternApplications.${index}.parameters` },
      { hook:"emit", sourceRef:pattern.patternId, targetOwner:"stage", targetContract:"stage-plan/v03", targetPath:`$.patternApplications.${index}.effects` },
      { hook:"validate", sourceRef:pattern.tests[0].testId, targetOwner:"evaluation", targetContract:"acceptance/v03", targetPath:`$.patternApplications.${index}.assertions` }
    ],
    effectApplications: pattern.effectPrimitives.map((effect) => ({
      effectRef: effect.effectId,
      parameterBindings: instantiatedParameters,
      expectedPostconditions: effect.postconditions
    })),
    runtimeMapping: pattern.implementation.runtimeCapabilities,
    evidenceInOutput: ["gameplay-design.json world-state transaction", "performance-plan.json reveal-safe cue", "stage-plan.json before/after topology", "acceptance.json route and originality assertions"]
  };
}

const applications = selected.map((item, index) => application(item, index === 0 ? "core" : "support", index));
const allAssertionRefs = selected.flatMap((item) => item.pattern.hooks.validate.assertionRefs);
const validationRefs = allAssertionRefs.length ? allAssertionRefs : ["assertion.selection.abstained"];
const handoffs = ["gameplay", "performance", "stage", "evaluation"].map((owner) => ({
  handoffId: `handoff.${input.fixtureId.replace(/^fixture\./, "")}.${owner}`, owner,
  contractRef: `${owner === "stage" ? "stage-plan" : owner === "evaluation" ? "acceptance" : `${owner}-design`}/v03`,
  applicationRefs: applications.map((item) => item.applicationId),
  requirements: applications.length ? { corePatternRef: applications[0].patternId, preserveProtectedCanon: true, maximumSupportPatterns: 3 } : { abstained: true, useStoryDerivedNoPackDesign: true },
  validationRefs
}));

const result = {
  schemaVersion: "1.0.0", productionId: `production.benchmark.${input.fixtureId.replace(/^fixture\./, "")}`,
  storyModelHash: createHash("sha256").update(JSON.stringify(story)).digest("hex"),
  libraryLockRef: verifiedLock?.lock.lockId ?? "lock.benchmark-unlocked",
  provenancePolicy: verifiedLock?.lock.provenancePolicy ?? { enabledPackIds: disablePack ? [] : ["pack.zelda-mainline"], blockedPackIds: disablePack ? ["pack.zelda-mainline"] : [], allowCorePromotedFromBlockedPack: false },
  query: {
    storySignals, experienceGoals: goals, spatialConstraints: spatialSignals, runtimeCapabilities: input.runtimeCapabilities,
    budget: { design: input.budget === "small" ? "low" : "medium", code: "medium", art: "medium", qa: "high" },
    negativeSignals: lowInteraction ? ["signal.low-interaction-fit"] : []
  },
  consideredCandidates: considered,
  selectedApplications: applications,
  composition: {
    corePatternRef: applications[0]?.patternId ?? null,
    supportPatternRefs: applications.slice(1).map((item) => item.patternId),
    sharedExperienceAxis: sharedExperienceAxis ?? "",
    conflictsResolved: core ? ["Removed candidates that conflict with the selected core or duplicate an already represented pattern kind."] : [],
    developmentArc: core ? ["teach", "practice", "variation", "combine-or-reverse", "exam"] : []
  },
  runtimeAssessment: {
    satisfiedCapabilities: [...new Set(selected.flatMap((item) => item.pattern.implementation.runtimeCapabilities))],
    gaps: [], approvedFallbacks: []
  },
  originalityPlan: {
    transformationAxes: ["worldbuilding", "characters", "objects", "topology", "feedback", "narrative-causality"],
    structuralDeltas: ["topology-graph", "object-role-graph", "action-sequence", "feedback-signature", "narrative-function"],
    forbiddenTransfers: ["Nintendo names, characters, lore, dialogue, maps, puzzle steps, boss scripts, UI, music, symbols, and visual signatures"],
    blindSourceAttributionReview: "required",
    reviewChecks: ["A reviewer cannot reliably attribute the instance to one source encounter", "At least four transformation axes materially change", "Protected canon and reveal order remain unchanged"]
  },
  abstention: { abstained: !core, reason: core ? null : (disablePack ? "The requested inspiration pack is blocked by the production provenance policy." : lowInteraction ? "Interaction would damage the source’s fixed uninterrupted rhetorical form." : "No candidate passed causal-signal, runtime, budget, and originality thresholds.") },
  handoffs, status: core ? "draft" : "rejected"
};

if (outputPath) {
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(path.resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`);
} else console.log(JSON.stringify(result, null, 2));

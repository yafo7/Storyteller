import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const packRoot = path.join(libraryRoot, "packs", "zelda-mainline");
const patternRoot = path.join(packRoot, "patterns");
const load = async (target) => JSON.parse(await readFile(target, "utf8"));
const blueprints = await load(path.join(patternRoot, "pattern-blueprints.json"));
const maturity = await load(path.join(patternRoot, "maturity-contracts.json"));
const remediation = await load(path.join(patternRoot, "provenance-remediation-map.json"));
const quarantineRegister = await load(path.join(patternRoot, "quarantine-register.json"));
const observations = await load(path.join(packRoot, "observations", "observation-registry.json"));
const observationById = new Map(observations.map((item) => [item.observationId, item]));
const observationByWork = new Map();
for (const observation of observations) {
  if (!observationByWork.has(observation.workId)) observationByWork.set(observation.workId, []);
  observationByWork.get(observation.workId).push(observation);
}
const blueprintBySlug = new Map(blueprints.map((item) => [item.slug, item]));
const remediationByPattern = new Map(remediation.records.map((item) => [item.patternId, item]));
const quarantineByPattern = new Map(quarantineRegister.records.map((item) => [item.patternId, item]));
if (quarantineByPattern.size !== quarantineRegister.records.length) throw new Error("Quarantine register contains duplicate pattern IDs.");
const contractBySlug = new Map(Object.entries(maturity.patterns));
const matureBySlug = new Map([...contractBySlug].filter(([, contract]) => contract.maturity === "release-candidate"));
const allowedFeedback = new Set(["visual", "audio", "animation", "camera", "ui", "dialogue", "navigation", "haptics"]);
const feedbackAlias = { accessibility: "ui", blocking: "animation", environment: "visual", journal: "ui", map: "navigation", performance: "animation" };
const spatialSignalIds = new Set(["signal.revisited-place", "signal.parallel-state", "signal.landmark-mystery", "signal.confined-stage", "signal.transformable-environment", "signal.route-network", "signal.open-exploration"]);
const fingerprintRefs = [
  "fingerprint.no-source-room-topology",
  "fingerprint.no-source-object-sequence",
  "fingerprint.no-source-boss-script",
  "fingerprint.no-proprietary-surface",
  "fingerprint.blind-attribution-unstable"
];
const transformationAxes = new Set(["worldbuilding", "characters", "objects", "topology", "feedback", "narrative-causality", "timing", "visual-language", "audio-language", "control-language"]);
const capabilityAliases = {
  "capability.interaction-prompts": ["capability.context-interaction"],
  "capability.contextual-prompts": ["capability.context-interaction"],
  "capability.interaction-windows": ["capability.context-interaction", "capability.performance-cues"],
  "capability.actor-memory": ["capability.npc-state"],
  "capability.actor-schedules": ["capability.npc-state", "capability.schedule-clock"],
  "capability.dialogue-conditions": ["capability.dialogue-gates"],
  "capability.world-state-transactions": ["capability.world-facts"],
  "capability.map-state-variants": ["capability.map-layers"],
  "capability.camera-directives": ["capability.camera-cues"],
  "capability.route-graphs": ["capability.route-gates", "capability.route-simulation"],
  "capability.map-discovery": ["capability.map-layers", "capability.spatial-query"],
  "capability.encounters": ["capability.context-interaction", "capability.npc-state"],
  "capability.resource-state": ["capability.world-facts", "capability.inventory"]
};

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null))];
}

async function atomicJson(target, value) {
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

function chooseObservation(workId, dimensions) {
  const options = observationByWork.get(workId) ?? [];
  return options.find((item) => item.dimensionIds.some((dimensionId) => dimensions.includes(dimensionId))) ?? options[0];
}

function conditionText(condition) {
  if (typeof condition === "string") return condition;
  const expected = condition.expectedRef !== undefined
    ? `reference ${condition.expectedRef}`
    : condition.expected !== undefined
      ? JSON.stringify(condition.expected)
      : "the declared application value";
  return `${condition.path} must satisfy ${condition.operator} against ${expected} before the authored transaction is accepted.`;
}

function normalizeTransformationAxes(values) {
  const mapped = values.map((axis) => {
    if (transformationAxes.has(axis)) return axis;
    if (/(?:cast|player-role|blocking)/.test(axis)) return "characters";
    if (/(?:object|vehicle|reward|economy|resource)/.test(axis)) return "objects";
    if (/(?:topology|spatial|landmark|traversal)/.test(axis)) return "topology";
    if (/(?:audio)/.test(axis)) return "audio-language";
    if (/(?:visual|camera|clue|dialogue|feedback)/.test(axis)) return "visual-language";
    if (/(?:verb|control|challenge)/.test(axis)) return "control-language";
    return "narrative-causality";
  });
  return unique([...mapped, "worldbuilding", "characters", "objects", "topology", "feedback", "narrative-causality"]);
}

function normalizeRollback(mode) {
  if (mode === "reversible" || mode === "checkpoint-only" || mode === "irreversible-after-gate") return mode;
  if (/irreversible/.test(mode)) return "irreversible-after-gate";
  if (/(?:checkpoint|persistent|replay-safe|streaming-safe)/.test(mode)) return "checkpoint-only";
  return "reversible";
}

function normalizeCapabilities(values) {
  return unique(values.flatMap((capability) => capabilityAliases[capability] ?? [capability]));
}

function detectOperator(value) {
  // The formal contract supports the maturity vocabulary directly. Do not
  // weaken boundary or collection semantics while lowering the contract.
  return value;
}

function valueType(value) {
  if (Array.isArray(value)) return "string-array";
  if (value === null) return "object";
  if (["string", "number", "boolean"].includes(typeof value)) return typeof value;
  return "object";
}

function makeRule(slug, group, index, source) {
  return {
    ruleId: `rule.${slug}.${group}.${index + 1}`,
    sourcePath: source.path ?? "$.storyModel.storySignals",
    operator: detectOperator(source.operator ?? "contains"),
    valueType: valueType(source.value),
    expected: source.value
  };
}

function signalRules(blueprint, contract) {
  const explicit = contract?.selection.requiredSignals.filter((item) => typeof item.value === "string" && item.value.startsWith("signal.")) ?? [];
  const signals = unique([...explicit.map((item) => item.value), ...blueprint.signals]);
  const story = signals.map((signal, index) => makeRule(blueprint.slug, "story", index, { path: "$.storyModel.storySignals", operator: "contains", value: signal }));
  const spatial = signals.filter((signal) => spatialSignalIds.has(signal)).map((signal, index) => makeRule(blueprint.slug, "spatial", index, { path: "$.storyModel.spatialSignals", operator: "contains", value: signal }));
  return { story, spatial };
}

function maturityTests(slug, contract) {
  return contract.tests.map((test) => ({
    testId: test.testId,
    kind: test.kind,
    inputFixtureRef: test.fixtureRef,
    expectedOutputRefs: [`${test.kind}-gate.json`],
    assertions: test.assertions.map((assertion, index) => ({
      assertionId: `assertion.${slug}.${test.kind}.${index + 1}`,
      evidencePath: assertion.path,
      operator: assertion.operator,
      expected: assertion.expected,
      hardGate: true
    }))
  }));
}

function maturePattern(blueprint, contract) {
  const slug = blueprint.slug;
  const rules = signalRules(blueprint, contract);
  const detectRules = contract.selection.requiredSignals.map((item, index) => makeRule(slug, "contract", index, item));
  const normalizedAxes = normalizeTransformationAxes(contract.originality.requiredTransformationAxes);
  const effects = contract.effects.map((effect) => ({
    effectId: effect.effectId,
    kind: effect.kind,
    preconditions: effect.preconditions.map(conditionText),
    parameters: effect.parameterRefs,
    postconditions: effect.postconditions.map((condition) => `${conditionText(condition)} This realizes the distinct ${contract.subtype} causal contract.`),
    observableFeedback: unique(effect.feedback.map((item) => allowedFeedback.has(item.channel) ? item.channel : feedbackAlias[item.channel] ?? "visual")),
    rollback: normalizeRollback(effect.rollback.mode)
  }));
  const assertionRefs = contract.tests.flatMap((test) => test.assertions.map((_, index) => `assertion.${slug}.${test.kind}.${index + 1}`));
  const mappings = ["gameplay", "performance", "stage", "compile", "evaluation"].map((owner) => ({
    mappingId: `mapping.${slug}.${owner}`,
    owner,
    contractRef: owner === "compile" ? "production-ir/v03" : `${owner === "evaluation" ? "acceptance" : owner === "stage" ? "stage-plan" : `${owner}-design`}/v03`,
    targetPath: `$.patternApplications.${slug}.${owner}`,
    effectRefs: owner === "evaluation" ? [] : effects.map((effect) => effect.effectId),
    constraintRefs: [`constraint.${slug}.canon`, `constraint.${slug}.originality`, `constraint.${slug}.recovery`, ...contract.parameters.filter((item) => item.required).map((item) => item.parameterId)]
  }));
  const role = contract.selectionRole === "supporting" ? "support" : contract.selectionRole;
  const counter = contract.evidence.counter;
  const selectionPrecedence = [
    `Priority ${contract.selection.precedence.priority}: ${contract.selection.precedence.tieBreak}`,
    ...(contract.selection.precedence.before.length ? [`Evaluate before ${contract.selection.precedence.before.join(", ")}.`] : []),
    ...(contract.selection.precedence.after.length ? [`Evaluate after ${contract.selection.precedence.after.join(", ")}.`] : [])
  ];
  const negativeSignals = contract.selection.negativeSignals.map((item) => `${item.path} ${item.operator} ${JSON.stringify(item.value)}`);
  const patternVersion = contract.patternVersion ?? maturity.targetPatternVersion;
  const changelog = patternVersion === "2.0.0"
    ? [
        "1.1.0 — legacy optional-choice contract retained only as migration input.",
        "2.0.0 — breaking release requires an explicit acquisition transaction, persistent state set, at least two distinct future-use functions, actionability evidence, and manual re-instantiation through migration.pattern.reward-expands-future-possibility.1.1.0-to-2.0.0."
      ]
    : [`${patternVersion} — released from a pattern-specific maturity contract after provenance remediation and static originality review.`];
  return {
    schemaVersion: "1.0.0",
    patternId: contract.patternId,
    patternVersion,
    name: contract.name,
    kind: blueprint.kind,
    status: "released",
    supportClass: "cross-title",
    autoSelectable: true,
    quarantineReason: null,
    quarantineIssueRefs: [],
    quarantineEvidenceDisposition: null,
    promotionRequirements: null,
    flavorClass: blueprint.flavorClass,
    intent: { designProblem: blueprint.designProblem, experienceGoals: blueprint.goals, principle: contract.originality.retainedPrinciple },
    selection: {
      familyId: contract.familyId,
      selectionRole: role,
      subtypeId: contract.subtype,
      exclusiveWith: [...contract.composition.conflicts],
      precedence: selectionPrecedence,
      maxCoSelections: contract.selection.maxCoSelections,
      storySignals: rules.story,
      spatialSignals: rules.spatial,
      prerequisites: contract.selection.requiredSignals.map((item) => `${item.path} must satisfy ${item.operator} ${JSON.stringify(item.value)}.`),
      contraindications: [...contract.selection.hardVetoes, ...negativeSignals],
      abstainWhen: contract.selection.hardVetoes
    },
    effectPrimitives: effects,
    hooks: {
      detect: { rules: detectRules, minimumMatches: detectRules.length },
      score: {
        criteria: contract.selection.scoreCriteria.map((criterion) => ({
          criterionId: `criterion.${criterion.criterionId.replace(/^score\./, "")}`,
          weight: criterion.weight,
          evidencePath: criterion.path,
          rule: criterion.rule
        })),
        hardVetoes: contract.selection.hardVetoes
      },
      instantiate: {
        parameters: contract.parameters.map((parameter) => structuredClone(parameter)),
        minimumTransformationAxes: Math.max(4, normalizedAxes.length)
      },
      emit: { mappings },
      validate: { assertionRefs }
    },
    departmentContracts: {
      gameplay: {
        playerVerbs: contract.departments.gameplay.verbs,
        effectRefs: effects.map((effect) => effect.effectId),
        canonInvariants: contract.departments.gameplay.invariants
      },
      performance: {
        revealConstraints: contract.departments.performance.revealRules,
        npcTactics: [`Stage actor tactics so that ${contract.departments.performance.cueIntent}`],
        interactionWindows: contract.departments.performance.interactionWindows,
        cueIntents: [contract.departments.performance.cueIntent, ...contract.departments.performance.beatPositions],
        skipReplayAccessibility: ["Skipping or replaying a cue must commit the same authoritative world facts.", "Essential causal information remains available through a replayable original-language log."]
      },
      stage: {
        topologyChanges: contract.departments.stage.topologyRequirements,
        actorBlocking: [contract.departments.stage.blocking],
        cameraTransitions: [contract.departments.stage.camera],
        navigationInvariants: contract.departments.stage.navigationAssertions
      },
      evaluation: {
        observableAssertionRefs: assertionRefs,
        routeRequirements: contract.departments.stage.navigationAssertions,
        cloneRiskChecks: [...contract.originality.forbiddenTransfers, "Independent blind reviewers must not converge on one source encounter with high confidence."]
      }
    },
    development: Object.fromEntries(Object.entries(contract.development).map(([stage, record]) => [stage, [record.task, `Success evidence: ${record.successEvidence}`, `Recovery: ${record.failureRecovery}`]])),
    implementation: {
      runtimeCapabilities: normalizeCapabilities(contract.runtime.capabilities),
      perspectiveAdapters: ["adapter.2d-topdown-v021"],
      productionCost: contract.runtime.cost,
      fallbacks: [contract.runtime.fallback],
      accessibility: contract.runtime.accessibility
    },
    composition: {
      dependencies: [...contract.composition.dependencies],
      synergies: [...contract.composition.synergies],
      conflicts: [...contract.composition.conflicts],
      failureModes: contract.composition.failureModes,
      recoveryRules: contract.composition.recovery
    },
    originality: {
      retainedPrinciples: [contract.originality.retainedPrinciple],
      forbiddenSurfaceTransfers: contract.originality.forbiddenTransfers,
      requiredTransformationAxes: normalizedAxes,
      structuralDeltaAxes: Object.keys(contract.originality.structuralDeltaThresholds).map((axis) => ({ topologyGraph: "topology-graph", objectRoleGraph: "object-role-graph", actionSequence: "action-sequence", feedbackSignature: "feedback-signature", narrativeFunction: "narrative-function" })[axis]),
      sourceFingerprintRefs: fingerprintRefs,
      compositionVetoRefs: ["fingerprint.no-source-object-sequence", "fingerprint.blind-attribution-unstable"],
      blindSourceAttributionRequired: true,
      cloneRiskChecks: [...contract.originality.forbiddenTransfers, ...contract.originality.combinationVetoes.map((item) => `Veto ${item.with.join(" + ")} when ${item.vetoWhen}`)]
    },
    provenance: {
      originPackRefs: ["pack.zelda-mainline"],
      observationRefs: contract.evidence.supports.map((item) => item.observationRef),
      supportingWorkRefs: contract.evidence.supports.map((item) => item.workRef),
      counterEvidenceRefs: [counter.evidenceRef],
      counterEvidenceBounds: [{
        evidenceRef: counter.evidenceRef,
        challengedAssumption: counter.challengedAssumption,
        observedBoundary: counter.boundary,
        derivedRule: counter.derivedAbstention
      }],
      confidence: "high"
    },
    tests: maturityTests(slug, contract),
    governance: {
      owner: "Pattern distiller",
      reviewers: ["Independent provenance reviewer", "Static originality reviewer", "Runtime adapter reviewer"],
      changelog,
      supersedes: [],
      deprecatedBy: null
    }
  };
}

function researchEvidence(blueprint) {
  const patternId = `pattern.${blueprint.slug}`;
  const reviewed = remediationByPattern.get(patternId);
  if (reviewed) return {
    observationRefs: reviewed.observationRefs,
    supportingWorkRefs: reviewed.supportingWorkRefs,
    counterEvidenceRefs: reviewed.counterEvidenceRefs,
    counterRationale: reviewed.counterRationale,
    supportClass: reviewed.decision === "demote" ? "single-title-research-only" : "cross-title",
    decision: reviewed.decision
  };
  const selected = blueprint.supportWorks.map((workId) => chooseObservation(workId, blueprint.dimensions)).filter(Boolean);
  const counter = chooseObservation(blueprint.counterWork, blueprint.dimensions);
  const supportingWorkRefs = unique(selected.map((item) => item.workId));
  return {
    observationRefs: unique(selected.map((item) => item.observationId)),
    supportingWorkRefs,
    counterEvidenceRefs: counter ? [counter.observationId] : [],
    counterRationale: blueprint.counterLimit,
    supportClass: supportingWorkRefs.length === 1 ? "single-title-research-only" : "cross-title",
    decision: "retain"
  };
}

function researchPattern(blueprint) {
  const slug = blueprint.slug;
  const patternId = `pattern.${slug}`;
  const evidence = researchEvidence(blueprint);
  const quarantine = quarantineByPattern.get(patternId);
  if (!quarantine) throw new Error(`${patternId}: reviewed pattern is missing from quarantine-register.json.`);
  const rules = signalRules(blueprint, null);
  const parameterIds = [`parameter.${slug}.actor`, `parameter.${slug}.location`, `parameter.${slug}.fact`, `parameter.${slug}.prop`];
  const parameters = [
    { parameterId: parameterIds[0], valueType: "actor-ref", bindFrom: "story-model", sourcePath: "$.characters[*]", required: true, constraints: ["Bind only a story-model actor supported by the reviewed hypothesis."] },
    { parameterId: parameterIds[1], valueType: "location-ref", bindFrom: "story-model", sourcePath: "$.locations[*]", required: true, constraints: ["Bind only a story-derived location; source topology is forbidden."] },
    { parameterId: parameterIds[2], valueType: "fact-ref", bindFrom: "story-model", sourcePath: "$.facts[*]", required: true, constraints: ["Preserve the approved fact and reveal order while the record remains quarantined."] },
    { parameterId: parameterIds[3], valueType: "prop-ref", bindFrom: "designer-decision", sourcePath: "$.storyDerivedProps[*]", required: false, constraints: ["Any prop expression must be original and story-derived."] }
  ];
  const effects = blueprint.effects.map((kind, index) => ({
    effectId: `effect.${slug}.${index + 1}`,
    kind,
    preconditions: [`The ${blueprint.name} research hypothesis is active and all protected canon gates remain closed.`],
    parameters: parameterIds.slice(0, 3),
    postconditions: [`The research-only ${kind} hypothesis records an observable ${slug} state delta for later adjudication.`],
    observableFeedback: ["visual", "navigation"],
    rollback: ["set-fact", "grant-item", "consume-item", "set-checkpoint"].includes(kind) ? "checkpoint-only" : "reversible"
  }));
  const assertionIds = [`assertion.${slug}.schema`, `assertion.${slug}.quarantine`, `assertion.${slug}.register`];
  const mappings = ["gameplay", "performance", "stage", "compile", "evaluation"].map((owner) => ({
    mappingId: `mapping.${slug}.${owner}`,
    owner,
    contractRef: `${owner}/v03-research`,
    targetPath: `$.researchPatterns.${slug}.${owner}`,
    effectRefs: owner === "evaluation" ? [] : effects.map((effect) => effect.effectId),
    constraintRefs: [`constraint.${slug}.non-selectable`, ...parameterIds.slice(0, 3)]
  }));
  const counterBounds = evidence.counterEvidenceRefs.map((ref) => ({
    evidenceRef: ref,
    challengedAssumption: `The current abstraction for ${blueprint.name} may generalize beyond the evidence actually reviewed.`,
    observedBoundary: evidence.counterRationale,
    derivedRule: `Keep ${blueprint.name} outside production retrieval until its boundary and implementation contract pass independent review.`
  }));
  const quarantineReason = quarantine.quarantineReason;
  return {
    schemaVersion: "1.0.0", patternId, patternVersion: "1.0.0", name: blueprint.name, kind: blueprint.kind,
    status: "reviewed", supportClass: evidence.supportClass, autoSelectable: false, quarantineReason,
    quarantineIssueRefs: structuredClone(quarantine.quarantineIssueRefs),
    quarantineEvidenceDisposition: quarantine.evidenceDisposition,
    promotionRequirements: quarantine.promotionRequires,
    flavorClass: blueprint.flavorClass,
    intent: { designProblem: blueprint.designProblem, experienceGoals: blueprint.goals, principle: blueprint.principle },
    selection: {
      familyId: `family.research.${blueprint.kind}`,
      selectionRole: "support",
      subtypeId: `research-${slug}`,
      exclusiveWith: [],
      precedence: [`Do not evaluate ${patternId} in production; revisit only after its named quarantine reason is independently closed.`],
      maxCoSelections: 0,
      storySignals: rules.story,
      spatialSignals: rules.spatial,
      prerequisites: ["Independent maturity review and blind originality evidence are required before release."],
      contraindications: [blueprint.counterLimit],
      abstainWhen: [quarantineReason]
    },
    effectPrimitives: effects,
    hooks: {
      detect: { rules: rules.story, minimumMatches: Math.min(2, rules.story.length) },
      score: { criteria: [{ criterionId: `criterion.${slug}.research-evidence`, weight: 1, evidencePath: "$.researchReview", rule: "Research-only records receive no production score until independent maturity review closes the quarantine." }], hardVetoes: ["quarantined-research-record"] },
      instantiate: { parameters, minimumTransformationAxes: 4 },
      emit: { mappings },
      validate: { assertionRefs: assertionIds }
    },
    departmentContracts: {
      gameplay: { playerVerbs: blueprint.verbs, effectRefs: effects.map((item) => item.effectId), canonInvariants: ["Research records may not be instantiated into production output."] },
      performance: { revealConstraints: ["Do not use this research record to alter reveal order."], npcTactics: [], interactionWindows: ["No production interaction window is emitted while quarantined."], cueIntents: ["Retain only enough intent to support future review."], skipReplayAccessibility: ["No production cue is emitted while quarantined."] },
      stage: { topologyChanges: [], actorBlocking: [], cameraTransitions: [], navigationInvariants: ["No production topology is emitted while quarantined."] },
      evaluation: { observableAssertionRefs: assertionIds, routeRequirements: ["Any future release must prove before-and-after reachability."], cloneRiskChecks: ["Any future release must pass independent blind attribution."] }
    },
    development: {
      teach: ["A future maturity contract must define one safe, observable introduction."],
      practice: ["A future maturity contract must define deliberate rule confirmation."],
      variation: ["A future maturity contract must distinguish repetition from variation."],
      combineOrReverse: ["A future maturity contract must state composition precedence and vetoes."],
      exam: ["A future maturity contract must define a no-new-rule examination and recovery path."]
    },
    implementation: {
      runtimeCapabilities: blueprint.capabilities,
      perspectiveAdapters: ["adapter.2d-topdown-v021"],
      productionCost: { design: "medium", code: "medium", art: "medium", qa: "high" },
      fallbacks: ["No automatic fallback is allowed while this record remains quarantined."],
      accessibility: ["Future applications must provide non-color feedback and bounded retry time."]
    },
    composition: { dependencies: [], synergies: [], conflicts: [], failureModes: ["Premature production selection would convert an unreviewed analogy into a game rule."], recoveryRules: ["Remove the record from composition and return to story-derived design."] },
    originality: {
      retainedPrinciples: [blueprint.principle],
      forbiddenSurfaceTransfers: ["Source names, characters, lore, dialogue, maps, room layouts, object sequences, UI, music, and audiovisual signatures."],
      requiredTransformationAxes: ["worldbuilding", "characters", "objects", "topology", "feedback", "narrative-causality"],
      structuralDeltaAxes: ["topology-graph", "object-role-graph", "action-sequence", "feedback-signature", "narrative-function"],
      sourceFingerprintRefs: fingerprintRefs,
      compositionVetoRefs: ["fingerprint.no-source-object-sequence", "fingerprint.blind-attribution-unstable"],
      blindSourceAttributionRequired: true,
      cloneRiskChecks: ["Future release requires independent blind attribution and at least four material transformation axes."]
    },
    provenance: {
      originPackRefs: ["pack.zelda-mainline"], observationRefs: evidence.observationRefs, supportingWorkRefs: evidence.supportingWorkRefs,
      counterEvidenceRefs: evidence.counterEvidenceRefs, counterEvidenceBounds: counterBounds,
      confidence: evidence.supportClass === "single-title-research-only" ? "low" : "medium"
    },
    tests: [{
      testId: `test.${slug}.research-quarantine`, kind: "schema", inputFixtureRef: blueprint.fixture,
      expectedOutputRefs: ["research-quarantine-report.json"],
      assertions: [
        { assertionId: assertionIds[0], evidencePath: "$.schemaValid", operator: "equals", expected: true, hardGate: true },
        { assertionId: assertionIds[1], evidencePath: "$.autoSelectable", operator: "equals", expected: false, hardGate: true },
        { assertionId: assertionIds[2], evidencePath: "$.quarantineIssueRefs", operator: "contains", expected: quarantine.quarantineIssueRefs[0], hardGate: true }
      ]
    }],
    governance: {
      owner: "Pattern research curator", reviewers: ["Independent provenance reviewer", "Originality reviewer"],
      changelog: ["1.0.0 — retained as a non-selectable reviewed research record after the first P4 release audit."], supersedes: [], deprecatedBy: null
    }
  };
}

const expectedMature = [
  "capability-recontextualizes-old-space", "state-axis-rewrites-routes", "parallel-state-comparison", "landmark-promises-future-use",
  "local-rule-development-arc", "object-role-composition", "constrained-vehicle-route", "reward-expands-future-possibility",
  "optional-secret-readability", "npc-reacts-to-world-state", "embodied-world-change-reveal", "action-first-onboarding", "dense-overworld-as-challenge-space"
];
if (JSON.stringify([...matureBySlug.keys()]) !== JSON.stringify(expectedMature)) throw new Error("The maturity contract must contain the independently approved 13-pattern release set in canonical order.");
for (const slug of ["knowledge-gated-revisit", "multi-solution-state-graph"]) {
  if (contractBySlug.get(slug)?.maturity !== "reviewed") throw new Error(`${slug}: rejected release candidate must remain an archived reviewed contract.`);
}
for (const slug of expectedMature) if (!blueprintBySlug.has(slug)) throw new Error(`Maturity contract lacks a matching blueprint: ${slug}`);
const expectedQuarantined = blueprints.filter((blueprint) => !matureBySlug.has(blueprint.slug)).map((blueprint) => `pattern.${blueprint.slug}`).sort();
const registeredQuarantined = [...quarantineByPattern.keys()].sort();
if (JSON.stringify(expectedQuarantined) !== JSON.stringify(registeredQuarantined)) throw new Error("Quarantine register must exactly cover the independently adjudicated 23 reviewed patterns.");

const patterns = blueprints.map((blueprint) => matureBySlug.has(blueprint.slug)
  ? maturePattern(blueprint, matureBySlug.get(blueprint.slug))
  : researchPattern(blueprint));
const patternById = new Map(patterns.map((item) => [item.patternId, item]));

// Conflicts and selection exclusions are symmetric contracts. Preserve explicit
// maturity conflicts and close their inverse edge across the full 36-record set.
for (const pattern of patterns) {
  for (const ref of [...pattern.composition.conflicts]) {
    const peer = patternById.get(ref);
    if (!peer) throw new Error(`${pattern.patternId}: unknown conflict ${ref}`);
    if (!peer.composition.conflicts.includes(pattern.patternId)) peer.composition.conflicts.push(pattern.patternId);
  }
}
for (const pattern of patterns) {
  pattern.composition.conflicts = unique(pattern.composition.conflicts).sort();
  pattern.selection.exclusiveWith = [...pattern.composition.conflicts];
  pattern.composition.dependencies = unique(pattern.composition.dependencies);
  pattern.composition.synergies = unique(pattern.composition.synergies);
  const contradictoryRelations = pattern.composition.synergies.filter((ref) => pattern.composition.conflicts.includes(ref));
  if (contradictoryRelations.length) throw new Error(`${pattern.patternId}: composition relation cannot be both synergy and conflict: ${contradictoryRelations.join(", ")}`);
  for (const ref of [...pattern.composition.dependencies, ...pattern.composition.synergies, ...pattern.composition.conflicts]) {
    if (!patternById.has(ref)) throw new Error(`${pattern.patternId}: unknown composition reference ${ref}`);
  }
}

for (const pattern of patterns) {
  for (const ref of pattern.provenance.observationRefs) {
    const observation = observationById.get(ref);
    if (!observation) throw new Error(`${pattern.patternId}: unknown observation ${ref}`);
    if (!pattern.provenance.supportingWorkRefs.includes(observation.workId)) throw new Error(`${pattern.patternId}: observation/work closure failed for ${ref}`);
  }
  const derivedWorks = unique(pattern.provenance.observationRefs.map((ref) => observationById.get(ref).workId)).sort();
  const declaredWorks = [...pattern.provenance.supportingWorkRefs].sort();
  if (JSON.stringify(derivedWorks) !== JSON.stringify(declaredWorks)) throw new Error(`${pattern.patternId}: supporting work set is not exact.`);
}

const relationPairs = [
  ["capability-recontextualizes-old-space", "landmark-promises-future-use", "synergizes-with"],
  ["state-axis-rewrites-routes", "parallel-state-comparison", "synergizes-with"],
  ["safe-rule-experiment", "local-rule-development-arc", "specializes"],
  ["local-rule-development-arc", "boss-rule-synthesis", "synergizes-with"],
  ["npc-reacts-to-world-state", "embodied-world-change-reveal", "synergizes-with"],
  ["final-exam-recombination", "local-rule-development-arc", "composed-of"],
  ["systemic-verb-toolkit", "multi-solution-state-graph", "synergizes-with"],
  ["constrained-vehicle-route", "dense-overworld-as-challenge-space", "conflicts-with"],
  ["action-first-onboarding", "safe-rule-experiment", "synergizes-with"],
  ["finite-schedule-loop", "reversible-reset-knowledge-retention", "synergizes-with"]
];
const relations = relationPairs.map(([from, to, type], index) => {
  const fromPattern = patternById.get(`pattern.${from}`);
  const toPattern = patternById.get(`pattern.${to}`);
  const bothReleased = fromPattern.status === "released" && toPattern.status === "released";
  return {
    schemaVersion: "1.0.0", relationId: `relation.pattern.${index + 1}`, fromId: fromPattern.patternId, type, toId: toPattern.patternId,
    rationale: `${fromPattern.name} and ${toPattern.name} retain an explicitly reviewed composition relation; production use still obeys dependencies, exclusions, and originality vetoes.`,
    evidenceRefs: unique([fromPattern.provenance.observationRefs[0], toPattern.provenance.observationRefs[0]]), confidence: bothReleased ? "high" : "medium", status: bothReleased ? "released" : "reviewed"
  };
});

const calibration = structuredClone(patternById.get("pattern.state-axis-rewrites-routes"));
calibration.patternId = "pattern.calibration.stateful-revisit";
calibration.patternVersion = "0.2.0";
calibration.name = "Calibration-only stateful revisit vertical slice";
calibration.status = "candidate";
calibration.autoSelectable = false;
calibration.quarantineReason = "This P2 vertical-slice artifact validates the five-hook contract and is excluded from production retrieval and P4 maturity counts.";
calibration.selection.familyId = "family.calibration.stateful-revisit";
calibration.selection.subtypeId = "calibration-only";
calibration.selection.exclusiveWith = [];
calibration.composition.conflicts = [];
calibration.governance.changelog = ["0.2.0 — calibration-only vertical slice recompiled against the final P4 contract; never production-selectable."];

await mkdir(path.join(patternRoot, "calibration"), { recursive: true });
await mkdir(path.join(packRoot, "relations"), { recursive: true });
await atomicJson(path.join(patternRoot, "released-patterns.json"), patterns);
await atomicJson(path.join(patternRoot, "calibration", "provisional-stateful-revisit.json"), calibration);
await atomicJson(path.join(packRoot, "relations", "relation-registry.json"), relations);
console.log(`Compiled ${patterns.length} pattern records: ${patterns.filter((item) => item.status === "released").length} released and ${patterns.filter((item) => item.status === "reviewed").length} quarantined; ${relations.length} relations.`);

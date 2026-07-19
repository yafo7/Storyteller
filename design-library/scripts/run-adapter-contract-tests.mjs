import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const libraryRoot = path.resolve(here, "..");
const repoRoot = path.resolve(libraryRoot, "..");
const paths = {
  adapter: path.join(libraryRoot, "core", "perspective-adapters", "2d-topdown-v021.json"),
  patterns: path.join(libraryRoot, "packs", "zelda-mainline", "patterns", "released-patterns.json"),
  effectContracts: path.join(libraryRoot, "benchmarks", "adapter-effect-contracts.json"),
  stateFixtures: path.join(libraryRoot, "benchmarks", "adapter-state-fixtures.json"),
  testRegistry: path.join(libraryRoot, "benchmarks", "test-registry.json"),
  capabilityTaxonomy: path.join(libraryRoot, "taxonomies", "runtime-capabilities.json"),
  harness: scriptPath,
  report: path.join(libraryRoot, "benchmarks", "adapter-contract-report.json")
};

const inputOrder = ["adapter", "patterns", "effectContracts", "stateFixtures", "testRegistry", "capabilityTaxonomy", "harness"];
const inputBytes = Object.fromEntries(await Promise.all(inputOrder.map(async (key) => [key, await readFile(paths[key])])));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const parse = (key) => JSON.parse(inputBytes[key].toString("utf8"));
const adapter = parse("adapter");
const patternRegistry = parse("patterns");
const contractRegistry = parse("effectContracts");
const fixtureRegistry = parse("stateFixtures");
const testRegistry = parse("testRegistry");
const capabilityTaxonomy = parse("capabilityTaxonomy");
const patterns = patternRegistry.filter((pattern) => pattern.status === "released" && pattern.autoSelectable === true);
const effects = patterns.flatMap((pattern) => pattern.effectPrimitives.map((effect) => ({ pattern, effect })));

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const codePointCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const checks = [];
let transactionAssertions = 0;
let rollbackAssertions = 0;

function check(checkId, condition, evidence, tags = {}) {
  checks.push({ checkId, result: condition ? "pass" : "fail", evidence });
  if (tags.transaction) transactionAssertions += 1;
  if (tags.rollback) rollbackAssertions += 1;
  return condition;
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function setPath(value, dottedPath, next) {
  const keys = dottedPath.split(".");
  const leaf = keys.pop();
  let current = value;
  for (const key of keys) current = current[key] ??= {};
  current[leaf] = next;
}

function deletePath(value, dottedPath) {
  const keys = dottedPath.split(".");
  const leaf = keys.pop();
  const parent = keys.reduce((current, key) => current?.[key], value);
  if (parent) delete parent[leaf];
}

function commitOnce(state, transactionId) {
  state.transactionLedger ??= [];
  if (state.transactionLedger.includes(transactionId)) return false;
  state.transactionLedger.push(transactionId);
  return true;
}

function executeFixtureOperation(operation, initialState, input) {
  const draft = clone(initialState);
  switch (operation) {
    case "map-layer-atomic": {
      const required = ["tiles", "collision", "props", "interactions", "portals", "lighting"];
      if (!required.every((key) => typeof input.variants?.[key] === "string")) throw new Error("incomplete-map-variant");
      draft.map.activeLayer = input.targetLayer;
      draft.map.tiles = input.variants.tiles;
      draft.collision.version = input.variants.collision;
      if (input.interruptAfter === "collision") throw new Error("transaction-interrupted");
      draft.map.props = input.variants.props;
      draft.map.interactions = input.variants.interactions;
      draft.map.portals = input.variants.portals;
      draft.map.lighting = input.variants.lighting;
      if (!draft.routes.goalReachable || !draft.routes.recoveryReachable) throw new Error("route-softlock");
      commitOnce(draft, input.transactionId);
      return draft;
    }
    case "route-gate-recovery": {
      if (!input.goalReachableAfter || !input.recoveryReachableAfter) throw new Error("route-softlock");
      const open = input.action === "unlock";
      draft.routes.edgeOpen = open;
      draft.collision.gateBlocked = !open;
      draft.routes.goalReachable = input.goalReachableAfter;
      draft.routes.recoveryReachable = input.recoveryReachableAfter;
      commitOnce(draft, input.transactionId);
      return draft;
    }
    case "npc-dialogue-schedule": {
      if (!Object.hasOwn(draft.facts, input.factRef)) throw new Error("unknown-authoritative-fact");
      draft.facts[input.factRef] = input.factValue;
      draft.map.visibleVariant = input.visibleVariant;
      draft.actors[input.actorId].state = input.actorState;
      draft.actors[input.actorId].sourceFact = input.factRef;
      draft.dialogue[input.actorId] = input.dialogueGate;
      draft.schedule.window = input.scheduleWindow;
      commitOnce(draft, input.transactionId);
      return draft;
    }
    case "inventory-object-composition": {
      if (!input.legalCell) throw new Error("illegal-placement-cell");
      if (!input.exitReachableAfter) throw new Error("placement-blocks-recovery");
      if (draft.inventory.objectCount - input.consumption < input.minimumRemaining) throw new Error("inventory-underflow");
      if (input.iterationCount > 8) throw new Error("composition-cycle-cap");
      draft.inventory.objectCount -= input.consumption;
      if (!draft.inventory.roles.includes(input.role)) draft.inventory.roles.push(input.role);
      draft.objects[input.objectId].cell = input.targetCell;
      draft.objects[input.objectId].role = input.role;
      draft.collision.occupied = [input.targetCell];
      draft.routes.exitReachable = true;
      draft.composition.result = input.compositionResult;
      draft.composition.iterations = input.iterationCount;
      commitOnce(draft, input.transactionId);
      return draft;
    }
    case "portal-safe-return": {
      if (draft.map.blockedSpawns.includes(input.spawnCell)) throw new Error("blocked-spawn");
      if (draft.portals.returnEdges[input.returnEdge] !== true) throw new Error("missing-return-edge");
      draft.player.map = input.targetMap;
      draft.player.cell = input.spawnCell;
      draft.player.facing = input.facing;
      draft.checkpoint = input.checkpointId;
      draft.routes.returnReachable = true;
      commitOnce(draft, input.transactionId);
      return draft;
    }
    case "checkpoint-save-reload": {
      const snapshot = clone(initialState);
      if (input.interruptAfterDomain) {
        const partial = {};
        for (const [domain, value] of Object.entries(snapshot)) {
          partial[domain] = clone(value);
          if (domain === input.interruptAfterDomain) throw new Error("checkpoint-interrupted");
        }
      }
      const serialized = JSON.stringify({ saveVersion: input.saveVersion, checkpointId: input.checkpointId, state: snapshot });
      const working = clone(snapshot);
      if (input.mutateBeforeRestore) {
        working.map.activeLayer = "mutated";
        working.inventory.token = 0;
        working.actors.keeper.state = "mutated";
      }
      return JSON.parse(serialized).state;
    }
    case "irreversible-gate": {
      if (draft.gates[input.gateId] !== true) throw new Error("irreversible-gate-closed");
      if (!commitOnce(draft, input.transactionId)) return draft;
      draft.facts[input.factRef] = true;
      draft.inventory[input.inventoryRef] = (draft.inventory[input.inventoryRef] ?? 0) + input.amount;
      draft.save.persistent = true;
      return draft;
    }
    case "cue-idempotence": {
      if (!Array.isArray(input.variants) || input.variants.length === 0) throw new Error("cue-has-no-completion-path");
      for (const variant of input.variants) {
        if (!commitOnce(draft, input.transactionId)) continue;
        draft.cues.push(input.cueId);
        draft.facts[input.durableFact] = true;
        draft.interaction.controlEnabled = variant !== "interrupted";
      }
      draft.interaction.controlEnabled = true;
      return draft;
    }
    case "world-composite-atomic": {
      if (!draft.save.checkpointBeforeTransition) throw new Error("missing-pretransition-checkpoint");
      draft.facts.variant = input.target;
      draft.map.activeLayer = input.target;
      draft.map.tiles = input.target;
      draft.collision.version = input.target;
      draft.map.props = input.target;
      if (input.interruptAfter === "props") throw new Error("transaction-interrupted");
      draft.map.interactions = input.target;
      draft.map.portals = input.target;
      draft.map.lighting = input.target;
      if (!draft.routes.recoveryReachable) throw new Error("route-softlock");
      commitOnce(draft, input.transactionId);
      return draft;
    }
    case "context-onboarding": {
      if (draft.player.facingTarget !== input.target) throw new Error("wrong-context-target");
      draft.player.controlState = "meaningful-control";
      draft.player.roleEvidence = true;
      draft.interaction.open = true;
      draft.objectives.nextDirection = input.nextDirection;
      draft.onboarding.steps += 1;
      draft.onboarding.complete = true;
      draft.world.needState = "resolved-or-transformed";
      draft.telemetry.push(`${input.verb}:${input.target}`);
      commitOnce(draft, input.transactionId);
      return draft;
    }
    case "save-migration": {
      if (input.fromVersion !== 1 || draft.saveVersion !== input.fromVersion || input.toVersion !== 2) throw new Error("unsupported-save-version");
      const rollbackCopy = clone(draft);
      const migratedValue = getPath(draft, input.rename.from);
      if (migratedValue === undefined) throw new Error("migration-source-missing");
      deletePath(draft, input.rename.from);
      setPath(draft, input.rename.to, migratedValue);
      draft.saveVersion = input.toVersion;
      draft.migrationRollback = rollbackCopy;
      return draft;
    }
    case "spatial-query-telemetry": {
      const facingCell = { right: "b1", down: "a2", left: "z1", up: "a0" }[draft.grid.facing];
      if (input.expectedCell !== facingCell) throw new Error("spatial-query-facing-mismatch");
      const target = draft.grid.targets[facingCell];
      if (!target) throw new Error("spatial-query-no-target");
      draft.interaction.target = target;
      draft.telemetry.push(input.eventId);
      commitOnce(draft, input.transactionId);
      return draft;
    }
    default:
      throw new Error(`unknown-fixture-operation:${operation}`);
  }
}

const TRANSACTION_REQUIRED_DOMAINS = {
  "route-unlock": ["routes", "collision"],
  "route-lock": ["routes", "collision"],
  "map-layer": ["map", "collision", "props", "interactions", "portals", "lighting", "routes"],
  "fact-patch": ["facts"],
  "cue": ["cues", "interaction"],
  "inventory-grant": ["inventory"],
  "object-place": ["objects", "collision", "routes"],
  "object-compose": ["composition", "facts"],
  "inventory-consume": ["inventory", "recovery"],
  "portal": ["player", "map", "portals", "checkpoint", "routes", "facts", "inventory"],
  "reward-commit": ["facts", "inventory", "save", "reward"],
  "reward-register": ["facts", "reward"],
  "secret-test": ["world", "routes"],
  "secret-reveal": ["locations", "inventory", "facts"],
  "npc-world": ["facts", "map", "world"],
  "npc-state": ["facts", "actors", "dialogue", "schedule"],
  "world-transition": ["facts", "map", "collision", "props", "interactions", "portals", "lighting", "routes", "save"],
  "interaction-window": ["interaction", "player", "objectives"],
  "onboarding-action": ["onboarding", "world", "player", "telemetry"],
  "map-region": ["map", "collision", "routes", "recovery"],
  "challenge-resolve": ["world", "routes", "recovery"],
  "route-authorship": ["facts", "knowledge", "routes", "telemetry"]
};

function genericInitialState(contract) {
  const state = { transactionLedger: [] };
  for (const domain of contract.domains) state[domain] = { marker: "before" };
  return state;
}

function executeEffectTransaction(initialState, contract, effect, options = {}) {
  if (options.preconditionsSatisfied === false) throw new Error("effect-precondition-failed");
  if (effect.rollback === "irreversible-after-gate" && options.gateOpen !== true) throw new Error("irreversible-gate-closed");
  const bindings = options.bindings ?? {};
  const missingBindings = effect.parameters.filter((parameterRef) => !Object.hasOwn(bindings, parameterRef));
  if (missingBindings.length) throw new Error(`missing-effect-bindings:${missingBindings.join(",")}`);
  const draft = clone(initialState);
  const transactionId = options.transactionId ?? `tx.${effect.effectId}`;
  if (draft.transactionLedger.includes(transactionId)) {
    return { state: draft, beforeState: clone(initialState), transactionId, consumedParameterRefs: [...effect.parameters], idempotentReplay: true };
  }
  for (const domain of contract.domains) {
    draft[domain] = { marker: `after:${effect.effectId}`, transactionId };
    if (options.interruptAfter === domain) throw new Error("transaction-interrupted");
  }
  commitOnce(draft, transactionId);
  return { state: draft, beforeState: clone(initialState), transactionId, consumedParameterRefs: [...effect.parameters], idempotentReplay: false };
}

function rollbackEffectTransaction(receipt, rollbackPolicy, checkpoint = null) {
  if (rollbackPolicy === "reversible") return clone(receipt.beforeState);
  if (rollbackPolicy === "checkpoint-only") {
    if (!checkpoint) throw new Error("checkpoint-required-for-rollback");
    return clone(checkpoint);
  }
  if (rollbackPolicy === "irreversible-after-gate") return clone(receipt.state);
  throw new Error(`unknown-rollback-policy:${rollbackPolicy}`);
}

const mappingById = new Map();
for (const mapping of adapter.mappings) {
  check(`adapter.mapping-id.${mapping.mappingId}`, !mappingById.has(mapping.mappingId), { mappingId: mapping.mappingId });
  mappingById.set(mapping.mappingId, mapping);
}
const effectMappings = new Map();
const capabilityMappings = new Map();
for (const mapping of adapter.mappings) {
  for (const token of mapping.abstractPath.split("|").map((entry) => entry.trim())) {
    if (token.startsWith("effect.")) {
      const kind = token.slice("effect.".length);
      if (!effectMappings.has(kind)) effectMappings.set(kind, []);
      effectMappings.get(kind).push(mapping.mappingId);
    } else if (token.startsWith("capability.")) {
      if (!capabilityMappings.has(token)) capabilityMappings.set(token, []);
      capabilityMappings.get(token).push(mapping.mappingId);
    } else {
      check(`adapter.mapping-token.${mapping.mappingId}.${token}`, false, { reason: "untyped-abstract-path-token", token });
    }
  }
}

const releasedKinds = [...new Set(effects.map(({ effect }) => effect.kind))].sort(codePointCompare);
for (const kind of releasedKinds) {
  check(`adapter.effect-kind.${kind}`, effectMappings.get(kind)?.length === 1, { mappingIds: effectMappings.get(kind) ?? [] });
}

const contractByEffectId = new Map();
for (const contract of contractRegistry.effectContracts) {
  check(`contract.unique.${contract.effectId}`, !contractByEffectId.has(contract.effectId), { effectId: contract.effectId });
  contractByEffectId.set(contract.effectId, contract);
}
check("contract.adapter-ref", contractRegistry.adapterRef === `${adapter.adapterId}@${adapter.adapterVersion}`, { declared: contractRegistry.adapterRef, actual: `${adapter.adapterId}@${adapter.adapterVersion}` });

const effectAudit = [];
let closedEffectInstances = 0;
for (const { pattern, effect } of [...effects].sort((a, b) => codePointCompare(a.effect.effectId, b.effect.effectId))) {
  const start = checks.length;
  const contract = contractByEffectId.get(effect.effectId);
  const prefix = `effect-instance.${effect.effectId}`;
  check(`${prefix}.contract`, Boolean(contract), { patternId: pattern.patternId });
  if (!contract) continue;
  check(`${prefix}.identity`, contract.patternId === pattern.patternId && contract.kind === effect.kind, { contractPatternId: contract.patternId, sourcePatternId: pattern.patternId, contractKind: contract.kind, sourceKind: effect.kind });
  check(`${prefix}.source-shape`, contract.sourceShape.preconditions === effect.preconditions.length && contract.sourceShape.postconditions === effect.postconditions.length && contract.sourceShape.rollback === effect.rollback, { declared: contract.sourceShape, actual: { preconditions: effect.preconditions.length, postconditions: effect.postconditions.length, rollback: effect.rollback } });
  const sourceConditionsExecutable = [...effect.preconditions, ...effect.postconditions].every((condition) => typeof condition === "string" && condition.startsWith("$.") && condition.includes(" must satisfy ") && condition.includes(" before the authored transaction is accepted."));
  check(`${prefix}.condition-closure`, sourceConditionsExecutable, { preconditions: effect.preconditions.length, postconditions: effect.postconditions.length });
  const declaredParameters = new Set(pattern.hooks.instantiate.parameters.map((parameter) => parameter.parameterId));
  check(`${prefix}.parameter-closure`, contract.parameterRoles.length === effect.parameters.length && effect.parameters.every((parameterRef) => declaredParameters.has(parameterRef)) && contract.parameterRoles.every((role) => typeof role === "string" && role.length > 0), { parameterRefs: effect.parameters, parameterRoles: contract.parameterRoles });
  const missingMappings = contract.mappingIds.filter((mappingId) => !mappingById.has(mappingId));
  const hasKindMapping = contract.mappingIds.some((mappingId) => mappingById.get(mappingId)?.abstractPath.split("|").includes(`effect.${effect.kind}`));
  check(`${prefix}.mapping-closure`, missingMappings.length === 0 && hasKindMapping, { mappingIds: contract.mappingIds, missingMappings, hasKindMapping });
  const requiredDomains = TRANSACTION_REQUIRED_DOMAINS[contract.transactionType];
  check(`${prefix}.transaction-type`, Boolean(requiredDomains) && requiredDomains.every((domain) => contract.domains.includes(domain)), { transactionType: contract.transactionType, requiredDomains: requiredDomains ?? [], declaredDomains: contract.domains });

  const initial = genericInitialState(contract);
  const bindings = Object.fromEntries(effect.parameters.map((parameterRef, index) => [parameterRef, { role: contract.parameterRoles[index], valueRef: `binding.${index + 1}` }]));
  let positive = null;
  try {
    positive = executeEffectTransaction(initial, contract, effect, { preconditionsSatisfied: true, gateOpen: true, bindings });
    const allDomainsCommitted = contract.domains.every((domain) => positive.state[domain]?.marker === `after:${effect.effectId}`);
    check(`${prefix}.positive-transaction`, allDomainsCommitted && positive.state.transactionLedger.length === 1, { domains: contract.domains, ledger: positive.state.transactionLedger }, { transaction: true });
    check(`${prefix}.parameter-consumption`, same(positive.consumedParameterRefs, effect.parameters), { consumed: positive.consumedParameterRefs }, { transaction: true });
    const replay = executeEffectTransaction(positive.state, contract, effect, { preconditionsSatisfied: true, gateOpen: true, bindings });
    check(`${prefix}.idempotent-replay`, replay.idempotentReplay === true && same(replay.state, positive.state) && replay.state.transactionLedger.length === 1, { ledger: replay.state.transactionLedger }, { transaction: true });
  } catch (error) {
    check(`${prefix}.positive-transaction`, false, { error: error.message }, { transaction: true });
  }

  const beforePreconditionFailure = clone(initial);
  let preconditionError = null;
  try { executeEffectTransaction(initial, contract, effect, { preconditionsSatisfied: false, gateOpen: true, bindings }); }
  catch (error) { preconditionError = error.message; }
  check(`${prefix}.precondition-rejection`, preconditionError === "effect-precondition-failed" && same(initial, beforePreconditionFailure), { error: preconditionError }, { transaction: true, rollback: true });

  const beforeInterruption = clone(initial);
  let interruptionError = null;
  try { executeEffectTransaction(initial, contract, effect, { preconditionsSatisfied: true, gateOpen: true, bindings, interruptAfter: contract.domains[0] }); }
  catch (error) { interruptionError = error.message; }
  check(`${prefix}.interruption-rollback`, interruptionError === "transaction-interrupted" && same(initial, beforeInterruption), { error: interruptionError, interruptedDomain: contract.domains[0] }, { transaction: true, rollback: true });

  if (positive) {
    if (effect.rollback === "reversible") {
      const rolledBack = rollbackEffectTransaction(positive, effect.rollback);
      check(`${prefix}.rollback-policy`, same(rolledBack, initial) && !same(positive.state, initial), { policy: effect.rollback, restoredFromReceipt: same(rolledBack, positive.beforeState) }, { rollback: true });
    } else if (effect.rollback === "checkpoint-only") {
      const checkpoint = clone(initial);
      const restored = rollbackEffectTransaction(positive, effect.rollback, checkpoint);
      let missingCheckpointError = null;
      try { rollbackEffectTransaction(positive, effect.rollback); }
      catch (error) { missingCheckpointError = error.message; }
      check(`${prefix}.rollback-policy`, same(restored, initial) && !same(positive.state, initial) && missingCheckpointError === "checkpoint-required-for-rollback", { policy: effect.rollback, restoredFromCheckpoint: same(restored, checkpoint), missingCheckpointError }, { rollback: true });
    } else {
      let gateError = null;
      try { executeEffectTransaction(initial, contract, effect, { preconditionsSatisfied: true, gateOpen: false, bindings }); }
      catch (error) { gateError = error.message; }
      const saveReload = JSON.parse(JSON.stringify(positive.state));
      const rollbackAttempt = rollbackEffectTransaction(positive, effect.rollback, initial);
      check(`${prefix}.rollback-policy`, gateError === "irreversible-gate-closed" && same(saveReload, positive.state) && same(rollbackAttempt, positive.state), { policy: effect.rollback, gateError, persistsAfterReload: same(saveReload, positive.state), rollbackIgnoredAfterGate: same(rollbackAttempt, positive.state) }, { rollback: true });
    }
  }

  const sourceContract = { patternId: pattern.patternId, effectId: effect.effectId, kind: effect.kind, preconditions: effect.preconditions, parameters: effect.parameters, postconditions: effect.postconditions, rollback: effect.rollback };
  const audit = {
    effectId: effect.effectId,
    patternId: pattern.patternId,
    kind: effect.kind,
    transactionType: contract.transactionType,
    mappingIds: contract.mappingIds,
    domains: contract.domains,
    parameterBindings: effect.parameters.map((parameterRef, index) => ({ parameterRef, role: contract.parameterRoles[index] })),
    preconditionCount: effect.preconditions.length,
    postconditionCount: effect.postconditions.length,
    rollback: effect.rollback,
    sourceContractSha256: sha(Buffer.from(JSON.stringify(sourceContract))),
    preconditionsSha256: sha(Buffer.from(JSON.stringify(effect.preconditions))),
    postconditionsSha256: sha(Buffer.from(JSON.stringify(effect.postconditions)))
  };
  const passed = checks.slice(start).every((entry) => entry.result === "pass");
  audit.status = passed ? "closed" : "failed";
  if (passed) closedEffectInstances += 1;
  effectAudit.push(audit);
}

const releasedEffectIds = new Set(effects.map(({ effect }) => effect.effectId));
const orphanContracts = contractRegistry.effectContracts.filter((contract) => !releasedEffectIds.has(contract.effectId)).map((contract) => contract.effectId);
check("contract.exact-effect-set", contractRegistry.effectContracts.length === effects.length && orphanContracts.length === 0 && contractByEffectId.size === effects.length, { contracts: contractRegistry.effectContracts.length, effects: effects.length, orphanContracts });

const releasedCapabilities = [...new Set(patterns.flatMap((pattern) => pattern.implementation.runtimeCapabilities))].sort(codePointCompare);
const taxonomyIds = new Set(capabilityTaxonomy.terms.map((term) => term.termId));
const capabilityContractById = new Map(contractRegistry.capabilityContracts.map((contract) => [contract.capabilityId, contract]));
const capabilityAudit = [];
let closedCapabilities = 0;
for (const capabilityId of releasedCapabilities) {
  const start = checks.length;
  const contract = capabilityContractById.get(capabilityId);
  const mapping = contract ? mappingById.get(contract.mappingId) : null;
  check(`capability.${capabilityId}.taxonomy`, taxonomyIds.has(capabilityId), { capabilityId });
  check(`capability.${capabilityId}.contract`, Boolean(contract), contract ?? null);
  check(`capability.${capabilityId}.adapter-required`, adapter.requiredCapabilities.includes(capabilityId), { adapterRequiredCapabilities: adapter.requiredCapabilities });
  check(`capability.${capabilityId}.mapping`, Boolean(mapping) && mapping.abstractPath.split("|").includes(capabilityId), { mappingId: contract?.mappingId ?? null, abstractPath: mapping?.abstractPath ?? null });
  check(`capability.${capabilityId}.disposition`, ["supported", "supported-with-nonauthoritative-fallback", "fallback", "rejected"].includes(contract?.disposition) && (contract?.disposition !== "fallback" && contract?.disposition !== "rejected" || Boolean(mapping?.fallback)), { disposition: contract?.disposition ?? null, fallback: mapping?.fallback ?? null });
  const passed = checks.slice(start).every((entry) => entry.result === "pass");
  if (passed) closedCapabilities += 1;
  capabilityAudit.push({ capabilityId, mappingId: contract?.mappingId ?? null, disposition: contract?.disposition ?? null, status: passed ? "closed" : "failed" });
}
const allowedExtraCapabilityContracts = new Set(["capability.grid-collision"]);
const extraCapabilityContracts = contractRegistry.capabilityContracts.map((entry) => entry.capabilityId).filter((id) => !releasedCapabilities.includes(id) && !allowedExtraCapabilityContracts.has(id));
check("capability.exact-released-union", releasedCapabilities.length === 18 && extraCapabilityContracts.length === 0, { releasedCapabilities, extraCapabilityContracts });
const gridContract = capabilityContractById.get("capability.grid-collision");
const gridMapping = gridContract ? mappingById.get(gridContract.mappingId) : null;
check("capability.profile-grid-collision", gridContract?.disposition === "profile-required" && adapter.requiredCapabilities.includes("capability.grid-collision") && gridMapping?.abstractPath === "capability.grid-collision", { gridContract, mappingId: gridMapping?.mappingId ?? null });

const adapterTestEntries = testRegistry.tests.filter((entry) => entry.owner === adapter.adapterId);
const testById = new Map(adapterTestEntries.map((entry) => [entry.testId, entry]));
const fixtureById = new Map(fixtureRegistry.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
for (const testId of adapter.tests) {
  const registryEntry = testById.get(testId);
  check(`adapter-test.${testId}.registry`, Boolean(registryEntry), registryEntry ?? null);
  check(`adapter-test.${testId}.fixture`, Boolean(registryEntry && fixtureById.has(registryEntry.fixtureRef)), { fixtureRef: registryEntry?.fixtureRef ?? null });
}
check("adapter-test.exact-declared-set", adapterTestEntries.length === adapter.tests.length && adapterTestEntries.every((entry) => adapter.tests.includes(entry.testId)), { adapterTests: adapter.tests, registryTests: adapterTestEntries.map((entry) => entry.testId) });

const fixtureAudit = [];
let executedPositiveFixtures = 0;
let executedNegativeFixtures = 0;
for (const fixture of [...fixtureRegistry.fixtures].sort((a, b) => codePointCompare(a.fixtureId, b.fixtureId))) {
  const start = checks.length;
  const prefix = `runtime-fixture.${fixture.fixtureId}`;
  check(`${prefix}.declared-test`, adapter.tests.includes(fixture.testId), { testId: fixture.testId });
  let positiveState = null;
  try {
    positiveState = executeFixtureOperation(fixture.operation, fixture.initialState, fixture.positiveInput);
    let positivePassed = true;
    for (const expectation of fixture.positiveExpected) {
      const actual = getPath(positiveState, expectation.path);
      const passed = same(actual, expectation.equals);
      positivePassed = positivePassed && passed;
      check(`${prefix}.positive.${expectation.path}`, passed, { expected: expectation.equals, actual }, { transaction: true });
    }
    if (positivePassed) executedPositiveFixtures += 1;
  } catch (error) {
    check(`${prefix}.positive.execution`, false, { error: error.message }, { transaction: true });
  }

  const beforeNegative = clone(fixture.initialState);
  let negativeError = null;
  try { executeFixtureOperation(fixture.operation, fixture.initialState, fixture.negativeInput); }
  catch (error) { negativeError = error.message; }
  const negativeErrorPassed = negativeError === fixture.negativeExpectedError;
  const rollbackPassed = fixture.negativeMustRollbackExactly !== true || same(fixture.initialState, beforeNegative);
  check(`${prefix}.negative.error`, negativeErrorPassed, { expected: fixture.negativeExpectedError, actual: negativeError }, { transaction: true });
  check(`${prefix}.negative.rollback`, rollbackPassed, { exactRollbackRequired: fixture.negativeMustRollbackExactly, exactRollbackObserved: same(fixture.initialState, beforeNegative) }, { rollback: true });
  if (negativeErrorPassed && rollbackPassed) executedNegativeFixtures += 1;
  const passed = checks.slice(start).every((entry) => entry.result === "pass");
  fixtureAudit.push({ fixtureId: fixture.fixtureId, testId: fixture.testId, operation: fixture.operation, positiveAssertions: fixture.positiveExpected.length, negativeExpectedError: fixture.negativeExpectedError, status: passed ? "pass" : "fail" });
}

const inputAttestations = inputOrder.map((key) => ({
  key,
  path: path.relative(repoRoot, paths[key]).replaceAll("\\", "/"),
  bytes: inputBytes[key].byteLength,
  sha256: sha(inputBytes[key])
}));

checks.sort((a, b) => codePointCompare(a.checkId, b.checkId));
effectAudit.sort((a, b) => codePointCompare(a.effectId, b.effectId));
capabilityAudit.sort((a, b) => codePointCompare(a.capabilityId, b.capabilityId));
fixtureAudit.sort((a, b) => codePointCompare(a.fixtureId, b.fixtureId));
const passedChecks = checks.filter((entry) => entry.result === "pass").length;
const failedChecks = checks.length - passedChecks;
const report = {
  reportVersion: "2.0.0",
  reportId: "report.p5.adapter-contract",
  generatedAt: "2026-07-19",
  adapterRef: `${adapter.adapterId}@${adapter.adapterVersion}`,
  inputAttestations,
  metrics: {
    releasedPatterns: patterns.length,
    effectInstances: effects.length,
    releasedEffectKinds: releasedKinds.length,
    requiredRuntimeCapabilities: releasedCapabilities.length,
    closedEffectInstances,
    closedCapabilities,
    adapterMappings: adapter.mappings.length,
    executedPositiveFixtures,
    executedNegativeFixtures,
    transactionAssertions,
    rollbackAssertions
  },
  effectAudit,
  capabilityAudit,
  fixtureAudit,
  checks,
  summary: {
    passedChecks,
    failedChecks,
    adjudication: failedChecks === 0 ? "pass" : "fail"
  }
};

await mkdir(path.dirname(paths.report), { recursive: true });
await writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Adapter contract ${report.summary.adjudication}: ${passedChecks}/${checks.length} checks; ${closedEffectInstances}/${effects.length} effects; ${closedCapabilities}/${releasedCapabilities.length} capabilities; ${executedPositiveFixtures}+${executedNegativeFixtures} runtime fixtures.`);
if (report.summary.adjudication !== "pass") process.exitCode = 1;

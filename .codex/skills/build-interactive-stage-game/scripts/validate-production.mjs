#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ID = /^[a-z0-9][a-z0-9._-]*$/;
const CUE_TYPES = new Set([
  "actor.enter", "actor.exit", "actor.move", "actor.face", "actor.sit", "actor.stand", "actor.gesture",
  "dialogue.say", "dialogue.interrupt", "dialogue.silence",
  "prop.show", "prop.hide", "prop.use", "prop.set",
  "light.set", "light.fade", "light.flicker", "audio.play", "audio.stop", "audio.duck",
  "camera.focus", "camera.pan", "camera.zoom", "camera.shake",
  "wait.duration", "wait.event", "parallel", "interaction.open", "fact.reveal", "scene.transition",
]);
const ADAPTATION_MODES = new Set(["faithful-stage", "interactive-retelling", "free-remix"]);
const AGENCY_MODES = new Set(["witness", "actor-role", "ensemble", "branch-author"]);
const BEAT_MODES = new Set(["performance", "exploration", "conversation", "transition"]);
const FALLBACKS = new Set(["complete", "snap", "skip", "substitute", "abort-beat"]);

function usage() {
  console.log("Usage: node validate-production.mjs <production.json|package-dir> [--strict] [--json]");
}

function parseArgs(argv) {
  const result = { input: null, strict: false, json: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else if (arg === "--strict") result.strict = true;
    else if (arg === "--json") result.json = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (result.input) throw new Error("accepts one production path");
    else result.input = arg;
  }
  if (!result.input) throw new Error("missing production path");
  return result;
}

let options;
try { options = parseArgs(process.argv.slice(2)); }
catch (error) { console.error(`validate-production: ${error.message}`); usage(); process.exit(2); }

let inputPath = path.resolve(options.input);
if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) inputPath = path.join(inputPath, "production.json");
if (!fs.existsSync(inputPath)) { console.error(`validate-production: not found: ${inputPath}`); process.exit(2); }

let root;
try { root = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "")); }
catch (error) { console.error(`validate-production: invalid JSON: ${error.message}`); process.exit(2); }

const issues = [];
const error = (code, at, message) => issues.push({ level: "error", code, path: at, message });
const warn = (code, at, message) => issues.push({ level: "warning", code, path: at, message });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value, at) => {
  if (!Array.isArray(value)) { error("expected-array", at, "must be an array"); return []; }
  return value;
};
const object = (value, at) => {
  if (!isObject(value)) { error("expected-object", at, "must be an object"); return {}; }
  return value;
};
const requireString = (value, at) => {
  if (typeof value !== "string" || value.trim() === "") { error("expected-string", at, "must be a nonempty string"); return false; }
  return true;
};
const requireId = (value, at) => {
  if (!requireString(value, at)) return false;
  if (!ID.test(value)) { error("invalid-id", at, "must match lowercase [a-z0-9._-] identifier syntax"); return false; }
  return true;
};
function indexById(items, at) {
  const map = new Map();
  items.forEach((item, index) => {
    const itemPath = `${at}[${index}]`;
    if (!isObject(item)) { error("expected-object", itemPath, "must be an object"); return; }
    if (!requireId(item.id, `${itemPath}.id`)) return;
    if (map.has(item.id)) error("duplicate-id", `${itemPath}.id`, `duplicates ${item.id}`);
    else map.set(item.id, item);
  });
  return map;
}
function checkRefs(values, known, at, kind) {
  list(values, at).forEach((value, index) => {
    if (!known.has(value)) error("unknown-reference", `${at}[${index}]`, `unknown ${kind} ${JSON.stringify(value)}`);
  });
}

if (!isObject(root)) error("expected-object", "$", "production root must be an object");
if (root.$schema !== "interactive-stage-production/v1") error("schema", "$.$schema", "must equal interactive-stage-production/v1");
if (root.schemaVersion !== "1.0.0") error("schema-version", "$.schemaVersion", "this validator supports 1.0.0");
requireId(root.id, "$.id");
requireString(root.title, "$.title");
requireString(root.language, "$.language");

const adaptation = object(root.adaptation, "$.adaptation");
if (!ADAPTATION_MODES.has(adaptation.mode)) error("adaptation-mode", "$.adaptation.mode", "must be faithful-stage, interactive-retelling, or free-remix");
if (!AGENCY_MODES.has(adaptation.playerAgency)) error("player-agency", "$.adaptation.playerAgency", "must be witness, actor-role, ensemble, or branch-author");
if (!(Number.isFinite(adaptation.targetMinutes) && adaptation.targetMinutes > 0)) error("target-minutes", "$.adaptation.targetMinutes", "must be a positive number");

const sources = list(root.sources, "$.sources");
const sourceMap = indexById(sources, "$.sources");
if (sources.length === 0) error("missing-source", "$.sources", "requires at least one source");
sources.forEach((source, index) => {
  requireString(source.path, `$.sources[${index}].path`);
  requireString(source.kind, `$.sources[${index}].kind`);
  if (source.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(source.sha256)) error("invalid-sha256", `$.sources[${index}].sha256`, "must be a lowercase SHA-256 hex digest");
});

const flags = list(root.flags, "$.flags");
const flagMap = indexById(flags, "$.flags");
flags.forEach((flag, index) => {
  if (typeof flag.initial !== "boolean") error("flag-initial", `$.flags[${index}].initial`, "must be boolean");
});

const story = object(root.story, "$.story");
const facts = list(story.facts, "$.story.facts");
const factMap = indexById(facts, "$.story.facts");
const characters = list(story.characters, "$.story.characters");
const characterMap = indexById(characters, "$.story.characters");
const evidence = list(story.evidence, "$.story.evidence");
indexById(evidence, "$.story.evidence");
const ledger = list(story.adaptationLedger, "$.story.adaptationLedger");
indexById(ledger, "$.story.adaptationLedger");

function validateSourceRefs(refs, at, required = false) {
  const values = list(refs, at);
  if (required && values.length === 0) error("missing-source-ref", at, "requires at least one source span");
  values.forEach((ref, index) => {
    const refPath = `${at}[${index}]`;
    if (!isObject(ref)) { error("expected-object", refPath, "must be an object"); return; }
    if (!sourceMap.has(ref.sourceId)) error("unknown-reference", `${refPath}.sourceId`, `unknown source ${JSON.stringify(ref.sourceId)}`);
    if (!Number.isInteger(ref.startLine) || ref.startLine < 1) error("source-line", `${refPath}.startLine`, "must be a positive integer");
    if (!Number.isInteger(ref.endLine) || ref.endLine < ref.startLine) error("source-line", `${refPath}.endLine`, "must be an integer not less than startLine");
    if (!(Number.isFinite(ref.confidence) && ref.confidence >= 0 && ref.confidence <= 1)) error("confidence", `${refPath}.confidence`, "must be between 0 and 1");
  });
}

facts.forEach((fact, index) => {
  requireString(fact.text, `$.story.facts[${index}].text`);
  if (typeof fact.immutable !== "boolean") error("fact-immutable", `$.story.facts[${index}].immutable`, "must be boolean");
  if (typeof fact.required !== "boolean") error("fact-required", `$.story.facts[${index}].required`, "must be boolean");
  validateSourceRefs(fact.sourceRefs, `$.story.facts[${index}].sourceRefs`, fact.immutable === true);
});
characters.forEach((character, index) => {
  requireString(character.name, `$.story.characters[${index}].name`);
  checkRefs(character.knowledge, factMap, `$.story.characters[${index}].knowledge`, "fact");
  list(character.beliefs, `$.story.characters[${index}].beliefs`).forEach((belief, beliefIndex) => {
    const beliefPath = `$.story.characters[${index}].beliefs[${beliefIndex}]`;
    if (!isObject(belief)) { error("expected-object", beliefPath, "must be an object"); return; }
    if (!factMap.has(belief.factId)) error("unknown-reference", `${beliefPath}.factId`, `unknown fact ${JSON.stringify(belief.factId)}`);
    if (!new Set(["accepts", "denies", "uncertain", "unaware"]).has(belief.stance)) error("belief-stance", `${beliefPath}.stance`, "has an invalid stance");
  });
});
evidence.forEach((item, index) => {
  requireString(item.label, `$.story.evidence[${index}].label`);
  checkRefs(item.supports, factMap, `$.story.evidence[${index}].supports`, "fact");
  validateSourceRefs(item.sourceRefs || [], `$.story.evidence[${index}].sourceRefs`);
});

const world = object(root.world, "$.world");
const stages = list(world.stages, "$.world.stages");
const stageMap = indexById(stages, "$.world.stages");
const anchorsByStage = new Map();
stages.forEach((stage, index) => {
  requireString(stage.label, `$.world.stages[${index}].label`);
  const anchors = list(stage.anchors, `$.world.stages[${index}].anchors`);
  const anchorMap = indexById(anchors, `$.world.stages[${index}].anchors`);
  anchors.forEach((anchor, anchorIndex) => requireString(anchor.kind, `$.world.stages[${index}].anchors[${anchorIndex}].kind`));
  anchorsByStage.set(stage.id, anchorMap);
});
const actors = list(world.actors, "$.world.actors");
const actorMap = indexById(actors, "$.world.actors");
actors.forEach((actor, index) => {
  if (!characterMap.has(actor.characterId)) error("unknown-reference", `$.world.actors[${index}].characterId`, `unknown character ${JSON.stringify(actor.characterId)}`);
  if (!stageMap.has(actor.stageId)) error("unknown-reference", `$.world.actors[${index}].stageId`, `unknown stage ${JSON.stringify(actor.stageId)}`);
  else if (!anchorsByStage.get(actor.stageId).has(actor.anchorId)) error("unknown-reference", `$.world.actors[${index}].anchorId`, `unknown anchor on ${actor.stageId}`);
});
const props = list(world.props, "$.world.props");
const propMap = indexById(props, "$.world.props");
props.forEach((prop, index) => {
  requireString(prop.prototype, `$.world.props[${index}].prototype`);
  if (!stageMap.has(prop.stageId)) error("unknown-reference", `$.world.props[${index}].stageId`, `unknown stage ${JSON.stringify(prop.stageId)}`);
  else if (!anchorsByStage.get(prop.stageId).has(prop.anchorId)) error("unknown-reference", `$.world.props[${index}].anchorId`, `unknown anchor on ${prop.stageId}`);
  const states = list(prop.states, `$.world.props[${index}].states`);
  if (states.length === 0) error("prop-states", `$.world.props[${index}].states`, "must not be empty");
  if (!states.includes(prop.initialState)) error("prop-initial-state", `$.world.props[${index}].initialState`, "must occur in states");
});

const performance = object(root.performance, "$.performance");
const scenes = list(performance.scenes, "$.performance.scenes");
const sceneMap = indexById(scenes, "$.performance.scenes");
const beats = list(performance.beats, "$.performance.beats");
const beatMap = indexById(beats, "$.performance.beats");
const endings = list(performance.endings, "$.performance.endings");
const endingMap = indexById(endings, "$.performance.endings");
if (!beatMap.has(performance.entryBeat)) error("unknown-reference", "$.performance.entryBeat", `unknown beat ${JSON.stringify(performance.entryBeat)}`);
if (endings.length === 0) error("missing-ending", "$.performance.endings", "requires at least one ending");
endings.forEach((ending, index) => requireString(ending.label, `$.performance.endings[${index}].label`));

const cueIds = new Set();
const actionIds = new Set();
function validateCondition(condition, at) {
  if (condition === undefined) return;
  if (!isObject(condition)) { error("expected-object", at, "must be an object"); return; }
  for (const field of ["flagsAll", "flagsAny", "flagsNone"]) if (condition[field] !== undefined) checkRefs(condition[field], flagMap, `${at}.${field}`, "flag");
  for (const field of ["factsAll", "factsAny", "factsNone"]) if (condition[field] !== undefined) checkRefs(condition[field], factMap, `${at}.${field}`, "fact");
  if (condition.propStates !== undefined) list(condition.propStates, `${at}.propStates`).forEach((state, index) => {
    const statePath = `${at}.propStates[${index}]`;
    if (!isObject(state) || !propMap.has(state.propId)) error("unknown-reference", `${statePath}.propId`, `unknown prop ${JSON.stringify(state?.propId)}`);
    else if (!propMap.get(state.propId).states.includes(state.state)) error("prop-state", `${statePath}.state`, `invalid state for ${state.propId}`);
  });
}
function validateEffects(effects, at) {
  if (effects === undefined) return;
  if (!isObject(effects)) { error("expected-object", at, "must be an object"); return; }
  for (const field of ["setFlags", "unsetFlags"]) if (effects[field] !== undefined) checkRefs(effects[field], flagMap, `${at}.${field}`, "flag");
  if (effects.revealFacts !== undefined) checkRefs(effects.revealFacts, factMap, `${at}.revealFacts`, "fact");
  if (effects.setProps !== undefined) list(effects.setProps, `${at}.setProps`).forEach((state, index) => {
    const statePath = `${at}.setProps[${index}]`;
    if (!isObject(state) || !propMap.has(state.propId)) error("unknown-reference", `${statePath}.propId`, `unknown prop ${JSON.stringify(state?.propId)}`);
    else if (!propMap.get(state.propId).states.includes(state.state)) error("prop-state", `${statePath}.state`, `invalid state for ${state.propId}`);
  });
}
function validateCue(cue, at) {
  if (!isObject(cue)) { error("expected-object", at, "must be an object"); return; }
  if (requireId(cue.id, `${at}.id`)) {
    if (cueIds.has(cue.id)) error("duplicate-id", `${at}.id`, `duplicates cue ${cue.id}`);
    cueIds.add(cue.id);
  }
  if (!CUE_TYPES.has(cue.type)) error("cue-type", `${at}.type`, `unsupported cue type ${JSON.stringify(cue.type)}`);
  validateCondition(cue.when, `${at}.when`);
  validateEffects(cue.effects, `${at}.effects`);
  if (cue.type?.startsWith("actor.") || cue.type?.startsWith("dialogue.")) {
    if (cue.type !== "dialogue.silence" && !actorMap.has(cue.actorId)) error("unknown-reference", `${at}.actorId`, `unknown actor ${JSON.stringify(cue.actorId)}`);
  }
  if (["actor.enter", "actor.move"].includes(cue.type) && !requireString(cue.targetAnchor, `${at}.targetAnchor`)) return;
  if (cue.type?.startsWith("prop.") && !propMap.has(cue.propId)) error("unknown-reference", `${at}.propId`, `unknown prop ${JSON.stringify(cue.propId)}`);
  if (cue.type === "dialogue.say") requireString(cue.text, `${at}.text`);
  if (cue.type === "fact.reveal" && !factMap.has(cue.factId)) error("unknown-reference", `${at}.factId`, `unknown fact ${JSON.stringify(cue.factId)}`);
  if (cue.type === "wait.duration" && !(Number.isFinite(cue.durationMs) && cue.durationMs >= 0)) error("duration", `${at}.durationMs`, "must be a nonnegative number");
  if (cue.type === "parallel") {
    if (!["all", "any"].includes(cue.completion)) error("parallel-completion", `${at}.completion`, "must be all or any");
    list(cue.cues, `${at}.cues`).forEach((child, index) => validateCue(child, `${at}.cues[${index}]`));
  }
  if (cue.blocking === true && cue.type !== "wait.duration") {
    if (!(Number.isFinite(cue.timeoutMs) && cue.timeoutMs > 0)) error("blocking-timeout", `${at}.timeoutMs`, "blocking cue requires a positive timeout");
    if (!isObject(cue.fallback) || !FALLBACKS.has(cue.fallback.strategy)) error("blocking-fallback", `${at}.fallback`, "blocking cue requires a valid fallback strategy");
  }
}

scenes.forEach((scene, index) => {
  requireString(scene.label, `$.performance.scenes[${index}].label`);
  if (!stageMap.has(scene.stageId)) error("unknown-reference", `$.performance.scenes[${index}].stageId`, `unknown stage ${JSON.stringify(scene.stageId)}`);
  if (!beatMap.has(scene.entryBeat)) error("unknown-reference", `$.performance.scenes[${index}].entryBeat`, `unknown beat ${JSON.stringify(scene.entryBeat)}`);
  if (typeof scene.required !== "boolean") error("scene-required", `$.performance.scenes[${index}].required`, "must be boolean");
});
beats.forEach((beat, index) => {
  const at = `$.performance.beats[${index}]`;
  if (!sceneMap.has(beat.sceneId)) error("unknown-reference", `${at}.sceneId`, `unknown scene ${JSON.stringify(beat.sceneId)}`);
  if (!stageMap.has(beat.stageId)) error("unknown-reference", `${at}.stageId`, `unknown stage ${JSON.stringify(beat.stageId)}`);
  if (!BEAT_MODES.has(beat.mode)) error("beat-mode", `${at}.mode`, "has an invalid beat mode");
  const cues = list(beat.cues, `${at}.cues`);
  cues.forEach((cue, cueIndex) => validateCue(cue, `${at}.cues[${cueIndex}]`));
  const actions = list(beat.actions, `${at}.actions`);
  actions.forEach((action, actionIndex) => {
    const actionPath = `${at}.actions[${actionIndex}]`;
    if (!isObject(action)) { error("expected-object", actionPath, "must be an object"); return; }
    if (requireId(action.id, `${actionPath}.id`)) {
      if (actionIds.has(action.id)) error("duplicate-id", `${actionPath}.id`, `duplicates action ${action.id}`);
      actionIds.add(action.id);
    }
    requireString(action.label, `${actionPath}.label`);
    requireString(action.verb, `${actionPath}.verb`);
    validateCondition(action.when, `${actionPath}.when`);
    validateEffects(action.effects, `${actionPath}.effects`);
  });
  const edges = list(beat.next, `${at}.next`);
  edges.forEach((edge, edgeIndex) => {
    const edgePath = `${at}.next[${edgeIndex}]`;
    if (!isObject(edge)) { error("expected-object", edgePath, "must be an object"); return; }
    if (!beatMap.has(edge.to)) error("unknown-reference", `${edgePath}.to`, `unknown beat ${JSON.stringify(edge.to)}`);
    if (edge.kind !== undefined && !["auto", "choice"].includes(edge.kind)) error("edge-kind", `${edgePath}.kind`, "must be auto or choice");
    if (edge.priority !== undefined && !Number.isFinite(edge.priority)) error("edge-priority", `${edgePath}.priority`, "must be numeric");
    validateCondition(edge.when, `${edgePath}.when`);
    validateEffects(edge.effects, `${edgePath}.effects`);
  });
  if (beat.terminal === true) {
    if (!endingMap.has(beat.endingId)) error("unknown-reference", `${at}.endingId`, `terminal beat requires a valid ending`);
    if (edges.length) error("terminal-edge", `${at}.next`, "terminal beat cannot have outgoing edges");
  } else if (edges.length === 0 && actions.length === 0) error("dead-end", at, "nonterminal beat requires an action or outgoing edge");
});

scenes.forEach((scene, index) => {
  const entry = beatMap.get(scene.entryBeat);
  if (entry && entry.sceneId !== scene.id) error("scene-entry", `$.performance.scenes[${index}].entryBeat`, "entry beat belongs to another scene");
});
facts.forEach((fact, index) => {
  if (fact.earliestReveal !== undefined && !beatMap.has(fact.earliestReveal)) error("unknown-reference", `$.story.facts[${index}].earliestReveal`, `unknown beat ${JSON.stringify(fact.earliestReveal)}`);
});

const ui = object(root.ui, "$.ui");
const controls = list(ui.controls, "$.ui.controls");
const controlActions = new Set();
controls.forEach((control, index) => {
  if (!requireString(control.action, `$.ui.controls[${index}].action`)) return;
  if (controlActions.has(control.action)) error("duplicate-control", `$.ui.controls[${index}].action`, `duplicates ${control.action}`);
  controlActions.add(control.action);
  requireString(control.label, `$.ui.controls[${index}].label`);
  const bindings = list(control.bindings, `$.ui.controls[${index}].bindings`);
  if (bindings.length === 0) error("control-bindings", `$.ui.controls[${index}].bindings`, "must not be empty");
});
for (const required of ["interact", "pause"]) if (!controlActions.has(required)) error("missing-control", "$.ui.controls", `missing ${required} action`);
if (!isObject(ui.accessibility)) warn("accessibility", "$.ui.accessibility", "declare accessibility defaults");

const assets = list(root.assets, "$.assets");
indexById(assets, "$.assets");
assets.forEach((asset, index) => {
  if (requireString(asset.path, `$.assets[${index}].path`)) {
    const normalized = asset.path.replaceAll("\\", "/");
    if (path.isAbsolute(asset.path) || normalized.split("/").includes("..")) error("unsafe-asset-path", `$.assets[${index}].path`, "must be a package-relative path without parent traversal");
  }
  requireString(asset.kind, `$.assets[${index}].kind`);
  requireString(asset.license, `$.assets[${index}].license`);
});

if (adaptation.mode !== "faithful-stage" && ledger.length === 0) warn("empty-adaptation-ledger", "$.story.adaptationLedger", "non-faithful mode should record framing or invention");

const errors = issues.filter((item) => item.level === "error");
const warnings = issues.filter((item) => item.level === "warning");
const failed = errors.length > 0 || (options.strict && warnings.length > 0);
const result = { valid: !failed, strict: options.strict, file: inputPath, errors: errors.length, warnings: warnings.length, issues };
if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  for (const issue of issues) console.log(`${issue.level.toUpperCase()} ${issue.code} ${issue.path}: ${issue.message}`);
  console.log(`${failed ? "FAILED" : "PASSED"}: ${errors.length} error(s), ${warnings.length} warning(s)${options.strict ? " (strict)" : ""}.`);
}
if (failed) process.exitCode = 1;

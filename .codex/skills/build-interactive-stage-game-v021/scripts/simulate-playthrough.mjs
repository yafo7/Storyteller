#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node simulate-playthrough.mjs <production.json|package-dir> [--strict] [--max-states N] [--json]");
}
function parseArgs(argv) {
  const result = { input: null, strict: false, json: false, maxStates: 10000 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    if (arg === "--strict") result.strict = true;
    else if (arg === "--json") result.json = true;
    else if (arg === "--max-states") {
      result.maxStates = Number(argv[index + 1]); index += 1;
      if (!Number.isInteger(result.maxStates) || result.maxStates < 1) throw new Error("--max-states must be a positive integer");
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (result.input) throw new Error("accepts one production path");
    else result.input = arg;
  }
  if (!result.input) throw new Error("missing production path");
  return result;
}

let options;
try { options = parseArgs(process.argv.slice(2)); }
catch (error) { console.error(`simulate-playthrough: ${error.message}`); usage(); process.exit(2); }
let inputPath = path.resolve(options.input);
if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) inputPath = path.join(inputPath, "production.json");
let root;
try { root = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "")); }
catch (error) { console.error(`simulate-playthrough: cannot read production: ${error.message}`); process.exit(2); }

const beats = new Map((root.performance?.beats || []).map((beat) => [beat.id, beat]));
const facts = new Map((root.story?.facts || []).map((fact) => [fact.id, fact]));
const requiredFacts = [...facts.values()].filter((fact) => fact.required).map((fact) => fact.id).sort();
const endingIds = new Set((root.performance?.endings || []).map((ending) => ending.id));
if (!beats.has(root.performance?.entryBeat)) {
  console.error("simulate-playthrough: entry beat is missing; run validate-production first");
  process.exit(2);
}

function cloneState(state) {
  return {
    beat: state.beat,
    flags: new Set(state.flags),
    knownFacts: new Set(state.knownFacts),
    gates: new Set(state.gates),
    props: new Map(state.props),
  };
}
function conditionMatches(condition, state) {
  if (!condition) return true;
  const all = (values, set) => (values || []).every((value) => set.has(value));
  const any = (values, set) => !values || values.length === 0 || values.some((value) => set.has(value));
  const none = (values, set) => (values || []).every((value) => !set.has(value));
  return all(condition.flagsAll, state.flags)
    && any(condition.flagsAny, state.flags)
    && none(condition.flagsNone, state.flags)
    && all(condition.factsAll, state.knownFacts)
    && any(condition.factsAny, state.knownFacts)
    && none(condition.factsNone, state.knownFacts)
    && (condition.propStates || []).every((entry) => state.props.get(entry.propId) === entry.state);
}

const revealViolations = [];
function revealFact(factId, state, context) {
  const fact = facts.get(factId);
  if (fact?.earliestReveal && !state.gates.has(factId)) {
    revealViolations.push({ factId, at: context, earliestReveal: fact.earliestReveal });
  }
  state.knownFacts.add(factId);
}
function applyEffects(effects, state, context) {
  if (!effects) return;
  for (const flag of effects.setFlags || []) state.flags.add(flag);
  for (const flag of effects.unsetFlags || []) state.flags.delete(flag);
  for (const factId of effects.revealFacts || []) revealFact(factId, state, context);
  for (const entry of effects.setProps || []) state.props.set(entry.propId, entry.state);
}
function applyCue(cue, state, context) {
  if (!conditionMatches(cue.when, state)) return;
  if (cue.type === "parallel") for (const child of cue.cues || []) applyCue(child, state, `${context}/${child.id}`);
  if (cue.type === "fact.reveal" && cue.factId) revealFact(cue.factId, state, context);
  if (cue.type === "prop.set" && cue.propId && cue.state !== undefined) state.props.set(cue.propId, cue.state);
  applyEffects(cue.effects, state, context);
}
function enterBeat(state, beatId) {
  const next = cloneState(state);
  next.beat = beatId;
  for (const fact of facts.values()) if (!fact.earliestReveal || fact.earliestReveal === beatId) next.gates.add(fact.id);
  const beat = beats.get(beatId);
  for (const cue of beat.cues || []) applyCue(cue, next, `${beatId}/${cue.id || cue.type}`);
  return next;
}
function stateKey(state) {
  const sorted = (values) => [...values].sort().join(",");
  return [state.beat, sorted(state.flags), sorted(state.knownFacts), sorted(state.gates), [...state.props].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(",")].join("|");
}
function matchingEdges(beat, state) {
  const matches = (beat.next || []).filter((edge) => conditionMatches(edge.when, state));
  const autos = matches.filter((edge) => (edge.kind || "auto") === "auto");
  if (autos.length) {
    const highest = Math.max(...autos.map((edge) => Number(edge.priority || 0)));
    return autos.filter((edge) => Number(edge.priority || 0) === highest);
  }
  return matches.filter((edge) => edge.kind === "choice");
}

const initial = {
  beat: root.performance.entryBeat,
  flags: new Set((root.flags || []).filter((flag) => flag.initial).map((flag) => flag.id)),
  knownFacts: new Set((root.story?.facts || []).filter((fact) => fact.initiallyKnown).map((fact) => fact.id)),
  gates: new Set(),
  props: new Map((root.world?.props || []).map((prop) => [prop.id, prop.initialState])),
};
const start = enterBeat(initial, root.performance.entryBeat);
const startKey = stateKey(start);
const nodes = new Map([[startKey, { state: start, trace: [root.performance.entryBeat] }]]);
const adjacency = new Map();
const reverse = new Map();
const queue = [startKey];
const successes = new Set();
const failedTerminals = [];
const deadEnds = [];
const reachedBeats = new Set();
const reachedEndings = new Set();
let capped = false;

function link(from, nextState, traceStep) {
  const key = stateKey(nextState);
  if (!adjacency.has(from)) adjacency.set(from, new Set());
  adjacency.get(from).add(key);
  if (!reverse.has(key)) reverse.set(key, new Set());
  reverse.get(key).add(from);
  if (!nodes.has(key)) {
    if (nodes.size >= options.maxStates) { capped = true; return; }
    nodes.set(key, { state: nextState, trace: [...nodes.get(from).trace, traceStep] });
    queue.push(key);
  }
}

while (queue.length && !capped) {
  const key = queue.shift();
  const { state, trace } = nodes.get(key);
  const beat = beats.get(state.beat);
  reachedBeats.add(beat.id);
  if (beat.terminal === true) {
    const missingFacts = requiredFacts.filter((factId) => !state.knownFacts.has(factId));
    if (endingIds.has(beat.endingId) && missingFacts.length === 0) {
      successes.add(key);
      reachedEndings.add(beat.endingId);
    } else failedTerminals.push({ beat: beat.id, endingId: beat.endingId, missingFacts, trace });
    continue;
  }

  const availableActions = (beat.actions || []).filter((action) => conditionMatches(action.when, state));
  const candidates = availableActions.length
    ? availableActions.map((action) => {
        const next = cloneState(state);
        applyEffects(action.effects, next, `${beat.id}/${action.id}`);
        return { state: next, label: action.id };
      })
    : [{ state: cloneState(state), label: "continue" }];

  let emitted = 0;
  for (const candidate of candidates) {
    const edges = matchingEdges(beat, candidate.state);
    if (edges.length === 0 && availableActions.length) {
      const sameBeat = enterBeat(candidate.state, beat.id);
      if (stateKey(sameBeat) !== key) { link(key, sameBeat, `${candidate.label} -> ${beat.id}`); emitted += 1; }
      continue;
    }
    for (const edge of edges) {
      const afterEdge = cloneState(candidate.state);
      applyEffects(edge.effects, afterEdge, `${beat.id}->${edge.to}`);
      link(key, enterBeat(afterEdge, edge.to), `${candidate.label} -> ${edge.to}`);
      emitted += 1;
    }
  }
  if (emitted === 0) deadEnds.push({ beat: beat.id, trace });
}

const canReachSuccess = new Set(successes);
const reverseQueue = [...successes];
while (reverseQueue.length) {
  const key = reverseQueue.shift();
  for (const predecessor of reverse.get(key) || []) {
    if (!canReachSuccess.has(predecessor)) { canReachSuccess.add(predecessor); reverseQueue.push(predecessor); }
  }
}
const trapped = [...nodes.keys()].filter((key) => !canReachSuccess.has(key));
const unreachableBeats = [...beats.keys()].filter((id) => !reachedBeats.has(id)).sort();
const unreachableEndings = [...endingIds].filter((id) => !reachedEndings.has(id)).sort();
const uniqueRevealViolations = [...new Map(revealViolations.map((item) => [`${item.factId}|${item.at}`, item])).values()];

const errors = [];
const warnings = [];
if (capped) errors.push(`state limit ${options.maxStates} reached`);
if (!successes.size) errors.push("entry state cannot reach a valid ending");
if (deadEnds.length) errors.push(`${deadEnds.length} reachable dead-end state(s)`);
if (failedTerminals.length) errors.push(`${failedTerminals.length} terminal state(s) miss required facts or a valid ending`);
if (trapped.length) errors.push(`${trapped.length} reachable state(s) cannot reach a valid ending`);
if (uniqueRevealViolations.length) errors.push(`${uniqueRevealViolations.length} reveal gate violation(s)`);
if (unreachableBeats.length) warnings.push(`${unreachableBeats.length} unreachable beat(s)`);
if (unreachableEndings.length) warnings.push(`${unreachableEndings.length} unreachable ending(s)`);

const failed = errors.length > 0 || (options.strict && warnings.length > 0);
const result = {
  valid: !failed,
  strict: options.strict,
  file: inputPath,
  statesExplored: nodes.size,
  reachableBeats: reachedBeats.size,
  totalBeats: beats.size,
  successfulTerminalStates: successes.size,
  reachedEndings: [...reachedEndings].sort(),
  unreachableBeats,
  unreachableEndings,
  deadEnds: deadEnds.slice(0, 10),
  failedTerminals: failedTerminals.slice(0, 10),
  revealViolations: uniqueRevealViolations.slice(0, 20),
  trappedStates: trapped.length,
  errors,
  warnings,
};
if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  for (const message of errors) console.log(`ERROR: ${message}`);
  for (const message of warnings) console.log(`WARNING: ${message}`);
  console.log(`${failed ? "FAILED" : "PASSED"}: explored ${nodes.size} state(s), reached ${reachedBeats.size}/${beats.size} beat(s) and ${reachedEndings.size}/${endingIds.size} ending(s).`);
}
if (failed) process.exitCode = 1;

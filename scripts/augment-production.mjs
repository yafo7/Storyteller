#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionPath = path.join(projectRoot, "data", "production.json");
const sourcePath = path.join(projectRoot, "data", "script.txt");
const production = JSON.parse(fs.readFileSync(productionPath, "utf8").replace(/^\uFEFF/, ""));

const ID = /^[a-z0-9][a-z0-9._-]*$/;
const sourceId = "source.main";
const sceneBeatId = (sceneId) => `beat.${sceneId}`;

function assertId(id, context) {
  if (!ID.test(id)) throw new Error(`${context} is not a canonical identifier: ${id}`);
  return id;
}

function sourceSpan(reference) {
  const match = /^data\/script\.txt:(\d+)-(\d+)$/.exec(reference);
  if (!match) throw new Error(`Unsupported source reference: ${reference}`);
  return {
    sourceId,
    startLine: Number(match[1]),
    endLine: Number(match[2]),
    confidence: 1,
  };
}

function collectFactAssignments() {
  const assigned = new Map();
  const assign = (factId, scene) => {
    if (production.facts[factId] && !assigned.has(factId)) assigned.set(factId, scene.id);
  };

  for (const scene of production.scenes) {
    for (const cue of scene.cues || []) {
      for (const factId of cue.factIds || []) assign(factId, scene);
      if (cue.factId) assign(cue.factId, scene);
    }
    for (const interaction of scene.exploration?.interactions || []) {
      for (const factId of interaction.revealFacts || []) assign(factId, scene);
    }
    for (const factId of scene.skipEffects?.revealFacts || []) assign(factId, scene);
  }

  const finalScene = production.scenes.at(-1);
  for (const factId of Object.keys(production.facts)) {
    if (!assigned.has(factId)) assigned.set(factId, finalScene.id);
  }
  return assigned;
}

function collectFlags() {
  const ids = new Set();
  for (const scene of production.scenes) {
    for (const id of scene.worldState?.flags || []) ids.add(id);
    for (const id of scene.exploration?.requiredFlags || []) ids.add(id);
    for (const interaction of scene.exploration?.interactions || []) {
      for (const id of interaction.setFlags || []) ids.add(id);
    }
    for (const id of scene.skipEffects?.setFlags || []) ids.add(id);
  }
  return [...ids].sort().map((id) => ({ id: assertId(id, "flag"), initial: false }));
}

function collectPropStates(propId, initialState) {
  const states = new Set([initialState]);
  for (const scene of production.scenes) {
    for (const cue of scene.cues || []) {
      if (cue.type === "prop" && cue.propId === propId && typeof cue.state === "string") states.add(cue.state);
    }
    for (const interaction of scene.exploration?.interactions || []) {
      if (interaction.propState?.propId === propId && typeof interaction.propState.state === "string") {
        states.add(interaction.propState.state);
      }
    }
    for (const state of scene.skipEffects?.propStates || []) {
      if (state.propId === propId && typeof state.state === "string") states.add(state.state);
    }
  }
  return [...states];
}

function anchorKind(anchorId) {
  if (/(door|entry|gate|steps|landing)/.test(anchorId)) return "entrance";
  if (/(table|desk|bed|window|curtain|grave|pillow|rifle|slate|sign|book|letter|key)/.test(anchorId)) return "prop";
  if (/(hide|fog|shadow|corner)/.test(anchorId)) return "concealment";
  return "focus";
}

const factAssignments = collectFactAssignments();
const canonicalFacts = Object.values(production.facts).map((fact) => ({
  id: assertId(fact.id, "fact"),
  text: fact.summary,
  immutable: true,
  required: true,
  earliestReveal: sceneBeatId(factAssignments.get(fact.id)),
  sourceRefs: fact.sourceRefs.map(sourceSpan),
  label: fact.title,
  category: fact.category,
  spoiler: fact.spoiler,
}));

const characterKnowledge = new Map(Object.keys(production.actors).map((id) => [id, new Set()]));
for (const scene of production.scenes) {
  for (const cue of scene.cues || []) {
    if (cue.type !== "say" || !characterKnowledge.has(cue.actorId)) continue;
    for (const factId of cue.factIds || []) characterKnowledge.get(cue.actorId).add(factId);
  }
}
const canonicalCharacters = Object.entries(production.actors).map(([id, actor]) => ({
  id: assertId(id, "character"),
  name: actor.name,
  knowledge: [...characterKnowledge.get(id)].filter((factId) => production.facts[factId]),
  beliefs: [],
  role: actor.role,
}));

const canonicalStages = Object.entries(production.maps).map(([id, stage]) => ({
  id: assertId(id, "stage"),
  label: stage.name,
  anchors: Object.keys(stage.anchors).map((anchorId) => ({
    id: assertId(anchorId, `anchor in ${id}`),
    kind: anchorKind(anchorId),
  })),
}));

const firstActorPlacement = new Map();
for (const scene of production.scenes) {
  for (const actor of scene.actors || []) {
    if (!firstActorPlacement.has(actor.actorId)) {
      firstActorPlacement.set(actor.actorId, { stageId: scene.mapId, anchorId: actor.anchor });
    }
  }
}
const canonicalActors = Object.keys(production.actors).map((id) => {
  const placement = firstActorPlacement.get(id);
  if (!placement) throw new Error(`Actor ${id} has no stage placement`);
  return {
    id: assertId(id, "actor"),
    characterId: id,
    stageId: placement.stageId,
    anchorId: placement.anchorId,
  };
});

const canonicalProps = [];
for (const [stageId, stage] of Object.entries(production.maps)) {
  for (const prop of stage.props) {
    canonicalProps.push({
      id: assertId(prop.id, "prop"),
      prototype: prop.type || "inspectable",
      stageId,
      anchorId: prop.anchor,
      initialState: prop.state,
      states: collectPropStates(prop.id, prop.state),
    });
  }
}

const factsByScene = new Map(production.scenes.map((scene) => [scene.id, []]));
for (const fact of canonicalFacts) factsByScene.get(factAssignments.get(fact.id)).push(fact.id);

const canonicalScenes = production.scenes.map((scene) => ({
  id: scene.id,
  label: scene.title,
  stageId: scene.mapId,
  entryBeat: sceneBeatId(scene.id),
  required: true,
}));
const canonicalBeats = production.scenes.map((scene, index) => {
  const isLast = index === production.scenes.length - 1;
  const factCues = factsByScene.get(scene.id).map((factId) => ({
    id: `cue.fact.${factId}`,
    type: "fact.reveal",
    factId,
  }));
  return {
    id: sceneBeatId(scene.id),
    sceneId: scene.id,
    stageId: scene.mapId,
    mode: scene.exploration?.interactions?.length ? "exploration" : "performance",
    cues: [
      {
        id: `cue.stage.${scene.id}`,
        type: "dialogue.silence",
        durationMs: 0,
      },
      ...factCues,
    ],
    actions: [],
    next: isLast ? [] : [{ to: sceneBeatId(production.scenes[index + 1].id), kind: "auto" }],
    ...(isLast ? { terminal: true, endingId: "ending.curtain" } : {}),
    runtimeSceneId: scene.id,
    runtimeCueCount: scene.cues.length,
    runtimeInteractionCount: scene.exploration?.interactions?.length || 0,
  };
});

const sourceBuffer = fs.readFileSync(sourcePath);
const canonical = {
  $schema: "interactive-stage-production/v1",
  schemaVersion: "1.0.0",
  id: production.meta.id,
  title: production.meta.title,
  language: production.meta.language,
  adaptation: {
    mode: production.meta.adaptationMode,
    playerAgency: "actor-role",
    targetMinutes: production.meta.targetMinutes,
  },
  sources: [{
    id: sourceId,
    path: production.meta.sourcePath,
    kind: "screenplay-transcript",
    sha256: crypto.createHash("sha256").update(sourceBuffer).digest("hex"),
  }],
  flags: collectFlags(),
  story: {
    facts: canonicalFacts,
    characters: canonicalCharacters,
    evidence: canonicalFacts
      .filter((fact) => ["contradiction", "evidence", "testimony", "reveal"].includes(fact.category))
      .map((fact) => ({
        id: `evidence.${fact.id}`,
        label: fact.label,
        supports: [fact.id],
        sourceRefs: fact.sourceRefs,
      })),
    adaptationLedger: [],
  },
  world: {
    stages: canonicalStages,
    actors: canonicalActors,
    props: canonicalProps,
  },
  performance: {
    entryBeat: sceneBeatId(production.settings.initialSceneId),
    scenes: canonicalScenes,
    beats: canonicalBeats,
    endings: [{ id: "ending.curtain", label: "演出终了" }],
  },
  ui: {
    controls: [
      { action: "move", bindings: ["KeyW", "KeyA", "KeyS", "KeyD"], label: "移动" },
      { action: "interact", bindings: ["KeyE"], label: "互动／继续" },
      { action: "pause", bindings: ["Escape"], label: "暂停" },
      { action: "journal", bindings: ["KeyJ"], label: "调查手记" },
      { action: "history", bindings: ["KeyH"], label: "台词回看" },
    ],
    accessibility: {
      captions: true,
      reducedMotion: false,
      highContrastFocus: true,
      textSpeed: production.settings.textSpeed,
    },
  },
  assets: [],
};

const runtimeKeys = ["version", "meta", "settings", "maps", "actors", "facts", "scenes"];
const output = { ...canonical };
for (const key of runtimeKeys) output[key] = production[key];
fs.writeFileSync(productionPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Augmented ${path.relative(projectRoot, productionPath)} with canonical Story/Stage/Performance IR.`);
console.log(`${canonicalFacts.length} facts, ${canonicalStages.length} stages, ${canonicalBeats.length} beats, ${canonicalProps.length} props.`);

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const rootArg = args.find((arg) => !arg.startsWith('--'));
if (!rootArg) {
  console.error('Usage: node validate-narrative-integration.mjs <project-root> [--strict]');
  process.exit(2);
}

const root = path.resolve(rootArg);
const failures = [];
const results = [];
const requiredPhases = {
  arrival: ['setup', 'signal', 'response', 'threshold-action', 'introduction', 'orientation', 'consequence'],
  discovery: ['setup', 'notice', 'inspect', 'interpretation', 'consequence'],
  transformation: ['foreshadow', 'trigger', 'visible-change', 'reaction', 'new-affordance'],
  confrontation: ['approach', 'claim', 'resistance', 'turn', 'consequence', 'breath'],
  ritual: ['preparation', 'placement', 'response', 'escalation', 'revelation', 'aftermath'],
  departure: ['decision', 'preparation', 'threshold-action', 'separation', 'aftermath'],
  other: ['setup', 'event', 'reaction', 'consequence', 'transition']
};

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    results.push({ file: relative, state: strict ? 'missing' : 'pending' });
    if (strict) failures.push({ file: relative, issue: 'missing required artifact' });
    return null;
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    results.push({ file: relative, state: value.status || 'present' });
    return value;
  } catch (error) {
    failures.push({ file: relative, issue: `invalid JSON: ${error.message}` });
    return null;
  }
}

function expect(ok, file, field, expected) {
  if (!ok) failures.push({ file, field, expected });
}
function nonempty(value) { return typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : Boolean(value); }
function bounds(value) { return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && value[2] > 0 && value[3] > 0; }
function fileExists(relative) { return typeof relative === 'string' && fs.existsSync(path.resolve(root, relative)); }

const ledgerPath = 'generated/30-performance/source-event-ledger.json';
const integrationPath = 'generated/40-world/scene-integration.json';
const bindingsPath = 'generated/50-art/runtime-asset-bindings.json';
const manifestPath = 'generated/50-art/asset-manifest.json';
const ledger = read(ledgerPath);
const integration = read(integrationPath);
const bindings = read(bindingsPath);
const manifest = read(manifestPath);

if (ledger) {
  expect(ledger.status === 'approved', ledgerPath, 'status', 'approved');
  expect(Array.isArray(ledger.sequences) && ledger.sequences.length > 0, ledgerPath, 'sequences', 'nonempty event clusters');
  let priorOrder = -Infinity;
  for (const sequence of ledger.sequences || []) {
    expect(nonempty(sequence.id), ledgerPath, 'sequence.id', 'stable ID');
    expect(Number.isFinite(sequence.sourceOrder) && sequence.sourceOrder > priorOrder, ledgerPath, `${sequence.id}.sourceOrder`, 'strictly increasing source order');
    priorOrder = Number.isFinite(sequence.sourceOrder) ? sequence.sourceOrder : priorOrder;
    expect(nonempty(sequence.sourceSpan), ledgerPath, `${sequence.id}.sourceSpan`, 'source line/time span');
    expect(nonempty(sequence.transitionIn), ledgerPath, `${sequence.id}.transitionIn`, 'causal entry bridge');
    expect(nonempty(sequence.transitionOut), ledgerPath, `${sequence.id}.transitionOut`, 'causal exit bridge');
    expect(nonempty(sequence.nextDramaticQuestion), ledgerPath, `${sequence.id}.nextDramaticQuestion`, 'next dramatic question');
    const expected = requiredPhases[sequence.sequenceType];
    expect(Boolean(expected), ledgerPath, `${sequence.id}.sequenceType`, Object.keys(requiredPhases).join('|'));
    const phases = sequence.phases || [];
    const phaseNames = phases.map((phase) => phase.phase);
    for (const phase of expected || []) expect(phaseNames.includes(phase), ledgerPath, `${sequence.id}.phases`, `include ${phase}`);
    let dialogueOnlyRun = 0;
    for (const phase of phases) {
      const isOnlyDialogue = phase.deliveryMode === 'dialogue-only';
      dialogueOnlyRun = isOnlyDialogue ? dialogueOnlyRun + 1 : 0;
      expect(!['reported-only', 'summary', 'riddle-only'].includes(phase.deliveryMode), ledgerPath, `${sequence.id}.${phase.phase}.deliveryMode`, 'enacted or interactive delivery');
      expect(dialogueOnlyRun <= 2, ledgerPath, `${sequence.id}.dialogueOnlyRun`, 'at most two consecutive dialogue-only phases');
      expect(Array.isArray(phase.actorIds), ledgerPath, `${sequence.id}.${phase.phase}.actorIds`, 'actor ID list');
      expect(phase.playerWitness === true, ledgerPath, `${sequence.id}.${phase.phase}.playerWitness`, true);
      expect(nonempty(phase.dialogueIntent) || nonempty(phase.physicalAction), ledgerPath, `${sequence.id}.${phase.phase}`, 'dialogue intent or physical action');
    }
  }
}

const registrationIds = new Set();
if (integration) {
  expect(integration.status === 'approved', integrationPath, 'status', 'approved');
  expect(Array.isArray(integration.maps) && integration.maps.length > 0, integrationPath, 'maps', 'nonempty scene registrations');
  for (const map of integration.maps || []) {
    expect(nonempty(map.mapId), integrationPath, 'map.mapId', 'stable map ID');
    expect(nonempty(map.sceneAssetId), integrationPath, `${map.mapId}.sceneAssetId`, 'scene asset ID');
    expect(Array.isArray(map.sourceImageSize) && map.sourceImageSize.length === 2, integrationPath, `${map.mapId}.sourceImageSize`, '[width,height]');
    expect(Array.isArray(map.logicalSize) && map.logicalSize.length === 2, integrationPath, `${map.mapId}.logicalSize`, '[width,height]');
    expect(nonempty(map.fitTransform), integrationPath, `${map.mapId}.fitTransform`, 'documented crop/fit transform');
    expect(Array.isArray(map.interactionSockets) && map.interactionSockets.length > 0, integrationPath, `${map.mapId}.interactionSockets`, 'reserved sockets');
    for (const socket of map.interactionSockets || []) expect(bounds(socket.logicalBounds), integrationPath, `${map.mapId}.${socket.id}.logicalBounds`, '[x,y,w,h]');
    const features = map.registrations || [];
    for (const feature of features) {
      registrationIds.add(feature.id);
      expect(bounds(feature.visualBounds), integrationPath, `${feature.id}.visualBounds`, '[x,y,w,h]');
      expect(bounds(feature.logicBounds), integrationPath, `${feature.id}.logicBounds`, '[x,y,w,h]');
      expect(Number.isFinite(feature.maxErrorPx), integrationPath, `${feature.id}.maxErrorPx`, 'finite tolerance');
      expect(Number.isFinite(feature.measuredErrorPx) && feature.measuredErrorPx <= feature.maxErrorPx, integrationPath, `${feature.id}.measuredErrorPx`, 'within tolerance');
      expect(fileExists(feature.overlayScreenshot), integrationPath, `${feature.id}.overlayScreenshot`, 'existing overlay screenshot');
      expect(feature.status === 'pass', integrationPath, `${feature.id}.status`, 'pass');
    }
    const registered = new Set(features.map((feature) => feature.id));
    for (const id of map.requiredFeatureIds || []) expect(registered.has(id), integrationPath, `${map.mapId}.requiredFeatureIds`, `registered ${id}`);
  }
}

const assets = manifest?.assets || [];
const byId = new Map(assets.map((asset) => [asset.id, asset]));
if (bindings) {
  expect(bindings.status === 'approved', bindingsPath, 'status', 'approved');
  expect(Array.isArray(bindings.characters) && bindings.characters.length > 0, bindingsPath, 'characters', 'nonempty character bindings');
  expect(Array.isArray(bindings.interactables) && bindings.interactables.length > 0, bindingsPath, 'interactables', 'nonempty interactable bindings');
  const boundCharacters = new Set((bindings.characters || []).map((entry) => entry.characterId));
  const boundInteractables = new Set((bindings.interactables || []).map((entry) => entry.interactionId));
  for (const id of bindings.requiredCharacterIds || []) expect(boundCharacters.has(id), bindingsPath, 'requiredCharacterIds', `bound ${id}`);
  for (const id of bindings.requiredInteractableIds || []) expect(boundInteractables.has(id), bindingsPath, 'requiredInteractableIds', `bound ${id}`);

  for (const character of bindings.characters || []) {
    const identity = byId.get(character.identityAssetId);
    const sprite = byId.get(character.runtimeSpriteAssetId);
    expect(Boolean(identity), bindingsPath, `${character.characterId}.identityAssetId`, 'manifest asset');
    expect(Boolean(sprite), bindingsPath, `${character.characterId}.runtimeSpriteAssetId`, 'manifest asset');
    expect(identity?.originType === 'ai-original-generation', bindingsPath, `${character.characterId}.identity.originType`, 'ai-original-generation');
    expect(nonempty(identity?.generationJobId), bindingsPath, `${character.characterId}.identity.generationJobId`, 'stable AI generation job ID');
    expect(Array.isArray(sprite?.aiSourceAssetIds) && sprite.aiSourceAssetIds.includes(character.identityAssetId), bindingsPath, `${character.characterId}.sprite.aiSourceAssetIds`, 'include identity asset');
    expect(sprite?.directVisualDerivative === true, bindingsPath, `${character.characterId}.sprite.directVisualDerivative`, true);
    expect(character.directVisualDerivative === true, bindingsPath, `${character.characterId}.directVisualDerivative`, true);
    const frame = character.runtimeBinding?.frameSize || sprite?.pixelSpec?.frameSize;
    const exception = character.readabilityException;
    expect((Array.isArray(frame) && frame[0] >= 24 && frame[1] >= 32) || nonempty(exception), bindingsPath, `${character.characterId}.runtimeBinding.frameSize`, 'at least 24x32 or documented exception');
    expect(character.runtimeBinding?.fourDirections === true, bindingsPath, `${character.characterId}.runtimeBinding.fourDirections`, true);
    expect(fileExists(character.runtimeBinding?.inEngineScreenshot), bindingsPath, `${character.characterId}.runtimeBinding.inEngineScreenshot`, 'existing screenshot');
    expect(character.identityComparison?.status === 'pass', bindingsPath, `${character.characterId}.identityComparison.status`, 'pass');
  }

  for (const item of bindings.interactables || []) {
    const environment = byId.get(item.environmentAssetId);
    expect(Boolean(environment), bindingsPath, `${item.interactionId}.environmentAssetId`, 'manifest asset');
    expect(item.alwaysComposited === true, bindingsPath, `${item.interactionId}.alwaysComposited`, true);
    expect(item.backgroundContainsCriticalObject === false, bindingsPath, `${item.interactionId}.backgroundContainsCriticalObject`, false);
    expect(item.alphaSeparated === true, bindingsPath, `${item.interactionId}.alphaSeparated`, true);
    expect(item.focusTreatment?.nonColorCue === true, bindingsPath, `${item.interactionId}.focusTreatment.nonColorCue`, true);
    expect(registrationIds.has(item.placement?.registrationId), bindingsPath, `${item.interactionId}.placement.registrationId`, 'scene registration ID');
    expect(Array.isArray(item.stateAssetIds) && item.stateAssetIds.length > 0, bindingsPath, `${item.interactionId}.stateAssetIds`, 'nonempty prop states');
    for (const assetId of item.stateAssetIds || []) {
      const prop = byId.get(assetId);
      expect(Boolean(prop), bindingsPath, `${item.interactionId}.stateAssetIds`, `manifest asset ${assetId}`);
      expect(prop?.originType === 'ai-original-generation', bindingsPath, `${assetId}.originType`, 'ai-original-generation');
      expect(nonempty(prop?.generationJobId), bindingsPath, `${assetId}.generationJobId`, 'stable prop generation job ID');
      expect(prop?.generationJobId !== environment?.generationJobId, bindingsPath, `${assetId}.generationJobId`, 'different from environment generation job');
    }
    expect(fileExists(item.runtimeBinding?.inEngineScreenshot), bindingsPath, `${item.interactionId}.runtimeBinding.inEngineScreenshot`, 'existing in-engine screenshot');
  }
}

console.log(JSON.stringify({ root, strict, status: failures.length ? 'fail' : 'pass', results, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;


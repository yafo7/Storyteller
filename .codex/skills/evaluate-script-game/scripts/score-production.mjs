#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const load = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const gates = [];
const gate = (id, pass, ownerSkill, evidence) => gates.push({ id, status: pass ? 'pass' : 'fail', ownerSkill, evidence });

try {
  const gameplay = load('generated/20-design/gameplay-design.json');
  const performance = load('generated/30-performance/performance-plan.json');
  const world = load('generated/40-world/stage-plan.json');
  const assets = load('generated/50-art/asset-manifest.json');

  const mechanics = gameplay.mechanics || [];
  const interactions = gameplay.interactionTransactions || [];
  const transforming = mechanics.some((item) => (item.stateDimensions || []).some((value) =>
    ['access', 'topology', 'danger', 'actor-behavior', 'world-layer'].includes(value)
  ));
  const weakInteractions = interactions.filter((item) => new Set(item.consequenceChannels || []).size < 2).map((item) => item.id);
  const beats = performance.beats || [];
  const weakBeats = beats.filter((item) => !item.playerQuestion || !item.turn || !item.consequence || item.intensity === undefined || !item.exitGate).map((item) => item.id);
  const variants = world.stateVariants || [];
  const missingAssets = (assets.assets || []).filter((item) => !['approved', 'waived'].includes(item.status)).map((item) => item.id);
  const licenseGaps = (assets.assets || []).filter((item) => item.generationMethod === 'external' && (!item.license || !item.source)).map((item) => item.id);

  gate('gameplay.core-mechanic', mechanics.length >= 1, 'design-narrative-gameplay', { count: mechanics.length });
  gate('gameplay.world-transformation', transforming, 'design-narrative-gameplay', { transforming });
  gate('gameplay.interaction-consequences', weakInteractions.length === 0 && interactions.length > 0, 'design-narrative-gameplay', { weakInteractions, count: interactions.length });
  gate('performance.complete-beats', weakBeats.length === 0 && beats.length > 0, 'direct-interactive-drama', { weakBeats, count: beats.length });
  gate('world.state-variants', variants.length > 0, 'design-stage-and-levels', { count: variants.length });
  gate('art.asset-readiness', missingAssets.length === 0 && (assets.assets || []).length > 0, 'art-direct-game-assets', { missingAssets, count: (assets.assets || []).length });
  gate('art.license-provenance', licenseGaps.length === 0, 'art-direct-game-assets', { licenseGaps });
} catch (error) {
  gate('evaluation.inputs', false, 'build-interactive-stage-game', { error: error.message });
}

const failures = gates.filter((item) => item.status === 'fail');
console.log(JSON.stringify({ status: failures.length ? 'fail' : 'pass', gates }, null, 2));
process.exitCode = failures.length ? 1 : 0;

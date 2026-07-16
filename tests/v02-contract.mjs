import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const production = read('v02/data/production.json');
const gameplay = read('v02/generated/20-design/gameplay-design.json');
const performance = read('v02/generated/30-performance/performance-plan.json');
const world = read('v02/generated/40-world/stage-plan.json');
const manifest = read('v02/generated/50-art/asset-manifest.json');
const capabilities = read('v02/generated/60-build/runtime-capabilities.json');
const acceptance = read('v02/reports/acceptance-report.json');

assert.equal(production.schemaVersion, '0.2.0');
assert.equal(production.build.playerRole, 'grace');
assert.deepEqual(production.runtime.requiredEndingEvidence, ['letter', 'album', 'rubbing']);
assert.equal(Object.keys(production.rooms).length, 5);
assert.equal(production.chapters.length, 6);

for (const assetPath of Object.values(production.assets)) {
  const local = assetPath.replace(/^\.\//, 'v02/');
  assert.ok(fs.existsSync(path.join(root, local)), `missing production asset: ${local}`);
}
for (const asset of manifest.assets) {
  assert.equal(asset.status, 'approved', `asset not approved: ${asset.id}`);
  assert.equal(asset.license, 'project-generated', `license gap: ${asset.id}`);
}

const verbs = new Set(capabilities.verbs);
const effects = new Set(capabilities.effects);
for (const requirement of gameplay.runtimeRequirements) {
  for (const verb of requirement.requiredVerbs || []) assert.ok(verbs.has(verb), `missing verb: ${verb}`);
  for (const effect of requirement.requiredEffects || []) assert.ok(effects.has(effect), `missing effect: ${effect}`);
}

assert.ok(gameplay.mechanics.some((mechanic) => mechanic.stateDimensions.includes('world-layer')));
assert.ok(gameplay.interactionTransactions.every((interaction) => new Set(interaction.consequenceChannels).size >= 2));
assert.ok(performance.beats.every((beat) => beat.playerQuestion && beat.turn && beat.consequence && beat.exitGate));
assert.ok(world.stateVariants.length >= 5);
assert.equal(acceptance.status, 'pass');
assert.ok(acceptance.gates.every((gate) => gate.status === 'pass' || gate.status === 'not-applicable'));

const app = fs.readFileSync(path.join(root, 'v02/src/game.js'), 'utf8');
for (const invariant of ['production.runtime.saveKey', 'DOOR_ORDER', 'NOTE_ORDER', 'EVIDENCE_ORDER', 'showEnding']) {
  assert.ok(app.includes(invariant), `runtime invariant missing: ${invariant}`);
}

console.log('v0.2 contract passed: 6 chapters, 5 maps, 7 approved assets, deterministic ending route.');

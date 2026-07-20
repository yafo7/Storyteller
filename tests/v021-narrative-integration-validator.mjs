import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('tests/pixel-v021-fixture');
const validator = path.resolve('.codex/skills/build-interactive-stage-game-v021/scripts/validate-narrative-integration.mjs');
const testsRoot = path.resolve('tests');
const temporary = path.resolve(testsRoot, '.tmp-v021-integration-negative');
assert.ok(temporary.startsWith(`${testsRoot}${path.sep}`));

function run(projectRoot) {
  return spawnSync(process.execPath, [validator, projectRoot, '--strict'], { encoding: 'utf8' });
}
function negativeCase(name, relative, mutate, expected) {
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.cpSync(root, temporary, { recursive: true });
  const file = path.join(temporary, relative);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const result = run(temporary);
  fs.rmSync(temporary, { recursive: true, force: true });
  assert.notEqual(result.status, 0, `${name} must fail\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, expected);
}

const positive = run(root);
assert.equal(positive.status, 0, positive.stdout + positive.stderr);

negativeCase(
  'summarized arrival',
  'generated/30-performance/source-event-ledger.json',
  (value) => { value.sequences[0].phases = value.sequences[0].phases.filter((phase) => phase.phase !== 'signal'); },
  /include signal/
);
negativeCase(
  'misregistered scene logic',
  'generated/40-world/scene-integration.json',
  (value) => { value.maps[0].registrations[0].measuredErrorPx = 12; },
  /within tolerance/
);
negativeCase(
  'proximity-preview-only prop',
  'generated/50-art/runtime-asset-bindings.json',
  (value) => { value.interactables[0].alwaysComposited = false; },
  /alwaysComposited/
);
negativeCase(
  'concept-only AI character',
  'generated/50-art/asset-manifest.json',
  (value) => { value.assets.find((asset) => asset.id === 'asset.sprite.fixture').directVisualDerivative = false; },
  /directVisualDerivative/
);

console.log(JSON.stringify({
  status: 'pass',
  positiveFixture: true,
  summarizedArrivalRejected: true,
  sceneMismatchRejected: true,
  previewOnlyPropRejected: true,
  conceptOnlyCharacterRejected: true
}, null, 2));


import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('tests/pixel-v021-fixture');
const validator = path.resolve('.codex/skills/build-interactive-stage-game-v021/scripts/validate-art-production.mjs');
const positive = spawnSync(process.execPath, [validator, root, '--strict'], { encoding: 'utf8' });
assert.equal(positive.status, 0, positive.stdout + positive.stderr);

const testsRoot = path.resolve('tests');
const temporary = path.resolve(testsRoot, '.tmp-v021-art-negative');
assert.ok(temporary.startsWith(`${testsRoot}${path.sep}`));
fs.rmSync(temporary, { recursive: true, force: true });
fs.cpSync(root, temporary, { recursive: true });
const manifestPath = path.join(temporary, 'generated/50-art/asset-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const productionAsset = manifest.assets.find((asset) => asset.productionUse === true);
productionAsset.generationMethod = 'geometric placeholder';
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const negative = spawnSync(process.execPath, [validator, temporary, '--strict'], { encoding: 'utf8' });
fs.rmSync(temporary, { recursive: true, force: true });
assert.notEqual(negative.status, 0, 'placeholder production asset must fail the art gate');
assert.match(negative.stdout, /non-placeholder method/);
console.log(JSON.stringify({ status: 'pass', positiveFixture: true, placeholderRejected: true }, null, 2));

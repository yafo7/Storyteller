import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');

const html = read('index.html');
const requiredUi = [
  'stage-canvas', 'title-screen', 'start-button', 'continue-button', 'loading-screen',
  'scene-card', 'dialogue-panel', 'speaker-name', 'dialogue-text', 'interaction-prompt',
  'objective-panel', 'journal-panel', 'journal-list', 'history-panel', 'history-list',
  'pause-menu', 'ending-screen', 'ending-title', 'ending-text', 'toast'
];
for (const id of requiredUi) assert.match(html, new RegExp(`id=["']${id}["']`), `Missing UI #${id}`);
assert.doesNotMatch(html, /cdnjs|unpkg|jsdelivr/i, 'Runtime must not depend on a public CDN');

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const textExtensions = /\.(?:js|mjs|json|html|css|md|txt)$/i;
for (const file of walk(root).filter(path => textExtensions.test(path) && !path.includes(`${join(root, 'history_')}`))) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /sk-[A-Za-z0-9]{20,}/, `Credential-like token in ${relative(root, file)}`);
}

const productionPath = join(root, 'data', 'production.json');
if (statSync(productionPath).isFile()) {
  const production = JSON.parse(readFileSync(productionPath, 'utf8'));
  assert.equal(Number(String(production.version).split('.')[0]), 1, 'Story Package major version must be 1');
  assert.ok(production.maps && Object.keys(production.maps).length >= 4, 'At least four stage maps required');
  assert.ok(production.actors?.grace, 'Grace must be a canonical actor');
  assert.ok(Array.isArray(production.scenes) && production.scenes.length >= 8, 'Eight scenes required');

  const sceneIds = new Set(production.scenes.map(scene => scene.id));
  const actorIds = new Set(Object.keys(production.actors));
  for (const scene of production.scenes) {
    assert.ok(production.maps[scene.mapId], `Unknown map ${scene.mapId} in ${scene.id}`);
    if (scene.nextSceneId) assert.ok(sceneIds.has(scene.nextSceneId), `Unknown nextSceneId ${scene.nextSceneId}`);
    for (const entry of scene.actors || []) assert.ok(actorIds.has(entry.actorId || entry.id), `Unknown actor in ${scene.id}`);
    for (const cue of scene.cues || []) {
      const cueActor = cue.actorId || cue.actor;
      if (cueActor) assert.ok(actorIds.has(cueActor), `Unknown cue actor ${cueActor} in ${scene.id}`);
      assert.ok(cue.type || cue.op || cue.action, `Cue without type/op/action in ${scene.id}`);
    }
  }

  const lydiaSpeech = production.scenes.flatMap(scene => scene.cues || [])
    .filter(cue => cue.op === 'say' && cue.actor === 'lydia');
  assert.equal(lydiaSpeech.length, 0, 'Lydia must remain silent');

  const earlyScenes = production.scenes.filter(scene => scene.index < 6);
  const earlyText = JSON.stringify(earlyScenes);
  assert.doesNotMatch(earlyText, /Grace.{0,12}(杀死|闷死).{0,12}(孩子|Anne|Nicholas)/i, 'Core twist leaked before séance');
}

console.log('Project contract OK');

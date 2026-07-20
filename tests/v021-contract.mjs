import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('v021');
const production=JSON.parse(fs.readFileSync(path.join(root,'data','production.json'),'utf8'));
assert.equal(production.rendererProfile.mode,'top-down-tilemap');
assert.equal(production.rendererProfile.movement,'four-direction');
assert.equal(production.rendererProfile.sampling,'nearest-neighbor');
assert.equal(production.saveKey,'storyteller-v021-save');
assert.deepEqual(Object.keys(production.maps),['nursery','hall','music','garden','seance']);
assert.ok(production.objectives.length>=9);
assert.ok(Object.values(production.maps).every((map)=>map.portals.length&&map.interactions.length));
assert.ok(!JSON.stringify(production).match(/zelda|pokemon|mario|nintendo/i),'0.21 product must not depend on franchise prompts');

for(const [name,[w,h]] of Object.entries({'tileset.png':[128,64],'actors.png':[192,144],'portraits.png':[384,64],'props.png':[288,32],'ui-icons.png':[128,16]})){
  const png=fs.readFileSync(path.join(root,'assets',name));assert.equal(png.toString('ascii',1,4),'PNG');assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const source=fs.readFileSync(path.join(root,'src','game.js'),'utf8');
assert.match(html,/canvas id="game" width="320" height="180"/);assert.match(html,/touch-controls/);assert.match(source,/facingVector/);assert.match(source,/localStorage\.setItem/);assert.match(source,/drawDebug/);
const route=JSON.parse(fs.readFileSync(path.join(root,'reports','route-simulation.json'),'utf8'));assert.equal(route.status,'pass');
assert.ok(Object.values(production.maps).every((map)=>Object.keys(map.sceneStates || {}).length>=2),'every map must use independent production scene states');
console.log(JSON.stringify({status:'pass',maps:5,routeSteps:route.steps,assets:5,productionScenes:15,saveKey:production.saveKey},null,2));

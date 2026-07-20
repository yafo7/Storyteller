import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const game = JSON.parse(fs.readFileSync(path.join(root, 'data', 'production.json'), 'utf8'));
const state = structuredClone(game.initialState);
const trace = [];

function get(pathName) { return pathName.split('.').reduce((value, key) => value?.[key], state); }
function set(pathName, value) { const parts=pathName.split('.');let cursor=state;for(let i=0;i<parts.length-1;i++)cursor=cursor[parts[i]]??={};cursor[parts.at(-1)]=value; }
function matches(c={}) {
  if(c.stage!==undefined&&state.stage!==c.stage)return false;if(c.stageAtLeast!==undefined&&state.stage<c.stageAtLeast)return false;if(c.stageMax!==undefined&&state.stage>c.stageMax)return false;
  if(c.seanceSlots!==undefined&&state.seanceSlots!==c.seanceSlots)return false;if(c.flag&&!state.flags[c.flag])return false;if(c.flagNot&&state.flags[c.flagNot])return false;return true;
}
function apply(ops) {
  for(const op of ops){
    if(op.type==='set')set(op.path,op.value);
    else if(op.type==='toggle')set(op.path,get(op.path)===op.a?op.b:op.a);
    else if(op.type==='setFlag')state.flags[op.key]=op.value;
    else if(op.type==='increment')set(op.path,(get(op.path)??0)+op.amount);
    else if(op.type==='setStage')state.stage=op.value;
    else if(op.type==='addItem'&&!state.inventory.includes(op.item))state.inventory.push(op.item);
    else if(op.type==='addFact'&&!state.knownFacts.includes(op.fact))state.knownFacts.push(op.fact);
    else if(op.type==='transition')state.map=op.map;
    else if(op.type==='checkGraves'&&state.graveCount>=3&&state.stage===5){state.inventory.push('grave-rubbing');state.knownFacts.push('fact.servants-dead');state.stage=6;}
    else if(op.type==='complete')state.ending='complete';
  }
}
function interact(mapId,id){
  if(state.map!==mapId)throw new Error(`route expected ${mapId}, found ${state.map}`);
  const target=game.maps[mapId].interactions.find((entry)=>entry.id===id);if(!target)throw new Error(`missing interaction ${id}`);
  const step=target.steps.find((entry)=>matches(entry.when));if(!step)throw new Error(`no valid step for ${id} at stage ${state.stage}`);
  const before=JSON.parse(JSON.stringify(state));apply(step.ops);trace.push({type:'interaction',map:mapId,id,beforeStage:before.stage,afterStage:state.stage,inventory:[...state.inventory]});
}
function portal(mapId,id){
  if(state.map!==mapId)throw new Error(`portal expected ${mapId}, found ${state.map}`);
  const target=game.maps[mapId].portals.find((entry)=>entry.id===id);if(!target)throw new Error(`missing portal ${id}`);if(!matches(target.requires))throw new Error(`locked portal ${id} at stage ${state.stage}`);
  state.map=target.to;trace.push({type:'portal',id,to:target.to,stage:state.stage});
}

interact('nursery','curtain-main');
portal('nursery','nursery-hall');
interact('hall','mail-letter');
portal('hall','hall-nursery');
interact('nursery','curtain-victor');
portal('nursery','nursery-hall');
portal('hall','hall-music');
interact('music','piano');
interact('music','album');
portal('music','music-hall');
portal('hall','hall-garden');
interact('garden','grave-mills');
interact('garden','grave-tuttle');
interact('garden','grave-lydia');
portal('garden','garden-hall');
portal('hall','hall-seance');
interact('seance','seance-table');
interact('seance','seance-table');
interact('seance','seance-table');
interact('nursery','curtain-main');

const saveRoundTrip = JSON.parse(JSON.stringify({state})).state;
const assertions = {
  endingComplete: state.ending==='complete'&&state.stage===8,
  allMapsVisited: ['nursery','hall','music','garden','seance'].every((id)=>trace.some((entry)=>entry.map===id||entry.to===id)),
  evidenceComplete: ['letter','album','grave-rubbing'].every((id)=>state.inventory.includes(id)),
  revealPreserved: state.knownFacts.at(-1)==='fact.family-dead',
  saveRoundTrip: JSON.stringify(saveRoundTrip)===JSON.stringify(state),
  routeReturns: trace.filter((entry)=>entry.type==='portal').length>=8
};
const status=Object.values(assertions).every(Boolean)?'pass':'fail';
const report={schemaVersion:'1.0.0',status,routeId:'critical-route-v021',steps:trace.length,assertions,finalState:state,trace};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','route-simulation.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status,steps:trace.length,assertions},null,2));if(status!=='pass')process.exitCode=1;

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const portraitCanvas = $('#portrait');
const portraitCtx = portraitCanvas.getContext('2d');
portraitCtx.imageSmoothingEnabled = false;

const ui = {
  loading: $('#loading'), title: $('#title-screen'), newGame: $('#new-game'), continueGame: $('#continue-game'),
  mapName: $('#map-name'), objective: $('#objective'), objectiveText: $('#objective-text'), prompt: $('#prompt'),
  promptText: $('#prompt span'), dialogue: $('#dialogue'), speaker: $('#speaker'), dialogueText: $('#dialogue-text'),
  toast: $('#toast'), fade: $('#fade'), evidence: $('#evidence'), worldLabel: $('#world-label'), debug: $('#debug-panel'),
  modal: $('#modal'), modalContent: $('#modal-content'), modalClose: $('#modal-close')
};

let game;
let images = {};
let state;
let map;
let running = false;
let debug = false;
let last = performance.now();
let portalCooldown = 0;
let toastTimer = 0;
let actionTarget = null;
let audioContext = null;
const keys = new Set();
const player = { x: 0, y: 0, facing: 'up', moving: false, frame: 0, frameClock: 0 };
const dialogue = { active: false, lines: [], index: 0, after: null, portrait: 0, speaker: '' };

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const getPath = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);
const setPath = (obj, path, value) => {
  const parts = path.split('.'); let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]] ??= {};
  cursor[parts.at(-1)] = value;
};

function conditionMatches(condition = {}) {
  if (condition.stage !== undefined && state.stage !== condition.stage) return false;
  if (condition.stageAtLeast !== undefined && state.stage < condition.stageAtLeast) return false;
  if (condition.stageMax !== undefined && state.stage > condition.stageMax) return false;
  if (condition.seanceSlots !== undefined && state.seanceSlots !== condition.seanceSlots) return false;
  if (condition.flag && !state.flags[condition.flag]) return false;
  if (condition.flagNot && state.flags[condition.flagNot]) return false;
  if (condition.inventory && !state.inventory.includes(condition.inventory)) return false;
  return true;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
  });
}

function tone(kind = 'soft') {
  try {
    audioContext ??= new AudioContext();
    const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const notes = kind === 'lock' ? [92, 82] : kind === 'reveal' ? [196, 247] : kind === 'step' ? [74] : [147];
    osc.type = kind === 'reveal' ? 'triangle' : 'square'; osc.frequency.setValueAtTime(notes[0], now);
    if (notes[1]) osc.frequency.linearRampToValueAtTime(notes[1], now + .18);
    gain.gain.setValueAtTime(kind === 'step' ? .012 : .035, now); gain.gain.exponentialRampToValueAtTime(.001, now + (kind === 'reveal' ? .5 : .16));
    osc.connect(gain).connect(audioContext.destination); osc.start(now); osc.stop(now + (kind === 'reveal' ? .5 : .18));
  } catch { /* Audio feedback is optional. */ }
}

function spawnAt(mapId, spawnId) {
  state.map = mapId; map = game.maps[mapId];
  const [tx, ty] = map.spawns[spawnId] ?? Object.values(map.spawns)[0];
  player.x = tx * 16 + 8; player.y = ty * 16 + 13; player.facing = 'up';
  ui.mapName.textContent = map.name; portalCooldown = .45; updateUi();
}

function saveGame(show = false) {
  const payload = { version: game.schemaVersion, state, player: { x: player.x, y: player.y, facing: player.facing }, savedAt: new Date().toISOString() };
  localStorage.setItem(game.saveKey, JSON.stringify(payload));
  if (show) toast('进度已保存');
  ui.continueGame.disabled = false;
}

function loadGame() {
  try {
    const payload = JSON.parse(localStorage.getItem(game.saveKey));
    if (!payload?.state) return false;
    state = payload.state; map = game.maps[state.map] ?? game.maps.nursery;
    player.x = payload.player?.x ?? 168; player.y = payload.player?.y ?? 141; player.facing = payload.player?.facing ?? 'up';
    ui.mapName.textContent = map.name; return true;
  } catch { return false; }
}

function newGame() {
  state = deepClone(game.initialState); spawnAt(state.map, 'start'); running = true; ui.title.classList.remove('active');
  showDialogue('Grace', 0, ['我是 Grace。1945 年，战争结束了，Charles 却还没回来。', '现在，这栋孤岛宅邸里只有我、两个孩子，以及刚到任的仆人。', '晨光正在变强。Anne 和 Nicholas 不能碰到它。先合上北侧的百叶窗帘。']);
  saveGame();
}

function continueGame() {
  if (!loadGame()) return newGame();
  running = true; ui.title.classList.remove('active'); updateUi(); toast('已回到最近的门前');
}

function objectiveForStage() { return game.objectives.find((entry) => entry.stage === state.stage) ?? game.objectives.at(-1); }
function updateUi() {
  if (!state) return;
  const objective = objectiveForStage(); ui.objectiveText.textContent = objective.text;
  ui.worldLabel.textContent = state.ending === 'complete' ? '晨光层' : state.curtainsRemoved ? '日光层' : state.worldLayer === 'overlap' || state.worldLayer === 'living' ? '重叠层' : state.worldLayer === 'echo' ? '回声层' : '封闭层';
  ui.evidence.innerHTML = '<span class="label">证物</span>';
  if (!state.inventory.length) ui.evidence.insertAdjacentHTML('beforeend', '<span class="empty">尚未取得</span>');
  for (const itemId of state.inventory) {
    const item = game.items[itemId]; ui.evidence.insertAdjacentHTML('beforeend', `<span class="evidence-chip">◇ ${item.label}</span>`);
  }
}

function toast(message, seconds = 2.2) {
  ui.toast.textContent = message; ui.toast.classList.add('active'); toastTimer = seconds;
}

function showDialogue(speaker, portrait, lines, after = null) {
  dialogue.active = true; dialogue.speaker = speaker; dialogue.portrait = portrait ?? 0; dialogue.lines = lines; dialogue.index = 0; dialogue.after = after;
  ui.dialogue.classList.add('active'); renderDialogue();
}

function renderDialogue() {
  ui.speaker.textContent = dialogue.speaker; ui.dialogueText.textContent = dialogue.lines[dialogue.index];
  portraitCtx.clearRect(0, 0, 64, 64); portraitCtx.drawImage(images.portraits, dialogue.portrait * 64, 0, 64, 64, 0, 0, 64, 64);
}

function advanceDialogue() {
  if (!dialogue.active) return false;
  tone('soft'); dialogue.index++;
  if (dialogue.index < dialogue.lines.length) renderDialogue();
  else {
    dialogue.active = false; ui.dialogue.classList.remove('active'); const after = dialogue.after; dialogue.after = null; after?.();
  }
  return true;
}

function executeOps(ops, index = 0) {
  if (index >= ops.length) { updateUi(); return; }
  const op = ops[index]; const next = () => executeOps(ops, index + 1);
  switch (op.type) {
    case 'dialogue': showDialogue(op.speaker, op.portrait, op.lines, next); return;
    case 'set': setPath(state, op.path, op.value); break;
    case 'toggle': setPath(state, op.path, getPath(state, op.path) === op.a ? op.b : op.a); tone('reveal'); break;
    case 'setFlag': state.flags[op.key] = op.value; break;
    case 'increment': setPath(state, op.path, (getPath(state, op.path) ?? 0) + op.amount); break;
    case 'setStage': state.stage = op.value; toast(objectiveForStage().text); tone('reveal'); break;
    case 'addItem': if (!state.inventory.includes(op.item)) { state.inventory.push(op.item); toast(`取得证物：${game.items[op.item].label}`); } break;
    case 'addFact': if (!state.knownFacts.includes(op.fact)) state.knownFacts.push(op.fact); break;
    case 'save': saveGame(); break;
    case 'transition': transition(op.map, op.spawn, next); return;
    case 'checkGraves':
      if (state.graveCount >= 3 && state.stage === 5) {
        state.inventory.push('grave-rubbing'); state.knownFacts.push('fact.servants-dead'); state.stage = 6;
        showDialogue('Mrs Mills', 3, ['三个名字，同一个年份。我们在您来到这里以前就死了。', '别害怕这个答案。害怕不会让一扇已经打开的门重新消失。', '北侧楼梯亮了。带着信、肖像册与拓片去圆桌。'], () => { saveGame(); updateUi(); next(); }); return;
      }
      break;
    case 'complete': showEnding(); break;
  }
  updateUi(); next();
}

function chooseStep(target) { return target.steps?.find((step) => conditionMatches(step.when)); }
function interact(target) {
  if (!target) return;
  if (target.kind === 'portal') {
    if (conditionMatches(target.data.requires)) transition(target.data.to, target.data.spawn);
    else { tone('lock'); toast(target.data.lockedText ?? '这扇门现在打不开。'); }
    return;
  }
  if (target.kind === 'actor') {
    const variant = target.data.talk.find((entry) => conditionMatches(entry.when)) ?? target.data.talk.at(-1);
    const cast = game.cast[target.data.cast]; showDialogue(cast.name, cast.portrait, variant.lines); return;
  }
  const step = chooseStep(target.data); if (step) executeOps(step.ops);
}

function transition(mapId, spawnId, after = null) {
  ui.fade.classList.add('active'); running = false;
  setTimeout(() => {
    spawnAt(mapId, spawnId); saveGame(); ui.fade.classList.remove('active'); running = true; tone('soft'); after?.();
  }, 310);
}

function pointInRect(x, y, rect) { return x >= rect[0] * 16 && x < (rect[0] + rect[2]) * 16 && y >= rect[1] * 16 && y < (rect[1] + rect[3]) * 16; }
function unlockedPortalAt(x, y) { return map.portals.some((portal) => conditionMatches(portal.requires) && pointInRect(x, y, portal.at)); }
function blocked(x, y) {
  const samples = [[x - 5, y - 4], [x + 5, y - 4], [x - 5, y], [x + 5, y]];
  return samples.some(([sx, sy]) => map.collisions.some((rect) => pointInRect(sx, sy, rect) && !unlockedPortalAt(sx, sy)));
}

function movePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) dx--;
  if (keys.has('ArrowRight') || keys.has('KeyD')) dx++;
  if (keys.has('ArrowUp') || keys.has('KeyW')) dy--;
  if (keys.has('ArrowDown') || keys.has('KeyS')) dy++;
  if (dx && dy) { dx *= .707; dy *= .707; }
  player.moving = Boolean(dx || dy);
  if (!player.moving) { player.frame = 1; return; }
  if (Math.abs(dx) > Math.abs(dy)) player.facing = dx < 0 ? 'left' : 'right'; else player.facing = dy < 0 ? 'up' : 'down';
  const speed = 54; const nx = player.x + dx * speed * dt; const ny = player.y + dy * speed * dt;
  if (!blocked(nx, player.y)) player.x = nx;
  if (!blocked(player.x, ny)) player.y = ny;
  player.frameClock += dt; if (player.frameClock > .16) { player.frameClock = 0; player.frame = (player.frame + 1) % 3; if (player.frame !== 1) tone('step'); }
}

function checkPortals() {
  if (portalCooldown > 0 || dialogue.active) return;
  for (const portal of map.portals) if (pointInRect(player.x, player.y, portal.at)) {
    if (conditionMatches(portal.requires)) { transition(portal.to, portal.spawn); return; }
    tone('lock'); toast(portal.lockedText ?? '这扇门现在打不开。'); portalCooldown = 1; return;
  }
}

const facingVector = () => ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] })[player.facing];
function visibleEntities() {
  const list = [];
  for (const data of map.interactions) if (conditionMatches(data.visible)) list.push({ kind: 'interaction', data, x: data.x * 16 + 8, y: data.y * 16 + 8, label: data.label });
  for (const data of map.actors) if (conditionMatches(data.visible)) list.push({ kind: 'actor', data, x: data.x * 16 + 8, y: data.y * 16 + 13, label: `与 ${game.cast[data.cast].name} 交谈` });
  for (const data of map.portals) list.push({ kind: 'portal', data, x: (data.at[0] + data.at[2] / 2) * 16, y: (data.at[1] + data.at[3] / 2) * 16, label: conditionMatches(data.requires) ? `进入 ${game.maps[data.to].name}` : '检查上锁的门' });
  return list;
}

function updateActionTarget() {
  actionTarget = null; let best = 38; const [fx, fy] = facingVector();
  for (const entity of visibleEntities()) {
    const dx = entity.x - player.x, dy = entity.y - (player.y - 5); const distance = Math.hypot(dx, dy); const dot = distance ? (dx * fx + dy * fy) / distance : 1;
    if (distance < best && dot > .18) { best = distance; actionTarget = entity; }
  }
  ui.prompt.classList.toggle('active', Boolean(actionTarget) && !dialogue.active);
  if (actionTarget) ui.promptText.textContent = actionTarget.label;
}

function camera() {
  return { x: Math.round(clamp(player.x - 160, 0, Math.max(0, map.width * 16 - 320))), y: Math.round(clamp(player.y - 90, 0, Math.max(0, map.height * 16 - 180))) };
}
function tile(index, x, y, cam) { ctx.drawImage(images.tileset, (index % 8) * 16, Math.floor(index / 8) * 16, 16, 16, Math.round(x - cam.x), Math.round(y - cam.y), 16, 16); }
function drawActor(actor, cam, isPlayer = false) {
  const cast = isPlayer ? game.cast.grace : game.cast[actor.cast]; const direction = { down: 0, left: 1, right: 2, up: 3 }[isPlayer ? player.facing : actor.facing];
  const frame = isPlayer ? player.frame : 1; const sx = (direction * 3 + frame) * 16; const sy = cast.spriteRow * 24;
  const x = (isPlayer ? player.x : actor.x * 16 + 8) - 8 - cam.x; const y = (isPlayer ? player.y : actor.y * 16 + 13) - 23 - cam.y;
  ctx.drawImage(images.actors, sx, sy, 16, 24, Math.round(x), Math.round(y), 16, 24);
}

function renderMap() {
  const cam = camera(); ctx.fillStyle = '#090c10'; ctx.fillRect(0, 0, 320, 180);
  const startX = Math.floor(cam.x / 16), endX = Math.min(map.width, startX + 22), startY = Math.floor(cam.y / 16), endY = Math.min(map.height, startY + 14);
  for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
    let base = map.floorTile; if (map.theme === 'garden' && ((x * 7 + y * 11) % 9 === 0)) base = 5; tile(base, x * 16, y * 16, cam);
  }
  for (const rect of map.collisions) for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) tile(map.wallTile, x * 16, y * 16, cam);
  for (const [x, y, index] of map.props) tile(index, x * 16, y * 16, cam);
  for (const portal of map.portals) {
    const x = portal.at[0] * 16, y = portal.at[1] * 16; tile(conditionMatches(portal.requires) ? 6 : 1, x, y, cam);
  }
  for (const interaction of map.interactions) if (conditionMatches(interaction.visible)) tile(interaction.tile, interaction.x * 16, interaction.y * 16, cam);
  if (state.worldLayer !== 'grace') {
    ctx.fillStyle = state.worldLayer === 'living' ? '#e4b55a22' : '#765f7230'; ctx.fillRect(0, 0, 320, 180);
    for (let i = 0; i < 18; i++) tile(13, ((i * 83) % (map.width * 16)), ((i * 47) % (map.height * 16)), cam);
  }
  if (state.curtainsRemoved || state.ending !== 'locked') {
    ctx.fillStyle = '#f2dfaa16'; ctx.fillRect(0, 0, 320, 180);
    if (map.theme !== 'garden') for (let x = 16; x < map.width * 16; x += 80) tile(14, x, 16, cam);
  } else if (map.theme !== 'garden') { ctx.fillStyle = '#02070b42'; ctx.fillRect(0, 0, 320, 180); }
  const actors = map.actors.filter((actor) => conditionMatches(actor.visible)).sort((a, b) => a.y - b.y);
  let drewPlayer = false;
  for (const actor of actors) { if (!drewPlayer && actor.y * 16 + 13 > player.y) { drawActor(null, cam, true); drewPlayer = true; } drawActor(actor, cam); }
  if (!drewPlayer) drawActor(null, cam, true);
  if (actionTarget && !dialogue.active) {
    const bob = Math.floor(performance.now() / 240) % 2; ctx.fillStyle = '#f2dfaa'; ctx.fillRect(Math.round(actionTarget.x - cam.x) - 2, Math.round(actionTarget.y - cam.y) - 18 - bob, 4, 4);
  }
  if (debug) drawDebug(cam);
}

function drawDebug(cam) {
  ctx.save(); ctx.lineWidth = 1;
  ctx.strokeStyle = '#ff4d6d'; for (const rect of map.collisions) ctx.strokeRect(rect[0] * 16 - cam.x + .5, rect[1] * 16 - cam.y + .5, rect[2] * 16 - 1, rect[3] * 16 - 1);
  ctx.strokeStyle = '#53ff9d'; for (const portal of map.portals) ctx.strokeRect(portal.at[0] * 16 - cam.x + .5, portal.at[1] * 16 - cam.y + .5, portal.at[2] * 16 - 1, portal.at[3] * 16 - 1);
  ctx.strokeStyle = '#61b7ff'; for (const entity of visibleEntities().filter((e) => e.kind !== 'portal')) ctx.strokeRect(entity.x - cam.x - 8, entity.y - cam.y - 12, 16, 16);
  ctx.restore();
  ui.debug.textContent = `DEBUG / F2\nmap ${state.map}\nstage ${state.stage}\nlayer ${state.worldLayer}\npos ${Math.floor(player.x / 16)},${Math.floor(player.y / 16)}\ncollisions red\nportals green\ninteractions blue`;
}

function showJournal() {
  const objective = objectiveForStage(); const evidence = state.inventory.map((id) => `<li><strong>${game.items[id].label}</strong><br>${game.items[id].description}</li>`).join('') || '<li>还没有取得证物。</li>';
  ui.modalContent.innerHTML = `<h2>Grace 的宅邸日志</h2><h3>当前目标</h3><p>${objective.text}</p><p><em>提示：${objective.hint}</em></p><hr><h3>证物</h3><ul>${evidence}</ul><hr><h3>已确认的矛盾</h3><p>${state.knownFacts.length ? state.knownFacts.map((fact) => `◇ ${fact.replace('fact.', '')}`).join('<br>') : '我仍只相信门、黑暗与规则。'}</p>`;
  ui.modal.classList.add('active');
}

function showMenu() {
  ui.modalContent.innerHTML = `<h2>暂停</h2><p>${objectiveForStage().text}</p><div class="menu-grid"><button id="resume">继续</button><button id="save">保存进度</button><button id="journal">查看日志</button><button id="restart">重新开始</button></div><hr><p>WASD / 方向键移动<br>E / 空格互动<br>J 查看日志 · F2 调试图层<br>触屏设备可使用屏幕按键</p>`;
  ui.modal.classList.add('active');
  $('#resume').onclick = closeModal; $('#save').onclick = () => saveGame(true); $('#journal').onclick = showJournal;
  $('#restart').onclick = () => { if (confirm('确定清除 0.21 的当前进度并重新开始？')) { localStorage.removeItem(game.saveKey); closeModal(); newGame(); } };
}

function showEnding() {
  saveGame();
  ui.modalContent.innerHTML = `<p class="eyebrow">ENDING</p><h2 class="ending-title">${game.ending.title}</h2><p>${game.ending.summary}</p><hr><p>门没有消失。光也没有给出所有答案。<br>变化的是 Grace 终于不再用它们隔绝记忆。</p><p class="credits">${game.ending.credits.join('<br>')}</p><div class="menu-grid"><button id="explore">留在晨光中</button><button id="replay">重播降灵会</button></div>`;
  ui.modal.classList.add('active'); $('#explore').onclick = closeModal; $('#replay').onclick = replaySeance;
}

function replaySeance() {
  state.stage = 6; state.seanceSlots = 0; state.ending = 'locked'; state.worldLayer = 'grace'; closeModal(); spawnAt('seance', 'fromHall'); saveGame(); toast('已恢复到降灵会检查点');
}
function closeModal() { ui.modal.classList.remove('active'); }

function action() {
  if (advanceDialogue()) return;
  if (ui.modal.classList.contains('active')) return;
  interact(actionTarget);
}

function handleKeyDown(event) {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  if (event.repeat && ['KeyE','Space','Escape','KeyJ','F2'].includes(event.code)) return;
  if (event.code === 'KeyE' || event.code === 'Space') return action();
  if (event.code === 'Escape') { if (ui.modal.classList.contains('active')) closeModal(); else if (running) showMenu(); return; }
  if (event.code === 'KeyJ') return showJournal();
  if (event.code === 'F2') { debug = !debug; ui.debug.classList.toggle('active', debug); return; }
  keys.add(event.code);
}
function handleKeyUp(event) { keys.delete(event.code); }

function applyDevState(name) {
  const presets = {
    daylight: { stage: 5, map: 'hall', spawn: 'fromGarden', inventory: ['letter','album'], curtainsRemoved: true, flags: { victorVisible: true, albumVisible: true } },
    garden: { stage: 5, map: 'garden', spawn: 'fromHall', inventory: ['letter','album'], curtainsRemoved: true, flags: { victorVisible: true, albumVisible: true } },
    seance: { stage: 6, map: 'seance', spawn: 'fromHall', inventory: ['letter','album','grave-rubbing'], curtainsRemoved: true, graveCount: 3, flags: { graveMills:true, graveTuttle:true, graveLydia:true } },
    dawn: { stage: 7, map: 'nursery', spawn: 'ending', inventory: ['letter','album','grave-rubbing'], curtainsRemoved: true, seanceSlots: 3, ending: 'unlocked', worldLayer: 'living', flags: {} }
  };
  const preset = presets[name]; if (!preset) return false;
  state = Object.assign(deepClone(game.initialState), preset); state.knownFacts = []; spawnAt(preset.map, preset.spawn); running = true; ui.title.classList.remove('active'); return true;
}

function loop(now) {
  const dt = Math.min(.04, (now - last) / 1000); last = now;
  if (running && !dialogue.active && !ui.modal.classList.contains('active')) { movePlayer(dt); portalCooldown = Math.max(0, portalCooldown - dt); state.playSeconds += dt; checkPortals(); updateActionTarget(); }
  if (state && map) renderMap();
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('active'); }
  requestAnimationFrame(loop);
}

async function init() {
  game = await fetch('data/production.json').then((response) => { if (!response.ok) throw new Error(`production.json ${response.status}`); return response.json(); });
  [images.tileset, images.actors, images.portraits, images.icons] = await Promise.all([loadImage(game.assets.tileset), loadImage(game.assets.actors), loadImage(game.assets.portraits), loadImage(game.assets.icons)]);
  state = deepClone(game.initialState); map = game.maps[state.map]; spawnAt(state.map, 'start');
  ui.loading.classList.remove('active'); ui.title.classList.add('active'); ui.continueGame.disabled = !localStorage.getItem(game.saveKey);
  const params = new URLSearchParams(location.search); debug = params.get('debug') === '1'; ui.debug.classList.toggle('active', debug);
  if (params.get('state')) applyDevState(params.get('state'));
  requestAnimationFrame(loop);
}

ui.newGame.addEventListener('click', newGame); ui.continueGame.addEventListener('click', continueGame);
ui.dialogue.addEventListener('click', advanceDialogue); ui.modalClose.addEventListener('click', closeModal);
$('#journal-button').addEventListener('click', showJournal); $('#menu-button').addEventListener('click', showMenu); $('#touch-action').addEventListener('click', action);
window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp); window.addEventListener('blur', () => keys.clear());
for (const button of document.querySelectorAll('[data-key]')) {
  const code = button.dataset.key; button.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.add(code); button.setPointerCapture(event.pointerId); });
  const release = () => keys.delete(code); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
}
window.addEventListener('beforeunload', () => { if (running && state) saveGame(); });

init().catch((error) => { ui.loading.innerHTML = `<div class="title-card"><h2>宅邸未能载入</h2><p>${error.message}</p><p>请从本地服务器的 /v021/ 路径打开。</p></div>`; console.error(error); });

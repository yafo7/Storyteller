// ============================================
// main.js — p5 生命周期 + Game（双模式状态机 + 序章报幕）
// ============================================

let game;

function setup() {
  const c = document.getElementById('canvas-container');
  createCanvas(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT).parent(c);
  game = new Game();
  game.init();
}

function draw() {
  game.update();
  game.draw();
}

// ============ Game ============

class Game {
  constructor() {
    this.world = new World();
    this.player = new Player();
    this.camera = new Camera();
    this.npcManager = new NPCManager();
    this.dialogue = new DialogueManager();
    this.ai = new AIDirector();
    this.input = new InputManager();
    this.hintEl = document.getElementById('interaction-hint');
    this.pb = document.getElementById('playback-dialogue');
    this.endScreen = document.getElementById('end-screen');

    this.state = 'init';       // init | playback | freeRoam | ending | done
    this.currentAct = -1;
    this.currentDialogueIdx = 0;
    this.actData = null;
  }

  init() {
    this.world.generate();
    this.npcManager.spawnDefault(this.world);
    const sp = Maps['parlor'].spawn;
    this.player.x = sp.x; this.player.y = sp.y;
    this.camera.snapTo(this.player);

    this.ai.init().then(() => {
      const spec = this.ai.actSpecs;
      if (spec?.acts) {
        Promise.all(spec.acts.map((_, i) => this.ai.loadAct(i))).then(() => {
          this._startNextAct();
        });
      }
    });
  }

  // ============ 更新 ============

  update() {
    this.input.update();
    this.dialogue.update(); // 对话倒计时

    switch (this.state) {
      case 'playback':
        this._updatePlayback();
        this.hintEl.classList.remove('visible');
        break;
      case 'freeRoam':
        this._updateFreeRoam();
        break;
      case 'ending':
        this._updateEnding();
        this.hintEl.classList.remove('visible');
        break;
    }
  }

  // ============ 剧情播放 ============

  _updatePlayback() {
    // 等 Space
    if (!this.input.isSpacePressed) return;
    this.input.consumeSpace();

    // 还有旁白/对话
    const dlgs = this.actData.dialogues || [];
    const allLines = [...(this.actData.narrations || []), ...dlgs.map(d => ({...d, isNarration: false }))];
    // 重新组合：narration 也作为 lines
    const total = (this.actData.narrations?.length || 0) + dlgs.length;

    if (this.currentDialogueIdx < (this.actData.narrations?.length || 0)) {
      // 旁白
      this._showPlayback(null, this.actData.narrations[this.currentDialogueIdx], true);
      this.currentDialogueIdx++;
      return;
    }

    const dlgIdx = this.currentDialogueIdx - (this.actData.narrations?.length || 0);
    if (dlgIdx < dlgs.length) {
      const d = dlgs[dlgIdx];
      const npc = this.npcManager.get(d.speakerId);
      this._showPlayback(npc, d.text, false);
      this.currentDialogueIdx++;
      return;
    }

    // 播完
    this._finishPlayback();
  }

  _showPlayback(npc, text, isNarration) {
    // Keep legacy rendering safe even though the new Runtime no longer loads this file.
    this.pb.replaceChildren();
    const name = document.createElement('span');
    name.style.color = isNarration ? '#c8b89a' : '#d4a574';
    name.style.fontSize = '12px';
    if (isNarration) name.style.letterSpacing = '2px';
    name.textContent = isNarration ? '——' : (npc ? npc.name : '');
    const line = document.createElement('span');
    line.style.color = '#ddd';
    line.style.fontSize = '14px';
    line.style.lineHeight = '1.7';
    line.textContent = String(text ?? '');
    this.pb.append(name, line);
    this.pb.classList.add('visible');
  }

  _finishPlayback() {
    this.pb.classList.remove('visible');
    const spec = this.ai.actSpecs?.acts?.[this.currentAct];
    if (spec?.isEnding) {
      this.state = 'ending';
      this.endScreen.querySelector('.end-text').textContent = this.actData.endingText || '游戏结束。';
      this.endScreen.classList.add('visible');
      this.pb.classList.add('visible');
    } else if (spec?.mode === 'playback_then_free') {
      this.state = 'freeRoam';
      this.hintEl.textContent = '[E] Talk';
    } else {
      this._startNextAct();
    }
  }

  _startNextAct() {
    this.currentAct++;
    const spec = this.ai.actSpecs?.acts?.[this.currentAct];
    if (!spec) { this.state = 'freeRoam'; return; }

    if (spec.npcPresent?.includes('victor') && !this._twistDone) {
      this.npcManager.spawnMarlishFamily();
      this._twistDone = true;
    }

    this.actData = this.ai.actData[this.currentAct];
    if (!this.actData) { this.state = 'freeRoam'; return; }

    this.currentDialogueIdx = 0;
    this.state = 'playback';

    // 第一句自动显示
    if (this.actData.narrations?.length > 0) {
      this._showPlayback(null, this.actData.narrations[0], true);
      this.currentDialogueIdx = 1;
    } else if (this.actData.dialogues?.length > 0) {
      const d = this.actData.dialogues[0];
      this._showPlayback(this.npcManager.get(d.speakerId), d.text, false);
      this.currentDialogueIdx = 1 + (this.actData.narrations?.length || 0);
    }
  }

  // ============ 自由活动 ============

  _updateFreeRoam() {
    if (this.dialogue.isActive) return;
    this.player.update(this.world.obstacles, this.npcManager.npcs);
    this.camera.follow(this.player);

    const near = this.npcManager.getNearestTo(this.player.x, this.player.y, CONFIG.INTERACTION_DISTANCE);

    if (near) {
      // 靠近 NPC → [E] Talk
      this.hintEl.textContent = '[E] Talk';
      this.hintEl.classList.add('visible');
      if (this.input.isEPressed) {
        this.input.consumeE();
        const talks = this.actData?.freeTalk?.[near.id];
        if (talks?.length) {
          this.dialogue.start(near, talks[Math.floor(Math.random()*talks.length)].text);
        } else {
          this.dialogue.start(near, near.getLine('greeting'));
        }
      }
    } else {
      // 不靠近任何 NPC → 检查是否回座
      const sp = Maps['parlor'].spawn;
      if (Math.sqrt((this.player.x-sp.x)**2+(this.player.y-sp.y)**2) < 50) {
        this.hintEl.textContent = '[E] 继续晚宴';
        this.hintEl.classList.add('visible');
        if (this.input.isEPressed) {
          this.input.consumeE();
          this._startNextAct();
        }
      } else {
        this.hintEl.classList.remove('visible');
      }
    }
  }

  // ============ 结束 ============

  _updateEnding() {
    if (this.input.isSpacePressed) {
      this.input.consumeSpace();
      this._restart();
    }
  }

  _restart() {
    this.endScreen.classList.remove('visible');
    this.pb.classList.remove('visible');
    this.currentAct = -1;
    this.currentDialogueIdx = 0;
    this._twistDone = false;
    this.npcManager.npcs = [];
    this.npcManager.spawnDefault(this.world);
    this.player.x = Maps['parlor'].spawn.x;
    this.player.y = Maps['parlor'].spawn.y;
    this.camera.snapTo(this.player);
    this._startNextAct();
  }

  // ============ 渲染 ============

  draw() {
    push();
    translate(-this.camera.x, -this.camera.y);
    this.world.draw();
    if (this.state==='ending') this._drawGhosts();
    this.npcManager.draw();
    this.player.draw();
    pop();
  }

  _drawGhosts() {
    const gx=CONFIG.MAP_WIDTH/2-60, gy=1050-60;
    push();
    fill(200,200,240,50+sin(frameCount*0.02)*20); noStroke();
    ellipse(gx,gy,30,50);
    ellipse(gx+50,gy-10,20,35);
    ellipse(gx+20,gy-20,40,60);
    pop();
  }
}

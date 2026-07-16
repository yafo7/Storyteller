// ============================================
// dialogue.js — 对话系统（简化：NPC 说一句即关闭）
// ============================================

class DialogueManager {
  constructor() {
    this.isActive = false;
    this.timer = 0;
    this.box = document.getElementById('dialogue-box');
    this.nameEl = document.getElementById('dialogue-npc-name');
    this.textEl = document.getElementById('dialogue-text');
    this.optsEl = document.getElementById('dialogue-options');
  }

  start(npc, overrideText) {
    if (this.isActive) return;
    this.isActive = true;
    this.timer = 150; // ~2.5秒
    this.box.classList.add('visible');
    this.nameEl.textContent = npc.name;
    this.textEl.textContent = overrideText || npc.getLine('greeting');
    this.optsEl.replaceChildren(); // 不用选项
  }

  // 每帧倒计时
  update() {
    if (!this.isActive) return;
    this.timer--;
    if (this.timer <= 0) this.stop();
  }

  stop() {
    this.isActive = false;
    this.timer = 0;
    this.box.classList.remove('visible');
  }
}

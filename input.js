// ============================================
// input.js — 输入管理器（Space + E + 数字键）
// ============================================

class InputManager {
  constructor() {
    this.isEPressed = false;
    this._eConsumed = false;
    this.isSpacePressed = false;
    this._spaceConsumed = false;
  }

  update() {
    // E 键
    if (!this._eConsumed && keyIsDown(69)) {
      this.isEPressed = true;
    } else {
      this.isEPressed = false;
    }

    // Space 键
    if (!this._spaceConsumed && keyIsDown(32)) {
      this.isSpacePressed = true;
    } else {
      this.isSpacePressed = false;
    }
  }

  consumeE() {
    this.isEPressed = false;
    this._eConsumed = true;
  }

  consumeSpace() {
    this.isSpacePressed = false;
    this._spaceConsumed = true;
  }

  onKeyReleased(keyCode) {
    if (keyCode === 69) this._eConsumed = false;
    if (keyCode === 32) this._spaceConsumed = false;
  }
}

// ============ 全局事件 ============

function keyPressed() {
  // 简化：对话中按任意键关闭
  if (game && game.dialogue.isActive) {
    game.dialogue.stop();
  }
}

function keyReleased() {
  if (game) game.input.onKeyReleased(keyCode);
  if (keyCode === 116) return false;
  // 阻止空格滚动页面
  if (keyCode === 32) return false;
}

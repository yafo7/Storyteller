// ============================================
// player.js - 玩家角色（蓝色圆形）
// ============================================

class Player {
  constructor() {
    this.x = CONFIG.MAP_WIDTH / 2;
    this.y = CONFIG.MAP_HEIGHT / 2;
    this.radius = CONFIG.PLAYER_RADIUS;
    this.speed = CONFIG.PLAYER_SPEED;
  }

  update(obstacles, npcs) {
    let dx = 0;
    let dy = 0;

    if (keyIsDown(87)) dy = -1;  // W
    if (keyIsDown(83)) dy = 1;   // S
    if (keyIsDown(65)) dx = -1;  // A
    if (keyIsDown(68)) dx = 1;   // D

    // 斜向移动归一化
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    // 逐轴碰撞检测
    const newX = this.x + dx * this.speed;
    const newY = this.y + dy * this.speed;

    if (!this._collidesWithAny(newX, this.y, obstacles, npcs)) {
      this.x = newX;
    }
    if (!this._collidesWithAny(this.x, newY, obstacles, npcs)) {
      this.y = newY;
    }

    // 地图边界限制
    this.x = constrain(this.x, this.radius, CONFIG.MAP_WIDTH - this.radius);
    this.y = constrain(this.y, this.radius, CONFIG.MAP_HEIGHT - this.radius);
  }

  _collidesWithAny(px, py, obstacles, npcs) {
    // 障碍物碰撞（矩形 vs 圆形）
    for (const obs of obstacles) {
      const cx = max(obs.x, min(px, obs.x + obs.w));
      const cy = max(obs.y, min(py, obs.y + obs.h));
      const distX = px - cx;
      const distY = py - cy;
      if (distX * distX + distY * distY < this.radius * this.radius) {
        return true;
      }
    }
    // NPC 不阻挡移动（玩家需要靠近 NPC 互动）
    return false;
  }

  draw() {
    push();
    // 阴影
    noStroke();
    fill(0, 0, 0, 40);
    ellipse(this.x + 2, this.y + 4, this.radius * 2.2, this.radius * 1.6);

    // 身体
    fill(CONFIG.PLAYER_COLOR);
    ellipse(this.x, this.y, this.radius * 2);

    // 眼睛（指示朝向）
    fill(255);
    noStroke();
    ellipse(this.x - 4, this.y - 3, 5, 5);
    ellipse(this.x + 4, this.y - 3, 5, 5);
    fill(30);
    ellipse(this.x - 4, this.y - 2, 2.5, 2.5);
    ellipse(this.x + 4, this.y - 2, 2.5, 2.5);

    pop();
  }
}

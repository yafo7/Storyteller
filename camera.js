// ============================================
// camera.js - 摄像机跟随系统
// ============================================

class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  // 平滑跟随目标
  follow(target) {
    const targetX = target.x - width / 2;
    const targetY = target.y - height / 2;

    // 边界限制
    const clampedX = constrain(targetX, 0, CONFIG.MAP_WIDTH - width);
    const clampedY = constrain(targetY, 0, CONFIG.MAP_HEIGHT - height);

    this.x += (clampedX - this.x) * CONFIG.CAMERA_SMOOTH;
    this.y += (clampedY - this.y) * CONFIG.CAMERA_SMOOTH;
  }

  // 瞬间跳转到目标（用于初始化）
  snapTo(target) {
    this.x = constrain(target.x - width / 2, 0, CONFIG.MAP_WIDTH - width);
    this.y = constrain(target.y - height / 2, 0, CONFIG.MAP_HEIGHT - height);
  }
}

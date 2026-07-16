/* ============================================
 * data/maps/READM.md - 地图切换系统规划
 * ============================================
 *
 * 机制：World.switchMap(mapId) → 重新生成障碍物 → NPC 重生
 *
 * 地图数据格式（JSON / JS 对象）：
 * {
 *   id: string,        // 地图唯一标识
 *   name: string,      // 显示名称
 *   spawn: {x, y},     // 玩家出生点
 *   walls: [{x, y, w, h} ...],
 *   furniture: [{x, y, w, h, type} ...],
 *   npcs: [{id, name, x, y, color, role, dialogues} ...]  // 此地图专属 NPC
 * }
 *
 * 当前已定义：Maps.parlor（会客厅，world.js 中）
 *
 * TODO 后续地图：
 * - hallway    走廊
 * - study      书房
 * - garden     花园
 * - basement   地下室
 */

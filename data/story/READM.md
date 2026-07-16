/* ============================================
 * data/story/READM.md - 故事线整理系统规划
 * ============================================
 *
 * 机制：StoryTracker 类，跟踪玩家所获信息
 *
 * 数据结构：
 * {
 *   clues: [{id, source, text, timestamp}],  // 已获取线索
 *   personas: [{id, name, acquiredFrom}],     // 已解锁身份
 *   events: [{id, round, description}],       // 已触发事件
 *   npcStates: Map<npcId, {trust, memory}>,   // NPC 认知状态
 * }
 *
 * 用途：
 * - AI Storyteller 读取线索表 → 决定下一轮叙事角度
 * - 会客厅阶段展示"已知情报"
 * - 防止重复提供同一线索
 */

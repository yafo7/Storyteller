/* ============================================
 * data/inventory/READM.md - 背包系统规划
 * ============================================
 *
 * 机制：Game.inventory: Map<id, Item>
 *
 * 物品数据格式：
 * {
 *   id: string,          // 唯一标识
 *   name: string,        // 显示名称
 *   type: string,        // 'key' | 'tool' | 'clue' | 'memory'
 *   description: string, // 描述文字
 *   usableOn: string[],  // 可交互的 NPC/物品 ID
 *   personaId: string,   //（可选）关联的身份ID
 * }
 *
 * 接口：
 * - game.inventory.add(item)
 * - game.inventory.remove(id)
 * - game.inventory.has(id): boolean
 * - game.inventory.getAll(): Item[]
 *
 * 背包 UI 以 HTML 侧栏形式显示（后续完成）
 */

# Storyteller Mansion — 项目状态与开发指南

> 更新：2026.6.19 | 可运行 Demo | 本地端口 5500

---

## 〇、快速理解（给新对话窗口的 AI 看）

### 这是什么

一个 p5.js 2D 俯视角叙事游戏。玩家是 visitor，受邀来到一座浓雾笼罩的庄园会客厅。6 个 NPC 围坐在竖长桌两侧，通过 AI 预写的 8 幕剧本逐幕讲述《小岛惊魂》改编故事。**核心不是"AI 生成故事"，而是探索 AI 如何"讲述"故事。**

### 当前状态

- **全部代码已完成，可直接运行**
- 8 幕完整剧本数据已写入 `data/acts/act_*_dialogues.json`
- 双模式循环：剧情播放（Space 推进）→ 自由活动（WASD + E 对话）→ 回座 → 下一幕
- 反转机制：第 6 幕 Marlish 一家 3 人会出现在场景中
- 结束画面后按 Space 重新开始

---

## 一、游戏流程

```
初始化 → [第0幕:播放] → [自由活动] → [回座 E → 第1幕播放] → ... → [第7幕:播放→结束画面→Space重启]
```

| 幕 | 名称 | 模式 | 内容 |
|----|------|------|------|
| 0 | 序章：受邀而至 | 播放 | 玩家到访，管家迎接，NPC 陆续入座 |
| 1 | 雾中宅邸 | 播放→自由 | 建立压抑氛围，NPC 暗示宅邸不寻常 |
| 2 | 孩子的秘密 | 播放→自由 | 通灵者 Anne 说能看到 "Victor" |
| 3 | 入侵者 | 播放→自由 | 园丁说窗帘被扯掉，"入侵者"来临 |
| 4 | 死者之书 | 播放→自由 | 管家展示死人相册 |
| 5 | 三座墓碑 | 播放→自由 | 园丁说花园有三座墓碑，Nicholas 崩溃 |
| 6 | 真相（反转） | 播放→自由 | Lydia 开口 + Marlish 一家 3 人出现 |
| 7 | 此屋归我 | 播放→结束 | 活人离开，窗外可见灵魂，玩家走出 |

---

## 二、实际已实现功能

### 操作

| 按键 | 上下文 | 功能 |
|------|--------|------|
| **Space** | 剧情播放模式 | 推进到下一条旁白/对话 |
| **WASD** | 自由活动模式 | 移动玩家 |
| **E** | 靠近 NPC | 对话（NPC 说一句，2.5 秒后自动关闭或按任意键关闭） |
| **E** | 回到自己座位旁 | 继续晚宴 → 进入下一幕 |
| **Space** | 结束画面 | 重新开始游戏 |

### UI

- 统一 `#playback-dialogue` 对话框：旁白和 NPC 对话都用同一组件
- 剧情播放时对话框在屏幕底部，画外音显示 `——` 前缀，NPC 对话显示角色名
- 自由活动时 `[E] Talk` / `[E] 继续晚宴` 提示
- 结束画面黑色半透明蒙版 + 文字

### 场景

- 竖长桌布局：桌 160px 宽 × 600px 高，居中
- 6 个 NPC 分坐左右两侧各 3 人
- 玩家椅子在桌子正下方（y=1898），出生在 y=1882
- 壁炉（左上角）+ 书架（右上角）
- 棋盘格地板纹理

### 对话系统

- 简化为 NPC 说话 → 倒计时 2.5 秒 → 自动关闭（或按任意键关闭）
- 不使用 1/2/3 选项
- 自由活动中每个 NPC 从 `freeTalk` 数组随机抽取一句

---

## 三、实际项目文件结构

```
storyteller/
├── index.html          # ★ 入口 + CONFIG 内联 + 全部 UI 元素 + p5 CDN
├── main.js             # ★ p5 生命周期 + Game 类（双模式状态机）
├── player.js           # 玩家：WASD 移动、碰撞检测（不挡 NPC）
├── npc.js              # NPC 类 + NPCManager（6人竖桌 + spawnMarlishFamily）
├── world.js            # 竖长桌会客厅 + Maps 数据 + 碰撞
├── camera.js           # 摄像机平滑跟随
├── dialogue.js         # 对话 UI（简化：一句即关闭，no options）
├── ai.js               # AIDirector：预加载 JSON 数据 + DeepSeek API（备用）
├── input.js            # 键盘管理：Space/E/任意键关闭对话
├── code.md             # ★ 本文件
├── list.md             # 美术资源清单
└── data/
    ├── script.txt      # 《小岛惊魂》完整英文剧本（1987 行）
    ├── ai-skill.md     # AI 叙事引擎 Skill（分幕模板 + Prompt）
    └── acts/
        ├── analysis.md          # 剧本分析
        ├── npc_profiles.md      # 9 个 NPC 完整档案
        ├── act_specs.json       # 8 幕规格定义
        ├── act_0_dialogues.json  # 序章（6 旁白 + 8 对话）
        ├── act_1_dialogues.json  # 第1幕（5 旁白 + 7 对话 + freeTalk）
        ├── act_2_dialogues.json  # 第2幕（4 旁白 + 8 对话 + freeTalk）
        ├── act_3_dialogues.json  # 第3幕（5 旁白 + 8 对话 + freeTalk）
        ├── act_4_dialogues.json  # 第4幕（4 旁白 + 8 对话 + freeTalk）
        ├── act_5_dialogues.json  # 第5幕（4 旁白 + 10 对话 + freeTalk）
        ├── act_6_dialogues.json  # 第6幕（7 旁白 + 11 对话 + freeTalk）
        └── act_7_dialogues.json  # 第7幕（4 旁白 + 6 对话 + 结局文本）
```

---

## 四、JavaScript 代码加载顺序（关键！）

```html
<script> const CONFIG = { ... }; </script>   <!-- 全局配置，最前 -->
<script src="player.js"></script>
<script src="world.js"></script>
<script src="camera.js"></script>
<script src="npc.js"></script>
<script src="dialogue.js"></script>
<script src="ai.js"></script>
<script src="input.js"></script>
<script src="main.js"></script>            <!-- 入口最后 -->
```

**规则**：CONFIG 内联必须在最前。`main.js` 创建 `game` 全局单例。所有模块通过 `game.xxx` 互相访问。

---

## 五、NPC 角色

### 当前使用名（画布上显示 / 对话中显示）

| 桌侧 | 显示名 | 身份 | 颜色 |
|------|--------|------|------|
| 左1 | 通灵者 | 长女 Anne | 粉紫 #B482A0 |
| 左2 | 沉默者 | 幼子 Nicholas | 灰蓝 #8CA0C8 |
| 左3 | 战士 | 父亲 Charles | 沙棕 #A08C6E |
| 右1 | 管家 | 知情者 Mills | 深棕 #8C7864 |
| 右2 | 园丁 | 掘墓人 Tuttle | 苔绿 #789678 |
| 右3 | 见证者 | 哑女仆 Lydia | 淡紫灰 #C8B4C8 |

### 反转后新增（第 6 幕，出现于桌尾玩家附近）

| 显示名 | 身份 | 颜色 |
|--------|------|------|
| 通灵之子 | Victor Marlish | 蓝 #64B4C8 |
| 恐惧的母亲 | Mrs. Marlish | 粉 #C88C8C |
| 调查者 | Mr. Marlish | 棕 #A09682 |

---

## 六、已修复的 Bug 记录

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | WASD 失灵 | 玩家出生点与 NPC 碰撞 | 去除 NPC 硬碰撞，只保留障碍物碰撞 |
| 2 | [E] 显示为"继续晚宴" | 座位检测逻辑在 NPC 检测之后覆盖了文本 | 分离逻辑：先 NPC 后座位 |
| 3 | 玩家卡在桌子里 | 出生点太贴近桌子碰撞区 | 椅子下移 48px，出生点留 32px 过道 |
| 4 | 对话结束后 Space 无效 | 结束画面没有重启逻辑 | 添加 `_restart()` 方法，重置所有状态 |
| 5 | [E] Talk 在播放模式不消失 | 只在 freeRoam 隐藏提示 | 播放/标题/结束状态强制 `remove('visible')` |
| 6 | 1/2/3 选项残留 | 旧对话系统未清理 | 重写 dialogue.js 为简单一句话模式 |
| 7 | 白屏不消失且无意义 | 标题序列代码残留 | 完全删除白屏/标题卡/相关状态 |
| 8 | 表现力不足 | 旁白太少 | 每幕增加到 4-7 句环境描写 |

---

## 七、待修复 / 待完成

- [ ] **白屏标题卡 HTML 残留**：`index.html` 中 `<div id="white-screen">` 和 `<div id="title-card">` 元素仍在，main.js 中已停止引用但未清理 HTML。不阻塞运行。
- [ ] **反转幕 NPC 地点**：Marlish 一家出生在玩家座位附近，可能和玩家坐标重叠
- [ ] **NPC 自由对话数量偏少**：当前每人每幕 2-4 句，可增至 5 句
- [ ] **DeepSeek API 实际未调用**：`ai.js` 中有 API 客户端代码但当前全部用预写 JSON 数据
- [ ] **动态对话生成**：如果接入 API，`ai.js.callAPI()` 可实时生成 NPC 回复
- [ ] **加载状态指示**：init 中预加载 8 个 JSON 文件时无 loading UI（数据量小，通常瞬间完成）

---

## 八、运行与端口

```
npm: npx serve storyteller -p 5500 --no-clipboard
或者: 直接打开 index.html（需 HTTP 服务，fetch JSON 需要）
端口: 5500
```

---

## 九、关键代码位置速查

| 功能 | 文件 | 行/位置 |
|------|------|---------|
| Game 状态机 | `main.js` | `class Game`（~第 30 行起） |
| 剧情播放逻辑 | `main.js` | `_updatePlayback()` |
| 自由活动逻辑 | `main.js` | `_updateFreeRoam()` |
| 重新开始 | `main.js` | `_restart()` |
| 剧本数据加载 | `ai.js` | `loadAct(actNum)` |
| NPC 定义 | `npc.js` | `spawnDefault()` / `spawnMarlishFamily()` |
| 地图布局 | `world.js` | `generate()` |
| CONFIG | `index.html` | 第 69-71 行 `<script>` 内联 |
| 对话 JSON | `data/acts/act_*.json` | 每幕独立文件 |

---

## 十、给 AI 的注意事项

1. **不要使用 `type="module"`** — 全局 script 标签模式，所有 `class` 和 `function` 自动挂 window
2. **CONFIG 在 index.html 中内联定义**，不要在 JS 文件中重复声明
3. **JSON 数据通过 fetch 加载**（需要 HTTP 服务器，不能 file://）
4. **NPC 实体不阻挡玩家移动** — `player.js` 中 `_collidesWithAny` 不检测 NPC
5. **反转 NPC 在 `_startNextAct()` 中自动检测并生成**，不需要手动调用
6. **修改剧本对话只需编辑 JSON 文件**，不用改代码

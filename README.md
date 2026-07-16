# 雾宅回声：全自动互动舞台

一个以《小岛惊魂》本地剧本为依据生成的、完全离线可玩的 Canvas 舞台游戏，同时也是 `build-interactive-stage-game` Skill 的参考实现。

## 运行

```powershell
npm run dev
```

打开 <http://127.0.0.1:5175/>。服务器无第三方依赖，端口固定为 `5175`。

## 操作

- `WASD` / 方向键：移动 Grace。
- `E`：与近处 NPC 或道具互动；调查完成后返回演出。
- `Space`：推进台词与演出；台词面板上的按钮提供等价触屏操作。
- `Tab`：调查手记。
- `H`：台词回看。
- `Esc`：暂停；暂停菜单可调文字速度、高对比提示、选择章节或安全跳过本幕。

## 内容结构

- `data/script.txt`：行号可引用的原始剧本。
- `data/production.json`：唯一权威内容包。它同时包含标准 Story/Stage/Performance IR 与浏览器 Runtime 所需的空间、演员、道具和 Cue 数据。
- `src/runtime.js`：输入、镜头、舞台、碰撞、声音和 Cue 解释器。
- `src/game.js`：演出/探索状态机、交互、事实门控、存档与 UI。
- `scripts/augment-production.mjs`：从运行态内容重建标准 IR 层，保持双层格式同步。
- `tests/project-contract.mjs`：项目契约、剧情不变量和安全检查。

全剧为 4 个舞台、8 幕、11 名演员、27 条事实、228 条 Cue、32 个调查互动。核心剧情不依赖在线 AI，也不会在浏览器中读取任何 API Key。

## 校验

```powershell
npm run check
node C:\Users\yafo777\.codex\skills\build-interactive-stage-game\scripts\validate-production.mjs data\production.json --strict
node C:\Users\yafo777\.codex\skills\build-interactive-stage-game\scripts\simulate-playthrough.mjs data\production.json --strict
```

独立 Skill 前向测试位于 `tests/forward-output/`，使用一个未向主流程透露成品的短剧本验证了严格校验、全路线模拟和可重复打包。

## 内容提示

包含儿童死亡、家庭暴力、自杀回忆、幽灵与降灵会主题。

## 版本对照

启动一次 `npm run dev` 后，可在同一端口同时打开：

- 0.1 原始互动舞台：<http://127.0.0.1:5175/v01/>
- 0.2 总导演工作流版：<http://127.0.0.1:5175/v02/>

0.1 的工作流保存在 `.codex/skills/build-interactive-stage-game-v01/`；0.2 总导演与分工 Skill 保存在 `.codex/skills/`。两个游戏使用独立存档键，可以同时游玩而不会互相覆盖进度。

0.21 的俯视角像素游戏工作流保存在 `.codex/skills/build-interactive-stage-game-v021/`。它继承 0.2 的专业分工与验收流程，但强制使用原创掌机时代像素 RPG 语法、瓦片地图、四向角色、碰撞层和整数缩放，不覆盖 0.2。

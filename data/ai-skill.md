# 互动舞台 Skill 接入说明

本文件不再保存一次性的大 Prompt。正式可复用 Skill 已安装在：

`C:\Users\yafo777\.codex\skills\build-interactive-stage-game`

项目级输入配置位于 `production.config.json`，生成结果位于 `data/production.json`。

## 架构边界

- Skill：读取来源、建立故事圣经、选择改编模式、生成 Story Package、运行验证与浏览器冒烟测试。
- Story Package：只保存角色、事实、舞台、道具、场景、Cue、交互和来源映射。
- Runtime：稳定执行 Story Package；更换剧本时不得硬编码角色、地图和剧情。
- 运行时 AI：默认关闭。关键剧情和通关条件必须在构建期固化，并可离线执行。

## 当前作品

《小岛惊魂》使用 `faithful-stage` 模式，Grace 是主视角。旧版“访客参加晚宴”的内容属于 `interactive-retelling`，不再作为通用编译模板。

必须保持以下叙事不变量：

- Grace 是主角，Anne 与 Nicholas 是孩子。
- Lydia 始终沉默，且不是 Grace 杀害孩子的目击者。
- 花园墓碑属于 Mills、Tuttle、Lydia；三人死于肺结核。
- 降灵会之前不得揭示 Grace 母子已经死亡。
- Grace 在终幕亲自恢复杀子与自杀的记忆。

使用方式：在 Codex 中调用 `$build-interactive-stage-game`，传入 `production.config.json` 或明确给出剧本路径、改编模式、目标时长、玩家身份和资产策略。

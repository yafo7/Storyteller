# Storyteller 0.3 生命周期规划与治理包

本目录是《塞尔达传说》正传设计蒸馏、Storyteller 0.3 Skills、生产 workflow 和最终验证的权威施工图与阶段门禁。研究事实与可调用模式位于正式 `design-library/`，Skill 位于 `.codex/skills/`；本目录只保存规划、治理、阶段状态、契约草案、基线和报告。

当前阶段与完成状态必须读取 [deployment-manifest.json](./deployment-manifest.json)，不要再使用早期的 `PLAN_READY / RESEARCH_NOT_STARTED` 文案推断进度。

当前确认的总边界是：

- P1–P5 完成范围、证据、逐作覆盖、跨作蒸馏和 Library Beta；
- P6 完成全部 0.3 Skills、typed handoff、能力协商、失败回流、失效传播和 checkpoint/resume workflow；
- P7 由总导演读取剧本后自主生成一款完整游戏，用户不参与具体玩法、谜题、关卡、NPC 或剧情演出设计；
- P8 验证整个系统与游戏，包括用户冷启动、冻结候选的整局盲测原创性、全路线、存档、干净复现、断点恢复和上一稳定组合回滚；
- 盲测不是 P1–P6 的硬门槛。P1–P6 仍严格执行专有表达扫描、禁止迁移、结构 delta、变形轴和来源上下文隔离等静态原创性约束；
- 0.1、0.2、0.21 与其游戏、Skill、保存键和锁文件继续受基线保护。

## 阅读顺序

1. [MASTER_PLAN.md](./MASTER_PLAN.md)：总目标、架构、研究与蒸馏方法，以及 P1–P6 建系统、P7 生成、P8 验证的完整路线。
2. [QUALITY_GATES.md](./QUALITY_GATES.md)：什么叫“完成”，静态原创性与整局盲测如何分阶段，以及每种失败回到哪一层修复。
3. [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)：从规划冻结到 Library/Workflow Beta、Playable Candidate、系统验证和 Stable 的迁移、验证与回滚步骤。
4. [deployment-manifest.json](./deployment-manifest.json)：机器可读的状态、阶段、预定目录和禁止提前出现的正式产物。
5. [contracts](./contracts)：正式开发前要评审冻结的 JSON Schema 草案。
6. [templates](./templates)：只含占位符的研究、模式、选择和锁文件模板。
7. [baseline/legacy-skill-lock.json](./baseline/legacy-skill-lock.json)：旧版本的内容哈希冻结点。

## 阶段校验

```powershell
npm run check:v03-plan-freeze
npm run check:v03-deployment
```

只有 `currentPhase=P0` 时才运行规划冻结检查；进入 P1 后使用阶段感知部署检查及该阶段真实实现的 Library、Selector、Skill、Game 或 Validation 检查。阶段检查会验证合法状态迁移、未来路径隔离、Schema/模板映射与实例、受控维度、基线哈希和 Git 起点，不能用永远成功的占位脚本代替证据。

## 架构一句话

0.3 是一个会读取“版本化通用设计模式库”的总导演；`zelda-mainline` 是第一套证据 Pack；0.21 是第一套俯视像素产品 Profile。三者独立版本、按锁文件组合：P6 把生产系统接通，P7 自主生成候选，P8 才用真实整局体验验证它是否好玩、原创且可复现。

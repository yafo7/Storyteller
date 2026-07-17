# Storyteller 0.3 前置规划包

本目录是《塞尔达传说》正传设计蒸馏与 Storyteller 0.3 Skill 的施工图、冻结点和开工门禁。它不是正式知识库，也不是 0.3 Skill。

当前状态：`PLAN_READY / RESEARCH_NOT_STARTED`。

本轮已经部署：

- 0.3 总体架构、范围规则、阶段计划、角色分工和退出标准；
- 证据、作品观察、作品档案、设计模式、选择结果、版本锁和基准测试的契约草案；
- 0.1、0.2、0.21、共享专业 Skill 与现有游戏的只读基线锁；
- G0–G14 质量门禁、发布序列、回滚办法和失败回流规则；
- 一条可执行的规划一致性校验命令。

本轮明确没有做：

- 没有确定或填写《塞尔达传说》正传作品清单；
- 没有浏览、采集或蒸馏任何具体作品内容；
- 没有创建正式 `design-library/`；
- 没有创建 `curate-game-design-library`、`select-game-design-patterns` 或 `build-interactive-stage-game-v03` Skill；
- 没有生成 0.3 游戏，也没有修改 0.1、0.2、0.21 游戏和 Skill。

## 阅读顺序

1. [MASTER_PLAN.md](./MASTER_PLAN.md)：总目标、架构、研究与蒸馏方法、0.3 工作流和完整实施路线。
2. [QUALITY_GATES.md](./QUALITY_GATES.md)：什么叫“完成”，以及每种失败回到哪一层修复。
3. [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)：从规划冻结到 Stable 的开工、验证、发布与回滚步骤。
4. [deployment-manifest.json](./deployment-manifest.json)：机器可读的状态、阶段、预定目录和禁止提前出现的正式产物。
5. [contracts](./contracts)：正式开发前要评审冻结的 JSON Schema 草案。
6. [templates](./templates)：只含占位符的研究、模式、选择和锁文件模板。
7. [baseline/legacy-skill-lock.json](./baseline/legacy-skill-lock.json)：旧版本的内容哈希冻结点。

## 本轮校验

```powershell
npm run check:v03-plan-freeze
npm run check:v03-deployment
```

P0 冻结检查会确认正式研究和 0.3 Skill 尚未被误创建；阶段感知部署检查会验证合法状态迁移、未来路径隔离、Schema/模板映射与实例、受控维度、基线哈希和 Git 起点。进入 P1 后，全项目检查继续使用阶段感知命令，不会被永久锁死在 P0。

## 架构一句话

0.3 是一个会读取“版本化通用设计模式库”的总导演；`zelda-mainline` 是第一套证据 Pack；0.21 是第一套俯视像素产品 Profile。三者独立版本、按锁文件组合，不能互相写死。

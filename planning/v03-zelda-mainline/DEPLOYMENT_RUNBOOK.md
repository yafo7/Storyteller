# 0.3 部署与发布 Runbook

## 1. 阶段准入与路径隔离

当前权威阶段以 `deployment-manifest.json` 为准。本 Runbook 同时保留从 P0 到 P8 的完整迁移规则；不能把早期阶段的“路径必须不存在”误读为已经进入 P1–P6 后仍需删除正式产物。

各正式路径最早准入阶段如下：

```text
P1  design-library/
P6  .codex/skills/curate-game-design-library/
P6  .codex/skills/select-game-design-patterns/
P6  .codex/skills/build-interactive-stage-game-v03/
P7  v03/ 或 manifest 锁定的等价 0.3 游戏输出路径
```

推进阶段时必须在同一个原子变更中更新 `lifecycle.currentPhase`、阶段状态、相应 `lifecycle.flags.*.value` 和实际准入产物。阶段感知校验器继续阻止未来阶段路径：P6 完成前不得开始 P7 游戏，P7 候选冻结前不得声称 P8 验证完成。禁止靠删除校验器、伪造空报告或把诊断性盲测改名为硬门禁证据来绕过 Gate。

## 2. 每次开工前

1. 确认 Git 工作树，区分用户已有修改；
2. 运行 `npm run check:v03-deployment`；仅在 `currentPhase=P0` 时额外运行 `npm run check:v03-plan-freeze`；
3. 核对 `baseline/legacy-skill-lock.json`，旧 Skill 或游戏如有预期变更必须先另立版本，不更新基线掩盖漂移；
4. 只打开当前 Phase 需要的写入路径；
5. 为该 Phase 指定 owner、输入、输出、Gate 与失败回流；
6. 网络研究开始时记录访问日期、来源等级和精确定位；
7. 不把研究语料、下载资产或第三方正文直接放进 Skill。

## 3. Phase 状态迁移

### P0 → P1：允许范围与契约工作

前置：用户接受总体架构；规划校验通过。

动作：

- 将 `lifecycle.currentPhase` 改为 `P1`，把 P0 标记 `completed`、P1 标记 `in-progress`，并将 `lifecycle.flags.scopeDefinitionStarted.value` 置为 `true`；
- 创建正式 `design-library/governance`、`schemas`、`taxonomies` 与 `packs/zelda-mainline/corpus-scope.json`；
- 从本目录的草案迁移，不直接把草案当 Released Schema；
- 使用独立、标准兼容的 Draft 2020-12 validator 编译全部正式 Schema；本轮自包含校验器只负责草案所用关键字与模板实例，不能替代 P1 的元校验 Gate；
- 建立 semantic reference validator，检查受控维度唯一、primary version 连接、Pattern/Selection/Lock 引用闭环与 provenance filter；
- 建立变更日志和 schema version；
- 通过 G0 后冻结 Scope 版本。

禁止：逐作批量蒸馏、创建 Released Pattern、编写 v0.3 总导演。

### P1 → P2：允许校准研究

前置：G0；Schema、来源政策和原创性规则评审完成。

动作：

- 原子推进到 P2，并将 `lifecycle.flags.observationCollectionStarted.value` 置为 `true`；
- 选取结构差异明显的小样本；
- 两位分析 owner 独立记录 observations，再做差异审查；
- 调整 taxonomy 或 Schema 时执行显式 migration；
- 不创建 Released Pattern；但必须用一条明确标记为 calibration-only 的 provisional pattern 跑通 `detect → score → instantiate → emit → validate` 纵向切片，验证参数绑定、effect primitive、四部门 handoff 和可执行断言。

### P2 → P3：允许全范围逐作覆盖

前置：样本 G1/G2 通过；provisional vertical slice 的样本 G3 通过；观察粒度与 locator 规范稳定。

动作：

- 原子推进到 P3，并将 `lifecycle.flags.corpusCoverageStarted.value` 置为 `true`；
- 按 `workId` 分配单一 owner；
- 批量建立 source、claim、observation 和 dossier；
- 每批合并后更新 coverage 与断链报告；
- 遇到范围争议回到 G0，不自行扩展。

### P3 → P4：允许跨作品蒸馏

前置：全范围 G1/G2 通过。

动作：

- 原子推进到 P4，并将 `lifecycle.flags.crossTitleDistillationStarted.value` 置为 `true`；
- 聚类 observations，建立 candidate pattern family；
- 强制补反例、禁用条件、失败模式和原创化压力测试；
- 单作观察不得直接升级为自动可选模式；
- 每条 observation 分配为 pattern、unique 或 deferred。

### P4 → P5：允许发布知识库

前置：G3/G4/`G5-S`。模式级盲源归因即使存在也只作诊断，不是本迁移的硬门槛。

动作：

- 原子推进到 P5，并将 `lifecycle.flags.libraryReleaseStarted.value` 置为 `true`；
- 生成 Pack manifest、索引、关系图、coverage、flavor profile 和 changelog；
- 冻结 Schema、内容哈希与迁移表；
- 所有文件清单与树哈希统一使用 `canonical-tree-sha256/v1`，锁定 canonicalization version，不接受未列举文件或 `latest`；
- 运行 Pattern → Observation → Source 闭环检查；
- 运行专有表达扫描、禁止迁移清单、结构 delta、变形轴和来源上下文隔离检查；
- 先发 Alpha/Beta，不宣称 Stable。

### P5 → P6：允许完成全部 Skill 与 workflow

前置：有可锁定的 Library/Pack Beta；设计接口稳定。

动作：

- 原子推进到 P6，并将 `lifecycle.flags.skillDevelopmentStarted.value` 置为 `true`；
- 按 `skill-creator` 规则创建或完成 curator、selector、v03 director，并验证故事、玩法、演出、场景、美术、编译、评估等专业 Skill 的 0.3 handoff 合同；
- 为每个 Skill 编写明确触发语、非职责、输入输出、失败回流、能力协商和前向 fixture；
- selector 只读 Released Pattern，不读取全量逐作语料；
- v03 先分析 Story，再检索 Pattern；
- 增加机器可读的运行状态、阶段输入/输出 hash、原子 checkpoint、失效传播和 resume 规则；模拟一次中断并从最近有效检查点恢复；
- 旧专业 Skill 如需语义变化则新建版本化适配层；
- 运行旧基线锁与旧游戏回归；
- 运行完整 workflow 的合成前向测试，但不得创建或预填 P7 游戏目录。

### P6 → P7：允许生成 0.3 游戏

前置：`G5-S`、G6–G9、G13 的锁与合同部分；选择器反例能 abstain；P6 的 Skills、handoff、failure routing 与 checkpoint/resume 全部完成。

动作：

- 原子推进到 P7，并将 `lifecycle.flags.gameExperimentStarted.value` 置为 `true`；
- 由 v0.3 总导演读取《小岛惊魂》剧本并只接受高层产品约束，自主完成具体玩法、谜题、NPC、演出、场景、美术和实现决策；用户不补写这些设计；
- 只生成一款正式候选，使用独立保存键和路由，不覆盖 `v01/`、`v02/`、`v021/` 或旧 Skill；
- 顺序完成 Story → Pattern selection → Gameplay → Performance → World → Art → Build，并为每阶段保存权威 handoff、hash、checkpoint 和人工介入清单；
- 保存 library lock、design lineage、Runtime capabilities 与所有专业 Skill lock；
- 跑静态原创性、路线模拟、保存恢复、浏览器 QA 和截图预检；这些是候选冻结前自检，不代替 P8 的独立验证；
- 冻结唯一候选 build 与 P8 预注册判据后停止，不在 P7 宣称 Stable。

### P7 → P8：验证整个系统与游戏 / Stable

前置：P7 已产生可从开场到结局的冻结候选；版本锁、设计血缘、运行日志和检查点完整。P8 是验证阶段，不要求在迁移前伪造其结果。

动作：

- 原子推进到 P8，并将 `lifecycle.flags.stableReleaseStarted.value` 置为 `true`；
- 对冻结候选执行未参与生成者的整局盲测原创性 `G5-B`，匿名构建不得泄漏 Pack、模式 ID 或来源作品；
- 执行用户冷启动与揭盲，记录角色/目标理解、规则发现、卡点、回访和主要意图；
- 执行全路线、无软锁、保存恢复和浏览器可靠性验证；
- 在干净进程中按精确 lock 复跑，并模拟中断后从检查点恢复；
- 执行上一稳定 Skill、Library、Pack、Schema 和 Adapter 组合的回滚演练；
- 失败项回到 owning phase 修复，生成新候选并重新冻结；完成 `G5-B`、G10–G14 和受影响的上游 Gate；
- 发布 Stable manifest、校验值、迁移说明和上一个稳定回滚组合；
- Stable 前不改变默认总导演别名。

## 4. 版本锁内容

每次生产的 `library-lock.json` 必须锁定：

- v0.3 orchestrator 版本与内容 hash；
- 所有被调用专业 Skill 的路径与 hash；
- Library release、Schema major、Pack release；
- resolved Pattern ID 与精确版本；
- Product Profile、Perspective Adapter、Runtime capabilities；
- 输入剧本、Story model 与关键生产产物 hash；
- 生成时间、工具版本和配置；
- 失效规则版本。

禁止使用 `latest` 作为可发布游戏的依赖。

## 5. CI / 本地命令计划

当前可用：

```powershell
npm run check:v03-plan-freeze
npm run check:v03-deployment
```

后续依次新增，不提前放空壳：

```text
check:v03-scope       # 权威清单快照、候选全集对账、版本关系和零未决决策
check:v03-library     # Schema、引用闭环、关系、taxonomy、coverage
check:v03-originality # P1–P7 静态原创性：专有表达、禁止迁移、结构 delta、上下文隔离
check:v03-selector    # fixture、多随机种子、abstain、组合预算
check:v03-skills      # Skill 结构、引用、前向输出和旧版隔离
check:v03-game        # P7 生产 IR、能力、路线、保存、浏览器 QA 预检
check:v03-validation  # P8 整局盲测、冷启动、全路线、恢复与可靠性
check:v03-release     # P8 lock、hash、迁移、干净复现与回滚
```

`npm run check` 只在各新检查真实可靠后逐项接入，不能用永远成功的占位脚本制造绿色状态。

## 6. 发布列车

| 发行 | 可宣称内容 | 不可宣称内容 |
|---|---|---|
| Planning | 蓝图、草案、冻结点已部署 | 已研究、已蒸馏、已有 0.3 |
| Library Alpha | 管线与少量 Gold Pattern 可运行 | 全作品覆盖 |
| Coverage Alpha | 逐作覆盖完成 | 通用模式已成熟 |
| Pattern Beta | 跨作模式与 `G5-S` 静态原创性审核完成 | 选择器已有效、整局盲测已通过 |
| Skill / Workflow Beta | 全部 Skill、handoff、选择与组合基准、检查点恢复合同完成 | 已生成正式游戏、最终用户体验已通过 |
| Playable Candidate | P7 由 Skill 自主生成一款冻结候选，机器预检通过 | P8 整局盲测、用户冷启动、复现或回滚已通过 |
| RC | P8 的整局盲测、冷启动、系统可靠性、复现与回滚证据齐全 | Stable |
| Stable | G0–G14 与用户品味验收通过 | 永久完成；未来仍按版本增量更新 |

## 7. 回滚演练

P8 的 Stable 前至少执行一次：

1. 保存当前候选版本的所有 lock；
2. 切换到上一稳定 orchestrator + Library + Pack + Adapter 组合；
3. 验证旧游戏、旧保存键和旧生产数据不受影响；
4. 用旧 lock 定位所有依赖并运行其合同测试；
5. 恢复候选组合，确认没有原地改写稳定目录；
6. 记录耗时、失败点和人工步骤；
7. 回滚失败则 G14 不通过。

## 8. 增量补充

未来加入新作品、新版本或 Mario 等新 Pack 时：

1. 新证据先进入 Evidence 层；
2. 判断它支持既有模式、构成变体、反驳既有结论或形成新候选；
3. 运行去重、冲突、静态原创性和基准回归；若变更影响已冻结候选，再在 P8 重跑整局盲测；
4. 只将真正跨 Pack 的抽象模式提升到 `core/`；
5. 保留原 Pack provenance，不把来源抹平；
6. 按行为影响发布 patch/minor/major；
7. 旧 lock 永不自动升级。

## 9. 紧急停止条件

出现以下任一情况，停止向下游推进并回到 owning phase：

- 正传范围无法依据来源裁决；
- 大量记录缺来源或混淆事实与推断；
- Schema 在全量采集时仍频繁破坏性变化；
- 模式只能用原作名称或具体布局解释；
- 选择器持续因关键词而误选；
- 运行时无法实现核心模式；
- 模式导致 canon 或揭示顺序变化；
- P7 需要用户补写具体玩法、关卡或剧情演出才能继续；
- P8 匿名构建泄漏来源作品、Pack 或模式名称，导致整局盲测失真；
- 同一精确锁无法复现候选，或中断恢复跳过了失效阶段；
- 用户觉得像具体复制品，或完全感受不到设计收益；
- 旧 Skill / 游戏哈希发生未授权漂移。

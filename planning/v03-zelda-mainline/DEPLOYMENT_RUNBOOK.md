# 0.3 部署与发布 Runbook

## 1. 当前冻结状态

当前只允许修改 `planning/v03-zelda-mainline/` 及其校验入口。以下正式路径在 Planning Freeze 期间必须不存在：

```text
design-library/
.codex/skills/curate-game-design-library/
.codex/skills/select-game-design-patterns/
.codex/skills/build-interactive-stage-game-v03/
v03/
```

解除某一冻结必须先评审 `deployment-manifest.json`，在同一个原子变更中推进 `lifecycle.currentPhase`、阶段状态、相应 `lifecycle.flags.*.value`，并创建该阶段准入的目录。阶段感知校验器会继续阻止未来阶段的路径。禁止靠删除校验器绕过 Gate。

## 2. 每次开工前

1. 确认 Git 工作树，区分用户已有修改；
2. 运行 `npm run check:v03-deployment`；P0 额外运行 `npm run check:v03-plan-freeze`；
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

前置：G3/G4/G5。

动作：

- 原子推进到 P5，并将 `lifecycle.flags.libraryReleaseStarted.value` 置为 `true`；
- 生成 Pack manifest、索引、关系图、coverage、flavor profile 和 changelog；
- 冻结 Schema、内容哈希与迁移表；
- 所有文件清单与树哈希统一使用 `canonical-tree-sha256/v1`，锁定 canonicalization version，不接受未列举文件或 `latest`；
- 运行 Pattern → Observation → Source 闭环检查；
- 先发 Alpha/Beta，不宣称 Stable。

### P5 → P6：允许编写 Skill

前置：有可锁定的 Library/Pack Beta；设计接口稳定。

动作：

- 原子推进到 P6，并将 `lifecycle.flags.skillDevelopmentStarted.value` 置为 `true`；
- 按 `skill-creator` 规则分别创建 curator、selector、v03 director；
- 为每个 Skill 编写明确触发语、非职责、输入输出、失败回流和前向 fixture；
- selector 只读 Released Pattern，不读取全量逐作语料；
- v03 先分析 Story，再检索 Pattern；
- 旧专业 Skill 如需语义变化则新建版本化适配层；
- 运行旧基线锁与旧游戏回归。

### P6 → P7：允许生成 0.3 游戏

前置：G6–G9、G13；选择器反例能 abstain。

动作：

- 原子推进到 P7，并将 `lifecycle.flags.gameExperimentStarted.value` 置为 `true`；
- 生成三臂同条件实验，不覆盖 `v01/`、`v02/`：A 为原生 0.21，B 为 0.3 且关闭全部 Inspiration Pack，C 为 0.3 且只启用锁定版本的 Zelda Pack；
- B 的 provenance filter 必须阻止由 Zelda Pack 晋升到 core 的模式泄漏，B/C 才能隔离 Pack 的因果收益；A/B 则用于识别总导演本身的收益；
- 使用独立保存键和路由；
- 每组保存 library lock、design lineage 和 Runtime capabilities；
- 跑静态检查、路线模拟、浏览器 QA、截图与冷体验协议。

### P7 → P8：RC / Stable

前置：G10/G11；已完成根因回流和回归。

动作：

- 原子推进到 P8，并将 `lifecycle.flags.stableReleaseStarted.value` 置为 `true`；
- 冻结 RC；
- 执行用户冷体验与揭盲；
- 完成 G12、G14；
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
check:v03-originality # 专有表达扫描与人工审查清单
check:v03-selector    # fixture、多随机种子、abstain、组合预算
check:v03-skills      # Skill 结构、引用、前向输出和旧版隔离
check:v03-game        # 生产 IR、能力、路线、保存、浏览器 QA
check:v03-release     # lock、hash、迁移、复现与回滚
```

`npm run check` 只在各新检查真实可靠后逐项接入，不能用永远成功的占位脚本制造绿色状态。

## 6. 发布列车

| 发行 | 可宣称内容 | 不可宣称内容 |
|---|---|---|
| Planning | 蓝图、草案、冻结点已部署 | 已研究、已蒸馏、已有 0.3 |
| Library Alpha | 管线与少量 Gold Pattern 可运行 | 全作品覆盖 |
| Coverage Alpha | 逐作覆盖完成 | 通用模式已成熟 |
| Pattern Beta | 跨作模式与原创性审核完成 | 选择器已有效 |
| Skill Beta | 选择与组合通过基准 | 最终用户体验已通过 |
| RC | 同条件游戏和盲测证据齐全 | Stable |
| Stable | G0–G14 与用户品味验收通过 | 永久完成；未来仍按版本增量更新 |

## 7. 回滚演练

Stable 前至少执行一次：

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
3. 运行去重、冲突、原创性和基准回归；
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
- 三臂差异主要来自画面、时长或内容量，而非受控变量；
- 用户觉得像具体复制品，或完全感受不到设计收益；
- 旧 Skill / 游戏哈希发生未授权漂移。

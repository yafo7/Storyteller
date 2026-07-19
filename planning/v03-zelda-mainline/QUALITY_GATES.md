# 0.3 质量门禁与失败回流

## 1. 门禁原则

- Gate 检查的是证据，不是“感觉差不多完成”；
- 硬门禁失败时不得用总分平均抵消；
- 自动检查负责结构、引用、路线和回归，不能代替用户品味验收；
- 一次游戏中的问题优先回到知识、选择、适配或导演的根因层，不只在成品里打补丁；
- 每次根因修复都新增可复现 fixture。
- 原创性采用分阶段门禁：P1–P6 的静态约束负责阻止专有表达和结构照搬，P8 才对冻结后的完整游戏执行整局盲测；P8 前的模式级盲测只能作为诊断证据，不能阻塞 Library Beta 或 Skill/Workflow Beta。

## 2. G0–G14

| Gate | 对象 | 通过标准 | 必须提交的证据 | 类型 | 失败回流 |
|---|---|---|---|---|---|
| G0 Scope Freeze | 正传范围 | 权威目录快照并集 100% 登记并双向对账；候选 100% 为 included/excluded，`review=0`；版本、移植、重制、扩展、多人及边界规则明确 | 快照 hash、candidate-universe 对账、`corpus-scope.json`、决策日志 | 硬 | 项目章程 / Corpus |
| G1 Work Coverage | 每部纳入作品 | 标题覆盖 100%；核心维度 100% covered 或有理由 N/A；一般维度 ≥95% | 作品×维度矩阵、缺口报告 | 硬 | 单作分析 |
| G2 Evidence Closure | 事实与案例 | 外部事实均有 Source、版本、结构化 locator、claim 类型/重要性和置信度；关键 claim 至少有一个 A/B 来源；事实与解释引用分离；关键无来源断言为 0 | Claims ledger、来源等级矩阵、断链报告 | 硬 | 证据层 |
| G3 Pattern Completeness | 每条模式 | 必填字段 100%；五个 typed hook、参数绑定、effect primitives、四部门 handoff、适用/禁用、发展、恢复、运行时、原创化和输入→预期输出断言可执行 | Schema、hook fixture 与 vertical-slice 报告 | 硬 | 蒸馏层 |
| G4 Library Consistency | 模式与关系 | 未解决重复、术语冲突、悬空引用、关系环和 ID 冲突为 0 | 去重、图关系、taxonomy 报告 | 软转硬（Beta 起硬） | Schema / 蒸馏 |
| G5 Originality | 模式库与完整游戏 | `G5-S`：专有角色、地图、台词、音乐、UI、造型和标志性步骤迁移为 0，来源语料不进入生成上下文，模式声明足够的变形轴与结构 delta；`G5-B`：冻结后的完整游戏由未参与生成的 reviewer 整局体验后，不能稳定归因到某个具体作品、关卡或谜题 | P1–P6 提交扫描、禁止迁移清单、结构 delta、变形记录与上下文隔离证明；P8 提交匿名构建、预注册判据、整局盲测和揭盲记录 | 分阶段硬：P4–P6 只要求 `G5-S`，P8 要求 `G5-B` | 原创化层 / P8 Evaluator |
| G6 Selection Quality | 候选选择 | 相关性、系统深度、复用发展、预算、运行时和原创余量平均 ≥4/5；关键项 ≥3/5；反例能 abstain | 多类基准、多随机种子、拒绝理由 | 软转硬（Skill Beta 起硬） | 选择器 |
| G7 Composition Discipline | 单个方案 | 默认 1 核心 + 1–3 辅助；核心经历教学、发展、变化/反转、综合考核；冲突为 0 | 组合报告、设计血缘 | 硬 | 选择器 / 总导演 |
| G8 Canon Safety | 适配结果 | 核心事实、人物知识、揭示顺序和结局约束未被模式污染 | Story diff、reveal audit | 硬 | Story / Pattern handoff |
| G9 Runtime Fit | 选择与引擎 | 所需能力 100% 满足或有批准替代；每个 released effect 都闭合到 typed transaction；地图/碰撞、NPC/日程、库存/物件、传送、存档/恢复与不可逆门均经正反 fixture 执行；不可实现项不静默降为文本 | 能力锁、effect contract、可执行 adapter 状态事务报告 | 硬 | Adapter / 编译 |
| G10 Playability | 完整游戏 | 所有必需路线可达；无软锁；保存恢复一致；最终段真实使用既有规则 | 自动路线、浏览器 QA、状态快照 | 硬 | 关卡 / 编译 |
| G11 Autonomous Workflow | P7 生产运行 | 用户只提供剧本与高层产品约束；Skill 独立完成故事分析、选择、玩法、演出、场景、美术、编译和候选自检；没有由用户补写具体玩法、谜题、关卡或剧情演出；阶段检查点、失效传播和失败回流完整 | 生产运行日志、阶段 handoff、checkpoint/resume 记录、设计血缘、人工介入清单 | 硬（P8 验证） | 0.3 总导演 / 对应责任层 |
| G12 User Taste | 用户冷启动体验 | 首次接触玩家能理解角色、近期目标和主要规则；用户认可“有设计味道但不是具体模仿”，且主要意图由行动和演出而非外部说明传达 | 冷启动记录、行为数据、卡点、揭盲反馈 | 硬 | 选择 / 演出 / 蒸馏 |
| G13 Reproducibility | 系统与发行 | Skill、Schema、Library、Pack、模式、Adapter、专业 Skill、输入和关键产物均被 hash 锁定；从同一锁与检查点可复跑到等价候选 | release manifest、lock、冷启动复跑日志、产物 hash 对账 | 硬 | 发布工程 |
| G14 Rollback | 默认版本 | 能恢复上一稳定组合，不修改旧目录、旧游戏或旧存档 | 回滚演练与旧锁验证 | 硬 | 部署层 |

## 3. 生命周期与门禁组合

| 里程碑 | 必须通过 |
|---|---|
| Scope Freeze | G0 |
| Calibration Exit | 样本上的 G1、G2，以及 provisional vertical slice 的样本 G3 |
| Coverage Alpha | 全范围 G1、G2 |
| Pattern Beta | G3、G4、`G5-S`；模式级盲测不作为退出条件 |
| Skill / Workflow Beta（P6） | `G5-S`、G6、G7、G8、G9、G13 的锁与合同部分；不得以尚无完整游戏为由要求 `G5-B`、G10–G12 |
| Playable Candidate（P7） | 由 Skill 自主生成一个完整候选；完成静态原创性、冒烟、路线和保存预检，但不宣称 P8 验证通过 |
| System / Game Validation（P8） | `G5-B`、G10–G14 以及受影响的上游 Gate 回归 |
| Stable | G0–G14；整局盲测、用户冷启动、复现和回滚均为最终硬证据 |

## 4. Flavor 与 Clone Risk 必须分开

### Flavor 代理指标

- 玩家是否因地标、异常和好奇主动探索；
- 环境规则是否一致并可实验；
- 新能力或知识是否重释旧空间；
- 地图是否产生可记忆的回环和捷径；
- 教学是否主要通过安全情境、动作和反馈；
- 同一规则是否发展并在终局综合；
- 奖励是否扩展后续可能性；
- 玩家是否感觉答案由自己发现。

### Clone-risk 否决项

- 具体房间或地图拓扑高度复刻；
- 相同对象、相同步骤顺序和相同反馈的谜题；
- 标志性 Boss 阶段、弱点节奏或动作组合；
- 专有角色、道具、纹样、UI、音乐动机和声音提示；
- 可辨识台词、故事段落或视觉构图；
- 仅换名字与皮肤但保留完整表层结构。

Flavor 得分再高，也不能抵消任一 clone-risk 否决项。P1–P6 用静态扫描、结构 delta、禁止迁移清单和来源上下文隔离执行 `G5-S`；P7 候选冻结后，P8 再由未参与生成的人执行 `G5-B` 整局盲测。此前积累的模式级盲测可以帮助定位风险，但结果过期、缺失或与当前 release set 不对齐时，只登记为诊断债务，不阻塞 P1–P6。

## 5. 选择器基准集

正式 Skill Beta 前建立互不相似的、原创的小型剧本 fixture，至少覆盖：

- 密室悬疑；
- 关系型室内剧；
- 公路或追逐；
- 开放区域探索；
- 喜剧；
- 对话密集；
- 空间变化极少；
- 明确不适合 Zelda Pack 的反例。

每个 fixture 记录应出现的设计属性和不应出现的强制答案，而不是规定唯一模式 ID。每个用例运行多个随机种子，检查词面误选、组合漂移和 abstain 能力。

## 6. P7 自主生成与 P8 验证协议

### 6.1 P7 自主生成边界

- 用户只提供剧本、目标平台、视角、端口或时长等高层产品约束，不参与具体玩法、谜题、关卡、NPC 行为或剧情演出设计；
- 0.3 总导演锁定 Library、Pack、Product Profile、Runtime capabilities 和全部专业 Skill；
- 总导演依序完成 Story → Pattern selection → Gameplay → Performance → World → Art → Build，不得先看来源作品表面案例再改写故事；
- 每一阶段写入权威 handoff、输入/输出 hash、状态、失败 owner 和可恢复 checkpoint；中断后从最近有效检查点恢复，不静默重做已批准上游；
- P7 只生成一个完整可玩候选并做机器预检，不把用户冷体验、整局盲测或最终品味验收伪装成已完成。

### 6.2 P8 冻结与整局盲测

- 先冻结候选 build、输入剧本、版本锁和预注册判据，再开始体验；
- 匿名页面、存档和记录不得暴露 Zelda、模式 ID、参考作品名或设计血缘；
- reviewer 不参与该候选的研究、模式选择、实例化或实现，并从开场到结局体验完整路线；
- 记录其自发联想到的作品、关卡、谜题或表达，以及归因置信度和触发片段；稳定指向具体来源即 `G5-B` 失败，回到 Originality/Selector/Gameplay/Stage 对应层；
- 揭盲后对照静态结构 delta 和设计血缘，避免把通用冒险类型相似误判为具体复制，也避免仅靠换皮掩盖结构复制。

### 6.3 用户冷启动记录

- 首次理解角色身份和短期目标所需时间；
- 主动偏离直线路径和调查异常的次数；
- 第一次理解环境规则所需时间；
- 卡住位置、尝试次数和求助次数；
- 是否记住关键地标和返回路线；
- 获得新能力或知识后是否主动回访；
- 是否预测并验证规则；
- 最终段是否意识到自己在综合此前规则；
- 对“自己发现”与“文本告诉”的主观评价。

### 6.4 揭盲后问题

- 是否感到探索与空间设计具有统一哲学；
- 哪些机制真正与剧本结合；
- 哪些部分只是装饰或套路；
- 是否明显联想到某一部具体作品、关卡或谜题；
- 哪个地方最需要删减、加深或重新教学。

### 6.5 复现与回滚

- 在干净进程中仅使用冻结输入、精确 lock 和已登记工具版本重放 workflow，核对关键 handoff 与候选 build hash；
- 从一次人为中断的阶段检查点恢复，确认不会污染上游产物或遗漏失效传播；
- 切回上一稳定 Skill、Library、Pack、Schema 和 Adapter 锁组合，确认旧游戏与旧存档不变；
- 任一复现、恢复或回滚失败都阻止 Stable。

三臂或多版本对照仍可在未来作为研究实验，用于估计总导演或 Pack 的增量收益；它不是本轮 P1–P8 的完成前提，也不能替代对实际候选的整局验证。

## 7. 失败回流表

| 现象 | 根因候选 | 首选修复层 |
|---|---|---|
| 作品事实错误或缺项 | 来源不可靠、版本混淆、coverage 漏洞 | Evidence / Dossier |
| 两个模式重复或矛盾 | 抽象粒度不一致、taxonomy 模糊 | Distillation |
| 选中与剧情无关的玩法 | 查询信号、权重或反例不足 | Selector |
| 玩法有趣但提前泄露剧情 | pattern handoff 越权、reveal gate 缺失 | Story / Director |
| 设计好但运行时做不到 | 预过滤或 adapter 能力声明错误 | Runtime adapter |
| 玩家不知道自己是谁或要做什么 | Onboarding、目标可视化、节奏 | Performance |
| 玩家做事但世界没有变化 | state transaction 或 staging 缺失 | Gameplay / Stage |
| 得到道具却没有回访动机 | reward、map variant、landmark 设计不足 | Gameplay / Stage |
| 明显像某个原作谜题 | 原创化变形不足 | Originality |
| 卡死、路线断裂、存档损坏 | 拓扑、状态恢复、编译 | Stage / Runtime |
| 自动分高但用户觉得没味道 | 代理指标或权重失真 | Flavor profile / Selector |
| 有味道但像复制品 | 两个 Gate 被错误合并 | Originality governance |

## 8. 回归记录最低字段

每次根因修复新增一条回归记录，至少包含：

- fixture ID 与输入哈希；
- Skill、Schema、Library、Pack、Adapter 与 Runtime 版本；
- 选中、拒绝的模式 ID 与分数；
- 可复现步骤和失败表现；
- owning phase 与根因；
- 修复版本；
- 新断言和通过证据；
- 是否需要迁移或废弃已有模式。

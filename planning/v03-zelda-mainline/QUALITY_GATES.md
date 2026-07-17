# 0.3 质量门禁与失败回流

## 1. 门禁原则

- Gate 检查的是证据，不是“感觉差不多完成”；
- 硬门禁失败时不得用总分平均抵消；
- 自动检查负责结构、引用、路线和回归，不能代替用户品味验收；
- 一次游戏中的问题优先回到知识、选择、适配或导演的根因层，不只在成品里打补丁；
- 每次根因修复都新增可复现 fixture。

## 2. G0–G14

| Gate | 对象 | 通过标准 | 必须提交的证据 | 类型 | 失败回流 |
|---|---|---|---|---|---|
| G0 Scope Freeze | 正传范围 | 权威目录快照并集 100% 登记并双向对账；候选 100% 为 included/excluded，`review=0`；版本、移植、重制、扩展、多人及边界规则明确 | 快照 hash、candidate-universe 对账、`corpus-scope.json`、决策日志 | 硬 | 项目章程 / Corpus |
| G1 Work Coverage | 每部纳入作品 | 标题覆盖 100%；核心维度 100% covered 或有理由 N/A；一般维度 ≥95% | 作品×维度矩阵、缺口报告 | 硬 | 单作分析 |
| G2 Evidence Closure | 事实与案例 | 外部事实均有 Source、版本、结构化 locator、claim 类型/重要性和置信度；关键 claim 至少有一个 A/B 来源；事实与解释引用分离；关键无来源断言为 0 | Claims ledger、来源等级矩阵、断链报告 | 硬 | 证据层 |
| G3 Pattern Completeness | 每条模式 | 必填字段 100%；五个 typed hook、参数绑定、effect primitives、四部门 handoff、适用/禁用、发展、恢复、运行时、原创化和输入→预期输出断言可执行 | Schema、hook fixture 与 vertical-slice 报告 | 硬 | 蒸馏层 |
| G4 Library Consistency | 模式与关系 | 未解决重复、术语冲突、悬空引用、关系环和 ID 冲突为 0 | 去重、图关系、taxonomy 报告 | 软转硬（Beta 起硬） | Schema / 蒸馏 |
| G5 Originality | 模式库与生成结果 | 专有角色、地图、台词、音乐、UI、造型和标志性步骤迁移为 0；拓扑/角色图/动作序列/反馈/叙事功能结构指纹显著改变；独立 reviewer 盲源归因不稳定 | 扫描、结构 delta、变形记录、盲源审查 | 硬 | 原创化层 |
| G6 Selection Quality | 候选选择 | 相关性、系统深度、复用发展、预算、运行时和原创余量平均 ≥4/5；关键项 ≥3/5；反例能 abstain | 多类基准、多随机种子、拒绝理由 | 软转硬（Skill Beta 起硬） | 选择器 |
| G7 Composition Discipline | 单个方案 | 默认 1 核心 + 1–3 辅助；核心经历教学、发展、变化/反转、综合考核；冲突为 0 | 组合报告、设计血缘 | 硬 | 选择器 / 总导演 |
| G8 Canon Safety | 适配结果 | 核心事实、人物知识、揭示顺序和结局约束未被模式污染 | Story diff、reveal audit | 硬 | Story / Pattern handoff |
| G9 Runtime Fit | 选择与引擎 | 所需能力 100% 满足或有批准替代；不可实现项不静默降为文本 | 能力锁、adapter 报告 | 硬 | Adapter / 编译 |
| G10 Playability | 完整游戏 | 所有必需路线可达；无软锁；保存恢复一致；最终段真实使用既有规则 | 自动路线、浏览器 QA、状态快照 | 硬 | 关卡 / 编译 |
| G11 Blind Experiment | 三臂对照 | A 原生 0.21、B 0.3 无 Pack、C 0.3+Zelda Pack；同 Profile/资产/时长/预算且 provenance 无泄漏；B>A 归因导演，C>B 归因 Pack，并在未见 fixture 复现预注册最小收益 | parity report、匿名顺序、行为数据、问卷 | 软（RC 必交） | 对应责任层 |
| G12 User Taste | 用户冷体验 | 用户认可“有设计味道但不是具体模仿”，且理解主要意图与角色目标 | 冷体验记录、揭盲反馈 | 硬 | 选择 / 演出 / 蒸馏 |
| G13 Reproducibility | 发行 | Skill、Schema、Library、Pack、模式、Adapter 和专业 Skill 均被 hash 锁定 | release manifest、lock、复跑日志 | 硬 | 发布工程 |
| G14 Rollback | 默认版本 | 能恢复上一稳定组合，不修改旧目录、旧游戏或旧存档 | 回滚演练与旧锁验证 | 硬 | 部署层 |

## 3. 生命周期与门禁组合

| 里程碑 | 必须通过 |
|---|---|
| Scope Freeze | G0 |
| Calibration Exit | 样本上的 G1、G2，以及 provisional vertical slice 的样本 G3 |
| Coverage Alpha | 全范围 G1、G2 |
| Pattern Beta | G3、G4、G5 |
| Skill Beta | G6、G7、G8、G9、G13 |
| Game RC | G5、G7–G11、G13 |
| Stable | G0–G14；其中 G11 必交证据，G12 为最终人工硬门禁 |

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

Flavor 得分再高，也不能抵消任一 clone-risk 否决项。

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

## 6. 三臂实验与冷体验协议

### 6.1 三臂与控制变量

- 同一剧本与 story model；
- 同一 0.21 俯视像素 Product Profile；
- 同一 Runtime capabilities；
- 相近游戏时长、场景数、美术规格和生产预算；
- A 使用原生 0.21；B 使用 0.3 且关闭全部 Pack；C 使用同一 0.3 且只开启锁定的 Zelda Pack；
- B 的 provenance filter 阻止 Zelda 派生模式经 core 间接泄漏；
- 页面不显示版本号、“塞尔达”或模式名称；
- 体验顺序随机或交叉。
- 为三组生成 parity report，并使用至少一个未参与调参的新 fixture 复测；
- 在看结果前预注册行为指标阈值和最小可感知收益。

### 6.2 冷体验记录

- 首次理解角色身份和短期目标所需时间；
- 主动偏离直线路径和调查异常的次数；
- 第一次理解环境规则所需时间；
- 卡住位置、尝试次数和求助次数；
- 是否记住关键地标和返回路线；
- 获得新能力或知识后是否主动回访；
- 是否预测并验证规则；
- 最终段是否意识到自己在综合此前规则；
- 对“自己发现”与“文本告诉”的主观评价。

### 6.3 揭盲后问题

- 是否感到探索与空间设计具有统一哲学；
- 哪些机制真正与剧本结合；
- 哪些部分只是装饰或套路；
- 是否明显联想到某一部具体作品、关卡或谜题；
- 哪个地方最需要删减、加深或重新教学。

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

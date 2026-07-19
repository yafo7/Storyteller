import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GENERATED_AT = "2026-07-17";
const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(here, "..");
const patternPath = path.join(libraryRoot, "packs", "zelda-mainline", "patterns", "released-patterns.json");
const blindPath = path.join(libraryRoot, "benchmarks", "originality-blind-applications.json");
const mapPath = path.join(libraryRoot, "benchmarks", "originality-case-map.json");

const themes = [
  {
    setting: "雾潮灯塔群",
    actor: "潮汐抄表员",
    problem: "三座灯塔在同一夜给出了互相矛盾的水位记录",
    deadline: "避难船队抵达浅海前",
    stakes: "整支船队会被错误灯号引向盐礁",
    anchor: "悬在主塔下方的沉钟闸门",
    prop: "会吸收盐分并显出旧刻度的纸带",
    companion: "拒绝离开雾笛室的老领航员",
    visual: "雾线从银白逐段转为靛蓝",
    sound: "三声远近不同的铜钟回响"
  },
  {
    setting: "地下菌丝邮局",
    actor: "夜班分拣员",
    problem: "寄往不同洞层的孢子信件开始在错误管道中发芽",
    deadline: "晨间换气开始前",
    stakes: "发芽的管道会封死整座聚落的呼吸井",
    anchor: "贯穿大厅的透明气根柱",
    prop: "遇到特定气味便卷曲的菌纸标签",
    companion: "只用敲击节奏交流的维修学徒",
    visual: "菌丝脉络由淡绿亮成暖金",
    sound: "中空木管发出的短促敲击"
  },
  {
    setting: "沙海移动图书馆",
    actor: "见习卷册修复师",
    problem: "驮城的六条机械足开始追随不同版本的旧航图",
    deadline: "下一场玻璃砂暴抵达前",
    stakes: "图书馆会在移动中被撕成两个互不相连的区段",
    anchor: "保存历代路线的旋转书井",
    prop: "能在热风中投出文字阴影的铜页",
    companion: "坚持某张删改航图才是真本的守卷人",
    visual: "沙面上的文字阴影改变朝向与长度",
    sound: "机械足与书井齿轮逐渐合拍的低鸣"
  },
  {
    setting: "冰川温室列车",
    actor: "种子保温员",
    problem: "列车穿越裂谷时，三个车厢的昼夜循环突然彼此错位",
    deadline: "冻土隧道封闭前",
    stakes: "最后一批耐寒种子会在错误季相中提前萌发",
    anchor: "连接车厢的棱镜换气廊",
    prop: "可储存一小时日照的黑釉花盆",
    companion: "把每株幼苗都叫作不同名字的列车长",
    visual: "霜花沿玻璃边缘按车厢次序退去",
    sound: "暖气阀门由杂乱喷气变成稳定四拍"
  },
  {
    setting: "云端风筝诊所",
    actor: "升力配药师",
    problem: "病患风筝的骨架开始吸入彼此不相容的高空气流",
    deadline: "诊所越过雷云边界前",
    stakes: "整片吊舱会因升力失衡坠入暴雨层",
    anchor: "诊所中央的压差转盘",
    prop: "会随湿度折叠的薄木翼片",
    companion: "害怕雷声却能辨认风向的幼年信使",
    visual: "牵索上的结依次亮起青、白、橙三色",
    sound: "风穿过翼片时形成由低到高的哨音"
  },
  {
    setting: "火山陶瓷剧院",
    actor: "替补机关师",
    problem: "舞台下的熔釉渠道把每段布景烧成了错误颜色",
    deadline: "纪念演出开幕前",
    stakes: "观众会把被篡改的颜色顺序当作一场公开指控",
    anchor: "能够翻转三层舞台的巨型陶轮",
    prop: "只有受热后才显出裂纹的白瓷面具",
    companion: "坚称事故属于演出一部分的首席演员",
    visual: "釉色沿渠道从暗红凝固成清晰的黑白边界",
    sound: "陶轮每完成一层咬合便发出一记脆响"
  },
  {
    setting: "淹水的钟表铸造镇",
    actor: "潜水校时员",
    problem: "不同街区的水下钟都在提前敲响同一场撤离警报",
    deadline: "上游闸湖第二次放水前",
    stakes: "居民会在真正洪峰到来时拒绝再次撤离",
    anchor: "半沉在广场中的母钟摆",
    prop: "能封存一次振动的蜡制齿轮",
    companion: "听力受损却记得旧潮序的铸钟匠",
    visual: "水中的气泡围绕正确钟摆形成等距圆环",
    sound: "失谐钟声最终收束为一次清晰重音"
  },
  {
    setting: "月面废料果园",
    actor: "低重力嫁接员",
    problem: "回收金属培育出的果树开始把磁性果实抛向居住穹顶",
    deadline: "下一次人造黎明启动前",
    stakes: "果实会击穿刚修好的氧气薄膜",
    anchor: "控制果园潮汐磁场的旧起重环",
    prop: "能改变磁极的双面修枝夹",
    companion: "把每棵树的生长误差画成漫画的巡检机器人",
    visual: "金属花粉围绕磁极画出相反旋向的弧线",
    sound: "起重环从连续嗡鸣变为间隔明确的脉冲"
  },
  {
    setting: "迁徙的玄武岩村",
    actor: "临时桥梁看守",
    problem: "村庄脚下的石兽在跨越峡谷时拒绝同时落足",
    deadline: "峡谷热气流转向前",
    stakes: "背负居民的三块街区会被拉向不同崖壁",
    anchor: "系住石兽步幅的中央绳塔",
    prop: "受压后会留下蓝色掌纹的软岩楔",
    companion: "只能在石兽停步时说真话的议事员",
    visual: "岩楔上的掌纹依落足次序连续显现",
    sound: "绳塔拉索从刺耳摩擦变为沉稳共振"
  },
  {
    setting: "镜盐矿井",
    actor: "回声测绘师",
    problem: "新生盐镜把求救声反射到了已经废弃的巷道",
    deadline: "结晶潮封住竖井前",
    stakes: "救援队会沿假回声深入没有回程的裂隙",
    anchor: "可旋转整面盐壁的配重轴",
    prop: "敲击后会暂时失去反光的黑盐钉",
    companion: "声称每道回声都属于同一人的失踪者家属",
    visual: "错误倒影被黑盐钉切成可追踪的窄带",
    sound: "回声延迟由重叠噪声变为三段可数间隔"
  },
  {
    setting: "发条昆虫温室",
    actor: "机械授粉观察员",
    problem: "新孵化的铜蜂开始为尚未开花的植株传粉",
    deadline: "温室进入夜间密封前",
    stakes: "错误花粉会让食用藤蔓在一夜内木质化",
    anchor: "记录蜂群路线的玻璃蜂巢",
    prop: "可模仿一种花香的细齿钥匙",
    companion: "认为失序蜂群正在传递警告的老园丁",
    visual: "铜蜂腹部的刻度灯组成新的飞行箭头",
    sound: "翅轮噪声在正确花序旁降为柔和和弦"
  },
  {
    setting: "深海珊瑚法庭",
    actor: "潮压记录官",
    problem: "证词被活珊瑚保存后，会随水压改变成互相冲突的句序",
    deadline: "陪审鱼群迁出暖流前",
    stakes: "一名无辜潜航员将因错误句序被永久放逐",
    anchor: "环绕审判席生长的记忆珊瑚墙",
    prop: "能锁定一段水压的透明墨囊",
    companion: "只愿在完全黑暗中补充证词的目击者",
    visual: "珊瑚文字由紫色分叉收拢成单一青线",
    sound: "气泡穿过墨囊时发出可比较的长短节拍"
  },
  {
    setting: "雷暴农场升降城",
    actor: "避雷索调度员",
    problem: "漂浮田块在收割季被同一束闪电串成了危险闭环",
    deadline: "主风暴抵达谷口前",
    stakes: "闭环会把储粮塔变成整座城市的放电针",
    anchor: "分配田块高度的链式升降井",
    prop: "触电后会改变重量的云母秤砣",
    companion: "拒绝放弃最高田块的谷物管理员",
    visual: "电流沿避雷索显示为可预测的分叉路径",
    sound: "升降井链条以越来越短的间隔锁定"
  },
  {
    setting: "废弃观星学校",
    actor: "临时代课员",
    problem: "旧投影穹顶开始把学生的影子误认为新的星座",
    deadline: "年度导航考试开始前",
    stakes: "远航学员会用错误星图规划整年的补给航线",
    anchor: "能够分层旋转的黑玻璃穹顶",
    prop: "只在真实星光下留痕的粉笔",
    companion: "偷偷移动座位来修正投影的留校生",
    visual: "影子星座与真实光点以不同颜色分离",
    sound: "穹顶齿圈在层级对齐时响起一次清亮卡扣"
  },
  {
    setting: "会呼吸的纸城",
    actor: "街巷折叠师",
    problem: "城市每次吸气都会把医院折到市场背面",
    deadline: "下一轮长达一小时的深呼吸前",
    stakes: "等待转运的病患会被困在没有出口的纸层中",
    anchor: "控制街区折线的中央书脊塔",
    prop: "沾水后能暂时固定折痕的纤维针",
    companion: "用剪纸记录每次城市姿态的送餐员",
    visual: "街面折痕由虚线变成连续墨线",
    sound: "纸墙舒展声与书脊塔的木片拍击逐步同步"
  },
  {
    setting: "极昼鲸骨车站",
    actor: "影长检票员",
    problem: "永不落下的太阳让列车影子提前进入了错误站台",
    deadline: "载客冰帆车穿过白夜地平线前",
    stakes: "旅客会登上驶向融冰区的维修车",
    anchor: "由巨型肋骨构成的日影转辙架",
    prop: "能把影子延长一倍的烟晶票夹",
    companion: "根据影子而非车号认路的盲眼乘务员",
    visual: "肋骨投影在雪地上拼成完整站台编号",
    sound: "冰帆掠过不同骨架产生由远及近的低哨"
  }
];

const modeRules = [
  [/knowledge-gated/, "knowledge"],
  [/capability-recontextualizes/, "capability"],
  [/finite-schedule|reversible-reset/, "loop"],
  [/npc-schedule/, "social-schedule"],
  [/state-axis|parallel-state|dungeon-macro/, "state"],
  [/loop-shortcut|hub-spoke/, "return-route"],
  [/safe-rule|local-rule-development/, "lesson"],
  [/environmental-chain/, "chain"],
  [/multi-solution|object-role|copy-redeploy|systemic-verb/, "composition"],
  [/perspective-shift/, "perspective"],
  [/constrained-vehicle/, "vehicle"],
  [/player-authored-map/, "map-memory"],
  [/landmark|optional-secret|dense-overworld/, "exploration"],
  [/reward-expands|resource-expedition/, "expedition"],
  [/boss-rule|final-exam/, "synthesis"],
  [/threat-as-navigation/, "threat"],
  [/npc-reacts/, "npc-state"],
  [/companion-contextual/, "companion"],
  [/cooperative-role|asymmetric-screen/, "cooperation"],
  [/embodied-world|threshold-performance|agency-performance/, "performance"],
  [/action-first/, "onboarding"]
];

const effectConsequences = {
  "set-fact": (theme) => `完成后，一条可复核的判断被写入${theme.anchor}，人物与机关随后读取同一个结果。`,
  "clear-fact": (theme) => `完成后，先前误导${theme.companion}的判断被公开撤销，相关阻碍同步失效。`,
  "grant-item": (theme) => `成功会把${theme.prop}变成可反复操作的工具，而不是一次性的剧情凭证。`,
  "consume-item": (theme) => `每次尝试都会消耗一份${theme.prop}的效力，因此玩家能看清试探成本并主动撤回。`,
  "toggle-map-layer": (theme) => `操作会在两套可比较的空间读法间切换，${theme.anchor}始终作为方向锚点。`,
  "unlock-route": (theme) => `因果成立后，${theme.anchor}旁出现一条持续开放的折返通路，并立即缩短下一次行动。`,
  "lock-route": (theme) => `选择会关闭一条显眼通路，同时保留一条可验证的恢复路径，避免不可逆困局。`,
  "spawn-actor": (theme) => `结果让${theme.companion}进入可观察的位置，其行为直接展示新的行动条件。`,
  "despawn-actor": (theme) => `结果使一名阻挡者有理由离场，空出的空间而非文字提示承担推进反馈。`,
  "move-actor": (theme) => `玩家的动作改变${theme.companion}的站位，新的站位又反过来改变路线与对话。`,
  "set-npc-state": (theme) => `同一个可见变化同时改写${theme.companion}的策略、语气和可提供的帮助。`,
  "set-dialogue-gate": (theme) => `只有玩家亲自验证因果后，${theme.companion}才会补充下一层信息。`,
  "emit-performance-cue": (theme) => `系统用${theme.visual}和${theme.sound}短暂聚焦结果，随后立即返还控制。`,
  "set-checkpoint": (theme) => `关键理解被确认后，恢复点前移到${theme.anchor}，重试不再重复无关路段。`,
  "map-transition": (theme) => `跨区时保留${theme.anchor}的方位关系，让新的场所读法可以与旧记忆比较。`,
  "camera-transition": (theme) => `视角只在因果目标与结果无法同屏时短暂移动，并回到清楚的下一动作。`
};

const frames = {
  knowledge: [
    {
      sequence: (t) => `玩家初访时可自由接近${t.anchor}，但只能看到${t.prop}留下的三段不完整痕迹；在别处理解排列规则后，玩家不获得新工具，返回并用早已具备的观察、移动和交互动作重排痕迹。`,
      space: (t) => `${t.anchor}从一处看似封闭的终点变成可从侧面进入的交叉口，旧路线和新路线保持同一地标关系。`,
      narrative: (t) => `真相来自玩家重新解释早已存在的证据，也迫使${t.companion}承认此前的推断有误。`
    },
    {
      sequence: (t) => `玩家先记录${t.companion}在三次环境变化中的不同反应，再回到${t.anchor}，按照反应的先后选择原本一直可用的三个控制点；没有钥匙或能力升级，只有因果次序被理解。`,
      space: (t) => `三个控制点分布在同一环形区域，玩家早期就能抵达全部位置，后续进展仅改变其信息含义。`,
      narrative: (t) => `被忽略的行为成为行动说明，解决问题也修正了两人之间长期错误的责任归属。`
    }
  ],
  capability: [
    {
      sequence: (t) => `玩家初次绕行${t.anchor}并看见明确但暂时无法处理的界面；在一段与${t.companion}共同完成的事件后，${t.prop}获得新的物理用途，返回时同一界面可被改变。`,
      space: (t) => `新动作打开旧路径上两个短支路，并把较远区域折回初访入口，避免能力只服务一扇门。`,
      narrative: (t) => `成长由可操作关系证明，角色承诺通过改变旧空间而兑现。`
    },
    {
      sequence: (t) => `玩家先把${t.prop}当作测量物，之后学会让它短暂改变自身与环境的接触方式；回到${t.anchor}时，可在不破坏原有地标的前提下通过过去只能远看的表面。`,
      space: (t) => `一条熟悉走廊获得上下两种通行层，入口、出口和恢复点都能从原路线辨认。`,
      narrative: (t) => `新的身体经验改变了旧场所的意义，并为${t.companion}提供此前不可能的救援方案。`
    }
  ],
  loop: [
    {
      sequence: (t) => `玩家在有限时段内观察${t.companion}、试着介入并允许局部事件归零；记录、已确认的关系线索和一条快速路径保留，使下一轮可以更早改变关键节点。`,
      space: (t) => `${t.anchor}是每轮可预测的起点，三条支路按时段开放，任何错过的窗口都有下一轮恢复机会。`,
      narrative: (t) => `失败毁掉即时成果却保留理解，让反复尝试逐步揭开问题真正的责任链。`
    },
    {
      sequence: (t) => `玩家主动把场所恢复到清晨状态，只保留已验证的两条信息与一次长期承诺；第二轮利用人物行程的偏差，在不同地点先后制造两个相互支持的变化。`,
      space: (t) => `可重置事件、永久承诺、人物位置和捷径用不同界面层显示，重启前可预览哪些内容会消失。`,
      narrative: (t) => `重置不是惩罚，而是玩家承担代价后重新安排一段无法一次完成的社会行动。`
    }
  ],
  "social-schedule": [
    {
      sequence: (t) => `玩家跟踪${t.companion}在三处岗位的固定行程，发现一次提前离岗；在正确窗口交还${t.prop}后，偏差行为改为公开求助并暴露隐藏风险。`,
      space: (t) => `人物路线穿过公共大厅、狭窄工作间和${t.anchor}，每个停留点都能从环境动作判断当前时段。`,
      narrative: (t) => `日常行程本身成为证词，玩家通过行动而非审问理解人物压力。`
    },
    {
      sequence: (t) => `玩家先在${t.anchor}等待并记录一次完整轮班，再故意改变其中一个公共条件；${t.companion}随之绕行，绕行地点提供可以帮助或利用他的短暂窗口。`,
      space: (t) => `正常路线与偏离路线在同一小型区域交叉，玩家不必空等即可从可见标记预测下一站。`,
      narrative: (t) => `一条规律被打破时才显出关系秘密，介入方式决定这份秘密被保护还是公开。`
    }
  ],
  state: [
    {
      sequence: (t) => `玩家操纵${t.anchor}的一条连续刻度，让邻近地面、机械和人物同时进入三种可读状态；每次改变都会开启一条路并关闭另一条，玩家必须携带状态信息跨过多个区域。`,
      space: (t) => `三个相连房间共享一条状态轴，远端结果可从中央视线与返回环路重新确认。`,
      narrative: (t) => `空间不再是房间清单，而成为一台可推理的整体装置。`
    },
    {
      sequence: (t) => `玩家在两套对应布局之间往返，把${t.prop}留在一侧改变另一侧的支撑关系；成功依赖比较相同坐标的差异，而不是逐个试门。`,
      space: (t) => `${t.anchor}在两套布局中位置恒定，墙体、人物与危险的差异形成可以记忆的成对路线。`,
      narrative: (t) => `两种现实各自只提供半个答案，玩家的比较行为完成叙事上的证据拼接。`
    }
  ],
  "return-route": [
    {
      sequence: (t) => `玩家先完整走过一段危险长路，再从终点操作${t.prop}打开通往${t.anchor}的折返门；回程明确缩短，下一次出发可把省下的时间用于新支路。`,
      space: (t) => `开放前后的最短路径长度可被路线模拟直接比较，捷径两端都落在玩家已经理解的地标旁。`,
      narrative: (t) => `空间压缩把熟练与进展实体化，而不是用一句完成提示代替。`
    },
    {
      sequence: (t) => `玩家从${t.anchor}选择一条外出路线，解决局部危机后返回；${t.companion}据结果改变服务和建议，新的出发选择随之出现。`,
      space: (t) => `中央节点连接三个主题迥异的外区，每次返程都改变至少一个人物位置、一项服务和一条可选边。`,
      narrative: (t) => `外出行动通过返程影响共同生活，避免远征成果只表现为库存数字。`
    }
  ],
  lesson: [
    {
      sequence: (t) => `玩家先在无失败惩罚的隔间用${t.prop}改变一个清晰目标，随后经历独立练习、环境变式、与旧动作组合，最后在有压力但可快速重试的场景中证明理解。`,
      space: (t) => `五个相邻小区分别承担示范、练习、变式、组合和考试，回路允许玩家返回上一阶段复查。`,
      narrative: (t) => `能力成长由玩家操作过的因果组成，结尾不引入隐藏的新规则。`
    },
    {
      sequence: (t) => `玩家通过一次可撤销试验发现${t.anchor}与${t.prop}的关系，之后必须反向使用同一关系保护${t.companion}；最终挑战把方向、时机和对象选择同时纳入，但每种信号都曾单独出现。`,
      space: (t) => `早期目标与最终目标可互相看见，失败只重置当前组合，不撤销已经完成的教学步骤。`,
      narrative: (t) => `同一规则从工具意义发展为人物承诺，使考试同时检验理解与责任。`
    }
  ],
  chain: [
    {
      sequence: (t) => `玩家把${t.prop}置于${t.anchor}上游，触发热、压力与导电三步传播；每一步只影响邻接对象，有明确上限，玩家可在传播到危险对象前切断链条。`,
      space: (t) => `对象按可见邻接关系排列，传播方向、最大步数与回滚点始终显示在局部区域内。`,
      narrative: (t) => `危机的解决复用造成危机的同一套材料规律，因果责任清楚可追。`
    },
    {
      sequence: (t) => `玩家先让${t.prop}吸收环境性质，再将性质传给第二个对象，第二个对象改变第三处路线；若形成循环，系统在第三次传播前停住并标出冲突。`,
      space: (t) => `三组对象分处高台、低槽与人物工作区，镜头只在远端后果不可见时短暂提示。`,
      narrative: (t) => `一个小规则跨越物体、路线与人物选择，产生可预料却并非唯一的解决过程。`
    }
  ],
  composition: [
    {
      sequence: (t) => `玩家观察场景物件的承重、传导与遮挡作用，选择两个作用组合成临时方案；失败会清楚显示是哪一种作用不足，拆解后可以立即重组。`,
      space: (t) => `${t.anchor}周围至少存在三条合法解法，每条改变不同的对象关系而抵达同一目标。`,
      narrative: (t) => `普通物件因用途而重要，玩家的方案选择也决定${t.companion}如何评价风险。`
    },
    {
      sequence: (t) => `玩家把从一处观察到的有限功能登记后，在另一处以明确容量重新部署；同屏数量、位置和持续时间都有上限，替换旧部署比堆叠更多对象更有效。`,
      space: (t) => `解题区域允许垂直、水平与掩护三类构型，并保留一条不依赖复杂组合的恢复路线。`,
      narrative: (t) => `观察直接扩大行动语言，但新的用途来自当前故事对象而非复制既有场面。`
    }
  ],
  perspective: [
    {
      sequence: (t) => `玩家在${t.anchor}改变自身尺度，原本只是装饰的${t.prop}变成桥面，细缝变成入口；恢复原尺度后，同一物件又承担远距离定位作用。`,
      space: (t) => `两种尺度共享可识别锚点，碰撞范围、入口尺寸和返回方向都在转换前预览。`,
      narrative: (t) => `身体与场所的关系改变了何为证据，也让${t.companion}的困境获得新解释。`
    },
    {
      sequence: (t) => `玩家从地面层进入一条平面边界，在边界上横向移动并从另一侧退出；临时能量限制迫使玩家先观察出口，失败会回到安全锚点。`,
      space: (t) => `${t.anchor}同时存在于地面与边界读法中，镜头、朝向和控制语言在退出后保持连续。`,
      narrative: (t) => `看似阻挡的表面成为路线，使熟悉场所产生新的但可比较的空间意义。`
    }
  ],
  vehicle: [
    {
      sequence: (t) => `玩家先在图面规划经过${t.anchor}的行程，途中根据移动危险调整速度与分岔，并用一次现场动作保护乘客；到站评价同时考虑安全、时间和照料。`,
      space: (t) => `受限路网提供多个可预见交汇点，危险方向与可改道窗口在抵达前可读。`,
      narrative: (t) => `交通不只是加载间隔，而是持续体现角色职责的行动场。`
    },
    {
      sequence: (t) => `玩家驾驶可改变高度的载具，在三个层级之间运送${t.prop}；选择较短路线会增加风险，较长路线则消耗时限，途中可在安全站重新规划。`,
      space: (t) => `路线图与现场地标共享编号，新增边会持久改变后续可达站点而非只播放过场。`,
      narrative: (t) => `每次航行连接人物需求与空间增长，返程也会改变下一项委托。`
    }
  ],
  "map-memory": [
    {
      sequence: (t) => `玩家在早期地点把${t.prop}显示的符号手动记到地图，之后可移动、删改或给标记分类；后续谜题要求比较自己的假设，而不会把标记当成世界真相。`,
      space: (t) => `观察地点与使用地点隔着一条可自由探索的路线，地图标记容量有限且保存后可恢复。`,
      narrative: (t) => `记忆辅助保留推理责任，让错误笔记也成为可以修正的玩家经历。`
    },
    {
      sequence: (t) => `玩家从高处看见三个远方目标，自行画出一条候选路线；抵达途中可记录阻断、改线并保留原计划，最终以实际行走结果更新下一次判断。`,
      space: (t) => `${t.anchor}提供全局方位，但不自动揭示地面通路，标记只表达意图而不解锁路线。`,
      narrative: (t) => `选择去哪与如何抵达共同构成探索叙事，而不是追随预设箭头。`
    }
  ],
  exploration: [
    {
      sequence: (t) => `玩家从${t.anchor}看见一个无法立即解释的远景，将它作为自选目标；抵达后获得能改变未来旅行方式的回报，并从新视点看到下一处问题。`,
      space: (t) => `远景在接近过程中持续可见，沿途至少有两种路线与一个可撤回的支路。`,
      narrative: (t) => `远方承诺与到达后的新可能形成连续好奇链，而非一次性收藏。`
    },
    {
      sequence: (t) => `玩家先在安全路径旁看见一处轻微异常，通过可选试探进入隐藏区；奖励既改善角色能力，也永久增加一处便捷落点。`,
      space: (t) => `秘密入口有两级可读线索，失败不会消耗唯一物件，发现后与主路线形成回环。`,
      narrative: (t) => `细心观察获得可持续的未来便利，同时补充${t.companion}未公开的一段处境。`
    }
  ],
  expedition: [
    {
      sequence: (t) => `玩家带着可读的有限补给深入${t.anchor}下方，每到一个安全节点都可选择继续或主动返回；返程能把发现换成容量、捷径或新准备，再次进入时路线明显改变。`,
      space: (t) => `深度、剩余补给、最近安全区和撤退路径始终可见，失败不会抹除已打开的捷径。`,
      narrative: (t) => `勇气表现为承担可计算风险，而非接受不可逆损失。`
    },
    {
      sequence: (t) => `玩家先完成一个短支线获得${t.prop}，它既提供一次局部帮助，也在地图上建立长期返回点；是否继续远征取决于当前状态与下一安全区距离。`,
      space: (t) => `三个支线节点围绕${t.anchor}形成不同成本的回路，奖励逐步压缩未来旅行。`,
      narrative: (t) => `探索回报同时改变人物能力和世界连通性，使准备行为具有故事后果。`
    }
  ],
  synthesis: [
    {
      sequence: (t) => `最终对抗只重组玩家已经实践过的三种信号：${t.prop}的反应、${t.anchor}的空间规律和${t.companion}的协同行动；每个阶段改变组合，不增加隐藏规则。`,
      space: (t) => `场地把早期教学地点的可识别关系压缩进一个可快速重试的环形区域，失败保留此前路线进度。`,
      narrative: (t) => `结局用操作证明玩家理解了危机、场所与关系，而不是用更长的说明替代理解。`
    },
    {
      sequence: (t) => `玩家必须按新的顺序组合早先分开使用的移动、观察与环境动作；对手的预备动作明确提示所需关系，错误选择产生诊断反馈并回到本阶段开头。`,
      space: (t) => `${t.anchor}提供方向锚点，三个可利用区域分别对应已经练习过的规则，恢复路线始终开放。`,
      narrative: (t) => `终局把分散记忆汇成一次可推理行动，并让${t.companion}依据玩家此前的承诺参与收束。`
    }
  ],
  threat: [
    {
      sequence: (t) => `一种沿固定方向巡行的危险迫使玩家观察掩体、慢速区和交汇点；早期可安全绕开，后期玩家利用同一空间知识反过来引导危险打开路线。`,
      space: (t) => `威胁轨迹、脱离边界与三处安全区同时可见，任何追逐都能回到已知恢复点。`,
      narrative: (t) => `危险先担任空间教师，再成为玩家展示熟练度的对象。`
    },
    {
      sequence: (t) => `玩家从${t.companion}的躲避动作读出不可见风险的方向，在两次低代价尝试中确认规律；最终穿越时需选择一条利用${t.prop}改变风险节奏的路线。`,
      space: (t) => `狭窄区、开阔区与垂直掩体形成清楚对比，风险不会在镜头外无提示生成。`,
      narrative: (t) => `人物反应与导航信息共用一套表演，使恐惧既有情感意义也可操作。`
    }
  ],
  "npc-state": [
    {
      sequence: (t) => `玩家改变${t.anchor}的可见条件后，地图、${t.companion}的站位、可提供服务和对话目的读取同一个结果；切回旧条件时四者必须同步恢复。`,
      space: (t) => `人物所在区域与发生变化的环境保持可见因果关系，前后状态都有可达路线。`,
      narrative: (t) => `人物不再忽略世界变化，玩家也能从其具体行动感到后果被社会承认。`
    },
    {
      sequence: (t) => `玩家先帮助${t.companion}完成一项局部需求，再远程改变公共环境；返程时人物不只更换台词，还改用另一条路线并开放一项新的合作动作。`,
      space: (t) => `远端变化通过可追踪通路连接到人物工作区，返程沿途可提前看见行为差异。`,
      narrative: (t) => `社会回应和空间进展绑定同一事实，避免奖励只存在于菜单。`
    }
  ],
  companion: [
    {
      sequence: (t) => `玩家可在特定对象旁请求${t.companion}执行一项有边界的动作；关系状态决定动作的范围、拒绝理由和失败后的替代方案。`,
      space: (t) => `合作点分布在主路线与可选支路，缺少同伴时仍保留较慢但可行的通路。`,
      narrative: (t) => `关系进展改变玩家实际能做什么，而不是只增加同行台词。`
    },
    {
      sequence: (t) => `玩家为${t.companion}绘制一条短路线，并与自己的动作错开执行；两人各自控制一个必要条件，错误协调可以局部重置而不拆散整段同行。`,
      space: (t) => `两条行动路径在${t.anchor}交汇，站位、等待和完成条件都在同一画面内反馈。`,
      narrative: (t) => `分别承担风险使信任变成可见的协作结构，高潮后该能力仍可在普通探索中调用。`
    }
  ],
  cooperation: [
    {
      sequence: (t) => `两个角色分别控制移动与远端装置，只有交换清楚的短指令才能让${t.prop}穿过${t.anchor}；单人模式通过轮换控制保留相同角色关系。`,
      space: (t) => `平行支路先允许分头调查，再以必须同时满足的汇合点收束。`,
      narrative: (t) => `角色差异成为问题结构而非数值加成，沟通失误产生局部且可理解的后果。`
    },
    {
      sequence: (t) => `一名角色能看到隐藏路线，另一名角色能直接操作场景；前者只能使用有限符号传达方向，后者的动作会立刻改变双方共享的环境。`,
      space: (t) => `私有信息区与公共行动区通过同一状态连接，任何关键操作都能被另一方从后果确认。`,
      narrative: (t) => `不对称认知制造协商而非猜谜，单人替代方案会依次展示信息与执行。`
    }
  ],
  performance: [
    {
      sequence: (t) => `玩家跨过${t.anchor}时触发不超过数秒的构图、声响与人物站位变化，镜头明确指出改变对象；控制返还后，最近可执行动作在场景中自然突出。`,
      space: (t) => `阈值前有安全停留区，阈值后保留退路，跳过表演也会提交完全相同的环境结果。`,
      narrative: (t) => `重大变化由场所、人物和下一行动共同表达，而非只由文字宣布。`
    },
    {
      sequence: (t) => `玩家完成一段有目的的互动后观看短表演，再获得一个能准备下一段表演结果的自由窗口；三个节拍重复但每次行动目标不同。`,
      space: (t) => `互动区与表演焦点交替占据${t.anchor}周边，输入锁定有明确上限并可跳过、回看。`,
      narrative: (t) => `行动准备表演、表演改变问题、下一次行动验证改变，形成可呼吸的戏剧节奏。`
    }
  ],
  onboarding: [
    {
      sequence: (t) => `开场不给背景说明，玩家先完成一项安全且符合${t.actor}职责的动作：检查${t.prop}、移动到${t.anchor}并处理一个小故障；反馈同时说明身份、眼前目标和一条世界规律。`,
      space: (t) => `起点、目标和安全重试点在一个短回路内，完成后才开放可选背景信息。`,
      narrative: (t) => `玩家先通过责任理解自己是谁，再决定要了解多少历史。`
    },
    {
      sequence: (t) => `玩家在无工具状态下先向${t.companion}求助、辨认危险并取回${t.prop}，由此获得整场游戏的基础动作；失败只退回几步且不会重复对白。`,
      space: (t) => `可见庇护点与轻度危险并置，路线用后果引导而非箭头强迫。`,
      narrative: (t) => `一个角色定义明确的需求把移动、交谈和基础操作串成开场。`
    }
  ],
  fallback: [
    {
      sequence: (t) => `玩家观察${t.anchor}的变化，用${t.prop}执行一次可撤销操作，再根据${t.companion}的反应选择第二步；每一步都改变后续可行方案。`,
      space: (t) => `局部区域包含两条可恢复路线与一个始终可见的因果锚点。`,
      narrative: (t) => `行动、反馈和人物后果围绕同一问题闭合。`
    },
    {
      sequence: (t) => `玩家先试验两个独立动作，再把它们以新顺序组合；失败指出是哪条条件未满足，并允许只重做组合部分。`,
      space: (t) => `${t.anchor}连接练习区、变化区和验证区，路径不会因错误尝试永久关闭。`,
      narrative: (t) => `具体操作承担理解与推进，而不是由说明文字代替。`
    }
  ]
};

const feedbackTranslations = {
  visual: "清晰的前后画面对比",
  audio: "与因果完成同步的声音",
  animation: "对象和人物的动作变化",
  camera: "短暂且可跳过的构图提示",
  ui: "不依赖颜色的界面状态",
  dialogue: "读取同一结果的人物回应",
  navigation: "立即可验证的路线变化",
  haptics: "可关闭的触觉节拍"
};

const allowedTransformationAxes = new Set([
  "worldbuilding", "characters", "objects", "topology", "feedback", "narrative-causality",
  "timing", "visual-language", "audio-language", "control-language"
]);

function stableNumber(value) {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 12), 16);
}

function opaqueCaseId(patternId, variant) {
  const digest = createHash("sha256")
    .update(`storyteller-v03-originality-blind|${patternId}|${variant}`)
    .digest("hex")
    .slice(0, 20);
  return `blind.case.${digest}`;
}

function modeFor(patternId) {
  const slug = patternId.replace(/^pattern\./, "");
  return modeRules.find(([expression]) => expression.test(slug))?.[1] ?? "fallback";
}

function distinctThemeIndexes(patternId) {
  const first = stableNumber(`${patternId}|theme|0`) % themes.length;
  let second = stableNumber(`${patternId}|theme|1`) % themes.length;
  if (second === first) second = (second + 1 + stableNumber(patternId) % (themes.length - 1)) % themes.length;
  return [first, second];
}

function transformationAxes(pattern, variant) {
  const declared = Array.isArray(pattern.originality?.requiredTransformationAxes)
    ? pattern.originality.requiredTransformationAxes.filter((axis) => allowedTransformationAxes.has(axis))
    : [];
  const variantAxes = variant === 0
    ? ["worldbuilding", "characters", "topology", "feedback", "narrative-causality"]
    : ["objects", "timing", "visual-language", "audio-language", "control-language"];
  const candidates = [...new Set([...variantAxes, ...declared])];
  const offset = stableNumber(`${pattern.patternId}|axes|${variant}`) % candidates.length;
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  return rotated.slice(0, Math.min(6, Math.max(4, declared.length)));
}

function chosenEffect(pattern, variant) {
  const effects = [...new Set((pattern.effectPrimitives ?? []).map((effect) => effect.kind).filter((kind) => effectConsequences[kind]))].sort();
  if (!effects.length) return null;
  return effects[stableNumber(`${pattern.patternId}|effect|${variant}`) % effects.length];
}

function feedbackSummary(pattern, theme, variant) {
  const channels = [...new Set((pattern.effectPrimitives ?? []).flatMap((effect) => effect.observableFeedback ?? []))]
    .filter((channel) => feedbackTranslations[channel]);
  const selected = channels.slice(0, 3).map((channel) => feedbackTranslations[channel]);
  const channelText = selected.length ? selected.join("、") : "画面、声音与路线三种相互校验的结果";
  return variant === 0
    ? `${theme.visual}承担主要前后差异，${theme.sound}只在关键因果成立时出现；${channelText}共同确认结果，且任何必要信息都不只依赖颜色。`
    : `${theme.sound}先提示可行动窗口，随后由${theme.visual}和场景中的实际变化确认结果；使用${channelText}，跳过短提示也不会改变已提交的结果。`;
}

function applicationFor(pattern, variant, themeIndex) {
  const theme = themes[themeIndex];
  const mode = modeFor(pattern.patternId);
  const frame = (frames[mode] ?? frames.fallback)[variant];
  const effectKind = chosenEffect(pattern, variant);
  const consequence = effectKind
    ? effectConsequences[effectKind](theme)
    : `完成后，${theme.anchor}、人物行动和可达路线同时显示同一个可验证结果。`;
  const caseId = opaqueCaseId(pattern.patternId, variant);
  const storySummary = `${theme.actor}在${theme.setting}发现${theme.problem}。若不能在${theme.deadline}解决，${theme.stakes}。${frame.narrative(theme)}`;
  const gameplaySummary = `${frame.sequence(theme)}${consequence}`;
  const spatialSummary = `${frame.space(theme)}核心锚点是${theme.anchor}，关键操作对象是${theme.prop}。入口、结果区与失败后的恢复边均保持可读，玩家能在不依赖文字解说的情况下比较操作前后的路线关系。`;
  const feedback = feedbackSummary(pattern, theme, variant);
  return {
    output: {
      caseId,
      storySummary,
      gameplaySummary,
      spatialSummary,
      feedbackSummary: feedback,
      transformationAxes: transformationAxes(pattern, variant),
      structuralDelta: {
        topologyGraph: frame.space(theme),
        objectRoleGraph: `${theme.prop}从情境道具转为可验证因果的操作节点，${theme.anchor}从背景地标转为结果锚点。`,
        actionSequence: frame.sequence(theme),
        feedbackSignature: feedback,
        narrativeFunction: frame.narrative(theme)
      }
    },
    metadata: { caseId, patternId: pattern.patternId, variant, themeIndex, causalMode: `${mode}.${variant}` }
  };
}

function collectKeys(value, target = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, target);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      target.push(key);
      collectKeys(item, target);
    }
  }
  return target;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const forbiddenKeyFragments = ["pattern", "zelda", "work", "source", "provenance", "fingerprint", "pack"];
const forbiddenTitleTokens = [
  "zelda", "the legend of zelda", "zelda ii", "a link to the past", "link's awakening", "ocarina of time",
  "majora's mask", "oracle of ages", "oracle of seasons", "four swords", "the wind waker",
  "four swords adventures", "the minish cap", "twilight princess", "phantom hourglass", "spirit tracks",
  "skyward sword", "a link between worlds", "breath of the wild", "tears of the kingdom", "echoes of wisdom",
  "tri force heroes", "塞尔达", "海拉鲁", "林克", "众神的三角力量", "织梦岛", "时之笛", "姆吉拉的假面",
  "梅祖拉的假面", "时空之章", "大地之章", "四人之剑", "风之杖", "缩小帽", "黄昏公主", "幻影沙漏",
  "大地的汽笛", "天空之剑", "旷野之息", "王国之泪", "智慧的再现"
];

function validateBlindOutput(blindOutput, metadata, releasedPatterns) {
  assert(blindOutput.generatedAt === GENERATED_AT, "Blind output generatedAt is not frozen.");
  assert(blindOutput.cases.length === releasedPatterns.length * 2, "Blind output does not contain exactly two cases per released pattern.");

  const caseIds = blindOutput.cases.map((item) => item.caseId);
  assert(new Set(caseIds).size === caseIds.length, "Blind case IDs are not unique.");
  assert(caseIds.every((caseId) => /^blind\.case\.[0-9a-f]{20}$/.test(caseId)), "Blind case ID is not opaque.");
  assert(caseIds.every((caseId, index) => index === 0 || caseIds[index - 1].localeCompare(caseId) < 0), "Blind cases are not deterministically sorted.");

  const allowedCaseKeys = ["caseId", "feedbackSummary", "gameplaySummary", "spatialSummary", "storySummary", "structuralDelta", "transformationAxes"];
  const allowedDeltaKeys = ["actionSequence", "feedbackSignature", "narrativeFunction", "objectRoleGraph", "topologyGraph"];
  for (const item of blindOutput.cases) {
    assert(JSON.stringify(Object.keys(item).sort()) === JSON.stringify(allowedCaseKeys), `${item.caseId}: blind case has an unexpected field.`);
    assert(JSON.stringify(Object.keys(item.structuralDelta ?? {}).sort()) === JSON.stringify(allowedDeltaKeys), `${item.caseId}: structuralDelta is incomplete.`);
    for (const field of ["storySummary", "gameplaySummary", "spatialSummary", "feedbackSummary"]) assert(typeof item[field] === "string" && item[field].length >= 80, `${item.caseId}: ${field} is not specific enough.`);
    assert(Array.isArray(item.transformationAxes) && item.transformationAxes.length >= 4, `${item.caseId}: fewer than four transformation axes.`);
    assert(new Set(item.transformationAxes).size === item.transformationAxes.length, `${item.caseId}: duplicate transformation axis.`);
    assert(item.transformationAxes.every((axis) => allowedTransformationAxes.has(axis)), `${item.caseId}: unknown transformation axis.`);
  }

  const keys = collectKeys(blindOutput);
  for (const key of keys) {
    const lower = key.toLowerCase();
    const leak = forbiddenKeyFragments.find((fragment) => lower.includes(fragment));
    assert(!leak, `Blind output key leaks forbidden fragment "${leak}": ${key}.`);
  }

  const serialized = JSON.stringify(blindOutput).toLowerCase();
  const forbiddenTokens = [
    ...forbiddenTitleTokens,
    ...releasedPatterns.flatMap((pattern) => [pattern.patternId, pattern.patternId.replace(/^pattern\./, ""), pattern.name].filter(Boolean))
  ].map((token) => String(token).toLowerCase());
  for (const token of forbiddenTokens) assert(!serialized.includes(token), `Blind output leaks forbidden name or identifier: ${token}.`);
  assert(!/(?:^|[^a-z])(?:work|source|provenance|fingerprint|pack)(?:[^a-z]|$)/i.test(serialized), "Blind output leaks a forbidden research or gate term.");

  const byPattern = new Map();
  for (const record of metadata) {
    if (!byPattern.has(record.patternId)) byPattern.set(record.patternId, []);
    byPattern.get(record.patternId).push(record);
  }
  for (const pattern of releasedPatterns) {
    const records = byPattern.get(pattern.patternId) ?? [];
    assert(records.length === 2, `${pattern.patternId}: expected exactly two mapped blind cases.`);
    assert(records[0].themeIndex !== records[1].themeIndex, `${pattern.patternId}: blind cases reuse the same fictional theme.`);
    assert(records[0].causalMode !== records[1].causalMode, `${pattern.patternId}: blind cases reuse the same causal expression.`);
    const outputs = records.map((record) => blindOutput.cases.find((item) => item.caseId === record.caseId));
    assert(outputs[0].gameplaySummary !== outputs[1].gameplaySummary, `${pattern.patternId}: gameplay summaries are not distinct.`);
    assert(outputs[0].structuralDelta.actionSequence !== outputs[1].structuralDelta.actionSequence, `${pattern.patternId}: structural deltas are not distinct.`);
  }
}

function validateGateMap(gateMap, metadata, releasedPatterns) {
  const mappings = gateMap.mappings;
  assert(mappings.length === releasedPatterns.length * 2, "Gate map does not contain exactly two cases per released pattern.");
  assert(new Set(mappings.map((entry) => entry.caseId)).size === mappings.length, "Gate map case IDs are not unique.");
  assert(mappings.every((entry) => JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(["caseId", "patternId"])), "Gate mapping contains fields other than caseId and patternId.");
  const expected = metadata.map(({ caseId, patternId }) => ({ caseId, patternId })).sort((left, right) => left.caseId.localeCompare(right.caseId));
  assert(JSON.stringify(mappings) === JSON.stringify(expected), "Gate map and generated metadata do not close exactly.");
  for (const pattern of releasedPatterns) assert(mappings.filter((entry) => entry.patternId === pattern.patternId).length === 2, `${pattern.patternId}: gate map does not contain exactly two cases.`);
}

async function atomicWritePair(entries) {
  await mkdir(path.dirname(entries[0].target), { recursive: true });
  const staged = entries.map(({ target, content }) => ({
    target,
    content,
    temporary: path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`)
  }));
  try {
    for (const entry of staged) await writeFile(entry.temporary, entry.content, { encoding: "utf8", flag: "wx" });
    for (const entry of staged) await rename(entry.temporary, entry.target);
  } finally {
    await Promise.all(staged.map((entry) => rm(entry.temporary, { force: true }).catch(() => undefined)));
  }
}

let patternRegistry;
try {
  patternRegistry = JSON.parse(await readFile(patternPath, "utf8"));
} catch (error) {
  throw new Error(`Cannot read released pattern registry: ${error.message}`);
}
assert(Array.isArray(patternRegistry), "released-patterns.json must contain an array.");

const releasedPatterns = patternRegistry
  .filter((pattern) => pattern.status === "released" && pattern.autoSelectable === true)
  .sort((left, right) => left.patternId.localeCompare(right.patternId));
assert(releasedPatterns.length > 0, "No released and auto-selectable patterns are available.");
assert(new Set(releasedPatterns.map((pattern) => pattern.patternId)).size === releasedPatterns.length, "Released pattern IDs are not unique.");

const generated = [];
for (const pattern of releasedPatterns) {
  const themeIndexes = distinctThemeIndexes(pattern.patternId);
  generated.push(applicationFor(pattern, 0, themeIndexes[0]), applicationFor(pattern, 1, themeIndexes[1]));
}

const cases = generated.map((item) => item.output).sort((left, right) => left.caseId.localeCompare(right.caseId));
const metadata = generated.map((item) => item.metadata).sort((left, right) => left.caseId.localeCompare(right.caseId));
const blindOutput = {
  registryVersion: "1.0.0",
  generatedAt: GENERATED_AT,
  caseCount: cases.length,
  cases
};
const gateMap = {
  mapVersion: "1.0.0",
  generatedAt: GENERATED_AT,
  gateUseOnly: true,
  blindCasesRef: "benchmarks/originality-blind-applications.json",
  mappings: metadata.map(({ caseId, patternId }) => ({ caseId, patternId }))
};

validateBlindOutput(blindOutput, metadata, releasedPatterns);
validateGateMap(gateMap, metadata, releasedPatterns);

await atomicWritePair([
  { target: blindPath, content: `${JSON.stringify(blindOutput, null, 2)}\n` },
  { target: mapPath, content: `${JSON.stringify(gateMap, null, 2)}\n` }
]);

console.log(`Compiled ${cases.length} blind originality applications for ${releasedPatterns.length} released patterns.`);
console.log(path.relative(libraryRoot, blindPath).replaceAll("\\", "/"));
console.log(path.relative(libraryRoot, mapPath).replaceAll("\\", "/"));

const production = await fetch(new URL("../data/production.json", import.meta.url)).then((response) => {
  if (!response.ok) throw new Error(`production load failed: ${response.status}`);
  return response.json();
});

const $ = (selector) => document.querySelector(selector);
const els = {
  title: $("#title-screen"), game: $("#game-screen"), ending: $("#ending"), stage: $("#stage"),
  bg: $("#scene-bg"), room: $("#room-label"), hotspots: $("#hotspot-layer"), actors: $("#actor-layer"),
  player: $("#player"), prompt: $("#interaction-prompt"), promptText: $("#interaction-text"),
  chapter: $("#chapter-label"), objective: $("#objective-label"), inventory: $("#inventory"),
  layer: $("#layer-label"), door: $("#door-label"), dialogue: $("#dialogue"),
  portrait: $("#dialogue-portrait"), speaker: $("#dialogue-speaker"), intent: $("#dialogue-intent"),
  text: $("#dialogue-text"), modal: $("#modal"), modalContent: $("#modal-content"),
  tuning: $("#tuning"), tuningProgress: $("#tuning-progress"), tuningFeedback: $("#tuning-feedback")
};

const SAVE_KEY = production.runtime.saveKey;
const DOOR_ORDER = ["door_nursery", "door_music", "door_garden"];
const NOTE_ORDER = ["mid", "low", "high"];
const NOTE_LABELS = { low: "低", mid: "中", high: "高" };
const EVIDENCE_ORDER = ["letter", "album", "rubbing"];
const actorPositions = { grace: 0, anne: 20, nicholas: 40, mills: 60, charles: 80, victor: 100 };

function freshState() {
  return {
    schemaVersion: "0.2.0",
    room: "nursery",
    x: 22,
    startedAt: Date.now(),
    interactions: 0,
    doorStep: 0,
    inventory: [],
    placed: [],
    flags: {
      introDone: false,
      shutterClosed: false,
      ritualStarted: false,
      ritualComplete: false,
      letterFound: false,
      victorSeen: false,
      tuned: false,
      albumFound: false,
      daylight: false,
      gravesRead: false,
      seanceComplete: false
    }
  };
}

let state = freshState();
let activeHotspots = [];
let dialogueQueue = [];
let dialogueDone = null;
let tuningInput = [];
let audioEnabled = true;
let audioContext = null;

const lines = {
  prologue: [
    { a: "narrator", i: "身份引导", t: "泽西岛，1945。你叫格蕾丝。丈夫查尔斯从战争离开后，你独自守着这栋房子和两个孩子。" },
    { a: "grace", i: "给自己下命令", t: "安妮和尼古拉斯不能接触强光。每扇门都要先关上，才能打开下一扇——这是这座房子的秩序。" },
    { a: "anne", i: "试探母亲", t: "妈妈，窗边又亮起来了。尼古拉斯在发抖。" },
    { a: "nicholas", i: "寻求保护", t: "请把它关上。现在就关。" },
    { a: "narrator", i: "行动教学", t: "用 A / D 或方向键移动。走近发光的菱形，按 E 互动；也可以直接点击它。先去右侧关上百叶窗。" }
  ],
  shutter: [
    { a: "grace", i: "恢复控制", t: "好了。只剩烛光。你们是安全的。" },
    { a: "anne", i: "提出异常", t: "可昨晚还有另一个男孩站在窗边。他说这间房是他的。" },
    { a: "grace", i: "拒绝未知", t: "这栋房子里没有别的孩子。等我检查完所有门，我们再谈。" },
    { a: "narrator", i: "规则成为玩法", t: "门上的旧锁必须按房屋顺序确认：儿童房、音乐室、花园。离开儿童房，到中央走廊执行这条规则。" }
  ],
  ritualComplete: [
    { a: "mills", i: "确认规则", t: "儿童房、音乐室、花园。没有一扇门越过另一扇。您把次序记得很牢，夫人。" },
    { a: "grace", i: "追问", t: "你怎么会知道？你今天才到这里。" },
    { a: "mills", i: "留下疑点", t: "有些房子会教人如何照料它。那边的信槽，好像卡着什么。" }
  ],
  letter: [
    { a: "grace", i: "辨认证据", t: "这是我写给神父的信。我亲手封好，也亲手交给了邮差。" },
    { a: "mills", i: "谨慎纠正", t: "可邮票没有盖戳，信封也没有沾过雨。它从未离开过房子。" },
    { a: "grace", i: "保持目标", t: "那么外界为什么收不到我们的消息？我要回儿童房。安妮说她看见了一个男孩——光会迫使谎言显形。" }
  ],
  victor: [
    { a: "narrator", i: "世界状态改变", t: "百叶窗张开。光越过地板时，原本空着的位置浮出第三张床的轮廓。" },
    { a: "victor", i: "宣告占有", t: "这是我的房间。你们才是闯进来的人。" },
    { a: "anne", i: "证明自己", t: "就是他，维克多！他一直说，楼下还有他的爸爸妈妈和一个会听见我们的老女人。" },
    { a: "grace", i: "将恐惧变成调查", t: "如果你真的在这里，就再给我一个能验证的迹象。声音、脚印，什么都行。" },
    { a: "victor", i: "给出方法", t: "音乐室的琴。有些音，活人听不见；有些音，死人不愿意听。" }
  ],
  tuned: [
    { a: "narrator", i: "因果反馈", t: "第三个音落下，琴弦没有停止。墙纸后多出一条走廊，与你脚下的房间同时存在。" },
    { a: "anne", i: "重新命名世界", t: "妈妈，不是他们闯进了我们的房子。两栋房子一直叠在一起。" },
    { a: "grace", i: "寻找物证", t: "那本相册刚才不在那里。把它拿来；我需要能带走的证据。" }
  ],
  album: [
    { a: "grace", i: "辨认习俗", t: "每一页都是死者的肖像，穿着最好的衣服，眼睛合着。维克多说的世界，把死亡当作家庭记录。" },
    { a: "charles", i: "短暂归来", t: "格蕾丝。你为什么把整栋房子封在黑暗里？" },
    { a: "grace", i: "向丈夫求证", t: "查尔斯？战争结束了。告诉我这是真的，告诉我你回家了。" },
    { a: "charles", i: "无法留下", t: "我只是想回来看你们一次。有些人回到家，也不能留在家里。" },
    { a: "narrator", i: "永久地图变化", t: "他经过窗边，所有厚帘同时落下。晨光灌进走廊，却没有灼伤任何人。花园门第一次显露出来。" }
  ],
  graves: [
    { a: "grace", i: "读取姓名", t: "伯莎·米尔斯，埃德蒙·塔特尔，莉迪亚——三座墓碑，日期早在这场战争之前。" },
    { a: "mills", i: "承认身份", t: "我们曾经在这栋房子工作，也曾经得肺病死在这里。夫人，我们不是来伤害孩子的。" },
    { a: "grace", i: "逼近最后问题", t: "如果你们早已死去，那么我是什么？" },
    { a: "mills", i: "把决定交还玩家", t: "把信、相册和墓碑拓片放到降神桌上。答案必须由您亲手拼出来。" }
  ],
  placeLetter: [
    { a: "medium", i: "活人世界的声音", t: "桌上出现一封没有寄出的信。写信的女人仍以为自己能把消息送出这栋房子。" },
    { a: "grace", i: "承认裂缝", t: "我记得写信，却想不起那天之后发生了什么。" }
  ],
  placeAlbum: [
    { a: "medium", i: "触碰被压住的记忆", t: "我看见一间黑暗的儿童房，一只枕头，一位母亲不断说：安静，安静。" },
    { a: "nicholas", i: "说出身体记忆", t: "妈妈，我记得不能呼吸。不是光让我们生病。" }
  ],
  placeRubbing: [
    { a: "anne", i: "说出真相", t: "你用枕头捂住了我们。后来你拿起枪，对准了自己。等我们再醒来，门和窗都像以前一样。" },
    { a: "grace", i: "停止否认", t: "不……我记得了。那一天我失去了控制，然后把记忆锁在每一道门后。" },
    { a: "mills", i: "给出最后行动", t: "真相不会把你们赶走。去打开晨光里的窗；这一次，不要再把它关上。" }
  ],
  finale: [
    { a: "grace", i: "向孩子道歉", t: "安妮，尼古拉斯，我做过的事无法撤回。但我不再用黑暗假装它没有发生。" },
    { a: "anne", i: "重新建立关系", t: "我们知道，妈妈。我们还是在这里。" },
    { a: "nicholas", i: "跨过旧规则", t: "光不疼了。" },
    { a: "grace", i: "接受新的世界", t: "活人有活人的房子，我们有我们的。这就是我们的房子。" }
  ]
};

function character(id) {
  return production.characters[id] || production.characters.narrator;
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || data.schemaVersion !== "0.2.0") return false;
    state = data;
    return true;
  } catch { return false; }
}

function addEvidence(id) {
  if (!state.inventory.includes(id)) state.inventory.push(id);
}

function chapterAndObjective() {
  const f = state.flags;
  if (!f.shutterClosed && !f.victorSeen) return [1, "走到右侧百叶窗前，关上它，保护孩子。"];
  if (!f.ritualComplete) {
    const next = ["儿童房门", "音乐室门", "花园门"][state.doorStep] || "儿童房门";
    return [2, `在中央走廊按顺序确认门锁。下一扇：${next}。`];
  }
  if (!f.letterFound) return [2, "检查儿童房门旁的信槽。"];
  if (!f.victorSeen) return [3, "回到儿童房，主动打开百叶窗，让光验证安妮的话。"];
  if (!f.tuned) return [4, "进入音乐室，按“中 · 低 · 高”回应墙里的敲击。"];
  if (!f.albumFound) return [4, "重叠已经出现。拿走音乐室右侧的死者相册。"];
  if (!f.gravesRead) return [5, "穿过已显露的花园门，读取三座墓碑。"];
  if (state.placed.length < 3) {
    const next = production.evidence[EVIDENCE_ORDER[state.placed.length]].name;
    return [6, `进入楼梯后的降神室，把「${next}」放到桌上。`];
  }
  return [6, "走到降神室右侧的晨光窗前，不再把它关上。"];
}

function backgroundForRoom() {
  if (state.room === "nursery") {
    return production.assets[(state.flags.shutterClosed && !state.flags.daylight) ? "nurseryDark" : "nurseryLight"];
  }
  return production.assets[production.rooms[state.room].asset];
}

function currentHotspots() {
  const f = state.flags;
  if (state.room === "nursery") return [
    { id: "beds", x: 22, y: 58, label: "查看孩子们的床" },
    { id: "shutter", x: 74, y: 43, label: !f.shutterClosed ? "关上百叶窗" : (f.letterFound && !f.victorSeen ? "打开百叶窗" : "检查百叶窗"), done: f.victorSeen },
    { id: "exit_nursery", x: 94, y: 52, label: "前往中央走廊" }
  ];
  if (state.room === "hall") return [
    { id: "door_nursery", x: 8, y: 48, label: !f.ritualComplete ? "确认儿童房门锁" : "进入儿童房", done: f.ritualComplete },
    { id: "letter_slot", x: 24, y: 47, label: f.ritualComplete ? (f.letterFound ? "查看空信槽" : "取出卡住的信") : "信槽被门序锁住", done: f.letterFound },
    { id: "door_music", x: 67, y: 48, label: !f.ritualComplete ? "确认音乐室门锁" : (f.victorSeen ? "进入音乐室" : "音乐室仍无回应"), done: f.tuned },
    { id: "door_garden", x: 93, y: 48, label: !f.ritualComplete ? "确认花园门锁" : (f.daylight ? "前往雾园" : "花园门藏在厚帘后"), done: f.gravesRead },
    ...(f.gravesRead ? [{ id: "stairs_seance", x: 49, y: 34, label: "沿楼梯进入降神室", done: f.seanceComplete }] : [])
  ];
  if (state.room === "music") return [
    { id: "exit_music", x: 7, y: 48, label: "返回中央走廊" },
    { id: "piano", x: 68, y: 55, label: f.tuned ? "聆听仍在共振的琴" : "调谐钢琴", done: f.tuned },
    { id: "album", x: 92, y: 48, label: f.tuned ? (f.albumFound ? "查看空下来的书架" : "拿走死者相册") : "书架上只有影子", done: f.albumFound }
  ];
  if (state.room === "garden") return [
    { id: "exit_garden", x: 9, y: 49, label: "返回中央走廊" },
    { id: "graves", x: 63, y: 55, label: f.gravesRead ? "再次读取三座墓碑" : "擦净墓碑并制作拓片", done: f.gravesRead }
  ];
  return [
    { id: "exit_seance", x: 8, y: 50, label: "返回中央走廊" },
    { id: "slot_letter", x: 42, y: 55, label: state.placed.includes("letter") ? "信已放置" : "放置未寄出的信", done: state.placed.includes("letter") },
    { id: "slot_album", x: 53, y: 55, label: state.placed.includes("album") ? "相册已放置" : "放置死者相册", done: state.placed.includes("album") },
    { id: "slot_rubbing", x: 65, y: 55, label: state.placed.includes("rubbing") ? "拓片已放置" : "放置墓碑拓片", done: state.placed.includes("rubbing") },
    ...(state.placed.length === 3 ? [{ id: "final_window", x: 91, y: 35, label: "走进晨光" }] : [])
  ];
}

function npcList() {
  const f = state.flags;
  if (state.room === "nursery") {
    const list = [
      { id: "anne", x: 27 },
      { id: "nicholas", x: 38 }
    ];
    if (f.victorSeen) list.push({ id: "victor", x: 58, ghost: true });
    return list;
  }
  if (state.room === "hall" && !f.daylight) return [{ id: "mills", x: 54 }];
  if (state.room === "music" && f.tuned && !f.daylight) return [{ id: "anne", x: 28, ghost: true }];
  if (state.room === "seance" && state.placed.length) return [{ id: "mills", x: 76, ghost: true }];
  return [];
}

function render() {
  const [chapter, objective] = chapterAndObjective();
  els.bg.src = backgroundForRoom();
  els.bg.alt = `${production.rooms[state.room].name}舞台背景`;
  els.room.textContent = production.rooms[state.room].name;
  els.chapter.textContent = `第${"一二三四五六"[chapter - 1]}幕 · ${production.chapters[chapter - 1].title}`;
  els.objective.textContent = objective;
  els.layer.textContent = state.flags.daylight ? "晨光共存" : (state.flags.tuned ? "双层重叠" : (state.flags.shutterClosed ? "暗室" : "光层开启"));
  els.door.textContent = state.flags.ritualComplete ? "顺序已掌握" : `${state.doorStep} / 3`;
  els.stage.classList.toggle("overlap", state.flags.tuned && !state.flags.daylight);
  els.stage.classList.toggle("daylight", state.flags.daylight);
  els.player.style.left = `${state.x}%`;

  activeHotspots = currentHotspots();
  els.hotspots.innerHTML = "";
  activeHotspots.forEach((hotspot) => {
    const button = document.createElement("button");
    button.className = `hotspot${hotspot.done ? " done" : ""}`;
    button.style.left = `${hotspot.x}%`;
    button.style.top = `${hotspot.y}%`;
    button.dataset.id = hotspot.id;
    button.title = hotspot.label;
    button.setAttribute("aria-label", hotspot.label);
    button.addEventListener("click", () => {
      state.x = Math.max(4, Math.min(96, hotspot.x));
      renderPlayerAndPrompt();
      interact(hotspot.id);
    });
    els.hotspots.append(button);
  });

  els.actors.innerHTML = "";
  npcList().forEach((npc) => {
    const node = document.createElement("div");
    node.className = `npc${npc.ghost ? " ghost" : ""}`;
    node.style.left = `${npc.x}%`;
    node.innerHTML = `<div class="paper-actor actor-${npc.id}"></div><span class="actor-name">${character(npc.id).name}</span>`;
    els.actors.append(node);
  });

  els.inventory.innerHTML = EVIDENCE_ORDER.map((id) => {
    const owned = state.inventory.includes(id);
    const placed = state.placed.includes(id);
    return `<div class="item${owned ? "" : " empty"}">${placed ? "已放置 · " : ""}${production.evidence[id].name}</div>`;
  }).join("");
  renderPlayerAndPrompt();
  save();
}

function renderPlayerAndPrompt() {
  els.player.style.left = `${state.x}%`;
  const nearest = activeHotspots
    .map((spot) => ({ ...spot, distance: Math.abs(spot.x - state.x) }))
    .sort((a, b) => a.distance - b.distance)[0];
  document.querySelectorAll(".hotspot").forEach((node) => node.classList.toggle("near", node.dataset.id === nearest?.id && nearest.distance <= 13));
  if (nearest && nearest.distance <= 13) {
    els.prompt.hidden = false;
    els.promptText.textContent = nearest.label;
  } else {
    els.prompt.hidden = true;
  }
}

function move(delta) {
  if (isBlocked()) return;
  state.x = Math.max(4, Math.min(96, state.x + delta));
  renderPlayerAndPrompt();
}

function isBlocked() {
  return !els.dialogue.hidden || !els.modal.hidden || !els.tuning.hidden || !els.title.hidden || !els.ending.hidden;
}

function interactNearest() {
  const nearest = activeHotspots
    .map((spot) => ({ ...spot, distance: Math.abs(spot.x - state.x) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (nearest && nearest.distance <= 13) interact(nearest.id);
  else brief("没有可触及的东西。靠近发光菱形，再按 E。", "空间提示");
}

function enterRoom(room, x) {
  state.room = room;
  state.x = x;
  tone(160, .12);
  render();
}

function handleDoorRule(id) {
  const expected = DOOR_ORDER[state.doorStep];
  if (id === expected) {
    state.doorStep += 1;
    state.interactions += 1;
    tone(220 + state.doorStep * 70, .12);
    if (state.doorStep === DOOR_ORDER.length) {
      state.flags.ritualComplete = true;
      queueDialogue(lines.ritualComplete, render);
    } else {
      const nextName = ["音乐室门", "花园门"][state.doorStep - 1];
      brief(`锁舌落下。次序正确；下一扇是${nextName}。`, "门的规则");
    }
  } else {
    state.doorStep = 0;
    tone(90, .25, "sawtooth");
    brief("顺序断了，三道锁同时弹开。重新从儿童房门开始。", "门的规则");
  }
  render();
}

function interact(id) {
  if (!els.dialogue.hidden || !els.tuning.hidden || !els.modal.hidden) return;
  const f = state.flags;
  state.interactions += 1;
  tone(260, .06);

  if (id === "beds") {
    queueDialogue([
      { a: "nicholas", i: "确认处境", t: f.daylight ? "妈妈，晨光落在被子上，可我一点也不疼。" : "白天我们睡，夜里我们醒。妈妈说这样最安全。" },
      { a: "anne", i: "给出方向", t: f.victorSeen ? "维克多的床影还在。去音乐室听他留下的声音。" : "右边的窗。先处理光，妈妈才肯听我们说话。" }
    ]);
    return;
  }
  if (id === "shutter") {
    if (!f.shutterClosed) {
      f.shutterClosed = true;
      queueDialogue(lines.shutter, render);
    } else if (f.letterFound && !f.victorSeen) {
      f.shutterClosed = false;
      f.victorSeen = true;
      render();
      queueDialogue(lines.victor, render);
    } else {
      brief(f.daylight ? "帘子已经被取下。光落在孩子身上，却没有留下灼痕。" : "百叶窗闭得很紧，只有木缝里的冷气。", "观察");
    }
    return;
  }
  if (id === "exit_nursery") {
    if (!f.shutterClosed && !f.daylight && !f.victorSeen) return brief("孩子还暴露在光里。先关上右侧的百叶窗。", "格蕾丝的规则");
    f.ritualStarted = true;
    return enterRoom("hall", 12);
  }
  if (id.startsWith("door_") && !f.ritualComplete) return handleDoorRule(id);
  if (id === "door_nursery") return enterRoom("nursery", 89);
  if (id === "letter_slot") {
    if (!f.ritualComplete) return brief("三个门锁互相牵制。先完成门的顺序。", "受阻");
    if (f.letterFound) return brief("信槽已经空了。边缘没有雨水或邮戳的痕迹。", "物证");
    f.letterFound = true;
    addEvidence("letter");
    queueDialogue(lines.letter, render);
    return;
  }
  if (id === "door_music") {
    if (!f.victorSeen) return brief("门后没有任何声音。先回儿童房验证安妮所说的男孩。", "尚未开启");
    return enterRoom("music", 13);
  }
  if (id === "door_garden") {
    if (!f.daylight) return brief("厚重的黑帘遮住了门的轮廓。音乐室里仍有一条线索没有带走。", "尚未开启");
    return enterRoom("garden", 14);
  }
  if (id === "stairs_seance") return enterRoom("seance", 12);
  if (id === "exit_music") return enterRoom("hall", 66);
  if (id === "piano") {
    if (f.tuned) return brief("琴弦仍在自行共振。墙后的另一个房间与这里保持重叠。", "频率稳定");
    openTuning();
    return;
  }
  if (id === "album") {
    if (!f.tuned) return brief("书架上似乎有个盒状阴影，但你的目光无法把它固定下来。先让房间重合。", "叠层不足");
    if (f.albumFound) return brief("相册已在你的证据栏里。书架上留下一个较浅的矩形。", "物证");
    f.albumFound = true;
    addEvidence("album");
    queueDialogue(lines.album, () => {
      f.daylight = true;
      f.shutterClosed = false;
      render();
    });
    return;
  }
  if (id === "exit_garden") return enterRoom("hall", 90);
  if (id === "graves") {
    if (f.gravesRead) return brief("三个人的姓名仍在石头上。你已经不再能把他们当作普通佣人。", "墓碑");
    f.gravesRead = true;
    addEvidence("rubbing");
    queueDialogue(lines.graves, render);
    return;
  }
  if (id === "exit_seance") return enterRoom("hall", 49);
  if (id.startsWith("slot_")) {
    const evidence = id.replace("slot_", "");
    const required = EVIDENCE_ORDER[state.placed.length];
    if (state.placed.includes(evidence)) return brief("这件证据已经成为桌上图景的一部分。", "已放置");
    if (evidence !== required) return brief(`记忆需要顺序。先放置「${production.evidence[required].name}」。`, "证据次序");
    state.placed.push(evidence);
    const set = evidence === "letter" ? lines.placeLetter : evidence === "album" ? lines.placeAlbum : lines.placeRubbing;
    queueDialogue(set, render);
    return;
  }
  if (id === "final_window") {
    state.flags.seanceComplete = true;
    queueDialogue(lines.finale, showEnding);
  }
}

function queueDialogue(items, onDone) {
  dialogueQueue = [...items];
  dialogueDone = onDone || null;
  els.dialogue.hidden = false;
  showNextLine();
}

function showNextLine() {
  if (!dialogueQueue.length) {
    els.dialogue.hidden = true;
    const done = dialogueDone;
    dialogueDone = null;
    if (done) done();
    else render();
    return;
  }
  const line = dialogueQueue.shift();
  const info = character(line.a);
  els.portrait.className = `portrait ${info.portrait}`;
  els.speaker.textContent = info.name;
  els.intent.textContent = line.i || info.role;
  els.text.textContent = line.t;
  tone(line.a === "narrator" ? 160 : 210 + (actorPositions[line.a] || 0), .03);
}

function brief(text, intent = "提示") {
  queueDialogue([{ a: "narrator", i: intent, t: text }]);
}

function openTuning() {
  tuningInput = [];
  els.tuningProgress.textContent = "○ ○ ○";
  els.tuningFeedback.textContent = "先听，再回答。";
  els.tuning.hidden = false;
  ["mid", "low", "high"].forEach((note, index) => setTimeout(() => tone({ low: 180, mid: 260, high: 360 }[note], .22), 280 + index * 410));
}

function tune(note) {
  if (els.tuning.hidden) return;
  tone({ low: 180, mid: 260, high: 360 }[note], .24, "triangle");
  const expected = NOTE_ORDER[tuningInput.length];
  if (note !== expected) {
    tuningInput = [];
    els.tuningProgress.textContent = "○ ○ ○";
    els.tuningFeedback.textContent = "频率散开了。重新从中音开始。";
    return;
  }
  tuningInput.push(note);
  els.tuningProgress.textContent = NOTE_ORDER.map((_, index) => index < tuningInput.length ? "●" : "○").join(" ");
  els.tuningFeedback.textContent = tuningInput.map((n) => NOTE_LABELS[n]).join(" · ");
  if (tuningInput.length === NOTE_ORDER.length) {
    state.flags.tuned = true;
    setTimeout(() => {
      els.tuning.hidden = true;
      queueDialogue(lines.tuned, render);
    }, 450);
  }
}

function openModal(type) {
  let html = "";
  if (type === "help") {
    html = `<p class="eyebrow">如何演出</p><h2>你扮演格蕾丝</h2><div class="help-grid">
      <div><strong>A / D 或 ← / →</strong><p>在当前舞台横向移动。</p></div>
      <div><strong>E 或点击菱形</strong><p>与最近的门、道具或空间互动。</p></div>
      <div><strong>Space / Enter</strong><p>逐句推进对话；演出不会自动跳过。</p></div>
      <div><strong>M / J</strong><p>查看地图和已确认线索。</p></div>
    </div><p>顶部始终显示当前目标；底部三格保存能改变剧情认知的证据。</p>`;
  } else if (type === "map") {
    const unlocked = {
      nursery: true, hall: state.flags.shutterClosed, music: state.flags.victorSeen,
      garden: state.flags.daylight, seance: state.flags.gravesRead
    };
    html = `<p class="eyebrow">宅邸拓扑</p><h2>地图会随认知改变</h2><div class="map-grid">${Object.entries(production.rooms).map(([id, room]) =>
      `<div class="map-node ${state.room === id ? "current" : ""} ${unlocked[id] ? "" : "locked"}"><strong>${room.name}</strong><p>${unlocked[id] ? (state.room === id ? "你在这里" : "可到达") : "尚未显露"}</p></div>`
    ).join("")}</div><p>中央走廊是回返枢纽。光与证据会显露原本不存在的通路。</p>`;
  } else {
    const known = state.inventory.length ? state.inventory.map((id) =>
      `<div class="clue"><strong>${production.evidence[id].name}</strong><p>${production.evidence[id].meaning}</p></div>`
    ).join("") : `<div class="clue">尚未获得可以带走的证据。</div>`;
    html = `<p class="eyebrow">格蕾丝的线索簿</p><h2>已确认，而非已猜测</h2>${known}`;
  }
  els.modalContent.innerHTML = html;
  els.modal.hidden = false;
}

function closeModal() { els.modal.hidden = true; }

function showGame(isContinue = false) {
  els.title.hidden = true;
  els.ending.hidden = true;
  els.game.hidden = false;
  render();
  els.stage.focus();
  if (!isContinue && !state.flags.introDone) {
    queueDialogue(lines.prologue, () => {
      state.flags.introDone = true;
      render();
    });
  }
}

function newGame() {
  localStorage.removeItem(SAVE_KEY);
  state = freshState();
  showGame(false);
}

function showEnding() {
  state.flags.seanceComplete = true;
  save();
  els.game.hidden = true;
  els.ending.hidden = false;
  const minutes = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000));
  $("#ending-stats").textContent = `演出 ${minutes} 分钟 · ${state.interactions} 次互动 · 3 / 3 件证据归位`;
  localStorage.removeItem(SAVE_KEY);
}

function tone(frequency, duration = .08, type = "sine") {
  if (!audioEnabled) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { audioEnabled = false; }
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (!els.dialogue.hidden && (event.code === "Space" || event.key === "Enter" || event.key === "e")) {
    event.preventDefault(); showNextLine(); return;
  }
  if (!els.tuning.hidden && ["1", "2", "3"].includes(event.key)) {
    tune({ "1": "low", "2": "mid", "3": "high" }[event.key]); return;
  }
  if (key === "escape") { closeModal(); els.tuning.hidden = true; return; }
  if (isBlocked()) return;
  if (key === "a" || event.key === "ArrowLeft") move(-3.2);
  if (key === "d" || event.key === "ArrowRight") move(3.2);
  if (key === "e" || event.key === "Enter" || event.code === "Space") interactNearest();
  if (key === "m") openModal("map");
  if (key === "j") openModal("journal");
});

els.dialogue.addEventListener("click", showNextLine);
els.stage.addEventListener("click", (event) => {
  if (event.target !== els.stage && event.target !== els.bg) return;
  const box = els.stage.getBoundingClientRect();
  state.x = Math.max(4, Math.min(96, ((event.clientX - box.left) / box.width) * 100));
  renderPlayerAndPrompt();
});
$("#new-game").addEventListener("click", newGame);
$("#continue-game").addEventListener("click", () => { if (load()) showGame(true); });
$("#restart-game").addEventListener("click", newGame);
$("#title-help").addEventListener("click", () => openModal("help"));
$("#map-button").addEventListener("click", () => openModal("map"));
$("#journal-button").addEventListener("click", () => openModal("journal"));
$("#modal-close").addEventListener("click", closeModal);
els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
$("#sound-button").addEventListener("click", (event) => {
  audioEnabled = !audioEnabled;
  event.currentTarget.textContent = `声音：${audioEnabled ? "开" : "关"}`;
  if (audioEnabled) tone(260, .08);
});
document.querySelectorAll("[data-note]").forEach((button) => button.addEventListener("click", () => tune(button.dataset.note)));
$("#tuning-exit").addEventListener("click", () => { els.tuning.hidden = true; });

const canContinue = Boolean(localStorage.getItem(SAVE_KEY));
$("#continue-game").hidden = !canContinue;

window.__storytellerV02 = {
  getState: () => structuredClone(state),
  reset: newGame,
  act: interact,
  enter: enterRoom,
  production
};

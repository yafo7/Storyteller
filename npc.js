// ============================================
// npc.js — NPC 系统（竖桌布局，角色名显示）
// ============================================

class NPC {
  constructor(id, x, y, config = {}) {
    this.id = id;
    this.x = x; this.y = y;
    this.radius = config.radius || CONFIG.NPC_RADIUS;
    this.color = config.color || CONFIG.NPC_COLOR;
    this.name = config.name || id;
    this.role = config.role || '';
    this.dialogueName = config.dialogueName || config.role || config.name; // 对话中显示的名字
    this.dialogues = config.dialogues || NPC.defaultDialogue();
  }

  getLine(phase) {
    const lines = this.dialogues[phase];
    return (lines && lines.length) ? lines[Math.floor(Math.random()*lines.length)] : '...';
  }

  getOptions() {
    return this.dialogues.options || [
      { key:'1', label:'你是谁？' }, { key:'2', label:'这里发生了什么？' }, { key:'3', label:'再见' }
    ];
  }

  draw() {
    push();
    noStroke();
    fill(0,0,0,40); ellipse(this.x+2,this.y+4,this.radius*2.2,this.radius*1.6);
    fill(this.color); ellipse(this.x,this.y,this.radius*2);

    // 角色名（如：管家）
    fill(220,220,230);
    textAlign(CENTER,CENTER); textSize(11);
    text(this.name,this.x,this.y-this.radius-14);

    // 标签
    if (this.role) {
      fill(180,160,120); textSize(9);
      text(this.role,this.x,this.y-this.radius-26);
    }
    pop();
  }

  static defaultDialogue() {
    return {
      greeting:['你好。'], farewell:['再见。'],
      options:[{key:'1',label:'你是谁？'},{key:'2',label:'这里是什么地方？'},{key:'3',label:'再见'}],
    };
  }
}

// ==================== NPC 管理器 ====================

class NPCManager {
  constructor() { this.npcs = []; }

  spawnDefault(world) {
    this.npcs = [];
    const tx = CONFIG.MAP_WIDTH/2 - 80;  // 桌左
    const ty = 1250;
    const th = 600;
    const gap = (th - 3*28)/4;

    // 左侧 3 人（Anne, Nicholas, Charles）
    const leftDefs = [
      { id:'anne',     name:'通灵者', role:'长女',
        color:[180,130,160], dialogues:{
          greeting:['你也能看见他们，对吗？','有些秘密，只有我能看见。'],
          farewell:['有些事不该被遗忘。'],
          options:[{key:'1',label:'你看到了什么？'},{key:'2',label:'你弟弟呢？'},{key:'3',label:'……'}]}},
      { id:'nicholas', name:'沉默者', role:'幼子',
        color:[140,160,200], dialogues:{
          greeting:['……','你好。'],
          farewell:['再见。'],
          options:[{key:'1',label:'你还好吗？'},{key:'2',label:'你姐姐说的……'},{key:'3',label:'保重。'}]}},
      { id:'charles',  name:'战士', role:'父亲',
        color:[160,140,110], dialogues:{
          greeting:['我从战场上回来。','这里还是老样子。'],
          farewell:['我得走了。'],
          options:[{key:'1',label:'你经历了什么？'},{key:'2',label:'你想家吗？'},{key:'3',label:'一路平安。'}]}},
    ];
    for (let i=0;i<3;i++) {
      const d=leftDefs[i];
      const cx=tx-56, cy=ty+gap*(i+1)+28*i+14;
      this.npcs.push(new NPC(d.id,cx,cy,{name:d.name,role:d.role,color:d.color,dialogues:d.dialogues}));
    }

    // 右侧 3 人（Mills, Tuttle, Lydia）
    const rightDefs = [
      { id:'mills',    name:'管家', role:'知情者',
        color:[140,120,90], dialogues:{
          greeting:['请坐。晚宴马上开始。','我在这个宅邸服务了很多年。'],
          farewell:['你会明白的，迟早。'],
          options:[{key:'1',label:'你知道真相吗？'},{key:'2',label:'这宅邸有什么秘密？'},{key:'3',label:'告辞。'}]}},
      { id:'tuttle',   name:'园丁', role:'掘墓人',
        color:[120,140,120], dialogues:{
          greeting:['花园里的土很松。','雾从来不会散。'],
          farewell:['雾散了，但有些东西不会散。'],
          options:[{key:'1',label:'你找到了什么？'},{key:'2',label:'墓碑的事？'},{key:'3',label:'回头见。'}]}},
      { id:'lydia',    name:'见证者', role:'哑女仆',
        color:[200,180,200], dialogues:{
          greeting:['……','……'],
          farewell:['……'],
          options:[{key:'1',label:'你看见了什么？'},{key:'2',label:'为什么不能说话？'},{key:'3',label:'祝你安宁。'}]}},
    ];
    for (let i=0;i<3;i++) {
      const d=rightDefs[i];
      const cx=tx+160+68, cy=ty+gap*(i+1)+28*i+14;
      this.npcs.push(new NPC(d.id,cx,cy,{name:d.name,role:d.role,color:d.color,dialogues:d.dialogues}));
    }
  }

  spawnMarlishFamily() {
    const cx=CONFIG.MAP_WIDTH/2;
    const py=1950;
    this.npcs.push(new NPC('victor',cx-60,py,{name:'通灵之子',role:'活人',color:[100,180,200]}));
    this.npcs.push(new NPC('mrs_marlish',cx+60,py,{name:'恐惧的母亲',role:'活人',color:[200,140,140]}));
    this.npcs.push(new NPC('mr_marlish',cx,py+40,{name:'调查者',role:'活人',color:[160,150,130]}));
  }

  getNearestTo(x,y,maxD){let r=null,m=maxD;for(const n of this.npcs){const d=Math.sqrt((n.x-x)**2+(n.y-y)**2);if(d<m){m=d;r=n;}}return r;}
  get(id){return this.npcs.find(n=>n.id===id);}
  draw(){for(const n of this.npcs)n.draw();}
}

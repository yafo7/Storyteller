// ============================================
// world.js — 竖长桌会客厅
// ============================================

class World {
  constructor() { this.obstacles = []; }

  generate() {
    this.obstacles = [];

    // 外墙
    this._wall(0,0,CONFIG.MAP_WIDTH,12);
    this._wall(0,CONFIG.MAP_HEIGHT-12,CONFIG.MAP_WIDTH,12);
    this._wall(0,0,12,CONFIG.MAP_HEIGHT);
    this._wall(CONFIG.MAP_WIDTH-12,0,12,CONFIG.MAP_HEIGHT);

    // 房间围墙 1200x1300 居中
    const rx = (CONFIG.MAP_WIDTH-1200)/2;    // 900
    const ry = (CONFIG.MAP_HEIGHT-1300)/2;   // 850
    this._room(rx, ry, 1200, 1300);

    // 竖长桌 居中
    const tx = CONFIG.MAP_WIDTH/2 - 80;
    const ty = 1250;
    this.obstacles.push({ x: tx, y: ty, w: 160, h: 600, type: 'table' });

    // 6 把椅子 — 左右各 3
    const gap = (600 - 3*28) / 4;
    for (let i = 0; i < 3; i++) {
      const cy = ty + gap*(i+1) + 28*i + 14 - 14;
      this.obstacles.push({ x: tx - 40, y: cy, w: 28, h: 28, type: 'chair' });
      this.obstacles.push({ x: tx + 160 + 12, y: cy, w: 28, h: 28, type: 'chair' });
    }

    // 玩家椅子（桌子下方，留出过道）
    const playerChairX = CONFIG.MAP_WIDTH/2 - 16;
    const playerChairY = ty + 600 + 48;
    this.obstacles.push({ x: playerChairX, y: playerChairY, w: 32, h: 32, type: 'chair' });

    // 装饰
    this.obstacles.push({ x: rx+20, y: ry+20, w: 35, h: 80, type: 'fireplace' });
    this.obstacles.push({ x: rx+1145, y: ry+20, w: 35, h: 140, type: 'bookshelf' });
  }

  _wall(x,y,w,h)   { this.obstacles.push({x,y,w,h,type:'wall'}); }
  _room(x,y,w,h)    { this._wall(x,y,w,12); this._wall(x,y+h-12,w,12); this._wall(x,y,12,h); this._wall(x+w-12,y,12,h); }

  draw() {
    push();
    fill(25,23,35); noStroke(); rect(0,0,CONFIG.MAP_WIDTH,CONFIG.MAP_HEIGHT);
    const gs=80;
    for (let r=0;r<CONFIG.MAP_HEIGHT/gs;r++) for (let c=0;c<CONFIG.MAP_WIDTH/gs;c++)
      if((c+r)%2===1){fill(30,28,42);noStroke();rect(c*gs,r*gs,gs,gs);}
    const tbls=this.obstacles.filter(o=>o.type==='table');
    const oths=this.obstacles.filter(o=>o.type!=='table');
    for(const o of oths) this._draw(o);
    for(const o of tbls) this._draw(o);
    pop();
  }

  _draw(o) {
    const {x,y,w,h,type}=o; push(); noStroke();
    if(type==='wall')          {fill(65,60,82);rect(x,y,w,h);fill(85,78,105,120);rect(x,y,w,2);}
    else if(type==='table')    {fill(45,38,28);rect(x,y,w,h,4);fill(60,50,38);rect(x+6,y+6,w-12,h-8,2);}
    else if(type==='chair')    {fill(50,42,35);rect(x,y,w,h,3);}
    else if(type==='fireplace'){fill(55,40,30);rect(x,y,w,h,4);fill(220,100,40,80);rect(x+4,y+15,w-8,h-20);}
    else if(type==='bookshelf'){fill(60,45,30);rect(x,y,w,h,3);stroke(70,55,38);strokeWeight(1);for(let i=1;i<4;i++)line(x+2,y+i*28,x+w-2,y+i*28);noStroke();}
    else                       {fill(50,45,60);rect(x,y,w,h,3);fill(65,58,78);rect(x+3,y+3,w-6,h-6,2);}
    pop();
  }

  collidesWithAny(px,py,r) {
    for(const o of this.obstacles){
      const cx=Math.max(o.x,Math.min(px,o.x+o.w)),cy=Math.max(o.y,Math.min(py,o.y+o.h));
      if((px-cx)**2+(py-cy)**2<r**2)return true;
    }
    return false;
  }
}

const Maps = {
  parlor: {
    name:'会客厅', walls:[],
    spawn: { x: CONFIG.MAP_WIDTH/2, y: 1882 },
  }
};

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'assets');
fs.mkdirSync(out, { recursive: true });

const P = {
  ink: '#090c10', deep: '#111922', wall: '#1b2930', wall2: '#263b40', teal: '#385052',
  teal2: '#526567', ash: '#71807b', pale: '#d9cda9', light: '#f2dfaa', wood: '#5b4135',
  wood2: '#7b5540', copper: '#9b7048', amber: '#c48a45', gold: '#e4b55a', wine: '#432b35',
  violet: '#674051', ghost: '#765f72', blue: '#325059', blue2: '#47707a', mist: '#648c8f',
  leaf: '#263927', leaf2: '#405b36', moss: '#718253', transparent: '#00000000'
};

function rgba(hex) {
  if (hex.length === 9) return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),parseInt(hex.slice(7,9),16)];
  return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),255];
}
function surface(w,h,bg=P.transparent) {
  const data = new Uint8Array(w*h*4); const c=rgba(bg);
  for(let i=0;i<w*h;i++) data.set(c,i*4);
  return {w,h,data};
}
function px(s,x,y,c){ if(x<0||y<0||x>=s.w||y>=s.h)return; s.data.set(rgba(c), (y*s.w+x)*4); }
function rect(s,x,y,w,h,c){ for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) px(s,xx,yy,c); }
function line(s,x0,y0,x1,y1,c){ const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let e=dx+dy;while(true){px(s,x0,y0,c);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}} }
function tile(s,i,draw){ const ox=(i%8)*16,oy=Math.floor(i/8)*16; draw(ox,oy); }
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);}
function writePng(file,s){const rows=[];for(let y=0;y<s.h;y++){rows.push(Buffer.from([0]));rows.push(Buffer.from(s.data.slice(y*s.w*4,(y+1)*s.w*4)));}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(s.w,0);ihdr.writeUInt32BE(s.h,4);ihdr[8]=8;ihdr[9]=6;fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]));}

const tiles=surface(128,64,P.ink);
tile(tiles,0,(x,y)=>{rect(tiles,x,y,16,16,P.deep);for(let n=0;n<4;n++)line(tiles,x,y+n*4,x+15,y+n*4,P.wall);for(let n=0;n<4;n++)px(tiles,x+3+n*4,y+2+n%2*4,P.wall2);});
tile(tiles,1,(x,y)=>{rect(tiles,x,y,16,16,P.wall);rect(tiles,x,y+12,16,4,P.deep);for(let n=1;n<16;n+=4)line(tiles,x+n,y,x+n-1,y+11,P.wall2);});
tile(tiles,2,(x,y)=>{rect(tiles,x,y,16,16,P.wood);for(let n=0;n<16;n+=4)line(tiles,x,y+n,x+15,y+n,P.deep);for(let n=0;n<4;n++)px(tiles,x+3+n*4,y+2+n*4,P.wood2);});
tile(tiles,3,(x,y)=>{rect(tiles,x,y,16,16,P.blue);rect(tiles,x+2,y+2,12,12,P.teal);for(let n=3;n<13;n+=3){px(tiles,x+n,y+2,P.gold);px(tiles,x+n,y+13,P.gold);} });
tile(tiles,4,(x,y)=>{rect(tiles,x,y,16,16,P.leaf);for(let n=0;n<20;n++){const xx=(n*7)%16,yy=(n*11)%16;px(tiles,x+xx,y+yy,n%3?P.leaf2:P.moss);} });
tile(tiles,5,(x,y)=>{rect(tiles,x,y,16,16,P.teal2);for(let n=0;n<16;n+=3)px(tiles,x+n,y+(n*5)%16,P.mist);});
tile(tiles,6,(x,y)=>{rect(tiles,x,y,16,16,P.wall2);rect(tiles,x+3,y+2,10,14,P.wood);rect(tiles,x+5,y+4,6,10,P.deep);px(tiles,x+10,y+9,P.gold);});
tile(tiles,7,(x,y)=>{rect(tiles,x,y,16,16,P.wall2);rect(tiles,x+2,y+1,12,10,P.deep);for(let n=3;n<13;n+=3)line(tiles,x+n,y+2,x+n,y+9,P.pale);rect(tiles,x,y+11,16,5,P.wood);});
tile(tiles,8,(x,y)=>{rect(tiles,x,y,16,16,P.wood);rect(tiles,x+1,y+2,14,10,P.wood2);rect(tiles,x+3,y+4,10,6,P.pale);line(tiles,x+4,y+5,x+11,y+8,P.ash);});
tile(tiles,9,(x,y)=>{rect(tiles,x,y,16,16,P.deep);rect(tiles,x+1,y+6,14,7,P.wood2);for(let n=2;n<14;n+=2)rect(tiles,x+n,y+4,1,7,n%4?P.pale:P.ink);rect(tiles,x+2,y+13,12,2,P.wood);});
tile(tiles,10,(x,y)=>{rect(tiles,x,y,16,16,P.wood);rect(tiles,x+2,y+2,12,8,P.pale);rect(tiles,x+3,y+3,10,6,P.ash);rect(tiles,x+1,y+10,14,4,P.wood2);});
tile(tiles,11,(x,y)=>{rect(tiles,x,y,16,16,P.leaf);rect(tiles,x+3,y+4,10,9,P.ash);rect(tiles,x+4,y+5,8,7,P.wall2);line(tiles,x+5,y+7,x+10,y+7,P.pale);});
tile(tiles,12,(x,y)=>{rect(tiles,x,y,16,16,P.ink);rect(tiles,x+3,y+3,10,10,P.wine);rect(tiles,x+5,y+5,6,6,P.gold);px(tiles,x+8,y+8,P.light);});
tile(tiles,13,(x,y)=>{rect(tiles,x,y,16,16,P.transparent);for(let n=0;n<8;n++){px(tiles,x+(n*5)%16,y+(n*7)%16,n%2?P.ghost:P.violet);} });
tile(tiles,14,(x,y)=>{rect(tiles,x,y,16,16,P.transparent);for(let n=0;n<16;n++){const xx=(n*7)%16;rect(tiles,x+xx,y,1,16,n%2?P.gold:P.light);} });
tile(tiles,15,(x,y)=>{rect(tiles,x,y,16,16,P.deep);rect(tiles,x+2,y+2,12,12,P.wine);rect(tiles,x+4,y+4,8,8,P.copper);rect(tiles,x+6,y+6,4,4,P.ink);});
writePng(path.join(out,'tileset.png'),tiles);

const actors=surface(192,144);
const cast=[
  {hair:P.ink,body:P.ink,trim:P.pale,skin:P.copper},
  {hair:P.deep,body:P.blue2,trim:P.pale,skin:P.copper},
  {hair:P.wood,body:P.wall2,trim:P.pale,skin:P.copper},
  {hair:P.ash,body:P.deep,trim:P.pale,skin:P.copper},
  {hair:P.wood2,body:P.ghost,trim:P.pale,skin:P.copper},
  {hair:P.deep,body:P.wall,trim:P.gold,skin:P.copper}
];
function actorFrame(ox,oy,c,dir,frame){
  const bob=frame===1?1:0; const ghosty=c.body===P.ghost;
  rect(actors,ox+5,oy+2+bob,6,5,c.skin);rect(actors,ox+4,oy+1+bob,8,3,c.hair);px(actors,ox+4,oy+4+bob,c.hair);px(actors,ox+11,oy+4+bob,c.hair);
  if(dir===0){px(actors,ox+6,oy+5+bob,P.ink);px(actors,ox+9,oy+5+bob,P.ink);} else if(dir===1){px(actors,ox+10,oy+5+bob,P.ink);} else if(dir===3){px(actors,ox+5,oy+5+bob,P.ink);}
  rect(actors,ox+4,oy+8+bob,8,10,c.body);rect(actors,ox+6,oy+8+bob,4,2,c.trim);rect(actors,ox+2,oy+9+bob,2,7,c.body);rect(actors,ox+12,oy+9+bob,2,7,c.body);
  const step=frame===0?-1:frame===2?1:0;rect(actors,ox+5+step,oy+18,3,5,ghosty?P.violet:P.deep);rect(actors,ox+9-step,oy+18,3,5,ghosty?P.violet:P.deep);
  if(ghosty){px(actors,ox+3,oy+8,P.ghost);px(actors,ox+12,oy+7,P.ghost);}
}
for(let ci=0;ci<cast.length;ci++)for(let d=0;d<4;d++)for(let f=0;f<3;f++)actorFrame((d*3+f)*16,ci*24,cast[ci],d,f);
writePng(path.join(out,'actors.png'),actors);

const portraits=surface(256,64,P.deep);
for(let i=0;i<4;i++){const c=cast[i],x=i*64;rect(portraits,x+2,2,60,60,P.wall);rect(portraits,x+5,5,54,54,P.deep);rect(portraits,x+18,14,28,31,c.skin);rect(portraits,x+15,9,34,14,c.hair);rect(portraits,x+14,18,6,23,c.hair);rect(portraits,x+44,18,6,23,c.hair);rect(portraits,x+21,27,4,3,P.ink);rect(portraits,x+39,27,4,3,P.ink);line(portraits,x+27,39,x+37,39,P.wine);rect(portraits,x+12,47,40,13,c.body);rect(portraits,x+27,47,10,3,c.trim);}
writePng(path.join(out,'portraits.png'),portraits);

const icons=surface(128,16);
for(let i=0;i<8;i++){const x=i*16;rect(icons,x+1,1,14,14,P.deep);rect(icons,x+3,3,10,10,i%2?P.teal:P.wood);}
line(icons,4,8,11,8,P.light);line(icons,8,4,8,11,P.light);rect(icons,20,4,8,8,P.pale);line(icons,35,4,44,12,P.gold);line(icons,44,4,35,12,P.gold);rect(icons,52,3,8,10,P.pale);line(icons,54,6,58,6,P.ink);rect(icons,67,5,10,7,P.copper);rect(icons,83,3,7,10,P.ash);rect(icons,100,4,8,8,P.ghost);line(icons,115,11,124,4,P.gold);
writePng(path.join(out,'ui-icons.png'),icons);

console.log(JSON.stringify({status:'pass',assets:['tileset.png','actors.png','portraits.png','ui-icons.png'],palette:Object.keys(P).length-1},null,2));

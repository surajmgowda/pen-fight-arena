const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto"),WebSocket=require("ws");
const PORT=process.env.PORT||8080,ROOT=__dirname,COLORS=["#e63946","#2a9d8f","#f4a300","#4361ee","#ff70a6","#06d6a0"];
const rooms=new Map();

function code(){let c;do c=crypto.randomBytes(3).toString("hex").slice(0,6).toUpperCase();while(rooms.has(c));return c}
function send(ws,o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))}
function broadcast(r,o){r.players.forEach(p=>send(p.ws,o))}
function publicRoom(r){return{type:"roomState",room:r.code,phase:r.phase,total:r.total,ai:r.ai,aiMode:r.aiMode,players:r.players.map(p=>({id:p.id,name:p.name,color:p.color,ai:p.ai,penTypeId:p.penTypeId})),game:r.game}}
function makeGame(r){
 const n=r.players.length,cx=500,cy=350,rad=180;
 return{turn:0,phase:"input",players:r.players.map((p,i)=>{let a=i*2*Math.PI/n;return{id:p.id,name:p.name,color:p.color,ai:p.ai,penTypeId:p.penTypeId,x:cx+Math.cos(a)*rad,y:cy+Math.sin(a)*rad,vx:0,vy:0,angle:a+Math.PI,alive:true,out:false}})}
}
function addAI(r){
 const humans=r.players.filter(p=>!p.ai).length;
 let targetAI=0;
 if(r.aiMode==="exact") targetAI=r.ai;
 else if(r.aiMode==="fill") targetAI=Math.max(0,r.total-humans);
 // "none" deliberately adds zero AI.
 targetAI=Math.min(targetAI,r.total-1);
 while(r.players.filter(p=>p.ai).length<targetAI){
  const i=r.players.length;
  r.players.push({id:"ai-"+crypto.randomUUID(),ws:null,name:"Bot "+(r.players.filter(p=>p.ai).length+1),color:COLORS[i%6],ai:true,penTypeId:"ballpoint"});
 }
}
function removeAI(r){r.players=r.players.filter(p=>!p.ai)}
function aiTurn(r){
 const g=r.game;if(!g||g.phase!=="input")return;
 const p=g.players[g.turn];if(!p||!p.ai)return;
 const targets=g.players.filter(x=>x.alive&&x.id!==p.id);
 if(!targets.length)return;
 const t=targets[Math.floor(Math.random()*targets.length)];
 const dx=t.x-p.x,dy=t.y-p.y,d=Math.hypot(dx,dy)||1,power=.65+Math.random()*.3;
 const speed=(165+24*7)*power;p.vx=dx/d*speed;p.vy=dy/d*speed;g.phase="moving";
}

function step(r,dt){
 const g=r.game;if(!g||g.phase!=="moving")return;
 const sub=4,h=dt/sub;
 for(let k=0;k<sub;k++){
  for(const p of g.players)if(p.alive&&!p.out){
   const sp=Math.hypot(p.vx,p.vy);
   if(sp){const ns=Math.max(0,sp-55*h),q=ns/sp;p.vx*=q;p.vy*=q}
   p.x+=p.vx*h;p.y+=p.vy*h;p.angle+=0;
  }
  const a=g.players.filter(p=>p.alive&&!p.out);
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
   const A=a[i],B=a[j],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||.001,min=24;
   if(d>=min)continue;
   const nx=dx/d,ny=dy/d,o=(min-d)/2;
   A.x-=nx*o;A.y-=ny*o;B.x+=nx*o;B.y+=ny*o;
   const rvx=B.vx-A.vx,rvy=B.vy-A.vy,vn=rvx*nx+rvy*ny;if(vn>0)continue;
   const jimp=-(1.72)*vn/2;A.vx-=jimp*nx;A.vy-=jimp*ny;B.vx+=jimp*nx;B.vy+=jimp*ny;
   broadcast(r,{type:"collision",strength:Math.min(10,Math.abs(vn)/100)});
  }
  for(const p of a){
   if(p.x<60||p.x>940||p.y<60||p.y>640){p.alive=false;p.out=true;broadcast(r,{type:"fall",playerId:p.id})}
  }
 }
 if(g.players.filter(p=>p.alive).length<=1){g.phase="over";broadcast(r,{type:"gameOver",winner:g.players.find(p=>p.alive)?.name||null})}
 else if(g.players.every(p=>!p.alive||Math.hypot(p.vx,p.vy)<7)){
  for(const p of g.players){p.vx=0;p.vy=0}
  g.phase="input";g.turn=(g.turn+1)%g.players.length;
  while(!g.players[g.turn].alive)g.turn=(g.turn+1)%g.players.length;
  broadcast(r,{type:"turn",turn:g.turn});
 }
}
setInterval(()=>{for(const r of rooms.values())if(r.phase==="playing"){
 step(r,1/30);
 if(r.game?.phase==="input"&&r.game.players[r.game.turn]?.ai){aiTurn(r)}
 broadcast(r,{type:"snapshot",state:r.game})
}},1000/30);

const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon"};
const server=http.createServer((req,res)=>{
 let u=req.url.split("?")[0];if(u==="/")u="/pen_fight_arena_online_client.html";
 const f=path.join(ROOT,u);if(!f.startsWith(ROOT))return res.writeHead(403).end();
 fs.readFile(f,(e,d)=>{if(e)return res.writeHead(404).end("Not found");res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream","Cache-Control":"no-store"});res.end(d)})
});
const wss=new WebSocket.Server({server,path:"/ws"});
wss.on("connection",ws=>{
 ws.id=crypto.randomUUID();ws.room=null;send(ws,{type:"hello",playerId:ws.id});
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==="create"){
   const r={code:code(),host:ws.id,players:[],phase:"lobby",total:2,ai:0,aiMode:"none",game:null};rooms.set(r.code,r);
   r.players.push({id:ws.id,ws,name:"Player 1",color:COLORS[0],ai:false,penTypeId:"ballpoint"});ws.room=r.code;
   send(ws,{type:"roomCreated",room:r.code});broadcast(r,publicRoom(r));return;
  }
  if(m.type==="join"){
   const r=rooms.get(String(m.room||"").toUpperCase());if(!r)return send(ws,{type:"error",message:"Room not found"});
   if(r.phase!=="lobby")return send(ws,{type:"error",message:"Match already started"});
   if(r.players.filter(p=>!p.ai).length>=6)return send(ws,{type:"error",message:"Room full"});
   const used=new Set(r.players.map(p=>p.color)),color=COLORS.find(c=>!used.has(c))||COLORS[r.players.length%6];
   r.players.push({id:ws.id,ws,name:"Player "+(r.players.length+1),color,ai:false,penTypeId:"ballpoint"});ws.room=r.code;
   send(ws,{type:"joined",room:r.code});broadcast(r,publicRoom(r));return;
  }
  const r=rooms.get(ws.room);if(!r)return;
  if(m.type==="roomState")return broadcast(r,publicRoom(r));
  if(m.type==="name"){const p=r.players.find(p=>p.id===ws.id);if(p)p.name=String(m.name||"Player").slice(0,16);if(r.game){const q=r.game.players.find(x=>x.id===ws.id);if(q)q.name=p.name}broadcast(r,publicRoom(r));return}
  if(m.type==="setup"){
   if(r.host!==ws.id)return;
   r.total=Math.max(2,Math.min(6,+m.total||2));
   r.aiMode=["none","exact","fill"].includes(m.aiMode)?m.aiMode:"none";
   if(r.aiMode==="none") r.ai=0;
   else if(r.aiMode==="fill") r.ai=r.total-1;
   else r.ai=Math.max(0,Math.min(r.total-1,+m.ai||0));
   broadcast(r,publicRoom(r));return;
  }
  if(m.type==="start"){
   if(r.host!==ws.id)return;
   const humanConnected=r.players.filter(p=>!p.ai).length;

   // The owner explicitly decides whether AI is permitted.
   if(r.aiMode==="none"){
    r.ai=0;
    if(humanConnected!==r.total)
      return send(ws,{type:"error",message:`No AI selected. Exactly ${r.total} human players must join. ${humanConnected} connected.`});
   }else if(r.aiMode==="exact"){
    r.ai=Math.max(0,Math.min(r.total-1,r.ai));
    const requiredHumans=r.total-r.ai;
    if(humanConnected!==requiredHumans)
      return send(ws,{type:"error",message:`Exactly ${r.ai} AI selected. ${requiredHumans} human players are required; ${humanConnected} connected.`});
   }else if(r.aiMode==="fill"){
    r.ai=r.total-1;
    // In fill mode the number of connected humans can be 1..total.
    // AI fills only the remaining slots.
    if(humanConnected<1)
      return send(ws,{type:"error",message:"At least one human player is required."});
    r.ai=r.total-humanConnected;
   }

   removeAI(r);
   // Add AI only because the owner explicitly selected exact/fill mode.
   if(r.aiMode!=="none"){
    while(r.players.filter(p=>!p.ai).length+r.players.filter(p=>p.ai).length<r.total){
     const i=r.players.length;
     r.players.push({id:"ai-"+crypto.randomUUID(),ws:null,name:"Bot "+(r.players.filter(p=>p.ai).length+1),color:COLORS[i%6],ai:true,penTypeId:"ballpoint"});
    }
   }
   r.phase="playing";r.game=makeGame(r);
   broadcast(r,{type:"onlineStarted",game:r.game});broadcast(r,publicRoom(r));return;
  }
  if(m.type==="flick"){
   if(r.phase!=="playing"||!r.game)return;
   const p=r.game.players[r.game.turn];if(!p||p.id!==ws.id)return send(ws,{type:"error",message:"Not your turn"});
   const dx=Number(m.dx)||0,dy=Number(m.dy)||0,pow=Math.max(0,Math.min(1,Number(m.power)||0));
   const speed=(165+24*7)*pow;p.vx=dx*speed;p.vy=dy*speed;r.game.phase="moving";
   return;
  }
 });
 ws.on("close",()=>{
  const r=rooms.get(ws.room);if(!r)return;
  r.players=r.players.filter(p=>p.ws!==ws);
  if(!r.players.length)return rooms.delete(r.code);
  if(r.host===ws.id)r.host=r.players[0].id;
  if(r.phase==="playing"){
 const humans=r.players.filter(p=>!p.ai).length;
 const required=r.aiMode==="none"?r.total:(r.aiMode==="exact"?r.total-r.ai:Math.max(1,humans));
 if(r.aiMode!=="fill" && humans<required){r.phase="lobby";r.game=null;removeAI(r)}
}
  broadcast(r,publicRoom(r));
 });
});
server.listen(PORT,()=>console.log(`Pen Fight Arena Online: http://localhost:${PORT}`));

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { rooms,newRoom,publicRoom,validatePlayer } from './roomManager.js';
import { startRace,tickRace,raceSnapshot } from './raceManager.js';
import { sanitizeInput,EMPTY_INPUT,resetRacer } from '../shared/physics.js';
import { MAPS,RANDOM_MAP_ID } from '../shared/track.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function createGameServer({production=false}={}) {
  const app=express(),http=createServer(app),io=new Server(http,{maxHttpBufferSize:4096});
  app.get('/api/health',(_req,res)=>res.json({ok:true,rooms:rooms.size}));
  const identities=new Map();
  const broadcast=room=>io.to(room.code).emit('room',publicRoom(room));
  function removePlayer(room,id){
    room.players.delete(id);if(room.race)room.race.states=room.race.states.filter(p=>p.id!==id);
    if(!room.players.size){rooms.delete(room.code);return;}
    if(room.host===id)room.host=[...room.players.values()].find(p=>p.connected)?.id||room.players.keys().next().value;
    broadcast(room);
  }
  io.on('connection',socket=>{
    // Resume identities are server-issued capabilities, never accepted as arbitrary player IDs.
    const requested=socket.handshake.auth?.token;
    let identity=typeof requested==='string'?identities.get(requested):null;
    if(!identity){identity={id:randomUUID(),token:randomUUID(),room:null,expires:null,socketId:null};identities.set(identity.token,identity);}
    const oldSocket=identity.socketId&&io.sockets.sockets.get(identity.socketId);
    if(oldSocket)oldSocket.disconnect(true);
    identity.socketId=socket.id;identity.expires=null;
    socket.emit('identity',{id:identity.id,token:identity.token});
    let existing=rooms.get(identity.room);
    if(existing?.players.has(identity.id)){
      existing.players.get(identity.id).connected=true;socket.join(existing.code);broadcast(existing);
      if(existing.race)socket.emit('snapshot',raceSnapshot(existing));
    }
    const roomFor=()=>{const room=rooms.get(identity.room);if(!room||!room.players.has(identity.id))throw Error('Join a room first.');return room;};
    let actions=[];
    const action=(event,fn)=>socket.on(event,(data,ack)=>{
      if(typeof ack!=='function')return;
      const now=Date.now();actions=actions.filter(t=>now-t<2000);
      if(actions.length>20)return ack({error:'Please wait a moment before trying again.'});actions.push(now);
      try{ack({ok:true,...fn(data??{})});}catch(error){ack({error:error.message});}
    });
    action('create',data=>{
      if(rooms.has(identity.room))throw Error('Leave your current room first.');
      const player=validatePlayer(data,{players:new Map()});
      const room=newRoom(identity.id,data.mapId);room.players.set(identity.id,{...player,id:identity.id,ready:false,connected:true,input:{...EMPTY_INPUT},inputAt:0});
      identity.room=room.code;socket.join(room.code);broadcast(room);return {code:room.code};
    });
    action('join',data=>{
      if(rooms.has(identity.room))throw Error('Leave your current room first.');
      const room=rooms.get(String(data.code||'').trim().toUpperCase());
      if(!room)throw Error('Room not found. Check the five-character code.');
      if(room.state!=='lobby')throw Error('This race has already started.');
      if(room.players.size>=8)throw Error('This room is full (8 drivers).');
      const player=validatePlayer(data,room);
      room.players.set(identity.id,{...player,id:identity.id,ready:false,connected:true,input:{...EMPTY_INPUT},inputAt:0});
      identity.room=room.code;socket.join(room.code);broadcast(room);return {};
    });
    action('select',data=>{const room=roomFor();if(room.state!=='lobby')throw Error('Change cars in the lobby.');const p=room.players.get(identity.id);Object.assign(p,validatePlayer({...p,carId:data.carId},room,identity.id),{ready:false});broadcast(room);return {};});
    action('map',data=>{const room=roomFor();if(room.state!=='lobby')throw Error('Change maps in the lobby.');if(room.host!==identity.id)throw Error('Only the host can choose the map.');const mapId=String(data.mapId||'');if(mapId!==RANDOM_MAP_ID&&!MAPS.some(map=>map.id===mapId))throw Error('Choose a valid race map.');room.mapId=mapId;for(const p of room.players.values())p.ready=false;broadcast(room);return {};});
    action('ready',data=>{const room=roomFor();if(room.state!=='lobby')throw Error('The race has already started.');room.players.get(identity.id).ready=data.ready===true;broadcast(room);return {};});
    action('start',()=>{const room=roomFor();if(room.host!==identity.id)throw Error('Only the host can start the race.');startRace(room);broadcast(room);io.to(room.code).emit('snapshot',raceSnapshot(room));return {};});
    action('lobby',()=>{const room=roomFor();if(room.host!==identity.id)throw Error('The host can return everyone to the lobby.');if(room.state!=='results')throw Error('Wait for the race to finish.');room.state='lobby';room.race=null;for(const p of room.players.values())p.ready=false;broadcast(room);return {};});
    action('leave',()=>{const room=rooms.get(identity.room);if(room){socket.leave(room.code);removePlayer(room,identity.id);}identity.room=null;return {};});
    action('reset',()=>{const room=roomFor();const p=room.players.get(identity.id);if(room.state==='racing'&&Date.now()-(p.resetAt||0)>2000){const r=room.race.states.find(r=>r.id===identity.id);if(r)resetRacer(r);p.resetAt=Date.now();}return {};});
    socket.on('input',data=>{const room=rooms.get(identity.room);const p=room?.players.get(identity.id);if(p&&room.state==='racing'){p.input=sanitizeInput(data);p.inputAt=Date.now();}});
    socket.on('pingCheck',(_,ack)=>{if(typeof ack==='function')ack(Date.now());});
    socket.on('disconnect',()=>{
      if(identity.socketId!==socket.id)return;
      identity.expires=Date.now()+30000;identity.socketId=null;
      const room=rooms.get(identity.room),p=room?.players.get(identity.id);
      if(p){p.connected=false;p.ready=false;p.input={...EMPTY_INPUT};if(room.host===p.id)room.host=[...room.players.values()].find(x=>x.connected)?.id||p.id;broadcast(room);}
    });
  });
  let tick=0;
  const timer=setInterval(()=>{
    const now=Date.now();
    for(const room of rooms.values())if(room.state==='racing'){const ended=tickRace(room,now);if(tick%3===0||ended)io.to(room.code).emit('snapshot',raceSnapshot(room));}
    if(tick++%60===0)for(const [token,identity]of identities)if(identity.expires&&identity.expires<now){const room=rooms.get(identity.room);if(room)removePlayer(room,identity.id);identities.delete(token);}
  },1000/60);
  let vite;
  if(production){
    app.use(express.static(path.join(root,'dist'),{setHeaders:(res,file)=>{
      if(/[/\\]assets[/\\]/.test(file))res.setHeader('Cache-Control','public,max-age=31536000,immutable');
      else res.setHeader('Cache-Control','no-cache');
    }}));
    app.get('/{*path}',(_req,res)=>{res.setHeader('Cache-Control','no-cache');res.sendFile(path.join(root,'dist/index.html'));});
  }
  else {const {createServer:createViteServer}=await import('vite');vite=await createViteServer({configFile:path.join(root,'vite.config.js'),server:{middlewareMode:true,hmr:{server:http}}});app.use(vite.middlewares);}
  return {app,http,io,close:async()=>{clearInterval(timer);await vite?.close();await new Promise(resolve=>io.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
  const game=await createGameServer({production:process.argv.includes('--production')});
  const port=Number(process.env.PORT)||3000;
  game.http.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`TURBORUSH ONLINE is ready at http://localhost:${port}`));
}

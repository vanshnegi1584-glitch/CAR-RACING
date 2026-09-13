import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../server/server.js';
import { rooms } from '../server/roomManager.js';
import { tickRace,raceSnapshot } from '../server/raceManager.js';
import { pointAt,TRACK_LENGTH } from '../shared/track.js';
const waitEvent=(socket,event,predicate=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(event,listener);reject(Error('Timed out: '+event));},4000);const listener=data=>{if(predicate(data)){clearTimeout(timer);socket.off(event,listener);resolve(data);}};socket.on(event,listener);});
const action=(socket,event,data={})=>new Promise(resolve=>socket.emit(event,data,resolve));
test('real socket room lifecycle, authority, reconnection, results and replay',async t=>{
  rooms.clear();const game=await createGameServer({production:true});await new Promise(resolve=>game.http.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${game.http.address().port}`;
  const clients=[];t.after(async()=>{clients.forEach(s=>s.disconnect());await game.close();rooms.clear();});
  async function connect(token){const socket=io(url,{forceNew:true,transports:['websocket'],auth:{token},autoConnect:false});clients.push(socket);const identity=waitEvent(socket,'identity');socket.connect();return {socket,identity:await identity};}
  const a=await connect(),b=await connect();
  assert.match((await action(b.socket,'join',{name:'Beta',carId:'bmw',code:'XXXXX'})).error,/not found/);
  assert.match((await action(a.socket,'create',{name:'',carId:'supra'})).error,/name/);
  const created=await action(a.socket,'create',{name:'Alpha',carId:'supra'});assert.equal(created.code.length,5);const room=rooms.get(created.code);
  assert.match((await action(b.socket,'join',{name:'Alpha',carId:'bmw',code:created.code})).error,/already/);
  assert.equal((await action(b.socket,'join',{name:'Beta',carId:'bmw',code:created.code})).ok,true);
  assert.equal(room.players.size,2);
  assert.match((await action(b.socket,'start')).error,/host/);
  assert.match((await action(a.socket,'start')).error,/ready/);
  assert.equal((await action(b.socket,'select',{carId:'bugatti'})).ok,true);assert.equal(room.players.get(b.identity.id).carId,'bugatti');
  await action(a.socket,'ready',{ready:true});await action(b.socket,'ready',{ready:true});
  assert.equal((await action(a.socket,'start')).ok,true);assert.equal(room.state,'racing');assert.ok(room.race.startsAt>Date.now()+2500);
  assert.match((await action(b.socket,'select',{carId:'supra'})).error,/lobby/);
  room.race.startsAt=Date.now()-1000;room.race.lastTick=Date.now()-20;
  const state=room.race.states.find(r=>r.id===b.identity.id),x=state.x,z=state.z;
  const snap=waitEvent(a.socket,'snapshot',s=>s.players.some(r=>r.id===b.identity.id&&r.speed>1));
  b.socket.emit('input',{throttle:true,x:1e9,lap:999,finishTime:0});await snap;
  assert.ok(Math.hypot(state.x-x,state.z-z)>0);assert.ok(Math.hypot(state.x-x,state.z-z)<10);assert.equal(state.finishTime,null);assert.ok(state.lap<2);
  const lost=waitEvent(a.socket,'room',r=>r.players.some(p=>p.id===b.identity.id&&!p.connected));b.socket.disconnect();await lost;
  const resumed=await connect(b.identity.token);assert.equal(resumed.identity.id,b.identity.id);assert.equal(room.players.get(b.identity.id).connected,true);
  // Place server-side fixtures immediately before each driver's earned final checkpoint.
  // The clients never supply positions, checkpoint counts, or final rankings.
  for(const r of room.race.states){const p=pointAt(-.1);Object.assign(r,{x:p.x,z:p.z,yaw:p.yaw,vx:p.dx*10,vz:p.dz*10,speed:10,s:p.s,lastS:p.s,lap:3,passed:36,nextGate:0,lapStarted:.1});}
  room.race.lastTick=Date.now()-100;tickRace(room,Date.now());assert.equal(room.state,'results');assert.ok(raceSnapshot(room).players.every(r=>r.finishTime!==null));
  assert.match((await action(resumed.socket,'lobby')).error,/host/);
  assert.equal((await action(a.socket,'lobby')).ok,true);assert.equal(room.state,'lobby');assert.equal(room.race,null);assert.ok([...room.players.values()].every(p=>!p.ready));
  const transfer=waitEvent(resumed.socket,'room',r=>r.host===b.identity.id);a.socket.disconnect();await transfer;assert.equal(room.host,b.identity.id);
  assert.equal((await action(resumed.socket,'leave')).ok,true);
});

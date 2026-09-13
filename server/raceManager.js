import { createRacer,stepRace,ranking,EMPTY_INPUT } from '../shared/physics.js';
import { setActiveTrack } from '../shared/track.js';
export function startRace(room,now=Date.now()) {
  if(room.state!=='lobby')throw Error('Return to the lobby before starting a race.');
  const players=[...room.players.values()];
  if(players.length<2)throw Error('At least two drivers are needed. Try Quick Race for solo play.');
  if(!players.every(p=>p.ready&&p.connected))throw Error('All drivers must be connected and ready.');
  setActiveTrack(room.mapId);
  room.state='racing';room.race={startsAt:now+3000,lastTick:now,elapsed:0,finishDeadline:null,states:players.map((p,i)=>createRacer(p.id,p.name,p.carId,i))};
  for(const p of players)p.input={...EMPTY_INPUT};
}
export function tickRace(room,now=Date.now()) {
  const race=room.race;if(!race||room.state!=='racing')return false;
  setActiveTrack(room.mapId);
  race.elapsed=Math.max(0,(now-race.startsAt)/1000);
  if(now<race.startsAt)return false;
  const dt=Math.min(.1,(now-race.lastTick)/1000);race.lastTick=now;
  stepRace(race.states,r=>{
    const p=room.players.get(r.id);
    return p?.connected&&now-p.inputAt<500?p.input:EMPTY_INPUT;
  },dt,race.elapsed);
  if(race.states.some(r=>r.finishTime!==null)&&!race.finishDeadline)race.finishDeadline=now+90000;
  if(race.states.every(r=>r.finishTime!==null)||race.finishDeadline&&now>race.finishDeadline||race.elapsed>900){room.state='results';return true;}
  return false;
}
export function raceSnapshot(room) {
  return {startsAt:room.race.startsAt,serverNow:Date.now(),elapsed:room.race.elapsed,mapId:room.mapId,players:room.race.states,order:ranking(room.race.states).map(r=>r.id),state:room.state};
}

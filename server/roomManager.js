import { randomBytes } from 'node:crypto';
import { CARS } from '../shared/cars.js';
export const rooms=new Map();
export function publicRoom(room) {
  return {code:room.code,host:room.host,state:room.state,players:[...room.players.values()].map(({id,name,carId,ready,connected})=>({id,name,carId,ready,connected}))};
}
export function newRoom(id) {
  if(rooms.size>=100)throw Error('The server is busy. Please try again later.');
  let code;do{code=randomBytes(4).toString('hex').slice(0,5).toUpperCase();}while(rooms.has(code));
  const room={code,host:id,state:'lobby',players:new Map(),race:null};rooms.set(code,room);return room;
}
export function validatePlayer(data,room,exclude) {
  const name=typeof data?.name==='string'?data.name.trim().replace(/[<>\x00-\x1f]/g,'').slice(0,18):'';
  if(!name)throw Error('Enter a driver name first.');
  if([...room.players.values()].some(p=>p.id!==exclude&&p.name.toLowerCase()===name.toLowerCase()))throw Error('That driver name is already in this room.');
  if(!CARS.some(c=>c.id===data.carId))throw Error('Choose one of the three garage cars.');
  return {name,carId:data.carId};
}

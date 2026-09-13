import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACK_WIDTH, BARRIERS, edgePoint, nearestPoint } from '../shared/track.js';
import { carShape, barrierContact, confineToTrack, resolveBarrierCollisions, carContact } from '../shared/collisions.js';
import { createRacer, stepRace, EMPTY_INPUT } from '../shared/physics.js';

const clearOfWalls = r => {
  for (const wall of BARRIERS) {
    if (Math.hypot(r.x-wall.x,r.z-wall.z)>6) continue;
    assert.ok((barrierContact(r,wall)?.depth||0)<.002, `car overlaps wall at ${wall.s.toFixed(2)}m`);
  }
};
const atEdge = (p, side, carId='bmw', angle=.6) => ({
  ...createRacer('a','a',carId),x:p.x+p.dz*side*8.8,z:p.z-p.dx*side*8.8,
  yaw:p.yaw+angle,vx:p.dz*side*20,vz:-p.dx*side*20,
});

test('inside road edges and shoulders never fold backwards at tight bends', () => {
  for (const offset of [-12,-TRACK_WIDTH/2,TRACK_WIDTH/2,12]) {
    for (let i=0;i<TRACK.length;i++) {
      const p=TRACK[i],a=edgePoint(p,offset),b=edgePoint(TRACK[(i+1)%TRACK.length],offset);
      assert.ok((b.x-a.x)*p.dx+(b.z-a.z)*p.dz>0, `folded edge at ${p.s}m`);
    }
  }
});

test('visible wall segments join continuously without protruding into the road', () => {
  for (let side=0;side<2;side++) for(let i=0;i<TRACK.length;i++) {
    const wall=BARRIERS[side*TRACK.length+i],next=BARRIERS[side*TRACK.length+(i+1)%TRACK.length];
    assert.deepEqual(wall.b,next.a);
    for(const x of [-1,1])for(const z of [-1,1]) {
      const px=wall.x+x*wall.side.x*wall.halfWidth+z*wall.forward.x*wall.halfLength;
      const pz=wall.z+x*wall.side.z*wall.halfWidth+z*wall.forward.z*wall.halfLength;
      assert.ok(nearestPoint(px,pz).distance>TRACK_WIDTH/2-.08, `wall crosses asphalt at ${wall.s}m`);
    }
  }
});

test('the actual wall collider stops a bumper and preserves sliding velocity', () => {
  const wall=BARRIERS[20],r=createRacer('a','a','bmw');
  r.yaw=wall.yaw;
  const interior=nearestPoint(wall.x,wall.z);
  const sign=(interior.x-wall.x)*wall.side.x+(interior.z-wall.z)*wall.side.z>0?1:-1;
  const distance=wall.halfWidth+carShape(r).halfWidth-.15;
  Object.assign(r,{x:wall.x+sign*wall.side.x*distance,z:wall.z+sign*wall.side.z*distance,
    vx:-sign*wall.side.x*25+wall.forward.x*12,vz:-sign*wall.side.z*25+wall.forward.z*12});
  assert.ok(barrierContact(r,wall));
  resolveBarrierCollisions(r);
  clearOfWalls(r);
  assert.ok(r.collision>0);
  assert.ok(Math.abs(r.vx*wall.side.x+r.vz*wall.side.z)<.01);
  assert.ok(Math.abs(r.vx*wall.forward.x+r.vz*wall.forward.z-12)<.05);
});

test('every bend contains rotated bodywork for all three car sizes', () => {
  for (const carId of ['supra','bmw','bugatti']) for (let i=0;i<TRACK.length;i+=4) {
    for(const side of [-1,1])for(const angle of [-1.2,0,.6]) {
      const r=atEdge(TRACK[i],side,carId,angle);
      confineToTrack(r);clearOfWalls(r);
      assert.ok(Math.hypot(r.vx,r.vz)<=20.001,'a wall must not add energy');
    }
  }
});

test('high speed impacts at the screenshot bend cannot pass either guardrail', () => {
  const near=nearestPoint(6,-7),p=TRACK.reduce((a,b)=>Math.abs(a.s-near.s)<Math.abs(b.s-near.s)?a:b);
  for(const carId of ['supra','bmw','bugatti'])for(const side of [-1,1]) {
    const r=atEdge(p,side,carId,side*Math.PI/2);
    Object.assign(r,{x:p.x+p.dz*side*4,z:p.z-p.dx*side*4,vx:p.dz*side*120,vz:-p.dx*side*120,speed:120});
    stepRace([r],()=>({...EMPTY_INPUT,throttle:true,nitro:true}),.1,.1);
    clearOfWalls(r);
    assert.ok(nearestPoint(r.x,r.z).distance<8);
    assert.ok(r.collision>0);
  }
});

test('a four-car pileup at a curved wall stays solid on both sides', () => {
  const p=TRACK.reduce((a,b)=>Math.hypot(a.x-6,a.z+7)<Math.hypot(b.x-6,b.z+7)?a:b);
  for(const side of [-1,1]) {
    const cars=[0,1,2,3].map(i=>({...atEdge(p,side,'bmw',.3),id:String(i),
      x:p.x+p.dz*side*(4+i),z:p.z-p.dx*side*(4+i)}));
    stepRace(cars,()=>EMPTY_INPUT,.1,.1);
    for(const r of cars)clearOfWalls(r);
    for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)
      assert.ok((carContact(cars[i],cars[j])?.depth||0)<.01);
  }
});

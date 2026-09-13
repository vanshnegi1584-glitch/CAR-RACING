import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS } from '../shared/cars.js';
import { createRacer,stepRacer,botInput,resetRacer,updateProgress,ranking,sanitizeInput,EMPTY_INPUT } from '../shared/physics.js';
import { TRACK_LENGTH,TRACK_WIDTH,pointAt,nearestPoint } from '../shared/track.js';
test('three distinct car tunings and valid models',()=>{assert.equal(new Set(CARS.map(c=>c.id)).size,3);assert.equal(new Set(CARS.map(c=>c.speed)).size,3);assert.equal(new Set(CARS.map(c=>c.handling)).size,3);});
test('only boolean driving inputs are accepted; arbitrary positions and finish claims are ignored',()=>{assert.deepEqual(sanitizeInput({throttle:true,nitro:'true',left:1,x:99999,lap:99,finishTime:1}),{...EMPTY_INPUT,throttle:true});});
test('accelerate, steer, brake and reverse change the physical state',()=>{
  const r=createRacer('x','Test','supra');for(let i=0;i<120;i++)stepRacer(r,{throttle:true},1/60,i/60);assert.ok(r.speed>35);const before=r.yaw;for(let i=0;i<15;i++)stepRacer(r,{throttle:true,left:true},1/60,2+i/60);assert.ok(r.yaw>before);for(let i=0;i<180;i++)stepRacer(r,{brake:true},1/60,3+i/60);assert.ok(r.speed<0);
});
test('nitro consumes fuel and raises speed beyond the normal cap',()=>{
  const r=createRacer('x','Test','bugatti');const p=pointAt(35);Object.assign(r,{x:p.x,z:p.z,yaw:p.yaw,vx:p.dx*85,vz:p.dz*85,speed:85});
  for(let i=0;i<12;i++)stepRacer(r,{throttle:true,nitro:true},1/60,i/60);
  assert.ok(r.boosting);assert.ok(r.nitro<90);assert.ok(r.speed>91);
});
test('barriers contain the racer and resetting never awards a checkpoint',()=>{
  const r=createRacer('x','Test','supra');for(let i=0;i<900;i++)stepRacer(r,{throttle:true,left:true},1/60,i/60);assert.ok(nearestPoint(r.x,r.z).distance<=TRACK_WIDTH/2-1.2);const passed=r.passed;resetRacer(r);assert.equal(r.passed,passed);assert.equal(r.speed,0);assert.ok(nearestPoint(r.x,r.z).distance<.1);
});
test('skipping or crossing the start backwards cannot award laps',()=>{
  const r=createRacer('x','Test','supra');r.lastS=2;r.s=TRACK_LENGTH-2;updateProgress(r,1);assert.equal(r.lap,0);r.lastS=TRACK_LENGTH/2;r.s=0;updateProgress(r,2);assert.equal(r.passed,0);
});
for(const car of CARS)test(`${car.brand} ${car.name} completes all ordered checkpoints and three laps`,()=>{
  const r=createRacer('x','Test',car.id);let t=0;while(t<180&&r.finishTime===null){stepRacer(r,botInput(r,1),1/60,t);t+=1/60;}
  assert.equal(r.passed,37);assert.equal(r.lap,4);assert.ok(r.finishTime>50&&r.finishTime<180);assert.ok(r.bestLap>15);assert.equal(r.boosting,false);
});
test('finished racers rank ahead of unfinished cars using server finish times',()=>{
  const a=createRacer('a','A','supra'),b=createRacer('b','B','bmw'),c=createRacer('c','C','bugatti');a.finishTime=100;b.finishTime=99;c.passed=999;assert.deepEqual(ranking([a,c,b]).map(r=>r.id),['b','a','c']);
});

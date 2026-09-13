import { getCar } from './cars.js';
import { TRACK_LENGTH,TRACK_WIDTH,GATES,LAPS,pointAt,nearestPoint,angleDiff } from './track.js';
import { confineToTrack, resolveCarCollisions } from './collisions.js';
export const EMPTY_INPUT = Object.freeze({throttle:false,brake:false,left:false,right:false,nitro:false,drift:false});
export function sanitizeInput(input) {
  const clean={};for(const key of Object.keys(EMPTY_INPUT))clean[key]=input?.[key]===true;return clean;
}
export function createRacer(id,name,carId,index=0) {
  const p=pointAt(-9-Math.floor(index/2)*7),lane=index%2?3:-3;
  return {id,name,carId,x:p.x+p.dz*lane,z:p.z-p.dx*lane,yaw:p.yaw,vx:0,vz:0,speed:0,nitro:getCar(carId).nitro,nitroUsed:0,boosting:false,drifting:false,driftAmount:0,yawRate:0,wheelSteer:0,collision:0,lap:0,nextGate:0,passed:0,s:p.s,lastS:p.s,finishTime:null,bestLap:null,lapStarted:0,checkpointTime:0,steer:0};
}
export function resetRacer(racer) {
  // Reset behind the next gate, never ahead of unearned checkpoints.
  const p=pointAt((racer.nextGate-1)*TRACK_LENGTH/GATES+8);
  if(racer.passed===0)Object.assign(p,pointAt(-9));
  Object.assign(racer,{x:p.x,z:p.z,yaw:p.yaw,vx:0,vz:0,speed:0,s:p.s,lastS:p.s,boosting:false,steer:0,yawRate:0,wheelSteer:0,drifting:false,driftAmount:0});
}
// Vehicle dynamics are independent of the circuit so steering can be tested on open ground.
export function stepDriving(r,input,dt) {
  if(r.finishTime!==null||!Number.isFinite(dt)||dt<=0)return;
  dt=Math.min(dt,1/30);
  const car=getCar(r.carId);
  const requested=(input.left?1:0)-(input.right?1:0);
  // Release and countersteer promptly; entering a turn builds up more gently.
  const steeringResponse=requested===0||requested*r.steer<0?14:8;
  r.steer+=(requested-r.steer)*(1-Math.exp(-dt*steeringResponse));
  const forwardX=Math.sin(r.yaw),forwardZ=Math.cos(r.yaw);
  let forward=r.vx*forwardX+r.vz*forwardZ;
  const lateral=r.vx*forwardZ-r.vz*forwardX;
  r.boosting=input.nitro&&input.throttle&&r.nitro>0&&forward>8;
  r.drifting=!!input.drift&&forward>12&&Math.abs(r.steer)>.15;
  r.driftAmount??=0;
  r.driftAmount+=((r.drifting?1:0)-r.driftAmount)*(1-Math.exp(-dt*(r.drifting?6:4)));
  if(r.boosting){const used=Math.min(r.nitro,dt*27);r.nitro-=used;r.nitroUsed+=used;}
  else r.nitro=Math.min(car.nitro,r.nitro+dt*(r.drifting?14:4));
  if(input.throttle)forward+=car.acceleration*(r.boosting?1.8:1)*dt;
  else if(!input.brake)forward*=Math.exp(-dt*.34);
  if(input.brake)forward-=dt*(forward>0?43:13);
  forward=Math.max(-15,Math.min(car.speed*(r.boosting?1.35:1),forward));
  const speed=Math.abs(forward);
  let turnRate=r.steer*car.handling*Math.min(speed/16,1)/(1+(speed/48)**1.4);
  turnRate*=Math.sign(forward)*(1+r.driftAmount*.08);
  // Stabilize excessive oversteer while preserving the driver's ability to countersteer.
  if(forward>8){
    const slip=angleDiff(r.yaw,Math.atan2(r.vx,r.vz));
    if(turnRate*slip>0)turnRate*=Math.max(0,Math.min(1,(.55-Math.abs(slip))/.15));
  }
  r.yawRate??=0;
  r.yawRate+=(turnRate-r.yawRate)*(1-Math.exp(-dt*12));
  if(speed<.15)r.yawRate=0;
  r.wheelSteer=r.steer*.46/(1+speed/50);

  // Reconstruct in the OLD body frame first. Then rotate the body and re-project BOTH
  // components together. Mixing an old forward component with a new sideways component
  // used to inject energy during drifts and could push the car into an uncontrolled slide.
  const vx=forwardX*forward+forwardZ*lateral;
  const vz=forwardZ*forward-forwardX*lateral;
  r.yaw+=r.yawRate*dt;
  const fx=Math.sin(r.yaw),fz=Math.cos(r.yaw);
  const newForward=vx*fx+vz*fz;
  const grip=car.grip*1.8*(1-r.driftAmount)+2.8*r.driftAmount;
  const newLateral=(vx*fz-vz*fx)*Math.exp(-dt*grip);
  r.vx=fx*newForward+fz*newLateral;r.vz=fz*newForward-fx*newLateral;
  const cap=car.speed*(r.boosting?1.35:1);
  const magnitude=Math.hypot(r.vx,r.vz);
  if(magnitude>cap){r.vx*=cap/magnitude;r.vz*=cap/magnitude;}
  r.x+=r.vx*dt;r.z+=r.vz*dt;
  r.speed=Math.hypot(r.vx,r.vz)*(newForward<0?-1:1);
}
export function stepRacer(r,input,dt,elapsed,progress=true) {
  if(r.finishTime!==null||!Number.isFinite(dt)||dt<=0)return;
  dt=Math.min(dt,1/30);const car=getCar(r.carId);
  stepDriving(r,input,dt);
  r.collision=Math.max(0,r.collision-dt*3);
  const near=confineToTrack(r);
  // Pickups are evaluated inside the shared simulation, including on the server.
  r.pickups??={};
  if(near.distance<2.1)for(let i=0;i<16;i++){
    const at=(40+i*TRACK_LENGTH/16)%TRACK_LENGTH;
    const delta=Math.abs(((r.s-at+TRACK_LENGTH*1.5)%TRACK_LENGTH)-TRACK_LENGTH/2);
    if(delta<2.5&&elapsed-(r.pickups[i]??-100)>10){r.nitro=Math.min(car.nitro,r.nitro+22);r.pickups[i]=elapsed;}
  }
  if(progress)updateProgress(r,elapsed);
}
// Run all cars together, with short substeps so even head-on nitro impacts cannot
// jump through another car between network ticks. Progress is awarded after contact resolution.
export function stepRace(racers, inputFor, dt, elapsed, { progress = true, substeps = 120, collisionIterations = 40 } = {}) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1);
  const steps = Math.max(1,Math.ceil(dt * substeps)), subDt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const time = elapsed - dt + (i + 1) * subDt;
    for (const r of racers) {
      if (r.finishTime === null) stepRacer(r, inputFor(r), subDt, time, false);
      else {
        // Finished cars remain solid and can be pushed; they brake to a stop naturally.
        r.vx *= Math.exp(-subDt * 5); r.vz *= Math.exp(-subDt * 5);
        r.x += r.vx * subDt; r.z += r.vz * subDt;
      }
    }
    resolveCarCollisions(racers,{iterations:collisionIterations});
    if (progress) for (const r of racers) if (r.finishTime === null) updateProgress(r, time);
  }
}
export function updateProgress(r,elapsed) {
  let delta=r.s-r.lastS;
  if(delta<-TRACK_LENGTH/2)delta+=TRACK_LENGTH;
  if(delta>TRACK_LENGTH/2)delta-=TRACK_LENGTH;
  const gate=r.nextGate*TRACK_LENGTH/GATES;
  const toGate=((gate-r.lastS)%TRACK_LENGTH+TRACK_LENGTH)%TRACK_LENGTH;
  if(delta>0&&delta<12&&toGate<=delta+.001){
    r.passed++;r.checkpointTime=elapsed;
    if(r.nextGate===0){
      if(r.lap>0){const lapTime=elapsed-r.lapStarted;r.bestLap=r.bestLap===null?lapTime:Math.min(r.bestLap,lapTime);}
      r.lap++;r.lapStarted=elapsed;
      if(r.lap>LAPS){r.finishTime=elapsed;r.speed=0;r.boosting=false;}
    }
    r.nextGate=(r.nextGate+1)%GATES;
  }
  r.lastS=r.s;
}
export function ranking(racers) {
  return [...racers].sort((a,b)=>{
    if(a.finishTime!==null||b.finishTime!==null)return (a.finishTime??Infinity)-(b.finishTime??Infinity);
    if(a.passed!==b.passed)return b.passed-a.passed;
    const gate=a.nextGate*TRACK_LENGTH/GATES;
    return ((gate-a.s+TRACK_LENGTH)%TRACK_LENGTH)-((gate-b.s+TRACK_LENGTH)%TRACK_LENGTH);
  });
}
export function botInput(r,index=0) {
  const ahead=pointAt(r.s+10+Math.abs(r.speed)*.38),offset=(index-1)*1.7;
  const targetYaw=Math.atan2(ahead.x+ahead.dz*offset-r.x,ahead.z-ahead.dx*offset-r.z);
  const turn=angleDiff(targetYaw,r.yaw),bend=Math.abs(angleDiff(pointAt(r.s+35).yaw,r.yaw));
  const targetSpeed=(bend>.8?23:bend>.4?36:57)+index*2;
  return {throttle:r.speed<targetSpeed,brake:r.speed>targetSpeed+7,left:turn>.035,right:turn<-.035,nitro:bend<.12&&r.speed>48,drift:false};
}

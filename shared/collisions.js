import { getCar } from './cars.js';
import { nearestPoint, TRACK_WIDTH, BARRIERS, trackVersion } from './track.js';

// Oriented boxes cover bodywork, tyres and bumpers, not just a circle at the car centre.
export function carShape(r) {
  return { halfWidth: r.carId === 'bugatti' ? 1.3 : 1.22, halfLength: 2.52,
    side: { x: Math.cos(r.yaw), z: -Math.sin(r.yaw) },
    forward: { x: Math.sin(r.yaw), z: Math.cos(r.yaw) } };
}
const dot = (a, b) => a.x * b.x + a.z * b.z;
const extent = (shape, axis) => Math.abs(dot(shape.side, axis)) * shape.halfWidth
  + Math.abs(dot(shape.forward, axis)) * shape.halfLength;

export function carContact(a, b) {
  const delta = { x: b.x - a.x, z: b.z - a.z };
  if (Math.abs(delta.x) > 5.8 || Math.abs(delta.z) > 5.8) return null;
  return boxContact(a,carShape(a),b,carShape(b));
}

function boxContact(a,sa,b,sb) {
  const delta = { x: b.x - a.x, z: b.z - a.z };
  let depth = Infinity, normal;
  for (const axis of [sa.side, sa.forward, sb.side, sb.forward]) {
    const separation = dot(delta, axis);
    const overlap = extent(sa, axis) + extent(sb, axis) - Math.abs(separation);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = separation < 0 ? -1 : 1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { ...normal, depth };
}

export const barrierContact = (r, barrier) => boxContact(r,carShape(r),barrier,barrier);
// Static spatial buckets avoid testing every wall for every car on every substep.
const cellSize=8,wallCells=new Map();let wallVersion=-1;
function rebuildWallCells(){
  if(wallVersion===trackVersion)return;wallCells.clear();
  for(const wall of BARRIERS){
    const ex=extent(wall,{x:1,z:0}),ez=extent(wall,{x:0,z:1});
    for(let x=Math.floor((wall.x-ex)/cellSize);x<=Math.floor((wall.x+ex)/cellSize);x++)
      for(let z=Math.floor((wall.z-ez)/cellSize);z<=Math.floor((wall.z+ez)/cellSize);z++){
        const key=`${x},${z}`;if(!wallCells.has(key))wallCells.set(key,[]);wallCells.get(key).push(wall);
      }
  }
  wallVersion=trackVersion;
}
function nearbyWalls(r){
  rebuildWallCells();
  const walls=new Set();
  for(let x=Math.floor((r.x-3)/cellSize);x<=Math.floor((r.x+3)/cellSize);x++)
    for(let z=Math.floor((r.z-3)/cellSize);z<=Math.floor((r.z+3)/cellSize);z++)
      for(const wall of wallCells.get(`${x},${z}`)||[])walls.add(wall);
  return walls;
}

export function resolveBarrierCollisions(r){
  let moved=false;
  for(let iteration=0;iteration<8;iteration++){
    let largest=0;
    for(const wall of nearbyWalls(r)){
      const contact=barrierContact(r,wall);
      if(!contact)continue;
      largest=Math.max(largest,contact.depth);moved=true;
      r.x-=contact.x*(contact.depth+.001);r.z-=contact.z*(contact.depth+.001);
      const outward=r.vx*contact.x+r.vz*contact.z;
      if(outward>0){
        // A fixed wall absorbs the inward impact, preserving motion along its face.
        r.vx-=contact.x*outward;r.vz-=contact.z*outward;
        r.collision=Math.max(r.collision||0,Math.min(1,outward/18));
      }
    }
    if(largest<.001)break;
  }
  return moved;
}

export function updateCollisionSpeed(r) {
  const forward = r.vx * Math.sin(r.yaw) + r.vz * Math.cos(r.yaw);
  r.speed = Math.hypot(r.vx, r.vz) * (forward < 0 ? -1 : 1);
}

export function confineToTrack(r) {
  let near = nearestPoint(r.x, r.z);
  const axis = { x: near.dz, z: -near.dx };
  // Keep the corners of a sideways/drifting car inside the edge as well as its centre.
  const limit = TRACK_WIDTH / 2 - .15 - extent(carShape(r), axis);
  if (near.distance > limit) {
    const nx = (r.x - near.x) / near.distance, nz = (r.z - near.z) / near.distance;
    r.x = near.x + nx * limit; r.z = near.z + nz * limit;
    const outward = r.vx * nx + r.vz * nz;
    if (outward > 0) {
      r.vx -= nx * outward; r.vz -= nz * outward;
      r.collision = Math.max(r.collision || 0, Math.min(1, outward / 18));
    }
  }
  // The corridor is a recovery/tunneling safeguard; actual mesh-shaped walls
  // also catch rotated bumpers at curved edges and segment joins.
  if(resolveBarrierCollisions(r))near=nearestPoint(r.x,r.z);
  r.s = near.s;
  updateCollisionSpeed(r);
  return near;
}

export function resolveCarCollisions(racers, { track = true, iterations = 40 } = {}) {
  const ordered = [...racers].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const inverseMass = ordered.map(r => 1 / Number(getCar(r.carId).weight.replaceAll(',', '')));
  // Multiple passes resolve a compact group instead of fixing one pair and breaking the next.
  for (let iteration = 0; iteration < iterations; iteration++) {
    let largest = 0;
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i], b = ordered[j], contact = carContact(a, b);
      if (!contact) continue;
      largest = Math.max(largest, contact.depth);
      const ia = inverseMass[i], ib = inverseMass[j], total = ia + ib;
      const correction = contact.depth + .001;
      a.x -= contact.x * correction * ia / total; a.z -= contact.z * correction * ia / total;
      b.x += contact.x * correction * ib / total; b.z += contact.z * correction * ib / total;
      const relative = (b.vx - a.vx) * contact.x + (b.vz - a.vz) * contact.z;
      if (relative < 0) {
        // Low restitution feels like heavy cars, rather than bouncing rubber balls.
        const impulse = -(1.08 * relative) / total;
        a.vx -= impulse * ia * contact.x; a.vz -= impulse * ia * contact.z;
        b.vx += impulse * ib * contact.x; b.vz += impulse * ib * contact.z;
        const tx = -contact.z, tz = contact.x;
        const sideways = ((b.vx - a.vx) * tx + (b.vz - a.vz) * tz) / total;
        const friction = Math.max(-impulse * .12, Math.min(impulse * .12, sideways));
        a.vx += friction * ia * tx; a.vz += friction * ia * tz;
        b.vx -= friction * ib * tx; b.vz -= friction * ib * tz;
        a.collision = Math.max(a.collision || 0, Math.min(1, -relative / 20));
        b.collision = Math.max(b.collision || 0, Math.min(1, -relative / 20));
      }
    }
    if (track) for (const r of ordered) {
      const x=r.x,z=r.z;confineToTrack(r);
      largest=Math.max(largest,Math.hypot(r.x-x,r.z-z));
    }
    if (largest < .002) break;
  }
  for (const r of ordered) updateCollisionSpeed(r);
}

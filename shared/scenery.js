import { pointAt, nearestPoint, TRACK_LENGTH, TRACK_WIDTH } from './track.js';
export function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
export function generateTrees() {
  const random = seeded(93), trees = [];
  for (let s = 0; s < TRACK_LENGTH; s += 8) for (const side of [-1, 1]) {
    const p = pointAt(s), scale = 3 + random() * 5, radius = scale * .6;
    const offset = side * (18 + random() * 29);
    const x = p.x + p.dz * offset, z = p.z - p.dx * offset;
    // Checking only the source bend allowed trees to land on a neighbouring stretch
    // of the circuit. Reserve space around the entire road, including the canopy.
    if (nearestPoint(x, z).distance < TRACK_WIDTH / 2 + radius + 4) continue;
    trees.push({ x, z, scale, radius, yaw: random() * Math.PI * 2, tint: random() });
  }
  return trees;
}

export function keepCameraClear(position) {
  const near = nearestPoint(position.x, position.z), limit = TRACK_WIDTH / 2 - 1;
  if (near.distance > limit) {
    position.x = near.x + (position.x - near.x) * limit / near.distance;
    position.z = near.z + (position.z - near.z) * limit / near.distance;
  }
  return position;
}

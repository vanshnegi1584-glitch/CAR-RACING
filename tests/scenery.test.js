import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTrees, keepCameraClear } from '../shared/scenery.js';
import { TRACK, TRACK_WIDTH, nearestPoint } from '../shared/track.js';

test('every tree and its canopy clear the entire circuit, including neighbouring bends', () => {
  const trees = generateTrees();
  assert.ok(trees.length > 150);
  for (const t of trees) assert.ok(nearestPoint(t.x, t.z).distance - t.radius >= TRACK_WIDTH / 2 + 4);
  assert.deepEqual(generateTrees(), trees, 'scenery should be reproducible');
});

test('chase camera positions stay clear of trackside scenery throughout the circuit', () => {
  for (const p of TRACK.filter((_, i) => i % 8 === 0)) for (const lane of [-8, 8]) {
    const camera = { x: p.x + p.dz * lane - p.dx * 13, z: p.z - p.dx * lane - p.dz * 13, y: 6.4 };
    keepCameraClear(camera);
    assert.ok(nearestPoint(camera.x, camera.z).distance <= TRACK_WIDTH / 2 - .95);
    assert.equal(camera.y, 6.4);
  }
});

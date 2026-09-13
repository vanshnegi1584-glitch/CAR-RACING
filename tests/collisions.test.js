import test from 'node:test';
import assert from 'node:assert/strict';
import { createRacer, stepRace, botInput, EMPTY_INPUT } from '../shared/physics.js';
import { carContact, carShape, resolveCarCollisions, confineToTrack } from '../shared/collisions.js';
import { pointAt, nearestPoint, TRACK_WIDTH } from '../shared/track.js';
import { getCar } from '../shared/cars.js';
import { startRace, tickRace } from '../server/raceManager.js';

const car = (id, x, z, yaw = 0, carId = 'supra') => ({
  ...createRacer(id, id, carId), x, z, yaw, vx: 0, vz: 0, speed: 0,
});
const assertSeparated = cars => {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    assert.ok((carContact(cars[i], cars[j])?.depth || 0) < .01, `overlap: ${cars[i].id}/${cars[j].id}`);
  }
};

test('car collision shapes follow orientation and leave separated cars alone', () => {
  const a = car('a', 0, 0), b = car('b', 0, 4);
  assert.ok(carContact(a, b));
  b.yaw = Math.PI / 2;
  assert.equal(carContact(a, b), null);
  const before = { ...a };
  resolveCarCollisions([a, b], { track: false });
  assert.deepEqual(a, before);
});

test('a rear-end impact transfers momentum and separates the bumpers', () => {
  const a = car('a', 0, 0), b = car('b', 0, 4.9, 0, 'bugatti');
  a.vz = 35; b.vz = 8;
  const ma = Number(getCar(a.carId).weight.replaceAll(',', ''));
  const mb = Number(getCar(b.carId).weight.replaceAll(',', ''));
  const momentum = ma * a.vz + mb * b.vz;
  const energy = ma * a.vz ** 2 + mb * b.vz ** 2;
  resolveCarCollisions([a, b], { track: false });
  assertSeparated([a, b]);
  assert.ok(b.vz > 8 && a.vz < 35);
  assert.ok(Math.abs(ma * a.vz + mb * b.vz - momentum) < 1e-6);
  assert.ok(ma * a.vz ** 2 + mb * b.vz ** 2 <= energy);
});

test('side impacts push sideways instead of mixing the bodies', () => {
  const a = car('a', 0, 0), b = car('b', 2.3, 0);
  a.vx = 9; a.vz = b.vz = 30;
  resolveCarCollisions([a, b], { track: false });
  assertSeparated([a, b]); assert.ok(b.vx > 0 && a.vx < 9);
});

test('four cars packed together separate without adding velocity', () => {
  const cars = [car('a', 0, 0), car('b', .3, 0), car('c', 0, .4), car('d', .2, .4)];
  resolveCarCollisions(cars, { track: false });
  assertSeparated(cars);
  for (const r of cars) assert.equal(Math.hypot(r.vx, r.vz), 0);
});

test('a four-car pack against a guardrail stays contained and separates', () => {
  const p = pointAt(20);
  const cars = [0, 1, 2, 3].map(i => {
    const r = car(String(i), p.x + p.dz * (5 + i * .8), p.z - p.dx * (5 + i * .8), p.yaw);
    r.vx = p.dz * 6; r.vz = -p.dx * 6;
    return r;
  });
  resolveCarCollisions(cars);
  assertSeparated(cars);
  for (const r of cars) assert.ok(nearestPoint(r.x, r.z).distance < TRACK_WIDTH / 2 - 1);
});

test('rotated car corners remain inside the road at the barrier', () => {
  const p = pointAt(20), r = car('a', p.x + p.dz * 9, p.z - p.dx * 9, p.yaw + .6);
  confineToTrack(r);
  const shape = carShape(r);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const px = r.x + x * shape.side.x * shape.halfWidth + z * shape.forward.x * shape.halfLength;
    const pz = r.z + x * shape.side.z * shape.halfWidth + z * shape.forward.z * shape.halfLength;
    assert.ok(nearestPoint(px, pz).distance < TRACK_WIDTH / 2 + .05);
  }
});

test('high-speed head-on cars cannot tunnel through each other at a slow outer tick', () => {
  const p = pointAt(20);
  const a = car('a', p.x, p.z, p.yaw, 'bugatti');
  const b = car('b', p.x + p.dx * 12, p.z + p.dz * 12, p.yaw + Math.PI, 'bugatti');
  a.vx = p.dx * 120; a.vz = p.dz * 120; a.speed = 120;
  b.vx = -p.dx * 120; b.vz = -p.dz * 120; b.speed = 120;
  stepRace([a, b], () => ({ throttle: true, nitro: true }), .1, .1);
  assertSeparated([a, b]);
  assert.ok((b.x - a.x) * p.dx + (b.z - a.z) * p.dz > 0, 'cars must not swap sides');
  assert.ok(a.collision > 0 && b.collision > 0);
});

test('a finished car stays solid and can be pushed without changing its result', () => {
  const p = pointAt(20), a = car('a', p.x, p.z, p.yaw);
  const b = car('b', p.x + p.dx * 5, p.z + p.dz * 5, p.yaw);
  b.finishTime = 100; a.vx = p.dx * 30; a.vz = p.dz * 30;
  stepRace([a, b], () => EMPTY_INPUT, 1 / 60, 101);
  assertSeparated([a, b]); assert.equal(b.finishTime, 100);
  assert.ok(b.vx * p.dx + b.vz * p.dz > 0);
});

test('the authoritative server applies car impacts before broadcasting race state', () => {
  const players = new Map(['a', 'b'].map(id => [id, { id, name: id, carId: 'supra', ready: true, connected: true, input: EMPTY_INPUT, inputAt: 4000 }]));
  const room = { state: 'lobby', players };
  startRace(room, 0); room.race.lastTick = 3990;
  const p = pointAt(20), [a, b] = room.race.states;
  for (const [i, r] of [a, b].entries()) Object.assign(r, {
    x: p.x + p.dx * i * 5, z: p.z + p.dz * i * 5, yaw: p.yaw,
    vx: p.dx * (i ? 5 : 30), vz: p.dz * (i ? 5 : 30),
  });
  tickRace(room, 4010);
  assertSeparated([a, b]);
  assert.ok(b.vx * p.dx + b.vz * p.dz > 5);
  assert.ok(a.collision > 0 && b.collision > 0);
});

test('all four cars finish a full race with contacts enabled', () => {
  const cars = ['supra', 'bmw', 'bugatti', 'supra'].map((id, i) => createRacer(String(i), String(i), id, i));
  let elapsed = 0;
  while (elapsed < 240 && cars.some(r => r.finishTime === null)) {
    elapsed += 1 / 60;
    stepRace(cars, r => botInput(r, Number(r.id) % 3), 1 / 60, elapsed);
    assertSeparated(cars);
  }
  assert.ok(cars.every(r => r.finishTime !== null), cars.map(r => `${r.id}: lap ${r.lap}`).join(', '));
});

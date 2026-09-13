import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS } from '../shared/cars.js';
import { createRacer, stepDriving, resetRacer } from '../shared/physics.js';
import { angleDiff } from '../shared/track.js';

const freeCar = (id, speed = 50) => ({
  ...createRacer('test', 'Test driver', id),
  x: 0, z: 0, yaw: 0, vx: 0, vz: speed, speed,
});
const drive = (r, input, seconds, hz = 60) => {
  for (let i = 0; i < seconds * hz; i++) stepDriving(r, input, 1 / hz);
};
const slip = r => Math.abs(angleDiff(r.yaw, Math.atan2(r.vx, r.vz)));

test('left/right turns mirror each other and steering reverses correctly when backing up', () => {
  for (const car of CARS) {
    const left = freeCar(car.id), right = freeCar(car.id), reverse = freeCar(car.id, -10);
    drive(left, { left: true }, .5); drive(right, { right: true }, .5);
    drive(reverse, { left: true, brake: true }, .5);
    assert.ok(left.x > 0 && left.yaw > 0 && left.wheelSteer > 0);
    assert.ok(right.x < 0 && right.yaw < 0 && right.wheelSteer < 0);
    assert.ok(Math.abs(left.x + right.x) < 1e-8);
    assert.ok(Math.abs(left.z - right.z) < 1e-8);
    assert.ok(reverse.yaw < 0 && reverse.wheelSteer > 0);
  }
});

test('stationary steering turns the front wheels without rotating the whole car', () => {
  const r = freeCar('supra', 0);
  drive(r, { left: true, drift: true }, 2);
  assert.equal(r.yaw, 0); assert.equal(r.speed, 0); assert.equal(r.drifting, false);
  assert.ok(r.wheelSteer > .4);
});

test('high-speed steering is less sensitive than low-speed steering', () => {
  for (const car of CARS) {
    const slow = freeCar(car.id, 25), fast = freeCar(car.id, car.speed);
    drive(slow, { left: true }, .2); drive(fast, { left: true }, .2);
    assert.ok(fast.yawRate < slow.yawRate * .7);
    assert.ok(fast.wheelSteer < slow.wheelSteer);
  }
});

for (const car of CARS) test(`${car.name}: sustained drifting stays bounded and releasing steering restores grip`, () => {
  const r = freeCar(car.id);
  let maxSlip = 0;
  for (let i = 0; i < 600; i++) {
    stepDriving(r, { throttle: true, left: true, drift: true }, 1 / 60);
    maxSlip = Math.max(maxSlip, slip(r));
    assert.ok(r.speed <= car.speed + 1e-7, 'sideways speed must not bypass the speed limit');
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.z));
  }
  assert.ok(maxSlip > .12, 'drifting should produce a visible slide');
  assert.ok(maxSlip < .55, 'holding drift should not spin the car out');
  const driftRate = r.yawRate;
  drive(r, { throttle: true }, 1);
  assert.equal(r.drifting, false);
  assert.ok(slip(r) < .03);
  assert.ok(Math.abs(r.yawRate) < .001);
  assert.ok(Math.abs(r.yawRate) < driftRate / 100);
});

test('countersteering changes direction promptly and does not keep turning the previous way', () => {
  const r = freeCar('supra');
  drive(r, { throttle: true, left: true, drift: true }, 1);
  assert.ok(r.yawRate > 0);
  drive(r, { throttle: true, right: true, drift: true }, .3);
  assert.ok(r.steer < 0 && r.yawRate < 0 && r.wheelSteer < 0);
  drive(r, { throttle: true, right: true, drift: true }, 1);
  assert.ok(slip(r) < .55);
});

test('turning a coasting car never creates kinetic energy', () => {
  const r = freeCar('supra', 60); r.vx = -24;
  for (let i = 0; i < 240; i++) {
    const before = Math.hypot(r.vx, r.vz);
    stepDriving(r, { left: true, drift: true }, 1 / 60);
    assert.ok(Math.hypot(r.vx, r.vz) <= before + 1e-8);
  }
});

test('a reset clears accumulated steering and drift so the car restarts straight', () => {
  const r = freeCar('supra');
  drive(r, { throttle: true, left: true, drift: true }, 1);
  resetRacer(r);
  for (const key of ['steer', 'yawRate', 'wheelSteer', 'driftAmount']) assert.equal(r[key], 0);
  assert.equal(r.drifting, false);
  const heading = r.yaw;
  drive(r, { throttle: true }, 1);
  assert.equal(r.yaw, heading);
});

test('handling remains close across 30, 60, and 120 Hz simulation steps', () => {
  const states = [30, 60, 120].map(hz => {
    const r = freeCar('supra');
    drive(r, { throttle: true, left: true, drift: true }, 1, hz);
    drive(r, { throttle: true }, 1, hz);
    return r;
  });
  for (const r of states) {
    assert.ok(Math.abs(r.yaw - states[1].yaw) < .04);
    assert.ok(Math.hypot(r.x - states[1].x, r.z - states[1].z) < 2);
  }
});

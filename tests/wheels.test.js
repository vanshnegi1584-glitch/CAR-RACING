import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { makeCar, updateCarModel } from '../client/src/cars/CarModel.js';

test('wheel spin uses distance and stays separate from the steering axis', () => {
  const previousDocument = globalThis.document;
  // Only the generated number plate needs a canvas. No WebGL renderer is needed here.
  globalThis.document = { createElement: () => ({
    width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }),
  }) };
  try {
    for (const id of ['supra', 'bmw', 'bugatti']) {
      const model = makeCar(id);
      const r = { x: 0, z: 0, yaw: 0, speed: 20, steer: 1, wheelSteer: .3, boosting: false, finishTime: null };
      updateCarModel(model, r, 1000, .016);
      const phase = model.userData.wheels[0].rolling.rotation.x;
      r.speed = 5;
      updateCarModel(model, r, 9000, .016);
      assert.ok(Math.abs(model.userData.wheels[0].rolling.rotation.x - phase - 5 * .016 / .43) < 1e-8);
      model.updateMatrixWorld(true);
      for (const { pivot, rolling, front } of model.userData.wheels) {
        assert.equal(pivot.rotation.x, 0);
        assert.equal(pivot.rotation.y, front ? .3 : 0);
        const axle = new Vector3(1, 0, 0).transformDirection(rolling.matrixWorld);
        assert.ok(Math.abs(axle.y) < 1e-8, 'the wheel axle must stay horizontal while steering');
      }
      const stopped = model.userData.wheels[0].rolling.rotation.x;
      r.speed = 0; updateCarModel(model, r, 10000, .016);
      assert.equal(model.userData.wheels[0].rolling.rotation.x, stopped);
      r.speed = -5; updateCarModel(model, r, 10001, .016);
      assert.ok(model.userData.wheels[0].rolling.rotation.x < stopped);
      model.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.map?.dispose(); mesh.material?.dispose(); });
    }
  } finally { globalThis.document = previousDocument; }
});

import * as THREE from 'three';
import { seeded } from '../../../shared/scenery.js';

export function surfaceTexture(kind) {
  const size = 256, data = new Uint8Array(size * size * 4), random = seeded(kind === 'grass' ? 61 : 12);
  const coarse = Array.from({ length: 64 }, () => random());
  const sample = (x, y) => coarse[((y + 8) % 8) * 8 + (x + 8) % 8];
  const smooth = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const noise = random(), grain = (noise - .5) * 26;
    const gx = x / 32, gy = y / 32, ix = Math.floor(gx), iy = Math.floor(gy);
    const patch = mix(mix(sample(ix, iy), sample(ix + 1, iy), smooth(gx - ix)),
      mix(sample(ix, iy + 1), sample(ix + 1, iy + 1), smooth(gx - ix)), smooth(gy - iy));
    const patches = kind === 'asphalt' ? 0 : (patch - .5) * 18;
    const base = kind === 'grass' ? [77, 94, 57] : kind === 'gravel' ? [124, 115, 96] : [69, 73, 77];
    for (let c = 0; c < 3; c++) data[i + c] = base[c] + grain + patches + (noise > .985 ? 23 : 0);
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

export function contactShadow() {
  const size = 48, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = Math.max(Math.abs(x / (size - 1) * 2 - 1), Math.abs(y / (size - 1) * 2 - 1));
    data[(y * size + x) * 4 + 3] = Math.round(125 * Math.max(0, 1 - edge ** 3) ** 2);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 5.5),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .045;
  return shadow;
}

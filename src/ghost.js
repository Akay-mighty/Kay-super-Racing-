/* Kay Super Racing — ghost system
   Records your run (position + heading, ~8 samples/sec) and replays it as a
   translucent hologram car. Used for: local best-lap ghost in Time Trial and
   ONLINE RIVAL races (ghost downloaded from Firebase). */
import * as THREE from 'three';
import { carGeo, getCar, tintPart } from './cars-data.js';
import { colorize } from './carcolor.js';

const STEP = 0.12;               /* seconds between samples */
const r2 = n => Math.round(n * 100) / 100;

/* ---------- recorder: samples -> flat array [x,y,z,h,t, ...] ---------- */
export class GhostRec {
  constructor() { this.flat = []; this.last = -1; }
  reset() { this.flat = []; this.last = -1; }
  tick(raceT, pos, h) {
    if (raceT - this.last < STEP) return;
    this.last = raceT;
    this.flat.push(r2(pos.x), r2(pos.y), r2(pos.z), r2(h), r2(raceT));
  }
  finish() { return this.flat.length >= 10 ? this.flat : null; }
  static duration(flat) { return flat && flat.length >= 5 ? flat[flat.length - 1] : 0; }
}

/* ---------- replay car ---------- */
const labelTex = (txt, color) => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(5,10,20,.55)'; g.beginPath(); g.roundRect(8, 8, 240, 48, 12); g.fill();
  g.font = 'italic 900 30px Segoe UI,Arial'; g.textAlign = 'center'; g.fillStyle = color || '#8df';
  g.fillText(txt.slice(0, 14), 128, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

export function makeGhostCar(carId, color, tint, label) {
  const geo = carGeo(carId).clone();
  colorize(geo, color);
  if (tint) for (const [pid, hex] of Object.entries(tint)) tintPart(geo, +pid, hex);
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false }));
  body.renderOrder = 5; group.add(body);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(label, '#8df'), transparent: true, depthWrite: false }));
  spr.scale.set(7.5, 1.9, 1); spr.position.y = 3.4; spr.renderOrder = 6; group.add(spr);
  group.rotation.order = 'YXZ'; group.visible = false;
  group.traverse(o => { o.castShadow = false; o.receiveShadow = false; });

  let flat = null, i = 0;
  return {
    group,
    get active() { return !!flat; },
    set(f) { flat = f && f.length >= 5 ? f : null; i = 0; group.visible = false; },
    clear() { flat = null; group.visible = false; },
    update(scene, raceT) {
      if (!flat) return;
      if (raceT <= 0.02 || raceT >= GhostRec.duration(flat)) { group.visible = raceT > 0.02 && raceT < GhostRec.duration(flat) + 30; }
      else group.visible = true;
      if (!group.visible) return;
      while (i > 0 && flat[i * 5 + 4] > raceT) i--;               /* rewound (restart) */
      const n = flat.length / 5;
      while (i < n - 2 && flat[(i + 1) * 5 + 4] <= raceT) i++;
      const a = i * 5, b = Math.min(i + 1, n - 1) * 5, t1 = flat[a + 4], t2 = flat[b + 4];
      const f = t2 > t1 ? Math.min(1, (raceT - t1) / (t2 - t1)) : 0;
      const x = flat[a] + (flat[b] - flat[a]) * f, y = flat[a + 1] + (flat[b + 1] - flat[a + 1]) * f, z = flat[a + 2] + (flat[b + 2] - flat[a + 2]) * f;
      let dh = flat[b + 3] - flat[a + 3]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      if (!group.parent) scene.add(group);
      group.position.set(x, y + 0.04, z);
      group.rotation.y = flat[a + 3] + dh * f;
    }
  };
}

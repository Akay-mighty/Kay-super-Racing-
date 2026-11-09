// Kay Super Racing — car catalog: 8 cars built from the procedural loft system in car-geometry.js.
// Stats are tuned against main.js physics: max speed (units/s), accel, steering rate, drift grip.
import * as THREE from 'three';
import { BODY_SPECS, buildCarGeometry, buildWheelGeos, SPORT } from './car-geometry.js';

const cloneSport = mut => { const s = JSON.parse(JSON.stringify(SPORT)); if (mut) mut(s); return s; };

export const CARS = [
  {
    id: 'cruiser', name: 'KAY CRUISER', price: 0, tag: 'STARTER',
    desc: 'Your trusty first ride. Balanced speed and grip.',
    spec: SPORT,
    stats: { top: 90, accel: 34, steer: 1.90, drift: 1.70, fly: false }
  },
  {
    id: 'cab', name: 'MIDNIGHT CAB', price: 8000, tag: 'DRIFT FUN',
    desc: 'Taxi shifts finished. Now it slides for a living.',
    spec: BODY_SPECS.taxi, tint: { 6: 0xf2c200 },
    stats: { top: 92, accel: 37, steer: 2.05, drift: 1.95, fly: false }
  },
  {
    id: 'titan', name: 'TITAN X', price: 18000, tag: 'STABLE',
    desc: 'Heavy SUV. Barely flinches when rivals ram you.',
    spec: BODY_SPECS.suv,
    stats: { top: 95, accel: 40, steer: 1.72, drift: 1.55, fly: false }
  },
  {
    id: 'volt', name: 'VOLT RUNNER', price: 25000, tag: 'ELECTRIC',
    desc: 'Instant torque, zero noise. Off the line like a slingshot.',
    spec: cloneSport(s => { s.wheelRadius = 0.36; s.chrome = false; s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.95]); }),
    stats: { top: 100, accel: 50, steer: 2.02, drift: 1.72, fly: false }
  },
  {
    id: 'blaze', name: 'STREET BLAZE', price: 35000, tag: 'QUICK',
    desc: 'Wide arches, big tyres, eager throttle.',
    spec: cloneSport(s => { s.wheelRadius = 0.38; s.archFlare = 0.05; s.chrome = false; }),
    stats: { top: 101, accel: 46, steer: 2.00, drift: 1.65, fly: false }
  },
  {
    id: 'nova', name: 'NOVA GT', price: 65000, tag: 'EASY + FAST',
    desc: 'A gentleman\u2019s GT: very fast and very easy to control.',
    spec: cloneSport(s => { s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.92]); s.chrome = true; }),
    stats: { top: 108, accel: 51, steer: 2.08, drift: 1.75, fly: false }
  },
  {
    id: 'sultan', name: 'DUNE SULTAN', price: 90000, tag: 'DRIFT KING',
    desc: 'Rally-bred slider. Enters corners sideways, exits them smiling.',
    spec: cloneSport(s => { s.halfWidth = s.halfWidth.map(([z, v]) => [z, v * 1.04]); s.wheelRadius = 0.40; s.chrome = false; }),
    stats: { top: 110, accel: 52, steer: 2.00, drift: 2.10, fly: false }
  },
  {
    id: 'tesla', name: 'TESLA SPARK', price: 150000, tag: 'FLYING \u2708', fly: true,
    desc: 'Falcon-wing thrusters. Press F to take off and fly over the city!',
    spec: cloneSport(s => {
      s.name = 'tesla'; s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.85]);
      s.cabin.cowl = 0.5; s.chrome = false; s.edge = s.edge.map(([z, v]) => [z, v * 0.96]);
    }),
    stats: { top: 116, accel: 56, steer: 2.12, drift: 1.80, fly: true }
  },
  {
    id: 'phantom', name: 'HYPER PHANTOM', price: 400000, tag: 'TOP SPEED',
    desc: 'Ground-based missile. The fastest thing on four wheels.',
    spec: cloneSport(s => {
      s.halfWidth = s.halfWidth.map(([z, v]) => [z, v * 1.1]); s.wheelX *= 1.1;
      s.wheelRadius = 0.385; s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.88]);
    }),
    stats: { top: 124, accel: 62, steer: 2.15, drift: 1.70, fly: false }
  },
  {
    id: 'apex', name: 'APEX ZERO', price: 700000, tag: 'TRACK WEAPON',
    desc: 'Formula DNA for the road. Corners are a suggestion it ignores.',
    spec: cloneSport(s => { s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.9]); s.wheelRadius = 0.375; s.chrome = true; }),
    stats: { top: 128, accel: 66, steer: 2.20, drift: 1.80, fly: false }
  },
  {
    id: 'zephyr', name: 'ZEPHYR V12', price: 1500000, tag: '1200 HP',
    desc: 'Twin-turbo V12 hypercar. Low, wide and brutally fast, with a blue-flame exhaust.',
    spec: cloneSport(s => {
      s.name = 'zephyr'; s.halfWidth = s.halfWidth.map(([z, v]) => [z, v * 1.12]); s.wheelX *= 1.12;
      s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.8]); s.cabin.cowl = 0.62; s.cabin.roofFront = -0.05; s.cabin.deck = -1.25;
      s.edge = s.edge.map(([z, v]) => [z, v * 0.92]); s.wheelRadius = 0.4; s.archFlare = 0.09; s.chrome = false;
    }),
    stats: { top: 138, accel: 74, steer: 2.2, drift: 1.8, fly: false }
  },
  {
    id: 'ferrari', name: 'FERRARI', price: 2500000, tag: 'DREAM CAR',
    desc: 'The real thing. A true supercar model: low, wide and ferociously quick.',
    glb: { url: '/models/ferrari-lite.glb', len: 4.5, rotY: 0, paintFrom: [0.608, 0.02, 0.027], wheels: { r: 0.375, y: 0.37, zf: 1.17, zr: -1.49, xin: 0.55 } },
    spec: cloneSport(s => {
      s.name = 'ferrari'; s.halfWidth = s.halfWidth.map(([z, v]) => [z, v * 1.1]); s.wheelX *= 1.1;
      s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.8]); s.chrome = false; s.wheelRadius = 0.38;
    }),
    stats: { top: 140, accel: 76, steer: 2.2, drift: 1.8, fly: false }
  },
  {
    id: 'overlander', name: 'OVERLANDER', price: 900000, tag: 'SUMO BRUTE',
    desc: 'A heavy expedition truck with big off-road wheels. Built to shove rivals off the arena.',
    glb: { url: '/models/overlander.glb', len: 3.9, rotY: -Math.PI / 2, rough: 0.6, metal: 0.05, nearest: true, paintFrom: [0.91, 0.68, 0.54], wheels: { r: 0.37, y: 0.37, zf: 1.27, zr: -0.68, xin: 0.6 } },
    spec: cloneSport(s => { s.name = 'overlander'; s.wheelRadius = 0.45; s.chrome = false; }),
    stats: { top: 125, accel: 70, steer: 2.3, drift: 1.7, fly: false }
  },
  {
    id: 'venom', name: 'VENOM GT', price: 450000, tag: 'REAL MODEL',
    desc: 'A low, wide grand tourer with a real-model body. Paint it any colour.',
    glb: { url: '/models/venom.glb', len: 4.5, rotY: 0, rough: 0.35, metal: 0.3, paintFrom: [0.8, 0.8, 0.8], wheels: { r: 0.3, y: 0.29, zf: 1.25, zr: -1.22, xin: 0.62 } },
    spec: cloneSport(s => { s.name = 'venom'; s.chrome = false; s.wheelRadius = 0.3; }),
    stats: { top: 118, accel: 64, steer: 2.2, drift: 1.8, fly: false }
  },
  {
    id: 'stallion', name: 'STALLION', price: 300000, tag: 'MUSCLE',
    desc: 'Long hood, loud attitude. Muscle-car model, ready for any paint job.',
    glb: { url: '/models/stallion.glb', len: 4.5, rotY: 0, rough: 0.35, metal: 0.3, paintFrom: [0.8, 0.8, 0.8], wheels: { r: 0.31, y: 0.32, zf: 1.3, zr: -1.26, xin: 0.65 } },
    spec: cloneSport(s => { s.name = 'stallion'; s.chrome = false; s.wheelRadius = 0.31; }),
    stats: { top: 112, accel: 62, steer: 2.15, drift: 1.85, fly: false }
  },
  {
    id: 'hatch', name: 'HATCH GT', price: 260000, tag: 'REAL MODEL',
    desc: 'Pocket-rocket hatchback. Real 3D model, any paint you like.',
    glb: { url: '/models/hatch.glb', len: 4.2, rotY: Math.PI, rough: 0.3, metal: 0.35, paintFrom: [0.8, 0.8, 0.8], wheels: { r: 0.37, y: 0.37, zf: 1.22, zr: -1.35, xin: 0.5 } },
    spec: cloneSport(s => { s.name = 'hatch'; s.chrome = false; s.wheelRadius = 0.37; }),
    stats: { top: 108, accel: 58, steer: 2.25, drift: 1.9, fly: false }
  },
  {
    id: 'ghost', name: 'GHOST X PROTO', price: 1000000, tag: 'FLYING \u2708 KING', fly: true,
    desc: 'The endgame. Fastest car in the game AND it flies.',
    spec: cloneSport(s => {
      s.name = 'ghost'; s.halfWidth = s.halfWidth.map(([z, v]) => [z, v * 1.06]);
      s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.84]); s.chrome = false; s.wheelRadius = 0.39;
    }),
    stats: { top: 132, accel: 68, steer: 2.25, drift: 1.85, fly: true }
  },
  {
    id: 'roadster', name: 'FLYING ROADSTER', price: 600000, tag: 'GLB \u2708', fly: true,
    desc: 'The real flying Tesla. Press F to ignite the thrusters and soar over the city!',
    glb: { url: '/models/flying-tesla.glb', len: 4.5, rotY: Math.PI, rough: 0.15, metal: 0.85, paintFrom: [0.9, 0.9, 0.9], wheels: { r: 0.37, y: 0.37, zf: 1.08, zr: -1.45, xin: 0.53 } },
    spec: cloneSport(s => {
      s.name = 'roadster'; s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.82]);
      s.cabin.cowl = 0.55; s.chrome = false; s.wheelRadius = 0.36;
    }),
    stats: { top: 120, accel: 58, steer: 2.14, drift: 1.82, fly: true }
  }
];

export const getCar = id => CARS.find(c => c.id === id) || CARS[0];
export const carGeo = id => (carGeoCache[id] || (carGeoCache[id] = buildCarGeometry(getCar(id).spec)));
const carGeoCache = {};
/* body WITHOUT wheels (wheels are separate meshes so they can roll + steer) */
const bodyCache = {};
export const carBodyGeo = id => {
  if (!bodyCache[id]) { const g = buildCarGeometry(getCar(id).spec, false); g.userData.carId = id; bodyCache[id] = g; }
  return bodyCache[id];
};
const wheelCache = {};
/* procedural wheel set: [{geo, x, y, z, front, r}] — geo is origin-centred, spin about X */
export const carWheelSet = id => {
  if (!wheelCache[id]) {
    const sp = getCar(id).spec, w = buildWheelGeos(sp), out = [];
    for (const side of [-1, 1]) for (const z of [sp.wheelZ, -sp.wheelZ]) out.push({ geo: w[side], x: side * sp.wheelX, y: sp.wheelRadius, z, front: z > 0, r: sp.wheelRadius });
    wheelCache[id] = out;
  }
  return wheelCache[id];
};

/* recolor specific procedural parts after colorize() (e.g. yellow taxi sign = part 6) */
export function tintPart(geo, partId, hex) {
  const pid = geo.attributes.partId; if (!pid) return;
  const c = new THREE.Color(hex);
  let col = geo.attributes.color;
  if (!col) { col = new THREE.BufferAttribute(new Float32Array(pid.length * 3), 3); geo.setAttribute('color', col); }
  for (let i = 0; i < pid.length; i++) if (pid[i] === partId) { col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b; }
  col.needsUpdate = true;
}

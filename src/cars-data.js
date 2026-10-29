// Kay Super Racing — car catalog: 8 cars built from the procedural loft system in car-geometry.js.
// Stats are tuned against main.js physics: max speed (units/s), accel, steering rate, drift grip.
import * as THREE from 'three';
import { BODY_SPECS, buildCarGeometry, SPORT } from './car-geometry.js';

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
    id: 'ghost', name: 'GHOST X PROTO', price: 1000000, tag: 'FLYING \u2708 KING', fly: true,
    desc: 'The endgame. Fastest car in the game AND it flies.',
    spec: cloneSport(s => {
      s.name = 'ghost'; s.halfWidth = s.halfWidth.map(([z, v]) => [z, v * 1.06]);
      s.cabin.roofY = s.cabin.roofY.map(([z, v]) => [z, v * 0.84]); s.chrome = false; s.wheelRadius = 0.39;
    }),
    stats: { top: 132, accel: 68, steer: 2.25, drift: 1.85, fly: true }
  }
];

export const getCar = id => CARS.find(c => c.id === id) || CARS[0];
export const carGeo = id => (carGeoCache[id] || (carGeoCache[id] = buildCarGeometry(getCar(id).spec)));
const carGeoCache = {};

/* recolor specific procedural parts after colorize() (e.g. yellow taxi sign = part 6) */
export function tintPart(geo, partId, hex) {
  const pid = geo.attributes.partId; if (!pid) return;
  const c = new THREE.Color(hex);
  let col = geo.attributes.color;
  if (!col) { col = new THREE.BufferAttribute(new Float32Array(pid.length * 3), 3); geo.setAttribute('color', col); }
  for (let i = 0; i < pid.length; i++) if (pid[i] === partId) { col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b; }
  col.needsUpdate = true;
}

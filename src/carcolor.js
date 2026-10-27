/* Kay Super Racing — shared car paint logic (used by main.js player cars and ghost.js) */
import * as THREE from 'three';

const PART = { 1: '#0e1a26', 2: '#09090b', 3: '#c9ced6', 4: '#16191e', 6: '#222222', 7: '#101114', 8: '#101114' };
export { PART };

export function colorize(geo, color) {
  const pid = geo.attributes.partId.array, pos = geo.attributes.position.array;
  let at = geo.attributes.color; if (!at) { at = new THREE.BufferAttribute(new Float32Array(pid.length * 3), 3); geo.setAttribute('color', at); }
  const paint = new THREE.Color(color), tmp = new THREE.Color(), lum = paint.r * 0.3 + paint.g * 0.6 + paint.b * 0.1;
  const stripe = new THREE.Color(lum > 0.45 ? 0xd42a2a : 0xf2f2f2);
  for (let i = 0; i < pid.length; i++) {
    const id = pid[i], x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1];
    let c;
    if (id === 0 || id === 5) c = id === 0 && ((x < 0.17 && y > 0.55) || (x > 0.9 && y > 0.42 && y < 0.5)) ? stripe : paint;
    else c = tmp.set(PART[id] || '#111');
    at.array[i * 3] = c.r; at.array[i * 3 + 1] = c.g; at.array[i * 3 + 2] = c.b;
  }
  at.needsUpdate = true;
}

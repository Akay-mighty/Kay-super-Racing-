// KSR JUICE LAYER — hit stop + impact sparks.
// The two cheapest tricks in arcade game feel, done properly:
//
// 1. HIT STOP: on a heavy hit the whole simulation dips to ~18% speed for a
//    few frames (60-160ms). The world holds its breath, then snaps back.
//    This is what makes a punch in a good fighting game feel like it landed.
//    Capped at 0.22s so rapid hits stack into rhythm, never into mush.
//
// 2. SPARKS: one pooled THREE.Points cloud with additive blending. Per-particle
//    colour fades to black (invisible in additive) as life runs out — no shader
//    needed, no allocations at runtime. Everything punchy gets a burst: punches
//    (gold), rams (white), ring outs (red), wrecks (orange), landings (dust).
import * as THREE from 'three';

export function createJuice(scene, dotTex) {
  const N = 220;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const base = new Float32Array(N * 3); /* per-particle base colour, faded by life */
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N), max = new Float32Array(N), grav = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.55, map: dotTex, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
  });
  const cloud = new THREE.Points(geo, mat);
  cloud.frustumCulled = false; cloud.visible = false; cloud.renderOrder = 9;
  scene.add(cloud);
  let head = 0, stop = 0, active = false;
  const tint = new THREE.Color();

  /* spawn a burst: world position, count, hex colour, speed, upward bias, gravity */
  function burst(x, y, z, n, hex, spd = 9, up = 2.5, g = 14) {
    tint.set(hex);
    for (let i = 0; i < n; i++) {
      const k = head++ % N, k3 = k * 3;
      pos[k3] = x; pos[k3 + 1] = y; pos[k3 + 2] = z;
      const a = Math.random() * 6.283, e = Math.random() * Math.PI, s = spd * (0.35 + Math.random() * 0.65);
      vel[k3] = Math.sin(e) * Math.cos(a) * s;
      vel[k3 + 1] = Math.cos(e) * s * 0.55 + up * (0.4 + Math.random() * 0.6);
      vel[k3 + 2] = Math.sin(e) * Math.sin(a) * s;
      life[k] = max[k] = 0.26 + Math.random() * 0.36;
      grav[k] = g;
      const b = 0.75 + Math.random() * 0.55; /* slight per-spark brightness variance */
      base[k3] = tint.r * b; base[k3 + 1] = tint.g * b; base[k3 + 2] = tint.b * b;
      col[k3] = base[k3]; col[k3 + 1] = base[k3 + 1]; col[k3 + 2] = base[k3 + 2];
    }
    active = true; cloud.visible = true;
  }

  function hitStop(s) { stop = Math.min(0.12, Math.max(stop, s)); }
  const scale = () => (stop > 0 ? 0.35 : 1); /* the time-scale the frame loop multiplies dt by */

  function update(dt) {
    if (stop > 0) stop -= dt;
    if (!active) return;
    let any = false;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      any = true;
      life[i] -= dt;
      const k3 = i * 3, f = Math.max(0, life[i] / max[i]);
      vel[k3 + 1] -= grav[i] * dt;
      pos[k3] += vel[k3] * dt; pos[k3 + 1] += vel[k3 + 1] * dt; pos[k3 + 2] += vel[k3 + 2] * dt;
      col[k3] = base[k3] * f; col[k3 + 1] = base[k3 + 1] * f; col[k3 + 2] = base[k3 + 2] * f;
      if (life[i] <= 0) { col[k3] = col[k3 + 1] = col[k3 + 2] = 0; pos[k3 + 1] = -9999; }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    if (!any) { active = false; cloud.visible = false; }
  }
  function reset() {
    life.fill(0); col.fill(0); pos.fill(0);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -9999;
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    active = false; cloud.visible = false; stop = 0;
  }

  return { burst, hitStop, scale, update, reset };
}

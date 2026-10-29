// Kay Super Racing: ADVENTURE — free-roam open city (NFS / Forza Horizon style).
// Own world group, shown only when cfg.type === 'adv'. Fully procedural grid city:
// buildings + parks, civilian traffic, smashable cones, race-discovery markers,
// heat meter + police pursuit. main.js passes helpers in through ctx.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const PITCH = 130, RW = 28, E = 850; /* street pitch, road width, world half-size */
const KMAX = 6; /* streets at k*PITCH, k = -KMAX..KMAX */

/* race invitation tiers — the longer you stay free, the better the invite */
const TIERS = [
  { name: 'STREET RACE',     col: 0x35d16a, css: '#35d16a', laps: 2, diff: 1, tracks: ['city'],                                mult: 1.0 },
  { name: 'HOT LAP',         col: 0xffd166, css: '#ffd166', laps: 2, diff: 1, tracks: ['city', 'bridge', 'beach'],             mult: 1.6 },
  { name: 'ELITE CHALLENGE', col: 0xff9a2f, css: '#ff9a2f', laps: 3, diff: 2, tracks: ['bridge', 'beach', 'jungle', 'kaduna'], mult: 2.4 },
  { name: 'LEGENDARY RACE',  col: 0xb44df0, css: '#b44df0', laps: 3, diff: 2, tracks: ['obudu', 'mega', 'kaduna'],             mult: 3.6 }
];

export function createAdventure(canvasTex, ctx) {
  const group = new THREE.Group(); group.visible = false;
  const S = { heat: 0, freeT: 0, bust: 0, slow: 0, env: 'day', near: null, navD: 0, navA: 0, nextIn: 5, police: 0 };
  let retPos = null, cashPend = 0, cashT = 0, lowT = 0, hadPolice = false, sirT = 0, sirHi = false, spawnCd = 0, tG = 0;
  const dummy = new THREE.Object3D();

  /* ---------- shared textures ---------- */
  const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const cell = Array.from({ length: 128 }, () => Math.random());
  const win = canvasTex(512, 512, g => {
    g.scale(2, 2); g.fillStyle = '#a8b4c2'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { const c = cell[y * 8 + x]; g.fillStyle = c < 0.2 ? '#ffe9a8' : c < 0.6 ? '#2e4256' : '#3d556b'; g.fillRect(x * 32 + 5, y * 16 + 3, 22, 10); }
  });
  const glow = canvasTex(512, 512, g => {
    g.scale(2, 2); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (cell[y * 8 + x] < 0.5) { g.fillStyle = '#ffd890'; g.fillRect(x * 32 + 5, y * 16 + 3, 22, 10); }
  });
  win.wrapS = win.wrapT = glow.wrapS = glow.wrapT = THREE.RepeatWrapping;

  /* ---------- ground ---------- */
  const asph = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#23262c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) { const v = (26 + Math.random() * 26) | 0; g.fillStyle = `rgba(${v},${v},${v + 4},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4); }
  });
  asph.wrapS = asph.wrapT = THREE.RepeatWrapping; asph.repeat.set(60, 60);
  const groundMat = new THREE.MeshStandardMaterial({ map: asph, roughness: 0.85, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  /* ---------- blocks: buildings, parks, sidewalks ---------- */
  const boxes = [], geos = [], sideGeos = [], parkGeos = [];
  for (let a = -KMAX; a < KMAX; a++) for (let b = -KMAX; b < KMAX; b++) {
    const cx = a * PITCH + PITCH / 2, cz = b * PITCH + PITCH / 2;
    const bw = PITCH - RW - 6;
    if (Math.random() < 0.14) { const sg = new THREE.BoxGeometry(bw, 0.24, bw); sg.translate(cx, 0.12, cz); parkGeos.push(sg); continue; }
    const sg = new THREE.BoxGeometry(bw, 0.22, bw); sg.translate(cx, 0.11, cz); sideGeos.push(sg);
    const central = 1 - clamp(Math.hypot(cx, cz) / (E * 1.15), 0, 1);
    const n = 1 + ((Math.random() * 2.4) | 0);
    for (let i = 0; i < n; i++) {
      const w = rand(20, 40), d = rand(20, 40);
      const h = clamp(rand(12, 30) + central * rand(12, 42), 12, 64);
      const bx = cx + rand(-1, 1) * (bw / 2 - w / 2 - 2), bz = cz + rand(-1, 1) * (bw / 2 - d / 2 - 2);
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) { const len = f < 2 ? d : w, vv = f < 4 ? h : d; for (let j = 0; j < 4; j++) { const q = f * 4 + j; uv.setXY(q, uv.getX(q) * len / 25.6, uv.getY(q) * vv / 57.6); } }
      const c = new THREE.Color().setHSL(rand(0.55, 0.63), rand(0.04, 0.26), rand(0.55, 0.9)), col = new Float32Array(72);
      for (let q = 0; q < 24; q++) col.set([c.r, c.g, c.b], q * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.translate(bx, h / 2, bz); geos.push(g);
      boxes.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h });
    }
  }
  /* landmark towers (still flyable-over at max altitude, barely) */
  for (let i = 0; i < 6; i++) {
    const a = ((Math.random() * 5) | 0) - 2, b = ((Math.random() * 5) | 0) - 2;
    const w = rand(30, 42), d = rand(30, 42), h = rand(76, 88);
    const bx = a * PITCH + PITCH / 2, bz = b * PITCH + PITCH / 2;
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) { const len = f < 2 ? d : w, vv = f < 4 ? h : d; for (let j = 0; j < 4; j++) { const q = f * 4 + j; uv.setXY(q, uv.getX(q) * len / 25.6, uv.getY(q) * vv / 57.6); } }
    const c = new THREE.Color().setHSL(0.58, 0.2, 0.8), col = new Float32Array(72);
    for (let q = 0; q < 24; q++) col.set([c.r, c.g, c.b], q * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(bx, h / 2, bz); geos.push(g);
    boxes.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h });
  }
  const bldMat = new THREE.MeshStandardMaterial({ map: win, vertexColors: true, roughness: 0.5, metalness: 0.15, emissiveMap: glow, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0 });
  if (geos.length) { const city = new THREE.Mesh(mergeGeometries(geos), bldMat); city.castShadow = city.receiveShadow = true; group.add(city); }
  if (sideGeos.length) { const sm = new THREE.Mesh(mergeGeometries(sideGeos), new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.95 })); sm.receiveShadow = true; group.add(sm); }
  if (parkGeos.length) { const pm = new THREE.Mesh(mergeGeometries(parkGeos), new THREE.MeshStandardMaterial({ color: 0x2c4a30, roughness: 1 })); pm.receiveShadow = true; group.add(pm); }

  /* collision grid: AABBs bucketed by block, 3x3 lookup */
  const grid = new Map();
  for (const b of boxes) {
    for (let gx = Math.floor(b.x0 / PITCH); gx <= Math.floor(b.x1 / PITCH); gx++)
      for (let gz = Math.floor(b.z0 / PITCH); gz <= Math.floor(b.z1 / PITCH); gz++) {
        const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b);
      }
  }
  function collide(o, r, alt) {
    let hit = null;
    const gx = Math.floor(o.x / PITCH), gz = Math.floor(o.z / PITCH);
    for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
      const list = grid.get(a + ',' + b); if (!list) continue;
      for (const bx of list) {
        if (bx.h <= alt + 0.4) continue;
        const cx = clamp(o.x, bx.x0, bx.x1), cz = clamp(o.z, bx.z0, bx.z1);
        const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        let nx, nz, depth;
        if (d2 < 1e-6) {
          const l = o.x - bx.x0, rr = bx.x1 - o.x, tt = o.z - bx.z0, bb = bx.z1 - o.z, m = Math.min(l, rr, tt, bb);
          if (m === l) { nx = -1; nz = 0; depth = l + r; } else if (m === rr) { nx = 1; nz = 0; depth = rr + r; }
          else if (m === tt) { nx = 0; nz = -1; depth = tt + r; } else { nx = 0; nz = 1; depth = bb + r; }
        } else { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; depth = r - d; }
        o.x += nx * depth; o.z += nz * depth;
        hit = { hit: true, nx, nz };
      }
    }
    return hit || { hit: false, nx: 0, nz: 0 };
  }

  /* ---------- street furniture: lane dashes, lamps, trees, skyline, barrier, neon ---------- */
  {
    const dash = []; for (let k = -KMAX; k <= KMAX; k++) for (let u = -E + 8; u <= E - 8; u += 11) {
      let nearI = false; for (let m = -KMAX; m <= KMAX; m++) if (Math.abs(u - m * PITCH) < RW / 2 + 3) { nearI = true; break; }
      if (nearI) continue; dash.push([k * PITCH - 2.2, u, 0], [k * PITCH + 2.2, u, 0], [u, k * PITCH - 2.2, 1], [u, k * PITCH + 2.2, 1]);
    }
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.03, 4), new THREE.MeshBasicMaterial({ color: 0x8b929c }), dash.length);
    dash.forEach(([x, z, hz], i) => { dummy.position.set(x, 0.03, z); dummy.rotation.set(0, hz ? Math.PI / 2 : 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); dm.setMatrixAt(i, dummy.matrix); });
    dm.frustumCulled = false; group.add(dm);
  }
  {
    const list = []; for (let k = -KMAX; k <= KMAX; k++) for (let u = -E + 20; u <= E - 20; u += PITCH) { list.push([k * PITCH - RW / 2 - 1, u], [u, k * PITCH + RW / 2 + 1]); }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 10, 6), new THREE.MeshStandardMaterial({ color: 0x8a919b }), list.length);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2), toneMapped: false }), list.length);
    list.forEach(([x, z], i) => {
      dummy.position.set(x, 5, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pole.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 10, z); dummy.updateMatrix(); head.setMatrixAt(i, dummy.matrix);
    });
    pole.castShadow = true; group.add(pole, head);
  }
  {
    const parkBlocks = [];
    for (let a = -KMAX; a < KMAX; a++) for (let b = -KMAX; b < KMAX; b++) { const cx = a * PITCH + PITCH / 2, cz = b * PITCH + PITCH / 2; if (!boxes.some(bx => bx.x0 > cx - 60 && bx.x0 < cx + 60 && bx.z0 > cz - 60 && bx.z0 < cz + 60)) parkBlocks.push([cx, cz]); }
    const NT = parkBlocks.length * 7;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.4, 5, 6), new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.95 }), Math.max(1, NT));
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 3.6, 7), new THREE.MeshStandardMaterial({ color: 0x256b38, roughness: 0.9 }), Math.max(1, NT));
    let n = 0;
    parkBlocks.forEach(([cx, cz]) => { for (let i = 0; i < 7; i++) { const sc = rand(0.9, 1.7); dummy.position.set(cx + rand(-40, 40), 2.4 * sc, cz + rand(-40, 40)); dummy.rotation.set(0, rand(0, 6.28), 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); trunk.setMatrixAt(n, dummy.matrix); dummy.position.y += 3.4 * sc; dummy.updateMatrix(); crown.setMatrixAt(n, dummy.matrix); n++; } });
    trunk.count = crown.count = n; trunk.castShadow = true; group.add(trunk, crown);
  }
  {
    const sky = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 1 }), 44);
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * Math.PI * 2, r = rand(1020, 1450), h = rand(60, 170), w = rand(40, 90);
      dummy.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); dummy.rotation.set(0, rand(0, 6.28), 0); dummy.scale.set(w, h, rand(40, 90)); dummy.updateMatrix();
      sky.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); group.add(sky);
  }
  {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.8 }), stripeMat = new THREE.MeshStandardMaterial({ color: 0xe0762a, roughness: 0.8 });
    [[0, -E, 0], [0, E, 0], [-E, 0, 1], [E, 0, 1]].forEach(([x, z, rot]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(rot ? 1.4 : 2 * E + 4, 2.1, rot ? 2 * E + 4 : 1.4), wallMat);
      wall.position.set(x, 1.05, z); group.add(wall);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(rot ? 1.5 : 2 * E + 4, 0.4, rot ? 2 * E + 4 : 1.5), stripeMat);
      stripe.position.set(x, 1.9, z); group.add(stripe);
    });
  }
  const neonGroup = new THREE.Group(); neonGroup.visible = false; group.add(neonGroup);
  {
    const NC = [0x2de2ff, 0xff2dd8, 0xff9a2f, 0x9dff2f, 0x2d6bff];
    for (let n = 0; n < 26; n++) {
      const bx = boxes[(Math.random() * boxes.length) | 0]; if (!bx) break;
      const col = NC[n % NC.length], w = rand(5, 12), h2 = rand(0.7, 2.4);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h2), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, side: THREE.DoubleSide }));
      const sx = Math.random() < 0.5 ? bx.x0 - 0.3 : bx.x1 + 0.3, sz = rand(bx.z0, bx.z1);
      sign.position.set(sx, rand(6, Math.min(40, bx.h - 2)), sz);
      sign.rotation.y = sx < bx.x0 + 1 ? Math.PI / 2 : -Math.PI / 2;
      neonGroup.add(sign);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      halo.scale.set(w * 3, w * 3, 1); halo.position.copy(sign.position); neonGroup.add(halo);
    }
  }

  /* ---------- civilian traffic (grid streets) ---------- */
  const traffic = [];
  function trafficPos(t) {
    if (t.dir === 0) return { x: t.k * PITCH - 4.5, z: t.u, hx: 0, hz: 1 };
    if (t.dir === 2) return { x: t.k * PITCH + 4.5, z: t.u, hx: 0, hz: -1 };
    if (t.dir === 1) return { x: t.u, z: t.k * PITCH + 4.5, hx: 1, hz: 0 };
    return { x: t.u, z: t.k * PITCH - 4.5, hx: -1, hz: 0 };
  }
  function streetSpot(minD, maxD, px, pz) {
    for (let t = 0; t < 30; t++) {
      const k = ((Math.random() * (2 * KMAX + 1)) | 0) - KMAX, along = rand(-E + 20, E - 20), vert = Math.random() < 0.5;
      const x = vert ? k * PITCH : along, z = vert ? along : k * PITCH;
      const d = Math.hypot(x - px, z - pz);
      if (d >= minD && d <= maxD) return { k, along, vert };
    }
    return { k: 0, along: rand(-E, E), vert: true };
  }
  function initTrafficCar(t, px, pz, minD, maxD) {
    const sp = streetSpot(minD, maxD, px, pz);
    t.k = sp.k; t.dir = sp.vert ? (Math.random() < 0.5 ? 0 : 2) : (Math.random() < 0.5 ? 1 : 3);
    t.u = sp.along; t.speed = 0; t.stun = rand(0, 1.5);
    t.base = t.kind === 'danfo' ? rand(8, 12) : t.kind === 'taxi' ? rand(10, 14) : t.kind === 'keke' ? rand(7, 10) : rand(8, 11);
  }
  [['danfo', 7], ['taxi', 7], ['keke', 6], ['van', 6]].forEach(([kind, cnt]) => {
    for (let i = 0; i < cnt; i++) {
      const mesh = kind === 'danfo' ? ctx.mkDanfo() : kind === 'taxi' ? ctx.mkTaxi() : kind === 'van' ? ctx.mkVan() : ctx.mkKeke();
      mesh.visible = false; group.add(mesh);
      const t = { mesh, kind, k: 0, dir: 0, u: 0, speed: 0, base: 10, stun: 0, latX: 0, latZ: 0 };
      traffic.push(t);
    }
  });
  function trafficTick(dt, px, pz) {
    for (const t of traffic) {
      if (t.stun > 0) { t.stun -= dt; continue; }
      const sg = t.dir === 0 || t.dir === 1 ? 1 : -1;
      const pu = t.u;
      t.speed += (t.base - t.speed) * Math.min(1, dt * 1.4);
      t.u += sg * t.speed * dt;
      /* intersection: maybe turn onto the crossing street */
      const lo = Math.min(pu, t.u), hi = Math.max(pu, t.u);
      for (let m = -KMAX; m <= KMAX; m++) {
        const c = m * PITCH;
        if (c > lo && c <= hi && Math.random() < 0.35) {
          const before = trafficPos(t);
          t.dir = (t.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
          t.k = clamp(m, -KMAX, KMAX);
          t.u = (t.dir === 0 || t.dir === 2) ? before.z : before.x; /* new moving coord = old position along the new axis */
          break;
        }
      }
      if (Math.abs(t.u) > E - 12) { t.dir = (t.dir + 2) % 4; t.u = clamp(t.u, -E + 12, E - 12); }
      /* far away: recycle near the player */
      const gp = trafficPos(t);
      if (Math.hypot(gp.x - px, gp.z - pz) > 210) { initTrafficCar(t, px, pz, 80, 170); }
      const g2 = trafficPos(t);
      t.mesh.visible = group.visible;
      t.mesh.position.set(g2.x, 0.02, g2.z);
      t.mesh.rotation.set(0, Math.atan2(g2.hx, g2.hz), 0);
    }
  }

  /* ---------- smashables (cones & barrels at street edges) ---------- */
  const SM = [], SM_N = 240;
  const coneGeo = mergeGeometries([new THREE.ConeGeometry(0.26, 0.7, 10).translate(0, 0.4, 0), new THREE.BoxGeometry(0.6, 0.05, 0.6).translate(0, 0.025, 0)]);
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10).translate(0, 0.5, 0);
  const smCone = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.5 }), SM_N);
  const smBarrel = new THREE.InstancedMesh(barrelGeo, new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.5, metalness: 0.3 }), SM_N);
  smCone.frustumCulled = smBarrel.frustumCulled = false; group.add(smCone, smBarrel);
  for (let i = 0; i < SM_N; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const k = ((Math.random() * (2 * KMAX + 1)) | 0) - KMAX, along = rand(-E + 14, E - 14), vert = Math.random() < 0.5;
      let nearI = false; for (let m = -KMAX; m <= KMAX; m++) if (Math.abs(along - m * PITCH) < RW / 2 + 4) { nearI = true; break; }
      if (nearI) continue;
      const side = Math.random() < 0.5 ? -1 : 1, off = RW / 2 + rand(1.2, 3);
      const x = vert ? k * PITCH + side * off : along, z = vert ? along : k * PITCH + side * off;
      const barrel = Math.random() < 0.3;
      SM.push({ x, z, barrel, dead: false, t: 0 });
      break;
    }
  }
  function smWrite() {
    let ci = 0, bi = 0;
    for (const s of SM) {
      dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(s.dead ? 0 : 1); dummy.updateMatrix();
      if (s.barrel) smBarrel.setMatrixAt(bi++, dummy.matrix); else smCone.setMatrixAt(ci++, dummy.matrix);
    }
    smCone.count = ci; smBarrel.count = bi;
    smCone.instanceMatrix.needsUpdate = smBarrel.instanceMatrix.needsUpdate = true;
  }
  smWrite();

  /* ---------- race markers ---------- */
  const markers = [];
  const lblTexCache = {};
  function tierLabel(tier) {
    if (lblTexCache[tier]) return lblTexCache[tier];
    const t = TIERS[tier];
    const tx = canvasTex(256, 64, g => {
      g.fillStyle = 'rgba(6,10,18,.88)'; g.fillRect(0, 0, 256, 64);
      g.strokeStyle = t.css; g.lineWidth = 5; g.strokeRect(3, 3, 250, 58);
      g.fillStyle = t.css; g.font = '900 26px Segoe UI,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t.name, 128, 34);
    });
    lblTexCache[tier] = tx; return tx;
  }
  function pickTier() {
    let tier = Math.min(3, Math.floor(S.freeT / 50));
    if (tier > 0 && Math.random() < 0.35) tier--;
    return tier;
  }
  function spawnMarker(px, pz) {
    const tier = pickTier(), T = TIERS[tier];
    for (let t = 0; t < 40; t++) {
      const kx = ((Math.random() * (2 * KMAX + 1)) | 0) - KMAX, kz = ((Math.random() * (2 * KMAX + 1)) | 0) - KMAX;
      const x = kx * PITCH, z = kz * PITCH;
      const d = Math.hypot(x - px, z - pz);
      if (d < 150 || d > 450) continue;
      if (markers.some(m => Math.hypot(m.x - x, m.z - z) < 180)) continue;
      const grp = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, 130, 12, 1, true), new THREE.MeshBasicMaterial({ color: T.col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      beam.position.y = 65; grp.add(beam);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 8, 40), new THREE.MeshBasicMaterial({ color: T.col, toneMapped: false, fog: false }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; grp.add(ring);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: T.col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      halo.scale.set(18, 18, 1); halo.position.y = 3.2; grp.add(halo);
      const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tierLabel(tier), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      lbl.scale.set(15, 3.8, 1); lbl.position.y = 11; grp.add(lbl);
      grp.position.set(x, 0, z); group.add(grp);
      const track = T.tracks[(Math.random() * T.tracks.length) | 0];
      markers.push({ grp, beam, ring, x, z, tier, ttl: 100, track });
      return;
    }
  }
  function removeMarker(i) {
    const m = markers[i];
    group.remove(m.grp);
    m.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    markers.splice(i, 1);
  }

  /* ---------- police ---------- */
  const POL = [];
  for (let i = 0; i < 4; i++) {
    const grp = ctx.mkPolice();
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.25), toneMapped: false }));
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.6, 4), toneMapped: false }));
    barR.position.set(-0.32, 1.86, 0.1); barB.position.set(0.32, 1.86, 0.1); grp.add(barR, barB);
    const haloR = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3030, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const haloB = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3a6bff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    haloR.scale.set(5, 5, 1); haloB.scale.set(5, 5, 1); haloR.position.set(-0.3, 2.3, 0); haloB.position.set(0.3, 2.3, 0);
    grp.add(haloR, haloB);
    grp.visible = false; group.add(grp);
    POL.push({ grp, barR, barB, haloR, haloB, on: false, x: 0, z: 0, h: 0, speed: 0, stuck: 0, ramCd: 0 });
  }
  const polOn = p => { p.on = true; p.grp.visible = true; };
  const polOff = p => { p.on = false; p.grp.visible = false; };

  function busted() {
    const money = ctx.economy.money || 0;
    const amt = Math.min(money, Math.min(5000, 300 + Math.round(S.heat * 40)));
    if (amt > 0) ctx.busted(amt); else ctx.busted(0);
    S.heat = 20; S.freeT = 0; S.bust = 0; S.slow = 7;
    POL.forEach(polOff); hadPolice = false; lowT = 0;
  }

  /* ---------- minimap base (pre-rendered once) ---------- */
  const base = document.createElement('canvas'); base.width = base.height = 512;
  {
    const g = base.getContext('2d'), span = 2 * (E + 60), s = 512 / span, off = E + 60;
    const W2B = (x, z) => [(x + off) * s, (z + off) * s];
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#141d2e';
    for (let a = -KMAX; a < KMAX; a++) for (let b = -KMAX; b < KMAX; b++) {
      const cx = a * PITCH + PITCH / 2, cz = b * PITCH + PITCH / 2, bw = PITCH - RW;
      const [x, y] = W2B(cx - bw / 2, cz - bw / 2); g.fillRect(x, y, bw * s, bw * s);
    }
    g.strokeStyle = '#2b3a52'; g.lineWidth = RW * s; g.lineCap = 'butt';
    for (let k = -KMAX; k <= KMAX; k++) {
      let [x1, y1] = W2B(k * PITCH, -E), [x2, y2] = W2B(k * PITCH, E);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      [x1, y1] = W2B(-E, k * PITCH); [x2, y2] = W2B(E, k * PITCH);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.strokeStyle = '#ff9a2f'; g.lineWidth = 3; g.strokeRect(1, 1, 510, 510);
  }
  function drawMini(mc, w, h, pos, hdg) {
    const half = 420, s = 512 / (2 * (E + 60));
    mc.clearRect(0, 0, w, h);
    const cw = half * 2 * s;
    const bx = clamp((pos.x + E + 60) * s - cw / 2, 0, 512 - cw), by = clamp((pos.z + E + 60) * s - cw / 2, 0, 512 - cw);
    mc.drawImage(base, bx, by, cw, cw, 0, 0, w, h);
    const P2S = (x, z) => [(x - pos.x) / half * (w / 2) + w / 2, (z - pos.z) / half * (h / 2) + h / 2];
    for (const m of markers) {
      const [x, y] = P2S(m.x, m.z); if (x < 4 || x > w - 4 || y < 4 || y > h - 4) continue;
      mc.fillStyle = TIERS[m.tier].css; mc.beginPath(); mc.arc(x, y, 6, 0, 7); mc.fill();
      mc.strokeStyle = '#fff'; mc.lineWidth = 2; mc.stroke();
    }
    const flash = (performance.now() * 0.004 | 0) % 2 === 0;
    for (const p of POL) {
      if (!p.on) continue;
      const [x, y] = P2S(p.x, p.z); if (x < 4 || x > w - 4 || y < 4 || y > h - 4) continue;
      mc.fillStyle = flash ? '#ff4040' : '#3a6bff'; mc.beginPath(); mc.arc(x, y, 5.5, 0, 7); mc.fill();
      mc.strokeStyle = '#000'; mc.lineWidth = 2; mc.stroke();
    }
    mc.save(); mc.translate(w / 2, h / 2); mc.rotate(Math.PI - hdg);
    mc.fillStyle = '#fff'; mc.beginPath(); mc.moveTo(0, -9); mc.lineTo(6.5, 7); mc.lineTo(0, 3.6); mc.lineTo(-6.5, 7); mc.closePath(); mc.fill();
    mc.strokeStyle = '#3cf'; mc.lineWidth = 2.5; mc.stroke(); mc.restore();
  }

  /* ---------- env hook ---------- */
  function setEnv(e, wet) {
    bldMat.emissiveIntensity = e.glow * 1.4;
    bldMat.roughness = wet ? 0.22 : 0.5; bldMat.metalness = wet ? 0.5 : 0.15;
    groundMat.roughness = wet ? 0.3 : 0.85; groundMat.metalness = wet ? 0.4 : 0;
    neonGroup.visible = e.glow > 0.5;
  }

  /* ---------- lifecycle ---------- */
  function flushCash() { if (cashPend > 0) { ctx.economy.add(cashPend); cashPend = 0; } cashT = 0; }
  function enter(env, resume) {
    S.env = env;
    flushCash();
    POL.forEach(polOff);
    S.bust = 0; S.near = null; hadPolice = false; lowT = 0; sirT = 0;
    if (!resume) {
      S.heat = 0; S.freeT = 0; S.slow = 0; S.nextIn = 5; retPos = null;
      while (markers.length) removeMarker(0);
    }
    return retPos || { x: 3, z: 0, h: 0 };
  }
  function raceStart() {
    if (S.near) { const i = markers.findIndex(m => m.x === S.near.x && m.z === S.near.z); if (i >= 0) removeMarker(i); }
    S.near = null; S.bust = 0;
    POL.forEach(polOff); hadPolice = false;
    flushCash();
  }
  function saveReturn(x, z, h) { retPos = { x, z, h }; }
  function nearestStreet(pos) {
    const kx = clamp(Math.round(pos.x / PITCH), -KMAX, KMAX) * PITCH, kz = clamp(Math.round(pos.z / PITCH), -KMAX, KMAX) * PITCH;
    if (Math.abs(pos.x - kx) < Math.abs(pos.z - kz)) return { x: kx, z: clamp(pos.z, -E + 12, E - 12) };
    return { x: clamp(pos.x, -E + 12, E - 12), z: kz };
  }
  function crash(impact) { S.heat = clamp(S.heat + clamp(impact * 0.55, 6, 18), 0, 100); }
  function leave() { flushCash(); S.near = null; }

  /* ---------- main tick ---------- */
  function tick(dt, o) {
    tG += dt;
    const Pp = ctx.pPos(), Pv = ctx.pVel();
    const px = Pp.x, pz = Pp.z, sp = o.sp, alt = o.alt, slip = o.slip;
    S.freeT += dt;
    if (S.slow > 0) S.slow = Math.max(0, S.slow - dt);

    /* heat */
    let dh = 0;
    if (sp > 70 && alt < 3) dh += 2.6;
    if (Math.abs(slip) > 4.5 && sp > 20 && alt < 3) {
      for (const t of traffic) { const gp = trafficPos(t); if (Math.hypot(gp.x - px, gp.z - pz) < 12) { dh += 12; break; } }
    }
    if (dh > 0) S.heat += dh * dt;
    else S.heat += (alt > 6 ? -7 : sp < 45 ? -5 : -2) * dt;
    S.heat = clamp(S.heat, 0, 100);

    /* markers */
    S.nextIn -= dt;
    if (S.nextIn <= 0) {
      if (markers.length < 3) spawnMarker(px, pz);
      S.nextIn = rand(20, 40);
    }
    S.near = null; S.navD = 0; S.navA = 0;
    let bestD = 1e9, bestM = null;
    for (let i = markers.length - 1; i >= 0; i--) {
      const m = markers[i];
      m.ttl -= dt;
      if (m.ttl <= 0) { removeMarker(i); continue; }
      m.ring.rotation.z += dt * 2.2;
      m.beam.material.opacity = (m.ttl < 12 ? (Math.sin(tG * 9) > 0 ? 0.5 : 0.12) : 0.3 + Math.sin(tG * 3) * 0.12);
      const d = Math.hypot(m.x - px, m.z - pz);
      if (d < 16) S.near = { ...TIERS[m.tier], x: m.x, z: m.z, track: m.track, sub: `${TIERS[m.tier].laps} LAPS · ${['EASY', 'NORMAL', 'HARD'][TIERS[m.tier].diff]} · ${ctx.trackName(m.track)}` };
      else if (d < bestD) { bestD = d; bestM = m; }
    }
    if (!S.near && bestM) {
      S.navD = bestD;
      S.navA = -angDiff(Math.atan2(bestM.x - px, bestM.z - pz), o.h);
    }
    /* traffic */
    trafficTick(dt, px, pz);
    /* player vs traffic */
    if (alt < 3) for (const t of traffic) {
      const gp = trafficPos(t);
      const dx = px - gp.x, dz = pz - gp.z, d2 = dx * dx + dz * dz;
      if (d2 > 10.2) continue;
      const d = Math.max(0.01, Math.sqrt(d2)), nx = dx / d, nz = dz / d;
      Pp.x += nx * (3.2 - d); Pp.z += nz * (3.2 - d);
      const vo = Pv.x * nx + Pv.z * nz;
      if (vo < 0) { Pv.x -= nx * vo * 1.4; Pv.z -= nz * vo * 1.4; Pv.multiplyScalar(0.72); }
      t.stun = 2.6;
      S.heat = clamp(S.heat + 14, 0, 100);
      ctx.shake(0.6); ctx.puff(Pp, 1.4); ctx.thud();
      break;
    }
    /* smashables */
    if (sp > 6 && alt < 3) for (const s of SM) {
      if (s.dead) { s.t -= dt; if (s.t <= 0) { s.dead = false; smWrite(); } continue; }
      const dx = px - s.x, dz = pz - s.z;
      if (dx * dx + dz * dz < 5.2) {
        s.dead = true; s.t = rand(25, 45); smWrite();
        cashPend += 10; ctx.nitroAdd(0.03); ctx.puff(Pp, 1); ctx.beep(520, 0.05, 'square', 0.05);
      }
    }
    cashT += dt; if (cashT > 4) flushCash();

    /* police */
    const wanted = S.heat >= 85 ? 3 : S.heat >= 65 ? 2 : S.heat >= 40 ? 1 : 0;
    spawnCd -= dt;
    const active = POL.filter(p => p.on);
    if (active.length < wanted && spawnCd <= 0) {
      const p = POL.find(q => !q.on);
      if (p) {
        const sp2 = streetSpot(140, 260, px, pz);
        p.x = sp2.vert ? sp2.k * PITCH : sp2.along; p.z = sp2.vert ? sp2.along : sp2.k * PITCH;
        p.h = Math.atan2(px - p.x, pz - p.z); p.speed = 22; p.stuck = 0; p.ramCd = 0;
        polOn(p); hadPolice = true; spawnCd = 2.2;
        ctx.toast('POLICE CHASING YOU!', '#ff6b6b');
      }
    }
    let anyClose = false, nearCop = 1e9;
    const top = ctx.getTop();
    for (const p of POL) {
      if (!p.on) continue;
      const dx = px - p.x, dz = pz - p.z, dist = Math.hypot(dx, dz);
      if (dist > 320 || (wanted === 0 && S.heat < 15)) { polOff(p); continue; }
      const want = Math.atan2(dx, dz), rate = 2.6 / (1 + Math.abs(p.speed) / 55);
      p.h += clamp(angDiff(want, p.h), -rate * dt, rate * dt);
      const ptop = top * 0.9 * (dist > 70 ? 1.18 : 1);
      p.speed += (ptop - p.speed) * Math.min(1, dt * 1.3);
      if (p.speed < 8 && dist > 14) { p.stuck += dt; if (p.stuck > 1.2) { p.h += (Math.random() < 0.5 ? 1 : -1) * rand(1.4, 2.4); p.stuck = 0; p.speed = -9; } }
      else p.stuck = Math.max(0, p.stuck - dt);
      p.x += Math.sin(p.h) * p.speed * dt; p.z += Math.cos(p.h) * p.speed * dt;
      const hit = collide(p, 1.9, 0);
      if (hit.hit) { p.speed *= 0.4; p.h += rand(-0.5, 0.5); }
      p.ramCd -= dt;
      p.grp.position.set(p.x, 0.02, p.z); p.grp.rotation.y = p.h;
      const flash = (tG * 4 | 0) % 2 === 0;
      p.barR.visible = flash; p.barB.visible = !flash;
      p.haloR.material.opacity = flash ? 0.75 : 0.08; p.haloB.material.opacity = flash ? 0.08 : 0.75;
      nearCop = Math.min(nearCop, dist);
      if (dist < 10 && alt < 3) anyClose = true;
      if (dist < 3.8 && alt < 3 && p.ramCd <= 0) {
        p.ramCd = 0.8; S.bust += 0.8;
        const nx = dx / Math.max(0.01, dist), nz = dz / Math.max(0.01, dist);
        ctx.onRam(nx, nz, 7); ctx.puff(Pp, 1.6);
      }
    }
    S.police = POL.filter(p => p.on).length;
    if (anyClose) S.bust += dt; else S.bust = Math.max(0, S.bust - dt * 0.5);
    if (S.bust >= 3) busted();
    if (S.heat < 15) { lowT += dt; if (lowT > 6) { POL.forEach(polOff); lowT = 0; } } else lowT = 0;
    if (hadPolice && S.police === 0 && S.heat < 10) { hadPolice = false; ctx.escape(); }
    /* siren */
    if (S.police > 0 && nearCop < 200) {
      sirT -= dt;
      if (sirT <= 0) { sirT = 0.45; sirHi = !sirHi; ctx.beep(sirHi ? 900 : 760, 0.2, 'square', clamp(1 - nearCop / 200, 0.1, 1) * 0.07); }
    }
  }
  return { group, E, S, tick, collide, crash, drawMini, setEnv, enter, raceStart, saveReturn, nearestStreet, leave, markers, traffic };
}

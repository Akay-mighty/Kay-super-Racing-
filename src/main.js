import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCarGeometry, SPORT } from './car-geometry.js';
import { vehicleContact, resolveVehicleContact } from './vehicle-physics.js';
import { touch } from './touch.js';
import { createArena } from './arena.js';
import { CARS, getCar, carGeo, tintPart } from './cars-data.js';
import { economy } from './economy.js';
import { missionsInit, missionEvent, missionState, missionsCompleted, MISSIONS } from './missions.js';
import { cloud } from './cloud.js';
import { net } from './net.js';
import { GhostRec, makeGhostCar } from './ghost.js';
import { colorize } from './carcolor.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let TOTAL = 3;
const W = 13, N = 700, WALL = W + 2.6;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const mobile = matchMedia('(any-pointer: coarse)').matches;
let pr = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
scene.fog = new THREE.Fog(0xcfe0f0, 260, 1500);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 1, 2800);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.35, 2.2);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

/* ---------- WebGL context-loss recovery ----------
   Mobile browsers (Chrome Android) kill the GL context when memory runs low
   (many tabs / apps, low battery). three.js then silently stops drawing:
   HUD keeps updating but the 3D canvas goes blank. We detect it, pause the
   race, show a recovery overlay, and auto-reload if the driver never comes
   back. We also lower the GPU budget on mobile so the kill is less likely. */
let glLost = false, glWatch = 0;
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  if (glLost) return; glLost = true;
  if (state === 'race' || state === 'count') pause();
  show('glFix', true); const t = $('glT'); if (t) t.textContent = '7';
  let n = 7; clearInterval(glWatch);
  glWatch = setInterval(() => {
    if (--n <= 0) { clearInterval(glWatch); store.set('sr.glfix', 1); location.reload(); }
    else { const t2 = $('glT'); if (t2) t2.textContent = String(n); }
  }, 1000);
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  if (!glLost) return; glLost = false; clearInterval(glWatch);
  show('glFix', false);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  last = performance.now();
  toast('GRAPHICS RESTORED', '#8df');
});

const canvasTex = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
};

/* ---------- sky, light ---------- */
const skyTex = canvasTex(2, 256, () => {});
function drawSky(stops) {
  const g = skyTex.image.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, 2, 256); skyTex.needsUpdate = true;
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, map: skyTex }));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false });
{
  const sp = []; for (let i = 0; i < (mobile ? 280 : 600); i++) { const a = rand(0, 6.283), e = rand(0.05, 1.3), r = 2300; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)), starMat); stars.frustumCulled = false; sky.add(stars);
}
const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({
  map: canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.85)'); gr.addColorStop(0.4, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
  color: 0xfff3d6, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false
}));
sunSpr.scale.set(560, 560, 1); sky.add(sunSpr);
{
}
scene.add(sky);
const cloudTex = canvasTex(128, 64, (g, w, h) => {
  for (let i = 0; i < 9; i++) {
    const x = rand(30, 98), y = rand(24, 40), r = rand(14, 26), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
});
const clouds = [];
for (let i = 0; i < (mobile ? 22 : 46); i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
  const a = rand(0, 6.283), r = rand(1000, 2000);
  s.position.set(Math.cos(a) * r, rand(180, 520), Math.sin(a) * r); s.scale.set(rand(380, 700), rand(160, 260), 1);
  scene.add(s); clouds.push(s);
}
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x607080, 1.1);
scene.add(hemi);
const sunOff = V3(120, 200, 80);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 500 });
scene.add(sun, sun.target);

const trackStart = scene.children.length;
/* ---------- track ---------- */
const CP = [[0,0,-300],[0,0,0],[10,0,250],[120,6,450],[330,14,540],[560,22,500],[700,24,350],[690,18,120],[560,10,-60],[560,4,-260],[640,0,-440],[540,0,-600],[320,0,-640],[140,0,-560],[40,0,-460]];
const curve = new THREE.CatmullRomCurve3(CP.map(p => V3(...p)), true, 'centripetal');
const pts = curve.getSpacedPoints(N).slice(0, N);
const ds = curve.getLength() / N;
const tan = pts.map((_, i) => pts[(i + 1) % N].clone().sub(pts[(i - 1 + N) % N]).normalize());
const right = tan.map(t => V3(-t.z, 0, t.x).normalize());
const curv = tan.map((t, i) => Math.acos(clamp(t.dot(tan[(i + 8) % N]), -1, 1)));

function strip(oa, ya, ob, yb, col, shadow = true) {
  const pos = [], cl = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N, c = pts[k], r = right[k], q = col(i);
    pos.push(c.x + r.x * oa, c.y + ya, c.z + r.z * oa, c.x + r.x * ob, c.y + yb, c.z + r.z * ob);
    cl.push(q.r, q.g, q.b, q.r, q.g, q.b);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }));
  m.receiveShadow = shadow; scene.add(m); return m;
}
const C = s => new THREE.Color(s);
const asph = [C('#34363c'), C('#3a3c42')], rw = [C('#e8e8ea'), C('#d42a2a')], wallC = [C('#c9ccd2'), C('#b8bcc4')];
const roadStrip = strip(-W, 0, W, 0, i => asph[(i >> 3) & 1]);
strip(W, 0.08, W + 2.6, 0.08, i => rw[i & 1]);
strip(-W - 2.6, 0.08, -W, 0.08, i => rw[i & 1]);
strip(WALL, 0, WALL, 1.5, i => wallC[(i >> 2) & 1]);
strip(-WALL, 0, -WALL, 1.5, i => wallC[(i >> 2) & 1]);
strip(WALL, 1.5, WALL + 0.5, 1.5, () => C('#e9ecf1'));
strip(-WALL - 0.5, 1.5, -WALL, 1.5, () => C('#e9ecf1'));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x4d5864, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -2; ground.receiveShadow = true; scene.add(ground);

const dummy = new THREE.Object3D();
{ // lane dashes
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.03, ds * 1.3), new THREE.MeshBasicMaterial({ color: 0xdddddd }), N / 4);
  for (let i = 0, n = 0; i < N; i += 4, n++) {
    dummy.position.copy(pts[i]).y += 0.1; dummy.lookAt(dummy.position.clone().add(tan[i])); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix);
  }
  scene.add(m);
}
{ // pillars under elevated road
  const list = []; for (let i = 0; i < N; i += 10) if (pts[i].y > 2) list.push(i);
  const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.3, 1.8, 1, 10), new THREE.MeshStandardMaterial({ color: 0x9aa3ad }), list.length);
  list.forEach((i, n) => { const h = pts[i].y + 1.8; dummy.position.set(pts[i].x, -2 + h / 2, pts[i].z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix); });
  dummy.scale.set(1, 1, 1); scene.add(m);
}

let cityMat;
/* city: one merged mesh, window UVs scaled to real building size */
{
  const cell = Array.from({ length: 128 }, () => Math.random());
  const win = canvasTex(512, 512, g => {
    g.scale(2, 2); g.fillStyle = '#aab8c6'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { const c = cell[y * 8 + x]; g.fillStyle = c < 0.2 ? '#ffe9a8' : (c < 0.6 ? '#2e4256' : '#3d556b'); g.fillRect(x * 32 + 5, y * 16 + 3, 22, 10); }
  });
  const glow = canvasTex(512, 512, g => {
    g.scale(2, 2); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (cell[y * 8 + x] < 0.5) { g.fillStyle = '#ffd890'; g.fillRect(x * 32 + 5, y * 16 + 3, 22, 10); }
  });
  glow.wrapS = glow.wrapT = THREE.RepeatWrapping;
  win.wrapS = win.wrapT = THREE.RepeatWrapping;
  const geos = []; let n = 0, tries = 0;
  while (n < 460 && tries++ < 20000) {
    const k = (Math.random() * N) | 0, side = Math.random() < 0.5 ? -1 : 1, off = rand(45, 380);
    const p = pts[k].clone().addScaledVector(right[k], side * off).addScaledVector(tan[k], rand(-30, 30));
    let ok = true; for (let j = 0; j < N; j += 2) { const dx = p.x - pts[j].x, dz = p.z - pts[j].z; if (dx * dx + dz * dz < 1500) { ok = false; break; } }
    if (!ok) continue;
    const w = rand(22, 55), d = rand(22, 55), h = rand(35, 90) * (off < 140 ? 1 : rand(1.2, 3.2));
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) { const len = f < 2 ? d : w, vv = f < 4 ? h : d; for (let j = 0; j < 4; j++) { const i = f * 4 + j; uv.setXY(i, uv.getX(i) * len / 25.6, uv.getY(i) * vv / 57.6); } }
    const c = new THREE.Color().setHSL(rand(0.54, 0.62), rand(0.04, 0.3), rand(0.6, 0.95)), col = new Float32Array(72);
    for (let i = 0; i < 24; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.rotateY(rand(0, 0.3)); g.translate(p.x, -2 + h / 2, p.z); geos.push(g); n++;
  }
  const city = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: win, vertexColors: true, roughness: 0.45, metalness: 0.2, emissiveMap: glow, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0 }));
  city.castShadow = city.receiveShadow = true; scene.add(city); cityMat = city.material;
}

/* billboards */
{
  const mk = (a, b, txt) => canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'italic 900 52px Segoe UI,Arial'; g.textAlign = 'center'; g.fillText(txt, w / 2, h / 2 + 18);
  });
  const texs = [mk('#ff2d78', '#ffb347', 'NITRO'), mk('#00c6ff', '#6a11cb', 'KAY'), mk('#f7971e', '#ffd200', 'TURBO'), mk('#11998e', '#38ef7d', 'DRIFT')];
  [45, 130, 215, 310, 400, 640].forEach((k, n) => {
    const side = n % 2 ? 1 : -1, g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: texs[n % 4], toneMapped: false, side: THREE.DoubleSide }));
    board.position.y = 17;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 18, 8), new THREE.MeshStandardMaterial({ color: 0x778 })); pole.position.y = 8;
    g.add(board, pole); g.position.copy(pts[k]).addScaledVector(right[k], side * (WALL + 14)); g.lookAt(pts[k].x, g.position.y, pts[k].z); scene.add(g);
  });
}

/* tunnel with glowing rings */
{
  const t0 = Math.round(N * 0.52), t1 = Math.round(N * 0.6), up = V3(0, 3, 0);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(t0, t1).map(p => p.clone().add(up))), 60, 17, 20, false), new THREE.MeshStandardMaterial({ color: 0x06070b, side: THREE.BackSide, roughness: 1 })));
  const geo = new THREE.TorusGeometry(15.6, 0.3, 8, 48), mats = [new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), toneMapped: false }), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.2), toneMapped: false })];
  for (let k = t0 + 1, n = 0; k < t1; k += 2, n++) {
    const r = new THREE.Mesh(geo, mats[n % 3 === 2 ? 1 : 0]); r.position.copy(pts[k]).add(up); r.lookAt(r.position.clone().add(tan[k])); scene.add(r);
  }
}

/* start / finish */
{
  const yaw = Math.atan2(tan[0].x, tan[0].z);
  const chk = canvasTex(128, 32, g => { for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 16, 8, 16); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 3), new THREE.MeshBasicMaterial({ map: chk })); line.rotation.x = -Math.PI / 2;
  const gate = new THREE.Group(); gate.add(line); line.position.y = 0.14;
  const steel = new THREE.MeshStandardMaterial({ color: 0x20252d, metalness: 0.6, roughness: 0.4 });
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 13, 1.4), steel); p.position.set(sx * (W + 3.5), 6.5, 0); gate.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((W + 3.5) * 2 + 1.4, 3.2, 1.4), steel); beam.position.y = 13; gate.add(beam);
  const ban = new THREE.Mesh(new THREE.PlaneGeometry((W + 3.5) * 2, 2.6), new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#0b0f16'; g.fillRect(0, 0, w, h); g.fillStyle = '#3cf'; g.font = 'italic 900 40px Segoe UI,Arial'; g.textAlign = 'center'; g.fillText('START  /  FINISH', w / 2, 46); }) }));
  ban.position.set(0, 13, -0.75); ban.rotation.y = Math.PI; gate.add(ban);
  gate.position.copy(pts[0]); gate.rotation.y = yaw; scene.add(gate);
}

/* street lamps */
{
  const list = []; for (let i = 6; i < N; i += 14) for (const sd of [-1, 1]) list.push([i, sd]);
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 11, 6), new THREE.MeshStandardMaterial({ color: 0x8a919b }), list.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2), toneMapped: false }), list.length);
  list.forEach(([i, sd], n) => {
    const p = pts[i].clone().addScaledVector(right[i], sd * (WALL + 1.4));
    dummy.position.set(p.x, p.y + 5.5, p.z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pole.setMatrixAt(n, dummy.matrix);
    const q = p.clone().addScaledVector(right[i], -sd * 1.6);
    dummy.position.set(q.x, p.y + 11, q.z); dummy.lookAt(q.x + tan[i].x, p.y + 11, q.z + tan[i].z); dummy.updateMatrix(); head.setMatrixAt(n, dummy.matrix);
  });
  dummy.rotation.set(0, 0, 0); scene.add(pole, head);
}
/* grandstands at the start */
{
  const crowd = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#1d2128'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) { g.fillStyle = `hsl(${rand(0, 360) | 0} ${rand(18, 45) | 0}% ${rand(30, 58) | 0}%)`; g.fillRect(rand(0, w), rand(0, h), 3, 4); }
    g.fillStyle = 'rgba(0,0,0,.45)'; for (let y = 0; y < h; y += 14) g.fillRect(0, y, w, 2);
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.8 });
  for (const sd of [-1, 1]) {
    const c = sample(10), g = new THREE.Group(), base = c.p.clone().addScaledVector(c.r, sd * (WALL + 11));
    g.position.copy(base); g.lookAt(c.p.x, base.y, c.p.z);
    const seats = new THREE.Mesh(new THREE.PlaneGeometry(90, 14), new THREE.MeshStandardMaterial({ map: crowd, side: THREE.DoubleSide, roughness: 1 })); seats.position.y = 7; seats.rotation.x = -0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(90, 15, 1), dark); back.position.set(0, 7.5, -4);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(94, 0.7, 17), dark); roof.position.set(0, 15.5, -1);
    g.add(seats, back, roof); scene.add(g);
  }
}

/* boost pads: glowing chevrons on the tarmac, +nitro +small speed kick */
const padGroup = new THREE.Group(); scene.add(padGroup);
const PAD_STEP = Math.floor(N / 14);
const padIdx = []; for (let i = 26; i < N - 10; i += PAD_STEP) padIdx.push(i);
const padBaseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.7, 2.8), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const pads = padIdx.map((k, n) => {
  const lat = ((n % 3) - 1) * 3.4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7).rotateX(-Math.PI / 2), padBaseMat.clone());
  m.position.copy(pts[k]).addScaledVector(right[k], lat); m.position.y += 0.16;
  m.rotation.y = Math.atan2(tan[k].x, tan[k].z);
  m.userData = { cd: 0, flash: 0, k };
  padGroup.add(m); return m;
});
/* Night Circuit: extra pads — closer to the walls, smaller, more rewarding */
const padNightIdx = []; for (let i = 13; i < N - 10; i += Math.floor(N / 22)) padNightIdx.push(i);
const padsNight = padNightIdx.map((k, n) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4).rotateX(-Math.PI / 2), padBaseMat.clone());
  m.position.copy(pts[k]).addScaledVector(right[k], (n % 2 ? -1 : 1) * rand(6.2, 8.6)); m.position.y += 0.16;
  m.rotation.y = Math.atan2(tan[k].x, tan[k].z);
  m.userData = { cd: 0, flash: 0, k };
  m.visible = false; padGroup.add(m); return m;
});
const allPads = () => cfg.env === 'nightRain' ? pads.concat(padsNight) : pads;

const trackObjs = scene.children.slice(trackStart);

/* ---------- NIGHT CIRCUIT: neon signage (visible only in nightRain) ----------
   Cheap emissive planes + glow sprites facing the road; bloom does the rest. */
const neonGroup = new THREE.Group(); neonGroup.visible = false; scene.add(neonGroup);
/* NOTE: neonGroup is intentionally NOT in trackObjs — setEnv/resetWorld drive its visibility */
{
  const NC = [0x2de2ff, 0xff2dd8, 0xff9a2f, 0x9dff2f, 0x2d6bff];
  const glowTexN = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (let n = 0; n < 46; n++) {
    const k = (n * 17 + 7) % N, side = n % 2 ? 1 : -1, col = NC[n % NC.length];
    const base = pts[k].clone().addScaledVector(right[k], side * (WALL + rand(2.5, 16)));
    const hgt = rand(5, 42), w = rand(5, 13), h2 = rand(0.7, 2.6);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h2), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(base.x, base.y + hgt, base.z);
    sign.lookAt(pts[k].x, sign.position.y, pts[k].z);
    neonGroup.add(sign);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexN, color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.set(w * 3.2, w * 3.2, 1); halo.position.copy(sign.position);
    neonGroup.add(halo);
    /* wet-road reflection blob under each sign */
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexN, color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const rp = pts[k].clone().addScaledVector(right[k], side * rand(3, W - 2)); rp.y = pts[k].y + 0.06;
    refl.position.copy(rp); refl.rotation.y = Math.atan2(tan[k].x, tan[k].z);
    neonGroup.add(refl);
  }
}

/* ---------- NIGHT CIRCUIT: rain + neon point lights (not track objects) ---------- */
const RAIN_N = mobile ? 420 : 760;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 6);
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xa8cdec, transparent: true, opacity: 0.32, fog: false, toneMapped: false });
const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
const rainDrops = Array.from({ length: RAIN_N }, () => ({ x: rand(-60, 60), y: rand(0, 55), z: rand(-60, 60), v: rand(34, 52) }));
function updateRain(dt) {
  if (!rain.visible) return;
  rain.position.copy(camera.position);
  const R = 60;
  for (let i = 0; i < RAIN_N; i++) {
    const d = rainDrops[i];
    d.y -= d.v * dt; d.x += 9 * dt;
    if (d.y < -2) { d.y += 57; d.x = rand(-R, R); d.z = rand(-R, R); }
    if (d.x > R) d.x -= 2 * R;
    const o = i * 6, dx = d.x - 9 * 0.045, dy = d.y + d.v * 0.045;
    rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z;
    rainPos[o + 3] = dx; rainPos[o + 4] = dy; rainPos[o + 5] = d.z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}
/* a handful of colored point lights along the circuit — desktop 6, mobile 4 */
const neonLights = [];
{
  const cols = [0x2de2ff, 0xff2dd8, 0xff9a2f];
  const cnt = mobile ? 4 : 6;
  for (let i = 0; i < cnt; i++) {
    const L = new THREE.PointLight(cols[i % 3], 0, 130, 1.7);
    const k = Math.round((i + 0.5) * (N / cnt)) % N;
    L.position.copy(pts[k]).add(V3(rand(-8, 8), 14, rand(-8, 8)));
    scene.add(L); neonLights.push(L);
  }
}
const arena = createArena(canvasTex);
scene.add(arena.group, camera);
/* ---------- cars ---------- */
const SPORT_GEO = buildCarGeometry(SPORT);
const carMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.12 });
function makeCar(color, specGeo = SPORT_GEO, tint = null) {
  const g = new THREE.Group(), geo = specGeo.clone();
  colorize(geo, color);
  if (tint) for (const [pid, hex] of Object.entries(tint)) tintPart(geo, +pid, hex);
  const body = new THREE.Mesh(geo, carMat); body.castShadow = true; g.add(body);
  const lamp = (w, h, z, y, x, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); m.position.set(x, y, z); g.add(m); };
  lamp(1.3, 0.09, -2.27, 0.7, 0, new THREE.Color(3.5, 0.2, 0.2));
  for (const sx of [-1, 1]) lamp(0.42, 0.07, 2.25, 0.62, sx * 0.62, new THREE.Color(3, 3, 2.6));
  g.flames = [-0.55, 0.55].map(x => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.26, 2.4, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.2, 4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    f.rotation.x = -Math.PI / 2; f.position.set(x, 0.5, -3.5); f.visible = false; g.add(f); return f;
  });
  g.rotation.order = 'YXZ'; scene.add(g); return g;
}

function sample(s, lat = 0) {
  const sm = ((s % N) + N) % N, i = Math.floor(sm), f = sm - i, j = (i + 1) % N;
  const p = pts[i].clone().lerp(pts[j], f), t = tan[i].clone().lerp(tan[j], f).normalize(), r = right[i].clone().lerp(right[j], f).normalize();
  p.addScaledVector(r, lat); return { p, t, r, i };
}

/* player — selected car from the garage */
let curColor = store.get('sr.color', 0xeef1f5);
const car = makeCar(curColor, carGeo(economy.selected()), getCar(economy.selected()).tint || null);
let CS = getCar(economy.selected()).stats;
function rebuildCar(id) {
  const c = getCar(id), g = carGeo(id).clone();
  const old = car.children[0]; if (old) { car.remove(old); }
  colorize(g, curColor);
  if (c.tint) for (const [pid, hex] of Object.entries(c.tint)) tintPart(g, +pid, hex);
  const body = new THREE.Mesh(g, carMat); body.castShadow = true; car.add(body);
  CS = c.stats;
  document.body.classList.toggle('canfly', !!c.stats.fly);
}
function applyPlayerCar(id) { economy.select(id); rebuildCar(id); updateMoneyUI(); }
car.headlight = new THREE.SpotLight(0xfff0d0, 0, 170, 0.5, 0.7, 2);
{ const tg = new THREE.Object3D(); tg.position.set(0, 0.4, 30); car.headlight.position.set(0, 0.8, 2); car.add(car.headlight, tg); car.headlight.target = tg; }
const SUNSPR = { day: [1, 0xfff3d6], dawn: [1, 0xffb070], sunset: [1, 0xff8844], night: [0.45, 0xaec4ff], nightRain: [0.12, 0x5a6aa8] };
const ENVS = {
  day:    { sky: [[0, '#2d86ee'], [0.38, '#6db4f2'], [0.5, '#cfe4f6'], [1, '#cfe0f0']], fog: 0xcfe0f0, fn: 260, ff: 1500, hemi: [0xcfe6ff, 0x607080, 1.1], sun: [0xfff0d8, 2.5], pos: [120, 200, 80], env: 0.4, cloud: 0.9, bloom: 0.4, glow: 0, stars: 0, head: 0 },
  dawn:   { sky: [[0, '#34559e'], [0.38, '#b98aa6'], [0.5, '#ffcf9f'], [1, '#f5d2b0']], fog: 0xf0c8a4, fn: 200, ff: 1300, hemi: [0xffd9bd, 0x4a4458, 0.95], sun: [0xffb27a, 2.1], pos: [230, 70, 100], env: 0.3, cloud: 0.75, bloom: 0.45, glow: 0, stars: 0, head: 0 },
  sunset: { sky: [[0, '#262b66'], [0.38, '#c25a6a'], [0.5, '#ff9a52'], [1, '#f0a060']], fog: 0xe3a070, fn: 200, ff: 1300, hemi: [0xffc29a, 0x3f3550, 0.85], sun: [0xff8c4a, 1.9], pos: [-230, 60, 120], env: 0.28, cloud: 0.7, bloom: 0.5, glow: 0.35, stars: 0, head: 0 },
  night:  { sky: [[0, '#03050d'], [0.38, '#0c1631'], [0.5, '#1a2a50'], [1, '#16233f']], fog: 0x0d1628, fn: 90, ff: 850, hemi: [0x7f9fe0, 0x101826, 0.5], sun: [0x9db8ff, 0.5], pos: [100, 200, 60], env: 0.1, cloud: 0.1, bloom: 0.7, glow: 1, stars: 1, head: 1 },
  /* NIGHT CIRCUIT: dark rainy neon city — hardest, most stylish chapter */
  nightRain: { sky: [[0, '#010208'], [0.35, '#070b1c'], [0.52, '#101638'], [0.7, '#1c1140'], [1, '#0a0616']], fog: 0x05070e, fn: 55, ff: 560, hemi: [0x30406e, 0x04050a, 0.34], sun: [0x5a6fd8, 0.2], pos: [90, 190, 40], env: 0.09, cloud: 0.05, bloom: 1.1, glow: 2.4, stars: 0, head: 1.5, rain: 1 }
};
let neonOn = 0;
function setEnv(k) {
  const e = ENVS[k] || ENVS.day, wet = k === 'nightRain';
  drawSky(e.sky); scene.fog.color.set(e.fog); scene.fog.near = e.fn; scene.fog.far = e.ff;
  hemi.color.set(e.hemi[0]); hemi.groundColor.set(e.hemi[1]); hemi.intensity = e.hemi[2];
  sun.color.set(e.sun[0]); sun.intensity = e.sun[1]; sunOff.set(...e.pos);
  scene.environmentIntensity = e.env; clouds.forEach(c => { c.material.opacity = e.cloud; });
  bloomPass.strength = e.bloom; if (cityMat) cityMat.emissiveIntensity = e.glow * 1.4;
  starMat.opacity = e.stars; car.headlight.intensity = e.head * 2000;
  const ss = SUNSPR[k] || SUNSPR.day; sunSpr.position.set(...e.pos).normalize().multiplyScalar(2300); sunSpr.material.opacity = ss[0]; sunSpr.material.color.setHex(ss[1]);
  /* Night Circuit: rain streaks + neon city + wet reflective asphalt */
  neonOn = !!e.rain;
  rain.visible = !!e.rain; neonGroup.visible = !!e.rain;
  neonLights.forEach(L => { L.intensity = e.rain ? 5200 : 0; });
  if (roadStrip) { roadStrip.material.roughness = wet ? 0.24 : 0.85; roadStrip.material.metalness = wet ? 0.55 : 0; roadStrip.material.needsUpdate = false; }
  ground.material.color.setHex(wet ? 0x11151c : 0x4d5864); ground.material.roughness = wet ? 0.35 : 1;
  if (cityMat) { cityMat.roughness = wet ? 0.22 : 0.45; cityMat.metalness = wet ? 0.5 : 0.2; }
  document.body.classList.toggle('nc', wet);
}
const P = { spin: 0, pos: V3(), vel: V3(), h: 0, idx: 0, crosses: 0, nitro: 1, prog: 0, finished: false, rank: 6 };
{
  const g = sample(-6 * 2.4, 4);
  P.pos.copy(g.p); P.h = Math.atan2(g.t.x, g.t.z); P.idx = ((Math.round(N - 14.4)) % N);
}
/* flight (Tesla Spark / Ghost X) + race drift scoring */
const FL = { on: false, alt: 0, tgt: 0, land: false, time: 0 };
const RD = { pts: 0, hold: 0, comboT: 0, mult: 1, maxMult: 1, pads: 0 };
/* ghost recorder (your best runs) + replay car (local ghost or downloaded rival) */
const GR = new GhostRec();
let ghostCar = null;
/* AI */
const AI_IDS = ['cruiser', 'titan', 'cab', 'blaze', 'nova'];
const AI = [0xc0222a, 0x1b1d22, 0x2b6cb0, 0xe5b800, 0x2f9e5b].map((c, k) => ({
  mesh: makeCar(c, carGeo(AI_IDS[k]), getCar(AI_IDS[k]).tint || null), name: ['RYDER', 'NOVA', 'BLAZE', 'VIPER', 'GHOST'][k], css: '#' + c.toString(16).padStart(6, '0'),
  s: -(k + 1) * 2.4, lat: (k % 2 ? 4 : -4), latT: 0, timer: 0, speed: 0, base: rand(62, 71) - k * 0.4, prog: 0
}));
let AIs = AI;
AI.forEach(a => { a.latT = a.lat; });

/* ---------- particles ---------- */
const smokeTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const smoke = Array.from({ length: 110 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xe4e8ee, transparent: true, depthWrite: false, opacity: 0 }));
  s.visible = false; scene.add(s); return { s, life: 0, max: 1, vel: V3() };
});
let si = 0;
function puff(p, v, k = 1) {
  const o = smoke[si++ % smoke.length]; o.life = o.max = rand(0.7, 1.3);
  o.s.position.copy(p); o.vel.set(v.x * 0.15 + rand(-1.2, 1.2), rand(0.6, 1.8), v.z * 0.15 + rand(-1.2, 1.2));
  o.s.scale.setScalar(1.4 * k); o.s.visible = true;
}

/* ---------- arena state, skid marks, speed streaks ---------- */
const A = { score: 0, comboT: 0, hold: 0, mult: 1, maxMult: 1, cones: 0, dur: 90, t: 90, hit: 0 };
const SKID = 900;
const skid = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.4, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0b0d, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), SKID);
skid.frustumCulled = false; scene.add(skid);
let skI = 0; const lastSk = [V3(1e9, 0, 1e9), V3(1e9, 0, 1e9)];
function resetSkids() { dummy.position.set(0, -50, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(0, 0, 0); dummy.updateMatrix(); for (let i = 0; i < SKID; i++) skid.setMatrixAt(i, dummy.matrix); dummy.scale.set(1, 1, 1); skid.instanceMatrix.needsUpdate = true; skI = 0; }
function addSkid(w, i, y) {
  if (lastSk[i].distanceToSquared(w) < 0.4) return; lastSk[i].copy(w);
  dummy.position.set(w.x, y + 0.07, w.z); dummy.rotation.set(0, P.h, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
  skid.setMatrixAt(skI++ % SKID, dummy.matrix); skid.instanceMatrix.needsUpdate = true; dummy.rotation.set(0, 0, 0);
}
const STK = 150, spos = new Float32Array(STK * 6), scol = new Float32Array(STK * 6), sa = new Float32Array(STK), sr = new Float32Array(STK), sd = new Float32Array(STK);
const PAL = [[1, 1, 1], [0.4, 0.9, 1], [1, 0.3, 0.8], [0.65, 0.4, 1], [1, 0.9, 0.5]];
for (let i = 0; i < STK; i++) {
  sa[i] = rand(0, 6.283); sr[i] = rand(3.5, 18); sd[i] = rand(6, 170);
  const c = PAL[(Math.random() * 5) | 0]; for (let j = 0; j < 3; j++) { scol[i * 6 + j] = c[j] * 3.2; scol[i * 6 + 3 + j] = c[j] * 0.5; }
}
const stkGeo = new THREE.BufferGeometry();
stkGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3)); stkGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
const stkMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
const streaks = new THREE.LineSegments(stkGeo, stkMat); streaks.frustumCulled = false; streaks.visible = false; camera.add(streaks);
function updateStreaks(dt, sp, boosting) {
  const amt = (cfg.env === 'night' || boosting) ? 1 : 0.5, k = clamp((sp - 42) / 40, 0, 1) * amt;
  stkMat.opacity = k; streaks.visible = k > 0.01; if (!streaks.visible) return;
  const len = 2 + sp * 0.09, v = sp * 1.15 + 30;
  for (let i = 0; i < STK; i++) {
    sd[i] -= v * dt; if (sd[i] < 4) sd[i] += 170;
    const x = Math.cos(sa[i]) * sr[i], y = Math.sin(sa[i]) * sr[i] * 0.65 + 0.5, o = i * 6;
    spos[o] = x; spos[o + 1] = y; spos[o + 2] = -sd[i]; spos[o + 3] = x; spos[o + 4] = y; spos[o + 5] = -(sd[i] + len);
  }
  stkGeo.attributes.position.needsUpdate = true;
}

/* ---------- input / audio ---------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR' && ['race', 'count', 'paused', 'finished'].includes(state) && !(cfg.mode === 'tour' && P.finished)) retry();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'paused') resume(); else pause(); }
  if (e.code === 'KeyT') respawn();
  if (e.code === 'KeyM') muted = !muted;
  if (state === 'menu' && !e.repeat && document.activeElement !== $('dname')) menuKeys(e);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* gamepad */
const gp = { steer: 0, up: 0, down: 0, boost: 0, drift: 0, fly: false };
let padFlyPrev = false, flyKeyPrev = false;
function pollPad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let dev = null; for (const g of gps) if (g && g.connected) { dev = g; break; }
  if (!dev) { gp.steer = 0; gp.up = gp.down = gp.boost = gp.drift = 0; gp.fly = false; padFlyPrev = false; return; }
  const dz = v => Math.abs(v) < 0.14 ? 0 : v;
  gp.steer = -dz(dev.axes[0] || 0);
  gp.up = dev.buttons[7] && dev.buttons[7].value > 0.12 ? 1 : 0;
  gp.down = dev.buttons[6] && dev.buttons[6].value > 0.12 ? 1 : 0;
  gp.boost = dev.buttons[0] && dev.buttons[0].pressed ? 1 : 0;
  gp.drift = dev.buttons[2] && dev.buttons[2].pressed ? 1 : 0;
  gp.fly = !!(dev.buttons[3] && dev.buttons[3].pressed);
}

let actx, osc, osc2, lp, gain, windG, muted = false, noiseBuf = null;
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    osc = actx.createOscillator(); osc.type = 'sawtooth'; osc2 = actx.createOscillator(); osc2.type = 'square';
    lp = actx.createBiquadFilter(); lp.type = 'lowpass'; gain = actx.createGain(); gain.gain.value = 0.04;
    const g2 = actx.createGain(); g2.gain.value = 0.45; osc.connect(lp); osc2.connect(g2).connect(lp); lp.connect(gain).connect(actx.destination);
    osc.start(); osc2.start();
    const buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = buf;
    const wind = actx.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const wf = actx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; windG = actx.createGain(); windG.gain.value = 0;
    wind.connect(wf).connect(windG).connect(actx.destination); wind.start();
  } catch (e) { actx = null; }
}
function audioUpdate(sp, boost, fly = false) {
  if (!actx) return; if (sp < 0) { const t0 = actx.currentTime; gain.gain.setTargetAtTime(0, t0, 0.05); windG.gain.setTargetAtTime(0, t0, 0.05); return; } const t = actx.currentTime, g = Math.min(4, Math.floor(sp / 20)), r = (sp - g * 20) / 20, f = (58 + r * 90 + g * 14) * (fly ? 1.22 : 1);
  osc.frequency.setTargetAtTime(f, t, 0.05); osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  lp.frequency.setTargetAtTime(450 + sp * 8 + (boost || fly ? 700 : 0), t, 0.1);
  gain.gain.setTargetAtTime(muted ? 0 : 0.045, t, 0.1);
  windG.gain.setTargetAtTime(muted ? 0 : clamp(sp / 90, 0, 1) * (boost ? 0.12 : fly ? 0.14 : 0.05), t, 0.1);
}

/* quick sfx built on the same audio context (no assets) */
function beep(f = 880, dur = 0.09, type = 'square', vol = 0.12) {
  if (!actx || muted) return; const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfxCoin = () => { beep(660, 0.07); setTimeout(() => beep(990, 0.12), 70); };
const sfxPad = () => { beep(440, 0.06, 'sawtooth', 0.09); setTimeout(() => beep(880, 0.1, 'sawtooth', 0.09), 55); };
const sfxMission = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.13), i * 110));
const sfxThud = () => { if (!actx || muted || !noiseBuf) return; const t = actx.currentTime, s = actx.createBufferSource(); s.buffer = noiseBuf; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; const g = actx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + 0.3); };
const sfxWhoosh = () => { if (!actx || muted || !noiseBuf) return; const t = actx.currentTime, s = actx.createBufferSource(); s.buffer = noiseBuf; const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.9); const g = actx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1); s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + 1.2); };

/* ---------- HUD helpers ---------- */
const mm = $('mm'), mc = mm.getContext('2d');
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
const pad = 30, msc = (mm.width - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
const mxy = (x, z) => [pad + (x - minX) * msc, pad + (maxZ - z) * msc];
const mmBase = document.createElement('canvas'); mmBase.width = mm.width; mmBase.height = mm.height;
{
  const g = mmBase.getContext('2d'); g.lineJoin = 'round'; g.beginPath();
  pts.forEach((p, i) => { const [x, y] = mxy(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
  g.strokeStyle = '#05080d'; g.lineWidth = 14; g.stroke(); g.strokeStyle = '#9fb0c4'; g.lineWidth = 8; g.stroke();
  const [sx, sy] = mxy(pts[0].x, pts[0].z); g.fillStyle = '#fff'; g.fillRect(sx - 8, sy - 2, 16, 4);
}
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
let toastT = 0;
const toast = (txt, col = '#7dff8a') => { const e = $('toast'); e.textContent = txt; e.style.color = col; e.style.opacity = 1; toastT = 1.3; };

/* ---------- game state / menus ---------- */
let state = 'menu', cdT = 3, raceT = 0, shake = 0, camYaw = P.h, lastRank = 6, ovCool = 0, goT = 0, prevState = 'race', menuT = 0, prevCrosses = 0, lapStart = 0, bestLap = Infinity;
const DIFF = [0.9, 1, 1.07], PTS = [10, 8, 6, 4, 2, 1], LEVELS = ['Easy', 'Normal', 'Hard'];
const CUPS = [
  { name: 'CITY DAWN', type: 'race', env: 'dawn', laps: 2, diff: 0 },
  { name: 'NOON RUSH', type: 'race', env: 'day', laps: 3, diff: 1 },
  { name: 'AIRFIELD DRIFT', type: 'arena', env: 'day', dur: 90, diff: 1 },
  { name: 'SUNSET RUN', type: 'race', env: 'sunset', laps: 3, diff: 1 },
  { name: 'NIGHT GRAND PRIX', type: 'race', env: 'night', laps: 3, diff: 2 }
];
/* NIGHT CIRCUIT — special hard chapter: rain, neon, low grip, ×1.8 cash */
const NCUPS = [
  { name: 'NEON GAUNTLET', type: 'race', env: 'nightRain', laps: 2, diff: 2 },
  { name: 'MONSOON DRIFT', type: 'arena', env: 'nightRain', dur: 90, diff: 2 },
  { name: 'CYBER SPRINT', type: 'race', env: 'nightRain', laps: 3, diff: 2 },
  { name: 'STORM CHASER', type: 'race', env: 'nightRain', laps: 3, diff: 2 },
  { name: 'RAIN KING GP', type: 'race', env: 'nightRain', laps: 5, diff: 2 }
];
let NT = store.get('sr.nt', null);
const nightUnlocked = () => economy.has('tesla') || economy.has('ghost') || economy.money >= 150000;
function updateNightUI() {
  const t = $('nightTile'), sub = $('nightSub'), lock = $('ntLock'), go = $('ntGo');
  const ok = nightUnlocked();
  if (t) t.classList.toggle('locked', !ok);
  if (sub) sub.textContent = ok ? 'HARD · RAIN · NEON · ×1.8 CASH' : 'LOCKED · OWN TESLA SPARK OR $150,000';
  if (lock) lock.style.display = ok ? 'none' : '';
  if (go) go.style.display = ok ? '' : 'none';
  if (ok) renderNight();
}
function renderNight() {
  const list = $('ntList'); if (!list) return;
  const r = NT ? NT.round : 0;
  let h = NCUPS.map((c, i) => `<div class="rr${i === r ? ' me' : ''}"><b>${i + 1}</b><span>${c.name}</span><em>${c.type === 'arena' ? c.dur + 's · drift score' : c.laps + ' laps · HARD'}</em><i>${i < r ? '✔' : ''}</i></div>`).join('');
  if (NT) h += '<div class="lbl">STANDINGS</div>' + Object.entries(NT.pts).sort((a, b) => b[1] - a[1]).map(([n, p]) => `<div class="rr${n === 'YOU' ? ' me' : ''}"><span>${n}</span><i>${p} pts</i></div>`).join('');
  list.innerHTML = h;
  $('ntGo').textContent = NT ? `CONTINUE · ROUND ${r + 1}` : 'ENTER THE NIGHT';
  $('ntReset').style.display = NT ? '' : 'none';
}
const COLORS = [0xeef1f5, 0xd42a2a, 0x1d6fe0, 0xf2b705, 0x22a05a, 0x16181d, 0xff6a00, 0x8a3ffc];
let cfg = { mode: 'menu', laps: 3, diff: 1, ai: 5, env: 'day' };
let T = store.get('sr.t', null);
const opt = Object.assign({ laps: 3, diff: 1, dur: 90, env: 'day', q: mobile ? 'med' : 'high', snd: 'on', board: 'race3' }, store.get('sr.opt', {}));
const show = (id, on) => $(id).classList.toggle('hide', !on);
const ord = n => n + ['th', 'st', 'nd', 'rd'][n <= 3 ? n : 0];

function setState(s) {
  state = s; document.body.classList.toggle('menu', s === 'menu'); document.body.classList.toggle('done', s === 'finished');
}
function followSun() { sun.position.set(car.position.x + sunOff.x, car.position.y + sunOff.y, car.position.z + sunOff.z); sun.target.position.copy(car.position); }

function resetWorld(c) {
  c = Object.assign({ type: 'race' }, c); cfg = c; TOTAL = c.laps || 1; setEnv(c.env); AIs = AI.slice(0, c.ai);
  const arenaOn = c.type === 'arena';
  trackObjs.forEach(o => { o.visible = !arenaOn; }); arena.group.visible = arenaOn; arena.reset();
  const nightOn = !arenaOn && c.env === 'nightRain';
  neonGroup.visible = nightOn; padsNight.forEach(p => { p.visible = nightOn; });
  document.body.classList.toggle('arena', arenaOn && c.mode !== 'menu'); $('paintBar').classList.remove('open');
  let g;
  if (arenaOn) { g = { p: V3(0, 0, -150) }; P.pos.set(0, 0, -150); P.h = 0; P.idx = 0; }
  else { const slot = c.ai + (c.netSlot || 0); g = sample(-(slot + 1) * 2.4, slot % 2 ? 4 : -4); P.pos.copy(g.p); P.h = Math.atan2(g.t.x, g.t.z); P.idx = (N - Math.round((slot + 1) * 2.4)) % N; }
  P.vel.set(0, 0, 0); P.spin = 0; P.crosses = 0; P.nitro = 1; P.finished = false; P.rank = c.ai + (c.netSlot || 0) + 1; P.prog = 0;
  AI.forEach((a, k) => { a.mesh.visible = k < c.ai; a.s = -(k + 1) * 2.4; a.lat = a.latT = k % 2 ? 4 : -4; a.timer = 0; a.speed = 0; a.base = (rand(62, 71) - k * 0.4) * DIFF[c.diff] * (0.74 + CS.top / 132 * 0.28); });
  smoke.forEach(o => { o.life = 0; o.s.visible = false; });
  car.flames.forEach(f => { f.visible = false; });
  Object.assign(A, { score: 0, comboT: 0, hold: 0, mult: 1, maxMult: 1, cones: 0, dur: c.dur || 90, t: c.dur || 90, hit: 0 });
  Object.assign(FL, { on: false, alt: 0, tgt: 0, land: false, time: 0 }); document.body.classList.remove('flying');
  Object.assign(RD, { pts: 0, hold: 0, comboT: 0, mult: 1, maxMult: 1, pads: 0 });
  GR.reset();
  pads.forEach(p => { p.userData.cd = 0; p.userData.flash = 0; });
  resetSkids();
  raceT = 0; shake = 0; lastRank = c.ai + 1; ovCool = 0; goT = 0; prevCrosses = 0; lapStart = 0; bestLap = Infinity; camYaw = P.h;
  camera.position.set(g.p.x - Math.sin(P.h) * 9, g.p.y + 4, g.p.z - Math.cos(P.h) * 9);
}
let ncIntroT = 0;
function startRace(c) {
  show('menu', false); show('pause', false); show('finish', false); if ($('fglobal')) $('fglobal').textContent = '';
  if (c.mode === 'mp' && c.netSlot === undefined) c.netSlot = net.mySlot;
  resetWorld(c); setupGhost(); setState('count'); cdT = 3; $('cd').textContent = '3'; ['l1', 'l2', 'l3'].forEach(l => $(l).className = ''); $('count').style.display = 'flex';
  if (c.env === 'nightRain') { const iv = $('ncIntro'); iv.classList.add('show'); clearTimeout(ncIntroT); ncIntroT = setTimeout(() => iv.classList.remove('show'), 2400); }
  if (!actx) initAudio(); if (actx && actx.state === 'suspended') actx.resume();
  if (c.title) toast(c.title, '#7df');
}
function toMenu() {
  show('pause', false); show('finish', false); show('menu', true); $('count').style.display = 'none';
  resetWorld({ mode: 'menu', laps: 3, diff: 1, ai: 5, env: ['day', 'dawn', 'sunset', 'night'][(Math.random() * 4) | 0] });
  setState('menu'); showScreen('main'); audioUpdate(-1, false);
}
/* showroom state while the splash / account gate play on top (menu DOM stays hidden) */
function showroomOnly() {
  show('menu', false); show('pause', false); show('finish', false); $('count').style.display = 'none';
  resetWorld({ mode: 'menu', laps: 3, diff: 1, ai: 5, env: ['day', 'dawn', 'sunset', 'night'][(Math.random() * 4) | 0] });
  setState('menu'); audioUpdate(-1, false);
}
/* V5 boot: splash -> account gate -> menu */
function gateBoot() {
  showroomOnly();
  import('./boot.js').then(({ bootFlow }) => bootFlow({
    rev() {
      if (muted) return;
      if (!actx) initAudio();
      if (actx && actx.state === 'suspended') actx.resume();
      try {
        const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 1500;
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(65, t);
        o.frequency.exponentialRampToValueAtTime(500, t + 0.5);
        o.frequency.exponentialRampToValueAtTime(215, t + 1.05);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.17, t + 0.14);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
        o.connect(f).connect(g).connect(actx.destination); o.start(t); o.stop(t + 1.2);
      } catch (e) { }
    },
    enter: toMenu
  })).catch(() => toMenu());
}
function pause() {
  if (state !== 'race' && state !== 'count') return;
  prevState = state; setState('paused'); show('pause', true); audioUpdate(-1, false);
}
function resume() { if (state !== 'paused') return; show('pause', false); setState(prevState); }
function retry() { if (cfg.mode === 'mp') { toast('NO RESTARTS IN ONLINE RACES', '#ffd166'); return; } startRace(cfg); }
function respawn() {
  if (state !== 'race' || P.finished) return;
  if (cfg.type === 'arena') { P.pos.set(0, 0, -150); P.h = 0; } else { const g = sample(P.idx, 0); P.pos.copy(g.p); P.h = Math.atan2(g.t.x, g.t.z); }
  P.vel.set(0, 0, 0); P.spin = 0; camYaw = P.h; toast('RESPAWN', '#ffffff');
}

/* menu wiring */
const screens = [...document.querySelectorAll('#menu .screen')];
let lastScreen = 'main';
const HINTS = {
  main: 'TAP START ENGINE · PICK YOUR MODE',
  quick: 'SET OPTIONS \u00b7 START TO RACE', tour: '5 ROUNDS \u00b7 CHAMPION TAKES THE CROWN',
  night: 'NIGHT CIRCUIT · RAIN · NEON · ×1.8 CASH', multi: 'CREATE A ROOM · SHARE THE CODE · RACE LIVE',
  arena: 'DRIFT \u00b7 SMASH CONES \u00b7 BEAT THE CLOCK', tt: 'CLEAN LINES SET RECORDS',
  garage: 'CLICK A CAR TO BUY OR SELECT', missions: 'REWARDS PAID INSTANTLY',
  online: 'SET YOUR DRIVER NAME TO APPEAR HERE', settings: 'PROGRESS SAVES AUTOMATICALLY',
  how: 'GOOD LUCK OUT THERE'
};
function showScreen(n) {
  screens.forEach(sc => sc.classList.toggle('on', sc.dataset.s === n));
  const hl = $('hintL'); if (hl) hl.textContent = HINTS[n] || '';
  const pb = document.querySelector('#menu .screen.on .pbody'); if (pb) pb.scrollTop = 0;
  if (lastScreen === 'garage' && n !== 'garage') rebuildCar(economy.selected());
  lastScreen = n;
  if (n === 'tour') renderTour();
  if (n === 'night') { updateNightUI(); }
  if (n === 'multi') renderMp();
  if (n === 'tt') renderBest();
  if (n === 'arena') renderArBest();
  if (n === 'garage') { renderGarage(); rebuildCar(economy.selected()); }
  if (n === 'missions') renderMissions();
  if (n === 'online') renderBoard();
  if (n === 'main') renderDaily();
  if (n === 'quick' || n === 'tt' || n === 'arena') setEnv(opt.env);
}
/* console-style keyboard navigation: arrows move the highlight, enter selects, esc backs out */
let kbIdx = -1;
function menuKeys(e) {
  if (e.code === 'Escape' || e.code === 'Backspace') { if (lastScreen !== 'main') { kbIdx = -1; showScreen('main'); } return; }
  const scr = document.querySelector('#menu .screen.on'); if (!scr) return;
  const items = [...scr.querySelectorAll('button')].filter(b => b.offsetParent !== null && !b.disabled && !b.classList.contains('sw') && !b.classList.contains('back') && !(b.parentElement && b.parentElement.classList.contains('seg')));
  if (!items.length) return;
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    kbIdx = (kbIdx + (e.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((b, i) => b.classList.toggle('kfocus', i === kbIdx));
    items[kbIdx].scrollIntoView({ block: 'nearest' }); beep(700, 0.03, 'square', 0.035);
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (kbIdx >= 0 && items[kbIdx]) { const b = items[kbIdx]; kbIdx = -1; b.classList.remove('kfocus'); b.click(); }
  }
}
function syncSegs() {
  document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(opt[seg.dataset.k]) === b.dataset.v)));
}
function renderArBest() { const b = store.get(`sr.best.arena.${opt.dur}`, null), el = $('arBest'); if (!el) return; el.style.display = b ? '' : 'none'; el.textContent = `BEST SCORE  ${b.toLocaleString()}`; }
function renderBest() { const b = store.get(`sr.best.tt.${opt.laps}`, null), el = $('ttBest'); if (!el) return; el.style.display = b ? '' : 'none'; el.textContent = `BEST TIME  ${fmt(b)}`; }
function renderTour() {
  const r = T ? T.round : 0;
  let h = CUPS.map((c, i) => `<div class="rr${i === r ? ' me' : ''}"><b>${i + 1}</b><span>${c.name}</span><em>${c.type === 'arena' ? c.dur + 's · drift score' : c.laps + ' laps · ' + LEVELS[c.diff]}</em><i>${i < r ? '✔' : ''}</i></div>`).join('');
  if (T) h += '<div class="lbl">STANDINGS</div>' + Object.entries(T.pts).sort((a, b) => b[1] - a[1]).map(([n, p]) => `<div class="rr${n === 'YOU' ? ' me' : ''}"><span>${n}</span><i>${p} pts</i></div>`).join('');
  $('tourList').innerHTML = h;
  $('tourGo').textContent = T ? `CONTINUE · ROUND ${r + 1}` : 'START TOURNAMENT';
  $('tourReset').style.display = T ? '' : 'none';
}
function paintPlayer(c) {
  curColor = c; colorize(car.children[0].geometry, c); store.set('sr.color', c);
  document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', +b.dataset.c === c));
}
function applyQuality() {
  pr = Math.min(devicePixelRatio, { high: 2, med: 1.5, low: 1 }[opt.q] || 2);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
}
function act(a) {
  if (a === 'quick') startRace({ mode: 'quick', laps: opt.laps, diff: opt.diff, ai: 5, env: opt.env });
  else if (a === 'tt') startRace({ mode: 'tt', laps: opt.laps, diff: 1, ai: 0, env: opt.env });
  else if (a === 'arena') startRace({ mode: 'arena', type: 'arena', laps: 1, diff: opt.diff, ai: 0, env: opt.env, dur: opt.dur, title: 'DRIFT ARENA' });
  else if (a === 'tourGo' || a === 'next') {
    if (!T) { T = { round: 0, pts: {} }; store.set('sr.t', T); }
    const c = CUPS[T.round]; startRace({ mode: 'tour', type: c.type, laps: c.laps || 1, diff: c.diff, ai: c.type === 'arena' ? 0 : 5, env: c.env, dur: c.dur, title: `ROUND ${T.round + 1}: ${c.name}` });
  }
  else if (a === 'ntGo' || a === 'ntNext') {
    if (!nightUnlocked()) { toast('LOCKED · OWN TESLA SPARK OR $150,000', '#ff7b7b'); sfxThud(); return; }
    if (!NT) { NT = { round: 0, pts: {} }; store.set('sr.nt', NT); }
    const c = NCUPS[NT.round]; startRace({ mode: 'tour', chapter: 'night', type: c.type, laps: c.laps || 1, diff: c.diff, ai: c.type === 'arena' ? 0 : 5, env: c.env, dur: c.dur, title: `ROUND ${NT.round + 1}: ${c.name}` });
  }
  else if (a === 'ntReset') { NT = null; store.set('sr.nt', null); renderNight(); }
  else if (a === 'nightTile') { if (!nightUnlocked()) { toast('LOCKED · OWN TESLA SPARK OR $150,000', '#ff7b7b'); sfxThud(); } }
  else if (a === 'mpCreate') { net.create(); }
  else if (a === 'mpJoinOpen') { mpStep = 'join'; const ci = $('mpCodeIn'); if (ci) ci.value = ''; const ec = $('mpCodeEcho'); if (ec) ec.textContent = '\u00a0'; renderMp(); if (ci) setTimeout(() => ci.focus(), 80); }
  else if (a === 'mpJoinBack') { mpStep = 'home'; renderMp(); }
  else if (a === 'mpJoin') { net.join($('mpCodeIn').value); }
  else if (a === 'mpStart') { net.start(); }
  else if (a === 'mpLeave') { mpStep = 'home'; net.leave(); }
  else if (a === 'mpCopy') {
    const t = $('mpCode') && $('mpCode').textContent;
    if (t && navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('CODE COPIED · SEND IT!', '#8df')).catch(() => { });
  }
  else if (a === 'tourReset') { T = null; store.set('sr.t', null); renderTour(); }
  else if (a === 'daily') claimDaily();
  else if (a === 'refreshBoard') renderBoard();
  else if (a === 'rival') raceRival();
  else if (a === 'signout') { cloud.signOutAuth().then(() => location.reload()); }
  else if (a === 'resume') resume();
  else if (a === 'glreload') { store.set('sr.glfix', 1); location.reload(); }
  else if (a === 'retry') retry();
  else if (a === 'menu') toMenu();
}
document.addEventListener('click', e => {
  kbIdx = -1; document.querySelectorAll('.kfocus').forEach(b => b.classList.remove('kfocus'));
  const card = e.target.closest('.carCard'); if (card && card.dataset.car) { garageClick(card.dataset.car); return; }
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.go) showScreen(b.dataset.go);
  else if (b.dataset.act) act(b.dataset.act);
  else if (b.dataset.c) paintPlayer(+b.dataset.c);
  else if (b.dataset.v !== undefined && b.parentElement.classList.contains('seg')) {
    const k = b.parentElement.dataset.k; opt[k] = (k === 'laps' || k === 'diff' || k === 'dur') ? +b.dataset.v : b.dataset.v; store.set('sr.opt', opt); syncSegs();
    if (k === 'env') setEnv(opt.env); if (k === 'laps') renderBest(); if (k === 'dur') renderArBest(); if (k === 'q') applyQuality(); if (k === 'snd') muted = opt.snd === 'off'; if (k === 'board') renderBoard();
  }
});
$('pauseBtn').onclick = pause;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else last = performance.now(); });

function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

function stepPlayer(dt, racing) {
  const k = { up: keys.KeyW || keys.ArrowUp || gp.up || (touch.active && !touch.down), down: keys.KeyS || keys.ArrowDown || gp.down || touch.down, left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight, boost: keys.ShiftLeft || keys.ShiftRight || gp.boost || touch.boost, drift: keys.Space || gp.drift || touch.drift };
  const f = V3(Math.sin(P.h), 0, Math.cos(P.h)), rt = V3(-f.z, 0, f.x);
  const fwd = P.vel.dot(f), sp = P.vel.length();
  const can = racing && !P.finished;
  /* flight toggle: F key / Y button / FLY touch button */
  const padFlyEdge = gp.fly && !padFlyPrev; padFlyPrev = gp.fly;
  const flyEdge = (keys.KeyF && !flyKeyPrev) || padFlyEdge || touch.fly === 1; flyKeyPrev = !!keys.KeyF; touch.fly = 0;
  if (CS.fly && can && cfg.type !== 'arena') {
    if (flyEdge) {
      if (!FL.on && fwd > 26) { FL.on = true; FL.alt = 0.01; FL.tgt = 20; FL.land = false; sfxWhoosh(); toast('FLIGHT MODE \u2708', '#8df'); }
      else if (FL.on && !FL.land) { FL.land = true; toast('LANDING', '#8df'); }
    }
    if (FL.on && !FL.land && k.down) FL.tgt = Math.max(3, FL.tgt - 22 * dt); /* hold brake to descend */
    /* Night Circuit: storm gusts make flying dangerous (but ×1.8 flight pay) */
    if (FL.on && cfg.env === 'nightRain') {
      const g = performance.now() * 0.001;
      P.vel.addScaledVector(rt, Math.sin(g * 1.3 + P.pos.x * 0.02) * 7.5 * dt);
      P.h += Math.sin(g * 0.9 + P.pos.z * 0.013) * 0.1 * dt;
      FL.tgt = clamp(FL.tgt + Math.sin(g * 0.7) * 2.4 * dt, 3, 42);
    }
  }
  if (FL.on) {
    if (FL.land) FL.tgt = 0; else FL.tgt = clamp(FL.tgt, 3, 42);
    FL.alt += clamp(FL.tgt - FL.alt, -17 * dt, 11 * dt);
    P.nitro = Math.max(0, P.nitro - (cfg.env === 'nightRain' ? 0.095 : 0.075) * dt); /* thrusters burn nitro */
    FL.time += dt;
    if (FL.alt <= 0.35 || P.nitro <= 0.001) { FL.on = false; FL.land = false; FL.alt = 0; document.body.classList.remove('flying'); sfxThud(); shake = Math.max(shake, 0.18); puff(car.localToWorld(V3(0, 0.3, -1)), P.vel, 1.6); }
  }
  const gas = k.up || FL.on;
  const boosting = can && k.boost && P.nitro > 0.02 && gas;
  if (can) {
    const air = FL.on;
    const max = (boosting ? CS.top * 1.22 : CS.top) * (air ? 1.1 : 1), a0 = (boosting ? CS.accel * 1.6 : CS.accel) * (air ? 0.85 : 1);
    if (gas) P.vel.addScaledVector(f, a0 * clamp(1 - fwd / max, 0, 1) * dt);
    if (k.down && !air) P.vel.addScaledVector(f, -(fwd > 0 ? 58 : 22) * dt * (fwd > -14 ? 1 : 0));
    let steer = (k.left ? 1 : 0) - (k.right ? 1 : 0); if (!steer) steer = touch.steer; if (!steer) steer = gp.steer;
    P.h += steer * CS.steer * (air ? 0.8 : 1) * clamp(Math.abs(fwd) / 16, 0, 1) / (1 + Math.abs(fwd) / 85) * dt * (fwd < 0 ? -1 : 1) * (k.drift && !air ? 1.5 : 1);
  }
  P.h += P.spin * dt; P.spin *= Math.exp(-3.5 * dt);
  P.vel.multiplyScalar(Math.exp(-(P.finished ? 0.9 : 0.14) * dt));
  const grip = FL.on ? 4.5 : (k.drift && can ? CS.drift : 7.5) * (cfg.env === 'nightRain' && !FL.on ? 0.82 : 1); /* rain: less grip, more slide */
  const nf = V3(Math.sin(P.h), 0, Math.cos(P.h)), sp2 = P.vel.length();
  P.vel.lerp(nf.multiplyScalar(fwd >= 0 ? sp2 : -sp2), 1 - Math.exp(-grip * dt));
  const slip = P.vel.dot(V3(-Math.cos(P.h), 0, Math.sin(P.h)));
  if (FL.on) { /* nitro drained by thrusters above */ }
  else if (boosting) P.nitro = Math.max(0, P.nitro - 0.26 * dt); else P.nitro = Math.min(1, P.nitro + (0.025 + (k.drift && sp > 30 ? 0.09 : 0)) * dt);
  if (cfg.type !== 'arena') {
    const drifting = can && !FL.on && Math.abs(slip) > 4.5 && sp > 18;
    if (drifting) { RD.hold = 1.1; RD.comboT += dt; } else { RD.hold -= dt; if (RD.hold <= 0) RD.comboT = 0; }
    RD.mult = 1 + Math.min(4, Math.floor(RD.comboT / 1.8)); RD.maxMult = Math.max(RD.maxMult, RD.mult);
    if (drifting) RD.pts += Math.abs(slip) * sp * 0.5 * RD.mult * dt;
  }
  P.pos.addScaledVector(P.vel, dt);

  let y = 0, pitch = 0;
  if (cfg.type === 'arena') {
    const dd = Math.hypot(P.pos.x, P.pos.z), lim = arena.R - 1.8;
    if (dd > lim) {
      const nx = P.pos.x / dd, nz = P.pos.z / dd; P.pos.x = nx * lim; P.pos.z = nz * lim;
      const vo = P.vel.x * nx + P.vel.z * nz;
      if (vo > 0) { P.vel.x -= nx * vo * 1.3; P.vel.z -= nz * vo * 1.3; P.vel.multiplyScalar(1 - clamp(vo * 0.012, 0.01, 0.3)); shake = Math.max(shake, clamp(vo / 18, 0.1, 1)); }
    }
    if (state === 'race' || state === 'finished') arenaTick(dt, slip, sp, can);
  } else {
  let best = P.idx, bd = 1e18;
  for (let o = -14; o <= 14; o++) { const j = (P.idx + o + N) % N, dx = P.pos.x - pts[j].x, dz = P.pos.z - pts[j].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = j; } }
  if (P.idx > N * 0.75 && best < N * 0.25) P.crosses++; else if (P.idx < N * 0.25 && best > N * 0.75) P.crosses--;
  P.idx = best;
  const r = right[best], t = tan[best], rx = P.pos.x - pts[best].x, rz = P.pos.z - pts[best].z;
  const d = rx * r.x + rz * r.z, lim = WALL - 1.1, ad = Math.abs(d), sg = Math.sign(d);
  if (FL.on && FL.alt > 2.5) { /* airborne: walls ignored, soft pull back toward the circuit */
    if (ad > 120) { P.pos.x -= r.x * sg * (ad - 120) * dt * 1.5; P.pos.z -= r.z * sg * (ad - 120) * dt * 1.5; }
  } else if (ad > lim) {
    P.pos.x -= r.x * sg * (ad - lim); P.pos.z -= r.z * sg * (ad - lim);
    const vo = (P.vel.x * r.x + P.vel.z * r.z) * sg;
    if (vo > 0) { P.vel.x -= r.x * sg * vo * 1.25; P.vel.z -= r.z * sg * vo * 1.25; P.vel.multiplyScalar(1 - clamp(vo * 0.012, 0.01, 0.3)); shake = Math.max(shake, clamp(vo / 18, 0.1, 1)); }
    P.vel.multiplyScalar(1 - 0.5 * dt);
  } else if (ad > W) shake = Math.max(shake, 0.12);
  P.prog = P.crosses * N + best + clamp((rx * t.x + rz * t.z) / ds, -0.5, 0.5);
  if (can && !FL.on && state === 'race') for (const pd of allPads()) {
    const u = pd.userData; if (u.cd > 0) continue;
    const dx = P.pos.x - pd.position.x, dz = P.pos.z - pd.position.z;
    if (dx * dx + dz * dz < 12.5) { u.cd = 1.2; u.flash = 1; RD.pads++; P.nitro = Math.min(1, P.nitro + (cfg.env === 'nightRain' ? 0.45 : 0.3)); P.vel.addScaledVector(f, cfg.env === 'nightRain' ? 8.5 : 6); sfxPad(); }
  }
  const nx = (best + 1) % N, fr = clamp((rx * t.x + rz * t.z) / ds, 0, 1);
  y = pts[best].y + (pts[nx].y - pts[best].y) * fr; pitch = -Math.atan2(t.y, Math.hypot(t.x, t.z));
  }

  /* mesh */
  car.position.set(P.pos.x, y + 0.04 + FL.alt, P.pos.z);
  car.rotation.y = P.h;
  car.rotation.x = pitch + (FL.on ? clamp((FL.tgt - FL.alt) * 0.014, -0.12, 0.16) - 0.05 : 0);
  car.rotation.z = clamp(-slip * 0.012, -0.12, 0.12) + (FL.on ? -clamp((k.left ? 1 : 0) - (k.right ? 1 : 0) || gp.steer, -1, 1) * 0.14 : 0);
  car.flames.forEach(fl => { fl.visible = boosting || FL.on; if (boosting) { fl.scale.set(1, 0.9 + Math.random() * 0.7, 1); fl.material.opacity = 0.6 + Math.random() * 0.35; } else if (FL.on) { fl.scale.set(0.7, 0.7 + Math.random() * 0.5, 0.7); fl.material.opacity = 0.35 + Math.random() * 0.25; } });
  car.updateMatrixWorld();
  if (!FL.on) {
    if ((Math.abs(slip) > 5 && sp > 22) || (boosting && Math.random() < 0.5)) for (const sx of [-1, 1]) if (Math.random() < 0.8) puff(car.localToWorld(V3(sx * 1.05, 0.3, -1.6)), P.vel, boosting ? 0.8 : 1.2);
    if (Math.abs(slip) > 5 && sp > 22) [-1, 1].forEach((sx, i) => addSkid(car.localToWorld(V3(sx * 1.05, 0.3, -1.6)), i, car.position.y));
  }
  return { boosting, sp: P.vel.length() };
}

const pb = { x: 0, z: 0, vx: 0, vz: 0, cos: 1, sin: 0, halfW: 1.05, halfL: 2.2, mass: 1, angularVel: 0 };
const ab = { x: 0, z: 0, vx: 0, vz: 0, cos: 1, sin: 0, halfW: 1.05, halfL: 2.2, mass: 1.25, angularVel: 0 };
const ct = {};
const cb = { x: 0, z: 0, vx: 0, vz: 0, cos: 1, sin: 0, halfW: 1.3, halfL: 3.1, mass: 40, angularVel: 0 };
function arenaTick(dt, slip, sp, can) {
  const drifting = can && Math.abs(slip) > 4.5 && sp > 18;
  if (drifting) { A.hold = 1.1; A.comboT += dt; } else { A.hold -= dt; if (A.hold <= 0) A.comboT = 0; }
  A.mult = 1 + Math.min(4, Math.floor(A.comboT / 1.8)); A.maxMult = Math.max(A.maxMult, A.mult);
  if (drifting) A.score += Math.abs(slip) * sp * 0.5 * A.mult * dt;
  if (!can) return;
  const sn = Math.sin(P.h), cs = Math.cos(P.h);
  for (const c of arena.cones) {
    if (c.k) continue; const dx = c.x - P.pos.x, dz = c.z - P.pos.z; if (dx * dx + dz * dz > 20) continue;
    if (Math.abs(dx * sn + dz * cs) < 2.5 && Math.abs(dx * cs - dz * sn) < 1.35) { arena.knock(c, P.vel.x * 1.1 + rand(-2, 2), P.vel.z * 1.1 + rand(-2, 2)); A.score += 100; A.cones++; toast('CONE  +100', '#ffb347'); }
  }
  A.hit -= dt;
  for (const k of arena.containers) {
    pb.x = P.pos.x; pb.z = P.pos.z; pb.vx = P.vel.x; pb.vz = P.vel.z; pb.cos = cs; pb.sin = sn; pb.angularVel = P.spin;
    cb.x = k.x; cb.z = k.z; cb.cos = k.cos; cb.sin = k.sin; cb.vx = cb.vz = cb.angularVel = 0;
    if (vehicleContact(pb, cb, ct)) {
      const cl = resolveVehicleContact(pb, cb, ct) || 0;
      P.pos.x += ct.nx * ct.depth * 0.9; P.pos.z += ct.nz * ct.depth * 0.9; P.vel.set(pb.vx, 0, pb.vz); P.spin = clamp(pb.angularVel, -2.5, 2.5);
      shake = Math.max(shake, clamp(cl / 12, 0.2, 1));
      if (A.hit <= 0) { A.comboT = 0; A.score = Math.max(0, A.score - 50); A.hit = 0.8; toast('CRASH  -50', '#ff6b6b'); }
    }
  }
}
function stepAI(dt, racing) {
  AIs.forEach((a, n) => {
    if (racing) {
      const i0 = ((Math.floor(a.s) % N) + N) % N;
      const rb = clamp((P.prog - a.prog) / 150 * 0.06, -0.06, 0.1);
      const tgt = a.base * (1 - clamp(curv[i0] * 1.6, 0, 0.36)) * (1 + rb);
      a.speed += (tgt - a.speed) * Math.min(1, dt * 1.2);
      a.s += a.speed * dt / ds;
      a.timer -= dt; if (a.timer <= 0) { a.timer = rand(2.5, 6); a.latT = rand(-7.5, 7.5); }
      a.lat += (a.latT - a.lat) * Math.min(1, dt * 0.7);
    }
    a.prog = a.s + N;
    const g = sample(a.s, a.lat), m = a.mesh;
    m.position.copy(g.p).y += 0.04; m.rotation.y = Math.atan2(g.t.x, g.t.z); m.rotation.x = -Math.atan2(g.t.y, Math.hypot(g.t.x, g.t.z));
    /* drafting: sit close behind a rival to siphon nitro */
    if (racing && !FL.on && !P.finished) {
      const dx = m.position.x - car.position.x, dz = m.position.z - car.position.z, dist = Math.hypot(dx, dz);
      if (dist < 12 && dist > 0.01 && (dx * Math.sin(P.h) + dz * Math.cos(P.h)) / dist > 0.86) P.nitro = Math.min(1, P.nitro + 0.05 * dt);
    }
    /* rigid-body collision with the player (vehicle-physics.js from slop-newyork) */
    if (Math.hypot(P.pos.x - m.position.x, P.pos.z - m.position.z) < 6 && Math.abs(car.position.y - m.position.y) < 2) {
      const yaw = m.rotation.y;
      pb.x = P.pos.x; pb.z = P.pos.z; pb.vx = P.vel.x; pb.vz = P.vel.z; pb.cos = Math.cos(P.h); pb.sin = Math.sin(P.h); pb.angularVel = P.spin;
      ab.x = m.position.x; ab.z = m.position.z; ab.vx = g.t.x * a.speed; ab.vz = g.t.z * a.speed; ab.cos = Math.cos(yaw); ab.sin = Math.sin(yaw); ab.angularVel = 0;
      if (vehicleContact(pb, ab, ct)) {
        const closing = resolveVehicleContact(pb, ab, ct) || 0;
        P.pos.x += ct.nx * ct.depth * 0.6; P.pos.z += ct.nz * ct.depth * 0.6;
        a.lat -= (ct.nx * g.r.x + ct.nz * g.r.z) * ct.depth * 0.4;
        P.vel.set(pb.vx, 0, pb.vz); P.spin = clamp(pb.angularVel, -2.5, 2.5);
        a.speed = clamp(ab.vx * g.t.x + ab.vz * g.t.z, 25, 95); a.lat += clamp((ab.vx * g.r.x + ab.vz * g.r.z) * 0.06, -2, 2);
        shake = Math.max(shake, clamp(closing / 14, 0.15, 1));
      }
    }
  });
}

function updateCamera(dt, boosting, sp) {
  camYaw += angDiff(P.h, camYaw) * (1 - Math.exp(-6 * dt));
  const pk = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : 1, d = (7.4 + sp * 0.025) * pk, want = V3(car.position.x - Math.sin(camYaw) * d, car.position.y + (3.0 + sp * 0.006) * Math.pow(pk, 0.7), car.position.z - Math.cos(camYaw) * d);
  camera.position.lerp(want, 1 - Math.exp(-9 * dt));
  const sh = shake + clamp(sp - 40, 0, 70) * 0.0007 + (boosting ? 0.03 : 0);
  camera.position.x += rand(-1, 1) * sh; camera.position.y += rand(-1, 1) * sh;
  camera.lookAt(car.position.x + Math.sin(camYaw) * 9, car.position.y + 1.4, car.position.z + Math.cos(camYaw) * 9);
  const fov = 62 + (camera.aspect < 1 ? (1 - camera.aspect) * 14 : 0) + clamp(sp - 30, 0, 80) * 0.22 + (boosting ? 9 : 0);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix();
  shake *= Math.exp(-6 * dt);
  sky.position.copy(camera.position);
  followSun();
}

function hud(dt, sp, boosting) {
  if (cfg.type === 'arena') { $('ascore').textContent = Math.floor(A.score).toLocaleString(); $('acombo').textContent = A.comboT > 0 ? `DRIFT  x${A.mult}` : 'DRIFT TO SCORE'; $('atime').textContent = fmt(Math.max(0, A.t)); }
  const all = [{ p: P.prog, me: true }, ...AIs.map(a => ({ p: a.prog }))].sort((a, b) => b.p - a.p);
  const rank = all.findIndex(o => o.me) + 1;
  if (state === 'race' && !P.finished && cfg.type !== 'arena') {
    ovCool -= dt;
    if (rank < lastRank && ovCool <= 0) { toast(`OVERTAKE  +${lastRank - rank}`); P.nitro = Math.min(1, P.nitro + 0.12); ovCool = 0.9; }
    lastRank = rank; P.rank = rank;
  }
  $('pos').innerHTML = cfg.ai ? `${P.rank}<small>/${cfg.ai + 1}</small>` : 'TT';
  $('lap').textContent = `LAP ${clamp(P.crosses, 1, TOTAL)}/${TOTAL}`;
  $('time').textContent = fmt(raceT);
  const kph = Math.round(sp * 3.6); $('spd').textContent = kph;
  $('ring').style.strokeDashoffset = 389.6 * (1 - clamp(kph / (CS.top * 3.6 + 48), 0, 1));
  $('ring').style.stroke = boosting ? '#7ff' : '#3cf';
  $('nit').textContent = `NITRO ${Math.round(P.nitro * 100)}%`;
  const dOn = RD.comboT > 0 && RD.pts > 50 && cfg.type !== 'arena';
  $('driftHud').style.opacity = dOn ? 1 : 0;
  if (dOn) { $('driftPts').textContent = `DRIFT ${Math.floor(RD.pts).toLocaleString()}`; $('driftMult').textContent = `x${RD.mult}`; }
  document.body.classList.toggle('flying', FL.on);
  if (FL.on) $('altbar').style.height = `${clamp(FL.alt / 42, 0, 1) * 100}%`;
  $('fx').style.opacity = clamp((kph - 200) / 140, 0, 1) * (boosting ? 1 : 0.55);
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').style.opacity = 0;
  mc.clearRect(0, 0, mm.width, mm.height); mc.drawImage(mmBase, 0, 0);
  AIs.forEach(a => { const [x, y] = mxy(a.mesh.position.x, a.mesh.position.z); mc.fillStyle = a.css; mc.beginPath(); mc.arc(x, y, 8, 0, 7); mc.fill(); mc.strokeStyle = '#000'; mc.lineWidth = 2; mc.stroke(); });
  const [px, py] = mxy(P.pos.x, P.pos.z); mc.fillStyle = '#fff'; mc.beginPath(); mc.arc(px, py, 10, 0, 7); mc.fill(); mc.strokeStyle = '#3cf'; mc.lineWidth = 4; mc.stroke();
  if (ghostCar && ghostCar.active && ghostCar.group.visible) { const [gx, gy] = mxy(ghostCar.group.position.x, ghostCar.group.position.z); mc.strokeStyle = '#8df'; mc.lineWidth = 3; mc.beginPath(); mc.arc(gx, gy, 8, 0, 7); mc.stroke(); }
}

/* multiplayer race end: live standings from the room, fixed payout, no boards */
let mpRefT = 0;
function finishMp() {
  P.finished = true; setState('finished');
  net.onFinish(Math.round(raceT * 1000), P.prog);
  const rows = [{ name: 'YOU', me: true, uid: net.uid(), tms: Math.round(raceT * 1000), prog: P.prog, fin: true },
    ...net.players.filter(p => p.uid !== net.uid()).map(p => ({ name: p.name || 'RIVAL', uid: p.uid, tms: p.tms || 0, prog: p.prog || 0, fin: !!p.fin }))]
    .sort((a, b) => (b.fin - a.fin) || ((a.fin && b.fin) ? a.tms - b.tms : b.prog - a.prog));
  const place = rows.findIndex(r => r.me) + 1;
  const pay = [6000, 4000, 2500, 1500, 1000, 800];
  const cash = Math.round((pay[Math.min(place - 1, pay.length - 1)] || 500) * Math.min(4, Math.max(1, rows.length / 2)));
  P.mpCash = cash;
  economy.stats.races++; if (place === 1) economy.stats.wins++;
  economy.add(cash); economy.saveStats();
  renderMpResults(rows, place, cash);
  if (place === 1) { confetti(80); sfxMission(); } else sfxCoin();
  $('fNext').style.display = 'none'; $('fRetry').style.display = 'none';
  setTimeout(() => { if (state === 'finished') show('finish', true); }, 1200);
}
function renderMpResults(rows, place, cash) {
  if (state !== 'finished' || cfg.mode !== 'mp') return;
  $('fh').textContent = place === 1 ? 'ONLINE WINNER!' : `${ord(place)} OF ${rows.length}`;
  $('fp').textContent = `Room ${net.code}  ·  Time ${fmt(raceT)}`;
  $('fres').innerHTML = rows.map((r, i) => `<div class="rr${r.me ? ' me' : ''}"><b>${i + 1}</b><span>${esc(r.name)}</span><em>${r.fin ? fmt(r.tms / 1000) : 'RACING…'}</em></div>`).join('');
  $('fearn').innerHTML = `<div class="lbl">EARNINGS</div><div class="rr"><span>Online race reward</span><em style="color:#7dff8a">+$${cash.toLocaleString()}</em></div><div class="rr me"><span>TOTAL CASH</span><em style="color:#7dff8a">$${economy.money.toLocaleString()}</em></div>`;
  $('fmis').innerHTML = '';
}
/* multiplayer lobby UI — exactly one panel visible: home / join-step / lobby */
let mpStep = 'home';
function renderMp() {
  const lobby = $('mpLobby'), home = $('mpHome'), join = $('mpJoin');
  if (!lobby || !home || !join) return;
  if (net.active) mpStep = 'home';
  home.classList.toggle('hide', net.active || mpStep === 'join');
  join.classList.toggle('hide', net.active || mpStep !== 'join');
  lobby.classList.toggle('hide', !net.active);
  if (!net.active) return;
  const list = $('mpList'), code = $('mpCode'), stat = $('mpStat');
  if (code) code.textContent = net.code;
  const rs = net.players.length, host = net.isHost && net.room && net.room.status === 'lobby';
  if (list) list.innerHTML = net.players.map((p, i) => `<div class="rr${p.uid === net.uid() ? ' me' : ''}"><b>${i + 1}</b><span>${esc(p.name || 'RIVAL')}${p.uid === net.uid() ? ' · YOU' : ''}</span><em>${p.fin ? 'FINISHED' : (net.room && net.room.status === 'racing' ? 'RACING' : 'READY')}</em></div>`).join('') || '<div class="lbl">WAITING FOR DRIVERS…</div>';
  if (stat) stat.textContent = !net.room ? 'CONNECTING…' : net.room.status === 'racing' ? 'RACE LIVE · FINISH THE LAPS!' : `${rs} DRIVER${rs === 1 ? '' : 'S'} IN LOBBY · ${net.room.laps || 3} LAPS · ${String(net.room.env || 'day').toUpperCase()}`;
  if ($('mpStart')) $('mpStart').style.display = host ? '' : 'none';
}

function finishRace() {
  if (cfg.mode === 'mp') { finishMp(); return; }
  P.finished = true; setState('finished');
  if (FL.on) FL.land = true;
  const arenaOn = cfg.type === 'arena', sc = Math.floor(A.score);
  let rows;
  if (arenaOn) {
    const base = [16000, 12500, 9500, 7000, 4500], kk = [0.8, 1, 1.25][cfg.diff] * A.dur / 90;
    rows = [{ name: 'YOU', me: true, val: sc }, ...AI.map((a, i) => ({ name: a.name, val: Math.round(base[i] * kk * (0.9 + Math.random() * 0.2)) }))].sort((a, b) => b.val - a.val);
  } else rows = [{ name: 'YOU', me: true, prog: P.prog }, ...AIs.map(a => ({ name: a.name, prog: a.prog }))].sort((a, b) => b.prog - a.prog);
  const place = rows.findIndex(r => r.me) + 1; P.rank = place;
  /* economy: race rewards, drift bonus, flight bonus + mission checks */
  economy.stats.races++; if (!arenaOn && place === 1 && cfg.ai) economy.stats.wins++;
  const earnRows = []; let cash = 0;
  if (!arenaOn) {
    if (cfg.ai) {
      const base = [15000, 10000, 7000, 4000][Math.min(place - 1, 3)];
      cash = Math.round(base * (1 + (cfg.laps - 1) * 0.08) * [0.8, 1, 1.25][cfg.diff] * (cfg.mode === 'tour' ? 1.5 : 1));
      earnRows.push(['Race reward', cash]);
    } else {
      const key = `sr.best.${cfg.mode}.${cfg.laps}`, prev = store.get(key, null);
      if (prev === null || raceT < prev) { cash = 5000; earnRows.push(['New best time', 5000]); }
    }
  } else { cash = Math.round(sc / 2); earnRows.push(['Drift score bonus', cash]); }
  const db = arenaOn ? 0 : Math.round(RD.pts / 10);
  if (db > 0) { cash += db; earnRows.push(['Drift bonus', db]); }
  const fb = Math.round(FL.time * (cfg.env === 'nightRain' ? 180 : 100));
  if (fb > 0) { cash += fb; earnRows.push(['Flight time bonus' + (cfg.env === 'nightRain' ? ' ×1.8' : ''), fb]); }
  if (cfg.env === 'nightRain' && cash > 0) { const nb = Math.round(cash * 0.8); cash += nb; earnRows.push(['NIGHT CIRCUIT BONUS ×1.8', nb]); }
  economy.add(cash);
  let misDone = missionEvent('finish', 1);
  if (!arenaOn && place <= 3) misDone = misDone.concat(missionEvent('podium', 1));
  if (!arenaOn && place === 1 && cfg.ai) misDone = misDone.concat(missionEvent('win', 1));
  misDone = misDone.concat(missionEvent('drift', arenaOn ? sc : Math.floor(RD.pts)));
  misDone = misDone.concat(missionEvent('pads', RD.pads));
  misDone = misDone.concat(missionEvent('fly', FL.time));
  misDone = misDone.concat(missionEvent('own', economy.ownedCount()));
  misDone = misDone.concat(missionEvent('earn', cash));
  if (cfg.env === 'nightRain') {
    misDone = misDone.concat(missionEvent('nightdrift', arenaOn ? sc : Math.floor(RD.pts)));
    misDone = misDone.concat(missionEvent('nightfly', FL.time));
    if (!arenaOn && place === 1 && cfg.ai) misDone = misDone.concat(missionEvent('nightwin', 1));
  }
  economy.saveStats();
  /* ghost save + global board submission (Firebase, silent if offline) */
  const fgl = $('fglobal'); if (fgl) fgl.textContent = '';
  if (!arenaOn && cfg.mode !== 'tour' && !cfg.ai) {
    const key = `sr.best.${cfg.mode}.${cfg.laps}`, prev = store.get(key, null), isBest = prev === null || raceT < prev;
    if (isBest) {
      const flat = GR.finish();
      if (flat) store.set(`sr.ghost.${cfg.mode}.${cfg.laps}`, flat);
      if (cloud.status === 'online' && flat) {
        const cat = `${cfg.mode}${cfg.laps}`;
        if (fgl) fgl.textContent = '\u2601 SUBMITTING TO GLOBAL BOARD\u2026';
        cloud.uploadGhost(cat, driverName(), economy.selected(), curColor, flat).then(id => {
          cloud.submitScore(cat, { name: driverName(), car: economy.selected(), val: Math.round(raceT * 1000), ghostId: id }, true).then(ok => {
            if (fgl) fgl.textContent = ok ? '\u2601 GLOBAL BEST SUBMITTED \u2014 THE WORLD CAN RACE YOUR GHOST!' : '';
            if (ok) toast('GLOBAL TIME SUBMITTED \u2601', '#8df');
          });
        });
      }
    }
  } else if (arenaOn && cfg.mode !== 'tour') {
    const prevA = store.get(`sr.best.arena.${A.dur}`, null);
    if (prevA === null || sc > prevA) {
      if (fgl) fgl.textContent = '\u2601 SUBMITTING TO GLOBAL BOARD\u2026';
      cloud.submitScore(`arena${A.dur}`, { name: driverName(), car: economy.selected(), val: sc }, false).then(ok => {
        if (fgl) fgl.textContent = ok ? '\u2601 GLOBAL SCORE SUBMITTED!' : '';
      });
    }
  }
  const extra = r => (r.val !== undefined ? `<em>${r.val.toLocaleString()}</em>` : '');
  let head = arenaOn ? (place === 1 ? 'DRIFT KING!' : `${ord(place)} PLACE`) : (!cfg.ai ? 'FINISHED' : place === 1 ? 'YOU WIN!' : `${ord(place)} PLACE`);
  let sub = arenaOn ? `Score ${sc.toLocaleString()}  ·  Best combo x${A.maxMult}  ·  Cones ${A.cones}` : `Time ${fmt(raceT)}`;
  if (!arenaOn && bestLap < 1e8) sub += `  ·  Best lap ${fmt(bestLap)}`;
  let list = rows.map((r, i) => `<div class="rr${r.me ? ' me' : ''}"><b>${i + 1}</b><span>${r.name}</span>${extra(r)}</div>`).join('');
  let next = false;
  const myCups = cfg.chapter === 'night' ? NCUPS : CUPS;
  let myT = cfg.chapter === 'night' ? NT : T;
  if (cfg.mode === 'tour' && myT) {
    rows.forEach((r, i) => { r.pts = PTS[i] || 0; myT.pts[r.name] = (myT.pts[r.name] || 0) + r.pts; });
    myT.round++;
    list = rows.map((r, i) => `<div class="rr${r.me ? ' me' : ''}"><b>${i + 1}</b><span>${r.name}</span><em>+${r.pts}</em><i>${myT.pts[r.name]} pts</i></div>`).join('');
    if (myT.round >= myCups.length) {
      const fin = Object.entries(myT.pts).sort((a, b) => b[1] - a[1]), fp = fin.findIndex(([n]) => n === 'YOU') + 1;
      head = fp === 1 ? (cfg.chapter === 'night' ? 'NIGHT KING!' : 'CHAMPION!') : `FINAL: ${ord(fp)}`; sub = cfg.chapter === 'night' ? 'Night Circuit complete · the streets bow to you' : 'Tournament complete';
      list = fin.map(([n, p], i) => `<div class="rr${n === 'YOU' ? ' me' : ''}"><b>${i + 1}</b><span>${n}</span><i>${p} pts</i></div>`).join('');
      if (cfg.chapter === 'night') { NT = null; store.set('sr.nt', null); } else { T = null; store.set('sr.t', null); }
    } else {
      if (cfg.chapter === 'night') { NT = myT; store.set('sr.nt', NT); } else { T = myT; store.set('sr.t', T); }
      next = true; $('fNext').textContent = `NEXT: ${myCups[myT.round].name}`;
    }
  } else if (cfg.mode !== 'tour') {
    if (arenaOn) {
      const key = `sr.best.arena.${A.dur}`, prev = store.get(key, null);
      if (prev === null || sc > prev) { store.set(key, sc); sub += '  ·  NEW BEST!'; } else sub += `  ·  Best ${prev.toLocaleString()}`;
    } else {
      const key = `sr.best.${cfg.mode}.${cfg.laps}`, prev = store.get(key, null);
      if (prev === null || raceT < prev) { store.set(key, raceT); sub += '  ·  NEW BEST!'; } else sub += `  ·  Best ${fmt(prev)}`;
    }
  }
  $('fh').textContent = head; $('fp').textContent = sub; $('fres').innerHTML = list;
  $('fearn').innerHTML = earnRows.length ? '<div class="lbl">EARNINGS</div>' + earnRows.map(([n, v]) => `<div class="rr"><span>${n}</span><em style="color:#7dff8a">+$${v.toLocaleString()}</em></div>`).join('') + `<div class="rr me"><span>TOTAL CASH</span><em style="color:#7dff8a">$${economy.money.toLocaleString()}</em></div>` : '';
  $('fmis').innerHTML = misDone.length ? '<div class="lbl">MISSIONS COMPLETE</div>' + misDone.map(m => `<div class="rr me"><span>\u2b50 ${m.name}</span><em style="color:#e8b800">+$${m.reward.toLocaleString()}</em></div>`).join('') : '';
  if ((place === 1 && cfg.ai) || misDone.length) { confetti(place === 1 ? 110 : 45); if (place === 1 && cfg.ai) sfxMission(); else sfxCoin(); }
  $('fNext').style.display = next ? '' : 'none'; $('fRetry').style.display = cfg.mode === 'tour' ? 'none' : '';
  setTimeout(() => { if (state === 'finished') show('finish', true); }, 1200);
}

/* ---------- economy UI: garage, missions, daily bonus, confetti ---------- */
function updateMoneyUI() {
  const el = $('moneyVal'); if (el) el.textContent = '$' + economy.money.toLocaleString();
  if (lastScreen === 'garage') renderGarage();
  updateNightUI();
}
const statBar = (label, v) => `<div class="bar"><span>${label}</span><i style="--w:${Math.round(clamp(v, 0, 1) * 100)}%"></i></div>`;
function renderGarage() {
  const list = $('carList'); if (!list) return;
  list.innerHTML = CARS.map(c => {
    const owned = economy.has(c.id), sel = economy.selected() === c.id, afford = economy.money >= c.price;
    const tags = [c.stats.fly ? '<span class="tag fly">FLYING \u2708</span>' : '', owned ? '<span class="tag own">OWNED</span>' : (c.tag && !(c.stats.fly && /FLYING/i.test(c.tag)) ? `<span class="tag">${c.tag}</span>` : ''), sel ? '<span class="tag sel">SELECTED</span>' : ''].join(' ');
    const price = owned ? (sel ? 'SELECTED' : 'OWNED') : '$' + c.price.toLocaleString();
    return `<div class="carCard${sel ? ' sel' : ''}${!owned && !afford ? ' locked' : ''}" data-car="${c.id}">
      <div class="top"><span>${c.name}</span> ${tags}<span class="price ${owned ? 'own' : afford ? '' : 'no'}">${price}</span></div>
      <div class="desc">${c.desc}</div>
      <div class="bars">${statBar('SPEED', c.stats.top / 132)}${statBar('ACCEL', c.stats.accel / 68)}${statBar('GRIP', (c.stats.steer - 1.5) / 0.8)}</div>
    </div>`;
  }).join('');
}
function garageClick(id) {
  const c = getCar(id), owned = economy.has(id);
  if (owned) { applyPlayerCar(id); rebuildCar(id); toast(`${c.name} SELECTED`, '#7df'); sfxPad(); renderGarage(); return; }
  if (economy.money >= c.price) {
    economy.buy(id, c.price); applyPlayerCar(id); rebuildCar(id); sfxMission(); confetti(45);
    toast(`${c.name} PURCHASED!`, '#7dff8a'); renderGarage();
  } else { toast(`NEED $${(c.price - economy.money).toLocaleString()} MORE`, '#ff7b7b'); beep(220, 0.2, 'square', 0.1); }
}
function renderMissions() {
  const list = $('misList'); if (!list) return;
  list.innerHTML = missionState().map(m => {
    return `<div class="mr${m.done ? ' done' : ''}"><div class="ic">${m.done ? '\u2714' : '\u2605'}</div>
      <div class="tt"><b>${m.name}</b><small>${m.desc}</small></div>
      <div class="rw${m.done ? ' done' : ''}"><small>${m.done ? 'DONE' : `${Math.floor(m.p).toLocaleString()} / ${m.target.toLocaleString()}`}</small>+$${m.reward.toLocaleString()}</div></div>`;
  }).join('');
  $('misStat').textContent = `${missionsCompleted()}/${MISSIONS.length} COMPLETE \u00b7 TOTAL EARNED $${economy.stats.earned.toLocaleString()}`;
}
const todayStr = () => new Date().toISOString().slice(0, 10);
function yesterdayStr() { const t = new Date(); t.setDate(t.getDate() - 1); return t.toISOString().slice(0, 10); }
const dailyAmt = streak => 1000 + 500 * Math.min(streak, 8);
function renderDaily() {
  const b = $('dailyBtn'); if (!b) return;
  const d = economy.getDaily(), can = !d || d.last !== todayStr();
  const streak = d && d.last === yesterdayStr() ? d.streak : 0;
  if (can) { b.disabled = false; b.classList.add('pulse'); b.textContent = `DAILY BONUS \u00b7 $${dailyAmt(streak + 1).toLocaleString()} (STREAK ${streak + 1}) \u2014 CLAIM!`; }
  else { b.disabled = true; b.classList.remove('pulse'); b.textContent = `DAILY CLAIMED \u00b7 STREAK ${d.streak} \u2014 BACK TOMORROW`; }
}
function claimDaily() {
  const d = economy.getDaily(); if (d && d.last === todayStr()) return;
  const streak = (d && d.last === yesterdayStr() ? d.streak : 0) + 1, amt = dailyAmt(streak);
  economy.setDaily({ last: todayStr(), streak, amt });
  economy.add(amt); sfxMission(); confetti(55); toast(`DAILY BONUS +$${amt.toLocaleString()}`, '#ffd76a'); renderDaily();
}
function confetti(n = 90) {
  const box = $('confetti'); if (!box) return;
  const cols = ['#ffd76a', '#7dff8a', '#7ddfff', '#ff7bd5', '#ffffff', '#ff9a52'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'cf';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = cols[(Math.random() * cols.length) | 0];
    d.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
    d.style.animationDelay = (Math.random() * 0.5) + 's';
    d.style.width = (6 + Math.random() * 8) + 'px'; d.style.height = (10 + Math.random() * 8) + 'px';
    box.appendChild(d); setTimeout(() => d.remove(), 4600);
  }
}

/* ---------- cloud (Firebase): badge, profile sync, global boards, rival ghosts ---------- */
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, '');
const carName = id => { const c = getCar(id); return c ? c.name : 'CAR'; };
const driverName = () => cloud.name(store.get('sr.name', 'KAY'));
let boardCache = {};
function updateCloudUI() {
  const st = cloud.status, b = $('cloudBadge');
  if (b) { b.className = 'pill ' + (st === 'online' ? 'on' : st === 'connecting' ? 'wait' : 'off'); $('cloudTxt').textContent = 'CLOUD ' + (st === 'online' ? 'ONLINE' : st === 'connecting' ? '\u2026' : 'OFFLINE'); }
  const dchip = $('driverNameTxt'); if (dchip) dchip.textContent = driverName();
  const dav = $('dAv'); if (dav) dav.textContent = (driverName()[0] || 'K').toUpperCase();
  const os = $('cloudStat'); if (os) os.textContent = st === 'online' ? '\u2601 CONNECTED AS ' + driverName() : st === 'connecting' ? 'CLOUD: CONNECTING\u2026' : 'CLOUD OFFLINE \u00b7 LOCAL PROGRESS ONLY';
  const ae = $('acctEmail'); if (ae) ae.textContent = cloud.email ? 'ACCOUNT \u00b7 ' + cloud.email : (st === 'online' ? 'CLOUD \u00b7 ' + driverName() : 'OFFLINE MODE \u00b7 PROGRESS SAVES ON THIS DEVICE');
  const dn = $('dname');
  if (dn && document.activeElement !== dn) dn.value = driverName();
}
let pushT = 0;
function cloudPush() {
  if (cloud.status !== 'online') return;
  clearTimeout(pushT);
  pushT = setTimeout(() => cloud.pushProfile(driverName(), { money: economy.money, owned: economy.owned, sel: economy.sel, stats: economy.stats, missions: economy.getMissions(), daily: economy.getDaily() }), 2500);
}
async function cloudSyncIn() {
  if (cloud.status !== 'online') return;
  const remote = await cloud.pullProfile(driverName());
  if (!remote) { cloudPush(); return; }
  let merged = false;
  if ((remote.money || 0) > economy.money) { economy.setMoney(remote.money); merged = true; }
  const newCars = (remote.owned || []).filter(id => !economy.has(id));
  if (newCars.length) { economy.unlockAll(newCars); merged = true; }
  const s = remote.stats || {};
  ['earned', 'races', 'wins'].forEach(k => { if ((s[k] || 0) > economy.stats[k]) { economy.stats[k] = s[k]; merged = true; } });
  const rm = remote.missions || {};
  if (Object.keys(rm).length) {
    const cur = economy.getMissions() || {};
    for (const id in rm) {
      const a = cur[id] || { p: 0, done: false }, b = rm[id] || {};
      if ((b.p || 0) > (a.p || 0) || (b.done && !a.done)) { cur[id] = { p: Math.max(a.p || 0, b.p || 0), done: !!(a.done || b.done) }; merged = true; }
    }
    economy.setMissions(cur); missionsInit();
  }
  const rd = remote.daily;
  if (rd && rd.last && !(economy.getDaily() && economy.getDaily().last >= rd.last)) { economy.setDaily(rd); merged = true; }
  if (merged) { economy.save(); updateMoneyUI(); toast('CLOUD: PROGRESS RESTORED \u2601', '#8df'); }
  cloudPush();
}
function bootCloud() {
  cloud.onStatus(updateCloudUI);
  updateCloudUI();
  /* fired by boot.js after a successful sign-in (or session restore) */
  addEventListener('ksr-auth', () => { updateCloudUI(); cloudSyncIn(); });
  window.addEventListener('ksr-money', cloudPush);
  const dn = $('dname');
  if (dn) dn.addEventListener('change', () => { store.set('sr.name', cloud.name(dn.value || 'KAY')); updateCloudUI(); toast('DRIVER: ' + driverName(), '#8df'); cloudSyncIn(); });
  const mb = $('moneyBadge');
  if (mb) mb.addEventListener('click', () => { if (cloud.status === 'online') { toast('SYNCING CLOUD\u2026', '#8df'); cloudSyncIn(); } });
}
/* ghost replay for the current race: cfg.ghost (rival download) or local best */
function setupGhost() {
  if (ghostCar && ghostCar.group.parent) scene.remove(ghostCar.group);
  ghostCar = null;
  if (cfg.type === 'arena') return;
  const rival = cfg.ghost, local = !rival && cfg.mode === 'tt' ? store.get(`sr.ghost.tt.${cfg.laps}`, null) : null;
  const flat = rival || local;
  if (flat && flat.length >= 10) {
    const id = cfg.ghostCar || economy.selected();
    ghostCar = makeGhostCar(id, cfg.ghostColor || 0x66ddff, getCar(id).tint || null, cfg.ghostName || 'MY GHOST');
    ghostCar.set(flat);
  }
}
/* online rivals */
async function raceRival() {
  const top = (boardCache[opt.board] || [])[0];
  if (!top || !top.ghostId) return;
  toast('FETCHING RIVAL GHOST\u2026', '#8df');
  const g = await cloud.fetchGhost(top.ghostId);
  if (!g || !g.flat || g.flat.length < 10) { toast('GHOST UNAVAILABLE', '#ff7b7b'); return; }
  const laps = opt.board === 'race3' ? 3 : opt.board.startsWith('tt') ? Math.max(1, +opt.board.slice(2) || 3) : 3;
  startRace({ mode: 'tt', laps, diff: 1, ai: 0, env: opt.env, ghost: g.flat, ghostCar: g.car || 'cruiser', ghostColor: g.color || 0x66ddff, ghostName: 'RIVAL ' + (g.name || top.name || '?'), title: `VS ${g.name || top.name || 'GHOST'}` });
}
async function renderBoard() {
  updateCloudUI();
  const cat = opt.board, list = $('boardList'); if (!list) return;
  list.innerHTML = '<div class="lbl">LOADING\u2026</div>';
  const entries = await cloud.fetchBoard(cat);
  if (entries === null) { list.innerHTML = '<div class="lbl">CLOUD OFFLINE \u00b7 NO GLOBAL BOARD</div>'; $('rivalGo').style.display = 'none'; return; }
  boardCache[cat] = entries;
  if (!entries.length) list.innerHTML = '<div class="lbl">NO TIMES YET \u00b7 BE THE FIRST!</div>';
  else {
    const isTime = !cat.startsWith('arena'), mine = driverName();
    list.innerHTML = entries.slice(0, 12).map((e, i) =>
      `<div class="rr${e.name === mine ? ' me' : ''}"><b>${i + 1}</b><span>${esc(e.name)}${e.ghostId ? ' \u{1F47B}' : ''}</span><em>${esc(carName(e.car))}</em><i>${isTime ? fmt((e.val || 0) / 1000) : Math.round(e.val || 0).toLocaleString()}</i></div>`).join('');
  }
  const top = entries[0];
  $('rivalGo').style.display = top && top.ghostId ? '' : 'none';
}

/* ---------- main loop ---------- */
const TURBO = location.search.includes('turbo'); /* dev/testing: unclamp dt so game time runs in real time on slow machines */
let last = performance.now(), fAcc = 0, fN = 0;
let errT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (glLost) return; /* context dead - three.js would draw nothing anyway */
  try { frameBody(now); } catch (err) { console.error(err); if (performance.now() - errT > 3000) { errT = performance.now(); toast('ENGINE ERROR · AUTO-RECOVERED', '#ffd166'); } }
}
function frameBody(now) {
  const raw = (now - last) / 1000, dt = Math.min(TURBO ? 1 : 0.05, raw); last = now;
  if (state === 'paused') { composer.render(); return; }
  if (state === 'race') {
    fAcc += raw; fN++;
    if (fAcc > 2.5) { if (fAcc / fN > 1 / 42 && pr > 1.25) { pr = Math.max(1.25, pr - 0.25); renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); } fAcc = 0; fN = 0; }
  } else { fAcc = 0; fN = 0; }
  if (state === 'count') {
    cdT -= dt; const n = Math.ceil(cdT); $('cd').textContent = n > 0 ? n : 'GO';
    ['l1', 'l2', 'l3'].forEach((l, i) => { $(l).className = n <= 0 ? 'g' : (i < 4 - n ? 'r' : ''); });
    if (cdT <= 0) { setState('race'); goT = 0.9; }
  }
  if (goT > 0 && (goT -= dt) <= 0) $('count').style.display = 'none';
  const racing = state === 'race' || state === 'finished';
  if (state === 'race') raceT += dt;
  const out = stepPlayer(dt, racing);
  stepAI(dt, racing);
  if (state === 'race' && !P.finished && cfg.type !== 'arena') GR.tick(raceT, car.position, P.h);
  if (ghostCar && ghostCar.active) ghostCar.update(scene, raceT);
  if (state === 'race' && cfg.type === 'arena') { A.t -= dt; if (A.t <= 0 && !P.finished) { A.t = 0; finishRace(); } }
  if (state === 'race' && cfg.type !== 'arena') {
    if (P.crosses !== prevCrosses) {
      if (P.crosses > prevCrosses) { if (P.crosses >= 2) { const lt = raceT - lapStart; bestLap = Math.min(bestLap, lt); if (P.crosses <= TOTAL) toast(`LAP ${P.crosses - 1}   ${fmt(lt)}`, '#ffffff'); } lapStart = raceT; }
      prevCrosses = P.crosses;
    }
    if (!P.finished && P.crosses >= TOTAL + 1) finishRace();
  }
  smoke.forEach(o => { if (o.life > 0) { o.life -= dt; o.s.position.addScaledVector(o.vel, dt); o.s.scale.addScalar(dt * 3.5); o.s.material.opacity = Math.max(0, o.life / o.max) * 0.4; if (o.life <= 0) o.s.visible = false; } });
  pollPad();
  pads.concat(padsNight).forEach(p => { const u = p.userData; if (u.cd > 0) u.cd -= dt; if (u.flash > 0) u.flash -= dt * 1.5; p.material.opacity = 0.55 + Math.sin(performance.now() * 0.004 + u.k) * 0.15 + Math.max(0, u.flash) * 0.4; });
  arena.update(dt);
  updateRain(dt);
  net.tick(dt, state === 'race', P, raceT, P.finished);
  if (cfg.mode === 'mp' && state === 'finished') {
    mpRefT -= dt;
    if (mpRefT <= 0) {
      mpRefT = 0.7;
      const rows = [{ name: 'YOU', me: true, tms: Math.round(raceT * 1000), prog: P.prog, fin: true },
        ...net.players.filter(p => p.uid !== net.uid()).map(p => ({ name: p.name || 'RIVAL', tms: p.tms || 0, prog: p.prog || 0, fin: !!p.fin }))]
        .sort((a, b) => (b.fin - a.fin) || ((a.fin && b.fin) ? a.tms - b.tms : b.prog - a.prog));
      renderMpResults(rows, rows.findIndex(r => r.me) + 1, P.mpCash || 0);
    }
  }
  if (state === 'menu') {
    /* showroom camera: slow cinematic orbit with the car framed on the right side of the screen */
    menuT += dt * 0.15;
    const r = 9.2 + Math.sin(menuT * 0.6) * 1.2, a = menuT;
    camera.position.set(car.position.x + Math.sin(a) * r, car.position.y + 2.0 + Math.sin(menuT * 0.45) * 0.5, car.position.z + Math.cos(a) * r);
    const look = V3(car.position.x, car.position.y + 0.8, car.position.z);
    look.addScaledVector(V3(Math.cos(a), 0, -Math.sin(a)), -(camera.aspect < 1 ? 0.9 : 2.3));
    camera.lookAt(look);
    camera.fov += (45 - camera.fov) * 0.08; camera.updateProjectionMatrix(); sky.position.copy(camera.position); followSun();
  } else updateCamera(dt, out.boosting, out.sp);
  updateStreaks(dt, state === 'menu' ? 0 : out.sp, out.boosting);
  hud(dt, out.sp, out.boosting); audioUpdate(state === 'menu' ? -1 : out.sp, out.boosting, FL.on);
  composer.render();
}
/* boot */
muted = opt.snd === 'off';
economy.init(); missionsInit();
bootCloud();
if (store.get('sr.glfix', 0)) { store.set('sr.glfix', 0); setTimeout(() => toast('GRAPHICS RECOVERED · GO RACE', '#8df'), 900); }
net.init({
  THREE, scene, toast, driverName,
  mkCar: (id, color) => makeCar(color, carGeo(id), getCar(id).tint || null),
  carId: () => economy.selected(), carColor: () => curColor,
  optEnv: () => opt.env, optLaps: () => opt.laps,
  netGo(room) { startRace({ mode: 'mp', laps: room.laps || 3, env: room.env || 'day', ai: 0, diff: 2, title: `ROOM ${net.code} · ${net.players.length} DRIVERS` }); },
  inRace: () => state === 'race' || state === 'count' || state === 'finished',
  onLobby: () => renderMp()
});
const mpIn = $('mpCodeIn');
if (mpIn) {
  mpIn.addEventListener('input', () => {
    mpIn.value = mpIn.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
    const ec = $('mpCodeEcho'); if (ec) ec.textContent = mpIn.value || '\u00a0';
  });
  mpIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act('mpJoin'); } });
}
const swHTML = COLORS.map(c => `<button class="sw" data-c="${c}" style="background:#${c.toString(16).padStart(6, '0')}" aria-label="Paint"></button>`).join('');
$('swatches').innerHTML = swHTML; $('paintBar').innerHTML = swHTML; $('paintBtn').onclick = () => $('paintBar').classList.toggle('open');
paintPlayer(store.get('sr.color', COLORS[0]));
rebuildCar(economy.selected());
window.addEventListener('ksr-money', updateMoneyUI);
updateMoneyUI();
syncSegs(); applyQuality(); gateBoot();
if (TURBO) window.__DBG = { P, FL, keys, pts, tan, N, get CS() { return CS; } }; /* dev test hook */
requestAnimationFrame(frame);

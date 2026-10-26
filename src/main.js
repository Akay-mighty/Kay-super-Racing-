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

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TOTAL = 3, W = 13, N = 700, WALL = W + 2.6;

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

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.35, 2.2));
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const canvasTex = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
};

/* ---------- sky, light ---------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2500, 24, 16),
  new THREE.MeshBasicMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false,
    map: canvasTex(2, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      [[0, '#2d86ee'], [0.38, '#6db4f2'], [0.5, '#cfe4f6'], [1, '#cfe0f0']].forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    })
  })
);
scene.add(sky);
const cloudTex = canvasTex(128, 64, (g, w, h) => {
  for (let i = 0; i < 9; i++) {
    const x = rand(30, 98), y = rand(24, 40), r = rand(14, 26), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
});
for (let i = 0; i < 46; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
  const a = rand(0, 6.283), r = rand(1000, 2000);
  s.position.set(Math.cos(a) * r, rand(180, 520), Math.sin(a) * r); s.scale.set(rand(380, 700), rand(160, 260), 1);
  scene.add(s);
}
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x607080, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 500 });
scene.add(sun, sun.target);

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
strip(-W, 0, W, 0, i => asph[(i >> 3) & 1]);
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

/* city: one merged mesh, window UVs scaled to real building size */
{
  const win = canvasTex(512, 512, g => {
    g.scale(2, 2); g.fillStyle = '#aab8c6'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const lit = Math.random() < 0.2; g.fillStyle = lit ? '#ffe9a8' : (Math.random() < 0.5 ? '#2e4256' : '#3d556b'); g.fillRect(x * 32 + 5, y * 16 + 3, 22, 10);
    }
  });
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
  const city = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: win, vertexColors: true, roughness: 0.45, metalness: 0.2 }));
  city.castShadow = city.receiveShadow = true; scene.add(city);
}

/* billboards */
{
  const mk = (a, b, txt) => canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'italic 900 52px Segoe UI,Arial'; g.textAlign = 'center'; g.fillText(txt, w / 2, h / 2 + 18);
  });
  const texs = [mk('#ff2d78', '#ffb347', 'NITRO'), mk('#00c6ff', '#6a11cb', 'SUPER'), mk('#f7971e', '#ffd200', 'TURBO'), mk('#11998e', '#38ef7d', 'DRIFT')];
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

/* ---------- cars ---------- */
const SPORT_GEO = buildCarGeometry(SPORT);
const PART = { 1: '#0e1a26', 2: '#09090b', 3: '#c9ced6', 4: '#16191e', 6: '#222222', 7: '#101114', 8: '#101114' };
const carMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.12 });
function makeCar(color) {
  const g = new THREE.Group(), geo = SPORT_GEO.clone();
  const pid = geo.attributes.partId.array, pos = geo.attributes.position.array, cl = new Float32Array(pid.length * 3);
  const paint = new THREE.Color(color), stripe = new THREE.Color(0xd42a2a), tmp = new THREE.Color();
  for (let i = 0; i < pid.length; i++) {
    const id = pid[i], x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1];
    let c;
    if (id === 0 || id === 5) c = id === 0 && ((x < 0.17 && y > 0.55) || (x > 0.9 && y > 0.42 && y < 0.5)) ? stripe : paint;
    else c = tmp.set(PART[id] || '#111');
    cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
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

/* player */
const car = makeCar(0xeef1f5);
const P = { spin: 0, pos: V3(), vel: V3(), h: 0, idx: 0, crosses: 0, nitro: 1, prog: 0, finished: false, rank: 6 };
{
  const g = sample(-6 * 2.4, 4);
  P.pos.copy(g.p); P.h = Math.atan2(g.t.x, g.t.z); P.idx = ((Math.round(N - 14.4)) % N);
}
/* AI */
const AI = [0xc0222a, 0x1b1d22, 0x2b6cb0, 0xe5b800, 0x2f9e5b].map((c, k) => ({
  mesh: makeCar(c), s: -(k + 1) * 2.4, lat: (k % 2 ? 4 : -4), latT: 0, timer: 0, speed: 0, base: rand(62, 71) - k * 0.4, prog: 0
}));
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

/* ---------- input / audio ---------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR') location.reload();
  if (e.code === 'KeyM') muted = !muted;
  if ((e.code === 'Enter') && state === 'wait') start();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let actx, osc, osc2, lp, gain, windG, muted = false;
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    osc = actx.createOscillator(); osc.type = 'sawtooth'; osc2 = actx.createOscillator(); osc2.type = 'square';
    lp = actx.createBiquadFilter(); lp.type = 'lowpass'; gain = actx.createGain(); gain.gain.value = 0.04;
    const g2 = actx.createGain(); g2.gain.value = 0.45; osc.connect(lp); osc2.connect(g2).connect(lp); lp.connect(gain).connect(actx.destination);
    osc.start(); osc2.start();
    const buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const wind = actx.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const wf = actx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; windG = actx.createGain(); windG.gain.value = 0;
    wind.connect(wf).connect(windG).connect(actx.destination); wind.start();
  } catch (e) { actx = null; }
}
function audioUpdate(sp, boost) {
  if (!actx) return; const t = actx.currentTime, g = Math.min(4, Math.floor(sp / 20)), r = (sp - g * 20) / 20, f = 58 + r * 90 + g * 14;
  osc.frequency.setTargetAtTime(f, t, 0.05); osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  lp.frequency.setTargetAtTime(450 + sp * 8 + (boost ? 700 : 0), t, 0.1);
  gain.gain.setTargetAtTime(muted ? 0 : 0.045, t, 0.1);
  windG.gain.setTargetAtTime(muted ? 0 : clamp(sp / 90, 0, 1) * (boost ? 0.12 : 0.05), t, 0.1);
}

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

/* ---------- game state ---------- */
let state = 'wait', cdT = 3, raceT = 0, shake = 0, camYaw = P.h, lastRank = 6, ovCool = 0, goT = 0;
function start() {
  if (state !== 'wait') return; state = 'count'; $('start').style.display = 'none'; $('count').style.display = 'flex'; initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
}
$('go').onclick = start;

function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

function stepPlayer(dt, racing) {
  const k = { up: keys.KeyW || keys.ArrowUp || (touch.active && !touch.down), down: keys.KeyS || keys.ArrowDown || touch.down, left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight, boost: keys.ShiftLeft || keys.ShiftRight || touch.boost, drift: keys.Space || touch.drift };
  const f = V3(Math.sin(P.h), 0, Math.cos(P.h)), rt = V3(-f.z, 0, f.x);
  const fwd = P.vel.dot(f), sp = P.vel.length();
  const can = racing && !P.finished;
  const boosting = can && k.boost && P.nitro > 0.02 && k.up;
  if (can) {
    const max = boosting ? 110 : 90, a0 = boosting ? 55 : 34;
    if (k.up) P.vel.addScaledVector(f, a0 * clamp(1 - fwd / max, 0, 1) * dt);
    if (k.down) P.vel.addScaledVector(f, -(fwd > 0 ? 58 : 22) * dt * (fwd > -14 ? 1 : 0));
    let steer = (k.left ? 1 : 0) - (k.right ? 1 : 0); if (!steer) steer = touch.steer;
    P.h += steer * 1.9 * clamp(Math.abs(fwd) / 16, 0, 1) / (1 + Math.abs(fwd) / 85) * dt * (fwd < 0 ? -1 : 1) * (k.drift ? 1.5 : 1);
  }
  P.h += P.spin * dt; P.spin *= Math.exp(-3.5 * dt);
  P.vel.multiplyScalar(Math.exp(-(P.finished ? 0.9 : 0.14) * dt));
  const grip = k.drift && can ? 1.7 : 7.5;
  const nf = V3(Math.sin(P.h), 0, Math.cos(P.h)), sp2 = P.vel.length();
  P.vel.lerp(nf.multiplyScalar(fwd >= 0 ? sp2 : -sp2), 1 - Math.exp(-grip * dt));
  const slip = P.vel.dot(V3(-Math.cos(P.h), 0, Math.sin(P.h)));
  if (boosting) P.nitro = Math.max(0, P.nitro - 0.26 * dt); else P.nitro = Math.min(1, P.nitro + (0.025 + (k.drift && sp > 30 ? 0.09 : 0)) * dt);
  P.pos.addScaledVector(P.vel, dt);

  /* track relation */
  let best = P.idx, bd = 1e18;
  for (let o = -14; o <= 14; o++) { const j = (P.idx + o + N) % N, dx = P.pos.x - pts[j].x, dz = P.pos.z - pts[j].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = j; } }
  if (P.idx > N * 0.75 && best < N * 0.25) P.crosses++; else if (P.idx < N * 0.25 && best > N * 0.75) P.crosses--;
  P.idx = best;
  const r = right[best], t = tan[best], rx = P.pos.x - pts[best].x, rz = P.pos.z - pts[best].z;
  const d = rx * r.x + rz * r.z, lim = WALL - 1.1, ad = Math.abs(d), sg = Math.sign(d);
  if (ad > lim) {
    P.pos.x -= r.x * sg * (ad - lim); P.pos.z -= r.z * sg * (ad - lim);
    const vo = (P.vel.x * r.x + P.vel.z * r.z) * sg;
    if (vo > 0) { P.vel.x -= r.x * sg * vo * 1.25; P.vel.z -= r.z * sg * vo * 1.25; P.vel.multiplyScalar(1 - clamp(vo * 0.012, 0.01, 0.3)); shake = Math.max(shake, clamp(vo / 18, 0.1, 1)); }
    P.vel.multiplyScalar(1 - 0.5 * dt);
  } else if (ad > W) shake = Math.max(shake, 0.12);
  P.prog = P.crosses * N + best + clamp((rx * t.x + rz * t.z) / ds, -0.5, 0.5);
  const nx = (best + 1) % N, fr = clamp((rx * t.x + rz * t.z) / ds, 0, 1);
  const y = pts[best].y + (pts[nx].y - pts[best].y) * fr, hs = Math.hypot(t.x, t.z);

  /* mesh */
  car.position.set(P.pos.x, y + 0.04, P.pos.z);
  car.rotation.y = P.h; car.rotation.x = -Math.atan2(t.y, hs); car.rotation.z = clamp(-slip * 0.012, -0.12, 0.12);
  car.flames.forEach(fl => { fl.visible = boosting; if (boosting) { fl.scale.set(1, 0.9 + Math.random() * 0.7, 1); fl.material.opacity = 0.6 + Math.random() * 0.35; } });
  car.updateMatrixWorld();
  if ((Math.abs(slip) > 5 && sp > 22) || (boosting && Math.random() < 0.5)) for (const sx of [-1, 1]) if (Math.random() < 0.8) puff(car.localToWorld(V3(sx * 1.05, 0.3, -1.6)), P.vel, boosting ? 0.8 : 1.2);
  return { boosting, sp: P.vel.length() };
}

const pb = { x: 0, z: 0, vx: 0, vz: 0, cos: 1, sin: 0, halfW: 1.05, halfL: 2.2, mass: 1, angularVel: 0 };
const ab = { x: 0, z: 0, vx: 0, vz: 0, cos: 1, sin: 0, halfW: 1.05, halfL: 2.2, mass: 1.25, angularVel: 0 };
const ct = {};
function stepAI(dt, racing) {
  AI.forEach((a, n) => {
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
  sun.position.set(car.position.x + 120, car.position.y + 200, car.position.z + 80); sun.target.position.copy(car.position);
}

function hud(dt, sp, boosting) {
  const all = [{ p: P.prog, me: true }, ...AI.map(a => ({ p: a.prog }))].sort((a, b) => b.p - a.p);
  const rank = all.findIndex(o => o.me) + 1;
  if (state === 'race' && !P.finished) {
    ovCool -= dt;
    if (rank < lastRank && ovCool <= 0) { toast(`OVERTAKE  +${lastRank - rank}`); P.nitro = Math.min(1, P.nitro + 0.12); ovCool = 0.9; }
    lastRank = rank; P.rank = rank;
  }
  $('pos').innerHTML = `${P.rank}<small>/6</small>`;
  $('lap').textContent = `LAP ${clamp(P.crosses, 1, TOTAL)}/${TOTAL}`;
  $('time').textContent = fmt(raceT);
  const kph = Math.round(sp * 3.6); $('spd').textContent = kph;
  $('ring').style.strokeDashoffset = 389.6 * (1 - clamp(kph / 340, 0, 1));
  $('ring').style.stroke = boosting ? '#7ff' : '#3cf';
  $('nit').textContent = `NITRO ${Math.round(P.nitro * 100)}%`;
  $('fx').style.opacity = clamp((kph - 200) / 140, 0, 1) * (boosting ? 1 : 0.55);
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').style.opacity = 0;
  mc.clearRect(0, 0, mm.width, mm.height); mc.drawImage(mmBase, 0, 0);
  AI.forEach(a => { const [x, y] = mxy(a.mesh.position.x, a.mesh.position.z); mc.fillStyle = '#' + a.mesh.children[0].material.color.getHexString(); mc.beginPath(); mc.arc(x, y, 8, 0, 7); mc.fill(); mc.strokeStyle = '#000'; mc.lineWidth = 2; mc.stroke(); });
  const [px, py] = mxy(P.pos.x, P.pos.z); mc.fillStyle = '#fff'; mc.beginPath(); mc.arc(px, py, 10, 0, 7); mc.fill(); mc.strokeStyle = '#3cf'; mc.lineWidth = 4; mc.stroke();
}

function finishRace() {
  P.finished = true; P.rank = lastRank;
  const suf = ['th', 'st', 'nd', 'rd'][P.rank <= 3 ? P.rank : 0];
  $('fh').textContent = P.rank === 1 ? 'YOU WIN!' : `${P.rank}${suf} PLACE`;
  $('fp').textContent = `Total time ${fmt(raceT)}`;
  setTimeout(() => { $('finish').style.display = 'flex'; }, 1200);
}

/* ---------- main loop ---------- */
let last = performance.now(), fAcc = 0, fN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  if (state === 'race') {
    fAcc += raw; fN++;
    if (fAcc > 2.5) { if (fAcc / fN > 1 / 42 && pr > 1.25) { pr = Math.max(1.25, pr - 0.25); renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); } fAcc = 0; fN = 0; }
  } else { fAcc = 0; fN = 0; }
  if (state === 'count') {
    cdT -= dt; const n = Math.ceil(cdT); $('count').textContent = n > 0 ? n : 'GO';
    if (cdT <= 0) { state = 'race'; goT = 0.9; }
  }
  if (goT > 0 && (goT -= dt) <= 0) $('count').style.display = 'none';
  const racing = state === 'race';
  if (racing) raceT += dt;
  const out = stepPlayer(dt, racing);
  stepAI(dt, racing);
  if (racing && !P.finished && P.crosses >= TOTAL + 1) finishRace();
  if (racing || state === 'count') { /* hud after rank logic */ }
  smoke.forEach(o => { if (o.life > 0) { o.life -= dt; o.s.position.addScaledVector(o.vel, dt); o.s.scale.addScalar(dt * 3.5); o.s.material.opacity = Math.max(0, o.life / o.max) * 0.45; if (o.life <= 0) o.s.visible = false; } });
  updateCamera(dt, out.boosting, out.sp);
  hud(dt, out.sp, out.boosting); audioUpdate(out.sp, out.boosting);
  composer.render();
}
camera.position.set(P.pos.x - Math.sin(P.h) * 9, 4, P.pos.z - Math.cos(P.h) * 9);
requestAnimationFrame(frame);

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TOTAL = 3, W = 13, N = 700, WALL = W + 2.6;

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe0f0, 140, 1000);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 3000);

const pr = renderer.getPixelRatio();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 1.25));
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const canvasTex = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
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
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x607080, 1.7));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
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
strip(W, 0.04, W + 2.6, 0.04, i => rw[i & 1]);
strip(-W - 2.6, 0.04, -W, 0.04, i => rw[i & 1]);
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
    dummy.position.copy(pts[i]).y += 0.05; dummy.lookAt(dummy.position.clone().add(tan[i])); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix);
  }
  scene.add(m);
}
{ // pillars under elevated road
  const list = []; for (let i = 0; i < N; i += 10) if (pts[i].y > 2) list.push(i);
  const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.3, 1.8, 1, 10), new THREE.MeshStandardMaterial({ color: 0x9aa3ad }), list.length);
  list.forEach((i, n) => { const h = pts[i].y + 1.8; dummy.position.set(pts[i].x, -2 + h / 2, pts[i].z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix); });
  dummy.scale.set(1, 1, 1); scene.add(m);
}

/* city */
{
  const win = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#9fb2c4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) { g.fillStyle = Math.random() < 0.22 ? '#f7e9b8' : '#3a4d60'; g.fillRect(x * 8 + 1, y * 8 + 2, 6, 5); }
  });
  const COUNT = 420, m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: win, roughness: 0.55, metalness: 0.15 }), COUNT);
  m.castShadow = m.receiveShadow = true;
  let n = 0, tries = 0;
  while (n < COUNT && tries++ < 20000) {
    const k = (Math.random() * N) | 0, side = Math.random() < 0.5 ? -1 : 1, off = rand(45, 360);
    const p = pts[k].clone().addScaledVector(right[k], side * off).addScaledVector(tan[k], rand(-30, 30));
    let ok = true; for (let j = 0; j < N; j += 2) { const dx = p.x - pts[j].x, dz = p.z - pts[j].z; if (dx * dx + dz * dz < 1500) { ok = false; break; } }
    if (!ok) continue;
    const w = rand(22, 55), d = rand(22, 55), h = rand(35, 90) * (off < 140 ? 1 : rand(1.2, 3));
    dummy.position.set(p.x, -2 + h / 2, p.z); dummy.rotation.set(0, rand(0, 0.3), 0); dummy.scale.set(w, h, d); dummy.updateMatrix();
    m.setMatrixAt(n, dummy.matrix); m.setColorAt(n, new THREE.Color().setHSL(rand(0.55, 0.62), rand(0.05, 0.3), rand(0.62, 0.95))); n++;
  }
  m.count = n; scene.add(m); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
}

/* billboards */
{
  const mk = (a, b, txt) => canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'italic 900 52px Segoe UI,Arial'; g.textAlign = 'center'; g.fillText(txt, w / 2, h / 2 + 18);
  });
  const texs = [mk('#ff2d78', '#ffb347', 'NITRO'), mk('#00c6ff', '#6a11cb', 'VELOCITY'), mk('#f7971e', '#ffd200', 'TURBO'), mk('#11998e', '#38ef7d', 'DRIFT')];
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
  const gate = new THREE.Group(); gate.add(line); line.position.y = 0.07;
  const steel = new THREE.MeshStandardMaterial({ color: 0x20252d, metalness: 0.6, roughness: 0.4 });
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 13, 1.4), steel); p.position.set(sx * (W + 3.5), 6.5, 0); gate.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((W + 3.5) * 2 + 1.4, 3.2, 1.4), steel); beam.position.y = 13; gate.add(beam);
  const ban = new THREE.Mesh(new THREE.PlaneGeometry((W + 3.5) * 2, 2.6), new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#0b0f16'; g.fillRect(0, 0, w, h); g.fillStyle = '#3cf'; g.font = 'italic 900 40px Segoe UI,Arial'; g.textAlign = 'center'; g.fillText('START  /  FINISH', w / 2, 46); }) }));
  ban.position.set(0, 13, -0.75); ban.rotation.y = Math.PI; gate.add(ban);
  gate.position.copy(pts[0]); gate.rotation.y = yaw; scene.add(gate);
}

/* ---------- cars ---------- */
function makeCar(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0e1116, roughness: 0.35, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd42a2a, roughness: 0.4 });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(2.0, 0.5, 4.7), paint, 0, 0.62, 0);
  add(new THREE.BoxGeometry(1.9, 0.18, 1.7), paint, 0, 0.84, 1.45, 0.14);
  add(new THREE.BoxGeometry(1.5, 0.5, 1.9), dark, 0, 1.08, -0.35);
  add(new THREE.BoxGeometry(1.25, 0.1, 1.5), paint, 0, 1.36, -0.35);
  add(new THREE.BoxGeometry(0.32, 0.06, 4.0), red, 0, 0.9, 0.2);
  for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(0.05, 0.12, 4.3), red, sx * 1.01, 0.6, 0); add(new THREE.BoxGeometry(0.1, 0.6, 0.5), dark, sx * 0.8, 1.0, -2.2); }
  add(new THREE.BoxGeometry(2.2, 0.08, 0.65), paint, 0, 1.4, -2.3);
  add(new THREE.BoxGeometry(1.6, 0.14, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2), toneMapped: false }), 0, 0.82, -2.36);
  add(new THREE.BoxGeometry(1.4, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 1.6), toneMapped: false }), 0, 0.7, 2.36);
  const wg = new THREE.CylinderGeometry(0.44, 0.44, 0.5, 14);
  for (const sx of [-1, 1]) for (const z of [-1.5, 1.5]) { const w = add(wg, dark, sx * 1.05, 0.44, z); w.rotation.z = Math.PI / 2; }
  g.flames = [-0.55, 0.55].map(x => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.26, 2.4, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.2, 4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    f.rotation.x = -Math.PI / 2; f.position.set(x, 0.62, -3.5); f.visible = false; g.add(f); return f;
  });
  g.rotation.order = 'YXZ'; scene.add(g); return g;
}

function sample(s, lat = 0) {
  const sm = ((s % N) + N) % N, i = Math.floor(sm), f = sm - i, j = (i + 1) % N;
  const p = pts[i].clone().lerp(pts[j], f), t = tan[i].clone().lerp(tan[j], f).normalize(), r = right[i].clone().lerp(right[j], f).normalize();
  p.addScaledVector(r, lat); return { p, t, r, i };
}

/* player */
const car = makeCar(0xffffff);
const P = { pos: V3(), vel: V3(), h: 0, idx: 0, crosses: 0, nitro: 1, prog: 0, finished: false, rank: 6 };
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

let actx, osc, lp, gain, muted = false;
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    osc = actx.createOscillator(); osc.type = 'sawtooth'; lp = actx.createBiquadFilter(); lp.type = 'lowpass'; gain = actx.createGain(); gain.gain.value = 0.04;
    osc.connect(lp).connect(gain).connect(actx.destination); osc.start();
  } catch (e) { actx = null; }
}
function audioUpdate(sp, boost) {
  if (!actx) return; const t = actx.currentTime, g = Math.min(4, Math.floor(sp / 20)), r = (sp - g * 20) / 20;
  osc.frequency.setTargetAtTime(58 + r * 90 + g * 14, t, 0.05); lp.frequency.setTargetAtTime(450 + sp * 8 + (boost ? 700 : 0), t, 0.1);
  gain.gain.setTargetAtTime(muted ? 0 : 0.045, t, 0.1);
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
  const k = { up: keys.KeyW || keys.ArrowUp, down: keys.KeyS || keys.ArrowDown, left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight, boost: keys.ShiftLeft || keys.ShiftRight, drift: keys.Space };
  const f = V3(Math.sin(P.h), 0, Math.cos(P.h)), rt = V3(-f.z, 0, f.x);
  const fwd = P.vel.dot(f), sp = P.vel.length();
  const can = racing && !P.finished;
  const boosting = can && k.boost && P.nitro > 0.02 && k.up;
  if (can) {
    const max = boosting ? 110 : 90, a0 = boosting ? 55 : 34;
    if (k.up) P.vel.addScaledVector(f, a0 * clamp(1 - fwd / max, 0, 1) * dt);
    if (k.down) P.vel.addScaledVector(f, -(fwd > 0 ? 58 : 22) * dt * (fwd > -14 ? 1 : 0));
    const steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
    P.h += steer * 1.9 * clamp(Math.abs(fwd) / 16, 0, 1) / (1 + Math.abs(fwd) / 85) * dt * (fwd < 0 ? -1 : 1) * (k.drift ? 1.5 : 1);
  }
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
    /* collision with player */
    const dx = P.pos.x - m.position.x, dz = P.pos.z - m.position.z, dist = Math.hypot(dx, dz);
    if (dist < 3.4 && dist > 0.01 && Math.abs(car.position.y - m.position.y) < 2) {
      const nx = dx / dist, nz = dz / dist, ov = 3.4 - dist;
      P.pos.x += nx * ov; P.pos.z += nz * ov;
      const vn = P.vel.x * nx + P.vel.z * nz; if (vn < 0) { P.vel.x -= nx * vn * 1.2; P.vel.z -= nz * vn * 1.2; }
      P.vel.multiplyScalar(0.985); a.speed *= 0.995; shake = Math.max(shake, 0.35);
    }
  });
}

function updateCamera(dt, boosting, sp) {
  camYaw += angDiff(P.h, camYaw) * (1 - Math.exp(-6 * dt));
  const d = 7.4 + sp * 0.025, want = V3(car.position.x - Math.sin(camYaw) * d, car.position.y + 3.0 + sp * 0.006, car.position.z - Math.cos(camYaw) * d);
  camera.position.lerp(want, 1 - Math.exp(-9 * dt));
  const sh = shake + clamp(sp - 40, 0, 70) * 0.0007 + (boosting ? 0.03 : 0);
  camera.position.x += rand(-1, 1) * sh; camera.position.y += rand(-1, 1) * sh;
  camera.lookAt(car.position.x + Math.sin(camYaw) * 9, car.position.y + 1.4, car.position.z + Math.cos(camYaw) * 9);
  const fov = 62 + clamp(sp - 30, 0, 80) * 0.22 + (boosting ? 9 : 0);
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
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
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

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCarGeometry, SPORT } from './car-geometry.js';
import { vehicleContact, resolveVehicleContact } from './vehicle-physics.js';
import { touch, setControl } from './touch.js';
import { createArena } from './arena.js';
import { createAdventure } from './adventure.js';
import { CARS, getCar, carGeo, tintPart } from './cars-data.js';
import { economy } from './economy.js';
import { missionsInit, missionEvent, missionState, missionsCompleted, MISSIONS } from './missions.js';
import { cloud } from './cloud.js';
import { net } from './net.js';
import { GhostRec, makeGhostCar } from './ghost.js';
import { colorize } from './carcolor.js';
import { DRIVERS, driverById, drvTier } from './drivers.js';
import { TATTOOS, tatById, tatThumb, buildDecals } from './tattoos.js';

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
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
scene.fog = new THREE.Fog(0xcfe0f0, 260, 1500);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 1, 2800);

/* ---------- CLARITY: anti-alias + sharpen + grade, run after tone-mapping ---------- */
const CL_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FXAA_FRAG = `uniform sampler2D tDiffuse; varying vec2 vUv;
void main(){
  vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0)); vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 cM = texture2D(tDiffuse, vUv).rgb, cNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb, cNE = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * px).rgb;
  vec3 cSW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * px).rgb, cSE = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * px).rgb;
  float lM = dot(cM, L), lNW = dot(cNW, L), lNE = dot(cNE, L), lSW = dot(cSW, L), lSE = dot(cSE, L);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv + dir * -0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lB = dot(b, L);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}`;
const GRADE_FRAG = `uniform sampler2D tDiffuse; uniform float uSharp, uSat, uCon, uVig; varying vec2 vUv;
void main(){
  vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0));
  vec3 e = texture2D(tDiffuse, vUv).rgb, a = texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb, b = texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb;
  vec3 d = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, h = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
  vec3 mn = min(min(min(a, b), min(d, h)), e), mx = max(max(max(a, b), max(d, h)), e);
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.0001)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / mix(8.0, 5.0, uSharp));
  vec3 c = clamp((e + (a + b + d + h) * w) / (1.0 + 4.0 * w), 0.0, 1.0);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat); c = (c - 0.5) * uCon + 0.5;
  vec2 q = vUv - 0.5; c *= 1.0 - uVig * dot(q, q) * 2.2;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
let fxaaPass = null, gradePass = null;
function addClarityPasses(c) {
  fxaaPass = new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: CL_VERT, fragmentShader: FXAA_FRAG });
  gradePass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uSharp: { value: 0.8 }, uSat: { value: 1.07 }, uCon: { value: 1.06 }, uVig: { value: 0.16 } }, vertexShader: CL_VERT, fragmentShader: GRADE_FRAG });
  fxaaPass.enabled = mobile; /* desktop already has 4x MSAA */
  c.addPass(fxaaPass); c.addPass(gradePass);
}
let composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
let bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.35, 2.2);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
addClarityPasses(composer);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

/* ---------- WebGL context-loss recovery ----------
   Mobile browsers (Chrome Android) kill the GL context when memory runs low
   (many tabs / apps, low battery). three.js then silently stops drawing:
   HUD keeps updating but the 3D canvas goes blank. We detect it (event AND a
   watchdog for the phones where the event never fires), pause the race, show
   a recovery overlay, and auto-reload if the driver never comes back. When
   the context DOES come back we rebuild the whole post-processing chain —
   the old composer's render targets die with the context and reusing them
   is what left some phones staring at a blank screen after "restored". */
let glLost = false, glWatch = 0;
function glRecover() {
  if (glLost) return; glLost = true;
  audioUpdate(-1, false);
  if (state === 'race' || state === 'count') pause();
  show('glFix', true); const t = $('glT'); if (t) t.textContent = '7';
  let n = 7; clearInterval(glWatch);
  glWatch = setInterval(() => {
    if (--n <= 0) {
      clearInterval(glWatch);
      store.set('sr.glfix', 1); store.set('sr.glfixN', (store.get('sr.glfixN', 0) || 0) + 1);
      location.reload();
    }
    else { const t2 = $('glT'); if (t2) t2.textContent = String(n); }
  }, 1000);
}
function rebuildComposer() {
  try { composer.dispose(); } catch (e) { }
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.35, 2.2);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  addClarityPasses(composer);
  applyQuality();
}
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); glRecover(); });
renderer.domElement.addEventListener('webglcontextrestored', () => {
  if (!glLost) return; glLost = false; clearInterval(glWatch);
  show('glFix', false);
  renderer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  rebuildComposer(); /* fresh render targets — no more black screen after restore */
  last = performance.now();
  toast('GRAPHICS RESTORED', '#8df');
});
/* watchdog: some phones lose the GL context WITHOUT firing the event — the
   canvas just goes blank while the HUD keeps ticking. Catch it here. */
setInterval(() => {
  if (glLost) return;
  try { const gl = renderer.getContext(); if (gl && gl.isContextLost && gl.isContextLost()) glRecover(); } catch (e) { }
}, 2200);

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
sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1536 : 2048, mobile ? 1536 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 500 });
scene.add(sun, sun.target);

const trackStart = scene.children.length;
/* ---------- tracks: one engine, four circuits (closed spline + theme) ----------
   city = classic Lagos skyline · bridge = elevated lagoon crossing with danfo & keke
   beach = sandy shore with palms & umbrellas · jungle = tight, rolling, tree-lined
   short = SECRET SHORTCUT: {a,b} entry/exit as lap fraction, sideA/sideB which side of
   the road the ramp pads sit on (+right/-left), bow how far the chord bows, hump extra arch,
   jump where the launch ramp sits (0..1 along the shortcut). Every track has one. */
const TRACKS = {
  city: { id: 'city', name: 'LAGOS CITY', short: { a: 0.334, b: 0.629, sideA: 1, sideB: -1, bow: -0.14, hump: 9, jump: 0.52 }, cp: [[0,0,-300],[0,0,0],[10,0,250],[120,6,450],[330,14,540],[560,22,500],[700,24,350],[690,18,120],[560,10,-60],[560,4,-260],[640,0,-440],[540,0,-600],[320,0,-640],[140,0,-560],[40,0,-460]],
    ground: 0x4d5864, road: ['#34363c','#3a3c42'], edge: ['#e8e8ea','#d42a2a'], wall: ['#c9ccd2','#b8bcc4'],
    city: 460, cityOff: [45, 380], cityH: 1, bills: true, tunnel: true, lamps: true, grand: true, towers: false, palms: 0, trees: 0, umbrellas: 0, rocks: 0, traffic: [['taxi', 9], ['danfo', 6], ['keke', 6], ['van', 5]] },
  bridge: { id: 'bridge', name: 'LAGOS BRIDGE', short: { a: 0.226, b: 0.59, sideA: -1, sideB: -1, bow: 0.1, hump: 5, jump: 0.45 }, cp: [[0,0,-300],[0,4,-80],[0,10,120],[0,13,320],[60,13,470],[240,13,540],[430,12,520],[580,11,400],[640,11,220],[600,11,60],[620,9,-120],[540,6,-320],[380,2,-480],[180,0,-560],[40,0,-450]],
    ground: 0x0d3a55, road: ['#3c3f46','#41444b'], edge: ['#e8e8ea','#d42a2a'], wall: ['#d9dde3','#c2c7cf'],
    city: 80, cityOff: [230, 520], cityH: 1.9, bills: true, tunnel: false, lamps: true, grand: true, towers: true, palms: 0, trees: 0, umbrellas: 0, rocks: 0, traffic: [['danfo', 6], ['keke', 4], ['taxi', 5]] },
  beach: { id: 'beach', name: 'EKO BEACH', short: { a: 0.375, b: 0.646, sideA: 1, sideB: 1, bow: 0.22, hump: 6, jump: 0.5 }, cp: [[0,0,-320],[0,0,-80],[40,2,140],[160,3,330],[330,4,430],[520,3,400],[640,2,260],[700,3,80],[660,4,-90],[560,2,-240],[600,5,-420],[440,3,-560],[240,0,-620],[60,0,-520]],
    ground: 0xd9c28c, road: ['#4a4a4e','#50505a'], edge: ['#f2f2f0','#2a9d5c'], wall: ['#f5e9d0','#e6d5ae'],
    city: 16, cityOff: [70, 320], cityH: 0.34, bills: 3, tunnel: false, lamps: false, grand: true, towers: false, palms: 90, trees: 0, umbrellas: 26, rocks: 0, traffic: [['keke', 3], ['danfo', 2]] },
  jungle: { id: 'jungle', name: 'JUNGLE RUN', short: { a: 0.218, b: 0.484, sideA: 1, sideB: 1, bow: -0.12, hump: 7, jump: 0.55 }, cp: [[0,0,-260],[30,2,-40],[-30,4,140],[-160,6,240],[-320,7,220],[-420,5,80],[-380,3,-80],[-440,5,-240],[-320,4,-380],[-140,2,-420],[-20,0,-380],[0,1,-330]],
    ground: 0x1e3b24, road: ['#4b4237','#514840'], edge: ['#e8e2c8','#c9a03c'], wall: ['#6b5a3e','#7a6848'],
    city: 0, cityOff: [0, 0], cityH: 1, bills: false, tunnel: false, lamps: false, grand: false, towers: false, palms: 0, trees: 150, umbrellas: 0, rocks: 40, traffic: [['keke', 2]] },
  /* Kaduna: red laterite hills, acacia & baobab, long climb and a fast descent */
  kaduna: { id: 'kaduna', name: 'KADUNA RIDGE', short: { a: 0.68, b: 0.866, sideA: 1, sideB: 1, bow: -0.08, hump: 5, jump: 0.5 }, cp: [[0,2,-260],[0,3,0],[30,6,240],[110,12,430],[250,19,560],[430,25,630],[620,29,640],[790,31,560],[880,28,420],[880,23,260],[810,19,130],[680,15,100],[540,13,130],[420,12,165],[330,10,140],[285,8,60],[262,6,-70],[300,5,-250],[315,4,-380],[255,3,-475],[120,2,-495],[15,2,-420]],
    ground: 0xffffff, terrain: { kind: 'red', amp: 46 }, road: ['#4a433e','#504943'], edge: ['#f3e6c8','#c4501c'], wall: ['#b08a5e','#9e7a52'],
    city: 0, cityOff: [0, 0], cityH: 1, bills: false, tunnel: false, lamps: false, grand: true, towers: false, palms: 0, trees: 0, acacias: 80, baobabs: 16, umbrellas: 0, rocks: 70, traffic: [['keke', 3], ['danfo', 2]] },
  /* Obudu: mountain climb (60 m up) with hairpins, pines and rock */
  obudu: { id: 'obudu', name: 'OBUDU PEAK', short: { a: 0.3, b: 0.44, sideA: 1, sideB: 1, bow: 0.1, hump: 6, jump: 0.5 }, cp: [[-150,2,0],[60,2.9,0],[240,4.9,0],[420,7.9,0],[488,9.2,18],[537,10.8,68],[555,12.4,135],[537,14.1,203],[488,15.9,252],[420,17.7,270],[240,22.8,270],[60,28.2,270],[-60,31.8,270],[-128,34,288],[-177,36.1,338],[-195,38.2,405],[-177,40.3,473],[-127,42.3,522],[-60,44.3,540],[120,49.2,540],[270,52.8,540],[420,55.9,540],[488,57.2,558],[537,58.4,608],[555,59.4,675],[537,60.3,743],[488,61,792],[420,61.5,810],[240,62,810],[60,59.2,810],[-60,55.2,810],[-210,48.1,770],[-320,39.6,660],[-360,30.5,510],[-400,19.9,330],[-450,12.8,200],[-423,8.4,100],[-350,4.9,27],[-250,2.7,0]],
    ground: 0xffffff, terrain: { kind: 'green', amp: 120 }, road: ['#383c44','#3d4148'], edge: ['#f4f4f4','#3cc86a'], wall: ['#9aa89c','#8a998e'],
    city: 0, cityOff: [0, 0], cityH: 1, bills: false, tunnel: false, lamps: false, grand: true, towers: false, palms: 0, trees: 260, umbrellas: 0, rocks: 90, traffic: [['keke', 2]] },
  /* Sky Mega Ramp: a 5.8 km elevated super-highway over farmland, a long orange climb, a launch jump and a tower top */
  mega: { id: 'mega', name: 'SKY MEGA RAMP', short: { a: 0.317, b: 0.62, sideA: -1, sideB: -1, bow: 0.12, hump: 0, jump: 0.42 }, cp: [[0,40,0],[150,40,0],[300,40.4,0],[450,45.8,0],[600,55.8,0],[750,68,0],[900,80.2,0],[1050,90.2,0],[1200,95.6,0],[1350,96,0],[1500,96,0],[1650,94,0],[1800,85.5,0],[1950,74.2,0],[2100,64.3,0],[2250,60,0],[2325,60,20.1],[2379.9,60,75],[2400,60,150],[2379.9,60,225],[2325,60,279.9],[2250,60,300],[2100,59.8,300],[1950,59.2,300],[1800,58.2,300],[1650,57,300],[1500,55.5,300],[1350,53.9,300],[1200,52.1,300],[1050,50.3,300],[900,48.5,300],[750,46.7,300],[600,45,300],[450,43.5,300],[300,42.2,300],[150,41.1,300],[0,40.4,300],[-150,40,300],[-275,40,279.9],[-329.9,40,225],[-350,40,150],[-329.9,40,75],[-275,40,20.1],[-200,40,0]],
    ground: 0xffffff, terrain: { kind: 'valley', amp: 38 }, road: ['#3b3e44','#40434a'], edge: ['#ffffff','#ff7a1a'], wall: ['#ff8a2a','#e8650f'],
    paint: [[30, 150, ['#f0661a', '#f77a2a']]], jumps: [150], tower: { idx: 168, w: 74, d: 74 },
    city: 0, cityOff: [0, 0], cityH: 1, bills: false, tunnel: false, lamps: true, grand: true, towers: false, palms: 0, trees: 0, umbrellas: 0, rocks: 0, traffic: [['danfo', 3]] }
};
const tsx = id => (id && id !== 'city') ? '.' + id : ''; /* per-track record suffix; the city keeps the old keys */
let tH = null; /* terrain height lookup for the current track (null = flat ground) */
let world = null, curTrack = 'city';
/* SECRET SHORTCUT state: built per track by buildShortcut() inside buildWorld().
   SC.p2/t2/r2 = sampled centreline, ai/bi = main-loop indices it connects,
   hw = half width, dsc = metres per sample, ji = launch-ramp sample. */
let SC = null, scCdT = 0;
let pts, tan, right, curv, ds, roadStrip, ground, cityMat, padGroup, pads, padsNight;
let neonGroup, neonLights = [];
const dummy = new THREE.Object3D(); /* shared matrix scratch object — used by world, props, pickups, skids */
/* ---------- traffic (danfo & keke), coins/gems, power-ups — single-player items ---------- */
const TRAF = [];
let coinMesh = null, gemMesh = null, coinData = [], gemData = [], pubMeshes = [];
const Oils = [], Rockets = [];
const PU = { item: null, shield: 0, magnet: 0 };
let mpEvt = null; /* last fired item event, piggybacked on the mp state push (synced power-ups, zero extra writes) */
const PU_NAMES = { seeker: 'SEEKER', rocket: 'ROCKET', shield: 'SHIELD', oil: 'OIL SLICK', magnet: 'MAGNET', nitro: 'NITRO' };
const allPads = () => cfg.env === 'nightRain' ? pads.concat(padsNight) : pads; /* module scope — stepPlayer reads it */
let raceCoins = 0, raceGems = 0, P_oilCd = 0, coinSpin = 0;
const itemsOn = () => cfg.type !== 'arena' && cfg.type !== 'adv'; /* power-ups & coins ON in multiplayer too (per-player boxes, synced rockets) */
function ensureTrack(id) {
  const tk = TRACKS[id] || TRACKS.city;
  if (curTrack === tk.id && world) return;
  curTrack = tk.id;
  buildWorld(tk);
  mmRedraw();
}
/* hill terrain: follows the road height near the circuit, rolls into hills / mountains further out */
function buildTerrain(tk) {
  const valley = tk.terrain.kind === 'valley', red = tk.terrain.kind === 'red', amp = tk.terrain.amp, CELL = valley ? 40 : 24, MARGIN = valley ? 900 : 720;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  x0 -= MARGIN; z0 -= MARGIN; x1 += MARGIN; z1 += MARGIN;
  const nx = Math.ceil((x1 - x0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1;
  const hs = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
  const vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return (hs(i, j) * (1 - u) + hs(i + 1, j) * u) * (1 - v) + (hs(i, j + 1) * (1 - u) + hs(i + 1, j + 1) * u) * v; };
  const fbm = (x, z) => vn(x / 260, z / 260) * 0.55 + vn(x / 120, z / 120) * 0.28 + vn(x / 52, z / 52) * 0.13 + vn(x / 24, z / 24) * 0.04;
  const H = new Float32Array(nx * nz), D = new Float32Array(nx * nz), pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const P3 = pts.filter((_, i) => i % 2 === 0);
  const palA = red ? [new THREE.Color(0xb5572e), new THREE.Color(0xa24a26), new THREE.Color(0xc7703c)] : [new THREE.Color(0x3f8a3f), new THREE.Color(0x2f6f35), new THREE.Color(0x4f9b46)];
  const dry = new THREE.Color(red ? 0x9a8a47 : 0x8d9588), tc = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * CELL, z = z0 + j * CELL;
    if (valley) { /* farmland far below the highway, patchwork fields */
      const k = j * nx + i, n = vn(x / 150, z / 150), bin = Math.min(4, Math.floor(n * 5)), h = -36 + fbm(x, z) * amp;
      H[k] = h; D[k] = 999; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      tc.setHex([0x5f9a3c, 0x86a845, 0xcdb85a, 0x9c6b3a, 0x4d8a43][bin]);
      tc.multiplyScalar((((Math.floor(z / 22) + bin) & 1) ? 0.9 : 1.06) * (0.92 + 0.16 * vn(x / 11, z / 11)));
      col[k * 3] = tc.r; col[k * 3 + 1] = tc.g; col[k * 3 + 2] = tc.b; continue;
    }
    let sw = 0, sy = 0, dm = 1e9;
    for (const p of P3) { const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz; if (d2 < dm) dm = d2; const w = 1 / Math.pow(d2 + 400, 1.5); sw += w; sy += w * p.y; }
    const y0 = sy / sw, d = Math.sqrt(dm), s = sm(38, 270, d);
    const hill = y0 + (fbm(x, z) * 2 - 0.86) * amp * (0.35 + 0.65 * sm(90, 600, d));
    const h = (y0 - 2.4) * (1 - s) + hill * s;
    const k = j * nx + i; H[k] = h; D[k] = d;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const n = vn(x / 40, z / 40), c = palA[Math.floor(n * 2.99)];
    tc.copy(c).lerp(dry, clamp((h - y0) / (amp * 0.9), 0, 1) * (red ? 0.55 : 0.85) * s + (red ? 0.22 : 0) * vn(x / 17, z / 17));
    tc.multiplyScalar(0.86 + 0.28 * vn(x / 9, z / 9));
    col[k * 3] = tc.r; col[k * 3 + 1] = tc.g; col[k * 3 + 2] = tc.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1; idx.push(a, c, b, b, c, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  tH = (x, z) => {
    const fx = clamp((x - x0) / CELL, 0, nx - 1.001), fz = clamp((z - z0) / CELL, 0, nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (H[j * nx + i] * (1 - u) + H[j * nx + i + 1] * u) * (1 - v) + (H[(j + 1) * nx + i] * (1 - u) + H[(j + 1) * nx + i + 1] * u) * v;
  };
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  m.receiveShadow = true; m.frustumCulled = false; return m;
}
/* ---------- SECRET SHORTCUTS: every track hides one helpful cut ----------
   An elevated orange causeway chords across the lap: entry/exit pads sit 10.5 m off
   the racing line (hug that side to take it), boost pads + a launch ramp on board,
   pillars hold it up, and the city/trees are cleared out of its corridor. */
function scClear(x, z, m = 8) { /* false = point sits inside the shortcut corridor */
  if (!SC) return true;
  const rr = (SC.hw + m) * (SC.hw + m);
  for (let i = 0; i < SC.M; i += 4) { const dx = x - SC.p2[i].x, dz = z - SC.p2[i].z; if (dx * dx + dz * dz < rr) return false; }
  return true;
}
function scStrip(pa, ya, pb, yb, col) { /* open strip along the shortcut samples */
  const pos = [], cl = [], idx = [], M = SC.M;
  for (let i = 0; i < M; i++) {
    const c = SC.p2[i], r = SC.r2[i], q = col(i);
    pos.push(c.x + r.x * pa, c.y + ya, c.z + r.z * pa, c.x + r.x * pb, c.y + yb, c.z + r.z * pb);
    cl.push(q.r, q.g, q.b, q.r, q.g, q.b);
    if (i < M - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }));
  m.receiveShadow = true; world.add(m); return m;
}
function buildShortcut(tk) {
  const def = tk.short; if (!def) { SC = null; return; }
  const SW = 11, HW = SW / 2, M = 140;
  const ai = Math.round(N * def.a) % N, bi = Math.round(N * def.b) % N;
  const EA = pts[ai].clone().addScaledVector(right[ai], def.sideA * 10.5);
  const XB = pts[bi].clone().addScaledVector(right[bi], def.sideB * 10.5);
  const ex = XB.clone().sub(EA), len = Math.hypot(ex.x, ex.z);
  const mid = EA.clone().add(XB).multiplyScalar(0.5).addScaledVector(V3(-ex.z, 0, ex.x).normalize(), def.bow * len);
  const curve = new THREE.CatmullRomCurve3([EA, mid, XB], false, 'centripetal', 0.5);
  const raw = curve.getSpacedPoints(M - 1);
  const p2 = [], t2 = [], r2 = [];
  for (let i = 0; i < M; i++) {
    const u = i / (M - 1);
    let y = pts[ai].y * (1 - u) + pts[bi].y * u + Math.sin(Math.PI * u) * def.hump;
    if (tH) y = Math.max(y, tH(raw[i].x, raw[i].z) + 1.1);
    p2.push(V3(raw[i].x, y, raw[i].z));
  }
  for (let i = 0; i < M; i++) { const a2 = p2[Math.max(0, i - 1)], b2 = p2[Math.min(M - 1, i + 1)], t = b2.clone().sub(a2).normalize(); t2.push(t); r2.push(V3(-t.z, 0, t.x).normalize()); }
  SC = { p2, t2, r2, M, ai, bi, hw: HW + 1.6, dsc: len / M, ji: Math.round(def.jump * (M - 1)), ex: EA.x, ez: EA.z };
  const C1 = s => new THREE.Color(s), asp = [C1('#3f434b'), C1('#454a53')], orn = C1('#e06a1c'), wht = C1('#f2f3f5'), wal = [C1('#c9ccd2'), C1('#b8bcc4')];
  scStrip(-HW, 0.05, HW, 0.05, i => (i >= SC.ji - 5 && i <= SC.ji + 6) ? orn : asp[(i >> 3) & 1]); /* launch ramp painted orange */
  scStrip(HW, 0.12, HW + 0.9, 0.12, i => (i & 2) ? orn : wht);
  scStrip(-HW - 0.9, 0.12, -HW, 0.12, i => (i & 2) ? orn : wht);
  scStrip(HW + 0.9, 0, HW + 0.9, 1.25, i => wal[(i >> 3) & 1]); /* low side skirts */
  scStrip(-HW - 0.9, 0, -HW - 0.9, 1.25, i => wal[(i >> 3) & 1]);
  /* pillars down to ground / terrain / water */
  const pil = [];
  for (let i = 6; i < M - 6; i += 9) {
    const base = tH ? tH(p2[i].x, p2[i].z) - 1 : -2;
    if (p2[i].y - base > 2.5) pil.push([p2[i].x, base, p2[i].z, p2[i].y - 0.2 - base]);
  }
  if (pil.length) {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.6, 1, 8), new THREE.MeshStandardMaterial({ color: 0x9aa3ad }), pil.length);
    pil.forEach(([x, b, z, h], n) => { dummy.position.set(x, b + h / 2, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix); });
    dummy.scale.set(1, 1, 1); world.add(m);
  }
  /* entry gate: two posts + SHORTCUT banner */
  const gate = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a5a20, metalness: 0.5, roughness: 0.5 });
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), steel); p.position.set(sx * (HW + 1.6), 4.5, 0); gate.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((HW + 1.6) * 2 + 1, 2.2, 1), steel); beam.position.y = 9; gate.add(beam);
  const ban = new THREE.Mesh(new THREE.PlaneGeometry((HW + 1.6) * 2, 1.9), new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide, map: canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#1c1006'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb347'; g.font = 'italic 900 40px Segoe UI,Arial'; g.textAlign = 'center'; g.fillText('SHORTCUT \u2192', w / 2, 46); }) }));
  ban.position.set(0, 9, -0.55); ban.rotation.y = Math.PI; gate.add(ban);
  gate.position.copy(EA).y += 0.05; gate.rotation.y = Math.atan2(t2[2].x, t2[2].z); world.add(gate);
  /* glowing chevrons along the deck */
  const chev = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,179,71,.95)'; g.lineWidth = 9; g.lineCap = 'round'; for (const yy of [20, 44]) { g.beginPath(); g.moveTo(12, yy + 10); g.lineTo(32, yy - 8); g.lineTo(52, yy + 10); g.stroke(); } });
  for (let i = 8; i < M - 8; i += Math.floor(M / 9)) {
    const ar = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: chev, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ar.position.copy(p2[i]).y += 0.14; ar.rotation.y = Math.atan2(t2[i].x, t2[i].z); world.add(ar);
  }
}
function buildWorld(tk) {
  if (world) {
    scene.remove(world);
    world.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
  }
  world = new THREE.Group(); scene.add(world);
  const CP = tk.cp;
  const curve = new THREE.CatmullRomCurve3(CP.map(p => V3(...p)), true, 'centripetal');
  pts = curve.getSpacedPoints(N).slice(0, N);
  ds = curve.getLength() / N;
  tan = pts.map((_, i) => pts[(i + 1) % N].clone().sub(pts[(i - 1 + N) % N]).normalize());
  right = tan.map(t => V3(-t.z, 0, t.x).normalize());
  curv = tan.map((t, i) => Math.acos(clamp(t.dot(tan[(i + 8) % N]), -1, 1)));

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
  m.receiveShadow = shadow; world.add(m); return m;
}
const C = s => new THREE.Color(s);
  const asph = tk.road.map(c => C(c)), rw = tk.edge.map(c => C(c)), wallC = tk.wall.map(c => C(c));
  const paintC = (tk.paint || []).map(([a, b, cs]) => [a, b, cs.map(c => C(c))]);
  roadStrip = strip(-W, 0, W, 0, i => { const pr = paintC.find(p => i >= p[0] && i <= p[1]); return pr ? pr[2][(i >> 3) & 1] : asph[(i >> 3) & 1]; });
  strip(W, 0.08, W + 2.6, 0.08, i => rw[i & 1]);
  strip(-W - 2.6, 0.08, -W, 0.08, i => rw[i & 1]);
  strip(WALL, 0, WALL, 1.5, i => wallC[(i >> 2) & 1]);
  strip(-WALL, 0, -WALL, 1.5, i => wallC[(i >> 2) & 1]);
  strip(WALL, 1.5, WALL + 0.5, 1.5, () => C('#e9ecf1'));
  strip(-WALL - 0.5, 1.5, -WALL, 1.5, () => C('#e9ecf1'));

  ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: tk.ground, roughness: tk.id === 'bridge' ? 0.28 : 1, metalness: tk.id === 'bridge' ? 0.25 : 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2; ground.receiveShadow = true; world.add(ground);
  tH = null;
  if (tk.terrain) { world.remove(ground); ground.geometry.dispose(); ground = buildTerrain(tk); world.add(ground); }
  /* beach: ocean sheet out to the east of the track */
  if (tk.id === 'beach') { const oc = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), new THREE.MeshStandardMaterial({ color: 0x1b6a9e, roughness: 0.22, metalness: 0.15 })); oc.rotation.x = -Math.PI / 2; oc.position.set(2350, -0.7, 0); world.add(oc); }

  buildShortcut(tk); /* secret shortcut (must exist before city/props so their corridor can be cleared) */

  { // lane dashes
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.03, ds * 1.3), new THREE.MeshBasicMaterial({ color: 0xdddddd }), N / 4);
  for (let i = 0, n = 0; i < N; i += 4, n++) {
    dummy.position.copy(pts[i]).y += 0.1; dummy.lookAt(dummy.position.clone().add(tan[i])); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix);
  }
  world.add(m);
}
  { // pillars under elevated road
  const valleyT = tk.terrain && tk.terrain.kind === 'valley';
  const list = []; for (let i = 0; i < N; i += valleyT ? 6 : 10) if (pts[i].y > 2 && (!tk.terrain || valleyT)) list.push(i);
  const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.3, 1.8, 1, 10), new THREE.MeshStandardMaterial({ color: 0x9aa3ad }), list.length);
  list.forEach((i, n) => { const base = valleyT ? tH(pts[i].x, pts[i].z) - 1 : -2, h = pts[i].y - 0.2 - base; dummy.position.set(pts[i].x, base + h / 2, pts[i].z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix); });
  dummy.scale.set(1, 1, 1); world.add(m);
}

let cityMat = null;
/* city: one merged mesh, window UVs scaled to real building size — density/height per track */
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
  while (n < tk.city && tries++ < 20000) {
    const k = (Math.random() * N) | 0, side = Math.random() < 0.5 ? -1 : 1, off = rand(tk.cityOff[0], tk.cityOff[1]);
    const p = pts[k].clone().addScaledVector(right[k], side * off).addScaledVector(tan[k], rand(-30, 30));
    let ok = true; for (let j = 0; j < N; j += 2) { const dx = p.x - pts[j].x, dz = p.z - pts[j].z; if (dx * dx + dz * dz < 1500) { ok = false; break; } }
    if (ok && !scClear(p.x, p.z, 16)) ok = false; /* keep the shortcut alley clear */
    if (!ok) continue;
    const w = rand(22, 55), d = rand(22, 55), h = rand(35, 90) * (off < 140 ? 1 : rand(1.2, 3.2)) * tk.cityH;
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) { const len = f < 2 ? d : w, vv = f < 4 ? h : d; for (let j = 0; j < 4; j++) { const i = f * 4 + j; uv.setXY(i, uv.getX(i) * len / 25.6, uv.getY(i) * vv / 57.6); } }
    const c = new THREE.Color().setHSL(rand(0.54, 0.62), rand(0.04, 0.3), rand(0.6, 0.95)), col = new Float32Array(72);
    for (let i = 0; i < 24; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.rotateY(rand(0, 0.3)); g.translate(p.x, -2 + h / 2, p.z); geos.push(g); n++;
  }
  if (geos.length) {
    const city = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: win, vertexColors: true, roughness: 0.45, metalness: 0.2, emissiveMap: glow, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0 }));
    city.castShadow = city.receiveShadow = true; world.add(city); cityMat = city.material;
  }
}

/* billboards */
if (tk.bills) {
  const mk = (a, b, txt) => canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'italic 900 52px Segoe UI,Arial'; g.textAlign = 'center'; g.fillText(txt, w / 2, h / 2 + 18);
  });
  const texs = [mk('#ff2d78', '#ffb347', 'NITRO'), mk('#00c6ff', '#6a11cb', 'KAY'), mk('#f7971e', '#ffd200', 'TURBO'), mk('#11998e', '#38ef7d', 'DRIFT')];
  const bIdx = tk.bills === true ? [45, 130, 215, 310, 400, 640] : [45, 215, 400];
  bIdx.forEach((k, n) => {
    const side = n % 2 ? 1 : -1, g = new THREE.Group();
    const bp = pts[k].clone().addScaledVector(right[k], side * (WALL + 14));
    if (!scClear(bp.x, bp.z, 4)) return; /* billboards never block the shortcut */
    const board = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: texs[n % 4], toneMapped: false, side: THREE.DoubleSide }));
    board.position.y = 17;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 18, 8), new THREE.MeshStandardMaterial({ color: 0x778 })); pole.position.y = 8;
    g.add(board, pole); g.position.copy(pts[k]).addScaledVector(right[k], side * (WALL + 14)); g.lookAt(pts[k].x, g.position.y, pts[k].z); world.add(g);
  });
}

/* tunnel with glowing rings */
if (tk.tunnel) {
  const t0 = Math.round(N * 0.52), t1 = Math.round(N * 0.6), up = V3(0, 3, 0);
  world.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(t0, t1).map(p => p.clone().add(up))), 60, 17, 20, false), new THREE.MeshStandardMaterial({ color: 0x06070b, side: THREE.BackSide, roughness: 1 })));
  const geo = new THREE.TorusGeometry(15.6, 0.3, 8, 48), mats = [new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), toneMapped: false }), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.2), toneMapped: false })];
  for (let k = t0 + 1, n = 0; k < t1; k += 2, n++) {
    const r = new THREE.Mesh(geo, mats[n % 3 === 2 ? 1 : 0]); r.position.copy(pts[k]).add(up); r.lookAt(r.position.clone().add(tan[k])); world.add(r);
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
  gate.position.copy(pts[0]); gate.rotation.y = yaw; world.add(gate);
}

/* street lamps */
if (tk.lamps) {
  const list = []; for (let i = 6; i < N; i += 14) for (const sd of [-1, 1]) list.push([i, sd]);
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 11, 6), new THREE.MeshStandardMaterial({ color: 0x8a919b }), list.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2), toneMapped: false }), list.length);
  list.forEach(([i, sd], n) => {
    const p = pts[i].clone().addScaledVector(right[i], sd * (WALL + 1.4));
    if (!scClear(p.x, p.z, 1)) return; /* lamps skip the shortcut corridor */
    dummy.position.set(p.x, p.y + 5.5, p.z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pole.setMatrixAt(n, dummy.matrix);
    const q = p.clone().addScaledVector(right[i], -sd * 1.6);
    dummy.position.set(q.x, p.y + 11, q.z); dummy.lookAt(q.x + tan[i].x, p.y + 11, q.z + tan[i].z); dummy.updateMatrix(); head.setMatrixAt(n, dummy.matrix);
  });
  dummy.rotation.set(0, 0, 0); world.add(pole, head);
}
/* grandstands at the start */
if (tk.grand) {
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
    g.add(seats, back, roof); world.add(g);
  }
}

/* boost pads: glowing chevrons on the tarmac, +nitro +small speed kick */
padGroup = new THREE.Group(); world.add(padGroup);
const PAD_STEP = Math.floor(N / 14);
const padIdx = []; for (let i = 26; i < N - 10; i += PAD_STEP) padIdx.push(i);
const padBaseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.7, 2.8), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
pads = padIdx.map((k, n) => {
  const lat = ((n % 3) - 1) * 3.4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7).rotateX(-Math.PI / 2), padBaseMat.clone());
  m.position.copy(pts[k]).addScaledVector(right[k], lat); m.position.y += 0.16;
  m.rotation.y = Math.atan2(tan[k].x, tan[k].z);
  m.userData = { cd: 0, flash: 0, k };
  padGroup.add(m); return m;
});
/* Night Circuit: extra pads — closer to the walls, smaller, more rewarding */
const padNightIdx = []; for (let i = 13; i < N - 10; i += Math.floor(N / 22)) padNightIdx.push(i);
padsNight = padNightIdx.map((k, n) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4).rotateX(-Math.PI / 2), padBaseMat.clone());
  m.position.copy(pts[k]).addScaledVector(right[k], (n % 2 ? -1 : 1) * rand(6.2, 8.6)); m.position.y += 0.16;
  m.rotation.y = Math.atan2(tan[k].x, tan[k].z);
  m.userData = { cd: 0, flash: 0, k };
  m.visible = false; padGroup.add(m); return m;
});
/* shortcut pads: two orange-hot boosts on the secret causeway (bigger kick than track pads) */
if (SC) {
  const sp2 = [];
  for (const u of [0.16, 0.32]) {
    const i = Math.round(u * (SC.M - 1)), m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.9, 0.25), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.copy(SC.p2[i]).y += 0.18; m.rotation.y = Math.atan2(SC.t2[i].x, SC.t2[i].z);
    m.userData = { cd: 0, flash: 0, k: -1, hot: 1 };
    padGroup.add(m); sp2.push(m);
  }
  pads.push(...sp2);
}

/* per-track scenery: suspension towers / palms / jungle trees / umbrellas / rocks */
buildProps(tk);
/* track traffic + pickups (coins, gems, power-up boxes) */
buildTraffic(tk);
rebuildPickups(tk);

/* ---------- NIGHT CIRCUIT: neon signage — rebuilt per track, driven by setEnv ---------- */
neonGroup.clear();
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
/* colored point lights along the circuit — desktop 6, mobile 4 */
neonLights.forEach(L => scene.remove(L)); neonLights.length = 0;
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
}
/* ---------- NIGHT CIRCUIT: rain (not track objects) ---------- */
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

/* ---------- per-track scenery: towers / palms / jungle trees / umbrellas / rocks ---------- */
function buildProps(tk) {
  if (tk.towers) {
    const spots = []; for (let i = 0; i < N; i += 55) if (pts[i].y > 5) spots.push(i);
    if (spots.length > 1) {
      const conc = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.7 });
      const cabMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5 });
      const tops = [];
      spots.forEach(i => {
        const h = 34;
        for (const sd of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.6), conc);
          const p = pts[i].clone().addScaledVector(right[i], sd * (WALL + 1.2));
          leg.position.set(p.x, p.y - 3 + h / 2, p.z); leg.castShadow = true; world.add(leg);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry((WALL + 1.2) * 2 + 1.6, 1.4, 1.8), conc);
        beam.position.set(pts[i].x, pts[i].y + h - 4, pts[i].z); beam.rotation.y = Math.atan2(tan[i].x, tan[i].z); world.add(beam);
        tops.push(V3(pts[i].x, pts[i].y + h - 4, pts[i].z));
      });
      for (let n = 1; n < tops.length; n++) {
        const a = tops[n - 1], b = tops[n], len = a.distanceTo(b);
        if (len < 1) continue;
        const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len, 6), cabMat);
        cbl.position.copy(a).add(b).multiplyScalar(0.5); cbl.lookAt(b); cbl.rotateX(Math.PI / 2); world.add(cbl);
      }
    }
  }
  const scatter = (n, off0, off1) => Array.from({ length: n }, () => {
    const k = (Math.random() * N) | 0, side = Math.random() < 0.5 ? -1 : 1;
    const p = pts[k].clone().addScaledVector(right[k], side * rand(off0, off1)); if (tH) p.y = tH(p.x, p.z);
    return { p };
  });
  const scScatter = (n, off0, off1) => scatter(n, off0, off1).filter(s => scClear(s.p.x, s.p.z, 2)); /* props keep out of the shortcut corridor */
  if (tk.palms) {
    const spots = scScatter(tk.palms, WALL + 4, WALL + 70);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 7, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }), tk.palms);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.6, 7).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f9e5b, roughness: 0.85 }), tk.palms);
    spots.forEach((s, n) => {
      dummy.position.set(s.p.x, s.p.y + 3.2, s.p.z); dummy.rotation.set(rand(-0.12, 0.12), rand(0, 6.28), rand(-0.12, 0.12)); dummy.scale.setScalar(rand(0.8, 1.3)); dummy.updateMatrix(); trunk.setMatrixAt(n, dummy.matrix);
      dummy.position.y += 3.8; dummy.updateMatrix(); crown.setMatrixAt(n, dummy.matrix);
    });
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); world.add(trunk, crown);
  }
  if (tk.trees) {
    const spots = scScatter(tk.trees, WALL + 3, WALL + 90);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.4, 5, 6), new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.95 }), tk.trees);
    const leafA = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 3.4, 7), new THREE.MeshStandardMaterial({ color: 0x256b38, roughness: 0.9 }), tk.trees);
    const leafB = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 2.6, 7), new THREE.MeshStandardMaterial({ color: 0x2f8a4c, roughness: 0.9 }), tk.trees);
    spots.forEach((s, n) => {
      const sc = rand(0.8, 1.6);
      dummy.position.set(s.p.x, s.p.y + 2.4 * sc, s.p.z); dummy.rotation.set(0, rand(0, 6.28), 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); trunk.setMatrixAt(n, dummy.matrix);
      dummy.position.y += 3.2 * sc; dummy.updateMatrix(); leafA.setMatrixAt(n, dummy.matrix);
      dummy.position.y += 2.2 * sc; dummy.updateMatrix(); leafB.setMatrixAt(n, dummy.matrix);
    });
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); world.add(trunk, leafA, leafB);
  }
  if (tk.tower && tH) { /* glass tower under the plateau — the road runs across its roof */
    const tw = tk.tower, c = pts[tw.idx], base = tH(c.x, c.z) - 2, top = c.y - 1.2, hh = top - base;
    const win = canvasTex(64, 64, g => { g.fillStyle = '#1d3350'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#5f86b3'; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) g.fillRect(a * 16 + 2, b * 16 + 3, 12, 9); });
    win.wrapS = win.wrapT = THREE.RepeatWrapping; win.repeat.set(tw.w / 9, hh / 11);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw.w, hh, tw.d), new THREE.MeshStandardMaterial({ map: win, metalness: 0.5, roughness: 0.3 }));
    tower.position.set(c.x, base + hh / 2, c.z); tower.rotation.y = Math.atan2(tan[tw.idx].x, tan[tw.idx].z); tower.castShadow = true; world.add(tower);
  }
  if (tk.acacias) { /* flat-topped acacia */
    const spots = scScatter(tk.acacias, WALL + 6, WALL + 120);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.32, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x4e3b28, roughness: 0.95 }), tk.acacias);
    const crown = new THREE.InstancedMesh(new THREE.CylinderGeometry(3.8, 2.6, 1.0, 9), new THREE.MeshStandardMaterial({ color: 0x7d8a2c, roughness: 0.9 }), tk.acacias);
    spots.forEach((s, n) => { const sc = rand(0.8, 1.5); dummy.position.set(s.p.x, s.p.y + 2.1 * sc, s.p.z); dummy.rotation.set(0, rand(0, 6.28), 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); trunk.setMatrixAt(n, dummy.matrix); dummy.position.y += 2.4 * sc; dummy.updateMatrix(); crown.setMatrixAt(n, dummy.matrix); });
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); world.add(trunk, crown);
  }
  if (tk.baobabs) { /* fat-trunk baobab */
    const spots = scScatter(tk.baobabs, WALL + 14, WALL + 150);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 2.2, 8, 9), new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: 1 }), tk.baobabs);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(4.2, 0), new THREE.MeshStandardMaterial({ color: 0x5b6b2a, roughness: 0.95, flatShading: true }), tk.baobabs);
    spots.forEach((s, n) => { const sc = rand(0.9, 1.7); dummy.position.set(s.p.x, s.p.y + 4 * sc, s.p.z); dummy.rotation.set(0, rand(0, 6.28), 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); trunk.setMatrixAt(n, dummy.matrix); dummy.position.y += 5.2 * sc; dummy.scale.set(sc * 1.1, sc * 0.7, sc * 1.1); dummy.updateMatrix(); crown.setMatrixAt(n, dummy.matrix); });
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); world.add(trunk, crown);
  }
  if (tk.umbrellas) {
    const spots = scScatter(tk.umbrellas, WALL + 5, WALL + 26);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), new THREE.MeshStandardMaterial({ color: 0xd8d2c2 }), tk.umbrellas);
    const can = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), tk.umbrellas);
    const cols = [0xff5a5a, 0x2de2ff, 0xffd166, 0x9dff8a, 0xff7bd5];
    spots.forEach((s, n) => {
      dummy.position.set(s.p.x, s.p.y + 1.3, s.p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pole.setMatrixAt(n, dummy.matrix);
      dummy.position.y += 1.5; dummy.updateMatrix(); can.setMatrixAt(n, dummy.matrix);
      can.setColorAt(n, new THREE.Color(cols[n % cols.length]));
    });
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); world.add(pole, can);
  }
  if (tk.rocks) {
    const spots = scScatter(tk.rocks, WALL + 3, WALL + 40);
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.1), new THREE.MeshStandardMaterial({ color: 0x5d6458, roughness: 1 }), tk.rocks);
    spots.forEach((s, n) => { dummy.position.set(s.p.x, s.p.y + 0.4, s.p.z); dummy.rotation.set(rand(0, 3), rand(0, 6.28), rand(0, 3)); dummy.scale.set(rand(0.5, 1.6), rand(0.4, 1.1), rand(0.5, 1.6)); dummy.updateMatrix(); rock.setMatrixAt(n, dummy.matrix); });
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); world.add(rock);
  }
}

/* ---------- drivers: equipped perk (see drivers.js) ---------- */
const drvOwned = () => { const o = store.get('ksr.drv', ['kay', 'amina']); return Array.isArray(o) ? o : ['kay', 'amina']; };
const drvId = () => store.get('ksr.driver', 'kay');
const drv = () => driverById(drvId()).perk;

/* ---------- track traffic: danfo buses & keke tricycles (Lagos flavour) ---------- */
function mkDanfo() {
  const g = new THREE.Group();
  const y = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.5, metalness: 0.1 });
  const dk = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, 5.2), y); body.position.y = 1.05; body.castShadow = true; g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.26, 5.22), dk); stripe.position.y = 0.72; g.add(stripe);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 1.1), dk); cab.position.set(0, 1.86, 1.9); g.add(cab);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.44, 4.4), new THREE.MeshStandardMaterial({ color: 0x8a6d1f, roughness: 0.75 })); rack.position.set(0, 2.0, -0.5); g.add(rack);
  [[-1.02, 1.7], [1.02, 1.7], [-1.02, -1.7], [1.02, -1.7]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dk); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w); });
  return g;
}
function mkKeke() {
  const g = new THREE.Group();
  const y = new THREE.MeshStandardMaterial({ color: 0xf2d21f, roughness: 0.5 });
  const dk = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.6 });
  const cn = new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 2.1), y); body.position.y = 0.62; body.castShadow = true; g.add(body);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.72, 1.6), cn); canopy.position.set(0, 1.32, -0.25); g.add(canopy);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), y); nose.position.set(0, 0.68, 1.15); g.add(nose);
  [[0, 1.2], [-0.62, -0.9], [0.62, -0.9]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10), dk); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w); });
  return g;
}
/* Lagos yellow cab: the slop-city workhorse — sleek, quick, everywhere */
function mkTaxi() {
  const g = new THREE.Group();
  const y = new THREE.MeshStandardMaterial({ color: 0xf7c531, roughness: 0.42, metalness: 0.25 });
  const dk = new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.15, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.4), y); body.position.y = 0.72; body.castShadow = true; g.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.3, 1.25), y); hood.position.set(0, 1.06, 1.55); g.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass); cabin.position.set(0, 1.32, -0.2); g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.16, 2.24), y); roof.position.set(0, 1.62, -0.2); g.add(roof);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.24, 0.34), new THREE.MeshBasicMaterial({ color: 0xfff3c0, toneMapped: false })); sign.position.set(0, 1.8, 0.62); g.add(sign);
  [[-0.98, 1.45], [0.98, 1.45], [-0.98, -1.45], [0.98, -1.45]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10), dk); w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); });
  return g;
}
/* white delivery van — slow, wide, and always in your lane */
function mkVan() {
  const g = new THREE.Group();
  const w = new THREE.MeshStandardMaterial({ color: 0xe8eaee, roughness: 0.55, metalness: 0.1 });
  const dk = new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.2, metalness: 0.5 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 4.9), w); box.position.y = 1.35; box.castShadow = true; g.add(box);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 0.9), w); nose.position.set(0, 0.95, 2.7); g.add(nose);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 0.1), glass); wind.position.set(0, 1.32, 2.48); g.add(wind);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.3, 4.94), new THREE.MeshStandardMaterial({ color: 0x2456b0, roughness: 0.5 })); stripe.position.y = 0.95; g.add(stripe);
  [[-1.08, 1.55], [1.08, 1.55], [-1.08, -1.6], [1.08, -1.6]].forEach(([x, z]) => { const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 10), dk); wl.rotation.z = Math.PI / 2; wl.position.set(x, 0.4, z); g.add(wl); });
  return g;
}
function buildTraffic(tk) {
  TRAF.forEach(t => { if (t.mesh.parent) t.mesh.parent.remove(t.mesh); });
  TRAF.length = 0;
  (tk.traffic || []).forEach(([kind, cnt]) => {
    for (let i = 0; i < cnt; i++) {
      const mesh = kind === 'danfo' ? mkDanfo() : kind === 'taxi' ? mkTaxi() : kind === 'van' ? mkVan() : mkKeke();
      world.add(mesh);
      TRAF.push({ mesh, kind, s: 0, lat: 0, speed: 0, dir: 1, stun: 0, base: 0 });
    }
  });
  resetTraffic();
}
function resetTraffic() {
  TRAF.forEach((t, i) => {
    t.s = ((i + 0.6) * N / Math.max(1, TRAF.length)) % N;
    t.dir = i % 2 ? -1 : 1;
    t.lat = (i % 2 ? -1 : 1) * (2.6 + (i % 3) * 2.1);
    t.base = t.kind === 'danfo' ? rand(10, 14) : t.kind === 'taxi' ? rand(12, 16) : t.kind === 'van' ? rand(9, 12) : rand(8, 11);
    t.speed = t.base; t.stun = 0;
  });
}
function stepTraffic(dt, racing) {
  if (cfg.type === 'arena' || cfg.type === 'adv' || !TRAF.length) return;
  TRAF.forEach(t => {
    if (t.stun > 0) t.stun -= dt;
    else t.s = (t.s + t.speed * t.dir * dt / ds + N * 2) % N;
    const g = sample(t.s, t.lat), m = t.mesh;
    m.position.set(g.p.x, g.p.y + 0.02, g.p.z);
    m.rotation.set(-Math.atan2(g.t.y, Math.hypot(g.t.x, g.t.z)) * (t.dir > 0 ? 1 : -1), Math.atan2(g.t.x, g.t.z) + (t.dir < 0 ? Math.PI : 0), 0);
  });
  if (racing) for (const a of AIs) { /* AI racers get hit by traffic too — it is not only you */
    if (!a.mesh.visible) continue;
    const am = a.mesh.position, ag = sample(a.s, a.lat);
    for (const t of TRAF) {
      const m = t.mesh, dx = am.x - m.position.x, dz = am.z - m.position.z;
      if (dx * dx + dz * dz > 40) continue;
      const yaw = Math.atan2(ag.t.x, ag.t.z);
      ab.x = am.x; ab.z = am.z; ab.vx = ag.t.x * a.speed; ab.vz = ag.t.z * a.speed; ab.cos = Math.cos(yaw); ab.sin = Math.sin(yaw); ab.angularVel = 0;
      cb.x = m.position.x; cb.z = m.position.z; cb.cos = Math.cos(m.rotation.y); cb.sin = Math.sin(m.rotation.y);
      cb.vx = Math.sin(m.rotation.y) * t.speed; cb.vz = Math.cos(m.rotation.y) * t.speed; cb.angularVel = 0;
      if (vehicleContact(ab, cb, ct)) {
        const cl = resolveVehicleContact(ab, cb, ct) || 0;
        a.lat += clamp((ct.nx * ag.r.x + ct.nz * ag.r.z) * ct.depth * 0.9, -2.5, 2.5);
        a.speed = clamp(ab.vx * ag.t.x + ab.vz * ag.t.z, 18, a.hard ? 150 : 95);
        if (cl > 9 && a.spinT <= 0) { a.spinT = 0.7; }
        puff(am, V3(0, 0.6, 0), 0.9);
      }
    }
  }
  if (!racing || P.finished) return;
  for (const t of TRAF) {
    const m = t.mesh, dx = P.pos.x - m.position.x, dz = P.pos.z - m.position.z;
    if (dx * dx + dz * dz > 40) continue;
    pb.x = P.pos.x; pb.z = P.pos.z; pb.vx = P.vel.x; pb.vz = P.vel.z; pb.cos = Math.cos(P.h); pb.sin = Math.sin(P.h); pb.angularVel = P.spin;
    cb.x = m.position.x; cb.z = m.position.z; cb.cos = Math.cos(m.rotation.y); cb.sin = Math.sin(m.rotation.y);
    cb.vx = Math.sin(m.rotation.y) * t.speed; cb.vz = Math.cos(m.rotation.y) * t.speed; cb.angularVel = 0;
    if (vehicleContact(pb, cb, ct)) {
      const cl = resolveVehicleContact(pb, cb, ct) || 0;
      P.pos.x += ct.nx * ct.depth * 0.9; P.pos.z += ct.nz * ct.depth * 0.9; P.vel.set(pb.vx, 0, pb.vz); P.spin = clamp(pb.angularVel, -2.5, 2.5);
      shake = Math.max(shake, clamp(cl / 14, 0.15, 0.9));
    }
  }
}

/* ---------- coins, gems & power-up boxes (single-player) ---------- */
const COIN_N = 90, GEM_N = 7, PUB_N = 10;
const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 14).rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.25, metalness: 0.85, emissive: 0x8a5a00, emissiveIntensity: 0.6 });
const gemGeo = new THREE.OctahedronGeometry(0.72);
const gemMat = new THREE.MeshStandardMaterial({ color: 0xb44df0, roughness: 0.1, metalness: 0.4, emissive: 0x7a1fd0, emissiveIntensity: 0.9 });
const pubTex = canvasTex(128, 128, g => { g.fillStyle = '#ff9a2f'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116); g.fillStyle = '#fff'; g.font = '900 78px Segoe UI,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 70); });
function rebuildPickups() {
  [coinMesh, gemMesh].forEach(m => { if (m && m.parent) m.parent.remove(m); });
  pubMeshes.forEach(m => { if (m.parent) m.parent.remove(m); });
  pubMeshes = [];
  coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, COIN_N); coinMesh.frustumCulled = false;
  gemMesh = new THREE.InstancedMesh(gemGeo, gemMat, GEM_N); gemMesh.frustumCulled = false;
  world.add(coinMesh, gemMesh);
  coinData = []; gemData = [];
  for (let i = 0; i < COIN_N; i++) {
    const idx = Math.floor((i + 0.5) * N / COIN_N), lat = Math.sin(idx * 0.11) * (W - 2.4);
    const p = pts[idx].clone().addScaledVector(right[idx], lat);
    coinData.push({ x: p.x, y: p.y + 1.0, z: p.z, got: false });
  }
  for (let i = 0; i < GEM_N; i++) {
    const idx = Math.floor((i + 0.35) * N / GEM_N + 41) % N, lat = Math.sin(idx * 0.31) * 3.4;
    const p = pts[idx].clone().addScaledVector(right[idx], lat);
    gemData.push({ x: p.x, y: p.y + 1.15, z: p.z, got: false });
  }
  for (let i = 0; i < PUB_N; i++) {
    const idx = Math.floor((i + 0.5) * N / PUB_N), lat = ((i % 3) - 1) * 4.2;
    const p = pts[idx].clone().addScaledVector(right[idx], lat);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshBasicMaterial({ map: pubTex, toneMapped: false }));
    m.position.set(p.x, p.y + 1.3, p.z); m.userData = { y0: p.y + 1.3, k: i, cd: 0 };
    world.add(m); pubMeshes.push(m);
  }
}
const rollItem = () => {
  const canSeek = AIs.some(a => a.mesh.visible) && (P.rank || 1) > 1; /* seeker needs a leader that is not you */
  let r = Math.random();
  if (canSeek && r < 0.2 + (P.rank > 3 ? 0.08 : 0)) return 'seeker';
  r = Math.random();
  return r < 0.30 ? 'rocket' : r < 0.52 ? 'shield' : r < 0.70 ? 'oil' : r < 0.90 ? 'magnet' : 'nitro';
};
function resetPickups() {
  raceCoins = 0; raceGems = 0; P_oilCd = 0; mpEvt = null;
  PU.item = null; PU.shield = 0; PU.magnet = 0;
  if (shieldBall) shieldBall.visible = false;
  document.body.classList.remove('puitem');
  coinData.forEach(c => { c.got = false; }); gemData.forEach(g => { g.got = false; });
  Oils.forEach(o => { if (o.mesh.parent) o.mesh.parent.remove(o.mesh); if (o.mesh.geometry) o.mesh.geometry.dispose(); if (o.mesh.material) o.mesh.material.dispose(); }); Oils.length = 0;
  Rockets.forEach(r => { if (r.mesh.parent) r.mesh.parent.remove(r.mesh); }); Rockets.length = 0;
  const itOn = itemsOn();
  if (coinMesh) coinMesh.visible = itOn; if (gemMesh) gemMesh.visible = itOn;
  pubMeshes.forEach(m => { m.visible = itOn; m.userData.cd = 0; m.userData.aiCd = []; });
  const ch = $('coinHud'); if (ch) ch.style.display = 'none';
  const ph = $('puHud'); if (ph) ph.style.display = 'none';
}
function usePowerup() {
  if (state !== 'race' || !itemsOn() || !PU.item || P.finished) return;
  const it = PU.item; PU.item = null; document.body.classList.remove('puitem');
  if (it === 'seeker') { if (!fireSeeker()) { PU.item = it; document.body.classList.add('puitem'); } }
  else if (it === 'rocket') fireRocket();
  else if (it === 'shield') { PU.shield = 6; if (shieldBall) shieldBall.visible = true; toast('SHIELD UP \u00b7 6s', '#8df'); sfxPad(); }
  else if (it === 'oil') { dropOil(); toast('OIL DROPPED', '#8df'); }
  else if (it === 'magnet') { PU.magnet = 7; toast('COIN MAGNET \u00b7 7s', '#ffd166'); sfxPad(); }
}
const mkRocketMesh = (cBody, cFlame) => {
  const m = new THREE.Group();
  m.add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: cBody, toneMapped: false })));
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: cFlame, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  fl.scale.set(1.6, 1.6, 1); fl.position.z = -1.2; m.add(fl);
  return m;
};
/* SEEKER: locks onto whoever is in 1st place and flies to meet them wherever they are on the circuit */
function fireSeeker() {
  let lead = null;
  AIs.forEach(a => { if (a.mesh.visible && (!lead || a.prog > lead.prog)) lead = a; });
  if (!lead) { toast('NO TARGET', '#ff9a52'); return false; }
  const m = mkRocketMesh(new THREE.Color(2.4, 0.3, 2.2), 0xff4de0); m.scale.setScalar(1.5); scene.add(m);
  Rockets.push({ mesh: m, s: (P.idx + 4) % N, lat: clamp(P.lat || 0, -(W - 1), W - 1), life: 18, seek: lead, speed: 150 });
  toast('SEEKER LOCKED: ' + lead.name, '#ff5ad8'); sfxWhoosh(); shake = Math.max(shake, 0.3);
  return true;
}
function fireRocket() {
  const m = mkRocketMesh(new THREE.Color(2.6, 1.0, 0.25), 0xff9a2f); scene.add(m);
  let tgt = null, bd = 1e9;
  AIs.forEach(a => { if (!a.mesh.visible) return; const d = ((a.s - P.idx) % N + N) % N; if (d > 2 && d < 400 && d < bd) { bd = d; tgt = { o: a }; } });
  if (!tgt && net.active) { /* multiplayer: home on the nearest human rival's live ghost */
    net.remotes().forEach(o => { const dx = o.x - P.pos.x, dz = o.z - P.pos.z, d2 = dx * dx + dz * dz; if (d2 < bd && d2 < 160000) { bd = d2; tgt = { ghost: o.uid }; } });
  }
  if (!tgt) TRAF.forEach(t => { const d = ((t.s - P.idx) % N + N) % N; if (d > 2 && d < 400 && d < bd) { bd = d; tgt = { o: t, traf: true }; } });
  Rockets.push({ mesh: m, s: (P.idx + 4) % N, lat: clamp(P.lat || 0, -(W - 1), W - 1), life: 3.4, tgt, speed: 135 });
  mpEvt = { k: 'r', s: P.idx, lat: clamp(P.lat || 0, -(W - 1), W - 1), ts: Date.now() }; /* rivals spawn this rocket on their own screen */
  sfxWhoosh(); shake = Math.max(shake, 0.3);
}
function dropOil() {
  const back = car.localToWorld(V3(0, 0.1, -3.4));
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(2.3, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.position.set(back.x, pts[P.idx].y + 0.09, back.z);
  world.add(mesh);
  Oils.push({ mesh, x: back.x, z: back.z, life: 14, arm: 1.2 });
  mpEvt = { k: 'o', s: P.idx, lat: clamp(P.lat || 0, -(W - 1), W - 1), ts: Date.now() };
}
function boomFX(p, n = 8) { for (let i = 0; i < n; i++) puff(p, V3(rand(-6, 6), rand(1, 5), rand(-6, 6)), 1.6); sfxThud(); shake = Math.max(shake, 0.45); }
function stepPickups(dt, racing) {
  AIs.forEach(a => { if (a.spinT > 0) a.spinT -= dt; if (a.oilCd > 0) a.oilCd -= dt; });
  if (!coinMesh || !coinMesh.visible) return;
  coinSpin += dt * 2.6;
  const t = performance.now() * 0.001;
  coinData.forEach((c, i) => {
    if (PU.magnet > 0 && racing && !c.got) {
      const dx = car.position.x - c.x, dz = car.position.z - c.z;
      if (dx * dx + dz * dz < 520) { c.x += dx * Math.min(1, dt * 6); c.z += dz * Math.min(1, dt * 6); c.y += (car.position.y + 0.8 - c.y) * Math.min(1, dt * 6); }
    }
    dummy.position.set(c.x, c.y + Math.sin(t * 2 + i * 0.7) * 0.12, c.z);
    dummy.rotation.set(0, coinSpin + i * 0.35, 0); dummy.scale.setScalar(c.got ? 0 : 1); dummy.updateMatrix();
    coinMesh.setMatrixAt(i, dummy.matrix);
  });
  coinMesh.instanceMatrix.needsUpdate = true;
  gemData.forEach((g, i) => {
    if (PU.magnet > 0 && racing && !g.got) {
      const dx = car.position.x - g.x, dz = car.position.z - g.z;
      if (dx * dx + dz * dz < 900) { g.x += dx * Math.min(1, dt * 7); g.z += dz * Math.min(1, dt * 7); g.y += (car.position.y + 0.9 - g.y) * Math.min(1, dt * 7); }
    }
    dummy.position.set(g.x, g.y + Math.sin(t * 1.7 + i) * 0.16, g.z);
    dummy.rotation.set(0, coinSpin * 0.8 + i * 0.9, 0); dummy.scale.setScalar(g.got ? 0 : 1.15); dummy.updateMatrix();
    gemMesh.setMatrixAt(i, dummy.matrix);
  });
  gemMesh.instanceMatrix.needsUpdate = true;
  if (racing && !P.finished) {
    const cy = car.position.y;
    coinData.forEach(c => { if (c.got) return; const dx = P.pos.x - c.x, dz = P.pos.z - c.z, dy = cy - c.y; if (dx * dx + dz * dz < 6.5 && Math.abs(dy) < 3) { c.got = true; raceCoins++; sfxCoin(); } });
    gemData.forEach(g => { if (g.got) return; const dx = P.pos.x - g.x, dz = P.pos.z - g.z, dy = cy - g.y; if (dx * dx + dz * dz < 9 && Math.abs(dy) < 3) { g.got = true; raceGems++; sfxPad(); toast('GEM +$750', '#d98aff'); } });
    const ch = $('coinHud');
    if (ch && (raceCoins + raceGems > 0)) { ch.style.display = 'flex'; $('coinN').textContent = 'COINS ' + raceCoins; $('gemN').textContent = 'GEMS ' + raceGems; }
  }
  pubMeshes.forEach(m => {
    const u = m.userData;
    m.rotation.y += dt * 1.7; m.position.y = u.y0 + Math.sin(t * 2 + u.k) * 0.24;
    /* AI racers grab boxes too (each racer has its own respawn timer; the player's box stays) */
    const ac = u.aiCd || (u.aiCd = []);
    AIs.forEach((a, n) => {
      if (ac[n] > 0) ac[n] -= dt;
      if (!racing || !itemsOn() || !a.mesh.visible || a.item || a.spinT > 0 || ac[n] > 0) return;
      const dx = a.mesh.position.x - m.position.x, dz = a.mesh.position.z - m.position.z;
      if (dx * dx + dz * dz < 8) { a.item = aiRollItem(); ac[n] = 8; a.itemT = rand(1.2, 3.5); }
    });
    if (u.cd > 0) { u.cd -= dt; if (u.cd <= 0) m.visible = itemsOn(); return; }
    if (!racing || P.finished || PU.item || !itemsOn()) return;
    const dx = P.pos.x - m.position.x, dz = P.pos.z - m.position.z;
    if (dx * dx + dz * dz < 7.5) {
      PU.item = rollItem(); m.visible = false; u.cd = 8; sfxPad();
      if (PU.item === 'nitro') { P.nitro = Math.min(1, P.nitro + 0.45); PU.item = null; toast('NITRO REFILL!', '#8df'); }
      else { toast(PU_NAMES[PU.item] + '!', '#ffd166'); document.body.classList.add('puitem'); }
    }
  });
  if (PU.shield > 0) { PU.shield -= dt; if (shieldBall) { shieldBall.visible = PU.shield > 0; shieldBall.material.opacity = 0.26 + Math.sin(t * 7) * 0.09; } }
  if (PU.magnet > 0) PU.magnet -= dt;
  stepRockets(dt, racing);
  stepOils(dt, racing);
}
const aiShieldGeo = new THREE.SphereGeometry(2.7, 16, 10);
function aiBlock(a) { /* AI shield absorbs one hit */
  if (!(a.shield > 0)) return false;
  a.shield = 0; if (a.shieldMesh) a.shieldMesh.visible = false;
  toast(a.name + "'S SHIELD BLOCKED IT", '#8df'); return true;
}
function aiRollItem() { const r = Math.random(); return r < 0.34 ? 'rocket' : r < 0.58 ? 'shield' : r < 0.78 ? 'oil' : 'nitro'; }
/* rivals shoot back: rockets at you when they are behind, oil when you are right on their tail */
function aiShoot(a, dt) {
  if (!itemsOn() || cfg.type === 'arena' || P.finished || !a.mesh.visible || a.spinT > 0) return;
  if (a.shield > 0) { a.shield -= dt; }
  if (a.shieldMesh) { a.shieldMesh.visible = a.shield > 0; if (a.shield > 0) a.shieldMesh.material.opacity = 0.26 + Math.sin(performance.now() * 0.007) * 0.09; }
  if (!a.item) return;
  if (a.itemT > 0) { a.itemT -= dt; return; }
  const gap = P.prog - a.prog; /* >0: player is ahead of this AI */
  if (a.item === 'rocket') {
    if (gap > 6 && gap < 100 && !FL.on) {
      a.item = null;
      const m = mkRocketMesh(new THREE.Color(0.9, 1.4, 2.8), 0xff3b3b); scene.add(m);
      Rockets.push({ mesh: m, s: (a.s + 4) % N, lat: a.lat, life: 3.6, tgt: null, ai: a, speed: Math.max(125, a.speed + 55) });
      toast('INCOMING! ' + a.name, '#ff6b6b'); sfxWhoosh();
    }
  } else if (a.item === 'oil') {
    if (gap < -3 && gap > -26 && Oils.length < 6) { /* player is right behind this AI */
      a.item = null;
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(2.3, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      const bk = sample(a.s - 3, a.lat); mesh.position.set(bk.p.x, bk.p.y + 0.09, bk.p.z); world.add(mesh);
      Oils.push({ mesh, x: bk.p.x, z: bk.p.z, life: 12, arm: 1.2, ai: a });
    }
  } else if (a.item === 'shield') {
    a.item = null; a.shield = 6;
    if (!a.shieldMesh) { a.shieldMesh = new THREE.Mesh(aiShieldGeo, new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); a.mesh.add(a.shieldMesh); }
    a.shieldMesh.visible = true;
  } else if (a.item === 'nitro') {
    a.item = null; a.boostT = rand(1.6, 2.4);
  }
}
function stepRockets(dt, racing) {
  for (let i = Rockets.length - 1; i >= 0; i--) {
    const r = Rockets[i];
    if (r.seek) { /* homing missile: closes the gap to the leader in either direction */
      const a = r.seek; let gap = (((a.s - r.s) % N) + N) % N; if (gap > N / 2) gap -= N;
      const step = Math.max(150, a.speed + 90) * dt / ds;
      r.s = (((r.s + clamp(gap, -step, step)) % N) + N) % N; r.life -= dt;
      r.lat += (clamp(a.lat || 0, -(W - 1), W - 1) - r.lat) * Math.min(1, dt * 5);
      const g = sample(r.s, r.lat);
      r.mesh.position.set(g.p.x, g.p.y + 0.8, g.p.z); r.mesh.rotation.y = Math.atan2(g.t.x, g.t.z);
      puff(r.mesh.position, V3(0, 0.5, 0), 0.8);
      const hit = racing && Math.abs(gap) <= step + 5 / ds; /* reached the target this frame (works at any frame rate) */
      if (hit) { if (!aiBlock(a)) { a.spinT = 2.0; a.speed *= 0.1; a.lat += rand(-2, 2); toast('SEEKER HIT ' + a.name + '!', '#ff5ad8'); } }
      if (hit || r.life <= 0) { boomFX(r.mesh.position, hit ? 14 : 4); scene.remove(r.mesh); Rockets.splice(i, 1); }
      continue;
    }
    r.life -= dt; r.s = (r.s + r.speed * dt / ds) % N;
    if (r.tgt && r.tgt.o) r.lat += (clamp(r.tgt.o.lat || 0, -(W - 1), W - 1) - r.lat) * Math.min(1, dt * 3.5);
    if (r.tgt && r.tgt.ghost) { /* multiplayer: steer toward the rival's LIVE ghost position */
      const gh = net.remotes().find(o => o.uid === r.tgt.ghost);
      if (gh) { const g0 = sample(r.s, 0), rr = right[r.s | 0] || right[0]; const lat = clamp((gh.x - g0.p.x) * rr.x + (gh.z - g0.p.z) * rr.z, -(W - 1), W - 1); r.lat += (lat - r.lat) * Math.min(1, dt * 3.2); }
    }
    const g = sample(r.s, r.lat);
    r.mesh.position.set(g.p.x, g.p.y + 0.65, g.p.z);
    r.mesh.rotation.y = Math.atan2(g.t.x, g.t.z);
    if (Math.random() < 0.5) puff(r.mesh.position, V3(0, 0.5, 0), 0.55);
    let hit = false;
    if (r.ai) { /* an AI rocket: homes on the player's lane */
      r.lat += (clamp(P.lat || 0, -(W - 1), W - 1) - r.lat) * Math.min(1, dt * 2.6);
      if (racing && !P.finished && FL.alt < 3) {
        const dx = car.position.x - r.mesh.position.x, dz = car.position.z - r.mesh.position.z;
        if (dx * dx + dz * dz < 9) {
          hit = true;
          if (PU.shield > 0) { PU.shield = 0; if (shieldBall) shieldBall.visible = false; toast('SHIELD BLOCKED IT!', '#8df'); }
          else { P.spin += (Math.random() < 0.5 ? -1 : 1) * rand(5, 7) * (drv().spin || 1); P.vel.multiplyScalar(0.62); shake = Math.max(shake, 0.9); toast('HIT BY ' + r.ai.name + '!', '#ff6b6b'); }
        }
      }
    } else if (racing) {
      for (const a of AIs) { if (!a.mesh.visible) continue; const dx = a.mesh.position.x - r.mesh.position.x, dz = a.mesh.position.z - r.mesh.position.z; if (dx * dx + dz * dz < 20) { if (aiBlock(a)) { hit = true; break; } a.spinT = 1.15; a.speed *= 0.2; a.lat += rand(-1.5, 1.5); hit = true; toast('ROCKET HIT!', '#ff9a52'); break; } }
      if (!hit && r.tgt && r.tgt.ghost) { /* visual confirmation only — the victim's own screen does the real spin */
        const gh = net.remotes().find(o => o.uid === r.tgt.ghost);
        if (gh) { const dx = gh.x - r.mesh.position.x, dz = gh.z - r.mesh.position.z; if (dx * dx + dz * dz < 20) { hit = true; toast('DIRECT HIT · ' + (gh.name || 'RIVAL') + '!', '#ff9a52'); } }
      }
      if (!hit) for (const t of TRAF) { const dx = t.mesh.position.x - r.mesh.position.x, dz = t.mesh.position.z - r.mesh.position.z; if (dx * dx + dz * dz < 18) { t.stun = 2.2; hit = true; toast('ROADBLOCK CLEARED!', '#ff9a52'); break; } }
    }
    if (hit || r.life <= 0) { boomFX(r.mesh.position, hit ? 10 : 4); scene.remove(r.mesh); Rockets.splice(i, 1); }
  }
}
function stepOils(dt, racing) {
  for (let i = Oils.length - 1; i >= 0; i--) {
    const o = Oils[i];
    o.life -= dt; o.arm -= dt;
    o.mesh.material.opacity = o.life < 2 ? Math.max(0, o.life / 2) * 0.85 : 0.85;
    if (o.life <= 0) { if (o.mesh.parent) o.mesh.parent.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); Oils.splice(i, 1); continue; }
    if (!racing || P.finished) continue;
    AIs.forEach(a => { if (o.ai === a || !a.mesh.visible || a.spinT > 0 || a.oilCd > 0) return; const dx = a.mesh.position.x - o.x, dz = a.mesh.position.z - o.z; if (dx * dx + dz * dz < 5.8) { if (aiBlock(a)) { a.oilCd = 3; return; } a.spinT = 0.95; a.oilCd = 5; a.speed *= 0.55; } });
    TRAF.forEach(t => { if (t.stun > 0) return; const dx = t.mesh.position.x - o.x, dz = t.mesh.position.z - o.z; if (dx * dx + dz * dz < 5.8) t.stun = 1.6; });
    if (P_oilCd > 0) P_oilCd -= dt;
    else if (PU.shield <= 0 && FL.alt < 2) { const dx = P.pos.x - o.x, dz = P.pos.z - o.z; if (dx * dx + dz * dz < 5.4) { P.spin += rand(4.5, 6.5) * (drv().spin || 1); P.vel.multiplyScalar(0.8); P_oilCd = 3.5; shake = Math.max(shake, 0.5); toast('OIL SLICK!', '#ffd166'); sfxThud(); } }
  }
}
/* boot the default city circuit */
neonGroup = new THREE.Group(); neonGroup.visible = false; scene.add(neonGroup);
buildWorld(TRACKS.city);
const arena = createArena(canvasTex);
scene.add(arena.group, camera);
/* ---------- cars ---------- */
const SPORT_GEO = buildCarGeometry(SPORT);
const carMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 });
carMat.envMap = scene.environment; carMat.envMapIntensity = 1.3; /* real showroom reflections on the paint (scaled per time of day) */
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
/* base stats + garage upgrades: ENGINE +3% top/+6% accel · TYRES +3.5% steer/+5% drift per level,
   NITRO boosts harder, drains slower, refills faster (applied in the boost code below) */
const carStats = id => {
  const s = { ...getCar(id).stats };
  const en = economy.upLevel(id, 'en'), ty = economy.upLevel(id, 'ty');
  s.top = Math.round(s.top * (1 + 0.03 * en) * 10) / 10;
  s.accel = Math.round(s.accel * (1 + 0.06 * en) * 10) / 10;
  s.steer = Math.round(s.steer * (1 + 0.035 * ty) * 100) / 100;
  s.drift = Math.round(s.drift * (1 + 0.05 * ty) * 100) / 100;
  s.ni = economy.upLevel(id, 'ni'); s.fl = economy.upLevel(id, 'fl');
  if (id === economy.sel) { /* the equipped driver's perk rides on YOUR selected car only (display + physics stay in agreement) */
    const p = drv();
    s.top = Math.round(s.top * (p.top || 1) * 10) / 10;
    s.steer = Math.round(s.steer * (p.steer || 1) * 100) / 100;
  }
  return s;
};
const car = makeCar(curColor, carGeo(economy.selected()), getCar(economy.selected()).tint || null);
let CS = carStats(economy.selected());
/* PAINT CACHE — colorized geometry per (car, colour): garage arrows & colour swatches
   become instant (no clone, no vertex recolour) after the first look at a combo */
const paintCache = new Map();
function paintedGeo(id, color) {
  const c = getCar(id), tint = c.tint || null;
  const key = id + '|' + color + '|' + (tint ? Object.keys(tint).map(k => k + ':' + tint[k]).join(',') : '');
  let g = paintCache.get(key);
  if (!g) {
    g = carGeo(id).clone();
    colorize(g, color);
    if (tint) for (const [pid, hex] of Object.entries(tint)) tintPart(g, +pid, hex);
    paintCache.set(key, g);
    if (paintCache.size > 24) { const first = paintCache.keys().next().value; if (first !== key) paintCache.delete(first); }
  }
  return g;
}
/* TATTOOS — thin decal planes on the body of the given car group */
const tatMap = () => store.get('ksr.tat', {});
const tatFor = carId => tatMap()[carId] || 'none';
const tatsOwned = () => { const o = store.get('ksr.tats', null); return Array.isArray(o) && o.length ? o : ['none', 'stripes']; };
function applyTattoo(g, carId, tatId) {
  if (g.userData.tatGrp) {
    g.userData.tatGrp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    g.remove(g.userData.tatGrp); g.userData.tatGrp = null;
  }
  const tid = tatId || tatFor(carId);
  if (!tid || tid === 'none') return;
  const body = (g.children || []).find(o => o.isMesh && o.geometry && o.geometry.attributes.partId); /* the actual painted body, wherever it sits */
  if (!body) return;
  if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
  const grp = buildDecals(body.geometry.boundingBox, tid, body.geometry);
  if (grp) { g.add(grp); g.userData.tatGrp = grp; }
}
applyTattoo(car, economy.selected()); /* boot: livery on the showroom car */
function tatClick(id) {
  const t = tatById(id), carId = economy.selected();
  if (!tatsOwned().includes(id)) {
    if (economy.money < t.price) { toast(`NEED $${(t.price - economy.money).toLocaleString()} MORE FOR ${t.name}`, '#ff7b7b'); beep(220, 0.2, 'square', 0.1); return; }
    economy.spend(t.price); store.set('ksr.tats', [...tatsOwned(), id]);
    sfxMission(); confetti(30); toast(`${t.name} UNLOCKED!`, '#7dff8a');
  } else sfxPad();
  const m = tatMap(); m[carId] = id; store.set('ksr.tat', m);
  applyTattoo(car, carId); updateMoneyUI();
  toast(`${t.name} ON THE ${getCar(carId).name}`, '#8be5ff');
  renderTattoos(); renderGarage();
}
function renderTattoos() {
  const list = $('tatList'); if (!list) return;
  const carId = economy.selected(), owned = tatsOwned();
  list.innerHTML = `<div class="lbl" style="margin:2px 0 8px">STICKERS FOR YOUR ${getCar(carId).name}</div>` + TATTOOS.map(t => {
    const eq = tatFor(carId) === t.id, has = owned.includes(t.id);
    return `<button type="button" class="tatCard${eq ? ' eq' : ''}" data-tat="${t.id}">
      <img src="${tatThumb(t.id)}" alt="" draggable="false">
      <span class="tatN">${t.name}</span>
      <span class="tatS">${eq ? 'EQUIPPED' : has ? 'OWNED · TAP TO FIT' : '$' + t.price.toLocaleString()}</span>
    </button>`;
  }).join('');
}
function rebuildCar(id) {
  const c = getCar(id);
  const old = (car.children || []).find(o => o.isMesh && o.geometry && o.geometry.attributes.partId); /* never yank a lamp by mistake */
  if (old) car.remove(old);
  const body = new THREE.Mesh(paintedGeo(id, curColor), carMat); body.castShadow = true;
  car.add(body);
  const bi = car.children.indexOf(body); /* keep the body FIRST — lamps/decals stay ordered behind it */
  if (bi > 0) { car.children.splice(bi, 1); car.children.unshift(body); }
  applyTattoo(car, id);
  CS = carStats(id);
  document.body.classList.toggle('canfly', !!c.stats.fly);
}
function applyPlayerCar(id) { economy.select(id); rebuildCar(id); updateMoneyUI(); }
car.headlight = new THREE.SpotLight(0xfff0d0, 0, 170, 0.5, 0.7, 2);
{ const tg = new THREE.Object3D(); tg.position.set(0, 0.4, 30); car.headlight.position.set(0, 0.8, 2); car.add(car.headlight, tg); car.headlight.target = tg; }
/* shield bubble (power-up): additive sphere that rides on the player car */
const shieldBall = new THREE.Mesh(new THREE.SphereGeometry(2.7, 20, 14), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
shieldBall.visible = false; car.add(shieldBall);
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
  scene.environmentIntensity = e.env; carMat.envMapIntensity = Math.max(0.2, e.env * 3.4); clouds.forEach(c => { c.material.opacity = e.cloud; });
  bloomPass.strength = e.bloom; if (cityMat) cityMat.emissiveIntensity = e.glow * 1.4;
  starMat.opacity = e.stars; car.headlight.intensity = e.head * 2000;
  const ss = SUNSPR[k] || SUNSPR.day; sunSpr.position.set(...e.pos).normalize().multiplyScalar(2300); sunSpr.material.opacity = ss[0]; sunSpr.material.color.setHex(ss[1]);
  /* Night Circuit: rain streaks + neon city + wet reflective asphalt */
  neonOn = !!e.rain;
  rain.visible = !!e.rain; neonGroup.visible = !!e.rain;
  neonLights.forEach(L => { L.intensity = e.rain ? 5200 : 0; });
  if (roadStrip) { roadStrip.material.roughness = wet ? 0.24 : 0.7; roadStrip.material.metalness = wet ? 0.55 : 0; roadStrip.material.needsUpdate = false; }
  const TKC = TRACKS[curTrack] || TRACKS.city;
  if (ground) { ground.material.color.setHex(wet ? 0x11151c : TKC.ground); ground.material.roughness = wet ? 0.35 : (TKC.id === 'bridge' ? 0.28 : 1); ground.material.metalness = wet ? 0.45 : (TKC.id === 'bridge' ? 0.25 : 0); }
  if (cityMat) { cityMat.roughness = wet ? 0.22 : 0.45; cityMat.metalness = wet ? 0.5 : 0.2; }
  if (adv) adv.setEnv(e, wet);
  document.body.classList.toggle('nc', wet);
}
const flyCap = () => 8 + 4 * (CS.fl || 0); /* flight tank in seconds: 8s base, +4s per FLIGHT upgrade level */
const P = { jy: 0, jv: 0, fuel: 8, spin: 0, pos: V3(), vel: V3(), h: 0, idx: 0, crosses: 0, nitro: 1, prog: 0, finished: false, rank: 6, scOn: false, scI: 0 };
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
  if (e.code === 'KeyE' && !e.repeat) { if (cfg.type === 'adv' && state === 'race' && adv.S.near) act('advJoin'); else usePowerup(); }
  if (e.code === 'KeyM') muted = !muted;
  if (state === 'menu' && !e.repeat && document.activeElement !== $('dname')) menuKeys(e);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* gamepad */
const gp = { steer: 0, up: 0, down: 0, boost: 0, drift: 0, fly: false, item: false };
let flyWant = 0, padFlyPrev = false, flyKeyPrev = false, padItemPrev = false;
function pollPad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let dev = null; for (const g of gps) if (g && g.connected) { dev = g; break; }
  if (!dev) { gp.steer = 0; gp.up = gp.down = gp.boost = gp.drift = 0; gp.fly = false; gp.item = false; padFlyPrev = false; padItemPrev = false; return; }
  const dz = v => Math.abs(v) < 0.14 ? 0 : v;
  gp.steer = -dz(dev.axes[0] || 0);
  gp.up = dev.buttons[7] && dev.buttons[7].value > 0.12 ? 1 : 0;
  gp.down = dev.buttons[6] && dev.buttons[6].value > 0.12 ? 1 : 0;
  gp.boost = dev.buttons[0] && dev.buttons[0].pressed ? 1 : 0;
  gp.drift = dev.buttons[2] && dev.buttons[2].pressed ? 1 : 0;
  gp.fly = !!(dev.buttons[3] && dev.buttons[3].pressed);
  gp.item = !!(dev.buttons[4] && dev.buttons[4].pressed) || !!(dev.buttons[5] && dev.buttons[5].pressed);
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

/* ---------- ADVENTURE: free-roam open city (NFS / Forza Horizon style) ---------- */
const adv = createAdventure(canvasTex, {
  mkDanfo, mkKeke, mkTaxi, mkVan,
  mkPolice: () => makeCar(0xf2f4f7, carGeo('titan'), getCar('titan').tint || null),
  getTop: () => CS.top,
  pPos: () => P.pos, pVel: () => P.vel,
  economy, missionEvent,
  beep: (f, d, t, v) => beep(f, d, t, v),
  toast: (t, c) => toast(t, c),
  thud: () => sfxThud(),
  shake: v => { shake = Math.max(shake, v); },
  puff: (p, k) => puff(p, V3(0, 0.6, 0), k),
  trackName: id => (TRACKS[id] || TRACKS.city).name,
  nitroAdd: n => { P.nitro = Math.min(1, P.nitro + n); },
  onRam: (nx, nz, imp) => { P.vel.x += nx * imp; P.vel.z += nz * imp; shake = Math.max(shake, 0.45); sfxThud(); },
  busted: amt => { if (amt > 0) economy.spend(amt); toast(amt > 0 ? `BUSTED!  -$${amt.toLocaleString()}` : 'BUSTED!', '#ff6b6b'); shake = 1; sfxThud(); },
  escape: () => { economy.add(500); toast('LOST THE COPS!  +$500', '#7dff8a'); missionEvent('escape', 1); confetti(24); }
});
scene.add(adv.group);

/* ---------- HUD helpers ---------- */
const mm = $('mm'), mc = mm.getContext('2d');
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, msc = 1;
const pad = 30;
const mxy = (x, z) => [pad + (x - minX) * msc, pad + (maxZ - z) * msc];
const mmBase = document.createElement('canvas'); mmBase.width = mm.width; mmBase.height = mm.height;
function mmRedraw() {
  minX = 1e9; maxX = -1e9; minZ = 1e9; maxZ = -1e9;
  pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
  msc = (mm.width - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const g = mmBase.getContext('2d'); g.clearRect(0, 0, mm.width, mm.height); g.lineJoin = 'round'; g.beginPath();
  pts.forEach((p, i) => { const [x, y] = mxy(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
  g.strokeStyle = '#05080d'; g.lineWidth = 14; g.stroke(); g.strokeStyle = '#9fb0c4'; g.lineWidth = 8; g.stroke();
  const [sx, sy] = mxy(pts[0].x, pts[0].z); g.fillStyle = '#fff'; g.fillRect(sx - 8, sy - 2, 16, 4);
  if (SC) { /* the secret shortcut glows gold on the map */
    g.strokeStyle = '#ffb347'; g.lineWidth = 5; g.setLineDash([7, 5]); g.beginPath();
    SC.p2.forEach((p, i) => { const [x, y] = mxy(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke(); g.setLineDash([]);
    const [ex2, ey2] = mxy(SC.p2[0].x, SC.p2[0].z);
    g.fillStyle = '#ffb347'; g.beginPath(); g.arc(ex2, ey2, 6, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
  }
}
mmRedraw();
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
let toastT = 0;
const toast = (txt, col = '#7dff8a') => { const e = $('toast'); e.textContent = txt; e.style.color = col; e.style.opacity = 1; toastT = 1.3; };

/* ---------- game state / menus ---------- */
let state = 'menu', cdT = 3, raceT = 0, shake = 0, camYaw = P.h, lastRank = 6, ovCool = 0, goT = 0, prevState = 'race', menuT = 0, prevCrosses = 0, lapStart = 0, bestLap = Infinity;
const DIFF = [0.9, 1, 1.07], PTS = [10, 8, 6, 4, 2, 1], LEVELS = ['Easy', 'Normal', 'Hard'];
const CUPS = [
  { name: 'CITY DAWN', type: 'race', env: 'dawn', laps: 2, diff: 1, track: 'city' },
  { name: 'BEACH SPRINT', type: 'race', env: 'day', laps: 3, diff: 1, track: 'beach' },
  { name: 'AIRFIELD DRIFT', type: 'arena', env: 'day', dur: 90, diff: 1, track: 'city' },
  { name: 'BRIDGE RUN', type: 'race', env: 'sunset', laps: 3, diff: 2, track: 'bridge' },
  { name: 'KADUNA DUST', type: 'race', env: 'sunset', laps: 3, diff: 2, track: 'kaduna' },
  { name: 'OBUDU CLIMB', type: 'race', env: 'dawn', laps: 2, diff: 2, track: 'obudu' },
  { name: 'SKY MEGA RAMP', type: 'race', env: 'day', laps: 2, diff: 2, track: 'mega' },
  { name: 'NIGHT GRAND PRIX', type: 'race', env: 'night', laps: 3, diff: 2, track: 'city' }
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
const opt = Object.assign({ laps: 3, diff: 1, dur: 90, env: 'day', track: 'city', q: mobile ? 'med' : 'high', snd: 'on', board: 'race3', ctrl: 'stick' }, store.get('sr.opt', {}));
const show = (id, on) => $(id).classList.toggle('hide', !on);
const ord = n => n + ['th', 'st', 'nd', 'rd'][n <= 3 ? n : 0];

function setState(s) {
  state = s; document.body.classList.toggle('menu', s === 'menu'); document.body.classList.toggle('done', s === 'finished');
}
function followSun() { sun.position.set(car.position.x + sunOff.x, car.position.y + sunOff.y, car.position.z + sunOff.z); sun.target.position.copy(car.position); }

function resetWorld(c) {
  c = Object.assign({ type: 'race' }, c); cfg = c; TOTAL = c.laps || 1;
  if (c.type !== 'adv') ensureTrack(c.track || 'city'); /* free-roam has its own city: no need to rebuild the circuit each time you come back */
  setEnv(c.env); AIs = AI.slice(0, c.ai);
  const arenaOn = c.type === 'arena', advOn = c.type === 'adv';
  world.visible = !arenaOn && !advOn; arena.group.visible = arenaOn; if (arenaOn) arena.reset();
  adv.group.visible = advOn;
  const nightOn = !arenaOn && !advOn && c.env === 'nightRain';
  neonGroup.visible = nightOn; padsNight.forEach(p => { p.visible = nightOn; });
  document.body.classList.toggle('arena', arenaOn && c.mode !== 'menu');
  document.body.classList.toggle('adv', advOn && c.mode !== 'menu');
  $('paintBar').classList.remove('open');
  let g;
  if (arenaOn) { g = { p: V3(0, 0, -150) }; P.pos.set(0, 0, -150); P.h = 0; P.idx = 0; }
  else if (advOn) { const sp = adv.enter(c.env, !!c.resume); g = { p: V3(sp.x, 0, sp.z) }; P.pos.set(sp.x, 0, sp.z); P.h = sp.h; P.idx = 0; }
  else { const slot = c.ai + (c.netSlot || 0); g = sample(-(slot + 1) * 2.4, slot % 2 ? 4 : -4); P.pos.copy(g.p); P.h = Math.atan2(g.t.x, g.t.z); P.idx = (N - Math.round((slot + 1) * 2.4)) % N; }
  P.vel.set(0, 0, 0); P.jy = 0; P.jv = 0; P.spin = 0; P.crosses = 0; P.nitro = 1; P.fuel = flyCap(); P.finished = false; P.rank = c.ai + (c.netSlot || 0) + 1; P.prog = 0; P.scOn = false; P.scI = 0; scCdT = 0;
  AI.forEach((a, k) => { a.mesh.visible = k < c.ai; a.s = -(k + 1) * 2.4; a.lat = a.latT = k % 2 ? 4 : -4; a.timer = 0; a.speed = 0; a.base = c.diff >= 2 ? CS.top * rand(0.89, 0.96) - k * 0.7 : (rand(62, 71) - k * 0.4) * DIFF[c.diff] * (0.74 + CS.top / 132 * 0.28); a.hard = c.diff >= 2; a.boostT = 0; a.boostCd = rand(3, 7); a.fireCd = rand(6, 11) + k * 1.8 + [22, 10, 2][c.diff] ; a.oilCd2 = rand(6, 12); a.item = null; a.itemT = 0; a.shield = 0; if (a.shieldMesh) a.shieldMesh.visible = false; });
  smoke.forEach(o => { o.life = 0; o.s.visible = false; });
  car.flames.forEach(f => { f.visible = false; });
  Object.assign(A, { score: 0, comboT: 0, hold: 0, mult: 1, maxMult: 1, cones: 0, dur: c.dur || 90, t: c.dur || 90, hit: 0 });
  Object.assign(FL, { on: false, alt: 0, tgt: 0, land: false, time: 0 }); flyWant = 0; document.body.classList.remove('flying');
  Object.assign(RD, { pts: 0, hold: 0, comboT: 0, mult: 1, maxMult: 1, pads: 0 });
  GR.reset();
  pads.forEach(p => { p.userData.cd = 0; p.userData.flash = 0; });
  resetPickups(); resetTraffic();
  resetSkids();
  raceT = 0; shake = 0; lastRank = c.ai + 1; ovCool = 0; goT = 0; prevCrosses = 0; lapStart = 0; bestLap = Infinity; camYaw = P.h;
  camera.position.set(g.p.x - Math.sin(P.h) * 9, g.p.y + 4, g.p.z - Math.cos(P.h) * 9);
}
let ncIntroT = 0;
function startRace(c) {
  show('menu', false); show('pause', false); show('finish', false); if ($('fglobal')) $('fglobal').textContent = '';
  if (c.mode === 'mp' && c.netSlot === undefined) c.netSlot = net.mySlot;
  resetWorld(c); setupGhost();
  if (c.type === 'adv' && c.mode !== 'mp') { setState('race'); $('count').style.display = 'none'; } /* solo free-roam: no countdown */
  else { setState('count'); cdT = 3; $('cd').textContent = '3'; ['l1', 'l2', 'l3'].forEach(l => $(l).className = ''); $('count').style.display = 'flex'; }
  if (c.env === 'nightRain') { const iv = $('ncIntro'); iv.classList.add('show'); clearTimeout(ncIntroT); ncIntroT = setTimeout(() => iv.classList.remove('show'), 2400); }
  if (!actx) initAudio(); if (actx && actx.state === 'suspended') actx.resume();
  if (c.title) toast(c.title, '#7df');
}
/* V9 dashboard: hero driver badge + live ladder preview on the main screen */
function updateHeroBadge() {
  const d = driverById(drvId()), av = $('hrAv'), nm = $('hrDrv'), pk = $('hrPerk');
  if (av) av.textContent = d.name[0];
  if (nm) nm.textContent = d.name;
  if (pk) pk.textContent = d.title;
  const tp = $('hmTip'); if (tp) tp.style.display = store.get('ksr.tipDone', 0) ? 'none' : '';
}
function mdActive() {
  const rail = $('mdRail'), d = $('mdDots'); if (!rail || !d || !rail.children[0]) return;
  const i = Math.max(0, Math.min(rail.children.length - 1, Math.round(rail.scrollLeft / (rail.children[0].offsetWidth + 12))));
  [...d.children].forEach((x, k) => x.classList.toggle('on', k === i));
}
function mdDots() {
  const rail = $('mdRail'), d = $('mdDots'); if (!rail || !d) return;
  if (d.children.length !== rail.children.length) d.innerHTML = Array.from(rail.children, () => '<b></b>').join('');
  rail.scrollLeft = 0; mdActive();
}
{ const r = $('mdRail'); if (r) r.addEventListener('scroll', mdActive, { passive: true }); }
async function loadLadder() {
  const box = $('ladderBox'); if (!box) return;
  let entries = boardCache['race3'];
  if (!entries) entries = await cloud.fetchBoard('race3');
  if (!entries) { box.innerHTML = '<span class="ladRow"><b>—</b><span>CLOUD OFFLINE · LOCAL ONLY</span><i></i></span>'; return; }
  boardCache['race3'] = entries;
  const mine = driverName();
  if (!entries.length) { box.innerHTML = '<span class="ladRow"><b>—</b><span>NO TIMES YET · BE FIRST!</span><i></i></span>'; return; }
  box.innerHTML = entries.slice(0, 3).map((e, i) => `<span class="ladRow${e.name === mine ? ' me' : ''}"><b>${i + 1}</b><span>${esc(e.name)}</span><i>${fmt((e.val || 0) / 1000)}</i></span>`).join('');
}
function toMenu() {
  show('pause', false); show('finish', false); show('menu', true); $('count').style.display = 'none';
  resetWorld({ mode: 'menu', laps: 3, diff: 1, ai: 5, env: ['day', 'dawn', 'sunset', 'night'][(Math.random() * 4) | 0] });
  setState('menu'); showScreen('main'); audioUpdate(-1, false);
  updateHeroBadge(); loadLadder();
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
  if (cfg.type === 'arena') { P.pos.set(0, 0, -150); P.h = 0; }
  else if (cfg.type === 'adv') { const s = adv.nearestStreet(P.pos); P.pos.set(s.x, 0, s.z); }
  else { P.scOn = false; const g = sample(P.idx, 0); P.pos.copy(g.p); P.h = Math.atan2(g.t.x, g.t.z); }
  P.vel.set(0, 0, 0); P.spin = 0; camYaw = P.h; toast('RESPAWN', '#ffffff');
}

/* menu wiring */
const screens = [...document.querySelectorAll('#menu .screen')];
let lastScreen = 'main';
const HINTS = {
  main: 'TAP RACE TO PLAY \u00b7 GARAGE TO CHANGE YOUR CAR', modes: 'SWIPE TO SEE ALL MODES \u00b7 TAP PLAY',
  quick: 'SET OPTIONS \u00b7 START TO RACE', tour: '5 ROUNDS \u00b7 CHAMPION TAKES THE CROWN',
  night: 'NIGHT CIRCUIT · RAIN · NEON · ×1.8 CASH', multi: 'CREATE A ROOM · SHARE THE CODE · RACE LIVE',
  arena: 'DRIFT \u00b7 SMASH CONES \u00b7 BEAT THE CLOCK', tt: 'CLEAN LINES SET RECORDS',
  adv: 'FREE ROAM · DRIVE TO RACE MARKERS · LOSE THE COPS',
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
  const fc = $('flyChip'); if (fc) { const fly = !!CS.fly; fc.style.display = fly ? '' : 'none'; if (fly) fc.textContent = `FLIGHT TANK  ${flyCap()}s  \u00b7  UPGRADE IN GARAGE`; }
  if (n === 'modes') { updateNightUI(); mdDots(); }
  if (n === 'tour') renderTour();
  if (n === 'night') { updateNightUI(); }
  if (n === 'adv') { const nb = $('advNc'); if (nb) nb.style.display = nightUnlocked() ? '' : 'none'; }
  if (n === 'multi') renderMp();
  if (n === 'tt') renderBest();
  if (n === 'arena') renderArBest();
  if (n === 'garage') { previewId = null; gIdx = Math.max(0, CARS.findIndex(c => c.id === economy.selected())); renderGarage(); rebuildCar(economy.selected()); }
  if (n === 'missions') renderMissions();
  if (n === 'online') renderBoard();
  if (n === 'main') renderDaily();
  if (n === 'quick' || n === 'tt' || n === 'arena') setEnv(opt.env);
}
/* console-style keyboard navigation: arrows move the highlight, enter selects, esc backs out */
let kbIdx = -1;
function menuKeys(e) {
  if (e.code === 'Escape' || e.code === 'Backspace') { if (lastScreen !== 'main') { kbIdx = -1; showScreen(({ quick: 'modes', arena: 'modes', tt: 'modes', tour: 'modes', night: 'modes', adv: 'modes' })[lastScreen] || 'main'); } return; }
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
function renderArBest() { const b = store.get(`sr.best.arena.${opt.dur}`, null), el = $('arBest'); if (!el) return; el.style.display = b === null ? 'none' : ''; if (b !== null) el.textContent = `BEST SCORE  ${b.toLocaleString()}`; }
function renderBest() { const b = store.get(`sr.best.tt.${opt.laps}${tsx(opt.track)}`, null), el = $('ttBest'); if (!el) return; el.style.display = b === null ? 'none' : ''; if (b !== null) el.textContent = `BEST TIME  ${fmt(b)}`; }
function renderTour() {
  const r = T ? T.round : 0;
  let h = CUPS.map((c, i) => `<div class="rr${i === r ? ' me' : ''}"><b>${i + 1}</b><span>${c.name}</span><em>${c.type === 'arena' ? c.dur + 's · drift score' : c.laps + ' laps · ' + LEVELS[c.diff]}</em><i>${i < r ? '✔' : ''}</i></div>`).join('');
  if (T) h += '<div class="lbl">STANDINGS</div>' + Object.entries(T.pts).sort((a, b) => b[1] - a[1]).map(([n, p]) => `<div class="rr${n === 'YOU' ? ' me' : ''}"><span>${n}</span><i>${p} pts</i></div>`).join('');
  $('tourList').innerHTML = h;
  $('tourGo').textContent = T ? `CONTINUE · ROUND ${r + 1}` : 'START TOURNAMENT';
  $('tourReset').style.display = T ? '' : 'none';
}
function paintPlayer(c) {
  if (curColor === c) { document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', +b.dataset.c === c)); return; }
  curColor = c; store.set('sr.color', c);
  rebuildCar(economy.selected()); /* cached paint → instant swap, no geometry recolour stall */
  document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', +b.dataset.c === c));
}
function applyCtrl(user) {
  setControl(opt.ctrl, ok => {
    if (!ok) { opt.ctrl = 'stick'; store.set('sr.opt', opt); syncSegs(); setControl('stick'); if (user) toast('TILT NOT AVAILABLE ON THIS DEVICE \u00b7 USING JOYSTICK', '#ffd166'); }
    else if (user && opt.ctrl === 'tilt') toast('PHONE TILT ON \u00b7 LEAN LEFT / RIGHT TO STEER', '#8df');
  }, !!user);
}
function applyQuality() {
  pr = Math.min(devicePixelRatio, { high: 2, med: 1.5, low: 1 }[opt.q] || 2);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  /* LOW now really means LOW: no bloom, no shadow pass — half the GPU work on cheap phones */
  const low = opt.q === 'low';
  if (bloomPass) bloomPass.enabled = !low;
  if (gradePass) { gradePass.enabled = !low; gradePass.uniforms.uSharp.value = opt.q === 'high' ? 0.85 : 0.65; }
  if (fxaaPass) fxaaPass.enabled = mobile && !low; /* low = skip both: that mode is for weak phones */
  if (renderer.shadowMap.enabled === low) {
    renderer.shadowMap.enabled = !low; sun.castShadow = !low;
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
  }
}
function act(a) {
  if (a === 'advGo') startRace({ mode: 'adv', type: 'adv', laps: 1, diff: 1, ai: 0, env: opt.advEnv || 'day', title: 'ADVENTURE' });
  else if (a === 'advJoin') {
    const n = adv.S.near; if (!n) return;
    adv.saveReturn(n.x, n.z, P.h);
    adv.raceStart();
    startRace({ mode: 'quick', type: 'race', laps: n.laps, diff: n.diff, ai: 5, env: adv.S.env, track: n.track, fromAdv: true, cashMult: n.mult, title: `${n.name} · ${(TRACKS[n.track] || TRACKS.city).name}` });
  }
  else if (a === 'advBack') {
    /* straight back to free-roam — and if this adventure is a multiplayer room, stay in it */
    const mpAdv = net.active && net.room && net.room.mode === 'adv';
    startRace({ mode: mpAdv ? 'mp' : 'adv', type: 'adv', laps: 1, diff: 1, ai: 0, env: adv.S.env, resume: true, title: 'BACK TO ADVENTURE' });
  }
  else if (a === 'advExit') { adv.leave(); if (cfg.mode === 'mp' && net.active) net.leave(); toMenu(); }
  else if (a === 'quick') startRace({ mode: 'quick', laps: opt.laps, diff: opt.diff, ai: 5, env: opt.env, track: opt.track, title: TRACKS[opt.track] && opt.track !== 'city' ? TRACKS[opt.track].name : '' });
  else if (a === 'tt') startRace({ mode: 'tt', laps: opt.laps, diff: 1, ai: 0, env: opt.env, track: opt.track, title: TRACKS[opt.track] && opt.track !== 'city' ? TRACKS[opt.track].name : '' });
  else if (a === 'arena') startRace({ mode: 'arena', type: 'arena', laps: 1, diff: opt.diff, ai: 0, env: opt.env, dur: opt.dur, title: 'DRIFT ARENA' });
  else if (a === 'tourGo' || a === 'next') {
    if (!T) { T = { round: 0, pts: {} }; store.set('sr.t', T); }
    const c = CUPS[T.round]; startRace({ mode: 'tour', type: c.type, laps: c.laps || 1, diff: c.diff, ai: c.type === 'arena' ? 0 : 5, env: c.env, dur: c.dur, track: c.track || 'city', title: `ROUND ${T.round + 1}: ${c.name}` });
  }
  else if (a === 'ntGo' || a === 'ntNext') {
    if (!nightUnlocked()) { toast('LOCKED · OWN TESLA SPARK OR $150,000', '#ff7b7b'); sfxThud(); return; }
    if (!NT) { NT = { round: 0, pts: {} }; store.set('sr.nt', NT); }
    const c = NCUPS[NT.round]; startRace({ mode: 'tour', chapter: 'night', type: c.type, laps: c.laps || 1, diff: c.diff, ai: c.type === 'arena' ? 0 : 5, env: c.env, dur: c.dur, title: `ROUND ${NT.round + 1}: ${c.name}` });
  }
  else if (a === 'ntReset') { NT = null; store.set('sr.nt', null); renderNight(); }
  else if (a === 'nightTile') { if (!nightUnlocked()) { toast('LOCKED · OWN TESLA SPARK OR $150,000', '#ff7b7b'); sfxThud(); } }
  else if (a === 'mpCreate') { if (mpReady()) net.create(); else mpBlocked(); }
  else if (a === 'mpJoinOpen') { if (!mpReady()) { mpBlocked(); return; } mpStep = 'join'; const ci = $('mpCodeIn'); if (ci) ci.value = ''; const ec = $('mpCodeEcho'); if (ec) ec.textContent = '\u00a0'; renderMp(); if (ci) setTimeout(() => ci.focus(), 80); }
  else if (a === 'mpJoinBack') { mpStep = 'home'; renderMp(); }
  else if (a === 'mpJoin') { net.join($('mpCodeIn').value); }
  else if (a === 'mpStart') { net.start('race'); }
  else if (a === 'mpStartAdv') { net.start('adv'); }
  else if (a === 'mpLapsDown' || a === 'mpLapsUp') { if (net.isHost) net.setLaps(((net.room && net.room.laps) || 3) + (a === 'mpLapsUp' ? 1 : -1)); }
  else if (a === 'mpLeave') { mpStep = 'home'; net.leave(); }
  else if (a === 'mpCopy') {
    const t = $('mpCode') && $('mpCode').textContent;
    if (t && navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('CODE COPIED · SEND IT!', '#8df')).catch(() => { });
  }
  else if (a === 'mpShare') { /* WhatsApp: deep link joins the friend straight into the room */
    const code = net.code; if (!code) return;
    const url = location.origin + location.pathname + '?room=' + code;
    const txt = 'Join my KAY SUPER RACING race! Room code: ' + code + ' - tap the link and you are in: ' + url;
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  }
  else if (a === 'tourReset') { T = null; store.set('sr.t', null); renderTour(); }
  else if (a === 'daily') claimDaily();
  else if (a === 'refreshBoard') renderBoard();
  else if (a === 'rival') raceRival();
  else if (a === 'signin') { import('./boot.js').then(m => m.openGate()).catch(() => toast('COULD NOT OPEN SIGN-IN', '#ff6b6b')); }
  else if (a === 'cloudRetry') { toast('RECONNECTING\u2026', '#8df'); cloud.init().then(() => { updateCloudUI(); cloudSyncIn(); tryDeepJoin(); }); }
  else if (a === 'signout') { cloud.signOutAuth().then(() => location.reload()); }
  else if (a === 'resume') resume();
  else if (a === 'glreload') { store.set('sr.glfix', 1); location.reload(); }
  else if (a === 'retry') retry();
  else if (a === 'menu') toMenu();
}
document.addEventListener('click', e => {
  kbIdx = -1; document.querySelectorAll('.kfocus').forEach(b => b.classList.remove('kfocus'));
  const gt = e.target.closest('.gTab'); /* garage tabs */
  if (gt) { document.querySelectorAll('.gTab').forEach(b => b.classList.toggle('on', b === gt)); document.querySelectorAll('.gSec').forEach(x => x.classList.toggle('on', x.dataset.gt === gt.dataset.gt)); sfxPad(); renderGarage(); return; }
  const tt = e.target.closest('[data-tat]'); /* tattoo card: buy once, fit per car */
  if (tt && tt.dataset.tat) { tatClick(tt.dataset.tat); return; }
  const ga = e.target.closest('[data-garr]'); /* garage arrows: browse cars, preview in the showroom */
  if (ga) { gIdx = (gIdx + (+ga.dataset.garr) + CARS.length) % CARS.length; rebuildCar(CARS[gIdx].id); sfxPad(); renderGarage(); return; }
  const dv = e.target.closest('[data-drv]'); /* driver card: equip owned / buy locked (must run before other handlers) */
  if (dv && dv.dataset.drv) { driverClick(dv.dataset.drv); return; }
  const up = e.target.closest('.upBtn'); /* upgrade chip: buy the next level (must run before carCard pick) */
  if (up && up.dataset.up) {
    const [cid, k] = up.dataset.up.split(':');
    const lv = economy.upLevel(cid, k);
    if (lv < 5) {
      const cost = economy.upCost(k, lv), lab = { en: 'ENGINE', ty: 'TYRES', ni: 'NITRO', fl: 'FLIGHT' }[k];
      if (economy.buyUp(cid, k)) { sfxMission(); confetti(12); toast(`${lab} Lv ${lv + 1} INSTALLED${economy.selected() === cid ? ' \u00b7 FEEL THE DIFFERENCE' : ''}`, '#7dff8a'); if (economy.selected() === cid) rebuildCar(cid); }
      else { toast(`NEED $${(cost - economy.money).toLocaleString()} MORE`, '#ff7b7b'); beep(220, 0.2, 'square', 0.1); }
    }
    renderGarage(); return;
  }
  const card = e.target.closest('[data-car]'); if (card && card.dataset.car) { garageClick(card.dataset.car); return; }
  const mn = e.target.closest('[data-mdnav]');
  if (mn) { const rail = $('mdRail'); if (rail && rail.children[0]) rail.scrollBy({ left: (+mn.dataset.mdnav) * (rail.children[0].offsetWidth + 12), behavior: 'smooth' }); sfxPad(); return; }
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('hmRace')) { store.set('ksr.tipDone', 1); const tp = $('hmTip'); if (tp) tp.style.display = 'none'; }
  if (b.dataset.go) { showScreen(b.dataset.go); if (b.dataset.gt) { const tb = document.querySelector('.gTab[data-gt="' + b.dataset.gt + '"]'); if (tb) tb.click(); } }
  else if (b.dataset.act) act(b.dataset.act);
  else if (b.dataset.c) paintPlayer(+b.dataset.c);
  else if (b.dataset.v !== undefined && b.parentElement.classList.contains('seg')) {
    const k = b.parentElement.dataset.k; opt[k] = (k === 'laps' || k === 'diff' || k === 'dur') ? +b.dataset.v : b.dataset.v; store.set('sr.opt', opt); syncSegs();
    if (k === 'env') setEnv(opt.env); if (k === 'advEnv') { } if (k === 'laps') renderBest(); if (k === 'dur') renderArBest(); if (k === 'q') applyQuality(); if (k === 'snd') muted = opt.snd === 'off'; if (k === 'board') renderBoard(); if (k === 'ctrl') applyCtrl(true);
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
      if (!FL.on) flyWant = 0.8; /* remember the tap, so it still works a moment later */
      else if (!FL.land) { FL.land = true; toast('LANDING', '#8df'); }
    }
    if (!FL.on && flyWant > 0) {
      flyWant -= dt;
      if (P.fuel < 1) { if (flyWant <= 0) toast('FLIGHT TANK EMPTY', '#ff8a6b'); }
      else if (fwd > 8) { flyWant = 0; FL.on = true; FL.alt = 0.8; FL.tgt = 20; FL.land = false; P.vel.addScaledVector(f, 6); sfxWhoosh(); toast('FLIGHT MODE \u2708', '#8df'); }
      else if (flyWant <= 0) toast('GO FASTER TO TAKE OFF', '#ff8a6b');
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
    P.fuel = Math.max(0, P.fuel - (cfg.env === 'nightRain' ? 1.3 : 1) * dt); /* thrusters burn the flight tank (not nitro) */
    if (P.fuel <= 0 && !FL.land) { FL.land = true; toast('TANK EMPTY \u00b7 LANDING', '#ff8a6b'); }
    FL.time += dt;
    if (FL.land && FL.alt <= 0.35) { FL.on = false; FL.land = false; FL.alt = 0; document.body.classList.remove('flying'); sfxThud(); shake = Math.max(shake, 0.18); puff(car.localToWorld(V3(0, 0.3, -1)), P.vel, 1.6); }
  }
  const gas = k.up || FL.on;
  const busted = cfg.type === 'adv' && adv.S.slow > 0; /* just got busted: top speed cut, no nitro */
  const boosting = can && k.boost && P.nitro > 0.02 && gas && !busted;
  /* fire the held power-up: gamepad LB/RB edge or touch FIRE button (keyboard uses the keydown handler) */
  if ((gp.item && !padItemPrev) || touch.item === 1) usePowerup();
  padItemPrev = !!gp.item; touch.item = 0;
  const NIV = CS.ni || 0; /* nitro upgrade level: stronger boost, slower burn, faster refill */
  if (can) {
    const air = FL.on, slowK = busted ? 0.55 : 1;
    const max = (boosting ? CS.top * (1.22 + 0.02 * NIV) : CS.top) * (air ? 1.1 : 1) * slowK, a0 = (boosting ? CS.accel * 1.6 : CS.accel) * (air ? 0.85 : 1) * slowK;
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
  if (!FL.on && CS.fly && can) P.fuel = Math.min(flyCap(), P.fuel + 0.35 * dt); /* tank slowly refills on the ground */
  if (FL.on) { /* flight burns the tank, not nitro */ }
  else if (boosting) P.nitro = Math.max(0, P.nitro - 0.26 * (1 - 0.06 * NIV) * (drv().niBurn || 1) * dt); else P.nitro = Math.min(1, P.nitro + (0.025 + (k.drift && sp > 30 ? 0.09 : 0)) * (1 + 0.10 * NIV) * (drv().niRef || 1) * dt);
  if (cfg.type !== 'arena' && cfg.type !== 'adv') {
    const drifting = can && !FL.on && Math.abs(slip) > 4.5 && sp > 18;
    if (drifting) { RD.hold = 1.1; RD.comboT += dt; } else { RD.hold -= dt; if (RD.hold <= 0) RD.comboT = 0; }
    RD.mult = 1 + Math.min(4, Math.floor(RD.comboT / 1.8)); RD.maxMult = Math.max(RD.maxMult, RD.mult);
    if (drifting) RD.pts += Math.abs(slip) * sp * 0.5 * RD.mult * (drv().drift || 1) * dt;
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
  } else if (cfg.type === 'adv') {
    /* free-roam city: clamp to the world edge, collide with buildings (fly over the low ones) */
    P.pos.x = clamp(P.pos.x, -adv.E, adv.E); P.pos.z = clamp(P.pos.z, -adv.E, adv.E);
    const hit = adv.collide(P.pos, 1.9, FL.alt + P.jy);
    if (hit.hit) {
      const vo = P.vel.x * hit.nx + P.vel.z * hit.nz;
      if (vo < 0) {
        P.vel.x -= hit.nx * vo * 1.45; P.vel.z -= hit.nz * vo * 1.45;
        P.vel.multiplyScalar(1 - clamp(-vo * 0.014, 0.02, 0.35));
        shake = Math.max(shake, clamp(-vo / 18, 0.12, 0.95));
        if (-vo > 9) { puff(car.localToWorld(V3(0, 0.6, 1.8)), P.vel, 1.2); if (-vo > 16) { adv.crash(-vo); sfxThud(); } }
      }
    }
    y = 0; pitch = 0;
  } else {
  /* ---- SECRET SHORTCUT: hug the glowing pads to enter, ride the deck, launch off the ramp ---- */
  scCdT = Math.max(0, scCdT - dt);
  if (window.__SCDBG) { const g = window.__SCDBG; g.checks++; g.fwd = fwd.toFixed(1); g.stateOk = state === 'race'; g.can = can; g.d2 = ((P.pos.x - (SC ? SC.ex : 0)) ** 2 + (P.pos.z - (SC ? SC.ez : 0)) ** 2).toFixed(1); g.alt = FL.alt.toFixed(2); g.jy = P.jy.toFixed(2); g.flags = [!!SC, !P.scOn, can, !FL.on, P.jy <= 0, state === 'race', scCdT, fwd > 10, FL.alt < 1].map(v => typeof v === 'number' ? v.toFixed(2) : v ? 1 : 0).join(','); if (g.rec) { g.hist = g.hist || []; if (g.hist.length < 14) g.hist.push([g.checks, fwd.toFixed(1), g.d2, g.flags]); } }
  if (SC && !P.scOn && can && !FL.on && P.jy <= 0 && state === 'race' && scCdT <= 0 && fwd > 10 && FL.alt < 1) {
    const dx = P.pos.x - SC.ex, dz = P.pos.z - SC.ez;
    if (dx * dx + dz * dz < 52) { P.scOn = true; P.scI = 0; toast('SHORTCUT!', '#ffb347'); beep(720, 0.08, 'square', 0.08); setTimeout(() => beep(980, 0.1, 'square', 0.08), 70); }
  }
  if (SC && P.scOn) {
    if (FL.on && FL.alt > 3) { P.scOn = false; P.idx = SC.bi; scCdT = 2; } /* took off mid-deck: back to the circuit */
    else {
      if (P.jy > 0) P.scI += fwd * dt / SC.dsc; /* airborne: dead-reckon along the deck */
      else {
        let bi2 = P.scI, bd2 = 1e18;
        const from = Math.max(0, Math.floor(P.scI) - 4), to = Math.min(SC.M - 1, Math.floor(P.scI) + (fwd > 0 ? 8 : 4));
        for (let o = from; o <= to; o++) { const dx = P.pos.x - SC.p2[o].x, dz = P.pos.z - SC.p2[o].z, dd = dx * dx + dz * dz; if (dd < bd2) { bd2 = dd; bi2 = o; } }
        P.scI = bi2;
      }
      P.scI = clamp(P.scI, 0, SC.M - 1);
      if (P.scI <= 1 && fwd < -2) { P.scOn = false; P.idx = SC.ai; scCdT = 2; } /* reversed back out */
      else {
        const si = Math.min(SC.M - 1, Math.floor(P.scI)), r = SC.r2[si], t = SC.t2[si];
        const rx = P.pos.x - SC.p2[si].x, rz = P.pos.z - SC.p2[si].z;
        const lat = rx * r.x + rz * r.z, lim = SC.hw;
        if (P.jy <= 0) {
          if (Math.abs(lat) > lim) {
            const sg2 = Math.sign(lat);
            P.pos.x -= r.x * sg2 * (Math.abs(lat) - lim); P.pos.z -= r.z * sg2 * (Math.abs(lat) - lim);
            const vo = (P.vel.x * r.x + P.vel.z * r.z) * sg2;
            if (vo > 0) { P.vel.x -= r.x * sg2 * vo * 1.25; P.vel.z -= r.z * sg2 * vo * 1.25; P.vel.multiplyScalar(1 - clamp(vo * 0.012, 0.01, 0.3)); shake = Math.max(shake, clamp(vo / 20, 0.1, 0.8)); }
          }
          if (can && SC.ji > 0 && P.scI >= SC.ji && P.scI < SC.ji + 3 && fwd > 34) { P.jv = clamp(fwd * 0.24, 11, 31); P.jy = 0.01; toast('SHORTCUT AIR!', '#ffb347'); sfxWhoosh(); }
        }
        const s2 = Math.min(SC.M - 1, si + 1), f2 = clamp(P.scI - si, 0, 1);
        y = SC.p2[si].y + (SC.p2[s2].y - SC.p2[si].y) * f2; pitch = -Math.atan2(t.y, Math.hypot(t.x, t.z));
        P.idx = Math.round(SC.ai + (SC.bi - SC.ai) * (P.scI / (SC.M - 1)));
        P.prog = P.crosses * N + SC.ai + (SC.bi - SC.ai) * (P.scI / (SC.M - 1));
        P.lat = lat;
        if (P.scI >= SC.M - 3 && P.jy <= 0) { P.scOn = false; P.idx = SC.bi; scCdT = 2; }
      }
    }
  } else {
  let best = P.idx, bd = 1e18;
  for (let o = -14; o <= 14; o++) { const j = (P.idx + o + N) % N, dx = P.pos.x - pts[j].x, dz = P.pos.z - pts[j].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = j; } }
  if (P.idx > N * 0.75 && best < N * 0.25) P.crosses++; else if (P.idx < N * 0.25 && best > N * 0.75) P.crosses--;
  /* ramp launch: crossing a jump marker at speed throws the car into the air */
  const jmp = (TRACKS[curTrack] || {}).jumps;
  if (jmp && can && !FL.on && P.jy <= 0) for (const J of jmp) if (P.idx < J && best >= J && best - P.idx < 12 && fwd > 38) { P.jv = clamp(fwd * 0.22, 9, 30); P.jy = 0.01; toast('AIR TIME!', '#ffb347'); sfxWhoosh(); }
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
  P.lat = d;
  const nx = (best + 1) % N, fr = clamp((rx * t.x + rz * t.z) / ds, 0, 1);
  y = pts[best].y + (pts[nx].y - pts[best].y) * fr; pitch = -Math.atan2(t.y, Math.hypot(t.x, t.z));
  }
  /* boost pads work everywhere: the circuit AND the shortcut decks */
  if (can && !FL.on && state === 'race') for (const pd of allPads()) {
    const u = pd.userData; if (u.cd > 0) continue;
    const dx = P.pos.x - pd.position.x, dz = P.pos.z - pd.position.z;
    if (dx * dx + dz * dz < 12.5) { u.cd = 1.2; u.flash = 1; RD.pads++; P.nitro = Math.min(1, P.nitro + (u.hot ? 0.55 : cfg.env === 'nightRain' ? 0.45 : 0.3)); P.vel.addScaledVector(f, u.hot ? 13 : cfg.env === 'nightRain' ? 8.5 : 6); sfxPad(); }
  }
  }

  /* mesh */
  if (P.jy > 0) { P.jy += P.jv * dt; P.jv -= 30 * dt; if (P.jy <= 0) { P.jy = 0; P.jv = 0; shake = Math.max(shake, 0.7); sfxThud(); puff(car.localToWorld(V3(0, 0.3, -1)), P.vel, 2.2); toast('LANDED', '#8df'); } }
  car.position.set(P.pos.x, y + 0.04 + FL.alt + P.jy, P.pos.z);
  car.rotation.y = P.h;
  car.rotation.x = pitch - (P.jy > 0 ? clamp(P.jv * 0.011, -0.3, 0.3) : 0) + (FL.on ? clamp((FL.tgt - FL.alt) * 0.014, -0.12, 0.16) - 0.05 : 0);
  car.rotation.z = clamp(-slip * 0.012, -0.12, 0.12) + (FL.on ? -clamp((k.left ? 1 : 0) - (k.right ? 1 : 0) || gp.steer, -1, 1) * 0.14 : 0);
  car.flames.forEach(fl => { fl.visible = boosting || FL.on; if (boosting) { fl.scale.set(1, 0.9 + Math.random() * 0.7, 1); fl.material.opacity = 0.6 + Math.random() * 0.35; } else if (FL.on) { fl.scale.set(0.7, 0.7 + Math.random() * 0.5, 0.7); fl.material.opacity = 0.35 + Math.random() * 0.25; } });
  car.updateMatrixWorld();
  if (!FL.on) {
    if ((Math.abs(slip) > 5 && sp > 22) || (boosting && Math.random() < 0.5)) for (const sx of [-1, 1]) if (Math.random() < 0.8) puff(car.localToWorld(V3(sx * 1.05, 0.3, -1.6)), P.vel, boosting ? 0.8 : 1.2);
    if (Math.abs(slip) > 5 && sp > 22) [-1, 1].forEach((sx, i) => addSkid(car.localToWorld(V3(sx * 1.05, 0.3, -1.6)), i, car.position.y));
  }
  return { boosting, sp: P.vel.length(), slip };
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
      const gap = P.prog - a.prog;
      const rb = a.hard ? clamp(gap / 150 * 0.08, -0.05, 0.12) : clamp(gap / 150 * 0.06, -0.06, 0.1);
      let boostK = 1;
      if (a.boostT > 0) { a.boostT -= dt; boostK = 1.09; } /* nitro box / burst */
      else if (a.hard) { a.boostCd -= dt; if (a.boostCd <= 0) { a.boostT = rand(1.0, 1.8); a.boostCd = rand(8, 13); } }
      /* traffic ahead: harder AIs swerve earlier, easy ones often hit it */
      if (TRAF.length && cfg.type !== 'arena') {
        const look = [8, 13, 19][cfg.diff] || 12;
        for (const t of TRAF) {
          let d = (t.s - a.s + N) % N; if (d > N / 2) d -= N; d *= ds;
          if (d > 0 && d < look && Math.abs(t.lat - a.lat) < 3.4) { a.latT = clamp(a.lat + (t.lat <= a.lat ? 1 : -1) * 4.5, -7.5, 7.5); a.timer = 1.1; break; }
        }
      }
      const tgt = a.base * (1 - clamp(curv[i0] * (a.hard ? 1.05 : 1.6), 0, a.hard ? 0.24 : 0.36)) * (1 + rb) * boostK;
      a.speed += (tgt - a.speed) * Math.min(1, dt * (a.hard ? 2.2 : 1.2));
      aiShoot(a, dt);
      if (a.spinT > 0) { a.speed *= Math.exp(-2.2 * dt); a.lat += Math.sin(a.spinT * 16) * dt * 6; }
      a.s += a.speed * dt / ds;
      a.timer -= dt; if (a.timer <= 0) { a.timer = rand(2.5, 6); a.latT = rand(-7.5, 7.5); }
      a.lat += (a.latT - a.lat) * Math.min(1, dt * 0.7);
    }
    a.prog = a.s + N;
    const g = sample(a.s, a.lat), m = a.mesh;
    m.position.copy(g.p).y += 0.04; m.rotation.y = Math.atan2(g.t.x, g.t.z) + (a.spinT > 0 ? a.spinT * 9 : 0); m.rotation.x = -Math.atan2(g.t.y, Math.hypot(g.t.x, g.t.z));
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
        a.speed = clamp(ab.vx * g.t.x + ab.vz * g.t.z, 25, a.hard ? 150 : 95); a.lat += clamp((ab.vx * g.r.x + ab.vz * g.r.z) * 0.06, -2, 2);
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
  if (cfg.type === 'adv') advUI(dt);
  const all = [{ p: P.prog, me: true }, ...AIs.map(a => ({ p: a.prog }))].sort((a, b) => b.p - a.p);
  const rank = all.findIndex(o => o.me) + 1;
  if (state === 'race' && !P.finished && cfg.type !== 'arena' && cfg.type !== 'adv' && cfg.mode !== 'mp') {
    ovCool -= dt;
    if (rank < lastRank && ovCool <= 0) { toast(`OVERTAKE  +${lastRank - rank}`); P.nitro = Math.min(1, P.nitro + 0.12); ovCool = 0.9; }
    lastRank = rank; P.rank = rank;
  }
  if (cfg.mode === 'mp' && cfg.type !== 'adv') mpHud(dt);
  else $('mpBoard').style.display = 'none';
  if (cfg.mode === 'mp' && cfg.type === 'adv') $('pos').innerHTML = 'FR'; /* free roam: no positions */
  else if (cfg.mode !== 'mp') $('pos').innerHTML = cfg.ai ? `${P.rank}<small>/${cfg.ai + 1}</small>` : 'TT';
  $('lap').textContent = cfg.type === 'adv' ? 'FREE ROAM' : `LAP ${clamp(P.crosses, 1, TOTAL)}/${TOTAL}`;
  $('time').textContent = fmt(raceT);
  const kph = Math.round(sp * 3.6); $('spd').textContent = kph;
  $('ring').style.strokeDashoffset = 389.6 * (1 - clamp(kph / (CS.top * 3.6 + 48), 0, 1));
  $('ring').style.stroke = boosting ? '#7ff' : '#3cf';
  $('nit').textContent = `NITRO ${Math.round(P.nitro * 100)}%`;
  const fh = $('fuelHud');
  if (fh) {
    const on = !!CS.fly && cfg.type !== 'arena' && (state === 'race' || state === 'count');
    fh.style.display = on ? 'flex' : 'none';
    if (on) { const cap = flyCap(), f = clamp(P.fuel / cap, 0, 1); $('fuelBar').firstElementChild.style.width = (f * 100) + '%'; $('fuelT').textContent = Math.ceil(P.fuel) + 's'; fh.classList.toggle('low', P.fuel < 3); }
  }
  const dOn = RD.comboT > 0 && RD.pts > 50 && cfg.type !== 'arena';
  $('driftHud').style.opacity = dOn ? 1 : 0;
  if (dOn) { $('driftPts').textContent = `DRIFT ${Math.floor(RD.pts).toLocaleString()}`; $('driftMult').textContent = `x${RD.mult}`; }
  document.body.classList.toggle('flying', FL.on);
  if (FL.on) $('altbar').style.height = `${clamp(FL.alt / 42, 0, 1) * 100}%`;
  $('fx').style.opacity = clamp((kph - 200) / 140, 0, 1) * (boosting ? 1 : 0.55);
  /* coins + power-up HUD (single-player races) */
  const ch = $('coinHud');
  if (ch) { const on = itemsOn() && cfg.mode !== 'menu' && (raceCoins + raceGems) > 0; ch.style.display = on ? 'flex' : 'none'; if (on) { $('coinN').textContent = 'COINS ' + raceCoins; $('gemN').textContent = 'GEMS ' + raceGems; } }
  const ph = $('puHud');
  if (ph) { const on = itemsOn() && !!PU.item && state === 'race'; ph.style.display = on ? 'block' : 'none'; if (on) ph.textContent = PU_NAMES[PU.item] + (mobile ? '' : ' \u00b7 PRESS E'); }
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').style.opacity = 0;
  if (cfg.type === 'adv') adv.drawMini(mc, mm.width, mm.height, P.pos, P.h);
  else {
    mc.clearRect(0, 0, mm.width, mm.height); mc.drawImage(mmBase, 0, 0);
    AIs.forEach(a => { const [x, y] = mxy(a.mesh.position.x, a.mesh.position.z); mc.fillStyle = a.css; mc.beginPath(); mc.arc(x, y, 8, 0, 7); mc.fill(); mc.strokeStyle = '#000'; mc.lineWidth = 2; mc.stroke(); });
    if (cfg.mode === 'mp') for (const o of net.remotes()) { const [rx, ry] = mxy(o.x, o.z); mc.fillStyle = o.uid === mpLeadId ? '#ffe14a' : '#ff7a1a'; mc.beginPath(); mc.arc(rx, ry, 8, 0, 7); mc.fill(); mc.strokeStyle = '#000'; mc.lineWidth = 2; mc.stroke(); }
  }
  if (cfg.type !== 'adv') { const [px, py] = mxy(P.pos.x, P.pos.z); mc.fillStyle = '#fff'; mc.beginPath(); mc.arc(px, py, 10, 0, 7); mc.fill(); mc.strokeStyle = '#3cf'; mc.lineWidth = 4; mc.stroke(); }
  if (ghostCar && ghostCar.active && ghostCar.group.visible) { const [gx, gy] = mxy(ghostCar.group.position.x, ghostCar.group.position.z); mc.strokeStyle = '#8df'; mc.lineWidth = 3; mc.beginPath(); mc.arc(gx, gy, 8, 0, 7); mc.stroke(); }
}

/* ---------- ADVENTURE HUD: heat, wanted stars, timers, race prompt, nav arrow ---------- */
const fmt0 = t => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
function advUI(dt) {
  const S = adv.S, hb = $('heatBar');
  if (hb) hb.firstElementChild.style.width = Math.round(S.heat) + '%';
  const stars = $('advStars');
  if (stars) [...stars.children].forEach((el, i) => el.classList.toggle('on', i < S.police));
  /* POWER: cops & rivals grind it down; at zero you are wrecked */
  const pw = $('powBar'), ah = $('advHud');
  if (pw) { pw.firstElementChild.style.width = Math.round(S.pow) + '%'; pw.classList.toggle('low', S.pow < 30); }
  if (ah) ah.classList.toggle('hurt', S.hitFlash > 0.45);
  const pp = $('powPct'); if (pp) pp.textContent = Math.round(S.pow) + '%';
  const fr = $('advFree'); if (fr) fr.textContent = 'FREE ' + fmt0(S.freeT);
  const nx = $('advNext'); if (nx) nx.textContent = S.near ? 'RACE MARKER AHEAD — E / TAP JOIN' : 'NEXT RACE ' + fmt0(S.nextIn);
  const bw = $('bustWrap');
  if (bw) {
    if (S.bust > 0.05) { bw.style.display = 'block'; if ($('bustBar')) $('bustBar').firstElementChild.style.width = Math.round(clamp(S.bust / 2.6, 0, 1) * 100) + '%'; }
    else bw.style.display = 'none';
  }
  const pr = $('advPrompt');
  if (pr) {
    if (S.near && state === 'race' && !P.finished) {
      pr.style.display = 'flex';
      const t = S.near, T = $('apTitle');
      if (T) { T.textContent = t.name; T.style.color = t.css; T.style.borderColor = t.css; }
      const sb = $('apSub'); if (sb) sb.textContent = t.sub;
      const rw = $('apRew'); if (rw) rw.textContent = 'WIN BONUS ×' + t.mult.toFixed(1) + ' CASH';
    } else pr.style.display = 'none';
  }
  const nv = $('advNav');
  if (nv) {
    if (S.navD > 4 && !S.near && state === 'race') {
      nv.style.display = 'flex';
      const ds2 = $('advDist'); if (ds2) ds2.textContent = Math.round(S.navD) + 'm';
      const ar = $('advArr'); if (ar) ar.style.transform = `rotate(${S.navA}rad)`;
    } else nv.style.display = 'none';
  }
}

/* multiplayer: live "who is 1st" board + rank + lead-change toast */
let mpBoardT = 0, mpLeader = null, mpLeadName = '';
function mpHud(dt) {
  const board = $('mpBoard'), live = state === 'race' || state === 'finished';
  board.style.display = live ? 'block' : 'none';
  if (!live) { mpLeader = null; return; }
  mpBoardT -= dt; if (mpBoardT > 0) return; mpBoardT = 0.25;
  const rows = net.standings({ prog: P.prog, fin: P.finished, tms: Math.round(raceT * 1000) });
  const me = rows.findIndex(r => r.me) + 1;
  P.rank = me; $('pos').innerHTML = `${me}<small>/${rows.length}</small>`;
  const lead = rows[0];
  if (lead && mpLeader !== lead.uid) {
    if (mpLeader !== null && !lead.fin) toast(lead.me ? '\u{1F451} YOU TAKE THE LEAD!' : `\u{1F451} ${lead.name} TAKES THE LEAD`, lead.me ? '#7dff8a' : '#ffd166');
    mpLeader = lead.uid;
  }
  mpLeadId = lead ? lead.uid : null;
  board.innerHTML = rows.slice(0, 5).map((r, i) => `<div class="mb${r.me ? ' me' : ''}${i === 0 ? ' first' : ''}"><b>${i === 0 ? '\u{1F451}' : i + 1}</b><span>${esc(r.name)}</span>${r.fin ? '<i>\u2714</i>' : ''}</div>`).join('') + (me > 5 ? `<div class="mb me"><b>${me}</b><span>YOU</span></div>` : '');
}
let mpLeadId = null;
/* ADVENTURE MULTIPLAYER: ram rivals until their POWER runs down. Each client damages
   itself from the closing speed it sees — symmetrical, no referee needed. */
const pvpCd = {};
function stepPvP(dt) {
  if (cfg.type !== 'adv' || cfg.mode !== 'mp' || state !== 'race' || P.finished) return;
  for (const o of net.remotes()) {
    pvpCd[o.uid] = (pvpCd[o.uid] || 0) - dt;
    const dx = P.pos.x - o.x, dz = P.pos.z - o.z, d = Math.hypot(dx, dz);
    if (d > 6.5 || d < 0.01) continue;
    const nx = dx / d, nz = dz / d;
    P.pos.x += nx * (5.5 - d); P.pos.z += nz * (5.5 - d);
    const closing = -((P.vel.x - (o.vx || 0)) * nx + (P.vel.z - (o.vz || 0)) * nz); /* >0: we hit them */
    if (closing > 4 && pvpCd[o.uid] <= 0) {
      pvpCd[o.uid] = 0.55;
      P.vel.x -= nx * closing * 0.85; P.vel.z -= nz * closing * 0.85;
      shake = Math.max(shake, clamp(closing / 16, 0.2, 1)); sfxThud(); puff(P.pos, V3(0, 0.7, 0), 1.6);
      adv.hitPower(clamp(closing * 0.55, 3, 16), `RAMMED BY ${String(o.name || 'RIVAL').toUpperCase()}!`);
    }
  }
}
/* multiplayer race end: live standings from the room, fixed payout, no boards */
let mpRefT = 0;
function finishMp() {
  P.finished = true; setState('finished');
  net.onFinish(Math.round(raceT * 1000), P.prog);
  const rows = [{ name: 'YOU', me: true, uid: net.uid(), tms: Math.round(raceT * 1000), prog: P.prog, fin: true },
    ...net.players.filter(p => p.uid !== net.uid()).map(p => ({ name: p.name || 'RIVAL', uid: p.uid, tms: p.tms || 0, prog: p.prog || (p.state && p.state.prog) || 0, fin: !!p.fin }))]
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
const mpReady = () => !!(cloud.user && cloud.status === 'online');
/* WhatsApp / share deep link: ?room=ABCDE — auto-join once signed in and online */
let deepRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
function tryDeepJoin() {
  if (!deepRoom || !mpReady()) return;
  const code = deepRoom; deepRoom = '';
  try { history.replaceState(null, '', location.pathname); } catch (e) { } /* clean bar: refresh never rejoins */
  toast('JOINING ROOM ' + code + '\u2026', '#8df');
  net.join(code).then(ok => { if (ok) showScreen('multi'); });
}
function mpReason() {
  const st = cloud.status, err = String(cloud.lastErr || '');
  if (!cloud.user) return { t: 'OFFLINE MODE', s: 'SIGN IN OR CREATE A FREE ACCOUNT TO RACE FRIENDS ONLINE.', b: 'SIGN IN / CREATE ACCOUNT', a: 'signin', c: 'off' };
  if (st === 'connecting' || st === 'boot') return { t: 'CONNECTING\u2026', s: 'CONTACTING THE RACE SERVER.', b: '', a: '', c: 'wait' };
  if (st !== 'online') {
    const s = /permission|denied/i.test(err) ? 'THE SERVER REJECTED THIS ACCOUNT (FIRESTORE RULES). OWNER: PUBLISH firestore.rules IN FIREBASE.'
      : /unavailable|timeout|network|offline/i.test(err) ? 'CANNOT REACH THE SERVER. CHECK YOUR CONNECTION.'
      : 'CLOUD IS OFFLINE' + (err ? ' \u00b7 ' + err.slice(0, 40).toUpperCase() : '') + '.';
    return { t: 'CLOUD OFFLINE', s, b: 'RETRY CONNECTION', a: 'cloudRetry', c: 'off' };
  }
  return { t: 'ONLINE \u00b7 ' + driverName(), s: 'CREATE A ROOM AND SHARE THE CODE, OR JOIN A FRIEND.', b: '', a: '', c: 'on' };
}
function updateMpGate() {
  const g = $('mpGate'); if (!g) return; const r = mpReason();
  g.className = 'mpGate ' + r.c; $('mpGateT').textContent = r.t; $('mpGateS').textContent = r.s;
  const b = $('mpGateBtn'); b.style.display = r.b ? '' : 'none'; if (r.b) { b.textContent = r.b; b.dataset.act = r.a; }
  document.querySelectorAll('#mpHome [data-act="mpCreate"], #mpHome [data-act="mpJoinOpen"]').forEach(x => x.classList.toggle('locked', r.c !== 'on'));
}
function mpBlocked() {
  updateMpGate(); const g = $('mpGate');
  if (g) { g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); }
  toast('MULTIPLAYER NEEDS AN ONLINE ACCOUNT', '#ffd166');
}
function renderMp() {
  updateMpGate();
  const lobby = $('mpLobby'), home = $('mpHome'), join = $('mpJoin');
  if (!lobby || !home || !join) return;
  if (net.active && (state === 'race' || state === 'count')) return; /* mid-race: menu is hidden — skip DOM churn from live snapshots */
  if (net.active) mpStep = 'home';
  home.classList.toggle('hide', net.active || mpStep === 'join');
  join.classList.toggle('hide', net.active || mpStep !== 'join');
  lobby.classList.toggle('hide', !net.active);
  if (!net.active) return;
  const list = $('mpList'), code = $('mpCode'), stat = $('mpStat');
  if (code) code.textContent = net.code;
  const rs = net.players.length, host = net.isHost && net.room && net.room.status === 'lobby';
  if (list) list.innerHTML = net.players.map((p, i) => `<div class="rr${p.uid === net.uid() ? ' me' : ''}"><b>${i + 1}</b><span>${esc(p.name || 'RIVAL')}${p.uid === net.uid() ? ' · YOU' : ''}${net.room && p.uid === net.room.host ? ' \u{1F451}' : ''}</span><em>${p.fin ? 'FINISHED' : (net.room && net.room.status === 'racing' ? 'RACING' : 'READY')}</em></div>`).join('') || '<div class="lbl">WAITING FOR DRIVERS…</div>';
  if (stat) stat.textContent = !net.room ? 'CONNECTING…' : net.room.status === 'racing' ? 'RACE LIVE · FINISH THE LAPS!' : `${rs} DRIVER${rs === 1 ? '' : 'S'} IN LOBBY · ${net.room.laps || 3} LAPS · ${String(net.room.env || 'day').toUpperCase()}`;
  if ($('mpStart')) $('mpStart').style.display = host ? '' : 'none';
  if ($('mpStartAdv')) $('mpStartAdv').style.display = host ? '' : 'none';
  const laps = (net.room && net.room.laps) || 3, st = $('mpLapStep');
  if (st) {
    st.classList.toggle('ro', !host);
    $('mpLapN').textContent = laps;
    $('mpLapWho').textContent = host ? 'TAP + / \u2212 TO CHOOSE' : 'HOST CHOOSES THE LAPS';
    $('mpLapUnit').textContent = laps === 1 ? 'LAP' : 'LAPS';
  }
}

function finishRace() {
  if (cfg.mode === 'mp') { finishMp(); return; }
  $('fNext').dataset.act = 'next'; $('fNext').textContent = 'NEXT RACE'; /* restore defaults (Adventure overrides below) */
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
      cash = Math.round(base * (1 + (cfg.laps - 1) * 0.08) * [0.8, 1, 1.5][cfg.diff] * (cfg.mode === 'tour' ? 1.5 : 1));
      earnRows.push(['Race reward', cash]);
    } else {
      const key = `sr.best.${cfg.mode}.${cfg.laps}${tsx(cfg.track)}`, prev = store.get(key, null);
      if (prev === null || raceT < prev) { cash = 5000; earnRows.push(['New best time', 5000]); }
    }
  } else { cash = Math.round(sc / 2); earnRows.push(['Drift score bonus', cash]); }
  const db = arenaOn ? 0 : Math.round(RD.pts / 10);
  if (db > 0) { cash += db; earnRows.push(['Drift bonus', db]); }
  const cc = Math.round(raceCoins * 60 * (drv().cash || 1)), gc = Math.round(raceGems * 750 * (drv().cash || 1));
  if (cc) { cash += cc; earnRows.push(['Coins collected \u00d7' + raceCoins, cc]); }
  if (gc) { cash += gc; earnRows.push(['Gems collected \u00d7' + raceGems, gc]); }
  const fb = Math.round(FL.time * (cfg.env === 'nightRain' ? 180 : 100));
  if (fb > 0) { cash += fb; earnRows.push(['Flight time bonus' + (cfg.env === 'nightRain' ? ' ×1.8' : ''), fb]); }
  if (cfg.env === 'nightRain' && cash > 0) { const nb = Math.round(cash * 0.8); cash += nb; earnRows.push(['NIGHT CIRCUIT BONUS ×1.8', nb]); }
  if (cfg.cashMult) { const ab = Math.round(cash * (cfg.cashMult - 1)); if (ab > 0) { cash += ab; earnRows.push(['Adventure bonus ×' + cfg.cashMult.toFixed(1), ab]); } }
  economy.add(cash);
  let misDone = missionEvent('finish', 1);
  if (!arenaOn && place <= 3) misDone = misDone.concat(missionEvent('podium', 1));
  if (!arenaOn && place === 1 && cfg.ai) misDone = misDone.concat(missionEvent('win', 1));
  misDone = misDone.concat(missionEvent('drift', arenaOn ? sc : Math.floor(RD.pts)));
  misDone = misDone.concat(missionEvent('pads', RD.pads));
  misDone = misDone.concat(missionEvent('coins', raceCoins));
  misDone = misDone.concat(missionEvent('gems', raceGems));
  misDone = misDone.concat(missionEvent('fly', FL.time));
  misDone = misDone.concat(missionEvent('own', economy.ownedCount()));
  misDone = misDone.concat(missionEvent('earn', cash));
  if (cfg.fromAdv && !arenaOn && place === 1 && cfg.ai) misDone = misDone.concat(missionEvent('advwin', 1));
  if (cfg.env === 'nightRain') {
    misDone = misDone.concat(missionEvent('nightdrift', arenaOn ? sc : Math.floor(RD.pts)));
    misDone = misDone.concat(missionEvent('nightfly', FL.time));
    if (!arenaOn && place === 1 && cfg.ai) misDone = misDone.concat(missionEvent('nightwin', 1));
  }
  economy.saveStats();
  /* ghost save + global board submission (Firebase, silent if offline) */
  const fgl = $('fglobal'); if (fgl) fgl.textContent = '';
  if (!arenaOn && cfg.mode !== 'tour' && !cfg.ai) {
    const key = `sr.best.${cfg.mode}.${cfg.laps}${tsx(cfg.track)}`, prev = store.get(key, null), isBest = prev === null || raceT < prev;
    if (isBest) {
      const flat = GR.finish();
      if (flat) store.set(`sr.ghost.${cfg.mode}.${cfg.laps}${tsx(cfg.track)}`, flat);
      if (cloud.status === 'online' && flat && tsx(cfg.track) === '') {
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
      const key = `sr.best.${cfg.mode}.${cfg.laps}${tsx(cfg.track)}`, prev = store.get(key, null);
      if (prev === null || raceT < prev) { store.set(key, raceT); sub += '  ·  NEW BEST!'; } else sub += `  ·  Best ${fmt(prev)}`;
    }
  }
  $('fh').textContent = head; $('fp').textContent = sub; $('fres').innerHTML = list;
  $('fearn').innerHTML = earnRows.length ? '<div class="lbl">EARNINGS</div>' + earnRows.map(([n, v]) => `<div class="rr"><span>${n}</span><em style="color:#7dff8a">+$${v.toLocaleString()}</em></div>`).join('') + `<div class="rr me"><span>TOTAL CASH</span><em style="color:#7dff8a">$${economy.money.toLocaleString()}</em></div>` : '';
  $('fmis').innerHTML = misDone.length ? '<div class="lbl">MISSIONS COMPLETE</div>' + misDone.map(m => `<div class="rr me"><span>\u2b50 ${m.name}</span><em style="color:#e8b800">+$${m.reward.toLocaleString()}</em></div>`).join('') : '';
  if ((place === 1 && cfg.ai) || misDone.length) { confetti(place === 1 ? 110 : 45); if (place === 1 && cfg.ai) sfxMission(); else sfxCoin(); }
  $('fNext').style.display = next ? '' : 'none'; $('fRetry').style.display = cfg.mode === 'tour' ? 'none' : '';
  if (cfg.fromAdv) { /* straight back to the free-roam city */
    $('fNext').textContent = 'BACK TO ADVENTURE'; $('fNext').dataset.act = 'advBack'; $('fNext').style.display = '';
    $('fRetry').style.display = 'none';
  }
  setTimeout(() => { if (state === 'finished') show('finish', true); }, 1200);
}

/* ---------- economy UI: garage, missions, daily bonus, confetti ---------- */
function updateMoneyUI() {
  const el = $('moneyVal'); if (el) el.textContent = '$' + economy.money.toLocaleString();
  if (lastScreen === 'garage') renderGarage();
  updateNightUI();
}
const statBar = (label, v) => `<div class="bar"><span>${label}</span><i style="--w:${Math.round(clamp(v, 0, 1) * 100)}%"></i></div>`;
/* driver picker: two free racers, the rest cost race cash */
function renderDrivers() {
  const list = $('drvList'); if (!list) return;
  const owned = drvOwned(), cur = drvId();
  list.innerHTML = `<div class="lbl" style="margin:2px 0 8px">PICK YOUR RACER · THE MORE CASH THEY COST, THE HARDER THE PERK</div>` + DRIVERS.map(d => {
    const has = owned.includes(d.id), eq = cur === d.id, tier = drvTier(d.price);
    const price = has ? (eq ? 'EQUIPPED' : 'TAP TO EQUIP') : '$' + d.price.toLocaleString();
    return `<button type="button" class="drvCard${eq ? ' eq' : ''}${!has ? ' lock' : ''}" data-drv="${d.id}">
      <span class="dvAva">${d.name[0]}</span>
      <span class="dvMid"><b>${d.name} <i>· ${d.title}</i><em class="dvTier ${tier.cls}">${tier.lab}</em></b><small>${d.desc}</small></span>
      <span class="dvPrice${!has && economy.money < d.price ? ' no' : ''}">${price}</span>
    </button>`;
  }).join('');
}
function driverClick(id) {
  const d = driverById(id), owned = drvOwned();
  if (owned.includes(id)) {
    if (drvId() === id) return;
    store.set('ksr.driver', id); CS = carStats(economy.selected()); /* perk applies the moment you equip */
    toast(`${d.name} EQUIPPED · ${d.desc}`, '#8be5ff'); sfxPad(); renderDrivers(); renderGarage(); return;
  }
  if (economy.money >= d.price) {
    economy.spend(d.price); store.set('ksr.drv', [...owned, id]); store.set('ksr.driver', id);
    CS = carStats(economy.selected()); sfxMission(); confetti(35); toast(`${d.name} HIRED! ${d.desc}`, '#7dff8a'); renderDrivers(); renderGarage();
  } else { toast(`NEED $${(d.price - economy.money).toLocaleString()} MORE FOR ${d.name}`, '#ff7b7b'); beep(220, 0.2, 'square', 0.1); }
}
let previewId = null, gIdx = 0;
const dashBar = (label, v) => { const n = Math.round(clamp(v, 0, 1) * 10); return `<div class="stRow"><b>${label}</b><div class="dash">${Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div></div>`; };
function renderGarage() {
  const list = $('carList'); if (!list) return;
  if (gIdx < 0 || gIdx >= CARS.length) gIdx = Math.max(0, CARS.findIndex(c => c.id === economy.selected()));
  const c = CARS[gIdx], owned = economy.has(c.id), sel = economy.selected() === c.id, afford = economy.money >= c.price, eff = carStats(c.id);
  const tags = [c.stats.fly ? '<span class="tag fly">FLYING \u2708</span>' : '', owned ? '<span class="tag own">OWNED</span>' : (c.tag && !(c.stats.fly && /FLYING/i.test(c.tag)) ? `<span class="tag">${c.tag}</span>` : ''), sel ? '<span class="tag sel">SELECTED</span>' : ''].join(' ');
  const cta = sel ? 'SELECTED' : owned ? 'SELECT' : afford ? 'BUY $' + c.price.toLocaleString() : 'NEED $' + (c.price - economy.money).toLocaleString() + ' MORE';
  list.innerHTML = `<div class="gNav"><button class="gArr" data-garr="-1" type="button" aria-label="Previous car">&#9664;</button>
    <div class="carCard${sel ? ' sel' : ''}">
      <div class="top"><span>${c.name}</span> ${tags}${owned ? '' : `<span class="price ${afford ? '' : 'no'}">$${c.price.toLocaleString()}</span>`}</div>
      <div class="desc">${c.desc}</div>
      ${owned ? '' : '<div class="gLock">\ud83d\udd12</div>'}
      ${dashBar('TOP SPEED', eff.top / 136)}${dashBar('ACCELERATION', eff.accel / 72)}${dashBar('HANDLING', (eff.steer - 1.5) / 0.85)}${dashBar('NITRO', 0.45 + 0.11 * (eff.ni || 0))}${c.stats.fly ? dashBar('FLIGHT', (8 + 4 * (eff.fl || 0)) / 28) : ''}
      <button class="gCta${sel ? ' sel' : (!owned && !afford ? ' no' : '')}" data-car="${c.id}" type="button">${cta}</button>
    </div>
    <button class="gArr" data-garr="1" type="button" aria-label="Next car">&#9654;</button></div>
    <div class="gCount">${gIdx + 1} / ${CARS.length}</div>`;
  /* upgrade tab: 4 tiles for the car you are looking at */
  const up = $('upPanel');
  if (up) {
    if (!owned) up.innerHTML = '<div class="upNote">OWN THIS CAR TO UPGRADE IT</div>';
    else up.innerHTML = `<div class="lbl" style="margin-top:2px">${c.name} \u00b7 UPGRADES</div><div class="upGrid">${[['en', 'ENGINE'], ['ty', 'TYRES'], ['ni', 'NITRO']].concat(c.stats.fly ? [['fl', 'FLIGHT']] : []).map(([k, lab]) => {
      const lv = economy.upLevel(c.id, k), max = lv >= 5, cost = max ? 0 : economy.upCost(k, lv);
      const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<button type="button" class="upBtn upTile${max ? ' max' : ''}${!max && economy.money < cost ? ' cant' : ''}" data-up="${c.id}:${k}" aria-label="Upgrade ${lab}"><span class="upLab">${lab}</span><span class="lv">LV ${lv}</span><span class="upPips">${pips}</span><small>${max ? 'MAX' : '$' + cost.toLocaleString()}</small></button>`;
    }).join('')}</div>`;
  }
  renderDrivers();
  if (document.querySelector('.gSec[data-gt="tat"]')) renderTattoos();
}
function garageClick(id) {
  const c = getCar(id), owned = economy.has(id);
  if (owned) { if (economy.selected() === id) return; previewId = null; applyPlayerCar(id); rebuildCar(id); toast(`${c.name} SELECTED`, '#7df'); sfxPad(); renderGarage(); return; }
  if (economy.money >= c.price) {
    previewId = null;
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
  if (can) { b.disabled = false; b.classList.add('pulse'); b.textContent = `\ud83c\udf81 TAP TO CLAIM DAILY BONUS \u00b7 $${dailyAmt(streak + 1).toLocaleString()}`; }
  else { b.disabled = true; b.classList.remove('pulse'); b.textContent = `\ud83c\udf81 DAILY BONUS CLAIMED \u00b7 COME BACK TOMORROW`; }
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
  const si = $('btnSignIn'), so = $('btnSignOut'); if (si) si.style.display = cloud.email ? 'none' : ''; if (so) so.style.display = cloud.email ? '' : 'none';
  updateMpGate();
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
  addEventListener('ksr-auth', () => { updateCloudUI(); cloudSyncIn(); tryDeepJoin(); });
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
  if (cfg.type === 'arena' || cfg.type === 'adv') return;
  const rival = cfg.ghost, local = !rival && cfg.mode === 'tt' ? store.get(`sr.ghost.tt.${cfg.laps}${tsx(cfg.track)}`, null) : null;
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
    if (fAcc > 2.5) { if (fAcc / fN > 1 / 36 && pr > 1.5) { pr = Math.max(1.5, pr - 0.25); renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); } fAcc = 0; fN = 0; }
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
  if (cfg.type === 'adv' && state === 'race' && !P.finished) { adv.tick(dt, { slip: out.slip, sp: out.sp, boosting: out.boosting, alt: FL.alt + P.jy, h: P.h }); stepPvP(dt); }
  if (state === 'race' && !P.finished && cfg.type !== 'arena' && cfg.type !== 'adv') GR.tick(raceT, car.position, P.h);
  if (ghostCar && ghostCar.active) ghostCar.update(scene, raceT);
  if (state === 'race' && cfg.type === 'arena') { A.t -= dt; if (A.t <= 0 && !P.finished) { A.t = 0; finishRace(); } }
  if (state === 'race' && cfg.type !== 'arena' && cfg.type !== 'adv') {
    if (P.crosses !== prevCrosses) {
      if (P.crosses > prevCrosses) { if (P.crosses >= 2) { const lt = raceT - lapStart; bestLap = Math.min(bestLap, lt); if (P.crosses <= TOTAL) toast(`LAP ${P.crosses - 1}   ${fmt(lt)}`, '#ffffff'); } lapStart = raceT; }
      prevCrosses = P.crosses;
    }
    if (!P.finished && P.crosses >= TOTAL + 1) finishRace();
  }
  smoke.forEach(o => { if (o.life > 0) { o.life -= dt; o.s.position.addScaledVector(o.vel, dt); o.s.scale.addScalar(dt * 3.5); o.s.material.opacity = Math.max(0, o.life / o.max) * 0.4; if (o.life <= 0) o.s.visible = false; } });
  pollPad();
  stepTraffic(dt, racing);
  if (itemsOn()) stepPickups(dt, racing);
  pads.concat(padsNight).forEach(p => { const u = p.userData; if (u.cd > 0) u.cd -= dt; if (u.flash > 0) u.flash -= dt * 1.5; p.material.opacity = 0.55 + Math.sin(performance.now() * 0.004 + u.k) * 0.15 + Math.max(0, u.flash) * 0.4; });
  arena.update(dt);
  updateRain(dt);
  net.tick(dt, state === 'race', P, raceT, P.finished, cfg.type === 'adv' && cfg.mode === 'mp' ? adv.S.pow : undefined);
  if (cfg.mode === 'mp' && state === 'finished') {
    mpRefT -= dt;
    if (mpRefT <= 0) {
      mpRefT = 0.7;
      const rows = [{ name: 'YOU', me: true, tms: Math.round(raceT * 1000), prog: P.prog, fin: true },
        ...net.players.filter(p => p.uid !== net.uid()).map(p => ({ name: p.name || 'RIVAL', tms: p.tms || 0, prog: p.prog || (p.state && p.state.prog) || 0, fin: !!p.fin }))]
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
    look.addScaledVector(V3(Math.cos(a), 0, -Math.sin(a)), -(camera.aspect < 1 ? 0.3 : 2.3));
    if (camera.aspect < 1) look.y -= 1.9; /* portrait: car sits in the top half, above the menu sheet */
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
/* this phone has killed the GL context before: step the quality down so it stops happening */
{
  const glfixN = store.get('sr.glfixN', 0) || 0;
  if (store.get('sr.glfix', 0)) {
    store.set('sr.glfix', 0);
    setTimeout(() => toast(glfixN >= 3 ? 'GRAPHICS RECOVERED · LOW MODE FOR STABILITY' : 'GRAPHICS RECOVERED · GO RACE', '#8df'), 900);
  }
  if (glfixN >= 3 && opt.q !== 'low') { opt.q = 'low'; store.set('sr.opt', opt); }
  else if (glfixN >= 1 && opt.q === 'high') { opt.q = 'med'; store.set('sr.opt', opt); }
}
net.init({
  THREE, scene, toast, driverName,
  mkCar: (id, color) => makeCar(color, carGeo(id), getCar(id).tint || null),
  carId: () => economy.selected(), carColor: () => curColor,
  carTat: () => tatFor(economy.selected()), applyTattoo: (g, id, tat) => applyTattoo(g, id, tat),
  optEnv: () => opt.env, optLaps: () => opt.laps,
  netGo(room) {
    if (room.mode === 'adv') startRace({ mode: 'mp', type: 'adv', laps: 1, ai: 0, diff: 1, env: room.env || 'day', title: 'ADVENTURE · FREE ROAM' });
    else startRace({ mode: 'mp', laps: room.laps || 3, env: room.env || 'day', ai: 0, diff: 2, title: `ROOM ${net.code} · ${net.players.length} DRIVERS` });
  },
  onRoomClosed() { /* host killed the room mid-free-roam: keep cruising solo */
    if (cfg.type === 'adv' && cfg.mode === 'mp') { cfg.mode = 'adv'; toast('SOLO FREE ROAM', '#ffd166'); }
  },
  inRace: () => state === 'race' || state === 'count' || state === 'finished',
  itemEvt: () => (itemsOn() && cfg.mode === 'mp' ? mpEvt : null),
  shieldS: () => PU.shield,
  onRemoteItem(uid, it, name) { /* a rival fired something: spawn it locally — same start, same speed, same homing, so both screens agree */
    if (!it || state !== 'race' || !itemsOn()) return;
    if (it.k === 'r') {
      const m = mkRocketMesh(new THREE.Color(0.9, 1.4, 2.8), 0xff3b3b); scene.add(m);
      Rockets.push({ mesh: m, s: ((it.s || 0) + 4) % N, lat: clamp(it.lat || 0, -(W - 1), W - 1), life: 3.6, tgt: null, ai: { name: name || 'RIVAL' }, speed: 135 });
      toast('INCOMING · ' + (name || 'RIVAL'), '#ff6b6b'); sfxWhoosh();
    } else if (it.k === 'o') {
      const bk = sample(it.s || 0, clamp(it.lat || 0, -(W - 1), W - 1));
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(2.3, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      mesh.position.set(bk.p.x, bk.p.y + 0.09, bk.p.z); world.add(mesh);
      Oils.push({ mesh, x: bk.p.x, z: bk.p.z, life: 12, arm: 1.2 });
      toast('OIL DOWN · ' + (name || 'RIVAL'), '#ffd166');
    }
  },
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
syncSegs(); applyQuality(); applyCtrl(false); gateBoot();
if (TURBO || location.search.includes('dbg')) { window.__DBG = { get tH() { return tH; }, get pts() { return pts; }, get tan() { return tan; }, P, FL, keys, N, get CS() { return CS; }, PU, TRAF, Rockets, Oils, AIs, get raceCoins() { return raceCoins; }, get raceGems() { return raceGems; }, usePowerup, fireRocket, dropOil, coinData, gemData, car, adv, act, startRace, get SC() { return SC; }, get curTrack() { return curTrack; }, get state() { return state; }, get cfgT() { return cfg.type; }, forceRace() { setState('race'); goT = 0.9; $('count').style.display = 'none'; } }; window.__SCDBG = { checks: 0 }; } /* dev test hook */
requestAnimationFrame(frame);

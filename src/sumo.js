// Kay Super Racing: SUMO ARENA — "Street Legends" knockout battles in the sky.
// Multi-level platforms over the clouds. Last car standing wins the round;
// most round wins takes the match. Ram rivals off the edge, PUNCH them
// (right mouse / E / PUNCH button), grab items, smash the props.
// Round-based like a fighting game: RING OUT / WRECKED feed, scoreboard, announcements.
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const TAU = Math.PI * 2;

/* the three permanent arenas — the last two unlock with RESPECT levels.
   `floor` is the bold deck colour: each tier looks like a DIFFERENT venue,
   bright and saturated so skid marks, oil and cars all read instantly (the
   reference sumo footage is a bright orange slab in full sun — never a void). */
export const SUMO_ARENAS = [
  { name: 'DOCKYARD RUMBLE', css: '#ff9a2f', floor: 0xe06428, rep: 0, t: 75, pay: 1.0, ai: [0.72, 0.78, 0.84, 0.88, 0.92], desc: 'WAREHOUSE DECK · CENTRAL PIT' },
  { name: 'SKY DECK SHOWDOWN', css: '#2de2ff', floor: 0x18b0a8, rep: 1, t: 80, pay: 1.7, ai: [0.78, 0.84, 0.9, 0.95, 0.98], desc: 'TWIN ISLANDS · NARROW BRIDGES' },
  { name: 'LEGEND SUMMIT', css: '#ff4dd8', floor: 0xd8479e, rep: 3, t: 85, pay: 2.6, ai: [0.84, 0.9, 0.96, 1.0, 1.02], desc: 'THREE ISLANDS · ELITE CREW' }
];
const ROUNDS = 3;
const ROUND_COLS = [0x48b556, 0xe8683a, 0x2fa9dc]; /* the slab is repainted every round: green, orange, blue — like the reference */
const NAMES = ['VEX', 'BRUTE', 'TANK', 'SLICK', 'HORN'];
const RCOL = [0xff5c8a, 0x9d5cff, 0x35d16a, 0xff7a2a, 0x2de2ff];
const RID = ['blaze', 'titan', 'cab', 'volt', 'sultan'];
export const SUMO_RIVAL_COLS = RCOL;
export const SUMO_RIVAL_IDS = RID;
const ITEMS = [
  { id: 'repair', name: 'REPAIR', col: 0x35d16a },
  { id: 'mega', name: 'MEGA PUNCH', col: 0xff9a2f },
  { id: 'shield', name: 'SHIELD', col: 0x2de2ff }
];

export function createSumo(canvasTex, ctx) {
  const group = new THREE.Group(); group.visible = false;
  group.position.y = 62; /* the arena floats high above the clouds */
  const dummy = new THREE.Object3D();
  /* S: the state main.js reads for the HUD */
  const S = {
    tier: 0, rivals: 3, rounds: ROUNDS, round: 1, t: 75, phase: 'intro', phaseT: 2.2,
    alive: 4, freeze: true, myOut: false, spectate: false, matchOver: false,
    pow: 100, hitFlash: 0, punchCd: 0, mega: 0, shield: 0, myKO: 0, myRing: 0,
    stars: {}, feed: [], msg: null, itemT: 6, env: 'day',
    juice: 0, lastHitT: -99 /* juice = gold flash when YOU land a hit; lastHitT = time of the last hit you took */
  };
  let decks = [], ramps = [], walls = [], spawns = [];
  let tG = 0, roundWins = 0, myStars = 0, stripePulse = null, floodlights = [];

  /* ---------- shared textures ---------- */
  const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  function labelTex(txt, col) {
    return canvasTex(256, 64, g => {
      g.fillStyle = 'rgba(6,10,18,.9)'; g.fillRect(0, 0, 256, 64);
      g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(3, 3, 250, 58);
      g.fillStyle = col; g.font = '900 24px Segoe UI,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 128, 34);
    });
  }

  /* ---------- static sky dressing (built once) ---------- */
  {
    /* DAYLIGHT cloud sea UNDER the arena — you are fighting on top of the sky.
       The old version had a near-black plane right under the deck: on camera the
       whole venue read as a black void. Now: fat white clouds close below + a
       horizon cloud bank + a pale haze floor far down. Bright, like the reference. */
    const cg = new THREE.PlaneGeometry(1, 1);
    const cm = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const clouds = new THREE.InstancedMesh(cg, cm, 34);
    for (let i = 0; i < 34; i++) {
      dummy.position.set(rand(-800, 800), rand(-58, -26), rand(-800, 800));
      dummy.rotation.set(-Math.PI / 2, 0, rand(0, TAU));
      dummy.scale.set(rand(120, 300), rand(80, 200), 1); dummy.updateMatrix();
      clouds.setMatrixAt(i, dummy.matrix);
    }
    dummy.rotation.set(0, 0, 0); group.add(clouds);
    const bank = new THREE.InstancedMesh(cg, cm, 16);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, r = rand(420, 760);
      dummy.position.set(Math.cos(a) * r, rand(-36, -18), Math.sin(a) * r);
      dummy.rotation.set(-Math.PI / 2, 0, rand(0, TAU));
      dummy.scale.set(rand(260, 520), rand(140, 260), 1); dummy.updateMatrix();
      bank.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.set(1, 1, 1); group.add(bank);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa8c4e2 }));
    under.position.y = -90; group.add(under);
  }
  const skyRing = new THREE.Group(); group.add(skyRing);
  {
    /* far skyline ring, same trick as the free-roam city */
    const sky = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x33445e, roughness: 1 }), 30);
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * TAU, r = rand(950, 1500), h = rand(50, 130), w = rand(40, 100);
      dummy.position.set(Math.cos(a) * r, h / 2 - 100, Math.sin(a) * r); dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(w, h, rand(40, 90)); dummy.updateMatrix();
      sky.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); group.add(sky);
  }

  /* ---------- deck layout per arena tier ----------
     decks:  { x0,x1,z0,z1, y }            solid ground you can stand on
     ramps:  { x0,x1,z0,z1, a, y0, y1, d }  height lerps along axis a ('x'|'z') from y0 -> y1
     walls:  { x0,x1,z0,z1, y0, y1 }        solid AABBs (pit walls, warehouse, scaffolds)  */
  function buildLayout(tier) {
    decks = []; ramps = []; walls = []; spawns = [];
    const Y = 0; /* deck top level, the whole group floats at ALT */
    const frame = (x0, x1, z0, z1, hole, y, pitY) => { /* deck with a rectangular hole (the pit) */
      const [hx0, hx1, hz0, hz1] = hole;
      decks.push({ x0, x1, z0, z1, y, hx0, hx1, hz0, hz1 }); /* one rect, hole tested in groundAt */
      if (pitY !== undefined) decks.push({ x0: hx0, x1: hx1, z0: hz0, z1: hz1, y: pitY }); /* pit floor */
    };
    if (tier === 0) {
      /* DOCKYARD: one big deck + pit + warehouse with a drive-up roof */
      frame(-108, 108, -108, 108, [-23, 23, -23, 23], Y, -7);
      ramps.push({ x0: -9, x1: 9, z0: -52, z1: -22, a: 'z', y0: Y, y1: -7, d: 1 });
      ramps.push({ x0: -9, x1: 9, z0: 22, z1: 52, a: 'z', y0: Y, y1: -7, d: -1 });
      walls.push({ x0: -25, x1: 25, z0: -25, z1: -23, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: -25, x1: 25, z0: 23, z1: 25, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: -25, x1: -23, z0: -25, z1: 25, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: 23, x1: 25, z0: -25, z1: 25, y0: -7, y1: Y - 0.2 });
      /* warehouse (solid, roof reachable from the ramp) */
      walls.push({ x0: -104, x1: -58, z0: 26, z1: 30, y0: Y, y1: Y + 12.6 });
      walls.push({ x0: -104, x1: -58, z0: 62, z1: 66, y0: Y, y1: Y + 12.6 });
      walls.push({ x0: -104, x1: -100, z0: 26, z1: 66, y0: Y, y1: Y + 12.6 });
      walls.push({ x0: -78, x1: -74, z0: 30, z1: 62, y0: Y, y1: Y + 12.6 }); /* middle pillar row */
      walls.push({ x0: -62, x1: -58, z0: 30, z1: 62, y0: Y, y1: Y + 12.6 });
      decks.push({ x0: -104, x1: -58, z0: 26, z1: 66, y: Y + 13 }); /* roof */
      ramps.push({ x0: -84, x1: -70, z0: 8, z1: 26, a: 'z', y0: Y, y1: Y + 13, d: 1 }); /* ramp up to the roof */
      spawns.push([-70, Y, -70, 0], [70, Y, -70, Math.PI], [70, Y, 70, Math.PI], [-70, Y, 70, 0], [0, Y, -80, Math.PI / 2], [0, Y, 80, -Math.PI / 2]);
    } else if (tier === 1) {
      /* SKY DECK: twin islands + two narrow bridges + a shared pit on the west island */
      frame(-108, -6, -86, 86, [-23, 23, -23, 23], Y, -7);
      decks.push({ x0: 26, x1: 108, z0: -86, z1: 86, y: Y });
      decks.push({ x0: -6, x1: 26, z0: -44, z1: -14, y: Y }); /* bridge S */
      decks.push({ x0: -6, x1: 26, z0: 14, z1: 44, y: Y });   /* bridge N */
      ramps.push({ x0: -9, x1: 9, z0: -52, z1: -22, a: 'z', y0: Y, y1: -7, d: 1 });
      ramps.push({ x0: -9, x1: 9, z0: 22, z1: 52, a: 'z', y0: Y, y1: -7, d: -1 });
      walls.push({ x0: -25, x1: 25, z0: -25, z1: -23, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: -25, x1: 25, z0: 23, z1: 25, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: -25, x1: -23, z0: -25, z1: 25, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: 23, x1: 25, z0: -25, z1: 25, y0: -7, y1: Y - 0.2 });
      decks.push({ x0: 44, x1: 108, z0: -40, z1: 40, y: Y + 7 }); /* east upper deck */
      ramps.push({ x0: 16, x1: 44, z0: -8, z1: 8, a: 'x', y0: Y, y1: Y + 7, d: 1 });
      spawns.push([-70, Y, -60, 0], [70, Y, -60, Math.PI], [70, Y, 60, Math.PI], [-70, Y, 60, 0], [70, Y + 7, 0, Math.PI], [-16, Y, 0, -Math.PI / 2]);
    } else {
      /* LEGEND SUMMIT: three islands, long bridges, pits everywhere */
      frame(-108, 108, -108, -16, [-23, 23, -78, -32], Y, -7);
      decks.push({ x0: -108, x1: -26, z0: 18, z1: 108, y: Y });
      decks.push({ x0: 26, x1: 108, z0: 18, z1: 108, y: Y });
      decks.push({ x0: -9, x1: 9, z0: -16, z1: 18, y: Y });   /* south bridge */
      decks.push({ x0: -67, x1: -47, z0: -16, z1: 18, y: Y }); /* west bridge */
      decks.push({ x0: 47, x1: 67, z0: -16, z1: 18, y: Y });   /* east bridge */
      ramps.push({ x0: -9, x1: 9, z0: -108, z1: -78, a: 'z', y0: Y, y1: -7, d: 1 });
      ramps.push({ x0: -9, x1: 9, z0: -32, z1: -2, a: 'z', y0: Y, y1: -7, d: -1 });
      walls.push({ x0: -25, x1: 25, z0: -80, z1: -78, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: -25, x1: 25, z0: -32, z1: -30, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: -25, x1: -23, z0: -80, z1: -30, y0: -7, y1: Y - 0.2 });
      walls.push({ x0: 23, x1: 25, z0: -80, z1: -30, y0: -7, y1: Y - 0.2 });
      decks.push({ x0: 56, x1: 108, z0: 52, z1: 108, y: Y + 7 });
      ramps.push({ x0: 36, x1: 56, z0: 32, z1: 52, a: 'z', y0: Y, y1: Y + 7, d: 1 });
      spawns.push([-70, Y, -90, 0], [70, Y, -90, Math.PI], [-70, Y, 70, 0], [70, Y, 70, Math.PI], [82, Y + 7, 80, Math.PI], [0, Y, -60, Math.PI / 2]);
    }
  }

  /* ---------- floor scuff texture: tyre streaks baked into every deck (the reference
     arena is never flat — rubber, scuffs and patches make it a PLACE, not a plane) ---------- */
  const scuffTex = canvasTex(1024, 1024, g => {
    /* clean painted slab like the reference: flat colour, soft grain, big swooping tyre arcs (drawn dark, multiplied over the paint) */
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.008, 0.03).toFixed(3)})`; g.fillRect(rand(0, 1024), rand(0, 1024), rand(2, 6), rand(2, 6)); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 16; i++) { /* long arcs = donuts and drifts */
      const cx = rand(0, 1024), cy = rand(0, 1024), r = rand(120, 380), a0 = rand(0, TAU), a1 = a0 + rand(0.9, 2.6);
      for (const off of [-9, 9]) { g.strokeStyle = `rgba(10,30,14,${rand(0.10, 0.2).toFixed(3)})`; g.lineWidth = rand(7, 12); g.beginPath(); g.arc(cx, cy, r + off, a0, a1); g.stroke(); }
    }
    for (let i = 0; i < 12; i++) { /* straight skids */
      const x = rand(0, 1024), y = rand(0, 1024), a = rand(0, TAU), l = rand(180, 420);
      for (const off of [-8, 8]) { g.strokeStyle = `rgba(10,24,12,${rand(0.08, 0.16).toFixed(3)})`; g.lineWidth = rand(6, 10); g.beginPath(); g.moveTo(x + Math.cos(a + 1.57) * off, y + Math.sin(a + 1.57) * off); g.lineTo(x + Math.cos(a) * l + Math.cos(a + 1.57) * off, y + Math.sin(a) * l + Math.sin(a + 1.57) * off); g.stroke(); }
    }
  });
  scuffTex.wrapS = scuffTex.wrapT = THREE.RepeatWrapping; scuffTex.anisotropy = 8;
  /* BoxGeometry UVs stretch one texture over a whole deck (= a blurry smear). World-space UVs keep it sharp. */
  function worldUV(g, tile) { const p = g.attributes.position, u = g.attributes.uv; for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / tile, p.getZ(i) / tile); return g; }

  /* ---------- build / rebuild the arena meshes ---------- */
  let builtTier = -1;
  const edgeCols = [0xff9a2f, 0x35d16a, 0x2de2ff];
  function build(tier) {
    if (builtTier === tier) return;
    builtTier = tier;
    buildLayout(tier);
    /* clear the old dynamic root */
    if (arenaRoot) { group.remove(arenaRoot); arenaRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    arenaRoot = new THREE.Group(); group.add(arenaRoot);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x474c55, roughness: 0.9, metalness: 0.05 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.85, metalness: 0.05 });
    /* the BOLD tier floor sits on top of the dark structure: bright slab where you drive,
       dark sides below so the platform still reads as a heavy man-made thing in the sky */
    const FLOOR = SUMO_ARENAS[tier].floor || 0xe06428;
    const floorMat = new THREE.MeshStandardMaterial({ color: ROUND_COLS[0], roughness: 0.9, metalness: 0.0, map: scuffTex });
    floorMatRef = floorMat;
    const pitMat = new THREE.MeshStandardMaterial({ color: 0xe4e7ec, roughness: 0.95, metalness: 0.0, map: scuffTex }); /* pale pit bottom: you SEE the drop */
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.9, metalness: 0.05, map: scuffTex }); /* dark ramps */
    const geos = [], floorGeos = [], pitGeos = [], edgeGeos = [], rampGeos = [], wallGeos = [];
    for (const d of decks) {
      /* a deck with a hole (the pit) is drawn as four frame boxes so the hole is REAL */
      const rects = d.hx0 !== undefined ? [
        [d.x0, d.hx0, d.z0, d.z1], [d.hx1, d.x1, d.z0, d.z1],
        [d.hx0, d.hx1, d.z0, d.hz0], [d.hx0, d.hx1, d.hz1, d.z1]
      ] : [[d.x0, d.x1, d.z0, d.z1]];
      for (const [rx0, rx1, rz0, rz1] of rects) {
        const w = rx1 - rx0, dp = rz1 - rz0;
        if (w <= 0.4 || dp <= 0.4) continue;
        const g = new THREE.BoxGeometry(w, 10, dp); g.translate((rx0 + rx1) / 2, d.y - 5.3, (rz0 + rz1) / 2);
        geos.push(g);
        /* bright driving slab, top face flush with groundAt() so wheels sit ON it */
        const fg = new THREE.BoxGeometry(w - 0.5, 0.3, dp - 0.5); fg.translate((rx0 + rx1) / 2, d.y - 0.15, (rz0 + rz1) / 2); worldUV(fg, 48);
        (d.y < -1 ? pitGeos : floorGeos).push(fg);
        const t = 0.55, ec = edgeGeos;
        ec.push(new THREE.BoxGeometry(w, t, t).translate((rx0 + rx1) / 2, d.y + 0.1, rz0 + t / 2));
        ec.push(new THREE.BoxGeometry(w, t, t).translate((rx0 + rx1) / 2, d.y + 0.1, rz1 - t / 2));
        ec.push(new THREE.BoxGeometry(t, t, dp - t * 2).translate(rx0 + t / 2, d.y + 0.1, (rz0 + rz1) / 2));
        ec.push(new THREE.BoxGeometry(t, t, dp - t * 2).translate(rx1 - t / 2, d.y + 0.1, (rz0 + rz1) / 2));
      }
    }
    for (const r of ramps) {
      const w = r.x1 - r.x0, dp = r.z1 - r.z0, y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
      const len = Math.hypot(r.a === 'x' ? w : dp, y1 - y0);
      const g = new THREE.BoxGeometry(r.a === 'x' ? len : w, 1.2, r.a === 'x' ? w : len);
      if (r.a === 'x') g.rotateZ(Math.atan2(y1 - y0, w) * (r.d > 0 ? 1 : -1));
      else g.rotateX(-Math.atan2(y1 - y0, dp) * (r.d > 0 ? 1 : -1));
      g.translate((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 - 0.2, (r.z0 + r.z1) / 2);
      worldUV(g, 48); rampGeos.push(g);
    }
    for (const wl of walls) {
      if (wl.hide) continue;
      const g = new THREE.BoxGeometry(wl.x1 - wl.x0, wl.y1 - wl.y0, wl.z1 - wl.z0);
      g.translate((wl.x0 + wl.x1) / 2, (wl.y0 + wl.y1) / 2, (wl.z0 + wl.z1) / 2);
      wallGeos.push(g);
    }
    const deckMesh = new THREE.Mesh(mergeAll(geos), deckMat);
    deckMesh.receiveShadow = true; arenaRoot.add(deckMesh);
    if (floorGeos.length) { const fm = new THREE.Mesh(mergeAll(floorGeos), floorMat); fm.receiveShadow = true; arenaRoot.add(fm); }
    if (pitGeos.length) { const pm = new THREE.Mesh(mergeAll(pitGeos), pitMat); pm.receiveShadow = true; arenaRoot.add(pm); }
    if (rampGeos.length) { const rm = new THREE.Mesh(mergeAll(rampGeos), rampMat); rm.receiveShadow = true; arenaRoot.add(rm); }
    if (wallGeos.length) { const wm = new THREE.Mesh(mergeAll(wallGeos), new THREE.MeshStandardMaterial({ color: 0x626976, roughness: 0.85, metalness: 0.1 })); wm.castShadow = wm.receiveShadow = true; arenaRoot.add(wm); }
    /* rim stripes: bright additive — the arena reads instantly from any angle */
    const stripe = new THREE.Mesh(mergeAll(edgeGeos), new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.85, metalness: 0.05 }));
    stripe.receiveShadow = true; arenaRoot.add(stripe);
    stripePulse = { opacity: 1 }; /* the rim breathes in tick() — the edge reads as DANGER from any angle */
    
    /* concrete support pillars under every deck corner: the arena stands on something, like the reference */
    { const pg = [], pilMat = new THREE.MeshStandardMaterial({ color: 0x59606c, roughness: 0.9, metalness: 0.05 });
      for (const d of decks) if (d.y > -1) for (const [px, pz] of [[d.x0 + 5, d.z0 + 5], [d.x1 - 5, d.z0 + 5], [d.x0 + 5, d.z1 - 5], [d.x1 - 5, d.z1 - 5]]) pg.push(new THREE.BoxGeometry(5.5, 70, 5.5).translate(px, d.y - 10.3 - 35, pz));
      if (pg.length) { const pm = new THREE.Mesh(mergeAll(pg), pilMat); pm.castShadow = pm.receiveShadow = true; arenaRoot.add(pm); } }
    buildScaffolds(tier);
    buildProps(tier);
    buildLights(tier);
    buildMiniBase(tier);
  }
  /* ---------- scaffold towers (steel pipes + wooden plank decks), like the reference ---------- */
  const SCAF = [
    [[-92, 92], [92, -92], [92, 92]],
    [[-92, -72], [-92, 72], [92, -72], [92, 72]],
    [[-92, 96], [92, 96], [-92, -100], [92, -100]]
  ];
  function buildScaffolds(tier) {
    const steel = [], wood = [], H = 13, Wd = 9;
    const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    for (const [cx, cz] of SCAF[tier] || SCAF[0]) {
      const g0 = groundAt(cx, cz); if (g0 === null) continue;
      const y0 = g0, h = Wd / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) steel.push(bx(0.5, H, 0.5, cx + sx * h, y0 + H / 2, cz + sz * h));
      for (const ly of [0.3, 4.6, 8.9, H - 0.2]) {
        for (const sz of [-1, 1]) steel.push(bx(Wd, 0.3, 0.3, cx, y0 + ly, cz + sz * h));
        for (const sx of [-1, 1]) steel.push(bx(0.3, 0.3, Wd, cx + sx * h, y0 + ly, cz));
      }
      for (const sz of [-1, 1]) for (let l = 0; l < 3; l++) { /* X braces on the long faces */
        const ya = y0 + 0.3 + l * 4.3, len = Math.hypot(Wd, 4.3), ang = Math.atan2(4.3, Wd);
        for (const sg of [-1, 1]) { const br = new THREE.BoxGeometry(len, 0.2, 0.2); br.rotateZ(sg * ang); br.translate(cx, ya + 2.15, cz + sz * h); steel.push(br); }
      }
      for (let i = 0; i < 6; i++) wood.push(bx(Wd + 0.6, 0.18, 1.3, cx, y0 + H, cz - h + 0.75 + i * 1.5)); /* top planks */
      for (let i = 0; i < 5; i++) wood.push(bx(Wd - 0.6, 0.16, 1.2, cx, y0 + 6.5 + i * 0.004, cz - h + 0.9 + i * 1.7)); /* mid planks */
      walls.push({ x0: cx - h, x1: cx + h, z0: cz - h, z1: cz + h, y0: y0, y1: y0 + H, hide: true }); /* solid footprint */
    }
    if (steel.length) { const m = new THREE.Mesh(mergeAll(steel), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.55, metalness: 0.6 })); m.castShadow = m.receiveShadow = true; arenaRoot.add(m); }
    if (wood.length) { const m = new THREE.Mesh(mergeAll(wood), new THREE.MeshStandardMaterial({ color: 0xc98f4e, roughness: 0.9 })); m.castShadow = m.receiveShadow = true; arenaRoot.add(m); }
  }
  /* ---------- corner floodlight towers: the stadium reads at a glance and every tier gets its own colour ---------- */
  function buildLights(tier) {
    floodlights.forEach(f => arenaRoot.remove(f.grp)); floodlights = [];
    const col = new THREE.Color(0xfff3d6);
    for (const [lx, lz] of [[-118, -118], [118, -118], [118, 118], [-118, 118]]) {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 30, 8), new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.7, metalness: 0.4 }));
      pole.position.y = 15; grp.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 1.6), new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.5 }));
      head.position.y = 30.5; head.lookAt(0, 20, 0); grp.add(head);
      for (let i = 0; i < 3; i++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 0.4), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), toneMapped: false }));
        lamp.position.set((i - 1) * 2.2, 30.5, 0.6); head.add(lamp);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.scale.set(11, 11, 1); glow.position.y = 30.5; grp.add(glow);
      /* aim the head at the arena middle */
      grp.position.set(lx, 0, lz); grp.lookAt(0, 6, 0); grp.rotation.x = 0; grp.rotation.z = 0;
      arenaRoot.add(grp); floodlights.push({ grp, glow });
    }
  }
  function mergeAll(list) { return list.length > 1 ? mergeGeos(list) : list[0]; }
  let arenaRoot = null, floorMatRef = null;
  let mergeGeos = null; /* injected via ctx to avoid the addon import here */

  /* ---------- ground & wall queries ---------- */
  function groundAt(x, z) {
    let best = null;
    for (const d of decks) {
      if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
      if (d.hx0 !== undefined && x > d.hx0 && x < d.hx1 && z > d.hz0 && z < d.hz1) continue; /* pit hole */
      if (best === null || d.y > best) best = d.y;
    }
    for (const r of ramps) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const f = r.a === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
      const y = r.y0 + (r.y1 - r.y0) * (r.d > 0 ? f : 1 - f);
      if (best === null || y > best) best = y;
    }
    return best;
  }
  function slopeAt(x, z, h) { /* small pitch hint so ramps feel real */
    const d = 2.2, g1 = groundAt(x + Math.sin(h) * d, z + Math.cos(h) * d), g0 = groundAt(x - Math.sin(h) * d, z - Math.cos(h) * d);
    if (g1 === null || g0 === null) return 0;
    return -Math.atan2(g1 - g0, d * 2);
  }
  function collide(o, r, alt) {
    let hit = null;
    for (const wl of walls) {
      if (alt !== undefined && (alt + 1.4 < wl.y0 || alt > wl.y1)) continue;
      const cx = clamp(o.x, wl.x0, wl.x1), cz = clamp(o.z, wl.z0, wl.z1);
      const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      let nx, nz, depth;
      if (d2 < 1e-6) {
        const l = o.x - wl.x0, rr = wl.x1 - o.x, tt = o.z - wl.z0, bb = wl.z1 - o.z, m = Math.min(l, rr, tt, bb);
        if (m === l) { nx = -1; nz = 0; depth = l + r; } else if (m === rr) { nx = 1; nz = 0; depth = rr + r; }
        else if (m === tt) { nx = 0; nz = -1; depth = tt + r; } else { nx = 0; nz = 1; depth = bb + r; }
      } else { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; depth = r - d; }
      o.x += nx * depth; o.z += nz * depth;
      hit = { hit: true, nx, nz };
    }
    return hit || { hit: false, nx: 0, nz: 0 };
  }

  /* ---------- destructible props: planks, poles, barrels, crates ---------- */
  const props = [];
  const propGeo = {
    plank: new THREE.BoxGeometry(3.4, 0.22, 0.6),
    pole: new THREE.CylinderGeometry(0.14, 0.14, 3.6, 6),
    barrel: new THREE.CylinderGeometry(0.5, 0.5, 1.15, 10),
    crate: new THREE.BoxGeometry(1.3, 1.3, 1.3)
  };
  const propMat = {
    plank: new THREE.MeshStandardMaterial({ color: 0xb08a4f, roughness: 0.9 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.6 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0xd6601f, roughness: 0.5, metalness: 0.3 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x8a6b3a, roughness: 0.85 })
  };
  function buildProps(tier) {
    props.forEach(p => arenaRoot.remove(p.mesh)); props.length = 0;
    const N = 56 + tier * 8;
    for (let i = 0; i < N; i++) {
      for (let t = 0; t < 24; t++) {
        const x = rand(-100, 100), z = rand(-100, 100);
        const g = groundAt(x, z);
        if (g === null || g < -1) continue;
        if (inAnyWall(x, z, 2)) continue;
        const kind = ['plank', 'plank', 'plank', 'pole', 'pole', 'barrel', 'crate'][(Math.random() * 7) | 0];
        const mesh = new THREE.Mesh(propGeo[kind], propMat[kind]);
        mesh.castShadow = true; mesh.position.set(x, g + (kind === 'plank' || kind === 'pole' ? 0.4 : 0.65), z);
        mesh.rotation.y = rand(0, TAU); arenaRoot.add(mesh);
        props.push({ mesh, kind, x, z, y: g, air: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, dead: false, t: 0, base: mesh.position.y });
        break;
      }
    }
  }
  function inAnyWall(x, z, pad) {
    for (const wl of walls) if (x > wl.x0 - pad && x < wl.x1 + pad && z > wl.z0 - pad && z < wl.z1 + pad && wl.y1 > 4) return true;
    return false;
  }
  function stepProps(dt) {
    for (const p of props) {
      if (p.dead) { p.t -= dt; if (p.t <= 0) { p.dead = false; p.mesh.visible = true; p.mesh.position.set(p.x, p.base, p.z); p.mesh.rotation.set(0, rand(0, TAU), 0); } continue; }
      if (p.air > 0) {
        p.vy -= 26 * dt; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rx * dt; p.mesh.rotation.z += p.rz * dt;
        const g = groundAt(p.mesh.position.x, p.mesh.position.z);
        if (g === null) { if (p.mesh.position.y < -34) { p.dead = true; p.t = rand(14, 22); p.mesh.visible = false; } }
        else if (p.mesh.position.y <= g + 0.5) {
          p.mesh.position.y = g + 0.5;
          if (Math.abs(p.vy) > 4) { p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; p.rx *= 0.5; p.rz *= 0.5; ctx.thud(); }
          else { p.air = 0; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
        }
      } else if (p.vx || p.vz) { p.vx *= Math.exp(-4 * dt); p.vz *= Math.exp(-4 * dt); p.mesh.position.x += p.vx * dt; p.mesh.position.z += p.vz * dt; if (Math.abs(p.vx) + Math.abs(p.vz) < 0.05) { p.vx = p.vz = 0; } }
    }
  }
  function whackProps(x, z, vx, vz, who) { /* a car ploughed into the props */
    let n = 0;
    for (const p of props) {
      if (p.dead || p.air > 0) continue;
      const dx = p.mesh.position.x - x, dz = p.mesh.position.z - z;
      if (dx * dx + dz * dz > 6.5) continue;
      p.air = 1; p.vx = vx * 0.55 + dx * 2.4; p.vz = vz * 0.55 + dz * 2.4;
      p.vy = rand(4, 9); p.rx = rand(-7, 7); p.rz = rand(-7, 7);
      n++;
    }
    if (n && who === 'P') { ctx.nitroAdd(0.05); ctx.beep(300 + Math.random() * 160, 0.05, 'square', 0.05); }
    return n;
  }

  /* ---------- item pickups ---------- */
  const items = [];
  function spawnItem(px, pz) {
    for (let t = 0; t < 30; t++) {
      const x = rand(-95, 95), z = rand(-95, 95), g = groundAt(x, z);
      if (g === null || g < -1 || inAnyWall(x, z, 3)) continue;
      if (Math.hypot(x - px, z - pz) < 24) continue;
      const def = ITEMS[(Math.random() * ITEMS.length) | 0];
      const grp = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), new THREE.MeshStandardMaterial({ color: def.col, roughness: 0.3, metalness: 0.5, emissive: def.col, emissiveIntensity: 0.55 }));
      box.position.y = 1.25; grp.add(box);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 46, 10, 1, true), new THREE.MeshBasicMaterial({ color: def.col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      beam.position.y = 24; grp.add(beam);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: def.col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      halo.scale.set(9, 9, 1); halo.position.y = 1.4; grp.add(halo);
      const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(def.name, '#' + def.col.toString(16).padStart(6, '0')), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      lbl.scale.set(11, 2.8, 1); lbl.position.y = 4.4; grp.add(lbl);
      grp.position.set(x, g, z); arenaRoot.add(grp);
      items.push({ grp, box, x, z, y: g, def, ttl: 26 });
      return;
    }
  }
  function clearItems() { items.forEach(it => { arenaRoot.remove(it.grp); it.grp.traverse(o => { if (o.geometry && o.geometry !== propGeo.plank) o.geometry.dispose(); }); }); items.length = 0; }


  /* ---------- SPRING PUNCH: a coil shoots out of the car's nose and shoves what it hits ---------- */
  const coilGeo = (() => {
    const pts = [], TURNS = 7, N = 90;
    for (let i = 0; i <= N; i++) { const a = i / N * TURNS * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 0.42, Math.sin(a) * 0.42, i / N)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.1, 8, false);
  })();
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.85, roughness: 0.25, emissive: 0x4a5a6a });
  const fistMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, metalness: 0.3, roughness: 0.35, emissive: 0xaa3a00 });
  const springs = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(), coil = new THREE.Mesh(coilGeo, coilMat), fist = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 20).rotateX(Math.PI / 2), fistMat);
    coil.frustumCulled = false; g.add(coil); g.add(fist); g.visible = false; group.add(g);
    springs.push({ g, coil, fist, t: 0, own: null, big: false });
  }
  const SP_T = 0.5, SP_LEN = 3.4;
  function springFire(own, big) {
    const sp = springs.find(q => q.t <= 0) || springs[0];
    sp.t = SP_T; sp.own = own; sp.big = !!big; sp.g.visible = true;
    sp.fist.material = big ? fistMat : fistMat;
  }
  function stepSprings(dt) {
    for (const sp of springs) {
      if (sp.t <= 0) continue;
      sp.t -= dt; const k = 1 - Math.max(0, sp.t) / SP_T; /* 0..1 */
      /* fast out (first 28%), brief hold, quick wobbly retract */
      const e = k < 0.28 ? 1 - Math.pow(1 - k / 0.28, 3) : k < 0.5 ? 1 : Math.max(0, 1 - (k - 0.5) / 0.5);
      const wob = k > 0.28 && k < 0.5 ? Math.sin((k - 0.28) * 90) * 0.04 : 0;
      const len = Math.max(0.05, (e + wob) * SP_LEN * (sp.big ? 1.25 : 1));
      let x, y, z, h;
      if (!sp.own) { sp.t = 0; sp.g.visible = false; continue; }
      if (sp.own === 'P') { const Pp = ctx.pPos(); if (!Pp) { sp.t = 0; sp.g.visible = false; continue; } h = ctx.pH(); x = Pp.x; z = Pp.z; y = ctx.pAlt ? ctx.pAlt() : 0.6; }
      else { x = sp.own.x; z = sp.own.z; y = sp.own.y; h = sp.own.h; }
      const fx = Math.sin(h), fz = Math.cos(h);
      sp.g.position.set(x + fx * 2.1, y + 0.62, z + fz * 2.1); sp.g.rotation.set(0, h, 0);
      sp.coil.scale.set(1, 1, len); sp.fist.position.z = len + 0.09;
      if (sp.t <= 0) sp.g.visible = false;
    }
  }

  /* ---------- punch shockwave visuals ---------- */
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 8, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    m.visible = false; group.add(m); rings.push({ m, t: 0 });
  }
  function ringFX(x, y, z, col) {
    const r = rings.find(r => r.t <= 0) || rings[0];
    r.t = 1; r.m.visible = true; r.m.material.color.set(col); r.m.position.set(x, y + 0.7, z); r.m.scale.setScalar(1);
  }
  function stepRings(dt) { for (const r of rings) { if (r.t <= 0) continue; r.t -= dt * 2.4; r.m.scale.setScalar(1 + (1 - r.t) * 10); r.m.material.opacity = Math.max(0, r.t) * 0.85; if (r.t <= 0) r.m.visible = false; } }

  /* ---------- floating PUNCH tag over your car (the reference game rides "PUNCH 0.8"
     above the bumper — you read your cooldown without hunting the HUD) ---------- */
  const tagCv = document.createElement('canvas'); tagCv.width = 896; tagCv.height = 224; /* 4x: stays crisp when the camera is close */
  const tagG = tagCv.getContext('2d'); tagG.scale(4, 4);
  const tagTex = new THREE.CanvasTexture(tagCv);
  const tagSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  tagSpr.scale.set(4.6, 1.15, 1); tagSpr.visible = false; group.add(tagSpr);
  let tagTxt = '';
  function drawTag(txt, col) {
    tagG.clearRect(0, 0, 224, 56);
    tagG.font = '900 30px Segoe UI,Arial'; tagG.textAlign = 'center'; tagG.textBaseline = 'middle';
    const w = Math.min(220, Math.ceil(tagG.measureText(txt).width) + 36), x0 = (224 - w) / 2;
    tagG.fillStyle = 'rgba(7,11,20,.85)';
    if (tagG.roundRect) { tagG.beginPath(); tagG.roundRect(x0, 6, w, 44, 11); tagG.fill(); tagG.strokeStyle = col; tagG.lineWidth = 3; tagG.stroke(); }
    else tagG.fillRect(x0, 6, w, 44);
    tagG.fillStyle = col; tagG.fillText(txt, 112, 30);
    tagTex.needsUpdate = true;
  }

  /* ---------- rivals ---------- */
  const RIV = [];
  function buildRivals(n, tier) {
    while (RIV.length) { const r = RIV.pop(); group.remove(r.mesh); }
    for (let i = 0; i < n; i++) {
      const mesh = ctx.mkRival(i);
      mesh.rotation.order = 'YXZ'; mesh.visible = false; group.add(mesh);
      /* save the vertex colours so every round starts with a fresh paint job */
      const orig = [];
      mesh.traverse(m => { if (m.isMesh && m.geometry && m.geometry.attributes && m.geometry.attributes.color) orig.push({ m, arr: m.geometry.attributes.color.array.slice() }); });
      mesh.userData.origCols = orig;
      RIV.push({
        mesh, name: NAMES[i], css: '#' + RCOL[i % 5].toString(16).padStart(6, '0'),
        x: 0, z: 0, y: 0, h: 0, speed: 0, vy: 0, vx: 0, vz: 0, fall: false, elim: false, how: '',
        hp: 100, dented: false, punchCd: rand(2, 4), boostCd: rand(2, 6), boostT: 0, stuck: 0, ramCd: 0,
        hopY: 0, hopV: 0, /* knock-up: punched cars briefly leave the deck */
        skill: (SUMO_ARENAS[tier].ai[i] || 0.9), smokeT: 0, target: null, lastHitBy: '',
        grudge: 0, grudgeA: null /* grudge: seconds left hunting whoever hit them last — makes fights SPIRAL */
      });
    }
  }
  function dent(mesh) {
    if (mesh.userData.dented) return;
    mesh.userData.dented = true;
    mesh.traverse(m => {
      if (m.isMesh && m.geometry && m.geometry.attributes && m.geometry.attributes.color) {
        const c = m.geometry.attributes.color, arr = c.array;
        for (let i = 0; i < arr.length; i++) arr[i] *= 0.6;
        c.needsUpdate = true;
      }
    });
  }
  function undent(mesh) {
    if (!mesh.userData.dented) return;
    mesh.userData.dented = false;
    (mesh.userData.origCols || []).forEach(({ m, arr }) => { m.geometry.attributes.color.array.set(arr); m.geometry.attributes.color.needsUpdate = true; });
  }

  /* ---------- feed / messages ----------
     Attribution rule: a KO is ALWAYS credited to a NAME. "SOMEONE" reads like a bug —
     if no car touched the victim, blame the arena itself instead. */
  function feed(txt, col) {
    S.feed.unshift({ txt, col, t: 4.5 });
    if (S.feed.length > 4) S.feed.pop();
  }
  function msg(txt, col, t = 2) { S.msg = { txt, col, t }; }

  /* ---------- round flow ---------- */
  function startRound(round) {
    if (floorMatRef) floorMatRef.color.setHex(ROUND_COLS[(round - 1) % ROUND_COLS.length]); /* repaint the slab every round */
    S.round = round; S.phase = 'intro'; S.phaseT = round === 1 ? 2.4 : 2.2; S.freeze = true;
    S.t = SUMO_ARENAS[S.tier].t; S.itemT = rand(6, 9);
    S.feed.length = 0; /* stale "VEX WINS THE ROUND" must not bleed into the next ROUND — FIGHT */
    S.lastHitBy = ''; S.lastHitT = -99; S.juice = 0;
    clearItems();
    const sp = spawns;
    /* player spawn */
    const pi = (round - 1) % sp.length;
    const my = sp[pi];
    S.spawn = { x: my[0], z: my[2], y: my[1], h: my[3] };
    RIV.forEach((r, i) => {
      const s2 = sp[(pi + i + 1) % sp.length]; /* never the player's slot */
      r.x = s2[0]; r.z = s2[2]; r.y = s2[1]; r.h = s2[3];
      r.speed = 0; r.vy = 0; r.fall = false; r.elim = false; r.hp = 100; r.dented = false;
      r.mesh.rotation.set(0, r.h, 0); undent(r.mesh);
      r.mesh.rotation.x = 0; r.mesh.rotation.z = 0;
      r.punchCd = rand(2.5, 4.5); r.boostCd = rand(2, 6); r.boostT = 0; r.stuck = 0; r.ramCd = 0;
      r.hopY = 0; r.hopV = 0;
      r.mesh.visible = group.visible; r.mesh.position.set(r.x, r.y + 0.04, r.z); r.mesh.rotation.set(0, r.h, 0);
    });
    S.alive = RIV.length + 1;
    S.myOut = false; S.spectate = false; S.pow = 100; S.punchCd = 0; S.mega = 0; S.shield = 0;
    msg(S.round === 1 ? 'ROUND 1' : `ROUND ${S.round}`, '#ffd166', 2.2);
    ctx.beep(520, 0.1, 'square', 0.09); setTimeout(() => ctx.beep(760, 0.14, 'square', 0.1), 160);
  }
  function endRound(winnerName, how) {
    if (S.phase === 'end') return;
    S.phase = 'end'; S.phaseT = 2.6; S.freeze = true;
    S.stars[winnerName] = (S.stars[winnerName] || 0) + 1;
    if (winnerName === 'YOU') {
      myStars++; roundWins++; feed('YOU WIN THE ROUND', '#7dff8a'); msg('ROUND WON!', '#7dff8a', 2.4); ctx.beep(980, 0.16, 'triangle', 0.12);
      /* CEREMONY: the round-winning moment freezes and erupts — the payoff beat */
      const Pp = ctx.pPos();
      ctx.hitStop(0.18); ctx.fovKick(6); ctx.sparks(Pp.x, 1.2, Pp.z, 30, 0xffd166, 11, 4);
    }
    else { feed(`${winnerName} WINS THE ROUND`, '#ffd166'); msg(`${winnerName} TAKES THE ROUND`, '#ffd166', 2.4); }
    if (S.round >= S.rounds) { S.matchOver = true; }
  }

  /* ---------- eliminations ---------- */
  function elimRival(r, how, byName) {
    if (r.elim) return;
    r.elim = true; r.fall = how === 'ring'; r.how = how; r.mesh.visible = true;
    S.stars[r.name] = S.stars[r.name] || 0;
    S.alive--;
    if (how === 'ring') { /* RING OUT: explosion + heavy shake at the lip they went over — the KO must FEEL heavy */
      ctx.beep(220, 0.3, 'sawtooth', 0.1); ctx.boom(new THREE.Vector3(r.x, r.y + 1, r.z), 9); ctx.shake(0.45); ringFX(r.x, r.y, r.z, 0xff5c5c);
      ctx.hitStop(0.15); ctx.fovKick(6); /* the world holds its breath as they drop */
      ctx.sparks(r.x, (r.y || 0) + 1.2, r.z, 22, 0xff5c3c, 13, 3);
      if (byName === 'YOU') { S.myKO++; S.juice = 1; ctx.cash(600); feed('YOU PUSHED ' + r.name + ' OFF', '#7dff8a'); }
      else if (byName) feed(byName + ' PUSHED ' + r.name + ' OFF', r.css);
      else feed(r.name + ' DROPPED OFF THE EDGE', r.css);
    }
    else { ctx.boom(new THREE.Vector3(r.x, r.y + 1, r.z), 10); ctx.shake(0.4); ctx.hitStop(0.12); ctx.fovKick(5); ctx.sparks(r.x, (r.y || 0) + 1, r.z, 18, 0xffa040, 11, 3); if (byName === 'YOU') { S.myKO++; S.juice = 1; ctx.cash(500); feed('YOU WRECKED ' + r.name, '#7dff8a'); } else if (byName) feed(byName + ' WRECKED ' + r.name, r.css); else feed(r.name + ' IS WRECKED', r.css); }
    const left = RIV.filter(q => !q.elim);
    if (!left.length) { /* every rival is gone: the round is yours if you are still rolling */
      endRound(S.myOut ? 'NOBODY' : 'YOU', how);
    } else if (left.length === 1 && S.myOut) endRound(left[0].name, how);
    else if (S.phase === 'fight' && left.length === 2 && !S.myOut) msg('FINAL 2 CARS!', '#ff9a2f');
  }
  function elimPlayer(how, byName) {
    if (S.myOut || S.phase !== 'fight') return;
    S.myOut = true; S.spectate = true; S.alive--;
    if (how === 'ring') { S.myRing++; if (S.lastHitBy) feed(S.lastHitBy + ' SENT YOU OFF!', '#ff6b6b'); else feed('YOU FELL OFF!', '#ff6b6b'); msg('RING OUT!', '#ff6b6b', 2.4); ctx.beep(180, 0.4, 'sawtooth', 0.12); }
    else { feed(byName ? `${byName} WRECKED YOU` : 'YOU ARE WRECKED', '#ff6b6b'); msg('WRECKED!', '#ff6b6b', 2.4); ctx.boom(ctx.pPos(), 12); }
    ctx.hitStop(0.16); ctx.fovKick(7); /* your own demise gets the longest freeze */
    const Pp2 = ctx.pPos(); ctx.sparks(Pp2.x, 1.2, Pp2.z, 24, 0xff5c5c, 12, 3);
    ctx.shake(1);
    const left = RIV.filter(q => !q.elim);
    if (left.length === 1) endRound(left[0].name, how);
    else if (!left.length) endRound('NOBODY', how);
    else if (left.length === 2) msg('FINAL 2 CARS!', '#ff9a2f');
  }

  /* ---------- punch (player) ---------- */
  function punch() {
    if (S.freeze || S.myOut || S.punchCd > 0 || S.phase !== 'fight') return 0;
    S.punchCd = 2.4;
    const Pp = ctx.pPos(), h = ctx.pH(), Pv = ctx.pVel();
    const fx = Math.sin(h), fz = Math.cos(h);
    const mega = S.mega > 0; if (mega) S.mega = 0;
    springFire('P', mega);
    ringFX(Pp.x + fx * 2.4, ctx.pAlt ? ctx.pAlt() : 0.6, Pp.z + fz * 2.4, mega ? 0xff9a2f : 0xffffff);
    ctx.beep(mega ? 120 : 150, 0.1, 'square', 0.13); ctx.thud(); ctx.shake(mega ? 0.6 : 0.35);
    let hits = 0;
    for (const r of RIV) {
      if (r.elim || r.fall) continue;
      const dx = r.x - Pp.x, dz = r.z - Pp.z, d = Math.hypot(dx, dz);
      if (d > 8.4 || d < 0.01) continue;
      const dot = (dx / d) * fx + (dz / d) * fz;
      if (dot < 0.25) continue; /* must be roughly in front */
      const pw = (mega ? 30 : 21) * (0.8 + Math.min(1, 9 / d) * 0.4);
      r.vx = (r.vx || 0) + (dx / d) * pw; r.vz = (r.vz || 0) + (dz / d) * pw;
      r.vy = 4.5; r.airK = 0.4; r.stunT = 1.1; /* flung: the driver fights the wheel, badly */
      r.lastHitBy = 'YOU'; r.grudge = 4; r.grudgeA = 'YOU'; /* hit a hornet: it hunts YOU now */
      r.h += rand(-0.5, 0.5);
      r.hp -= mega ? 30 : 14; r.smokeT = 1;
      r.hopY = 0.02; r.hopV = mega ? 5.6 : 4.2; /* knocked UP: the hit visibly lifts the car */
      hits++;
      ctx.sparks(r.x, (r.y || 0) + 1, r.z, mega ? 24 : 13, mega ? 0xff9a2f : 0xffd166, 10, 2.5); /* impact sparks ON the victim */
      ctx.puff(V3L(r.x, (r.y || 0) + 1, r.z), V3L(0, 1, 0), 1.5);
      if (r.hp <= 0) { elimRival(r, 'wreck', 'YOU'); }
      else { dent(r.mesh); r.dented = true; feed('PUNCHED ' + r.name, '#ffffff'); }
    }
    if (hits) {
      /* THE HIT: gold screen flash + hit stop + FOV punch. The 80-130 ms the world
         freezes is what sells the power — everything after it lands harder. */
      S.juice = 1; ctx.puff(Pp, V3L(0, 1, 0), 1.6); ctx.beep(1500, 0.05, 'square', 0.05); /* top layer: a bright snap over the bass thud */
      ctx.hitStop(mega ? 0.13 : Math.min(0.115, 0.08 + hits * 0.012));
      ctx.fovKick(mega ? 7 : 4.5);
    }
    else ctx.beep(210, 0.05, 'sine', 0.05); /* whiff: a soft air-cut so a miss never feels like a bug */
    return hits;
  }
  const V3L = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------- player damage (rams & punches from rivals) ---------- */
  function hitPower(d, label) {
    if (S.shield > 0 || S.myOut || S.phase !== 'fight') return;
    S.pow = clamp(S.pow - d, 0, 100); S.hitFlash = 1; S.lastHitT = tG;
    if (label) ctx.toast(label, '#ff6b6b');
    if (S.pow <= 0) elimPlayer('wreck', S.lastHitBy);
  }

  /* ---------- main tick ---------- */
  function tick(dt, o) {
    tG += dt;
    const Pp = ctx.pPos(), Pv = ctx.pVel();
    /* phases: intro (frozen) -> fight -> end (announcement) -> next round */
    if (S.phase !== 'fight') {
      S.phaseT -= dt;
      if (S.phaseT <= 0) {
        if (S.phase === 'intro') { S.phase = 'fight'; S.freeze = false; msg('FIGHT!', '#7dff8a', 1.2); ctx.beep(1040, 0.16, 'square', 0.12); ctx.shake(0.3); }
        else if (S.phase === 'end' && !S.matchOver) startRound(S.round + 1);
      }
    } else {
      S.t -= dt;
      if (S.t <= 0) { /* time up: whoever still has the most POWER takes the round */
        let best = null, bp = -1;
        if (!S.myOut && S.pow > bp) { bp = S.pow; best = 'YOU'; }
        for (const r of RIV) if (!r.elim && r.hp > bp) { bp = r.hp; best = r.name; }
        endRound(best || 'NOBODY', 'time');
      }
    }
    S.hitFlash = Math.max(0, S.hitFlash - dt * 1.6);
    S.punchCd = Math.max(0, S.punchCd - dt);
    S.shield = Math.max(0, S.shield - dt);
    S.juice = Math.max(0, S.juice - dt * 2.2);
    if (S.lastHitBy && tG - S.lastHitT > 6) S.lastHitBy = ''; /* a hit 6s ago gets no credit for a fall now */
    if (S.msg) { S.msg.t -= dt; if (S.msg.t <= 0) S.msg = null; }
    S.feed.forEach(f => { f.t -= dt; });
    while (S.feed.length && S.feed[S.feed.length - 1].t <= 0) S.feed.pop();

    /* items */
    if (S.phase === 'fight') {
      S.itemT -= dt;
      if (S.itemT <= 0) { if (items.length < 2) spawnItem(Pp.x, Pp.z); S.itemT = rand(10, 14); }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.ttl -= dt; it.box.rotation.y += dt * 2.2; it.box.position.y = 1.25 + Math.sin(tG * 2.6) * 0.16;
        if (it.ttl <= 0) { arenaRoot.remove(it.grp); items.splice(i, 1); continue; }
        const gy = groundAt(Pp.x, Pp.z);
        if (!S.myOut && gy !== null && Math.abs(gy - it.y) < 3 && Math.hypot(Pp.x - it.x, Pp.z - it.z) < 3.4) {
          if (it.def.id === 'repair') { S.pow = Math.min(100, S.pow + 45); ctx.toast('REPAIR +45 POWER', '#35d16a'); }
          else if (it.def.id === 'mega') { S.mega = 1; ctx.toast('MEGA PUNCH LOADED — NEXT HIT IS HUGE', '#ff9a2f'); }
          else if (it.def.id === 'shield') { S.shield = 4.5; ctx.toast('SHIELD UP — 4.5s IMMUNE', '#2de2ff'); }
          else { ctx.nitroAdd(1); ctx.toast('NITRO REFILLED', '#ffd166'); }
          ctx.beep(880, 0.09, 'square', 0.08);
          feed('YOU GRAB ' + it.def.name, '#ffd166');
          arenaRoot.remove(it.grp); items.splice(i, 1);
        }
      }
    }

    /* elite rivals fight for the crates too — high tiers feel ALIVE and a bit unfair (on purpose) */
    if (S.phase === 'fight') {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.def.id !== 'repair' && it.def.id !== 'shield') continue;
        for (const r of RIV) {
          if (r.elim || (r.skill || 0) < 0.8 || (r.shieldT || 0) > 0) continue;
          if (Math.hypot(r.x - it.x, r.z - it.z) < 3.2 && Math.abs((r.y || 0) - it.y) < 3) {
            if (it.def.id === 'repair') r.hp = Math.min(100, r.hp + 35);
            else r.shieldT = 3.5;
            feed(r.name + ' GRAB ' + it.def.name, r.css);
            arenaRoot.remove(it.grp); items.splice(i, 1);
            break;
          }
        }
      }
    }

    stepProps(dt); stepRings(dt); stepSprings(dt);
    /* rim stripes breathe: slow pulse keeps the DROP ZONE loud even in calm moments */
    if (stripePulse) stripePulse.opacity = 0.68 + Math.sin(tG * 2.8) * 0.32;
    /* floodlight glow drifts a touch — the arena never feels frozen */
    for (const f of floodlights) f.glow.material.opacity = 0.34 + Math.sin(tG * 1.7 + f.grp.position.x) * 0.06;

    /* player ground / fall (physics is in main.js stepPlayer — this is the death check) */
    if (!S.myOut && S.phase === 'fight' && ctx.pJy() < -30 && groundAt(Pp.x, Pp.z) === null) elimPlayer('ring');
    if (S.myOut && ctx.pJy() < -46 && !S.spectateCam) S.spectateCam = true;

    /* floating punch tag: MEGA / countdown / READY — gold when it is time to swing */
    if (S.phase === 'fight' && !S.myOut) {
      const t2 = S.mega > 0 ? 'MEGA PUNCH!' : S.punchCd > 0.05 ? 'PUNCH ' + S.punchCd.toFixed(1) : 'PUNCH!';
      const c2 = S.mega > 0 ? '#ff9a2f' : S.punchCd > 0.05 ? '#ffffff' : '#ffd166';
      if (t2 !== tagTxt) { tagTxt = t2; drawTag(t2, c2); }
      tagSpr.position.set(Pp.x, (ctx.pAlt() || 0) + 3.4, Pp.z);
      tagSpr.visible = false; /* the HUD punch bar says it already — a giant floating plate blocked the view */
    } else if (tagSpr.visible) { tagSpr.visible = false; tagTxt = ''; }

    /* rivals */
    let aliveN = 0;
    for (const r of RIV) {
      if (r.elim) {
        if (r.fall) { /* tumble into the clouds */
          r.vy -= 26 * dt; r.y += r.vy * dt; r.x += r.vx * dt; r.z += r.vz * dt;
          r.mesh.position.set(r.x, r.y, r.z); r.mesh.rotation.x += dt * 2.4; r.mesh.rotation.z += dt * 1.7;
          if (r.y < -60) { r.mesh.visible = false; r.fall = false; }
        }
        continue;
      }
      aliveN++;
      if (S.phase !== 'fight') { r.mesh.position.set(r.x, r.y + 0.04, r.z); continue; }
      /* falling */
      if (r.fall) { elimRivalVisual(r); continue; }
      const gy = groundAt(r.x, r.z);
      if (gy === null) { /* over the edge: gravity takes over */
        r.fall = true; r.vy = 0; r.vx = Math.sin(r.h) * r.speed; r.vz = Math.cos(r.h) * r.speed;
        elimRival(r, 'ring', r.lastHitBy || ''); /* empty = nobody touched them: elimRival blames the edge, never "SOMEONE" */
        continue;
      }
      /* knockback velocity (from punches/rams) decays into the drive.
         While flung hard the rival can't steer — that's how punches kill near the edge. */
      if (r.vx || r.vz) {
        r.x += r.vx * dt; r.z += r.vz * dt;
        r.vx *= Math.exp(-1.7 * dt); r.vz *= Math.exp(-1.7 * dt);
        if (Math.abs(r.vx) + Math.abs(r.vz) < 0.2) { r.vx = r.vz = 0; }
        const hit2 = collide(r, 1.9, r.y);
        if (hit2.hit) { r.vx *= -0.3; r.vz *= -0.3; }
      }
      r.stunT = Math.max(0, (r.stunT || 0) - dt);
      r.shieldT = Math.max(0, (r.shieldT || 0) - dt);
      r.grudge = Math.max(0, r.grudge - dt);
      const flung = Math.abs(r.vx) + Math.abs(r.vz) > 5 || r.stunT > 0;
      /* target: grudges first (hit a hornet, it hunts YOU — or the rival that punched it),
         then nearest alive car with the player slightly preferred */
      let tx, tz, td = 1e9, tgtIsPlayer = false;
      const dP = Math.hypot(Pp.x - r.x, Pp.z - r.z);
      if (r.grudge > 0 && r.grudgeA === 'YOU' && !S.myOut) { td = dP * 0.45; tx = Pp.x; tz = Pp.z; tgtIsPlayer = true; }
      else if (r.grudge > 0 && r.grudgeA && r.grudgeA !== 'YOU') {
        const gg = RIV.find(q => q.name === r.grudgeA && !q.elim);
        if (gg) { const dg = Math.hypot(gg.x - r.x, gg.z - r.z); td = dg * 0.45; tx = gg.x; tz = gg.z; tgtIsPlayer = false; }
      }
      if (td === 1e9) {
        if (!S.myOut && dP < 999) { td = dP * 0.85; tx = Pp.x; tz = Pp.z; tgtIsPlayer = true; }
        for (const q of RIV) {
          if (q === r || q.elim) continue;
          const d = Math.hypot(q.x - r.x, q.z - r.z);
          if (d < td) { td = d; tx = q.x; tz = q.z; tgtIsPlayer = false; }
        }
      }
      if (tx === undefined) { tx = 0; tz = 0; tgtIsPlayer = false; }
      const want0 = Math.atan2(tx - r.x, tz - r.z);
      /* edge safety: probe ahead, turn back to the deck centre when it drops away */
      const look = 10 + r.speed * 0.5;
      const px2 = r.x + Math.sin(r.h) * look, pz2 = r.z + Math.cos(r.h) * look;
      const gAhead = groundAt(px2, pz2);
      let want = want0, unsafe = false;
      if (gAhead === null || gAhead < r.y - 4) {
        unsafe = true;
        const cx = clamp(r.x, -80, 80), cz = clamp(r.z, -80, 80);
        want = Math.atan2(cx - r.x, cz - r.z);
      }
      const rate = (unsafe ? 3.4 : 2.6) * (0.7 + r.skill * 0.5) * (flung ? 0.12 : 1);
      r.h += clamp(angDiff(want, r.h), -rate * dt, rate * dt);
      /* speed */
      const top = (26 + S.tier * 4) * (0.8 + r.skill * 0.35) * (r.boostT > 0 ? 1.42 : 1) * (flung ? 0.25 : 1);
      const tgt = td < 26 ? top * 0.75 : top;
      r.speed += (tgt - r.speed) * Math.min(1, dt * 1.5);
      r.boostT = Math.max(0, r.boostT - dt); r.boostCd -= dt;
      if (r.boostCd <= 0 && !unsafe && (td > 34 || (r.grudge > 0 && td > 15))) { r.boostT = 1.3; r.boostCd = rand(3.5, 7); } /* grudges make them burn nitro to close in */
      if (r.speed < 5 && td > 12) { r.stuck += dt; if (r.stuck > 1.4) { r.h += rand(-2.2, 2.2); r.speed = -6; r.stuck = 0; } } else r.stuck = 0;
      r.x += Math.sin(r.h) * r.speed * dt; r.z += Math.cos(r.h) * r.speed * dt;
      const hit = collide(r, 1.9, r.y);
      if (hit.hit) { r.speed *= 0.45; r.h += rand(-0.4, 0.4); }
      /* ground follow */
      const g2 = groundAt(r.x, r.z);
      r.y = g2 === null ? r.y : r.y + (g2 - r.y) * Math.min(1, dt * 10);
      /* punch */
      r.punchCd -= dt;
      if (td < 8.5 && r.punchCd <= 0 && Math.abs(angDiff(Math.atan2(tx - r.x, tz - r.z), r.h)) < 0.6) {
        r.punchCd = rand(2.6, 4.2) / (0.7 + r.skill * 0.5);
        springFire(r, false);
        ringFX(r.x + Math.sin(r.h) * 2.4, r.y, r.z + Math.cos(r.h) * 2.4, 0xffffff);
        ctx.puff(r.mesh.position, V3L(0, 0.8, 0), 1.2);
        ctx.beep(130, 0.09, 'square', 0.08);
        if (tgtIsPlayer && dP < 8.5) { /* punched the PLAYER */
          const nx = (Pp.x - r.x) / Math.max(0.5, dP), nz = (Pp.z - r.z) / Math.max(0.5, dP);
          const pw = 17 * (0.75 + r.skill * 0.5);
          Pv.x += nx * pw; Pv.z += nz * pw; Pv.y = 0;
          hitPower(12, `${r.name} PUNCHES YOU!`);
          ctx.sparks((Pp.x + r.x) / 2, (r.y || 0) + 1, (Pp.z + r.z) / 2, 11, 0xff5c5c, 9, 2);
          ctx.hitStop(0.07); ctx.fovKick(4);
          ctx.shake(0.5); ctx.thud();
          S.lastHitBy = r.name; S.lastHitT = tG;
        } else { /* punched a rival: shove them — and the victim holds a grudge, so the pack turns on itself */
          for (const q of RIV) {
            if (q === r || q.elim) continue;
            const dq = Math.hypot(q.x - r.x, q.z - r.z);
            if (dq > 8.5) continue;
            const pw = 21 * (0.75 + r.skill * 0.5);
            q.vx = (q.vx || 0) + (q.x - r.x) / Math.max(0.5, dq) * pw; q.vz = (q.vz || 0) + (q.z - r.z) / Math.max(0.5, dq) * pw;
            q.hp -= 13; q.smokeT = 1; q.lastHitBy = r.name; q.stunT = 1; q.grudge = 3.5; q.grudgeA = r.name;
            if (q.hp <= 0) elimRival(q, 'wreck', r.name);
          }
        }
      }
      /* smoke when hurt */
      r.smokeT = Math.max(0, r.smokeT - dt);
      if (r.hp < 45 && Math.random() < dt * 4) ctx.puff(r.mesh.position, V3L(0, 0.9, 0), 0.9);
      if (r.shieldT > 0 && Math.random() < dt * 8) ctx.puff(V3L(r.x, (r.y || 0) + 1.2, r.z), V3L(0, 0.6, 0), 0.5);
      /* metal-on-metal with the player: real shoving — closing speed hurts you BOTH */
      if (!S.myOut && dP < 3.9) {
        const nx = (Pp.x - r.x) / Math.max(0.01, dP), nz = (Pp.z - r.z) / Math.max(0.01, dP);
        const push = 3.9 - dP;
        r.x -= nx * push * 0.55; r.z -= nz * push * 0.55;
        Pp.x += nx * push * 0.45; Pp.z += nz * push * 0.45;
        const rv = Math.sin(r.h) * r.speed * nx + Math.cos(r.h) * r.speed * nz;
        const pv = Pv.x * nx + Pv.z * nz;
        const closing = rv - pv; /* >0: the rival slammed into you */
        const mine = -closing; /* >0: YOU slammed into THEM */
        r.ramCd -= dt;
        if (mine > 7 && r.ramCd <= 0) { /* your bumper does the talking: fling them toward the edge */
          r.ramCd = 0.6; S.juice = Math.max(S.juice, 0.8);
          const pw = clamp(mine * 0.55, 8, 24);
          r.vx = (r.vx || 0) + nx * pw; r.vz = (r.vz || 0) + nz * pw;
          r.vy = 3.5; r.stunT = 0.9; r.lastHitBy = 'YOU'; r.grudge = 4; r.grudgeA = 'YOU';
          r.hopY = 0.02; r.hopV = 3.4; /* rammed: they skip off the ground */
          Pv.x -= nx * mine * 0.22; Pv.z -= nz * mine * 0.22;
          if (S.shield <= 0) { r.hp -= clamp(mine * 0.5, 4, 14); if (r.hp <= 0) { elimRival(r, 'wreck', 'YOU'); continue; } }
          ctx.onRam(-nx, -nz, clamp(mine * 0.2, 2, 7));
          ctx.sparks((Pp.x + r.x) / 2, (r.y || 0) + 0.8, (Pp.z + r.z) / 2, 12, 0xfff0c0, 9, 2); /* metal sparks at the contact point */
          ctx.hitStop(0.07); ctx.fovKick(3.5);
          ctx.puff(V3L(r.x, r.y + 0.8, r.z), V3L(0, 1, 0), 1.4);
          ctx.thud(); ctx.shake(0.4);
        }
        else if (closing > 5 && r.ramCd <= 0) {
          r.ramCd = 0.6;
          r.speed *= -0.3; /* the rival bounces off your bumper too */
          Pv.x += nx * closing * 0.5; Pv.z += nz * closing * 0.5;
          if (S.shield <= 0) { r.hp -= clamp(closing * 0.5, 3, 12); r.lastHitBy = 'YOU'; if (r.hp <= 0) { elimRival(r, 'wreck', 'YOU'); continue; } }
          hitPower(clamp(closing * 0.42, 2, 10), null);
          S.lastHitBy = r.name;
          ctx.onRam(nx, nz, clamp(closing * 0.28, 3, 9));
          ctx.sparks((Pp.x + r.x) / 2, (r.y || 0) + 0.8, (Pp.z + r.z) / 2, 9, 0xffb060, 8, 2);
          ctx.hitStop(0.05);
          ctx.puff(Pp, V3L(0, 0.7, 0), 1.4);
          ctx.thud();
        }
      }
      /* KNOCK-UP: punched / rammed cars briefly leave the deck. Seeing a rival's
         wheels leave the ground is the difference between "I hit them" and "I
         LAUNCHED them". */
      if (r.hopY > 0 || r.hopV > 0) {
        r.hopY += r.hopV * dt; r.hopV -= 24 * dt;
        if (r.hopY <= 0) {
          if (r.hopV < -4) { ctx.puff(V3L(r.x, (r.y || 0) + 0.4, r.z), V3L(0, 0.5, 0), 0.9); ctx.thud(); ctx.shake(0.12); }
          r.hopY = 0; r.hopV = 0;
        }
      }
      r.mesh.position.set(r.x, r.y + 0.04 + r.hopY, r.z);
      r.mesh.rotation.y = r.h;
    }
    S.alive = aliveN + (S.myOut ? 0 : 1);
    /* rival vs rival separation (so they shove, not overlap) */
    for (let i = 0; i < RIV.length; i++) for (let j = i + 1; j < RIV.length; j++) {
      const a = RIV[i], b = RIV[j];
      if (a.elim || b.elim) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 3.6 && d > 0.01) {
        const psh = (3.6 - d) / 2, nx = dx / d, nz = dz / d;
        a.x -= nx * psh; a.z -= nz * psh; b.x += nx * psh; b.z += nz * psh;
        /* shoving costs a bit of HP when fast */
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 12) { const victim = a.speed > b.speed ? b : a; victim.hp -= 2.2; victim.lastHitBy = (victim === a ? b : a).name; if (victim.hp <= 0) elimRival(victim, 'wreck', victim.lastHitBy); }
      }
    }
  }
  function elimRivalVisual(r) { /* rival is mid-fall after elimRival: handled above */ }

  /* ---------- entry / reset ---------- */
  function enter(tier, rivals) {
    S.tier = clamp(tier | 0, 0, SUMO_ARENAS.length - 1);
    S.rivals = clamp(rivals | 0, 3, 5);
    S.matchOver = false; myStars = 0; roundWins = 0;
    S.stars = {}; S.feed = []; S.msg = null; S.myKO = 0; S.myRing = 0;
    build(S.tier);
    buildRivals(S.rivals, S.tier);
    RIV.forEach(r => { S.stars[r.name] = 0; });
    S.stars['YOU'] = 0;
    startRound(1);
    return S.spawn;
  }
  function respawnAt() {
    const Pp = ctx.pPos();
    let best = null, bd = 1e18;
    for (const s2 of spawns) { const d = (s2[0] - Pp.x) ** 2 + (s2[2] - Pp.z) ** 2; if (d < bd) { bd = d; best = s2; } }
    return best ? { x: best[0], z: best[2], y: best[1], h: best[3] } : { x: 0, z: -70, y: 0, h: 0 };
  }

  /* ---------- minimap: fixed full-arena view, prerendered ---------- */
  const mini = { base: document.createElement('canvas'), span: 260 };
  mini.base.width = mini.base.height = 256;
  function buildMiniBase(tier) {
    const g = mini.base.getContext('2d'), s = 256 / mini.span, off = mini.span / 2;
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#04070c'; g.fillRect(0, 0, 256, 256);
    const W2B = (x, z) => [(x + off) * s, (z + off) * s];
    for (const d of decks) {
      const [x, y] = W2B(d.x0, d.z0);
      g.fillStyle = d.y > 3 ? '#3d4a63' : d.y < -3 ? '#232b3a' : '#151d2c';
      g.fillRect(x, y, (d.x1 - d.x0) * s, (d.z1 - d.z0) * s);
      if (d.hx0 !== undefined) { const [hx, hy] = W2B(d.hx0, d.hz0); g.fillStyle = '#04070c'; g.fillRect(hx, hy, (d.hx1 - d.hx0) * s, (d.hz1 - d.hz0) * s); }
    }
    for (const r of ramps) { const [x, y] = W2B(r.x0, r.z0); g.fillStyle = '#2a3446'; g.fillRect(x, y, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s); }
    for (const wl of walls) { if (wl.y1 < 4) continue; const [x, y] = W2B(wl.x0, wl.z0); g.fillStyle = '#54617e'; g.fillRect(x, y, (wl.x1 - wl.x0) * s, (wl.z1 - wl.z0) * s); }
    g.strokeStyle = SUMO_ARENAS[tier].css; g.lineWidth = 3; g.strokeRect(1, 1, 254, 254);
  }
  function drawMini(mc, w, h, pos, hdg) {
    mc.clearRect(0, 0, w, h);
    mc.drawImage(mini.base, 0, 0, 256, 256, 0, 0, w, h);
    const s = w / mini.span, off = mini.span / 2;
    const P2S = (x, z) => [(x + off) * s, (z + off) * s];
    for (const it of items) { const [x, y] = P2S(it.x, it.z); mc.fillStyle = '#' + it.def.col.toString(16).padStart(6, '0'); mc.fillRect(x - 3, y - 3, 6, 6); }
    const flash = (performance.now() * 0.004 | 0) % 2 === 0;
    for (const r of RIV) {
      if (r.elim) continue;
      const [x, y] = P2S(r.x, r.z);
      mc.fillStyle = flash && r.hp < 30 ? '#fff' : r.css; mc.beginPath(); mc.arc(x, y, 5, 0, 7); mc.fill();
      mc.strokeStyle = '#000'; mc.lineWidth = 2; mc.stroke();
    }
    if (!S.myOut) {
      const [x, y] = P2S(pos.x, pos.z);
      mc.save(); mc.translate(x, y); mc.rotate(Math.PI - hdg);
      mc.fillStyle = '#fff'; mc.beginPath(); mc.moveTo(0, -9); mc.lineTo(6.5, 7); mc.lineTo(0, 3.6); mc.lineTo(-6.5, 7); mc.closePath(); mc.fill();
      mc.strokeStyle = '#3cf'; mc.lineWidth = 2.5; mc.stroke(); mc.restore();
    }
  }

  return {
    group, S, SUMO_ARENAS, RIV,
    springs, enter, tick, punch, hitPower, groundAt, collide, slopeAt, drawMini, respawnAt,
    setMerge(f) { mergeGeos = f; },
    get myStars() { return myStars; },
    get roundWins() { return roundWins; },
    get items() { return items; },
    get props() { return props; }
  };
}

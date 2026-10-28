/* Kay Super Racing — MULTIPLAYER (room codes)
   Lobby + live "ghost-sync" racing over Firestore:
   · create a 5-char room code, friends join it
   · host starts the race → every client launches the same track/laps
   · during the race each client streams position snapshots (~400ms);
     remote cars are locally INTERPOLATED ghost cars — they never touch
     the physics, so there is zero stutter, zero desync, zero glitching
   · finish times decide the results; everything degrades gracefully
     offline (multiplayer just stays unavailable) */

import { cloud } from './cloud.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; /* no I/O/0/1 — codes stay readable */
const rand = (a, b) => a + Math.random() * (b - a);
const code5 = () => Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join('');

const N = {
  code: null, uid: null, host: false, room: null, players: [], mySlot: 0,
  unsub: null, pushT: 0, started: false, finT: 0, results: [],
  deps: null, cars: new Map(), clock0: Date.now() - performance.now()
};

/* ---------- remote car rendering (interpolated ghost cars) ---------- */
function makeRemoteCar(p) {
  const d = N.deps;
  const g = d.mkCar(p.car || 'cruiser', p.color || 0x66ddff);
  /* floating name tag */
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const c2 = cv.getContext('2d');
  if (c2.roundRect) { c2.fillStyle = 'rgba(8,12,22,.72)'; c2.beginPath(); c2.roundRect(6, 8, 500, 80, 18); c2.fill(); c2.strokeStyle = 'rgba(120,220,255,.5)'; c2.lineWidth = 3; c2.stroke(); }
  else { c2.fillStyle = 'rgba(8,12,22,.72)'; c2.fillRect(6, 8, 500, 80); c2.strokeStyle = 'rgba(120,220,255,.5)'; c2.lineWidth = 3; c2.strokeRect(6, 8, 500, 80); }
  c2.font = 'italic 900 54px Segoe UI,Arial'; c2.textAlign = 'center'; c2.fillStyle = '#bfeaff';
  c2.fillText(String(p.name || 'RIVAL').slice(0, 12), 256, 66);
  const tag = new d.THREE.Sprite(new d.THREE.SpriteMaterial({ map: new d.THREE.CanvasTexture(cv), transparent: true, depthWrite: false, toneMapped: false }));
  tag.scale.set(7, 1.31, 1); tag.position.y = 3.4; g.add(tag);
  g.visible = false; g.traverse(o => { o.frustumCulled = false; }); d.scene.add(g);
  return { g, tag, cur: null, prev: null, vf: 0, vh: 0, placed: false };
}

/* every snapshot derives a signed forward speed (vf) and turn rate (vh) so
   ghosts DEAD-RECKON along an exact circular arc between packets; the
   renderer exp-smooths toward that predicted target, so remote cars glide
   continuously instead of freeze -> jump -> slide back every 400ms.
   linear tangent extrapolation diverges on corners (the car turns away
   from the tangent) — arcing with the measured turn rate stays on the road. */
const VMAX = 130, WMAX = 3, LAG_S = 14, SNAP2 = 10000; /* m/s · rad/s · smoothing 1/s · 100u snap */
function moveRemote(uid, st, now) {
  const r = N.cars.get(uid); if (!r) return;
  if (r.cur) {
    const raw = (now - r.cur.at) / 1000;
    if (raw >= 0.15 && st.x !== undefined && r.cur.x !== undefined) {
      const dt = Math.max(0.15, raw);
      const h = st.h !== undefined ? st.h : (r.cur.h || 0);
      const vf = ((st.x - r.cur.x) * Math.sin(h) + (st.z - r.cur.z) * Math.cos(h)) / dt; /* signed speed along facing */
      r.vf = vf < -VMAX ? -VMAX : vf > VMAX ? VMAX : vf;
      let dh = (st.h !== undefined && r.cur.h !== undefined) ? st.h - r.cur.h : 0;
      while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      r.vh = dh / dt < -WMAX ? -WMAX : dh / dt > WMAX ? WMAX : dh / dt;
    } /* burst-delivered snapshots (<150ms apart) keep the last good prediction */
  } else { r.vf = 0; r.vh = 0; }
  r.prev = r.cur; r.cur = { ...st, at: now };
  r.g.visible = true;
}

function resetGhosts() { /* fresh placement on every race start — no stale slides */
  for (const [, r] of N.cars) { r.cur = null; r.prev = null; r.vf = 0; r.vh = 0; r.placed = false; r.g.visible = false; }
}

/* project the dead-reckoned spot: arc when turning, straight line otherwise */
function predict(r, age) {
  const h0 = r.cur.h || 0, s = r.vf || 0, w = r.vh || 0;
  if (Math.abs(w) < 0.02 || Math.abs(s) < 0.1) return [r.cur.x + Math.sin(h0) * s * age, r.cur.z + Math.cos(h0) * s * age];
  const R = s / w;
  return [r.cur.x + R * (Math.cos(h0) - Math.cos(h0 + w * age)), r.cur.z + R * (Math.sin(h0 + w * age) - Math.sin(h0))];
}

function stepRemoteCars(dt) {
  const d = N.deps, now = performance.now();
  for (const [, r] of N.cars) {
    if (!r.cur || r.cur.x === undefined) continue;
    /* dead-reckoned target: last real sample carried forward along its arc ·
       age-capped so a lagging ghost coasts to a stop instead of flying off */
    const age = Math.min(1.2, Math.max(0, (now - r.cur.at) / 1000));
    const pr = predict(r, age), tx = pr[0], tz = pr[1];
    const ty = r.cur.y || 0, th = (r.cur.h || 0) + (r.vh || 0) * age;
    if (!r.placed) { r.g.position.set(tx, ty, tz); r.g.rotation.y = th; r.placed = true; }
    else {
      const dx = tx - r.g.position.x, dz = tz - r.g.position.z;
      if (dx * dx + dz * dz > SNAP2) { /* genuine teleport (respawn / join) — snap to the REAL received spot */
        r.g.position.set(r.cur.x, ty, r.cur.z); r.g.rotation.y = r.cur.h || 0; r.vf = 0; r.vh = 0;
      } else { /* frame-rate-independent smoothing — never jumps backwards, never freezes */
        const k = 1 - Math.exp(-dt * LAG_S);
        r.g.position.x += dx * k; r.g.position.z += dz * k; r.g.position.y += (ty - r.g.position.y) * k;
        let dh = th - r.g.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        r.g.rotation.y += dh * Math.min(1, dt * 12);
      }
    }
    r.g.visible = N.started && d.inRace();
    if (r.g.userData.spin) r.g.userData.spin(dt);
  }
}

/* ---------- lobby ---------- */
function renderLobby() {
  const d = N.deps; if (!d) return;
  d.onLobby();
}

export const net = {
  get code() { return N.code; },
  get room() { return N.room; },
  get players() { return N.players; },
  get isHost() { return N.host; },
  get mySlot() { return N.mySlot; },
  get active() { return !!N.code; },

  /* called once from main.js with THREE + scene + car factory + UI hooks */
  init(deps) {
    N.deps = deps;
    if (location.search.includes('turbo')) window.__NETDBG = N; /* dev hook: live ghost inspection */
  },

  async create() {
    if (!this.ready()) return false;
    const code = code5();
    const ok = await cloud.roomCreate(code, {
      host: cloud.user.uid, hostName: this.myName(), status: 'lobby',
      env: N.deps.optEnv(), laps: N.deps.optLaps()
    });
    if (!ok) { N.deps.toast('CLOUD OFFLINE · CANNOT HOST', '#ff7b7b'); return false; }
    this.enter(code, true);
    return true;
  },

  async join(raw) {
    if (!this.ready()) return false;
    const code = String(raw || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
    if (code.length !== 5) { N.deps.toast('CODE IS 5 LETTERS · ASK YOUR FRIEND', '#ffd166'); return false; }
    const ok = await cloud.roomPlayerSet(code, cloud.user.uid, this.myState());
    if (!ok) { N.deps.toast('ROOM NOT FOUND OR CLOUD OFFLINE', '#ff7b7b'); return false; }
    this.enter(code, false);
    return true;
  },

  enter(code, host) {
    this.leave(false);
    N.code = code; N.host = host; N.uid = cloud.user.uid; N.started = false; N.mySlot = 0;
    N.unsub = cloud.roomListen(code, room => {
      N.room = room;
      if (!room) { N.deps.toast('ROOM CLOSED BY HOST', '#ff7b7b'); this.leave(true); return; }
      if (room.status === 'racing' && !N.started) {
        N.started = true;
        resetGhosts();
        N.deps.netGo(room); /* launches the race locally (countdown absorbs skew) */
      }
      if (room.status === 'lobby') N.started = false;
      renderLobby();
    }, players => {
      N.players = players.sort((a, b) => (a.at || 0) - (b.at || 0));
      N.mySlot = Math.max(0, N.players.findIndex(p => p.uid === N.uid));
      /* create / remove remote cars */
      const seen = new Set();
      for (const p of N.players) {
        seen.add(p.uid);
        if (p.uid === N.uid) continue;
        if (!N.cars.has(p.uid)) N.cars.set(p.uid, makeRemoteCar(p));
        if (p.state && p.state.x !== undefined) moveRemote(p.uid, p.state, performance.now());
      }
      for (const [uid, r] of N.cars) if (!seen.has(uid)) { N.deps.scene.remove(r.g); N.cars.delete(uid); }
      renderLobby();
    });
    this.push({ ready: true });
    renderLobby();
  },

  /* host only: change the lap count while everyone waits in the lobby (1-20) */
  async setLaps(n) {
    if (!N.host || !N.code || !N.room || N.room.status !== 'lobby') return;
    n = Math.max(1, Math.min(20, Math.round(n)));
    N.room.laps = n; renderLobby(); /* instant feedback, Firestore echo confirms it */
    await cloud.roomTouch(N.code, { laps: n });
  },

  async start() { /* host only */
    if (!N.host || !N.code) return;
    const laps = (N.room && N.room.laps) || N.deps.optLaps(); /* the lap count the host picked in the lobby */
    await cloud.roomTouch(N.code, { status: 'racing', env: N.deps.optEnv(), laps, goAt: Date.now() + 4500 });
  },

  async backToLobby() { if (N.code) await cloud.roomTouch(N.code, { status: 'lobby' }); },

  /* per-frame live state push: 330ms while racing (smooth ghosts),
     2.5s presence heartbeat in lobby/menu (no wasted quota, no DOM churn) */
  pushNow(state) {
    if (!N.code || !cloud.user) return;
    if (N.busy && state && state.ts) return; /* don't pile up writes on a slow connection */
    N.busy = true;
    Promise.resolve(cloud.roomPlayerSet(N.code, cloud.user.uid, { ...this.myState(), state })).finally(() => { N.busy = false; });
  },
  push(state) { this.pushNow(state); },

  tick(dt, racing, P, raceT, finished) {
    if (!N.code) return;
    stepRemoteCars(dt);
    N.pushT -= dt;
    if (N.pushT > 0 || finished) return;
    N.pushT = racing ? 0.33 : 2.5;
    this.push({ x: P.pos.x, z: P.pos.z, y: P.pos.y, h: P.h, ts: Date.now(), prog: P.prog, fin: !!P.finished, tms: Math.round(raceT * 1000) });
  },

  onFinish(tms, prog) { /* write final result once */
    if (!N.code) return;
    cloud.roomPlayerSet(N.code, cloud.user.uid, { ...this.myState(), state: { fin: true, tms, prog }, fin: true, tms, prog });
    if (N.host) { /* host closes the lobby once everyone is done (or 20s cap) */
      const check = () => {
        const others = N.players.filter(p => p.uid !== N.uid);
        if (others.length && others.every(p => p.fin)) cloud.roomTouch(N.code, { status: 'finished' });
        else setTimeout(check, 2500);
      };
      setTimeout(check, 4000); setTimeout(() => cloud.roomTouch(N.code, { status: 'finished' }).catch(() => { }), 22000);
    }
  },

  leave(ui = true) {
    if (N.unsub) { N.unsub(); N.unsub = null; }
    if (N.code && cloud.user) cloud.roomPlayerDel(N.code, cloud.user.uid);
    if (N.code && N.host) cloud.roomTouch(N.code, { status: 'closed' }).catch(() => { });
    for (const [, r] of N.cars) N.deps.scene.remove(r.g);
    resetGhosts();
    N.cars.clear();
    N.code = null; N.room = null; N.players = []; N.host = false; N.started = false;
    if (ui && N.deps) renderLobby();
  },

  ready() {
    if (!cloud.user || cloud.status !== 'online') { N.deps.toast('MULTIPLAYER NEEDS THE CLOUD · SIGN IN FIRST', '#ffd166'); return false; }
    return true;
  },
  myName() { return N.deps.driverName(); },
  myState() { return { name: this.myName(), car: N.deps.carId(), color: N.deps.carColor() }; },
  uid() { return N.uid; },
  remotes() { const o = []; for (const [uid, r] of N.cars) if (r.placed && r.g.visible) o.push({ uid, x: r.g.position.x, z: r.g.position.z }); return o; },
  /* live race order: finished drivers first (by time), then by track progress */
  standings(me) {
    const rows = [{ uid: N.uid, name: 'YOU', me: true, prog: me.prog, fin: !!me.fin, tms: me.tms || 0 }];
    for (const p of N.players) {
      if (p.uid === N.uid) continue;
      const s = p.state || {};
      rows.push({ uid: p.uid, name: p.name || 'RIVAL', prog: s.prog !== undefined ? s.prog : (p.prog || 0), fin: !!(p.fin || s.fin), tms: p.tms || s.tms || 0 });
    }
    return rows.sort((a, b) => (b.fin - a.fin) || ((a.fin && b.fin) ? a.tms - b.tms : b.prog - a.prog));
  }
};

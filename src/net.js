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

/* ---------- remote car rendering (snapshot-buffer interpolation) ---------- */
function makeRemoteCar(p) {
  const d = N.deps;
  const g = d.mkCar(p.car || 'cruiser', p.color || 0x66ddff);
  if (p.tat && p.tat !== 'none' && d.applyTattoo) d.applyTattoo(g, p.car || 'cruiser', p.tat); /* rival's livery */
  /* floating name tag */
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const c2 = cv.getContext('2d');
  if (c2.roundRect) { c2.fillStyle = 'rgba(8,12,22,.72)'; c2.beginPath(); c2.roundRect(6, 8, 500, 80, 18); c2.fill(); c2.strokeStyle = 'rgba(120,220,255,.5)'; c2.lineWidth = 3; c2.stroke(); }
  else { c2.fillStyle = 'rgba(8,12,22,.72)'; c2.fillRect(6, 8, 500, 80); c2.strokeStyle = 'rgba(120,220,255,.5)'; c2.lineWidth = 3; c2.strokeRect(6, 8, 500, 80); }
  c2.font = 'italic 900 54px Segoe UI,Arial'; c2.textAlign = 'center'; c2.fillStyle = '#bfeaff';
  c2.fillText(String(p.name || 'RIVAL').slice(0, 12), 256, 66);
  const tag = new d.THREE.Sprite(new d.THREE.SpriteMaterial({ map: new d.THREE.CanvasTexture(cv), transparent: true, depthWrite: false, toneMapped: false }));
  tag.scale.set(7, 1.31, 1); tag.position.y = 3.4; g.add(tag);
  /* POWER bar (adventure free-roam): green → red as the rival's car gets wrecked */
  const pbg = new d.THREE.Sprite(new d.THREE.SpriteMaterial({ color: 0x0a0f18, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
  pbg.scale.set(3.3, 0.34, 1); pbg.position.y = 2.2; g.add(pbg);
  const pfill = new d.THREE.Sprite(new d.THREE.SpriteMaterial({ color: 0x35d16a, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  pfill.center.set(0, 0.5); pfill.position.set(-1.55, 2.2, 0.01); pfill.scale.set(3.1, 0.22, 1); g.add(pfill);
  /* shield bubble (synced power-ups): shows while the rival's shield is live */
  const bub = new d.THREE.Mesh(new d.THREE.SphereGeometry(2.7, 18, 12), new d.THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.3, blending: d.THREE.AdditiveBlending, depthWrite: false, side: d.THREE.DoubleSide, toneMapped: false }));
  bub.visible = false; g.add(bub);
  g.visible = false; g.traverse(o => { o.frustumCulled = false; }); d.scene.add(g);
  return { g, tag, bub, pbg, pfill, buf: [], vext: null, placed: false, lastIt: 0, lastPw: 100 };
}

/* SNAPSHOT-BUFFER INTERPOLATION — the same trick that makes AI racers buttery:
   keep the last N received snapshots, render the car on a short clock delay
   (RENDER_DELAY) interpolating between the two samples that bracket the
   delayed "now". Position, height and heading all glide continuously —
   there is no chase-target, so nothing can jump, skip or slide back when
   the next packet lands (Firestore jitter and burst delivery are absorbed
   by the buffer). If packets starve we coast on the last measured velocity,
   decaying to a stop, so a lagging rival never teleports or flies away. */
const BUFN = 12, RENDER_DELAY = 420, VCAP = 135, STARVE = 0.85, TELE2 = 10000;
const clamp2 = (x, a, b) => Math.min(b, Math.max(a, x));
function moveRemote(uid, st, now) {
  const r = N.cars.get(uid); if (!r || st.x === undefined) return;
  r.buf.push({ rt: now, x: st.x, y: st.y || 0, z: st.z, h: st.h || 0 });
  if (r.buf.length > BUFN) r.buf.shift();
  r.g.visible = true;
}

function resetGhosts() { /* fresh placement on every race start — no stale slides */
  for (const [, r] of N.cars) { r.buf = []; r.vext = null; r.placed = false; r.g.visible = false; }
}

const lerpAngle = (a, b, f) => { let dh = b - a; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; return a + dh * f; };

function stepRemoteCars(dt) {
  const d = N.deps, now = performance.now();
  for (const [, r] of N.cars) {
    const b = r.buf; if (!b.length) continue;
    const rt = now - RENDER_DELAY;
    /* newest sample at or before the delayed render clock */
    let i = b.length - 1;
    while (i > 0 && b[i].rt > rt) i--;
    const A = b[i];
    const B = b[i + 1]; /* future sample (may be undefined → starving) */
    if (B) {
      const dxT = B.x - A.x, dzT = B.z - A.z;
      if (dxT * dxT + dzT * dzT > TELE2) { /* genuine teleport (respawn / rejoin) — snap hard */
        r.g.position.set(B.x, B.y, B.z); r.g.rotation.y = B.h; r.vext = null;
      } else {
        const span = Math.max(1, B.rt - A.rt), f = Math.min(1, Math.max(0, (rt - A.rt) / span));
        r.g.position.set(A.x + dxT * f, A.y + (B.y - A.y) * f, A.z + dzT * f);
        const h = lerpAngle(A.h, B.h, f); r.g.rotation.y = h;
        r.vext = { vx: dxT / (span / 1000), vz: dzT / (span / 1000), h, at: now };
      }
    } else {
      /* starved: coast from the newest sample with the last measured velocity,
         decaying so the ghost glides to a halt instead of flying off the map */
      const age = Math.min(STARVE, (rt - A.rt) / 1000);
      const v = r.vext, dec = Math.exp(-age * 1.7);
      if (v && age > 0) {
        r.g.position.set(A.x + Math.max(-VCAP, Math.min(VCAP, v.vx)) * age * dec, A.y, A.z + Math.max(-VCAP, Math.min(VCAP, v.vz)) * age * dec);
        r.g.rotation.y = v.h;
      } else { r.g.position.set(A.x, A.y, A.z); r.g.rotation.y = A.h; }
    }
    r.placed = true;
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
      if (!room) { N.deps.toast('ROOM CLOSED BY HOST', '#ff7b7b'); this.leave(true); if (N.deps.onRoomClosed) N.deps.onRoomClosed(); return; }
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
        const r = N.cars.get(p.uid);
        if (p.state && p.state.x !== undefined) moveRemote(p.uid, p.state, performance.now());
        /* synced power-ups: fire each rival's rocket/oil exactly once (ts dedupe), mirror their shield */
        if (r) {
          const it = p.state && p.state.it;
          if (it && it.ts && r.lastIt !== it.ts) { r.lastIt = it.ts; if (N.deps.onRemoteItem) N.deps.onRemoteItem(p.uid, it, p.name); }
          if (r.bub) r.bub.visible = !!(p.state && p.state.sh > 0);
          /* adventure free-roam: mirror the rival's POWER bar, toast when they get wrecked */
          if (r.pfill && p.state && p.state.pw !== undefined && p.state.pw !== r.lastPw) {
            const pw = clamp2(p.state.pw, 0, 100);
            r.pfill.scale.x = Math.max(0.06, 3.1 * pw / 100);
            r.pfill.material.color.setHSL(0.33 * pw / 100, 0.85, 0.5);
            if (pw <= 0 && r.lastPw > 0) N.deps.toast((p.name || 'RIVAL') + ' GOT WRECKED!', '#ffd166');
            r.lastPw = pw;
          }
          if (r.pbg && r.pfill) { const adv2 = N.room && N.room.mode === 'adv'; r.pbg.visible = r.pfill.visible = !!adv2; }
        }
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

  async start(kind = 'race') { /* host only: kind 'race' = laps on a circuit, 'adv' = free-roam adventure city */
    if (!N.host || !N.code) return;
    const laps = (N.room && N.room.laps) || N.deps.optLaps(); /* the lap count the host picked in the lobby */
    await cloud.roomTouch(N.code, { status: 'racing', env: N.deps.optEnv(), laps, goAt: Date.now() + 4500, mode: kind === 'adv' ? 'adv' : 'race' });
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

  tick(dt, racing, P, raceT, finished, pow) {
    if (!N.code) return;
    stepRemoteCars(dt);
    N.pushT -= dt;
    if (N.pushT > 0 || finished) return;
    N.pushT = racing ? 0.33 : 2.5;
    const d = N.deps;
    const st = { x: P.pos.x, z: P.pos.z, y: P.pos.y, h: P.h, ts: Date.now(), prog: P.prog, fin: !!P.finished, tms: Math.round(raceT * 1000) };
    if (pow !== undefined && pow !== null) st.pw = Math.round(pow); /* adventure free-roam: stream car power */
    if (racing && d.itemEvt) { const it = d.itemEvt(); if (it) st.it = it; if (d.shieldS) st.sh = Math.max(0, Math.ceil(d.shieldS())); } /* synced power-ups ride the existing write — zero extra cost */
    this.push(st);
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
  myState() { return { name: this.myName(), car: N.deps.carId(), color: N.deps.carColor(), tat: N.deps.carTat ? N.deps.carTat() : 'none' }; },
  uid() { return N.uid; },
  remotes() { const o = []; for (const [uid, r] of N.cars) if (r.placed && r.g.visible) { const p = N.players.find(q => q.uid === uid); o.push({ uid, x: r.g.position.x, z: r.g.position.z, h: r.g.rotation.y, vx: r.vext ? r.vext.vx : 0, vz: r.vext ? r.vext.vz : 0, name: p && p.name }); } return o; },
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

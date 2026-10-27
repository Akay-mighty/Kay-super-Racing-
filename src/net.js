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
  deps: null, cars: new Map()
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
  g.visible = false; d.scene.add(g);
  return { g, tag, prev: null, cur: null };
}

function moveRemote(uid, st, now) {
  const r = N.cars.get(uid); if (!r) return;
  r.prev = r.cur; r.cur = { ...st, at: now };
  if (!r.prev) r.prev = r.cur;
  r.g.visible = true;
}

function stepRemoteCars(dt) {
  const d = N.deps;
  for (const [uid, r] of N.cars) {
    if (!r.cur) continue;
    const span = Math.min(0.9, Math.max(0.12, (r.cur.at - r.prev.at) / 1000));
    const t = clamp01((performance.now() - r.cur.at) / 1000 / span * 0.85);
    let x = r.prev.x + (r.cur.x - r.prev.x) * t, z = r.prev.z + (r.cur.z - r.prev.z) * t;
    /* snap on teleport (respawn / join) */
    if ((x - r.g.position.x) ** 2 + (z - r.g.position.z) ** 2 > 3600) { x = r.cur.x; z = r.cur.z; }
    r.g.position.set(x, r.cur.y || 0, z);
    let dh = r.cur.h - r.prev.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    r.g.rotation.y = r.prev.h + dh * t;
    r.g.visible = N.started && d.inRace();
  }
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

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
  init(deps) { N.deps = deps; },

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

  async start() { /* host only */
    if (!N.host || !N.code) return;
    await cloud.roomTouch(N.code, { status: 'racing', env: N.deps.optEnv(), laps: N.deps.optLaps(), goAt: Date.now() + 4500 });
  },

  async backToLobby() { if (N.code) await cloud.roomTouch(N.code, { status: 'lobby' }); },

  /* per-frame live state push (throttled to ~400ms — cheap + smooth) */
  pushNow(state) {
    if (!N.code || !cloud.user) return;
    cloud.roomPlayerSet(N.code, cloud.user.uid, { ...this.myState(), state });
  },
  push(state) { this.pushNow(state); },

  tick(dt, racing, P, raceT, finished) {
    if (!N.code) return;
    stepRemoteCars(dt);
    N.pushT -= dt;
    if (N.pushT <= 0 && !finished) {
      N.pushT = 0.4;
      this.push({ x: P.pos.x, z: P.pos.z, y: P.pos.y, h: P.h, prog: P.prog, fin: !!P.finished, tms: Math.round(raceT * 1000) });
    }
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
  uid() { return N.uid; }
};

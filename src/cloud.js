/* Kay Super Racing — cloud backend (Firebase)
   Cross-device player profiles, global leaderboards, ghost-rival storage and
   admin cash grants. EVERY call degrades gracefully: if Firebase is not
   reachable (or not configured) the game keeps working 100% from localStorage
   and the badge shows CLOUD OFFLINE. */

const CFG = {
  apiKey: "AIzaSyDLtN-f1f5rxruQvyw3ZhxXeKcsxm5AI1w",
  authDomain: "kay-super-racing.firebaseapp.com",
  projectId: "kay-super-racing",
  storageBucket: "kay-super-racing.firebasestorage.app",
  messagingSenderId: "962214807193",
  appId: "1:962214807193:web:891498bea6272c22ea1a08",
  measurementId: "G-3TYSZTMQFS"
};

const S = { on: false, status: 'boot', listeners: [], db: null, lastErr: '' };
const setStatus = s => { S.status = s; S.listeners.forEach(cb => { try { cb(s); } catch (e) { } }); };
const emitErr = e => { S.lastErr = (e && e.code) || String(e); setStatus('offline'); };

/* all public calls go through guard(): any failure flips the badge offline
   and resolves to the fallback value so gameplay never breaks */
async function guard(fn, fallback) {
  if (!S.on) return fallback;
  try { return await fn(); }
  catch (e) { emitErr(e); return fallback; }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export const cloud = {
  get status() { return S.status; },
  get lastErr() { return S.lastErr; },
  onStatus(cb) { S.listeners.push(cb); if (S.status !== 'boot') cb(S.status); },

  /* lazy-load the SDK (code-split chunk), init app + try anonymous auth */
  async init() {
    if (S.status === 'online' || S.status === 'connecting') return S.status;
    setStatus('connecting');
    try {
      const [{ initializeApp, getApps }, { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, runTransaction, addDoc, serverTimestamp },
        { getAuth, signInAnonymously }] =
        await Promise.all([import('firebase/app'), import('firebase/firestore'), import('firebase/auth')]);
      const app = getApps().length ? getApps()[0] : initializeApp(CFG);
      S.db = getFirestore(app);
      S._fns = { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, runTransaction, addDoc, serverTimestamp };
      let authed = false;
      try { await withTimeout(signInAnonymously(getAuth(app)), 9000); authed = true; } catch (e) { S.lastErr = (e && e.code) || 'anon-auth'; }
      /* probe firestore reachability with a tiny read (bypasses guard(): S.on is still false here) */
      let probe = null;
      try { probe = await withTimeout(getDoc(doc(S.db, 'boards', 'probe')), 8000); } catch (e) { S.lastErr = (e && e.code) || String(e); }
      if (probe !== null || authed) { S.on = true; setStatus('online'); }
      else { setStatus('offline'); }
    } catch (e) { emitErr(e); }
    return S.status;
  },

  /* ---------- player profiles (players/{NAME}) ---------- */
  name(raw) {
    const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
    return s || 'KAY';
  },

  async pullProfile(name) {
    return guard(async () => {
      const { doc, getDoc } = S._fns;
      const snap = await withTimeout(getDoc(doc(S.db, 'players', cloud.name(name))), 8000);
      return snap.exists() ? snap.data() : null;
    }, null);
  },

  async pushProfile(name, data) {
    return guard(async () => {
      const { doc, setDoc, serverTimestamp } = S._fns;
      await withTimeout(setDoc(doc(S.db, 'players', cloud.name(name)), { ...data, name: cloud.name(name), updatedAt: serverTimestamp() }, { merge: true }), 9000);
      return true;
    }, false);
  },

  /* admin cash grant: transaction so concurrent grants never lose money */
  async grantCash(name, amount, by) {
    return guard(async () => {
      const { doc, runTransaction, addDoc, collection, serverTimestamp } = S._fns;
      const ref = doc(S.db, 'players', cloud.name(name));
      return withTimeout(runTransaction(S.db, async tx => {
        const snap = await tx.get(ref);
        const cur = snap.exists() ? (snap.data().money || 0) : 0;
        const next = Math.max(0, cur + Math.round(amount));
        tx.set(ref, { name: cloud.name(name), money: next, updatedAt: serverTimestamp() }, { merge: true });
        return next;
      }), 9000).then(async total => {
        try { await addDoc(collection(S.db, 'grants'), { target: cloud.name(name), amount: Math.round(amount), by: by || 'admin', at: serverTimestamp() }); } catch (e) { }
        return total;
      });
    }, null);
  },

  /* top players by cash (single-field index, no composite needed) */
  async topPlayers(n = 10) {
    return guard(async () => {
      const { collection, query, orderBy, limit, getDocs } = S._fns;
      const snap = await withTimeout(getDocs(query(collection(S.db, 'players'), orderBy('money', 'desc'), limit(n))), 8000);
      return snap.docs.map(d => d.data());
    }, []);
  },

  /* ---------- leaderboards (boards/{cat}.entries, capped at 20) ---------- */
  async submitScore(cat, entry, isTime) {
    return guard(async () => {
      const { doc, runTransaction, serverTimestamp } = S._fns;
      const ref = doc(S.db, 'boards', cat);
      await withTimeout(runTransaction(S.db, async tx => {
        const snap = await tx.get(ref);
        const entries = (snap.exists() && snap.data().entries) || [];
        entries.push({ ...entry, date: Date.now() });
        entries.sort((a, b) => isTime ? a.val - b.val : b.val - a.val);
        tx.set(ref, { entries: entries.slice(0, 20), updated: serverTimestamp() }, { merge: true });
      }), 9000);
      return true;
    }, false);
  },

  async fetchBoard(cat) {
    return guard(async () => {
      const { doc, getDoc } = S._fns;
      const snap = await withTimeout(getDoc(doc(S.db, 'boards', cat)), 8000);
      return (snap.exists() && snap.data().entries) || [];
    }, null); /* null = board unreachable; [] = empty board */
  },

  /* ---------- ghosts ---------- */
  async uploadGhost(cat, name, car, color, flat) {
    return guard(async () => {
      const { collection, addDoc } = S._fns;
      const ref = await withTimeout(addDoc(collection(S.db, 'ghosts'), { cat, name: cloud.name(name), car, color, flat, date: Date.now() }), 12000);
      return ref.id;
    }, null);
  },

  async fetchGhost(id) {
    return guard(async () => {
      const { doc, getDoc } = S._fns;
      const snap = await withTimeout(getDoc(doc(S.db, 'ghosts', id)), 9000);
      return snap.exists() ? snap.data() : null;
    }, null);
  }
};

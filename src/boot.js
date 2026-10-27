/* Kay Super Racing — V5 "IGNITION" boot flow
   1) Animated logo splash (speed streaks -> logo pop -> star twinkle -> shine sweep -> TAP TO START)
   2) Account gate: sign in / create account (email+password) / Google, or play offline
   Game keeps working 100% offline if the player skips or Firebase is unreachable. */

import { cloud } from './cloud.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

const AUTH_ERR = {
  'auth/invalid-email': 'INVALID EMAIL ADDRESS',
  'auth/missing-password': 'ENTER YOUR PASSWORD',
  'auth/user-disabled': 'ACCOUNT DISABLED',
  'auth/user-not-found': 'NO ACCOUNT WITH THAT EMAIL',
  'auth/wrong-password': 'WRONG PASSWORD',
  'auth/invalid-credential': 'WRONG EMAIL OR PASSWORD',
  'auth/invalid-login-credentials': 'WRONG EMAIL OR PASSWORD',
  'auth/configuration-not-found': 'AUTHENTICATION IS NOT SET UP IN FIREBASE CONSOLE',
  'auth/invalid-api-key': 'INVALID FIREBASE API KEY',
  'auth/internal-error': 'FIREBASE INTERNAL ERROR · RETRY',
  'auth/operation-not-supported-in-this-environment': 'THIS BROWSER BLOCKS GOOGLE SIGN-IN · OPEN IN CHROME',
  'auth/web-storage-unsupported': 'ENABLE COOKIES / SITE DATA FOR THIS SITE',
  'auth/email-already-in-use': 'ACCOUNT EXISTS · USE SIGN IN',
  'auth/weak-password': 'PASSWORD TOO WEAK · 6+ CHARACTERS',
  'auth/too-many-requests': 'TOO MANY TRIES · WAIT A MOMENT',
  'auth/network-request-failed': 'NETWORK ERROR · CHECK CONNECTION',
  'auth/popup-closed-by-user': 'GOOGLE WINDOW CLOSED',
  'auth/popup-blocked': 'POPUP BLOCKED · ALLOW POPUPS AND RETRY',
  'auth/cancelled-popup-request': 'GOOGLE WINDOW CLOSED',
  'auth/unauthorized-domain': 'THIS DOMAIN IS NOT ALLOWED · ADD IT IN FIREBASE CONSOLE',
  'auth/operation-not-allowed': 'ENABLE THIS SIGN-IN METHOD IN FIREBASE CONSOLE',
  'auth/admin-restricted-operation': 'SIGN-UPS DISABLED IN FIREBASE CONSOLE',
  timeout: 'NO RESPONSE FROM FIREBASE · CHECK DATA/WIFI AND RETRY'
};
const errCode = e => (e && e.code) || (e && e.message === 'timeout' ? 'timeout' : '');
const errText = e => {
  const c = errCode(e);
  if (c.startsWith('auth/requests-from-referer')) return 'API KEY BLOCKS THIS SITE · ALLOW IT IN GOOGLE CLOUD CONSOLE';
  return AUTH_ERR[c] || ('SIGN-IN FAILED · ' + String(c || (e && e.message) || 'UNKNOWN').slice(0, 44).toUpperCase());
};
const showErr = e => { $('gErr').textContent = e ? errText(e) : ''; const gc = $('gCode'); if (gc) gc.textContent = e ? 'CODE · ' + (errCode(e) || 'none').slice(0, 80) : ''; };

/* ---------- SPLASH ---------- */
function splash(hooks) {
  return new Promise(resolve => {
    const boot = $('boot');
    let closed = false;
    const done = () => {
      if (closed) return; closed = true;
      if (hooks.rev) { try { hooks.rev(); } catch (e) { } }
      boot.classList.remove('run', 'ready');
      boot.classList.add('out');
      setTimeout(() => { boot.remove(); resolve(); }, 520);
    };
    /* force reflow so the run animations always restart */
    void boot.offsetWidth;
    boot.classList.add('run');
    const readyT = setTimeout(() => boot.classList.add('ready'), 1550);
    boot.addEventListener('pointerdown', () => { clearTimeout(readyT); done(); }, { once: true });
    const key = e => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { clearTimeout(readyT); done(); removeEventListener('keydown', key); }
    };
    addEventListener('keydown', key);
    if (new URLSearchParams(location.search).has('noboot')) { clearTimeout(readyT); done(); }
  });
}

/* ---------- ACCOUNT GATE ---------- */
function gate(hooks, autoP) {
  return new Promise(resolve => {
    const g = $('gate'), err = $('gErr'), go = $('gGo'), gg = $('gGoogle'), skip = $('gSkip');
    let mode = 'in', left = false;
    g.classList.remove('hide', 'out'); $('gPass').value = ''; showErr(cloud.redirectErr); cloud.clearRedirectErr();
    /* a saved session may land while the card is up — close and enter automatically */
    if (autoP) autoP.then(u => { if (u && !left) finish('auth'); }).catch(() => { });
    const tabs = [...g.querySelectorAll('.gtabs button')];
    const setMode = m => {
      mode = m;
      tabs.forEach(b => b.classList.toggle('on', b.dataset.t === m));
      go.textContent = m === 'in' ? 'SIGN IN' : 'CREATE ACCOUNT';
      $('gPass').setAttribute('autocomplete', m === 'in' ? 'current-password' : 'new-password');
      showErr(null);
    };
    tabs.forEach(b => b.onclick = () => setMode(b.dataset.t));
    setMode('in');
    const busy = on => { go.disabled = gg.disabled = skip.disabled = on; g.classList.toggle('wait', on); };
    const finish = how => {
      if (left) return; left = true;
      g.classList.add('out');
      setTimeout(() => { g.classList.add('hide'); g.classList.remove('out'); resolve(how); }, 420);
    };
    const afterAuth = async email => {
      /* upgrade the default driver name from the account once (custom names are never touched) */
      const cur = store.get('sr.name', null);
      if (!cur || cur === 'KAY') store.set('sr.name', cloud.name(String(email || '').split('@')[0] || 'KAY'));
      await finish('auth');
    };
    go.onclick = async () => {
      const email = $('gEmail').value.trim(), pass = $('gPass').value;
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'ENTER A VALID EMAIL'; return; }
      if (pass.length < 6) { err.textContent = 'PASSWORD NEEDS 6+ CHARACTERS'; return; }
      busy(true); showErr(null);
      go.textContent = mode === 'in' ? 'SIGNING IN\u2026' : 'CREATING\u2026';
      try {
        if (mode === 'in') await cloud.signIn(email, pass); else await cloud.signUp(email, pass);
        busy(false); await afterAuth(cloud.email || email);
      } catch (e) { busy(false); setMode(mode); showErr(e); }
    };
    gg.onclick = async () => {
      busy(true); showErr(null);
      try { await cloud.google(); busy(false); await afterAuth(cloud.email); }
      catch (e) { busy(false); showErr(e); }
    };
    skip.onclick = () => finish('skip');
    [$('gEmail'), $('gPass')].forEach(i => { i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') go.click(); }; });
    setTimeout(() => $('gEmail').focus(), 350);
  });
}

/* ---------- ORCHESTRATOR ---------- */
export async function bootFlow(hooks) {
  /* warm the Firebase SDK while the splash plays — never blocks the gate */
  const preloadP = Promise.race([cloud.preload().catch(() => { }), new Promise(res => setTimeout(res, 9000))]);
  await splash(hooks);
  /* brief grace period: a returning player's saved session restores in well under a second */
  await Promise.race([preloadP, new Promise(res => setTimeout(res, 1100))]);
  /* returning player with a live session? straight to the grid */
  if (cloud.user) {
    try { await cloud.init(); window.dispatchEvent(new Event('ksr-auth')); } catch (e) { }
    hooks.enter();
    return;
  }
  const how = await gate(hooks, preloadP.then(() => cloud.user));
  if (how === 'auth') {
    try { await preloadP; await cloud.init(); window.dispatchEvent(new Event('ksr-auth')); } catch (e) { }
  }
  hooks.enter();
}

/* re-open the account card later (Settings / Multiplayer) */
export async function openGate() {
  await Promise.race([cloud.preload().catch(() => { }), new Promise(res => setTimeout(res, 9000))]);
  const how = await gate({}, null);
  if (how === 'auth') { try { await cloud.init(); } catch (e) { } window.dispatchEvent(new Event('ksr-auth')); }
  return how;
}

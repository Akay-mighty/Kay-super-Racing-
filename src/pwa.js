/* Kay Super Racing — app install + offline updates.
   · registers the service worker (production only)
   · shows "UPDATE READY" when a new version has been downloaded (never reloads mid-race by itself)
   · INSTALL APP button in Settings (Android/desktop) and an Add-to-Home-Screen hint for iPhone/iPad */
const $ = id => document.getElementById(id);
const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- install ---------- */
let deferred = null;
function installUI() {
  const btn = $('btnInstall'), hint = $('iosHint'), note = $('appNote'); if (!btn) return;
  const installed = standalone();
  btn.style.display = deferred && !installed ? '' : 'none';
  if (hint) hint.style.display = isIOS && !installed ? '' : 'none';
  if (note) note.style.display = installed ? '' : 'none';
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; installUI(); });
window.addEventListener('appinstalled', () => { deferred = null; installUI(); });
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('#btnInstall'); if (!b || !deferred) return;
  deferred.prompt();
  try { await deferred.userChoice; } catch (err) { /* ignore */ }
  deferred = null; installUI();
});
installUI();

/* ---------- service worker + updates ---------- */
let wantReload = false;
function showUpdate(worker) {
  const bar = $('updBar'); if (!bar) return;
  bar.classList.add('on');
  $('updGo').onclick = () => { wantReload = true; $('updGo').textContent = 'UPDATING…'; worker.postMessage({ type: 'SKIP_WAITING' }); };
  $('updLater').onclick = () => bar.classList.remove('on');
}
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) location.reload(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      const check = () => reg.update().catch(() => { });
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(() => { /* app still works online without it */ });
  });
}

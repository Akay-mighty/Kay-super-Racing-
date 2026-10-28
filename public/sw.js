/* Kay Super Racing — service worker: installable app + offline play.
   VERSION and PRECACHE are filled in at build time by vite.config.js. */
const VERSION = '__BUILD__';
const PRECACHE = /*__PRECACHE__*/[];
const SHELL = 'ksr-shell-' + VERSION;   /* app files for this build */
const RUNTIME = 'ksr-runtime-v1';       /* fonts and other extras */
const CORE = ['/', '/index.html', '/manifest.json'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    /* one failed file must not break the whole install */
    await Promise.all([...new Set([...CORE, ...PRECACHE])].map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { })));
  })());
  /* no skipWaiting here: the page asks for it so a race is never reloaded by surprise */
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('ksr-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  try { const res = await fetch(req); if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone()); return res; }
  catch (err) { const hit = await caches.match(req); if (hit) return hit; throw err; }
}
async function navigate(req) {
  try {
    const res = await timeout(fetch(req), 4000);
    if (res.ok) (await caches.open(SHELL)).put('/index.html', res.clone());
    return res;
  } catch (err) {
    return (await caches.match('/index.html', { ignoreSearch: true })) || (await caches.match('/')) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(RUNTIME), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (url.origin !== location.origin) return;                 /* Firebase, Google sign-in, APIs: always straight to the network */
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/admin') || url.pathname.startsWith('/__/')) return;
  if (req.mode === 'navigate') { e.respondWith(navigate(req)); return; }
  if (/^\/(assets|icons|logos)\//.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req));
});

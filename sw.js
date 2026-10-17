// Offline support. App files: stale-while-revalidate (instant start, updates arrive on the next launch).
// Voice clips and fonts: cache-first (they never change for a given file name).
const VERSION = 'v1.7.0';
const SHELL = `shell-${VERSION}`, MEDIA = 'media-v1';
const SHELL_FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/db.js', 'js/seed.js', 'js/engine.js', 'js/audio.js', 'js/player.js', 'js/builder.js', 'js/library.js', 'js/history.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'voice/index.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isMedia = url.pathname.includes('/voice/') && url.pathname.endsWith('.mp3') || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (isMedia) {
    e.respondWith(caches.open(MEDIA).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.searchParams.has('check')) return; // update checks always go to the network
  e.respondWith(caches.open(SHELL).then(async c => {
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(key, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503 });
  }));
});

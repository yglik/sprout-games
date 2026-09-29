/* Sprout Games service worker: the games keep working with no network,
   but a fresh deploy still wins over the cache for pages. */
const CACHE = 'sprout-games-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './games/garden-pick/index.html',
  './games/garden-pick/img/tomato.png',
  './games/garden-pick/img/strawberry.png',
  './games/garden-pick/img/pepper.png',
  './games/garden-pick/img/watermelon.png',
  './games/garden-pick/instructions.m4a',
  './games/garden-pick/tomato.m4a',
  './games/garden-pick/strawberry.m4a',
  './games/garden-pick/pepper.m4a',
  './games/garden-pick/watermelon.m4a',
  './games/count-fruits/index.html',
  './games/poster-paint/index.html',
  './games/hebrew-letters/index.html',
  './games/hebrew-letters/audio/letters.json',
  './games/hebrew-letters/audio/alef.m4a',
  './games/hebrew-letters/audio/ayin.m4a',
  './games/hebrew-letters/audio/bet.m4a',
  './games/hebrew-letters/audio/dalet.m4a',
  './games/hebrew-letters/audio/gimel.m4a',
  './games/hebrew-letters/audio/he.m4a',
  './games/hebrew-letters/audio/het.m4a',
  './games/hebrew-letters/audio/kaf.m4a',
  './games/hebrew-letters/audio/lamed.m4a',
  './games/hebrew-letters/audio/mem.m4a',
  './games/hebrew-letters/audio/nun.m4a',
  './games/hebrew-letters/audio/pe.m4a',
  './games/hebrew-letters/audio/qof.m4a',
  './games/hebrew-letters/audio/resh.m4a',
  './games/hebrew-letters/audio/samekh.m4a',
  './games/hebrew-letters/audio/shin.m4a',
  './games/hebrew-letters/audio/tav.m4a',
  './games/hebrew-letters/audio/tet.m4a',
  './games/hebrew-letters/audio/tsadi.m4a',
  './games/hebrew-letters/audio/vav.m4a',
  './games/hebrew-letters/audio/yod.m4a',
  './games/hebrew-letters/audio/zayin.m4a'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  // pages: network first, so a new deploy shows up right away
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // everything else: cache first, refreshed in the background
  event.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

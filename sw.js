const CACHE = 'cricket-3d-v8';
const FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/gameEngine.js',
  '/bat.glb'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy so updates land immediately
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).then((netRes) => {
      if (netRes && netRes.status === 200 && e.request.method === 'GET') {
        const clone = netRes.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
      }
      return netRes;
    }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
  );
});

const CACHE = 'senai-vyuham-shell-v1';
const STATIC_TYPES = new Set(['style', 'script', 'image', 'font', 'audio']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/')));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put('/', copy));
      return response;
    }).catch(() => caches.match('/')));
    return;
  }

  if (!STATIC_TYPES.has(request.destination)) return;
  event.respondWith(caches.match(request).then((cached) => {
    const fresh = fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    });
    return cached || fresh;
  }));
});

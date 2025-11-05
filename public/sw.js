const CACHE_NAME = 'domain-sw-v1';
const RUNTIME_CACHE = 'runtime-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => {
      if (![CACHE_NAME, RUNTIME_CACHE].includes(k)) return caches.delete(k);
    })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const isImage = url.pathname.startsWith('/image/') && (request.method === 'GET');
  const isImagesList = url.pathname === '/image/images.json' && (request.method === 'GET');

  if (!(isImage || isImagesList)) return;

  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (e) {
      if (cached) return cached;
      throw e;
    }
  })());
});



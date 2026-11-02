const CACHE_NAME = 'dropspend-v17';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './spec-ui.js',
  './parser.js',
  './sync.js',
  './insights.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (
    request.url.includes('script.google.com') ||
    request.url.includes('googleusercontent.com') ||
    request.url.includes('counterapi.dev')
  ) {
    return;
  }

  // Network-first with offline cache fallback so new git pushes appear immediately when online
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

const CACHE_NAME = 'dropspend-v35';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './spec-ui.js',
  './native-bridge.js',
  './parser.js',
  './sync.js',
  './insights.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
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
    request.url.includes('counterapi.dev') ||
    request.url.includes('api.github.com') ||
    request.url.includes('raw.githubusercontent.com')
  ) {
    return;
  }

  // Stale-while-revalidate for static assets: serves instantly from local cache (0ms, zero battery radio wake)
  // and silently refreshes cache in background only when online
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);
        return cachedResponse || fetchPromise;
      })
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || './?utility=1';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'DROPSPEND_NOTIFICATION_CLICK',
            tab: event.notification?.data?.tab || 'utility'
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

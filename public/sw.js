// TheDeepSleepers service worker.
// Makes the app installable and lets the app shell open offline.
// Only same-origin GET requests are cached, so Supabase and other API calls always go to the network.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `deep-sleepers-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/deep-sleepers-logo.jpg',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('deep-sleepers-') && key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: try the network first so deploys show up, fall back to the cached app shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error())),
    );
    return;
  }

  // Hashed build assets are immutable, so serve from cache when present and cache new ones as they load.
  // Everything else is network-first with a cached fallback.
  const isBuildAsset = url.pathname.startsWith('/assets/');
  event.respondWith(
    (isBuildAsset
      ? caches.match(request).then((cached) => cached || fetchAndCache(request))
      : fetchAndCache(request).catch(() => caches.match(request))
    ).catch(() => Response.error()),
  );
});

function fetchAndCache(request) {
  return fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

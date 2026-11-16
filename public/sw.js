// QuickPrint Service Worker for Installable PWA
// v15: network-first so design/code updates show up immediately on installed apps.
const CACHE_NAME = 'quickprint-v33';
const ASSETS_TO_CACHE = [
  '/',
  '/admin.html',
  '/admin',
  '/owner',
  '/owner.html',
  '/order',
  '/order.html',
  '/customer.css',
  '/style.css',
  '/app.js',
  '/agent.js',
  '/platform.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Don't fail the whole install if one asset is temporarily missing.
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOldCache = keys.some((key) => key !== CACHE_NAME);

    await Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    );

    await self.clients.claim();

    // Upgrading from the old cache-first worker: refresh open app windows once
    // so the new design appears without the user having to reinstall.
    if (hadOldCache) {
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) {
        try { await client.navigate(client.url); } catch (e) { /* ignore */ }
      }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin GET requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // APIs, uploads and the worker script itself always go straight to network.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname === '/sw.js'
  ) {
    return;
  }

  // Network-first: always prefer fresh HTML/CSS/JS, fall back to cache offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;

        if (request.mode === 'navigate') {
          const fallback = await caches.match('/order');
          if (fallback) return fallback;
        }
        return Response.error();
      })
  );
});

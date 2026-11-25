// Best Auto Parts CRM — Production Progressive Web App Service Worker
const CACHE_NAME = 'bap-crm-v1';
const PRECACHE_ASSETS = [
  '/offline',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
];

// Install Event — Pre-cache static fallback assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[PWA SW] Precache warning:', err))
  );
});

// Activate Event — Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch Event — Network-First for dynamic/API/navigation, Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never cache non-GET requests (e.g. POST to Meta webhook or Supabase mutations)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Network-First for API routes, Supabase endpoints, and auth flows
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/auth/')
  ) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline mode: internet connection unavailable' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // 3. Navigation requests (HTML pages) — Network-First with /offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If successful response, return it immediately
          return response;
        })
        .catch(async () => {
          // If network failed, serve the pre-cached offline page
          const cache = await caches.open(CACHE_NAME);
          const cachedOffline = await cache.match('/offline');
          return cachedOffline || Response.error();
        })
    );
    return;
  }

  // 4. Cache-First for static assets (icons, Next.js static bundles, images)
  const isStaticAsset =
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/favicon-32x32.png' ||
    url.pathname.startsWith('/parts/');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 5. Default fallback — Network first with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

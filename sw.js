const CACHE_NAME = 'lomitos-fsa-v17';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/utils.js',
  '/assets/logoheader.jpeg',
  '/assets/background.jpeg',
  '/assets/ilustrativo.jpeg',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@300;400;600;800&display=swap'
];

// Install — cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch — Network first para HTML (el cliente siempre recibe la versión nueva
// al estar en línea), Cache first para assets (carga rápida y offline)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache Google Sheets CSV — always fetch fresh
  if (url.hostname.includes('google.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // NAVEGACIONES (HTML): network-first → evita el bug de "cambié el código
  // pero el celular sigue mostrando la versión vieja" por caché del SW
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        // Solo cachear respuestas OK (evita envenenar el caché con 404s)
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }).then((cached) =>
        // Fallback offline: resolver ./index.html dentro del scope del SW
        // (la URL absoluta '/index.html' apuntaría fuera del sitio en GitHub Pages)
        cached || caches.match(new URL('./index.html', self.registration.scope))
      ))
    );
    return;
  }

  // Assets: cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        // Cache new assets dynamically
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );
});

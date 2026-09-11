const CACHE_NAME = 'lomitos-fsa-v19';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',

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

// ── Helpers de estrategia ──────────────────────────────────────────────
// Cache-first: instantáneo y disponible offline. Solo para assets que
// prácticamente no cambian (imágenes, íconos, fuentes).
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    });
  });
}

// Network-first con timeout: el cliente recibe SIEMPRE el código nuevo
// mientras tenga red, así el HTML nuevo nunca corre contra un app.js viejo
// del caché. El caché queda solo como respaldo (red lenta u offline).
function networkFirst(request, timeoutMs) {
  const red = fetch(request).then((response) => {
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  });

  // Si la red tarda demasiado, no colgamos la pantalla: tiramos de caché.
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), timeoutMs));

  return Promise.race([red, timeout]).catch(() =>
    caches.match(request).then((cached) => cached || red)
  );
}

// Fetch — Network first para HTML y para el código (JS/CSS), así el cliente
// siempre recibe la versión nueva estando en línea. Cache first solo para
// assets que casi no cambian (imágenes, íconos, fuentes).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache Google Sheets CSV — always fetch fresh
  if (url.hostname.includes('google.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Never cache API requests — always go to network so admin
  // changes are reflected immediately on the landing page.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
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

  // CÓDIGO (JS/CSS): network-first. Es la pieza clave para que un deploy
  // llegue solo: el HTML nuevo nunca se ejecuta contra un app.js viejo
  // guardado en caché (era la causa de que el checkout se trabara).
  if (url.origin === self.location.origin && /\.(?:js|css)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(event.request, 3000));
    return;
  }

  // Assets (imágenes, íconos, fuentes): cache first, fallback to network
  event.respondWith(cacheFirst(event.request));
});

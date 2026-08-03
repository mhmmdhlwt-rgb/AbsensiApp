// Service Worker — Absensi Santri PWA
// Strategi:
// - App shell (index.html, manifest.json, icons): cache-first dengan background update
// - API Firebase & font Google: network-only (selalu fresh)
// - Navigasi: network-first, fallback ke cache
const CACHE_VERSION = 'absensi-santri-islami-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap'
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.all(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Cache failed:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate: cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Skip non-GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip Firebase/Firestore API, gstatic SDK, & Cloudflare analytics (always network)
  if (url.hostname.includes('firebasedatabase.app') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebaseinstallations.googleapis.com') ||
      url.hostname === 'www.gstatic.com' ||
      url.hostname.includes('cloudflareinsights.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Navigasi (HTML pages): network-first, fallback to cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put('./index.html', copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Google Fonts CSS: cache-first with update
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Static assets (icons, manifest): cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|json|woff2)$/i) ||
      url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        return cached || fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        });
      })
    );
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

// Handle messages from page (for skipWaiting trigger)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

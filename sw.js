// Service Worker — Pesantrenku PWA
// Strategi:
// - App shell (index.html, manifest.json, icons): cache-first dengan background update
// - API Firebase & font Google: network-only (selalu fresh)
// - Navigasi: network-first, fallback ke cache
// ── AUDIT FIX v2: ──
//   1. Version bump supaya semua client yang ada langsung ambil SW baru.
//   2. Tambah `message` handler yang memicu skipWaiting + clients.claim
//      lewat postMessage('SKIP_WAITING') — dipakai oleh helper _notifySwUpdate
//      di index.html. Tanpa ini, user harus tutup semua tab untuk update.
//   3. Navigasi fallback: jika network gagal DAN tidak ada cache, tampilkan
//      halaman offline minimal (bukan layar putih).
const CACHE_VERSION = 'pesantrenku-v29-phase8-flat-nosplit-revisions';
const OFFLINE_URL = './index.html'; // fallback — sama dengan app shell
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/js/phase3-revision.js',
  './assets/js/phase4-design-system.js',
  './assets/js/phase5-polish-stability.js',
  './assets/js/phase6-academic-profile-reports.js',
  './assets/js/phase7-integrity-quicknotes.js',
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

  // ── FASE 3 AUDIT FIX: Runtime caching untuk Firebase Storage ──
  // Gambar profil santri/users disimpan di Firebase Storage (firebasestorage.app).
  // Sebelumnya, gambar ini di-fetch ulang dari network setiap kali halaman
  // dirender — boros bandwidth dan lambat di jaringan 3G. Sekarang pakai
  // strategi StaleWhileRevalidate: tampilkan dari cache dulu (instant), lalu
  // update di background untuk next render. Cache di-batasi 50 entries,
  // max age 30 hari (gambar profil jarang berubah).
  if (url.hostname.includes('firebasestorage.app') ||
      url.hostname.includes('firebasestorage.googleapis.com')) {
    event.respondWith(
      caches.open('absensi-img-cache-v1').then(cache => {
        return cache.match(req).then(cached => {
          // Revalidate di background
          const fetchPromise = fetch(req).then(res => {
            // Hanya cache response OK (200) dan metode GET
            if (res && res.ok && res.status === 200) {
              const copy = res.clone();
              cache.put(req, copy).catch(()=>{});
              // Cleanup old entries jika cache > 50
              cache.keys().then(keys => {
                if (keys.length > 50) {
                  // Hapus 10 entry tertua (FIFO)
                  keys.slice(0, 10).forEach(k => cache.delete(k).catch(()=>{}));
                }
              }).catch(()=>{});
            }
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
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

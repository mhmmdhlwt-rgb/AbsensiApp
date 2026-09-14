/* Pesantrenku Service Worker — cache PWA, media, dan push notification.
   Data Firestore tidak pernah di-cache di sini: absensi tetap memakai
   IndexedDB + antrean sinkronisasi pada aplikasi. */
'use strict';

const SHELL_CACHE = 'pesantrenku-shell-v30-sync-safe';
const MEDIA_CACHE = 'pesantrenku-media-v30-sync-safe';
const MAX_MEDIA_ENTRIES = 120;
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const shellUrl = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(
      APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })))
    );
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, MEDIA_CACHE]);
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          (key.startsWith('pesantrenku-') || key.startsWith('absensi-img-cache-')) &&
          !keep.has(key)
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

function isImageRequest(request, url) {
  return request.destination === 'image' ||
    /\.(?:png|jpe?g|webp|gif|svg)(?:$|\?)/i.test(url.pathname);
}

function isAllowedMedia(url) {
  return url.origin === self.location.origin || [
    'firebasestorage.googleapis.com',
    'firebasestorage.app',
    'storage.googleapis.com',
    'lh3.googleusercontent.com'
  ].includes(url.hostname);
}

function isDataOrApi(url) {
  return [
    'firestore.googleapis.com',
    'firebasestorage.googleapis.com',
    'firebasestorage.app',
    'firebaseinstallations.googleapis.com',
    'securetoken.googleapis.com',
    'identitytoolkit.googleapis.com',
    'firebaseappcheck.googleapis.com'
  ].some(host => url.hostname === host || url.hostname.endsWith('.' + host));
}

async function trimMediaCache(cache) {
  const keys = await cache.keys();

  if (keys.length > MAX_MEDIA_ENTRIES) {
    await Promise.all(
      keys
        .slice(0, keys.length - MAX_MEDIA_ENTRIES)
        .map(key => cache.delete(key))
    );
  }
}

async function cacheFirstImage(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);

  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone());
    trimMediaCache(cache).catch(() => {});
  }

  return response;
}

async function staleWhileRevalidateShell(request) {
  const cache = await caches.open(SHELL_CACHE);

  const cached =
    await cache.match(request) ||
    (request.mode === 'navigate' ? await cache.match(shellUrl) : null);

  const refresh = fetch(request).then(response => {
    if (response && response.ok) {
      cache
        .put(
          request.mode === 'navigate' ? shellUrl : request,
          response.clone()
        )
        .catch(() => {});
    }

    return response;
  });

  if (cached) {
    refresh.catch(() => {});
    return cached;
  }

  return refresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Data Firestore, Auth, dan API selalu dari jaringan.
  if (isDataOrApi(url)) return;

  // Foto lokal/Firebase Storage disimpan cache.
  if (isImageRequest(request, url) && isAllowedMedia(url)) {
    event.respondWith(
      cacheFirstImage(request).catch(() => caches.match(request))
    );
    return;
  }

  // Tampilan aplikasi, script, stylesheet, dan font memakai cache.
  if (
    url.origin === self.location.origin &&
    (
      request.mode === 'navigate' ||
      ['script', 'style', 'font'].includes(request.destination)
    )
  ) {
    event.respondWith(
      staleWhileRevalidateShell(request).catch(() => caches.match(shellUrl))
    );
  }
});

function buildPushNotification(payload) {
  const notification = payload?.notification || {};
  const data = payload?.data || {};

  return {
    title: notification.title || data.title || 'Pesantrenku',
    options: {
      body: notification.body || data.body || '',
      icon: notification.icon || data.icon || '/icon-192.png',
      badge: notification.badge || data.badge || '/icon-192.png',
      tag: data.tag || data.notificationId || notification.tag || 'pesantrenku',
      renotify: false,
      data: {
        url: data.link || data.url || notification.click_action || '/'
      }
    }
  };
}

self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { data: { body: '' } };
  }

  const note = buildPushNotification(payload);

  event.waitUntil(
    self.registration.showNotification(note.title, note.options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target = new URL(
    event.notification?.data?.url || '/',
    self.registration.scope
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    const existing = windows.find(client =>
      client.url === target ||
      client.url.startsWith(self.registration.scope)
    );

    if (existing) return existing.focus();

    return self.clients.openWindow(target);
  })());
});

// Dukungan pembaruan manual dari versi lama.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
// firebase-messaging-sw.js
// Service worker untuk menerima push notification FCM saat aplikasi tertutup.
// Config di bawah SAMA PERSIS dengan firebaseConfig di index.html —
// project Firestore baru (myassalam-d45c5), terpisah total dari
// project RTDB aplikasi Absensi Assalam yang lama.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDwtqEqYiWq5Df4dqK18rbInuZkbjkZ97I",
  authDomain: "myassalam-d45c5.firebaseapp.com",
  projectId: "myassalam-d45c5",
  storageBucket: "myassalam-d45c5.firebasestorage.app",
  messagingSenderId: "1075999980480",
  appId: "1:1075999980480:web:2297b16b1a5561dfb96625"
});

const messaging = firebase.messaging();

// Notifikasi saat app di background / tertutup
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Pesantrenku';
  const body = payload.notification?.body || payload.data?.body || '';
  const tag = payload.data?.tag || payload.data?.notificationId || 'pesantrenku-notif';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png', // opsional, ganti sesuai ikon app kalau ada
    badge: '/icon-192.png',
    tag,
    renotify: false,
    data: {
      url: payload.data?.link || '/',
      notificationId: payload.data?.notificationId || tag
    }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const targetUrl = event.notification.data?.url || '/';
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

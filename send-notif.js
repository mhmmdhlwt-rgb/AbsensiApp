// api/send-notif.js
// Serverless function (Vercel) — dipanggil dari index.html tiap ada event
// perizinan (pengajuan baru / disetujui / ditolak / telat kembali), lalu
// mengirim push notification asli lewat Firebase Cloud Messaging (FCM),
// sehingga notif tetap muncul walau aplikasi sedang tertutup.
//
// Versi ini memakai Cloud Firestore (project BARU, terpisah dari RTDB
// aplikasi Absensi Assalam yang lama) sebagai penyimpanan token FCM,
// di collection tenants/{ns}/fcmTokens.
//
// ⚠️ SETUP YANG WAJIB DILAKUKAN DI VERCEL (Project Settings > Environment
// Variables) sebelum fitur ini aktif:
//
//   FIREBASE_SERVICE_ACCOUNT
//     → JSON lengkap dari Firebase Console (project myassalam-d45c5) >
//       Project Settings > Service Accounts > Generate New Private Key.
//       Paste seluruh isi file JSON itu sebagai value (satu baris string
//       JSON).
//
// Tidak perlu FIREBASE_DATABASE_URL lagi (Firestore tidak memakai URL
// RTDB) — projectId diambil otomatis dari service account.
//
// Selama env var ini belum diisi, function akan mengembalikan sukses semu
// (no-op) supaya tidak mengganggu fitur lain di aplikasi.

let admin;
let firestoreDb;

function getAdmin() {
  if (admin) return admin;
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!svcRaw) return null;
    const serviceAccount = JSON.parse(svcRaw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  firestoreDb = admin.firestore();
  return admin;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { ns, title, body, target, sntId } = req.body || {};
    if (!ns || !title || !target) {
      res.status(400).json({ error: 'Missing ns/title/target' });
      return;
    }

    const app = getAdmin();
    if (!app) {
      // Belum dikonfigurasi — jangan gagalkan request dari client
      res.status(200).json({ ok: false, reason: 'FIREBASE_SERVICE_ACCOUNT belum di-set di Vercel' });
      return;
    }

    const tokensCol = firestoreDb.collection('tenants').doc(ns).collection('fcmTokens');
    const prefix = target === 'wali' ? `wali_${sntId}_` : 'musyrifah_';
    const snap = await tokensCol.get();
    const docs = [];
    const tokens = [];
    snap.forEach(d => {
      if (d.id.startsWith(prefix)) {
        docs.push(d.id);
        tokens.push(d.data().token || d.id.slice(prefix.length));
      }
    });

    if (!tokens.length) {
      res.status(200).json({ ok: true, sent: 0, reason: 'Tidak ada device terdaftar untuk target ini' });
      return;
    }

    const message = {
      notification: { title, body: body || '' },
      tokens
    };
    const result = await app.messaging().sendEachForMulticast(message);

    // Bersihkan token yang sudah tidak valid (uninstall/logout dsb)
    const invalidDocIds = [];
    result.responses.forEach((r, i) => { if (!r.success) invalidDocIds.push(docs[i]); });
    if (invalidDocIds.length) {
      const batch = firestoreDb.batch();
      invalidDocIds.forEach(docId => batch.delete(tokensCol.doc(docId)));
      await batch.commit();
    }

    res.status(200).json({ ok: true, sent: result.successCount, failed: result.failureCount });
  } catch (e) {
    console.error('[send-notif] error:', e);
    res.status(500).json({ error: e.message });
  }
};

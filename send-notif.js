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

async function deleteTokenDocs(tokensCol, docIds) {
  if (!docIds.length) return;
  let batch = firestoreDb.batch();
  let count = 0;
  for (const docId of docIds) {
    batch.delete(tokensCol.doc(docId));
    count++;
    if (count >= 450) {
      await batch.commit();
      batch = firestoreDb.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const requiredSecret = process.env.NOTIF_SHARED_SECRET;
    if (requiredSecret) {
      const sentSecret = req.headers['x-assalam-notif-key'] || req.headers['x-notif-key'];
      if (sentSecret !== requiredSecret) {
        res.status(401).json({ error: 'Unauthorized notification request' });
        return;
      }
    }
    const { ns, title, body, target, sntId, type, link, tag, notificationId } = req.body || {};
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
    const prefixes = target === 'all'
      ? ['musyrifah_', ...(sntId ? [`wali_${sntId}_`] : [])]
      : [target === 'wali' ? `wali_${sntId}_` : 'musyrifah_'];
    const snap = await tokensCol.get();
    const matched = [];
    const staleDocIds = [];
    const seenTokens = new Set();
    const now = Date.now();
    const maxTokenAgeMs = 45 * 24 * 60 * 60 * 1000;
    snap.forEach(d => {
      const matchedPrefix = prefixes.find(prefix => d.id.startsWith(prefix));
      if (matchedPrefix) {
        const data = d.data() || {};
        const token = data.token || d.id.slice(matchedPrefix.length);
        const updatedAt = Number(data.updatedAt || 0);
        if (updatedAt && now - updatedAt > maxTokenAgeMs) {
          staleDocIds.push(d.id);
          return;
        }
        if (!token || seenTokens.has(token)) return;
        seenTokens.add(token);
        matched.push({
          docId: d.id,
          token,
          deviceKey: data.deviceId || data.token || token,
          updatedAt
        });
      }
    });

    // Satu device/browser bisa meninggalkan beberapa token setelah reinstall,
    // clear cache, atau migrasi. Kirim hanya token terbaru per device agar
    // Chrome tidak menilai aplikasi terlalu agresif.
    const byDevice = new Map();
    for (const item of matched) {
      const prev = byDevice.get(item.deviceKey);
      if (!prev || (item.updatedAt || 0) > (prev.updatedAt || 0)) byDevice.set(item.deviceKey, item);
    }
    const selected = [...byDevice.values()];
    const dedupedDocIds = matched
      .filter(item => !selected.some(s => s.docId === item.docId))
      .map(item => item.docId);
    const cleanupBeforeSend = [...new Set([...staleDocIds, ...dedupedDocIds])];
    if (cleanupBeforeSend.length) {
      await deleteTokenDocs(tokensCol, cleanupBeforeSend);
    }

    const docs = selected.map(item => item.docId);
    const tokens = selected.map(item => item.token);

    if (!tokens.length) {
      res.status(200).json({
        ok: true,
        sent: 0,
        staleDeleted: staleDocIds.length,
        dedupedDeleted: dedupedDocIds.length,
        reason: 'Tidak ada device terdaftar untuk target ini'
      });
      return;
    }

    const message = {
      data: {
        title: String(title),
        body: String(body || ''),
        type: String(type || 'system'),
        link: String(link || '/'),
        tag: String(tag || notificationId || title),
        notificationId: String(notificationId || `${Date.now()}`)
      },
      webpush: {
        fcmOptions: { link: link || '/' }
      },
      tokens
    };
    const result = await app.messaging().sendEachForMulticast(message);

    // Bersihkan token yang sudah tidak valid (uninstall/logout dsb)
    const invalidDocIds = [];
    result.responses.forEach((r, i) => { if (!r.success) invalidDocIds.push(docs[i]); });
    if (invalidDocIds.length) {
      await deleteTokenDocs(tokensCol, invalidDocIds);
    }

    res.status(200).json({
      ok: true,
      sent: result.successCount,
      failed: result.failureCount,
      targetTokens: tokens.length,
      staleDeleted: staleDocIds.length,
      dedupedDeleted: dedupedDocIds.length,
      invalidDeleted: invalidDocIds.length
    });
  } catch (e) {
    console.error('[send-notif] error:', e);
    res.status(500).json({ error: e.message });
  }
};

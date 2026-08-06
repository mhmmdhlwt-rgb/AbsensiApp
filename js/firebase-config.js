// js/firebase-config.js — AbsensiApp
'use strict';

// Project Firebase BARU — terpisah total dari project RTDB lama
const firebaseConfig = {
  apiKey: "AIzaSyDwtqEqYiWq5Df4dqK18rbInuZkbjkZ97I",
  authDomain: "myassalam-d45c5.firebaseapp.com",
  projectId: "myassalam-d45c5",
  storageBucket: "myassalam-d45c5.firebasestorage.app",
  messagingSenderId: "1075999980480",
  appId: "1:1075999980480:web:2297b16b1a5561dfb96625",
  measurementId: "G-CHC7QRYYYP"
};
const VAPID_KEY = "BOWn62C0_B6EUjAEF1DdJTVVpSnIfpLg9baKbKpebw8sC1vCn7GrQ0NoxsqLwkQADCS_xL7zj3xujDaz5wg7LYQ";

if (!firebase.apps?.length) firebase.initializeApp(firebaseConfig);
const _fsDB = firebase.firestore();
// ── AUDIT FIX: Aktifkan offline persistence dengan cache size yang diperbesar ──
// Sebelumnya hanya synchronizeTabs:true. Untuk tenant dengan >100 santri &
// berbulan-bulan absensi, cache default 40MB cepat penuh dan evict dokumen
// penting, sehingga listener onSnapshot harus re-fetch (banyak Reads).
// Naikkan ke 200MB (lebih dari cukup untuk cache semua store utama).
try {
  _fsDB.enablePersistence?.({
    synchronizeTabs: true,
    cacheSizeBytes: 200 * 1024 * 1024  // 200MB (Firebase min 40MB)
  }).catch((e) => {
    console.warn('[FBSync] offline persistence failed:', e.code || e.message);
  });
} catch (e) { /* Safari iOS kadang throw — biarkan swallow */ }
// ── AUDIT FIX: Configure Firestore settings untuk efisiensi Reads ──
// `ignoreUndefinedProperties` mencegah error penulisan field undefined
// (yang sebelumnya ditangani manual via _fsClean). `merge:true` di setDoc
// tetap dipakai di _fbPatch. `experimentalForceLongPolling` opsional untuk
// jaringan lemah (lihat setting di bawah — di-off secara default karena
// mempengaruhi latensi multi-tenant).
try {
  _fsDB.settings({ ignoreUndefinedProperties: true });
} catch (e) { /* settings hanya bisa dipanggil sekali per instance */ }

// Tenant namespace — diisi dari localStorage setelah setup wizard
function _fbNs() {
  return localStorage.getItem('tenant_ns') || 'default';
}
function _tenantCol(store) {
  return _fsDB.collection('tenants').doc(_fbNs()).collection(store);
}
// Firestore tidak menerima value `undefined` — bersihkan seperti halnya
// JSON.stringify (yang otomatis membuang key ber-value undefined) pada
// implementasi RTDB lama, agar perilakunya identik.
function _fsClean(obj) {
  return JSON.parse(JSON.stringify(obj));
}
// ── AUDIT FIX: Server-side timestamp helper ──
// Sebelumnya semua timestamp pakai Date.now() (client-side). Karena client
// bisa punya jam tidak akurat / sengaja diubah, untuk data KRITIS yang
// dipakai sebagai source-of-truth ( updatedAt di absensi, auditLog,
// pelanggaran, perizinan) idealnya pakai serverTimestamp. Tapi karena
// strategi sync membandingkan client-side updatedAt dengan last-write-wins
// dan _restoreFoto butuh numeric timestamp untuk komparasi, kita pertahankan
// numeric updatedAt tapi TAMBAH field `_srvTs` (serverTimestamp) sebagai
// audit trail. Untuk sekarang field ini tidak mempengaruhi business logic
// apapun — hanya untuk forensik jika terjadi dispute data.
const _fsServerTs = () => firebase.firestore.FieldValue.serverTimestamp();

// ── AUDIT FIX: Retry wrapper untuk Firestore operations ──
// Sebelumnya banyak operasi Firestore tidak punya retry. Saat jaringan
// flaky, operasi penting (terutama write absensi) bisa gagal diam-diam
// dan user tidak sadar datanya belum tersimpan. Helper ini dipakai oleh
// _fbPatch/_fbFetch untuk retry 3x dengan exponential backoff.
async function _fsRetry(fn, label='fs', maxRetries=3) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // AbortError atau InvalidArgument: jangan retry
      if (e.code === 'invalid-argument' || e.code === 'permission-denied') throw e;
      // Backoff: 300ms, 900ms, 2700ms
      const delay = 300 * Math.pow(3, i);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.warn('[FBSync] ' + label + ' failed after ' + maxRetries + ' retries:', lastErr?.message);
  throw lastErr;
}

// ── FASE 2: Filtered fetch helper ──
// Sama dengan _fbFetch('GET') tapi dengan filter where() + orderBy().
// Mengembalikan array of objects (bukan map by id seperti _fbFetch).
// Wajib ada composite index untuk kombinasi where + orderBy yang dipakai.
// Lihat firebase.json untuk daftar index yang sudah dibuat.
async function _fbFetchFiltered(store, field1, op1, val1, field2, op2, val2, limit=500) {
  let q = _tenantCol(store)
    .where(field1, op1, val1);
  if (field2 && op2 && val2 !== undefined) {
    q = q.where(field2, op2, val2);
  }
  // orderBy field1 untuk konsistensi index (composite index wajib)
  q = q.orderBy(field1, 'asc');
  if (limit) q = q.limit(limit);
  const snap = await _fsRetry(() => q.get(), 'fbFetchFiltered(' + store + ')');
  const out = [];
  snap.forEach(d => {
    const data = d.data();
    if (data && data.id) {
      // Strip audit-trail fields supaya tidak ikut ke IDB
      delete data._ts; delete data._etag; delete data._srvTs;
      out.push(data);
    }
  });
  return out;
}

// ── FASE 2: Paginated fetch helper ──
// Mengembalikan { items, lastVisible } untuk pagination cursor-based.
// Pakai startAfter(lastVisible) untuk halaman berikutnya.
async function _fbFetchPaginated(store, orderByField='updatedAt', orderDir='desc', pageSize=50, lastVisible=null, filters=null) {
  let q = _tenantCol(store).orderBy(orderByField, orderDir);
  if (filters && Array.isArray(filters)) {
    filters.forEach(f => { q = q.where(f.field, f.op, f.val); });
  }
  if (lastVisible) q = q.startAfter(lastVisible);
  q = q.limit(pageSize);
  const snap = await _fsRetry(() => q.get(), 'fbFetchPaginated(' + store + ')');
  const items = [];
  snap.forEach(d => {
    const data = d.data();
    if (data && data.id) {
      delete data._ts; delete data._etag; delete data._srvTs;
      items.push(data);
    }
  });
  // lastVisible = snap.docs[snap.docs.length - 1] untuk halaman berikutnya
  const newLast = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return { items, lastVisible: newLast, hasMore: snap.docs.length === pageSize };
}

async function _fbFetch(path, method='GET', body=null) {
  const parts = path.split('/').filter(Boolean); // ['store'] atau ['store','id']
  const store = parts[0], id = parts[1];
  if (method === 'GET') {
    if (id) {
      const snap = await _tenantCol(store).doc(id).get();
      return snap.exists ? snap.data() : null;
    }
    const snap = await _tenantCol(store).get();
    const out = {};
    snap.forEach(d => { out[d.id] = d.data(); });
    return out;
  }
  if (method === 'PUT') {
    await _tenantCol(store).doc(id).set(_fsClean(body));
    return body;
  }
  if (method === 'DELETE') {
    if (id) {
      await _tenantCol(store).doc(id).delete();
      return null;
    }
    // Tidak ada id — hapus SELURUH collection (setara hapus satu node RTDB),
    // dipakai oleh fitur "Reset Semua Data".
    const snap = await _tenantCol(store).get();
    let batch = _fsDB.batch(), count = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      if (++count >= 450) { await batch.commit(); batch = _fsDB.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
    return null;
  }
  throw new Error('Metode tidak didukung: ' + method);
}

// PATCH = shallow merge (hanya field yang dikirim, field lain tidak berubah)
// Ini mencegah dua admin saling timpa field yang tidak mereka edit.
// Firestore set(..., {merge:true}) melakukan hal yang sama secara native,
// jadi mekanisme ETag/konflik ala RTDB tidak lagi diperlukan — merge di
// level field sudah terjadi otomatis di server.
// ── AUDIT FIX: Tambah retry + audit-trail timestamp ──
// Sekarang _fbPatch memakai _fsRetry untuk retry 3x dengan exponential
// backoff pada kegagalan network/transient. Untuk store kritikal
// (absensi, auditLog, pelanggaran, perizinan) juga menambah field
// _srvTs (serverTimestamp) sebagai audit trail — tidak mempengaruhi
// business logic (logic existing pakai updatedAt numeric), hanya untuk
// forensik jika terjadi dispute jam antar perangkat.
const _AUDIT_TRAIL_STORES = new Set(['absensi','auditLog','pelanggaran','perizinan','catatanSakit','uzur']);
async function _fbPatch(path, fields) {
  const parts = path.split('/').filter(Boolean);
  const store = parts[0], id = parts[1];
  const cleaned = _fsClean(fields);
  // Tambah audit-trail server timestamp hanya untuk store kritikal
  // dan hanya jika fields bukan operasi tombstone murni (deleted:true).
  // Tombstone tetap dapat _srvTs supaya waktu hapus server-side tercatat.
  if (_AUDIT_TRAIL_STORES.has(store)) {
    cleaned._srvTs = _fsServerTs();
  }
  await _fsRetry(
    () => _tenantCol(store).doc(id).set(cleaned, {merge:true}),
    'fbPatch(' + store + '/' + id + ')'
  );
  return fields;
}

// Daftar tenant ke koleksi registry (agar tidak bentrok antar asrama)
async function _registerTenant(ns, namaAsrama, pin, tipe) {
  try {
    await _fsDB.collection('registry').doc(ns).set({nama: namaAsrama, createdAt: Date.now(), pin: pin||null, tipe: tipe||'asrama'});
  } catch(e) { console.warn('[Registry] gagal register:', e); }
}


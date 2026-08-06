// js/main.js — AbsensiApp
'use strict';


// ════════════════════════════════════════════════════════════
// PATCH DB — write trigger
// ════════════════════════════════════════════════════════════
(function patchDB() {
  const _origP = DB.p.bind(DB);
  const _origD = DB.d.bind(DB);
  FBSync.setOrigP(_origP);
  FBSync.setOrigD(_origD);

  DB.p = async function(store, obj) {
    const r = await _origP(store, obj);          // IndexedDB dulu (instant)
    FBSync.write('set', store, obj);              // Firebase langsung di background
    return r;
  };
  DB.d = async function(store, id) {
    const r = await _origD(store, id);
    FBSync.write('del', store, null, id);          // → push tombstone ke FB
    return r;
  };
})();

// ════════════════════════════════════════════════════════════
// PATCH NAV — pull trigger saat pindah halaman
// ════════════════════════════════════════════════════════════
(function patchNav() {
  const _origNav = App.nav.bind(App);
  App.nav = async function(pg, opts={}) {
    // Stop absensi poll jika meninggalkan halaman abs
    if (S.page === 'abs' && pg !== 'abs') FBSync.stopAbsPoll();
    // Stop chat poll saat meninggalkan halaman chat
    if (S.page === 'chat' && pg !== 'chat') {
      document.getElementById('pg-chat')?.classList.remove('on');
      document.getElementById('bnav').style.display = '';  // tampilkan navbar kembali
      clearInterval(ChatModule._pollTimer);
      ChatModule._pollTimer = null;
    }
    // ── AUDIT v3g: LAZY LISTENER — attach/detach berdasarkan halaman ──
    // Halaman yang butuh realtime absensi/sesi: dash, abs, kgd, rek, profil, kg, sub
    // Halaman yang TIDAK butuh realtime: set, pel, izn, snt, sntd, chat
    // Saat user pindah KE halaman realtime, start listeners.
    // Saat user pindah DARI halaman realtime ke non-realtime, stop listeners.
    // Ini hemat ~300 reads/jam untuk user yang lama di halaman non-realtime.
    const REALTIME_PAGES = ['dash', 'abs', 'kgd', 'rek', 'profil', 'kg', 'sub', 'pel', 'izn'];
    const wasRealtime = REALTIME_PAGES.includes(S.page);
    const willBeRealtime = REALTIME_PAGES.includes(pg);
    if (navigator.onLine) {
      if (willBeRealtime && !wasRealtime) {
        // Masuk ke halaman realtime — attach listeners
        setTimeout(() => FBSync.startListeners(), 100);
      } else if (!willBeRealtime && wasRealtime) {
        // Keluar dari halaman realtime — detach listeners (hemat reads)
        FBSync.stopListeners();
      }
    }
    // Pull data halaman tujuan secara NON-BLOCKING (paralel dengan render)
    const _fastPages = ['chat'];
    if (navigator.onLine && !_fastPages.includes(pg)) {
      FBSync.pullForNav(pg).catch(()=>{});
    }
    await _origNav(pg, opts);
    // Start absensi poll jika masuk halaman abs
    if (pg === 'abs' && S._sesiId) FBSync.startAbsPoll(S._sesiId);
  };
})();

// ════════════════════════════════════════════════════════════
// PATCH KAMAR — prevent duplikat saat add kamar baru
// Jika nama kamar sudah ada (case-insensitive), skip
// ════════════════════════════════════════════════════════════
(function patchKamar() {
  const _origSaveKm = App._saveKm?.bind(App);
  if (_origSaveKm) {
    App._saveKm = async function(kmId) {
      const n = document.getElementById('km-in')?.value.trim();
      if (!n) { T('Nama kamar wajib!'); return; }
      const all = await DB.ga('kamar');
      // Cek duplikat nama (kecuali saat edit dengan id yang sama)
      const dup = all.find(k => k.nama.trim().toLowerCase() === n.toLowerCase() && k.id !== kmId);
      if (dup) { T('\u26A0 Kamar "' + n + '" sudah ada!'); return; }
      if (kmId) {
        const km = await DB.g('kamar', kmId);
        if (km) { km.nama = n; km.updatedAt = Date.now(); await DB.p('kamar', km); }
      } else {
        await DB.p('kamar', {id: uid(), nama: n, createdAt: Date.now(), updatedAt: Date.now()});
      }
      CS(); T('\u2705 Kamar disimpan!'); await App.kelolaKamar();
    };
  }
})();

// ════════════════════════════════════════════════════════════
// PATCH SANTRI — prevent duplikat nama di kamar yang sama
// ════════════════════════════════════════════════════════════
(function patchSantri() {
  const _origSaveSnt = App._saveSnt.bind(App);
  App._saveSnt = async function(sntId) {
    const n = document.getElementById('nn-in')?.value.trim();
    const k = document.getElementById('nk-in')?.value.trim() || 'Umum';
    if (!n) { T('Nama wajib!'); return; }
    const all = await DB.ga('santri');
    // Cek duplikat nama di kamar yang sama (kecuali saat edit)
    const dup = all.find(s => s.nama.trim().toLowerCase() === n.toLowerCase() && s.kamar === k && s.id !== sntId);
    if (dup) { T('\u26A0 "' + n + '" sudah ada di kamar ' + k + '!'); return; }
    await _origSaveSnt(sntId);
  };
})();

// ════════════════════════════════════════════════════════════
// PATCH IMPORT SANTRI — prevent duplikat saat import massal
// AUDIT v3i: FIX BUG — patch ini sebelumnya MENIMPA fungsi _doImport
// yang asli (yang sudah handle NFC). Patch ini hanya simpan nama, kamar,
// nis — TIDAK simpan NFC. Akibatnya: "import massal santri, NFC tidak
// terdaftar padahal sudah di input".
// Sekarang: HAPUS patch ini supaya fungsi _doImport yang asli (line 5932)
// yang sudah handle NFC (p[3] = nfcUid) dipakai. Fungsi asli juga sudah
// punya dedup logic (by NIS dan by nama ter-normalisasi).
// ════════════════════════════════════════════════════════════
// (function patchImport() { — DIHAPUS, pakai fungsi asli
//   const _origImport = App._doImport.bind(App);
//   App._doImport = async function() {
//     ... TIDAK handle NFC ...
//   };
// })();

// ════════════════════════════════════════════════════════════
// BACKGROUND REFRESH — flush writes only (chat NON-realtime)
// AUDIT v3h: Hapus _chatBgCheck dari background timer — chat tidak perlu
// di-poll di background. Chat hanya di-fetch saat user buka halaman chat.
// Ini hemat ~24,000 reads/hari untuk user yang tidak buka chat.
// ════════════════════════════════════════════════════════════
let _bgTimer = null;
function _startBgRefresh() {
  if (_bgTimer) clearInterval(_bgTimer);
  // AUDIT v3h: Naikkan ke 2 menit — hanya flush writes, tidak ada chat poll
  _bgTimer = setInterval(() => {
    if (!navigator.onLine || document.hidden) return;
    FBSync._flushWrites();
  }, 120000); // 2 menit (sebelumnya 60 detik dengan chat poll)
  // ── Tombstone sweep tiap 5 menit (ZERO Firestore reads) ──
  if (window._bgSweepTimer) clearInterval(window._bgSweepTimer);
  window._bgSweepTimer = setInterval(() => {
    if (!navigator.onLine || document.hidden) return;
    if (FBSync._sweepTombstones) FBSync._sweepTombstones().catch(()=>{});
  }, 300000); // 5 menit
}
// Saat tab/app kembali aktif: flush writes + cek listener (jangan restart kalau masih aktif)
// AUDIT v3h: Sebelumnya, visibilitychange selalu panggil startListeners() yang
// bikin listener baru → 116 listener ganda. Sekarang: hanya flush writes +
// cek apakah listener masih aktif. Jika ya, skip. Jika tidak, baru restart.
let _lastVisChange = 0;
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && navigator.onLine) {
    // AUDIT v3h: Debounce — jangan trigger jika kurang dari 5 detik sejak terakhir
    const now = Date.now();
    if (now - _lastVisChange < 5000) return;
    _lastVisChange = now;
    
    FBSync._flushWrites();
    // AUDIT v3h: Hanya restart listeners jika BENAR-BENAR mati (jumlah < seharusnya)
    // Jangan restart kalau masih aktif — itu penyebab 116 listener ganda
    const REALTIME_PAGES = ['dash', 'abs', 'kgd', 'rek', 'profil', 'kg', 'sub', 'pel', 'izn'];
    const currentPage = (typeof S !== 'undefined' && S.page) || 'dash';
    if (REALTIME_PAGES.includes(currentPage)) {
      // Cek apakah listener masih aktif
      if (FBSync._unsubs && FBSync._unsubs.length < 2) {
        console.log('[visibilitychange] Listener mati, restart...');
        FBSync.startListeners();
      }
    }
    // Cek apakah hari sudah berganti
    const today = _todayLocal();
    const lastDay = localStorage.getItem('last_active_day');
    if (lastDay !== today) {
      await _dailyReset();
      if (S.page === 'dash') App.dash().catch(()=>{});
      else if (S.page === 'kg') App.renderKg().catch(()=>{});
    }
    // Invalidate cache supaya nav berikutnya re-pull fresh data
    if (FBSync._invalidateCache) FBSync._invalidateCache();
  }
});
window.addEventListener('online',  () => {
  FBSync._dot('syncing');
  FBSync._flushWrites();
  // Restart listeners setelah online kembali
  setTimeout(()=>FBSync.startListeners(), 500);
  // AUDIT v3: Jangan pullAll (boros Reads). Cukup invalidate cache,
  // pull halaman aktif saja. User bisa klik Refresh kalau mau full sync.
  if (FBSync._invalidateCache) FBSync._invalidateCache();
  if (S.page) setTimeout(()=>FBSync.pullForNav(S.page).catch(()=>{}), 1500);
});
window.addEventListener('offline', () => { FBSync._dot('off'); FBSync.stopListeners(); });

// ════════════════════════════════════════════════════════════
// FIREBASE SECTION DI PENGATURAN
// ════════════════════════════════════════════════════════════
(function patchRenderSetFB() {
  const _orig = App.renderSet.bind(App);
  App.renderSet = async function() {
    await _orig();
    const setBody = document.getElementById('set-body');
    if (!setBody || document.getElementById('fb-sync-section')) return;
    const html = `<div style="margin-bottom:14px" id="fb-sync-section">
      <div class="sec-l">\u2601\uFE0F Sinkronisasi Cloud</div>
      <div class="sc3">
        <div class="sr2">
          <div class="si4" style="background:rgba(13,181,127,.09);border-color:rgba(13,181,127,.18)">\u2601</div>
          <div class="st3"><div class="sl3">Status</div><div class="sv" id="fb-status-txt">${navigator.onLine ? 'Online \u2713' : 'Offline'}</div></div>
          <div style="width:9px;height:9px;border-radius:50%;background:${navigator.onLine?'#0db57f':'#94a3b8'};flex-shrink:0"></div>
        </div>
        <div class="sr2" onclick="FBSync.pullAll().then(()=>{T('\u2705 Data terbaru!');App.renderSet()})">
          <div class="si4">\u2193</div>
          <div class="st3"><div class="sl3">Ambil Semua Data dari Cloud</div><div class="sv">Sinkronkan data terbaru dari Firebase</div></div>
          <div class="sa">\u2192</div>
        </div>
        <div class="sr2" onclick="FBSync._sweepTombstones().then(()=>{T('\u2705 Sweep selesai!');App.renderSet()}).catch(()=>{T('\u274C Gagal sweep')})">
          <div class="si4" style="background:rgba(245,158,11,.09);border-color:rgba(245,158,11,.18)">\uD83E\uDDF9</div>
          <div class="st3"><div class="sl3">Bersihkan Data Usang (Tombstone)</div><div class="sv">Hapus data yang sudah dihapus di perangkat lain tapi masih tersisa di sini</div></div>
          <div class="sa">\u2192</div>
        </div>
        <div class="sr2" onclick="FBSync.pushAll()">
          <div class="si4">\u2191</div>
          <div class="st3"><div class="sl3">Unggah Semua Data ke Cloud</div><div class="sv">Setup awal atau setelah import</div></div>
          <div class="sa">\u2192</div>
        </div>
      </div>
    </div>`;
    const sections = setBody.querySelectorAll('[style*="margin-bottom:14px"]');
    const bahaya = [...sections].find(s => s.textContent.includes('Reset Semua Data'));
    if (bahaya) bahaya.insertAdjacentHTML('beforebegin', html);
  };
})();

// ════════════════════════════════════════════════════════════
// PUSH NOTIFICATION (FCM) — untuk Perizinan
// firebaseConfig & VAPID_KEY sudah didefinisikan di FIREBASE SYNC
// ENGINE di atas (project Firestore baru yang sama). Token FCM
// disimpan sebagai dokumen Firestore di tenants/{ns}/fcmTokens,
// bukan lagi di path RTDB.
// ════════════════════════════════════════════════════════════
async function _setupPushNotif(role,sntId){
  try{
    if(!('serviceWorker' in navigator)||!('Notification' in window))return;
    if(firebaseConfig.projectId==='TODO-ISI')return; // belum dikonfigurasi
    const perm=await Notification.requestPermission();
    if(perm!=='granted')return;
    const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging=firebase.messaging();
    const token=await messaging.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
    if(!token)return;
    const ns=_fbNs();
    const docId=role==='musyrifah'?`musyrifah_${token}`:`wali_${sntId}_${token}`;
    await _fsDB.collection('tenants').doc(ns).collection('fcmTokens').doc(docId).set({
      token, role, sntId: sntId||null, updatedAt: Date.now()
    });
  }catch(e){console.warn('[Push] setup gagal (cek konfigurasi Firebase):',e);}
}

// ════════════════════════════════════════════════════════════
// FASE 3 AUDIT FIX: Global Error Boundary
// Tangkap semua unhandled error & Promise rejection. Tampilkan toast
// informatif ke user, log ke console, dan (opsional) kirim ke server
// untuk telemetry. Tanpa ini, error silent-fail dan user bingung.
// ════════════════════════════════════════════════════════════
(function _setupGlobalErrorBoundary() {
  // Suppress known noisy errors (mis. ResizeObserver loop)
  const SUPPRESSED_PATTERNS = [
    /ResizeObserver loop limit exceeded/i,
    /ResizeObserver loop completed with undelivered notifications/i,
  ];
  function _shouldSuppress(msg) {
    return SUPPRESSED_PATTERNS.some(p => p.test(String(msg||'')));
  }

  window.addEventListener('error', (e) => {
    const err = e.error || e.message || 'Unknown error';
    if (_shouldSuppress(err?.message || err)) return;
    console.error('[GlobalError]', err);
    // Toast user-friendly (jangan bocor detail teknis)
    if (window.T) {
      T('⚠️ Terjadi error. Coba muat ulang halaman jika UI tidak responsif.', 6000);
    }
    // Optional: kirim ke server telemetry (Cloud Function)
    // fetch('/api/log-error', {method:'POST', body: JSON.stringify({
    //   msg: String(err?.message || err).slice(0, 500),
    //   url: location.href,
    //   ts: Date.now(),
    //   tenant: _fbNs?.() || null,
    //   user: S?.user?.nama || null
    // })}).catch(()=>{});
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    if (_shouldSuppress(reason?.message || reason)) return;
    console.error('[UnhandledRejection]', reason);
    // Untuk rejection, tidak perlu toast — biasanya dari write queue yang
    // sudah punya retry mechanism sendiri. Cukup log.
    // Tapi jika reason adalah Firestore permission error, toast khusus:
    if (reason?.code === 'permission-denied') {
      if (window.T) T('🔒 Akses ditolak. Hubungi admin jika ini tidak wajar.', 6000);
    }
  });

  console.log('[ErrorBoundary] Global error handlers installed');
})();

// ════════════════════════════════════════════════════════════
// BOOT
// AUDIT v3c: Hapus setInterval(_chatBgCheck, 8000) — _bgTimer (30s) sudah
// handle chat check. Double poll = double reads.
// ════════════════════════════════════════════════════════════
setTimeout(()=>{FBSync.start();_startBgRefresh();},2000);


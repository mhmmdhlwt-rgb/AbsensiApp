// js/fbsync.js — AbsensiApp
'use strict';

const FBSync = (() => {
  // Write queue — tiap entry adalah satu operasi
  let _wq = [];           // [{op:'set'|'del', store, obj?, id?, ts}]
  let _writing = false;
  let _absPoll = null;
  let _origP = null;
  let _origD = null;       // original DB.d (un-patched) — dipakai untuk hapus lokal saat menerima tombstone, agar tidak men-trigger antrian write lagi (echo)
  let _dotTimer = null;

  // ── Dot ────────────────────────────────────────────────────
  function _dot(state) {
    const el = document.getElementById('sync-dot'); if (!el) return;
    el.className = state;
    if (state === 'ok') { clearTimeout(_dotTimer); _dotTimer = setTimeout(()=>{if(el.className==='ok')el.className='';}, 2500); }
  }

  // ── Siapkan objek untuk dikirim ke cloud ──────────────────
  // Foto profil, bukti pelanggaran, dan foto hukuman SEKARANG DIKIRIM PENUH
  // ke cloud (tidak lagi di-strip ke marker lokal) — supaya foto benar-benar
  // terlihat di semua device, bukan hanya di device tempat foto diambil.
  function _strip(obj) {
    const o = Object.assign({}, obj);
    o._ts = Date.now();
    // Pastikan setiap write 'set' membersihkan flag tombstone `deleted`.
    // Tanpa ini, item yang pernah dihapus lalu dibuat ulang dengan id yang
    // sama akan tetap dianggap tombstone oleh perangkat lain — resah dari kubur.
    if (!o.deleted) o.deleted = false;
    return o;
  }

  // ── Restore field base64 lama (marker __L__ dari data sebelum foto
  // ikut disinkron) — dibiarkan sebagai jaring pengaman, aman jika tidak
  // ada marker sama sekali (pass-through tanpa efek).
  async function _restoreFoto(store, obj) {
    if (obj.foto !== '__L__' && obj.fotoHukuman !== '__L__' &&
        !(Array.isArray(obj.fotoBukti) && obj.fotoBukti.some(f => f === '__L__'))) {
      return obj; // tidak ada marker lama — tidak perlu proses apa-apa
    }
    try {
      const loc = _origP && await DB.g(store, obj.id);
      if (obj.foto === '__L__') {
        if (loc && loc.foto && !loc.foto.startsWith('__')) obj.foto = loc.foto;
        else delete obj.foto;
      }
      if (Array.isArray(obj.fotoBukti) && obj.fotoBukti.some(f => f === '__L__')) {
        if (loc && Array.isArray(loc.fotoBukti)) {
          obj.fotoBukti = obj.fotoBukti.map((f, i) => f === '__L__' ? (loc.fotoBukti[i] || '__L__') : f);
        } else {
          obj.fotoBukti = obj.fotoBukti.filter(f => f !== '__L__');
        }
      }
      if (obj.fotoHukuman === '__L__') {
        if (loc && loc.fotoHukuman && !loc.fotoHukuman.startsWith('__')) obj.fotoHukuman = loc.fotoHukuman;
        else delete obj.fotoHukuman;
      }
    } catch(e) {}
    return obj;
  }

  // ════════════════════════════════════════════════════════
  // WRITE: enqueue dan flush segera
  // ── TOMBSTONE STRATEGY ──
  // Untuk operasi 'del', kita TIDAK menghapus dokumen Firestore secara
  // langsung. Sebagai gantinya, kita menulis tombstone {deleted:true,
  // updatedAt:now} ke dokumen tersebut (PATCH merge). Perangkat lain
  // yang melakukan pull akan melihat flag `deleted:true` dan menghapus
  // salinan lokalnya. Ini mengatasi bug "hapus kegiatan di HP A tidak
  // terhapus di HP B" — sebelumnya dokumen dihapus langsung, jadi HP B
  // yang melakukan pull tidak melihat dokumen itu sama sekali dan tidak
  // tahu harus menghapus salinan lokalnya.
  // ════════════════════════════════════════════════════════
  function write(op, store, obj, id) {
    // Dedup queue: jika ada entry yang sama store+id, hapus yang lama
    const eid = obj ? obj.id : id;
    _wq = _wq.filter(x => !(x.store === store && x.id === eid));
    if (op === 'del') {
      // Push tombstone sebagai operasi 'set' — PATCH merge ke FB
      // ── FASE 2 AUDIT FIX: Sertakan metadata kontekstual di tombstone ──
      // Sebelumnya tombstone hanya {id, deleted, updatedAt} — tidak ada info
      // sesi/santri. Akibatnya, query where("sesiId","==",sid) tidak menangkap
      // tombstone (karena field sesiId tidak ada). startAbsPoll harus memuat
      // SELURUH koleksi absensi hanya untuk cek tombstone.
      // Sekarang: cari record lokal yang akan dihapus, salin sesiId & sntId ke
      // tombstone. Untuk store non-absensi, tetap pakai tombstone minimal.
      const tomb = { id: eid, deleted: true, updatedAt: Date.now() };
      if (store === 'absensi' && _origP) {
        // Async lookup record lokal — best-effort, jangan block write queue.
        DB.g('absensi', eid).then(loc => {
          if (loc && loc.sesiId) {
            // Update tombstone yang sudah di-queue dengan sesiId & sntId.
            // Cari entry di _wq, patch field sesiId & sntId.
            const entry = _wq.find(x => x.store === store && x.id === eid);
            if (entry && entry.obj) {
              entry.obj.sesiId = loc.sesiId;
              entry.obj.sntId = loc.sntId;
              _persistQueue();
            }
          }
        }).catch(()=>{});
      }
      _wq.push({op:'set', store, obj: tomb, id: eid, ts: Date.now()});
    } else {
      _wq.push({op:'set', store, obj, id: eid, ts: Date.now()});
    }
    // ── H3 BUG FIX: Persist write queue ke IndexedDB ──
    // Sebelumnya _wq hanya di-memori. Jika app di-reload saat offline
    // dengan queue belum di-flush, write hilang permanen → silent data loss.
    // Sekarang persist ke store 'fbQueue' agar bisa di-recover di init().
    _persistQueue();
    _dot('syncing');
    _flushWrites();
  }

  // ── H3 BUG FIX: Queue persistence helpers ──
  let _persistTimer = null;
  function _persistQueue() {
    // Debounce: kumpulkan write berurutan, persist batch 1x per 500ms
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(async () => {
      try {
        if (!_origP) return;
        // Pakai _origP supaya tidak trigger write() lagi (echo loop)
        await _origP('settings', {id: '_fb_queue', items: _wq, ts: Date.now()});
      } catch(e) { /* settings store always exists */ }
    }, 500);
  }
  async function _loadPersistedQueue() {
    try {
      const rec = await DB.g('settings', '_fb_queue');
      if (rec && Array.isArray(rec.items) && rec.items.length) {
        // Merge: hanya tambah item yang belum ada di _wq (by store+id)
        const existing = new Set(_wq.map(x => x.store + '|' + x.id));
        for (const item of rec.items) {
          const key = item.store + '|' + item.id;
          if (!existing.has(key)) {
            _wq.push(item);
            existing.add(key);
          }
        }
        console.log('[FBSync] Recovered ' + rec.items.length + ' queued writes from persistence');
      }
      // Clear persisted queue setelah di-load (akan di-persist ulang jika perlu)
      await _origP('settings', {id: '_fb_queue', items: [], ts: Date.now()}).catch(()=>{});
    } catch(e) { console.warn('[FBSync] load queue error:', e); }
  }
  async function _clearPersistedQueue() {
    try { await _origP('settings', {id: '_fb_queue', items: [], ts: Date.now()}); } catch(e){}
  }

  async function _flushWrites() {
    if (_writing || !navigator.onLine || !_wq.length) return;
    _writing = true;
    while (_wq.length && navigator.onLine) {
      const item = _wq.shift();
      try {
        if (item.op === 'set') {
          // Gunakan PATCH (shallow merge) — hanya update field yang dikirim
          // Ini TIDAK menimpa field lain yang mungkin sudah diedit admin lain
          const stripped = _strip(item.obj);
          const result = await _fbPatch('/' + item.store + '/' + item.id, stripped);
          if (result && result._conflict) {
            // ETag conflict — ambil versi terbaru dari server, merge, retry
            const fbCurrent = await _fbFetch('/' + item.store + '/' + item.id).catch(()=>null);
            if (fbCurrent && !fbCurrent._conflict) {
              delete fbCurrent._ts; delete fbCurrent._etag;
              const locTs = item.obj.updatedAt || 0;
              const fbTs  = fbCurrent.updatedAt || 0;
              if (locTs >= fbTs) {
                // Lokal lebih baru: merge lokal ke atas FB, lalu push
                const merged = Object.assign({}, fbCurrent, stripped);
                await _fbPatch('/' + item.store + '/' + item.id, merged);
              }
              // FB lebih baru: simpan ke lokal
              await _origP(item.store, fbCurrent);
            }
          }
        } else {
          await _fbFetch('/' + item.store + '/' + item.id, 'DELETE');
        }
      } catch(e) {
        _wq.unshift(item); // retry
        break;
      }
    }
    _writing = false;
    _dot(_wq.length === 0 ? 'ok' : 'err');
    // ── H3 BUG FIX: Clear persisted queue when all flushed ──
    if (_wq.length === 0) _clearPersistedQueue();
    else _persistQueue();  // update persisted queue dengan sisa
  }

  // ════════════════════════════════════════════════════════
  // READ: pull store(s) dari Firebase → merge ke IndexedDB
  // Dedup logic:
  //   - santri: merge by ID, last-write-wins (updatedAt terbaru menang)
  //   - kamar: merge by NAMA (bukan ID) — hindari duplikat nama
  //   - lainnya: merge by ID, last-write-wins
  // ════════════════════════════════════════════════════════
  async function pull(stores) {
    if (!navigator.onLine) return;
    _dot('syncing');
    // AUDIT v3: pull() sebelumnya hanya menulis ke IndexedDB tanpa pernah
    // memberi tahu UI untuk re-render. Ini membuat data yang ditarik oleh
    // polling latar belakang tidak pernah terlihat sampai user pindah halaman
    // lalu kembali. `changed` melacak apakah ada penambahan/pembaruan/penghapusan
    // nyata selama pull ini berlangsung.
    let changed = false;
    try {
      const results = await Promise.all(stores.map(s => _fbFetch('/' + s).catch(()=>null)));
      for (let i = 0; i < stores.length; i++) {
        const store = stores[i];
        const fbData = results[i];
        if (!fbData || typeof fbData !== 'object') continue;
        const fbItems = Object.values(fbData).filter(x => x && x.id);

        // ── TOMBSTONE HANDLING (SEMUA STORE) ──
        // FB docs dengan flag `deleted:true` adalah penanda bahwa item tsb
        // sudah dihapus di perangkat lain. Hapus salinan lokalnya.
        // Pakai _origD (bukan DB.d yang di-patch) supaya tidak men-trigger
        // antrian write lagi — echo tombstone tidak diperlukan karena
        // tombstone sudah ada di FB.
        // Hanya hapus jika timestamp tombstone >= lokal (last-write-wins:
        // kalau lokal punya versi lebih baru, mungkin user baru saja undo
        // penghapusan dengan re-create).
        const localAll0 = await DB.ga(store).catch(()=>[]);
        const localMap0 = new Map(localAll0.map(x => [x.id, x]));
        for (const t of fbItems) {
          if (!t.deleted) continue;
          const loc = localMap0.get(t.id);
          // Hapus lokal jika:
          // 1. Lokal ada DAN tombstone lebih baru/equal, ATAU
          // 2. Lokal ada DAN lokal sudah ditandai deleted (stuck tombstone —
          //    bersihkan supaya tidak terus-terusan render sebagai "deleted")
          if (loc && ((t.updatedAt||0) >= (loc.updatedAt||0) || loc.deleted)) {
            try { await (_origD ? _origD(store, t.id) : DB.d(store, t.id)); changed = true; }
            catch(e) { console.warn('[Pull] tombstone del error:', store, t.id, e); }
          }
        }

        // ── CLEANUP: hapus item lokal yang ditandai `deleted:true` tapi
        //    tidak ada lagi di FB (mis. sudah di-purge atau hard-delete).
        //    Ini mencegah item tombstone tertinggal di IndexedDB dan
        //    tetap dirender oleh sebagian halaman.
        const fbIds = new Set(fbItems.map(x => x.id));
        for (const loc of localAll0) {
          if (loc.deleted && !fbIds.has(loc.id)) {
            try { await (_origD ? _origD(store, loc.id) : DB.d(store, loc.id)); changed = true; }
            catch(e) {}
          }
        }

        // ── LIVE ITEMS (skip tombstones) ──
        const liveItems = fbItems.filter(x => !x.deleted);

        if (store === 'kamar') {
          // Kamar: dedup by nama — jika nama sudah ada lokal, skip; else tambah
          // Re-fetch lokal karena mungkin berubah setelah tombstone del di atas
          const localAll = await DB.ga('kamar');
          const localNames = new Set(localAll.map(k => (k.nama||'').trim().toLowerCase()));
          const localIds = new Set(localAll.map(k => k.id));
          for (const fbK of liveItems) {
            delete fbK._ts;
            const fbName = (fbK.nama||'').trim().toLowerCase();
            if (localIds.has(fbK.id)) {
              // Sama ID: update jika FB lebih baru
              const loc = localAll.find(k => k.id === fbK.id);
              if (!loc || (fbK.updatedAt||0) > (loc.updatedAt||0)) { await _origP('kamar', fbK); changed = true; }
            } else if (!localNames.has(fbName)) {
              // ID baru, nama baru → tambah
              await _origP('kamar', fbK); changed = true;
            }
            // ID baru tapi nama sudah ada → skip (duplikat nama)
          }
        } else if (store === 'santri') {
          // Santri: dedup by ID only, last-write-wins
          const localAll = await DB.ga('santri');
          const localMap = new Map(localAll.map(x => [x.id, x]));
          for (let fbObj of liveItems) {
            delete fbObj._ts; delete fbObj._srvTs;
            fbObj = await _restoreFoto('santri', fbObj);
            const loc = localMap.get(fbObj.id);
            if (!loc || (fbObj.updatedAt||0) > (loc.updatedAt||0)) { await _origP('santri', fbObj); changed = true; }
          }
        } else {
          // Store lainnya: merge by ID, last-write-wins dengan 3-way merge
          const localAll = await DB.ga(store);
          const localMap = new Map(localAll.map(x => [x.id, x]));
          for (let fbObj of liveItems) {
            delete fbObj._ts; delete fbObj._etag; delete fbObj._srvTs;
            if (store === 'users') fbObj = await _restoreFoto('users', fbObj);
            if (store === 'perizinan') fbObj = await _restoreFoto('perizinan', fbObj);
            if (store === 'pelanggaran') fbObj = await _restoreFoto('pelanggaran', fbObj);
            if (store === 'catatanSantri') fbObj = await _restoreFoto('catatanSantri', fbObj);
            const loc = localMap.get(fbObj.id);
            if (!loc) { await _origP(store, fbObj); changed = true; continue; }
            const fbTs  = fbObj.updatedAt  || fbObj.createdAt  || 0;
            const locTs = loc.updatedAt || loc.createdAt || 0;
            if (fbTs > locTs) {
              // Firebase jelas lebih baru → pakai FB
              await _origP(store, fbObj); changed = true;
            } else if (Math.abs(fbTs - locTs) < 30000 && fbTs !== locTs) {
              // Kedua admin edit hampir bersamaan (<30 detik selisih) → 3-way merge:
              // gabungkan semua field, prioritaskan yang updatedAt-nya lebih baru per-field
              const merged = Object.assign({}, loc);
              for (const key of Object.keys(fbObj)) {
                if (key === 'id' || key === '_ts') continue;
                if (fbObj[key] !== undefined && fbObj[key] !== loc[key]) {
                  // FB punya nilai berbeda → ambil versi dengan updatedAt lebih baru
                  if (fbTs >= locTs) merged[key] = fbObj[key];
                }
              }
              merged.updatedAt = Math.max(fbTs, locTs);
              await _origP(store, merged); changed = true;
            }
            // locTs > fbTs → lokal lebih baru → biarkan, write queue akan push ke FB
          }
        }
      }
      _dot('ok');
      // BUG FIX: kalau ada perubahan nyata, jadwalkan re-render halaman aktif
      // (pakai fungsi yang sama dengan real-time listener) supaya kegiatan/
      // sub-kegiatan baru atau yang dihapus di device lain langsung terlihat
      // tanpa perlu pindah halaman dulu.
      // AUDIT v3f: Invalidate memory cache untuk store yang baru di-pull
      // supaya render berikutnya baca data fresh dari IDB (bukan cache lama)
      if (changed) {
        stores.forEach(s => { if (typeof DB.invalidateCache === 'function') DB.invalidateCache(s); });
        _scheduleReRender();
      }
    } catch(e) {
      console.warn('[FB] pull error:', e.message);
      _dot('err');
    }
  }

  // Pull lengkap semua store — untuk setup awal / setelah login
  async function pullAll() {
    // ── AUDIT v3c: Hanya pull store esensial saat login ──
    // Sebelumnya: pullAll memuat 17 store sekaligus = ~850 docs per login.
    // Untuk 5 musyrifah login per hari = 4,250 reads hanya dari login.
    // Sekarang: hanya pull store yang SANGAT esensial untuk dashboard:
    //   - santri (untuk nama di dashboard)
    //   - sesi (untuk absensi hari ini)
    //   - absensi (untuk rekap hari ini)
    //   - kegiatan (untuk list kegiatan)
    //   - settings (untuk nama asrama, jenis kelamin)
    //   - kamar (untuk filter kamar)
    // Store lain (auditLog, peraturan, kalam, catatanSantri, pelanggaran,
    // perizinan, uzur, catatanSakit, anggota, users, subKeg) akan di-pull
    // on-demand saat user navigasi ke halaman terkait (dengan cache 5 menit).
    const ESSENTIAL = ['santri', 'sesi', 'absensi', 'kegiatan', 'settings', 'kamar'];
    await pull(ESSENTIAL);
    // Tandai essential stores sebagai sudah di-pull (cache 5 menit)
    ESSENTIAL.forEach(s => _markPulled(s));
  }

  // ════════════════════════════════════════════════════════
  // PUSH ALL: unggah semua data lokal ke Firebase
  // ════════════════════════════════════════════════════════
  async function pushAll() {
    if (!navigator.onLine) { T('\u26A0 Tidak ada koneksi internet'); return; }
    _dot('syncing'); T('\u23F3 Sinkronisasi cerdas...');
    const ALL = ['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','users','kamar','catatanSantri','pelanggaran','peraturan','settings','kalam','perizinan','uzur','catatanSakit'];
    let pushed=0, skipped=0, tombed=0, errors=0;
    try {
      for (const store of ALL) {
        const localAll = await DB.ga(store); if (!localAll.length) continue;
        // Ambil kondisi Firebase saat ini untuk store ini
        const fbRaw = await _fbFetch('/'+store).catch(()=>null);
        const fbMap = {};
        if (fbRaw && typeof fbRaw==='object') {
          Object.values(fbRaw).forEach(x=>{ if(x&&x.id) fbMap[x.id]=x; });
        }
        for (const loc of localAll) {
          // AUDIT v3j: FIX 'assignment to constant variable' — ubah const ke let
          // Sebelumnya: const fb = fbMap[loc.id] → tidak bisa di-reassign
          // di baris _restoreFoto. Sekarang pakai let.
          let fb = fbMap[loc.id];
          const locTs = loc.updatedAt || loc.createdAt || 0;
          const fbTs  = fb ? (fb.updatedAt || fb.createdAt || 0) : 0;
          // ── Jika FB punya tombstone untuk id ini, hapus lokal (jangan push) ──
          if (fb && fb.deleted) {
            if ((fb.updatedAt||0) >= locTs) {
              if (_origD) await _origD(store, loc.id);
              else await DB.d(store, loc.id);
              tombed++;
            } else {
              // Lokal lebih baru dari tombstone → re-create: push ulang
              await _fbFetch('/'+store+'/'+loc.id, 'PUT', _strip(loc));
              pushed++;
            }
            continue;
          }
          if (!fb || locTs > fbTs) {
            // Lokal lebih baru → push ke Firebase
            await _fbFetch('/'+store+'/'+loc.id, 'PUT', _strip(loc));
            pushed++;
          } else {
            // Firebase sama/lebih baru → pull ke lokal, jangan timpa
            delete fb._ts;
            if (store==='santri'||store==='users'||store==='perizinan'||store==='pelanggaran'||store==='catatanSantri') fb = await _restoreFoto(store, fb);
            await _origP(store, fb);
            skipped++;
          }
        }
      }
      _dot('ok');
      T('\u2705 Sync selesai: '+pushed+' diunggah, '+skipped+' diperbarui dari cloud' + (tombed ? ', '+tombed+' dihapus (tombstone)' : '') + (errors ? ', '+errors+' error' : ''));
    } catch(e) {
      _dot('err'); T('\u274C Gagal: ' + e.message);
      console.error('[pushAll] error:', e);
    }
  }

  // ════════════════════════════════════════════════════════
  // ABSENSI POLL — saat halaman abs terbuka, poll tiap 8 detik
  // ════════════════════════════════════════════════════════
  // ── AUDIT v3c: HAPUS startAbsPoll — onSnapshot sudah handle realtime ──
  // Sebelumnya: saat user buka halaman absensi, setInterval tiap 8 detik
  // memuat SELURUH koleksi absensi via _fbFetch('/absensi'). Untuk tenant
  // dengan 5,000 absensi docs × 1,350 polls/hari = 6.7 JUTA reads/hari per device!
  // Ini penyebab utama Firebase exceed free tier (396K reads dalam 1 hari).
  //
  // Sekarang: onSnapshot untuk absensi sudah aktif (di _REALTIME_STORES).
  // onSnapshot adalah push-based — Firestore aktif kirim perubahan ke device
  // tanpa perlu poll. Initial load hanya 1x saat listener attach (bukan tiap 8 detik).
  //
  // Fungsi startAbsPoll/stopAbsPoll tetap di-keep sebagai no-op (empty function)
  // supaya kode existing yang memanggil tidak crash (backward compat).
  function startAbsPoll(sid) {
    // NO-OP: onSnapshot untuk absensi sudah aktif, tidak perlu poll.
    // Jika ada perubahan absensi di device lain, onSnapshot akan push ke device ini
    // dan _handleDocChange akan update IDB + UI card.
    console.log('[FBSync] startAbsPoll no-op (onSnapshot handles realtime for absensi)');
  }
  function stopAbsPoll() {
    // NO-OP: tidak ada interval untuk di-clear
  }

  // ════════════════════════════════════════════════════════
  // REAL-TIME LISTENERS — onSnapshot untuk semua store
  // Menerima update langsung dari Firestore (termasuk tombstone)
  // sehingga perubahan di perangkat lain langsung terlihat tanpa
  // perlu navigasi atau pull manual. Ini memperbaiki bug "hapus
  // kegiatan di HP A tidak terhapus di HP B" — sebelumnya sync
  // hanya pull-based (harus navigasi dulu), sekarang push-based
  // (Firestore aktif kirim notifikasi perubahan ke semua device).
  // ════════════════════════════════════════════════════════
  let _unsubs = [];
  // BUG FIX: penghitung generasi listener. Setiap kali startListeners()/
  // stopListeners() dipanggil, generasi naik. Timer reconnect yang dijadwalkan
  // oleh generasi LAMA akan membatalkan diri jika generasi sudah berubah —
  // mencegah listener "zombie" menyala kembali setelah stopListeners()
  // sengaja dipanggil (mis. saat offline).
  let _listenerGen = 0;
  let _renderTimer = null;
  // Mapping halaman → fungsi re-render. Pakai S._opts (diset oleh App.nav)
  // untuk mendapatkan ID konteks (kgId, skId, sntId, dll).
  const _RENDER_MAP = {
    dash: () => App.dash?.(),
    kg:   () => App.renderKg?.(),
    kgd:  () => { const id=S._opts?.id; if(id) App.renderKgd?.(id); },
    sub:  () => { const id=S._opts?.id; if(id) App.renderSub?.(id); },
    abs:  () => { if(S._sesiId) App.renderAbs?.(S._sesiId, S._skId); },
    snt:  () => App.renderSnt?.(),
    sntd: () => { const id=S._opts?.id; if(id) App.renderProfil?.(id); },
    profil: () => { const id=S._opts?.id; if(id) App.renderProfil?.(id); },
    rek:  () => App.renderRek?.(),
    set:  () => App.renderSet?.(),
    pel:  () => App.renderPel?.(),
    izn:  () => App.renderIzn?.(),
  };

  function _scheduleReRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => {
      _renderTimer = null;
      const pg = S.page;
      const fn = _RENDER_MAP[pg];
      if (fn) {
        // ── AUDIT v3: PRESERVE SCROLL POSITION & FOCUS ──
        // Sebelumnya, re-render via innerHTML me-reset scrollTop ke 0 dan
        // hilangkan focus dari input aktif. Ini penyebab user complaint:
        // "scroll ke atas sedikit tiba2 langsung loncat ke halaman paling atas".
        // Sekarang: simpan scrollTop container utama (#app) + .sb (bottom sheet)
        // + activeElement + selection range, lalu restore setelah re-render.
        // AUDIT v3 b: Optimasi — jangan querySelectorAll('*') (ribuan elemen),
        // cukup simpan scrollTop dari #app + .sb + #chat-messages-wrap saja.
        const _scrollStates = [];
        const _scrollContainerIds = ['app', 'bs', 'si', 'chat-messages-wrap'];
        _scrollContainerIds.forEach(id => {
          const el = document.getElementById(id);
          if (el && (el.scrollTop > 0 || el.scrollLeft > 0)) {
            _scrollStates.push({ el, top: el.scrollTop, left: el.scrollLeft });
          }
        });
        // Simpan active element + selection
        const _activeEl = document.activeElement;
        const _selStart = _activeEl?.selectionStart;
        const _selEnd = _activeEl?.selectionEnd;
        const _activeId = _activeEl?.id || _activeEl?.dataset?.id || null;
        const _activeTag = _activeEl?.tagName?.toLowerCase() || null;
        try {
          fn();
        } catch(e) { console.warn('[FB Listener] re-render error:', e); }
        // Restore scroll positions
        // Pakai requestAnimationFrame supaya DOM sudah selesai di-rebuild
        requestAnimationFrame(() => {
          _scrollStates.forEach(s => {
            if (s.el && s.el.isConnected) {
              try {
                s.el.scrollTop = s.top;
                s.el.scrollLeft = s.left;
              } catch(e) {}
            }
          });
          // Restore focus + selection
          if (_activeId && _activeTag) {
            const newActive = document.getElementById(_activeId) ||
              document.querySelector(`[data-id="${_activeId}"]`);
            if (newActive && newActive.tagName?.toLowerCase() === _activeTag) {
              try {
                newActive.focus();
                if (_selStart !== undefined && _selEnd !== undefined &&
                    typeof newActive.setSelectionRange === 'function') {
                  newActive.setSelectionRange(_selStart, _selEnd);
                }
              } catch(e) {}
            }
          }
        });
      }
    }, 600);
  }

  // Proses satu perubahan dokumen dari Firestore
  // ── AUDIT v3: Re-render hanya jika store RELEVAN dengan halaman aktif ──
  // Sebelumnya: setiap perubahan Firestore memicu _scheduleReRender tanpa cek
  // apakah store tsb ditampilkan di halaman aktif. Akibatnya: user di halaman
  // Santri tetap di-re-render saat ada perubahan absensi di device lain.
  // Sekarang: mapping store → halaman yang menampilkan store tsb.
  const _STORE_TO_PAGES = {
    absensi: ['dash','abs','kgd','rek','profil'],
    sesi:    ['dash','kg','kgd','sub','abs','rek'],
    settings: ['dash','set','snt','kg'],
    // AUDIT v3k: Tambah mapping untuk store realtime baru
    anggota: ['kg','kgd','sub','abs'],      // anggota relevan di halaman kegiatan & absensi
    perizinan: ['izn','dash','profil','abs'], // perizinan relevan di halaman perizinan & dashboard
    pelanggaran: ['pel','dash','profil'],     // pelanggaran relevan di halaman pelanggaran & dashboard
    // AUDIT v3l: Tambah mapping untuk uzur & catatanSakit
    uzur: ['dash','abs','profil'],            // uzur relevan di dashboard, absensi, profil
    catatanSakit: ['dash','izn','abs','profil'], // catatanSakit relevan di dashboard, perizinan, absensi, profil
  };
  function _isStoreRelevantToCurrentPage(store) {
    const pages = _STORE_TO_PAGES[store];
    if (!pages) return true; // unknown store → conservative: re-render
    return pages.includes(S.page);
  }

  async function _handleDocChange(store, doc) {
    // ── AUDIT v3i: Sync trigger detection ──
    // Jika store='settings' dan doc.id='_syncTrigger', invalidate SEMUA cache
    // dan force pull halaman aktif. Ini mengatasi "import di device A tidak
    // muncul di device B" — device B ter-trigger via onSnapshot settings.
    if (store === 'settings' && doc.id === '_syncTrigger') {
      console.log('[FBSync] Sync trigger detected! Invalidating cache + force pull...');
      // Invalidate semua cache
      if (typeof DB.invalidateCache === 'function') DB.invalidateCache();
      if (_invalidateCache) _invalidateCache();
      // Force pull halaman aktif (bypass cache)
      const pg = (typeof S !== 'undefined' && S.page) || 'dash';
      if (pg && pg !== 'chat') {
        try {
          // AUDIT v3l: Pull SEMUA store (on-demand only — realtime store sudah
          // di-handle oleh onSnapshot, tidak perlu pull manual)
          await pull(['santri','kegiatan','subKeg','kamar','users','peraturan','kalam','auditLog','catatanSantri']).catch(()=>{});
          // Re-render halaman aktif
          _scheduleReRender();
          if (window.T) T('🔄 Data disinkronkan dari perangkat lain', 3000);
        } catch(e) { console.warn('[FBSync] sync trigger pull error:', e); }
      }
      return; // Jangan proses doc ini lebih lanjut
    }
    if (!doc.exists) {
      // Doc hard-deleted dari FB (jarang terjadi dengan strategi tombstone,
      // tapi tangani sebagai jaring pengaman)
      try { await (_origD ? _origD(store, doc.id) : DB.d(store, doc.id)); }
      catch(e) {}
      // Hanya re-render jika store relevan dengan halaman aktif
      if (_isStoreRelevantToCurrentPage(store)) _scheduleReRender();
      return;
    }
    const data = doc.data();
    if (!data || !data.id) return;

    if (data.deleted) {
      // ── TOMBSTONE — hapus salinan lokal ──
      // Hanya hapus jika lokal ada dan tombstone lebih baru/equal.
      // Pakai _origD (bukan DB.d yang di-patch) supaya tidak
      // men-trigger antrian write lagi (echo tombstone tidak perlu).
      try {
        const loc = await DB.g(store, data.id).catch(()=>null);
        if (loc && (data.updatedAt||0) >= (loc.updatedAt||0)) {
          // Ambil nama untuk toast informatif (jika ada)
          const displayName = loc.nama || loc.id;
          await (_origD ? _origD(store, data.id) : DB.d(store, data.id));
          if (_isStoreRelevantToCurrentPage(store)) _scheduleReRender();
          console.log('[FB Listener] tombstone applied:', store, data.id);
          // ── IMPROVED: Toast visible untuk store user-facing ──
          // Beritahu user bahwa item ini dihapus di device lain, supaya
          // mereka tidak bingung kenapa data hilang.
          if (window.T && ['kegiatan','subKeg','santri','anggota','kamar','users'].includes(store)) {
            const storeLabel = {kegiatan:'Kegiatan',subKeg:'Sub-kegiatan',santri:'Santri',anggota:'Anggota',kamar:'Kamar',users:'User'}[store] || store;
            T('🗑 ' + storeLabel + ' \"' + (displayName||'').slice(0,30) + '\" dihapus di perangkat lain');
          }
        }
      } catch(e) { console.warn('[FB Listener] tombstone error:', store, data.id, e); }
    } else {
      // ── LIVE ITEM — merge/update lokal jika FB lebih baru ──
      try {
        const fbObj = Object.assign({}, data);
        delete fbObj._ts; delete fbObj._etag; delete fbObj._srvTs;
        const loc = await DB.g(store, data.id).catch(()=>null);
        const fbTs = fbObj.updatedAt || fbObj.createdAt || 0;
        const locTs = loc ? (loc.updatedAt || loc.createdAt || 0) : 0;
        if (!loc) {
          // Item baru dari FB — simpan lokal
          await (_origP ? _origP(store, fbObj) : DB.p(store, fbObj));
          if (_isStoreRelevantToCurrentPage(store)) _scheduleReRender();
        } else if (fbTs > locTs) {
          // ── AUDIT v3m: CRITICAL FIX — Jangan timpa status absensi valid dengan alpha ──
          // Jika store='absensi' dan lokal punya status valid (hadir/izin/sakit/uzur/terlambat)
          // tapi cloud kirim 'alpha', JANGAN timpa. Ini terjadi jika auto-lock di device lain
          // salah create record alpha dengan timestamp lebih baru.
          // Kecuali jika user manual set alpha (oleh field bukan 'Sistem (Auto')
          const VALID_STATUSES = ['hadir','izin','sakit','uzur','terlambat'];
          if (store === 'absensi' && loc.status && VALID_STATUSES.includes(loc.status) &&
              fbObj.status === 'alpha' && fbObj.oleh && fbObj.oleh.includes('Sistem (Auto')) {
            // Cloud kirim auto-alpha tapi lokal punya status valid — SKIP, keep lokal
            console.warn('[FB Listener] SKIP auto-alpha untuk', data.id, '— lokal punya status valid:', loc.status);
            // Push lokal ke cloud supaya cloud juga update ke status yang benar
            if (_origP) { await _origP(store, loc); FBSync.write('set', store, loc); }
          } else {
            // FB lebih baru — update lokal
            await (_origP ? _origP(store, fbObj) : DB.p(store, fbObj));
            if (_isStoreRelevantToCurrentPage(store)) _scheduleReRender();
          }
        }
        // locTs >= fbTs → lokal sama/lebih baru → biarkan, write queue akan push ke FB
      } catch(e) { console.warn('[FB Listener] live item error:', store, data.id, e); }
    }
  }

  // ── AUDIT v3: OFFLINE-FIRST — Realtime HANYA untuk absensi & sesi ──
  // Sebelumnya: 10 store realtime + 6 store polling = 16 sumber trigger re-render.
  // Itu penyebab app lemot: setiap perubahan kecil di Firestore (bahkan di store
  // yang tidak sedang dilihat user) memicu _scheduleReRender yang rebuild DOM.
  // Sekarang: HANYA absensi & sesi yang realtime (memang perlu cross-device sync
  // saat sedang aktif absensi). Semua store lain: load once saat dibutuhkan,
  // cache 5 menit, tidak ada background polling.
  // User feedback: "Aplikasi harus offline first, jangan semua2 online"
  // AUDIT v3l: Tambah 'uzur' & 'catatanSakit' ke realtime
  // uzur: santri uzur → status absensi jadi 'uzur' bukan 'alpha'
  // catatanSakit: santri sakit → status absensi jadi 'sakit' bukan 'alpha'
  // Keduanya berdampak langsung ke logika absensi — harus sync cepat.
  const _REALTIME_STORES = ['absensi', 'sesi', 'settings', 'anggota', 'perizinan', 'pelanggaran', 'uzur', 'catatanSakit'];
  // Backward-compat alias
  const _LISTENER_STORES = _REALTIME_STORES;
  // Store yang di-load on-demand (saat nav ke halaman tsb), bukan realtime
  // dan bukan polling. Cache 5 menit supaya nav back-forth tidak re-fetch.
  // AUDIT v3l: Hapus uzur & catatanSakit dari on-demand (sudah realtime)
  const _ON_DEMAND_STORES = ['santri','kegiatan','subKeg','kamar','users','peraturan','kalam','auditLog','catatanSantri'];
  // Cache: { storeName: timestampLastPullMs }
  const _pullCache = {};
  const _PULL_CACHE_TTL = 5 * 60 * 1000; // 5 menit

  // Cek apakah store perlu di-pull lagi (lebih dari TTL sejak pull terakhir)
  function _needsPull(store) {
    const last = _pullCache[store] || 0;
    return (Date.now() - last) > _PULL_CACHE_TTL;
  }
  function _markPulled(store) {
    _pullCache[store] = Date.now();
  }
  // Force refresh — bypass cache (dipanggil dari tombol Refresh di header)
  function _invalidateCache(store) {
    if (store) delete _pullCache[store];
    else Object.keys(_pullCache).forEach(k => delete _pullCache[k]);
  }

  // ── BUG FIX: listener resilience ────────────────────────────────────
  // Firestore's onSnapshot() PERMANENTLY kills a listener the moment its
  // error callback fires (network blip, transient permission hiccup, dsb).
  // Kode lama hanya console.warn saat error — listener itu lalu diam
  // selamanya dan device tsb berhenti menerima perubahan real-time untuk
  // store itu (termasuk tombstone hapus) sampai halaman di-reload manual.
  // Ini persis gejala "kadang sinkron kadang tidak" yang dilaporkan.
  // Sekarang: tiap store attach independen & auto-reconnect dengan backoff
  // kalau listener-nya mati.
  function _attachListener(store, myGen, retryDelay) {
    if (myGen !== _listenerGen) return; // generasi basi — jangan nyalakan lagi
    if (!navigator.onLine) return;
    try {
      const unsub = _tenantCol(store).onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          if (myGen !== _listenerGen) return; // listener basi, abaikan event
          snapshot.docChanges().forEach(change => {
            // Proses 'added' (saat listener pertama attach), 'modified'
            // (update dari device lain), dan 'removed' (hard-delete dari
            // FB — defensive, seharusnya tidak terjadi dengan strategi
            // tombstone, tapi tangani sebagai jaring pengaman).
            if (change.type === 'added' || change.type === 'modified') {
              _handleDocChange(store, change.doc);
            } else if (change.type === 'removed') {
              // Hard-delete dari FB — hapus lokal juga
              _handleDocChange(store, change.doc); // change.doc.exists akan false → masuk branch !doc.exists
            }
          });
        },
        err => {
          console.warn('[FB Listener] error on', store, '— reconnect dalam', (retryDelay||5000)+'ms', err);
          if (myGen !== _listenerGen) return; // sudah di-stop/restart, jangan reconnect
          const idx = _unsubs.findIndex(u => u._store === store && u._gen === myGen);
          if (idx >= 0) _unsubs.splice(idx, 1);
          const nextDelay = Math.min((retryDelay||5000) * 1.6, 60000);
          setTimeout(() => _attachListener(store, myGen, nextDelay), retryDelay||5000);
        }
      );
      unsub._store = store; unsub._gen = myGen;
      _unsubs.push(unsub);
    } catch(e) {
      console.warn('[FB Listener] failed to start for', store, e, '— retry dalam', (retryDelay||5000)+'ms');
      const nextDelay = Math.min((retryDelay||5000) * 1.6, 60000);
      setTimeout(() => _attachListener(store, myGen, nextDelay), retryDelay||5000);
    }
  }

  function startListeners() {
    stopListeners();
    if (!navigator.onLine) return;
    _listenerGen++;
    const myGen = _listenerGen;
    // ── AUDIT v3h: LAZY LISTENER + DEDUP ──
    // Hanya attach jika halaman aktif butuh realtime.
    // Halaman yang butuh realtime absensi/sesi: dash, abs, kgd, rek, profil, kg, sub
    const REALTIME_PAGES = ['dash', 'abs', 'kgd', 'rek', 'profil', 'kg', 'sub', 'pel', 'izn'];
    const currentPage = (typeof S !== 'undefined' && S.page) || 'dash';
    if (!REALTIME_PAGES.includes(currentPage)) {
      console.log('[FB Listeners] Skipped — page', currentPage, 'tidak butuh realtime');
      _startHealthCheck(myGen);
      return;
    }
    // AUDIT v3h: Cek apakah listener untuk store ini sudah ada di generasi ini
    // Jika sudah ada, skip (cegah duplicate listener yang menyebabkan 116 listeners)
    _REALTIME_STORES.forEach(store => {
      const existing = _unsubs.find(u => u._store === store && u._gen === myGen);
      if (existing) {
        console.log('[FB Listeners] Skip duplicate for', store, '(already attached)');
        return;
      }
      _attachListener(store, myGen, 5000);
    });
    console.log('[FB Listeners] Started for', _REALTIME_STORES.length, 'realtime stores (gen', myGen+') — page:', currentPage, '— active listeners:', _unsubs.length);
    _startHealthCheck(myGen);
  }

  // AUDIT v3g: Health check terpisah supaya bisa jalan meski listener tidak attach
  function _startHealthCheck(myGen) {
    if (_healthTimer) clearInterval(_healthTimer);
    _healthTimer = setInterval(() => {
      if (myGen !== _listenerGen) {
        clearInterval(_healthTimer);
        return;
      }
      if (!navigator.onLine) return;
      // Hanya restart jika ada listener yang seharusnya aktif tapi mati
      const REALTIME_PAGES = ['dash', 'abs', 'kgd', 'rek', 'profil', 'kg', 'sub', 'pel', 'izn'];
      const currentPage = (typeof S !== 'undefined' && S.page) || 'dash';
      if (REALTIME_PAGES.includes(currentPage) && _unsubs.length < _REALTIME_STORES.length) {
        console.warn('[FB Listeners] Health check: hanya', _unsubs.length, '/', _REALTIME_STORES.length, 'aktif — restart');
        _listenerGen++;
        const newGen = _listenerGen;
        _REALTIME_STORES.forEach(store => _attachListener(store, newGen, 5000));
      }
    }, 120000); // 2 menit
  }

  let _healthTimer = null;

  function stopListeners() {
    _listenerGen++; // basikan semua timer reconnect yang mungkin masih terjadwal
    if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
    if (_unsubs.length) {
      _unsubs.forEach(u => { try { u(); } catch(e){} });
      _unsubs = [];
      console.log('[FB Listeners] Stopped');
    }
  }

  // ════════════════════════════════════════════════════════
  // NAV PULL: store yang di-pull saat navigasi ke halaman tertentu
  // ════════════════════════════════════════════════════════
  const NAV_PULL = {
    // AUDIT v3l: Hapus uzur & catatanSakit dari nav pull (sudah realtime)
    // Store yang sudah realtime (absensi, sesi, settings, anggota, perizinan,
    // pelanggaran, uzur, catatanSakit) TIDAK perlu di-pull — onSnapshot handle.
    dash:    ['kegiatan','subKeg','kalam'],
    kg:      ['kegiatan','subKeg'],
    kgd:     ['kegiatan','subKeg'],
    sub:     ['subKeg','santri'],
    abs:     ['santri','kegiatan','subKeg'],
    snt:     ['santri','kamar'],
    sntd:    ['santri','catatanSantri'],
    rek:     ['santri','kegiatan','subKeg'],
    set:     ['users','kalam'],
    pel:     ['santri','peraturan','kegiatan','subKeg'],
    izn:     ['santri'],
    profil:  ['santri','catatanSantri'],
    chat:    [],
  };

  async function pullForNav(pg) {
    // ── AUDIT v3: Pull on-demand dengan cache 5 menit ──
    // Sebelumnya: setiap navigasi antar tab memicu pull store terkait,
    // tanpa cache. User bolak-balik tab = pull berulang = borak Reads & lemot.
    // Sekarang: cek cache dulu, hanya pull jika sudah > 5 menit sejak pull terakhir.
    // Store absensi & sesi TIDAK perlu di-pull di sini karena sudah realtime.
    const stores = (NAV_PULL[pg] || []).filter(s => !_REALTIME_STORES.includes(s));
    const toPull = stores.filter(s => _needsPull(s));
    if (toPull.length) {
      // Tandai sebagai "sedang di-pull" supaya nav berikutnya tidak double-pull
      toPull.forEach(s => _markPulled(s));
      // Pull NON-BLOCKING — return immediately, pull berjalan di background.
      // Data dari IDB (yang mungkin stale) sudah dipakai render oleh _origNav.
      // Setelah pull selesai, re-render halaman aktif kalau user masih di sana.
      pull(toPull).then(() => {
        if (S.page === pg) {
          // Re-render untuk update UI dengan data terbaru dari cloud
          _scheduleReRender();
        }
      }).catch(e => {
        console.warn('[pullForNav] error:', e.message);
        // Reset cache supaya bisa retry di nav berikutnya
        toPull.forEach(s => { _pullCache[s] = 0; });
      });
    }
  }

  function setOrigP(fn) { _origP = fn; }
  function setOrigD(fn) { _origD = fn; }

  // ── IMPROVED: Tombstone sweep — periodically clean up ──
  // Scan all IDB stores for any items marked deleted:true (tombstones
  // yang tertinggal di lokal) dan hapus. Juga scan FB untuk tombstone
  // yang mungkin terlewat oleh listener. Dipanggil periodik (5 menit)
  // dan setelah pullAll pertama.
  async function _sweepTombstones() {
    // ── AUDIT v3c: HAPUS pull 4 store dari _sweepTombstones ──
    // Sebelumnya: _sweepTombstones tiap 5 menit memanggil pull(['kegiatan',
    // 'subKeg', 'anggota', 'sesi']) — itu 4 store × ~50 docs × 288 sweeps/hari
    // = 57,600 reads/hari hanya dari tombstone sweep!
    // Sekarang: HANYA sweep lokal (IDB) — hapus item dengan deleted:true dari
    // IndexedDB. Tidak ada Firestore read sama sekali. Tombstone dari cloud
    // sudah ditangkap oleh onSnapshot (untuk absensi & sesi) atau oleh
    // pullForNav saat user navigasi ke halaman terkait (dengan cache 5 menit).
    if (!navigator.onLine) return;
    const STORES = ['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','users','kamar','catatanSantri','pelanggaran','peraturan','settings','kalam','perizinan','uzur','catatanSakit'];
    let cleaned = 0;
    // Sweep lokal: hapus item dengan deleted:true dari IDB (ZERO Firestore reads)
    for (const store of STORES) {
      try {
        const all = await DB.ga(store).catch(()=>[]);
        for (const item of all) {
          if (item.deleted) {
            try { await (_origD ? _origD(store, item.id) : DB.d(store, item.id)); cleaned++; }
            catch(e) {}
          }
        }
      } catch(e) {}
    }
    if (cleaned > 0) {
      console.log('[FBSync] Tombstone sweep: cleaned ' + cleaned + ' local tombstone(s)');
      if (window.T) T('🧹 ' + cleaned + ' data usang dibersihkan');
      _scheduleReRender();
    }
    // Health check listener real-time. Kalau jumlah listener aktif tidak sesuai
    // jumlah store yang seharusnya, restart semua listener dari nol.
    if (_unsubs.length < _LISTENER_STORES.length) {
      console.warn('[FBSync] Listener health check: hanya', _unsubs.length, 'dari', _LISTENER_STORES.length, '— restart semua listener.');
      startListeners();
    }
  }

  function start() {
    if (!navigator.onLine) { _dot('off'); return; }
    _dot('syncing');
    // ── H3 BUG FIX: Load persisted queue sebelum sync ──
    // Recover write yang tertinggal dari sesi sebelumnya (offline + reload)
    _loadPersistedQueue().then(() => {
      // Setelah load, coba flush segera (kalau ada yang pending)
      _flushWrites();
      // ── IMPROVED: start listeners INPARALLEL with pullAll ──
      // Sebelumnya startListeners ada di .then() pullAll — kalau pullAll
      // reject (jarang tapi mungkin), listeners tidak pernah start, dan
      // perubahan dari device lain (terutama tombstone/hapus) tidak
      // terdeteksi. Sekarang start listeners paralel dengan pullAll
      // supaya real-time updates langsung aktif.
      startListeners();
      pullAll().then(() => {
        // Setelah sync cloud selesai, cek duplikat lagi
        setTimeout(() => _deduplicateAll().catch(()=>{}), 1000);
        // ── IMPROVED: Tombstone sweep setelah pull pertama ──
        // Bersihkan item lokal yang tertinggal sebagai tombstone di IDB
        // (seharusnya tidak terjadi jika pull berjalan normal, tapi
        // defensive untuk kasus edge).
        setTimeout(() => _sweepTombstones().catch(()=>{}), 2000);
      }).catch(e => {
        console.warn('[FBSync] pullAll error, listeners already running:', e.message);
      });
    });
  }

  return { write, pull, pullAll, pullForNav, pushAll, startAbsPoll, stopAbsPoll, start, setOrigP, setOrigD, _dot, _flushWrites, startListeners, stopListeners, _handleDocChange, _sweepTombstones, _needsPull, _markPulled, _invalidateCache, _pullCache };
})();

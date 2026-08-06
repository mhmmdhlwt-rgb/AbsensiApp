// js/nfc.js — AbsensiApp
'use strict';

const NFC = {
  _reader: null,
  _active: false,
  _sesiId: null,
  _abortCtrl: null,

  isSupported() { return 'NDEFReader' in window; },

  async toggle(sesiId) {
    if (this._active) { this.stop(); return; }
    await this.start(sesiId);
  },

  async start(sesiId) {
    if (!this.isSupported()) {
      OS(`<div class="cw">
        <div class="ci3">📡</div>
        <div class="ct3">NFC Tidak Tersedia</div>
        <div class="cs3">Perangkat ini tidak mendukung Web NFC, atau izin NFC belum diberikan.<br><br>Pastikan NFC aktif di Pengaturan HP dan gunakan browser Chrome terbaru.</div>
        <div class="cbs"><button class="cc" onclick="CS()">Tutup</button></div>
      </div>`);
      return;
    }
    try {
      this._sesiId = sesiId;
      this._abortCtrl = new AbortController();
      this._reader = new NDEFReader();
      await this._reader.scan({ signal: this._abortCtrl.signal });
      this._active = true;
      this._updateBtn(true);
      this._showOverlay();
      this._log('✅ NDEFReader.scan() berhasil, menunggu tag...');

      // Listen ke SEMUA kemungkinan nama event yang dipakai polyfill
      const allEventNames = ['reading','tagdiscovered','nfctag','tag','ndefreading','read'];
      allEventNames.forEach(evName => {
        this._reader.addEventListener(evName, (e) => {
          this._log('📥 Event "'+evName+'" terpicu!');
          this._onRead(e);
        });
      });
      this._reader.addEventListener('readingerror', (e) => {
        this._log('❌ readingerror: '+JSON.stringify(e));
        SFX.error();
        T('⚠️ Gagal membaca kartu, coba lagi');
      });

      // Juga pasang listener langsung ke window & document (jaga-jaga polyfill dispatch di sana)
      this._windowListeners = [];
      this._docListeners = [];
      allEventNames.forEach(evName => {
        const wFn = (e) => { this._log('📥 window event "'+evName+'"'); this._onRead(e); };
        const dFn = (e) => { this._log('📥 document event "'+evName+'"'); this._onRead(e); };
        window.addEventListener(evName, wFn);
        document.addEventListener(evName, dFn);
        this._windowListeners.push({evName, fn: wFn});
        this._docListeners.push({evName, fn: dFn});
      });
    } catch(e) {
      this._active = false;
      this._log('❌ scan() gagal: '+e.message);
      if (e.name === 'NotAllowedError') {
        T('⚠️ Izin NFC ditolak. Aktifkan di pengaturan browser.');
      } else {
        T('⚠️ NFC error: ' + e.message);
      }
    }
  },

  _logBuffer: [],
  _log(msg) {
    console.log('[NFC]', msg);
    const time = new Date().toLocaleTimeString('id-ID');
    this._logBuffer.unshift(`<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.1)"><span style="opacity:.5">${time}</span> ${msg}</div>`);
    if (this._logBuffer.length > 30) this._logBuffer.pop();
    const el = document.getElementById('nfc-debug-log');
    if (el) el.innerHTML = this._logBuffer.join('');
  },

  showLastLog() {
    OS(`<div class="sh">🐛 Debug Log NFC</div><div class="sb" style="padding-bottom:30px">
      <div style="background:var(--gs);border-radius:var(--r3);padding:10px;font-size:10px;font-family:monospace;color:var(--t1);max-height:50vh;overflow-y:auto">
        ${this._logBuffer.length ? this._logBuffer.join('') : '<div style="color:var(--t4)">Belum ada log. Aktifkan mode NFC dan tempelkan kartu.</div>'}
      </div>
    </div>`);
  },

  stop() {
    if (this._abortCtrl) { try { this._abortCtrl.abort(); } catch(e){} }
    if (this._windowListeners) this._windowListeners.forEach(l => window.removeEventListener(l.evName, l.fn));
    if (this._docListeners) this._docListeners.forEach(l => document.removeEventListener(l.evName, l.fn));
    this._windowListeners = [];
    this._docListeners = [];
    this._active = false;
    this._reader = null;
    this._abortCtrl = null;
    this._sesiId = null;
    this._updateBtn(false);
    this._hideOverlay();
  },

  _updateBtn(on) {
    const btn = document.getElementById('nfc-toggle-btn');
    if (!btn) return;
    if (on) {
      btn.style.background = 'linear-gradient(135deg,rgba(13,181,127,.25),rgba(201,162,39,.2))';
      btn.style.border = '2px solid var(--a1)';
      btn.innerHTML = '<span style="animation:pulse 1s infinite">📡</span> NFC Aktif';
    } else {
      btn.style.background = 'var(--gs)';
      btn.style.border = '1.5px solid rgba(13,181,127,.25)';
      btn.innerHTML = '📡 NFC';
    }
  },

  _showOverlay() {
    let ov = document.getElementById('nfc-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'nfc-overlay';
      ov.innerHTML = `
        <div style="text-align:center;width:100%;max-width:340px">
          <div id="nfc-ov-icon" style="font-size:56px;margin-bottom:10px;animation:nfcPulse 1.4s ease-in-out infinite">📡</div>
          <div id="nfc-ov-title" style="font-family:var(--fd);font-size:16px;font-weight:800;color:#fff;margin-bottom:6px">Mode NFC Aktif</div>
          <div id="nfc-ov-sub" style="font-size:12px;color:rgba(255,255,255,.75);margin-bottom:18px">Tempelkan kartu ke belakang HP</div>
          <div id="nfc-ov-result" style="min-height:44px;margin-bottom:14px"></div>
          <button onclick="NFC.stop()" style="padding:11px 24px;border-radius:100px;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.3);color:#fff;font-size:13px;font-weight:700;cursor:pointer;backdrop-filter:blur(10px);margin-bottom:8px">✕ Tutup NFC</button>
          <div id="nfc-desktop-hint" style="display:none;font-size:11px;color:rgba(255,255,255,.75);text-align:center;margin-bottom:8px;line-height:1.5">
            🖥️ Mode Laptop/Desktop<br>
            Tempelkan kartu ke USB NFC reader<br>
            <button onclick="NFCUsb.connectHID().then(ok=>ok&&T('✅ HID terhubung'))" style="margin-top:6px;padding:6px 14px;border-radius:100px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);color:#fff;font-size:10px;cursor:pointer">🔌 Hubungkan via WebHID</button>
          </div>
          <div style="background:rgba(0,0,0,.4);border-radius:10px;padding:10px;text-align:left;max-height:160px;overflow-y:auto">
            <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.5);text-transform:uppercase;margin-bottom:5px">🐛 Debug Log</div>
            <div id="nfc-debug-log" style="font-size:10px;color:rgba(255,255,255,.8);font-family:monospace;line-height:1.4"></div>
          </div>
        </div>`;
      ov.style.cssText = 'position:fixed;inset:0;z-index:9980;background:rgba(5,30,20,.92);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:24px';
      document.body.appendChild(ov);
    } else {
      ov.style.display = 'flex';
      const desktopHint = document.getElementById('nfc-desktop-hint');
    if (desktopHint) desktopHint.style.display = NFCUsb.isDesktop() ? 'block' : 'none';
    const logEl = document.getElementById('nfc-debug-log');
      if (logEl) logEl.innerHTML = '';
    }
  },

  _hideOverlay() {
    const ov = document.getElementById('nfc-overlay');
    if (ov) ov.style.display = 'none';
  },

  _showResult(html) {
    const el = document.getElementById('nfc-ov-result');
    if (el) { el.innerHTML = html; setTimeout(() => { if(el)el.innerHTML=''; }, 3000); }
  },

  _showBigResult(santri, subtitle) {
    const icon = document.getElementById('nfc-ov-icon');
    const title = document.getElementById('nfc-ov-title');
    const sub = document.getElementById('nfc-ov-sub');
    const el = document.getElementById('nfc-ov-result');
    if (!icon || !el) return;
    const savedIcon = icon.innerHTML, savedTitle = title?.innerHTML, savedSub = sub?.innerHTML;
    const savedIconStyle = icon.style.cssText;
    icon.style.cssText = 'margin-bottom:10px';
    icon.innerHTML = `<div style="width:112px;height:112px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800;color:#fff;overflow:hidden;margin:0 auto;box-shadow:0 0 0 4px rgba(13,181,127,.35),0 8px 30px rgba(0,0,0,.4)">${santri.foto?`<img src="${santri.foto}" style="width:100%;height:100%;object-fit:cover">`:santri.nama.charAt(0)}</div>`;
    if (title) title.innerHTML = `<span style="font-size:22px">${santri.nama}</span>`;
    if (sub) sub.innerHTML = `<span style="font-size:13px;color:#6ee7b7;font-weight:700">${subtitle}</span>`;
    el.innerHTML = '';
    setTimeout(() => {
      icon.style.cssText = savedIconStyle;
      icon.innerHTML = savedIcon;
      if (title) title.innerHTML = savedTitle;
      if (sub) sub.innerHTML = savedSub;
    }, 3200);
  },

  async _onRead(event) {
    // AppMint polyfill & Web NFC standard — coba semua kemungkinan sumber UID
    let rawUid = '';

    // 1. Standard Web NFC: event.serialNumber
    if (event.serialNumber) rawUid = event.serialNumber;

    // 2. AppMint polyfill mungkin kirim via event.detail.serialNumber
    else if (event.detail?.serialNumber) rawUid = event.detail.serialNumber;

    // 3. Fallback: cek message records (NDEF)
    else if (event.message?.records?.length) {
      const rec = event.message.records[0];
      if (rec.recordType === 'text') {
        const decoder = new TextDecoder(rec.encoding||'utf-8');
        rawUid = decoder.decode(rec.data);
      }
    }

    // 4. AppMint kadang kirim langsung string UID (bukan event object)
    if (!rawUid && typeof event === 'string') rawUid = event;

    // Normalize: hapus semua separator, uppercase
    const normalize = (s) => (s||'').toUpperCase().replace(/[:\s\-\.]/g,'').trim();
    const uid2 = normalize(rawUid);
    const uidFmt = rawUid.toUpperCase()||'(kosong)';

    if (!uid2) {
      SFX.error();
      this._showResult(`<div style="background:rgba(239,68,68,.2);border:1.5px solid rgba(239,68,68,.4);border-radius:var(--r3);padding:10px 14px;color:#fca5a5;font-size:12px;font-weight:700">
        ⚠️ UID tidak terbaca. Coba lagi.
      </div>`);
      return;
    }

    // BUG FIX: debounce per-session scan juga — Web NFC sering fire multiple
    // reading events per tap. Tanpa debounce, jika santri belum punya record
    // absensi, masing-masing event call setSt(existing?.id||'') dengan existing
    // = undefined → setSt membuat record baru dengan id berbeda → duplikat.
    const now = Date.now();
    if (this._lastSesUid === uid2 && (now - (this._lastSesTs||0)) < 3000) {
      this._log('⏭ Debounce per-session: UID sama dalam <3s, skip');
      return;
    }
    this._lastSesUid = uid2;
    this._lastSesTs = now;

    // Cari santri yang punya UID ini — toleran format
    const snt = await DB.ga('santri');
    const santri = snt.find(x => {
      if (!x.nfcUid) return false;
      return normalize(x.nfcUid) === uid2;
    });

    if (!santri) {
      SFX.notFound();
      this._showResult(`<div style="background:rgba(239,68,68,.2);border:1.5px solid rgba(239,68,68,.4);border-radius:var(--r3);padding:10px 14px;color:#fca5a5;font-size:12px;font-weight:700">
        ❌ Kartu tidak dikenal<br>
        <span style="font-size:10px;opacity:.8;font-family:monospace">${uidFmt}</span><br>
        <span style="font-size:10px;opacity:.6">Daftarkan UID ini di profil santri</span>
      </div>`);
      return;
    }

    // Cek status absensi santri ini
    const abs = await DB.ga('absensi');
    const existing = abs.find(a => a.sesiId === this._sesiId && a.sntId === santri.id);

    if (existing && existing.status === 'hadir') {
      SFX.alreadyHadir();
      this._showBigResult(santri, '✅ Sudah tercatat hadir');
      return;
    }

    // Tandai hadir
    await App.setSt(existing?.id||'', santri.id, 'hadir', this._sesiId);
    SFX.success();
    this._showBigResult(santri, `\u2705 Hadir tercatat \u2022 ${santri.kamar}`);
  }
};

// Scan NFC untuk isi UID di form edit santri — dipanggil otomatis saat
// sheet Edit Profil Santri dibuka (auto=true), atau manual lewat tombol 📡
App._scanNfcForEdit = async function(auto) {
  const statusEl = document.getElementById('ep-nfc-status');
  const setStatus = (html, color) => { if (statusEl) { statusEl.innerHTML = html; if(color) statusEl.style.color = color; } };
  if (!NFC.isSupported()) {
    setStatus('⚠️ NFC tidak tersedia di perangkat/browser ini — isi UID manual di kolom di atas.', '#ef4444');
    if (!auto) T('⚠️ NFC tidak tersedia di perangkat ini');
    return;
  }
  const inp = document.getElementById('ep-nfc');
  setStatus('📡 Menunggu tap kartu NFC ke HP...', 'var(--a1)');
  if (!auto) T('📡 Tempelkan kartu NFC ke HP...');
  // Set flag agar _handleIncomingUid tahu kalau ini untuk form, bukan background
  NFC._formScanning = true;
  // Pause background sementara agar tidak konflik
  const wasBgActive = NFC._bgActive;
  NFC._formScanWasBgActive = wasBgActive;
  if (wasBgActive) NFC.stopBackground();
  try {
    const ctrl = new AbortController();
    App._epNfcAbort = ctrl;
    const reader = new NDEFReader();
    await reader.scan({ signal: ctrl.signal });
    reader.addEventListener('reading', (e) => {
      ctrl.abort();
      // Toleran semua format UID
      const raw = e.serialNumber || e.detail?.serialNumber || '';
      const uid = raw.toUpperCase()||'';
      if (inp) { inp.value = uid; inp.style.background='rgba(13,181,127,.1)'; }
      SFX.success();
      setStatus('✅ Kartu terdeteksi & UID otomatis terisi: <span style="font-family:monospace">'+uid+'</span>', 'var(--a1)');
      T('✅ UID: ' + uid);
      NFC._formScanning = false;
      // Resume background setelah 1.5s
      if (wasBgActive) setTimeout(()=>NFC.startBackground().catch(()=>{}), 1500);
    });
    // Auto-clear flag setelah 20s (beri waktu lebih lama karena tanpa aksi klik)
    setTimeout(() => {
      try{ctrl.abort();}catch(e){}
      if (NFC._formScanning) setStatus('⏱️ Waktu scan habis — tap tombol 📡 untuk coba lagi, atau isi manual.', 'var(--t3)');
      NFC._formScanning = false;
      if (wasBgActive) setTimeout(()=>NFC.startBackground().catch(()=>{}), 500);
    }, 20000);
  } catch(e) {
    NFC._formScanning = false;
    if (wasBgActive) setTimeout(()=>NFC.startBackground().catch(()=>{}), 500);
    // Di browser/OS yang mewajibkan gesture klik untuk NDEFReader.scan(), auto-scan
    // bisa gagal diam-diam — beri tombol manual sebagai fallback, jangan spam toast.
    setStatus('📡 Tap tombol di samping untuk mulai scan kartu NFC.', 'var(--t3)');
    if (!auto) T('⚠️ Gagal scan: ' + e.message);
  }
};

// ═══════════════════════════════════════════════════════════════
// AppMint NFC Polyfill Hooks — pendekatan agresif & deteksi otomatis
// ═══════════════════════════════════════════════════════════════
function _handleIncomingUid(uid, source) {
  NFC._log('🎯 UID masuk dari ['+source+']: '+uid);
  // 1. Per-session NFC (user explicitly pressed NFC button on absensi page)
  if (NFC._active && NFC._sesiId) {
    NFC._onRead({ serialNumber: uid });
    return;
  }
  // 2. Form scan mode (user clicked scan button on edit santri form)
  if (NFC._formScanning) {
    const inp = document.getElementById('ep-nfc');
    if (inp) {
      inp.value = (uid||'').toUpperCase();
      inp.style.background = 'rgba(13,181,127,.1)';
      SFX.success();
      T('✅ UID: ' + uid);
    }
    NFC._formScanning = false;
    return;
  }
  // 3. Background mode — route to background handler (always-on listener)
  if (NFC._bgActive && S.user) {
    // BUG FIX: Web NFC / USB-NFC reader sering mem-fire multiple reading events
    // per satu tap fisik (perilaku documented). Tanpa debounce, setiap event
    // memanggil _onReadBackground secara paralel, dan jika sesi absensi belum
    // ada, masing-masing call membuat record absensi baru dengan id berbeda
    // untuk santri yang sama → duplikat absensi.
    // Debounce: skip jika UID yang sama sudah diterima dalam 3 detik terakhir.
    const normUid = String(uid||'').toUpperCase().replace(/[:\s\-\.]/g,'');
    const now = Date.now();
    if (NFC._lastBgUid === normUid && (now - (NFC._lastBgTs||0)) < 3000) {
      NFC._log('⏭ Debounce: UID sama dalam <3s, skip');
      return;
    }
    // ── C1 BUG FIX: Per-UID in-flight lock ──
    // Debounce di atas hanya mencegah UID yang sama diterima berurutan.
    // Tapi event paralel (reading + tagdiscovered dari reader yang sama,
    // atau postMessage + window event yang dispatch bersamaan) bisa lewat
    // sebelum _lastBgTs di-set. _onReadBackground() async — di tengah await-nya,
    // event kedua bisa masuk, keduanya cari santri yang sama, keduanya lihat
    // sesi belum ada, keduanya buat sesi+absensi baru dengan id berbeda → duplikat.
    // Solusi: set lock sebelum await apapun, lepas setelah selesai (atau timeout).
    if (!NFC._bgInFlight) NFC._bgInFlight = {};
    if (NFC._bgInFlight[normUid]) {
      NFC._log('⏭ In-flight lock: UID sedang diproses, skip');
      return;
    }
    NFC._bgInFlight[normUid] = true;
    // Safety net: lepas lock setelah 8 detik meski Promise tidak resolve
    const _releaseLock = () => { if (NFC._bgInFlight) delete NFC._bgInFlight[normUid]; };
    const _lockTimer = setTimeout(_releaseLock, 8000);
    NFC._lastBgUid = normUid;
    NFC._lastBgTs = now;
    NFC._onReadBackground(uid).finally(() => { clearTimeout(_lockTimer); _releaseLock(); });
    return;
  }
  // 4. Fallback: legacy behavior — fill ep-nfc field if present
  if (document.getElementById('ep-nfc')) {
    const inp = document.getElementById('ep-nfc');
    inp.value = (uid||'').toUpperCase();
    inp.style.background = 'rgba(13,181,127,.1)';
    SFX.success();
    T('✅ UID: ' + uid);
    return;
  }
  NFC._log('⚠️ UID diterima tapi tidak ada konteks aktif (NFC mode off & bukan form edit)');
}

// Daftarkan semua kemungkinan nama callback yang dipakai polyfill WebView
const _nfcCallbackNames = [
  'onNFCTag','onNFCRead','nfcTagFound','WebNFCCallback','onNfcTag','onNfcRead',
  'onNDEFReading','onTagDiscovered','handleNFCTag','NFCTagDiscovered','onNfcDiscovered',
  'nfcReadCallback','onNDEFTag','webnfc_callback','NFC_onRead'
];
_nfcCallbackNames.forEach(name => {
  window[name] = function(arg) {
    // arg bisa berupa string UID langsung, atau object {serialNumber/uid/id}
    let uid = '';
    if (typeof arg === 'string') uid = arg;
    else if (arg && typeof arg === 'object') uid = arg.serialNumber || arg.uid || arg.id || arg.tagId || JSON.stringify(arg);
    _handleIncomingUid(uid, name);
  };
});

// Tangkap juga custom DOM event yang mungkin di-dispatch oleh polyfill ke window/document
['nfctag','nfc-read','nfcread','ndefreading','tagdiscovered','nfc-tag-discovered'].forEach(evName => {
  window.addEventListener(evName, (e) => {
    const uid = e.detail?.serialNumber || e.detail?.uid || e.detail || e.serialNumber || '';
    _handleIncomingUid(typeof uid==='string'?uid:JSON.stringify(uid), 'event:'+evName);
  });
  document.addEventListener(evName, (e) => {
    const uid = e.detail?.serialNumber || e.detail?.uid || e.detail || e.serialNumber || '';
    _handleIncomingUid(typeof uid==='string'?uid:JSON.stringify(uid), 'docevent:'+evName);
  });
});

// Debug: log SEMUA postMessage yang masuk (kadang WebView bridge pakai postMessage)
window.addEventListener('message', (e) => {
  if (typeof NFC !== 'undefined' && NFC._log) {
    NFC._log('📨 postMessage: ' + JSON.stringify(e.data).substring(0,100));
  }
  // Coba deteksi UID di payload postMessage
  try {
    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (data && (data.nfc || data.serialNumber || data.uid)) {
      const uid = data.serialNumber || data.uid || (data.nfc && (data.nfc.serialNumber||data.nfc.uid));
      if (uid) _handleIncomingUid(uid, 'postMessage');
    }
  } catch(e2) {}
});


// ═══════════════════════════════════════════════════════════════
// USB NFC — LAPTOP/DESKTOP SUPPORT
// Mode 1: Keyboard Emulation (reader kirim UID sebagai keystroke)
//   → Paling umum. Reader murah (ACR122U keyboard mode, dll) output
//     UID sebagai string keyboard lalu Enter. Tidak perlu driver.
// Mode 2: WebHID (reader expose HID interface)
//   → Untuk reader yang support WebHID di Chrome/Edge desktop.
// ═══════════════════════════════════════════════════════════════
const NFCUsb = {
  _kbBuffer: '',
  _kbTimer: null,
  _kbLastTime: 0,
  _kbActive: false,
  _hidDevice: null,
  _hidActive: false,
  _mode: null, // 'keyboard' | 'hid' | null

  // Deteksi apakah ini desktop (bukan mobile/tablet)
  isDesktop() {
    return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  },

  // Apakah browser support WebHID?
  hasWebHID() {
    return 'hid' in navigator;
  },

  // ── Mode Keyboard: intercept input cepat dari NFC reader ──────
  startKeyboard() {
    if (this._kbActive) return;
    this._kbActive = true;
    this._kbBuffer = '';
    this._kbHandler = this._onKeyboard.bind(this);
    document.addEventListener('keydown', this._kbHandler, true);
    NFC._log('⌨️ USB NFC Keyboard mode aktif');
  },

  stopKeyboard() {
    if (!this._kbActive) return;
    this._kbActive = false;
    document.removeEventListener('keydown', this._kbHandler, true);
    clearTimeout(this._kbTimer);
    this._kbBuffer = '';
    NFC._log('⌨️ USB NFC Keyboard mode off');
  },

  _onKeyboard(e) {
    if (!this._kbActive) return;
    const now = Date.now();
    const gap = now - this._kbLastTime;
    this._kbLastTime = now;

    // Enter = reader selesai kirim UID
    if (e.key === 'Enter') {
      const buf = this._kbBuffer.trim();
      // Minimum 4 karakter, kemungkinan besar dari NFC reader bukan manusia
      if (buf.length >= 4 && (this._isRapidInput || buf.length >= 8)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        _handleIncomingUid(buf, 'USB-NFC-Keyboard');
        NFC._log('✅ Keyboard UID: ' + buf);
      }
      this._kbBuffer = '';
      this._isRapidInput = false;
      return;
    }

    // Input cepat (< 60ms antar karakter) = hampir pasti dari reader, bukan manusia
    if (gap < 60 && e.key.length === 1) {
      this._isRapidInput = true;
      // Jika ada input field aktif yang bukan NFC field — jangan intercept
      const active = document.activeElement;
      const isNfcField = active && active.id === 'ep-nfc';
      if (!isNfcField && active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        // Biarkan mengisi input biasa
      } else {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      this._kbBuffer += e.key;
      // Auto-submit jika buffer sudah panjang dan masih rapid
      clearTimeout(this._kbTimer);
      this._kbTimer = setTimeout(() => {
        const buf = this._kbBuffer.trim();
        if (buf.length >= 4 && this._isRapidInput) {
          _handleIncomingUid(buf, 'USB-NFC-Keyboard-auto');
          NFC._log('✅ Keyboard UID (auto): ' + buf);
        }
        this._kbBuffer = '';
        this._isRapidInput = false;
      }, 120);
    } else if (e.key.length === 1 && gap > 200) {
      // Gap besar = manusia mengetik, reset buffer
      this._kbBuffer = e.key;
      this._isRapidInput = false;
    }
  },

  // ── Mode WebHID: connect ke NFC reader sebagai HID device ─────
  async startHID() {
    if (!this.hasWebHID()) { NFC._log('❌ WebHID tidak didukung browser ini'); return false; }
    try {
      // Filter: vendor ID umum NFC reader (ACR122U: 072f:2200, SCL3711: 04e6:5591, dll)
      const filters = [
        { vendorId: 0x072f }, // ACS (ACR122U, ACR1252U, dll)
        { vendorId: 0x04e6 }, // SCM Microsystems
        { vendorId: 0x1fc9 }, // NXP Semiconductors
        { vendorId: 0x04cc }, // Philips
        { vendorId: 0x054c }, // Sony (RC-S380)
        { vendorId: 0x09c3 }, // Promag
        { vendorId: 0x0dc3 }, // Apricorn
      ];
      const devices = await navigator.hid.requestDevice({ filters });
      if (!devices.length) { NFC._log('⚠️ Tidak ada HID device dipilih'); return false; }
      this._hidDevice = devices[0];
      await this._hidDevice.open();
      this._hidActive = true;
      this._hidDevice.addEventListener('inputreport', this._onHIDReport.bind(this));
      NFC._log('🔌 WebHID terhubung: ' + this._hidDevice.productName);
      T('✅ NFC USB terhubung: ' + this._hidDevice.productName);
      return true;
    } catch(e) {
      NFC._log('❌ WebHID error: ' + e.message);
      return false;
    }
  },

  _onHIDReport(e) {
    // Parse HID report dari NFC reader — format bervariasi per vendor
    const data = new Uint8Array(e.data.buffer);
    NFC._log('🔌 HID report: ' + Array.from(data).map(b=>b.toString(16).padStart(2,'0')).join(' '));
    // Coba ekstrak UID — umumnya ada di byte 1-4 atau 1-7 setelah header
    let uid = '';
    // Format umum: [reportId, len, uid_byte0, uid_byte1, ...]
    if (data.length >= 5) {
      const len = Math.min(data[1] || 4, data.length - 2);
      uid = Array.from(data.slice(2, 2+len)).map(b=>b.toString(16).padStart(2,'0')).join(':').toUpperCase();
    }
    if (uid) _handleIncomingUid(uid, 'WebHID');
  },

  async stopHID() {
    if (this._hidDevice) {
      try { await this._hidDevice.close(); } catch(e){}
      this._hidDevice = null;
    }
    this._hidActive = false;
  },

  // ── Mulai semua mode USB NFC ──────────────────────────────────
  start() {
    this.startKeyboard(); // selalu aktifkan keyboard mode
    this._mode = 'keyboard';
    NFC._log('🖥️ USB NFC aktif (keyboard mode). Tempelkan kartu ke reader.');
  },

  stop() {
    this.stopKeyboard();
    this.stopHID();
    this._mode = null;
  },

  // ── Connect WebHID (dipanggil dari tombol UI) ─────────────────
  async connectHID() {
    const ok = await this.startHID();
    if (ok) this._mode = 'hid';
    return ok;
  },
};

// Auto-start USB NFC keyboard mode saat halaman NFC absensi dibuka di desktop
(function _patchNFCForDesktop(){
  const _origToggle = NFC.toggle.bind(NFC);
  NFC.toggle = async function(sesiId) {
    if (NFCUsb.isDesktop()) {
      if (NFC._active) {
        NFC.stop();
        NFCUsb.stop();
      } else {
        NFC._sesiId = sesiId;
        NFC._active = true;
        NFC._updateBtn(true);
        NFC._showOverlay();
        NFCUsb.start();
        NFC._log('🖥️ Mode Desktop: USB NFC keyboard aktif');
      }
      return;
    }
    // Mobile: gunakan Web NFC seperti biasa
    await _origToggle(sesiId);
  };

  const _origStop = NFC.stop.bind(NFC);
  NFC.stop = function() {
    NFCUsb.stop();
    _origStop();
  };

  // Tambah isSupported untuk desktop
  const _origSupp = NFC.isSupported.bind(NFC);
  NFC.isSupported = function() {
    return _origSupp() || NFCUsb.isDesktop();
  };
})();

// CSS animasi NFC pulse
(function(){
  const st=document.createElement('style');
  st.textContent=`
    @keyframes nfcPulse {
      0%,100%{transform:scale(1);opacity:1}
      50%{transform:scale(1.15);opacity:.7}
    }
    @keyframes pulse {
      0%,100%{opacity:1}50%{opacity:.4}
    }
  `;
  document.head.appendChild(st);
})();

// Stop NFC saat pindah halaman
const _origNav = App.nav.bind(App);
App.nav = async function(pg, opts={}) {
  if (NFC._active) NFC.stop();
  return _origNav(pg, opts);
};

// ═══════════════════════════════════════════════════════════════
// PATCH: NFC BACKGROUND LISTENER — absensi tap dari halaman manapun
// ═══════════════════════════════════════════════════════════════
// - Start otomatis setelah login (silent, no overlay)
// - Stop saat logout
// - Pause sementara saat per-session NFC aktif (di halaman absensi)
// - On tap: cari kegiatan/sub-kegiatan yang jadwalnya aktif saat ini
//   - Jika 0 aktif → banner "Tidak Ada Kegiatan Aktif", tidak tercatat
//   - Jika 1 aktif → record ke sesi tersebut
//   - Jika 2+ aktif dan santri anggota salah satunya → record ke yang itu (prioritas urutan)
//   - Jika 2+ aktif tapi santri bukan anggota → banner "Bukan Anggota Kegiatan Aktif"
// ═══════════════════════════════════════════════════════════════
(function _patchNfcBackground(){
  // ── State ────────────────────────────────────────────────────────────
  NFC._bgActive = false;
  NFC._bgAbortCtrl = null;
  NFC._bgReader = null;
  NFC._bgEnabled = localStorage.getItem('nfc_bg_enabled') !== 'false'; // default ON
  NFC._formScanning = false;
  NFC._bgLastError = null;
  NFC._bannerTimer = null;

  // ── Start background listener (silent, no overlay) ──────────────────
  NFC.startBackground = async function() {
    if (!S.user) return; // belum login
    if (this._bgActive) return; // sudah aktif
    if (this._active && this._sesiId) return; // per-session lagi aktif
    if (!this.isSupported()) {
      this._updateBgIndicator('err');
      this._log('⚠️ Background NFC: tidak didukung perangkat ini');
      return;
    }
    try {
      this._bgAbortCtrl = new AbortController();
      this._bgReader = new NDEFReader();
      await this._bgReader.scan({ signal: this._bgAbortCtrl.signal });
      this._bgActive = true;
      this._bgLastError = null;
      this._updateBgIndicator('on');
      this._log('📡 Background NFC aktif (silent listener)');

      const evNames = ['reading','tagdiscovered','nfctag','tag','ndefreading','read'];
      evNames.forEach(name => {
        this._bgReader.addEventListener(name, (e) => {
          const uid = e.serialNumber || e.detail?.serialNumber || '';
          if (uid) _handleIncomingUid(uid, 'bg:'+name);
        });
      });
      this._bgReader.addEventListener('readingerror', () => {
        this._log('❌ BG readingerror');
      });

      // Desktop: juga aktifkan keyboard mode
      if (NFCUsb.isDesktop()) {
        NFCUsb.startKeyboard();
        this._log('🖥️ Desktop: USB NFC keyboard mode aktif untuk background');
      }
    } catch(e) {
      this._bgActive = false;
      this._bgLastError = e.message;
      this._updateBgIndicator('err');
      this._log('❌ Background NFC scan gagal: ' + e.message);
      if (e.name === 'NotAllowedError') {
        // Jangan auto-show dialog tiap login — cukup toast, user klik indikator untuk detail
        T('⚠️ Izin NFC ditolak. Ketuk icon NFC di header untuk aktifkan.');
      } else if (S.user) {
        T('⚠️ NFC error: ' + e.message);
      }
    }
  };

  // ── Stop background listener ────────────────────────────────────────
  NFC.stopBackground = function() {
    if (this._bgAbortCtrl) { try { this._bgAbortCtrl.abort(); } catch(e){} }
    this._bgAbortCtrl = null;
    this._bgReader = null;
    if (this._bgActive) this._log('📡 Background NFC dihentikan');
    this._bgActive = false;
    this._updateBgIndicator('off');
    if (NFCUsb.isDesktop() && NFCUsb._kbActive && !NFC._active) {
      NFCUsb.stopKeyboard();
    }
  };

  // ── Toggle on/off via settings ──────────────────────────────────────
  NFC.toggleBgEnabled = function(on) {
    this._bgEnabled = !!on;
    localStorage.setItem('nfc_bg_enabled', this._bgEnabled ? 'true' : 'false');
    if (this._bgEnabled && S.user) this.startBackground();
    else this.stopBackground();
  };

  // ── Header indicator state ──────────────────────────────────────────
  NFC._updateBgIndicator = function(state) {
    const el = document.getElementById('nfc-bg-ind');
    if (!el) return;
    el.classList.remove('on','err');
    if (state === 'on') {
      el.classList.add('on');
      el.innerHTML = '<span class="nfc-bg-dot"></span> NFC';
      el.title = 'NFC Background Aktif — tap kartu di halaman manapun';
    } else if (state === 'err') {
      el.classList.add('err');
      el.innerHTML = '<span>⚠</span> NFC';
      el.title = 'NFC error: ' + (this._bgLastError||'tidak didukung');
    } else {
      el.innerHTML = '<span class="nfc-bg-dot" style="animation:none;opacity:.4"></span> NFC';
      el.title = 'NFC Background nonaktif — ketuk untuk aktifkan';
    }
  };

  // ── Permission dialog ───────────────────────────────────────────────
  NFC._showPermissionDialog = function() {
    OS(`<div class="cw">
      <div class="ci3">📡</div>
      <div class="ct3">Izin NFC Diperlukan</div>
      <div class="cs3">Untuk absensi tap otomatis, aktifkan NFC di Pengaturan HP dan berikan izin ke browser Chrome (Android).<br><br>Setelah itu, ketuk tombol NFC di header untuk mencoba lagi.</div>
      <div class="cbs">
        <button class="cc" onclick="CS()">Tutup</button>
        <button class="co" onclick="CS();NFC.startBackground()">Coba Lagi</button>
      </div>
    </div>`);
  };

  // ── Main: handle background tap ─────────────────────────────────────
  NFC._onReadBackground = async function(rawUid) {
    const normalize = (s) => (s||'').toUpperCase().replace(/[:\s\-\.]/g,'').trim();
    const uid2 = normalize(rawUid);
    const uidFmt = (rawUid||'').toUpperCase() || '(kosong)';

    if (!uid2) {
      SFX.error();
      this._showFloatingBanner({ type:'error', title:'UID Tidak Terbaca', subtitle:'Coba tap ulang', icon:'⚠', color:'#ef4444' });
      return;
    }

    const snt = await DB.ga('santri');
    const santri = snt.find(x => x.nfcUid && normalize(x.nfcUid) === uid2);

    if (!santri) {
      SFX.notFound();
      this._showFloatingBanner({
        type:'not_found', title:'Kartu Tidak Dikenal',
        subtitle:'UID: ' + uidFmt,
        icon:'❌', color:'#ef4444',
        extra:'Daftarkan UID ini di profil santri'
      });
      return;
    }

    await this._recordAttendanceForActiveActivity(santri);
  };

  // ── Find currently active activity ──────────────────────────────────
  NFC._findActiveActivity = async function(santriId) {
    const now = new Date();
    const day = now.getDay(); // 0=Min, 6=Sab
    const hh = now.getHours().toString().padStart(2,'0');
    const mm = now.getMinutes().toString().padStart(2,'0');
    const nowHHMM = hh + ':' + mm;

    const [kg, sk, ang] = await Promise.all([DB.ga('kegiatan'), DB.ga('subKeg'), DB.ga('anggota')]);

    const inWindow = (start, end) => {
      if (!start || !end) return false;
      if (start <= end) return nowHHMM >= start && nowHHMM <= end;
      return nowHHMM >= start || nowHHMM <= end; // overnight
    };
    const activeToday = (item) => {
      if (!item.hariAktif || !Array.isArray(item.hariAktif) || item.hariAktif.length === 0) return true;
      return item.hariAktif.includes(day);
    };

    const isSubActive = (s) => {
      // Sub-kegiatan aktif berdasarkan jam & hari (sendiri atau waris dari kegiatan induk)
      if (s.aktif === false) return false;
      const parent = kg.find(k => k.id === s.kgId);
      if (!parent || parent.aktif === false) return false;
      // Effective jam: sub's own, or parent's
      const jm = s.jamMulai || parent.jamMulai || '';
      const js = s.jamSelesai || parent.jamSelesai || '';
      if (!jm || !js) return false;
      // Effective hari: sub's own, or parent's, or null (=setiap hari)
      const effHari = (Array.isArray(s.hariAktif)&&s.hariAktif.length)?s.hariAktif:((Array.isArray(parent.hariAktif)&&parent.hariAktif.length)?parent.hariAktif:null);
      if (effHari && !effHari.includes(day)) return false;
      return inWindow(jm, js);
    };
    const isKgMainActive = (k) => {
      // Kegiatan utama tidak punya jam sendiri → tidak pernah aktif untuk NFC background
      // (Kegiatan utama hanya untuk absensi manual via tombol Absen)
      return false;
    };

    const activeSk = sk.filter(isSubActive);
    const activeKgMain = []; // selalu kosong — kegiatan tanpa sub tidak terdeteksi NFC background

    if (activeSk.length === 0 && activeKgMain.length === 0) return null;

    // Priority 1: sub where santri is anggota
    if (activeSk.length > 0) {
      const santriAng = ang.filter(a => a.sntId === santriId);
      const matched = activeSk.filter(s => santriAng.some(a => a.skId === s.id));
      if (matched.length > 0) {
        matched.sort((a,b) => {
          const pa = kg.find(k => k.id === a.kgId)?.urutan || 0;
          const pb = kg.find(k => k.id === b.kgId)?.urutan || 0;
          if (pa !== pb) return pa - pb;
          return (a.urutan||0) - (b.urutan||0);
        });
        return {
          type: 'sub',
          sub: matched[0],
          kg: kg.find(k => k.id === matched[0].kgId),
          overlap: matched.length > 1,
          overlapCount: matched.length
        };
      }
    }

    // Priority 2: kegiatan main session
    if (activeKgMain.length > 0) {
      activeKgMain.sort((a,b) => (a.urutan||0) - (b.urutan||0));
      return {
        type: 'kg',
        kg: activeKgMain[0],
        sub: null,
        overlap: activeKgMain.length > 1,
        overlapCount: activeKgMain.length
      };
    }

    // Active subs exist but santri not member
    return { type: 'none', reason: 'not_member', activeCount: activeSk.length };
  };

  // ── Record attendance ───────────────────────────────────────────────
  NFC._recordAttendanceForActiveActivity = async function(santri) {
    const activity = await this._findActiveActivity(santri.id);

    if (!activity) {
      SFX.error();
      this._showFloatingBanner({
        type:'no_active', santri,
        title:'Tidak Ada Kegiatan Aktif',
        subtitle:'Tidak tercatat apa-apa',
        icon:'⏰', color:'#f59e0b'
      });
      return;
    }

    if (activity.type === 'none') {
      SFX.notFound();
      this._showFloatingBanner({
        type:'not_member', santri,
        title:'Bukan Anggota Kegiatan Aktif',
        subtitle:'Tidak tercatat apa-apa',
        icon:'🚫', color:'#ef4444'
      });
      return;
    }

    const today = _todayLocal();
    let sid, skId = null;
    if (activity.type === 'sub') {
      sid = 'ses_' + today + '_' + activity.kg.id + '_' + activity.sub.id;
      skId = activity.sub.id;
    } else {
      sid = 'ses_' + today + '_' + activity.kg.id;
    }

    let sx = await DB.g('sesi', sid);
    if (sx && sx.locked && S._adminMode !== true) {
      SFX.error();
      this._showFloatingBanner({
        type:'locked', santri,
        title:'Sesi Terkunci',
        subtitle:(activity.kg.nama||'') + (activity.sub?' · '+activity.sub.nama:''),
        icon:'🔒', color:'#ef4444'
      });
      return;
    }
    // Admin override — set flag biar _doSt catat di audit log
    if (sx && sx.locked && S._adminMode === true) {
      S._adminOverride = true;
    }
    // Wrap sisa fungsi dalam try/finally untuk menjamin S._adminOverride
    // selalu dibersihkan, bahkan jika ada error di tengah jalan.
    try {

    if (!sx) {
      sx = { id:sid, tanggal:today, kgId:activity.kg.id, skId:skId, status:'draft', createdAt:Date.now(), locked:false };
      await DB.p('sesi', sx);
      const ang = activity.type === 'sub'
        ? (await DB.ga('anggota')).filter(a => a.skId === activity.sub.id)
        : [];
      // Sub-kegiatan: hanya anggota. Kegiatan induk: semua santri aktif.
      const targets = activity.type === 'sub'
        ? ang.map(a=>a.sntId)
        : (await DB.ga('santri')).filter(x=>x.aktif).map(x=>x.id);
      const izinMap = await App._izinAktifMap(today);
      const sakitMapNfc = await App._sakitAktifMap(today);
      // Untuk kegiatan shalat: santri uzur aktif → auto-set 'uzur'
      const isShalatNew = _isShalatKegiatan(activity.kg?.nama, activity.sub?.nama);
      const uzurMapNew = isShalatNew ? await App._uzurAktifMap(today) : {};
      for (const sntId of targets) {
        let st='none',pid=null,oleh=S.user?.nama||'NFC';
        if(sakitMapNfc[sntId]){st='sakit';pid=null;oleh='Sistem (Catatan Sakit)';}
        else if(izinMap[sntId]){st='izin';pid=izinMap[sntId];oleh='Sistem (Perizinan)';}
        else if(isShalatNew&&uzurMapNew[sntId]){st='uzur';oleh='Sistem (Uzur)';}
        await DB.p('absensi', {
          id:uid(), sesiId:sid, sntId,
          status: st,
          perizinanId: pid,
          oleh,
          updatedAt: Date.now()
        });
      }
    }

    const abs = await DB.ga('absensi');
    const existing = abs.find(a => a.sesiId === sid && a.sntId === santri.id);

    const activityName = activity.type === 'sub'
      ? (activity.kg.nama + ' · ' + activity.sub.nama)
      : activity.kg.nama;
    const overlapNote = activity.overlap ? ' · ⚠️ ' + (activity.overlapCount-1) + ' kegiatan lain bentrok' : '';

    if (existing && existing.status === 'hadir') {
      SFX.alreadyHadir();
      this._showFloatingBanner({
        type:'already', santri,
        title:'Sudah Tercatat Hadir',
        subtitle: activityName + overlapNote,
        icon:'✓', color:'#f59e0b'
      });
      return;
    }

    // ── UZUR INTEGRATION (NFC) ───────────────────────────────
    // Jika kegiatan shalat & santri tap NFC → akhiri uzur aktif
    // (caraBerakhir='nfc'). _doSt akan set status='hadir'.
    const isShalatNFC=_isShalatKegiatan(activity.kg?.nama, activity.sub?.nama);
    if(isShalatNFC){
      await App._endUzur(santri.id,'nfc').catch(()=>{});
    }

    // ── CATATAN SAKIT INTEGRATION (NFC) ─────────────────────
    // Set flag agar _doSt tahu kalau berasal dari NFC, untuk menandai
    // catatanSakit aktif sebagai 'sembuh' (caraBerakhir='nfc').
    App._nfcInFlight=true;
    try{
      await App._doSt(existing?.id || '', santri.id, 'hadir', sid);
    } finally {
      App._nfcInFlight=false;
    }
    SFX.success();
    this._showFloatingBanner({
      type:'success', santri,
      title:'Hadir Tercatat',
      subtitle: activityName + overlapNote,
      icon:'✓', color:'#0db57f'
    });

    } finally {
      // Always cleanup admin override flag (NFC handler calls _doSt directly,
      // not setSt, so PATCH 5 wrapper doesn't clean this up).
      if (S._adminOverride) delete S._adminOverride;
    }
  };

  // ── Notifikasi Absensi FULL SCREEN — jelas: foto besar, identitas, status ──
  NFC._showFloatingBanner = function(opts) {
    const ex = document.getElementById('nfc-bg-banner');
    if (ex) ex.remove();
    const santri = opts.santri;
    const color = opts.color || '#0db57f';
    const avatarHtml = santri
      ? (santri.foto ? `<img src="${santri.foto}" alt="">` : esc((santri.nama||'?').charAt(0)))
      : (opts.icon || '📡');
    const jam = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    const metaRows = [];
    if (santri) {
      metaRows.push(`<div class="nfc-fs-row"><span class="lbl">Kamar</span><span class="val">${esc(santri.kamar||'-')}</span></div>`);
      if (santri.kelas) metaRows.push(`<div class="nfc-fs-row"><span class="lbl">Kelas</span><span class="val">${esc(santri.kelas)}</span></div>`);
      metaRows.push(`<div class="nfc-fs-row"><span class="lbl">Kegiatan</span><span class="val">${esc(opts.subtitle||'-')}</span></div>`);
      metaRows.push(`<div class="nfc-fs-row"><span class="lbl">Jam</span><span class="val">${jam}</span></div>`);
    } else {
      metaRows.push(`<div class="nfc-fs-row"><span class="lbl">Keterangan</span><span class="val">${esc(opts.subtitle||'-')}</span></div>`);
      metaRows.push(`<div class="nfc-fs-row"><span class="lbl">Jam</span><span class="val">${jam}</span></div>`);
    }
    const banner = document.createElement('div');
    banner.id = 'nfc-bg-banner';
    banner.innerHTML = `
      <div class="nfc-fs-card" onclick="event.stopPropagation()">
        <div class="nfc-fs-bar" style="background:${color}"></div>
        <div class="nfc-fs-body">
          <div class="nfc-fs-av" style="background:linear-gradient(135deg,${color},${color}cc)">${avatarHtml}</div>
          <div class="nfc-fs-name">${santri ? esc(santri.nama) : 'Absensi NFC'}</div>
          <div class="nfc-fs-badge" style="background:${color}">${opts.icon||''} ${esc(opts.title||'')}</div>
          <div class="nfc-fs-meta">${metaRows.join('')}</div>
          ${opts.extra ? `<div class="nfc-fs-extra">${esc(opts.extra)}</div>` : ''}
          <button class="nfc-fs-close" onclick="NFC._dismissBanner()">Tutup</button>
        </div>
      </div>
    `;
    // Tap di luar card (area gelap) juga menutup notifikasi
    banner.onclick = () => NFC._dismissBanner();
    document.body.appendChild(banner);
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this._dismissBanner(), 5500);
  };

  NFC._dismissBanner = function() {
    const b = document.getElementById('nfc-bg-banner');
    if (!b) return;
    b.classList.add('dismissing');
    setTimeout(() => b.remove(), 300);
  };

  // ── Click handler for header indicator ──────────────────────────────
  NFC.onIndicatorClick = function() {
    if (this._bgActive) {
      OS(`<div class="cw">
        <div class="ci3" style="background:rgba(13,181,127,.15);color:var(--a1)">📡</div>
        <div class="ct3">NFC Background Aktif</div>
        <div class="cs3">Tap kartu NFC di halaman manapun untuk absensi otomatis. Sistem akan mencari kegiatan/sub-kegiatan yang jadwalnya sedang aktif.</div>
        <div class="cbs">
          <button class="cc" onclick="CS()">Tutup</button>
          <button class="co" style="background:#ef4444" onclick="CS();NFC.toggleBgEnabled(false)">Nonaktifkan</button>
        </div>
      </div>`);
    } else if (this._bgLastError) {
      this._showPermissionDialog();
    } else {
      this.startBackground();
    }
  };

  // ── HOOK: App._enter — auto-start + inject indicator ────────────────
  const _origEnter = App._enter.bind(App);
  App._enter = async function() {
    await _origEnter();
    // Inject indicator ke header kalau belum ada
    const acts = document.querySelector('.ph-acts');
    if (acts && !document.getElementById('nfc-bg-ind')) {
      const ind = document.createElement('button');
      ind.id = 'nfc-bg-ind';
      ind.className = 'nfc-bg-indicator';
      ind.onclick = () => NFC.onIndicatorClick();
      ind.innerHTML = '<span class="nfc-bg-dot" style="animation:none;opacity:.4"></span> NFC';
      acts.insertBefore(ind, acts.firstChild);
    }
    // Auto-start background
    if (NFC._bgEnabled) {
      setTimeout(() => NFC.startBackground().catch(e => console.warn('[BG NFC]', e)), 1500);
    }
  };

  // ── HOOK: App.logout ────────────────────────────────────────────────
  const _origLogout = App.logout.bind(App);
  App.logout = async function() {
    NFC.stopBackground();
    await _origLogout();
  };

  // ── HOOK: NFC.start — pause background ──────────────────────────────
  const _origStart = NFC.start.bind(NFC);
  NFC.start = async function(sesiId) {
    if (this._bgActive) this.stopBackground();
    await _origStart(sesiId);
  };

  // ── HOOK: NFC.stop — resume background ──────────────────────────────
  const _origStop2 = NFC.stop.bind(NFC);
  NFC.stop = function() {
    _origStop2();
    if (NFC._bgEnabled && S.user) {
      setTimeout(() => NFC.startBackground().catch(()=>{}), 600);
    }
  };

  // ── HOOK: NFC.toggle — coordinate background ───────────────────────
  const _origToggle2 = NFC.toggle.bind(NFC);
  NFC.toggle = async function(sesiId) {
    if (this._bgActive && !this._active) this.stopBackground();
    await _origToggle2(sesiId);
    if (!this._active && NFC._bgEnabled && S.user) {
      setTimeout(() => NFC.startBackground().catch(()=>{}), 600);
    }
  };

  console.log('[NFC] Background listener patch loaded. Enabled:', NFC._bgEnabled);
})();


document.addEventListener('DOMContentLoaded',init);

// ═══════════════════════════════════════════════════════════════
// PWA: Register Service Worker + Install Prompt
// ═══════════════════════════════════════════════════════════════
// ── AUDIT FIX: Tambah update mechanism (skipWaiting + toast reload) ──
// Sebelumnya, saat SW baru di-deploy, user lama tetap di versi lama
// sampai mereka tutup SEMUA tab aplikasi. Sekarang:
//   1. register SW dengan updateViaCache:'none' supaya selalu cek SW baru
//      lewat network (bukan cache HTTP).
//   2. listen 'controllerchange' → tampilkan toast "Versi baru siap,
//      reload?". User bisa pilih reload sekarang atau nanti.
//   3. listen 'updatefound' → jika SW baru mulai installing, tunggu
//      'statechange' ke 'installed' lalu kirim postMessage('SKIP_WAITING')
//      supaya SW baru langsung aktif tanpa menunggu semua tab tutup.
(function _pwaSetup(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(reg => {
        console.log('[PWA] Service Worker registered:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // SW baru siap. Kirim SKIP_WAITING supaya langsung aktif.
              newWorker.postMessage('SKIP_WAITING');
              // Tampilkan toast ke user (jika fungsi T tersedia).
              if (window.T) {
                T('🔄 Versi baru siap. Muat ulang untuk mengaktifkan.', 8000);
              }
            }
          });
        });
      }).catch(err => console.warn('[PWA] SW registration failed:', err));
      // Saat controller berganti (SW baru aktif), reload sekali supaya
      // semua aset baru termuat. Cek apakah sudah pernah reload — kalau
      // tidak, akan terjadi reload loop.
      let _reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (_reloaded) return;
        _reloaded = true;
        // Delay sedikit supaya SW sempat claim clients.
        setTimeout(() => location.reload(), 300);
      });
    });
  }
  // Install prompt capture
  let _deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    _showInstallFab();
  });
  window.addEventListener('appinstalled', () => {
    _deferredPrompt = null;
    _hideInstallFab();
    T('✅ Aplikasi berhasil dipasang!');
  });
  function _showInstallFab(){
    if (document.getElementById('pwa-install-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'pwa-install-fab';
    fab.style.cssText = 'position:fixed;bottom:80px;right:14px;z-index:9985;background:var(--grad);color:#fff;border:none;border-radius:100px;padding:12px 18px 12px 14px;font-family:var(--fd);font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 10px 26px rgba(13,181,127,.4),0 1px 0 rgba(255,255,255,.3) inset;display:flex;align-items:center;gap:7px;animation:pwaFabIn .35s var(--ease)';
    fab.innerHTML = '<span style="font-size:16px">⬇</span> Pasang App';
    fab.onclick = async () => {
      if (!_deferredPrompt) return;
      _deferredPrompt.prompt();
      const choice = await _deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        T('✅ Memasang...');
      }
      _deferredPrompt = null;
      _hideInstallFab();
    };
    document.body.appendChild(fab);
    // Auto-dismiss after 15s if no action
    setTimeout(() => { if (document.getElementById('pwa-install-fab')) _hideInstallFab(); }, 15000);
  }
  function _hideInstallFab(){
    const fab = document.getElementById('pwa-install-fab');
    if (fab) {
      fab.style.animation = 'pwaFabOut .3s var(--ease2) forwards';
      setTimeout(() => fab.remove(), 300);
    }
  }
  // Add keyframes for FAB
  if (!document.getElementById('pwa-fab-style')) {
    const st = document.createElement('style');
    st.id = 'pwa-fab-style';
    st.textContent = `
      @keyframes pwaFabIn{from{opacity:0;transform:translateY(20px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes pwaFabOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(20px) scale(.9)}}
    `;
    document.head.appendChild(st);
  }
})();


// ═══════════════════════════════════════════════════════════════
// FIREBASE SYNC ENGINE v5 — Cloud Firestore backend
// Project ini SEPENUHNYA TERPISAH dari aplikasi Absensi Assalam versi
// lama (yang memakai Realtime Database absensi-assalam-default-rtdb).
// Tidak ada path, config, atau kredensial yang dibagikan antar kedua
// aplikasi — data 100% terisolasi.
//
// Prinsip (identik dengan versi lama, backend saja yang berbeda):
//  - WRITE: setiap DB.p/DB.d langsung push ke Firestore (immediate)
//  - READ: setiap nav ke halaman baru pull data relevan dari Firestore
//  - DEDUP: santri/kamar pakai ID unik — tidak pernah duplikat
//  - KAMAR: sync by nama, jika nama sama → skip (tidak buat duplikat)
//  - SANTRI: sync by ID — satu ID satu santri, last-write-wins
//  - ABSENSI: poll tiap 8 detik saat halaman abs terbuka
//
// Struktur data Firestore:
//   registry/{ns}                        → pendaftaran tenant (nama asrama)
//   tenants/{ns}/{store}/{id}             → satu dokumen per record,
//                                            {store} = santri, kegiatan,
//                                            subKeg, anggota, sesi, absensi,
//                                            auditLog, users, kamar,
//                                            catatanSantri, pelanggaran,
//                                            peraturan, settings, kalam,
//                                            perizinan, chat
//   tenants/{ns}/fcmTokens/{docId}        → token push notification
// ═══════════════════════════════════════════════════════════════


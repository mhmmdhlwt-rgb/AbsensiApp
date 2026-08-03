// utils/dateFmt.js — Format tanggal terpusat (FASE 3 AUDIT FIX)
// ═══════════════════════════════════════════════════════════════
// Sebelumnya, pola format tanggal (new Date(ts).toLocaleDateString("id-ID"),
// String(d.getDate()).padStart(2,"0"), dsb) di-duplicate di banyak tempat
// di index.html. File ini menyediakan fungsi terpusat yang bisa dipanggil
// dari mana saja. Kompatibel dengan format existing — bisa diadopsi bertahap.
//
// Pemakaian:
//   <script src="utils/dateFmt.js"></script>
//   fmtDate(1699999999999) → "2023-11-15"
//   fmtDateID(1699999999999) → "15 November 2023"
//   fmtTime(1699999999999) → "07:46"
//   fmtDateTime(1699999999999) → "15 Nov 2023, 07:46"
//   fmtRelative(1699999999999) → "5 menit lalu" / "2 jam lalu" / "kemarin"
//
// CATATAN: Tidak ada import/require — file ini expose fungsi ke window.*
// supaya bisa dipanggil dari inline onclick handler di index.html vanilla JS.

(function DateFmtSetup() {
  'use strict';

  const MONTHS_ID_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const MONTHS_ID_FULL  = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const DAYS_ID_SHORT   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const DAYS_ID_FULL    = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  function _pad(n, w=2) { return String(n).padStart(w, '0'); }

  // Format YYYY-MM-DD (ISO local) — dipakai untuk ID dokumen, query Firestore
  function fmtDate(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + _pad(d.getMonth()+1) + '-' + _pad(d.getDate());
  }

  // Format DD/MM/YYYY (ID short) — dipakai untuk display compact
  function fmtDateShort(ts) {
    const d = ts ? new Date(ts) : new Date();
    return _pad(d.getDate()) + '/' + _pad(d.getMonth()+1) + '/' + d.getFullYear();
  }

  // Format "15 November 2023" — display formal
  function fmtDateID(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.getDate() + ' ' + MONTHS_ID_FULL[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Format "15 Nov 2023" — display medium
  function fmtDateMed(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.getDate() + ' ' + MONTHS_ID_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Format "Senin, 15 November 2023" — display full dengan hari
  function fmtDateFull(ts) {
    const d = ts ? new Date(ts) : new Date();
    return DAYS_ID_FULL[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_ID_FULL[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Format HH:MM — waktu singkat
  function fmtTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    return _pad(d.getHours()) + ':' + _pad(d.getMinutes());
  }

  // Format HH:MM:SS — waktu dengan detik
  function fmtTimeSec(ts) {
    const d = ts ? new Date(ts) : new Date();
    return _pad(d.getHours()) + ':' + _pad(d.getMinutes()) + ':' + _pad(d.getSeconds());
  }

  // Format "15 Nov 2023, 07:46" — timestamp lengkap compact
  function fmtDateTime(ts) {
    if (!ts) return '-';
    return fmtDateMed(ts) + ', ' + fmtTime(ts);
  }

  // Relative time — "baru saja", "5 menit lalu", "2 jam lalu", "kemarin", "3 hari lalu", fallback fmtDateMed
  function fmtRelative(ts) {
    if (!ts) return '-';
    const now = Date.now();
    const diff = now - ts;
    if (diff < 0) return 'baru saja'; // future timestamp (clock skew)
    if (diff < 60 * 1000) return 'baru saja';
    if (diff < 60 * 60 * 1000) {
      const m = Math.floor(diff / (60 * 1000));
      return m + ' menit lalu';
    }
    if (diff < 24 * 60 * 60 * 1000) {
      const h = Math.floor(diff / (60 * 60 * 1000));
      return h + ' jam lalu';
    }
    if (diff < 48 * 60 * 60 * 1000) return 'kemarin';
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const d = Math.floor(diff / (24 * 60 * 60 * 1000));
      return d + ' hari lalu';
    }
    return fmtDateMed(ts);
  }

  // Hari dalam seminggu — "Senin", "Selasa", dll
  function fmtDay(ts) {
    const d = ts ? new Date(ts) : new Date();
    return DAYS_ID_FULL[d.getDay()];
  }

  // Awal dan akhir bulan untuk query Firestore
  // Kembalikan {start, end} dalam format YYYY-MM-DD
  function monthRange(year, month /* 0-indexed */) {
    const y = year || new Date().getFullYear();
    const m = month !== undefined ? month : new Date().getMonth();
    const start = y + '-' + _pad(m+1) + '-01';
    // Akhir bulan: hitung tanggal terakhir
    const lastDay = new Date(y, m+1, 0).getDate();
    const end = y + '-' + _pad(m+1) + '-' + _pad(lastDay);
    return { start, end };
  }

  // Expose ke window — bisa dipanggil langsung tanpa import
  const api = {
    fmtDate, fmtDateShort, fmtDateID, fmtDateMed, fmtDateFull,
    fmtTime, fmtTimeSec, fmtDateTime, fmtRelative, fmtDay, monthRange,
    MONTHS_ID_SHORT, MONTHS_ID_FULL, DAYS_ID_SHORT, DAYS_ID_FULL
  };
  // Expose individually + as DateFmt namespace
  Object.keys(api).forEach(k => { window[k] = api[k]; });
  window.DateFmt = api;

  // Console hint untuk debugging
  if (typeof console !== 'undefined' && console.log) {
    console.log('[DateFmt] Loaded. Use DateFmt.fmtDate(ts), DateFmt.fmtRelative(ts), dll.');
  }
})();

// js/export.js — AbsensiApp
'use strict';

const Exp={
  // ── AUDIT v3d: Export Excel/CSV/Word/PDF generik ──
  // Helper untuk export array of objects ke berbagai format.
  // Dipakai oleh semua tombol laporan supaya konsisten.

  // Export array ke CSV (bisa dibuka Excel/Sheets)
  _toCSV(rows, headers) {
    if (!rows || !rows.length) return '';
    const cols = headers || Object.keys(rows[0]);
    const escape = v => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const lines = [cols.join(',')];
    for (const row of rows) {
      lines.push(cols.map(c => escape(row[c])).join(','));
    }
    return lines.join('\n');
  },

  // Download text sebagai file
  _download(filename, content, mime) {
    const blob = new Blob(['\uFEFF' + content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },

  // Export Excel (.xls via HTML table trick — Excel buka native)
  exportExcel(filename, rows, headers, sheetName) {
    if (!rows || !rows.length) { T('⚠️ Tidak ada data untuk diexport'); return; }
    const cols = headers || Object.keys(rows[0]);
    const safeSheet = (sheetName || 'Sheet1').replace(/[^\w \-]/g, '').slice(0, 28) || 'Sheet1';
    const headerHtml = cols.map(c => `<th style="background:#d4f7e8;font-weight:bold">${esc(c)}</th>`).join('');
    const bodyHtml = rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${safeSheet}</title>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${safeSheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:10pt} td,th{border:1px solid #ccc;padding:3pt 6pt}</style>
</head><body><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></body></html>`;
    this._download(filename.endsWith('.xls') ? filename : filename + '.xls', html, 'application/vnd.ms-excel');
    T(`✅ Excel diunduh: ${rows.length} baris`);
  },

  // Export CSV
  exportCSV(filename, rows, headers) {
    if (!rows || !rows.length) { T('⚠️ Tidak ada data untuk diexport'); return; }
    const csv = this._toCSV(rows, headers);
    this._download(filename.endsWith('.csv') ? filename : filename + '.csv', csv, 'text/csv;charset=utf-8');
    T(`✅ CSV diunduh: ${rows.length} baris`);
  },

  // Export Word (.doc via HTML trick)
  exportWord(filename, title, rows, headers) {
    if (!rows || !rows.length) { T('⚠️ Tidak ada data untuk diexport'); return; }
    const cols = headers || Object.keys(rows[0]);
    const headerHtml = cols.map(c => `<th>${esc(c)}</th>`).join('');
    const bodyHtml = rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt} h1{font-size:16pt} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ccc;padding:4pt 6pt} th{background:#d4f7e8}</style>
</head><body><h1>${esc(title)}</h1><p>Tanggal export: ${new Date().toLocaleString('id-ID')}</p><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></body></html>`;
    this._download(filename.endsWith('.doc') ? filename : filename + '.doc', html, 'application/msword');
    T(`✅ Word diunduh: ${rows.length} baris`);
  },

  // Export PDF (pakai jspdf yang sudah di-load)
  exportPDF(filename, title, rows, headers) {
    if (!rows || !rows.length) { T('⚠️ Tidak ada data untuk diexport'); return; }
    if (typeof window.jspdf === 'undefined') { T('❌ Library PDF belum termuat'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const cols = headers || Object.keys(rows[0]);
    // Title
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.text('Export: ' + new Date().toLocaleString('id-ID'), 14, 21);
    // Table manual (simple)
    const pageW = doc.internal.pageSize.getWidth() - 28;
    const colW = pageW / cols.length;
    let y = 28;
    // Header
    doc.setFillColor(13, 181, 127);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFillColor(212, 247, 232);
    doc.setTextColor(22, 33, 26);
    cols.forEach((c, i) => {
      doc.rect(14 + i * colW, y - 5, colW, 6, 'F');
      doc.text(String(c).slice(0, 20), 14 + i * colW + 1, y - 1);
    });
    y += 6;
    // Rows
    doc.setFontSize(7);
    rows.forEach((r, ri) => {
      if (y > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = 20;
      }
      cols.forEach((c, i) => {
        const val = String(r[c] ?? '').slice(0, 25);
        doc.text(val, 14 + i * colW + 1, y);
      });
      y += 5;
    });
    doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
    T(`✅ PDF diunduh: ${rows.length} baris`);
  },

  // Menu export generik — tampilkan pilihan format
  showFormatMenu(title, rows, headers, filenameBase) {
    if (!rows || !rows.length) { T('⚠️ Tidak ada data untuk diexport'); return; }
    OS(`<div class="sh">📤 Export: ${esc(title)}</div><div class="sb" style="padding-bottom:70px">
      <div style="font-size:12px;color:var(--t3);margin-bottom:14px">${rows.length} baris data siap diexport. Pilih format:</div>
      <div class="sc3">
        <div class="sr2" onclick="Exp.exportExcel('${filenameBase}', Exp._currentExportRows, Exp._currentExportHeaders, '${esc(title)}'); CS()">
          <div class="si4" style="background:rgba(22,163,74,.12);color:#16a34a">📊</div>
          <div class="st3"><div class="sl3">Excel (.xls)</div><div class="sv">Buka di Microsoft Excel / Google Sheets</div></div>
          <div class="sa">→</div>
        </div>
        <div class="sr2" onclick="Exp.exportCSV('${filenameBase}', Exp._currentExportRows, Exp._currentExportHeaders); CS()">
          <div class="si4" style="background:rgba(37,99,235,.12);color:#2563eb">📄</div>
          <div class="st3"><div class="sl3">CSV (.csv)</div><div class="sv">Format universal, kompatibel semua spreadsheet</div></div>
          <div class="sa">→</div>
        </div>
        <div class="sr2" onclick="Exp.exportWord('${filenameBase}', '${esc(title)}', Exp._currentExportRows, Exp._currentExportHeaders); CS()">
          <div class="si4" style="background:rgba(37,99,235,.12);color:#2563eb">📝</div>
          <div class="st3"><div class="sl3">Word (.doc)</div><div class="sv">Dokumen Microsoft Word</div></div>
          <div class="sa">→</div>
        </div>
        <div class="sr2" onclick="Exp.exportPDF('${filenameBase}', '${esc(title)}', Exp._currentExportRows, Exp._currentExportHeaders); CS()">
          <div class="si4" style="background:rgba(220,38,38,.12);color:#dc2626">📕</div>
          <div class="st3"><div class="sl3">PDF (.pdf)</div><div class="sv">Dokumen PDF — siap print</div></div>
          <div class="sa">→</div>
        </div>
      </div>
    </div>`);
    // Simpan rows ke global supaya onclick bisa akses
    this._currentExportRows = rows;
    this._currentExportHeaders = headers;
  },

  // Export santri ke format Excel/CSV/Word/PDF (bukan JSON)
  async exportSantriFormat() {
    try {
      T('⏳ Menyiapkan data santri...', 2000);
      const [santri, kamar] = await Promise.all([DB.ga('santri'), DB.ga('kamar')]);
      const kamarMap = {};
      kamar.forEach(k => { kamarMap[k.id] = k.nama; });
      const rows = santri.map(s => ({
        Nama: s.nama || '',
        NIS: s.nis || '',
        Kamar: s.kamar || kamarMap[s.kamarId] || '',
        NFC_UID: s.nfcUid || '',
        Aktif: s.aktif ? 'Ya' : 'Tidak',
        Dibuat: s.createdAt ? new Date(s.createdAt).toLocaleDateString('id-ID') : '',
      }));
      CS();
      this.showFormatMenu('Data Santri', rows, null, 'santri-' + _todayLocal());
    } catch(e) {
      T('❌ Gagal: ' + (e.message || e), 4000);
    }
  },

  // Export absensi ke format Excel/CSV/Word/PDF
  async exportAbsensiFormat(kgId, date) {
    try {
      T('⏳ Menyiapkan data absensi...', 2000);
      const [ses, abs, snt, kg, sk] = await Promise.all([
        DB.ga('sesi'), DB.ga('absensi'), DB.ga('santri'),
        DB.ga('kegiatan'), DB.ga('subKeg')
      ]);
      const kgM = {}, sntM = {}, skM = {};
      kg.forEach(k => { kgM[k.id] = k.nama; });
      snt.forEach(s => { sntM[s.id] = s; });
      sk.forEach(s => { skM[s.id] = s.nama; });
      const sl = ses.filter(x => (!date || x.tanggal === date) && (!kgId || x.kgId === kgId));
      const rows = [];
      for (const sx of sl) {
        const k = kgM[sx.kgId] || '-';
        const skNm = sx.skId ? (skM[sx.skId] || '-') : '-';
        const al = abs.filter(a => a.sesiId === sx.id);
        for (const a of al) {
          const s = sntM[a.sntId] || {};
          rows.push({
            Tanggal: sx.tanggal,
            Kegiatan: k,
            'Sub Kegiatan': skNm,
            Nama: s.nama || '-',
            Kamar: s.kamar || '-',
            Status: a.status || 'none',
            Pengabsen: a.oleh || '-',
          });
        }
      }
      CS();
      this.showFormatMenu('Absensi', rows, null, 'absensi-' + (date || 'all') + '-' + _todayLocal());
    } catch(e) {
      T('❌ Gagal: ' + (e.message || e), 4000);
    }
  },

  // Export perizinan ke format Excel/CSV/Word/PDF
  async exportPerizinanFormat() {
    try {
      T('⏳ Menyiapkan data perizinan...', 2000);
      const [per, snt] = await Promise.all([DB.ga('perizinan'), DB.ga('santri')]);
      const sntMap = {};
      snt.forEach(s => { sntMap[s.id] = s.nama; });
      const rows = per.map(p => ({
        Santri: sntMap[p.sntId] || '-',
        Jenis: p.jenis || '',
        TglMulai: p.tglMulai || '',
        TglSelesai: p.tglSelesai || '',
        Status: p.status || '',
        Keterangan: p.keterangan || '',
        Wali: p.namaWali || '',
        Penginput: p.oleh || '-',
      }));
      CS();
      this.showFormatMenu('Perizinan', rows, null, 'perizinan-' + _todayLocal());
    } catch(e) {
      T('❌ Gagal: ' + (e.message || e), 4000);
    }
  },

  // Export pelanggaran ke format Excel/CSV/Word/PDF
  async exportPelanggaranFormat() {
    try {
      T('⏳ Menyiapkan data pelanggaran...', 2000);
      const [pel, snt, kg, sk] = await Promise.all([
        DB.ga('pelanggaran'), DB.ga('santri'), DB.ga('kegiatan'), DB.ga('subKeg')
      ]);
      const sntMap = {}, kgMap = {}, skMap = {};
      snt.forEach(s => { sntMap[s.id] = s.nama; });
      kg.forEach(k => { kgMap[k.id] = k.nama; });
      sk.forEach(s => { skMap[s.id] = s.nama; });
      const rows = pel.map(p => ({
        Santri: sntMap[p.sntId] || p.sntNama || '-',
        Jenis: p.pelanggaranJenis || '',
        Tipe: p.tipe || '',
        Kegiatan: kgMap[p.kgId] || p.kgNama || '-',
        'Sub Kegiatan': skMap[p.skId] || p.skNama || '-',
        Tanggal: p.tanggal || '',
        Status: p.status || '',
        Catatan: p.catatanHukuman || '',
        Penginput: p.oleh || '-',
      }));
      CS();
      this.showFormatMenu('Pelanggaran', rows, null, 'pelanggaran-' + _todayLocal());
    } catch(e) {
      T('❌ Gagal: ' + (e.message || e), 4000);
    }
  },

  // Export catatan sakit ke format Excel/CSV/Word/PDF
  async exportSakitFormat() {
    try {
      T('⏳ Menyiapkan data catatan sakit...', 2000);
      const [sakit, snt] = await Promise.all([DB.ga('catatanSakit'), DB.ga('santri')]);
      const sntMap = {};
      snt.forEach(s => { sntMap[s.id] = s.nama; });
      const rows = sakit.map(s => ({
        Santri: sntMap[s.sntId] || '-',
        TglMulai: s.tglMulai || '',
        Diagnosis: s.diagnosis || '',
        Penanganan: s.penanganan || '',
        Status: s.status === 'belum_sembuh' ? 'Belum Sembuh' : (s.status === 'sembuh' ? 'Sembuh' : s.status || ''),
        SembuhPada: s.sembuhAt ? new Date(s.sembuhAt).toLocaleDateString('id-ID') : '',
        Penginput: s.oleh || '-',
      }));
      CS();
      this.showFormatMenu('Catatan Sakit', rows, null, 'catatan-sakit-' + _todayLocal());
    } catch(e) {
      T('❌ Gagal: ' + (e.message || e), 4000);
    }
  },

  // ── AUDIT v3: Export menu dengan 3 opsi terpisah ──
  showExportMenu(){
    OS(`<div class="sh">📤 Export Data (JSON)</div><div class="sb" style="padding-bottom:70px">
      <div style="font-size:12px;color:var(--t3);margin-bottom:14px;line-height:1.5">Pilih jenis data yang ingin diexport. Format JSON — bisa dibuka di Excel atau di-restore kembali via menu Import Backup (pilih file JSON).</div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="Exp.exportSantriLengkap()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(13,181,127,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">👥</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Data Santri Lengkap</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px;line-height:1.4">Santri + kamar + catatan + riwayat absensi + pelanggaran + perizinan + uzur + catatan sakit (per santri)</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="Exp.exportKegiatanLengkap()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(37,99,235,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📋</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Kegiatan & Sub-Kegiatan</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px;line-height:1.4">Kegiatan + sub-kegiatan + anggota kamar per sub-kegiatan + sesi absensi (semua tanggal)</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="Exp.exportPerizinanSakit()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📝</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Perizinan & Catatan Sakit</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px;line-height:1.4">Semua data perizinan (izin pulang, dispensasi, dll) + catatan sakit (diagnosis, penanganan, status sembuh)</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>

      <div style="font-size:10px;color:var(--t4);margin-top:14px;line-height:1.5;text-align:center">💡 Untuk export SEMUA data (termasuk settings, users, audit log), gunakan "Export Backup JSON (Semua)" di atas.</div>
    </div>`);
  },

  // ── AUDIT v3d: Menu export format Excel/CSV/Word/PDF ──
  showFormatExportMenu(){
    OS(`<div class="sh">📊 Export ke Excel/CSV/Word/PDF</div><div class="sb" style="padding-bottom:70px">
      <div style="font-size:12px;color:var(--t3);margin-bottom:14px;line-height:1.5">Pilih jenis data. Setiap pilihan akan menampilkan menu format (Excel/CSV/Word/PDF).</div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="CS();Exp.exportSantriFormat()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(13,181,127,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">👥</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Data Santri</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Nama, NIS, kamar, NFC UID, status aktif</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="CS();Exp.exportAbsensiFormat()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(37,99,235,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">✅</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Data Absensi</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Semua sesi & status absensi (semua tanggal)</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="CS();Exp.exportPerizinanFormat()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📝</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Data Perizinan</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Izin pulang, dispensasi, status, keterangan</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="CS();Exp.exportPelanggaranFormat()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">⚠️</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Data Pelanggaran</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Alpha, terlambat, jenis, status hukuman</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="CS();Exp.exportSakitFormat()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🤒</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Data Catatan Sakit</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Diagnosis, penanganan, status sembuh</div>
          </div>
          <div style="color:var(--a1);font-size:18px">→</div>
        </div>
      </div>
    </div>`);
  },

  // Export 1: Data Santri Lengkap
  // Mencakup: santri, kamar, catatanSantri, absensi (semua), pelanggaran, perizinan, uzur, catatanSakit
  // Difilter per-santri: hanya data yang berhubungan dengan santri yang ada
  async exportSantriLengkap(){
    try {
      T('⏳ Menyiapkan data santri...', 2000);
      const [santri, kamar, catatanSantri, absensi, pelanggaran, perizinan, uzur, catatanSakit, sesi] = await Promise.all([
        DB.ga('santri'), DB.ga('kamar'), DB.ga('catatanSantri'),
        DB.ga('absensi'), DB.ga('pelanggaran'), DB.ga('perizinan'),
        DB.ga('uzur'), DB.ga('catatanSakit'), DB.ga('sesi')
      ]);
      const santriIds = new Set(santri.map(s => s.id));
      const data = {
        exportedAt: new Date().toISOString(),
        exportType: 'santri_lengkap',
        version: '6',
        tenant_ns: localStorage.getItem('tenant_ns'),
        tenant_nama: localStorage.getItem('tenant_nama'),
        tenant_tipe: localStorage.getItem('tenant_tipe'),
        santri: santri,
        kamar: kamar,
        // Filter catatanSantri: hanya untuk santri yang ada
        catatanSantri: catatanSantri.filter(c => santriIds.has(c.sntId)),
        // Sesi diperlukan untuk konteks absensi
        sesi: sesi,
        // Absensi: semua (karena berhubungan dengan santri via sntId)
        absensi: absensi.filter(a => santriIds.has(a.sntId)),
        // Pelanggaran: hanya untuk santri yang ada
        pelanggaran: pelanggaran.filter(p => santriIds.has(p.sntId)),
        // Perizinan: hanya untuk santri yang ada
        perizinan: perizinan.filter(p => santriIds.has(p.sntId)),
        // Uzur: hanya untuk santri yang ada
        uzur: uzur.filter(u => santriIds.has(u.sntId)),
        // Catatan sakit: hanya untuk santri yang ada
        catatanSakit: catatanSakit.filter(s => santriIds.has(s.sntId)),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `santri-lengkap-${_todayLocal()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      CS();
      T(`✅ Export santri lengkap! ${santri.length} santri, ${absensi.length} absensi, ${perizinan.length} perizinan, ${catatanSakit.length} catatan sakit`, 5000);
    } catch(e) {
      console.error('[Export] santriLengkap error:', e);
      T('❌ Gagal export: ' + (e.message || e), 4000);
    }
  },

  // Export 2: Kegiatan + Sub-Kegiatan + Anggota + Sesi
  async exportKegiatanLengkap(){
    try {
      T('⏳ Menyiapkan data kegiatan...', 2000);
      const [kegiatan, subKeg, anggota, sesi, absensi] = await Promise.all([
        DB.ga('kegiatan'), DB.ga('subKeg'), DB.ga('anggota'),
        DB.ga('sesi'), DB.ga('absensi')
      ]);
      const data = {
        exportedAt: new Date().toISOString(),
        exportType: 'kegiatan_lengkap',
        version: '6',
        tenant_ns: localStorage.getItem('tenant_ns'),
        tenant_nama: localStorage.getItem('tenant_nama'),
        tenant_tipe: localStorage.getItem('tenant_tipe'),
        kegiatan: kegiatan,
        subKeg: subKeg,
        // Anggota: keanggotaan kamar per sub-kegiatan
        anggota: anggota,
        // Sesi: semua sesi absensi (semua tanggal)
        sesi: sesi,
        // Absensi: semua (untuk konteks kehadiran per sesi)
        absensi: absensi,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kegiatan-lengkap-${_todayLocal()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      CS();
      T(`✅ Export kegiatan lengkap! ${kegiatan.length} kegiatan, ${subKeg.length} sub-kegiatan, ${anggota.length} anggota, ${sesi.length} sesi`, 5000);
    } catch(e) {
      console.error('[Export] kegiatanLengkap error:', e);
      T('❌ Gagal export: ' + (e.message || e), 4000);
    }
  },

  // Export 3: Perizinan & Catatan Sakit
  async exportPerizinanSakit(){
    try {
      T('⏳ Menyiapkan data perizinan & sakit...', 2000);
      const [perizinan, catatanSakit, santri] = await Promise.all([
        DB.ga('perizinan'), DB.ga('catatanSakit'), DB.ga('santri')
      ]);
      const santriMap = {};
      santri.forEach(s => { santriMap[s.id] = s.nama; });
      const data = {
        exportedAt: new Date().toISOString(),
        exportType: 'perizinan_sakit',
        version: '6',
        tenant_ns: localStorage.getItem('tenant_ns'),
        tenant_nama: localStorage.getItem('tenant_nama'),
        tenant_tipe: localStorage.getItem('tenant_tipe'),
        perizinan: perizinan.map(p => ({
          ...p,
          sntNama: santriMap[p.sntId] || '-'
        })),
        catatanSakit: catatanSakit.map(s => ({
          ...s,
          sntNama: santriMap[s.sntId] || '-'
        })),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `perizinan-sakit-${_todayLocal()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      CS();
      T(`✅ Export perizinan & sakit! ${perizinan.length} perizinan, ${catatanSakit.length} catatan sakit`, 5000);
    } catch(e) {
      console.error('[Export] perizinanSakit error:', e);
      T('❌ Gagal export: ' + (e.message || e), 4000);
    }
  },

  async _txt(kgId,date){
const [ses,abs,snt,kg,sk]=await Promise.all([DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('kegiatan'),DB.ga('subKeg')]);
const k=kg.find(x=>x.id===kgId);
const skM=mapBy(sk,'id');
const sntM=mapBy(snt,'id');
// All sessions for this kegiatan on this date (main + sub)
const sl=ses.filter(x=>x.tanggal===date&&x.kgId===kgId);
const lb={alpha:'\u274C ALPHA',izin:'\uD83D\uDCCB IZIN',sakit:'\uD83E\uDD12 SAKIT',terlambat:'\u23F0 TERLAMBAT'};
let t=`\uD83D\uDCC5 ${date}\n\uD83D\uDCd6 ${k?.nama||'-'}\n\n`;
// Main session (no skId)
const mainSes=sl.filter(x=>!x.skId);
const mainAbs=abs.filter(a=>mainSes.find(x=>x.id===a.sesiId));
if(mainAbs.length){
const gr={alpha:[],izin:[],sakit:[],terlambat:[]};
mainAbs.forEach(a=>{if(gr[a.status])gr[a.status].push(sntM[a.sntId])});
const hadirCnt=mainAbs.filter(a=>a.status==='hadir').length;
t+=`\u2705 Hadir: ${hadirCnt} dari ${mainAbs.length}\n\n`;
for(const [st,list] of Object.entries(gr)){const v=list.filter(Boolean);if(!v.length)continue;t+=`${lb[st]} (${v.length})\n`;v.forEach((x,i)=>{t+=`${i+1}. ${x.nama} \u2014 Kamar ${x.kamar}\n`});t+='\n'}
}
// Sub kegiatan sessions
const subSes=sl.filter(x=>x.skId);
if(subSes.length){
t+=`\u2014\n`;
for(const sx of subSes){
const skItem=skM[sx.skId];
const sa=abs.filter(a=>a.sesiId===sx.id);
if(!sa.length)continue;
t+=`\n\uD83D\uDD39 ${skItem?.nama||sx.skId}\n`;
const hadirC=sa.filter(a=>a.status==='hadir').length;
t+=`\u2705 Hadir: ${hadirC}/${sa.length}\n`;
const gr2={alpha:[],izin:[],sakit:[],terlambat:[]};
sa.forEach(a=>{if(gr2[a.status])gr2[a.status].push(sntM[a.sntId])});
for(const [st,list] of Object.entries(gr2)){const v=list.filter(Boolean);if(!v.length)continue;t+=`${lb[st]} (${v.length}): `;t+=v.map(x=>x.nama).join(', ')+'\n'}
}
t+='\n';
}
if(!mainAbs.length&&!subSes.length){
t+='(Belum ada data absensi)\n\n';
}
return t+'\u2014\n'+_appN();
  },
  async _share(txt){
    S._shareTxt=txt;
    OS(`<div class="sh">Bagikan Laporan</div><div class="sb" style="padding-bottom:70px">
      <textarea class="fi" rows="10" id="sh-txt" style="font-size:11px;margin-bottom:12px">${txt}</textarea>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="bg2 bw" onclick="Exp._shareWA()">&#x1F4E4; Laporkan WhatsApp</button>
        <button style="padding:13px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:13px;font-weight:700;color:var(--t1);cursor:pointer" onclick="navigator.clipboard.writeText(document.getElementById('sh-txt').value).then(()=>{T('\u2705 Disalin!');CS()}).catch(()=>T('Gagal menyalin, salin manual dari kotak teks'))">&#x1F4CB; Salin</button>
      </div>
    </div>`);
  },
  async _shareWA(){
    const txt=document.getElementById('sh-txt')?.value||S._shareTxt||'';
    // Share WhatsApp generik (tanpa nomor tujuan tetap) — user pilih kontak sendiri
    const url='https://api.whatsapp.com/send?text='+encodeURIComponent(txt);
    window.open(url,'_blank');
    CS();
  },
  async shareRek(kgId,date){await this._share(await this._txt(kgId,date))},
  async shareAbs(sid){const sx=await DB.g('sesi',sid);if(!sx)return;await this._share(await this._txt(sx.kgId,sx.tanggal))},
  async shareSntBaru(sntId,mode){
const [sn,absAll,sesAll,kg,sk,catatan,sakitAllSntShare]=await Promise.all([
DB.g('santri',sntId),DB.ga('absensi'),DB.ga('sesi'),DB.ga('kegiatan'),DB.ga('subKeg'),DB.ga('catatanSantri'),DB.ga('catatanSakit').catch(()=>[])
]);
if(!sn)return;
const kgM=mapBy(kg,'id');const skM=mapBy(sk,'id');
const now=new Date();
let filterFn,periodeLabel;
if(mode==='harian'){
const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
filterFn=sx=>sx.tanggal===today;
periodeLabel=`Harian: ${today}`;
}else{
const mp=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
filterFn=sx=>sx.tanggal.startsWith(mp);
const mn=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
periodeLabel=`Bulanan: ${mn[now.getMonth()]} ${now.getFullYear()}`;
}
const filteredSes=sesAll.filter(filterFn);
const sa=absAll.filter(a=>a.sntId===sntId&&filteredSes.find(x=>x.id===a.sesiId));
const cnt={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
sa.forEach(a=>{if(cnt[a.status]!==undefined)cnt[a.status]++});
const tot=sa.length;const pct=tot?Math.round(cnt.hadir/tot*100):0;

let t=`REKAP SANTRI\n`;
t+=`${sn.nama}`;
if(sn.panggilan)t+=`(${sn.panggilan})`;
t+=`\n ${periodeLabel}\n`;
t+=`Kamar: ${sn.kamar}`;
if(sn.kelas)t+=`| ${sn.kelas}`;
if(sn.ttl)t+='\n TTL: '+sn.ttl;
if(sn.alamat)t+='\n Alamat: '+sn.alamat;
t+='\n\n';

// Ringkasan
t+=`RINGKASAN KEHADIRAN\n`;
t+=`Hadir : ${cnt.hadir}x\n`;
t+=`Alpha : ${cnt.alpha}x\n`;
t+=`Izin : ${cnt.izin}x\n`;
t+=`Sakit : ${cnt.sakit}x\n`;
t+=`Terlambat: ${cnt.terlambat}x\n`;
t+=`Persentase: ${pct}% hadir\n\n`;

// Riwayat lengkap per kegiatan + sub kegiatan
t+=`RIWAYAT ABSENSI\n`;
sa.slice(-30).reverse().forEach(a=>{
const sx=filteredSes.find(x=>x.id===a.sesiId);
if(!sx)return;
const k=kgM[sx.kgId];
const skItem=sx.skId?skM[sx.skId]:null;
const stLabel={hadir:' Hadir',alpha:' Alpha',izin:' Izin',sakit:' Sakit',terlambat:' Terlambat'}[a.status]||a.status;
t+=`${sx.tanggal.slice(5)} | ${k?.nama||'-'}${skItem?` (${skItem.nama})`:''} | ${stLabel}\n`;
});
if(!sa.length)t+='(Tidak ada data di periode ini)\n';

// Catatan
const catSantri=catatan.filter(c=>c.sntId===sntId);
const catP=catSantri.filter(c=>c.tipe==='prestasi');
const catV=catSantri.filter(c=>c.tipe==='pelanggaran');
const catU=catSantri.filter(c=>c.tipe==='umum');
if(catP.length){t+=`\n PRESTASI\n`;catP.forEach(c=>{t+=`• ${c.isi}\n`})}
if(catV.length){t+=`\n PELANGGARAN\n`;catV.forEach(c=>{t+=`• ${c.isi}${c.poin?` (${c.poin} poin)`:''}\n`})}
if(catU.length){t+=`\n CATATAN\n`;catU.forEach(c=>{t+=`• ${c.isi}\n`})}

// Riwayat Catatan Sakit ( dari store catatanSakit)
const sntSakitShare=(sakitAllSntShare||[]).filter(s=>s.sntId===sntId).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
if(sntSakitShare.length){
  t+='\n RIWAYAT CATATAN SAKIT\n';
  sntSakitShare.forEach(s=>{
    const statusTxt=s.status==='belum_sembuh'?'Belum Sembuh':'Sudah Sembuh';
    t+=`• ${s.tglMulai} | ${statusTxt}`;
    if(s.diagnosis)t+=` | ${s.diagnosis}`;
    if(s.penanganan)t+=` | Penanganan: ${s.penanganan}`;
    if(s.status==='sembuh'&&s.sembuhAt){
      const hariSakit=Math.max(1,Math.round((s.sembuhAt-new Date(s.tglMulai+'T00:00:00').getTime())/86400000));
      t+=` | Sembuh ${new Date(s.sembuhAt).toLocaleDateString('id-ID')} (${hariSakit} hari)`;
    }
    t+='\n';
  });
}

t+='\n—\n'+_appN();
await this._share(t);
  },
  async shareSnt(sntId){await this.shareSntBaru(sntId,'bulanan')},
  async csvSes(kgId,date){
    const [ses,abs,snt,kg,sk]=await Promise.all([DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('kegiatan'),DB.ga('subKeg')]);
    const kgM=mapBy(kg,'id'),sntM=mapBy(snt,'id'),skM=mapBy(sk,'id');
    const sl=ses.filter(x=>(!date||x.tanggal===date)&&(!kgId||x.kgId===kgId));
    const rows=[['Tanggal','Kegiatan','Sub Kegiatan','Nama','Kamar','Status','Pengabsen']];
    for(const sx of sl){const k=kgM[sx.kgId]||{};const skNm=sx.skId?(skM[sx.skId]?.nama||'-'):'-';const al=abs.filter(a=>a.sesiId===sx.id);for(const a of al){const s=sntM[a.sntId]||{};rows.push([sx.tanggal,k.nama||'-',skNm,s.nama||'-',s.kamar||'-',a.status,a.oleh||'-'])}}
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`absensi-${date||'all'}.csv`;a.click();URL.revokeObjectURL(url);T('\u2705 CSV diunduh!');
  },
  async backupJSON(){
    // ── H4 BUG FIX: Include chat messages (localStorage) & tenant metadata ──
    const stores=['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','users','kamar','settings','catatanSantri','pelanggaran','peraturan','kalam','perizinan','uzur','catatanSakit'];
    const d={exportedAt:new Date().toISOString(),version:'6',tenant_ns:localStorage.getItem('tenant_ns'),tenant_nama:localStorage.getItem('tenant_nama'),tenant_tipe:localStorage.getItem('tenant_tipe')};
    for(const s of stores)d[s]=await DB.ga(s);
    // Chat messages disimpan di localStorage (bukan IndexedDB)
    try{d.chat=await ChatDB.getAll();}catch(e){d.chat=[];}
    const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`assalam-backup-${_todayLocal()}.json`;a.click();URL.revokeObjectURL(url);T('\u2705 Backup diunduh!');
  },
  showImportBackup(){
    if(!_needAdmin())return;
    OS(`<div class="sh">\uD83D\uDCE5 Pulihkan Backup</div><div class="sb" style="padding-bottom:70px">
      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:var(--r2);padding:12px;margin-bottom:14px;font-size:12px;color:#92400e;">
        \u26A0\uFE0F Semua data saat ini akan <strong>diganti</strong> dengan data dari file backup.
      </div>
      <div style="font-size:12px;color:var(--t3);margin-bottom:14px">Pilih file JSON yang diunduh dari aplikasi ini.</div>
      <input type="file" id="backup-file" accept=".json" style="display:none" onchange="Exp._doImport(this.files[0])">
      <button class="bg2 bw" onclick="document.getElementById('backup-file').click()">\uD83D\uDCC2 Pilih File Backup</button>
    </div>`);
  },
  async _doImport(file){
    if(!_needAdmin())return;
    if(!file){return}
    try{
      const text=await file.text();
      const data=JSON.parse(text);
      // ── H4/H5 BUG FIX: Validasi skema & true restore ──
      if(!data || typeof data !== 'object' || !data.exportedAt){
        T('❌ File bukan backup yang valid (tidak ada metadata exportedAt).');
        return;
      }
      // ── AUDIT v3h FIX: Cross-tenant restore tanpa reload ──
      // Sebelumnya: jika tenant beda, switch localStorage lalu reload. Tapi
      // setelah reload, user harus klik tombol restore LAGI + pilih file LAGI.
      // User sering lupa → restore gagal.
      // Sekarang: konfirmasi, lalu switch tenant langsung di memori + restore
      // langsung ke tenant yang benar. Tidak perlu reload.
      const currentNs = _fbNs();
      const backupNs = data.tenant_ns;
      const backupNama = data.tenant_nama || backupNs;
      let targetNs = currentNs;
      if (backupNs && backupNs !== currentNs && currentNs !== 'default') {
        const konfirmasi = confirm(
          '⚠️ PERINGATAN TENANT MISMATCH\n\n' +
          'File backup berasal dari: ' + backupNama + ' (ns: ' + backupNs + ')\n' +
          'Device ini sedang aktif di: ' + (localStorage.getItem('tenant_nama')||currentNs) + ' (ns: ' + currentNs + ')\n\n' +
          'Pilih OK untuk: Restore ke tenant "' + backupNama + '" (switch otomatis)\n' +
          'Pilih Cancel untuk: Batalkan restore.'
        );
        if (!konfirmasi) {
          T('❌ Restore dibatalkan.');
          return;
        }
        // Switch tenant di localStorage + di memori
        localStorage.setItem('tenant_ns', backupNs);
        localStorage.setItem('tenant_nama', backupNama);
        localStorage.setItem('tenant_tipe', data.tenant_tipe || 'asrama');
        targetNs = backupNs;
        T('🔄 Memberalihkan ke tenant ' + backupNama + '...', 2000);
        // Tidak perlu reload — lanjut restore langsung ke targetNs
      }
      // Versi backup — warning kalau beda major version
      const verMajor = parseInt(String(data.version||'0').split('.')[0], 10);
      if(verMajor > 6){
        T('⚠️ Backup versi lebih baru ('+data.version+') dari app (v6). Mungkin tidak kompatibel — lanjut dengan hati-hati.');
      }
      const stores=['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','users','kamar','settings','catatanSantri','pelanggaran','peraturan','kalam','perizinan','uzur','catatanSakit'];
      CS();
      T('⏳ Memulihkan data ke tenant ' + (backupNama || targetNs) + '...', 6000);
      // ── H5 BUG FIX: True restore — purge Firestore dulu, lalu lokal ──
      // AUDIT v3h: Gunakan targetNs (bukan _fbNs()) supaya cross-tenant restore
      // menulis ke tenant yang benar.
      if(navigator.onLine){
        // AUDIT v3j: Progress tracking + error handling per store
        let purgeErrors = 0;
        for(let i = 0; i < stores.length; i++){
          const s = stores[i];
          try{
            T('⏳ Menghapus data lama... (' + (i+1) + '/' + stores.length + ')', 2000);
            const snap=await _fsDB.collection('tenants').doc(targetNs).collection(s).get().catch(()=>null);
            if(snap && snap.docs && snap.docs.length){
              let batch=_fsDB.batch(),cnt=0;
              for(const doc of snap.docs){
                batch.delete(doc.ref);
                if(++cnt>=450){await batch.commit();batch=_fsDB.batch();cnt=0;}
              }
              if(cnt>0)await batch.commit();
            }
          }catch(e){
            console.warn('[Restore] purge FB '+s+':',e);
            purgeErrors++;
          }
        }
        if (purgeErrors > 0) console.warn('[Restore] purge errors:', purgeErrors, 'stores');
      }
      // Clear & restore lokal
      for(const s of stores){
        if(data[s]&&Array.isArray(data[s])){
          await DB.cl(s);
          for(const item of data[s]) await DB.p(s,item);
        }
      }
      // ── AUDIT v3e FIX: Force flush write queue ke cloud ──
      if (navigator.onLine && FBSync && FBSync._flushWrites) {
        T('⏳ Mengunggah data ke cloud... jangan tutup aplikasi.', 8000);
        try {
          let attempts = 0;
          while (attempts < 10) {
            await FBSync._flushWrites();
            const dot = document.getElementById('sync-dot');
            if (dot && dot.className === 'ok') break;
            attempts++;
            await new Promise(r => setTimeout(r, 1000));
          }
          console.log('[Restore] Write queue flushed to cloud');
        } catch(e) {
          console.warn('[Restore] flush error:', e);
        }
      }
      // ── AUDIT v3e FIX: Push langsung ke Firestore (bypass write queue) ──
      // AUDIT v3j: Tambah progress tracking + error handling per store.
      // Sebelumnya: jika 1 store gagal, seluruh push berhenti → data cloud
      // tidak lengkap. Sekarang: setiap store di-try-catch terpisah, lanjut
      // ke store berikutnya meski ada yang gagal.
      if (navigator.onLine) {
        let pushErrors = 0;
        let pushSuccess = 0;
        for(let i = 0; i < stores.length; i++){
          const s = stores[i];
          if(!data[s] || !Array.isArray(data[s]) || data[s].length === 0) continue;
          try {
            T('⏳ Mengunggah ' + s + '... (' + (i+1) + '/' + stores.length + ')', 2000);
            let batch = _fsDB.batch(), cnt = 0;
            const col = _fsDB.collection('tenants').doc(targetNs).collection(s);
            for(const item of data[s]){
              if(item && item.id){
                const cleaned = _fsClean(item);
                delete cleaned._ts; delete cleaned._etag; delete cleaned._srvTs;
                batch.set(col.doc(item.id), cleaned, {merge: false});
                if(++cnt >= 450){
                  await batch.commit();
                  batch = _fsDB.batch();
                  cnt = 0;
                }
              }
            }
            if(cnt > 0) await batch.commit();
            pushSuccess++;
            console.log('[Restore] Direct push (' + targetNs + '):', s, data[s].length, 'docs');
          } catch(e) {
            console.warn('[Restore] push error for', s, ':', e.message);
            pushErrors++;
            // AUDIT v3j: Retry sekali untuk store ini
            try {
              T('⏳ Mencoba ulang ' + s + '...', 2000);
              let batch = _fsDB.batch(), cnt = 0;
              const col = _fsDB.collection('tenants').doc(targetNs).collection(s);
              for(const item of data[s]){
                if(item && item.id){
                  const cleaned = _fsClean(item);
                  delete cleaned._ts; delete cleaned._etag; delete cleaned._srvTs;
                  batch.set(col.doc(item.id), cleaned, {merge: false});
                  if(++cnt >= 450){
                    await batch.commit();
                    batch = _fsDB.batch();
                    cnt = 0;
                  }
                }
              }
              if(cnt > 0) await batch.commit();
              pushSuccess++;
              console.log('[Restore] Retry push success:', s);
            } catch(e2) {
              console.error('[Restore] retry push failed for', s, ':', e2.message);
            }
          }
        }
        if (pushErrors > 0) {
          T('⚠️ ' + pushSuccess + ' store berhasil, ' + pushErrors + ' gagal. Coba "Sync Semua" lagi.', 5000);
        } else {
          T('✅ Data tersinkron ke cloud! (' + pushSuccess + ' store)', 3000);
        }
      }
      // Restore chat messages (localStorage + cloud)
      // AUDIT v3h: Pakai targetNs untuk cloud restore
      if(Array.isArray(data.chat)){
        try{
          localStorage.setItem('chat_msgs',JSON.stringify(data.chat.slice(-200)));
          // Sync ke Firestore dengan batch (lebih cepat dari one-by-one)
          if (navigator.onLine && data.chat.length > 0) {
            let batch = _fsDB.batch(), cnt = 0;
            const col = _fsDB.collection('tenants').doc(targetNs).collection('chat');
            for (const m of data.chat) {
              if (m && m.id) {
                batch.set(col.doc(m.id), _fsClean(m), {merge: false});
                if (++cnt >= 450) { await batch.commit(); batch = _fsDB.batch(); cnt = 0; }
              }
            }
            if (cnt > 0) await batch.commit();
          }
        }catch(e){console.warn('[Restore] chat error:',e);}
      }
      // Restore tenant metadata (opsional — hanya kalau ada & user konfirmasi)
      if(data.tenant_ns && data.tenant_nama){
        // Jangan override tenant aktif — user mungkin di tenant berbeda.
        // Hanya info bahwa metadata tersimpan di file.
        console.log('[Restore] Backup berisi metadata tenant:',data.tenant_nama);
      }
      T('✅ Backup berhasil dipulihkan! Memuat ulang...');
      // ── AUDIT v3i: Broadcast sync trigger ke device lain ──
      // Setelah import, tulis timestamp ke settings/syncTrigger di cloud.
      // Device lain yang punya onSnapshot untuk settings akan ter-trigger
      // dan invalidate cache + pull fresh data.
      if (navigator.onLine) {
        try {
          const triggerRef = _fsDB.collection('tenants').doc(targetNs).collection('settings').doc('_syncTrigger');
          await triggerRef.set({ ts: Date.now(), by: S.user?.nama || '-', type: 'import' }, { merge: true });
          console.log('[Restore] Sync trigger broadcasted');
        } catch(e) { console.warn('[Restore] sync trigger error:', e); }
      }
      setTimeout(()=>location.reload(),1500);
    }catch(e){
      console.error('[Restore] error:',e);
      T('\u274C Gagal: file tidak valid atau rusak — '+(e.message||e));
    }
  },

  // ── Helper: unduh tabel HTML sebagai file Excel (.xls) ────────────────
  // Trik lama tapi teruji: Excel membuka file .xls yang isinya sebenarnya
  // tabel HTML biasa (dengan MIME application/vnd.ms-excel) secara native
  // sebagai spreadsheet asli — tanpa perlu memuat library tambahan (SheetJS
  // dkk) yang akan menambah beban load aplikasi & risiko gagal offline.
  _downloadHTMLTable(filename, bodyHtml, sheetName){
    const safeSheet=(sheetName||'Sheet1').replace(/[^\w \-]/g,'').slice(0,28)||'Sheet1';
    const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${safeSheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:10pt} td,th{border:1px solid #ccc;padding:3pt 6pt} th{background:#d4f7e8;font-weight:bold}</style>
</head><body>${bodyHtml}</body></html>`;
    const blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  },

  // ── Helper: unduh HTML sebagai dokumen Word (.doc) ────────────────────
  // Trik yang sama diterapkan untuk Word: file .doc berisi HTML dengan
  // namespace w: dibuka MS Word sebagai dokumen asli, tanpa perlu library
  // docx tambahan.
  _downloadWordDoc(filename, bodyHtml){
    const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Export</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#16211a}
h1{font-size:18pt;color:#0f9d72;margin-bottom:2pt}
h2{font-size:13pt;color:#0f9d72;margin-top:16pt;margin-bottom:6pt;border-bottom:1pt solid #0db57f;padding-bottom:2pt}
table{border-collapse:collapse;width:100%;margin-bottom:8pt}
td,th{border:1pt solid #999;padding:4pt 6pt;font-size:9.5pt;text-align:left}
th{background:#e8f7f1}
</style>
</head><body>${bodyHtml}</body></html>`;
    const blob=new Blob(['\ufeff'+html],{type:'application/msword'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  },

  // ── Export lengkap satu santri: identitas + seluruh riwayat/catatan/
  // perizinan/catatan sakit/pelanggaran — ke Word, Excel, atau PDF ──────
  async exportSntFull(sntId, format){
    T('\u23F3 Menyiapkan data export...');
    const [sn,absAll,sesAll,kg,sk,catatan,perAll,sakitAll,pelAll]=await Promise.all([
      DB.g('santri',sntId),DB.ga('absensi'),DB.ga('sesi'),DB.ga('kegiatan'),DB.ga('subKeg'),
      DB.ga('catatanSantri'),DB.ga('perizinan'),DB.ga('catatanSakit'),DB.ga('pelanggaran')
    ]);
    if(!sn){T('\u274C Santri tidak ditemukan');return;}
    const kgM=mapBy(kg,'id'),skM=mapBy(sk,'id');
    const absList=absAll.filter(a=>a.sntId===sntId).map(a=>{
      const sx=sesAll.find(x=>x.id===a.sesiId);
      return{tanggal:sx?.tanggal||'-',kegiatan:sx?(kgM[sx.kgId]?.nama||'-'):'-',sub:sx?.skId?(skM[sx.skId]?.nama||'-'):'-',status:a.status,oleh:a.oleh||'-'};
    }).sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
    const catList=catatan.filter(c=>c.sntId===sntId).sort((a,b)=>b.createdAt-a.createdAt);
    const perList=perAll.filter(p=>p.sntId===sntId).sort((a,b)=>b.createdAt-a.createdAt);
    const sakitList=sakitAll.filter(s=>s.sntId===sntId).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const pelList=pelAll.filter(p=>p.sntId===sntId).sort((a,b)=>b.createdAt-a.createdAt);
    const cnt={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
    absList.forEach(a=>{if(cnt[a.status]!==undefined)cnt[a.status]++});
    const tot=absList.length; const pct=tot?Math.round(cnt.hadir/tot*100):0;
    const fname=(sn.nama||'santri').replace(/[^a-z0-9]+/gi,'_');
    if(format==='pdf') return this._exportSntPdf(sn,absList,catList,perList,sakitList,pelList,cnt,tot,pct,fname);
    if(format==='word') return this._exportSntWord(sn,absList,catList,perList,sakitList,pelList,cnt,tot,pct,fname);
    if(format==='excel') return this._exportSntExcel(sn,absList,catList,perList,sakitList,pelList,cnt,tot,pct,fname);
  },

  _exportSntWord(sn,absList,catList,perList,sakitList,pelList,cnt,tot,pct,fname){
    const e2=s=>esc(s);
    const h=`<h1>Laporan Lengkap Santri</h1>
<h2 style="margin-top:0;border:none">${e2(sn.nama)}${sn.panggilan?' ("'+e2(sn.panggilan)+'")':''}</h2>
<table>
  <tr><th>NIS</th><td>${e2(sn.nis||'-')}</td><th>Kamar</th><td>${e2(sn.kamar||'-')}</td></tr>
  <tr><th>Kelas</th><td>${e2(sn.kelas||'-')}</td><th>Kelas Diniah</th><td>${e2(sn.kelasDiniah||'-')}</td></tr>
  <tr><th>Tempat, Tgl Lahir</th><td colspan="3">${e2(sn.ttl||'-')}</td></tr>
  <tr><th>Alamat</th><td colspan="3">${e2(sn.alamat||'-')}</td></tr>
  <tr><th>Status</th><td>${e2(sn.status||'Aktif')}</td><th>Tgl Masuk</th><td>${e2(sn.tanggalMasuk||'-')}</td></tr>
  <tr><th>Nama Wali</th><td>${e2(sn.waliNama||'-')}</td><th>WA Wali</th><td>${e2(sn.waliWA||'-')}</td></tr>
  ${sn.catatanKesehatan?`<tr><th>Catatan Kesehatan</th><td colspan="3">${e2(sn.catatanKesehatan)}</td></tr>`:''}
</table>
<h2>Ringkasan Kehadiran</h2>
<table>
  <tr><th>Hadir</th><th>Alpha</th><th>Izin</th><th>Sakit</th><th>Terlambat</th><th>Total Sesi</th><th>% Hadir</th></tr>
  <tr><td>${cnt.hadir}</td><td>${cnt.alpha}</td><td>${cnt.izin}</td><td>${cnt.sakit}</td><td>${cnt.terlambat}</td><td>${tot}</td><td>${pct}%</td></tr>
</table>
<h2>Riwayat Absensi (${absList.length})</h2>
<table><tr><th>Tanggal</th><th>Kegiatan</th><th>Sub Kegiatan</th><th>Status</th><th>Oleh</th></tr>
${absList.map(a=>`<tr><td>${a.tanggal}</td><td>${e2(a.kegiatan)}</td><td>${e2(a.sub)}</td><td>${a.status}</td><td>${e2(a.oleh)}</td></tr>`).join('')||'<tr><td colspan="5">Tidak ada data</td></tr>'}
</table>
<h2>Catatan Prestasi/Pelanggaran/Umum (${catList.length})</h2>
<table><tr><th>Tanggal</th><th>Tipe</th><th>Isi</th></tr>
${catList.map(c=>`<tr><td>${new Date(c.createdAt).toLocaleDateString('id-ID')}</td><td>${c.tipe}</td><td>${e2(c.isi||c.jenis||'-')}</td></tr>`).join('')||'<tr><td colspan="3">Tidak ada data</td></tr>'}
</table>
<h2>Riwayat Perizinan (${perList.length})</h2>
<table><tr><th>Mulai</th><th>Selesai</th><th>Jenis</th><th>Status</th><th>Alasan</th></tr>
${perList.map(p=>`<tr><td>${p.tglMulai}</td><td>${p.tglSelesai}</td><td>${e2(p.tipeIzin)}</td><td>${p.status}</td><td>${e2(p.alasan||'-')}</td></tr>`).join('')||'<tr><td colspan="5">Tidak ada data</td></tr>'}
</table>
<h2>Riwayat Catatan Sakit (${sakitList.length})</h2>
<table><tr><th>Mulai</th><th>Status</th><th>Diagnosis</th><th>Penanganan</th></tr>
${sakitList.map(s=>`<tr><td>${s.tglMulai}</td><td>${s.status}</td><td>${e2(s.diagnosis||'-')}</td><td>${e2(s.penanganan||'-')}</td></tr>`).join('')||'<tr><td colspan="4">Tidak ada data</td></tr>'}
</table>
<h2>Pelanggaran (${pelList.length})</h2>
<table><tr><th>Tanggal</th><th>Jenis</th><th>Status</th><th>Keterangan</th></tr>
${pelList.map(p=>`<tr><td>${p.tanggal}</td><td>${e2(p.tipe==='auto'?(p.pelanggaranJenis||'Alpha'):(p.deskripsi||'Non Alpha'))}</td><td>${p.status}</td><td>${e2(p.catatanHukuman||'-')}</td></tr>`).join('')||'<tr><td colspan="4">Tidak ada data</td></tr>'}
</table>
<p style="font-size:8pt;color:#888">Diekspor dari ${_appN()} pada ${new Date().toLocaleString('id-ID')}</p>`;
    this._downloadWordDoc(fname+'.doc',h);
    T('\u2705 Word berhasil diunduh!');
  },

  _exportSntExcel(sn,absList,catList,perList,sakitList,pelList,cnt,tot,pct,fname){
    const e2=s=>esc(s);
    const h=`<table>
<tr><td colspan="7" style="font-weight:bold;font-size:14pt">Laporan Santri: ${e2(sn.nama)}</td></tr>
<tr><td>NIS</td><td>${e2(sn.nis||'-')}</td><td>Kamar</td><td>${e2(sn.kamar||'-')}</td><td>Kelas</td><td colspan="2">${e2(sn.kelas||'-')}</td></tr>
<tr><td>Status</td><td>${e2(sn.status||'Aktif')}</td><td>Wali</td><td>${e2(sn.waliNama||'-')}</td><td>WA Wali</td><td colspan="2">${e2(sn.waliWA||'-')}</td></tr>
<tr><td></td></tr>
<tr><td colspan="7" style="font-weight:bold;background:#d4f7e8">RINGKASAN KEHADIRAN</td></tr>
<tr><th>Hadir</th><th>Alpha</th><th>Izin</th><th>Sakit</th><th>Terlambat</th><th>Total</th><th>% Hadir</th></tr>
<tr><td>${cnt.hadir}</td><td>${cnt.alpha}</td><td>${cnt.izin}</td><td>${cnt.sakit}</td><td>${cnt.terlambat}</td><td>${tot}</td><td>${pct}%</td></tr>
<tr><td></td></tr>
<tr><td colspan="5" style="font-weight:bold;background:#d4f7e8">RIWAYAT ABSENSI</td></tr>
<tr><th>Tanggal</th><th>Kegiatan</th><th>Sub Kegiatan</th><th>Status</th><th>Oleh</th></tr>
${absList.map(a=>`<tr><td>${a.tanggal}</td><td>${e2(a.kegiatan)}</td><td>${e2(a.sub)}</td><td>${a.status}</td><td>${e2(a.oleh)}</td></tr>`).join('')}
<tr><td></td></tr>
<tr><td colspan="3" style="font-weight:bold;background:#d4f7e8">CATATAN</td></tr>
<tr><th>Tanggal</th><th>Tipe</th><th>Isi</th></tr>
${catList.map(c=>`<tr><td>${new Date(c.createdAt).toLocaleDateString('id-ID')}</td><td>${c.tipe}</td><td>${e2(c.isi||c.jenis||'-')}</td></tr>`).join('')}
<tr><td></td></tr>
<tr><td colspan="5" style="font-weight:bold;background:#d4f7e8">PERIZINAN</td></tr>
<tr><th>Mulai</th><th>Selesai</th><th>Jenis</th><th>Status</th><th>Alasan</th></tr>
${perList.map(p=>`<tr><td>${p.tglMulai}</td><td>${p.tglSelesai}</td><td>${e2(p.tipeIzin)}</td><td>${p.status}</td><td>${e2(p.alasan||'-')}</td></tr>`).join('')}
<tr><td></td></tr>
<tr><td colspan="4" style="font-weight:bold;background:#d4f7e8">CATATAN SAKIT</td></tr>
<tr><th>Mulai</th><th>Status</th><th>Diagnosis</th><th>Penanganan</th></tr>
${sakitList.map(s=>`<tr><td>${s.tglMulai}</td><td>${s.status}</td><td>${e2(s.diagnosis||'-')}</td><td>${e2(s.penanganan||'-')}</td></tr>`).join('')}
<tr><td></td></tr>
<tr><td colspan="4" style="font-weight:bold;background:#d4f7e8">PELANGGARAN</td></tr>
<tr><th>Tanggal</th><th>Jenis</th><th>Status</th><th>Keterangan</th></tr>
${pelList.map(p=>`<tr><td>${p.tanggal}</td><td>${e2(p.tipe==='auto'?(p.pelanggaranJenis||'Alpha'):(p.deskripsi||'Non Alpha'))}</td><td>${p.status}</td><td>${e2(p.catatanHukuman||'-')}</td></tr>`).join('')}
</table>`;
    this._downloadHTMLTable(fname+'.xls',h,sn.nama.slice(0,28));
    T('\u2705 Excel berhasil diunduh!');
  },

  async _exportSntPdf(sn,absList,catList,perList,sakitList,pelList,cnt,tot,pct,fname){
    if(typeof window.jspdf==='undefined'){T('\u274C Modul PDF belum siap, coba lagi sebentar.');return;}
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    let y=18; const lh=5.6; const maxY=284;
    const ensure=(need)=>{ if(y+(need||lh)>maxY){ doc.addPage(); y=18; } };
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text('Laporan Lengkap Santri',14,y); y+=8;
    doc.setFontSize(13); doc.text(String(sn.nama||'-'),14,y); y+=8;
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
    const idRows=[['NIS',sn.nis||'-'],['Kamar',sn.kamar||'-'],['Kelas',sn.kelas||'-'],['Status',sn.status||'Aktif'],['Nama Wali',sn.waliNama||'-'],['WA Wali',sn.waliWA||'-']];
    idRows.forEach(([l,v])=>{ ensure(); doc.text(l+': '+v,14,y); y+=lh; });
    y+=2; ensure(10);
    doc.setFont('helvetica','bold'); doc.text('Ringkasan Kehadiran',14,y); y+=lh;
    doc.setFont('helvetica','normal');
    doc.text(`Hadir ${cnt.hadir} | Alpha ${cnt.alpha} | Izin ${cnt.izin} | Sakit ${cnt.sakit} | Terlambat ${cnt.terlambat} | Total ${tot} sesi | ${pct}% hadir`,14,y); y+=lh+3;

    const section=(title,rows,mapFn)=>{
      ensure(10);
      doc.setFont('helvetica','bold'); doc.text(title+' ('+rows.length+')',14,y); y+=lh;
      doc.setFont('helvetica','normal');
      if(!rows.length){ ensure(); doc.text('- Tidak ada data -',14,y); y+=lh; }
      for(const r of rows){ ensure(); doc.text(String(mapFn(r)).slice(0,112),14,y); y+=lh; }
      y+=3;
    };
    section('Riwayat Absensi',absList.slice(0,300),a=>`${a.tanggal} \u00B7 ${a.kegiatan}${a.sub!=='-'?' ('+a.sub+')':''} \u00B7 ${a.status} \u00B7 ${a.oleh}`);
    section('Catatan',catList,c=>`${new Date(c.createdAt).toLocaleDateString('id-ID')} \u00B7 ${c.tipe} \u00B7 ${(c.isi||c.jenis||'-')}`);
    section('Perizinan',perList,p=>`${p.tglMulai} s/d ${p.tglSelesai} \u00B7 ${p.tipeIzin} \u00B7 ${p.status}${p.alasan?' \u00B7 '+p.alasan:''}`);
    section('Catatan Sakit',sakitList,s=>`${s.tglMulai} \u00B7 ${s.status} \u00B7 ${(s.diagnosis||'-')}`);
    section('Pelanggaran',pelList,p=>`${p.tanggal} \u00B7 ${p.tipe==='auto'?(p.pelanggaranJenis||'Alpha'):(p.deskripsi||'Non Alpha')} \u00B7 ${p.status}`);

    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Diekspor dari '+_appN()+' pada '+new Date().toLocaleString('id-ID'),14,292);
    doc.save(fname+'.pdf');
    T('\u2705 PDF berhasil diunduh!');
  },

  // ── Export rekap Alpha bulanan (pivot): baris = nama santri, kolom =
  // sub-kegiatan (atau kegiatan kalau tanpa sub), sel = jumlah alpha ──────
  async exportAlphaBulanan(year,month){
    T('\u23F3 Menyiapkan rekap alpha...');
    const monthPfx=`${year}-${String(month+1).padStart(2,'0')}`;
    const [sesAll,absAll,snt,sk,kg]=await Promise.all([DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('subKeg'),DB.ga('kegiatan')]);
    const monSes=sesAll.filter(x=>x.tanggal.startsWith(monthPfx));
    const sesM=mapBy(monSes,'id');
    const skM=mapBy(sk,'id'),kgM=mapBy(kg,'id');
    const alphaAbs=absAll.filter(a=>a.status==='alpha'&&sesM[a.sesiId]);
    if(!alphaAbs.length){ T('\u2139\uFE0F Tidak ada data Alpha pada bulan ini.'); return; }

    // Kolom: sub-kegiatan (atau kegiatan kalau tidak punya sub) yang punya
    // minimal 1 kejadian alpha bulan ini.
    const colMap=new Map(); // key -> label
    alphaAbs.forEach(a=>{
      const sx=sesM[a.sesiId];
      const key=sx.skId?('sk_'+sx.skId):('kg_'+sx.kgId);
      if(!colMap.has(key)){
        const label=sx.skId?(skM[sx.skId]?.nama||'-'):(kgM[sx.kgId]?.nama||'-');
        colMap.set(key,label);
      }
    });
    const cols=[...colMap.entries()];

    // Pivot: sntId -> Map(colKey -> jumlah alpha)
    const pivot=new Map();
    alphaAbs.forEach(a=>{
      const sx=sesM[a.sesiId];
      const key=sx.skId?('sk_'+sx.skId):('kg_'+sx.kgId);
      if(!pivot.has(a.sntId))pivot.set(a.sntId,new Map());
      const row=pivot.get(a.sntId);
      row.set(key,(row.get(key)||0)+1);
    });

    const sntM=mapBy(snt,'id');
    const rowsSnt=[...pivot.keys()].map(id=>sntM[id]).filter(Boolean)
      .sort((a,b)=>App._kamarOrder(a.kamar)-App._kamarOrder(b.kamar)||a.nama.localeCompare(b.nama,'id'));

    const monthsFull=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const e2=s=>esc(s);
    const h=`<table>
<tr><td colspan="${cols.length+4}" style="font-weight:bold;font-size:14pt">Rekap Alpha Bulanan \u2014 ${monthsFull[month]} ${year}</td></tr>
<tr><td></td></tr>
<tr>
  <th>No</th><th>Nama Santri</th><th>Kamar</th>
  ${cols.map(([,label])=>`<th>${e2(label)}</th>`).join('')}
  <th>Total</th>
</tr>
${rowsSnt.map((s,i)=>{
  const row=pivot.get(s.id);
  const total=[...row.values()].reduce((a,b)=>a+b,0);
  return `<tr><td>${i+1}</td><td>${e2(s.nama)}</td><td>${e2(s.kamar||'-')}</td>${cols.map(([key])=>`<td>${row.get(key)||0}</td>`).join('')}<td style="font-weight:bold">${total}</td></tr>`;
}).join('')}
</table>`;
    this._downloadHTMLTable(`Rekap_Alpha_${monthsFull[month]}_${year}.xls`,h,'Alpha '+monthsFull[month]);
    T('\u2705 Rekap Alpha '+monthsFull[month]+' '+year+' berhasil diunduh!');
  },
};

// SWIPE
let _tx=0,_ty=0,_tc=null;
document.addEventListener('touchstart',e=>{const c=e.target.closest('.ac');if(!c)return;_tx=e.touches[0].clientX;_ty=e.touches[0].clientY;_tc=c},{passive:true});
document.addEventListener('touchend',e=>{if(!_tc)return;const dx=e.changedTouches[0].clientX-_tx,dy=e.changedTouches[0].clientY-_ty;if(Math.abs(dx)<55||Math.abs(dy)>35){_tc=null;return}_tc.querySelectorAll('.sb3')[dx>0?0:1]?.click();_tc=null},{passive:true});

window.addEventListener('offline',()=>T('\uD83D\uDCF4 Offline \u2014 data tersimpan lokal'));
window.addEventListener('online',()=>T('\u2705 Online kembali'));

if('serviceWorker' in navigator){
  const sw=`const C='av3';self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`;
  navigator.serviceWorker.register(URL.createObjectURL(new Blob([sw],{type:'application/javascript'}))).catch(()=>{});
}

async function loginUser(uid){
  PIN.show('Masukkan PIN','Login musyrifah','v',uid,async(ok,user)=>{
    if(ok){S.user=user;await App._enter();}
  });
}

// ═══════════════════════════════════════════════════════════════
// SETUP WIZARD — hanya muncul saat pertama install (tenant_ns kosong)
// ═══════════════════════════════════════════════════════════════

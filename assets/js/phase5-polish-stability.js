'use strict';
/* Phase 5: UI polish, scanner stability, and compatible XLSX exports. */
(function () {
  const App = window.App;
  const DB = window.DB;
  const M = window.PesantrenkuModules;
  if (!App || !DB || !M) return;

  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = value => String(value || '').toLowerCase().trim();
  const cleanSheet = value => String(value || 'Sheet').replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  const rupiah = value => 'Rp ' + Number(value || 0).toLocaleString('id-ID');

  function crc32(bytes) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
      });
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const u16 = n => [n & 255, (n >>> 8) & 255];
  const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    parts.forEach(part => { out.set(part, offset); offset += part.length; });
    return out;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(file => {
      const name = enc.encode(file.name);
      const data = enc.encode(file.content);
      const crc = crc32(data);
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      locals.push(local, name, data);
      const central = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]);
      centrals.push(central, name);
      offset += local.length + name.length + data.length;
    });
    const centralSize = centrals.reduce((n, p) => n + p.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
    return concat([...locals, ...centrals, end]);
  }
  function colName(n) {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function cell(value, row, col, style) {
    const ref = `${colName(col)}${row}`;
    const attr = style ? ` s="${style}"` : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${attr}><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${attr}><is><t>${esc(value)}</t></is></c>`;
  }
  function sheetXml(sheet) {
    const rows = [];
    let r = 1;
    if (sheet.title) rows.push(`<row r="${r}">${cell(sheet.title, r++, 1, 1)}</row>`);
    if (sheet.meta) rows.push(`<row r="${r}">${cell(sheet.meta, r++, 1, 2)}</row>`);
    rows.push(`<row r="${r}">${sheet.headers.map((h, i) => cell(h, r, i + 1, 3)).join('')}</row>`);
    r++;
    sheet.rows.forEach(values => { rows.push(`<row r="${r}">${values.map((v, i) => cell(v, r, i + 1, 0)).join('')}</row>`); r++; });
    const cols = sheet.headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 7 : 20}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
  }
  function downloadXlsx(filename, rawSheets) {
    const seen = new Map();
    const sheets = (rawSheets.length ? rawSheets : [{ name: 'Data', title: 'Tidak ada data', meta: '', headers: ['Keterangan'], rows: [['Belum ada data']] }]).map(sheet => {
      const base = cleanSheet(sheet.name);
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      return { ...sheet, name: n ? cleanSheet(`${base} ${n + 1}`) : base };
    });
    const workbookSheets = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
    const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
    const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const files = [
      { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>` },
      { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', content: `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF0F6B4F"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDF3EA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0"/><xf numFmtId="0" fontId="3" fillId="1" borderId="0" applyFill="1"/></cellXfs></styleSheet>` }
    ];
    sheets.forEach((sheet, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(sheet) }));
    const blob = new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.xls$/i, '.xlsx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.PesantrenkuXlsx = Object.assign(window.PesantrenkuXlsx || {}, { downloadXlsx });

  function akdRows(records, santri, evaluations, programs) {
    const sntM = mapBy(santri, 'id');
    const evM = mapBy(evaluations, 'id');
    const pgM = mapBy(programs, 'id');
    return records.filter(r => !r.deleted).sort((a, b) => String(sntM[a.sntId]?.nama || '').localeCompare(String(sntM[b.sntId]?.nama || ''), 'id')).map((r, i) => {
      const ev = evM[r.evaluationId] || {};
      const pg = pgM[r.programId] || {};
      return [i + 1, sntM[r.sntId]?.nama || '-', sntM[r.sntId]?.nis || '-', sntM[r.sntId]?.kamar || '-', r.capaian || r.nilai || '-', r.status || '-', r.guru || '-', r.catatan || '', ev.tanggal || r.tanggal || '', ev.nama || r.evaluationNama || '-', pg.nama || r.programNama || '-'];
    });
  }
  const akdHeaders = ['No', 'Santri', 'NIS', 'Kamar', 'Nilai/Capaian', 'Status', 'Evaluator', 'Catatan', 'Tanggal', 'Evaluasi', 'Program'];

  M.exportEvaluation = async function (evaluationId) {
    const [evaluation, evaluations, programs, records, santri] = await Promise.all([DB.g('academicEvaluations', evaluationId), DB.ga('academicEvaluations'), DB.ga('academicPrograms'), DB.ga('academicRecords'), DB.ga('santri')]);
    if (!evaluation) return;
    const program = programs.find(p => p.id === evaluation.programId);
    downloadXlsx(`Pesantrenku-evaluasi-${evaluation.nama || 'akademik'}.xlsx`, [{
      name: evaluation.nama || 'Evaluasi',
      title: `Laporan Evaluasi ${evaluation.nama || '-'}`,
      meta: `Program: ${program?.nama || '-'} | Tanggal: ${evaluation.tanggal || '-'} | Penanggung jawab: ${evaluation.penanggungJawab || '-'}`,
      headers: akdHeaders,
      rows: akdRows(records.filter(r => r.evaluationId === evaluationId), santri, evaluations, programs)
    }]);
  };
  M.exportProgram = async function (programId) {
    const [program, evaluations, records, santri] = await Promise.all([DB.g('academicPrograms', programId), DB.ga('academicEvaluations'), DB.ga('academicRecords'), DB.ga('santri')]);
    const sheets = evaluations.filter(e => !e.deleted && e.programId === programId).sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || '')).map(e => ({
      name: e.nama || 'Evaluasi',
      title: `Laporan Program ${program?.nama || '-'} - ${e.nama || '-'}`,
      meta: `Tanggal: ${e.tanggal || '-'} | Penanggung jawab: ${e.penanggungJawab || '-'} | Evaluator: ${(e.evaluatorNames || []).join(', ') || '-'}`,
      headers: akdHeaders,
      rows: akdRows(records.filter(r => r.evaluationId === e.id), santri, evaluations, [program].filter(Boolean))
    }));
    if (!sheets.length) { T('Belum ada evaluasi untuk diexport.'); return; }
    downloadXlsx(`Pesantrenku-program-${program?.nama || 'akademik'}.xlsx`, sheets);
  };
  M.exportKeu = async function () {
    const [bills, payments, santri] = await Promise.all([DB.ga('financeBills'), DB.ga('financePayments'), DB.ga('santri')]);
    const sntM = mapBy(santri, 'id');
    const paid = {};
    payments.filter(p => !p.deleted).forEach(p => { paid[p.billId] = (paid[p.billId] || 0) + Number(p.jumlah || 0); });
    downloadXlsx('Pesantrenku-keuangan.xlsx', [
      { name: 'Tagihan', title: 'Laporan Tagihan Pesantrenku', meta: `Diexport: ${new Date().toLocaleString('id-ID')}`, headers: ['No', 'Periode', 'Santri', 'NIS', 'Jenis', 'Tagihan', 'Terbayar', 'Sisa', 'Jatuh Tempo', 'Catatan'], rows: bills.filter(b => !b.deleted).map((b, i) => [i + 1, b.periode || '-', sntM[b.sntId]?.nama || '-', sntM[b.sntId]?.nis || '-', b.jenis || '-', Number(b.jumlah || 0), Number(paid[b.id] || 0), Number(b.jumlah || 0) - Number(paid[b.id] || 0), b.jatuhTempo || '-', b.catatan || '']) },
      { name: 'Pembayaran', title: 'Laporan Pembayaran Pesantrenku', meta: `Diexport: ${new Date().toLocaleString('id-ID')}`, headers: ['No', 'Tanggal', 'Santri', 'NIS', 'Tagihan', 'Periode', 'Jumlah', 'Metode', 'Bukti'], rows: payments.filter(p => !p.deleted).map((p, i) => { const b = bills.find(x => x.id === p.billId) || {}; return [i + 1, p.tanggal || '-', sntM[p.sntId]?.nama || '-', sntM[p.sntId]?.nis || '-', b.jenis || '-', b.periode || '-', Number(p.jumlah || 0), p.metode || '-', p.buktiPembayaran || '-']; }) }
    ]);
  };

  const prevToggleFilter = App._togFilter?.bind(App);
  App._togFilter = function (id) {
    if (prevToggleFilter) prevToggleFilter(id);
    const el = document.getElementById(id);
    if (id === 'snt-km-fwrap' && el) S._sntKmOpen = el.classList.contains('on');
    if (id === 'phase5-snt-filter' && el) S.phase5SntFilterOpen = el.classList.contains('on');
  };

  function readSantriFilters() {
    S.phase5SntFilters = {
      kelas: document.getElementById('phase5-snt-kelas')?.value || S.phase5SntFilters?.kelas || '',
      diniah: document.getElementById('phase5-snt-diniah')?.value || S.phase5SntFilters?.diniah || '',
      komplek: document.getElementById('phase5-snt-komplek')?.value || S.phase5SntFilters?.komplek || ''
    };
    return S.phase5SntFilters;
  }
  function optionHtml(values, selected, empty) {
    return `<option value="">${empty}</option>${values.filter(Boolean).sort().map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
  }
  async function decorateSantri() {
    const body = document.getElementById('snt-body');
    if (!body) return;
    const [santri, rooms] = await Promise.all([DB.ga('santri'), DB.ga('kamar')]);
    const sntM = mapBy(santri, 'id');
    const roomM = Object.fromEntries(rooms.map(r => [r.nama, r.komplek || '']));
    document.querySelectorAll('#snt-list-items [data-sntrow]').forEach(row => {
      const s = sntM[row.id.replace('sntrow-', '')] || {};
      row.dataset.kelas = s.kelas || '';
      row.dataset.diniah = s.kelasDiniah || '';
      row.dataset.komplek = s.komplek || roomM[s.kamar] || '';
      row.dataset.nis = s.nis || '';
    });
    const inactive = document.getElementById('phase3-inactive-card');
    const firstPanel = body.querySelector(':scope > div[style*="padding"]');
    const statusGrid = firstPanel?.querySelector('div[style*="grid-template-columns:1fr 1fr"]');
    if (inactive && statusGrid && !statusGrid.contains(inactive)) {
      statusGrid.appendChild(inactive);
      statusGrid.classList.add('phase5-snt-status-grid');
    }
    const state = readSantriFilters();
    const oldFilters = body.querySelector('.phase3-snt-filters');
    if (oldFilters && !document.getElementById('phase5-snt-filter')) {
      oldFilters.outerHTML = `<div class="fwrap phase5-snt-filter ${S.phase5SntFilterOpen ? 'on' : ''}" id="phase5-snt-filter"><div class="fwrap-h" onclick="App._togFilter('phase5-snt-filter')"><div class="fwrap-h-lb">Filter Lanjutan</div><span class="fwrap-h-ic">▾</span></div><div class="fwrap-b"><div class="phase5-snt-filter-grid"><label><span>Kelas Sekolah</span><select id="phase5-snt-kelas" onchange="PesantrenkuPhase5.filterSantriChanged()">${optionHtml([...new Set(santri.map(s => s.kelas))], state.kelas, 'Semua')}</select></label><label><span>Kelas Diniyah</span><select id="phase5-snt-diniah" onchange="PesantrenkuPhase5.filterSantriChanged()">${optionHtml([...new Set(santri.map(s => s.kelasDiniah))], state.diniah, 'Semua')}</select></label><label><span>Asrama / Komplek</span><select id="phase5-snt-komplek" onchange="PesantrenkuPhase5.filterSantriChanged()">${optionHtml([...new Set(rooms.map(r => r.komplek))], state.komplek, 'Semua')}</select></label></div></div></div>`;
    }
    window.PesantrenkuPhase5.filterSantri();
  }

  const prevRenderSnt = App.renderSnt.bind(App);
  App.renderSnt = async function (...args) {
    const search = document.getElementById('snt-search')?.value || S.phase5SntSearch || '';
    readSantriFilters();
    await prevRenderSnt(...args);
    const input = document.getElementById('snt-search');
    if (input) input.value = search;
    S.phase5SntSearch = search;
    await decorateSantri();
  };
  window.PesantrenkuPhase5 = {
    filterSantriChanged() { readSantriFilters(); this.filterSantri(); },
    filterSantri() {
      const input = document.getElementById('snt-search');
      const q = norm(input?.value || '');
      S.phase5SntSearch = input?.value || '';
      const state = readSantriFilters();
      let visible = 0;
      document.querySelectorAll('#snt-list-items [data-sntrow]').forEach(row => {
        const hay = norm(`${row.dataset.nama || ''} ${row.dataset.kamar || ''} ${row.dataset.nis || ''}`);
        const show = (!q || hay.includes(q)) && (!state.kelas || row.dataset.kelas === state.kelas) && (!state.diniah || row.dataset.diniah === state.diniah) && (!state.komplek || row.dataset.komplek === state.komplek);
        row.style.display = show ? 'flex' : 'none';
        if (show) visible++;
      });
      const empty = document.getElementById('snt-empty');
      if (empty) empty.style.display = visible ? 'none' : 'block';
    }
  };
  App._filterSntList = () => window.PesantrenkuPhase5.filterSantri();

  const prevRenderPel = App.renderPel.bind(App);
  App.renderPel = async function (...args) {
    await prevRenderPel(...args);
    const bulk = document.getElementById('phase3-pel-bulk');
    const body = document.getElementById('pel-body');
    if (bulk && body) { bulk.classList.add('phase5-pel-bulk'); body.appendChild(bulk); }
    document.querySelectorAll('[data-phase3-pel]').forEach(input => {
      const card = input.closest('[id^="pel-"]');
      if (card) card.classList.toggle('phase5-pel-selected', input.checked);
      const label = input.closest('.phase3-pel-check');
      if (label) label.title = 'Pilih pelanggaran';
    });
  };
  const prevTogglePel = window.PesantrenkuPhase3?.togglePel?.bind(window.PesantrenkuPhase3);
  if (prevTogglePel) {
    window.PesantrenkuPhase3.togglePel = function (id, checked) {
      prevTogglePel(id, checked);
      document.getElementById(`pel-${id}`)?.classList.toggle('phase5-pel-selected', checked);
    };
  }

  const prevRenderQR = M.renderQR?.bind(M);
  M.renderQR = async function () {
    const body = document.getElementById('qr-body');
    if (body?.dataset.phase5Mounted === '1') {
      QRAbsensi.renderLog?.();
      setTimeout(() => QRAbsensi.start?.(), 250);
      return;
    }
    if (prevRenderQR) await prevRenderQR();
    const mounted = document.getElementById('qr-body');
    if (mounted) {
      mounted.dataset.phase5Mounted = '1';
      mounted.classList.add('phase5-qr-page');
      const first = mounted.querySelector('.module-actions button');
      if (first) first.textContent = 'Kamera Aktif';
    }
    setTimeout(() => QRAbsensi.start?.(), 250);
  };
  App.renderQR = () => M.renderQR();
  if (window.QRAbsensi) {
    const QR = window.QRAbsensi;
    const prevStart = QR.start.bind(QR);
    const prevStop = QR.stop.bind(QR);
    QR.start = async function () {
      if (this._running && document.getElementById('qr-reader')) return;
      await prevStart();
      this._running = Boolean(this._scanner);
    };
    QR.stop = async function () { await prevStop(); this._running = false; };
  }

  const style = document.createElement('style');
  style.textContent = `
    .phase5-snt-status-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    .phase5-snt-status-grid>div,.phase5-snt-status-grid>.phase3-inactive-card{min-height:64px;margin:0!important;padding:11px 8px!important;text-align:center;justify-content:center;flex-direction:column;border-radius:var(--r3)!important}
    .phase5-snt-status-grid>.phase3-inactive-card{border-color:rgba(100,116,139,.24)!important}
    .phase5-snt-status-grid>.phase3-inactive-card strong{font-size:20px!important;line-height:1;color:#64748b!important}
    .phase5-snt-status-grid>.phase3-inactive-card span{font-size:9px!important;color:var(--t3);font-weight:700;line-height:1.25}
    .phase5-snt-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .phase5-snt-filter-grid label{display:flex;flex-direction:column;gap:5px;min-width:0}
    .phase5-snt-filter-grid span{font-size:9px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:0}
    .phase5-snt-filter-grid select{width:100%;min-width:0;padding:9px 10px;border:1.5px solid var(--dv);border-radius:var(--r2);background:var(--inp);color:var(--t1);font-size:12px;font-weight:700;outline:none}
    .phase5-snt-filter-grid select:focus{border-color:rgba(13,181,127,.42);box-shadow:0 0 0 3px rgba(13,181,127,.08)}
    .phase5-pel-bulk{position:sticky;bottom:76px;z-index:20;margin:12px 15px 6px!important;padding:9px 10px!important;background:var(--su)!important;border-color:var(--sub)!important;backdrop-filter:blur(22px)}
    .phase3-pel-check{left:10px!important;right:auto!important;top:50%!important;bottom:auto!important;transform:translateY(-50%);width:28px;height:28px;justify-content:center;border:1.5px solid var(--dv);border-radius:50%;background:var(--su);box-shadow:var(--shadow-sm)}
    .phase3-pel-check span{display:none}.phase3-pel-check input{width:15px;height:15px;accent-color:var(--a1)}
    /* Phase8 FIX: only apply left padding to actual pelanggaran ITEM cards */
    [id^="pel-"]:not(#pel-body):not(#pel-search-inp):not(#pel-fwrap):not(input):not(select){padding-left:48px!important}
    [id^="pel-"]:not(#pel-body):not(#pel-search-inp):not(#pel-fwrap):not(input):not(select).phase5-pel-selected{border-color:rgba(13,181,127,.42)!important;box-shadow:inset 0 0 0 1px rgba(13,181,127,.12),var(--shadow-sm)!important;background:var(--gs)!important}
    .phase5-qr-page .qr-box{border-radius:var(--r4);box-shadow:var(--shadow-sm)}.phase5-qr-page #qr-reader{min-height:320px}
    @media(max-width:520px){.phase5-snt-status-grid{gap:6px!important}.phase5-snt-status-grid>div,.phase5-snt-status-grid>.phase3-inactive-card{min-height:58px!important;padding:9px 6px!important}.phase5-snt-filter-grid{grid-template-columns:1fr;gap:7px}.phase5-pel-bulk{bottom:72px;margin-left:12px!important;margin-right:12px!important}[id^="pel-"]:not(#pel-body):not(#pel-search-inp):not(#pel-fwrap):not(input):not(select){padding-left:44px!important}}
  `;
  document.head.appendChild(style);
})();

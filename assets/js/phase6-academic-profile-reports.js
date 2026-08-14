'use strict';
/* Phase 6: academic criteria, profile restructuring, quick notes, and reporting integration. */
(function () {
  const App = window.App;
  const DB = window.DB;
  const M = window.PesantrenkuModules;
  if (!App || !DB || !M) return;

  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = value => String(value || '').toLowerCase().trim();
  const rupiah = value => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
  const academicFormats = {
    abcde: ['A', 'B', 'C', 'D', 'E'],
    skala9: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    nilai100: null
  };
  const defaultCriteria = [{ id: 'utama', nama: 'Nilai Utama' }];

  const parseCriteriaInput = () => [...document.querySelectorAll('.phase6-criteria-input')]
    .map((input, index) => ({ id: input.dataset.id || `k${Date.now()}_${index}`, nama: input.value.trim() }))
    .filter(item => item.nama);

  const formatLabel = format => ({ abcde: 'ABCDE', skala9: '1-9', nilai100: '1-100' }[format] || '1-100');
  const valueControl = (format, id, value = '') => {
    if (format === 'nilai100') return `<input class="fi phase6-score-input" data-kriteria="${esc(id)}" type="number" min="0" max="100" inputmode="numeric" value="${esc(value)}" placeholder="0-100">`;
    return `<select class="fsel phase6-score-input" data-kriteria="${esc(id)}"><option value="">-</option>${(academicFormats[format] || academicFormats.abcde).map(v => `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  };
  const scoreSummary = (criteria, scores) => criteria.map(k => `${k.nama}: ${scores?.[k.id] || '-'}`).join(', ');

  function uploadFiles({ accept = 'image/*', capture = '', multiple = false, onDone }) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    input.onchange = () => onDone([...input.files]).finally(() => input.remove());
    document.body.appendChild(input);
    input.click();
  }

  M.addEvaluationCriterion = function (value = '') {
    const list = document.getElementById('phase6-criteria-list');
    if (!list) return;
    const id = `k${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    list.insertAdjacentHTML('beforeend', `<div class="phase6-criteria-row"><input class="fi phase6-criteria-input" data-id="${id}" value="${esc(value)}" placeholder="Nama kriteria"><button type="button" class="phase6-round" onclick="this.closest('.phase6-criteria-row').remove()" title="Hapus kriteria">×</button></div>`);
  };
  M.evalDocUpload = function () {
    uploadFiles({
      multiple: true,
      onDone: async files => {
        const current = S.phase6EvalDocs || [];
        const slots = Math.max(0, 4 - current.length);
        if (!slots) { T('Maksimal 4 foto dokumentasi.'); return; }
        T('Mengunggah dokumentasi evaluasi...');
        for (const file of files.slice(0, slots)) current.push(await App._uploadPhoto(file, 'evaluasi', S.akdEvalId || 'baru', 1200, 0.86));
        S.phase6EvalDocs = current;
        this.renderEvalDocPreview();
      }
    });
  };
  M.removeEvalDoc = function (idx) {
    S.phase6EvalDocs = (S.phase6EvalDocs || []).filter((_, i) => i !== idx);
    this.renderEvalDocPreview();
  };
  M.renderEvalDocPreview = function () {
    const el = document.getElementById('phase6-eval-docs');
    if (!el) return;
    const docs = S.phase6EvalDocs || [];
    el.innerHTML = docs.map((src, i) => `<div class="phase6-doc-thumb"><img src="${src}" alt="Dokumentasi evaluasi"><button onclick="PesantrenkuModules.removeEvalDoc(${i})">×</button></div>`).join('') || '<div class="phase6-muted">Belum ada dokumentasi.</div>';
  };

  const prevEvalForm = M.evalForm?.bind(M);
  M.evalForm = async function (id, programId) {
    const [ev, santri, users] = await Promise.all([id ? DB.g('academicEvaluations', id) : Promise.resolve({}), DB.ga('santri'), DB.ga('users').catch(() => [])]);
    if (!prevEvalForm) return;
    const memberSet = new Set(ev?.memberIds || []);
    const evaluatorSet = new Set(ev?.evaluatorIds || []);
    const active = santri.filter(s => s.aktif !== false && !s.deleted).sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    const pengurus = users.filter(u => !u.deleted).sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    const evaluatorHtml = pengurus.map(u => `<label data-search="${esc(u.nama || '')}" class="phase6-check-row"><input type="checkbox" class="ev-evaluator" value="${u.id}" data-nama="${esc(u.nama || '')}" ${evaluatorSet.has(u.id) || (!id && u.id === S.user?.id) ? 'checked' : ''}><span>${esc(u.nama || '-')}</span></label>`).join('') || '<div class="phase6-muted">Belum ada data pengurus.</div>';
    const memberHtml = active.map(sn => `<label data-search="${esc(`${sn.nama || ''} ${sn.nis || ''} ${sn.kamar || ''}`)}" class="phase6-check-row"><input type="checkbox" class="ev-member" value="${sn.id}" ${memberSet.has(sn.id) ? 'checked' : ''}><span><strong>${esc(sn.nama || '-')}</strong><small>NIS ${esc(sn.nis || '-')} · Kamar ${esc(sn.kamar || '-')}</small></span></label>`).join('');
    const criteria = ev?.criteria?.length ? ev.criteria : defaultCriteria;
    S.phase6EvalDocs = [...(ev?.dokumentasi || [])].slice(0, 4);
    OS(`<div class="sh">${id ? 'Edit' : 'Daftarkan'} Evaluasi</div><div class="sb phase6-sheet"><div class="fg"><label class="fl">Nama/Jenis Evaluasi</label><input class="fi" id="ev-nama" value="${esc(ev?.nama || 'Evaluasi ' + _todayLocal().slice(0, 7))}"></div><div class="phase6-two"><div class="fg"><label class="fl">Tanggal</label><input class="fi" id="ev-tgl" type="date" value="${esc(ev?.tanggal || _todayLocal())}"></div><div class="fg"><label class="fl">Format Nilai</label><select class="fsel" id="ev-format"><option value="abcde" ${ev?.nilaiFormat === 'abcde' ? 'selected' : ''}>ABCDE</option><option value="skala9" ${ev?.nilaiFormat === 'skala9' ? 'selected' : ''}>1-9</option><option value="nilai100" ${!ev?.nilaiFormat || ev?.nilaiFormat === 'nilai100' ? 'selected' : ''}>1-100</option></select></div></div><div class="fg"><label class="fl">Penanggung Jawab</label><input class="fi" id="ev-pj" value="${esc(ev?.penanggungJawab || S.user?.nama || '')}"></div><div class="fg"><label class="fl">Kriteria Penilaian</label><div id="phase6-criteria-list">${criteria.map(c => `<div class="phase6-criteria-row"><input class="fi phase6-criteria-input" data-id="${esc(c.id)}" value="${esc(c.nama)}" placeholder="Nama kriteria"><button type="button" class="phase6-round" onclick="this.closest('.phase6-criteria-row').remove()" title="Hapus kriteria">×</button></div>`).join('')}</div><button type="button" class="mini-btn phase6-mini" onclick="PesantrenkuModules.addEvaluationCriterion()">+ Kriteria</button></div><div class="fg"><label class="fl">Dokumentasi Evaluasi (maks. 4 foto)</label><div id="phase6-eval-docs" class="phase6-doc-grid"></div><button type="button" class="mini-btn phase6-mini" onclick="PesantrenkuModules.evalDocUpload()">Tambah Foto</button></div><div class="fg"><label class="fl">Cari Evaluator</label><input class="fi" id="ev-eval-q" placeholder="Cari pengurus/guru..." oninput="PesantrenkuModules._filterList('ev-eval-q','ev-evaluator-list')"></div><div id="ev-evaluator-list" class="phase6-check-list">${evaluatorHtml}</div><div class="fg"><label class="fl">Evaluator Tambahan</label><input class="fi" id="ev-extra" value="${esc((ev?.evaluatorExtra || []).join(', '))}" placeholder="Nama guru tambahan, pisahkan koma"></div><div class="fg"><label class="fl">Cari Anggota Evaluasi</label><input class="fi" id="ev-member-q" placeholder="Cari santri, NIS, kamar..." oninput="PesantrenkuModules._filterList('ev-member-q','ev-member-list')"></div><div id="ev-member-list" class="phase6-check-list tall">${memberHtml}</div><div class="fg"><label class="fl">Catatan Evaluasi</label><textarea class="fi" id="ev-cat" style="height:80px;resize:none">${esc(ev?.catatan || '')}</textarea></div><button class="bg2 bw" onclick="PesantrenkuModules.saveEval('${id || ''}','${programId}')">Simpan Evaluasi</button></div>`);
    this.renderEvalDocPreview();
  };

  M.saveEval = async function (id, programId) {
    const nama = document.getElementById('ev-nama')?.value.trim();
    if (!nama) { T('Nama evaluasi wajib diisi.'); return; }
    const criteria = parseCriteriaInput();
    if (!criteria.length) { T('Isi minimal satu kriteria penilaian.'); return; }
    const old = id ? await DB.g('academicEvaluations', id) : null;
    const extra = (document.getElementById('ev-extra')?.value || '').split(',').map(x => x.trim()).filter(Boolean);
    const newId = id || uid();
    const now = Date.now();
    await DB.p('academicEvaluations', {
      id: newId,
      programId,
      nama,
      tanggal: document.getElementById('ev-tgl')?.value || _todayLocal(),
      penanggungJawab: document.getElementById('ev-pj')?.value.trim(),
      evaluatorIds: this._checkedValues('ev-evaluator'),
      evaluatorNames: [...this._checkedNames('ev-evaluator'), ...extra],
      evaluatorExtra: extra,
      memberIds: this._checkedValues('ev-member'),
      criteria,
      nilaiFormat: document.getElementById('ev-format')?.value || 'nilai100',
      dokumentasi: (S.phase6EvalDocs || []).slice(0, 4),
      catatan: document.getElementById('ev-cat')?.value.trim(),
      createdAt: old?.createdAt || now,
      updatedAt: now,
      oleh: S.user?.nama || '-'
    });
    S.phase6EvalDocs = [];
    CS(); T('Evaluasi disimpan.'); S.akdProgramId = programId; S.akdEvalId = newId; await this.renderAkademik();
  };

  M.akdForm = async function (id, evaluationId, sntId) {
    const [record, ev, programs, santri] = await Promise.all([id ? DB.g('academicRecords', id) : Promise.resolve({}), DB.g('academicEvaluations', evaluationId), DB.ga('academicPrograms'), DB.ga('santri')]);
    if (!ev) { T('Pilih evaluasi dulu.'); return; }
    const prog = programs.find(p => p.id === ev.programId) || {};
    const selectedId = sntId || record?.sntId || '';
    const criteria = ev.criteria?.length ? ev.criteria : defaultCriteria;
    const format = ev.nilaiFormat || 'nilai100';
    const opts = santri.filter(sn => sn.aktif !== false && !sn.deleted).sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id')).map(sn => `<option value="${sn.id}" ${selectedId === sn.id ? 'selected' : ''}>${esc(sn.nama || '-')} · NIS ${esc(sn.nis || '-')} · Kamar ${esc(sn.kamar || '-')}</option>`).join('');
    const evOpts = (ev.evaluatorNames?.length ? ev.evaluatorNames : [S.user?.nama || '-']).map(n => `<option ${record?.guru === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const scores = record?.nilaiKriteria || {};
    OS(`<div class="sh">${id ? 'Edit' : 'Tambah'} Catatan Akademik</div><div class="sb phase6-sheet"><div class="phase6-context"><strong>${esc(prog.nama || '-')}</strong><span>${esc(ev.nama || '-')} · ${esc(ev.tanggal || '-')}</span></div><div class="phase6-inline-info"><span>Kriteria: ${criteria.length}</span><span>Format: ${formatLabel(format)}</span></div><div class="fg"><label class="fl">Cari Santri</label><input class="fi" id="akd-snt-q" placeholder="Cari nama/NIS/kamar..." oninput="PesantrenkuModules._filterSelect('akd-snt-q','akd-snt')"></div><div class="fg"><label class="fl">Santri</label><select class="fsel" id="akd-snt">${opts}</select><small class="phase6-muted">Bisa memilih santri di luar anggota awal evaluasi.</small></div><div class="fg"><label class="fl">Evaluator/Guru</label><select class="fsel" id="akd-guru">${evOpts}</select></div><div class="fg"><label class="fl">Nilai Per Kriteria</label><div class="phase6-score-grid">${criteria.map(k => `<label><span>${esc(k.nama)}</span>${valueControl(format, k.id, scores[k.id])}</label>`).join('')}</div></div><div class="fg"><label class="fl">Status</label><select class="fsel" id="akd-status"><option ${record?.status === 'selesai' ? 'selected' : ''} value="selesai">Selesai</option><option ${record?.status === 'proses' ? 'selected' : ''} value="proses">Proses</option><option ${record?.status === 'perlu_bimbingan' ? 'selected' : ''} value="perlu_bimbingan">Perlu bimbingan</option></select></div><div class="fg"><label class="fl">Catatan</label><textarea class="fi" id="akd-cat" style="height:90px;resize:none">${esc(record?.catatan || '')}</textarea></div><button class="bg2 bw" onclick="PesantrenkuModules.saveAkd('${id || ''}','${ev.id}')">Simpan Catatan</button>${id ? `<button class="phase3-danger-btn" onclick="PesantrenkuModules.delAkd('${id}')">Hapus Catatan</button>` : ''}</div>`);
  };

  M.saveAkd = async function (id, evaluationId) {
    const [old, ev, programs, santri] = await Promise.all([id ? DB.g('academicRecords', id) : Promise.resolve(null), DB.g('academicEvaluations', evaluationId), DB.ga('academicPrograms'), DB.ga('santri')]);
    if (!ev) { T('Evaluasi tidak ditemukan.'); return; }
    const sntId = document.getElementById('akd-snt')?.value;
    if (!sntId) { T('Pilih santri.'); return; }
    const criteria = ev.criteria?.length ? ev.criteria : defaultCriteria;
    const nilaiKriteria = {};
    document.querySelectorAll('.phase6-score-input').forEach(input => { nilaiKriteria[input.dataset.kriteria] = input.value; });
    const capaian = scoreSummary(criteria, nilaiKriteria);
    const existing = (await DB.ga('academicRecords')).find(r => !r.deleted && r.evaluationId === evaluationId && r.sntId === sntId && r.id !== id);
    const recId = id || existing?.id || uid();
    const now = Date.now();
    const program = programs.find(p => p.id === ev.programId) || {};
    const payload = {
      id: recId,
      programId: ev.programId,
      programNama: program.nama || '-',
      evaluationId,
      evaluationNama: ev.nama || '-',
      sntId,
      tanggal: ev.tanggal || _todayLocal(),
      criteria,
      nilaiFormat: ev.nilaiFormat || 'nilai100',
      nilaiKriteria,
      capaian,
      nilai: capaian,
      status: document.getElementById('akd-status')?.value || 'selesai',
      guru: document.getElementById('akd-guru')?.value || '-',
      catatan: document.getElementById('akd-cat')?.value.trim() || '',
      createdAt: (old || existing)?.createdAt || now,
      updatedAt: now,
      oleh: S.user?.nama || '-'
    };
    await DB.p('academicRecords', payload);
    if (!ev.memberIds?.includes(sntId)) {
      ev.memberIds = [...(ev.memberIds || []), sntId];
      ev.updatedAt = now;
      await DB.p('academicEvaluations', ev);
    }
    const sn = santri.find(s => s.id === sntId);
    await DB.p('catatanSantri', { id: `akd_note_${recId}`, sntId, tipe: 'akademik', sumber: 'academicRecords', sourceAcademicId: recId, isi: `${program.nama || 'Akademik'} · ${ev.nama || 'Evaluasi'} · ${capaian}${payload.catatan ? `\n${payload.catatan}` : ''}`, programAkademik: program.nama || '-', evaluasiAkademik: ev.nama || '-', nilaiAkademik: capaian, guru: payload.guru, tanggal: payload.tanggal, createdAt: payload.createdAt, updatedAt: now, oleh: S.user?.nama || '-', namaSantri: sn?.nama || '' });
    CS(); T('Catatan akademik disimpan.'); S.akdEvalId = evaluationId; await this.renderAkademik();
  };

  function akdExportRows(records, santri, ev, program) {
    const sntM = mapBy(santri, 'id');
    const criteria = ev.criteria?.length ? ev.criteria : defaultCriteria;
    const headers = ['No', 'Santri', 'NIS', 'Kamar', ...criteria.map(k => k.nama), 'Status', 'Evaluator', 'Catatan'];
    const rows = records.filter(r => !r.deleted).map((r, i) => [i + 1, sntM[r.sntId]?.nama || '-', sntM[r.sntId]?.nis || '-', sntM[r.sntId]?.kamar || '-', ...criteria.map(k => r.nilaiKriteria?.[k.id] || ''), r.status || '-', r.guru || '-', r.catatan || '']);
    return { headers, rows, title: `Laporan ${program?.nama || 'Akademik'} - ${ev.nama || '-'}`, meta: `Tanggal: ${ev.tanggal || '-'} | Format: ${formatLabel(ev.nilaiFormat)} | PJ: ${ev.penanggungJawab || '-'} | Dokumentasi: ${(ev.dokumentasi || []).length} foto` };
  }
  M.exportEvaluation = async function (evaluationId) {
    const [ev, programs, records, santri] = await Promise.all([DB.g('academicEvaluations', evaluationId), DB.ga('academicPrograms'), DB.ga('academicRecords'), DB.ga('santri')]);
    if (!ev) return;
    const program = programs.find(p => p.id === ev.programId);
    const data = akdExportRows(records.filter(r => r.evaluationId === evaluationId), santri, ev, program);
    window.PesantrenkuXlsx.downloadXlsx(`Pesantrenku-evaluasi-${ev.nama || 'akademik'}.xlsx`, [{ name: ev.nama || 'Evaluasi', ...data }]);
  };
  M.exportProgram = async function (programId) {
    const [program, evaluations, records, santri] = await Promise.all([DB.g('academicPrograms', programId), DB.ga('academicEvaluations'), DB.ga('academicRecords'), DB.ga('santri')]);
    const sheets = evaluations.filter(e => !e.deleted && e.programId === programId).map(ev => ({ name: ev.nama || 'Evaluasi', ...akdExportRows(records.filter(r => r.evaluationId === ev.id), santri, ev, program) }));
    if (!sheets.length) { T('Belum ada evaluasi untuk diexport.'); return; }
    window.PesantrenkuXlsx.downloadXlsx(`Pesantrenku-program-${program?.nama || 'akademik'}.xlsx`, sheets);
  };

  const prevPayForm = M.payForm?.bind(M);
  M.payForm = async function (billId) {
    if (prevPayForm) await prevPayForm(billId);
    const proofWrap = document.querySelector('#pay-proof')?.closest('.fg');
    if (proofWrap) {
      proofWrap.innerHTML = `<label class="fl">Bukti Pembayaran</label><div class="phase6-upload-split"><button type="button" onclick="PesantrenkuModules.pickPaymentProof('camera')">Kamera</button><button type="button" onclick="PesantrenkuModules.pickPaymentProof('file')">Galeri / File</button></div><input type="file" id="pay-proof" accept="image/*" style="display:none" onchange="PesantrenkuModules.previewPaymentProof(this)"><img id="pay-proof-preview" class="phase3-proof" alt="Pratinjau bukti pembayaran">`;
    }
  };
  M.pickPaymentProof = function (mode) {
    const input = document.getElementById('pay-proof');
    if (!input) return;
    input.value = '';
    if (mode === 'camera') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  };

  const prevRenderProfile = App.renderProfil.bind(App);
  App.renderProfil = async function (sntId) {
    await prevRenderProfile(sntId);
    await window.PesantrenkuPhase6.restructureProfile(sntId);
  };

  const prevSavePelManual = App._savePelManual?.bind(App);
  if (prevSavePelManual) {
    App._savePelManual = async function () {
      const selected = [...(S._pelSelSnt || [])];
      const desk = document.getElementById('pel-desk')?.value.trim() || '';
      const tgl = document.getElementById('pel-tgl')?.value || _todayLocal();
      await prevSavePelManual();
      if (desk && selected.length) {
        const now = Date.now();
        for (const sntId of selected) await DB.p('catatanSantri', { id: `pel_manual_note_${now}_${sntId}`, sntId, tipe: 'pelanggaran', sumber: 'pelanggaranManual', isi: desk, tanggal: tgl, createdAt: now, updatedAt: now, oleh: S.user?.nama || '-' });
      }
    };
  }

  const prevRenderDash = App._renderDash?.bind(App);
  if (prevRenderDash) {
    App._renderDash = async function (...args) {
      await prevRenderDash(...args);
      window.PesantrenkuPhase6.decorateDashboard();
    };
  }
  const prevRenderAbs = App.renderAbs.bind(App);
  App.renderAbs = async function (...args) {
    await prevRenderAbs(...args);
    window.PesantrenkuPhase6.decorateAbsShare();
  };

  window.PesantrenkuPhase6 = {
    async restructureProfile(sntId) {
      const bar = document.querySelector('#profil-body .tab-bar');
      if (!bar) return;
      if (S._profilTab === 'sakit' || S._profilTab === 'uzur' || S._profilTab === 'timeline') S._profilTab = S._profilTab === 'timeline' ? 'rekap' : 'izin';
      const buttons = [...bar.querySelectorAll('.tab-btn')];
      buttons.forEach(btn => {
        const on = btn.getAttribute('onclick') || '';
        if (on.includes("'sakit'") || on.includes("'uzur'") || on.includes("'timeline'")) btn.remove();
        if (on.includes("'izin'")) btn.textContent = 'Status';
      });
      if (!document.getElementById('tab-akademik')) {
        bar.insertAdjacentHTML('beforeend', `<button class="tab-btn${S._profilTab === 'akademik' ? ' on' : ''}" onclick="App._profilTab('akademik','${sntId}')">Akademik</button><button class="tab-btn${S._profilTab === 'keuangan' ? ' on' : ''}" onclick="App._profilTab('keuangan','${sntId}')">Keuangan</button>`);
        bar.insertAdjacentHTML('afterend', `<div class="tab-pane${S._profilTab === 'akademik' ? ' on' : ''}" id="tab-akademik"></div><div class="tab-pane${S._profilTab === 'keuangan' ? ' on' : ''}" id="tab-keuangan"></div>`);
      }
      const izin = document.getElementById('tab-izin');
      const sakit = document.getElementById('tab-sakit');
      const uzur = document.getElementById('tab-uzur');
      if (izin && sakit && uzur) {
        izin.innerHTML = `<div class="phase6-section-title">Izin</div>${izin.innerHTML}<div class="phase6-section-title">Sakit</div>${sakit.innerHTML}<div class="phase6-section-title">Uzur</div>${uzur.innerHTML}`;
        sakit.remove(); uzur.remove();
      }
      const timeline = document.getElementById('tab-timeline');
      const rekap = document.getElementById('tab-rekap');
      if (timeline && rekap && !document.getElementById('phase6-timeline-bottom')) {
        rekap.insertAdjacentHTML('beforeend', `<div id="phase6-timeline-bottom" class="phase6-profile-block"><div class="phase6-section-title">Timeline Santri</div>${timeline.innerHTML}</div>`);
        timeline.remove();
      }
      document.getElementById('phase3-profile-academic')?.remove();
      document.getElementById('phase4-finance-profile')?.remove();
      await this.renderProfileAcademic(sntId);
      await this.renderProfileFinance(sntId);
      App._profilTab(S._profilTab || 'identitas', sntId);
    },
    async renderProfileAcademic(sntId) {
      const target = document.getElementById('tab-akademik'); if (!target) return;
      const [records, evals, programs] = await Promise.all([DB.ga('academicRecords').catch(() => []), DB.ga('academicEvaluations').catch(() => []), DB.ga('academicPrograms').catch(() => [])]);
      const evM = mapBy(evals, 'id'); const pgM = mapBy(programs, 'id');
      const mine = records.filter(r => !r.deleted && r.sntId === sntId).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
      target.innerHTML = mine.length ? mine.map(r => {
        const ev = evM[r.evaluationId] || {}; const pg = pgM[r.programId] || {};
        const criteria = r.criteria?.length ? r.criteria : (ev.criteria?.length ? ev.criteria : defaultCriteria);
        return `<div class="phase6-profile-card"><div><strong>${esc(pg.nama || r.programNama || 'Akademik')}</strong><small>${esc(ev.nama || r.evaluationNama || '-')} · ${esc(r.tanggal || '-')}</small></div><div class="phase6-score-line">${criteria.map(k => `<span>${esc(k.nama)}: <b>${esc(r.nilaiKriteria?.[k.id] || '-')}</b></span>`).join('')}</div>${r.catatan ? `<p>${esc(r.catatan)}</p>` : ''}<div class="phase6-card-actions"><button onclick="PesantrenkuModules.akdForm('${r.id}','${r.evaluationId}','${r.sntId}')">Edit</button>${S._adminMode === true ? `<button class="danger" onclick="PesantrenkuPhase6.deleteAcademicRecord('${r.id}','${sntId}')">Hapus</button>` : ''}</div></div>`;
      }).join('') : '<div class="phase6-empty">Belum ada catatan akademik.</div>';
    },
    async deleteAcademicRecord(id, sntId) {
      if (!_needAdmin()) return;
      if (!confirm('Hapus catatan akademik ini?')) return;
      await DB.d('academicRecords', id);
      await DB.d('catatanSantri', `akd_note_${id}`);
      T('Catatan akademik dihapus.');
      await App.renderProfil(sntId);
    },
    async renderProfileFinance(sntId) {
      const target = document.getElementById('tab-keuangan'); if (!target) return;
      const [bills, payments] = await Promise.all([DB.ga('financeBills').catch(() => []), DB.ga('financePayments').catch(() => [])]);
      const paidByBill = {};
      payments.filter(p => !p.deleted).forEach(p => { paidByBill[p.billId] = (paidByBill[p.billId] || 0) + Number(p.jumlah || 0); });
      const mine = bills.filter(b => !b.deleted && b.sntId === sntId).sort((a, b) => (b.periode || '').localeCompare(a.periode || ''));
      const total = mine.reduce((n, b) => n + Number(b.jumlah || 0), 0);
      const paid = mine.reduce((n, b) => n + Number(paidByBill[b.id] || 0), 0);
      target.innerHTML = `<div class="phase6-finance-summary"><div><strong>${rupiah(total)}</strong><span>Total tagihan</span></div><div><strong>${rupiah(paid)}</strong><span>Terbayar</span></div><div><strong>${rupiah(Math.max(0, total - paid))}</strong><span>Sisa</span></div></div>${mine.length ? mine.map(b => { const p = paidByBill[b.id] || 0; return `<div class="phase6-profile-card"><div><strong>${esc(b.jenis || 'Tagihan')}</strong><small>${esc(b.periode || '-')} · Jatuh tempo ${esc(b.jatuhTempo || '-')}</small></div><div class="phase6-score-line"><span>Tagihan: <b>${rupiah(b.jumlah)}</b></span><span>Bayar: <b>${rupiah(p)}</b></span><span>Sisa: <b>${rupiah(Math.max(0, Number(b.jumlah || 0) - p))}</b></span></div></div>`; }).join('') : '<div class="phase6-empty">Belum ada data keuangan.</div>'}`;
    },
    decorateDashboard() {
      const quick = document.querySelector('.quick-row');
      if (!quick || document.getElementById('phase6-quick-note-btn')) return;
      quick.insertAdjacentHTML('beforeend', `<button id="phase6-quick-note-btn" class="quick-btn" onclick="PesantrenkuPhase6.quickNoteSheet()">+ Catatan</button>`);
    },
    async quickNoteSheet() {
      const santri = (await DB.ga('santri')).filter(s => s.aktif !== false && !s.deleted).sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
      OS(`<div class="sh">Tambah Catatan</div><div class="sb phase6-sheet"><div class="fg"><label class="fl">Jenis Catatan</label><select class="fsel" id="qnote-type" onchange="PesantrenkuPhase6.toggleQuickNoteType()"><option value="umum">Catatan Umum</option><option value="prestasi">Prestasi</option><option value="pelanggaran">Pelanggaran</option><option value="psikologis">Psikologis</option><option value="pel_manual">Pelanggaran Manual</option></select></div><div id="qnote-normal"><div class="fg"><label class="fl">Cari Santri</label><input class="fi" id="qnote-q" placeholder="Cari nama/NIS/kamar..." oninput="PesantrenkuModules._filterSelect('qnote-q','qnote-snt')"></div><div class="fg"><label class="fl">Santri</label><select class="fsel" id="qnote-snt">${santri.map(s => `<option value="${s.id}">${esc(s.nama)} · ${esc(s.nis || '-')} · ${esc(s.kamar || '-')}</option>`).join('')}</select></div><div class="fg"><label class="fl">Isi Catatan</label><textarea class="fi" id="qnote-isi" style="height:110px;resize:none"></textarea></div><button class="bg2 bw" onclick="PesantrenkuPhase6.saveQuickNote()">Simpan Catatan</button></div><div id="qnote-pel" style="display:none"><button class="bg2 bw" onclick="CS();App._addPelManual()">Buka Form Pelanggaran Manual</button></div></div>`);
    },
    toggleQuickNoteType() {
      const isPel = document.getElementById('qnote-type')?.value === 'pel_manual';
      document.getElementById('qnote-normal').style.display = isPel ? 'none' : '';
      document.getElementById('qnote-pel').style.display = isPel ? '' : 'none';
    },
    async saveQuickNote() {
      const tipe = document.getElementById('qnote-type')?.value || 'umum';
      const sntId = document.getElementById('qnote-snt')?.value;
      const isi = document.getElementById('qnote-isi')?.value.trim();
      if (!sntId || !isi) { T('Pilih santri dan isi catatan.'); return; }
      if (tipe === 'psikologis' && !_needAdmin()) return;
      await DB.p('catatanSantri', { id: uid(), sntId, tipe, isi, createdAt: Date.now(), updatedAt: Date.now(), oleh: S.user?.nama || '-' });
      CS(); T('Catatan disimpan.'); if (S.page === 'profil') await App.renderProfil(sntId);
    },
    decorateAbsShare() {
      const body = document.getElementById('abs-body');
      if (!body || !S._sesiId || !(S._skId)) return;
      if (document.getElementById('phase6-share-subabs')) return;
      body.insertAdjacentHTML('beforeend', `<button id="phase6-share-subabs" title="Share absensi sub-kegiatan" onclick="PesantrenkuPhase6.shareSubAbs('${S._sesiId}')">Share WA</button>`);
    },
    async shareSubAbs(sid) {
      const [sx, kg, sk, abs, santri] = await Promise.all([DB.g('sesi', sid), DB.ga('kegiatan'), DB.ga('subKeg'), DB.ga('absensi'), DB.ga('santri')]);
      if (!sx) return;
      const k = kg.find(x => x.id === sx.kgId) || {};
      const s = sk.find(x => x.id === sx.skId) || {};
      const sntM = mapBy(santri, 'id');
      const lb = { hadir: 'Hadir', alpha: 'Alpha', izin: 'Izin', sakit: 'Sakit', terlambat: 'Terlambat', uzur: 'Uzur' };
      const rows = abs.filter(a => a.sesiId === sid && a.status && a.status !== 'none');
      let txt = `LAPORAN ABSENSI SUB KEGIATAN\n${k.nama || '-'} - ${s.nama || '-'}\nTanggal: ${sx.tanggal || _todayLocal()}\n\n`;
      Object.keys(lb).forEach(st => {
        const list = rows.filter(a => a.status === st).map(a => sntM[a.sntId]?.nama).filter(Boolean);
        if (list.length) txt += `${lb[st]} (${list.length}): ${list.join(', ')}\n`;
      });
      txt += `\nTotal tercatat: ${rows.length}\n—\n${typeof _appN === 'function' ? _appN() : 'Pesantrenku'}`;
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(txt), '_blank');
    }
  };

  const style = document.createElement('style');
  style.textContent = `
    .phase6-sheet{padding-bottom:110px}.phase6-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.phase6-criteria-row{display:flex;gap:7px;margin-bottom:7px}.phase6-round{width:38px;border-radius:var(--r2);border:1.5px solid rgba(239,68,68,.2);background:rgba(239,68,68,.06);color:#ef4444;font-size:18px;font-weight:800}.phase6-mini{margin-top:2px}.phase6-check-list{max-height:170px;overflow:auto;border:1px solid var(--dv);border-radius:var(--r3);padding:6px;margin-bottom:12px;background:var(--su)}.phase6-check-list.tall{max-height:260px}.phase6-check-row{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--dv)}.phase6-check-row:last-child{border-bottom:0}.phase6-check-row span,.phase6-check-row strong,.phase6-check-row small{display:block}.phase6-check-row strong{font-size:12px;color:var(--t1)}.phase6-check-row small,.phase6-muted{font-size:10px;color:var(--t3);line-height:1.45}.phase6-doc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:7px}.phase6-doc-thumb{position:relative;aspect-ratio:1;border-radius:var(--r2);overflow:hidden;background:var(--gs);border:1px solid var(--dv)}.phase6-doc-thumb img{width:100%;height:100%;object-fit:cover}.phase6-doc-thumb button{position:absolute;right:4px;top:4px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff}.phase6-context{background:var(--gs);border:1px solid rgba(13,181,127,.16);border-radius:var(--r3);padding:10px 12px;margin-bottom:9px}.phase6-context strong,.phase6-context span{display:block}.phase6-context span{font-size:11px;color:var(--t3);margin-top:2px}.phase6-inline-info{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}.phase6-inline-info span{padding:8px 10px;background:var(--su);border:1px solid var(--sub);border-radius:var(--r2);font-size:10px;font-weight:800;color:var(--t2)}.phase6-score-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.phase6-score-grid label span{display:block;font-size:10px;font-weight:800;color:var(--t3);margin-bottom:4px}.phase6-section-title{font-size:10px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:0;margin:14px 0 8px}.phase6-profile-block{margin-top:16px}.phase6-profile-card{background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:12px;margin-bottom:9px;box-shadow:var(--shadow-sm);backdrop-filter:blur(22px)}.phase6-profile-card strong,.phase6-profile-card small{display:block}.phase6-profile-card strong{font-family:var(--fd);font-size:13px;color:var(--t1)}.phase6-profile-card small,.phase6-profile-card p{font-size:10px;color:var(--t3);line-height:1.45}.phase6-score-line{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.phase6-score-line span{font-size:10px;color:var(--t2);background:var(--gs);border:1px solid rgba(13,181,127,.12);border-radius:100px;padding:3px 8px}.phase6-card-actions{display:flex;gap:6px;margin-top:9px}.phase6-card-actions button{padding:7px 11px;border-radius:var(--r2);background:var(--gs);border:1px solid rgba(13,181,127,.18);font-size:10px;font-weight:800;color:var(--a1)}.phase6-card-actions button.danger{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);color:#ef4444}.phase6-empty{padding:18px;text-align:center;color:var(--t3);font-size:12px}.phase6-finance-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.phase6-finance-summary>div{background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:10px;box-shadow:var(--shadow-sm)}.phase6-finance-summary strong,.phase6-finance-summary span{display:block}.phase6-finance-summary strong{font-family:var(--fd);font-size:13px;color:var(--a1)}.phase6-finance-summary span{font-size:9px;color:var(--t3);margin-top:2px}.phase6-upload-split{display:grid;grid-template-columns:1fr 1fr;gap:7px}.phase6-upload-split button{padding:11px;border-radius:var(--r3);background:var(--gs);border:1.5px dashed rgba(13,181,127,.3);font-size:12px;font-weight:800;color:var(--a1)}#phase6-share-subabs{position:fixed;right:16px;bottom:144px;z-index:260;padding:12px 14px;border-radius:100px;background:var(--grad);color:#fff;border:0;font-size:12px;font-weight:900;box-shadow:0 12px 28px rgba(13,181,127,.3)}
    @media(max-width:520px){.phase6-two,.phase6-score-grid,.phase6-finance-summary{grid-template-columns:1fr}.phase6-doc-grid{grid-template-columns:repeat(4,1fr)}.phase6-inline-info{grid-template-columns:1fr 1fr}#phase6-share-subabs{bottom:132px}}
  `;
  document.head.appendChild(style);
})();

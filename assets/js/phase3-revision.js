'use strict';
/* Phase 3: enhancements loaded after the stable single-file core. */
(function () {
  const App = window.App;
  const DB = window.DB;
  const M = window.PesantrenkuModules;
  if (!App || !DB || !M) {
    console.warn('[Phase3] Core application is unavailable.');
    return;
  }

  const escText = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = value => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
  const monthNow = () => _todayLocal().slice(0, 7);
  const activeSantri = async () => (await DB.ga('santri')).filter(s => s.aktif !== false && !s.deleted).sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
  const iconButton = (icon, title, action, color = 'var(--a1)') => `<button class="phase3-icon-btn" title="${escText(title)}" aria-label="${escText(title)}" onclick="${action}">${icon}</button>`;

  function downloadWorkbook(name, sheets) {
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style><Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#DDF3EA" ss:Pattern="Solid"/></Style></Styles>${sheets.map(sheet => {
      const safeName = String(sheet.name || 'Sheet').replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31) || 'Sheet';
      const row = cells => `<Row>${cells.map((cell, i) => `<Cell${i === 0 && sheet.title ? ' ss:StyleID="title"' : ''}><Data ss:Type="String">${escText(cell)}</Data></Cell>`).join('')}</Row>`;
      const body = [];
      if (sheet.title) body.push(row([sheet.title]));
      if (sheet.meta) body.push(row([sheet.meta]));
      body.push(`<Row>${sheet.headers.map(h => `<Cell ss:StyleID="head"><Data ss:Type="String">${escText(h)}</Data></Cell>`).join('')}</Row>`);
      sheet.rows.forEach(values => body.push(`<Row>${values.map(v => `<Cell><Data ss:Type="String">${escText(v)}</Data></Cell>`).join('')}</Row>`));
      return `<Worksheet ss:Name="${escText(safeName)}"><Table>${body.join('')}</Table></Worksheet>`;
    }).join('')}</Workbook>`;
    const blob = new Blob(['\ufeff' + xml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  Object.assign(M, {
    async renderAkademik() {
      const [rawPrograms, evaluations, records, santri] = await Promise.all([
        this._ensureAkdPrograms(), DB.ga('academicEvaluations').catch(() => []), DB.ga('academicRecords').catch(() => []), DB.ga('santri')
      ]);
      const programs = rawPrograms.filter(p => !p.deleted).sort((a, b) => (a.urutan || 0) - (b.urutan || 0) || String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
      if (!S.akdProgramId || !programs.some(p => p.id === S.akdProgramId)) S.akdProgramId = programs[0]?.id || '';
      const program = programs.find(p => p.id === S.akdProgramId);
      const root = document.getElementById('akd-body');
      if (!root) return;
      if (!program) {
        root.innerHTML = `<div style="padding:0 15px"><div class="gc" style="padding:18px;text-align:center;color:var(--t3)">Belum ada program akademik.</div><button class="bg2 bw" style="margin-top:12px" onclick="PesantrenkuModules.programForm()">Tambah Program</button></div>`;
        return;
      }
      const evals = evaluations.filter(e => !e.deleted && e.programId === program.id).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || 0) - (a.createdAt || 0));
      if (!S.akdEvalId || !evals.some(e => e.id === S.akdEvalId)) S.akdEvalId = evals[0]?.id || '';
      const evaluation = evals.find(e => e.id === S.akdEvalId) || null;
      const santriById = mapBy(santri, 'id');
      const currentRecords = records.filter(r => !r.deleted && r.programId === program.id && (!evaluation || r.evaluationId === evaluation.id));
      const recordBySantri = Object.fromEntries(currentRecords.map(r => [r.sntId, r]));
      const members = (evaluation?.memberIds || []).map(id => santriById[id]).filter(Boolean);
      const cards = programs.map(p => `<button class="phase3-program ${p.id === program.id ? 'selected' : ''}" onclick="S.akdProgramId='${p.id}';S.akdEvalId='';PesantrenkuModules.renderAkademik()"><span>${escText(p.nama || '-')}</span><small>${escText(p.deskripsi || 'Program akademik')}</small></button>`).join('');
      const evalList = evals.length ? evals.map(e => `<button class="phase3-evaluation ${e.id === evaluation?.id ? 'selected' : ''}" onclick="S.akdEvalId='${e.id}';PesantrenkuModules.renderAkademik()"><span class="phase3-eval-dot"></span><span style="flex:1;min-width:0;text-align:left"><strong>${escText(e.nama || 'Evaluasi')}</strong><small>${escText(e.tanggal || '-')} · ${e.memberIds?.length || 0} santri · PJ ${escText(e.penanggungJawab || '-')}</small></span>${iconButton('✎', 'Edit evaluasi', `event.stopPropagation();PesantrenkuModules.evalForm('${e.id}','${program.id}')`)}</button>`).join('') : '<div class="phase3-empty">Belum ada evaluasi pada program ini.</div>';
      const rows = members.length ? members.map(sn => {
        const r = recordBySantri[sn.id];
        return `<tr><td><strong>${escText(sn.nama)}</strong><div class="phase3-muted">${escText(sn.kelas || '-')} · ${escText(sn.kamar || '-')}</div></td><td>${r ? escText(r.capaian || r.nilai || '-') : '<span class="phase3-muted">Belum diinput</span>'}<div class="phase3-muted">${r ? escText(r.catatan || '') : ''}</div></td><td>${escText(r?.guru || '-')}</td><td>${iconButton(r ? '✎' : '+', r ? 'Edit nilai' : 'Input nilai', `PesantrenkuModules.akdForm('${r?.id || ''}','${evaluation.id}','${sn.id}')`)}</td></tr>`;
      }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--t3);padding:18px">Belum ada santri dalam evaluasi.</td></tr>';
      root.innerHTML = `<div class="phase3-page"><details class="gc phase3-program-picker" open><summary>Program Akademik: <strong>${escText(program.nama)}</strong></summary><div class="phase3-program-grid">${cards}</div><div class="phase3-tools"><button class="mini-btn" onclick="PesantrenkuModules.programForm()">+ Program</button>${iconButton('✎','Edit program',`PesantrenkuModules.programForm('${program.id}')`)}${iconButton('⌫','Hapus program',`PesantrenkuModules.confirmDeleteProgram('${program.id}')`)}</div></details><div class="phase3-stats"><div><strong>${evals.length}</strong><span>Evaluasi program</span></div><div><strong>${records.filter(r => !r.deleted && r.programId === program.id).length}</strong><span>Data nilai</span></div></div><section class="gc phase3-section"><header><div><strong>Daftar Evaluasi</strong><small>Klik satu evaluasi untuk melihat detail dan nilai.</small></div><div class="phase3-tools">${iconButton('+','Daftarkan evaluasi baru',`PesantrenkuModules.evalForm('','${program.id}')`)}${iconButton('⇩','Export program',`PesantrenkuModules.exportProgram('${program.id}')`)}${iconButton('⌫','Hapus seluruh evaluasi',`PesantrenkuModules.confirmDeleteProgramEvaluations('${program.id}')`)}</div></header>${evalList}</section>${evaluation ? `<section class="gc phase3-section"><header><div><strong>${escText(evaluation.nama)}</strong><small>${escText(evaluation.tanggal || '-')} · Evaluator: ${escText((evaluation.evaluatorNames || []).join(', ') || '-')} · PJ: ${escText(evaluation.penanggungJawab || '-')}</small></div><div class="phase3-tools">${iconButton('⇩','Export evaluasi',`PesantrenkuModules.exportEvaluation('${evaluation.id}')`)}${iconButton('⌫','Hapus evaluasi',`PesantrenkuModules.confirmDeleteEvaluation('${evaluation.id}')`)}</div></header><div class="phase3-tools" style="margin:0 0 10px">${iconButton('+','Tambah catatan/nilai',`PesantrenkuModules.akdForm('','${evaluation.id}')`)}</div><div style="overflow:auto"><table class="table-lite"><thead><tr><th>Santri</th><th>Nilai/Capaian</th><th>Guru</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div></section>` : '<section class="gc phase3-empty">Pilih atau daftarkan evaluasi untuk mulai input nilai.</section>'}</div>`;
    },

    async akdForm(recordId, evaluationId, santriId) {
      const [record, evaluations, programs, santri] = await Promise.all([recordId ? DB.g('academicRecords', recordId) : Promise.resolve({}), DB.ga('academicEvaluations'), DB.ga('academicPrograms'), activeSantri()]);
      const evaluation = evaluations.find(e => e.id === (evaluationId || record?.evaluationId));
      if (!evaluation) { T('Pilih evaluasi terlebih dahulu.'); return; }
      const program = programs.find(p => p.id === evaluation.programId) || {};
      const isEdit = Boolean(recordId);
      const selected = new Set(isEdit ? [record.sntId] : (santriId ? [santriId] : evaluation.memberIds || []));
      const evaluatorNames = [...new Set([...(evaluation.evaluatorNames || []), evaluation.penanggungJawab].filter(Boolean))];
      const memberList = santri.map(sn => `<label class="phase3-check-row" data-search="${escText(`${sn.nama} ${sn.nis} ${sn.kamar}`)}"><input type="checkbox" class="akd-target" value="${sn.id}" ${selected.has(sn.id) ? 'checked' : ''}><span><strong>${escText(sn.nama)}</strong><small>NIS ${escText(sn.nis || '-')} · ${escText(sn.kamar || '-')}</small></span></label>`).join('');
      OS(`<div class="sh">${isEdit ? 'Edit Nilai Santri' : 'Tambah Catatan Akademik'}</div><div class="sb phase3-sheet"><div class="phase3-context"><strong>${escText(program.nama || '-')}</strong><br>${escText(evaluation.nama || '-')} · ${escText(evaluation.tanggal || '-')}</div>${isEdit ? `<div class="fg"><label class="fl">Santri</label><div class="phase3-readonly">${escText(santri.find(s => s.id === record.sntId)?.nama || '-')}</div></div>` : `<div class="fg"><label class="fl">Cari dan Pilih Santri</label><input class="fi" id="akd-multi-q" placeholder="Cari nama, NIS, kamar..." oninput="PesantrenkuModules.filterAcademicTargets(this.value)"><div id="akd-multi-list" class="phase3-check-list">${memberList}</div><small class="phase3-muted">Boleh memilih santri di luar anggota evaluasi sebelumnya.</small></div>`}<div class="fg"><label class="fl">Evaluator/Guru</label><select class="fsel" id="akd-guru">${evaluatorNames.map(n => `<option ${record?.guru === n ? 'selected' : ''}>${escText(n)}</option>`).join('') || '<option>-</option>'}</select></div><div class="fg"><label class="fl">Nilai / Capaian</label><input class="fi" id="akd-cap" value="${escText(record?.capaian || record?.nilai || '')}" placeholder="Nilai, halaman, jilid, target, atau capaian"></div><div class="fg"><label class="fl">Status</label><select class="fsel" id="akd-status"><option value="selesai" ${record?.status === 'selesai' ? 'selected' : ''}>Selesai</option><option value="proses" ${record?.status === 'proses' ? 'selected' : ''}>Proses</option><option value="perlu_bimbingan" ${record?.status === 'perlu_bimbingan' ? 'selected' : ''}>Perlu bimbingan</option></select></div><div class="fg"><label class="fl">Catatan</label><textarea class="fi" id="akd-cat" style="height:90px;resize:none">${escText(record?.catatan || '')}</textarea></div><button class="bg2 bw" onclick="PesantrenkuModules.saveAkd('${recordId || ''}','${evaluation.id}')">Simpan</button>${isEdit ? `<button class="phase3-danger-btn" onclick="PesantrenkuModules.delAkd('${recordId}')">Hapus Catatan</button>` : ''}</div>`);
    },
    filterAcademicTargets(query) {
      const q = this._norm(query);
      document.querySelectorAll('#akd-multi-list [data-search]').forEach(el => { el.style.display = !q || this._norm(el.dataset.search).includes(q) ? 'flex' : 'none'; });
    },
    async saveAkd(recordId, evaluationId) {
      const evaluation = await DB.g('academicEvaluations', evaluationId);
      if (!evaluation) { T('Evaluasi tidak ditemukan.'); return; }
      const program = await DB.g('academicPrograms', evaluation.programId);
      const targetIds = recordId ? [(await DB.g('academicRecords', recordId))?.sntId].filter(Boolean) : [...document.querySelectorAll('.akd-target:checked')].map(el => el.value);
      if (!targetIds.length) { T('Pilih minimal satu santri.'); return; }
      const now = Date.now();
      const capaian = document.getElementById('akd-cap').value.trim();
      const guru = document.getElementById('akd-guru').value;
      const status = document.getElementById('akd-status').value;
      const catatan = document.getElementById('akd-cat').value.trim();
      const santri = await DB.ga('santri');
      for (const sntId of targetIds) {
        const old = recordId ? await DB.g('academicRecords', recordId) : null;
        const id = old?.id || uid();
        const payload = { id, sntId, programId: evaluation.programId, programNama: program?.nama || '-', evaluationId, evaluationNama: evaluation.nama || '-', tanggal: evaluation.tanggal || _todayLocal(), capaian, nilai: capaian, guru, status, catatan, createdAt: old?.createdAt || now, updatedAt: now, oleh: S.user?.nama || '-' };
        await DB.p('academicRecords', payload);
        const noteId = `akd_note_${id}`;
        const sn = santri.find(s => s.id === sntId);
        await DB.p('catatanSantri', { id: noteId, sntId, tipe: 'akademik', sumber: 'academicRecords', sourceAcademicId: id, isi: `${program?.nama || 'Akademik'} · ${evaluation.nama || 'Evaluasi'}${capaian ? ` · ${capaian}` : ''}${catatan ? `\n${catatan}` : ''}`, programAkademik: program?.nama || '-', evaluasiAkademik: evaluation.nama || '-', nilaiAkademik: capaian, guru, tanggal: evaluation.tanggal || _todayLocal(), createdAt: old?.createdAt || now, updatedAt: now, oleh: S.user?.nama || '-', namaSantri: sn?.nama || '' });
      }
      CS(); T(`${targetIds.length} catatan akademik disimpan.`); S.akdEvalId = evaluationId; await this.renderAkademik();
    },
    async delAkd(id) {
      if (!_needAdmin()) return;
      const r = await DB.g('academicRecords', id);
      if (r) await DB.d('catatanSantri', `akd_note_${id}`);
      await DB.d('academicRecords', id); CS(); T('Catatan akademik dihapus.'); await this.renderAkademik();
    },
    async exportEvaluation(evaluationId) {
      const [evaluation, programs, records, santri] = await Promise.all([DB.g('academicEvaluations', evaluationId), DB.ga('academicPrograms'), DB.ga('academicRecords'), DB.ga('santri')]);
      if (!evaluation) return;
      const program = programs.find(p => p.id === evaluation.programId);
      const sntM = mapBy(santri, 'id');
      const rows = records.filter(r => !r.deleted && r.evaluationId === evaluationId).map((r, i) => [i + 1, sntM[r.sntId]?.nama || '-', sntM[r.sntId]?.nis || '-', sntM[r.sntId]?.kamar || '-', r.capaian || r.nilai || '-', r.status || '-', r.guru || '-', r.catatan || '']);
      downloadWorkbook(`Pesantrenku-${String(program?.nama || 'akademik').replace(/\s+/g, '-')}-${String(evaluation.nama || 'evaluasi').replace(/\s+/g, '-')}.xls`, [{ name: evaluation.nama || 'Evaluasi', title: `Laporan Evaluasi: ${evaluation.nama || '-'}`, meta: `Program: ${program?.nama || '-'} | Tanggal: ${evaluation.tanggal || '-'} | PJ: ${evaluation.penanggungJawab || '-'}`, headers: ['No', 'Santri', 'NIS', 'Kamar', 'Nilai/Capaian', 'Status', 'Evaluator', 'Catatan'], rows }]);
    },
    async exportProgram(programId) {
      const [program, evaluations, records, santri] = await Promise.all([DB.g('academicPrograms', programId), DB.ga('academicEvaluations'), DB.ga('academicRecords'), DB.ga('santri')]);
      const sntM = mapBy(santri, 'id');
      const sheets = evaluations.filter(e => !e.deleted && e.programId === programId).map(e => ({ name: e.nama || 'Evaluasi', title: `Laporan Program ${program?.nama || '-'}: ${e.nama || '-'}`, meta: `Tanggal: ${e.tanggal || '-'} | PJ: ${e.penanggungJawab || '-'} | Evaluator: ${(e.evaluatorNames || []).join(', ') || '-'}`, headers: ['No', 'Santri', 'NIS', 'Kamar', 'Nilai/Capaian', 'Status', 'Evaluator', 'Catatan'], rows: records.filter(r => !r.deleted && r.evaluationId === e.id).map((r, i) => [i + 1, sntM[r.sntId]?.nama || '-', sntM[r.sntId]?.nis || '-', sntM[r.sntId]?.kamar || '-', r.capaian || r.nilai || '-', r.status || '-', r.guru || '-', r.catatan || '']) }));
      if (!sheets.length) { T('Belum ada evaluasi untuk diexport.'); return; }
      downloadWorkbook(`Pesantrenku-program-${String(program?.nama || 'akademik').replace(/\s+/g, '-')}.xls`, sheets);
    },

    async renderKeuangan() {
      const [bills, payments, santri] = await Promise.all([DB.ga('financeBills'), DB.ga('financePayments'), DB.ga('santri')]);
      const sntM = mapBy(santri, 'id'); const paid = {};
      payments.filter(p => !p.deleted).forEach(p => { paid[p.billId] = (paid[p.billId] || 0) + Number(p.jumlah || 0); });
      const q = this._norm(S.keuQ || '');
      const rows = bills.filter(b => !b.deleted).filter(b => !q || this._norm(`${sntM[b.sntId]?.nama || ''} ${sntM[b.sntId]?.nis || ''} ${b.jenis || ''} ${b.periode || ''}`).includes(q)).sort((a, b) => (b.periode || '').localeCompare(a.periode || '')).map(b => {
        const totalPaid = paid[b.id] || 0; const sisa = Number(b.jumlah || 0) - totalPaid;
        return `<tr><td>${escText(b.periode || '-')}<div class="phase3-muted">${escText(b.jenis || '-')}</div></td><td><strong>${escText(sntM[b.sntId]?.nama || '-')}</strong><div class="phase3-muted">${escText(sntM[b.sntId]?.nis || '-')}</div></td><td>${money(b.jumlah)}</td><td>${money(totalPaid)}</td><td style="font-weight:800;color:${sisa > 0 ? '#c2410c' : 'var(--a1)'}">${money(sisa)}</td><td>${iconButton('＋','Catat pembayaran',`PesantrenkuModules.payForm('${b.id}')`)}</td></tr>`;
      }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:18px">Belum ada tagihan.</td></tr>';
      const allBills = bills.filter(b => !b.deleted); const total = allBills.reduce((n, b) => n + Number(b.jumlah || 0), 0); const totalPaid = Object.values(paid).reduce((n, v) => n + v, 0);
      document.getElementById('keu-body').innerHTML = `<div class="phase3-page"><div class="phase3-stats"><div><strong>${money(total)}</strong><span>Total tagihan</span></div><div><strong>${money(totalPaid)}</strong><span>Terbayar</span></div></div><div class="phase3-tools" style="margin-bottom:10px"><button class="mini-btn" onclick="PesantrenkuModules.billForm()">+ Tagihan</button>${iconButton('＋','Catat pembayaran',`PesantrenkuModules.payForm()`)}${iconButton('⇩','Export keuangan',`PesantrenkuModules.exportKeu()`)}</div><input class="fi" placeholder="Cari santri, NIS, periode, atau jenis tagihan..." value="${escText(S.keuQ || '')}" oninput="S.keuQ=this.value;PesantrenkuModules.renderKeuangan()" style="margin-bottom:10px"><section class="gc phase3-section"><div style="overflow:auto"><table class="table-lite"><thead><tr><th>Periode</th><th>Santri</th><th>Tagihan</th><th>Bayar</th><th>Sisa</th><th>Catat</th></tr></thead><tbody>${rows}</tbody></table></div></section></div>`;
    },
    async billForm(id) {
      const bill = id ? await DB.g('financeBills', id) : {};
      const options = (await activeSantri()).map(s => `<option value="${s.id}" ${bill?.sntId === s.id ? 'selected' : ''}>${escText(s.nama)} · ${escText(s.nis || '-')} · ${escText(s.kamar || '-')}</option>`).join('');
      OS(`<div class="sh">${id ? 'Edit' : 'Tambah'} Tagihan</div><div class="sb phase3-sheet"><div class="fg"><label class="fl">Penerima Tagihan</label><select class="fsel" id="keu-scope" onchange="PesantrenkuModules.toggleBillScope()"><option value="single">Satu santri</option><option value="all">Seluruh santri aktif</option></select></div><div id="keu-single-wrap"><div class="fg"><label class="fl">Cari Santri</label><input class="fi" id="keu-snt-q" placeholder="Cari nama, NIS, kamar..." oninput="PesantrenkuModules._filterSelect('keu-snt-q','keu-snt')"></div><div class="fg"><label class="fl">Santri</label><select class="fsel" id="keu-snt">${options}</select></div></div><div class="fg"><label class="fl">Periode</label><input class="fi" id="keu-per" type="month" value="${escText(bill?.periode || monthNow())}"></div><div class="fg"><label class="fl">Jenis Tagihan</label><input class="fi" id="keu-jenis" value="${escText(bill?.jenis || 'SPP')}"></div><div class="fg"><label class="fl">Jumlah</label><input class="fi" id="keu-jml" type="number" inputmode="numeric" value="${escText(bill?.jumlah || '')}"></div><div class="fg"><label class="fl">Jatuh Tempo</label><input class="fi" id="keu-due" type="date" value="${escText(bill?.jatuhTempo || '')}"></div><div class="fg"><label class="fl">Catatan</label><textarea class="fi" id="keu-cat" style="height:80px;resize:none">${escText(bill?.catatan || '')}</textarea></div><button class="bg2 bw" onclick="PesantrenkuModules.saveBill('${id || ''}')">Simpan Tagihan</button>${id ? `<button class="phase3-danger-btn" onclick="PesantrenkuModules.delBill('${id}')">Hapus Tagihan</button>` : ''}</div>`);
    },
    toggleBillScope() { const all = document.getElementById('keu-scope')?.value === 'all'; const el = document.getElementById('keu-single-wrap'); if (el) el.style.display = all ? 'none' : ''; },
    async saveBill(id) {
      const scope = document.getElementById('keu-scope')?.value || 'single'; const amount = Number(document.getElementById('keu-jml').value || 0);
      if (amount <= 0) { T('Jumlah tagihan harus lebih dari 0.'); return; }
      const now = Date.now(); const base = { periode: document.getElementById('keu-per').value, jenis: document.getElementById('keu-jenis').value.trim(), jumlah: amount, jatuhTempo: document.getElementById('keu-due').value, catatan: document.getElementById('keu-cat').value.trim(), updatedAt: now, oleh: S.user?.nama || '-' };
      const ids = scope === 'all' ? (await activeSantri()).map(s => s.id) : [document.getElementById('keu-snt').value];
      const existing = await DB.ga('financeBills');
      for (const sntId of ids) {
        const old = id ? await DB.g('financeBills', id) : existing.find(b => !b.deleted && b.sntId === sntId && b.periode === base.periode && b.jenis === base.jenis);
        await DB.p('financeBills', { id: old?.id || uid(), sntId, ...base, createdAt: old?.createdAt || now });
      }
      CS(); T(scope === 'all' ? `Tagihan dibuat untuk ${ids.length} santri.` : 'Tagihan disimpan.'); await this.renderKeuangan();
    },
    async payForm(billId) {
      const [bills, santri] = await Promise.all([DB.ga('financeBills'), DB.ga('santri')]); const sntM = mapBy(santri, 'id');
      const opts = bills.filter(b => !b.deleted).map(b => `<option value="${b.id}" ${b.id === billId ? 'selected' : ''}>${escText(sntM[b.sntId]?.nama || '-')} · ${escText(b.jenis || '-')} · ${escText(b.periode || '-')} · ${money(b.jumlah)}</option>`).join('');
      OS(`<div class="sh">Catat Pembayaran</div><div class="sb phase3-sheet"><div class="fg"><label class="fl">Cari Tagihan</label><input class="fi" id="pay-bill-q" placeholder="Cari santri, periode, jenis..." oninput="PesantrenkuModules._filterSelect('pay-bill-q','pay-bill')"></div><div class="fg"><label class="fl">Tagihan</label><select class="fsel" id="pay-bill">${opts}</select></div><div class="fg"><label class="fl">Tanggal Bayar</label><input class="fi" id="pay-tgl" type="date" value="${_todayLocal()}"></div><div class="fg"><label class="fl">Jumlah Bayar</label><input class="fi" id="pay-jml" type="number" inputmode="numeric"></div><div class="fg"><label class="fl">Metode</label><input class="fi" id="pay-met" value="Tunai"></div><div class="fg"><label class="fl">Bukti Pembayaran</label><label class="phase3-upload"><input type="file" id="pay-proof" accept="image/*" capture="environment" onchange="PesantrenkuModules.previewPaymentProof(this)">Ambil foto atau pilih bukti pembayaran</label><img id="pay-proof-preview" class="phase3-proof" alt="Pratinjau bukti pembayaran"></div><button class="bg2 bw" onclick="PesantrenkuModules.savePay()">Simpan Pembayaran</button></div>`);
    },
    previewPaymentProof(input) { const file = input.files?.[0]; const img = document.getElementById('pay-proof-preview'); if (file && img) { img.src = URL.createObjectURL(file); img.style.display = 'block'; } },
    async savePay() {
      const billId = document.getElementById('pay-bill').value; const bill = await DB.g('financeBills', billId); const amount = Number(document.getElementById('pay-jml').value || 0);
      if (!billId || !bill || amount <= 0) { T('Pilih tagihan dan isi jumlah pembayaran.'); return; }
      let buktiPembayaran = ''; const file = document.getElementById('pay-proof')?.files?.[0];
      if (file) { T('Mengunggah bukti pembayaran...'); try { buktiPembayaran = await App._uploadPhoto(file, 'pembayaran', billId, 1200, 0.86); } catch (e) { T('Upload bukti gagal: ' + (e.message || e)); return; } }
      await DB.p('financePayments', { id: uid(), billId, sntId: bill.sntId || '', tanggal: document.getElementById('pay-tgl').value || _todayLocal(), jumlah: amount, metode: document.getElementById('pay-met').value.trim(), buktiPembayaran, createdAt: Date.now(), updatedAt: Date.now(), oleh: S.user?.nama || '-' });
      CS(); T('Pembayaran disimpan.'); await this.renderKeuangan();
    },
    async exportKeu() {
      const [bills, payments, santri] = await Promise.all([DB.ga('financeBills'), DB.ga('financePayments'), DB.ga('santri')]); const sntM = mapBy(santri, 'id'); const paid = {};
      payments.filter(p => !p.deleted).forEach(p => { paid[p.billId] = (paid[p.billId] || 0) + Number(p.jumlah || 0); });
      downloadWorkbook('Pesantrenku-keuangan.xls', [{ name: 'Tagihan', title: 'Laporan Keuangan Pesantrenku', meta: `Diexport: ${new Date().toLocaleString('id-ID')}`, headers: ['No', 'Periode', 'Santri', 'NIS', 'Jenis', 'Tagihan', 'Terbayar', 'Sisa', 'Jatuh Tempo', 'Catatan'], rows: bills.filter(b => !b.deleted).map((b, i) => [i + 1, b.periode || '-', sntM[b.sntId]?.nama || '-', sntM[b.sntId]?.nis || '-', b.jenis || '-', b.jumlah || 0, paid[b.id] || 0, Number(b.jumlah || 0) - Number(paid[b.id] || 0), b.jatuhTempo || '-', b.catatan || '']) }, { name: 'Pembayaran', title: 'Riwayat Pembayaran Pesantrenku', meta: `Diexport: ${new Date().toLocaleString('id-ID')}`, headers: ['No', 'Tanggal', 'Santri', 'Tagihan', 'Jumlah', 'Metode', 'Bukti'], rows: payments.filter(p => !p.deleted).map((p, i) => [i + 1, p.tanggal || '-', sntM[p.sntId]?.nama || '-', bills.find(b => b.id === p.billId)?.jenis || '-', p.jumlah || 0, p.metode || '-', p.buktiPembayaran || '-']) }]);
    }
  });

  const originalRenderProfile = App.renderProfil.bind(App);
  App.renderProfil = async function (sntId) {
    await originalRenderProfile(sntId);
    const tab = document.getElementById('tab-catatan');
    if (tab) {
      const notes = (await DB.ga('catatanSantri')).filter(n => n.sntId === sntId && n.tipe === 'akademik' && !n.deleted).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
      const content = notes.length ? notes.map(n => `<div class="phase3-note"><strong>${escText(n.programAkademik || 'Akademik')}</strong><span>${escText(n.evaluasiAkademik || '-')} · ${escText(n.tanggal || '-')}</span><div>${escText(n.nilaiAkademik || '-')} · ${escText(n.guru || '-')}</div><small>${escText(n.isi || '')}</small></div>`).join('') : '<div class="phase3-muted">Belum ada catatan akademik.</div>';
      tab.insertAdjacentHTML('beforeend', `<div id="phase3-profile-academic"><div class="phase3-section-title">Akademik (${notes.length})</div>${content}</div>`);
    }
    await applyGenderVisibility();
  };

  const originalRenderPel = App.renderPel.bind(App);
  App.renderPel = async function () {
    await originalRenderPel();
    const body = document.getElementById('pel-body'); if (!body || document.getElementById('phase3-pel-bulk')) return;
    const selected = S.phase3PelSelected || new Set(); S.phase3PelSelected = selected;
    body.querySelectorAll('div[id^="pel-"]:not(#pel-body):not(#pel-fwrap):not(#pel-search-inp)').forEach(card => {
      const id = card.id.slice(4); if (!id || id === 'body' || id === 'fwrap' || id === 'search-inp') return;
      card.insertAdjacentHTML('afterbegin', `<label class="phase3-pel-check"><input type="checkbox" data-phase3-pel="${id}" ${selected.has(id) ? 'checked' : ''} onchange="PesantrenkuPhase3.togglePel('${id}',this.checked)"><span>Pilih</span></label>`);
    });
    body.insertAdjacentHTML('afterbegin', `<div id="phase3-pel-bulk" class="phase3-bulk"><strong id="phase3-pel-count">${selected.size} dipilih</strong><div>${iconButton('✓','Selesaikan ta’zir terpilih',`PesantrenkuPhase3.completeSelectedPel()`)}${iconButton('⌫','Hapus ta’zir terpilih',`PesantrenkuPhase3.deleteSelectedPel()`)}</div></div>`);
  };
  window.PesantrenkuPhase3 = {
    togglePel(id, checked) { const set = S.phase3PelSelected || (S.phase3PelSelected = new Set()); checked ? set.add(id) : set.delete(id); const el = document.getElementById('phase3-pel-count'); if (el) el.textContent = `${set.size} dipilih`; },
    async completeSelectedPel() { const ids = [...(S.phase3PelSelected || [])]; if (!ids.length) { T('Pilih ta’zir terlebih dahulu.'); return; } for (const id of ids) { const p = await DB.g('pelanggaran', id); if (p && p.status !== 'sudah') { p.status = 'sudah'; p.tazirAt = Date.now(); p.catatanHukuman = p.catatanHukuman || 'Diselesaikan massal'; p.updatedAt = Date.now(); await DB.p('pelanggaran', p); } } S.phase3PelSelected = new Set(); T(`${ids.length} ta’zir diselesaikan.`); await App.renderPel(); },
    async deleteSelectedPel() { if (!_needAdmin()) return; const ids = [...(S.phase3PelSelected || [])]; if (!ids.length) { T('Pilih data terlebih dahulu.'); return; } if (!confirm(`Hapus ${ids.length} data pelanggaran terpilih?`)) return; for (const id of ids) await DB.d('pelanggaran', id); S.phase3PelSelected = new Set(); T(`${ids.length} data dihapus.`); await App.renderPel(); }
  };

  const originalRenderSnt = App.renderSnt.bind(App);
  App.renderSnt = async function (...args) {
    await originalRenderSnt(...args);
    const container = document.getElementById('snt-body'); if (!container || document.getElementById('phase3-inactive-card')) return;
    const all = await DB.ga('santri'); const inactive = all.filter(s => s.aktif === false && !s.deleted && String(s.status || '').toLowerCase() !== 'alumni');
    const html = `<button id="phase3-inactive-card" class="phase3-inactive-card" onclick="PesantrenkuPhase3.showInactive()"><strong>${inactive.length}</strong><span>Santri nonaktif</span></button>`;
    container.insertAdjacentHTML('afterbegin', html);
    const rooms = await DB.ga('kamar');
    const filters = `<div class="phase3-snt-filters"><select id="phase3-snt-kelas" onchange="PesantrenkuPhase3.filterSantri()"><option value="">Semua kelas sekolah</option>${[...new Set(all.map(s=>s.kelas).filter(Boolean))].sort().map(v=>`<option>${escText(v)}</option>`).join('')}</select><select id="phase3-snt-diniah" onchange="PesantrenkuPhase3.filterSantri()"><option value="">Semua kelas diniah</option>${[...new Set(all.map(s=>s.kelasDiniah).filter(Boolean))].sort().map(v=>`<option>${escText(v)}</option>`).join('')}</select><select id="phase3-snt-komplek" onchange="PesantrenkuPhase3.filterSantri()"><option value="">Semua asrama/komplek</option>${[...new Set(rooms.map(r=>r.komplek).filter(Boolean))].sort().map(v=>`<option>${escText(v)}</option>`).join('')}</select></div>`;
    const search = document.getElementById('snt-search')?.closest('div[style*="margin-bottom:10px"]');
    if (search) search.insertAdjacentHTML('afterend', filters);
  };
  window.PesantrenkuPhase3.showInactive = async () => {
    const list = (await DB.ga('santri')).filter(s => s.aktif === false && !s.deleted && String(s.status || '').toLowerCase() !== 'alumni');
    OS(`<div class="sh">Santri Nonaktif</div><div class="sb phase3-sheet">${list.length ? list.map(s => `<button class="phase3-inactive-row" onclick="CS();App.nav('profil',{id:'${s.id}',t:'${escText(s.nama)}'})"><strong>${escText(s.nama)}</strong><small>${escText(s.kamar || '-')} · ${escText(s.status || 'Nonaktif')}</small></button>`).join('') : '<div class="phase3-empty">Tidak ada santri nonaktif.</div>'}</div>`);
  };
  window.PesantrenkuPhase3.filterSantri = async () => {
    const q = String(document.getElementById('snt-search')?.value || '').toLowerCase().trim();
    const kelas = document.getElementById('phase3-snt-kelas')?.value || '';
    const diniah = document.getElementById('phase3-snt-diniah')?.value || '';
    const komplek = document.getElementById('phase3-snt-komplek')?.value || '';
    const rooms = await DB.ga('kamar'); const roomM = Object.fromEntries(rooms.map(r => [r.nama, r.komplek || '']));
    const all = await DB.ga('santri'); const m = mapBy(all, 'id'); let visible = 0;
    document.querySelectorAll('#snt-list-items [data-sntrow]').forEach(row => { const s = m[row.id.replace('sntrow-', '')]; const hay = `${s?.nama || ''} ${s?.kamar || ''} ${s?.nis || ''}`.toLowerCase(); const show = Boolean(s) && (!q || hay.includes(q)) && (!kelas || s.kelas === kelas) && (!diniah || s.kelasDiniah === diniah) && (!komplek || (s.komplek || roomM[s.kamar] || '') === komplek); row.style.display = show ? 'flex' : 'none'; if (show) visible++; });
    const empty = document.getElementById('snt-empty'); if (empty) empty.style.display = visible ? 'none' : 'block';
  };
  App._filterSntList = () => window.PesantrenkuPhase3.filterSantri();

  const originalRenderSet = App.renderSet.bind(App);
  App.renderSet = async function () {
    await originalRenderSet();
    const body = document.getElementById('set-body'); if (!body || document.getElementById('phase3-structure-settings')) return;
    const gender = (await DB.g('settings', 'jenis_kelamin'))?.value || 'perempuan';
    const before = `<div id="phase3-structure-settings" style="margin-bottom:14px"><div class="sec-l">Struktur Hunian</div><div class="sc3"><div class="sr2" onclick="PesantrenkuPhase3.manageComplexes()"><div class="si4">⌂</div><div class="st3"><div class="sl3">Asrama / Komplek dan Kamar</div><div class="sv">Atur urutan: pesantren → komplek → kamar → santri</div></div><div class="sa">→</div></div><div class="sr2"><div class="si4">◐</div><div class="st3"><div class="sl3">Fitur Uzur</div><div class="sv">${gender === 'laki' ? 'Disembunyikan untuk asrama putra' : 'Aktif untuk asrama putri'}</div></div></div></div></div>`;
    body.insertAdjacentHTML('afterbegin', before); await applyGenderVisibility();
  };
  async function applyGenderVisibility() {
    const gender = (await DB.g('settings', 'jenis_kelamin').catch(() => null))?.value || 'perempuan';
    document.body.dataset.asramaGender = gender;
    // Pengaturan ini hanya memengaruhi kontrol Uzur yang memang ada di halaman
    // pengaturan. Jangan menyapu seluruh DOM karena nama "Uzur" juga muncul
    // dalam riwayat dan ringkasan yang tidak boleh ikut tersembunyi.
    document.body.classList.toggle('phase4-putra', gender === 'laki');
    const status = document.querySelector('#phase3-structure-settings .sr2:last-child .sv');
    if (status) status.textContent = gender === 'laki' ? 'Tidak tersedia untuk asrama putra' : 'Aktif untuk asrama putri';
  }
  const originalStartUzur = App._startUzur?.bind(App);
  if (originalStartUzur) App._startUzur = async function (...args) { const g = (await DB.g('settings', 'jenis_kelamin').catch(() => null))?.value; if (g === 'laki') { T('Fitur uzur tidak aktif untuk asrama putra.'); return null; } return originalStartUzur(...args); };

  window.PesantrenkuPhase3.manageComplexes = async () => {
    const rooms = (await DB.ga('kamar')).filter(k => !k.deleted).sort((a, b) => String(a.komplek || '').localeCompare(String(b.komplek || ''), 'id') || String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    const rows = rooms.map(k => `<div class="phase3-room-row"><div><strong>${escText(k.nama || '-')}</strong><small>${escText(k.komplek || 'Belum ada komplek')}</small></div>${iconButton('✎','Atur komplek kamar',`PesantrenkuPhase3.editRoomComplex('${k.id}')`)}</div>`).join('');
    OS(`<div class="sh">Asrama / Komplek / Kamar</div><div class="sb phase3-sheet"><div class="phase3-context">Pesantren → Asrama/Komplek → Kamar → Santri. Data kamar lama tetap aman; cukup tambahkan nama komplek pada setiap kamar.</div>${rows || '<div class="phase3-empty">Belum ada kamar.</div>'}</div>`);
  };
  window.PesantrenkuPhase3.editRoomComplex = async id => { const room = await DB.g('kamar', id); OS(`<div class="sh">Atur Komplek Kamar</div><div class="sb phase3-sheet"><div class="fg"><label class="fl">Kamar</label><div class="phase3-readonly">${escText(room?.nama || '-')}</div></div><div class="fg"><label class="fl">Nama Asrama / Komplek</label><input class="fi" id="phase3-komplek" value="${escText(room?.komplek || '')}" placeholder="Contoh: Komplek A / Asrama Putri 1"></div><button class="bg2 bw" onclick="PesantrenkuPhase3.saveRoomComplex('${id}')">Simpan</button></div>`); };
  window.PesantrenkuPhase3.saveRoomComplex = async id => { const room = await DB.g('kamar', id); if (!room) return; room.komplek = document.getElementById('phase3-komplek').value.trim(); room.updatedAt = Date.now(); await DB.p('kamar', room); const santri = await DB.ga('santri'); for (const s of santri.filter(s => s.kamar === room.nama)) { s.komplek = room.komplek; s.updatedAt = Date.now(); await DB.p('santri', s); } CS(); T('Komplek kamar disimpan.'); await window.PesantrenkuPhase3.manageComplexes(); };

  document.addEventListener('focusin', event => {
    const el = event.target;
    if (!el.matches('input,textarea,select')) return;
    setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }, 260);
  });
})();

(function () {
  const css = `
  .phase3-page{padding:0 15px 18px}.phase3-program-picker{padding:12px;margin-bottom:12px}.phase3-program-picker summary{font-family:var(--fd);font-weight:900;color:var(--t1);cursor:pointer}.phase3-program-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:11px 0}.phase3-program{min-height:72px;text-align:left;padding:10px;border:1px solid var(--sub);border-radius:var(--r3);background:var(--su);color:var(--t1)}.phase3-program.selected{background:rgba(13,181,127,.12);border-color:var(--a1);box-shadow:inset 0 0 0 1px rgba(13,181,127,.18)}.phase3-program span,.phase3-program small,.phase3-evaluation strong,.phase3-evaluation small{display:block}.phase3-program span,.phase3-evaluation strong{font-weight:800;font-size:12px}.phase3-program small,.phase3-evaluation small,.phase3-muted{font-size:10px;color:var(--t3);line-height:1.4}.phase3-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.phase3-icon-btn{width:32px;height:32px;border:1px solid rgba(13,181,127,.22);border-radius:8px;background:var(--gs);color:var(--a1);font-size:16px;display:inline-flex;align-items:center;justify-content:center}.phase3-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.phase3-stats>div{padding:13px;border:1px solid var(--sub);border-radius:var(--r3);background:var(--su)}.phase3-stats strong{display:block;font-family:var(--fd);font-size:23px;color:var(--a1)}.phase3-stats span{font-size:10px;color:var(--t3)}.phase3-section{padding:12px;margin-bottom:12px}.phase3-section header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px}.phase3-section header strong{display:block;font-family:var(--fd);font-weight:900}.phase3-section header small{font-size:10px;color:var(--t3);line-height:1.45}.phase3-evaluation{width:100%;padding:11px 4px;border:0;border-top:1px solid var(--dv);background:transparent;color:var(--t1);display:flex;align-items:center;gap:9px}.phase3-evaluation.selected{margin:5px 0;padding:10px 8px;border:1px solid rgba(13,181,127,.3);border-radius:var(--r3);background:rgba(13,181,127,.08)}.phase3-eval-dot{width:9px;height:9px;border-radius:50%;background:var(--dv);flex:0 0 auto}.phase3-evaluation.selected .phase3-eval-dot{background:var(--a1);box-shadow:0 0 0 4px rgba(13,181,127,.12)}.phase3-empty{padding:18px;text-align:center;color:var(--t3)}.phase3-context,.phase3-readonly{background:var(--gs);border:1px solid rgba(13,181,127,.18);border-radius:var(--r3);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--t2);line-height:1.5}.phase3-check-list{max-height:260px;overflow:auto;border:1px solid var(--dv);border-radius:var(--r3);margin-top:7px}.phase3-check-row{display:flex;gap:9px;align-items:center;padding:9px;border-bottom:1px solid var(--dv)}.phase3-check-row:last-child{border-bottom:0}.phase3-check-row strong,.phase3-check-row small{display:block}.phase3-check-row strong{font-size:12px}.phase3-check-row small{font-size:10px;color:var(--t3)}.phase3-danger-btn{width:100%;margin-top:8px;padding:13px;border-radius:100px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.28);color:#dc2626;font-size:13px;font-weight:800}.phase3-proof{display:none;width:100%;max-height:180px;object-fit:contain;border-radius:var(--r3);margin-top:8px;background:var(--gs)}.phase3-upload{display:block;padding:12px;border:1px dashed rgba(13,181,127,.4);border-radius:var(--r3);color:var(--a1);font-size:12px;font-weight:700;cursor:pointer}.phase3-upload input{display:none}.phase3-note{padding:10px 12px;margin:6px 0;border-left:3px solid var(--a1);border-radius:0 var(--r2) var(--r2) 0;background:var(--gs);font-size:11px;color:var(--t2);line-height:1.5}.phase3-note strong,.phase3-note span{display:block}.phase3-note span,.phase3-note small{font-size:10px;color:var(--t3)}.phase3-section-title{font-size:10px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 7px}.phase3-pel-check{position:absolute;right:7px;bottom:7px;display:flex;gap:4px;align-items:center;font-size:9px;color:var(--t3)}[id^="pel-"]{position:relative}.phase3-bulk{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;margin-bottom:9px;background:rgba(13,181,127,.09);border:1px solid rgba(13,181,127,.2);border-radius:var(--r3);font-size:11px}.phase3-inactive-card{width:100%;display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:9px;border:1px solid rgba(100,116,139,.25);border-radius:var(--r3);background:rgba(100,116,139,.06);color:var(--t2);text-align:left}.phase3-inactive-card strong{font-family:var(--fd);font-size:20px;color:#64748b}.phase3-inactive-card span{font-size:11px;font-weight:800}.phase3-inactive-row,.phase3-room-row{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 0;border-bottom:1px solid var(--dv);background:transparent;text-align:left;color:var(--t1)}.phase3-inactive-row strong,.phase3-inactive-row small,.phase3-room-row strong,.phase3-room-row small{display:block}.phase3-inactive-row small,.phase3-room-row small{font-size:10px;color:var(--t3)}
  @media(max-width:520px){.phase3-page{padding:0 12px 16px}.phase3-program-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.phase3-program{min-height:60px;padding:9px}.phase3-stats{gap:6px}.phase3-stats>div{padding:8px 9px;display:flex;align-items:baseline;gap:6px}.phase3-stats strong{font-size:16px;line-height:1}.phase3-stats span{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.phase3-section{padding:10px}.phase3-sheet{padding-bottom:calc(150px + env(keyboard-inset-height,0px))!important}.bs{max-height:calc(100dvh - env(keyboard-inset-height,0px))}.sb{padding-bottom:calc(160px + env(keyboard-inset-height,0px))!important}.phase3-evaluation{padding:10px 0}.phase3-evaluation strong{font-size:12px}.phase3-evaluation small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.phase3-program-picker{padding:10px}}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
})();

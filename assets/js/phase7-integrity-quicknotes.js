'use strict';
/* Phase 7: revision audit guards, expired-permission attendance repair, richer dashboard notes, and program delete UX. */
(function () {
  const App = window.App;
  const DB = window.DB;
  const M = window.PesantrenkuModules;
  if (!App || !DB || !M) return;

  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = value => String(value || '').toLowerCase().trim();
  const todayLocal = () => (typeof _todayLocal === 'function' ? _todayLocal() : new Date().toISOString().slice(0, 10));
  const nowTime = () => (typeof _nowTimeLocal === 'function' ? _nowTimeLocal() : new Date().toTimeString().slice(0, 5));
  const newId = () => (typeof uid === 'function' ? uid() : `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const money = value => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
  const map = (items, key) => Object.fromEntries((items || []).map(item => [item?.[key], item]));

  function permissionDeadlinePassed(per, tanggal = todayLocal(), jam = nowTime()) {
    if (!per?.tglSelesai) return false;
    if (tanggal > per.tglSelesai) return true;
    if (tanggal < per.tglSelesai) return false;
    return Boolean(per.jamKembali && jam > per.jamKembali);
  }

  function permissionCoversDate(per, tanggal = todayLocal(), jam = nowTime()) {
    if (!per || per.status !== 'disetujui' || per.sudahKembali) return false;
    if (!per.tglMulai || !per.tglSelesai) return false;
    if (per.tglMulai > tanggal || per.tglSelesai < tanggal) return false;
    return !permissionDeadlinePassed(per, tanggal, jam);
  }

  const originalIzinAktifMap = App._izinAktifMap?.bind(App);
  App._izinAktifMap = async function (tanggal) {
    const per = await DB.ga('perizinan');
    const m = {};
    per.filter(p => permissionCoversDate(p, tanggal || todayLocal(), (tanggal || todayLocal()) === todayLocal() ? nowTime() : '00:00'))
      .forEach(p => { m[p.sntId] = p.id; });
    return m;
  };
  window.PesantrenkuPhase7 = window.PesantrenkuPhase7 || {};
  window.PesantrenkuPhase7.permissionCoversDate = permissionCoversDate;
  window.PesantrenkuPhase7.permissionDeadlinePassed = permissionDeadlinePassed;

  const originalTerapkanIzin = App._terapkanIzinKeAbsensi?.bind(App);
  App._terapkanIzinKeAbsensi = async function (per) {
    if (!per) return 0;
    const [ses, abs] = await Promise.all([DB.ga('sesi'), DB.ga('absensi')]);
    const sesIds = new Set(ses
      .filter(s => s.tanggal >= per.tglMulai && s.tanggal <= per.tglSelesai)
      .filter(s => permissionCoversDate(per, s.tanggal, s.tanggal === todayLocal() ? nowTime() : '00:00'))
      .map(s => s.id));
    const targets = abs.filter(a => sesIds.has(a.sesiId) && a.sntId === per.sntId && (a.status === 'alpha' || a.status === 'none'));
    for (const a of targets) {
      a.status = 'izin';
      a.perizinanId = per.id;
      a.oleh = 'Sistem (Perizinan)';
      a.updatedAt = Date.now();
      await DB.p('absensi', a);
    }
    return targets.length;
  };

  async function repairExpiredPermissionAttendance() {
    const throttleKey = '_phase7IzinRepairTs';
    const last = Number(S[throttleKey] || 0);
    if (Date.now() - last < 60000) return 0;
    S[throttleKey] = Date.now();

    const [per, ses, abs, pel, santri, kg, sk] = await Promise.all([
      DB.ga('perizinan'), DB.ga('sesi'), DB.ga('absensi'), DB.ga('pelanggaran'),
      DB.ga('santri'), DB.ga('kegiatan'), DB.ga('subKeg')
    ]);
    const expired = per.filter(p => p.status === 'disetujui' && !p.sudahKembali && permissionDeadlinePassed(p));
    if (!expired.length) return 0;
    const perM = map(expired, 'id');
    const sesM = map(ses, 'id');
    const sntM = map(santri, 'id');
    const kgM = map(kg, 'id');
    const skM = map(sk, 'id');
    const pelByAbs = {};
    pel.forEach(p => { if (p.absId) pelByAbs[p.absId] = p; });
    let changed = 0;

    for (const a of abs.filter(x => x.status === 'izin' && x.perizinanId && perM[x.perizinanId])) {
      const sx = sesM[a.sesiId];
      const perItem = perM[a.perizinanId];
      if (!sx || !permissionDeadlinePassed(perItem, sx.tanggal, sx.tanggal === todayLocal() ? nowTime() : '23:59')) continue;
      const locked = !!sx.locked;
      a.status = locked ? 'alpha' : 'none';
      a.perizinanId = null;
      a.oleh = locked ? 'Sistem (Izin terlambat kembali)' : 'Sistem (Izin melewati batas kembali)';
      a.updatedAt = Date.now();
      await DB.p('absensi', a);
      changed++;
      if (locked && !pelByAbs[a.id]) {
        const sn = sntM[a.sntId] || {};
        const k = kgM[sx.kgId] || {};
        const sub = skM[sx.skId] || {};
        const id = typeof pelAutoId === 'function' ? pelAutoId(a.id) : `pel_auto_${a.id}`;
        await DB.p('pelanggaran', {
          id,
          tipe: 'auto',
          absId: a.id,
          sntId: a.sntId,
          sntNama: sn.nama || '-',
          kgId: sx.kgId || '',
          kgNama: k.nama || '-',
          skId: sx.skId || null,
          skNama: sub.nama || '',
          tanggal: sx.tanggal || todayLocal(),
          status: 'belum',
          pelanggaranJenis: 'Alpha',
          autoSource: 'izin_terlambat_kembali',
          catatanHukuman: '',
          fotoHukuman: '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    }
    if (changed) console.log('[Phase7] Expired permission attendance repaired:', changed);
    return changed;
  }
  window.PesantrenkuPhase7.repairExpiredPermissionAttendance = repairExpiredPermissionAttendance;

  const prevDash = App.dash?.bind(App);
  if (prevDash) App.dash = async function (...args) {
    await repairExpiredPermissionAttendance().catch(e => console.warn('[Phase7] izin repair failed:', e));
    return prevDash(...args);
  };

  const prevRenderAbs = App.renderAbs?.bind(App);
  if (prevRenderAbs) App.renderAbs = async function (...args) {
    await repairExpiredPermissionAttendance().catch(e => console.warn('[Phase7] izin repair failed:', e));
    return prevRenderAbs(...args);
  };

  const originalProgramForm = M.programForm?.bind(M);
  M.programForm = async function (id) {
    if (!originalProgramForm) return;
    await originalProgramForm(id);
    if (!id || document.getElementById('phase7-delete-program-btn')) return;
    const sheet = document.querySelector('#bs .sb');
    const saveBtn = sheet?.querySelector('button.bg2.bw');
    if (saveBtn) {
      saveBtn.insertAdjacentHTML('afterend', `<button id="phase7-delete-program-btn" class="phase7-danger-full" onclick="PesantrenkuModules.confirmDeleteProgram('${id}')">Hapus Program Ini</button>`);
    }
  };

  async function santriOptions(selected = '') {
    const santri = (await DB.ga('santri')).filter(s => s.aktif !== false && !s.deleted)
      .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    return santri.map(s => `<option value="${s.id}" ${selected === s.id ? 'selected' : ''}>${esc(s.nama || '-')} · ${esc(s.nis || '-')} · ${esc(s.kamar || '-')}</option>`).join('');
  }

  function baseSantriPicker() {
    return `<div class="fg"><label class="fl">Cari Santri</label><input class="fi" id="qnote-q" placeholder="Cari nama, NIS, kamar..." oninput="PesantrenkuModules._filterSelect('qnote-q','qnote-snt')"></div><div class="fg"><label class="fl">Santri</label><select class="fsel" id="qnote-snt"></select></div>`;
  }

  async function fillQuickSantri() {
    const sel = document.getElementById('qnote-snt');
    if (sel && !sel.innerHTML.trim()) sel.innerHTML = await santriOptions();
  }

  window.PesantrenkuPhase7.renderQuickNoteFields = async function () {
    const type = document.getElementById('qnote-type')?.value || 'catatan';
    const box = document.getElementById('qnote-fields');
    if (!box) return;
    const picker = baseSantriPicker();
    if (type === 'pelanggaran_manual') {
      box.innerHTML = `<div class="phase7-context">Membuka form pelanggaran manual lama agar data masuk ke modul Pelanggaran dan catatan santri.</div><button class="bg2 bw" onclick="CS();App._addPelManual()">Buka Form Pelanggaran Manual</button>`;
      return;
    }
    if (type === 'perizinan') {
      box.innerHTML = `${picker}<div class="phase7-two"><div class="fg"><label class="fl">Tanggal Mulai</label><input class="fi" id="qnote-start" type="date" value="${todayLocal()}"></div><div class="fg"><label class="fl">Tanggal Kembali</label><input class="fi" id="qnote-end" type="date" value="${todayLocal()}"></div></div><div class="phase7-two"><div class="fg"><label class="fl">Jam Mulai</label><input class="fi" id="qnote-jam-start" type="time"></div><div class="fg"><label class="fl">Jam Kembali</label><input class="fi" id="qnote-jam-end" type="time"></div></div><div class="fg"><label class="fl">Jenis Izin</label><input class="fi" id="qnote-title" value="Izin"></div><div class="fg"><label class="fl">Alasan / Keterangan</label><textarea class="fi" id="qnote-isi" style="height:96px;resize:none"></textarea></div>`;
      await fillQuickSantri();
      return;
    }
    if (type === 'sakit') {
      box.innerHTML = `${picker}<div class="fg"><label class="fl">Tanggal Mulai Sakit</label><input class="fi" id="qnote-start" type="date" value="${todayLocal()}"></div><div class="fg"><label class="fl">Diagnosis / Keluhan</label><textarea class="fi" id="qnote-title" style="height:78px;resize:none" placeholder="Contoh: demam, batuk, pusing..."></textarea></div><div class="fg"><label class="fl">Penanganan</label><textarea class="fi" id="qnote-isi" style="height:86px;resize:none" placeholder="Obat, istirahat, kontrol, dll."></textarea></div>`;
      await fillQuickSantri();
      return;
    }
    if (type === 'keuangan_tagihan') {
      box.innerHTML = `${picker}<div class="phase7-two"><div class="fg"><label class="fl">Periode</label><input class="fi" id="qnote-period" type="month" value="${todayLocal().slice(0, 7)}"></div><div class="fg"><label class="fl">Jatuh Tempo</label><input class="fi" id="qnote-end" type="date"></div></div><div class="fg"><label class="fl">Jenis Tagihan</label><input class="fi" id="qnote-title" value="SPP"></div><div class="fg"><label class="fl">Jumlah</label><input class="fi" id="qnote-amount" type="number" inputmode="numeric"></div><div class="fg"><label class="fl">Catatan</label><textarea class="fi" id="qnote-isi" style="height:82px;resize:none"></textarea></div>`;
      await fillQuickSantri();
      return;
    }
    const labels = {
      catatan: ['Catatan Umum', 'Isi catatan'],
      prestasi: ['Catatan Prestasi', 'Prestasi / capaian'],
      pelanggaran: ['Catatan Pelanggaran', 'Catatan pelanggaran'],
      psikologis: ['Catatan Psikologis', 'Catatan psikologis']
    }[type] || ['Catatan', 'Isi catatan'];
    box.innerHTML = `${picker}<div class="fg"><label class="fl">${labels[0]}</label><textarea class="fi" id="qnote-isi" style="height:110px;resize:none" placeholder="${labels[1]}"></textarea></div>`;
    await fillQuickSantri();
  };

  window.PesantrenkuPhase7.quickNoteSheet = async function () {
    OS(`<div class="sh">Tambah Catatan Cepat</div><div class="sb phase7-sheet"><div class="fg"><label class="fl">Jenis Data</label><select class="fsel" id="qnote-type" onchange="PesantrenkuPhase7.renderQuickNoteFields()"><option value="catatan">Catatan Umum</option><option value="prestasi">Prestasi</option><option value="pelanggaran">Catatan Pelanggaran</option><option value="psikologis">Catatan Psikologis</option><option value="perizinan">Perizinan</option><option value="sakit">Catatan Sakit</option><option value="keuangan_tagihan">Keuangan / Tagihan</option><option value="pelanggaran_manual">Pelanggaran Manual</option></select></div><div id="qnote-fields"></div><button class="bg2 bw" id="phase7-qnote-save" onclick="PesantrenkuPhase7.saveQuickNote()">Simpan</button></div>`);
    await window.PesantrenkuPhase7.renderQuickNoteFields();
  };

  window.PesantrenkuPhase7.saveQuickNote = async function () {
    const type = document.getElementById('qnote-type')?.value || 'catatan';
    if (type === 'pelanggaran_manual') { CS(); App._addPelManual(); return; }
    const sntId = document.getElementById('qnote-snt')?.value;
    if (!sntId) { T('Pilih santri dulu.'); return; }
    const now = Date.now();
    const snt = await DB.g('santri', sntId).catch(() => null);

    if (type === 'perizinan') {
      const tglMulai = document.getElementById('qnote-start')?.value || todayLocal();
      const tglSelesai = document.getElementById('qnote-end')?.value || tglMulai;
      if (tglSelesai < tglMulai) { T('Tanggal kembali tidak boleh sebelum tanggal mulai.'); return; }
      const per = {
        id: newId(),
        sntId,
        tipeIzin: document.getElementById('qnote-title')?.value.trim() || 'Izin',
        tglMulai,
        tglSelesai,
        jamMulai: document.getElementById('qnote-jam-start')?.value || null,
        jamKembali: document.getElementById('qnote-jam-end')?.value || null,
        alasan: document.getElementById('qnote-isi')?.value.trim() || '',
        status: 'disetujui',
        sudahKembali: false,
        waktuKembaliAktual: null,
        createdAt: now,
        updatedAt: now,
        oleh: S.user?.nama || '-',
        sumber: 'dashboard_quick_note'
      };
      await DB.p('perizinan', per);
      if (App._terapkanIzinKeAbsensi) await App._terapkanIzinKeAbsensi(per);
      await DB.p('catatanSantri', { id: `izin_note_${per.id}`, sntId, tipe: 'perizinan', sumber: 'perizinan', sourcePerizinanId: per.id, isi: `${per.tipeIzin}: ${per.alasan || '-'} (${tglMulai} s/d ${tglSelesai})`, tanggal: tglMulai, createdAt: now, updatedAt: now, oleh: S.user?.nama || '-', namaSantri: snt?.nama || '' });
      CS(); T('Perizinan disimpan.'); if (S.page === 'dash') await App.dash(); return;
    }

    if (type === 'sakit') {
      const tglMulai = document.getElementById('qnote-start')?.value || todayLocal();
      const diagnosis = document.getElementById('qnote-title')?.value.trim();
      if (!diagnosis) { T('Diagnosis/keluhan wajib diisi.'); return; }
      const rec = {
        id: `sakit_${sntId}_${now}`,
        sntId,
        tglMulai,
        diagnosis,
        penanganan: document.getElementById('qnote-isi')?.value.trim() || null,
        lampiran: null,
        status: 'belum_sembuh',
        sembuhAt: null,
        sembuhOleh: null,
        caraBerakhir: null,
        createdBy: S.user?.nama || '-',
        createdAt: now,
        updatedAt: now,
        sumber: 'dashboard_quick_note'
      };
      await DB.p('catatanSakit', rec);
      if (App._terapkanSakitKeAbsensi) await App._terapkanSakitKeAbsensi(rec);
      await DB.p('catatanSantri', { id: `sakit_note_${rec.id}`, sntId, tipe: 'sakit', sumber: 'catatanSakit', sourceSakitId: rec.id, isi: `${diagnosis}${rec.penanganan ? `\nPenanganan: ${rec.penanganan}` : ''}`, tanggal: tglMulai, createdAt: now, updatedAt: now, oleh: S.user?.nama || '-', namaSantri: snt?.nama || '' });
      CS(); T('Catatan sakit disimpan.'); if (S.page === 'dash') await App.dash(); return;
    }

    if (type === 'keuangan_tagihan') {
      const amount = Number(document.getElementById('qnote-amount')?.value || 0);
      if (amount <= 0) { T('Jumlah tagihan harus lebih dari 0.'); return; }
      const bill = {
        id: newId(),
        sntId,
        periode: document.getElementById('qnote-period')?.value || todayLocal().slice(0, 7),
        jenis: document.getElementById('qnote-title')?.value.trim() || 'Tagihan',
        jumlah: amount,
        jatuhTempo: document.getElementById('qnote-end')?.value || '',
        catatan: document.getElementById('qnote-isi')?.value.trim() || '',
        createdAt: now,
        updatedAt: now,
        oleh: S.user?.nama || '-',
        sumber: 'dashboard_quick_note'
      };
      await DB.p('financeBills', bill);
      await DB.p('catatanSantri', { id: `bill_note_${bill.id}`, sntId, tipe: 'keuangan', sumber: 'financeBills', sourceBillId: bill.id, isi: `${bill.jenis}: ${money(bill.jumlah)}${bill.catatan ? `\n${bill.catatan}` : ''}`, tanggal: todayLocal(), createdAt: now, updatedAt: now, oleh: S.user?.nama || '-', namaSantri: snt?.nama || '' });
      CS(); T('Tagihan disimpan.'); if (S.page === 'dash') await App.dash(); return;
    }

    if (type === 'psikologis' && typeof _needAdmin === 'function' && !_needAdmin()) return;
    const isi = document.getElementById('qnote-isi')?.value.trim();
    if (!isi) { T('Isi catatan wajib diisi.'); return; }
    await DB.p('catatanSantri', { id: newId(), sntId, tipe: type === 'catatan' ? 'umum' : type, isi, tanggal: todayLocal(), createdAt: now, updatedAt: now, oleh: S.user?.nama || '-', namaSantri: snt?.nama || '' });
    CS(); T('Catatan disimpan.'); if (S.page === 'profil') await App.renderProfil(sntId);
  };

  const prevDecorateDashboard = window.PesantrenkuPhase6?.decorateDashboard?.bind(window.PesantrenkuPhase6);
  if (window.PesantrenkuPhase6) {
    window.PesantrenkuPhase6.decorateDashboard = function () {
      if (prevDecorateDashboard) prevDecorateDashboard();
      const btn = document.getElementById('phase6-quick-note-btn');
      if (btn) btn.setAttribute('onclick', 'PesantrenkuPhase7.quickNoteSheet()');
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .phase7-sheet{padding-bottom:120px}.phase7-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.phase7-context{padding:10px 12px;margin-bottom:10px;border:1px solid rgba(13,181,127,.16);border-radius:var(--r3);background:var(--gs);font-size:11px;line-height:1.5;color:var(--t2)}.phase7-danger-full{width:100%;margin-top:8px;padding:13px;border-radius:100px;border:1px solid rgba(239,68,68,.26);background:rgba(239,68,68,.08);color:#dc2626;font-size:13px;font-weight:900}
    @media(max-width:520px){.phase7-two{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
})();

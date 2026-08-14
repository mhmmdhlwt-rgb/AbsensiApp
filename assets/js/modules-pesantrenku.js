'use strict';
(function(){
  const AppRef = window.App;
  const DBRef = window.DB;
  if(!AppRef || !DBRef){
    console.warn('[PesantrenkuModules] App/DB belum tersedia.');
    return;
  }

  const money = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const cleanNis = v => String(v || '').trim().replace(/^NIS[:#\s-]*/i,'').replace(/[^0-9A-Za-z._-]/g,'');
  const download = (name, html, mime) => {
    const blob = new Blob(['\uFEFF' + html], {type: mime || 'application/vnd.ms-excel;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  async function santriOptions(selected){
    const snt = (await DBRef.ga('santri')).filter(x => x.aktif !== false && !x.deleted)
      .sort((a,b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
    return snt.map(s => `<option value="${s.id}" ${s.id===selected?'selected':''}>${esc(s.nama || '-')} ${s.nis ? '- NIS ' + esc(s.nis) : ''}</option>`).join('');
  }

  const PesantrenkuModules = {
    async cekServer(){
      const box = document.getElementById('server-check-result');
      const set = msg => { if(box) box.innerHTML = msg; else T(msg.replace(/<[^>]+>/g,'')); };
      set('<div class="gc" style="padding:12px;font-size:12px;color:var(--t3)">Mengecek koneksi Firebase...</div>');
      try{
        if(!navigator.onLine) throw new Error('Browser offline');
        if(typeof _fbAuthReady === 'undefined' || typeof _fsDB === 'undefined' || typeof _fbNs === 'undefined'){
          throw new Error('Firebase belum siap di browser');
        }
        await _fbAuthReady;
        const ns = _fbNs();
        const snap = await _fsDB.collection('tenants').doc(ns).collection('settings').limit(1).get();
        set(`<div class="gc" style="padding:12px;font-size:12px;color:var(--a1);line-height:1.5"><strong>Server tersambung.</strong><br>Tenant: ${esc(ns)}<br>Firestore read OK: ${snap.size} dokumen sample.</div>`);
      }catch(e){
        set(`<div class="gc" style="padding:12px;font-size:12px;color:#ef4444;line-height:1.5"><strong>Server belum tersambung.</strong><br>${esc(e.message || e)}</div>`);
      }
    },

    async renderQR(){
      const el = document.getElementById('qr-body'); if(!el) return;
      el.innerHTML = `<div style="padding:0 15px 18px">
        <div class="qr-box" style="margin-bottom:12px">
          <div class="mc-title">Absensi QR Code</div>
          <div class="mc-sub">QR berisi NIS santri. Hasil scan dicatat lewat jalur absensi aktif yang sama dengan NFC.</div>
          <div class="module-actions">
            <button onclick="QRAbsensi.start()">Mulai Scan Kamera</button>
            <button onclick="QRAbsensi.stop()">Stop</button>
            <button onclick="QRAbsensi.manual()">Input NIS Manual</button>
          </div>
        </div>
        <div class="qr-box"><div id="qr-reader"></div><div id="qr-status" style="font-size:12px;color:var(--t3);margin-top:10px">Scanner belum aktif.</div></div>
        <div id="qr-log" style="margin-top:12px"></div>
      </div>`;
      QRAbsensi.renderLog();
    },

    async renderAkademik(){
      const [rec, snt] = await Promise.all([DBRef.ga('academicRecords').catch(()=>[]), DBRef.ga('santri')]);
      const sntM = mapBy(snt, 'id');
      const rows = rec.filter(x => !x.deleted).sort((a,b) => (b.tanggal||'').localeCompare(a.tanggal||'') || (b.createdAt||0)-(a.createdAt||0)).slice(0,80);
      const byType = {}; rec.filter(x=>!x.deleted).forEach(r => { byType[r.jenis || 'Lainnya'] = (byType[r.jenis || 'Lainnya'] || 0) + 1; });
      document.getElementById('akd-body').innerHTML = `<div style="padding:0 15px 18px">
        <div class="module-grid" style="margin-bottom:12px">
          <div class="module-card"><div class="mc-title">Catatan Akademik</div><div class="mc-sub">Sorogan, Al-Quran, Yanbua, Diniyah, dan ekstrakurikuler.</div><div class="mc-num">${rec.filter(x=>!x.deleted).length}</div></div>
          <div class="module-card"><div class="mc-title">Jenis Terisi</div><div class="mc-sub">${Object.keys(byType).join(', ') || 'Belum ada data'}</div><div class="mc-num">${Object.keys(byType).length}</div></div>
        </div>
        <div class="module-actions" style="margin-bottom:12px"><button onclick="PesantrenkuModules.akdForm()">Tambah Catatan</button><button onclick="PesantrenkuModules.exportAkd()">Export Excel</button></div>
        <div class="gc" style="padding:10px;overflow:auto"><table class="table-lite"><thead><tr><th>Tanggal</th><th>Santri</th><th>Program</th><th>Capaian</th><th>Aksi</th></tr></thead><tbody>
          ${rows.length ? rows.map(r => `<tr><td>${esc(r.tanggal||'-')}</td><td>${esc(sntM[r.sntId]?.nama||'-')}</td><td>${esc(r.jenis||'-')}</td><td>${esc(r.capaian||r.status||'-')}<div style="color:var(--t3);font-size:10px">${esc(r.catatan||'')}</div></td><td><button class="mini-btn" onclick="PesantrenkuModules.akdForm('${r.id}')">Edit</button></td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:18px">Belum ada catatan akademik.</td></tr>'}
        </tbody></table></div>
      </div>`;
    },
    async akdForm(id){
      const r = id ? await DBRef.g('academicRecords', id) : {};
      OS(`<div class="sh">${id?'Edit':'Tambah'} Catatan Akademik</div><div class="sb" style="padding-bottom:90px">
        <div class="fg"><label class="fl">Santri</label><select class="fsel" id="akd-snt">${await santriOptions(r?.sntId)}</select></div>
        <div class="fg"><label class="fl">Program</label><select class="fsel" id="akd-jenis">${['Sorogan','Al-Quran','Yanbua','Diniyah','Ekstrakurikuler'].map(x=>`<option ${r?.jenis===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="fg"><label class="fl">Tanggal</label><input class="fi" id="akd-tgl" type="date" value="${esc(r?.tanggal||_todayLocal())}"></div>
        <div class="fg"><label class="fl">Capaian / Nilai</label><input class="fi" id="akd-cap" value="${esc(r?.capaian||'')}"></div>
        <div class="fg"><label class="fl">Guru</label><input class="fi" id="akd-guru" value="${esc(r?.guru||'')}"></div>
        <div class="fg"><label class="fl">Catatan</label><textarea class="fi" id="akd-cat" style="height:90px;resize:none">${esc(r?.catatan||'')}</textarea></div>
        <button class="bg2 bw" onclick="PesantrenkuModules.saveAkd('${id||''}')">Simpan</button>
        ${id?`<button class="bg2 bw" style="margin-top:8px;background:#ef4444" onclick="PesantrenkuModules.delAkd('${id}')">Hapus</button>`:''}
      </div>`);
    },
    async saveAkd(id){
      const old = id ? await DBRef.g('academicRecords', id) : null;
      const now = Date.now();
      await DBRef.p('academicRecords', {id:id||uid(), sntId:document.getElementById('akd-snt').value, jenis:document.getElementById('akd-jenis').value, tanggal:document.getElementById('akd-tgl').value||_todayLocal(), capaian:document.getElementById('akd-cap').value.trim(), guru:document.getElementById('akd-guru').value.trim(), catatan:document.getElementById('akd-cat').value.trim(), createdAt:old?.createdAt||now, updatedAt:now, oleh:S.user?.nama||'-'});
      CS(); T('Catatan akademik disimpan.'); await this.renderAkademik();
    },
    async delAkd(id){ if(!_needAdmin()) return; await DBRef.d('academicRecords', id); CS(); T('Catatan dihapus.'); await this.renderAkademik(); },
    async exportAkd(){
      const [rec, snt] = await Promise.all([DBRef.ga('academicRecords'), DBRef.ga('santri')]);
      const sntM = mapBy(snt, 'id');
      const rows = rec.filter(x=>!x.deleted).map(r => `<tr><td>${esc(r.tanggal)}</td><td>${esc(sntM[r.sntId]?.nama||'-')}</td><td>${esc(r.jenis)}</td><td>${esc(r.capaian||'')}</td><td>${esc(r.guru||'')}</td><td>${esc(r.catatan||'')}</td></tr>`).join('');
      download('pesantrenku-akademik.xls', `<table><tr><th>Tanggal</th><th>Santri</th><th>Program</th><th>Capaian</th><th>Guru</th><th>Catatan</th></tr>${rows}</table>`);
    },

    async renderKeuangan(){
      const [bills, pay, snt] = await Promise.all([DBRef.ga('financeBills').catch(()=>[]), DBRef.ga('financePayments').catch(()=>[]), DBRef.ga('santri')]);
      const sntM = mapBy(snt, 'id'), paid = {};
      pay.filter(x=>!x.deleted).forEach(p => { paid[p.billId] = (paid[p.billId] || 0) + Number(p.jumlah || 0); });
      const active = bills.filter(x=>!x.deleted).sort((a,b)=>(b.periode||'').localeCompare(a.periode||''));
      const total = active.reduce((a,b)=>a+Number(b.jumlah||0),0), bayar = Object.values(paid).reduce((a,b)=>a+b,0);
      document.getElementById('keu-body').innerHTML = `<div style="padding:0 15px 18px">
        <div class="module-grid" style="margin-bottom:12px">
          <div class="module-card"><div class="mc-title">Total Tagihan</div><div class="mc-sub">Semua tagihan aktif</div><div class="mc-num" style="font-size:22px">${money(total)}</div></div>
          <div class="module-card"><div class="mc-title">Terbayar</div><div class="mc-sub">Pembayaran tercatat</div><div class="mc-num" style="font-size:22px">${money(bayar)}</div></div>
        </div>
        <div class="module-actions" style="margin-bottom:12px"><button onclick="PesantrenkuModules.billForm()">Tambah Tagihan</button><button onclick="PesantrenkuModules.payForm()">Catat Bayar</button><button onclick="PesantrenkuModules.exportKeu()">Export Excel</button></div>
        <div class="gc" style="padding:10px;overflow:auto"><table class="table-lite"><thead><tr><th>Periode</th><th>Santri</th><th>Tagihan</th><th>Bayar</th><th>Sisa</th><th>Aksi</th></tr></thead><tbody>
          ${active.length ? active.map(b => { const p=paid[b.id]||0, sisa=Number(b.jumlah||0)-p; return `<tr><td>${esc(b.periode||'-')}</td><td>${esc(sntM[b.sntId]?.nama||'-')}</td><td>${money(b.jumlah)}</td><td>${money(p)}</td><td style="font-weight:800;color:${sisa>0?'#ef4444':'var(--a1)'}">${money(sisa)}</td><td><button class="mini-btn" onclick="PesantrenkuModules.billForm('${b.id}')">Edit</button></td></tr>`; }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:18px">Belum ada tagihan.</td></tr>'}
        </tbody></table></div>
      </div>`;
    },
    async billForm(id){
      const b = id ? await DBRef.g('financeBills', id) : {};
      OS(`<div class="sh">${id?'Edit':'Tambah'} Tagihan</div><div class="sb" style="padding-bottom:90px">
        <div class="fg"><label class="fl">Santri</label><select class="fsel" id="keu-snt">${await santriOptions(b?.sntId)}</select></div>
        <div class="fg"><label class="fl">Periode</label><input class="fi" id="keu-per" type="month" value="${esc(b?.periode||_todayLocal().slice(0,7))}"></div>
        <div class="fg"><label class="fl">Jenis Tagihan</label><input class="fi" id="keu-jenis" value="${esc(b?.jenis||'SPP')}"></div>
        <div class="fg"><label class="fl">Jumlah</label><input class="fi" id="keu-jml" type="number" value="${esc(b?.jumlah||'')}"></div>
        <div class="fg"><label class="fl">Jatuh Tempo</label><input class="fi" id="keu-due" type="date" value="${esc(b?.jatuhTempo||'')}"></div>
        <div class="fg"><label class="fl">Catatan</label><textarea class="fi" id="keu-cat" style="height:80px;resize:none">${esc(b?.catatan||'')}</textarea></div>
        <button class="bg2 bw" onclick="PesantrenkuModules.saveBill('${id||''}')">Simpan</button>
        ${id?`<button class="bg2 bw" style="margin-top:8px;background:#ef4444" onclick="PesantrenkuModules.delBill('${id}')">Hapus</button>`:''}
      </div>`);
    },
    async saveBill(id){
      const old = id ? await DBRef.g('financeBills', id) : null;
      const now = Date.now();
      await DBRef.p('financeBills', {id:id||uid(), sntId:document.getElementById('keu-snt').value, periode:document.getElementById('keu-per').value, jenis:document.getElementById('keu-jenis').value.trim(), jumlah:Number(document.getElementById('keu-jml').value||0), jatuhTempo:document.getElementById('keu-due').value, catatan:document.getElementById('keu-cat').value.trim(), createdAt:old?.createdAt||now, updatedAt:now, oleh:S.user?.nama||'-'});
      CS(); T('Tagihan disimpan.'); await this.renderKeuangan();
    },
    async delBill(id){ if(!_needAdmin()) return; await DBRef.d('financeBills', id); CS(); T('Tagihan dihapus.'); await this.renderKeuangan(); },
    async payForm(){
      const [bills, snt] = await Promise.all([DBRef.ga('financeBills'), DBRef.ga('santri')]);
      const sntM = mapBy(snt, 'id');
      const opts = bills.filter(x=>!x.deleted).map(b => `<option value="${b.id}">${esc(sntM[b.sntId]?.nama||'-')} - ${esc(b.jenis||'Tagihan')} - ${esc(b.periode||'-')}</option>`).join('');
      OS(`<div class="sh">Catat Pembayaran</div><div class="sb" style="padding-bottom:80px">
        <div class="fg"><label class="fl">Tagihan</label><select class="fsel" id="pay-bill">${opts}</select></div>
        <div class="fg"><label class="fl">Tanggal Bayar</label><input class="fi" id="pay-tgl" type="date" value="${_todayLocal()}"></div>
        <div class="fg"><label class="fl">Jumlah Bayar</label><input class="fi" id="pay-jml" type="number"></div>
        <div class="fg"><label class="fl">Metode</label><input class="fi" id="pay-met" value="Tunai"></div>
        <button class="bg2 bw" onclick="PesantrenkuModules.savePay()">Simpan Pembayaran</button>
      </div>`);
    },
    async savePay(){
      const billId = document.getElementById('pay-bill').value;
      if(!billId){ T('Tidak ada tagihan.'); return; }
      const b = await DBRef.g('financeBills', billId);
      await DBRef.p('financePayments', {id:uid(), billId, sntId:b?.sntId||'', tanggal:document.getElementById('pay-tgl').value||_todayLocal(), jumlah:Number(document.getElementById('pay-jml').value||0), metode:document.getElementById('pay-met').value.trim(), createdAt:Date.now(), updatedAt:Date.now(), oleh:S.user?.nama||'-'});
      CS(); T('Pembayaran disimpan.'); await this.renderKeuangan();
    },
    async exportKeu(){
      const [bills, pay, snt] = await Promise.all([DBRef.ga('financeBills'), DBRef.ga('financePayments'), DBRef.ga('santri')]);
      const sntM = mapBy(snt, 'id'), paid = {};
      pay.filter(x=>!x.deleted).forEach(p => { paid[p.billId] = (paid[p.billId] || 0) + Number(p.jumlah || 0); });
      const rows = bills.filter(x=>!x.deleted).map(b => `<tr><td>${esc(b.periode)}</td><td>${esc(sntM[b.sntId]?.nama||'-')}</td><td>${esc(b.jenis)}</td><td>${b.jumlah||0}</td><td>${paid[b.id]||0}</td><td>${Number(b.jumlah||0)-(paid[b.id]||0)}</td><td>${esc(b.jatuhTempo||'')}</td><td>${esc(b.catatan||'')}</td></tr>`).join('');
      download('pesantrenku-keuangan.xls', `<table><tr><th>Periode</th><th>Santri</th><th>Jenis</th><th>Tagihan</th><th>Bayar</th><th>Sisa</th><th>Jatuh Tempo</th><th>Catatan</th></tr>${rows}</table>`);
    }
  };

  const QRAbsensi = {
    _scanner:null, _busy:false, _last:'',
    async start(){
      const status = document.getElementById('qr-status');
      if(!window.Html5Qrcode){ if(status) status.textContent = 'Library scanner belum termuat. Coba refresh halaman.'; return; }
      if(this._scanner) await this.stop();
      this._scanner = new Html5Qrcode('qr-reader');
      if(status) status.textContent = 'Meminta izin kamera...';
      try{
        await this._scanner.start({facingMode:'environment'}, {fps:12, qrbox:{width:240,height:240}}, txt => this.handle(txt), () => {});
        if(status) status.textContent = 'Scanner aktif. Arahkan kamera ke QR berisi NIS.';
      }catch(e){
        if(status) status.textContent = 'Gagal membuka kamera: ' + (e.message || e);
        T('Gagal membuka kamera.');
      }
    },
    async stop(){
      if(this._scanner){ try{ await this._scanner.stop(); await this._scanner.clear(); }catch(e){} }
      this._scanner = null;
      const status = document.getElementById('qr-status'); if(status) status.textContent = 'Scanner berhenti.';
    },
    manual(){
      OS(`<div class="sh">Input NIS Manual</div><div class="sb"><div class="fg"><label class="fl">NIS</label><input class="fi" id="qr-manual-nis" autofocus></div><button class="bg2 bw" onclick="QRAbsensi.handle(document.getElementById('qr-manual-nis').value);CS()">Catat Hadir</button></div>`);
    },
    async handle(raw){
      const nis = cleanNis(raw);
      if(!nis || this._busy || this._last === nis) return;
      this._busy = true; this._last = nis; setTimeout(()=>{ this._last=''; }, 2500);
      const status = document.getElementById('qr-status');
      try{
        const snt = await DBRef.ga('santri');
        const santri = snt.find(s => String(s.nis || '').trim().toLowerCase() === nis.toLowerCase());
        if(!santri){ SFX.notFound?.(); if(status) status.textContent = 'NIS tidak ditemukan: ' + nis; T('NIS tidak ditemukan: ' + nis); return; }
        if(status) status.textContent = 'Memproses ' + santri.nama + '...';
        await NFC._recordAttendanceForActiveActivity(santri);
        await DBRef.p('qrScanLogs', {id:uid(), nis, sntId:santri.id, nama:santri.nama, tanggal:_todayLocal(), createdAt:Date.now(), oleh:S.user?.nama||'-'});
        await this.renderLog();
      }catch(e){
        console.warn('[QR] scan error:', e);
        if(status) status.textContent = 'Gagal mencatat QR: ' + (e.message || e);
        T('Gagal mencatat QR.');
      }finally{
        this._busy = false;
      }
    },
    async renderLog(){
      const el = document.getElementById('qr-log'); if(!el) return;
      const logs = (await DBRef.ga('qrScanLogs').catch(()=>[])).filter(x=>!x.deleted).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,12);
      el.innerHTML = `<div class="gc" style="padding:12px"><div class="mc-title">Scan Terakhir</div>${logs.length ? logs.map(l => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--dv)"><div><div style="font-size:12px;font-weight:800;color:var(--t1)">${esc(l.nama||'-')}</div><div style="font-size:10px;color:var(--t3)">NIS ${esc(l.nis||'-')} - ${esc(l.oleh||'-')}</div></div><div style="font-size:10px;color:var(--t3)">${new Date(l.createdAt||Date.now()).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div></div>`).join('') : '<div style="font-size:12px;color:var(--t3);padding-top:8px">Belum ada scan.</div>'}</div>`;
    }
  };

  AppRef.renderQR = () => PesantrenkuModules.renderQR();
  AppRef.renderAkademik = () => PesantrenkuModules.renderAkademik();
  AppRef.renderKeuangan = () => PesantrenkuModules.renderKeuangan();
  window.PesantrenkuModules = PesantrenkuModules;
  window.QRAbsensi = QRAbsensi;
})();

// js/app.js — AbsensiApp
'use strict';

const App={
  // ── FASE 2 AUDIT FIX: Empty state helper terpusat ──
  // Pakai di semua halaman yang mungkin menampilkan data kosong.
  // Konvensi: icon emoji (bisa pakai unicode escape), title bold, subtitle
  // penjelasan, dan optional action button.
  // Contoh pemakaian:
  //   App.renderEmpty('pel-body', '📋', 'Belum ada pelanggaran',
  //     'Pelanggaran akan muncul di sini saat santri ditandai alpha/terlambat.');
  renderEmpty(containerId, icon, title, subtitle, actionLabel, actionFn){
    const el = document.getElementById(containerId);
    if (!el) return;
    let html = `<div style="text-align:center;padding:50px 20px;color:var(--t3)">
      <div style="font-size:48px;margin-bottom:14px;opacity:.6">${icon||'📭'}</div>
      <div style="font-family:var(--fd);font-size:15px;font-weight:800;color:var(--t2);margin-bottom:6px">${title||'Belum ada data'}</div>
      <div style="font-size:12px;color:var(--t4);line-height:1.5;max-width:280px;margin:0 auto">${subtitle||''}</div>`;
    if (actionLabel && actionFn) {
      // Action harus didaftarkan global — pakai window.App._emptyAction_<id>
      const fnKey = '_emptyAction_' + containerId;
      window.App[fnKey] = actionFn;
      html += `<button onclick="App.${fnKey}()" style="margin-top:14px;padding:10px 18px;border-radius:100px;background:var(--gs);border:1.5px solid rgba(13,181,127,.25);font-size:12px;font-weight:700;color:var(--a1);cursor:pointer">${actionLabel}</button>`;
    }
    html += `</div>`;
    el.innerHTML = html;
  },
  // Helper serupa untuk error state (retry button)
  renderError(containerId, message, retryFn){
    const el = document.getElementById(containerId);
    if (!el) return;
    const fnKey = '_retryAction_' + containerId;
    window.App[fnKey] = retryFn || (() => location.reload());
    el.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--t3)">
      <div style="font-size:42px;margin-bottom:12px">⚠️</div>
      <div style="font-size:13px;font-weight:700;color:#ef4444;margin-bottom:6px">Gagal memuat data</div>
      <div style="font-size:11px;color:var(--t4);line-height:1.5;margin-bottom:14px">${message||'Periksa koneksi internet dan coba lagi.'}</div>
      <button onclick="App.${fnKey}()" style="padding:9px 18px;border-radius:100px;background:rgba(13,181,127,.1);border:1.5px solid rgba(13,181,127,.3);font-size:12px;font-weight:700;color:var(--a1);cursor:pointer">🔄 Coba lagi</button>
    </div>`;
  },
  // ── AUDIT v3: Refresh halaman aktif dari cloud (bypass cache) ──
  // Dipanggil oleh tombol Refresh di header. Invalidate cache untuk store
  // yang relevan dengan halaman aktif, lalu pull cloud + re-render.
  // AUDIT v3e: Long-press tombol Refresh → "Sync Semua" (pull semua store)
  _refreshLpTimer: null,
  _refreshLpStart(){
    clearTimeout(this._refreshLpTimer);
    this._refreshLpTimer = setTimeout(() => { this._refreshLongPress(); }, 700);
  },
  _refreshLpCancel(){ clearTimeout(this._refreshLpTimer); },
  _refreshLongPress(){
    // Long-press detected — tampilkan konfirmasi sync semua
    OS(`<div class="cw"><div class="ci3">🔄</div><div class="ct3">Sync Semua Data?</div>
      <div class="cs3">Tarik SEMUA data dari cloud. Gunakan ini jika data di device lain belum muncul di device ini (misal setelah import backup di device lain).</div>
      <div class="cbs"><button class="cc" onclick="CS()">Batal</button>
      <button class="co" style="background:var(--grad)" onclick="CS();App.refreshCurrentPage(true)">Sync Semua</button></div></div>`);
  },
  async refreshCurrentPage(forceAll=false) {
    if (!navigator.onLine) {
      if (window.T) T('⚠️ Sedang offline. Tidak bisa memuat ulang dari cloud.', 3000);
      return;
    }
    // Animasi rotate pada tombol refresh
    const btn = document.getElementById('refresh-btn');
    if (btn) {
      btn.style.animation = 'spin 0.8s linear';
      setTimeout(() => { btn.style.animation = ''; }, 800);
    }
    if (window.T) T('🔄 Memuat ulang data...', 1500);
    const pg = S.page;
    // AUDIT v3e: Jika forceAll, pull SEMUA store (untuk sync setelah import di device lain)
    if (forceAll) {
      if (window.T) T('⏳ Sync semua data dari cloud... jangan tutup aplikasi.', 5000);
      try {
        await FBSync.pullAll();
        // Re-render halaman aktif
        const renderMap = {
          dash: () => this.dash(),
          kg:   () => this.renderKg(),
          snt:  () => this.renderSnt(),
          rek:  () => this.renderRek(),
          pel:  () => this.renderPel(),
          izn:  () => this.renderIzn(),
          set:  () => this.renderSet(),
        };
        const fn = renderMap[pg];
        if (fn) await fn();
        if (window.T) T('✅ Semua data tersinkron!', 3000);
      } catch(e) {
        console.warn('[Sync All] error:', e);
        if (window.T) T('❌ Gagal sync: ' + (e.message||e), 4000);
      }
      return;
    }
    // Mapping halaman → store yang ditampilkan (sinkron dengan NAV_PULL di FBSync)
    const PAGE_STORES = {
      // AUDIT v3l: Hanya list store on-demand (bukan realtime) untuk pull
      // Store realtime (absensi, sesi, settings, anggota, perizinan, pelanggaran,
      // uzur, catatanSakit) sudah di-handle oleh onSnapshot.
      dash: ['kegiatan','subKeg','kalam'],
      kg:   ['kegiatan','subKeg'],
      kgd:  ['kegiatan','subKeg'],
      sub:  ['subKeg','santri'],
      abs:  ['santri','kegiatan','subKeg'],
      snt:  ['santri','kamar'],
      sntd: ['santri','catatanSantri'],
      profil: ['santri','catatanSantri'],
      rek:  ['santri','kegiatan','subKeg'],
      set:  ['users','kalam'],
      pel:  ['santri','peraturan','kegiatan','subKeg'],
      izn:  ['santri'],
    };
    const stores = PAGE_STORES[pg] || [];
    // Force invalidate semua cache (simpler, more reliable)
    if (FBSync._invalidateCache) FBSync._invalidateCache();
    // Pull cloud untuk halaman aktif (re-pull meski baru saja di-pull)
    try {
      if (pg && stores.length) {
        // Filter out realtime stores (tidak perlu di-pull, sudah realtime)
        const toPull = stores.filter(s => !['absensi','sesi'].includes(s));
        if (toPull.length) await FBSync.pull(toPull);
      }
      // Re-render halaman aktif
      const renderMap = {
        dash: () => this.dash(),
        kg:   () => this.renderKg(),
        kgd:  () => { const id=S._opts?.id; if(id) this.renderKgd(id); },
        sub:  () => { const id=S._opts?.id; if(id) this.renderSub(id); },
        abs:  () => { if(S._sesiId) this.renderAbs(S._sesiId, S._skId); },
        snt:  () => this.renderSnt(),
        sntd: () => { const id=S._opts?.id; if(id) this.renderProfil(id); },
        profil: () => { const id=S._opts?.id; if(id) this.renderProfil(id); },
        rek:  () => this.renderRek(),
        set:  () => this.renderSet(),
        pel:  () => this.renderPel(),
        izn:  () => this.renderIzn(),
      };
      const fn = renderMap[pg];
      if (fn) {
        await fn();
        if (window.T) T('✅ Data diperbarui', 1500);
      }
    } catch(e) {
      console.warn('[Refresh] error:', e);
      if (window.T) T('❌ Gagal memuat ulang: ' + (e.message||e), 3000);
    }
  },
  loginUser(uid){
    DB.g('settings','jenis_kelamin').then(jkSet=>{
      const sbt=(jkSet?.value||'perempuan')==='laki'?'Musyrif':'Musyrifah';
      PIN.show('Masukkan PIN','Login '+sbt,'v',uid,async(ok,user)=>{if(ok){S.user=user;await this._enter()}});
    });
  },
  async _enter(){
    await _dailyReset();
    await _applyAsramaName();
    _setupPushNotif('musyrifah').catch(()=>{});
    document.getElementById('ls').classList.add('hide');
    setTimeout(()=>document.getElementById('ls').style.display='none',500);
    document.getElementById('main-app').style.display='block';
    const ub=document.getElementById('ub');
    if(ub){
      if(S.user?.foto){
        ub.innerHTML=`<img src="${S.user.foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
      } else {
        ub.textContent=S.user.nama.charAt(0);
      }
    }
    // ── AUDIT v3: OFFLINE-FIRST — JANGAN block login dengan pullAll ──
    // Sebelumnya: _enter() menampilkan overlay "Menyinkronkan data..." dan
    // await pullAll() — ini bikin user nunggu 5-15 detik sebelum bisa interaksi.
    // Sekarang: render UI dari IndexedDB (instant), lalu sync cloud di background.
    // User bisa langsung lihat dashboard, meski datanya mungkin sedikit stale
    // untuk beberapa detik pertama. Setelah sync selesai, dashboard auto-refresh.
    S.stack=[];await this.nav('dash');
    // Start listeners (realtime untuk absensi & sesi) di background
    if (navigator.onLine) {
      // Pull semua store di background — TANPA overlay blocking
      // pakai cache 5 menit supaya kalau user baru logout-login cepat, tidak re-fetch
      FBSync.pullAll().then(() => {
        // Setelah sync cloud selesai, re-render halaman aktif supaya
        // data terbaru tampil (hanya jika user masih di halaman tsb)
        if (S.page === 'dash') {
          try { App.dash(); } catch(e) {}
        }
      }).catch(e => {
        console.warn('[Login] background pullAll error:', e.message);
      });
    }
  },
  userMenu(){
    const avHtml=S.user?.foto
      ?`<img src="${S.user.foto}" style="width:50px;height:50px;border-radius:50%;object-fit:cover">`
      :`<div style="width:50px;height:50px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;font-family:var(--fd)">${S.user?S.user.nama.charAt(0):'?'}</div>`;
    OS(`<div class="sh">Pengguna Aktif</div><div class="sb" style="padding-bottom:70px"><div style="display:flex;align-items:center;gap:11px;padding:12px 0;margin-bottom:12px">${avHtml}<div><div style="font-weight:700;font-size:15px;color:var(--t1)">${S.user?.nama||'-'}</div><div style="font-size:11px;color:var(--t3)">${S.user?.role||'-'}</div></div></div><button class="bg2 bw" onclick="CS();App.logout()">Keluar / Ganti Pengguna</button></div>`);
  },
  async logout(){S.user=null;document.getElementById('main-app').style.display='none';const ls=document.getElementById('ls');ls.style.display='flex';ls.classList.remove('hide');await renderLogin()},

  // ── Keluar dari Pesantren/Asrama (bukan sekadar ganti pengguna) ──
  // Data di CLOUD tetap aman/tidak terhapus — hanya cache lokal di device
  // ini yang dibersihkan, supaya device siap dipakai utk pesantren lain.
  logoutTenant(){
    const nama=localStorage.getItem('tenant_nama')||'pesantren ini';
    OS(`<div class="cw"><div class="ci3">\uD83D\uDEAA</div><div class="ct3">Keluar dari ${esc(nama)}?</div>
      <div class="cs3">Data lokal di device ini akan dibersihkan. Data di cloud AMAN, tidak terhapus. Kamu akan diminta memilih pesantren lagi setelah ini.</div>
      <div class="cbs"><button class="cc" onclick="CS()">Batal</button>
      <button class="co" style="background:#ef4444" onclick="App._doLogoutTenant()">Keluar</button></div></div>`);
  },
  async _doLogoutTenant(){
    T('\u23F3 Membersihkan data lokal...');
    try{
      const stores=['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','users','kamar','catatanSantri','pelanggaran','peraturan','settings','kalam','perizinan','uzur','catatanSakit'];
      for(const s of stores)await DB.cl(s);
    }catch(e){}
    localStorage.removeItem('tenant_ns');
    localStorage.removeItem('tenant_nama');
    localStorage.removeItem('tenant_tipe');
    localStorage.removeItem('chat_msgs');
    localStorage.removeItem('chat_last_seen');
    location.reload();
  },

  async nav(pg,opts={}){
    const asrama=(await DB.g('settings','asrama'))?.value||'Assalam';
    const pm={dash:'pg-dash',kg:'pg-kg',kgd:'pg-kgd',sub:'pg-sub',abs:'pg-abs',snt:'pg-snt',sntd:'pg-sntd',rek:'pg-rek',set:'pg-set',pel:'pg-pel',izn:'pg-izn',profil:'pg-profil'};
    Object.values(pm).forEach(id=>document.getElementById(id)?.classList.remove('on'));
    document.getElementById(pm[pg])?.classList.add('on');
    const roots=['dash','kg','snt','rek','set','pel','izn'];
    document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
    const rp=roots.includes(pg)?pg:['kgd','sub','abs'].includes(pg)?'kg':pg==='sntd'||pg==='profil'?'snt':'dash';
    document.querySelector(`.ni[data-p="${rp}"]`)?.classList.add('on');
    document.getElementById('back-btn').style.display=roots.includes(pg)?'none':'flex';
    const searchBtn=document.getElementById('search-btn');if(searchBtn)searchBtn.style.display='none';
    const tit={dash:S._appName||'Asrama '+asrama,kg:'Kegiatan',kgd:opts.t||'Kegiatan',sub:opts.t||'Sub Kegiatan',abs:opts.t||'Absensi',snt:'Santri',sntd:opts.t||'Santri',rek:'Rekap',set:'Pengaturan',pel:'Pelanggaran',izn:'Perizinan',profil:opts.t||'Profil Santri'};
    document.getElementById('pt').textContent=tit[pg]||pg;
    document.getElementById('ps').textContent=opts.s||'';
    S.page=pg;S._opts=opts;
    if(!roots.includes(pg))S.stack.push({pg,opts});
    if(pg==='dash')await this.dash();
    else if(pg==='kg')await this.renderKg();
    else if(pg==='kgd')await this.renderKgd(opts.id);
    else if(pg==='sub')await this.renderSub(opts.id);
    else if(pg==='abs')await this.renderAbs(opts.sid,opts.skId);
    else if(pg==='snt')await this.renderSnt();
    else if(pg==='sntd')await this.renderSntd(opts.id);
    else if(pg==='profil')await this.renderProfil(opts.id);
    else if(pg==='rek')await this.renderRek();
    else if(pg==='set')await this.renderSet();
    else if(pg==='pel')await this.renderPel();
    else if(pg==='izn')await this.renderIzn();
  },
  back(){
    // Selalu kembali ke root page (tab awal) halaman tersebut — konsisten
    S.stack=[];
    const rootMap={kgd:'kg',sub:'kg',abs:'kg',sntd:'snt',profil:'snt'};
    const root=rootMap[S.page]||'dash';
    this.nav(root);
  },

  // AUDIT v3g: Dashboard data cache — hindari baca 10 store ulang setiap render
  // Cache TTL 15 detik. Jika dashboard di-render ulang dalam 15 detik (mis. dari
  // _scheduleReRender), pakai cache. Invalidate saat ada perubahan absensi/sesi
  // (sudah di-handle oleh onSnapshot yang invalidate DB cache).
  _dashCache: null,
  _dashCacheTs: 0,
  _DASH_CACHE_TTL: 15000, // 15 detik
  async dash(){
    // Cek cache dulu
    const now = Date.now();
    if (this._dashCache && (now - this._dashCacheTs) < this._DASH_CACHE_TTL) {
      const c = this._dashCache;
      // Pakai cache, tapi tetap jalankan side-effects (auto-lock, badge, reminder)
      this._updateIznBadge();
      this._cekReminderTelatIzin();
      this._autoLockExpiredSesi();
      this._checkUzurReminders().catch(e=>console.warn('[Uzur] reminder error:',e));
      // Render pakai data cache
      return this._renderDash(c.snt, c.ses, c.abs, c.kg, c.sk, c.kalamList, c.per, c.pel, c.uzurAll, c.sakitAllDash);
    }
    const [snt,ses,abs,kg,sk,kalamList,per,pel,uzurAll,sakitAllDash]=await Promise.all([DB.ga('santri'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('kegiatan'),DB.ga('subKeg'),DB.ga('kalam'),DB.ga('perizinan'),DB.ga('pelanggaran'),DB.ga('uzur').catch(()=>[]),DB.ga('catatanSakit').catch(()=>[])]);
    // Simpan ke cache
    this._dashCache = { snt, ses, abs, kg, sk, kalamList, per, pel, uzurAll, sakitAllDash };
    this._dashCacheTs = now;
    this._updateIznBadge();
    this._cekReminderTelatIzin();
    this._autoLockExpiredSesi();
    // Monitoring otomatis uzur (hari ke-7 reminder, hari ke-15 auto-off)
    this._checkUzurReminders().catch(e=>console.warn('[Uzur] reminder error:',e));
    return this._renderDash(snt, ses, abs, kg, sk, kalamList, per, pel, uzurAll, sakitAllDash);
  },
  // AUDIT v3g: Render logic dipisah dari data fetch supaya bisa pakai cache
  async _renderDash(snt, ses, abs, kg, sk, kalamList, per, pel, uzurAll, sakitAllDash) {
    const todayKalam=_kalamOfDay(kalamList);
    const today=_todayLocal();
    // Status pondok hari ini (di-1x di sini, dipakai beberapa kali di template)
    // Izin dianggap membawa santri keluar selama belum ditandai sudahKembali — TERMASUK yang terlambat (tglSelesai < today)
    const sedangIzin=per.filter(p=>p.status==='disetujui'&&!p.sudahKembali&&p.tglMulai<=today);
    const tidakDiPondokIds=new Set(sedangIzin.filter(p=>!this._isSakitAsrama(p)).map(p=>p.sntId));
    // Sakit hari ini: pakai catatanSakit store (sumber utama) +
    // fallback perizinan sakit-asrama lama. Kalau sudah sembuh -> tidak dihitung.
    const sakitHariIniLegacy=per.filter(p=>this._isSakitIzin(p)&&p.status==='disetujui'&&p.tglMulai<=today&&p.tglSelesai>=today&&p.sakitStatus!=='sembuh');
    const sakitHariIniNew=(sakitAllDash||[]).filter(s=>s.status==='belum_sembuh'&&s.tglMulai<=today);
    // Gabung, dedup by sntId (catatanSakit baru lebih dipriority)
    const sakitIds=new Set();
    sakitHariIniLegacy.forEach(p=>sakitIds.add(p.sntId));
    sakitHariIniNew.forEach(s=>sakitIds.add(s.sntId));
    const sakitHariIni=[...sakitIds].map(id=>sakitHariIniNew.find(s=>s.sntId===id)||sakitHariIniLegacy.find(p=>p.sntId===id));
    const pelBelumCount=pel.filter(p=>p.status==='belum').length;
    const diPondokCount=snt.filter(x=>x.aktif&&!tidakDiPondokIds.has(x.id)).length;
    const tidakDiPondokCount=snt.filter(x=>x.aktif&&tidakDiPondokIds.has(x.id)).length;
    const sakitCount=sakitHariIni.length;
    // Uzur aktif hari ini (semua santri yang sedang uzur)
    const uzurAktifList=(uzurAll||[]).filter(u=>u.aktif&&u.tglMulai<=today);
    const uzurCount=uzurAktifList.length;
    // Alpha hari ini: hitung santri yang ada absensi alpha di sesi hari ini
    const todaySes=ses.filter(x=>x.tanggal===today);
    const todayAbs=abs.filter(a=>todaySes.find(x=>x.id===a.sesiId));
    const alphaIds=new Set(todayAbs.filter(a=>a.status==='alpha').map(a=>a.sntId));
    const alphaCount=alphaIds.size;
    const h=new Date().getHours();
    const gr=h<5?'Jaga malam':h<10?"Assalamu'alaikum":h<15?'Selamat siang':h<18?'Selamat sore':'Selamat malam';
    const dn=['Ahad','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const mn=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const now=new Date();
    const asrama=(await DB.g('settings','asrama'))?.value||'Assalam';
    const aktif=snt.filter(x=>x.aktif).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
    const tses=ses.filter(x=>x.tanggal===today);
    const tabs=abs.filter(a=>tses.find(x=>x.id===a.sesiId));
    // Today counts for progress bar in hero
    const cntToday={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
    tabs.forEach(a=>{if(cntToday[a.status]!==undefined)cntToday[a.status]++});
    const tot=Object.values(cntToday).reduce((a,b)=>a+b,0);
    const pct=tot?Math.round(cntToday.hadir/tot*100):0;
    // Rekap kumulatif = hanya hari ini (reset tiap hari)
    const cnt={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
    tabs.forEach(a=>{if(cnt[a.status]!==undefined)cnt[a.status]++});
    const kgM=mapBy(kg,'id'),skM=mapBy(sk,'id');
    // Build rows: show all active kegiatan with their sub-kegiatan
    // Safety-net: filter out tombstoned items (deleted:true) yang mungkin
    // tertinggal di IndexedDB.
    const kgAktif=kg.filter(x=>x.aktif&&!x.deleted).sort((a,b)=>a.urutan-b.urutan);
    const rows=kgAktif.map(k=>{
      const kgSes=tses.filter(x=>x.kgId===k.id&&!x.skId);
      const allSubs=sk.filter(x=>x.kgId===k.id&&x.aktif&&!x.deleted).sort((a,b)=>a.urutan-b.urutan);
      // For each sub, find existing session or mark as "not started"
      const subRows=allSubs.map((skItem,idx2)=>{
        const ss=tses.find(x=>x.skId===skItem.id);
        const done=ss&&(ss.status==='selesai'||ss.locked);
        const sa=ss?abs.filter(a=>a.sesiId===ss.id):[];
        const h3=sa.filter(a=>a.status==='hadir').length,t3=sa.length;
        const p3=t3?Math.round(h3/t3*100):0;
        const isLast=idx2===allSubs.length-1;
        let subAbsenBtn='';
        if(ss?.locked){subAbsenBtn='<span class="lock-b" style="font-size:9px">Terkunci</span>'}
        else if(done){subAbsenBtn='<span class="done-b" style="font-size:9px">Selesai</span>'}
        else if(ss){subAbsenBtn=`<button type="button" onclick="App.nav('abs',{sid:'${ss.id}',skId:'${skItem.id}',t:'${escJ(skItem.nama)}',s:'${escJ(k.nama)}'})" style="padding:6px 13px;border-radius:100px;background:var(--grad);color:#fff;font-size:11px;font-weight:700;border:none;cursor:pointer;box-shadow:0 3px 10px rgba(13,181,127,.35);white-space:nowrap">Absen</button>`}
        else{subAbsenBtn=`<button type="button" onclick="App.qSubSesiDash('${skItem.id}','${k.id}')" style="padding:6px 13px;border-radius:100px;background:var(--grad);color:#fff;font-size:11px;font-weight:700;border:none;cursor:pointer;box-shadow:0 3px 10px rgba(13,181,127,.35);white-space:nowrap">Absen</button>`}
        const subProg=t3>0?`<div style="display:flex;align-items:center;gap:4px;margin-top:2px"><div style="flex:1;height:2px;background:var(--dv);border-radius:100px;overflow:hidden"><div style="width:${p3}%;height:100%;background:var(--grad)"></div></div><span style="font-size:9px;color:var(--t3)">${h3}/${t3}</span></div>`:'';
        return`<div style="display:flex;align-items:center;gap:9px;padding:8px 13px 8px 18px;border-bottom:${!isLast?'1px solid var(--dv)':'none'};background:rgba(13,181,127,.02)">
          <div style="width:5px;height:5px;border-radius:50%;background:var(--a1);flex-shrink:0;margin-top:1px"></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:12px;color:var(--t2)">${skItem.nama}</div>
            ${subProg}
          </div>
          ${subAbsenBtn}
        </div>`;
      }).join('');
      // Main kegiatan row
      let mainHtml='';
      // Always show main kegiatan row with Absen button
      {
        const sx=kgSes.length?kgSes[0]:null;
        const sa=sx?abs.filter(a=>a.sesiId===sx.id):[];
        const h2=sa.filter(a=>a.status==='hadir').length,t2=sa.length;
        const p2=t2?Math.round(h2/t2*100):0;
        const done=sx&&(sx.status==='selesai'||sx.locked);
        const locked=sx?.locked||false;
        // No Absen button on main row - only status indicator
        let absenBtn='';
        if(locked){absenBtn='<span class="lock-b" style="flex-shrink:0">Terkunci</span>'}
        else if(done){absenBtn='<span class="done-b" style="flex-shrink:0">Selesai</span>'}
        else{absenBtn='<span style="font-size:10px;color:var(--t4);flex-shrink:0">•••</span>'}
        const progBar=t2>0?`<div style="display:flex;align-items:center;gap:4px;margin-top:3px"><div style="flex:1;height:3px;background:var(--dv);border-radius:100px;overflow:hidden"><div style="width:${p2}%;height:100%;background:var(--grad)"></div></div><span style="font-size:9px;color:var(--t3)">${h2}/${t2}</span></div>`:'';
        mainHtml=`<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:${allSubs.length?'1px solid var(--dv)':'none'};cursor:pointer" onclick="App.nav('kgd',{id:'${k.id}',t:'${escJ(k.nama)}'})">
          <div style="width:40px;height:40px;border-radius:13px;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 4px 14px rgba(13,181,127,.25)">${k.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px;color:var(--t1)">${k.nama}</div>
            ${progBar}
          </div>
          ${absenBtn}
          <span style="font-size:12px;color:var(--t4);margin-left:4px">→</span>
        </div>`;
      }
      if(!mainHtml&&!allSubs.length) return'';
      return`<div class="gc" style="margin-bottom:7px;overflow:hidden">${mainHtml}${subRows}</div>`;
    }).filter(Boolean).join('');
    document.getElementById('d-body').innerHTML=`
      <div style="padding:0 15px 14px">
        <div style="margin-bottom:3px">
          <div style="font-size:11px;color:var(--t3)">${gr},</div>
          <div style="font-family:var(--fd);font-size:21px;font-weight:800;color:var(--t1);letter-spacing:-.5px">${S.user?.nama||'Admin'}</div>
          <div style="font-size:10px;color:var(--t3)">${dn[now.getDay()]}, ${now.getDate()} ${mn[now.getMonth()]} ${now.getFullYear()}</div>
        </div>
      </div>
      <div style="padding:0 15px 14px">
        <div class="hc"><div style="position:relative;z-index:1">
          <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px">Total Santri Aktif \u2014 ${S._appName||((tipe==='pondok'?'Pondok Pesantren':'Asrama')+' '+asrama)}</div>
          <div style="font-family:var(--fd);font-size:40px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:1;margin-bottom:10px">${aktif.length}</div>
          <div style="display:flex;gap:12px">
            <div><div style="font-family:var(--fd);font-size:18px;font-weight:800;color:#fff">${tses.length}</div><div style="font-size:9px;color:rgba(255,255,255,.6)">Kegiatan</div></div>
            <div><div style="font-family:var(--fd);font-size:18px;font-weight:800;color:#fff">${tses.filter(x=>x.status==='selesai').length}</div><div style="font-size:9px;color:rgba(255,255,255,.6)">Selesai</div></div>
            <div><div style="font-family:var(--fd);font-size:18px;font-weight:800;color:#fff">${pct}%</div><div style="font-size:9px;color:rgba(255,255,255,.6)">Kehadiran</div></div>
          </div>
        </div></div>
      </div>
      <div style="padding:0 15px 12px">
        <div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;padding:0 2px">Status Santri Hari Ini</div>
        <div class="sg" style="grid-template-columns:repeat(5,1fr);gap:6px">
          <div class="st2" onclick="App._popStatusPondok('di_pondok')"><div class="sn tg">${diPondokCount}</div><div class="sl">Di Pondok</div></div>
          <div class="st2" onclick="App._popStatusPondok('tidak_di_pondok')"><div class="sn" style="color:#f59e0b">${tidakDiPondokCount}</div><div class="sl">Tidak di Pondok</div></div>
          <div class="st2" onclick="App._popSakitHariIni()"><div class="sn" style="color:var(--cs)">${sakitCount}</div><div class="sl">Sakit</div></div>
          <div class="st2" onclick="App._popAlphaHariIni()"><div class="sn" style="color:var(--ca)">${alphaCount}</div><div class="sl">Alpha</div></div>
          <div class="st2" onclick="App._popUzurHariIni()"><div class="sn" style="color:var(--cu)">${uzurCount}</div><div class="sl">Uzur</div></div>
        </div>
      </div>
      ${todayKalam?`<div style="padding:0 15px 14px">
        <div class="gc" style="padding:16px 18px;position:relative">
          <div style="font-size:9px;font-weight:700;color:var(--a1);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;display:flex;align-items:center;gap:5px">${todayKalam.tipe==='hadist'?'\u{1F4D6}':'\u2728'} ${todayKalam.tipe==='hadist'?'Hadits Hari Ini':'Kalam Ulama Hari Ini'}</div>
          <div style="font-size:13.5px;line-height:1.55;color:var(--t1);font-style:italic;margin-bottom:8px">\u201C${todayKalam.teks}\u201D</div>
          <div style="font-size:11px;font-weight:700;color:var(--t3)">\u2014 ${todayKalam.author||'-'}</div>
        </div>
      </div>`:''}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 15px;margin-bottom:9px">
        <div style="font-family:var(--fd);font-size:14px;font-weight:800;color:var(--t1)">Kegiatan Hari Ini</div>

      </div>
      <div style="padding:0 15px 15px">
        ${rows||`<div class="gc" style="padding:18px;text-align:center"><div style="font-size:28px;margin-bottom:7px">&#x1F4C5;</div><div style="font-weight:700;font-size:13px;color:var(--t1);margin-bottom:5px">Belum ada kegiatan aktif</div><div style="font-size:11px;color:var(--t3)">Buka menu Kegiatan dan tambah kegiatan.</div></div>`}
      </div>
      <!-- FAB Share Laporan -->
      <div id="fab-share-overlay" onclick="App._closeFabShare()"></div>
      <div id="fab-share-menu">
        <div style="padding:12px 15px;background:var(--gs);font-size:10px;font-weight:800;color:var(--a1);text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid var(--dv)">Share Laporan</div>
        <div class="fab-item" onclick="App._closeFabShare();App._shareSantriHariIni()"><div class="fab-item-ic">📊</div><div><div>Data Santri Hari Ini</div><div style="font-size:9px;color:var(--t3);font-weight:500">Status pondok, sakit, alpha, pelanggaran</div></div></div>
        <div class="fab-item" onclick="App._closeFabShare();App._laporRekHarian()"><div class="fab-item-ic">📅</div><div><div>Rekap Absensi Harian</div><div style="font-size:9px;color:var(--t3);font-weight:500">Semua kegiatan hari ini</div></div></div>
        <div class="fab-item" onclick="App._closeFabShare();App._laporRekBulanan()"><div class="fab-item-ic">📆</div><div><div>Rekap Absensi Bulanan</div><div style="font-size:9px;color:var(--t3);font-weight:500">Bulan ini</div></div></div>
        <div class="fab-item" onclick="App._closeFabShare();App._laporPelHarian()"><div class="fab-item-ic">⚠️</div><div><div>Laporan Pelanggaran Harian</div><div style="font-size:9px;color:var(--t3);font-weight:500">Hari ini</div></div></div>
        <div class="fab-item" onclick="App._closeFabShare();App._laporPelBulanan()"><div class="fab-item-ic">📋</div><div><div>Rekap Pelanggaran Bulanan</div><div style="font-size:9px;color:var(--t3);font-weight:500">Bulan ini</div></div></div>
      </div>
      <button id="fab-share" onclick="App._toggleFabShare()" title="Share Laporan">📤</button>`;
  },

  _toggleFabShare(){
    const menu=document.getElementById('fab-share-menu');
    const overlay=document.getElementById('fab-share-overlay');
    if(!menu)return;
    const isOpen=menu.classList.contains('on');
    if(isOpen){
      menu.classList.remove('on');
      overlay?.classList.remove('on');
    } else {
      menu.classList.add('on');
      overlay?.classList.add('on');
    }
  },
  _closeFabShare(){
    document.getElementById('fab-share-menu')?.classList.remove('on');
    document.getElementById('fab-share-overlay')?.classList.remove('on');
  },
  async showStatPop(st){
    const today=_todayLocal();
    const [ses,abs,snt,kg]=await Promise.all([DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('kegiatan')]);
    const kgM=mapBy(kg,'id'),sntM=mapBy(snt,'id');
    const todaySes=ses.filter(x=>x.tanggal===today);
    const todayAbs=abs.filter(a=>todaySes.find(x=>x.id===a.sesiId));
    const groups={};
    todaySes.forEach(sx=>{
      const kgnm=(kgM[sx.kgId]?.nama)||'Lainnya';
      const list=todayAbs.filter(a=>a.sesiId===sx.id&&a.status===st).map(a=>sntM[a.sntId]).filter(Boolean);
      if(!list.length)return;
      if(!groups[kgnm])groups[kgnm]=[];
      list.forEach(x=>{if(x&&!groups[kgnm].find(g=>g.id===x.id))groups[kgnm].push(x)});
    });
    const lbs={hadir:'Hadir',alpha:'Alpha',izin:'Izin',sakit:'Sakit',terlambat:'Terlambat'};
    const tot=todayAbs.filter(a=>a.status===st).length;
    OS(`<div class="sh">${lbs[st]} Hari Ini (${tot}x)</div><div class="sb" style="padding-bottom:30px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Rekap absensi hari ini</div>
      ${Object.keys(groups).length?Object.entries(groups).map(([kgnm,list])=>`
        <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px;padding:0 2px">${kgnm} (${list.length} santri)</div>
        ${list.map(x=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dv)">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${x.nama.charAt(0)}</div>
          <div style="flex:1"><div style="font-weight:600;font-size:13px;color:var(--t1)">${x.nama}</div><div style="font-size:10px;color:var(--t3)">Kamar ${x.kamar}</div></div>
        </div>`).join('')}`).join('')
      :`<div class="empty" style="padding:20px 0"><div class="es">Tidak ada data.</div></div>`}
    </div>`);
  },
  async applyTmpl(){const n=await Tmpl.apply();T(n>0?`\u2705 ${n} sesi dibuat!`:'Semua sesi sudah ada.');await this.dash()},
  async qSesiDash(kgId){
    const today=_todayLocal();const sid='ses_'+today+'_'+kgId;
    let sx=await DB.g('sesi',sid);
    if(!sx){sx={id:sid,tanggal:today,kgId,skId:null,status:'draft',createdAt:Date.now(),locked:false};await DB.p('sesi',sx);
      const snt=(await DB.ga('santri')).filter(x=>x.aktif);
      const izinMap=await this._izinAktifMap(today);
      const sakitMap0=await this._sakitAktifMap(today);
      const k0=await DB.g('kegiatan',kgId);
      const isShalat0=_isShalatKegiatan(k0?.nama,null);
      const uzurMap0=isShalat0?await this._uzurAktifMap(today):{};
      for(const s of snt){
        let st='none',pid=null,oleh=S.user?.nama||'-';
        if(sakitMap0[s.id]){st='sakit';pid=null;oleh='Sistem (Catatan Sakit)';}
        else if(izinMap[s.id]){st='izin';pid=izinMap[s.id];oleh='Sistem (Perizinan)';}
        else if(isShalat0&&uzurMap0[s.id]){st='uzur';oleh='Sistem (Uzur)';}
        await DB.p('absensi',{id:absDetId(sid,s.id),sesiId:sid,sntId:s.id,status:st,perizinanId:pid,oleh,updatedAt:Date.now()});
      }
    }
    const k=await DB.g('kegiatan',kgId);
    await this.nav('abs',{sid,t:k?.nama||'Absensi',s:today});
  },
  async qSubSesiDash(skId,kgId){
    const today=_todayLocal();const sid='ses_'+today+'_'+kgId+'_'+skId;
    let sx=await DB.g('sesi',sid);
    if(!sx){sx={id:sid,tanggal:today,kgId,skId,status:'draft',createdAt:Date.now(),locked:false};await DB.p('sesi',sx);
      const ang=(await DB.ga('anggota')).filter(a=>a.skId===skId);
      // Sub-kegiatan tanpa anggota → list kosong (harus dikelola dulu)
      const targets=ang.map(a=>({sntId:a.sntId}));
      const izinMap=await this._izinAktifMap(today);
      const sakitMap0=await this._sakitAktifMap(today);
      const k0=await DB.g('kegiatan',kgId);
      const sk0=await DB.g('subKeg',skId);
      const isShalat0=_isShalatKegiatan(k0?.nama,sk0?.nama);
      const uzurMap0=isShalat0?await this._uzurAktifMap(today):{};
      for(const a of targets){
        let st='none',pid=null,oleh=S.user?.nama||'-';
        if(sakitMap0[a.sntId]){st='sakit';pid=null;oleh='Sistem (Catatan Sakit)';}
        else if(izinMap[a.sntId]){st='izin';pid=izinMap[a.sntId];oleh='Sistem (Perizinan)';}
        else if(isShalat0&&uzurMap0[a.sntId]){st='uzur';oleh='Sistem (Uzur)';}
        await DB.p('absensi',{id:absDetId(sid,a.sntId),sesiId:sid,sntId:a.sntId,status:st,perizinanId:pid,oleh,updatedAt:Date.now()});
      }
    }
    const sk=await DB.g('subKeg',skId),k=await DB.g('kegiatan',kgId);
    await this.nav('abs',{sid,skId,t:sk?.nama||'Absensi',s:(k?.nama||'')+' · '+today});
  },


  async renderKg(){
    const [kg,sk,ses,abs]=await Promise.all([DB.ga('kegiatan'),DB.ga('subKeg'),DB.ga('sesi'),DB.ga('absensi')]);
    // Safety-net: filter out items yang tertinggal sebagai tombstone (deleted:true)
    // di IndexedDB. Seharusnya tidak terjadi jika sync berjalan normal, tapi
    // ini mencegah kegiatan yang sudah dihapus di perangkat lain tetap muncul.
    const kgActive=kg.filter(k=>!k.deleted);
    const skActive=sk.filter(s=>!s.deleted);
    kgActive.sort((a,b)=>a.urutan-b.urutan);
    const today=_todayLocal();
    const el=document.getElementById('kg-body');
    if(!kgActive.length){el.innerHTML=`<div class="empty"><div class="ei">\uD83D\uDCC5</div><div class="et">Belum ada kegiatan</div></div><div style="padding:0 15px"><button class="bg2 bw" onclick="App.addKg()">+ Tambah Kegiatan</button></div>`;return}
    el.innerHTML=`<div style="padding:0 15px;display:flex;flex-direction:column;gap:9px">
      ${kgActive.map(k=>{
        const subs=skActive.filter(x=>x.kgId===k.id).sort((a,b)=>a.urutan-b.urutan);
        const tses=ses.filter(x=>x.tanggal===today&&x.kgId===k.id&&!x.skId);
        const done=tses.length>0&&tses.every(x=>x.status==='selesai'||x.locked);
        const kTimeBadge=App._timeBadgeHtml(k,null);
        return`<div class="kg${done?' dn':''}">
          <div class="km2" onclick="App.nav('kgd',{id:'${k.id}',t:'${escJ(k.nama)}'})">
            <div class="ki${k.aktif?'':' inact'}">${k.icon}</div>
            <div style="flex:1;min-width:0">
              <div class="kname">${k.nama}${done?'&nbsp;<span class="done-b">Sudah Diabsen</span>':''}</div>
              <div class="kmeta">${subs.length} sub \u00B7 ${k.aktif?'Aktif':'Nonaktif'}</div>
              ${kTimeBadge?`<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${kTimeBadge}</div>`:''}
            </div>
            <div class="ka" onclick="event.stopPropagation()">
              <button class="kb" onclick="App.moveKg('${k.id}',-1)" title="Naik">&#x25B2;</button>
              <button class="kb" onclick="App.moveKg('${k.id}',1)" title="Turun">&#x25BC;</button>
              <button class="kb" onclick="App.editKg('${k.id}')">&#x270E;</button>
              <button class="kb" onclick="App.delKg('${k.id}','${escJ(k.nama)}')">&#x2715;</button>
              <button style="width:28px;height:28px;border-radius:50%;background:var(--grad);border:none;font-size:16px;font-weight:700;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;box-shadow:0 3px 10px rgba(13,181,127,.35)" onclick="event.stopPropagation();App.addSub('${k.id}')" title="Tambah Sub Kegiatan">+</button>
            </div>
          </div>
          ${subs.length?`<div class="sls op" id="sl-${k.id}">
            ${subs.map(s=>{
              const ss=ses.filter(x=>x.tanggal===today&&x.skId===s.id);
              const sd=ss.length>0&&ss.every(x=>x.status==='selesai'||x.locked);
              const sTimeBadge=App._timeBadgeHtml(s,k);
              return`<div class="sic${sd?' dn':''}" data-skid="${s.id}" onclick="App.qSubSesi('${s.id}','${k.id}')">
                <div class="sic-main">
                  <div class="sic-name">${esc(s.nama)}${sd?'&nbsp;<span class="done-b">\u2713</span>':''}</div>
                  ${sTimeBadge?`<div class="sic-badges">${sTimeBadge}</div>`:''}
                </div>
                <div class="sic-actions">
                  <button style="padding:4px 9px;border-radius:100px;background:var(--grad);color:#fff;font-size:10px;font-weight:700;cursor:pointer;border:none;flex-shrink:0" onclick="event.stopPropagation();App.qSubSesi('${s.id}','${k.id}')">Absen</button>
                  <button style="padding:4px 9px;border-radius:100px;background:var(--su);border:1.5px solid var(--dv);font-size:10px;font-weight:600;color:var(--t2);cursor:pointer;flex-shrink:0" onclick="event.stopPropagation();App.kelola('${s.id}')">Kelola</button>
                  <button style="width:26px;height:26px;border-radius:50%;background:var(--su2);border:none;font-size:11px;cursor:pointer;flex-shrink:0" onclick="event.stopPropagation();App.editSub('${s.id}')">✏️</button>
                  <button style="width:26px;height:26px;border-radius:50%;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);font-size:11px;cursor:pointer;flex-shrink:0;color:#ef4444" onclick="event.stopPropagation();App.delSub('${s.id}','${escJ(s.nama)}')">✕</button>
                </div>
              </div>`;
            }).join('')}
          </div>`:''}
        </div>`;
      }).join('')}
      <button class="bg2 bw" onclick="App.addKg()" style="margin-top:3px">+ Tambah Kegiatan</button>
    </div>`;
    // Aktifkan tekan-tahan-geser untuk memindahkan urutan sub-kegiatan
    kgActive.forEach(k=>{
      const container=document.getElementById('sl-'+k.id);
      if(container) SubReorder.attach(container, k.id);
    });
  },
  togSub(id){document.getElementById('sl-'+id)?.classList.toggle('op')},

  async qSesi(kgId){
    const today=_todayLocal();const sid='ses_'+today+'_'+kgId;
    let sx=await DB.g('sesi',sid);
    if(!sx){sx={id:sid,tanggal:today,kgId,skId:null,status:'draft',createdAt:Date.now(),locked:false};await DB.p('sesi',sx);
      const snt=(await DB.ga('santri')).filter(x=>x.aktif);
      const izinMap=await this._izinAktifMap(today);
      const sakitMap0=await this._sakitAktifMap(today);
      const k0=await DB.g('kegiatan',kgId);
      const isShalat0=_isShalatKegiatan(k0?.nama,null);
      const uzurMap0=isShalat0?await this._uzurAktifMap(today):{};
      for(const s of snt){
        let st='none',pid=null,oleh=S.user?.nama||'-';
        if(sakitMap0[s.id]){st='sakit';pid=null;oleh='Sistem (Catatan Sakit)';}
        else if(izinMap[s.id]){st='izin';pid=izinMap[s.id];oleh='Sistem (Perizinan)';}
        else if(isShalat0&&uzurMap0[s.id]){st='uzur';oleh='Sistem (Uzur)';}
        await DB.p('absensi',{id:absDetId(sid,s.id),sesiId:sid,sntId:s.id,status:st,perizinanId:pid,oleh,updatedAt:Date.now()});
      }
    }
    const k=await DB.g('kegiatan',kgId);
    await this.nav('abs',{sid,t:k?.nama||'Absensi',s:today});
  },
  async qSubSesi(skId,kgId){
    const today=_todayLocal();const sid='ses_'+today+'_'+kgId+'_'+skId;
    let sx=await DB.g('sesi',sid);
    if(!sx){sx={id:sid,tanggal:today,kgId,skId,status:'draft',createdAt:Date.now(),locked:false};await DB.p('sesi',sx);
      const ang=(await DB.ga('anggota')).filter(a=>a.skId===skId);
      // Sub-kegiatan tanpa anggota → list kosong (harus dikelola dulu)
      const targets=ang.map(a=>({sntId:a.sntId}));
      const izinMap=await this._izinAktifMap(today);
      const sakitMap0=await this._sakitAktifMap(today);
      const k0=await DB.g('kegiatan',kgId);
      const sk0=await DB.g('subKeg',skId);
      const isShalat0=_isShalatKegiatan(k0?.nama,sk0?.nama);
      const uzurMap0=isShalat0?await this._uzurAktifMap(today):{};
      for(const a of targets){
        let st='none',pid=null,oleh=S.user?.nama||'-';
        if(sakitMap0[a.sntId]){st='sakit';pid=null;oleh='Sistem (Catatan Sakit)';}
        else if(izinMap[a.sntId]){st='izin';pid=izinMap[a.sntId];oleh='Sistem (Perizinan)';}
        else if(isShalat0&&uzurMap0[a.sntId]){st='uzur';oleh='Sistem (Uzur)';}
        await DB.p('absensi',{id:absDetId(sid,a.sntId),sesiId:sid,sntId:a.sntId,status:st,perizinanId:pid,oleh,updatedAt:Date.now()});
      }
    }
    const sk=await DB.g('subKeg',skId),k=await DB.g('kegiatan',kgId);
    await this.nav('abs',{sid,skId,t:sk?.nama||'Absensi',s:(k?.nama||'')+' \u00B7 '+today});
  },

  async renderKgd(kgId){
    const [k,sk,ses,abs]=await Promise.all([DB.g('kegiatan',kgId),DB.ga('subKeg'),DB.ga('sesi'),DB.ga('absensi')]);
    if(!k||k.deleted){document.getElementById('kgd-body').innerHTML='<div class="empty"><div class="es">Tidak ditemukan.</div></div>';return}
    const subs=sk.filter(x=>x.kgId===kgId&&!x.deleted).sort((a,b)=>a.urutan-b.urutan);
    const kgAbs=abs.filter(a=>ses.find(x=>x.id===a.sesiId&&x.kgId===kgId));
    const pct=kgAbs.length?Math.round(kgAbs.filter(a=>a.status==='hadir').length/kgAbs.length*100):0;
    document.getElementById('kgd-body').innerHTML=`<div style="padding:0 15px 15px">
      <div class="hc" style="margin-bottom:12px"><div style="position:relative;z-index:1">
        <div style="font-size:36px;margin-bottom:7px">${k.icon}</div>
        <div style="font-family:var(--fd);font-size:20px;font-weight:800;color:#fff">${k.nama}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:3px">${subs.length} sub \u00B7 ${pct}% kehadiran</div>
      </div></div>
      <div style="display:flex;gap:7px;margin-bottom:14px">
        <button style="padding:11px 13px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:12px;font-weight:600;color:var(--t2);cursor:pointer" onclick="App.editKg('${kgId}')">✏️ Edit</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
        <div style="font-family:var(--fd);font-size:14px;font-weight:800;color:var(--t1)">Sub Kegiatan</div>
        <button style="padding:5px 12px;border-radius:100px;background:var(--grad);color:#fff;font-size:11px;font-weight:700;cursor:pointer;border:none" onclick="App.addSub('${kgId}')">+ Tambah</button>
      </div>
      ${subs.map(s=>`<div style="display:flex;align-items:center;gap:9px;padding:11px;background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);margin-bottom:7px;backdrop-filter:blur(20px);cursor:pointer" onclick="App.nav('sub',{id:'${s.id}',t:'${escJ(s.nama)}',s:'${escJ(k.nama)}'})">
        <div style="width:36px;height:36px;border-radius:11px;background:var(--gs);border:1px solid rgba(13,181,127,.2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--a1)">${s.nama.charAt(0)}</div>
        <div style="flex:1"><div style="font-weight:600;font-size:13px;color:var(--t1)">${s.nama}</div></div>
        <button style="width:28px;height:28px;border-radius:50%;background:var(--su2);border:none;font-size:12px;cursor:pointer" onclick="event.stopPropagation();App.editSub('${s.id}')">&#x270E;</button>
        <button style="width:28px;height:28px;border-radius:50%;background:var(--su2);border:none;font-size:12px;cursor:pointer" onclick="event.stopPropagation();App.delSub('${s.id}','${escJ(s.nama)}')">&#x2715;</button>
        <span style="font-size:13px;color:var(--t4)">\u2192</span>
      </div>`).join('')}
      ${!subs.length?'<div class="empty" style="padding:20px 0"><div class="es">Belum ada sub kegiatan.</div></div>':''}
    </div>`;
  },

  async renderSub(skId){
    const [sk,ang,snt]=await Promise.all([DB.g('subKeg',skId),DB.ga('anggota'),DB.ga('santri')]);
    if(!sk)return;const k=await DB.g('kegiatan',sk.kgId);
    const mems=ang.filter(a=>a.skId===skId);const ms=snt.filter(x=>mems.find(m=>m.sntId===x.id));
    document.getElementById('sub-body').innerHTML=`<div style="padding:0 15px 15px">
      <div class="hc" style="margin-bottom:12px"><div style="position:relative;z-index:1">
        <div style="font-family:var(--fd);font-size:19px;font-weight:800;color:#fff">${sk.nama}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:3px">${k?.nama||''} \u00B7 ${ms.length} anggota</div>
      </div></div>
      <div style="display:flex;gap:7px;margin-bottom:14px">
        <button class="qb" onclick="App.qSubSesi('${skId}','${sk.kgId}')">Mulai Absensi</button>
        <button style="padding:11px 13px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:12px;font-weight:600;color:var(--t2);cursor:pointer" onclick="App.kelola('${skId}')">Kelola</button>
      </div>
      <div style="font-family:var(--fd);font-size:14px;font-weight:800;color:var(--t1);margin-bottom:9px">Anggota (${ms.length})</div>
      ${ms.map(x=>`<div style="display:flex;align-items:center;gap:9px;padding:9px;background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);margin-bottom:7px;backdrop-filter:blur(20px);cursor:pointer" onclick="App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})">
        <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0">${x.foto?`<img src="${x.foto}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>`}</div>
        <div style="flex:1"><div class="snt-link" style="font-size:13px">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}</div></div>
        <span style="font-size:12px;color:var(--t4)">\u2192</span>
      </div>`).join('')}
      ${!ms.length?'<div class="empty" style="padding:16px 0"><div class="es">Belum ada anggota.</div></div>':''}
    </div>`;
  },


  async renderAbs(sid,skId){
    S._sesiId=sid;S._skId=skId||null;
    const [sx,abs,snt,ang]=await Promise.all([DB.g('sesi',sid),DB.ga('absensi'),DB.ga('santri'),DB.ga('anggota')]);
    if(!sx){document.getElementById('abs-body').innerHTML='<div class="empty"><div class="es">Sesi tidak ditemukan.</div></div>';return}
    const realSkId=skId||sx.skId||null;
    const angSk=realSkId?ang.filter(a=>a.skId===realSkId):[];
    // Sub-kegiatan: hanya santri yang terdaftar sebagai anggota.
    // Jika sub-kegiatan belum punya anggota → list kosong (harus dikelola dulu).
    // Kegiatan induk (tanpa sub): semua santri aktif.
    let targets=realSkId
      ? snt.filter(x=>angSk.find(m=>m.sntId===x.id)&&x.aktif)
      : snt.filter(x=>x.aktif);
    const aMap={};abs.filter(a=>a.sesiId===sid).forEach(a=>aMap[a.sntId]=a);
    // Repair: buat absensi untuk santri yang belum ada (sesi lama yang dibuat saat anggota kosong)
    const _izinMapRep=await this._izinAktifMap(sx.tanggal);
    const _sakitMapRep=await this._sakitAktifMap(sx.tanggal);
    const _kgRep=await DB.g('kegiatan',sx.kgId||'');
    const _skRep=realSkId?await DB.g('subKeg',realSkId):null;
    const _isShalatRep=_isShalatKegiatan(_kgRep?.nama,_skRep?.nama);
    const _uzurMapRep=_isShalatRep?await this._uzurAktifMap(sx.tanggal):{};
    for(const x of targets){
      if(!aMap[x.id]){
        let st='none',pid=null,oleh=S.user?.nama||'-';
        if(_sakitMapRep[x.id]){st='sakit';pid=null;oleh='Sistem (Catatan Sakit)';}
        else if(_izinMapRep[x.id]){st='izin';pid=_izinMapRep[x.id];oleh='Sistem (Perizinan)';}
        else if(_isShalatRep&&_uzurMapRep[x.id]){st='uzur';oleh='Sistem (Uzur)';}
        const na={id:absDetId(sid,x.id),sesiId:sid,sntId:x.id,status:st,perizinanId:pid,oleh,updatedAt:Date.now()};
        await DB.p('absensi',na);aMap[x.id]=na;
      }
    }
    const kms=['Semua',...new Set(targets.map(x=>x.kamar))];
    // Load catatan sesi jika ada
    const catatanKey='catatan_'+sid+(skId?'_'+skId:'');
    const catData=await DB.g('settings',catatanKey);
    await this._renderAbsBody(sx,targets,aMap,kms,S.absKamar,catData?.value||'');
  },
  async _renderAbsBody(sx,targets,aMap,kms,kamar,catatan){
    const f=kamar==='Semua'?targets:targets.filter(x=>x.kamar===kamar);
    const cnt={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0,uzur:0};
    targets.forEach(x=>{const st=aMap[x.id]?.status||'none';if(st!=='none'&&cnt[st]!==undefined)cnt[st]++});
    const pct=targets.length?Math.round(cnt.hadir/targets.length*100):0;
    const catatanKey='catatan_'+sx.id+(S._skId?'_'+S._skId:'');
    // Deteksi kegiatan shalat & ambil map uzur aktif (untuk badge & auto-fill)
    const _kgBody=await DB.g('kegiatan',sx.kgId||'');
    const _skBody=S._skId?await DB.g('subKeg',S._skId):null;
    const isShalat=_isShalatKegiatan(_kgBody?.nama,_skBody?.nama);
    const uzurAktifMap=isShalat?await this._uzurAktifMap(sx.tanggal):{};
    document.getElementById('abs-body').innerHTML=`
      <div style="padding:0 15px 9px">
        <!-- Catatan Kegiatan — card tanpa label -->
        ${catatan?`<div style="position:relative;background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:9px 36px 9px 11px;margin-bottom:10px;backdrop-filter:blur(20px)">
          <div id="catatan-view" style="font-size:11px;color:var(--t2);line-height:1.55;white-space:pre-wrap;word-break:break-word">${catatan}</div>
          <button onclick="App._editCatatan('${catatanKey}')" title="Sunting catatan" style="position:absolute;top:7px;right:7px;width:24px;height:24px;border-radius:6px;background:var(--gs);border:1px solid rgba(13,181,127,.2);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--a1)">✏️</button>
        </div>`:`<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button style="padding:4px 9px;border-radius:var(--r2);background:var(--gs);border:1px solid rgba(13,181,127,.18);font-size:10px;font-weight:700;color:var(--a1);cursor:pointer" onclick="App._editCatatan('${catatanKey}')">+ Catatan</button></div>`}
        <div class="ss2">
          <div style="display:grid;grid-template-columns:repeat(${isShalat?6:5},1fr);gap:5px;margin-bottom:7px">
            ${[['hadir','Hadir',cnt.hadir,'var(--a1)'],['alpha','Alpha',cnt.alpha,'#ef4444'],['izin','Izin',cnt.izin,'#f59e0b'],['sakit','Sakit',cnt.sakit,'#8b5cf6'],['terlambat','Lambat',cnt.terlambat,'#06b6d4'],...(isShalat?[['uzur','Uzur',cnt.uzur,'var(--cu)']]:[])].map(([st,lb,n,col])=>`
              <div onclick="App.absSumPop('${st}','${sx.id}')" style="background:var(--gs);border-radius:var(--r3);padding:8px 4px;text-align:center;cursor:pointer;border:1.5px solid transparent;transition:border-color .15s" onmousedown="this.style.borderColor='${col}'20" onmouseup="this.style.borderColor='transparent'">
                <div style="font-family:var(--fd);font-size:17px;font-weight:800;color:${col}" id="sum-n-${st}">${n}</div>
                <div style="font-size:8px;font-weight:600;color:var(--t3);margin-top:1px">${lb}</div>
              </div>`).join('')}
          </div>
          <div class="pw"><div class="pf" id="abp" style="width:${pct}%"></div></div>
          <div style="font-size:9px;color:var(--t3);text-align:right;margin-top:2px">${pct}% hadir</div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:9px;flex-wrap:wrap">
          <button class="qb" style="font-size:12px;padding:11px" onclick="App.allHadir('${sx.id}')">&#x2713; Semua Hadir</button>
          <button style="font-size:12px;padding:11px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);color:var(--t2);font-weight:700;cursor:pointer" onclick="App.allNone('${sx.id}')" title="Reset semua jadi belum diabsen">Reset</button>
          ${sx.locked?`<span class="lock-b" style="padding:9px 11px;align-self:center${S._adminMode===true?';cursor:pointer;text-decoration:underline dotted':''}" ${S._adminMode===true?`onclick="App._adminUnlock('${sx.id}')" title="Klik untuk buka kunci (Mode Admin)"`:'title="Sesi terkunci — aktifkan Mode Admin di Pengaturan untuk membuka"'}>&#x1F512; Terkunci</span>`:`<button title="Kunci sesi" style="padding:11px 14px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:14px;font-weight:600;color:var(--t2);cursor:pointer" onclick="App.lockSesi('${sx.id}')">&#x1F512;</button>`}
          <button id="nfc-toggle-btn" style="padding:11px 14px;border-radius:var(--r3);background:var(--gs);border:1.5px solid rgba(13,181,127,.25);font-size:11px;font-weight:700;color:var(--a1);cursor:pointer;display:flex;align-items:center;gap:5px" onclick="NFC.toggle('${sx.id}')">📡 NFC</button>
          ${(S._skId||sx.skId)?`<button title="Kelola anggota" style="padding:11px 14px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:15px;font-weight:600;color:var(--t2);cursor:pointer" onclick="App.kelola('${S._skId||sx.skId}')">&#x1F465;</button>`:''}
        </div>
        <div class="fwrap${S._absKmOpen===true?' on':''}" id="abs-km-fwrap">
          <div class="fwrap-h" onclick="App._togFilter('abs-km-fwrap')">
            <div class="fwrap-h-lb">Filter Kamar${kamar!=='Semua'?` <span style="font-size:9px;color:var(--a1);background:var(--gs);padding:1px 6px;border-radius:100px">${esc(kamar)}</span>`:''}</div>
            <span class="fwrap-h-ic">▾</span>
          </div>
          <div class="fwrap-b">
            <div class="kw">
              ${kms.map(k=>`<div class="kc${k===kamar?' on':''}" onclick="App.filterKm('${k}')">${k}</div>`).join('')}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:7px;background:var(--inp);border:1.5px solid var(--dv);border-radius:var(--r2);padding:9px 12px;margin-bottom:9px">
          <span style="color:var(--t4);font-size:14px">🔍</span>
          <input id="abs-search" class="fi" placeholder="Cari nama santri..." oninput="App._absSearch()" style="border:none;padding:0;background:transparent;flex:1;font-size:13px">
        </div>
        ${isShalat?`<div style="font-size:10px;color:var(--cu);background:rgba(236,72,153,.08);border:1px solid rgba(236,72,153,.2);border-radius:var(--r2);padding:7px 11px;margin-bottom:9px;display:flex;align-items:center;gap:6px"><span>🟣</span><span>Santri uzur aktif akan otomatis tercatat Uzur pada kegiatan shalat. Tap NFC atau set Hadir untuk mengakhiri uzur.</span></div>`:''}
        <div style="display:flex;flex-direction:column;gap:7px" id="abs-cards">
          ${f.length?f.map(x=>{const ab=aMap[x.id];const st=ab?.status||'none';
            const uAktif=uzurAktifMap[x.id];
            const uBadge=uAktif?`<span class="uzur-badge" title="Sedang uzur (hari ke-${_uzurDayCount(uAktif.tglMulai)})">🟣 Hari ke-${_uzurDayCount(uAktif.tglMulai)}</span>`:'';
            return`<div class="ac ${stCls(st)}" id="ac-${x.id}">
              <div class="av2" onclick="CS();App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})">${x.foto?`<img src="${x.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:x.nama.charAt(0)}</div>
              <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap"><div class="snt-link" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%" onclick="CS();App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})">${x.nama}</div>${uBadge}</div><div style="font-size:10px;color:var(--t3);margin-top:1px">${x.kamar}</div></div>
              <div class="sbs">
                <button class="sb3${st==='hadir'?' ah':''}" onclick="App.setSt('${ab?.id||''}','${x.id}','hadir','${sx.id}')">&#x2713;</button>
                <button class="sb3${st==='alpha'?' aa':''}" onclick="App.setSt('${ab?.id||''}','${x.id}','alpha','${sx.id}')">A</button>
                <button class="sb3${st==='izin'?' ai':''}" onclick="App.setSt('${ab?.id||''}','${x.id}','izin','${sx.id}')">I</button>
                <button class="sb3${st==='sakit'?' as':''}" onclick="App.setSt('${ab?.id||''}','${x.id}','sakit','${sx.id}')">S</button>
                <button class="sb3${st==='terlambat'?' at':''}" onclick="App.setSt('${ab?.id||''}','${x.id}','terlambat','${sx.id}')">T</button>
                ${isShalat?`<button class="sb3${st==='uzur'?' au':''}" onclick="App.setSt('${ab?.id||''}','${x.id}','uzur','${sx.id}')" title="Uzur (Haid)">U</button>`:''}
              </div>
            </div>`;
          }).join(''):`<div class="gc" style="padding:28px 20px;text-align:center;margin-bottom:8px">
            <div style="font-size:36px;margin-bottom:10px">👥</div>
            <div style="font-weight:700;font-size:14px;color:var(--t1);margin-bottom:6px">Belum ada anggota di sub kegiatan ini</div>
            <div style="font-size:11px;color:var(--t3);line-height:1.5;margin-bottom:14px">Klik tombol Kelola Anggota di bawah untuk memilih santri yang masuk ke sub kegiatan "${esc(_skBody?.nama||'ini')}".</div>
            <button onclick="App.kelola('${S._skId||sx.skId}')" style="padding:10px 20px;border-radius:100px;background:var(--grad);color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer;box-shadow:0 6px 16px rgba(13,181,127,.3)">👥 Kelola Anggota</button>
          </div>`}
        </div>
      </div>`;
  },
  async filterKm(kamar){
    S.absKamar=kamar;
    const [sx,abs,snt,ang]=await Promise.all([DB.g('sesi',S._sesiId),DB.ga('absensi'),DB.ga('santri'),DB.ga('anggota')]);
    const realSkId=S._skId||sx?.skId||null;
    let targets=realSkId?snt.filter(x=>ang.filter(a=>a.skId===realSkId).find(m=>m.sntId===x.id)&&x.aktif):snt.filter(x=>x.aktif);
    const aMap={};abs.filter(a=>a.sesiId===S._sesiId).forEach(a=>aMap[a.sntId]=a);
    const kms=['Semua',...new Set(targets.map(x=>x.kamar))];
    await this._renderAbsBody(sx,targets,aMap,kms,kamar);
  },
  _absSearch(){
    const q=(document.getElementById('abs-search')?.value||'').toLowerCase();
    document.querySelectorAll('#abs-cards .ac').forEach(card=>{
      const nm=card.querySelector('.snt-link')?.textContent?.toLowerCase()||'';
      card.style.display=(q===''||nm.includes(q))?'':'none';
    });
  },
  _editCatatan(catatanKey){
    const loadCatatan=async()=>{
      const catData=await DB.g('settings',catatanKey);
      const el=document.getElementById('cat-text');
      if(el&&catData)el.value=catData.value;
    };
    OS(`<div class="sh">✏️ Edit Catatan Kegiatan</div><div class="sb" style="padding-bottom:80px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Jelaskan nama kegiatan, waktu, guru, hukuman jika telat, dll. Bisa di-enter untuk baris baru.</div>
      <textarea id="cat-text" class="fi" style="min-height:180px;resize:none;line-height:1.6;font-family:var(--fb)" placeholder="Misal:\\nKegiatan: Tahfidz Al-Quran\\nWaktu: 19:00 - 20:30\\nGuru: Pak Ahmad\\nHukuman jika telat: Hafalan tambahan"></textarea>
      <button class="bg2 bw" style="margin-top:10px" onclick="App._saveCatatan('${catatanKey}')">💾 Simpan Catatan</button>
    </div>`);
    setTimeout(loadCatatan,100);
  },
  async _saveCatatan(catatanKey){
    const v=document.getElementById('cat-text')?.value||'';
    await DB.p('settings',{id:catatanKey,value:v});
    T('✅ Catatan disimpan!');CS();
    await this.renderAbs(S._sesiId,S._skId);
  },
  async setSt(absId,sntId,newSt,sid){
    // ── AUDIT FIX: Race condition guard (double-submit prevention) ──
    // Sebelumnya, klik tombol absen dua kali dengan cepat (atau double-tap
    // di NFC) bisa memicu dua _doSt() paralel yang sama-sama baca DB.g lalu
    // dua-duanya tulis, terutama jika klik terjadi saat UI belum selesai
    // update. Flag S._absInFlight memastikan hanya satu operasi absen
    // per-sntId yang berjalan pada satu waktu. Flag di-clear di finally.
    if (!S._absInFlight) S._absInFlight = {};
    const flightKey = absId;
    if (S._absInFlight[flightKey]) {
      // Sudah ada operasi yang berjalan untuk absen ini — drop silently.
      // Tidak perlu toast karena ini guard anti-double-click, bukan error.
      return;
    }
    S._absInFlight[flightKey] = true;
    try {
      // Toggle: kalau klik status yang sama, ubah jadi 'none' (deselect)
      let ab=await DB.g('absensi',absId);
      if(ab&&ab.status===newSt){
        await this._doSt(absId,sntId,'none',sid);
        return;
      }
      // ── CATATAN SAKIT INTEGRATION (setSt) ──────────────────────
      // Tombol 'sakit' di halaman absensi LANGSUNG set status sakit.
      // TIDAK ADA pop-up sheet catatan sakit lagi di sini — santri
      // yang sakit bisa dicatat detailnya manual lewat halaman Perizinan
      // atau profil (tombol "+ Catat Sakit"). Jika santri sudah punya
      // catatanSakit aktif, status 'sakit' konsisten dengan catatan itu.
      //
      // Saat ustadah klik 'hadir' & santri PUNYA catatanSakit aktif →
      // tandai sembuh (caraBerakhir='hadir_manual') lalu set hadir.
      if(newSt==='hadir'){
        const sakitAktif=await this._getSakitAktifBySnt(sntId);
        if(sakitAktif){
          await this._setSakitSembuh(sakitAktif.id,'hadir_manual').catch(()=>{});
          T('✅ Catatan sakit ditandai sembuh. Absensi kembali normal.',2500);
        }
      }
      await this._doSt(absId,sntId,newSt,sid);
    } finally {
      // Clear flag setelah operasi selesai (sukses atau gagal).
      // Beri delay 150ms supaya UI card sudah update dan tidak re-trigger.
      setTimeout(() => { if (S._absInFlight) delete S._absInFlight[flightKey]; }, 150);
    }
  },
  async _doSt(absId,sntId,newSt,sid){
    // ── AUDIT v3d FIX: Guard sesi terkunci ──
    // Sebelumnya: _doSt tidak cek sx.locked. Jika sesi sudah terkunci (auto
    // atau manual), perubahan status masih bisa ditulis — ini bisa menyebabkan
    // race condition di mana auto-lock set 'alpha' di device B sementara user
    // di device A baru saja set 'hadir'. Sekarang: cek locked dulu, tolak
    // perubahan kecuali admin mode aktif.
    let ab=await DB.g('absensi',absId);const old=ab?.status;
    const _adminOv=S._adminOverride===true;
    const olehLabel=(_adminOv?'[Admin] ':'')+(S.user?.nama||'-');
    if(!ab)ab={id:absDetId(sid,sntId),sesiId:sid,sntId,status:newSt,oleh:olehLabel,updatedAt:Date.now()};
    else{ab.status=newSt;ab.oleh=olehLabel;ab.updatedAt=Date.now()}
    // ── PERFORMANCE: parallel DB reads ─────────────────────────
    const [sn,sx]=await Promise.all([DB.g('santri',sntId),DB.g('sesi',sid)]);
    // Guard: jika sesi terkunci & bukan admin mode, tolak perubahan
    if (sx?.locked && !_adminOv) {
      T('🔒 Sesi terkunci! Aktifkan Mode Admin di Pengaturan untuk mengubah.', 3000);
      return;
    }
    const [k,sk]=await Promise.all([DB.g('kegiatan',sx?.kgId||''),sx?.skId?DB.g('subKeg',sx.skId):Promise.resolve(null)]);
    // Save absensi + auditLog secara paralel
    await DB.p('absensi',ab);
    DB.p('auditLog',{id:uid(),time:Date.now(),sntNama:sn?.nama||sntId,kgNama:k?.nama||'-',from:old,to:newSt,oleh:olehLabel,sid,adminOverride:_adminOv||undefined}).catch(()=>{});
    // ── CATATAN SAKIT INTEGRATION (_doSt) ──────────────────────
    // Jika newSt==='hadir' (manual atau via NFC), akhiri catatanSakit
    // aktif untuk santri ini. Di setSt sudah di-handle secara explisit
    // (caraBerakhir='hadir_manual'); di sini juga ditangani untuk
    // menangkap jalur NFC tap yang langsung memanggil _doSt.
    if(newSt==='hadir'&&old!=='hadir'){
      const sakitAktif=await this._getSakitAktifBySnt(sntId);
      if(sakitAktif){
        // Deteksi: jika berasal dari NFC (cek call stack sederhana via flag)
        const caraBerakhir=S._nfcInFlight?'nfc':'hadir_manual';
        // Hindari double-mark: jika sudah diset di setSt, _setSakitSembuh
        // akan mengembalikan undefined (status sudah 'sembuh')
        await this._setSakitSembuh(sakitAktif.id,caraBerakhir).catch(()=>{});
      }
    }
    // ── UZUR INTEGRATION ───────────────────────────────────────
    // Status 'uzur' hanya relevan untuk kegiatan shalat. Saat pengurus
    // memilih Uzur → mulai periode uzur (jika belum aktif). Saat pengurus
    // mengubah ke 'hadir' pada shalat → akhiri uzur aktif (caraBerakhir='manual').
    const isShalat=_isShalatKegiatan(k?.nama,sk?.nama);
    if(newSt==='uzur'&&isShalat){
      await this._startUzur(sntId,S.user?.nama||'-').catch(()=>{});
    } else if(newSt==='hadir'&&isShalat&&old!=='hadir'){
      await this._endUzur(sntId,'manual').catch(()=>{});
    }
    // Pelanggaran terintegrasi: alpha OR terlambat in → buat entri; out (termasuk ke 'none') → hapus entri
    if((newSt==='alpha'||newSt==='terlambat')&&old!==newSt){
      // Cek sudah ada pelanggaran auto untuk absId ini
      const allPelCheck=await DB.ga('pelanggaran');
      const existing=allPelCheck.find(p=>p.absId===ab.id&&p.tipe==='auto');
      if(!existing){
        await DB.p('pelanggaran',{id:uid(),tipe:'auto',absId:ab.id,sntId,sntNama:sn?.nama||'-',
          kgId:sx?.kgId||'',kgNama:k?.nama||'-',skId:sx?.skId||'',skNama:sk?.nama||'',
          tanggal:sx?.tanggal||_todayLocal(),
          status:'belum',catatanHukuman:'',fotoHukuman:'',
          pelanggaranJenis:newSt==='alpha'?'Alpha':'Terlambat',
          createdAt:Date.now(),updatedAt:Date.now()});
      } else if(existing.pelanggaranJenis!==newSt&&existing.status==='belum'){
        // Update jenis pelanggaran kalau status berubah antara alpha/terlambat
        // (hanya kalau belum dihukum — kalau sudah 'sudah', jangan diubah)
        existing.pelanggaranJenis=newSt==='alpha'?'Alpha':'Terlambat';
        existing.updatedAt=Date.now();
        await DB.p('pelanggaran',existing);
      }
    } else if(newSt!=='alpha'&&newSt!=='terlambat'&&(old==='alpha'||old==='terlambat')){
      // Switching dari alpha/terlambat ke status lain (hadir/izin/sakit/uzur/none) → hapus pelanggaran auto
      const allPel=await DB.ga('pelanggaran');
      const pelAuto=allPel.find(p=>p.absId===ab.id&&p.tipe==='auto'&&p.status==='belum');
      if(pelAuto)await DB.d('pelanggaran',pelAuto.id);
    }
    // Jika newSt === 'none', update UI card tanpa pelanggaran logic
    if(newSt==='none'){
      const card=document.getElementById('ac-'+sntId);
      if(card){
        card.className='ac sn-none';
        card.querySelectorAll('.sb3').forEach(b=>{b.className='sb3'});
      }
      await this._updSum(sid);
      return;
    }
    const card=document.getElementById('ac-'+sntId);
    if(card){
      const sts=['hadir','alpha','izin','sakit','terlambat','uzur'];const cls=['ah','aa','ai','as','at','au'];
      card.className='ac '+stCls(newSt);
      card.querySelectorAll('.sb3').forEach((b,i)=>{b.className='sb3'+(newSt===sts[i]?' '+cls[i]:'')});
    }
    await this._updSum(sid);
  },
  async _updSum(sid){
    // PERFORMANCE: hitung dari DOM cards (sudah di-update di _doSt)
    // alih-alih reload semua absensi dari DB (yang bisa ribuan record).
    // Fallback ke DB query kalau DOM tidak punya cards (mis. dari NFC tap).
    const cnt={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0,uzur:0};
    let total=0;
    const cards=document.querySelectorAll('#abs-cards .ac');
    if(cards.length>0){
      cards.forEach(c=>{
        // Class card: 'ac sh2' (hadir), 'ac sa' (alpha), 'ac si' (izin),
        // 'ac ss' (sakit), 'ac sl2' (terlambat), 'ac su' (uzur), 'ac sn-none'
        if(c.classList.contains('sh2')){cnt.hadir++;total++}
        else if(c.classList.contains('sa')){cnt.alpha++;total++}
        else if(c.classList.contains('si')){cnt.izin++;total++}
        else if(c.classList.contains('ss')){cnt.sakit++;total++}
        else if(c.classList.contains('sl2')){cnt.terlambat++;total++}
        else if(c.classList.contains('su')){cnt.uzur++;total++}
      });
      // BUG FIX: sebelumnya pct = hadir/total (total = hanya yang sudah ditandai).
      // Akibatnya, jika 10 santri dan baru 1 ditandai hadir, pct langsung 100%
      // padahal 9 belum diabsen. denominator yang benar adalah cards.length
      // (semua kartu yang dirender = semua target sesi), konsisten dengan
      // render awal di _renderAbsBody yang pakai targets.length.
      total = cards.length;
    } else {
      // Fallback: query DB (hanya untuk sesi ini, bukan semua)
      const abs=await DB.ga('absensi');const sa=abs.filter(a=>a.sesiId===sid);
      sa.forEach(a=>{if(a.status!=='none'&&cnt[a.status]!==undefined){cnt[a.status]++;total++}});
      // Jika ada absensi 'none' juga masuk hitungan total (mereka tetap santri target)
      sa.forEach(a=>{if(a.status==='none')total++});
    }
    const pct=total?Math.round(cnt.hadir/total*100):0;
    ['hadir','alpha','izin','sakit','terlambat','uzur'].forEach(st=>{
      const el=document.getElementById('sum-n-'+st);
      if(el)el.textContent=cnt[st];
    });
    const bar=document.getElementById('abp');if(bar)bar.style.width=pct+'%';
  },
  async absSumPop(st,sid){
    const [abs,snt]=await Promise.all([DB.ga('absensi'),DB.ga('santri')]);
    const sntM=mapBy(snt,'id');
    const list=abs.filter(a=>a.sesiId===sid&&a.status===st).map(a=>sntM[a.sntId]).filter(Boolean);
    const L={hadir:'Hadir',alpha:'Alpha',izin:'Izin',sakit:'Sakit',terlambat:'Terlambat',uzur:'Uzur'};
    OS(`<div class="sh">${L[st]} (${list.length})</div><div class="sb" style="padding-bottom:70px">
      ${list.map(x=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="CS();App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>
        <div><div class="snt-link" style="font-size:12px">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}</div></div>
      </div>`).join('')||'<div class="empty" style="padding:16px 0"><div class="es">Tidak ada.</div></div>'}
    </div>`);
  },
  async allHadir(sid){
    const sx=await DB.g('sesi',sid);if(sx?.locked&&S._adminMode!==true){T('\uD83D\uDD12 Sesi terkunci! Aktifkan Mode Admin untuk mengubah.');return}
    if(sx?.locked&&S._adminMode===true)S._adminOverride=true;
    try{
      // Untuk kegiatan shalat: akhiri uzur aktif tiap santri yang di-set hadir
      const k=await DB.g('kegiatan',sx?.kgId||'');
      const sk=sx?.skId?await DB.g('subKeg',sx.skId):null;
      const isShalat=_isShalatKegiatan(k?.nama,sk?.nama);
      const all=await DB.ga('absensi');
      for(const a of all.filter(x=>x.sesiId===sid)){
        a.status='hadir';a.oleh=(S._adminOverride?'[Admin] ':'')+(S.user?.nama||'-');a.updatedAt=Date.now();await DB.p('absensi',a);
        if(isShalat&&a.status==='hadir')await this._endUzur(a.sntId,'manual').catch(()=>{});
      }
      T('\u2705 Semua hadir!');
      document.querySelectorAll('.ac').forEach(c=>{c.className='ac sh2';c.querySelectorAll('.sb3').forEach((b,i)=>{b.className='sb3'+(i===0?' ah':'')})});
      await this._updSum(sid);
    } finally {
      delete S._adminOverride;
    }
  },  async allNone(sid){
    const sx=await DB.g('sesi',sid);
    if(sx?.locked&&S._adminMode!==true){T('\uD83D\uDD12 Sesi terkunci! Aktifkan Mode Admin untuk mengubah.');return}
    if(sx?.locked&&S._adminMode===true)S._adminOverride=true;
    if(!confirm('Reset semua absensi jadi belum diabsen?')){delete S._adminOverride;return}
    try{
      const abs=await DB.ga('absensi');
      const sa=abs.filter(a=>a.sesiId===sid);
      // Pre-fetch pelanggaran sekali untuk efisiensi (sebelumnya fetch per absensi)
      const allPel=await DB.ga('pelanggaran');
      for(const a of sa){
        // Hapus pelanggaran auto terkait kalau ada
        if(a.status==='alpha'||a.status==='terlambat'){
          const pelAuto=allPel.find(p=>p.absId===a.id&&p.tipe==='auto'&&p.status==='belum');
          if(pelAuto){await DB.d('pelanggaran',pelAuto.id);}
        }
        a.status='none';a.oleh=(S._adminOverride?'[Admin] ':'')+(S.user?.nama||'-');a.updatedAt=Date.now();
        await DB.p('absensi',a);
      }
      T('Reset! Semua absensi dikosongkan.');
      await this.renderAbs(sid,S._skId);
    } finally {
      delete S._adminOverride;
    }
  },
  async lockSesi(sid){
    OS(`<div class="cw"><div class="ci3">\uD83D\uDD12</div><div class="ct3">Kunci Sesi?</div>
      <div class="cs3">Data tidak bisa diubah setelah dikunci.</div>
      <div class="cbs"><button class="cc" onclick="CS()">Batal</button>
      <button class="co" style="background:var(--grad)" onclick="App._doLock('${sid}')">Kunci</button></div></div>`);
  },
  async _doLock(sid){const sx=await DB.g('sesi',sid);if(sx){sx.locked=true;sx.status='selesai';await DB.p('sesi',sx)}CS();T('Terkunci!');await this.renderAbs(sid,S._skId)},

  // ═══════════════════════════════════════════════════════════════
  // AUTO-LOCK — Ketika jam selesai sub-kegiatan sudah lewat:
  //  1. Sesi hari ini otomatis dibuat (kalau belum ada sama sekali)
  //  2. Santri yang belum diabsen ('none') otomatis ditandai 'alpha'
  //  3. Sesi dikunci (locked) — sama seperti kunci manual, butuh PIN
  //     admin (App._adminUnlock) untuk dibuka/diubah lagi.
  // Dipanggil tiap 60 detik (lihat _midnightScheduler) & tiap dashboard dibuka.
  // ═══════════════════════════════════════════════════════════════
  async _autoLockExpiredSesi(){
    // BUG FIX: guard konkurensi — sebelumnya tidak ada, jadi jika dash() dan
    // midnight scheduler keduanya memanggil fungsi ini bersamaan, keduanya
    // membuat record sesi & absensi yang sama (dengan id berbeda) → duplikat
    // absensi untuk setiap santri di setiap sub-kegiatan yang auto-lock.
    // ── C2 BUG FIX: Persist guard via localStorage ──
    // Flag in-memory hilang saat reload. Jika reload terjadi di tengah proses
    // (atau midnight scheduler trigger bersamaan dengan init), guard hilang
    // dan bisa lock dobel. Sekarang pakai timestamp: jika lock <60s yang lalu,
    // anggap masih berjalan (anti-stale).
    if (this._autoLocking) return;
    const _lockTs = parseInt(localStorage.getItem('_al_lock_ts') || '0', 10);
    if (_lockTs && (Date.now() - _lockTs) < 60000) return;
    localStorage.setItem('_al_lock_ts', String(Date.now()));
    this._autoLocking = true;
    try{
      const now=new Date();
      const day=now.getDay();
      const nowHHMM=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
      const today=_todayLocal();
      const [kg,sk,ses,snt,ang]=await Promise.all([DB.ga('kegiatan'),DB.ga('subKeg'),DB.ga('sesi'),DB.ga('santri'),DB.ga('anggota')]);
      const sntMap={};for(const s of snt)sntMap[s.id]=s;
      const activeToday=(item)=>{
        if(!item.hariAktif||!Array.isArray(item.hariAktif)||item.hariAktif.length===0)return true;
        return item.hariAktif.includes(day);
      };
      const izinMap=await this._izinAktifMap(today);
      let lockedCount=0,alphaCount=0,pelCount=0,affectedSid=null;
      // Pre-fetch pelanggaran sekali untuk cek duplikat (di-loop update di dalam iterasi)
      let allPel=await DB.ga('pelanggaran');
      const pelByAbs={};for(const p of allPel)if(p.absId)pelByAbs[p.absId]=p;
      for(const s of sk){
        if(s.aktif===false||s.deleted)continue;
        const parent=kg.find(k=>k.id===s.kgId);
        if(!parent||parent.aktif===false||parent.deleted)continue;
        // ── Effective jam: jam sub sendiri, atau waris dari kegiatan induk ──
        const effJm=s.jamMulai||parent.jamMulai||'';
        const effJs=s.jamSelesai||parent.jamSelesai||'';
        if(!effJm||!effJs)continue; // wajib punya jam (sendiri atau warisan) utk auto-lock
        if(effJm>effJs)continue; // window lintas-tengah-malam — dilewati (ambigu utk auto-lock harian)
        // ── Effective hari: hari sub sendiri, atau waris dari parent, atau null (=setiap hari) ──
        const effHari=(Array.isArray(s.hariAktif)&&s.hariAktif.length)?s.hariAktif:((Array.isArray(parent.hariAktif)&&parent.hariAktif.length)?parent.hariAktif:null);
        if(!activeToday({hariAktif:effHari}))continue;
        if(nowHHMM<=effJs)continue; // jam selesai belum lewat

        const sid='ses_'+today+'_'+s.kgId+'_'+s.id;
        let sx=ses.find(x=>x.id===sid);
        if(sx&&sx.locked)continue; // sudah dikunci sebelumnya (manual/auto)

        // ── AUDIT v3m: CRITICAL FIX — Jangan auto-create absensi jika session
        // tidak ada di local IDB ──
        // Sebelumnya: jika session tidak ada lokal, kode membuat record absensi
        // baru dengan status='none' lalu langsung set 'alpha'. Tapi timestamp
        // baru ini lebih baru dari data cloud (yang mungkin sudah 'hadir'),
        // sehingga 'alpha' menimpa 'hadir' di cloud via onSnapshot.
        // Sekarang: jika session tidak ada lokal, SKIP auto-lock. Session akan
        // di-sync via onSnapshot dari cloud (yang sudah punya data correct).
        if(!sx){
          // Session tidak ada di lokal — cek apakah ada di cloud
          // Jika ada di cloud, biarkan onSnapshot handle. Jika tidak ada di
          // cloud sama sekali, baru create + auto-lock di device ini.
          // Quick cloud check: fetch sesi by ID
          if (navigator.onLine) {
            try {
              const cloudDoc = await _fsDB.collection('tenants').doc(_fbNs()).collection('sesi').doc(sid).get();
              if (cloudDoc.exists) {
                // Session ada di cloud — sync akan handle via onSnapshot
                // Jangan auto-create + auto-lock di sini
                console.log('[AutoLock] Skip', sid, '— session exists in cloud, will sync via onSnapshot');
                continue;
              }
            } catch(e) {
              // Cloud check gagal — fallback ke old behavior (create + lock)
              console.warn('[AutoLock] cloud check failed for', sid, '— fallback to create');
            }
          }
          // Session tidak ada di cloud juga — aman untuk create + auto-lock
          const isShalat = _isShalatKegiatan(parent?.nama, s?.nama);
          const uzurMapAuto = isShalat ? await this._uzurAktifMap(today) : {};
          const sakitMapAuto = await this._sakitAktifMap(today);

          sx={id:sid,tanggal:today,kgId:s.kgId,skId:s.id,status:'draft',createdAt:Date.now(),locked:false};
          await DB.p('sesi',sx);
          const angSk=ang.filter(a=>a.skId===s.id);
          const targets=angSk.map(a=>a.sntId);
          for(const sntId of targets){
            let _st='none', _pid=null, _oleh='Sistem (Auto)';
            if (isShalat && uzurMapAuto[sntId]) {
              _st='uzur'; _oleh='Sistem (Uzur aktif)';
            } else if (sakitMapAuto[sntId]) {
              _st='sakit'; _oleh='Sistem (Catatan Sakit)';
            } else if (izinMap[sntId]) {
              _st='izin'; _pid=izinMap[sntId]; _oleh='Sistem (Perizinan)';
            }
            await DB.p('absensi',{id:absDetId(sid,sntId),sesiId:sid,sntId,status:_st,perizinanId:_pid,oleh:_oleh,updatedAt:Date.now()});
          }
        } else {
          // Session sudah ada di lokal — aman untuk auto-lock
          // Pastikan tidak menimpa status yang sudah valid (hadir/izin/sakit/uzur/terlambat)
          const isShalat = _isShalatKegiatan(parent?.nama, s?.nama);
          const uzurMapAuto = isShalat ? await this._uzurAktifMap(today) : {};
          const sakitMapAuto = await this._sakitAktifMap(today);
        }
        // Tandai semua yang masih 'none' (belum diabsen sama sekali) jadi 'alpha'
        // sekaligus catat pelanggaran auto 'Alpha' supaya masuk ke daftar pelanggaran
        // ── AUDIT v3d FIX: Hanya yang BENAR-BENAR 'none' yang jadi alpha ──
        // Sebelumnya: loop ini mengubah SEMUA 'none' jadi alpha, termasuk yang
        // seharusnya uzur/sakit/izin (jika statusnya sempat di-set ke 'none'
        // oleh bug di atas). Sekarang: cek ulang uzur/sakit/izin sebelum set alpha.
        const absNow=(await DB.ga('absensi')).filter(a=>a.sesiId===sid&&a.status==='none');
        for(const a of absNow){
          // Double-check: apakah santri ini punya uzur/sakit/izin aktif?
          const sntId=a.sntId;
          let finalStatus='alpha';
          let finalOleh='Sistem (Auto \u2014 waktu habis)';
          let finalPid=null;
          if (isShalat && uzurMapAuto[sntId]) {
            finalStatus='uzur'; finalOleh='Sistem (Uzur aktif \u2014 auto-lock)';
          } else if (sakitMapAuto[sntId]) {
            finalStatus='sakit'; finalOleh='Sistem (Catatan Sakit \u2014 auto-lock)';
          } else if (izinMap[sntId]) {
            finalStatus='izin'; finalOleh='Sistem (Perizinan \u2014 auto-lock)'; finalPid=izinMap[sntId];
          }
          a.status=finalStatus; a.oleh=finalOleh; a.updatedAt=Date.now();
          if (finalPid) a.perizinanId=finalPid;
          await DB.p('absensi',a);
          if (finalStatus === 'alpha') {
            alphaCount++;
            // ── Buat pelanggaran auto 'Alpha' (sekali per absensi) ──
            // HANYA untuk alpha — bukan untuk uzur/sakit/izin
            if(!pelByAbs[a.id]){
              const sn=sntMap[a.sntId];
              const newPel={id:uid(),tipe:'auto',absId:a.id,sntId:a.sntId,sntNama:sn?.nama||'-',
                kgId:s.kgId,kgNama:parent.nama||'-',skId:s.id,skNama:s.nama||'-',
                tanggal:today,
                status:'belum',catatanHukuman:'',fotoHukuman:'',
                pelanggaranJenis:'Alpha',
                autoSource:'waktu_habis',
                createdAt:Date.now(),updatedAt:Date.now()};
              await DB.p('pelanggaran',newPel);
              pelByAbs[a.id]=newPel;
              pelCount++;
            }
          }
        }
        sx.locked=true;sx.status='selesai';sx.updatedAt=Date.now();
        await DB.p('sesi',sx);
        lockedCount++;affectedSid=sid;
      }
      // ── H6 BUG FIX: Auto-lock untuk kegiatan TANPA sub-kegiatan ──
      // Sebelumnya loop hanya iterasi sk (subKeg). Kegiatan induk tanpa sub
      // apapun tidak pernah di-auto-lock → tidak pernah alpha otomatis,
      // harus manual selamanya. Sekarang: untuk kegiatan yang aktif &
      // punya jam sendiri TAPI tidak punya sub-kegiatan sama sekali, auto-lock
      // dengan sesi "main" (skId=null) — semua santri aktif jadi target.
      for(const k of kg){
        if(k.aktif===false||k.deleted)continue;
        // Skip kalau kegiatan punya sub-kegiatan (sudah di-handle loop di atas)
        const hasSub = sk.some(s => s.kgId===k.id && s.aktif!==false && !s.deleted);
        if(hasSub)continue;
        // Skip kalau kegiatan tidak punya jam sendiri
        if(!k.jamMulai||!k.jamSelesai)continue;
        if(k.jamMulai>k.jamSelesai)continue; // overnight, skip
        // Skip kalau tidak aktif hari ini
        if(!activeToday(k))continue;
        // Skip kalau jam selesai belum lewat
        if(nowHHMM<=k.jamSelesai)continue;
        const sid='ses_'+today+'_'+k.id;
        let sx=ses.find(x=>x.id===sid);
        if(sx&&sx.locked)continue;
        // ── AUDIT v3m: CRITICAL FIX — sama dengan loop sub-kegiatan ──
        // Jika session tidak ada lokal, cek cloud dulu. Jika ada di cloud,
        // skip auto-lock (onSnapshot akan sync data yang benar).
        if(!sx){
          if (navigator.onLine) {
            try {
              const cloudDoc = await _fsDB.collection('tenants').doc(_fbNs()).collection('sesi').doc(sid).get();
              if (cloudDoc.exists) {
                console.log('[AutoLock] Skip', sid, '— session exists in cloud');
                continue;
              }
            } catch(e) {
              console.warn('[AutoLock] cloud check failed for', sid);
            }
          }
          // Session tidak ada di cloud — aman untuk create + auto-lock
          const isShalatK = _isShalatKegiatan(k?.nama, null);
          const uzurMapAutoK = isShalatK ? await this._uzurAktifMap(today) : {};
          const sakitMapAutoK = await this._sakitAktifMap(today);
          sx={id:sid,tanggal:today,kgId:k.id,skId:null,status:'draft',createdAt:Date.now(),locked:false};
          await DB.p('sesi',sx);
          const targets=snt.filter(x=>x.aktif).map(x=>x.id);
          for(const sntId of targets){
            let _st='none', _pid=null, _oleh='Sistem (Auto)';
            if (isShalatK && uzurMapAutoK[sntId]) {
              _st='uzur'; _oleh='Sistem (Uzur aktif)';
            } else if (sakitMapAutoK[sntId]) {
              _st='sakit'; _oleh='Sistem (Catatan Sakit)';
            } else if (izinMap[sntId]) {
              _st='izin'; _pid=izinMap[sntId]; _oleh='Sistem (Perizinan)';
            }
            await DB.p('absensi',{id:absDetId(sid,sntId),sesiId:sid,sntId,status:_st,perizinanId:_pid,oleh:_oleh,updatedAt:Date.now()});
          }
        }
        // ── AUDIT v3d FIX: Double-check uzur/sakit/izin sebelum set alpha ──
        const absNow=(await DB.ga('absensi')).filter(a=>a.sesiId===sid&&a.status==='none');
        for(const a of absNow){
          const sntId=a.sntId;
          let finalStatus='alpha';
          let finalOleh='Sistem (Auto \u2014 waktu habis)';
          let finalPid=null;
          if (isShalatK && uzurMapAutoK[sntId]) {
            finalStatus='uzur'; finalOleh='Sistem (Uzur aktif \u2014 auto-lock)';
          } else if (sakitMapAutoK[sntId]) {
            finalStatus='sakit'; finalOleh='Sistem (Catatan Sakit \u2014 auto-lock)';
          } else if (izinMap[sntId]) {
            finalStatus='izin'; finalOleh='Sistem (Perizinan \u2014 auto-lock)'; finalPid=izinMap[sntId];
          }
          a.status=finalStatus; a.oleh=finalOleh; a.updatedAt=Date.now();
          if (finalPid) a.perizinanId=finalPid;
          await DB.p('absensi',a);
          if (finalStatus === 'alpha') {
            alphaCount++;
            if(!pelByAbs[a.id]){
              const sn=sntMap[a.sntId];
              const newPel={id:uid(),tipe:'auto',absId:a.id,sntId:a.sntId,sntNama:sn?.nama||'-',
                kgId:k.id,kgNama:k.nama||'-',skId:null,skNama:'',
                tanggal:today,
                status:'belum',catatanHukuman:'',fotoHukuman:'',
                pelanggaranJenis:'Alpha',
                autoSource:'waktu_habis',
                createdAt:Date.now(),updatedAt:Date.now()};
              await DB.p('pelanggaran',newPel);
              pelByAbs[a.id]=newPel;
              pelCount++;
            }
          }
        }
        sx.locked=true;sx.status='selesai';sx.updatedAt=Date.now();
        await DB.p('sesi',sx);
        lockedCount++;affectedSid=sid;
      }
      if(lockedCount>0){
        T(`\uD83D\uDD12 ${lockedCount} sesi otomatis dikunci \u2014 ${alphaCount} santri belum absen ditandai Alpha${pelCount>0?` & ${pelCount} pelanggaran Alpha tercatat`:''}.`,4500);
        // Refresh halaman absensi jika sedang dibuka & terpengaruh
        if(S.page==='abs'&&S._sesiId&&S._sesiId===affectedSid)await this.renderAbs(S._sesiId,S._skId).catch(()=>{});
        if(S.page==='dash')await this.dash().catch(()=>{});
        if(S.page==='kg')await this.renderKg().catch(()=>{});
        if(S.page==='pel')await this.renderPel().catch(()=>{});
        // Cek santri yang alpha di SEMUA kegiatannya hari ini → kirim peringatan ke Chat & Notifikasi
        await this._checkAlphaWarning(today).catch(e=>console.warn('[AlphaWarning] error:',e));
      }
    }catch(e){console.warn('[AutoLock] error:',e);}
    finally{
      this._autoLocking=false;
      localStorage.removeItem('_al_lock_ts');
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // PERINGATAN ALPHA SEMUA KEGIATAN — kalau santri tercatat Alpha di
  // SEMUA kegiatan berjadwal yang dia ikuti hari ini (bukan cuma satu),
  // kirim peringatan otomatis ke Chat & Notifikasi supaya musyrifah
  // mengecek apakah santri benar-benar berada di pondok. Dikirim
  // maksimal 1x per santri per hari (dilacak lewat settings.alphaWarn_{tgl}).
  // ═══════════════════════════════════════════════════════════════
  async _checkAlphaWarning(today){
    // BUG FIX: guard konkurensi — sebelumnya jika dash() dan _autoLockExpiredSesi
    // keduanya memanggil fungsi ini bersamaan, keduanya baca warnedArr yang sama,
    // keduanya kirim notifikasi untuk santri yang sama → duplikat notifikasi chat.
    // ── C2 BUG FIX: Persist guard via localStorage (60s window) ──
    if (this._alphaWarnChecking) return;
    const _lockTs = parseInt(localStorage.getItem('_aw_lock_ts') || '0', 10);
    if (_lockTs && (Date.now() - _lockTs) < 60000) return;
    localStorage.setItem('_aw_lock_ts', String(Date.now()));
    this._alphaWarnChecking = true;
    try{
      const day=new Date().getDay();
      const [sk,kg,ses,abs,snt,ang]=await Promise.all([DB.ga('subKeg'),DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('anggota')]);
      const activeToday=(item)=>{
        if(!item.hariAktif||!Array.isArray(item.hariAktif)||item.hariAktif.length===0)return true;
        return item.hariAktif.includes(day);
      };
      const relevantSk=sk.filter(s=>{
        if(s.aktif===false)return false;
        const p=kg.find(k=>k.id===s.kgId);
        if(!p||p.aktif===false)return false;
        // Effective jam: sub's own, or parent's
        const jm=s.jamMulai||p.jamMulai||'';
        const js=s.jamSelesai||p.jamSelesai||'';
        if(!jm||!js)return false;
        // Effective hari: sub's own, or parent's, or null (=setiap hari)
        const effHari=(Array.isArray(s.hariAktif)&&s.hariAktif.length)?s.hariAktif:((Array.isArray(p.hariAktif)&&p.hariAktif.length)?p.hariAktif:null);
        if(!activeToday({hariAktif:effHari}))return false;
        return true;
      });
      if(!relevantSk.length)return;
      const warnedKey='alphaWarn_'+today;
      const warnedArr=((await DB.g('settings',warnedKey))?.value)||[];
      const warnedSet=new Set(warnedArr);
      let changed=false;
      for(const s of snt.filter(x=>x.aktif)){
        if(warnedSet.has(s.id))continue;
        // Kegiatan berjadwal hari ini yang diikuti santri ini
        const myTargets=relevantSk.filter(sk2=>{
          const angSk=ang.filter(a=>a.skId===sk2.id);
          // Sub-kegiatan tanpa anggota → tidak diikuti siapa pun
          return angSk.length?angSk.some(a=>a.sntId===s.id):false;
        });
        if(!myTargets.length)continue;
        let allLocked=true,allAlpha=true,anyAlpha=false;
        for(const t of myTargets){
          const sid='ses_'+today+'_'+t.kgId+'_'+t.id;
          const sx=ses.find(x=>x.id===sid);
          if(!sx||!sx.locked){allLocked=false;break;}
          const a=abs.find(x=>x.sesiId===sid&&x.sntId===s.id);
          if(!a||a.status!=='alpha'){allAlpha=false;}
          else anyAlpha=true;
        }
        if(allLocked&&allAlpha&&anyAlpha){
          // BUG FIX: tandai & persist ke DB SEBELUM kirim notifikasi, agar
          // call konkuren yang baca warnedArr setelah ini tidak kirim duplikat.
          warnedSet.add(s.id);changed=true;
          await DB.p('settings',{id:warnedKey,value:[...warnedSet]});
          await _postSystemChatMessage(
            `⚠️ ${s.nama} (Kamar ${s.kamar||'-'}) tercatat Alpha di semua ${myTargets.length} kegiatan hari ini. Mohon dicek apakah santri benar-benar berada di pondok.`,
            {label:'Peringatan Alpha', icon:'⚠️', sevColor:'#ef4444', subtype:'alpha_warning'}
          );
        }
      }
      if(changed && !warnedSet.size) await DB.p('settings',{id:warnedKey,value:[...warnedSet]});
    }catch(e){console.warn('[AlphaWarning] error:',e);}
    finally{
      this._alphaWarnChecking=false;
      localStorage.removeItem('_aw_lock_ts');
    }
  },


  // Urutan kamar kustom: X 1, X 2, ..., X 12, Pengurus, Mba-mba, sisanya alfabetis
  _kamarOrder(k){
    if(!k)return 99;
    const s=String(k).trim();
    const m=s.match(/^X\s*(\d+)$/i);
    if(m){
      const n=parseInt(m[1]);
      if(n>=1&&n<=12)return n;
    }
    const low=s.toLowerCase();
    if(low==='pengurus')return 13;
    if(low==='mba mba'||low==='mba-mba'||low==='mbamba'||low==='mba')return 14;
    return 99+low.charCodeAt(0);
  },
  _sortSantri(arr){
    const dir=S._sntSortDir==='desc'?-1:1;
    return [...arr].sort((a,b)=>{
      const ka=this._kamarOrder(a.kamar),kb=this._kamarOrder(b.kamar);
      if(ka!==kb)return (ka-kb)*dir;
      return a.nama.localeCompare(b.nama,'id');
    });
  },
  _filterSntList(){
    const q=(document.getElementById('snt-search')?.value||'').toLowerCase().trim();
    const items=document.querySelectorAll('#snt-list-items [data-sntrow]');
    let visible=0;
    items.forEach(el=>{
      const nama=el.getAttribute('data-nama')||'';
      const kamar=el.getAttribute('data-kamar')||'';
      const match=!q||nama.toLowerCase().includes(q)||kamar.toLowerCase().includes(q);
      el.style.display=match?'flex':'none';
      if(match)visible++;
    });
    const empty=document.getElementById('snt-empty');
    if(empty)empty.style.display=visible===0?'block':'none';
  },
  _toggleSntSort(){
    S._sntSortDir=S._sntSortDir==='desc'?'asc':'desc';
    this.renderSnt();
  },
  _toggleSntFab(){
    const menu=document.getElementById('snt-fab-menu');
    const overlay=document.getElementById('snt-fab-overlay');
    if(!menu)return;
    const isOpen=menu.style.display==='block';
    if(isOpen){menu.style.display='none';if(overlay)overlay.style.display='none'}
    else{menu.style.display='block';if(overlay)overlay.style.display='block'}
  },
  _closeSntFab(){
    const menu=document.getElementById('snt-fab-menu');
    const overlay=document.getElementById('snt-fab-overlay');
    if(menu)menu.style.display='none';
    if(overlay)overlay.style.display='none';
  },
  async renderSnt(kamar,bulkMode){
    const [snt,km,per]=await Promise.all([DB.ga('santri'),DB.ga('kamar'),DB.ga('perizinan')]);
    const aktif=snt.filter(x=>x.aktif);
    const curK=kamar||S.sntKamar||'Semua';S.sntKamar=curK;
    const kns=['Semua',...km.map(k=>k.nama).sort((a,b)=>this._kamarOrder(a)-this._kamarOrder(b))];
    let f=curK==='Semua'?aktif:aktif.filter(x=>x.kamar===curK);
    if(!S._sntSortDir)S._sntSortDir='asc';
    f=this._sortSantri(f);
    const isBulk=bulkMode||S._sntBulk||false;S._sntBulk=isBulk;
    if(!isBulk) S._sntSelected=new Set();
    document.getElementById('ps').textContent=aktif.length+' santri';
    // Status pondok hari ini untuk card di atas
    const today=_todayLocal();
    const sedangIzin=per.filter(p=>p.status==='disetujui'&&!p.sudahKembali&&p.tglMulai<=today&&!this._isSakitAsrama(p));
    const tidakDiPondokIds=new Set(sedangIzin.map(p=>p.sntId));
    const diPondokCount=aktif.filter(s=>!tidakDiPondokIds.has(s.id)).length;
    const tidakDiPondokCount=aktif.filter(s=>tidakDiPondokIds.has(s.id)).length;
    document.getElementById('snt-body').innerHTML=`<div style="padding:0 15px 10px">
      <!-- Card Status Santri Hari Ini -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px">
        <div onclick="App._popStatusPondok('di_pondok')" style="background:var(--su);border:1.5px solid rgba(13,181,127,.22);border-radius:var(--r3);padding:12px 10px;text-align:center;cursor:pointer;backdrop-filter:blur(16px);transition:transform .15s" onmousedown="this.style.transform='scale(.96)'" onmouseup="this.style.transform='scale(1)'">
          <div style="font-size:20px;font-weight:800;color:var(--a1)">${diPondokCount}</div>
          <div style="font-size:9px;color:var(--t3);font-weight:700;margin-top:2px;line-height:1.3">Di Pondok</div>
        </div>
        <div onclick="App._popStatusPondok('tidak_di_pondok')" style="background:var(--su);border:1.5px solid rgba(245,158,11,.22);border-radius:var(--r3);padding:12px 10px;text-align:center;cursor:pointer;backdrop-filter:blur(16px);transition:transform .15s" onmousedown="this.style.transform='scale(.96)'" onmouseup="this.style.transform='scale(1)'">
          <div style="font-size:20px;font-weight:800;color:#f59e0b">${tidakDiPondokCount}</div>
          <div style="font-size:9px;color:var(--t3);font-weight:700;margin-top:2px;line-height:1.3">Tidak di Pondok</div>
        </div>
      </div>
      <!-- Search + Sort -->
      <div style="display:flex;gap:7px;margin-bottom:10px">
        <div style="flex:1;display:flex;align-items:center;gap:7px;background:var(--inp);border:1.5px solid var(--dv);border-radius:var(--r2);padding:9px 12px">
          <span style="color:var(--t4);font-size:14px">🔍</span>
          <input id="snt-search" class="fi" placeholder="Cari nama santri..." oninput="App._filterSntList()" style="border:none;padding:0;background:transparent;flex:1;font-size:13px">
        </div>
        <button onclick="App._toggleSntSort()" title="Urutan: ${S._sntSortDir==='asc'?'A-Z':'Z-A'}" style="width:42px;height:42px;border-radius:var(--r2);background:var(--su);border:1.5px solid var(--dv);font-size:13px;font-weight:700;color:var(--t1);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${S._sntSortDir==='asc'?'AZ':'ZA'}
        </button>
      </div>
      <div class="fwrap${S._sntKmOpen===true?' on':''}" id="snt-km-fwrap">
        <div class="fwrap-h" onclick="App._togFilter('snt-km-fwrap')">
          <div class="fwrap-h-lb">Filter Kamar${curK!=='Semua'?` <span style="font-size:9px;color:var(--a1);background:var(--gs);padding:1px 6px;border-radius:100px">${esc(curK)}</span>`:''}</div>
          <span class="fwrap-h-ic">▾</span>
        </div>
        <div class="fwrap-b">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
            ${kns.map(k=>`<div class="kc${k===curK?' on':''}" onclick="App.renderSnt('${k}')" style="text-align:center;padding:10px 4px;border-radius:var(--r3);font-size:12px;min-height:40px;display:flex;align-items:center;justify-content:center">${k}</div>`).join('')}
          </div>
        </div>
      </div>
      ${isBulk?`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:11px">
        <button style="padding:11px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:11px;font-weight:600;color:var(--t2);cursor:pointer;width:100%" onclick="S._sntBulk=false;App.renderSnt(S.sntKamar,false)">Batal</button>
        <button onclick="App._sntSelAll()" style="padding:11px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:11px;font-weight:600;color:var(--a1);cursor:pointer;width:100%">Pilih Semua</button>
        <button onclick="App._sntDelBulk()" style="padding:11px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:11px;font-weight:700;cursor:pointer;border:none;box-shadow:0 3px 12px rgba(239,68,68,.3);border-radius:var(--r3);width:100%">Hapus \u2713</button>
      </div>`:''}
      <div style="display:flex;flex-direction:column;gap:7px" id="snt-list-items">
        ${f.map(x=>`<div data-sntrow data-nama="${esc(x.nama)}" data-kamar="${esc(x.kamar||'')}" style="display:flex;align-items:center;gap:9px;padding:11px;background:var(--su);border:1.5px solid ${isBulk&&S._sntSelected?.has(x.id)?'var(--a1)':'var(--sub)'};border-radius:var(--r4);backdrop-filter:blur(20px);cursor:pointer;transition:border-color .15s" id="sntrow-${x.id}" onclick="${isBulk?`App._sntTogSel('${x.id}',this)`:`App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})`}">
          ${isBulk?`<div class="ack${S._sntSelected?.has(x.id)?' on':''}" id="sntck-${x.id}">${S._sntSelected?.has(x.id)?'\u2713':''}</div>`:''}
          <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0">${x.foto?`<img src="${x.foto}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>`}</div>
          <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:5px;min-width:0"><div style="font-weight:600;font-size:13px;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.nama}</div>${x.nfcUid?`<span title="NFC UID: ${esc(x.nfcUid)}" style="font-size:11px;color:var(--a1);flex-shrink:0;line-height:1;cursor:help">\uD83D\uDCE1</span>`:''}</div><div style="font-size:10px;color:var(--t3)">Kamar ${x.kamar||'-'}${x.kelas?` \u00B7 ${x.kelas}`:''}${x.nis?` \u00B7 NIS ${x.nis}`:''}</div></div>
          ${!isBulk?`<span style="font-size:10px;font-weight:600;color:var(--a1);background:var(--gs);border:1px solid rgba(13,181,127,.14);border-radius:100px;padding:2px 8px">${x.kamar||'-'}</span><span style="font-size:12px;color:var(--t4);margin-left:4px">\u2192</span>`:''}
        </div>`).join('')}
        <div id="snt-empty" style="display:none"><div class="empty"><div class="es">Tidak ada santri.</div></div></div>
      </div>
    </div>
    <!-- AUDIT v3d: Virtualisasi list santri diaktifkan via _virtualizeSntList() setelah render -->
    <!-- FAB Tambah/Hapus Santri -->
    <div id="snt-fab-overlay" onclick="App._closeSntFab()" style="position:fixed;inset:0;z-index:299;background:rgba(0,0,0,.3);display:none"></div>
    <div id="snt-fab-menu" style="position:fixed;right:16px;bottom:148px;z-index:301;background:var(--bg);border:1.5px solid var(--sub);border-radius:var(--r4);box-shadow:0 16px 44px rgba(0,0,0,.22);overflow:hidden;display:none;min-width:200px;backdrop-filter:blur(22px)">
      <div style="padding:11px 14px;background:var(--gs);font-size:10px;font-weight:800;color:var(--a1);text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid var(--dv)">Aksi Santri</div>
      <div onclick="App._closeSntFab();App.addSnt()" style="padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;border-bottom:1px solid var(--dv);font-size:12px;font-weight:600;color:var(--t1)"><div style="width:28px;height:28px;border-radius:9px;background:rgba(13,181,127,.12);color:var(--a1);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">+</div>Tambah Santri</div>
      <div onclick="App._closeSntFab();App.renderSnt(S.sntKamar,true)" style="padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;font-size:12px;font-weight:600;color:#ef4444"><div style="width:28px;height:28px;border-radius:9px;background:rgba(239,68,68,.1);color:#ef4444;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">\u00D7</div>Hapus Santri</div>
    </div>
    <button onclick="App._toggleSntFab()" title="Aksi Santri" style="position:fixed;right:16px;bottom:88px;z-index:300;width:54px;height:54px;border-radius:50%;background:var(--grad);color:#fff;font-size:26px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(13,181,127,.45),0 2px 0 rgba(255,255,255,.3) inset;transition:transform .18s var(--ease)">+</button>`;
    // AUDIT v3d: Aktifkan virtualisasi setelah render selesai
    setTimeout(()=>this._virtualizeSntList(), 50);
  },
  // AUDIT v3d: Virtualisasi list santri — hanya tampilkan visible items
  _sntVirtState: null,
  _virtualizeSntList(){
    const items = document.querySelectorAll('#snt-list-items [data-sntrow]');
    if (items.length <= 50) return; // threshold: hanya virtualisasi jika > 50 item
    const container = document.getElementById('app');
    if (!container) return;
    // Cleanup listener lama jika ada
    if (this._sntVirtState) {
      this._sntVirtState.container.removeEventListener('scroll', this._sntVirtState.handler);
    }
    const itemHeight = 70; // approx tinggi per item (px)
    const buffer = 5;
    const updateVisibility = () => {
      const scrollTop = container.scrollTop;
      const viewportH = container.clientHeight;
      const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
      const endIdx = Math.min(items.length, Math.ceil((scrollTop + viewportH) / itemHeight) + buffer);
      for (let i = 0; i < items.length; i++){
        items[i].style.display = (i >= startIdx && i < endIdx) ? '' : 'none';
      }
    };
    // Throttled scroll
    let ticking = false;
    const handler = () => {
      if (!ticking){
        requestAnimationFrame(() => { updateVisibility(); ticking = false; });
        ticking = true;
      }
    };
    container.addEventListener('scroll', handler, {passive: true});
    this._sntVirtState = { container, handler };
    updateVisibility();
    console.log('[VirtualList] Santri: ' + items.length + ' items virtualized');
  },
  _sntTogSel(id,el){
    if(!S._sntSelected)S._sntSelected=new Set();
    const on=S._sntSelected.has(id);
    on?S._sntSelected.delete(id):S._sntSelected.add(id);
    const ck=document.getElementById('sntck-'+id);
    if(ck){ck.classList.toggle('on',!on);ck.textContent=on?'':'\u2713'}
    el.style.borderColor=on?'var(--sub)':'var(--a1)';
  },
  _sntSelAll(){
    const items=document.querySelectorAll('#snt-list-items [id^="sntrow-"]');
    if(!S._sntSelected)S._sntSelected=new Set();
    const allSelected=items.length>0&&[...items].every(el=>S._sntSelected.has(el.id.replace('sntrow-','')));
    items.forEach(el=>{
      const id=el.id.replace('sntrow-','');
      if(allSelected){S._sntSelected.delete(id)}else{S._sntSelected.add(id)}
      const ck=document.getElementById('sntck-'+id);
      if(ck){ck.classList.toggle('on',!allSelected);ck.textContent=allSelected?'':'\u2713'}
      el.style.borderColor=allSelected?'var(--sub)':'var(--a1)';
    });
  },
  async _sntDelBulk(){if(!_needAdmin())return;
    if(!S._sntSelected||S._sntSelected.size===0){T('Pilih santri dulu!');return}
    const n=S._sntSelected.size;
    OS(`<div class="cw"><div class="ci3">\u26A0</div><div class="ct3">Hapus ${n} Santri?</div>
      <div class="cs3">Data absensi mereka juga ikut terhapus permanen.</div>
      <div class="cbs"><button class="cc" onclick="CS()">Batal</button>
      <button class="co" onclick="App.__doBulkDel()">Hapus ${n} Santri</button></div></div>`);
  },
  async __doBulkDel(){if(!_needAdmin())return;
    const ids=[...S._sntSelected];
    for(const id of ids){
      await DB.d('santri',id);
      const abs=(await DB.ga('absensi')).filter(a=>a.sntId===id);
      for(const a of abs)await DB.d('absensi',a.id);
      const cats=(await DB.ga('catatanSantri')).filter(c=>c.sntId===id);
      for(const c of cats)await DB.d('catatanSantri',c.id);
      const pels=(await DB.ga('pelanggaran')).filter(p=>p.sntId===id);
      for(const p of pels)await DB.d('pelanggaran',p.id);
      const perz=(await DB.ga('perizinan')).filter(p=>p.sntId===id);
      for(const p of perz)await DB.d('perizinan',p.id);
    }
    S._sntSelected=new Set();S._sntBulk=false;
    CS();T(`\u2705 ${ids.length} santri dihapus!`);await this.renderSnt();
  },

  async renderSntd(sntId){
    // Redirect ke profil baru
    await this.nav('profil',{id:sntId});
  },

  async renderProfil(sntId){
    if(S._profilId!==sntId)S._profilTab='identitas';
    S._profilId=sntId;
    const [sn,absAll,sesAll,ang,sk,kg,catatan,kamarList,perAll,uzurAllSnt,sakitAllSnt]=await Promise.all([
      DB.g('santri',sntId),DB.ga('absensi'),DB.ga('sesi'),DB.ga('anggota'),DB.ga('subKeg'),DB.ga('kegiatan'),DB.ga('catatanSantri'),DB.ga('kamar'),DB.ga('perizinan'),DB.ga('uzur').catch(()=>[]),DB.ga('catatanSakit').catch(()=>[])
    ]);
    const kgM=mapBy(kg,'id');const skM=mapBy(sk,'id');
    if(!sn){document.getElementById('profil-body').innerHTML='<div class="empty"><div class="es">Santri tidak ditemukan.</div></div>';return}
    const sntAbs=absAll.filter(a=>a.sntId===sntId);
    const cnt={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0,uzur:0};
    sntAbs.forEach(a=>{if(cnt[a.status]!==undefined)cnt[a.status]++});
    const tot=sntAbs.length;const pct=tot?Math.round(cnt.hadir/tot*100):0;
    const statusCls={'Aktif':'status-aktif','Boyong':'status-boyong','Alumni':'status-alumni'};
    const st=sn.status||'Aktif';
    // Riwayat uzur santri ini (untuk tab Uzur)
    const sntUzurList=(uzurAllSnt||[]).filter(u=>u.sntId===sntId);
    const sntUzurAktif=sntUzurList.find(u=>u.aktif);

    // Hero header
    const fotoHtml=sn.foto
      ?`<div class="snt-foto-wrap" onclick="App._profilFoto('${sntId}')"><img src="${sn.foto}" class="snt-foto"><div class="foto-edit">📷</div></div>`
      :`<div class="snt-foto-wrap" onclick="App._profilFoto('${sntId}')"><div class="snt-av-big">${sn.nama.charAt(0)}</div><div class="foto-edit">📷</div></div>`;

    // Months for chart
    const months=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const now=new Date();
    const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const prevDate=new Date(now.getFullYear(),now.getMonth()-1,1);
    const prevMonth=`${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;

    const sesThis=sesAll.filter(x=>x.tanggal.startsWith(thisMonth));
    const sesPrev=sesAll.filter(x=>x.tanggal.startsWith(prevMonth));
    const absThis=sntAbs.filter(a=>sesThis.find(x=>x.id===a.sesiId));
    const absPrev=sntAbs.filter(a=>sesPrev.find(x=>x.id===a.sesiId));
    const pctThis=absThis.length?Math.round(absThis.filter(a=>a.status==='hadir').length/absThis.length*100):0;
    const pctPrev=absPrev.length?Math.round(absPrev.filter(a=>a.status==='hadir').length/absPrev.length*100):0;

    // Rekap bulanan bisa pilih bulan (seperti halaman Rekap Bulanan utama)
    const monthsFull=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    if(S._profilRkMonth===undefined||S._profilRkMonth===null){S._profilRkMonth=now.getMonth();S._profilRkYear=now.getFullYear();}
    const selMonthPfx=`${S._profilRkYear}-${String(S._profilRkMonth+1).padStart(2,'0')}`;
    const sesSel=sesAll.filter(x=>x.tanggal.startsWith(selMonthPfx));
    const absSel=sntAbs.filter(a=>sesSel.find(x=>x.id===a.sesiId));
    const cntSel={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
    absSel.forEach(a=>{if(cntSel[a.status]!==undefined)cntSel[a.status]++});
    const totSel=absSel.length;
    const pctSel=totSel?Math.round(cntSel.hadir/totSel*100):0;

    // Catatan
    const catSantri=catatan.filter(c=>c.sntId===sntId).sort((a,b)=>b.createdAt-a.createdAt);
    const catPrestasi=catSantri.filter(c=>c.tipe==='prestasi');
    const catPelanggaran=catSantri.filter(c=>c.tipe==='pelanggaran');
    const catUmum=catSantri.filter(c=>c.tipe==='umum');
    const catPsikologis=catSantri.filter(c=>c.tipe==='psikologis');
    const catKesehatan=catSantri.filter(c=>c.tipe==='kesehatan');
    // Riwayat Sakit (dari absensi status='sakit' + perizinan tipe sakit + catatanSakit)
    const sakitAbs=sntAbs.filter(a=>a.status==='sakit').map(a=>{
      const sx=sesAll.find(x=>x.id===a.sesiId);
      return{tipe:'absensi',tanggal:sx?.tanggal||_todayLocal(),sesiNama:sx?(kgM[sx.kgId]?.nama||'-'):'-',skNama:sx?.skId?(skM[sx.skId]?.nama||''):'-'};
    });
    const sakitPer=(perAll||[]).filter(p=>p.sntId===sntId&&this._isSakitIzin&&this._isSakitIzin(p)).map(p=>({tipe:'perizinan',tanggal:p.tglMulai,sampai:p.tglSelesai,tipeIzin:p.tipeIzin,alasan:p.alasan,status:p.status}));
    // Riwayat Catatan Sakit Santri (store catatanSakit)
    const sntSakitList=(sakitAllSnt||[]).filter(s=>s.sntId===sntId).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const sntSakitAktif=sntSakitList.find(s=>s.status==='belum_sembuh');
    const sntSakitRiwayat=sntSakitList.filter(s=>s.status==='sembuh');
    const sakitAll=[...sakitAbs,...sakitPer].sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
    // Timeline: gabungan event absensi, perizinan, catatan, pelanggaran
    const tlEvents=[];
    sntAbs.forEach(a=>{
      const sx=sesAll.find(x=>x.id===a.sesiId);
      if(!sx)return;
      const k=kgM[sx.kgId];
      if(a.status!=='hadir'){
        tlEvents.push({ts:new Date(sx.tanggal+'T'+(sx.jam||'12:00')).getTime(),tanggal:sx.tanggal,icon:a.status==='alpha'?'❌':a.status==='izin'?'📋':a.status==='sakit'?'🤒':'⏰',judul:(k?.nama||'-')+(sx.skId?' · '+(skM[sx.skId]?.nama||''):''),ket:a.status.charAt(0).toUpperCase()+a.status.slice(1),tipe:'absensi',status:a.status});
      }
    });
    (perAll||[]).filter(p=>p.sntId===sntId).forEach(p=>{
      tlEvents.push({ts:p.createdAt,tanggal:p.tglMulai,icon:'📋',judul:'Izin: '+p.tipeIzin,ket:p.alasan?p.alasan.slice(0,60):'',tipe:'perizinan',status:p.status});
    });
    // Timeline: catatanSakit events
    (sakitAllSnt||[]).filter(s=>s.sntId===sntId).forEach(s=>{
      tlEvents.push({ts:s.createdAt,tanggal:s.tglMulai,icon:'🤒',judul:'Catatan Sakit: '+(s.diagnosis||'-').slice(0,40),ket:s.penanganan?s.penanganan.slice(0,60):'',tipe:'sakit',status:s.status==='belum_sembuh'?'belum_sembuh':'sembuh'});
      if(s.status==='sembuh'&&s.sembuhAt){
        tlEvents.push({ts:s.sembuhAt,tanggal:new Date(s.sembuhAt).toISOString().slice(0,10),icon:'✅',judul:'Sembuh dari sakit',ket:(s.diagnosis||'').slice(0,60),tipe:'sakit_sembuh',status:'sembuh'});
      }
    });
    catSantri.forEach(c=>{
      const ic=c.tipe==='prestasi'?'⭐':c.tipe==='pelanggaran'?'⚠️':c.tipe==='psikologis'?'🧠':'📝';
      const lb=c.tipe==='prestasi'?'Prestasi':c.tipe==='pelanggaran'?'Pelanggaran':c.tipe==='psikologis'?'Catatan Psikologis':'Catatan';
      tlEvents.push({ts:c.createdAt,tanggal:new Date(c.createdAt).toISOString().slice(0,10),icon:ic,judul:lb,ket:c.isi.slice(0,80),tipe:'catatan'});
    });
    const pelAll=await DB.ga('pelanggaran');
    pelAll.filter(p=>p.sntId===sntId).forEach(p=>{
      tlEvents.push({ts:p.createdAt,tanggal:p.tanggal,icon:p.tipe==='auto'?'⚠️':'✏️',judul:'Pelanggaran '+(p.tipe==='auto'?'Alpha':'Non Alpha'),ket:p.deskripsi||p.kgNama||'',tipe:'pelanggaran',status:p.status});
    });
    tlEvents.sort((a,b)=>b.ts-a.ts);
    const tlHtml=tlEvents.slice(0,50).map(e=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--dv)">
      <div style="width:30px;height:30px;border-radius:50%;background:var(--gs);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${e.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">
          <div style="font-size:11px;font-weight:700;color:var(--t1)">${e.judul}</div>
          <div style="font-size:9px;color:var(--t4);flex-shrink:0">${e.tanggal.slice(5)}</div>
        </div>
        ${e.ket?`<div style="font-size:10px;color:var(--t3);margin-top:1px;line-height:1.4">${esc(e.ket)}</div>`:''}
        ${e.status?`<div style="font-size:9px;margin-top:2px"><span style="padding:1px 6px;border-radius:100px;background:${e.status==='sudah'||e.status==='disetujui'?'rgba(13,181,127,.12)':'rgba(239,68,68,.12)'};color:${e.status==='sudah'||e.status==='disetujui'?'var(--a1)':'#ef4444'};font-weight:700">${e.status}</span></div>`:''}
      </div>
    </div>`).join('');
    // Riwayat Alergi/Penyakit HTML (manual input via catatanSantri tipe='kesehatan')
    const kesehatanHistHtml=catKesehatan.map(c=>`<div style="background:var(--su);border:1px solid rgba(239,68,68,.18);border-radius:var(--r3);padding:10px 12px;margin-bottom:7px;backdrop-filter:blur(16px);position:relative">
      <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px">
        <button onclick="App._editCatKesehatan('${c.id}')" title="Edit" style="width:22px;height:22px;border-radius:50%;background:var(--su2);border:1px solid var(--dv);font-size:10px;cursor:pointer;color:var(--t3)">✏️</button>
        <button onclick="App._delCatKesehatan('${c.id}','${sntId}')" title="Hapus" style="width:22px;height:22px;border-radius:50%;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);font-size:10px;cursor:pointer;color:#ef4444">✕</button>
      </div>
      <div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:3px;padding-right:50px">🩺 ${esc(c.jenis||'Alergi/Penyakit')}</div>
      ${c.keterangan?`<div style="font-size:11px;color:var(--t2);line-height:1.5;margin-top:3px">${esc(c.keterangan)}</div>`:''}
      ${c.penanganan?`<div style="font-size:10px;color:var(--t3);margin-top:4px">💊 ${esc(c.penanganan)}</div>`:''}
      <div style="font-size:9px;color:var(--t4);margin-top:4px">${new Date(c.createdAt).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>`).join('');

    // Riwayat Perizinan
    const sntPer=perAll.filter(p=>p.sntId===sntId).sort((a,b)=>b.createdAt-a.createdAt);
    const izinBadgeMap={pending:['🕓 Menunggu','#f59e0b'],disetujui:['✅ Disetujui','var(--a1)'],ditolak:['✕ Ditolak','#ef4444']};
    const izinHistHtml=sntPer.map(p=>{
      const bm=izinBadgeMap[p.status]||izinBadgeMap.pending;
      return`<div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:10px 12px;margin-bottom:7px;backdrop-filter:blur(16px)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:12px;font-weight:700;color:var(--t1)">${p.tipeIzin}</span>
          <span style="font-size:9px;font-weight:700;color:${bm[1]}">${bm[0]}</span>
        </div>
        <div style="font-size:10px;color:var(--t3)">📅 ${p.tglMulai}${p.jamMulai?' '+p.jamMulai:''}${p.tglMulai!==p.tglSelesai?' s/d '+p.tglSelesai:''}${p.jamKembali?' '+p.jamKembali:''}</div>
        ${p.alasan?`<div style="font-size:10px;color:var(--t4);margin-top:2px">${esc(p.alasan)}</div>`:''}
        ${p.sudahKembali?`<div style="font-size:9px;color:var(--a1);margin-top:2px">↩️ Sudah kembali${p.waktuKembaliAktual?': '+new Date(p.waktuKembaliAktual).toLocaleString('id-ID'):''}</div>`:''}
        ${(p.catatanKeputusan||p.catatanTolak)?`<div style="font-size:9px;color:${p.status==='ditolak'?'#ef4444':'var(--t3)'};margin-top:2px">📝 ${esc(p.catatanKeputusan||p.catatanTolak)}</div>`:''}
      </div>`;
    }).join('');

    // Riwayat
    const histHtml=sntAbs.slice(-50).reverse().map(a=>{
      const sx=sesAll.find(x=>x.id===a.sesiId);const k=sx?kgM[sx.kgId]:null;
      const skItem=sx?.skId?skM[sx.skId]:null;
      if(!sx)return'';
      const delBtn=S._adminMode===true?`<button onclick="App._delAbsensi('${a.id}','${sntId}')" title="Hapus (Admin)" style="width:24px;height:24px;border-radius:50%;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">✕</button>`:'';
      return`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dv)">
        <div style="font-size:10px;color:var(--t3);width:70px;flex-shrink:0">${sx.tanggal.slice(5)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:var(--t1)">${k?.icon||''} ${k?.nama||'-'}</div>
          ${skItem?`<div style="font-size:9px;color:var(--t4)">${skItem.nama}</div>`:''}
        </div>
        <span class="bd ${bdgCls(a.status)}">${a.status}</span>
        ${delBtn}
      </div>`;
    }).join('');

    // Per-kegiatan stats
    const kgAktif=kg.filter(x=>x.aktif).sort((a,b)=>a.urutan-b.urutan);
    const kgStatsHtml=kgAktif.map(k=>{
      const kgSes=sesAll.filter(x=>x.kgId===k.id);
      const kgAbs=sntAbs.filter(a=>kgSes.find(x=>x.id===a.sesiId));
      if(!kgAbs.length)return'';
      const kc={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
      kgAbs.forEach(a=>{if(kc[a.status]!==undefined)kc[a.status]++});
      const kp=kgAbs.length?Math.round(kc.hadir/kgAbs.length*100):0;
      // Sub kegiatan stats
      const subs=sk.filter(x=>x.kgId===k.id);
      const subHtml=subs.map(s=>{
        const sSes=sesAll.filter(x=>x.skId===s.id);
        const sAbs=sntAbs.filter(a=>sSes.find(x=>x.id===a.sesiId));
        if(!sAbs.length)return'';
        const sc={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
        sAbs.forEach(a=>{if(sc[a.status]!==undefined)sc[a.status]++});
        const sp=sAbs.length?Math.round(sc.hadir/sAbs.length*100):0;
        return`<div style="padding:8px 10px;background:rgba(13,181,127,.03);border-top:1px solid var(--dv)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <div style="font-size:11px;font-weight:600;color:var(--t2)">🔹 ${s.nama}</div>
            <div style="font-size:10px;font-weight:700;color:var(--a1)">${sp}%</div>
          </div>
          <div style="display:flex;gap:4px">
            ${['hadir','alpha','izin','sakit','terlambat'].map(st2=>`<div style="flex:1;text-align:center;background:var(--gs);border-radius:var(--r1);padding:4px 2px">
              <div style="font-weight:800;font-size:11px;color:var(--t1)">${sc[st2]}</div>
              <div style="font-size:7px;color:var(--t4)">${st2.slice(0,3)}</div>
            </div>`).join('')}
          </div>
        </div>`;
      }).join('');
      return`<div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);margin-bottom:8px;overflow:hidden;backdrop-filter:blur(20px)">
        <div style="display:flex;align-items:center;gap:9px;padding:11px">
          <div style="font-size:22px">${k.icon}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px;color:var(--t1)">${k.nama}</div>
            <div style="display:flex;gap:3px;margin-top:5px">
              ${['hadir','alpha','izin','sakit','terlambat'].map(st2=>`<div style="flex:1;text-align:center;background:var(--gs);border-radius:var(--r1);padding:4px 2px">
                <div style="font-weight:800;font-size:12px;color:var(--t1)">${kc[st2]}</div>
                <div style="font-size:7px;color:var(--t4)">${st2.slice(0,3)}</div>
              </div>`).join('')}
            </div>
          </div>
          <div style="text-align:right"><div style="font-family:var(--fd);font-size:20px;font-weight:900;color:var(--a1)">${kp}%</div><div style="font-size:8px;color:var(--t4)">hadir</div></div>
        </div>
        ${subHtml}
      </div>`;
    }).join('');

    // Catatan render helpers — dengan foto besar di tengah
    const renderCatList=(list,tipe)=>list.length
      ?list.map(c=>`<div class="cat-card ${tipe==='psikologis'?'pelanggaran':tipe}" style="padding:10px 12px;${tipe==='psikologis'?'border-color:rgba(139,92,246,.25);background:rgba(139,92,246,.04)':''}">
          <div class="cat-actions">
            <button class="cat-btn" onclick="App._editCat('${c.id}')">✏️</button>
            <button class="cat-btn" onclick="App._delCat('${c.id}','${sntId}')">✕</button>
          </div>
          <div class="cat-chip ${tipe==='psikologis'?'umum':tipe}" style="${tipe==='psikologis'?'background:rgba(139,92,246,.13);color:#7c3aed;border:1px solid rgba(139,92,246,.27)':''}">${tipe==='prestasi'?'⭐ Prestasi':tipe==='pelanggaran'?'⚠️ Pelanggaran':tipe==='psikologis'?'🧠 Psikologis 🔒':'📝 Catatan'}</div>
          <div style="font-size:12px;color:var(--t1);line-height:1.55;margin-bottom:6px">${esc(c.isi)}</div>
          ${c.foto?`<div style="margin:8px 0;border-radius:var(--r3);overflow:hidden;max-height:220px;display:flex;align-items:center;justify-content:center;background:var(--gs)"><img src="${c.foto}" style="width:100%;max-height:220px;object-fit:cover;border-radius:var(--r3)" onclick="App._viewFotoCat('${c.foto}')" loading="lazy"></div>`:''}
          <div style="font-size:9px;color:var(--t4)">${new Date(c.createdAt).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</div>
        </div>`).join('')
      :`<div style="text-align:center;padding:14px 0;color:var(--t4);font-size:11px">Belum ada catatan ${tipe==='psikologis'?'psikologis':tipe}.</div>`;

    document.getElementById('profil-body').innerHTML=`
    <div>
      <!-- HERO HEADER -->
      <div class="hc" style="margin:0 15px 14px;border-radius:var(--r5);position:relative">
        <!-- Share icon pojok kanan atas -->
        <button onclick="App._shareProfilPop('${sntId}')" title="Share" style="position:absolute;top:10px;right:10px;z-index:10;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);border:1.5px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;backdrop-filter:blur(10px)">⬆</button>
        <div style="position:relative;z-index:1;padding:4px 0 0">
          <!-- Top: foto + nama + status -->
          <div style="text-align:center;margin-bottom:12px">
            ${fotoHtml}
            <div style="font-family:var(--fd);font-size:19px;font-weight:800;color:#fff;margin-bottom:4px">${sn.nama}</div>
            ${sn.panggilan?`<div style="font-size:12px;color:rgba(255,255,255,.75);margin-bottom:5px">"${sn.panggilan}"</div>`:''}
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap">
              <span class="${statusCls[st]}" style="backdrop-filter:blur(10px)">${st}</span>
              ${sn.nis?`<span style="background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);padding:3px 10px;border-radius:100px;font-size:10px;font-weight:700">NIS: ${sn.nis}</span>`:''}
            </div>
          </div>
          <!-- Info strip: kamar · kelas · wali -->
          <div style="background:rgba(0,0,0,.18);border-radius:14px;margin:0 2px 12px;padding:10px 14px;backdrop-filter:blur(8px)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:15px">🏠</span>
                <div>
                  <div style="font-size:8px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px">Kamar</div>
                  <div style="font-size:12px;font-weight:700;color:#fff">${sn.kamar||'-'}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:15px">📚</span>
                <div>
                  <div style="font-size:8px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px">Kelas</div>
                  <div style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sn.kelas||sn.kelasDiniah||'-'}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:15px">👤</span>
                <div style="min-width:0">
                  <div style="font-size:8px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px">Wali</div>
                  <div style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sn.waliNama||'-'}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                ${sn.waliWA
                  ?`<a href="https://wa.me/${sn.waliWA.replace(/\D/g,'')}" target="_blank" style="display:flex;align-items:center;gap:6px;text-decoration:none;width:100%">
                      <span style="width:32px;height:32px;border-radius:10px;background:#25d366;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">💬</span>
                      <div>
                        <div style="font-size:8px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px">WhatsApp</div>
                        <div style="font-size:12px;font-weight:700;color:#4ade80">Chat Wali</div>
                      </div>
                    </a>`
                  :`<span style="font-size:15px">📵</span><div><div style="font-size:8px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px">WhatsApp</div><div style="font-size:11px;color:rgba(255,255,255,.4)">Belum diisi</div></div>`}
              </div>
            </div>
          </div>
          <!-- Stats row -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:0 2px 2px">
            ${[['%',pct+'%','Hadir'],['📋',tot,'Total'],['❌',cnt.alpha,'Alpha'],['⚠️',catPelanggaran.length,'Catatan']].map(([ic,v,lb])=>`
            <div style="text-align:center;background:rgba(0,0,0,.15);border-radius:10px;padding:7px 2px">
              <div style="font-family:var(--fd);font-size:16px;font-weight:900;color:#fff;line-height:1">${v}</div>
              <div style="font-size:8px;color:rgba(255,255,255,.6);margin-top:2px">${lb}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- TABS — Identitas di paling kiri (default) -->
      <div style="padding:0 15px">
        <div class="tab-bar">
          <button class="tab-btn${S._profilTab==='identitas'?' on':''}" onclick="App._profilTab('identitas','${sntId}')">Identitas</button>
          <button class="tab-btn${S._profilTab==='rekap'?' on':''}" onclick="App._profilTab('rekap','${sntId}')">Rekap</button>
          <button class="tab-btn${S._profilTab==='izin'?' on':''}" onclick="App._profilTab('izin','${sntId}')">Izin${sntPer.length?' ('+sntPer.length+')':''}</button>
          <button class="tab-btn${S._profilTab==='sakit'?' on':''}" onclick="App._profilTab('sakit','${sntId}')">Sakit${sntSakitList.length?' ('+sntSakitList.length+')':''}</button>
          <button class="tab-btn${S._profilTab==='uzur'?' on':''}" onclick="App._profilTab('uzur','${sntId}')">Uzur${sntUzurList.length?' ('+sntUzurList.length+')':''}</button>
          <button class="tab-btn${S._profilTab==='catatan'?' on':''}" onclick="App._profilTab('catatan','${sntId}')">Catatan</button>
          <button class="tab-btn${S._profilTab==='timeline'?' on':''}" onclick="App._profilTab('timeline','${sntId}')">Timeline</button>
        </div>

        <!-- TAB: REKAP -->
        <div class="tab-pane${S._profilTab==='rekap'?' on':''}" id="tab-rekap">
          <!-- Stat row -->
          <div class="stat-grid-5" style="margin-bottom:12px">
            ${[['hadir',cnt.hadir,'✅'],['alpha',cnt.alpha,'❌'],['izin',cnt.izin,'📋'],['sakit',cnt.sakit,'🤒'],['terlambat',cnt.terlambat,'⏰']].map(([k2,v,ic])=>`
            <div class="stat-mini"><div class="stat-num" style="color:${k2==='hadir'?'var(--a1)':k2==='alpha'?'var(--ca)':k2==='izin'?'var(--ci)':k2==='sakit'?'var(--cs)':'var(--ct)'}">${v}</div><div class="stat-lbl">${ic}</div></div>`).join('')}
          </div>
          <!-- Progress -->
          <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:12px;margin-bottom:12px;backdrop-filter:blur(20px)">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <div style="font-size:11px;font-weight:700;color:var(--t2)">Kehadiran Keseluruhan</div>
              <div style="font-family:var(--fd);font-size:14px;font-weight:900;color:var(--a1)">${pct}%</div>
            </div>
            <div class="pw" style="height:7px"><div class="pf" style="width:${pct}%"></div></div>
          </div>
          <!-- Grafik bulanan -->
          <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:12px;margin-bottom:12px;backdrop-filter:blur(20px)">
            <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:10px">Grafik Bulanan</div>
            <div class="bar-chart">
              <div class="bar-item">
                <div class="bar-fill" style="height:${pctPrev}%;background:var(--gs);border:1px solid rgba(13,181,127,.2);max-height:100%"></div>
                <div class="bar-lbl">${months[prevDate.getMonth()]}</div>
                <div style="font-size:9px;font-weight:700;color:var(--t3)">${pctPrev}%</div>
              </div>
              <div class="bar-item">
                <div class="bar-fill" style="height:${pctThis}%;background:var(--grad);max-height:100%;box-shadow:0 2px 8px rgba(13,181,127,.3)"></div>
                <div class="bar-lbl">${months[now.getMonth()]}</div>
                <div style="font-size:9px;font-weight:700;color:var(--a1)">${pctThis}%</div>
              </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:8px">
              <div style="font-size:10px;color:var(--t3)">Bulan ini: <strong style="color:var(--a1)">${absThis.filter(a=>a.status==='hadir').length}/${absThis.length}</strong></div>
              <div style="font-size:10px;color:var(--t3)">Bulan lalu: <strong style="color:var(--t2)">${absPrev.filter(a=>a.status==='hadir').length}/${absPrev.length}</strong></div>
            </div>
          </div>
          <!-- Rekap Bulanan (bisa pilih bulan) -->
          <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:12px;margin-bottom:12px;backdrop-filter:blur(20px)">
            <div class="cn" style="margin-bottom:9px">
              <button class="cnb" onclick="App._profilRkNav('${sntId}',-1)">‹</button>
              <div class="cm">${monthsFull[S._profilRkMonth]} ${S._profilRkYear}</div>
              <button class="cnb" onclick="App._profilRkNav('${sntId}',1)">›</button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div style="font-size:11px;font-weight:700;color:var(--t2)">Kehadiran Bulan Ini</div>
              <div style="font-family:var(--fd);font-size:15px;font-weight:900;color:var(--a1)">${pctSel}%</div>
            </div>
            <div class="pw" style="height:7px;margin-bottom:11px"><div class="pf" style="width:${pctSel}%"></div></div>
            <div class="stat-grid-5">
              ${[['hadir',cntSel.hadir,'✅'],['alpha',cntSel.alpha,'❌'],['izin',cntSel.izin,'📋'],['sakit',cntSel.sakit,'🤒'],['terlambat',cntSel.terlambat,'⏰']].map(([k2,v,ic])=>`
              <div class="stat-mini"><div class="stat-num" style="color:${k2==='hadir'?'var(--a1)':k2==='alpha'?'var(--ca)':k2==='izin'?'var(--ci)':k2==='sakit'?'var(--cs)':'var(--ct)'}">${v}</div><div class="stat-lbl">${ic}</div></div>`).join('')}
            </div>
            <div style="font-size:10px;color:var(--t3);margin-top:8px">${totSel} sesi tercatat pada bulan ini</div>
          </div>
          <!-- Per kegiatan -->
          <div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1);margin-bottom:8px">Per Kegiatan</div>
          ${kgStatsHtml||'<div style="font-size:12px;color:var(--t3)">Belum ada data kegiatan.</div>'}
          <!-- Riwayat Absensi (digabung ke rekap) -->
          <div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1);margin:14px 0 8px">Riwayat Absensi (50 terakhir)</div>
          ${histHtml||'<div class="empty" style="padding:20px 0"><div class="es">Belum ada riwayat.</div></div>'}
        </div>

        <!-- TAB: IZIN -->
        <div class="tab-pane${S._profilTab==='izin'?' on':''}" id="tab-izin">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1)">Riwayat Perizinan</div>
            <button style="padding:6px 12px;border-radius:100px;background:var(--grad);border:none;font-size:10px;font-weight:700;color:#fff;cursor:pointer" onclick="App._addIzinManual()">+ Ajukan</button>
          </div>
          ${izinHistHtml||'<div class="empty" style="padding:20px 0"><div class="es">Belum ada riwayat perizinan.</div></div>'}
        </div>

        <!-- TAB: SAKIT (Catatan Sakit Santri) -->
        <div class="tab-pane${S._profilTab==='sakit'?' on':''}" id="tab-sakit">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
            <div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1)">Riwayat Catatan Sakit</div>
            <button style="padding:6px 12px;border-radius:100px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;font-size:10px;font-weight:700;color:#fff;cursor:pointer" onclick="App._addCatatanSakit('${sntId}','${escJ(sn.nama)}')">+ Catat Sakit</button>
          </div>
          ${sntSakitAktif?`<div style="background:rgba(245,158,11,.06);border:1.5px solid rgba(245,158,11,.22);border-radius:var(--r3);padding:11px 13px;margin-bottom:12px;backdrop-filter:blur(16px);cursor:pointer" onclick="App._detailCatatanSakit('${sntSakitAktif.id}')">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:50%;background:rgba(245,158,11,.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🤒</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
                  <span style="font-size:13px;font-weight:700;color:var(--t1)">Sedang Sakit</span>
                  <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid #d97706">🤒 Belum Sembuh · Hari ke-${this._hitungHariSakit(sntSakitAktif.tglMulai)}</span>
                </div>
                <div style="font-size:10px;color:var(--t3)">📅 Mulai ${sntSakitAktif.tglMulai}</div>
                ${sntSakitAktif.diagnosis?`<div style="font-size:10px;color:#d97706;margin-top:2px;font-weight:600">🩺 ${esc(sntSakitAktif.diagnosis).slice(0,80)}</div>`:''}
                ${sntSakitAktif.penanganan?`<div style="font-size:9px;color:var(--t4);margin-top:1px">💊 ${esc(sntSakitAktif.penanganan).slice(0,80)}</div>`:''}
              </div>
            </div>
          </div>`:`<div style="background:rgba(13,181,127,.06);border:1.5px solid rgba(13,181,127,.2);border-radius:var(--r3);padding:11px 13px;margin-bottom:12px;font-size:11px;color:var(--a1);font-weight:600;text-align:center">✅ Santri tidak sedang sakit</div>`}
          ${sntSakitRiwayat.length?`<div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin:14px 0 7px">📋 Riwayat Catatan Sakit (${sntSakitRiwayat.length})</div>${sntSakitRiwayat.map(s=>{
            const hariSakit=Math.max(1,Math.round(((s.sembuhAt||s.updatedAt||Date.now())-new Date(s.tglMulai+'T00:00:00').getTime())/86400000));
            const caraTxt={manual:'Ditandai manual',nfc:'Via NFC tap',hadir_manual:'Via set Hadir'}[s.caraBerakhir]||'Ditandai manual';
            return`<div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:10px 12px;margin-bottom:7px;backdrop-filter:blur(16px);cursor:pointer" onclick="App._detailCatatanSakit('${s.id}')">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                <span style="font-size:11px;font-weight:700;color:var(--t1)">📅 ${s.tglMulai}</span>
                <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(13,181,127,.12);color:var(--a1);border:1px solid var(--a1)">✅ Sembuh</span>
              </div>
              ${s.diagnosis?`<div style="font-size:10px;color:#d97706;font-weight:600;margin-top:2px">🩺 ${esc(s.diagnosis)}</div>`:''}
              ${s.penanganan?`<div style="font-size:9px;color:var(--t4);margin-top:2px">💊 ${esc(s.penanganan).slice(0,80)}${s.penanganan.length>80?'...':''}</div>`:''}
              ${s.sembuhAt?`<div style="font-size:9px;color:var(--t3);margin-top:3px">✅ Sembuh ${new Date(s.sembuhAt).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})} · ${hariSakit} hari · ${caraTxt}</div>`:''}
            </div>`;
          }).join('')}`:`<div class="empty" style="padding:14px 0"><div class="es">Belum ada riwayat catatan sakit.</div></div>`}
        </div>

        <!-- TAB: UZUR -->
        <div class="tab-pane${S._profilTab==='uzur'?' on':''}" id="tab-uzur">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
            <div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1)">Riwayat Uzur (Haid)</div>
            ${sntUzurAktif?`<span class="uzur-badge" style="font-size:10px;padding:4px 9px">🟣 Aktif · Hari ke-${_uzurDayCount(sntUzurAktif.tglMulai)}</span>`:''}
          </div>
          <div style="font-size:10px;color:var(--t3);margin-bottom:10px;line-height:1.5">Uzur dicatat otomatis saat pengurus memilih status Uzur pada absensi shalat. Berakhir otomatis saat santri tap NFC atau diubah Hadir di kegiatan shalat, atau setelah 15 hari.</div>
          ${this._renderProfilUzurTab(sntId,sntUzurList)}
        </div>

        <!-- TAB: CATATAN -->
        <div class="tab-pane${S._profilTab==='catatan'?' on':''}" id="tab-catatan">
          <div style="display:flex;gap:6px;margin-bottom:13px;flex-wrap:wrap">
            <button style="flex:1;min-width:30%;padding:11px 8px;border-radius:var(--r3);background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:13px;font-weight:700;color:var(--a1);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px" onclick="App.addCat('${sntId}','prestasi')"><span style="font-size:18px;line-height:1;font-weight:300">+</span><span style="font-size:11px">Prestasi</span></button>
            <button style="flex:1;min-width:30%;padding:11px 8px;border-radius:var(--r3);background:rgba(239,68,68,.06);border:1.5px solid rgba(239,68,68,.18);font-size:13px;font-weight:700;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px" onclick="App.addCat('${sntId}','pelanggaran')"><span style="font-size:18px;line-height:1;font-weight:300">+</span><span style="font-size:11px">Pelanggaran</span></button>
            <button style="flex:1;min-width:30%;padding:11px 8px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:13px;font-weight:700;color:var(--t2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px" onclick="App.addCat('${sntId}','umum')"><span style="font-size:18px;line-height:1;font-weight:300">+</span><span style="font-size:11px">Catatan</span></button>
            ${S._adminMode===true?`<button style="flex:1;min-width:100%;padding:11px 8px;border-radius:var(--r3);background:rgba(139,92,246,.08);border:1.5px solid rgba(139,92,246,.25);font-size:13px;font-weight:700;color:#7c3aed;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px" onclick="App.addCat('${sntId}','psikologis')"><span style="font-size:18px;line-height:1;font-weight:300">+</span><span style="font-size:11px">Catatan Psikologis 🔒</span></button>`:''}
          </div>
          <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">⭐ Prestasi (${catPrestasi.length})</div>
          ${renderCatList(catPrestasi,'prestasi')}
          <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 7px">⚠️ Pelanggaran (${catPelanggaran.length})</div>
          ${renderCatList(catPelanggaran,'pelanggaran')}
          <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 7px">📝 Catatan Umum (${catUmum.length})</div>
          ${renderCatList(catUmum,'umum')}
          ${S._adminMode===true?`<div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 7px;display:flex;align-items:center;gap:5px">🧠 Catatan Psikologis 🔒 (${catPsikologis.length})</div>${renderCatList(catPsikologis,'psikologis')}`:''}
        </div>

        <!-- TAB: TIMELINE -->
        <div class="tab-pane${S._profilTab==='timeline'?' on':''}" id="tab-timeline">
          <div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1);margin-bottom:8px">Timeline Santri (50 event terbaru)</div>
          ${tlHtml||'<div class="empty" style="padding:20px 0"><div class="es">Belum ada event.</div></div>'}
        </div>

        <!-- TAB: IDENTITAS -->
        <div class="tab-pane${S._profilTab==='identitas'?' on':''}" id="tab-identitas">
          <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);padding:4px 12px;backdrop-filter:blur(20px);margin-bottom:10px">
            ${[
              ['🏠','Kamar',sn.kamar||'-'],
              ['📚','Kelas / Tingkatan',sn.kelas||'-'],
              ['📿','Kelas Diniah',sn.kelasDiniah||'-'],
              ['🔢','NIS',sn.nis||'-'],
              ['📅','Tanggal Masuk',sn.tanggalMasuk||'-'],
              ['🎂','Tempat, Tanggal Lahir',sn.ttl||'-'],
              ['🏡','Alamat',sn.alamat||'-'],
              ['👤','Nama Wali',sn.waliNama||'-'],
              ['📱','WhatsApp Wali',sn.waliWA||'-'],
            ].map(([ic,lb,vl])=>`<div class="info-row">
              <div class="info-icon">${ic}</div>
              <div><div class="info-lbl">${lb}</div><div class="info-val">${vl==='+'?vl:esc(String(vl))}${lb==='WhatsApp Wali'&&sn.waliWA?` <a href="https://wa.me/${sn.waliWA.replace(/\D/g,'')}" target="_blank" style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;font-size:10px;color:#25d366;font-weight:700;background:rgba(37,211,102,.1);padding:2px 7px;border-radius:100px;border:1px solid rgba(37,211,102,.25)">💬 Chat</a>`:''}</div></div>
            </div>`).join('')}
            ${sn.catatanKesehatan?`<div class="info-row"><div class="info-icon">🏥</div><div><div class="info-lbl">Catatan Kesehatan</div><div class="info-val" style="font-size:12px;line-height:1.5">${esc(sn.catatanKesehatan)}</div></div></div>`:''}
          </div>
          <!-- Riwayat Alergi/Penyakit (manual input) -->
          <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);padding:12px;backdrop-filter:blur(20px);margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="font-family:var(--fd);font-size:12px;font-weight:800;color:var(--t1);display:flex;align-items:center;gap:6px">🩺 Riwayat Alergi/Penyakit <span style="font-size:10px;font-weight:600;color:var(--t3);background:var(--gs);border-radius:100px;padding:1px 7px">${catKesehatan.length}</span></div>
              <button onclick="App._addCatKesehatan('${sntId}')" style="padding:6px 12px;border-radius:100px;background:var(--grad);color:#fff;font-size:10px;font-weight:700;border:none;cursor:pointer">+ Tambah</button>
            </div>
            ${kesehatanHistHtml||'<div style="font-size:11px;color:var(--t3);padding:6px 0">Belum ada riwayat alergi/penyakit. Klik "+ Tambah" untuk menambahkan.</div>'}
          </div>
          <button class="bg2 bw" style="margin-bottom:8px" onclick="App.editProfil('${sntId}')">✏️ Edit Identitas</button>
          <button onclick="App.delSnt('${sntId}','${escJ(sn.nama)}')" style="width:100%;padding:13px;border-radius:100px;background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.2);color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:16px">🗑 Hapus Santri</button>
        </div>

      </div><!-- /padding -->
    </div>`;
  },

  _profilTab(tab,sntId){
    S._profilTab=tab;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('on'));
    document.querySelectorAll(`.tab-btn`).forEach(b=>{if(b.getAttribute('onclick')?.includes(`'${tab}'`))b.classList.add('on')});
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('on'));
    document.getElementById('tab-'+tab)?.classList.add('on');
  },

  // Navigasi bulan untuk kartu "Rekap Bulanan" di tab Rekap profil santri
  // (mirip navigator ‹ Bulan Tahun › di halaman Rekap Bulanan utama).
  async _profilRkNav(sntId,delta){
    if(S._profilRkMonth===undefined){const d=new Date();S._profilRkMonth=d.getMonth();S._profilRkYear=d.getFullYear();}
    S._profilRkMonth+=delta;
    if(S._profilRkMonth<0){S._profilRkMonth=11;S._profilRkYear--;}
    if(S._profilRkMonth>11){S._profilRkMonth=0;S._profilRkYear++;}
    await this.renderProfil(sntId);
  },

  async _shareProfilPop(sntId){
    const sn=await DB.g('santri',sntId);if(!sn)return;
    OS(`<div class="sh">⬆ Share — ${esc(sn.nama)}</div><div class="sb" style="padding-bottom:20px">
      <div style="display:flex;flex-direction:column;gap:9px">
        <button onclick="CS();App._shareIdentitas('${sntId}')" style="width:100%;padding:14px 16px;border-radius:var(--r3);background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:13px;font-weight:700;color:var(--t1);cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">👤</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--t1)">Identitas Santri</div><div style="font-size:11px;color:var(--t3);margin-top:1px">Salin data profil lengkap</div></div>
        </button>
        <button onclick="CS();Exp.shareSntBaru('${sntId}','harian')" style="width:100%;padding:14px 16px;border-radius:var(--r3);background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:13px;font-weight:700;color:var(--t1);cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">📅</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--t1)">Rekap Harian</div><div style="font-size:11px;color:var(--t3);margin-top:1px">Ringkasan absensi hari ini</div></div>
        </button>
        <button onclick="CS();Exp.shareSntBaru('${sntId}','bulanan')" style="width:100%;padding:14px 16px;border-radius:var(--r3);background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:13px;font-weight:700;color:var(--t1);cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">📊</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--t1)">Rekap Bulanan</div><div style="font-size:11px;color:var(--t3);margin-top:1px">Ringkasan absensi bulan ini</div></div>
        </button>
        <div style="height:1px;background:var(--dv);margin:4px 0"></div>
        <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;padding:0 2px">Export Seluruh Data Santri</div>
        <button onclick="CS();Exp.exportSntFull('${sntId}','word')" style="width:100%;padding:14px 16px;border-radius:var(--r3);background:rgba(37,99,235,.07);border:1.5px solid rgba(37,99,235,.22);font-size:13px;font-weight:700;color:#2563eb;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">📄</span>
          <div><div style="font-size:13px;font-weight:700;color:#2563eb">Export ke Word</div><div style="font-size:11px;color:var(--t3);margin-top:1px">Identitas, riwayat, catatan, izin, sakit, pelanggaran</div></div>
        </button>
        <button onclick="CS();Exp.exportSntFull('${sntId}','excel')" style="width:100%;padding:14px 16px;border-radius:var(--r3);background:rgba(22,163,74,.07);border:1.5px solid rgba(22,163,74,.22);font-size:13px;font-weight:700;color:#16a34a;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">📊</span>
          <div><div style="font-size:13px;font-weight:700;color:#16a34a">Export ke Excel</div><div style="font-size:11px;color:var(--t3);margin-top:1px">Semua data dalam bentuk tabel</div></div>
        </button>
        <button onclick="CS();Exp.exportSntFull('${sntId}','pdf')" style="width:100%;padding:14px 16px;border-radius:var(--r3);background:rgba(220,38,38,.07);border:1.5px solid rgba(220,38,38,.22);font-size:13px;font-weight:700;color:#dc2626;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">📕</span>
          <div><div style="font-size:13px;font-weight:700;color:#dc2626">Export ke PDF</div><div style="font-size:11px;color:var(--t3);margin-top:1px">Laporan lengkap siap cetak</div></div>
        </button>
      </div>
    </div>`);
  },

  // Reusable: resize file ke base64, kualitas tinggi agar jelas di semua device
  _resizeImg(file,max=800,quality=0.88){
    return new Promise((res,rej)=>{
      const reader=new FileReader();
      reader.onerror=rej;
      reader.onload=e=>{
        const img=new Image();
        img.onerror=rej;
        img.onload=()=>{
          let w=img.width,h=img.height;
          if(w>h){if(w>max){h=Math.round(h*max/w);w=max}}
          else{if(h>max){w=Math.round(w*max/h);h=max}}
          const cv=document.createElement('canvas');
          cv.width=w;cv.height=h;
          const ctx=cv.getContext('2d');
          if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
          ctx.drawImage(img,0,0,w,h);
          res(cv.toDataURL('image/jpeg',quality));
        };
        img.src=e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _profilFoto(sntId){
    DB.g('santri',sntId).then(sn=>{
      const hasFoto=!!sn?.foto;
      OS(`<div class="sh">Foto Santri</div><div class="sb" style="padding-bottom:80px">
        <div style="text-align:center;margin-bottom:20px">
          ${hasFoto
            ?`<img src="${sn.foto}" style="width:180px;height:180px;border-radius:16px;object-fit:cover;border:3px solid var(--a1);display:block;margin:0 auto">`
            :`<div style="width:180px;height:180px;border-radius:16px;background:var(--gs);border:2px dashed var(--dv);display:flex;align-items:center;justify-content:center;font-size:48px;margin:0 auto">👤</div>`}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="bg2 bw" onclick="App._triggerFotoSnt('${sntId}')">📷 ${hasFoto?'Ganti Foto':'Upload Foto'}</button>
          ${hasFoto?`<button style="padding:13px;border-radius:var(--r3);background:rgba(239,68,68,.08);border:1.5px solid rgba(239,68,68,.2);font-size:13px;font-weight:600;color:#ef4444;cursor:pointer;width:100%" onclick="App._hapusFotoSnt('${sntId}')">🗑 Hapus Foto</button>`:''}
          <button style="padding:13px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);font-size:13px;font-weight:600;color:var(--t2);cursor:pointer;width:100%" onclick="CS()">Tutup</button>
        </div>
      </div>`);
    });
  },
  _triggerFotoSnt(sntId){
    const inp=document.getElementById('foto-inp-snt');
    inp.dataset.sntId=sntId;inp.value='';inp.click();
  },
  async _hapusFotoSnt(sntId){if(!_needAdmin())return;
    const sn=await DB.g('santri',sntId);if(!sn)return;
    sn.foto='';sn.updatedAt=Date.now();await DB.p('santri',sn);
    CS();T('Foto dihapus!');await this.renderProfil(sntId);
  },

  async _onFotoSnt(inp){
    const file=inp.files[0];if(!file)return;
    const sntId=inp.dataset.sntId;if(!sntId){T('❌ Error: sntId kosong');return;}
    T('Memproses foto...');
    try{
      const b64=await this._resizeImg(file,900);
      const sn=await DB.g('santri',sntId);
      if(!sn){T('❌ Santri tidak ditemukan');return;}
      sn.foto=b64;sn.updatedAt=Date.now();
      await DB.p('santri',sn);
      T('✅ Foto tersimpan!');
      CS();
      await this.renderProfil(sntId);
    }catch(e){console.error(e);T('❌ Gagal: '+e.message);}
  },
  async _onFotoPel(inp){
    const file=inp.files[0];if(!file)return;
    T('Memproses foto...');
    try{
      const b64=await this._resizeImg(file,750);
      S._pelFotos=S._pelFotos||[];
      if(S._pelFotos.length>=2){T('Maksimal 2 foto');return;}
      S._pelFotos.push(b64);
      const preview=document.getElementById('pel-foto-list');
      if(preview)preview.innerHTML=S._pelFotos.map((f2,i)=>`<div style="position:relative"><img src="${f2}" style="width:64px;height:64px;border-radius:8px;object-fit:cover"><button onclick="S._pelFotos.splice(${i},1);App.renderPelFotoPreview()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;border:none;font-size:10px;cursor:pointer">✕</button></div>`).join('');
      T('✅ Foto ditambahkan!');
    }catch(e){T('❌ Gagal: '+e.message);}
  },
  renderPelFotoPreview(){
    const preview=document.getElementById('pel-foto-list');
    if(preview)preview.innerHTML=(S._pelFotos||[]).map((f2,i)=>`<div style="position:relative"><img src="${f2}" style="width:64px;height:64px;border-radius:8px;object-fit:cover"><button onclick="S._pelFotos.splice(${i},1);App.renderPelFotoPreview()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;border:none;font-size:10px;cursor:pointer">✕</button></div>`).join('');
  },
  async _onFotoTazir(inp){
    const file=inp.files[0];if(!file)return;
    T('Memproses foto...');
    try{
      const b64=await this._resizeImg(file,750);
      S._tazirFotoB64=b64;
      const preview=document.getElementById('tazir-foto-preview');
      if(preview)preview.innerHTML=`<img src="${b64}" style="width:80px;height:80px;border-radius:10px;object-fit:cover;border:2px solid var(--a1)">`;
      T('✅ Foto ditambahkan!');
    }catch(e){T('❌ Gagal: '+e.message);}
  },

  _userFoto(userId){
    const inp=document.getElementById('foto-inp-usr');
    inp.dataset.userId=userId;
    inp.value='';
    inp.click();
  },

  async _onFotoUsr(inp){
    const file=inp.files[0];if(!file)return;
    const userId=inp.dataset.userId;if(!userId)return;
    T('Memproses foto...');
    try{
      const b64=await this._resizeImg(file,900);
      const usr=await DB.g('users',userId);
      if(!usr){T('❌ User tidak ditemukan');return;}
      usr.foto=b64;usr.updatedAt=Date.now();
      await DB.p('users',usr);
      T('✅ Foto tersimpan!');
      // Update avatar preview di sheet jika sedang terbuka
      const avEl=document.getElementById('eu-av');
      if(avEl){
        avEl.innerHTML=`<img src="${b64}" style="width:70px;height:70px;border-radius:50%;object-fit:cover;border:3px solid var(--a1)">
          <div style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;border:2px solid var(--bg)">📷</div>`;
      }
      // Update avatar di navbar jika user yang login
      if(S.user?.id===userId){
        S.user.foto=b64;
        const ub=document.getElementById('ub');
        if(ub){ub.innerHTML=`<img src="${b64}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;}
      }
      // Update avatar di login screen
      const lsAv=document.querySelector(`#ls-grid .ls-av[data-uid="${userId}"]`);
      if(lsAv){lsAv.innerHTML=`<img src="${b64}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;}
      if(S.page==='set')await this.renderSet();
    }catch(e){T('❌ Gagal memproses foto');}
  },

  editProfil(sntId){
    DB.g('santri',sntId).then(sn=>{
      if(!sn)return;
      DB.ga('kamar').then(km=>{
        OS(`<div class="sh">Edit Profil Santri</div><div class="sb" style="padding-bottom:80px">
          <div class="fg"><label class="fl">Nama Lengkap</label><input class="fi" id="ep-nama" value="${esc(sn.nama||'')}"></div>
          <div class="fg"><label class="fl">Nama Panggilan</label><input class="fi" id="ep-panggilan" value="${esc(sn.panggilan||'')}"></div>
          <div class="fg"><label class="fl">NIS (Opsional)</label><input class="fi" id="ep-nis" value="${esc(sn.nis||'')}"></div>
          <div class="fg"><label class="fl">Kamar</label><select class="fsel" id="ep-kamar">${km.map(k=>`<option value="${k.nama}"${k.nama===sn.kamar?' selected':''}>${k.nama}</option>`).join('')}</select></div>
          <div class="fg"><label class="fl">Kelas / Tingkatan Formal</label><input class="fi" id="ep-kelas" value="${esc(sn.kelas||'')}" placeholder="Misal: SMA X, S1 Sem 2"></div>
          <div class="fg"><label class="fl">Kelas Diniah</label><input class="fi" id="ep-kelasdiniah" value="${esc(sn.kelasDiniah||'')}" placeholder="Misal: Ula 3, Wustho 1"></div>
          <div class="fg"><label class="fl">Tanggal Masuk</label><input class="fi" id="ep-masuk" type="date" value="${sn.tanggalMasuk||''}"></div>
          <div class="fg"><label class="fl">Tempat, Tanggal Lahir</label><input class="fi" id="ep-ttl" value="${esc(sn.ttl||'')}" placeholder="Misal: Surabaya, 12 Januari 2005"></div>
          <div class="fg"><label class="fl">Alamat</label><textarea class="fi" id="ep-alamat" rows="2" placeholder="Alamat lengkap..." style="resize:none">${esc(sn.alamat||'')}</textarea></div>
          <div class="fg"><label class="fl">Status</label><select class="fsel" id="ep-status"><option${(sn.status||'Aktif')==='Aktif'?' selected':''}>Aktif</option><option${sn.status==='Boyong'?' selected':''}>Boyong</option><option${sn.status==='Alumni'?' selected':''}>Alumni</option></select></div>
          <div style="height:1px;background:var(--dv);margin:14px 0"></div>
          <div class="fg"><label class="fl">Nama Wali</label><input class="fi" id="ep-wali" value="${esc(sn.waliNama||'')}"></div>
          <div class="fg"><label class="fl">No. WhatsApp Wali</label><input class="fi" id="ep-wa" value="${esc(sn.waliWA||'')}" placeholder="628xxx..."></div>
          <div style="height:1px;background:var(--dv);margin:14px 0"></div>
          <div style="height:1px;background:var(--dv);margin:14px 0"></div>
          <div class="fg">
            <label class="fl">NFC UID Kartu</label>
            <div style="display:flex;gap:6px">
              <input class="fi" id="ep-nfc" value="${esc(sn.nfcUid||'')}" placeholder="Scan atau isi manual: 04:A3:2B:9F" style="flex:1;font-family:monospace;font-size:12px">
              <button onclick="App._scanNfcForEdit()" title="Scan ulang kartu NFC" style="width:44px;height:44px;border-radius:var(--r3);background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">📡</button>
            </div>
            <div id="ep-nfc-status" style="font-size:10px;color:var(--a1);margin-top:4px;font-weight:700">📡 Siap — tempelkan kartu NFC ke HP, otomatis terisi tanpa perlu tap tombol</div>
          </div>
          <button class="bg2 bw" onclick="App._saveProfil('${sntId}')">💾 Simpan</button>
        </div>`);
        // Auto-scan langsung begitu sheet terbuka — tidak perlu klik tombol 📡
        setTimeout(()=>{ App._scanNfcForEdit(true); }, 250);
      });
    });
  },

  async _saveProfil(sntId){
    const sn=await DB.g('santri',sntId);if(!sn)return;
    const nama=document.getElementById('ep-nama')?.value.trim();if(!nama){T('Nama wajib!');return}
    // ── C4 BUG FIX: Validasi konflik NFC UID ──
    // Cek apakah NFC UID sudah dipakai santri lain. Tanpa ini, dua santri
    // bisa punya UID sama → tap NFC salah orang tanpa peringatan.
    const newNfcUid=(document.getElementById('ep-nfc')?.value.trim()||'').toUpperCase();
    if(newNfcUid){
      const allSnt=await DB.ga('santri');
      const normNew=newNfcUid.replace(/[:\s\-\.]/g,'');
      const conflict=allSnt.find(x=>x.id!==sntId && x.nfcUid && x.nfcUid.toUpperCase().replace(/[:\s\-\.]/g,'')===normNew);
      if(conflict){
        T('⚠️ NFC UID "'+newNfcUid+'" sudah dipakai santri: '+conflict.nama+'! Simpan dibatalkan.');
        return;
      }
    }
    // ── M9 BUG FIX: Validasi duplikat NIS ──
    const newNis=document.getElementById('ep-nis')?.value.trim()||'';
    if(newNis){
      const allSnt=await DB.ga('santri');
      const conflictNis=allSnt.find(x=>x.id!==sntId && String(x.nis||'').trim()===String(newNis).trim());
      if(conflictNis){
        T('⚠️ NIS "'+newNis+'" sudah dipakai santri: '+conflictNis.nama+'! Simpan dibatalkan.');
        return;
      }
    }
    sn.nama=nama;
    sn.panggilan=document.getElementById('ep-panggilan')?.value.trim()||'';
    sn.nis=newNis;
    sn.kamar=document.getElementById('ep-kamar')?.value||sn.kamar;
    sn.kelas=document.getElementById('ep-kelas')?.value.trim()||'';
    sn.kelasDiniah=document.getElementById('ep-kelasdiniah')?.value.trim()||'';
    sn.tanggalMasuk=document.getElementById('ep-masuk')?.value||'';
    sn.ttl=document.getElementById('ep-ttl')?.value.trim()||'';
    sn.alamat=document.getElementById('ep-alamat')?.value.trim()||'';
    sn.status=document.getElementById('ep-status')?.value||'Aktif';
    sn.waliNama=document.getElementById('ep-wali')?.value.trim()||'';
    sn.waliWA=document.getElementById('ep-wa')?.value.trim()||'';
    sn.catatanKesehatan=document.getElementById('ep-kesehatan')?.value.trim()||'';
    sn.nfcUid=newNfcUid;
    sn.updatedAt=Date.now();
    await DB.p('santri',sn);
    CS();T('✅ Profil disimpan!');
    // Update header title
    document.getElementById('pt').textContent=nama;
    await this.renderProfil(sntId);
  },

  // CATATAN
  addCat(sntId,tipe){
    if(tipe==='psikologis'&&!_needAdmin())return;
    const L={prestasi:'+ Tambah Prestasi',pelanggaran:'+ Tambah Pelanggaran',umum:'+ Tambah Catatan',psikologis:'🧠 + Tambah Catatan Psikologis'};
    const PH={prestasi:'Misal: Juara 1 MTQ Kabupaten...',pelanggaran:'Misal: Keluar tanpa izin...',umum:'Misal: Sering terlambat bangun...',psikologis:'Catatan psikologis santri (rahasia, hanya admin)...'};
    OS(`<div class="sh">${L[tipe]||'Tambah Catatan'}</div><div class="sb" style="padding-bottom:80px">
      ${tipe==='psikologis'?`<div style="background:rgba(139,92,246,.08);border:1.5px solid rgba(139,92,246,.25);border-radius:var(--r3);padding:10px 12px;margin-bottom:12px;font-size:11px;color:#7c3aed">🔒 Catatan psikologis hanya bisa diakses & dilihat oleh mode admin.</div>`:''}
      <div class="fg"><label class="fl">Isi Catatan</label><textarea class="fi" id="cat-isi" rows="4" placeholder="${PH[tipe]||'Tulis catatan...'}" style="resize:none;line-height:1.5"></textarea></div>
      ${tipe==='pelanggaran'?`<div class="fg"><label class="fl">Poin Pelanggaran (opsional)</label><input class="fi" id="cat-poin" type="number" min="0" placeholder="0"></div>`:''}
      <div class="fg">
        <label class="fl">Foto (opsional)</label>
        <div id="cat-foto-preview" style="display:none;margin-bottom:8px;border-radius:var(--r3);overflow:hidden;max-height:200px;text-align:center;background:var(--gs)">
          <img id="cat-foto-img" src="" style="max-width:100%;max-height:200px;object-fit:cover;border-radius:var(--r3)">
        </div>
        <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--r3);background:var(--gs);border:1.5px dashed rgba(13,181,127,.3);cursor:pointer;font-size:12px;color:var(--a1);font-weight:600">
          📷 Pilih Foto
          <input type="file" accept="image/*" id="cat-foto-input" style="display:none" onchange="App._prevCatFoto(this)">
        </label>
        <div id="cat-foto-clear" style="display:none;margin-top:6px">
          <button onclick="App._clearCatFoto()" style="font-size:11px;color:#ef4444;background:none;border:none;cursor:pointer;padding:0">✕ Hapus foto</button>
        </div>
      </div>
      <button class="bg2 bw" onclick="App._saveCat('${sntId}','${tipe}')">Simpan</button>
    </div>`);
    setTimeout(()=>document.getElementById('cat-isi')?.focus(),80);
  },

  _prevCatFoto(input){
    const file=input.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=e=>{
      const img=document.getElementById('cat-foto-img');
      const prev=document.getElementById('cat-foto-preview');
      const clr=document.getElementById('cat-foto-clear');
      if(img)img.src=e.target.result;
      if(prev)prev.style.display='block';
      if(clr)clr.style.display='block';
    };
    reader.readAsDataURL(file);
  },

  _clearCatFoto(){
    const input=document.getElementById('cat-foto-input');
    const img=document.getElementById('cat-foto-img');
    const prev=document.getElementById('cat-foto-preview');
    const clr=document.getElementById('cat-foto-clear');
    if(input)input.value='';
    if(img)img.src='';
    if(prev)prev.style.display='none';
    if(clr)clr.style.display='none';
  },

  _viewFotoCat(src){
    OS(`<div style="padding:0;background:transparent">
      <div style="position:relative">
        <img src="${src}" style="width:100%;max-height:80vh;object-fit:contain;border-radius:var(--r4);display:block">
        <button onclick="CS()" style="position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.5);border:none;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
    </div>`);
  },

  async _saveCat(sntId,tipe,catId){if(catId&&tipe==='psikologis'&&!_needAdmin())return;
    const isi=document.getElementById('cat-isi')?.value.trim();
    if(!isi){T('Catatan tidak boleh kosong!');return;}
    const poin=document.getElementById('cat-poin')?.value||null;
    // Ambil foto dari preview jika ada
    const fotoImg=document.getElementById('cat-foto-img');
    const foto=(fotoImg&&fotoImg.src&&fotoImg.src.startsWith('data:'))?fotoImg.src:null;
    if(catId){
      const c=await DB.g('catatanSantri',catId);
      c.isi=isi;
      if(poin!==null)c.poin=parseInt(poin)||0;
      if(foto)c.foto=foto;
      c.updatedAt=Date.now();
      await DB.p('catatanSantri',c);
    } else {
      await DB.p('catatanSantri',{id:uid(),sntId,tipe,isi,poin:poin?parseInt(poin):null,foto:foto||null,createdAt:Date.now(),updatedAt:Date.now()});
    }
    CS();T('✅ Catatan disimpan!');await this.renderProfil(sntId);
  },

  async _editCat(catId){
    const c=await DB.g('catatanSantri',catId);if(!c)return;
    if(c.tipe==='psikologis'&&!_needAdmin())return;
    const L={prestasi:'✏️ Edit Prestasi',pelanggaran:'✏️ Edit Pelanggaran',umum:'✏️ Edit Catatan',psikologis:'🧠 ✏️ Edit Catatan Psikologis'};
    OS(`<div class="sh">${L[c.tipe]||'Edit Catatan'}</div><div class="sb" style="padding-bottom:80px">
      <div class="fg"><label class="fl">Isi Catatan</label><textarea class="fi" id="cat-isi" rows="4" style="resize:none;line-height:1.5">${esc(c.isi)}</textarea></div>
      ${c.tipe==='pelanggaran'?`<div class="fg"><label class="fl">Poin</label><input class="fi" id="cat-poin" type="number" value="${c.poin||0}"></div>`:''}
      <div class="fg">
        <label class="fl">Foto</label>
        <div id="cat-foto-preview" style="${c.foto?'display:block':'display:none'};margin-bottom:8px;border-radius:var(--r3);overflow:hidden;max-height:200px;text-align:center;background:var(--gs)">
          <img id="cat-foto-img" src="${c.foto||''}" style="max-width:100%;max-height:200px;object-fit:cover;border-radius:var(--r3)">
        </div>
        <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--r3);background:var(--gs);border:1.5px dashed rgba(13,181,127,.3);cursor:pointer;font-size:12px;color:var(--a1);font-weight:600">
          📷 ${c.foto?'Ganti':'Pilih'} Foto
          <input type="file" accept="image/*" id="cat-foto-input" style="display:none" onchange="App._prevCatFoto(this)">
        </label>
        <div id="cat-foto-clear" style="${c.foto?'display:block':'display:none'};margin-top:6px">
          <button onclick="App._clearCatFoto()" style="font-size:11px;color:#ef4444;background:none;border:none;cursor:pointer;padding:0">✕ Hapus foto</button>
        </div>
      </div>
      <button class="bg2 bw" onclick="App._saveCat('${c.sntId}','${c.tipe}','${catId}')">Simpan Perubahan</button>
    </div>`);
  },
  _delCat(catId,sntId){OS(`<div class="cw"><div class="ci3">🗑️</div><div class="ct3">Hapus catatan ini?</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelCat('${catId}','${sntId}')">Hapus</button></div></div>`)},
  async _doDelCat(catId,sntId){if(!_needAdmin())return;await DB.d('catatanSantri',catId);CS();T('Dihapus!');await this.renderProfil(sntId)},
  // Admin: hapus riwayat absensi (beserta pelanggaran auto terkait)
  _delAbsensi(absId,sntId){
    if(!_needAdmin())return;
    OS(`<div class="cw"><div class="ci3">🗑️</div><div class="ct3">Hapus riwayat absensi ini?</div><div class="cs3">Riwayat absensi & pelanggaran terkait (jika ada & belum di-tak'zir) akan dihapus permanen.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelAbsensi('${absId}','${sntId}')">Hapus</button></div></div>`);
  },
  async _doDelAbsensi(absId,sntId){
    if(!_needAdmin())return;
    // Hapus pelanggaran auto yang terkait (jika belum di-tak'zir)
    const allPel=await DB.ga('pelanggaran');
    const pelAuto=allPel.find(p=>p.absId===absId&&p.tipe==='auto'&&p.status==='belum');
    if(pelAuto)await DB.d('pelanggaran',pelAuto.id);
    // Hapus absensi
    await DB.d('absensi',absId);
    CS();T('✅ Riwayat absensi dihapus!');
    await this.renderProfil(sntId);
  },
  // CRUD Riwayat Alergi/Penyakit (catatanSantri tipe='kesehatan')
  _addCatKesehatan(sntId){
    OS(`<div class="sh">🩺 Tambah Riwayat Alergi/Penyakit</div><div class="sb" style="padding-bottom:80px">
      <div class="fg"><label class="fl">Jenis Alergi/Penyakit *</label><input class="fi" id="kes-jenis" placeholder="Misal: Alergi seafood, Asma, Maag kronis..."></div>
      <div class="fg"><label class="fl">Keterangan</label><textarea class="fi" id="kes-ket" rows="2" style="resize:none" placeholder="Misal: Sejak kecil, kambuh jika makan udang..."></textarea></div>
      <div class="fg"><label class="fl">Penanganan / Obat</label><textarea class="fi" id="kes-penanganan" rows="2" style="resize:none" placeholder="Misal: Antihistamin, inhaler, hindari pemicu..."></textarea></div>
      <button class="bg2 bw" onclick="App._saveCatKesehatan('${sntId}')">Simpan</button>
    </div>`);
  },
  async _saveCatKesehatan(sntId,catId){
    const jenis=document.getElementById('kes-jenis')?.value.trim();
    if(!jenis){T('❌ Jenis alergi/penyakit wajib diisi');return}
    const keterangan=document.getElementById('kes-ket')?.value.trim()||'';
    const penanganan=document.getElementById('kes-penanganan')?.value.trim()||'';
    if(catId){
      const c=await DB.g('catatanSantri',catId);if(!c)return;
      c.jenis=jenis;c.keterangan=keterangan;c.penanganan=penanganan;c.updatedAt=Date.now();
      await DB.p('catatanSantri',c);
    } else {
      await DB.p('catatanSantri',{id:uid(),sntId,tipe:'kesehatan',jenis,keterangan,penanganan,isi:jenis+(keterangan?' - '+keterangan:''),createdAt:Date.now(),updatedAt:Date.now()});
    }
    CS();T('✅ Riwayat alergi/penyakit disimpan!');
    await this.renderProfil(sntId);
  },
  async _editCatKesehatan(catId){
    const c=await DB.g('catatanSantri',catId);if(!c)return;
    OS(`<div class="sh">🩺 Edit Riwayat Alergi/Penyakit</div><div class="sb" style="padding-bottom:80px">
      <div class="fg"><label class="fl">Jenis Alergi/Penyakit</label><input class="fi" id="kes-jenis" value="${esc(c.jenis||'')}"></div>
      <div class="fg"><label class="fl">Keterangan</label><textarea class="fi" id="kes-ket" rows="2" style="resize:none">${esc(c.keterangan||'')}</textarea></div>
      <div class="fg"><label class="fl">Penanganan / Obat</label><textarea class="fi" id="kes-penanganan" rows="2" style="resize:none">${esc(c.penanganan||'')}</textarea></div>
      <button class="bg2 bw" onclick="App._saveCatKesehatan('${c.sntId}','${catId}')">Simpan Perubahan</button>
    </div>`);
  },
  _delCatKesehatan(catId,sntId){
    OS(`<div class="cw"><div class="ci3">🗑️</div><div class="ct3">Hapus riwayat alergi/penyakit ini?</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelCatKesehatan('${catId}','${sntId}')">Hapus</button></div></div>`);
  },
  async _doDelCatKesehatan(catId,sntId){
    await DB.d('catatanSantri',catId);
    CS();T('✅ Dihapus!');
    await this.renderProfil(sntId);
  },


  async _shareIdentitas(sntId){
const sn=await DB.g('santri',sntId);if(!sn)return;
let t='\uD83D\uDC64 IDENTITAS SANTRI\n'+'\u2550'.repeat(24)+'\n';
t+='Nama : '+sn.nama+'\n';
if(sn.panggilan)t+='Panggilan: '+sn.panggilan+'\n';
if(sn.nis)t+='NIS : '+sn.nis+'\n';
t+='Kamar : '+(sn.kamar||'-')+'\n';
if(sn.kelas)t+='Kelas : '+sn.kelas+'\n';
if(sn.kelasDiniah)t+='Diniah : '+sn.kelasDiniah+'\n';
if(sn.ttl)t+='TTL : '+sn.ttl+'\n';
if(sn.alamat)t+='Alamat : '+sn.alamat+'\n';
t+='Status : '+(sn.status||'Aktif')+'\n';
if(sn.tanggalMasuk)t+='Masuk : '+sn.tanggalMasuk+'\n';
t+='\n\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 WALI\n';
t+='Nama Wali: '+(sn.waliNama||'-')+'\n';
if(sn.waliWA)t+='WA Wali : '+sn.waliWA+'\n';
if(sn.catatanKesehatan)t+='\n\uD83C\uDFE5 Kesehatan: '+sn.catatanKesehatan+'\n';
t+='\n\u2014\n'+_appN();
try{await navigator.clipboard.writeText(t);T('\u2705 Identitas disalin!');}
catch{OS('<div class="sh">Identitas Santri</div><div class="sb"><textarea class="fi" style="height:220px;resize:none;font-size:11px;line-height:1.5" onclick="this.select()">'+t+'</textarea><button class="bg2 bw" style="margin-top:8px" onclick="navigator.clipboard.writeText(document.querySelector(\'.sb textarea\').value).then(()=>T(\'\u2705 Disalin!\'))">\uD83D\uDCCB Salin</button></div>');}
  },

  async renderRek(){
    document.getElementById('rek-body').innerHTML=`<div style="padding:0 15px 8px">
      <div class="tab-bar" style="margin-bottom:10px">
        <button class="tab-btn${S.rkTab==='harian'?' on':''}" onclick="App.rkTab('harian')">📅 Harian</button>
        <button class="tab-btn${S.rkTab==='bulanan'?' on':''}" onclick="App.rkTab('bulanan')">📆 Bulanan</button>
      </div>
      <div id="rk-ct"></div>
    </div>`;
    await this._rkContent();
  },
  async rkTab(t){S.rkTab=t;await this.renderRek()},
  async _rkContent(){
    if(S.rkTab==='harian')await this._rkHarian();
    else await this._rkBulanan();
  },
  async _rkHarian(){
    // ── AUDIT v3f: HAPUS pull cloud dari Rekap ──
    // Sebelumnya: _rkHarian pull sesi & absensi dari cloud dengan where()
    // tiap buka halaman Rekap = 2 query × ~50 docs × berapa kali buka Rekap.
    // Itu boros Reads.
    // Sekarang: andalkan IDB yang sudah ter-cache dari pullAll saat login
    // + onSnapshot untuk sesi & absensi (realtime). User yang mau data fresh
    // bisa klik tombol Refresh (long-press untuk sync semua).
    // Filter data bulan ini dari IDB (instant, zero Reads).
    const [kg,sesAll,absAll,snt,sk]=await Promise.all([DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('subKeg')]);
    const aktif=kg.filter(x=>x.aktif).sort((a,b)=>a.urutan-b.urutan);
    const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const first=new Date(S.rkYear,S.rkMonth,1).getDay();
    const dim=new Date(S.rkYear,S.rkMonth+1,0).getDate();
    const today=_todayLocal();
    const dn=['M','S','S','R','K','J','S'];
    const monthPfx=`${S.rkYear}-${String(S.rkMonth+1).padStart(2,'0')}`;
    // Dates with any absensi data this month
    const datesWithData=new Set(sesAll.filter(x=>x.tanggal.startsWith(monthPfx)).map(x=>x.tanggal));
    let calH=dn.map(d=>`<div class="cdh">${d}</div>`).join('');
    for(let i=0;i<first;i++)calH+=`<div class="cd emp"></div>`;
    for(let d=1;d<=dim;d++){
      const ds=`${S.rkYear}-${String(S.rkMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hasData=datesWithData.has(ds);
      calH+=`<div class="cd${ds===S.rkDate?' sel':ds===today?' td':hasData?' has':''}" onclick="App.rkSelDate('${ds}')">${d}${hasData&&ds!==S.rkDate?'<div style="width:4px;height:4px;border-radius:50%;background:var(--a1);margin:0 auto"></div>':''}</div>`;
    }
    const el=document.getElementById('rk-ct');
    el.innerHTML=`
      <div class="gc" style="padding:12px;margin-bottom:10px">
        <div class="cn">
          <button class="cnb" onclick="App.rkPrev()">‹</button>
          <div class="cm">${months[S.rkMonth]} ${S.rkYear}</div>
          <button class="cnb" onclick="App.rkNext()">›</button>
        </div>
        <div class="cg2">${calH}</div>
      </div>
      <div id="rk-res"></div>`;
    await this._rkHarianLoad(sesAll,absAll,snt,sk,kg);
  },
  async _rkHarianLoad(sesAll,absAll,snt,sk,kg){
    // Selalu load fresh untuk pastikan data terbaru setelah repair
    [sesAll,absAll,snt,sk,kg]=await Promise.all([DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('subKeg'),DB.ga('kegiatan')]);
    const el=document.getElementById('rk-res');if(!el)return;
    const allSes=sesAll.filter(x=>x.tanggal===S.rkDate);
    if(!allSes.length){el.innerHTML='<div class="empty" style="padding:20px 0"><div class="es">Tidak ada sesi pada tanggal ini.</div></div>';return}

    // REPAIR PASS: pastikan semua sesi punya absensi LENGKAP sebelum render
    const allSntAktif=snt.filter(x=>x.aktif);
    const angAll=await DB.ga('anggota');
    let repaired=false;
    for(const sx of allSes){
      // Sub-kegiatan: hanya anggota. Kegiatan induk: semua santri aktif.
      const targets=sx.skId
        ? allSntAktif.filter(x=>angAll.find(m=>m.skId===sx.skId&&m.sntId===x.id))
        : allSntAktif;
      const existingIds=new Set(absAll.filter(a=>a.sesiId===sx.id).map(a=>a.sntId));
      const missing=targets.filter(x=>!existingIds.has(x.id));
      if(missing.length>0){
        const _izinMapRep2=await this._izinAktifMap(sx.tanggal);
        const _sakitMapRep2=await this._sakitAktifMap(sx.tanggal);
        for(const x of missing){
          const _st=_sakitMapRep2[x.id]?'sakit':(_izinMapRep2[x.id]?'izin':'none');
          const _pid=_izinMapRep2[x.id]||null;
          const _oleh=_sakitMapRep2[x.id]?'Sistem (Catatan Sakit)':(_izinMapRep2[x.id]?'Sistem (Perizinan)':'-');
          const na={id:absDetId(sx.id,x.id),sesiId:sx.id,sntId:x.id,status:_st,perizinanId:_pid,oleh:_oleh,updatedAt:Date.now()};
          await DB.p('absensi',na);
          absAll.push(na);
        }
        repaired=true;
      }
    }
    // Reload absAll fresh setelah repair agar semua data konsisten
    if(repaired) absAll=await DB.ga('absensi');

    // Build maps setelah repair — selalu reload snt fresh agar sntM lengkap
    const sntFresh=await DB.ga('santri');
    const sntM=mapBy(sntFresh,'id'),skM=mapBy(sk,'id'),kgM=mapBy(kg,'id');
    const kgGroups={};
    allSes.forEach(sx=>{if(!kgGroups[sx.kgId])kgGroups[sx.kgId]=[];kgGroups[sx.kgId].push(sx)});

    // Overall stats
    const allAbs=absAll.filter(a=>allSes.find(x=>x.id===a.sesiId));
    const dayC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
    allAbs.forEach(a=>{if(dayC[a.status]!==undefined)dayC[a.status]++});
    const dayTot=allAbs.length,dayPct=dayTot?Math.round(dayC.hadir/dayTot*100):0;
    const kgList=Object.keys(kgGroups);
    const barMax=Math.max(1,...kgList.map(kid=>{const s=kgGroups[kid];const a=absAll.filter(ab=>s.find(x=>x.id===ab.sesiId));return a.length}));
    const barHtml=kgList.map(kid=>{
      const k=kgM[kid];const sxs=kgGroups[kid];
      const a=absAll.filter(ab=>sxs.find(x=>x.id===ab.sesiId));
      const h=a.filter(ab=>ab.status==='hadir').length;
      const pct2=a.length?Math.round(h/a.length*100):0;
      const barH=Math.max(4,Math.round(64*(a.length/barMax)));
      return`<div class="bar-item"><div class="bar-fill" style="height:${barH}px;background:var(--grad)"></div><div class="bar-lbl">${k?.icon||'📋'}</div><div style="font-size:8px;color:var(--a1);font-weight:700">${pct2}%</div></div>`;
    }).join('');
    let html=`
      <div class="gc" style="padding:12px;margin-bottom:9px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
          <div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1)">📅 ${S.rkDate}</div>
          <div style="font-family:var(--fd);font-size:15px;font-weight:900;color:var(--a1)">${dayPct}%</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:10px">
          ${Object.entries(dayC).map(([st,n])=>`<div style="background:var(--gs);border-radius:var(--r2);padding:7px 2px;text-align:center"><div style="font-family:var(--fd);font-size:15px;font-weight:800;color:var(--t1)">${n}</div><div style="font-size:8px;color:var(--t3)">${st}</div></div>`).join('')}
        </div>
        ${barHtml?`<div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:5px">Grafik per Kegiatan</div><div class="bar-chart" style="height:72px;margin-bottom:8px">${barHtml}</div>`:''}
        <div class="pw" style="margin-bottom:4px"><div class="pf" style="width:${dayPct}%"></div></div>
        <div style="display:flex;justify-content:flex-end;margin-top:9px">
          <button onclick="App._rkAksiPop('harian')" style="display:flex;align-items:center;gap:5px;padding:8px 13px;border-radius:100px;background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:11px;font-weight:700;color:var(--a1);cursor:pointer">💬 Aksi &amp; Laporan</button>
        </div>
      </div>`;

    // Helper: render daftar nama per status — defensive version dengan direct array lookup
    function renderNames(absList, sntArr){
      if(!absList||!absList.length) return '';
      const gr={alpha:[],izin:[],sakit:[],terlambat:[]};
      absList.forEach(a=>{
        if(!a||!a.sntId||!a.status) return;
        // Primary: direct find by id (paling reliable)
        const s=(sntArr||sntFresh).find(x=>x.id===a.sntId);
        if(!s) return;
        const st=(a.status||'').toLowerCase().trim();
        if(gr[st]) gr[st].push(s);
      });
      const statuses=['alpha','izin','sakit','terlambat'].filter(st=>gr[st].length>0);
      if(!statuses.length) return '';
      return statuses.map(st=>{
        const list=gr[st];
        const nameRows=list.map(x=>{
          const nm=(x.nama||'(tanpa nama)');
          const initial=nm.charAt(0).toUpperCase()||'?';
          const avatar=x.foto
            ?`<img src="${x.foto}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0">`
            :`<div style="width:20px;height:20px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;flex-shrink:0">${initial}</div>`;
          return`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer" onclick="App.nav('profil',{id:'${x.id}',t:'${escJ(nm)}'})">
            ${avatar}
            <span style="font-size:12px;font-weight:600;color:var(--a1)">${nm}</span>
          </div>`;
        }).join('');
        const label={alpha:'❌ ALPHA',izin:'📋 IZIN',sakit:'🤒 SAKIT',terlambat:'⏰ TERLAMBAT'}[st]||st.toUpperCase();
        return`<div style="margin-top:6px">
          <div style="font-size:9px;font-weight:800;color:var(--t3);text-transform:uppercase;margin-bottom:2px">${label} (${list.length})</div>
          ${nameRows}
        </div>`;
      }).join('');
    }

    // Per kegiatan breakdown
    for(const kid of kgList){
      const k=kgM[kid];const sxs=kgGroups[kid];
      const subSxs=sxs.filter(x=>x.skId);
      const mainSx=sxs.find(x=>!x.skId);
      const kAbs=absAll.filter(a=>sxs.find(x=>x.id===a.sesiId));
      const kC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
      kAbs.forEach(a=>{if(kC[a.status]!==undefined)kC[a.status]++});
      const kPct=kAbs.length?Math.round(kC.hadir/kAbs.length*100):0;

      // Sub-sesi HTML
      let subHtml='';
      for(const sx of subSxs){
        const skItem=skM[sx.skId];
        const sa=absAll.filter(a=>a.sesiId===sx.id);
        const hh=sa.filter(a=>a.status==='hadir').length;
        const sp=sa.length?Math.round(hh/sa.length*100):0;
        subHtml+=`<div style="background:var(--gs);border-radius:var(--r2);padding:9px;margin-bottom:5px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <div style="font-size:11px;font-weight:700;color:var(--t2)">🔹 ${skItem?.nama||sx.skId}</div>
            <div style="font-size:10px;font-weight:700;color:var(--a1)">${sp}%</div>
          </div>${renderNames(sa,sntFresh)}</div>`;
      }

      // Main sesi HTML
      const mainHtml=mainSx?renderNames(absAll.filter(a=>a.sesiId===mainSx.id),sntFresh):'';

      html+=`<div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:12px;margin-bottom:8px;backdrop-filter:blur(20px)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
          <span style="font-size:20px">${k?.icon||'📋'}</span>
          <div style="flex:1"><div style="font-weight:700;font-size:13px;color:var(--t1)">${k?.nama||'-'}</div></div>
          <div style="font-family:var(--fd);font-size:15px;font-weight:900;color:var(--a1)">${kPct}%</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px">
          ${Object.entries(kC).map(([st,n])=>`<div style="background:var(--gs);border-radius:var(--r1);padding:5px 2px;text-align:center"><div style="font-weight:800;font-size:13px;color:var(--t1)">${n}</div><div style="font-size:7px;color:var(--t3)">${st}</div></div>`).join('')}
        </div>
        ${subHtml}${mainHtml}
      </div>`;
    }
    el.innerHTML=html;
  },
  rkPrev(){S.rkMonth--;if(S.rkMonth<0){S.rkMonth=11;S.rkYear--}if(S.rkTab==='harian')this._rkHarian();else this._rkBulanan()},
  rkNext(){S.rkMonth++;if(S.rkMonth>11){S.rkMonth=0;S.rkYear++}if(S.rkTab==='harian')this._rkHarian();else this._rkBulanan()},
  async rkSelDate(d){S.rkDate=d;await this._rkHarian()},
  async rkSelKg(id){S.rkKgId=id;await this._rkHarian()},

  async _rkBulanan(){
    const [kg,sesAll,absAll,snt,sk]=await Promise.all([DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('subKeg')]);
    const aktif=kg.filter(x=>x.aktif).sort((a,b)=>a.urutan-b.urutan);
    const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const monthPfx=`${S.rkYear}-${String(S.rkMonth+1).padStart(2,'0')}`;
    const monSes=sesAll.filter(x=>x.tanggal.startsWith(monthPfx));
    const monAbs=absAll.filter(a=>monSes.find(x=>x.id===a.sesiId));
    const sntM=mapBy(snt,'id'),skM=mapBy(sk,'id');
    const totC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
    monAbs.forEach(a=>{if(totC[a.status]!==undefined)totC[a.status]++});
    const totTot=monAbs.length,totPct=totTot?Math.round(totC.hadir/totTot*100):0;
    // Weekly chart (4 weeks)
    const dim=new Date(S.rkYear,S.rkMonth+1,0).getDate();
    const weeks=[{l:'M1',s:1,e:7},{l:'M2',s:8,e:14},{l:'M3',s:15,e:21},{l:'M4',s:22,e:dim}];
    const wkData=weeks.map(w=>{
      const wDates=[];for(let d=w.s;d<=w.e;d++)wDates.push(`${monthPfx}-${String(d).padStart(2,'0')}`);
      const wSes=monSes.filter(x=>wDates.includes(x.tanggal));
      const wAbs=monAbs.filter(a=>wSes.find(x=>x.id===a.sesiId));
      const h=wAbs.filter(a=>a.status==='hadir').length;
      return{l:w.l,pct:wAbs.length?Math.round(h/wAbs.length*100):0,tot:wAbs.length};
    });
    const maxW=Math.max(1,...wkData.map(w=>w.tot));
    const barHtml=wkData.map(w=>`<div class="bar-item"><div class="bar-fill" style="height:${Math.max(4,Math.round(64*w.tot/maxW))}px;background:var(--grad)"></div><div class="bar-lbl">${w.l}</div><div style="font-size:8px;color:var(--a1);font-weight:700">${w.pct}%</div></div>`).join('');
    const el=document.getElementById('rk-ct');
    let html=`
      <div class="gc" style="padding:12px;margin-bottom:9px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
          <div class="cn" style="gap:8px">
            <button class="cnb" onclick="App.rkPrev()">‹</button>
            <div class="cm">${months[S.rkMonth]} ${S.rkYear}</div>
            <button class="cnb" onclick="App.rkNext()">›</button>
          </div>
          <div style="font-family:var(--fd);font-size:15px;font-weight:900;color:var(--a1)">${totPct}%</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:10px">
          ${Object.entries(totC).map(([st,n])=>`<div style="background:var(--gs);border-radius:var(--r2);padding:7px 2px;text-align:center"><div style="font-family:var(--fd);font-size:15px;font-weight:800;color:var(--t1)">${n}</div><div style="font-size:8px;color:var(--t3)">${st}</div></div>`).join('')}
        </div>
        <div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:6px">Grafik per Minggu</div>
        <div class="bar-chart" style="height:72px;margin-bottom:10px">${barHtml}</div>
        <div class="pw" style="margin-bottom:4px"><div class="pf" style="width:${totPct}%"></div></div>
        <div style="display:flex;justify-content:flex-end;margin-top:9px">
          <button onclick="App._rkAksiPop('bulanan')" style="display:flex;align-items:center;gap:5px;padding:8px 13px;border-radius:100px;background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:11px;font-weight:700;color:var(--a1);cursor:pointer">💬 Aksi &amp; Laporan</button>
        </div>
      </div>`;
    // Per kegiatan bulanan
    aktif.forEach(k=>{
      const kSes=monSes.filter(x=>x.kgId===k.id);
      const kAbs=monAbs.filter(a=>kSes.find(x=>x.id===a.sesiId));
      if(!kAbs.length)return;
      const kC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
      kAbs.forEach(a=>{if(kC[a.status]!==undefined)kC[a.status]++});
      const kPct=kAbs.length?Math.round(kC.hadir/kAbs.length*100):0;
      // Sub kegiatan
      const subs=sk.filter(x=>x.kgId===k.id);
      const subHtml2=subs.map(s=>{
        const sSes=kSes.filter(x=>x.skId===s.id);
        const sAbs=monAbs.filter(a=>sSes.find(x=>x.id===a.sesiId));
        if(!sAbs.length)return'';
        const sC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};sAbs.forEach(a=>{if(sC[a.status]!==undefined)sC[a.status]++});
        const sP=sAbs.length?Math.round(sC.hadir/sAbs.length*100):0;
        return`<div style="padding:8px;background:var(--gs);border-radius:var(--r2);margin-bottom:5px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><div style="font-size:11px;font-weight:700;color:var(--t2)">🔹 ${s.nama}</div><div style="font-size:10px;font-weight:700;color:var(--a1)">${sP}%</div></div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px">${Object.entries(sC).map(([st,n])=>`<div style="text-align:center;background:var(--su);border-radius:var(--r1);padding:4px 2px"><div style="font-weight:800;font-size:11px;color:var(--t1)">${n}</div><div style="font-size:7px;color:var(--t4)">${st}</div></div>`).join('')}</div>
        </div>`;
      }).join('');
      html+=`<div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:12px;margin-bottom:8px;backdrop-filter:blur(20px)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
          <span style="font-size:20px">${k.icon}</span>
          <div style="flex:1"><div style="font-weight:700;font-size:13px;color:var(--t1)">${k.nama}</div><div style="font-size:10px;color:var(--t3)">${kSes.length} sesi</div></div>
          <div style="font-family:var(--fd);font-size:15px;font-weight:900;color:var(--a1)">${kPct}%</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:${subHtml2?'9':'0'}px">
          ${Object.entries(kC).map(([st,n])=>`<div style="background:var(--gs);border-radius:var(--r1);padding:5px 2px;text-align:center"><div style="font-weight:800;font-size:13px;color:var(--t1)">${n}</div><div style="font-size:7px;color:var(--t3)">${st}</div></div>`).join('')}
        </div>
        ${subHtml2}
      </div>`;
    });
    el.innerHTML=html;
  },

  async _salinHarian(){
const [kg,sesAll,absAll,snt,sk]=await Promise.all([DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('subKeg')]);
const kgM=mapBy(kg,'id'),sntM=mapBy(snt,'id'),skM=mapBy(sk,'id');
const allSes=sesAll.filter(x=>x.tanggal===S.rkDate);
const kgGroups={};allSes.forEach(sx=>{if(!kgGroups[sx.kgId])kgGroups[sx.kgId]=[];kgGroups[sx.kgId].push(sx)});
const allAbs=absAll.filter(a=>allSes.find(x=>x.id===a.sesiId));
const dayC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
allAbs.forEach(a=>{if(dayC[a.status]!==undefined)dayC[a.status]++});
const tot=allAbs.length,pct=tot?Math.round(dayC.hadir/tot*100):0;
let t=`REKAP HARIAN ABSENSI
`;
t+=''+_appN()+'\n '+S.rkDate+'\n\n';
t+=`RINGKASAN
`;
t+=`Hadir : ${dayC.hadir}
Alpha : ${dayC.alpha}
Izin : ${dayC.izin}
Sakit : ${dayC.sakit}
Terlambat: ${dayC.terlambat}
`;
t+=`Kehadiran: ${pct}% (${dayC.hadir}/${tot})

`;
Object.keys(kgGroups).forEach(kid=>{
const k=kgM[kid];const sxs=kgGroups[kid];
t+=`${k?.icon||''} ${k?.nama||'-'}
${'─'.repeat(20)}
`;
sxs.forEach(sx=>{
const skItem=sx.skId?skM[sx.skId]:null;
if(skItem)t+=`${skItem.nama}
`;
const sa=absAll.filter(a=>a.sesiId===sx.id);
const sc={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};sa.forEach(a=>{if(sc[a.status]!==undefined)sc[a.status]++});
t+=`Hadir ${sc.hadir} | Alpha ${sc.alpha} | Izin ${sc.izin} | Sakit ${sc.sakit} | Terlambat ${sc.terlambat}
`;
['alpha','izin','sakit','terlambat'].forEach(st=>{
const list=sa.filter(a=>a.status===st).map(a=>sntM[a.sntId]).filter(Boolean);
if(list.length)t+=`${st.toUpperCase()}: ${list.map(x=>x.nama).join(', ')}
`;
});
t+='\n';
});
});
t+='—\n'+_appN();
try{await navigator.clipboard.writeText(t);T('\u2705 Disalin!');}
catch{OS('<div class="sh">Rekap Harian</div><div class="sb" style="padding-bottom:80px"><textarea class="fi" style="height:200px;resize:none;font-size:11px;line-height:1.5" id="salin-ta" onclick="this.select()">'+t+'</textarea><button class="bg2 bw" style="margin-top:8px" onclick="navigator.clipboard.writeText(document.getElementById(\'salin-ta\').value).then(()=>T(\'\u2705 Disalin!\'))">\uD83D\uDCCB Salin Teks</button></div>');}
  },

  async _salinBulanan(){
const [kg,sesAll,absAll,snt,sk]=await Promise.all([DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('subKeg')]);
const kgM=mapBy(kg,'id'),skM=mapBy(sk,'id');
const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const monthPfx=`${S.rkYear}-${String(S.rkMonth+1).padStart(2,'0')}`;
const monSes=sesAll.filter(x=>x.tanggal.startsWith(monthPfx));
const monAbs=absAll.filter(a=>monSes.find(x=>x.id===a.sesiId));
const totC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
monAbs.forEach(a=>{if(totC[a.status]!==undefined)totC[a.status]++});
const tot=monAbs.length,pct=tot?Math.round(totC.hadir/tot*100):0;
const aktif=kg.filter(x=>x.aktif).sort((a,b)=>a.urutan-b.urutan);
let t=`REKAP BULANAN ABSENSI
`;
t+=''+_appN()+'\n '+months[S.rkMonth]+' '+S.rkYear+'\n\n';
t+=`RINGKASAN BULAN
`;
t+=`Hadir : ${totC.hadir}
Alpha : ${totC.alpha}
Izin : ${totC.izin}
Sakit : ${totC.sakit}
Terlambat: ${totC.terlambat}
`;
t+=`Kehadiran: ${pct}% (${totC.hadir}/${tot})

`;
aktif.forEach(k=>{
const kSes=monSes.filter(x=>x.kgId===k.id);
const kAbs=monAbs.filter(a=>kSes.find(x=>x.id===a.sesiId));
if(!kAbs.length)return;
const kC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};kAbs.forEach(a=>{if(kC[a.status]!==undefined)kC[a.status]++});
const kP=kAbs.length?Math.round(kC.hadir/kAbs.length*100):0;
t+=`${k.icon} ${k.nama} — ${kP}%
`;
t+=`Hadir ${kC.hadir} | Alpha ${kC.alpha} | Izin ${kC.izin} | Sakit ${kC.sakit} | Terlambat ${kC.terlambat}
`;
const subs=sk.filter(x=>x.kgId===k.id);
subs.forEach(s=>{
const sSes=kSes.filter(x=>x.skId===s.id);const sAbs=monAbs.filter(a=>sSes.find(x=>x.id===a.sesiId));
if(!sAbs.length)return;
const sC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};sAbs.forEach(a=>{if(sC[a.status]!==undefined)sC[a.status]++});
const sP=sAbs.length?Math.round(sC.hadir/sAbs.length*100):0;
t+=`${s.nama} — ${sP}%
`;
t+=`Hadir ${sC.hadir} | Alpha ${sC.alpha} | Izin ${sC.izin} | Sakit ${sC.sakit} | Terlambat ${sC.terlambat}
`;
});
t+='\n';
});
t+='—\n'+_appN();
try{await navigator.clipboard.writeText(t);T('\u2705 Disalin!');}
catch{OS('<div class="sh">Rekap Bulanan</div><div class="sb" style="padding-bottom:80px"><textarea class="fi" style="height:200px;resize:none;font-size:11px;line-height:1.5" id="salin-ta" onclick="this.select()">'+t+'</textarea><button class="bg2 bw" style="margin-top:8px" onclick="navigator.clipboard.writeText(document.getElementById(\'salin-ta\').value).then(()=>T(\'\u2705 Disalin!\'))">\uD83D\uDCCB Salin Teks</button></div>');}
  },

  async _rkSnt(){
    const [snt,catatan]=await Promise.all([DB.ga('santri'),DB.ga('catatanSantri')]);
    const renderRow=x=>{
      const nCat=catatan.filter(c=>c.sntId===x.id).length;
      return`<div style="display:flex;align-items:center;gap:9px;padding:9px;background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);margin-bottom:6px;backdrop-filter:blur(20px);cursor:pointer" onclick="App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})">
        <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0">${x.foto?`<img src="${x.foto}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>`}</div>
        <div style="flex:1;min-width:0"><div class="snt-link" style="font-size:13px;display:block">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}${x.kelas?` · ${x.kelas}`:''}</div></div>
        ${nCat?`<div style="font-size:9px;background:var(--gs);border:1px solid rgba(13,181,127,.15);border-radius:100px;padding:2px 7px;color:var(--a1);font-weight:700">${nCat} catatan</div>`:''}
        <span style="font-size:12px;color:var(--t4)">→</span>
      </div>`;
    };
    document.getElementById('rk-ct').innerHTML=`
      <input class="fi" id="rk-sq" placeholder="Cari santri..." oninput="App._rkSntF()" style="margin-bottom:10px">
      <div id="rk-sl">${snt.filter(x=>x.aktif).map(renderRow).join('')}</div>`;
  },
  async _rkSntF(){
    const q=document.getElementById('rk-sq')?.value.toLowerCase()||'';
    const [snt,catatan]=await Promise.all([DB.ga('santri'),DB.ga('catatanSantri')]);
    const f=snt.filter(x=>x.aktif&&(x.nama.toLowerCase().includes(q)||x.kamar.toLowerCase().includes(q)));
    const renderRow=x=>{
      const nCat=catatan.filter(c=>c.sntId===x.id).length;
      return`<div style="display:flex;align-items:center;gap:9px;padding:9px;background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);margin-bottom:6px;backdrop-filter:blur(20px);cursor:pointer" onclick="App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})">
        <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0">${x.foto?`<img src="${x.foto}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>`}</div>
        <div style="flex:1;min-width:0"><div class="snt-link" style="font-size:13px;display:block">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}${x.kelas?` · ${x.kelas}`:''}</div></div>
        ${nCat?`<div style="font-size:9px;background:var(--gs);border:1px solid rgba(13,181,127,.15);border-radius:100px;padding:2px 7px;color:var(--a1);font-weight:700">${nCat} catatan</div>`:''}
        <span style="font-size:12px;color:var(--t4)">→</span>
      </div>`;
    };
    document.getElementById('rk-sl').innerHTML=f.map(renderRow).join('');
  },
  async _rkKm(){
    const [snt,abs,ses,km]=await Promise.all([DB.ga('santri'),DB.ga('absensi'),DB.ga('sesi'),DB.ga('kamar')]);
    const today=_todayLocal();
    const tses=ses.filter(x=>x.tanggal===today);
    const tabs=abs.filter(a=>tses.find(x=>x.id===a.sesiId));
    document.getElementById('rk-ct').innerHTML=km.map(k=>{
      const ks=snt.filter(x=>x.kamar===k.nama&&x.aktif);
      const ka=tabs.filter(a=>ks.find(x=>x.id===a.sntId));
      const cnt={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
      ka.forEach(a=>{if(cnt[a.status]!==undefined)cnt[a.status]++});
      const pct=ka.length?Math.round(cnt.hadir/ka.length*100):0;
      return`<div class="gc" style="padding:12px;margin-bottom:9px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
          <div style="font-family:var(--fd);font-size:13px;font-weight:700;color:var(--t1)">Kamar ${k.nama}</div>
          <div style="font-size:10px;font-weight:600;color:var(--a1)">${ks.length} santri \u00B7 ${pct}%</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:7px">
          ${Object.entries(cnt).map(([st,n])=>`<div style="flex:1;min-width:44px;background:var(--gs);border:1px solid rgba(13,181,127,.1);border-radius:var(--r1);padding:5px;text-align:center"><div style="font-weight:800;font-size:14px;color:var(--t1)">${n}</div><div style="font-size:8px;color:var(--t3)">${st}</div></div>`).join('')}
        </div>
        <div class="pw"><div class="pf" style="width:${pct}%"></div></div>
      </div>`;}).join('');
  },



  // ============================================================
  // PELANGGARAN
  // ============================================================
  async renderPel(){
    S._pelFilter=S._pelFilter||'semua';
    const [pel,snt,kg,sk,per]=await Promise.all([DB.ga('pelanggaran'),DB.ga('santri'),DB.ga('kegiatan'),DB.ga('subKeg'),DB.ga('peraturan')]);
    const sntM=mapBy(snt,'id'),kgM=mapBy(kg,'id'),skM=mapBy(sk,'id');
    // Stats
    const tot=pel.length,belum=pel.filter(p=>p.status==='belum').length,sudah=pel.filter(p=>p.status==='sudah').length;
    const manual=pel.filter(p=>p.tipe==='manual').length,auto=pel.filter(p=>p.tipe==='auto').length;
    // Tren 7 hari
    const tren7=[];for(let d=6;d>=0;d--){const dt=(()=>{const x=new Date(Date.now()-d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');})();tren7.push({dt,n:pel.filter(p=>p.tanggal===dt).length})}
    const maxTren=Math.max(1,...tren7.map(x=>x.n));
    const trenBar=tren7.map(x=>{const dn=new Date(x.dt).getDay();const dL=['M','S','S','R','K','J','S'][dn];return`<div class="bar-item"><div class="bar-fill" style="height:${Math.max(4,Math.round(56*x.n/maxTren))}px;background:${x.n>0?'linear-gradient(135deg,#ef4444,#dc2626)':'var(--dv)'}"></div><div class="bar-lbl">${dL}</div><div style="font-size:8px;color:${x.n>0?'#ef4444':'var(--t4)'};font-weight:700">${x.n||''}</div></div>`}).join('');
    // Per kegiatan stats
    const kgStats={};pel.forEach(p=>{if(!kgStats[p.kgId])kgStats[p.kgId]=0;kgStats[p.kgId]++});
    const topKg=Object.entries(kgStats).sort((a,b)=>b[1]-a[1]).slice(0,5);
    // Filter
    let f=S._pelFilter==='belum'?pel.filter(p=>p.status==='belum'):S._pelFilter==='sudah'?pel.filter(p=>p.status==='sudah'):pel;
    // AUDIT v3m: Apply search filter
    if(S._pelSearch){
      const q=S._pelSearch.toLowerCase();
      f=f.filter(p=>{const sn=sntM[p.sntId];return(sn&&sn.nama.toLowerCase().includes(q))||(p.kgNama||'').toLowerCase().includes(q)||(p.skNama||'').toLowerCase().includes(q)||(p.tanggal||'').includes(q)});
    }
    // AUDIT v3m: Apply sub-kegiatan filter
    if(S._pelSkFilter){
      if(S._pelSkFilter.startsWith('kg_')){const kgId=S._pelSkFilter.substring(3);f=f.filter(p=>p.kgId===kgId)}
      else if(S._pelSkFilter.startsWith('sk_')){const skId=S._pelSkFilter.substring(3);f=f.filter(p=>p.skId===skId)}
    }
    // Split auto vs manual
    const fAuto=f.filter(p=>p.tipe==='auto');
    const fManual=f.filter(p=>p.tipe==='manual');
    // Sort: belum first, sudah last
    const sortPel=arr=>[...arr.filter(p=>p.status==='belum').sort((a,b)=>b.createdAt-a.createdAt),...arr.filter(p=>p.status==='sudah').sort((a,b)=>b.createdAt-a.createdAt)];
    // Group auto by kgId then skId
    const autoByKg={};sortPel(fAuto).forEach(p=>{const key=p.kgId+(p.skId?'_'+p.skId:'');if(!autoByKg[key])autoByKg[key]={kgId:p.kgId,skId:p.skId,items:[]};autoByKg[key].items.push(p)});
    const renderCard=(p)=>{
      const sn=sntM[p.sntId];if(!sn)return'';
      const done=p.status==='sudah';
      // Label jenis pelanggaran: "Alpha" atau "Terlambat" untuk auto, atau deskripsi untuk manual
      const jenisLabel=p.tipe==='auto'?(p.pelanggaranJenis||'Alpha'):'Non Alpha';
      const isTerlambat=p.tipe==='auto'&&(p.pelanggaranJenis==='Terlambat');
      return`<div id="pel-${p.id}" style="background:var(--su);border:1.5px solid ${done?'rgba(13,181,127,.2)':'rgba(239,68,68,.18)'};border-radius:var(--r3);padding:11px 13px;margin-bottom:7px;backdrop-filter:blur(16px);${done?'opacity:.75':''}">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0;cursor:pointer" onclick="App.nav('profil',{id:'${sn.id}',t:'${escJ(sn.nama)}'})">
            ${sn.foto?`<img src="${sn.foto}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff">${sn.nama.charAt(0)}</div>`}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:700;color:var(--t1);cursor:pointer" onclick="App.nav('profil',{id:'${sn.id}',t:'${escJ(sn.nama)}'})"> ${sn.nama}</span>
              <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;${done?'background:rgba(13,181,127,.1);color:var(--a1);border:1px solid rgba(13,181,127,.2)':'background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)'}">${done?'✅ Sudah':'🔴 Belum'}</span>
              ${isTerlambat?`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(139,92,246,.12);color:#7c3aed;border:1px solid rgba(139,92,246,.25)">⏰ Terlambat</span>`:''}
            </div>
            <div style="font-size:10px;color:var(--t3);display:flex;flex-wrap:wrap;gap:3px 6px">
              <span>📅 ${p.tanggal}</span>
              ${p.tipe==='manual'&&p.deskripsi?`<span style="color:var(--t4)">· ${p.deskripsi.slice(0,28)}${p.deskripsi.length>28?'...':''}</span>`:''}
              ${p.tipe==='auto'&&!isTerlambat?`<span style="color:var(--t4)">· ${p.kgNama||'-'}${p.skNama?' ('+p.skNama+')':''}</span>`:''}
              ${p.tipe==='auto'&&isTerlambat?`<span style="color:var(--t4)">· ${p.kgNama||'-'}${p.skNama?' ('+p.skNama+')':''}</span>`:''}
            </div>
            ${done&&p.catatanHukuman?`<div style="font-size:10px;color:var(--a1);margin-top:3px;font-weight:600">⚖️ ${p.catatanHukuman}</div>`:''}
          </div>
          <div style="display:flex;flex-direction:row;gap:5px;align-items:center;flex-shrink:0">
            <button style="width:28px;height:28px;border-radius:50%;background:var(--su2);border:1px solid var(--dv);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center" onclick="App._editPel('${p.id}')">✏️</button>
            ${!done?`<button class="tazir-btn" onclick="App._tazirPop('${p.id}')">⚖️ Ta'zir</button>`:`${S._adminMode===true?`<button style="width:28px;height:28px;border-radius:50%;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.22);font-size:11px;cursor:pointer;color:#ef4444;display:flex;align-items:center;justify-content:center" onclick="App._delPel('${p.id}')" title="Hapus (Admin)">🗑</button>`:''}`}
          </div>
        </div>
        ${p.fotoBukti?.length?`<div style="display:flex;gap:5px;margin-top:8px;overflow-x:auto">${p.fotoBukti.map(f2=>`<img src="${f2}" style="width:52px;height:52px;border-radius:var(--r2);object-fit:cover;flex-shrink:0">`).join('')}</div>`:''}
      </div>`;
    };
    const autoGroupHtml=Object.values(autoByKg).map(g=>{
      const k=kgM[g.kgId];const sk2=g.skId?skM[g.skId]:null;
      return`<div style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;display:flex;align-items:center;gap:5px">
          ${k?.icon||'📋'} ${k?.nama||'-'}${sk2?` › ${sk2.nama}`:''} <span style="background:rgba(239,68,68,.1);color:#ef4444;padding:1px 6px;border-radius:100px;font-size:8px">${g.items.length}</span>
        </div>
        ${g.items.map(renderCard).join('')}
      </div>`;
    }).join('');
    document.getElementById('pel-body').innerHTML=`<div style="padding:0 15px 15px">
      <!-- Stat cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">
        ${[['⚠️','Total',tot,'var(--t1)'],['🔴','Belum',belum,'#ef4444'],['✅','Sudah',sudah,'var(--a1)'],['✏️','Non Alpha',manual,'#7c3aed']].map(([ic,lb,v,col])=>`<div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:10px 6px;text-align:center;backdrop-filter:blur(20px)"><div style="font-family:var(--fd);font-size:18px;font-weight:900;color:${col}">${v}</div><div style="font-size:8px;color:var(--t3);margin-top:1px">${lb}</div></div>`).join('')}
      </div>
      <!-- Tren 7 hari -->
      <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);padding:12px;margin-bottom:10px;backdrop-filter:blur(20px)">
        <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Tren 7 Hari</div>
        <div class="bar-chart" style="height:64px">${trenBar}</div>
      </div>
      <!-- Per kegiatan -->
      ${topKg.length?`<div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);padding:12px;margin-bottom:10px;backdrop-filter:blur(20px)">
        <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Pelanggaran per Kegiatan</div>
        ${topKg.map(([kid,n])=>{const k=kgM[kid];const pct2=tot?Math.round(n/tot*100):0;return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:14px">${k?.icon||'📋'}</span><div style="flex:1"><div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:11px;color:var(--t2)">${k?.nama||'-'}</span><span style="font-size:10px;font-weight:700;color:#ef4444">${n}</span></div><div style="background:var(--dv);border-radius:100px;height:4px"><div style="background:linear-gradient(90deg,#ef4444,#dc2626);height:4px;border-radius:100px;width:${pct2}%"></div></div></div></div>`;}).join('')}
      </div>`:''}
      <!-- Peraturan Pondok - collapsible, di bawah rekap angka -->
      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);margin-bottom:12px;backdrop-filter:blur(20px);overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;cursor:pointer" onclick="App._togPeraturan()">
          <div style="font-family:var(--fd);font-size:12px;font-weight:800;color:var(--t1);display:flex;align-items:center;gap:6px">
            📜 Peraturan Pondok <span style="font-size:10px;font-weight:600;color:var(--t3);background:var(--gs);border-radius:100px;padding:1px 7px">${per.length}</span>
          </div>
          <span id="per-chevron" style="font-size:12px;color:var(--t3);transition:transform .2s">${per.length?'▾':'▾'}</span>
        </div>
        <div id="per-body" style="display:none;border-top:1px solid var(--dv);padding:10px 12px">
          ${per.length?per.map((pr,idx)=>`<div style="padding:8px;background:var(--gs);border-radius:var(--r2);border-left:3px solid var(--a1);margin-bottom:6px">
            <div style="font-size:11px;font-weight:700;color:var(--t1);margin-bottom:2px">${idx+1}. ${pr.pelanggaran||pr.nama||'-'}</div>
            ${pr.hukuman?`<div style="font-size:9px;color:#ef4444;font-weight:600">⚖️ ${pr.hukuman}</div>`:''}
          </div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:6px 0">Belum ada peraturan.</div>'}
        </div>
      </div>
      <!-- Actions -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px">
        <button class="qb" style="font-size:12px;padding:11px;margin:0;width:100%;border-radius:var(--r3)" onclick="App._addPelManual()">+ Pelanggaran</button>
        <div style="display:flex;gap:7px">
          <button onclick="App._pelAksiPop()" title="Aksi & Laporan" style="flex:1;padding:11px 14px;border-radius:var(--r3);background:var(--gs);border:1.5px solid rgba(13,181,127,.2);font-size:11px;cursor:pointer;color:var(--a1);display:flex;align-items:center;gap:5px;font-weight:700">💬 Laporan</button>
        </div>
      </div>
      <!-- Tab Alpha/Terlambat vs Non Alpha (tidak collapsible) -->
      <div style="display:flex;justify-content:center;gap:0;margin:10px 0 14px;background:var(--su2);border:1.5px solid var(--dv);border-radius:100px;padding:3px">
        <button id="pltab-auto" onclick="App._setPelListTab('auto')" style="flex:1;padding:8px 0;border-radius:100px;border:none;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;${(S._pelListTab||'auto')==='auto'?'background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;box-shadow:0 3px 10px rgba(239,68,68,.3)':'background:transparent;color:var(--t3)'}">⚠️ Alpha / Terlambat (${fAuto.length})</button>
        <button id="pltab-manual" onclick="App._setPelListTab('manual')" style="flex:1;padding:8px 0;border-radius:100px;border:none;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;${(S._pelListTab||'auto')==='manual'?'background:var(--grad);color:#fff;box-shadow:0 3px 10px rgba(13,181,127,.3)':'background:transparent;color:var(--t3)'}">✏️ Non Alpha (${fManual.length})</button>
      </div>
      <!-- Filter status (collapsible) -->
      <div class="fwrap${S._pelFilterOpen===true?' on':''}" id="pel-fwrap">
        <div class="fwrap-h" onclick="App._togFilter('pel-fwrap')">
          <div class="fwrap-h-lb">Filter Status${S._pelFilter!=='semua'?` <span style="font-size:9px;color:var(--a1);background:var(--gs);padding:1px 6px;border-radius:100px">${S._pelFilter}</span>`:''}</div>
          <span class="fwrap-h-ic">▾</span>
        </div>
        <div class="fwrap-b">
          <div class="pel-filter" style="margin-bottom:0">
            <div class="pel-fc${S._pelFilter==='semua'?' on':''}" onclick="S._pelFilter='semua';App.renderPel()">Semua (${tot})</div>
            <div class="pel-fc${S._pelFilter==='belum'?' on':''}" onclick="S._pelFilter='belum';App.renderPel()">🔴 Belum (${belum})</div>
            <div class="pel-fc${S._pelFilter==='sudah'?' on':''}" onclick="S._pelFilter='sudah';App.renderPel()">✅ Sudah (${sudah})</div>
          </div>
        </div>
      </div>
      <!-- AUDIT v3m: Search + Filter Sub-Kegiatan -->
      <div style="display:flex;gap:7px;margin-bottom:12px">
        <div style="flex:1;display:flex;align-items:center;gap:7px;background:var(--inp);border:1.5px solid var(--dv);border-radius:var(--r2);padding:9px 12px">
          <span style="color:var(--t4);font-size:14px">🔍</span>
          <input id="pel-search" class="fi" placeholder="Cari nama santri..." oninput="App._filterPelList()" style="border:none;padding:0;background:transparent;flex:1;font-size:13px" value="${esc(S._pelSearch||'')}">
        </div>
        <select id="pel-sk-filter" class="fi" onchange="App._filterPelList()" style="width:auto;padding:9px 12px;font-size:12px;border-radius:var(--r2);background:var(--su);border:1.5px solid var(--dv)">
          <option value="">Semua Kegiatan</option>
          ${[...new Set(pel.map(p=>p.kgId))].map(kid=>{const k=kgM[kid];return k?`<option value="kg_${kid}" ${S._pelSkFilter==='kg_'+kid?'selected':''}>${k.nama}</option>`:''}).join('')}
          ${sk.filter(s=>s.aktif!==false).map(s=>`<option value="sk_${s.id}" ${S._pelSkFilter==='sk_'+s.id?'selected':''}>  ↳ ${s.nama}</option>`).join('')}
        </select>
      </div>
      <!-- List berdasarkan tab aktif -->
      ${(S._pelListTab||'auto')==='auto'
        ?( fAuto.length ? autoGroupHtml : '<div class="empty" style="padding:20px 0"><div class="es">Tidak ada pelanggaran Alpha / Terlambat.</div></div>' )
        :( fManual.length ? sortPel(fManual).map(renderCard).join('') : '<div class="empty" style="padding:20px 0"><div class="es">Tidak ada pelanggaran Non Alpha.</div></div>' )
      }
    </div>`;
  },

  _togPeraturan(){
    const body=document.getElementById('per-body');
    const chev=document.getElementById('per-chevron');
    if(!body)return;
    const open=body.style.display==='none'||body.style.display==='';
    body.style.display=open?'block':'none';
    if(chev)chev.style.transform=open?'rotate(180deg)':'rotate(0deg)';
  },
  _togFilter(id){
    const el=document.getElementById(id);
    if(el)el.classList.toggle('on');
  },
  // AUDIT v3m: Filter pelanggaran berdasarkan search + sub-kegiatan
  _filterPelList(){
    const q=(document.getElementById('pel-search')?.value||'').toLowerCase().trim();
    const skFilter=document.getElementById('pel-sk-filter')?.value||'';
    S._pelSearch=q;
    S._pelSkFilter=skFilter;
    this.renderPel();
  },
  _setPelListTab(tab){
    S._pelListTab=tab;
    this.renderPel();
  },
  _tazirPop(pelId){
    this._pinBuf='';
    OS(`<div class="sh">⚖️ Ta'zir</div><div class="sb" style="padding-bottom:80px">
      <div style="background:rgba(239,68,68,.06);border:1.5px solid rgba(239,68,68,.2);border-radius:var(--r3);padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--t2)">Tandai santri sudah diterima hukuman/ta'zir.</div>
      <div class="fg"><label class="fl">Jenis / Keterangan Hukuman (opsional)</label><input class="fi" id="tazir-ket" placeholder="Misal: Hafalan 1 halaman, Piket dapur..."></div>
      <div class="fg"><label class="fl">Foto Bukti Hukuman (opsional)</label><button style="width:100%;padding:11px;border-radius:var(--r3);background:var(--su);border:1.5px dashed var(--dv);font-size:12px;color:var(--t3);cursor:pointer" onclick="App._tazirFoto('${pelId}')">📷 Ambil / Pilih Foto</button><div id="tazir-foto-preview" style="margin-top:6px"></div></div>
      <button class="bg2 bw" onclick="App._saveTazir('${pelId}')">✅ Simpan Ta'zir</button>
    </div>`);
  },
  _tazirFoto(pelId){
    S._tazirPelId=pelId;
    const inp=document.getElementById('foto-inp-tazir');
    inp.value='';inp.click();
  },
  async _saveTazir(pelId){
    const ket=document.getElementById('tazir-ket')?.value.trim()||'';
    const p=await DB.g('pelanggaran',pelId);if(!p)return;
    p.status='sudah';p.catatanHukuman=ket;p.tazirAt=Date.now();p.updatedAt=Date.now();
    if(S._tazirFotoB64){p.fotoHukuman=S._tazirFotoB64;S._tazirFotoB64=''}
    await DB.p('pelanggaran',p);CS();T('✅ Tazir dicatat!');await this.renderPel();
  },

  _addPelManual(){
    DB.ga('santri').then(snt=>{
      const aktif=snt.filter(x=>x.aktif).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
      S._pelSelSnt=new Set();S._pelFotos=[];S._pelAllSnt=aktif;
      OS('<div class="sh">+ Pelanggaran Manual</div><div class="sb" style="padding-bottom:80px">'
        +'<div class="fg"><label class="fl">Pilih Santri</label>'
        +'<div style="background:var(--gs);border:1.5px solid var(--dv);border-radius:var(--r3);overflow:hidden">'
        +'<div style="padding:8px 10px;border-bottom:1px solid var(--dv);display:flex;align-items:center;gap:7px">'
        +'<span style="color:var(--t4)">🔍</span>'
        +'<input class="fi" id="pel-search" placeholder="Cari nama santri..." oninput="App._pelSearch()" style="border:none;padding:0;background:transparent;flex:1;font-size:13px">'
        +'</div>'
        +'<div id="pel-snt-list" style="max-height:200px;overflow-y:scroll;-webkit-overflow-scrolling:touch">'
        +App._buildPelSntList(aktif)
        +'</div>'
        +'<div style="padding:6px 10px;border-top:1px solid var(--dv);font-size:10px;color:var(--t3)" id="pel-sel-count">0 santri dipilih</div>'
        +'</div></div>'
        +'<div class="fg"><label class="fl">Deskripsi Pelanggaran *</label><textarea class="fi" id="pel-desk" rows="2" placeholder="Misal: Keluar tanpa izin..." style="resize:none"></textarea></div>'
        +'<div class="fg"><label class="fl">Jenis Hukuman (opsional)</label><input class="fi" id="pel-huk" placeholder="Misal: Hafalan, piket..."></div>'
        +'<div class="fg"><label class="fl">Catatan (opsional)</label><input class="fi" id="pel-cat" placeholder="Catatan tambahan..."></div>'
        +'<div class="fg"><label class="fl">Tanggal</label><input class="fi" id="pel-tgl" type="date" value="'+_todayLocal()+'"></div>'
        +'<div class="fg"><label class="fl">Foto Bukti (opsional, max 2)</label>'
        +'<button style="width:100%;padding:10px;border-radius:var(--r3);background:var(--su);border:1.5px dashed var(--dv);font-size:12px;color:var(--t3);cursor:pointer" onclick="App._pelFoto()">📷 Tambah Foto</button>'
        +'<div id="pel-foto-list" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"></div></div>'
        +'<button class="bg2 bw" onclick="App._savePelManual()">Simpan</button>'
        +'</div>');
    });
  },
  _buildPelSntList(arr){
    if(!arr||!arr.length)return '<div style="padding:12px;text-align:center;font-size:12px;color:var(--t3)">Tidak ada santri</div>';
    return arr.map(x=>{
      const sel=S._pelSelSnt&&S._pelSelSnt.has(x.id);
      const av=x.foto?'<img src="'+x.foto+'" style="width:100%;height:100%;object-fit:cover">':'<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">'+x.nama.charAt(0)+'</div>';
      return '<div style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-bottom:1px solid var(--dv);cursor:pointer;background:'+(sel?'var(--gs)':'transparent')+'" onclick="App._pelTogSnt(\''+x.id+'\',this)" id="psl-'+x.id+'">'
        +'<div style="width:20px;height:20px;border-radius:6px;border:1.5px solid '+(sel?'var(--a1)':'var(--dv)')+';background:'+(sel?'var(--a1)':'transparent')+';display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0" id="pslck-'+x.id+'">'+(sel?'\u2713':'')+'</div>'
        +'<div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0">'+av+'</div>'
        +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--t1)">'+x.nama+'</div><div style="font-size:10px;color:var(--t3)">'+x.kamar+'</div></div>'
        +'</div>';
    }).join('');
  },
  _pelSearch(){
    const q=(document.getElementById('pel-search')?.value||'').toLowerCase();
    const filtered=(S._pelAllSnt||[]).filter(x=>x.nama.toLowerCase().includes(q)||x.kamar.toLowerCase().includes(q));
    const list=document.getElementById('pel-snt-list');
    if(list)list.innerHTML=App._buildPelSntList(filtered);
  },
  _pelTogSnt(id,el){
    if(S._pelSelSnt.has(id)){
      S._pelSelSnt.delete(id);
      const ck=document.getElementById('pslck-'+id);
      if(ck){ck.style.background='transparent';ck.textContent='';ck.style.border='1.5px solid var(--dv)';}
      el.style.background='';
    }else{
      S._pelSelSnt.add(id);
      const ck=document.getElementById('pslck-'+id);
      if(ck){ck.style.background='var(--a1)';ck.textContent='✓';ck.style.color='#fff';ck.style.border='1.5px solid var(--a1)';}
      el.style.background='var(--gs)';
    }
    const cnt=document.getElementById('pel-sel-count');
    if(cnt)cnt.textContent=S._pelSelSnt.size+' santri dipilih';
  },
  _pelFoto(){
    if((S._pelFotos||[]).length>=2){T('Maksimal 2 foto');return}
    const inp=document.getElementById('foto-inp-pel');
    inp.value='';inp.click();
  },
  async _savePelManual(){
    const desk=document.getElementById('pel-desk')?.value.trim();
    if(!desk){T('Deskripsi wajib!');return}
    if(!S._pelSelSnt?.size){T('Pilih minimal 1 santri!');return}
    const huk=document.getElementById('pel-huk')?.value.trim()||'';
    const cat=document.getElementById('pel-cat')?.value.trim()||'';
    const tgl=document.getElementById('pel-tgl')?.value||_todayLocal();
    const fotos=S._pelFotos||[];
    const now=Date.now();
    const sntAll=await DB.ga('santri');const sntM=mapBy(sntAll,'id');
    for(const sntId of S._pelSelSnt){
      const sn=sntM[sntId];
      await DB.p('pelanggaran',{id:uid(),tipe:'manual',sntId,sntNama:sn?.nama||sntId,
        kgId:'',kgNama:'',skId:'',skNama:'',tanggal:tgl,
        deskripsi:desk,jeniHukuman:huk,catatan:cat,
        fotoBukti:fotos,status:huk?'sudah':'belum',
        catatanHukuman:huk,createdAt:now,updatedAt:now});
    }
    CS();T('✅ Pelanggaran disimpan!');await this.renderPel();
  },
  async _editPel(pelId){
    const p=await DB.g('pelanggaran',pelId);if(!p)return;
    OS(`<div class="sh">Edit Pelanggaran</div><div class="sb" style="padding-bottom:80px">
      ${p.tipe==='manual'?`<div class="fg"><label class="fl">Deskripsi</label><textarea class="fi" id="epl-desk" rows="2" style="resize:none">${esc(p.deskripsi||'')}</textarea></div>`:''}
      <div class="fg"><label class="fl">Keterangan Hukuman</label><input class="fi" id="epl-huk" value="${esc(p.catatanHukuman||'')}"></div>
      <div class="fg"><label class="fl">Status</label><select class="fsel" id="epl-st"><option value="belum"${p.status==='belum'?' selected':''}>Belum Dihukum</option><option value="sudah"${p.status==='sudah'?' selected':''}>Sudah Dihukum</option></select></div>
      <button class="bg2 bw" onclick="App._saveEditPel('${pelId}')">Simpan</button>
      <button style="width:100%;margin-top:8px;padding:12px;border-radius:var(--r3);background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.2);color:#ef4444;font-size:13px;font-weight:600;cursor:pointer" onclick="App._delPel('${pelId}')">🗑 Hapus</button>
    </div>`);
  },
  async _saveEditPel(pelId){
    const p=await DB.g('pelanggaran',pelId);if(!p)return;
    p.status=document.getElementById('epl-st')?.value||p.status;
    p.catatanHukuman=document.getElementById('epl-huk')?.value.trim()||p.catatanHukuman;
    if(p.tipe==='manual')p.deskripsi=document.getElementById('epl-desk')?.value.trim()||p.deskripsi;
    p.updatedAt=Date.now();await DB.p('pelanggaran',p);CS();T('✅ Disimpan!');await this.renderPel();
  },
  _delPel(pelId){if(!_needAdmin())return;OS(`<div class="cw"><div class="ci3">⚠️</div><div class="ct3">Hapus pelanggaran ini?</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelPel('${pelId}')">Hapus</button></div></div>`)},
  async _doDelPel(pelId){if(!_needAdmin())return;await DB.d('pelanggaran',pelId);CS();T('Dihapus!');await this.renderPel()},

  async _peraturanSheet(){
    const per=await DB.ga('peraturan');
    OS(`<div class="sh">📜 Kelola Peraturan Pondok</div><div class="sb" style="padding-bottom:80px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Daftar pelanggaran beserta hukumannya</div>
      <div id="per-list">
      ${per.length?per.map((p,i)=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:11px;background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r3);margin-bottom:7px;backdrop-filter:blur(16px)">
        <div style="width:24px;height:24px;border-radius:8px;background:var(--gs);border:1px solid rgba(13,181,127,.18);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--a1);flex-shrink:0;margin-top:1px">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:3px">${esc(p.pelanggaran)}</div>
          ${p.hukuman?`<div style="font-size:10px;color:#ef4444;font-weight:600">⚖️ ${esc(p.hukuman)}</div>`:'<div style="font-size:10px;color:var(--t4)">Belum ada hukuman</div>'}
        </div>
        <button style="width:28px;height:28px;border-radius:8px;background:var(--gs);border:1px solid rgba(13,181,127,.14);font-size:12px;cursor:pointer;flex-shrink:0" onclick="App._editPeraturan('${p.id}')">✏️</button>
        <button style="width:28px;height:28px;border-radius:8px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);font-size:11px;cursor:pointer;flex-shrink:0;color:#ef4444" onclick="App._delPeraturan('${p.id}')">✕</button>
      </div>`).join(''):'<div style="text-align:center;padding:20px 0"><div style="font-size:28px;margin-bottom:8px">📋</div><div style="font-size:12px;color:var(--t3)">Belum ada peraturan</div></div>'}
      </div>
      <div style="margin-top:14px;background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r3);padding:13px;backdrop-filter:blur(16px)">
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">+ Tambah Peraturan Baru</div>
        <div class="fg"><label class="fl">Jenis Pelanggaran *</label><input class="fi" id="pr-pel" placeholder="Misal: Keluar tanpa izin..."></div>
        <div class="fg"><label class="fl">Hukuman (opsional)</label><input class="fi" id="pr-huk" placeholder="Misal: Piket dapur 3 hari..."></div>
        <button class="bg2 bw" onclick="App._savePeraturan()">+ Tambah</button>
      </div>
    </div>`);
  },
  async _savePeraturan(prId){
    const pel=document.getElementById('pr-pel')?.value.trim();const huk=document.getElementById('pr-huk')?.value.trim()||'';
    if(!pel){T('⚠️ Nama pelanggaran wajib diisi!');return}
    if(prId){
      const p=await DB.g('peraturan',prId);
      p.pelanggaran=pel;p.hukuman=huk;p.updatedAt=Date.now();
      await DB.p('peraturan',p);
      T('✅ Peraturan diperbarui!');CS();await this._peraturanSheet();
    } else {
      await DB.p('peraturan',{id:uid(),pelanggaran:pel,hukuman:huk,createdAt:Date.now(),updatedAt:Date.now()});
      T('✅ Peraturan ditambahkan!');CS();await this._peraturanSheet();
    }
  },
  async _editPeraturan(prId){
    const p=await DB.g('peraturan',prId);if(!p)return;
    OS(`<div class="sh">✏️ Edit Peraturan</div><div class="sb" style="padding-bottom:80px">
      <div class="fg"><label class="fl">Jenis Pelanggaran</label><input class="fi" id="pr-pel" value="${esc(p.pelanggaran||'')}"></div>
      <div class="fg"><label class="fl">Hukuman</label><input class="fi" id="pr-huk" value="${esc(p.hukuman||'')}"></div>
      <button class="bg2 bw" onclick="App._savePeraturan('${prId}')">Simpan Perubahan</button>
      <button style="width:100%;margin-top:8px;padding:12px;border-radius:100px;background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.2);color:#ef4444;font-size:13px;font-weight:600;cursor:pointer" onclick="CS();App._delPeraturan('${prId}')">🗑 Hapus Peraturan</button>
    </div>`);
  },
  async _delPeraturan(prId){if(!_needAdmin())return;
    await DB.d('peraturan',prId);
    T('🗑 Peraturan dihapus!');
    await this._peraturanSheet();
  },

  _pelAksiPop(){
    OS(`<div class="sh">💬 Aksi &amp; Laporan</div><div class="sb" style="padding-bottom:24px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="CS();App._salinPelHarian()" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:var(--gs);border:1.5px solid var(--dv);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">📋</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--t1)">Salin Harian</div><div style="font-size:10px;color:var(--t3)">Salin rekap pelanggaran hari ini ke clipboard</div></div>
        </button>
        <button onclick="CS();App._laporPelHarian()" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:rgba(37,211,102,.07);border:1.5px solid rgba(37,211,102,.22);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">💬</span>
          <div><div style="font-size:13px;font-weight:700;color:#25d366">Laporan Harian via WhatsApp</div><div style="font-size:10px;color:var(--t3)">Kirim rekap harian ke WhatsApp</div></div>
        </button>
        <div style="height:1px;background:var(--dv);margin:2px 0"></div>
        <button onclick="CS();App._salinPelBulanan()" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:var(--gs);border:1.5px solid var(--dv);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">📋</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--t1)">Salin Bulanan</div><div style="font-size:10px;color:var(--t3)">Salin rekap pelanggaran bulan ini ke clipboard</div></div>
        </button>
        <button onclick="CS();App._laporPelBulanan()" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:rgba(37,211,102,.07);border:1.5px solid rgba(37,211,102,.22);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">💬</span>
          <div><div style="font-size:13px;font-weight:700;color:#25d366">Laporan Bulanan via WhatsApp</div><div style="font-size:10px;color:var(--t3)">Kirim rekap bulanan ke WhatsApp</div></div>
        </button>
      </div>
    </div>`);
  },
  async _salinPelHarian(){
const today=_todayLocal();
const [pel,snt]=await Promise.all([DB.ga('pelanggaran'),DB.ga('santri')]);
const sntM=mapBy(snt,'id');
const hPel=pel.filter(p=>p.tanggal===today);
let t='\u26a0\ufe0f PELANGGARAN HARIAN\n\uD83C\uDFE0 '+_appN()+'\n\uD83D\uDCC5 '+today+'\n\n';
if(!hPel.length){t+='Tidak ada pelanggaran hari ini.\n';}else{
t+='Total: '+hPel.length+' | Belum: '+hPel.filter(p=>p.status==='belum').length+' | Sudah: '+hPel.filter(p=>p.status==='sudah').length+'\n\n';
hPel.forEach(p=>{
const sn=sntM[p.sntId];
const pDesc=p.tipe==='auto'?('Alpha: '+p.kgNama+(p.skNama?' ('+p.skNama+')':'')):(p.deskripsi||'-');
const pSt=p.status==='belum'?'Belum':'Sudah Tazir';
t+='\u2022 '+(sn?.nama||'-')+' \u2014 '+pDesc+' \u2014 '+pSt+(p.catatanHukuman?' ('+p.catatanHukuman+')':'')+' \n';
});
}
t+='\u2014\n'+_appN();
try{await navigator.clipboard.writeText(t);T('\u2705 Disalin!');}
catch{OS('<div class="sh">Rekap Pelanggaran Harian</div><div class="sb"><textarea class="fi" style="height:200px;resize:none;font-size:11px" onclick="this.select()">'+t+'</textarea></div>');}
  },
  async _salinPelBulanan(){
const now=new Date();
const mp=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const [pel,snt]=await Promise.all([DB.ga('pelanggaran'),DB.ga('santri')]);
const sntM=mapBy(snt,'id');
const mPel=pel.filter(p=>p.tanggal.startsWith(mp));
let t='\u26a0\ufe0f REKAP PELANGGARAN BULANAN\n\uD83C\uDFE0 '+_appN()+'\n\uD83D\uDCC5 '+months[now.getMonth()]+' '+now.getFullYear()+'\n\n';
t+='Total: '+mPel.length+' | Belum: '+mPel.filter(p=>p.status==='belum').length+' | Sudah: '+mPel.filter(p=>p.status==='sudah').length+'\n\n';
if(!mPel.length){t+='Tidak ada pelanggaran bulan ini.\n';}else{
mPel.sort((a,b)=>a.tanggal.localeCompare(b.tanggal)).forEach(p=>{
const sn=sntM[p.sntId];
const pDesc=p.tipe==='auto'?('Alpha '+p.kgNama+(p.skNama?' ('+p.skNama+')':'')):(p.deskripsi||'-');
t+=p.tanggal+' | '+(sn?.nama||'-')+' | '+pDesc+' | '+(p.status==='belum'?'Belum':'Sudah')+(p.catatanHukuman?' \u2014 '+p.catatanHukuman:'')+'\n';
});
}
t+='\u2014\n'+_appN();
try{await navigator.clipboard.writeText(t);T('\u2705 Disalin!');}
catch{OS('<div class="sh">Rekap Pelanggaran Bulanan</div><div class="sb"><textarea class="fi" style="height:200px;resize:none;font-size:11px" onclick="this.select()">'+t+'</textarea></div>');}
  },



  async _laporRekHarian(){
const [kg,sesAll,absAll,snt,sk]=await Promise.all([DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('subKeg')]);
const kgM=mapBy(kg,'id'),sntM=mapBy(snt,'id'),skM=mapBy(sk,'id');
const allSes=sesAll.filter(x=>x.tanggal===S.rkDate);
const allAbs=absAll.filter(a=>allSes.find(x=>x.id===a.sesiId));
const kgGroups={};
allSes.forEach(sx=>{if(!kgGroups[sx.kgId])kgGroups[sx.kgId]=[];kgGroups[sx.kgId].push(sx);});
const dayC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
allAbs.forEach(a=>{if(dayC[a.status]!==undefined)dayC[a.status]++;});
const tot=allAbs.length,pct=tot?Math.round(dayC.hadir/tot*100):0;
let t='*\uD83D\uDCCB REKAP HARIAN ABSENSI*\n';
t+='\uD83C\uDFE0 '+_appN()+'\n\uD83D\uDCC5 '+S.rkDate+'\n\n';
t+='\uD83D\uDCCA *RINGKASAN*\n';
t+='\u2705 Hadir : '+dayC.hadir+'\n\u274C Alpha : '+dayC.alpha+'\n\uD83D\uDCCB Izin : '+dayC.izin+'\n\uD83E\uDD12 Sakit : '+dayC.sakit+'\n\u23F0 Terlambat: '+dayC.terlambat+'\n';
t+='\uD83D\uDCC8 Kehadiran: '+pct+'% ('+dayC.hadir+'/'+tot+')\n\n';
Object.keys(kgGroups).forEach(kid=>{
const k=kgM[kid];const sxs=kgGroups[kid];
t+=(k?.icon||'\uD83D\uDCCB')+' *'+(k?.nama||'-')+'*\n';
sxs.forEach(sx=>{
const skItem=sx.skId?skM[sx.skId]:null;
if(skItem)t+='\uD83D\uDD39 '+skItem.nama+'\n';
const sa=absAll.filter(a=>a.sesiId===sx.id);
const sc={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
sa.forEach(a=>{if(sc[a.status]!==undefined)sc[a.status]++;});
t+='Hadir '+sc.hadir+' | Alpha '+sc.alpha+' | Izin '+sc.izin+'\n';
['alpha','izin','sakit','terlambat'].forEach(st=>{
const list=sa.filter(a=>a.status===st).map(a=>sntM[a.sntId]).filter(Boolean);
if(list.length)t+=''+st.toUpperCase()+': '+list.map(x=>x.nama).join(', ')+'\n';
});
});
t+='\n';
});
t+='_Dikirim via '+_appN()+'_';
// Share WhatsApp generik (tanpa nomor tujuan tetap) — user pilih kontak sendiri
window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(t),'_blank');
  },

  async _laporRekBulanan(){
const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const monthPfx=S.rkYear+'-'+String(S.rkMonth+1).padStart(2,'0');
const [kg,sesAll,absAll,sk]=await Promise.all([DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('subKeg')]);
const kgM=mapBy(kg,'id'),skM=mapBy(sk,'id');
const monSes=sesAll.filter(x=>x.tanggal.startsWith(monthPfx));
const monAbs=absAll.filter(a=>monSes.find(x=>x.id===a.sesiId));
const totC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
monAbs.forEach(a=>{if(totC[a.status]!==undefined)totC[a.status]++;});
const tot=monAbs.length,pct=tot?Math.round(totC.hadir/tot*100):0;
const aktif=kg.filter(x=>x.aktif).sort((a,b)=>a.urutan-b.urutan);
let t='*\uD83D\uDCC6 REKAP BULANAN ABSENSI*\n';
t+='\uD83C\uDFE0 '+_appN()+'\n\uD83D\uDCC5 '+months[S.rkMonth]+' '+S.rkYear+'\n\n';
t+='\uD83D\uDCCA *RINGKASAN*\n';
t+='\u2705 Hadir : '+totC.hadir+'\n\u274C Alpha : '+totC.alpha+'\n\uD83D\uDCCB Izin : '+totC.izin+'\n\uD83E\uDD12 Sakit : '+totC.sakit+'\n\u23F0 Terlambat: '+totC.terlambat+'\n';
t+='\uD83D\uDCC8 Kehadiran: '+pct+'% ('+totC.hadir+'/'+tot+')\n\n';
aktif.forEach(k=>{
const kSes=monSes.filter(x=>x.kgId===k.id);
const kAbs=monAbs.filter(a=>kSes.find(x=>x.id===a.sesiId));
if(!kAbs.length)return;
const kC={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0};
kAbs.forEach(a=>{if(kC[a.status]!==undefined)kC[a.status]++;});
const kP=kAbs.length?Math.round(kC.hadir/kAbs.length*100):0;
t+=k.icon+' *'+k.nama+'* \u2014 '+kP+'%\n';
t+='Hadir '+kC.hadir+' | Alpha '+kC.alpha+' | Izin '+kC.izin+' | Sakit '+kC.sakit+'\n\n';
});
t+='_Dikirim via '+_appN()+'_';
// Share WhatsApp generik — user pilih kontak sendiri di WhatsApp
window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(t),'_blank');
  },

  _rkAksiPop(tipe){
    const isH = tipe === 'harian';
    OS(`<div class="sh">💬 Aksi &amp; Laporan</div><div class="sb" style="padding-bottom:24px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="CS();App.${isH?'_salinHarian':'_salinBulanan'}()" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:var(--gs);border:1.5px solid var(--dv);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">📋</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--t1)">Salin ${isH?'Harian':'Bulanan'}</div><div style="font-size:10px;color:var(--t3)">Salin teks rekap ke clipboard</div></div>
        </button>
        <button onclick="CS();App.${isH?'_laporRekHarian':'_laporRekBulanan'}()" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:rgba(37,211,102,.08);border:1.5px solid rgba(37,211,102,.25);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">💬</span>
          <div><div style="font-size:13px;font-weight:700;color:#25d366">Laporan via WhatsApp</div><div style="font-size:10px;color:var(--t3)">Kirim laporan ke WhatsApp</div></div>
        </button>
        <button onclick="CS();Exp.csvSes()" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:var(--su);border:1.5px solid var(--dv);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">📊</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--t1)">Export CSV</div><div style="font-size:10px;color:var(--t3)">Download data sebagai spreadsheet</div></div>
        </button>
        ${!isH?`<button onclick="CS();Exp.exportAlphaBulanan(S.rkYear,S.rkMonth)" style="width:100%;padding:13px 15px;border-radius:var(--r3);background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.22);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <span style="font-size:20px">❌</span>
          <div><div style="font-size:13px;font-weight:700;color:#ef4444">Export Rekap Alpha (Excel)</div><div style="font-size:10px;color:var(--t3)">Pivot: nama santri × sub kegiatan, khusus Alpha bulan ini</div></div>
        </button>`:''}
      </div>
    </div>`);
  },

  async _laporPelHarian(){
const today=_todayLocal();
const [pel,snt]=await Promise.all([DB.ga('pelanggaran'),DB.ga('santri')]);
const sntM=mapBy(snt,'id');
const hPel=pel.filter(p=>p.tanggal===today);
let t='*\u26A0\uFE0F LAPORAN PELANGGARAN HARIAN*\n';
t+='\uD83C\uDFE0 '+_appN()+'\n\uD83D\uDCC5 '+today+'\n\n';
if(!hPel.length){t+='Alhamdulillah, tidak ada pelanggaran hari ini.\n';}
else{
t+='Total: *'+hPel.length+'* | Belum ta\'zir: *'+hPel.filter(p=>p.status==='belum').length+'* | Sudah ta\'zir: *'+hPel.filter(p=>p.status==='sudah').length+'*\n\n';
// Group by sub-kegiatan / kegiatan
const groups={};
hPel.forEach(p=>{
const key=p.skNama||(p.kgNama?'Kegiatan: '+p.kgNama:'Pelanggaran Umum');
if(!groups[key])groups[key]={belum:[],sudah:[]};
if(p.status==='sudah')groups[key].sudah.push(p);
else groups[key].belum.push(p);
});
Object.entries(groups).forEach(([grp,data])=>{
t+='*'+grp+'*\n';
if(data.belum.length){
t+='- Belum di-ta\'zir\n';
data.belum.forEach((p,i)=>{
const sn=sntM[p.sntId];
t+=(i+1)+'. '+(sn?.nama||'-')+(p.deskripsi&&p.tipe!=='auto'?' \u2014 '+p.deskripsi:'')+'\n';
});
}
if(data.sudah.length){
t+='- Sudah di-ta\'zir\n';
data.sudah.forEach((p,i)=>{
const sn=sntM[p.sntId];
t+=(i+1)+'. '+(sn?.nama||'-')+(p.catatanHukuman?' ('+p.catatanHukuman+')':'')+'\n';
});
}
t+='\n';
});
}
t+='_Dikirim via '+_appN()+'_';
// Share WhatsApp generik — user pilih kontak sendiri di WhatsApp
window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(t),'_blank');
  },

  async _laporPelBulanan(){
const now=new Date();
const mp=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const [pel,snt]=await Promise.all([DB.ga('pelanggaran'),DB.ga('santri')]);
const sntM=mapBy(snt,'id');
const mPel=pel.filter(p=>p.tanggal.startsWith(mp)).sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
let t='*\u26A0\uFE0F REKAP PELANGGARAN BULANAN*\n';
t+='\uD83C\uDFE0 '+_appN()+'\n\uD83D\uDCC5 '+months[now.getMonth()]+' '+now.getFullYear()+'\n\n';
if(!mPel.length){t+='Tidak ada pelanggaran bulan ini.\n';}
else{
t+='Total: *'+mPel.length+'* | Belum ta\'zir: *'+mPel.filter(p=>p.status==='belum').length+'* | Sudah ta\'zir: *'+mPel.filter(p=>p.status==='sudah').length+'*\n\n';
const groups={};
mPel.forEach(p=>{
const key=p.skNama||(p.kgNama?'Kegiatan: '+p.kgNama:'Pelanggaran Umum');
if(!groups[key])groups[key]={belum:[],sudah:[]};
if(p.status==='sudah')groups[key].sudah.push(p);
else groups[key].belum.push(p);
});
Object.entries(groups).forEach(([grp,data])=>{
t+='*'+grp+'*\n';
if(data.belum.length){
t+='- Belum di-ta\'zir\n';
data.belum.forEach((p,i)=>{
const sn=sntM[p.sntId];
t+=(i+1)+'. '+(sn?.nama||'-')+' ('+p.tanggal+')'+'\n';
});
}
if(data.sudah.length){
t+='- Sudah di-ta\'zir\n';
data.sudah.forEach((p,i)=>{
const sn=sntM[p.sntId];
t+=(i+1)+'. '+(sn?.nama||'-')+(p.catatanHukuman?' ('+p.catatanHukuman+')':'')+(p.tanggal?' \u2014 '+p.tanggal:'')+'\n';
});
}
t+='\n';
});
}
t+='_Dikirim via '+_appN()+'_';
// Share WhatsApp generik — user pilih kontak sendiri di WhatsApp
window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(t),'_blank');
  },

  async renderSet(){
    const asrama=(await DB.g('settings','asrama'))?.value||'';
    const tipe=(await DB.g('settings','lembaga_tipe'))?.value||'asrama';
    const labelLembaga=tipe==='pondok'?'Pondok Pesantren':'Asrama';
    const jk=(await DB.g('settings','jenis_kelamin'))?.value||'perempuan';
    const isLaki=jk==='laki';
    const sebutan=isLaki?'Musyrif':'Musyrifah';
    const users=await DB.ga('users');
    const ms=users.filter(u=>u.role==='musyrifah');
    document.getElementById('set-body').innerHTML=`<div style="padding:0 15px">
      <div style="margin-bottom:14px"><div class="sec-l">Profil ${labelLembaga}</div>
        <div class="sc3">
          <div class="sr2" onclick="App.editSet('asrama','Nama ${labelLembaga}','${escJ(asrama)}')">
            <div class="si4">&#x2302;</div><div class="st3"><div class="sl3">Nama ${labelLembaga}</div><div class="sv">${asrama||'Belum diisi'}</div></div><div class="sa">\u2192</div>
          </div>
        </div>
      </div>
      <div style="margin-bottom:14px"><div class="sec-l">Tampilan</div>
        <div class="sc3">
          <div class="sr2">
            <div class="si4">&#x25D1;</div><div class="st3"><div class="sl3">Mode Malam</div></div>
            <label class="tw"><input type="checkbox" class="ti" id="dm-tog" ${S.theme==='dark'?'checked':''} onchange="toggleTheme()"><span class="ts"></span></label>
          </div>
          <div class="sr2">
            <div class="si4">&#x1F3E0;</div>
            <div class="st3"><div class="sl3">Jenis ${labelLembaga}</div><div class="sv">${isLaki?'Asrama Putra (Musyrif)':'Asrama Putri (Musyrifah)'}</div></div>
            <label class="tw"><input type="checkbox" class="ti" id="jk-tog" ${isLaki?'checked':''} onchange="App._toggleJK(this)"><span class="ts"></span></label>
          </div>
        </div>
      </div>
      <div style="margin-bottom:14px"><div class="sec-l">Absensi NFC</div>
        <div class="sc3">
          <div class="sr2">
            <div class="si4">📡</div>
            <div class="st3"><div class="sl3">NFC Background (Auto-Tap)</div><div class="sv">${NFC._bgActive?'Aktif — tap di halaman manapun':(NFC._bgEnabled?'Nonaktif / error':'Nonaktif')}</div></div>
            <label class="tw"><input type="checkbox" class="ti" id="nfc-bg-tog" ${NFC._bgEnabled?'checked':''} onchange="NFC.toggleBgEnabled(this.checked)"><span class="ts"></span></label>
          </div>
          <div class="sr2" onclick="NFC.startBackground()">
            <div class="si4">▶</div><div class="st3"><div class="sl3">Mulai NFC Sekarang</div><div class="sv">Paksa start background listener</div></div><div class="sa">→</div>
          </div>
          <div class="sr2" onclick="NFC.showLastLog()">
            <div class="si4">🐛</div><div class="st3"><div class="sl3">Debug Log NFC</div><div class="sv">Lihat log aktivitas NFC</div></div><div class="sa">→</div>
          </div>
          <div style="padding:11px 13px;font-size:11px;color:var(--t3);line-height:1.55;background:var(--gs);border-radius:var(--r3);margin-top:6px">
            <strong style="color:var(--a1)">Cara kerja:</strong> Setelah login, NFC otomatis aktif di semua halaman. Saat santri tap kartu, sistem mencari <strong>sub-kegiatan</strong> dengan jam aktif saat ini (kegiatan induk tidak punya jam — hanya sub-kegiatan). Jika ada → tercatat hadir + muncul foto &amp; nama kegiatan. Jika tidak ada → muncul "Tidak Ada Kegiatan Aktif". Pastikan setiap sub-kegiatan sudah diisi jam mulai &amp; selesai.
          </div>
        </div>
      </div>
      <div style="margin-bottom:14px"><div class="sec-l">${sebutan} &amp; Akun</div>
        <div class="sc3">
          ${ms.map(u=>`<div class="sr2">
            <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;cursor:pointer" onclick="App.editUser('${u.id}')">
              ${u.foto
                ?`<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover">`
                :`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff">${u.nama.charAt(0)}</div>`}
            </div>
            <div class="st3"><div class="sl3">${u.nama}</div><div class="sv">${sebutan}</div></div>
            <button style="padding:4px 9px;border-radius:100px;background:var(--gs);border:1px solid rgba(13,181,127,.14);font-size:10px;font-weight:600;color:var(--a1);cursor:pointer" onclick="App.editUser('${u.id}')">Edit</button>
          </div>`).join('')}
          <div class="sr2" onclick="App.addUser()"><div class="si4">+</div><div class="st3"><div class="sl3">Tambah ${sebutan}</div></div><div class="sa">→</div></div>
        </div>
      </div>

      <div style="margin-bottom:14px"><div class="sec-l">Kamar</div>
        <div class="sc3">
          <div class="sr2" onclick="App.kelolaKamar()"><div class="si4">&#x229E;</div><div class="st3"><div class="sl3">Kelola Kamar</div><div class="sv">Tambah, edit, hapus kamar</div></div><div class="sa">\u2192</div></div>
        </div>
      </div>
      <div style="margin-bottom:14px"><div class="sec-l">Perizinan</div>
        <div class="sc3">
          <div class="sr2" onclick="App._kelolaJenisIzin()"><div class="si4">&#x25A4;</div><div class="st3"><div class="sl3">Kelola Jenis Izin</div><div class="sv">Tambah/edit/hapus jenis izin</div></div><div class="sa">\u2192</div></div>
        </div>
      </div>
      <div style="margin-bottom:14px"><div class="sec-l">Data</div>
        <div class="sc3">
          <div class="sr2" onclick="App.importSnt()"><div class="si4">&#x2193;</div><div class="st3"><div class="sl3">Import Santri</div><div class="sv">Massal via teks/CSV</div></div><div class="sa">\u2192</div></div>
          <div class="sr2" onclick="App._syncNfcAssalam()"><div class="si4" style="background:rgba(13,181,127,.12);border-color:rgba(13,181,127,.22);color:var(--a1)">\uD83D\uDCE1</div><div class="st3"><div class="sl3">Sinkron NFC UID Assalam</div><div class="sv">Cocokkan NFC UID dari data scan ke santri existing (by nama/NIS)</div></div><div class="sa">\u2192</div></div>
          <div class="sr2" onclick="Exp.showExportMenu()"><div class="si4">&#x2191;</div><div class="st3"><div class="sl3">Export Data Lengkap (JSON)</div><div class="sv">Pilih: Santri / Kegiatan / Perizinan & Sakit</div></div><div class="sa">\u2192</div></div>
          <div class="sr2" onclick="Exp.showFormatExportMenu()"><div class="si4" style="background:rgba(22,163,74,.12);color:#16a34a">&#x1F4CA;</div><div class="st3"><div class="sl3">Export ke Excel/CSV/Word/PDF</div><div class="sv">Santri, Absensi, Perizinan, Pelanggaran, Sakit</div></div><div class="sa">\u2192</div></div>
          <div class="sr2" onclick="Exp.backupJSON()"><div class="si4">&#x1F4BE;</div><div class="st3"><div class="sl3">Backup JSON (Semua Data)</div><div class="sv">Unduh semua data untuk backup/restore</div></div><div class="sa">\u2192</div></div>
          <div class="sr2" onclick="Exp.showImportBackup()"><div class="si4">&#x2B06;</div><div class="st3"><div class="sl3">Import / Pulihkan Backup</div><div class="sv">Kembalikan dari file JSON</div></div><div class="sa">\u2192</div></div>
          <div class="sr2" onclick="App.showAudit()"><div class="si4">&#x2261;</div><div class="st3"><div class="sl3">Audit Log</div></div><div class="sa">\u2192</div></div>
        </div>
      </div>
      <div style="margin-bottom:14px"><div class="sec-l">Peraturan Pondok</div>
        <div class="sc3">
          <div class="sr2" onclick="App._peraturanSheet()">
            <div class="si4">&#x1F4DC;</div>
            <div class="st3"><div class="sl3">Kelola Peraturan Pondok</div><div class="sv">Tambah, edit, hapus peraturan &amp; hukuman</div></div>
            <div class="sa">\u2192</div>
          </div>
        </div>
      </div>
      <div style="margin-bottom:14px"><div class="sec-l">Bahaya</div>
        <div class="sc3">
          <div class="sr2" onclick="App.logoutTenant()">
            <div class="si4" style="background:rgba(245,158,11,.09);border-color:rgba(245,158,11,.18)">&#x1F6AA;</div>
            <div class="st3"><div class="sl3">Keluar dari Pesantren/Asrama</div><div class="sv">Ganti ke pesantren lain di device ini</div></div><div class="sa">\u2192</div>
          </div>
          <div class="sr2" onclick="_dedupSubKegWithConfirm()">
            <div class="si4" style="background:rgba(99,102,241,.09);border-color:rgba(99,102,241,.18)">&#x1F9F9;</div>
            <div class="st3"><div class="sl3">Cek Duplikat Sub-Kegiatan</div><div class="sv">Hapus sub-kegiatan dengan nama sama (dengan konfirmasi)</div></div><div class="sa">\u2192</div>
          </div>
          <div class="sr2" onclick="App.confirmReset()">
            <div class="si4" style="background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.18)">!</div>
            <div class="st3"><div class="sl3" style="color:#ef4444">Reset Semua Data</div></div><div class="sa">\u2192</div>
          </div>
        </div>
      </div>
      <div style="text-align:center;padding:14px 0 6px">
        <div style="font-size:24px;margin-bottom:6px">\uD83D\uDD4C</div>
        <div style="font-family:var(--fd);font-size:12px;font-weight:800;color:var(--t1)">${S._appName||((tipe==='pondok'?'Pondok Pesantren':'Asrama')+' '+asrama)}</div>
        <div style="font-size:10px;color:var(--t4);margin-top:2px;user-select:none;-webkit-user-select:none" ontouchstart="App._verLpStart()" ontouchend="App._verLpCancel()" ontouchmove="App._verLpCancel()" onmousedown="App._verLpStart()" onmouseup="App._verLpCancel()" onmouseleave="App._verLpCancel()">v3.0 · Admin: ${S.user?.nama||'-'}</div>
        <div style="font-size:10px;color:var(--t4);margin-top:6px">Made with \u2764\uFE0F by Fatum Studio</div>
      </div>
    </div>`;
  },
  async _toggleJK(el){
    const val=el.checked?'laki':'perempuan';
    await DB.p('settings',{id:'jenis_kelamin',value:val});
    T('\u2705 Jenis asrama diubah!');await this.renderSet();
  },
  async _getSebutan(){
    const jk=(await DB.g('settings','jenis_kelamin'))?.value||'perempuan';
    return jk==='laki'?'Musyrif':'Musyrifah';
  },
  async editWA(key,label){
    const cur=(await DB.g('settings',key))?.value||'';
    OS(`<div class="sh">Edit ${label}</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">${label}</label><input class="fi" id="sv-in" value="${esc(cur)}" placeholder="${key==='wa_nomor'?'Contoh: 6281234567890':'Nama penerima'}"></div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:12px">${key==='wa_nomor'?'Format: 628xxxxxxxxxx (tanpa + atau spasi)':''}</div>
      <button class="bg2 bw" onclick="App._saveSet('${key}')">Simpan</button>
    </div>`);
  },
  async laporkanWA(kgId,date){
const bodyTxt=await Exp._txt(kgId,date);
const kg=(await DB.ga('kegiatan')).find(x=>x.id===kgId);
let txt=`*Laporan Absensi ${kg?.nama||'-'}*\n`;
txt+=`Tanggal: ${date}\n\n`;
txt+=bodyTxt.replace(new RegExp('—\n'+_appN()),'');
txt+='_Dikirim via '+_appN()+'_';
// Share WhatsApp generik (tanpa nomor tujuan tetap) — user pilih kontak sendiri
const url='https://api.whatsapp.com/send?text='+encodeURIComponent(txt);
window.open(url,'_blank');
  },
  async editSet(key,label,current){
    OS(`<div class="sh">Edit ${label}</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">${label}</label><input class="fi" id="sv-in" value="${current}"></div>
      <button class="bg2 bw" onclick="App._saveSet('${key}')">Simpan</button>
    </div>`);
  },
  async _saveSet(key){
    const v=document.getElementById('sv-in')?.value.trim();if(!v)return;
    await DB.p('settings',{id:key,value:v});T('\u2705 Disimpan!');CS();await this.renderSet();
    if(key==='asrama'){
      // Nama asrama hanya label tampilan (frontend) — TIDAK mengubah tenant namespace
      // atau registry di database. Registry tetap sesuai input awal saat wizard setup,
      // agar seluruh data (kamar, santri, rekap, kegiatan, dll) tetap tersambung ke
      // namespace/tenant yang sama meski nama ditampilkan berubah.
      localStorage.setItem('tenant_nama',v);
      if(navigator.onLine)await _fbFetch('/settings/asrama','PUT',{id:'asrama',value:v,_ts:Date.now()}).catch(()=>{});
      await _applyAsramaName();
      document.getElementById('pt').textContent='Pengaturan';
    }
  },
  _pinBuf:'',
  _pinPad(){return[1,2,3,4,5,6,7,8,9,'','0','\u232B'].map(n=>`<button style="padding:11px;border-radius:var(--r2);background:var(--su);border:1.5px solid var(--sub);font-size:16px;font-weight:700;color:var(--t1);cursor:pointer" onclick="App._pinPress('${n}')">${n}</button>`).join('')},
  _pinPress(v){if(v==='\u232B'){this._pinBuf=this._pinBuf.slice(0,-1)}else if(v===''||this._pinBuf.length>=4){}else{this._pinBuf+=v}for(let i=0;i<4;i++){const d=document.getElementById('upd'+i);if(d)d.classList.toggle('on',i<this._pinBuf.length)}},
  async addUser(){
    this._pinBuf='';
    const sebutan=await this._getSebutan();
    OS(`<div class="sh">Tambah ${sebutan}</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">Nama</label><input class="fi" id="un-in" placeholder="Nama ${sebutan}"></div>
      <div class="fg"><label class="fl">PIN (4 angka)</label>
        <div style="display:flex;justify-content:center;gap:8px;margin:8px 0">
          <div class="pd" id="upd0"></div><div class="pd" id="upd1"></div><div class="pd" id="upd2"></div><div class="pd" id="upd3"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${this._pinPad()}</div>
      </div>
      <button class="bg2 bw" onclick="App._saveUser()">Tambah</button>
    </div>`);
  },
  async _saveUser(uid2){
    const nama=document.getElementById('un-in')?.value.trim();if(!nama){T('Nama wajib!');return}
    const pin=this._pinBuf;
    if(!uid2&&pin.length!==4){T('PIN harus 4 angka!');return}
    if(uid2){const u=await DB.g('users',uid2);u.nama=nama;if(pin.length===4)u.pin=pin;await DB.p('users',u)}
    else await DB.p('users',{id:uid(),nama,role:'musyrifah',pin,createdAt:Date.now()});
    CS();T('\u2705 Disimpan!');await this.renderSet();
  },
  async editUser(uid2){
    const u=await DB.g('users',uid2);if(!u)return;
    PIN.show('PIN Lama','Verifikasi sebelum edit','v',uid2,async(ok)=>{
      if(!ok)return;
      this._pinBuf='';
      const avHtml=u.foto
        ?`<img src="${u.foto}" style="width:70px;height:70px;border-radius:50%;object-fit:cover;border:3px solid var(--a1)">`
        :`<div style="width:70px;height:70px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;font-family:var(--fd)">${u.nama.charAt(0)}</div>`;
      OS(`<div class="sh">Edit ${u.nama}</div><div class="sb" style="padding-bottom:70px">
        <div style="text-align:center;margin-bottom:16px">
          <div id="eu-av" style="display:inline-block;position:relative;cursor:pointer" onclick="App._userFoto('${uid2}')">
            ${avHtml}
            <div style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;border:2px solid var(--bg)">📷</div>
          </div>
          <div style="font-size:11px;color:var(--t3);margin-top:6px">Tap foto untuk ganti</div>
        </div>
        <div class="fg"><label class="fl">Nama</label><input class="fi" id="un-in" value="${u.nama}"></div>
        <div class="fg"><label class="fl">PIN Baru (kosong = tidak berubah)</label>
          <div style="display:flex;justify-content:center;gap:8px;margin:8px 0">
            <div class="pd" id="upd0"></div><div class="pd" id="upd1"></div><div class="pd" id="upd2"></div><div class="pd" id="upd3"></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${this._pinPad()}</div>
        </div>
        <button class="bg2 bw" onclick="App._saveUser('${uid2}')">Simpan</button>
        <button style="width:100%;margin-top:8px;padding:12px;border-radius:100px;background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.2);color:#ef4444;font-size:13px;font-weight:600;cursor:pointer" onclick="CS();App.delUser('${uid2}','${escJ(u.nama)}')">🗑 Hapus Akun Musyrifah</button>
      </div>`);
    });
  },
  delUser(uid2,nama){OS(`<div class="cw"><div class="ci3">\u2715</div><div class="ct3">Hapus "${esc(nama)}"?</div><div class="cs3">Akun musyrifah ini dihapus permanen.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelUser('${uid2}')">Hapus</button></div></div>`)},
  async _doDelUser(uid2){if(!_needAdmin())return;await DB.d('users',uid2);CS();T('Dihapus!');await this.renderSet()},

  async moveKg(kgId,dir){
    const kg=(await DB.ga('kegiatan')).sort((a,b)=>a.urutan-b.urutan);
    const idx=kg.findIndex(k=>k.id===kgId);
    const swapIdx=idx+dir;
    if(swapIdx<0||swapIdx>=kg.length)return;
    const tmp=kg[idx].urutan;kg[idx].urutan=kg[swapIdx].urutan;kg[swapIdx].urutan=tmp;
    await DB.p('kegiatan',kg[idx]);await DB.p('kegiatan',kg[swapIdx]);
    await this.renderKg();
  },
  addKg(){
    const icons=['\uD83C\uDF05','\u2600','\uD83C\uDF24','\uD83C\uDF07','\uD83C\uDF19','\uD83D\uDCd6','\uD83C\uDF93','\uD83D\uDCFF','\uD83E\uDDF9','\uD83C\uDFC3','\uD83C\uDF7D','\uD83C\uDF3F','\u2B50','\uD83D\uDD14','\uD83D\uDCC5'];
    S._icon='\uD83D\uDCC5';
    OS(`<div class="sh">Tambah Kegiatan</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">Nama</label><input class="fi" id="kn-in" placeholder="Nama kegiatan"></div>
      <div class="fg"><label class="fl">Icon</label><div class="ip">${icons.map(ic=>`<div class="io${ic==='\uD83D\uDCC5'?' sl4':''}" onclick="App._ico(this,'${ic}')">${ic}</div>`).join('')}</div></div>
      ${this._timeFieldsHtml('kg',null,null)}
      <div style="font-size:10px;color:var(--t4);padding:0 2px 4px;line-height:1.45">\uD83D\uDCD5 Waktu di sini jadi default untuk semua sub-kegiatan yang tidak punya jam sendiri. Sub tetap bisa atur jam sendiri untuk override.</div>
      <button class="bg2 bw" onclick="App._saveKg()">Tambah</button>
    </div>`);
  },
  _timeFieldsHtml(prefix,jm,js,days){
    const dayNames=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const daysArr=Array.isArray(days)?days:[];
    return `<div style="display:flex;gap:8px">
      <div class="fg" style="flex:1"><label class="fl">Jam Mulai</label><input class="fi" type="time" id="${prefix}-jm" value="${jm||''}"></div>
      <div class="fg" style="flex:1"><label class="fl">Jam Selesai</label><input class="fi" type="time" id="${prefix}-js" value="${js||''}"></div>
    </div>
    <div class="fg"><label class="fl">Hari Aktif (kosong = setiap hari)</label>
      <div style="display:flex;gap:4px;flex-wrap:wrap" id="${prefix}-days">
        ${dayNames.map((d,i)=>`<div class="day-chip${daysArr.includes(i)?' on':''}" data-d="${i}" onclick="this.classList.toggle('on')">${d}</div>`).join('')}
      </div>
    </div>`;
  },
  _readTimeFields(prefix){
    const jm=document.getElementById(prefix+'-jm')?.value||'';
    const js=document.getElementById(prefix+'-js')?.value||'';
    const days=Array.from(document.querySelectorAll('#'+prefix+'-days .day-chip.on')).map(el=>parseInt(el.dataset.d));
    return {jamMulai:jm,jamSelesai:js,hariAktif:days};
  },
  _timeBadgeHtml(item,parent){
    // Kegiatan induk (parent=null): pakai jam sendiri saja.
    // Sub-kegiatan (parent!=null): pakai jam sendiri; kalau kosong, waris dari parent.
    const isSub=!!parent;
    const jm=item.jamMulai||'';
    const js=item.jamSelesai||'';
    const days=item.hariAktif||null;
    const dayNames=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    // Kasus sub-kegiatan tanpa jam sendiri → coba waris dari parent
    if(isSub&&(!jm||!js)&&parent){
      const pjm=parent.jamMulai||'';
      const pjs=parent.jamSelesai||'';
      if(pjm&&pjs){
        const pDays=parent.hariAktif||null;
        let pDayStr='setiap hari';
        if(Array.isArray(pDays)&&pDays.length>0&&pDays.length<7){
          pDayStr=pDays.slice().sort((a,b)=>a-b).map(d=>dayNames[d]||'?').join(',');
        }
        return `<span class="time-badge" style="background:rgba(201,162,39,.14);color:#a87a00"><span>\u23F0</span> ${pjm}-${pjs}</span><span class="time-badge empty" style="background:rgba(201,162,39,.14);color:#a87a00">\u21A9 warisan</span>`;
      }
      return ''; // sub tidak punya jam & parent juga tidak
    }
    if(!jm&&!js)return '';
    // AUDIT v3m: Hilangkan text hari dari card — fitur hari tetap aktif di data
    return `<span class="time-badge"><span>\u23F0</span> ${jm||'?'}-${js||'?'}</span>`;
  },
  _ico(el,ic){document.querySelectorAll('.io').forEach(x=>x.classList.remove('sl4'));el.classList.add('sl4');S._icon=ic},
  async _saveKg(kid){
    const n=document.getElementById('kn-in')?.value.trim();if(!n){T('Nama wajib!');return}
    const all=await DB.ga('kegiatan');
    const tf=this._readTimeFields('kg');
    if(kid){const k=await DB.g('kegiatan',kid);k.nama=n;k.icon=S._icon||k.icon;k.jamMulai=tf.jamMulai||null;k.jamSelesai=tf.jamSelesai||null;k.hariAktif=tf.hariAktif.length?tf.hariAktif:null;k.updatedAt=Date.now();await DB.p('kegiatan',k)}
    else await DB.p('kegiatan',{id:uid(),nama:n,icon:S._icon||'\uD83D\uDCC5',aktif:true,urutan:all.length+1,jamMulai:tf.jamMulai||null,jamSelesai:tf.jamSelesai||null,hariAktif:tf.hariAktif.length?tf.hariAktif:null,createdAt:Date.now(),updatedAt:Date.now()});
    CS();T('\u2705 Disimpan!');if(S.page==='kg')await this.renderKg();else if(S.page==='kgd'&&kid)await this.renderKgd(kid);
  },
  async editKg(kid){
    const k=await DB.g('kegiatan',kid);if(!k)return;S._icon=k.icon;
    const icons=['\uD83C\uDF05','\u2600','\uD83C\uDF24','\uD83C\uDF07','\uD83C\uDF19','\uD83D\uDCd6','\uD83C\uDF93','\uD83D\uDCFF','\uD83E\uDDF9','\uD83C\uDFC3','\uD83C\uDF7D','\uD83C\uDF3F','\u2B50','\uD83D\uDD14','\uD83D\uDCC5'];
    OS(`<div class="sh">Edit ${k.nama}</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">Nama</label><input class="fi" id="kn-in" value="${k.nama}"></div>
      <div class="fg"><label class="fl">Icon</label><div class="ip">${icons.map(ic=>`<div class="io${ic===k.icon?' sl4':''}" onclick="App._ico(this,'${ic}')">${ic}</div>`).join('')}</div></div>
      ${this._timeFieldsHtml('kg',k.jamMulai,k.jamSelesai,k.hariAktif)}
      <div style="font-size:10px;color:var(--t4);padding:0 2px 4px;line-height:1.45">\uD83D\uDCD5 Waktu di sini jadi default untuk semua sub-kegiatan yang tidak punya jam sendiri. Sub tetap bisa atur jam sendiri untuk override.</div>
      <button class="bg2 bw" onclick="App._saveKg('${kid}')">Simpan</button>
    </div>`);
  },
  delKg(kid,n){if(!_needAdmin())return;OS(`<div class="cw"><div class="ci3">\u2715</div><div class="ct3">Hapus "${esc(n)}"?</div><div class="cs3">Sub kegiatan, anggota, sesi, absensi, audit log, dan pelanggaran terkait juga terhapus permanen.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelKg('${kid}')">Hapus</button></div></div>`)},
  async _doDelKg(kid){if(!_needAdmin())return;
    // ── C3 BUG FIX: Atomic-ish cascade delete dengan recovery marker ──
    // Sebelumnya: hapus child satu per satu dengan await. Jika error di tengah
    // (koneksi terputus, IndexedDB quota, dll), sebagian data sudah terhapus,
    // sebagian belum → orphan data menumpuk di Firestore (tombstone = soft delete).
    // Sekarang: simpan "delete plan" ke localStorage SEBELUM eksekusi. Jika
    // proses terputus, _recoverPendingDeletes() di init() akan melanjutkan.
    // Setelah semua sukses, hapus marker.
    const [allSub,allAng,allSes,allAbs,allAud,allPel]=await Promise.all([
      DB.ga('subKeg'),DB.ga('anggota'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('auditLog'),DB.ga('pelanggaran')
    ]);
    const subs=allSub.filter(x=>x.kgId===kid);
    const subIds=new Set(subs.map(s=>s.id));
    const sesList=allSes.filter(x=>x.kgId===kid);
    const sidSet=new Set(sesList.map(s=>s.id));
    // Build delete plan (ordered: child → parent)
    const plan=[
      ...allAbs.filter(x=>sidSet.has(x.sesiId)).map(a=>({store:'absensi',id:a.id})),
      ...allAud.filter(x=>sidSet.has(x.sid)).map(a=>({store:'auditLog',id:a.id})),
      ...allPel.filter(p=>p.kgId===kid||(p.skId&&subIds.has(p.skId))).map(p=>({store:'pelanggaran',id:p.id})),
      ...allAng.filter(a=>subIds.has(a.skId)).map(a=>({store:'anggota',id:a.id})),
      ...sesList.map(s=>({store:'sesi',id:s.id})),
      ...subs.map(s=>({store:'subKeg',id:s.id})),
      {store:'kegiatan',id:kid},
    ];
    await this._executeDeletePlan(plan);
    CS();T('Dihapus! Semua data terkait juga dihapus.');await this.renderKg();
  },
  addSub(kgId){OS(`<div class="sh">Tambah Sub Kegiatan</div><div class="sb" style="padding-bottom:70px"><div class="fg"><label class="fl">Nama</label><input class="fi" id="sn-in" placeholder="Misal: Ula 1"></div>${App._timeFieldsHtml('sk',null,null)}<div style="font-size:10px;color:var(--t4);padding:0 2px 4px;line-height:1.45">\uD83D\uDCD5 Jam & hari opsional — kalau kosong, ikut jadwal kegiatan induk. Isi jam sendiri untuk override. Sub dengan jam (sendiri/waris) terdeteksi NFC background & auto-alpha.</div><button class="bg2 bw" onclick="App._saveSub('${kgId}')">Tambah</button></div>`) },
  async _saveSub(kgId,skId){
    const n=document.getElementById('sn-in')?.value.trim();if(!n){T('Nama wajib!');return}
    const all=(await DB.ga('subKeg')).filter(x=>x.kgId===kgId);
    const tf=this._readTimeFields('sk');
    if(skId){const s=await DB.g('subKeg',skId);s.nama=n;s.jamMulai=tf.jamMulai||null;s.jamSelesai=tf.jamSelesai||null;s.hariAktif=tf.hariAktif.length?tf.hariAktif:null;s.updatedAt=Date.now();await DB.p('subKeg',s)}
    else await DB.p('subKeg',{id:uid(),kgId,nama:n,urutan:all.length+1,aktif:true,jamMulai:tf.jamMulai||null,jamSelesai:tf.jamSelesai||null,hariAktif:tf.hariAktif.length?tf.hariAktif:null,updatedAt:Date.now()});
    CS();T('\u2705 Disimpan!');if(S.page==='kg')await this.renderKg();else await this.renderKgd(kgId);
  },
  async editSub(skId){const s=await DB.g('subKeg',skId);if(!s)return;OS(`<div class="sh">Edit Sub Kegiatan</div><div class="sb" style="padding-bottom:70px"><div class="fg"><label class="fl">Nama</label><input class="fi" id="sn-in" value="${s.nama}"></div>${App._timeFieldsHtml('sk',s.jamMulai,s.jamSelesai,s.hariAktif)}<div style="font-size:10px;color:var(--t4);padding:0 2px 4px;line-height:1.45">\uD83D\uDCD5 Jam & hari opsional — kalau kosong, ikut jadwal kegiatan induk. Isi jam sendiri untuk override. Sub dengan jam (sendiri/waris) terdeteksi NFC background & auto-alpha.</div><button class="bg2 bw" onclick="App._saveSub('${s.kgId}','${skId}')">Simpan</button></div>`) },
  delSub(skId,n){if(!_needAdmin())return;OS(`<div class="cw"><div class="ci3">\u2715</div><div class="ct3">Hapus "${esc(n)}"?</div><div class="cs3">Anggota, sesi, absensi, audit log, dan pelanggaran terkait juga terhapus permanen.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelSub('${skId}')">Hapus</button></div></div>`)},
  async _doDelSub(skId){if(!_needAdmin())return;
    const s=await DB.g('subKeg',skId);
    // ── C3 BUG FIX: Atomic-ish cascade delete dengan recovery marker ──
    const [allAng,allSes,allAbs,allAud,allPel]=await Promise.all([
      DB.ga('anggota'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('auditLog'),DB.ga('pelanggaran')
    ]);
    const sesList=allSes.filter(x=>x.skId===skId);
    const sidSet=new Set(sesList.map(x=>x.id));
    const plan=[
      ...allAbs.filter(x=>sidSet.has(x.sesiId)).map(a=>({store:'absensi',id:a.id})),
      ...allAud.filter(x=>sidSet.has(x.sid)).map(a=>({store:'auditLog',id:a.id})),
      ...allPel.filter(p=>p.skId===skId).map(p=>({store:'pelanggaran',id:p.id})),
      ...allAng.filter(a=>a.skId===skId).map(a=>({store:'anggota',id:a.id})),
      ...sesList.map(s=>({store:'sesi',id:s.id})),
      {store:'subKeg',id:skId},
    ];
    await this._executeDeletePlan(plan);
    CS();T('Dihapus! Semua data terkait juga dihapus.');if(S.page==='kg')await this.renderKg();else if(s)await this.renderKgd(s.kgId);
  },
  // ── C3 BUG FIX: Helper untuk eksekusi delete plan dengan recovery ──
  // Simpan plan ke localStorage SEBELUM eksekusi. Jika error di tengah,
  // _recoverPendingDeletes() di init() akan melanjutkan sisa hapus.
  async _executeDeletePlan(plan){
    if(!plan||!plan.length)return;
    // Filter: skip item yang sudah tidak ada (idempotent recovery)
    const remaining=[];
    for(const item of plan){
      const existing=await DB.g(item.store,item.id);
      if(existing)remaining.push(item);
    }
    if(!remaining.length)return;
    localStorage.setItem('_pending_deletes',JSON.stringify(remaining));
    // Hitung berapa tombstone per-store untuk logging
    const byStore={};
    for(const item of remaining){
      byStore[item.store]=(byStore[item.store]||0)+1;
      try{await DB.d(item.store,item.id);}catch(e){console.warn('[DelPlan] gagal hapus',item,e);}
    }
    localStorage.removeItem('_pending_deletes');
    // ── IMPROVED: Force-flush tombstones ke FB segera ──
    // Sebelumnya tombstone hanya di-enqueue; flush terjadi di background
    // timer (10detik) atau saat write berikutnya. Ini bisa delay sampai
    // 10detik — terlalu lama untuk cascade delete yang user harapkan
    // langsung terlihat di device lain. Force flush sekarang.
    const summary=Object.entries(byStore).map(([s,c])=>s+':'+c).join(', ');
    console.log('[DelPlan] cascade delete selesai ('+summary+'), force-flush tombstones...');
    try{
      if(window.FBSync && FBSync._flushWrites)FBSync._flushWrites();
    }catch(e){console.warn('[DelPlan] flush error:',e);}
  },
  // ── C3 BUG FIX: Recovery untuk delete plan yang terputus ──
  // Dipanggil dari init() untuk melanjutkan hapus yang gagal di tengah.
  async _recoverPendingDeletes(){
    try{
      const raw=localStorage.getItem('_pending_deletes');
      if(!raw)return;
      const plan=JSON.parse(raw);
      if(!Array.isArray(plan)||!plan.length){localStorage.removeItem('_pending_deletes');return;}
      console.log('[Recovery] Melanjutkan '+plan.length+' hapus yang tertunda...');
      for(const item of plan){
        try{await DB.d(item.store,item.id);}catch(e){}
      }
      localStorage.removeItem('_pending_deletes');
      T('🧹 '+plan.length+' data tertunda berhasil dibersihkan.');
    }catch(e){console.warn('[Recovery] error:',e);localStorage.removeItem('_pending_deletes');}
  },
  // ── H7 BUG FIX: Eksekusi dedup subKeg dengan cascade delete ──
  async _doDedupSubKeg(){
    try{
      const all=await DB.ga('subKeg');
      const groups=new Map();
      for(const item of all){
        const k=((item.nama||'').trim().toLowerCase()+'|'+(item.kgId||''));
        if(!groups.has(k))groups.set(k,[]);
        groups.get(k).push(item);
      }
      let removed=0;
      const [allAng,allSes,allAbs,allAud,allPel]=await Promise.all([
        DB.ga('anggota'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('auditLog'),DB.ga('pelanggaran')
      ]);
      for(const [,group] of groups){
        if(group.length<=1)continue;
        group.sort((a,b)=>(a.urutan||0)-(b.urutan||0));
        // Keep index 0, delete the rest
        for(let i=1;i<group.length;i++){
          const sk=group[i];
          const sesList=allSes.filter(x=>x.skId===sk.id);
          const sidSet=new Set(sesList.map(x=>x.id));
          const plan=[
            ...allAbs.filter(x=>sidSet.has(x.sesiId)).map(a=>({store:'absensi',id:a.id})),
            ...allAud.filter(x=>sidSet.has(x.sid)).map(a=>({store:'auditLog',id:a.id})),
            ...allPel.filter(p=>p.skId===sk.id).map(p=>({store:'pelanggaran',id:p.id})),
            ...allAng.filter(a=>a.skId===sk.id).map(a=>({store:'anggota',id:a.id})),
            ...sesList.map(s=>({store:'sesi',id:s.id})),
            {store:'subKeg',id:sk.id},
          ];
          await this._executeDeletePlan(plan);
          removed++;
        }
      }
      CS();T('✅ '+removed+' duplikat sub-kegiatan dihapus beserta data terkait.');
      if(S.page==='kg')await this.renderKg();
    }catch(e){T('❌ Gagal: '+(e.message||e));}
  },
  async kelola(skId){
    const [snt,ang,km]=await Promise.all([DB.ga('santri'),DB.ga('anggota'),DB.ga('kamar')]);
    const mems=new Set(ang.filter(a=>a.skId===skId).map(a=>a.sntId));
    // Deduplicate santri by id
    const aktif=[...new Map(snt.filter(x=>x.aktif).map(x=>[x.id,x])).values()].sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
    const kns=['Semua',...km.map(k=>k.nama).sort((a,b)=>a.localeCompare(b,'id'))];
    const renderList=(list)=>list.map(x=>`<div class="ai3" onclick="App._togAng('${skId}','${x.id}',this)">
        <div class="ack${mems.has(x.id)?' on':''}" id="ck-${x.id}">${mems.has(x.id)?'\u2713':''}</div>
        <div style="width:28px;height:28px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>
        <div style="flex:1"><div style="font-weight:600;font-size:12px;color:var(--t1)">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}</div></div>
      </div>`).join('');
    OS(`<div class="sh">Kelola Anggota</div><div class="sb" style="padding-bottom:80px">
      <input class="fi" id="kl-q" placeholder="Cari nama..." oninput="App._klS('${skId}')" style="margin-bottom:7px">
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px" id="kl-km">${kns.map(k=>`<div class="kc${k==='Semua'?' on':''}" onclick="App._klF('${skId}','${k}',this)">${k}</div>`).join('')}</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button style="flex:1;padding:9px;border-radius:var(--r2);background:var(--gs);border:1.5px solid rgba(13,181,127,.25);font-size:12px;font-weight:700;color:var(--a1);cursor:pointer;text-align:center" onclick="App._klSelAll('${skId}')">&#x2713; Pilih Semua</button>
        <button style="padding:9px 13px;border-radius:var(--r2);background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.2);font-size:12px;font-weight:700;color:#ef4444;cursor:pointer" onclick="App._klDeselAll('${skId}')">&#x2715; Batal Semua</button>
      </div>
      <div id="kl-list">${renderList(aktif)}</div>
      <button class="bg2 bw" style="margin-top:10px" onclick="CS();T('\u2705 Tersimpan!')">Selesai</button>
    </div>`);
  },
  async _klDeselAll(skId){
    const items=document.querySelectorAll('#kl-list .ai3');
    const ang=await DB.ga('anggota');
    for(const el of items){
      const ck=el.querySelector('.ack');if(!ck)continue;
      const sntId=ck.id.replace('ck-','');if(!sntId)continue;
      const ex=ang.find(a=>a.skId===skId&&a.sntId===sntId);
      if(ex){await DB.d('anggota',ex.id);}
      ck.classList.remove('on');ck.textContent='';
    }
    T('Semua dibatalkan');
  },
  async _klSelAll(skId){
    const items=document.querySelectorAll('#kl-list .ai3');
    const ang=await DB.ga('anggota');
    const mems=new Set(ang.filter(a=>a.skId===skId).map(a=>a.sntId));
    // Check if all visible items are already selected
    const allOn=[...items].every(el=>{const ck=el.querySelector('.ack');return ck&&ck.classList.contains('on')});
    for(const el of items){
      const ck=el.querySelector('.ack');if(!ck)continue;
      // Extract sntId from ck id="ck-XXXX"
      const sntId=ck.id.replace('ck-','');
      if(!sntId)continue;
      if(allOn){
        // Deselect all visible
        if(mems.has(sntId)){const ex=ang.find(a=>a.skId===skId&&a.sntId===sntId);if(ex)await DB.d('anggota',ex.id)}
        ck.classList.remove('on');ck.textContent='';
      } else {
        // Select all visible that aren't yet selected
        if(!mems.has(sntId)){await DB.p('anggota',{id:uid(),skId,sntId})}
        ck.classList.add('on');ck.textContent='\u2713';
      }
    }
    T(allOn?'Semua dibatalkan':'Semua dipilih!');
  },
  async _klS(skId){
    const q=document.getElementById('kl-q')?.value.toLowerCase()||'';
    const [snt,ang]=await Promise.all([DB.ga('santri'),DB.ga('anggota')]);
    const mems=new Set(ang.filter(a=>a.skId===skId).map(a=>a.sntId));
    const f=snt.filter(x=>x.aktif&&x.nama.toLowerCase().includes(q));
    document.getElementById('kl-list').innerHTML=f.map(x=>`<div class="ai3" onclick="App._togAng('${skId}','${x.id}',this)">
      <div class="ack${mems.has(x.id)?' on':''}" id="ck-${x.id}">${mems.has(x.id)?'\u2713':''}</div>
      <div style="width:28px;height:28px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>
      <div style="flex:1"><div style="font-weight:600;font-size:12px;color:var(--t1)">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}</div></div>
    </div>`).join('');
  },
  async _klF(skId,kamar,el){
    document.querySelectorAll('#kl-km .kc').forEach(c=>c.classList.remove('on'));el.classList.add('on');
    const [snt,ang]=await Promise.all([DB.ga('santri'),DB.ga('anggota')]);
    const mems=new Set(ang.filter(a=>a.skId===skId).map(a=>a.sntId));
    const f=kamar==='Semua'?snt.filter(x=>x.aktif):snt.filter(x=>x.aktif&&x.kamar===kamar);
    document.getElementById('kl-list').innerHTML=f.map(x=>`<div class="ai3" onclick="App._togAng('${skId}','${x.id}',this)">
      <div class="ack${mems.has(x.id)?' on':''}" id="ck-${x.id}">${mems.has(x.id)?'\u2713':''}</div>
      <div style="width:28px;height:28px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>
      <div style="flex:1"><div style="font-weight:600;font-size:12px;color:var(--t1)">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}</div></div>
    </div>`).join('');
  },
  async _togAng(skId,sntId,el){
    const ang=await DB.ga('anggota');const ex=ang.find(a=>a.skId===skId&&a.sntId===sntId);
    const ck=document.getElementById('ck-'+sntId);
    if(ex){await DB.d('anggota',ex.id);if(ck){ck.classList.remove('on');ck.textContent=''}}
    else{await DB.p('anggota',{id:uid(),skId,sntId});if(ck){ck.classList.add('on');ck.textContent='\u2713'}}
  },
  addSnt(){
    OS(`<div class="sh">Tambah Santri</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">Nama</label><input class="fi" id="nn-in" placeholder="Nama lengkap"></div>
      <div class="fg"><label class="fl">Kamar</label><input class="fi" id="nk-in" placeholder="Nama kamar" list="km-dl"><datalist id="km-dl"></datalist></div>
      <button class="bg2 bw" onclick="App._saveSnt()">Tambah</button>
    </div>`);
    DB.ga('kamar').then(km=>{const dl=document.getElementById('km-dl');if(dl)dl.innerHTML=km.map(k=>`<option value="${k.nama}">`).join('')});
  },
  async _saveSnt(sntId){
    const n=document.getElementById('nn-in')?.value.trim();const k=document.getElementById('nk-in')?.value.trim()||'Umum';
    if(!n){T('Nama wajib!');return}
    if(sntId){const s=await DB.g('santri',sntId);s.nama=n;s.kamar=k;s.updatedAt=Date.now();await DB.p('santri',s)}
    else await DB.p('santri',{id:uid(),nama:n,kamar:k,aktif:true,createdAt:Date.now(),updatedAt:Date.now()});
    CS();T('\u2705 Disimpan!');if(S.page==='snt')await this.renderSnt();
  },
  async editSnt(sntId){
    const s=await DB.g('santri',sntId);if(!s)return;const km=await DB.ga('kamar');
    OS(`<div class="sh">Edit Santri</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">Nama</label><input class="fi" id="nn-in" value="${s.nama}"></div>
      <div class="fg"><label class="fl">Kamar</label><select class="fsel" id="nk-in">${km.map(k=>`<option value="${k.nama}"${k.nama===s.kamar?' selected':''}>${k.nama}</option>`).join('')}</select></div>
      <button class="bg2 bw" onclick="App._saveSnt('${sntId}')">Simpan</button>
    </div>`);
  },
  async _saveSntNote(sntId){
    const note=document.getElementById('sntd-note')?.value.trim()||'';
    const s=await DB.g('santri',sntId);if(!s)return;
    s.catatan=note;s.updatedAt=Date.now();await DB.p('santri',s);
    T('\u2705 Catatan disimpan!');
  },
  delSnt(sntId,n){if(!_needAdmin())return;OS(`<div class="cw"><div class="ci3">\u2715</div><div class="ct3">Hapus "${esc(n)}"?</div><div class="cs3">Data absensi ikut terhapus.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelSnt('${sntId}')">Hapus</button></div></div>`)},
  async _doDelSnt(sntId){if(!_needAdmin())return;
    // BUG FIX: sebelumnya cleanup hanya absensi, catatanSantri, pelanggaran,
    // perizinan. Record 'uzur' dan 'catatanSakit' yang reference sntId juga
    // harus dihapus — kalau tidak, mereka jadi orphan dan _uzurAktifMap /
    // _sakitAktifMap masih return entry untuk santri yang sudah dihapus,
    // menyebabkan auto-status "Sistem (Uzur/Sakit)" di sesi baru.
    await DB.d('santri',sntId);
    const abs=(await DB.ga('absensi')).filter(a=>a.sntId===sntId);
    for(const a of abs)await DB.d('absensi',a.id);
    const cats=(await DB.ga('catatanSantri')).filter(c=>c.sntId===sntId);
    for(const c of cats)await DB.d('catatanSantri',c.id);
    const pels=(await DB.ga('pelanggaran')).filter(p=>p.sntId===sntId);
    for(const p of pels)await DB.d('pelanggaran',p.id);
    const perz=(await DB.ga('perizinan')).filter(p=>p.sntId===sntId);
    for(const p of perz)await DB.d('perizinan',p.id);
    const uzurs=(await DB.ga('uzur')).filter(u=>u.sntId===sntId);
    for(const u of uzurs)await DB.d('uzur',u.id);
    const sakits=(await DB.ga('catatanSakit')).filter(s=>s.sntId===sntId);
    for(const s of sakits)await DB.d('catatanSakit',s.id);
    CS();T('Dihapus!');await this.nav('snt');
  },
  importSnt(){OS(`<div class="sh">Import Santri</div><div class="sb" style="padding-bottom:70px">
    <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Format: <strong>Nama, Kamar, NIS, NFC UID</strong> — satu baris satu santri (NIS &amp; NFC UID opsional)</div>
    <div style="font-size:10px;color:var(--t4);background:var(--gs);border-radius:var(--r2);padding:8px 10px;margin-bottom:10px;font-family:monospace;line-height:1.7">Ahmad Fauzi, X 1, 12345, 19:29:4F:13<br>Siti Rahmah, X 3, 12346<br>Ani Lestari, X 2, 12347</div>
    <div class="fg"><textarea class="fi" id="imp-txt" rows="7" placeholder="Ahmad Fauzi, X 1, 12345, 19:29:4F:13&#10;Siti Rahmah, X 3, 12346&#10;Ani Lestari, X 2, 12347"></textarea></div>
    <button class="bg2 bw" onclick="App._doImport()">Import</button>
  </div>`)},
  async _doImport(){
    const txt=document.getElementById('imp-txt')?.value.trim();if(!txt)return;
    const existing=await DB.ga('santri');
    const byNis=new Map(existing.filter(x=>x.nis).map(x=>[String(x.nis).trim(),x]));
    const byName=new Map(existing.map(x=>[_normNm(x.nama),x]).filter(([k])=>k));
    let n=0,upd=0,skipped=0;
    for(const line of txt.split('\n').filter(l=>l.trim())){
      const p=line.split(',').map(x=>x.trim());
      if(!p[0])continue;
      // Skip "nama" murni angka (mis. "238, Umum") — bukan santri valid
      if(!/[a-zA-Z]/.test(p[0])){skipped++;continue;}
      const nis=p[2]||'';
      const nfcUid=(p[3]||'').toUpperCase();
      // Match prioritas: NIS dulu (kalau ada), fallback ke nama ter-normalisasi
      let dup=nis?byNis.get(nis):null;
      if(!dup){
        const nmKey=_normNm(p[0]);
        if(nmKey){
          const byNm=byName.get(nmKey);
          if(byNm)dup=byNm;
        }
      }
      if(dup){
        dup.nama=p[0];dup.kamar=p[1]||'Umum';if(nis)dup.nis=nis;if(nfcUid)dup.nfcUid=nfcUid;dup.updatedAt=Date.now();
        await DB.p('santri',dup);upd++;
      }else{
        const rec={
          id:uid(),
          nama:p[0],
          kamar:p[1]||'Umum',
          nis,
          aktif:true,
          createdAt:Date.now(),
          updatedAt:Date.now()
        };
        if(nfcUid)rec.nfcUid=nfcUid;
        await DB.p('santri',rec);
        if(nis)byNis.set(nis,rec);
        byName.set(_normNm(p[0]),rec);
        n++;
      }
    }
    CS();T(`\u2705 ${n} santri baru${upd?`, ${upd} diperbarui`:''}${skipped?`, ${skipped} dilewati`:''}!`);await this.renderSnt();
  },

  // ── SYNC NFC UID ASRAMA ASSALAM ──────────────────────────────
  // Satu-klik: cocokkan NFC UID dari data scan ke record santri yang
  // sudah ada. Matching: NAMA ter-normalisasi (utama), NIS (fallback).
  // Tidak membuat record baru — entry yang tidak cocok ditampilkan
  // di laporan agar user bisa tambah manual via Import Santri.
  async _syncNfcAssalam(){
    const entries=this._parseAssalamData();
    const withNfc=entries.filter(e=>e.nfcUid);
    if(withNfc.length===0){T('Tidak ada NFC UID di data Assalam.');return;}
    const existing=await DB.ga('santri');
    const withNfcCount=withNfc.length;
    const existingCount=existing.length;
    OS(`<div class="sh">\uD83D\uDCE1 Sinkron NFC UID Assalam</div><div class="sb" style="padding-bottom:80px">
      <div style="background:var(--su);border:1.5px solid var(--dv);border-radius:var(--r3);padding:12px 14px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:8px">\uD83D\uDCE1 Sinkronisasi NFC UID</div>
        <div style="font-size:11px;color:var(--t3);line-height:1.7">
          Akan mencocokkan <strong style="color:var(--a1)">${withNfcCount} NFC UID</strong> dari data scan Asrama Assalam ke <strong>${existingCount} santri</strong> yang sudah ada di database.<br><br>
          <strong>Strategi matching:</strong><br>
          \u2022 Utama: <strong>nama ter-normalisasi</strong> (lowercase, tanpa apostrof/tanda baca)<br>
          \u2022 Fallback: <strong>NIS</strong> jika nama tidak cocok<br><br>
          \u26A0 Santri yang tidak ditemukan <strong>tidak akan dibuat baru</strong> \u2014 hanya ditampilkan di laporan. Gunakan "Import Santri" untuk menambah manual.
        </div>
      </div>
      <div style="background:rgba(245,158,11,.08);border:1.5px solid rgba(245,158,11,.22);border-radius:var(--r3);padding:10px 12px;margin-bottom:14px;font-size:11px;color:#92400e;line-height:1.5">
        \uD83D\uDCCB Backup dulu sebelum sinkron, untuk jaga-jaga. Perubahan tidak bisa di-undo kecuali via Import Backup.
      </div>
      <button class="bg2 bw" onclick="App._doSyncNfcAssalam()">\u2705 Mulai Sinkron</button>
    </div>`);
  },
  _parseAssalamData(){
    const out=[];
    for(const line of _ASSALAM_NFC_DATA.split('\n').map(l=>l.trim()).filter(l=>l)){
      const p=line.split(',').map(x=>x.trim());
      if(!p[0])continue;
      if(!/[a-zA-Z]/.test(p[0]))continue; // skip "238, Umum" dst.
      out.push({
        nama:p[0].replace(/\\/g,''), // buang backslash escape artifact
        kamar:p[1]||'Umum',
        nis:p[2]||'',
        nfcUid:(p[3]||'').toUpperCase()
      });
    }
    return out;
  },
  async _doSyncNfcAssalam(){
    const entries=this._parseAssalamData();
    const withNfc=entries.filter(e=>e.nfcUid);
    if(withNfc.length===0){CS();T('Tidak ada NFC UID untuk disinkron.');return;}
    const existing=await DB.ga('santri');
    const byNis=new Map(existing.filter(x=>x.nis).map(x=>[String(x.nis).trim(),x]));
    const byName=new Map(existing.map(x=>[_normNm(x.nama),x]).filter(([k])=>k));
    // Deteksi konflik UID (UID sama dipakai >1 santri)
    const byUid=new Map();
    for(const s of existing){
      if(s.nfcUid){
        const u=s.nfcUid.toUpperCase();
        if(!byUid.has(u))byUid.set(u,[]);
        byUid.get(u).push(s);
      }
    }
    const matched=[],updated=[],notFound=[],conflictUid=[],noChange=[];
    for(const e of withNfc){
      // Match by name (utama), fallback NIS
      let target=null,matchBy='';
      const nmKey=_normNm(e.nama);
      if(nmKey){
        const m=byName.get(nmKey);
        if(m){target=m;matchBy='nama';}
      }
      if(!target && e.nis){
        const m=byNis.get(e.nis);
        if(m){target=m;matchBy='NIS';}
      }
      if(!target){notFound.push(e);continue;}
      matched.push({entry:e,target,matchBy});
      // Cek konflik UID: UID dipakai santri LAIN
      const owners=byUid.get(e.nfcUid)||[];
      const others=owners.filter(s=>s.id!==target.id);
      if(others.length>0){conflictUid.push({entry:e,target,others});}
      // Update kalau UID beda
      const curUid=(target.nfcUid||'').toUpperCase();
      if(curUid!==e.nfcUid){
        target.nfcUid=e.nfcUid;
        if(!target.nis && e.nis)target.nis=e.nis;
        // Jangan overwrite kamar yang sudah ada kalau kosong di data
        if(!target.kamar || target.kamar==='Umum')target.kamar=e.kamar;
        target.updatedAt=Date.now();
        await DB.p('santri',target);
        updated.push({entry:e,target,matchBy});
        // Update index konflik
        if(!byUid.has(e.nfcUid))byUid.set(e.nfcUid,[]);
        const arr=byUid.get(e.nfcUid);
        if(!arr.includes(target))arr.push(target);
      }else{
        noChange.push({entry:e,target,matchBy});
      }
    }
    // Render laporan
    const statsHtml=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--su);border:1.5px solid var(--dv);border-radius:var(--r3);padding:11px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--a1)">${matched.length}</div>
        <div style="font-size:10px;color:var(--t3);font-weight:700;margin-top:2px">Cocok</div>
      </div>
      <div style="background:var(--su);border:1.5px solid var(--dv);border-radius:var(--r3);padding:11px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#10b981">${updated.length}</div>
        <div style="font-size:10px;color:var(--t3);font-weight:700;margin-top:2px">UID Di-update</div>
      </div>
      <div style="background:var(--su);border:1.5px solid var(--dv);border-radius:var(--r3);padding:11px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#6b7280">${noChange.length}</div>
        <div style="font-size:10px;color:var(--t3);font-weight:700;margin-top:2px">Sudah Benar</div>
      </div>
      <div style="background:var(--su);border:1.5px solid var(--dv);border-radius:var(--r3);padding:11px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#f59e0b">${notFound.length}</div>
        <div style="font-size:10px;color:var(--t3);font-weight:700;margin-top:2px">Tidak Ditemukan</div>
      </div>
    </div>`;
    const listBlock=(title,color,items,renderFn,empty=true)=>items.length||empty?`<div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:6px">${title} (${items.length}):</div>
        <div style="max-height:140px;overflow-y:auto;font-size:11px;color:var(--t3);background:var(--gs);border-radius:var(--r2);padding:8px 10px;line-height:1.7">${items.length?items.map(renderFn).join(''):'<div style="color:var(--t4);font-style:italic">Tidak ada</div>'}</div>
      </div>`:'';
    OS(`<div class="sh">\uD83D\uDCE1 Sinkron Selesai</div><div class="sb" style="padding-bottom:80px">
      ${statsHtml}
      ${conflictUid.length?`<div style="background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.25);border-radius:var(--r3);padding:10px 12px;margin-bottom:12px;font-size:11px;color:#b91c1c;line-height:1.5">
        \u26A0 <strong>${conflictUid.length} konflik UID</strong> ditemukan \u2014 NFC UID yang sama dipakai oleh santri lain. Periksa manual di halaman Santri.
      </div>`:''}
      ${listBlock('\u2705 Diperbarui','var(--a1)',updated,u=>`<div><strong style="color:var(--t1)">${esc(u.target.nama)}</strong> <span style="color:var(--t4)">via ${u.matchBy}</span> \u2192 <span style="font-family:monospace;color:var(--a1)">${u.entry.nfcUid}</span></div>`)}
      ${listBlock('\u26A0 Tidak ditemukan','#f59e0b',notFound,e=>`<div>${esc(e.nama)}${e.nis?` <span style="color:var(--t4)">\u00B7 NIS ${e.nis}</span>`:''} <span style="font-family:monospace;color:var(--a1)">${e.nfcUid}</span></div>`)}
      ${conflictUid.length?listBlock('\u26A0 Konflik UID (dipakai santri lain)','#ef4444',conflictUid,c=>`<div><strong style="color:var(--t1)">${esc(c.target.nama)}</strong> \u2190 ${esc(c.entry.nama)} <span style="color:var(--t4)">juga dipakai:</span> ${c.others.map(o=>esc(o.nama)).join(', ')}</div>`):''}
      ${listBlock('\u2713 Sudah benar (tidak diubah)','var(--t3)',noChange,u=>`<div><strong style="color:var(--t1)">${esc(u.target.nama)}</strong> <span style="font-family:monospace;color:var(--a1)">${u.entry.nfcUid}</span></div>`)}
      <button class="bg2 bw" onclick="CS()">Tutup</button>
    </div>`);
    if(updated.length>0 && S.page==='snt')await this.renderSnt();
  },
  async kelolaKamar(){
    const km=await DB.ga('kamar');
    OS(`<div class="sh">Kelola Kamar</div><div class="sb" style="padding-bottom:70px">
      <div id="km-list">${km.map(k=>`<div style="display:flex;align-items:center;gap:7px;padding:9px 0;border-bottom:1px solid var(--dv)">
        <div style="flex:1;font-weight:600;font-size:13px;color:var(--t1)">${k.nama}</div>
        <button style="padding:4px 9px;border-radius:100px;background:var(--gs);border:1px solid rgba(13,181,127,.14);font-size:10px;font-weight:600;color:var(--a1);cursor:pointer" onclick="App._editKm('${k.id}','${escJ(k.nama)}')">Edit</button>
        <button style="padding:4px 9px;border-radius:100px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);font-size:10px;font-weight:600;color:#ef4444;cursor:pointer" onclick="App._delKm('${k.id}','${escJ(k.nama)}')">Hapus</button>
      </div>`).join('')}</div>
      <div style="display:flex;gap:7px;margin-top:11px"><input class="fi" id="km-new" placeholder="Nama kamar baru" style="flex:1"><button class="bg2" style="padding:11px 14px" onclick="App._addKm()">+ Tambah</button></div>
    </div>`);
  },
  async _addKm(){const n=document.getElementById('km-new')?.value.trim();if(!n){T('Nama wajib!');return}await DB.p('kamar',{id:uid(),nama:n,createdAt:Date.now()});T('\u2705 Ditambah!');await this.kelolaKamar()},
  async _editKm(kmId,old){const n=prompt('Nama baru:',old);if(!n)return;const k=await DB.g('kamar',kmId);k.nama=n;await DB.p('kamar',k);const snt=await DB.ga('santri');for(const s of snt.filter(x=>x.kamar===old)){s.kamar=n;await DB.p('santri',s)}T('\u2705 Diperbarui!');await this.kelolaKamar()},
  async _delKm(kmId,n){if(!_needAdmin())return;if(!confirm(`Hapus kamar "${n}"? Santri jadi "Umum".`))return;await DB.d('kamar',kmId);const snt=await DB.ga('santri');for(const s of snt.filter(x=>x.kamar===n)){s.kamar='Umum';await DB.p('santri',s)}T('Dihapus!');await this.kelolaKamar()},
  async kelolaKalam(){
    const list=(await DB.ga('kalam')).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    OS(`<div class="sh">\u2728 Hadist &amp; Kalam Ulama</div><div class="sb" style="padding-bottom:70px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:11px">Tampil bergantian otomatis di dashboard setiap hari untuk menyemangati santri &amp; pengurus.</div>
      <div id="kalam-list">${list.map(k=>`<div style="padding:10px 0;border-bottom:1px solid var(--dv)">
        <div style="font-size:9px;font-weight:700;color:var(--a1);text-transform:uppercase;margin-bottom:3px">${k.tipe==='hadist'?'\u{1F4D6} Hadits':'\u2728 Kalam Ulama'}</div>
        <div style="font-size:12.5px;color:var(--t1);line-height:1.5;margin-bottom:3px;font-style:italic">\u201C${k.teks}\u201D</div>
        <div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:7px">\u2014 ${k.author||'-'}</div>
        <div style="display:flex;gap:7px">
          <button style="padding:4px 9px;border-radius:100px;background:var(--gs);border:1px solid rgba(13,181,127,.14);font-size:10px;font-weight:600;color:var(--a1);cursor:pointer" onclick="App._kalamForm('${k.id}')">Edit</button>
          <button style="padding:4px 9px;border-radius:100px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);font-size:10px;font-weight:600;color:#ef4444;cursor:pointer" onclick="App._delKalam('${k.id}')">Hapus</button>
        </div>
      </div>`).join('')||'<div style="text-align:center;padding:20px 0;color:var(--t3);font-size:12px">Belum ada hadist/kalam. Tambah dulu di bawah.</div>'}</div>
      <button class="bg2 bw" style="margin-top:13px" onclick="App._kalamForm()">+ Tambah Hadist / Kalam</button>
    </div>`);
  },
  async _kalamForm(id){
    const k=id?await DB.g('kalam',id):null;
    OS(`<div class="sh">${id?'Edit':'Tambah'} Hadist / Kalam</div><div class="sb" style="padding-bottom:70px">
      <div class="fg"><label class="fl">Jenis</label>
        <select class="fi" id="kl-tipe">
          <option value="hadist" ${k?.tipe==='hadist'?'selected':''}>Hadits</option>
          <option value="kalam" ${(!k||k?.tipe==='kalam')?'selected':''}>Kalam Ulama</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Isi Teks</label><textarea class="fi" id="kl-teks" rows="4" placeholder="Isi hadist / kalam ulama...">${k?.teks||''}</textarea></div>
      <div class="fg"><label class="fl">Sumber / Perawi / Nama Ulama</label><input class="fi" id="kl-author" value="${esc(k?.author||'')}" placeholder="cth: HR. Muslim, Imam Syafi'i, dst"></div>
      <button class="bg2 bw" onclick="App._saveKalam('${id||''}')">Simpan</button>
    </div>`);
  },
  async _saveKalam(id){
    const teks=document.getElementById('kl-teks')?.value.trim();
    const author=document.getElementById('kl-author')?.value.trim();
    const tipe=document.getElementById('kl-tipe')?.value||'kalam';
    if(!teks){T('Isi teks wajib diisi!');return}
    const now=Date.now();
    if(id){const k=await DB.g('kalam',id);await DB.p('kalam',{...k,teks,author,tipe});}
    else{await DB.p('kalam',{id:uid(),teks,author,tipe,createdAt:now});}
    T('\u2705 Disimpan!');CS();await this.kelolaKalam();
  },
  async _delKalam(id){
    if(!_needAdmin())return;
    if(!confirm('Hapus hadist/kalam ini?'))return;
    await DB.d('kalam',id);T('Dihapus!');await this.kelolaKalam();
  },
  async showAudit(){
    const logs=(await DB.ga('auditLog')).sort((a,b)=>b.time-a.time).slice(0,60);
    OS(`<div class="sh">Audit Log</div><div class="sb" style="padding-bottom:70px">${logs.length?logs.map(l=>`<div class="ar"><div class="ad"></div><div class="at3">${new Date(l.time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div><div class="ax"><strong>${l.sntNama}</strong> \u00B7 ${l.kgNama||''}<br>${l.from||'?'} \u2192 ${l.to} \u00B7 <span style="color:var(--t4)">${l.oleh}</span></div></div>`).join(''):'<div class="empty"><div class="es">Belum ada log.</div></div>'}</div>`);
  },
  confirmReset(){
    if(!S._adminMode){T('🔒 Hanya admin yang bisa reset!');return;}
    // AUDIT v3h: Reset granular — pilih apa yang di-reset
    OS(`<div class="sh">🗑 Reset Data</div><div class="sb" style="padding-bottom:70px">
      <div style="font-size:12px;color:var(--t3);margin-bottom:14px;line-height:1.5">Pilih jenis data yang ingin dihapus. Data akan dihapus dari perangkat ini DAN cloud (semua perangkat). Tidak bisa dibatalkan.</div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="App._resetGranular(['kegiatan','subKeg','anggota'])">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(37,99,235,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📋</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Kegiatan & Sub-Kegiatan</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Hapus semua kegiatan, sub-kegiatan, dan anggota kamar. Santri tetap aman.</div>
          </div>
          <div style="color:#ef4444;font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="App._resetGranular(['sesi','absensi','auditLog'])">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">✅</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Riwayat Absensi & Timeline</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Hapus semua sesi, absensi, dan audit log. Santri, kegiatan, dan pengaturan tetap aman.</div>
          </div>
          <div style="color:#ef4444;font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="App._resetGranular(['pelanggaran'])">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">⚠️</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Pelanggaran</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Hapus semua catatan pelanggaran (alpha, terlambat, dll). Absensi tetap aman.</div>
          </div>
          <div style="color:#ef4444;font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="App._resetGranular(['perizinan','uzur','catatanSakit'])">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📝</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Perizinan, Uzur & Sakit</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Hapus semua data perizinan, uzur, dan catatan sakit. Santri tetap aman.</div>
          </div>
          <div style="color:#ef4444;font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="App._resetGranular(['santri','kamar','catatanSantri'])">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">👥</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Data Santri & Kamar</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Hapus semua santri, kamar, dan catatan santri. Kegiatan tetap aman.</div>
          </div>
          <div style="color:#ef4444;font-size:18px">→</div>
        </div>
      </div>

      <div style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="App._resetGranular(['chat'])">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(139,92,246,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">💬</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--t1)">Chat & Notifikasi</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Hapus semua pesan chat dan notifikasi sistem.</div>
          </div>
          <div style="color:#ef4444;font-size:18px">→</div>
        </div>
      </div>

      <div style="background:rgba(239,68,68,.05);border:1.5px solid rgba(239,68,68,.22);border-radius:var(--r4);padding:14px;margin-bottom:10px;cursor:pointer" onclick="App.confirmResetAll()">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:14px;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🗑</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:#ef4444">RESET SEMUA DATA</div>
            <div style="font-size:11px;color:var(--t3);margin-top:2px">Hapus SEMUA data kecuali users & settings. Kembali ke kondisi awal.</div>
          </div>
          <div style="color:#ef4444;font-size:18px">→</div>
        </div>
      </div>
    </div>`);
  },
  // AUDIT v3h: Reset granular — hapus store yang dipilih saja
  _resetGranular(stores){
    if(!S._adminMode){T('🔒 Hanya admin!');return;}
    const labels = {kegiatan:'Kegiatan',subKeg:'Sub-Kegiatan',anggota:'Anggota',sesi:'Sesi',absensi:'Absensi',auditLog:'Audit Log',pelanggaran:'Pelanggaran',perizinan:'Perizinan',uzur:'Uzur',catatanSakit:'Catatan Sakit',santri:'Santri',kamar:'Kamar',catatanSantri:'Catatan Santri',chat:'Chat'};
    const labelStr = stores.map(s => labels[s]||s).join(', ');
    OS(`<div class="cw"><div class="ci3" style="background:rgba(239,68,68,.1);color:#ef4444">🗑</div><div class="ct3" style="color:#ef4444">Reset: ${labelStr}?</div>
      <div class="cs3">Data berikut akan dihapus PERMANEN dari perangkat ini dan cloud:<br><strong>${labelStr}</strong><br><br>Data lain tetap aman. Tidak bisa dibatalkan.</div>
      <div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" style="background:#ef4444" onclick="App._doResetGranular('${stores.join(',')}')">Hapus</button></div></div>`);
  },
  async _doResetGranular(storesStr){
    if(!S._adminMode){T('🔒 Hanya admin!');return;}
    const stores = storesStr.split(',');
    CS();
    T('⏳ Mereset data... jangan tutup aplikasi.', 6000);
    try {
      // Clear lokal
      for (const s of stores) {
        if (s === 'chat') {
          localStorage.removeItem('chat_msgs');
          localStorage.removeItem('chat_last_seen');
        } else {
          await DB.cl(s).catch(()=>{});
          // Invalidate memory cache
          if (typeof DB.invalidateCache === 'function') DB.invalidateCache(s);
        }
      }
      // Reset cloud — hapus koleksi yang dipilih
      if (navigator.onLine) {
        for (const s of stores) {
          if (s === 'chat') {
            // Chat: hapus via batch
            try {
              const snap = await _fsDB.collection('tenants').doc(_fbNs()).collection('chat').get().catch(()=>null);
              if (snap && snap.docs && snap.docs.length) {
                let batch = _fsDB.batch(), cnt = 0;
                for (const doc of snap.docs) {
                  batch.delete(doc.ref);
                  if (++cnt >= 450) { await batch.commit(); batch = _fsDB.batch(); cnt = 0; }
                }
                if (cnt > 0) await batch.commit();
              }
            } catch(e) { console.warn('[Reset] chat cloud error:', e); }
          } else {
            await _fbFetch('/' + s, 'DELETE').catch(()=>{});
          }
        }
      }
      T('✅ Reset selesai!', 3000);
      // Re-render halaman aktif
      if (S.page === 'dash') await this.dash().catch(()=>{});
      else if (S.page === 'kg') await this.renderKg().catch(()=>{});
      else if (S.page === 'snt') await this.renderSnt().catch(()=>{});
      else if (S.page === 'pel') await this.renderPel().catch(()=>{});
      else if (S.page === 'izn') await this.renderIzn().catch(()=>{});
      else if (S.page === 'set') await this.renderSet().catch(()=>{});
      // Invalidate FBSync cache
      if (FBSync._invalidateCache) FBSync._invalidateCache();
    } catch(e) {
      console.error('[Reset] error:', e);
      T('❌ Gagal reset: ' + (e.message||e), 5000);
    }
  },
  confirmResetAll(){
    if(!S._adminMode){T('🔒 Hanya admin yang bisa reset!');return;}
    OS(`<div class="cw"><div class="ci3">⚠️</div><div class="ct3">Reset SEMUA Data?</div>
      <div class="cs3">SEMUA data (santri, kegiatan, absensi, perizinan, pelanggaran, dll) akan dihapus.<br>Hanya data musyrifah & admin (users + settings) yang tetap.<br>Cloud juga direset. <strong>Tidak bisa dibatalkan.</strong></div>
      <div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" style="background:#ef4444" onclick="App._doReset()">Reset Semua</button></div></div>`);
  },
  async _doReset(){
    // Simpan users dan settings admin dulu
    const users=await DB.ga('users');
    const adminPinSetting=await DB.g('settings','admin_pin');
    const asmSetting=await DB.g('settings','asrama');
    // Clear semua store kecuali users
    for(const s of ['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','kamar','settings','catatanSantri','pelanggaran','peraturan','perizinan','catatanSakit']){
      await DB.cl(s);
      // AUDIT v3l: Invalidate memory cache untuk store yang di-clear
      // Tanpa ini, DB.ga() akan return data lama dari memory cache
      if (typeof DB.invalidateCache === 'function') DB.invalidateCache(s);
    }
    // AUDIT v3l: Invalidate FBSync pull cache juga
    if (FBSync._invalidateCache) FBSync._invalidateCache();
    // Hapus chat dari localStorage
    localStorage.removeItem('chat_msgs');
    localStorage.removeItem('chat_last_seen');
    // Restore users
    for(const u of users)await DB.p('users',u);
    // Restore settings penting
    if(adminPinSetting)await DB.p('settings',adminPinSetting);
    if(asmSetting)await DB.p('settings',asmSetting);
    // Reset cloud: hapus semua kecuali users
    if(navigator.onLine){
      T('⏳ Mereset cloud...');
      try{
        const storesReset=['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','kamar','settings','catatanSantri','pelanggaran','peraturan','perizinan','chat','uzur','catatanSakit'];
        for(const s of storesReset){await _fbFetch('/'+s,'DELETE').catch(()=>{});}
        // Push users ke cloud
        for(const u of users){const uo=Object.assign({},u);uo._ts=Date.now();await _fbFetch('/users/'+u.id,'PUT',uo).catch(()=>{});}
        if(adminPinSetting)await _fbFetch('/settings/admin_pin','PUT',Object.assign({},adminPinSetting,{_ts:Date.now()})).catch(()=>{});
        if(asmSetting)await _fbFetch('/settings/asrama','PUT',Object.assign({},asmSetting,{_ts:Date.now()})).catch(()=>{});
      }catch(e){console.warn('[Reset] Cloud reset error:',e);}
    }
    localStorage.removeItem('last_active_day');
    localStorage.removeItem('seeded');
    localStorage.setItem(KAMAR_VERSION,'1');
    CS();T('✅ Reset selesai!');setTimeout(()=>location.reload(),1800);
  },

  // ── FITUR TERSEMBUNYI: Hapus riwayat lama (kecuali hari ini) ──────────
  // Tekan-tahan (long press ~1.2 detik) pada teks versi "v3.0 · Admin: ..."
  // di bagian paling bawah Pengaturan untuk memicu ini. Sengaja tidak
  // dibuat tombol biasa karena ini alat pembersihan berat (permanen) yang
  // hanya perlu diakses sesekali saja, bukan tombol harian.
  _verLpTimer:null,
  _verLpStart(){
    clearTimeout(App._verLpTimer);
    App._verLpTimer=setTimeout(()=>{ App._resetHistoryExceptToday(); },1200);
  },
  _verLpCancel(){ clearTimeout(App._verLpTimer); },
  _resetHistoryExceptToday(){
    // ── AUDIT v3 FIX: Hapus _needAdmin() check di sini ──
    // Sebelumnya, fungsi ini dipanggil lewat long-press v3.0 text di Pengaturan.
    // Saat user klik "Hapus Riwayat Lama", _doResetHistoryExceptToday dipanggil
    // dan langsung exit karena _needAdmin() false (user belum aktifkan Mode Admin).
    // User tidak sadar kenapa tidak terjadi apa-apa.
    // Sekarang: konfirmasi PIN admin langsung di dialog ini (lebih aman & jelas).
    const today=_todayLocal();
    OS(`<div class="cw"><div class="ci3">&#x1F9F9;</div><div class="ct3">Hapus Semua Riwayat Lama?</div>
      <div class="cs3" style="text-align:left;line-height:1.6">Ini akan menghapus PERMANEN seluruh data berikut yang <strong>tanggalnya BUKAN hari ini (${today})</strong>:<br><br>
        📋 <strong>Sesi absensi</strong> (semua sesi sebelum hari ini)<br>
        ✅ <strong>Absensi</strong> (yang terkait sesi lama)<br>
        📜 <strong>Audit log</strong> (riwayat perubahan absensi)<br>
        ⚠️ <strong>Pelanggaran</strong> (yang tanggalnya bukan hari ini)<br>
        📝 <strong>Perizinan</strong> (yang sudah selesai/sebelum hari ini)<br>
        🤒 <strong>Catatan sakit</strong> (yang sudah sembuh/sebelum hari ini)<br>
        📖 <strong>Uzur</strong> (yang sudah berakhir/sebelum hari ini)<br><br>
        <strong>TIDAK terhapus:</strong> data santri, kegiatan, sub-kegiatan, kamar, anggota, peraturan, kalam, users, settings, catatan santri.<br><br>
        Data dihapus baik di perangkat ini MAUPUN di cloud (semua perangkat). <strong>Tidak bisa dibatalkan.</strong>
      </div>
      <div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" style="background:#ef4444" onclick="App._confirmResetHistoryExceptToday()">🗑 Hapus Riwayat Lama</button></div></div>`);
  },
  // AUDIT v3: Konfirmasi PIN admin sebelum eksekusi hapus
  _confirmResetHistoryExceptToday(){
    CS();
    _showAdminPinDialog('🔐 Konfirmasi Admin', 'Masukkan PIN admin untuk hapus riwayat', () => {
      App._doResetHistoryExceptToday();
    });
  },
  async _doResetHistoryExceptToday(){
    // AUDIT v3: Hapus _needAdmin() check (sudah di-confirm via PIN di _confirmResetHistoryExceptToday)
    T('⏳ Menghapus riwayat lama... jangan tutup aplikasi.', 8000);
    const today=_todayLocal();
    let n=0, errors=0;
    try{
      // ── AUDIT v3 FIX: Hapus JUGA perizinan & catatanSakit & uzur ──
      // Sebelumnya hanya hapus sesi, absensi, auditLog, pelanggaran.
      // User complaint: "tidak menghapus apa2, seharusnya menghapus seluruh
      // data absensi dan riwayat, rekapan, perizinan, timeline kecuali hari ini."
      const [sesAll,absAll,audAll,pelAll,perAll,sakitAll,uzurAll] = await Promise.all([
        DB.ga('sesi'), DB.ga('absensi'), DB.ga('auditLog'), DB.ga('pelanggaran'),
        DB.ga('perizinan'), DB.ga('catatanSakit'), DB.ga('uzur')
      ]);
      // Sesi lama = tanggal bukan hari ini
      const oldSesIds = new Set(sesAll.filter(s => s.tanggal !== today).map(s => s.id));
      // Helper: hapus satu per satu, count sukses & error
      const safeDel = async (store, id) => {
        try { await DB.d(store, id); n++; }
        catch(e) { errors++; console.warn('[Reset] del error', store, id, e.message); }
      };
      // 1. Absensi: hapus yang sesiId-nya lama
      for(const a of absAll){
        if(oldSesIds.has(a.sesiId)){ await safeDel('absensi', a.id); }
      }
      // 2. Audit log: hapus yang sid (sesiId) nya lama, ATAU tidak punya sid (legacy)
      for(const a of audAll){
        if(a.sid && oldSesIds.has(a.sid)){ await safeDel('auditLog', a.id); }
        else if(!a.sid){ await safeDel('auditLog', a.id); } // legacy audit log tanpa sid
      }
      // 3. Sesi: hapus yang tanggal bukan hari ini
      for(const s of sesAll){
        if(s.tanggal !== today){ await safeDel('sesi', s.id); }
      }
      // 4. Pelanggaran: hapus yang tanggal bukan hari ini
      for(const p of pelAll){
        if(p.tanggal && p.tanggal !== today){ await safeDel('pelanggaran', p.id); }
        else if(!p.tanggal){ await safeDel('pelanggaran', p.id); } // fallback: hapus yang tidak punya tanggal
      }
      // 5. Perizinan: hapus yang tglSelesai sebelum hari ini (sudah selesai)
      for(const p of perAll){
        if(p.tglSelesai && p.tglSelesai < today){ await safeDel('perizinan', p.id); }
      }
      // 6. Catatan sakit: hapus yang sudah sembuh DAN tglMulai sebelum hari ini
      for(const s of sakitAll){
        if(s.status === 'sembuh' && s.tglMulai && s.tglMulai < today){
          await safeDel('catatanSakit', s.id);
        }
        // Catatan sakit yang belum sembuh TIDAK dihapus (masih aktif)
      }
      // 7. Uzur: hapus yang sudah berakhir (status !== 'aktif') DAN tanggal sebelum hari ini
      for(const u of uzurAll){
        if(u.status && u.status !== 'aktif' && u.tglMulai && u.tglMulai < today){
          await safeDel('uzur', u.id);
        }
      }
      // Flush write queue ke cloud supaya tombstone langsung terkirim
      if(FBSync && FBSync._flushWrites){ FBSync._flushWrites(); }
      T(`✅ ${n} data riwayat lama dihapus${errors?` (${errors} error)`:''}. Data hari ini tetap aman.`, 5000);
      // Re-render halaman aktif
      if(S.page==='dash')await this.dash();
      else if(S.page==='rek')await this.renderRek();
      else if(S.page==='pel')await this.renderPel();
      else if(S.page==='kg')await this.renderKg();
      else if(S.page==='izn')await this.renderIzn();
      // Invalidate cache supaya nav berikutnya re-pull fresh data
      if(FBSync && FBSync._invalidateCache){ FBSync._invalidateCache(); }
    }catch(e){
      console.error('[Reset] error:', e);
      T('❌ Gagal menghapus: ' + (e.message||e), 5000);
    }
  },

  async search(){
    OS(`<div class="sh">Cari</div><div class="sb" style="padding-bottom:70px"><input class="fi" id="sq-in" placeholder="Nama santri, kegiatan..." oninput="App._doSearch()" style="margin-bottom:10px" autofocus><div id="sq-res"><div style="text-align:center;color:var(--t4);padding:16px;font-size:11px">Ketik untuk mencari...</div></div></div>`);
    setTimeout(()=>document.getElementById('sq-in')?.focus(),80);
  },
  async _doSearch(){
    const q=document.getElementById('sq-in')?.value.toLowerCase().trim()||'';
    const el=document.getElementById('sq-res');
    if(!q){el.innerHTML='<div style="text-align:center;color:var(--t4);padding:16px;font-size:11px">Ketik...</div>';return}
    const [snt,kg]=await Promise.all([DB.ga('santri'),DB.ga('kegiatan')]);
    const ms=snt.filter(x=>x.nama.toLowerCase().includes(q)||x.kamar.toLowerCase().includes(q));
    const mk=kg.filter(k=>k.nama.toLowerCase().includes(q));
    if(!ms.length&&!mk.length){el.innerHTML='<div style="text-align:center;color:var(--t4);padding:16px;font-size:11px">Tidak ditemukan.</div>';return}
    el.innerHTML=`${ms.length?`<div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:5px">Santri</div>${ms.slice(0,8).map(x=>`<div style="display:flex;align-items:center;gap:7px;padding:7px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="CS();App.nav('profil',{id:'${x.id}',t:'${escJ(x.nama)}'})"><div style="width:28px;height:28px;border-radius:50%;overflow:hidden">${x.foto?`<img src="${x.foto}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${x.nama.charAt(0)}</div>`}</div><div><div class="snt-link" style="font-size:12px">${x.nama}</div><div style="font-size:10px;color:var(--t3)">${x.kamar}</div></div></div>`).join('')}`:''}
    ${mk.length?`<div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;margin:9px 0 5px">Kegiatan</div>${mk.slice(0,5).map(k=>`<div style="display:flex;align-items:center;gap:7px;padding:7px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="CS();App.nav('kgd',{id:'${k.id}',t:'${escJ(k.nama)}'})"><div style="font-size:19px">${k.icon}</div><div style="font-weight:600;font-size:12px;color:var(--t1)">${k.nama}</div></div>`).join('')}`:''}`;
  },

  // ══════════════════════════════════════════════════════════
  // PERIZINAN
  // ══════════════════════════════════════════════════════════
  _jenisIzinDefault:['Izin Pulang','Sakit (Pulang Bermalam)','Sakit Tidak Pulang/Bermalam','Keperluan Keluarga','Dispensasi Akademik/Lomba','Lainnya'],
  async _jenisIzinList(){
    const st=await DB.g('settings','jenisIzin');
    if(st&&Array.isArray(st.value)&&st.value.length)return st.value;
    await DB.p('settings',{id:'jenisIzin',value:this._jenisIzinDefault});
    return this._jenisIzinDefault;
  },
  // Map sntId -> perizinanId untuk izin yang disetujui & aktif pada tanggal tsb
  async _izinAktifMap(tanggal){
    const per=await DB.ga('perizinan');
    const m={};
    per.filter(p=>p.status==='disetujui'&&p.tglMulai<=tanggal&&p.tglSelesai>=tanggal).forEach(p=>{m[p.sntId]=p.id});
    return m;
  },
  // Terapkan izin yang baru disetujui ke absensi yang sudah terlanjur dibuat (retroaktif)
  async _terapkanIzinKeAbsensi(per){
    const [ses,abs]=await Promise.all([DB.ga('sesi'),DB.ga('absensi')]);
    const sesIds=new Set(ses.filter(s=>s.tanggal>=per.tglMulai&&s.tanggal<=per.tglSelesai).map(s=>s.id));
    const targets=abs.filter(a=>sesIds.has(a.sesiId)&&a.sntId===per.sntId&&a.status==='alpha');
    for(const a of targets){a.status='izin';a.perizinanId=per.id;a.oleh='Sistem (Perizinan)';a.updatedAt=Date.now();await DB.p('absensi',a);}
    return targets.length;
  },
  // Kalau izin dibatalkan/ditolak setelah sempat disetujui, kembalikan absensi yg auto-set jadi alpha lagi
  async _lepasIzinDariAbsensi(per){
    const abs=await DB.ga('absensi');
    const targets=abs.filter(a=>a.perizinanId===per.id&&a.status==='izin');
    for(const a of targets){a.status='alpha';a.perizinanId=null;a.oleh='Sistem (Perizinan dibatalkan)';a.updatedAt=Date.now();await DB.p('absensi',a);}
    return targets.length;
  },

  // ═══════════════════════════════════════════════════════════════
  // CATATAN SAKIT (terpisah dari Catatan Izin)
  // ───────────────────────────────────────────────────────────────
  // Penyimpanan: store 'catatanSakit'.
  // Skema: { id, sntId, tglMulai (TANPA tglSelesai), diagnosis,
  //         penanganan, status: 'belum_sembuh'|'sembuh', sembuhAt,
  //         sembuhOleh, caraBerakhir: 'manual'|'nfc'|'hadir_manual',
  //         createdBy, createdAt, updatedAt }
  //
  // Aturan integrasi absensi:
  //  1. Saat catatanSakit aktif (status='belum_sembuh') untuk seorang
  //     santri, semua absensi kegiatan hari ini & mendatang (sampai
  //     sembuh) otomatis berstatus 'sakit' (override 'none').
  //  2. Saat ustadah men-set manual 'sakit' pada absensi & santri
  //     belum punya catatanSakit aktif → bottom sheet muncul untuk
  //     isi diagnosis + penanganan → simpan → catatanSakit dibuat.
  //  3. Saat santri tap NFC tercatat 'hadir' ATAU ustadah set manual
  //     'hadir' → catatanSakit aktif ditandai 'sembuh', dipindah ke
  //     Riwayat Catatan Sakit.
  // ═══════════════════════════════════════════════════════════════

  // Map: { sntId -> sakitRecord } untuk catatanSakit yang masih aktif
  // (status='belum_sembuh'). Tanggal opsional — default hari ini.
  async _sakitAktifMap(tanggal){
    const t=tanggal||_todayLocal();
    const all=await DB.ga('catatanSakit');
    const m={};
    (all||[]).filter(s=>s.status==='belum_sembuh'&&s.tglMulai<=t).forEach(s=>{if(!m[s.sntId])m[s.sntId]=s});
    return m;
  },

  // List semua catatanSakit aktif (untuk dashboard card & popup).
  async _sakitAktifList(){
    const today=_todayLocal();
    const [all,snt]=await Promise.all([DB.ga('catatanSakit'),DB.ga('santri')]);
    const sntM=mapBy(snt,'id');
    return (all||[])
      .filter(s=>s.status==='belum_sembuh'&&s.tglMulai<=today)
      .map(s=>({...s,_sn:sntM[s.sntId],_hari:this._hitungHariSakit(s.tglMulai)}))
      .sort((a,b)=>(a.tglMulai||'').localeCompare(b.tglMulai||''));
  },

  // Hitung jumlah hari sakit (tglMulai → hari ini)
  _hitungHariSakit(tglMulai){
    if(!tglMulai)return 1;
    const a=new Date(tglMulai+'T00:00:00');
    const b=new Date(_todayLocal()+'T00:00:00');
    const d=Math.round((b-a)/86400000)+1;
    return d<1?1:d;
  },

  // Cari catatanSakit aktif untuk satu santri
  async _getSakitAktifBySnt(sntId){
    if(!sntId)return null;
    const all=await DB.ga('catatanSakit');
    return (all||[]).find(s=>s.sntId===sntId&&s.status==='belum_sembuh')||null;
  },

  // Form tambah Catatan Sakit — terpisah dari form Catat Izin.
  // Jika preselectSntId diberikan (dari bottom sheet absensi), skip
  // pencarian santri.
  _addCatatanSakit(preselectSntId,preselectNama){
    DB.ga('santri').then(async snt=>{
      const aktif=snt.filter(x=>x.aktif).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
      S._sakitSntCache=aktif;
      S._sakitSntPicked=null;
      S._sakitFoto=null;
      const today=_todayLocal();
      const preselect=preselectSntId?aktif.find(x=>x.id===preselectSntId):null;
      // Simpan preselect ke state juga sebagai fallback di _saveCatatanSakit
      S._sakitPreselectId=preselectSntId||null;
      const preselectHtml=preselect?`<div class="fg"><input type="hidden" id="sakit-snt-id" value="${preselectSntId}"><div id="sakit-snt-selected" style="margin-top:6px;font-size:12px;color:var(--a1);font-weight:700;padding:8px 11px;background:var(--gs);border:1.5px solid rgba(13,181,127,.2);border-radius:var(--r2)">✓ ${esc(preselectNama||preselect.nama)} — ${preselect.kamar||'-'}</div></div>`:`<div class="fg"><label class="fl">Cari Santri</label>
        <input class="fi" id="sakit-snt-q" placeholder="Ketik nama santri..." autocomplete="off" oninput="App._filterSakitSnt()">
        <input type="hidden" id="sakit-snt-id">
        <div id="sakit-snt-results" style="max-height:170px;overflow-y:auto"></div>
        <div id="sakit-snt-selected" style="margin-top:6px;font-size:11px;color:var(--a1);font-weight:700"></div>
      </div>`;
      OS(`<div class="sh">🤒 + Catat Sakit</div><div class="sb" style="padding-bottom:90px">
        <div style="background:rgba(245,158,11,.06);border:1.5px solid rgba(245,158,11,.22);border-radius:var(--r3);padding:10px 12px;margin-bottom:14px;font-size:11px;color:#d97706;line-height:1.5">Selama catatan sakit aktif, <strong>semua absensi kegiatan otomatis berstatus Sakit</strong>. Status berakhir otomatis ketika santri tap NFC tercatat Hadir, atau ustadah mengubah status menjadi Hadir secara manual.</div>
        ${preselectHtml}
        <div class="fg"><label class="fl">Tanggal Mulai Sakit *</label><input class="fi" type="date" id="sakit-mulai" value="${today}"></div>
        <div class="fg"><label class="fl">Diagnosis / Keluhan *</label><textarea class="fi" id="sakit-diagnosis" rows="3" style="resize:none" placeholder="Contoh: Demam tinggi, flu, batuk berdahak, sakit perut..."></textarea></div>
        <div class="fg"><label class="fl">Penanganan / Obat yang Diberikan</label><textarea class="fi" id="sakit-penanganan" rows="3" style="resize:none" placeholder="Contoh: Paracetamol 500mg 3x sehari, istirahat, kompres dingin..."></textarea></div>
        <div class="fg"><label class="fl">Lampiran Foto (opsional)</label><button style="width:100%;padding:11px;border-radius:var(--r3);background:var(--su);border:1.5px dashed var(--dv);font-size:12px;color:var(--t3);cursor:pointer" type="button" onclick="document.getElementById('foto-inp-sakit').click()">📷 Ambil / Pilih Foto</button><div id="sakit-foto-preview" style="margin-top:6px"></div></div>
        <button class="bg2 bw" onclick="App._saveCatatanSakit()">✅ Simpan Catatan Sakit</button>
      </div>`);
      // Jika preselect, hidden input sudah terisi via atribut value di HTML.
      // (Tidak perlu setTimeout — sudah ada di DOM saat OS dipanggil.)
    });
  },

  async _filterSakitSnt(){
    const q=document.getElementById('sakit-snt-q').value.trim().toLowerCase();
    const box=document.getElementById('sakit-snt-results');
    if(!q){box.innerHTML='';return}
    const res=(S._sakitSntCache||[]).filter(x=>x.nama.toLowerCase().includes(q)).slice(0,8);
    if(!res.length){box.innerHTML='<div style="padding:8px;font-size:11px;color:var(--t3)">Tidak ditemukan.</div>';return}
    // Cek juga santri yang sedang sakit (warning)
    const sakitAktif=await DB.ga('catatanSakit');
    box.innerHTML=res.map(x=>{
      const sd=sakitAktif.find(s=>s.sntId===x.id&&s.status==='belum_sembuh');
      return`<div style="padding:8px 6px;border-bottom:1px solid var(--dv);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="App._pickSakitSnt('${x.id}','${escJ(x.nama)}','${escJ(x.kamar||'')}')">
        <span style="font-size:12px;color:var(--t1)">${x.nama} <span style="color:var(--t4)">— ${x.kamar||'-'}</span></span>
        ${sd?'<span style="font-size:9px;color:#d97706;font-weight:700">🤒 Masih Sakit</span>':''}
      </div>`;
    }).join('');
  },

  _pickSakitSnt(id,nama,kamar){
    document.getElementById('sakit-snt-id').value=id;
    document.getElementById('sakit-snt-q').value=nama;
    document.getElementById('sakit-snt-results').innerHTML='';
    document.getElementById('sakit-snt-selected').textContent=`✓ Dipilih: ${nama} — ${kamar}`;
  },

  async _onFotoSakit(inp){
    const file=inp.files[0];if(!file)return;
    T('Memproses foto...');
    try{
      const b64=await this._resizeImg(file,800);
      S._sakitFoto=b64;
      const pv=document.getElementById('sakit-foto-preview');
      if(pv)pv.innerHTML=`<img src="${b64}" style="width:64px;height:64px;border-radius:8px;object-fit:cover">`;
      T('✅ Foto ditambahkan!');
    }catch(e){T('❌ Gagal: '+e.message);}
  },

  async _saveCatatanSakit(){
    // Baca sntId dari hidden input, dengan fallback ke S._sakitPreselectId
    // (preselect dari bottom sheet absensi — input hidden kadang tidak terender
    //  kalau form di-reopen berkali-kali)
    let sntId=document.getElementById('sakit-snt-id')?.value||'';
    if(!sntId&&S._sakitPreselectId)sntId=S._sakitPreselectId;
    if(!sntId){T('❌ Pilih santri dulu dari hasil pencarian');return}
    const tglMulai=document.getElementById('sakit-mulai').value;
    const diagnosis=(document.getElementById('sakit-diagnosis')?.value||'').trim();
    const penanganan=(document.getElementById('sakit-penanganan')?.value||'').trim();
    if(!tglMulai){T('❌ Tanggal mulai wajib diisi');return}
    if(!diagnosis){T('❌ Diagnosis/keluhan wajib diisi');return}
    // Cek apakah sudah ada catatanSakit aktif untuk santri ini
    const existing=await this._getSakitAktifBySnt(sntId);
    if(existing){
      T('❌ Santri ini sudah memiliki catatan sakit aktif. Tandai sembuh dulu sebelum buat catatan baru.',3500);
      return;
    }
    const rec={
      id:'sakit_'+sntId+'_'+Date.now(),
      sntId,
      tglMulai,
      diagnosis,
      penanganan:penanganan||null,
      lampiran:S._sakitFoto||null,
      status:'belum_sembuh',
      sembuhAt:null,
      sembuhOleh:null,
      caraBerakhir:null,
      createdBy:S.user?.nama||'Musyrifah',
      createdAt:Date.now(),
      updatedAt:Date.now()
    };
    await DB.p('catatanSakit',rec);
    // Bersihkan preselect state setelah sukses simpan
    S._sakitPreselectId=null;
    // Auto-apply ke absensi hari ini & mendatang (yang masih 'none' → 'sakit')
    const n=await this._terapkanSakitKeAbsensi(rec);
    // Kirim notifikasi
    this._kirimNotifSakit('baru',rec).catch(()=>{});
    CS();T(`✅ Catatan sakit disimpan!${n?' '+n+' absensi diperbarui.':''}`);
    // Re-render halaman aktif
    if(S.page==='izn')await this.renderIzn();
    else if(S.page==='dash')await this.dash();
    else if(S.page==='profil')await this.renderProfil(S._profilId);
    else if(S.page==='abs'&&S._sesiId)await this.renderAbs(S._sesiId,S._skId).catch(()=>{});
  },

  // Apply catatanSakit baru ke absensi yang masih 'none' (untuk sesi
  // hari ini & setelahnya sampai batas tertentu). Tidak mengubah
  // status yang sudah di-set manual ke hadir/izin (yang lain).
  async _terapkanSakitKeAbsensi(sakitRec){
    const [ses,abs]=await Promise.all([DB.ga('sesi'),DB.ga('absensi')]);
    const sesIds=new Set(ses.filter(s=>s.tanggal>=sakitRec.tglMulai).map(s=>s.id));
    const targets=abs.filter(a=>sesIds.has(a.sesiId)&&a.sntId===sakitRec.sntId&&(a.status==='none'||a.status==='alpha'));
    // Pre-fetch pelanggaran auto untuk cleanup (jika ada alpha yang di-override jadi sakit)
    const allPel=await DB.ga('pelanggaran');
    const pelByAbs={};for(const p of allPel)if(p.absId)pelByAbs[p.absId]=p;
    for(const a of targets){
      const wasAlpha=a.status==='alpha';
      a.status='sakit';
      a.catatanSakitId=sakitRec.id;
      a.oleh='Sistem (Catatan Sakit)';
      a.updatedAt=Date.now();
      await DB.p('absensi',a);
      // Kalau sebelumnya alpha & ada pelanggaran auto yang belum dihukum → hapus
      // (santri ternyata sakit, bukan alpha)
      if(wasAlpha){
        const pelAuto=pelByAbs[a.id];
        if(pelAuto&&pelAuto.tipe==='auto'&&pelAuto.status==='belum'){
          await DB.d('pelanggaran',pelAuto.id);
          delete pelByAbs[a.id];
        }
      }
    }
    return targets.length;
  },

  // Tandai catatanSakit sebagai sembuh. caraBerakhir: 'manual'|'nfc'|'hadir_manual'
  async _setSakitSembuh(sakitId,caraBerakhir){
    // ── H2 BUG FIX: Per-sakit lock untuk _setSakitSembuh ──
    // Cek status==='sembuh' di bawah tidak aman terhadap race condition:
    // dua call baca sakit yang sama dengan status='belum_sembuh', keduanya
    // lewat cek, keduanya set sembuh & kirim notifikasi. Lock per-sakitId.
    if(!this._sakitSembuhLocks)this._sakitSembuhLocks={};
    if(this._sakitSembuhLocks[sakitId])return null;
    this._sakitSembuhLocks[sakitId]=true;
    try{
      const sakit=await DB.g('catatanSakit',sakitId);
      if(!sakit)return null;
      if(sakit.status==='sembuh')return null; // sudah sembuh
      sakit.status='sembuh';
      sakit.sembuhAt=Date.now();
      sakit.sembuhOleh=S.user?.nama||'Musyrifah';
      sakit.caraBerakhir=caraBerakhir||'manual';
      sakit.updatedAt=Date.now();
      await DB.p('catatanSakit',sakit);
      // Kirim notifikasi sembuh
      this._kirimNotifSakit('sembuh',sakit).catch(()=>{});
      return sakit;
    }finally{
      setTimeout(()=>{if(this._sakitSembuhLocks)delete this._sakitSembuhLocks[sakitId];},2000);
    }
  },

  // Kembalikan status dari sembuh → belum_sembuh (mis. salah tandai)
  async _revertSakitSembuh(sakitId){
    const sakit=await DB.g('catatanSakit',sakitId);
    if(!sakit)return;
    sakit.status='belum_sembuh';
    sakit.sembuhAt=null;
    sakit.sembuhOleh=null;
    sakit.caraBerakhir=null;
    sakit.updatedAt=Date.now();
    await DB.p('catatanSakit',sakit);
    T('🔄 Status dikembalikan ke Belum Sembuh.');
    if(S.page==='izn')await this.renderIzn();
  },

  // Edit diagnosis/penanganan catatan sakit
  _editCatatanSakit(id){
    DB.g('catatanSakit',id).then(sakit=>{
      if(!sakit)return;
      OS(`<div class="sh">✏️ Edit Catatan Sakit</div><div class="sb" style="padding-bottom:90px">
        <div class="fg"><label class="fl">Tanggal Mulai Sakit</label><input class="fi" type="date" id="ep-sakit-mulai" value="${sakit.tglMulai}"></div>
        <div class="fg"><label class="fl">Diagnosis / Keluhan</label><textarea class="fi" id="ep-sakit-diagnosis" rows="3" style="resize:none">${esc(sakit.diagnosis||'')}</textarea></div>
        <div class="fg"><label class="fl">Penanganan / Obat</label><textarea class="fi" id="ep-sakit-penanganan" rows="3" style="resize:none">${esc(sakit.penanganan||'')}</textarea></div>
        <button class="bg2 bw" onclick="App._saveEditCatatanSakit('${id}')">Simpan</button>
      </div>`);
    });
  },

  async _saveEditCatatanSakit(id){
    const sakit=await DB.g('catatanSakit',id);if(!sakit)return;
    const tglMulai=document.getElementById('ep-sakit-mulai')?.value||sakit.tglMulai;
    const diagnosis=document.getElementById('ep-sakit-diagnosis')?.value.trim()||sakit.diagnosis;
    const penanganan=document.getElementById('ep-sakit-penanganan')?.value.trim()||sakit.penanganan;
    sakit.tglMulai=tglMulai;
    sakit.diagnosis=diagnosis;
    sakit.penanganan=penanganan;
    sakit.updatedAt=Date.now();
    await DB.p('catatanSakit',sakit);
    CS();T('✅ Catatan sakit disimpan!');
    if(S.page==='izn')await this.renderIzn();
    else if(S.page==='profil')await this.renderProfil(S._profilId);
  },

  // Hapus catatan sakit (admin only)
  _delCatatanSakit(id){
    if(!_needAdmin())return;
    OS(`<div class="cw"><div class="ci3">🗑️</div><div class="ct3">Hapus Catatan Sakit?</div><div class="cs3">Data catatan sakit (diagnosis, penanganan, lampiran) akan dihapus permanen. Tidak bisa dibatalkan.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelCatatanSakit('${id}')">Hapus</button></div></div>`);
  },
  async _doDelCatatanSakit(id){
    await DB.d('catatanSakit',id);
    CS();T('✅ Catatan sakit dihapus!');
    if(S.page==='izn')await this.renderIzn();
    else if(S.page==='profil')await this.renderProfil(S._profilId);
  },

  // Detail popup catatan sakit
  async _detailCatatanSakit(id){
    const sakit=await DB.g('catatanSakit',id);
    if(!sakit)return;
    const sn=await DB.g('santri',sakit.sntId);
    const hariSakit=this._hitungHariSakit(sakit.tglMulai);
    const isAktif=sakit.status==='belum_sembuh';
    const statusBadge=isAktif
      ?'<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid #d97706">🤒 Belum Sembuh</span>'
      :'<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(13,181,127,.12);color:var(--a1);border:1px solid var(--a1)">✅ Sudah Sembuh</span>';
    const caraBerakhirTxt={manual:' Ditandai manual',nfc:' Sembuh via NFC tap',hadir_manual:' Sembuh via set Hadir manual'}[sakit.caraBerakhir]||'';
    const waMsg=()=>{
      let m='Assalamu\'alaikum, informasi kesehatan ananda '+(sn?.nama||'');
      m+='\n\n🤒 Status: '+(isAktif?'Masih Sakit':'Sudah Sembuh');
      m+='\n📅 Sakit sejak: '+sakit.tglMulai;
      if(isAktif)m+='\n⏱️ Hari ke-'+hariSakit;
      if(sakit.diagnosis)m+='\n\n🩺 Diagnosis: '+sakit.diagnosis;
      if(sakit.penanganan)m+='\n💊 Penanganan: '+sakit.penanganan;
      if(!isAktif&&sakit.sembuhAt)m+='\n\n✅ Sembuh pada: '+new Date(sakit.sembuhAt).toLocaleString('id-ID');
      return m;
    };
    const waBtn=(sn?.waliWA)?`<a href="https://wa.me/${sn.waliWA.replace(/\\D/g,'')}?text=${encodeURIComponent(waMsg())}" target="_blank" style="flex:1;padding:11px;border-radius:var(--r3);background:linear-gradient(135deg,#25d366,#1ebe5d);color:#fff;font-size:12px;font-weight:700;text-decoration:none;text-align:center;cursor:pointer">💬 Share ke Wali</a>`:'';
    OS(`<div class="sh">🤒 Detail Catatan Sakit</div><div class="sb" style="padding-bottom:90px">
      <div style="background:var(--su);border:1.5px solid ${isAktif?'rgba(245,158,11,.25)':'rgba(13,181,127,.2)'};border-radius:var(--r3);padding:14px;margin-bottom:12px;backdrop-filter:blur(16px)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:42px;height:42px;border-radius:50%;background:rgba(245,158,11,.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤒</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700;color:var(--t1)">${esc(sn?.nama||'-')}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">${sn?.kamar||'-'}</div>
          </div>
          ${statusBadge}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:11px">
          <div><div style="color:var(--t3);font-size:9px">Tanggal Mulai</div><div style="color:var(--t1);font-weight:700;margin-top:1px">${sakit.tglMulai}</div></div>
          <div><div style="color:var(--t3);font-size:9px">Durasi</div><div style="color:var(--t1);font-weight:700;margin-top:1px">${isAktif?hariSakit+' hari':'Selesai'}</div></div>
        </div>
        <div style="border-top:1px solid var(--dv);padding-top:10px">
          <div style="font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">🩺 Diagnosis / Keluhan</div>
          <div style="font-size:12px;color:var(--t1);line-height:1.5">${esc(sakit.diagnosis||'-')}</div>
        </div>
        ${sakit.penanganan?`<div style="border-top:1px solid var(--dv);padding-top:10px;margin-top:10px">
          <div style="font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">💊 Penanganan</div>
          <div style="font-size:12px;color:var(--t2);line-height:1.5">${esc(sakit.penanganan)}</div>
        </div>`:''}
        ${sakit.lampiran?`<div style="margin-top:10px"><img src="${sakit.lampiran}" style="width:100%;max-height:200px;border-radius:var(--r2);object-fit:cover" onclick="App._viewFotoCat('${sakit.lampiran}')"></div>`:''}
        ${!isAktif&&sakit.sembuhAt?`<div style="border-top:1px solid var(--dv);padding-top:10px;margin-top:10px;font-size:10px;color:var(--a1);font-weight:600">✅ Sembuh pada ${new Date(sakit.sembuhAt).toLocaleString('id-ID')}${caraBerakhirTxt?' ·'+caraBerakhirTxt:''}</div>`:''}
        <div style="font-size:9px;color:var(--t4);margin-top:10px">Dicatat oleh: ${sakit.createdBy||'-'} · ${new Date(sakit.createdAt).toLocaleString('id-ID')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isAktif?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:var(--grad);color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer" onclick="CS();App._confirmSembuh('${id}')">✅ Tandai Sudah Sembuh</button>`:''}
        <button style="padding:11px 14px;border-radius:var(--r3);background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.25);color:#7c3aed;font-size:12px;font-weight:700;cursor:pointer" onclick="App._editCatatanSakit('${id}')">✏️ Edit</button>
        ${!isAktif?`<button style="padding:11px 14px;border-radius:var(--r3);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;font-size:12px;font-weight:700;cursor:pointer" onclick="App._revertSakitSembuh('${id}')">🔄 Kembalikan ke Sakit</button>`:''}
        ${S._adminMode===true?`<button style="padding:11px 14px;border-radius:var(--r3);background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;font-size:12px;font-weight:700;cursor:pointer" onclick="App._delCatatanSakit('${id}')">🗑 Hapus</button>`:''}
      </div>
      ${waBtn?`<div style="margin-top:10px">${waBtn}</div>`:''}
    </div>`);
  },

  // Konfirmasi tandai sembuh
  _confirmSembuh(id){
    OS(`<div class="cw"><div class="ci3" style="background:rgba(13,181,127,.12);color:var(--a1)">✅</div><div class="ct3">Tandai Sudah Sembuh?</div><div class="cs3">Catatan sakit akan dipindahkan ke Riwayat Catatan Sakit. Sistem absensi kembali berjalan normal.</div><div class="cbs"><button class="cc" onclick="CS();App._detailCatatanSakit('${id}')">Batal</button><button class="co" style="background:var(--grad)" onclick="App._doConfirmSembuh('${id}')">Ya, Sembuh</button></div></div>`);
  },
  async _doConfirmSembuh(id){
    await this._setSakitSembuh(id,'manual');
    CS();T('✅ Santri ditandai sembuh.');
    if(S.page==='izn')await this.renderIzn();
    else if(S.page==='dash')await this.dash();
    else if(S.page==='profil')await this.renderProfil(S._profilId);
  },

  // Notifikasi catatan sakit ke chat lokal
  async _kirimNotifSakit(tipe,sakit){
    try{
      const sn=await DB.g('santri',sakit.sntId);
      const nama=sn?.nama||'Santri';
      let msg='';
      if(tipe==='baru'){
        msg=`🤒 *Catatan Sakit Baru*\n${nama} dicatat sakit sejak ${sakit.tglMulai}\n🩺 ${sakit.diagnosis||'-'}${sakit.penanganan?'\n💊 '+sakit.penanganan:''}\n\nSemua absensi otomatis berstatus Sakit sampai sembuh.`;
      }else if(tipe==='sembuh'){
        msg=`✅ *Sembuh*\n${nama} ditandai sudah sembuh. Absensi kembali normal.`;
      }
      if(typeof ChatModule!=='undefined'&&ChatModule.addSystem){
        ChatModule.addSystem(msg);
      }
    }catch(e){console.warn('[NotifSakit] error:',e);}
  },

  // ═══════════════════════════════════════════════════════════════
  // UZUR (HAID) MANAGEMENT — terintegrasi dengan absensi shalat.
  // Penyimpanan tunggal di store 'uzur' (hindari duplikasi data).
  // Status uzur aktif akan meng-override status 'none' pada absensi
  // shalat secara otomatis (auto-fill).
  // ═══════════════════════════════════════════════════════════════
  // Map: { sntId -> uzurRecord } untuk santri yang sedang uzur aktif.
  async _uzurAktifMap(tanggal){
    const all=await DB.ga('uzur');
    const m={};
    (all||[]).filter(u=>u.aktif&&u.tglMulai<=tanggal).forEach(u=>{m[u.sntId]=u});
    return m;
  },
  // List semua uzur aktif (untuk dashboard card & popup).
  async _uzurAktifList(){
    const today=_todayLocal();
    const [all,snt]=await Promise.all([DB.ga('uzur'),DB.ga('santri')]);
    const sntM=mapBy(snt,'id');
    return (all||[])
      .filter(u=>u.aktif&&u.tglMulai<=today)
      .map(u=>({...u,_sn:sntM[u.sntId],_hari:_uzurDayCount(u.tglMulai)}))
      .sort((a,b)=>(a.tglMulai||'').localeCompare(b.tglMulai||'')); // terlama di atas
  },
  // Mulai uzur untuk santri. Dipanggil saat pengurus memilih status 'uzur'
  // pada absensi shalat. Mencatat tglMulai, oleh, dan menandai aktif.
  // Tidak membuat duplikat — jika sudah ada uzur aktif, lewati.
  async _startUzur(sntId, oleh){
    const today=_todayLocal();
    const all=await DB.ga('uzur');
    const existing=(all||[]).find(u=>u.sntId===sntId&&u.aktif);
    if(existing)return existing;
    const rec={
      id:'uzur_'+sntId+'_'+Date.now(),
      sntId,
      tglMulai:today,
      tsMulai:Date.now(),
      aktif:true,
      tglSelesai:null,
      tsSelesai:null,
      lamaHari:null,
      oleh:oleh||S.user?.nama||'-',
      caraBerakhir:null,
      notif7Hari:false,
      notif15Hari:false,
      createdAt:Date.now(),
      updatedAt:Date.now()
    };
    await DB.p('uzur',rec);
    return rec;
  },
  // Akhiri uzur aktif untuk santri. Dipanggil saat:
  //  - Santri tap NFC pada jadwal shalat (caraBerakhir='nfc')
  //  - Pengurus mengubah absensi shalat jadi 'hadir' (caraBerakhir='manual')
  //  - Sistem otomatis hari ke-15 (caraBerakhir='auto_15')
  // Tidak pakai dialog konfirmasi (sesuai spec).
  async _endUzur(sntId, caraBerakhir){
    // ── H2 BUG FIX: Per-santri lock untuk _endUzur ──
    // Tanpa lock, jika NFC dan manual bersamaan, kedua call baca uzur aktif
    // yang sama, keduanya set aktif=false, keduanya kirim notifikasi "Uzur
    // Berakhir" → duplikat notifikasi meski cek status di _setSakitSembuh.
    if(!this._endUzurLocks)this._endUzurLocks={};
    if(this._endUzurLocks[sntId])return null;
    this._endUzurLocks[sntId]=true;
    try{
      const all=await DB.ga('uzur');
      const rec=(all||[]).find(u=>u.sntId===sntId&&u.aktif);
      if(!rec)return null;
      const today=_todayLocal();
      rec.aktif=false;
      rec.tglSelesai=today;
      rec.tsSelesai=Date.now();
      rec.caraBerakhir=caraBerakhir||'manual';
      rec.lamaHari=_uzurDayCount(rec.tglMulai);
      rec.updatedAt=Date.now();
      await DB.p('uzur',rec);
      // Kirim notifikasi sistem ke Chat & Notifikasi
      const sn=await DB.g('santri',sntId);
      const nm=sn?.nama||'Santri';
      await _postSystemChatMessage(
        `Uzur ${nm} telah berakhir. Durasi uzur: ${rec.lamaHari} hari.`,
        {label:'Uzur Berakhir', icon:'🟣', sevColor:'var(--cu)', subtype:'uzur_end'}
      ).catch(()=>{});
      return rec;
    }finally{
      // Lepas lock setelah 2 detik (anti-race untuk event paralel yang sudah antri)
      setTimeout(()=>{if(this._endUzurLocks)delete this._endUzurLocks[sntId];},2000);
    }
  },
  // Monitoring otomatis untuk uzur yang mencapai hari ke-7 dan ke-15.
  // Dipanggil dari dash(). Mengirim notifikasi (1x per uzur) di hari ke-7
  // dan menonaktifkan uzur otomatis di hari ke-15.
  async _checkUzurReminders(){
    // BUG FIX: guard konkurensi + persist flag SEBELUM kirim notifikasi.
    // Sebelumnya, jika dua call bersamaan (dash + _autoLockExpiredSesi),
    // keduanya baca uzur yang sama dengan notif7Hari=false, keduanya kirim
    // notifikasi → duplikat. Sekarang: tandai & persist dulu, baru kirim.
    // ── C2 BUG FIX: Persist guard via localStorage (60s window) ──
    if (this._uzurReminderChecking) return;
    const _lockTs = parseInt(localStorage.getItem('_ur_lock_ts') || '0', 10);
    if (_lockTs && (Date.now() - _lockTs) < 60000) return;
    localStorage.setItem('_ur_lock_ts', String(Date.now()));
    this._uzurReminderChecking = true;
    try{
      const today=_todayLocal();
      const all=await DB.ga('uzur');
      const aktif=(all||[]).filter(u=>u.aktif);
      if(!aktif.length)return;
      const snt=await DB.ga('santri');
      const sntM=mapBy(snt,'id');
      let changed=false;
      for(const u of aktif){
        const hari=_uzurDayCount(u.tglMulai);
        const sn=sntM[u.sntId];
        const nm=sn?.nama||'Santri';
        // Hari ke-7: kirim reminder (sekali saja)
        if(hari>=7&&!u.notif7Hari){
          u.notif7Hari=true;u.updatedAt=Date.now();changed=true;
          await DB.p('uzur',u);  // persist SEBELUM kirim notif
          await _postSystemChatMessage(
            `${nm} telah berstatus uzur selama 7 hari. Mohon dilakukan pemeriksaan.`,
            {label:'Pengingat Uzur', icon:'🟣', sevColor:'#f59e0b', subtype:'uzur_reminder_7'}
          ).catch(()=>{});
        }
        // Hari ke-15: nonaktifkan otomatis
        if(hari>=15&&!u.notif15Hari){
          u.aktif=false;
          u.tglSelesai=today;
          u.tsSelesai=Date.now();
          u.caraBerakhir='auto_15';
          u.lamaHari=15;
          u.notif15Hari=true;
          u.updatedAt=Date.now();changed=true;
          await DB.p('uzur',u);  // persist SEBELUM kirim notif
          await _postSystemChatMessage(
            `Status uzur ${nm} telah mencapai batas maksimal 15 hari dan dinonaktifkan otomatis.`,
            {label:'Uzur Auto-Nonaktif', icon:'🟣', sevColor:'#ef4444', subtype:'uzur_auto_15'}
          ).catch(()=>{});
        }
      }
      // Persist loop lama dihapus — setiap update sudah di-persist individual di atas
    }catch(e){console.warn('[UzurReminder] error:',e);}
    finally{
      this._uzurReminderChecking=false;
      localStorage.removeItem('_ur_lock_ts');
    }
  },
  // Popup: daftar santri yang sedang uzur aktif + pencarian + catat uzur baru
  async _popUzurHariIni(){
    const list=await this._uzurAktifList();
    const snt=await DB.ga('santri');
    const today=_todayLocal();
    OS(`<div class="sh">🟣 Santri Uzur Aktif (${list.length})</div><div class="sb" style="padding-bottom:80px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Tanggal: ${today} · Diurutkan dari uzur terlama</div>

      <!-- AUDIT v3m: Form catat uzur simpel -->
      <div style="background:rgba(236,72,153,.06);border:1.5px solid rgba(236,72,153,.18);border-radius:var(--r3);padding:12px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--cu);margin-bottom:8px">➕ Catat Uzur Baru</div>
        <div style="display:flex;gap:7px;margin-bottom:8px">
          <input id="uzur-search-inp" class="fi" placeholder="Cari nama santri..." oninput="App._uzurSearchSnt()" style="flex:1;font-size:13px;padding:10px 12px">
        </div>
        <div id="uzur-search-results" style="max-height:160px;overflow-y:auto;display:none"></div>
        <div id="uzur-selected-snt" style="display:none;margin-bottom:8px;padding:8px 10px;background:var(--gs);border-radius:var(--r2);font-size:12px">
          <span id="uzur-selected-name" style="font-weight:700;color:var(--t1)"></span>
          <button onclick="App._uzurClearSel()" style="float:right;font-size:11px;color:#ef4444;background:none;border:none;cursor:pointer">✕ Batal</button>
        </div>
        <input type="text" id="uzur-alasan" class="fi" placeholder="Alasan uzur (opsional, mis: sakit gigi)" style="width:100%;font-size:12px;padding:10px 12px;margin-bottom:8px">
        <button class="bg2 bw" style="width:100%;padding:11px;font-size:13px" onclick="App._uzurSubmit()">🟣 Catat Uzur</button>
      </div>

      <!-- AUDIT v3m: Search daftar uzur aktif -->
      <div style="display:flex;align-items:center;gap:7px;background:var(--inp);border:1.5px solid var(--dv);border-radius:var(--r2);padding:9px 12px;margin-bottom:10px">
        <span style="color:var(--t4);font-size:14px">🔍</span>
        <input id="uzur-list-search" class="fi" placeholder="Cari santri uzur..." oninput="App._filterUzurList()" style="border:none;padding:0;background:transparent;flex:1;font-size:13px">
      </div>

      <div id="uzur-list-container">
      ${list.length?list.map(u=>{
        const sn=u._sn;if(!sn)return'';
        const mn=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        const d=new Date(u.tglMulai+'T00:00:00');
        const tglStr=`${d.getDate()} ${mn[d.getMonth()]} ${d.getFullYear()}`;
        const warnHari=u._hari>=7;
        return`<div class="uzur-list-item" data-nama="${escJ(sn.nama)}" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="App.nav('profil',{id:'${sn.id}',t:'${escJ(sn.nama)}'})">
          <div style="width:34px;height:34px;border-radius:50%;background:rgba(236,72,153,.15);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🟣</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-weight:600;font-size:13px;color:var(--t1)">${sn.nama}</span><span class="uzur-badge">${warnHari?'⚠ ':''}Hari ke-${u._hari}</span></div>
            <div style="font-size:10px;color:var(--t3)">Kamar ${sn.kamar||'-'} · Mulai ${tglStr}</div>
          </div>
          <button onclick="event.stopPropagation();App._endUzurQuick('${u.id}')" style="padding:5px 10px;border-radius:100px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);font-size:10px;font-weight:700;color:#ef4444;cursor:pointer;flex-shrink:0">Selesai</button>
        </div>`;
      }).join(''):'<div class="empty" style="padding:20px 0"><div class="es">Tidak ada santri uzur aktif. 🎉</div></div>'}
      </div>
    </div>`);
    // Store santri list for search
    this._uzurSntList = snt.filter(s=>s.aktif);
  },
  // AUDIT v3m: Search santri untuk catat uzur
  _uzurSearchSnt(){
    const q=(document.getElementById('uzur-search-inp')?.value||'').toLowerCase().trim();
    const results=document.getElementById('uzur-search-results');
    if(!q){results.style.display='none';results.innerHTML='';return}
    const matches=this._uzurSntList?.filter(s=>s.nama.toLowerCase().includes(q)).slice(0,8)||[];
    results.style.display=matches.length?'block':'none';
    results.innerHTML=matches.length?matches.map(s=>`<div onclick="App._uzurSelectSnt('${s.id}','${escJ(s.nama)}')" style="padding:9px 12px;border-bottom:1px solid var(--dv);cursor:pointer;font-size:13px;color:var(--t1)">${s.nama} <span style="font-size:10px;color:var(--t3)">· ${s.kamar||'-'}</span></div>`).join(''):'<div style="padding:9px 12px;font-size:11px;color:var(--t4)">Tidak ditemukan</div>';
  },
  _uzurSelectSnt(id,nama){
    document.getElementById('uzur-search-inp').value='';
    document.getElementById('uzur-search-results').style.display='none';
    document.getElementById('uzur-selected-snt').style.display='block';
    document.getElementById('uzur-selected-name').textContent=nama;
    this._uzurSelectedId=id;
  },
  _uzurClearSel(){
    document.getElementById('uzur-selected-snt').style.display='none';
    this._uzurSelectedId=null;
  },
  async _uzurSubmit(){
    const sntId=this._uzurSelectedId;
    if(!sntId){T('⚠️ Pilih santri dulu');return}
    const alasan=document.getElementById('uzur-alasan')?.value.trim()||'';
    const today=_todayLocal();
    const by=S.user?.nama||'-';
    try{
      await DB.p('uzur',{id:uid(),sntId,tglMulai:today,alasan,aktif:true,oleh:by,tsMulai:Date.now(),createdAt:Date.now(),updatedAt:Date.now()});
      T('✅ Uzur dicatat!',2000);
      // Refresh popup
      this._uzurClearSel();
      document.getElementById('uzur-alasan').value='';
      this._popUzurHariIni();
    }catch(e){T('❌ Gagal: '+(e.message||e))}
  },
  async _endUzurQuick(uzurId){
    try{
      const u=await DB.g('uzur',uzurId);
      if(u){
        u.aktif=false;u.tglSelesai=_todayLocal();u.tsSelesai=Date.now();u.caraBerakhir='manual';u.updatedAt=Date.now();
        await DB.p('uzur',u);
        T('✅ Uzur diakhiri',2000);
        this._popUzurHariIni();
      }
    }catch(e){T('❌ Gagal: '+(e.message||e))}
  },
  _filterUzurList(){
    const q=(document.getElementById('uzur-list-search')?.value||'').toLowerCase().trim();
    document.querySelectorAll('.uzur-list-item').forEach(el=>{
      const nama=el.dataset.nama||'';
      el.style.display=(!q||nama.toLowerCase().includes(q))?'':'none';
    });
  },
  // Render tab Uzur di halaman profil santri.
  _renderProfilUzurTab(sntId, uzurList){
    const sorted=[...uzurList].sort((a,b)=>(b.tsMulai||0)-(a.tsMulai||0));
    const caraLabel={'nfc':'NFC Tap','manual':'Diubah Pengurus','auto_15':'Otomatis (15 hari)'};
    const mn=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const fmtTgl=(iso)=>{
      if(!iso)return'-';
      const d=new Date(iso+'T00:00:00');
      return`${d.getDate()} ${mn[d.getMonth()]} ${d.getFullYear()}`;
    };
    const cards=sorted.map(u=>{
      const isAktif=u.aktif;
      const lama=isAktif?_uzurDayCount(u.tglMulai):(u.lamaHari||1);
      const rentang=`${fmtTgl(u.tglMulai)}${isAktif?' – sekarang':(u.tglSelesai?(' – '+fmtTgl(u.tglSelesai)):'')} (${lama} hari)`;
      return`<div style="background:var(--su);border:1px solid ${isAktif?'rgba(236,72,153,.25)':'var(--sub)'};border-radius:var(--r3);padding:11px 13px;margin-bottom:8px;backdrop-filter:blur(20px)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:11px;font-weight:700;color:${isAktif?'var(--cu)':'var(--t2)'}">${isAktif?'🟣 Sedang Uzur':'Riwayat Uzur'}</span>
          <span class="uzur-badge">${isAktif?`Hari ke-${lama}`:`${lama} hari`}</span>
        </div>
        <div style="font-size:11px;color:var(--t1);font-weight:600;margin-bottom:3px">📅 ${rentang}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:3px">👤 Dicatat oleh: ${esc(u.oleh||'-')}</div>
        ${!isAktif&&u.caraBerakhir?`<div style="font-size:10px;color:var(--t3);margin-top:2px">🔚 Berakhir via: ${esc(caraLabel[u.caraBerakhir]||u.caraBerakhir)}</div>`:''}
      </div>`;
    }).join('');
    return`${cards||'<div class="empty" style="padding:20px 0"><div class="es">Belum ada riwayat uzur.</div></div>'}`;
  },

  async _updateIznBadge(){
    const per=await DB.ga('perizinan').catch(()=>[]);
    const today=_todayLocal();const nowT=_nowTimeLocal();
    const telat=per.filter(p=>this._isTerlambat(p,today,nowT)).length;
    const n=telat;
    const b=document.getElementById('izn-badge');
    if(!b)return;
    if(n>0){b.textContent=n>99?'99+':n;b.style.display='flex';}else{b.style.display='none';}
  },
  // Cek apakah izin sudah lewat batas waktu kembali (tanggal ATAU jam pada hari-H)
  _isTerlambat(p,today,nowT){
    if(p.status==='ditolak'||p.sudahKembali)return false;
    if(this._isSakitAsrama(p))return false; // sakit di asrama tidak pakai konsep terlambat
    if(p.tglSelesai<today)return true;
    if(p.tglSelesai===today&&p.jamKembali&&nowT>p.jamKembali)return true;
    return false;
  },
  // Status runtime (bukan status tersimpan) — dipakai buat kategori dashboard
  // Cek apakah tipeIzin termasuk kategori sakit (tidak pulang/keluar kampus)
  _isSakitIzin(p){
    const t=(p?.tipeIzin||'').toLowerCase();
    return t==='sakit'||t.includes('sakit')||t.includes('berobat')||t.includes('rawat');
  },
  // Cek apakah sakit tidak pulang/bermalam (di asrama saja)
  _isSakitAsrama(p){
    const t=(p?.tipeIzin||'').toLowerCase();
    return t.includes('asrama')||t.includes('tidak pulang')||(t.includes('sakit')&&!t.includes('pulang bermalam')&&!t.match(/pulang\s*bermalam/)&&!t.match(/\(pulang/));
  },
  // Cek apakah sakit pulang bermalam (seperti izin biasa)
  _isSakitPulang(p){
    const t=(p?.tipeIzin||'').toLowerCase();
    return (t.includes('sakit')&&(t.includes('pulang')||t.includes('bermalam')))||t.includes('berobat');
  },
  // Hitung selisih hari antara tglSelesai izin dan tanggal kembali aktual
  _hitungHariTerlambat(p){
    if(!p||!p.tglSelesai)return 0;
    // Pakai waktu kembali aktual (atau hari ini kalau belum kembali)
    const kembali=p.waktuKembaliAktual?new Date(p.waktuKembaliAktual):new Date();
    // Tenggat = tglSelesai + jamKembali (atau 23:59 kalau tidak ada jam)
    const tenggat=new Date(p.tglSelesai+'T'+(p.jamKembali||'23:59'));
    const diff=kembali-tenggat;
    if(diff<=0)return 0;
    // Hitung hari (pembulatan ke atas, minimal 1)
    return Math.max(1,Math.ceil(diff/86400000));
  },
  // Hitung durasi sakit dalam hari (khusus tipe sakit)
  _hitungDurasiSakit(p){
    if(!p||!p.tglMulai||!p.tglSelesai)return 0;
    const a=new Date(p.tglMulai+'T00:00');
    const b=new Date(p.tglSelesai+'T23:59');
    return Math.max(1,Math.round((b-a)/86400000)+1);
  },
  // Sistem perizinan = PENCATATAN, bukan pengajuan/persetujuan.
  // Begitu dicatat, izin otomatis dianggap sudah berangkat sampai ditandai "Sudah Kembali".
  // Kalau sampai batas waktu (tglSelesai + jamKembali) belum ditandai kembali -> berubah jadi "Terlambat"
  // (bukan minta persetujuan ulang) dan santri tetap tercatat sedang izin sampai admin menandai kembali.
  _statusRuntimeIzin(p){
    const today=_todayLocal();const nowT=_nowTimeLocal();
    if(p.status==='ditolak')return'ditolak';
    if(p.sudahKembali)return'selesai';
    // Sakit tidak pulang (di asrama): tidak ada konsep berangkat/kembali/terlambat, status pakai sakitStatus
    if(this._isSakitAsrama(p)){
      if(p.sakitStatus==='sembuh')return'selesai';
      return'sedang_izin';
    }
    if(this._isTerlambat(p,today,nowT))return'terlambat';
    if(p.tglMulai>today)return'terjadwal';
    return'sedang_izin';
  },
  // Perlu tindak lanjut tambahan (mis. sakit sudah lama) - dipakai untuk badge peringatan saja,
  // tidak mengubah status runtime supaya tombol tidak berubah jadi minta persetujuan lagi.
  _perluTindakLanjutIzin(p){
    if(p.status==='ditolak'||p.sudahKembali)return false;
    if(this._isSakitAsrama(p))return p.sakitStatus!=='sembuh'&&this._hitungDurasiSakit(p)>3;
    if(this._isSakitIzin(p))return this._hitungDurasiSakit(p)>3;
    return false;
  },

  // Hitung status keberadaan santri hari ini berdasarkan perizinan aktif
  // Santri "tidak di pondok" = ada izin disetujui yang masih aktif (sudah berangkat tapi belum ditandai kembali)
  //       — TERMASUK yang sudah lewat tglSelesai tapi belum ditandai kembali (status runtime: terlambat / sedang_izin)
  //       DAN bukan sakit tidak pulang (sakit di asrama masih di pondok)
  // Santri "di pondok" = santri aktif - tidak di pondok
  async _statusPondokHariIni(){
    const today=_todayLocal();
    const [snt,per,sakitAll]=await Promise.all([DB.ga('santri'),DB.ga('perizinan'),DB.ga('catatanSakit').catch(()=>[])]);
    const sntM=mapBy(snt,'id');
    const aktif=snt.filter(x=>x.aktif);
    // Cari semua izin yang masih aktif menurut runtime status (sedang_izin / terlambat / terjadwal-yg-sudahDimulai)
    // KUNCI: izin dianggap "masih membawa santri keluar" selama belum ditandai sudahKembali,
    //        bahkan jika sudah lewat tglSelesai (terlambat kembali).
    const masihKeluar=per.filter(p=>{
      if(p.status!=='disetujui')return false;
      if(p.sudahKembali)return false;
      // Hanya izin yang sudah mulai (tglMulai <= today). Izin terjadwal (tglMulai > today) tidak dihitung.
      if(p.tglMulai>today)return false;
      return true;
    });
    // Santri tidak di pondok = masihKeluar DAN BUKAN sakit tidak pulang (di asrama)
    const tidakDiPondokMap={}; // sntId -> per
    masihKeluar.forEach(p=>{
      if(this._isSakitAsrama(p))return; // sakit asrama = masih di pondok
      // Kalau sudah ada entry, simpan yang paling baru (tglSelesai terbesar)
      const ex=tidakDiPondokMap[p.sntId];
      if(!ex||(p.tglSelesai||'')>(ex.tglSelesai||''))tidakDiPondokMap[p.sntId]=p;
    });
    // Sakit hari ini: pakai catatanSakit store (sumber utama)
    // + fallback ke perizinan lama (sakit tipe izin yang belum sembuh)
    const sakitMap={}; // sntId -> sakitRecord (catatanSakit lebih dipriority)
    // 1. Tambahkan dari perizinan lama (sakit-asrama) dulu sebagai fallback
    per.filter(p=>this._isSakitIzin(p)&&p.status==='disetujui'&&p.tglMulai<=today&&p.tglSelesai>=today&&p.sakitStatus!=='sembuh')
      .forEach(p=>{if(!sakitMap[p.sntId])sakitMap[p.sntId]={...p,_legacy:true};});
    // 2. Override dengan catatanSakit baru (sumber utama)
    const sakitHariIniList=(sakitAll||[]).filter(s=>s.status==='belum_sembuh'&&s.tglMulai<=today);
    sakitHariIniList.forEach(s=>{sakitMap[s.sntId]=s;});
    const diPondok=aktif.filter(s=>!tidakDiPondokMap[s.id]);
    const tidakDiPondok=aktif.filter(s=>tidakDiPondokMap[s.id]);
    return{
      aktif,diPondok,tidakDiPondok,tidakDiPondokMap,sakitMap,sakitHariIniList,
      sntM
    };
  },
  // Popup: list santri di pondok / tidak di pondok
  async _popStatusPondok(tipe){
    const data=await this._statusPondokHariIni();
    const today=_todayLocal();
    const list=tipe==='di_pondok'?data.diPondok:data.tidakDiPondok;
    const title=tipe==='di_pondok'?`🏠 Santri di Pondok (${list.length})`:`🚶 Santri Tidak di Pondok (${list.length})`;
    if(tipe==='di_pondok'){
      // Di pondok: tampilkan list biasa + badge sakit kalau ada
      OS(`<div class="sh">${title}</div><div class="sb" style="padding-bottom:30px">
        <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Tanggal: ${today}</div>
        ${list.length?list.map(s=>{
          const isSakit=!!data.sakitMap[s.id];
          const sakitBadge=isSakit?`<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid rgba(245,158,11,.25)">${this._isSakitAsrama(data.sakitMap[s.id])?'🤒 Sakit Asrama':'🤒 Sakit'}</span>`:'';
          return`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="App.nav('profil',{id:'${s.id}',t:'${escJ(s.nama)}'})">
            <div style="width:34px;height:34px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${s.nama.charAt(0)}</div>
            <div style="flex:1"><div style="font-weight:600;font-size:13px;color:var(--t1)">${s.nama}</div><div style="font-size:10px;color:var(--t3)">Kamar ${s.kamar||'-'}</div></div>
            ${sakitBadge}
          </div>`;
        }).join(''):'<div class="empty" style="padding:20px 0"><div class="es">Tidak ada data.</div></div>'}
      </div>`);
    } else {
      // Tidak di pondok: kelompokkan per status runtime dulu (Terlambat / Sedang Izin) lalu per jenis izin
      const byStatus={'terlambat':{},'sedang_izin':{},'terjadwal':{}};
      list.forEach(s=>{
        const per=data.tidakDiPondokMap[s.id];
        if(!per)return;
        const r=this._statusRuntimeIzin(per);
        const j=per.tipeIzin||'Lainnya';
        const bucket=(r==='terlambat')?'terlambat':(r==='terjadwal')?'terjadwal':'sedang_izin';
        if(!byStatus[bucket][j])byStatus[bucket][j]=[];
        byStatus[bucket][j].push({s,per,r});
      });
      const sectionHtml=(bucket,title,icon,color)=>{
        const sec=byStatus[bucket];
        const total=Object.values(sec).reduce((s,a)=>s+a.length,0);
        if(!total)return'';
        return `<div style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.5px;margin:${bucket==='terlambat'?'0':'16px'} 0 6px;padding:0 2px">${icon} ${title} (${total})</div>`+
          Object.entries(sec).map(([j,arr])=>`
            <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin:8px 0 5px;padding:0 2px">${j} (${arr.length})</div>
            ${arr.map(({s,per,r})=>{
              const telat=(r==='terlambat')?`<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.22)">⏰ Terlambat</span>`:'';
              return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="App._detailIzin('${per.id}')">
                <div style="width:34px;height:34px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${s.nama.charAt(0)}</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px"><span style="font-weight:600;font-size:13px;color:var(--t1)">${s.nama}</span>${telat}</div>
                  <div style="font-size:10px;color:var(--t3)">Kamar ${s.kamar||'-'} · ${per.tglMulai}${per.tglMulai!==per.tglSelesai?' s/d '+per.tglSelesai:''}${per.jamKembali?' '+per.jamKembali:''}</div>
                </div>
              </div>`;
            }).join('')}`).join('');
      };
      OS(`<div class="sh">${title}</div><div class="sb" style="padding-bottom:30px">
        <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Tanggal: ${today} · Termasuk yang terlambat kembali (belum ditandai sudah kembali)</div>
        ${list.length?(sectionHtml('terlambat','Terlambat / Belum Kembali','⏰','#ef4444')+sectionHtml('sedang_izin','Sedang Izin','🚶','var(--a1)')+sectionHtml('terjadwal','Terjadwal','📅','#8b5cf6')):'<div class="empty" style="padding:20px 0"><div class="es">Semua santri ada di pondok hari ini. 🎉</div></div>'}
      </div>`);
    }
  },
  // Popup: list santri sakit hari ini + status + keterangan sakit apa + sudah berapa hari
  async _popSakitHariIni(){
    const today=_todayLocal();
    // ── H1 BUG FIX: Merge catatanSakit (baru) + perizinan sakit (legacy) ──
    // Sebelumnya hanya pakai catatanSakit store. Perizinan lama dengan
    // tipeIzin "sakit"/"berobat" yang masih aktif diabaikan → data sakit lama
    // tidak muncul di popup meski masih dianggap aktif di tempat lain.
    const [sakitAll,perAll,snt]=await Promise.all([DB.ga('catatanSakit'),DB.ga('perizinan'),DB.ga('santri')]);
    const sntM=mapBy(snt,'id');
    // Sumber 1: catatanSakit store (baru)
    const sakitList=(sakitAll||[]).filter(s=>s.status==='belum_sembuh'&&s.tglMulai<=today).map(s=>({
      _id:s.id,_src:'catatanSakit',_sn:sntM[s.sntId],_hari:this._hitungHariSakit(s.tglMulai),
      _tglMulai:s.tglMulai,_diagnosis:s.diagnosis,_penanganan:s.penanganan,_statusBadge:'🤒 Belum Sembuh · Hari ke-'+this._hitungHariSakit(s.tglMulai),
      _detailFn:`App._detailCatatanSakit('${s.id}')`,
      _statusLabel:'belum_sembuh'
    }));
    // Sumber 2: perizinan tipe sakit yang masih aktif & belum sembuh (legacy)
    const legacySakit=(perAll||[]).filter(p=>this._isSakitIzin(p)&&p.status==='disetujui'&&p.tglMulai<=today&&p.tglSelesai>=today&&p.sakitStatus!=='sembuh').map(p=>({
      _id:p.id,_src:'perizinan_legacy',_sn:sntM[p.sntId],_hari:this._hitungHariSakitLegacy(p.tglMulai,today),
      _tglMulai:p.tglMulai,_diagnosis:p.alasan||p.tipeIzin,_penanganan:'',
      _statusBadge:'🤒 Sakit (Perizinan) · Hari ke-'+this._hitungHariSakitLegacy(p.tglMulai,today),
      _detailFn:`App.nav('izn')`,
      _statusLabel:'belum_sembuh'
    }));
    // Gabung & sort by tglMulai (terlama dulu)
    const merged=[...sakitList,...legacySakit].sort((a,b)=>(a._tglMulai||'').localeCompare(b._tglMulai||''));
    // Dedup by santri (jika santri ada di kedua sumber, prioritaskan catatanSakit)
    const seen=new Set();
    const finalList=merged.filter(x=>{
      if(!x._sn)return false;
      if(seen.has(x._sn.id))return false;
      seen.add(x._sn.id);
      return true;
    });
    OS(`<div class="sh">🤒 Santri Sakit Hari Ini (${finalList.length})</div><div class="sb" style="padding-bottom:30px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Tanggal: ${today} · Termasuk catatan sakit & perizinan sakit lama yang masih aktif</div>
      ${finalList.length?finalList.map(s=>{
        const sn=s._sn;if(!sn)return'';
        const statusBadge='<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid #d97706">'+s._statusBadge+'</span>';
        return`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="${s._detailFn}">
          <div style="width:34px;height:34px;border-radius:50%;background:rgba(245,158,11,.15);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🤒</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-weight:600;font-size:13px;color:var(--t1)">${sn.nama}</span>${statusBadge}</div>
            <div style="font-size:10px;color:var(--t3)">📅 Mulai ${s._tglMulai} · ⏱️ ${s._hari} hari</div>
            ${s._diagnosis?`<div style="font-size:10px;color:#d97706;margin-top:1px;font-weight:600">🩺 ${esc(s._diagnosis)}</div>`:''}
            ${s._penanganan?`<div style="font-size:9px;color:var(--t4);margin-top:1px">💊 ${esc(s._penanganan).slice(0,60)}${s._penanganan.length>60?'...':''}</div>`:''}
          </div>
        </div>`;
      }).join(''):'<div class="empty" style="padding:20px 0"><div class="es">Tidak ada santri yang masih sakit. 🎉</div></div>'}
    </div>`);
  },
  _hitungHariSakitLegacy(tglMulai,today){
    if(!tglMulai)return 1;
    const start=new Date(tglMulai+'T00:00:00');
    const end=new Date(today+'T00:00:00');
    const diff=Math.floor((end-start)/86400000);
    return Math.max(1,diff+1);
  },
  // Popup: list santri alpha hari ini, dikelompokkan per kegiatan & sub kegiatan
  async _popAlphaHariIni(){
    const today=_todayLocal();
    const [ses,abs,snt,kg,sk]=await Promise.all([DB.ga('sesi'),DB.ga('absensi'),DB.ga('santri'),DB.ga('kegiatan'),DB.ga('subKeg')]);
    const kgM=mapBy(kg,'id'),skM=mapBy(sk,'id'),sntM=mapBy(snt,'id');
    const todaySes=ses.filter(x=>x.tanggal===today);
    // Group: kegiatanNama -> subKegNama (atau '-') -> [sntNama list]
    const groups={};
    let totalAlpha=0;
    todaySes.forEach(sx=>{
      const k=kgM[sx.kgId];
      const skItem=sx.skId?skM[sx.skId]:null;
      const kgNama=k?.nama||'-';
      const skNama=skItem?.nama||'(Umum)';
      const alphaList=abs.filter(a=>a.sesiId===sx.id&&a.status==='alpha').map(a=>sntM[a.sntId]).filter(Boolean);
      if(!alphaList.length)return;
      if(!groups[kgNama])groups[kgNama]={};
      if(!groups[kgNama][skNama])groups[kgNama][skNama]=[];
      // Dedup santri per sub-kegiatan
      alphaList.forEach(s=>{if(!groups[kgNama][skNama].find(x=>x.id===s.id))groups[kgNama][skNama].push(s)});
      totalAlpha+=alphaList.length;
    });
    OS(`<div class="sh">Alpha Hari Ini (${totalAlpha}x)</div><div class="sb" style="padding-bottom:30px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Tanggal: ${today} · Dikelompokkan per kegiatan & sub kegiatan</div>
      ${Object.keys(groups).length?Object.entries(groups).map(([kgNama,subGroups])=>`
        <div style="font-size:11px;font-weight:800;color:var(--a1);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px;padding:6px 10px;background:var(--gs);border-radius:var(--r2);border-left:3px solid var(--a1)">${kgNama}</div>
        ${Object.entries(subGroups).map(([skNama,list])=>`
          <div style="margin-left:10px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:var(--t2);margin-bottom:4px;padding-left:4px;border-left:2px solid var(--dv)">🔹 ${skNama} (${list.length})</div>
            ${list.map(s=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0 6px 12px;border-bottom:1px solid var(--dv);cursor:pointer" onclick="App.nav('profil',{id:'${s.id}',t:'${escJ(s.nama)}'})">
              <div style="width:28px;height:28px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${s.nama.charAt(0)}</div>
              <div style="flex:1"><div style="font-weight:600;font-size:12px;color:var(--t1)">${s.nama}</div><div style="font-size:9px;color:var(--t3)">Kamar ${s.kamar||'-'}</div></div>
              <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(100,116,139,.12);color:var(--ca);border:1px solid rgba(100,116,139,.22)">Alpha</span>
            </div>`).join('')}
          </div>
        `).join('')}
      `).join(''):'<div class="empty" style="padding:20px 0"><div class="es">Tidak ada santri alpha hari ini. 🎉</div></div>'}
    </div>`);
  },
  // Popup: list pelanggaran belum tak'zir
  async _popPelanggaranBelum(){
    const [pel,snt]=await Promise.all([DB.ga('pelanggaran'),DB.ga('santri')]);
    const sntM=mapBy(snt,'id');
    const today=_todayLocal();
    const belum=pel.filter(p=>p.status==='belum').sort((a,b)=>b.createdAt-a.createdAt);
    OS(`<div class="sh">⚠️ Pelanggaran Belum di-Ta'zir (${belum.length})</div><div class="sb" style="padding-bottom:30px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:10px">Termasuk Alpha & Terlambat — perlu ditindak lanjuti</div>
      ${belum.length?belum.map(p=>{
        const sn=sntM[p.sntId];
        const isTerlambat=p.tipe==='auto'&&(p.pelanggaranJenis==='Terlambat');
        return`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="App.nav('pel')">
          <div style="width:34px;height:34px;border-radius:50%;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${isTerlambat?'⏰':'⚠️'}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-weight:600;font-size:13px;color:var(--t1)">${sn?.nama||'-'}</span>${isTerlambat?'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(139,92,246,.12);color:#7c3aed;border:1px solid rgba(139,92,246,.25)">Terlambat</span>':'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.22)">Alpha</span>'}</div>
            <div style="font-size:10px;color:var(--t3)">📅 ${p.tanggal} · ${p.kgNama||'-'}${p.skNama?' ('+p.skNama+')':''}</div>
            ${p.deskripsi?`<div style="font-size:10px;color:var(--t4);margin-top:1px">${esc(p.deskripsi).slice(0,60)}</div>`:''}
          </div>
        </div>`;
      }).join(''):'<div class="empty" style="padding:20px 0"><div class="es">Tidak ada pelanggaran tertunda. 🎉</div></div>'}
    </div>`);
  },
  // Share data santri hari ini (rekap status kehadiran)
  async _shareSantriHariIni(){
const today=_todayLocal();
const [snt,ses,abs,kg,sk,per,pel,sakitAllShare]=await Promise.all([DB.ga('santri'),DB.ga('sesi'),DB.ga('absensi'),DB.ga('kegiatan'),DB.ga('subKeg'),DB.ga('perizinan'),DB.ga('pelanggaran'),DB.ga('catatanSakit').catch(()=>[])]);
const aktif=snt.filter(x=>x.aktif).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
const todaySes=ses.filter(x=>x.tanggal===today);
const todayAbs=abs.filter(a=>todaySes.find(x=>x.id===a.sesiId));
// Status per santri hari ini (ambil status terakhir/terburuk)
const statusSantri={}; // sntId -> {hadir:0,alpha:0,izin:0,sakit:0,terlambat:0,total:0}
aktif.forEach(s=>statusSantri[s.id]={hadir:0,alpha:0,izin:0,sakit:0,terlambat:0,total:0});
todayAbs.forEach(a=>{
if(statusSantri[a.sntId]&&statusSantri[a.sntId][a.status]!==undefined){
statusSantri[a.sntId][a.status]++;
statusSantri[a.sntId].total++;
}
});
// Klasifikasi
const sudahAbsen=aktif.filter(s=>statusSantri[s.id].total>0);
const belumAbsen=aktif.filter(s=>statusSantri[s.id].total===0);
// Santri yang dianggap hadir (semua sesi hadir)
const fullHadir=sudahAbsen.filter(s=>statusSantri[s.id].alpha===0&&statusSantri[s.id].izin===0&&statusSantri[s.id].sakit===0&&statusSantri[s.id].terlambat===0);
const adaAlpha=sudahAbsen.filter(s=>statusSantri[s.id].alpha>0);
const adaIzin=sudahAbsen.filter(s=>statusSantri[s.id].izin>0);
const adaSakit=sudahAbsen.filter(s=>statusSantri[s.id].sakit>0);
const adaTelat=sudahAbsen.filter(s=>statusSantri[s.id].terlambat>0);
// Cek perizinan aktif untuk "tidak di pondok" (termasuk yang terlambat kembali)
const sedangIzin=per.filter(p=>p.status==='disetujui'&&!p.sudahKembali&&p.tglMulai<=today&&!this._isSakitAsrama(p));
const tidakDiPondokIds=new Set(sedangIzin.map(p=>p.sntId));
// Pelanggaran belum tak'zir hari ini
const pelBelum=pel.filter(p=>p.status==='belum'&&p.tanggal===today);
const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const dn=['Ahad','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const d=new Date();
let t='*DATA SANTRI HARI INI*\n';
t+=''+_appN()+'\n';
t+=''+dn[d.getDay()]+', '+d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+'\n\n';
t+='*RINGKASAN*\n';
t+='Total Santri Aktif: '+aktif.length+'\n';
t+='Di Pondok: '+(aktif.length-tidakDiPondokIds.size)+'\n';
t+='Tidak di Pondok: '+tidakDiPondokIds.size+'\n';
// Sakit: gabungan catatanSakit baru + perizinan sakit lama
const sakitAktifBaru=(sakitAllShare||[]).filter(s=>s.status==='belum_sembuh'&&s.tglMulai<=today);
const sakitLegacy=per.filter(p=>this._isSakitIzin(p)&&p.status==='disetujui'&&p.tglMulai<=today&&p.tglSelesai>=today&&p.sakitStatus!=='sembuh');
const sakitAllIds=new Set([...sakitAktifBaru.map(s=>s.sntId),...sakitLegacy.map(p=>p.sntId)]);
t+='Masih Sakit: '+sakitAllIds.size+'\n';
// Alpha hari ini: jumlah santri yang ada absensi alpha
const alphaToday=new Set(todayAbs.filter(a=>a.status==='alpha').map(a=>a.sntId));
t+='Alpha (santri): '+alphaToday.size+'\n';
t+='Ada Terlambat: '+adaTelat.length+'\n';
t+='Belum Diabsen: '+belumAbsen.length+'\n';
t+="Pelanggaran Belum Ta'zir Hari Ini: "+pelBelum.length+'\n\n';
// Detail santri tidak di pondok
if(tidakDiPondokIds.size){
t+='*TIDAK DI PONDOK*\n';
const tdp=[...tidakDiPondokIds].map(id=>aktif.find(s=>s.id===id)).filter(Boolean);
// Group by jenis izin
const byJenis={};
tdp.forEach(s=>{const per2=sedangIzin.find(p=>p.sntId===s.id);const j=per2?.tipeIzin||'Lainnya';if(!byJenis[j])byJenis[j]=[];byJenis[j].push(s)});
Object.entries(byJenis).forEach(([j,arr])=>{
t+='• '+j+' ('+arr.length+'): '+arr.map(s=>s.nama).join(', ')+'\n';
});
t+='\n';
}
// Detail santri alpha hari ini (per kegiatan & sub kegiatan)
if(alphaToday.size){
t+='*ALPHA HARI INI*\n';
const kgM2=mapBy(kg,'id');const skM2=mapBy(sk,'id');const sntM2=mapBy(snt,'id');
const alphaGroups={};
todaySes.forEach(sx=>{
const k=kgM2[sx.kgId];const skItem=sx.skId?skM2[sx.skId]:null;
const kgNama=k?.nama||'-';const skNama=skItem?.nama||'(Umum)';
const list=todayAbs.filter(a=>a.sesiId===sx.id&&a.status==='alpha').map(a=>sntM2[a.sntId]).filter(Boolean);
if(!list.length)return;
if(!alphaGroups[kgNama])alphaGroups[kgNama]={};
if(!alphaGroups[kgNama][skNama])alphaGroups[kgNama][skNama]=[];
list.forEach(s=>{if(!alphaGroups[kgNama][skNama].find(x=>x.id===s.id))alphaGroups[kgNama][skNama].push(s)});
});
Object.entries(alphaGroups).forEach(([kgNama,subGroups])=>{
t+='• '+kgNama+':\n';
Object.entries(subGroups).forEach(([skNama,list])=>{
t+='- '+skNama+' ('+list.length+'): '+list.map(s=>s.nama).join(', ')+'\n';
});
});
t+='\n';
}
// Detail santri sakit (catatanSakit baru — sumber utama)
if(sakitAktifBaru.length){
t+='*SANTRI MASIH SAKIT*\n';
const sntM3=mapBy(snt,'id');
sakitAktifBaru.forEach(s=>{
const sn=sntM3[s.sntId];
const hariSakit=this._hitungHariSakit(s.tglMulai);
t+='• '+(sn?.nama||'-')+(s.diagnosis?' ['+s.diagnosis+']':'')+' — Sakit · '+hariSakit+' hari';
if(s.penanganan)t+=' · '+s.penanganan;
t+='\n';
});
t+='\n';
}
// Detail pelanggaran belum
if(pelBelum.length){
t+="*PELANGGARAN BELUM TA'ZIR*\n";
pelBelum.forEach(p=>{
const sn=snt.find(x=>x.id===p.sntId);
const jenis=p.tipe==='auto'?(p.pelanggaranJenis||'Alpha'):'Non Alpha';
t+='• '+(sn?.nama||'-')+' — '+jenis+(p.kgNama?' · '+p.kgNama:'')+'\n';
});
t+='\n';
}
t+='_Dikirim via '+_appN()+'_';
// Share via WhatsApp (no fixed number)
const url='https://api.whatsapp.com/send?text='+encodeURIComponent(t);
window.open(url,'_blank');
  },

  async renderIzn(){
    S._iznTab=S._iznTab||'aktif';
    await this._updateIznBadge();
    let [per,snt,sakitAll]=await Promise.all([DB.ga('perizinan'),DB.ga('santri'),DB.ga('catatanSakit')]);
    const sntM=mapBy(snt,'id');
    // Bersihkan data perizinan yatim (santri sudah dihapus tapi data izin masih ada)
    const orphans=per.filter(p=>!sntM[p.sntId]);
    if(orphans.length){
      for(const o of orphans)await DB.d('perizinan',o.id);
      per=per.filter(p=>sntM[p.sntId]);
    }
    // Bersihkan catatanSakit yatim juga
    const sakitOrphans=(sakitAll||[]).filter(s=>!sntM[s.sntId]);
    if(sakitOrphans.length){
      for(const o of sakitOrphans)await DB.d('catatanSakit',o.id);
      sakitAll=(sakitAll||[]).filter(s=>sntM[s.sntId]);
    }
    const runtime=per.map(p=>({p,r:this._statusRuntimeIzin(p)}));
    const terlambat=runtime.filter(x=>x.r==='terlambat').map(x=>x.p).sort((a,b)=>a.tglSelesai.localeCompare(b.tglSelesai));
    const sedangIzin=runtime.filter(x=>x.r==='sedang_izin').map(x=>x.p).sort((a,b)=>a.tglSelesai.localeCompare(b.tglSelesai));
    const terjadwal=runtime.filter(x=>x.r==='terjadwal').map(x=>x.p).sort((a,b)=>a.tglMulai.localeCompare(b.tglMulai));
    const today=_todayLocal();
    const selesaiHariIni=runtime.filter(x=>x.r==='selesai'&&x.p.waktuKembaliAktual&&new Date(x.p.waktuKembaliAktual).toISOString().slice(0,10)===today).map(x=>x.p);
    const riwayat=per.slice().sort((a,b)=>b.createdAt-a.createdAt);
    const aktif=[...terlambat,...sedangIzin,...terjadwal];
    const el=document.getElementById('izn-body');

    const statCard=(ic,lb,n,tab,color)=>`<div onclick="App._iznSetTab('${tab}')" style="background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r3);padding:12px 10px;text-align:center;cursor:pointer;backdrop-filter:blur(16px);transition:transform .15s" onmousedown="this.style.transform='scale(.96)'" onmouseup="this.style.transform='scale(1)'">
      <div style="font-size:20px;font-weight:800;color:${color}">${n}</div>
      <div style="font-size:9px;color:var(--t3);font-weight:700;margin-top:2px;line-height:1.3">${ic} ${lb}</div>
    </div>`;

    const catatanHtml=(p)=>(p.catatanKeputusan||p.catatanTolak)?`<div style="font-size:10px;color:${p.status==='ditolak'?'#ef4444':'var(--t3)'};margin-top:3px">📝 Catatan: ${esc(p.catatanKeputusan||p.catatanTolak)}</div>`:'';

    const cardIzin=(p,mode)=>{
      const sn=sntM[p.sntId];if(!sn)return'';
      const isSakit=this._isSakitIzin(p);
      const badgeMap={
        sedang_izin:['🚶 Sedang Izin','rgba(13,181,127,.1)','var(--a1)','rgba(13,181,127,.2)'],
        terlambat:['⏰ Terlambat','rgba(239,68,68,.1)','#ef4444','rgba(239,68,68,.2)'],
        selesai:['✅ Selesai','rgba(13,181,127,.1)','var(--a1)','rgba(13,181,127,.2)'],
        ditolak:['✕ Dibatalkan','rgba(239,68,68,.1)','#ef4444','rgba(239,68,68,.2)'],
        terjadwal:['📅 Terjadwal','rgba(139,92,246,.1)','#8b5cf6','rgba(139,92,246,.2)'],
      };
      const r=this._statusRuntimeIzin(p);
      const bm=badgeMap[r]||badgeMap.sedang_izin;
      const badge=`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:${bm[1]};color:${bm[2]};border:1px solid ${bm[3]}">${bm[0]}</span>`;
      const perluTindakLanjut=this._perluTindakLanjutIzin(p);
      const tindakLanjutBadge=perluTindakLanjut?`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(245,158,11,.14);color:#d97706;border:1px solid rgba(245,158,11,.3)">⚠️ Perlu ditinjau</span>`:'';
      const isSakitAsrama=this._isSakitAsrama(p);
      const sakitTag=isSakit?`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid rgba(245,158,11,.25)">${isSakitAsrama?'🤒 Sakit Asrama':'🤒 Sakit'}</span>`:'';
      const sakitStatusTag=(isSakitAsrama&&p.sakitStatus)?`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:${p.sakitStatus==='sembuh'?'rgba(13,181,127,.12)':'rgba(245,158,11,.12)'};color:${p.sakitStatus==='sembuh'?'var(--a1)':'#d97706'};border:1px solid ${p.sakitStatus==='sembuh'?'var(--a1)':'#d97706'}">${p.sakitStatus==='sembuh'?'✅ Sembuh':'🤒 Masih Sakit'}</span>`:'';
      // WhatsApp wali: pakai dari identitas santri (sn.waliWA)
      // Untuk sakit tidak pulang: sertakan keterangan sakit + penanganan
      const waMsg=()=>{
        let m='Assalamu\'alaikum, terkait izin '+p.tipeIzin+' ananda '+(sn?.nama||'');
        if(isSakitAsrama){
          if(p.sakitJenis)m+='\n\n🩺 Sakit: '+p.sakitJenis;
          if(p.sakitPenanganan)m+='\n💊 Penanganan: '+p.sakitPenanganan;
          if(p.sakitStatus)m+='\nStatus: '+(p.sakitStatus==='sembuh'?'✅ Sudah Sembuh':'🤒 Masih Sakit');
        }
        return m;
      };
      const waBtn=(sn.waliWA)?`<a href="https://wa.me/${sn.waliWA.replace(/\D/g,'')}?text=${encodeURIComponent(waMsg())}" target="_blank" style="width:32px;height:32px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;text-decoration:none;flex-shrink:0" title="Chat Wali">💬</a>`:'';
      // Hari terlambat badge (kalau sudah kembali tapi terlambat)
      const telatBadge=(p.sudahKembali&&p.hariTerlambat>0)?`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.22)">⏰ Terlambat ${p.hariTerlambat} hari</span>`:'';
      return`<div style="background:var(--su);border:1.5px solid ${r==='terlambat'?'rgba(239,68,68,.2)':r==='selesai'?'rgba(13,181,127,.18)':'var(--sub)'};border-radius:var(--r3);padding:11px 13px;margin-bottom:7px;backdrop-filter:blur(16px);cursor:pointer" onclick="App._detailIzin('${p.id}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;cursor:pointer" onclick="event.stopPropagation();App.nav('profil',{id:'${sn.id}',t:'${escJ(sn.nama)}'})">
            ${sn.foto?`<img src="${sn.foto}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff">${sn.nama.charAt(0)}</div>`}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:700;color:var(--t1)">${sn.nama}</span>${badge}${sakitTag}${sakitStatusTag}${telatBadge}${tindakLanjutBadge}
            </div>
            <div style="font-size:10px;color:var(--t3)">📌 ${p.tipeIzin} · 📅 ${p.tglMulai}${p.jamMulai?' '+p.jamMulai:''}${p.tglMulai!==p.tglSelesai?' s/d '+p.tglSelesai:''}${p.jamKembali?' '+p.jamKembali:''}</div>
            ${isSakitAsrama&&p.sakitJenis?`<div style="font-size:10px;color:#d97706;margin-top:2px;font-weight:600">🩺 ${esc(p.sakitJenis)}</div>`:''}
            ${isSakitAsrama&&p.sakitPenanganan?`<div style="font-size:9px;color:var(--t4);margin-top:1px">💊 ${esc(p.sakitPenanganan).slice(0,50)}${p.sakitPenanganan.length>50?'...':''}</div>`:''}
            ${p.penjemputNama?`<div style="font-size:9px;color:var(--t4);margin-top:1px">🚗 Dijemput: ${esc(p.penjemputNama)}${p.penjemputTelp?' ('+esc(p.penjemputTelp)+')':''}</div>`:''}
            ${p.alasan?`<div style="font-size:10px;color:var(--t4);margin-top:2px">${esc(p.alasan).slice(0,60)}</div>`:''}
            <div style="font-size:9px;color:var(--t4);margin-top:2px">Dicatat oleh: ${p.diajukanOleh?.nama||'-'}</div>
            ${catatanHtml(p)}
          </div>
          ${waBtn}
        </div>
        ${p.lampiran?`<div style="margin-top:8px"><img src="${p.lampiran}" style="width:60px;height:60px;border-radius:8px;object-fit:cover"></div>`:''}
        <div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap" onclick="event.stopPropagation()">
          ${(r==='sedang_izin'||r==='terlambat'||r==='terjadwal')&&!isSakit&&!isSakitAsrama?`<button class="qb" style="margin:0;padding:7px 12px;font-size:11px;flex:1" onclick="App._tandaiKembali('${p.id}')">↩️ Sudah Kembali</button>`:''}
          ${isSakitAsrama&&p.sakitStatus!=='sembuh'?`<button class="qb" style="margin:0;padding:7px 12px;font-size:11px;flex:1" onclick="App._setSakitStatus('${p.id}','sembuh')">✅ Sembuh</button>`:''}
          ${isSakitAsrama&&p.sakitStatus==='sembuh'?`<button style="flex:1;padding:7px 12px;border-radius:var(--r3);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;font-size:11px;font-weight:700;cursor:pointer" onclick="App._setSakitStatus('${p.id}','masih_sakit')">🔄 Masih Sakit</button>`:''}
          ${isSakitAsrama?`<button style="padding:7px 12px;border-radius:var(--r3);background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.25);color:#7c3aed;font-size:11px;font-weight:700;cursor:pointer" onclick="App._editPenangananSakit('${p.id}')">💊 Penanganan</button>`:''}
          ${(r==='sedang_izin'||r==='terlambat')&&!isSakitAsrama&&S._adminMode===true?`<button style="padding:7px 12px;border-radius:var(--r3);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;font-size:11px;font-weight:700;cursor:pointer" onclick="App._perpanjangIzin('${p.id}')" title="Perpanjang waktu (Admin)">⏰ Perpanjang</button>`:''}
          ${r==='selesai'&&!isSakitAsrama&&S._adminMode===true?`<button style="padding:7px 12px;border-radius:var(--r3);background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.25);color:#3b82f6;font-size:11px;font-weight:700;cursor:pointer" onclick="App._revertKembali('${p.id}')" title="Kembalikan ke sedang izin (Admin)">↩️ Kembalikan</button>`:''}
          ${p.status==='disetujui'?`<button style="padding:7px 12px;border-radius:var(--r3);background:var(--su2);border:1px solid var(--dv);font-size:11px;font-weight:600;color:var(--t2);cursor:pointer" onclick="App._cetakSuratIzin('${p.id}')">🖨️ Surat</button>`:''}
          ${S._adminMode===true?`<button style="padding:7px 12px;border-radius:var(--r3);background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;font-size:11px;font-weight:700;cursor:pointer" onclick="event.stopPropagation();App._delPerizinan('${p.id}')" title="Hapus (Admin)">🗑</button>`:''}
        </div>
      </div>`;
    };

    // Filter izin sakit (lama, perizinan-based): hanya ditampilkan di tab aktif
    // jika status masih disetujui & runtime sedang_izin — TAPI tidak ditampilkan
    // di tab Sakit (tab Sakit sekarang pakai catatanSakit store yang baru).
    const today0=_todayLocal();
    // catatanSakit-based lists (sumber utama tab Sakit)
    const sakitAktifList=(sakitAll||[]).filter(s=>s.status==='belum_sembuh').sort((a,b)=>(a.tglMulai||'').localeCompare(b.tglMulai||''));
    const sakitRiwayatList=(sakitAll||[]).filter(s=>s.status==='sembuh').sort((a,b)=>(b.sembuhAt||b.updatedAt||0)-(a.sembuhAt||a.updatedAt||0));
    // Tab Aktif: hanya santri sedang izin (KECUALI sakit perizinan lama)
    const aktifNonSakit=aktif.filter(p=>!this._isSakitIzin(p));
    // Status keberadaan santri hari ini (di pondok / tidak di pondok)
    const pondokData=await this._statusPondokHariIni();

    // Card untuk catatanSakit (store baru)
    const cardSakit=(s)=>{
      const sn=sntM[s.sntId];if(!sn)return'';
      const isAktif=s.status==='belum_sembuh';
      const hariSakit=this._hitungHariSakit(s.tglMulai);
      const statusBadge=isAktif
        ?'<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid #d97706">🤒 Belum Sembuh</span>'
        :'<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(13,181,127,.12);color:var(--a1);border:1px solid var(--a1)">✅ Sudah Sembuh</span>';
      const waMsg=()=>{
        let m='Assalamu\'alaikum, informasi kesehatan ananda '+(sn?.nama||'');
        m+='\n\n🤒 Status: '+(isAktif?'Masih Sakit':'Sudah Sembuh');
        m+='\n📅 Sakit sejak: '+s.tglMulai;
        if(isAktif)m+='\n⏱️ Hari ke-'+hariSakit;
        if(s.diagnosis)m+='\n\n🩺 Diagnosis: '+s.diagnosis;
        if(s.penanganan)m+='\n💊 Penanganan: '+s.penanganan;
        if(!isAktif&&s.sembuhAt)m+='\n\n✅ Sembuh pada: '+new Date(s.sembuhAt).toLocaleString('id-ID');
        return m;
      };
      const waBtn=(sn.waliWA)?`<a href="https://wa.me/${sn.waliWA.replace(/\D/g,'')}?text=${encodeURIComponent(waMsg())}" target="_blank" style="width:32px;height:32px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;text-decoration:none;flex-shrink:0" title="Chat Wali">💬</a>`:'';
      return`<div style="background:var(--su);border:1.5px solid ${isAktif?'rgba(245,158,11,.22)':'var(--sub)'};border-radius:var(--r3);padding:11px 13px;margin-bottom:7px;backdrop-filter:blur(16px);cursor:pointer" onclick="App._detailCatatanSakit('${s.id}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(245,158,11,.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🤒</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:700;color:var(--t1)">${sn.nama}</span>${statusBadge}
            </div>
            <div style="font-size:10px;color:var(--t3)">📅 Mulai ${s.tglMulai}${isAktif?' · ⏱️ Hari ke-'+hariSakit:''}</div>
            ${s.diagnosis?`<div style="font-size:10px;color:#d97706;margin-top:2px;font-weight:600">🩺 ${esc(s.diagnosis).slice(0,60)}${s.diagnosis.length>60?'...':''}</div>`:''}
            ${s.penanganan?`<div style="font-size:9px;color:var(--t4);margin-top:1px">💊 ${esc(s.penanganan).slice(0,50)}${s.penanganan&&s.penanganan.length>50?'...':''}</div>`:''}
            <div style="font-size:9px;color:var(--t4);margin-top:2px">Dicatat oleh: ${s.createdBy||'-'}</div>
          </div>
          ${waBtn}
        </div>
        ${s.lampiran?`<div style="margin-top:8px"><img src="${s.lampiran}" style="width:60px;height:60px;border-radius:8px;object-fit:cover"></div>`:''}
        ${!isAktif&&s.sembuhAt?`<div style="font-size:9px;color:var(--a1);margin-top:6px;font-weight:600">✅ Sembuh pada ${new Date(s.sembuhAt).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}${s.caraBerakhir?' · '+({manual:'Ditandai manual',nfc:'Via NFC tap',hadir_manual:'Via set Hadir'}[s.caraBerakhir]||''):''}</div>`:''}
      </div>`;
    };

    el.innerHTML=`<div style="padding:0 15px 15px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        ${statCard('⏰','Terlambat',terlambat.filter(p=>!this._isSakitIzin(p)).length,'aktif','#ef4444')}
        ${statCard('🚶','Sedang Izin',aktifNonSakit.length,'aktif','var(--a1)')}
        ${statCard('🤒','Sakit',sakitAktifList.length,'sakit','#d97706')}
        ${statCard('📅','Terjadwal',terjadwal.filter(p=>!this._isSakitIzin(p)).length,'aktif','#8b5cf6')}
      </div>
      <!-- Status keberadaan santri hari ini -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div onclick="App._popStatusPondok('di_pondok')" style="background:var(--su);border:1.5px solid rgba(13,181,127,.22);border-radius:var(--r3);padding:12px 10px;text-align:center;cursor:pointer;backdrop-filter:blur(16px);transition:transform .15s" onmousedown="this.style.transform='scale(.96)'" onmouseup="this.style.transform='scale(1)'">
          <div style="font-size:20px;font-weight:800;color:var(--a1)">${pondokData.diPondok.length}</div>
          <div style="font-size:9px;color:var(--t3);font-weight:700;margin-top:2px;line-height:1.3">🏠 Di Pondok</div>
        </div>
        <div onclick="App._popStatusPondok('tidak_di_pondok')" style="background:var(--su);border:1.5px solid rgba(245,158,11,.22);border-radius:var(--r3);padding:12px 10px;text-align:center;cursor:pointer;backdrop-filter:blur(16px);transition:transform .15s" onmousedown="this.style.transform='scale(.96)'" onmouseup="this.style.transform='scale(1)'">
          <div style="font-size:20px;font-weight:800;color:#f59e0b">${pondokData.tidakDiPondok.length}</div>
          <div style="font-size:9px;color:var(--t3);font-weight:700;margin-top:2px;line-height:1.3">🚶 Tidak di Pondok</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="bg2 bw" style="flex:1;margin:0" onclick="App._addIzinManual()">+ Catat Izin</button>
        <button class="bg2 bw" style="flex:1;margin:0;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none" onclick="App._addCatatanSakit()">🤒 + Catat Sakit</button>
        <button onclick="App._shareSantriHariIni()" title="Share Data Santri Hari Ini" style="width:46px;padding:0;border-radius:var(--r3);background:linear-gradient(135deg,#25d366,#1ebe5d);color:#fff;font-size:18px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(37,211,102,.3);flex-shrink:0">📤</button>
      </div>
      <div style="display:flex;justify-content:center;gap:0;margin-bottom:12px;background:var(--su2);border:1.5px solid var(--dv);border-radius:100px;padding:3px">
        <button onclick="App._iznSetTab('aktif')" style="flex:1;padding:8px 0;border-radius:100px;border:none;font-size:10px;font-weight:700;cursor:pointer;transition:all .2s;${S._iznTab==='aktif'?'background:var(--grad);color:#fff':'background:transparent;color:var(--t3)'}">Aktif (${aktifNonSakit.length})</button>
        <button onclick="App._iznSetTab('sakit')" style="flex:1;padding:8px 0;border-radius:100px;border:none;font-size:10px;font-weight:700;cursor:pointer;transition:all .2s;${S._iznTab==='sakit'?'background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff':'background:transparent;color:var(--t3)'}">Sakit (${sakitAktifList.length})</button>
        <button onclick="App._iznSetTab('rekap')" style="flex:1;padding:8px 0;border-radius:100px;border:none;font-size:10px;font-weight:700;cursor:pointer;transition:all .2s;${S._iznTab==='rekap'?'background:var(--grad);color:#fff':'background:transparent;color:var(--t3)'}">Rekap</button>
      </div>
      ${S._iznTab==='aktif'?(()=>{
        const terlambatNonSakit=terlambat.filter(p=>!this._isSakitIzin(p));
        const sedangIzinNonSakit=sedangIzin.filter(p=>!this._isSakitIzin(p));
        const terjadwalNonSakit=terjadwal.filter(p=>!this._isSakitIzin(p));
        const total=terlambatNonSakit.length+sedangIzinNonSakit.length+terjadwalNonSakit.length;
        if(!total)return'<div class="empty" style="padding:20px 0"><div class="es">Tidak ada izin aktif tercatat.</div></div>';
        let html='';
        if(terlambatNonSakit.length)html+=`<div style="font-size:10px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">⏰ Terlambat / Belum Kembali (${terlambatNonSakit.length})</div>${terlambatNonSakit.map(p=>cardIzin(p,'terlambat')).join('')}`;
        if(sedangIzinNonSakit.length)html+=`<div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin:${terlambatNonSakit.length?'14px':'0'} 0 6px">🚶 Sedang Izin (${sedangIzinNonSakit.length})</div>${sedangIzinNonSakit.map(p=>cardIzin(p,'sedang_izin')).join('')}`;
        if(terjadwalNonSakit.length)html+=`<div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin:${(terlambatNonSakit.length||sedangIzinNonSakit.length)?'14px':'0'} 0 6px">📅 Terjadwal (${terjadwalNonSakit.length})</div>${terjadwalNonSakit.map(p=>cardIzin(p,'terjadwal')).join('')}`;
        return html;
      })()
      :S._iznTab==='sakit'?(()=>{
        // Tab Sakit (baru): pakai catatanSakit store
        let html='';
        // Bagian Aktif: catatanSakit status='belum_sembuh'
        html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-family:var(--fd);font-size:13px;font-weight:800;color:#d97706">🤒 Belum Sembuh (${sakitAktifList.length})</div><button onclick="App._addCatatanSakit()" style="padding:6px 12px;border-radius:100px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;font-size:10px;font-weight:700;cursor:pointer">+ Catat Sakit</button></div>`;
        if(sakitAktifList.length){
          html+=sakitAktifList.map(s=>cardSakit(s)).join('');
        } else {
          html+='<div class="empty" style="padding:20px 0"><div class="es">Tidak ada santri yang sedang sakit. 🎉</div></div>';
        }
        // Bagian Riwayat: catatanSakit status='sembuh'
        if(sakitRiwayatList.length){
          html+=`<div style="font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1);margin:16px 0 8px">📋 Riwayat Catatan Sakit (${sakitRiwayatList.length})</div>`;
          // Hanya tampilkan 20 teratas, sisanya bisa di-load lebih lanjut kalau perlu
          html+=sakitRiwayatList.slice(0,20).map(s=>cardSakit(s)).join('');
          if(sakitRiwayatList.length>20){
            html+=`<div style="text-align:center;font-size:10px;color:var(--t3);padding:10px 0">+ ${sakitRiwayatList.length-20} riwayat lainnya</div>`;
          }
        }
        return html;
      })()
      :(await this._rekapIznHtml(per,sntM))+(riwayat.length?`<div style="margin-top:14px;font-family:var(--fd);font-size:13px;font-weight:800;color:var(--t1);margin-bottom:8px">📋 Riwayat Perizinan (${riwayat.length})</div>${riwayat.map(p=>cardIzin(p,'riwayat')).join('')}`:'<div class="empty" style="padding:20px 0"><div class="es">Belum ada riwayat perizinan.</div></div>')}
    </div>`;
  },
  _iznSetTab(tab){S._iznTab=tab;this.renderIzn();},

  async _rekapIznHtml(per,sntM){
    const jenisList=await this._jenisIzinList();
    const disetujui=per.filter(p=>p.status==='disetujui');
    const byJenis={};jenisList.forEach(j=>byJenis[j]=0);
    disetujui.forEach(p=>{byJenis[p.tipeIzin]=(byJenis[p.tipeIzin]||0)+1});
    const maxJ=Math.max(1,...Object.values(byJenis));
    const byJenisHtml=Object.entries(byJenis).map(([j,n])=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1"><div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:11px;color:var(--t2)">${j}</span><span style="font-size:10px;font-weight:700;color:var(--a1)">${n}</span></div><div style="background:var(--dv);border-radius:100px;height:4px"><div style="background:var(--grad);height:4px;border-radius:100px;width:${Math.round(n/maxJ*100)}%"></div></div></div></div>`).join('');
    const bySnt={};disetujui.forEach(p=>{bySnt[p.sntId]=(bySnt[p.sntId]||0)+1});
    const topSnt=Object.entries(bySnt).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const ditolakCount=per.filter(p=>p.status==='ditolak').length;
    return`<div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);padding:12px;margin-bottom:10px;backdrop-filter:blur(20px)">
      <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Total per Jenis Izin</div>
      ${byJenisHtml}
    </div>
    <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);padding:12px;margin-bottom:10px;backdrop-filter:blur(20px)">
      <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Santri Paling Sering Izin</div>
      ${topSnt.length?topSnt.map(([sid,n])=>{const sn=sntM[sid];return`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--dv);cursor:pointer" onclick="App.nav('profil',{id:'${sid}',t:'${escJ(sn?.nama||'-')}'})"><span style="font-size:12px;color:var(--t1);flex:1">${sn?.nama||'-'}</span><span style="font-size:11px;font-weight:700;color:#f59e0b">${n}x</span></div>`}).join(''):'<div style="font-size:11px;color:var(--t3)">Belum ada data.</div>'}
    </div>
    <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r4);padding:12px;backdrop-filter:blur(20px);display:flex;justify-content:space-around;text-align:center">
      <div><div style="font-size:16px;font-weight:800;color:var(--a1)">${disetujui.length}</div><div style="font-size:9px;color:var(--t3)">Disetujui</div></div>
      <div><div style="font-size:16px;font-weight:800;color:#ef4444">${ditolakCount}</div><div style="font-size:9px;color:var(--t3)">Ditolak</div></div>
      <div><div style="font-size:16px;font-weight:800;color:var(--t1)">${per.length}</div><div style="font-size:9px;color:var(--t3)">Total Pengajuan</div></div>
    </div>`;
  },

  _addIzinManual(){
    DB.ga('santri').then(async snt=>{
      const aktif=snt.filter(x=>x.aktif).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
      S._iznSntCache=aktif;S._iznSntPicked=null;
      const jenis=await this._jenisIzinList();
      const today=_todayLocal();
      S._iznFoto=null;
      OS(`<div class="sh">+ Catat Izin</div><div class="sb" style="padding-bottom:90px">
        <div style="background:rgba(13,181,127,.06);border:1.5px solid rgba(13,181,127,.2);border-radius:var(--r3);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--t2)">Catatan ini langsung berlaku dan diterapkan ke absensi. Santri dianggap sudah berangkat sejak dicatat, sampai ditandai "Sudah Kembali".</div>
        <div class="fg"><label class="fl">Cari Santri</label>
          <input class="fi" id="izn-snt-q" placeholder="Ketik nama santri..." autocomplete="off" oninput="App._filterIznSnt()">
          <input type="hidden" id="izn-snt-id">
          <div id="izn-snt-results" style="max-height:170px;overflow-y:auto"></div>
          <div id="izn-snt-selected" style="margin-top:6px;font-size:11px;color:var(--a1);font-weight:700"></div>
        </div>
        <div class="fg"><label class="fl">Jenis Izin</label><select class="fsel" id="izn-tipe" onchange="App._onTipeIzinChange()">${jenis.map(j=>`<option>${j}</option>`).join('')}</select></div>
        <div style="display:flex;gap:8px"><div class="fg" style="flex:1"><label class="fl">Tanggal Mulai</label><input class="fi" type="date" id="izn-mulai" value="${today}"></div>
        <div class="fg" style="flex:1"><label class="fl">Jam Mulai</label><input class="fi" type="time" id="izn-jam-mulai"></div></div>
        <div style="display:flex;gap:8px"><div class="fg" style="flex:1"><label class="fl">Tanggal Selesai</label><input class="fi" type="date" id="izn-selesai" value="${today}"></div>
        <div class="fg" style="flex:1"><label class="fl">Jam Kembali (rencana)</label><input class="fi" type="time" id="izn-jam-kembali"></div></div>
        <div class="fg"><label class="fl">Dijemput / Diantar oleh (opsional)</label><input class="fi" id="izn-penjemput" placeholder="Nama penjemput"></div>
        <div class="fg"><label class="fl">No. Telepon Penjemput (opsional)</label><input class="fi" id="izn-penjemput-telp" type="tel" placeholder="08xxxxxxxxxx"></div>
        <div class="fg"><label class="fl">Alasan / Keterangan</label><textarea class="fi" id="izn-alasan" rows="3" placeholder="Contoh: Ada acara keluarga di kampung..."></textarea></div>
        <div id="sakit-asrama-fields" style="display:none;background:rgba(245,158,11,.06);border:1.5px solid rgba(245,158,11,.22);border-radius:var(--r3);padding:12px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:8px">🤒 Field Khusus Sakit di Asrama</div>
          <div class="fg"><label class="fl">Sakit Apa? *</label><input class="fi" id="izn-sakit-jenis" placeholder="Misal: Demam, Flu, Maag, Sakit Kepala..."></div>
          <div class="fg"><label class="fl">Penanganan / Obat yang Diberikan</label><textarea class="fi" id="izn-sakit-penanganan" rows="2" placeholder="Misal: Paracetamol 500mg 3x sehari, istirahat..."></textarea></div>
        </div>
        <div class="fg"><label class="fl">Lampiran Foto (opsional)</label><button style="width:100%;padding:11px;border-radius:var(--r3);background:var(--su);border:1.5px dashed var(--dv);font-size:12px;color:var(--t3);cursor:pointer" onclick="document.getElementById('foto-inp-izin').click()">📷 Ambil / Pilih Foto</button><div id="izn-foto-preview" style="margin-top:6px"></div></div>
        <button class="bg2 bw" onclick="App._saveIzinManual()">✅ Simpan Catatan</button>
      </div>`);
    });
  },
  _onTipeIzinChange(){
    const tipe=(document.getElementById('izn-tipe')?.value||'').toLowerCase();
    const showSakit=tipe.includes('asrama')||(tipe.includes('sakit')&&!tipe.includes('pulang')&&!tipe.includes('bermalam'));
    const el=document.getElementById('sakit-asrama-fields');
    if(el)el.style.display=showSakit?'block':'none';
  },
  async _filterIznSnt(){
    const q=document.getElementById('izn-snt-q').value.trim().toLowerCase();
    const box=document.getElementById('izn-snt-results');
    if(!q){box.innerHTML='';return}
    const res=(S._iznSntCache||[]).filter(x=>x.nama.toLowerCase().includes(q)).slice(0,8);
    if(!res.length){box.innerHTML='<div style="padding:8px;font-size:11px;color:var(--t3)">Tidak ditemukan.</div>';return}
    const per=await DB.ga('perizinan');
    const ym=_todayLocal().slice(0,7);
    box.innerHTML=res.map(x=>{
      const cnt=per.filter(p=>p.sntId===x.id&&p.status==='disetujui'&&p.tglMulai.slice(0,7)===ym).length;
      return`<div style="padding:8px 6px;border-bottom:1px solid var(--dv);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="App._pickIznSnt('${x.id}','${escJ(x.nama)}','${escJ(x.kamar||'')}')">
        <span style="font-size:12px;color:var(--t1)">${x.nama} <span style="color:var(--t4)">— ${x.kamar||'-'}</span></span>
        ${cnt>0?`<span style="font-size:9px;color:#f59e0b;font-weight:700">${cnt}x bln ini</span>`:''}
      </div>`;
    }).join('');
  },
  _pickIznSnt(id,nama,kamar){
    document.getElementById('izn-snt-id').value=id;
    document.getElementById('izn-snt-q').value=nama;
    document.getElementById('izn-snt-results').innerHTML='';
    document.getElementById('izn-snt-selected').textContent=`✓ Dipilih: ${nama} — ${kamar}`;
  },
  async _onFotoIzin(inp){
    const file=inp.files[0];if(!file)return;
    T('Memproses foto...');
    try{
      const b64=await this._resizeImg(file,800);
      S._iznFoto=b64;
      const pv=document.getElementById('izn-foto-preview');
      if(pv)pv.innerHTML=`<img src="${b64}" style="width:64px;height:64px;border-radius:8px;object-fit:cover">`;
      T('✅ Foto ditambahkan!');
    }catch(e){T('❌ Gagal: '+e.message);}
  },
  async _saveIzinManual(){
    const sntId=document.getElementById('izn-snt-id').value;
    if(!sntId){T('❌ Pilih santri dulu dari hasil pencarian');return}
    const tipeIzin=document.getElementById('izn-tipe').value;
    const tglMulai=document.getElementById('izn-mulai').value;
    const tglSelesai=document.getElementById('izn-selesai').value;
    const jamMulai=document.getElementById('izn-jam-mulai').value||null;
    const jamKembali=document.getElementById('izn-jam-kembali').value||null;
    const penjemputNama=document.getElementById('izn-penjemput').value.trim()||null;
    const penjemputTelp=document.getElementById('izn-penjemput-telp').value.trim()||null;
    const alasan=document.getElementById('izn-alasan').value.trim();
    if(!tglMulai||!tglSelesai){T('❌ Tanggal wajib diisi');return}
    if(tglSelesai<tglMulai){T('❌ Tanggal selesai tidak boleh sebelum tanggal mulai');return}
    const isSakitAsrama=this._isSakitAsrama({tipeIzin});
    let sakitJenis=null,sakitPenanganan=null,sakitStatus=null;
    if(isSakitAsrama){
      sakitJenis=document.getElementById('izn-sakit-jenis')?.value.trim()||null;
      sakitPenanganan=document.getElementById('izn-sakit-penanganan')?.value.trim()||null;
      if(!sakitJenis){T('❌ Field "Sakit Apa?" wajib diisi untuk sakit di asrama');return}
      sakitStatus='masih_sakit'; // default: masih sakit, nanti bisa diupdate ke 'sembuh'
    }
    const per={id:uid(),sntId,tipeIzin,tglMulai,tglSelesai,jamMulai,jamKembali,penjemputNama,penjemputTelp,alasan,lampiran:S._iznFoto||null,
      diajukanOleh:{tipe:'musyrifah',nama:S.user?.nama||'Musyrifah'},
      status:'disetujui',disetujuiOleh:S.user?.nama||'Musyrifah',waktuKeputusan:Date.now(),catatanKeputusan:'',
      sudahKembali:false,waktuKembaliAktual:null,
      // Sakit-asrama specific
      sakitJenis,sakitPenanganan,sakitStatus,sakitSembuhAt:null,sakitSembuhOleh:null,
      createdAt:Date.now(),updatedAt:Date.now()};
    await DB.p('perizinan',per);
    const n=await this._terapkanIzinKeAbsensi(per);
    this._kirimNotifPerizinan('baru_musyrifah',per);
    CS();T(`✅ Izin disimpan!${n?' '+n+' absensi diperbarui.':''}`);
    await this.renderIzn();
  },
  // Tandai sakit tidak pulang: masih_sakit -> sembuh (atau sebaliknya)
  // Bisa diubah oleh semua musyrifah/admin (tidak hanya admin)
  async _setSakitStatus(id,newStatus){
    const per=await DB.g('perizinan',id);if(!per)return;
    per.sakitStatus=newStatus;
    if(newStatus==='sembuh'){
      per.sakitSembuhAt=Date.now();per.sakitSembuhOleh=S.user?.nama||'Musyrifah';
      per.sudahKembali=true;per.waktuKembaliAktual=Date.now();
    } else {
      per.sakitSembuhAt=null;per.sakitSembuhOleh=null;
      per.sudahKembali=false;per.waktuKembaliAktual=null;
    }
    per.updatedAt=Date.now();
    await DB.p('perizinan',per);
    T(newStatus==='sembuh'?'✅ Santri ditandai sembuh.':'🔄 Status dikembalikan ke masih sakit.');
    await this.renderIzn();
  },
  // Edit penanganan/obat untuk sakit tidak pulang (semua musyrifah/admin)
  _editPenangananSakit(id){
    DB.g('perizinan',id).then(per=>{
      if(!per)return;
      OS(`<div class="sh">💊 Edit Penanganan Sakit</div><div class="sb" style="padding-bottom:80px">
        <div class="fg"><label class="fl">Sakit Apa</label><input class="fi" id="ep-sakit-jenis" value="${esc(per.sakitJenis||'')}"></div>
        <div class="fg"><label class="fl">Penanganan / Obat yang Diberikan</label><textarea class="fi" id="ep-sakit-penanganan" rows="3" style="resize:none">${esc(per.sakitPenanganan||'')}</textarea></div>
        <button class="bg2 bw" onclick="App._savePenangananSakit('${id}')">Simpan</button>
      </div>`);
    });
  },
  async _savePenangananSakit(id){
    const per=await DB.g('perizinan',id);if(!per)return;
    per.sakitJenis=document.getElementById('ep-sakit-jenis')?.value.trim()||per.sakitJenis;
    per.sakitPenanganan=document.getElementById('ep-sakit-penanganan')?.value.trim()||per.sakitPenanganan;
    per.updatedAt=Date.now();
    await DB.p('perizinan',per);
    CS();T('✅ Penanganan disimpan!');
    await this.renderIzn();
  },
  // Batalkan pencatatan izin (mis. salah input) — bukan "menolak pengajuan",
  // hanya membatalkan catatan yang sudah dibuat. Absensi terkait dikembalikan ke alpha.
  _batalkanIzin(id){
    OS(`<div class="sh">Batalkan Catatan Izin</div><div class="sb" style="padding-bottom:80px">
      <div class="fg"><label class="fl">Alasan Pembatalan (opsional)</label><textarea class="fi" id="izn-batal-ket" rows="3" placeholder="Contoh: Salah catat / batal berangkat..."></textarea></div>
      <button class="bg2 bw" onclick="App._doBatalkanIzin('${id}')">✕ Batalkan Catatan</button>
    </div>`);
  },
  async _doBatalkanIzin(id){
    const ket=document.getElementById('izn-batal-ket')?.value.trim()||'';
    const per=await DB.g('perizinan',id);if(!per)return;
    per.status='ditolak';per.catatanKeputusan=ket;per.waktuKeputusan=Date.now();per.updatedAt=Date.now();
    await DB.p('perizinan',per);
    await this._lepasIzinDariAbsensi(per);
    this._kirimNotifPerizinan('dibatalkan',per);
    CS();T('Catatan izin dibatalkan.');
    await this.renderIzn();
  },
  async _tandaiKembali(id){
    const per=await DB.g('perizinan',id);if(!per)return;
    per.sudahKembali=true;per.waktuKembaliAktual=Date.now();per.updatedAt=Date.now();
    // Catat berapa hari terlambat berdasarkan tenggat tglSelesai+jamKembali
    per.hariTerlambat=this._hitungHariTerlambat(per);
    await DB.p('perizinan',per);
    T(per.hariTerlambat>0?`✅ Ditandai sudah kembali. Terlambat ${per.hariTerlambat} hari.`:'✅ Ditandai sudah kembali tepat waktu.');
    await this.renderIzn();
  },
  // Admin: perpanjang waktu perizinan (ubah tglSelesai / jamKembali)
  _perpanjangIzin(id){
    if(!_needAdmin())return;
    DB.g('perizinan',id).then(per=>{
      if(!per)return;
      OS(`<div class="sh">⏰ Perpanjang Waktu Izin</div><div class="sb" style="padding-bottom:80px">
        <div style="background:rgba(245,158,11,.08);border:1.5px solid rgba(245,158,11,.25);border-radius:var(--r3);padding:10px 12px;margin-bottom:14px;font-size:11px;color:#d97706">Santri terlambat kembali. Perpanjang tenggat izin agar status kembali normal.</div>
        <div class="fg"><label class="fl">Tanggal Selesai Baru</label><input class="fi" type="date" id="ext-selesai" value="${per.tglSelesai}"></div>
        <div class="fg"><label class="fl">Jam Kembali Baru (rencana)</label><input class="fi" type="time" id="ext-jam" value="${per.jamKembali||''}"></div>
        <button class="bg2 bw" onclick="App._savePerpanjangIzin('${id}')">Simpan Perpanjangan</button>
      </div>`);
    });
  },
  async _savePerpanjangIzin(id){
    if(!_needAdmin())return;
    const per=await DB.g('perizinan',id);if(!per)return;
    const tglSelesai=document.getElementById('ext-selesai')?.value;
    const jamKembali=document.getElementById('ext-jam')?.value||null;
    if(!tglSelesai){T('❌ Tanggal selesai wajib');return}
    if(tglSelesai<per.tglMulai){T('❌ Tidak boleh sebelum tanggal mulai');return}
    per.tglSelesai=tglSelesai;per.jamKembali=jamKembali;per.updatedAt=Date.now();
    per.perpanjanganAt=Date.now();per.perpanjanganOleh=S.user?.nama||'Admin';
    await DB.p('perizinan',per);
    CS();T('✅ Waktu izin diperpanjang!');
    await this.renderIzn();
  },
  // Admin: kembalikan dari "sudah kembali" ke "sedang izin"
  async _revertKembali(id){
    if(!_needAdmin())return;
    const per=await DB.g('perizinan',id);if(!per)return;
    per.sudahKembali=false;per.waktuKembaliAktual=null;per.updatedAt=Date.now();
    // Reset hariTerlambat supaya dihitung ulang nanti kalau telat lagi
    per.hariTerlambat=0;
    await DB.p('perizinan',per);
    T('✅ Status dikembalikan ke "Sedang Izin".');
    await this.renderIzn();
  },
  // Admin: hapus riwayat perizinan/sakit secara permanen
  _delPerizinan(id){
    if(!_needAdmin())return;
    OS(`<div class="cw"><div class="ci3">🗑️</div><div class="ct3">Hapus riwayat perizinan ini?</div><div class="cs3">Data perizinan (termasuk keterangan sakit, penanganan, lampiran) akan dihapus permanen. Tidak bisa dibatalkan.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="App._doDelPerizinan('${id}')">Hapus</button></div></div>`);
  },
  async _doDelPerizinan(id){
    if(!_needAdmin())return;
    const per=await DB.g('perizinan',id);
    if(!per){CS();return}
    // Lepas absensi yang terkait (kembalikan ke alpha) kalau izin pernah disetujui
    if(per.status==='disetujui')await this._lepasIzinDariAbsensi(per);
    await DB.d('perizinan',id);
    CS();T('✅ Riwayat perizinan dihapus!');
    await this.renderIzn();
  },
  // Popup detail perizinan (saat card diklik)
  async _detailIzin(id){
    const per=await DB.g('perizinan',id);if(!per)return;
    const sn=await DB.g('santri',per.sntId);
    const r=this._statusRuntimeIzin(per);
    const badgeMap={
      sedang_izin:['🚶 Sedang Izin','var(--a1)'],terlambat:['⏰ Terlambat','#ef4444'],
      selesai:['✅ Selesai','var(--a1)'],ditolak:['✕ Dibatalkan','#ef4444'],terjadwal:['📅 Terjadwal','#8b5cf6'],
    };
    const bm=badgeMap[r]||badgeMap.sedang_izin;
    const isSakit=this._isSakitIzin(per);
    const isSakitAsrama=this._isSakitAsrama(per);
    // WhatsApp wali: pakai dari identitas santri (sn.waliWA)
    // Untuk sakit tidak pulang: sertakan keterangan sakit + penanganan
    const waMsgDetail=()=>{
      let m='Assalamu\'alaikum, terkait izin '+per.tipeIzin+' ananda '+(sn?.nama||'');
      if(isSakitAsrama){
        if(per.sakitJenis)m+='\n\n🩺 Sakit: '+per.sakitJenis;
        if(per.sakitPenanganan)m+='\n💊 Penanganan: '+per.sakitPenanganan;
        if(per.sakitStatus)m+='\nStatus: '+(per.sakitStatus==='sembuh'?'✅ Sudah Sembuh':'🤒 Masih Sakit');
      }
      return m;
    };
    const waBtn=(sn&&sn.waliWA)?`<a href="https://wa.me/${sn.waliWA.replace(/\D/g,'')}?text=${encodeURIComponent(waMsgDetail())}" target="_blank" style="flex:1;padding:11px;border-radius:var(--r3);background:#25d366;color:#fff;font-size:12px;font-weight:700;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px">💬 WA Wali</a>`:'<div style="flex:1;padding:11px;border-radius:var(--r3);background:var(--su2);border:1px solid var(--dv);font-size:11px;color:var(--t3);text-align:center">📵 No. WA wali belum diisi</div>';
    // Status sakit badge untuk sakit asrama
    const sakitStatusBadge=isSakitAsrama?(per.sakitStatus==='sembuh'
      ?'<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(13,181,127,.12);color:var(--a1);border:1px solid var(--a1)">✅ Sembuh</span>'
      :'<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid #d97706">🤒 Masih Sakit</span>'):'';
    OS(`<div class="sh">📋 Detail Perizinan</div><div class="sb" style="padding-bottom:90px">
      <div style="text-align:center;margin-bottom:14px">
        <div style="width:60px;height:60px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;margin:0 auto 8px">${(sn?.nama||'?').charAt(0)}</div>
        <div style="font-family:var(--fd);font-size:15px;font-weight:800;color:var(--t1)">${sn?.nama||'-'}</div>
        ${sn?.kamar?`<div style="font-size:11px;color:var(--t3);margin-top:2px">🏠 ${esc(sn.kamar)}</div>`:''}
        <div style="margin-top:6px;display:flex;justify-content:center;gap:5px;flex-wrap:wrap"><span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:100px;background:rgba(245,158,11,.12);color:${bm[1]};border:1px solid ${bm[1]}">${bm[0]}</span>${sakitStatusBadge}</div>
      </div>
      <div style="background:var(--su);border:1px solid var(--sub);border-radius:var(--r3);padding:12px;margin-bottom:10px;backdrop-filter:blur(20px)">
        <div class="info-row"><div class="info-icon">${isSakit?'🤒':'📋'}</div><div><div class="info-lbl">Jenis Izin</div><div class="info-val">${esc(per.tipeIzin)}${isSakit?' <span style="font-size:9px;background:rgba(245,158,11,.12);color:#d97706;padding:2px 6px;border-radius:100px;margin-left:4px">Sakit</span>':''}</div></div></div>
        <div class="info-row"><div class="info-icon">📅</div><div><div class="info-lbl">Tanggal Mulai</div><div class="info-val">${per.tglMulai}${per.jamMulai?' '+per.jamMulai:''}</div></div></div>
        <div class="info-row"><div class="info-icon">📆</div><div><div class="info-lbl">Tanggal Selesai</div><div class="info-val">${per.tglSelesai}${per.jamKembali?' '+per.jamKembali:''}</div></div></div>
        ${isSakitAsrama&&per.sakitJenis?`<div class="info-row"><div class="info-icon">🩺</div><div><div class="info-lbl">Sakit Apa</div><div class="info-val" style="font-weight:700;color:#d97706">${esc(per.sakitJenis)}</div></div></div>`:''}
        ${isSakitAsrama&&per.sakitPenanganan?`<div class="info-row"><div class="info-icon">💊</div><div><div class="info-lbl">Penanganan / Obat</div><div class="info-val" style="font-size:12px;line-height:1.5">${esc(per.sakitPenanganan)}</div></div></div>`:''}
        ${isSakitAsrama&&per.sakitSembuhAt?`<div class="info-row"><div class="info-icon">✅</div><div><div class="info-lbl">Sembuh Pada</div><div class="info-val">${new Date(per.sakitSembuhAt).toLocaleString('id-ID')} oleh ${esc(per.sakitSembuhOleh||'-')}</div></div></div>`:''}
        ${per.penjemputNama?`<div class="info-row"><div class="info-icon">🚗</div><div><div class="info-lbl">Dijemput / Diantar</div><div class="info-val">${esc(per.penjemputNama)}${per.penjemputTelp?' ('+esc(per.penjemputTelp)+')':''}</div></div></div>`:''}
        ${per.alasan?`<div class="info-row"><div class="info-icon">📝</div><div><div class="info-lbl">Alasan</div><div class="info-val" style="font-size:12px;line-height:1.5">${esc(per.alasan)}</div></div></div>`:''}
        <div class="info-row"><div class="info-icon">👤</div><div><div class="info-lbl">Dicatat oleh</div><div class="info-val">${esc(per.diajukanOleh?.nama||'-')}</div></div></div>
        ${per.status==='ditolak'?`<div class="info-row"><div class="info-icon">✕</div><div><div class="info-lbl">Dibatalkan pada</div><div class="info-val">${per.waktuKeputusan?new Date(per.waktuKeputusan).toLocaleString('id-ID'):'-'}</div></div></div>`:''}
        ${per.catatanKeputusan?`<div class="info-row"><div class="info-icon">💬</div><div><div class="info-lbl">Catatan</div><div class="info-val" style="font-size:12px;line-height:1.5">${esc(per.catatanKeputusan)}</div></div></div>`:''}
        ${per.sudahKembali&&!isSakitAsrama?`<div class="info-row"><div class="info-icon">↩️</div><div><div class="info-lbl">Kembali Aktual</div><div class="info-val">${per.waktuKembaliAktual?new Date(per.waktuKembaliAktual).toLocaleString('id-ID'):'-'}${per.hariTerlambat>0?` <span style="color:#ef4444;font-weight:700">· Terlambat ${per.hariTerlambat} hari</span>`:''}</div></div></div>`:''}
        ${per.perpanjanganAt?`<div class="info-row"><div class="info-icon">⏰</div><div><div class="info-lbl">Diperpanjang</div><div class="info-val">${new Date(per.perpanjanganAt).toLocaleString('id-ID')} oleh ${esc(per.perpanjanganOleh||'-')}</div></div></div>`:''}
        ${isSakit?`<div class="info-row"><div class="info-icon">📊</div><div><div class="info-lbl">Durasi Sakit</div><div class="info-val">${this._hitungDurasiSakit(per)} hari</div></div></div>`:''}
      </div>
      ${per.lampiran?`<div style="margin-bottom:10px;text-align:center"><img src="${per.lampiran}" style="max-width:100%;max-height:240px;border-radius:var(--r3);object-fit:cover" onclick="App._viewFotoCat('${per.lampiran}')"></div>`:''}
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:6px">
        ${waBtn}
        ${(r==='sedang_izin'||r==='terlambat'||r==='terjadwal')&&!isSakit&&!isSakitAsrama?`<button class="qb" style="margin:0;padding:11px;flex:1;font-size:12px" onclick="CS();App._tandaiKembali('${per.id}')">↩️ Sudah Kembali</button>`:''}
        ${isSakitAsrama&&per.sakitStatus!=='sembuh'?`<button class="qb" style="margin:0;padding:11px;flex:1;font-size:12px;background:linear-gradient(135deg,#12c290,#0f9d72)" onclick="CS();App._setSakitStatus('${per.id}','sembuh')">✅ Tandai Sembuh</button>`:''}
        ${isSakitAsrama&&per.sakitStatus==='sembuh'?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;font-size:12px;font-weight:700;cursor:pointer" onclick="CS();App._setSakitStatus('${per.id}','masih_sakit')">🔄 Kembalikan ke Masih Sakit</button>`:''}
        ${isSakitAsrama?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.25);color:#7c3aed;font-size:12px;font-weight:700;cursor:pointer" onclick="App._editPenangananSakit('${per.id}')">💊 Edit Penanganan</button>`:''}
        ${(r==='sedang_izin'||r==='terlambat')&&!isSakitAsrama&&S._adminMode===true?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;font-size:12px;font-weight:700;cursor:pointer" onclick="CS();App._perpanjangIzin('${per.id}')">⏰ Perpanjang</button>`:''}
        ${r==='selesai'&&!isSakitAsrama&&S._adminMode===true?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.25);color:#3b82f6;font-size:12px;font-weight:700;cursor:pointer" onclick="CS();App._revertKembali('${per.id}')">↩️ Kembalikan ke Sedang Izin</button>`:''}
        ${per.status==='disetujui'?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:var(--su2);border:1px solid var(--dv);font-size:12px;font-weight:600;color:var(--t2);cursor:pointer" onclick="App._cetakSuratIzin('${per.id}')">🖨️ Cetak Surat</button>`:''}
        ${per.status==='disetujui'?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.18);color:#ef4444;font-size:12px;font-weight:700;cursor:pointer" onclick="App._batalkanIzin('${per.id}')">✕ Batalkan Catatan</button>`:''}
        ${S._adminMode===true?`<button style="flex:1;padding:11px;border-radius:var(--r3);background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;font-size:12px;font-weight:700;cursor:pointer" onclick="CS();App._delPerizinan('${per.id}')" title="Hapus (Admin)">🗑 Hapus</button>`:''}
      </div>
    </div>`);
  },
  async _cetakSuratIzin(id){
    const per=await DB.g('perizinan',id);if(!per)return;
    const sn=await DB.g('santri',per.sntId);
    const asrama=(await DB.g('settings','asrama'))?.value||'Assalam';
    if(typeof window.jspdf==='undefined'){T('❌ Modul PDF belum siap, coba lagi sebentar.');return}
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a5'});
    doc.setFont('helvetica','bold');doc.setFontSize(14);
    doc.text('SURAT IZIN SANTRI',74,18,{align:'center'});
    doc.setFontSize(10);doc.setFont('helvetica','normal');
    doc.text('Pondok Pesantren / Asrama '+asrama,74,24,{align:'center'});
    doc.line(10,28,138,28);
    let y=38;const line=(l,v)=>{doc.setFont('helvetica','bold');doc.text(l,12,y);doc.setFont('helvetica','normal');doc.text(': '+v,50,y);y+=8;};
    line('Nama Santri',sn?.nama||'-');
    line('Kamar',sn?.kamar||'-');
    line('Jenis Izin',per.tipeIzin);
    line('Tanggal',per.tglMulai+(per.jamMulai?' '+per.jamMulai:'')+(per.tglMulai!==per.tglSelesai?' s/d '+per.tglSelesai:'')+(per.jamKembali?' '+per.jamKembali:''));
    if(per.penjemputNama)line('Dijemput oleh',per.penjemputNama+(per.penjemputTelp?' ('+per.penjemputTelp+')':''));
    line('Alasan',per.alasan||'-');
    line('Disetujui oleh',per.disetujuiOleh||'-');
    if(per.catatanKeputusan)line('Catatan',per.catatanKeputusan);
    y+=10;
    doc.text('Harap dijaga baik-baik dan ditunjukkan saat kembali ke asrama.',12,y);
    y+=20;
    doc.text('Musyrifah/Musyrif,',100,y);y+=20;
    doc.text('( '+(per.disetujuiOleh||'________________')+' )',90,y);
    doc.save(`Surat-Izin-${(sn?.nama||'santri').replace(/\s+/g,'-')}-${per.tglMulai}.pdf`);
  },

  // Notifikasi push (FCM). Memanggil serverless function /api/send-notif.
  // Lihat firebase-messaging-sw.js & api/send-notif.js untuk setup lengkap.
  async _kirimNotifPerizinan(tipe,per){
    try{
      const sn=await DB.g('santri',per.sntId);
      const payloads={
        baru_musyrifah:{title:'📋 Izin Baru Dicatat',body:`Izin ${per.tipeIzin} untuk ${sn?.nama||'santri'} telah dicatat`,target:'musyrifah'},
        dibatalkan:{title:'✕ Catatan Izin Dibatalkan',body:`Catatan izin ${per.tipeIzin} untuk ${sn?.nama||'santri'} dibatalkan`,target:'wali',sntId:per.sntId},
        telat_kembali:{title:'⏰ Santri Terlambat Kembali',body:`${sn?.nama||'Santri'} belum kembali dari izin ${per.tipeIzin} (tenggat sudah lewat)`,target:'musyrifah'},
      };
      const p=payloads[tipe];if(!p)return;
      await fetch('/api/send-notif',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ns:_fbNs(),...p})});
    }catch(e){console.warn('[Notif] gagal kirim (offline/belum dikonfigurasi):',e);}
  },

  // Kelola daftar jenis izin (bisa ditambah/edit/dihapus tanpa ubah kode)
  async _kelolaJenisIzin(){
    const jenis=await this._jenisIzinList();
    OS(`<div class="sh">Kelola Jenis Izin</div><div class="sb" style="padding-bottom:90px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Klik nama jenis izin untuk mengedit. Klik ✕ untuk menghapus.</div>
      <div id="jenis-izin-list">${jenis.map((j,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dv)"><button style="flex:1;text-align:left;background:none;border:none;font-size:12px;color:var(--t1);cursor:pointer;padding:4px 6px;border-radius:var(--r1)" onclick="App._editJenisIzin(${i})" title="Klik untuk edit">${j}</button><button style="width:26px;height:26px;border-radius:50%;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;font-size:11px;cursor:pointer;flex-shrink:0" onclick="App._delJenisIzin(${i})">✕</button></div>`).join('')}</div>
      <div class="fg" style="margin-top:12px"><label class="fl">Jenis Izin Baru</label><input class="fi" id="jenis-izin-baru" placeholder="Misal: Izin Berobat"></div>
      <button class="bg2 bw" onclick="App._addJenisIzin()">+ Tambah Jenis</button>
    </div>`);
  },
  async _addJenisIzin(){
    const v=document.getElementById('jenis-izin-baru')?.value.trim();if(!v)return;
    const jenis=await this._jenisIzinList();
    if(jenis.includes(v)){T('Sudah ada.');return}
    jenis.push(v);await DB.p('settings',{id:'jenisIzin',value:jenis});
    T('✅ Ditambahkan!');this._kelolaJenisIzin();
  },
  async _editJenisIzin(idx){
    const jenis=await this._jenisIzinList();
    const cur=jenis[idx];if(cur===undefined)return;
    OS(`<div class="sh">Edit Jenis Izin</div><div class="sb" style="padding-bottom:80px">
      <div class="fg"><label class="fl">Nama Jenis Izin</label><input class="fi" id="jenis-izin-edit" value="${esc(cur)}"></div>
      <button class="bg2 bw" onclick="App._saveEditJenisIzin(${idx})">Simpan Perubahan</button>
    </div>`);
  },
  async _saveEditJenisIzin(idx){
    const v=document.getElementById('jenis-izin-edit')?.value.trim();
    if(!v){T('❌ Nama tidak boleh kosong');return}
    const jenis=await this._jenisIzinList();
    if(idx<0||idx>=jenis.length){T('❌ Index tidak valid');return}
    // Cek duplikat (kecuali dirinya sendiri)
    if(jenis.some((j,i)=>i!==idx&&j.toLowerCase()===v.toLowerCase())){T('⚠️ Nama sudah ada.');return}
    // Update semua perizinan yang memakai nama lama agar tetap konsisten
    const oldVal=jenis[idx];
    jenis[idx]=v;await DB.p('settings',{id:'jenisIzin',value:jenis});
    const per=await DB.ga('perizinan');
    for(const p of per){if(p.tipeIzin===oldVal){p.tipeIzin=v;p.updatedAt=Date.now();await DB.p('perizinan',p);}}
    T('✅ Diperbarui!');this._kelolaJenisIzin();
  },
  async _delJenisIzin(idx){
    if(!_needAdmin())return;
    const jenis=await this._jenisIzinList();
    jenis.splice(idx,1);await DB.p('settings',{id:'jenisIzin',value:jenis});
    this._kelolaJenisIzin();
  },
  // Dipanggil tiap buka dashboard — kirim reminder max 1x/hari per izin biar tidak spam
  async _cekReminderTelatIzin(){
    try{
      const today=_todayLocal();const nowT=_nowTimeLocal();
      const per=await DB.ga('perizinan');
      const telat=per.filter(p=>this._isTerlambat(p,today,nowT));
      for(const p of telat){
        const key='reminderSent_'+p.id+'_'+today;
        if(localStorage.getItem(key))continue;
        localStorage.setItem(key,'1');
        this._kirimNotifPerizinan('telat_kembali',p);
      }
    }catch(e){}
  },
  };

const Tmpl={
  async apply(){
    const [tmpl,kg,ses,snt]=await Promise.all([DB.g('settings','tmpl'),DB.ga('kegiatan'),DB.ga('sesi'),DB.ga('santri')]);
    const ids=tmpl?.kgIds||['k1','k4','k5','k6','k7'];
    const dow=new Date().getDay();const kh=await DB.g('settings','tmplk_'+dow);
    const allIds=[...new Set([...ids,...(kh?.kgIds||[])])];
    const today=_todayLocal();const aktif=snt.filter(x=>x.aktif);
    const izinMap=await App._izinAktifMap(today);
    const sakitMap=await App._sakitAktifMap(today);
    let n=0;
    for(const id of allIds){
      const k=kg.find(x=>x.id===id);if(!k||!k.aktif)continue;
      const sid='ses_'+today+'_'+id;if(ses.find(x=>x.id===sid))continue;
      await DB.p('sesi',{id:sid,tanggal:today,kgId:id,skId:null,status:'draft',createdAt:Date.now(),locked:false});
      for(const s of aktif){
        const _st=sakitMap[s.id]?'sakit':(izinMap[s.id]?'izin':'none');
        const _pid=izinMap[s.id]||null;
        const _oleh=sakitMap[s.id]?'Sistem (Catatan Sakit)':(izinMap[s.id]?'Sistem (Perizinan)':'-');
        await DB.p('absensi',{id:absDetId(sid,s.id),sesiId:sid,sntId:s.id,status:_st,perizinanId:_pid,oleh:_oleh,updatedAt:Date.now()});
      }
      n++;
    }
    return n;
  },
  async show(){
    const [kg,tmpl]=await Promise.all([DB.ga('kegiatan'),DB.g('settings','tmpl')]);
    const ids=tmpl?.kgIds||[];const aktif=kg.filter(x=>x.aktif).sort((a,b)=>a.urutan-b.urutan);
    this._p=[...ids];
    OS(`<div class="sh">Template Harian</div><div class="sb" style="padding-bottom:70px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Pilih kegiatan otomatis setiap hari.</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        ${aktif.map(k=>`<div style="display:flex;align-items:center;gap:9px;padding:11px;background:var(--su);border:1.5px solid ${ids.includes(k.id)?'var(--a1)':'var(--dv)'};border-radius:var(--r4);cursor:pointer;transition:all .2s" id="tm-${k.id}" onclick="Tmpl._tog('${k.id}',this)">
          <div style="font-size:18px">${k.icon}</div>
          <div style="flex:1;font-weight:600;font-size:13px;color:var(--t1)">${k.nama}</div>
          <div style="width:20px;height:20px;border-radius:50%;background:${ids.includes(k.id)?'var(--a1)':'var(--dv)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;transition:all .2s" id="tc-${k.id}">${ids.includes(k.id)?'\u2713':''}</div>
        </div>`).join('')}
      </div>
      <button class="bg2 bw" onclick="Tmpl._save()">Simpan & Terapkan</button>
    </div>`);
  },
  _p:[],
  _tog(id,el){const i=this._p.indexOf(id);const on=i<0;on?this._p.push(id):this._p.splice(i,1);el.style.borderColor=on?'var(--a1)':'var(--dv)';const c=document.getElementById('tc-'+id);if(c){c.style.background=on?'var(--a1)':'var(--dv)';c.textContent=on?'\u2713':''}},
  async _save(){await DB.p('settings',{id:'tmpl',kgIds:this._p});const n=await this.apply();CS();T(n>0?`\u2705 ${n} sesi dibuat!`:'Template disimpan.');await App.dash()},
  async showKhusus(){
    const kg=await DB.ga('kegiatan');const aktif=kg.filter(x=>x.aktif).sort((a,b)=>a.urutan-b.urutan);
    const dn=['Ahad','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    this._kh={};for(let d=0;d<7;d++){const t=await DB.g('settings','tmplk_'+d);this._kh[d]=t?.kgIds||[]}
    OS(`<div class="sh">Template Hari Khusus</div><div class="sb" style="padding-bottom:70px">
      ${Array.from({length:7},(_,d)=>`<div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--t3);margin-bottom:5px">${dn[d]}</div>
        <div class="kw">${aktif.map(k=>`<div class="kc${(this._kh[d]||[]).includes(k.id)?' on':''}" id="tk${d}-${k.id}" onclick="Tmpl._togKh(${d},'${k.id}',this)">${k.icon} ${k.nama}</div>`).join('')}</div>
      </div>`).join('')}
      <button class="bg2 bw" onclick="Tmpl._saveKh()">Simpan</button>
    </div>`);
  },
  _kh:{},
  _togKh(d,id,el){if(!this._kh[d])this._kh[d]=[];const i=this._kh[d].indexOf(id);i>=0?(this._kh[d].splice(i,1),el.classList.remove('on')):(this._kh[d].push(id),el.classList.add('on'))},
  async _saveKh(){for(let d=0;d<7;d++)await DB.p('settings',{id:'tmplk_'+d,kgIds:this._kh[d]||[]});CS();T('\u2705 Template hari khusus disimpan!')},
};


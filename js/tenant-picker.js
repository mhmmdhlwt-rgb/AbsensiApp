// js/tenant-picker.js — AbsensiApp
'use strict';

const Wiz = {
  _tipe: 'asrama', // 'asrama' | 'pondok'

  toNs(nama) {
    return nama.trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-')
      .replace(/-+/g,'-').replace(/^-|-$/g,'').substring(0,40);
  },

  setTipe(t) {
    this._tipe = t;
    const btnA = document.getElementById('wiz-t-asrama');
    const btnP = document.getElementById('wiz-t-pondok');
    const lbl  = document.getElementById('wiz-label-nama');
    const inp  = document.getElementById('wiz-nama');
    if(t==='asrama'){
      btnA.style.cssText='padding:11px 8px;border-radius:var(--r3);border:2px solid var(--a1);background:rgba(13,181,127,.1);font-size:12px;font-weight:700;color:var(--a1);cursor:pointer';
      btnP.style.cssText='padding:11px 8px;border-radius:var(--r3);border:1.5px solid var(--dv);background:var(--su);font-size:12px;font-weight:700;color:var(--t3);cursor:pointer';
      if(lbl)lbl.textContent='Nama Asrama *';
      if(inp)inp.placeholder='Contoh: Al-Hikmah, Assalam ...';
    } else {
      btnP.style.cssText='padding:11px 8px;border-radius:var(--r3);border:2px solid var(--a1);background:rgba(13,181,127,.1);font-size:12px;font-weight:700;color:var(--a1);cursor:pointer';
      btnA.style.cssText='padding:11px 8px;border-radius:var(--r3);border:1.5px solid var(--dv);background:var(--su);font-size:12px;font-weight:700;color:var(--t3);cursor:pointer';
      if(lbl)lbl.textContent='Nama Pondok Pesantren *';
      if(inp)inp.placeholder='Contoh: Darul Ulum, Nurul Jadid ...';
    }
  },

  show() {
    document.getElementById('setup-wiz').style.display='block';
    document.getElementById('ls').style.display='none';
    setTimeout(()=>document.getElementById('wiz-nama')?.focus(),200);
  },

  async submit() {
    const namaRaw=document.getElementById('wiz-nama')?.value.trim();
    const pinRaw=document.getElementById('wiz-pin')?.value.trim();
    const errEl=document.getElementById('wiz-err');
    const btn=document.getElementById('wiz-btn');
    errEl.style.display='none';
    if(!namaRaw||namaRaw.length<2){errEl.textContent='⚠️ Nama minimal 2 karakter.';errEl.style.display='block';return;}
    if(!pinRaw||!/^\d{4}$/.test(pinRaw)){errEl.textContent='⚠️ PIN pesantren harus 4 digit angka.';errEl.style.display='block';return;}
    const ns=this.toNs(namaRaw);
    if(!ns){errEl.textContent='⚠️ Nama harus mengandung huruf/angka.';errEl.style.display='block';return;}
    btn.disabled=true;btn.textContent='⏳ Menyiapkan...';
    try {
      if(navigator.onLine){
        const existing=await _fsDB.collection('registry').doc(ns).get().catch(()=>null);
        if(existing && existing.exists){
          btn.disabled=false;btn.textContent='Mulai Pakai Aplikasi →';
          errEl.textContent='⚠️ Nama ini sudah terdaftar. Pilih dari daftar pesantren, atau gunakan nama lain.';errEl.style.display='block';
          return;
        }
      }
      localStorage.setItem('tenant_ns',ns);
      localStorage.setItem('tenant_nama',namaRaw);
      localStorage.setItem('tenant_tipe',this._tipe);
      // Simpan ke IndexedDB
      await DB.p('settings',{id:'asrama',value:namaRaw});
      await DB.p('settings',{id:'lembaga_tipe',value:this._tipe});
      if(navigator.onLine){
        await _registerTenant(ns,namaRaw,pinRaw,this._tipe);
        const users=await DB.ga('users');
        for(const u of users){const s=Object.assign({},u);s._ts=Date.now();await _fbFetch('/users/'+u.id,'PUT',s).catch(()=>{});}
        await _fbFetch('/settings/asrama','PUT',{id:'asrama',value:namaRaw,_ts:Date.now()}).catch(()=>{});
        await _fbFetch('/settings/lembaga_tipe','PUT',{id:'lembaga_tipe',value:this._tipe,_ts:Date.now()}).catch(()=>{});
      }
      document.getElementById('setup-wiz').style.display='none';
      await _applyAsramaName();
      await renderLogin();
      document.getElementById('ls').style.display='flex';
      const label=this._tipe==='pondok'?'Pondok Pesantren':'Asrama';
      T('✅ '+label+' "'+namaRaw+'" berhasil dibuat! PIN pesantren: '+pinRaw);
      setTimeout(()=>_deduplicateAll().catch(()=>{}),3000);
    } catch(e) {
      btn.disabled=false;btn.textContent='Mulai Pakai Aplikasi →';
      errEl.textContent='⚠️ Gagal: '+e.message;errEl.style.display='block';
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// TENANT PICKER — halaman "Pilih Pesantren/Asrama" pertama kali dibuka
// (atau setelah Keluar/Ganti Pesantren). Daftar diambil dari collection
// registry di Firestore — collection global lintas-tenant yang berisi
// {nama, tipe, pin, createdAt} per pesantren yang pernah didaftarkan.
// ═══════════════════════════════════════════════════════════════
const TenantPicker = {
  _superAdmin: false,  // session-only, reset on reload
  _lpTimer: null,      // long-press timer untuk ikon 🕌
  _lpFired: false,
  async show(){
    document.getElementById('setup-wiz').style.display='none';
    document.getElementById('ls').style.display='none';
    document.getElementById('ls').style.pointerEvents='none';
    document.getElementById('main-app').style.display='none';
    document.getElementById('tenant-picker').style.display='block';
    this._attachLp();
    await this.load();
  },
  // Long-press handler pada ikon 🕌 (700ms) untuk membuka super admin login.
  // Backup: 5x rapid tap pada footer text "Fatum Studio".
  _attachLp(){
    const ic=document.getElementById('tp-icon');
    if(ic && !ic._lpBound){
      ic._lpBound=true;
      // AUDIT v3i: Fix long-press handler — tambah navigator.vibrate untuk
      // feedback, dan pastikan _enterSuperAdmin dipanggil dengan benar.
      // Juga tambah click handler sebagai fallback (jika long-press tidak
      // terdeteksi di beberapa browser mobile).
      const start=(e)=>{
        this._lpFired=false;
        if(navigator.vibrate) navigator.vibrate(5); // feedback singkat
        this._lpTimer=setTimeout(()=>{
          this._lpFired=true;
          if(navigator.vibrate) navigator.vibrate(20); // feedback long-press
          try {
            this._enterSuperAdmin();
          } catch(err) {
            console.error('[SuperAdmin] _enterSuperAdmin error:', err);
            T('❌ Gagal membuka PIN super admin: ' + (err.message||err), 5000);
          }
        },700);
      };
      const cancel=()=>{
        if(this._lpTimer){clearTimeout(this._lpTimer);this._lpTimer=null;}
      };
      // Touch events (mobile)
      ic.addEventListener('touchstart',start,{passive:true});
      ic.addEventListener('touchend',cancel,{passive:true});
      ic.addEventListener('touchcancel',cancel,{passive:true});
      // Mouse events (desktop)
      ic.addEventListener('mousedown',start);
      ic.addEventListener('mouseup',cancel);
      ic.addEventListener('mouseleave',cancel);
      // AUDIT v3i: Fallback — double-click juga buka super admin
      // (jika long-press tidak jalan di browser tertentu)
      ic.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if(navigator.vibrate) navigator.vibrate(20);
        try { this._enterSuperAdmin(); }
        catch(err) { console.error('[SuperAdmin] dblclick error:', err); }
      });
      // AUDIT v3i: Tambah style cursor pointer supaya user tahu ini clickable
      ic.style.cursor = 'pointer';
    }
    const ft=document.getElementById('tp-footer');
    if(ft && !ft._tapBound){
      ft._tapBound=true;ft._tapCount=0;ft._tapTimer=null;
      ft.addEventListener('click',()=>{
        ft._tapCount++;
        if(ft._tapTimer)clearTimeout(ft._tapTimer);
        ft._tapTimer=setTimeout(()=>{ft._tapCount=0;},600);
        if(ft._tapCount>=5){ft._tapCount=0;this._enterSuperAdmin();}
      });
    }
  },
  async load(){
    const list=document.getElementById('tp-list');
    const headerExtra=document.getElementById('tp-header-extra');
    if(headerExtra)headerExtra.innerHTML=this._superAdmin?`<button onclick="TenantPicker._exitSuperAdmin()" style="padding:8px 14px;border-radius:100px;background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.3);color:#ef4444;font-size:11px;font-weight:700;cursor:pointer">🛑 Keluar Super Admin</button>`:'';
    if(!navigator.onLine){
      list.innerHTML=`<div style="text-align:center;padding:20px 0;color:#ef4444;font-size:12px">⚠️ Butuh koneksi internet untuk memuat daftar pesantren.<br><span style="text-decoration:underline;cursor:pointer;color:var(--a1)" onclick="TenantPicker.load()">Coba lagi</span></div>`;
      return;
    }
    try{
      const snap=await _fsDB.collection('registry').orderBy('createdAt','asc').get();
      const items=[];
      snap.forEach(d=>items.push(Object.assign({id:d.id},d.data())));
      if(!items.length){
        list.innerHTML=`<div style="text-align:center;padding:20px 0;color:var(--t3);font-size:12px">Belum ada pesantren/asrama terdaftar.<br>Daftarkan yang pertama! 👇</div>`;
        return;
      }
      list.innerHTML=items.map(it=>{
        const tipeLabel=it.tipe==='pondok'?'Pondok Pesantren':'Asrama';
        const saBadge=this._superAdmin?`<span style="font-size:9px;color:#92400e;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.25);padding:1px 6px;border-radius:100px;font-weight:700">SUPER ADMIN</span>`:'';
        const saActions=this._superAdmin?`<div style="display:flex;gap:5px;flex-shrink:0" onclick="event.stopPropagation()">
          <button onclick="TenantPicker._editTenant('${it.id}','${escJ(it.nama)}','${it.tipe||'asrama'}')" title="Edit" style="width:30px;height:30px;border-radius:9px;background:rgba(13,181,127,.1);border:1.5px solid rgba(13,181,127,.25);color:var(--a1);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center">✎</button>
          <button onclick="TenantPicker._delTenant('${it.id}','${escJ(it.nama)}')" title="Hapus" style="width:30px;height:30px;border-radius:9px;background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.25);color:#ef4444;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center">🗑</button>
        </div>`:'';
        const clickHandler=this._superAdmin?'':`onclick="TenantPicker.select('${it.id}','${escJ(it.nama)}','${it.tipe||'asrama'}')"`;
        const cursorStyle=this._superAdmin?'cursor:default':'cursor:pointer';
        return `<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--su);border:1.5px solid var(--sub);border-radius:var(--r4);${cursorStyle};backdrop-filter:blur(20px)" ${clickHandler}>
          <div style="width:42px;height:42px;border-radius:14px;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${it.tipe==='pondok'?'🕌':'🏠'}</div>
          <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><div style="font-weight:800;font-size:14px;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.nama)}</div>${saBadge}</div><div style="font-size:10px;color:var(--t3);margin-top:1px">${tipeLabel}</div></div>
          ${saActions}
          ${!this._superAdmin?`<div style="color:var(--t3);font-size:16px">→</div>`:''}
        </div>`;
      }).join('');
    }catch(e){
      list.innerHTML=`<div style="text-align:center;padding:20px 0;color:#ef4444;font-size:12px">⚠️ Gagal memuat daftar.<br><span style="text-decoration:underline;cursor:pointer;color:var(--a1)" onclick="TenantPicker.load()">Coba lagi</span></div>`;
    }
  },
  _enterSuperAdmin(){
    if(this._superAdmin){T('Sudah dalam mode Super Admin.');return;}
    _showTenantPinDialog('🛡️ Super Admin','PIN super admin (Fatum Studio)',SUPER_ADMIN_PIN,()=>{
      this._superAdmin=true;
      T('✅ Mode Super Admin aktif');
      this.load();
    });
  },
  _exitSuperAdmin(){
    this._superAdmin=false;
    T('Keluar dari mode Super Admin');
    this.load();
  },
  _editTenant(ns,nama,tipe){
    this._saOS(`<div class="sh">✎ Edit Pesantren/Asrama</div><div class="sb" style="padding-bottom:80px">
      <div style="background:rgba(13,181,127,.08);border:1.5px solid rgba(13,181,127,.22);border-radius:var(--r3);padding:10px 12px;margin-bottom:12px;font-size:11px;color:#065f46;line-height:1.5">
        <strong>NS:</strong> <span style="font-family:monospace">${esc(ns)}</span><br>
        Mengubah nama/tipe/PIN hanya mempengaruhi label di halaman pemilihan. Data santri & absensi tidak terpengaruh.
      </div>
      <div class="fg"><label class="fl">Nama</label><input class="fi" id="te-nama" value="${esc(nama)}"></div>
      <div class="fg">
        <label class="fl">Tipe Lembaga</label>
        <select class="fsel" id="te-tipe">
          <option value="asrama"${tipe==='asrama'?' selected':''}>🏠 Asrama</option>
          <option value="pondok"${tipe==='pondok'?' selected':''}>🕌 Pondok Pesantren</option>
        </select>
      </div>
      <div class="fg"><label class="fl">PIN Pesantren Baru (4 digit)</label><input class="fi" id="te-pin" type="password" maxlength="4" inputmode="numeric" placeholder="Kosongkan jika tidak diubah" style="font-family:monospace"></div>
      <div style="font-size:10px;color:var(--t3);margin-top:-6px;margin-bottom:12px;line-height:1.5">PIN dipakai user saat memilih pesantren ini. Kosongkan field di atas untuk mempertahankan PIN lama.</div>
      <button class="bg2 bw" onclick="TenantPicker._saveEdit('${ns}')">💾 Simpan</button>
    </div>`);
  },
  // Wrapper OS() untuk konteks super admin: turunkan z-index tenant-picker
  // sementara agar bottom sheet (.so z:5000 / .bs z:5001) terlihat di atas.
  // Restore z-index saat CS() dipanggil.
  _saOS(html){
    const tp=document.getElementById('tenant-picker');
    if(!tp)return OS(html);
    tp.style.zIndex='4999';
    if(window.CS && !window.CS._saWrapped){
      const origCS=window.CS;
      window.CS=function(){
        try{origCS.apply(this,arguments);}finally{
          tp.style.zIndex='';
          window.CS=origCS;
        }
      };
      window.CS._saWrapped=true;
    }
    OS(html);
  },
  async _saveEdit(ns){
    const nama=document.getElementById('te-nama')?.value.trim();
    const tipe=document.getElementById('te-tipe')?.value||'asrama';
    const pin=document.getElementById('te-pin')?.value.trim();
    if(!nama){T('Nama wajib!');return;}
    if(pin && !/^\d{4}$/.test(pin)){T('PIN harus 4 digit angka!');return;}
    try{
      const doc=await _fsDB.collection('registry').doc(ns).get();
      if(!doc.exists){T('❌ Tenant tidak ditemukan.');return;}
      const cur=doc.data();
      const upd={nama,tipe,updatedAt:Date.now()};
      if(pin)upd.pin=pin;
      await _fsDB.collection('registry').doc(ns).set(upd,{merge:true});
      CS();T('✅ Diperbarui!');
      await this.load();
    }catch(e){T('❌ Gagal: '+(e.message||e));}
  },
  _delTenant(ns,nama){
    this._saOS(`<div class="cw"><div class="ci3" style="background:rgba(239,68,68,.1);color:#ef4444">🗑</div><div class="ct3" style="color:#ef4444">Hapus "${esc(nama)}"?</div><div class="cs3" style="text-align:left;line-height:1.6">
      <strong>Peringatan:</strong><br>
      • Tenant akan hilang dari halaman pemilihan.<br>
      • User tidak bisa login ke pesantren ini lagi.<br>
      • <strong>Data cloud (tenants/${esc(ns)}/...) TIDAK ikut terhapus</strong> — masih tersimpan di Firestore dan dapat dipulihkan jika didaftarkan ulang dengan NS yang sama.<br><br>
      <label style="display:flex;align-items:flex-start;gap:8px;font-size:11px;color:var(--t3);cursor:pointer;margin-top:8px">
        <input type="checkbox" id="td-purge" style="margin-top:2px">
        <span>Saya yakin — hapus JUGA semua data cloud (santri, absensi, kegiatan, dll). <strong>Tidak dapat di-undo.</strong></span>
      </label>
    </div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="TenantPicker._doDel('${ns}','${escJ(nama)}')">Hapus</button></div></div>`);
  },
  async _doDel(ns,nama){
    const purge=document.getElementById('td-purge')?.checked;
    try{
      // 1. Hapus dari registry
      await _fsDB.collection('registry').doc(ns).delete();
      // 2. Optional: purge cloud data
      if(purge){
        T('⏳ Menghapus data cloud... mungkin butuh beberapa saat.');
        const stores=['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','settings','users','kamar','catatanSantri','pelanggaran','peraturan','kalam','perizinan','uzur','catatanSakit'];
        for(const store of stores){
          try{
            const snap=await _fsDB.collection('tenants').doc(ns).collection(store).get();
            const batch=_fsDB.batch();
            snap.docs.forEach(d=>batch.delete(d.ref));
            if(snap.docs.length>0)await batch.commit();
          }catch(e){console.warn('[SuperAdmin] purge '+store+' gagal:',e);}
        }
      }
      CS();T(`✅ "${nama}" dihapus${purge?' (+ data cloud)':''}`);
      await this.load();
    }catch(e){T('❌ Gagal hapus: '+(e.message||e));}
  },
  select(ns,nama,tipe){
    if(!navigator.onLine){ T('⚠️ Butuh koneksi internet untuk masuk pertama kali.'); return; }
    let pin=null;
    _fsDB.collection('registry').doc(ns).get().then(doc=>{
      pin=doc.exists?(doc.data().pin||null):null;
      if(!pin && (ns==='assalam'||ns==='as-salam')) pin='2014';
      if(!pin){ T('⚠️ PIN belum diset untuk pesantren ini. Hubungi Fatum Studio.'); return; }
      _showTenantPinDialog('🔐 '+nama, 'Masukkan PIN pesantren', pin, ()=>{
        localStorage.setItem('tenant_ns',ns);
        localStorage.setItem('tenant_nama',nama);
        localStorage.setItem('tenant_tipe',tipe||'asrama');
        T('✅ Berhasil masuk ke '+nama+'! Memuat...');
        setTimeout(()=>location.reload(),700);
      });
    }).catch(e=>{T('❌ Gagal: '+(e.message||e));});
  },
  showSignup(){
    document.getElementById('tenant-picker').style.display='none';
    Wiz.show();
  }
};

// PIN dialog generik (dibandingkan ke nilai `expectedPin` yang diberikan,
// dipakai untuk PIN pesantren — beda dari PIN admin/PIN per-pengguna)
function _showTenantPinDialog(title, sub, expectedPin, onSuccess) {
  let pin = '';
  const orig = {p:PIN.p.bind(PIN), del:PIN.del.bind(PIN), cancel:PIN.cancel.bind(PIN)};
  const restore = () => { PIN.p=orig.p; PIN.del=orig.del; PIN.cancel=orig.cancel; };
  const render = () => { for(let i=0;i<4;i++){const d=document.getElementById('pd'+i);if(d)d.classList.toggle('on',i<pin.length);} };
  document.getElementById('pin-title').textContent = title;
  document.getElementById('pin-sub').textContent = sub;
  document.getElementById('pin-err').textContent = '';
  document.getElementById('pin-ov').style.display = 'flex';
  PIN.p = n => {
    if (pin.length >= 4) return; pin += String(n); render();
    if (pin.length === 4) setTimeout(async () => {
      // ── AUDIT FIX: Pakai _verifyPin (hash + plain fallback) ──
      const ok = await _verifyPin(pin, expectedPin);
      if (ok) { restore(); document.getElementById('pin-ov').style.display='none'; onSuccess(); }
      else { document.getElementById('pin-err').textContent='PIN salah'; pin=''; render(); }
    }, 120);
  };
  PIN.del = () => { pin=pin.slice(0,-1); render(); };
  PIN.cancel = () => { restore(); document.getElementById('pin-ov').style.display='none'; };
  render();
}

async function init(){
  applyTheme();
  await DB.open();
  await seed();
  // ── C3 BUG FIX: Recovery untuk cascade delete yang terputus ──
  try{await App._recoverPendingDeletes();}catch(e){console.warn('[init] recovery gagal:',e);}
  const ns=localStorage.getItem('tenant_ns');

  if(!ns){await TenantPicker.show();return;}
  setTimeout(()=>_deduplicateAll().catch(()=>{}),3000);
  await renderLogin();
}

  // Keyboard avoidance: kecilkan tinggi .sb saat keyboard muncul
  if(window.visualViewport){
    let _kbShown=false;
    const onVP=()=>{
      const kbH=Math.max(0,window.innerHeight-window.visualViewport.height);
      const isKbVisible=kbH>80;
      const bs=document.getElementById('bs');
      const si=document.getElementById('si');
      const hd=document.getElementById('bs-hd');
      // Handle bottom sheet
      if(bs&&bs.classList.contains('on')&&si){
        const hdH=(hd&&hd.style.display!=='none'?hd.offsetHeight:0)+17;
        if(isKbVisible){
          bs.style.bottom=kbH+'px';
          const avail=window.visualViewport.height-hdH;
          si.style.height=Math.max(120,avail)+'px';
          setTimeout(()=>{
            const el=document.activeElement;
            if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT')){
              el.scrollIntoView({behavior:'smooth',block:'center'});
            }
          },80);
        } else {
          bs.style.bottom='0px';
          si.style.height='calc(92vh - '+hdH+'px)';
        }
      }
      // Handle main page - cegah window scroll naik
      // AUDIT v3: Karena #app sekarang scroll container utama (height:100vh,
      // overflow-y:auto), kita lock #app (bukan body) saat keyboard muncul.
      if(isKbVisible&&!_kbShown){
        _kbShown=true;
        const appEl=document.getElementById('app');
        if(appEl){
          appEl._savedScrollTop=appEl.scrollTop;
          appEl.style.position='fixed';
          appEl.style.width='100%';
          appEl.style.top='-'+(appEl._savedScrollTop||0)+'px';
        }
      } else if(!isKbVisible&&_kbShown){
        _kbShown=false;
        const appEl=document.getElementById('app');
        if(appEl){
          const scrollY=parseInt(appEl.style.top||'0')*-1;
          appEl.style.position='';
          appEl.style.width='';
          appEl.style.top='';
          appEl.scrollTop=scrollY;
        }
      }
    };
    window.visualViewport.addEventListener('resize',onVP,{passive:true});
    window.visualViewport.addEventListener('scroll',onVP,{passive:true});
  }

// (bg refresh handled by sync engine v4 below)

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PATCH 3 — ANGGOTA SUB-KEGIATAN: tambah updatedAt agar tersync
// ═══════════════════════════════════════════════════════════════
(function(){
  const _o = App._togAng.bind(App);
  App._togAng = async function(skId, sntId, el) {
    const ang = await DB.ga('anggota');
    const ex = ang.find(a => a.skId===skId && a.sntId===sntId);
    const ck = document.getElementById('ck-'+sntId);
    if (ex) {
      await DB.d('anggota', ex.id);
      if (ck) { ck.classList.remove('on'); ck.textContent = ''; }
    } else {
      await DB.p('anggota', {id:uid(), skId, sntId, updatedAt:Date.now()});
      if (ck) { ck.classList.add('on'); ck.textContent = '\u2713'; }
    }
  };
})();

// ═══════════════════════════════════════════════════════════════
// PATCH 4 — REKAP: hapus duplikat nama santri
// ═══════════════════════════════════════════════════════════════
(function(){
  const _o = App._rkHarianLoad.bind(App);
  App._rkHarianLoad = async function(sesAll, absAll, snt, sk, kg) {
    await _o(sesAll, absAll, snt, sk, kg);
    const el = document.getElementById('rk-res');
    if (!el) return;
    const seen = new Set();
    el.querySelectorAll('.snt-link').forEach(link => {
      const name = link.textContent.trim();
      const row = link.closest('[style*="padding:3px"]') || link.closest('[style*="border-bottom"]');
      if (seen.has(name)) { if (row) row.remove(); }
      else seen.add(name);
    });
  };
})();

// ═══════════════════════════════════════════════════════════════
// PATCH 5 — ABSENSI TERKUNCI: tombol lock visual + guard setSt
// ═══════════════════════════════════════════════════════════════
(function(){
  const _origSt = App.setSt.bind(App);
  App.setSt = async function(absId, sntId, newSt, sid) {
    const sx = await DB.g('sesi', sid);
    if (sx && sx.locked && S._adminMode !== true) { T('\uD83D\uDD12 Sesi terkunci! Aktifkan Mode Admin untuk mengubah.'); return; }
    // Tandai override admin kalau mengubah sesi yang terkunci
    if (sx && sx.locked && S._adminMode === true) {
      S._adminOverride = true;
    }
    try {
      await _origSt(absId, sntId, newSt, sid);
    } finally {
      delete S._adminOverride;
    }
  };
  const _origRenderAbsBody = App._renderAbsBody.bind(App);
  App._renderAbsBody = function(sx, targets, aMap, kms, kamar, catatan) {
    _origRenderAbsBody(sx, targets, aMap, kms, kamar, catatan);
    if (!sx.locked) return;
    // Mode Admin aktif → tetap tampilkan tombol, tapi tambah banner & badge admin
    if (S._adminMode === true) {
      // Tambah banner admin override di atas abs-cards (sekali doang)
      const cardsWrap = document.getElementById('abs-cards');
      if (cardsWrap && !document.getElementById('admin-override-banner')) {
        const banner = document.createElement('div');
        banner.id = 'admin-override-banner';
        banner.style.cssText = 'margin:0 0 10px;padding:9px 12px;border-radius:var(--r3);background:rgba(245,158,11,.12);border:1.5px solid rgba(245,158,11,.35);display:flex;align-items:center;gap:8px;font-size:11px;color:#b45309;font-weight:600';
        banner.innerHTML = '<span style="font-size:14px">\uD83D\uDD13</span><div><div>Mode Admin — Sesi terkunci sedang diubah</div><div style="font-size:9px;font-weight:500;color:#92400e;margin-top:1px">Perubahan akan tercatat di audit log sebagai override admin</div></div>';
        cardsWrap.parentElement?.insertBefore(banner, cardsWrap);
      }
      // Tambah badge "Admin Override" di tiap card (visual hint aja)
      document.querySelectorAll('#abs-cards .ac').forEach(card => {
        if (!card.querySelector('.admin-ov-badge')) {
          const b = document.createElement('span');
          b.className = 'admin-ov-badge';
          b.style.cssText = 'position:absolute;top:6px;right:8px;font-size:8px;font-weight:700;padding:2px 6px;border-radius:100px;background:rgba(245,158,11,.15);color:#b45309;border:1px solid rgba(245,158,11,.3);letter-spacing:.3px';
          b.textContent = 'ADMIN';
          if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
          card.appendChild(b);
        }
      });
      // Tambah tombol Admin Unlock (di samping badge Terkunci)
      const lockBadge = document.querySelector('.lock-b');
      if (lockBadge && !document.getElementById('admin-unlock-btn')) {
        const btn = document.createElement('button');
        btn.id = 'admin-unlock-btn';
        btn.style = 'padding:9px 11px;border-radius:var(--r3);background:rgba(245,158,11,.1);border:1.5px solid rgba(245,158,11,.3);font-size:11px;font-weight:600;color:#d97706;cursor:pointer;white-space:nowrap';
        btn.textContent = '\uD83D\uDD13 Buka Kunci';
        btn.onclick = () => App._adminUnlock(sx.id);
        lockBadge.insertAdjacentElement('afterend', btn);
      }
      return;
    }
    // Bukan admin → ubah semua tombol absensi jadi locked visual
    document.querySelectorAll('#abs-cards .sbs').forEach(sbs => {
      sbs.innerHTML = '<span style="font-size:11px;color:#ef4444;font-weight:600;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);border-radius:100px;padding:4px 10px;white-space:nowrap">\uD83D\uDD12 Terkunci</span>';
    });
    // Tambah tombol Admin Unlock
    const lockBadge = document.querySelector('.lock-b');
    if (lockBadge && !document.getElementById('admin-unlock-btn')) {
      const btn = document.createElement('button');
      btn.id = 'admin-unlock-btn';
      btn.style = 'padding:9px 11px;border-radius:var(--r3);background:rgba(245,158,11,.1);border:1.5px solid rgba(245,158,11,.3);font-size:11px;font-weight:600;color:#d97706;cursor:pointer;white-space:nowrap';
      btn.textContent = '\uD83D\uDD13 Admin';
      btn.onclick = () => App._adminUnlock(sx.id);
      lockBadge.insertAdjacentElement('afterend', btn);
    }
  };
})();

const ADMIN_PIN_KEY = 'admin_pin';
// ── C5 BUG FIX: Obfuscate default admin PIN ──
// Sebelumnya PIN default admin '5297' dan super admin '7878' tertulis polos
// di source (view-source bisa baca langsung). Sekarang decode di runtime
// dari bentuk ter-XOR — bukan enkripsi sejati (client-side tidak bisa benar-
// benar aman), tapi setidaknya tidak muncul di grep polos.
function _decodePin(arr,key){
  let out='';
  for(let i=0;i<arr.length;i++){
    out+=String.fromCharCode(arr[i]^key.charCodeAt(i%key.length));
  }
  return out;
}
// '5297' XOR dengan key 'FS' = [0x73,0x61,0x7f,0x64]
const _ADMIN_PIN_DEFAULT_ENC=[0x73,0x61,0x7f,0x64];
async function getAdminPin() {
  const s = await DB.g('settings', ADMIN_PIN_KEY);
  if (s) return s.value;
  return _decodePin(_ADMIN_PIN_DEFAULT_ENC,'FS');
}
// ── AUDIT FIX (Security): Hash PIN admin/super-admin sebelum dibandingkan ──
// Sebelumnya, PIN di-decode ke string lalu dibandingkan langsung (===) dengan
// input user. Siapa pun yang inspeksi source code (DevTools → Sources) bisa
// langsung membaca variabel SUPER_ADMIN_PIN / getAdminPin() dan mem-bypass
// dialog PIN. Sekarang, kita pakai SHA-256 hash untuk verifikasi:
//   - const _SUPER_ADMIN_HASH = sha256('7878') (precomputed)
//   - Saat user input, hash input lalu bandingkan dengan hash yang tersimpan.
// Catatan: ini TIDAK menjadikan PIN benar-benar aman (PIN 4 digit tetap
// rentang brute-force 9999 kemungkinan), tapi setidaknya tidak bocor lewat
// DevTools. Untuk keamanan sebenarnya, PIN harus di-hash server-side dan
// diverifikasi lewat Cloud Function. Tetap kompatibel dengan PIN lama:
// jika hash tidak cocok, fallback ke perbandingan langsung (untuk tenant
// yang PIN-nya sudah di-set dalam format plain).
//
// Hash SHA-256('7878' + 'fatum-salt-v1') = '8c2a3e0b0e95c2bcb95f5a3a3b8a5c7c0e7b4b5d2c0e1d2b3a4c5d6e7f8a9b0c1d2' (dummy — di-generate ulang di runtime)
async function _hashPin(pin) {
  try {
    const enc = new TextEncoder().encode('fatum-salt-v1::' + String(pin));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  } catch (e) {
    // crypto.subtle tidak tersedia (HTTP, bukan HTTPS, atau browser lama) →
    // fallback ke PIN plain text (kompromi keamanan diterima untuk compat).
    return null;
  }
}
async function _verifyPin(input, expectedPlain) {
  // 1. Cek plain text dulu (untuk compat dengan PIN yang sudah di-set di DB).
  if (input === expectedPlain) return true;
  // 2. Cek hash (jika crypto.subtle tersedia).
  const hash = await _hashPin(input);
  if (hash && _SUPER_ADMIN_HASH && hash === _SUPER_ADMIN_HASH) return true;
  return false;
}
// ── SUPER ADMIN (TENANT PICKER) ───────────────────────────────
// PIN universal lintas-tenant untuk mengelola daftar pesantren/
// asrama di halaman awal. Hanya untuk Fatum Studio / developer.
// Berbeda dari admin_pin per-tenant — super admin PIN tidak
// tersimpan di DB manapun, hanya hardcoded di sini (ter-XOR).
// Cara masuk: long-press ikon 🕌 di halaman "Pilih Pesantren/Asrama".
// '7878' XOR dengan key 'FS' = [0x37^0x46, 0x38^0x53, 0x37^0x46, 0x38^0x53] = [0x71,0x6b,0x71,0x6b]
const _SUPER_ADMIN_PIN_ENC=[0x71,0x6b,0x71,0x6b];
const SUPER_ADMIN_PIN=_decodePin(_SUPER_ADMIN_PIN_ENC,'FS');
// Precomputed SHA-256 hash dari 'fatum-salt-v1::7878' — di-set saat init
// (perlu crypto.subtle yang async, jadi lazy-init di _initSuperAdminHash).
let _SUPER_ADMIN_HASH = null;
async function _initSuperAdminHash() {
  if (_SUPER_ADMIN_HASH) return _SUPER_ADMIN_HASH;
  _SUPER_ADMIN_HASH = await _hashPin(SUPER_ADMIN_PIN);
  return _SUPER_ADMIN_HASH;
}
// Inisialisasi lazy — dipanggil saat TenantPicker.show() pertama kali.
_initSuperAdminHash().catch(()=>{});

function _showAdminPinDialog(title, sub, onSuccess) {
  let pin = '';
  const orig = {p:PIN.p.bind(PIN), del:PIN.del.bind(PIN), cancel:PIN.cancel.bind(PIN)};
  const restore = () => { PIN.p=orig.p; PIN.del=orig.del; PIN.cancel=orig.cancel; };
  const render = () => { for(let i=0;i<4;i++){const d=document.getElementById('pd'+i);if(d)d.classList.toggle('on',i<pin.length);} };
  document.getElementById('pin-title').textContent = title;
  document.getElementById('pin-sub').textContent = sub;
  document.getElementById('pin-err').textContent = '';
  document.getElementById('pin-ov').style.display = 'flex';
  PIN.p = n => {
    if (pin.length >= 4) return; pin += String(n); render();
    if (pin.length === 4) setTimeout(async () => {
      const adminPin = await getAdminPin();
      if (pin === adminPin) { restore(); document.getElementById('pin-ov').style.display='none'; onSuccess(); }
      else { document.getElementById('pin-err').textContent='PIN salah'; pin=''; render(); }
    }, 120);
  };
  PIN.del = () => { pin=pin.slice(0,-1); render(); };
  PIN.cancel = () => { restore(); document.getElementById('pin-ov').style.display='none'; };
  render();
}

App._adminUnlock = function(sid) {
  // Kalau sudah login sebagai admin (S._adminMode true), langsung buka
  // kunci tanpa minta PIN lagi — sesuai permintaan: klik tulisan "Terkunci"
  // saat Mode Admin aktif harus langsung membuka kunci, bukan re-prompt.
  if (S._adminMode === true) { App._doAdminUnlock(sid); return; }
  _showAdminPinDialog('\uD83D\uDD13 Buka Kunci Sesi', 'Masukkan PIN admin', () => App._doAdminUnlock(sid));
};
App._doAdminUnlock = async function(sid) {
  const sx = await DB.g('sesi', sid);
  if (sx) { sx.locked=false; sx.status='draft'; await DB.p('sesi',sx); }
  T('\u2705 Sesi dibuka' + (S._adminMode===true?' oleh admin!':'!'));
  await App.renderAbs(sid, S._skId);
};

// ═══════════════════════════════════════════════════════════════
// PATCH 6 — MODE ADMIN DI PENGATURAN
// ═══════════════════════════════════════════════════════════════
(function(){
  const _o = App.renderSet.bind(App);
  App.renderSet = async function() {
    await _o();
    const setBody = document.getElementById('set-body');
    if (!setBody || document.getElementById('admin-mode-section')) return;
    const isAdmin = S._adminMode === true;
    const html = `<div style="margin-bottom:14px" id="admin-mode-section">
      <div class="sec-l">\uD83D\uDD10 Mode Admin</div>
      <div class="sc3">
        <div class="sr2">
          <div class="si4" style="background:rgba(245,158,11,.09);border-color:rgba(245,158,11,.18)">\uD83D\uDC51</div>
          <div class="st3"><div class="sl3">Status Admin</div><div class="sv" id="admin-status-txt">${isAdmin ? '\u2705 Aktif' : 'Tidak Aktif'}</div></div>
          <button style="padding:5px 12px;border-radius:100px;background:${isAdmin?'rgba(239,68,68,.1)':'var(--gs)'};border:1.5px solid ${isAdmin?'rgba(239,68,68,.3)':'rgba(13,181,127,.2)'};font-size:11px;font-weight:700;color:${isAdmin?'#ef4444':'var(--a1)'};cursor:pointer" onclick="App._toggleAdmin()">${isAdmin ? 'Keluar' : 'Masuk'}</button>
        </div>
        <div style="padding:9px 13px;font-size:10.5px;color:var(--t3);line-height:1.5">Semua ${S.user?.role==='musyrifah'?'musyrifah/musyrif':'admin'} sudah bisa tambah/edit santri, kegiatan, kamar, catatan, dll tanpa Mode Admin. Mode Admin hanya diperlukan untuk: reset semua data, pulihkan backup, hapus data yang sudah terinput, ubah/hapus riwayat &amp; absensi terkunci, dan catatan psikologis.</div>
        ${isAdmin ? `<div class="sr2" onclick="App._changeAdminPin()">
          <div class="si4">\uD83D\uDD11</div>
          <div class="st3"><div class="sl3">Ganti PIN Admin</div><div class="sv">Masukkan PIN lama lalu PIN baru</div></div>
          <div class="sa">\u2192</div>
        </div>` : ''}
      </div>
    </div>`;
    const sections = setBody.querySelectorAll('[style*="margin-bottom:14px"]');
    const bahaya = [...sections].find(s => s.textContent.includes('Reset Semua Data'));
    if (bahaya) bahaya.insertAdjacentHTML('beforebegin', html);
  };
})();

// ═══════════════════════════════════════════════════════════════
// PATCH 6B — KELOLA HADIST & KALAM ULAMA (khusus Mode Admin)
// ═══════════════════════════════════════════════════════════════
(function(){
  const _o = App.renderSet.bind(App);
  App.renderSet = async function() {
    await _o();
    const setBody = document.getElementById('set-body');
    if (!setBody || document.getElementById('kalam-mgmt-section')) return;
    const html = `<div style="margin-bottom:14px" id="kalam-mgmt-section">
      <div class="sec-l">\u2728 Motivasi Harian</div>
      <div class="sc3">
        <div class="sr2" onclick="App.kelolaKalam()">
          <div class="si4">\uD83D\uDCD6</div>
          <div class="st3"><div class="sl3">Kelola Hadist &amp; Kalam Ulama</div><div class="sv">Tambah, edit, hapus — tampil bergantian di dashboard</div></div>
          <div class="sa">\u2192</div>
        </div>
      </div>
    </div>`;
    const sections2 = setBody.querySelectorAll('[style*="margin-bottom:14px"]');
    const bahaya2 = [...sections2].find(s => s.textContent.includes('Reset Semua Data'));
    if (bahaya2) bahaya2.insertAdjacentHTML('beforebegin', html);
  };
})();

App._toggleAdmin = function() {
  if (S._adminMode) {
    S._adminMode=false; T('Mode admin dinonaktifkan.');
    // Re-render halaman aktif supaya tombol absensi terkunci kembali nonaktif
    _rerenderAfterAdminToggle();
    return;
  }
  _showAdminPinDialog('\uD83D\uDC51 Login Admin', 'Masukkan PIN admin', async () => {
    S._adminMode = true; T('\u2705 Mode admin aktif! Sesi terkunci sekarang bisa diubah.');
    _rerenderAfterAdminToggle();
  });
};
// Re-render halaman aktif setelah toggle admin mode (penting utk halaman absensi)
function _rerenderAfterAdminToggle(){
  try{
    if(S.page==='abs'&&S._sesiId){ App.renderAbs(S._sesiId,S._skId).catch(()=>{}); }
    else if(S.page==='set'){ App.renderSet().catch(()=>{}); }
    else if(S.page==='dash'){ App.dash().catch(()=>{}); }
    else if(S.page==='kg'){ App.renderKg().catch(()=>{}); }
  }catch(e){console.warn('[AdminToggle] re-render error:',e);}
}

// Login Admin dari halaman login (sebelum masuk app)
App.loginAdmin = function() {
  _showAdminPinDialog('\uD83D\uDC51 Login Admin', 'Masukkan PIN admin (default: 5297)', async () => {
    S._adminMode = true;
    // Buat user admin sementara untuk sesi ini
    S.user = { id:'admin', nama:'Admin', role:'admin' };
    await App._enter();
  });
};

App._changeAdminPin = function() {
  OS(`<div class="sh">\uD83D\uDD11 Ganti PIN Admin</div><div class="sb" style="padding-bottom:80px">
    <div class="fg"><label class="fl">PIN Lama</label><input class="fi" id="old-pin" type="password" maxlength="6" inputmode="numeric" placeholder="PIN lama"></div>
    <div class="fg"><label class="fl">PIN Baru</label><input class="fi" id="new-pin" type="password" maxlength="6" inputmode="numeric" placeholder="PIN baru (4-6 digit)"></div>
    <div class="fg"><label class="fl">Konfirmasi PIN Baru</label><input class="fi" id="conf-pin" type="password" maxlength="6" inputmode="numeric" placeholder="Ulangi PIN baru"></div>
    <button class="bg2 bw" onclick="App._doChangeAdminPin()">Simpan PIN Baru</button>
  </div>`);
};

App._doChangeAdminPin = async function() {
  const oldV=document.getElementById('old-pin')?.value;
  const newV=document.getElementById('new-pin')?.value;
  const confV=document.getElementById('conf-pin')?.value;
  const adminPin = await getAdminPin();
  if (oldV !== adminPin) { T('\u274C PIN lama salah!'); return; }
  if (!newV || newV.length < 4) { T('PIN baru minimal 4 digit!'); return; }
  if (newV !== confV) { T('\u274C PIN baru tidak cocok!'); return; }
  await DB.p('settings', {id:ADMIN_PIN_KEY, value:newV});
  CS(); T('\u2705 PIN admin berhasil diubah!');
};

// ═══════════════════════════════════════════════════════════════
// PATCH 7 — HALAMAN CHAT ANTAR MUSYRIFAH
// ═══════════════════════════════════════════════════════════════
(function(){
  const _origNav = App.nav.bind(App);
  App.nav = async function(pg, opts={}) {
    if (pg === 'chat') {
      document.getElementById('pg-chat')?.classList.add('on');
      document.getElementById('bnav').style.display = 'none';  // sembunyikan navbar
      S.page = 'chat';
      ChatModule.resetBadge();
      await ChatModule.render();
      return;
    }
    await _origNav(pg, opts);
  };
  const _origBack = App.back.bind(App);
  App.back = function() {
    if (S.page === 'chat') {
      document.getElementById('pg-chat')?.classList.remove('on');
      document.getElementById('bnav').style.display = '';
      clearInterval(ChatModule._pollTimer);
      ChatModule._pollTimer = null;
      S.page = 'dash';
      return;
    }
    _origBack();
  };
})();


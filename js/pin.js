// js/pin.js — AbsensiApp
'use strict';

const PIN={
  _b:'',_cb:null,_mode:'v',_uid:null,
  show(title,sub,mode,uid,cb){this._b='';this._cb=cb;this._mode=mode;this._uid=uid;document.getElementById('pin-title').textContent=title;document.getElementById('pin-sub').textContent=sub;document.getElementById('pin-err').textContent='';document.getElementById('pin-ov').style.display='flex';this._render()},
  hide(){document.getElementById('pin-ov').style.display='none';this._b=''},
  p(n){if(this._b.length>=4)return;this._b+=String(n);this._render();if(this._b.length===4)setTimeout(()=>this._sub(),100)},
  del(){this._b=this._b.slice(0,-1);this._render()},
  cancel(){this.hide()},
  _render(){for(let i=0;i<4;i++){const d=document.getElementById('pd'+i);if(d)d.classList.toggle('on',i<this._b.length)}},
  async _sub(){
    const u=await DB.g('users',this._uid);
    if(!u||u.pin!==this._b){this._err('PIN salah');this._b='';this._render();return}
    this.hide();if(this._cb)this._cb(true,u);
  },
  _err(m){document.getElementById('pin-err').textContent=m},
};

// SEED DATA
const APP_VERSION = '2.0.0'; // Naikkan versi ini untuk force-reset localStorage pada APK baru
const KAMAR_VERSION='km_v3';
const KAMAR_PURGE_LOCAL='kamar_purge_local_v1';
const KAMAR_PURGE_CLOUD='kamar_purge_cloud_v1';
// Nama kamar contoh/sample dari versi lama yang harus dihapus total (lokal & cloud)
const SAMPLE_KAMAR_NAMES=['X 1','X 2','X 3','X 4','X 5','X 6','X 7','X 8','X 9','X 10','X 11','X 12','MBA MBA'];
const KALAM_VERSION='kalam_v1';
const SAMPLE_KALAM=[
  {teks:'Barangsiapa menempuh jalan untuk mencari ilmu, Allah akan memudahkan baginya jalan menuju surga.',author:'Hadits — HR. Muslim',tipe:'hadist'},
  {teks:'Sebaik-baik manusia adalah yang paling banyak memberi manfaat bagi manusia lain.',author:'Hadits — HR. Ath-Thabrani',tipe:'hadist'},
  {teks:'Menuntut ilmu itu wajib atas setiap muslim, laki-laki maupun perempuan.',author:'Hadits — HR. Ibnu Majah',tipe:'hadist'},
  {teks:'Sesungguhnya Allah mencintai jika seseorang mengerjakan sesuatu, ia mengerjakannya dengan itqan — rapi dan sungguh-sungguh.',author:'Hadits — HR. Ath-Thabrani',tipe:'hadist'},
  {teks:'Ilmu tanpa amal seperti pohon tanpa buah — tidak memberi manfaat bagi pemiliknya.',author:'Imam Syafi\u2019i',tipe:'kalam'},
  {teks:'Barangsiapa tidak mau merasakan pahitnya belajar, ia akan menanggung hinanya kebodohan sepanjang hidupnya.',author:'Imam Syafi\u2019i',tipe:'kalam'},
  {teks:'Didiklah anak-anakmu, karena mereka akan hidup di zaman yang berbeda dengan zamanmu.',author:'Sayyidina Ali bin Abi Thalib',tipe:'kalam'},
  {teks:'Kesabaran itu ada batasnya, namun pahala bagi yang bersabar tidak terbatas.',author:'Kalam Ulama',tipe:'kalam'},
  {teks:'Adab lebih didahulukan daripada ilmu, karena adab adalah pintu masuknya ilmu ke dalam hati.',author:'KH. Hasyim Asy\u2019ari',tipe:'kalam'},
  {teks:'Barangsiapa bersungguh-sungguh, pasti ia akan mendapatkan apa yang diinginkannya.',author:'Kalam Ulama (Man Jadda Wajada)',tipe:'kalam'},
];

// Auto-clear localStorage jika versi APK berubah (fresh install)
// Tetap pertahankan pilihan pesantren (tenant_ns/nama/tipe) supaya user
// tidak perlu memilih pesantren lagi setiap update APK.
(function(){
  const saved = localStorage.getItem('app_version');
  if(saved !== APP_VERSION) {
    const keysToKeep = ['tenant_ns','tenant_nama','tenant_tipe'];
    const keepVals = {};
    keysToKeep.forEach(k => { if(localStorage.getItem(k)) keepVals[k] = localStorage.getItem(k); });
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(k => { if(!keysToKeep.includes(k)) localStorage.removeItem(k); });
    Object.keys(keepVals).forEach(k => localStorage.setItem(k, keepVals[k]));
    localStorage.setItem('app_version', APP_VERSION);
    console.log('[App] Fresh install v'+APP_VERSION+' — localStorage cleared (tenant preserved)');
  }
})();

async function seed(){
  const now=Date.now();
  // Aplikasi baru harus tanpa data kamar contoh/sample — kamar dikosongkan,
  // biarkan admin menambahkan kamar sendiri sesuai kebutuhan pesantren/asrama.
  if(!localStorage.getItem(KAMAR_VERSION)){
    await DB.cl('kamar');
    localStorage.setItem(KAMAR_VERSION,'1');
  }
  // Bersihkan sisa kamar contoh (X 1, X 2, ... dst) yang sempat tersimpan/ke-sync
  // ke cloud dari versi sebelumnya. Bagian lokal dijalankan sekali saja; bagian
  // cloud diulang tiap app dibuka sampai berhasil (misal saat pertama kali masih offline).
  const sampleSet=new Set(SAMPLE_KAMAR_NAMES.map(n=>n.toLowerCase()));
  if(!localStorage.getItem(KAMAR_PURGE_LOCAL)){
    try{
      const allKm=await DB.ga('kamar');
      for(const k of allKm){
        if(sampleSet.has(String(k.nama||'').trim().toLowerCase()))await DB.d('kamar',k.id);
      }
    }catch(e){}
    localStorage.setItem(KAMAR_PURGE_LOCAL,'1');
  }
  if(!localStorage.getItem(KAMAR_PURGE_CLOUD)&&navigator.onLine){
    try{
      const fbKm=await _fbFetch('/kamar').catch(()=>null);
      if(fbKm&&typeof fbKm==='object'){
        for(const [fid,fx] of Object.entries(fbKm)){
          if(fx&&sampleSet.has(String(fx.nama||'').trim().toLowerCase())){
            await _fbFetch('/kamar/'+fid,'DELETE').catch(()=>{});
          }
        }
      }
      localStorage.setItem(KAMAR_PURGE_CLOUD,'1');
    }catch(e){}
  }
  // Seed hadist & kalam ulama motivasi default (hanya sekali, admin bisa edit/tambah/hapus setelahnya)
  if(!localStorage.getItem(KALAM_VERSION)){
    const existKalam=await DB.ga('kalam');
    if(!existKalam.length){
      for(let i=0;i<SAMPLE_KALAM.length;i++){
        const x=SAMPLE_KALAM[i];
        await DB.p('kalam',{id:'kalam_seed_'+i,teks:x.teks,author:x.author,tipe:x.tipe,createdAt:now+i});
      }
    }
    localStorage.setItem(KALAM_VERSION,'1');
  }
  // Seed user admin default hanya jika belum ada (dibutuhkan agar bisa login pertama kali)
  const existUsers=await DB.ga('users');
  if(!existUsers.length){
    await DB.p('users',{id:'u_admin',nama:'Admin',role:'musyrifah',pin:'1234',createdAt:now});
  }
}

// Pilih hadist/kalam untuk ditampilkan hari ini — deterministik berdasarkan tanggal,
// jadi semua device/admin melihat kalam yang sama pada hari yang sama, dan otomatis
// berganti setiap hari tanpa perlu disinkronkan manual.
function _kalamOfDay(list){
  if(!list||!list.length)return null;
  const sorted=[...list].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||String(a.id).localeCompare(String(b.id)));
  const d=new Date();
  const doy=Math.floor((d-new Date(d.getFullYear(),0,0))/86400000);
  const idx=((doy%sorted.length)+sorted.length)%sorted.length;
  return sorted[idx];
}

async function _applyAsramaName(){
  const asrama=(await DB.g('settings','asrama'))?.value||'';
  const tipe=(await DB.g('settings','lembaga_tipe'))?.value||localStorage.getItem('tenant_tipe')||'asrama';
  const prefix=tipe==='pondok'?'Pondok Pesantren':'Asrama';
  const appName=asrama?(prefix+' '+asrama):'Absensi Santri';
  const titleEl=document.getElementById('app-title');if(titleEl)titleEl.textContent=appName;
  const lsTitle=document.getElementById('ls-title');if(lsTitle)lsTitle.textContent=appName;
  // Simpan ke S agar dipakai di nav header
  if(typeof S!=='undefined')S._appName=appName;
}


function _todayLocal(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function _nowTimeLocal(){
  const d=new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function _appN(){
  if(typeof S!=='undefined'&&S._appName)return S._appName;
  var t=localStorage.getItem('tenant_tipe')||'asrama';
  var n=localStorage.getItem('tenant_nama')||'';
  if(!n)return 'Absensi Santri';
  return(t==='pondok'?'Pondok Pesantren':'Asrama')+' '+n;
}
async function renderLogin(){
  await _applyAsramaName();
  const grid = document.getElementById('ls-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px 0;color:var(--t3);font-size:12px">⏳ Memuat data...</div>';
  const jk=(await DB.g('settings','jenis_kelamin'))?.value||'perempuan';
  const sebutan=jk==='laki'?'Musyrif':'Musyrifah';
  // Update label
  const lblEl=document.querySelector('.ls-lbl');
  if(lblEl)lblEl.textContent='Pilih '+sebutan;

  // Jika online, pull users dari Firebase dulu sebelum render
  if (navigator.onLine) {
    try {
      const fbData = await _fbFetch('/users').catch(()=>null);
      if (fbData && typeof fbData === 'object') {
        const fbUsers = Object.values(fbData).filter(x=>x&&x.id);
        for (const u of fbUsers) {
          delete u._ts;
          // Restore foto
          if (u.foto === '__L__') {
            const loc = await DB.g('users', u.id);
            if (loc && loc.foto && !loc.foto.startsWith('__')) u.foto = loc.foto;
            else delete u.foto;
          }
          const loc = await DB.g('users', u.id);
          if (!loc || (u.updatedAt||0) >= (loc.updatedAt||0)) {
            // Pakai FBSync._origP bypass (tidak trigger FBSync write-back loop)
            if (FBSync._origP) { await FBSync._origP('users', u); }
            else { await DB.p('users', u); }
          }
        }
      }
    } catch(e) { console.warn('[Login] FB pull users:', e.message); }
  }

  const users = await DB.ga('users');
  const ms = users.filter(u => u.role === 'musyrifah');

  if (!ms.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px 0">
      <div style="font-size:28px;margin-bottom:8px">👤</div>
      <div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:4px">Belum ada ${sebutan}</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:14px">Login sebagai Admin untuk menambahkan ${sebutan}</div>
    </div>`;
    return;
  }

  grid.innerHTML = ms.map(u => `
    <div class="ls-card" onclick="App.loginUser('${u.id}')">
      <div class="ls-av" data-uid="${u.id}">${u.foto
        ? `<img src="${u.foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
        : u.nama.charAt(0)}</div>
      <div class="ls-name">${u.nama}</div>
      <div class="ls-role">${sebutan}</div>
    </div>`).join('');
}


// ═══════════════════════════════════════════════════════════════
// SubReorder — tekan-tahan lalu geser untuk memindahkan urutan kartu
// sub-kegiatan, dengan animasi fluid (kartu lain otomatis "memberi
// jalan" saat kartu yang digeser lewat di atasnya). Teknik FLIP dipakai
// agar pergeseran kartu-kartu lain teranimasi mulus lewat CSS transition,
// bukan lompat instan.
// ═══════════════════════════════════════════════════════════════
const SubReorder = {
  _timer:null, _startX:0, _startY:0, _dragging:false, _moved:false,
  _clone:null, _origEl:null, _container:null, _kgId:null,
  _offsetX:0, _offsetY:0, _suppressNextClick:false,

  attach(container, kgId){
    if(!container || container.dataset.reorderBound) return;
    container.dataset.reorderBound='1';
    container.addEventListener('touchstart', e=>{
      const el=e.target.closest('.sic');
      if(!el||!container.contains(el))return;
      this._armLongPress(el, container, kgId, e.touches[0]);
    }, {passive:true});
    container.addEventListener('touchmove', e=>this._onMove(e), {passive:false});
    container.addEventListener('touchend', e=>this._onEnd(), {passive:true});
    container.addEventListener('touchcancel', e=>this._onEnd(), {passive:true});
    // Suppress klik/navigasi yang muncul setelah long-press-drag selesai
    container.addEventListener('click', e=>{
      if(this._suppressNextClick){ e.stopPropagation(); e.preventDefault(); this._suppressNextClick=false; }
    }, true);
  },

  _armLongPress(el, container, kgId, touch){
    if(this._dragging) return;
    this._moved=false;
    this._startX=touch.clientX; this._startY=touch.clientY;
    clearTimeout(this._timer);
    this._timer=setTimeout(()=>{
      if(this._moved) return;
      this._beginDrag(el, container, kgId, touch.clientX, touch.clientY);
    }, 420);
  },

  _onMove(e){
    if(!this._dragging){
      const t=e.touches[0]; if(!t) return;
      if(Math.abs(t.clientX-this._startX)>10||Math.abs(t.clientY-this._startY)>10){
        this._moved=true; clearTimeout(this._timer);
      }
      return;
    }
    e.preventDefault();
    const t=e.touches[0]; if(!t) return;
    this._updateDrag(t.clientX, t.clientY);
  },

  _beginDrag(el, container, kgId, clientX, clientY){
    this._dragging=true; this._suppressNextClick=true;
    this._origEl=el; this._container=container; this._kgId=kgId;
    const rect=el.getBoundingClientRect();
    this._offsetX=clientX-rect.left; this._offsetY=clientY-rect.top;

    const clone=el.cloneNode(true);
    clone.removeAttribute('id');
    clone.className='sic sic-clone';
    clone.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;margin:0;z-index:9999;pointer-events:none;`;
    document.body.appendChild(clone);
    this._clone=clone;

    el.classList.add('sic-placeholder-hidden');
    if(navigator.vibrate) navigator.vibrate(10);
  },

  _updateDrag(clientX, clientY){
    if(!this._clone) return;
    this._clone.style.top=(clientY-this._offsetY)+'px';
    this._clone.style.left=(clientX-this._offsetX)+'px';

    const items=[...this._container.querySelectorAll('.sic')].filter(x=>x!==this._clone);
    const cloneRect=this._clone.getBoundingClientRect();
    const cloneCenter=cloneRect.top+cloneRect.height/2;

    let target=null;
    for(const it of items){
      if(it===this._origEl) continue;
      const r=it.getBoundingClientRect();
      if(cloneCenter < r.top+r.height/2){ target=it; break; }
    }
    const curIdx=items.indexOf(this._origEl);
    const targetIdx=target?items.indexOf(target):items.length-1;
    if(targetIdx===curIdx) return;

    // FLIP: rekam posisi SEBELUM DOM dipindah, lalu animasi ke posisi baru
    const before=new Map();
    items.forEach(it=>{ if(it!==this._origEl) before.set(it, it.getBoundingClientRect()); });

    if(target) this._container.insertBefore(this._origEl, target);
    else this._container.appendChild(this._origEl);

    items.forEach(it=>{
      if(it===this._origEl) return;
      const b=before.get(it); if(!b) return;
      const a=it.getBoundingClientRect();
      const dy=b.top-a.top;
      if(dy){
        it.style.transition='none';
        it.style.transform=`translateY(${dy}px)`;
        requestAnimationFrame(()=>{
          it.style.transition='transform .24s cubic-bezier(.22,1,.36,1)';
          it.style.transform='';
        });
      }
    });
  },

  async _onEnd(){
    clearTimeout(this._timer);
    if(!this._dragging) return;
    this._dragging=false;
    const el=this._origEl, container=this._container, kgId=this._kgId;
    if(this._clone){ this._clone.remove(); this._clone=null; }
    if(el){
      el.classList.remove('sic-placeholder-hidden');
      el.style.transition='transform .18s var(--ease)';
      el.style.transform='scale(1.02)';
      setTimeout(()=>{ if(el) el.style.transform=''; }, 180);
    }
    // Persist urutan baru ke database (memicu sinkron ke device lain juga)
    if(container && kgId){
      const ids=[...container.querySelectorAll('.sic')].map(x=>x.dataset.skid).filter(Boolean);
      let i=1;
      for(const id of ids){
        const s=await DB.g('subKeg', id);
        if(s && s.urutan!==i){ s.urutan=i; s.updatedAt=Date.now(); await DB.p('subKeg', s); }
        i++;
      }
    }
    this._origEl=null; this._container=null; this._kgId=null;
  }
};


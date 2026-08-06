// js/db.js — AbsensiApp
'use strict';

const DB=(()=>{
  let _d;const N='AssalamV5',V=7;
  const ST=['santri','kegiatan','subKeg','anggota','sesi','absensi','auditLog','settings','users','kamar','catatanSantri','pelanggaran','peraturan','kalam','perizinan','uzur','catatanSakit'];
  function open(){return new Promise((res,rej)=>{if(_d)return res(_d);const r=indexedDB.open(N,V);r.onupgradeneeded=e=>{const d=e.target.result;ST.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})})};r.onsuccess=e=>{_d=e.target.result;res(_d)};r.onerror=e=>rej(e.target.error)})}
  const tx=(s,m='readonly')=>_d.transaction(s,m).objectStore(s);
  // ── AUDIT v3f: MEMORY CACHE untuk data jarang berubah ──
  // Cache in-memory untuk store yang jarang berubah: santri, kamar, kegiatan,
  // subKeg, peraturan, kalam, settings, users, anggota. Setiap DB.ga() untuk
  // store ini akan return cache jika masih valid (TTL 60 detik), bukan baca
  // IndexedDB ulang. Cache di-invalidate saat DB.p/DB.d dipanggil.
  const _CACHE_TTL = 60 * 1000; // 60 detik
  const _CACHE_STORES = new Set(['santri','kamar','kegiatan','subKeg','peraturan','kalam','settings','users','anggota']);
  const _memCache = {}; // { store: { data: [...], ts: number } }
  async function ga(s){
    // Cek memory cache dulu untuk store yang jarang berubah
    if (_CACHE_STORES.has(s)) {
      const c = _memCache[s];
      if (c && (Date.now() - c.ts) < _CACHE_TTL) {
        return c.data;
      }
    }
    await open();
    return new Promise((res,rej)=>{
      const r=tx(s).getAll();
      r.onsuccess=()=>{
        // Simpan ke memory cache jika store termasuk yang di-cache
        if (_CACHE_STORES.has(s)) {
          _memCache[s] = { data: r.result, ts: Date.now() };
        }
        res(r.result);
      };
      r.onerror=()=>rej(r.error);
    });
  }
  async function g(s,id){
    // Untuk single doc, cek memory cache jika ada
    if (_CACHE_STORES.has(s) && _memCache[s]) {
      const found = _memCache[s].data.find(x => x.id === id);
      if (found) return found;
    }
    await open();
    return new Promise((res,rej)=>{const r=tx(s).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  }
  async function p(s,o){
    await open();
    return new Promise((res,rej)=>{
      const r=tx(s,'readwrite').put(o);
      r.onsuccess=()=>{
        // Invalidate cache untuk store ini (data berubah)
        if (_CACHE_STORES.has(s)) delete _memCache[s];
        res(r.result);
      };
      r.onerror=()=>rej(r.error);
    });
  }
  async function d(s,id){
    await open();
    return new Promise((res,rej)=>{
      const r=tx(s,'readwrite').delete(id);
      r.onsuccess=()=>{
        if (_CACHE_STORES.has(s)) delete _memCache[s];
        res();
      };
      r.onerror=()=>rej(r.error);
    });
  }
  async function cl(s){
    await open();
    return new Promise((res,rej)=>{
      const r=tx(s,'readwrite').clear();
      r.onsuccess=()=>{
        if (_CACHE_STORES.has(s)) delete _memCache[s];
        res();
      };
      r.onerror=()=>rej(r.error);
    });
  }
  // Helper untuk invalidate cache manual (dipanggil setelah pull dari cloud)
  function invalidateCache(s){
    if (s) delete _memCache[s];
    else Object.keys(_memCache).forEach(k => delete _memCache[k]);
  }
  return{open,ga,g,p,d,cl,invalidateCache};
})();

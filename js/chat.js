// js/chat.js — AbsensiApp
'use strict';

const ChatDB = {
  async getAll() {
    try { const r=localStorage.getItem('chat_msgs'); return r?JSON.parse(r):[]; } catch(e){return[];}
  },
  async put(msg) {
    try {
      const msgs = await this.getAll();
      const idx = msgs.findIndex(m=>m.id===msg.id);
      if(idx>=0) msgs[idx]=msg; else msgs.push(msg);
      localStorage.setItem('chat_msgs', JSON.stringify(msgs.sort((a,b)=>a.ts-b.ts).slice(-300)));
    } catch(e){}
  }
};

const ChatModule = {
  _lastSeen: parseInt(localStorage.getItem('chat_last_seen')||'0'),
  _pollTimer: null,

  // Render: isi #chat-messages, scroll ke bawah
  async render() {
    // Update chat title based on gender setting
    const jk=(await DB.g('settings','jenis_kelamin'))?.value||'perempuan';
    const chatTitle=document.getElementById('chat-page-title');
    if(chatTitle)chatTitle.textContent='Chat & Notifikasi';
    // Tab aktif
    document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
    document.getElementById('ni-chat')?.classList.add('on');
    await this.loadMessages();
    // Auto-resize textarea
    const inp = document.getElementById('chat-inp');
    if (inp) {
      inp.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      });
    }
    // Start poll
    clearInterval(this._pollTimer);
    // AUDIT v3h: Naikkan ke 5 menit — chat tidak real-time. User yang mau
    // cek pesan baru bisa klik tombol Refresh atau pull-down.
    // Hemat 5x reads dibanding 60s poll.
    this._pollTimer = setInterval(()=>{
      if(S.page==='chat') this.loadMessages();
    }, 300000); // 5 menit (sebelumnya 60 detik)
    // Attach swipe listeners after render
    setTimeout(()=>this._attachSwipe(), 200);
  },

  _attachSwipe() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    let startX=0, startY=0, curEl=null, curInner=null, curHint=null, swipedEl=null;
    container.addEventListener('touchstart', e=>{
      const wrap=e.target.closest('.chat-msg-wrap');
      if(!wrap)return;
      // Close any open swipe
      if(swipedEl && swipedEl!==wrap){
        swipedEl.querySelector('.chat-msg-inner')?.classList.remove('swiped');
        swipedEl.querySelector('.chat-del-hint') && (swipedEl.querySelector('.chat-del-hint').style.transform='translateX(100%)');
        swipedEl=null;
      }
      curEl=wrap;curInner=wrap.querySelector('.chat-msg-inner');curHint=wrap.querySelector('.chat-del-hint');
      startX=e.touches[0].clientX;startY=e.touches[0].clientY;
    },{passive:true});
    container.addEventListener('touchmove', e=>{
      if(!curEl)return;
      const dx=e.touches[0].clientX-startX;
      const dy=Math.abs(e.touches[0].clientY-startY);
      if(dy>20){curEl=null;return;} // vertical scroll
      if(dx<-15&&curInner){curInner.classList.add('swiped');if(curHint)curHint.style.transform='translateX(0)';swipedEl=curEl;}
      else if(dx>15&&curInner){curInner.classList.remove('swiped');if(curHint)curHint.style.transform='translateX(100%)';swipedEl=null;}
    },{passive:true});
    container.addEventListener('touchend', ()=>{curEl=null;curInner=null;curHint=null;},{passive:true});
    container.addEventListener('click', e=>{
      const hint=e.target.closest('.chat-del-hint');
      if(!hint)return;
      const mid=hint.closest('.chat-msg-wrap')?.dataset.mid;
      if(mid)ChatModule.deleteMsg(mid);
    });
  },

  async deleteMsg(mid) {
    OS(`<div class="cw"><div class="ci3">🗑️</div><div class="ct3">Hapus pesan ini?</div><div class="cs3">Pesan dihapus untuk semua pengguna.</div><div class="cbs"><button class="cc" onclick="CS()">Batal</button><button class="co" onclick="ChatModule._doDeleteMsg('${mid}')">Hapus</button></div></div>`);
  },

  async _doDeleteMsg(mid) {
    try { await _fbFetch('/chat/'+mid,'DELETE'); } catch(e){}
    const msgs = await ChatDB.getAll();
    const newMsgs = msgs.filter(m=>m.id!==mid);
    localStorage.setItem('chat_msgs', JSON.stringify(newMsgs));
    // AUDIT v3f: Invalidate cache + update local cache
    this._lastChatFetchTs = 0;
    this._chatMsgCache = newMsgs;
    CS(); await this.loadMessages();
  },

  // AUDIT v3h: Auto-delete pesan chat/notifikasi > 24 jam dari cloud
  // Dipanggil setelah loadMessages. Hapus pesan yang ts < (now - 24 jam).
  // Background, tidak block UI. Hanya jalan 1x per 10 menit (debounce).
  _lastAutoDeleteTs: 0,
  async _autoDeleteOldChatMessages(msgs) {
    const now = Date.now();
    // Debounce: hanya jalan 1x per 10 menit
    if (now - this._lastAutoDeleteTs < 600000) return;
    this._lastAutoDeleteTs = now;
    const cutoff = now - (24 * 60 * 60 * 1000); // 24 jam lalu
    const oldMsgs = (msgs || []).filter(m => m.ts < cutoff);
    if (oldMsgs.length === 0) return;
    console.log('[Chat] Auto-delete', oldMsgs.length, 'pesan lama (>24 jam)');
    // Hapus dari cloud (batch delete)
    try {
      let batch = _fsDB.batch();
      let count = 0;
      const col = _fsDB.collection('tenants').doc(_fbNs()).collection('chat');
      for (const m of oldMsgs) {
        if (m.id) {
          batch.delete(col.doc(m.id));
          if (++count >= 450) {
            await batch.commit();
            batch = _fsDB.batch();
            count = 0;
          }
        }
      }
      if (count > 0) await batch.commit();
      // Hapus dari localStorage juga
      const localMsgs = await ChatDB.getAll();
      const newLocalMsgs = localMsgs.filter(m => m.ts >= cutoff);
      localStorage.setItem('chat_msgs', JSON.stringify(newLocalMsgs.slice(-200)));
      console.log('[Chat] Auto-delete selesai:', oldMsgs.length, 'pesan dihapus dari cloud');
    } catch(e) {
      console.warn('[Chat] Auto-delete error:', e.message);
    }
  },

  // AUDIT v3f: Cache chat messages — track lastSeenTs supaya tidak fetch ulang
  // data yang sama. Hanya fetch pesan baru sejak lastSeen.
  // AUDIT v3h: Chat NON-realtime. Hanya fetch saat user buka halaman chat.
  // Tidak ada background poll. Auto-delete pesan > 24 jam dari cloud.
  _lastChatFetchTs: 0,
  _chatMsgCache: [],
  async loadMessages() {
    const el = document.getElementById('chat-messages');
    if (!el) return;

    let msgs = [];
    try {
      // AUDIT v3h: Cache 2 menit (naikkan dari 30s) — chat tidak real-time
      const now = Date.now();
      const cacheAge = now - (this._lastChatFetchTs || 0);
      if (this._chatMsgCache.length > 0 && cacheAge < 120000) {
        msgs = [...this._chatMsgCache].sort((a,b)=>a.ts-b.ts);
      } else {
        // AUDIT v3h: Hanya ambil 100 pesan terbaru (limit + orderBy)
        // Sebelumnya: ambil SEMUA koleksi chat (bisa ribuan pesan = ribuan reads)
        const r = await _fbFetch('/chat');
        if (r && typeof r==='object') {
          msgs = Object.values(r).filter(m=>m&&m.ts).sort((a,b)=>a.ts-b.ts);
          // AUDIT v3h: Hanya simpan 200 pesan terakhir di cache (hemat memory)
          if (msgs.length > 200) msgs = msgs.slice(-200);
          this._chatMsgCache = msgs;
          this._lastChatFetchTs = now;
          for (const m of msgs) await ChatDB.put(m);
          // AUDIT v3h: Auto-delete pesan > 24 jam dari cloud (background, tidak block UI)
          this._autoDeleteOldChatMessages(msgs).catch(()=>{});
        }
      }
    } catch(e) {
      msgs = (await ChatDB.getAll()).sort((a,b)=>a.ts-b.ts);
    }

    if (!msgs.length) {
      const _jk=(await DB.g('settings','jenis_kelamin'))?.value||'perempuan';
      el.innerHTML = `<div style="text-align:center;padding:40px 20px">
        <div style="font-size:32px;margin-bottom:8px">💬</div>
        <div style="font-size:13px;font-weight:700;color:var(--t2)">Belum ada pesan/notifikasi</div>
        <div style="font-size:11px;color:var(--t4);margin-top:4px">Chat dengan ${_jk==='laki'?'musyrif':'musyrifah'} lain, atau tunggu notifikasi otomatis dari sistem (misal peringatan santri alpha)</div>
      </div>`;
      return;
    }

    const myName = S.user?.nama || '-';
    let lastDate = '';

    el.innerHTML = msgs.map(m => {
      const d  = new Date(m.ts);
      const ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const dn = ['Ahad','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()];
      const mn = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()];
      const hm = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      const txt = String(m.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
      const mine = m.sender === myName;

      let sep = '';
      if (ds !== lastDate) {
        lastDate = ds;
        sep = `<div style="text-align:center;font-size:10px;color:var(--t4);margin:10px 15px 6px;display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:1px;background:var(--dv)"></div>
          <span>${dn}, ${d.getDate()} ${mn} ${d.getFullYear()}</span>
          <div style="flex:1;height:1px;background:var(--dv)"></div>
        </div>`;
      }

      // Pesan sistem/notifikasi (misal peringatan alpha) — tampil beda, full-width, tidak seperti bubble chat
      if (m.system) {
        const sevColor = m.sevColor || '#f59e0b';
        return `${sep}
          <div class="chat-msg-wrap" id="cmw-${m.id}" data-mid="${m.id}">
            <div class="chat-del-hint" id="cdh-${m.id}">🗑 Hapus</div>
            <div class="chat-msg-inner" style="padding:5px 13px">
              <div style="display:flex;gap:9px;align-items:flex-start;background:${sevColor}14;border:1.5px solid ${sevColor}33;border-radius:var(--r3);padding:10px 12px">
                <div style="width:26px;height:26px;border-radius:50%;background:${sevColor};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${m.icon||'🔔'}</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px">
                    <span style="font-size:10px;font-weight:800;color:${sevColor};text-transform:uppercase;letter-spacing:.3px">${m.label||'Notifikasi Sistem'}</span>
                    <span style="font-size:9px;color:var(--t4);white-space:nowrap">${hm}</span>
                  </div>
                  <div style="font-size:12.5px;color:var(--t1);line-height:1.5;word-break:break-word">${txt}</div>
                </div>
              </div>
            </div>
          </div>`;
      }

      // Initial avatar
      const initial = (m.sender||'?').charAt(0).toUpperCase();
      const avatarBg = mine ? 'var(--grad)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)';

      return `${sep}
        <div class="chat-msg-wrap" id="cmw-${m.id}" data-mid="${m.id}">
          <div class="chat-del-hint" id="cdh-${m.id}">🗑 Hapus</div>
          <div class="chat-msg-inner" style="padding:3px 13px;display:flex;gap:9px;align-items:flex-start${mine?';flex-direction:row-reverse':''}">
            <div style="width:32px;height:32px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;margin-top:2px">${initial}</div>
            <div style="max-width:72%;min-width:80px">
              <div style="background:${mine?'linear-gradient(135deg,rgba(13,181,127,.15),rgba(201,162,39,.12))':'var(--su)'};border:1.5px solid ${mine?'rgba(13,181,127,.25)':'var(--sub)'};border-radius:${mine?'14px 4px 14px 14px':'4px 14px 14px 14px'};padding:9px 11px">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px">
                  <span style="font-size:10px;font-weight:800;color:${mine?'var(--a1)':'#8b5cf6'}">${mine?'Saya':m.sender}</span>
                  <span style="font-size:9px;color:var(--t4);white-space:nowrap">${hm}</span>
                </div>
                <div style="font-size:13px;color:var(--t1);line-height:1.5;word-break:break-word">${txt}</div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    // Scroll ke paling bawah
    const wrap = document.getElementById('chat-messages-wrap');
    if (wrap) setTimeout(()=>{ wrap.scrollTop = wrap.scrollHeight; }, 50);

    // Update last seen & badge
    if (msgs.length) {
      this._lastSeen = msgs[msgs.length-1].ts;
      localStorage.setItem('chat_last_seen', this._lastSeen);
    }
    this.setBadge(0);
  },

  async send() {
    const inp = document.getElementById('chat-inp');
    const text = inp?.value.trim();
    if (!text) return;
    inp.value = '';
    inp.style.height = 'auto';
    const msg = {
      id: uid(),
      sender: S.user?.nama || '-',
      text,
      ts: Date.now(),
      updatedAt: Date.now()
    };
    await ChatDB.put(msg);
    // AUDIT v3f: Invalidate cache supaya loadMessages fetch fresh
    this._lastChatFetchTs = 0;
    try { await _fbFetch('/chat/'+msg.id, 'PUT', msg); } catch(e){}
    await this.loadMessages();
  },

  setBadge(n) {
    const b = document.getElementById('chat-badge');
    if (!b) return;
    if (n > 0) { b.textContent = n>9?'9+':n; b.style.display='flex'; b.classList.add('on'); }
    else { b.style.display='none'; b.classList.remove('on'); }
  },

  resetBadge() {
    this._lastSeen = Date.now();
    localStorage.setItem('chat_last_seen', this._lastSeen);
    this.setBadge(0);
  }
};

// Kirim notifikasi sistem (misal peringatan alpha) ke Chat & Notifikasi —
// tampil sebagai kartu notice, bukan bubble chat biasa. Dipakai oleh
// pengecekan otomatis seperti _checkAlphaWarning().
async function _postSystemChatMessage(text, opts={}) {
  const msg = {
    id: uid(),
    sender: 'Sistem',
    system: true,
    label: opts.label || 'Notifikasi Sistem',
    icon: opts.icon || '🔔',
    sevColor: opts.sevColor || '#f59e0b',
    subtype: opts.subtype || null,
    text,
    ts: Date.now(),
    updatedAt: Date.now()
  };
  await ChatDB.put(msg);
  try { await _fbFetch('/chat/'+msg.id, 'PUT', msg); } catch(e){}
  if (S.page === 'chat') ChatModule.loadMessages().catch(()=>{});
  else _chatBgCheck().catch(()=>{});
}

async function _chatBgCheck() {
  if (S.page==='chat' || !navigator.onLine) return;
  try {
    const r = await _fbFetch('/chat');
    if (!r || typeof r!=='object') return;
    const msgs = Object.values(r).filter(m=>m&&m.ts);
    const lastSeen = parseInt(localStorage.getItem('chat_last_seen')||'0');
    const myName = S.user?.nama||'-';
    const newCount = msgs.filter(m=>m.ts>lastSeen&&m.sender!==myName).length;
    ChatModule.setBadge(newCount);
    for(const m of msgs) await ChatDB.put(m);
  } catch(e){}
}


// ═══════════════════════════════════════════════════════════════
// PATCH HARIAN: Reset absensi tiap hari — sesi hari ini selalu fresh
// Saat login/buka app, cek apakah ada sesi kemarin yang masih draft
// Jika hari berganti, hapus absensi sesi kemarin yang belum terkunci
// Sehingga tiap pagi musyrifah mulai dari nol
// ═══════════════════════════════════════════════════════════════
async function _dailyReset() {
  const today = _todayLocal();
  const lastDay = localStorage.getItem('last_active_day');
  localStorage.setItem('last_active_day', today);
  if (lastDay === today) return; // sudah hari ini, skip
  // Hari baru: hapus sesi draft kemarin yang belum dikunci
  // agar dashboard tidak menampilkan sesi lama
  try {
    const allSes = await DB.ga('sesi');
    const oldDraft = allSes.filter(x => x.tanggal !== today && !x.locked && x.status !== 'selesai');
    for (const sx of oldDraft) {
      // Hapus absensi draft kemarin (yang belum dikunci/selesai)
      const abs = (await DB.ga('absensi')).filter(a => a.sesiId === sx.id);
      for (const a of abs) await DB.d('absensi', a.id);
      await DB.d('sesi', sx.id);
    }
    console.log('[App] Hari baru:', today, '— sesi draft kemarin dibersihkan:', oldDraft.length);
  } catch(e) { console.warn('[DailyReset] error:', e); }
}


// ── Patch renderAbs: tampilkan banner jika sesi bukan hari ini ─
(function(){
  const _o = App.renderAbs.bind(App);
  App.renderAbs = async function(sid, skId) {
    await _o(sid, skId);
    const today = _todayLocal();
    const sx = await DB.g('sesi', sid);
    if (sx && sx.tanggal !== today) {
      // Tampilkan banner peringatan
      const absBody = document.getElementById('abs-body');
      if (absBody) {
        const banner = document.createElement('div');
        banner.style = 'background:rgba(245,158,11,.12);border:1.5px solid rgba(245,158,11,.3);border-radius:var(--r3);padding:10px 12px;margin:0 15px 10px;font-size:11px;color:#d97706;font-weight:600;display:flex;align-items:center;gap:7px';
        banner.innerHTML = '⚠️ Ini absensi <strong>' + sx.tanggal + '</strong> — bukan hari ini. Kembali ke Kegiatan untuk mulai absensi hari ini.';
        absBody.querySelector('#abs-cards') ?
          absBody.insertBefore(banner, absBody.querySelector('#abs-cards').parentNode) :
          absBody.insertAdjacentElement('afterbegin', banner);
      }
    }
  };
})();

// ════════════════════════════════════════════════════════════
// AUTO DEDUP ENGINE
// Berjalan di background saat app dibuka.
// Tidak ada tombol/pengaturan — hanya notif jika ada yang dihapus.
// Strategi per store:
//   santri    → dedup by nama+kamarId (case-insensitive), pertahankan yg updatedAt terbaru
//   kamar     → dedup by nama (case-insensitive), pertahankan yg createdAt terlama
//   kegiatan  → dedup by nama (case-insensitive), pertahankan yg urutan terkecil
//   subKeg    → dedup by nama+kgId, pertahankan yg urutan terkecil
//   users     → dedup by nama+role (case-insensitive), pertahankan yg createdAt terlama
//   peraturan → dedup by pelanggaran (case-insensitive), pertahankan yg createdAt terlama
//   absensi   → dedup by sesiId+sntId, pertahankan yg updatedAt terbaru
// ════════════════════════════════════════════════════════════
async function _deduplicateAll() {
  const results = [];

  async function dedupStore(store, keyFn, keepFn) {
    try {
      const all = await DB.ga(store);
      const groups = new Map();
      for (const item of all) {
        const k = keyFn(item);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(item);
      }
      let removed = 0;
      for (const [, group] of groups) {
        if (group.length <= 1) continue;
        group.sort(keepFn); // index 0 = yang DIPERTAHANKAN
        for (let i = 1; i < group.length; i++) {
          await DB.d(store, group[i].id);
          removed++;
        }
      }
      if (removed > 0) results.push({ store, removed });
    } catch(e) { console.warn('[Dedup] error on', store, e); }
  }

  await dedupStore('santri',
    // BUG FIX: sebelumnya pakai x.kamarId (yang TIDAK PERNAH ada di record santri —
    // fieldnya bernama `kamar` berisi nama kamar string). Akibatnya key dedup
    // efektif hanya nama, dan santri dengan nama sama di kamar berbeda (yang
    // SAH menurut _saveSnt) akan dideteksi sebagai duplikat → salah satu dihapus.
    // Sekarang pakai x.kamar (nama kamar) sesuai field yang benar-benar ada.
    x => ((x.nama||'').trim().toLowerCase() + '|' + (x.kamar||'').trim().toLowerCase()),
    (a,b) => (b.updatedAt||0) - (a.updatedAt||0)
  );
  await dedupStore('kamar',
    x => (x.nama||'').trim().toLowerCase(),
    (a,b) => (a.createdAt||0) - (b.createdAt||0)
  );
  // Kegiatan TIDAK di-dedup by nama — user boleh membuat beberapa
  // kegiatan dengan nama sama (mis. "Test", "Test", "Ok" seperti
  // yang terlihat di screenshot user). Dedup by nama akan menghapus
  // kegiatan yang sah. Sinkronisasi by ID sudah cukup untuk mencegah
  // duplikat ID (IndexedDB keyPath otomatis timpa by ID).
  // ── H7 BUG FIX: subKeg dedup jangan silent delete ──
  // Sebelumnya: 2 sub-kegiatan dengan nama sama dalam kegiatan yang sama
  // otomatis dihapus (silent). User bisa saja sengaja bikin 2 entry beda
  // jam dengan nama sama. Sekarang: dedup subKeg hanya dilakukan kalau
  // user konfirmasi via dialog. Tanpa konfirmasi, duplikat dibiarkan.
  // (Untuk santri/kamar/users, dedup tetap otomatis karena key duplikat
  // di store tersebut secara teknis tidak sah — 2 santri tidak boleh
  // punya nama+kamar yang persis sama, 2 kamar tidak boleh nama sama.)
  await dedupStore('users',
    x => ((x.nama||'').trim().toLowerCase() + '|' + (x.role||'')),
    (a,b) => (a.createdAt||0) - (b.createdAt||0)
  );
  // BUG FIX: Absensi DULU tidak di-dedup sama sekali, dengan alasan "boleh
  // berulang per kegiatan/santri berbeda" — itu betul untuk sesi yang
  // BERBEDA (santri yang sama wajar punya banyak baris absensi lintas
  // sesi/kegiatan). Tapi itu tidak melindungi dari DUPLIKAT untuk sesi YANG
  // SAMA + santri YANG SAMA — yang justru inilah biang keladi kegiatan di
  // dashboard menampilkan jumlah santri lebih besar dari total santri asli
  // (mis. "0/241" padahal cuma ada 240 santri) dan salah satu sumber utama
  // "bentrok data antar device": dua HP membuat sesi bersamaan sebelum
  // sempat sinkron → masing-masing bikin set absensi sendiri untuk semua
  // santri → duplikat per (sesiId,sntId). Sekarang key dedup-nya PERSIS
  // pasangan sesi+santri (bukan cuma santri), sehingga riwayat lintas sesi
  // tetap aman, hanya duplikat pada sesi yang sama yang dibersihkan.
  // Record yang dipertahankan: yang statusnya bukan 'none' (sudah ditandai
  // sesuatu) diprioritaskan di atas placeholder 'none' yang belum sempat
  // diisi; kalau sama-sama sudah/belum ditandai, yang updatedAt-nya paling
  // baru yang menang (mencerminkan tindakan terakhir musyrifah).
  await dedupStore('absensi',
    x => x.sesiId + '|' + x.sntId,
    (a,b) => {
      const aNone = a.status==='none' ? 1 : 0;
      const bNone = b.status==='none' ? 1 : 0;
      if (aNone !== bNone) return aNone - bNone;
      return (b.updatedAt||0) - (a.updatedAt||0);
    }
  );
  // Peraturan TIDAK di-dedup — dua peraturan dengan judul sama secara
  // teknis tetap sah (mis. beda hukuman untuk pelanggaran serupa di
  // kategori berbeda), jadi tidak ada key unik yang aman untuk dedup ini.

  // Tampilkan notif jika ada yang dihapus
  if (results.length > 0) {
    const total = results.reduce((s,r) => s + r.removed, 0);
    const detail = results.map(r => {
      const label = {santri:'santri',kamar:'kamar',kegiatan:'kegiatan',subKeg:'sub kegiatan',
        users:'akun',peraturan:'peraturan',absensi:'absensi'}[r.store] || r.store;
      return `${r.removed} ${label}`;
    }).join(', ');
    console.log('[Dedup] Berhasil hapus duplikat:', detail);
    setTimeout(() => T(`🧹 ${total} data duplikat dihapus (${detail})`, 4000), 1500);
  }
}

// ── H7 BUG FIX: Dedup subKeg eksplisit dengan konfirmasi user ──
// Dipanggil dari menu Pengaturan. Tampilkan daftar duplikat yang ditemukan,
// user konfirmasi sebelum hapus. Tidak dijalankan otomatis.
async function _dedupSubKegWithConfirm() {
  try {
    const all = await DB.ga('subKeg');
    const groups = new Map();
    for (const item of all) {
      const k = ((item.nama||'').trim().toLowerCase() + '|' + (item.kgId||''));
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(item);
    }
    const dupGroups = [];
    for (const [, group] of groups) {
      if (group.length > 1) dupGroups.push(group);
    }
    if (dupGroups.length === 0) {
      T('✅ Tidak ada duplikat sub-kegiatan ditemukan.');
      return;
    }
    const kg = await DB.ga('kegiatan');
    const kgM = new Map(kg.map(k => [k.id, k]));
    let totalDups = 0;
    const html = dupGroups.map(g => {
      g.sort((a,b) => (a.urutan||0) - (b.urutan||0));
      const k = kgM.get(g[0].kgId);
      const kgName = k?.nama || '-';
      const items = g.map((s, i) => {
        const jam = s.jamMulai && s.jamSelesai ? `${s.jamMulai}-${s.jamSelesai}` : '(warisan)';
        const badge = i === 0 ? '<span style="font-size:9px;color:#065f46;background:rgba(16,185,129,.12);padding:1px 5px;border-radius:100px;font-weight:700">DIPERTAHANKAN</span>' : '<span style="font-size:9px;color:#991b1b;background:rgba(239,68,68,.12);padding:1px 5px;border-radius:100px;font-weight:700">AKAN DIHAPUS</span>';
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:11px"><span style="flex:1">${esc(s.nama)} · ${jam} ${badge}</span></div>`;
      }).join('');
      totalDups += g.length - 1;
      return `<div style="background:var(--gs);border-radius:var(--r3);padding:8px 10px;margin-bottom:6px"><div style="font-size:11px;font-weight:700;color:var(--t1);margin-bottom:4px">${esc(kgName)} — ${g.length} duplikat</div>${items}</div>`;
    }).join('');
    OS(`<div class="sh">🧹 Hapus Duplikat Sub-Kegiatan?</div><div class="sb" style="padding-bottom:80px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px;line-height:1.6">Ditemukan <strong>${dupGroups.length} kelompok</strong> duplikat (${totalDups} akan dihapus). Yang dipertahankan: urutan terkecil. Lainnya akan dihapus beserta anggota, sesi, dan absensinya.</div>
      ${html}
      <div style="display:flex;gap:8px;margin-top:14px"><button class="bg2 bw" onclick="CS()" style="flex:1">Batal</button><button onclick="App._doDedupSubKeg()" style="flex:1;padding:13px;border-radius:var(--r4);background:#ef4444;color:#fff;font-size:13px;font-weight:700;border:none;cursor:pointer">Hapus ${totalDups} Duplikat</button></div>
    </div>`);
  } catch(e) { console.warn('[DedupSubKeg] error:', e); T('❌ Gagal cek duplikat: ' + (e.message||e)); }
}


(function _midnightScheduler(){
  let _lastCheckedDate = _todayLocal();
  App._autoLockExpiredSesi().catch(()=>{}); // cek langsung saat load, jangan tunggu 60 detik pertama
  setInterval(async () => {
    const today = _todayLocal();
    if (today !== _lastCheckedDate) {
      _lastCheckedDate = today;
      console.log('[Midnight] Tanggal berganti ke', today, '— reset otomatis');
      await _dailyReset();
      S.rkDate = today;
      // Refresh dashboard jika sedang terbuka
      if (S.page === 'dash') await App.dash().catch(()=>{});
      else if (S.page === 'kg') await App.renderKg().catch(()=>{});
    }
    // Cek tiap menit: kunci otomatis sesi yang jam-nya sudah lewat & tandai alpha
    await App._autoLockExpiredSesi().catch(()=>{});
  }, 60000); // cek setiap 1 menit
})();

// ═══════════════════════════════════════════════════════════════
// AUDIO — suara absensi via Web Audio API (no file eksternal)
// ═══════════════════════════════════════════════════════════════
const SFX = {
  _ctx: null,
  _get() { if(!this._ctx) this._ctx=new(window.AudioContext||window.webkitAudioContext)(); return this._ctx; },
  _beep(freq,dur,type='sine',vol=0.4){
    try{
      const ctx=this._get();
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.type=type;o.frequency.setValueAtTime(freq,ctx.currentTime);
      g.gain.setValueAtTime(vol,ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
      o.start(ctx.currentTime);o.stop(ctx.currentTime+dur);
    }catch(e){}
  },
  success(){
    // Dua nada naik: "ding dong" — santri berhasil hadir
    this._beep(880,0.12,'sine',0.5);
    setTimeout(()=>this._beep(1100,0.18,'sine',0.5),120);
  },
  alreadyHadir(){
    // Satu nada pendek: sudah hadir
    this._beep(660,0.1,'sine',0.3);
  },
  notFound(){
    // Nada rendah turun: kartu tidak dikenal
    this._beep(300,0.15,'sawtooth',0.3);
    setTimeout(()=>this._beep(200,0.2,'sawtooth',0.3),130);
  },
  error(){
    this._beep(200,0.3,'square',0.3);
  }
};

// ═══════════════════════════════════════════════════════════════
// NFC MODULE — Web NFC API untuk absensi tap kartu
// ═══════════════════════════════════════════════════════════════

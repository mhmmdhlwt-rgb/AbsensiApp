(function(){
  'use strict';

  // ── Sidebar brand title ─────────────────────────────────────
  async function _updateSnavBrand(){
    try{
      const asrama=(await DB.g('settings','asrama'))?.value||'';
      const tipe=(await DB.g('settings','lembaga_tipe'))?.value||localStorage.getItem('tenant_tipe')||'asrama';
      const prefix=tipe==='pondok'?'Pondok Pesantren':'Asrama';
      const appName=asrama?(prefix+' '+asrama):'Absensi Santri';
      const t=document.getElementById('snav-brand-title');
      if(t)t.textContent=appName;
    }catch(e){}
  }

  function _updateSnavActive(){
    const pg=S.page;
    document.querySelectorAll('.snav-item').forEach(it=>{
      it.classList.toggle('on',it.dataset.p===pg);
    });
  }

  function _updateSnavUser(){
    const el=document.getElementById('snav-user');
    if(el&&S.user)el.textContent=S.user.nama||'-';
  }

  // ── Patch App.nav untuk update sidebar ──────────────────────
  if(typeof App!=='undefined'&&App.nav){
    const _origNav=App.nav.bind(App);
    App.nav=async function(pg,opts={}){
      const r=await _origNav(pg,opts);
      _updateSnavActive();
      _updateSnavUser();
      return r;
    };
  }

  // ── Patch App.back untuk restore page setelah chat close ───
  let _preChatPage=null;
  if(typeof App!=='undefined'&&App.back){
    const _origBack=App.back.bind(App);
    App.back=function(){
      if(S.page==='chat'&&_preChatPage){
        _origBack();
        // PATCH 7 sets S.page='dash' — restore ke page sebelum chat
        setTimeout(()=>{
          if(_preChatPage&&S.page==='dash'){
            S.page=_preChatPage;
            _updateSnavActive();
          }
          _preChatPage=null;
        },50);
        return;
      }
      _origBack();
    };
  }

  // ── Patch OS() untuk inject close button (✕) ke #bs ─────────
  // Inject ke #bs (sheet container) bukan #bs-hd, supaya button
  // tetap di posisinya saat konten di-scroll.
  if(typeof OS==='function'){
    const _origOS=OS;
    window.OS=function(h){
      _origOS(h);
      setTimeout(()=>{
        const bs=document.getElementById('bs');
        if(!bs)return;
        let btn=bs.querySelector('.desktop-sheet-close');
        if(!btn){
          btn=document.createElement('button');
          btn.className='desktop-sheet-close';
          btn.innerHTML='✕';
          btn.title='Tutup (Esc)';
          btn.onclick=(e)=>{e.stopPropagation();CS();};
          bs.appendChild(btn);
        }
      },20);
    };
  }

  // ── Backup: mousedown di luar #bs → CS() ────────────────────
  // Memastikan klik di area overlay (atau mana pun di luar sheet)
  // selalu menutup sheet, bahkan jika onclick="CS()" gagal.
  document.addEventListener('mousedown',function(e){
    const so=document.getElementById('so');
    const bs=document.getElementById('bs');
    if(!so||!so.classList.contains('on'))return;
    if(bs&&bs.contains(e.target))return;
    // Klik di luar sheet → tutup
    CS();
  },true);

  // ── Chat sebagai modal: observe #pg-chat class changes ─────
  const chatEl=document.getElementById('pg-chat');
  const chatBackdrop=document.getElementById('chat-backdrop');
  if(chatEl&&chatBackdrop){
    const observer=new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        if(m.attributeName==='class'){
          const isOn=chatEl.classList.contains('on');
          chatBackdrop.classList.toggle('on',isOn);
          if(isOn){
            // Chat baru dibuka — simpan page sebelumnya
            if(S.page!=='chat')_preChatPage=S.page;
          }
        }
      });
    });
    observer.observe(chatEl,{attributes:true,attributeFilter:['class']});
    // Klik backdrop → tutup chat
    chatBackdrop.addEventListener('click',function(){
      if(typeof App!=='undefined')App.back();
    });
  }

  // ── Patch _updateIznBadge untuk mirror ke sidebar ──────────
  if(typeof App!=='undefined'&&App._updateIznBadge){
    const _origIzn=App._updateIznBadge.bind(App);
    App._updateIznBadge=async function(){
      await _origIzn();
      try{
        const b=document.getElementById('izn-badge');
        const sb=document.getElementById('snav-izn-badge');
        if(sb&&b){
          const n=b.textContent;
          if(b.style.display!=='none'&&n){
            sb.textContent=n;
            sb.style.display='flex';
          }else{
            sb.style.display='none';
          }
        }
      }catch(e){}
    };
  }

  // ── Mirror chat badge ke sidebar ────────────────────────────
  const _origSetBadge=window.ChatModule&&ChatModule.setBadge?
    ChatModule.setBadge.bind(ChatModule):null;
  if(_origSetBadge){
    ChatModule.setBadge=function(n){
      _origSetBadge(n);
      try{
        const sb=document.getElementById('snav-chat-badge');
        if(sb){
          if(n>0){
            sb.textContent=n>99?'99+':n;
            sb.style.display='flex';
          }else{
            sb.style.display='none';
          }
        }
      }catch(e){}
    };
  }

  // ── Keyboard shortcuts ──────────────────────────────────────
  document.addEventListener('keydown',function(e){
    const tag=(e.target&&e.target.tagName)||'';
    if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
    if(e.target&&e.target.isContentEditable)return;

    // Angka 1-6 → navigasi
    const map={'1':'dash','2':'kg','3':'snt','4':'rek','5':'pel','6':'set'};
    if(map[e.key]&&!e.ctrlKey&&!e.altKey&&!e.metaKey){
      e.preventDefault();
      if(typeof App!=='undefined'&&S.user)App.nav(map[e.key]);
    }
    // Esc → tutup sheet / chat / overlay
    if(e.key==='Escape'){
      const bs=document.getElementById('bs');
      if(bs&&bs.classList.contains('on')){CS();return;}
      const chatPg=document.getElementById('pg-chat');
      if(chatPg&&chatPg.classList.contains('on')){
        if(typeof App!=='undefined')App.back();
        return;
      }
    }
  });

  // ── Update brand saat dashboard render ──────────────────────
  if(typeof App!=='undefined'&&App.dash){
    const _origDash=App.dash.bind(App);
    App.dash=async function(){
      _updateSnavBrand();
      _updateSnavUser();
      return _origDash();
    };
  }

  // ── Init: update brand & active setelah login ───────────────
  const _origRenderLogin=window.renderLogin;
  if(_origRenderLogin){
    window.renderLogin=async function(){
      const r=await _origRenderLogin();
      _updateSnavBrand();
      _updateSnavActive();
      return r;
    };
  }

  // ── Polling ringan ──────────────────────────────────────────
  setInterval(()=>{
    _updateSnavActive();
    _updateSnavUser();
  },2000);

  console.log('[Desktop v2] Wiring aktif. Fixes: FAB removed, sheet close ✕, chat modal, absensi 1-col.');
})();

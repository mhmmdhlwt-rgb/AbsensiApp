// js/utils.js — AbsensiApp
'use strict';

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
// BUG FIX (root cause of "bentrok data antar device" & jumlah santri di
// kegiatan > total santri): dulu setiap kali sebuah sesi absensi dibuat,
// kode membuat SATU dokumen absensi per santri dengan id RANDOM (uid()).
// Kalau 2 device/HP membuka kegiatan yang sama nyaris bersamaan (atau
// listener/tombstone belum sempat sinkron), kedua device sama-sama tidak
// menemukan sesi tsb secara lokal, sehingga KEDUANYA membuat set absensi
// baru untuk seluruh santri — hasilnya dokumen absensi DUPLIKAT untuk
// santri yang sama pada sesi yang sama. Duplikat ini yang membuat
// penghitungan "hadir/total" di dashboard bisa lebih besar dari jumlah
// santri sebenarnya (mis. 0/241 padahal total santri cuma 240), dan juga
// jadi sumber "bentrok" data karena dua device saling menimpa record
// yang berbeda-beda untuk orang yang sama.
// Solusi: id absensi dibuat DETERMINISTIK dari sesiId+sntId. Kalau 2
// device membuat "record awal" untuk santri yang sama di sesi yang sama,
// keduanya akan menulis ke DOKUMEN Firestore YANG SAMA (id sama) —
// otomatis tidak ada duplikat, siapa pun yang menulis terakhir yang menang
// (atau malah tidak masalah karena isinya identik).
const absDetId=(sesiId,sntId)=>'abs_'+sesiId+'_'+sntId;
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escJ=s=>String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\\\'").replace(/"/g,'&quot;').replace(/</g,'\\x3c').replace(/>/g,'\\x3e').replace(/\n/g,'\\n').replace(/\r/g,'\\r');
const mapBy=(arr,k)=>{const m={};arr.forEach(x=>m[x[k]]=x);return m};
const bdgCls=st=>({hadir:'bh3',alpha:'ba',izin:'bi',sakit:'bs4',terlambat:'bt',uzur:'bu',none:'ba'})[st]||'ba';
const stCls=st=>({hadir:'sh2',alpha:'sa',izin:'si',sakit:'ss',terlambat:'sl2',uzur:'su',none:'sn-none'})[st]||'sa';
const btnCls=st=>({hadir:'ah',alpha:'aa',izin:'ai',sakit:'as',terlambat:'at',uzur:'au',none:''})[st]||'';
// ── NAME NORMALIZATION (untuk matching yang robust) ───────────
// Dipakai oleh _doImport (fallback matching) & _syncNfcAssalam.
// - lowercase
// - hapus diakritik (NFD + strip combining marks)
// - hapus apostrof termasuk curly ones
// - titik/hyphen/koma → spasi
// - collapse spasi berlebih
const _normNm=s=>String(s||'').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[\u2018\u2019\u02bc'`]/g,'')
  .replace(/[.\-_+,]/g,' ')
  .replace(/\s+/g,' ')
  .trim();
// ── DATA NFC UID ASRAMA ASSALAM ───────────────────────────────
// Hasil scan NFC UID kartu santri Asrama Assalam.
// Format: Nama, Kamar, NIS, NFC_UID  (NIS & NFC_UID opsional).
// Baris dengan "nama" murni angka (mis. "238, Umum") sudah dibuang
// karena itu data rusuk/bukan santri valid.
// Dipakai oleh App._syncNfcAssalam() untuk mencocokkan NFC UID
// ke record santri yang sudah ada (match by nama utama, NIS fallback).
const _ASSALAM_NFC_DATA=`Aghitsa Maulidya Alwi, X 1, 260909
Alvina Rahmadania, X 1
Aqila Lailatul Husna, X 1, 261072
Arsyaqiela Abida Rahma, X 1, 260637
Aulia Izzatun Nisa, X 1, 260035
Bilqiss Bazliyah, X 1, 231370
Chelsea Fatimatuzzahra, X 1, 260881
Dalyla Khidmaty Umy, X 1, 260527
Embun Filla Wahidtha, X 1, 260112
Fahnia Rahma, X 1, 260171
Funny Quin Neira, X 1, 260753
Jezcelyn Cantika Dewi, X 1, 260991
Khania Fitiyaatiqah, X 1, 260004
Lina Kholifatus Sakhiy, X 1, 260905
Nadya Aliatus Zahra, X 1, 261031
Naura Putri, X 1, 260172
Nayla Syadina Azzahra, X 1, 260144
Niki Yuktiana Zahra, X 1, 251812
Nur Ayla Maghfuri, X 1, 260138
Qinandaratihkhumairoh, X 1, 260318
Rizky Dzakira Talita, X 1, 260854
Yassir, X 1, 123456
Yumna Queisha Anya, X 1, 260961
Zuniyanda Savara, X 1, 260849
Adiba Khanza Alina, X 2, 260557, 19:29:4F:13
Airin Nazwa Salsabila, X 2, 260027, 4F:F5:57:63
Amelia Retazania Az Zahra, X 2, 260116, B9:2F:32:13
Aqilla Syifa Az-zahra, X 2, 261046, 9F:EC:05:C1
Askia Zahwa Mikaila, X 2, 261267, 3F:37:5D:63
Auliya Zahra Talita, X 2, 260066, 7F:83:B2:63
Dwinta Fitri Manda Sari, X 2, 212040, E7:AA:02:FB
Fakhira Asyabiya Rafifa, X 2, 212012, 7F:55:47:C1
Inas Tahta Maulaya, X 2, 210383, 1D:C3:DB:A1
Nafisa Dinar S, X 2, 260038, BF:15:14:C1
Nafisah, X 2
Nazwa Ayu Putri Khumairoh, X 2, 261078, 1F:B6:1B:C1
Nissa Ausyifa, X 2, 260689, DF:17:70:C1
Rara Ramadhani, X 2, 260308
Sabrina Hayyun Rizquna, X 2, 260304, F7:02:32:FB
Sofi Karomatus, X 2, 260926, AF:83:27:C1
Yulia Pertiwi, X 2, 260870, 2F:B5:37:C1
Alina Latifatul Qolbi, X 3, 220498
Angelina Syela Octavia, X 3, 230117, DF:EB:5C:C1
Annastasya Putri Okyta, X 3, 250141
Calista Tahra Sabrina, X 3, 241148, 4F:A6:1E:63
Fauziyah Syabilla Syamdina, X 3, 210218, 4D:29:0B:A2
Ica Novita Sari, X 3, 241652, DD:70:2B:C3
Lubnah Humairoh, X 3, 221190, 0F:3D:28:63
Putri Dewi Nur Fadilah, X 3, 230180, EA:BD:22:0C
Safira Budi Rindiani, X 3, 231326, 8F:40:C5:63
Siti Nur Azizah, X 3, 251580, DF:59:86:63
Zazkia Alfira Maulida, X 3, 240473
Aida Duwi Aprilliya, X 4, 250957
Asyifa Qolbi Putri Riflina, X 4, 240308
Azkayra Syakira Edityas, X 4, 250995
Dhea Rani Safira Putri, X 4, 210534
Faizzah Nahla, X 4, 241103
Karima Fajrunnada, X 4, 250502
Karunia Putri Sherly Suryanto, X 4, 250357
Komang Azida Qotrun N, X 4, 240088
Nada Salsabila, X 4, 212206
Nuzulia Farah Fanisa Putri, X 4, 241256
Qori Raisa Putri, X 4, 251039
Silna Faradisa, X 4, 250794
Zaskia Alfira Maulida, X 4, 240473
Aida Faizah, X 5, 230281, 0A:94:51:0C
Aisyah Rahma Ababil, X 5, 201088
Alifiya Khoirunnisa, X 5, 250854, 7F:CB:55:63
Ananda Veronika, X 5, 221412, 06:43:E4:9E
Deswinta Cindy Cloudia, X 5, 210653, EE:3E:8B:39
Filza Aliana Farzana, X 5, 212101
Khanza Nararya Mada A.w, X 5, 251298, 1F:07:93:63
Lutvia Reza Itqiyana, X 5, 250891, 7F:4A:89:63
Renita Disya Febrianti, X 5, 240811, 9E:C0:6A:39
Siti Aisyah, X 5, 241736, 4E:D6:78:39
Siti Astika Nuri Juwita, X 5, 241688, 1E:2F:90:39
Wulan Ramadaniah, X 5, 251296, 1F:AA:B2:63
Zaskia Aulia Nafisah, X 5, 240503, 3E:8D:8E:39
Afifah Azza Salsabila, X 6, 240721, 3D:99:08:A2
Aureliza Rahma, X 6, 250089, 2D:D1:39:C3
Azka Nadia Ar Rosyid, X 6, 212190, 5F:EC:9B:63
Azkiya Nada Ar Rosyid, X 6, 212191, 7F:AF:86:63
Cinta Nurmala, X 6, 220892, EF:7E:3E:63
Deffa Julyana Nur Aini, X 6, 210737, CE:A8:83:39
Desi Dwi Anggraini, X 6, 240812, 9D:BD:AD:1B
Dinda Adrillea Saleha, X 6, 230389, 1F:91:3D:63
Keyla Dwi Herlambang, X 6, 240121, 9F:00:1C:63
Khusnia Syafa Salsabila, X 6, 251372, 2D:A2:D3:A1
Nur Auliya Sandy, X 6, 231632, 8F:38:89:63
Raina Labibah Yusuf, X 6, 250065, 1F:59:02:64
Raisa Putri Novitasari, X 6, 220424, CF:54:40:63
Sofia Nabila, X 6, 231084, 77:CF:3C:FB
Syafinatun Nadja, X 6, 241022
Syahron Oktavia Putri, X 6, 201033
Wiken Asmarani Putri, X 6, 220112, DF:1E:A4:63
Yaqut Izzatul Wafiroh, X 6, 210052
Andini Larasati Herlambang, X 7, 210156
Dhea Feby Asiska, X 7, 231089, 9F:0F:02:64
Faiqoh Abidah, X 7, 221169, BF:C4:21:63
Fikroh Abidah, X 7, 221171, 51:10:79:04
Julia Raida Khansa, X 7, 240725, 9E:8B:72:39
Larisa Izza Salsabila, X 7, 250944, BA:C6:8A:15
Naura Zulfa Choirunnisa, X 7, 240645
Nazwa Dwi Rahmadani, X 7, 220029, 4F:E1:86:63
Nila Juniar Sukma Ayu, X 7, 201025
Nurul Azizatul M., X 7, 231202, 69:BE:3B:13
Putri Aulia, X 7, 212173, 9A:FF:5F:15
Quilla Alma Nafiz, X 7, 250780, EF:86:A1:63
Sarah Aliya, X 7, 240782
Shafa Aulia Ramadani, X 7, 230082, DF:52:0A:C1
Syifa Al Hasna, X 7, 221589
Tazkya Nuraini Mirdi, X 7, 260715
Vina Nailatul Izza, X 7, 241773, EE:BC:73:39
Aini Zahrotussita, X 8, 251295, 4F:69:92:63
Aisya Syabila, X 8, 210071, 0E:02:78:39
Alexa Kharomi Alfian Putri, X 8, 250187, EF:3D:B0:63
Ayu Rahma Nur Safira, X 8, 210042, AE:B6:4F:39
Bilqis Azra Qonita, X 8, 240797, FE:F9:56:39
Durrotun Nafisah, X 8, 230164
Emilda Aulia Sabia Putria, X 8, 220626, BF:AE:87:63
Fitriatul Ulumiah, X 8, 241288, BF:7D:17:63
Icha Pipi Riyanti, X 8, 220435, 99:24:52:13
Kasyifa Roghida Ramadani, X 8, 250916, 7F:25:89:63
Lathiifa Nur Aini, X 8, 231723, A9:6F:37:13
Melanie Septia R., X 8, 240789, 0E:92:55:39
Nabila Budi Asih, X 8, 210745, 2E:AA:83:39
Nabila Ramadani Setyowati, X 8, 231527, 3A:F9:63:D9
Nadia Fatimatus Salwa, X 8, 250455, CF:B4:23:63
Nadila Misya Elsyarif, X 8, 240022, 4F:7F:29:63
Najla Muthia Afandi, X 8, 250188, 8D:9B:F5:1B
Nita Khoirun Nisa, X 8, 241440
Nova Ayuk H. S, X 8, 240577
Pinandita Annisa Dewi, X 8, 250243, 7F:7F:8D:63
Pinnkan Alfiana Aulia, X 8, 250389
Queena Rossalina Zayyin, X 8, 231049, 0F:8B:D1:63
Salwa Danya Azzahra, X 8, 250632, 6F:D1:A2:63
Sheenas Dhia Raysha Windria, X 8, 241258, 0E:16:78:39
Shila Rahmatil Ummah, X 8, 220805
Umi Titimah Nafiah, X 8, 250928, 0F:1F:94:63
Afita Rizki Maulidia, X 9, 241128, 77:30:FF:FA
Alya Nur Facia, X 9, 230762, 89:E5:4C:13
Amalia Sholeha, X 9, 230086, EF:1D:B2:63
Aulia Azhahra, X 9, 211883, CF:94:A7:63
Aydin Dzakira Sadana Dias, X 9, 220138, 2F:48:B0:63
Claricha Puri Wardani, X 9, 250516, EF:F8:54:C1
Clourinda Anatasya Widodo, X 9, 211078, 2E:DD:52:39
Dhanisa Alfira, X 9, 240273, 7F:6E:30:63
Dinda Nur Aulia Sya'ban Ningrum, X 9, 211628, 7F:01:2B:63
Gelsi Shayla Rizqia, X 9, 220478, 4F:41:89:63
Hilma Fakhrunnisa, X 9, 251264, FF:6D:B7:63
Naila hasanati matnaim, X 9, , 1F:4A:90:63
Nasywa Ulin Nuha, X 9, 241865, 0F:C0:85:63
Natasya Aulia, X 9, 240106, 1E:83:7F:39
Nurul Hidayah, X 9, 231386
Raudatul Muslimah, X 9, 230964, 5D:EB:F7:A1
Shifa Mura, X 9, 250217
Syakila Pramesti N., X 9, 241019, 9D:90:39:C3
Umi Wahidah Haromaini, X 9, 250520, 0F:D3:AC:63
Zasmin Mutiara Sifa Anggraini, X 9, 251184, BF:3B:D4:63
Apter Septa P., X 10, 241004, DE:6B:65:39
Assyifa Adzwa, X 10, 221965, AF:BB:A0:63
Aulia Nuril Maulida, X 10, 212192, EF:16:9E:63
Azzahra Asyifa, X 10, 250508, 8D:54:50:C3
Cici Fathiha Russdya Addine, X 10, 240096, 4E:77:94:39
Cinta Ramadani, X 10, 240792, FF:AF:B2:63
Hanna Qoyyimatuz Z., X 10, 250360, 4D:71:35:C3
Janeta Muthia Nur Rohmah, X 10, 210053, EE:58:8B:39
Kayla Mei Esyanti, X 10, 230242, 1A:F3:64:D9
Keysa Safa Al Azka, X 10, 241074, 8E:48:8F:39
Leoni Anas Adelia, X 10, 241421, 1F:50:8B:63
Mirza Ilyana, X 10, 240940, AF:B6:50:63
Nadzif Qolbi Azkia, X 10, 241280, 6E:7E:91:39
Naswa Azalea Salsabila S., X 10, 240602, 4F:87:03:C1
Nayla Kroirun Nisa, X 10, 240223, 5E:51:60:39
Nayla Sasy Kirana, X 10, 240428, 1E:76:66:39
Nazwa Zillian Sutanto, X 10, 230700, DF:CD:23:C1
Sasha Aunia, X 10, 240694, AE:A9:54:39
Siti Athaya Sabrina Wijaya, X 10, 220997, EE:58:7B:39
Syafira Keyla Nazwa, X 10, 231139, DF:94:13:C1
Ulil Mar'atul Hidayah, X 10, 241173, CF:34:DA:63
Adila Humairo, X 11, 230097
Anisa Azka Khoirunnisa, X 11, 250558, 7F:77:8D:63
Cindy Lailatul Khumairoh, X 11, 230701, DA:94:69:D9
Cintya Sari Devi, X 11, 231241, 59:33:37:13
Elmira Savana Octavia, X 11, 251433
Endang Sri Rahayu, X 11, 220309
Farah Kiki Ariska, X 11, 241512
Ghilfana Mufidah, X 11, 241045
Ita Iqomatul Lutfiah, X 11, 241179, AF:8A:49:63
Jihan Mirza F., X 11, 241075
Kaiya Tertia Nafeza, X 11, 250451, CF:20:9E:63
Khintan Kirarla Putri, X 11, 240129, 4E:B4:82:39
Linda Anggun Kartika Dewi, X 11, 211736
Nada Salsabia, X 11, 212206
Naura Allisyahana, X 11, 220207, 8F:4E:25:63
Ngindiana Zulfa Safitri, X 11, 250716, E7:E9:1C:FB
Nihayatul Wafiroh, X 11, 241469, 0E:C5:86:39
Nurfarida Izzatul W, X 11, 241087, BF:D4:9C:63
Rasya Hidaytul Umami, X 11, 251428, 9D:4B:DD:A1
Salsabela Azelia Alzahra, X 11, 240734, FE:09:92:39
Shabrina Amalia Putri, X 11, 220269, 5E:9C:66:39
Wahyu eka leistari, X 11, , EF:7C:29:63
Wayan Kahla Aynum Mahya, X 11, 251399, DF:C2:47:63
Zahrotul Jannah, X 11, 251008, 0F:65:3A:63
Zulfa Anisa, X 11, 240719, 3F:3C:1E:63
Agas Tiara, X 12, 261632, C9:17:38:13
Amira Putri Hamdani, X 12, 260491, EF:89:55:63
Ani Salamah, X 12, 260006, 69:92:37:13
Annisa Faiha, X 12, 260890, 3F:DF:1E:C1
Aurel Aurora, X 12, 261077, 7F:2B:68:63
Azahra Zulfiyah, X 12, 260071, 6F:C1:57:63
Huri Hilyatul Ifadah, X 12, 261188, 59:99:67:13
Imani Nurul Khusna, X 12, 260814, 1F:40:34:C1
Isroh Hikmah Yani, X 12, 220801, 4A:55:53:15
Izza Bilqis Kamilah, X 12, 260008, 8F:12:62:63
Masayu Clarista Wibowo, X 12, 260725, D9:72:3B:13
Mutiara, X 12
Quinzah Maharani, X 12, 260317, CF:B0:05:C1
Renata Angelina, X 12, 261137, 69:1A:35:13
Altifatuzzahro Al Ajmala, Pengurus
Desi Oktaviani, Pengurus
Dian Muhajiroh, Pengurus
Hana Asyifa Qurotul A'yuni, Pengurus
Hanum Nasruddin, Pengurus
Hilda Aurellia Ayu Septi D, Pengurus
Kania Maharani Setiowati, Pengurus
Rintan Anggraini Yulia S, Pengurus
Siska Nur Azizah, Pengurus, , 2A:39:8E:15
Sofiatul Munawaroh, Pengurus, , 61:6A:21:33
Wike Ayu Alvionita, Pengurus
Ana Auliya Q. Q, Mba-mba
Della Rosita, Mba-mba
Elok Syakirotun Ni'mah, Mba-mba
Faridatul Amanah, Mba-mba
Hikmah Nur Salsabila, Mba-mba
Lilik Hidayati, Mba-mba
Sandia Muqodimah, Mba-mba
Siti Maesaroh, Mba-mba`;


// ── UZUR (HAID) MANAGEMENT ────────────────────────────────────
// Deteksi kegiatan shalat berdasarkan nama (parent kegiatan ATAU sub-kegiatan).
// Pattern: shalat, sholat, subuh, dzuhur/zuhur, ashar/asar, maghrib, isya/isha,
// tahajud, qiyamul. Case-insensitive.
const _SHALAT_RE=/(shalat|sholat|subuh|dzuhur|zuhur|ashar|asar|maghrib|isya|isha|tahajud|qiyamul|qiyam|jamaah|jemaah)/i;
function _isShalatKegiatan(kgName,subName){
  return _SHALAT_RE.test(String(kgName||''))||_SHALAT_RE.test(String(subName||''));
}
// Hitung selisih hari kalender antara tglMulai (ISO date) dan tanggal hari ini.
// Hari ke-1 dimulai dari tglMulai.
function _uzurDayCount(tglMulai){
  if(!tglMulai)return 1;
  const start=new Date(tglMulai+'T00:00:00');
  const today=new Date(_todayLocal()+'T00:00:00');
  const diff=Math.floor((today-start)/86400000);
  return Math.max(1,diff+1);
}

const S={
  theme:localStorage.getItem('th')||'light',user:null,page:'dash',stack:[],
  absKamar:'Semua',sntKamar:'Semua',
  rkTab:'harian',rkMonth:new Date().getMonth(),rkYear:new Date().getFullYear(),
  rkDate:_todayLocal(),rkKgId:null,
  _sesiId:null,_skId:null,_icon:'📅',
  _profilId:null,_profilTab:'identitas',
  _pelFilter:'semua',_pelFotos:[],_tazirFotoB64:'',_pelSelSnt:new Set(),_pelListTab:'auto',
};

function T(m,d=2200){const e=document.getElementById('toast');e.textContent=m;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),d)}
// Mode Admin (PIN) sekarang HANYA untuk aksi berisiko tinggi & tidak bisa
// dibatalkan: reset semua data, pulihkan backup (replace semua data),
// menghapus data yang sudah terinput (santri/kegiatan/kamar/catatan/
// pelanggaran/peraturan/kalam/user/perizinan/absensi), mengubah/menghapus
// riwayat & timeline (absensi terkunci, riwayat perizinan), dan catatan
// psikologis (rahasia). Semua musyrifah/admin yang login BISA melakukan
// operasi CRUD normal lainnya (tambah/edit santri, kegiatan, kamar,
// catatan, peraturan, kalam, user, dll) tanpa perlu Mode Admin.
function _needAdmin(){
  if(S._adminMode===true)return true;
  T('\uD83D\uDD12 Khusus Admin. Aktifkan Mode Admin di Pengaturan.');
  return false;
}
function OS(h){
  // Pisah .sh (judul) dari konten scrollable
  const bs=document.getElementById('bs');
  const hd=document.getElementById('bs-hd');
  const si=document.getElementById('si');
  // Parse: ambil bagian pertama .sh jika ada
  const tmp=document.createElement('div');tmp.innerHTML=h;
  const shEl=tmp.querySelector('.sh');
  if(shEl){
    hd.innerHTML=shEl.outerHTML;
    hd.style.display='block';
    shEl.remove();
    si.innerHTML=tmp.innerHTML;
    // Recalc .sb height: 92vh - bh2(~17px) - sh(~43px)
    si.style.height='calc(92vh - 60px)';
  } else {
    hd.innerHTML='';hd.style.display='none';
    si.innerHTML=h;
    si.style.height='calc(92vh - 17px)';
  }
  si.scrollTop=0;
  document.getElementById('so').classList.add('on');
  bs.classList.add('on');
  _showSheetCloseFab();
}
function CS(){
  document.getElementById('so').classList.remove('on');
  const bs=document.getElementById('bs');
  bs.classList.remove('on');
  bs.style.bottom='0px';
  const si=document.getElementById('si');
  if(si)si.style.height='';
  _hideSheetCloseFab();
  // Catatan: fitur pop-up Catat Sakit dari halaman absensi sudah dihapus.
  // Klik tombol 'S' (Sakit) sekarang langsung set status tanpa buka sheet.
  // Pembersihan state legacy tetap dijaga utk backward-compat.
  // Kalau sheet Edit Profil Santri ditutup sebelum scan NFC selesai/timeout,
  // hentikan listener-nya & kembalikan background scanning (jika sebelumnya aktif)
  if (App._epNfcAbort) {
    try{ App._epNfcAbort.abort(); }catch(e){}
    App._epNfcAbort = null;
    if (typeof NFC!=='undefined' && NFC._formScanning) {
      NFC._formScanning = false;
      if (NFC._formScanWasBgActive) setTimeout(()=>NFC.startBackground().catch(()=>{}), 300);
    }
  }
}
// Floating "Tutup" FAB — muncul tiap bottom-sheet (OS) terbuka, sembunyi saat CS()
function _showSheetCloseFab(){
  let fab=document.getElementById('sheet-close-fab');
  if(!fab){
    fab=document.createElement('button');
    fab.id='sheet-close-fab';
    fab.innerHTML='<span style="font-size:15px">✕</span> Tutup';
    fab.onclick=()=>CS();
    document.body.appendChild(fab);
  }
  fab.classList.remove('hide');
  fab.style.display='flex';
  // Re-trigger animation
  fab.style.animation='none';
  void fab.offsetWidth;
  fab.style.animation='';
}
function _hideSheetCloseFab(){
  const fab=document.getElementById('sheet-close-fab');
  if(!fab)return;
  fab.classList.add('hide');
  setTimeout(()=>{ if(fab && fab.classList.contains('hide')) fab.style.display='none'; }, 250);
}
function toggleTheme(){const t=S.theme==='dark'?'light':'dark';S.theme=t;localStorage.setItem('th',t);document.documentElement.setAttribute('data-theme',t);document.getElementById('theme-btn').textContent=t==='dark'?'\u2600':'\u263E';const tog=document.getElementById('dm-tog');if(tog)tog.checked=t==='dark'}
function applyTheme(){document.documentElement.setAttribute('data-theme',S.theme);const tb=document.getElementById('theme-btn');if(tb)tb.textContent=S.theme==='dark'?'\u2600':'\u263E'}


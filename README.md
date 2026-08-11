> **Update terbaru:**
> - **Pilih Pesantren** di halaman awal — device baru bisa memilih pesantren/asrama yang sudah terdaftar (PIN 4 digit per pesantren) atau daftar baru. Pesantren "Assalam" memakai PIN `2014`.
> - **Keluar/Ganti Pesantren** tersedia di halaman login & Pengaturan > Bahaya — membersihkan cache lokal device tanpa menyentuh data cloud.
> - **Login Admin** kini punya tombol nyata di halaman login (sebelumnya belum terpasang).
> - **Auto-lock kegiatan**: begitu jam selesai sub-kegiatan lewat, santri yang belum diabsen otomatis jadi Alpha & sesinya terkunci.
> - **Peringatan Alpha**: kalau santri Alpha di SEMUA kegiatan berjadwalnya hari ini, sistem otomatis kirim peringatan ke **Chat & Notifikasi** (dulu "Chat Musyrifah") supaya dicek keberadaannya.

# Deploy ke Vercel

## Cara 1 — Drag & Drop (paling cepat)
1. Buka https://vercel.com/new
2. Pilih "Deploy" tanpa Git, lalu drag folder ini (isi: `index.html`, `vercel.json`, `firebase-messaging-sw.js`, `api/`, `package.json`)
3. Klik Deploy — selesai, dapat URL `https://nama-project.vercel.app`

## Cara 2 — Vercel CLI
```bash
npm i -g vercel
cd folder-ini
vercel --prod
```

---

# 🔥 PANDUAN SETUP FIREBASE (Firestore) — Project Terpisah

Ini adalah **clone/salinan** dari aplikasi Absensi Assalam. Fitur, alur kerja,
dan tampilan dibuat semirip mungkin dengan aplikasi lama (hanya dipercantik
dengan tema Islami + glassmorphism) — **tapi backend-nya benar-benar
berbeda dan terisolasi**:

| | Aplikasi LAMA (production, jangan diubah) | Aplikasi INI (clone) |
|---|---|---|
| Backend | Realtime Database (RTDB) | **Cloud Firestore** |
| Firebase Project | `absensi-assalam` | **`myassalam-d45c5`** |
| Data | Tetap di RTDB, tidak disentuh | 100% terpisah di Firestore project baru |

Tidak ada path, collection, config, atau kredensial yang dibagikan antar
kedua aplikasi. Keduanya bisa jalan bersamaan tanpa saling memengaruhi.

Aplikasi ini pakai Firebase (project baru) untuk:
1. **Cloud Firestore** — sync data antar device (santri, absensi, izin, catatan, foto)
2. **Cloud Messaging (FCM)** — push notification ke HP saat ada pengajuan izin baru

## A. Firestore — sudah dikonfigurasi

`firebaseConfig` di `index.html` dan `firebase-messaging-sw.js` **sudah diisi**
dengan config project Firestore baru (`myassalam-d45c5`) — tidak perlu
diubah lagi kecuali kamu memindahkan ke project Firebase lain.

Yang masih perlu kamu lakukan di **Firebase Console** (project `myassalam-d45c5`):

### 1. Aktifkan Cloud Firestore
- Buka https://console.firebase.google.com/project/myassalam-d45c5
- **Build > Firestore Database > Create database**
- Pilih lokasi: `asia-southeast1` (Singapore — paling dekat ke Indonesia)
- Mode: **Production mode** (rules diatur manual, lihat langkah 2)

### 2. Set Firestore Security Rules
Aktifkan **Authentication > Sign-in method > Anonymous** lebih dulu, lalu deploy
`firestore.rules` dari repo ini. Rules sekarang membutuhkan `request.auth != null`
untuk data tenant agar database tidak terbuka publik.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tenants/{ns}/{store=**} {
      allow read, write: if request.auth != null;
    }
    match /registry/{ns} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }
  }
}
```

**Catatan keamanan**: Auth anonymous adalah pengaman minimal. Untuk produksi
yang lebih ketat, gunakan role/tenant claim atau Cloud Function untuk operasi
super admin.

### 3. (Opsional) Buat index composite
Aplikasi membaca seluruh isi collection per tenant (bukan query kompleks),
jadi umumnya **tidak perlu index tambahan**. Kalau Firestore Console
memunculkan saran index di tab Usage, ikuti saja saran otomatisnya.

---

## B. Setup Cloud Messaging / Push Notification (opsional, untuk notifikasi izin)

`VAPID_KEY` di `index.html` **sudah diisi**. Yang masih perlu diisi manual di
Vercel adalah service account untuk fungsi server (`/api/send-notif`):

### 1. Generate Service Account Key (untuk serverless function)
- **Firebase Console (project myassalam-d45c5) > Project Settings > Service Accounts**
- Klik **Generate New Private Key** → download file JSON
- **JANGAN COMMIT FILE INI KE GITHUB/REPO PUBLIK** — ini rahasia

### 2. Set Environment Variable di Vercel
- Buka project Vercel-mu → **Settings > Environment Variables**
- Tambahkan:

| Key | Value |
|-----|-------|
| `FIREBASE_SERVICE_ACCOUNT` | Isi seluruh isi file JSON dari langkah B.1 (copy semua, paste sebagai satu string) |

Tidak perlu `FIREBASE_DATABASE_URL` lagi — Firestore mengambil projectId
otomatis dari service account.

### 3. Redeploy
Setelah environment variable ditambah, redeploy di Vercel supaya function `/api/send-notif` jalan.

**Catatan**: Selama langkah B belum selesai, semua fitur lain tetap jalan normal. Hanya push notif ke HP (saat app tertutup) yang belum aktif. Notif dalam-app + reminder tetap berfungsi.

---

## C. Struktur Data di Cloud Firestore

Aplikasi otomatis membuat collection/dokumen berikut di project barumu:

```
registry/{ns}                          # Pendaftaran tenant (nama asrama)
tenants/{ns}/
  ├── santri/{id}          # Data santri (nama, kamar, foto, dll)
  ├── kegiatan/{id}        # Daftar kegiatan harian
  ├── subKeg/{id}          # Sub-kegiatan per kegiatan
  ├── anggota/{id}         # Anggota sub-kegiatan
  ├── sesi/{id}            # Sesi absensi per tanggal
  ├── absensi/{id}         # Record absensi (hadir/alpha/izin/sakit/terlambat)
  ├── auditLog/{id}        # Log perubahan absensi
  ├── users/{id}           # Akun musyrifah/admin
  ├── kamar/{id}           # Daftar kamar
  ├── catatanSantri/{id}   # Catatan prestasi/pelanggaran/umum/psikologis/kesehatan
  ├── pelanggaran/{id}     # Record pelanggaran + ta'zir
  ├── peraturan/{id}       # Daftar peraturan pondok
  ├── kalam/{id}           # Kalam ulama & hadist harian
  ├── perizinan/{id}       # Pengajuan izin (pulang/sakit/dll)
  ├── settings/{id}        # Pengaturan (jenisIzin, asrama, jenis_kelamin, dll)
  ├── chat/{id}            # Pesan chat antar musyrifah
  └── fcmTokens/{docId}    # Token push notification per device
```

`{ns}` adalah namespace tenant (per asrama/pondok), sama seperti pada
aplikasi lama — hanya lokasinya sekarang path Firestore, bukan node RTDB.

**Kamu TIDAK perlu input data manual** di Firebase Console. Semua data dibuat otomatis lewat aplikasi.

---

## D. Storage Penggunaan Cloud (Foto)

Aplikasi **mengompres semua foto** sebelum upload:
- Foto profil santri/musyrifah: max 120px, JPEG quality 0.5 (~3-8KB per foto)
- Foto lampiran izin: max 200px, JPEG quality 0.5 (~5-15KB per foto)
- Foto pelanggaran/catatan: max 150px, JPEG quality 0.5 (~4-10KB per foto)

**Field yang DIKIRIM ke cloud**: lampiran perizinan (karena perlu di-share antar device).

**Field yang DI-STRIP (tidak dikirim)**, hanya disimpan lokal:
- `foto` profil santri & user → marker `__L__`, restore dari IndexedDB saat pull
- `fotoBukti` array (pelanggaran manual) → marker `__L__`, restore lokal
- `fotoHukuman` (ta'zir) → marker `__L__`, restore lokal

**Konsekuensi**: Foto profil tidak muncul di device lain. Kalau mau foto profil juga sync antar device, edit fungsi `_strip()` di `index.html` dan hapus baris yang nge-strip `foto`.

---

## E. Yang Perlu Diubah di Firebase-Mu (CHECKLIST)

| # | Item | Wajib? | Cara |
|---|------|--------|------|
| 1 | `firebaseConfig` di `index.html` & `firebase-messaging-sw.js` | ✅ Sudah diisi | Project `myassalam-d45c5` — ubah hanya kalau pindah project |
| 2 | Aktifkan Cloud Firestore di Console | ✅ WAJIB | Lihat section A.1 |
| 3 | Set Firestore Security Rules | ✅ WAJIB | Lihat section A.2 / F |
| 4 | `VAPID_KEY` di `index.html` | ✅ Sudah diisi | — |
| 5 | Set `FIREBASE_SERVICE_ACCOUNT` di Vercel | ⚠️ Untuk push notif | Project Settings > Service Accounts > Generate Private Key |
| 6 | Tidak perlu input data manual | ✅ Skip | Data dibuat otomatis oleh app |

**Kalau langkah A.1 & A.2 belum dikerjakan** → aplikasi tetap bisa dipakai secara lokal (IndexedDB), tapi sync antar device belum jalan sampai Firestore diaktifkan.

---

## F. (Opsional) Firestore Rules yang Lebih Aman

Default rules di section A.2 terbuka untuk siapa saja yang tahu Project ID. Untuk produksi, pakai rules dengan Firebase Authentication:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Ini butuh setup Firebase Authentication (Anonymous atau Custom Token) di sisi client.

Alternatif lebih praktis (restrict per-tenant, hanya bisa baca/tulis namespace sendiri setelah auth diaktifkan):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tenants/{ns}/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /registry/{ns} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## G. Backup & Restore

- **Export JSON**: Pengaturan > Data > Export Backup JSON → download semua data
- **Import JSON**: Pengaturan > Data > Import Backup → restore dari file JSON
- **Reset Total**: Pengaturan > Bahaya > Reset Semua Data (termasuk hapus dari cloud)

Backup JSON berguna untuk:
- Migrasi ke project Firebase lain
- Snapshot data sebelum update besar
- Recovery kalau ada masalah sync

---

## H. Troubleshooting

### Data tidak sync antar device
1. Pastikan kedua device online
2. Cek sync-dot di pojok kanan atas: hijau (ok) / kuning (syncing) / merah (error) / abu (offline)
3. Buka Pengaturan > Sinkronisasi Cloud > **Pull Lengkap** / **Push Lengkap**
4. Cek Cloud Firestore di Firebase Console (project `myassalam-d45c5`) — pastikan collection `tenants/{ns}/...` muncul di sana

### Foto profil tidak muncul di device lain
Itu memang by design (foto di-strip biar cloud tidak penuh). Lihat section D untuk solusi.

### Push notif tidak masuk
1. Pastikan langkah B.1-B.4 selesai
2. Cek browser console — cari error FCM
3. Pastikan service worker ter-register (DevTools > Application > Service Workers)
4. User harus allow notification di browser

### Perizinan tidak sync
**Sudah diperbaiki di versi ini** — `perizinan` sekarang masuk ke array sync `pullAll`, `pushAll`, dan `NAV_PULL`. Sebelumnya perizinan tidak otomatis sync antar device.

---

# 📡 Absensi NFC Background (Auto-Tap di Halaman Manapun)

Setelah musyrifah login, NFC otomatis aktif di **semua halaman**. Santri cukup tap kartu
ke belakang HP — tidak perlu buka halaman absensi khusus dulu.

## Cara Setup

### 1. Isi jam SUB-KEGIATAN (WAJIB)
Menu **Kegiatan → (pilih kegiatan) → Tambah/Edit Sub Kegiatan**, isi:
- **Jam Mulai** & **Jam Selesai** (format 24 jam, misal 05:00 - 06:00)
- **Hari Aktif** (opsional — kosongkan = setiap hari)

> **Penting**: Kegiatan induk TIDAK punya jam. Hanya sub-kegiatan yang punya jam —
> agar tidak bentrok antar sub-kegiatan di kegiatan yang sama.
> Sub-kegiatan TANPA jam tidak akan terdeteksi oleh NFC background.

### 2. Daftarkan UID Kartu NFC ke Santri
**Santri → Edit Santri → Scan kartu NFC** (tombol 📡 di samping field NFC UID).

### 3. NFC otomatis aktif setelah login
Indikator 📡 NFC di header:
- 🟢 Hijau = aktif (tap di halaman manapun)
- ⚪ Abu = nonaktif (tap icon untuk start)
- 🔴 Merah = error (biasanya izin NFC belum diberikan)

Toggle: **Pengaturan → Absensi NFC**.

## Aturan Deteksi Kegiatan Aktif

Saat tap, sistem mencari **sub-kegiatan** dengan jam yang sedang berjalan:

1. Sub-kegiatan aktif di mana santri adalah anggota → record ke sub itu
2. 2+ sub aktif dan santri anggota lebih dari 1 → record ke urutan pertama + peringatan bentrok
3. Sub aktif tapi santri bukan anggota → tampilkan "Bukan Anggota Kegiatan Aktif"
4. Tidak ada sub aktif → "Tidak Ada Kegiatan Aktif", tidak tercatat apa-apa

---

# 🚶 Perbaikan Sistem Perizinan

**Bug lama**: Santri yang sudah lewat batas waktu izin (terlambat) tapi belum ditandai
"Sudah Kembali" sering tidak muncul di angka "Tidak di Pondok".

**Perbaikan**: Izin dianggap masih membawa santri keluar **selama belum ditandai
Sudah Kembali** — termasuk yang sudah lewat `tglSelesai` (status: Terlambat).

- Hitungan "Tidak di Pondok" sekarang **mencakup** status: Sedang Izin + Terlambat
- Popup "Tidak di Pondok" sekarang dikelompokkan per status runtime:
  - ⏰ Terlambat / Belum Kembali (merah)
  - 🚶 Sedang Izin (hijau)
  - 📅 Terjadwal (ungu)
- Setiap baris menampilkan badge Terlambat + tanggal + jam kembali

---

# 📱 PWA (Progressive Web App)

Aplikasi sekarang bisa **dipasang ke HP** lewat Chrome:

1. Buka URL aplikasi di Chrome Android
2. Tunggu ~5 detik, muncul FAB "⬇ Pasang App" di pojok kanan bawah
3. Tap → konfirmasi pasang
4. App muncul di home screen HP, bisa dibuka fullscreen tanpa address bar

Alternatif: **Menu Chrome (⋮) → Add to Home screen / Install app**.

File PWA:
- `manifest.json` — metadata app (nama, icon, theme)
- `sw.js` — service worker (caching offline untuk app shell)
- `icon-192.png`, `icon-512.png` — icon app

Service worker caching strategy:
- App shell (HTML/manifest/icons): cache-first
- Firestore/Firebase API & Cloudflare: network-only (selalu fresh)
- Navigasi: network-first, fallback ke cache

---

# ✕ FAB Tutup Bottom-Sheet

Setiap kali pop-up bottom-sheet terbuka (tombol tambah/edit, detail santri, dll),
muncul **FAB "✕ Tutup"** mengambang di tengah bawah. Tap untuk menutup sheet
tanpa perlu scroll ke atas atau tap area gelap di luar sheet.

---

# Selamat menggunakan! 🕌

Kalau ada bug / fitur baru yang mau ditambah, hubungi developer.
Made with ❤️ by Fatum Studio

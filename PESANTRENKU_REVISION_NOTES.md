# Pesantrenku Major Revision Preview

Tanggal: 2026-08-12

## Prinsip aman produksi

- Perubahan dibuat di folder preview, belum deploy dan belum merge ke `main`.
- Koleksi absensi lama tidak diganti nama dan tidak dimigrasi.
- Fitur baru memakai koleksi tambahan:
  - `academicRecords`
  - `academicTargets`
  - `academicPrograms`
  - `academicEvaluations`
  - `financeBills`
  - `financePayments`
  - `qrScanLogs`
- QR absensi mencari santri dari `nis`, lalu memakai jalur pencatatan aktif yang sama dengan NFC.

## Struktur paket aman

- Versi ini tetap memakai `index.html` tunggal/no-split.
- Alasan: versi split pernah stuck di halaman pilih musyrifah pada device user.
- `sw.js` dan `APP_VERSION` dinaikkan agar perangkat mengambil cache baru.

## Fitur yang ditambahkan

- Branding PWA menjadi `Pesantrenku`.
- Modul Scan QR:
  - scan kamera memakai `html5-qrcode`
  - input NIS manual
  - log scan lokal/cloud di `qrScanLogs`
- Modul Akademik:
  - kelola program mandiri: tambah, edit, hapus
  - halaman program memakai pilihan collapsible di bagian atas
  - kelola evaluasi per program: nama evaluasi, tanggal, penanggung jawab, evaluator, anggota evaluasi
  - search evaluator dan search anggota santri saat membuat evaluasi
  - input/edit nilai langsung dari daftar anggota evaluasi
  - popup catatan akademik memiliki search santri
  - pilihan guru/evaluator mengikuti evaluator yang didaftarkan di evaluasi
  - export Excel per evaluasi dan per program
  - hapus seluruh evaluasi program atau hapus seluruh program
- Modul Keuangan:
  - tagihan santri
  - pembayaran santri
  - search di halaman keuangan
  - search santri di popup tambah catatan keuangan
  - search tagihan di popup catat bayar
  - export Excel
- Pengaturan:
  - tombol `Cek Koneksi Server` untuk test Auth anonymous + Firestore tenant aktif.

## Test lokal Termux

```bash
cd /storage/emulated/0/Download/absensiapp
python3 -m http.server 4173
```

Buka:

```text
http://127.0.0.1:4173
```

Checklist:

- Login normal.
- Buka Pengaturan, klik `Cek Koneksi Server`.
- Buka Dashboard, tombol Scan QR/Akademik/Keuangan muncul.
- Buka Scan QR, coba input NIS manual lebih dulu.
- Buka Akademik, tambah program dummy, tambah evaluasi, pilih anggota, input nilai, export evaluasi/program.
- Buka Keuangan, tambah tagihan dummy, cari santri, catat pembayaran, export Excel.

## Catatan deploy

Deploy/merge hanya setelah preview lolos test. Jangan deploy langsung ke production sebelum mengecek login, dashboard, rekap, QR, akademik, keuangan, dan notifikasi.

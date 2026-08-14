# Phase 7 Audit and Test Guide

Tanggal: 2026-08-13

## Status Revisi Sebelumnya

Source aktif masih memuat patch berikut:

- `assets/js/phase3-revision.js`
- `assets/js/phase4-design-system.js`
- `assets/js/phase5-polish-stability.js`
- `assets/js/phase6-academic-profile-reports.js`
- `assets/js/phase7-integrity-quicknotes.js`

`index.html` memanggil semua file patch di atas, dan `sw.js` sudah memasukkan semuanya ke app shell cache.

## Revisi Phase 7

### 1. Izin terlambat kembali tidak lagi mengunci absensi sebagai izin

Perbaikan:

- `_izinAktifMap()` sekarang memperhatikan `tglSelesai` dan `jamKembali`.
- Izin yang sudah lewat batas kembali tidak dianggap aktif untuk absensi baru.
- Absensi lama yang telanjur berstatus `izin` dari sistem perizinan akan diperbaiki:
  - sesi belum terkunci: kembali ke `none`
  - sesi terkunci: menjadi `alpha` dan dibuatkan pelanggaran otomatis

Uji:

1. Buat perizinan disetujui untuk santri A dengan tanggal/jam kembali yang sudah lewat.
2. Buka dashboard atau halaman absensi.
3. Buat/buka sesi absensi hari ini.
4. Santri A tidak boleh otomatis tercatat `izin`.

### 2. Dashboard Tambah Catatan Lebih Lengkap

Tombol `+ Catatan` di dashboard sekarang bisa membuat:

- Catatan umum
- Prestasi
- Catatan pelanggaran
- Catatan psikologis
- Perizinan
- Catatan sakit
- Keuangan/tagihan
- Pelanggaran manual

Semua tetap memakai store lama:

- `catatanSantri`
- `perizinan`
- `catatanSakit`
- `financeBills`
- `pelanggaran`

Uji:

1. Dashboard -> `+ Catatan`.
2. Pilih setiap jenis data.
3. Simpan dan cek modul terkait/profil santri.

### 3. Edit Program Akademik

Perbaikan:

- Sheet `Edit Program Akademik` sekarang punya tombol `Hapus Program Ini`.
- Tombol memakai alur konfirmasi `confirmDeleteProgram()` yang sudah ada.

Uji:

1. Buka Akademik.
2. Pilih program.
3. Klik edit program.
4. Pastikan tombol hapus muncul di bawah tombol simpan.

## Cache

Service worker dinaikkan ke:

```text
pesantrenku-v28-phase7-integrity-quicknotes
```

Saat uji di HP, buka dengan cache buster:

```text
index.html?v=phase7
```

Jika revisi tampak hilang, hapus data situs/PWA untuk domain preview, lalu buka lagi.

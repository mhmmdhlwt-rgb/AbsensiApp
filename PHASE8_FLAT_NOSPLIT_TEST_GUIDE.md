# Phase 8 Flat No-Split Test Guide

Paket ini dibuat ulang karena paket sebelumnya masih berisiko terbaca sebagai aplikasi lama jika:

- ZIP diekstrak dari folder bersarang.
- File patch `assets/js/phase*.js` tidak ikut ter-load.
- Service worker/cache PWA masih menyajikan bundle lama.

## Perubahan Bentuk Paket

- Isi ZIP sekarang langsung di root, bukan di dalam folder `rebuild-phase5-from-upload`.
- Revisi phase 3, 4, 5, 6, dan 7 sudah di-inline langsung ke `index.html`.
- `index.html` tidak lagi bergantung pada `<script src="assets/js/phase3...phase7">`.
- Cache PWA dinaikkan ke `pesantrenku-v29-phase8-flat-nosplit-revisions`.

## Cara Memastikan Revisi Aktif

Buka aplikasi dengan:

```text
index.html?v=phase8
```

Lalu cek:

1. Dashboard punya tombol `+ Catatan`.
2. `+ Catatan` bisa memilih perizinan, sakit, tagihan keuangan, prestasi, catatan pelanggaran, psikologis, dan pelanggaran manual.
3. Akademik memakai tampilan program/evaluasi baru.
4. Edit Program Akademik memiliki tombol `Hapus Program Ini`.
5. Scan QR langsung aktif saat tab dibuka.
6. Filter Santri tidak menutup sendiri.
7. Export akademik berupa `.xlsx`.

Jika masih tampil aplikasi lama:

1. Uninstall PWA/app shortcut lama.
2. Hapus data situs Chrome/Brave untuk domain preview.
3. Buka lagi dengan `?v=phase8`.

# Pesantrenku Phase 4 - Uji Desain dan Integrasi

Paket ini adalah build uji terpisah. Tidak ada deploy Firebase, Vercel, atau perubahan database produksi saat paket dibuat.

## Desain

1. Buka Akademik, Keuangan, Pelanggaran, Profil Santri, dan Pengaturan.
2. Pastikan warna kartu, border, tombol, radius, dan font menyatu dengan halaman Absensi, Santri, dan Rekap yang sudah ada.
3. Uji layar mobile. Kartu statistik Akademik harus ringkas dalam satu baris dan input bottom sheet tetap tampak ketika keyboard terbuka.

## Integritas Akademik

1. Buat evaluasi dan input nilai untuk beberapa santri.
2. Buka Profil Santri, tab Catatan. Catatan Akademik harus muncul.
3. Hapus satu evaluasi. Catatan Akademik terkait di profil santri harus ikut hilang.
4. Export Program. Pastikan setiap evaluasi berada dalam sheet Excel berbeda, dengan judul dan detail di baris atas.

## Keuangan

1. Tambah tagihan untuk seluruh santri aktif.
2. Catat bayar dari baris tagihan dan lampirkan foto bukti pembayaran.
3. Buka Profil Santri, tab Catatan, lalu tekan kartu Keuangan. Total sisa dan daftar tagihan harus sesuai.
4. Export Keuangan. Sheet Tagihan dan Pembayaran harus muncul.

## Operasional

1. Centang beberapa pelanggaran dan gunakan aksi ta'zir massal.
2. Uji filter Santri: kelas sekolah, kelas diniah, asrama/komplek, kamar, dan pencarian teks.
3. Isi Komplek untuk satu kamar di Pengaturan lalu cek filter dan profil santri kamar tersebut.
4. Ubah jenis asrama menjadi putra. Pada Pengaturan, status Uzur harus menyatakan tidak tersedia dan pencatatan Uzur baru harus ditolak.

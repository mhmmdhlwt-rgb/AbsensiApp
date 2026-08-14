# Panduan Uji Fase 5

Fase ini memperbaiki UI revisi agar menyatu dengan desain awal aplikasi, menjaga filter tidak menutup sendiri, menjaga kamera QR tetap aktif, dan mengganti export akademik/keuangan menjadi `.xlsx`.

## Uji Santri

- Buka `Filter Kamar`, tunggu sync beberapa detik, pastikan panel tidak menutup sendiri.
- Buka `Filter Lanjutan`, pilih kelas sekolah, kelas diniyah, dan asrama/komplek.
- Ketik pencarian santri, pastikan daftar memfilter tanpa halaman berkedip.
- Pastikan `Santri nonaktif` berada satu baris dengan `Di Pondok` dan `Tidak di Pondok`.

## Uji Pelanggaran

- Checkbox pilihan massal tampil menyatu di sisi kiri card.
- Toolbar massal berada di bawah daftar, bukan mengganggu bagian atas.
- Saat card dipilih, border/background berubah halus mengikuti desain aplikasi.
- Tombol selesaikan massal dan hapus massal tetap berfungsi.

## Uji Scan QR

- Saat membuka tab `Scan QR`, kamera langsung aktif.
- Tunggu sinkronisasi, pastikan kamera tidak mati sendiri.
- Scan QR berisi NIS santri, pastikan tercatat lewat jalur absensi aktif.
- Tombol `Stop` tetap bisa mematikan kamera.

## Uji Export

- Export evaluasi menghasilkan `.xlsx` yang bisa dibuka Excel/Google Sheets.
- Export program menghasilkan banyak sheet, satu sheet per evaluasi.
- Export keuangan menghasilkan sheet `Tagihan` dan `Pembayaran`.

## Catatan

Perubahan fase ini ada di frontend dan service worker cache version. Tidak ada migrasi database.

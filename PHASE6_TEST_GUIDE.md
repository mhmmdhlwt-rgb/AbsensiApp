# Panduan Uji Fase 6

Fase ini menambahkan evaluasi akademik multi-kriteria, dokumentasi evaluasi, penataan ulang profil santri, quick note dashboard, dan laporan share sub-kegiatan.

## Akademik

- Buka modul `Akademik`.
- Daftarkan evaluasi baru.
- Tambahkan beberapa kriteria penilaian, misalnya `Kefasihan`, `Makharijul Huruf`, `Tajwid`.
- Pilih format nilai: `ABCDE`, `1-9`, atau `1-100`.
- Upload dokumentasi evaluasi maksimal 4 foto.
- Simpan evaluasi.
- Klik `Tambah Catatan`; pastikan form hanya memilih satu santri, bisa memilih santri di luar anggota evaluasi awal, dan input nilai muncul sesuai kriteria.
- Export evaluasi dan export program, pastikan file `.xlsx` bisa dibuka.

## Profil Santri

- Buka salah satu profil santri.
- Pastikan tab `Izin`, `Sakit`, dan `Uzur` menjadi satu tab `Status`.
- Pastikan `Timeline` pindah ke bagian bawah tab `Rekap`.
- Pastikan ada tab baru `Akademik` dan `Keuangan`.
- Di tab `Akademik`, admin bisa hapus catatan akademik.

## Pelanggaran

- Tambahkan pelanggaran manual.
- Buka profil santri yang dipilih.
- Pastikan pelanggaran manual juga muncul sebagai catatan pelanggaran santri.

## Keuangan

- Buka modul `Keuangan`.
- Klik `Catat Bayar`.
- Pastikan bukti pembayaran punya pilihan `Kamera` dan `Galeri / File`.

## Dashboard

- Di dashboard, pastikan ada tombol `+ Catatan`.
- Tambahkan catatan prestasi/catatan umum/catatan psikologis dari dashboard.
- Untuk pelanggaran manual, tombol membuka form pelanggaran manual lama agar tetap memakai alur ta'zir dan laporan yang sama.

## Absensi Sub-Kegiatan

- Buka halaman absensi sub-kegiatan.
- Pastikan tombol mengambang `Share WA` muncul.
- Klik tombol itu dan pastikan WhatsApp berisi rekap absensi sub-kegiatan tersebut.

## Catatan Data

Perubahan field baru disimpan di dokumen lama:

- `academicEvaluations.criteria`
- `academicEvaluations.nilaiFormat`
- `academicEvaluations.dokumentasi`
- `academicRecords.nilaiKriteria`

Data lama tetap dibaca dengan fallback `Nilai Utama`.

# Implementasi typography

8 September 2026. Perubahan lokal setelah persetujuan audit.

- Ukuran pada stylesheet dipetakan ke token peran berbasis rem: body 15 px, data 14 px, metadata/label 13 px, badge 12 px, input 15 px desktop/16 px mobile, section 16 px, panel 20/18 px, halaman 30/26 px, total 22/20 px, metrik 30/26 px pada root default 16 px.
- Aturan sumber dan override responsive memakai token yang sama; tidak menambah blok override besar di akhir stylesheet. Judul branding login dipertahankan. Font, warna, dimensi, spacing, dan properti CSS non-typography terverifikasi sama dengan sebelum edit.
- Cetak ringkasan memakai satuan pt (isi 11 pt, judul 16/14 pt, footer 10 pt). Header/isi export Excel umum menjadi 10 pt; tinggi header 42 pt menyediakan ruang teks terbungkus. Format sumber Lampiran 6 tetap mengikuti template sumber.

## Verifikasi

- `npm run build` berhasil setelah perubahan akhir; `git diff --check` bersih.
- `npm test`: 47 lulus dari 50; tiga tes integrasi PostgreSQL gagal karena `TEST_DATABASE_URL` belum disetel. Tidak menjalankan tes destruktif terhadap database aplikasi.
- Browser lokal terautentikasi: arsip, Surat Tugas, pegawai, honorarium, rekap/laporan, dokumen, sampah, pengaturan. Ukuran CSS viewport diverifikasi langsung karena backend viewport menerapkan faktor skala.
- Desktop 1280/1440 CSS px serta mobile 360/390 CSS px diperiksa. Halaman yang diukur tidak mempunyai overflow horizontal root; tabel lebar tetap menggunakan wadah scroll yang sudah ada.
- Form arsip, tab biaya, impor awal, tambah pegawai, tambah honorarium, rincian arsip dengan judul panjang, halaman ringkasan cetak, dan login dibuka. Input mobile terukur 16 px, judul register desktop 20 px, nomor/nominal baris 14 px, uraian 15 px, status 12 px. Form ditutup tanpa menyimpan; sesi pengujian ditutup.
- State impor setelah unggah, setiap cabang batch editor, pembesaran font OS, hasil cetak fisik/PDF, dan render Excel native belum diverifikasi. Tes ekspor yang ada lulus, termasuk round-trip data.

Perubahan lain yang sudah ada pada working tree dipertahankan. Belum commit, push, atau deploy.

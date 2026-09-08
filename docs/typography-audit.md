# Audit typography Arsip ESDM

Tanggal: 8 September 2026. Audit terhadap working tree lokal, dengan HEAD `3565c3e` saat pemeriksaan. Tidak ada perubahan typography aplikasi dalam audit ini.

## Kesimpulan

Masalah utama adalah skala teks yang terlalu kecil dan hierarki tingkat menengah yang terlalu rapat. Ketebalan bukan satu-satunya penyebab: judul, referensi, serta nominal sudah memakai weight 600–650, tetapi informasi yang dibaca terus-menerus berada di 10–12 px. Pada mobile, sebagian informasi penting justru semakin kecil.

Prioritas: besarkan teks kerja; perjelas perbedaan judul bagian, data utama, dan metadata; baru sesuaikan weight secara selektif. Pertahankan Plus Jakarta Sans dan identitas warna yang ada pada iterasi pertama.

## Metode dan batas pemeriksaan

- Membaca seluruh deklarasi typography `src/app/globals.css`, utility typography komponen UI, komponen form/detail/impor, halaman cetak, dan helper export Excel.
- Mengukur computed styles di browser untuk login, Arsip Perjalanan, Surat Tugas, Rekap & Laporan, Dokumen, Pegawai, Sampah, Pengaturan, dan Honorarium.
- Mengukur desktop 1440 × 900 dan mobile 390 × 844 untuk register; login diperiksa pada viewport awal browser dan pada mobile.
- Halaman kerja diakses melalui pratinjau lokal read-only yang menggunakan sesi sah. Pemeriksaan antarhalaman memakai rute langsung; interaksi dialog pada pratinjau tersebut tidak membuka dialog. Karena itu hasil modal, editor biaya, dan impor berasal dari kode/CSS, bukan klaim verifikasi visual seluruh state.
- Dokumen kosong dan sampah kosong dapat dinilai langsung; kartu dokumen yang berisi data dinilai dari stylesheet. Cetak/Excel dinilai dari kode format, belum dari hasil cetak fisik.
- Tidak mengubah data arsip. Sesi audit sementara ditutup setelah pemeriksaan.

## Bukti sistemik

Font yang dipakai adalah `Plus Jakarta Sans Variable`, dimuat di `src/app/layout.tsx`. CSS dasar menetapkan body 13 px dan menurunkannya menjadi 12 px di bawah 700 px. Body tidak menetapkan weight sendiri; computed weight adalah 400.

Inventaris stylesheet menemukan **563 deklarasi font-size**. Sebanyak **480 deklarasi (85,3%) memakai ukuran tetap ≤12 px**, termasuk **214 deklarasi <11 px**. Angka ini menghitung aturan sumber, termasuk override dan aturan yang mungkin tidak aktif; bukan persentase teks yang terlihat di layar. Ada 861 deklarasi typography total dalam `typography-inventory.json`.

Sistem memiliki weight 400, 500, 550, 600, 650, dan 700. Ini didukung variable font, tetapi pembagian perannya belum konsisten. Menambah weight secara menyeluruh tidak menyelesaikan ukuran 9–11 px dan akan menyamakan penekanan semua elemen.

## Temuan menurut prioritas

### P1 — Teks utama terlalu kecil untuk pekerjaan membaca data

Computed desktop register:

| Elemen | Ukuran / weight | Dampak |
|---|---:|---|
| Isi dasar | 13 / 400 | Dasar seluruh kontrol sudah kecil |
| Nomor Surat Tugas | 12 / 650 | Penting, tetapi tidak cukup besar sebagai titik awal pemindaian |
| Uraian perjalanan | 12 / 400 | Kalimat panjang sulit dibaca cepat |
| Nama/metadata pegawai | 11–12 / 400–600 | Identitas berdekatan dengan ukuran catatan |
| Nominal realisasi | 12 / 650 | Angka penting seukuran uraian biasa |
| Label filter / header tabel | 11 / 550–600 | Penjelas kolom terlalu kecil |
| Badge kelengkapan | 10 / 500 | Informasi operasional menjadi microcopy |
| Pagination | 11 / 400 | Kecil, termasuk kontrol rutin |

Sumber utama: `globals.css:40`, `:5040`, `:5053`, `:5054`, `:5075`, `:5077`, `:5087`, `:5089`, `:5107`.

### P1 — Mobile mengecilkan informasi yang justru perlu lebih jelas

Pada 390 px: body 12/400, nomor Surat Tugas 11/700, badge status 9/500, metadata 11/400, tombol rincian 11/500. Bahkan weight 700 pada nomor surat tidak membuat ukuran 11 px menjadi nyaman.

Login mobile menggunakan input **12/400**, sementara input Lampiran 6 sudah mempunyai aturan 16 px pada mobile. Perlakuan input belum konsisten di seluruh aplikasi. Standar kerja yang disarankan adalah input mobile 16 px, data utama 14–15 px, dan status/helper minimal 12–13 px.

Sumber: `globals.css:2979`, `:4349`, `:5153`, `:5155`, `:5157`, `:5160`.

### P1 — Hierarki bagian kurang kuat

Judul halaman sudah 27–28/650 pada desktop dan 25/650 pada mobile. Tetapi judul register hanya 15–16/650 dan deskripsinya 11–12/400. Judul form biasa 13/650, Lampiran 6 14 px, label 12/600. Perbedaan ukuran antara judul bagian dan label sering hanya 1–2 px, dengan weight hampir sama.

H1 tidak perlu menjadi jauh lebih besar. Yang paling perlu diperkuat adalah H2, judul section, dan identitas utama pada setiap baris.

Sumber: `globals.css:506`, `:1246`, `:1280`, `:3545`, `:4130`, `:5016`, `:5029`, `:5197`.

### P2 — Hirarki nominal dan keterangan tidak konsisten

Ringkasan arsip menggunakan angka 27 px, laporan terukur 32 px, honorarium 23 px pada desktop. Angka dalam tabel hanya 12 px. Editor biaya memiliki total 17 px pada desktop dan ada override 12 px pada mobile; total berisiko kehilangan penekanan terhadap label dan input di dekatnya.

Tabular figures sudah diterapkan pada sejumlah nominal, tanggal, dan NIP; ini baik dan perlu dipertahankan. Gunakan peran angka yang konsisten: metrik halaman, total bagian, nominal baris, serta catatan perhitungan.

Sumber: `globals.css:4732`, `:4990`, `:5024`, `:5081`, `:5087`, `:5271`, `:5289`.

### P2 — Dialog dan instruksi terlalu bergantung pada teks kecil

Judul dialog generik 21/650, turun ke 19 px mobile. Deskripsi dialog 11 px, turun ke 10 px mobile. Helper field 11 px, error 11 px, bantuan 11 px, toast 12 px desktop / 11 px mobile. Instruksi, kesalahan, dan hasil tindakan adalah informasi penting; ukurannya tidak seharusnya berada di lapisan dekoratif.

Pada editor biaya, posisi pegawai dan catatan tertentu 9–10 px. Naikkan keterangan yang memengaruhi input/perhitungan menjadi 12–13 px. Teks error perlu 13–14 px dan weight 500, dengan warna sebagai pendukung.

Sumber: `globals.css:1202`, `:1253`, `:1456`, `:1472`, `:2828`, `:3312`, `:3496`, `:4726`, `:4805`, `:4840`.

### P2 — Warna bukan penyebab utama pada sampel register

Computed warna utama register sudah gelap: ink `#172c44`, muted `#40566b`, uraian `#506478`, referensi `#244f73`. Tidak ada alasan awal untuk menggelapkan semua teks atau mengubah palet. Masalah yang lebih nyata adalah ukuran kecil dan terlalu banyak informasi berbeda memakai warna/ukuran yang sama.

`-webkit-font-smoothing: antialiased` juga ada di body. Pengaruhnya terhadap persepsi ketebalan bergantung browser/display; bukan temuan universal. Jangan menghapusnya sebagai solusi utama tanpa perbandingan pada perangkat pengguna.

Ini bukan audit kepatuhan kontras menyeluruh untuk setiap pasangan warna dan semua state.

### P2 — Definisi typography tersebar dan saling menimpa

Contoh `.field-label` didefinisikan 11 px, kemudian 12 px, lalu ditimpa lagi oleh konteks tertentu. `.register-heading p` memiliki ukuran 10, 9, 11, 10, dan aturan scoped 12/11 px di berbagai blok. Komponen dasar Tailwind memakai `text-sm` (14 px), tetapi CSS tak berlayer/scoped dapat menurunkannya ke 11–12 px. Ada pula `font-size: ... !important` pada search dan select.

Mengubah `body` saja tidak cukup karena ratusan elemen memakai px langsung. Menambah satu blok override global baru akan memperpanjang masalah cascade. Perbaikan sebaiknya memetakan setiap peran ke token dan merapikan aturan sumber yang bersaing.

## Cakupan tiap bagian

| Bagian | Kondisi saat ini | Arah perbaikan |
|---|---|---|
| Login | H2 38/700 desktop, 30/700 mobile; input 13 desktop/12 mobile | Pertahankan judul; input 15–16, deskripsi 14–15, label 13/600 |
| Navigasi | Item 13/500; aktif 650; breadcrumb 10–11 | Item 14/500–600; breadcrumb 12–13 |
| Jam/navbar | Hari 11, tanggal 10, zona 9, jam 16 | Tanggal 12; jam 16; zona 11–12 sebagai metadata |
| Arsip perjalanan | H1 28, H2 16, data 12, status 10 | Utamakan data 14–15, H2 18–20, status 12 |
| Surat Tugas | H1 27, H2 16, identitas 12, metadata 11 | Samakan skala dengan register arsip |
| Pegawai | Nama 12/650, catatan 11/400, NIP 11 | Nama 14–15/600, NIP dan jabatan 13 |
| Honorarium | Ringkasan 23, data 12, catatan 11 | Nominal baris 14–15/600; ringkasan konsisten 28–30 |
| Rekap & laporan | H2 15, deskripsi 11, filter 11, metrik 32 | H2 18–20; filter 14; metrik 28–32 |
| Dokumen | Filter 11; aturan kartu: judul 12, uraian 10, footer 9 | Judul 15/600; uraian 13–14; metadata 12 |
| Sampah / empty state | Empty H3 terukur 17/400 | Judul kosong 18/600; petunjuk 14 |
| Pengaturan | H2 15/600, teks 11, label 12 | H2 18/650; teks 14; label 13/600 |
| Form arsip / pegawai / honorarium | Section 13; label 12; helper 11 | Section 16/650; label 13/600; input 15–16; helper 13 |
| Lampiran 6 / biaya | Desktop input 13; mobile input 16 sudah baik; catatan 9–11 | Pertahankan input mobile; perjelas section dan catatan perhitungan |
| Detail / riwayat | Fakta 11–13; catatan 10–12 | Fakta utama 14–15; metadata 13; judul 18–22 |
| Impor / pemetaan kolom | Label khusus 10; banyak status/helper kecil | Label 13, preview data 13–14, error 13–14 |
| Bantuan / toast | Bantuan 11–12, toast 11–12 | Instruksi 14; toast 13–14/500 |
| Cetak web | Judul inline 22 dan 18 px; footer 10 px pucat | Evaluasi dalam satuan cetak; pisahkan token layar dan cetak |
| Excel | Arial: isi/header 9 pt, total 10 pt, judul 14 pt | Evaluasi isi 10–11 pt dengan panjang tabel dan skala cetak; jangan samakan pt dengan px |

## Skala typography yang direkomendasikan

Ini usulan desain untuk aplikasi kerja ini, bukan angka wajib universal.

| Peran | Desktop | Mobile | Weight | Line-height |
|---|---:|---:|---:|---:|
| Judul halaman | 30 px | 26 px | 650–700 | 1.2–1.3 |
| Judul panel/register | 20 px | 18 px | 650 | 1.35 |
| Judul section form | 16 px | 16 px | 600–650 | 1.4 |
| Body / uraian utama | 15 px | 15 px | 400–450 | 1.55–1.65 |
| Data tabel | 14 px | 14–15 px | 450–500 | 1.5 |
| Nomor surat / nama utama | 14–15 px | 14–15 px | 600 | 1.45–1.55 |
| Header tabel / label | 13 px | 13 px | 600 | 1.4–1.5 |
| Input dan select | 15 px | 16 px | 450–500 | 1.5 |
| Tombol dan tab | 14 px | 14 px | 600 | 1.4 |
| Helper / metadata | 13 px | 13 px | 400–450 | 1.5–1.6 |
| Badge / microcopy | 12 px | 12 px | 500–600 | 1.4 |
| Nominal baris | 14–15 px | 15 px | 600–650 | 1.5 |
| Total bagian | 20–22 px | 20 px | 650 | 1.3 |
| Metrik halaman | 28–32 px | 26–28 px | 650 | 1.2 |

Weight 450 boleh dipakai karena font variable; jika sistem ingin lebih sederhana, gunakan 400 untuk paragraf, 500 untuk data, 600 untuk label/tombol, dan 650–700 untuk judul. Hindari menjadikan semua body 600.

Tracking negatif cukup untuk heading besar: sekitar -0.02em. Teks kecil, NIP, nomor surat, tanggal, dan nominal memakai tracking normal. Pertahankan tabular figures untuk angka. Line-height yang sekarang 1.6–1.8 pada sejumlah deskripsi sudah cukup longgar; tidak perlu menaikkannya secara seragam.

## Urutan implementasi dan verifikasi

1. Definisikan token peran untuk ukuran, weight, dan leading, dengan rem berbasis root yang mengikuti preferensi browser. Body 15 px ekuivalen, bukan memaksa root 13 px.
2. Perbaiki register arsip, Surat Tugas, pegawai, dan honorarium sebagai kelompok yang paling sering dibaca.
3. Samakan input, select, label, bantuan, dan error; audit semua dialog dan editor biaya secara interaktif.
4. Atur skala mobile tanpa mengecilkan informasi pokok. Cek 360/390 px, desktop 1280/1440 px, dan pembesaran teks.
5. Periksa hasil pembungkusan nomor surat panjang, nama, nominal besar, tinggi kontrol, dialog panjang, dan scroll tabel. Pembesaran huruf dapat mengubah kebutuhan ruang meskipun layout tidak didesain ulang.
6. Pisahkan perubahan cetak/Excel agar kop, tanda tangan, lebar kolom, dan pagination tidak rusak.

Kriteria hasil: tidak ada informasi operasional penting di bawah 12 px; input mobile 16 px; judul section jelas berbeda dari label; teks utama lebih mudah dibaca tanpa semuanya bold; nilai angka dan metadata punya peran konsisten; tidak ada clipping atau hilangnya kontrol. Verifikasi visual lintas halaman harus dilakukan setelah implementasi, bukan hanya pemeriksaan TypeScript.

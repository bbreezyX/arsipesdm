# Ekspor Lampiran 8

Referensi: `01-Lamp8. Rekap Perjadin_NamaSKPD_N.xlsx`, sheet `Perjadin`, diterapkan pada 22 September 2026.

`createTripWorkbook` menghasilkan satu sheet saja, `Perjadin`, termasuk pada unduhan `/api/archives/export`. Sheet Perjalanan, Rincian biaya, Daftar dokumen, Lampiran 6, dan Catatan rekap tidak disertakan. Template unduhan untuk impor tetap merupakan fitur terpisah.

## Format

Snapshot `src/lib/lampiran8-template.json` berisi label, gaya, 49 merge, lebar 70 kolom A–BR, dan tinggi baris dari referensi. Tidak memuat data contoh, instruksi sheet `PENTING!`, atau rumus sumber. Warna tema dan tint diselesaikan menjadi RGB menggunakan luminans HLS Excel (skala 240), agar tema bawaan workbook tidak mengubah warna.

- Lebar umum: 8,88671875; W/X/BQ: 9,5546875; AI: 11,33203125; BR: 13,109375.
- Tinggi default/data: 10,2 pt; baris 4: 14,4 pt; baris 5: 24,6 pt; baris 6: 40,95 pt.
- Sel tanggal H/I/J/AC/AD/AO/AX/BE/BK memakai `dd/mm/yyyy` dan validasi tanggal Excel (boleh kosong), mengoreksi format tanggal bawaan referensi.
- Data mulai baris 8. Identitas diulang pada baris lanjutan, tanpa merge data.
- Judul tahun mengikuti data; SKPD menggunakan nama dinas aplikasi. Tampilan membekukan dua kolom dan tujuh baris. Cetak menggunakan landscape.

## Pemetaan dan rumus

Identitas mengikuti data arsip; kolom A menggunakan jenis dana UP/GU/TU. Tarif dan komponen biaya dipetakan berdasarkan maknanya, termasuk urutan transport udara sebelum transport air pada template baru.

- K: selisih tanggal + 1, bila sesuai dengan jumlah hari tercatat.
- P/R: tarif × jumlah hari, bila sesuai dengan total tercatat. Total kosong tidak diisi dari tarif saja.
- W: `SUM(Pn,Rn:Vn)` pada semua baris biaya. Rumus sumber mulai W9 ikut menjumlahkan tarif; kesalahan itu tidak disalin.
- X: kuitansi tetap mengikuti nilai tercatat, termasuk nol atau kosong.
- AE/AI: selisih tanggal hotel dan tarif × jumlah malam, bila sesuai dengan data. Penginapan 30% menggunakan dasar tarif dan jumlah malam yang tersimpan.
- AL: total transport darat yang tersimpan. AJ/AK kosong karena aplikasi belum memisahkan harga sewa dan retribusi.
- BQ: menautkan total realisasi W pada baris biaya. Baris bukti/transit tanpa biaya tidak mengulang total. Nol tetap nol; total yang belum diketahui tetap kosong.
- Detail kapal BE–BP kosong bila tidak tersedia. Biaya transport air tetap muncul di V.
- BR: BIMTEK jika judul/kegiatan menyebut BIMTEK atau Bimbingan Teknis; Diklat jika mode tarif atau judul/kegiatan menyebut diklat. Selain itu, cakupan dalam Provinsi Jambi menjadi Perjalanan Dinas Biasa Dalam Daerah, dan luar provinsi menjadi Perjalanan Dinas Biasa Luar Daerah. Arsip umum memakai tujuan (nama kabupaten/kota Jambi dan aliasnya). Kategori diulang di setiap baris lanjutan.

Kolom Keterangan Y dikosongkan pada semua baris sesuai permintaan pengguna, termasuk baris lanjutan. Catatan sumber tetap tersimpan di aplikasi. Kolom BR tetap memuat kategori perjalanan.

Nilai manual yang berbeda dari hasil perkalian tidak diganti. Data di luar kolom A–BR tetap tersimpan di aplikasi, tetapi tidak disertakan dalam file unduhan. Baris transit hanya membawa bukti perjalanan, tanpa mengulang nilai biaya. Arsip umum yang tidak memakai Lampiran 6 menyimpan total buku biayanya langsung di W, tanpa referensi ke sheet lain.

## Verifikasi

- Unduhan API lokal HTTP 200, tiga arsip; file dibuka ulang dan dirender.
- Dibandingkan langsung dengan workbook referensi: 70 lebar kolom, 49 merge, 10 tinggi baris sampel, 156 sel header (label, warna, font).
- 14 rumus sampel dihitung ulang dengan mesin spreadsheet terpisah; hasil sama dengan cache ekspor.
- Tes ekspor/impor terkait: 24 lulus. Build produksi dan TypeScript lulus. Lint file kode yang berubah lulus.
- Tes penuh: 111 lulus; tujuh tes berikut gagal karena `TEST_DATABASE_URL` tidak disetel, sebelum pemeriksaan database dijalankan:
  - atomic batch save, duplicates, retry, workspace isolation, grouping and export
  - employee directory preserves archive snapshots and isolates workspaces
  - CRUD persists records with workspace isolation, conflict detection, deletion and restoration
  - 30 percent lodging basis persists in the archive database
  - legacy table migration preserves identities, rows and indexes and can run twice
  - name collision rolls back earlier renames and retains both existing tables
  - saved vehicles persist across connections, isolate workspaces, and preserve archives
- Lint seluruh proyek masih memiliki empat error dan satu warning di `dokumen.tsx`/`pegawai.tsx`, di luar perubahan ini. Database produksi tidak dipakai sebagai database tes.

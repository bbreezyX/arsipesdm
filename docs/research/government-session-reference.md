# Referensi sesi pada layanan pemerintah

Diperiksa 9 September 2026. Riset dokumentasi publik resmi; tidak mengakses akun pengguna atau menguji sesi produksi. Tidak mengubah kode aplikasi.

## Contoh yang dapat dijadikan pembanding

| Layanan | Bukti yang dipublikasikan | Batas kesimpulan |
| --- | --- | --- |
| DJP Online, bagian e-Filing | Panduan penanganan error menyebut sesi timeout ketika idle melebihi **30 menit**, dengan penyelesaian login kembali. | Ini dokumentasi e-Filing/DJP Online; bukan bukti bahwa Coretax atau semua layanan DJP kini mempunyai konfigurasi sama. Tanggal penerbitan tidak terlihat pada halaman yang diperiksa. |
| SIJEMPOL, DPMPTSP Kabupaten Garut | Jawaban layanan pengaduan tanggal 17 Oktober 2025 menjelaskan logout otomatis setelah **5 menit tanpa aktivitas**. Jawaban 29 Agustus 2024 juga menjelaskan pembatasan satu perangkat dan menunggu 5 menit tanpa aktivitas agar sesi keluar. | Ini keterangan pengelola produk tertentu, bukan aturan nasional. Teks terkonfirmasi pada hasil indeks halaman resmi; hasil pembukaan langsung halaman berbeda/tidak memuat entri lama tersebut. Tidak menguji konfigurasi login aktif. |
| e-Telekomunikasi Komdigi | Changelog modul Login & Manajemen Sesi bertanggal 8 Maret 2026 menyebut penghapusan sesi saat logout, pembatasan percobaan login, audit login, kontrol akses berdasar peran, dan mengembalikan pengguna ke tujuan awal setelah login. | Membuktikan pola pengamanan autentikasi yang dijelaskan pengelola; bagian yang diperiksa **tidak menyebut angka idle timeout**. |

Sumber DJP: [Panduan Penanganan Kode Error Layanan Online](https://www.pajak.go.id/panduan-penanganan-kode-error-layanan-online), bagian E-Filing → Buat SPT → Error 302, status code 0 atau bad request. Kutipan pendek: “session time out (idle time melebihi 30 menit)”.

Sumber SIJEMPOL: [Halaman pengaduan SIJEMPOL DPMPTSP Garut](https://sijempol.garutkab.go.id/perijinangarut3/t_pengaduanadd.php), jawaban pengelola pada 17 Oktober 2025 dan 29 Agustus 2024. Kutipan pendek: “jika tidak ada aktifitas selama 5 menit maka akan otomatis logout”.

Sumber Komdigi: [Changelog e-Telekomunikasi](https://e-telekomunikasi.komdigi.go.id/etelekomunikasi/changelog), versi v0.2.0-beta, Modul Login & Manajemen Sesi, 8 Maret 2026.

## Pemisahan kebijakan produk dan standar

Contoh di atas menunjukkan angka yang berbeda. Tidak ada dasar dari contoh tersebut untuk menyatakan seluruh website pemerintah wajib logout setelah 15 menit. Dokumentasi satu produk menerangkan perilaku produk itu; suatu kewajiban lintas instansi harus dibuktikan dari peraturan atau standar yang benar-benar berlaku.

Pencarian terbatas belum mendapatkan dokumentasi primer SAKTI atau OSS yang menetapkan angka idle timeout. Karena itu angka untuk kedua layanan tersebut tidak dicantumkan. Rujukan BSSN/SPBE perlu dinilai tersendiri dari teks ketentuan, bukan disimpulkan dari contoh UI pemerintah.

## Implikasi untuk Arsip ESDM

Mengikuti pola yang terlihat pada layanan resmi berarti menambahkan batas tidak aktif serta login ulang ketika sesi berakhir. Angka timeout harus menjadi keputusan aplikasi berdasarkan penggunaan komputer bersama, sifat data, dan pekerjaan pengisian form; dapat memakai contoh DJP 30 menit sebagai pembanding yang terverifikasi dokumentasinya. Angka tersebut tetap pilihan desain aplikasi, bukan pernyataan patuh suatu kewajiban nasional.

Sebagai pertimbangan desain kita sendiri, tampilkan peringatan sebelum timeout, pastikan mengetik form dihitung sebagai aktivitas, dan jangan membuat polling latar belakang memperpanjang sesi terus-menerus. Pemeriksaan server harus tetap menentukan validitas sesi, sedangkan frontend mengunci tampilan serta mengarahkan pengguna login ulang. Usulan ini tidak diklaim sebagai implementasi internal DJP atau SIJEMPOL.

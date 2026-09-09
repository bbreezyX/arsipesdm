# Rancangan pengamanan sesi Arsip ESDM

Tanggal: 9 September 2026. Status: Tahap 1 diterapkan (lihat bagian akhir); sisanya tetap usulan.

## Tahap 1 yang diterapkan

Untuk aplikasi internal dinas dengan pengguna sedikit, dua masalah nyata diselesaikan dulu: sesi 24 jam tanpa batas tidak aktif, dan 401 yang hanya muncul sebagai toast.

| Bagian | Implementasi |
| --- | --- |
| Kebijakan waktu | `src/lib/session-policy.ts`: idle 30 menit, absolut 24 jam (angka yang sudah ada, bukan 8 jam agar tidak memutus hari kerja panjang), peringatan 2 menit. |
| Penyimpanan | Kolom `last_activity BIGINT` pada `sesi_login` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Login memakai daftar kolom eksplisit. |
| Pemeriksaan server | `currentSession()` di `src/lib/auth.ts` menolak sesi yang melewati idle atau absolut. Request bisnis yang sukses memperpanjang idle paling cepat tiap 60 detik lewat `UPDATE ... WHERE` yang memastikan sesi masih valid saat ditulis. |
| Endpoint | `GET /api/session` status tanpa memperpanjang; `PATCH /api/session` memperpanjang idle (tombol Lanjutkan bekerja dan aktivitas pengguna, dibatasi tiap 2 menit). |
| Browser | `src/components/session-guard.tsx`: peringatan 2 menit dengan Lanjutkan bekerja/Keluar, verifikasi ke server saat tenggat lewat, layar penutup lalu muat ulang ke halaman login dengan pesan alasan. 401 dari `api()` dan fetch batch ditangani terpusat lewat `src/lib/session-client.ts`. 401 pada login (kata sandi salah) dikecualikan. |
| Migrasi | Sesi lama tanpa `last_activity` ditolak; pengguna masuk kembali sekali pada rilis ini. Baris lama tidak dihapus saat login agar versi lama yang masih berjalan pada database yang sama tidak terganggu. |

Ditunda ke tahap berikutnya: sinkronisasi antar tab, pemulihan form setelah login ulang, keluar dari semua perangkat, pencatatan login/logout, pemeriksaan ulang eksplisit saat wake dari sleep (sudah tertangani oleh verifikasi server saat tenggat lewat dan 401 pada request berikutnya).

Verifikasi: unit test `src/lib/session-policy.test.ts`; pemeriksaan HTTP terhadap dev server lokal (sesi asli yang `last_activity`-nya dimundurkan melewati 30 menit ditolak API dan halaman; GET status tidak menulis, PATCH dan request bisnis menulis; batas absolut tidak bergeser; sesi tanpa `last_activity` ditolak); pemeriksaan browser (peringatan tampil, Lanjutkan bekerja menutupnya, tenggat lewat memuat ulang ke login dengan pesan, 401 dari tab lama memuat ulang ke login, kata sandi salah tetap pesan inline). `scripts/integration.mjs` ditambah pemeriksaan status/perpanjangan/logout.

## Rancangan awal

## Dasar pemilihan

Panduan resmi DJP untuk **e-Filing** menyebut session timeout ketika idle melebihi 30 menit dan meminta pengguna login kembali. Ini bukti perilaku yang didokumentasikan untuk layanan tersebut, bukan bukti konfigurasi Coretax saat ini dan bukan ketentuan seragam seluruh situs pemerintah. [Panduan DJP, bagian E-Filing / Buat SPT / nomor 8](https://www.pajak.go.id/panduan-penanganan-kode-error-layanan-online).

OWASP membedakan batas tidak aktif dengan batas sesi absolut dan menekankan penegakan keduanya di server. Panduannya memberi contoh batas absolut 4–8 jam untuk aplikasi kerja kantor. Pemilihan 8 jam di bawah merupakan usulan untuk pola kerja aplikasi ini, bukan klaim bahwa DJP menggunakan 8 jam. [OWASP Session Management, Session Expiration](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#session-expiration).

NIST juga membedakan kedua batas tersebut, mengharuskan reautentikasi ketika batas terlampaui, dan mendukung peringatan sebelum sesi berakhir. Acuan ini dipakai sebagai prinsip desain, tanpa menyatakan aplikasi telah memenuhi suatu tingkat jaminan autentikasi NIST. [NIST SP 800-63B-4, Session Management](https://pages.nist.gov/800-63-4/sp800-63b/session/).

Temuan produk pemerintah lainnya beserta batas bukti dicatat dalam [referensi pemerintah](government-session-reference.md). Kondisi aplikasi sebelum perubahan dicatat dalam [audit sesi](browser-auth-session-audit.md).

## Aturan yang diusulkan

| Aturan | Usulan | Alasan |
| --- | --- | --- |
| Batas tidak aktif | 30 menit sejak aktivitas terakhir dalam aplikasi | Mengikuti contoh e-Filing, dengan ruang untuk membaca dokumen dan mengisi formulir. |
| Peringatan | Muncul ketika tersisa 2 menit | Pengguna dapat memilih **Lanjutkan bekerja** atau **Keluar**. |
| Batas sesi absolut | 8 jam sejak login terakhir | Memerlukan login ulang setelah satu rentang kerja; aktivitas biasa tidak boleh melewati batas ini. |
| Setelah batas terlewati | Server menolak sesi; browser menutup akses tampilan dan meminta login ulang | Data lama tidak tetap terbuka pada komputer yang ditinggalkan. |
| Beberapa tab | Aktivitas berlaku untuk sesi browser yang sama; logout berlaku pada semua tab dalam sesi itu | Tab yang diam tidak memutus tab lain yang masih dipakai. |
| Tombol Keluar | Memutus sesi saat ini di server dan membersihkan tampilan semua tab yang berbagi sesi | Tidak otomatis memutus perangkat lain; fitur keluar semua perangkat adalah pekerjaan terpisah. |
| Form belum tersimpan | Tampilkan peringatan; setelah habis, sembunyikan form dan minta autentikasi ulang | Tidak membiarkan form tetap bisa dipakai dan tidak melakukan penyimpanan bisnis otomatis. |

Angka 30 menit, 2 menit, dan 8 jam adalah rancangan kebijakan lokal. Kesesuaiannya perlu mengikuti risiko data dan SOP instansi; meniru timeout saja tidak menyatakan kepatuhan SPBE atau sertifikasi keamanan. Jika workstation dipakai bergantian untuk data sensitif, 15 menit dapat dipilih sebagai kebijakan yang lebih ketat.

## Apa yang dihitung sebagai aktivitas

- Mengetik, mengubah input, mengeklik atau menyentuh kontrol, dan menggulir di aplikasi pada tab yang terlihat dihitung sebagai aktivitas pengguna.
- Membuka situs lain, pembaruan jam di navbar, polling, prefetch, atau request latar belakang tidak dihitung sebagai aktivitas.
- Gerakan mouse saja tidak perlu mempertahankan sesi. Peringatan memberi kesempatan pengguna yang sedang membaca untuk menyatakan masih bekerja.
- Browser mengirim pemberitahuan aktivitas yang dibatasi frekuensinya. Server memakai waktunya sendiri ketika menerima aktivitas dan tetap memeriksa bahwa sesi belum habis sebelum memperbaruinya. Waktu yang dikirim client tidak menjadi dasar otorisasi.
- Ketika batas telah lewat, aktivitas baru atau heartbeat tidak dapat menghidupkan kembali sesi. Pengguna harus login ulang.

Server tidak dapat membuktikan kehadiran manusia hanya dari heartbeat; klien yang dimodifikasi bisa mengirimnya. Karena itu batas absolut tetap wajib dalam rancangan, dan heartbeat bukan pengganti autentikasi.

## Alur yang terlihat oleh pengguna

1. Login berhasil: pengguna masuk ke aplikasi dan memperoleh sesi baru.
2. Tidak aktif selama 28 menit: tampil pesan **"Sesi akan berakhir dalam 2 menit karena tidak ada aktivitas."** dengan tombol **Lanjutkan bekerja** dan **Keluar**.
3. Tombol Lanjutkan bekerja hanya memperpanjang batas tidak aktif jika server mengonfirmasi sesi masih valid. Batas 8 jam tetap sama.
4. Tidak ada respons sampai 30 menit: akses server berakhir; data dan form disembunyikan oleh layar login ulang. Pesan **"Sesi berakhir karena tidak ada aktivitas. Masuk kembali untuk melanjutkan."** menjelaskan alasannya.
5. Mendekati batas 8 jam: peringatan menjelaskan bahwa pengguna perlu menyimpan pekerjaan dan masuk kembali; tombol aktivitas biasa tidak boleh menjanjikan perpanjangan melewati batas tersebut.
6. Setelah login ulang dengan akun yang sama, rancangan dapat memulihkan form yang masih ada di memori tab. Data itu harus tetap tersembunyi selama terkunci dan tidak boleh diperlihatkan jika akun berbeda masuk. Halaman yang dimuat ulang atau browser yang ditutup tidak dijanjikan dapat memulihkan isian tanpa fitur draft tersendiri.

## Bentuk implementasi yang direncanakan

Pola penyimpanan sesi server yang sudah ada dapat menjadi dasar evaluasi implementasi: token acak di cookie HttpOnly, hash token dan metadata sesi di PostgreSQL. Sumber DJP menjelaskan perilaku timeout, tidak membuktikan library/framework/JWT yang digunakan oleh layanan itu. Tidak ada dasar untuk memilih teknologi auth tertentu hanya dari tampilan login pemerintah.

- Pisahkan kebijakan waktu ke satu modul; catat waktu pembuatan, aktivitas terakhir, dan batas absolut pada sesi. Penyesuaian tabel harus memakai daftar kolom eksplisit ketika insert.
- Validasi batas tidak aktif dan absolut pada pusat pemeriksaan auth agar mencakup API bisnis, halaman, lampiran, dan cetak.
- Pisahkan pemeriksaan status yang tidak memperpanjang sesi dari pemberitahuan aktivitas yang boleh memperpanjang idle. Gunakan pemeriksaan atomik agar request yang terlambat tidak menghidupkan sesi yang kedaluwarsa.
- Kirim metadata waktu yang diperlukan UI tanpa mengekspos token sesi. Gunakan waktu server sebagai patokan; penghitungan lokal membantu UI tetapi tidak memberi hak akses.
- Tambahkan pengendali sesi di browser: pemantauan aktivitas, peringatan, layar terkunci, sinkronisasi tab, dan penanganan 401 terpusat. Jalur fetch langsung perlu mengikuti perilaku yang sama.
- Saat kembali dari sleep/background, periksa ulang batas waktu/status sebelum membuka kembali tampilan. Status tab lama tidak boleh dianggap sebagai sesi baru setelah akun berubah di tab lain.
- Hindari menyimpan kredensial atau form sensitif secara otomatis ke localStorage. Jika pemulihan draft lintas reload diinginkan, rancang penyimpanan draft terpisah yang terikat akun dan diperiksa hak aksesnya.
- Sesi/cookie produksi tetap memerlukan HTTPS dan konfigurasi cookie yang benar; respons data terlindungi perlu aturan cache yang sesuai. Evaluasi ini dilakukan saat implementasi, tanpa mengklaim verifikasi deployment dari riset ini.
- Catat login/logout serta penolakan akibat timeout dengan identitas internal dan alasan; jangan mencatat password atau token sesi mentah.

## Kriteria penerimaan sebelum diterapkan

1. Sesi valid yang benar-benar melewati batas idle ditolak oleh server, termasuk jika JavaScript dimatikan; bukan sekadar tes token palsu.
2. Aktivitas sah sebelum batas idle mempertahankan sesi, tetapi tidak mengubah batas absolut 8 jam.
3. Polling/jam/prefetch tidak membuat sesi bertahan tanpa pengguna.
4. Peringatan, tombol lanjut, expiry, dan 401 menutup akses tampilan dengan pesan yang jelas.
5. Aktivitas satu tab tidak dibatalkan timer usang dari tab lain; logout mengunci tab yang berbagi sesi. Perangkat lain tidak ikut terputus tanpa kebijakan khusus.
6. Sleep/wake, jaringan terputus, respons terlambat, dan perubahan jam client tidak dapat memperpanjang otorisasi server.
7. Isian yang belum disimpan tersembunyi setelah sesi habis; pemulihan hanya untuk akun yang sama. Tidak ada pengiriman ulang perubahan bisnis secara otomatis.
8. Halaman cetak dan lampiran mengikuti pemeriksaan sesi; navigasi Back tidak membuka lagi tampilan terlindungi tanpa pemeriksaan yang sesuai.
9. Migrasi sesi lama punya kebijakan eksplisit. Usulan: pada rilis yang mengaktifkan aturan baru, sesi lama yang tidak memiliki metadata memadai diminta login ulang, dengan pemberitahuan sebelumnya.

Kriteria 1, 2, 4, dan 9 dipenuhi oleh Tahap 1. Kriteria 3 terpenuhi karena tidak ada polling ke endpoint berautentikasi (jam navbar hanya di UI). Kriteria 5, 6, 7 menunggu tahap berikutnya; kriteria 8 mengikuti `context()` yang sudah dipanggil halaman cetak dan lampiran.

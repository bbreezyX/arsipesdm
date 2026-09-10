# Arsip Perjalanan — Dinas ESDM Provinsi Jambi

Aplikasi lokal untuk merekap perjalanan dinas yang **sudah dilaksanakan**, dari Excel, PDF/foto, dan berkas kertas. Identitas visual menggunakan logo pada situs resmi Dinas ESDM Provinsi Jambi; lihat DESIGN.md untuk sumbernya.

## Menjalankan

Memerlukan **Node.js 24** (SQLite bawaan Node) dan npm.

```sh
npm ci
cp .env.example .env.local
# Isi DATABASE_URL dan ADMIN_PASSWORD yang unik sebelum menjalankan aplikasi.
npm run dev
```

Buka http://127.0.0.1:3107. Pada workspace ini konfigurasi dan akun administrator lokal sudah dibuat. Kredensial disimpan di `.local-access.txt` yang diabaikan Git. Jangan menimpa `.env.local` yang sudah ada.

Untuk menjalankan hasil build: `npm run build`, lalu `npm start` setelah menghentikan development server. Server secara default hanya mendengarkan di 127.0.0.1.

## Alur penggunaan

1. Saat aplikasi dibuka, halaman **Masuk ke arsip kantor** langsung ditampilkan. Masuk menggunakan akun operator atau administrator. Sesi yang masih aktif langsung membuka arsip kantor.
2. Mode contoh dinonaktifkan (`DEMO_ENABLED=false`). Administrator dapat menambah operator melalui Pengaturan.
3. Pilih **Impor Excel** untuk XLSX/XLS/CSV. Format **Rekap perjalanan dinas per pegawai** dikenali otomatis, dengan satu entri per pegawai dan perjalanan. Baris lanjutan biaya digabungkan ke pegawai terkait; sel gabungan mengikuti penggabungan eksplisit pada sumber. Tinjau catatan tanggal, rumus, dan identitas sebelum menyimpan. Untuk format umum, baris judul kolom dikenali otomatis (termasuk hasil ekspor aplikasi yang berkop) dan tetap dapat diubah, lalu periksa pemetaan kolom; baris "Jumlah" di bawah tabel dilewati; beberapa peserta dalam satu perjalanan dipisahkan titik koma. Maksimal 1.000 entri per impor dan 20 MB per file.
4. Gunakan **Tambah arsip** untuk memasukkan rekap kertas. Pilih **Satu pegawai** atau **Beberapa pegawai**. Pada mode beberapa pegawai, isi perjalanan sekali, pilih pegawai melalui pencarian/checkbox, lalu isi SPPD dan biaya masing-masing. Pada tahap **Biaya per pegawai**, pilih nama pada daftar di kiri (atau pemilih pegawai di layar kecil). Gunakan **Pegawai berikutnya** untuk melanjutkan tanpa kehilangan isian; bagian Biaya utama, Penginapan, Kendaraan/BBM, atau Biaya lain tetap terbuka saat berpindah orang. **Identitas & arsip** membuka data lengkap pegawai. **Salin biaya** menampilkan komponen, nominal sumber, dan penerima yang dipilih sebelum diterapkan. Jumlah pada bukti hotel/kendaraan dapat digunakan untuk mengganti nominal komponen terkait, tanpa menjumlahkan bukti dua kali. Tinjau seluruh rekap sebelum menyimpan; setiap pegawai memperoleh arsip terpisah dan seluruhnya disimpan dalam satu transaksi. Duplikat membatalkan penambahan seluruh kelompok. Pergantian mode mempertahankan isian; hanya pegawai yang dipilih pada mode aktif yang disimpan. **Arsip gabungan** tetap tersedia untuk satu arsip berisi beberapa peserta. Tanggal diketik DD/MM/YYYY. Semua perjalanan harus sudah selesai.
5. Buka detail → **Dokumen** untuk unggah PDF/JPG/PNG (maksimal 10 MB), atau tandai berkas fisik setelah memeriksa lokasi penyimpanannya.
6. Cari dan filter menurut tahun pelaksanaan, bidang, bulan, kelengkapan, atau teks; ekspor mengikuti filter/pilihan. Hasil Excel berkop Dinas ESDM dengan judul di tengah, judul kolom berkelompok, baris jumlah, panel beku, dan pengaturan cetak; lembar rekap, rincian biaya, dan daftar dokumen dipisahkan, dan lembar rekap sumber untuk perjalanan dalam dan luar Provinsi Jambi ditambahkan bila terdapat entri tersebut. Cetak ringkasan untuk hasil administrasi yang dapat disimpan sebagai PDF lewat browser.

Biaya kosong berarti belum diketahui; angka 0 berarti nihil. Biaya bersama dihitung sekali. Pembayaran dan kelengkapan tidak otomatis dianggap selesai setelah impor. Koreksi arsip memerlukan alasan dan dicatat dalam riwayat. Arsip yang dihapus masuk Sampah dan dapat dipulihkan. Pemeriksaan duplikat menggunakan identitas perjalanan; variasi ejaan tetap perlu diperiksa operator.

**Daftar perjalanan:** satu baris mengelompokkan seluruh rekap dengan nomor ST yang sama. Tahun dalam nomor ST menjadi acuan; bila nomor tidak memuat tahun, pengelompokan memakai tahun keberangkatan. Arsip tanpa nomor ST tampil sendiri. Pegawai dihitung unik, biaya setiap rekap dihitung sekali, dan total yang belum lengkap ditandai sementara. Pencarian dan filter mempertahankan seluruh anggota ST yang cocok; status Lengkap berarti semua rekap dalam kelompok lengkap. Pilihan dan ekspor dari daftar mencakup seluruh rekap kelompok tersebut. Buka Lihat rincian untuk SPPD, biaya, dokumen, serta tindakan per rekap.

**CRUD arsip:** gunakan Tambah arsip untuk membuat data, lalu tombol Detail, Edit, atau Hapus di setiap baris/kartu. Detail arsip juga menyediakan Edit dan Hapus. Data terbaru diambil sebelum membuka tindakan; penyimpanan dan penghapusan memeriksa versi agar perubahan operator lain tidak tertimpa. Hapus memerlukan konfirmasi, lalu Pulihkan tersedia di Sampah. Perubahan tahun atau filter setelah koreksi disesuaikan bila diperlukan agar arsip yang disimpan tetap terlihat. API menyediakan `POST /api/archives`, `GET /api/archives/:id`, `PATCH /api/archives/:id`, serta `DELETE /api/archives/:id` dengan versi arsip dalam body. Penghapusan menyimpan dokumen dan riwayat untuk pemulihan.

Total menurut sumber dan total kuitansi rekap perjalanan dinas disimpan terpisah dari pembayaran. Rincian hotel, kendaraan, dan tiket menjadi bukti pendukung; nominalnya tidak dijumlahkan lagi ke komponen biaya. Perbedaan total dan rujukan rumus lintas pegawai ditandai untuk ditinjau. NIP yang sama dengan nama berbeda tetap dipertahankan dengan catatan pemeriksaan. File Excel sumber tidak diubah, dan pratinjau belum menyimpan data sampai tombol impor dipilih.

PDF/foto disimpan sebagai lampiran. Aplikasi belum membaca isi scan secara otomatis (OCR).

## Penyimpanan dan pencadangan

Data disimpan di **PostgreSQL** melalui `DATABASE_URL`. Arsip, pegawai, honorarium, akun, pengaturan, dan file digital (kolom `bytea`, maksimal 10 MB per file) berada di database yang sama. Transaksi menyimpan lampiran dan metadata secara atomik. Pool dibatasi 10 koneksi per proses; transaksi penulisan memakai advisory lock agar penomoran dan pemeriksaan versi konsisten antarreplika. Ruang contoh dan kantor tetap terpisah; unduhan lampiran memeriksa sesi dan ruang kerja.

Di Railway, service `arsipesdm` memakai referensi `DATABASE_URL=${{Postgres.DATABASE_URL}}` melalui jaringan privat. PostgreSQL mempunyai volume persisten. `npm start` mendengarkan `0.0.0.0:$PORT`, dan `/api/health` memeriksa koneksi database. `railway.json` mengatur build, start, dan health check.

### Migrasi dan backup

Simpan salinan konsisten SQLite dengan SQLite backup API, direktori `attachments`, dan konfigurasi lokal sebelum migrasi. Semua backup berada di `backups/` yang diabaikan Git. Jalankan:

```bash
node --env-file=.env.postgres-migration --import tsx scripts/migrate-sqlite-to-postgres.ts backups/<backup>/archive.sqlite
```

Migrasi mempertahankan ID, nilai data, riwayat, dan hash kata sandi. Proses berada dalam satu transaksi dan menolak konflik dengan data tujuan. Menjalankan ulang hanya diterima bila seluruh data identik. Argumen ketiga opsional menunjuk backup awal untuk sinkronisasi akhir: perubahan dan penghapusan di sumber hanya diterapkan bila baris tujuan masih sama persis dengan backup awal. Sesi login lama tidak dipindahkan; pengguna masuk kembali. SQLite lama tetap disimpan sebagai backup, bukan fallback runtime.

Backup JSON konsisten dapat dibuat dengan `node --env-file=.env.local scripts/backup-postgres.mjs backups/<nama-unik>.json`. File lampiran disertakan sebagai base64. Untuk format pemulihan standar, gunakan `pg_dump --format=custom` versi yang sama atau lebih baru dari server (saat migrasi: PostgreSQL 18). Simpan hasil di tempat aman di luar container aplikasi; backup mencakup lampiran. Pemulihan memakai `pg_restore` ke database kosong, lalu arahkan `DATABASE_URL` ke hasil pemulihan.

### Pengujian PostgreSQL

Set `TEST_DATABASE_URL` sebelum `npm test`. Pengujian database membuat schema `test_*` unik dan menghapusnya setelah selesai; tidak memakai tabel aplikasi. Jalankan `node scripts/check-init-concurrency.mjs` untuk menguji inisialisasi lima proses bersamaan. Pengujian HTTP `scripts/integration.mjs` harus diarahkan ke server uji dengan schema `test_*`, `DEMO_ENABLED=true`, serta akun bootstrap uji.

Untuk backup konsisten: hentikan server, lalu salin **seluruh folder data**, termasuk SQLite, file WAL/SHM bila ada, dan attachments, ke folder backup bertanggal. Simpan `.env.local` secara aman terpisah. Untuk memulihkan, hentikan server, cadangkan kondisi saat ini, lalu kembalikan seluruh folder data dari satu backup yang sama. Ekspor Excel tidak menggantikan backup karena tidak menyertakan file lampiran atau akun.

Konfigurasi administrator pada env hanya dipakai saat belum ada akun. Mengubah env sesudah akun dibuat tidak mengganti sandinya.

## Verifikasi

```sh
npm test
npm run typecheck
npm run build
# Server lokal dan .env.local harus tersedia untuk uji API berikut:
node --env-file=.env.local scripts/integration.mjs
```

Uji mencakup tanggal arsip, biaya bersama, kosong versus nol, pemetaan Excel, hasil XLSX, CRUD, konflik versi, duplikat, riwayat, lampiran, pemulihan, login, dan isolasi ruang kantor. Uji API membersihkan hanya fixture buatannya sendiri.

Dibangun dengan Next.js, React, TypeScript, Tailwind CSS, komponen shadcn/ui, dan SQLite. Versi ini siap dicoba secara lokal. Pemakaian bersama melalui jaringan/server masih memerlukan pengaturan hosting dengan penyimpanan persisten, HTTPS, dan backup terjadwal. Tidak ada deployment publik yang dilakukan.

### Data pegawai

Menu **Pegawai** mendukung tambah, lihat detail dan riwayat, edit, serta hapus untuk operator dan administrator. Data awal diambil dari peserta arsip, lalu disimpan sebagai direktori pegawai tersendiri. Nama, NIP opsional, jabatan, golongan, dan bidang tersedia untuk pengisian arsip baru. Edit identitas tidak mengubah salinan identitas dalam arsip lama. Identitas lama tetap digunakan untuk menampilkan riwayat. Pegawai yang dihapus tidak muncul sebagai pilihan arsip baru dan dapat dipulihkan melalui **Pegawai terhapus**. Data pegawai dipisahkan per workspace; duplikasi identitas dan perubahan bersamaan diperiksa saat menyimpan.

Golongan pegawai dapat diisi, diubah, atau dikosongkan melalui form pegawai dan ditampilkan pada tabel serta detail. Pilihan golongan memakai combobox yang tetap menerima input manual. Saat memilih pegawai pada rekap per pegawai, golongan ikut terisi. Entri lama yang belum memiliki kolom golongan diisi sekali dari arsip perjalanan terbaru yang memuatnya; nilai yang kemudian dikosongkan tidak diisi ulang otomatis. Perubahan golongan master tidak mengubah arsip perjalanan sebelumnya.

### Perjalanan luar Provinsi Jambi

Rekap per pegawai mendukung tujuan domestik di luar Jambi pada mode satu maupun banyak pegawai. Pilih cakupan dan provinsi tujuan pada rute perjalanan; nama kota/instansi tetap dapat diketik bebas. Uang harian otomatis memakai tarif provinsi tujuan dari Perpres 72/2025, Lampiran I, Tabel 1.2. Untuk beberapa provinsi, pilih opsi Beberapa provinsi dan isi tarif/total manual sesuai pembagian hari.

Tab Penerbangan pada biaya per pegawai memisahkan tiket pergi dan pulang sebagai dua tab; setiap arah berisi daftar penerbangan berurutan (kota asal, kota tujuan, maskapai, tanggal, kode booking, nomor tiket) dan satu blok pemesanan (aplikasi, order ID, harga). Penerbangan transit dicatat dengan tombol Tambah transit, yang memulai penerbangan berikutnya dari kota pendaratan sebelumnya; harga diisi sekali sebagai total pemesanan arah itu. Tombol Salin rute pergi (dibalik) mengisi rute pulang dari rute pergi tanpa menyalin kode booking. Tombol Gunakan jumlah tiket mengganti biaya udara; bukti tidak dijumlahkan dua kali. Pada Excel, penerbangan transit menjadi baris lanjutan pada kolom penerbangan yang sama, dan harga pada baris lanjutan ditandai untuk diperiksa, bukan dijumlahkan. Ekspor memisahkan sheet dalam/luar provinsi dan mempertahankan cakupan serta provinsi tujuan saat diimpor kembali.

# Penamaan halaman dan tabel

Alamat halaman: `/arsip-perjalanan`, `/surat-tugas`, `/honorarium`, `/rekap-laporan`, `/dokumen`, `/pegawai`, `/pengaturan`, `/sampah`, dan `/cetak/[id]`.
Alamat Inggris sebelumnya, `/`, dan tautan `?section=...` dialihkan ke alamat Indonesia. Endpoint `/api/...` tetap kompatibel dengan pemanggil yang ada.

| Tabel lama | Tabel baru |
| --- | --- |
| records | arsip_perjalanan |
| users | pengguna |
| sessions | sesi_login |
| settings | pengaturan |
| attempts | percobaan_login |
| employees | pegawai |
| honorariums | honorarium |
| attachments | lampiran |

Nama kolom dan struktur JSON tetap kompatibel. Migrasi memakai ALTER TABLE RENAME, termasuk nama constraint dan indeks bawaan yang terkait. Migrasi berjalan otomatis ketika versi aplikasi ini pertama kali menginisialisasi database. Seluruh perubahan nama dan pembuatan skema berada dalam satu transaksi dengan advisory lock; benturan nama membatalkan transaksi. Migrasi dapat dijalankan berulang, termasuk pada database kosong. Batas tunggu lock perubahan tabel adalah 5 detik.

## Penerapan

1. Buat backup dengan `scripts/backup-postgres.mjs` sebelum mengganti versi. Skrip mendukung nama tabel lama maupun baru dan menolak menimpa file backup.
2. Hentikan seluruh proses aplikasi versi lama sebelum menjalankan versi baru. Versi lama memakai query dengan nama Inggris sehingga tidak boleh berjalan bersamaan setelah migrasi.
3. Jalankan versi baru; inisialisasi pertama mengganti nama tabel yang sudah ada tanpa memindahkan baris. Periksa login, arsip, pegawai, dokumen, dan honorarium.
4. Rollback kode saja tidak cukup: setelah menghentikan versi baru, kembalikan nama tabel, constraint, dan indeks sesuai pemetaan melalui transaksi, atau pulihkan backup ke database terpisah dan arahkan versi lama ke database tersebut.

Impor dari backup SQLite tetap membaca nama tabel asli dalam backup dan menulis ke nama Indonesia di PostgreSQL. Berkas backup SQLite tidak diubah.

## Verifikasi

`TEST_DATABASE_URL` harus menunjuk database pengujian. Tes membuat schema sementara yang dihapus setelah selesai. Tes migrasi memastikan identitas tabel (OID), data termasuk byte lampiran, dan jumlah indeks tetap sama; pengulangan migrasi serta rollback ketika terjadi benturan nama juga diuji.

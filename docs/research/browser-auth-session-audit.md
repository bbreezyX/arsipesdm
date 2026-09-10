# Audit perilaku sesi di browser

Tanggal: 9 September 2026. Lingkup: pembacaan kode frontend dan titik integrasinya dengan auth server. Tidak mengubah kode aplikasi, tidak membuka kredensial, dan tidak mengklaim pengujian login pada deployment aktif.

## Kesimpulan

Belum ditemukan logout otomatis karena pengguna tidak aktif. Sesi memiliki masa berlaku tetap 24 jam dari login. Berakhirnya sesi diperiksa oleh server saat ada permintaan; frontend tidak mempunyai timer yang langsung mengganti halaman menjadi login saat waktu tersebut lewat.

## Bukti

| Perilaku | Implementasi yang ditemukan | Sumber |
| --- | --- | --- |
| Login | Form mengirim email dan password ke `POST /api/session`, kemudian melakukan reload halaman. Tidak ada pilihan remember-me dalam form. | `src/components/workspace.tsx:1167-1228` |
| Lama sesi | Server menetapkan `expires = Date.now() + 86400000`; cookie `archive-session` memakai `maxAge: 86400`, `httpOnly: true`, `sameSite: lax`, dan path `/`. Ini merupakan cookie dengan masa berlaku eksplisit; menutup tab/browser bukan pemicu logout yang diimplementasikan aplikasi. Pengaturan browser yang menghapus cookie saat ditutup tetap dapat berbeda. | `src/app/api/session/route.ts:39-52`; arti `maxAge` dalam panduan Next terpasang: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:44-59` |
| Pemeriksaan expiry | Server hanya menerima sesi yang `expires > Date.now()`. Fungsi pembacaan sesi tidak memperpanjang expiry. | `src/lib/auth.ts:4-13` |
| Idle timer / polling | Pencarian seluruh `src` tidak menemukan tracker aktivitas auth, idle timeout, session polling, `BroadcastChannel`, maupun handler sinkronisasi logout lintas tab. Effect pada Workspace menangani shortcut pencarian, toast, dan pemuatan pegawai. Dua interval yang ada hanya memperbarui waktu/tanggal di UI. | `src/components/workspace.tsx:162-181,208-214`; `src/components/navbar-clock.tsx:24-36`; `src/components/beranda.tsx:39-50` |
| Ketika API menolak sesi | Helper `api` melempar `Error` untuk semua HTTP error tanpa perlakuan khusus 401, pengosongan state akun, atau membuka login. Contohnya kegagalan membuka arsip ditampilkan sebagai toast. Jalur batch yang memakai fetch langsung juga hanya menampilkan error. | `src/components/fields.tsx:54-59`; `src/components/workspace.tsx:236-260`; `src/components/batch-recap-form.tsx:99-120` |
| Reload dengan sesi tidak sah | Wrapper halaman memanggil `context()`; jika `UNAUTHORIZED`, halaman merender `OfficeLogin`. Honorarium melakukan pemeriksaan serupa. Login khusus halaman bersifat forced. | `src/components/workspace-page.tsx:6-25`; `src/app/honorarium/page.tsx:9-17`; `src/components/workspace.tsx:1146-1148` |
| Navigasi antarmenu | Sebagian besar perpindahan menu memakai `window.history.pushState`, sehingga bukan pemuatan ulang halaman yang otomatis memeriksa ulang auth server. Perpindahan masuk/keluar Honorarium memakai `window.location.assign`. | `src/components/workspace.tsx:219-228` |
| Logout manual | Menu Keluar memanggil `DELETE /api/session`, lalu membuka Beranda. Server menghapus sesi sesuai token serta cookie. | `src/components/workspace.tsx:414-422`; `src/app/api/session/route.ts:57-65` |
| Mode demo | Jika cookie tidak ada dan `DEMO_ENABLED === "true"`, `context()` dapat mengembalikan workspace demo; jika cookie masih ada tetapi token invalid, hasilnya `UNAUTHORIZED`. Karena itu hasil reload setelah cookie kedaluwarsa bergantung pada konfigurasi demo. | `src/lib/auth.ts:15-29` |

## Dampak yang diturunkan dari kode

- Komputer yang ditinggalkan masih mempunyai sesi valid sampai batas 24 jam, kecuali pengguna memilih Keluar atau sesi/cookie dicabut dengan cara lain. Tidak ada batas misalnya 15 atau 30 menit tanpa aktivitas.
- Tab yang sudah terbuka dapat tetap menampilkan data yang dimuat sebelumnya setelah sesi berakhir. Ini berbeda dari izin akses server: permintaan berikutnya ke jalur yang memeriksa auth akan ditolak. Kode frontend tidak langsung membersihkan data tersebut ketika sesi kedaluwarsa.
- Logout di satu tab tidak langsung mengubah tampilan tab lain yang sudah terbuka, karena tidak ditemukan mekanisme sinkronisasi. Request berikutnya memakai cookie browser yang sudah berubah; pemeriksaan server tetap menjadi batas akses.
- Form yang lama dibiarkan terbuka dapat gagal disimpan ketika sesi sudah habis, dan pengguna menerima error tanpa alur otomatis login ulang. Ini merupakan inferensi dari handler error; tidak diuji dengan menunggu 24 jam di browser.

## Metode dan batasan

Pemeriksaan server pendamping menemukan semua handler API bisnis memanggil `context()`, dengan pengelolaan pengaturan/pengguna dibatasi admin. Tidak ditemukan pembaruan expiry secara sliding pada source. Login dapat menghasilkan beberapa sesi bersamaan; logout hanya menghapus token sesi yang dikirim, bukan seluruh sesi pengguna (`src/app/api/session/route.ts:38-50,57-65`). Konfigurasi lokal yang diperiksa mempunyai `DEMO_ENABLED=false`; ini bukan kesimpulan tentang konfigurasi produksi.

Verifikasi HTTP read-only pada `http://127.0.0.1:3107` dengan proses 7444 yang ditelusuri ke checkout ini mendapatkan HTTP 401 pada GET API archives, employees, honorariums, dan users, masing-masing tanpa cookie dan dengan cookie invalid (delapan pemeriksaan). Halaman `/` dan `/honorarium` mengembalikan HTTP 200 dengan form login/kata sandi. Ini memverifikasi pembatasan akses lokal saat tanpa sesi/bertoken invalid, bukan menunggu sesi valid sampai melewati 24 jam. Tes integrasi yang menyebut `expired` memakai token invalid buatan; tes itu tidak memajukan waktu sesi valid melampaui expiry (`scripts/integration.mjs:234-280`).

Membaca `AGENTS.md`, panduan autentikasi dan cookie dari paket Next yang terpasang, serta mencari semua source TypeScript/TSX untuk `idle`, `inactiv`, `lastActivity`, `mousemove`, `pointermove`, `visibilitychange`, `pagehide`, `beforeunload`, `storage`, `setInterval`, `setTimeout`, `401`, `logout`, `remember`, `session`, `fetch`, dan listener browser. Temuan negatif berarti tidak ditemukan pada source yang diperiksa, bukan verifikasi konfigurasi browser atau deployment produksi.

Audit ini tidak menentukan kebijakan timeout yang seharusnya dipakai. Jika ingin menambahkan idle logout, desain perlu menetapkan batas tidak aktif, batas sesi absolut, penanganan form yang belum tersimpan, penguncian tampilan ketika sesi habis, dan sinkronisasi lintas tab, dengan validasi server sebagai penentu akses.

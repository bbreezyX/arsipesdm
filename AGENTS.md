<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# REK APP — pedoman proyek

Aplikasi arsip perjalanan dan administrasi berbahasa Indonesia. Ikuti istilah, route, tampilan tabel dan kontrak ekspor yang sudah dipakai. Petunjuk proyek ini berada di luar blok Next yang dikelola framework; gunakan bagian dokumentasi lokal yang relevan untuk perubahan API Next.

## Perintah

- `npm run dev`: server lokal `127.0.0.1:3107`.
- `npm run test`: tes `src/lib/*.test.ts` melalui tsx/Node; jalankan file terkait untuk perubahan terbatas.
- `npm run lint`: Biome; `npm run typecheck`: TypeScript.
- `npm run build`: build Next. `npm start`: hasil build di port `PORT` atau 3107.

## Sumber dan batas penting

- [src/lib/permissions.ts](src/lib/permissions.ts): Administrator, Operator dan Pembaca serta izin tiap operasi. Terapkan pemeriksaan izin di server; menu tersembunyi bukan batas akses.
- [src/lib/archive-access.ts](src/lib/archive-access.ts): proyeksi data arsip sesuai akses pengguna; pertahankan sebelum mengirim data ke klien.
- [src/lib/postgres.ts](src/lib/postgres.ts) dan [src/lib/table-names.ts](src/lib/table-names.ts): akses/skema PostgreSQL dan pemetaan tabel lama. Pertahankan transaksi serta advisory lock saat inisialisasi/rename; jangan menerapkan perubahan ke database lain hanya karena perintah dijalankan lokal.
- [src/lib/archive-groups.ts](src/lib/archive-groups.ts): pengelompokan arsip Surat Tugas. Pertahankan hubungan per pegawai dan bentuk data yang dikonsumsi ekspor; tinjau pemanggil terkait saat mengubah kontrak bersama.

Selesaikan lingkup yang diminta, jalankan pemeriksaan yang relevan dan pertahankan perubahan lain. Uji hasil berjalan bila perilaku UI/API menjadi bagian tugas. Gunakan kembali izin yang sudah diberikan untuk target/tindakan yang sama; laporkan hasil verifikasi dan kendala secara konkret.

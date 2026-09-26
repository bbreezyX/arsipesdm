import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans/wdth.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./globals.css";
import "./arsip.css";
import "./beranda.css";
import "./surat-tugas.css";
import "./arsip-perjalanan.css";
import "./honorarium.css";
import "./arsip-rincian.css";
import "./laporan.css";
import "./pegawai.css";
import "./dokumen.css";
import "./auth.css";
import "driver.js/dist/driver.css";
import "./onboarding.css";
import "./form-rail.css";
import "./rekap-form.css";
import "./date-input.css";
export const metadata: Metadata = {
  title: "Arsip Perjalanan | Dinas ESDM Jambi",
  description:
    "Pengelolaan arsip dan rekap perjalanan dinas Dinas ESDM Provinsi Jambi",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

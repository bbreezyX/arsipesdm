import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
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

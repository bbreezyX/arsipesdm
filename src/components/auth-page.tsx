import Image from "next/image";
import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

export default function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-brand" aria-labelledby="auth-welcome">
          <div className="auth-art" aria-hidden="true">
            <Image
              src="/art/auth-archive-sketch.png"
              alt=""
              fill
              sizes="(max-width: 760px) 65vw, 50vw"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <p className="auth-brand-tag">Arsip perjalanan dinas</p>
          <div className="auth-brand-hero">
            <h1 id="auth-welcome">Arsip rapi,<br />laporan siap.</h1>
            <p>
              Surat tugas, rekap biaya, honorarium, dan dokumen perjalanan
              dinas. Semua tersimpan dalam satu ruang arsip kantor.
            </p>
          </div>
        </section>
        <section className="auth-side" aria-labelledby="auth-title">
          <div className="auth-brand-mark">
            <span className="auth-crest">
              <img src="/logo-jambi.svg" alt="Lambang Provinsi Jambi" width="100" height="104" />
            </span>
            <span className="auth-brand-label">
              <strong>Dinas ESDM</strong>
              <span>Provinsi Jambi</span>
            </span>
          </div>
          <div className="auth-panel">
            <header className="auth-panel-heading">
              <h2 id="auth-title">Selamat datang kembali.</h2>
              <p>Masuk untuk mengelola arsip kantor Anda.</p>
            </header>
            {children}
          </div>
          <footer className="auth-foot">
            <p><LockKeyhole size={13} aria-hidden="true" />Akses hanya untuk pengguna terdaftar</p>
            <span>© {new Date().getFullYear()} Dinas ESDM Provinsi Jambi</span>
          </footer>
        </section>
      </div>
    </main>
  );
}

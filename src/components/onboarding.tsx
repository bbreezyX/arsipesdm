"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, X } from "lucide-react";
import type { User } from "@/lib/model";
import { canUseOnboarding, parseOnboardingProgress, type OnboardingId, type OnboardingProgress, type OnboardingStatus } from "@/lib/onboarding";
import { api } from "./fields";

type OnboardingContextValue = {
  ready: boolean;
  progress: OnboardingProgress;
  user: User;
  error: string;
  remember: (id: OnboardingId, status: OnboardingStatus) => void;
};
const OnboardingContext = createContext<OnboardingContextValue | null>(null);
export const useOnboarding = () => useContext(OnboardingContext);

export function OnboardingProvider({ user, demo, children }: { user: User; demo: boolean; children: ReactNode }) {
  const [progress, setProgress] = useState<OnboardingProgress>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<OnboardingProgress>({});
  const storageKey = `arsip:onboarding:v1:${demo ? "demo" : user.id}`;

  useEffect(() => {
    let cancelled = false;
    let local: OnboardingProgress = {};
    try { local = parseOnboardingProgress(JSON.parse(localStorage.getItem(storageKey) || "{}")); } catch { /* Storage may be unavailable. */ }
    const load = async () => {
      let saved: OnboardingProgress = {};
      try {
        if (!demo) saved = parseOnboardingProgress(await api("/api/onboarding"));
      } catch { /* Browser preferences still work when the server is unavailable. */ }
      if (cancelled) return;
      current.current = { ...local, ...saved, ...current.current };
      setProgress(current.current);
      setReady(true);
    };
    void load();
    return () => { cancelled = true; };
  }, [demo, storageKey]);

  const remember = (id: OnboardingId, status: OnboardingStatus) => {
    if (!canUseOnboarding(user, id)) return;
    current.current = { ...current.current, [id]: status };
    setProgress(current.current);
    let storedLocally = false;
    try { localStorage.setItem(storageKey, JSON.stringify(current.current)); storedLocally = true; } catch { /* The account copy can still be saved. */ }
    if (demo) {
      if (!storedLocally) setError("Pilihan panduan belum tersimpan. Panduan dapat muncul lagi setelah halaman dimuat ulang.");
      return;
    }
    void api("/api/onboarding", { method: "PATCH", body: JSON.stringify({ id, status }) })
      .then(() => setError(""))
      .catch(() => setError(storedLocally
        ? "Pilihan panduan tersimpan di browser ini, tetapi belum tersinkron ke akun."
        : "Pilihan panduan belum tersimpan. Panduan dapat muncul lagi setelah halaman dimuat ulang."));
  };

  return <OnboardingContext.Provider value={{ ready, progress, user, error, remember }}>{children}</OnboardingContext.Provider>;
}

export function OnboardingNotice() {
  const onboarding = useOnboarding();
  return onboarding?.error ? <p className="onboarding-notice" role="status">{onboarding.error}</p> : null;
}

const hintCopy = {
  "create-archive": ["Mulai dari rekap yang sudah ada", "Catat perjalanan yang sudah selesai. Siapkan Surat Tugas, nama pegawai, dan rincian biaya. Nominal yang belum diketahui boleh tetap kosong."],
  "import-excel": ["Periksa dulu, simpan kemudian", "Pilih berkas Excel, cocokkan kolom, lalu periksa pratinjau. Arsip baru tersimpan setelah Anda mengonfirmasi impor."],
  documents: ["Lengkapi berkas per perjalanan", "Pilih map di daftar, lalu unggah foto atau PDF ke kantongnya atau catat lokasi berkas fisiknya. Map berikutnya yang kurang membawa Anda ke map yang belum lengkap."],
} as const;

export function OnboardingHint({ id }: { id: keyof typeof hintCopy }) {
  const onboarding = useOnboarding();
  if (!onboarding?.ready || onboarding.progress[id] || !canUseOnboarding(onboarding.user, id)) return null;
  const [title, description] = hintCopy[id];
  return <aside className="onboarding-hint" aria-label={title}>
    <BookOpen size={17} aria-hidden="true" />
    <div><strong>{title}</strong><p>{description}</p></div>
    <button type="button" onClick={() => onboarding.remember(id, "dismissed")} aria-label={`Tutup petunjuk: ${title}`}><X size={16} /></button>
  </aside>;
}

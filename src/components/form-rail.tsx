"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Check } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

/* Bagian bersama formulir "map berkas": rel biru laut berisi judul, langkah
   atau bagian beserta statusnya, dan slip angka utama. Gaya di form-rail.css. */

export type RailStatus = "done" | "required" | "open" | "optional" | "error";

export function FormRail({ kicker, title, description, showDescription = false, children }: {
  kicker: ReactNode;
  title: ReactNode;
  /** Tanpa deskripsi di rel, RailStepHead membawa DialogDescription. */
  description?: ReactNode;
  showDescription?: boolean;
  children: ReactNode;
}) {
  return <aside className="form-rail">
    <DialogHeader className="rail-head">
      <div className="dialog-kicker">{kicker}</div>
      <DialogTitle>{title}</DialogTitle>
      {description && <DialogDescription className={showDescription ? undefined : "sr-only"}>{description}</DialogDescription>}
    </DialogHeader>
    {children}
  </aside>;
}

/** Isi satu langkah atau bagian: penanda bernomor (centang bila terisi) dan status singkat. */
export function RailStepLabel({ index, status, label, note }: { index: number; status: RailStatus; label: string; note: string }) {
  return <>
    <i aria-hidden="true">{status === "done" ? <Check size={12} strokeWidth={3} /> : status === "error" ? "!" : index + 1}</i>
    <span>{label}<small>{note}</small></span>
  </>;
}

/** Potongan kuitansi di dasar rel: angka utama di atas garis sobek, keterangan di bawahnya. */
export function RailSlip({ label, value, empty = false, complete = false, children }: {
  label: string;
  value: string;
  empty?: boolean;
  complete?: boolean;
  children: ReactNode;
}) {
  return <div className="rail-slip" data-complete={complete || undefined} aria-live="polite">
    <span>{label}</span>
    <strong data-empty={empty || undefined}>{value}</strong>
    <div className="rail-slip-foot">{children}</div>
  </div>;
}

/** Kepala lembar isian: pertanyaan yang dijawab bagian ini dan satu kalimat tujuan. */
export function RailStepHead({ counter, question, purpose, describes = false, headingRef }: {
  counter?: string;
  question: string;
  purpose: ReactNode;
  /** Jadikan kalimat tujuan sebagai deskripsi dialog bila rel tidak membawanya. */
  describes?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return <header className="rail-step-head">
    {counter && <span>{counter}</span>}
    <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{question}</h3>
    {describes ? <DialogDescription>{purpose}</DialogDescription> : <p>{purpose}</p>}
  </header>;
}

/** Formulir satu halaman: bagian yang sedang terbaca dan lompatan ke bagian lain. */
export function useSectionSpy<K extends string>(keys: readonly K[]) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<K>(keys[0]);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const update = () => {
      const top = body.getBoundingClientRect().top + 32;
      let current = keys[0];
      for (const key of keys) {
        const section = body.querySelector(`[data-rail-section="${key}"]`);
        if (section && section.getBoundingClientRect().top <= top) current = key;
      }
      // Bagian terakhir yang pendek tidak pernah mencapai atas; dasar gulungan menandainya.
      if (body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) current = keys[keys.length - 1];
      setActive(current);
    };
    update();
    body.addEventListener("scroll", update, { passive: true });
    return () => body.removeEventListener("scroll", update);
  }, [keys]);
  const jump = useCallback((key: K) => {
    const body = bodyRef.current;
    const section = body?.querySelector<HTMLElement>(`[data-rail-section="${key}"]`);
    if (!body || !section) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.scrollTo({ top: body.scrollTop + section.getBoundingClientRect().top - body.getBoundingClientRect().top, behavior: reduce ? "auto" : "smooth" });
    section.querySelector<HTMLElement>("input:not([disabled]):not([readonly]), textarea:not([disabled]), button[role='combobox']:not([disabled])")?.focus({ preventScroll: true });
    setActive(key);
  }, []);
  return { bodyRef, active, jump };
}

"use client";

import { useEffect, useEffectEvent } from "react";
import type { Driver, DriveStep } from "driver.js";
import { useOnboarding } from "./onboarding";

function visibleTarget(name: string) {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)]
    .find(element => element.getClientRects().length > 0);
}

/** Wait for the help dialog's closing animation and focus trap to finish. */
function waitForWorkspace(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { observer.disconnect(); clearTimeout(timeout); signal.removeEventListener("abort", abort); };
    const check = () => {
      if (visibleTarget("archive-heading") && !document.querySelector('[data-slot="dialog-content"]')) {
        cleanup(); resolve();
      }
    };
    const abort = () => { cleanup(); reject(new Error("cancelled")); };
    const observer = new MutationObserver(check);
    const timeout = setTimeout(() => { cleanup(); reject(new Error("not-ready")); }, 4000);
    signal.addEventListener("abort", abort, { once: true });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    if (signal.aborted) abort(); else check();
  });
}

export default function ArchiveGuide({ onClose, onError }: { onClose: () => void; onError: () => void }) {
  const onboarding = useOnboarding();
  const finish = useEffectEvent((completed: boolean) => {
    onboarding?.remember("archive-guide", completed ? "completed" : "dismissed");
    onClose();
  });
  const fail = useEffectEvent(onError);

  useEffect(() => {
    const controller = new AbortController();
    let tour: Driver | undefined;
    let dialogObserver: MutationObserver | undefined;
    let completed = false;
    const launch = async () => {
      try {
        const [{ driver }] = await Promise.all([import("driver.js"), waitForWorkspace(controller.signal)]);
        if (controller.signal.aborted) return;
        const record = visibleTarget("archive-record");
        const steps: DriveStep[] = [
          { element: '[data-tour="archive-heading"]', popover: { title: "Temukan arsip perjalanan", description: "Di sini tersimpan perjalanan yang sudah selesai. Mari lihat cara menemukan rekap yang Anda perlukan." } },
          { element: '[data-tour="archive-years"]', popover: { title: "Pilih tahun pelaksanaan", description: "Pilih tahun perjalanan, atau pilih Semua untuk mencari di seluruh tahun. Angka di bawah tahun menunjukkan jumlah perjalanan." } },
          { element: '[data-tour="archive-search"]', popover: { title: "Cari arsip yang diperlukan", description: "Ketik nomor surat, tujuan, atau nama pegawai. Gunakan filter bidang dan bulan untuk mempersempit hasil." } },
          record ? {
            element: () => visibleTarget("archive-record") ?? visibleTarget("archive-results")!,
            popover: { title: "Baca rincian perjalanan", description: "Klik nomor Surat Tugas untuk membuka daftar rekap pegawai. Pilih Detail pada rekap untuk melihat perjalanan dan rincian biayanya." },
          } : {
            element: '[data-tour="archive-results"]',
            popover: { title: "Hasil pencarian muncul di sini", description: "Belum ada perjalanan yang cocok. Coba tahun atau kata kunci lain. Saat arsip tersedia, klik nomor Surat Tugas untuk melihat rekap tiap pegawai." },
          },
          { element: '[data-tour="help"]', popover: { align: "end", title: "Panduan selalu tersedia", description: "Buka tombol bantuan ini kapan saja untuk membaca petunjuk atau mengulangi panduan. Anda siap menelusuri arsip." } },
        ];
        tour = driver({
          steps,
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          smoothScroll: false,
          overlayColor: getComputedStyle(document.documentElement).getPropertyValue("--ledger-navy").trim(),
          overlayOpacity: 0.38,
          stagePadding: 6,
          stageRadius: 10,
          popoverClass: "arsip-tour",
          showProgress: true,
          progressText: "{{current}} dari {{total}}",
          nextBtnText: "Lanjut",
          prevBtnText: "Kembali",
          doneBtnText: "Selesai",
          onPopoverRender: popover => {
            popover.closeButton.textContent = "Lewati";
            popover.closeButton.setAttribute("aria-label", "Lewati panduan");
            popover.wrapper.setAttribute("lang", "id");
          },
          onDoneClick: () => { completed = true; tour?.destroy(); },
          onDestroyed: () => {
            dialogObserver?.disconnect();
            if (!controller.signal.aborted) {
              finish(completed);
              requestAnimationFrame(() => {
                if (!document.querySelector('[data-slot="dialog-content"]')) visibleTarget("help")?.focus({ preventScroll: true });
              });
            }
          },
        });
        tour.drive();
        // Yield immediately to forms or session dialogs opened during the tour.
        dialogObserver = new MutationObserver(() => {
          if (document.querySelector('[data-slot="dialog-content"][data-state="open"]')) tour?.destroy();
        });
        dialogObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
      } catch {
        if (!controller.signal.aborted) fail();
      }
    };
    void launch();
    return () => { controller.abort(); dialogObserver?.disconnect(); tour?.destroy(); };
  }, []);
  return null;
}

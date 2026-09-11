"use client";

import { useEffect, useRef, useState } from "react";

const formatDefault = (value: number) => value.toLocaleString("id-ID");

/**
 * Menghitung dari nilai sebelumnya (awalnya 0) menuju nilai baru.
 * Render pertama langsung menampilkan nilai akhir agar hidrasi cocok dan
 * tetap terbaca tanpa JavaScript; gerak hanya terjadi setelah terpasang.
 */
export function AnimatedNumber({ value, duration = 1200, format = formatDefault }: {
  value: number;
  duration?: number;
  format?: (value: number) => string;
}) {
  const [shown, setShown] = useState(value);
  // Nilai yang benar-benar sudah tergambar; null sebelum bingkai pertama.
  // Dengan begitu efek yang dijalankan ulang (StrictMode) tetap mulai dari 0.
  const drawn = useRef<number | null>(null);
  useEffect(() => {
    const from = drawn.current ?? 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === value) { drawn.current = value; setShown(value); return; }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (value - from) * eased);
      drawn.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

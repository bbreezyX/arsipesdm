"use client";

import { useId } from "react";
import { ArrowUpRight } from "lucide-react";
import { shortMoney } from "@/lib/model";
import { AnimatedNumber } from "./animated-number";

const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const width = 240;
const height = 44;

/** Kartu total realisasi: potongan kuitansi dengan kurva realisasi kumulatif
 *  dari Januari sampai bulan berjalan; sisa tahun digambar putus-putus. */
export default function BerandaTotal({ year, today, total, known, unknown, recaps, monthly, onOpen }: {
  year: string;
  today: string;
  total: number;
  known: number;
  unknown: number;
  recaps: number;
  monthly: number[];
  onOpen: () => void;
}) {
  const gradient = useId();
  // Bulan berjalan untuk tahun ini, Desember untuk tahun lampau; perjalanan terjadwal ikut terhitung.
  let through = today.startsWith(year) ? Number(today.slice(5, 7)) - 1 : 11;
  monthly.forEach((value, month) => { if (value > 0 && month > through) through = month; });
  let running = 0;
  const points = [[0, height], ...monthly.slice(0, through + 1).map((value, month) => {
    running += value;
    return [((month + 1) / 12) * width, height - (running / (total || 1)) * (height - 4)];
  })];
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [endX, endY] = points[points.length - 1];
  const period = `${months[0]}–${months[through]} ${year}`;

  return <button type="button" className="beranda-stat beranda-stat-total" onClick={onOpen}>
    <span className="beranda-stat-label">Total realisasi {year} <ArrowUpRight size={15} aria-hidden="true" /></span>
    <strong className="beranda-stat-value" data-empty={!known || undefined}>
      {known ? <><small>Rp</small> <AnimatedNumber value={total} duration={700} /></> : recaps ? "Belum bernominal" : "Belum ada arsip"}
    </strong>
    {known > 0 && <span className="beranda-total-curve" aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ledger-gold)" stopOpacity=".32" />
            <stop offset="1" stopColor="var(--ledger-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="beranda-total-base" d={`M0 ${height - 0.5} H${width}`} />
        {endX < width && <path className="beranda-total-rest" d={`M${endX.toFixed(1)} ${endY.toFixed(1)} H${width}`} />}
        <path d={`${line} L${endX.toFixed(1)} ${height} Z`} fill={`url(#${gradient})`} />
        <path className="beranda-total-line" d={line} />
      </svg>
      <i className="beranda-total-dot" style={{ left: `${(endX / width) * 100}%`, top: `${(endY / height) * 100}%` }} />
    </span>}
    <span className="beranda-stat-detail">
      <span>{period}</span>
      {unknown > 0
        ? <b className="beranda-total-missing">{unknown} rekap belum bernominal</b>
        : known > 0 && <span>± Rp {shortMoney(Math.round(total / known))} per rekap</span>}
    </span>
  </button>;
}

"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowRight, Plus, Upload } from "lucide-react";
import type { BerandaSummary } from "@/lib/beranda";
import { defaultFilters, shortMoney, type Filters } from "@/lib/model";
import { terbilang } from "@/lib/terbilang";
import { AnimatedNumber } from "./animated-number";
import { Button } from "./ui/button";

const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

/**
 * Hero beranda: satu angka realisasi selebar panel, baris terbilang seperti pada kuitansi,
 * lalu pita dua belas bulan yang sekaligus menjadi pemilih periode.
 */
export default function BerandaHero({ year, hero, monthlyDetails, greeting, demo, onArchives, onAdd, onImport, editable = true }: {
  year: string;
  hero: BerandaSummary["hero"];
  monthlyDetails: BerandaSummary["monthlyDetails"];
  greeting: string;
  demo: boolean;
  onArchives: (filters: Partial<Filters>) => void;
  onAdd: () => void;
  onImport: () => void;
  editable?: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [previewMonth, setPreviewMonth] = useState<number | null>(null);
  const monthButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const period = selectedMonth === null ? hero : monthlyDetails[selectedMonth];
  const periodLabel = selectedMonth === null ? `sepanjang ${year}` : `${months[selectedMonth]} ${year}`;
  const chartMonth = previewMonth ?? selectedMonth;
  const maximum = Math.max(...monthlyDetails.map(item => item.total), 1);
  const nominal = period.known ? rupiah(period.total) : period.recaps ? "Belum bernominal" : "Belum ada arsip";

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, month: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (month + 1) % 12;
    else if (event.key === "ArrowLeft") next = (month + 11) % 12;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 11;
    else if (event.key === "Escape") {
      setSelectedMonth(null);
      setPreviewMonth(null);
      return;
    } else return;
    event.preventDefault();
    monthButtons.current[next]?.focus();
  }

  const monthText = (month: number) => {
    const item = monthlyDetails[month];
    return item.known ? rupiah(item.total) : item.recaps ? "Belum bernominal" : "Belum ada arsip";
  };

  return (
    <section className="beranda-hero" aria-labelledby="beranda-title">
      <div className="beranda-kop">
        <span>{demo ? "Ruang contoh · data fiktif" : "Pemerintah Provinsi Jambi"}</span>
        <span>Dinas Energi dan Sumber Daya Mineral</span>
      </div>

      <div className="beranda-hero-top">
        <h1 id="beranda-title" className="beranda-greeting">{greeting}</h1>
        {editable ? (
          <div className="beranda-hero-actions">
            <Button className="beranda-cta" onClick={onAdd}><Plus data-icon="inline-start" /> Tambah arsip</Button>
            <Button variant="outline" className="beranda-cta-outline" onClick={onImport}><Upload data-icon="inline-start" /> Impor Excel</Button>
          </div>
        ) : <span className="beranda-reader-note">Akses Pembaca · Lihat arsip dan laporan</span>}
      </div>

      <div className="beranda-hero-summary" id="beranda-period-summary">
        <p className="beranda-hero-label">Realisasi perjalanan dinas, <span>{periodLabel}</span></p>
        <p className={`beranda-figure${period.known ? "" : " is-empty"}`}>
          {period.known
            ? <><span className="sr-only">{nominal}</span><small aria-hidden="true">Rp</small><span aria-hidden="true"><AnimatedNumber value={period.total} duration={350} /></span></>
            : nominal}
        </p>
        <p className="beranda-terbilang">
          {period.known ? terbilang(period.total)
            : !period.recaps ? selectedMonth === null
              ? editable ? "Tambahkan arsip pertama atau impor rekap Excel Anda." : "Arsip akan tampil setelah dicatat oleh operator."
              : "Belum ada perjalanan tercatat pada bulan ini."
            : "Realisasi biaya belum diisi pada rekap bulan ini."}
        </p>
        <ul className="beranda-facts" aria-label={`Ringkasan ${periodLabel}`}>
          <li><strong>{period.journeys}</strong> perjalanan</li>
          <li><strong>{period.recaps}</strong> rekap</li>
          <li><strong>{period.people}</strong> pegawai</li>
          {period.unknown > 0 && period.known > 0 && <li className="beranda-fact-warn"><strong>{period.unknown}</strong> rekap belum bernominal</li>}
        </ul>
      </div>

      <div className="beranda-monthly" role="group" aria-label={`Realisasi bulanan ${year}`} aria-describedby="beranda-chart-hint">
        <div className="beranda-month-chart" onPointerLeave={() => setPreviewMonth(null)}>
          {monthlyDetails.map((item, month) => {
            const highlight = selectedMonth === month || (selectedMonth === null && hero.peak?.month === month);
            return (
              <button type="button" className="beranda-month" key={month}
                ref={element => { monthButtons.current[month] = element; }}
                aria-label={`${months[month]} ${year}, ${item.known ? rupiah(item.total) : item.recaps ? "belum bernominal" : "belum ada arsip"}, ${item.journeys} perjalanan${item.unknown ? `, ${item.unknown} rekap belum bernominal` : ""}`}
                aria-pressed={selectedMonth === month} aria-controls="beranda-period-summary"
                data-highlight={highlight || undefined}
                data-empty={item.total === 0 || undefined}
                onPointerEnter={event => { if (event.pointerType !== "touch") setPreviewMonth(month); }}
                onFocus={() => setPreviewMonth(month)} onBlur={() => setPreviewMonth(null)}
                onKeyDown={event => moveFocus(event, month)}
                onClick={() => setSelectedMonth(selectedMonth === month ? null : month)}>
                <span className="beranda-month-track" aria-hidden="true" style={{ "--bar-scale": item.total / maximum, "--bar-order": month } as CSSProperties}>
                  {item.total > 0 ? <span className="beranda-month-value">{shortMoney(item.total)}</span> : null}
                  <span className="beranda-month-bar" />
                  {item.total === 0 ? <span className="beranda-month-zero" /> : null}
                </span>
                <span className="beranda-month-name" aria-hidden="true">{monthLabels[month]}</span>
              </button>
            );
          })}
        </div>
        <div className="beranda-chart-foot">
          <Button type="button" variant="ghost" size="xs" className="beranda-year-reset" aria-pressed={selectedMonth === null}
            onClick={() => { setSelectedMonth(null); setPreviewMonth(null); }}>Setahun</Button>
          <p id="beranda-chart-hint" className="beranda-chart-detail">
            {chartMonth === null
              ? hero.peak ? <>Puncak realisasi <b>{months[hero.peak.month]}</b>, Rp {shortMoney(hero.peak.total)}. Pilih bulan untuk rinciannya.</> : "Pilih bulan untuk melihat rinciannya."
              : <><b>{months[chartMonth]}</b> {monthText(chartMonth)}{monthlyDetails[chartMonth].journeys ? <>, {monthlyDetails[chartMonth].journeys} perjalanan</> : null}</>}
          </p>
          <Button type="button" variant="ghost" className="beranda-view-archives" onClick={() => onArchives({
            ...defaultFilters, year, month: selectedMonth === null ? "all" : String(selectedMonth + 1).padStart(2, "0"),
          })}>
            {selectedMonth === null ? "Lihat arsip" : `Arsip ${monthLabels[selectedMonth]}`}<ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <span className="sr-only" role="status" aria-atomic="true">
        Realisasi {periodLabel}: {nominal}, {period.journeys} perjalanan, {period.recaps} rekap, {period.people} pegawai.
      </span>
    </section>
  );
}

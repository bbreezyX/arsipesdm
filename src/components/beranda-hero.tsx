"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";
import type { BerandaSummary } from "@/lib/beranda";
import { defaultFilters, shortMoney, type Filters } from "@/lib/model";
import { AnimatedNumber } from "./animated-number";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";

const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

/** Monthly realisation; the selected period also filters the archive shortcut. */
export default function BerandaHero({ year, hero, monthlyDetails, onArchives }: {
  year: string;
  hero: BerandaSummary["hero"];
  monthlyDetails: BerandaSummary["monthlyDetails"];
  onArchives: (filters: Partial<Filters>) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [previewMonth, setPreviewMonth] = useState<number | null>(null);
  const monthButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const period = selectedMonth === null ? hero : monthlyDetails[selectedMonth];
  const periodLabel = selectedMonth === null ? `sepanjang ${year}` : `${months[selectedMonth]} ${year}`;
  const chartMonth = previewMonth ?? selectedMonth;
  const maximum = Math.max(...monthlyDetails.map(item => item.total), 1);
  const chartStep = 10 ** Math.floor(Math.log10(maximum));
  const chartMaximum = Math.ceil(maximum / chartStep) * chartStep;
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
    <section className="beranda-hero" aria-labelledby="beranda-chart-title">
      <header className="beranda-chart-head">
        <h2 id="beranda-chart-title">Realisasi bulanan</h2>
        <CustomSelect className="beranda-period-select" aria-label="Periode realisasi"
          value={selectedMonth === null ? "all" : String(selectedMonth)} onValueChange={value => {
            setSelectedMonth(value === "all" ? null : Number(value));
            setPreviewMonth(null);
          }}>
          <SelectOption value="all">Setahun {year}</SelectOption>
          {months.map((month, index) => <SelectOption key={month} value={String(index)}>{month} {year}</SelectOption>)}
        </CustomSelect>
      </header>

      <div className="beranda-hero-summary" id="beranda-period-summary">
        {selectedMonth === null ? (
          <div className="beranda-chart-description">
            <p>{hero.recaps ? "Pilih bulan untuk melihat rincian realisasi dan arsipnya." : `Belum ada perjalanan dinas yang dicatat untuk ${year}.`}</p>
            {hero.unknown > 0 && <p className="beranda-fact-warn">{hero.unknown} rekap belum bernominal.</p>}
          </div>
        ) : <>
          <p className={`beranda-figure${period.known ? "" : " is-empty"}`}>
            {period.known
              ? <><span className="sr-only">{nominal}</span><small aria-hidden="true">Rp</small><span aria-hidden="true"><AnimatedNumber value={period.total} duration={350} /></span></>
              : nominal}
          </p>
          <ul className="beranda-facts" aria-label={`Ringkasan ${periodLabel}`}>
            <li><strong>{period.journeys}</strong> perjalanan</li>
            <li><strong>{period.recaps}</strong> rekap</li>
            <li><strong>{period.people}</strong> pegawai</li>
            {period.unknown > 0 && period.known > 0 && <li className="beranda-fact-warn"><strong>{period.unknown}</strong> rekap belum bernominal</li>}
          </ul>
        </>}
      </div>

      <div className="beranda-monthly" role="group" aria-label={`Realisasi bulanan ${year}`} aria-describedby="beranda-chart-hint">
        <div className="beranda-plot">
          <div className="beranda-chart-axis" aria-hidden="true">
            {[4, 3, 2, 1, 0].map(step => <span key={step}>{shortMoney(chartMaximum * step / 4)}</span>)}
          </div>
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
                  <span className="beranda-month-track" aria-hidden="true" style={{ "--bar-scale": item.total / chartMaximum, "--bar-order": month } as CSSProperties}>
                    {item.total > 0 ? <span className="beranda-month-value">{shortMoney(item.total)}</span> : null}
                    <span className="beranda-month-bar" />
                    {item.total === 0 ? <span className="beranda-month-zero" /> : null}
                  </span>
                  <span className="beranda-month-name" aria-hidden="true">{monthLabels[month]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="beranda-chart-foot">
          <Button type="button" variant="ghost" size="xs" className="beranda-year-reset" aria-pressed={selectedMonth === null}
            onClick={() => { setSelectedMonth(null); setPreviewMonth(null); }}>Setahun</Button>
          <p id="beranda-chart-hint" className="beranda-chart-detail">
            {chartMonth === null
              ? hero.peak ? <>Puncak realisasi <b>{months[hero.peak.month]}</b>, Rp {shortMoney(hero.peak.total)}.</> : "Belum ada realisasi yang tercatat."
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

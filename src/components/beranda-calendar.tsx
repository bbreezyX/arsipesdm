"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { CalendarDay } from "@/lib/beranda";
import { dateText } from "@/lib/model";
import { formatDestinations } from "@/lib/destinations";

const monthShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const dayLabels = ["Sen", "", "Rab", "", "Jum", "", ""];
const DAY = 86_400_000;
const TOOLTIP_TRIPS = 4;

/** 0 = tidak ada; 1 = 1–2; 2 = 3–5; 3 = 6–9; 4 = 10+ pegawai dinas. */
export function calendarLevel(people: number) {
  if (people <= 0) return 0;
  if (people <= 2) return 1;
  if (people <= 5) return 2;
  if (people <= 9) return 3;
  return 4;
}

export const calendarLegend = ["Tidak ada", "1–2", "3–5", "6–9", "10+"];

type Hover = { date: string; x: number; top: number; bottom: number };

export default function BerandaCalendar({ year, days, today, peak, peopleDays }: {
  year: string;
  days: Record<string, CalendarDay>;
  today: string;
  peak: { date: string; people: number } | null;
  peopleDays: number;
}) {
  const start = Date.UTC(Number(year), 0, 1);
  const end = Date.UTC(Number(year), 11, 31);
  // Pekan dimulai Senin, seperti kalender dinas.
  const offset = (new Date(start).getUTCDay() + 6) % 7;
  const cells: { date: string; month: number; day: CalendarDay | undefined; week: number }[] = [];
  for (let time = start, index = offset; time <= end; time += DAY, index++) {
    const date = new Date(time).toISOString().slice(0, 10);
    cells.push({ date, month: new Date(time).getUTCMonth(), day: days[date], week: Math.floor(index / 7) });
  }
  const weeks = cells[cells.length - 1].week + 1;
  const monthStarts = monthShort.map((label, month) => ({
    label, month, week: cells.find(cell => cell.month === month)!.week,
  }));
  const currentMonth = today.startsWith(year) ? Number(today.slice(5, 7)) - 1 : -1;
  const summary = peak
    ? `Kalender dinas ${year}: ${peopleDays} hari-pegawai bertugas, terpadat ${dateText(peak.date)} dengan ${peak.people} pegawai.`
    : `Kalender dinas ${year}: belum ada hari bertugas yang tercatat.`;

  // Di layar sempit kalender bergulir; mulai dari hari ini, bukan Januari.
  const scroller = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: gulir ke hari ini lagi saat tahun atau tanggal berganti
  useEffect(() => {
    const box = scroller.current;
    const cell = box?.querySelector<HTMLElement>("[data-today]");
    if (!box || !cell || box.scrollWidth <= box.clientWidth) return;
    const offsetLeft = cell.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollLeft = Math.max(0, offsetLeft - box.clientWidth * 0.6);
  }, [today, year]);

  // Info melayang: satu elemen, mengikuti sel yang disentuh kursor.
  const [hover, setHover] = useState<Hover | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const showCell = (event: MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-date]");
    if (!cell) { setHover(null); return; }
    const date = cell.dataset.date!;
    if (hover?.date === date) return;
    const rect = cell.getBoundingClientRect();
    setHover({ date, x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
  };
  useLayoutEffect(() => {
    const el = tooltip.current;
    if (!el || !hover) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(Math.max(hover.x - width / 2, margin), window.innerWidth - width - margin);
    const above = hover.top - height - 10 >= margin;
    el.style.left = `${left}px`;
    el.style.top = `${above ? hover.top - height - 10 : hover.bottom + 10}px`;
    el.style.setProperty("--arrow-x", `${hover.x - left}px`);
    el.dataset.placement = above ? "above" : "below";
  }, [hover]);
  useEffect(() => {
    if (!hover) return;
    const hide = () => setHover(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [hover]);

  const hovered = hover ? days[hover.date] : undefined;

  return (
    <div ref={scroller} className="beranda-heatmap" role="img" aria-label={summary} style={{ "--weeks": weeks } as CSSProperties}>
      <div className="beranda-heatmap-months" aria-hidden="true">
        {monthStarts.map(({ label, month, week }) => (
          <span key={month} style={{ gridColumn: week + 1 }} data-current={month === currentMonth || undefined}>{label}</span>
        ))}
      </div>
      <div className="beranda-heatmap-days" aria-hidden="true">
        {dayLabels.map((label, index) => <span key={index}>{label}</span>)}
      </div>
      <div className="beranda-heatmap-grid" aria-hidden="true" onMouseMove={showCell} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: offset }, (_, index) => <span key={`pad-${index}`} className="beranda-heatmap-pad" />)}
        {cells.map(cell => (
          <span
            key={cell.date}
            className="beranda-heatmap-cell"
            data-date={cell.date}
            data-level={calendarLevel(cell.day?.people ?? 0)}
            data-today={cell.date === today || undefined}
            data-future={cell.date > today || undefined}
            data-hover={hover?.date === cell.date || undefined}
            style={{ "--w": cell.week } as CSSProperties}
          />
        ))}
      </div>
      {hover && (
        <div ref={tooltip} className="beranda-heatmap-tip" role="presentation">
          <p className="beranda-heatmap-tip-date">
            {dateText(hover.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          {hovered ? (
            <>
              <p className="beranda-heatmap-tip-sum">
                <b>{hovered.people}</b> pegawai dinas · <b>{hovered.entries.length}</b> perjalanan
                {hovered.trips !== hovered.entries.length ? <> · {hovered.trips} rekap</> : null}
              </p>
              <ul>
                {hovered.entries.slice(0, TOOLTIP_TRIPS).map(entry => (
                  <li key={entry.key}>
                    <span>{entry.title}</span>
                    <small>{entry.number} · {formatDestinations(entry.destinations) || "Tujuan belum dicatat"} · {entry.people} pegawai</small>
                  </li>
                ))}
              </ul>
              {hovered.entries.length > TOOLTIP_TRIPS && (
                <p className="beranda-heatmap-tip-more">+{hovered.entries.length - TOOLTIP_TRIPS} perjalanan lainnya</p>
              )}
            </>
          ) : (
            <p className="beranda-heatmap-tip-sum">{hover.date > today ? "Belum ada perjalanan" : "Tidak ada perjalanan"}</p>
          )}
        </div>
      )}
    </div>
  );
}

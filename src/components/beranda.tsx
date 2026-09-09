"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive, ArrowRight, ArrowUpRight, CheckCircle2, ClipboardList, FileSpreadsheet, FileText, Users, Wallet, Sparkles,
} from "lucide-react";
import { berandaSummary, greeting, relativeTime, type AttentionId } from "@/lib/beranda";
import { shortMoney, type Filters, type Trip, type User } from "@/lib/model";
import type { Employee } from "@/lib/employees";
import type { Honorarium } from "@/lib/honorarium";
import type { Section } from "@/lib/workspace-navigation";
import BerandaCalendar, { calendarLegend } from "./beranda-calendar";
import { AnimatedNumber } from "./animated-number";
import BerandaHero from "./beranda-hero";

const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const jakartaHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" });
const attentionCopy: Record<AttentionId, { title: (year: string) => string; hint: string; section: Section; filters?: Partial<Filters> }> = {
  draft: { title: () => "Rekap belum bernominal", hint: "Lengkapi realisasi biaya di Arsip perjalanan", section: "archives", filters: { status: "incomplete", year: "all" } },
  docs: { title: () => "Dokumen wajib belum terlampir", hint: "Unggah berkas atau catat lokasi fisiknya", section: "documents" },
  unassigned: { title: () => "Perjalanan tanpa nomor surat tugas", hint: "Isi nomor ST agar perjalanan tergabung", section: "archives", filters: { year: "all", status: "all" } },
  trash: { title: () => "Arsip di Sampah", hint: "Pulihkan bila masih diperlukan", section: "trash" },
  honorarium: { title: year => `Honorarium ${year} belum dicatat`, hint: "Buka buku honorarium tahun ini", section: "honorarium" },
};

export default function Beranda({ trips, employees, honorariums, user, demo, initialNow, onGo, onOpen, onAdd, onImport }: {
  trips: Trip[];
  employees: Employee[];
  honorariums: Honorarium[];
  user: User | null;
  demo: boolean;
  initialNow: string;
  onGo: (section: Section, filters?: Partial<Filters>) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  // Server time renders first so hydration matches; the client clock takes over afterwards.
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const update = () => setNow(new Date().toISOString());
    update();
    const interval = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const date = new Date(now);
  const today = jakartaDate.format(date);
  const summary = useMemo(() => berandaSummary({ trips, employees, honorariums, today }), [trips, employees, honorariums, today]);
  const { year, hero, monthlyDetails, calendar, attention, registers, activity } = summary;
  const firstName = (user?.name ?? (demo ? "Operator contoh" : "Operator")).split(",")[0].trim();
  const registerItems: { section: Section; icon: typeof Archive; name: string; figure: ReactNode; unit?: string; detail: string }[] = [
    { section: "archives", icon: Archive, name: "Arsip perjalanan", figure: <AnimatedNumber value={registers.archives.journeys} duration={900} />, unit: "perjalanan",
      detail: `${registers.archives.recaps} rekap tahun ${year}` },
    { section: "taskLetters", icon: FileSpreadsheet, name: "Surat Tugas", figure: <AnimatedNumber value={registers.taskLetters.letters} duration={900} />, unit: "surat",
      detail: registers.taskLetters.letters ? `Tercatat sepanjang ${year}` : "Belum ada surat tugas" },
    { section: "honorarium", icon: Wallet, name: "Honorarium",
      figure: registers.honorarium.records ? <AnimatedNumber value={registers.honorarium.net} format={n => `Rp ${shortMoney(n)}`} /> : "—",
      detail: registers.honorarium.records ? `${registers.honorarium.records} SK · honor neto ${year}` : `Belum dicatat untuk ${year}` },
    { section: "documents", icon: FileText, name: "Dokumen",
      figure: registers.documents.ratio === null ? "—" : <AnimatedNumber value={Math.round(registers.documents.ratio * 100)} format={n => `${n}%`} duration={900} />,
      unit: registers.documents.ratio === null ? undefined : "lengkap",
      detail: registers.documents.ratio === null ? "Belum ada rekap" : `${registers.documents.complete} dari ${registers.documents.total} rekap berdokumen wajib` },
    { section: "people", icon: Users, name: "Pegawai", figure: <AnimatedNumber value={registers.people.active} duration={900} />, unit: "aktif",
      detail: `${registers.people.travelled} bertugas tahun ${year}` },
  ];

  return (
    <div className="beranda">
      <BerandaHero key={year} year={year} hero={hero} monthlyDetails={monthlyDetails} demo={demo}
        greeting={`${greeting(Number(jakartaHour.format(date)))}, ${firstName}.`}
        onArchives={filters => onGo("archives", filters)} onAdd={onAdd} onImport={onImport} />

      <section className="beranda-panel beranda-attention" aria-labelledby="beranda-attention-title">
        <header className="beranda-panel-head">
          <h2 id="beranda-attention-title">Perlu perhatian</h2>
          <span>{attention.length ? `${attention.length} hal` : "Tidak ada"}</span>
        </header>
        {attention.length ? (
          <ul className="beranda-attention-list">
            {attention.map(item => {
              const copy = attentionCopy[item.id];
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => onGo(copy.section, copy.filters)}>
                    <strong className={item.id === "honorarium" ? "is-blank" : undefined}>
                      {item.id === "honorarium" ? <ClipboardList size={18} strokeWidth={1.8} aria-hidden="true" /> : item.count}
                    </strong>
                    <span>
                      <span>{copy.title(year)}</span>
                      <small>{copy.hint}</small>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="beranda-tidy">
            <CheckCircle2 size={26} strokeWidth={1.6} aria-hidden="true" />
            <strong>Arsip rapi</strong>
            <p>Tidak ada rekap, dokumen, atau honorarium yang tertunda.</p>
          </div>
        )}
      </section>

      <nav className="beranda-registers" aria-label="Daftar register">
        {registerItems.map(item => (
          <button key={item.section} type="button" onClick={() => onGo(item.section)}>
            <span className="beranda-register-name"><item.icon size={16} strokeWidth={1.8} aria-hidden="true" />{item.name}</span>
            <span className="beranda-register-figure">{item.figure}{item.unit ? <small>{item.unit}</small> : null}</span>
            <span className="beranda-register-detail">{item.detail}</span>
            <ArrowUpRight size={15} aria-hidden="true" className="beranda-register-arrow" />
          </button>
        ))}
      </nav>

      <section className="beranda-panel beranda-calendar" aria-labelledby="beranda-calendar-title">
        <header className="beranda-panel-head">
          <div>
            <h2 id="beranda-calendar-title">Kalender dinas {year}</h2>
            <p>Setiap kotak satu hari; warna mengikuti jumlah pegawai yang sedang bertugas.</p>
          </div>
          {calendar.peak ? (
            <span className="beranda-calendar-peak">
              Terpadat <b>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(`${calendar.peak.date}T12:00:00`))}</b>, {calendar.peak.people} pegawai
            </span>
          ) : null}
        </header>
        <BerandaCalendar year={year} days={calendar.days} today={today} peak={calendar.peak} peopleDays={calendar.peopleDays} />
        <footer className="beranda-calendar-legend" aria-hidden="true">
          <span>Pegawai dinas per hari</span>
          {calendarLegend.map((label, level) => (
            <span key={label}><i data-level={level} />{label}</span>
          ))}
        </footer>
      </section>

      <section className="beranda-panel beranda-activity" aria-labelledby="beranda-activity-title">
        <header className="beranda-panel-head">
          <h2 id="beranda-activity-title">Aktivitas terbaru</h2>
          <span>{activity.length ? `${activity.length} terakhir` : ""}</span>
        </header>
        {activity.length ? (
          <ol className="beranda-activity-list">
            {activity.map(item => (
              <li key={`${item.tripId}-${item.id}`}>
                <button type="button" onClick={() => onOpen(item.tripId)}>
                  <span className="beranda-activity-actor" aria-hidden="true">{item.actor.slice(0, 2).toUpperCase()}</span>
                  <span className="beranda-activity-body">
                    <span><b>{item.actor}</b> · {item.action}</span>
                    <small>{item.code} · {item.title}</small>
                  </span>
                  <time dateTime={item.at}>{relativeTime(item.at, now)}</time>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="beranda-tidy">
            <Sparkles size={24} strokeWidth={1.6} aria-hidden="true" />
            <strong>Belum ada aktivitas</strong>
            <p>Perubahan arsip oleh setiap operator akan tercatat di sini.</p>
          </div>
        )}
      </section>
    </div>
  );
}

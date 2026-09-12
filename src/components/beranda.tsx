"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive, ArrowRight, ArrowUpRight, CheckCircle2, ClipboardList, FileSpreadsheet, FileText, Users, Wallet,
} from "lucide-react";
import { berandaSummary, greeting, type AttentionId } from "@/lib/beranda";
import { money, shortMoney, type Filters, type Trip, type User } from "@/lib/model";
import type { Employee } from "@/lib/employees";
import type { Honorarium } from "@/lib/honorarium";
import type { Section } from "@/lib/workspace-navigation";
import { can, canAccessSection } from "@/lib/permissions";
import BerandaCalendar, { calendarLegend } from "./beranda-calendar";
import BerandaActivity from "./beranda-activity";
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

const entryWeekday = new Intl.DateTimeFormat("id-ID", { weekday: "long" });
const entryMonthYear = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" });
const entryFull = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
function entryDate(day: string) {
  return new Date(`${day}T12:00:00`);
}

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
  const accessUser = user ?? (demo ? { role: "operator" as const } : null);
  const editable = can(accessUser, "archives:write");
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
  const { year, hero, monthlyDetails, calendar, registers, activity, latest: entries } = summary;
  const attention = summary.attention.filter(item => canAccessSection(accessUser, attentionCopy[item.id].section));
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
    <div className="beranda" data-readonly={!editable || undefined}>
      <BerandaHero key={year} year={year} hero={hero} monthlyDetails={monthlyDetails} demo={demo}
        greeting={`${greeting(Number(jakartaHour.format(date)))}, ${firstName}.`}
        onArchives={filters => onGo("archives", filters)} onAdd={onAdd} onImport={onImport} editable={editable} />

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
                      <small>{editable ? copy.hint : "Lihat rekap terkait di Arsip perjalanan"}</small>
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
            <p>{editable ? "Tidak ada rekap, dokumen, atau honorarium yang tertunda." : "Rekap perjalanan sudah bernominal dan memiliki nomor Surat Tugas."}</p>
          </div>
        )}
      </section>

      <nav className="beranda-registers" aria-label="Daftar register">
        <div className="beranda-registers-head" aria-hidden="true">
          <span>Daftar register</span>
          <span className="beranda-register-amount">Jumlah {year}</span>
        </div>
        {registerItems.filter(item => canAccessSection(accessUser, item.section)).map(item => (
          <button key={item.section} type="button" onClick={() => onGo(item.section)}>
            <item.icon size={16} strokeWidth={1.8} aria-hidden="true" className="beranda-register-icon" />
            <span className="beranda-register-name">{item.name}</span>
            <span className="beranda-register-detail">{item.detail}</span>
            <span className="beranda-register-amount">
              <span className="beranda-register-figure">{item.figure}{item.unit ? <small>{item.unit}</small> : null}</span>
              <ArrowUpRight size={15} aria-hidden="true" className="beranda-register-arrow" />
            </span>
          </button>
        ))}
      </nav>

      <section className="beranda-panel beranda-entries" aria-labelledby="beranda-entries-title">
        <header className="beranda-panel-head">
          <div>
            <h2 id="beranda-entries-title">Pencatatan terakhir</h2>
            <p>{entries.day ? "Semua rekap yang dicatat pada hari kerja terakhir, menurut tanggal WIB." : "Rekap yang dicatat akan muncul di sini menurut tanggal WIB."}</p>
          </div>
          <span>{entries.recaps + entries.honorariums} rekap</span>
        </header>
        <div className="beranda-entry-day">
          {/* Lembar agenda: tanggal pencatatan sebagai anak judul bagian ini. */}
          <div className="beranda-entry-leaf" data-today={entries.isToday || undefined}
            aria-label={entries.day ? (entries.isToday ? "Hari ini" : entryFull.format(entryDate(entries.day))) : "Belum ada pencatatan"}>
            <span className="beranda-entry-leaf-top">{entries.day ? (entries.isToday ? "Hari ini" : entryWeekday.format(entryDate(entries.day))) : "Belum ada"}</span>
            <strong>{entries.day ? Number(entries.day.slice(8, 10)) : "—"}</strong>
            <span className="beranda-entry-leaf-month">{entries.day ? entryMonthYear.format(entryDate(entries.day)) : "pencatatan"}</span>
          </div>
          <div className="beranda-entry-links">
            <button type="button" onClick={() => onGo("archives", { year: "all", entry: entries.filter })}>
              <span className="beranda-entry-name">Arsip perjalanan
                <small>{entries.recaps ? `${entries.recaps} rekap dari ${entries.journeys} perjalanan` : "Tidak ada rekap perjalanan"}</small></span>
              <span className="beranda-entry-total">{entries.recaps && entries.unknown === entries.recaps ? "Belum bernominal" : money(entries.total)}
                {entries.unknown > 0 && entries.unknown !== entries.recaps && <small>{entries.unknown} rekap belum bernominal</small>}</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            {can(accessUser, "honorariums:read") && <button type="button" onClick={() => onGo("honorarium", { entry: entries.filter })}>
              <span className="beranda-entry-name">Honorarium
                <small>{entries.honorariums ? `${entries.honorariums} rekap` : "Tidak ada rekap honorarium"}</small></span>
              <span className="beranda-entry-total">{money(entries.honorariumNet)}<small>honor neto</small></span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>}
          </div>
        </div>
      </section>

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

      {editable && <section className="beranda-panel beranda-activity" aria-labelledby="beranda-activity-title">
        <header className="beranda-panel-head">
          <div>
            <h2 id="beranda-activity-title">Aktivitas terbaru</h2>
            {activity.length ? <p>Buku agenda perubahan arsip, waktu WIB.</p> : null}
          </div>
          <span>{activity.length ? `${activity.length} catatan` : ""}</span>
        </header>
        <BerandaActivity activity={activity} today={today} onOpen={onOpen} />
      </section>}
    </div>
  );
}

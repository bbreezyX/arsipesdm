"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ClipboardList, FileCheck2, FileSpreadsheet, Plus, Upload, Users, Wallet,
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
import { Button } from "./ui/button";

const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const jakartaHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" });
const attentionCopy: Record<AttentionId, { title: (year: string) => string; hint: string; section: Section; filters?: Partial<Filters> }> = {
  draft: { title: () => "Rekap belum bernominal", hint: "Lengkapi realisasi biaya di Arsip perjalanan", section: "archives", filters: { status: "incomplete", year: "all" } },
  docs: { title: () => "Dokumen wajib belum terlampir", hint: "Unggah berkas atau catat lokasi fisiknya", section: "documents" },
  unassigned: { title: () => "Perjalanan tanpa nomor surat tugas", hint: "Isi nomor ST agar perjalanan tergabung", section: "archives", filters: { year: "all", status: "all" } },
  trash: { title: () => "Arsip di Sampah", hint: "Pulihkan bila masih diperlukan", section: "trash" },
  honorarium: { title: year => `Honorarium ${year} belum dicatat`, hint: "Buka buku honorarium tahun ini", section: "honorarium" },
};

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
  ];
  const documentPercent = registers.documents.ratio === null ? null : Math.round(registers.documents.ratio * 100);

  return (
    <div className="beranda" data-readonly={!editable || undefined}>
      <header className="beranda-heading">
        <div>
          <h1>{greeting(Number(jakartaHour.format(date)))}, {firstName}!</h1>
          <p>{demo ? "Ruang contoh · data fiktif" : "Dinas Energi dan Sumber Daya Mineral Provinsi Jambi"}</p>
        </div>
        <div className="beranda-heading-actions">
          <span className="beranda-year-label"><CalendarDays size={15} aria-hidden="true" /> Tahun {year}</span>
          {editable ? <>
            <Button variant="outline" className="beranda-import" onClick={onImport}><Upload data-icon="inline-start" /> Impor Excel</Button>
            <Button className="beranda-add" onClick={onAdd}><Plus data-icon="inline-start" /> Tambah arsip</Button>
          </> : <span className="beranda-reader-note">Akses Pembaca</span>}
        </div>
      </header>

      <nav className="beranda-overview" aria-label={`Ringkasan arsip ${year}`}>
        <button type="button" className="beranda-stat beranda-stat-total" onClick={() => onGo("archives", { year })}>
          <span className="beranda-stat-label">Total realisasi <ArrowUpRight size={15} aria-hidden="true" /></span>
          <strong className="beranda-stat-value" data-empty={!hero.known || undefined}>
            {hero.known ? <><small>Rp</small> <AnimatedNumber value={hero.total} duration={700} /></> : hero.recaps ? "Belum bernominal" : "Belum ada arsip"}
          </strong>
          <span className="beranda-stat-detail">Perjalanan dinas sepanjang {year}</span>
        </button>
        {registerItems.filter(item => canAccessSection(accessUser, item.section)).map(item => (
          <button key={item.section} type="button" className="beranda-stat" onClick={() => onGo(item.section)}>
            <span className="beranda-stat-label">{item.name}<item.icon size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <strong className="beranda-stat-value">{item.figure}{item.unit && <small>{item.unit}</small>}</strong>
            <span className="beranda-stat-detail">{item.detail}<ArrowUpRight size={13} aria-hidden="true" /></span>
          </button>
        ))}
      </nav>

      <div className="beranda-board">
        <BerandaHero key={year} year={year} hero={hero} monthlyDetails={monthlyDetails}
          onArchives={filters => onGo("archives", filters)} />

        {canAccessSection(accessUser, "documents") && <section className="beranda-panel beranda-documents" aria-labelledby="beranda-documents-title">
          <header className="beranda-panel-head">
            <h2 id="beranda-documents-title">Kelengkapan dokumen</h2>
            <button type="button" className="beranda-icon-link" aria-label="Buka dokumen" onClick={() => onGo("documents")}><ArrowUpRight size={16} /></button>
          </header>
          <div className="beranda-document-inner">
            <div className="beranda-document-caption">
              <span className="beranda-document-icon"><FileCheck2 size={21} strokeWidth={1.6} aria-hidden="true" /></span>
              <div><strong>Dokumen perjalanan</strong><span>Berkas wajib tahun {year}</span></div>
            </div>
            <div className="beranda-document-gauge" role="img" aria-label={documentPercent === null ? "Belum ada rekap dokumen" : `${documentPercent}% lengkap, ${registers.documents.complete} dari ${registers.documents.total} rekap`}>
              <svg viewBox="0 0 200 174" aria-hidden="true">
                <circle className="beranda-gauge-inner" cx="100" cy="90" r="61" />
                <circle className="beranda-gauge-track" cx="100" cy="90" r="76" pathLength="100" strokeDasharray="76 24" transform="rotate(133.2 100 90)" />
                <circle className="beranda-gauge-fill" cx="100" cy="90" r="76" pathLength="100" strokeDasharray={`${(documentPercent ?? 0) * .76} 100`} transform="rotate(133.2 100 90)" />
              </svg>
              <div><span>Dokumen lengkap</span><strong>{documentPercent === null ? "—" : `${documentPercent}%`}</strong><small>{registers.documents.complete} dari {registers.documents.total} rekap</small></div>
            </div>
            <div className="beranda-document-counts">
              <div><strong>{registers.documents.complete}</strong><span>Sudah lengkap</span></div>
              <div><strong>{registers.documents.total - registers.documents.complete}</strong><span>Belum lengkap</span></div>
            </div>
          </div>
          {canAccessSection(accessUser, "people") && <button type="button" className="beranda-people-link" onClick={() => onGo("people")}>
            <Users size={17} aria-hidden="true" /><span><strong>{registers.people.active} pegawai aktif</strong><small>{registers.people.travelled} bertugas tahun {year}</small></span><ArrowUpRight size={15} aria-hidden="true" />
          </button>}
        </section>}

        <section className="beranda-panel beranda-entries" aria-labelledby="beranda-entries-title">
          <header className="beranda-panel-head">
            <h2 id="beranda-entries-title">Pencatatan terakhir</h2>
            <span className="beranda-count">{entries.recaps + entries.honorariums} rekap</span>
          </header>
          <div className="beranda-entry-date"><CalendarDays size={14} aria-hidden="true" />{entries.day ? `${entries.isToday ? "Hari ini · " : ""}${entryFull.format(entryDate(entries.day))}` : "Belum ada pencatatan"}<span>WIB</span></div>
          <div className="beranda-entry-day">
            <div className="beranda-entry-columns" aria-hidden="true"><span>Register</span><span>Realisasi</span></div>
            <div className="beranda-entry-links">
              <button type="button" onClick={() => onGo("archives", { year: "all", entry: entries.filter })}>
                <span className="beranda-entry-icon"><Archive size={17} strokeWidth={1.7} aria-hidden="true" /></span>
                <span className="beranda-entry-name">Arsip perjalanan
                  <small>{entries.recaps ? `${entries.recaps} rekap dari ${entries.journeys} perjalanan` : "Tidak ada rekap perjalanan"}</small></span>
                <span className="beranda-entry-total">{entries.recaps && entries.unknown === entries.recaps ? "Belum bernominal" : money(entries.total)}
                  {entries.unknown > 0 && entries.unknown !== entries.recaps && <small>{entries.unknown} rekap belum bernominal</small>}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
              {can(accessUser, "honorariums:read") && <button type="button" onClick={() => onGo("honorarium", { entry: entries.filter })}>
                <span className="beranda-entry-icon is-honorarium"><Wallet size={17} strokeWidth={1.7} aria-hidden="true" /></span>
                <span className="beranda-entry-name">Honorarium
                  <small>{entries.honorariums ? `${entries.honorariums} rekap` : "Tidak ada rekap honorarium"}</small></span>
                <span className="beranda-entry-total">{money(entries.honorariumNet)}<small>honor neto</small></span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>}
            </div>
          </div>
        </section>

        <section className="beranda-panel beranda-attention" aria-labelledby="beranda-attention-title">
          <header className="beranda-panel-head">
            <h2 id="beranda-attention-title">Perlu perhatian</h2>
            <span className="beranda-count">{attention.length ? `${attention.length} hal` : "Semua beres"}</span>
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
              <span className="beranda-tidy-icon"><CheckCircle2 size={23} strokeWidth={1.6} aria-hidden="true" /></span>
              <strong>Arsip rapi</strong>
              <p>{editable ? "Tidak ada rekap, dokumen, atau honorarium yang tertunda." : "Rekap perjalanan sudah bernominal dan memiliki nomor Surat Tugas."}</p>
            </div>
          )}
        </section>

        <section className="beranda-panel beranda-calendar" aria-labelledby="beranda-calendar-title">
          <header className="beranda-panel-head">
            <div>
              <h2 id="beranda-calendar-title">Kalender dinas {year}</h2>
              <p>Sebaran pegawai yang bertugas sepanjang tahun.</p>
            </div>
            {calendar.peak ? (
              <span className="beranda-calendar-peak">
                <span>Pegawai dinas terbanyak</span>
                <span><b>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(`${calendar.peak.date}T12:00:00`))}</b> · {calendar.peak.people} orang</span>
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
              {activity.length ? <p>Perubahan arsip terakhir · WIB</p> : null}
            </div>
            <span>{activity.length ? `${activity.length} catatan` : ""}</span>
          </header>
          <BerandaActivity activity={activity} today={today} onOpen={onOpen} />
        </section>}
      </div>
    </div>
  );
}

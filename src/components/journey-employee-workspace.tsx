"use client";

import TravelScopeFields from "./travel-scope-fields";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, Check, Search, Users, X } from "lucide-react";
import type { BatchRow, SharedJourney } from "@/lib/batch-recap";
import { formatDestinations, tripDestinations } from "@/lib/destinations";
import { automaticDailyAllowance } from "@/lib/daily-allowance";
import { journeyDifferences, recapSectionStates, variedCostFields } from "@/lib/recap-visual-state";
import { RecapStatus } from "./recap-status";
import { money } from "@/lib/model";
import type { Employee } from "@/lib/employees";
import type { TripSuggestions } from "@/lib/trip-suggestions";
import ArchiveDateInput from "./archive-date-input";
import DestinationFields from "./destination-fields";
import { Field } from "./fields";
import { NumberField } from "./lampiran6-form";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";
import { CustomSelect, SelectOption } from "./ui/select";

export type JourneyIssue = { section: "letter" | "schedule" | "route" | "people"; field?: keyof SharedJourney; message: string };
const journeySections = [["letter", "Surat & kegiatan"], ["schedule", "Jadwal"], ["route", "Rute"]] as const;

export default function JourneyEmployeeWorkspace({ shared, rows, people, suggestions, onJourneyChange, onSelect, issue, headerSlot }: {
  shared: SharedJourney;
  rows: BatchRow[];
  people: Employee[];
  suggestions: TripSuggestions;
  onJourneyChange: (patch: Partial<SharedJourney>) => void;
  onSelect: (keys: Set<string>, checked: boolean) => void;
  issue?: JourneyIssue;
  /** Dialog header area that shows the shared-journey title and section shortcuts. */
  headerSlot?: HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState("all");
  const [onlySelected, setOnlySelected] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"journey" | "people">("journey");
  const [focusTarget, setFocusTarget] = useState<Pick<JourneyIssue, "section" | "field">>();
  const root = useRef<HTMLDivElement>(null);
  const selected = rows.filter(row => row.selected);
  const varied = variedCostFields(rows);
  const rowSignals = new Map(rows.map(row => {
    const costs = recapSectionStates(row.input.lampiran6!);
    return [row.key, { differences: journeyDifferences(row.input, shared), details: costs.hotel.count + costs.vehicle.count + costs.flight.count + costs.additional.count,
      varied: [...varied].filter(field => row.input.lampiran6![field] !== null).length,
      pending: [costs.hotel, costs.vehicle, costs.flight, costs.additional].some(item => item.tone === "different"), amounts: costs.main.count }];
  }));
  const adjusted = selected.filter(row => rowSignals.get(row.key)!.differences.length > 0).length;
  const sectionFilled = { letter: shared.title.trim().length > 0, schedule: Boolean(shared.startDate && shared.endDate), route: tripDestinations(shared).every(value => value.trim().length > 0) };
  const selectedKeys = new Set(selected.map(row => row.key));
  const activePeople = people.filter(person => !person.deletedAt);
  const knownKeys = new Set(activePeople.map(person => person.id));
  const options = [
    ...activePeople.map(person => ({ key: person.id, name: person.name, nip: person.nip, position: person.position, department: person.department, rank: person.rank, manual: false })),
    ...rows.filter(row => !knownKeys.has(row.key)).map(row => ({ key: row.key, ...row.input.participants[0], department: row.input.department, rank: row.input.lampiran6?.rank ?? "", manual: true })),
  ];
  const search = query.trim().toLocaleLowerCase("id-ID");
  const shown = options.filter(person => (unit === "all" || person.department === unit)
    && (!onlySelected || selectedKeys.has(person.key))
    && [person.name, person.nip, person.position, person.rank, person.department].join(" ").toLocaleLowerCase("id-ID").includes(search));
  const shownKeys = new Set(shown.map(person => person.key));
  const hiddenSelected = selected.filter(row => !shownKeys.has(row.key)).length;
  const selectedShown = shown.filter(person => selectedKeys.has(person.key)).length;
  const calendarDays = Math.round((Date.parse(shared.endDate) - Date.parse(shared.startDate)) / 86400000) + 1;
  const validDuration = Number.isFinite(calendarDays) && calendarDays > 0 && calendarDays <= 3660;
  const durationDiffers = validDuration && shared.claimedDays !== null && shared.claimedDays !== calendarDays;
  const daily = automaticDailyAllowance(shared, tripDestinations(shared));
  const differentDailyModes = selected.filter(row => row.input.lampiran6?.dailyRateMode !== shared.dailyRateMode).length;

  const focusSection = useCallback((section: JourneyIssue["section"], field?: keyof SharedJourney) => {
    const target = root.current?.querySelector<HTMLElement>(`[data-journey-section="${section}"]`);
    const scroll = target?.closest<HTMLElement>(".journey-entry-scroll");
    if (scroll && target) scroll.scrollTop += target.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    const selectors: Partial<Record<keyof SharedJourney, string>> = {
      destinationProvince: '[aria-label="Provinsi tujuan"]', format: '[aria-label="Cakupan perjalanan"]',
      title: "textarea", sptNo: '[aria-label="Nomor ST / SPT"]', claimedDays: 'input[type="number"]',
      origin: '[aria-label="Asal"]', destination: ".destination-fields input", destinations: ".destination-fields input",
    };
    const input = field === "startDate" || field === "endDate"
      ? target?.querySelectorAll<HTMLInputElement>('input[type="date"]')[field === "endDate" ? 1 : 0]
      : target?.querySelector<HTMLElement>((field && selectors[field]) || "input, textarea");
    input?.focus({ preventScroll: true });
    if (scroll && input) {
      const bounds = scroll.getBoundingClientRect();
      const fieldBounds = input.getBoundingClientRect();
      if (fieldBounds.bottom > bounds.bottom) scroll.scrollTop += fieldBounds.bottom - bounds.bottom + 12;
    }
  }, []);
  function jump(section: JourneyIssue["section"]) {
    setMobilePanel(section === "people" ? "people" : "journey");
    setFocusTarget({ section });
  }
  useEffect(() => {
    if (!issue) return;
    setMobilePanel(issue.section === "people" ? "people" : "journey");
    setFocusTarget(issue);
  }, [issue]);
  useEffect(() => {
    if (!focusTarget) return;
    focusSection(focusTarget.section, focusTarget.field);
    setFocusTarget(undefined);
  }, [focusTarget, focusSection]);

  function inlineIssue(section: JourneyIssue["section"]) {
    return issue?.section === section ? <p className="journey-inline-error">{issue.message}</p> : null;
  }

  const filledCount = journeySections.filter(([section]) => sectionFilled[section]).length;
  const sectionStatus = (section: (typeof journeySections)[number][0]) =>
    issue?.section === section ? "error" : sectionFilled[section] ? "filled" : "pending";
  const statusLabel = { filled: "terisi", pending: "belum diisi", error: "perlu diperbaiki" } as const;
  const sharedHeader = <header className={`journey-panel-heading journey-panel-heading-shared${headerSlot ? " is-in-dialog-header" : ""}`}>
    <div className="journey-panel-heading-text">
      <h3>
        Perjalanan bersama
        <span className="journey-fill-count"><span aria-hidden="true">{filledCount}/{journeySections.length} terisi</span><span className="sr-only">{filledCount} dari {journeySections.length} bagian terisi</span></span>
      </h3>
      <p>Berlaku untuk semua pegawai yang dipilih. Kolom bertanda * wajib diisi.</p>
      {adjusted > 0 && <RecapStatus tone="different" description="Sebagian isian pegawai berbeda dari perjalanan bersama.">{adjusted} pegawai memiliki penyesuaian</RecapStatus>}
    </div>
    <nav className="journey-section-nav" aria-label="Lompat ke isian perjalanan">
      {journeySections.map(([section, label]) => {
        const state = sectionStatus(section);
        return <button type="button" key={section} data-state={state} onClick={() => jump(section)}>
          <i aria-hidden="true">{state === "filled" && <Check size={10} strokeWidth={3} />}</i>
          {label}
          <span className="sr-only">, {statusLabel[state]}</span>
        </button>;
      })}
    </nav>
  </header>;

  return <div ref={root} className="journey-employee-workspace" data-mobile-panel={mobilePanel}>
    {headerSlot ? createPortal(sharedHeader, headerSlot) : null}
    <div className="journey-mobile-switch" role="group" aria-label="Bagian perjalanan dan pegawai">
      <button type="button" aria-pressed={mobilePanel === "journey"} onClick={() => setMobilePanel("journey")}>Data perjalanan</button>
      <button type="button" aria-pressed={mobilePanel === "people"} onClick={() => setMobilePanel("people")}>Pegawai <span>{selected.length}</span></button>
    </div>

    <section className="shared-journey-editor" aria-label="Data perjalanan bersama">
      {!headerSlot && sharedHeader}
      <div className="journey-entry-scroll">
        <section className="journey-entry-section" data-journey-section="letter" data-error={issue?.section === "letter" || undefined}>
          <h4><span>01</span>Surat & kegiatan</h4>
          <div className="journey-input-stack">
            <Field className={shared.sptNo.trim() ? "recap-field-entered" : ""} label="Nomor ST / SPT" hint="Nomor surat tugas yang digunakan bersama."><Combobox aria-label="Nomor ST / SPT" value={shared.sptNo} maxLength={250} options={suggestions.letters} onValueChange={sptNo => onJourneyChange({ sptNo })} placeholder="Pilih atau ketik nomor ST" /></Field>
            <Field className={shared.title.trim() ? "recap-field-entered" : ""} label="Nama kegiatan / maksud perjalanan" required><Combobox multiline rows={3} aria-label="Nama kegiatan / maksud perjalanan" value={shared.title} maxLength={3000} options={suggestions.purposes} onValueChange={title => onJourneyChange({ title })} placeholder="Contoh: Monitoring pelaksanaan kegiatan di Kabupaten Kerinci" /></Field>
          </div>
          {inlineIssue("letter")}
        </section>
        <section className="journey-entry-section" data-journey-section="schedule" data-error={issue?.section === "schedule" || undefined}>
          <h4><span>02</span>Jadwal & jumlah hari</h4>
          <div className="form-grid journey-date-grid">
            <Field className={shared.startDate.trim() ? "recap-field-entered" : ""} label="Tanggal berangkat" required><ArchiveDateInput value={shared.startDate} onChange={startDate => onJourneyChange({ startDate, endDate: startDate && (!shared.endDate || shared.endDate < startDate) ? startDate : shared.endDate })} /></Field>
            <Field className={shared.endDate.trim() ? "recap-field-entered" : ""} label="Tanggal kembali" required><ArchiveDateInput value={shared.endDate} onChange={endDate => onJourneyChange({ endDate })} /></Field>
          </div>
          <div className="journey-duration-row">
            <NumberField className={shared.claimedDays !== null ? "recap-field-entered" : ""} label="Jumlah hari pada rekap" value={shared.claimedDays} onChange={claimedDays => onJourneyChange({ claimedDays })} />
            <div className="journey-duration-help">
              <span><CalendarDays size={14} />{validDuration ? `${calendarDays} hari kalender` : "Isi kedua tanggal untuk menghitung hari."}</span>
              {validDuration && <small>Termasuk hari berangkat dan kembali.</small>}
              {validDuration && shared.claimedDays !== calendarDays && <button type="button" onClick={() => onJourneyChange({ claimedDays: calendarDays })}>Gunakan {calendarDays} hari</button>}
              {validDuration && shared.claimedDays === calendarDays && <small className="journey-duration-match"><Check size={12} />Sesuai rentang tanggal</small>}
            </div>
          </div>
          <p className={durationDiffers ? "journey-duration-notice" : "field-hint"}>{durationDiffers ? `Rekap menggunakan ${shared.claimedDays} hari. Pastikan perbedaan dengan ${calendarDays} hari kalender sesuai dokumen sumber.` : "Jumlah hari pada rekap menjadi dasar perhitungan uang harian."}</p>
          {inlineIssue("schedule")}
        </section>
        <section className="journey-entry-section" data-journey-section="route" data-error={issue?.section === "route" || undefined}>
          <h4><span>03</span>Rute perjalanan</h4>
          <TravelScopeFields value={shared} onChange={onJourneyChange} />
          <div className="journey-input-stack">
            <Field className={shared.origin.trim() ? "recap-field-entered" : ""} label="Asal"><Combobox aria-label="Asal" value={shared.origin} maxLength={1000} options={suggestions.origins} onValueChange={origin => onJourneyChange({ origin })} placeholder="Pilih atau ketik daerah asal" /></Field>
            <DestinationFields highlightFilled values={tripDestinations(shared)} options={suggestions.destinations} onChange={destinations => onJourneyChange({ destinations, destination: formatDestinations(destinations) })} />
          </div>
          {inlineIssue("route")}
          <div className="journey-daily-allowance">
            <Field label="Kategori uang harian" hint="Kategori ini diterapkan ke semua pegawai. Pilih durasi sesuai pelaksanaan perjalanan.">
              <CustomSelect aria-label="Kategori uang harian bersama" value={shared.dailyRateMode ?? "auto"} onValueChange={dailyRateMode => onJourneyChange({ dailyRateMode: dailyRateMode as SharedJourney["dailyRateMode"] })}>
                <SelectOption value="auto">Otomatis berdasarkan asal dan tujuan</SelectOption>
                <SelectOption value="dalam-kota">Dalam kota lebih dari 8 jam</SelectOption>
                <SelectOption value="dalam-kota-singkat">Dalam kota sampai 8 jam · uang harian nihil</SelectOption>
                <SelectOption value="diklat">Diklat</SelectOption>
                <SelectOption value="manual">Manual sesuai arsip</SelectOption>
              </CustomSelect>
            </Field>
            <div className="journey-daily-result" role="status">
              <strong>{shared.dailyRateMode === "manual" ? "Total diisi pada biaya per pegawai" : daily.rate === null ? "Uang harian belum dapat dihitung" : shared.claimedDays === null ? `Tarif ${money(daily.rate)} per hari · lengkapi jumlah hari` : `${money(daily.rate)} × ${shared.claimedDays} hari = ${money(daily.rate * shared.claimedDays)} per pegawai`}</strong>
              {daily.reason && <p>{daily.reason}</p>}
              {differentDailyModes > 0 && <p>{differentDailyModes} pegawai memakai kategori berbeda. Periksa pada tahap Biaya per pegawai, atau ubah kategori bersama untuk menyamakannya.</p>}
            </div>
            <p className="field-hint">Acuan regional <a href="https://peraturan.bpk.go.id/Details/321610/perpres-no-72-tahun-2025" target="_blank" rel="noreferrer">Perpres 72/2025, Lampiran I</a>. Sesuaikan dengan ketentuan instansi melalui mode manual.</p>
          </div>
        </section>
        <details className="journey-budget-fields">
          <summary><span>Program & anggaran</span><small>Opsional</small></summary>
          <p className="field-hint">Lengkapi jika tercantum pada dokumen perjalanan.</p>
          <div className="journey-input-stack">{([["program", "Nama program"], ["activityName", "Nama kegiatan anggaran"], ["subActivity", "Nama subkegiatan"]] as const).map(([key, label]) => <Field key={key} label={label} className={shared[key].trim() ? "recap-field-entered" : ""}><input maxLength={1000} value={shared[key]} onChange={event => onJourneyChange({ [key]: event.target.value })} /></Field>)}</div>
        </details>
        <p className="journey-personal-note">SPPD dan biaya diisi per pegawai pada tahap berikutnya. Jika perjalanan seseorang berbeda, sesuaikan melalui Identitas & arsip.</p>
        <Button type="button" variant="outline" className="journey-mobile-next" onClick={() => jump("people")}>Pilih pegawai<ArrowRight size={15} /></Button>
      </div>
    </section>

    <section className="journey-people-picker" aria-label="Pilih pegawai perjalanan" data-journey-section="people">
      <header className="journey-panel-heading">
        <div><h3>Pilih pegawai</h3><span className="batch-selection-count" role="status">{selected.length} dipilih</span></div>
        <p>Pilih peserta dalam surat tugas ini. Satu rekap untuk setiap pegawai.</p>
      </header>
      <div className="journey-people-filters">
        <label className="journey-people-search"><span className="sr-only">Cari pegawai</span><Search size={15} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Cari nama, NIP, atau jabatan…" />{query && <button type="button" aria-label="Hapus pencarian pegawai" onClick={() => setQuery("")}><X size={14} /></button>}</label>
        <Field label="Filter bidang"><CustomSelect value={unit} onValueChange={setUnit}><SelectOption value="all">Semua bidang</SelectOption>{[...new Set(options.map(person => person.department))].filter(Boolean).map(department => <SelectOption key={department}>{department}</SelectOption>)}</CustomSelect></Field>
        <div className="journey-people-view" role="group" aria-label="Tampilan daftar pegawai">
          <button type="button" aria-pressed={!onlySelected} onClick={() => setOnlySelected(false)}>Semua pegawai <span>{options.length}</span></button>
          <button type="button" aria-pressed={onlySelected} onClick={() => setOnlySelected(true)}>Terpilih <span>{selected.length}</span></button>
        </div>
      </div>
      <div className="journey-selection-toolbar">
        <label><input type="checkbox" disabled={!shown.length} checked={shown.length > 0 && selectedShown === shown.length} ref={node => { if (node) node.indeterminate = selectedShown > 0 && selectedShown < shown.length; }} onChange={event => onSelect(shownKeys, event.currentTarget.checked)} />Pilih semua hasil</label>
        <span>{shown.length} pegawai</span>
      </div>
      {inlineIssue("people")}
      <div className="journey-people-list" role="group" aria-label="Daftar pegawai">
        {shown.map(person => { const signal = rowSignals.get(person.key); return <label className="journey-person-option" key={person.key} data-recap-tone={signal?.differences.length || signal?.pending || signal?.varied ? "different" : signal?.details ? "details" : signal?.amounts ? "filled" : "empty"}>
          <input type="checkbox" checked={selectedKeys.has(person.key)} onChange={event => onSelect(new Set([person.key]), event.currentTarget.checked)} />
          <span><strong>{person.name}</strong><small>{person.position || person.rank || "Jabatan belum dicatat"}</small><small>{person.department || "Bidang belum dicatat"}{person.nip ? ` · NIP ${person.nip}` : ""}</small>{person.manual && <em>Isian dari mode satu pegawai</em>}
          {signal && <span className="recap-row-flags">
            {signal.details > 0 && <RecapStatus tone={signal.pending ? "different" : "details"}>{signal.details} rincian{signal.pending ? " · periksa total" : ""}</RecapStatus>}
            {signal.varied > 0 && !signal.differences.length && <RecapStatus tone="different">{signal.varied} nominal bervariasi</RecapStatus>}
            {signal.differences.length > 0 && <RecapStatus tone="different" description={`Berbeda: ${signal.differences.join(", ")}`}>{signal.differences.length} penyesuaian</RecapStatus>}
            {signal.amounts > 0 && !signal.details && !signal.differences.length && !signal.varied && <RecapStatus tone="filled">{signal.amounts} nominal dicatat</RecapStatus>}
          </span>}</span>
        </label>; })}
        {!shown.length && <div className="journey-people-empty"><Users size={22} /><strong>{onlySelected && !selected.length ? "Belum ada pegawai dipilih" : options.length ? "Pegawai tidak ditemukan" : "Belum ada data pegawai"}</strong><p>{!options.length ? "Tambahkan melalui menu Pegawai, atau isi nama di mode Satu pegawai." : onlySelected && !selected.length ? "Buka Semua pegawai untuk memilih peserta perjalanan." : "Coba nama, NIP, jabatan, atau bidang lain."}</p>{options.length > 0 && <button type="button" onClick={() => { setQuery(""); setUnit("all"); setOnlySelected(false); }}>Tampilkan semua pegawai</button>}</div>}
      </div>
      <div className="journey-selection-summary" aria-live="polite">
        {selected.length ? <><strong>{selected.length} pegawai akan dibuatkan rekap</strong><span>{hiddenSelected ? `${hiddenSelected} pilihan berada di luar hasil pencarian dan tetap disertakan.` : "Buka Terpilih untuk memeriksa atau mengurangi peserta."}</span></> : <><strong>Pilih minimal satu pegawai</strong><span>Anda bisa mencari dan memilih dari beberapa bidang.</span></>}
      </div>
    </section>
  </div>;
}

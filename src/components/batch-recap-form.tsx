"use client";
import { OnboardingHint } from "./onboarding";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { tripDestinations } from "@/lib/destinations";
import {
  batchCostColumns, batchRecapSchema, isBatchEmpty, newBatchRow, prepareRecap,
  sharedJourney, updateSharedJourney,
  type BatchRecapState, type SharedJourney,
} from "@/lib/batch-recap";
import { lampiranReview } from "@/lib/lampiran6-schema";
import { dateText, money, totalCost, type Trip, type TripInput } from "@/lib/model";
import { fundTrackLabels, resolveFundTrack } from "@/lib/fund-track";
import type { Employee } from "@/lib/employees";
import type { TripSuggestions } from "@/lib/trip-suggestions";
import { reportSessionResponse } from "@/lib/session-client";
import BatchCostGrid from "./batch-cost-grid";
import { ErrorMessage, advanceOnEnter } from "./fields";
import Lampiran6Form from "./lampiran6-form";
import { JourneyFields, PeoplePicker, type JourneyIssue } from "./journey-employee-workspace";
import RecapEntryMode from "./recap-entry-mode";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import type { RailStatus } from "./form-rail";
import { useDiscardConfirm } from "./discard-confirm";

// Langkah bertumpuk: yang selesai terlipat jadi satu baris ringkas, satu langkah terbuka.
const steps = [
  ["Perjalanan & peserta", "Perjalanan apa, dan siapa yang ikut?", "Isi sekali dari Surat Tugas, lalu centang pesertanya di samping. Setiap orang mendapat rekapnya sendiri."],
  ["Biaya", "Berapa biaya tiap orang?", "Salin dari SPPD masing-masing. Yang belum berbiaya tersimpan sebagai draft dan bisa dilengkapi nanti."],
  ["Tinjau", "Sudah sesuai dengan dokumen?", ""],
] as const;
const sectionByField: Partial<Record<keyof SharedJourney, JourneyIssue["section"]>> = {
  title: "letter", sptNo: "letter", fundTrack: "letter", startDate: "schedule", endDate: "schedule", claimedDays: "schedule",
  origin: "route", destination: "route", destinations: "route", format: "route", destinationProvince: "route",
};

export default function BatchRecapForm({ initialState, knownPeople, departments, suggestions, onClose, onSingle, onSaved }: {
  initialState: BatchRecapState;
  knownPeople: Employee[];
  departments: string[];
  suggestions: TripSuggestions;
  onClose: () => void;
  onSingle: (state: BatchRecapState) => void;
  onSaved: (trips: Trip[]) => void;
}) {
  const [state, setState] = useState(initialState);
  const [step, setStep] = useState(0);
  const [journeyIssue, setJourneyIssue] = useState<JourneyIssue>();
  const [error, setError] = useState("");
  const [errorKey, setErrorKey] = useState<string>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [editing, setEditing] = useState<string>();
  const [returnTo, setReturnTo] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const selected = state.rows.filter(row => row.selected);
  const shared = state.shared;
  const activePeople = knownPeople.filter(person => !person.deletedAt);
  const total = selected.reduce((sum, row) => sum + (totalCost(row.input) ?? 0), 0);
  const unknown = selected.filter(row => totalCost(row.input) === null).length;

  function go(next: number) {
    setStep(next);
    setError(""); setErrorKey(undefined); setJourneyIssue(undefined);
    requestAnimationFrame(() => {
      body.current?.scrollTo({ top: 0 });
      heading.current?.focus({ preventScroll: true });
    });
  }
  function patchShared(patch: Partial<SharedJourney>) {
    setJourneyIssue(undefined); setError(""); setErrorKey(undefined);
    setState(current => updateSharedJourney(current, patch));
  }
  function patchRow(key: string, change: (input: TripInput) => TripInput) {
    setState(current => ({ ...current, rows: current.rows.map(row => row.key === key ? { ...row, input: change(row.input) } : row) }));
  }
  function selectPeople(keys: Set<string>, checked: boolean) {
    setJourneyIssue(undefined); setError(""); setErrorKey(undefined);
    setState(current => {
      const rows = current.rows.map(row => keys.has(row.key) ? { ...row, selected: checked } : row);
      if (checked) {
        const existing = new Set(rows.map(row => row.key));
        for (const person of activePeople) if (keys.has(person.id) && !existing.has(person.id)) rows.push(newBatchRow(current.shared, person));
      }
      return { ...current, rows };
    });
  }
  function showJourneyIssue(issue: JourneyIssue) {
    setStep(0);
    setJourneyIssue(issue); setError(issue.message); setErrorKey(undefined);
  }
  function validate() {
    const parsed = batchRecapSchema.safeParse({ trips: selected.map(row => prepareRecap(row.input)) });
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const row = typeof issue.path[1] === "number" ? selected[issue.path[1]] : undefined;
    const field = (issue.path[2] === "lampiran6" ? issue.path[3] : issue.path[2]) as keyof SharedJourney;
    const section = sectionByField[field];
    // Galat pada isian bersama ditunjukkan di Perjalanan; galat milik satu orang ditandai di barisnya.
    if (!row) showJourneyIssue({ section: "people", message: issue.message });
    else if (section && JSON.stringify(sharedJourney(row.input)[field]) === JSON.stringify(shared[field])) showJourneyIssue({ section, field, message: issue.message });
    else {
      setStep(1);
      setError(`${row.input.participants[0].name}: ${issue.message}`);
      setErrorKey(row.key); setJourneyIssue(undefined);
    }
    return null;
  }
  function open(target: number) {
    if (target === step || busy) return;
    if (target > step && !validate()) return;
    go(target);
  }
  async function save(event: React.SyntheticEvent, directly = false) {
    event.preventDefault();
    if (saving.current) return;
    if (!directly && step < 2) { open(step + 1); return; }
    const parsed = validate();
    if (!parsed) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/archives/batch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed),
      });
      reportSessionResponse("/api/archives/batch", response);
      const result = await response.json();
      if (!response.ok) {
        setErrorKey(typeof result.index === "number" ? selected[result.index]?.key : undefined);
        throw new Error(result.error || "Gagal menyimpan rekap. Silakan coba lagi.");
      }
      onSaved(result.added);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      saving.current = false; setBusy(false);
    }
  }
  const discard = useDiscardConfirm();
  function close() {
    if (saving.current) return;
    if (isBatchEmpty(state)) onClose();
    else discard.ask(onClose);
  }

  // Sepulang dari Rincian, fokus kembali ke tombol Rincian orang yang sama, bukan ke awal dialog.
  function focusReturn(event: Event) {
    if (!returnTo) return;
    const button = Array.from(document.querySelectorAll<HTMLElement>(`[data-rincian="${CSS.escape(returnTo)}"]`))
      .find(item => item.getClientRects().length > 0);
    setReturnTo(undefined);
    if (!button) return;
    event.preventDefault();
    button.scrollIntoView({ block: "nearest" });
    button.focus({ preventScroll: true });
  }
  function openDetails(key: string) {
    setEditing(key); setReturnTo(key);
  }

  const editingRow = state.rows.find(row => row.key === editing);
  if (editingRow) return <Lampiran6Form
    trip={null} initialDraft={editingRow.input} initialStep="costs" backLabel={`Kembali ke ${steps[step][0]}`}
    departments={departments} knownPeople={knownPeople} suggestions={suggestions}
    onClose={() => setEditing(undefined)} onSave={() => {}}
    onDraftSave={input => {
      // The selection owns identity; personal details may be corrected within this recap.
      patchRow(editingRow.key, () => input);
      setEditing(undefined); setError(""); setErrorKey(undefined); setJourneyIssue(undefined);
    }}
  />;

  const journeyFilled = shared.title.trim().length >= 3 && Boolean(shared.startDate && shared.endDate)
    && tripDestinations(shared).every(value => value.trim().length > 0);
  const names = selected.map(row => row.input.participants[0].name.split(/\s+/)[0]);
  const stepStatus: Array<[RailStatus, string]> = [
    journeyIssue ? ["error", "Perlu diperbaiki"]
      : journeyFilled && selected.length ? ["done", [shared.destination, `${selected.length} orang · ${names.slice(0, 3).join(", ")}${names.length > 3 ? `, +${names.length - 3}` : ""}`].join(" · ")]
      : ["required", journeyFilled ? "Belum ada peserta" : "Wajib diisi"],
    errorKey ? ["error", "Perlu diperiksa"]
      : !selected.length || unknown === selected.length ? ["open", "Belum ada biaya"]
      : unknown ? ["open", `${selected.length - unknown} dari ${selected.length} orang berbiaya`]
      : ["done", money(total)],
    ["open", `${selected.length} rekap akan dibuat`],
  ];
  const complete = selected.length > 0 && unknown === 0;

  function content(index: number) {
    // Data Surat Tugas di kiri, peserta dicentang langsung di sampingnya.
    if (index === 0) return <div className="journey-people-split">
      <JourneyFields shared={shared} rows={state.rows} suggestions={suggestions} onJourneyChange={patchShared} issue={journeyIssue} />
      <aside className="journey-people-side" aria-label="Pilih peserta">
        <h4>Peserta</h4>
        <PeoplePicker shared={shared} rows={state.rows} people={knownPeople} onSelect={selectPeople} issue={journeyIssue} />
      </aside>
    </div>;
    if (index === 1) return <BatchCostGrid rows={state.rows} shared={shared} errorKey={errorKey}
      onChange={update => setState(current => ({ ...current, rows: update(current.rows) }))}
      onDetails={openDetails} />;
    return <>
      <div className="batch-journey-summary"><strong>{shared.title}</strong><span>ST: {shared.sptNo || "Belum dicatat"}</span><span>{shared.format === "luar-provinsi" ? `Luar Provinsi Jambi · ${shared.destinationProvince || "Provinsi belum dipilih"}` : "Dalam Provinsi Jambi"}</span><span>{shared.origin ? shared.origin + " → " : ""}{shared.destination}</span><span>{dateText(shared.startDate)} – {dateText(shared.endDate)}</span></div>
      <div className="batch-review-list">{selected.map(row => {
        const input = row.input;
        const reviews = lampiranReview(input.lampiran6!, input.startDate, input.endDate);
        const individualJourney = JSON.stringify(sharedJourney(input)) !== JSON.stringify(shared);
        const track = resolveFundTrack(input);
        return <article key={row.key} className="batch-review-card" data-error={errorKey === row.key}>
          <div className="section-heading batch-review-heading">
            <div className="batch-review-identity">
              <strong>{input.participants[0].name}</strong>
              <p className="field-hint">SPPD: {input.sppdNo || "Belum dicatat"} · {input.department}</p>
              <dl className="batch-review-account">
                <dt>Kode rekening</dt><dd>{input.account || "Belum dicatat"}</dd>
                <dt>Jenis dana</dt><dd>{track ? `${track} · ${fundTrackLabels[track]}` : "Belum dicatat"}</dd>
              </dl>
            </div>
            <Button type="button" variant="outline" size="sm" aria-label={`Rincian ${input.participants[0].name}`} data-rincian={row.key} onClick={() => openDetails(row.key)}>Rincian</Button>
          </div>
          {individualJourney && <p className="field-hint">Perjalanan disesuaikan: {input.title} · ST {input.sptNo || "—"} · {input.lampiran6!.origin || "—"} → {input.destination} · {dateText(input.startDate)} – {dateText(input.endDate)} · {input.lampiran6!.claimedDays ?? "—"} hari.</p>}
          <dl className="batch-review-costs">{batchCostColumns.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{money(input.lampiran6![key])}</dd></div>)}
            {input.lampiran6!.additionalCosts.map((cost, index) => <div key={`additional-${index}`}><dt>{cost.label || "Biaya tambahan"}</dt><dd>{money(cost.amount)}</dd></div>)}
            <div className="batch-review-total"><dt>Total pegawai</dt><dd>{money(totalCost(input))}</dd></div>
          </dl>
          {reviews.length > 0 && <ul className="batch-review-notes">{reviews.map(note => <li key={note}>{note}</li>)}</ul>}
        </article>;
      })}</div>
    </>;
  }

  return <><Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="form-dialog lampiran-dialog batch-recap-dialog rekap-form step-dialog step-wide" onOpenAutoFocus={focusReturn} onInteractOutside={event => event.preventDefault()}>
      <header className="step-top">
        <div className="step-title">
          <span className="step-kicker">Rekap perjalanan dinas</span>
          <DialogTitle>Rekap baru</DialogTitle>
          <DialogDescription className="sr-only">Isi perjalanan sekali, pilih peserta, lalu catat biaya tiap orang.</DialogDescription>
        </div>
        <div className="step-modes">
          <RecapEntryMode value="multiple" disabled={busy} onChange={value => { if (value === "single") onSingle(state); }} />
        </div>
      </header>
      {/* Langkah sebagai teks, sama dengan mode satu pegawai; satu langkah per layar. */}
      <nav className="step-nav" aria-label="Langkah isian rekap">
        {steps.map(([label], index) => {
          const [status, note] = stepStatus[index];
          return <button key={label} type="button" data-status={status} aria-current={index === step ? "step" : undefined} disabled={busy} onClick={() => open(index)}>
            <i aria-hidden="true">{status === "done" && index !== step ? <Check size={11} strokeWidth={3.5} /> : status === "error" ? "!" : index + 1}</i>
            {label}
            <span className="sr-only">, {note}</span>
          </button>;
        })}
      </nav>
      <div className="step-progress" aria-hidden="true">
        <span>Langkah {step + 1} dari {steps.length} · {steps[step][0]}</span>
        <div><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <form className="editor-form step-main" onSubmit={save} onKeyDown={advanceOnEnter} noValidate>
        <div className="step-body" ref={body}>
          <div className="step-column" key={step}>
            <header className="step-head">
              <h3 ref={heading} tabIndex={-1}>{steps[step][1]}</h3>
              <p>{step === 2 ? `Akan dibuat ${selected.length} rekap terpisah. Setiap rekap tetap bisa dibuka dan diedit setelah disimpan.` : steps[step][2]}</p>
            </header>
            {step === 0 && <OnboardingHint id="create-archive" />}
            <fieldset disabled={busy} className="batch-fields">{content(step)}</fieldset>
          </div>
        </div>
        <div className="form-footer step-foot">
          <ErrorMessage message={error} />
          {errorKey && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => openDetails(errorKey)}>Periksa rincian pegawai</Button>}
          <div className="footer-actions">
            <div className="form-step-meta step-meta" aria-live="polite">
              <span className="step-status" data-complete={complete || undefined}>{complete ? "Lengkap" : "Draft"}</span>
              <strong className="step-total">{money(unknown === selected.length ? null : total)}</strong>
              <span className="step-meta-note">{!selected.length ? "Belum ada peserta" : unknown ? `${selected.length} orang · ${unknown} belum berbiaya` : `${selected.length} orang`}</span>
            </div>
            <div className="form-action-buttons">
              {step > 0
                ? <Button type="button" variant="ghost" disabled={busy} aria-label="Kembali" onClick={() => go(step - 1)}><ArrowLeft /><span className="form-action-label">Kembali</span></Button>
                : <Button type="button" variant="ghost" disabled={busy} onClick={close}>Batal</Button>}
              <Button type="button" variant={step === 2 ? "default" : "outline"} className="save-archive-button" disabled={busy || selected.length === 0}
                onClick={event => void save(event, true)}>
                {busy && <LoaderCircle className="animate-spin" />}
                {busy ? "Menyimpan…" : selected.length ? `Simpan ${selected.length} rekap` : "Simpan rekap"}
              </Button>
              {step < 2 && <Button type="submit" disabled={busy} aria-label={step === 1 ? "Tinjau rekap" : `Lanjut ke ${steps[step + 1][0].toLowerCase()}`}>
                <span>{step === 1 ? "Tinjau" : "Lanjut"}<span className="form-action-label">{step === 1 ? " rekap" : `: ${steps[step + 1][0]}`}</span></span><ArrowRight />
              </Button>}
            </div>
          </div>
        </div>
      </form>
    </DialogContent>
  </Dialog>{discard.dialog}</>;
}

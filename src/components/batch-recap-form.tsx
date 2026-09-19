"use client";
import { OnboardingHint } from "./onboarding";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileSpreadsheet, LoaderCircle, Save } from "lucide-react";
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
import EmployeeCostWorkspace from "./employee-cost-workspace";
import { ErrorMessage } from "./fields";
import Lampiran6Form from "./lampiran6-form";
import JourneyEmployeeWorkspace, { type JourneyIssue } from "./journey-employee-workspace";
import RecapEntryMode from "./recap-entry-mode";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip";

const steps = ["Perjalanan & pegawai", "Biaya per pegawai", "Tinjau rekap"];

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
  const [savingDirectly, setSavingDirectly] = useState(false);
  const saving = useRef(false);
  const [editing, setEditing] = useState<string>();
  const [editingStep, setEditingStep] = useState<"journey" | "costs">("costs");
  const [activeCostKey, setActiveCostKey] = useState<string>();
  const [journeyHeaderSlot, setJourneyHeaderSlot] = useState<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = state.rows.filter(row => row.selected);
  const shared = state.shared;
  const activePeople = knownPeople.filter(person => !person.deletedAt);
  const total = selected.reduce((sum, row) => sum + (totalCost(row.input) ?? 0), 0);
  const unknown = selected.filter(row => totalCost(row.input) === null).length;

  function go(next: number) {
    setStep(next);
    setError(""); setErrorKey(undefined); setJourneyIssue(undefined);
    requestAnimationFrame(() => heading.current?.focus());
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
  function validate() {
    const parsed = batchRecapSchema.safeParse({ trips: selected.map(row => prepareRecap(row.input)) });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const row = typeof issue.path[1] === "number" ? selected[issue.path[1]] : undefined;
      const field = (issue.path[2] === "lampiran6" ? issue.path[3] : issue.path[2]) as keyof SharedJourney;
      const sectionByField: Partial<Record<keyof SharedJourney, JourneyIssue["section"]>> = {
        title: "letter", sptNo: "letter", fundTrack: "letter", startDate: "schedule", endDate: "schedule", claimedDays: "schedule",
        origin: "route", destination: "route", destinations: "route", format: "route", destinationProvince: "route",
      };
      const commonSection = step === 0 && row && sectionByField[field]
        && JSON.stringify(sharedJourney(row.input)[field]) === JSON.stringify(shared[field]) ? sectionByField[field] : undefined;
      if (step === 0 && (!row || commonSection)) {
        setJourneyIssue({ section: commonSection ?? "people", field, message: issue.message });
        setError(issue.message); setErrorKey(undefined);
      } else {
        setError(`${row ? row.input.participants[0].name + ": " : ""}${issue.message}`);
        setErrorKey(row?.key);
      }
      if (row) setActiveCostKey(row.key);
      return null;
    }
    return parsed.data;
  }
  async function save(event: React.SyntheticEvent, directly = false) {
    event.preventDefault();
    if (saving.current) return;
    const parsed = validate();
    if (!parsed) return;
    if (!directly && step < 2) { go(step + 1); return; }
    saving.current = true; setBusy(true); setSavingDirectly(directly); setError("");
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
      saving.current = false; setBusy(false); setSavingDirectly(false);
    }
  }
  function close() {
    if (!saving.current && (isBatchEmpty(state) || window.confirm("Abaikan isian rekap yang belum disimpan?"))) onClose();
  }

  const editingRow = state.rows.find(row => row.key === editing);
  if (editingRow) return <Lampiran6Form
    trip={null} initialDraft={editingRow.input} initialStep={editingStep}
    departments={departments} knownPeople={knownPeople} suggestions={suggestions}
    onClose={() => setEditing(undefined)} onSave={() => {}}
    onDraftSave={input => {
      // The selection owns identity; personal details may be corrected within this recap.
      patchRow(editingRow.key, () => input);
      setEditing(undefined); setError(""); setErrorKey(undefined); setJourneyIssue(undefined);
    }}
  />;

  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className={`form-dialog lampiran-dialog batch-recap-dialog batch-step-${step}`} onInteractOutside={event => event.preventDefault()}>
      {/* Kepala ringkas: judul, kemajuan perjalanan bersama, dan pengalih mode dalam satu baris. */}
      <DialogHeader className="lampiran-header-compact batch-header-compact">
        <div className="lampiran-heading-row">
          <div className="lampiran-heading-main">
            <div className="dialog-kicker"><FileSpreadsheet size={14} /> Rekap perjalanan dinas</div>
            <DialogTitle>Tambah rekap pegawai</DialogTitle>
          </div>
          {step === 0 && <div className="journey-header-slot" ref={setJourneyHeaderSlot} />}
          <div className="lampiran-heading-tools">
            {step === 0 && <RecapEntryMode value="multiple" disabled={busy} onChange={value => { if (value === "single") onSingle(state); }} />}
          </div>
        </div>
        <DialogDescription className="sr-only">Isi perjalanan sekali, lalu lengkapi SPPD dan biaya setiap pegawai.</DialogDescription>
      </DialogHeader>
      <form className="editor-form" onSubmit={save} noValidate>
        <Tabs value={String(step)} onValueChange={value => { const next = Number(value); if (next < step || validate()) go(next); }}>
          <TabsList className="detail-tabs lampiran-step-tabs" aria-label="Tahap tambah rekap">
            {steps.map((label, index) => <TabsTrigger key={label} value={String(index)} disabled={busy}>{label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="form-body lampiran-form-body batch-form-body">
          {step === 0 && <OnboardingHint id="create-archive" />}
          <h2 ref={heading} tabIndex={-1} className="sr-only">{steps[step]}</h2>
          <fieldset disabled={busy} className="batch-fields">
            {step === 0 && <JourneyEmployeeWorkspace
              shared={shared} rows={state.rows} people={knownPeople} suggestions={suggestions}
              onJourneyChange={patchShared} onSelect={selectPeople} issue={journeyIssue}
              headerSlot={journeyHeaderSlot}
            />}
            {step === 1 && <EmployeeCostWorkspace
              suggestions={suggestions}
              shared={shared} rows={state.rows} activeKey={activeCostKey} onActiveChange={setActiveCostKey} errorKey={errorKey}
              onChange={update => setState(current => ({ ...current, rows: update(current.rows) }))}
              onEditJourney={() => go(0)}
              onEditArchive={key => { setEditingStep("journey"); setEditing(key); }}
            />}
            {step === 2 && <section className="form-section">
              <h3>Periksa sebelum menyimpan</h3>
              <div className="batch-journey-summary"><strong>{shared.title}</strong><span>ST: {shared.sptNo || "Belum dicatat"}</span><span>{shared.format === "luar-provinsi" ? `Luar Provinsi Jambi · ${shared.destinationProvince || "Provinsi belum dipilih"}` : "Dalam Provinsi Jambi"}</span><span>{shared.origin ? shared.origin + " → " : ""}{shared.destination}</span><span>{dateText(shared.startDate)} – {dateText(shared.endDate)}</span></div>
              <p className="section-note">Akan dibuat {selected.length} rekap terpisah. Setiap rekap tetap dapat dibuka dan diedit setelah disimpan.</p>
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
                    <Button type="button" variant="outline" size="sm" aria-label={`Ubah biaya ${input.participants[0].name}`} onClick={() => { setActiveCostKey(row.key); go(1); }}>Ubah biaya</Button>
                  </div>
                  {individualJourney && <p className="field-hint">Perjalanan disesuaikan: {input.title} · ST {input.sptNo || "—"} · {input.lampiran6!.origin || "—"} → {input.destination} · {dateText(input.startDate)} – {dateText(input.endDate)} · {input.lampiran6!.claimedDays ?? "—"} hari.</p>}
                  <dl className="batch-review-costs">{batchCostColumns.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{money(input.lampiran6![key])}</dd></div>)}
                    {input.lampiran6!.additionalCosts.map((cost, index) => <div key={`additional-${index}`}><dt>{cost.label || "Biaya tambahan"}</dt><dd>{money(cost.amount)}</dd></div>)}
                    <div className="batch-review-total"><dt>Total pegawai</dt><dd>{money(totalCost(input))}</dd></div>
                  </dl>
                  {reviews.length > 0 && <ul className="batch-review-notes">{reviews.map(note => <li key={note}>{note}</li>)}</ul>}
                </article>;
              })}</div>
            </section>}
          </fieldset>
        </div>
        <div className="form-footer">
          <ErrorMessage message={error} />
          {errorKey && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(errorKey)}>Periksa rincian pegawai</Button>}
          <div className="footer-actions">
            <div className="form-step-meta" aria-live="polite"><strong>{step === 0 ? `${selected.length} pegawai dipilih` : `${selected.length} pegawai · ${money(unknown === selected.length ? null : total)}`}</strong><span>{step === 0 ? "Berikutnya: isi SPPD dan biaya per pegawai." : unknown ? `${unknown} rekap belum memiliki biaya dan akan disimpan sebagai draft.` : "Total biaya pegawai yang dipilih"}</span></div>
            <div className="form-action-buttons">
              <Button type="button" variant="ghost" disabled={busy} onClick={close}>Batal</Button>
              {step > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => go(step - 1)}><ArrowLeft />Kembali</Button>}
              {step < 2 && <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="batch-save-draft" disabled={busy || selected.length === 0}
                    aria-label={unknown === selected.length ? "Simpan draft" : "Simpan isian sekarang"}
                    onClick={event => void save(event, true)}>
                    {busy && savingDirectly ? <LoaderCircle className="animate-spin" /> : <Save />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{unknown === selected.length ? "Simpan draft" : "Simpan isian sekarang"} · dapat dilengkapi nanti</TooltipContent>
              </Tooltip></TooltipProvider>}
              <Button type="submit" disabled={busy} className="save-archive-button">{busy && !savingDirectly ? <><LoaderCircle className="animate-spin" />Menyimpan…</> : step === 2 ? `Simpan ${selected.length} rekap` : <>{step === 1 ? "Tinjau rekap" : "Lanjut ke biaya"}<ArrowRight /></>}</Button>
            </div>
          </div>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

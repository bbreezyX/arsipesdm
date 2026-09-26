"use client";
import { OnboardingHint } from "./onboarding";

import FlightCostFields from "./flight-cost-fields";
import RecapLedger from "./recap-ledger";
import TravelScopeFields from "./travel-scope-fields";
import { Combobox } from "./ui/combobox";
import DestinationFields from "./destination-fields";
import { useRowKeys } from "./use-row-keys";
import AccountCodeField from "./account-code-field";
import FundTrackField from "./fund-track-field";
import RecapEntryMode from "./recap-entry-mode";
import AdditionalCostFields from "./additional-cost-fields";
import DecimalField from "./decimal-field";
import VehicleIdentityFields from "./vehicle-identity-fields";
import LodgingAllowanceFields from "./lodging-allowance-fields";
import { applyLodgingAllowance, lodgingAllowanceDescription } from "@/lib/lodging-allowance";
import { formatDestinations, tripDestinations } from "@/lib/destinations";
import { automaticDailyAllowance, applyDailyAllowance } from "@/lib/daily-allowance";
import type { TripSuggestions } from "@/lib/trip-suggestions";
import { employeeRankOptions, type Employee } from "@/lib/employees";
import { CustomSelect, SelectOption } from "./ui/select";
import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  LoaderCircle,
  ArrowRight,
  ArrowLeft,
  Info,
  Check,
} from "lucide-react";
import { recapSectionStates } from "@/lib/recap-visual-state";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import type { RailStatus } from "./form-rail";
import { useDiscardConfirm } from "./discard-confirm";
import { Button } from "./ui/button";
import { Field, ErrorMessage, advanceOnEnter, api } from "./fields";
import ArchiveDateInput from "./archive-date-input";
import {
  tripSchema,
  totalCost,
  dateText,
  money,
  isComplete,
  type Trip,
  type TripInput,
  type Participant,
} from "@/lib/model";
import {
  lampiran6Schema,
  lodgingSchema,
  groundTransportSchema,
  lampiranCosts,
  lampiranReview,
  type Lampiran6,
  type Lodging,
  type GroundTransport,
} from "@/lib/lampiran6-schema";

// Urutan mengikuti tumpukan dokumen yang disalin operator, sama dengan mode beberapa pegawai.
const steps = [
  ["person", "Pegawai", "Siapa yang berangkat?", "Cari namanya. NIP, golongan, jabatan, dan bidang ikut terisi dari daftar pegawai."],
  ["journey", "Perjalanan", "Ke mana, dan kapan?", "Salin dari Surat Tugas. Uang harian dihitung dari tujuan dan jumlah hari di sini."],
  ["costs", "Biaya", "Berapa yang dibayarkan?", "Salin dari SPPD dan kuitansi. Kosongkan yang belum diketahui; tulis 0 bila memang tidak ada."],
  ["evidence", "Bukti", "Ada bukti hotel, kendaraan, atau tiket?", "Tidak wajib. Rekap tetap bisa disimpan tanpa rincian bukti."],
  ["review", "Simpan", "Sudah cocok dengan berkasnya?", "Bandingkan sekali lagi dengan dokumen fisik, tambahkan keterangan bila perlu, lalu simpan."],
] as const;
type Step = (typeof steps)[number][0];
const personFields = new Set(["participants", "department", "rank"]);
const journeyFields = new Set(["title", "sptNo", "destination", "destinations", "startDate", "endDate", "origin", "claimedDays", "format", "destinationProvince", "program", "activityName", "subActivity"]);
const evidenceFields = new Set(["lodgings", "lodgingMode", "lodgingBaseRate", "lodgingNights", "groundTransports", "outbound", "inbound"]);
const reviewFields = new Set(["notes", "physicalLocation", "paid", "correctionReason", "sourceNo"]);
function stepForIssue(path: PropertyKey[]): Step {
  const field = String(path[0] === "lampiran6" ? path[1] : path[0]);
  if (personFields.has(field)) return "person";
  if (journeyFields.has(field)) return "journey";
  if (evidenceFields.has(field)) return "evidence";
  if (reviewFields.has(field)) return "review";
  return "costs";
}
const numberValue = (value: string) => (value === "" ? null : Number(value));
const hasValues = (value: object) =>
  Object.values(value).some((v) => v !== "" && v !== null);

export default function Lampiran6Form({
  trip,
  departments,
  knownPeople,
  suggestions,
  onClose,
  onSave,
  onSwitch,
  initialDraft,
  initialStep = "person",
  onDraftSave,
  onMultiple,
  backLabel = "Kembali",
}: {
  trip: Trip | null;
  departments: string[];
  knownPeople: Employee[];
  suggestions: TripSuggestions;
  onClose: () => void;
  onSave: (trip: Trip) => void;
  onSwitch?: () => void;
  initialDraft?: TripInput;
  initialStep?: Step;
  onDraftSave?: (input: TripInput) => void;
  onMultiple?: (input: TripInput) => void;
  /** Rincian peserta: tujuan kembali ke rekap bersama, misalnya "Kembali ke Biaya". */
  backLabel?: string;
}) {
  const [form, setForm] = useState<TripInput>(() =>
    trip
      ? { ...trip, lampiran6: lampiran6Schema.parse(trip.lampiran6), correctionReason: "" }
      : initialDraft ? structuredClone(initialDraft) : {
          title: "",
          sptNo: "",
          sppdNo: "",
          destination: "",
          department: departments[0] ?? "",
          startDate: "",
          endDate: "",
          participants: [
            {
              id: crypto.randomUUID(),
              name: "",
              nip: "",
              position: "",
              department: departments[0] ?? "",
            },
          ],
          costs: [],
          paid: null,
          notes: "",
          activity: "",
          account: "",
          fundTrack: "",
          physicalLocation: "",
          requiredDocs: [],
          correctionReason: "",
          lampiran6: lampiran6Schema.parse({
            dailyRateMode: "auto",
            lodgings: [{}],
            groundTransports: [{}],
          }),
        },
  );
  const [step, setStep] = useState<Step>(initialStep);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const focusStepRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: jalankan ulang setiap langkah berganti
  useEffect(() => {
    const activeTab = activeTabRef.current;
    const revealTab = () =>
      activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    revealTab();
    const resize = new ResizeObserver(revealTab);
    if (activeTab?.parentElement) resize.observe(activeTab.parentElement);
    if (focusStepRef.current) {
      focusStepRef.current = false;
      const firstField = Array.from(
        bodyRef.current?.querySelectorAll<HTMLElement>(
          "input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
        ) ?? [],
      ).find((field) => !field.closest("details:not([open])"));
      (
        firstField ??
        bodyRef.current?.querySelector<HTMLElement>(".step-head h3")
      )?.focus({ preventScroll: true });
    }
    return () => resize.disconnect();
  }, [step]);
  function goStep(value: Step) {
    focusStepRef.current = true;
    setStep(value);
  }
  const [editIdentity, setEditIdentity] = useState(false);
  // Draft dari mode lain belum tersimpan; rincian peserta baru berubah setelah diisi.
  const [dirty, setDirty] = useState(Boolean(initialDraft) && !onDraftSave),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errorStep, setErrorStep] = useState<Step>();
  const data = form.lampiran6!;
  const lodgingRows = useRowKeys(data.lodgings.length);
  const transportRows = useRowKeys(data.groundTransports.length);
  const dailyAllowance = automaticDailyAllowance(data, tripDestinations(form));
  const automaticDaily = data.dailyRateMode !== "manual";
  const needsCorrectionReason = trip !== null && isComplete(trip);
  const savingDraft = !isComplete(form);
  const person = form.participants[0];
  // Isian baru menggugurkan tanda galat lama; simpan berikutnya memeriksa ulang.
  function edited() {
    setDirty(true);
    setError("");
    setErrorStep(undefined);
  }
  function patch(p: Partial<TripInput>) {
    setForm((f) => {
      const next = { ...f, ...p };
      if ("destination" in p || "destinations" in p) {
        next.lampiran6 = applyDailyAllowance(next.lampiran6!, tripDestinations(next));
        next.costs = lampiranCosts(next.lampiran6, next.participants[0].id);
      }
      return next;
    });
    edited();
  }
  function patchData(p: Partial<Lampiran6>) {
    setForm((f) => {
      let next = { ...f.lampiran6!, ...p };
      if ("origin" in p || "claimedDays" in p || "dailyRateMode" in p || "format" in p || "destinationProvince" in p) {
        next = applyDailyAllowance(next, tripDestinations(f));
      }
      next = applyLodgingAllowance(next);
      return {
        ...f,
        lampiran6: next,
        costs: lampiranCosts(next, f.participants[0].id),
        activity: next.activityName,
      };
    });
    edited();
  }
  function patchPerson(p: Partial<Participant>) {
    patch({
      participants: [{ ...person, ...p }],
      ...(p.department ? { department: p.department } : {}),
    });
  }
  function patchRate(
    field: "dailyRate" | "representationRate",
    value: number | null,
  ) {
    patchData({
      [field]: value,
      ...(value !== null && data.claimedDays !== null
        ? {
            [field === "dailyRate" ? "dailyTotal" : "representationTotal"]:
              value * data.claimedDays,
          }
        : {}),
    });
  }
  function patchDays(value: number | null) {
    patchData({
      claimedDays: value,
      ...(value !== null && data.dailyRate !== null
        ? { dailyTotal: value * data.dailyRate }
        : {}),
      ...(value !== null && data.representationRate !== null
        ? { representationTotal: value * data.representationRate }
        : {}),
    });
  }
  const discard = useDiscardConfirm();
  function close(action = onClose) {
    if (busy) return;
    if (dirty) discard.ask(action);
    else action();
  }
  const reviews = lampiranReview(data, form.startDate, form.endDate);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setErrorStep(undefined);
    const prepared = {
      ...form,
      lampiran6: {
        ...data,
        lodgings: data.lodgings.filter(hasValues),
        groundTransports: data.groundTransports.filter(hasValues),
      },
      costs: lampiranCosts(data, person.id),
    };
    const parsed = tripSchema.safeParse(prepared);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const target = stepForIssue(issue.path);
      setStep(target);
      setErrorStep(target);
      setError(issue.message);
      return;
    }
    if (needsCorrectionReason && !form.correctionReason.trim()) {
      setStep("review");
      setErrorStep("review");
      setError("Tuliskan alasan perubahan arsip.");
      return;
    }
    if (onDraftSave) {
      onDraftSave(parsed.data);
      return;
    }
    setBusy(true);
    try {
      const saved = await api<Trip>(
        trip ? `/api/archives/${trip.id}` : "/api/archives",
        {
          method: trip ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...parsed.data, version: trip?.version }),
        },
      );
      onSave(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function textField<K extends keyof Lampiran6>(
    key: K,
    label: string,
    hint?: string,
  ) {
    return (
      <Field key={key} label={label} hint={hint}>
        <input
          value={String(data[key] ?? "")}
          maxLength={1000}
          onChange={(e) => patchData({ [key]: e.target.value })}
        />
      </Field>
    );
  }
  const calendarDays =
    form.startDate && form.endDate
      ? Math.round(
          (Date.parse(form.endDate) - Date.parse(form.startDate)) / 86400000,
        ) + 1
      : null;
  const stepIndex = steps.findIndex(([key]) => key === step);
  const [, , question, purpose] = steps[stepIndex];
  const next = steps[stepIndex + 1]?.[0];
  const previous = steps[stepIndex - 1]?.[0];
  const total = totalCost(form);
  const evidence = recapSectionStates(data);
  const evidenceCount = evidence.hotel.count + evidence.vehicle.count + evidence.flight.count;
  const stepStatus: Record<Step, [RailStatus, string]> = {
    person: person.name.trim() && form.department.trim() ? ["done", person.name] : ["required", "Wajib diisi"],
    journey: form.title.trim().length >= 3 && form.startDate && form.endDate && form.destination.trim()
      ? ["done", form.destination] : ["required", "Wajib diisi"],
    costs: total === null ? ["open", "Belum ada biaya"] : ["done", money(total)],
    evidence: evidenceCount ? ["done", `${evidenceCount} rincian`] : ["optional", "Opsional"],
    review: needsCorrectionReason && !form.correctionReason.trim() ? ["required", "Alasan perubahan wajib"] : ["open", "Ringkasan & keterangan"],
  };
  if (errorStep) stepStatus[errorStep] = ["error", "Perlu diperbaiki"];
  // Rekap baru dituntun maju langkah demi langkah; rekap yang diedit dan rincian pegawai bisa langsung disimpan.
  const advanceFirst = Boolean(next) && !trip && !onDraftSave;
  const nextButton = next && (
    <Button
      key="next"
      type="button"
      variant={advanceFirst ? "default" : "outline"}
      disabled={busy}
      aria-label={`Lanjut ke ${steps[stepIndex + 1][1].toLowerCase()}`}
      onClick={() => goStep(next)}
    >
      <span>Lanjut<span className="form-action-label">: {steps[stepIndex + 1][1]}</span></span> <ArrowRight />
    </Button>
  );
  const knownPerson = knownPeople.find((p) => p.name === person.name);
  // Pegawai dari daftar tampil sebagai satu kartu; isian muncul bila ada yang perlu dikoreksi.
  const showIdentityCard = Boolean(knownPerson) && !editIdentity && errorStep !== "person" && Boolean(form.department.trim());
  const title = onDraftSave ? person.name : trip ? (needsCorrectionReason ? "Edit rekap pegawai" : "Lengkapi draft") : "Rekap baru";
  const saveButton = (
    <Button
      key="save"
      type="submit"
      variant={advanceFirst ? "outline" : "default"}
      className="save-archive-button"
      disabled={busy}
    >
      {busy && <LoaderCircle className="animate-spin" />}
      {onDraftSave ? "Terapkan rincian" : busy
        ? "Menyimpan…"
        : savingDraft
          ? "Simpan draft"
          : trip ? "Simpan perubahan" : "Simpan rekap"}
    </Button>
  );
  return (<>
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={`form-dialog lampiran-dialog rekap-form step-dialog${onDraftSave ? " rincian-dialog" : ""}`}
        showCloseButton={!onDraftSave}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Kepala: judul, cara mengisi, lalu langkah sebagai teks. Satu pertanyaan per layar di bawahnya. */}
        <header className="step-top">
          <div className="step-title">
            <span className="step-kicker">{onDraftSave ? "Rincian peserta · Beberapa pegawai" : "Rekap perjalanan dinas"}</span>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={onDraftSave || needsCorrectionReason ? "step-note" : "sr-only"}>
              {onDraftSave ? "Rincian satu peserta dalam rekap beberapa pegawai. Perubahan berlaku setelah Terapkan rincian."
                : needsCorrectionReason
                ? "Perubahan pada arsip lengkap perlu disertai alasan."
                : "Isi data perjalanan dan biaya pegawai ini. Dokumen pendukung opsional."}
            </DialogDescription>
          </div>
          {(onMultiple || onSwitch) && (
            <div className="step-modes">
              {onMultiple && <RecapEntryMode value="single" disabled={busy} onChange={value => { if (value === "multiple") onMultiple(form); }} />}
              {onSwitch && (
                <button className="step-switch" type="button" title="Satu arsip untuk seluruh peserta" onClick={() => close(onSwitch)}>
                  Arsip gabungan
                </button>
              )}
            </div>
          )}
        </header>
        <nav className="step-nav" aria-label="Langkah isian rekap">
          {steps.map(([key, label], index) => {
            const [state, note] = stepStatus[key];
            return (
              <button
                key={key}
                type="button"
                data-status={state}
                aria-current={key === step ? "step" : undefined}
                ref={key === step ? activeTabRef : undefined}
                disabled={busy}
                onClick={() => setStep(key)}
              >
                <i aria-hidden="true">{state === "done" ? <Check size={11} strokeWidth={3.5} /> : state === "error" ? "!" : index + 1}</i>
                {onDraftSave && key === "review" ? "Ringkasan" : label}
                <span className="sr-only">, {note}</span>
              </button>
            );
          })}
        </nav>
        <div className="step-progress" aria-hidden="true">
          <span>Langkah {stepIndex + 1} dari {steps.length} · {steps[stepIndex][1]}</span>
          <div><i style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
        </div>
        <form className="editor-form step-main" onSubmit={save} onKeyDown={advanceOnEnter} noValidate>
          <div className="step-body" ref={bodyRef}>
            <div className="step-column" key={step}>
              <header className="step-head">
                <h3 tabIndex={-1}>{question}</h3>
                <p>{onDraftSave && step === "person" ? "Identitas mengikuti pegawai yang dipilih pada rekap bersama." : purpose}</p>
              </header>
              {step === "person" && <>
                {!trip && <OnboardingHint id="create-archive" />}
                {showIdentityCard ? (
                  <section className="identity-card" aria-label="Pegawai terpilih">
                    <div className="identity-card-head">
                      <span className="identity-avatar" aria-hidden="true">
                        {person.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
                      </span>
                      <div>
                        <strong>{person.name}</strong>
                        <span>{person.nip ? `NIP ${person.nip}` : "NIP belum dicatat"}</span>
                      </div>
                      {!onDraftSave && (
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          patchPerson({ name: "", nip: "", position: "" });
                          patchData({ rank: "" });
                        }}>Ganti</Button>
                      )}
                    </div>
                    <dl>
                      <div><dt>Golongan</dt><dd>{data.rank || "Belum dicatat"}</dd></div>
                      <div><dt>Jabatan</dt><dd>{person.position || "Belum dicatat"}</dd></div>
                      <div><dt>Bidang / unit kerja</dt><dd>{form.department}</dd></div>
                    </dl>
                    <p>
                      Ada yang berbeda di dokumen?{" "}
                      <button type="button" className="identity-edit" onClick={() => setEditIdentity(true)}>Ubah untuk rekap ini</button>
                    </p>
                  </section>
                ) : (
                <section className="form-section">
                  <div className="form-grid">
                    <Field label="Nama pegawai" required className="span-2">
                      <Combobox
                        autoFocus
                        disabled={Boolean(onDraftSave)}
                        required
                        aria-label="Nama pegawai"
                        value={person.name}
                        placeholder="Cari atau ketik nama pegawai"
                        options={knownPeople.map(p => ({value: p.name, description: [p.nip, p.rank, p.position, p.department].filter(Boolean).join(" · ")}))}
                        emptyMessage="Pegawai belum ada di daftar."
                        onValueChange={(value) => {
                          const known = knownPeople.find(p => p.name === value);
                          patchPerson({name: value, ...(known ? {nip: known.nip, position: known.position, department: known.department} : {})});
                          if (known) patchData({rank: known.rank});
                        }}
                      />
                    </Field>
                    <Field label="NIP">
                      <input
                        value={person.nip}
                        readOnly={Boolean(onDraftSave)}
                        maxLength={250}
                        inputMode="numeric"
                        placeholder="18 digit"
                        onChange={(e) => patchPerson({ nip: e.target.value })}
                      />
                    </Field>
                    <Field label="Golongan">
                      <Combobox aria-label="Golongan" value={data.rank} maxLength={1000} options={employeeRankOptions} onValueChange={rank => patchData({rank})} placeholder="Pilih atau ketik golongan" />
                    </Field>
                    <Field label="Jabatan">
                      <input
                        value={person.position}
                        maxLength={250}
                        onChange={(e) =>
                          patchPerson({ position: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Bidang / unit kerja" required>
                      <CustomSelect
                        value={form.department}
                        onValueChange={(value) =>
                          patch({
                            department: value,
                            participants: [
                              { ...person, department: value },
                            ],
                          })
                        }
                      >
                        {[...new Set([...departments, form.department])]
                          .filter(Boolean)
                          .map((d) => (
                            <SelectOption key={d}>{d}</SelectOption>
                          ))}
                      </CustomSelect>
                    </Field>
                  </div>
                </section>
                )}
              </>}
              {step === "journey" && <>
                <section className="form-section">
                  <h3>Surat tugas</h3>
                  <div className="form-grid">
                    <Field label="Nomor ST / SPT">
                      <Combobox aria-label="Nomor ST / SPT" value={form.sptNo} maxLength={250}
                        options={suggestions.letters} onValueChange={sptNo => patch({sptNo})}
                        placeholder="Pilih ST tersimpan atau ketik nomor baru" emptyMessage="Belum ada nomor ST yang cocok." />
                    </Field>
                    <FundTrackField value={form.fundTrack ?? ""} trip={form} onChange={fundTrack => patch({ fundTrack })} />
                    <Field
                      label="Nama kegiatan / maksud perjalanan"
                      required
                      className="span-2"
                    >
                      <Combobox multiline rows={3} aria-label="Nama kegiatan / maksud perjalanan" required value={form.title} maxLength={3000}
                        options={suggestions.purposes} onValueChange={title => patch({title})}
                        placeholder="Pilih kegiatan tersimpan atau ketik maksud perjalanan" emptyMessage="Belum ada kegiatan yang cocok." />
                    </Field>
                  </div>
                </section>
                <section className="form-section">
                  <h3>Jadwal</h3>
                  <div className="form-grid">
                    <Field label="Tanggal berangkat" required>
                      <ArchiveDateInput
                        required
                        value={form.startDate}
                        onChange={(value) =>
                          patch({
                            startDate: value,
                            endDate:
                              value && (!form.endDate || form.endDate < value)
                                ? value
                                : form.endDate,
                          })
                        }
                      />
                    </Field>
                    <Field label="Tanggal kembali" required>
                      <ArchiveDateInput
                        required
                        value={form.endDate}
                        onChange={(value) => patch({ endDate: value })}
                      />
                    </Field>
                    <NumberField
                      label="Jumlah hari pada rekap"
                      value={data.claimedDays}
                      onChange={patchDays}
                      hint={
                        calendarDays !== null &&
                        Number.isFinite(calendarDays) &&
                        calendarDays > 0
                          ? `Lama perjalanan: ${calendarDays} hari. Isi jumlah hari sesuai rekap.`
                          : "Dasar hitungan uang harian; representasi hanya untuk kepala bidang."
                      }
                    />
                  </div>
                </section>
                <section className="form-section">
                  <h3>Rute</h3>
                  <div className="form-grid">
                    <TravelScopeFields value={data} onChange={patchData} />
                    <Field label="Asal">
                      <Combobox aria-label="Asal" value={data.origin} maxLength={1000} options={suggestions.origins}
                        onValueChange={origin => patchData({origin})} placeholder="Pilih atau ketik daerah asal" />
                    </Field>
                    <DestinationFields className="span-2" values={tripDestinations(form)} options={suggestions.destinations}
                      onChange={destinations => patch({destinations, destination: formatDestinations(destinations)})} />
                  </div>
                  <details className="advanced-fields">
                    <summary>Program, kegiatan, dan subkegiatan</summary>
                    <div className="form-grid">
                      {textField("program", "Nama program")}
                      {textField("activityName", "Nama kegiatan anggaran")}
                      {textField("subActivity", "Nama subkegiatan")}
                    </div>
                  </details>
                </section>
              </>}
              {step === "costs" && <>
                <section className="form-section">
                  <h3>SPPD dan anggaran</h3>
                  <div className="form-grid">
                    <Field label="Nomor SPPD">
                      <input
                        value={form.sppdNo}
                        maxLength={250}
                        onChange={(e) => patch({ sppdNo: e.target.value })}
                      />
                    </Field>
                    <Field label="Tanggal SPPD">
                      <ArchiveDateInput
                        value={data.sppdDate}
                        onChange={(value) => patchData({ sppdDate: value })}
                      />
                    </Field>
                    <AccountCodeField value={form.account} options={suggestions.accounts}
                      onChange={account => patch({ account })} className="span-2" />
                  </div>
                </section>
                <section className="form-section">
                  <h3>Komponen biaya</h3>
                  <Field label="Perhitungan uang harian">
                    <CustomSelect aria-label="Perhitungan uang harian" value={data.dailyRateMode}
                      onValueChange={value => patchData({ dailyRateMode: value as Lampiran6["dailyRateMode"] })}>
                      <SelectOption value="auto">Otomatis berdasarkan asal dan tujuan</SelectOption>
                      <SelectOption value="dalam-kota">Dalam kota lebih dari 8 jam</SelectOption>
                      <SelectOption value="dalam-kota-singkat">Dalam kota sampai 8 jam · uang harian nihil</SelectOption>
                      <SelectOption value="diklat">Diklat</SelectOption>
                      <SelectOption value="manual">Manual sesuai arsip</SelectOption>
                    </CustomSelect>
                  </Field>
                  {automaticDaily && <p className="field-hint daily-allowance-hint" role="status">
                    {dailyAllowance.rate === null ? dailyAllowance.reason : `${money(dailyAllowance.rate)}/hari × ${data.claimedDays ?? "jumlah"} hari pada rekap.`}
                    {" "}Acuan regional Perpres 72/2025; sesuaikan dengan ketentuan instansi melalui mode manual.
                  </p>}
                  <div className="lampiran-cost-grid">
                    <div className="cost-grid-heading">Komponen</div>
                    <div className="cost-grid-heading">Tarif per hari</div>
                    <div className="cost-grid-heading">Total (Rp)</div>
                    <div className="lampiran-cost-row">
                      <strong>Uang harian</strong>
                      <NumberField
                        readOnly={automaticDaily}
                        label="Uang harian per hari"
                        compact
                        value={data.dailyRate}
                        onChange={(v) => patchRate("dailyRate", v)}
                      />
                      <NumberField
                        readOnly={automaticDaily}
                        label="Total uang harian"
                        compact
                        value={data.dailyTotal}
                        onChange={(v) => patchData({ dailyTotal: v })}
                      />
                    </div>
                    <div className="lampiran-cost-row">
                      <strong>
                        Representasi
                        <span className="cost-eligibility">Hanya untuk kepala bidang.</span>
                      </strong>
                      <NumberField
                        label="Representasi per hari"
                        compact
                        value={data.representationRate}
                        onChange={(v) => patchRate("representationRate", v)}
                      />
                      <NumberField
                        label="Total representasi"
                        compact
                        value={data.representationTotal}
                        onChange={(v) => patchData({ representationTotal: v })}
                      />
                    </div>
                    {(
                      [
                        ["lodgingCost", "Penginapan"],
                        ["landCost", "Transport darat"],
                        ["waterCost", "Transport air"],
                        ["airCost", "Transport udara"],
                      ] as const
                    ).map(([key, label]) => (
                      <div className="lampiran-cost-row" key={key}>
                        <strong>{label}{key === "lodgingCost" && data.lodgingMode === "thirty-percent" && <button type="button" className="cost-daily-setup" onClick={() => goStep("evidence")}>{lodgingAllowanceDescription(data)}</button>}</strong>
                        <span className="muted cost-no-rate" aria-hidden="true">
                          —
                        </span>
                        <NumberField
                          compact
                          label={`Biaya ${label.toLowerCase()}`}
                          readOnly={key === "lodgingCost" && data.lodgingMode === "thirty-percent"}
                          value={data[key]}
                          onChange={(value) => patchData({ [key]: value })}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="field-hint daily-allowance-hint">
                    Total harian = tarif × jumlah hari pada rekap. Pilih mode manual untuk menyesuaikan dengan arsip.
                  </p>
                  <div className="recap-additional-section">
                    <h4>Detail biaya tambahan</h4>
                    <AdditionalCostFields value={data.additionalCosts} personName={person.name} onChange={additionalCosts => patchData({ additionalCosts })} />
                  </div>
                  <div className="cost-total">
                    <span>Total biaya</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <div className="form-grid">
                    <NumberField
                      label="Total rincian pada sumber"
                      value={data.recordedTotal}
                      onChange={(v) => patchData({ recordedTotal: v })}
                    />
                    <NumberField
                      label="Total kuitansi"
                      value={data.receiptTotal}
                      onChange={(v) => patchData({ receiptTotal: v })}
                    />
                  </div>
                  <button
                    className="format-switch"
                    type="button"
                    onClick={() =>
                      patchData({ recordedTotal: total })
                    }
                  >
                    Isi total rincian dengan jumlah komponen
                  </button>
                  <p className="field-hint">
                    Total kuitansi mengikuti dokumen dan tidak otomatis menandai
                    pembayaran lunas. Rekap realisasi memakai jumlah komponen
                    biaya.
                  </p>
                </section>
                <ReviewNotes notes={reviews} />
              </>}
              {step === "evidence" && <>
                <section className="form-section">
                  <div className="section-heading">
                    <div>
                      <h3>Penginapan</h3>
                      {data.lodgingMode !== "thirty-percent" && (
                        <p className="section-note">
                          Detail bukti hotel; nominalnya tidak ditambahkan
                          lagi ke komponen biaya.
                        </p>
                      )}
                    </div>
                    {data.lodgingMode !== "thirty-percent" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          patchData({
                            lodgings: [...data.lodgings, lodgingSchema.parse({})],
                          })
                        }
                      >
                        <Plus /> Penginapan
                      </Button>
                    )}
                  </div>
                  <LodgingAllowanceFields data={data} onChange={patchData} />
                  {data.lodgingMode !== "thirty-percent" && <>
                  {data.lodgings.length === 0 && (
                    <p className="note-box">Belum ada data penginapan.</p>
                  )}
                  {data.lodgings.map((hotel, index) => (
                    <EvidenceBlock
                      key={lodgingRows.keys[index]}
                      title={`Penginapan ${index + 1}`}
                      onRemove={() => {
                        lodgingRows.remove(index);
                        patchData({ lodgings: data.lodgings.filter((_, i) => i !== index) });
                      }}
                    >
                      <LodgingFields
                        value={hotel}
                        onChange={(changes) =>
                          patchData({
                            lodgings: data.lodgings.map((item, i) =>
                              i === index ? { ...item, ...changes } : item,
                            ),
                          })
                        }
                      />
                    </EvidenceBlock>
                  ))}
                  </>}
                </section>
                <section className="form-section">
                  <div className="section-heading">
                    <div>
                      <h3>Transport darat</h3>
                      <p className="section-note">
                        Detail kendaraan atau penyedia jasa pada bukti
                        perjalanan.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        patchData({
                          groundTransports: [
                            ...data.groundTransports,
                            groundTransportSchema.parse({}),
                          ],
                        })
                      }
                    >
                      <Plus /> Transport
                    </Button>
                  </div>
                  {data.groundTransports.map((transport, index) => (
                    <EvidenceBlock
                      key={transportRows.keys[index]}
                      title={`Transport darat ${index + 1}`}
                      onRemove={() => {
                        transportRows.remove(index);
                        patchData({ groundTransports: data.groundTransports.filter((_, i) => i !== index) });
                      }}
                    >
                      <GroundFields
                        value={transport}
                        onChange={(changes) =>
                          patchData({
                            groundTransports: data.groundTransports.map(
                              (item, i) =>
                                i === index ? { ...item, ...changes } : item,
                            ),
                          })
                        }
                      />
                    </EvidenceBlock>
                  ))}
                </section>
                <FlightCostFields data={data} onChange={patchData} />
              </>}
              {step === "review" && <>
                <RecapLedger
                  data={data}
                  total={total}
                  facts={[
                    ["Pegawai", person.name],
                    ["Nomor ST", form.sptNo],
                    ["Pelaksanaan", form.startDate && form.endDate ? `${dateText(form.startDate)} – ${dateText(form.endDate)}` : ""],
                    ["Tujuan", form.destination],
                  ]}
                />
                <section className="form-section">
                  <h3>Keterangan arsip</h3>
                  <div className="form-grid">
                    {needsCorrectionReason && (
                      <Field label="Alasan perubahan" required className="span-2">
                        <textarea
                          required
                          rows={2}
                          value={form.correctionReason}
                          maxLength={1000}
                          onChange={(e) =>
                            patch({ correctionReason: e.target.value })
                          }
                        />
                      </Field>
                    )}
                    <Field label="Keterangan" className="span-2">
                      <textarea
                        rows={3}
                        value={form.notes}
                        maxLength={10000}
                        onChange={(e) => patch({ notes: e.target.value })}
                        placeholder="Misalnya penginapan 30% atau keterangan pada rekap"
                      />
                    </Field>
                    <Field label="Lokasi berkas fisik (opsional)" className="span-2">
                      <input
                        value={form.physicalLocation}
                        maxLength={250}
                        onChange={(e) =>
                          patch({ physicalLocation: e.target.value })
                        }
                      />
                    </Field>
                    <NumberField
                      label="Sudah dibayar"
                      value={form.paid}
                      onChange={(v) => patch({ paid: v })}
                      hint="Isi hanya jika status pembayaran diketahui; terpisah dari total kuitansi."
                    />
                    {textField(
                      "sourceNo",
                      "Nomor urut pada rekap",
                      "Opsional.",
                    )}
                  </div>
                  <div className="inline-note">
                    <Info size={16} />
                    <span>
                      PDF, foto, dan catatan berkas fisik boleh ditambahkan jika diperlukan.
                    </span>
                  </div>
                </section>
                <ReviewNotes notes={reviews} />
                {data.sourceIssues.length > 0 && (
                  <details className="source-review">
                    <summary>
                      Catatan pemeriksaan dari Excel sumber (
                      {data.sourceIssues.length})
                    </summary>
                    <ReviewNotes notes={data.sourceIssues} />
                  </details>
                )}
              </>}
            </div>
            </div>
            <div className="form-footer step-foot">
              <ErrorMessage message={error} />
              <div className="footer-actions">
                <div className="form-step-meta step-meta" aria-live="polite">
                  <span className="step-status" data-complete={!savingDraft || undefined}>{savingDraft ? "Draft" : "Lengkap"}</span>
                  <strong className="step-total">{money(total)}</strong>
                  <span className="step-meta-note">
                    {dirty
                      ? "Perubahan belum disimpan"
                      : savingDraft
                        ? "Lengkap setelah ada biaya tercatat"
                        : "Kolom bertanda * wajib diisi"}
                  </span>
                </div>
                <div className="form-action-buttons">
                  {onDraftSave ? (
                    // Rincian peserta: jalan pulang ke rekap bersama berada di samping Terapkan, mudah terlihat.
                    <Button
                      type="button"
                      variant="outline"
                      className="rincian-back"
                      disabled={busy}
                      onClick={() => close()}
                    >
                      <ArrowLeft /> {backLabel}
                    </Button>
                  ) : previous ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      aria-label="Kembali"
                      onClick={() => goStep(previous)}
                    >
                      <ArrowLeft /> <span className="form-action-label">Kembali</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => close()}
                    >
                      Batal
                    </Button>
                  )}
                  {onDraftSave ? saveButton : advanceFirst ? [saveButton, nextButton] : [nextButton, saveButton]}
                </div>
              </div>
            </div>
        </form>
      </DialogContent>
    </Dialog>
    {discard.dialog}
  </>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  step = "1",
  readOnly = false,
  compact = false,
  className = "",
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  step?: string;
  readOnly?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Field
      label={label}
      hint={hint}
      className={`${compact ? "compact-number-field" : ""} ${className}`}
    >
      <input
        aria-label={label}
        readOnly={readOnly}
        type="number"
        min="0"
        max="1000000000000"
        step={step}
        inputMode={step === "1" ? "numeric" : "decimal"}
        value={value ?? ""}
        placeholder="Belum dicatat"
        // Roda tetikus tidak boleh diam-diam mengubah nominal yang sedang difokus.
        onWheel={(e) => e.currentTarget.blur()}
        onChange={(e) => onChange(numberValue(e.target.value))}
      />
    </Field>
  );
}
export function EvidenceBlock({
  title,
  onRemove,
  children,
  status,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
  status?: React.ReactNode;
}) {
  return (
    <div className="evidence-block">
      <div className="section-heading">
        <h4>{title}</h4>
        {status}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Hapus ${title.toLowerCase()}`}
        >
          <Trash2 size={15} />
        </Button>
      </div>
      {children}
    </div>
  );
}
export function LodgingFields({
  value,
  onChange,
}: {
  value: Lodging;
  onChange: (value: Partial<Lodging>) => void;
}) {
  function updateCalculation(changes: Partial<Pick<Lodging, "days" | "dailyRate">>) {
    const next = { ...value, ...changes };
    onChange({
      ...changes,
      total: next.days !== null && next.dailyRate !== null
        ? next.days * next.dailyRate
        : null,
    });
  }
  return (
    <div className="form-grid">
      {(
        [
          ["name", "Nama hotel"],
          ["room", "Nomor / jenis kamar"],
          ["reference", "Nomor referensi hotel"],
        ] as const
      ).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          className={key === "name" ? "span-2" : ""}
        >
          <input
            value={value[key]}
            maxLength={1000}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
        </Field>
      ))}
      <Field label="Tanggal check-in">
        <ArchiveDateInput
          value={value.checkIn}
          onChange={(v) => onChange({ checkIn: v })}
        />
      </Field>
      <Field label="Tanggal check-out">
        <ArchiveDateInput
          value={value.checkOut}
          onChange={(v) => onChange({ checkOut: v })}
        />
      </Field>
      <NumberField
        label="Jumlah hari penginapan"
        value={value.days}
        onChange={(v) => updateCalculation({ days: v })}
      />
      <NumberField
        label="Biaya hotel per hari"
        value={value.dailyRate}
        onChange={(v) => updateCalculation({ dailyRate: v })}
      />
      <Field label="Aplikasi / tempat pemesanan hotel">
        <input
          value={value.application}
          maxLength={1000}
          onChange={(e) => onChange({ application: e.target.value })}
        />
      </Field>
      <Field label="Order ID / PO hotel">
        <input
          value={value.orderId}
          maxLength={1000}
          onChange={(e) => onChange({ orderId: e.target.value })}
        />
      </Field>
      <NumberField
        className="span-2"
        label="Total pada bukti hotel"
        readOnly
        hint="Otomatis: biaya hotel per hari × jumlah hari penginapan."
        value={value.total}
        onChange={(v) => onChange({ total: v })}
      />
    </div>
  );
}
export function GroundFields({
  value,
  onChange,
}: {
  value: GroundTransport;
  onChange: (value: Partial<GroundTransport>) => void;
}) {
  function updateFuel(changes: Partial<Pick<GroundTransport, "fuelPricePerLiter" | "fuelLiters">>) {
    const next = { ...value, ...changes };
    onChange({ ...changes, total: next.fuelPricePerLiter !== null && next.fuelLiters !== null
      ? Math.round(next.fuelPricePerLiter * next.fuelLiters) : null });
  }
  return (
    <div className="form-grid">
      <VehicleIdentityFields value={value} onChange={onChange} />
      <NumberField label="Harga per liter (Rp)" value={value.fuelPricePerLiter}
        onChange={fuelPricePerLiter => updateFuel({fuelPricePerLiter})} hint="Isi harga BBM per liter sesuai bukti pembelian." />
      <DecimalField label="Jumlah liter BBM" value={value.fuelLiters}
        onChange={fuelLiters => updateFuel({fuelLiters})} hint="Boleh memakai koma atau titik, misalnya 38,98 liter." />
      <NumberField
        className="span-2"
        label="Total pada bukti transport darat"
        readOnly={value.fuelPricePerLiter !== null || value.fuelLiters !== null}
        hint="BBM: harga per liter × jumlah liter, dibulatkan ke rupiah. Transport tanpa BBM dapat diisi sesuai bukti."
        value={value.total}
        onChange={(v) => onChange({ total: v })}
      />
    </div>
  );
}
export function ReviewNotes({ notes }: { notes: string[] }) {
  return notes.length ? (
    <div className="lampiran-review">
      <strong>Perlu diperiksa terhadap arsip sumber</strong>
      <ul>
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </div>
  ) : null;
}

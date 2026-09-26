"use client";
import { OnboardingHint } from "./onboarding";
import { Combobox } from "./ui/combobox";
import DestinationFields from "./destination-fields";
import AccountCodeField from "./account-code-field";
import FundTrackField from "./fund-track-field";
import { formatDestinations, tripDestinations } from "@/lib/destinations";
import type { TripSuggestions } from "@/lib/trip-suggestions";
import { CustomSelect, SelectOption } from "./ui/select";
import { useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Info,
  LoaderCircle,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import type { RailStatus } from "./form-rail";
import { useDiscardConfirm } from "./discard-confirm";
import { Button } from "./ui/button";
import { Field, ErrorMessage, advanceOnEnter, api } from "./fields";
import ArchiveDateInput from "./archive-date-input";
import Lampiran6Form from "./lampiran6-form";
import BatchRecapForm from "./batch-recap-form";
import { newBatchRow, resumeBatch, type BatchRecapState } from "@/lib/batch-recap";
import type { Employee } from "@/lib/employees";
import {
  type Trip,
  type TripInput,
  categories,
  totalCost,
  money,
  isComplete,
  tripSchema,
} from "@/lib/model";

// Sama dengan formulir rekap: langkah sebagai teks di atas, satu langkah per layar.
const generalSections = [
  ["trip", "Perjalanan", "Perjalanan apa yang diarsipkan?", "Satu arsip untuk seluruh peserta. Salin dari Surat Tugas atau dokumen lama."],
  ["people", "Peserta", "Siapa saja pesertanya?", "Tambahkan setiap pegawai yang ikut. Pilih dari daftar agar NIP terisi otomatis."],
  ["costs", "Biaya & keterangan", "Berapa biayanya?", "Gunakan nominal pada dokumen lama; kosongkan yang belum diketahui."],
] as const;
type GeneralSection = (typeof generalSections)[number][0];
function generalSectionFor(path: PropertyKey[]): GeneralSection {
  const field = String(path[0]);
  if (field === "participants") return "people";
  if (["costs", "paid", "notes", "physicalLocation", "activity", "correctionReason"].includes(field)) return "costs";
  return "trip";
}

function GeneralTripForm({
  trip,
  departments,
  knownPeople,
  suggestions,
  onClose,
  onSave,
  onSwitch,
}: {
  trip: Trip | null;
  departments: string[];
  knownPeople: Employee[];
  suggestions: TripSuggestions;
  onClose: () => void;
  onSave: (t: Trip) => void;
  onSwitch?: () => void;
}) {
  const [form, setForm] = useState<TripInput>(
    trip ? { ...trip, correctionReason: "" } : {
      title: "",
      sptNo: "",
      sppdNo: "",
      destination: "",
      department: departments[0] ?? "",
      startDate: "",
      endDate: "",
      participants: [],
      costs: [],
      paid: null,
      notes: "",
      activity: "",
      account: "",
      fundTrack: "",
      physicalLocation: "",
      requiredDocs: [],
      correctionReason: "",
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [person, setPerson] = useState("");
  const [errorSection, setErrorSection] = useState<GeneralSection>();
  const [step, setStep] = useState<GeneralSection>("trip");
  const bodyRef = useRef<HTMLDivElement>(null);
  function go(next: GeneralSection) {
    setStep(next);
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0 });
      bodyRef.current?.querySelector<HTMLElement>(".step-head h3")?.focus({ preventScroll: true });
    });
  }
  const needsCorrectionReason = trip !== null && isComplete(trip);
  const savingDraft = !isComplete(form);
  function patch(p: Partial<TripInput>) {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
    setError("");
    setErrorSection(undefined);
  }
  function addPerson() {
    const name = person.trim();
    if (!name) return;
    const known = knownPeople.find((p) => p.name === name);
    patch({
      participants: [
        ...form.participants,
        {
          id: crypto.randomUUID(),
          name,
          nip: known?.nip ?? "",
          position: known?.position ?? "",
          department: known?.department || form.department,
        },
      ],
    });
    setPerson("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorSection(undefined);
    const parsed = tripSchema.safeParse(form);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const section = generalSectionFor(issue.path);
      setError(issue.message);
      setErrorSection(section);
      setStep(section);
      return;
    }
    setBusy(true);
    try {
      const t = await api<Trip>(
        trip ? `/api/archives/${trip.id}` : "/api/archives",
        {
          method: trip ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...parsed.data, version: trip?.version }),
        },
      );
      onSave(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const discard = useDiscardConfirm();
  const close = () => {
    if (busy) return;
    if (dirty) discard.ask(onClose);
    else onClose();
  };
  const total = totalCost(form);
  const sectionStatus: Record<GeneralSection, [RailStatus, string]> = {
    trip: form.title.trim().length >= 3 && form.destination.trim().length >= 2 && form.startDate && form.endDate && form.department.trim()
      ? ["done", form.destination] : ["required", "Wajib diisi"],
    people: form.participants.length ? ["done", `${form.participants.length} peserta`] : ["required", "Minimal satu peserta"],
    costs: needsCorrectionReason && !form.correctionReason.trim() ? ["required", "Alasan perubahan wajib"]
      : total === null ? ["open", "Belum ada biaya"] : ["done", money(total)],
  };
  if (errorSection) sectionStatus[errorSection] = ["error", "Perlu diperbaiki"];
  const stepIndex = generalSections.findIndex(([key]) => key === step);
  const [, , question, purpose] = generalSections[stepIndex];
  const next = generalSections[stepIndex + 1];
  const previous = generalSections[stepIndex - 1];
  // Arsip baru dituntun maju; arsip yang diedit bisa langsung disimpan dari langkah mana pun.
  const advanceFirst = Boolean(next) && !trip;
  const saveButton = (
    <Button key="save" type="submit" variant={advanceFirst ? "outline" : "default"} disabled={busy}>
      {busy && <LoaderCircle className="animate-spin" />}
      {busy
        ? "Menyimpan…"
        : savingDraft
          ? "Simpan draft"
          : trip ? "Simpan perubahan" : "Simpan arsip"}
    </Button>
  );
  const nextButton = next && (
    <Button key="next" type="button" variant={advanceFirst ? "default" : "outline"} disabled={busy}
      aria-label={`Lanjut ke ${next[1].toLowerCase()}`} onClick={() => go(next[0])}>
      <span>Lanjut<span className="form-action-label">: {next[1]}</span></span> <ArrowRight />
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
        className="form-dialog lampiran-dialog rekap-form step-dialog"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <header className="step-top">
          <div className="step-title">
            <span className="step-kicker">{trip ? trip.code : "Arsip gabungan"}</span>
            <DialogTitle>{trip ? (needsCorrectionReason ? "Edit perjalanan" : "Lengkapi draft") : "Tambah perjalanan"}</DialogTitle>
            <DialogDescription className={needsCorrectionReason ? "step-note" : "sr-only"}>
              {needsCorrectionReason ? "Perubahan pada arsip lengkap perlu disertai alasan." : "Satu arsip untuk seluruh peserta perjalanan."}
            </DialogDescription>
          </div>
          {onSwitch && (
            <div className="step-modes">
              <button
                className="step-switch"
                type="button"
                title="Satu rekap untuk setiap pegawai"
                onClick={() => {
                  if (dirty) discard.ask(onSwitch);
                  else onSwitch();
                }}
              >
                Rekap per pegawai
              </button>
            </div>
          )}
        </header>
        <nav className="step-nav" aria-label="Langkah isian arsip">
          {generalSections.map(([key, label], index) => {
            const [status, note] = sectionStatus[key];
            return (
              <button key={key} type="button" data-status={status} aria-current={key === step ? "step" : undefined}
                disabled={busy} onClick={() => go(key)}>
                <i aria-hidden="true">{status === "done" && key !== step ? <Check size={11} strokeWidth={3.5} /> : status === "error" ? "!" : index + 1}</i>
                {label}
                <span className="sr-only">, {note}</span>
              </button>
            );
          })}
        </nav>
        <div className="step-progress" aria-hidden="true">
          <span>Langkah {stepIndex + 1} dari {generalSections.length} · {generalSections[stepIndex][1]}</span>
          <div><i style={{ width: `${((stepIndex + 1) / generalSections.length) * 100}%` }} /></div>
        </div>
        <form onSubmit={save} onKeyDown={advanceOnEnter} className="editor-form step-main" noValidate>
          <div className="step-body" ref={bodyRef}>
            <div className="step-column" key={step}>
              <header className="step-head">
                <h3 tabIndex={-1}>{question}</h3>
                <p>{purpose}</p>
              </header>
              {step === "trip" && <>
                {!trip && <OnboardingHint id="create-archive" />}
                <section className="form-section">
              <div className="form-grid">
                <Field label="Uraian perjalanan" required className="span-2">
                  <Combobox multiline aria-label="Uraian perjalanan" required maxLength={3000}
                    placeholder="Pilih kegiatan tersimpan atau ketik uraian perjalanan" value={form.title}
                    options={suggestions.purposes} onValueChange={title => patch({title})} />
                </Field>
                <AccountCodeField value={form.account} options={suggestions.accounts}
                  onChange={account => patch({ account })} className="span-2" />
                <FundTrackField value={form.fundTrack ?? ""} trip={form} onChange={fundTrack => patch({ fundTrack })} />
                <DestinationFields values={tripDestinations(form)} options={suggestions.destinations}
                  onChange={destinations => patch({destinations, destination: formatDestinations(destinations)})} />
                <Field label="Bidang penanggung jawab" required>
                  <CustomSelect
                    value={form.department}
                    onValueChange={(value) => patch({ department: value })}
                  >
                    {[...new Set([...departments, form.department])]
                      .filter(Boolean)
                      .map((d) => (
                        <SelectOption key={d}>{d}</SelectOption>
                      ))}
                  </CustomSelect>
                </Field>
                <Field label="Tanggal berangkat" required>
                  <ArchiveDateInput
                    range={{ from: form.startDate, to: form.endDate }}
                    required
                    value={form.startDate}
                    onChange={(v) =>
                      patch({
                        startDate: v,
                        endDate:
                          v && (!form.endDate || form.endDate < v)
                            ? v
                            : form.endDate,
                      })
                    }
                  />
                </Field>
                <Field label="Tanggal pulang" required>
                  <ArchiveDateInput
                    range={{ from: form.startDate, to: form.endDate }}
                    required
                    value={form.endDate}
                    onChange={(v) => patch({ endDate: v })}
                  />
                </Field>
                <Field label="Nomor SPT">
                  <Combobox aria-label="Nomor SPT" maxLength={250} placeholder="Pilih ST tersimpan atau ketik nomor baru"
                    value={form.sptNo} options={suggestions.letters} onValueChange={sptNo => patch({sptNo})} />
                </Field>
                <Field label="Nomor SPPD">
                  <input
                    placeholder="Sesuai surat asli, jika tersedia"
                    value={form.sppdNo}
                    onChange={(e) => patch({ sppdNo: e.target.value })}
                  />
                </Field>
              </div>
                </section>
              </>}
              {step === "people" && (
                <section className="form-section">
              <div className="person-add">
                <Combobox
                  aria-label="Nama peserta"
                  placeholder="Cari atau ketik nama pegawai"
                  value={person}
                  onValueChange={setPerson}
                  options={knownPeople.map(p => ({value: p.name, description: [p.nip, p.rank, p.position, p.department].filter(Boolean).join(" · ")}))}
                  emptyMessage="Pegawai belum ada di daftar."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPerson();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addPerson}
                  disabled={!person.trim()}
                >
                  <Plus /> Tambah
                </Button>
              </div>
              {form.participants.length === 0 && (
                <p className="field-hint">
                  Tambahkan seluruh pegawai yang ikut dalam perjalanan ini.
                </p>
              )}
              <div className="participant-editor">
                {form.participants.map((p, i) => (
                  <div className="participant-row" key={p.id}>
                    <div className="avatar sm">
                      {p.name
                        .split(" ")
                        .slice(0, 2)
                        .map((x) => x[0])
                        .join("")}
                    </div>
                    <div className="participant-inputs">
                      <input
                        aria-label={`Nama peserta ${i + 1}`}
                        value={p.name}
                        onChange={(e) =>
                          patch({
                            participants: form.participants.map((x) =>
                              x.id === p.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={`NIP ${p.name}`}
                        placeholder="NIP (opsional)"
                        value={p.nip}
                        onChange={(e) =>
                          patch({
                            participants: form.participants.map((x) =>
                              x.id === p.id ? { ...x, nip: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Hapus peserta ${p.name}`}
                      onClick={() =>
                        patch({
                          participants: form.participants.filter(
                            (x) => x.id !== p.id,
                          ),
                          costs: form.costs.filter(
                            (c) => c.participantId !== p.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
                </section>
              )}
              {step === "costs" && <>
                <section className="form-section">
              <div className="section-heading">
                <h3>Komponen biaya</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch({
                      costs: [
                        ...form.costs,
                        {
                          id: crypto.randomUUID(),
                          category: "Biaya lainnya",
                          label: "",
                          participantId: "shared",
                          amount: 0,
                        },
                      ],
                    })
                  }
                >
                  <Plus /> Tambah biaya
                </Button>
              </div>
              {form.costs.map((c, i) => (
                <div className="cost-editor" key={c.id}>
                  <Field label={`Komponen ${i + 1}`}>
                    <CustomSelect
                      value={c.category}
                      onValueChange={(value) =>
                        patch({
                          costs: form.costs.map((x) =>
                            x.id === c.id
                              ? {
                                  ...x,
                                  category: value as typeof c.category,
                                }
                              : x,
                          ),
                        })
                      }
                    >
                      {categories.map((v) => (
                        <SelectOption key={v}>{v}</SelectOption>
                      ))}
                    </CustomSelect>
                  </Field>
                  <Field label="Dibebankan kepada">
                    <CustomSelect
                      value={c.participantId}
                      onValueChange={(value) =>
                        patch({
                          costs: form.costs.map((x) =>
                            x.id === c.id
                              ? { ...x, participantId: value }
                              : x,
                          ),
                        })
                      }
                    >
                      <SelectOption value="shared">Bersama / total perjalanan</SelectOption>
                      {form.participants.map((p) => (
                        <SelectOption key={p.id} value={p.id}>
                          {p.name}
                        </SelectOption>
                      ))}
                    </CustomSelect>
                  </Field>
                  <Field label="Jumlah (Rp)">
                    <input
                      aria-label={`Jumlah biaya ${i + 1}`}
                      type="number"
                      min="0"
                      max="1000000000000"
                      step="1"
                      value={c.amount}
                      onChange={(e) =>
                        patch({
                          costs: form.costs.map((x) =>
                            x.id === c.id
                              ? { ...x, amount: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Hapus biaya ${i + 1}`}
                    onClick={() =>
                      patch({ costs: form.costs.filter((x) => x.id !== c.id) })
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                  <input
                    className="cost-note"
                    aria-label={`Keterangan biaya ${i + 1}`}
                    placeholder="Keterangan, misalnya total biaya dari rekap tahun 2024"
                    value={c.label}
                    onChange={(e) =>
                      patch({
                        costs: form.costs.map((x) =>
                          x.id === c.id ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <div className="cost-total">
                <span>Total realisasi</span>
                <strong>{money(totalCost(form))}</strong>
              </div>
              <div className="form-grid mt-4">
                <Field
                  label="Jumlah sudah dibayar (Rp)"
                  hint="Kosong berarti status pembayaran belum diketahui."
                >
                  <input
                    type="number"
                    min="0"
                    max="1000000000000"
                    placeholder="Belum dicatat"
                    value={form.paid ?? ""}
                    onChange={(e) =>
                      patch({
                        paid:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Lokasi berkas fisik (opsional)">
                  <input
                    placeholder="Contoh: Lemari A, map perjalanan 2024"
                    value={form.physicalLocation}
                    onChange={(e) =>
                      patch({ physicalLocation: e.target.value })
                    }
                  />
                </Field>
                <Field label="Kegiatan / subkegiatan">
                  <input
                    value={form.activity}
                    onChange={(e) => patch({ activity: e.target.value })}
                    placeholder="Opsional"
                  />
                </Field>
                <Field label="Catatan" className="span-2">
                  <textarea
                    rows={3}
                    placeholder="Keterangan dari arsip, kekurangan dokumen, atau informasi tambahan"
                    value={form.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </Field>
              </div>

              {needsCorrectionReason && (
                <Field label="Alasan perubahan" required>
                  <textarea
                    rows={2}
                    required
                    placeholder="Contoh: Melengkapi nominal dari kuitansi asli"
                    value={form.correctionReason}
                    onChange={(e) =>
                      patch({ correctionReason: e.target.value })
                    }
                  />
                </Field>
              )}
                </section>
                <div className="inline-note">
                  <Info size={16} />
                  <span>
                    PDF, foto, dan catatan berkas fisik boleh ditambahkan jika diperlukan.
                  </span>
                </div>
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
                    ? "Ada isian yang belum disimpan"
                    : `${form.participants.length} peserta`}
                </span>
              </div>
              <div className="form-action-buttons">
                {previous ? (
                  <Button type="button" variant="ghost" disabled={busy} aria-label="Kembali" onClick={() => go(previous[0])}>
                    <ArrowLeft /> <span className="form-action-label">Kembali</span>
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={close} disabled={busy}>
                    Batal
                  </Button>
                )}
                {advanceFirst ? [saveButton, nextButton] : [nextButton, saveButton]}
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

export default function TripForm(
  props: Omit<React.ComponentProps<typeof GeneralTripForm>, "onSwitch"> & { onSaveBatch: (trips: Trip[]) => void },
) {
  const [format, setFormat] = useState(
    props.trip ? (props.trip.lampiran6 ? "lampiran" : "general") : "lampiran",
  );
  const [singleDraft, setSingleDraft] = useState<TripInput>();
  const [singleBaseline, setSingleBaseline] = useState<TripInput>();
  const [batchState, setBatchState] = useState<BatchRecapState>();
  if (format === "batch" && batchState) return <BatchRecapForm
    initialState={batchState} knownPeople={props.knownPeople} departments={props.departments} suggestions={props.suggestions}
    onClose={props.onClose} onSaved={props.onSaveBatch}
    onSingle={state => {
      const input = state.rows.find(row => row.selected)?.input ?? newBatchRow(state.shared, {
        id: singleDraft!.participants[0].id, name: "", nip: "", position: "", rank: "", department: singleDraft!.department,
      }).input;
      setBatchState(state); setSingleDraft(input); setSingleBaseline(structuredClone(input)); setFormat("lampiran");
    }}
  />;
  return format === "lampiran" ? (
    <Lampiran6Form
      {...props}
      initialDraft={singleDraft}
      onMultiple={props.trip ? undefined : input => {
        setSingleDraft(input);
        setBatchState(resumeBatch(input, props.knownPeople, batchState, singleBaseline));
        setFormat("batch");
      }}
      onSwitch={props.trip ? undefined : () => setFormat("general")}
    />
  ) : (
    <GeneralTripForm
      {...props}
      onSwitch={props.trip ? undefined : () => setFormat("lampiran")}
    />
  );
}

"use client";
import { OnboardingHint } from "./onboarding";
import { Combobox } from "./ui/combobox";
import DestinationFields from "./destination-fields";
import AccountCodeField from "./account-code-field";
import FundTrackField from "./fund-track-field";
import { formatDestinations, tripDestinations } from "@/lib/destinations";
import type { TripSuggestions } from "@/lib/trip-suggestions";
import { CustomSelect, SelectOption } from "./ui/select";
import { useState } from "react";
import {
  Plus,
  Trash2,
  Users,
  MapPin,
  Wallet,
  Info,
  LoaderCircle,
} from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { FormRail, RailSlip, RailStepHead, RailStepLabel, useSectionSpy, type RailStatus } from "./form-rail";
import { useDiscardConfirm } from "./discard-confirm";
import { Button } from "./ui/button";
import { Field, ErrorMessage, api } from "./fields";
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

const generalSections = [
  ["trip", "Informasi perjalanan"],
  ["people", "Peserta"],
  ["costs", "Biaya & keterangan"],
] as const;
type GeneralSection = (typeof generalSections)[number][0];
const generalSectionKeys = generalSections.map(([key]) => key);
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
  const { bodyRef, active, jump } = useSectionSpy(generalSectionKeys);
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
      jump(section);
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
  return (<>
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="form-dialog rail-dialog"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="rail-layout">
          {/* Rel kiri: bagian formulir beserta statusnya dan slip total; satu halaman, jadi rel melompat ke bagian. */}
          <FormRail
            kicker={trip ? trip.code : "Arsip gabungan"}
            title={trip ? (needsCorrectionReason ? "Edit perjalanan" : "Lengkapi draft") : "Tambah perjalanan"}
            description={needsCorrectionReason ? "Perubahan pada arsip lengkap perlu disertai alasan." : undefined}
            showDescription
          >
            {onSwitch && (
              <div className="rail-modes">
                <button
                  className="rail-switch"
                  type="button"
                  onClick={() => {
                    if (dirty) discard.ask(onSwitch);
                    else onSwitch();
                  }}
                >
                  <span>Gunakan rekap per pegawai</span><small>Satu rekap untuk setiap pegawai</small>
                </button>
              </div>
            )}
            <nav className="rail-steps" aria-label="Bagian formulir">
              {generalSections.map(([key, label], index) => {
                const [status, note] = sectionStatus[key];
                return (
                  <button key={key} type="button" className="rail-step" data-status={status}
                    aria-current={active === key ? "true" : undefined} onClick={() => jump(key)}>
                    <RailStepLabel index={index} status={status} label={label} note={note} />
                  </button>
                );
              })}
            </nav>
            <RailSlip label="Total realisasi" value={money(total)} empty={total === null} complete={!savingDraft}>
              <p>
                <b>{savingDraft ? "Draft" : "Lengkap"}</b>
                {savingDraft ? "Catat minimal satu biaya agar arsip lengkap." : "Arsip disimpan lengkap."}
              </p>
            </RailSlip>
          </FormRail>
          <form onSubmit={save} className="editor-form rail-main">
            <RailStepHead
              question="Siapa berangkat, ke mana, dan berapa biayanya?"
              purpose="Satu arsip untuk seluruh peserta. Gunakan nominal pada dokumen lama; kosongkan yang belum diketahui."
              describes={!needsCorrectionReason}
            />
            <div className="form-body" ref={bodyRef}>
              {!trip && <OnboardingHint id="create-archive" />}
              <section className="form-section" data-rail-section="trip">
              <h3>
                <MapPin size={17} /> Informasi perjalanan
              </h3>
              <div className="form-grid">
                <Field label="Uraian perjalanan" required className="span-2">
                  <Combobox multiline aria-label="Uraian perjalanan" autoFocus required maxLength={3000}
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
            <section className="form-section" data-rail-section="people">
              <h3>
                <Users size={17} /> Peserta perjalanan{" "}
                <span className="count-badge">{form.participants.length}</span>
              </h3>
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
            <section className="form-section" data-rail-section="costs">
              <div className="section-heading">
                <h3>
                  <Wallet size={17} /> Biaya realisasi
                </h3>
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
          </div>
          <div className="form-footer">
            <ErrorMessage message={error} />
            <div className="footer-actions">
              <div className="form-step-meta">
                <strong className="rail-footer-total">{money(total)}</strong>
                <span>
                  {dirty
                    ? "Ada isian yang belum disimpan"
                    : "Kolom bertanda * wajib diisi"}
                </span>
              </div>
              <div className="form-action-buttons">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={close}
                  disabled={busy}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
                  {busy
                    ? "Menyimpan…"
                    : savingDraft
                      ? "Simpan draft"
                      : trip ? "Simpan perubahan" : "Simpan rekap"}
                </Button>
              </div>
            </div>
          </div>
          </form>
        </div>
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

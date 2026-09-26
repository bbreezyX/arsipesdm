"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { honorariumCategories, honorariumSchema, honorariumTotals, type Honorarium, type HonorariumInput } from "@/lib/honorarium";
import type { Employee } from "@/lib/employees";
import { money } from "@/lib/model";
import { advanceOnEnter, api, ErrorMessage, Field } from "./fields";
import type { RailStatus } from "./form-rail";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CustomSelect, SelectOption } from "./ui/select";

// Sama dengan formulir rekap: langkah sebagai teks di atas, satu langkah per layar.
const honorSections = [
  ["basis", "Dasar SK", "SK apa yang menjadi dasarnya?", "Salin dari SK: jenis honorarium, nomor, unit kerja, dan kegiatan."],
  ["recipient", "Penerima", "Siapa penerimanya?", "Satu rekap untuk satu penerima. Pilih dari daftar pegawai atau isi sesuai SK."],
  ["amount", "Perhitungan", "Berapa honornya?", "Bruto, pajak, dan netto dihitung langsung dari isian, mengikuti format Lampiran 3."],
] as const;
type HonorSection = (typeof honorSections)[number][0];
function honorSectionFor(path: PropertyKey[]): HonorSection {
  const field = String(path[0]);
  if (["recipient", "position", "skPosition", "recipientDepartment", "echelon", "budget"].includes(field)) return "recipient";
  if (["monthlyAmount", "months", "taxMode", "taxAmount", "taxRate", "notes"].includes(field)) return "amount";
  return "basis";
}

export default function HonorariumForm({ initial, employees, onClose, onSaved }: {
  initial: HonorariumInput | Honorarium; employees: Employee[]; onClose: () => void; onSaved: (record: Honorarium) => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [errorSection, setErrorSection] = useState<HonorSection>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [step, setStep] = useState<HonorSection>("basis");
  const bodyRef = useRef<HTMLDivElement>(null);
  function go(next: HonorSection) {
    setStep(next);
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0 });
      bodyRef.current?.querySelector<HTMLElement>(".step-head h3")?.focus({ preventScroll: true });
    });
  }
  const editing = "id" in initial;
  const totals = honorariumTotals(form);
  /* Kicker mengikuti asal formulir: SK yang diedit, SK yang ditambah penerimanya, atau rekap baru. */
  const kicker = editing ? (initial.skNumber || "Rekap honorarium") : initial.skNumber ? `Penerima lain untuk SK ${initial.skNumber}` : "Rekap honorarium baru";
  function patch(values: Partial<HonorariumInput>) { setDirty(true); setError(""); setErrorSection(undefined); setForm(previous => ({ ...previous, ...values })); }
  function close() { if (busy) return; if (dirty) setDiscard(true); else onClose(); }
  function textField(key: keyof HonorariumInput, label: string, required = false, wide = false) {
    return <Field label={label} required={required} className={wide ? "span-2" : ""}>
      {wide ? <textarea rows={2} value={String(form[key] ?? "")} required={required} maxLength={5000} onChange={e => patch({ [key]: e.target.value })} />
        : <input value={String(form[key] ?? "")} required={required} maxLength={5000} onChange={e => patch({ [key]: e.target.value })} />}
    </Field>;
  }
  function numberField(key: "monthlyAmount" | "months" | "taxRate" | "taxAmount" | "budget" | "year", label: string, max: number, min = 0) {
    return <Field label={label} required><input type="number" inputMode={key === "taxRate" ? "decimal" : "numeric"} min={min} max={max} step={key === "taxRate" ? "0.01" : "1"}
      value={form[key] ?? ""} required onWheel={e => e.currentTarget.blur()} onChange={e => patch({ [key]: e.target.value === "" ? null : Number(e.target.value) })} /></Field>;
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = honorariumSchema.safeParse(form);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const section = honorSectionFor(issue.path);
      setError(issue.message); setErrorSection(section); setStep(section);
      return;
    }
    setBusy(true); setError(""); setErrorSection(undefined);
    try {
      const record = await api<Honorarium>(editing ? `/api/honorariums/${initial.id}` : "/api/honorariums", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, ...(editing ? { version: initial.version } : {}) }),
      });
      onSaved(record);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const sectionStatus: Record<HonorSection, [RailStatus, string]> = {
    basis: form.skName.trim() && form.department.trim() && (form.category === "procurement" || form.skNumber.trim()) && form.year
      ? ["done", form.skNumber || honorariumCategories[form.category]] : ["required", "Wajib diisi"],
    recipient: form.recipient.trim() && form.skPosition.trim() && form.recipientDepartment.trim() && (form.category !== "finance" || form.budget !== null)
      ? ["done", form.recipient] : ["required", "Wajib diisi"],
    amount: form.monthlyAmount > 0 && form.months >= 1 ? ["done", `Netto ${money(totals.net)}`] : ["required", "Wajib diisi"],
  };
  if (errorSection) sectionStatus[errorSection] = ["error", "Perlu diperbaiki"];
  const taxLabel = `Pajak${form.taxMode === "percent" ? ` ${form.taxRate.toLocaleString("id-ID")}% dari bruto` : ""}`;
  const stepIndex = honorSections.findIndex(([key]) => key === step);
  const [, , question, purpose] = honorSections[stepIndex];
  const next = honorSections[stepIndex + 1];
  const previous = honorSections[stepIndex - 1];
  // Rekap baru dituntun maju; rekap yang diedit bisa langsung disimpan dari langkah mana pun.
  const advanceFirst = Boolean(next) && !editing;
  const saveButton = <Button key="save" type="submit" variant={advanceFirst ? "outline" : "default"} disabled={busy}>
    {busy && <LoaderCircle className="animate-spin" />}{busy ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan honorarium"}
  </Button>;
  const nextButton = next && <Button key="next" type="button" variant={advanceFirst ? "default" : "outline"} disabled={busy}
    aria-label={`Lanjut ke ${next[1].toLowerCase()}`} onClick={() => go(next[0])}>
    <span>Lanjut<span className="form-action-label">: {next[1]}</span></span> <ArrowRight />
  </Button>;
  return <>
    <Dialog open onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="form-dialog lampiran-dialog rekap-form step-dialog honor-dialog" showCloseButton={!busy} onInteractOutside={e => e.preventDefault()}>
        <header className="step-top">
          <div className="step-title">
            <span className="step-kicker">{kicker}</span>
            <DialogTitle>{editing ? "Edit honorarium" : "Tambah honorarium"}</DialogTitle>
            <DialogDescription className="sr-only">Satu rekap untuk satu penerima. Bruto, pajak, dan netto dihitung dari isian.</DialogDescription>
          </div>
        </header>
        <nav className="step-nav" aria-label="Langkah isian honorarium">
          {honorSections.map(([key, label], index) => {
            const [status, note] = sectionStatus[key];
            return <button key={key} type="button" data-status={status} aria-current={key === step ? "step" : undefined}
              disabled={busy} onClick={() => go(key)}>
              <i aria-hidden="true">{status === "done" && key !== step ? <Check size={11} strokeWidth={3.5} /> : status === "error" ? "!" : index + 1}</i>
              {label}
              <span className="sr-only">, {note}</span>
            </button>;
          })}
        </nav>
        <div className="step-progress" aria-hidden="true">
          <span>Langkah {stepIndex + 1} dari {honorSections.length} · {honorSections[stepIndex][1]}</span>
          <div><i style={{ width: `${((stepIndex + 1) / honorSections.length) * 100}%` }} /></div>
        </div>
        <form className="editor-form step-main" onSubmit={save} onKeyDown={advanceOnEnter} noValidate>
          <div className="step-body" ref={bodyRef}>
            <div className="step-column" key={step}>
              <header className="step-head">
                <h3 tabIndex={-1}>{question}</h3>
                <p>{purpose}</p>
              </header>
              <fieldset disabled={busy} className="honor-fieldset">
                {step === "basis" && <section className="form-section"><div className="form-grid">
                <Field label="Jenis honorarium" required><CustomSelect value={form.category} onValueChange={value => patch({ category: value as HonorariumInput["category"] })}>
                  {Object.entries(honorariumCategories).map(([key, label]) => <SelectOption key={key} value={key}>{label}</SelectOption>)}
                </CustomSelect></Field>
                {numberField("year", "Tahun anggaran", 2100, 2000)}
                {textField("skNumber", "Nomor SK", form.category !== "procurement")}
                {textField("department", "Unit kerja dalam SK", true)}
                {textField("skName", "Nama SK", true, true)}
                {form.category === "finance" && textField("program", "Nama program", false, true)}
                {textField("activity", "Nama kegiatan", false, true)}
                {form.category === "finance" && textField("subActivity", "Nama subkegiatan", false, true)}
              </div></section>}
                {step === "recipient" && <section className="form-section">
                {employees.length > 0 && <Field label="Ambil dari daftar pegawai" hint="Opsional. Nama, jabatan, dan unit kerja tetap dapat disesuaikan untuk rekap ini."><CustomSelect value="" onValueChange={id => {
                  const person = employees.find(p => p.id === id);
                  if (person) patch({ recipient: person.name, position: person.position, recipientDepartment: person.department || form.recipientDepartment });
                }}><SelectOption value="" disabled>Pilih pegawai…</SelectOption>{employees.map(person => <SelectOption key={person.id} value={person.id}>{person.name}{person.department ? ` — ${person.department}` : ""}</SelectOption>)}</CustomSelect></Field>}
                <div className="form-grid">
                  {textField("recipient", "Nama pejabat / penerima", true)}
                  {textField("skPosition", "Jabatan dalam SK", true)}
                  {textField("position", "Jabatan struktural/fungsional")}
                  {textField("recipientDepartment", "Unit kerja penerima", true)}
                  {textField("echelon", "Eselon")}
                  {form.category === "finance" && numberField("budget", "Pagu dana yang dikelola (Rp)", 1_000_000_000_000)}
                </div>
                </section>}
                {step === "amount" && <section className="form-section"><div className="form-grid">
                {numberField("monthlyAmount", "Honor per bulan (Rp)", 1_000_000_000_000)}
                {numberField("months", "Jumlah bulan", 12, 1)}
                <Field label="Cara mengisi pajak"><CustomSelect value={form.taxMode} onValueChange={value => patch({ taxMode: value as HonorariumInput["taxMode"] })}>
                  <SelectOption value="amount">Nominal rupiah</SelectOption><SelectOption value="percent">Persentase dari bruto</SelectOption>
                </CustomSelect></Field>
                {form.taxMode === "percent" ? numberField("taxRate", "Tarif pajak (%)", 100) : numberField("taxAmount", "Pajak (Rp)", 1_000_000_000_000)}
              </div><p className="field-hint">Isi pajak sesuai dokumen. Nilai 0 berarti tanpa potongan; persentase dibulatkan ke rupiah terdekat.</p>
              {textField("notes", "Keterangan", false, true)}
                  {/* Hitungan honor: bruto dikurangi pajak, netto sebagai angka utama. */}
                  <div className="honor-calc" aria-live="polite">
                    <div><span>Honor bruto</span><strong>{money(totals.gross)}</strong></div>
                    <div><span>{taxLabel}</span><strong>− {money(totals.tax)}</strong></div>
                    <div><span>Honor netto</span><strong>{money(totals.net)}</strong></div>
                  </div>
                </section>}
              </fieldset>
            </div>
          </div>
          <div className="form-footer step-foot">
            <ErrorMessage message={error} />
            <div className="footer-actions">
              <div className="form-step-meta step-meta" aria-live="polite">
                <span className="step-meta-label">Honor netto</span>
                <strong className="step-total">{money(totals.net)}</strong>
                <span className="step-meta-note">{dirty ? "Ada isian yang belum disimpan" : "Kolom bertanda * wajib diisi"}</span>
              </div>
              <div className="form-action-buttons">
                {previous
                  ? <Button type="button" variant="ghost" disabled={busy} aria-label="Kembali" onClick={() => go(previous[0])}><ArrowLeft /> <span className="form-action-label">Kembali</span></Button>
                  : <Button type="button" variant="ghost" disabled={busy} onClick={close}>Batal</Button>}
                {advanceFirst ? [saveButton, nextButton] : [nextButton, saveButton]}
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={discard} onOpenChange={setDiscard}>
      <DialogContent>
        <DialogHeader><DialogTitle>Batalkan perubahan?</DialogTitle><DialogDescription>Isian yang belum disimpan akan hilang.</DialogDescription></DialogHeader>
        <div className="honor-dialog-actions"><Button variant="outline" onClick={() => setDiscard(false)}>Lanjutkan mengisi</Button><Button variant="destructive" onClick={onClose}>Buang perubahan</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}

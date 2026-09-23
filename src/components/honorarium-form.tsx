"use client";

import { useState, type FormEvent } from "react";
import { FileText, LoaderCircle, Save, Users, Wallet } from "lucide-react";
import { honorariumCategories, honorariumSchema, honorariumTotals, type Honorarium, type HonorariumInput } from "@/lib/honorarium";
import type { Employee } from "@/lib/employees";
import { money } from "@/lib/model";
import { api, ErrorMessage, Field } from "./fields";
import { FormRail, RailSlip, RailStepHead, RailStepLabel, useSectionSpy, type RailStatus } from "./form-rail";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CustomSelect, SelectOption } from "./ui/select";

const honorSections = [["basis", "Dasar SK"], ["recipient", "Penerima"], ["amount", "Perhitungan"]] as const;
type HonorSection = (typeof honorSections)[number][0];
const honorSectionKeys = honorSections.map(([key]) => key);
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
  const { bodyRef, active, jump } = useSectionSpy(honorSectionKeys);
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
      value={form[key] ?? ""} required onChange={e => patch({ [key]: e.target.value === "" ? null : Number(e.target.value) })} /></Field>;
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = honorariumSchema.safeParse(form);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const section = honorSectionFor(issue.path);
      setError(issue.message); setErrorSection(section); jump(section);
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
  return <>
    <Dialog open onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="form-dialog honor-dialog rail-dialog" showCloseButton={!busy} onInteractOutside={e => e.preventDefault()}>
        <div className="rail-layout">
          {/* Rel kiri: bagian formulir beserta statusnya; slip memuat hitungan honor yang selalu terlihat. */}
          <FormRail kicker={kicker} title={editing ? "Edit honorarium" : "Tambah honorarium"}>
            <nav className="rail-steps" aria-label="Bagian formulir">
              {honorSections.map(([key, label], index) => {
                const [status, note] = sectionStatus[key];
                return <button key={key} type="button" className="rail-step" data-status={status}
                  aria-current={active === key ? "true" : undefined} onClick={() => jump(key)}>
                  <RailStepLabel index={index} status={status} label={label} note={note} />
                </button>;
              })}
            </nav>
            <RailSlip label="Honor netto" value={money(totals.net)}>
              <dl>
                <div><dt>Honor bruto</dt><dd>{money(totals.gross)}</dd></div>
                <div><dt>{taxLabel}</dt><dd>− {money(totals.tax)}</dd></div>
              </dl>
            </RailSlip>
          </FormRail>
          <form className="editor-form rail-main" onSubmit={save}>
            <RailStepHead question="Siapa penerimanya, dan berapa honornya?" describes
              purpose="Satu rekap untuk satu penerima. Bruto, pajak, dan netto dihitung langsung dari isian, mengikuti format Lampiran 3." />
            <div className="form-body" ref={bodyRef}><fieldset disabled={busy} className="honor-fieldset">
              <section className="form-section" data-rail-section="basis"><h3><FileText size={17} />Dasar SK dan kegiatan</h3><div className="form-grid">
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
              </div></section>
              <section className="form-section" data-rail-section="recipient"><h3><Users size={17} />Penerima honor</h3>
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
              </section>
              <section className="form-section" data-rail-section="amount"><h3><Wallet size={17} />Perhitungan honor</h3><div className="form-grid">
                {numberField("monthlyAmount", "Honor per bulan (Rp)", 1_000_000_000_000)}
                {numberField("months", "Jumlah bulan", 12, 1)}
                <Field label="Cara mengisi pajak"><CustomSelect value={form.taxMode} onValueChange={value => patch({ taxMode: value as HonorariumInput["taxMode"] })}>
                  <SelectOption value="amount">Nominal rupiah</SelectOption><SelectOption value="percent">Persentase dari bruto</SelectOption>
                </CustomSelect></Field>
                {form.taxMode === "percent" ? numberField("taxRate", "Tarif pajak (%)", 100) : numberField("taxAmount", "Pajak (Rp)", 1_000_000_000_000)}
              </div><p className="field-hint">Isi pajak sesuai dokumen. Nilai 0 berarti tanpa potongan; persentase dibulatkan ke rupiah terdekat.</p>
              {textField("notes", "Keterangan", false, true)}</section>
            </fieldset></div>
            {/* Pita hitungan untuk layar sempit, saat slip rel tidak tampil. */}
            <div className="honor-calc" aria-live="polite">
              <div><span>Honor bruto</span><strong>{money(totals.gross)}</strong></div>
              <div><span>{taxLabel}</span><strong>− {money(totals.tax)}</strong></div>
              <div><span>Honor netto</span><strong>{money(totals.net)}</strong></div>
            </div>
            <div className="form-footer">
              <ErrorMessage message={error} />
              <div className="footer-actions">
                <div className="form-step-meta"><span>{dirty ? "Ada isian yang belum disimpan" : "Kolom bertanda * wajib diisi"}</span></div>
                <div className="form-action-buttons">
                  <Button type="button" variant="ghost" disabled={busy} onClick={close}>Batal</Button>
                  <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan honorarium"}</Button>
                </div>
              </div>
            </div>
          </form>
        </div>
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

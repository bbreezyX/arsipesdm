"use client";

import { useState, type FormEvent } from "react";
import { FileText, Users, Wallet, LoaderCircle } from "lucide-react";
import { honorariumCategories, honorariumSchema, honorariumTotals, type Honorarium, type HonorariumInput } from "@/lib/honorarium";
import type { Employee } from "@/lib/employees";
import { money } from "@/lib/model";
import { api, ErrorMessage, Field } from "./fields";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CustomSelect, SelectOption } from "./ui/select";

export default function HonorariumForm({ initial, employees, onClose, onSaved }: {
  initial: HonorariumInput | Honorarium; employees: Employee[]; onClose: () => void; onSaved: (record: Honorarium) => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const editing = "id" in initial;
  const totals = honorariumTotals(form);
  function patch(values: Partial<HonorariumInput>) { setDirty(true); setForm(previous => ({...previous, ...values})); }
  function close() { if (busy) return; if (dirty) setDiscard(true); else onClose(); }
  function textField(key: keyof HonorariumInput, label: string, required = false, wide = false) {
    return <Field label={label} required={required} className={wide ? "span-2" : ""}>
      {wide ? <textarea rows={2} value={String(form[key] ?? "")} required={required} maxLength={5000} onChange={e => patch({[key]: e.target.value})} />
        : <input value={String(form[key] ?? "")} required={required} maxLength={5000} onChange={e => patch({[key]: e.target.value})} />}
    </Field>;
  }
  function numberField(key: "monthlyAmount" | "months" | "taxRate" | "taxAmount" | "budget" | "year", label: string, max: number, min = 0) {
    return <Field label={label} required><input type="number" inputMode={key === "taxRate" ? "decimal" : "numeric"} min={min} max={max} step={key === "taxRate" ? "0.01" : "1"}
      value={form[key] ?? ""} required onChange={e => patch({[key]: e.target.value === "" ? null : Number(e.target.value)})} /></Field>;
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = honorariumSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError("");
    try {
      const record = await api<Honorarium>(editing ? `/api/honorariums/${initial.id}` : "/api/honorariums", {
        method: editing ? "PATCH" : "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({...parsed.data, ...(editing ? {version: initial.version} : {})}),
      });
      onSaved(record);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <><Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="form-dialog honorarium-dialog" showCloseButton={!busy} onInteractOutside={e => e.preventDefault()}>
    <DialogHeader><DialogTitle>{editing ? "Edit honorarium" : "Tambah honorarium"}</DialogTitle><DialogDescription>Satu rekap untuk satu penerima. Isian mengikuti format Lampiran 3 honorarium.</DialogDescription></DialogHeader>
    <form className="editor-form" onSubmit={save}>
      <div className="form-body"><fieldset disabled={busy} className="honorarium-fieldset">
        <section className="form-section"><h3><FileText size={17} />Dasar SK dan kegiatan</h3><div className="form-grid">
          <Field label="Jenis honorarium" required><CustomSelect value={form.category} onValueChange={value => patch({category: value as HonorariumInput["category"]})}>
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
        <section className="form-section"><h3><Users size={17} />Penerima honor</h3>
          {employees.length > 0 && <Field label="Ambil dari daftar pegawai" hint="Opsional. Identitas tetap dapat disesuaikan untuk rekap ini."><CustomSelect value="" placeholder="Pilih pegawai…" onValueChange={id => {
            const person = employees.find(p => p.id === id);
            if (person) patch({recipient: person.name, position: person.position, recipientDepartment: person.department || form.recipientDepartment});
          }}>{employees.map(person => <SelectOption key={person.id} value={person.id}>{person.name}{person.department ? ` — ${person.department}` : ""}</SelectOption>)}</CustomSelect></Field>}
          <div className="form-grid">
            {textField("recipient", "Nama pejabat / penerima", true)}
            {textField("skPosition", "Jabatan dalam SK", true)}
            {textField("position", "Jabatan struktural/fungsional")}
            {textField("recipientDepartment", "Unit kerja penerima", true)}
            {textField("echelon", "Eselon")}
            {form.category === "finance" && numberField("budget", "Pagu dana yang dikelola (Rp)", 1_000_000_000_000)}
          </div>
        </section>
        <section className="form-section"><h3><Wallet size={17} />Perhitungan honor</h3><div className="form-grid">
          {numberField("monthlyAmount", "Honor per bulan (Rp)", 1_000_000_000_000)}
          {numberField("months", "Jumlah bulan", 12, 1)}
          <Field label="Cara mengisi pajak"><CustomSelect value={form.taxMode} onValueChange={value => patch({taxMode: value as HonorariumInput["taxMode"]})}>
            <SelectOption value="amount">Nominal rupiah</SelectOption><SelectOption value="percent">Persentase dari bruto</SelectOption>
          </CustomSelect></Field>
          {form.taxMode === "percent" ? numberField("taxRate", "Tarif pajak (%)", 100) : numberField("taxAmount", "Pajak (Rp)", 1_000_000_000_000)}
        </div><p className="field-hint">Isi pajak sesuai dokumen. Nilai 0 berarti tanpa potongan; persentase dibulatkan ke rupiah terdekat.</p>
        {textField("notes", "Keterangan", false, true)}</section>
      </fieldset></div>
      <div className="honorarium-form-bottom"><div className="honorarium-calculation" aria-live="polite"><div><span>Honor bruto</span><strong>{money(totals.gross)}</strong></div><div><span>Pajak</span><strong>{money(totals.tax)}</strong></div><div><span>Honor netto</span><strong>{money(totals.net)}</strong></div></div>
        <ErrorMessage message={error} /><div className="honorarium-form-actions"><span>* Wajib diisi</span><Button type="button" variant="outline" disabled={busy} onClick={close}>Batal</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" size={15} />}{busy ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan honorarium"}</Button></div>
      </div>
    </form>
  </DialogContent></Dialog>
  <Dialog open={discard} onOpenChange={setDiscard}><DialogContent><DialogHeader><DialogTitle>Batalkan perubahan?</DialogTitle><DialogDescription>Isian yang belum disimpan akan hilang.</DialogDescription></DialogHeader><div className="honorarium-actions"><Button variant="outline" onClick={() => setDiscard(false)}>Lanjutkan mengisi</Button><Button variant="destructive" onClick={onClose}>Buang perubahan</Button></div></DialogContent></Dialog></>;
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Lampiran6 } from "@/lib/lampiran6-schema";
import { categories } from "@/lib/model";
import { Field } from "./fields";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { evidenceVisualState } from "@/lib/recap-visual-state";
import { RecapStatus } from "./recap-status";
import { useRowKeys } from "./use-row-keys";

type AdditionalCost = Lampiran6["additionalCosts"][number];

export default function AdditionalCostFields({ value, personName, onChange, highlightStatus = false }: {
  value: AdditionalCost[];
  personName: string;
  onChange: (costs: AdditionalCost[]) => void;
  highlightStatus?: boolean;
}) {
  const rows = useRowKeys(value.length);
  function patch(index: number, change: Partial<AdditionalCost>) {
    onChange(value.map((cost, current) => current === index ? { ...cost, ...change } : cost));
  }
  function add(category: AdditionalCost["category"], label: string) {
    if (value.length < 30) onChange([...value, { category, label, amount: null }]);
  }
  return <div className="additional-cost-editor">
    <p className="field-hint">Biaya ini ditambahkan ke total {personName || "pegawai ini"}. Jika BBM sudah masuk nominal transport darat, jangan dicatat lagi di sini.</p>
    <div className="additional-cost-items">
      {value.map((cost, index) => <div className="additional-cost-item" key={rows.keys[index]} data-recap-tone={highlightStatus ? evidenceVisualState(cost, cost.amount).tone : undefined}>
        <Field label="Jenis biaya"><CustomSelect aria-label={`Jenis biaya tambahan ${index + 1} ${personName}`} value={cost.category} onValueChange={category => patch(index, { category: category as AdditionalCost["category"] })}>
          {categories.map(category => <SelectOption key={category}>{category}</SelectOption>)}
        </CustomSelect></Field>
        <Field label="Keterangan"><input aria-label={`Keterangan biaya tambahan ${index + 1} ${personName}`} value={cost.label} maxLength={1000} placeholder="Contoh: BBM / minyak, tol, parkir" onChange={event => patch(index, { label: event.target.value })} /></Field>
        <Field label="Nominal (Rp)"><input aria-label={`Nominal biaya tambahan ${index + 1} ${personName}`} type="number" inputMode="numeric" min="0" max="1000000000000" step="1" value={cost.amount ?? ""} placeholder="Belum dicatat" onChange={event => patch(index, { amount: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Hapus biaya tambahan ${index + 1} ${personName}`} onClick={() => { rows.remove(index); onChange(value.filter((_, current) => current !== index)); }}><Trash2 size={15} /></Button>
        {highlightStatus && <RecapStatus tone={cost.amount === null ? "different" : "filled"} className="additional-entry-status">{cost.amount === null ? "Nominal belum masuk total" : cost.amount === 0 ? "Nihil dicatat" : "Masuk total pegawai"}</RecapStatus>}
      </div>)}
    </div>
    <div className="additional-cost-actions">
      <Button type="button" variant="outline" size="sm" disabled={value.length >= 30} onClick={() => add("Transportasi", "BBM / minyak")}><Plus size={14} />BBM / minyak</Button>
      <Button type="button" variant="outline" size="sm" disabled={value.length >= 30} onClick={() => add("Penginapan", "Penginapan tambahan")}><Plus size={14} />Penginapan</Button>
      <Button type="button" variant="outline" size="sm" disabled={value.length >= 30} onClick={() => add("Biaya lainnya", "Biaya tambahan")}><Plus size={14} />Tambah biaya lain</Button>
      {value.length >= 30 && <span className="field-hint">Maksimal 30 rincian biaya tambahan.</span>}
    </div>
  </div>;
}

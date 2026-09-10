"use client";

import { changeLodgingMode, lodgingAllowanceDescription, lodgingAllowanceReference } from "@/lib/lodging-allowance";
import type { Lampiran6 } from "@/lib/lampiran6-schema";
import { money } from "@/lib/model";
import { Field } from "./fields";
import { CustomSelect, SelectOption } from "./ui/select";

export default function LodgingAllowanceFields({ data, onChange }: {
  data: Lampiran6;
  onChange: (changes: Partial<Lampiran6>) => void;
}) {
  const percentage = data.lodgingMode === "thirty-percent";
  return <div className="lodging-allowance-fields">
    <Field label="Perhitungan penginapan">
      <CustomSelect aria-label="Perhitungan penginapan" value={data.lodgingMode ?? "manual"}
        onValueChange={mode => {
          const next = changeLodgingMode(data, mode as Lampiran6["lodgingMode"]);
          onChange({ lodgingMode: next.lodgingMode, lodgingBaseRate: next.lodgingBaseRate, lodgingNights: next.lodgingNights, lodgingCost: next.lodgingCost });
        }}>
        <SelectOption value="manual">Sesuai bukti / nominal manual</SelectOption>
        <SelectOption value="thirty-percent">Penginapan 30% (lumpsum)</SelectOption>
      </CustomSelect>
    </Field>
    {percentage && <>
      <p className="field-hint">Untuk penginapan yang dibayarkan secara lumpsum 30%. Isi jumlah malam sesuai hak pegawai.</p>
      <div className="form-grid">
        <Field label="Tarif dasar penginapan per malam (Rp)" hint="Tarif kantor Rp510.000. Sesuaikan jika hak tarif pegawai berbeda.">
          <input aria-label="Tarif dasar penginapan per malam (Rp)" type="number" inputMode="numeric" min="0" max="1000000000000" step="1"
            value={data.lodgingBaseRate ?? ""} onChange={event => onChange({ lodgingBaseRate: event.target.value === "" ? null : Number(event.target.value) })} />
        </Field>
        <Field label="Jumlah malam penginapan 30%" hint="Jumlah malam, bukan jumlah hari perjalanan.">
          <input aria-label="Jumlah malam penginapan 30%" type="number" inputMode="numeric" min="0" max="3660" step="1" placeholder="Isi jumlah malam"
            value={data.lodgingNights ?? ""} onChange={event => onChange({ lodgingNights: event.target.value === "" ? null : Number(event.target.value) })} />
        </Field>
      </div>
      <div className="lodging-allowance-result" role="status">
        <span>{lodgingAllowanceDescription(data)}</span><strong>{money(data.lodgingCost)}</strong>
      </div>
      <p className="field-hint">Dasar perhitungan 30%: <a href={lodgingAllowanceReference} target="_blank" rel="noreferrer">Pergub Jambi 1/2016, Pasal 14 ayat (2)</a>. Tarif dasar mengikuti ketentuan kantor untuk pegawai dan tujuan terkait.</p>
    </>}
  </div>;
}

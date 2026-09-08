"use client";

import type { Lampiran6 } from "@/lib/lampiran6-schema";
import { provinceAllowances } from "@/lib/travel-provinces";
import { Field } from "./fields";
import { CustomSelect, SelectOption } from "./ui/select";

type Scope = Pick<Lampiran6, "format" | "destinationProvince">;
export default function TravelScopeFields({ value, onChange }: { value: Scope; onChange: (patch: Partial<Scope>) => void }) {
  return <div className="travel-scope-fields form-grid span-2">
    <Field label="Cakupan perjalanan"><CustomSelect aria-label="Cakupan perjalanan" value={value.format ?? "dalam-provinsi"} onValueChange={format => onChange({ format: format as Scope["format"] })}>
      <SelectOption value="dalam-provinsi">Dalam Provinsi Jambi</SelectOption>
      <SelectOption value="luar-provinsi">Luar Provinsi Jambi</SelectOption>
    </CustomSelect></Field>
    {value.format === "luar-provinsi" && <Field label="Provinsi tujuan" required hint="Dasar tarif uang harian. Isi kota / instansi tujuan di bawah.">
      <CustomSelect aria-label="Provinsi tujuan" value={value.destinationProvince || "unset"} onValueChange={province => onChange({ destinationProvince: province === "unset" ? "" : province as Scope["destinationProvince"] })}>
        <SelectOption value="unset">Pilih provinsi tujuan</SelectOption>
        {provinceAllowances.filter(([name]) => name !== "Jambi").map(([name]) => <SelectOption key={name} value={name}>{name}</SelectOption>)}
        <SelectOption value="Beberapa provinsi">Beberapa provinsi · tarif manual</SelectOption>
      </CustomSelect>
    </Field>}
  </div>;
}

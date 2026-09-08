"use client";

import type { TripSuggestions } from "@/lib/trip-suggestions";
import { Field } from "./fields";
import { Combobox } from "./ui/combobox";

export default function AccountCodeField({ value, onChange, options, className }: {
  value: string;
  onChange: (account: string) => void;
  options: TripSuggestions["accounts"];
  className?: string;
}) {
  return <Field label="Kode rekening belanja" className={className}
    hint="Pilih kode dari arsip atau ketik kode baru. Kode akan tersimpan pada rekap ini.">
    <Combobox aria-label="Kode rekening belanja" value={value} onValueChange={onChange}
      options={options} maxLength={250} autoComplete="off" spellCheck={false}
      placeholder="Pilih atau ketik kode rekening" emptyMessage="Belum ada kode rekening yang cocok." />
  </Field>;
}

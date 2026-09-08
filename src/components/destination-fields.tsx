"use client";

import { Plus, X } from "lucide-react";
import { destinationKey } from "@/lib/destinations";
import { Combobox, type ComboboxOption } from "./ui/combobox";
import { Button } from "./ui/button";
import { Field } from "./fields";

export default function DestinationFields({values, options, onChange, className = "", highlightFilled = false}: {
  values: string[];
  options: ComboboxOption[];
  onChange: (values: string[]) => void;
  className?: string;
  highlightFilled?: boolean;
}) {
  return <div className={`destination-fields ${className}`} role="group" aria-label="Tujuan perjalanan">
    {values.map((value, index) => <div className="destination-row" key={index}>
      <Field className={highlightFilled && value.trim() ? "recap-field-entered" : ""} label={values.length > 1 ? `Tujuan ${index + 1}` : "Tujuan / instansi tujuan"} required>
        <Combobox aria-label={values.length > 1 ? `Tujuan ${index + 1}` : "Tujuan / instansi tujuan"}
          required value={value} maxLength={250} placeholder="Pilih daerah atau ketik lokasi / instansi"
          options={options.filter(option => !values.some((other, otherIndex) => otherIndex !== index && destinationKey(other) === destinationKey(option.value)))}
          onValueChange={next => onChange(values.map((current, currentIndex) => currentIndex === index ? next : current))} />
      </Field>
      {values.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Hapus tujuan ${index + 1}`} onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}><X size={16} /></Button>}
    </div>)}
    <div className="destination-actions">
      <Button type="button" variant="outline" size="sm" disabled={values.length >= 20} onClick={() => onChange([...values, ""])}><Plus size={14} /> Tambah tujuan</Button>
      <span className="field-hint">Tambahkan lokasi lain jika perjalanan mencakup beberapa tujuan.</span>
    </div>
  </div>;
}

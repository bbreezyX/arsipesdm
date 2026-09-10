"use client";

import { useState } from "react";
import { formatDecimalInput, parseDecimalInput } from "@/lib/decimal-input";
import { Field } from "./fields";

export default function DecimalField({ label, value, onChange, hint }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(() => ({ value, text: formatDecimalInput(value) }));
  // Preserve trailing separators and zeros while typing; reflect external row changes.
  const text = Object.is(value, draft.value) ? draft.text : formatDecimalInput(value);
  return <Field label={label} hint={hint}>
    <input aria-label={label} type="text" inputMode="decimal" className="decimal-input"
      value={text} placeholder="Contoh: 38,98" autoComplete="off"
      onChange={event => {
        const raw = event.target.value;
        const parsed = parseDecimalInput(raw);
        if (parsed === undefined) return;
        setDraft({ value: parsed, text: raw });
        onChange(parsed);
      }}
      onBlur={() => setDraft({ value, text: formatDecimalInput(value) })} />
  </Field>;
}

"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { budgetKey, type Budget } from "@/lib/budgets";

/** Program, kegiatan dan subkegiatan dipilih sekaligus dari paket di Pengaturan, cukup satu klik. */
export default function BudgetFields({ value, options, onChange }: {
  value: Budget;
  options: Budget[];
  onChange: (budget: Budget) => void;
}) {
  const [query, setQuery] = useState("");
  const filled = Boolean(value.program.trim() || value.activityName.trim() || value.subActivity.trim());
  const current = { program: value.program, activityName: value.activityName, subActivity: value.subActivity };
  // Rekap lama atau hasil impor bisa memuat paket yang tidak ada di daftar; tetap ditampilkan sebagai pilihan terpilih.
  const listed = !filled || options.some(option => budgetKey(option) === budgetKey(current));
  const search = query.trim().toLocaleLowerCase("id-ID");
  const shown = (listed ? options : [current, ...options])
    .filter(option => !search || Object.values(option).join(" ").toLocaleLowerCase("id-ID").includes(search));

  if (!options.length && !filled) return <p className="budget-empty">Belum ada paket anggaran. Tambahkan di Pengaturan › Program &amp; anggaran.</p>;

  return <div className="budget-picker">
    {options.length > 6 && <label className="budget-search"><Search size={15} aria-hidden="true" />
      <input type="search" aria-label="Cari paket anggaran" placeholder="Cari program atau kegiatan" value={query} onChange={event => setQuery(event.target.value)} /></label>}
    <div className="budget-options">
      {shown.map(option => {
        const selected = filled && budgetKey(option) === budgetKey(current);
        return <button type="button" key={budgetKey(option)} className="budget-option" aria-pressed={selected} onClick={() => onChange(option)}>
          <span className="budget-radio" aria-hidden="true">{selected && <Check size={12} strokeWidth={3} />}</span>
          <span>
            <strong>{option.program || "Tanpa program"}</strong>
            {option.activityName && <span>{option.activityName}</span>}
            {option.subActivity && <small>{option.subActivity}</small>}
            {!listed && option === current && <em>Tercatat di rekap ini, tidak ada di daftar Pengaturan</em>}
          </span>
        </button>;
      })}
      {!shown.length && <p className="budget-empty">Tidak ada paket yang cocok.</p>}
    </div>
    {filled && <button type="button" className="budget-link" onClick={() => onChange({ program: "", activityName: "", subActivity: "" })}>Kosongkan pilihan</button>}
  </div>;
}

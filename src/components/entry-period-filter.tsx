"use client";

import { entryFilterLabel, entryFilterOptions, isEntryDay, parseEntryFilter, type EntryFilter } from "@/lib/model";
import { CustomSelect, SelectOption } from "./ui/select";

export default function EntryPeriodFilter({ value, todayCount, onChange, onToday }: {
  value: EntryFilter;
  todayCount: number;
  onChange: (value: EntryFilter) => void;
  onToday: () => void;
}) {
  return (
    <div className="entry-period">
      <div className="entry-period-label"><strong>Waktu ditambahkan</strong><span>Tanggal pencatatan · WIB</span></div>
      <CustomSelect aria-label="Waktu ditambahkan" className="ledger-select" value={value}
        onValueChange={next => onChange(parseEntryFilter(next))}>
        {entryFilterOptions.map(([key, label]) => <SelectOption key={key} value={key}>{label}</SelectOption>)}
        {isEntryDay(value) && <SelectOption value={value}>Tanggal {entryFilterLabel(value)}</SelectOption>}
      </CustomSelect>
      <button type="button" className="entry-today" onClick={onToday}
        title="Tampilkan seluruh rekap yang ditambahkan hari ini, dari semua tahun">
        Hari ini <strong>{todayCount}</strong><span>rekap</span>
      </button>
    </div>
  );
}

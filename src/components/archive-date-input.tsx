"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Popover } from "radix-ui";
import { DayPicker, type DropdownProps } from "react-day-picker";
import { id } from "react-day-picker/locale";
import { CustomSelect, SelectOption } from "./ui/select";

/* Tanggal arsip: diketik hh/bb/tttt (cara tercepat menyalin dari dokumen), atau dipilih
   dari kalender di tombol kanan. Nilai yang disimpan tetap ISO yyyy-mm-dd. */

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toText = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
/** Garis miring disisipkan sendiri saat mengetik: 15092026 → 15/09/2026. */
const mask = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
};
function parse(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? toIso(date) : null;
}

/** Pilihan bulan dan tahun memakai select aplikasi, bukan daftar bawaan browser. */
function CalendarDropdown({ options = [], value, onChange, disabled, "aria-label": label }: DropdownProps) {
  return (
    <CustomSelect
      className="date-dropdown"
      aria-label={label}
      disabled={disabled}
      value={String(value)}
      onValueChange={(next) => onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>)}
    >
      {options.map((option) => (
        <SelectOption key={option.value} value={String(option.value)} disabled={option.disabled}>
          {option.label}
        </SelectOption>
      ))}
    </CustomSelect>
  );
}

export default function ArchiveDateInput({
  value,
  onChange,
  required = false,
  range,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** Rentang perjalanan yang disorot di kalender, misalnya berangkat–kembali. */
  range?: { from: string; to: string };
}) {
  const [text, setText] = useState(toText(value));
  const [open, setOpen] = useState(false);
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setText(toText(value));
  }, [value]);
  const selected = value ? toDate(value) : undefined;
  const inRange = range?.from && range.to && range.from <= range.to ? { from: toDate(range.from), to: toDate(range.to) } : undefined;
  const month = selected ?? (range?.from ? toDate(range.from) : undefined);
  const year = new Date().getFullYear();

  return (
    <div className="archive-date-input">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="hh/bb/tttt"
        required={required}
        value={text}
        onFocus={() => { typing.current = true; }}
        onChange={(event) => {
          const next = mask(event.target.value);
          setText(next);
          if (!next) onChange("");
          else {
            const iso = parse(next);
            if (iso) onChange(iso);
          }
        }}
        // Isian yang belum lengkap kembali ke tanggal terakhir yang sah.
        onBlur={() => { typing.current = false; setText(toText(value)); }}
      />
      {/* Modal: jebakan fokus dialog formulir dijeda selama kalender terbuka, jadi fokus tetap di kalender. */}
      <Popover.Root modal open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="date-trigger" aria-label="Pilih dari kalender">
            <CalendarDays size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="date-popover" align="end" sideOffset={6} collisionPadding={12}
            // Fokus diserahkan ke kalender: tanggal terpilih atau hari ini, bukan tombol bulan sebelumnya.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const content = event.currentTarget as HTMLElement;
              // Berurutan: tanggal terpilih, lalu hari ini, lalu tanggal pertama di bulan itu.
              requestAnimationFrame(() => [".rdp-selected", ".rdp-today", ".rdp-day:not(.rdp-outside)"]
                .map(day => content.querySelector<HTMLElement>(`${day} .rdp-day_button`))
                .find(Boolean)?.focus());
            }}>
            <DayPicker
              mode="single"
              locale={id}
              weekStartsOn={1}
              captionLayout="dropdown"
              startMonth={new Date(year - 10, 0)}
              endMonth={new Date(year + 2, 11)}
              showOutsideDays
              components={{ Dropdown: CalendarDropdown }}
              selected={selected}
              defaultMonth={month}
              modifiers={inRange ? { trip: inRange } : undefined}
              modifiersClassNames={{ trip: "date-in-range" }}
              onSelect={(date) => {
                if (date) {
                  onChange(toIso(date));
                  setText(toText(toIso(date)));
                }
                setOpen(false);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

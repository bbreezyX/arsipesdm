"use client";

/** Pilihan cara mengisi rekap: segmen dua pilihan di kepala formulir. */
export default function RecapEntryMode({ value, onChange, disabled = false }: {
  value: "single" | "multiple";
  onChange: (value: "single" | "multiple") => void;
  disabled?: boolean;
}) {
  return <fieldset className="recap-entry-mode" disabled={disabled} aria-label="Pengisian pegawai">
    {([["single", "Satu pegawai", "Satu rekap untuk satu orang"], ["multiple", "Beberapa pegawai", "Satu Surat Tugas, rekap untuk tiap peserta"]] as const).map(([mode, label, description]) =>
      <label key={mode} data-selected={value === mode} title={description}>
        <input type="radio" name="recap-entry-mode" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
        <span>{label}</span>
      </label>,
    )}
  </fieldset>;
}

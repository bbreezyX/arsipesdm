"use client";

export default function RecapEntryMode({ value, onChange, disabled = false }: {
  value: "single" | "multiple";
  onChange: (value: "single" | "multiple") => void;
  disabled?: boolean;
}) {
  return <fieldset className="recap-entry-mode" disabled={disabled}>
    <legend>Pengisian pegawai</legend>
    <div>
      {([ ["single", "Satu pegawai", "Satu rekap untuk satu orang"], ["multiple", "Beberapa pegawai", "Satu ST, rekap untuk tiap peserta"] ] as const).map(([mode, label, description]) =>
        <label key={mode} data-selected={value === mode}>
          <input type="radio" name="recap-entry-mode" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
          <span>{label}<small>{description}</small></span>
        </label>,
      )}
    </div>
  </fieldset>;
}

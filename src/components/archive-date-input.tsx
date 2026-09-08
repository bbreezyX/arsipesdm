"use client";
export default function ArchiveDateInput({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <input
      type="date"
      className="archive-date-input"
      lang="id-ID"
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

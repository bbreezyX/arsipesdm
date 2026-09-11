"use client";

import { fundTrackHint, fundTrackLabels, fundTracks } from "@/lib/fund-track";
import type { TripInput } from "@/lib/model";
import { Field } from "./fields";
import { CustomSelect, SelectOption } from "./ui/select";

export default function FundTrackField({
  value,
  trip,
  onChange,
  className,
}: {
  value: string;
  trip?: Pick<TripInput, "sptNo" | "startDate">;
  onChange: (fundTrack: string) => void;
  className?: string;
}) {
  return (
    <Field
      label="Jenis dana"
      className={className}
      hint={trip ? fundTrackHint({ ...trip, fundTrack: value }) : "Isi sesuai BKU: UP, GU 1, GU 2, atau pembayaran lain."}
    >
      <CustomSelect aria-label="Jenis dana" value={value} onValueChange={onChange}>
        <SelectOption value="">Belum dipilih</SelectOption>
        {fundTracks.map((track) => (
          <SelectOption key={track} value={track}>
            {track} · {fundTrackLabels[track]}
          </SelectOption>
        ))}
      </CustomSelect>
    </Field>
  );
}

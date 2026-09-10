import type { Lampiran6 } from "./lampiran6-schema";

// Office tariff confirmed by the user; not an automatic rate for every rank/destination.
export const officeLodgingBaseRate = 510_000;
export const lodgingAllowanceReference = "https://jdih.jambiprov.go.id/fileperaturan/8097PERGUBNO.1TH2016.pdf#page=8";

export function calculateLodgingAllowance(baseRate: number | null, nights: number | null): number | null {
  if (baseRate == null || nights == null) return null;
  return Math.round(baseRate * nights * 30 / 100);
}

export function applyLodgingAllowance(data: Lampiran6): Lampiran6 {
  if (data.lodgingMode !== "thirty-percent") return data;
  return { ...data, lodgingCost: calculateLodgingAllowance(data.lodgingBaseRate, data.lodgingNights) };
}

export function changeLodgingMode(data: Lampiran6, mode: Lampiran6["lodgingMode"]): Lampiran6 {
  return applyLodgingAllowance({ ...data, lodgingMode: mode,
    lodgingBaseRate: data.lodgingBaseRate ?? (mode === "thirty-percent" ? officeLodgingBaseRate : null),
    lodgingNights: data.lodgingNights ?? null,
  });
}

export function lodgingAllowanceDescription(data: Lampiran6): string {
  const rate = data.lodgingBaseRate == null ? "tarif belum diisi" : `Rp${data.lodgingBaseRate.toLocaleString("id-ID")}`;
  const nights = data.lodgingNights == null ? "jumlah malam belum diisi" : `${data.lodgingNights} malam`;
  return `30% × ${rate} × ${nights}`;
}

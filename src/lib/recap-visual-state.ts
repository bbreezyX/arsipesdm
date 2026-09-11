import { batchCostColumns, type BatchCostField, type BatchRow, type SharedJourney } from "./batch-recap";
import { tripDestinations } from "./destinations";
import type { Lampiran6 } from "./lampiran6-schema";
import type { TripInput } from "./model";
import { calculateLodgingAllowance, lodgingAllowanceDescription } from "./lodging-allowance";

export type RecapTone = "empty" | "filled" | "details" | "different";
export type RecapSectionState = { tone: RecapTone; label: string; description: string; count: number };

/** A blank evidence row is not content; an explicitly entered zero is. */
export function hasRecapDetail(item: Record<string, unknown>): boolean {
  return Object.entries(item).some(([key, value]) => key !== "category" &&
    (typeof value === "string" ? value.trim().length > 0
      : Array.isArray(value) ? value.some(entry => hasRecapDetail(entry as Record<string, unknown>))
      : typeof value === "number" && Number.isFinite(value)));
}

export function evidenceVisualState(item: Record<string, unknown>, amount: number | null): RecapSectionState {
  if (!hasRecapDetail(item)) return { tone: "empty", label: "Belum diisi", description: "Baris rincian masih kosong.", count: 0 };
  if (amount === null) return { tone: "details", label: "Ada rincian", description: "Rincian sudah diisi; nominal bukti belum dicatat.", count: 1 };
  return { tone: "filled", label: amount === 0 ? "Nominal nihil" : "Nominal dicatat", description: "Nominal bukti sudah dicatat. Periksa kesesuaian dengan total komponen.", count: 1 };
}

export function recapSectionStates(data: Lampiran6): Record<"main" | "hotel" | "vehicle" | "flight" | "additional", RecapSectionState> {
  function evidence(items: Array<Record<string, unknown> & { total: number | null }>, amount: number | null): RecapSectionState {
    const filled = items.filter(hasRecapDetail);
    const sum = filled.length && filled.every(item => item.total !== null)
      ? filled.reduce((total, item) => total + item.total!, 0) : null;
    if (filled.length && amount === null) return { tone: "different", label: `${filled.length} rincian · total kosong`, description: "Ada rincian pendukung, tetapi nominal komponen belum masuk total pegawai.", count: filled.length };
    if (sum !== null && amount !== null && sum !== amount) return { tone: "different", label: "Nominal berbeda", description: "Jumlah nominal bukti berbeda dengan nominal komponen. Periksa sebelum menyimpan.", count: filled.length };
    if (amount !== null) return { tone: "filled", label: filled.length ? `${filled.length} rincian` : amount === 0 ? "Nihil" : "Nominal diisi", description: filled.length ? "Nominal komponen dan rincian pendukung sudah dicatat." : "Nominal komponen sudah dicatat; belum ada rincian pendukung.", count: filled.length };
    return { tone: "empty", label: "Belum diisi", description: "Belum ada nominal atau rincian yang diisi.", count: 0 };
  }
  const amounts = batchCostColumns.filter(([key]) => data[key] !== null).length;
  const additional = data.additionalCosts.filter(hasRecapDetail);
  const pending = additional.filter(item => item.amount === null).length;
  return {
    main: { tone: amounts ? "filled" : "empty", label: `${amounts}/${batchCostColumns.length} nominal`, description: `${amounts} komponen memiliki nominal, termasuk nilai nol. Ini bukan penanda kelengkapan arsip.`, count: amounts },
    hotel: data.lodgingMode === "thirty-percent"
      ? data.lodgingBaseRate == null || data.lodgingNights == null
        ? { tone: "different", label: "30% · belum lengkap", description: "Lengkapi tarif dasar dan jumlah malam penginapan.", count: 1 }
        : data.lodgingCost !== calculateLodgingAllowance(data.lodgingBaseRate, data.lodgingNights)
          ? { tone: "different", label: "30% · periksa total", description: "Nominal penginapan belum sesuai perhitungan 30%.", count: 1 }
          : { tone: "filled", label: "Penginapan 30%", description: lodgingAllowanceDescription(data), count: 1 }
      : evidence(data.lodgings, data.lodgingCost),
    vehicle: evidence(data.groundTransports, data.landCost),
    flight: evidence([data.outbound, data.inbound].filter(hasRecapDetail).map(item => ({ ...item, total: item.price })), data.airCost),
    additional: pending ? { tone: "different", label: `${pending} tanpa nominal`, description: "Biaya tambahan yang belum memiliki nominal belum masuk total pegawai.", count: additional.length }
      : additional.length ? { tone: "filled", label: `${additional.length} rincian`, description: "Nominal biaya tambahan sudah masuk total pegawai.", count: additional.length }
      : { tone: "empty", label: "Belum diisi", description: "Belum ada biaya tambahan yang diisi.", count: 0 },
  };
}

const normalized = (value: unknown): unknown => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") : Array.isArray(value) ? value.map(normalized) : value;
export function journeyDifferences(input: TripInput, shared: SharedJourney) {
  const data = input.lampiran6!;
  const fields: Array<[string, unknown, unknown]> = [
    ["Maksud perjalanan", input.title, shared.title], ["Nomor ST", input.sptNo, shared.sptNo],
    ["Jenis dana", input.fundTrack ?? "", shared.fundTrack ?? ""],
    ["Tanggal berangkat", input.startDate, shared.startDate], ["Tanggal kembali", input.endDate, shared.endDate],
    ["Cakupan perjalanan", data.format, shared.format], ["Provinsi tujuan", data.format === "luar-provinsi" ? data.destinationProvince : "", shared.format === "luar-provinsi" ? shared.destinationProvince : ""],
    ["Asal", data.origin, shared.origin], ["Tujuan", tripDestinations(input), tripDestinations(shared)],
    ["Jumlah hari", data.claimedDays, shared.claimedDays], ["Kategori uang harian", data.dailyRateMode, shared.dailyRateMode ?? "auto"],
    ["Program", data.program, shared.program], ["Kegiatan anggaran", data.activityName, shared.activityName], ["Subkegiatan", data.subActivity, shared.subActivity],
  ];
  return fields.filter(([, personal, common]) => JSON.stringify(normalized(personal)) !== JSON.stringify(normalized(common))).map(([label]) => label);
}

/** Compare known amounts only. Unknown amounts are not zero or a discrepancy. */
export function variedCostFields(rows: BatchRow[]): Set<BatchCostField> {
  return new Set(batchCostColumns.filter(([key]) => new Set(rows.filter(row => row.selected)
    .map(row => row.input.lampiran6![key]).filter(value => value !== null)).size > 1).map(([key]) => key));
}

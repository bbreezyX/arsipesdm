import { z } from "zod";
import { destinationProvinces } from "./travel-provinces";
import { calculateLodgingAllowance, lodgingAllowanceDescription } from "./lodging-allowance";
import { flightHasDetail } from "./flight-legs";

const text = z.string().trim().max(1000).default("");
const amount = z.number().int().min(0).max(1e12).nullable().default(null);
const days = z.number().int().min(0).max(3660).nullable().default(null);
const optionalDate = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Tanggal tidak valid.",
  )
  .default("");

export const lodgingSchema = z.object({
  name: text,
  room: text,
  reference: text,
  checkIn: optionalDate,
  checkOut: optionalDate,
  days,
  application: text,
  orderId: text,
  dailyRate: amount,
  total: amount,
});
export const groundTransportSchema = z.object({
  mode: text,
  provider: text,
  vehicleType: text,
  fuelType: text,
  fuelPricePerLiter: amount,
  fuelLiters: z.number().min(0).max(1e6).nullable().default(null),
  total: amount,
});
/** One flight of an itinerary. A transit ticket is several legs under one booking and one price. */
export const flightLegSchema = z.object({
  date: optionalDate,
  airline: text,
  origin: text,
  destination: text,
  bookingCode: text,
  ticketNo: text,
});
export const flightSchema = flightLegSchema.extend({
  application: text,
  orderId: text,
  price: amount,
  transits: z.array(flightLegSchema).max(5).default([]),
});
export const lampiran6Schema = z.object({
  format: z.enum(["dalam-provinsi", "luar-provinsi"]).default("dalam-provinsi"),
  destinationProvince: z.enum(destinationProvinces).default(""),
  sourceNo: text,
  rank: text,
  sppdDate: optionalDate,
  origin: text,
  claimedDays: days,
  program: text,
  activityName: text,
  subActivity: text,
  dailyRate: amount,
  dailyTotal: amount,
  dailyRateMode: z.enum(["manual", "auto", "dalam-kota", "dalam-kota-singkat", "diklat"]).default("manual"),
  representationRate: amount,
  representationTotal: amount,
  lodgingCost: amount,
  lodgingMode: z.enum(["manual", "thirty-percent"]).default("manual"),
  lodgingBaseRate: amount,
  lodgingNights: days,
  landCost: amount,
  waterCost: amount,
  airCost: amount,
  recordedTotal: amount,
  receiptTotal: amount,
  lodgings: z.array(lodgingSchema).max(30).default([]),
  groundTransports: z.array(groundTransportSchema).max(30).default([]),
  outbound: flightSchema.default(() => flightSchema.parse({})),
  inbound: flightSchema.default(() => flightSchema.parse({})),
  additionalCosts: z
    .array(
      z.object({
        category: z.enum([
          "Uang harian",
          "Transportasi",
          "Penginapan",
          "Representasi",
          "Biaya lainnya",
        ]),
        label: text,
        amount,
      }),
    )
    .max(30)
    .default([]),
  sourceRows: z.array(z.number().int().positive()).max(100).default([]),
  sourceIssues: z.array(z.string().max(1500)).max(100).default([]),
  sourceFormulas: z
    .record(z.string().max(30), z.string().max(3000))
    .default({}),
});
export type Lampiran6 = z.infer<typeof lampiran6Schema>;
export type Lodging = z.infer<typeof lodgingSchema>;
export type GroundTransport = z.infer<typeof groundTransportSchema>;
export type Flight = z.infer<typeof flightSchema>;
export type FlightLeg = z.infer<typeof flightLegSchema>;

export const lampiranCostFields = [
  ["dailyTotal", "Uang harian", "Uang harian"],
  ["representationTotal", "Representasi", "Biaya representasi"],
  ["lodgingCost", "Penginapan", "Biaya penginapan"],
  ["landCost", "Transportasi", "Transport darat"],
  ["waterCost", "Transportasi", "Transport air"],
  ["airCost", "Transportasi", "Transport udara"],
] as const;

/** The cost ledger owns totals. Hotel/transport evidence is never added twice. */
export function lampiranCosts(data: Lampiran6, participantId: string) {
  return [
    ...lampiranCostFields.flatMap(([key, category, label]) =>
      data[key] === null
        ? []
        : [
            {
              id: `lampiran-${key}`,
              category,
              label: key === "lodgingCost" && data.lodgingMode === "thirty-percent"
                ? `Penginapan 30% — ${lodgingAllowanceDescription(data)}` : label,
              amount: data[key],
              participantId,
            },
          ],
    ),
    ...data.additionalCosts.flatMap((cost, i) =>
      cost.amount === null
        ? []
        : [
            {
              ...cost,
              amount: cost.amount,
              id: `lampiran-additional-${i}`,
              participantId,
            },
          ],
    ),
  ];
}

export function lampiranReview(
  data: Lampiran6,
  startDate: string,
  endDate: string,
) {
  const issues: string[] = [];
  const calendarDays =
    Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
  if (
    data.claimedDays !== null &&
    Number.isFinite(calendarDays) &&
    calendarDays !== data.claimedDays
  )
    issues.push(
      `Jumlah hari pada rekap ${data.claimedDays}, sedangkan rentang tanggal ${calendarDays} hari. Periksa dokumen sumber.`,
    );
  const costs = lampiranCosts(data, "participant");
  const sum = costs.length
    ? costs.reduce((total, c) => total + c.amount, 0)
    : null;
  const rp = (v: number) => "Rp\u00a0" + v.toLocaleString("id-ID");
  if (data.recordedTotal !== null && sum !== null && data.recordedTotal !== sum)
    issues.push(
      `Total rincian sumber ${rp(data.recordedTotal)} berbeda dari jumlah komponen ${rp(sum)}.`,
    );
  if (data.receiptTotal !== null && sum !== null && data.receiptTotal !== sum)
    issues.push(
      `Total kuitansi ${rp(data.receiptTotal)} berbeda dari jumlah komponen ${rp(sum)}.`,
    );
  for (const [rate, total, label] of [
    [data.dailyRate, data.dailyTotal, "uang harian"],
    [data.representationRate, data.representationTotal, "representasi"],
  ] as const) {
    if (
      rate !== null &&
      total !== null &&
      data.claimedDays !== null &&
      rate * data.claimedDays !== total
    )
      issues.push(
        `Total ${label} berbeda dari tarif per hari × jumlah hari pada rekap.`,
      );
  }
  const tickets = [data.outbound, data.inbound].filter(flightHasDetail);
  if (tickets.length) {
    if (data.airCost === null) issues.push("Rincian tiket sudah diisi, tetapi biaya transport udara belum masuk total pegawai.");
    if (tickets.some(ticket => ticket.price === null)) issues.push("Harga pada rincian tiket belum lengkap. Periksa bukti penerbangan.");
    else if (data.airCost !== null && tickets.reduce((total, ticket) => total + ticket.price!, 0) !== data.airCost)
      issues.push("Jumlah harga tiket berbeda dari biaya transport udara. Cocokkan dengan bukti penerbangan.");
  }
  for (const hotel of data.lodgings) {
    if (hotel.checkIn && hotel.checkOut && hotel.checkOut < hotel.checkIn)
      issues.push(
        "Tanggal check-out mendahului check-in. Periksa data penginapan.",
      );
  }
  if (data.lodgingMode === "thirty-percent") {
    if (data.lodgingBaseRate == null || data.lodgingNights == null)
      issues.push("Lengkapi tarif dasar dan jumlah malam untuk menghitung penginapan 30%.");
    else if (data.lodgingCost !== calculateLodgingAllowance(data.lodgingBaseRate, data.lodgingNights))
      issues.push("Biaya penginapan tidak sesuai dengan 30% × tarif dasar × jumlah malam.");
    if (data.lodgingNights !== null && Number.isFinite(calendarDays) && data.lodgingNights > calendarDays - 1)
      issues.push("Jumlah malam penginapan 30% melebihi selisih tanggal perjalanan. Periksa hak penginapan pada dokumen sumber.");
  }
  return [...new Set(issues)];
}

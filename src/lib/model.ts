import { z } from "zod";
import { lampiran6Schema, lampiranCosts } from "./lampiran6-schema";
import { destinationKey, formatDestinations } from "./destinations";

export const departments = [
  "Sekretariat",
  "Geologi dan Air Tanah",
  "Pertambangan dan Minerba",
  "Energi",
  "Ketenagalistrikan",
];
export const docLabels: Record<string, string> = {
  spt: "Surat perintah tugas",
  sppd: "SPPD",
  report: "Laporan perjalanan",
  receipt: "Rincian biaya / kuitansi",
  ticket: "Tiket / boarding pass",
  hotel: "Bukti penginapan",
  other: "Dokumen lainnya",
};
export const categories = [
  "Uang harian",
  "Transportasi",
  "Penginapan",
  "Representasi",
  "Biaya lainnya",
];
const short = z.string().trim().max(250);
const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Tanggal tidak valid.",
  );
export const participantSchema = z.object({
  id: short.min(1),
  name: short.min(1, "Nama peserta wajib diisi."),
  nip: short.default(""),
  position: short.default(""),
  department: short.default(""),
});
export const costSchema = z.object({
  id: short.min(1),
  category: z.enum([
    "Uang harian",
    "Transportasi",
    "Penginapan",
    "Representasi",
    "Biaya lainnya",
  ]),
  label: short.default(""),
  participantId: short.default("shared"),
  amount: z.number().int().min(0).max(1e12),
});
export const tripSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Uraian perjalanan minimal 3 karakter.")
      .max(3000),
    sptNo: short.default(""),
    sppdNo: short.default(""),
    destination: z.string().trim().min(2, "Tujuan wajib diisi.").max(6000),
    destinations: z.array(z.string().trim().min(2, "Setiap tujuan minimal 2 karakter.").max(250)
      .refine(value => !/[\r\n]/.test(value), "Isi satu lokasi untuk setiap tujuan."))
      .min(1, "Tambahkan minimal satu tujuan.").max(20, "Maksimal 20 tujuan per rekap.").optional(),
    department: short.min(2, "Bidang wajib diisi."),
    startDate: date,
    endDate: date,
    participants: z
      .array(participantSchema)
      .min(1, "Tambahkan minimal satu peserta.")
      .max(100),
    costs: z.array(costSchema).max(300),
    paid: z.number().int().min(0).max(1e12).nullable().default(null),
    notes: z.string().trim().max(10000).default(""),
    activity: z.string().trim().max(1000).default(""),
    lampiran6: lampiran6Schema.optional(),
    account: short.default(""),
    physicalLocation: short.default(""),
    requiredDocs: z
      .array(
        z.enum([
          "spt",
          "sppd",
          "report",
          "receipt",
          "ticket",
          "hotel",
          "other",
        ]),
      )
      .default([]),
    correctionReason: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.destinations) {
      if (new Set(v.destinations.map(destinationKey)).size !== v.destinations.length)
        ctx.addIssue({code: "custom", path: ["destinations"], message: "Tujuan yang sama tidak perlu ditambahkan dua kali."});
      if (v.destination !== formatDestinations(v.destinations))
        ctx.addIssue({code: "custom", path: ["destinations"], message: "Rincian tujuan tidak sesuai dengan kolom Tujuan."});
    }
    if (v.lampiran6) {
      if (v.lampiran6.format === "luar-provinsi" && (!v.lampiran6.destinationProvince || v.lampiran6.destinationProvince === "Jambi"))
        ctx.addIssue({ code: "custom", path: ["lampiran6", "destinationProvince"], message: "Pilih provinsi tujuan di luar Jambi." });
      if (v.participants.length !== 1)
        ctx.addIssue({
          code: "custom",
          path: ["participants"],
          message: "Format rekap per pegawai mencatat satu pegawai per arsip.",
        });
      const expected = lampiranCosts(v.lampiran6, v.participants[0]?.id ?? "");
      const withoutIds = (costs: typeof expected) =>
        costs.map((cost) => [
          cost.category,
          cost.label,
          cost.participantId,
          cost.amount,
        ]);
      if (
        JSON.stringify(withoutIds(expected)) !==
        JSON.stringify(withoutIds(v.costs))
      )
        ctx.addIssue({
          code: "custom",
          path: ["costs"],
          message:
            "Rincian biaya rekap tidak cocok dengan komponen biaya arsip.",
        });
    }
    if (v.endDate < v.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Tanggal pulang tidak boleh sebelum tanggal berangkat.",
      });
    if (
      v.endDate >
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
    )
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Arsip hanya untuk perjalanan yang sudah selesai.",
      });
    const ids = new Set(v.participants.map((p) => p.id));
    if (
      new Set(v.participants.map((p) => (p.nip || p.name).trim().toLowerCase()))
        .size !== v.participants.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["participants"],
        message: "Peserta yang sama tercatat lebih dari satu kali.",
      });
    if (ids.size !== v.participants.length)
      ctx.addIssue({
        code: "custom",
        path: ["participants"],
        message: "ID peserta tidak boleh duplikat.",
      });
    if (new Set(v.costs.map((c) => c.id)).size !== v.costs.length)
      ctx.addIssue({
        code: "custom",
        path: ["costs"],
        message: "ID biaya tidak boleh duplikat.",
      });
    for (const c of v.costs)
      if (c.participantId !== "shared" && !ids.has(c.participantId))
        ctx.addIssue({
          code: "custom",
          path: ["costs"],
          message: "Peserta pada rincian biaya tidak ditemukan.",
        });
    if (v.costs.reduce((n, c) => n + c.amount, 0) > 1e12)
      ctx.addIssue({
        code: "custom",
        path: ["costs"],
        message: "Total biaya terlalu besar.",
      });
  });
export type TripInput = z.infer<typeof tripSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type DocumentItem = {
  id: string;
  type: string;
  name: string;
  kind: "file" | "physical";
  size: number;
  location: string;
  createdAt: string;
};
export type EventItem = {
  id: string;
  action: string;
  actor: string;
  at: string;
  detail: string;
};
export type Trip = TripInput & {
  id: string;
  code: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  documents: DocumentItem[];
  history: EventItem[];
  source: string;
  deletedAt: string | null;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator";
};
export function totalCost(t: Pick<TripInput, "costs">): number | null {
  return t.costs.length ? t.costs.reduce((n, c) => n + c.amount, 0) : null;
}
export function missingDocs(t: Pick<Trip, "requiredDocs" | "documents">) {
  return t.requiredDocs.filter(
    (type) => !t.documents.some((d) => d.type === type),
  );
}
export function isComplete(t: Pick<Trip, "costs">) {
  // Core trip fields are validated on save/import; supporting documents are optional.
  return totalCost(t) !== null;
}
export function paymentLabel(t: Trip) {
  const total = totalCost(t);
  if (total === null || t.paid === null) return "Belum dicatat";
  if (t.paid === total) return "Lunas";
  if (t.paid > total) return "Perlu pengembalian";
  return "Belum lunas";
}
export function money(n: number | null) {
  return n === null
    ? "Belum dicatat"
    : // Keep the currency spacing stable across Node and browser locale data.
      "Rp\u00a0" +
        new Intl.NumberFormat("id-ID", {
          maximumFractionDigits: 0,
        }).format(n);
}
export function shortMoney(n: number) {
  return n >= 1e9
    ? `${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`
    : n >= 1e6
      ? `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
      : n.toLocaleString("id-ID");
}
export function dateText(
  s: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
) {
  return new Intl.DateTimeFormat("id-ID", options).format(
    new Date(s + "T12:00:00"),
  );
}
export function duration(t: TripInput) {
  return (
    Math.round((Date.parse(t.endDate) - Date.parse(t.startDate)) / 86400000) + 1
  );
}
export function fingerprint(t: TripInput) {
  return [
    t.sptNo.trim().toLocaleLowerCase().replace(/\s/g, ""),
    t.startDate,
    t.endDate,
    t.destination.trim().toLocaleLowerCase(),
    ...t.participants
      .map((p) => (p.nip || p.name).trim().toLocaleLowerCase())
      .sort(),
    ...(t.lampiran6
      ? [
          "lampiran6",
          t.sppdNo.trim().toLowerCase().replace(/\s/g, ""),
          t.title.trim().toLowerCase().replace(/\s+/g, " "),
          ...t.participants
            .map((p) => p.name.trim().toLowerCase().replace(/\s+/g, " "))
            .sort(),
        ]
      : []),
  ].join("|");
}
export type Filters = {
  search: string;
  year: string;
  month: string;
  department: string;
  status: string;
  sort: string;
};
export const defaultFilters: Filters = {
  search: "",
  year: "all",
  month: "all",
  department: "all",
  status: "all",
  sort: "newest",
};
export function filterTrips(trips: Trip[], f: Filters) {
  return trips
    .filter(
      (t) =>
        !t.deletedAt &&
        (f.year === "all" || t.startDate.startsWith(f.year)) &&
        (f.month === "all" || t.startDate.slice(5, 7) === f.month) &&
        (f.department === "all" || t.department === f.department) &&
        (f.status === "all" ||
          (f.status === "complete"
            ? isComplete(t)
            : f.status === "incomplete"
              ? !isComplete(t)
              : paymentLabel(t) !== "Lunas")) &&
        [
          t.title,
          t.sptNo,
          t.sppdNo,
          t.destination,
          t.code,
          ...t.participants.flatMap((p) => [p.name, p.nip]),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(f.search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      f.sort === "oldest"
        ? a.startDate.localeCompare(b.startDate)
        : f.sort === "cost"
          ? (totalCost(b) ?? -1) - (totalCost(a) ?? -1)
          : b.startDate.localeCompare(a.startDate),
    );
}

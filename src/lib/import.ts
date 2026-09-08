import { type TripInput, tripSchema } from "./model";
export const importFields = [
  ["title", "Uraian perjalanan", true],
  ["sptNo", "Nomor SPT", false],
  ["sppdNo", "Nomor SPPD", false],
  ["destination", "Tujuan", true],
  ["destinations", "Rincian tujuan (satu per baris)", false],
  ["startDate", "Tanggal berangkat", true],
  ["endDate", "Tanggal pulang", true],
  ["department", "Bidang", true],
  ["participants", "Peserta", true],
  ["total", "Total realisasi", false],
  ["paid", "Sudah dibayar", false],
  ["activity", "Kegiatan / subkegiatan", false],
  ["account", "Kode rekening", false],
  ["physicalLocation", "Lokasi berkas fisik", false],
  ["notes", "Catatan", false],
] as const;
export type ImportField = (typeof importFields)[number][0];
export type Mapping = Record<ImportField, string>;
export type ImportRow = {
  row: number;
  trip: TripInput | null;
  errors: string[];
  source: string;
  warnings?: string[];
};
export function parseMoney(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "")
    return null;
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw) || raw < 0)
      throw new Error("Biaya harus angka rupiah bulat dan tidak negatif.");
    return raw;
  }
  let s = String(raw)
    .trim()
    .replace(/^Rp\.?\s*/i, "")
    .replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,00)?$/.test(s))
    s = s.replace(/\./g, "").replace(/,00$/, "");
  else if (/^\d+(,00)?$/.test(s)) s = s.replace(/,00$/, "");
  else
    throw new Error(
      "Format biaya tidak dikenali. Gunakan angka atau contoh 1.250.000.",
    );
  const result = Number(s);
  if (!Number.isSafeInteger(result))
    throw new Error("Nilai biaya terlalu besar.");
  return result;
}
export function parseDate(raw: unknown): string {
  if (raw instanceof Date)
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
  if (typeof raw === "number" && raw > 1 && raw < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  throw new Error(
    "Tanggal harus sel tanggal Excel, DD/MM/YYYY, atau YYYY-MM-DD.",
  );
}
export function suggestMapping(headers: string[]): Mapping {
  const aliases: Record<ImportField, string[]> = {
    title: [
      "uraian perjalanan",
      "uraian",
      "kegiatan",
      "maksud perjalanan",
      "maksud",
    ],
    sptNo: ["nomor spt", "no spt", "spt"],
    sppdNo: ["nomor sppd", "no sppd", "sppd", "nomor spd"],
    destination: ["tujuan", "tempat tujuan", "lokasi"],
    destinations: ["rincian tujuan (satu per baris)", "rincian tujuan"],
    startDate: [
      "tanggal berangkat",
      "tgl berangkat",
      "tanggal mulai",
      "berangkat",
    ],
    endDate: ["tanggal pulang", "tgl pulang", "tanggal selesai", "pulang"],
    department: ["bidang", "unit kerja", "unit"],
    participants: ["peserta", "nama pegawai", "nama", "pegawai"],
    total: ["total realisasi", "total biaya", "total", "biaya", "jumlah biaya"],
    paid: ["sudah dibayar", "dibayar", "pembayaran"],
    activity: ["kegiatan / subkegiatan", "subkegiatan", "program"],
    account: ["kode rekening", "rekening"],
    physicalLocation: ["lokasi berkas fisik", "lokasi berkas", "map"],
    notes: ["catatan", "keterangan"],
  };
  return Object.fromEntries(
    importFields.map(([key]) => [
      key,
      headers.find((h) => aliases[key].includes(h.toLowerCase().trim())) ?? "",
    ]),
  ) as Mapping;
}
export function convertRows(
  rows: Record<string, unknown>[],
  mapping: Mapping,
  filename: string,
  sheet: string,
  firstRow: number,
): ImportRow[] {
  return rows.map((r, i) => {
    const errors: string[] = [];
    const read = (key: ImportField) =>
      mapping[key] ? r[mapping[key]] : undefined;
    const text = (key: ImportField) => String(read(key) ?? "").trim();
    const raw: Record<string, unknown> = {
      title: text("title"),
      sptNo: text("sptNo"),
      sppdNo: text("sppdNo"),
      destination: text("destination"),
      ...(text("destinations") ? {destinations: text("destinations").split(/\r?\n/).map(value => value.trim())} : {}),
      department: text("department"),
      notes: text("notes"),
      activity: text("activity"),
      account: text("account"),
      physicalLocation: text("physicalLocation"),
      requiredDocs: [],
      correctionReason: "",
    };
    for (const key of ["startDate", "endDate"] as const) {
      try {
        raw[key] = parseDate(read(key));
      } catch (e) {
        errors.push(
          `${key === "startDate" ? "Berangkat" : "Pulang"}: ${(e as Error).message}`,
        );
      }
    }
    const names = text("participants")
      .split(";")
      .map((n) => n.trim())
      .filter(Boolean);
    raw.participants = names.map((name, j) => ({
      id: `participant-${j + 1}`,
      name,
      nip: "",
      position: "",
      department: text("department"),
    }));
    try {
      const total = parseMoney(read("total"));
      raw.costs =
        total === null
          ? []
          : [
              {
                id: "import-total",
                category: "Biaya lainnya",
                label: "Total dari rekap sumber",
                participantId: "shared",
                amount: total,
              },
            ];
      raw.paid = parseMoney(read("paid"));
    } catch (e) {
      errors.push((e as Error).message);
    }
    const parsed = tripSchema.safeParse(raw);
    if (!parsed.success)
      errors.push(...parsed.error.issues.map((x) => x.message));
    return {
      row: i + firstRow,
      trip: parsed.success ? parsed.data : null,
      errors: [...new Set(errors)],
      source: `${filename} • ${sheet} • baris ${i + firstRow}`,
    };
  });
}
/** Row (1-based) whose headings match the most import fields; 1 when nothing matches. */
export function detectHeaderRow(grid: unknown[][], limit = 30): number {
  let best = 1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, limit); i++) {
    // Array.from also fills holes in sparse rows from SheetJS.
    const headers = Array.from(grid[i] ?? [], (x) => String(x ?? "").trim());
    const score = Object.values(suggestMapping(headers)).filter(Boolean).length;
    if (score > bestScore) {
      best = i + 1;
      bestScore = score;
    }
  }
  return best;
}
/** Summary rows such as "Jumlah" or "Total" under a table are not trips. */
export function isSummaryRow(cells: unknown[]): boolean {
  const first = cells.find((x) => String(x ?? "").trim() !== "");
  return /^(jumlah|total)(\s|$)/i.test(String(first ?? "").trim());
}

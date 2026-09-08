import { honorariumCategories, honorariumTotals, type Honorarium } from "./honorarium";
import { addTable, exportDateStamp, exportFilename, saveWorkbook, type ExportOptions } from "./export";
import { loadExcelJs, type ColumnSpec, type GroupSpec } from "./excel-layout";

export const honorariumTitle = (year: number | string) =>
  `Honorarium Penanggungjawaban Pengelola Keuangan Tahun Anggaran ${year}`;

// Follows Lampiran 3: identity of the recipient, the SK it rests on, then the honor calculation.
// Only SK names, programme and activity texts and the note wrap; everything else stays on one line.
const honorariumColumns: ColumnSpec[] = [
  { header: "No", width: 5, kind: "center" },
  { header: "Nama penerima", width: 30 },
  { header: "Jabatan struktural/fungsional", width: 26 },
  { header: "Jabatan dalam SK", width: 22 },
  { header: "Unit kerja penerima", width: 24 },
  { header: "Eselon", width: 8, kind: "center" },
  { header: "Jenis honorarium", width: 24 },
  { header: "Nomor SK", width: 22 },
  { header: "Nama SK", width: 40, kind: "wrap" },
  { header: "Unit kerja dalam SK", width: 24 },
  { header: "Program", width: 32, kind: "wrap" },
  { header: "Kegiatan", width: 32, kind: "wrap" },
  { header: "Subkegiatan", width: 32, kind: "wrap" },
  { header: "Pagu dana yang dikelola", width: 18, kind: "money" },
  { header: "Honor per bulan", width: 15, kind: "money" },
  { header: "Jumlah bulan", width: 8, kind: "int" },
  { header: "Honor bruto", width: 16, kind: "money" },
  { header: "Tarif pajak (%)", width: 8, kind: "center" },
  { header: "Pajak", width: 15, kind: "money" },
  { header: "Honor netto", width: 16, kind: "money" },
  { header: "Keterangan", width: 36, kind: "wrap" },
];
const honorariumGroups: GroupSpec[] = [
  { title: "Penerima honor", span: 6 },
  { title: "Dasar SK dan kegiatan", span: 7 },
  { title: "Perhitungan honor (Rp)", span: 7 },
  { title: "Keterangan", span: 1 },
];

export type HonorariumExportOptions = ExportOptions & {
  /** Budget year used for the title when there are no rows; otherwise each sheet takes its own year. */
  year?: number | string;
};

function honorariumRow(record: Honorarium, index: number) {
  const totals = honorariumTotals(record);
  const percent = record.taxMode === "percent";
  return [
    index + 1,
    record.recipient,
    record.position,
    record.skPosition,
    record.recipientDepartment,
    record.echelon,
    honorariumCategories[record.category],
    record.skNumber,
    record.skName,
    record.department,
    record.program,
    record.activity,
    record.subActivity,
    record.budget,
    record.monthlyAmount,
    record.months,
    (row: number) => ({ formula: `O${row}*P${row}`, result: totals.gross }),
    percent ? record.taxRate : null,
    percent ? (row: number) => ({ formula: `ROUND(Q${row}*R${row}/100,0)`, result: totals.tax }) : totals.tax,
    (row: number) => ({ formula: `Q${row}-S${row}`, result: totals.net }),
    record.notes,
  ];
}

export async function createHonorariumWorkbook(records: Honorarium[], options: HonorariumExportOptions = {}) {
  const ExcelJS = await loadExcelJs();
  const book = new ExcelJS.Workbook();
  book.creator = "Arsip Perjalanan";
  book.created = options.exportedAt ?? new Date();
  book.calcProperties.fullCalcOnLoad = true;
  const years = [...new Set(records.map((record) => record.year))].sort((a, b) => b - a);
  // One sheet per budget year keeps the title accurate even when several years are exported at once.
  const sheets: (number | string)[] = years.length ? years : [options.year ?? new Date().getFullYear()];
  for (const year of sheets) {
    const rows = records.filter((record) => record.year === year);
    addTable(book, {
      name: `Honorarium ${year}`,
      title: honorariumTitle(year),
      columns: honorariumColumns,
      groups: honorariumGroups,
      rows: rows.map(honorariumRow),
      sums: [17, 19, 20],
      frozenColumns: 2,
      empty: "Tidak ada rekap honorarium pada pilihan ini.",
    });
  }
  return book;
}

export function honorariumExportFilename(
  filters: { year: string; category: string; deleted?: boolean },
  exportedAt = new Date(),
) {
  const kind = filters.category in honorariumCategories
    ? honorariumCategories[filters.category as keyof typeof honorariumCategories]
    : null;
  const year = /^\d{4}$/.test(filters.year) ? `TAHUN ANGGARAN ${filters.year}` : "SEMUA TAHUN";
  return exportFilename(
    kind ? "HONORARIUM" : "HONORARIUM PENANGGUNGJAWABAN PENGELOLA KEUANGAN",
    kind ?? "SEMUA JENIS",
    year,
    filters.deleted ? "REKAP TERHAPUS" : null,
    exportDateStamp(exportedAt),
  );
}

export async function exportHonorariums(
  records: Honorarium[],
  filters: { year: string; category: string; deleted?: boolean },
) {
  const year = /^\d{4}$/.test(filters.year) ? filters.year : undefined;
  await saveWorkbook(
    await createHonorariumWorkbook(records, { year }),
    honorariumExportFilename(filters),
  );
}

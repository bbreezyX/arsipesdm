import type { CellValue, Workbook, Worksheet } from "exceljs";
import type { Trip } from "./model";
import { addLampiran8Sheet } from "./lampiran8-export";
import {
  addEmptyNotice,
  addTableHeader,
  addTitleBlock,
  addTotalRow,
  finishSheet,
  font,
  loadExcelJs,
  palette,
  styleDataRow,
  type ColumnSpec,
  type GroupSpec,
} from "./excel-layout";

export type ExportOptions = { exportedAt?: Date };

// The printed header stops at the title: institution lines, then the report title, then the table.
export type TableSpec = {
  name: string;
  title: string;
  columns: ColumnSpec[];
  groups?: GroupSpec[];
  rows: unknown[][];
  sums?: number[]; // 1-based column indexes to total
  frozenColumns?: number;
  fitToWidth?: boolean;
  empty: string;
};

/** A row value is a literal, or a function of the sheet row that builds a formula with its cached result. */
const resolveCell = (value: unknown, rowIndex: number): CellValue =>
  (typeof value === "function" ? (value as (row: number) => unknown)(rowIndex) : value) as CellValue;
const numeric = (value: CellValue): number =>
  typeof value === "number" ? value
  : value && typeof value === "object" && "result" in value && typeof value.result === "number" ? value.result
  : 0;

export function addTable(book: Workbook, spec: TableSpec): Worksheet {
  const sheet = book.addWorksheet(spec.name, { properties: { tabColor: { argb: palette.navy } } });
  const width = spec.columns.length;
  const firstHeader = addTitleBlock(sheet, width, spec.title);
  const firstData = addTableHeader(sheet, firstHeader, spec.columns, spec.groups);
  const totals = new Map<number, number>((spec.sums ?? []).map((column) => [column, 0]));
  spec.rows.forEach((values, index) => {
    const rowIndex = firstData + index;
    const row = sheet.getRow(rowIndex);
    values.forEach((value, column) => {
      if (value === null || value === undefined) return;
      const resolved = resolveCell(value, rowIndex);
      row.getCell(column + 1).value = resolved;
      if (totals.has(column + 1)) totals.set(column + 1, totals.get(column + 1)! + numeric(resolved));
    });
    styleDataRow(sheet, rowIndex, spec.columns);
  });
  const lastData = firstData + spec.rows.length - 1;
  if (!spec.rows.length) addEmptyNotice(sheet, firstData, width, spec.empty);
  else if (spec.sums?.length)
    addTotalRow(
      sheet,
      lastData + 1,
      firstData,
      spec.columns,
      spec.sums.map((column) => ({ column, result: totals.get(column) ?? 0 })),
    );
  finishSheet(sheet, {
    headerRows: [firstHeader, firstData - 1],
    lastDataRow: lastData,
    width,
    frozenColumns: spec.frozenColumns,
    fitToWidth: spec.fitToWidth,
  });
  return sheet;
}

export async function createTripWorkbook(trips: Trip[], options: ExportOptions = {}) {
  const ExcelJS = await loadExcelJs();
  const XLSX = await import("xlsx");
  const book = new ExcelJS.Workbook();
  book.creator = "Arsip Perjalanan";
  book.created = options.exportedAt ?? new Date();
  book.calcProperties.fullCalcOnLoad = true;
  addLampiran8Sheet(book, trips, XLSX);
  return book;
}

export async function createTemplateWorkbook() {
  const ExcelJS = await loadExcelJs();
  const { importFields } = await import("./import");
  const book = new ExcelJS.Workbook();
  book.creator = "Arsip Perjalanan";
  const sheet = book.addWorksheet("Perjalanan", { properties: { tabColor: { argb: palette.navy } } });
  const columns: ColumnSpec[] = importFields.map(([key, label]) => ({
    header: label,
    width: key === "title" ? 45 : key === "participants" ? 40 : 25,
  }));
  addTableHeader(sheet, 1, columns);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const notes = book.addWorksheet("Petunjuk");
  notes.getColumn(1).width = 115;
  const help = [
    "Panduan pengisian",
    "Satu baris untuk satu perjalanan. Isi pegawai dengan pemisah titik koma (;).",
    "Wajib: uraian perjalanan, tujuan, tanggal berangkat, tanggal pulang, bidang, pegawai.",
    "Tanggal: gunakan sel tanggal Excel atau DD/MM/YYYY atau YYYY-MM-DD.",
    "Untuk beberapa tujuan, isi Rincian tujuan satu lokasi per baris dalam sel. Kolom Tujuan berisi lokasi yang sama dengan pemisah titik koma (;).",
    "Biaya: angka rupiah bulat, tanpa rumus. Kosong berarti belum diketahui; 0 berarti nihil.",
    "Total realisasi adalah total satu perjalanan, sudah termasuk semua pegawai dan biaya bersama.",
    "Nomor surat dan NIP harus berformat teks agar nol di depan tidak hilang.",
    "Dokumen pendukung dan lokasi berkas fisik opsional; status rekap tidak bergantung pada lampiran.",
    "Impor tidak menandai pembayaran lunas secara otomatis.",
    "Impor ulang perjalanan identik dilewati; variasi ejaan perlu diperiksa operator.",
  ];
  help.forEach((line, index) => {
    const cell = notes.getCell(index + 1, 1);
    cell.value = line;
    cell.font = index === 0 ? font(12, { bold: true }) : font(10);
    cell.alignment = { vertical: "top", wrapText: true };
  });
  return book;
}

const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Official download names: uppercase Indonesian words, spaces, no characters Windows rejects. */
export function exportFilename(...parts: Array<string | null | undefined>) {
  const name = parts
    .flatMap((part) => String(part ?? "").trim().split(/\s+/))
    .filter(Boolean)
    .join(" ")
    .toLocaleUpperCase("id-ID")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${name}.xlsx`;
}
export const exportDateStamp = (date = new Date()) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);

export function tripExportFilename(label: string, exportedAt = new Date()) {
  const scope =
    label === "contoh" ? "DATA CONTOH"
    : label === "semua-tahun" ? "SEMUA TAHUN"
    : /^\d{4}$/.test(label) ? `TAHUN ${label}`
    : label;
  return exportFilename("REKAPITULASI ARSIP PERJALANAN DINAS ESDM", scope, exportDateStamp(exportedAt));
}

export async function saveWorkbook(book: Workbook, filename: string) {
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportTrips(trips: Trip[], label: string) {
  await saveWorkbook(await createTripWorkbook(trips), tripExportFilename(label));
}
export async function downloadTemplate() {
  await saveWorkbook(await createTemplateWorkbook(), exportFilename("TEMPLATE ARSIP PERJALANAN DINAS ESDM"));
}

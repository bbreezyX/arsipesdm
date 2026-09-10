import type { CellValue, Workbook, Worksheet } from "exceljs";
import type { Trip } from "./model";
import { totalCost, isComplete, paymentLabel, docLabels, duration } from "./model";
import { createLampiran6Sheet } from "./lampiran6-export";
import { lampiranReview } from "./lampiran6-schema";
import {
  addEmptyNotice,
  addTableHeader,
  addTitleBlock,
  addTotalRow,
  appendSheetJsSheet,
  excelDate,
  finishSheet,
  font,
  institution,
  loadExcelJs,
  palette,
  solid,
  styleDataRow,
  thinBorder,
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

// Only the purpose, the per-line destinations and the participant list wrap; other text stays on one line.
const tripColumns: ColumnSpec[] = [
  { header: "No", width: 5, kind: "center" },
  { header: "ID arsip", width: 15 },
  { header: "Uraian perjalanan", width: 50, kind: "wrap" },
  { header: "Nomor SPT", width: 20 },
  { header: "Nomor SPPD", width: 20 },
  { header: "Bidang", width: 22 },
  { header: "Tujuan", width: 26 },
  { header: "Rincian tujuan (satu per baris)", width: 26, kind: "wrap" },
  { header: "Cakupan perjalanan", width: 19 },
  { header: "Provinsi tujuan", width: 15 },
  { header: "Tanggal berangkat", width: 12, kind: "date" },
  { header: "Tanggal pulang", width: 12, kind: "date" },
  { header: "Lama (hari)", width: 7, kind: "int" },
  { header: "Pegawai", width: 42, kind: "wrap" },
  { header: "Total realisasi", width: 16, kind: "money" },
  { header: "Sudah dibayar", width: 16, kind: "money" },
  { header: "Status pembayaran", width: 17, kind: "center" },
  { header: "Kelengkapan", width: 12, kind: "center" },
  { header: "Kegiatan / subkegiatan", width: 30 },
  { header: "Kode rekening", width: 16 },
  { header: "Lokasi berkas fisik", width: 22 },
  { header: "Catatan", width: 40 },
];
const tripGroups: GroupSpec[] = [
  { title: "Identitas arsip", span: 6 },
  { title: "Perjalanan", span: 7 },
  { title: "Pegawai", span: 1 },
  { title: "Biaya (Rp)", span: 4 },
  { title: "Anggaran", span: 2 },
  { title: "Berkas dan catatan", span: 2 },
];
const scopeLabel = (t: Trip) =>
  t.lampiran6 ? (t.lampiran6.format === "luar-provinsi" ? "Luar Provinsi Jambi" : "Dalam Provinsi Jambi") : "";
const provinceLabel = (t: Trip) =>
  t.lampiran6 ? (t.lampiran6.format === "luar-provinsi" ? t.lampiran6.destinationProvince : "Jambi") : "";
const participantName = (t: Trip, id: string) =>
  id === "shared" ? "Biaya bersama" : (t.participants.find((p) => p.id === id)?.name ?? "");

export async function createTripWorkbook(trips: Trip[], options: ExportOptions = {}) {
  const ExcelJS = await loadExcelJs();
  const XLSX = await import("xlsx");
  const book = new ExcelJS.Workbook();
  book.creator = "Arsip Perjalanan";
  book.created = options.exportedAt ?? new Date();
  book.calcProperties.fullCalcOnLoad = true;

  addTable(book, {
    name: "Perjalanan",
    title: "REKAPITULASI ARSIP PERJALANAN DINAS",
    columns: tripColumns,
    groups: tripGroups,
    rows: trips.map((t, index) => [
      index + 1,
      t.code,
      t.title,
      t.sptNo,
      t.sppdNo,
      t.department,
      t.destination,
      t.destinations?.join("\n") ?? "",
      scopeLabel(t),
      provinceLabel(t),
      excelDate(t.startDate),
      excelDate(t.endDate),
      (row: number) => ({ formula: `L${row}-K${row}+1`, result: duration(t) }),
      t.participants.map((p) => p.name).join("; "),
      totalCost(t),
      t.paid,
      paymentLabel(t),
      isComplete(t) ? "Lengkap" : "Draft",
      t.activity,
      t.account,
      t.physicalLocation,
      t.notes,
    ]),
    sums: [15, 16],
    frozenColumns: 2,
    empty: "Tidak ada rekap perjalanan pada pilihan ini.",
  });

  const costs = trips.flatMap((t) => t.costs.map((c) => ({ trip: t, cost: c })));
  addTable(book, {
    name: "Rincian biaya",
    title: "RINCIAN BIAYA PERJALANAN DINAS",
    columns: [
      { header: "No", width: 5, kind: "center" },
      { header: "ID arsip", width: 16 },
      { header: "Uraian perjalanan", width: 50, kind: "wrap" },
      { header: "Pegawai", width: 30 },
      { header: "Kategori", width: 16 },
      { header: "Keterangan", width: 40 },
      { header: "Jumlah (Rp)", width: 16, kind: "money" },
    ],
    rows: costs.map(({ trip, cost }, index) => [
      index + 1,
      trip.code,
      trip.title,
      participantName(trip, cost.participantId),
      cost.category,
      cost.label,
      cost.amount,
    ]),
    sums: [7],
    frozenColumns: 2,
    empty: "Belum ada rincian biaya yang dicatat.",
  });

  const documents = trips.flatMap((t) => t.documents.map((d) => ({ trip: t, doc: d })));
  addTable(book, {
    name: "Daftar dokumen",
    title: "DAFTAR DOKUMEN PENDUKUNG PERJALANAN DINAS",
    columns: [
      { header: "No", width: 5, kind: "center" },
      { header: "ID arsip", width: 16 },
      { header: "Uraian perjalanan", width: 50, kind: "wrap" },
      { header: "Jenis", width: 24 },
      { header: "Bentuk", width: 10, kind: "center" },
      { header: "Nama berkas", width: 40 },
      { header: "Lokasi fisik", width: 30 },
    ],
    rows: documents.map(({ trip, doc }, index) => [
      index + 1,
      trip.code,
      trip.title,
      docLabels[doc.type],
      doc.kind === "file" ? "Digital" : "Fisik",
      doc.name,
      doc.location,
    ]),
    frozenColumns: 2,
    empty: "Belum ada dokumen pendukung yang dicatat.",
  });

  if (trips.some((t) => t.lampiran6)) {
    for (const format of ["dalam-provinsi", "luar-provinsi"] as const) {
      if (!trips.some((t) => t.lampiran6?.format === format)) continue;
      const sheet = appendSheetJsSheet(
        book,
        createLampiran6Sheet(trips, XLSX, format),
        format === "luar-provinsi" ? "Luar Daerah (Luar Provinsi)" : "Luar Daerah (Dalam Provinsi)",
        XLSX,
      );
      styleLampiranSheet(sheet);
    }
    const reviews = trips.flatMap((t) =>
      t.lampiran6
        ? [...new Set([...t.lampiran6.sourceIssues, ...lampiranReview(t.lampiran6, t.startDate, t.endDate)])]
            .map((note) => ({ trip: t, note }))
        : [],
    );
    if (reviews.length)
      addTable(book, {
        name: "Catatan rekap",
        title: "CATATAN PEMERIKSAAN REKAP PERJALANAN DINAS",
        columns: [
          { header: "No", width: 5, kind: "center" },
          { header: "ID arsip", width: 16 },
          { header: "Pegawai", width: 30 },
          { header: "Uraian perjalanan", width: 40, kind: "wrap" },
          { header: "Catatan pemeriksaan", width: 70, kind: "wrap" },
          { header: "Sumber", width: 30 },
        ],
        rows: reviews.map(({ trip, note }, index) => [
          index + 1,
          trip.code,
          trip.participants[0].name,
          trip.title,
          note,
          trip.source,
        ]),
        frozenColumns: 2,
        empty: "Tidak ada catatan pemeriksaan.",
      });
  }
  return book;
}

/** The source-shaped sheet keeps every cell address; only presentation changes. */
function styleLampiranSheet(sheet: Worksheet) {
  const width = sheet.columnCount;
  const lastRow = sheet.rowCount;
  // Keep related extension columns in the same colour family without moving their source addresses.
  const sections = [
    { ranges: [["R", "AA"]], header: "FF285E8C", body: "FFEDF4FB" }, // Biaya perjalanan dan total
    { ranges: [["AC", "AL"], ["BP", "BR"]], header: "FF326C50", body: "FFEDF7F0" }, // Penginapan
    { ranges: [["AM", "AO"], ["BI", "BI"]], header: "FF9A4F2F", body: "FFFCF0E8" }, // Transport darat dan mobil
    { ranges: [["AP", "BG"]], header: "FF695096", body: "FFF3EFFA" }, // Transport udara
    { ranges: [["BJ", "BK"], ["BM", "BM"]], header: "FF87620D", body: "FFFFF7DC" }, // BBM; BL tetap rincian tujuan
  ];
  const columnColors = new Map<number, (typeof sections)[number]>();
  for (const section of sections) {
    for (const [first, last] of section.ranges) {
      for (let c = sheet.getColumn(first).number; c <= sheet.getColumn(last).number; c++) columnColors.set(c, section);
    }
  }
  const heading = { bold: true, color: palette.black };
  const titleFonts = [font(14, heading), font(11, heading), font(10, { color: palette.black })];
  titleFonts.forEach((style, index) => {
    const row = sheet.getRow(index + 1);
    row.height = index === 0 ? 24 : 16;
    const cell = row.getCell(1);
    cell.font = style;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (let r = 4; r <= 6; r++) {
    const row = sheet.getRow(r);
    row.height = 26;
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c);
      cell.font = font(10, { bold: true, color: palette.white });
      cell.fill = solid(columnColors.get(c)?.header ?? palette.navy);
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder();
    }
  }
  sheet.getRow(7).height = 6;
  sheet.getRow(8).height = 6;
  for (let r = 9; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c);
      cell.font = font(10);
      const colors = columnColors.get(c);
      if (colors) cell.fill = solid(colors.body);
      cell.border = thinBorder();
      const numeric = typeof cell.value === "number";
      cell.alignment = {
        vertical: "middle",
        horizontal: numeric ? "right" : cell.value instanceof Date ? "center" : "left",
        wrapText: c === 12 || c === 28 || c === 64,
      };
    }
  }
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }];
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    printTitlesRow: "4:6",
    printTitlesColumn: "A:B",
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  sheet.headerFooter.oddFooter = `&L&"Arial"&8${institution.footer}&R&"Arial"&8Halaman &P dari &N`;
  sheet.properties.tabColor = { argb: "FFE8B748" };
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

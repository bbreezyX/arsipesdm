import type {
  Borders,
  CellValue,
  Fill,
  Font,
  Workbook,
  Worksheet,
} from "exceljs";
import type { CellObject, WorkSheet as SheetJsSheet } from "xlsx";

type ExcelJs = typeof import("exceljs");
type SheetJs = typeof import("xlsx");

/** ExcelJS ships as CommonJS; the namespace differs between Node and the browser bundle. */
export async function loadExcelJs(): Promise<ExcelJs> {
  const mod = await import("exceljs");
  return ((mod as { default?: ExcelJs }).default ?? mod) as ExcelJs;
}

// Palette follows DESIGN.md: navy headings and the golden marker of the Jambi crest.
export const palette = {
  ink: "FF172C44",
  navy: "FF234F73",
  black: "FF000000",
  gold: "FFFBF1D6",
  line: "FFC5CDD8",
  canvas: "FFF6F7F9",
  secondary: "FF6B7788",
  white: "FFFFFFFF",
};
const family = "Arial";
export const font = (
  size: number,
  options: { bold?: boolean; color?: string } = {},
): Partial<Font> => ({
  name: family,
  size,
  bold: options.bold ?? false,
  color: { argb: options.color ?? palette.ink },
});
export const solid = (argb: string): Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});
const edge = (argb: string) => ({ style: "thin" as const, color: { argb } });
export const thinBorder = (argb = palette.line): Partial<Borders> => ({
  top: edge(argb),
  left: edge(argb),
  bottom: edge(argb),
  right: edge(argb),
});
export const institution = {
  government: "PEMERINTAH PROVINSI JAMBI",
  department: "DINAS ENERGI DAN SUMBER DAYA MINERAL",
  footer: "Arsip Perjalanan Dinas ESDM Provinsi Jambi",
};

export type ColumnKind = "text" | "wrap" | "money" | "date" | "int" | "center";
export type ColumnSpec = { header: string; width: number; kind?: ColumnKind };
export type GroupSpec = { title: string; span: number };

/** Excel serial dates are UTC based; local midnight would shift a day in Asia/Jakarta. */
export function excelDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/** Centered title block: institution then report title, in black, across the table width. */
export function addTitleBlock(sheet: Worksheet, width: number, title: string) {
  const heading = { bold: true, color: palette.black };
  const lines: [string, Partial<Font>, number][] = [
    [institution.government, font(10, heading), 15],
    [institution.department, font(12, heading), 18],
    [title, font(14, heading), 24],
  ];
  lines.forEach(([value, style, height], index) => {
    const row = sheet.getRow(index + 1);
    row.height = height;
    sheet.mergeCells(index + 1, 1, index + 1, width);
    const cell = row.getCell(1);
    cell.value = value;
    cell.font = style;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  sheet.getRow(lines.length + 1).height = 6;
  return lines.length + 2; // first header row
}

/** Optional pale group band above the navy column headers. Returns the first data row. */
export function addTableHeader(
  sheet: Worksheet,
  firstRow: number,
  columns: ColumnSpec[],
  groups?: GroupSpec[],
) {
  let row = firstRow;
  if (groups) {
    let column = 1;
    const band = sheet.getRow(row);
    band.height = 18;
    for (const group of groups) {
      sheet.mergeCells(row, column, row, column + group.span - 1);
      const cell = band.getCell(column);
      cell.value = group.title;
      cell.font = font(10, { bold: true });
      cell.fill = solid(palette.gold);
      cell.alignment = { horizontal: "center", vertical: "middle" };
      for (let c = column; c < column + group.span; c++)
        band.getCell(c).border = thinBorder();
      column += group.span;
    }
    row++;
  }
  const header = sheet.getRow(row);
  header.height = 42; // room for three wrapped lines such as "Rincian tujuan (satu per baris)"
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = font(10, { bold: true, color: palette.white });
    cell.fill = solid(palette.navy);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
    sheet.getColumn(index + 1).width = column.width;
  });
  return row + 1;
}

const numberFormat: Partial<Record<ColumnKind, string>> = {
  money: "#,##0",
  int: "0",
  date: "dd/mm/yyyy",
};
export function styleDataRow(
  sheet: Worksheet,
  rowIndex: number,
  columns: ColumnSpec[],
) {
  const row = sheet.getRow(rowIndex);
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    const kind = column.kind ?? "text";
    // 10 pt, vertically centered, and wrapping only where the content needs it keeps rows compact.
    cell.font = font(10);
    cell.border = thinBorder();
    if (numberFormat[kind]) cell.numFmt = numberFormat[kind]!;
    cell.alignment = {
      vertical: "middle",
      wrapText: kind === "wrap",
      horizontal:
        kind === "money" ? "right"
        : kind === "date" || kind === "int" || kind === "center" ? "center"
        : "left",
    };
  });
}

/** Bold summary row with SUBTOTAL formulas so filtered views still add up. */
export function addTotalRow(
  sheet: Worksheet,
  rowIndex: number,
  firstDataRow: number,
  columns: ColumnSpec[],
  sums: { column: number; result: number }[],
  label = "Jumlah",
) {
  const row = sheet.getRow(rowIndex);
  row.height = 20;
  const firstSum = Math.min(...sums.map((s) => s.column));
  if (firstSum > 1) sheet.mergeCells(rowIndex, 1, rowIndex, firstSum - 1);
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.font = font(10, { bold: true });
    cell.fill = solid(palette.canvas);
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: column.kind === "money" ? "right" : "center" };
    if (column.kind === "money") cell.numFmt = "#,##0";
  });
  const labelCell = row.getCell(1);
  labelCell.value = label;
  labelCell.alignment = { vertical: "middle", horizontal: "right" };
  for (const sum of sums) {
    const letter = sheet.getColumn(sum.column).letter;
    row.getCell(sum.column).value = {
      formula: `SUBTOTAL(109,${letter}${firstDataRow}:${letter}${rowIndex - 1})`,
      result: sum.result,
    };
  }
}

export function addEmptyNotice(sheet: Worksheet, rowIndex: number, width: number, text: string) {
  sheet.mergeCells(rowIndex, 1, rowIndex, width);
  const cell = sheet.getCell(rowIndex, 1);
  cell.value = text;
  cell.font = font(10, { color: palette.secondary });
  cell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(rowIndex).height = 24;
}

export function finishSheet(
  sheet: Worksheet,
  options: {
    headerRows: [number, number];
    lastDataRow: number;
    width: number;
    frozenColumns?: number;
    fitToWidth?: boolean;
    tabColor?: string;
  },
) {
  const [firstHeader, lastHeader] = options.headerRows;
  sheet.views = [
    {
      state: "frozen",
      xSplit: options.frozenColumns ?? 0,
      ySplit: lastHeader,
      showGridLines: false,
    },
  ];
  if (options.lastDataRow >= lastHeader + 1)
    sheet.autoFilter = {
      from: { row: lastHeader, column: 1 },
      to: { row: options.lastDataRow, column: options.width },
    };
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: options.fitToWidth ?? true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${firstHeader}:${lastHeader}`,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  sheet.headerFooter.oddFooter = `&L&"Arial"&8${institution.footer}&R&"Arial"&8Halaman &P dari &N`;
  if (options.tabColor) sheet.properties.tabColor = { argb: options.tabColor };
}

/**
 * Copy a SheetJS worksheet (values, number formats, merges, widths) into the ExcelJS workbook.
 * Cell positions stay identical so the source-shaped sheets re-import unchanged.
 */
export function appendSheetJsSheet(
  book: Workbook,
  source: SheetJsSheet,
  name: string,
  XLSX: SheetJs,
): Worksheet {
  const sheet = book.addWorksheet(name);
  const range = XLSX.utils.decode_range(source["!ref"] ?? "A1:A1");
  for (let r = range.s.r; r <= range.e.r; r++)
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = source[XLSX.utils.encode_cell({ r, c })] as CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === null) continue;
      const target = sheet.getCell(r + 1, c + 1);
      let value: CellValue;
      if (cell.t === "d") {
        const d = cell.v as Date;
        value = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        target.numFmt = typeof cell.z === "string" ? cell.z : "dd/mm/yyyy";
      } else if (cell.t === "n") {
        value = cell.v as number;
        if (typeof cell.z === "string") target.numFmt = cell.z;
      } else if (cell.t === "b") value = cell.v as boolean;
      else value = String(cell.v);
      target.value = value;
    }
  for (const merge of source["!merges"] ?? [])
    sheet.mergeCells(merge.s.r + 1, merge.s.c + 1, merge.e.r + 1, merge.e.c + 1);
  (source["!cols"] ?? []).forEach((column, index) => {
    if (column?.wch) sheet.getColumn(index + 1).width = column.wch;
  });
  return sheet;
}

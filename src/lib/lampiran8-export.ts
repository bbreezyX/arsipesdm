import type { CellValue, Style, Workbook, Worksheet } from "exceljs";
import type * as XLSX from "xlsx";
import { excelDate, institution } from "./excel-layout";
import { resolveFundTrack } from "./fund-track";
import { isJambiRegion, jambiRegions, tripDestinations } from "./destinations";
import { createLampiran6Sheet } from "./lampiran6-export";
import { duration, type Trip } from "./model";
import template from "./lampiran8-template.json";

// Presentation snapshot from the supplied Lampiran 8, not its sample data or formulas.
// Lampiran 6 remains an internal data mapping; only Perjadin is exported.
const mapping: Record<string, string> = {
  B: "B", C: "C", D: "D", E: "E", F: "F", G: "G", H: "H", I: "I", J: "J", K: "K", L: "L",
  M: "P", N: "Q", O: "R", P: "S", Q: "T", R: "U", S: "V", T: "W", U: "Y", V: "X", X: "AA",
  Z: "AC", AA: "AD", AB: "AE", AC: "AF", AD: "AG", AE: "AH", AF: "AI", AG: "AJ", AH: "AK", AI: "AL",
  AL: "AO", AM: "AP", AN: "AQ", AO: "AR", AP: "AS", AQ: "AT", AR: "AU", AS: "AV", AT: "AW", AU: "AX",
  AV: "AY", AW: "AZ", AX: "BA", AY: "BB", AZ: "BC", BA: "BD", BB: "BE", BC: "BF", BD: "BG",
};
const expenseColumns = ["P", "R", "S", "T", "U", "V"];
const dateColumns = ["H", "I", "J", "AC", "AD", "AO", "AX", "BE", "BK"];
function tripCategory(trip: Trip): string {
  const data = trip.lampiran6;
  const activity = [trip.title, trip.activity, data?.activityName].filter(Boolean).join(" ");
  if (/\bbimtek\b|\bbimbingan\s+teknis\b/i.test(activity)) return "BIMTEK";
  if (data?.dailyRateMode === "diklat" || /\bdiklat\b|\bpendidikan\s+(?:dan|&)\s+pelatihan\b/i.test(activity)) return "Diklat";
  if (data) return data.format === "luar-provinsi"
    ? "Perjalanan Dinas Biasa Luar Daerah" : "Perjalanan Dinas Biasa Dalam Daerah";
  const destinations = tripDestinations(trip).filter(value => value.trim());
  if (!destinations.length) return "";
  const aliases = jambiRegions.map(value => value.replace(/^(Kota|Kabupaten) /, "").toLowerCase());
  return destinations.every(value => isJambiRegion(value) || aliases.includes(value.trim().toLowerCase()))
    ? "Perjalanan Dinas Biasa Dalam Daerah" : "Perjalanan Dinas Biasa Luar Daerah";
}
const sum = (values: Array<number | null>) => values.some(v => v !== null)
  ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;

function number(sheet: Worksheet, address: string): number | null {
  const cell = sheet.getCell(address);
  return typeof cell.value === "number" ? cell.value : typeof cell.result === "number" ? cell.result : null;
}

/** A manual amount takes precedence over a disagreeing rate/date calculation. */
function calculated(sheet: Worksheet, address: string, formula: string, result: number | null) {
  if (result === null || !Number.isFinite(result)) return;
  const existing = number(sheet, address);
  if (existing === null || existing === result) sheet.getCell(address).value = { formula, result };
}

function totals(sheet: Worksheet, row: number) {
  const expense = sum(expenseColumns.map(col => number(sheet, `${col}${row}`)));
  if (expense !== null) sheet.getCell(`W${row}`).value = { formula: `SUM(P${row},R${row}:V${row})`, result: expense };
  realizationTotal(sheet, row);
}

function realizationTotal(sheet: Worksheet, row: number) {
  const amount = number(sheet, `W${row}`);
  // Evidence describes an expense; it must neither replace nor duplicate the ledger total.
  if (amount !== null) sheet.getCell(`BQ${row}`).value = { formula: `W${row}`, result: amount };
}

export function addLampiran8Sheet(book: Workbook, trips: Trip[], xlsx: typeof XLSX) {
  const sheet = book.addWorksheet("Perjadin");
  sheet.properties.defaultRowHeight = 10.2;
  template.widths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  for (const cell of template.cells) {
    if (cell.r >= 8) continue;
    const target = sheet.getCell(cell.r, cell.c);
    target.style = structuredClone(template.styles[cell.s]) as Partial<Style>;
    if ("v" in cell) target.value = cell.v as CellValue;
  }
  template.heights.slice(0, 7).forEach((height, i) => { sheet.getRow(i + 1).height = height; });
  for (const range of template.merges) sheet.mergeCells(range);
  const years = [...new Set(trips.map(trip => trip.startDate.slice(0, 4)).filter(Boolean))].sort();
  sheet.getCell("A1").value = `REKAPITULASI BELANJA PERJALANAN DINAS PEMERINTAH PROVINSI JAMBI${years.length ? ` TA ${years.join(", ")}` : ""}`;
  sheet.getCell("A3").value = `SKPD : ${institution.department}`;

  let row = 8;
  const bodyStyles = template.cells.filter(cell => cell.r === 8);
  function prepare() {
    sheet.getRow(row).height = template.heights[7];
    for (const cell of bodyStyles) {
      sheet.getCell(row, cell.c).style = structuredClone(template.styles[cell.s]) as Partial<Style>;
    }
    sheet.getCell(`C${row}`).numFmt = "@";
    for (const column of dateColumns) {
      const cell = sheet.getCell(`${column}${row}`);
      cell.numFmt = "dd/mm/yyyy";
      cell.dataValidation = {
        type: "date", operator: "between", allowBlank: true,
        formulae: [new Date(Date.UTC(1900, 0, 1)), new Date(Date.UTC(9999, 11, 31))],
        showErrorMessage: true, errorStyle: "stop", errorTitle: "Penting!",
        error: "Masukkan tanggal Excel yang valid. Gunakan format DD/MM/YYYY.",
      };
    }
  }
  for (const trip of trips) {
    const category = tripCategory(trip);
    if (!trip.lampiran6) {
      prepare();
      const values: Record<string, CellValue> = {
        A: resolveFundTrack(trip), B: trip.participants.map(p => p.name).join("; "),
        C: trip.participants.map(p => p.nip).join("; "), D: trip.participants.map(p => p.position).join("; "),
        F: trip.sptNo, G: trip.sppdNo, I: excelDate(trip.startDate), J: excelDate(trip.endDate),
        K: { formula: `J${row}-I${row}+1`, result: duration(trip) }, L: trip.title, N: trip.destination, BR: category,
      };
      for (const [col, value] of Object.entries(values)) sheet.getCell(`${col}${row}`).value = value;
      // Generic archives have no reliable breakdown; retain their ledger total without external links.
      if (trip.costs.length) sheet.getCell(`W${row}`).value = trip.costs.reduce((total, cost) => total + cost.amount, 0);
      realizationTotal(sheet, row);
      row++;
      continue;
    }
    const source = createLampiran6Sheet([trip], xlsx, trip.lampiran6.format);
    const last = xlsx.utils.decode_range(source["!ref"]!).e.r + 1;
    for (let sourceRow = 9; sourceRow <= last; sourceRow++, row++) {
      prepare();
      for (const [targetCol, sourceCol] of Object.entries(mapping)) {
        const identity = sheet.getColumn(targetCol).number <= 14;
        const value = source[`${sourceCol}${identity ? 9 : sourceRow}`]?.v;
        if (value === null || value === undefined) continue;
        sheet.getCell(`${targetCol}${row}`).value = value instanceof Date
          ? new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())) : value as CellValue;
      }
      sheet.getCell(`A${row}`).value = resolveFundTrack(trip);
      sheet.getCell(`BR${row}`).value = category;
      if (sourceRow === 9) {
        const d = trip.lampiran6;
        if (d.lodgingMode === "thirty-percent") {
          sheet.getCell(`Z${row}`).value = "30%";
          sheet.getCell(`AE${row}`).value = d.lodgingNights;
          sheet.getCell(`AH${row}`).value = d.lodgingBaseRate === null ? null : d.lodgingBaseRate * 0.3;
          sheet.getCell(`AI${row}`).value = d.lodgingCost;
        }
        calculated(sheet, `K${row}`, `J${row}-I${row}+1`, duration(trip));
        const days = number(sheet, `K${row}`);
        for (const [rateCol, totalCol] of [["O", "P"], ["Q", "R"]]) {
          const rate = number(sheet, `${rateCol}${row}`);
          // Missing totals remain unknown; exporting must not create an unrecorded expense.
          if (number(sheet, `${totalCol}${row}`) !== null) calculated(sheet, `${totalCol}${row}`, `${rateCol}${row}*K${row}`, rate !== null && days !== null ? rate * days : null);
        }
      }
      const checkIn = sheet.getCell(`AC${row}`).value;
      const checkOut = sheet.getCell(`AD${row}`).value;
      if (checkIn instanceof Date && checkOut instanceof Date) {
        calculated(sheet, `AE${row}`, `AD${row}-AC${row}`, (checkOut.getTime() - checkIn.getTime()) / 86400000);
      }
      const nights = number(sheet, `AE${row}`), rate = number(sheet, `AH${row}`);
      if (number(sheet, `AI${row}`) !== null) calculated(sheet, `AI${row}`, `AH${row}*AE${row}`, nights !== null && rate !== null ? nights * rate : null);
      totals(sheet, row);
    }
  }
  if (!trips.length) prepare();
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 7, showGridLines: false }];
  sheet.pageSetup = { ...template.pageSetup, orientation: "landscape", printArea: `A1:BR${Math.max(8, row - 1)}`, printTitlesRow: "4:7" };
  return sheet;
}

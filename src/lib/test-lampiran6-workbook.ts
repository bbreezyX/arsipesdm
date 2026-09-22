import * as XLSX from "xlsx";
import { appendSheetJsSheet, loadExcelJs } from "./excel-layout";
import { createLampiran6Sheet } from "./lampiran6-export";
import type { Trip } from "./model";

/** Legacy import fixture; the downloadable workbook now contains only Lampiran 8. */
export async function legacyLampiranWorkbook(trips: Trip[]) {
  const ExcelJS = await loadExcelJs();
  const book = new ExcelJS.Workbook();
  for (const format of ["dalam-provinsi", "luar-provinsi"] as const) {
    if (!trips.some(trip => trip.lampiran6?.format === format)) continue;
    appendSheetJsSheet(book, createLampiran6Sheet(trips, XLSX, format),
      format === "luar-provinsi" ? "Luar Daerah (Luar Provinsi)" : "Luar Daerah (Dalam Provinsi)", XLSX);
  }
  return book;
}

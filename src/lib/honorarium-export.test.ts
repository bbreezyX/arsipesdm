import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import type { Workbook as ExcelWorkbook } from "exceljs";
import { createHonorariumWorkbook, honorariumTitle } from "./honorarium-export";
import { newHonorarium, type Honorarium } from "./honorarium";

function record(patch: Partial<Honorarium>): Honorarium {
  return {
    ...newHonorarium(), id: "h1", version: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null,
    year: 2026, skNumber: "SK-001", skName: "Pengelola keuangan", recipient: "Penerima Uji", skPosition: "KPA", budget: 11793495075,
    monthlyAmount: 3010000, months: 6, taxMode: "percent", taxRate: 15, ...patch,
  };
}
const percent = record({});
const manual = record({ id: "h2", recipient: "Penerima Kedua", taxMode: "amount", taxAmount: 100000, notes: "Pajak manual" });
const older = record({ id: "h3", year: 2025, category: "procurement", skNumber: "", budget: null, monthlyAmount: 810000, months: 3 });

async function reopen(book: ExcelWorkbook) {
  return XLSX.read(Buffer.from(await book.xlsx.writeBuffer()), { type: "buffer" });
}
const grid = (sheet: XLSX.WorkSheet) =>
  XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: true });

test("honorarium workbook has one titled sheet per budget year with formulas and totals", async () => {
  const book = await createHonorariumWorkbook([older, percent, manual]);
  const reopened = await reopen(book);
  assert.deepEqual(reopened.SheetNames, ["Honorarium 2026", "Honorarium 2025"]);

  // Header is institution, department, title, then a spacer row: no scope or export note.
  const rows = grid(reopened.Sheets["Honorarium 2026"]);
  assert.equal(rows[0][0], "PEMERINTAH PROVINSI JAMBI");
  assert.equal(rows[1][0], "DINAS ENERGI DAN SUMBER DAYA MINERAL");
  assert.equal(rows[2][0], "Honorarium Penanggungjawaban Pengelola Keuangan Tahun Anggaran 2026");
  assert.deepEqual(rows[4].filter(Boolean), ["Penerima honor", "Dasar SK dan kegiatan", "Perhitungan honor (Rp)", "Keterangan"]);
  assert.equal(rows[5][0], "No");
  assert.equal(rows[5][19], "Honor netto");

  const first = rows[6];
  assert.equal(first[1], "Penerima Uji");
  assert.equal(first[6], "Pengelola keuangan");
  assert.equal(first[13], 11793495075);
  assert.deepEqual(first.slice(14, 20), [3010000, 6, 18060000, 15, 2709000, 15351000]);
  const second = rows[7];
  assert.deepEqual(second.slice(16, 21), [18060000, null, 100000, 17960000, "Pajak manual"]);

  const total = rows[8];
  assert.equal(total[0], "Jumlah");
  assert.deepEqual([total[16], total[18], total[19]], [36120000, 2809000, 33311000]);
  const sheet = book.getWorksheet("Honorarium 2026")!;
  assert.equal((sheet.getCell("Q7").value as { formula: string }).formula, "O7*P7");
  assert.equal((sheet.getCell("S7").value as { formula: string }).formula, "ROUND(Q7*R7/100,0)");
  assert.equal(sheet.getCell("S8").value, 100000);
  assert.equal((sheet.getCell("T8").value as { formula: string }).formula, "Q8-S8");
  assert.match(String((sheet.getCell("Q9").value as { formula: string }).formula), /^SUBTOTAL\(109,Q7:Q8\)$/);

  const older2025 = grid(reopened.Sheets["Honorarium 2025"]);
  assert.equal(older2025[2][0], honorariumTitle(2025));
  assert.equal(older2025[6][6], "Pengadaan barang/jasa");
  assert.equal(older2025[6][13], null);
  assert.deepEqual(older2025[6].slice(16, 20), [2430000, 15, 364500, 2065500]);
});

test("empty export still carries the requested year in the title", async () => {
  const reopened = await reopen(await createHonorariumWorkbook([], { year: "2026" }));
  assert.deepEqual(reopened.SheetNames, ["Honorarium 2026"]);
  const rows = grid(reopened.Sheets["Honorarium 2026"]);
  assert.equal(rows[2][0], "Honorarium Penanggungjawaban Pengelola Keuangan Tahun Anggaran 2026");
  assert.equal(rows[6][0], "Tidak ada rekap honorarium pada pilihan ini.");
});

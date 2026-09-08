import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import type { Workbook as ExcelWorkbook } from "exceljs";
import { createTripWorkbook, createTemplateWorkbook } from "./export";
import { loadExcelJs } from "./excel-layout";
import { type Trip, tripSchema } from "./model";
import { convertRows, detectHeaderRow, isSummaryRow, suggestMapping } from "./import";
import { formatDestinations } from "./destinations";
const trip: Trip = {
  ...tripSchema.parse({
    title: "Uji ekspor",
    destination: "Kerinci",
    department: "Energi",
    startDate: "2024-01-02",
    endDate: "2024-01-03",
    sptNo: "0001/2024",
    sppdNo: "",
    participants: [
      {
        id: "a",
        name: "Pegawai Uji",
        nip: "00123",
        position: "",
        department: "Energi",
      },
    ],
    costs: [],
    paid: null,
    requiredDocs: ["spt"],
    notes: "",
    activity: "",
    account: "",
    physicalLocation: "",
    correctionReason: "",
  }),
  id: "export-test",
  code: "PD/2024/0001",
  version: 1,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  documents: [],
  history: [],
  source: "Uji",
  deletedAt: null,
};
const zero: Trip = {
  ...trip,
  id: "zero",
  code: "PD/2024/0002",
  costs: [
    {
      id: "cost",
      category: "Biaya lainnya",
      label: "Nihil",
      amount: 0,
      participantId: "shared",
    },
  ],
  paid: 0,
};
/** Read the workbook back the way the import dialog does: SheetJS, header row detected. */
async function reopen(book: ExcelWorkbook): Promise<WorkBook> {
  return XLSX.read(Buffer.from(await book.xlsx.writeBuffer()), { type: "buffer", cellDates: true });
}
function tableRows(sheet: WorkSheet) {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: true });
  const headerRow = detectHeaderRow(grid);
  const headers = grid[headerRow - 1].map((x) => String(x ?? "").trim());
  return grid
    .slice(headerRow)
    .filter((cells) => cells.some((x) => x !== null && x !== "") && !isSummaryRow(cells))
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? null])));
}
test("XLSX round trip preserves unknown costs, numeric zero and text references", async () => {
  const reopened = await reopen(await createTripWorkbook([trip, zero]));
  assert.deepEqual(reopened.SheetNames, [
    "Perjalanan",
    "Rincian biaya",
    "Daftar dokumen",
  ]);
  const rows = tableRows(reopened.Sheets.Perjalanan);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["Nomor SPT"], "0001/2024");
  assert.equal(rows[0]["Total realisasi"], null);
  assert.equal(rows[1]["Total realisasi"], 0);
  assert.equal(rows[0].Kelengkapan, "Draft");
  assert.equal(rows[1].Kelengkapan, "Lengkap");
  assert.equal(rows[0]["Sudah dibayar"], null);
  assert.equal(rows[1]["Sudah dibayar"], 0);
  assert.equal(rows[0]["Lama (hari)"], 2);
  const costGrid = XLSX.utils.sheet_to_json<unknown[]>(reopened.Sheets["Rincian biaya"], { header: 1 });
  assert.equal(costGrid.flat().includes("Nihil"), true);
  assert.equal(costGrid.flat().includes("Pegawai"), true);
  assert.equal(costGrid.flat().includes("Peserta"), false);
});
test("no exported trip sheet labels people as peserta", async () => {
  const reopened = await reopen(await createTripWorkbook([trip, zero]));
  for (const name of reopened.SheetNames) {
    const labels = XLSX.utils
      .sheet_to_json<unknown[]>(reopened.Sheets[name], { header: 1, defval: null })
      .flat()
      .filter((cell): cell is string => typeof cell === "string");
    assert.equal(labels.includes("Peserta"), false, `${name} still uses Peserta`);
    assert.equal(labels.includes("Jumlah pegawai dalam rekap"), false, `${name} still has the count column`);
  }
  assert.ok("Pegawai" in tableRows(reopened.Sheets.Perjalanan)[0]);
  assert.ok("Pegawai" in tableRows(reopened.Sheets["Rincian biaya"])[0]);
});
test("exported register opens with a centered title block, grouped headings and a subtotal row", async () => {
  const ExcelJS = await loadExcelJs();
  const source = await createTripWorkbook([trip, zero], { exportedAt: new Date("2026-09-08T03:00:00Z") });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await source.xlsx.writeBuffer());
  const sheet = book.getWorksheet("Perjalanan")!;
  const width = sheet.getRow(6).cellCount;
  assert.equal(sheet.getCell("A1").value, "PEMERINTAH PROVINSI JAMBI");
  assert.equal(sheet.getCell("A2").value, "DINAS ENERGI DAN SUMBER DAYA MINERAL");
  assert.equal(sheet.getCell("A3").value, "REKAPITULASI ARSIP PERJALANAN DINAS");
  assert.equal(sheet.getCell("A4").value, null, "no scope or export note below the title");
  for (const row of [1, 2, 3]) {
    assert.equal(sheet.getCell(row, 1).alignment?.horizontal, "center", `row ${row} centered`);
    assert.equal(sheet.getCell(row, 1).font?.color?.argb, "FF000000", `row ${row} title in black`);
    assert.equal(sheet.getCell(row, width).master.address, `A${row}`, `row ${row} merged across the table`);
  }
  assert.equal(sheet.getCell("A5").value, "Identitas arsip");
  assert.equal(sheet.getCell("A6").value, "No");
  assert.equal(sheet.getCell("N6").value, "Pegawai");
  assert.equal(sheet.getCell("O6").value, "Total realisasi");
  assert.equal(sheet.getCell("O6").fill?.type, "pattern");
  assert.equal(sheet.getCell("O6").font?.bold, true);
  assert.equal(sheet.getCell("K7").numFmt, "dd/mm/yyyy");
  assert.equal(sheet.getCell("O8").numFmt, "#,##0");
  assert.equal(sheet.getCell("A9").value, "Jumlah");
  assert.equal(sheet.getCell("O9").formula, "SUBTOTAL(109,O7:O8)");
  assert.equal(sheet.views[0]?.state, "frozen");
  assert.equal((sheet.views[0] as { ySplit?: number }).ySplit, 6);
  assert.equal(sheet.pageSetup.printTitlesRow, "5:6");
  const register = (await reopen(source)).Sheets.Perjalanan;
  assert.equal(register.O9.v, 0, "cached subtotal is written so readers without a calc engine see it");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(register, { header: 1, blankrows: true });
  assert.equal(detectHeaderRow(grid), 6);
  assert.equal(isSummaryRow(grid[8]), true);
});
test("detectHeaderRow falls back to the first row and ignores title text", () => {
  assert.equal(detectHeaderRow([["Judul"], [], ["Uraian perjalanan", "Tujuan", "Pegawai"], ["x", "y", "z"]]), 3);
  assert.equal(detectHeaderRow([["a", "b"], ["c", "d"]]), 1);
  assert.equal(detectHeaderRow([]), 1);
  assert.equal(isSummaryRow([null, "", "Total biaya", 5]), true);
  assert.equal(isSummaryRow(["Totalitas kerja", 5]), false);
});
test("download template contains all required headings and a separate guidance sheet", async () => {
  const book = await createTemplateWorkbook();
  const reopened = await reopen(book);
  assert.deepEqual(reopened.SheetNames, ["Perjalanan", "Petunjuk"]);
  const [headings] = XLSX.utils.sheet_to_json<string[]>(
    reopened.Sheets.Perjalanan,
    { header: 1 },
  );
  assert(headings.includes("Tanggal berangkat"));
  assert(headings.includes("Pegawai"));
  assert.equal(headings.includes("Peserta"), false);
  assert(headings.includes("Total realisasi"));
  assert.equal(detectHeaderRow([headings]), 1);
});
test("multiple destinations survive the general Excel export and import", async () => {
  const destinations = ["Kabupaten Bungo", "Kantor di Tebo; ruang pertemuan"];
  const multiple = {...trip, destinations, destination: formatDestinations(destinations)};
  const reopened = await reopen(await createTripWorkbook([multiple]));
  const rows = tableRows(reopened.Sheets.Perjalanan);
  const imported = convertRows(rows, suggestMapping(Object.keys(rows[0])), "test.xlsx", "Perjalanan", 2);
  assert.deepEqual(imported[0].errors, []);
  assert.deepEqual(imported[0].trip?.destinations, destinations);
  assert.equal(imported[0].trip?.destination, multiple.destination);
  assert.equal(imported[0].trip?.startDate, "2024-01-02");
  assert.equal(imported[0].trip?.endDate, "2024-01-03");
});

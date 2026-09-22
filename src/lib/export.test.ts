import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import type { Workbook as ExcelWorkbook } from "exceljs";
import { createTripWorkbook, createTemplateWorkbook, tripExportFilename } from "./export";
import { type Trip, tripSchema } from "./model";
import { detectHeaderRow, isSummaryRow } from "./import";
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
test("single-sheet export preserves unknown costs, zero, identifiers and destinations", async () => {
  const destinations = ["Kabupaten Bungo", "Kabupaten Tebo"];
  const multiple = { ...trip, destinations, destination: formatDestinations(destinations), fundTrack: "TU" };
  const reopened = await reopen(await createTripWorkbook([multiple, zero]));
  assert.deepEqual(reopened.SheetNames, ["Perjadin"]);
  const sheet = reopened.Sheets.Perjadin;
  assert.equal(sheet.W8?.v ?? null, null);
  assert.equal(sheet.W9.v, 0);
  assert.equal(sheet.C8.v, "00123");
  assert.equal(sheet.F8.v, "0001/2024");
  assert.equal(sheet.A8.v, "TU");
  assert.equal(sheet.K8.v, 2);
  assert.equal(sheet.N8.v, "Kabupaten Bungo; Kabupaten Tebo");
  assert.equal(sheet.BR8.v, "Perjalanan Dinas Biasa Dalam Daerah");
  assert.equal(sheet.BR9.v, "Perjalanan Dinas Biasa Dalam Daerah");
});
test("trip export filenames are uppercase, scoped, and dated in Indonesian", () => {
  const exportedAt = new Date("2026-09-08T03:00:00Z");
  assert.equal(
    tripExportFilename("2026", exportedAt),
    "REKAPITULASI ARSIP PERJALANAN DINAS ESDM TAHUN 2026 8 SEPTEMBER 2026.xlsx",
  );
  assert.equal(
    tripExportFilename("semua-tahun", exportedAt),
    "REKAPITULASI ARSIP PERJALANAN DINAS ESDM SEMUA TAHUN 8 SEPTEMBER 2026.xlsx",
  );
  assert.equal(
    tripExportFilename("contoh", exportedAt),
    "REKAPITULASI ARSIP PERJALANAN DINAS ESDM DATA CONTOH 8 SEPTEMBER 2026.xlsx",
  );
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
  assert(headings.includes("Jenis dana"));
  assert.equal(detectHeaderRow([headings]), 1);
});

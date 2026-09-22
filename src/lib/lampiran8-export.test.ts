import assert from "node:assert/strict";
import { test } from "node:test";
import { createTripWorkbook } from "./export";
import { loadExcelJs } from "./excel-layout";
import { lampiran6Schema, lampiranCosts } from "./lampiran6-schema";
import { tripSchema, type Trip } from "./model";

function fixture(): Trip {
  const lampiran6 = lampiran6Schema.parse({
    claimedDays: 3, dailyRate: 100000, dailyTotal: 300000,
    representationRate: 50000, representationTotal: 150000,
    lodgingCost: 400000, landCost: 75000, waterCost: 25000, airCost: 500000,
    recordedTotal: 1450000, receiptTotal: 1440000,
    lodgings: [{ name: "Hotel Uji", checkIn: "2026-09-01", checkOut: "2026-09-03", days: 2, dailyRate: 200000, total: 400000 }],
    groundTransports: [{ mode: "Mobil", provider: "BH 1234", total: 75000, fuelLiters: 10.5 }],
    outbound: { price: 500000, airline: "Uji", transits: [{ origin: "Jakarta", destination: "Jambi" }] },
    additionalCosts: [{ category: "Penginapan", label: "Tambahan hotel", amount: 20000 }],
  });
  return {
    ...tripSchema.parse({ title: "Koordinasi", destination: "Jambi", department: "Energi", startDate: "2026-09-01", endDate: "2026-09-03", participants: [{ id: "p", name: "Pegawai Uji", nip: "001234", position: "Analis", department: "Energi" }], lampiran6, costs: lampiranCosts(lampiran6, "p"), fundTrack: "GU 1" }),
    id: "uji", code: "PD/2026/0001", createdAt: "2026-09-01", updatedAt: "2026-09-01", version: 1, documents: [], history: [], source: "Uji", deletedAt: null,
  };
}

test("Lampiran 8 exported file contains only Perjadin and matches reference geometry", async () => {
  const source = await createTripWorkbook([fixture()]);
  const ExcelJS = await loadExcelJs();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await source.xlsx.writeBuffer());
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ["Perjadin"]);
  const sheet = book.getWorksheet("Perjadin")!;
  assert.equal(sheet.columnCount, 70);
  assert.equal(sheet.getCell("Y1").master.address, "A1");
  assert.equal(sheet.getCell("V4").master.address, "O4");
  assert.equal(sheet.getCell("BP4").master.address, "BE4");
  assert.equal(sheet.getColumn("B").width, 8.88671875);
  assert.equal(sheet.getColumn("AI").width, 11.33203125);
  assert.equal(sheet.getRow(6).height, 40.95);
  assert.equal(sheet.getRow(8).height, 10.2);
  assert.equal(sheet.getCell("C8").value, "001234");
  assert.equal(sheet.getCell("C8").numFmt, "@");
  assert.equal(sheet.getCell("A8").value, "GU 1");
  assert.equal(sheet.getCell("O4").fill.type, "pattern");
  assert.deepEqual(sheet.getCell("O4").fill, { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" }, bgColor: { indexed: 64 } });
  assert.equal(sheet.getCell("B8").font.size, 8);
  assert.deepEqual(sheet.getCell("B4").fill, { type: "pattern", pattern: "solid", fgColor: { argb: "FF8EA9DB" }, bgColor: { indexed: 64 } });
});

test("Lampiran 8 totals do not count rates or evidence twice and keep manual receipts", async () => {
  const sheet = (await createTripWorkbook([fixture()])).getWorksheet("Perjadin")!;
  assert.ok(sheet);
  assert.equal(sheet.getCell("K8").result, 3);
  assert.equal(sheet.getCell("P8").result, 300000);
  assert.equal(sheet.getCell("R8").result, 150000);
  assert.equal(sheet.getCell("W8").formula, "SUM(P8,R8:V8)");
  assert.equal(sheet.getCell("W8").result, 1450000);
  assert.equal(sheet.getCell("X8").value, 1440000);
  assert.equal(sheet.getCell("AI8").result, 400000);
  assert.equal(sheet.getCell("AL8").value, 75000);
  assert.equal(sheet.getCell("AJ8").value, null, "do not invent rental/retribution breakdown");
  assert.equal(sheet.getCell("BQ8").formula, "W8");
  assert.equal(sheet.getCell("BQ8").result, 1450000);
  assert.equal(sheet.getCell("BQ9").result, 20000);
  assert.equal(sheet.getCell("BQ10").value, null);
  assert.equal(sheet.getCell("W9").result, 20000);
  assert.equal(sheet.getCell("B9").value, "Pegawai Uji");
  assert.equal(sheet.getCell("P9").value, null);
  assert.equal(sheet.getCell("W10").value, null, "transit evidence is not another expense");
  assert.equal(sheet.getCell("AQ10").value, "Jakarta");
  assert.equal(sheet.getCell("BE8").value, null, "no invented ship details");
});

test("Lampiran 8 retains mismatching manual amounts, zero and unknown", async () => {
  const trip = fixture();
  Object.assign(trip.lampiran6!, { dailyTotal: 123000, representationTotal: 0, receiptTotal: null, claimedDays: 2 });
  const sheet = (await createTripWorkbook([trip])).getWorksheet("Perjadin")!;
  assert.ok(sheet);
  assert.equal(sheet.getCell("K8").value, 2);
  assert.equal(sheet.getCell("P8").value, 123000);
  assert.equal(sheet.getCell("R8").value, 0);
  assert.equal(sheet.getCell("X8").value, null);
});

test("Lampiran 8 exports lodging allowance without inventing hotel or ship bookings", async () => {
  const trip = fixture();
  Object.assign(trip.lampiran6!, { lodgingMode: "thirty-percent", lodgingBaseRate: 500000, lodgingNights: 2, lodgingCost: 300000, lodgings: [], dailyTotal: null });
  const sheet = (await createTripWorkbook([trip])).getWorksheet("Perjadin")!;
  assert.equal(sheet.getCell("Z8").value, "30%");
  assert.equal(sheet.getCell("AH8").value, 150000);
  assert.equal(sheet.getCell("AI8").result, 300000);
  assert.equal(sheet.getCell("P8").value, null, "a rate alone cannot create a recorded expense");
  assert.equal(sheet.getCell("AC8").value, null);
});

test("generic and empty exports keep unknown totals distinct from zero", async () => {
  const trip = { ...fixture(), lampiran6: undefined, costs: [] };
  const zero = { ...trip, id: "zero", costs: [{ id: "c", participantId: "p", category: "Biaya lainnya" as const, label: "Nihil", amount: 0 }] };
  const book = await createTripWorkbook([trip, zero]);
  const sheet = book.getWorksheet("Perjadin")!;
  assert.equal(sheet.getCell("W8").value, null);
  assert.equal(sheet.getCell("W9").value, 0);
  assert.equal(sheet.getCell("BQ8").value, null);
  assert.equal(sheet.getCell("BQ9").formula, "W9");
  assert.equal(sheet.getCell("BQ9").result, 0);
  assert.equal(sheet.getCell("P9").value, null);
  const empty = (await createTripWorkbook([])).getWorksheet("Perjadin")!;
  assert.equal(empty.getCell("K8").value, null);
  assert.equal(empty.getCell("W8").value, null);
});

test("PENTING date rules survive export while Keterangan stays empty", async () => {
  const trip = fixture();
  trip.notes = "Catatan asli";
  const source = await createTripWorkbook([trip]);
  const ExcelJS = await loadExcelJs();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await source.xlsx.writeBuffer());
  const sheet = book.getWorksheet("Perjadin")!;
  for (let row = 8; row <= sheet.rowCount; row++) {
    for (const column of ["H", "I", "J", "AC", "AD", "AO", "AX", "BE", "BK"]) {
      const cell = sheet.getCell(`${column}${row}`);
      assert.equal(cell.numFmt, "dd/mm/yyyy");
      assert.equal(cell.dataValidation.type, "date");
      assert.equal(cell.dataValidation.allowBlank, true);
    }
    assert.equal(sheet.getCell(`B${row}`).value, "Pegawai Uji");
    assert.equal(sheet.getCell(`I${row}`).isMerged, false);
  }
  assert.equal((sheet.getCell("I8").value as Date).toISOString(), "2026-09-01T00:00:00.000Z");
  for (let row = 8; row <= sheet.rowCount; row++) assert.equal(sheet.getCell(`Y${row}`).value, null);
  assert.equal(trip.notes, "Catatan asli");
  assert.equal(sheet.getCell("AJ8").value, null);
  assert.equal(sheet.getCell("BE8").value, null);
});

test("BR classifies province scope and explicit training activities on every continuation row", async () => {
  for (const [scope, title, mode, expected] of [
    ["dalam-provinsi", "Koordinasi ke Kabupaten Bungo", "manual", "Perjalanan Dinas Biasa Dalam Daerah"],
    ["luar-provinsi", "Koordinasi ke Jakarta", "manual", "Perjalanan Dinas Biasa Luar Daerah"],
    ["luar-provinsi", "Mengikuti BIMTEK pengelolaan arsip", "diklat", "BIMTEK"],
    ["dalam-provinsi", "Bimbingan Teknis pengelolaan arsip", "manual", "BIMTEK"],
    ["dalam-provinsi", "Diklat pengelolaan arsip", "manual", "Diklat"],
    ["luar-provinsi", "Peningkatan kompetensi", "diklat", "Diklat"],
  ] as const) {
    const trip = fixture();
    trip.title = title;
    Object.assign(trip.lampiran6!, { format: scope, dailyRateMode: mode });
    const book = await createTripWorkbook([trip]);
    const sheet = book.getWorksheet("Perjadin")!;
    for (let row = 8; row <= sheet.rowCount; row++) assert.equal(sheet.getCell(`BR${row}`).value, expected);
    sheet.eachRow(row => row.eachCell(cell => {
      if (cell.formula) assert.equal(cell.formula.includes("!"), false, "no references to deleted sheets");
    }));
  }
});

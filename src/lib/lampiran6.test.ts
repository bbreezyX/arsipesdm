import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { convertLampiran6, lampiranHeaderRow } from "./lampiran6-import";
import {
  lampiran6Schema,
  lampiranCosts,
  lampiranReview,
  groundTransportSchema,
} from "./lampiran6-schema";
import { createTripWorkbook } from "./export";
import { totalCost, tripSchema, fingerprint, type Trip } from "./model";
import { formatDestinations } from "./destinations";

function sourceSheet() {
  const sheet: XLSX.WorkSheet = {
    "!ref": "A1:BH11",
    "!merges": [
      "F9:F10",
      "H9:H10",
      "I9:I10",
      "J9:J10",
      "K9:K10",
      "L9:L10",
      "P9:P10",
      "Q9:Q10",
    ].map(XLSX.utils.decode_range),
  };
  function set(address: string, value: string | number, formula?: string) {
    sheet[address] = {
      t: typeof value === "number" ? "n" : "s",
      v: value,
      ...(formula ? { f: formula } : {}),
    };
  }
  set("A3", "SKPD : Dinas ESDM ( Sekretariat )");
  set("B4", "Nama yang Melakukan Perjadin");
  set("C4", "NIP");
  set("R4", "Biaya Perjalanan Dinas");
  set("AA4", "Total Kuitansi (Rp)");
  set("A9", 1);
  set("B9", "Pegawai Uji A");
  set("C9", "000123456789012345");
  set("D9", "Analis");
  set("E9", "III/c");
  set("F9", "0001/ST/2025");
  set("G9", "0001/SPPD/2025");
  set("H9", "11/03/2025");
  set("I9", "12/03/2025");
  set("J9", "14/03/2025");
  set("K9", "3");
  set("L9", "Koordinasi kegiatan " + "arsip sumber ".repeat(25));
  set("P9", "Jambi");
  set("Q9", "Kerinci");
  set("R9", 370000);
  set("S9", 1110000, "R9*K9");
  set("U9", 0);
  set("V9", 0);
  set("W9", 100000);
  set("Z9", 1235000, "S9+U9+V9+W9+V10");
  set("AA9", 1235000, "Z9");
  set("A10", 2);
  set("B10", "Pegawai Uji B");
  set("C10", "000123456789012346");
  set("G10", "0002/SPPD/2025");
  set("R10", 370000);
  set("S10", 1110000, "K9*R10");
  set("U10", 0);
  set("V10", 25000);
  set("Z10", 1140000, "S10+V10+V11");
  set("AA10", 1140000);
  set("V11", 5000);
  set("AB11", "Hotel 30%");
  return sheet;
}
test("same NIP with different names is reviewed without silently dropping an employee", () => {
  const sheet = sourceSheet();
  sheet.C10 = { ...sheet.C9 };
  sheet.G10 = { ...sheet.G9 };
  const rows = convertLampiran6(
    sheet,
    "test.xlsx",
    "Luar Daerah (Dalam Provinsi)",
  );
  assert.notEqual(fingerprint(rows[0].trip!), fingerprint(rows[1].trip!));
  assert(
    rows.every((row) =>
      row.warnings?.some((note) => note.includes("nama pegawai berbeda")),
    ),
  );
  const repeated = {
    ...rows[0].trip!,
    lampiran6: { ...rows[0].trip!.lampiran6!, sourceNo: "99" },
  };
  assert.equal(fingerprint(rows[0].trip!), fingerprint(repeated));
});
test("Per-employee travel recap recognizes merged headers and keeps one employee per entry", () => {
  const sheet = sourceSheet();
  assert.equal(lampiranHeaderRow(sheet), 4);
  const rows = convertLampiran6(
    sheet,
    "test.xlsx",
    "Luar Daerah (Dalam Provinsi)",
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.errors),
    [[], []],
  );
  assert.equal(rows[1].trip?.startDate, "2025-03-12");
  assert.equal(rows[1].trip?.sptNo, "0001/ST/2025");
  assert.equal(rows[0].trip?.participants[0].nip, "000123456789012345");
  assert.equal(rows[0].trip?.participants.length, 1);
  assert(rows[0].trip!.title.length > 250);
  assert.equal(rows[1].trip?.sppdNo, "0002/SPPD/2025");
});
test("continuation costs are attached once and other employees' formula references are flagged", () => {
  const [first, second] = convertLampiran6(
    sourceSheet(),
    "test.xlsx",
    "Luar Daerah (Dalam Provinsi)",
  );
  assert.equal(totalCost(first.trip!), 1210000);
  assert.equal(first.trip?.lampiran6?.recordedTotal, 1235000);
  assert.equal(first.trip?.paid, null);
  assert(
    first.warnings?.some(
      (w) => w.includes("V10") && w.includes("pegawai lain"),
    ),
  );
  assert.equal(totalCost(second.trip!), 1140000);
  assert.deepEqual(second.trip?.lampiran6?.sourceRows, [10, 11]);
  assert.equal(second.trip?.lampiran6?.additionalCosts.length, 1);
  assert(
    !second.warnings?.some(
      (w) => w.includes("V11") && w.includes("pegawai lain"),
    ),
  );
});
test("blank unmerged dates are not inherited and formula errors cannot become valid expenses", () => {
  const sheet = sourceSheet();
  sheet["!merges"] = sheet["!merges"]?.filter((m) => m.s.c !== 8);
  sheet.S10 = { t: "e", v: 15, w: "#VALUE!", f: "K9*R10" };
  const rows = convertLampiran6(
    sheet,
    "test.xlsx",
    "Luar Daerah (Dalam Provinsi)",
  );
  assert(rows[1].errors.some((e) => e.includes("Tanggal")));
  assert(rows[1].errors.some((e) => e.includes("#VALUE!")));
});
test("zero optional hotel dates stay unavailable with an explicit source note", () => {
  const sheet = sourceSheet();
  sheet.AC9 = { t: "s", v: "Penginapan 30%" };
  sheet.AF9 = { t: "n", v: 0 };
  sheet.AG9 = { t: "n", v: 0 };
  const [row] = convertLampiran6(
    sheet,
    "test.xlsx",
    "Luar Daerah (Dalam Provinsi)",
  );
  assert.equal(row.errors.length, 0);
  assert.equal(row.trip?.lampiran6?.lodgings[0].checkIn, "");
  assert(
    row.warnings?.some(
      (note) => note.includes("AF9") && note.includes("angka 0"),
    ),
  );
});
test("evidence totals never duplicate the cost ledger; API rejects inconsistent ledger entries", () => {
  const unknown = lampiran6Schema.parse({
    additionalCosts: [
      { category: "Penginapan", label: "Tambahan", amount: null },
    ],
  });
  assert.equal(lampiranCosts(unknown, "a").length, 0);
  unknown.additionalCosts[0].amount = 0;
  assert.equal(lampiranCosts(unknown, "a")[0].amount, 0);
  const data = lampiran6Schema.parse({
    lodgingCost: 100000,
    landCost: 200000,
    lodgings: [{ total: 100000 }],
    groundTransports: [{ total: 200000 }],
    receiptTotal: 300000,
  });
  assert.equal(
    lampiranCosts(data, "a").reduce((sum, c) => sum + c.amount, 0),
    300000,
  );
  const input = convertLampiran6(sourceSheet(), "test.xlsx", "Sheet")[0].trip!;
  assert(
    !tripSchema.safeParse({
      ...input,
      costs: [...input.costs, { ...input.costs[0], id: "duplicate-extra" }],
    }).success,
  );
  assert(
    lampiranReview(
      { ...data, claimedDays: 1 },
      "2025-03-12",
      "2025-03-14",
    ).some((note) => note.includes("3 hari")),
  );
});
test("source-shaped XLSX round trip preserves identifiers, per-person amounts, evidence and merged-row meaning", async () => {
  const rows = convertLampiran6(
    sourceSheet(),
    "test.xlsx",
    "Luar Daerah (Dalam Provinsi)",
  );
  const trips: Trip[] = rows.map((row, i) => ({
    ...row.trip!,
    id: `test-${i}`,
    code: `PD/2025/${i}`,
    version: 1,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    history: [],
    documents: [],
    source: row.source,
    deletedAt: null,
  }));
  trips[0].lampiran6!.lodgings = [
    {
      name: "Hotel Uji",
      room: "001",
      reference: "000087",
      checkIn: "2025-03-12",
      checkOut: "2025-03-14",
      days: 2,
      application: "Aplikasi Uji",
      orderId: "000123",
      dailyRate: 100000,
      total: 200000,
    },
  ];
  trips[0].lampiran6!.groundTransports = [
    groundTransportSchema.parse({mode: "Mobil dinas", provider: "BH 1234 XX", vehicleType: "Toyota Innova", fuelType: "Pertamax", fuelPricePerLiter: 12500, fuelLiters: 16.5, total: 206250}),
    // A continuation can contain only vehicle/BBM details, including a recorded zero.
    groundTransportSchema.parse({vehicleType: "Mobil lainnya", fuelType: "Solar", fuelPricePerLiter: 0}),
  ];
  trips[0].destinations = ["Kabupaten Bungo", "Kabupaten Tebo"];
  trips[0].destination = formatDestinations(trips[0].destinations);
  const book = await createTripWorkbook(trips);
  const reopened = XLSX.read(
    Buffer.from(await book.xlsx.writeBuffer()),
    { type: "buffer", cellDates: true },
  );
  const again = convertLampiran6(
    reopened.Sheets["Luar Daerah (Dalam Provinsi)"],
    "export.xlsx",
    "Luar Daerah (Dalam Provinsi)",
  );
  assert.equal(again.length, 2);
  assert.deepEqual(
    again.map((row) => row.errors),
    [[], []],
  );
  assert.deepEqual(
    again.map((row) => totalCost(row.trip!)),
    trips.map(totalCost),
  );
  assert.equal(
    again[0].trip?.participants[0].nip,
    trips[0].participants[0].nip,
  );
  assert.equal(
    again[0].trip?.lampiran6?.receiptTotal,
    trips[0].lampiran6?.receiptTotal,
  );
  assert.deepEqual(
    again[0].trip?.lampiran6?.lodgings,
    trips[0].lampiran6?.lodgings,
  );
  assert.deepEqual(again[0].trip?.lampiran6?.groundTransports, trips[0].lampiran6?.groundTransports);
  assert.deepEqual(again[0].trip?.destinations, trips[0].destinations);
  assert.equal(again[0].trip?.destination, trips[0].destination);
  assert(again.every((row) => row.trip?.paid === null));
});

test("vehicle and fuel fields accept legacy transport records and validate prices without adding expenses", () => {
  const legacy = groundTransportSchema.parse({mode: "Travel", provider: "Penyedia lama", total: 100000});
  assert.equal(legacy.vehicleType, "");
  assert.equal(legacy.fuelType, "");
  assert.equal(legacy.fuelPricePerLiter, null);
  assert.equal(groundTransportSchema.safeParse({...legacy, fuelPricePerLiter: -1}).success, false);
  assert.equal(groundTransportSchema.safeParse({...legacy, fuelPricePerLiter: 1e12 + 1}).success, false);
  const data = lampiran6Schema.parse({landCost: 100000, groundTransports: [{...legacy, vehicleType: " Mobil kustom ", fuelType: " BBM kustom ", fuelPricePerLiter: 12500}]});
  assert.equal(data.groundTransports[0].vehicleType, "Mobil kustom");
  assert.equal(data.groundTransports[0].fuelType, "BBM kustom");
  assert.equal(lampiranCosts(data, "person").reduce((sum, item) => sum + item.amount, 0), 100000);
});

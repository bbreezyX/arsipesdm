import { setupTestDatabase } from "./test-database";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { batchRecapSchema, copyRecapAmount, isBatchEmpty, newBatchRow, resumeBatch, setRecapAmount, updateSharedJourney, type SharedJourney } from "./batch-recap";
import type { Employee } from "./employees";
import { totalCost, tripSchema } from "./model";
import { groupTaskLetters } from "./task-letters";
import { createTripWorkbook } from "./export";
import * as XLSX from "xlsx";

const shared: SharedJourney = {
  format: "dalam-provinsi", destinationProvince: "",
  title: "Perjalanan pengujian rekap", sptNo: "ST-TEST-BATCH", startDate: "2025-02-03", endDate: "2025-02-05",
  destination: "Kabupaten Kerinci", destinations: ["Kabupaten Kerinci"], origin: "Kota Jambi", claimedDays: 3,
  program: "Program uji", activityName: "Kegiatan anggaran", subActivity: "Subkegiatan uji", dailyRateMode: "auto",
  fundTrack: "",
};
const people: Employee[] = ["A", "B", "C"].map((name, index) => ({
  id: name, name: `Pegawai Uji ${name}`, nip: `00${index}`, rank: index === 0 ? "IV/a" : "III/c",
  position: "Analis", department: index === 2 ? "Sekretariat" : "Energi", version: 1, identities: [], deletedAt: null,
}));

test("each selected employee receives a distinct identity, ledger and supporting evidence", () => {
  const first = newBatchRow(shared, people[0]);
  const second = newBatchRow(shared, people[2]);
  assert.equal(tripSchema.safeParse(first.input).success, true);
  assert.equal(first.input.lampiran6!.dailyTotal, 1110000);
  assert.equal(second.input.department, "Sekretariat");
  assert.equal(first.input.lampiran6!.rank, "IV/a");
  assert.equal(second.input.sppdNo, "");
  assert.equal(second.input.paid, null);
  assert.notEqual(first.input.lampiran6!.lodgings, second.input.lampiran6!.lodgings);
  first.input.lampiran6!.outbound.ticketNo = "ONLY-FIRST";
  assert.equal(second.input.lampiran6!.outbound.ticketNo, "");
  const edited = setRecapAmount(first.input, "landCost", 100000);
  assert.equal(totalCost(edited), 1210000);
  assert.equal(totalCost(second.input), 1110000);
  assert.ok(edited.costs.every(cost => cost.participantId === "A"));
});

test("copy affects only the requested cost and recipients, preserving zero versus unknown", () => {
  const rows = people.map(person => newBatchRow(shared, person));
  rows[0].input = setRecapAmount(rows[0].input, "lodgingCost", 0);
  rows[1].input.sppdNo = "SPPD-B";
  rows[0].input.account = "REKENING-A";
  rows[1].input.account = "REKENING-B";
  rows[1].input.lampiran6!.outbound.ticketNo = "TICKET-B";
  const copied = copyRecapAmount(rows, "A", "lodgingCost", ["B"]);
  assert.equal(copied[1].input.lampiran6!.lodgingCost, 0);
  assert.equal(copied[2].input.lampiran6!.lodgingCost, null);
  assert.equal(copied[1].input.sppdNo, "SPPD-B");
  assert.equal(copied[1].input.account, "REKENING-B");
  assert.equal(copied[1].input.lampiran6!.outbound.ticketNo, "TICKET-B");
  assert.equal(rows[1].input.lampiran6!.lodgingCost, null);
  copied[2].selected = false;
  assert.equal(copyRecapAmount(copied, "A", "lodgingCost", ["C"])[2].input.lampiran6!.lodgingCost, null);
  const cleared = copyRecapAmount(copied, "B", "landCost", ["A"]);
  assert.equal(cleared[0].input.lampiran6!.landCost, null);
  const manual = setRecapAmount(rows[0].input, "dailyTotal", 500000);
  assert.equal(manual.lampiran6!.dailyRateMode, "manual");
  assert.equal(manual.lampiran6!.dailyRate, null);
});

test("shared edits recalculate allowances without changing SPPD, costs or individual exceptions", () => {
  const rows = people.map(person => newBatchRow(shared, person));
  rows[0].input.sppdNo = "SPPD-A";
  rows[0].input.account = "REKENING-A";
  rows[1].input = setRecapAmount(rows[1].input, "dailyTotal", 700000);
  rows[1].input.title = "Maksud perjalanan khusus";
  rows[2].selected = false;
  const changed = updateSharedJourney({ shared, rows }, { claimedDays: 2, destination: "Kabupaten Bungo", destinations: ["Kabupaten Bungo"] });
  assert.equal(changed.rows[0].input.lampiran6!.dailyTotal, 740000);
  assert.equal(changed.rows[0].input.sppdNo, "SPPD-A");
  assert.equal(changed.rows[0].input.account, "REKENING-A");
  assert.equal(changed.rows[1].input.account, "");
  assert.equal(changed.rows[1].input.lampiran6!.dailyTotal, 700000);
  assert.equal(changed.rows[1].input.title, "Maksud perjalanan khusus");
  assert.equal(changed.rows[2].selected, false);
  assert.equal(changed.rows[2].input.lampiran6!.dailyTotal, 740000);
  assert.equal(rows[0].input.lampiran6!.dailyTotal, 1110000);
});

test("mode switching retains all selections and personal costs without spreading exceptions", () => {
  const rows = people.map(person => newBatchRow(shared, person));
  rows[0].input.title = "Maksud khusus A";
  rows[0].input.account = "REKENING-A";
  rows[1].input.account = "REKENING-B";
  rows[1].input = setRecapAmount(rows[1].input, "lodgingCost", 125000);
  const baseline = structuredClone(rows[0].input);
  const edited = setRecapAmount(baseline, "landCost", 50000);
  edited.account = "REKENING-A-BARU";
  const resumed = resumeBatch(edited, people, { shared, rows }, baseline);
  assert.equal(resumed.rows.length, 3);
  assert.equal(resumed.shared.title, shared.title);
  assert.equal(resumed.rows[1].input.title, shared.title);
  assert.equal(resumed.rows[0].input.lampiran6!.landCost, 50000);
  assert.equal(resumed.rows[1].input.lampiran6!.lodgingCost, 125000);
  assert.equal(resumed.rows[2].input.lampiran6!.landCost, null);
  assert.deepEqual(resumed.rows.map(row => row.input.account), ["REKENING-A-BARU", "REKENING-B", ""]);
});

test("empty batch needs no discard confirmation, any journey or selection does", () => {
  const empty: SharedJourney = {
    title: "", sptNo: "", startDate: "", endDate: "", destination: "", destinations: [],
    origin: "", claimedDays: null, program: "", activityName: "", subActivity: "",
    dailyRateMode: "auto", format: "dalam-provinsi", destinationProvince: "", fundTrack: "",
  };
  assert.equal(isBatchEmpty({ shared: empty, rows: [] }), true);
  assert.equal(isBatchEmpty({ shared: { ...empty, title: "   " }, rows: [] }), true);
  const row = newBatchRow(shared, people[0]);
  assert.equal(isBatchEmpty({ shared: empty, rows: [{ ...row, selected: false }] }), true);
  assert.equal(isBatchEmpty({ shared: empty, rows: [row] }), false);
  const patches: Partial<SharedJourney>[] = [
    { title: "Monitoring" }, { sptNo: "ST-1" }, { startDate: "2025-01-02" }, { endDate: "2025-01-03" },
    { destination: "Kerinci" }, { destinations: ["Kerinci"] }, { origin: "Jambi" }, { claimedDays: 2 },
    { program: "Program" }, { activityName: "Kegiatan" }, { subActivity: "Sub" },
    { destinationProvince: "Sumatera Barat" }, { format: "luar-provinsi" }, { dailyRateMode: "manual" }, { fundTrack: "UP" },
  ];
  for (const patch of patches) assert.equal(isBatchEmpty({ shared: { ...empty, ...patch }, rows: [] }), false, JSON.stringify(patch));
});

test("batch validates every row, rejects repeated employees and malformed ledgers", () => {
  const rows = people.map(person => newBatchRow(shared, person).input);
  assert.equal(batchRecapSchema.safeParse({ trips: rows }).success, true);
  assert.equal(batchRecapSchema.safeParse({ trips: [] }).success, false);
  assert.equal(batchRecapSchema.safeParse({ trips: Array(101).fill(rows[0]) }).success, false);
  const invalid = batchRecapSchema.safeParse({ trips: [rows[0], { ...rows[1], endDate: "2024-01-01" }] });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.equal(invalid.error.issues[0].path[1], 1);
  assert.equal(batchRecapSchema.safeParse({ trips: [rows[0], { ...rows[0], sppdNo: "DIFFERENT" }] }).success, false);
  assert.equal(batchRecapSchema.safeParse({ trips: [{ ...rows[0], costs: [] }] }).success, false);
  assert.equal(batchRecapSchema.safeParse({ trips: [{ ...rows[0], lampiran6: undefined, costs: [] }] }).success, false);
});

test("atomic batch save, duplicates, retry, workspace isolation, grouping and export", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rek-batch-test-"));
  const cleanupDatabase = await setupTestDatabase();
  process.env.DATA_DIR = directory; process.env.DEMO_ENABLED = "false";
  delete process.env.ADMIN_EMAIL; delete process.env.ADMIN_PASSWORD;
  const { db, getTrips } = await import("./db");
  const { saveRecapBatch } = await import("./batch-recap-db");
  try {
    const trips = people.map(person => newBatchRow(shared, person).input);
    trips[0] = setRecapAmount(trips[0], "landCost", 100000);
    trips[1] = setRecapAmount(trips[1], "lodgingCost", 250000);
    trips[0].account = "REKENING-UJI-A";
    trips[1].account = "REKENING-UJI-B";
    const saved = (await saveRecapBatch(trips, "office", "Operator uji"));
    assert.ok(saved.added);
    assert.equal(saved.added.length, 3);
    assert.equal(new Set(saved.added.map(trip => trip.code)).size, 3);
    assert.equal((await getTrips("demo")).length, 0);
    assert.equal(saved.added[0].history[0].actor, "Operator uji");
    assert.deepEqual((await saveRecapBatch(trips, "office", "Operator uji")), { duplicate: 0 });
    assert.equal((await getTrips("office")).length, 3);
    for (const trip of (await getTrips("office"))) {
      assert.equal(trip.account, trips.find(input => input.participants[0].id === trip.participants[0].id)!.account);
    }
    const extra = { ...trips[0], sptNo: "NEW-ST" };
    assert.deepEqual((await saveRecapBatch([extra, trips[1]], "office", "Operator uji")), { duplicate: 1 });
    assert.equal((await getTrips("office")).length, 3, "one duplicate prevents all new writes");
    await assert.rejects(async () => (await saveRecapBatch([extra, extra], "office", "Operator uji")), /DUPLICATE/);
    assert.equal((await getTrips("office")).length, 3, "failure after first insert must roll it back");
    const next = (await saveRecapBatch([extra], "office", "Operator uji"));
    assert.ok(next.added);
    assert.equal(next.added[0].code, "PD/2025/0004");
    assert.equal((await saveRecapBatch(trips, "demo", "Operator demo")).added?.length, 3);
    const grouped = groupTaskLetters(saved.added);
    assert.equal(grouped.letters.length, 1);
    assert.equal(grouped.letters[0].peopleCount, 3);
    assert.equal(grouped.letters[0].total, 3680000);
    const workbook = XLSX.read(Buffer.from(await (await createTripWorkbook(saved.added)).xlsx.writeBuffer()), { type: "buffer" });
    const sheets = workbook.SheetNames.map(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }));
    const output = JSON.stringify(sheets);
    for (const person of people) assert.ok(output.includes(person.name));
    assert.ok(output.includes("250000"));
    assert.deepEqual(workbook.SheetNames, ["Perjadin"]);
  } finally {
    await db.close(); await cleanupDatabase(); rmSync(directory, { recursive: true, force: true });
  }
});

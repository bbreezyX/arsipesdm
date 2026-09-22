import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { applyLodgingAllowance, calculateLodgingAllowance, changeLodgingMode, officeLodgingBaseRate } from "./lodging-allowance";
import { lampiran6Schema, lampiranCosts, lampiranReview } from "./lampiran6-schema";
import { tripSchema, totalCost, type Trip, type TripInput } from "./model";
import { copyRecapAmount, newBatchRow, prepareRecap, setRecapAmount, sharedJourney, updateSharedJourney } from "./batch-recap";
import { recapSectionStates } from "./recap-visual-state";
import { legacyLampiranWorkbook } from "./test-lampiran6-workbook";
import { convertLampiran6 } from "./lampiran6-import";
import { setupTestDatabase } from "./test-database";

function sample(): TripInput {
  return tripSchema.parse({
    title: "Uji penginapan 30%", sptNo: "ST-PENGINAPAN", destination: "Kabupaten Bungo", department: "Energi",
    startDate: "2025-03-12", endDate: "2025-03-14", participants: [{ id: "person-a", name: "Pegawai A" }], costs: [],
    lampiran6: lampiran6Schema.parse({ origin: "Kota Jambi", claimedDays: 3 }),
  });
}
function withAllowance(input = sample(), nights: number | null = 2) {
  return prepareRecap({ ...input, lampiran6: {
    ...changeLodgingMode(input.lampiran6!, "thirty-percent"), lodgingNights: nights,
  } });
}
function archive(input: TripInput): Trip {
  return { ...input, id: "lodging-trip", code: "PD/2025/0001", version: 1, createdAt: "2025-03-14", updatedAt: "2025-03-14", documents: [], history: [], source: "Test", deletedAt: null };
}

test("30 percent uses the confirmed office rate and explicit nights, keeping unknown and zero distinct", () => {
  assert.equal(officeLodgingBaseRate, 510000);
  assert.equal(calculateLodgingAllowance(510000, 1), 153000);
  assert.equal(calculateLodgingAllowance(510000, 2), 306000);
  assert.equal(calculateLodgingAllowance(510000, 0), 0);
  assert.equal(calculateLodgingAllowance(510000, null), null);
  assert.equal(calculateLodgingAllowance(null, 2), null);
  assert.equal(calculateLodgingAllowance(510002, 1), 153001);
  const legacy = lampiran6Schema.parse({ lodgingCost: 210000 });
  assert.equal(legacy.lodgingMode, "manual");
  assert.equal(legacy.lodgingBaseRate, null);
  assert.equal(applyLodgingAllowance(legacy).lodgingCost, 210000);
  const enabled = changeLodgingMode(legacy, "thirty-percent");
  assert.equal(enabled.lodgingBaseRate, 510000);
  assert.equal(enabled.lodgingNights, null, "do not assume days of travel equal nights");
  assert.equal(enabled.lodgingCost, null);
  const input = withAllowance();
  assert.equal(input.lampiran6!.lodgingCost, 306000);
  assert.equal(totalCost(input), 306000);
  assert.equal(input.costs.length, 1, "computed lodging enters the ledger exactly once");
  assert.match(input.costs[0].label, /30%.*510\.000.*2 malam/);
  assert.equal(tripSchema.safeParse(input).success, true);
  assert.equal(recapSectionStates(input.lampiran6!).hotel.label, "Penginapan 30%");
  assert.equal(recapSectionStates(withAllowance(sample(), null).lampiran6!).hotel.tone, "different");
  assert.equal(recapSectionStates(withAllowance(sample(), 0).lampiran6!).hotel.tone, "filled");
});

test("lodging calculations stay personal across shared changes, copies and manual mode", () => {
  const first = withAllowance();
  const shared = sharedJourney(first);
  const second = newBatchRow(shared, { id: "person-b", name: "Pegawai B", nip: "", position: "Analis", department: "Energi", rank: "III/a" });
  const rows = [{ key: "person-a", selected: true, input: first }, second];
  assert.equal(second.input.lampiran6!.lodgingMode, "manual");
  const changed = updateSharedJourney({ shared, rows }, { claimedDays: 5 });
  assert.equal(changed.rows[0].input.lampiran6!.lodgingNights, 2);
  assert.equal(changed.rows[0].input.lampiran6!.lodgingCost, 306000);
  assert.equal(changed.rows[1].input.lampiran6!.lodgingCost, null);
  const copied = copyRecapAmount(rows, "person-a", "lodgingCost", ["person-b"]);
  assert.equal(copied[1].input.lampiran6!.lodgingCost, 306000);
  assert.equal(copied[1].input.lampiran6!.lodgingMode, "manual", "copy nominal only, not another employee's entitlement");
  assert.equal(copied[1].input.lampiran6!.lodgingNights, null);
  const manual = setRecapAmount(first, "lodgingCost", 100000);
  assert.equal(manual.lampiran6!.lodgingMode, "manual");
  assert.equal(totalCost(manual), 100000);
  const restored = prepareRecap({ ...manual, lampiran6: changeLodgingMode(manual.lampiran6!, "thirty-percent") });
  assert.equal(restored.lampiran6!.lodgingNights, 2);
  assert.equal(totalCost(restored), 306000);
  assert.equal(totalCost(first), 306000, "changes do not mutate the source");
});

test("validation rejects inconsistent 30 percent totals and invalid inputs", () => {
  const input = withAllowance();
  const inconsistent = { ...input.lampiran6!, lodgingCost: 500000 };
  assert.equal(tripSchema.safeParse({ ...input, lampiran6: inconsistent, costs: lampiranCosts(inconsistent, input.participants[0].id) }).success, false);
  for (const patch of [{ lodgingBaseRate: -1 }, { lodgingNights: -1 }, { lodgingNights: 1.5 }, { lodgingNights: 3661 }, { lodgingBaseRate: 1e12 + 1 }]) {
    assert.equal(lampiran6Schema.safeParse({ ...input.lampiran6!, ...patch }).success, false);
  }
  assert.ok(lampiranReview({ ...input.lampiran6!, lodgingNights: 3 }, input.startDate, input.endDate).some(note => note.includes("selisih tanggal")));
  assert.deepEqual(lampiranReview(input.lampiran6!, input.startDate, input.endDate), []);
});

test("30 percent basis survives Excel export and import, with legacy workbooks still manual", async () => {
  const input = withAllowance();
  const book = await legacyLampiranWorkbook([archive(input)]);
  const reopened = XLSX.read(Buffer.from(await book.xlsx.writeBuffer()), { type: "buffer", cellDates: true });
  const sheet = reopened.Sheets["Luar Daerah (Dalam Provinsi)"];
  const rows = convertLampiran6(sheet, "allowance.xlsx", "Luar Daerah (Dalam Provinsi)");
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].trip!.lampiran6!.lodgingMode, "thirty-percent");
  assert.equal(rows[0].trip!.lampiran6!.lodgingBaseRate, 510000);
  assert.equal(rows[0].trip!.lampiran6!.lodgingNights, 2);
  assert.equal(totalCost(rows[0].trip!), 306000);
  for (const col of ["BP", "BQ", "BR"]) delete sheet[`${col}4`];
  const legacy = convertLampiran6(sheet, "legacy.xlsx", "Luar Daerah (Dalam Provinsi)");
  assert.deepEqual(legacy[0].errors, []);
  assert.equal(legacy[0].trip!.lampiran6!.lodgingMode, "manual");
  assert.equal(totalCost(legacy[0].trip!), 306000);
});

test("30 percent lodging basis persists in the archive database", async () => {
  const cleanup = await setupTestDatabase();
  const { db, putTrip, getTrip } = await import("./db");
  try {
    const trip = archive(withAllowance());
    await putTrip(trip, "office");
    await db.close();
    const restored = await getTrip(trip.id, "office");
    assert.equal(restored!.lampiran6!.lodgingMode, "thirty-percent");
    assert.equal(restored!.lampiran6!.lodgingNights, 2);
    assert.equal(totalCost(restored!), 306000);
    assert.equal(await getTrip(trip.id, "demo"), null);
  } finally { await db.close(); await cleanup(); }
});

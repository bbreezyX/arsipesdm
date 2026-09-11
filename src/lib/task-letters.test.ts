import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationFacts, filterTaskLetters, groupTaskLetters, letterMatchesDestination, summarizeTripCosts } from "./task-letters";
import { isJambiRegion } from "./destinations";
import { lampiran6Schema } from "./lampiran6-schema";
import type { Trip } from "./model";

function trip(id: string, amount: number | null, changes: Partial<Trip> = {}): Trip {
  return {
    id, code: `PD/${id}`, version: 1, title: "Survei energi", sptNo: "ST/01/2026", sppdNo: "",
    destination: "Kabupaten Bungo", department: "Energi", startDate: "2026-02-12", endDate: "2026-02-13",
    participants: [{id: `person-${id}`, name: `Pegawai ${id}`, nip: id, position: "", department: "Energi"}],
    costs: amount === null ? [] : [{id: `cost-${id}`, category: "Biaya lainnya", label: "Biaya bersama", participantId: "shared", amount}],
    paid: null, notes: "", activity: "", account: "", fundTrack: "", physicalLocation: "", requiredDocs: [], correctionReason: "",
    createdAt: "2026-02-14", updatedAt: "2026-02-14", documents: [], history: [], source: "test", deletedAt: null,
    ...changes,
  };
}

test("ST totals add each archive ledger once, without multiplying shared costs or adding payment/evidence again", () => {
  const first = trip("a", 1090000, {paid: 1090000, lampiran6: lampiran6Schema.parse({dailyTotal: 1090000, receiptTotal: 1090000})});
  const second = trip("b", 1985400, {sptNo: " st / 01 / 2026 ", participants: [
    {id: "b1", name: "Arif", nip: "0002", position: "", department: "Energi"},
    {id: "b2", name: "Hendra", nip: "0003", position: "", department: "Energi"},
  ]});
  const {letters} = groupTaskLetters([first, second, first, trip("deleted", 5000000, {deletedAt: "2026-03-01"})]);
  assert.equal(letters.length, 1);
  assert.equal(letters[0].total, 3075400);
  assert.equal(letters[0].trips.length, 2);
  assert.equal(letters[0].peopleCount, 3);
  assert.equal(letters[0].unknownCount, 0);
  assert.equal(first.sptNo, "ST/01/2026");
});

test("ST totals distinguish unrecorded expenses, partial totals and actual zero", () => {
  const zero = trip("zero", 0);
  const unknown = trip("unknown", null);
  assert.deepEqual(summarizeTripCosts([unknown]), {total: null, unknownCount: 1});
  assert.deepEqual(summarizeTripCosts([zero]), {total: 0, unknownCount: 0});
  assert.deepEqual(summarizeTripCosts([zero, unknown, trip("known", 100)]), {total: 100, unknownCount: 1});
  const {letters, unassigned} = groupTaskLetters([zero, unknown, trip("none", 9000, {sptNo: " "})]);
  assert.equal(letters[0].total, 0);
  assert.equal(letters[0].unknownCount, 1);
  assert.equal(unassigned.length, 1);
});

test("employee and year filters preserve every member and expense of a matching ST", () => {
  const records = [trip("a", 50, {startDate: "2025-12-31", endDate: "2026-01-02"}), trip("b", 75), trip("c", 100, {sptNo: "ST/01/2025"})];
  const {letters} = groupTaskLetters(records);
  assert.equal(letters.length, 2);
  const found = filterTaskLetters(letters, "Pegawai b", "2026");
  assert.equal(found.length, 1);
  assert.equal(found[0].total, 125);
  assert.equal(found[0].trips.length, 2);
  assert.equal(found[0].startDate, "2025-12-31");
  assert.equal(filterTaskLetters(letters, "", "2025").length, 1);
  assert.equal(filterTaskLetters(letters, "tidak ditemukan", "all").length, 0);
});

test("destination facts count letters once per place, add each journey's cost, and sort the busiest first", () => {
  const { letters } = groupTaskLetters([
    trip("a", 1_000_000, { sptNo: "ST/01/2026", destination: "Kabupaten Bungo" }),
    trip("b", 500_000, { sptNo: "ST/01/2026", destination: "Kabupaten Bungo" }),
    trip("c", null, { sptNo: "ST/02/2026", destination: "kabupaten  bungo" }),
    trip("d", 9_000_000, { sptNo: "ST/03/2026", destination: "", destinations: ["Jakarta", "Kabupaten Tebo"] }),
    trip("e", 200_000, { sptNo: "ST/04/2025", destination: "Jakarta", startDate: "2025-11-03", endDate: "2025-11-04" }),
  ]);
  const facts = destinationFacts(letters, "2026");
  assert.deepEqual(facts.map(f => [f.name, f.letters, f.trips, f.total, f.unknownCount, f.inJambi]), [
    ["Kabupaten Bungo", 2, 3, 1_500_000, 1, true],
    ["Jakarta", 1, 1, 9_000_000, 0, false],
    ["Kabupaten Tebo", 1, 1, 9_000_000, 0, true],
  ]);
  assert.equal(destinationFacts(letters, "all").find(f => f.name === "Jakarta")?.letters, 2);
  const jakarta = letters.find(l => l.number === "ST/03/2026")!;
  assert.equal(letterMatchesDestination(jakarta, "2026", "jakarta"), true);
  assert.equal(letterMatchesDestination(jakarta, "2026", "kabupaten bungo"), false);
  assert.equal(letterMatchesDestination(jakarta, "2026", null), true);
  const old = letters.find(l => l.number === "ST/04/2025")!;
  assert.equal(letterMatchesDestination(old, "2026", "jakarta"), false);
  assert.equal(letterMatchesDestination(old, "all", "jakarta"), true);
});

test("Jambi regencies are recognised across the short and long spellings", () => {
  assert.equal(isJambiRegion("Kabupaten Tanjung Jabung Barat"), true);
  assert.equal(isJambiRegion("Kab. Tanjung Jabung Barat"), true);
  assert.equal(isJambiRegion("Kota Jambi"), true);
  assert.equal(isJambiRegion("Jakarta"), false);
  assert.equal(isJambiRegion("Kabupaten Bogor"), false);
});

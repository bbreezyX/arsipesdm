import { test } from "node:test";
import assert from "node:assert/strict";
import { archivesForExport, filterArchiveGroups, groupArchives } from "./archive-groups";
import { defaultFilters, tripSchema, type Trip } from "./model";

function trip(id: string, amount: number | null, changes: Partial<Trip> = {}): Trip {
  return {
    ...tripSchema.parse({ title: "Survei energi", sptNo: "ST/01/2026", destination: "Bungo", department: "Energi",
      startDate: "2026-02-12", endDate: "2026-02-13",
      participants: [{ id, name: `Pegawai ${id}`, nip: id }],
      costs: amount === null ? [] : [{ id: `cost-${id}`, category: "Biaya lainnya", participantId: "shared", amount }],
    }),
    id, code: `PD/${id}`, version: 1, documents: [], history: [], source: "test", deletedAt: null,
    createdAt: "2026-02-14", updatedAt: "2026-02-14", ...changes,
  };
}

test("one ST keeps every ledger, counts unique employees and shared expenses once", () => {
  const a = trip("a", 100);
  const b = trip("b", 200, { sptNo: " st / 01 / 2026 ", participants: [
    ...a.participants.map(person => ({ ...person, id: "another-id", nip: " a " })),
    { id: "b", name: "Budi", nip: "b", position: "", department: "Energi" },
  ] });
  const [group] = groupArchives([a, b, a, trip("deleted", 900, { deletedAt: "2026-03-01" })]);
  assert.equal(group.trips.length, 2);
  assert.equal(group.participants.length, 2);
  assert.equal(group.total, 300);
  assert.equal(group.complete, true);
  assert.equal(archivesForExport([group]).length, 2);
});

test("short ST numbers are separated by year and missing STs remain separate", () => {
  const records = [trip("a", 100, { sptNo: "ST/01" }), trip("b", 200, { sptNo: "ST/01", startDate: "2025-02-12", endDate: "2025-02-13" }),
    trip("c", 300, { sptNo: "" }), trip("d", 400, { sptNo: " " })];
  assert.equal(groupArchives(records).length, 4);
  const crossing = groupArchives([trip("e", 10, { startDate: "2025-12-31", endDate: "2026-01-01" }), trip("f", 20)]);
  assert.equal(crossing.length, 1);
  assert.equal(crossing[0].total, 30);
});

test("search, department, month and year filters return whole groups and export all members", () => {
  const groups = groupArchives([trip("a", 50), trip("b", 75, { department: "Geologi", startDate: "2026-03-01", endDate: "2026-03-02" }),
    trip("c", 100, { sptNo: "ST/02/2026" })]);
  for (const filter of [{ search: "Pegawai b" }, { department: "Geologi" }, { month: "03" }, { search: "PD/b", year: "2026" }]) {
    const found = filterArchiveGroups(groups, { ...defaultFilters, ...filter });
    assert.equal(found.length, 1);
    assert.equal(found[0].total, 125);
    assert.deepEqual(archivesForExport(found).map(trip => trip.id), ["a", "b"]);
  }
  assert.equal(filterArchiveGroups(groups, { ...defaultFilters, search: "Pegawai b", department: "Energi" }).length, 0);
  assert.deepEqual(archivesForExport(groups, new Set([groups[0].key])).map(trip => trip.id), groups[0].trips.map(trip => trip.id));
  assert.deepEqual(archivesForExport(groups, new Set()), []);
});

test("mixed completion stays Draft, unknown costs stay unknown and zero stays complete", () => {
  const groups = groupArchives([trip("a", 0), trip("b", null), trip("c", 0, { sptNo: "ST/02/2026" }), trip("d", null, { sptNo: "ST/03/2026" })]);
  const mixed = groups.find(group => group.number === "ST/01/2026")!;
  assert.equal(mixed.total, 0);
  assert.equal(mixed.unknownCount, 1);
  assert.equal(mixed.completeCount, 1);
  assert.equal(mixed.complete, false);
  assert.equal(groups.find(group => group.number === "ST/03/2026")!.total, null);
  assert.equal(filterArchiveGroups(groups, { ...defaultFilters, status: "complete" }).length, 1);
  assert.equal(filterArchiveGroups(groups, { ...defaultFilters, status: "incomplete" }).length, 2);
});

test("entry period excludes older members of an ST from totals, status and exports", () => {
  const groups = groupArchives([
    trip("old", null, { createdAt: "2026-09-09T16:59:59.999Z", updatedAt: "2026-09-10T03:00:00Z" }),
    trip("new", 125, { createdAt: "2026-09-09T17:00:00.000Z" }),
    trip("zero", 0, { createdAt: "2026-09-10T16:59:59.999Z" }),
    trip("future", 900, { createdAt: "2026-09-10T17:00:00.000Z" }),
    trip("deleted", 500, { createdAt: "2026-09-10T03:00:00Z", deletedAt: "2026-09-10T04:00:00Z" }),
  ]);
  const found = filterArchiveGroups(groups, { ...defaultFilters, entry: "today" }, "2026-09-10");
  assert.equal(found.length, 1);
  assert.equal(found[0].key, groups[0].key);
  assert.equal(found[0].total, 125);
  assert.equal(found[0].participants.length, 2);
  assert.equal(found[0].complete, true);
  assert.deepEqual(archivesForExport(found).map(t => t.id).sort(), ["new", "zero"]);
  assert.equal(filterArchiveGroups(groups, { ...defaultFilters, entry: "today", status: "incomplete" }, "2026-09-10").length, 0);
  assert.equal(filterArchiveGroups(groups, { ...defaultFilters, entry: "today", search: "Pegawai old" }, "2026-09-10").length, 0);
  assert.equal(filterArchiveGroups(groups, defaultFilters, "2026-09-10")[0].trips.length, 4);
  assert.equal(groups[0].trips.length, 4);
});

test("cost sorting uses group totals, with unknown amounts after zero", () => {
  const groups = groupArchives([trip("a", 70), trip("b", 70), trip("c", 100, { sptNo: "ST/02/2026" }),
    trip("d", null, { sptNo: "ST/03/2026" }), trip("e", 0, { sptNo: "ST/04/2026" })]);
  assert.deepEqual(filterArchiveGroups(groups, { ...defaultFilters, sort: "cost" }).map(group => group.total), [140, 100, 0, null]);
});

test("equivalent descriptions appear once while source titles, ledgers and genuinely different purposes remain intact", () => {
  const records = [
    trip("a", 100, { title: "Survei EBT pada wilayah Kabupaten Bungo" }),
    trip("b", 200, { title: "Survei EBT pada Wilayah Kabupaten Bungo" }),
    trip("c", 300, { title: "  SURVEI\u00a0EBT pada\nwilayah   Kabupaten Bungo  " }),
    trip("d", 400, { title: "Survei EBT pada wilayah Kabupaten Tebo" }),
  ];
  const originals = structuredClone(records);
  const [group] = groupArchives(records);
  assert.deepEqual(group.titles, [
    "Survei EBT pada wilayah Kabupaten Bungo",
    "Survei EBT pada wilayah Kabupaten Tebo",
  ]);
  assert.equal(group.total, 1000);
  assert.equal(group.participants.length, 4);
  assert.deepEqual(records, originals);
  assert.deepEqual(archivesForExport([group]), originals);
  assert.deepEqual(groupArchives(records.slice(0, 3))[0].titles, [originals[0].title]);
});

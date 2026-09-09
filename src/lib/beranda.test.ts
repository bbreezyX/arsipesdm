import { test } from "node:test";
import assert from "node:assert/strict";
import { berandaSummary, greeting, pickYear, relativeTime } from "./beranda";
import { tripSchema, type Trip } from "./model";
import type { Employee } from "./employees";
import type { Honorarium } from "./honorarium";

function trip(id: string, amount: number | null, changes: Partial<Trip> = {}): Trip {
  return {
    ...tripSchema.parse({ title: "Survei energi", sptNo: "ST/01/2026", destination: "Bungo", department: "Energi",
      startDate: "2026-02-12", endDate: "2026-02-13",
      participants: [{ id, name: `Pegawai ${id}`, nip: id }],
      costs: amount === null ? [] : [{ id: `cost-${id}`, category: "Biaya lainnya", participantId: "shared", amount }],
    }),
    id, code: `PD/${id}`, version: 1, documents: [], history: [], source: "test", deletedAt: null,
    createdAt: "2026-02-14T08:00:00.000Z", updatedAt: "2026-02-14T08:00:00.000Z", ...changes,
  };
}
function employee(id: string, deletedAt: string | null = null): Employee {
  return { id, name: `Pegawai ${id}`, nip: id, position: "", department: "Energi", rank: "", version: 1, identities: [], deletedAt } as Employee;
}
function honorarium(id: string, year: number, monthlyAmount = 1_000_000): Honorarium {
  return { id, version: 1, createdAt: "", updatedAt: "", deletedAt: null, category: "finance", year, skNumber: "SK/1", skName: "SK",
    department: "Dinas", program: "", activity: "", subActivity: "", recipient: "A", position: "", skPosition: "PPK", recipientDepartment: "Dinas",
    echelon: "", budget: 0, monthlyAmount, months: 12, taxMode: "percent", taxRate: 5, taxAmount: 0, notes: "" };
}
const today = "2026-09-09";

test("greeting follows the Jakarta hour", () => {
  assert.equal(greeting(5), "Selamat pagi");
  assert.equal(greeting(10), "Selamat pagi");
  assert.equal(greeting(11), "Selamat siang");
  assert.equal(greeting(15), "Selamat sore");
  assert.equal(greeting(19), "Selamat malam");
  assert.equal(greeting(2), "Selamat malam");
});

test("active year prefers the current year, then the latest year with archives", () => {
  assert.equal(pickYear([trip("a", 1)], today), "2026");
  assert.equal(pickYear([trip("a", 1, { startDate: "2024-03-01", endDate: "2024-03-02" }), trip("b", 1, { startDate: "2025-03-01", endDate: "2025-03-02" })], today), "2025");
  assert.equal(pickYear([trip("a", 1, { deletedAt: "2026-05-01" })], today), "2026");
  assert.equal(pickYear([], today), "2026");
});

test("hero totals, monthly peak and calendar count people per day across month borders", () => {
  const summary = berandaSummary({
    trips: [
      trip("a", 100),
      trip("b", 250, { sptNo: "ST/02/2026", startDate: "2026-02-27", endDate: "2026-03-02", participants: [
        { id: "b", name: "Budi", nip: "b", position: "", department: "Energi" },
        { id: "c", name: "Citra", nip: "c", position: "", department: "Energi" },
      ] }),
      trip("d", null, { sptNo: "ST/03/2026", startDate: "2026-05-10", endDate: "2026-05-10" }),
      trip("old", 900, { startDate: "2025-12-30", endDate: "2026-01-02", sptNo: "ST/09/2025" }),
      trip("deleted", 900, { deletedAt: "2026-06-01" }),
    ],
    employees: [], honorariums: [], today,
  });
  assert.equal(summary.year, "2026");
  assert.equal(summary.hero.total, 350);
  assert.equal(summary.hero.recaps, 3);
  assert.equal(summary.hero.journeys, 3);
  assert.equal(summary.hero.people, 4);
  assert.equal(summary.hero.unknown, 1);
  assert.deepEqual(summary.hero.peak, { month: 1, total: 350 });
  assert.equal(summary.monthly[1], 350);
  assert.equal(summary.monthly[4], 0);
  // 2026-02-27 has Budi and Citra; 2026-03-01 too; the old trip still covers Jan 1-2.
  const feb27 = summary.calendar.days["2026-02-27"];
  assert.equal(feb27.people, 2);
  assert.equal(feb27.trips, 1);
  assert.deepEqual(feb27.entries, [{ key: "st:ST/02/2026", number: "ST/02/2026", title: "Survei energi", destinations: ["Bungo"], people: 2, recaps: 1 }]);
  assert.equal(summary.calendar.days["2026-03-01"].people, 2);
  assert.deepEqual(summary.calendar.days["2026-01-01"].entries.map(entry => entry.number), ["ST/09/2025"]);
  assert.equal(summary.calendar.days["2025-12-31"], undefined);
  assert.equal(summary.calendar.days["2026-06-01"], undefined);
  assert.equal(summary.calendar.peak?.date, "2026-02-27");
  assert.equal(summary.calendar.peopleDays, 2 + 2 * 4 + 1 + 2);
});

test("calendar folds per-employee ledgers of one surat tugas into a single journey", () => {
  const summary = berandaSummary({
    trips: [
      trip("a", 100, { destination: "Bungo" }),
      trip("b", 200, { sptNo: " st/01/2026 ", destination: "Tebo", destinations: ["Tebo"] }),
      trip("c", 300, { sptNo: "" }),
    ],
    employees: [], honorariums: [], today,
  });
  const day = summary.calendar.days["2026-02-12"];
  assert.equal(day.trips, 3);
  assert.equal(day.people, 3);
  assert.equal(day.entries.length, 2);
  assert.deepEqual(day.entries[0], { key: "st:ST/01/2026", number: "ST/01/2026", title: "Survei energi", destinations: ["Bungo", "Tebo"], people: 2, recaps: 2 });
  assert.equal(day.entries[1].number, "PD/c");
});

test("month selection keeps journey and employee counts scoped to departure month", () => {
  const summary = berandaSummary({
    trips: [
      trip("a", 100),
      trip("b", 250), // Two employee recaps belong to the same journey.
      trip("draft", null, { sptNo: "ST/02/2026" }),
      trip("a-march", 0, { startDate: "2026-03-01", endDate: "2026-03-02" }),
      trip("deleted", 9_000, { deletedAt: today }),
      trip("old", 8_000, { startDate: "2025-02-01", endDate: "2025-02-02" }),
    ], employees: [], honorariums: [], today,
  });
  assert.equal(summary.monthlyDetails.length, 12);
  assert.deepEqual(summary.monthlyDetails[1], { total: 350, known: 2, unknown: 1, recaps: 3, journeys: 2, people: 3 });
  assert.deepEqual(summary.monthlyDetails[2], { total: 0, known: 1, unknown: 0, recaps: 1, journeys: 1, people: 1 });
  assert.deepEqual(summary.monthlyDetails[8], { total: 0, known: 0, unknown: 0, recaps: 0, journeys: 0, people: 0 });
  assert.equal(summary.monthlyDetails.reduce((sum, item) => sum + item.total, 0), summary.hero.total);
  assert.equal(summary.monthlyDetails.reduce((sum, item) => sum + item.recaps, 0), summary.hero.recaps);
});

test("monthly detail distinguishes drafts from empty months in the latest available year", () => {
  const summary = berandaSummary({ trips: [trip("draft", null, { startDate: "2024-11-01", endDate: "2024-11-02" })],
    employees: [], honorariums: [], today });
  assert.equal(summary.year, "2024");
  assert.deepEqual(summary.monthlyDetails[10], { total: 0, known: 0, unknown: 1, recaps: 1, journeys: 1, people: 1 });
  const empty = berandaSummary({ trips: [], employees: [], honorariums: [], today });
  assert.ok(empty.monthlyDetails.every(item => item.recaps === 0 && item.total === 0));
});

test("attention items only list open work, ordered by priority", () => {
  const withGap = trip("g", 10, { sptNo: "ST/04/2026", requiredDocs: ["spt", "sppd"], documents: [
    { id: "doc", type: "spt", name: "spt.pdf", kind: "file", size: 1, location: "", createdAt: "" },
  ] });
  const summary = berandaSummary({
    trips: [trip("a", 100), trip("draft", null), withGap, trip("free", 5, { sptNo: "" }), trip("bin", 1, { deletedAt: "2026-06-01" })],
    employees: [], honorariums: [honorarium("h", 2025)], today,
  });
  assert.deepEqual(summary.attention.map(item => [item.id, item.count]), [
    ["draft", 1], ["docs", 1], ["unassigned", 1], ["trash", 1], ["honorarium", 0],
  ]);
  const tidy = berandaSummary({ trips: [trip("a", 100)], employees: [], honorariums: [honorarium("h", 2026)], today });
  assert.deepEqual(tidy.attention, []);
});

test("register directory summarises every module for the active year", () => {
  const summary = berandaSummary({
    trips: [trip("a", 100), trip("b", 200, { sptNo: "ST/02/2026" }), trip("c", 300, { sptNo: "ST/02/2026", requiredDocs: ["spt"] }),
      trip("last", 50, { startDate: "2025-01-05", endDate: "2025-01-06" })],
    employees: [employee("a"), employee("b"), employee("gone", "2026-01-01"), employee("z")],
    honorariums: [honorarium("h1", 2026), honorarium("h2", 2026, 500_000), honorarium("h3", 2025)],
    today,
  });
  assert.deepEqual(summary.registers.archives, { journeys: 2, recaps: 3 });
  assert.deepEqual(summary.registers.taskLetters, { letters: 2 });
  assert.deepEqual(summary.registers.honorarium, { records: 2, net: 12_000_000 * 0.95 + 6_000_000 * 0.95 });
  assert.deepEqual(summary.registers.documents, { complete: 2, total: 3, ratio: 2 / 3 });
  assert.deepEqual(summary.registers.people, { active: 3, travelled: 3 });
});

test("recent activity merges archive histories newest first and keeps eight entries", () => {
  const history = (n: number, tripId: string) => Array.from({ length: n }, (_, i) => ({
    id: `${tripId}-${i}`, action: "Diperbarui", actor: "Dany", at: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`, detail: "",
  }));
  const summary = berandaSummary({
    trips: [trip("a", 1, { history: history(5, "a") }), trip("b", 1, { history: history(5, "b"), deletedAt: "2026-09-01" })],
    employees: [], honorariums: [], today,
  });
  assert.equal(summary.activity.length, 8);
  assert.equal(summary.activity[0].at, "2026-08-05T10:00:00.000Z");
  assert.equal(summary.activity[0].code, "PD/a");
  assert.equal(summary.activity[7].at, "2026-08-02T10:00:00.000Z");
});

test("relative time speaks Indonesian", () => {
  const now = "2026-09-09T12:00:00.000Z";
  assert.equal(relativeTime("2026-09-09T11:59:40.000Z", now), "baru saja");
  assert.equal(relativeTime("2026-09-09T11:45:00.000Z", now), "15 menit lalu");
  assert.equal(relativeTime("2026-09-09T09:00:00.000Z", now), "3 jam lalu");
  assert.equal(relativeTime("2026-09-08T09:00:00.000Z", now), "kemarin");
  assert.equal(relativeTime("2026-09-04T09:00:00.000Z", now), "5 hari lalu");
  assert.equal(relativeTime("2026-07-04T09:00:00.000Z", now), "4 Jul 2026");
});

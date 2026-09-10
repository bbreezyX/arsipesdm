import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tripSchema,
  totalCost,
  fingerprint,
  filterTrips,
  jakartaDay,
  matchesEntry,
  parseEntryFilter,
  defaultFilters,
  paymentLabel,
  isComplete,
  type TripInput,
  type Trip,
} from "./model";
import { parseMoney, parseDate, convertRows, suggestMapping } from "./import";
import { formatDestinations, tripDestinations } from "./destinations";
const input: TripInput = {
  title: "Perjalanan uji arsip",
  sptNo: "094/01/2024",
  sppdNo: "",
  destination: "Kerinci",
  department: "Energi",
  startDate: "2024-02-28",
  endDate: "2024-02-29",
  participants: [
    {
      id: "a",
      name: "Pegawai Contoh A",
      nip: "0012",
      department: "Energi",
      position: "",
    },
    {
      id: "b",
      name: "Pegawai Contoh B",
      nip: "0013",
      department: "Energi",
      position: "",
    },
  ],
  costs: [],
  paid: null,
  notes: "",
  activity: "",
  account: "",
  physicalLocation: "",
  requiredDocs: ["spt", "sppd"],
  correctionReason: "",
};
const trip = (changes: Partial<Trip> = {}): Trip => ({
  ...input,
  id: "test",
  code: "PD/2024/0001",
  version: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  documents: [],
  history: [],
  source: "test",
  deletedAt: null,
  ...changes,
});
test("multiple destinations retain legacy addresses and reject empty, duplicate or conflicting destinations", () => {
  const legacy = tripSchema.parse({...input, destination: "Kantor A, Jambi; ruang rapat"});
  assert.deepEqual(tripDestinations(legacy), ["Kantor A, Jambi; ruang rapat"]);
  const destinations = ["Kabupaten Bungo", "Kabupaten Tebo"];
  const multiple = {...input, destinations, destination: formatDestinations(destinations)};
  assert.deepEqual(tripSchema.parse(multiple).destinations, destinations);
  assert.equal(totalCost(tripSchema.parse(multiple)), totalCost(input));
  assert.equal(tripSchema.safeParse({...multiple, destinations: []}).success, false);
  assert.equal(tripSchema.safeParse({...multiple, destinations: ["Kabupaten Bungo", " "]}).success, false);
  const duplicates = ["Kabupaten Bungo", "kabupaten  bungo"];
  assert.equal(tripSchema.safeParse({...multiple, destinations: duplicates, destination: formatDestinations(duplicates)}).success, false);
  assert.equal(tripSchema.safeParse({...multiple, destination: "Tujuan lain"}).success, false);
});
test("unknown and zero historical expenditure remain distinct", () => {
  assert.equal(totalCost(input), null);
  assert.equal(
    totalCost({
      ...input,
      costs: [
        {
          id: "z",
          category: "Biaya lainnya",
          label: "nihil",
          participantId: "shared",
          amount: 0,
        },
      ],
    }),
    0,
  );
  assert.equal(paymentLabel(trip()), "Belum dicatat");
});
test("shared cost is counted once with multiple participants", () => {
  const t = trip({
    costs: [
      {
        id: "1",
        category: "Transportasi",
        label: "mobil bersama",
        participantId: "shared",
        amount: 1200000,
      },
      {
        id: "2",
        category: "Uang harian",
        label: "",
        participantId: "a",
        amount: 300000,
      },
      {
        id: "3",
        category: "Uang harian",
        label: "",
        participantId: "b",
        amount: 300000,
      },
    ],
    paid: 2000000,
  });
  assert.equal(totalCost(t), 1800000);
  assert.equal(paymentLabel(t), "Perlu pengembalian");
});
test("reject impossible dates, future journeys, negative amounts, and dangling participants", () => {
  assert(tripSchema.safeParse(input).success);
  assert(!tripSchema.safeParse({ ...input, startDate: "2023-02-29" }).success);
  assert(!tripSchema.safeParse({ ...input, endDate: "2024-02-27" }).success);
  assert(!tripSchema.safeParse({ ...input, endDate: "2099-01-01" }).success);
  assert(
    !tripSchema.safeParse({
      ...input,
      costs: [
        {
          id: "x",
          category: "Transportasi",
          label: "",
          participantId: "missing",
          amount: 10,
        },
      ],
    }).success,
  );
  assert(!tripSchema.safeParse({ ...input, paid: -1 }).success);
  assert(
    !tripSchema.safeParse({
      ...input,
      participants: [
        input.participants[0],
        { ...input.participants[0], id: "c" },
      ],
    }).success,
  );
});
test("year filter follows travel date rather than entry date", () => {
  assert.equal(
    filterTrips([trip()], { ...defaultFilters, year: "2024" }).length,
    1,
  );
  assert.equal(
    filterTrips([trip()], { ...defaultFilters, year: "2026" }).length,
    0,
  );
  assert.equal(
    filterTrips([trip({ deletedAt: "2026-01-01" })], defaultFilters).length,
    0,
  );
});
test("entry filter follows the Jakarta day the archive was recorded, not the travel date", () => {
  const recorded = (createdAt: string) => trip({ createdAt });
  const today = "2026-09-10";
  // 23:30 UTC on the 9th is already the 10th in Jakarta.
  assert.equal(filterTrips([recorded("2026-09-09T23:30:00.000Z")], { ...defaultFilters, entry: "today" }, today).length, 1);
  assert.equal(filterTrips([recorded("2026-09-09T12:00:00.000Z")], { ...defaultFilters, entry: "today" }, today).length, 0);
  assert.equal(filterTrips([recorded("2026-09-04T12:00:00.000Z")], { ...defaultFilters, entry: "week" }, today).length, 1);
  assert.equal(filterTrips([recorded("2026-09-03T12:00:00.000Z")], { ...defaultFilters, entry: "week" }, today).length, 0);
  assert.equal(filterTrips([recorded("2026-08-12T12:00:00.000Z")], { ...defaultFilters, entry: "month" }, today).length, 1);
  assert.equal(filterTrips([recorded("2026-08-11T12:00:00.000Z")], { ...defaultFilters, entry: "month" }, today).length, 0);
  assert.equal(filterTrips([recorded("2020-01-01T00:00:00.000Z")], { ...defaultFilters, entry: "all" }, today).length, 1);
  assert.equal(jakartaDay("2026-09-09T23:30:00.000Z"), "2026-09-10");
});
test("entry windows handle missing timestamps, future dates and WIB midnight", () => {
  const today = "2026-01-01";
  assert.equal(matchesEntry("2025-12-31T16:59:59.999Z", "today", today), false);
  assert.equal(matchesEntry("2025-12-31T17:00:00.000Z", "today", today), true);
  assert.equal(matchesEntry("2026-01-01T16:59:59.999Z", "today", today), true);
  assert.equal(matchesEntry("2026-01-01T17:00:00.000Z", "today", today), false);
  assert.equal(matchesEntry("", "today", today), false);
  assert.equal(matchesEntry("invalid", "month", today), false);
  assert.equal(matchesEntry("", "all", today), true);
  assert.equal(matchesEntry("2025-12-26", "week", today), true);
  assert.equal(matchesEntry("2025-12-25", "week", today), false);
  assert.equal(parseEntryFilter(["today"]), "all");
  assert.equal(parseEntryFilter("invalid"), "all");
  assert.equal(parseEntryFilter("today"), "today");
});
test("supporting documents are optional; completeness requires known costs including zero", () => {
  const docs = input.requiredDocs.map((type) => ({
    id: type,
    type,
    name: "SPT",
    kind: "physical" as const,
    size: 0,
    location: "Map 2024",
    createdAt: "2026-01-01",
  }));
  assert(!isComplete(trip({ documents: docs })));
  assert(tripSchema.safeParse({ ...input, requiredDocs: [] }).success);
  assert.deepEqual(tripSchema.parse({ ...input, requiredDocs: undefined }).requiredDocs, []);
  assert(
    isComplete(
      trip({
        documents: [],
        costs: [
          {
            id: "x",
            category: "Biaya lainnya",
            label: "",
            participantId: "shared",
            amount: 0,
          },
        ],
      }),
    ),
  );
});
test("deduplication ignores participant order and normalizes letter reference", () => {
  assert.equal(
    fingerprint(input),
    fingerprint({
      ...input,
      sptNo: "094 / 01 / 2024 ",
      participants: [...input.participants].reverse(),
    }),
  );
});
test("Excel rupiah parser preserves empty and zero and rejects silent corruption", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("0"), 0);
  assert.equal(parseMoney("Rp 1.250.000,00"), 1250000);
  assert.equal(parseMoney(1250000), 1250000);
  assert.throws(() => parseMoney("-100"));
  assert.throws(() => parseMoney("abc"));
  assert.throws(() => parseMoney("1,50"));
});
test("Excel date parser accepts Indonesian strings and Excel serial date", () => {
  assert.equal(parseDate("29/02/2024"), "2024-02-29");
  assert.equal(parseDate("2024-02-29"), "2024-02-29");
  assert.equal(parseDate(45351), "2024-02-29");
  assert.throws(() => parseDate("kemarin"));
});
test("mapped import validates rows and retains source line", () => {
  const row = {
    "Uraian perjalanan": "Survei uji",
    Tujuan: "Kerinci",
    Bidang: "Energi",
    "Tanggal berangkat": "01/04/2024",
    "Tanggal pulang": "03/04/2024",
    Peserta: "Nama A; Nama B",
    "Total realisasi": "1.500.000",
    "Nomor SPT": "0001/2024",
  };
  const rows = convertRows(
    [row],
    suggestMapping(Object.keys(row)),
    "lama.xlsx",
    "Arsip",
    7,
  );
  assert.equal(rows[0].errors.length, 0);
  assert.equal(rows[0].trip?.participants.length, 2);
  assert.equal(totalCost(rows[0].trip!), 1500000);
  assert.equal(rows[0].trip?.paid, null);
  assert.equal(rows[0].source, "lama.xlsx • Arsip • baris 7");
  assert.equal(rows[0].trip?.sptNo, "0001/2024");
  const invalid = convertRows(
    [{ ...row, "Total realisasi": "tidak tahu" }],
    suggestMapping(Object.keys(row)),
    "lama.xlsx",
    "Arsip",
    8,
  );
  assert(invalid[0].errors.length > 0);
});

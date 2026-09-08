import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTripSuggestions } from "./trip-suggestions";
import { tripSchema, type Trip } from "./model";

function trip(id: string, account: string, updatedAt: string, deletedAt: string | null = null): Trip {
  return {
    ...tripSchema.parse({ title: "Perjalanan uji", destination: "Bungo", department: "Energi",
      startDate: "2025-02-12", endDate: "2025-02-13", account,
      participants: [{ id, name: `Pegawai ${id}` }], costs: [],
    }),
    id, code: `PD/${id}`, version: 1, documents: [], history: [], source: "test", deletedAt,
    createdAt: updatedAt, updatedAt,
  };
}

test("account choices include past years, exclude deleted and blank codes, and deduplicate newest first", () => {
  const trips = [trip("a", "REKENING-A", "2025-01-01"), trip("b", "REKENING-B", "2026-01-01"),
    trip("c", " rekening-a ", "2026-02-01"), trip("d", "", "2026-03-01"),
    trip("e", "REKENING-HAPUS", "2026-04-01", "2026-04-02")];
  assert.deepEqual(buildTripSuggestions(trips).accounts, [{ value: "rekening-a" }, { value: "REKENING-B" }]);
  assert.deepEqual(trips.map(trip => trip.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(buildTripSuggestions([]).accounts, []);
});

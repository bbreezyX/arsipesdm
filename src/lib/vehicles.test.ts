import { test } from "node:test";
import assert from "node:assert/strict";
import { setupTestDatabase } from "./test-database";
import { vehicleSchema, uniqueVehicles } from "./vehicles";
import { groundTransportSchema, lampiran6Schema } from "./lampiran6-schema";
import { tripSchema, type Trip } from "./model";

const vehicle = { provider: "BH 1234 XX", vehicleType: "Toyota Hilux", mode: "Mobil dinas", fuelType: "Dexlite" };

test("vehicle choices normalize plates and exclude purchase amounts", () => {
  assert.deepEqual(vehicleSchema.parse({ ...vehicle, fuelLiters: 38.98, fuelPricePerLiter: 20150, total: 785447 }), vehicle);
  assert.equal(vehicleSchema.safeParse({ ...vehicle, provider: " " }).success, false);
  assert.equal(vehicleSchema.safeParse({ ...vehicle, vehicleType: "" }).success, false);
  assert.equal(uniqueVehicles([vehicle, { ...vehicle, provider: " bh1234xx " }]).length, 1);
});

test("saved vehicles persist across connections, isolate workspaces, and preserve archives", async () => {
  const cleanup = await setupTestDatabase();
  const { db, putTrip, getTrip } = await import("./db");
  const { getVehicles, saveVehicle } = await import("./vehicle-db");
  try {
    const input = tripSchema.parse({ title: "Uji kendaraan", destination: "Jambi", department: "Energi", startDate: "2026-09-10", endDate: "2026-09-10", participants: [{ id: "person", name: "Pegawai Uji" }], costs: [], lampiran6: lampiran6Schema.parse({ groundTransports: [groundTransportSchema.parse(vehicle)] }) });
    const trip: Trip = { ...input, id: "vehicle-trip", code: "PD/2026/0001", version: 1, createdAt: "2026-09-10", updatedAt: "2026-09-10", documents: [], history: [], source: "Test", deletedAt: null };
    await putTrip(trip, "office");
    assert.deepEqual(await getVehicles("office"), [vehicle], "old archives supply reusable vehicles");
    assert.deepEqual(await getVehicles("demo"), []);
    const updated = { ...vehicle, provider: "bh1234xx", fuelType: "Pertamina Dex" };
    await saveVehicle("office", updated);
    await saveVehicle("office", updated);
    assert.deepEqual(await getVehicles("office"), [updated], "saved corrections override historical suggestions without duplicates");
    assert.deepEqual((await getTrip(trip.id, "office"))?.lampiran6?.groundTransports, trip.lampiran6?.groundTransports);
    await saveVehicle("demo", vehicle);
    assert.deepEqual(await getVehicles("demo"), [vehicle]);
    await Promise.all([
      saveVehicle("office", { ...vehicle, provider: "BH 2 XX" }),
      saveVehicle("office", { ...vehicle, provider: "BH 3 XX" }),
    ]);
    assert.equal((await getVehicles("office")).length, 3, "concurrent saves retain both vehicles");
    await putTrip({ ...trip, deletedAt: "2026-09-11" }, "office");
    await db.close();
    assert.equal((await getVehicles("office")).length, 3, "explicit saves survive reloads and archive deletion");
    await putTrip({ ...trip, id: "deleted-source", deletedAt: "2026-09-11" }, "deleted-only");
    assert.deepEqual(await getVehicles("deleted-only"), []);
    await assert.rejects(() => saveVehicle("office", { ...vehicle, provider: " " }));
  } finally { await db.close(); await cleanup(); }
});

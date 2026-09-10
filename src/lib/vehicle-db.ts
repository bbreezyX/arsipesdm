import { db, getTrips, transaction } from "./db";
import { archiveVehicles, uniqueVehicles, vehicleSchema, type SavedVehicle } from "./vehicles";

// Workspace-scoped settings are durable and included in existing database backups.
async function readSavedVehicles(workspace: string): Promise<SavedVehicle[]> {
  const row = await db.prepare("SELECT value FROM pengaturan WHERE key=?").get(`kendaraan:${workspace}`);
  return row ? JSON.parse(String(row.value)) : [];
}

export async function getVehicles(workspace: string): Promise<SavedVehicle[]> {
  const [saved, trips] = await Promise.all([readSavedVehicles(workspace), getTrips(workspace)]);
  return uniqueVehicles([...saved, ...archiveVehicles(trips)]);
}

export async function saveVehicle(workspace: string, body: unknown): Promise<SavedVehicle> {
  const vehicle = vehicleSchema.parse(body);
  return transaction(async () => {
    const saved = uniqueVehicles([vehicle, ...await readSavedVehicles(workspace)]);
    await db.prepare("INSERT INTO pengaturan(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(`kendaraan:${workspace}`, JSON.stringify(saved));
    return vehicle;
  });
}

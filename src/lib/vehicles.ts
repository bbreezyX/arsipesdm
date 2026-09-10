import { z } from "zod";
import type { Trip } from "./model";

const text = z.string().trim().max(1000);
export const vehicleSchema = z.object({
  provider: text.min(1, "Isi pelat kendaraan atau nama penyedia terlebih dahulu."),
  vehicleType: text.min(1, "Isi jenis mobil terlebih dahulu."),
  mode: text.default(""),
  fuelType: text.default(""),
});
export type SavedVehicle = z.infer<typeof vehicleSchema>;

export function vehicleKey(provider: string) {
  return provider.replace(/\s+/g, "").toLocaleUpperCase("id-ID");
}

/** First entry wins; never copy purchase quantities or prices into a vehicle. */
export function uniqueVehicles(values: SavedVehicle[]): SavedVehicle[] {
  const found = new Map<string, SavedVehicle>();
  for (const value of values) {
    const parsed = vehicleSchema.safeParse(value);
    if (!parsed.success) continue;
    const key = vehicleKey(parsed.data.provider);
    if (!found.has(key)) found.set(key, parsed.data);
  }
  return [...found.values()].sort((a, b) => a.provider.localeCompare(b.provider, "id"));
}

export function archiveVehicles(trips: Trip[]): SavedVehicle[] {
  return uniqueVehicles(trips.filter(trip => !trip.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .flatMap(trip => trip.lampiran6?.groundTransports ?? []));
}

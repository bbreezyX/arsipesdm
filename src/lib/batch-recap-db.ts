import { getTrips, newTrip, transaction } from "./db";
import { fingerprint, type TripInput } from "./model";

export function saveRecapBatch(trips: TripInput[], workspace: string, actor: string) {
  return transaction(() => {
    const existing = new Set(getTrips(workspace).filter(trip => !trip.deletedAt).map(fingerprint));
    const index = trips.findIndex(trip => existing.has(fingerprint(trip)));
    if (index >= 0) return { duplicate: index };
    return { added: trips.map(trip => newTrip(trip, workspace, actor, "Input beberapa pegawai")) };
  });
}

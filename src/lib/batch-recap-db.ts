import { getTrips, newTrip, transaction } from "./db";
import { fingerprint, type TripInput } from "./model";

export async function saveRecapBatch(trips: TripInput[], workspace: string, actor: string) {
  return (await transaction(async () => {
    const existing = new Set((await getTrips(workspace)).filter(trip => !trip.deletedAt).map(fingerprint));
    const index = trips.findIndex(trip => existing.has(fingerprint(trip)));
    if (index >= 0) return { duplicate: index };
    const added = [];
    for (const trip of trips) added.push(await newTrip(trip, workspace, actor, "Input beberapa pegawai"));
    return { added };
  }));
}

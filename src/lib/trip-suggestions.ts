import type { Trip } from "./model";
import { tripDestinations } from "./destinations";

type Option = { value: string; description?: string };
export type TripSuggestions = {
  accounts: Option[];
  origins: Option[];
  destinations: Option[];
  letters: Option[];
  purposes: Option[];
};

// Kabupaten/kota: https://jambiprov.go.id/profil-kabupatenkota.html
const jambiRegions = [
  "Kota Jambi", "Kota Sungai Penuh", "Kabupaten Batanghari", "Kabupaten Bungo",
  "Kabupaten Kerinci", "Kabupaten Merangin", "Kabupaten Muaro Jambi",
  "Kabupaten Sarolangun", "Kabupaten Tanjung Jabung Barat",
  "Kabupaten Tanjung Jabung Timur", "Kabupaten Tebo",
];

function uniqueOptions(options: Option[]) {
  const seen = new Set<string>();
  return options.flatMap(option => {
    const value = option.value.trim();
    const key = value.replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ ...option, value }];
  });
}

/** Use the full active archive, independent of the visible year and search filters. */
export function buildTripSuggestions(trips: Trip[]): TripSuggestions {
  const active = trips.filter(trip => !trip.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const regions = jambiRegions.map(value => ({ value }));
  return {
    accounts: uniqueOptions(active.map(trip => ({ value: trip.account }))),
    origins: uniqueOptions([...regions, ...active.map(trip => ({ value: trip.lampiran6?.origin ?? "" }))]),
    destinations: uniqueOptions([...regions, ...active.flatMap(trip => tripDestinations(trip).map(value => ({value})))]),
    letters: uniqueOptions(active.map(trip => ({ value: trip.sptNo, description: trip.title }))),
    purposes: uniqueOptions(active.map(trip => ({ value: trip.title, description: [trip.sptNo, trip.destination].filter(Boolean).join(" · ") }))),
  };
}

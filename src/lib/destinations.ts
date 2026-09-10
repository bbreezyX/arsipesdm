/** Keep the display string compatible with existing archives, reports and printouts. */
export function formatDestinations(destinations: string[]) {
  return destinations.map(value => value.trim()).join("; ");
}

export function tripDestinations(trip: {destination: string; destinations?: string[]}) {
  // Never split old free-form addresses on commas or semicolons.
  return trip.destinations?.length ? trip.destinations : [trip.destination];
}

export function destinationKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

// Kabupaten/kota: https://jambiprov.go.id/profil-kabupatenkota.html
export const jambiRegions = [
  "Kota Jambi", "Kota Sungai Penuh", "Kabupaten Batanghari", "Kabupaten Bungo",
  "Kabupaten Kerinci", "Kabupaten Merangin", "Kabupaten Muaro Jambi",
  "Kabupaten Sarolangun", "Kabupaten Tanjung Jabung Barat",
  "Kabupaten Tanjung Jabung Timur", "Kabupaten Tebo",
];
const jambiRegionKeys = new Set(jambiRegions.map(destinationKey));

/** Whether a destination lies inside Jambi province; "Kab." and "Kab" spellings count too. */
export function isJambiRegion(value: string) {
  const key = destinationKey(value).replace(/^kab\.?\s+/, "kabupaten ");
  return key === "jambi" || key === "provinsi jambi" || jambiRegionKeys.has(key);
}

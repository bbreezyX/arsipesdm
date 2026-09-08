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

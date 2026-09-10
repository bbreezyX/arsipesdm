import type { Flight, FlightLeg } from "./lampiran6-schema";

/** Fields that describe one flight; booking references and the price belong to the direction. */
export const flightLegKeys = ["date", "airline", "origin", "destination", "bookingCode", "ticketNo"] as const;

export function emptyFlightLeg(): FlightLeg {
  return { date: "", airline: "", origin: "", destination: "", bookingCode: "", ticketNo: "" };
}

function pickLeg(source: Partial<FlightLeg>): FlightLeg {
  const leg = emptyFlightLeg();
  for (const key of flightLegKeys) leg[key] = source[key] ?? "";
  return leg;
}

const legHasDetail = (leg: FlightLeg) => flightLegKeys.some((key) => leg[key].trim() !== "");

/** Leg 1 is stored in the legacy flat columns so older archives and the source XLSX layout keep working; transits follow it. */
export function flightLegs(flight: Flight): FlightLeg[] {
  return [pickLeg(flight), ...flight.transits.map(pickLeg)];
}

export function withFlightLegs(flight: Flight, legs: FlightLeg[]): Flight {
  const [first = emptyFlightLeg(), ...transits] = legs.map(pickLeg);
  return { ...flight, ...first, transits };
}

export function flightHasDetail(flight: Flight): boolean {
  return flight.application.trim() !== "" || flight.orderId.trim() !== "" || flight.price !== null ||
    flightLegs(flight).some(legHasDetail);
}

/** "Jambi → Jakarta → Makassar": each city once at the join, blanks skipped. */
export function flightRoute(flight: Flight): string {
  const cities: string[] = [];
  for (const leg of flightLegs(flight)) {
    for (const city of [leg.origin.trim(), leg.destination.trim()]) {
      if (city && cities.at(-1)?.toLocaleLowerCase("id-ID") !== city.toLocaleLowerCase("id-ID")) cities.push(city);
    }
  }
  return cities.join(" → ");
}

/** A transit continues from where the previous leg landed, usually the same day on the same carrier. */
export function nextTransitLeg(flight: Flight): FlightLeg {
  const last = flightLegs(flight).at(-1) ?? emptyFlightLeg();
  return { ...emptyFlightLeg(), origin: last.destination, airline: last.airline, date: last.date };
}

/** The return itinerary flown backwards; dates and references are new bookings, so they stay blank. */
export function reversedFlightLegs(flight: Flight): FlightLeg[] {
  return flightLegs(flight).filter(legHasDetail).reverse()
    .map((leg) => ({ ...emptyFlightLeg(), origin: leg.destination, destination: leg.origin, airline: leg.airline }));
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { flightSchema } from "./lampiran6-schema";
import {
  emptyFlightLeg,
  flightHasDetail,
  flightLegs,
  flightRoute,
  nextTransitLeg,
  reversedFlightLegs,
  withFlightLegs,
} from "./flight-legs";

const leg = (origin: string, destination: string, extra: Partial<ReturnType<typeof emptyFlightLeg>> = {}) =>
  ({ ...emptyFlightLeg(), origin, destination, ...extra });

test("the first leg lives in the legacy flat fields and transits follow it", () => {
  const flight = flightSchema.parse({ origin: "Jambi", destination: "Jakarta", airline: "Garuda", price: 1500000,
    transits: [leg("Jakarta", "Makassar", { airline: "Lion" })] });
  const legs = flightLegs(flight);
  assert.equal(legs.length, 2);
  assert.equal(legs[0].origin, "Jambi");
  assert.equal(legs[1].destination, "Makassar");
  assert.equal(flightRoute(flight), "Jambi → Jakarta → Makassar");
  // Booking-level fields stay on the direction, never on a leg.
  assert.equal("price" in legs[0], false);
});

test("an empty ticket has one blank leg and no route", () => {
  const flight = flightSchema.parse({});
  assert.equal(flightLegs(flight).length, 1);
  assert.equal(flightRoute(flight), "");
  assert.equal(flightHasDetail(flight), false);
  assert.equal(flightHasDetail({ ...flight, transits: [leg("A", "B")] }), true);
  assert.equal(flightHasDetail({ ...flight, price: 0 }), true);
});

test("withFlightLegs keeps the first leg flat, removing leg 1 promotes the next transit", () => {
  const flight = flightSchema.parse({ application: "Traveloka", price: 2000000, origin: "Jambi", destination: "Jakarta",
    transits: [leg("Jakarta", "Makassar", { ticketNo: "T2" })] });
  const withoutFirst = withFlightLegs(flight, flightLegs(flight).slice(1));
  assert.equal(withoutFirst.origin, "Jakarta");
  assert.equal(withoutFirst.ticketNo, "T2");
  assert.deepEqual(withoutFirst.transits, []);
  assert.equal(withoutFirst.application, "Traveloka");
  assert.equal(withoutFirst.price, 2000000);
  const cleared = withFlightLegs(flight, []);
  assert.equal(cleared.origin, "");
  assert.deepEqual(cleared.transits, []);
  assert.equal(cleared.price, 2000000);
});

test("the next transit starts where the last leg landed, on the same airline and date", () => {
  const flight = flightSchema.parse({ origin: "Jambi", destination: "Jakarta", airline: "Garuda", date: "2026-03-02" });
  assert.deepEqual(nextTransitLeg(flight), leg("Jakarta", "", { airline: "Garuda", date: "2026-03-02" }));
});

test("the return route mirrors the outbound legs without copying booking references", () => {
  const flight = flightSchema.parse({ origin: "Jambi", destination: "Jakarta", airline: "Garuda", date: "2026-03-02", bookingCode: "ABC", ticketNo: "1",
    transits: [leg("Jakarta", "Makassar", { airline: "Lion", date: "2026-03-02", bookingCode: "DEF", ticketNo: "2" })] });
  assert.deepEqual(reversedFlightLegs(flight), [leg("Makassar", "Jakarta", { airline: "Lion" }), leg("Jakarta", "Jambi", { airline: "Garuda" })]);
});

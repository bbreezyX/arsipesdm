import { totalCost, type Trip } from "./model";
import { tripDestinations } from "./destinations";

export type TaskLetter = {
  key: string;
  number: string;
  trips: Trip[];
  titles: string[];
  destinations: string[];
  startDate: string;
  endDate: string;
  peopleCount: number;
  total: number | null;
  unknownCount: number;
};

export function summarizeTripCosts(trips: Trip[]) {
  let knownCount = 0;
  let amount = 0;
  for (const trip of trips) {
    const cost = totalCost(trip);
    if (cost !== null) { amount += cost; knownCount++; }
  }
  return { total: knownCount ? amount : null, unknownCount: trips.length - knownCount };
}

/** Deduplicate display summaries without modifying the source archive titles. */
function distinctTitles(trips: Trip[]) {
  const titles = new Map<string, string>();
  for (const trip of trips) {
    const title = trip.title.normalize("NFC").replace(/\s+/g, " ").trim();
    const key = title.toLocaleLowerCase("id-ID");
    if (!titles.has(key)) titles.set(key, title);
  }
  return [...titles.values()];
}

export function groupTaskLetters(trips: Trip[]) {
  const grouped = new Map<string, Trip[]>();
  const unassigned: Trip[] = [];
  const seen = new Set<string>();
  for (const trip of trips) {
    if (trip.deletedAt || seen.has(trip.id)) continue;
    seen.add(trip.id);
    // Ignore case and spacing, while preserving the full number and its punctuation/year.
    const number = trip.sptNo.replace(/\s+/g, "").toLocaleUpperCase("id-ID");
    if (!number) { unassigned.push(trip); continue; }
    // An explicit letter year survives journeys crossing New Year. Otherwise
    // scope reused short numbers to the departure year.
    const year = number.match(/(?:^|\D)((?:19|20)\d{2})(?=\D|$)/)?.[1] ?? trip.startDate.slice(0, 4);
    const key = JSON.stringify([number, year]);
    const members = grouped.get(key) ?? [];
    members.push(trip);
    grouped.set(key, members);
  }
  const letters: TaskLetter[] = [...grouped].map(([key, members]) => {
    const ordered = [...members].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.code.localeCompare(b.code));
    const people = new Set(ordered.flatMap(trip => trip.participants.map(person =>
      person.nip.trim() ? `nip:${person.nip.replace(/\s+/g, "")}` : `name:${person.name.trim().toLocaleLowerCase("id-ID")}`,
    )));
    return {
      key,
      number: ordered[0].sptNo.trim(),
      trips: ordered,
      titles: distinctTitles(ordered),
      destinations: [...new Set(ordered.flatMap(tripDestinations))],
      startDate: ordered[0].startDate,
      endDate: ordered.reduce((end, trip) => trip.endDate > end ? trip.endDate : end, ordered[0].endDate),
      peopleCount: people.size,
      ...summarizeTripCosts(ordered),
    };
  }).sort((a, b) => b.startDate.localeCompare(a.startDate) || a.number.localeCompare(b.number, "id-ID"));
  return { letters, unassigned };
}

/** Filter whole letters so searching for one employee never reduces the ST total. */
export function filterTaskLetters(letters: TaskLetter[], query: string, year: string) {
  const search = query.trim().toLocaleLowerCase("id-ID");
  return letters.filter(letter =>
    (year === "all" || letter.trips.some(trip => trip.startDate.slice(0, 4) === year)) &&
    (!search || [letter.number, ...letter.titles, ...letter.destinations,
      ...letter.trips.flatMap(trip => trip.participants.flatMap(person => [person.name, person.nip])),
    ].join(" ").toLocaleLowerCase("id-ID").includes(search)),
  );
}

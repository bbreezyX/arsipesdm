import { defaultFilters, filterTrips, isComplete, jakartaDay, matchesEntry, type Filters, type Participant, type Trip } from "./model";
import { groupTaskLetters, summarizeTripCosts } from "./task-letters";
import { tripDestinations } from "./destinations";

export type ArchiveGroup = ReturnType<typeof groupArchives>[number];

export function groupArchives(trips: Trip[]) {
  const { letters, unassigned } = groupTaskLetters(trips);
  const groups = [
    ...letters.map(letter => ({ ...letter, key: `st:${letter.key}` })),
    ...unassigned.map(trip => ({
      key: `archive:${trip.id}`, number: "", trips: [trip], titles: [trip.title],
      destinations: tripDestinations(trip), startDate: trip.startDate, endDate: trip.endDate,
      ...summarizeTripCosts([trip]),
    })),
  ];
  return groups.map(group => {
    const people = new Map<string, Participant>();
    for (const trip of group.trips) {
      for (const person of trip.participants) {
        const key = person.nip.trim()
          ? `nip:${person.nip.replace(/\s+/g, "")}`
          : `name:${person.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID")}`;
        if (!people.has(key)) people.set(key, person);
      }
    }
    const completeCount = group.trips.filter(isComplete).length;
    return { ...group, participants: [...people.values()], completeCount, complete: completeCount === group.trips.length };
  });
}

/** Entry periods restrict the ledgers first; other searches retain the remaining ST members. */
export function filterArchiveGroups(groups: ArchiveGroup[], filters: Filters, today = jakartaDay()) {
  if (filters.entry !== "all") {
    groups = groups.flatMap(group => groupArchives(group.trips.filter(trip => matchesEntry(trip.createdAt, filters.entry, today)))
      .map(scoped => ({ ...scoped, key: group.key })));
  }
  const matching = new Set(filterTrips(groups.flatMap(group => group.trips), {
    ...filters, status: "all", entry: "all",
  }, today).map(trip => trip.id));
  return groups.filter(group =>
    group.trips.some(trip => matching.has(trip.id)) &&
    (filters.status === "all" ||
      (filters.status === "complete" ? group.complete : !group.complete)),
  ).sort((a, b) => {
    const order = filters.sort === "cost"
      ? (b.total ?? -1) - (a.total ?? -1)
      : filters.sort === "oldest"
        ? a.startDate.localeCompare(b.startDate)
        : b.startDate.localeCompare(a.startDate);
    return order || a.key.localeCompare(b.key, "id-ID");
  });
}

export function archivesForExport(groups: ArchiveGroup[], selected?: Set<string>) {
  return groups.filter(group => !selected || selected.has(group.key)).flatMap(group => group.trips);
}

export function archiveGroupsForYear(groups: ArchiveGroup[], year: string) {
  return filterArchiveGroups(groups, { ...defaultFilters, year });
}

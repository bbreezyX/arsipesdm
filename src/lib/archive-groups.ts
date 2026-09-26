import { defaultFilters, filterTrips, isComplete, jakartaDay, matchesEntry, missingSppd, totalCost, type Filters, type Participant, type Trip } from "./model";
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
      (filters.status === "no-sppd" ? group.trips.some(missingSppd)
        : filters.status === "complete" ? group.complete : !group.complete)),
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

export type CostShare = { category: string; amount: number; trips: number };

/** Realisasi per komponen biaya dalam satu Surat Tugas, terbesar dulu; trips = jumlah rekap yang memuatnya. */
export function costMix(trips: Trip[]): CostShare[] {
  const shares = new Map<string, { amount: number; trips: Set<string> }>();
  for (const trip of trips) {
    for (const cost of trip.costs) {
      const share = shares.get(cost.category) ?? { amount: 0, trips: new Set<string>() };
      share.amount += cost.amount;
      share.trips.add(trip.id);
      shares.set(cost.category, share);
    }
  }
  return [...shares].map(([category, share]) => ({ category, amount: share.amount, trips: share.trips.size }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, "id-ID"));
}

/** Kolom tabel per pegawai: semua komponen bila muat; bila lebih, yang terbesar ditambah satu kolom Lainnya. */
export function costColumns(mix: CostShare[], max = 3) {
  if (mix.length <= max) return { named: mix.map(share => share.category), other: false };
  return { named: mix.slice(0, max - 1).map(share => share.category), other: true };
}

/** Jumlah satu rekap untuk tiap kolom costColumns; null bila rekap tidak memuat komponen itu. */
export function amountsByColumn(trip: Trip, columns: ReturnType<typeof costColumns>): (number | null)[] {
  const sum = (pick: (category: string) => boolean) => {
    const costs = trip.costs.filter(cost => pick(cost.category));
    return costs.length ? costs.reduce((total, cost) => total + cost.amount, 0) : null;
  };
  const named = columns.named.map(name => sum(c => c === name));
  return columns.other ? [...named, sum(c => !columns.named.includes(c))] : named;
}

export type RecordGapField = "costs" | "sppd" | "documents" | "account";

/** Data administrasi yang belum dicatat pada rekap-rekap satu Surat Tugas; hanya bidang yang benar-benar kosong. */
export function recordGaps(trips: Trip[]): { field: RecordGapField; trips: Trip[] }[] {
  const checks: [RecordGapField, (trip: Trip) => boolean][] = [
    ["costs", trip => totalCost(trip) === null],
    ["sppd", missingSppd],
    ["documents", trip => !trip.documents.length],
    ["account", trip => !trip.account.trim()],
  ];
  return checks.map(([field, missing]) => ({ field, trips: trips.filter(missing) })).filter(gap => gap.trips.length > 0);
}

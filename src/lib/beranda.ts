import { dateText, isComplete, jakartaDay, missingDocs, totalCost, type EntryFilter, type EventItem, type Trip } from "./model";
import type { Employee } from "./employees";
import { honorariumTotals, type Honorarium } from "./honorarium";
import { groupArchives } from "./archive-groups";
import { groupTaskLetters } from "./task-letters";
import { employeeIdentity } from "./employees";
import { tripDestinations } from "./destinations";

export type AttentionId = "draft" | "docs" | "unassigned" | "trash" | "honorarium";
export type AttentionItem = { id: AttentionId; count: number };
/** One journey (surat tugas) under way on a day; its per-employee ledgers are folded together. */
export type CalendarEntry = { key: string; number: string; title: string; destinations: string[]; people: number; recaps: number };
export type CalendarDay = { people: number; trips: number; entries: CalendarEntry[] };
export type ActivityItem = EventItem & { tripId: string; code: string; title: string };
export type BerandaSummary = ReturnType<typeof berandaSummary>;

export function greeting(hour: number) {
  if (hour >= 4 && hour <= 10) return "Selamat pagi";
  if (hour >= 11 && hour <= 14) return "Selamat siang";
  if (hour >= 15 && hour <= 18) return "Selamat sore";
  return "Selamat malam";
}

/** The current year while it has archives; otherwise the latest year that does. */
export function pickYear(trips: Trip[], today: string) {
  const current = today.slice(0, 4);
  const years = [...new Set(trips.filter(t => !t.deletedAt).map(t => t.startDate.slice(0, 4)))].sort();
  if (!years.length || years.includes(current)) return current;
  return years[years.length - 1];
}

export function relativeTime(at: string, now: string) {
  const seconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(at)) / 1000));
  if (seconds < 60) return "baru saja";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "kemarin";
  if (days <= 30) return `${days} hari lalu`;
  return dateText(at.slice(0, 10));
}

function isoDay(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

export function berandaSummary({ trips, employees, honorariums, today }: {
  trips: Trip[]; employees: Employee[]; honorariums: Honorarium[]; today: string;
}) {
  const year = pickYear(trips, today);
  const active = trips.filter(t => !t.deletedAt);
  const yearTrips = active.filter(t => t.startDate.startsWith(year));

  // Hero and monthly realisation follow the departure date, like every register.
  const monthly = Array.from({ length: 12 }, () => 0);
  let total = 0;
  let unknown = 0;
  for (const trip of yearTrips) {
    const cost = totalCost(trip);
    if (cost === null) { unknown++; continue; }
    total += cost;
    monthly[Number(trip.startDate.slice(5, 7)) - 1] += cost;
  }
  const peakMonth = monthly.reduce((best, value, month) => (value > monthly[best] ? month : best), 0);
  const yearGroups = groupArchives(yearTrips);
  const people = new Set(yearTrips.flatMap(t => t.participants.map(employeeIdentity))).size;
  const hero = {
    total, unknown, known: yearTrips.length - unknown,
    recaps: yearTrips.length, journeys: yearGroups.length, people,
    peak: monthly[peakMonth] > 0 ? { month: peakMonth, total: monthly[peakMonth] } : null,
  };
  const monthlyDetails = monthly.map((total, month) => {
    const entries = yearTrips.filter(t => Number(t.startDate.slice(5, 7)) - 1 === month);
    const unknown = entries.filter(t => totalCost(t) === null).length;
    return {
      total, unknown, known: entries.length - unknown,
      recaps: entries.length, journeys: groupArchives(entries).length,
      people: new Set(entries.flatMap(t => t.participants.map(employeeIdentity))).size,
    };
  });

  // Calendar: every day a trip is under way, weighted by the people travelling.
  const yearStart = Date.UTC(Number(year), 0, 1);
  const yearEnd = Date.UTC(Number(year), 11, 31);
  const days: Record<string, CalendarDay> = {};
  let peopleDays = 0;
  for (const trip of active) {
    const start = Math.max(Date.parse(`${trip.startDate}T00:00:00Z`), yearStart);
    const end = Math.min(Date.parse(`${trip.endDate}T00:00:00Z`), yearEnd);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) continue;
    const travellers = Math.max(1, trip.participants.length);
    const number = trip.sptNo.trim();
    const groupKey = number ? `st:${number.replace(/\s+/g, "").toLocaleUpperCase("id-ID")}` : `archive:${trip.id}`;
    for (let time = start; time <= end; time += 86_400_000) {
      const key = isoDay(time);
      const day = days[key] ?? (days[key] = { people: 0, trips: 0, entries: [] });
      day.people += travellers;
      day.trips += 1;
      peopleDays += travellers;
      const entry = day.entries.find(item => item.key === groupKey);
      if (entry) {
        entry.people += travellers;
        entry.recaps += 1;
        for (const place of tripDestinations(trip)) if (!entry.destinations.includes(place)) entry.destinations.push(place);
      } else {
        day.entries.push({ key: groupKey, number: number || trip.code, title: trip.title, destinations: [...tripDestinations(trip)], people: travellers, recaps: 1 });
      }
    }
  }
  let peak: { date: string; people: number } | null = null;
  for (const [date, day] of Object.entries(days).sort(([a], [b]) => a.localeCompare(b))) {
    if (!peak || day.people > peak.people) peak = { date, people: day.people };
  }
  const calendar = { year, days, peak, peopleDays };

  // Open work across every year; the operator clears it from here.
  const yearHonorariums = honorariums.filter(h => !h.deletedAt && h.year === Number(year));
  const candidates: AttentionItem[] = [
    { id: "draft", count: active.filter(t => !isComplete(t)).length },
    { id: "docs", count: active.filter(t => missingDocs(t).length > 0).length },
    { id: "unassigned", count: active.filter(t => !t.sptNo.trim()).length },
    { id: "trash", count: trips.filter(t => t.deletedAt).length },
  ];
  if (!yearHonorariums.length) candidates.push({ id: "honorarium", count: 0 });
  const attention = candidates.filter(item => item.id === "honorarium" || item.count > 0);

  const documentsComplete = yearTrips.filter(t => missingDocs(t).length === 0).length;
  const registers = {
    archives: { journeys: yearGroups.length, recaps: yearTrips.length },
    taskLetters: { letters: groupTaskLetters(yearTrips).letters.length },
    honorarium: {
      records: yearHonorariums.length,
      net: yearHonorariums.reduce((sum, h) => sum + honorariumTotals(h).net, 0),
    },
    documents: {
      complete: documentsComplete, total: yearTrips.length,
      ratio: yearTrips.length ? documentsComplete / yearTrips.length : null,
    },
    people: { active: employees.filter(p => !p.deletedAt).length, travelled: people },
  };

  // The latest recording day, across every travel year: today's work when there is any,
  // otherwise the last day the operator recorded something. Its filter opens the registers.
  const activeHonorariums = honorariums.filter(h => !h.deletedAt);
  const latestDay = [...active, ...activeHonorariums].map(item => jakartaDay(item.createdAt))
    .filter(Boolean).reduce<string | null>((latest, day) => (latest && latest >= day ? latest : day), null);
  const isToday = latestDay === today;
  const latestTrips = active.filter(t => jakartaDay(t.createdAt) === latestDay);
  const latestHonorariums = activeHonorariums.filter(h => jakartaDay(h.createdAt) === latestDay);
  const latest = {
    day: latestDay,
    isToday,
    filter: (isToday || !latestDay ? "today" : latestDay) as EntryFilter,
    recaps: latestTrips.length,
    journeys: groupArchives(latestTrips).length,
    unknown: latestTrips.filter(t => totalCost(t) === null).length,
    total: latestTrips.reduce((sum, t) => sum + (totalCost(t) ?? 0), 0),
    honorariums: latestHonorariums.length,
    honorariumNet: latestHonorariums.reduce((sum, h) => sum + honorariumTotals(h).net, 0),
  };

  const activity: ActivityItem[] = trips
    .flatMap(trip => trip.history.map(event => ({ ...event, tripId: trip.id, code: trip.code, title: trip.title })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 24);

  return { year, hero, monthly, monthlyDetails, calendar, attention, registers, activity, latest };
}

import type { Trip, User } from "./model";
import { can, requirePermission } from "./permissions";

/** A reader sees travel/financial records, but no trash, file identities or internal notes. */
export function visibleTrip(trip: Trip, user: Pick<User, "role">): Trip | null {
  requirePermission(user, "archives:read");
  if (can(user, "archives:write")) return trip;
  if (trip.deletedAt) return null;
  // Explicit fields avoid exposing future top-level fields by default.
  return {
    id: trip.id, code: trip.code, version: trip.version,
    createdAt: trip.createdAt, updatedAt: trip.updatedAt, deletedAt: null,
    title: trip.title, sptNo: trip.sptNo, sppdNo: trip.sppdNo,
    destination: trip.destination, destinations: trip.destinations,
    department: trip.department, startDate: trip.startDate, endDate: trip.endDate,
    participants: trip.participants.map(({ id, name, nip, position, department }) => ({ id, name, nip, position, department })),
    costs: trip.costs.map(({ id, category, label, participantId, amount }) => ({ id, category, label, participantId, amount })),
    paid: trip.paid, activity: trip.activity, account: trip.account, fundTrack: trip.fundTrack ?? "",
    lampiran6: trip.lampiran6 ? { ...trip.lampiran6, sourceNo: "", sourceRows: [], sourceIssues: [], sourceFormulas: {} } : undefined,
    requiredDocs: trip.requiredDocs,
    // Types/counts preserve completeness statistics without revealing the files or storage locations.
    documents: trip.documents.map((doc, index) => ({
      id: `summary-${index}`, type: doc.type, kind: doc.kind,
      name: "", location: "", size: 0, createdAt: "",
    })),
    notes: "", physicalLocation: "", correctionReason: "", history: [], source: "Arsip kantor",
  };
}

export function visibleTrips(trips: Trip[], user: Pick<User, "role">): Trip[] {
  requirePermission(user, "archives:read");
  return trips.flatMap(trip => {
    const visible = visibleTrip(trip, user);
    return visible ? [visible] : [];
  });
}

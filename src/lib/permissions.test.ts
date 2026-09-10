import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canAccessSection, requirePermission, isUserRole, type Permission } from "./permissions";
import { sectionPaths, type Section } from "./workspace-navigation";
import { visibleTrip, visibleTrips } from "./archive-access";
import { tripSchema, isComplete, missingDocs, totalCost, type Trip, type User } from "./model";

const reader = { role: "viewer" as const };
const restricted: Permission[] = [
  "archives:write", "archives:export", "trash:read", "documents:read", "documents:write",
  "employees:read", "employees:write", "honorariums:read", "honorariums:write",
  "vehicles:read", "vehicles:write", "users:manage", "settings:manage",
];

test("Pembaca can browse only the four travel/report sections and cannot mutate or export", () => {
  assert(can(reader, "archives:read"));
  for (const permission of restricted) {
    assert.equal(can(reader, permission), false, permission);
    assert.throws(() => requirePermission(reader, permission), /FORBIDDEN/, permission);
  }
  const allowed = (Object.keys(sectionPaths) as Section[]).filter(section => canAccessSection(reader, section));
  assert.deepEqual(allowed, ["home", "archives", "taskLetters", "reports"]);
});

test("existing Operator permissions are preserved and account/settings changes remain admin-only", () => {
  const operator = { role: "operator" as const };
  const admin = { role: "admin" as const };
  for (const permission of ["archives:read" as const, ...restricted]) {
    assert(can(admin, permission), permission);
    assert.equal(can(operator, permission), permission !== "users:manage" && permission !== "settings:manage", permission);
  }
  for (const section of Object.keys(sectionPaths) as Section[]) assert(canAccessSection(operator, section), section);
});

test("missing/unknown roles and unknown permissions fail closed", () => {
  for (const role of ["", "ADMIN", "pembaca", "__proto__", "constructor", null, undefined]) {
    assert.equal(isUserRole(role), false);
    assert.equal(can({ role } as User, "archives:read"), false);
  }
  assert.equal(can(null, "archives:read"), false);
  assert.equal(can({ role: "admin" }, "unknown:permission" as Permission), false);
  assert.equal(canAccessSection(reader, "unknown" as Section), false);
});

function fixture(): Trip {
  return {
    ...tripSchema.parse({
      title: "Perjalanan pengujian hak akses", sptNo: "ST-UJI/2024", destination: "Kerinci", department: "Energi",
      startDate: "2024-01-11", endDate: "2024-01-12",
      participants: [{ id: "p1", name: "Pegawai uji", nip: "123", position: "Analis", department: "Energi" }],
      costs: [{ id: "c1", category: "Transportasi", label: "Perjalanan", participantId: "p1", amount: 150000 }],
      requiredDocs: ["spt", "sppd"], notes: "INTERNAL-NOTE", physicalLocation: "PRIVATE-LOCATION", correctionReason: "INTERNAL-CORRECTION",
    }),
    id: "trip1", code: "PD/2024/0001", version: 3, createdAt: "2024-01-13T00:00:00Z", updatedAt: "2024-01-14T00:00:00Z",
    deletedAt: null, source: "PRIVATE-SOURCE.xlsx",
    documents: [{ id: "PRIVATE-DOCUMENT-ID", type: "spt", kind: "file", name: "PRIVATE-FILENAME.pdf", size: 100, location: "PRIVATE-LOCATION", createdAt: "2024-01-13" }],
    history: [{ id: "h1", action: "Edit", actor: "Operator", at: "2024-01-14T00:00:00Z", detail: "INTERNAL-HISTORY" }],
  };
}

test("reader projection preserves financial totals and completeness without internal metadata", () => {
  const original = fixture();
  const before = structuredClone(original);
  const projected = visibleTrip({ ...original, futureSecret: "FUTURE-SECRET" } as Trip, reader)!;
  assert.equal(totalCost(projected), totalCost(original));
  assert.equal(isComplete(projected), isComplete(original));
  assert.deepEqual(missingDocs(projected), missingDocs(original));
  assert.deepEqual(projected.participants, original.participants);
  assert.equal(projected.documents.length, original.documents.length);
  for (const secret of ["INTERNAL-NOTE", "INTERNAL-CORRECTION", "INTERNAL-HISTORY", "PRIVATE-", "FUTURE-SECRET"])
    assert(!JSON.stringify(projected).includes(secret), secret);
  assert.deepEqual(original, before, "the stored archive must remain unchanged");
  assert.equal(visibleTrip(original, { role: "operator" }), original);
  assert.equal(visibleTrip(original, { role: "admin" }), original);
});

test("trash cannot be read through list or direct ID by Pembaca", () => {
  const active = fixture();
  const deleted = { ...fixture(), id: "deleted", deletedAt: "2024-02-01" };
  assert.equal(visibleTrip(deleted, reader), null);
  assert.deepEqual(visibleTrips([active, deleted], reader).map(trip => trip.id), [active.id]);
  assert.equal(visibleTrips([active, deleted], { role: "operator" }).length, 2);
});

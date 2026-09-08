import { setupTestDatabase } from "./test-database";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { employeeIdentity, employeeMatches, employeeSchema } from "./employees";

test("employee directory preserves archive snapshots and isolates workspaces", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rek-employees-"));
  const cleanupDatabase = await setupTestDatabase();
  process.env.DATA_DIR = directory;
  process.env.DEMO_ENABLED = "false";
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  const { db, putTrip, getTrip } = await import("./db");
  const {getEmployees, createEmployee, changeEmployee} = await import("./employee-db");
  try {
    const {tripSchema} = await import("./model");
    const participant = {id:"participant", name:"Pegawai Awal", nip:"00123", position:"Analis", department:"Energi"};
    const input = tripSchema.parse({title:"Perjalanan uji", destination:"Jambi", department:"Energi", startDate:"2025-01-01", endDate:"2025-01-02", participants:[participant], costs:[]});
    const trip = {...input, id:"test-trip", code:"PD/2025/0001", version:1, createdAt:"2025-01-01", updatedAt:"2025-01-01", documents:[], history:[], source:"Test", deletedAt:null};
    (await putTrip(trip, "office"));
    const snapshot = JSON.stringify((await getTrip(trip.id, "office")));
    const [seeded] = (await getEmployees("office"));
    assert.equal(seeded.nip, "00123");
    assert.equal((await getEmployees("office")).length, 1);
    assert.equal((await getEmployees("demo")).length, 0);
    await assert.rejects(async () => (await createEmployee("office", participant)), /sudah tercatat/);
    const edited = (await changeEmployee("office", seeded.id, seeded.version, "edit", {...participant, name:"Pegawai Diperbarui", nip:"00456", rank:"IV/a"}));
    assert.equal(edited.rank, "IV/a");
    assert.ok(employeeMatches(edited, participant));
    assert.ok(employeeMatches(edited, {...participant, nip:"00456"}));
    await assert.rejects(async () => (await changeEmployee("office", seeded.id, seeded.version, "delete")), /telah berubah/);
    await assert.rejects(async () => (await changeEmployee("demo", seeded.id, edited.version, "delete")), /tidak ditemukan/);
    const deleted = (await changeEmployee("office", edited.id, edited.version, "delete"));
    assert.ok(deleted.deletedAt);
    assert.equal((await getEmployees("office")).filter(p => !p.deletedAt).length, 0);
    assert.equal((await getEmployees("office")).length, 1);
    await assert.rejects(async () => (await changeEmployee("office", deleted.id, deleted.version, "edit", participant)), /Pulihkan/);
    const restored = (await changeEmployee("office", deleted.id, deleted.version, "restore"));
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.rank, "IV/a");
    assert.equal(JSON.stringify((await getTrip(trip.id, "office"))), snapshot);
    const created = (await createEmployee("office", {name:"  Pegawai Baru  ", nip:"00001", rank:" III/a "}));
    assert.equal(created.name, "Pegawai Baru");
    assert.equal(created.rank, "III/a");
    assert.equal((await getEmployees("office")).find(p => p.id === created.id)?.rank, "III/a");
    assert.equal(created.nip, "00001");
    assert.equal((await getEmployees("office")).length, 2);
    (await createEmployee("demo", {name:"Pegawai Baru", nip:"00001"}));
    assert.equal((await getEmployees("demo")).length, 1);
    await assert.rejects(async () => (await changeEmployee("office", restored.id, restored.version, "edit", {name:"Duplikat", nip:"00001"})), /sudah tercatat/);
    const retained = (await changeEmployee("office", created.id, created.version, "edit", {name: created.name, nip: created.nip, position:"Analis"}));
    assert.equal(retained.rank, "III/a", "older clients omitting rank must preserve it");
    const cleared = (await changeEmployee("office", retained.id, retained.version, "edit", {...retained, rank:""}));
    assert.equal(cleared.rank, "");
    assert.equal((await getEmployees("office")).find(p => p.id === cleared.id)?.rank, "");

    const {lampiran6Schema} = await import("./lampiran6-schema");
    const sourceTrip = {...trip, id:"rank-source", lampiran6: lampiran6Schema.parse({rank:"III/b"})};
    (await putTrip(sourceTrip, "legacy"));
    const legacyEmployee = {...participant, id:"legacy-employee", version:1, identities:[employeeIdentity(participant)], deletedAt:null};
    (await db.prepare("INSERT INTO employees VALUES(?,?,?)").run(legacyEmployee.id, "legacy", JSON.stringify(legacyEmployee)));
    const [migrated] = (await getEmployees("legacy"));
    assert.equal(migrated.rank, "III/b");
    assert.equal(migrated.version, 2);
    assert.equal((await getEmployees("legacy"))[0].version, 2, "migration must be idempotent");
    (await changeEmployee("legacy", migrated.id, migrated.version, "edit", {...migrated, rank:""}));
    assert.equal((await getEmployees("legacy"))[0].rank, "", "cleared rank must not be restored from an old archive");
    assert.equal((await getTrip(sourceTrip.id, "legacy"))?.lampiran6?.rank, "III/b");
    (await putTrip({...sourceTrip, id:"seed-rank"}, "new-workspace"));
    assert.equal((await getEmployees("new-workspace"))[0].rank, "III/b");

  } finally {
    await db.close(); await cleanupDatabase();
    rmSync(directory, {recursive:true, force:true});
  }
});

test("employee validation rejects blank names and preserves optional identity fields", () => {
  assert.equal(employeeSchema.safeParse({name:"   "}).success, false);
  assert.equal(employeeSchema.safeParse({name:"A", nip:123}).success, false);
  assert.equal(employeeSchema.safeParse({name:"A", rank:123}).success, false);
  assert.equal(employeeSchema.safeParse({name:"A", rank:"A".repeat(1001)}).success, false);
  assert.equal(employeeSchema.parse({name:"A"}).rank, "");
  assert.equal(employeeSchema.parse({name:"A", rank:"IX"}).rank, "IX", "allow other personnel formats");
  assert.equal(employeeIdentity({name:"  NAMA Pegawai ", nip:""}), "name:nama pegawai");
});

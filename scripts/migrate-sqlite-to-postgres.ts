import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { db, transaction } from "../src/lib/postgres";

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath || !existsSync(sourcePath)) throw new Error("Usage: tsx scripts/migrate-sqlite-to-postgres.ts <backup/archive.sqlite>");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const baseline = process.argv[3] ? new DatabaseSync(process.argv[3], { readOnly: true }) : undefined;
  const tables = ["records", "users", "settings", "employees", "honorariums"];
  try {
    assert.equal(Object.values(source.prepare("PRAGMA integrity_check").get()!)[0], "ok");
    const report = await transaction(async () => {
      const counts: Record<string, number> = {};
      // Import is repeatable only when every existing row is byte-for-byte identical.
      // Never overwrite a changed record or account in the destination.
      for (const table of tables) {
        const rows = source.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
          const key = table === "settings" ? "key" : "id";
          const old = await db.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(row[key]);
          if (old) {
            if (JSON.stringify(old) !== JSON.stringify(row)) {
              const previous = baseline?.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(row[key]);
              assert.ok(previous, `Destination differs without baseline: ${table}`);
              assert.deepEqual(old, { ...previous }, `Destination changed after initial migration: ${table}`);
              const columns = Object.keys(row).filter(column => column !== key);
              await db.prepare(`UPDATE ${table} SET ${columns.map(column => `${column}=?`).join(",")} WHERE ${key}=?`).run(...columns.map(column => row[column]), row[key]);
            }
            continue;
          }
          const columns = Object.keys(row);
          await db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row));
        }
        if (baseline) {
          const key = table === "settings" ? "key" : "id";
          const sourceKeys = new Set(rows.map(row => row[key]));
          for (const previous of baseline.prepare(`SELECT * FROM ${table}`).all()) {
            if (sourceKeys.has(previous[key])) continue;
            const old = await db.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(previous[key]);
            if (!old) continue;
            assert.deepEqual(old, { ...previous }, `Removed source row changed in destination: ${table}`);
            await db.prepare(`DELETE FROM ${table} WHERE ${key}=?`).run(previous[key]);
          }
        }
        counts[table] = rows.length;
        const key = table === "settings" ? "key" : "id";
        const persisted = await db.prepare(`SELECT * FROM ${table} ORDER BY ${key}`).all();
        const expected = rows.map(row => ({ ...row })).sort((a, b) => String(a[key]).localeCompare(String(b[key]), "en"));
        persisted.sort((a, b) => String(a[key]).localeCompare(String(b[key]), "en"));
        assert.deepEqual(persisted, expected, `Destination data differs: ${table}`);
      }
      let attachments = 0;
      for (const row of source.prepare("SELECT workspace,payload FROM records").all()) {
        const trip = JSON.parse(String(row.payload));
        for (const doc of trip.documents || []) {
          if (doc.kind !== "file") continue;
          if (!/^[\da-f-]{36}$/.test(doc.id) || !/^[a-zA-Z0-9_-]+$/.test(String(row.workspace))) throw new Error("Invalid attachment path");
          const bytes = readFileSync(path.join(path.dirname(sourcePath), "attachments", String(row.workspace), doc.id));
          assert.equal(bytes.length, doc.size, "Attachment size mismatch");
          const old = await db.prepare("SELECT content FROM attachments WHERE workspace=? AND id=?").get(row.workspace, doc.id);
          if (old) assert.deepEqual(old.content, bytes);
          else await db.prepare("INSERT INTO attachments(workspace,id,content) VALUES(?,?,?)").run(row.workspace, doc.id, bytes);
          attachments++;
        }
      }
      counts.attachments = attachments;
      // Login sessions and failed-login counters remain in the backup; users sign in afresh.
      return counts;
    });
    console.log(JSON.stringify({ migrated: report, verified: true }));
  } finally { source.close(); baseline?.close(); await db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

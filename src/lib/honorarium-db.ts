import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { honorariumSchema, type Honorarium } from "./honorarium";

db.exec(`CREATE TABLE IF NOT EXISTS honorariums(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS honorariums_workspace ON honorariums(workspace);`);
export function getHonorariums(workspace: string): Honorarium[] {
  return (db.prepare("SELECT payload FROM honorariums WHERE workspace=?").all(workspace) as {payload: string}[])
    .map(row => JSON.parse(row.payload) as Honorarium).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getHonorarium(workspace: string, id: string): Honorarium {
  const row = db.prepare("SELECT payload FROM honorariums WHERE workspace=? AND id=?").get(workspace, id) as {payload: string} | undefined;
  if (!row) throw new Error("Honorarium tidak ditemukan.");
  return JSON.parse(row.payload);
}
function write(workspace: string, record: Honorarium) {
  db.prepare("INSERT INTO honorariums VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE workspace=excluded.workspace")
    .run(record.id, workspace, JSON.stringify(record));
}
export function createHonorarium(workspace: string, body: unknown): Honorarium {
  const input = honorariumSchema.parse(body);
  const now = new Date().toISOString();
  const record = {...input, id: randomUUID(), version: 1, createdAt: now, updatedAt: now, deletedAt: null};
  write(workspace, record);
  return record;
}
export function changeHonorarium(workspace: string, id: string, version: unknown, action: "edit" | "delete" | "restore", body?: unknown) {
  return transaction(() => {
    const record = getHonorarium(workspace, id);
    if (record.version !== version) throw new Error("Honorarium sudah diperbarui. Tutup formulir lalu muat ulang daftar sebelum mencoba kembali.");
    if (action === "edit") {
      if (record.deletedAt) throw new Error("Pulihkan honorarium sebelum mengedit.");
      Object.assign(record, honorariumSchema.parse(body));
    } else record.deletedAt = action === "delete" ? new Date().toISOString() : null;
    record.version++;
    record.updatedAt = new Date().toISOString();
    write(workspace, record);
    return record;
  });
}

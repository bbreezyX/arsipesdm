import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { honorariumSchema, type Honorarium } from "./honorarium";


export async function getHonorariums(workspace: string): Promise<Honorarium[]> {
  return ((await db.prepare("SELECT payload FROM honorarium WHERE workspace=?").all(workspace)) as {payload: string}[])
    .map(row => JSON.parse(row.payload) as Honorarium).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getHonorarium(workspace: string, id: string): Promise<Honorarium> {
  const row = (await db.prepare("SELECT payload FROM honorarium WHERE workspace=? AND id=?").get(workspace, id)) as {payload: string} | undefined;
  if (!row) throw new Error("Honorarium tidak ditemukan.");
  return JSON.parse(row.payload);
}
async function write(workspace: string, record: Honorarium) {
  (await db.prepare("INSERT INTO honorarium VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE honorarium.workspace=excluded.workspace")
    .run(record.id, workspace, JSON.stringify(record)));
}
export async function createHonorarium(workspace: string, body: unknown): Promise<Honorarium> {
  const input = honorariumSchema.parse(body);
  const now = new Date().toISOString();
  const record = {...input, id: randomUUID(), version: 1, createdAt: now, updatedAt: now, deletedAt: null};
  (await write(workspace, record));
  return record;
}
export async function changeHonorarium(workspace: string, id: string, version: unknown, action: "edit" | "delete" | "restore", body?: unknown) {
  return (await transaction(async () => {
    const record = (await getHonorarium(workspace, id));
    if (record.version !== version) throw new Error("Honorarium sudah diperbarui. Tutup formulir lalu muat ulang daftar sebelum mencoba kembali.");
    if (action === "edit") {
      if (record.deletedAt) throw new Error("Pulihkan honorarium sebelum mengedit.");
      Object.assign(record, honorariumSchema.parse(body));
    } else record.deletedAt = action === "delete" ? new Date().toISOString() : null;
    record.version++;
    record.updatedAt = new Date().toISOString();
    (await write(workspace, record));
    return record;
  }));
}

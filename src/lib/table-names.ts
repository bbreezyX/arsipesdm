import type { PoolClient } from "pg";

export const tableNames = {
  records: "arsip_perjalanan",
  users: "pengguna",
  sessions: "sesi_login",
  settings: "pengaturan",
  attempts: "percobaan_login",
  employees: "pegawai",
  honorariums: "honorarium",
  attachments: "lampiran",
} as const;

/** Run inside the schema initialization transaction and advisory lock. */
export async function renameLegacyTables(client: PoolClient) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  for (const [oldName, newName] of Object.entries(tableNames)) {
    const { rows: [tables] } = await client.query(
      "SELECT to_regclass(format('%I.%I', current_schema(), $1::text)) AS old_table, to_regclass(format('%I.%I', current_schema(), $2::text)) AS new_table",
      [oldName, newName],
    );
    if (!tables.old_table) continue;
    if (tables.new_table) throw new Error(`Migrasi dibatalkan: tabel ${oldName} dan ${newName} sama-sama ada.`);
    // Identifiers come exclusively from the fixed mapping above.
    await client.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
    const { rows: constraints } = await client.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = to_regclass(format('%I.%I', current_schema(), $1::text))",
      [newName],
    );
    for (const { conname } of constraints) {
      if (!conname.startsWith(`${oldName}_`)) continue;
      const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
      await client.query(`ALTER TABLE "${newName}" RENAME CONSTRAINT ${quote(conname)} TO ${quote(newName + conname.slice(oldName.length))}`);
    }
    for (const suffix of ["workspace", "expires"]) {
      await client.query(`ALTER INDEX IF EXISTS "${oldName}_${suffix}" RENAME TO "${newName}_${suffix}"`);
    }
  }
}

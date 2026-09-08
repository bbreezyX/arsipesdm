import { Pool } from "pg";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const destination = process.argv[2];
if (!destination || !process.env.DATABASE_URL) throw new Error("Usage: DATABASE_URL=... node scripts/backup-postgres.mjs <output.json>");
const pool = new Pool({connectionString: process.env.DATABASE_URL, max: 1});
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const tables = {};
  const names = {records: "arsip_perjalanan", users: "pengguna", settings: "pengaturan", employees: "pegawai", honorariums: "honorarium", sessions: "sesi_login", attempts: "percobaan_login", attachments: "lampiran"};
  for (const [legacy, current] of Object.entries(names)) {
    const {rows: [found]} = await client.query("SELECT to_regclass($1) AS legacy, to_regclass($2) AS current", [legacy, current]);
    if (found.legacy && found.current) throw new Error(`Nama tabel bertabrakan: ${legacy} / ${current}`);
    const table = found.current ? current : legacy;
    const projection = current === "lampiran" ? "workspace,id,encode(content,'base64') AS content_base64" : "*";
    tables[table] = (await client.query(`SELECT ${projection} FROM ${table}`)).rows;
  }
  await client.query("COMMIT");
  const content = JSON.stringify({format: "arsipesdm-postgres-v1", createdAt: new Date().toISOString(), tables}, null, 2);
  writeFileSync(destination, content, {flag: "wx", mode: 0o600});
  console.log(JSON.stringify({file: destination, sha256: createHash("sha256").update(content).digest("hex"), counts: Object.fromEntries(Object.entries(tables).map(([key, value]) => [key, value.length]))}));
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await pool.end(); }

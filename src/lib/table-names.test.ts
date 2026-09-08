import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { setupTestDatabase } from "./test-database";
import { schemaSQL } from "./postgres";
import { renameLegacyTables, tableNames } from "./table-names";

test("legacy table migration preserves identities, rows and indexes and can run twice", async () => {
  const cleanup = await setupTestDatabase();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${process.env.DATABASE_SCHEMA}` });
  const client = await pool.connect();
  try {
    let legacySQL = schemaSQL;
    for (const [oldName, newName] of Object.entries(tableNames)) legacySQL = legacySQL.replaceAll(newName, oldName);
    await client.query(legacySQL);
    await client.query(`
      INSERT INTO records VALUES ('a','office','{"title":"Arsip lama"}');
      INSERT INTO users VALUES ('u','Operator','u@example.test','hashed','operator');
      INSERT INTO sessions VALUES ('token','u',123456789);
      INSERT INTO settings VALUES ('departments','["Energi"]');
      INSERT INTO attempts VALUES ('u@example.test',2,123456789);
      INSERT INTO employees VALUES ('e','office','{"name":"Pegawai"}');
      INSERT INTO honorariums VALUES ('h','office','{"amount":123}');
      INSERT INTO attachments VALUES ('d','office',decode('00ff12','hex'));
    `);
    const before = new Map();
    for (const name of Object.keys(tableNames)) {
      before.set(name, { oid: (await client.query("SELECT $1::regclass::oid AS oid", [name])).rows[0].oid, rows: (await client.query(`SELECT * FROM ${name}`)).rows });
    }
    const indexCount = (await client.query("SELECT count(*) FROM pg_indexes WHERE schemaname=current_schema()")).rows[0].count;
    for (let run = 0; run < 2; run++) {
      await client.query("BEGIN");
      await renameLegacyTables(client);
      await client.query(schemaSQL);
      await client.query("COMMIT");
      for (const [oldName, newName] of Object.entries(tableNames)) {
        assert.equal((await client.query("SELECT $1::regclass::oid AS oid", [newName])).rows[0].oid, before.get(oldName).oid);
        assert.deepEqual((await client.query(`SELECT * FROM ${newName}`)).rows, before.get(oldName).rows);
        assert.equal((await client.query("SELECT to_regclass($1) AS old", [oldName])).rows[0].old, null);
      }
      assert.equal((await client.query("SELECT count(*) FROM pg_indexes WHERE schemaname=current_schema()")).rows[0].count, indexCount);
    }
    await client.query("INSERT INTO arsip_perjalanan VALUES ('a','office','updated') ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE arsip_perjalanan.workspace=excluded.workspace");
    assert.equal((await client.query("SELECT payload FROM arsip_perjalanan WHERE id='a'")).rows[0].payload, "updated");
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); await cleanup(); }
});

test("name collision rolls back earlier renames and retains both existing tables", async () => {
  const cleanup = await setupTestDatabase();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${process.env.DATABASE_SCHEMA}` });
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE records(id text); INSERT INTO records VALUES ('keep'); CREATE TABLE users(id text); CREATE TABLE pengguna(id text)");
    await client.query("BEGIN");
    await assert.rejects(renameLegacyTables(client), /sama-sama ada/);
    await client.query("ROLLBACK");
    assert.deepEqual((await client.query("SELECT * FROM records")).rows, [{ id: "keep" }]);
    assert.equal((await client.query("SELECT to_regclass('arsip_perjalanan') AS name")).rows[0].name, null);
    assert.ok((await client.query("SELECT to_regclass('users') AS name")).rows[0].name);
    assert.ok((await client.query("SELECT to_regclass('pengguna') AS name")).rows[0].name);
  } finally { client.release(); await pool.end(); await cleanup(); }
});

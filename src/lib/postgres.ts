import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";

// One pool per server process; lazy connections keep builds independent of the database.
const globalDb = globalThis as unknown as { archivePool?: Pool; archiveSchema?: Promise<void> };
const schema = process.env.DATABASE_SCHEMA || "public";
if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error("Invalid DATABASE_SCHEMA");
function pool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL PostgreSQL belum dikonfigurasi.");
  return globalDb.archivePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    options: `-c search_path=${schema} -c statement_timeout=30000`,
  });
}
const transactions = new AsyncLocalStorage<PoolClient>();
export const schemaSQL = `
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS records_workspace ON records(workspace);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS employees(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS employees_workspace ON employees(workspace);
CREATE TABLE IF NOT EXISTS honorariums(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS honorariums_workspace ON honorariums(workspace);
CREATE TABLE IF NOT EXISTS attachments(id TEXT NOT NULL,workspace TEXT NOT NULL,content BYTEA NOT NULL,PRIMARY KEY(workspace,id));
`;
async function initializeSchema() {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`arsipesdm:schema:${schema}`]);
    await client.query(schemaSQL);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
async function ready() {
  await (globalDb.archiveSchema ??= initializeSchema().catch(error => {
    globalDb.archiveSchema = undefined;
    throw error;
  }));
}
async function query(sql: string, values: unknown[] = []) {
  await ready();
  return (transactions.getStore() || pool()).query(sql, values);
}
// Existing repository statements use positional question marks, never SQL literals containing '?'.
export const db = {
  prepare(sql: string) {
    let index = 0;
    const text = sql.replace(/\?/g, () => `$${++index}`);
    return {
      async all(...values: unknown[]): Promise<Record<string, unknown>[]> { return (await query(text, values)).rows; },
      async get(...values: unknown[]): Promise<Record<string, unknown> | undefined> { return (await query(text, values)).rows[0]; },
      async run(...values: unknown[]) { return { changes: (await query(text, values)).rowCount }; },
    };
  },
  async exec(sql: string) { await query(sql); },
  async close() {
    await globalDb.archivePool?.end();
    globalDb.archivePool = undefined;
    globalDb.archiveSchema = undefined;
  },
};
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  if (transactions.getStore()) return fn();
  await ready();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    // Preserve SQLite's serialized write semantics for numbering, duplicate checks,
    // and version checks across all application replicas. Reads remain concurrent.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`arsipesdm:writes:${schema}`]);
    const result = await transactions.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

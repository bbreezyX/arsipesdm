import { Pool } from "pg";
import { randomUUID } from "node:crypto";

/** Each database test owns a disposable schema, never the production tables. */
export async function setupTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set TEST_DATABASE_URL to run PostgreSQL integration tests.");
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  process.env.DATABASE_URL = connectionString;
  process.env.DATABASE_SCHEMA = schema;
  return async () => {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  };
}

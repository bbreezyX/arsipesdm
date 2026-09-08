import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL");
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({connectionString: process.env.TEST_DATABASE_URL});
await admin.query(`CREATE SCHEMA ${schema}`);
const moduleUrl = new URL("../src/lib/db.ts", import.meta.url).href;
const run = () => new Promise((resolve, reject) => {
  const script = `const imported=await import(${JSON.stringify(moduleUrl)});const m=imported.default??imported;await m.initializeDatabase();console.log(JSON.stringify({users:Number((await m.db.prepare('SELECT count(*) AS n FROM users').get()).n),records:Number((await m.db.prepare('SELECT count(*) AS n FROM records').get()).n)}));await m.db.close();`;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    env: {...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SCHEMA: schema, DEMO_ENABLED: "true", ADMIN_EMAIL: "test@example.local", ADMIN_PASSWORD: "TestBootstrapPasswordOnly"},
  });
  let output = "", error = "";
  child.stdout.on("data", data => output += data);
  child.stderr.on("data", data => error += data);
  child.on("error", reject);
  child.on("close", code => {
    if (code) reject(new Error(error));
    else { try { resolve(JSON.parse(output)); } catch (e) { reject(e); } }
  });
});
try {
  const results = await Promise.allSettled(Array.from({length: 5}, run));
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    assert.deepEqual(result.value, {users: 1, records: 12});
  }
  console.log("PASS: five concurrent PostgreSQL initializations; exactly one administrator and 12 demo archives.");
} finally {
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}

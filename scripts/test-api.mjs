import { spawn } from "node:child_process";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL");
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({connectionString: process.env.TEST_DATABASE_URL});
await pool.query(`CREATE SCHEMA ${schema}`);
const origin = "http://127.0.0.1:3118";
const env = {...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SCHEMA: schema, DEMO_ENABLED: "true", ADMIN_EMAIL: "test@example.local", ADMIN_PASSWORD: randomUUID(), APP_ORIGIN: origin, TEST_ORIGIN: origin};
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3118"], {env, stdio: ["ignore", "pipe", "pipe"]});
let logs = "";
server.stdout.on("data", chunk => logs += chunk);
server.stderr.on("data", chunk => logs += chunk);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Test server did not become ready: " + logs);
  for (const script of ["scripts/integration.mjs", "scripts/role-access-integration.mjs"]) {
    const test = spawn(process.execPath, [script], {env, stdio: "inherit"});
    const [code] = await once(test, "exit");
    if (code) throw new Error(`${script} failed: ` + logs);
  }
} finally {
  if (server.exitCode === null) { const stopped = once(server, "exit"); server.kill("SIGTERM"); await stopped; }
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}

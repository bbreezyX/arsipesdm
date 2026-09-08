import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const directory = mkdtempSync(path.join(tmpdir(), "rek-init-"));
const moduleUrl = new URL("../src/lib/db.ts", import.meta.url).href;
const run = () =>
  new Promise((resolve, reject) => {
    const script = `const imported=await import(${JSON.stringify(moduleUrl)});const db=imported.db??imported.default.db;console.log(JSON.stringify({users:db.prepare('SELECT count(*) AS n FROM users').get().n,records:db.prepare('SELECT count(*) AS n FROM records').get().n}));db.close();`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: {
          ...process.env,
          DATA_DIR: directory,
          DEMO_ENABLED: "true",
          ADMIN_EMAIL: "test@example.local",
          ADMIN_PASSWORD: "TestBootstrapPasswordOnly",
        },
      },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (error += data));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code) reject(new Error(error));
      else {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(e);
        }
      }
    });
  });
try {
  const results = await Promise.allSettled(Array.from({ length: 5 }, run));
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    assert.deepEqual(result.value, { users: 1, records: 12 });
  }
  console.log(
    "PASS: five concurrent initializations; exactly one administrator and 12 demo archives.",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

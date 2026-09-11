import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "./env";

const valid = { DATABASE_URL: "postgresql://user:pass@localhost:5432/arsip" };

test("konfigurasi minimal yang benar lolos", () => {
  assert.doesNotThrow(() => validateEnv(valid));
  assert.doesNotThrow(() => validateEnv({ ...valid, DEMO_ENABLED: "false", ADMIN_EMAIL: "", APP_ORIGIN: "https://arsip.example" }));
});

test("DATABASE_URL yang hilang atau bukan PostgreSQL ditolak dengan nama variabelnya", () => {
  assert.throws(() => validateEnv({}), /DATABASE_URL/);
  assert.throws(() => validateEnv({ DATABASE_URL: "mysql://localhost/db" }), /DATABASE_URL/);
});

test("semua masalah dilaporkan sekaligus", () => {
  assert.throws(
    () => validateEnv({ DATABASE_URL: "nope", DEMO_ENABLED: "yes", ADMIN_EMAIL: "bukan-email", DATABASE_SCHEMA: "Huruf-Besar" }),
    (error: Error) => ["DATABASE_URL", "DEMO_ENABLED", "ADMIN_EMAIL", "DATABASE_SCHEMA"].every(name => error.message.includes(name)),
  );
});

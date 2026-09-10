import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSession,
  shouldTouch,
  IDLE_LIMIT_MS,
  ABSOLUTE_LIMIT_MS,
  TOUCH_INTERVAL_MS,
} from "./session-policy";

const login = 1_700_000_000_000;
const row = (lastActivity: number | null, expires = login + ABSOLUTE_LIMIT_MS) => ({
  expires,
  last_activity: lastActivity,
});

test("sesi aktif dalam batas idle dan absolut tetap valid", () => {
  const info = evaluateSession(row(login), login + 10 * 60 * 1000);
  assert(info);
  assert.equal(info.idleExpiresAt, login + IDLE_LIMIT_MS);
  assert.equal(info.absoluteExpiresAt, login + ABSOLUTE_LIMIT_MS);
});

test("sesi yang melewati batas idle ditolak walau batas absolut belum lewat", () => {
  assert.equal(evaluateSession(row(login), login + IDLE_LIMIT_MS), null);
  assert.equal(evaluateSession(row(login), login + IDLE_LIMIT_MS + 1), null);
  assert(evaluateSession(row(login), login + IDLE_LIMIT_MS - 1));
});

test("aktivitas memperpanjang idle tetapi tidak menggeser batas absolut", () => {
  const late = login + ABSOLUTE_LIMIT_MS - 5 * 60 * 1000;
  const info = evaluateSession(row(late), late + 1000);
  assert(info);
  assert.equal(info.idleExpiresAt, login + ABSOLUTE_LIMIT_MS, "idle dibatasi oleh absolut");
  assert.equal(evaluateSession(row(late), login + ABSOLUTE_LIMIT_MS), null);
});

test("nilai BIGINT dari PostgreSQL yang datang sebagai string tetap terbaca", () => {
  const info = evaluateSession(
    { expires: String(login + ABSOLUTE_LIMIT_MS), last_activity: String(login) },
    login + 1,
  );
  assert(info);
  assert.equal(info.idleExpiresAt, login + IDLE_LIMIT_MS);
});

test("sesi lama tanpa last_activity dianggap habis (migrasi)", () => {
  assert.equal(evaluateSession(row(null), login + 1), null);
});

test("penulisan last_activity dibatasi frekuensinya", () => {
  assert.equal(shouldTouch(row(login), login + TOUCH_INTERVAL_MS - 1), false);
  assert.equal(shouldTouch(row(login), login + TOUCH_INTERVAL_MS), true);
});

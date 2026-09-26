import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveRecordFromPath, archiveRecordPath, sectionFromPath } from "./workspace-navigation";

test("archiveRecordPath turns a rekap code into one readable path segment", () => {
  assert.equal(archiveRecordPath("PD/2026/0062"), "/arsip-perjalanan/PD-2026-0062");
});

test("archiveRecordFromPath reads the code back only under Arsip perjalanan", () => {
  assert.equal(archiveRecordFromPath("/arsip-perjalanan/PD-2026-0062"), "PD/2026/0062");
  assert.equal(archiveRecordFromPath(archiveRecordPath("PD/2026/0062")), "PD/2026/0062");
  assert.equal(archiveRecordFromPath("/arsip-perjalanan"), undefined);
  assert.equal(archiveRecordFromPath("/arsip-perjalanan/"), undefined);
  assert.equal(archiveRecordFromPath("/arsip-perjalanan/PD-2026-0062/lain"), undefined);
  assert.equal(archiveRecordFromPath("/surat-tugas/PD-2026-0062"), undefined);
});

test("a rekap path is not mistaken for the list itself", () => {
  assert.equal(sectionFromPath("/arsip-perjalanan/PD-2026-0062"), undefined);
  assert.equal(sectionFromPath("/arsip-perjalanan"), "archives");
});

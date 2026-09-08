import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { honorariumCategories, honorariumSchema, honorariumTotals, newHonorarium } from "./honorarium";

function sample() {
  return {...newHonorarium(), year: 2025, skNumber: "SK-UJI-001", skName: "Pengelola keuangan", recipient: "Penerima Uji", skPosition: "KPA", budget: 11793495075,
    monthlyAmount: 3010000, months: 6, taxMode: "percent" as const, taxRate: 15};
}
test("calculation matches the reference workbook and preserves manual and zero tax", () => {
  assert.deepEqual(honorariumTotals(sample()), {gross: 18060000, tax: 2709000, net: 15351000});
  assert.deepEqual(honorariumTotals({...sample(), taxMode: "amount", taxAmount: 100000}), {gross: 18060000, tax: 100000, net: 17960000});
  assert.equal(honorariumTotals({...sample(), taxMode: "amount", taxAmount: 0}).net, 18060000);
  assert.deepEqual(honorariumTotals({...sample(), monthlyAmount: 810000, months: 3}), {gross: 2430000, tax: 364500, net: 2065500});
  assert.equal(honorariumTotals({...sample(), monthlyAmount: 101, months: 1, taxRate: 5}).tax, 5);
});
test("category-specific fields and invalid financial inputs are validated", () => {
  for (const category of Object.keys(honorariumCategories)) assert.equal(honorariumSchema.safeParse({...sample(), category}).success, true);
  for (const patch of [{recipient: " "}, {skName: ""}, {skNumber: ""}, {budget: null}, {monthlyAmount: -1}, {monthlyAmount: Infinity}, {months: 0}, {months: 13}, {months: 1.5}, {year: 2025.5}, {taxRate: 101}, {taxAmount: 18060001, taxMode: "amount"}])
    assert.equal(honorariumSchema.safeParse({...sample(), ...patch}).success, false, JSON.stringify(patch));
  assert.equal(honorariumSchema.safeParse({...sample(), category: "procurement", skNumber: "", budget: null}).success, true);
  assert.equal(honorariumSchema.safeParse({...sample(), category: "bmd_non_revenue", budget: null, year: 2024}).success, true);
});
test("CRUD persists records with workspace isolation, conflict detection, deletion and restoration", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "honorarium-test-"));
  process.env.DATA_DIR = directory;
  const {createHonorarium, getHonorariums, getHonorarium, changeHonorarium} = await import("./honorarium-db");
  const {db} = await import("./db");
  try {
    const created = createHonorarium("test-office", sample());
    assert.equal(getHonorariums("test-office").length, 1);
    assert.equal(getHonorariums("other-office").length, 0);
    assert.throws(() => getHonorarium("other-office", created.id), /tidak ditemukan/);
    assert.throws(() => changeHonorarium("other-office", created.id, 1, "delete"), /tidak ditemukan/);
    const edited = changeHonorarium("test-office", created.id, 1, "edit", {...sample(), months: 3});
    assert.equal(edited.months, 3);
    assert.equal(edited.version, 2);
    assert.throws(() => changeHonorarium("test-office", created.id, 1, "edit", sample()), /sudah diperbarui/);
    assert.equal(getHonorarium("test-office", created.id).months, 3);
    const deleted = changeHonorarium("test-office", created.id, 2, "delete");
    assert.ok(deleted.deletedAt);
    assert.throws(() => changeHonorarium("test-office", created.id, 3, "edit", sample()), /Pulihkan/);
    const restored = changeHonorarium("test-office", created.id, 3, "restore");
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.months, 3);
    assert.equal(restored.version, 4);
    assert.throws(() => changeHonorarium("test-office", created.id, 4, "edit", {...sample(), taxRate: 101}));
    assert.equal(getHonorarium("test-office", created.id).version, 4);
  } finally {db.close(); rmSync(directory, {recursive: true, force: true});}
});

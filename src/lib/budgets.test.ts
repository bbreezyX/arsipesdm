import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetListSchema, uniqueBudgets } from "./budgets";

test("budget packages need a program, trim text and fill missing parts", () => {
  assert.deepEqual(budgetListSchema.parse([{ program: "  Program A ", activityName: " Kegiatan " }]),
    [{ program: "Program A", activityName: "Kegiatan", subActivity: "" }]);
  assert.equal(budgetListSchema.safeParse([{ program: "  ", activityName: "Kegiatan" }]).success, false);
});

test("duplicate packages differing only in case or spacing are stored once, first one kept", () => {
  const first = { program: "Program A", activityName: "Kegiatan 1", subActivity: "Sub 1" };
  const other = { program: "Program A", activityName: "Kegiatan 2", subActivity: "" };
  assert.deepEqual(uniqueBudgets([first, other, { program: "program  a", activityName: "KEGIATAN 1", subActivity: "sub 1" }]), [first, other]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDecimalInput, parseDecimalInput } from "./decimal-input";
import { groundTransportSchema } from "./lampiran6-schema";

test("fuel liters accept comma and dot decimals without losing in-progress fractions", () => {
  for (const input of ["38,98", "38.98", " 38,98 "]) {
    assert.equal(parseDecimalInput(input), 38.98);
    const fuelLiters = parseDecimalInput(input)!;
    const transport = groundTransportSchema.parse({ fuelLiters, fuelPricePerLiter: 20150, total: Math.round(fuelLiters * 20150) });
    assert.equal(transport.total, 785447);
    assert.equal(JSON.parse(JSON.stringify(transport)).fuelLiters, 38.98);
  }
  for (const [text, expected] of [["38,", 38], ["38.", 38], ["0,05", 0.05], [",5", 0.5], [".5", 0.5], ["0", 0], ["", null], [",", null]] as const) {
    assert.equal(parseDecimalInput(text), expected);
  }
  for (const text of ["-1", "1,2,3", "1.2.3", "38,98x", "1e3", "NaN", "1.234,56"]) assert.equal(parseDecimalInput(text), undefined);
  assert.equal(formatDecimalInput(38.98), "38,98");
  assert.equal(formatDecimalInput(0), "0");
  assert.equal(formatDecimalInput(null), "");
  assert.equal(groundTransportSchema.safeParse({ fuelLiters: parseDecimalInput("1000000,1") }).success, false);
});

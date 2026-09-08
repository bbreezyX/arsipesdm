import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDailyAllowance } from "./daily-allowance";
import { lampiran6Schema, lampiranCosts } from "./lampiran6-schema";

const base = () => lampiran6Schema.parse({origin: "Kota Jambi", dailyRateMode: "auto", claimedDays: 3});

test("inter-regency destinations calculate daily totals and cost ledger", () => {
  const data = applyDailyAllowance(base(), ["Kabupaten Muaro Jambi", "Kabupaten Kerinci"]);
  assert.equal(data.dailyRate, 370_000);
  assert.equal(data.dailyTotal, 1_110_000);
  assert.equal(lampiranCosts(data, "person")[0].amount, 1_110_000);
  assert.equal(applyDailyAllowance({...data, claimedDays: 2}, ["Kab. Batang Hari"]).dailyTotal, 740_000);
});

test("same-city travel requires explicit duration category", () => {
  assert.equal(applyDailyAllowance(base(), ["Kota Jambi"]).dailyRate, null);
  assert.equal(applyDailyAllowance({...base(), dailyRateMode: "dalam-kota"}, ["Kota Jambi"]).dailyTotal, 450_000);
  assert.equal(applyDailyAllowance({...base(), dailyRateMode: "dalam-kota"}, ["Kabupaten Bungo"]).dailyRate, null);
  assert.equal(applyDailyAllowance({...base(), dailyRateMode: "diklat"}, ["Kota Jambi"]).dailyTotal, 330_000);
});

test("unknown, empty and mixed destinations clear previous automatic amounts", () => {
  const data = applyDailyAllowance(base(), ["Kabupaten Bungo"]);
  for (const destinations of [[], [""], ["Jambi"], ["Jakarta"], ["Kota Jambi", "Kabupaten Bungo"], ["Kabupaten Bungo", ""]]) {
    const result = applyDailyAllowance(data, destinations);
    assert.equal(result.dailyRate, null);
    assert.equal(result.dailyTotal, null);
    assert.equal(lampiranCosts(result, "person").length, 0);
  }
  assert.equal(applyDailyAllowance({...data, origin: ""}, ["Kabupaten Bungo"]).dailyRate, null);
  assert.equal(applyDailyAllowance({...data, claimedDays: null}, ["Kabupaten Bungo"]).dailyTotal, null);
  assert.equal(applyDailyAllowance({...data, claimedDays: 0}, ["Kabupaten Bungo"]).dailyTotal, 0);
});

test("legacy archives default to manual and keep source amounts", () => {
  const old = lampiran6Schema.parse({dailyRate: 200_000, dailyTotal: 550_000});
  assert.equal(old.dailyRateMode, "manual");
  assert.deepEqual(applyDailyAllowance(old, ["Kabupaten Bungo"]), old);
  const automatic = applyDailyAllowance(base(), ["Kabupaten Bungo"]);
  assert.equal(lampiran6Schema.parse(JSON.parse(JSON.stringify(automatic))).dailyRateMode, "auto");
});

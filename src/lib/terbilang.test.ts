import assert from "node:assert/strict";
import test from "node:test";
import { terbilang } from "./terbilang";

test("terbilang spells rupiah amounts the way receipts do", () => {
  assert.equal(terbilang(0), "Nol rupiah");
  assert.equal(terbilang(11), "Sebelas rupiah");
  assert.equal(terbilang(17), "Tujuh belas rupiah");
  assert.equal(terbilang(100), "Seratus rupiah");
  assert.equal(terbilang(1500), "Seribu lima ratus rupiah");
  assert.equal(terbilang(2_186_000), "Dua juta seratus delapan puluh enam ribu rupiah");
  assert.equal(terbilang(119_190_748), "Seratus sembilan belas juta seratus sembilan puluh ribu tujuh ratus empat puluh delapan rupiah");
  assert.equal(terbilang(1_000_000_000), "Satu miliar rupiah");
  assert.equal(terbilang(2_500_000_000_000), "Dua triliun lima ratus miliar rupiah");
  assert.equal(terbilang(-250), "Minus dua ratus lima puluh rupiah");
});

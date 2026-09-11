import { test } from "node:test";
import assert from "node:assert/strict";
import { fundTrackHint, inferFundTrack, parseFundTrack, resolveFundTrack } from "./fund-track";

test("parseFundTrack accepts BKU labels and common aliases", () => {
  assert.equal(parseFundTrack(""), "");
  assert.equal(parseFundTrack("  gu 1 "), "GU 1");
  assert.equal(parseFundTrack("GU1"), "GU 1");
  assert.equal(parseFundTrack("uang persediaan"), "UP");
  assert.equal(parseFundTrack("LS"), "LS");
  assert.equal(parseFundTrack("bukan-track"), "");
});

test("inferFundTrack uses known 2026 ST numbers before the date heuristic", () => {
  assert.equal(inferFundTrack({ sptNo: "B-800.1.11.1-30/DESDM/II/2026", startDate: "2026-07-01" }), "UP");
  assert.equal(inferFundTrack({ sptNo: "B-000.1.2.3-144/DESDM/V/2026", startDate: "2026-05-12" }), "GU 1");
  assert.equal(inferFundTrack({ sptNo: "B-000.1.2.3/370/DESDM/VI/2026", startDate: "2026-06-25" }), "GU 1");
  assert.equal(inferFundTrack({ sptNo: "B-000.1.2.3-225/DESDM/VII/2026", startDate: "2026-07-10" }), "GU 2");
  assert.equal(inferFundTrack({ sptNo: "ST-baru", startDate: "2026-03-31" }), "UP");
  assert.equal(inferFundTrack({ sptNo: "ST-baru", startDate: "2026-06-30" }), "GU 1");
  assert.equal(inferFundTrack({ sptNo: "ST-baru", startDate: "2026-07-01" }), "GU 2");
  assert.equal(inferFundTrack({ sptNo: "ST-baru", startDate: "2025-02-01" }), "");
});

test("stored fundTrack wins over inferred ST or date", () => {
  assert.equal(resolveFundTrack({
    fundTrack: "TU",
    sptNo: "B-800.1.11.1-30/DESDM/II/2026",
    startDate: "2026-02-10",
  }), "TU");
  assert.equal(resolveFundTrack({
    fundTrack: "",
    sptNo: "B-000.1.2.3-176/DESDM/VI/2026",
    startDate: "2026-06-01",
  }), "GU 2");
  assert.match(fundTrackHint({ fundTrack: "", sptNo: "ST-baru", startDate: "2026-07-01" }), /tanggal perjalanan/);
  assert.match(fundTrackHint({ fundTrack: "", sptNo: "B-800.1.11.1-30/DESDM/II/2026", startDate: "2026-07-01" }), /nomor ST/);
});

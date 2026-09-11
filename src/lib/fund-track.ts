/** Cash-book tracks used on the SPD recap Keterangan column (BS). */
export const fundTracks = ["UP", "GU 1", "GU 2", "GU 3", "TU", "LS"] as const;
export type FundTrack = (typeof fundTracks)[number];

export const fundTrackLabels: Record<FundTrack, string> = {
  UP: "Uang Persediaan",
  "GU 1": "Ganti Uang 1",
  "GU 2": "Ganti Uang 2",
  "GU 3": "Ganti Uang 3",
  TU: "Tambah Uang",
  LS: "Pembayaran langsung",
};

const letterKey = (value: string) => value.toLocaleLowerCase("id-ID").replace(/[\s.-]/g, "");

/** Known 2026 Energi ST numbers from the office BKU (UP / GU 1 / GU 2). */
const letterTracks: Record<string, FundTrack> = Object.fromEntries(
  (
    [
      ["B-800.1.11.1-30/DESDM/II/2026", "UP"],
      ["B-800.1.11.1-29/DESDM/II/2026", "UP"],
      ["B-800.1.11.1-41/DESDM/II/2026", "UP"],
      ["B-800.1.11.1-47/DESDM/II/2026", "UP"],
      ["B.800.1.11.1-40/DESDM/II/2026", "UP"],
      ["B-800.1.11.1-42/DESDM/II/2026", "UP"],
      ["B-800.1.11.1-72/DESDM/III/2026", "UP"],
      ["B-000.1.2.3-22/DESDM/II/2026", "GU 1"],
      ["B-800.1.11.1-66/DESDM/III/2026", "GU 1"],
      ["B-000.1.2.3-120/DESDM/IV/2026", "GU 1"],
      ["B-000.1.2.3-134/DESDM/V/2026", "GU 1"],
      ["B-000.1.2.3-144/DESDM/V/2026", "GU 1"],
      ["B-000.1.2.3-145/DESDM/V/2026", "GU 1"],
      ["B-000.1.2.3-146/DESDM/V/2026", "GU 1"],
      ["B-000.1.2.3/268/DESDM/V/2026", "GU 1"],
      ["B-000.1.2.3-177/DESDM/VI/2026", "GU 1"],
      ["B-000.1.2.3-187/DESDM/VI/2026", "GU 1"],
      ["B-000.1.2.3-188/DESDM/VI/2026", "GU 1"],
      ["B-000.1.2.3/370/DESDM/VI/2026", "GU 1"],
      ["B-000.1.2.3-204/DESDM/VI/2026", "GU 1"],
      ["B-000.1.2.3-176/DESDM/VI/2026", "GU 2"],
      ["B-000.1.2.3-225/DESDM/VII/2026", "GU 2"],
      ["B-000.1.2.3-232/DESDM/VII/2026", "GU 2"],
      ["B-000.1.2.3-233/DESDM/VII/2026", "GU 2"],
      ["B-000.1.2.3-273/DESDM/VII/2026", "GU 2"],
      ["B-800.1.2.3-274/DESDM/VII/2026", "GU 2"],
      ["B-000.1.2.3-275/DESDM/VII/2026", "GU 2"],
    ] as const
  ).map(([spt, track]) => [letterKey(spt), track]),
);

export function parseFundTrack(raw: unknown): FundTrack | "" {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");
  if (!value) return "";
  const compact = value.replace(/[\s.-]/g, "");
  const aliases: Record<string, FundTrack> = {
    UP: "UP",
    UANGPERSEDIAAN: "UP",
    GU1: "GU 1",
    GANTI1: "GU 1",
    GANTIANG1: "GU 1",
    GU2: "GU 2",
    GANTI2: "GU 2",
    GANTIANG2: "GU 2",
    GU3: "GU 3",
    GANTI3: "GU 3",
    GANTIANG3: "GU 3",
    TU: "TU",
    TAMBAHUANG: "TU",
    LS: "LS",
    LANGSUNG: "LS",
    PEMBAYARANLANGSUNG: "LS",
  };
  return aliases[compact] ?? (fundTracks.includes(value as FundTrack) ? (value as FundTrack) : "");
}

function trackFromLetter(sptNo: string): FundTrack | "" {
  return letterTracks[letterKey(sptNo)] ?? "";
}

export function inferFundTrack(trip: { sptNo: string; startDate: string }): FundTrack | "" {
  const fromLetter = trackFromLetter(trip.sptNo);
  if (fromLetter) return fromLetter;
  const day = trip.startDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !day.startsWith("2026")) return "";
  if (day <= "2026-03-31") return "UP";
  if (day <= "2026-06-30") return "GU 1";
  return "GU 2";
}

/** Stored value wins; otherwise infer from ST or 2026 travel dates. */
export function resolveFundTrack(trip: { fundTrack?: string; sptNo: string; startDate: string }): FundTrack | "" {
  return parseFundTrack(trip.fundTrack) || inferFundTrack(trip);
}

export function fundTrackHint(trip: { fundTrack?: string; sptNo: string; startDate: string }) {
  const stored = parseFundTrack(trip.fundTrack);
  if (stored) return `${stored} · ${fundTrackLabels[stored]} (tersimpan).`;
  const fromLetter = trackFromLetter(trip.sptNo);
  if (fromLetter) return `${fromLetter} · ${fundTrackLabels[fromLetter]} (dari nomor ST).`;
  const inferred = inferFundTrack(trip);
  if (!inferred) return "Isi sesuai BKU: UP, GU 1, GU 2, atau pembayaran lain.";
  return `${inferred} · ${fundTrackLabels[inferred]} (dari tanggal perjalanan).`;
}

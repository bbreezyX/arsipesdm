import { provinceAllowances } from "./travel-provinces";
import type { Lampiran6 } from "./lampiran6-schema";

// Perpres 72/2025, Lampiran I, Tabel 1.2 (Jambi).
// https://peraturan.bpk.go.id/Details/321610/perpres-no-72-tahun-2025
// Regional reference only; institutional/archive rates remain available in manual mode.
const regions = [
  ["kota jambi"], ["kota sungai penuh", "sungai penuh"],
  ["batanghari", "batang hari"], ["bungo"], ["kerinci"], ["merangin"],
  ["muaro jambi"], ["sarolangun"], ["tanjung jabung barat"],
  ["tanjung jabung timur"], ["tebo"],
];

function region(value: string) {
  const normalized = value.trim().toLocaleLowerCase("id-ID")
    .replace(/^kab(?:upaten|\.)?\s+/, "").replace(/\s+/g, " ");
  // Exact aliases only: an institution/address or ambiguous "Jambi" must not be guessed.
  return regions.findIndex(aliases => aliases.includes(normalized));
}

export function automaticDailyAllowance(data: Pick<Lampiran6, "origin" | "dailyRateMode"> & Partial<Pick<Lampiran6, "format" | "destinationProvince">>, destinations: string[]): {rate: number | null; reason: string} {
  const pending = (reason: string) => ({ rate: null, reason });
  if (data.dailyRateMode === "manual") return pending("Tarif mengikuti arsip.");
  if (!destinations.length || destinations.some(value => !value.trim())) {
    return pending("Lengkapi tujuan untuk menghitung uang harian.");
  }
  if (data.format === "luar-provinsi") {
    if (data.destinationProvince === "Beberapa provinsi") return pending("Tujuan melintasi beberapa provinsi. Gunakan mode manual sesuai tarif dan pembagian hari tiap provinsi.");
    const province = provinceAllowances.find(([name]) => name === data.destinationProvince && name !== "Jambi");
    if (!province) return pending("Pilih provinsi tujuan di luar Jambi untuk menghitung uang harian.");
    if (data.dailyRateMode === "dalam-kota" || data.dailyRateMode === "dalam-kota-singkat") return pending("Perjalanan keluar provinsi menggunakan kategori luar kota. Pilih otomatis, diklat, atau manual.");
    return { rate: province[data.dailyRateMode === "diklat" ? 2 : 1], reason: `Tarif ${province[0]}${data.dailyRateMode === "diklat" ? " untuk diklat" : " untuk perjalanan luar kota"}.` };
  }
  const targets = destinations.map(region);
  if (targets.some(value => value < 0)) {
    return pending("Pilih kabupaten/kota Jambi dari daftar. Untuk tujuan di luar Jambi, pilih cakupan Luar Provinsi Jambi.");
  }
  if (data.dailyRateMode === "diklat") return { rate: 110_000, reason: "" };
  const origin = region(data.origin);
  if (origin < 0) return pending("Pilih kabupaten/kota asal dari daftar untuk membedakan perjalanan dalam dan luar kota.");
  if (data.dailyRateMode === "dalam-kota" || data.dailyRateMode === "dalam-kota-singkat") {
    return targets.every(value => value === origin)
      ? data.dailyRateMode === "dalam-kota-singkat"
        ? { rate: 0, reason: "Uang harian nihil untuk perjalanan dalam kota sampai 8 jam. Biaya transportasi dicatat terpisah sesuai bukti dan ketentuan daerah." }
        : { rate: 150_000, reason: "" }
      : pending("Tujuan berbeda kabupaten/kota dari asal. Pilih perhitungan otomatis untuk perjalanan luar kota.");
  }
  if (targets.every(value => value !== origin)) return { rate: 370_000, reason: "" };
  if (targets.every(value => value === origin)) {
    return pending("Asal dan tujuan berada dalam kabupaten/kota yang sama. Pilih kategori sampai 8 jam atau lebih dari 8 jam; jumlah hari kalender tidak menentukan durasi tersebut.");
  }
  return pending("Tujuan mencakup dalam dan luar kota. Gunakan mode manual sesuai pembagian hari pada rekap.");
}

export function applyDailyAllowance(data: Lampiran6, destinations: string[]): Lampiran6 {
  if (data.dailyRateMode === "manual") return data;
  const { rate } = automaticDailyAllowance(data, destinations);
  return {
    ...data,
    dailyRate: rate,
    dailyTotal: rate !== null && data.claimedDays !== null ? rate * data.claimedDays : null,
  };
}

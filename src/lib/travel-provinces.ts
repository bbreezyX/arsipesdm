// Perpres 72/2025, Lampiran I, Tabel 1.2. Rupiah per orang per hari.
// https://peraturan.bpk.go.id/Details/321610/perpres-no-72-tahun-2025
export const provinceAllowances = [
  ["Aceh", 360000, 110000], ["Sumatera Utara", 370000, 110000],
  ["Riau", 370000, 110000], ["Kepulauan Riau", 370000, 110000],
  ["Jambi", 370000, 110000], ["Sumatera Barat", 380000, 110000],
  ["Sumatera Selatan", 380000, 110000], ["Lampung", 380000, 110000],
  ["Bengkulu", 380000, 110000], ["Bangka Belitung", 410000, 120000],
  ["Banten", 370000, 110000], ["Jawa Barat", 430000, 130000],
  ["DKI Jakarta", 530000, 160000], ["Jawa Tengah", 370000, 110000],
  ["DI Yogyakarta", 420000, 130000], ["Jawa Timur", 410000, 120000],
  ["Bali", 480000, 140000], ["Nusa Tenggara Barat", 440000, 130000],
  ["Nusa Tenggara Timur", 430000, 130000], ["Kalimantan Barat", 380000, 110000],
  ["Kalimantan Tengah", 360000, 110000], ["Kalimantan Selatan", 380000, 110000],
  ["Kalimantan Timur", 430000, 130000], ["Kalimantan Utara", 430000, 130000],
  ["Sulawesi Utara", 370000, 110000], ["Gorontalo", 370000, 110000],
  ["Sulawesi Barat", 410000, 120000], ["Sulawesi Selatan", 430000, 130000],
  ["Sulawesi Tengah", 370000, 110000], ["Sulawesi Tenggara", 380000, 110000],
  ["Maluku", 380000, 110000], ["Maluku Utara", 430000, 130000],
  ["Papua", 580000, 170000], ["Papua Barat", 480000, 140000],
  ["Papua Barat Daya", 480000, 140000], ["Papua Tengah", 580000, 170000],
  ["Papua Selatan", 580000, 170000], ["Papua Pegunungan", 580000, 170000],
] as const;
export const destinationProvinces = ["", "Beberapa provinsi", ...provinceAllowances.map(([name]) => name)] as const;

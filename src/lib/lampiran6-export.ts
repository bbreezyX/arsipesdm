import type { Trip } from "./model";
import type {
  Lampiran6,
  Lodging,
  GroundTransport,
  Flight,
} from "./lampiran6-schema";
type SheetJS = typeof import("xlsx");
const empty = () => Array.from({ length: 67 }, () => null as unknown);
const date = (v: string) => (v ? new Date(`${v}T00:00:00`) : null);
const filled = (value: object) =>
  Object.values(value).some((v) => v !== null && v !== "");
function placeHotel(row: unknown[], hotel: Lodging) {
  row.splice(
    28,
    10,
    hotel.name,
    hotel.room,
    hotel.reference,
    date(hotel.checkIn),
    date(hotel.checkOut),
    hotel.days,
    hotel.application,
    hotel.orderId,
    hotel.dailyRate,
    hotel.total,
  );
}
function placeGround(row: unknown[], transport: GroundTransport) {
  row.splice(38, 3, transport.mode, transport.provider, transport.total);
  // Append vehicle/BBM details without shifting the original source columns.
  row[60] = transport.vehicleType ?? "";
  row[61] = transport.fuelType ?? "";
  row[62] = transport.fuelPricePerLiter ?? null;
  row[64] = transport.fuelLiters ?? null;
}
function placeFlight(row: unknown[], flight: Flight, offset: number) {
  row.splice(
    offset,
    9,
    flight.application,
    flight.orderId,
    date(flight.date),
    flight.airline,
    flight.origin,
    flight.destination,
    flight.bookingCode,
    flight.ticketNo,
    flight.price,
  );
}

// Width per column follows its content: numbers and dates narrow, names and descriptions wide.
// Avoid exactly 9: ExcelJS treats that as the default width and drops it.
const columnWidths: Record<string, number> = {
  A: 5, B: 30, C: 20, D: 30, E: 6, F: 22, G: 22, H: 11, I: 11, J: 11, K: 7,
  L: 45, M: 34, N: 34, O: 34, P: 12, Q: 28,
  R: 12, S: 13, T: 12, U: 13, V: 13, W: 13, X: 13, Y: 13, Z: 14, AA: 14, AB: 30,
  AC: 24, AD: 8, AE: 12, AF: 11, AG: 11, AH: 7, AI: 14, AJ: 16, AK: 12, AL: 13,
  AM: 16, AN: 20, AO: 13,
  AP: 14, AQ: 16, AR: 11, AS: 14, AT: 14, AU: 14, AV: 12, AW: 16, AX: 13,
  AY: 14, AZ: 16, BA: 11, BB: 14, BC: 14, BD: 14, BE: 12, BF: 16, BG: 13,
  BH: 22, BI: 16, BJ: 10, BK: 12, BL: 26, BM: 8, BN: 18, BO: 16,
};

/** Source-shaped export. Evidence amounts stay evidence, never another expense. */
export function createLampiran6Sheet(trips: Trip[], XLSX: SheetJS, scope?: Lampiran6["format"]) {
  const selected = trips.filter((t) => t.lampiran6 && (!scope || t.lampiran6.format === scope));
  const outside = scope === "luar-provinsi" || selected.every(t => t.lampiran6?.format === "luar-provinsi");
  const units = [...new Set(selected.map((t) => t.department))];
  const rows: unknown[][] = [
    [outside ? "REKAPITULASI BELANJA PERJALANAN DINAS LUAR PROVINSI JAMBI" : "REKAPITULASI BELANJA PERJALANAN DINAS LUAR DAERAH DALAM PROVINSI JAMBI"],
    ["RAPAT RAPAT KOORDINASI DAN KONSULTASI SKPD"],
    [
      `SKPD : Dinas ESDM${units.length === 1 ? ` ( ${units[0]} )` : " — bidang tercantum per baris"}`,
    ],
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
  ];
  const top: Record<string, string> = {
    A: "No",
    B: "Nama yang Melakukan Perjadin",
    C: "NIP",
    D: "Jabatan",
    E: "Gol",
    F: "No ST",
    G: "SPPD",
    I: "Tanggal Berangkat",
    J: "Tanggal Kembali",
    K: "Jumlah Hari",
    L: "Nama Kegiatan",
    M: "Nama Program",
    N: "Nama Kegiatan",
    O: "Nama Sub Kegiatan",
    P: "Asal",
    Q: "Tujuan (Instansi Tujuan)",
    R: "Biaya Perjalanan Dinas",
    Z: "Total Rincian (Rp)",
    AA: "Total Kuitansi (Rp)",
    AB: "Keterangan",
    AC: "Data Penginapan",
    AM: "Data Transport Darat",
    AP: "Data Transport Udara",
    BH: "Bidang / unit kerja",
    BI: "Jenis mobil",
    BJ: "Jenis BBM",
    BK: "Harga BBM per liter (Rp)",
    BM: "Jumlah liter BBM",
    BN: "Cakupan perjalanan",
    BO: "Provinsi tujuan",
    BL: "Rincian tujuan (satu per baris)",
  };
  const middle: Record<string, string> = {
    G: "Nomor",
    H: "Tanggal SPPD",
    R: "Uang Harian",
    T: "Biaya Representasi",
    V: "Biaya Penginapan (Rp)",
    W: "Transport Darat (Rp)",
    X: "Transport Air (Rp)",
    Y: "Transport Udara (Rp)",
    AC: "Nama Hotel",
    AD: "No. Kamar",
    AE: "Ref. No",
    AF: "Tgl Cek In",
    AG: "Tgl Cek Out",
    AH: "Jumlah hari",
    AI: "Pemesanan",
    AK: "Biaya Penginapan",
    AM: "Jenis Transport",
    AN: "Penyedia / Plat Kendaraan",
    AO: "Total Biaya Transport (Rp)",
    AP: "Pemesanan Pergi",
    AR: "Pesawat (Berangkat/Pergi)",
    AY: "Pemesanan Pulang",
    BA: "Pesawat (Kembali/Pulang)",
  };
  const bottom: Record<string, string> = {
    R: "Per hari (Rp)",
    S: "Total (Rp)",
    T: "Per hari (Rp)",
    U: "Total (Rp)",
    AI: "Nama Aplikasi",
    AJ: "Order ID / PO Number",
    AK: "Per hari (Rp)",
    AL: "Total (Rp)",
    AP: "Nama Aplikasi",
    AQ: "Order ID / PO Number",
    AR: "Tanggal Penerbangan",
    AS: "Maskapai",
    AT: "Kota Asal",
    AU: "Kota Tujuan",
    AV: "Kode Booking",
    AW: "Nomor Tiket",
    AX: "Harga",
    AY: "Nama Aplikasi",
    AZ: "Order ID / PO Number",
    BA: "Tanggal Penerbangan",
    BB: "Maskapai",
    BC: "Kota Asal",
    BD: "Kota Tujuan",
    BE: "Kode Booking",
    BF: "Nomor Tiket",
    BG: "Harga",
  };
  for (const [offset, labels] of [
    [3, top],
    [4, middle],
    [5, bottom],
  ] as const)
    for (const [col, label] of Object.entries(labels))
      rows[offset][XLSX.utils.decode_col(col)] = label;
  for (const [index, trip] of selected.entries()) {
    const d = trip.lampiran6 as Lampiran6,
      p = trip.participants[0];
    const row = empty();
    row.splice(
      0,
      28,
      d.sourceNo || String(index + 1),
      p.name,
      p.nip,
      p.position,
      d.rank,
      trip.sptNo,
      trip.sppdNo,
      date(d.sppdDate),
      date(trip.startDate),
      date(trip.endDate),
      d.claimedDays,
      trip.title,
      d.program,
      d.activityName,
      d.subActivity,
      d.origin,
      trip.destination,
      d.dailyRate,
      d.dailyTotal,
      d.representationRate,
      d.representationTotal,
      d.lodgingCost,
      d.landCost,
      d.waterCost,
      d.airCost,
      d.recordedTotal,
      d.receiptTotal,
      trip.notes,
    );
    const hotels = d.lodgings.filter(filled),
      ground = d.groundTransports.filter(filled);
    if (hotels[0]) placeHotel(row, hotels[0]);
    if (ground[0]) placeGround(row, ground[0]);
    placeFlight(row, d.outbound, 41);
    placeFlight(row, d.inbound, 50);
    row[59] = trip.department;
    row[65] = d.format;
    row[66] = d.format === "luar-provinsi" ? d.destinationProvince : "Jambi";
    row[63] = trip.destinations?.join("\n") ?? "";
    rows.push(row);
    for (const cost of d.additionalCosts) {
      const extra = empty();
      const col =
        cost.category === "Penginapan"
          ? "V"
          : cost.category === "Uang harian"
            ? "S"
            : cost.category === "Representasi"
              ? "U"
              : /udara/i.test(cost.label)
                ? "Y"
                : /transport air\b/i.test(cost.label)
                  ? "X"
                  : "W";
      extra[XLSX.utils.decode_col(col)] = cost.amount;
      extra[27] = cost.label;
      rows.push(extra);
    }
    for (const hotel of hotels.slice(1)) {
      const extra = empty();
      placeHotel(extra, hotel);
      rows.push(extra);
    }
    for (const transport of ground.slice(1)) {
      const extra = empty();
      placeGround(extra, transport);
      rows.push(extra);
    }
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  // The letterhead spans the identity block only, so it stays visible on screen and prints on page 1.
  sheet["!merges"] = [
    "A1:K1",
    "A2:K2",
    "A3:K3",
    ...[
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "Z",
      "AA",
      "AB",
      "BH",
      "BI",
      "BJ",
      "BK",
      "BL",
      "BM",
      "BN",
      "BO",
    ].map((col) => `${col}4:${col}6`),
    "G4:H4",
    "G5:G6",
    "H5:H6",
    "R4:Y4",
    "R5:S5",
    "T5:U5",
    ...[
      "V",
      "W",
      "X",
      "Y",
      "AC",
      "AD",
      "AE",
      "AF",
      "AG",
      "AH",
      "AM",
      "AN",
      "AO",
    ].map((col) => `${col}5:${col}6`),
    "AC4:AL4",
    "AI5:AJ5",
    "AK5:AL5",
    "AM4:AO4",
    "AP4:BG4",
    "AP5:AQ5",
    "AR5:AX5",
    "AY5:AZ5",
    "BA5:BG5",
  ].map((range) => XLSX.utils.decode_range(range));
  sheet["!cols"] = Array.from({ length: 67 }, (_, col) => ({
    wch: columnWidths[XLSX.utils.encode_col(col)] ?? 14,
  }));
  for (let row = 9; row <= rows.length; row++) {
    for (const col of ["H", "I", "J", "AF", "AG", "AR", "BA"]) {
      const cell = sheet[`${col}${row}`];
      if (cell?.t === "d") cell.z = "dd/mm/yyyy";
    }
    for (const col of [
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "AA",
      "AK",
      "AL",
      "AO",
      "AX",
      "BG",
      "BK",
    ]) {
      const cell = sheet[`${col}${row}`];
      if (cell?.t === "n") cell.z = "#,##0";
    }
  }
  return sheet;
}

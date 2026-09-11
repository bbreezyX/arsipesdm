import type { CellObject, WorkSheet } from "xlsx";
import { parseDate, parseMoney, type ImportRow } from "./import";
import { parseFundTrack } from "./fund-track";
import { tripSchema, type TripInput } from "./model";
import {
  flightSchema,
  lampiran6Schema,
  lampiranCosts,
  lampiranReview,
  type FlightLeg,
  type Lampiran6,
} from "./lampiran6-schema";
import { withFlightLegs } from "./flight-legs";

const normalized = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export function lampiranHeaderRow(sheet: WorkSheet): number | null {
  for (let row = 1; row <= 30; row++) {
    if (
      normalized(sheet[`C${row}`]?.v) === "nip" &&
      normalized(sheet[`B${row}`]?.v).includes("perjadin") &&
      normalized(sheet[`R${row}`]?.v).includes("biaya perjalanan") &&
      normalized(sheet[`AA${row}`]?.v).includes("total")
    )
      return row;
  }
  return null;
}
export function lampiranDepartment(sheet: WorkSheet): string {
  for (let row = 1; row < (lampiranHeaderRow(sheet) ?? 4); row++) {
    const header = String(sheet[`A${row}`]?.v ?? "");
    const match = header.match(/ESDM\s*\(\s*([^)]+)\)/i);
    if (match) return match[1].trim();
  }
  return "";
}
const columnIndex = (column: string) =>
  [...column].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
// Only these journey-level cells can be inherited from an explicit Excel merge.
// Never forward-fill a blank value or duplicate merged expense totals.
const sharedColumns = new Set([
  "F",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
]);
function sourceCell(
  sheet: WorkSheet,
  col: string,
  row: number,
): { cell: CellObject | undefined; address: string } {
  let address = `${col}${row}`;
  if (sharedColumns.has(col)) {
    const c = columnIndex(col);
    const merge = sheet["!merges"]?.find(
      (m) => m.s.c === c && m.e.c === c && row - 1 >= m.s.r && row - 1 <= m.e.r,
    );
    if (merge) address = `${col}${merge.s.r + 1}`;
  }
  return { cell: sheet[address] as CellObject | undefined, address };
}

type SourceGroup = { row: number; following: number[] };
export function convertLampiran6(
  sheet: WorkSheet,
  filename: string,
  sheetName: string,
  department = lampiranDepartment(sheet),
): ImportRow[] {
  const headerRow = lampiranHeaderRow(sheet);
  if (!headerRow) return [];
  const hasScope = normalized(sheet[`BN${headerRow}`]?.v) === "cakupan perjalanan";
  const hasProvince = normalized(sheet[`BO${headerRow}`]?.v) === "provinsi tujuan";
  const hasDestinations = normalized(sheet[`BL${headerRow}`]?.v) === "rincian tujuan (satu per baris)";
  const hasLodgingMode = normalized(sheet[`BP${headerRow}`]?.v) === "perhitungan penginapan";
  const hasLodgingBaseRate = normalized(sheet[`BQ${headerRow}`]?.v) === "tarif dasar penginapan (rp)";
  const hasLodgingNights = normalized(sheet[`BR${headerRow}`]?.v) === "jumlah malam penginapan 30%";
  const hasFundTrack = normalized(sheet[`BS${headerRow}`]?.v) === "keterangan";
  const vehicleColumns = ([
    ["BI", "Jenis mobil"], ["BJ", "Jenis BBM"], ["BK", "Harga BBM per liter (Rp)"], ["BM", "Jumlah liter BBM"],
  ] as const).filter(([col, label]) => normalized(sheet[`${col}${headerRow}`]?.v) === normalized(label)).map(([col]) => col);
  const endRow = Math.min(
    10005,
    Number(sheet["!ref"]?.split(":").at(-1)?.match(/\d+$/)?.[0] ?? 0),
  );
  const groups: SourceGroup[] = [];
  const orphans: ImportRow[] = [];
  const firstDataRow = headerRow + 4;
  for (let row = firstDataRow; row <= endRow; row++) {
    const name = sheet[`B${row}`]?.v;
    if (
      typeof name === "string" &&
      name.trim() &&
      !/^(jumlah|total)(\s|$)/i.test(name.trim())
    ) {
      groups.push({ row, following: [] });
      continue;
    }
    const otherIdentity = [
      "C",
      "D",
      "E",
      "F",
      "G",
      "I",
      "J",
      "L",
      "P",
      "Q",
    ].some((col) => sheet[`${col}${row}`]?.v !== undefined);
    const detailColumns = [
      "S",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "AC",
      "AM",
      "AP",
      "AR",
      "AY",
      "BA",
      ...vehicleColumns,
    ];
    const hasDetails = detailColumns.some(
      (col) => sheet[`${col}${row}`]?.v !== undefined,
    );
    if (otherIdentity) {
      orphans.push({
        row,
        trip: null,
        errors: [
          "Nama pegawai kosong pada baris yang berisi identitas perjalanan.",
        ],
        source: `${filename} • ${sheetName} • baris ${row}`,
      });
    } else if (hasDetails) {
      if (groups.length) groups.at(-1)!.following.push(row);
      else if (row > firstDataRow)
        orphans.push({
          row,
          trip: null,
          errors: ["Baris rincian tidak memiliki baris pegawai sebelumnya."],
          source: `${filename} • ${sheetName} • baris ${row}`,
        });
    }
  }
  const owner = new Map<number, number>();
  const nipNames = new Map<string, Set<string>>();
  for (const group of groups) {
    const nip = String(sheet[`C${group.row}`]?.v ?? "").replace(/\s/g, "");
    if (!nip || ["-", "0"].includes(nip)) continue;
    const names = nipNames.get(nip) ?? new Set<string>();
    names.add(normalized(sheet[`B${group.row}`]?.v));
    nipNames.set(nip, names);
  }
  for (const g of groups)
    for (const row of [g.row, ...g.following]) owner.set(row, g.row);

  return [
    ...groups.map((group) => {
      const errors: string[] = [];
      const warnings = new Set<string>();
      const nipKey = String(sheet[`C${group.row}`]?.v ?? "").replace(/\s/g, "");
      if ((nipNames.get(nipKey)?.size ?? 0) > 1)
        warnings.add(
          `C${group.row}: NIP yang sama dipakai oleh nama pegawai berbeda di sheet ini. Entri tetap dipisahkan; periksa identitas pada sumber.`,
        );
      const sourceFormulas: Record<string, string> = {};
      function read(col: string, row = group.row): unknown {
        const { cell, address } = sourceCell(sheet, col, row);
        if (!cell) return undefined;
        if (cell.f) {
          sourceFormulas[address] = cell.f;
          if (cell.v === undefined)
            errors.push(
              `${address}: rumus belum memiliki hasil tersimpan. Buka dan simpan ulang Excel.`,
            );
          for (const match of cell.f
            .replace(/\$/g, "")
            .matchAll(/\b([A-Z]{1,3})(\d+)\b/g)) {
            const targetRow = Number(match[2]);
            if (
              [
                "S",
                "U",
                "V",
                "W",
                "X",
                "Y",
                "Z",
                "AA",
                "AL",
                "AO",
                "AX",
                "BG",
              ].includes(match[1]) &&
              owner.has(targetRow) &&
              owner.get(targetRow) !== group.row
            )
              warnings.add(
                `${address}: rumus sumber mengambil biaya ${match[0]} milik baris pegawai lain. Nilai sumber disimpan untuk diperiksa.`,
              );
          }
        }
        if (cell.t === "e")
          errors.push(
            `${address}: Excel memuat kesalahan rumus (${cell.w ?? cell.v}).`,
          );
        return cell.v;
      }
      function text(col: string, row = group.row) {
        const value = read(col, row);
        return value === undefined || value === null
          ? ""
          : String(value).trim();
      }
      function money(col: string, row = group.row) {
        try {
          return parseMoney(read(col, row));
        } catch (e) {
          errors.push(`${col}${row}: ${(e as Error).message}`);
          return null;
        }
      }
      function date(col: string, row = group.row) {
        const value = read(col, row);
        if (value === undefined || value === null || value === "") return "";
        if (value === 0 && !["I", "J"].includes(col)) {
          warnings.add(
            `${col}${row}: tanggal pada sumber berisi angka 0; ditandai belum dicatat, bukan tanggal perjalanan.`,
          );
          return "";
        }
        try {
          return parseDate(value);
        } catch (e) {
          errors.push(`${col}${row}: ${(e as Error).message}`);
          return "";
        }
      }
      const detail: Lampiran6 = lampiran6Schema.parse({});
      Object.assign(detail, {
        format: hasScope ? text("BN") || "dalam-provinsi" : "dalam-provinsi",
        destinationProvince: hasProvince ? text("BO") : "",
        sourceNo: text("A"),
        rank: text("E"),
        sppdDate: date("H"),
        origin: text("P"),
        claimedDays: money("K"),
        program: text("M"),
        activityName: text("N"),
        subActivity: text("O"),
        dailyRate: money("R"),
        dailyTotal: money("S"),
        representationRate: money("T"),
        representationTotal: money("U"),
        lodgingCost: money("V"),
        lodgingMode: hasLodgingMode ? text("BP") === "30%" ? "thirty-percent" : normalized(text("BP")) === "manual" || !text("BP") ? "manual" : text("BP") : "manual",
        lodgingBaseRate: hasLodgingBaseRate ? money("BQ") : null,
        lodgingNights: hasLodgingNights ? money("BR") : null,
        landCost: money("W"),
        waterCost: money("X"),
        airCost: money("Y"),
        recordedTotal: money("Z"),
        receiptTotal: money("AA"),
        sourceRows: [group.row, ...group.following],
      });
      const hasColumnData = (columns: readonly string[], row: number) =>
        columns.some((col) => {
          const value = read(col, row);
          return value !== undefined && value !== null && value !== "";
        });
      const transits: Record<"outbound" | "inbound", FlightLeg[]> = { outbound: [], inbound: [] };
      for (const row of [group.row, ...group.following]) {
        if (
          hasColumnData(
            ["AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL"],
            row,
          )
        )
          detail.lodgings.push({
            name: text("AC", row),
            room: text("AD", row),
            reference: text("AE", row),
            checkIn: date("AF", row),
            checkOut: date("AG", row),
            days: money("AH", row),
            application: text("AI", row),
            orderId: text("AJ", row),
            dailyRate: money("AK", row),
            total: money("AL", row),
          });
        if (hasColumnData(["AM", "AN", "AO", ...vehicleColumns], row))
          detail.groundTransports.push({
            mode: text("AM", row),
            provider: text("AN", row),
            vehicleType: vehicleColumns.includes("BI") ? text("BI", row) : "",
            fuelType: vehicleColumns.includes("BJ") ? text("BJ", row) : "",
            fuelPricePerLiter: vehicleColumns.includes("BK") ? money("BK", row) : null,
            fuelLiters: vehicleColumns.includes("BM") && read("BM", row) !== undefined && String(read("BM", row)).trim() !== ""
              ? Number(String(read("BM", row)).trim().replace(",", ".")) : null,
            total: money("AO", row),
          });
        if (row !== group.row) {
          for (const [col, category, label] of [
            ["S", "Uang harian", "Uang harian"],
            ["U", "Representasi", "Representasi"],
            ["V", "Penginapan", "Penginapan"],
            ["W", "Transportasi", "Transport darat"],
            ["X", "Transportasi", "Transport air"],
            ["Y", "Transportasi", "Transport udara"],
          ] as const) {
            const amount = money(col, row);
            if (amount !== null)
              detail.additionalCosts.push({
                category,
                label: `${label} — baris lanjutan ${row}${text("AB", row) ? ": " + text("AB", row) : ""}`,
                amount,
              });
          }
          // Extra flights on continuation rows are transit legs of the same ticket. Their booking
          // references and price are not summed, so any value there is surfaced for review.
          for (const [key, columns] of [
            ["outbound", ["AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX"]],
            ["inbound", ["AY", "AZ", "BA", "BB", "BC", "BD", "BE", "BF", "BG"]],
          ] as const) {
            if (!hasColumnData(columns, row)) continue;
            const [application, orderId, dateCol, airline, origin, destination, bookingCode, ticketNo, price] = columns;
            transits[key].push({
              date: date(dateCol, row),
              airline: text(airline, row),
              origin: text(origin, row),
              destination: text(destination, row),
              bookingCode: text(bookingCode, row),
              ticketNo: text(ticketNo, row),
            });
            for (const col of [application, orderId])
              if (text(col, row))
                warnings.add(`${col}${row}: pemesanan pada baris lanjutan dicatat sebagai transit; aplikasi dan order ID mengikuti tiket utama.`);
            if (money(price, row) !== null)
              warnings.add(`${price}${row}: harga pada baris lanjutan tidak dijumlahkan ke harga tiket. Cocokkan biaya transport udara dengan bukti penerbangan.`);
          }
        }
      }
      for (const [key, [application, orderId, dateCol, airline, origin, destination, bookingCode, ticketNo, price]] of [
        ["outbound", ["AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX"]],
        ["inbound", ["AY", "AZ", "BA", "BB", "BC", "BD", "BE", "BF", "BG"]],
      ] as const) {
        const first = {
          date: date(dateCol),
          airline: text(airline),
          origin: text(origin),
          destination: text(destination),
          bookingCode: text(bookingCode),
          ticketNo: text(ticketNo),
        };
        const legs = [...(hasColumnData([dateCol, airline, origin, destination, bookingCode, ticketNo], group.row) ? [first] : []), ...transits[key]];
        detail[key] = withFlightLegs(
          { ...flightSchema.parse({}), application: text(application), orderId: text(orderId), price: money(price) },
          legs.slice(0, 6),
        );
        if (legs.length > 6)
          errors.push(`Baris ${group.row}: lebih dari 6 penerbangan pada satu arah. Pisahkan atau periksa manual sebelum impor.`);
      }
      if (typeof read("C") === "number")
        warnings.add(
          `C${group.row}: NIP disimpan sebagai angka di Excel; cocokkan seluruh digit dengan identitas asli.`,
        );
      const startDate = date("I"),
        endDate = date("J");
      detail.sourceIssues = [...warnings];
      detail.sourceFormulas = sourceFormulas;
      const personId = `lampiran-person-${group.row}`;
      const rowDepartment = normalized(sheet[`BH${headerRow}`]?.v).includes(
        "bidang",
      )
        ? text("BH") || department
        : department;
      const input: TripInput = {
        title: text("L"),
        sptNo: text("F"),
        sppdNo: text("G"),
        destination: text("Q"),
        ...(hasDestinations && text("BL") ? {destinations: text("BL").split(/\r?\n/).map(value => value.trim())} : {}),
        department: rowDepartment,
        startDate,
        endDate,
        participants: [
          {
            id: personId,
            name: text("B"),
            nip: text("C"),
            position: text("D"),
            department: rowDepartment,
          },
        ],
        costs: lampiranCosts(detail, personId),
        paid: null,
        notes: text("AB"),
        activity: detail.activityName,
        account: "",
        fundTrack: hasFundTrack ? parseFundTrack(text("BS")) : "",
        physicalLocation: "",
        requiredDocs: [],
        correctionReason: "",
        lampiran6: detail,
      };
      const parsed = tripSchema.safeParse(input);
      if (!parsed.success)
        errors.push(...parsed.error.issues.map((issue) => issue.message));
      const review = [
        ...warnings,
        ...lampiranReview(detail, startDate, endDate),
      ];
      return {
        row: group.row,
        trip: parsed.success ? parsed.data : null,
        errors: [...new Set(errors)],
        warnings: [...new Set(review)],
        source: `${filename} • ${sheetName} • baris ${[group.row, ...group.following].join(", ")}`,
      };
    }),
    ...orphans,
  ].sort((a, b) => a.row - b.row);
}

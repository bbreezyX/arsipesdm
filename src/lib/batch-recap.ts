import { z } from "zod";
import { applyDailyAllowance } from "./daily-allowance";
import { tripDestinations } from "./destinations";
import { employeeIdentity, type Employee } from "./employees";
import { lampiran6Schema, lampiranCosts, type Lampiran6 } from "./lampiran6-schema";
import { tripSchema, type TripInput } from "./model";

export const batchRecapSchema = z.object({
  trips: z.array(tripSchema).min(1, "Pilih minimal satu pegawai.").max(100, "Maksimal 100 pegawai sekali simpan."),
}).superRefine(({ trips }, ctx) => {
  const identities = new Set<string>();
  trips.forEach((trip, index) => {
    if (!trip.lampiran6) ctx.addIssue({ code: "custom", path: ["trips", index], message: "Gunakan format rekap per pegawai." });
    const person = trip.participants[0];
    if (!person) return;
    const key = employeeIdentity(person);
    if (identities.has(key)) ctx.addIssue({ code: "custom", path: ["trips", index], message: "Pegawai yang sama dipilih lebih dari sekali." });
    identities.add(key);
  });
});

const commonKeys = ["title", "sptNo", "startDate", "endDate", "destination", "destinations"] as const;
const commonDetailKeys = ["origin", "claimedDays", "program", "activityName", "subActivity", "dailyRateMode", "format", "destinationProvince"] as const;
export type SharedJourney = Pick<TripInput, typeof commonKeys[number]> & Pick<Lampiran6, typeof commonDetailKeys[number]>;
export type BatchRow = { key: string; selected: boolean; input: TripInput };
export type BatchRecapState = { shared: SharedJourney; rows: BatchRow[] };

export function sharedJourney(input: TripInput): SharedJourney {
  return Object.fromEntries([
    ...commonKeys.map(key => [key, input[key]]),
    ...commonDetailKeys.map(key => [key, input.lampiran6![key]]),
  ]) as SharedJourney;
}

export function prepareRecap(input: TripInput): TripInput {
  return { ...input, costs: lampiranCosts(input.lampiran6!, input.participants[0].id) };
}

/** Change only fields edited in the common section, keeping individual exceptions. */
export function updateSharedJourney(state: BatchRecapState, patch: Partial<SharedJourney>): BatchRecapState {
  const changes = Object.fromEntries(Object.entries(patch).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(state.shared[key as keyof SharedJourney]),
  ));
  return {
    shared: { ...state.shared, ...patch },
    rows: state.rows.map(row => {
      const input = { ...row.input, ...Object.fromEntries(commonKeys.filter(key => key in changes).map(key => [key, changes[key]])) };
      let data = { ...input.lampiran6!, ...Object.fromEntries(commonDetailKeys.filter(key => key in changes).map(key => [key, changes[key]])) };
      if ("claimedDays" in changes) {
        if (data.dailyRateMode === "manual" && data.dailyRate !== null)
          data.dailyTotal = data.claimedDays === null ? null : data.dailyRate * data.claimedDays;
        if (data.representationRate !== null)
          data.representationTotal = data.claimedDays === null ? null : data.representationRate * data.claimedDays;
      }
      if (["origin", "destinations", "destination", "claimedDays", "dailyRateMode", "format", "destinationProvince"].some(key => key in changes))
        data = applyDailyAllowance(data, tripDestinations(input));
      return { ...row, input: prepareRecap({ ...input, lampiran6: data, activity: data.activityName }) };
    }),
  };
}

export function newBatchRow(shared: SharedJourney, employee: Pick<Employee, "id" | "name" | "nip" | "position" | "department" | "rank">): BatchRow {
  const { origin, claimedDays, program, activityName, subActivity, dailyRateMode, format, destinationProvince, ...journey } = shared;
  const data = applyDailyAllowance(lampiran6Schema.parse({
    origin, claimedDays, program, activityName, subActivity, format, destinationProvince, rank: employee.rank, dailyRateMode: dailyRateMode ?? "auto",
  }), tripDestinations(journey));
  return { key: employee.id, selected: true, input: prepareRecap({
    ...journey, department: employee.department, sppdNo: "",
    participants: [{ id: employee.id, name: employee.name, nip: employee.nip, position: employee.position, department: employee.department }],
    lampiran6: data, costs: [], paid: null, notes: "", activity: activityName,
    account: "", physicalLocation: "", requiredDocs: [], correctionReason: "",
  }) };
}

/** Keep prior selections and costs when changing between single and multiple modes. */
export function resumeBatch(input: TripInput, employees: Employee[], previous?: BatchRecapState, singleBaseline?: TripInput): BatchRecapState {
  const shared = sharedJourney(input);
  const baseline = singleBaseline ? sharedJourney(singleBaseline) : undefined;
  const changes = baseline ? Object.fromEntries(Object.entries(shared).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(baseline[key as keyof SharedJourney]),
  )) : shared;
  const state = previous ? updateSharedJourney(previous, changes) : { shared, rows: [] };
  const person = input.participants[0];
  if (!person.name.trim()) return state;
  const employee = employees.find(item => employeeIdentity(item) === employeeIdentity(person));
  const key = employee?.id ?? `manual:${employeeIdentity(person)}`;
  const row = { key, selected: true, input: structuredClone(input) };
  return { ...state, rows: state.rows.some(item => item.key === key)
    ? state.rows.map(item => item.key === key ? row : item)
    : [...state.rows, row] };
}

export const batchCostColumns = [
  ["dailyTotal", "Uang harian"], ["representationTotal", "Representasi"],
  ["lodgingCost", "Penginapan"], ["landCost", "Darat"], ["waterCost", "Air"], ["airCost", "Udara"],
] as const;
export type BatchCostField = typeof batchCostColumns[number][0];

export function setRecapAmount(input: TripInput, field: BatchCostField, amount: number | null): TripInput {
  return prepareRecap({ ...input, lampiran6: {
    ...input.lampiran6!, [field]: amount,
    ...(field === "dailyTotal" ? { dailyRateMode: "manual" as const, dailyRate: null } : {}),
    ...(field === "representationTotal" ? { representationRate: null } : {}),
  } });
}

/** Copy the chosen amount only; receipts, booking references and SPPD stay personal. */
export function copyRecapAmount(rows: BatchRow[], sourceKey: string, field: BatchCostField, targetKeys: string[]): BatchRow[] {
  const source = rows.find(row => row.key === sourceKey && row.selected);
  if (!source) return rows;
  const targets = new Set(targetKeys);
  return rows.map(row => row.selected && row.key !== sourceKey && targets.has(row.key)
    ? { ...row, input: setRecapAmount(row.input, field, source.input.lampiran6![field]) }
    : row);
}

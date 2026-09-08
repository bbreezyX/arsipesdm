import { randomUUID } from "node:crypto";
import { db, getTrips, transaction } from "./db";
import { employeeIdentity, employeeMatches, employeeSchema, type Employee, type EmployeeInput } from "./employees";


async function read(workspace: string): Promise<Employee[]> {
  return ((await db.prepare("SELECT payload FROM employees WHERE workspace=?").all(workspace)) as {payload: string}[]).map(r => JSON.parse(r.payload));
}
async function write(workspace: string, employee: Employee) {
  (await db.prepare("INSERT INTO employees VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE employees.workspace=excluded.workspace").run(employee.id, workspace, JSON.stringify(employee)));
}
// Preserve historical identities, including deleted entries, so imports cannot resurrect them.
async function sync(workspace: string) {
  const employees = (await read(workspace));
  const trips = (await getTrips(workspace)).filter(t => !t.deletedAt).sort((a,b) =>
    b.startDate.localeCompare(a.startDate) || b.updatedAt.localeCompare(a.updatedAt),
  );
  // Backfill only pre-existing records without the field. An explicitly cleared
  // rank stays empty, even when an older archive still contains a rank.
  for (const employee of employees) {
    if (typeof employee.rank === "string") continue;
    const source = trips.find(t => t.lampiran6?.rank && t.participants.some(p => employeeMatches(employee, p)));
    employee.rank = source?.lampiran6?.rank ?? "";
    employee.version++;
    (await write(workspace, employee));
  }
  const identities = new Set(employees.flatMap(p => p.identities));
  for (const trip of trips) {
    for (const participant of trip.participants) {
      const identity = employeeIdentity(participant);
      if (identities.has(identity)) continue;
      const employee: Employee = {...participant, rank: trip.lampiran6?.rank ?? "", id: randomUUID(), version: 1, identities: [identity], deletedAt: null};
      (await write(workspace, employee));
      employees.push(employee);
      identities.add(identity);
    }
  }
  return employees;
}
export async function getEmployees(workspace: string) {
  return (await transaction(async () => (await sync(workspace)))).sort((a,b) => a.name.localeCompare(b.name, "id"));
}
function assertUnique(employees: Employee[], input: EmployeeInput, id?: string) {
  if (employees.some(p => p.id !== id && p.identities.includes(employeeIdentity(input))))
    throw new Error("Pegawai dengan NIP atau identitas ini sudah tercatat, termasuk pada daftar terhapus. Edit atau pulihkan data tersebut.");
}
export async function createEmployee(workspace: string, body: unknown) {
  const input = employeeSchema.parse(body);
  return (await transaction(async () => {
    const employees = (await sync(workspace));
    assertUnique(employees, input);
    const employee: Employee = {...input, id: randomUUID(), version: 1, identities: [employeeIdentity(input)], deletedAt: null};
    (await write(workspace, employee));
    return employee;
  }));
}
export async function changeEmployee(workspace: string, id: string, version: unknown, action: "edit" | "delete" | "restore", body?: unknown) {
  return (await transaction(async () => {
    const employees = (await sync(workspace));
    const employee = employees.find(p => p.id === id);
    if (!employee) throw new Error("Data pegawai tidak ditemukan.");
    if (version !== employee.version) throw new Error("Data pegawai telah berubah. Muat ulang halaman sebelum mencoba kembali.");
    if (action === "edit") {
      if (employee.deletedAt) throw new Error("Pulihkan pegawai sebelum mengedit.");
      const input = employeeSchema.parse(body);
      // Requests from a previously opened form may omit the newly added field.
      if (body && typeof body === "object" && !("rank" in body)) input.rank = employee.rank;
      assertUnique(employees, input, id);
      Object.assign(employee, input);
      employee.identities = [...new Set([...employee.identities, employeeIdentity(input)])];
    } else employee.deletedAt = action === "delete" ? new Date().toISOString() : null;
    employee.version++;
    (await write(workspace, employee));
    return employee;
  }));
}

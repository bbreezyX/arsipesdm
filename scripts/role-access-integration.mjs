import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// Run through test-api.mjs: every fixture belongs to its disposable PostgreSQL schema.
if (!/^test_[a-z0-9_]+$/.test(process.env.DATABASE_SCHEMA || "") || !process.env.TEST_DATABASE_URL)
  throw new Error("Role integration tests require a disposable test schema.");
const origin = process.env.TEST_ORIGIN;
if (!origin) throw new Error("Set TEST_ORIGIN to the isolated test server.");
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${process.env.DATABASE_SCHEMA}` });
const suffix = randomUUID();
const password = randomUUID();
let checks = 0;
async function request(path, method = "GET", body, cookie) {
  return fetch(origin + path, {
    method, redirect: "manual",
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
async function expect(path, status, method = "GET", body, cookie) {
  const response = await request(path, method, body, cookie);
  assert.equal(response.status, status, `${method} ${path}: ${response.status} instead of ${status}`);
  checks++;
  return response;
}
async function login(email, secret = password) {
  const response = await expect("/api/session", 200, "POST", { email, password: secret });
  return response.headers.get("set-cookie").split(";")[0];
}
const base = {
  title: "Perjalanan uji akses Pembaca", sptNo: `TEST-${suffix}/2024`, destination: "Kabupaten Kerinci", department: "Energi",
  startDate: "2024-01-11", endDate: "2024-01-13",
  participants: [{ id: "p1", name: "Peserta perjalanan uji", nip: "123", position: "Analis", department: "Energi" }],
  costs: [{ id: "c1", category: "Transportasi", label: "Transportasi perjalanan", participantId: "p1", amount: 150000 }],
  notes: `PRIVATE-NOTE-${suffix}`, physicalLocation: `PRIVATE-LOCATION-${suffix}`, requiredDocs: ["spt"],
};

try {
  const admin = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const accounts = {};
  for (const role of ["viewer", "operator"]) {
    const input = { name: `Uji ${role}`, email: `${role}-${suffix}@example.local`, password, role };
    const account = await (await expect("/api/users", 201, "POST", input, admin)).json();
    assert.equal(account.role, role);
    accounts[role] = { ...account, cookie: await login(input.email) };
  }
  const reader = accounts.viewer.cookie;
  const operator = accounts.operator.cookie;
  const defaultUser = await (await expect("/api/users", 201, "POST", { name: "Default Pembaca", email: `default-${suffix}@example.local`, password }, admin)).json();
  assert.equal(defaultUser.role, "viewer");
  for (const role of ["admin", "owner", "__proto__", null])
    await expect("/api/users", 400, "POST", { name: "Invalid role", email: `invalid-${suffix}@example.local`, password, role }, admin);

  let trip = await (await expect("/api/archives", 201, "POST", base, operator)).json();
  const docForm = new FormData();
  docForm.set("tripId", trip.id); docForm.set("version", String(trip.version)); docForm.set("type", "spt");
  docForm.set("file", new Blob(["%PDF-1.4\nROLE-TEST-DOCUMENT\n%%EOF"], { type: "application/pdf" }), `PRIVATE-FILE-${suffix}.pdf`);
  trip = await (await expect("/api/documents", 201, "POST", docForm, operator)).json();
  const doc = trip.documents[0];
  const deleted = await (await expect("/api/archives", 201, "POST", { ...base, title: "PRIVATE-DELETED-TRIP", sptNo: `DELETED-${suffix}` }, operator)).json();
  await expect(`/api/archives/${deleted.id}`, 200, "DELETE", { version: deleted.version }, operator);
  const employee = await (await expect("/api/employees", 201, "POST", { name: `PRIVATE-EMPLOYEE-${suffix}`, nip: "", department: "Energi", position: "Analis" }, admin)).json();
  const honorarium = await (await expect("/api/honorariums", 201, "POST", {
    category: "finance", year: 2024, skNumber: `SK-${suffix}`, skName: `PRIVATE-HONORARIUM-${suffix}`,
    department: "Energi", program: "", activity: "", subActivity: "", recipient: "PRIVATE-RECIPIENT",
    position: "", skPosition: "Pengelola", recipientDepartment: "Energi", echelon: "", budget: 1000000,
    monthlyAmount: 100000, months: 1, taxMode: "amount", taxAmount: 0, taxRate: 0, notes: "PRIVATE-HONOR-NOTE",
  }, admin)).json();

  const snapshot = async () => {
    const tables = ["arsip_perjalanan", "pegawai", "honorarium", "lampiran", "pengguna", "pengaturan"];
    return Promise.all(tables.map(async table => (await db.query(`SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS hash FROM ${table} t`)).rows[0].hash));
  };
  const before = await snapshot();
  const denied = [
    ["POST", "/api/archives"], ["POST", "/api/archives/batch"], ["POST", "/api/archives/import"], ["POST", "/api/archives/export"],
    ["PATCH", `/api/archives/${trip.id}`], ["DELETE", `/api/archives/${trip.id}`],
    ["PATCH", `/api/archives/${deleted.id}`],
    ["POST", "/api/documents"], ["GET", `/api/documents/${doc.id}`], ["DELETE", `/api/documents/${doc.id}`],
    ["GET", "/api/employees"], ["POST", "/api/employees"], ["PATCH", `/api/employees/${employee.id}`], ["DELETE", `/api/employees/${employee.id}`],
    ["GET", "/api/vehicles"], ["POST", "/api/vehicles"],
    ["GET", "/api/honorariums"], ["POST", "/api/honorariums"], ["GET", `/api/honorariums/${honorarium.id}`],
    ["PATCH", `/api/honorariums/${honorarium.id}`], ["DELETE", `/api/honorariums/${honorarium.id}`],
    ["GET", "/api/users"], ["POST", "/api/users"], ["PATCH", "/api/users"], ["PATCH", "/api/settings"],
  ];
  for (const [method, path] of denied) await expect(path, 403, method, method === "GET" ? undefined : {}, reader);
  assert.deepEqual(await snapshot(), before, "denied requests must not change business data or users");
  for (const path of ["/api/archives", `/api/archives/${trip.id}`]) {
    const response = await expect(path, 200, "GET", undefined, reader);
    const data = await response.json();
    const text = JSON.stringify(data);
    for (const secret of ["PRIVATE-", deleted.id, doc.id]) assert(!text.includes(secret), `reader JSON leaks ${secret}`);
    const visible = Array.isArray(data) ? data.find(item => item.id === trip.id) : data;
    assert(visible);
    assert.equal(visible.costs[0].amount, 150000);
    assert.equal(visible.documents.length, 1);
    assert.equal(visible.documents[0].type, "spt");
  }
  await expect(`/api/archives/${deleted.id}`, 404, "GET", undefined, reader);
  for (const path of ["/", "/arsip-perjalanan", "/surat-tugas", "/rekap-laporan", `/cetak/${trip.id}`]) {
    const html = await (await expect(path, 200, "GET", undefined, reader)).text();
    for (const secret of ["PRIVATE-", doc.id, deleted.id]) assert(!html.includes(secret), `reader HTML/RSC ${path} leaks ${secret}`);
  }
  await expect(`/cetak/${deleted.id}`, 404, "GET", undefined, reader);
  for (const path of ["/dokumen", "/pegawai", "/honorarium", "/pengaturan", "/sampah"]) {
    const response = await expect(path, 307, "GET", undefined, reader);
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/");
  }
  await expect("/api/session", 200, "GET", undefined, reader);
  await expect("/api/session", 200, "PATCH", undefined, reader);
  await expect("/api/archives", 401, "GET", undefined, "archive-session=expired");

  // Operator's established read/write/download functionality remains available.
  await expect(`/api/documents/${doc.id}`, 200, "GET", undefined, operator);
  trip = await (await expect(`/api/archives/${trip.id}`, 200, "PATCH", { ...trip, paid: 100000, correctionReason: "Uji perubahan operator" }, operator)).json();
  const workbook = await expect("/api/archives/export", 200, "POST", { ids: [trip.id], label: "2024" }, operator);
  assert.equal(workbook.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(Buffer.from(await workbook.arrayBuffer()).subarray(0, 2).toString(), "PK");
  await expect("/api/archives/export", 404, "POST", { ids: [deleted.id], label: "2024" }, operator);
  await expect("/api/archives/export", 404, "POST", { ids: ["other-workspace"], label: "2024" }, operator);
  await expect("/api/users", 403, "PATCH", { id: accounts.viewer.id, role: "operator" }, operator);
  await expect("/api/users", 403, "PATCH", { id: accounts.viewer.id, role: "operator" }, reader);
  const adminAccount = (await (await expect("/api/users", 200, "GET", undefined, admin)).json()).find(user => user.role === "admin");
  await expect("/api/users", 403, "PATCH", { id: adminAccount.id, role: "viewer" }, admin);
  await expect("/api/users", 400, "PATCH", { id: accounts.viewer.id, role: "admin" }, admin);

  await expect("/api/users", 200, "PATCH", { id: accounts.operator.id, role: "viewer" }, admin);
  await expect("/api/archives", 401, "GET", undefined, operator);
  const downgraded = await login(accounts.operator.email);
  await expect("/api/archives", 403, "POST", base, downgraded);
  await expect("/api/users", 200, "PATCH", { id: accounts.viewer.id, role: "operator" }, admin);
  await expect("/api/session", 401, "GET", undefined, reader);
  const upgraded = await login(accounts.viewer.email);
  await expect("/api/employees", 200, "GET", undefined, upgraded);
  // Setting the same role does not unnecessarily terminate an active session.
  await expect("/api/users", 200, "PATCH", { id: accounts.viewer.id, role: "operator" }, admin);
  await expect("/api/session", 200, "GET", undefined, upgraded);
  await expect("/api/session", 200, "DELETE", undefined, downgraded);
  await expect("/api/session", 401, "GET", undefined, downgraded);
  console.log(`PASS: ${checks} role/access HTTP checks (reader restrictions, data projection, SSR, exports, admin role changes and session revocation).`);
} finally { await db.end(); }

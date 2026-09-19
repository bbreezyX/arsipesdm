import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (!/^test_[a-z0-9_]+$/.test(process.env.DATABASE_SCHEMA || "") || !process.env.TEST_DATABASE_URL)
  throw new Error("Onboarding integration tests require a disposable test schema.");
const origin = process.env.TEST_ORIGIN;
if (!origin) throw new Error("Set TEST_ORIGIN to the isolated test server.");
async function request(path, method = "GET", body, cookie, requestOrigin = origin) {
  return fetch(origin + path, { method, headers: {
    Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
}
async function login(email, password) {
  const response = await request("/api/session", "POST", { email, password });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}
const admin = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
const accounts = {};
for (const role of ["viewer", "operator"]) {
  const input = { name: `Onboarding ${role}`, email: `${randomUUID()}@example.local`, password: randomUUID(), role };
  assert.equal((await request("/api/users", "POST", input, admin)).status, 201);
  accounts[role] = { ...input, cookie: await login(input.email, input.password) };
}
const progress = async cookie => (await request("/api/onboarding", "GET", undefined, cookie)).json();
assert.deepEqual(await progress(accounts.viewer.cookie), {});
assert.equal((await request("/api/onboarding", "PATCH", { id: "archive-guide", status: "completed" }, accounts.viewer.cookie)).status, 200);
// A fresh login demonstrates account persistence, independent of browser storage.
assert.deepEqual(await progress(await login(accounts.viewer.email, accounts.viewer.password)), { "archive-guide": "completed" });
assert.deepEqual(await progress(accounts.operator.cookie), {});
assert.equal((await request("/api/onboarding", "PATCH", { id: "documents", status: "dismissed" }, accounts.viewer.cookie)).status, 403);
assert.equal((await request("/api/onboarding", "PATCH", { id: "documents", status: "dismissed" }, accounts.operator.cookie)).status, 200);
assert.equal((await request("/api/onboarding", "PATCH", { id: "archive-guide", status: "completed", userId: "someone-else" }, accounts.operator.cookie)).status, 400);
assert.equal((await request("/api/onboarding", "PATCH", { id: "unknown", status: "completed" }, accounts.operator.cookie)).status, 400);
assert.equal((await request("/api/onboarding", "PATCH", { id: "archive-guide", status: "completed" }, accounts.operator.cookie, "https://elsewhere.invalid")).status, 403);
assert.equal((await request("/api/onboarding", "GET", undefined, "archive-session=expired")).status, 401);
assert.deepEqual(await progress(accounts.viewer.cookie), { "archive-guide": "completed" });
assert.deepEqual(await progress(accounts.operator.cookie), { documents: "dismissed" });
console.log("Onboarding API: persistence across logins, account isolation, role checks, validation, origin and expired session checks passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3107";
const ids = [];
const files = [];
let checks = 0;
async function request(endpoint, method = "GET", body, cookie, headers = {}) {
  return fetch(origin + endpoint, {
    method,
    headers: {
      Origin: origin,
      ...(body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
const input = {
  title: "[TEST] Arsip perjalanan integrasi",
  sptNo: "[TEST] " + Date.now(),
  sppdNo: "",
  destination: "Kerinci",
  department: "Energi",
  startDate: "2024-01-11",
  endDate: "2024-01-13",
  participants: [
    {
      id: "pa",
      name: "Peserta uji A",
      nip: "",
      position: "",
      department: "Energi",
    },
    {
      id: "pb",
      name: "Peserta uji B",
      nip: "",
      position: "",
      department: "Energi",
    },
  ],
  costs: [
    {
      id: "ca",
      category: "Transportasi",
      label: "Bersama",
      participantId: "shared",
      amount: 1000000,
    },
    {
      id: "cb",
      category: "Uang harian",
      label: "Peserta A",
      participantId: "pa",
      amount: 500000,
    },
  ],
  paid: null,
  notes: "Data uji otomatis sementara.",
  activity: "",
  account: "",
  physicalLocation: "Map uji",
  requiredDocs: ["spt", "sppd"],
  correctionReason: "",
};
try {
  let r = await request("/api/archives");
  assert.equal(r.status, 200);
  const seed = await r.json();
  assert(seed.length >= 12);
  checks++;
  r = await request("/api/archives", "POST", {
    ...input,
    endDate: "2023-01-01",
  });
  assert.equal(r.status, 422);
  checks++;
  r = await request("/api/archives", "POST", input, undefined, {
    Origin: "https://untrusted.example",
  });
  assert.equal(r.status, 403);
  checks++;
  r = await request("/api/archives", "POST", input);
  assert.equal(r.status, 201);
  let t = await r.json();
  ids.push(t.id);
  assert.equal(
    t.costs.reduce((n, c) => n + c.amount, 0),
    1500000,
  );
  assert.equal(t.paid, null);
  checks++;
  r = await request("/api/archives", "POST", input);
  assert.equal(r.status, 409);
  checks++;
  r = await request("/api/archives/" + t.id, "PATCH", {
    ...t,
    version: 0,
    correctionReason: "Uji konflik",
  });
  assert.equal(r.status, 409);
  checks++;
  r = await request("/api/archives/" + t.id, "PATCH", {
    ...t,
    paid: 1400000,
    correctionReason: "Uji pembaruan bukti pembayaran",
  });
  assert.equal(r.status, 200);
  t = await r.json();
  assert.equal(t.version, 2);
  assert.equal(t.paid, 1400000);
  assert.equal(t.history[0].actor, "Operator contoh");
  checks++;
  r = await request("/api/archives/" + t.id);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), t);
  r = await request("/api/archives/missing-test-archive");
  assert.equal(r.status, 404);
  checks++;
  const form = new FormData();
  form.set("tripId", t.id);
  form.set("version", String(t.version));
  form.set("type", "spt");
  form.set("kind", "physical");
  form.set("location", "Map uji 2024 / rak A");
  r = await request("/api/documents", "POST", form);
  assert.equal(r.status, 201);
  t = await r.json();
  assert.equal(t.documents[0].kind, "physical");
  checks++;
  const wrong = new FormData();
  wrong.set("tripId", t.id);
  wrong.set("version", String(t.version));
  wrong.set("type", "sppd");
  wrong.set(
    "file",
    new Blob(["<html>not a pdf</html>"], { type: "application/pdf" }),
    "wrong.pdf",
  );
  r = await request("/api/documents", "POST", wrong);
  assert.equal(r.status, 400);
  checks++;
  const upload = new FormData();
  upload.set("tripId", t.id);
  upload.set("version", String(t.version));
  upload.set("type", "sppd");
  upload.set(
    "file",
    new Blob([readFileSync("public/logo-esdm-jambi.png")], {
      type: "image/png",
    }),
    "test-image.png",
  );
  r = await request("/api/documents", "POST", upload);
  assert.equal(r.status, 201);
  t = await r.json();
  const doc = t.documents.find((d) => d.kind === "file");
  files.push(doc.id);
  r = await request("/api/documents/" + doc.id);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  checks++;
  r = await request("/api/archives/import", "POST", {
    rows: [
      { trip: input, source: "test.xlsx / Sheet1 / baris 2" },
      {
        trip: {
          ...input,
          title: "[TEST] Impor kedua",
          sptNo: input.sptNo + "/2",
        },
        source: "test.xlsx / Sheet1 / baris 3",
      },
    ],
  });
  assert.equal(r.status, 200);
  const imported = await r.json();
  ids.push(...imported.added.map((x) => x.id));
  assert.equal(imported.skipped, 1);
  assert.equal(imported.added.length, 1);
  checks++;
  r = await request("/api/archives/" + t.id, "DELETE", { version: 0 });
  assert.equal(r.status, 409);
  r = await request(
    "/api/archives/" + t.id,
    "DELETE",
    { version: t.version },
    undefined,
    { Origin: "https://untrusted.example" },
  );
  assert.equal(r.status, 403);
  assert.equal(
    (await (await request("/api/archives/" + t.id)).json()).deletedAt,
    null,
  );
  checks++;
  r = await request("/api/archives/" + t.id, "DELETE", {
    version: t.version,
  });
  assert.equal(r.status, 200);
  t = await r.json();
  assert(t.deletedAt);
  assert.equal(t.history[0].action, "Dipindahkan ke sampah");
  assert(t.documents.some((d) => d.id === doc.id));
  const deletedVersion = t.version;
  r = await request("/api/archives/" + t.id, "DELETE", { version: t.version });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).version, deletedVersion);
  r = await request("/api/documents/" + doc.id);
  assert.equal(r.status, 404);
  checks++;
  r = await request("/api/archives/" + t.id, "PATCH", {
    action: "restore",
    version: t.version,
  });
  assert.equal(r.status, 200);
  t = await r.json();
  assert.equal(t.deletedAt, null);
  r = await request("/api/documents/" + doc.id);
  assert.equal(r.status, 200);
  checks++;
  r = await request("/api/settings", "PATCH", { departments: ["Uji"] });
  assert.equal(r.status, 403);
  checks++;
  r = await request(
    "/api/archives",
    "GET",
    undefined,
    "archive-session=expired",
  );
  assert.equal(r.status, 401);
  for (const method of ["GET", "DELETE"]) {
    r = await request(
      "/api/archives/" + t.id,
      method,
      method === "DELETE" ? { version: t.version } : undefined,
      "archive-session=expired",
    );
    assert.equal(r.status, 401);
  }
  checks++;
  r = await request("/api/session", "POST", {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(r.status, 200);
  const session = r.headers.get("set-cookie").split(";")[0];
  r = await request("/api/archives", "GET", undefined, session);
  assert.equal(r.status, 200);
  const office = await r.json();
  assert(!office.some((x) => ids.includes(x.id) || x.source === "Data contoh"));
  r = await request("/api/archives/" + t.id, "GET", undefined, session);
  assert.equal(r.status, 404);
  r = await request(
    "/api/archives/" + t.id,
    "DELETE",
    { version: t.version },
    session,
  );
  assert.equal(r.status, 404);
  checks++;
  r = await request("/api/documents/" + doc.id, "GET", undefined, session);
  assert.equal(r.status, 404);
  r = await request(
    "/api/archives/" + t.id,
    "PATCH",
    { ...t, correctionReason: "cross scope" },
    session,
  );
  assert.equal(r.status, 404);
  await request("/api/session", "DELETE", undefined, session);
  checks++;
  console.log(
    `PASS: ${checks} API integration checks (CRUD, validation, duplicate import, shared costs, document upload, recoverable deletion, concurrency, login, workspace isolation).`,
  );
} finally {
  if (!process.env.DATABASE_SCHEMA?.startsWith("test_")) throw new Error("Integration cleanup requires a disposable test schema.");
  const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${process.env.DATABASE_SCHEMA}` });
  try {
    for (const id of ids) await db.query("DELETE FROM records WHERE id=$1 AND workspace='demo' AND payload::jsonb->>'title' LIKE '[TEST]%'", [id]);
    for (const id of files) await db.query("DELETE FROM attachments WHERE id=$1 AND workspace='demo'", [id]);
  } finally { await db.end(); }
}

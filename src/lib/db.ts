import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import {
  type Trip,
  type TripInput,
  type User,
  departments,
  fingerprint,
} from "./model";

export { db, transaction } from "./postgres";
import { db, transaction } from "./postgres";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
export function publicUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role as User["role"],
  };
}
export function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function getTrips(workspace: string): Promise<Trip[]> {
  return (
    (await db
      .prepare("SELECT payload FROM arsip_perjalanan WHERE workspace=?")
      .all(workspace)) as { payload: string }[]
  ).map((row) => JSON.parse(row.payload));
}
export async function getTrip(id: string, workspace: string): Promise<Trip | null> {
  const row = (await db
    .prepare("SELECT payload FROM arsip_perjalanan WHERE id=? AND workspace=?")
    .get(id, workspace)) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : null;
}
export async function putTrip(t: Trip, workspace: string) {
  (await db.prepare(
    "INSERT INTO arsip_perjalanan(id,workspace,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE arsip_perjalanan.workspace=excluded.workspace",
  ).run(t.id, workspace, JSON.stringify(t)));
}
export function addEvent(t: Trip, action: string, actor: string, detail = "") {
  t.history.unshift({
    id: randomUUID(),
    action,
    actor,
    detail,
    at: new Date().toISOString(),
  });
  t.updatedAt = new Date().toISOString();
  t.version++;
}
export async function newTrip(
  input: TripInput,
  workspace: string,
  actor: string,
  source = "Input manual",
): Promise<Trip> {
  const existing = (await getTrips(workspace));
  if (
    existing.some((t) => !t.deletedAt && fingerprint(t) === fingerprint(input))
  )
    throw new Error("DUPLICATE");
  const now = new Date().toISOString();
  const year = input.startDate.slice(0, 4);
  const seq =
    existing
      .filter((t) => t.code.startsWith(`PD/${year}/`))
      .reduce((n, t) => Math.max(n, Number(t.code.split("/")[2]) || 0), 0) + 1;
  const t: Trip = {
    ...input,
    id: randomUUID(),
    code: `PD/${year}/${String(seq).padStart(4, "0")}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    documents: [],
    history: [
      {
        id: randomUUID(),
        action: "Arsip ditambahkan",
        actor,
        at: now,
        detail: source,
      },
    ],
    source,
    deletedAt: null,
  };
  (await putTrip(t, workspace));
  return t;
}
export async function getDepartments() {
  const row = (await db
    .prepare("SELECT value FROM pengaturan WHERE key=?")
    .get("departments")) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as string[]) : departments;
}

let initialization: Promise<void> | undefined;
export function initializeDatabase() {
  return initialization ??= bootstrapDatabase().catch(error => { initialization = undefined; throw error; });
}
async function bootstrapDatabase() {
(await transaction(async () => {
  if (
    !(await db.prepare("SELECT id FROM pengguna LIMIT 1").get()) &&
    process.env.ADMIN_PASSWORD &&
    process.env.ADMIN_EMAIL
  ) {
    (await db.prepare("INSERT INTO pengguna VALUES(?,?,?,?,?)").run(
      randomUUID(),
      "Administrator",
      process.env.ADMIN_EMAIL.toLowerCase(),
      hashPassword(process.env.ADMIN_PASSWORD),
      "admin",
    ));
  }
}));

if (
  process.env.DEMO_ENABLED === "true" &&
  !(await db.prepare("SELECT value FROM pengaturan WHERE key=?").get("demo-seeded"))
) {
  (await transaction(async () => {
    if ((await db.prepare("SELECT value FROM pengaturan WHERE key=?").get("demo-seeded")))
      return;
    const entries = [
      [
        "Monitoring instalasi listrik desa",
        "Kab. Kerinci",
        "Ketenagalistrikan",
        "2025-11-18",
        3,
        ["Ahmad Pratama", "Rina Wulandari", "Dedi Saputra"],
        8250000,
        true,
      ],
      [
        "Evaluasi pengelolaan air tanah",
        "Kab. Tanjung Jabung Barat",
        "Geologi dan Air Tanah",
        "2025-10-22",
        2,
        ["Siti Rahmawati", "Budi Santoso"],
        4600000,
        false,
      ],
      [
        "Koordinasi program energi terbarukan",
        "Jakarta",
        "Energi",
        "2025-10-13",
        3,
        ["Andi Kurniawan", "Maya Puspita"],
        12450000,
        true,
      ],
      [
        "Pembinaan usaha pertambangan mineral",
        "Kab. Bungo",
        "Pertambangan dan Minerba",
        "2025-09-24",
        3,
        ["Dedi Saputra", "Fitri Handayani", "Rizki Pratama"],
        7950000,
        false,
      ],
      [
        "Konsultasi penyusunan laporan keuangan",
        "Kota Palembang",
        "Sekretariat",
        "2025-08-12",
        2,
        ["Rina Wulandari", "Siti Rahmawati"],
        5200000,
        true,
      ],
      [
        "Pendataan potensi panas bumi",
        "Kab. Merangin",
        "Energi",
        "2025-07-16",
        3,
        ["Ahmad Pratama", "Maya Puspita"],
        6150000,
        true,
      ],
      [
        "Monitoring keselamatan ketenagalistrikan",
        "Kab. Batang Hari",
        "Ketenagalistrikan",
        "2025-06-09",
        2,
        ["Budi Santoso", "Andi Kurniawan"],
        3400000,
        false,
      ],
      [
        "Inventarisasi sumber daya mineral",
        "Kab. Sarolangun",
        "Pertambangan dan Minerba",
        "2025-04-21",
        3,
        ["Fitri Handayani", "Rizki Pratama"],
        5750000,
        true,
      ],
      [
        "Survei konservasi air tanah",
        "Kab. Tebo",
        "Geologi dan Air Tanah",
        "2024-11-11",
        3,
        ["Siti Rahmawati", "Dedi Saputra"],
        4900000,
        true,
      ],
      [
        "Koordinasi rencana kerja perangkat daerah",
        "Kota Padang",
        "Sekretariat",
        "2024-09-16",
        3,
        ["Rina Wulandari", "Budi Santoso"],
        7250000,
        false,
      ],
      [
        "Evaluasi jaringan listrik pedesaan",
        "Kab. Muaro Jambi",
        "Ketenagalistrikan",
        "2024-06-12",
        2,
        ["Ahmad Pratama", "Andi Kurniawan"],
        2800000,
        true,
      ],
      [
        "Pendataan energi baru dan terbarukan",
        "Kab. Tanjung Jabung Timur",
        "Energi",
        "2023-10-09",
        3,
        ["Maya Puspita", "Fitri Handayani"],
        4150000,
        false,
      ],
    ] as const;
    for (const [i, e] of entries.entries()) {
      const [
        title,
        destination,
        department,
        startDate,
        days,
        names,
        total,
        complete,
      ] = e;
      const end = new Date(startDate);
      end.setUTCDate(end.getUTCDate() + days - 1);
      const t = (await newTrip(
        {
          title,
          destination,
          department,
          startDate,
          endDate: end.toISOString().slice(0, 10),
          sptNo: `094/${118 + i * 17}/DESDM/${startDate.slice(0, 4)}`,
          sppdNo: `090/${208 + i * 9}/DESDM/${startDate.slice(0, 4)}`,
          participants: names.map((name) => ({
            id: randomUUID(),
            name,
            nip: "",
            position: "Pegawai (contoh)",
            department,
          })),
          costs: [
            {
              id: randomUUID(),
              category: "Biaya lainnya",
              label: "Total realisasi pada rekap contoh",
              participantId: "shared",
              amount: total,
            },
          ],
          paid: complete ? total : i % 2 ? total - 1000000 : null,
          notes:
            "Data fiktif untuk mencoba aplikasi. Bukan catatan perjalanan atau biaya Dinas ESDM yang sebenarnya.",
          activity: "Pelaksanaan urusan pemerintahan bidang ESDM",
          account: "",
          physicalLocation: `Lemari contoh A • Map ${startDate.slice(0, 4)}/${i + 1}`,
          requiredDocs: ["spt", "sppd", "report", "receipt"],
          correctionReason: "",
        },
        "demo",
        "Operator contoh",
        "Data contoh",
      ));
      (complete
        ? ["spt", "sppd", "report", "receipt"]
        : ["spt", "sppd"]
      ).forEach((type) =>
        t.documents.push({
          id: randomUUID(),
          type,
          name: "Berkas fisik contoh",
          kind: "physical",
          size: 0,
          location: t.physicalLocation,
          createdAt: t.createdAt,
        }),
      );
      (await putTrip(t, "demo"));
    }
    (await db.prepare("INSERT INTO pengaturan VALUES(?,?)").run("demo-seeded", "true"));
  }));
}

}

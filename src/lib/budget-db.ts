import { db } from "./db";
import { budgetListSchema, uniqueBudgets, type Budget } from "./budgets";

// Per ruang arsip, seperti daftar kendaraan: data contoh tidak bercampur dengan arsip kantor.
const key = (workspace: string) => `anggaran:${workspace}`;

export async function getBudgets(workspace: string): Promise<Budget[]> {
  const row = await db.prepare("SELECT value FROM pengaturan WHERE key=?").get(key(workspace));
  const parsed = row ? budgetListSchema.safeParse(JSON.parse(String(row.value))) : null;
  return parsed?.success ? parsed.data : [];
}

export async function saveBudgets(workspace: string, budgets: Budget[]): Promise<Budget[]> {
  const list = uniqueBudgets(budgets);
  await db.prepare("INSERT INTO pengaturan(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key(workspace), JSON.stringify(list));
  return list;
}

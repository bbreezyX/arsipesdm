import { z } from "zod";

const text = z.string().trim().max(1000);
/** Program, kegiatan anggaran dan subkegiatan dicatat bersama sebagai satu paket di Pengaturan. */
export const budgetSchema = z.object({
  program: text.min(1, "Isi nama program terlebih dahulu."),
  activityName: text.default(""),
  subActivity: text.default(""),
});
export type Budget = z.infer<typeof budgetSchema>;
export const budgetListSchema = z.array(budgetSchema).max(200, "Paket anggaran paling banyak 200.");

export const budgetKey = (budget: Budget) =>
  [budget.program, budget.activityName, budget.subActivity].map(part => part.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID")).join("|");

/** Paket kembar (beda huruf besar atau spasi) cukup disimpan sekali; urutan pertama dipertahankan. */
export function uniqueBudgets(budgets: Budget[]): Budget[] {
  const seen = new Set<string>();
  return budgets.filter(budget => {
    const key = budgetKey(budget);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import { z } from "zod";

export const honorariumCategories = {
  finance: "Pengelola keuangan",
  procurement: "Pengadaan barang/jasa",
  ukpbj: "Perangkat UKPBJ",
  bmd_revenue: "Pengelola BMD menghasilkan pendapatan",
  bmd_non_revenue: "Pengelola BMD tidak menghasilkan pendapatan",
} as const;
const text = z.string().trim().max(5000, "Isian maksimal 5.000 karakter.");
const required = text.min(1, "Lengkapi isian wajib.");
const amount = z.number().finite().int("Gunakan nominal rupiah bulat.").min(0, "Nominal tidak boleh negatif.").max(1_000_000_000_000, "Nominal terlalu besar.");
export const honorariumSchema = z.object({
  category: z.enum(["finance", "procurement", "ukpbj", "bmd_revenue", "bmd_non_revenue"]),
  year: z.number().int().min(2000).max(2100),
  skNumber: text,
  skName: required,
  department: required,
  program: text,
  activity: text,
  subActivity: text,
  recipient: required,
  position: text,
  skPosition: required,
  recipientDepartment: required,
  echelon: text,
  budget: amount.nullable(),
  monthlyAmount: amount,
  months: z.number().int("Jumlah bulan harus bulat.").min(1, "Jumlah bulan minimal 1.").max(12, "Jumlah bulan maksimal 12 dalam satu tahun anggaran."),
  taxMode: z.enum(["amount", "percent"]),
  taxAmount: amount,
  taxRate: z.number().finite().min(0).max(100),
  notes: text,
}).superRefine((value, ctx) => {
  if (value.category !== "procurement" && !value.skNumber)
    ctx.addIssue({code: "custom", path: ["skNumber"], message: "Nomor SK wajib diisi."});
  if (value.category === "finance" && value.budget === null)
    ctx.addIssue({code: "custom", path: ["budget"], message: "Pagu dana yang dikelola wajib diisi."});
  if (value.taxMode === "amount" && value.taxAmount > value.monthlyAmount * value.months)
    ctx.addIssue({code: "custom", path: ["taxAmount"], message: "Pajak tidak boleh melebihi honor bruto."});
});
export type HonorariumInput = z.infer<typeof honorariumSchema>;
export type Honorarium = HonorariumInput & {
  id: string; version: number; createdAt: string; updatedAt: string; deletedAt: string | null;
};
export function honorariumTotals(value: Pick<HonorariumInput, "monthlyAmount" | "months" | "taxMode" | "taxRate" | "taxAmount">) {
  const gross = value.monthlyAmount * value.months;
  const tax = value.taxMode === "percent" ? Math.round(gross * value.taxRate / 100) : value.taxAmount;
  return { gross, tax, net: gross - tax };
}
export function newHonorarium(): HonorariumInput {
  return {category: "finance", year: new Date().getFullYear(), skNumber: "", skName: "", department: "Dinas ESDM Provinsi Jambi",
    program: "", activity: "", subActivity: "", recipient: "", position: "", skPosition: "", recipientDepartment: "Dinas ESDM Provinsi Jambi",
    echelon: "", budget: null, monthlyAmount: 0, months: 1, taxMode: "amount", taxAmount: 0, taxRate: 0, notes: ""};
}

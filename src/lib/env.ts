import { z } from "zod";

/** Aturan variabel lingkungan. Dicek sekali saat server mulai agar salah konfigurasi gagal cepat, bukan pada request pertama. */
const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "harus URL PostgreSQL, contoh postgresql://user:pass@host:5432/db" }),
  DATABASE_SCHEMA: z.string().regex(/^[a-z][a-z0-9_]*$/, "hanya huruf kecil, angka, dan garis bawah").optional(),
  DEMO_ENABLED: z.enum(["true", "false"], { error: "harus true atau false" }).optional(),
  ADMIN_EMAIL: z.email({ error: "harus alamat email" }).optional(),
  ADMIN_PASSWORD: z.string().min(8, "minimal 8 karakter").optional(),
  APP_ORIGIN: z.url({ protocol: /^https?$/, error: "harus URL http atau https" }).optional(),
});

/** Nilai kosong diperlakukan sama seperti tidak diset, karena .env.example memakai `NAMA=` untuk variabel opsional. */
type Env = Record<string, string | undefined>;
function present(env: Env) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
}

export function validateEnv(env: Env = process.env) {
  const result = envSchema.safeParse(present(env));
  if (result.success) return;
  const lines = result.error.issues.map(issue => `- ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Konfigurasi lingkungan tidak valid:\n${lines.join("\n")}`);
}

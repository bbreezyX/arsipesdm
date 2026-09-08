import { cookies } from "next/headers";
import { db, publicUser, sessionHash } from "./db";
import type { User } from "./model";
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get("archive-session")?.value;
  if (!token) return null;
  const row = db
    .prepare(
      "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
    )
    .get(sessionHash(token), Date.now());
  return row ? publicUser(row) : null;
}
export async function context() {
  const user = await currentUser();
  if (user) return { user, workspace: "office" };
  if ((await cookies()).has("archive-session")) throw new Error("UNAUTHORIZED");
  if (process.env.DEMO_ENABLED === "true")
    return {
      user: {
        id: "demo",
        name: "Operator contoh",
        email: "",
        role: "operator",
      } as User,
      workspace: "demo",
    };
  throw new Error("UNAUTHORIZED");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expected =
    process.env.APP_ORIGIN ||
    `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (origin && origin !== expected) throw new Error("FORBIDDEN");
}
export function apiError(e: unknown) {
  const message = e instanceof Error ? e.message : "";
  const known: Record<string, [number, string]> = {
    UNAUTHORIZED: [401, "Silakan masuk untuk membuka arsip kantor."],
    FORBIDDEN: [403, "Akses tidak diizinkan."],
    NOT_FOUND: [404, "Arsip tidak ditemukan."],
    CONFLICT: [
      409,
      "Arsip telah diperbarui operator lain. Tutup lalu buka kembali sebelum menyimpan.",
    ],
    DUPLICATE: [
      409,
      "Perjalanan yang sama sudah ada. Periksa daftar arsip sebelum menambahkan lagi.",
    ],
  };
  const [status, error] = known[message] ?? [
    400,
    message && message.length < 250
      ? message
      : "Permintaan tidak dapat diproses.",
  ];
  return Response.json({ error }, { status });
}

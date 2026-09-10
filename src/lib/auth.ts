import { cookies } from "next/headers";
import { db, publicUser, sessionHash, initializeDatabase } from "./db";
import type { User } from "./model";
import { isUserRole, requirePermission, type Permission } from "./permissions";
import { evaluateSession, shouldTouch, IDLE_LIMIT_MS, type SessionInfo } from "./session-policy";
export type CurrentSession = { user: User; session: SessionInfo };
/**
 * Membaca sesi dari cookie dan memeriksa batas tidak aktif serta batas absolut di server.
 * `touch` memperpanjang batas tidak aktif; pemeriksaan status murni memakai `touch: false`.
 */
export async function currentSession({ touch = true } = {}): Promise<CurrentSession | null> {
  await initializeDatabase();
  const token = (await cookies()).get("archive-session")?.value;
  if (!token) return null;
  const hash = sessionHash(token);
  const now = Date.now();
  const row = (await db
    .prepare(
      "SELECT pengguna.*, sesi_login.expires, sesi_login.last_activity FROM sesi_login JOIN pengguna ON pengguna.id=sesi_login.user_id WHERE token=?",
    )
    .get(hash)) as (Record<string, unknown> & { expires: number | string; last_activity: number | string | null }) | undefined;
  if (!row || !isUserRole(row.role)) return null;
  let session = evaluateSession(row, now);
  if (!session) return null;
  if (touch && shouldTouch(row, now)) {
    // Hanya memperpanjang sesi yang masih valid saat ditulis; request terlambat tidak menghidupkan sesi yang habis.
    const { changes } = await db
      .prepare("UPDATE sesi_login SET last_activity=? WHERE token=? AND expires>? AND last_activity IS NOT NULL AND last_activity+?>?")
      .run(now, hash, now, IDLE_LIMIT_MS, now);
    if (!changes) return null;
    session = { ...session, idleExpiresAt: Math.min(now + IDLE_LIMIT_MS, session.absoluteExpiresAt) };
  }
  return { user: publicUser(row), session };
}
export async function currentUser(): Promise<User | null> {
  return (await currentSession())?.user ?? null;
}
export async function context(permission: Permission = "archives:read") {
  const current = await currentSession();
  if (current) {
    requirePermission(current.user, permission);
    return { user: current.user, workspace: "office", session: current.session };
  }
  if ((await cookies()).has("archive-session")) throw new Error("UNAUTHORIZED");
  if (process.env.DEMO_ENABLED === "true") {
    const user: User = {
      id: "demo",
      name: "Operator contoh",
      email: "",
      role: "operator",
    };
    requirePermission(user, permission);
    return {
      user,
      workspace: "demo",
      session: null,
    };
  }
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

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db, verifyPassword, publicUser, sessionHash, initializeDatabase } from "@/lib/db";
import { checkOrigin, apiError, currentSession } from "@/lib/auth";
import { ABSOLUTE_LIMIT_MS, IDLE_LIMIT_MS } from "@/lib/session-policy";
const noStore = { headers: { "Cache-Control": "private, no-store" } };
/** Status sesi untuk peringatan di browser. Tidak memperpanjang batas tidak aktif. */
export async function GET() {
  try {
    const current = await currentSession({ touch: false });
    if (!current) throw new Error("UNAUTHORIZED");
    return Response.json(current.session, noStore);
  } catch (e) {
    return apiError(e);
  }
}
/** Tombol "Lanjutkan bekerja" dan aktivitas pengguna: memperpanjang batas tidak aktif jika sesi masih valid. */
export async function PATCH(req: Request) {
  try {
    checkOrigin(req);
    const current = await currentSession({ touch: true });
    if (!current) throw new Error("UNAUTHORIZED");
    return Response.json(current.session, noStore);
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    await initializeDatabase();
    const { email, password } = await req.json();
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 250 ||
      password.length > 256
    )
      throw new Error("Email atau kata sandi tidak valid.");
    const key = email.trim().toLowerCase();
    const attempt = (await db
      .prepare("SELECT * FROM percobaan_login WHERE key=?")
      .get(key)) as { count: number; expires: number } | undefined;
    if (attempt && attempt.expires > Date.now() && attempt.count >= 6)
      return Response.json(
        { error: "Terlalu banyak percobaan. Coba lagi dalam 10 menit." },
        { status: 429 },
      );
    const row = (await db.prepare("SELECT * FROM pengguna WHERE email=?").get(key)) as
      Record<string, unknown> | undefined;
    if (!row || !verifyPassword(password, String(row.password))) {
      (await db.prepare(
        "INSERT INTO percobaan_login VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN percobaan_login.expires>? THEN percobaan_login.count+1 ELSE 1 END,expires=excluded.expires",
      ).run(key, 1, Date.now() + 600000, Date.now()));
      return Response.json(
        { error: "Email atau kata sandi belum sesuai." },
        { status: 401 },
      );
    }
    (await db.prepare("DELETE FROM percobaan_login WHERE key=?").run(key));
    const now = Date.now();
    (await db
      .prepare("DELETE FROM sesi_login WHERE expires<? OR last_activity+?<?")
      .run(now, IDLE_LIMIT_MS, now));
    const token = randomBytes(32).toString("hex");
    (await db.prepare("INSERT INTO sesi_login(token,user_id,expires,last_activity) VALUES(?,?,?,?)").run(
      sessionHash(token),
      String(row.id),
      now + ABSOLUTE_LIMIT_MS,
      now,
    ));
    (await cookies()).set("archive-session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: Math.floor(ABSOLUTE_LIMIT_MS / 1000),
    });
    return Response.json(publicUser(row));
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    const jar = await cookies();
    const token = jar.get("archive-session")?.value;
    if (token)
      (await db.prepare("DELETE FROM sesi_login WHERE token=?").run(sessionHash(token)));
    jar.delete("archive-session");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

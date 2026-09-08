import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db, verifyPassword, publicUser, sessionHash } from "@/lib/db";
import { checkOrigin, apiError } from "@/lib/auth";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { email, password } = await req.json();
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 250 ||
      password.length > 256
    )
      throw new Error("Email atau kata sandi tidak valid.");
    const key = email.trim().toLowerCase();
    const attempt = db
      .prepare("SELECT * FROM attempts WHERE key=?")
      .get(key) as { count: number; expires: number } | undefined;
    if (attempt && attempt.expires > Date.now() && attempt.count >= 6)
      return Response.json(
        { error: "Terlalu banyak percobaan. Coba lagi dalam 10 menit." },
        { status: 429 },
      );
    const row = db.prepare("SELECT * FROM users WHERE email=?").get(key) as
      Record<string, unknown> | undefined;
    if (!row || !verifyPassword(password, String(row.password))) {
      db.prepare(
        "INSERT INTO attempts VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires>? THEN count+1 ELSE 1 END,expires=excluded.expires",
      ).run(key, 1, Date.now() + 600000, Date.now());
      return Response.json(
        { error: "Email atau kata sandi belum sesuai." },
        { status: 401 },
      );
    }
    db.prepare("DELETE FROM attempts WHERE key=?").run(key);
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      sessionHash(token),
      String(row.id),
      Date.now() + 86400000,
    );
    (await cookies()).set("archive-session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 86400,
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
      db.prepare("DELETE FROM sessions WHERE token=?").run(sessionHash(token));
    jar.delete("archive-session");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

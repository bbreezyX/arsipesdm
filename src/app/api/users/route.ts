import { context, checkOrigin, apiError } from "@/lib/auth";
import { db, hashPassword, publicUser } from "@/lib/db";
import { randomUUID } from "node:crypto";
export async function GET() {
  try {
    const c = await context();
    if (c.user.role !== "admin") throw new Error("FORBIDDEN");
    return Response.json(
      db.prepare("SELECT id,name,email,role FROM users").all().map(publicUser),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const c = await context();
    if (c.user.role !== "admin") throw new Error("FORBIDDEN");
    const { name, email, password } = await req.json();
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.length > 200 ||
      typeof email !== "string" ||
      email.length > 250 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 256
    )
      throw new Error(
        "Isi nama, email valid, dan kata sandi minimal 12 karakter.",
      );
    if (
      db.prepare("SELECT id FROM users WHERE email=?").get(email.toLowerCase())
    )
      throw new Error("Email sudah digunakan.");
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: email.toLowerCase(),
      role: "operator",
    };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
      user.id,
      user.name,
      user.email,
      hashPassword(password),
      "operator",
    );
    return Response.json(user, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

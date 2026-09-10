import { context, checkOrigin, apiError } from "@/lib/auth";
import { db, hashPassword, publicUser, transaction } from "@/lib/db";
import { randomUUID } from "node:crypto";
export async function GET() {
  try {
    await context("users:manage");
    return Response.json(
      (await db.prepare("SELECT id,name,email,role FROM pengguna").all()).map(publicUser),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    await context("users:manage");
    const { name, email, password, role = "viewer" } = await req.json();
    if (role !== "operator" && role !== "viewer")
      throw new Error("Pilih peran Operator atau Pembaca.");
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
      (await db.prepare("SELECT id FROM pengguna WHERE email=?").get(email.toLowerCase()))
    )
      throw new Error("Email sudah digunakan.");
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: email.toLowerCase(),
      role,
    };
    (await db.prepare("INSERT INTO pengguna(id,name,email,password,role) VALUES(?,?,?,?,?)").run(
      user.id,
      user.name,
      user.email,
      hashPassword(password),
      role,
    ));
    return Response.json(user, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

/** Only admins can switch non-admin accounts between Operator and Pembaca. */
export async function PATCH(req: Request) {
  try {
    checkOrigin(req);
    const c = await context("users:manage");
    const { id, role } = await req.json();
    if (typeof id !== "string" || !id || id.length > 200 || (role !== "operator" && role !== "viewer"))
      throw new Error("Pilih akun dan peran Operator atau Pembaca yang valid.");
    const user = await transaction(async () => {
      const existing = await db.prepare("SELECT id,name,email,role FROM pengguna WHERE id=?").get(id);
      if (!existing) throw new Error("NOT_FOUND");
      if (id === c.user.id || existing.role === "admin") throw new Error("FORBIDDEN");
      if (existing.role !== role) {
        await db.prepare("UPDATE pengguna SET role=? WHERE id=?").run(role, id);
        // Old browser sessions must re-authenticate with the new permissions and data projection.
        await db.prepare("DELETE FROM sesi_login WHERE user_id=?").run(id);
      }
      return publicUser({ ...existing, role });
    });
    return Response.json(user, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}

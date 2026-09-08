import { context, checkOrigin, apiError } from "@/lib/auth";
import { db } from "@/lib/db";
export async function PATCH(req: Request) {
  try {
    checkOrigin(req);
    const c = await context();
    if (c.user.role !== "admin") throw new Error("FORBIDDEN");
    const { departments } = await req.json();
    if (
      !Array.isArray(departments) ||
      departments.length < 1 ||
      departments.length > 100 ||
      departments.some(
        (d) => typeof d !== "string" || d.trim().length < 2 || d.length > 200,
      )
    )
      throw new Error("Daftar bidang tidak valid.");
    (await db.prepare(
      "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(
      "departments",
      JSON.stringify([...new Set(departments.map((d) => d.trim()))]),
    ));
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

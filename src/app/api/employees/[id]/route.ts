import { context, checkOrigin, apiError } from "@/lib/auth";
import { changeEmployee } from "@/lib/employee-db";
import { employeeSchema } from "@/lib/employees";
type RouteContext = {params: Promise<{id: string}>};
export const runtime = "nodejs";
export async function PATCH(req: Request, {params}: RouteContext) {
  try {
    checkOrigin(req);
    const c = await context();
    const {id} = await params;
    const body = await req.json();
    if (body.action !== undefined && body.action !== "restore") throw new Error("Tindakan pegawai tidak valid.");
    if (body.action !== "restore") {
      const parsed = employeeSchema.safeParse(body);
      if (!parsed.success) return Response.json({error: parsed.error.issues[0].message}, {status: 422});
    }
    return Response.json((await changeEmployee(c.workspace, id, body.version, body.action === "restore" ? "restore" : "edit", body)));
  } catch(e) { return apiError(e); }
}
export async function DELETE(req: Request, {params}: RouteContext) {
  try {
    checkOrigin(req);
    const c = await context();
    const {id} = await params;
    const body = await req.json();
    return Response.json((await changeEmployee(c.workspace, id, body.version, "delete")));
  } catch(e) { return apiError(e); }
}

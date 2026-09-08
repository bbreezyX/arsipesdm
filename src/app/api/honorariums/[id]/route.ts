import { apiError, checkOrigin, context } from "@/lib/auth";
import { changeHonorarium, getHonorarium } from "@/lib/honorarium-db";
import { honorariumSchema } from "@/lib/honorarium";
import { z } from "zod";
type RouteContext = {params: Promise<{id: string}>};
export const runtime = "nodejs";
export async function GET(_req: Request, {params}: RouteContext) {
  try { const c = await context(); return Response.json(getHonorarium(c.workspace, (await params).id), {headers: {"Cache-Control": "private, no-store"}}); }
  catch (e) { return apiError(e); }
}
export async function PATCH(req: Request, {params}: RouteContext) {
  try {
    checkOrigin(req); const c = await context(); const body = await req.json();
    const meta = z.object({version: z.number().int().positive(), action: z.literal("restore").optional()}).safeParse(body);
    if (!meta.success) return Response.json({error: "Versi atau tindakan honorarium tidak valid."}, {status: 422});
    if (!meta.data.action) {
      const input = honorariumSchema.safeParse(body);
      if (!input.success) return Response.json({error: input.error.issues[0].message}, {status: 422});
    }
    return Response.json(changeHonorarium(c.workspace, (await params).id, meta.data.version, meta.data.action === "restore" ? "restore" : "edit", body));
  } catch (e) { return apiError(e); }
}
export async function DELETE(req: Request, {params}: RouteContext) {
  try {
    checkOrigin(req); const c = await context();
    const body = z.object({version: z.number().int().positive()}).safeParse(await req.json());
    if (!body.success) return Response.json({error: "Versi honorarium tidak valid."}, {status: 422});
    return Response.json(changeHonorarium(c.workspace, (await params).id, body.data.version, "delete"));
  } catch (e) { return apiError(e); }
}

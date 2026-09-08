import { apiError, checkOrigin, context } from "@/lib/auth";
import { createHonorarium, getHonorariums } from "@/lib/honorarium-db";
import { honorariumSchema } from "@/lib/honorarium";
export const runtime = "nodejs";
export async function GET() {
  try { const c = await context(); return Response.json(getHonorariums(c.workspace), {headers: {"Cache-Control": "private, no-store"}}); }
  catch (e) { return apiError(e); }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req); const c = await context();
    const input = honorariumSchema.safeParse(await req.json());
    if (!input.success) return Response.json({error: input.error.issues[0].message}, {status: 422});
    return Response.json(createHonorarium(c.workspace, input.data), {status: 201});
  } catch (e) { return apiError(e); }
}

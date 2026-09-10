import { apiError, checkOrigin, context } from "@/lib/auth";
import { getVehicles, saveVehicle } from "@/lib/vehicle-db";
import { vehicleSchema } from "@/lib/vehicles";

export const runtime = "nodejs";

export async function GET() {
  try {
    const c = await context("vehicles:read");
    return Response.json(await getVehicles(c.workspace), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const c = await context("vehicles:write");
    const parsed = vehicleSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 422 });
    return Response.json(await saveVehicle(c.workspace, parsed.data));
  } catch (error) { return apiError(error); }
}

import { context, checkOrigin, apiError } from "@/lib/auth";
import { getTrips, newTrip, transaction } from "@/lib/db";
import { tripSchema } from "@/lib/model";
import { visibleTrips } from "@/lib/archive-access";
export const runtime = "nodejs";
export async function GET() {
  try {
    const c = await context("archives:read");
    return Response.json(visibleTrips(await getTrips(c.workspace), c.user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const c = await context("archives:write");
    const parsed = tripSchema.safeParse(await req.json());
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues[0].message },
        { status: 422 },
      );
    const trip = (await transaction(async () =>
      (await newTrip(parsed.data, c.workspace, c.user.name)),
    ));
    return Response.json(trip, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

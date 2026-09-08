import { context, checkOrigin, apiError } from "@/lib/auth";
import { getTrip, getTrips, putTrip, transaction, addEvent } from "@/lib/db";
import { tripSchema, fingerprint, isComplete } from "@/lib/model";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const c = await context();
    const { id } = await params;
    const trip = (await getTrip(id, c.workspace));
    if (!trip) throw new Error("NOT_FOUND");
    return Response.json(trip, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}

/** Deletion retains the archive and its documents for recovery from Sampah. */
export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    checkOrigin(req);
    const c = await context();
    const { id } = await params;
    const { version } = await req.json();
    const result = (await transaction(async () => {
      const trip = (await getTrip(id, c.workspace));
      if (!trip) throw new Error("NOT_FOUND");
      if (version !== trip.version) throw new Error("CONFLICT");
      if (trip.deletedAt) return trip;
      trip.deletedAt = new Date().toISOString();
      addEvent(trip, "Dipindahkan ke sampah", c.user.name);
      (await putTrip(trip, c.workspace));
      return trip;
    }));
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(req);
    const c = await context();
    const { id } = await params;
    const body = await req.json();
    const result = (await transaction(async () => {
      const t = (await getTrip(id, c.workspace));
      if (!t) throw new Error("NOT_FOUND");
      if (body.version !== t.version) throw new Error("CONFLICT");
      if (body.action === "trash" || body.action === "restore") {
        if (
          body.action === "restore" &&
          (await getTrips(c.workspace)).some(
            (x) =>
              x.id !== id && !x.deletedAt && fingerprint(x) === fingerprint(t),
          )
        )
          throw new Error("DUPLICATE");
        t.deletedAt = body.action === "trash" ? new Date().toISOString() : null;
        addEvent(
          t,
          body.action === "trash"
            ? "Dipindahkan ke sampah"
            : "Arsip dipulihkan",
          c.user.name,
        );
      } else {
        if (t.deletedAt)
          throw new Error("Arsip berada di sampah. Pulihkan terlebih dahulu.");
        const parsed = tripSchema.safeParse(body);
        if (!parsed.success) throw new Error(parsed.error.issues[0].message);
        const input = parsed.data;
        const wasComplete = isComplete(t);
        if (wasComplete && !input.correctionReason.trim())
          throw new Error("Tuliskan alasan perubahan untuk riwayat arsip.");
        if (
          (await getTrips(c.workspace)).some(
            (x) =>
              x.id !== id &&
              !x.deletedAt &&
              fingerprint(x) === fingerprint(input),
          )
        )
          throw new Error("DUPLICATE");
        Object.assign(t, input);
        addEvent(
          t,
          !isComplete(t)
            ? "Draft disimpan"
            : wasComplete
              ? "Arsip diperbarui"
              : "Arsip dilengkapi",
          c.user.name,
          input.correctionReason,
        );
      }
      (await putTrip(t, c.workspace));
      return t;
    }));
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}

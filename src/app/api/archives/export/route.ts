import { z } from "zod";
import { apiError, checkOrigin, context } from "@/lib/auth";
import { getTrips } from "@/lib/db";
import { createTripWorkbook, tripExportFilename } from "@/lib/export";

export const runtime = "nodejs";
const inputSchema = z.object({
  ids: z.array(z.string().min(1).max(200)).min(1).max(10000),
  label: z.string().max(40).regex(/^(?:contoh|semua-tahun|\d{4})$/),
});

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const c = await context("archives:export");
    const parsed = inputSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Pilihan arsip untuk ekspor tidak valid." }, { status: 422 });
    const available = new Map((await getTrips(c.workspace)).filter(trip => !trip.deletedAt).map(trip => [trip.id, trip]));
    const trips = [...new Set(parsed.data.ids)].map(id => {
      const trip = available.get(id);
      if (!trip) throw new Error("NOT_FOUND");
      return trip;
    });
    const book = await createTripWorkbook(trips);
    const filename = tripExportFilename(c.workspace === "demo" ? "contoh" : parsed.data.label);
    return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return apiError(error); }
}

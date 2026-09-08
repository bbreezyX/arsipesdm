import { context, checkOrigin, apiError } from "@/lib/auth";
import { transaction, newTrip, getTrips } from "@/lib/db";
import { tripSchema, fingerprint } from "@/lib/model";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const c = await context();
    const { rows } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000)
      throw new Error("Impor 1–1.000 perjalanan dalam satu proses.");
    const valid = rows.map((r, i) => {
      const p = tripSchema.safeParse(r.trip);
      if (!p.success)
        throw new Error(`Baris ${i + 1}: ${p.error.issues[0].message}`);
      return {
        trip: p.data,
        source:
          typeof r.source === "string" ? r.source.slice(0, 500) : "Impor Excel",
      };
    });
    const result = (await transaction(async () => {
      const fingerprints = new Set(
        (await getTrips(c.workspace))
          .filter((t) => !t.deletedAt)
          .map(fingerprint),
      );
      const added = [];
      let skipped = 0;
      for (const row of valid) {
        const key = fingerprint(row.trip);
        if (fingerprints.has(key)) {
          skipped++;
          continue;
        }
        added.push((await newTrip(row.trip, c.workspace, c.user.name, row.source)));
        fingerprints.add(key);
      }
      return { added, skipped };
    }));
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}

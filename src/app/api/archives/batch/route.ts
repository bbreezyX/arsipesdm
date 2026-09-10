import { context, checkOrigin, apiError } from "@/lib/auth";
import { batchRecapSchema } from "@/lib/batch-recap";
import { saveRecapBatch } from "@/lib/batch-recap-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const c = await context("archives:write");
    const parsed = batchRecapSchema.safeParse(await req.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return Response.json({ error: issue.message, index: issue.path[1] }, { status: 422 });
    }
    // The duplicate check and every write share one lock and one rollback boundary.
    const result = (await saveRecapBatch(parsed.data.trips, c.workspace, c.user.name));
    if ("duplicate" in result) return Response.json({
      error: `Rekap ${parsed.data.trips[result.duplicate!].participants[0].name} sudah ada. Tidak ada rekap baru yang disimpan. Hapus pilihan pegawai tersebut atau periksa daftar arsip.`,
      index: result.duplicate,
    }, { status: 409 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

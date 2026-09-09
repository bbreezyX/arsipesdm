import { context, checkOrigin, apiError } from "@/lib/auth";
import { getTrips, getTrip, putTrip, transaction, addEvent, db } from "@/lib/db";
import { docLabels } from "@/lib/model";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const c = await context();
    const { id } = await params;
    if (!/^[\da-f-]{36}$/.test(id)) throw new Error("NOT_FOUND");
    const doc = (await getTrips(c.workspace))
      .filter((t) => !t.deletedAt)
      .flatMap((t) => t.documents)
      .find((d) => d.id === id && d.kind === "file");
    if (!doc) throw new Error("NOT_FOUND");
    const attachment = await db.prepare("SELECT content FROM lampiran WHERE workspace=? AND id=?").get(c.workspace, id);
    if (!attachment) throw new Error("NOT_FOUND");
    const bytes = attachment.content as Buffer;
    const type =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : bytes[0] === 137
          ? "image/png"
          : "image/jpeg";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

/** Removes one photo, PDF, or physical note from its archive. The archive keeps a history entry. */
export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    checkOrigin(req);
    const c = await context();
    const { id } = await params;
    if (!/^[\da-f-]{36}$/.test(id)) throw new Error("NOT_FOUND");
    const { version } = await req.json();
    const result = await transaction(async () => {
      const owner = (await getTrips(c.workspace)).find(
        (t) => !t.deletedAt && t.documents.some((d) => d.id === id),
      );
      const t = owner ? await getTrip(owner.id, c.workspace) : null;
      if (!t || t.deletedAt) throw new Error("NOT_FOUND");
      if (t.version !== version) throw new Error("CONFLICT");
      const doc = t.documents.find((d) => d.id === id);
      if (!doc) throw new Error("NOT_FOUND");
      t.documents = t.documents.filter((d) => d.id !== id);
      if (doc.kind === "file")
        await db.prepare("DELETE FROM lampiran WHERE workspace=? AND id=?").run(c.workspace, id);
      addEvent(
        t,
        doc.kind === "physical" ? "Catatan berkas fisik dihapus" : "Dokumen dihapus",
        c.user.name,
        docLabels[doc.type] + ": " + (doc.kind === "physical" ? doc.location : doc.name),
      );
      await putTrip(t, c.workspace);
      return t;
    });
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}

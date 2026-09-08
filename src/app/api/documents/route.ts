import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { context, checkOrigin, apiError } from "@/lib/auth";
import { getTrip, putTrip, transaction, addEvent, DATA_DIR } from "@/lib/db";
import { docLabels, type DocumentItem } from "@/lib/model";
export async function POST(req: Request) {
  let stored: string | undefined;
  try {
    checkOrigin(req);
    const c = await context();
    if (Number(req.headers.get("content-length")) > 12 * 1024 * 1024)
      throw new Error("Ukuran dokumen maksimal 10 MB.");
    const form = await req.formData();
    const tripId = String(form.get("tripId"));
    const version = Number(form.get("version"));
    const type = String(form.get("type"));
    if (!docLabels[type]) throw new Error("Jenis dokumen tidak valid.");
    const id = randomUUID();
    let doc: DocumentItem;
    const physical = form.get("kind") === "physical";
    if (physical) {
      const location = String(form.get("location") || "").trim();
      if (!location || location.length > 500)
        throw new Error(
          "Tuliskan lokasi berkas fisik (maksimal 500 karakter).",
        );
      doc = {
        id,
        type,
        name: "Berkas fisik",
        kind: "physical",
        size: 0,
        location,
        createdAt: new Date().toISOString(),
      };
    } else {
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024)
        throw new Error("Pilih PDF, JPG, atau PNG maksimal 10 MB.");
      const buffer = Buffer.from(await file.arrayBuffer());
      const valid =
        buffer.subarray(0, 5).toString() === "%PDF-" ||
        (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ||
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!valid)
        throw new Error("Isi berkas harus berupa PDF, JPG, atau PNG.");
      const dir = path.join(DATA_DIR, "attachments", c.workspace);
      mkdirSync(dir, { recursive: true });
      stored = path.join(dir, id);
      writeFileSync(stored, buffer, { flag: "wx", mode: 0o600 });
      doc = {
        id,
        type,
        name: file.name.replace(/[\x00-\x1f]/g, "").slice(0, 200),
        kind: "file",
        size: file.size,
        location: "",
        createdAt: new Date().toISOString(),
      };
    }
    const result = transaction(() => {
      const t = getTrip(tripId, c.workspace);
      if (!t || t.deletedAt) throw new Error("NOT_FOUND");
      if (t.version !== version) throw new Error("CONFLICT");
      t.documents.push(doc);
      addEvent(
        t,
        physical ? "Berkas fisik dicatat" : "Dokumen diunggah",
        c.user.name,
        docLabels[type] + ": " + (physical ? doc.location : doc.name),
      );
      putTrip(t, c.workspace);
      return t;
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (stored)
      try {
        unlinkSync(stored);
      } catch {}
    return apiError(e);
  }
}

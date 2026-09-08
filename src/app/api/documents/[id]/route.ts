import { readFileSync } from "node:fs";
import path from "node:path";
import { context, apiError } from "@/lib/auth";
import { getTrips, DATA_DIR } from "@/lib/db";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const c = await context();
    const { id } = await params;
    if (!/^[\da-f-]{36}$/.test(id)) throw new Error("NOT_FOUND");
    const doc = getTrips(c.workspace)
      .filter((t) => !t.deletedAt)
      .flatMap((t) => t.documents)
      .find((d) => d.id === id && d.kind === "file");
    if (!doc) throw new Error("NOT_FOUND");
    const bytes = readFileSync(
      path.join(DATA_DIR, "attachments", c.workspace, id),
    );
    const type =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : bytes[0] === 137
          ? "image/png"
          : "image/jpeg";
    return new Response(bytes, {
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

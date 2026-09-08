import { db } from "@/lib/postgres";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.prepare("SELECT 1 AS ok").get();
    return Response.json({status: "ok", database: "postgresql"}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return Response.json({status: "unavailable"}, {status: 503});
  }
}

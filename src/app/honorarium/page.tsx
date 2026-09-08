import Workspace, { OfficeLogin } from "@/components/workspace";
import { context } from "@/lib/auth";
import { getTrips, getDepartments } from "@/lib/db";
import { getEmployees } from "@/lib/employee-db";
import { getHonorariums } from "@/lib/honorarium-db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function HonorariumPage() {
  try {
    const c = await context();
    return <Workspace initialSection="honorarium" initialHonorariums={getHonorariums(c.workspace)}
      initialTrips={getTrips(c.workspace)} initialEmployees={getEmployees(c.workspace)} departments={getDepartments()}
      user={c.user} demo={c.workspace === "demo"} />;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return <OfficeLogin />;
    throw error;
  }
}

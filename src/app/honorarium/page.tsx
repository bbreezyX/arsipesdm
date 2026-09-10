import Workspace, { OfficeLogin } from "@/components/workspace";
import { context } from "@/lib/auth";
import { getTrips, getDepartments } from "@/lib/db";
import { getEmployees } from "@/lib/employee-db";
import { getHonorariums } from "@/lib/honorarium-db";
import { parseEntryFilter } from "@/lib/model";
import { redirect } from "next/navigation";
import { sectionPaths } from "@/lib/workspace-navigation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = {title: "Honorarium | Dinas ESDM Jambi"};
export default async function HonorariumPage({ searchParams }: { searchParams: Promise<{ entry?: string | string[] }> }) {
  const initialEntry = parseEntryFilter((await searchParams).entry);
  try {
    const c = await context("honorariums:read");
    return <Workspace initialSection="honorarium" initialHonorariums={(await getHonorariums(c.workspace))}
      initialTrips={(await getTrips(c.workspace))} initialEmployees={(await getEmployees(c.workspace))} departments={(await getDepartments())}
      user={c.user} demo={c.workspace === "demo"} session={c.session} initialEntry={initialEntry} initialNow={new Date().toISOString()} />;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return <OfficeLogin />;
    if (error instanceof Error && error.message === "FORBIDDEN") redirect(sectionPaths.home);
    throw error;
  }
}

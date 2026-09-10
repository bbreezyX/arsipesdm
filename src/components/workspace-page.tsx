import { getEmployees } from "@/lib/employee-db";
import { context } from "@/lib/auth";
import { getTrips, getDepartments } from "@/lib/db";
import { getHonorariums } from "@/lib/honorarium-db";
import Workspace, { OfficeLogin, type Section } from "@/components/workspace";
import { can, canAccessSection } from "@/lib/permissions";
import { visibleTrips } from "@/lib/archive-access";
import { redirect } from "next/navigation";
import { sectionPaths } from "@/lib/workspace-navigation";
export default async function WorkspacePage({ initialSection = "archives" }: { initialSection?: Section }) {
  try {
    const c = await context();
    if (!canAccessSection(c.user, initialSection)) redirect(sectionPaths.home);
    const [trips, employees, honorariums, departments] = await Promise.all([
      getTrips(c.workspace),
      can(c.user, "employees:read") ? getEmployees(c.workspace) : [],
      can(c.user, "honorariums:read") ? getHonorariums(c.workspace) : [],
      can(c.user, "archives:write") ? getDepartments() : [],
    ]);
    return (
      <Workspace
        initialSection={initialSection}
        initialTrips={visibleTrips(trips, c.user)}
        initialEmployees={employees}
        initialHonorariums={honorariums}
        departments={departments}
        initialNow={new Date().toISOString()}
        user={c.user}
        demo={c.workspace === "demo"}
        session={c.session}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return <OfficeLogin />;
    }
    throw error;
  }
}

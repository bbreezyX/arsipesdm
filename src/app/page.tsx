import { getEmployees } from "@/lib/employee-db";
import { context } from "@/lib/auth";
import { getTrips, getDepartments } from "@/lib/db";
import Workspace, { OfficeLogin, type Section } from "@/components/workspace";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page({searchParams}: {searchParams: Promise<{section?: string}>}) {
  const requestedSection = (await searchParams).section;
  const initialSection: Section = requestedSection && ["taskLetters", "reports", "documents", "people", "settings", "trash"].includes(requestedSection) ? requestedSection as Section : "archives";
  try {
    const c = await context();
    return (
      <Workspace
        initialSection={initialSection}
        initialTrips={(await getTrips(c.workspace))}
        initialEmployees={(await getEmployees(c.workspace))}
        departments={(await getDepartments())}
        user={c.user}
        demo={c.workspace === "demo"}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return <OfficeLogin />;
    }
    throw error;
  }
}

import { redirect } from "next/navigation";
import WorkspacePage from "@/components/workspace-page";
import { sectionPaths, isSection } from "@/lib/workspace-navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  if (section) redirect(isSection(section) ? sectionPaths[section] : "/");
  return <WorkspacePage />;
}

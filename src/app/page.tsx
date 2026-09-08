import { redirect } from "next/navigation";
import { sectionPaths, isSection } from "@/lib/workspace-navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  const { section } = await searchParams;
  redirect(typeof section === "string" && isSection(section) ? sectionPaths[section] : sectionPaths.archives);
}

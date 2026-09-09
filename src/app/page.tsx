import { redirect } from "next/navigation";
import WorkspacePage from "@/components/workspace-page";
import { sectionPaths, isSection } from "@/lib/workspace-navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Beranda | Dinas ESDM Jambi" };

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  const { section } = await searchParams;
  if (typeof section === "string" && isSection(section) && section !== "home") redirect(sectionPaths[section]);
  return <WorkspacePage initialSection="home" />;
}

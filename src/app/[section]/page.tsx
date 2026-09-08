import { notFound, redirect } from "next/navigation";
import WorkspacePage from "@/components/workspace-page";
import { sectionFromPath, legacySectionFromPath, sectionPaths } from "@/lib/workspace-navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: slug } = await params;
  const legacy = legacySectionFromPath(`/${slug}`);
  if (legacy) redirect(sectionPaths[legacy]);
  const section = sectionFromPath(`/${slug}`);
  if (!section || section === "honorarium") notFound();
  return <WorkspacePage initialSection={section} />;
}

import { notFound } from "next/navigation";
import WorkspacePage from "@/components/workspace-page";
import { sectionPaths } from "@/lib/workspace-navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Rincian satu rekap: /arsip-perjalanan/PD-2026-0062. Ruang kerja membaca kodenya dari alamat. */
export default async function ArchiveRecordPage({ params }: { params: Promise<{ section: string; record: string }> }) {
  const { section } = await params;
  if (`/${section}` !== sectionPaths.archives) notFound();
  return <WorkspacePage initialSection="archives" />;
}

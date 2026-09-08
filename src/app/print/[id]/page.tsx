import { redirect } from "next/navigation";

export default async function PrintRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/cetak/${encodeURIComponent(id)}`);
}

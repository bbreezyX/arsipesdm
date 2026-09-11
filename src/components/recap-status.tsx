import { Check, Circle, FileText, GitCompareArrows } from "lucide-react";
import type { RecapTone } from "@/lib/recap-visual-state";

export function RecapStatus({ tone, children, description, className = "" }: {
  tone: RecapTone; children: React.ReactNode; description?: string; className?: string;
}) {
  const Icon = tone === "filled" ? Check : tone === "details" ? FileText : tone === "different" ? GitCompareArrows : Circle;
  return <span className={`recap-status ${className}`} data-tone={tone} title={description}><Icon size={11} aria-hidden="true" />{children}</span>;
}

export function RecapStatusLegend() {
  return <div className="recap-status-legend" role="group" aria-label="Arti penanda isian">
    <RecapStatus tone="filled">Nominal dicatat</RecapStatus>
    <RecapStatus tone="details">Ada rincian</RecapStatus>
    <RecapStatus tone="different">Berbeda / perlu diperiksa</RecapStatus>
  </div>;
}

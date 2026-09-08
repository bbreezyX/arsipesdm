"use client";

import { flightSchema, type Lampiran6 } from "@/lib/lampiran6-schema";
import { evidenceVisualState, hasRecapDetail, recapSectionStates } from "@/lib/recap-visual-state";
import { money } from "@/lib/model";
import { EvidenceBlock, FlightFields, NumberField } from "./lampiran6-form";
import { RecapStatus } from "./recap-status";
import { Button } from "./ui/button";

export default function FlightCostFields({ data, onChange }: { data: Lampiran6; onChange: (changes: Partial<Lampiran6>) => void }) {
  const tickets = [data.outbound, data.inbound].filter(hasRecapDetail);
  const ticketTotal = tickets.length && tickets.every(ticket => ticket.price !== null)
    ? tickets.reduce((sum, ticket) => sum + ticket.price!, 0) : null;
  const status = recapSectionStates(data).flight;
  return <section className="recap-cost-section">
    <div className="cost-detail-heading"><div><h4>Penerbangan pergi & pulang</h4><p>Catat tiket masing-masing pegawai sesuai bukti pemesanan.</p></div></div>
    <div className="recap-cost-section-body">
      <NumberField label="Biaya transport udara pegawai (Rp)" value={data.airCost} onChange={airCost => onChange({ airCost })} />
      <p className="field-hint">Nominal ini masuk total pegawai. Rincian tiket menjadi bukti pendukung. Untuk perjalanan satu arah, biarkan tiket pulang kosong.</p>
      <div className="recap-detail-status" data-recap-tone={status.tone}><RecapStatus tone={status.tone}>{status.label}</RecapStatus><span>{status.description}</span></div>
      {(["outbound", "inbound"] as const).map(key => {
        const ticket = data[key];
        const visual = evidenceVisualState(ticket, ticket.price);
        const direction = key === "outbound" ? "pergi" : "pulang";
        return <div key={key} className="recap-evidence-status" data-recap-tone={visual.tone}>
          <EvidenceBlock title={`Tiket ${direction}`} status={<RecapStatus tone={visual.tone}>{visual.label}</RecapStatus>} onRemove={() => onChange({ [key]: flightSchema.parse({}) })}>
            <FlightFields direction={direction} value={ticket} onChange={changes => onChange({ [key]: { ...ticket, ...changes } })} />
          </EvidenceBlock>
        </div>;
      })}
      <div className="recap-evidence-actions"><Button type="button" variant="outline" size="sm" disabled={ticketTotal === null} onClick={() => { if (ticketTotal !== null) onChange({ airCost: ticketTotal }); }}>Gunakan jumlah tiket{ticketTotal === null ? "" : `: ${money(ticketTotal)}`}</Button></div>
      <p className="field-hint">Lengkapi harga setiap tiket yang diisi, lalu gunakan jumlah tiket untuk mengganti biaya udara. Untuk tiket transit, cantumkan rute lengkap dan total satu pemesanan pada arah terkait.</p>
    </div>
  </section>;
}

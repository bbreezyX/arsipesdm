"use client";

import { lampiranCostFields, type Lampiran6 } from "@/lib/lampiran6-schema";
import { flightHasDetail, flightRoute } from "@/lib/flight-legs";
import { recapSectionStates } from "@/lib/recap-visual-state";
import { money } from "@/lib/model";
import { RecapStatus } from "./recap-status";

/** The running ledger of one employee's recap: every component, the evidence behind it, and the total. */
export default function RecapLedger({ data, total, facts = [] }: { data: Lampiran6; total: number | null; facts?: Array<[string, string]> }) {
  const states = recapSectionStates(data);
  const flights = ([["Pergi", data.outbound], ["Pulang", data.inbound]] as const).filter(([, flight]) => flightHasDetail(flight));
  const evidence = [
    { key: "hotel", label: "Penginapan", state: states.hotel, note: data.lodgingMode === "thirty-percent" ? "" : data.lodgings.length ? `${data.lodgings.length} hotel` : "" },
    { key: "vehicle", label: "Kendaraan / BBM", state: states.vehicle, note: data.groundTransports.length ? `${data.groundTransports.length} kendaraan` : "" },
    { key: "flight", label: "Penerbangan", state: states.flight, note: flights.map(([label, flight]) => `${label}: ${flightRoute(flight) || "rute belum diisi"}${flight.transits.length ? ` (${flight.transits.length} transit)` : ""}${flight.price !== null ? ` · ${money(flight.price)}` : ""}`).join(" · ") },
  ];
  return <section className="form-section recap-ledger" aria-label="Ringkasan rekap pegawai">
    <div className="recap-ledger-head"><h3>Ringkasan rekap</h3><p className="section-note">Periksa komponen yang masuk total dan bukti pendukung di baliknya sebelum menyimpan.</p></div>
    {facts.length > 0 && <dl className="recap-ledger-facts">
      {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || <span className="rincian-empty">Belum dicatat</span>}</dd></div>)}
    </dl>}
    <h4 className="recap-ledger-title">Komponen biaya</h4>
    <dl className="recap-ledger-rows">
      {lampiranCostFields.map(([key, , label]) => <div key={key} data-empty={data[key] === null || undefined}>
        <dt>{label}</dt><dd>{data[key] === null ? "Belum dicatat" : money(data[key])}</dd>
      </div>)}
      {data.additionalCosts.map((cost, index) => <div key={`extra-${index}`} data-empty={cost.amount === null || undefined}>
        <dt>{cost.label || "Biaya tambahan"}<small>{cost.category}</small></dt><dd>{cost.amount === null ? "Belum dicatat" : money(cost.amount)}</dd>
      </div>)}
    </dl>
    <div className="cost-total"><span>Total biaya pegawai</span><strong>{money(total)}</strong></div>
    <h4 className="recap-ledger-title">Bukti pendukung</h4>
    <ul className="recap-ledger-evidence">
      {evidence.map(item => <li key={item.key} data-recap-tone={item.state.tone}>
        <span>{item.label}</span>
        <RecapStatus tone={item.state.tone} description={item.state.description}>{item.state.label}</RecapStatus>
        {item.note && <small>{item.note}</small>}
      </li>)}
    </ul>
  </section>;
}

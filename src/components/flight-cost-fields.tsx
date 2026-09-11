"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { flightSchema, type Flight, type FlightLeg, type Lampiran6 } from "@/lib/lampiran6-schema";
import { flightHasDetail, flightLegs, flightRoute, nextTransitLeg, reversedFlightLegs, withFlightLegs } from "@/lib/flight-legs";
import { evidenceVisualState, recapSectionStates } from "@/lib/recap-visual-state";
import { money } from "@/lib/model";
import ArchiveDateInput from "./archive-date-input";
import { Field } from "./fields";
import { NumberField } from "./lampiran6-form";
import { RecapStatus } from "./recap-status";
import { Button } from "./ui/button";
import { useRowKeys } from "./use-row-keys";

type Direction = "outbound" | "inbound";
const directions = [["outbound", "pergi"], ["inbound", "pulang"]] as const;
const maxLegs = 6;

const legTitle = (index: number) => index === 0 ? "Penerbangan" : `Transit ${index}`;
const legRoute = (leg: FlightLeg) => leg.origin || leg.destination ? `${leg.origin || "…"} → ${leg.destination || "…"}` : "Rute belum diisi";

/** One flight of the itinerary: where it leaves, where it lands, and the references printed on that ticket. */
function LegFields({ leg, index, removable, onChange, onRemove }: {
  leg: FlightLeg; index: number; removable: boolean; onChange: (changes: Partial<FlightLeg>) => void; onRemove: () => void;
}) {
  return <div className="flight-leg">
    <span className="flight-leg-no" aria-hidden="true">{index + 1}</span>
    <div className="flight-leg-head">
      <div className="flight-leg-title"><strong>{legTitle(index)}</strong><span>{legRoute(leg)}</span></div>
      {removable && <Button type="button" size="icon-sm" variant="ghost" onClick={onRemove} aria-label={`Hapus ${legTitle(index).toLowerCase()}`}><Trash2 size={15} /></Button>}
    </div>
    <div className="form-grid flight-leg-grid">
      <Field label="Kota asal"><input value={leg.origin} maxLength={1000} onChange={e => onChange({ origin: e.target.value })} /></Field>
      <Field label="Kota tujuan"><input value={leg.destination} maxLength={1000} onChange={e => onChange({ destination: e.target.value })} /></Field>
      <Field label="Maskapai"><input value={leg.airline} maxLength={1000} onChange={e => onChange({ airline: e.target.value })} /></Field>
      <Field label="Tanggal penerbangan"><ArchiveDateInput value={leg.date} onChange={date => onChange({ date })} /></Field>
      <Field label="Kode booking"><input value={leg.bookingCode} maxLength={1000} onChange={e => onChange({ bookingCode: e.target.value })} /></Field>
      <Field label="Nomor tiket"><input value={leg.ticketNo} maxLength={1000} onChange={e => onChange({ ticketNo: e.target.value })} /></Field>
    </div>
  </div>;
}

/** One direction: the legs flown in order, then the booking that paid for all of them. */
function DirectionPane({ flight, other, direction, label, onChange }: {
  flight: Flight; other: Flight; direction: Direction; label: string; onChange: (flight: Flight) => void;
}) {
  const legs = flightLegs(flight);
  const rows = useRowKeys(legs.length);
  const setLegs = (next: FlightLeg[]) => onChange(withFlightLegs(flight, next));
  const canMirror = direction === "inbound" && !flightHasDetail(flight) && flightHasDetail(other);
  return <div className="flight-pane" role="tabpanel" id={`flight-pane-${direction}`} aria-labelledby={`flight-tab-${direction}`}>
    <div className="flight-legs">
      {legs.map((leg, index) => <LegFields key={rows.keys[index]} leg={leg} index={index} removable={legs.length > 1}
        onChange={changes => setLegs(legs.map((item, current) => current === index ? { ...item, ...changes } : item))}
        onRemove={() => { rows.remove(index); setLegs(legs.filter((_, current) => current !== index)); }} />)}
      <div className="flight-leg-actions">
        <Button type="button" variant="outline" size="sm" disabled={legs.length >= maxLegs} onClick={() => setLegs([...legs, nextTransitLeg(flight)])}><Plus size={14} />Tambah transit</Button>
        {canMirror && <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...withFlightLegs(flight, reversedFlightLegs(other)), application: other.application })}><ArrowLeftRight size={14} />Salin rute pergi (dibalik)</Button>}
      </div>
      {legs.length >= maxLegs && <p className="field-hint">Maksimal {maxLegs} penerbangan per arah.</p>}
    </div>
    <div className="flight-booking">
      <h5>Pemesanan tiket {label}</h5>
      <div className="form-grid">
        <Field label="Aplikasi / tempat pemesanan"><input value={flight.application} maxLength={1000} onChange={e => onChange({ ...flight, application: e.target.value })} /></Field>
        <Field label="Order ID / PO"><input value={flight.orderId} maxLength={1000} onChange={e => onChange({ ...flight, orderId: e.target.value })} /></Field>
        <NumberField label={`Harga tiket ${label} (Rp)`} value={flight.price} onChange={price => onChange({ ...flight, price })}
          hint={legs.length > 1 ? "Total satu pemesanan untuk seluruh penerbangan arah ini." : undefined} />
      </div>
      {flightHasDetail(flight) && <div className="recap-evidence-actions">
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(flightSchema.parse({}))}><Trash2 size={15} /> Kosongkan tiket {label}</Button>
      </div>}
    </div>
  </div>;
}

export default function FlightCostFields({ data, onChange }: { data: Lampiran6; onChange: (changes: Partial<Lampiran6>) => void }) {
  const [active, setActive] = useState<Direction>(() => !flightHasDetail(data.outbound) && flightHasDetail(data.inbound) ? "inbound" : "outbound");
  const tickets = [data.outbound, data.inbound].filter(flightHasDetail);
  const ticketTotal = tickets.length && tickets.every(ticket => ticket.price !== null)
    ? tickets.reduce((sum, ticket) => sum + ticket.price!, 0) : null;
  const status = recapSectionStates(data).flight;
  const activeLabel = directions.find(([key]) => key === active)![1];
  return <section className="recap-cost-section">
    <div className="cost-detail-heading"><div><h4>Penerbangan pergi & pulang</h4><p>Catat tiket sesuai bukti pemesanan. Penerbangan transit dicatat sebagai beberapa penerbangan dalam satu arah.</p></div></div>
    <div className="recap-cost-section-body">
      <NumberField label="Biaya transport udara pegawai (Rp)" value={data.airCost} onChange={airCost => onChange({ airCost })} />
      <p className="field-hint">Nominal ini masuk total pegawai. Rincian tiket di bawah menjadi bukti pendukung. Untuk perjalanan satu arah, biarkan tiket pulang kosong.</p>
      <div className="recap-detail-status" data-recap-tone={status.tone}><RecapStatus tone={status.tone}>{status.label}</RecapStatus><span>{status.description}</span></div>
      <div className="flight-directions" role="tablist" aria-label="Arah penerbangan">
        {directions.map(([key, label]) => {
          const flight = data[key];
          const visual = evidenceVisualState(flight, flight.price);
          const transits = flight.transits.length;
          const route = flightRoute(flight);
          return <button key={key} type="button" role="tab" id={`flight-tab-${key}`} aria-selected={active === key} aria-controls={`flight-pane-${key}`}
            className="flight-direction" data-recap-tone={visual.tone} onClick={() => setActive(key)}>
            <span className="flight-direction-label">Tiket {label}</span>
            <span className="flight-direction-route">{route || "Belum ada rute"}</span>
            <span className="flight-direction-meta">
              <RecapStatus tone={visual.tone}>{visual.label}</RecapStatus>
              {transits > 0 && <span>{transits} transit</span>}
              {flight.price !== null && <span>{money(flight.price)}</span>}
            </span>
          </button>;
        })}
      </div>
      <DirectionPane key={active} direction={active} label={activeLabel} flight={data[active]} other={data[active === "outbound" ? "inbound" : "outbound"]}
        onChange={flight => onChange({ [active]: flight })} />
      <div className="recap-evidence-actions"><Button type="button" variant="outline" size="sm" disabled={ticketTotal === null} onClick={() => { if (ticketTotal !== null) onChange({ airCost: ticketTotal }); }}>Gunakan jumlah tiket{ticketTotal === null ? "" : `: ${money(ticketTotal)}`}</Button></div>
      <p className="field-hint">Lengkapi harga tiket pergi dan pulang, lalu gunakan jumlah tiket untuk mengganti biaya transport udara.</p>
    </div>
  </section>;
}

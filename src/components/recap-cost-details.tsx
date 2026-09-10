"use client";

import FlightCostFields from "./flight-cost-fields";
import { Plus } from "lucide-react";
import { groundTransportSchema, lodgingSchema, type Lampiran6 } from "@/lib/lampiran6-schema";
import { money } from "@/lib/model";
import AdditionalCostFields from "./additional-cost-fields";
import { EvidenceBlock, GroundFields, LodgingFields, NumberField } from "./lampiran6-form";
import { Button } from "./ui/button";
import { evidenceVisualState, recapSectionStates } from "@/lib/recap-visual-state";
import { RecapStatus } from "./recap-status";
import LodgingAllowanceFields from "./lodging-allowance-fields";

function evidenceTotal(items: Array<Lampiran6["lodgings"][number] | Lampiran6["groundTransports"][number]>) {
  const filled = items.filter(item => Object.values(item).some(value => value !== "" && value !== null));
  return filled.length && filled.every(item => item.total !== null)
    ? filled.reduce((sum, item) => sum + item.total!, 0)
    : null;
}

export default function RecapCostDetails({ data, personName, section, onChange }: {
  data: Lampiran6;
  personName: string;
  section: "hotel" | "vehicle" | "flight" | "additional";
  onChange: (changes: Partial<Lampiran6>) => void;
}) {
  const hotelTotal = evidenceTotal(data.lodgings);
  const percentageLodging = data.lodgingMode === "thirty-percent";
  const vehicleTotal = evidenceTotal(data.groundTransports);
  const status = recapSectionStates(data)[section];
  return <div className="recap-cost-details">
    {section !== "flight" && <div className="recap-detail-status" data-recap-tone={status.tone}><RecapStatus tone={status.tone}>{status.label}</RecapStatus><span>{status.description}</span></div>}
    {section === "flight" && <FlightCostFields data={data} onChange={onChange} />}
    {section === "hotel" && <section className="recap-cost-section">
      <div className="cost-detail-heading"><div><h4>Penginapan</h4><p>Pilih nominal sesuai bukti atau perhitungan penginapan 30% untuk pegawai ini.</p></div>
        {!percentageLodging && <Button type="button" variant="outline" size="sm" disabled={data.lodgings.length >= 30} onClick={() => onChange({ lodgings: [...data.lodgings, lodgingSchema.parse({})] })}><Plus size={14} />Tambah hotel</Button>}
      </div>
      <div className="recap-cost-section-body">
        <LodgingAllowanceFields data={data} onChange={onChange} />
        <NumberField label="Biaya penginapan pegawai (Rp)" readOnly={percentageLodging} value={data.lodgingCost} onChange={lodgingCost => onChange({ lodgingCost })} />
        {percentageLodging && <p className="field-hint">Total 30% otomatis masuk ke komponen Penginapan pegawai ini.</p>}
        {!percentageLodging && <>
        <p className="field-hint">Masuk ke kolom Penginapan dan total pegawai. Rincian hotel di bawah menjadi bukti pendukung.</p>
        {data.lodgings.length === 0 && <div className="cost-evidence-empty">Belum ada rincian hotel. Nominal penginapan boleh diisi lebih dulu.</div>}
        {data.lodgings.map((hotel, index) => { const visual = evidenceVisualState(hotel, hotel.total); return <div key={index} className="recap-evidence-status" data-recap-tone={visual.tone}><EvidenceBlock title={`Penginapan ${index + 1}`} status={<RecapStatus tone={visual.tone} description={visual.description}>{visual.label}</RecapStatus>} onRemove={() => onChange({ lodgings: data.lodgings.filter((_, current) => current !== index) })}>
          <LodgingFields value={hotel} onChange={changes => onChange({ lodgings: data.lodgings.map((item, current) => current === index ? { ...item, ...changes } : item) })} />
        </EvidenceBlock></div>; })}
        <div className="recap-evidence-actions">
          {hotelTotal !== null && <Button type="button" variant="outline" size="sm" onClick={() => onChange({ lodgingCost: hotelTotal })}>Gunakan jumlah bukti: {money(hotelTotal)}</Button>}
        </div>
        {hotelTotal !== null && <p className="field-hint">Gunakan jumlah bukti untuk mengganti nominal pada kolom Penginapan.</p>}
        </>}
      </div>
    </section>}
    {section === "vehicle" && <section className="recap-cost-section">
      <div className="cost-detail-heading"><div><h4>Kendaraan & BBM</h4><p>Isi kendaraan dan pembelian BBM yang dibebankan kepada pegawai ini.</p></div>
        <Button type="button" variant="outline" size="sm" disabled={data.groundTransports.length >= 30} onClick={() => onChange({ groundTransports: [...data.groundTransports, groundTransportSchema.parse({})] })}><Plus size={14} />Tambah kendaraan</Button>
      </div>
      <div className="recap-cost-section-body">
        <NumberField label="Biaya transport darat pegawai (Rp)" value={data.landCost} onChange={landCost => onChange({ landCost })} />
        <p className="field-hint">Masuk ke kolom Darat dan total pegawai. BBM yang sudah termasuk di sini tidak perlu dicatat lagi sebagai biaya tambahan.</p>
        {data.groundTransports.length === 0 && <div className="cost-evidence-empty">Belum ada rincian kendaraan. Tambahkan jika pegawai ini menanggung biaya kendaraan atau BBM.</div>}
        {data.groundTransports.map((vehicle, index) => { const visual = evidenceVisualState(vehicle, vehicle.total); return <div key={index} className="recap-evidence-status" data-recap-tone={visual.tone}><EvidenceBlock title={`Kendaraan ${index + 1}`} status={<RecapStatus tone={visual.tone} description={visual.description}>{visual.label}</RecapStatus>} onRemove={() => onChange({ groundTransports: data.groundTransports.filter((_, current) => current !== index) })}>
          <GroundFields value={vehicle} onChange={changes => onChange({ groundTransports: data.groundTransports.map((item, current) => current === index ? { ...item, ...changes } : item) })} />
        </EvidenceBlock></div>; })}
        <div className="recap-evidence-actions">
          {vehicleTotal !== null && <Button type="button" variant="outline" size="sm" onClick={() => onChange({ landCost: vehicleTotal })}>Gunakan jumlah bukti: {money(vehicleTotal)}</Button>}
        </div>
        {vehicleTotal !== null && <p className="field-hint">Gunakan jumlah bukti untuk mengganti nominal pada kolom Darat.</p>}
      </div>
    </section>}
    {section === "additional" && <section className="recap-cost-section">
      <div className="cost-detail-heading"><div><h4>Biaya tambahan</h4><p>Rincian terpisah untuk tol, parkir, atau pengeluaran lainnya.</p></div></div>
      <div className="recap-cost-section-body">
        <AdditionalCostFields highlightStatus value={data.additionalCosts} personName={personName} onChange={additionalCosts => onChange({ additionalCosts })} />
      </div>
    </section>}
  </div>;
}

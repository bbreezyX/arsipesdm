import { context } from "@/lib/auth";
import { getTrip } from "@/lib/db";
import { notFound } from "next/navigation";
import {
  dateText,
  totalCost,
  money,
  docLabels,
  paymentLabel,
} from "@/lib/model";
import PrintButton from "./print-button";
import Lampiran6Summary from "@/components/lampiran6-summary";
export const dynamic = "force-dynamic";
export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const c = await context();
  const { id } = await params;
  const t = (await getTrip(id, c.workspace));
  if (!t || t.deletedAt) notFound();
  return (
    <main
      style={{
        maxWidth: 850,
        fontSize: "11pt",
        lineHeight: 1.5,
        margin: "30px auto",
        padding: 32,
        background: "white",
      }}
    >
      <div className="print-controls" style={{ marginBottom: 25 }}>
        <PrintButton />
      </div>
      <img
        src="/logo-esdm-jambi.png"
        alt="Dinas ESDM Provinsi Jambi"
        width={371}
        height={57}
      />
      <div
        style={{
          borderTop: "2px solid #273c52",
          marginTop: 20,
          paddingTop: 20,
        }}
      >
        <h1 style={{ fontSize: "16pt" }}>Ringkasan arsip perjalanan dinas</h1>
        <p style={{ marginTop: 8, color: "#778899" }}>
          {t.code}
          {c.workspace === "demo" ? " • DATA CONTOH — FIKTIF" : ""}
        </p>
      </div>
      <h2 style={{ fontSize: "14pt", marginTop: 25 }}>{t.title}</h2>
      <dl className="metadata-list" style={{ marginTop: 16 }}>
        {[
          ["Tujuan", t.destination],
          ["Bidang", t.department],
          ["Pelaksanaan", `${dateText(t.startDate)} – ${dateText(t.endDate)}`],
          ["Nomor SPT", t.sptNo || "Belum dicatat"],
          ["Nomor SPPD", t.sppdNo || "Belum dicatat"],
          [
            t.lampiran6 ? "Pegawai" : "Peserta",
            t.participants
              .map((p) => p.name + (p.nip ? ` (${p.nip})` : ""))
              .join("; "),
          ],
          ["Kegiatan", t.activity || "Belum dicatat"],
          ["Lokasi arsip", t.physicalLocation || "Belum dicatat"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {t.lampiran6 && (
        <p className="field-hint">
          Rekap ini mencatat perjalanan dan biaya pegawai di atas. Pegawai lain pada perjalanan yang sama dicatat dalam rekap terpisah.
        </p>
      )}
      <h3 style={{ margin: "25px 0 14px" }}>Biaya realisasi</h3>
      <table className="report-table" style={{ minWidth: 0 }}>
        <thead>
          <tr>
            <th>Komponen</th>
            <th>Keterangan</th>
            <th style={{ textAlign: "right" }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {t.costs.map((c) => (
            <tr key={c.id}>
              <td>{c.category}</td>
              <td>{c.label}</td>
              <td style={{ textAlign: "right" }}>{money(c.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cost-total">
        <span>Total realisasi</span>
        <strong>{money(totalCost(t))}</strong>
      </div>
      <p style={{ marginTop: 12 }}>
        Sudah dibayar: {money(t.paid)} · {paymentLabel(t)}
      </p>
      {t.lampiran6 && <Lampiran6Summary trip={t} />}
      <h3 style={{ margin: "25px 0 10px" }}>Dokumen tercatat</h3>
      <ul style={{ listStyle: "disc", paddingLeft: 20, lineHeight: 2 }}>
        {t.documents.map((d) => (
          <li key={d.id}>
            {docLabels[d.type]} —{" "}
            {d.kind === "file" ? d.name : `Fisik: ${d.location}`}
          </li>
        ))}
      </ul>
      {!t.documents.length && <p>Belum ada dokumen tercatat.</p>}
      {t.notes && (
        <div className="note-box">
          <strong>Catatan</strong>
          <p>{t.notes}</p>
        </div>
      )}
      <p style={{ fontSize: "10pt", color: "#8999aa", marginTop: 30 }}>
        Ringkasan administrasi arsip • Sumber: {t.source} • Versi {t.version}.
        Dokumen ini tidak menggantikan SPT/SPPD asli.
      </p>
    </main>
  );
}

import { money, dateText, type Trip } from "@/lib/model";
import { lampiranReview } from "@/lib/lampiran6-schema";

const date = (value: string) => (value ? dateText(value) : "Belum dicatat");
const hasValues = (value: object) =>
  Object.values(value).some((v) => v !== null && v !== "");
function Facts({ rows }: { rows: [string, string | number | null][] }) {
  return (
    <dl className="lampiran-facts">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value === null || value === "" || value === "Belum dicatat" ? <span className="rincian-empty">Belum dicatat</span> : value}</dd>
        </div>
      ))}
    </dl>
  );
}
export default function Lampiran6Summary({ trip }: { trip: Trip }) {
  const d = trip.lampiran6;
  if (!d) return null;
  const notes = [
    ...new Set([
      ...d.sourceIssues,
      ...lampiranReview(d, trip.startDate, trip.endDate),
    ]),
  ];
  return (
    <div className="lampiran-summary">
      <section>
        <h3 className="subheading">{d.format === "luar-provinsi" ? "Perjalanan luar Provinsi Jambi" : "Perjalanan dalam Provinsi Jambi"}</h3>
        <p className="section-note">
          Satu arsip untuk satu pegawai:{" "}
          <strong>{trip.participants[0].name}</strong>.
        </p>
        <Facts
          rows={[
            ["Nomor pada rekap", d.sourceNo],
            ["Golongan", d.rank],
            ["Tanggal SPPD", date(d.sppdDate)],
            ["Asal", d.origin],
            ["Provinsi tujuan", d.format === "luar-provinsi" ? d.destinationProvince : "Jambi"],
            ["Jumlah hari pada rekap", d.claimedDays],
            ["Nama program", d.program],
            ["Kegiatan anggaran", d.activityName],
            ["Subkegiatan", d.subActivity],
          ]}
        />
      </section>
      <section>
        <h3 className="subheading">Nominal pada rekap sumber</h3>
        <Facts
          rows={[
            ["Uang harian per hari", money(d.dailyRate)],
            ["Representasi per hari", money(d.representationRate)],
            ["Total rincian sumber", money(d.recordedTotal)],
            ["Total kuitansi", money(d.receiptTotal)],
          ]}
        />
        <p className="field-hint">
          Jumlah komponen berada di tab Peserta & biaya. Total kuitansi tidak
          menyatakan status pembayaran.
        </p>
      </section>
      {d.lodgings.filter(hasValues).map((hotel, i) => (
        <section key={`hotel-${i}`}>
          <h3 className="subheading">Penginapan {i + 1}</h3>
          <Facts
            rows={[
              ["Nama hotel", hotel.name],
              ["Nomor / jenis kamar", hotel.room],
              ["Nomor referensi", hotel.reference],
              ["Check-in", date(hotel.checkIn)],
              ["Check-out", date(hotel.checkOut)],
              ["Jumlah hari", hotel.days],
              ["Tempat pemesanan", hotel.application],
              ["Order ID / PO", hotel.orderId],
              ["Tarif per hari", money(hotel.dailyRate)],
              ["Total bukti hotel", money(hotel.total)],
            ]}
          />
        </section>
      ))}
      {d.groundTransports.filter(hasValues).map((transport, i) => (
        <section key={`ground-${i}`}>
          <h3 className="subheading">Transport darat {i + 1}</h3>
          <Facts
            rows={[
              ["Jenis", transport.mode],
              ["Penyedia / pelat kendaraan", transport.provider],
              ["Jenis mobil", transport.vehicleType ?? ""],
              ["Jenis BBM", transport.fuelType ?? ""],
              ["Harga per liter", money(transport.fuelPricePerLiter ?? null)],
              ["Total bukti transport", money(transport.total)],
            ]}
          />
        </section>
      ))}
      {(
        [
          ["Pergi", d.outbound],
          ["Pulang", d.inbound],
        ] as const
      )
        .filter(([, flight]) => hasValues(flight))
        .map(([label, flight]) => (
          <section key={label}>
            <h3 className="subheading">Penerbangan {label.toLowerCase()}</h3>
            <Facts
              rows={[
                ["Tanggal", date(flight.date)],
                ["Maskapai", flight.airline],
                ["Kota asal", flight.origin],
                ["Kota tujuan", flight.destination],
                ["Tempat pemesanan", flight.application],
                ["Order ID / PO", flight.orderId],
                ["Kode booking", flight.bookingCode],
                ["Nomor tiket", flight.ticketNo],
                ["Harga tiket", money(flight.price)],
              ]}
            />
          </section>
        ))}
      {notes.length > 0 && (
        <div className="lampiran-review">
          <strong>Catatan pemeriksaan</strong>
          <ul>
            {notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {Object.keys(d.sourceFormulas).length > 0 && (
        <details className="source-review">
          <summary>Rumus yang tercatat pada Excel sumber</summary>
          <dl>
            {Object.entries(d.sourceFormulas).map(([cell, formula]) => (
              <div key={cell}>
                <dt>{cell}</dt>
                <dd>
                  <code>{formula}</code>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

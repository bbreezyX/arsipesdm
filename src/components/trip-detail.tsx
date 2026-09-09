"use client";
import { CustomSelect, SelectOption } from "./ui/select";
import { useEffect, useState } from "react";
import {
  FileText,
  Plus,
  Upload,
  FolderOpen,
  ExternalLink,
  Pencil,
  Clock3,
  LoaderCircle,
  Info,
  Printer,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Field, ErrorMessage, api } from "./fields";
import Lampiran6Summary from "./lampiran6-summary";
import {
  type Trip,
  docLabels,
  money,
  totalCost,
  dateText,
  duration,
  paymentLabel,
  isComplete,
} from "@/lib/model";

function dateRange(start: string, end: string) {
  if (start === end) return dateText(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${dateText(start, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${dateText(end)}`;
}

function Value({ value }: { value: string | null | undefined }) {
  return value && value.trim() ? <>{value}</> : <span className="rincian-empty">Belum dicatat</span>;
}

export default function TripDetail({
  trip,
  onClose,
  onEdit,
  onDelete,
  onUpdate,
}: {
  trip: Trip;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (t: Trip) => void;
}) {
  const [tab, setTab] = useState("overview");
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("file");
  const [type, setType] = useState("other");
  const [location, setLocation] = useState(trip.physicalLocation);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = new FormData();
      data.set("tripId", trip.id);
      data.set("version", String(trip.version));
      data.set("type", type);
      data.set("kind", kind);
      if (kind === "physical") data.set("location", location);
      else if (file) data.set("file", file);
      else throw new Error("Pilih berkas terlebih dahulu.");
      const t = await api<Trip>("/api/documents", {
        method: "POST",
        body: data,
      });
      onUpdate(t);
      setAdding(false);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const total = totalCost(trip);
  const complete = isComplete(trip);
  const people = trip.participants;
  const lead = people[0];
  const title = people.length <= 3
    ? people.map((p) => p.name).join(", ")
    : `${people.slice(0, 2).map((p) => p.name).join(", ")} dan ${people.length - 2} pegawai lainnya`;
  const subtitle = people.length === 1
    ? [lead.nip.trim() ? `NIP ${lead.nip}` : "NIP belum dicatat", lead.position.trim() || null, `Bidang ${trip.department}`]
        .filter(Boolean).join(", ")
    : `${people.length} pegawai dalam satu rekap, Bidang ${trip.department}`;
  const days = duration(trip);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="detail-dialog rincian-dialog">
        <DialogHeader>
          <div className="dialog-kicker rincian-kicker">
            <FileText size={15} aria-hidden="true" />
            <span>Rekap perjalanan dinas</span>
            <span className="rincian-code">{trip.code}</span>
            <span className={`rincian-state ${complete ? "complete" : ""}`}>
              {complete ? "Arsip lengkap" : "Draft"}
            </span>
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
          <dl className="rincian-facts">
            <div>
              <dt>Surat tugas</dt>
              <dd className="rincian-facts-ref"><Value value={trip.sptNo} /></dd>
            </div>
            <div>
              <dt>Tujuan</dt>
              <dd>{trip.destination}</dd>
            </div>
            <div>
              <dt>Pelaksanaan</dt>
              <dd>
                {dateRange(trip.startDate, trip.endDate)}
                <small>{days} hari</small>
              </dd>
            </div>
            <div className="rincian-facts-money">
              <dt>Realisasi biaya</dt>
              <dd>{total === null ? <span className="rincian-empty">Belum dicatat</span> : money(total)}</dd>
            </div>
          </dl>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="detail-tabs rincian-tabs">
            <TabsTrigger value="overview">Ringkasan</TabsTrigger>
            <TabsTrigger value="costs">
              {people.length > 1 ? "Peserta & biaya" : "Biaya"}
            </TabsTrigger>
            {trip.lampiran6 && (
              <TabsTrigger value="lampiran">Rincian rekap</TabsTrigger>
            )}
            <TabsTrigger value="documents">
              Dokumen <span className="tiny-count">{trip.documents.length}</span>
            </TabsTrigger>
            <TabsTrigger value="history">Riwayat</TabsTrigger>
          </TabsList>
          <div className="detail-scroll rincian-scroll">
            {trip.lampiran6 && (
              <TabsContent value="lampiran">
                <Lampiran6Summary trip={trip} />
              </TabsContent>
            )}
            <TabsContent value="overview">
              {narrow ? (
                <details className="rincian-section rincian-fold">
                  <summary><span className="rincian-heading">Uraian kegiatan</span></summary>
                  <p className="rincian-purpose">{trip.title}</p>
                </details>
              ) : (
                <section className="rincian-section">
                  <h3 className="rincian-heading">Uraian kegiatan</h3>
                  <p className="rincian-purpose">{trip.title}</p>
                </section>
              )}
              <section className="rincian-section">
                <h3 className="rincian-heading">Administrasi</h3>
                <dl className="rincian-meta">
                  <div>
                    <dt>Nomor SPPD</dt>
                    <dd><Value value={trip.sppdNo} /></dd>
                  </div>
                  <div>
                    <dt>Kegiatan / subkegiatan</dt>
                    <dd><Value value={trip.activity} /></dd>
                  </div>
                  <div>
                    <dt>Kode rekening</dt>
                    <dd><Value value={trip.account} /></dd>
                  </div>
                  <div>
                    <dt>Berkas fisik</dt>
                    <dd><Value value={trip.physicalLocation} /></dd>
                  </div>
                  <div>
                    <dt>Sumber data</dt>
                    <dd>{trip.source}</dd>
                  </div>
                  <div>
                    <dt>Diperbarui</dt>
                    <dd>
                      {new Date(trip.updatedAt).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      WIB
                    </dd>
                  </div>
                </dl>
              </section>
              {trip.notes && (
                <section className="rincian-section">
                  <h3 className="rincian-heading">Catatan arsip</h3>
                  <p className="rincian-note">{trip.notes}</p>
                </section>
              )}
              {!complete && (
                <div className="rincian-next">
                  <Info size={18} aria-hidden="true" />
                  <span>
                    <strong>Biaya belum dicatat</strong>
                    <small>Rekap tetap tersimpan sebagai draft. Dokumen pendukung tidak wajib.</small>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setTab("costs")}>
                    Lengkapi biaya
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="costs">
              {people.length > 1 && <section className="rincian-section">
                <h3 className="rincian-heading">
                  Peserta perjalanan
                  <span>{people.length} pegawai</span>
                </h3>
                <ul className="rincian-people">
                  {people.map((p) => (
                    <li key={p.id}>
                      <strong>{p.name}</strong>
                      <span>
                        {p.nip.trim() ? `NIP ${p.nip}` : "NIP belum dicatat"}
                        {p.position.trim() ? `, ${p.position}` : ""}
                        {p.department.trim() ? `, ${p.department}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>}
              <section className="rincian-section">
                <h3 className="rincian-heading">
                  Rincian biaya realisasi
                  <span>{trip.costs.length ? `${trip.costs.length} komponen` : "Belum ada komponen"}</span>
                </h3>
                {trip.costs.length ? (
                  <div className="rincian-costs">
                    <div className="rincian-costs-head">
                      <span>Komponen</span>
                      <span>Untuk</span>
                      <span>Jumlah</span>
                    </div>
                    {trip.costs.map((c) => (
                      <div className="rincian-cost" key={c.id}>
                        <strong>{c.category}</strong>
                        <span>
                          {c.participantId === "shared"
                            ? "Bersama, satu kali untuk perjalanan ini"
                            : people.find((p) => p.id === c.participantId)?.name}
                          {c.label ? <small>{c.label}</small> : null}
                        </span>
                        <b>{money(c.amount)}</b>
                      </div>
                    ))}
                    <div className="rincian-costs-total">
                      <span>Total realisasi</span>
                      <strong>{money(total)}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="rincian-note">
                    Biaya belum dicatat. Lengkapi dari rekap atau kuitansi asli melalui Edit arsip.
                  </p>
                )}
              </section>
              <section className="rincian-section">
                <h3 className="rincian-heading">Pembayaran</h3>
                <dl className="rincian-meta">
                  <div>
                    <dt>Sudah dibayar</dt>
                    <dd>{trip.paid === null ? <span className="rincian-empty">Belum dicatat</span> : money(trip.paid)}</dd>
                  </div>
                  <div>
                    <dt>Status pembayaran</dt>
                    <dd>{paymentLabel(trip)}</dd>
                  </div>
                  {total !== null && trip.paid !== null && trip.paid !== total && (
                    <div>
                      <dt>{trip.paid > total ? "Perlu dikembalikan" : "Sisa pembayaran"}</dt>
                      <dd>{money(Math.abs(total - trip.paid))}</dd>
                    </div>
                  )}
                </dl>
                <p className="rincian-hint">Biaya bersama dihitung satu kali untuk seluruh perjalanan.</p>
              </section>
            </TabsContent>
            <TabsContent value="documents">
              <section className="rincian-section">
                <div className="rincian-section-head">
                  <div>
                    <h3 className="rincian-heading">Dokumen perjalanan</h3>
                    <p className="rincian-hint">
                      Opsional. Foto, PDF, dan catatan berkas fisik tidak memengaruhi status rekap.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setAdding(!adding)} aria-expanded={adding}>
                    <Plus /> Tambah dokumen
                  </Button>
                </div>
                {adding && (
                  <form className="upload-form rincian-upload" onSubmit={upload}>
                    <div className="segmented">
                      <button
                        type="button"
                        className={kind === "file" ? "selected" : ""}
                        onClick={() => setKind("file")}
                      >
                        <Upload size={15} /> Unggah file
                      </button>
                      <button
                        type="button"
                        className={kind === "physical" ? "selected" : ""}
                        onClick={() => setKind("physical")}
                      >
                        <FolderOpen size={15} /> Berkas fisik
                      </button>
                    </div>
                    <Field label="Jenis dokumen">
                      <CustomSelect
                        value={type}
                        onValueChange={(value) => setType(value as typeof type)}
                      >
                        {Object.entries(docLabels).map(([k, v]) => (
                          <SelectOption key={k} value={k}>
                            {v}
                          </SelectOption>
                        ))}
                      </CustomSelect>
                    </Field>
                    {kind === "file" ? (
                      <Field
                        key="digital"
                        label="Pilih berkas"
                        hint="PDF, JPG, atau PNG. Maksimal 10 MB per berkas."
                      >
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          required
                          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        />
                      </Field>
                    ) : (
                      <Field
                        key="physical"
                        label="Lokasi berkas fisik"
                        hint="Tandai hanya setelah keberadaan berkas diperiksa."
                      >
                        <input
                          required
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="Lemari, nomor map, dan tahun arsip"
                        />
                      </Field>
                    )}
                    <ErrorMessage message={error} />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setAdding(false)}
                        disabled={busy}
                      >
                        Batal
                      </Button>
                      <Button type="submit" disabled={busy}>
                        {busy && <LoaderCircle className="animate-spin" />}Simpan dokumen
                      </Button>
                    </div>
                  </form>
                )}
                {trip.documents.length ? (
                  <ul className="rincian-docs">
                    {trip.documents.map((d) => (
                      <li className="rincian-doc" key={d.id}>
                        <span className={`rincian-doc-icon ${d.kind}`} aria-hidden="true">
                          {d.kind === "file" ? <FileText size={18} /> : <FolderOpen size={18} />}
                        </span>
                        <span className="rincian-doc-info">
                          <strong>{docLabels[d.type]}</strong>
                          <span>{d.kind === "file" ? d.name : d.location}</span>
                          <small>
                            {d.kind === "file"
                              ? `Berkas digital, ${(d.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB`
                              : "Berkas fisik, tersimpan di lokasi ini"}
                          </small>
                        </span>
                        {d.kind === "file" ? (
                          <a
                            className="rincian-doc-open"
                            href={`/api/documents/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Buka ${d.name}`}
                          >
                            Buka <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="rincian-doc-tag">Fisik</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rincian-empty-state">
                    <FileText aria-hidden="true" />
                    <p>Belum ada dokumen untuk rekap ini. Tambahkan hanya jika diperlukan.</p>
                  </div>
                )}
              </section>
            </TabsContent>
            <TabsContent value="history">
              <section className="rincian-section">
                <h3 className="rincian-heading">
                  Riwayat arsip
                  <span>{trip.history.length} catatan</span>
                </h3>
                <p className="rincian-hint">Setiap perubahan tersimpan bersama nama operator dan waktunya.</p>
                <ol className="rincian-timeline">
                  {trip.history.map((h) => (
                    <li key={h.id}>
                      <span className="rincian-timeline-mark" aria-hidden="true">
                        <Clock3 size={13} />
                      </span>
                      <div>
                        <strong>{h.action}</strong>
                        {h.detail && <p>{h.detail}</p>}
                        <small>
                          {h.actor},{" "}
                          {new Date(h.at).toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Jakarta",
                          })}{" "}
                          WIB
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </TabsContent>
          </div>
        </Tabs>
        <div className="detail-footer rincian-footer">
          <span>Versi {trip.version}, tersimpan di arsip kantor</span>
          <div className="detail-action-buttons">
            <Button
              variant="ghost"
              className="text-destructive rincian-delete"
              onClick={onDelete}
              disabled={busy}
            >
              <Trash2 /> Hapus arsip
            </Button>
            <Button variant="outline" asChild>
              <a href={`/cetak/${trip.id}`} target="_blank" rel="noreferrer">
                <Printer /> Cetak ringkasan
              </a>
            </Button>
            <Button onClick={onEdit} disabled={busy}>
              <Pencil /> Edit arsip
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { CustomSelect, SelectOption } from "./ui/select";
import { useState } from "react";
import {
  MapPin,
  CalendarDays,
  Users,
  Wallet,
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="detail-dialog">
        <DialogHeader>
          <div className="dialog-kicker">
            {trip.code}
            <span
              className={`status-badge ${isComplete(trip) ? "complete" : "incomplete"}`}
            >
              {isComplete(trip) ? "Arsip lengkap" : "Draft"}
            </span>
          </div>
          <DialogTitle>{trip.title}</DialogTitle>
          <DialogDescription>
            {trip.department}
            {trip.lampiran6 ? ` · ${trip.participants[0].name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="detail-tabs">
            <TabsTrigger value="overview">Ringkasan</TabsTrigger>
            <TabsTrigger value="costs">
              {trip.lampiran6 ? "Pegawai & biaya" : "Peserta & biaya"}
            </TabsTrigger>
            {trip.lampiran6 && (
              <TabsTrigger value="lampiran">Rincian rekap</TabsTrigger>
            )}
            <TabsTrigger value="documents">
              Dokumen{" "}
              <span className="tiny-count">{trip.documents.length}</span>
            </TabsTrigger>
            <TabsTrigger value="history">Riwayat</TabsTrigger>
          </TabsList>
          <div className="detail-scroll">
            {trip.lampiran6 && (
              <TabsContent value="lampiran">
                <Lampiran6Summary trip={trip} />
              </TabsContent>
            )}
            <TabsContent value="overview">
              <div className="detail-facts">
                <div>
                  <MapPin />
                  <span>
                    Tujuan<strong>{trip.destination}</strong>
                  </span>
                </div>
                <div>
                  <CalendarDays />
                  <span>
                    Pelaksanaan
                    <strong>
                      {dateText(trip.startDate)} – {dateText(trip.endDate)}
                    </strong>
                    <small>{duration(trip)} hari perjalanan</small>
                  </span>
                </div>
                <div>
                  <Users />
                  <span>
                    {trip.lampiran6 ? "Pegawai" : "Peserta"}
                    <strong>
                      {trip.lampiran6
                        ? trip.participants[0].name
                        : `${trip.participants.length} pegawai`}
                    </strong>
                    {trip.lampiran6 && (
                      <small>Rekap perjalanan dan biaya pegawai ini.</small>
                    )}
                  </span>
                </div>
                <div>
                  <Wallet />
                  <span>
                    Total realisasi<strong>{money(total)}</strong>
                  </span>
                </div>
              </div>
              <dl className="metadata-list">
                <div>
                  <dt>Nomor SPT</dt>
                  <dd>{trip.sptNo || "Belum dicatat"}</dd>
                </div>
                <div>
                  <dt>Nomor SPPD</dt>
                  <dd>{trip.sppdNo || "—"}</dd>
                </div>
                <div>
                  <dt>Kegiatan / subkegiatan</dt>
                  <dd>{trip.activity || "Belum dicatat"}</dd>
                </div>
                <div>
                  <dt>Kode rekening</dt>
                  <dd>{trip.account || "Belum dicatat"}</dd>
                </div>
                <div>
                  <dt>Lokasi berkas fisik</dt>
                  <dd>{trip.physicalLocation || "Belum dicatat"}</dd>
                </div>
                <div>
                  <dt>Sumber data</dt>
                  <dd>{trip.source}</dd>
                </div>
              </dl>
              {trip.notes && (
                <div className="note-box">
                  <h4>Catatan arsip</h4>
                  <p>{trip.notes}</p>
                </div>
              )}
              {!isComplete(trip) && (
                <div className="next-action">
                  <div>
                    <Info size={19} />
                    <span>
                      <strong>Draft · Biaya belum dicatat</strong>
                      <small>Dokumen pendukung tidak wajib.</small>
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTab("costs")}
                  >
                    Lengkapi biaya
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="costs">
              <h3 className="subheading">
                {trip.lampiran6 ? "Pegawai" : "Peserta perjalanan"}
              </h3>
              <div className="people-list">
                {trip.participants.map((p) => (
                  <div key={p.id}>
                    <div className="avatar">
                      {p.name
                        .split(" ")
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")}
                    </div>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.nip ? `NIP ${p.nip}` : "NIP belum dicatat"}
                        {p.department ? ` · ${p.department}` : ""}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              <h3 className="subheading mt-7">Rincian biaya realisasi</h3>
              {trip.costs.length ? (
                <div className="cost-detail">
                  {trip.costs.map((c) => (
                    <div key={c.id}>
                      <span>
                        <strong>{c.category}</strong>
                        <small>
                          {c.participantId === "shared"
                            ? "Bersama / total perjalanan"
                            : trip.participants.find(
                                (p) => p.id === c.participantId,
                              )?.name}
                          {c.label ? ` · ${c.label}` : ""}
                        </small>
                      </span>
                      <strong>{money(c.amount)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="note-box">
                  Biaya belum dicatat. Lengkapi dari rekap atau kuitansi asli.
                </div>
              )}
              <div className="cost-total">
                <span>Total realisasi</span>
                <strong>{money(total)}</strong>
              </div>
              <dl className="metadata-list">
                <div>
                  <dt>Sudah dibayar</dt>
                  <dd>{money(trip.paid)}</dd>
                </div>
                <div>
                  <dt>Status pembayaran</dt>
                  <dd>{paymentLabel(trip)}</dd>
                </div>
                {total !== null &&
                  trip.paid !== null &&
                  trip.paid !== total && (
                    <div>
                      <dt>
                        {trip.paid > total
                          ? "Perlu dikembalikan"
                          : "Sisa pembayaran"}
                      </dt>
                      <dd>{money(Math.abs(total - trip.paid))}</dd>
                    </div>
                  )}
              </dl>
              <p className="field-hint">
                Biaya bersama dihitung satu kali untuk seluruh perjalanan.
              </p>
            </TabsContent>
            <TabsContent value="documents">
              <div className="section-heading">
                <div>
                  <h3 className="subheading">Dokumen perjalanan</h3>
                  <p className="muted text-xs">
                    Opsional. Foto/PDF dan catatan berkas fisik tidak memengaruhi status rekap.
                  </p>
                </div>
                <Button size="sm" onClick={() => setAdding(!adding)}>
                  <Plus /> Tambah dokumen
                </Button>
              </div>
              {adding && (
                <form className="upload-form" onSubmit={upload}>
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
                      {busy && <LoaderCircle className="animate-spin" />}Simpan
                      dokumen
                    </Button>
                  </div>
                </form>
              )}
              <div className="document-list">
                {trip.documents.map((d) => (
                  <div className="document-item" key={d.id}>
                    <div className={`file-icon ${d.kind}`}>
                      {d.kind === "file" ? (
                        <FileText size={20} />
                      ) : (
                        <FolderOpen size={20} />
                      )}
                    </div>
                    <div className="file-info">
                      <strong>{docLabels[d.type]}</strong>
                      <span>{d.kind === "file" ? d.name : d.location}</span>
                      <small>
                        {d.kind === "file"
                          ? `${(d.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB · Digital`
                          : "Tersimpan secara fisik"}
                      </small>
                    </div>
                    {d.kind === "file" ? (
                      <a
                        className="icon-link"
                        href={`/api/documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Buka ${d.name}`}
                      >
                        <ExternalLink size={17} />
                      </a>
                    ) : (
                      <span className="status-badge neutral">Fisik</span>
                    )}
                  </div>
                ))}
              </div>
              {trip.documents.length === 0 && (
                <div className="small-empty">
                  <FileText />
                  <p>
                    Belum ada dokumen. Tambahkan hanya jika diperlukan.
                  </p>
                </div>
              )}
            </TabsContent>
            <TabsContent value="history">
              <h3 className="subheading">Riwayat arsip</h3>
              <p className="section-note">
                Perubahan tersimpan bersama nama operator dan waktunya.
              </p>
              <ol className="timeline">
                {trip.history.map((h) => (
                  <li key={h.id}>
                    <div className="timeline-marker">
                      <Clock3 size={14} />
                    </div>
                    <div>
                      <strong>{h.action}</strong>
                      <p>{h.detail}</p>
                      <small>
                        {h.actor} ·{" "}
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
            </TabsContent>
          </div>
        </Tabs>
        <div className="detail-footer">
          <span className="muted text-xs">
            Versi {trip.version} · Tersimpan di arsip
          </span>
          <div className="detail-action-buttons">
            <Button
              variant="ghost"
              className="text-destructive"
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

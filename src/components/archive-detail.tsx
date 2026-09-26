"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Clock3, Download, ExternalLink, FileText, FolderOpen, Info, LoaderCircle,
  Pencil, Plus, Printer, Trash2, Upload,
} from "lucide-react";
import type { ArchiveGroup } from "@/lib/archive-groups";
import { fundTrackLabels, resolveFundTrack } from "@/lib/fund-track";
import { dateText, docLabels, isComplete, money, paymentLabel, totalCost, type Trip } from "@/lib/model";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { ErrorMessage, Field, api } from "./fields";
import Lampiran6Summary from "./lampiran6-summary";

/*
  Rincian arsip sebagai halaman: satu Surat Tugas, satu lidah per rekap pegawai.
  Semua bagian yang dulu tersembunyi di tab dialog tampil berurutan; menu kiri
  melompat ke bagiannya dan menandai bagian yang sedang dibaca.
*/

function dateRange(start: string, end: string) {
  if (start === end) return dateText(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${dateText(start, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${dateText(end)}`;
}

const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;

function Value({ value }: { value: string | null | undefined }) {
  return value?.trim() ? value : <span className="rincian-page-empty">Belum dicatat</span>;
}

function fundTrackDetail(trip: Trip) {
  const track = resolveFundTrack(trip);
  return track ? `${track} · ${fundTrackLabels[track]}` : "";
}

const names = (trip: Trip) => trip.participants.length <= 3
  ? trip.participants.map((p) => p.name).join(", ")
  : `${trip.participants.slice(0, 2).map((p) => p.name).join(", ")} dan ${trip.participants.length - 2} pegawai lainnya`;
const tabName = (trip: Trip) => trip.participants.length > 1
  ? `${trip.participants[0].name} +${trip.participants.length - 1}`
  : trip.participants[0]?.name || trip.code;
const wib = (iso: string) => `${new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;

export default function ArchiveDetail({
  trip,
  group,
  editable,
  exporting,
  onOpen,
  onBack,
  onEdit,
  onDelete,
  onUpdate,
  onExport,
}: {
  trip: Trip;
  group: ArchiveGroup;
  editable: boolean;
  exporting: boolean;
  onOpen: (trip: Trip) => void;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (trip: Trip) => void;
  /** Exports the whole Surat Tugas; absent when the user cannot export. */
  onExport?: () => void;
}) {
  const total = totalCost(trip);
  const complete = isComplete(trip);
  const people = trip.participants;
  const lead = people[0];
  const l6 = trip.lampiran6;
  const index = group.trips.findIndex((t) => t.id === trip.id);
  const prev = group.trips[index - 1];
  const next = group.trips[index + 1];
  const subtitle = people.length === 1
    ? [lead.nip.trim() ? `NIP ${lead.nip}` : "NIP belum dicatat", lead.position.trim(), l6?.rank.trim(), `Bidang ${trip.department}`]
        .filter(Boolean).join(" · ")
    : `${people.length} pegawai dalam satu rekap · Bidang ${trip.department}`;
  const sections = [
    { id: "rincian-ringkasan", label: "Ringkasan" },
    { id: "rincian-biaya", label: "Biaya", count: trip.costs.length },
    ...(l6 ? [{ id: "rincian-rekap", label: "Rincian rekap" }] : []),
    ...(editable ? [
      { id: "rincian-dokumen", label: "Dokumen", count: trip.documents.length },
      { id: "rincian-riwayat", label: "Riwayat", count: trip.history.length },
    ] : []),
  ];
  const active = useActiveSection(sections.map((s) => s.id), trip.id);
  const linksRef = useRef<HTMLDivElement>(null);
  /* Di layar sempit menu bagian bergeser menyamping; bagian yang aktif tetap terlihat. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: posisi tautan aktif dibaca dari DOM setiap kali bagian aktif berganti
  useEffect(() => {
    const box = linksRef.current;
    const current = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !current || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: current.offsetLeft - 10, behavior: "smooth" });
  }, [active]);
  const jump = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="rincian-page">
      <button type="button" className="rincian-page-back" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" /> Arsip perjalanan
      </button>
      <header className="ledger-head rincian-page-head">
        <div>
          <h1>{group.number || trip.code}</h1>
          <p className="rincian-page-facts">
            <span>{dateRange(group.startDate, group.endDate)} · {days(group.startDate, group.endDate)} hari</span>
            <span>{group.destinations.join(", ")}</span>
            <span>{group.trips.length} rekap, {group.participants.length} pegawai</span>
            <span>{group.unknownCount ? "realisasi sementara" : "realisasi"} <b>{money(group.total)}</b></span>
          </p>
        </div>
        {onExport && (
          <div className="ledger-head-actions">
            <Button variant="outline" disabled={exporting} onClick={onExport}>
              {exporting ? <LoaderCircle className="animate-spin" /> : <Download />} Ekspor surat ini
            </Button>
          </div>
        )}
      </header>

      <nav className="ledger-years rincian-page-tabs" aria-label="Rekap dalam Surat Tugas ini">
        {group.trips.map((t) => (
          <button type="button" key={t.id} className="ledger-year" aria-pressed={t.id === trip.id} onClick={() => onOpen(t)}>
            <strong>{tabName(t)}</strong>
            <span>{t.code} · {money(totalCost(t))}</span>
          </button>
        ))}
      </nav>

      <div className="ledger-sheet rincian-page-sheet">
        <nav className="rincian-page-nav" aria-label="Bagian rincian">
          <div className="rincian-page-nav-sticky">
            <div className="rincian-page-nav-links" ref={linksRef}>
              {sections.map((s) => (
                <button type="button" key={s.id} aria-current={active === s.id || undefined} onClick={() => jump(s.id)}>
                  {s.label}{s.count !== undefined && <b>{s.count}</b>}
                </button>
              ))}
            </div>
            {group.trips.length > 1 && (
              <div className="rincian-page-nav-foot" role="group" aria-label="Pindah rekap">
                <Button variant="outline" size="icon-sm" aria-label="Rekap sebelumnya" disabled={!prev} onClick={() => prev && onOpen(prev)}><ChevronLeft /></Button>
                <span aria-live="polite">{index + 1} dari {group.trips.length}</span>
                <Button variant="outline" size="icon-sm" aria-label="Rekap berikutnya" disabled={!next} onClick={() => next && onOpen(next)}><ChevronRight /></Button>
              </div>
            )}
          </div>
        </nav>

        <div className="rincian-page-body">
          <header className="rincian-page-person">
            <div>
              <h2>{names(trip)} <span className={`ledger-state ${complete ? "complete" : ""}`}>{complete ? "Lengkap" : "Draft"}</span></h2>
              <p>{subtitle}</p>
            </div>
            <div className="rincian-page-actions">
              {editable && (
                <Button variant="ghost" className="rincian-page-delete" onClick={onDelete}>
                  <Trash2 /> Hapus
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={`/cetak/${trip.id}`} target="_blank" rel="noreferrer"><Printer /> Cetak</a>
              </Button>
              {editable && <Button onClick={onEdit}><Pencil /> Edit arsip</Button>}
            </div>
          </header>

          <dl className="rincian-page-band">
            <div><dt>Kode rekap</dt><dd className="rincian-page-code">{trip.code}</dd></div>
            {l6?.origin.trim() && <div><dt>Asal</dt><dd>{l6.origin}</dd></div>}
            {people.length > 1 || group.destinations.length > 1 || trip.startDate !== group.startDate || trip.endDate !== group.endDate
              ? <div><dt>Perjalanan</dt><dd>{trip.destination}, {dateRange(trip.startDate, trip.endDate)}</dd></div>
              : null}
            {l6?.sppdDate && <div><dt>Tanggal SPPD</dt><dd>{dateText(l6.sppdDate)}</dd></div>}
            <div><dt>Nomor SPPD</dt><dd><Value value={trip.sppdNo} /></dd></div>
            <div className="rincian-page-total"><dt>Realisasi biaya</dt><dd>{money(total)}</dd></div>
          </dl>

          <section id="rincian-ringkasan" className="rincian-page-section">
            <h3>Uraian kegiatan</h3>
            <p className="rincian-page-purpose">{trip.title}</p>
            {!complete && (
              <div className="rincian-page-next">
                <Info size={18} aria-hidden="true" />
                <span>
                  <strong>Biaya belum dicatat</strong>
                  <small>Rekap tetap tersimpan sebagai draft. Dokumen pendukung tidak wajib.</small>
                </span>
                {editable && <Button size="sm" variant="outline" onClick={onEdit}>Lengkapi biaya</Button>}
              </div>
            )}
            <h3>Administrasi</h3>
            <dl className="rincian-page-meta">
              <div><dt>Kegiatan / subkegiatan</dt><dd><Value value={trip.activity} /></dd></div>
              <div><dt>Kode rekening</dt><dd className="rincian-page-code"><Value value={trip.account} /></dd></div>
              <div><dt>Jenis dana</dt><dd><Value value={fundTrackDetail(trip)} /></dd></div>
              {editable && <div><dt>Berkas fisik</dt><dd><Value value={trip.physicalLocation} /></dd></div>}
              <div><dt>Sumber data</dt><dd>{trip.source}</dd></div>
              <div><dt>Diperbarui</dt><dd>{wib(trip.updatedAt)}</dd></div>
            </dl>
            {trip.notes && <>
              <h3>Catatan arsip</h3>
              <p className="rincian-page-purpose">{trip.notes}</p>
            </>}
          </section>

          <section id="rincian-biaya" className="rincian-page-section">
            {people.length > 1 && <>
              <h3>Peserta perjalanan <span>{people.length} pegawai</span></h3>
              <ul className="rincian-page-people">
                {people.map((p) => (
                  <li key={p.id}>
                    <strong>{p.name}</strong>
                    <span>{[p.nip.trim() ? `NIP ${p.nip}` : "NIP belum dicatat", p.position.trim(), p.department.trim()].filter(Boolean).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </>}
            <h3>Rincian biaya realisasi <span>{trip.costs.length ? `${trip.costs.length} komponen` : "Belum ada komponen"}</span></h3>
            {trip.costs.length ? (
              <table className="rincian-page-costs">
                <thead><tr><th>Komponen</th>{people.length > 1 && <th>Untuk</th>}<th className="r">Jumlah</th></tr></thead>
                <tbody>
                  {trip.costs.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.category}</strong>{c.label && c.label !== c.category && <small>{c.label}</small>}</td>
                      {people.length > 1 && (
                        <td>{c.participantId === "shared" ? "Bersama, satu kali untuk perjalanan ini" : people.find((p) => p.id === c.participantId)?.name}</td>
                      )}
                      <td className="r">{money(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={people.length > 1 ? 2 : 1}>Total realisasi</td><td className="r">{money(total)}</td></tr></tfoot>
              </table>
            ) : (
              <p className="rincian-page-purpose">Biaya belum dicatat. Lengkapi dari rekap atau kuitansi asli melalui Edit arsip.</p>
            )}
            <h3>Pembayaran</h3>
            <dl className="rincian-page-meta">
              <div><dt>Sudah dibayar</dt><dd>{trip.paid === null ? <span className="rincian-page-empty">Belum dicatat</span> : money(trip.paid)}</dd></div>
              <div><dt>Status pembayaran</dt><dd>{paymentLabel(trip)}</dd></div>
              {total !== null && trip.paid !== null && trip.paid !== total && (
                <div><dt>{trip.paid > total ? "Perlu dikembalikan" : "Sisa pembayaran"}</dt><dd>{money(Math.abs(total - trip.paid))}</dd></div>
              )}
            </dl>
          </section>

          {l6 && (
            <section id="rincian-rekap" className="rincian-page-section">
              <h3>Rincian rekap</h3>
              <Lampiran6Summary trip={trip} />
            </section>
          )}

          {editable && <Documents trip={trip} onUpdate={onUpdate} />}

          {editable && (
            <section id="rincian-riwayat" className="rincian-page-section">
              <h3>Riwayat arsip <span>{trip.history.length} catatan</span></h3>
              <ol className="rincian-page-timeline">
                {trip.history.map((h) => (
                  <li key={h.id}>
                    <span aria-hidden="true"><Clock3 size={13} /></span>
                    <div>
                      <strong>{h.action}</strong>
                      {h.detail && <p>{h.detail}</p>}
                      <small>{h.actor}, {wib(h.at)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="rincian-page-version">Versi {trip.version}, tersimpan di arsip kantor</p>
        </div>
      </div>
    </div>
  );
}

/* Bagian teratas yang sedang terlihat di bawah bilah atas. */
function useActiveSection(ids: string[], resetKey: string) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: ids dibaca ulang lewat key dan resetKey
  useEffect(() => {
    const list = key.split(",");
    setActive(list[0]);
    const onScroll = () => {
      const line = window.innerHeight * 0.3;
      let current = list[0];
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = id;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActive(atEnd ? list[list.length - 1] : current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key, resetKey]);
  return active;
}

function Documents({ trip, onUpdate }: { trip: Trip; onUpdate: (trip: Trip) => void }) {
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
      onUpdate(await api<Trip>("/api/documents", { method: "POST", body: data }));
      setAdding(false);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="rincian-dokumen" className="rincian-page-section">
      <div className="rincian-page-section-head">
        <h3>Dokumen perjalanan <span>{trip.documents.length} berkas</span></h3>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus /> Tambah dokumen
        </Button>
      </div>
      <p className="rincian-page-hint">Opsional. Foto, PDF, dan catatan berkas fisik tidak memengaruhi status rekap.</p>
      {adding && (
        <form className="upload-form rincian-upload" onSubmit={upload}>
          <div className="segmented">
            <button type="button" className={kind === "file" ? "selected" : ""} onClick={() => setKind("file")}>
              <Upload size={15} /> Unggah file
            </button>
            <button type="button" className={kind === "physical" ? "selected" : ""} onClick={() => setKind("physical")}>
              <FolderOpen size={15} /> Berkas fisik
            </button>
          </div>
          <Field label="Jenis dokumen">
            <CustomSelect value={type} onValueChange={(value) => setType(value)}>
              {Object.entries(docLabels).map(([k, v]) => <SelectOption key={k} value={k}>{v}</SelectOption>)}
            </CustomSelect>
          </Field>
          {kind === "file" ? (
            <Field key="digital" label="Pilih berkas" hint="PDF, JPG, atau PNG. Maksimal 10 MB per berkas.">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          ) : (
            <Field key="physical" label="Lokasi berkas fisik" hint="Tandai hanya setelah keberadaan berkas diperiksa.">
              <input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lemari, nomor map, dan tahun arsip" />
            </Field>
          )}
          <ErrorMessage message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Simpan dokumen</Button>
          </div>
        </form>
      )}
      {trip.documents.length ? (
        <ul className="rincian-page-docs">
          {trip.documents.map((d) => (
            <li key={d.id}>
              <span className={`rincian-page-doc-icon ${d.kind}`} aria-hidden="true">
                {d.kind === "file" ? <FileText size={17} /> : <FolderOpen size={17} />}
              </span>
              <span className="rincian-page-doc-info">
                <strong>{docLabels[d.type]}</strong>
                <span>{d.kind === "file" ? d.name : d.location}</span>
                <small>
                  {d.kind === "file"
                    ? `Berkas digital, ${(d.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB`
                    : "Berkas fisik, tersimpan di lokasi ini"}
                </small>
              </span>
              {d.kind === "file" ? (
                <a className="rincian-page-doc-open" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" aria-label={`Buka ${d.name}`}>
                  Buka <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : (
                <span className="rincian-page-doc-tag">Fisik</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rincian-page-docs-empty">
          <FileText size={18} aria-hidden="true" />
          <p>Belum ada dokumen untuk rekap ini. Tambahkan hanya jika diperlukan.</p>
        </div>
      )}
    </section>
  );
}

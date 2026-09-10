"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import {
  Camera, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, FolderOpen, ImagePlus,
  LoaderCircle, MapPin, Search, Trash2, X,
} from "lucide-react";
import { dateText, docLabels, type DocumentItem, type Trip } from "@/lib/model";
import { api, Empty, ErrorMessage } from "./fields";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/*
  Dokumen: daftar kelengkapan berkas.
  Setiap rekap adalah satu map; setiap jenis dokumen adalah satu kantong di dalam map.
  Tabel di kiri adalah matriks kelengkapan (baris rekap, kolom jenis dokumen);
  panel di kanan adalah map yang sedang terbuka, tempat foto dijatuhkan ke kantongnya.
*/

export const docTypes = ["spt", "sppd", "report", "receipt", "ticket", "hotel", "other"] as const;
export type DocType = (typeof docTypes)[number];
export const docShort: Record<DocType, string> = {
  spt: "SPT", sppd: "SPPD", report: "Laporan", receipt: "Kuitansi", ticket: "Tiket", hotel: "Hotel", other: "Lainnya",
};

/* Empat berkas baku perjalanan dinas; berlaku bila rekap tidak menetapkan daftar sendiri. */
export const defaultDocs: DocType[] = ["spt", "sppd", "report", "receipt"];
export type Slot = { type: DocType; required: boolean; docs: DocumentItem[] };
export type Folder = {
  trip: Trip;
  slots: Slot[];
  explicit: boolean;
  required: number;
  present: number;
  missing: DocType[];
  complete: boolean;
  photos: number;
  pdfs: number;
  physical: number;
  location: string;
  names: string;
};

export function isImage(doc: DocumentItem) {
  return doc.kind === "file" && /\.(jpe?g|png)$/i.test(doc.name);
}

export function buildFolder(trip: Trip): Folder {
  const explicit = trip.requiredDocs.length > 0;
  const expected = explicit ? trip.requiredDocs : defaultDocs;
  const slots = docTypes.map((type) => ({
    type,
    required: expected.includes(type),
    docs: trip.documents.filter((d) => d.type === type),
  }));
  const requiredSlots = slots.filter((s) => s.required);
  const missing = requiredSlots.filter((s) => !s.docs.length).map((s) => s.type);
  const physicalNotes = trip.documents.filter((d) => d.kind === "physical");
  const names = trip.participants.length <= 2
    ? trip.participants.map((p) => p.name).join(" dan ")
    : `${trip.participants[0].name} dan ${trip.participants.length - 1} pegawai lainnya`;
  return {
    trip,
    slots,
    explicit,
    required: requiredSlots.length,
    present: requiredSlots.length - missing.length,
    missing,
    complete: requiredSlots.length > 0 && missing.length === 0,
    photos: trip.documents.filter(isImage).length,
    pdfs: trip.documents.filter((d) => d.kind === "file" && !isImage(d)).length,
    physical: physicalNotes.length,
    location: trip.physicalLocation.trim() || physicalNotes[0]?.location || "",
    names,
  };
}

export function folderMatches(f: Folder, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    f.trip.sptNo, f.trip.sppdNo, f.trip.title, f.trip.destination, f.trip.department, f.names, f.location,
    ...f.trip.participants.map((p) => `${p.name} ${p.nip}`),
    ...f.trip.documents.map((d) => `${d.name} ${d.location} ${docLabels[d.type]}`),
  ].join(" ").toLowerCase().includes(q);
}

const kb = (n: number) => `${(n / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB`;
const tripDates = (t: Trip) => t.startDate === t.endDate
  ? dateText(t.startDate)
  : `${dateText(t.startDate, { day: "numeric", month: "short" })} – ${dateText(t.endDate)}`;

type SlotState = { uploading?: string; error?: string };

/* Lebar map di samping (px): baku 420, dijepit 300–620 dan tidak memakan matriks. */
const SIDE_DEFAULT = 420;
const SIDE_MIN = 300;
const SIDE_MAX = 620;
const SIDE_KEY = "dokumen-side-width";

export default function Dokumen({ trips, onChange, notify, onOpen }: {
  trips: Trip[];
  onChange: (trip: Trip) => void;
  notify: (message: string) => void;
  onOpen: (id: string) => void;
}) {
  const folders = useMemo(() => trips.map(buildFolder), [trips]);
  const years = useMemo(
    () => [...new Set(folders.map((f) => f.trip.startDate.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [folders],
  );
  const [year, setYear] = useState<string>(() => years[0] ?? "all");
  const [department, setDepartment] = useState("all");
  const [kind, setKind] = useState<DocType | "all">("all");
  const [status, setStatus] = useState<"all" | "incomplete" | "complete">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusType, setFocusType] = useState<DocType | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [phone, setPhone] = useState(false);
  const [slotState, setSlotState] = useState<Record<string, SlotState>>({});
  const [sideWidth, setSideWidth] = useState(SIDE_DEFAULT);
  const [splitDragging, setSplitDragging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const splitStart = useRef({ x: 0, width: SIDE_DEFAULT });

  const clampSide = useCallback((value: number) => {
    const body = bodyRef.current?.clientWidth ?? 1200;
    const max = Math.max(SIDE_MIN, Math.min(SIDE_MAX, body - 360));
    return Math.min(max, Math.max(SIDE_MIN, Math.round(value)));
  }, []);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(SIDE_KEY));
      if (Number.isFinite(saved) && saved > 0) setSideWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(saved))));
    } catch { /* abaikan: penyimpanan tidak tersedia */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(SIDE_KEY, String(Math.round(sideWidth))); } catch { /* abaikan */ }
  }, [sideWidth]);
  useEffect(() => {
    if (!splitDragging) return;
    const style = document.body.style;
    const cursor = style.cursor;
    const select = style.userSelect;
    style.cursor = "col-resize";
    style.userSelect = "none";
    return () => { style.cursor = cursor; style.userSelect = select; };
  }, [splitDragging]);

  useEffect(() => {
    if (year !== "all" && !years.includes(year)) setYear(years[0] ?? "all");
  }, [years, year]);
  useEffect(() => {
    const tablet = window.matchMedia("(max-width: 1100px)");
    const handset = window.matchMedia("(max-width: 760px)");
    const apply = () => { setNarrow(tablet.matches); setPhone(handset.matches); };
    apply();
    tablet.addEventListener("change", apply);
    handset.addEventListener("change", apply);
    return () => { tablet.removeEventListener("change", apply); handset.removeEventListener("change", apply); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const inYear = useMemo(
    () => folders.filter((f) => year === "all" || f.trip.startDate.startsWith(year)),
    [folders, year],
  );
  const departments = useMemo(
    () => [...new Set(inYear.map((f) => f.trip.department))].sort((a, b) => a.localeCompare(b, "id")),
    [inYear],
  );
  const scoped = useMemo(
    () => inYear.filter((f) => department === "all" || f.trip.department === department),
    [inYear, department],
  );
  const kindCounts = useMemo(() => {
    const map = new Map<DocType, { present: number; missing: number }>();
    for (const type of docTypes) map.set(type, { present: 0, missing: 0 });
    for (const f of scoped) for (const s of f.slots) {
      const entry = map.get(s.type)!;
      if (s.docs.length) entry.present++;
      else if (s.required) entry.missing++;
    }
    return map;
  }, [scoped]);
  const summary = useMemo(() => {
    const withRules = scoped.filter((f) => f.required > 0);
    return {
      maps: scoped.length,
      withRules: withRules.length,
      complete: withRules.filter((f) => f.complete).length,
      photos: scoped.reduce((n, f) => n + f.photos, 0),
      pdfs: scoped.reduce((n, f) => n + f.pdfs, 0),
      physical: scoped.reduce((n, f) => n + f.physical, 0),
      empty: scoped.filter((f) => f.trip.documents.length === 0).length,
    };
  }, [scoped]);
  const rows = useMemo(() => {
    const list = scoped.filter((f) =>
      (kind === "all" || f.missing.includes(kind)) &&
      (status === "all" || (status === "complete" ? f.complete : f.required > 0 && !f.complete)) &&
      folderMatches(f, query),
    );
    return list.sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate) || a.trip.sptNo.localeCompare(b.trip.sptNo));
  }, [scoped, kind, status, query]);

  const open = folders.find((f) => f.trip.id === openId) ?? null;
  const viewer = open?.trip.documents.find((d) => d.id === viewerId) ?? null;
  const scopeLabel = [year === "all" ? "semua tahun" : `tahun ${year}`, department === "all" ? "" : department]
    .filter(Boolean).join(", ");
  const completeShare = summary.withRules ? Math.round((summary.complete / summary.withRules) * 100) : 0;
  const filtered = kind !== "all" || status !== "all" || query.trim() !== "";

  const openFolder = useCallback((id: string, type: DocType | null = null) => {
    setOpenId(id);
    setFocusType(type);
    setViewerId(null);
  }, []);
  const reset = () => { setKind("all"); setStatus("all"); setQuery(""); };
  const patchSlot = (id: string, type: DocType, patch: SlotState) =>
    setSlotState((s) => ({ ...s, [`${id}:${type}`]: { ...s[`${id}:${type}`], ...patch } }));

  async function upload(folder: Folder, type: DocType, files: File[]) {
    if (!files.length || busyRef.current) return;
    busyRef.current = true;
    let current = folder.trip;
    let saved = 0;
    patchSlot(folder.trip.id, type, { error: "" });
    try {
      for (const [index, file] of files.entries()) {
        patchSlot(folder.trip.id, type, { uploading: files.length > 1 ? `Menyimpan ${index + 1} dari ${files.length}` : "Menyimpan foto" });
        const data = new FormData();
        data.set("tripId", current.id);
        data.set("version", String(current.version));
        data.set("type", type);
        data.set("kind", "file");
        data.set("file", file);
        current = await api<Trip>("/api/documents", { method: "POST", body: data });
        onChange(current);
        saved++;
      }
      notify(saved === 1 ? `${docLabels[type]} disimpan ke map.` : `${saved} berkas ${docLabels[type].toLowerCase()} disimpan ke map.`);
    } catch (e) {
      patchSlot(folder.trip.id, type, { error: (e as Error).message });
      if (saved) notify(`${saved} dari ${files.length} berkas tersimpan.`);
    } finally {
      patchSlot(folder.trip.id, type, { uploading: "" });
      busyRef.current = false;
    }
  }
  async function notePhysical(folder: Folder, type: DocType, location: string) {
    if (busyRef.current) return false;
    busyRef.current = true;
    patchSlot(folder.trip.id, type, { error: "", uploading: "Mencatat lokasi" });
    try {
      const data = new FormData();
      data.set("tripId", folder.trip.id);
      data.set("version", String(folder.trip.version));
      data.set("type", type);
      data.set("kind", "physical");
      data.set("location", location);
      onChange(await api<Trip>("/api/documents", { method: "POST", body: data }));
      notify(`Lokasi berkas fisik ${docLabels[type].toLowerCase()} dicatat.`);
      return true;
    } catch (e) {
      patchSlot(folder.trip.id, type, { error: (e as Error).message });
      return false;
    } finally {
      patchSlot(folder.trip.id, type, { uploading: "" });
      busyRef.current = false;
    }
  }
  async function remove(folder: Folder, doc: DocumentItem) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      onChange(await api<Trip>(`/api/documents/${doc.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: folder.trip.version }),
      }));
      setViewerId(null);
      notify(doc.kind === "physical" ? "Catatan berkas fisik dihapus." : "Berkas dihapus dari map.");
    } catch (e) {
      patchSlot(folder.trip.id, doc.type as DocType, { error: (e as Error).message });
      setViewerId(null);
    } finally {
      busyRef.current = false;
    }
  }

  const panel = open ? (
    <MapPanel
      key={open.trip.id}
      folder={open}
      focusType={focusType}
      slotState={slotState}
      onUpload={upload}
      onNote={notePhysical}
      onView={(id) => setViewerId(id)}
      onOpenArchive={() => onOpen(open.trip.id)}
      onClose={() => setOpenId(null)}
      closable={narrow}
    />
  ) : (
    <div className="dokumen-map dokumen-map-empty">
      <FolderOpen aria-hidden="true" />
      <h2>Pilih map dari daftar</h2>
      <p>Map yang terbuka menampilkan tujuh kantong dokumen. Jatuhkan foto ke kantongnya, atau gunakan tombol Tambah foto pada setiap kantong.</p>
    </div>
  );

  return (
    <div className="dokumen-page">
      <header className="ledger-head">
        <div>
          <h1>Dokumen</h1>
          <p>Daftar kelengkapan berkas setiap perjalanan. Foto surat tugas, SPPD, kuitansi, dan bukti lainnya tersimpan pada map perjalanannya masing-masing.</p>
        </div>
      </header>

      <nav className="ledger-years" aria-label="Tahun pelaksanaan">
        {years.map((y) => (
          <button key={y} className="ledger-year" aria-pressed={year === y} onClick={() => { setYear(y); setOpenId(null); }}>
            <strong>{y}</strong>
            <span>{folders.filter((f) => f.trip.startDate.startsWith(y)).length} map</span>
          </button>
        ))}
        <button className="ledger-year ledger-year-all" aria-pressed={year === "all"} onClick={() => { setYear("all"); setOpenId(null); }}>
          <strong>Semua</strong>
          <span>{folders.length} map</span>
        </button>
      </nav>

      <section className="ledger-sheet dokumen-sheet" aria-label="Daftar kelengkapan berkas">
        {!phone && <div className="dokumen-index" role="group" aria-label="Jenis dokumen">
          <button className="dokumen-index-all" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
            <strong>Semua jenis</strong>
            <span>{scoped.length} map</span>
          </button>
          <div className="dokumen-kinds">
            {docTypes.map((type) => {
              const counts = kindCounts.get(type)!;
              const disabled = counts.present === 0 && counts.missing === 0;
              return (
                <button key={type} className="dokumen-kind" aria-pressed={kind === type} disabled={disabled}
                  data-missing={counts.missing > 0 ? "true" : undefined}
                  aria-label={`${docLabels[type]}: ${counts.present} map sudah ada, ${counts.missing} map belum ada`}
                  title={docLabels[type]}
                  onClick={() => setKind(kind === type ? "all" : type)}>
                  <strong>{docShort[type]}</strong>
                  <span><b>{counts.present}</b> ada</span>
                  <span className={counts.missing ? "is-missing" : ""}>
                    {disabled ? "tidak ada" : counts.missing ? <><b>{counts.missing}</b> belum</> : "lengkap"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>}

        <div className="ledger-summary dokumen-summary" aria-label={`Ringkasan kelengkapan ${scopeLabel}`}>
          <div>
            <span className="ledger-summary-label">Map dengan berkas lengkap, {scopeLabel}</span>
            {summary.withRules
              ? <p className="ledger-figure">{summary.complete.toLocaleString("id-ID")}<small>dari {summary.withRules} map</small></p>
              : <p className="ledger-figure is-empty">Belum ada map</p>}
            <div className="ledger-summary-facts">
              <span><strong>{summary.photos}</strong> foto</span>
              <span><strong>{summary.pdfs}</strong> PDF</span>
              <span><strong>{summary.physical}</strong> catatan berkas fisik</span>
              {summary.empty > 0 && <span className="is-warning"><strong>{summary.empty}</strong> map masih kosong</span>}
            </div>
          </div>
          <div>
            <div className="ledger-summary-row"><span>Berkas lengkap</span><strong>{summary.complete} dari {summary.withRules}</strong></div>
            <div className={`ledger-bar ${summary.withRules ? "" : "is-empty"}`} role="img" aria-label={`${completeShare} persen map berkas lengkap`}>
              {summary.withRules > 0 && <span style={{ width: `${completeShare}%` }} />}
            </div>
            <div className="ledger-legend">
              <span><i /><strong>{summary.complete}</strong> lengkap</span>
              <span><i className="draft" /><strong>{summary.withRules - summary.complete}</strong> masih kurang</span>
            </div>
          </div>
        </div>

        <div className="ledger-register dokumen-register">
        <div className="ledger-register-head dokumen-register-head">
          <div className="ledger-register-title">
            <h2>Daftar kelengkapan berkas</h2>
            <span>{scopeLabel}</span>
          </div>
          <div className="ledger-status" role="group" aria-label="Kelengkapan map">
            <button aria-pressed={status === "all"} onClick={() => setStatus("all")}>Semua <b>{scoped.length}</b></button>
            <button aria-pressed={status === "incomplete"} onClick={() => setStatus("incomplete")}>Masih kurang <b>{summary.withRules - summary.complete}</b></button>
            <button aria-pressed={status === "complete"} onClick={() => setStatus("complete")}>Lengkap <b>{summary.complete}</b></button>
          </div>
        </div>
        <div className="ledger-filters dokumen-filters">
          <div className="ledger-search">
            <Search size={17} aria-hidden="true" />
            <input ref={searchRef} aria-label="Cari map" aria-keyshortcuts="/"
              placeholder="Cari nomor surat, nama pegawai, tujuan, atau lokasi map"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            {query ? <button onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={15} /></button> : <kbd aria-hidden="true">/</kbd>}
          </div>
          <div className="ledger-filter-group">
            {phone && (
              <CustomSelect aria-label="Jenis dokumen" className="ledger-select dokumen-kind-select" value={kind}
                onValueChange={(v) => setKind(v as DocType | "all")} data-active={kind !== "all"}>
                <SelectOption value="all">Semua jenis</SelectOption>
                {docTypes.filter((type) => kind === type || (kindCounts.get(type)?.missing ?? 0) > 0).map((type) => (
                  <SelectOption key={type} value={type}>Perlu {docShort[type]}, {kindCounts.get(type)?.missing ?? 0} map</SelectOption>
                ))}
              </CustomSelect>
            )}
            <CustomSelect aria-label="Bidang" className="ledger-select" value={department}
              onValueChange={(v) => { setDepartment(v); setOpenId(null); }} data-active={department !== "all"}>
              <SelectOption value="all">Semua bidang</SelectOption>
              {departments.map((d) => <SelectOption key={d} value={d}>{d}</SelectOption>)}
            </CustomSelect>
          </div>
          <div className="ledger-filters-end">
            <span className="ledger-result"><strong>{rows.length}</strong> map</span>
          </div>
        </div>

        <div
          ref={bodyRef}
          className={`dokumen-body ${open ? "has-open" : ""}`}
          style={!narrow ? ({ "--dokumen-side": `${sideWidth}px` } as CSSProperties) : undefined}
        >
          {phone && rows.length > 0 && (
            <ul className="dokumen-cards" aria-label="Daftar map">
              {rows.map((f) => (
                <li key={f.trip.id} className="dokumen-card" data-complete={f.complete ? "true" : f.required ? "false" : "none"}>
                  <button className="dokumen-card-open" onClick={() => openFolder(f.trip.id)} aria-label={`Buka map ${f.trip.sptNo || f.names}`}>
                    <span className="dokumen-ref">{f.trip.sptNo || "Tanpa nomor ST"}</span>
                    <span className="dokumen-names">{f.names}</span>
                    <span className="dokumen-meta">{f.trip.destination}, {tripDates(f.trip)}</span>
                  </button>
                  <div className="dokumen-card-marks">
                    {f.slots.map((s) => {
                      const state = s.docs.length ? "present" : s.required ? "missing" : "none";
                      return (
                        <span key={s.type} className={`dokumen-mark ${kind === s.type ? "is-active" : ""}`}>
                          <button className="dokumen-cell" data-state={state} onClick={() => openFolder(f.trip.id, s.type)}
                            aria-label={`${docLabels[s.type]}: ${state === "present" ? `${s.docs.length} berkas` : state === "missing" ? (f.explicit ? "belum ada, wajib" : "belum difoto") : "tidak diminta"}`}>
                            {state === "present" ? (s.docs.length > 1 ? s.docs.length : <Check size={14} strokeWidth={2.5} aria-hidden="true" />) : null}
                          </button>
                          <small>{docShort[s.type]}</small>
                        </span>
                      );
                    })}
                  </div>
                  <span className={`dokumen-card-state ${f.complete ? "is-complete" : f.required ? "is-missing" : "is-none"}`}>
                    {f.required
                      ? `${f.present} dari ${f.required}, ${f.complete ? "lengkap" : f.present === 0 ? "belum ada foto" : `kurang ${f.missing.map((m) => docShort[m]).join(", ")}`}`
                      : f.trip.documents.length ? `${f.trip.documents.length} berkas, tanpa syarat` : "Kosong, tanpa syarat"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="dokumen-matrix-wrap" hidden={phone && rows.length > 0}>
            {rows.length ? (
              <table className="dokumen-matrix" aria-label="Matriks kelengkapan berkas">
                <thead>
                  <tr>
                    <th scope="col" className="dokumen-col-map">Perjalanan</th>
                    {docTypes.map((type) => (
                      <th scope="col" key={type} className={`dokumen-col-kind ${kind === type ? "is-active" : ""}`} title={docLabels[type]}>
                        <span>{docShort[type]}</span>
                      </th>
                    ))}
                    <th scope="col" className="dokumen-col-state">Kelengkapan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.trip.id} className="dokumen-row" data-open={open?.trip.id === f.trip.id ? "true" : undefined}
                      data-complete={f.complete ? "true" : f.required ? "false" : "none"}>
                      <td className="dokumen-col-map">
                        <button className="dokumen-open" onClick={() => openFolder(f.trip.id)} aria-expanded={open?.trip.id === f.trip.id}
                          aria-label={`Buka map ${f.trip.sptNo || f.names}`}>
                          <span className="dokumen-ref">{f.trip.sptNo || "Tanpa nomor ST"}</span>
                          <span className="dokumen-names">{f.names}</span>
                          <span className="dokumen-meta">{f.trip.destination}, {tripDates(f.trip)}</span>
                        </button>
                      </td>
                      {f.slots.map((s) => {
                        const state = s.docs.length ? "present" : s.required ? "missing" : "none";
                        return (
                          <td key={s.type} className={`dokumen-col-kind ${kind === s.type ? "is-active" : ""}`}>
                            <button className="dokumen-cell" data-state={state} onClick={() => openFolder(f.trip.id, s.type)}
                              aria-label={`${docLabels[s.type]}: ${state === "present" ? `${s.docs.length} berkas` : state === "missing" ? (f.explicit ? "belum ada, wajib" : "belum difoto") : "tidak diminta"}`}>
                              {state === "present" ? (s.docs.length > 1 ? s.docs.length : <Check size={14} strokeWidth={2.5} aria-hidden="true" />) : null}
                            </button>
                          </td>
                        );
                      })}
                      <td className="dokumen-col-state">
                        {f.required ? (
                          <span className={`dokumen-state ${f.complete ? "is-complete" : "is-missing"}`}>
                            <b>{f.present} dari {f.required}</b>
                            <span>{f.complete ? "lengkap" : f.present === 0 ? "belum ada foto" : `kurang ${f.missing.map((m) => docShort[m]).join(", ")}`}</span>
                          </span>
                        ) : (
                          <span className="dokumen-state is-none">
                            <b>{f.trip.documents.length ? `${f.trip.documents.length} berkas` : "Kosong"}</b>
                            <span>tanpa syarat</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty
                icon={<FolderOpen size={28} />}
                heading={scoped.length ? "Tidak ada map yang cocok" : "Belum ada perjalanan pada lingkup ini"}
                description={scoped.length
                  ? "Ubah kata kunci, jenis dokumen, atau status kelengkapan."
                  : "Map berkas mengikuti arsip perjalanan. Tambahkan arsip terlebih dahulu."}
                action={filtered ? <Button variant="outline" size="sm" onClick={reset}>Tampilkan semua map</Button> : undefined}
              />
            )}
          </div>
          {!narrow && (
            <div
              className="dokumen-splitter"
              role="separator"
              aria-orientation="vertical"
              aria-label="Pengatur lebar map berkas"
              aria-valuemin={SIDE_MIN}
              aria-valuemax={SIDE_MAX}
              aria-valuenow={Math.round(sideWidth)}
              title="Seret untuk mengatur lebar, klik ganda untuk mengembalikan"
              tabIndex={0}
              data-dragging={splitDragging ? "true" : undefined}
              onPointerDown={(event) => {
                event.preventDefault();
                try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* abaikan: tetap seret tanpa tangkapan */ }
                splitStart.current = { x: event.clientX, width: sideWidth };
                setSplitDragging(true);
              }}
              onPointerMove={(event) => {
                if (!splitDragging) return;
                setSideWidth(clampSide(splitStart.current.width + (splitStart.current.x - event.clientX)));
              }}
              onPointerUp={() => setSplitDragging(false)}
              onPointerCancel={() => setSplitDragging(false)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 48 : 16;
                if (event.key === "ArrowLeft") { event.preventDefault(); setSideWidth(clampSide(sideWidth + step)); }
                else if (event.key === "ArrowRight") { event.preventDefault(); setSideWidth(clampSide(sideWidth - step)); }
                else if (event.key === "Home") { event.preventDefault(); setSideWidth(SIDE_MIN); }
                else if (event.key === "End") { event.preventDefault(); setSideWidth(clampSide(SIDE_MAX)); }
              }}
              onDoubleClick={() => setSideWidth(SIDE_DEFAULT)}
            >
              <span aria-hidden="true" />
            </div>
          )}
          {!narrow && <aside className="dokumen-side" aria-label="Map berkas terbuka">{panel}</aside>}
        </div>
        </div>
      </section>

      {narrow && open && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpenId(null); }}>
          <DialogContent className="dokumen-map-dialog" showCloseButton={false}>
            <DialogTitle className="sr-only">Map berkas {open.trip.sptNo || open.names}</DialogTitle>
            <DialogDescription className="sr-only">Kantong dokumen perjalanan</DialogDescription>
            {panel}
          </DialogContent>
        </Dialog>
      )}

      {open && viewer && (
        <Viewer folder={open} doc={viewer} onClose={() => setViewerId(null)} onSelect={(id) => setViewerId(id)}
          onRemove={() => remove(open, viewer)} />
      )}
    </div>
  );
}

function MapPanel({ folder, focusType, slotState, onUpload, onNote, onView, onOpenArchive, onClose, closable }: {
  folder: Folder;
  focusType: DocType | null;
  slotState: Record<string, SlotState>;
  onUpload: (folder: Folder, type: DocType, files: File[]) => void;
  onNote: (folder: Folder, type: DocType, location: string) => Promise<boolean>;
  onView: (id: string) => void;
  onOpenArchive: () => void;
  onClose: () => void;
  closable: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!focusType || !listRef.current) return;
    const target = listRef.current.querySelector<HTMLElement>(`[data-type="${focusType}"]`);
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    target?.querySelector<HTMLElement>("label, button")?.focus({ preventScroll: true });
  }, [focusType, folder.trip.id]);
  const t = folder.trip;
  const ordered = [...folder.slots].sort((a, b) => Number(b.required) - Number(a.required));
  return (
    <div className="dokumen-map">
      <div className="dokumen-map-head">
        <div className="dokumen-map-kicker">
          <span>Map berkas</span>
          {closable && (
            <button className="dokumen-map-close" onClick={onClose} aria-label="Tutup map"><X size={18} /></button>
          )}
        </div>
        <h2 className="dokumen-map-ref">{t.sptNo || "Tanpa nomor ST"}</h2>
        <p className="dokumen-map-names">{folder.names}</p>
        <p className="dokumen-map-meta">{t.destination}, {tripDates(t)}. Bidang {t.department}.</p>
        <div className="dokumen-map-facts">
          <span className={`dokumen-map-state ${folder.complete ? "is-complete" : folder.required ? "is-missing" : ""}`}>
            {folder.required ? `${folder.present} dari ${folder.required} berkas ${folder.explicit ? "wajib" : "baku"}` : "Tanpa syarat dokumen"}
          </span>
          <button className="dokumen-map-link" onClick={onOpenArchive}>Buka rekap <ExternalLink size={13} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="dokumen-map-location">
        <MapPin size={15} aria-hidden="true" />
        {folder.location
          ? <span>Berkas fisik di <strong>{folder.location}</strong></span>
          : <span className="is-empty">Lokasi berkas fisik belum dicatat</span>}
      </div>
      <ol className="dokumen-slots" ref={listRef}>
        {ordered.map((slot) => (
          <SlotItem key={slot.type} slot={slot} folder={folder} state={slotState[`${t.id}:${slot.type}`] ?? {}}
            highlighted={focusType === slot.type} onUpload={onUpload} onNote={onNote} onView={onView} />
        ))}
      </ol>
    </div>
  );
}

function SlotItem({ slot, folder, state, highlighted, onUpload, onNote, onView }: {
  slot: Slot;
  folder: Folder;
  state: SlotState;
  highlighted: boolean;
  onUpload: (folder: Folder, type: DocType, files: File[]) => void;
  onNote: (folder: Folder, type: DocType, location: string) => Promise<boolean>;
  onView: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [noting, setNoting] = useState(false);
  const [location, setLocation] = useState(folder.location);
  const inputId = `dokumen-file-${folder.trip.id}-${slot.type}`;
  const busy = Boolean(state.uploading);
  const photos = slot.docs.filter(isImage).length;
  const pdfs = slot.docs.filter((d) => d.kind === "file" && !isImage(d)).length;
  const notes = slot.docs.filter((d) => d.kind === "physical").length;
  const status = slot.docs.length
    ? [photos ? `${photos} foto` : "", pdfs ? `${pdfs} PDF` : "", notes ? `${notes} catatan fisik` : ""].filter(Boolean).join(", ")
    : slot.required ? (folder.explicit ? "Belum ada, wajib" : "Belum difoto") : "Tidak diminta";
  const tone = slot.docs.length ? "present" : slot.required ? "missing" : "none";

  const accept = (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((f) => /\.(jpe?g|png|pdf)$/i.test(f.name) || /^(image\/(jpeg|png)|application\/pdf)$/.test(f.type));
    if (list.length) onUpload(folder, slot.type, list);
  };
  const onDrop = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) accept(e.dataTransfer.files);
  };
  const onDrag = (e: DragEvent<HTMLLIElement>, over: boolean) => {
    e.preventDefault();
    if (!busy) setDragging(over);
  };

  return (
    <li className="dokumen-slot" data-type={slot.type} data-tone={tone} data-highlight={highlighted ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      onDragOver={(e) => onDrag(e, true)} onDragEnter={(e) => onDrag(e, true)} onDragLeave={(e) => onDrag(e, false)} onDrop={onDrop}>
      <div className="dokumen-slot-head">
        <div>
          <h3>{docLabels[slot.type]}</h3>
          <span className="dokumen-slot-status">{busy ? <><LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> {state.uploading}…</> : status}</span>
        </div>
        <label htmlFor={inputId} className={`dokumen-add ${busy ? "is-busy" : ""}`} aria-disabled={busy}>
          <ImagePlus size={15} aria-hidden="true" /> Tambah foto
        </label>
        <input id={inputId} type="file" className="sr-only" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" multiple
          disabled={busy} onChange={(e) => { accept(e.target.files); e.target.value = ""; }} />
      </div>
      {slot.docs.length > 0 && (
        <ul className="dokumen-thumbs">
          {slot.docs.map((d) => (
            <li key={d.id}>
              <button className={`dokumen-thumb is-${d.kind === "physical" ? "physical" : isImage(d) ? "image" : "pdf"}`} onClick={() => onView(d.id)}
                aria-label={d.kind === "physical" ? `Catatan berkas fisik: ${d.location}` : `Buka ${d.name}`} title={d.kind === "physical" ? d.location : d.name}>
                {d.kind === "physical"
                  ? <><FolderOpen size={16} aria-hidden="true" /><span>{d.location}</span></>
                  : isImage(d)
                    ? <img src={`/api/documents/${d.id}`} alt="" loading="lazy" decoding="async" />
                    : <><FileText size={18} aria-hidden="true" /><span>PDF</span></>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dokumen-slot-foot">
        {noting ? (
          <form className="dokumen-note" onSubmit={async (e) => { e.preventDefault(); if (await onNote(folder, slot.type, location)) setNoting(false); }}>
            <input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={500} autoFocus
              aria-label={`Lokasi berkas fisik ${docLabels[slot.type]}`} placeholder="Lemari, nomor map, dan tahun arsip" />
            <Button type="submit" size="sm" disabled={busy}>Simpan</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNoting(false)} disabled={busy}>Batal</Button>
          </form>
        ) : (
          <span className="dokumen-slot-hint">
            {dragging ? "Lepaskan untuk menyimpan ke kantong ini" : <>
              <span className="dokumen-slot-format">JPG, PNG, atau PDF sampai 10 MB.</span>
              <button type="button" className="dokumen-note-toggle" onClick={() => setNoting(true)} disabled={busy}>
                <Camera size={13} aria-hidden="true" /> Hanya berkas fisik? Catat lokasinya
              </button>
            </>}
          </span>
        )}
        <ErrorMessage message={state.error ?? ""} />
      </div>
    </li>
  );
}

function Viewer({ folder, doc, onClose, onSelect, onRemove }: {
  folder: Folder;
  doc: DocumentItem;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const siblings = folder.trip.documents.filter((d) => d.type === doc.type);
  const index = siblings.findIndex((d) => d.id === doc.id);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  useEffect(() => { setConfirming(false); }, [doc.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && prev) onSelect(prev.id);
      if (e.key === "ArrowRight" && next) onSelect(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onSelect]);
  let body: ReactNode;
  if (doc.kind === "physical") {
    body = (
      <div className="dokumen-viewer-note">
        <FolderOpen aria-hidden="true" />
        <p>Berkas fisik tersimpan di</p>
        <strong>{doc.location}</strong>
      </div>
    );
  } else if (isImage(doc)) {
    body = <img src={`/api/documents/${doc.id}`} alt={`${docLabels[doc.type]}, ${doc.name}`} />;
  } else {
    body = <iframe src={`/api/documents/${doc.id}`} title={doc.name} />;
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="dokumen-viewer" showCloseButton={false}>
        <div className="dokumen-viewer-head">
          <div>
            <DialogTitle className="dokumen-viewer-title">{docLabels[doc.type]}</DialogTitle>
            <DialogDescription className="dokumen-viewer-sub">
              {doc.kind === "physical" ? "Catatan berkas fisik" : `${doc.name}, ${kb(doc.size)}`}. Map {folder.trip.sptNo || folder.names}.
            </DialogDescription>
          </div>
          <div className="dokumen-viewer-tools">
            {siblings.length > 1 && (
              <span className="dokumen-viewer-count">{index + 1} dari {siblings.length}</span>
            )}
            {doc.kind === "file" && (
              <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="dokumen-viewer-link">
                Buka di tab baru <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
            <button className="dokumen-viewer-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
          </div>
        </div>
        <div className={`dokumen-viewer-stage ${doc.kind === "physical" ? "is-note" : ""}`}>
          {prev && <button className="dokumen-viewer-nav is-prev" onClick={() => onSelect(prev.id)} aria-label="Berkas sebelumnya"><ChevronLeft /></button>}
          {body}
          {next && <button className="dokumen-viewer-nav is-next" onClick={() => onSelect(next.id)} aria-label="Berkas berikutnya"><ChevronRight /></button>}
        </div>
        <div className="dokumen-viewer-foot">
          <span>Ditambahkan {dateText(doc.createdAt.slice(0, 10))}</span>
          {confirming ? (
            <span className="dokumen-viewer-confirm">
              <span>Hapus {doc.kind === "physical" ? "catatan ini" : "berkas ini"} dari map?</span>
              <Button size="sm" variant="destructive" onClick={onRemove}>Ya, hapus</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Batal</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="dokumen-viewer-remove" onClick={() => setConfirming(true)}>
              <Trash2 /> Hapus dari map
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

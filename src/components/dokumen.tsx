"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft, BedDouble, Camera, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, FileBadge, FileCheck,
  FileSignature, FileText, FolderOpen, ImagePlus, LoaderCircle, Paperclip, Receipt, Search, Ticket, Trash2, X, type LucideIcon,
} from "lucide-react";
import { dateText, docLabels, type DocumentItem, type Trip } from "@/lib/model";
import { api, Empty, ErrorMessage } from "./fields";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/*
  Dokumen: papan kelengkapan berkas.
  Setiap rekap adalah satu map; setiap jenis dokumen adalah satu kantong di dalam map.
  Papan di atas merangkum tujuh jenis dokumen sekaligus menjadi saringan; daftar di bawahnya
  adalah matriks kelengkapan (baris map, kolom jenis dokumen). Map yang dibuka menggantikan
  daftar di bingkai yang sama, dengan kantong-kantong sebagai zona jatuh berkas.
*/

export const docTypes = ["spt", "sppd", "report", "receipt", "ticket", "hotel", "other"] as const;
export type DocType = (typeof docTypes)[number];
export const docShort: Record<DocType, string> = {
  spt: "SPT", sppd: "SPPD", report: "Laporan", receipt: "Kuitansi", ticket: "Tiket", hotel: "Hotel", other: "Lainnya",
};

/* Ikon tiap jenis dokumen pada papan kelengkapan. */
const docIcons: Record<DocType, LucideIcon> = {
  spt: FileSignature, sppd: FileBadge, report: FileCheck, receipt: Receipt, ticket: Ticket, hotel: BedDouble, other: Paperclip,
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
type FolderNav = { index: number; total: number; prev: (() => void) | null; next: (() => void) | null; nextIncomplete: (() => void) | null };
const pageSizes = [20, 50, 100];

/* Layar sempit memakai kartu, bukan matriks; hanya satu yang dirender. */
const narrowQuery = "(max-width: 760px)";
function subscribeNarrow(callback: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const useIsNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);

const cellState = (slot: Slot) => (slot.docs.length ? "present" : slot.required ? "missing" : "none");
const cellLabel = (f: Folder, slot: Slot) => {
  const state = cellState(slot);
  return `${docLabels[slot.type]}: ${state === "present" ? `${slot.docs.length} berkas` : state === "missing" ? (f.explicit ? "belum ada, wajib" : "belum difoto") : "tidak diminta"}`;
};
const folderStateText = (f: Folder) => f.required
  ? (f.complete ? "lengkap" : f.present === 0 ? "belum ada berkas" : `kurang ${f.missing.map((m) => docShort[m]).join(", ")}`)
  : f.trip.documents.length ? `${f.trip.documents.length} berkas, tanpa syarat` : "kosong, tanpa syarat";

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
  const [slotState, setSlotState] = useState<Record<string, SlotState>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const narrow = useIsNarrow();
  const searchRef = useRef<HTMLInputElement>(null);
  const rosterRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (year !== "all" && !years.includes(year)) setYear(years[0] ?? "all");
  }, [years, year]);
  /* "/" memfokuskan pencarian (menutup map bila terbuka); Escape kembali ke daftar selama penampil tidak terbuka. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" && openId && !document.querySelector('[data-slot="dialog-content"]')) {
        setOpenId(null); return;
      }
      if (event.key !== "/") return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      if (openId) { setOpenId(null); requestAnimationFrame(() => searchRef.current?.focus()); }
      else searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const inYear = useMemo(
    () => folders.filter((f) => year === "all" || f.trip.startDate.startsWith(year)),
    [folders, year],
  );
  const departments = useMemo(
    () => [...new Set(inYear.map((f) => f.trip.department))].sort((a, b) => a.localeCompare(b, "id")),
    [inYear],
  );
  useEffect(() => {
    if (department !== "all" && !departments.includes(department)) setDepartment("all");
  }, [departments, department]);
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
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageIndex, pageCount - 1);
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  // biome-ignore lint/correctness/useExhaustiveDependencies: kembali ke halaman pertama saat saringan berubah
  useEffect(() => { setPageIndex(0); }, [kind, status, query, department, year, pageSize]);

  const open = folders.find((f) => f.trip.id === openId) ?? null;
  const viewer = open?.trip.documents.find((d) => d.id === viewerId) ?? null;
  const scopeLabel = [year === "all" ? "semua tahun" : `tahun ${year}`, department === "all" ? "" : department]
    .filter(Boolean).join(", ");
  const completeShare = summary.withRules ? Math.round((summary.complete / summary.withRules) * 100) : 0;

  const chips = useMemo(() => {
    const list: { key: string; label: string; clear: () => void }[] = [];
    if (department !== "all") list.push({ key: "department", label: department, clear: () => setDepartment("all") });
    if (kind !== "all") list.push({ key: "kind", label: `Belum ada ${docShort[kind]}`, clear: () => setKind("all") });
    if (status !== "all") list.push({ key: "status", label: status === "complete" ? "Lengkap" : "Masih kurang", clear: () => setStatus("all") });
    if (query.trim()) list.push({ key: "query", label: `“${query.trim()}”`, clear: () => setQuery("") });
    return list;
  }, [department, kind, status, query]);
  const clearAll = useCallback(() => { setDepartment("all"); setKind("all"); setStatus("all"); setQuery(""); }, []);

  const openFolder = useCallback((id: string, type: DocType | null = null) => {
    setOpenId(id);
    setFocusType(type);
    setViewerId(null);
  }, []);
  const patchSlot = (id: string, type: DocType, patch: SlotState) =>
    setSlotState((s) => ({ ...s, [`${id}:${type}`]: { ...s[`${id}:${type}`], ...patch } }));

  /* Navigasi map mengikuti urutan daftar yang tampil; "berikutnya yang masih kurang" melingkar ke awal bila perlu. */
  const openIndex = open ? rows.findIndex((f) => f.trip.id === open.trip.id) : -1;
  const jumpTo = (target: Folder | undefined) => {
    if (!target) return;
    openFolder(target.trip.id);
    const at = rows.findIndex((f) => f.trip.id === target.trip.id);
    if (at >= 0) setPageIndex(Math.floor(at / pageSize));
  };
  const nextIncomplete = (() => {
    if (!open) return undefined;
    const order = openIndex >= 0 ? [...rows.slice(openIndex + 1), ...rows.slice(0, Math.max(openIndex, 0))] : rows;
    return order.find((f) => f.required > 0 && !f.complete && f.trip.id !== open.trip.id);
  })();
  const nav: FolderNav = {
    index: openIndex, total: rows.length,
    prev: openIndex > 0 ? () => jumpTo(rows[openIndex - 1]) : null,
    next: openIndex >= 0 && openIndex < rows.length - 1 ? () => jumpTo(rows[openIndex + 1]) : null,
    nextIncomplete: nextIncomplete ? () => jumpTo(nextIncomplete) : null,
  };

  async function upload(folder: Folder, type: DocType, files: File[]) {
    if (!files.length || busyRef.current) return;
    busyRef.current = true;
    let current = folder.trip;
    let saved = 0;
    patchSlot(folder.trip.id, type, { error: "" });
    try {
      for (const [index, file] of files.entries()) {
        patchSlot(folder.trip.id, type, { uploading: files.length > 1 ? `Menyimpan ${index + 1} dari ${files.length}` : "Menyimpan berkas" });
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
  function go(next: number) {
    setPageIndex(next);
    if (narrow) rosterRef.current?.scrollIntoView({ block: "start" });
  }

  const identity = (f: Folder) => (
    <button type="button" className="dokumen-open" onClick={() => openFolder(f.trip.id)} aria-label={`Buka map ${f.trip.sptNo || f.names}`}>
      <span className="dokumen-ref">{f.trip.sptNo || "Tanpa nomor ST"}</span>
      <span className="dokumen-names">{f.names}</span>
      <span className="dokumen-meta">{f.trip.destination}, {tripDates(f.trip)}</span>
    </button>
  );
  const stateCell = (f: Folder) => (
    <span className={`dokumen-state ${f.complete ? "is-complete" : f.required ? "is-missing" : "is-none"}`}>
      <b>{f.required ? `${f.present} dari ${f.required}` : f.trip.documents.length ? `${f.trip.documents.length} berkas` : "Kosong"}</b>
      <span>{f.required ? folderStateText(f) : "tanpa syarat"}</span>
    </span>
  );

  return (
    <div className="dokumen-page">
      <header className="dokumen-head">
        <div>
          <h1>Dokumen</h1>
          <p>Kelengkapan berkas setiap perjalanan dinas. Foto atau PDF surat tugas, SPPD, laporan, dan bukti biaya tersimpan pada map perjalanannya.</p>
        </div>
        <CustomSelect aria-label="Tahun pelaksanaan" className="dokumen-year" value={year}
          onValueChange={(v) => { setYear(v); setOpenId(null); }}>
          {years.map((y) => <SelectOption key={y} value={y}>Tahun {y}</SelectOption>)}
          <SelectOption value="all">Semua tahun</SelectOption>
        </CustomSelect>
      </header>

      {!open && (
        <section className="dokumen-board" aria-labelledby="dokumen-board-title">
          <div className="dokumen-board-head">
            <div>
              <h2 id="dokumen-board-title">Kelengkapan berkas, {scopeLabel}</h2>
              <p>Angka pada tiap jenis dokumen adalah map yang sudah punya berkasnya dari seluruh map yang memerlukannya. Pilih jenis untuk melihat map yang masih kekurangannya.</p>
            </div>
            <div className="dokumen-board-total" role="group" aria-label="Map dengan berkas lengkap">
              {summary.withRules
                ? <p><strong>{summary.complete.toLocaleString("id-ID")}</strong><span>dari {summary.withRules} map lengkap</span></p>
                : <p className="is-empty">Belum ada map dengan syarat dokumen</p>}
              <div className="dokumen-board-bar" role="img" aria-label={`${completeShare} persen map lengkap`}>
                <span style={{ width: `${completeShare}%` }} />
              </div>
              <ul className="dokumen-board-facts">
                <li><strong>{summary.photos}</strong> foto</li>
                <li><strong>{summary.pdfs}</strong> PDF</li>
                <li><strong>{summary.physical}</strong> catatan fisik</li>
                {summary.empty > 0 && <li className="is-warning"><strong>{summary.empty}</strong> map kosong</li>}
              </ul>
            </div>
          </div>
          <ol className="dokumen-board-kinds">
            {docTypes.map((type) => {
              const counts = kindCounts.get(type)!;
              const total = counts.present + counts.missing;
              const share = total ? Math.round((counts.present / total) * 100) : 0;
              const idle = total === 0;
              const Icon = docIcons[type];
              return (
                <li key={type}>
                  <button type="button" className="dokumen-board-kind" aria-pressed={kind === type} disabled={idle && kind !== type}
                    data-missing={counts.missing > 0 ? "true" : undefined}
                    aria-label={`${docLabels[type]}: ${counts.present} map sudah ada, ${counts.missing} map belum ada`}
                    onClick={() => setKind(kind === type ? "all" : type)}>
                    <span className="dokumen-board-tile" aria-hidden="true">
                      <Icon size={20} strokeWidth={1.75} />
                      <span className="dokumen-board-count">
                        {idle ? <b>–</b> : <><b>{counts.present}</b><small>/{total}</small></>}
                      </span>
                      <span className="dokumen-board-fill"><i style={{ width: `${share}%` }} /></span>
                    </span>
                    <strong>{docShort[type]}</strong>
                    <span className="dokumen-board-figure">
                      {idle ? "tidak diminta" : counts.missing ? <><b>{counts.missing}</b> belum</> : <><b>{counts.present}</b> lengkap</>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className={`dokumen-roster ${open ? "is-folder" : ""}`} ref={rosterRef} aria-label={open ? `Map berkas ${open.trip.sptNo || open.names}` : "Daftar map berkas"}>
        {open ? (
          <FolderView key={open.trip.id} folder={open} focusType={focusType} slotState={slotState} nav={nav}
            onBack={() => setOpenId(null)} onUpload={upload} onNote={notePhysical} onView={(id) => setViewerId(id)}
            onOpenArchive={() => onOpen(open.trip.id)} />
        ) : <>
          <div className="dokumen-toolbar">
            <div className="dokumen-search">
              <Search size={17} aria-hidden="true" />
              <input ref={searchRef} aria-label="Cari map" aria-keyshortcuts="/" type="search" autoComplete="off"
                placeholder="Cari nomor surat, nama pegawai, tujuan, atau lokasi map"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              {query ? <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={15} /></button> : <kbd aria-hidden="true">/</kbd>}
            </div>
            <div className="dokumen-status-switch" role="group" aria-label="Kelengkapan map">
              <button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")}>Semua <b>{scoped.length}</b></button>
              <button type="button" aria-pressed={status === "incomplete"} onClick={() => setStatus("incomplete")}>Masih kurang <b>{summary.withRules - summary.complete}</b></button>
              <button type="button" aria-pressed={status === "complete"} onClick={() => setStatus("complete")}>Lengkap <b>{summary.complete}</b></button>
            </div>
            <CustomSelect aria-label="Bidang" className="dokumen-select" value={department}
              onValueChange={(v) => setDepartment(v)} data-active={department !== "all"}>
              <SelectOption value="all">Semua bidang</SelectOption>
              {departments.map((d) => <SelectOption key={d} value={d}>{d}</SelectOption>)}
            </CustomSelect>
          </div>
          <div className="dokumen-scope">
            <p role="status"><strong>{rows.length.toLocaleString("id-ID")}</strong> map{chips.length > 0 && " sesuai saringan"}</p>
            {chips.length > 0 && (
              <ul className="dokumen-chips" aria-label="Saringan aktif">
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <button type="button" onClick={chip.clear} aria-label={`Hapus saringan ${chip.label}`}>{chip.label}<X size={13} aria-hidden="true" /></button>
                  </li>
                ))}
                <li><button type="button" className="dokumen-chips-clear" onClick={clearAll}>Bersihkan semua</button></li>
              </ul>
            )}
          </div>

          {rows.length === 0 ? (
            <Empty
              icon={<FolderOpen size={28} />}
              heading={scoped.length ? "Tidak ada map yang cocok" : "Belum ada perjalanan pada lingkup ini"}
              description={scoped.length
                ? "Ubah kata kunci, jenis dokumen, atau status kelengkapan."
                : "Map berkas mengikuti arsip perjalanan. Tambahkan arsip terlebih dahulu."}
              action={chips.length > 0 ? <Button variant="outline" size="sm" onClick={clearAll}>Bersihkan saringan</Button> : undefined}
            />
          ) : narrow ? (
            <ul className="dokumen-cards" aria-label="Daftar map">
              {pageRows.map((f) => (
                <li key={f.trip.id} className="dokumen-card" data-complete={f.complete ? "true" : f.required ? "false" : "none"}>
                  {identity(f)}
                  <div className="dokumen-card-marks">
                    {f.slots.map((s) => (
                      <span key={s.type} className={`dokumen-mark ${kind === s.type ? "is-active" : ""}`}>
                        <button type="button" className="dokumen-cell" data-state={cellState(s)} onClick={() => openFolder(f.trip.id, s.type)} aria-label={cellLabel(f, s)}>
                          {cellState(s) === "present" ? (s.docs.length > 1 ? s.docs.length : <Check size={14} strokeWidth={2.5} aria-hidden="true" />) : null}
                        </button>
                        <small>{docShort[s.type]}</small>
                      </span>
                    ))}
                  </div>
                  {stateCell(f)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="dokumen-matrix-wrap">
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
                    <th scope="col" className="dokumen-col-open"><span className="sr-only">Buka map</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((f) => (
                    <tr key={f.trip.id} className="dokumen-row" data-complete={f.complete ? "true" : f.required ? "false" : "none"}>
                      <td className="dokumen-col-map">{identity(f)}</td>
                      {f.slots.map((s) => (
                        <td key={s.type} className={`dokumen-col-kind ${kind === s.type ? "is-active" : ""}`}>
                          <button type="button" className="dokumen-cell" data-state={cellState(s)} onClick={() => openFolder(f.trip.id, s.type)} aria-label={cellLabel(f, s)}>
                            {cellState(s) === "present" ? (s.docs.length > 1 ? s.docs.length : <Check size={14} strokeWidth={2.5} aria-hidden="true" />) : null}
                          </button>
                        </td>
                      ))}
                      <td className="dokumen-col-state">{stateCell(f)}</td>
                      <td className="dokumen-col-open">
                        <Button variant="ghost" size="icon-sm" className="dokumen-open-folder" aria-label={`Buka map ${f.trip.sptNo || f.names}`} onClick={() => openFolder(f.trip.id)}>
                          <ChevronRight size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="dokumen-pagination">
              <p role="status">Menampilkan <strong>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)}</strong> dari <strong>{rows.length}</strong> map</p>
              <div className="dokumen-page-size">
                <label htmlFor="dokumen-page-size">Per halaman</label>
                <CustomSelect id="dokumen-page-size" value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  {pageSizes.map((size) => <SelectOption key={size} value={String(size)}>{size}</SelectOption>)}
                </CustomSelect>
              </div>
              <nav aria-label="Halaman daftar map">
                <Button variant="outline" size="icon-sm" aria-label="Halaman pertama" disabled={page === 0} onClick={() => go(0)}><ChevronsLeft /></Button>
                <Button variant="outline" size="icon-sm" aria-label="Halaman sebelumnya" disabled={page === 0} onClick={() => go(page - 1)}><ChevronLeft /></Button>
                <span><strong>{page + 1}</strong> / {pageCount}</span>
                <Button variant="outline" size="icon-sm" aria-label="Halaman berikutnya" disabled={page >= pageCount - 1} onClick={() => go(page + 1)}><ChevronRight /></Button>
                <Button variant="outline" size="icon-sm" aria-label="Halaman terakhir" disabled={page >= pageCount - 1} onClick={() => go(pageCount - 1)}><ChevronsRight /></Button>
              </nav>
            </div>
          )}
        </>}
      </section>

      {open && viewer && (
        <Viewer folder={open} doc={viewer} onClose={() => setViewerId(null)} onSelect={(id) => setViewerId(id)}
          onRemove={() => remove(open, viewer)} />
      )}
    </div>
  );
}

/* Map terbuka: menggantikan daftar di bingkai yang sama; tujuh kantong jadi zona jatuh berkas. */
function FolderView({ folder, focusType, slotState, nav, onBack, onUpload, onNote, onView, onOpenArchive }: {
  folder: Folder;
  focusType: DocType | null;
  slotState: Record<string, SlotState>;
  nav: FolderNav;
  onBack: () => void;
  onUpload: (folder: Folder, type: DocType, files: File[]) => void;
  onNote: (folder: Folder, type: DocType, location: string) => Promise<boolean>;
  onView: (id: string) => void;
  onOpenArchive: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fokus ulang saat berpindah map atau kantong
  useEffect(() => {
    const roster = headingRef.current?.closest(".dokumen-roster");
    if (roster && roster.getBoundingClientRect().top < 72) roster.scrollIntoView({ block: "start" });
    if (focusType && listRef.current) {
      const target = listRef.current.querySelector<HTMLElement>(`[data-type="${focusType}"]`);
      target?.scrollIntoView({ block: "nearest" });
      target?.querySelector<HTMLElement>("label, button")?.focus({ preventScroll: true });
    } else {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [focusType, folder.trip.id]);
  const t = folder.trip;
  const ordered = [...folder.slots].sort((a, b) => Number(b.required) - Number(a.required));
  const contents = [folder.photos ? `${folder.photos} foto` : "", folder.pdfs ? `${folder.pdfs} PDF` : "", folder.physical ? `${folder.physical} catatan fisik` : ""].filter(Boolean).join(", ");
  return (
    <div className="dokumen-folder">
      <div className="dokumen-folder-bar">
        <button type="button" className="dokumen-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Daftar map</button>
        <div className="dokumen-folder-nav" role="group" aria-label="Pindah map">
          <Button variant="outline" size="icon-sm" aria-label="Map sebelumnya" disabled={!nav.prev} onClick={() => nav.prev?.()}><ChevronLeft /></Button>
          <span aria-live="polite">{nav.index >= 0 ? `${nav.index + 1} dari ${nav.total}` : "Di luar daftar"}</span>
          <Button variant="outline" size="icon-sm" aria-label="Map berikutnya" disabled={!nav.next} onClick={() => nav.next?.()}><ChevronRight /></Button>
        </div>
      </div>

      <header className="dokumen-folder-head" data-tone={folder.complete ? "complete" : folder.required ? "missing" : "none"}>
        <div className="dokumen-folder-who">
          <span className="dokumen-folder-kind">Map berkas</span>
          <h2 ref={headingRef} tabIndex={-1}>{t.sptNo || "Tanpa nomor ST"}</h2>
          <p className="dokumen-folder-names">{folder.names}</p>
          <p className="dokumen-folder-meta">{t.destination}, {tripDates(t)}. Bidang {t.department}.</p>
        </div>
        <div className="dokumen-folder-actions">
          <Button variant="outline" size="sm" onClick={onOpenArchive}><ExternalLink /> Buka rekap</Button>
        </div>
        <dl className="dokumen-folder-facts">
          <div>
            <dt>{folder.explicit ? "Berkas wajib" : "Berkas baku"}</dt>
            <dd className={folder.complete ? "is-complete" : folder.required ? "is-missing" : ""}>
              {folder.required ? `${folder.present} dari ${folder.required}` : "Tanpa syarat"}
              {folder.required > 0 && (
                <span className="dokumen-folder-steps" aria-hidden="true">
                  {folder.slots.filter((s) => s.required).map((s) => <i key={s.type} data-done={s.docs.length > 0} />)}
                </span>
              )}
            </dd>
          </div>
          <div><dt>Isi map</dt><dd>{contents || <span className="is-empty">Belum ada berkas</span>}</dd></div>
          <div><dt>Lokasi berkas fisik</dt><dd>{folder.location || <span className="is-empty">Belum dicatat</span>}</dd></div>
        </dl>
      </header>

      <div className="dokumen-folder-body">
        {folder.missing.length > 0 && (
          <p className="dokumen-folder-note" role="note">
            <strong>Masih kurang {folder.missing.map((m) => docShort[m]).join(", ")}.</strong> Jatuhkan foto atau PDF ke kantongnya, atau catat lokasi berkas fisiknya.
          </p>
        )}
        <ol className="dokumen-slots" ref={listRef}>
          {ordered.map((slot) => (
            <SlotItem key={slot.type} slot={slot} folder={folder} state={slotState[`${t.id}:${slot.type}`] ?? {}}
              highlighted={focusType === slot.type} onUpload={onUpload} onNote={onNote} onView={onView} />
          ))}
        </ol>
      </div>

      <div className="dokumen-folder-foot">
        <span>{nav.index >= 0 ? `Map ${nav.index + 1} dari ${nav.total} pada daftar` : "Map ini berada di luar saringan daftar"}</span>
        <Button size="sm" className="dokumen-next-missing" disabled={!nav.nextIncomplete} onClick={() => nav.nextIncomplete?.()}>
          Map berikutnya yang masih kurang <ChevronRight />
        </Button>
      </div>
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
              <button type="button" className={`dokumen-thumb is-${d.kind === "physical" ? "physical" : isImage(d) ? "image" : "pdf"}`} onClick={() => onView(d.id)}
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
            {/* biome-ignore lint/a11y/noAutofocus: form ini muncul karena pengguna baru menekan tombol catat, fokus harus pindah ke isiannya */}
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: tutup konfirmasi saat berpindah dokumen
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
            <button type="button" className="dokumen-viewer-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
          </div>
        </div>
        <div className={`dokumen-viewer-stage ${doc.kind === "physical" ? "is-note" : ""}`}>
          {prev && <button type="button" className="dokumen-viewer-nav is-prev" onClick={() => onSelect(prev.id)} aria-label="Berkas sebelumnya"><ChevronLeft /></button>}
          {body}
          {next && <button type="button" className="dokumen-viewer-nav is-next" onClick={() => onSelect(next.id)} aria-label="Berkas berikutnya"><ChevronRight /></button>}
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

"use client";
import { OnboardingHint } from "./onboarding";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, FileText, FolderOpen, LoaderCircle,
  Search, Trash2, Upload, X,
} from "lucide-react";
import { dateText, docLabels, type DocumentItem, type Trip } from "@/lib/model";
import { api, Empty, ErrorMessage } from "./fields";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/*
  Dokumen: daftar map di kiri, map terbuka di kanan.
  Setiap rekap adalah satu map; setiap jenis dokumen adalah satu kantong di dalam map.
  Daftar tetap terlihat saat map dibuka sehingga mengisi map satu per satu cukup dengan
  panah atas/bawah atau "Map berikutnya yang kurang". Satu tanda dipakai di mana-mana:
  satu kotak per berkas wajib, biru tua bila ada, bingkai emas bila belum.
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
type FolderNav = { index: number; total: number; prev: (() => void) | null; next: (() => void) | null; nextIncomplete: (() => void) | null };
const pageSizes = [20, 50, 100];

/* Layar sempit: daftar atau map, bergantian. Layar lebar: keduanya berdampingan. */
const narrowQuery = "(max-width: 900px)";
function subscribeNarrow(callback: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const useIsNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);

const folderStateText = (f: Folder) => f.required
  ? (f.complete ? "lengkap" : f.present === 0 ? "belum ada berkas" : `kurang ${f.missing.map((m) => docShort[m]).join(", ")}`)
  : f.trip.documents.length ? `${f.trip.documents.length} berkas, tanpa syarat` : "kosong, tanpa syarat";
const folderFraction = (f: Folder) => f.required
  ? `${f.present}/${f.required}`
  : f.trip.documents.length ? `${f.trip.documents.length} berkas` : "Kosong";

/* Satu kotak per berkas wajib; tanda yang sama di daftar dan di kepala map. */
function Pips({ folder }: { folder: Folder }) {
  return (
    <span className="dokumen-pips" aria-hidden="true">
      {folder.slots.filter((s) => s.required).map((s) => <i key={s.type} data-done={s.docs.length > 0 || undefined} />)}
    </span>
  );
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

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
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [slotState, setSlotState] = useState<Record<string, SlotState>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const narrow = useIsNarrow();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const splitRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (year !== "all" && !years.includes(year)) setYear(years[0] ?? "all");
  }, [years, year]);

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
  const kindMissing = useMemo(() => {
    const map = new Map<DocType, number>(docTypes.map((type) => [type, 0]));
    for (const f of scoped) for (const type of f.missing) map.set(type, (map.get(type) ?? 0) + 1);
    return map;
  }, [scoped]);
  const summary = useMemo(() => {
    const withRules = scoped.filter((f) => f.required > 0);
    return {
      withRules: withRules.length,
      complete: withRules.filter((f) => f.complete).length,
      missingFiles: scoped.reduce((n, f) => n + f.missing.length, 0),
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

  /* Layar lebar selalu menampilkan satu map: pilihan pengguna, atau map teratas di halaman ini. */
  const open = folders.find((f) => f.trip.id === openId) ?? null;
  const current = open ?? (narrow ? null : pageRows[0] ?? null);
  const viewer = current?.trip.documents.find((d) => d.id === viewerId) ?? null;
  const completeShare = summary.withRules ? Math.round((summary.complete / summary.withRules) * 100) : 0;
  const filtered = department !== "all" || kind !== "all" || status !== "all" || query.trim() !== "";
  const clearAll = useCallback(() => { setDepartment("all"); setKind("all"); setStatus("all"); setQuery(""); }, []);

  const openFolder = useCallback((id: string) => {
    setOpenId(id);
    setViewerId(null);
  }, []);
  const patchSlot = (id: string, type: DocType, patch: SlotState) =>
    setSlotState((s) => ({ ...s, [`${id}:${type}`]: { ...s[`${id}:${type}`], ...patch } }));

  /* Navigasi map mengikuti urutan daftar yang tampil; "berikutnya yang masih kurang" melingkar ke awal bila perlu. */
  const openIndex = current ? rows.findIndex((f) => f.trip.id === current.trip.id) : -1;
  const jumpTo = (target: Folder | undefined) => {
    if (!target) return;
    openFolder(target.trip.id);
    const at = rows.findIndex((f) => f.trip.id === target.trip.id);
    if (at >= 0) setPageIndex(Math.floor(at / pageSize));
  };
  const nextIncomplete = (() => {
    if (!current) return undefined;
    const order = openIndex >= 0 ? [...rows.slice(openIndex + 1), ...rows.slice(0, Math.max(openIndex, 0))] : rows;
    return order.find((f) => f.required > 0 && !f.complete && f.trip.id !== current.trip.id);
  })();
  const nav: FolderNav = {
    index: openIndex, total: rows.length,
    prev: openIndex > 0 ? () => jumpTo(rows[openIndex - 1]) : null,
    next: openIndex >= 0 && openIndex < rows.length - 1 ? () => jumpTo(rows[openIndex + 1]) : null,
    nextIncomplete: nextIncomplete ? () => jumpTo(nextIncomplete) : null,
  };

  /* "/" memfokuskan pencarian; panah atas/bawah pindah map (layar lebar); Escape kembali ke daftar (layar sempit). */
  const keys = useRef({ nav, narrow, open: Boolean(open) });
  keys.current = { nav, narrow, open: Boolean(open) };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      const { nav: move, narrow: small, open: isOpen } = keys.current;
      if (event.key === "Escape" && small && isOpen) { setOpenId(null); return; }
      if (isTyping(event.target)) return;
      if (!small && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        const step = event.key === "ArrowDown" ? move.next : move.prev;
        if (step) { event.preventDefault(); step(); }
        return;
      }
      if (event.key !== "/") return;
      event.preventDefault();
      if (small && isOpen) { setOpenId(null); requestAnimationFrame(() => searchRef.current?.focus()); }
      else searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  /* Map yang dipilih lewat papan ketik tetap terlihat di daftar. */
  const currentId = current?.trip.id;
  useEffect(() => {
    if (currentId) listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  async function upload(folder: Folder, type: DocType, files: File[]) {
    if (!files.length || busyRef.current) return;
    busyRef.current = true;
    let latest = folder.trip;
    let saved = 0;
    patchSlot(folder.trip.id, type, { error: "" });
    try {
      for (const [index, file] of files.entries()) {
        patchSlot(folder.trip.id, type, { uploading: files.length > 1 ? `Menyimpan ${index + 1} dari ${files.length}` : "Menyimpan berkas" });
        const data = new FormData();
        data.set("tripId", latest.id);
        data.set("version", String(latest.version));
        data.set("type", type);
        data.set("kind", "file");
        data.set("file", file);
        latest = await api<Trip>("/api/documents", { method: "POST", body: data });
        onChange(latest);
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
    if (narrow) splitRef.current?.scrollIntoView({ block: "start" });
  }

  const list = (
    <div className="dokumen-list">
      <div className="dokumen-list-tools">
        <div className="dokumen-search">
          <Search size={16} aria-hidden="true" />
          <input ref={searchRef} aria-label="Cari map" aria-keyshortcuts="/" type="search" autoComplete="off"
            placeholder="Cari nomor, pegawai, tujuan, atau lokasi"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={15} /></button> : <span aria-hidden="true"><kbd>/</kbd></span>}
        </div>
        <div className="dokumen-status-switch" role="group" aria-label="Kelengkapan map">
          <button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")}>Semua <b>{scoped.length}</b></button>
          <button type="button" aria-pressed={status === "incomplete"} onClick={() => setStatus("incomplete")}>Kurang <b>{summary.withRules - summary.complete}</b></button>
          <button type="button" aria-pressed={status === "complete"} onClick={() => setStatus("complete")}>Lengkap <b>{summary.complete}</b></button>
        </div>
        <div className="dokumen-list-selects">
          <CustomSelect aria-label="Jenis berkas yang belum ada" className="dokumen-select" value={kind}
            onValueChange={(v) => setKind(v as DocType | "all")} data-active={kind !== "all"}>
            <SelectOption value="all">Semua jenis</SelectOption>
            {docTypes.filter((type) => kindMissing.get(type) || kind === type).map((type) => (
              <SelectOption key={type} value={type}>{`Belum ${docShort[type]} · ${kindMissing.get(type)}`}</SelectOption>
            ))}
          </CustomSelect>
          <CustomSelect aria-label="Bidang" className="dokumen-select" value={department}
            onValueChange={(v) => setDepartment(v)} data-active={department !== "all"}>
            <SelectOption value="all">Semua bidang</SelectOption>
            {departments.map((d) => <SelectOption key={d} value={d}>{d}</SelectOption>)}
          </CustomSelect>
        </div>
      </div>
      <div className="dokumen-list-count">
        <p role="status"><strong>{rows.length.toLocaleString("id-ID")}</strong> map{filtered ? " sesuai saringan" : ", terbaru dulu"}</p>
        {filtered
          ? <button type="button" className="dokumen-clear" onClick={clearAll}>Bersihkan saringan</button>
          : <span>Berkas wajib</span>}
      </div>
      <ul className="dokumen-items" ref={listRef} aria-label="Daftar map">
        {pageRows.map((f) => (
          <li key={f.trip.id}>
            <button type="button" className="dokumen-item" aria-current={current?.trip.id === f.trip.id || undefined}
              onClick={() => openFolder(f.trip.id)}
              aria-label={`${f.trip.sptNo || "Tanpa nomor ST"}, ${f.names}, ${folderStateText(f)}`}>
              <span className="dokumen-item-ref">{f.trip.sptNo || "Tanpa nomor ST"}</span>
              <span className="dokumen-item-sub">{f.names} · {f.trip.destination}, {tripDates(f.trip)}</span>
              <span className="dokumen-item-state" data-tone={f.complete ? "complete" : f.required ? "missing" : "none"}>
                {f.required > 0 && <Pips folder={f} />}
                <b>{folderFraction(f)}</b>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="dokumen-pagination">
        <p role="status"><strong>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)}</strong> dari {rows.length}</p>
        <CustomSelect aria-label="Map per halaman" className="dokumen-page-size" value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          {pageSizes.map((size) => <SelectOption key={size} value={String(size)}>{String(size)}</SelectOption>)}
        </CustomSelect>
        <nav aria-label="Halaman daftar map">
          <Button variant="outline" size="icon-sm" aria-label="Halaman pertama" disabled={page === 0} onClick={() => go(0)}><ChevronsLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Halaman sebelumnya" disabled={page === 0} onClick={() => go(page - 1)}><ChevronLeft /></Button>
          <span><strong>{page + 1}</strong> / {pageCount}</span>
          <Button variant="outline" size="icon-sm" aria-label="Halaman berikutnya" disabled={page >= pageCount - 1} onClick={() => go(page + 1)}><ChevronRight /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Halaman terakhir" disabled={page >= pageCount - 1} onClick={() => go(pageCount - 1)}><ChevronsRight /></Button>
        </nav>
      </div>
    </div>
  );

  return (
    <div className="dokumen-page">
      <header className="dokumen-head">
        <div>
          <h1>Dokumen</h1>
          {summary.withRules ? (
            <p className="dokumen-progress">
              <span><b>{summary.complete.toLocaleString("id-ID")}</b> dari {summary.withRules.toLocaleString("id-ID")} map lengkap</span>
              <span className="dokumen-progress-bar" role="img" aria-label={`${completeShare} persen map lengkap`}>
                <i style={{ width: `${completeShare}%` }} />
              </span>
              {summary.missingFiles > 0 && (
                <span className="is-warning"><b>{summary.missingFiles.toLocaleString("id-ID")}</b> berkas wajib belum ada</span>
              )}
            </p>
          ) : (
            <p className="dokumen-progress">Belum ada map dengan syarat dokumen</p>
          )}
        </div>
        <CustomSelect aria-label="Tahun pelaksanaan" className="dokumen-year" value={year}
          onValueChange={(v) => { setYear(v); setOpenId(null); }}>
          {years.map((y) => <SelectOption key={y} value={y}>{`Tahun ${y}`}</SelectOption>)}
          <SelectOption value="all">Semua tahun</SelectOption>
        </CustomSelect>
      </header>

      <OnboardingHint id="documents" />

      {rows.length === 0 && !open ? (
        <section className="dokumen-split is-empty" aria-label="Daftar map berkas">
          {list}
          <Empty
            icon={<FolderOpen size={28} />}
            heading={scoped.length ? "Tidak ada map yang cocok" : "Belum ada perjalanan pada lingkup ini"}
            description={scoped.length
              ? "Ubah kata kunci, jenis berkas, atau status kelengkapan."
              : "Map berkas mengikuti arsip perjalanan. Tambahkan arsip terlebih dahulu."}
            action={filtered ? <Button variant="outline" size="sm" onClick={clearAll}>Bersihkan saringan</Button> : undefined}
          />
        </section>
      ) : (
        <section className="dokumen-split" ref={splitRef} data-open={narrow && open ? "true" : undefined}
          aria-label={current ? `Map berkas ${current.trip.sptNo || current.names}` : "Daftar map berkas"}>
          {(!narrow || !open) && list}
          {current && (
            <FolderView key={current.trip.id} folder={current} slotState={slotState} nav={nav} narrow={narrow}
              onBack={() => setOpenId(null)} onUpload={upload} onNote={notePhysical} onView={(id) => setViewerId(id)}
              onOpenArchive={() => onOpen(current.trip.id)} />
          )}
        </section>
      )}

      {current && viewer && (
        <Viewer folder={current} doc={viewer} onClose={() => setViewerId(null)} onSelect={(id) => setViewerId(id)}
          onRemove={() => remove(current, viewer)} />
      )}
    </div>
  );
}

/* Map terbuka: kantong wajib lebih dulu, lalu kantong yang tidak diminta untuk perjalanan ini. */
function FolderView({ folder, slotState, nav, narrow, onBack, onUpload, onNote, onView, onOpenArchive }: {
  folder: Folder;
  slotState: Record<string, SlotState>;
  nav: FolderNav;
  narrow: boolean;
  onBack: () => void;
  onUpload: (folder: Folder, type: DocType, files: File[]) => void;
  onNote: (folder: Folder, type: DocType, location: string) => Promise<boolean>;
  onView: (id: string) => void;
  onOpenArchive: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  /* Di layar sempit map menggantikan daftar, jadi fokus pindah ke judul map. */
  useEffect(() => {
    if (!narrow) return;
    headingRef.current?.closest(".dokumen-split")?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, [narrow]);
  const t = folder.trip;
  const required = folder.slots.filter((s) => s.required);
  const optional = folder.slots.filter((s) => !s.required);
  const contents = [folder.photos ? `${folder.photos} foto` : "", folder.pdfs ? `${folder.pdfs} PDF` : "", folder.physical ? `${folder.physical} catatan fisik` : ""].filter(Boolean).join(", ");
  const slot = (s: Slot) => (
    <SlotItem key={s.type} slot={s} folder={folder} state={slotState[`${t.id}:${s.type}`] ?? {}}
      onUpload={onUpload} onNote={onNote} onView={onView} />
  );
  return (
    <div className="dokumen-folder">
      <header className="dokumen-folder-head">
        {narrow && (
          <button type="button" className="dokumen-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Daftar map</button>
        )}
        <div className="dokumen-folder-top">
          <div className="dokumen-folder-who">
            <h2 ref={headingRef} tabIndex={-1}>{t.sptNo || "Tanpa nomor ST"}</h2>
            <p><b>{folder.names}</b> · {t.destination}, {tripDates(t)} · Bidang {t.department}</p>
          </div>
          <div className="dokumen-folder-nav" role="group" aria-label="Pindah map">
            <Button variant="outline" size="icon-sm" aria-label="Map sebelumnya" disabled={!nav.prev} onClick={() => nav.prev?.()}><ChevronLeft /></Button>
            <span aria-live="polite">{nav.index >= 0 ? `${nav.index + 1} dari ${nav.total}` : "Di luar daftar"}</span>
            <Button variant="outline" size="icon-sm" aria-label="Map berikutnya" disabled={!nav.next} onClick={() => nav.next?.()}><ChevronRight /></Button>
          </div>
        </div>
        <dl className="dokumen-folder-facts">
          <div>
            <dt>{folder.explicit ? "Berkas wajib" : "Berkas baku"}</dt>
            <dd data-tone={folder.complete ? "complete" : folder.required ? "missing" : "none"}>
              {folder.required > 0 && <Pips folder={folder} />}
              <b>{folder.required ? `${folder.present} dari ${folder.required}` : "Tanpa syarat"}</b>
            </dd>
          </div>
          <div><dt>Isi map</dt><dd>{contents || <span className="is-empty">Belum ada berkas</span>}</dd></div>
          <div><dt>Lokasi berkas fisik</dt><dd>{folder.location || <span className="is-empty">Belum dicatat</span>}</dd></div>
          <button type="button" className="dokumen-link dokumen-folder-archive" onClick={onOpenArchive}>
            Buka rekap <ExternalLink size={13} aria-hidden="true" />
          </button>
        </dl>
      </header>

      <div className="dokumen-folder-body">
        <ol className="dokumen-slots" aria-label="Berkas wajib">{required.map(slot)}</ol>
        {optional.length > 0 && <>
          <p className="dokumen-slots-label"><span>Tidak diminta untuk perjalanan ini</span><span>{optional.length} jenis</span></p>
          <ol className="dokumen-slots" aria-label="Berkas lain">{optional.map(slot)}</ol>
        </>}
      </div>

      <footer className="dokumen-folder-foot">
        <span className="dokumen-keys">
          {!narrow && <><kbd>↑</kbd><kbd>↓</kbd> pindah map · </>}
          Seret JPG, PNG, atau PDF (maks. 10 MB) ke kantongnya
        </span>
        <Button size="sm" className="dokumen-next-missing" disabled={!nav.nextIncomplete} onClick={() => nav.nextIncomplete?.()}>
          Map berikutnya yang kurang <ChevronRight />
        </Button>
      </footer>
    </div>
  );
}

function SlotItem({ slot, folder, state, onUpload, onNote, onView }: {
  slot: Slot;
  folder: Folder;
  state: SlotState;
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
    : slot.required ? (folder.explicit ? "Belum ada, wajib" : "Belum ada") : "Tidak diminta";
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
    <li className="dokumen-slot" data-type={slot.type} data-tone={tone} data-dragging={dragging ? "true" : undefined}
      onDragOver={(e) => onDrag(e, true)} onDragEnter={(e) => onDrag(e, true)} onDragLeave={(e) => onDrag(e, false)} onDrop={onDrop}>
      <span className="dokumen-slot-mark" aria-hidden="true">{tone === "present" && <Check size={12} strokeWidth={3} />}</span>
      <div className="dokumen-slot-label">
        <h3>{docLabels[slot.type]}</h3>
        <span className="dokumen-slot-status">
          {busy ? <><LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> {state.uploading}…</>
            : dragging ? "Lepaskan untuk menyimpan ke kantong ini" : status}
        </span>
      </div>
      {slot.docs.length > 0 && (
        <ul className="dokumen-thumbs">
          {slot.docs.map((d) => (
            <li key={d.id}>
              <button type="button" className={`dokumen-thumb is-${d.kind === "physical" ? "physical" : isImage(d) ? "image" : "pdf"}`} onClick={() => onView(d.id)}
                aria-label={d.kind === "physical" ? `Catatan berkas fisik: ${d.location}` : `Buka ${d.name}`} title={d.kind === "physical" ? d.location : d.name}>
                {d.kind === "physical"
                  ? <><FolderOpen size={14} aria-hidden="true" /><span>{d.location}</span></>
                  : isImage(d)
                    ? <img src={`/api/documents/${d.id}`} alt="" loading="lazy" decoding="async" />
                    : <><FileText size={15} aria-hidden="true" /><span>PDF</span></>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dokumen-slot-actions">
        {!noting && (
          <button type="button" className="dokumen-link" onClick={() => setNoting(true)} disabled={busy}>Catat fisik</button>
        )}
        <label htmlFor={inputId} className={`dokumen-add ${busy ? "is-busy" : ""}`} aria-disabled={busy}>
          <Upload size={14} aria-hidden="true" /> {slot.docs.length ? "Tambah" : "Unggah"}
        </label>
        <input id={inputId} type="file" className="sr-only" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" multiple
          disabled={busy} onChange={(e) => { accept(e.target.files); e.target.value = ""; }} />
      </div>
      {noting && (
        <form className="dokumen-note" onSubmit={async (e) => { e.preventDefault(); if (await onNote(folder, slot.type, location)) setNoting(false); }}>
          {/* biome-ignore lint/a11y/noAutofocus: form ini muncul karena pengguna baru menekan tombol catat, fokus harus pindah ke isiannya */}
          <input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={500} autoFocus
            aria-label={`Lokasi berkas fisik ${docLabels[slot.type]}`} placeholder="Lemari, nomor map, dan tahun arsip" />
          <Button type="submit" size="sm" disabled={busy}>Simpan</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNoting(false)} disabled={busy}>Batal</Button>
        </form>
      )}
      {state.error ? <div className="dokumen-slot-error"><ErrorMessage message={state.error} /></div> : null}
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type Row, type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown, ArrowUp, ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown,
  FolderOpen, IdCard, LoaderCircle, MoreHorizontal, Pencil, Plus, RotateCcw, Save, Search, SlidersHorizontal, Trash2, Users, X,
} from "lucide-react";
import { employeeMatches, employeeRankOptions, type Employee, type EmployeeInput } from "@/lib/employees";
import { dateText, duration, money, totalCost, type Trip } from "@/lib/model";
import { api, Empty, ErrorMessage, Field } from "./fields";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

/* Golongan mengikuti empat golongan PNS; format lain tetap bebas dan masuk "tanpa golongan". */
const groups = ["I", "II", "III", "IV"] as const;
type Group = (typeof groups)[number] | "none";
const groupOrder: Record<Group, number> = { I: 1, II: 2, III: 3, IV: 4, none: 5 };
const groupLabel: Record<Group, string> = { I: "Golongan I", II: "Golongan II", III: "Golongan III", IV: "Golongan IV", none: "Tanpa golongan" };
const NONE = "__none__";
const columnLabels: Record<string, string> = {
  name: "Pegawai", nip: "NIP", rank: "Golongan", department: "Bidang", trips: "Perjalanan", actions: "",
};
const sortOptions = [
  { value: "name:asc", label: "Nama A–Z" }, { value: "name:desc", label: "Nama Z–A" },
  { value: "rank:desc", label: "Golongan tertinggi" }, { value: "rank:asc", label: "Golongan terendah" },
  { value: "nip:asc", label: "NIP terkecil" }, { value: "nip:desc", label: "NIP terbesar" },
  { value: "trips:desc", label: "Perjalanan terbanyak" }, { value: "trips:asc", label: "Perjalanan paling sedikit" },
  { value: "last:desc", label: "Terakhir bertugas" },
];
const monthShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

type EmployeeRow = Employee & {
  group: Group;
  complete: boolean;
  missing: string[];
  journeys: Trip[];
  lastTrip: Trip | null;
};

export function rankGroup(rank: string): Group {
  const text = rank.trim().toUpperCase();
  const room = text.match(/\b(IV|III|II|I)\s*\/\s*[A-E]\b/);
  const head = text.match(/^(IV|III|II|I)\b/);
  const found = (room ?? head)?.[1];
  return found && found in groupOrder ? (found as Group) : "none";
}
export function isCompleteEmployee(p: Employee) {
  return missingFields(p).length === 0;
}
function missingFields(p: Employee) {
  const missing: string[] = [];
  if (!p.name.trim()) missing.push("nama");
  if (!p.nip.trim()) missing.push("NIP");
  if (!p.position.trim()) missing.push("jabatan");
  if (!p.rank.trim()) missing.push("golongan");
  if (!p.department.trim()) missing.push("bidang");
  return missing;
}
/* Monogram dari dua kata pertama nama, tanpa gelar. */
function monogram(name: string) {
  const words = name.replace(/,.*$/, "").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map(word => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}
function listText(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} dan ${items[items.length - 1]}`;
}
/* Layar sempit memakai kartu, bukan tabel; hanya satu yang dirender agar pembaca layar tidak membaca dua kali. */
const narrowQuery = "(max-width: 760px)";
function subscribeNarrow(callback: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const useIsNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);
const empty = (text: string) => <span className="pegawai-empty">{text}</span>;
const monthText = (date: string) => dateText(date, { month: "short", year: "numeric" });
const tripDates = (t: Trip) => t.startDate === t.endDate
  ? dateText(t.startDate)
  : `${dateText(t.startDate, { day: "numeric", month: "short" })} – ${dateText(t.endDate)}`;

export default function Pegawai({ trips, people, departments, onChange, notify, onOpen }: {
  trips: Trip[];
  people: Employee[];
  departments: string[];
  onChange: (employee: Employee) => void;
  notify: (message: string) => void;
  onOpen: (id: string) => void;
}) {
  const [department, setDepartment] = useState("all");
  const [group, setGroup] = useState<Group | "all">("all");
  const [deleted, setDeleted] = useState(false);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState("all");
  const [completeness, setCompleteness] = useState("all");
  const [editor, setEditor] = useState<Employee | "new" | null>(null);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo<EmployeeRow[]>(() => people.map(person => {
    const journeys = trips
      .filter(trip => !trip.deletedAt && trip.participants.some(participant => employeeMatches(person, participant)))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    const missing = missingFields(person);
    return { ...person, group: rankGroup(person.rank), complete: missing.length === 0, missing, journeys, lastTrip: journeys[0] ?? null };
  }), [people, trips]);

  const inStatus = useMemo(() => rows.filter(row => Boolean(row.deletedAt) === deleted), [rows, deleted]);
  const activeCount = rows.filter(row => !row.deletedAt).length;
  const deletedCount = rows.length - activeCount;

  /* Faset bidang: unit yang tercantum pada pengaturan dahulu, lalu bidang lain menurut abjad, lalu yang belum dicatat. */
  const bidang = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of inStatus) {
      const key = row.department.trim() || NONE;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const known = departments.filter(value => counts.has(value));
    const others = [...counts.keys()].filter(value => value !== NONE && !departments.includes(value)).sort((a, b) => a.localeCompare(b, "id-ID"));
    const keys = [...known, ...others, ...(counts.has(NONE) ? [NONE] : [])];
    return keys.map(key => ({ key, label: key === NONE ? "Bidang belum dicatat" : key, count: counts.get(key) ?? 0 }));
  }, [inStatus, departments]);
  useEffect(() => {
    if (department !== "all" && !bidang.some(tab => tab.key === department)) setDepartment("all");
  }, [bidang, department]);

  const inDepartment = useMemo(() => inStatus.filter(row => department === "all" || (row.department.trim() || NONE) === department), [inStatus, department]);
  const groupCounts = useMemo(() => {
    const counts = new Map<Group, number>();
    for (const row of inDepartment) counts.set(row.group, (counts.get(row.group) ?? 0) + 1);
    return counts;
  }, [inDepartment]);
  useEffect(() => {
    if (group !== "all" && !groupCounts.has(group)) setGroup("all");
  }, [groupCounts, group]);

  const scoped = useMemo(() => inDepartment.filter(row => group === "all" || row.group === group), [inDepartment, group]);
  const facts = useMemo(() => ({
    complete: scoped.filter(row => row.complete).length,
    travelled: scoped.filter(row => row.journeys.length > 0).length,
  }), [scoped]);

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id-ID");
    return scoped.filter(row =>
      (history === "all" || (history === "with") === row.journeys.length > 0)
      && (completeness === "all" || (completeness === "complete") === row.complete)
      && (!search || [row.name, row.nip, row.position, row.department, row.rank].join(" ").toLocaleLowerCase("id-ID").includes(search)));
  }, [scoped, query, history, completeness]);

  const chips = useMemo(() => {
    const list: { key: string; label: string; clear: () => void }[] = [];
    if (department !== "all") list.push({ key: "department", label: department === NONE ? "Bidang belum dicatat" : department, clear: () => setDepartment("all") });
    if (group !== "all") list.push({ key: "group", label: groupLabel[group], clear: () => setGroup("all") });
    if (completeness !== "all") list.push({ key: "completeness", label: completeness === "complete" ? "Data lengkap" : "Perlu dilengkapi", clear: () => setCompleteness("all") });
    if (history !== "all") list.push({ key: "history", label: history === "with" ? "Pernah bertugas" : "Belum pernah bertugas", clear: () => setHistory("all") });
    if (query.trim()) list.push({ key: "query", label: `“${query.trim()}”`, clear: () => setQuery("") });
    return list;
  }, [department, group, completeness, history, query]);
  const clearAll = useCallback(() => {
    setDepartment("all"); setGroup("all"); setCompleteness("all"); setHistory("all"); setQuery("");
  }, []);

  const openPerson = openId ? rows.find(row => row.id === openId) ?? null : null;

  async function change(person: Employee, restore: boolean) {
    setBusy(true); setError("");
    try {
      const saved = await api<Employee>(`/api/employees/${person.id}`, {
        method: restore ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: person.version, ...(restore ? { action: "restore" } : {}) }),
      });
      onChange(saved); setRemoving(null);
      notify(restore ? "Pegawai dipulihkan ke daftar aktif." : "Pegawai dipindahkan ke daftar Terhapus.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const startEdit = (person: Employee) => { setError(""); setEditor(person); };
  const startRemove = (person: Employee) => { setError(""); setRemoving(person); };
  const startAdd = () => { setError(""); setEditor("new"); };

  const facet = (key: string, pressed: boolean, onClick: () => void, label: ReactNode, count: number, extra?: ReactNode) => (
    <button type="button" key={key} className="pegawai-facet" aria-pressed={pressed} disabled={!count && !pressed} onClick={onClick}>
      {extra}<span>{label}</span><b>{count.toLocaleString("id-ID")}</b>
    </button>
  );

  return (
    <div className="pegawai-page">
      <header className="pegawai-head">
        <div>
          <h1>Pegawai</h1>
          <p>Direktori pegawai yang menjadi rujukan saat mengisi arsip. Buka berkas seseorang untuk melihat identitas dan seluruh perjalanan dinasnya.</p>
        </div>
        <Button className="pegawai-add" disabled={busy} onClick={startAdd}><Plus /> Tambah pegawai</Button>
      </header>

      <div className="pegawai-body">
        <aside className="pegawai-index" data-open={indexOpen} aria-label="Saring daftar pegawai">
          <button type="button" className="pegawai-index-toggle" aria-expanded={indexOpen} aria-controls="pegawai-index-panel" onClick={() => setIndexOpen(open => !open)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Saring daftar</span>
            {chips.length > 0 && <b>{chips.length}</b>}
          </button>
          <div className="pegawai-index-panel" id="pegawai-index-panel">
            <div className="pegawai-index-total">
              <strong>{inStatus.length.toLocaleString("id-ID")}</strong>
              <span>{deleted ? "pegawai pada daftar Terhapus" : "pegawai aktif"}</span>
            </div>

            <section className="pegawai-index-group" aria-label="Bidang">
              <h2>Bidang</h2>
              {facet("all", department === "all", () => setDepartment("all"), "Semua bidang", inStatus.length)}
              {bidang.map(tab => facet(tab.key, department === tab.key, () => setDepartment(department === tab.key ? "all" : tab.key), tab.label, tab.count))}
            </section>

            <section className="pegawai-index-group" aria-label="Golongan">
              <h2>Golongan</h2>
              <div className="pegawai-composition" role="img"
                aria-label={inDepartment.length ? `Komposisi golongan: ${[...groups, "none" as const].filter(value => groupCounts.get(value)).map(value => `${groupLabel[value]} ${groupCounts.get(value)}`).join(", ")}` : "Belum ada pegawai"}>
                {[...groups, "none" as const].map(value => {
                  const count = groupCounts.get(value) ?? 0;
                  return count ? <i key={value} data-group={value} style={{ flexGrow: count }} /> : null;
                })}
              </div>
              {facet("all", group === "all", () => setGroup("all"), "Semua golongan", inDepartment.length)}
              {[...groups, "none" as const].map(value => facet(
                value, group === value, () => setGroup(group === value ? "all" : value), groupLabel[value], groupCounts.get(value) ?? 0,
                <i className="pegawai-swatch" data-group={value} aria-hidden="true" />,
              ))}
            </section>

            <section className="pegawai-index-group" aria-label="Kelengkapan data">
              <h2>Kelengkapan data</h2>
              {facet("complete", completeness === "complete", () => setCompleteness(completeness === "complete" ? "all" : "complete"), "Data lengkap", facts.complete)}
              {facet("incomplete", completeness === "incomplete", () => setCompleteness(completeness === "incomplete" ? "all" : "incomplete"), "Perlu dilengkapi", scoped.length - facts.complete)}
              <p className="pegawai-index-note">Lengkap berarti nama, NIP, jabatan, golongan, dan bidang sudah terisi.</p>
            </section>

            <section className="pegawai-index-group" aria-label="Riwayat perjalanan">
              <h2>Riwayat perjalanan</h2>
              {facet("with", history === "with", () => setHistory(history === "with" ? "all" : "with"), "Pernah bertugas", facts.travelled)}
              {facet("without", history === "without", () => setHistory(history === "without" ? "all" : "without"), "Belum pernah bertugas", scoped.length - facts.travelled)}
              <p className="pegawai-index-note">Dicocokkan lewat NIP, atau lewat nama bila NIP belum tercatat.</p>
            </section>
          </div>
        </aside>

        <PegawaiRoster rows={visible} deleted={deleted} busy={busy} error={removing ? "" : error} openId={openId}
          hasAny={scoped.length > 0} chips={chips} onClearAll={clearAll} hideDepartment={department !== "all" || bidang.length <= 1}
          query={query} onQuery={setQuery}
          status={
            <div className="pegawai-status" role="group" aria-label="Daftar pegawai">
              <button type="button" aria-pressed={!deleted} onClick={() => setDeleted(false)}>Aktif <b>{activeCount}</b></button>
              <button type="button" aria-pressed={deleted} onClick={() => setDeleted(true)}>Terhapus <b>{deletedCount}</b></button>
            </div>
          }
          onOpen={setOpenId} onEdit={startEdit} onRemove={startRemove} onRestore={person => change(person, true)} onAdd={startAdd}
          record={(person, nav) => (
            <EmployeeRecord person={person} busy={busy} nav={nav} onBack={() => setOpenId(null)}
              onOpen={id => { setOpenId(null); onOpen(id); }}
              onEdit={startEdit} onRemove={startRemove} onRestore={p => change(p, true)} />
          )}
          openPerson={openPerson}
        />
      </div>

      {editor && (
        <EmployeeForm key={editor === "new" ? "new" : editor.id} employee={editor === "new" ? null : editor} departments={departments}
          onClose={() => setEditor(null)}
          onSaved={person => {
            onChange(person); setEditor(null); setDeleted(false);
            if (editor === "new") { clearAll(); setOpenId(person.id); }
            notify(editor === "new" ? "Pegawai ditambahkan ke direktori." : "Data pegawai tersimpan.");
          }} />
      )}
      <Dialog open={Boolean(removing)} onOpenChange={value => { if (!value && !busy) { setRemoving(null); setError(""); } }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Hapus pegawai?</DialogTitle>
            <DialogDescription>{removing?.name} akan dipindahkan ke daftar Terhapus. Arsip perjalanannya tetap tersimpan, dan pegawai dapat dipulihkan kapan saja.</DialogDescription>
          </DialogHeader>
          <ErrorMessage message={error} />
          <div className="pegawai-dialog-actions">
            <Button variant="outline" disabled={busy} onClick={() => { setRemoving(null); setError(""); }}>Batal</Button>
            <Button variant="destructive" disabled={busy} onClick={() => removing && change(removing, false)}>{busy ? "Menghapus…" : "Hapus pegawai"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type RecordNav = { index: number; total: number; prev: (() => void) | null; next: (() => void) | null };

function PegawaiRoster({ rows, deleted, busy, error, openId, openPerson, hasAny, chips, hideDepartment, query, onQuery, status, onClearAll, onOpen, onEdit, onRemove, onRestore, onAdd, record }: {
  rows: EmployeeRow[]; deleted: boolean; busy: boolean; error: string; openId: string | null; openPerson: EmployeeRow | null;
  hasAny: boolean; chips: { key: string; label: string; clear: () => void }[]; hideDepartment: boolean;
  query: string; onQuery: (value: string) => void; status: ReactNode; onClearAll: () => void;
  onOpen: (id: string | null) => void; onEdit: (person: Employee) => void; onRemove: (person: Employee) => void;
  onRestore: (person: Employee) => void; onAdd: () => void;
  record: (person: EmployeeRow, nav: RecordNav) => ReactNode;
}) {
  const rosterRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const narrow = useIsNarrow();
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);

  /* "/" memfokuskan pencarian (dan menutup berkas bila terbuka); Escape kembali ke daftar selama tidak ada dialog. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" && openId && !document.querySelector('[data-slot="dialog-content"]')) {
        onOpen(null); return;
      }
      if (event.key !== "/") return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      if (openId) { onOpen(null); requestAnimationFrame(() => searchRef.current?.focus()); }
      else searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, onOpen]);

  const menu = useCallback((person: EmployeeRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="pegawai-menu" disabled={busy} aria-label={`Aksi ${person.name}`}><MoreHorizontal size={17} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpen(person.id)}><FolderOpen size={15} />Buka berkas</DropdownMenuItem>
        {person.deletedAt
          ? <DropdownMenuItem onSelect={() => onRestore(person)}><RotateCcw size={15} />Pulihkan pegawai</DropdownMenuItem>
          : <>
            <DropdownMenuItem onSelect={() => onEdit(person)}><Pencil size={15} />Edit pegawai</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove(person)}><Trash2 size={15} />Hapus pegawai</DropdownMenuItem>
          </>}
      </DropdownMenuContent>
    </DropdownMenu>
  ), [busy, onOpen, onEdit, onRemove, onRestore]);

  const columns = useMemo<ColumnDef<EmployeeRow>[]>(() => [
    { id: "name", accessorFn: row => row.name,
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, "id-ID"),
      cell: ({ row }) => (
        <div className="pegawai-identity">
          <span className="pegawai-mono" aria-hidden="true">{monogram(row.original.name)}</span>
          <div>
            <button type="button" className="pegawai-name" onClick={() => onOpen(row.original.id)} aria-haspopup="dialog">{row.original.name}</button>
            <span className={`pegawai-position ${row.original.position ? "" : "is-empty"}`}>{row.original.position || "Jabatan belum dicatat"}</span>
          </div>
        </div>
      ) },
    { id: "nip", accessorFn: row => row.nip.trim() || undefined, sortUndefined: "last",
      cell: ({ row }) => row.original.nip.trim() ? <span className="pegawai-nip">{row.original.nip}</span> : empty("Belum dicatat") },
    { id: "rank", accessorFn: row => row.rank.trim() || undefined, sortUndefined: "last",
      sortingFn: (a, b) => groupOrder[a.original.group] - groupOrder[b.original.group] || a.original.rank.localeCompare(b.original.rank, "id-ID"),
      cell: ({ row }) => row.original.rank.trim() ? <span className="pegawai-rank">{row.original.rank}</span> : empty("Belum dicatat") },
    { id: "department", accessorFn: row => row.department.trim() || undefined, sortUndefined: "last",
      cell: ({ row }) => row.original.department.trim() || empty("Belum dicatat") },
    { id: "trips", accessorFn: row => row.journeys.length,
      cell: ({ row }) => (
        <div className={`pegawai-trips ${row.original.journeys.length ? "" : "is-empty"}`}>
          <strong>{row.original.journeys.length ? `${row.original.journeys.length} perjalanan` : "Belum pernah bertugas"}</strong>
          {row.original.lastTrip && <span>Terakhir {monthText(row.original.lastTrip.startDate)}</span>}
        </div>
      ) },
    { id: "last", accessorFn: row => row.lastTrip?.startDate ?? undefined, sortUndefined: "last", cell: () => null },
    { id: "actions", enableSorting: false,
      cell: ({ row }) => (
        <div className="pegawai-row-tools">
          {menu(row.original)}
          <Button variant="ghost" size="icon-sm" className="pegawai-open-file" aria-label={`Buka berkas ${row.original.name}`} onClick={() => onOpen(row.original.id)}>
            <ChevronRight size={16} />
          </Button>
        </div>
      ) },
  ], [menu, onOpen]);

  const table = useReactTable({
    data: rows, columns, getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    state: { sorting, columnVisibility: { last: false, department: !hideDepartment } },
    onSortingChange: setSorting, enableMultiSort: false, enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const pageRows = table.getRowModel().rows;
  const orderedRows = table.getPrePaginationRowModel().rows;
  const sorted = sorting[0];
  const sortValue = sorted ? `${sorted.id}:${sorted.desc ? "desc" : "asc"}` : "name:asc";
  // biome-ignore lint/correctness/useExhaustiveDependencies: gulir ke atas setiap halaman, urutan, atau data berubah
  useEffect(() => {
    rosterRef.current?.querySelector('[data-slot="table-container"]')?.scrollTo({ top: 0 });
  }, [pageIndex, pageSize, sorting, rows]);
  function go(page: number) {
    table.setPageIndex(page);
    if (window.matchMedia("(max-width: 760px)").matches) rosterRef.current?.scrollIntoView({ block: "start" });
  }

  /* Berkas: pegawai sebelumnya/berikutnya mengikuti urutan daftar yang tampil, lintas halaman. */
  const openIndex = openId ? orderedRows.findIndex(row => row.id === openId) : -1;
  const jump = (offset: number) => {
    const target = orderedRows[openIndex + offset];
    if (!target) return;
    onOpen(target.id);
    table.setPageIndex(Math.floor((openIndex + offset) / pageSize));
  };
  const nav: RecordNav = {
    index: openIndex, total: orderedRows.length,
    prev: openIndex > 0 ? () => jump(-1) : null,
    next: openIndex >= 0 && openIndex < orderedRows.length - 1 ? () => jump(1) : null,
  };

  if (openPerson) {
    return (
      <section className="pegawai-roster is-record" ref={rosterRef} aria-label={`Berkas pegawai ${openPerson.name}`}>
        {record(openPerson, nav)}
      </section>
    );
  }

  return (
    <section className="pegawai-roster" ref={rosterRef} aria-label={deleted ? "Daftar pegawai terhapus" : "Daftar pegawai"}>
      <div className="pegawai-toolbar">
        <div className="pegawai-search">
          <Search size={17} aria-hidden="true" />
          <input id="pegawai-search" ref={searchRef} aria-label="Cari pegawai" aria-keyshortcuts="/" type="search" autoComplete="off"
            placeholder="Cari nama, NIP, jabatan, atau golongan" value={query} onChange={event => onQuery(event.target.value)} />
          {query ? <button type="button" onClick={() => onQuery("")} aria-label="Hapus pencarian"><X size={15} /></button> : <kbd aria-hidden="true">/</kbd>}
        </div>
        {status}
        <CustomSelect aria-label="Urutkan pegawai" className="pegawai-sort" value={sortValue}
          onValueChange={value => { const [id, direction] = value.split(":"); setSorting([{ id, desc: direction === "desc" }]); }}>
          {sortOptions.map(option => <SelectOption key={option.value} value={option.value}>{option.label}</SelectOption>)}
        </CustomSelect>
      </div>
      <div className="pegawai-scope">
        <p role="status"><strong>{rows.length.toLocaleString("id-ID")}</strong> {deleted ? "pegawai terhapus" : "pegawai"}{chips.length > 0 && " sesuai saringan"}</p>
        {chips.length > 0 && (
          <ul className="pegawai-chips" aria-label="Saringan aktif">
            {chips.map(chip => (
              <li key={chip.key}>
                <button type="button" onClick={chip.clear} aria-label={`Hapus saringan ${chip.label}`}>{chip.label}<X size={13} aria-hidden="true" /></button>
              </li>
            ))}
            <li><button type="button" className="pegawai-chips-clear" onClick={onClearAll}>Bersihkan semua</button></li>
          </ul>
        )}
      </div>
      {error && <div className="pegawai-error"><ErrorMessage message={error} /></div>}

      {rows.length ? narrow ? (
        <ul className="pegawai-cards">
          {pageRows.map(row => {
            const person = row.original;
            return (
              <li key={row.id}>
                <article className="pegawai-card" data-open={row.id === openId}>
                  <div className="pegawai-identity">
                    <span className="pegawai-mono" aria-hidden="true">{monogram(person.name)}</span>
                    <div>
                      <button type="button" className="pegawai-name" onClick={() => onOpen(person.id)} aria-haspopup="dialog">{person.name}</button>
                      <span className={`pegawai-position ${person.position ? "" : "is-empty"}`}>{person.position || "Jabatan belum dicatat"}</span>
                    </div>
                    {menu(person)}
                  </div>
                  <dl className="pegawai-card-meta">
                    <div><dt>NIP</dt><dd className={person.nip.trim() ? "pegawai-nip" : "pegawai-empty"}>{person.nip.trim() || "Belum dicatat"}</dd></div>
                    <div><dt>Golongan</dt><dd className={person.rank.trim() ? "pegawai-rank" : "pegawai-empty"}>{person.rank.trim() || "Belum dicatat"}</dd></div>
                    {!hideDepartment && <div><dt>Bidang</dt><dd className={person.department.trim() ? "" : "pegawai-empty"}>{person.department.trim() || "Belum dicatat"}</dd></div>}
                    <div><dt>Perjalanan dinas</dt>
                      <dd className={person.journeys.length ? "" : "pegawai-empty"}>
                        {person.journeys.length ? `${person.journeys.length} perjalanan` : "Belum pernah bertugas"}
                        {person.lastTrip && <small>, terakhir {monthText(person.lastTrip.startDate)}</small>}
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="pegawai-table-wrap">
          <Table className="pegawai-table" aria-label={deleted ? "Daftar pegawai terhapus" : "Daftar pegawai"}>
            <TableHeader>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} data-column={header.column.id}
                      aria-sort={header.column.getCanSort() ? header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none" : undefined}>
                      {header.column.getCanSort() ? (
                        <button type="button" className="pegawai-sort-head" onClick={header.column.getToggleSortingHandler()} aria-label={`Urutkan ${columnLabels[header.column.id]}`}>
                          {columnLabels[header.column.id]}
                          {header.column.getIsSorted() === "asc" ? <ArrowUp size={13} /> : header.column.getIsSorted() === "desc" ? <ArrowDown size={13} /> : <ChevronsUpDown size={13} />}
                        </button>
                      ) : <span className="sr-only">{header.column.id === "actions" ? "Aksi" : columnLabels[header.column.id]}</span>}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {pageRows.map(row => (
                <TableRow key={row.id} data-open={row.id === openId}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} data-column={cell.column.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty icon={<Users size={28} />}
          heading={hasAny ? "Tidak ada pegawai yang cocok" : deleted ? "Daftar Terhapus kosong" : "Belum ada pegawai"}
          description={hasAny ? "Ubah kata kunci atau bersihkan saringan untuk melihat pegawai lain." : deleted ? "Pegawai yang dihapus dari daftar aktif akan muncul di sini dan dapat dipulihkan." : "Tambahkan pegawai agar identitasnya tersedia saat mengisi arsip perjalanan."}
          action={chips.length > 0
            ? <Button variant="outline" onClick={onClearAll}>Bersihkan saringan</Button>
            : !deleted ? <Button onClick={onAdd}><Plus /> Tambah pegawai</Button> : undefined} />
      )}

      {rows.length > 0 && (
        <div className="pegawai-pagination">
          <p role="status">Menampilkan <strong>{pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, rows.length)}</strong> dari <strong>{rows.length}</strong> pegawai</p>
          <div className="pegawai-page-size">
            <label htmlFor="pegawai-page-size">Per halaman</label>
            <CustomSelect id="pegawai-page-size" value={String(pageSize)} onValueChange={value => table.setPageSize(Number(value))}>
              {[10, 25, 50].map(size => <SelectOption key={size} value={String(size)}>{size}</SelectOption>)}
            </CustomSelect>
          </div>
          <nav aria-label="Halaman daftar pegawai">
            <Button variant="outline" size="icon-sm" aria-label="Halaman pertama" disabled={!table.getCanPreviousPage()} onClick={() => go(0)}><ChevronsLeft /></Button>
            <Button variant="outline" size="icon-sm" aria-label="Halaman sebelumnya" disabled={!table.getCanPreviousPage()} onClick={() => go(pageIndex - 1)}><ChevronLeft /></Button>
            <span><strong>{pageIndex + 1}</strong> / {pageCount}</span>
            <Button variant="outline" size="icon-sm" aria-label="Halaman berikutnya" disabled={!table.getCanNextPage()} onClick={() => go(pageIndex + 1)}><ChevronRight /></Button>
            <Button variant="outline" size="icon-sm" aria-label="Halaman terakhir" disabled={!table.getCanNextPage()} onClick={() => go(pageCount - 1)}><ChevronsRight /></Button>
          </nav>
        </div>
      )}
    </section>
  );
}

/* Berkas pegawai: menggantikan daftar selama dibuka; daftar kembali lewat tombol, Escape, atau "/". */
function EmployeeRecord({ person, busy, nav, onBack, onOpen, onEdit, onRemove, onRestore }: {
  person: EmployeeRow; busy: boolean; nav: RecordNav; onBack: () => void; onOpen: (id: string) => void;
  onEdit: (person: Employee) => void; onRemove: (person: Employee) => void; onRestore: (person: Employee) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const narrow = useIsNarrow();
  const aliases = person.identities
    .filter(identity => identity.startsWith("name:"))
    .map(identity => identity.slice(5))
    .filter(alias => alias !== person.name.trim().toLocaleLowerCase("id-ID"));
  const days = person.journeys.reduce((sum, trip) => sum + duration(trip), 0);
  const spent = person.journeys.reduce((sum, trip) => sum + (totalCost(trip) ?? 0), 0);
  const unpriced = person.journeys.filter(trip => totalCost(trip) === null).length;
  const year = person.lastTrip ? Number(person.lastTrip.startDate.slice(0, 4)) : new Date().getFullYear();
  const perMonth = Array.from({ length: 12 }, (_, month) =>
    person.journeys.filter(trip => Number(trip.startDate.slice(0, 4)) === year && Number(trip.startDate.slice(5, 7)) === month + 1).length);
  const yearTrips = perMonth.reduce((sum, count) => sum + count, 0);
  const level = (count: number) => (count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3);

  /* Fokus pindah ke nama pegawai setiap berkas berganti; gulir agar kop berkas terlihat. */
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const top = heading.closest(".pegawai-roster")?.getBoundingClientRect().top ?? 0;
    if (top < 72) heading.closest(".pegawai-roster")?.scrollIntoView({ block: "start" });
  }, [person.id]);

  const rank = person.rank.trim();
  const nip = person.nip.trim();
  const department = person.department.trim();

  return (
    <div className="pegawai-record">
      <div className="pegawai-record-bar">
        <button type="button" className="pegawai-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Daftar pegawai</button>
        <div className="pegawai-record-nav" role="group" aria-label="Pindah berkas">
          <Button variant="outline" size="icon-sm" aria-label="Pegawai sebelumnya" disabled={!nav.prev} onClick={() => nav.prev?.()}><ChevronLeft /></Button>
          <span aria-live="polite">{nav.index >= 0 ? `${nav.index + 1} dari ${nav.total}` : "Di luar daftar"}</span>
          <Button variant="outline" size="icon-sm" aria-label="Pegawai berikutnya" disabled={!nav.next} onClick={() => nav.next?.()}><ChevronRight /></Button>
        </div>
      </div>

      <header className="pegawai-record-head" data-deleted={Boolean(person.deletedAt)}>
        <div className="pegawai-record-who">
          <span className="pegawai-mono is-record" aria-hidden="true">{monogram(person.name)}</span>
          <div>
            <span className="pegawai-record-kind">{person.deletedAt ? "Berkas pegawai, pada daftar Terhapus" : "Berkas pegawai"}</span>
            <h2 ref={headingRef} tabIndex={-1}>{person.name}</h2>
            <p className={person.position.trim() ? "" : "is-empty"}>{person.position.trim() || "Jabatan belum dicatat"}</p>
          </div>
        </div>
        <dl className="pegawai-record-ids">
          <div><dt>NIP</dt><dd className={nip ? "pegawai-nip" : "is-empty"}>{nip || "Belum dicatat"}</dd></div>
          <div><dt>Golongan</dt><dd className={rank ? "pegawai-rank" : "is-empty"}>{rank || "Belum dicatat"}</dd></div>
          <div><dt>Bidang</dt><dd className={department ? "" : "is-empty"}>{department || "Belum dicatat"}</dd></div>
        </dl>
        <div className="pegawai-record-actions">
          {person.deletedAt
            ? <Button size="sm" disabled={busy} onClick={() => onRestore(person)}><RotateCcw /> Pulihkan pegawai</Button>
            : <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(person)}><Pencil /> Edit pegawai</Button>
              <Button variant="outline" size="sm" className="is-danger" disabled={busy} onClick={() => onRemove(person)}><Trash2 /> Hapus</Button>
            </>}
        </div>
      </header>

      <dl className="pegawai-record-stats">
        <div><dt>Perjalanan dinas</dt><dd>{person.journeys.length ? person.journeys.length : <span className="is-empty">Belum ada</span>}</dd></div>
        <div><dt>Hari bertugas</dt><dd>{person.journeys.length ? days : <span className="is-empty">–</span>}</dd></div>
        <div><dt>{unpriced ? `Biaya tercatat, ${unpriced} belum bernominal` : "Total biaya tercatat"}</dt><dd>{person.journeys.length ? money(spent) : <span className="is-empty">–</span>}</dd></div>
        <div><dt>Terakhir bertugas</dt><dd>{person.lastTrip ? monthText(person.lastTrip.startDate) : <span className="is-empty">Belum pernah</span>}</dd></div>
        <div><dt>Versi data</dt><dd>{person.version}</dd></div>
      </dl>

      <div className="pegawai-record-body">
        {!person.complete && (
          <div className="pegawai-record-note" role="note">
            <p><strong>Data belum lengkap.</strong> {listText(person.missing.map(item => item.charAt(0).toUpperCase() + item.slice(1)))} belum dicatat, sehingga pegawai ini belum bisa dirujuk secara utuh saat mengisi arsip.</p>
            {!person.deletedAt && <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(person)}>Lengkapi data</Button>}
          </div>
        )}
        {aliases.length > 0 && (
          <section className="pegawai-record-section" aria-label="Nama pada arsip lama">
            <div className="pegawai-record-heading">
              <h3>Nama pada arsip lama</h3>
              <span>Arsip yang dicatat sebelum NIP terisi dikenali lewat nama berikut</span>
            </div>
            <ul className="pegawai-aliases">{aliases.map(alias => <li key={alias}>{alias}</li>)}</ul>
          </section>
        )}

        <section className="pegawai-record-section" aria-label="Perjalanan dinas">
          <div className="pegawai-record-heading">
            <h3>Perjalanan dinas</h3>
            {person.journeys.length > 0 && <span>{person.journeys.length} perjalanan, terbaru di atas</span>}
          </div>
          {person.journeys.length > 0 ? <>
            <div className="pegawai-months" aria-label={`Sebaran perjalanan sepanjang ${year}: ${yearTrips} perjalanan`}>
              <div className="pegawai-months-head"><span>Sebaran {year}</span><span>{yearTrips} perjalanan</span></div>
              <ol className="pegawai-months-grid">
                {perMonth.map((count, month) => (
                  <li key={monthNames[month]} data-level={level(count)} title={`${monthNames[month]} ${year}: ${count} perjalanan`}>
                    <span aria-hidden="true">{monthShort[month]}</span>
                    <b aria-hidden="true">{count || "–"}</b>
                    <span className="sr-only">{monthNames[month]}: {count} perjalanan</span>
                  </li>
                ))}
              </ol>
            </div>
            {narrow ? (
              <ol className="pegawai-trip-list">
                {person.journeys.map(trip => (
                  <li key={trip.id}>
                    <div className="pegawai-trip-main">
                      <span className="pegawai-trip-title">{trip.title}</span>
                      <span className="pegawai-trip-meta">
                        <span>{tripDates(trip)}</span>
                        <span>{trip.destination}</span>
                        {trip.sptNo && <span>ST <b>{trip.sptNo}</b></span>}
                      </span>
                    </div>
                    <div className="pegawai-trip-cost">
                      <strong>{money(totalCost(trip))}</strong>
                      <small>{trip.participants.length} peserta</small>
                    </div>
                    <Button variant="outline" size="sm" className="pegawai-open-archive" onClick={() => onOpen(trip.id)}>Buka arsip</Button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="pegawai-trip-table-wrap">
                <Table className="pegawai-trip-table" aria-label={`Perjalanan dinas ${person.name}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead data-column="dates">Tanggal</TableHead>
                      <TableHead data-column="trip">Perjalanan</TableHead>
                      <TableHead data-column="cost">Biaya</TableHead>
                      <TableHead data-column="open"><span className="sr-only">Buka arsip</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {person.journeys.map(trip => (
                      <TableRow key={trip.id}>
                        <TableCell data-column="dates">
                          <span className="pegawai-trip-dates">{tripDates(trip)}</span>
                          <span className="pegawai-trip-days">{duration(trip)} hari</span>
                        </TableCell>
                        <TableCell data-column="trip">
                          <span className="pegawai-trip-title">{trip.title}</span>
                          <span className="pegawai-trip-meta">
                            <span>{trip.destination}</span>
                            {trip.sptNo ? <span>ST <b>{trip.sptNo}</b></span> : <span>ST belum dicatat</span>}
                          </span>
                        </TableCell>
                        <TableCell data-column="cost">
                          <span className="pegawai-trip-amount">{money(totalCost(trip))}</span>
                          <span className="pegawai-trip-people">{trip.participants.length} peserta</span>
                        </TableCell>
                        <TableCell data-column="open">
                          <Button variant="outline" size="sm" className="pegawai-open-archive" onClick={() => onOpen(trip.id)}>Buka arsip</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </> : (
            <p className="pegawai-record-empty">Nama atau NIP pegawai ini belum muncul pada arsip perjalanan mana pun.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/* Lembar isian pegawai: formulir pendek tanpa rel; kepala dan kaki mengikuti lembar isian formulir lain. */
function EmployeeForm({ employee, departments, onClose, onSaved }: {
  employee: Employee | null; departments: string[]; onClose: () => void; onSaved: (person: Employee) => void;
}) {
  const initial: EmployeeInput = {
    name: employee?.name ?? "", nip: employee?.nip ?? "", position: employee?.position ?? "",
    department: employee?.department ?? "", rank: employee?.rank ?? "",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (patch: Partial<EmployeeInput>) => setForm(current => ({ ...current, ...patch }));
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const saved = await api<Employee>(employee ? `/api/employees/${employee.id}` : "/api/employees", {
        method: employee ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(employee ? { version: employee.version } : {}) }),
      });
      onSaved(saved);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="form-dialog pegawai-dialog sheet-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <div className="dialog-kicker">{employee ? (employee.nip.trim() ? `NIP ${employee.nip}` : "NIP belum dicatat") : "Direktori pegawai"}</div>
          <DialogTitle>{employee ? "Edit pegawai" : "Tambah pegawai"}</DialogTitle>
          <DialogDescription>Data ini menjadi rujukan saat mengisi arsip baru. Identitas pada arsip lama tetap tersimpan apa adanya.</DialogDescription>
        </DialogHeader>
        <form className="editor-form" onSubmit={save}>
          <div className="form-body">
            <fieldset disabled={busy} className="pegawai-fieldset">
              <section className="form-section">
                <h3><IdCard size={17} />Identitas pegawai</h3>
                <div className="form-grid">
                  <Field label="Nama pegawai" required className="span-2">
                    <input autoFocus required maxLength={250} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Nama lengkap beserta gelar" />
                  </Field>
                  <Field label="NIP" hint="Opsional. Tulis sebagai teks agar angka nol di depan tetap tersimpan.">
                    <input maxLength={250} inputMode="numeric" value={form.nip} onChange={e => set({ nip: e.target.value })} placeholder="18 digit" />
                  </Field>
                  <Field label="Golongan" hint="Pilih atau ketik sesuai data kepegawaian.">
                    <Combobox aria-label="Golongan pegawai" maxLength={1000} value={form.rank} onValueChange={rank => set({ rank })} options={employeeRankOptions} placeholder="Pilih atau ketik golongan" />
                  </Field>
                  <Field label="Jabatan" className="span-2">
                    <input maxLength={250} value={form.position} onChange={e => set({ position: e.target.value })} placeholder="Jabatan sesuai SK terakhir" />
                  </Field>
                  <Field label="Bidang" className="span-2">
                    <Combobox aria-label="Bidang pegawai" maxLength={250} value={form.department} onValueChange={department => set({ department })} options={departments.map(value => ({ value }))} placeholder="Pilih atau ketik bidang" />
                  </Field>
                </div>
              </section>
            </fieldset>
          </div>
          <div className="form-footer">
            <ErrorMessage message={error} />
            <div className="footer-actions">
              <div className="form-step-meta"><span>{dirty ? "Ada isian yang belum disimpan" : "Kolom bertanda * wajib diisi"}</span></div>
              <div className="form-action-buttons">
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
                <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy ? "Menyimpan…" : employee ? "Simpan perubahan" : "Simpan pegawai"}</Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

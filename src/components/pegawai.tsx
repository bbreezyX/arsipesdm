"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ExpandedState, type Row, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown,
  Columns3, IdCard, LoaderCircle, MoreHorizontal, Pencil, Plus, RotateCcw, Rows3, Save, Search, Trash2, Users, X,
} from "lucide-react";
import { employeeMatches, employeeRankOptions, type Employee, type EmployeeInput } from "@/lib/employees";
import { dateText, duration, money, totalCost, type Trip } from "@/lib/model";
import { api, Empty, ErrorMessage, Field } from "./fields";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

/* Rel golongan mengikuti empat golongan PNS; format lain tetap bebas dan masuk "tanpa golongan". */
const groups = ["I", "II", "III", "IV"] as const;
type Group = (typeof groups)[number] | "none";
const groupOrder: Record<Group, number> = { I: 1, II: 2, III: 3, IV: 4, none: 5 };
const NONE = "__none__";
const columnLabels: Record<string, string> = {
  name: "Pegawai", nip: "NIP", rank: "Golongan", department: "Bidang", trips: "Perjalanan", actions: "Aksi",
};
const sortOptions = [
  { value: "name:asc", label: "Nama A–Z" }, { value: "name:desc", label: "Nama Z–A" },
  { value: "rank:desc", label: "Golongan tertinggi" }, { value: "rank:asc", label: "Golongan terendah" },
  { value: "nip:asc", label: "NIP terkecil" }, { value: "nip:desc", label: "NIP terbesar" },
  { value: "trips:desc", label: "Perjalanan terbanyak" }, { value: "trips:asc", label: "Perjalanan paling sedikit" },
  { value: "last:desc", label: "Terakhir bertugas" },
];

type EmployeeRow = Employee & {
  group: Group;
  complete: boolean;
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
  return Boolean(p.name.trim() && p.nip.trim() && p.position.trim() && p.rank.trim() && p.department.trim());
}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo<EmployeeRow[]>(() => people.map(person => {
    const journeys = trips
      .filter(trip => !trip.deletedAt && trip.participants.some(participant => employeeMatches(person, participant)))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { ...person, group: rankGroup(person.rank), complete: isCompleteEmployee(person), journeys, lastTrip: journeys[0] ?? null };
  }), [people, trips]);

  const inStatus = useMemo(() => rows.filter(row => Boolean(row.deletedAt) === deleted), [rows, deleted]);
  const activeCount = rows.filter(row => !row.deletedAt).length;
  const deletedCount = rows.length - activeCount;

  /* Lidah bidang: unit yang tercantum pada model dahulu, lalu bidang lain menurut abjad, lalu yang belum dicatat. */
  const spine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of inStatus) counts.set(row.department.trim() || NONE, (counts.get(row.department.trim() || NONE) ?? 0) + 1);
    const known = departments.filter(value => counts.has(value));
    const others = [...counts.keys()].filter(value => value !== NONE && !departments.includes(value)).sort((a, b) => a.localeCompare(b, "id-ID"));
    const keys = [...known, ...others, ...(counts.has(NONE) ? [NONE] : [])];
    return keys.map(key => ({ key, label: key === NONE ? "Belum dicatat" : key, count: counts.get(key) ?? 0 }));
  }, [inStatus, departments]);
  useEffect(() => {
    if (department !== "all" && !spine.some(tab => tab.key === department)) setDepartment("all");
  }, [spine, department]);

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
  const summary = useMemo(() => ({
    count: scoped.length,
    withNip: scoped.filter(row => row.nip.trim()).length,
    travelled: scoped.filter(row => row.journeys.length).length,
    complete: scoped.filter(row => row.complete).length,
    departments: new Set(scoped.map(row => row.department.trim()).filter(Boolean)).size,
  }), [scoped]);
  const completeShare = summary.count ? Math.round((summary.complete / summary.count) * 100) : 0;

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id-ID");
    return scoped.filter(row =>
      (history === "all" || (history === "with") === row.journeys.length > 0)
      && (completeness === "all" || (completeness === "complete") === row.complete)
      && (!search || [row.name, row.nip, row.position, row.department, row.rank].join(" ").toLocaleLowerCase("id-ID").includes(search)));
  }, [scoped, query, history, completeness]);
  const filtered = Boolean(query) || history !== "all" || completeness !== "all";
  const reset = useCallback(() => { setQuery(""); setHistory("all"); setCompleteness("all"); }, []);

  const departmentLabel = department === "all" ? "semua bidang" : department === NONE ? "bidang belum dicatat" : department;
  const scopeLabel = group === "all" ? departmentLabel : `${departmentLabel}, ${group === "none" ? "tanpa golongan" : `golongan ${group}`}`;

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

  return (
    <div className="pegawai-page">
      <header className="ledger-head">
        <div>
          <h1>Pegawai</h1>
          <p>Buku induk pegawai yang menjadi rujukan saat mengisi arsip, tersusun per bidang dan golongan, beserta riwayat perjalanan dinas setiap orang.</p>
        </div>
        <div className="ledger-head-actions">
          <Button disabled={busy} onClick={() => { setError(""); setEditor("new"); }}><Plus /> Tambah pegawai</Button>
        </div>
      </header>
      <nav className="ledger-years" aria-label="Bidang">
        {spine.map(tab => (
          <button type="button" key={tab.key} className="ledger-year" aria-pressed={department === tab.key} onClick={() => setDepartment(tab.key)}>
            <strong>{tab.label}</strong><span>{tab.count} pegawai</span>
          </button>
        ))}
        <button type="button" className="ledger-year ledger-year-all" aria-pressed={department === "all"} onClick={() => setDepartment("all")}>
          <strong>Semua bidang</strong><span>{inStatus.length} pegawai</span>
        </button>
      </nav>
      <section className="ledger-sheet pegawai-sheet" aria-label="Buku induk pegawai">
        <div className="pegawai-index" role="group" aria-label="Golongan">
          <button type="button" className="pegawai-index-all" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
            <strong>Semua golongan</strong><span>{inDepartment.length} pegawai</span>
          </button>
          <div className="pegawai-groups">
            {groups.map(value => {
              const count = groupCounts.get(value) ?? 0;
              return (
                <button type="button" key={value} className="pegawai-group" aria-pressed={group === value} disabled={!count}
                  aria-label={`Golongan ${value}, ${count} pegawai`} onClick={() => setGroup(group === value ? "all" : value)}>
                  <strong>{value}</strong><span>Golongan</span><b>{count}</b>
                </button>
              );
            })}
            <button type="button" className="pegawai-group is-none" aria-pressed={group === "none"} disabled={!groupCounts.get("none")}
              aria-label={`Tanpa golongan, ${groupCounts.get("none") ?? 0} pegawai`} onClick={() => setGroup(group === "none" ? "all" : "none")}>
              <span>Tanpa golongan</span><b>{groupCounts.get("none") ?? 0}</b>
            </button>
          </div>
        </div>
        <div className="ledger-summary pegawai-summary" aria-label={`Ringkasan ${scopeLabel}`}>
          <div>
            <span className="ledger-summary-label">{deleted ? "Pegawai pada daftar Terhapus" : "Pegawai tercatat"}, {scopeLabel}</span>
            {summary.count
              ? <p className="ledger-figure">{summary.count.toLocaleString("id-ID")}<small>pegawai</small></p>
              : <p className="ledger-figure is-empty">Belum ada pegawai</p>}
            <div className="ledger-summary-facts">
              <span><strong>{summary.withNip}</strong> dengan NIP</span>
              <span><strong>{summary.travelled}</strong> pernah bertugas</span>
              {department === "all" && <span><strong>{summary.departments}</strong> bidang</span>}
            </div>
          </div>
          <div>
            <div className="ledger-summary-row"><span>Data lengkap</span><strong>{summary.complete} dari {summary.count}</strong></div>
            <div className={`ledger-bar ${summary.count ? "" : "is-empty"}`} role="img" aria-label={`${completeShare} persen data pegawai lengkap`}>
              {summary.count > 0 && <span style={{ width: `${completeShare}%` }} />}
            </div>
            <div className="ledger-legend">
              <span><i /><strong>{summary.complete}</strong> lengkap</span>
              <span><i className="draft" /><strong>{summary.count - summary.complete}</strong> perlu dilengkapi</span>
            </div>
          </div>
        </div>
        <PegawaiRegister rows={visible} scope={scopeLabel} filtered={filtered} hasAny={scoped.length > 0} deleted={deleted} busy={busy}
          error={removing ? "" : error} onReset={reset} onOpen={onOpen}
          onEdit={person => { setError(""); setEditor(person); }} onRemove={person => { setError(""); setRemoving(person); }}
          onRestore={person => change(person, true)} onAdd={() => { setError(""); setEditor("new"); }}
          status={
            <div className="ledger-status" role="group" aria-label="Daftar pegawai">
              <button type="button" aria-pressed={!deleted} onClick={() => setDeleted(false)}>Aktif <b>{activeCount}</b></button>
              <button type="button" aria-pressed={deleted} onClick={() => setDeleted(true)}>Terhapus <b>{deletedCount}</b></button>
            </div>
          }
          filters={search => <>
            <div className="ledger-search">
              <Search size={17} aria-hidden="true" />
              <input id="pegawai-search" ref={search} aria-label="Cari pegawai" aria-keyshortcuts="/"
                placeholder="Cari nama, NIP, jabatan, atau golongan" value={query} onChange={event => setQuery(event.target.value)} />
              {query ? <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={15} /></button> : <kbd aria-hidden="true">/</kbd>}
            </div>
            <div className="ledger-filter-group">
              <CustomSelect aria-label="Riwayat perjalanan" className="ledger-select" value={history} onValueChange={setHistory} data-active={history !== "all"}>
                <SelectOption value="all">Semua riwayat</SelectOption>
                <SelectOption value="with">Pernah bertugas</SelectOption>
                <SelectOption value="without">Belum pernah bertugas</SelectOption>
              </CustomSelect>
              <CustomSelect aria-label="Kelengkapan data" className="ledger-select" value={completeness} onValueChange={setCompleteness} data-active={completeness !== "all"}>
                <SelectOption value="all">Semua kelengkapan</SelectOption>
                <SelectOption value="complete">Data lengkap</SelectOption>
                <SelectOption value="incomplete">Perlu dilengkapi</SelectOption>
              </CustomSelect>
              {filtered && <Button variant="ghost" size="sm" className="ledger-reset" onClick={reset}>Bersihkan filter</Button>}
            </div>
          </>}
        />
      </section>
      <p className="pegawai-footnote">
        Data lengkap berarti nama, NIP, jabatan, golongan, dan bidang sudah terisi. Riwayat perjalanan dicocokkan lewat NIP, atau lewat nama bila NIP belum tercatat; identitas pada arsip lama tidak berubah saat data pegawai diperbarui.
      </p>
      {editor && (
        <EmployeeForm key={editor === "new" ? "new" : editor.id} employee={editor === "new" ? null : editor} departments={departments}
          onClose={() => setEditor(null)}
          onSaved={person => { onChange(person); setEditor(null); setDeleted(false); reset(); notify(editor === "new" ? "Pegawai ditambahkan ke buku induk." : "Data pegawai tersimpan."); }} />
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

function PegawaiRegister({ rows, scope, filtered, hasAny, deleted, busy, error, status, filters, onReset, onOpen, onEdit, onRemove, onRestore, onAdd }: {
  rows: EmployeeRow[]; scope: string; filtered: boolean; hasAny: boolean; deleted: boolean; busy: boolean; error: string;
  status: ReactNode; filters: (search: React.RefObject<HTMLInputElement | null>) => ReactNode;
  onReset: () => void; onOpen: (id: string) => void; onEdit: (person: Employee) => void;
  onRemove: (person: Employee) => void; onRestore: (person: Employee) => void; onAdd: () => void;
}) {
  const registerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState("comfortable");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault(); searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const menu = useCallback((person: EmployeeRow, row: Row<EmployeeRow>) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="pegawai-menu" disabled={busy} aria-label={`Aksi ${person.name}`}><MoreHorizontal size={17} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => row.toggleExpanded(true)}><IdCard size={15} />Lihat kartu pegawai</DropdownMenuItem>
        {person.deletedAt
          ? <DropdownMenuItem onSelect={() => onRestore(person)}><RotateCcw size={15} />Pulihkan pegawai</DropdownMenuItem>
          : <>
            <DropdownMenuItem onSelect={() => onEdit(person)}><Pencil size={15} />Edit pegawai</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove(person)}><Trash2 size={15} />Hapus pegawai</DropdownMenuItem>
          </>}
      </DropdownMenuContent>
    </DropdownMenu>
  ), [busy, onEdit, onRemove, onRestore]);

  const columns = useMemo<ColumnDef<EmployeeRow>[]>(() => [
    { id: "name", accessorFn: row => row.name, enableHiding: false,
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, "id-ID"),
      cell: ({ row }) => (
        <div className="pegawai-identity">
          <button type="button" className="ledger-ref pegawai-name" onClick={() => row.toggleExpanded()} aria-expanded={row.getIsExpanded()}
            aria-controls={`pegawai-detail-${row.id}`}>{row.original.name}</button>
          <span className={`pegawai-position ${row.original.position ? "" : "is-empty"}`}>{row.original.position || "Jabatan belum dicatat"}</span>
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
        <button type="button" className={`pegawai-trips ${row.original.journeys.length ? "" : "is-empty"}`} onClick={() => row.toggleExpanded()}
          aria-expanded={row.getIsExpanded()} aria-controls={`pegawai-detail-${row.id}`} aria-label={`Riwayat perjalanan ${row.original.name}`}>
          <strong>{row.original.journeys.length ? `${row.original.journeys.length} perjalanan` : "Belum pernah bertugas"}</strong>
          {row.original.lastTrip && <span>Terakhir {monthText(row.original.lastTrip.startDate)}</span>}
        </button>
      ) },
    { id: "last", accessorFn: row => row.lastTrip?.startDate ?? undefined, sortUndefined: "last", enableHiding: false,
      cell: () => null },
    { id: "actions", enableSorting: false, enableHiding: false,
      cell: ({ row }) => (
        <div className="pegawai-row-tools">
          {menu(row.original, row)}
          <Button variant="ghost" size="icon-sm" className="ledger-expand" aria-expanded={row.getIsExpanded()}
            aria-controls={`pegawai-detail-${row.id}`} aria-label={`${row.getIsExpanded() ? "Tutup" : "Buka"} kartu ${row.original.name}`}
            onClick={() => row.toggleExpanded()}><ChevronDown size={16} /></Button>
        </div>
      ) },
  ], [menu]);

  const table = useReactTable({
    data: rows, columns, getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 }, columnVisibility: { last: false } },
    state: { sorting, expanded, columnVisibility: { ...columnVisibility, last: false } },
    onSortingChange: setSorting, onExpandedChange: setExpanded, onColumnVisibilityChange: setColumnVisibility,
    getRowCanExpand: () => true, enableMultiSort: false, enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const pageRows = table.getRowModel().rows;
  const sorted = sorting[0];
  const sortValue = sorted ? `${sorted.id}:${sorted.desc ? "desc" : "asc"}` : "name:asc";
  // biome-ignore lint/correctness/useExhaustiveDependencies: gulir ke atas setiap halaman, urutan, atau data berubah
  useEffect(() => {
    registerRef.current?.querySelector('[data-slot="table-container"]')?.scrollTo({ top: 0 });
  }, [pageIndex, pageSize, sorting, rows]);
  function go(page: number) {
    table.setPageIndex(page);
    if (window.matchMedia("(max-width: 760px)").matches) registerRef.current?.scrollIntoView({ block: "start" });
  }
  const sortSelect = (className: string) => (
    <CustomSelect aria-label="Urutkan pegawai" className={className} value={sortValue}
      onValueChange={value => { const [id, direction] = value.split(":"); setSorting([{ id, desc: direction === "desc" }]); }}>
      {sortOptions.map(option => <SelectOption key={option.value} value={option.value}>{option.label}</SelectOption>)}
    </CustomSelect>
  );
  const detail = (row: Row<EmployeeRow>) => (
    <EmployeeCard person={row.original} deleted={deleted} busy={busy} onOpen={onOpen} onEdit={onEdit} onRemove={onRemove} onRestore={onRestore} />
  );

  return (
    <div className="ledger-register pegawai-register" data-density={density} ref={registerRef}>
      <div className="ledger-register-head">
        <div className="ledger-register-title">
          <h2>{deleted ? "Pegawai terhapus" : "Daftar pegawai"}</h2>
          <span>{scope}</span>
        </div>
        {status}
        <div className="ledger-register-tools">
          {sortSelect("ledger-select pegawai-sort ledger-desktop")}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="ledger-tool ledger-desktop"><Columns3 /> Kolom</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Tampilkan kolom</DropdownMenuLabel><DropdownMenuSeparator />
              {table.getAllLeafColumns().filter(column => column.getCanHide()).map(column => (
                <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onSelect={event => event.preventDefault()}
                  onCheckedChange={checked => column.toggleVisibility(checked)}>{columnLabels[column.id]}</DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="ledger-tool ledger-desktop" aria-label="Kepadatan tabel"><Rows3 /><span>Tampilan</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Kepadatan tabel</DropdownMenuLabel><DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                <DropdownMenuRadioItem value="comfortable">Nyaman</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">Ringkas</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="ledger-filters">
        {filters(searchRef)}
        <div className="ledger-filters-end">
          {sortSelect("ledger-select ledger-sort-select")}
          <span className="ledger-result"><strong>{rows.length}</strong> pegawai</span>
        </div>
      </div>
      {error && <div className="pegawai-error"><ErrorMessage message={error} /></div>}
      {rows.length ? <>
        <div className="ledger-table-wrap">
          <Table className="ledger-table pegawai-table" style={{ minWidth: table.getTotalSize() }} aria-label={deleted ? "Daftar pegawai terhapus" : "Daftar pegawai"}>
            <TableHeader>
              {table.getHeaderGroups().map(group => (
                <TableRow key={group.id}>
                  {group.headers.map(header => (
                    <TableHead key={header.id} data-column={header.column.id}
                      aria-sort={header.column.getCanSort() ? header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none" : undefined}>
                      {header.column.getCanSort() ? (
                        <button type="button" className="ledger-sort" onClick={header.column.getToggleSortingHandler()} aria-label={`Urutkan ${columnLabels[header.column.id]}`}>
                          {columnLabels[header.column.id]}
                          {header.column.getIsSorted() === "asc" ? <ArrowUp size={13} /> : header.column.getIsSorted() === "desc" ? <ArrowDown size={13} /> : <ChevronsUpDown size={13} />}
                        </button>
                      ) : columnLabels[header.column.id]}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {pageRows.map(row => (
                <Fragment key={row.id}>
                  <TableRow data-expanded={row.getIsExpanded()}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} data-column={cell.column.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow className="ledger-detail-row">
                      <TableCell colSpan={row.getVisibleCells().length}><div id={`pegawai-detail-${row.id}`}>{detail(row)}</div></TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="ledger-mobile">
          {pageRows.map(row => {
            const person = row.original;
            return (
              <article className="ledger-card" key={row.id} data-expanded={row.getIsExpanded()}>
                <div className="ledger-card-top">
                  <div className="pegawai-identity">
                    <button type="button" className="ledger-ref pegawai-name" onClick={() => row.toggleExpanded()} aria-expanded={row.getIsExpanded()}
                      aria-controls={`pegawai-mobile-${row.id}`}>{person.name}</button>
                    <span className={`pegawai-position ${person.position ? "" : "is-empty"}`}>{person.position || "Jabatan belum dicatat"}</span>
                  </div>
                  {menu(person, row)}
                </div>
                <dl className="pegawai-card-meta">
                  <div><dt>NIP</dt><dd className={person.nip.trim() ? "pegawai-nip" : "pegawai-empty"}>{person.nip.trim() || "Belum dicatat"}</dd></div>
                  <div><dt>Golongan</dt><dd className={person.rank.trim() ? "" : "pegawai-empty"}>{person.rank.trim() || "Belum dicatat"}</dd></div>
                  <div><dt>Bidang</dt><dd className={person.department.trim() ? "" : "pegawai-empty"}>{person.department.trim() || "Belum dicatat"}</dd></div>
                </dl>
                <div className="ledger-card-bottom">
                  <div className={`pegawai-trips ${person.journeys.length ? "" : "is-empty"}`}>
                    <strong>{person.journeys.length ? `${person.journeys.length} perjalanan` : "Belum pernah bertugas"}</strong>
                    {person.lastTrip && <span>Terakhir {monthText(person.lastTrip.startDate)}</span>}
                  </div>
                  <Button variant="outline" size="sm" aria-expanded={row.getIsExpanded()} aria-controls={`pegawai-mobile-${row.id}`} onClick={() => row.toggleExpanded()}>
                    {row.getIsExpanded() ? "Tutup kartu" : "Kartu pegawai"}
                  </Button>
                </div>
                {row.getIsExpanded() && <div className="ledger-card-detail" id={`pegawai-mobile-${row.id}`}>{detail(row)}</div>}
              </article>
            );
          })}
        </div>
      </> : (
        <Empty icon={<Users size={28} />}
          heading={hasAny ? "Tidak ada pegawai yang cocok" : deleted ? "Daftar Terhapus kosong" : "Belum ada pegawai pada bidang ini"}
          description={hasAny ? "Ubah kata kunci atau bersihkan filter untuk melihat pegawai lain." : deleted ? "Pegawai yang dihapus dari daftar aktif akan muncul di sini dan dapat dipulihkan." : "Tambahkan pegawai agar identitasnya tersedia saat mengisi arsip perjalanan."}
          action={hasAny && filtered
            ? <Button variant="outline" onClick={onReset}>Bersihkan filter</Button>
            : !deleted ? <Button onClick={onAdd}><Plus /> Tambah pegawai</Button> : undefined} />
      )}
      <div className="ledger-pagination">
        <p role="status">Menampilkan <strong>{rows.length ? pageIndex * pageSize + 1 : 0}–{Math.min((pageIndex + 1) * pageSize, rows.length)}</strong> dari <strong>{rows.length}</strong> pegawai</p>
        <div className="ledger-page-size">
          <label htmlFor="pegawai-page-size">Baris per halaman</label>
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
    </div>
  );
}

/* Kartu pegawai: identitas di kiri, riwayat perjalanan di kanan, tindakan di kaki. */
function EmployeeCard({ person, deleted, busy, onOpen, onEdit, onRemove, onRestore }: {
  person: EmployeeRow; deleted: boolean; busy: boolean; onOpen: (id: string) => void;
  onEdit: (person: Employee) => void; onRemove: (person: Employee) => void; onRestore: (person: Employee) => void;
}) {
  const aliases = person.identities
    .filter(identity => identity.startsWith("name:"))
    .map(identity => identity.slice(5))
    .filter(alias => alias !== person.name.trim().toLocaleLowerCase("id-ID"));
  const days = person.journeys.reduce((sum, trip) => sum + duration(trip), 0);
  const value = (text: string) => text.trim() ? text : <span className="pegawai-empty">Belum dicatat</span>;
  return (
    <section className="ledger-detail pegawai-detail" aria-label={`Kartu pegawai ${person.name}`}>
      <div className="pegawai-detail-grid">
        <dl className="pegawai-facts">
          <div className="pegawai-facts-title">Identitas</div>
          <div><dt>NIP</dt>{person.nip.trim() ? <dd className="pegawai-nip">{person.nip}</dd> : <dd>{value("")}</dd>}</div>
          <div><dt>Jabatan</dt><dd>{value(person.position)}</dd></div>
          <div><dt>Golongan</dt><dd>{value(person.rank)}</dd></div>
          <div><dt>Bidang</dt><dd>{value(person.department)}</dd></div>
          {aliases.length > 0 && (
            <div><dt>Nama pada arsip lama</dt><dd><ul className="pegawai-aliases">{aliases.map(alias => <li key={alias}>{alias}</li>)}</ul></dd></div>
          )}
          {!person.complete && (
            <div><dt>Kelengkapan</dt><dd className="pegawai-empty">Perlu dilengkapi</dd></div>
          )}
        </dl>
        <div className="ledger-members pegawai-roster">
          <div className="ledger-members-head">
            <strong>Riwayat perjalanan dinas</strong>
            <span>{person.journeys.length ? `${person.journeys.length} perjalanan, ${days} hari` : "Belum ada perjalanan tercatat"}</span>
          </div>
          {person.journeys.length ? person.journeys.map(trip => {
            const total = totalCost(trip);
            return (
              <div className="ledger-member pegawai-member" key={trip.id}>
                <div className="ledger-member-who">
                  <span className="pegawai-trip-title">{trip.title}</span>
                  <span className="pegawai-trip-meta">
                    <span>{tripDates(trip)}</span>
                    <span>{trip.destination}</span>
                    {trip.sptNo && <span>ST <b>{trip.sptNo}</b></span>}
                  </span>
                </div>
                <div className="ledger-member-cost">
                  <strong>{money(total)}</strong>
                  <small>{trip.participants.length > 1 ? `biaya ${trip.participants.length} peserta` : "biaya perjalanan"}</small>
                </div>
                <Button variant="outline" size="sm" className="pegawai-open" onClick={() => onOpen(trip.id)}>Buka arsip</Button>
              </div>
            );
          }) : (
            <p className="pegawai-roster-empty">Nama atau NIP pegawai ini belum muncul pada arsip perjalanan mana pun.</p>
          )}
        </div>
      </div>
      <div className="pegawai-detail-foot">
        <span>Versi data {person.version}</span>
        <div className="pegawai-detail-actions">
          {deleted
            ? <Button variant="outline" size="sm" disabled={busy} onClick={() => onRestore(person)}><RotateCcw /> Pulihkan pegawai</Button>
            : <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(person)}><Pencil /> Edit pegawai</Button>
              <Button variant="outline" size="sm" className="is-danger" disabled={busy} onClick={() => onRemove(person)}><Trash2 /> Hapus pegawai</Button>
            </>}
        </div>
      </div>
    </section>
  );
}

/* Lembar isian pegawai: kepala biru laut dengan kicker emas, seperti formulir register lain. */
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
      <DialogContent className="form-dialog pegawai-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <div className="dialog-kicker">{employee ? (employee.nip.trim() ? `NIP ${employee.nip}` : "NIP belum dicatat") : "Buku induk pegawai"}</div>
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
              <span className="muted text-xs">{dirty ? "Ada isian yang belum disimpan" : "Kolom bertanda * wajib diisi"}</span>
              <div>
                <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Batal</Button>
                <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy ? "Menyimpan…" : employee ? "Simpan perubahan" : "Simpan pegawai"}</Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ExpandedState, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown,
  Columns3, Copy, FileSpreadsheet, LoaderCircle, MoreHorizontal, Pencil, Plus, RotateCcw, Rows3, Search, SlidersHorizontal, Trash2, Wallet, X,
} from "lucide-react";
import { honorariumCategories, honorariumTotals, newHonorarium, type Honorarium, type HonorariumInput } from "@/lib/honorarium";
import type { Employee } from "@/lib/employees";
import { exportHonorariums } from "@/lib/honorarium-export";
import { entryDateText, entryFilterPhrase, matchesEntry, money, type EntryFilter } from "@/lib/model";
import EntryPeriodFilter from "./entry-period-filter";
import { api, Empty, ErrorMessage } from "./fields";
import HonorariumForm from "./honorarium-form";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Category = Honorarium["category"];
/* Rel jenis mengikuti lima tabel Lampiran 3; nama pendek agar muat dalam sel rel. */
const kinds: { key: Category; short: string }[] = [
  { key: "finance", short: "Pengelola keuangan" },
  { key: "procurement", short: "Pengadaan barang/jasa" },
  { key: "ukpbj", short: "Perangkat UKPBJ" },
  { key: "bmd_revenue", short: "BMD menghasilkan pendapatan" },
  { key: "bmd_non_revenue", short: "BMD tanpa pendapatan" },
];
const columnLabels: Record<string, string> = {
  recipient: "Penerima honor",
  sk: "Dasar SK",
  calc: "Perhitungan",
  gross: "Bruto",
  tax: "Pajak",
  net: "Netto",
  actions: "Aksi",
};
const skKey = (record: Honorarium) => record.skNumber || record.skName;
const recipientKey = (record: Honorarium) => record.recipient.trim().toLocaleLowerCase("id");
const searchable = (record: Honorarium) => [
  record.recipient, record.skName, record.skNumber, record.department, record.activity, record.program,
  record.subActivity, record.skPosition, record.position, record.recipientDepartment, record.notes,
].join(" ").toLocaleLowerCase("id");
function sumTotals(records: Honorarium[]) {
  return records.reduce((sum, record) => {
    const value = honorariumTotals(record);
    return { gross: sum.gross + value.gross, tax: sum.tax + value.tax, net: sum.net + value.net };
  }, { gross: 0, tax: 0, net: 0 });
}
const Figure = ({ value }: { value: number }) => <><small>Rp</small>{value.toLocaleString("id-ID")}</>;
const updatedText = (record: Honorarium) =>
  new Date(record.updatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) + " WIB";

export default function HonorariumWorkspace({ initialRecords, employees, onToast, initialEntry = "all", today }: {
  initialRecords: Honorarium[]; employees: Employee[]; onToast: (message: string) => void;
  initialEntry?: EntryFilter; today: string;
}) {
  const [records, setRecords] = useState(initialRecords);
  const years = useMemo(() => [...new Set(records.map(record => String(record.year)))].sort().reverse(), [records]);
  const [year, setYear] = useState<string>(() => initialEntry !== "all" ? "all" : years[0] ?? "all");
  const [entry, setEntry] = useState<EntryFilter>(initialEntry);
  const [category, setCategory] = useState<"all" | Category>("all");
  const [deleted, setDeleted] = useState(false);
  const [sk, setSk] = useState("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Honorarium | HonorariumInput | null>(null);
  const [removing, setRemoving] = useState<Honorarium | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (year !== "all" && !years.includes(year)) setYear(years[0] ?? "all"); }, [years, year]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) { event.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const activeCount = records.filter(record => !record.deletedAt).length;
  const todayCount = records.filter(record => !record.deletedAt && matchesEntry(record.createdAt, "today", today)).length;
  const yearCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) if (!record.deletedAt) counts.set(String(record.year), (counts.get(String(record.year)) ?? 0) + 1);
    return counts;
  }, [records]);
  /* Kumpulan sesuai tahun dan daftar (aktif/terhapus): dasar rel jenis dan pita ringkasan. */
  const pool = useMemo(() => records.filter(record => Boolean(record.deletedAt) === deleted && (year === "all" || String(record.year) === year)
    && matchesEntry(record.createdAt, entry, today)), [records, deleted, year, entry, today]);
  const kindFacts = useMemo(() => {
    const facts = new Map<Category, { count: number; net: number }>();
    for (const record of pool) {
      const current = facts.get(record.category) ?? { count: 0, net: 0 };
      facts.set(record.category, { count: current.count + 1, net: current.net + honorariumTotals(record).net });
    }
    return facts;
  }, [pool]);
  const scoped = useMemo(() => pool.filter(record => category === "all" || record.category === category), [pool, category]);
  const skOptions = useMemo(() => [...new Set(scoped.map(skKey))].sort((a, b) => a.localeCompare(b, "id")), [scoped]);
  useEffect(() => { if (sk !== "all" && !skOptions.includes(sk)) setSk("all"); }, [skOptions, sk]);
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id");
    return scoped.filter(record => (sk === "all" || skKey(record) === sk) && (!search || searchable(record).includes(search)));
  }, [scoped, sk, query]);
  const foot = useMemo(() => sumTotals(visible), [visible]);
  const summary = useMemo(() => ({
    ...foot, count: visible.length,
    recipients: new Set(visible.map(recipientKey)).size, decrees: new Set(visible.map(skKey)).size,
  }), [visible, foot]);
  const kindLabel = category === "all" ? "semua jenis" : kinds.find(kind => kind.key === category)?.short ?? "";
  const entryLabel = entryFilterPhrase(entry);
  const scopeLabel = `${kindLabel}, ${year === "all" ? "seluruh tahun" : `tahun ${year}`}${entry !== "all" ? ` · ditambahkan ${entryLabel}` : ""}`;
  const filtered = query.trim() !== "" || sk !== "all" || entry !== "all";
  const taxShare = summary.gross ? Math.round(summary.tax / summary.gross * 1000) / 10 : 0;

  function reset() { setQuery(""); setSk("all"); setEntry("all"); }
  function chooseYear(next: string) { setYear(next); setSk("all"); }
  const update = useCallback((record: Honorarium) => {
    setRecords(current => current.some(r => r.id === record.id) ? current.map(r => r.id === record.id ? record : r) : [record, ...current]);
  }, []);
  async function reload() {
    setBusy(true); setError("");
    try { setRecords(await api<Honorarium[]>("/api/honorariums", { cache: "no-store" })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportRows() {
    setBusy(true); setError("");
    try { await exportHonorariums(visible, { year, category, deleted }); onToast(`${visible.length} rekap honorarium diekspor ke Excel.`); }
    catch { setError("Ekspor belum berhasil. Silakan coba lagi."); } finally { setBusy(false); }
  }
  const open = useCallback(async (record: Honorarium, action: "edit" | "delete" | "copy") => {
    setBusy(true); setError("");
    try {
      const latest = await api<Honorarium>(`/api/honorariums/${record.id}`, { cache: "no-store" }); update(latest);
      if (latest.deletedAt) setError("Data sudah dihapus. Buka daftar Terhapus untuk memulihkannya.");
      else if (action === "edit") setEditor(latest);
      else if (action === "delete") setRemoving(latest);
      else setEditor({ ...newHonorarium(), category: latest.category, year: latest.year, skNumber: latest.skNumber,
        skName: latest.skName, department: latest.department, program: latest.program, activity: latest.activity, subActivity: latest.subActivity });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [update]);
  const change = useCallback(async (record: Honorarium, restore: boolean) => {
    setBusy(true); setError("");
    try {
      update(await api<Honorarium>(`/api/honorariums/${record.id}`, {
        method: restore ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: record.version, ...(restore ? { action: "restore" } : {}) }),
      }));
      setRemoving(null); onToast(restore ? "Honorarium dipulihkan." : "Honorarium dipindahkan ke daftar Terhapus.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [update, onToast]);
  const menu = useCallback((record: Honorarium) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="honor-menu" disabled={busy} aria-label={`Aksi honorarium ${record.recipient}`}><MoreHorizontal size={17} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {record.deletedAt ? (
          <DropdownMenuItem onSelect={() => change(record, true)}><RotateCcw size={15} />Pulihkan honorarium</DropdownMenuItem>
        ) : (<>
          <DropdownMenuItem onSelect={() => open(record, "edit")}><Pencil size={15} />Edit honorarium</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open(record, "copy")}><Copy size={15} />Tambah penerima dengan SK ini</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => open(record, "delete")}><Trash2 size={15} />Hapus honorarium</DropdownMenuItem>
        </>)}
      </DropdownMenuContent>
    </DropdownMenu>
  ), [busy, open, change]);

  return (
    <div className="honor-page">
      <header className="ledger-head">
        <div>
          <h1>Honorarium</h1>
          <p>Buku honor penerima menurut SK dan tahun anggaran, dengan bruto, potongan pajak, dan netto sesuai Lampiran 3.</p>
        </div>
        <div className="ledger-head-actions">
          <Button variant="outline" disabled={busy || !visible.length} onClick={exportRows}><FileSpreadsheet /> Ekspor Excel</Button>
          <Button disabled={busy} onClick={() => { setError(""); setEditor(newHonorarium()); }}><Plus /> Tambah honorarium</Button>
        </div>
      </header>
      <nav className="ledger-years" aria-label="Tahun anggaran honorarium">
        {years.map(value => (
          <button type="button" key={value} className="ledger-year" aria-pressed={year === value} onClick={() => chooseYear(value)}>
            <strong>{value}</strong><span>{yearCounts.get(value) ?? 0} rekap</span>
          </button>
        ))}
        <button type="button" className="ledger-year ledger-year-all" aria-pressed={year === "all"} onClick={() => chooseYear("all")}>
          <strong>Semua</strong><span>{activeCount} rekap</span>
        </button>
      </nav>
      <section className="ledger-sheet honor-sheet" aria-label="Buku honorarium">
        <EntryPeriodFilter value={entry} todayCount={todayCount} onChange={setEntry}
          onToday={() => { reset(); setYear("all"); setCategory("all"); setDeleted(false); setEntry("today"); }} />
        <div className="honor-index" role="group" aria-label="Jenis honorarium">
          <button type="button" className="honor-index-all" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
            <strong>Semua jenis</strong><span>{pool.length} rekap</span>
          </button>
          <div className="honor-kinds">
            {kinds.map(kind => {
              const facts = kindFacts.get(kind.key);
              return (
                <button type="button" key={kind.key} className="honor-kind" aria-pressed={category === kind.key} disabled={!facts}
                  aria-label={`${honorariumCategories[kind.key]}, ${facts?.count ?? 0} rekap`}
                  onClick={() => setCategory(category === kind.key ? "all" : kind.key)}>
                  <span>{kind.short}</span>
                  <strong>{facts ? facts.count : "–"}</strong>
                  <small>{facts ? money(facts.net) : "Belum ada rekap"}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="ledger-summary honor-summary" aria-label={`Ringkasan ${scopeLabel}`}>
          <div>
            <span className="ledger-summary-label">{deleted ? "Honor netto pada daftar Terhapus" : "Honor netto dibayarkan"}, {scopeLabel}</span>
            {summary.count ? <p className="ledger-figure"><Figure value={summary.net} /></p> : <p className="ledger-figure is-empty">Belum ada rekap</p>}
            <div className="ledger-summary-facts">
              <span><strong>{summary.count}</strong> rekap</span>
              <span><strong>{summary.recipients}</strong> penerima</span>
              <span><strong>{summary.decrees}</strong> SK</span>
            </div>
          </div>
          <div>
            <div className="ledger-summary-row"><span>Honor bruto</span><strong>{money(summary.gross)}</strong></div>
            <div className={`honor-bar ${summary.gross ? "" : "is-empty"}`} role="img" aria-label={`Netto ${100 - taxShare} persen, pajak ${taxShare} persen dari bruto`}>
              {summary.gross > 0 && <span style={{ width: `${100 - taxShare}%` }} />}
            </div>
            <div className="ledger-legend honor-legend">
              <span><i /><strong>{money(summary.net)}</strong> netto</span>
              <span><i className="tax" /><strong>{money(summary.tax)}</strong> pajak{summary.gross ? ` (${taxShare.toLocaleString("id-ID")}%)` : ""}</span>
            </div>
          </div>
        </div>
        <HonorRegister
          records={visible} foot={foot} scope={scopeLabel} filtered={filtered} hasAny={pool.length > 0} deleted={deleted}
          busy={busy} showYear={year === "all"} showKind={category === "all"} error={removing ? "" : error} menu={menu}
          filterCount={(sk !== "all" ? 1 : 0) + (category !== "all" ? 1 : 0)}
          onReset={reset} onEdit={record => open(record, "edit")} onCopy={record => open(record, "copy")}
          onRemove={record => open(record, "delete")} onRestore={record => change(record, true)} onReload={reload}
          onAdd={() => { setError(""); setEditor(newHonorarium()); }}
          status={
            <div className="ledger-status" role="group" aria-label="Daftar honorarium">
              <button type="button" aria-pressed={!deleted} onClick={() => setDeleted(false)}>Aktif <b>{records.filter(r => !r.deletedAt).length}</b></button>
              <button type="button" aria-pressed={deleted} onClick={() => setDeleted(true)}>Terhapus <b>{records.filter(r => r.deletedAt).length}</b></button>
            </div>
          }
          filters={<>
            <div className="ledger-search">
              <Search size={17} aria-hidden="true" />
              <input id="honor-search" ref={searchRef} aria-label="Cari honorarium" aria-keyshortcuts="/"
                placeholder="Cari nama penerima, nomor SK, jabatan, atau kegiatan" value={query} onChange={event => setQuery(event.target.value)} />
              {query ? <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={15} /></button> : <kbd aria-hidden="true">/</kbd>}
            </div>
            <div className="ledger-filter-group">
              {/* Di layar HP rel jenis disembunyikan; pilihan jenis pindah ke panel Filter ini. */}
              <CustomSelect aria-label="Jenis honorarium" className="ledger-select honor-kind-select" value={category}
                onValueChange={value => setCategory(value as "all" | Category)} data-active={category !== "all"}>
                <SelectOption value="all">Semua jenis</SelectOption>
                {kinds.map(kind => <SelectOption key={kind.key} value={kind.key} disabled={!kindFacts.has(kind.key)}>{kind.short}</SelectOption>)}
              </CustomSelect>
              <CustomSelect aria-label="Dasar SK" className="ledger-select honor-sk-select" value={sk} onValueChange={setSk} data-active={sk !== "all"}>
                <SelectOption value="all">Semua SK</SelectOption>
                {skOptions.map(value => <SelectOption key={value} value={value}>{value}</SelectOption>)}
              </CustomSelect>
              {filtered && <Button variant="ghost" size="sm" className="ledger-reset" onClick={reset}>Bersihkan filter</Button>}
            </div>
          </>}
        />
      </section>
      <p className="honor-footnote">
        Bruto adalah honor per bulan dikali jumlah bulan. Pajak mengikuti nominal atau persentase yang tercantum pada dokumen; netto adalah yang diterima penerima honor.
      </p>
      {editor && <HonorariumForm initial={editor} employees={employees} onClose={() => setEditor(null)}
        onSaved={record => { update(record); setEditor(null); setDeleted(false); setYear(String(record.year)); setCategory("all"); reset(); onToast("Honorarium tersimpan."); }} />}
      <Dialog open={Boolean(removing)} onOpenChange={value => { if (!value && !busy) { setRemoving(null); setError(""); } }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Hapus honorarium?</DialogTitle>
            <DialogDescription>Rekap {removing?.recipient} tahun {removing?.year} akan dipindahkan ke daftar Terhapus dan dapat dipulihkan.</DialogDescription>
          </DialogHeader>
          <ErrorMessage message={error} />
          <div className="honor-dialog-actions">
            <Button variant="outline" disabled={busy} onClick={() => { setRemoving(null); setError(""); }}>Batal</Button>
            <Button variant="destructive" disabled={busy} onClick={() => removing && change(removing, false)}>{busy ? "Menghapus…" : "Hapus honorarium"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HonorRegister({ records, foot, scope, filtered, hasAny, deleted, busy, showYear, showKind, filterCount, error, menu, status, filters,
  onReset, onEdit, onCopy, onRemove, onRestore, onReload, onAdd }: {
  records: Honorarium[]; foot: { gross: number; tax: number; net: number }; scope: string; filtered: boolean; hasAny: boolean;
  deleted: boolean; busy: boolean; showYear: boolean; showKind: boolean; filterCount: number; error: string; menu: (record: Honorarium) => ReactNode;
  status: ReactNode; filters: ReactNode; onReset: () => void; onEdit: (record: Honorarium) => void;
  onCopy: (record: Honorarium) => void; onRemove: (record: Honorarium) => void; onRestore: (record: Honorarium) => void;
  onReload: () => void; onAdd: () => void;
}) {
  const registerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "recipient", desc: false }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState("comfortable");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersShown = filtersOpen || filterCount > 0;
  const columns = useMemo<ColumnDef<Honorarium>[]>(() => [
    { id: "recipient", accessorKey: "recipient", header: "Penerima honor", size: 270, enableHiding: false,
      cell: ({ row }) => (
        <div className="honor-who">
          <button type="button" className="honor-name" onClick={() => row.toggleExpanded()} aria-expanded={row.getIsExpanded()}
            aria-controls={`honor-detail-${row.id}`}>{row.original.recipient}</button>
          <span>{row.original.skPosition}</span>
        </div>
      ) },
    { id: "sk", accessorFn: skKey, header: "Dasar SK", size: 260,
      cell: ({ row }) => (
        <div className="honor-sk">
          <span className={`ledger-ref honor-ref ${row.original.skNumber ? "" : "is-name"}`}>{skKey(row.original)}</span>
          <small>{honorariumCategories[row.original.category]}{showYear ? `, ${row.original.year}` : ""}</small>
        </div>
      ) },
    { id: "calc", accessorKey: "monthlyAmount", header: "Perhitungan", size: 190,
      cell: ({ row }) => <span className="honor-calc-cell">{money(row.original.monthlyAmount)} <b>×</b> {row.original.months} bln</span> },
    { id: "gross", accessorFn: record => honorariumTotals(record).gross, header: "Bruto", size: 150,
      cell: ({ row }) => <span className="honor-amount">{money(honorariumTotals(row.original).gross)}</span> },
    { id: "tax", accessorFn: record => honorariumTotals(record).tax, header: "Pajak", size: 140,
      cell: ({ row }) => (
        <span className="honor-amount is-tax">{money(honorariumTotals(row.original).tax)}
          {row.original.taxMode === "percent" && <small>{row.original.taxRate.toLocaleString("id-ID")}%</small>}
        </span>
      ) },
    { id: "net", accessorFn: record => honorariumTotals(record).net, header: "Netto", size: 160,
      cell: ({ row }) => <strong className="honor-amount is-net">{money(honorariumTotals(row.original).net)}</strong> },
    { id: "actions", header: () => <span className="sr-only">Aksi</span>, size: 92, enableHiding: false, enableSorting: false,
      cell: ({ row }) => (
        <div className="honor-row-tools">
          {menu(row.original)}
          <Button variant="ghost" size="icon-sm" className="ledger-expand" aria-expanded={row.getIsExpanded()}
            aria-controls={`honor-detail-${row.id}`} aria-label={`${row.getIsExpanded() ? "Tutup" : "Buka"} rincian ${row.original.recipient}`}
            onClick={() => row.toggleExpanded()}><ChevronDown /></Button>
        </div>
      ) },
  ], [menu, showYear]);
  const table = useReactTable({
    data: records, columns, getRowId: record => record.id,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    state: { sorting, expanded, columnVisibility },
    onSortingChange: setSorting, onExpandedChange: setExpanded, onColumnVisibilityChange: setColumnVisibility,
    getRowCanExpand: () => true, enableMultiSort: false, enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const rows = table.getRowModel().rows;
  const sorted = sorting[0];
  const sortValue = sorted ? `${sorted.id}:${sorted.desc ? "desc" : "asc"}` : "recipient:asc";
  // biome-ignore lint/correctness/useExhaustiveDependencies: gulir ke atas setiap halaman, urutan, atau data berubah
  useEffect(() => {
    registerRef.current?.querySelector('[data-slot="table-container"]')?.scrollTo({ top: 0 });
  }, [pageIndex, pageSize, sorting, records]);
  function go(page: number) {
    table.setPageIndex(page);
    if (window.matchMedia("(max-width: 760px)").matches) registerRef.current?.scrollIntoView({ block: "start" });
  }
  const footCell = (id: string) => {
    if (id === "recipient") return <span className="honor-foot-label">Jumlah <strong>{records.length}</strong> rekap{records.length > pageSize ? ", seluruh halaman" : ""}</span>;
    if (id === "gross") return money(foot.gross);
    if (id === "tax") return money(foot.tax);
    if (id === "net") return money(foot.net);
    return null;
  };
  const detail = (record: Honorarium) => (
    <HonorDetail record={record} busy={busy} onEdit={() => onEdit(record)} onCopy={() => onCopy(record)}
      onRemove={() => onRemove(record)} onRestore={() => onRestore(record)} />
  );
  return (
    <div className="ledger-register honor-register" data-density={density} ref={registerRef}>
      <div className="ledger-register-head">
        <div className="ledger-register-title">
          <h2>Daftar honorarium</h2>
          <span>{records.length} rekap, {scope}</span>
        </div>
        {status}
        <div className="ledger-register-tools">
          <CustomSelect aria-label="Urutkan honorarium" className="ledger-select honor-sort" value={sortValue}
            onValueChange={value => { const [id, direction] = value.split(":"); setSorting([{ id, desc: direction === "desc" }]); }}>
            <SelectOption value="recipient:asc">Nama A–Z</SelectOption>
            <SelectOption value="recipient:desc">Nama Z–A</SelectOption>
            <SelectOption value="sk:asc">Nomor SK A–Z</SelectOption>
            <SelectOption value="sk:desc">Nomor SK Z–A</SelectOption>
            <SelectOption value="net:desc">Netto tertinggi</SelectOption>
            <SelectOption value="net:asc">Netto terendah</SelectOption>
            <SelectOption value="gross:desc">Bruto tertinggi</SelectOption>
            <SelectOption value="gross:asc">Bruto terendah</SelectOption>
          </CustomSelect>
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
          <Button variant="outline" size="icon-sm" className="ledger-tool honor-reload" disabled={busy} aria-label="Muat ulang daftar" onClick={onReload}>
            {busy ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
          </Button>
        </div>
      </div>
      <div className="ledger-filters" data-open={filtersShown}>
        {filters}
        <button type="button" className="ledger-filter-toggle" aria-expanded={filtersShown} aria-controls="honor-filter-more"
          onClick={() => setFiltersOpen(open => !open)}>
          <SlidersHorizontal size={15} aria-hidden="true" />Filter{filterCount > 0 && <b>{filterCount}</b>}
        </button>
        <div className="ledger-filters-end" id="honor-filter-more">
          <CustomSelect aria-label="Urutkan honorarium" className="ledger-select ledger-sort-select" value={sortValue}
            onValueChange={value => { const [id, direction] = value.split(":"); setSorting([{ id, desc: direction === "desc" }]); }}>
            <SelectOption value="recipient:asc">Nama A–Z</SelectOption>
            <SelectOption value="recipient:desc">Nama Z–A</SelectOption>
            <SelectOption value="sk:asc">Nomor SK A–Z</SelectOption>
            <SelectOption value="net:desc">Netto tertinggi</SelectOption>
            <SelectOption value="net:asc">Netto terendah</SelectOption>
          </CustomSelect>
        </div>
      </div>
      {error && <p role="alert" className="error-message honor-error">{error}</p>}
      {records.length ? (<>
        <div className="ledger-table-wrap">
          <Table className="ledger-table honor-table" style={{ minWidth: table.getTotalSize() }} aria-label="Daftar honorarium">
            <TableHeader>
              {table.getHeaderGroups().map(group => (
                <TableRow key={group.id}>
                  {group.headers.map(header => (
                    <TableHead key={header.id} data-column={header.column.id}
                      aria-sort={header.column.getCanSort() ? header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none" : undefined}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button type="button" className="ledger-sort" onClick={header.column.getToggleSortingHandler()} aria-label={`Urutkan ${columnLabels[header.column.id]}`}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" ? <ArrowUp size={13} /> : header.column.getIsSorted() === "desc" ? <ArrowDown size={13} /> : <ChevronsUpDown size={13} />}
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <Fragment key={row.id}>
                  <TableRow data-expanded={row.getIsExpanded()}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} data-column={cell.column.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow className="ledger-detail-row">
                      <TableCell colSpan={row.getVisibleCells().length}><div id={`honor-detail-${row.id}`}>{detail(row.original)}</div></TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
            <tfoot className="honor-foot">
              <tr>{table.getVisibleLeafColumns().map(column => <td key={column.id} data-column={column.id}>{footCell(column.id)}</td>)}</tr>
            </tfoot>
          </Table>
        </div>
        <div className="ledger-mobile">
          {rows.map(row => {
            const record = row.original; const totals = honorariumTotals(record);
            return (
              <article className="ledger-card honor-card" key={row.id} data-expanded={row.getIsExpanded()}>
                <div className="ledger-card-top">
                  <div className="honor-who">
                    <button type="button" className="honor-name" onClick={() => row.toggleExpanded()} aria-expanded={row.getIsExpanded()} aria-controls={`honor-mobile-${row.id}`}>{record.recipient}</button>
                    <span>{record.skPosition}</span>
                  </div>
                </div>
                <div className="honor-sk">
                  <span className={`ledger-ref honor-ref ${record.skNumber ? "" : "is-name"}`}>{skKey(record)}</span>
                  {(showKind || showYear) && <small>{[showKind ? honorariumCategories[record.category] : "", showYear ? String(record.year) : ""].filter(Boolean).join(", ")}</small>}
                </div>
                <div className="ledger-card-meta">
                  <span>{money(record.monthlyAmount)} × {record.months} bln</span>
                  <span>Pajak {money(totals.tax)}</span>
                </div>
                <div className="ledger-card-bottom">
                  <div className="honor-card-net"><strong>{money(totals.net)}</strong><span>netto</span></div>
                  <Button variant="outline" size="sm" aria-expanded={row.getIsExpanded()} aria-controls={`honor-mobile-${row.id}`} onClick={() => row.toggleExpanded()}>
                    {row.getIsExpanded() ? "Tutup rincian" : "Lihat rincian"}<ChevronDown className={row.getIsExpanded() ? "rotate-180" : undefined} />
                  </Button>
                </div>
                {row.getIsExpanded() && <div className="ledger-card-detail" id={`honor-mobile-${row.id}`}>{detail(record)}</div>}
              </article>
            );
          })}
          <div className="honor-mobile-foot">
            <span>Jumlah {records.length} rekap</span>
            <dl><div><dt>Bruto</dt><dd>{money(foot.gross)}</dd></div><div><dt>Pajak</dt><dd>{money(foot.tax)}</dd></div><div><dt>Netto</dt><dd>{money(foot.net)}</dd></div></dl>
          </div>
        </div>
      </>) : (
        <Empty icon={<Wallet />}
          heading={filtered ? "Honorarium tidak ditemukan" : deleted ? "Belum ada honorarium terhapus" : hasAny ? "Belum ada rekap untuk jenis ini" : "Mulai buku honorarium"}
          description={filtered ? "Coba nama penerima, nomor SK lain, atau bersihkan filter." : deleted ? "Honorarium yang dihapus akan berada di sini dan dapat dipulihkan." : hasAny ? "Pilih jenis lain pada rel di atas, atau tambahkan penerima untuk jenis ini." : "Tambahkan penerima pertama. Bruto dan netto dihitung dari honor per bulan, jumlah bulan, dan pajak yang diisi."}
          action={filtered ? <Button variant="outline" onClick={onReset}>Bersihkan filter</Button> : deleted ? undefined : <Button onClick={onAdd}><Plus /> Tambah honorarium</Button>} />
      )}
      <div className="ledger-pagination">
        <p role="status">Menampilkan <strong>{records.length ? pageIndex * pageSize + 1 : 0}–{Math.min((pageIndex + 1) * pageSize, records.length)}</strong> dari <strong>{records.length}</strong> rekap</p>
        <div className="ledger-page-size">
          <label htmlFor="honor-page-size">Baris per halaman</label>
          <CustomSelect id="honor-page-size" value={String(pageSize)} onValueChange={value => table.setPageSize(Number(value))}>
            {[10, 25, 50].map(size => <SelectOption key={size} value={String(size)}>{size}</SelectOption>)}
          </CustomSelect>
        </div>
        <nav aria-label="Halaman daftar honorarium">
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

/* Rincian yang terbuka di dalam baris: dasar SK, penerima, dan perhitungan honor. */
function HonorDetail({ record, busy, onEdit, onCopy, onRemove, onRestore }: {
  record: Honorarium; busy: boolean; onEdit: () => void; onCopy: () => void; onRemove: () => void; onRestore: () => void;
}) {
  const totals = honorariumTotals(record);
  const value = (text: string | null | undefined) => text ? text : <span className="honor-empty">Belum dicatat</span>;
  const finance = record.category === "finance";
  return (
    <section className="ledger-detail honor-detail" aria-label={`Rincian honorarium ${record.recipient}`}>
      <div className="honor-detail-grid">
        <dl className="honor-facts">
          <div className="honor-facts-title">Dasar SK</div>
          <div><dt>Nomor SK</dt><dd>{value(record.skNumber)}</dd></div>
          <div><dt>Nama SK</dt><dd>{value(record.skName)}</dd></div>
          <div><dt>Unit kerja dalam SK</dt><dd>{value(record.department)}</dd></div>
          {finance && <div><dt>Program</dt><dd>{value(record.program)}</dd></div>}
          <div><dt>Kegiatan</dt><dd>{value(record.activity)}</dd></div>
          {finance && <div><dt>Subkegiatan</dt><dd>{value(record.subActivity)}</dd></div>}
          {finance && <div><dt>Pagu dana dikelola</dt><dd>{record.budget === null ? value("") : money(record.budget)}</dd></div>}
        </dl>
        <dl className="honor-facts">
          <div className="honor-facts-title">Penerima</div>
          <div><dt>Jabatan dalam SK</dt><dd>{value(record.skPosition)}</dd></div>
          <div><dt>Jabatan struktural/fungsional</dt><dd>{value(record.position)}</dd></div>
          <div><dt>Unit kerja penerima</dt><dd>{value(record.recipientDepartment)}</dd></div>
          <div><dt>Eselon</dt><dd>{value(record.echelon)}</dd></div>
          {record.notes && <div><dt>Keterangan</dt><dd>{record.notes}</dd></div>}
        </dl>
        <div className="honor-ledger">
          <div className="honor-ledger-head">Perhitungan honor</div>
          <div><span>Honor per bulan</span><b>{money(record.monthlyAmount)}</b></div>
          <div><span>Jumlah bulan</span><b>{record.months} bulan</b></div>
          <div><span>Honor bruto</span><b>{money(totals.gross)}</b></div>
          <div><span>Pajak{record.taxMode === "percent" ? ` ${record.taxRate.toLocaleString("id-ID")}% dari bruto` : " sesuai nominal"}</span><b>− {money(totals.tax)}</b></div>
          <div className="honor-ledger-total"><span>Honor netto</span><strong>{money(totals.net)}</strong></div>
        </div>
      </div>
      <div className="honor-detail-foot">
        <span>Ditambahkan {entryDateText(record.createdAt)} · Versi {record.version}, diperbarui {updatedText(record)}</span>
        <div className="honor-detail-actions">
          {record.deletedAt ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={onRestore}><RotateCcw /> Pulihkan honorarium</Button>
          ) : (<>
            <Button variant="ghost" size="sm" className="is-danger" disabled={busy} onClick={onRemove}><Trash2 /> Hapus</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={onCopy}><Copy /> Tambah penerima dengan SK ini</Button>
            <Button size="sm" disabled={busy} onClick={onEdit}><Pencil /> Edit honorarium</Button>
          </>)}
        </div>
      </div>
    </section>
  );
}

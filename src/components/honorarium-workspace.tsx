"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ExpandedState, type SortingState, type VisibilityState, type ColumnDef,
} from "@tanstack/react-table";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, FileSpreadsheet,
  MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, Wallet, X,
} from "lucide-react";
import { honorariumCategories, honorariumTotals, newHonorarium, type Honorarium, type HonorariumInput } from "@/lib/honorarium";
import type { Employee } from "@/lib/employees";
import { exportHonorariums } from "@/lib/honorarium-export";
import {
  entryDateText, entryFilterLabel, entryFilterOptions, entryFilterPhrase, isEntryDay, matchesEntry, money, parseEntryFilter,
  type EntryFilter,
} from "@/lib/model";
import { api, Empty, ErrorMessage } from "./fields";
import HonorariumForm from "./honorarium-form";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Category = Honorarium["category"];
/* Jenis mengikuti lima tabel Lampiran 3; nama pendek agar muat di pilihan. */
const kinds: { key: Category; short: string }[] = [
  { key: "finance", short: "Pengelola keuangan" },
  { key: "procurement", short: "Pengadaan barang/jasa" },
  { key: "ukpbj", short: "Perangkat UKPBJ" },
  { key: "bmd_revenue", short: "BMD menghasilkan pendapatan" },
  { key: "bmd_non_revenue", short: "BMD tanpa pendapatan" },
];
const columnLabels: Record<string, string> = {
  recipient: "Penerima honor",
  period: "Periode",
  calc: "Perhitungan",
  gross: "Bruto",
  tax: "Pajak",
  net: "Netto",
};
const sortOptions = [
  ["recipient:asc", "Nama A–Z"],
  ["recipient:desc", "Nama Z–A"],
  ["net:desc", "Netto tertinggi"],
  ["net:asc", "Netto terendah"],
  ["gross:desc", "Bruto tertinggi"],
  ["gross:asc", "Bruto terendah"],
] as const;
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
const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : 0;
const Figure = ({ value }: { value: number }) => <><small>Rp</small>{value.toLocaleString("id-ID")}</>;
const updatedText = (record: Honorarium) =>
  new Date(record.updatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) + " WIB";

/* Pemeriksaan sebelum Lampiran 3 dicetak: tarif pajak, nama SK yang tidak seragam, dan periode yang kosong. */
function honorChecks(records: Honorarium[]) {
  const rates = [...new Set(records.map(record => percent(honorariumTotals(record).tax, honorariumTotals(record).gross)))].sort((a, b) => a - b);
  const names = new Map<string, Set<string>>();
  for (const record of records) {
    if (!record.skNumber) continue;
    const set = names.get(record.skNumber) ?? new Set<string>();
    if (record.skName.trim()) set.add(record.skName.trim());
    names.set(record.skNumber, set);
  }
  return {
    rates,
    mixedNames: [...names].filter(([, set]) => set.size > 1).map(([number, set]) => ({ number, count: set.size })),
    withoutPeriod: records.filter(record => !record.notes.trim()).length,
  };
}

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
  const [sorting, setSorting] = useState<SortingState>([{ id: "recipient", desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState("comfortable");
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
  const deletedCount = records.length - activeCount;
  const todayCount = records.filter(record => !record.deletedAt && matchesEntry(record.createdAt, "today", today)).length;
  const yearCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) if (!record.deletedAt) counts.set(String(record.year), (counts.get(String(record.year)) ?? 0) + 1);
    return counts;
  }, [records]);
  /* Kumpulan sesuai tahun, daftar (aktif/terhapus), dan waktu dicatat: dasar pilihan jenis dan ringkasan. */
  const pool = useMemo(() => records.filter(record => Boolean(record.deletedAt) === deleted && (year === "all" || String(record.year) === year)
    && matchesEntry(record.createdAt, entry, today)), [records, deleted, year, entry, today]);
  const kindCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const record of pool) counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
    return counts;
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
  const checks = useMemo(() => honorChecks(visible), [visible]);
  const kindLabel = category === "all" ? "semua jenis" : kinds.find(kind => kind.key === category)?.short ?? "";
  const scopeLabel = `${kindLabel}, ${year === "all" ? "seluruh tahun" : `tahun ${year}`}${entry !== "all" ? ` · ditambahkan ${entryFilterPhrase(entry)}` : ""}`;
  const filtered = query.trim() !== "" || sk !== "all" || entry !== "all" || category !== "all";
  const taxShare = percent(summary.tax, summary.gross);
  const sortValue = sorting[0] ? `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}` : "recipient:asc";

  function reset() { setQuery(""); setSk("all"); setEntry("all"); setCategory("all"); }
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
    try { await exportHonorariums(visible, { year, category, deleted }); onToast(`${visible.length} rekap honorarium diekspor ke Lampiran 3.`); }
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

  return (
    <div className="honor-page">
      <header className="ledger-head">
        <div>
          <h1>Honorarium</h1>
        </div>
        <div className="ledger-head-actions honor-head-actions">
          <Button variant="outline" disabled={busy || !visible.length} onClick={exportRows}><FileSpreadsheet /> Ekspor Lampiran 3</Button>
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
        <div className="honor-tools">
          <CustomSelect aria-label="Jenis honorarium" className="honor-pill" value={category}
            onValueChange={value => setCategory(value as "all" | Category)} data-active={category !== "all"}>
            <SelectOption value="all">Semua jenis</SelectOption>
            {kinds.map(kind => <SelectOption key={kind.key} value={kind.key} disabled={!kindCounts.has(kind.key)}>
              {kind.short}{kindCounts.has(kind.key) ? "" : " · belum ada"}
            </SelectOption>)}
          </CustomSelect>
          <CustomSelect aria-label="Dasar SK" className="honor-pill honor-pill-sk" value={sk} onValueChange={setSk} data-active={sk !== "all"}>
            <SelectOption value="all">Semua SK</SelectOption>
            {skOptions.map(value => <SelectOption key={value} value={value}>{value}</SelectOption>)}
          </CustomSelect>
          {entry !== "all" && (
            <button type="button" className="honor-chip" onClick={() => setEntry("all")} aria-label={`Hapus saringan ditambahkan ${entryFilterPhrase(entry)}`}>
              Ditambahkan {entryFilterPhrase(entry)} <X aria-hidden="true" />
            </button>
          )}
          {deleted && (
            <button type="button" className="honor-chip" onClick={() => setDeleted(false)} aria-label="Kembali ke daftar aktif">
              Daftar terhapus <X aria-hidden="true" />
            </button>
          )}
          {filtered && <Button variant="ghost" size="sm" className="honor-reset" onClick={reset}><RotateCcw /> Bersihkan filter</Button>}
          <div className="honor-search">
            <Search size={16} aria-hidden="true" />
            <input id="honor-search" ref={searchRef} aria-label="Cari honorarium" aria-keyshortcuts="/"
              placeholder="Cari penerima, nomor SK, atau kegiatan" value={query} onChange={event => setQuery(event.target.value)} />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={15} /></button> : <span aria-hidden="true"><kbd>/</kbd></span>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" className="honor-more" aria-label="Pengaturan daftar"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="honor-menu-panel">
              <DropdownMenuLabel>Urutkan</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortValue} onValueChange={value => { const [id, direction] = value.split(":"); setSorting([{ id, desc: direction === "desc" }]); }}>
                {sortOptions.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Waktu ditambahkan</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={entry} onValueChange={value => setEntry(parseEntryFilter(value))}>
                {entryFilterOptions.map(([key, label]) => (
                  <DropdownMenuRadioItem key={key} value={key}>{label}{key === "today" ? ` · ${todayCount} rekap` : ""}</DropdownMenuRadioItem>
                ))}
                {isEntryDay(entry) && <DropdownMenuRadioItem value={entry}>Tanggal {entryFilterLabel(entry)}</DropdownMenuRadioItem>}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Daftar</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={deleted ? "deleted" : "active"} onValueChange={value => setDeleted(value === "deleted")}>
                <DropdownMenuRadioItem value="active">Aktif · {activeCount}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="deleted">Terhapus · {deletedCount}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Kolom</DropdownMenuLabel>
              {["period", "calc", "gross", "tax"].map(id => (
                <DropdownMenuCheckboxItem key={id} checked={columnVisibility[id] !== false} onSelect={event => event.preventDefault()}
                  onCheckedChange={checked => setColumnVisibility(current => ({ ...current, [id]: checked }))}>{columnLabels[id]}</DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Kepadatan</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                <DropdownMenuRadioItem value="comfortable">Nyaman</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">Ringkas</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={busy} onSelect={reload}><RotateCcw size={15} />Muat ulang daftar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <section className="honor-hero" aria-label={`Ringkasan ${scopeLabel}`}>
          <div>
            <p className="honor-hero-label">{deleted ? "Honor netto pada daftar Terhapus" : "Honor netto dibayarkan"}, {scopeLabel}</p>
            {summary.count ? <strong className="honor-figure"><Figure value={summary.net} /></strong> : <strong className="honor-figure is-empty">Belum ada rekap</strong>}
            <div className="honor-facts-line">
              <span><strong>{summary.count}</strong> rekap</span>
              <span><strong>{summary.recipients}</strong> penerima</span>
              <span><strong>{summary.decrees}</strong> SK</span>
            </div>
          </div>
          {summary.count > 0 && (
            <dl className="honor-slip" aria-label="Perhitungan netto">
              <div><dt>Honor bruto</dt><dd>{money(summary.gross)}</dd></div>
              <div className="is-minus"><dt>Pajak{summary.gross ? ` (${taxShare.toLocaleString("id-ID")}%)` : ""}</dt><dd>− {money(summary.tax)}</dd></div>
              <div className="is-total"><dt>Netto diterima</dt><dd>{money(summary.net)}</dd></div>
            </dl>
          )}
        </section>

        {error && !removing && <p role="alert" className="error-message honor-error">{error}</p>}
        <HonorRegister
          records={visible} filtered={filtered} hasAny={pool.length > 0} deleted={deleted} busy={busy}
          showYear={year === "all"} showKind={category === "all"} sorting={sorting} onSortingChange={setSorting}
          columnVisibility={columnVisibility} density={density}
          onReset={reset} onEdit={record => open(record, "edit")} onCopy={record => open(record, "copy")}
          onRemove={record => open(record, "delete")} onRestore={record => change(record, true)}
          onAdd={() => { setError(""); setEditor(newHonorarium()); }}
        />

        {!deleted && visible.length > 0 && (
          <footer className="honor-checks">
            <p data-state="ok"><span>{checks.rates.length === 1
              ? <>Pajak {checks.rates[0].toLocaleString("id-ID")}% dari bruto pada semua {visible.length} rekap.</>
              : <>Pajak {checks.rates[0].toLocaleString("id-ID")}–{checks.rates[checks.rates.length - 1].toLocaleString("id-ID")}% dari bruto, mengikuti dokumen tiap rekap.</>}</span></p>
            {checks.mixedNames.map(item => (
              <p key={item.number} data-state="gap">
                <span>SK <strong>{item.number}</strong> tercatat dengan <strong>{item.count} nama SK berbeda</strong>; Lampiran 3 menuliskannya apa adanya.</span>
                {sk !== item.number && <button type="button" className="honor-check-link" onClick={() => setSk(item.number)}>Lihat rekapnya</button>}
              </p>
            ))}
            {checks.withoutPeriod > 0 && (
              <p data-state="gap"><span><strong>{checks.withoutPeriod} rekap</strong> belum mencantumkan periode di Keterangan.</span></p>
            )}
            <p className="honor-checks-note">Bruto adalah honor per bulan dikali jumlah bulan; netto adalah yang diterima penerima.</p>
          </footer>
        )}
      </section>
      {editor && <HonorariumForm initial={editor} employees={employees} onClose={() => setEditor(null)}
        onSaved={record => { update(record); setEditor(null); setDeleted(false); setYear(String(record.year)); reset(); onToast("Honorarium tersimpan."); }} />}
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

/* Daftar dikelompokkan per SK. Urutan dan halaman dari tabel; kelompok mengikuti baris pertamanya pada urutan itu. */
function HonorRegister({ records, filtered, hasAny, deleted, busy, showYear, showKind, sorting, onSortingChange,
  columnVisibility, density, onReset, onEdit, onCopy, onRemove, onRestore, onAdd }: {
  records: Honorarium[]; filtered: boolean; hasAny: boolean; deleted: boolean; busy: boolean;
  showYear: boolean; showKind: boolean; sorting: SortingState; onSortingChange: (value: SortingState) => void;
  columnVisibility: VisibilityState; density: string;
  onReset: () => void; onEdit: (record: Honorarium) => void; onCopy: (record: Honorarium) => void;
  onRemove: (record: Honorarium) => void; onRestore: (record: Honorarium) => void; onAdd: () => void;
}) {
  const registerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const columns = useMemo<ColumnDef<Honorarium>[]>(() => [
    { id: "recipient", accessorKey: "recipient" },
    { id: "period", accessorKey: "notes" },
    { id: "calc", accessorKey: "monthlyAmount" },
    { id: "gross", accessorFn: record => honorariumTotals(record).gross },
    { id: "tax", accessorFn: record => honorariumTotals(record).tax },
    { id: "net", accessorFn: record => honorariumTotals(record).net },
  ], []);
  const table = useReactTable({
    data: records, columns, getRowId: record => record.id,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    state: { sorting, expanded, columnVisibility },
    onSortingChange: updater => onSortingChange(typeof updater === "function" ? updater(sorting) : updater),
    onExpandedChange: setExpanded, getRowCanExpand: () => true, enableMultiSort: false, enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const rows = table.getRowModel().rows;
  const shown = (id: string) => columnVisibility[id] !== false;
  const span = 3 + ["period", "calc", "gross", "tax"].filter(shown).length;
  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) map.set(skKey(row.original), [...(map.get(skKey(row.original)) ?? []), row]);
    return [...map].map(([key, members]) => {
      const all = records.filter(record => skKey(record) === key);
      const first = members[0].original;
      return {
        key, members, count: all.length, net: sumTotals(all).net, named: Boolean(first.skNumber),
        meta: [showKind ? honorariumCategories[first.category] : "", showYear ? [...new Set(all.map(record => record.year))].join(", ") : ""].filter(Boolean).join(" · "),
      };
    });
  }, [rows, records, showKind, showYear]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: kembali ke halaman pertama saat data atau urutan berubah
  useEffect(() => { table.setPageIndex(0); }, [records, sorting]);
  function go(page: number) {
    table.setPageIndex(page);
    registerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  const detail = (record: Honorarium) => (
    <HonorDetail record={record} busy={busy} onEdit={() => onEdit(record)} onCopy={() => onCopy(record)}
      onRemove={() => onRemove(record)} onRestore={() => onRestore(record)} />
  );

  if (!records.length) return (
    <Empty icon={<Wallet />}
      heading={filtered ? "Honorarium tidak ditemukan" : deleted ? "Belum ada honorarium terhapus" : hasAny ? "Belum ada rekap untuk jenis ini" : "Mulai buku honorarium"}
      description={filtered ? "Coba nama penerima, nomor SK lain, atau bersihkan filter." : deleted ? "Honorarium yang dihapus akan berada di sini dan dapat dipulihkan." : hasAny ? "Pilih jenis lain, atau tambahkan penerima untuk jenis ini." : "Tambahkan penerima pertama. Bruto dan netto dihitung dari honor per bulan, jumlah bulan, dan pajak yang diisi."}
      action={filtered ? <Button variant="outline" onClick={onReset}>Bersihkan filter</Button> : deleted ? undefined : <Button onClick={onAdd}><Plus /> Tambah honorarium</Button>} />
  );

  return (
    <div className="honor-register" data-density={density} ref={registerRef}>
      <table className="honor-table" aria-label="Daftar honorarium">
        <thead>
          <tr>
            <th scope="col">Penerima</th>
            {shown("period") && <th scope="col">Periode</th>}
            {shown("calc") && <th scope="col" className="is-number">Perhitungan</th>}
            {shown("gross") && <th scope="col" className="is-number">Bruto</th>}
            {shown("tax") && <th scope="col" className="is-number">Pajak</th>}
            <th scope="col" className="is-number">Netto</th>
            <th scope="col"><span className="sr-only">Rincian</span></th>
          </tr>
        </thead>
        {groups.map(group => (
          <tbody key={group.key}>
            <tr className="honor-group">
              <th scope="colgroup" colSpan={span - 2}>
                <span className={group.named ? "honor-group-sk" : "honor-group-sk is-name"}>{group.key}</span>
                <span className="honor-group-meta">{[group.meta, `${group.count} rekap`].filter(Boolean).join(" · ")}</span>
              </th>
              <td className="is-number">{group.net.toLocaleString("id-ID")}</td>
              <td />
            </tr>
            {group.members.map(row => {
              const record = row.original; const totals = honorariumTotals(record); const open = row.getIsExpanded();
              return (
                <Fragment key={row.id}>
                  <tr className="honor-row" data-expanded={open || undefined} onClick={() => row.toggleExpanded()}>
                    <th scope="row">
                      <button type="button" className="honor-name" aria-expanded={open} aria-controls={`honor-detail-${row.id}`}
                        onClick={event => { event.stopPropagation(); row.toggleExpanded(); }}>{record.recipient}</button>
                      <span className="honor-role">{record.skPosition}</span>
                    </th>
                    {shown("period") && <td className="honor-period">{record.notes.trim() || <span className="honor-empty">Belum dicatat</span>}</td>}
                    {shown("calc") && <td className="is-number honor-muted">{money(record.monthlyAmount)} × {record.months} bln</td>}
                    {shown("gross") && <td className="is-number">{totals.gross.toLocaleString("id-ID")}</td>}
                    {shown("tax") && <td className="is-number honor-muted">
                      {totals.tax.toLocaleString("id-ID")}
                      {record.taxMode === "percent" && <small>{record.taxRate.toLocaleString("id-ID")}%</small>}
                    </td>}
                    <td className="is-number honor-net">{totals.net.toLocaleString("id-ID")}</td>
                    <td className="honor-toggle"><ChevronDown aria-hidden="true" /></td>
                  </tr>
                  {open && (
                    <tr className="honor-detail-row">
                      <td colSpan={span}><div id={`honor-detail-${row.id}`}>{detail(record)}</div></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th scope="row">Jumlah {records.length} rekap</th>
            {shown("period") && <td />}
            {shown("calc") && <td />}
            {shown("gross") && <td className="is-number">{sumTotals(records).gross.toLocaleString("id-ID")}</td>}
            {shown("tax") && <td className="is-number">{sumTotals(records).tax.toLocaleString("id-ID")}</td>}
            <td className="is-number">{money(sumTotals(records).net)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="honor-list">
        {groups.map(group => (
          <section key={group.key} aria-label={`SK ${group.key}`}>
            <h3 className="honor-list-group">
              <span className={group.named ? "honor-group-sk" : "honor-group-sk is-name"}>{group.key}</span>
              <span className="honor-group-meta">{[group.meta, money(group.net)].filter(Boolean).join(" · ")}</span>
            </h3>
            {group.members.map(row => {
              const record = row.original; const totals = honorariumTotals(record); const open = row.getIsExpanded();
              return (
                <div key={row.id} className="honor-list-item" data-expanded={open || undefined}>
                  <button type="button" className="honor-list-row" aria-expanded={open} aria-controls={`honor-mobile-${row.id}`} onClick={() => row.toggleExpanded()}>
                    <span className="honor-period">{record.notes.trim() || "Periode belum dicatat"}</span>
                    <strong className="honor-net">{money(totals.net)}</strong>
                    <small>{record.recipient} · {money(record.monthlyAmount)} × {record.months} bln · pajak {money(totals.tax)}</small>
                  </button>
                  {open && <div id={`honor-mobile-${row.id}`} className="honor-list-detail">{detail(record)}</div>}
                </div>
              );
            })}
          </section>
        ))}
        <p className="honor-list-total"><span>Jumlah {records.length} rekap</span><strong>{money(sumTotals(records).net)}</strong></p>
      </div>

      {records.length > 10 && (
        <div className="ledger-pagination">
          <p role="status">Menampilkan <strong>{pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, records.length)}</strong> dari <strong>{records.length}</strong> rekap</p>
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
      )}
    </div>
  );
}

/* Rincian yang terbuka di dalam baris: keterangan SK dan penerima di kiri, slip perhitungan di kanan.
   Nomor SK sudah ada di kepala kelompok dan periode di baris, jadi tidak diulang. */
function HonorDetail({ record, busy, onEdit, onCopy, onRemove, onRestore }: {
  record: Honorarium; busy: boolean; onEdit: () => void; onCopy: () => void; onRemove: () => void; onRestore: () => void;
}) {
  const totals = honorariumTotals(record);
  const finance = record.category === "finance";
  const fact = (label: string, text: string | null | undefined, wide = false) => (
    <div className={wide ? "is-wide" : undefined}>
      <dt>{label}</dt>
      <dd>{text ? text : <span className="honor-empty">Belum dicatat</span>}</dd>
    </div>
  );
  return (
    <section className="honor-detail" aria-label={`Rincian honorarium ${record.recipient}`}>
      <div className="honor-detail-body">
        <div className="honor-detail-facts">
          <h4>Dasar SK</h4>
          <dl>
            {fact("Nama SK", record.skName, true)}
            {finance && fact("Program", record.program, true)}
            {fact("Kegiatan", record.activity, true)}
            {finance && fact("Subkegiatan", record.subActivity, true)}
            {fact("Unit kerja dalam SK", record.department)}
            {finance && fact("Pagu dana dikelola", record.budget === null ? "" : money(record.budget))}
          </dl>
          <h4>Penerima</h4>
          <dl>
            {fact("Jabatan dalam SK", record.skPosition)}
            {fact("Jabatan struktural/fungsional", record.position)}
            {fact("Unit kerja", record.recipientDepartment)}
            {fact("Eselon", record.echelon)}
          </dl>
        </div>
        <dl className="honor-slip honor-detail-slip" aria-label="Perhitungan honor">
          <div><dt>Honor per bulan</dt><dd>{money(record.monthlyAmount)}</dd></div>
          <div><dt>Jumlah bulan</dt><dd>× {record.months}</dd></div>
          <div><dt>Honor bruto</dt><dd>{money(totals.gross)}</dd></div>
          <div className="is-minus"><dt>Pajak{record.taxMode === "percent" ? ` (${record.taxRate.toLocaleString("id-ID")}%)` : ""}</dt><dd>− {money(totals.tax)}</dd></div>
          <div className="is-total"><dt>Netto diterima</dt><dd>{money(totals.net)}</dd></div>
        </dl>
      </div>
      <div className="honor-detail-foot">
        <span>Ditambahkan {entryDateText(record.createdAt)} · diperbarui {updatedText(record)}</span>
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

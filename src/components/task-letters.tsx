"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Columns3,
  FileText,
  MapPin,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { dateText, money, shortMoney, totalCost, type Trip } from "@/lib/model";
import {
  destinationFacts,
  filterTaskLetters,
  groupTaskLetters,
  letterMatchesDestination,
  summarizeTripCosts,
  type DestinationFact,
  type TaskLetter,
} from "@/lib/task-letters";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";
import { Empty } from "./fields";

/* Bulan mengikuti penomoran surat dinas: angka Romawi pada nomor ST. */
const months = [
  ["I", "Januari"], ["II", "Februari"], ["III", "Maret"], ["IV", "April"],
  ["V", "Mei"], ["VI", "Juni"], ["VII", "Juli"], ["VIII", "Agustus"],
  ["IX", "September"], ["X", "Oktober"], ["XI", "November"], ["XII", "Desember"],
] as const;

const columnLabels: Record<string, string> = {
  reference: "Nomor surat",
  activity: "Kegiatan dan tujuan",
  dates: "Pelaksanaan",
  people: "Pegawai",
  total: "Realisasi",
  actions: "Rincian",
};

function dateRange(start: string, end: string) {
  if (start === end) return dateText(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${dateText(start, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${dateText(end)}`;
}

function dayCount(start: string, end: string) {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return `${Math.max(1, days)} hari`;
}

const longDate = { day: "numeric", month: "long", year: "numeric" } as const;
/** Waktu pelaksanaan seperti ditulis di badan surat: "21 Juli 2026 s.d. 23 Juli 2026". */
function letterPeriod(start: string, end: string) {
  return start === end ? dateText(start, longDate) : `${dateText(start, longDate)} s.d. ${dateText(end, longDate)}`;
}

function tripMonth(trip: Trip) {
  return Number(trip.startDate.slice(5, 7)) - 1;
}

function letterMatchesYear(letter: TaskLetter, year: string) {
  return year === "all" || letter.trips.some((trip) => trip.startDate.slice(0, 4) === year);
}

function letterMatchesMonth(letter: TaskLetter, year: string, month: number | null) {
  if (month === null) return true;
  return letter.trips.some(
    (trip) => tripMonth(trip) === month && (year === "all" || trip.startDate.slice(0, 4) === year),
  );
}

function peopleOf(letter: TaskLetter) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const trip of letter.trips) {
    for (const person of trip.participants) {
      const key = person.nip.trim() ? `nip:${person.nip.replace(/\s+/g, "")}` : `name:${person.name.trim().toLocaleLowerCase("id-ID")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(person.name.trim());
    }
  }
  return names;
}

const columns: ColumnDef<TaskLetter>[] = [
  {
    id: "reference",
    accessorKey: "number",
    header: "Nomor surat",
    size: 210,
    enableHiding: false,
    cell: ({ row }) => (
      <button type="button"
        className="ledger-ref surat-ref"
        onClick={() => row.toggleExpanded()}
        aria-expanded={row.getIsExpanded()}
        aria-controls={`surat-detail-${encodeURIComponent(row.id)}`}
      >
        {row.original.number}
      </button>
    ),
  },
  {
    id: "activity",
    accessorFn: (letter) => letter.titles[0],
    header: "Kegiatan dan tujuan",
    size: 290,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="surat-activity">
        <p title={row.original.titles.join("\n")}>{row.original.titles[0]}</p>
        <span>
          {row.original.destinations.join(", ")}
          {row.original.titles.length > 1 ? ` · ${row.original.titles.length} kegiatan` : ""}
        </span>
      </div>
    ),
  },
  {
    id: "dates",
    accessorKey: "startDate",
    header: "Pelaksanaan",
    size: 140,
    cell: ({ row }) => (
      <div className="ledger-dates">
        <time dateTime={row.original.startDate}>{dateRange(row.original.startDate, row.original.endDate)}</time>
        <span>{dayCount(row.original.startDate, row.original.endDate)}</span>
      </div>
    ),
  },
  {
    id: "people",
    accessorKey: "peopleCount",
    header: "Pegawai",
    size: 160,
    cell: ({ row }) => <LetterPeople letter={row.original} />,
  },
  {
    id: "total",
    accessorFn: (letter) => letter.total ?? undefined,
    header: "Realisasi",
    size: 150,
    sortUndefined: "last",
    cell: ({ row }) => <LetterAmount letter={row.original} />,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Rincian</span>,
    size: 48,
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon-sm"
        className="ledger-expand"
        aria-label={`${row.getIsExpanded() ? "Tutup" : "Buka"} surat ${row.original.number}`}
        aria-expanded={row.getIsExpanded()}
        aria-controls={`surat-detail-${encodeURIComponent(row.id)}`}
        onClick={() => row.toggleExpanded()}
      >
        <ChevronDown />
      </Button>
    ),
  },
];

export default function TaskLetters({ trips, onOpen }: { trips: Trip[]; onOpen: (id: string) => void }) {
  const { letters, unassigned } = useMemo(() => groupTaskLetters(trips), [trips]);
  const years = useMemo(
    () => [...new Set(letters.flatMap((letter) => letter.trips.map((trip) => trip.startDate.slice(0, 4))))].sort().reverse(),
    [letters],
  );
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>(() => years[0] ?? "all");
  const [month, setMonth] = useState<number | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (year !== "all" && !years.includes(year)) setYear(years[0] ?? "all");
  }, [years, year]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const inYear = useMemo(() => letters.filter((letter) => letterMatchesYear(letter, year)), [letters, year]);
  const yearCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const letter of letters)
      for (const y of new Set(letter.trips.map((trip) => trip.startDate.slice(0, 4))))
        counts.set(y, (counts.get(y) ?? 0) + 1);
    return counts;
  }, [letters]);
  const monthCounts = useMemo(() => {
    const counts = Array<number>(12).fill(0);
    for (const letter of inYear) {
      const seen = new Set<number>();
      for (const trip of letter.trips) {
        if (year !== "all" && trip.startDate.slice(0, 4) !== year) continue;
        seen.add(tripMonth(trip));
      }
      for (const m of seen) counts[m]++;
    }
    return counts;
  }, [inYear, year]);
  const inMonth = useMemo(() => inYear.filter((letter) => letterMatchesMonth(letter, year, month)), [inYear, year, month]);
  // The destination rail follows the year and month, never its own choice, so every place stays clickable.
  const places = useMemo(() => destinationFacts(inMonth, year), [inMonth, year]);
  const placeFact = place === null ? null : places.find((fact) => fact.key === place) ?? null;
  useEffect(() => {
    if (place !== null && !places.some((fact) => fact.key === place)) setPlace(null);
  }, [places, place]);
  const scoped = useMemo(() => inMonth.filter((letter) => letterMatchesDestination(letter, year, place)), [inMonth, year, place]);
  const summary = useMemo(() => {
    const scopedTrips = scoped.flatMap((letter) =>
      letter.trips.filter((trip) => year === "all" || trip.startDate.slice(0, 4) === year));
    const people = new Set(scopedTrips.flatMap((trip) => trip.participants.map((person) =>
      person.nip.trim() ? `nip:${person.nip.replace(/\s+/g, "")}` : `name:${person.name.trim().toLocaleLowerCase("id-ID")}`)));
    const destinations = destinationFacts(scoped, year);
    return {
      letters: scoped.length, trips: scopedTrips.length, people: people.size, ...summarizeTripCosts(scopedTrips),
      places: destinations.length, outside: destinations.filter((fact) => !fact.inJambi).length,
    };
  }, [scoped, year]);
  const visible = useMemo(() => filterTaskLetters(scoped, query, "all"), [scoped, query]);
  const periodLabel = month === null
    ? year === "all" ? "seluruh tahun" : `tahun ${year}`
    : `${months[month][1]}${year === "all" ? ", seluruh tahun" : ` ${year}`}`;
  const scopeLabel = placeFact ? `${periodLabel} · ${placeFact.name}` : periodLabel;

  const filtered = query.trim() !== "" || month !== null || place !== null;
  function reset() { setQuery(""); setMonth(null); setPlace(null); }
  function chooseYear(next: string) { setYear(next); setMonth(null); setPlace(null); }

  return (
    <div className="surat-page">
      <header className="ledger-head surat-head">
        <div>
          <h1>Surat Tugas</h1>
          <p className="surat-head-facts">
            <b>{summary.letters}</b> surat · <b>{summary.trips}</b> rekap · <b>{summary.people}</b> pegawai · <b>{summary.places}</b> tujuan
            {summary.outside ? `, ${summary.outside} luar provinsi` : ""}
          </p>
        </div>
        <div className="surat-head-total">
          <span>Realisasi {scopeLabel}</span>
          <strong>{summary.total === null ? "Belum dicatat" : money(summary.total)}</strong>
          <small className={summary.unknownCount ? "is-warning" : undefined}>
            {summary.unknownCount
              ? `${summary.unknownCount} dari ${summary.trips} rekap belum bernominal`
              : summary.trips ? "Seluruh rekap sudah bernominal" : "Belum ada rekap"}
          </small>
        </div>
      </header>
      <section className="ledger-sheet surat-sheet" aria-label="Register surat tugas">
        <div className="surat-bar">
          <div className="surat-years" role="group" aria-label="Tahun surat tugas">
            {years.map((value) => (
              <button type="button"
                key={value}
                aria-pressed={year === value}
                title={`${yearCounts.get(value)} surat tugas`}
                onClick={() => chooseYear(value)}
              >
                {value}
              </button>
            ))}
            <button type="button" aria-pressed={year === "all"} title={`${letters.length} surat tugas`} onClick={() => chooseYear("all")}>
              Semua
            </button>
          </div>
          <div className="surat-months" role="group" aria-label="Bulan pelaksanaan">
            {months.map(([roman, name], index) => {
              const count = monthCounts[index];
              return (
                <button type="button"
                  key={roman}
                  aria-pressed={month === index}
                  aria-label={`${name}, ${count} surat tugas`}
                  title={name}
                  disabled={count === 0}
                  onClick={() => setMonth(month === index ? null : index)}
                >
                  <strong>{roman}</strong>
                  <span>{count || "–"}</span>
                </button>
              );
            })}
          </div>
          <DestinationPicker places={places} value={place} onChange={setPlace} />
        </div>
        <LetterRegister
          letters={visible}
          filtered={filtered}
          hasAny={letters.length > 0}
          scope={scopeLabel}
          onReset={reset}
          onOpen={onOpen}
          search={
            <div className="ledger-search">
              <Search size={17} aria-hidden="true" />
              <input
                id="surat-search"
                ref={searchRef}
                aria-label="Cari surat tugas"
                aria-keyshortcuts="/"
                placeholder="Cari nomor surat, kegiatan, tujuan, atau nama pegawai"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={15} /></button>
              ) : (
                <span aria-hidden="true"><kbd>/</kbd></span>
              )}
            </div>
          }
        />
      </section>
      <p className="surat-footnote">
        Total setiap surat tugas menjumlahkan seluruh rekapnya, termasuk rekap gabungan yang dihitung satu kali. Arsip di Sampah tidak dihitung, dan biaya yang belum dicatat tidak dianggap nol.
      </p>
      {unassigned.length > 0 && (
        <section className="surat-unassigned" aria-label="Rekap tanpa nomor surat tugas">
          <div className="surat-unassigned-head">
            <div>
              <strong>{unassigned.length} rekap belum memiliki nomor surat tugas</strong>
              <p>Rekap ini belum masuk ke register. Lengkapi nomor ST pada arsip perjalanannya agar ikut terhitung.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ledger-tool"
              aria-expanded={showUnassigned}
              aria-controls="surat-unassigned-list"
              onClick={() => setShowUnassigned(!showUnassigned)}
            >
              {showUnassigned ? "Tutup daftar" : "Lihat rekap"}
              <ChevronDown className={showUnassigned ? "rotate-180" : undefined} />
            </Button>
          </div>
          {showUnassigned && (
            <div id="surat-unassigned-list" className="surat-unassigned-list">
              <Roster trips={unassigned} onOpen={onOpen} showTitles />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* Tujuan: satu pilihan di toolbar; tempat yang paling sering dituju di urutan teratas menu. */
function DestinationPicker({ places, value, onChange }: {
  places: DestinationFact[]; value: string | null; onChange: (next: string | null) => void;
}) {
  if (!places.length) return null;
  const chosen = value === null ? null : places.find((fact) => fact.key === value) ?? null;
  const outside = places.filter((fact) => !fact.inJambi).length;
  const current = chosen ? chosen.name : `Semua · ${places.length}`;
  return (
    <div className="surat-places-compact">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="surat-places-pick" data-chosen={chosen ? "true" : undefined} aria-label={`Tujuan: ${current}`}>
            <span>Tujuan</span>
            <b>{current}</b>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="surat-place-menu">
          <DropdownMenuItem onSelect={() => onChange(null)} data-active={value === null ? "true" : undefined}>
            <span>Semua tujuan</span>
            <small>{places.length} tujuan{outside ? ` · ${outside} luar provinsi` : ""}</small>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {places.map((fact) => (
            <DropdownMenuItem key={fact.key} onSelect={() => onChange(fact.key)} data-active={value === fact.key ? "true" : undefined}>
              <span>{fact.name}</span>
              <small>{fact.letters} surat{fact.total === null ? "" : ` · Rp ${shortMoney(fact.total)}`}</small>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LetterRegister({ letters, filtered, hasAny, scope, onReset, onOpen, search }: {
  letters: TaskLetter[];
  filtered: boolean;
  hasAny: boolean;
  scope: string;
  onReset: () => void;
  onOpen: (id: string) => void;
  search: ReactNode;
}) {
  const registerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "dates", desc: true }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState("comfortable");
  const table = useReactTable({
    data: letters,
    columns,
    getRowId: (letter) => letter.key,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    state: { sorting, expanded, columnVisibility },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    getRowCanExpand: () => true,
    enableMultiSort: false,
    enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const rows = table.getRowModel().rows;
  const sorted = sorting[0];
  const sortValue = sorted ? `${sorted.id}:${sorted.desc ? "desc" : "asc"}` : "dates:desc";
  // biome-ignore lint/correctness/useExhaustiveDependencies: gulir ke atas setiap halaman, urutan, atau data berubah
  useEffect(() => {
    registerRef.current?.querySelector('[data-slot="table-container"]')?.scrollTo({ top: 0 });
  }, [pageIndex, pageSize, sorting, letters]);
  function go(page: number) {
    table.setPageIndex(page);
    if (window.matchMedia("(max-width: 760px)").matches) registerRef.current?.scrollIntoView({ block: "start" });
  }
  return (
    <div className="ledger-register surat-register" data-density={density} ref={registerRef}>
      <div className="ledger-register-head surat-register-head">
        <h2 className="sr-only">Daftar surat tugas</h2>
        {search}
        {filtered && (
          <Button variant="ghost" size="sm" className="ledger-reset" onClick={onReset}>Bersihkan filter</Button>
        )}
        <span className="surat-register-count" title={`${letters.length} surat, ${scope}`}>{letters.length} surat, {scope}</span>
        <div className="ledger-register-tools">
          <CustomSelect
            aria-label="Urutkan surat tugas"
            className="ledger-select surat-sort"
            value={sortValue}
            onValueChange={(value) => {
              const [id, direction] = value.split(":");
              setSorting([{ id, desc: direction === "desc" }]);
            }}
          >
            <SelectOption value="dates:desc">Tanggal terbaru</SelectOption>
            <SelectOption value="dates:asc">Tanggal terlama</SelectOption>
            <SelectOption value="reference:asc">Nomor surat A–Z</SelectOption>
            <SelectOption value="reference:desc">Nomor surat Z–A</SelectOption>
            <SelectOption value="total:desc">Realisasi terbesar</SelectOption>
            <SelectOption value="total:asc">Realisasi terkecil</SelectOption>
            <SelectOption value="people:desc">Pegawai terbanyak</SelectOption>
            <SelectOption value="people:asc">Pegawai tersedikit</SelectOption>
          </CustomSelect>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ledger-tool ledger-desktop"><Columns3 /> Kolom</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Tampilkan kolom</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => column.toggleVisibility(checked)}
                >
                  {columnLabels[column.id]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ledger-tool ledger-desktop" aria-label="Kepadatan tabel"><Rows3 /><span>Tampilan</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Kepadatan tabel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                <DropdownMenuRadioItem value="comfortable">Nyaman</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">Ringkas</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {letters.length ? (
        <>
          <div className="ledger-table-wrap">
            <Table className="ledger-table surat-table" style={{ minWidth: table.getTotalSize() }} aria-label="Daftar surat tugas">
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        data-column={header.column.id}
                        aria-sort={header.column.getCanSort()
                          ? header.column.getIsSorted() === "asc" ? "ascending"
                            : header.column.getIsSorted() === "desc" ? "descending" : "none"
                          : undefined}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button type="button"
                            className="ledger-sort"
                            onClick={header.column.getToggleSortingHandler()}
                            aria-label={`Urutkan ${columnLabels[header.column.id]}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === "asc" ? <ArrowUp size={13} />
                              : header.column.getIsSorted() === "desc" ? <ArrowDown size={13} />
                                : <ChevronsUpDown size={13} />}
                          </button>
                        ) : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    {/* Klik di mana saja pada baris membuka surat; papan ketik memakai tombol nomor dan panah di baris yang sama. */}
                    <TableRow
                      className="surat-row"
                      data-expanded={row.getIsExpanded()}
                      onClick={(event) => {
                        if (!(event.target as HTMLElement).closest("button, a")) row.toggleExpanded();
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} data-column={cell.column.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {row.getIsExpanded() && (
                      <TableRow className="ledger-detail-row">
                        <TableCell colSpan={row.getVisibleCells().length}>
                          <div id={`surat-detail-${encodeURIComponent(row.id)}`}>
                            <LetterSheet letter={row.original} onOpen={onOpen} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="ledger-mobile">
            {rows.map((row) => (
              <article className="ledger-card" key={row.id} data-expanded={row.getIsExpanded()}>
                <div className="ledger-card-top">
                  <button type="button"
                    className="ledger-ref"
                    onClick={() => row.toggleExpanded()}
                    aria-expanded={row.getIsExpanded()}
                    aria-controls={`surat-mobile-${encodeURIComponent(row.id)}`}
                  >
                    {row.original.number}
                  </button>
                </div>
                <p className="ledger-title">{row.original.titles[0]}</p>
                <div className="ledger-place">
                  <MapPin size={13} aria-hidden="true" />
                  <span>{row.original.destinations.join(", ")}</span>
                </div>
                <div className="ledger-card-meta">
                  <span>{dateRange(row.original.startDate, row.original.endDate)}</span>
                  <span>{row.original.peopleCount} pegawai, {row.original.trips.length} rekap</span>
                </div>
                <div className="ledger-card-bottom">
                  <LetterAmount letter={row.original} />
                  <Button
                    variant="outline"
                    size="sm"
                    aria-expanded={row.getIsExpanded()}
                    aria-controls={`surat-mobile-${encodeURIComponent(row.id)}`}
                    onClick={() => row.toggleExpanded()}
                  >
                    {row.getIsExpanded() ? "Tutup surat" : "Lihat surat"}
                    <ChevronDown className={row.getIsExpanded() ? "rotate-180" : undefined} />
                  </Button>
                </div>
                {row.getIsExpanded() && (
                  <div className="ledger-card-detail" id={`surat-mobile-${encodeURIComponent(row.id)}`}>
                    <LetterSheet letter={row.original} onOpen={onOpen} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      ) : (
        <Empty
          icon={<FileText />}
          heading={hasAny ? "Surat tugas tidak ditemukan" : "Belum ada surat tugas"}
          description={hasAny
            ? "Coba nomor surat, nama pegawai, atau pilih bulan dan tahun lain."
            : "Nomor ST yang diisi pada arsip perjalanan akan tersusun di sini beserta pegawai dan biayanya."}
          action={hasAny && filtered ? <Button variant="outline" onClick={onReset}>Bersihkan filter</Button> : undefined}
        />
      )}
      <div className="ledger-pagination">
        <p role="status">
          Menampilkan <strong>{letters.length ? pageIndex * pageSize + 1 : 0}–{Math.min((pageIndex + 1) * pageSize, letters.length)}</strong> dari <strong>{letters.length}</strong> surat tugas
        </p>
        <div className="ledger-page-size">
          <label htmlFor="surat-page-size">Baris per halaman</label>
          <CustomSelect id="surat-page-size" value={String(pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
            {[10, 25, 50].map((size) => <SelectOption key={size} value={String(size)}>{size}</SelectOption>)}
          </CustomSelect>
        </div>
        <nav aria-label="Halaman daftar surat tugas">
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

function LetterPeople({ letter }: { letter: TaskLetter }) {
  const names = peopleOf(letter);
  const rest = names.length - 1;
  return (
    <div className="ledger-people">
      <strong>{letter.peopleCount} pegawai</strong>
      {names[0] && (
        <span>{names[0]}{rest > 0 ? ` dan ${rest} lainnya` : ""}</span>
      )}
    </div>
  );
}

function LetterAmount({ letter }: { letter: TaskLetter }) {
  return (
    <div className="ledger-amount">
      {letter.total === null ? <span className="is-unknown">Belum dicatat</span> : money(letter.total)}
      {letter.unknownCount > 0 && (
        <small>{letter.total !== null ? "Sementara, " : ""}{letter.unknownCount} rekap belum bernominal</small>
      )}
    </div>
  );
}

/*
  Rincian dibaca seperti surat tugas aslinya: kop, nomor, "Menugaskan kepada", "Untuk".
  Satu baris per pegawai; biaya dan tombol arsip membentang di seluruh pegawai satu rekap,
  sehingga rekap gabungan tetap terhitung satu kali. Kop hanya memuat data yang disimpan
  aplikasi, jadi tanpa alamat kantor dan tanpa blok tanda tangan.
*/
function LetterSheet({ letter, onOpen }: { letter: TaskLetter; onOpen: (id: string) => void }) {
  const known = letter.trips.length - letter.unknownCount;
  const showTitles = letter.titles.length > 1;
  const showPlaces = letter.destinations.length > 1;
  let order = 0;
  return (
    <article className="surat-letter" aria-label={`Surat tugas ${letter.number}`}>
      <header className="surat-kop">
        <img src="/logo-jambi.svg" alt="" width={100} height={104} />
        <div>
          <p>Pemerintah Provinsi Jambi</p>
          <p>Dinas Energi dan Sumber Daya Mineral</p>
          <small>Salinan arsip perjalanan dinas</small>
        </div>
      </header>
      <div className="surat-letter-title">
        <h3>Surat Tugas</h3>
        <p>Nomor : {letter.number}</p>
      </div>
      <p>Menugaskan kepada :</p>
      <div className="surat-assignees-wrap">
        <table className="surat-assignees">
          <thead>
            <tr>
              <th scope="col">No</th>
              <th scope="col">Nama / NIP</th>
              <th scope="col">Jabatan</th>
              <th scope="col">Realisasi</th>
              <th scope="col"><span className="sr-only">Arsip</span></th>
            </tr>
          </thead>
          <tbody>
            {letter.trips.map((trip) => trip.participants.map((person, index) => {
              order++;
              const span = trip.participants.length;
              return (
                <tr key={`${trip.id}-${person.id}`} data-first={index === 0 || undefined}>
                  <td>{order}.</td>
                  <td>
                    <strong>{person.name}</strong>
                    <small>{person.nip.trim() ? `NIP ${person.nip}` : "NIP belum diisi"}</small>
                  </td>
                  <td>{person.position.trim() || "–"}</td>
                  {index === 0 && (
                    <td rowSpan={span} className="surat-assignee-cost">
                      <strong>{money(totalCost(trip))}</strong>
                      <small>{trip.sppdNo ? `SPPD ${trip.sppdNo}` : "SPPD belum dicatat"}</small>
                      {span > 1 && <small>Rekap gabungan {span} pegawai</small>}
                      {showTitles && <small>{trip.title}</small>}
                      {showPlaces && <small>{trip.destination}, {dateRange(trip.startDate, trip.endDate)}</small>}
                    </td>
                  )}
                  {index === 0 && (
                    <td rowSpan={span} className="surat-assignee-open">
                      <button type="button" onClick={() => onOpen(trip.id)} aria-label={`Buka arsip ${trip.code}`}>
                        Buka arsip
                      </button>
                    </td>
                  )}
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <dl className="surat-clauses">
        <div>
          <dt>Untuk</dt>
          <dd>{showTitles ? <ol>{letter.titles.map((title) => <li key={title}>{title}</li>)}</ol> : letter.titles[0]}</dd>
        </div>
        <div><dt>Tujuan</dt><dd>{letter.destinations.join(", ")}</dd></div>
        <div>
          <dt>Waktu</dt>
          <dd>{letterPeriod(letter.startDate, letter.endDate)} ({dayCount(letter.startDate, letter.endDate)})</dd>
        </div>
      </dl>
      <footer className="surat-letter-close">
        <span className="surat-stamp" data-state={letter.unknownCount ? "pending" : "complete"} aria-hidden="true">
          {letter.unknownCount ? "Sementara" : "Lengkap"}
          <small>{known}/{letter.trips.length} rekap</small>
        </span>
        <div>
          <span>Realisasi biaya surat tugas,</span>
          <strong>{money(letter.total)}</strong>
          <small className={letter.unknownCount ? "is-warning" : undefined}>
            {letter.unknownCount
              ? `${letter.unknownCount} dari ${letter.trips.length} rekap belum bernominal`
              : `${letter.trips.length} rekap, seluruhnya bernominal`}
          </small>
        </div>
      </footer>
    </article>
  );
}

function Roster({ trips, onOpen, showTitles }: { trips: Trip[]; onOpen: (id: string) => void; showTitles: boolean }) {
  return (
    <>
      {trips.map((trip) => (
        <div className="ledger-member surat-member" key={trip.id}>
          <div className="ledger-member-who">
            <ul className="surat-names">
              {trip.participants.map((person) => (
                <li key={person.id}>
                  <strong>{person.name}</strong>
                  <span>{person.nip.trim() ? `NIP ${person.nip}` : "NIP belum diisi"}{person.position.trim() ? `, ${person.position}` : ""}</span>
                </li>
              ))}
            </ul>
            {showTitles && <span className="surat-member-title">{trip.title}</span>}
            <span className="surat-member-trip">
              {trip.destination}, {dateRange(trip.startDate, trip.endDate)}
            </span>
            <span className="surat-member-code">
              {trip.code}, {trip.department}{trip.participants.length > 1 ? ", rekap gabungan dihitung satu kali" : ""}
            </span>
          </div>
          <div className="ledger-member-cost">
            <strong>{money(totalCost(trip))}</strong>
            <small>{trip.sppdNo ? `SPPD ${trip.sppdNo}` : "SPPD belum dicatat"}</small>
          </div>
          <Button variant="outline" size="sm" className="ledger-tool surat-open" onClick={() => onOpen(trip.id)} aria-label={`Buka arsip ${trip.code}`}>
            Buka arsip
          </Button>
        </div>
      ))}
    </>
  );
}

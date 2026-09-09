"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
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
  ChevronsUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Rows3,
  MapPin,
} from "lucide-react";
import type { ArchiveGroup } from "@/lib/archive-groups";
import { dateText, isComplete, money, totalCost, type Trip } from "@/lib/model";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/table";
import { CustomSelect, SelectOption } from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";

const columnLabels: Record<string, string> = {
  reference: "Surat Tugas dan perjalanan",
  dates: "Pelaksanaan",
  people: "Pegawai",
  total: "Realisasi",
  status: "Kelengkapan",
};
const reference = (group: ArchiveGroup) => group.number || group.trips[0].code;

const days = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;

/** "12 Mar – 14 Mar 2024" when both dates share a year; full dates otherwise. */
function dateRange(start: string, end: string) {
  if (start === end) return dateText(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const first = sameYear ? dateText(start, { day: "numeric", month: "short" }) : dateText(start);
  return `${first} – ${dateText(end)}`;
}

export default function ArchiveGroups({
  groups,
  selected,
  onSelectionChange,
  renderActions,
  emptyState,
  status,
  tools,
  filters,
}: {
  groups: ArchiveGroup[];
  selected: Set<string>;
  onSelectionChange: Dispatch<SetStateAction<Set<string>>>;
  renderActions: (trip: Trip) => ReactNode;
  emptyState: ReactNode;
  /** Completeness switch, rendered beside the register title. */
  status?: ReactNode;
  /** Register-level actions such as export. */
  tools?: ReactNode;
  /** Search and filter controls, rendered in the filter row. */
  filters?: ReactNode;
}) {
  const registerRef = useRef<HTMLDivElement>(null);
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "dates", desc: true },
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState("comfortable");
  const rowSelection = useMemo(
    () => Object.fromEntries([...selected].map((key) => [key, true])),
    [selected],
  );
  const columns = useMemo<ColumnDef<ArchiveGroup>[]>(
    () => [
      {
        id: "select",
        size: 48,
        enableHiding: false,
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Pilih semua pada halaman ini"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked === true)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Pilih ${reference(row.original)}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          />
        ),
      },
      {
        id: "reference",
        size: 320,
        accessorFn: reference,
        header: columnLabels.reference,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="ledger-identity">
            <button
              className="ledger-ref"
              onClick={() => row.toggleExpanded()}
              aria-expanded={row.getIsExpanded()}
              aria-controls={`detail-${encodeURIComponent(row.id)}`}
            >
              {reference(row.original)}
            </button>
            <p className="ledger-title">{row.original.titles[0]}</p>
            <div className="ledger-place">
              <MapPin size={13} aria-hidden="true" />
              <span>{row.original.destinations.join(", ")}</span>
            </div>
          </div>
        ),
      },
      {
        id: "dates",
        size: 170,
        sortDescFirst: true,
        accessorFn: (group) => group.startDate,
        header: columnLabels.dates,
        cell: ({ row: { original: group } }) => (
          <div className="ledger-dates">
            <time dateTime={group.startDate}>{dateRange(group.startDate, group.endDate)}</time>
            <span>{days(group.startDate, group.endDate)} hari</span>
          </div>
        ),
      },
      {
        id: "people",
        size: 170,
        accessorFn: (group) => group.participants.length,
        header: columnLabels.people,
        cell: ({ row }) => (
          <button
            className="ledger-people"
            onClick={() => row.toggleExpanded()}
            aria-expanded={row.getIsExpanded()}
            aria-controls={`detail-${encodeURIComponent(row.id)}`}
          >
            <strong>{row.original.participants.length} pegawai</strong>
            <span>{row.original.participants[0]?.name || "Belum dicatat"}</span>
            {row.original.participants.length > 1 && (
              <small>dan {row.original.participants.length - 1} lainnya</small>
            )}
          </button>
        ),
      },
      {
        id: "total",
        size: 160,
        accessorFn: (group) => group.total ?? undefined,
        header: columnLabels.total,
        sortUndefined: "last",
        cell: ({ row }) => <GroupAmount group={row.original} />,
      },
      {
        id: "status",
        size: 132,
        accessorFn: (group) => (group.complete ? 1 : 0),
        header: columnLabels.status,
        cell: ({ row }) => <GroupStatus group={row.original} />,
      },
      {
        id: "actions",
        size: 56,
        header: "",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ledger-expand"
            aria-label={`${row.getIsExpanded() ? "Tutup" : "Buka"} rincian ${reference(row.original)}`}
            aria-expanded={row.getIsExpanded()}
            aria-controls={`detail-${encodeURIComponent(row.id)}`}
            onClick={() => row.toggleExpanded()}
          >
            <ChevronDown />
          </Button>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: groups,
    columns,
    getRowId: (group) => group.key,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { sorting, expanded, rowSelection, columnVisibility },
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    getRowCanExpand: () => true,
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) =>
      onSelectionChange((previous) => {
        const current = Object.fromEntries(
          [...previous].map((key) => [key, true]),
        );
        const next = typeof updater === "function" ? updater(current) : updater;
        return new Set(Object.keys(next).filter((key) => next[key]));
      }),
    enableMultiSort: false,
    enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const rows = table.getRowModel().rows;
  const sort = sorting[0];
  const sortValue = sort
    ? `${sort.id}:${sort.desc ? "desc" : "asc"}`
    : "dates:desc";

  useEffect(() => {
    registerRef.current
      ?.querySelector('[data-slot="table-container"]')
      ?.scrollTo({ top: 0 });
  }, [pageIndex, pageSize, sorting, groups]);
  useEffect(() => {
    const container = registerRef.current?.querySelector(
      '[data-slot="table-container"]',
    );
    if (!container) {
      setHasHorizontalScroll(false);
      return;
    }
    const measure = () =>
      setHasHorizontalScroll(container.scrollWidth > container.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [groups.length, columnVisibility]);
  const goToPage = (next: number) => {
    table.setPageIndex(next);
    if (window.matchMedia("(max-width: 760px)").matches) {
      registerRef.current?.scrollIntoView({ block: "start" });
    }
  };
  const selectAllPage = (
    <Checkbox
      aria-label="Pilih semua pada halaman ini"
      checked={
        table.getIsAllPageRowsSelected() ||
        (table.getIsSomePageRowsSelected() && "indeterminate")
      }
      onCheckedChange={(checked) =>
        table.toggleAllPageRowsSelected(checked === true)
      }
    />
  );

  return (
    <div className="ledger-register" data-density={density} ref={registerRef}>
      <div className="ledger-register-head">
        <div className="ledger-register-title">
          <h2>Register perjalanan</h2>
          <span>{groups.length} perjalanan</span>
        </div>
        {status}
        <div className="ledger-register-tools">
          {tools}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ledger-tool ledger-desktop">
                <Columns3 /> Kolom
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Tampilkan kolom</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) =>
                      column.toggleVisibility(checked)
                    }
                  >
                    {columnLabels[column.id]}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="ledger-tool ledger-desktop"
                aria-label="Kepadatan tabel"
              >
                <Rows3 />
                <span>Tampilan</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Kepadatan tabel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={density}
                onValueChange={setDensity}
              >
                <DropdownMenuRadioItem value="comfortable">
                  Nyaman
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">
                  Ringkas
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="ledger-filters">
        {filters}
        <div className="ledger-filters-end">
          <CustomSelect
            aria-label="Urutkan perjalanan"
            className="ledger-select ledger-sort-select"
            value={sortValue}
            onValueChange={(value) => {
              const [id, direction] = value.split(":");
              table.setSorting([{ id, desc: direction === "desc" }]);
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
            <SelectOption value="status:asc">Draft lebih dulu</SelectOption>
            <SelectOption value="status:desc">Lengkap lebih dulu</SelectOption>
          </CustomSelect>
          {hasHorizontalScroll && (
            <span className="ledger-scroll-hint">Geser tabel untuk kolom lainnya</span>
          )}
        </div>
      </div>
      {groups.length ? (
        <>
          <div className="ledger-table-wrap">
            <Table
              className="ledger-table"
              style={{ minWidth: table.getTotalSize() }}
              aria-label="Daftar arsip perjalanan"
            >
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        data-column={header.column.id}
                        aria-sort={
                          header.column.getCanSort()
                            ? header.column.getIsSorted() === "asc"
                              ? "ascending"
                              : header.column.getIsSorted() === "desc"
                                ? "descending"
                                : "none"
                            : undefined
                        }
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            className="ledger-sort"
                            onClick={header.column.getToggleSortingHandler()}
                            aria-label={`Urutkan ${columnLabels[header.column.id]}`}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp size={13} />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown size={13} />
                            ) : (
                              <ChevronsUpDown size={13} />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      data-expanded={row.getIsExpanded()}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} data-column={cell.column.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {row.getIsExpanded() && (
                      <TableRow className="ledger-detail-row">
                        <TableCell colSpan={row.getVisibleCells().length}>
                          <div id={`detail-${encodeURIComponent(row.id)}`}>
                            <GroupDetails
                              group={row.original}
                              renderActions={renderActions}
                            />
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
            <label className="ledger-mobile-all">
              {selectAllPage}
              Pilih semua di halaman ini
            </label>
            {rows.map((row) => (
              <article
                className="ledger-card"
                key={row.id}
                data-selected={row.getIsSelected()}
                data-expanded={row.getIsExpanded()}
              >
                <div className="ledger-card-top">
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(checked) =>
                      row.toggleSelected(checked === true)
                    }
                    aria-label={`Pilih ${reference(row.original)}`}
                  />
                  <button
                    className="ledger-ref"
                    onClick={() => row.toggleExpanded()}
                    aria-expanded={row.getIsExpanded()}
                    aria-controls={`mobile-detail-${encodeURIComponent(row.id)}`}
                  >
                    {reference(row.original)}
                  </button>
                  <GroupStatus group={row.original} compact />
                </div>
                <p className="ledger-title">{row.original.titles[0]}</p>
                <div className="ledger-place">
                  <MapPin size={13} aria-hidden="true" />
                  <span>{row.original.destinations.join(", ")}</span>
                </div>
                <div className="ledger-card-meta">
                  <span>{dateRange(row.original.startDate, row.original.endDate)}</span>
                  <span>{row.original.participants.length} pegawai</span>
                </div>
                <div className="ledger-card-bottom">
                  <GroupAmount group={row.original} />
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`${row.getIsExpanded() ? "Tutup" : "Buka"} rincian ${reference(row.original)}`}
                    aria-expanded={row.getIsExpanded()}
                    aria-controls={`mobile-detail-${encodeURIComponent(row.id)}`}
                    onClick={() => row.toggleExpanded()}
                  >
                    {row.getIsExpanded() ? "Tutup rincian" : "Lihat rincian"}
                    <ChevronDown
                      className={row.getIsExpanded() ? "rotate-180" : undefined}
                    />
                  </Button>
                </div>
                {row.getIsExpanded() && (
                  <div
                    className="ledger-card-detail"
                    id={`mobile-detail-${encodeURIComponent(row.id)}`}
                  >
                    <GroupDetails
                      group={row.original}
                      renderActions={renderActions}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      ) : (
        emptyState
      )}
      <div className="ledger-pagination">
        <p role="status">
          Menampilkan{" "}
          <strong>
            {groups.length ? pageIndex * pageSize + 1 : 0}–
            {Math.min((pageIndex + 1) * pageSize, groups.length)}
          </strong>{" "}
          dari <strong>{groups.length}</strong> perjalanan
        </p>
        <div className="ledger-page-size">
          <label htmlFor="archive-page-size">Baris per halaman</label>
          <CustomSelect
            id="archive-page-size"
            value={String(pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            {[10, 25, 50].map((size) => (
              <SelectOption key={size} value={String(size)}>
                {size}
              </SelectOption>
            ))}
          </CustomSelect>
        </div>
        <nav aria-label="Halaman daftar arsip">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Halaman pertama"
            disabled={!table.getCanPreviousPage()}
            onClick={() => goToPage(0)}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Halaman sebelumnya"
            disabled={!table.getCanPreviousPage()}
            onClick={() => goToPage(pageIndex - 1)}
          >
            <ChevronLeft />
          </Button>
          <span>
            <strong>{pageIndex + 1}</strong> / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Halaman berikutnya"
            disabled={!table.getCanNextPage()}
            onClick={() => goToPage(pageIndex + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Halaman terakhir"
            disabled={!table.getCanNextPage()}
            onClick={() => goToPage(pageCount - 1)}
          >
            <ChevronsRight />
          </Button>
        </nav>
      </div>
    </div>
  );
}

function GroupAmount({ group }: { group: ArchiveGroup }) {
  return (
    <div className="ledger-amount">
      {group.total === null ? (
        <span className="is-unknown">Belum dicatat</span>
      ) : (
        money(group.total)
      )}
      {group.unknownCount > 0 && (
        <small>
          {group.total !== null ? "Sementara, " : ""}
          {group.unknownCount} rekap belum bernominal
        </small>
      )}
    </div>
  );
}

function GroupStatus({
  group,
  compact = false,
}: {
  group: ArchiveGroup;
  compact?: boolean;
}) {
  return (
    <div>
      <span className={`ledger-state ${group.complete ? "complete" : ""}`}>
        {group.complete ? "Lengkap" : "Draft"}
      </span>
      {!compact && (
        <small className="ledger-state-note">
          {group.completeCount} dari {group.trips.length} rekap lengkap
        </small>
      )}
    </div>
  );
}

function GroupDetails({
  group,
  renderActions,
}: {
  group: ArchiveGroup;
  renderActions: (trip: Trip) => ReactNode;
}) {
  return (
    <section
      className="ledger-detail"
      aria-label={`Rekap ${group.number || group.trips[0].code}`}
    >
      <div className="ledger-detail-purpose">
        <span>Uraian perjalanan</span>
        {group.titles.map((title, index) => (
          <p key={index}>{title}</p>
        ))}
      </div>
      <div className="ledger-members">
        <div className="ledger-members-head">
          <strong>Rekap per pegawai</strong>
          <span>
            {group.trips.length} rekap, {group.participants.length} pegawai
          </span>
        </div>
        {group.trips.map((trip) => (
          <div className="ledger-member" key={trip.id}>
            <div className="ledger-member-who">
              <strong>
                {trip.participants.map((person) => person.name).join(", ")}
              </strong>
              <span>SPPD {trip.sppdNo || "belum dicatat"}</span>
              <span>
                {trip.code}, {trip.department}
              </span>
              {group.titles.length > 1 && <span>{trip.title}</span>}
              <span>
                {trip.destination}, {dateRange(trip.startDate, trip.endDate)}
              </span>
              {trip.participants.length > 1 && (
                <span>Arsip gabungan, biaya dihitung satu kali</span>
              )}
            </div>
            <div className="ledger-member-cost">
              <strong>{money(totalCost(trip))}</strong>
              <span className={`ledger-state ${isComplete(trip) ? "complete" : ""}`}>
                {isComplete(trip) ? "Lengkap" : "Draft"}
              </span>
              <small>
                {trip.documents.length
                  ? `${trip.documents.length} lampiran`
                  : "Belum ada lampiran"}
              </small>
            </div>
            {renderActions(trip)}
          </div>
        ))}
        <div className="ledger-members-total">
          <span>
            {group.unknownCount ? "Total sementara" : "Total realisasi"}
          </span>
          <strong>{money(group.total)}</strong>
        </div>
      </div>
    </section>
  );
}

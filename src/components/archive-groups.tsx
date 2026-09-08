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
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Rows3,
  MapPin,
  FileText,
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
  reference: "Surat Tugas & perjalanan",
  dates: "Pelaksanaan",
  people: "Pegawai",
  total: "Realisasi",
  status: "Kelengkapan",
};
const reference = (group: ArchiveGroup) => group.number || group.trips[0].code;

export default function ArchiveGroups({
  groups,
  selected,
  onSelectionChange,
  renderActions,
  emptyState,
}: {
  groups: ArchiveGroup[];
  selected: Set<string>;
  onSelectionChange: Dispatch<SetStateAction<Set<string>>>;
  renderActions: (trip: Trip) => ReactNode;
  emptyState: ReactNode;
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
        size: 46,
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
          <div className="register-identity">
            <button
              className="register-reference"
              onClick={() => row.toggleExpanded()}
              aria-expanded={row.getIsExpanded()}
              aria-controls={`detail-${encodeURIComponent(row.id)}`}
            >
              {reference(row.original)}
            </button>
            <p className="register-description">{row.original.titles[0]}</p>
            <div className="register-destination">
              <MapPin size={13} aria-hidden="true" />
              <span>{row.original.destinations.join(", ")}</span>
            </div>
          </div>
        ),
      },
      {
        id: "dates",
        size: 145,
        sortDescFirst: true,
        accessorFn: (group) => group.startDate,
        header: columnLabels.dates,
        cell: ({ row: { original: group } }) => (
          <div className="register-dates">
            <time dateTime={group.startDate}>{dateText(group.startDate)}</time>
            {group.endDate !== group.startDate && (
              <span>
                s.d.{" "}
                <time dateTime={group.endDate}>{dateText(group.endDate)}</time>
              </span>
            )}
            {group.endDate === group.startDate && <span>1 hari</span>}
          </div>
        ),
      },
      {
        id: "people",
        size: 158,
        accessorFn: (group) => group.participants.length,
        header: columnLabels.people,
        cell: ({ row }) => (
          <button
            className="register-people"
            onClick={() => row.toggleExpanded()}
            aria-expanded={row.getIsExpanded()}
            aria-controls={`detail-${encodeURIComponent(row.id)}`}
          >
            <strong>{row.original.participants.length} pegawai</strong>
            <span>{row.original.participants[0]?.name || "Belum dicatat"}</span>
            {row.original.participants.length > 1 && (
              <small>
                +{row.original.participants.length - 1} pegawai lainnya
              </small>
            )}
          </button>
        ),
      },
      {
        id: "total",
        size: 148,
        accessorFn: (group) => group.total ?? undefined,
        header: columnLabels.total,
        sortUndefined: "last",
        cell: ({ row }) => (
          <div className="register-amount">
            <GroupAmount group={row.original} />
          </div>
        ),
      },
      {
        id: "status",
        size: 116,
        accessorFn: (group) => (group.complete ? 1 : 0),
        header: columnLabels.status,
        cell: ({ row }) => (
          <div className="register-status">
            <GroupStatus group={row.original} />
          </div>
        ),
      },
      {
        id: "actions",
        size: 63,
        header: "Rincian",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${row.getIsExpanded() ? "Tutup" : "Buka"} rincian ${reference(row.original)}`}
            aria-expanded={row.getIsExpanded()}
            aria-controls={`detail-${encodeURIComponent(row.id)}`}
            onClick={() => row.toggleExpanded()}
          >
            <ChevronDown
              className={row.getIsExpanded() ? "rotate-180" : undefined}
            />
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

  return (
    <div className="archive-register" data-density={density} ref={registerRef}>
      <div className="register-view-toolbar">
        <div className="register-result-caption">
          <FileText size={15} aria-hidden="true" />
          <span>
            <strong>{groups.length}</strong> perjalanan ditemukan
          </span>
          {hasHorizontalScroll && <span className="register-scroll-hint">Geser untuk kolom lainnya →</span>}
        </div>
        <div className="register-view-actions">
          <CustomSelect
            aria-label="Urutkan perjalanan"
            className="register-sort-select"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="register-desktop-control"
              >
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
                className="register-desktop-control"
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
      {groups.length ? (
        <>
          <div className="register-desktop-table">
            <Table
              className="register-table"
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
                            className="register-sort-button"
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
                      <TableRow className="register-detail-row">
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
          <div className="register-mobile-list">
            <label className="register-mobile-select-all">
              <Checkbox
                checked={
                  table.getIsAllPageRowsSelected() ||
                  (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(checked) =>
                  table.toggleAllPageRowsSelected(checked === true)
                }
              />
              Pilih halaman ini
            </label>
            {rows.map((row) => (
              <article
                className="register-mobile-item"
                key={row.id}
                data-selected={row.getIsSelected()}
              >
                <div className="register-mobile-top">
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(checked) =>
                      row.toggleSelected(checked === true)
                    }
                    aria-label={`Pilih ${reference(row.original)}`}
                  />
                  <strong>{reference(row.original)}</strong>
                  <GroupStatus group={row.original} compact />
                </div>
                <p className="register-description">{row.original.titles[0]}</p>
                <div className="register-destination">
                  <MapPin size={13} />
                  <span>{row.original.destinations.join(", ")}</span>
                </div>
                <div className="register-mobile-meta">
                  <span>
                    {dateText(row.original.startDate)}
                    {row.original.endDate !== row.original.startDate &&
                      ` – ${dateText(row.original.endDate)}`}
                  </span>
                  <span>{row.original.participants.length} pegawai</span>
                </div>
                <div className="register-mobile-bottom">
                  <div className="register-amount">
                    <GroupAmount group={row.original} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`${row.getIsExpanded() ? "Tutup" : "Buka"} rincian ${reference(row.original)}`}
                    aria-expanded={row.getIsExpanded()}
                    aria-controls={`mobile-detail-${encodeURIComponent(row.id)}`}
                    onClick={() => row.toggleExpanded()}
                  >
                    {row.getIsExpanded() ? "Tutup" : "Rincian"}
                    <ChevronDown
                      className={row.getIsExpanded() ? "rotate-180" : undefined}
                    />
                  </Button>
                </div>
                {row.getIsExpanded() && (
                  <div
                    className="register-mobile-detail"
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
      <div className="register-pagination">
        <p role="status">
          Menampilkan{" "}
          <strong>
            {groups.length ? pageIndex * pageSize + 1 : 0}–
            {Math.min((pageIndex + 1) * pageSize, groups.length)}
          </strong>{" "}
          dari <strong>{groups.length}</strong> perjalanan
        </p>
        <div className="register-page-size">
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
    <>
      {group.total === null ? (
        <span className="unknown-cost">Belum dicatat</span>
      ) : (
        money(group.total)
      )}
      {group.unknownCount > 0 && (
        <small className="archive-group-cost-note">
          {group.total !== null ? "Total sementara · " : ""}
          {group.unknownCount} rekap belum diisi
        </small>
      )}
    </>
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
    <>
      <span
        className={`status-badge ${group.complete ? "complete" : "incomplete"}`}
      >
        {group.complete ? <Check size={12} /> : <span className="status-dot" />}
        {group.complete ? "Lengkap" : "Draft"}
      </span>
      {!compact && (
        <small className="document-count">
          {group.completeCount}/{group.trips.length} rekap lengkap
        </small>
      )}
    </>
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
      className="archive-group-details"
      aria-label={`Rekap ${group.number || group.trips[0].code}`}
    >
      <div className="register-detail-purpose">
        <span>Uraian perjalanan</span>
        {group.titles.map((title, index) => (
          <p key={index}>{title}</p>
        ))}
      </div>
      <div className="archive-group-detail-heading">
        <strong>Rincian pegawai</strong>
        <span>
          {group.trips.length} rekap · {group.participants.length} pegawai
        </span>
      </div>
      <div className="archive-group-members">
        {group.trips.map((trip) => (
          <div className="archive-group-member" key={trip.id}>
            <div>
              <strong>
                {trip.participants.map((person) => person.name).join(", ")}
              </strong>
              <small>SPPD: {trip.sppdNo || "—"}</small>
              <small>
                {trip.code} · {trip.department}
              </small>
              {group.titles.length > 1 && <small>{trip.title}</small>}
              <small>
                {trip.destination} · {dateText(trip.startDate)} –{" "}
                {dateText(trip.endDate)}
              </small>
              {trip.participants.length > 1 && (
                <small>Arsip gabungan · biaya dihitung satu kali</small>
              )}
            </div>
            <div className="archive-group-member-cost">
              <strong>{money(totalCost(trip))}</strong>
              <span
                className={`status-badge ${isComplete(trip) ? "complete" : "incomplete"}`}
              >
                {isComplete(trip) ? "Lengkap" : "Draft"}
              </span>
              <small>
                {trip.documents.length
                  ? `${trip.documents.length} lampiran`
                  : "Dokumen opsional"}
              </small>
            </div>
            {renderActions(trip)}
          </div>
        ))}
      </div>
      <div className="archive-group-detail-total">
        <span>
          {group.unknownCount ? "Total sementara" : "Total realisasi"}
        </span>
        <strong>{money(group.total)}</strong>
      </div>
    </section>
  );
}

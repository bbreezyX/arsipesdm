"use client";

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ExpandedState, type Row, type SortingState, type VisibilityState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Rows3 } from "lucide-react";
import { Button } from "./ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import { CustomSelect, SelectOption } from "./ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "./ui/dropdown-menu";

export type RegisterSort = { id: string; asc: string; desc: string };

/** Shared register controls and row models; domain filtering stays with each page. */
export default function DataRegister<T>({ data, columns, getRowId, label, unit, initialSorting, sortOptions,
  emptyState, renderMobile, renderExpanded, className = "" }: {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (item: T) => string;
  label: string;
  unit: string;
  initialSorting: SortingState;
  sortOptions: RegisterSort[];
  emptyState: ReactNode;
  renderMobile: (row: Row<T>) => ReactNode;
  renderExpanded?: (row: Row<T>, mobile: boolean) => ReactNode;
  className?: string;
}) {
  const pageSizeId = useId();
  const register = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState(initialSorting);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState("comfortable");
  const table = useReactTable({
    data, columns, getRowId,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    state: { sorting, expanded, columnVisibility },
    onSortingChange: setSorting, onExpandedChange: setExpanded, onColumnVisibilityChange: setColumnVisibility,
    getRowCanExpand: () => Boolean(renderExpanded), enableMultiSort: false, enableSortingRemoval: false,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const rows = table.getRowModel().rows;
  const sorted = sorting[0];
  useEffect(() => {
    register.current?.querySelector('[data-slot="table-container"]')?.scrollTo({ top: 0 });
  }, [pageIndex, pageSize, sorting, data]);
  function go(page: number) {
    table.setPageIndex(page);
    if (window.matchMedia("(max-width: 760px)").matches) register.current?.scrollIntoView({ block: "start" });
  }
  return <div className={`archive-register data-register ${className}`} data-density={density} ref={register}>
    <div className="register-view-toolbar">
      <p className="register-result-caption"><strong>{data.length}</strong> {unit} ditemukan</p>
      <div className="register-view-actions">
        <CustomSelect className="register-sort-select" aria-label={`Urutkan ${unit}`}
          value={sorted ? `${sorted.id}:${sorted.desc ? "desc" : "asc"}` : ""}
          onValueChange={value => { const [id, direction] = value.split(":"); setSorting([{ id, desc: direction === "desc" }]); }}>
          {sortOptions.flatMap(option => [
            <SelectOption key={`${option.id}:asc`} value={`${option.id}:asc`}>{option.asc}</SelectOption>,
            <SelectOption key={`${option.id}:desc`} value={`${option.id}:desc`}>{option.desc}</SelectOption>,
          ])}
        </CustomSelect>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="register-desktop-control"><Columns3 />Kolom</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuLabel>Tampilkan kolom</DropdownMenuLabel><DropdownMenuSeparator />
            {table.getAllLeafColumns().filter(column => column.getCanHide()).map(column =>
              <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onSelect={event => event.preventDefault()}
                onCheckedChange={checked => column.toggleVisibility(checked)}>{String(column.columnDef.header)}</DropdownMenuCheckboxItem>)}
          </DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="register-desktop-control" aria-label="Kepadatan tabel"><Rows3 />Tampilan</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuLabel>Kepadatan tabel</DropdownMenuLabel><DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
              <DropdownMenuRadioItem value="comfortable">Nyaman</DropdownMenuRadioItem><DropdownMenuRadioItem value="compact">Ringkas</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent></DropdownMenu>
      </div>
    </div>
    {data.length ? <>
      <div className="register-desktop-table"><Table className="register-table secondary-register-table" style={{ minWidth: table.getTotalSize() }} aria-label={label}>
        <TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>
          {group.headers.map(header => <TableHead key={header.id} data-column={header.column.id}
            aria-sort={header.column.getCanSort() ? header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none" : undefined}>
            {header.isPlaceholder ? null : header.column.getCanSort() ? <button type="button" className="register-sort-button"
              onClick={header.column.getToggleSortingHandler()} aria-label={`Urutkan ${String(header.column.columnDef.header)}`}>
              {flexRender(header.column.columnDef.header, header.getContext())}
              {header.column.getIsSorted() === "asc" ? <ArrowUp size={13} /> : header.column.getIsSorted() === "desc" ? <ArrowDown size={13} /> : <ChevronsUpDown size={13} />}
            </button> : flexRender(header.column.columnDef.header, header.getContext())}
          </TableHead>)}
        </TableRow>)}</TableHeader>
        <TableBody>{rows.map(row => <Fragment key={row.id}>
          <TableRow data-expanded={row.getIsExpanded()}>{row.getVisibleCells().map(cell => <TableCell key={cell.id} data-column={cell.column.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>)}</TableRow>
          {row.getIsExpanded() && renderExpanded && <TableRow className="register-detail-row"><TableCell colSpan={row.getVisibleCells().length}>{renderExpanded(row, false)}</TableCell></TableRow>}
        </Fragment>)}</TableBody>
      </Table></div>
      <div className="register-mobile-list" aria-label={label}>{rows.map(row => <article className="register-mobile-item" key={row.id}>
        {renderMobile(row)}
        {row.getIsExpanded() && renderExpanded && <div className="register-mobile-detail">{renderExpanded(row, true)}</div>}
      </article>)}</div>
    </> : emptyState}
    <div className="register-pagination">
      <p role="status">Menampilkan <strong>{data.length ? pageIndex * pageSize + 1 : 0}–{Math.min((pageIndex + 1) * pageSize, data.length)}</strong> dari <strong>{data.length}</strong> {unit}</p>
      <div className="register-page-size"><label htmlFor={pageSizeId}>Baris per halaman</label>
        <CustomSelect id={pageSizeId} value={String(pageSize)} onValueChange={value => table.setPageSize(Number(value))}>
          {[10, 25, 50].map(size => <SelectOption key={size} value={String(size)}>{size}</SelectOption>)}
        </CustomSelect>
      </div>
      <nav aria-label={`Halaman daftar ${unit}`}>
        <Button variant="outline" size="icon-sm" aria-label="Halaman pertama" disabled={!table.getCanPreviousPage()} onClick={() => go(0)}><ChevronsLeft /></Button>
        <Button variant="outline" size="icon-sm" aria-label="Halaman sebelumnya" disabled={!table.getCanPreviousPage()} onClick={() => go(pageIndex - 1)}><ChevronLeft /></Button>
        <span><strong>{pageIndex + 1}</strong> / {pageCount}</span>
        <Button variant="outline" size="icon-sm" aria-label="Halaman berikutnya" disabled={!table.getCanNextPage()} onClick={() => go(pageIndex + 1)}><ChevronRight /></Button>
        <Button variant="outline" size="icon-sm" aria-label="Halaman terakhir" disabled={!table.getCanNextPage()} onClick={() => go(pageCount - 1)}><ChevronsRight /></Button>
      </nav>
    </div>
  </div>;
}

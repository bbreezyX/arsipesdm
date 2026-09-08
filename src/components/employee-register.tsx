"use client";

import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, Users, X } from "lucide-react";
import { employeeMatches, type Employee } from "@/lib/employees";
import type { Trip } from "@/lib/model";
import DataRegister, { type RegisterSort } from "./data-register";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Empty } from "./fields";

type EmployeeRow = Employee & { tripCount: number };
const getRowId = (employee: EmployeeRow) => employee.id;
const sortOptions: RegisterSort[] = [
  { id: "name", asc: "Nama A–Z", desc: "Nama Z–A" },
  { id: "nip", asc: "NIP terkecil", desc: "NIP terbesar" },
  { id: "rank", asc: "Golongan terendah", desc: "Golongan tertinggi" },
  { id: "department", asc: "Bidang A–Z", desc: "Bidang Z–A" },
  { id: "trips", asc: "Perjalanan paling sedikit", desc: "Perjalanan paling banyak" },
];

export default function EmployeeRegister({ people, trips, query, onQueryChange, department, onDepartmentChange,
  showDeleted, onDeletedChange, busy, onCreate, onDetail, onEdit, onRemove, onRestore, error }: {
  people: Employee[]; trips: Trip[]; query: string; onQueryChange: (value: string) => void;
  department: string; onDepartmentChange: (value: string) => void;
  showDeleted: boolean; onDeletedChange: (value: boolean) => void; busy: boolean;
  onCreate: () => void; onDetail: (employee: Employee) => void; onEdit: (employee: Employee) => void;
  onRemove: (employee: Employee) => void; onRestore: (employee: Employee) => void; error?: ReactNode;
}) {
  const rows = useMemo(() => people.map(person => ({ ...person,
    tripCount: trips.filter(trip => !trip.deletedAt && trip.participants.some(participant => employeeMatches(person, participant))).length,
  })), [people, trips]);
  const activeCount = people.filter(person => !person.deletedAt).length;
  const departments = [...new Set(people.map(person => person.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id-ID"));
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id-ID");
    return rows.filter(person => Boolean(person.deletedAt) === showDeleted && (department === "all" || person.department === department)
      && [person.name, person.nip, person.position, person.department, person.rank].join(" ").toLocaleLowerCase("id-ID").includes(search));
  }, [rows, query, showDeleted, department]);
  function reset() { onQueryChange(""); onDepartmentChange("all"); }
  const columns = useMemo<ColumnDef<EmployeeRow>[]>(() => [
    { id: "name", accessorKey: "name", header: "Pegawai", size: 270, enableHiding: false,
      cell: ({ row }) => <div className="employee-register-identity"><button className="register-reference" onClick={() => onDetail(row.original)}>{row.original.name}</button><small className="register-cell-note">{row.original.position || "Jabatan belum dicatat"}</small></div> },
    { id: "nip", accessorFn: person => person.nip || undefined, header: "NIP", size: 175, sortUndefined: "last",
      cell: ({ row }) => <span className="employee-register-nip">{row.original.nip || "Belum dicatat"}</span> },
    { id: "rank", accessorFn: person => person.rank || undefined, header: "Golongan", size: 100, sortUndefined: "last",
      cell: ({ row }) => row.original.rank || "Belum dicatat" },
    { id: "department", accessorFn: person => person.department || undefined, header: "Bidang", size: 160, sortUndefined: "last",
      cell: ({ row }) => row.original.department || "Belum dicatat" },
    { id: "trips", accessorKey: "tripCount", header: "Perjalanan", size: 115,
      cell: ({ row }) => <button className="employee-trip-count" onClick={() => onDetail(row.original)} aria-label={`Riwayat perjalanan ${row.original.name}`}><strong>{row.original.tripCount}</strong> perjalanan</button> },
    { id: "actions", header: "Aksi", size: 72, enableSorting: false, enableHiding: false,
      cell: ({ row }) => <EmployeeActions employee={row.original} busy={busy} onDetail={onDetail} onEdit={onEdit} onRemove={onRemove} onRestore={onRestore} /> },
  ], [busy, onDetail, onEdit, onRemove, onRestore]);
  return <section className="archive-panel secondary-register-page employee-register-panel">
    <div className="register-heading"><div><h2>Daftar pegawai</h2><p>Kelola identitas pegawai dan telusuri riwayat perjalanan dinasnya.</p></div><Button size="sm" onClick={onCreate}><Plus size={15} />Tambah pegawai</Button></div>
    <div className="register-tabs" role="group" aria-label="Status pegawai">
      <button className={!showDeleted ? "active" : undefined} aria-pressed={!showDeleted} onClick={() => onDeletedChange(false)}>Pegawai aktif <span>{activeCount}</span></button>
      <button className={showDeleted ? "active" : undefined} aria-pressed={showDeleted} onClick={() => onDeletedChange(true)}>Pegawai terhapus <span>{people.length - activeCount}</span></button>
    </div>
    <div className="register-filters secondary-register-filters">
      <div className="register-search-field"><label htmlFor="employee-search">Cari pegawai</label><div className="search-control"><Search size={16} />
        <input id="employee-search" aria-label="Cari pegawai" placeholder="Nama, NIP, jabatan, atau golongan…" value={query} onChange={event => onQueryChange(event.target.value)} />
        {query && <button aria-label="Hapus pencarian pegawai" onClick={() => onQueryChange("")}><X size={14} /></button>}
      </div></div>
      <div><label htmlFor="employee-department">Bidang asal</label><CustomSelect id="employee-department" aria-label="Filter bidang pegawai" value={department} onValueChange={onDepartmentChange}>
        <SelectOption value="all">Semua bidang</SelectOption>{departments.map(value => <SelectOption key={value} value={value}>{value}</SelectOption>)}
      </CustomSelect></div>
      {(query || department !== "all") && <Button variant="ghost" size="sm" className="register-reset" onClick={reset}>Reset filter</Button>}
    </div>
    {error}
    <DataRegister data={visible} columns={columns} getRowId={getRowId} label={showDeleted ? "Daftar pegawai terhapus" : "Daftar pegawai aktif"} unit="pegawai"
      initialSorting={[{ id: "name", desc: false }]} sortOptions={sortOptions} className="employee-register"
      emptyState={<Empty icon={<Users size={28} />} heading={showDeleted ? "Tidak ada pegawai terhapus yang cocok" : "Belum ada pegawai yang cocok"}
        description={showDeleted ? "Pegawai yang dihapus dapat dipulihkan melalui daftar ini." : "Tambahkan pegawai baru atau ubah pencarian dan bidang."}
        action={query || department !== "all" ? <Button variant="outline" onClick={reset}>Reset filter</Button> : undefined} />}
      renderMobile={row => <>
        <div className="employee-mobile-heading"><div className="employee-register-identity"><button className="register-reference" onClick={() => onDetail(row.original)}>{row.original.name}</button><small className="register-cell-note">{row.original.position || "Jabatan belum dicatat"}</small></div>
          <EmployeeActions employee={row.original} busy={busy} onDetail={onDetail} onEdit={onEdit} onRemove={onRemove} onRestore={onRestore} /></div>
        <dl className="employee-mobile-meta"><div><dt>NIP</dt><dd>{row.original.nip || "Belum dicatat"}</dd></div><div><dt>Golongan</dt><dd>{row.original.rank || "Belum dicatat"}</dd></div><div><dt>Bidang</dt><dd>{row.original.department || "Belum dicatat"}</dd></div></dl>
        <div className="register-mobile-bottom"><span>{row.original.tripCount} perjalanan tercatat</span><Button variant="outline" size="sm" onClick={() => onDetail(row.original)}>Lihat detail</Button></div>
      </>} />
  </section>;
}

function EmployeeActions({ employee, busy, onDetail, onEdit, onRemove, onRestore }: {
  employee: Employee; busy: boolean; onDetail: (employee: Employee) => void; onEdit: (employee: Employee) => void;
  onRemove: (employee: Employee) => void; onRestore: (employee: Employee) => void;
}) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Aksi ${employee.name}`} disabled={busy}><MoreHorizontal size={17} /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onDetail(employee)}><Eye size={15} />Lihat detail</DropdownMenuItem>
      {employee.deletedAt ? <DropdownMenuItem onSelect={() => onRestore(employee)}><RotateCcw size={15} />Pulihkan pegawai</DropdownMenuItem> : <>
        <DropdownMenuItem onSelect={() => onEdit(employee)}><Pencil size={15} />Edit pegawai</DropdownMenuItem><DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(employee)}><Trash2 size={15} />Hapus pegawai</DropdownMenuItem>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

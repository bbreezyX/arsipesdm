"use client";

import { useMemo, useState } from "react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { ChevronDown, FileText, MapPin, Search, X } from "lucide-react";
import { dateText, money, totalCost, type Trip } from "@/lib/model";
import { filterTaskLetters, groupTaskLetters, summarizeTripCosts, type TaskLetter } from "@/lib/task-letters";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import { Empty } from "./fields";
import DataRegister, { type RegisterSort } from "./data-register";

const getRowId = (letter: TaskLetter) => letter.key;
const sortOptions: RegisterSort[] = [
  { id: "dates", asc: "Tanggal terlama", desc: "Tanggal terbaru" },
  { id: "reference", asc: "Nomor ST A–Z", desc: "Nomor ST Z–A" },
  { id: "people", asc: "Pegawai paling sedikit", desc: "Pegawai paling banyak" },
  { id: "total", asc: "Biaya terendah", desc: "Biaya tertinggi" },
];

function LetterToggle({ row, mobile = false }: { row: Row<TaskLetter>; mobile?: boolean }) {
  return <Button variant="outline" size="sm" aria-label={`Rincian ST ${row.original.number}`}
    aria-expanded={row.getIsExpanded()} aria-controls={`letter-${mobile ? "mobile-" : ""}${encodeURIComponent(row.id)}`}
    onClick={() => row.toggleExpanded()}>{row.getIsExpanded() ? "Tutup" : "Rincian"}<ChevronDown size={14} className={row.getIsExpanded() ? "rotate-180" : undefined} /></Button>;
}
function LetterAmount({ letter }: { letter: TaskLetter }) {
  return <div className="register-amount">{money(letter.total)}{letter.unknownCount > 0 && <small className="register-cell-note">{letter.total !== null ? "Sementara · " : ""}{letter.unknownCount} rekap belum diisi</small>}</div>;
}

const columns: ColumnDef<TaskLetter>[] = [
  { id: "reference", accessorKey: "number", header: "Surat Tugas & perjalanan", size: 340, enableHiding: false,
    cell: ({ row }) => <div className="register-identity">
      <button className="register-reference" onClick={() => row.toggleExpanded()} aria-expanded={row.getIsExpanded()} aria-controls={`letter-${encodeURIComponent(row.id)}`}>{row.original.number}</button>
      <p className="register-description">{row.original.titles[0]}</p>
      <div className="register-destination"><MapPin size={13} /><span>{row.original.destinations.join(", ")}</span></div>
    </div> },
  { id: "dates", accessorKey: "startDate", header: "Pelaksanaan", size: 145,
    cell: ({ row }) => <div className="register-dates"><time>{dateText(row.original.startDate)}</time>{row.original.endDate !== row.original.startDate && <span>s.d. {dateText(row.original.endDate)}</span>}</div> },
  { id: "people", accessorKey: "peopleCount", header: "Pegawai", size: 125,
    cell: ({ row }) => <div className="register-people"><strong>{row.original.peopleCount} pegawai</strong><small>{row.original.trips.length} rekap</small></div> },
  { id: "total", accessorFn: letter => letter.total ?? undefined, header: "Realisasi", size: 150, sortUndefined: "last",
    cell: ({ row }) => <LetterAmount letter={row.original} /> },
  { id: "actions", header: "Rincian", size: 108, enableHiding: false, enableSorting: false, cell: ({ row }) => <LetterToggle row={row} /> },
];

export default function TaskLetters({ trips, onOpen }: { trips: Trip[]; onOpen: (id: string) => void }) {
  const { letters, unassigned } = useMemo(() => groupTaskLetters(trips), [trips]);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("all");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const years = [...new Set(letters.flatMap(letter => letter.trips.map(trip => trip.startDate.slice(0, 4))))].sort().reverse();
  const visible = useMemo(() => filterTaskLetters(letters, query, year), [letters, query, year]);
  const summary = summarizeTripCosts(visible.flatMap(letter => letter.trips));
  function reset() { setQuery(""); setYear("all"); }
  return <div className="task-letters secondary-register-page">
    <section className="archive-panel">
      <div className="register-heading task-letter-heading">
        <div><h2>Daftar surat tugas <span className="count-badge">{visible.length}</span></h2><p>Satu Surat Tugas memuat seluruh rekap pegawai dan realisasi biayanya.</p></div>
        <div className="task-letter-total"><span>Total biaya tercatat</span><strong>{visible.length ? money(summary.total) : money(0)}</strong><small>{summary.unknownCount ? `${summary.unknownCount} rekap belum memiliki biaya` : "Dari seluruh hasil pencarian"}</small></div>
      </div>
      <div className="register-filters secondary-register-filters">
        <div className="register-search-field"><label htmlFor="letter-search">Cari surat tugas</label><div className="search-control"><Search size={16} />
          <input id="letter-search" aria-label="Cari surat tugas" placeholder="Nomor ST, kegiatan, tujuan, atau pegawai…" value={query} onChange={event => setQuery(event.target.value)} />
          {query && <button aria-label="Hapus pencarian surat tugas" onClick={() => setQuery("")}><X size={14} /></button>}
        </div></div>
        <div><label htmlFor="letter-year">Tahun perjalanan</label><CustomSelect id="letter-year" aria-label="Tahun perjalanan surat tugas" value={year} onValueChange={setYear}>
          <SelectOption value="all">Semua tahun</SelectOption>{years.map(value => <SelectOption key={value} value={value}>{value}</SelectOption>)}
        </CustomSelect></div>
        {(query || year !== "all") && <Button variant="ghost" size="sm" className="register-reset" onClick={reset}>Reset filter</Button>}
      </div>
      <DataRegister data={visible} columns={columns} getRowId={getRowId} label="Daftar surat tugas" unit="surat tugas"
        initialSorting={[{ id: "dates", desc: true }]} sortOptions={sortOptions} className="letter-register"
        emptyState={<Empty icon={<FileText />} heading={letters.length ? "Surat tugas tidak ditemukan" : "Belum ada surat tugas"}
          description={letters.length ? "Coba nomor ST, kegiatan, atau tahun lainnya." : "Nomor ST yang diisi pada arsip perjalanan akan muncul di sini beserta total biayanya."}
          action={letters.length ? <Button variant="outline" onClick={reset}>Reset pencarian</Button> : undefined} />}
        renderMobile={row => <>
          <div className="register-mobile-top"><strong>{row.original.number}</strong></div>
          <p className="register-description">{row.original.titles[0]}</p>
          <div className="register-destination"><MapPin size={13} /><span>{row.original.destinations.join(", ")}</span></div>
          <div className="register-mobile-meta"><span>{dateText(row.original.startDate)}{row.original.endDate !== row.original.startDate && ` – ${dateText(row.original.endDate)}`}</span><span>{row.original.peopleCount} pegawai · {row.original.trips.length} rekap</span></div>
          <div className="register-mobile-bottom"><LetterAmount letter={row.original} /><LetterToggle row={row} mobile /></div>
        </>}
        renderExpanded={(row, mobile) => <section id={`letter-${mobile ? "mobile-" : ""}${encodeURIComponent(row.id)}`} className="task-letter-detail" aria-label={`Rincian biaya ST ${row.original.number}`}>
          <div className="task-letter-detail-heading"><h3>Rincian biaya perjalanan</h3><p>Biaya setiap rekap dihitung satu kali, termasuk rekap dengan beberapa peserta.</p></div>
          <TripCosts trips={row.original.trips} onOpen={onOpen} />
          <div className="task-letter-detail-total"><span>{row.original.unknownCount ? "Total biaya sementara" : "Total biaya surat tugas"}</span><strong>{money(row.original.total)}</strong></div>
          {row.original.unknownCount > 0 && <p className="task-letter-note">{row.original.unknownCount} rekap belum memiliki biaya. Total akan mengikuti biaya yang dilengkapi pada arsip perjalanan.</p>}
        </section>} />
      <p className="task-letter-note task-letter-footnote">Total mencakup seluruh rekap dalam setiap ST. Arsip di Sampah tidak dihitung. Biaya yang belum dicatat tidak dianggap nol.</p>
    </section>
    {unassigned.length > 0 && <section className="archive-panel task-letter-unassigned">
      <div><strong>{unassigned.length} rekap belum memiliki nomor ST</strong><p>Rekap ini belum masuk ke total surat tugas. Buka arsip untuk melengkapi nomor ST.</p></div>
      <Button variant="outline" size="sm" aria-expanded={showUnassigned} aria-controls="unassigned-letters" onClick={() => setShowUnassigned(!showUnassigned)}>{showUnassigned ? "Tutup rekap" : "Lihat rekap"}</Button>
      {showUnassigned && <div id="unassigned-letters" className="table-scroll"><TripCosts trips={unassigned} onOpen={onOpen} /></div>}
    </section>}
  </div>;
}

function TripPeople({ participants }: { participants: Trip["participants"] }) {
  return <span className="letter-participants">{participants.map(person => <span className="letter-participant" key={person.id}>
    <strong>{person.name}</strong>
    <small>{person.nip.trim() ? `NIP ${person.nip}` : "NIP belum diisi"}</small>
  </span>)}</span>;
}

function TripCosts({ trips, onOpen }: { trips: Trip[]; onOpen: (id: string) => void }) {
  return <><div className="letter-breakdown-desktop"><Table className="report-table task-letter-breakdown" aria-label="Rincian biaya per rekap">
    <TableHeader><TableRow><TableHead>Pegawai / rekap</TableHead><TableHead>Perjalanan</TableHead><TableHead className="task-letter-amount">Biaya tercatat</TableHead><TableHead><span className="sr-only">Arsip</span></TableHead></TableRow></TableHeader>
    <TableBody>{trips.map(trip => <TableRow key={trip.id}>
      <TableCell><TripPeople participants={trip.participants} /></TableCell>
      <TableCell><span>{trip.destination}</span><small>{dateText(trip.startDate)} – {dateText(trip.endDate)}</small><small className="task-letter-purpose">{trip.title}</small></TableCell>
      <TableCell className="task-letter-amount"><strong>{money(totalCost(trip))}</strong></TableCell>
      <TableCell><Button variant="secondary" size="xs" className="archive-open-badge" onClick={() => onOpen(trip.id)} aria-label={`Buka arsip ${trip.code}`}>Buka arsip</Button></TableCell>
    </TableRow>)}</TableBody>
  </Table></div>
    <div className="letter-breakdown-mobile">{trips.map(trip => <div className="letter-breakdown-item" key={trip.id}>
      <TripPeople participants={trip.participants} />
      <p>{trip.title}</p><small>{trip.destination} · {dateText(trip.startDate)} – {dateText(trip.endDate)}</small>
      <div><strong className="register-amount">{money(totalCost(trip))}</strong><Button variant="secondary" size="xs" className="archive-open-badge" onClick={() => onOpen(trip.id)} aria-label={`Buka arsip ${trip.code}`}>Buka arsip</Button></div>
    </div>)}</div>
  </>;
}

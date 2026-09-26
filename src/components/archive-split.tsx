"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleAlert, Download, LoaderCircle } from "lucide-react";
import { amountsByColumn, costColumns, costMix, recordGaps, type ArchiveGroup, type RecordGapField } from "@/lib/archive-groups";
import { tripDestinations } from "@/lib/destinations";
import { dateText, money, totalCost, type Trip } from "@/lib/model";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { CustomSelect, SelectOption } from "./ui/select";

/*
  Arsip perjalanan: daftar Surat Tugas di kiri, rincian yang dipilih di kanan.
  Pola yang sama dengan halaman Dokumen: layar lebar selalu menampilkan satu rincian
  (pilihan pengguna, atau perjalanan teratas di halaman ini); layar sempit bergantian
  antara daftar dan rincian.
*/

const reference = (group: ArchiveGroup) => group.number || group.trips[0].code;
const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;

/** "12 Mar – 14 Mar 2024" when both dates share a year; full dates otherwise. */
function dateRange(start: string, end: string) {
  if (start === end) return dateText(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const first = sameYear ? dateText(start, { day: "numeric", month: "short" }) : dateText(start);
  return `${first} – ${dateText(end)}`;
}

const pageSizes = [20, 50, 100];
/* Warna komponen biaya: biru laut ke biru muda, urut dari komponen terbesar. Emas tetap khusus penanda posisi. */
const mixColors = ["var(--ledger-navy)", "#4f7aa3", "#8fb0cc", "#c3d3e2"];
const gapLabels: Record<RecordGapField, string> = {
  costs: "Nominal biaya", sppd: "Nomor SPPD", documents: "Dokumen", account: "Kode rekening",
};
const firstName = (trip: Trip) => trip.participants[0]?.name.split(",")[0].trim() || trip.code;
const sortOptions = [
  ["newest", "Terbaru dulu"],
  ["oldest", "Terlama dulu"],
  ["cost", "Realisasi terbesar"],
] as const;

const narrowQuery = "(max-width: 900px)";
function subscribeNarrow(callback: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const useIsNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export default function ArchiveSplit({
  groups,
  scope,
  tools,
  sort,
  onSort,
  filtered,
  onClear,
  selected,
  onSelectionChange,
  selectionEnabled,
  onOpenTrip,
  onExport,
  exporting,
  emptyState,
}: {
  groups: ArchiveGroup[];
  /** Changes whenever the filters change; the list returns to its first page. */
  scope: string;
  /** Search, completeness switch and filters, rendered above the list. */
  tools: ReactNode;
  sort: string;
  onSort: (sort: string) => void;
  filtered: boolean;
  onClear: () => void;
  selected: Set<string>;
  onSelectionChange: Dispatch<SetStateAction<Set<string>>>;
  selectionEnabled: boolean;
  /** Opens the rekap page of one employee. */
  onOpenTrip: (trip: Trip) => void;
  /** Exports one Surat Tugas; absent when the user cannot export. */
  onExport?: (group: ArchiveGroup) => void;
  exporting: boolean;
  emptyState: ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const narrow = useIsNarrow();
  const listRef = useRef<HTMLUListElement>(null);
  const splitRef = useRef<HTMLElement>(null);

  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const page = Math.min(pageIndex, pageCount - 1);
  const pageRows = groups.slice(page * pageSize, (page + 1) * pageSize);
  // biome-ignore lint/correctness/useExhaustiveDependencies: kembali ke halaman pertama saat saringan berubah
  useEffect(() => { setPageIndex(0); }, [scope, pageSize]);

  const open = groups.find((group) => group.key === openKey) ?? null;
  const current = open ?? (narrow ? null : pageRows[0] ?? null);
  const index = current ? groups.findIndex((group) => group.key === current.key) : -1;
  const jumpTo = (target: ArchiveGroup | undefined) => {
    if (!target) return;
    setOpenKey(target.key);
    setPageIndex(Math.floor(groups.indexOf(target) / pageSize));
  };
  const prev = index > 0 ? () => jumpTo(groups[index - 1]) : null;
  const next = index >= 0 && index < groups.length - 1 ? () => jumpTo(groups[index + 1]) : null;

  /* Panah atas/bawah pindah perjalanan (layar lebar); Escape kembali ke daftar (layar sempit). */
  const keys = useRef({ prev, next, narrow, open: Boolean(open) });
  keys.current = { prev, next, narrow, open: Boolean(open) };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      const { prev: back, next: forward, narrow: small, open: isOpen } = keys.current;
      if (event.key === "Escape" && small && isOpen) { setOpenKey(null); return; }
      if (small || isTyping(event.target)) return;
      const step = event.key === "ArrowDown" ? forward : event.key === "ArrowUp" ? back : null;
      if (step) { event.preventDefault(); step(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  /* Perjalanan yang dipilih lewat papan ketik tetap terlihat di daftar. */
  const currentKey = current?.key;
  useEffect(() => {
    if (currentKey) listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [currentKey]);

  function go(target: number) {
    setPageIndex(target);
    if (narrow) splitRef.current?.scrollIntoView({ block: "start" });
  }
  const toggle = (key: string, checked: boolean) => onSelectionChange((previous) => {
    const next = new Set(previous);
    if (checked) next.add(key); else next.delete(key);
    return next;
  });
  const pageSelected = pageRows.filter((group) => selected.has(group.key)).length;

  const list = (
    <div className="perjalanan-list">
      <div className="perjalanan-list-tools">{tools}</div>
      <div className="perjalanan-list-count">
        {selectionEnabled && pageRows.length > 0 && (
          <Checkbox aria-label="Pilih semua pada halaman ini"
            checked={pageSelected === pageRows.length || (pageSelected > 0 && "indeterminate")}
            onCheckedChange={(checked) => onSelectionChange((previous) => {
              const next = new Set(previous);
              for (const group of pageRows) if (checked === true) next.add(group.key); else next.delete(group.key);
              return next;
            })} />
        )}
        <p role="status"><strong>{groups.length.toLocaleString("id-ID")}</strong> perjalanan{filtered ? " sesuai saringan" : ""}</p>
        {filtered && <button type="button" className="perjalanan-clear" onClick={onClear}>Bersihkan</button>}
        <CustomSelect aria-label="Urutkan perjalanan" className="perjalanan-sort" value={sort} onValueChange={onSort}>
          {sortOptions.map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}
        </CustomSelect>
      </div>
      <ul className="perjalanan-items" ref={listRef} aria-label="Daftar perjalanan">
        {pageRows.map((group) => (
          <li key={group.key} data-selected={selected.has(group.key) || undefined}>
            {selectionEnabled && (
              <Checkbox aria-label={`Pilih ${reference(group)}`} checked={selected.has(group.key)}
                onCheckedChange={(checked) => toggle(group.key, checked === true)} />
            )}
            <button type="button" className="perjalanan-item" data-tour="archive-record"
              aria-current={current?.key === group.key || undefined}
              onClick={() => setOpenKey(group.key)}>
              <span className="perjalanan-item-ref">{reference(group)}</span>
              <span className="perjalanan-item-amount">{group.total === null ? "Belum dicatat" : money(group.total)}</span>
              <span className="perjalanan-item-sub">{group.destinations.join(", ")} · {dateRange(group.startDate, group.endDate)}</span>
              <span className="perjalanan-item-state" data-complete={group.complete || undefined}>
                <i aria-hidden="true" />
                {group.complete ? `${group.participants.length} pegawai` : `${group.completeCount}/${group.trips.length} lengkap`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="perjalanan-pagination">
        <p><strong>{groups.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, groups.length)}</strong> dari {groups.length}</p>
        <CustomSelect aria-label="Perjalanan per halaman" className="perjalanan-page-size" value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
          {pageSizes.map((size) => <SelectOption key={size} value={String(size)}>{String(size)}</SelectOption>)}
        </CustomSelect>
        <nav aria-label="Halaman daftar perjalanan">
          <Button variant="outline" size="icon-sm" aria-label="Halaman pertama" disabled={page === 0} onClick={() => go(0)}><ChevronsLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Halaman sebelumnya" disabled={page === 0} onClick={() => go(page - 1)}><ChevronLeft /></Button>
          <span><strong>{page + 1}</strong> / {pageCount}</span>
          <Button variant="outline" size="icon-sm" aria-label="Halaman berikutnya" disabled={page >= pageCount - 1} onClick={() => go(page + 1)}><ChevronRight /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Halaman terakhir" disabled={page >= pageCount - 1} onClick={() => go(pageCount - 1)}><ChevronsRight /></Button>
        </nav>
      </div>
    </div>
  );

  return (
    <section className="perjalanan-split ledger-sheet" ref={splitRef} data-tour="archive-results"
      data-open={narrow && open ? "true" : undefined} data-empty={groups.length ? undefined : "true"}
      aria-label={current ? `Rincian ${reference(current)}` : "Daftar perjalanan"}>
      {(!narrow || !open) && list}
      {current ? (
        <GroupView key={current.key} group={current} narrow={narrow} index={index} total={groups.length}
          prev={prev} next={next} onBack={() => setOpenKey(null)} onOpenTrip={onOpenTrip}
          onExport={onExport} exporting={exporting} />
      ) : !groups.length && emptyState}
    </section>
  );
}

function GroupView({ group, narrow, index, total, prev, next, onBack, onOpenTrip, onExport, exporting }: {
  group: ArchiveGroup;
  narrow: boolean;
  index: number;
  total: number;
  prev: (() => void) | null;
  next: (() => void) | null;
  onBack: () => void;
  onOpenTrip: (trip: Trip) => void;
  onExport?: (group: ArchiveGroup) => void;
  exporting: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  /* Di layar sempit rincian menggantikan daftar, jadi fokus pindah ke judulnya. */
  useEffect(() => {
    if (!narrow) return;
    headingRef.current?.closest(".perjalanan-split")?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, [narrow]);
  const departments = [...new Set(group.trips.map((trip) => trip.department))].join(", ");
  const mix = costMix(group.trips);
  const mixTotal = mix.reduce((sum, share) => sum + share.amount, 0);
  const percent = (amount: number) => Math.round((amount / mixTotal) * 100);
  const columns = costColumns(mix);
  const columnTotals = group.trips.map((trip) => amountsByColumn(trip, columns))
    .reduce<(number | null)[]>((totals, row) => row.map((amount, i) => amount === null ? totals[i] ?? null : (totals[i] ?? 0) + amount),
      [...columns.named.map(() => null), ...(columns.other ? [null] : [])]);
  const gaps = recordGaps(group.trips);
  const sharedSchedule = (trip: Trip) => trip.startDate === group.startDate && trip.endDate === group.endDate
    && tripDestinations(trip).join(", ") === group.destinations.join(", ");
  return (
    <div className="perjalanan-detail">
      <header className="perjalanan-detail-head">
        {narrow && (
          <button type="button" className="perjalanan-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Daftar perjalanan</button>
        )}
        <div className="perjalanan-detail-top">
          <h2 ref={headingRef} tabIndex={-1}>{reference(group)}</h2>
          <div className="perjalanan-detail-nav" role="group" aria-label="Pindah perjalanan">
            <Button variant="outline" size="icon-sm" aria-label="Perjalanan sebelumnya" disabled={!prev} onClick={() => prev?.()}><ChevronLeft /></Button>
            <span aria-live="polite">{index >= 0 ? `${index + 1} dari ${total}` : "Di luar daftar"}</span>
            <Button variant="outline" size="icon-sm" aria-label="Perjalanan berikutnya" disabled={!next} onClick={() => next?.()}><ChevronRight /></Button>
          </div>
        </div>
        {group.titles.map((title, i) => <p key={i} className="perjalanan-purpose">{title}</p>)}
        <dl className="perjalanan-facts">
          <div><dt>Pelaksanaan</dt><dd>{dateRange(group.startDate, group.endDate)} · {days(group.startDate, group.endDate)} hari</dd></div>
          <div><dt>Tujuan</dt><dd>{group.destinations.join(", ")}</dd></div>
          <div><dt>Bidang</dt><dd>{departments}</dd></div>
          <div>
            <dt>Kelengkapan</dt>
            <dd><span className={`ledger-state ${group.complete ? "complete" : ""}`}>{group.complete ? "Lengkap" : "Draft"}</span>
              <small>{group.completeCount} dari {group.trips.length} rekap</small></dd>
          </div>
          <div>
            <dt>{group.unknownCount ? "Realisasi sementara" : "Realisasi"}</dt>
            <dd className="perjalanan-total">{money(group.total)}</dd>
          </div>
        </dl>
      </header>

      <div className="perjalanan-detail-body">
        <section className="perjalanan-mix">
          <div className="perjalanan-section-head">
            <h3>Komposisi realisasi</h3>
            {onExport && (
              <Button variant="outline" size="sm" className="perjalanan-export" disabled={exporting} onClick={() => onExport(group)}>
                {exporting ? <LoaderCircle className="animate-spin" /> : <Download />} Ekspor surat ini
              </Button>
            )}
          </div>
          {mixTotal > 0 ? <>
            <div className="perjalanan-mix-bar" role="img"
              aria-label={mix.map((share) => `${share.category} ${percent(share.amount)} persen`).join(", ")}>
              {mix.map((share, i) => (
                <i key={share.category} style={{ width: `${(share.amount / mixTotal) * 100}%`, background: mixColors[Math.min(i, mixColors.length - 1)] }} />
              ))}
            </div>
            <ul className="perjalanan-mix-legend">
              {mix.map((share, i) => (
                <li key={share.category}>
                  <i style={{ background: mixColors[Math.min(i, mixColors.length - 1)] }} aria-hidden="true" />
                  <span>{share.category}</span>
                  <b>{money(share.amount)}</b>
                  <small>{percent(share.amount)}% · {share.trips} rekap</small>
                </li>
              ))}
            </ul>
          </> : <p className="perjalanan-mix-empty">Belum ada nominal biaya pada Surat Tugas ini.</p>}
        </section>

        <section>
          <h3 className="perjalanan-section-title">Rincian per pegawai <span>pilih baris untuk membuka rekapnya</span></h3>
          <div className="perjalanan-people-wrap">
            <table className="perjalanan-people">
              <thead>
                <tr>
                  <th>Pegawai</th>
                  {columns.named.map((name) => <th key={name} className="r is-component">{name}</th>)}
                  {columns.other && <th className="r is-component">Lainnya</th>}
                  <th className="r">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.trips.map((trip) => {
                  const cost = totalCost(trip);
                  return (
                    <tr key={trip.id} onClick={() => onOpenTrip(trip)}>
                      <td>
                        <button type="button" className="perjalanan-people-who" onClick={(event) => { event.stopPropagation(); onOpenTrip(trip); }}>
                          <strong>{trip.participants.map((person) => person.name).join(", ")}</strong>
                          <small>{trip.participants.length > 1 ? "Arsip gabungan" : trip.participants[0]?.position || trip.code}</small>
                          {!sharedSchedule(trip) && <small>{trip.destination}, {dateRange(trip.startDate, trip.endDate)}</small>}
                        </button>
                      </td>
                      {amountsByColumn(trip, columns).map((amount, i) => (
                        <td key={i} className="r is-component">{amount === null ? <span className="perjalanan-dash">–</span> : money(amount)}</td>
                      ))}
                      <td className={`r perjalanan-people-total ${cost === null ? "is-unknown" : ""}`}>{money(cost)}</td>
                      <td className="perjalanan-people-go" aria-hidden="true"><ChevronRight size={16} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{group.unknownCount ? `Sementara, ${group.unknownCount} rekap belum bernominal` : `${group.trips.length} rekap`}</td>
                  {columnTotals.map((amount, i) => <td key={i} className="r is-component">{amount === null ? "–" : money(amount)}</td>)}
                  <td className="r">{money(group.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {gaps.length > 0 && (
          <section>
            <h3 className="perjalanan-section-title">Belum dicatat</h3>
            <ul className="perjalanan-gaps">
              {gaps.map((gap) => (
                <li key={gap.field}>
                  <CircleAlert size={15} aria-hidden="true" />
                  <b>{gapLabels[gap.field]}</b>
                  <small>
                    {gap.trips.length === group.trips.length
                      ? `${gap.trips.length} dari ${group.trips.length} rekap`
                      : gap.trips.length <= 3
                        ? gap.trips.map(firstName).join(", ")
                        : `${gap.trips.length} dari ${group.trips.length} rekap`}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

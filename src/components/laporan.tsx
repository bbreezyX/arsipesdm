"use client";

import { useMemo } from "react";
import { ArrowRight, BarChart3, Download, LoaderCircle, RotateCcw } from "lucide-react";
import {
  defaultFilters,
  filterTrips,
  isComplete,
  missingSppd,
  money,
  shortMoney,
  totalCost,
  type Filters,
  type Trip,
} from "@/lib/model";
import { costMix, filterArchiveGroups, type ArchiveGroup } from "@/lib/archive-groups";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Empty } from "./fields";

const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const monthValue = (index: number) => String(index + 1).padStart(2, "0");

function peopleCount(trips: Trip[]) {
  return new Set(trips.flatMap(t => t.participants.map(p => p.nip.trim() || p.name.trim().toLocaleLowerCase("id-ID")))).size;
}

function summarize(trips: Trip[], groups: ArchiveGroup[]) {
  return {
    trips: trips.length,
    journeys: groups.length,
    people: peopleCount(trips),
    complete: trips.filter(isComplete).length,
    unknown: trips.filter(t => totalCost(t) === null).length,
    total: trips.reduce((sum, t) => sum + (totalCost(t) ?? 0), 0),
  };
}

/** Tiga komponen terbesar tampil apa adanya; sisanya digabung agar bilah tetap terbaca. */
function mixRows(trips: Trip[]) {
  const mix = costMix(trips);
  if (mix.length <= 3) return mix.map(share => ({ label: share.category, amount: share.amount }));
  const rest = mix.slice(2).reduce((sum, share) => sum + share.amount, 0);
  return [...mix.slice(0, 2).map(share => ({ label: share.category, amount: share.amount })), { label: "Lainnya", amount: rest }];
}

export default function Laporan({
  trips, groups, years, yearCounts, departments, filters, onFilter, busy, onExport, onReview, canExport = true,
}: {
  trips: Trip[];
  groups: ArchiveGroup[];
  years: string[];
  yearCounts: Map<string, number>;
  departments: string[];
  filters: Filters;
  onFilter: (patch: Partial<Filters>) => void;
  busy: boolean;
  onExport: (rows: Trip[]) => void;
  /** Membuka Arsip perjalanan dengan lingkup laporan yang sama ditambah saringan status. */
  onReview: (scope: Partial<Filters>) => void;
  canExport?: boolean;
}) {
  const { year, month, department } = filters;
  // Laporan hanya mengikuti tahun, bulan, dan bidang; pencarian dan status milik register arsip.
  const scope = useMemo(() => ({ ...defaultFilters, year, month, department }), [year, month, department]);
  const scoped = useMemo(() => filterTrips(trips, scope), [trips, scope]);
  const scopedGroups = useMemo(() => filterArchiveGroups(groups, scope), [groups, scope]);
  const summary = useMemo(() => summarize(scoped, scopedGroups), [scoped, scopedGroups]);
  const mix = useMemo(() => mixRows(scoped), [scoped]);

  // Setiap rincian mengabaikan filternya sendiri agar pilihan selalu terlihat di antara pembandingnya.
  const monthly = useMemo(() => {
    const base = filterTrips(trips, { ...scope, month: "all" });
    return monthNames.map((name, index) => {
      const items = base.filter(t => t.startDate.slice(5, 7) === monthValue(index));
      return {
        name, value: monthValue(index),
        ...summarize(items, filterArchiveGroups(groups, { ...scope, month: monthValue(index) })),
      };
    });
  }, [trips, groups, scope]);
  const byDepartment = useMemo(() => {
    const base = filterTrips(trips, { ...scope, department: "all" });
    const names = [...new Set([...departments, ...base.map(t => t.department)])];
    return names
      .map(name => {
        const items = base.filter(t => t.department === name);
        return { name, ...summarize(items, filterArchiveGroups(groups, { ...scope, department: name })) };
      })
      .filter(row => row.trips)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "id"));
  }, [trips, groups, departments, scope]);

  const monthMax = Math.max(1, ...monthly.map(row => row.total));
  const departmentTotal = byDepartment.reduce((sum, row) => sum + row.total, 0);
  const monthlyShown = monthly.filter(row => row.trips);
  const emptyMonths = monthly.filter(row => !row.trips).map(row => row.name);
  const monthlyTotal = summarize(
    filterTrips(trips, { ...scope, month: "all" }),
    filterArchiveGroups(groups, { ...scope, month: "all" }),
  );
  // Akumulasi hanya bermakna di dalam satu tahun anggaran.
  const cumulative = year !== "all";
  let running = 0;

  // Rentang bulan hanya ditulis dalam satu tahun; gabungan seluruh tahun cukup disebut begitu.
  const periodText = year === "all"
    ? (month !== "all" ? `${monthNames[Number(month) - 1]}, seluruh tahun` : "seluruh tahun")
    : month !== "all"
      ? `${monthNames[Number(month) - 1]} ${year}`
      : monthlyShown.length > 1
        ? `${monthlyShown[0].name}–${monthlyShown[monthlyShown.length - 1].name} ${year}`
        : monthlyShown.length ? `${monthlyShown[0].name} ${year}` : `tahun ${year}`;
  const scopeText = [periodText, department !== "all" ? `bidang ${department}` : ""].filter(Boolean).join(", ");
  const filterCount = (department !== "all" ? 1 : 0) + (month !== "all" ? 1 : 0);
  const withoutSppd = scoped.filter(missingSppd).length;
  const hasArchive = trips.length > 0;
  const known = summary.trips - summary.unknown;

  return (
    <div className="laporan-page">
      <header className="ledger-head">
        <div>
          <h1>Rekap &amp; laporan</h1>
        </div>
        {canExport && <div className="ledger-head-actions laporan-export">
          <Button onClick={() => onExport(scoped)} disabled={busy || !scoped.length}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Download />} Ekspor laporan
          </Button>
        </div>}
      </header>

      <nav className="ledger-years" aria-label="Tahun laporan">
        {years.map(y => (
          <button type="button" key={y} className="ledger-year" aria-pressed={year === y} onClick={() => onFilter({ year: y })}>
            <strong>{y}</strong>
            <span>{yearCounts.get(y) ?? 0} perjalanan</span>
          </button>
        ))}
        <button type="button" className="ledger-year ledger-year-all" aria-pressed={year === "all"} onClick={() => onFilter({ year: "all" })}>
          <strong>Semua</strong>
          <span>{groups.length} perjalanan</span>
        </button>
      </nav>

      <section className="ledger-sheet laporan-sheet" aria-label="Laporan realisasi">
        <div className="laporan-scope">
          <CustomSelect aria-label="Bidang" className="laporan-select" data-active={department !== "all"}
            value={department} onValueChange={value => onFilter({ department: value })}>
            <SelectOption value="all">Semua bidang</SelectOption>
            {departments.map(d => <SelectOption key={d}>{d}</SelectOption>)}
          </CustomSelect>
          <CustomSelect aria-label="Bulan keberangkatan" className="laporan-select" data-active={month !== "all"}
            value={month} onValueChange={value => onFilter({ month: value })}>
            <SelectOption value="all">Semua bulan</SelectOption>
            {monthNames.map((name, index) => <SelectOption key={name} value={monthValue(index)}>{name}</SelectOption>)}
          </CustomSelect>
          {filterCount > 0 && (
            <Button className="laporan-reset" variant="ghost" size="sm" onClick={() => onFilter({ department: "all", month: "all" })}>
              <RotateCcw /> Hapus filter ({filterCount})
            </Button>
          )}
        </div>

        {!hasArchive ? (
          <Empty icon={<BarChart3 size={30} />} heading="Belum ada arsip untuk dilaporkan"
            description="Laporan tersusun otomatis begitu arsip perjalanan pertama ditambahkan atau diimpor." />
        ) : (
          <>
            <section className="laporan-hero" aria-label={`Ringkasan ${scopeText}`}>
              <div>
                <p className="laporan-hero-label">Realisasi biaya perjalanan dinas, {scopeText}</p>
                {known > 0 ? (
                  <strong className="laporan-figure"><small>Rp</small>{summary.total.toLocaleString("id-ID")}</strong>
                ) : (
                  <strong className="laporan-figure is-empty">
                    {summary.trips ? "Belum ada nominal tercatat" : "Tidak ada perjalanan"}
                  </strong>
                )}
                <div className="laporan-facts">
                  <span><strong>{summary.journeys}</strong> perjalanan</span>
                  <span><strong>{summary.trips}</strong> rekap</span>
                  <span><strong>{summary.people}</strong> pegawai</span>
                </div>
              </div>
              {summary.total > 0 && (
                <div className="laporan-mix">
                  <div className="laporan-mix-bar" role="img"
                    aria-label={mix.map(row => `${row.label} ${Math.round((row.amount / summary.total) * 100)}%`).join(", ")}>
                    {mix.map((row, index) => (
                      <span key={row.label} data-tone={index} style={{ flexBasis: `${(row.amount / summary.total) * 100}%` }} />
                    ))}
                  </div>
                  <dl>
                    {mix.map((row, index) => (
                      <div key={row.label}>
                        <dt><i data-tone={index} aria-hidden="true" />{row.label}</dt>
                        <dd>{shortMoney(row.amount)}</dd>
                        <dd className="laporan-mix-share">{Math.round((row.amount / summary.total) * 100)}%</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </section>

            {byDepartment.length > 1 && (
              <section className="laporan-register" aria-label="Realisasi per bidang">
                <h2 className="laporan-caption">Per bidang</h2>
                <table className="laporan-table">
                  <thead>
                    <tr>
                      <th scope="col">Bidang</th>
                      <th scope="col" className="is-number is-wide">Perjalanan</th>
                      <th scope="col" className="is-number is-wide">Pegawai</th>
                      <th scope="col" className="is-number laporan-real-head">Realisasi</th>
                      <th scope="col" className="is-number is-wide">Porsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDepartment.map(row => (
                      <tr key={row.name} data-active={department === row.name || undefined}
                        onClick={() => onFilter({ department: department === row.name ? "all" : row.name })}>
                        <th scope="row">
                          <button type="button" className="laporan-pick" aria-pressed={department === row.name}
                            onClick={event => { event.stopPropagation(); onFilter({ department: department === row.name ? "all" : row.name }); }}>
                            {row.name}
                          </button>
                          <small className="laporan-row-meta">{row.journeys} perjalanan · {row.people} pegawai</small>
                        </th>
                        <td className="is-number is-wide">{row.journeys}</td>
                        <td className="is-number is-wide">{row.people}</td>
                        <td>
                          <span className="laporan-real">
                            <span className="laporan-track"><span style={{ width: `${departmentTotal ? (row.total / departmentTotal) * 100 : 0}%` }} /></span>
                            <b>{money(row.trips - row.unknown > 0 ? row.total : null)}</b>
                          </span>
                        </td>
                        <td className="is-number is-wide laporan-muted">{departmentTotal ? Math.round((row.total / departmentTotal) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className="laporan-register" aria-label="Realisasi per bulan">
              {byDepartment.length > 1 && <h2 className="laporan-caption">Per bulan</h2>}
              {monthlyShown.length ? (
                <table className="laporan-table">
                  <thead>
                    <tr>
                      <th scope="col">Bulan keberangkatan</th>
                      <th scope="col" className="is-number is-wide">Perjalanan</th>
                      <th scope="col" className="is-number is-wide">Pegawai</th>
                      <th scope="col" className="is-number laporan-real-head">Realisasi</th>
                      {cumulative && <th scope="col" className="is-number is-wide">Sampai bulan ini</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyShown.map(row => {
                      running += row.total;
                      return (
                        <tr key={row.value} data-active={month === row.value || undefined}
                          onClick={() => onFilter({ month: month === row.value ? "all" : row.value })}>
                          <th scope="row">
                            <button type="button" className="laporan-pick" aria-pressed={month === row.value}
                              onClick={event => { event.stopPropagation(); onFilter({ month: month === row.value ? "all" : row.value }); }}>
                              {row.name}
                            </button>
                            <small className="laporan-row-meta">{row.journeys} perjalanan · {row.people} pegawai</small>
                            {row.unknown > 0 && <small className="is-warning">{row.unknown} rekap belum bernominal</small>}
                          </th>
                          <td className="is-number is-wide">{row.journeys}</td>
                          <td className="is-number is-wide">{row.people}</td>
                          <td>
                            <span className="laporan-real">
                              <span className="laporan-track"><span style={{ width: `${(row.total / monthMax) * 100}%` }} /></span>
                              <b>{money(row.trips - row.unknown > 0 ? row.total : null)}</b>
                            </span>
                          </td>
                          {cumulative && <td className="is-number is-wide laporan-muted">{running.toLocaleString("id-ID")}</td>}
                        </tr>
                      );
                    })}
                    {emptyMonths.length > 0 && (
                      <tr className="laporan-quiet">
                        <td colSpan={cumulative ? 5 : 4}>{emptyMonths.join(", ")} · belum ada perjalanan</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Jumlah</th>
                      <td className="is-number is-wide">{monthlyTotal.journeys}</td>
                      <td className="is-number is-wide">{monthlyTotal.people}</td>
                      <td className="is-number">{money(monthlyTotal.trips - monthlyTotal.unknown > 0 ? monthlyTotal.total : null)}</td>
                      {cumulative && <td className="is-wide" />}
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <Empty icon={<BarChart3 size={28} />} heading="Tidak ada perjalanan pada lingkup ini"
                  description="Pilih bidang atau tahun lain, atau hapus filter yang aktif." />
              )}
            </section>

            {summary.trips > 0 && (
              <footer className="laporan-checks">
                <p data-state={summary.unknown ? "gap" : "ok"}>
                  <span>{summary.unknown
                    ? <><strong>{summary.unknown} dari {summary.trips} rekap</strong> belum bernominal dan tidak ikut dijumlahkan.</>
                    : <>Semua {summary.trips} rekap sudah bernominal.</>}</span>
                </p>
                <p data-state={withoutSppd ? "gap" : "ok"}>
                  <span>{withoutSppd
                    ? <><strong>{withoutSppd} dari {summary.trips} rekap</strong> belum bernomor SPPD, kolomnya akan kosong di berkas ekspor.</>
                    : <>Semua {summary.trips} rekap sudah bernomor SPPD.</>}</span>
                  {withoutSppd > 0 && (
                    <button type="button" className="laporan-check-link"
                      onClick={() => onReview({ year, month, department, status: "no-sppd" })}>
                      Lengkapi di Arsip perjalanan <ArrowRight aria-hidden="true" />
                    </button>
                  )}
                </p>
                <p className="laporan-checks-note">Dikelompokkan menurut tanggal keberangkatan.</p>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}

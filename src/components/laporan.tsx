"use client";

import { useMemo } from "react";
import { BarChart3, Download, LoaderCircle, RotateCcw } from "lucide-react";
import {
  defaultFilters,
  filterTrips,
  isComplete,
  money,
  shortMoney,
  totalCost,
  type Filters,
  type Trip,
} from "@/lib/model";
import { filterArchiveGroups, type ArchiveGroup } from "@/lib/archive-groups";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Empty } from "./fields";

const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const monthShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
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

export default function Laporan({
  trips, groups, years, yearCounts, departments, filters, onFilter, busy, onExport, canExport = true,
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
  canExport?: boolean;
}) {
  const { year, month, department } = filters;
  // Laporan hanya mengikuti tahun, bulan, dan bidang; pencarian dan status milik register arsip.
  const scope = useMemo(() => ({ ...defaultFilters, year, month, department }), [year, month, department]);
  const scoped = useMemo(() => filterTrips(trips, scope), [trips, scope]);
  const scopedGroups = useMemo(() => filterArchiveGroups(groups, scope), [groups, scope]);
  const summary = useMemo(() => summarize(scoped, scopedGroups), [scoped, scopedGroups]);

  // Setiap rincian mengabaikan filternya sendiri agar pilihan selalu terlihat di antara pembandingnya.
  const monthly = useMemo(() => {
    const base = filterTrips(trips, { ...scope, month: "all" });
    return monthNames.map((name, index) => {
      const items = base.filter(t => t.startDate.slice(5, 7) === monthValue(index));
      return {
        name, short: monthShort[index], value: monthValue(index),
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
  const emptyMonths = year === "all" ? [] : monthly.filter(row => !row.trips).map(row => row.name);
  const monthlyTotal = summarize(
    filterTrips(trips, { ...scope, month: "all" }),
    filterArchiveGroups(groups, { ...scope, month: "all" }),
  );
  const departmentAll = summarize(
    filterTrips(trips, { ...scope, department: "all" }),
    filterArchiveGroups(groups, { ...scope, department: "all" }),
  );

  const scopeParts = [
    year === "all" ? "seluruh tahun" : `tahun ${year}`,
    department !== "all" ? `bidang ${department}` : "",
    month !== "all" ? `bulan ${monthNames[Number(month) - 1]}` : "",
  ].filter(Boolean);
  const scopeText = scopeParts.join(", ");
  const filterCount = (department !== "all" ? 1 : 0) + (month !== "all" ? 1 : 0);
  const ratio = summary.trips ? summary.complete / summary.trips : 0;
  const hasArchive = trips.length > 0;

  return (
    <div className="laporan-page">
      <header className="ledger-head">
        <div>
          <h1>Rekap &amp; laporan</h1>
          <p>Laporan realisasi biaya perjalanan dinas per tahun, dirinci menurut bulan keberangkatan dan bidang{canExport ? ", siap diekspor ke Excel." : "."}</p>
        </div>
        {canExport && <div className="ledger-head-actions">
          <Button onClick={() => onExport(scoped)} disabled={busy || !scoped.length}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Download />} Ekspor laporan
          </Button>
        </div>}
      </header>

      <nav className="ledger-years" aria-label="Tahun laporan">
        {years.map(y => (
          <button key={y} className="ledger-year" aria-pressed={year === y} onClick={() => onFilter({ year: y })}>
            <strong>{y}</strong>
            <span>{yearCounts.get(y) ?? 0} perjalanan</span>
          </button>
        ))}
        <button className="ledger-year ledger-year-all" aria-pressed={year === "all"} onClick={() => onFilter({ year: "all" })}>
          <strong>Semua</strong>
          <span>{groups.length} perjalanan</span>
        </button>
      </nav>

      <section className="ledger-sheet laporan-sheet" aria-label="Laporan realisasi">
        <div className="laporan-scope">
          <span className="laporan-scope-label">Lingkup laporan</span>
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
            <Button className="ledger-reset" variant="ghost" size="sm" onClick={() => onFilter({ department: "all", month: "all" })}>
              <RotateCcw /> Hapus filter ({filterCount})
            </Button>
          )}
          <span className="laporan-scope-note">Berdasarkan tanggal keberangkatan</span>
        </div>

        {!hasArchive ? (
          <Empty icon={<BarChart3 size={30} />} heading="Belum ada arsip untuk dilaporkan"
            description="Laporan tersusun otomatis begitu arsip perjalanan pertama ditambahkan atau diimpor." />
        ) : (
          <>
            <section className="ledger-summary" aria-label={`Ringkasan ${scopeText}`}>
              <div>
                <span className="ledger-summary-label">Realisasi biaya perjalanan dinas {scopeText}</span>
                {summary.trips - summary.unknown > 0 ? (
                  <strong className="ledger-figure"><small>Rp</small>{summary.total.toLocaleString("id-ID")}</strong>
                ) : (
                  <strong className="ledger-figure is-empty">
                    {summary.trips ? "Belum ada nominal tercatat" : "Tidak ada perjalanan"}
                  </strong>
                )}
                <div className="ledger-summary-facts">
                  <span><strong>{summary.journeys}</strong> perjalanan</span>
                  <span><strong>{summary.trips}</strong> rekap</span>
                  <span><strong>{summary.people}</strong> pegawai</span>
                  {summary.unknown > 0 && <span className="is-warning"><strong>{summary.unknown}</strong> rekap belum bernominal</span>}
                </div>
              </div>
              <div>
                <div className="ledger-summary-row">
                  <span>Rekap bernominal</span>
                  <strong>{summary.complete} dari {summary.trips}</strong>
                </div>
                <div className={`ledger-bar ${summary.trips ? "" : "is-empty"}`} role="img"
                  aria-label={`${summary.complete} rekap bernominal, ${summary.unknown} belum`}>
                  <span key={`${scopeText}-${summary.trips}`} style={{ width: `${ratio * 100}%` }} />
                </div>
                <div className="ledger-legend">
                  <span><i aria-hidden="true" /><strong>{summary.complete}</strong> bernominal</span>
                  <span><i className="draft" aria-hidden="true" /><strong>{summary.unknown}</strong> belum dicatat</span>
                </div>
              </div>
            </section>

            <section className="laporan-months" aria-label="Realisasi per bulan">
              <div className="laporan-section-head">
                <h2>Realisasi per bulan</h2>
                <p>
                  {year === "all" ? "Gabungan bulan yang sama dari seluruh tahun. " : ""}
                  Pilih satu bulan untuk memfokuskan laporan.
                </p>
              </div>
              <div className="laporan-chart" role="group" aria-label="Bulan keberangkatan">
                {monthly.map(row => (
                  <button key={row.value} className="laporan-month" aria-pressed={month === row.value}
                    disabled={!row.trips} onClick={() => onFilter({ month: month === row.value ? "all" : row.value })}
                    title={`${row.name}: ${row.trips} rekap, ${money(row.trips - row.unknown > 0 ? row.total : null)}`}>
                    <span className="laporan-month-value">{row.total > 0 ? shortMoney(row.total) : row.trips ? "Rp 0" : ""}</span>
                    <span className="laporan-month-track">
                      <span className="laporan-month-bar" style={{ height: `${(row.total / monthMax) * 100}%` }} />
                    </span>
                    <strong>{row.short}</strong>
                    <small>{row.trips ? `${row.trips} rekap` : "kosong"}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="laporan-register" aria-label="Realisasi per bidang">
              <div className="laporan-section-head">
                <h2>Realisasi per bidang</h2>
                <p>Porsi dihitung dari seluruh bidang pada {month !== "all" ? `bulan ${monthNames[Number(month) - 1]} ` : ""}{year === "all" ? "seluruh tahun" : `tahun ${year}`}. Pilih bidang untuk memfokuskan laporan.</p>
              </div>
              {byDepartment.length ? (
                <div className="table-scroll">
                  <table className="laporan-table">
                    <thead>
                      <tr>
                        <th scope="col">Bidang</th>
                        <th scope="col" className="is-number">Perjalanan</th>
                        <th scope="col" className="is-number">Rekap</th>
                        <th scope="col" className="is-number">Pegawai</th>
                        <th scope="col" className="is-number">Bernominal</th>
                        <th scope="col" className="is-number">Realisasi</th>
                        <th scope="col" className="laporan-share-head">Porsi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDepartment.map(row => (
                        <tr key={row.name} data-active={department === row.name || undefined}>
                          <th scope="row">
                            <button className="laporan-pick" aria-pressed={department === row.name}
                              onClick={() => onFilter({ department: department === row.name ? "all" : row.name })}>
                              {row.name}
                            </button>
                          </th>
                          <td className="is-number">{row.journeys}</td>
                          <td className="is-number">{row.trips}</td>
                          <td className="is-number">{row.people}</td>
                          <td className="is-number">
                            {row.complete} dari {row.trips}
                            {row.unknown > 0 && <small className="is-warning">{row.unknown} belum dicatat</small>}
                          </td>
                          <td className="is-number is-money">{money(row.trips - row.unknown > 0 ? row.total : null)}</td>
                          <td>
                            <span className="laporan-share">
                              <span className="laporan-share-track"><span style={{ width: `${departmentTotal ? (row.total / departmentTotal) * 100 : 0}%` }} /></span>
                              <b>{departmentTotal ? Math.round((row.total / departmentTotal) * 100) : 0}%</b>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="laporan-foot">
                        <th scope="row"><span className="laporan-foot-label">Jumlah <strong>{byDepartment.length} bidang</strong></span></th>
                        <td className="is-number">{departmentAll.journeys}</td>
                        <td className="is-number">{departmentAll.trips}</td>
                        <td className="is-number">{departmentAll.people}</td>
                        <td className="is-number">{departmentAll.complete} dari {departmentAll.trips}</td>
                        <td className="is-number is-money">{money(departmentAll.trips - departmentAll.unknown > 0 ? departmentAll.total : null)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <Empty icon={<BarChart3 size={28} />} heading="Tidak ada perjalanan pada lingkup ini"
                  description="Pilih bulan atau tahun lain, atau hapus filter yang aktif." />
              )}
            </section>

            <section className="laporan-register" aria-label="Rekap bulanan">
              <div className="laporan-section-head">
                <h2>Rekap bulanan</h2>
                <p>
                  {year === "all" ? "Gabungan bulan yang sama dari seluruh tahun" : `Perjalanan yang berangkat pada tahun ${year}`}
                  {department !== "all" ? ` untuk bidang ${department}.` : "."}
                </p>
              </div>
              {monthlyShown.length ? (
                <div className="table-scroll">
                  <table className="laporan-table">
                    <thead>
                      <tr>
                        <th scope="col">Bulan</th>
                        <th scope="col" className="is-number">Perjalanan</th>
                        <th scope="col" className="is-number">Rekap</th>
                        <th scope="col" className="is-number">Pegawai</th>
                        <th scope="col" className="is-number">Bernominal</th>
                        <th scope="col" className="is-number">Realisasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyShown.map(row => (
                        <tr key={row.value} data-active={month === row.value || undefined}>
                          <th scope="row">
                            <button className="laporan-pick" aria-pressed={month === row.value}
                              onClick={() => onFilter({ month: month === row.value ? "all" : row.value })}>
                              {row.name}
                            </button>
                          </th>
                          <td className="is-number">{row.journeys}</td>
                          <td className="is-number">{row.trips}</td>
                          <td className="is-number">{row.people}</td>
                          <td className="is-number">
                            {row.complete} dari {row.trips}
                            {row.unknown > 0 && <small className="is-warning">{row.unknown} belum dicatat</small>}
                          </td>
                          <td className="is-number is-money">{money(row.trips - row.unknown > 0 ? row.total : null)}</td>
                        </tr>
                      ))}
                      {emptyMonths.length > 0 && (
                        <tr className="laporan-empty-months">
                          <td colSpan={6}>Tidak ada perjalanan yang berangkat pada {emptyMonths.join(", ")}.</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="laporan-foot">
                        <th scope="row"><span className="laporan-foot-label">Jumlah <strong>{monthly.filter(row => row.trips).length} bulan</strong></span></th>
                        <td className="is-number">{monthlyTotal.journeys}</td>
                        <td className="is-number">{monthlyTotal.trips}</td>
                        <td className="is-number">{monthlyTotal.people}</td>
                        <td className="is-number">{monthlyTotal.complete} dari {monthlyTotal.trips}</td>
                        <td className="is-number is-money">{money(monthlyTotal.trips - monthlyTotal.unknown > 0 ? monthlyTotal.total : null)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <Empty icon={<BarChart3 size={28} />} heading="Tidak ada perjalanan pada lingkup ini"
                  description="Pilih bidang atau tahun lain, atau hapus filter yang aktif." />
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}

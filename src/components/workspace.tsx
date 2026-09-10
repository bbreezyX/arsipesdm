"use client";
import { NavbarClock } from "./navbar-clock";
import Dokumen from "./dokumen";
import { buildTripSuggestions } from "@/lib/trip-suggestions";
import { CustomSelect, SelectOption } from "./ui/select";
import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { sectionPaths, sectionFromPath, type Section } from "@/lib/workspace-navigation";
import type { SessionInfo } from "@/lib/session-policy";
import { takeSessionNotice } from "@/lib/session-client";
import SessionGuard from "./session-guard";
export type { Section } from "@/lib/workspace-navigation";
import {
  Archive,
  BarChart3,
  FileText,
  Users,
  Settings2,
  Trash2,
  Search,
  Plus,
  Upload,
  Download,
  ChevronRight,
  MoreHorizontal,
  ArrowUpRight,
  CheckCircle2,
  FolderOpen,
  MapPin,
  PanelLeftClose,
  Menu,
  HelpCircle,
  LogOut,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  LoaderCircle,
  X,
  FileSpreadsheet,
  RotateCcw,
  Paperclip,
  Building2,
  Wallet,
  LockKeyhole,
  Info,
  Check,
  Pencil,
  Eye,
  EyeOff,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Field, Empty, ErrorMessage, api } from "./fields";
import {
  type Trip,
  type User,
  type Filters,
    defaultFilters,
  filterTrips,
  totalCost,
  dateText,
  isComplete,
  paymentLabel,
} from "@/lib/model";
import type { Employee } from "@/lib/employees";
import ArchiveGroups from "./archive-groups";
import Beranda from "./beranda";
const Pegawai = dynamic(() => import("./pegawai"));
import type { Honorarium } from "@/lib/honorarium";
const HonorariumWorkspace = dynamic(() => import("./honorarium-workspace"));
import { groupArchives, filterArchiveGroups, archiveGroupsForYear, archivesForExport, type ArchiveGroup } from "@/lib/archive-groups";
import { exportTrips, downloadTemplate } from "@/lib/export";
const TaskLetters = dynamic(() => import("./task-letters"));
const Laporan = dynamic(() => import("./laporan"));
const TripForm = dynamic(() => import("./trip-form"));
const TripDetail = dynamic(() => import("./trip-detail"));
const ImportDialog = dynamic(() => import("./import-dialog"));

const sectionNames: Record<Section, string> = {
  home: "Beranda",
  archives: "Arsip perjalanan",
  honorarium: "Honorarium",
  taskLetters: "Surat Tugas",
  reports: "Rekap & laporan",
  documents: "Dokumen",
  people: "Pegawai",
  settings: "Pengaturan",
  trash: "Sampah",
};
const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default function Workspace({
  initialTrips,
  initialEmployees,
  departments: initialDepartments,
  user,
  demo,
  initialSection = "archives",
  initialHonorariums = [],
  initialNow = new Date().toISOString(),
  session = null,
}: {
  initialTrips: Trip[];
  initialEmployees: Employee[];
  departments: string[];
  user: User | null;
  demo: boolean;
  initialSection?: Section;
  initialHonorariums?: Honorarium[];
  initialNow?: string;
  session?: SessionInfo | null;
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [trips, setTrips] = useState(initialTrips);
  const [departments, setDepartments] = useState(initialDepartments);
  const pathname = usePathname();
  const section = sectionFromPath(pathname) ?? initialSection;
  const [filters, setFilters] = useState<Filters>({
    ...defaultFilters,
    year: initialTrips.length
      ? [...initialTrips]
          .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
          .startDate.slice(0, 4)
      : "all",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Trip | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [login, setLogin] = useState(!user && !demo);
  const [help, setHelp] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [trashTrip, setTrashTrip] = useState<Trip | null>(null);
  const [trashError, setTrashError] = useState("");
  const openRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const tripSuggestions = useMemo(() => buildTripSuggestions(trips), [trips]);
  const active = useMemo(() => trips.filter((t) => !t.deletedAt), [trips]);
  const years = useMemo(
    () =>
      [...new Set(active.map((t) => t.startDate.slice(0, 4)))].sort().reverse(),
    [active],
  );
  const allDepartments = [
    ...new Set([...departments, ...active.map((t) => t.department)]),
  ];
  const filtered = useMemo(() => filterTrips(trips, filters), [trips, filters]);
  const yearTrips = useMemo(
    () => filterTrips(trips, { ...defaultFilters, year: filters.year }),
    [trips, filters.year],
  );
  const detail = trips.find((t) => t.id === detailId);
  const archiveGroups = useMemo(() => groupArchives(active), [active]);
  const filteredGroups = useMemo(() => filterArchiveGroups(archiveGroups, filters), [archiveGroups, filters]);
  const yearGroups = useMemo(() => archiveGroupsForYear(archiveGroups, filters.year), [archiveGroups, filters.year]);
  const yearCounts = useMemo(() => new Map(years.map(year => [year, archiveGroupsForYear(archiveGroups, year).length])), [archiveGroups, years]);
  const archiveExportRows = useMemo(() => archivesForExport(filteredGroups), [filteredGroups]);
  const selectedGroups = filteredGroups.filter(group => selected.has(group.key));
  const statusGroups = useMemo(() => filterArchiveGroups(archiveGroups, { ...filters, status: "all" }), [archiveGroups, filters]);
  const total = yearTrips.reduce((s, t) => s + (totalCost(t) ?? 0), 0);
  const unknown = yearTrips.filter((t) => totalCost(t) === null).length;
  const people = useMemo(() => employees.filter(p => !p.deletedAt), [employees]);
  useEffect(() => {
    const controller = new AbortController();
    api<Employee[]>("/api/employees", {cache: "no-store", signal: controller.signal})
      .then(setEmployees)
      .catch(error => { if (!controller.signal.aborted) setToast((error as Error).message); });
    return () => controller.abort();
  }, [trips]);
  const patchFilters = (p: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setSelected(new Set());
  };
  const go = (s: Section, nextFilters?: Partial<Filters>) => {
    if (s === "honorarium" && section !== "honorarium") { window.location.assign("/honorarium"); return; }
    if (section === "honorarium" && s !== "honorarium") { window.location.assign(sectionPaths[s]); return; }
    if (s !== section) {
      window.history.pushState(null, "", sectionPaths[s]);
      window.scrollTo({ top: 0 });
    }
    if (nextFilters) setFilters((f) => ({ ...f, ...nextFilters }));
    setNavOpen(false);
    setSelected(new Set());
  };
  function update(t: Trip) {
    setTrips((ts) => {
      const i = ts.findIndex((x) => x.id === t.id);
      return i < 0 ? [t, ...ts] : ts.map((x) => (x.id === t.id ? t : x));
    });
  }
  async function openArchive(
    id: string,
    action: "detail" | "edit" | "delete" = "detail",
  ) {
    const request = ++openRequest.current;
    try {
      const latest = await api<Trip>(`/api/archives/${id}`, {
        cache: "no-store",
      });
      if (request !== openRequest.current) return;
      update(latest);
      if (latest.deletedAt) {
        setDetailId(null);
      setToast(
          "Arsip sudah berada di Sampah. Pulihkan untuk menggunakannya kembali.",
        );
        return;
      }
      if (action === "edit") setEditor({ ...latest, correctionReason: "" });
      else if (action === "delete") {
        setTrashError("");
        setTrashTrip(latest);
      } else setDetailId(latest.id);
    } catch (error) {
      if (request === openRequest.current) setToast((error as Error).message);
    }
  }
  async function exportRows(rows = section === "archives" ? archiveExportRows : filtered) {
    setBusy(true);
    try {
      await exportTrips(
        rows,
        demo ? "contoh" : filters.year === "all" ? "semua-tahun" : filters.year,
      );
      setToast(`${rows.length} rekap diekspor ke Excel.`);
    } catch {
      setToast("Ekspor belum berhasil. Silakan coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  async function moveTrash(t: Trip, restore = false) {
    setBusy(true);
    setTrashError("");
    try {
      const updated = await api<Trip>(`/api/archives/${t.id}`, {
        method: restore ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: restore ? "restore" : "trash",
          version: t.version,
        }),
      });
      update(updated);
      setTrashTrip(null);
      if (!restore) setDetailId(null);
      setSelected(new Set());
        setToast(
        restore
          ? "Arsip berhasil dipulihkan."
          : "Arsip dipindahkan ke sampah dan dapat dipulihkan.",
      );
    } catch (e) {
      if (restore) setToast((e as Error).message);
      else setTrashError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filterCount = [
    filters.department !== "all",
    filters.month !== "all",
    filters.status !== "all",
    filters.search.trim() !== "",
  ].filter(Boolean).length;
  const navItems = [
    ["home", LayoutDashboard],
    ["archives", Archive],
    ["taskLetters", FileSpreadsheet],
    ["honorarium", Wallet],
    ["reports", BarChart3],
    ["documents", FileText],
    ["people", Users],
  ] as const;
  return (
    <div className="app-shell">
      {navOpen && (
        <button
          aria-label="Tutup navigasi"
          className="nav-scrim"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="official-brand">
          <span className="official-brand-mark">
            <img
              src="/logo-jambi.svg"
              alt="Lambang Provinsi Jambi"
              width="100"
              height="104"
            />
          </span>
          <div className="official-brand-name">
            <strong>Dinas ESDM</strong>
            <span>Provinsi Jambi</span>
          </div>
          <button
            className="mobile-close"
            onClick={() => setNavOpen(false)}
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Navigasi utama">
          {navItems.map(([key, Icon]) => (
            <button
              key={key}
              className={`nav-item ${section === key ? "active" : ""}`}
              onClick={() => go(key)}
              aria-current={section === key ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{sectionNames[key]}</span>
              {key === "archives" && (
                <span className="nav-count">{archiveGroups.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="bottom-nav">
          <button
            className={`nav-item ${section === "trash" ? "active" : ""}`}
            onClick={() => go("trash")}
          >
            <Trash2 size={18} />
            <span>Sampah</span>
            {trips.some((t) => t.deletedAt) && (
              <span className="nav-count">
                {trips.filter((t) => t.deletedAt).length}
              </span>
            )}
          </button>
          <button
            className={`nav-item ${section === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={18} />
            <span>Pengaturan</span>
          </button>
        </div>
        <div className="sidebar-user">
          <div className="avatar user-avatar">
            {demo ? "OP" : (user?.name.slice(0, 2).toUpperCase() ?? "OP")}
          </div>
          <div>
            <strong>{user?.name ?? "Operator"}</strong>
            <span>
              {demo
                ? "Ruang contoh"
                : user?.role === "admin"
                  ? "Administrator"
                  : "Operator arsip"}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Menu akun">
                <MoreHorizontal size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setLogin(true)}>
                <LockKeyhole size={15} />
                {demo ? "Masuk ke arsip kantor" : "Ganti akun"}
              </DropdownMenuItem>
              {!demo && (
                <DropdownMenuItem
                  onSelect={async () => {
                    await api("/api/session", { method: "DELETE" });
                    window.location.assign(sectionPaths.home);
                  }}
                >
                  <LogOut size={15} /> Keluar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="sidebar-toggle"
              onClick={() => setNavOpen(!navOpen)}
              aria-label="Buka navigasi"
            >
              <Menu size={19} />
            </button>
            <span className="compact-brand">
              <img src="/logo-jambi.svg" alt="Dinas ESDM Jambi" />
            </span>
            <span className="crumb-home">Ruang kerja</span>
            <ChevronRight size={14} />
            <strong>{sectionNames[section]}</strong>
          </div>
          <NavbarClock />
          <div className="topbar-right">
            {demo ? (
              <button className="demo-indicator" onClick={() => setLogin(true)}>
                <span />
                Data contoh <ArrowUpRight size={13} />
              </button>
            ) : (
              <span className="secure-indicator">
                <ShieldCheck size={15} /> Arsip kantor
              </span>
            )}
            <span className="topbar-divider" />
            <button
              className="help-button"
              aria-label="Buka panduan"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={19} />
            </button>
            <div className="avatar header-avatar">
              {demo ? "OP" : (user?.name.slice(0, 2).toUpperCase() ?? "OP")}
            </div>
          </div>
        </header>
        <main className={`workspace-main ${section === "archives" ? "workspace-archives" : section === "taskLetters" ? "workspace-letters" : section === "honorarium" ? "workspace-honorarium" : section === "reports" ? "workspace-laporan" : section === "people" ? "workspace-pegawai" : section === "documents" ? "workspace-dokumen" : section === "home" ? "workspace-beranda" : ""}`}>
          {section === "taskLetters" ? (
            <header className="ledger-head">
              <div>
                <h1>Surat Tugas</h1>
                <p>Register surat tugas yang tersusun per nomor surat, dengan pegawai yang ditugaskan dan realisasi biaya setiap perjalanannya.</p>
              </div>
            </header>
          ) : section === "archives" ? (
            <header className="ledger-head">
              <div>
                <h1>Arsip perjalanan</h1>
                <p>Register perjalanan dinas yang sudah dilaksanakan, dikelompokkan per Surat Tugas beserta rekap dan dokumen setiap pegawai.</p>
              </div>
              <div className="ledger-head-actions">
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <Upload /> Impor Excel
                </Button>
                <Button onClick={() => setEditor("new")}>
                  <Plus /> Tambah arsip
                </Button>
              </div>
            </header>
          ) : section === "home" || section === "honorarium" || section === "reports" || section === "people" || section === "documents" ? null : (
          <div className="page-heading">
            <div>
              <h1>{sectionNames[section]}</h1>
              <p>
                {section === "trash"
                          ? "Arsip yang dihapus tetap tersedia untuk dipulihkan."
                          : "Kelola bidang dan akses operator arsip kantor."}
              </p>
            </div>
          </div>
          )}
          {section === "archives" && (
            <>
              <nav className="ledger-years" aria-label="Tahun pelaksanaan">
                {years.map((year) => (
                  <button
                    key={year}
                    className="ledger-year"
                    aria-pressed={filters.year === year}
                    onClick={() => patchFilters({ year })}
                  >
                    <strong>{year}</strong>
                    <span>{yearCounts.get(year) ?? 0} perjalanan</span>
                  </button>
                ))}
                <button
                  className="ledger-year ledger-year-all"
                  aria-pressed={filters.year === "all"}
                  onClick={() => patchFilters({ year: "all" })}
                >
                  <strong>Semua</strong>
                  <span>{archiveGroups.length} perjalanan</span>
                </button>
              </nav>
              <section className="ledger-sheet">
                <YearSummary
                  year={filters.year}
                  groups={yearGroups}
                  trips={yearTrips}
                  total={total}
                  unknown={unknown}
                />
                <ArchiveGroups
                  groups={filteredGroups}
                  selected={selected}
                  onSelectionChange={setSelected}
                  renderActions={trip => <ArchiveActions trip={trip} onAction={action => openArchive(trip.id, action)} />}
                  status={
                    <div className="ledger-status" role="group" aria-label="Filter kelengkapan">
                      <button aria-pressed={filters.status === "all"} onClick={() => patchFilters({ status: "all" })}>
                        Semua <b>{statusGroups.length}</b>
                      </button>
                      <button aria-pressed={filters.status === "incomplete"} onClick={() => patchFilters({ status: "incomplete" })}>
                        <i aria-hidden="true" /> Draft <b>{statusGroups.filter(group => !group.complete).length}</b>
                      </button>
                      <button aria-pressed={filters.status === "complete"} onClick={() => patchFilters({ status: "complete" })}>
                        <i className="complete" aria-hidden="true" /> Lengkap <b>{statusGroups.filter(group => group.complete).length}</b>
                      </button>
                    </div>
                  }
                  tools={
                    <Button variant="outline" size="sm" className="ledger-tool" disabled={busy || !filteredGroups.length} onClick={() => exportRows()}>
                      {busy ? <LoaderCircle className="animate-spin" /> : <Download />} Ekspor Excel
                    </Button>
                  }
                  filterCount={[filters.department !== "all", filters.month !== "all"].filter(Boolean).length}
                  filters={
                    <>
                      <div className="ledger-search">
                        <Search size={17} aria-hidden="true" />
                        <input id="archive-search" ref={searchRef} aria-label="Cari arsip perjalanan" aria-keyshortcuts="/"
                          placeholder="Cari nomor surat, tujuan, atau nama pegawai" value={filters.search}
                          onChange={event => patchFilters({ search: event.target.value })} />
                        {filters.search ? <button onClick={() => patchFilters({ search: "" })} aria-label="Hapus pencarian"><X size={15} /></button> : <kbd aria-hidden="true">/</kbd>}
                      </div>
                      <div className="ledger-filter-group">
                      <CustomSelect aria-label="Bidang" className="ledger-select" data-active={filters.department !== "all"}
                        value={filters.department} onValueChange={value => patchFilters({ department: value })}>
                        <SelectOption value="all">Semua bidang</SelectOption>
                        {allDepartments.map(department => <SelectOption key={department}>{department}</SelectOption>)}
                      </CustomSelect>
                      <CustomSelect aria-label="Bulan perjalanan" className="ledger-select" data-active={filters.month !== "all"}
                        value={filters.month} onValueChange={value => patchFilters({ month: value })}>
                        <SelectOption value="all">Semua bulan</SelectOption>
                        {monthNames.map((month, index) => <SelectOption key={month} value={String(index + 1).padStart(2, "0")}>{month}</SelectOption>)}
                      </CustomSelect>
                      {filterCount > 0 && <Button className="ledger-reset" variant="ghost" size="sm" onClick={() => patchFilters({ ...defaultFilters, year: filters.year })}>
                        <RotateCcw /> Hapus filter ({filterCount})
                      </Button>}
                      </div>
                    </>
                  }
                  emptyState={
                    <Empty
                      icon={<FolderOpen size={30} />}
                      heading={active.length ? "Tidak ada perjalanan yang cocok" : "Mulai rapikan arsip perjalanan"}
                      description={active.length
                        ? "Coba kata kunci lain, pilih tahun berbeda, atau hapus filter yang aktif."
                        : "Impor rekap Excel yang sudah ada, atau tambahkan perjalanan lama satu per satu."}
                      action={active.length ? (
                        <Button variant="outline" onClick={() => patchFilters(defaultFilters)}>
                          Tampilkan semua perjalanan
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => setImporting(true)}>
                            <Upload /> Impor Excel
                          </Button>
                          <Button onClick={() => setEditor("new")}>
                            <Plus /> Tambah arsip
                          </Button>
                        </div>
                      )}
                    />
                  }
                />
              </section>
              {selectedGroups.length > 0 && (
                <div className="ledger-dock" role="region" aria-label="Arsip yang dipilih">
                  <span role="status">
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <strong>{selectedGroups.length}</strong> perjalanan dipilih, {selectedGroups.reduce((sum, group) => sum + group.trips.length, 0)} rekap
                  </span>
                  {selectedGroups.length < filteredGroups.length && <button onClick={() => setSelected(new Set(filteredGroups.map(group => group.key)))}>
                    Pilih semua {filteredGroups.length}
                  </button>}
                  <button className="is-primary" onClick={() => exportRows(archivesForExport(filteredGroups, selected))} disabled={busy}>
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} Ekspor pilihan
                  </button>
                  <button onClick={() => setSelected(new Set())}>
                    Batal
                  </button>
                </div>
              )}
            </>
          )}
          {section === "home" && (
            <Beranda
              trips={trips}
              employees={employees}
              honorariums={initialHonorariums}
              user={user}
              demo={demo}
              initialNow={initialNow}
              onGo={go}
              onOpen={(id) => openArchive(id)}
              onAdd={() => setEditor("new")}
              onImport={() => setImporting(true)}
            />
          )}
          {section === "taskLetters" && <TaskLetters trips={active} onOpen={(id) => openArchive(id)} />}
          {section === "honorarium" && <HonorariumWorkspace initialRecords={initialHonorariums} employees={people} onToast={setToast} />}
          {section === "reports" && (
            <Laporan
              trips={active}
              groups={archiveGroups}
              years={years}
              yearCounts={yearCounts}
              departments={allDepartments}
              filters={filters}
              onFilter={patchFilters}
              busy={busy}
              onExport={rows => exportRows(rows)}
            />
          )}
          {section === "documents" && (
            <Dokumen trips={active} onChange={update} notify={setToast} onOpen={(id) => openArchive(id)} />
          )}
          {section === "people" && (
            <Pegawai
              trips={active}
              people={employees}
              departments={allDepartments}
              onChange={(employee) => setEmployees(current => [...current.filter(p => p.id !== employee.id), employee].sort((a,b) => a.name.localeCompare(b.name, "id")))}
              notify={setToast}
              onOpen={(id) => openArchive(id)}
            />
          )}
          {section === "settings" && (
            <Settings
              departments={departments}
              setDepartments={setDepartments}
              user={user}
              demo={demo}
              onLogin={() => setLogin(true)}
              notify={setToast}
            />
          )}
          {section === "trash" && (
            <section className="archive-panel">
              {trips.some((t) => t.deletedAt) ? (
                <div className="trash-list">
                  {trips
                    .filter((t) => t.deletedAt)
                    .map((t) => (
                      <div key={t.id}>
                        <div className="file-icon">
                          <Archive size={21} />
                        </div>
                        <div>
                          <strong>{t.title}</strong>
                          <small>
                            {t.code} · {t.destination}
                          </small>
                          <small>
                            Dihapus{" "}
                            {new Date(t.deletedAt!).toLocaleDateString("id-ID")}
                          </small>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => moveTrash(t, true)}
                        >
                          <RotateCcw /> Pulihkan
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <Empty
                  icon={<Trash2 size={29} />}
                  heading="Sampah masih kosong"
                  description="Arsip yang dipindahkan ke sampah dapat dipulihkan dari sini."
                />
              )}
            </section>
          )}
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={13} />
              {demo
                ? "Ruang contoh · Semua nama, perjalanan, dan biaya bersifat fiktif."
                : "Arsip perjalanan Dinas ESDM Provinsi Jambi"}
            </span>
            <button onClick={() => setHelp(true)}>
              Butuh panduan? <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Tutup pemberitahuan">
            <X size={14} />
          </button>
        </div>
      )}
      {editor && (
        <TripForm
          trip={editor === "new" ? null : editor}
          departments={allDepartments}
          knownPeople={people}
          suggestions={tripSuggestions}
          onClose={() => setEditor(null)}
          onSaveBatch={(added) => {
            setTrips((current) => [...added, ...current]);
            patchFilters({ ...defaultFilters, year: "all" });
            go("archives");
            setEditor(null);
            setDetailId(null);
            const drafts = added.filter(t => !isComplete(t)).length;
            setToast(`${added.length} rekap berhasil disimpan.${drafts ? ` ${drafts} di antaranya berupa draft.` : ""}`);
          }}
          onSave={(t) => {
            update(t);
            if (editor === "new" || !filterTrips([t], filters).length)
              patchFilters({
                ...defaultFilters,
                year: t.startDate.slice(0, 4),
              });
            go("archives");
            setEditor(null);
            setDetailId(t.id);
            setToast(isComplete(t) ? "Arsip berhasil disimpan." : "Draft berhasil disimpan.");
          }}
        />
      )}
      {detail && !detail.deletedAt && !editor && !trashTrip && (
        <TripDetail
          key={detail.id}
          trip={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => openArchive(detail.id, "edit")}
          onDelete={() => openArchive(detail.id, "delete")}
          onUpdate={(t) => {
            update(t);
            setToast("Dokumen berhasil disimpan.");
          }}
        />
      )}
      {importing && (
        <ImportDialog
          existing={trips}
          departments={allDepartments}
          onClose={() => setImporting(false)}
          onImported={(added) => {
            setTrips((ts) => [...added, ...ts]);
            patchFilters(defaultFilters);
            go("archives");
          }}
        />
      )}
      {login && (
        <Login forced={!user && !demo} onClose={() => setLogin(false)} />
      )}
      {user && !demo && session && <SessionGuard session={session} />}
      <Dialog
        open={!!trashTrip}
        onOpenChange={(open) => {
          if (!open && !busy) setTrashTrip(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus arsip perjalanan?</DialogTitle>
            <DialogDescription>
              {trashTrip?.title}. Arsip akan dipindahkan ke Sampah. Data dan
              dokumennya dapat dipulihkan kapan saja.
            </DialogDescription>
          </DialogHeader>
          <ErrorMessage message={trashError} />
          <div className="flex justify-end gap-2 mt-3">
            <Button
              variant="outline"
              onClick={() => setTrashTrip(null)}
              disabled={busy}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => trashTrip && moveTrash(trashTrip)}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              Hapus arsip
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogHeader>
            <div className="dialog-kicker">
              <BookOpen size={17} /> Panduan singkat
            </div>
            <DialogTitle>Mulai dari arsip yang sudah ada</DialogTitle>
            <DialogDescription>
              Aplikasi ini merekap perjalanan yang sudah selesai dilaksanakan.
            </DialogDescription>
          </DialogHeader>
          <div className="help-steps">
            {[
              [
                "1",
                "Masukkan perjalanan lama",
                "Gunakan Tambah arsip untuk input satu per satu, atau Impor Excel untuk rekap yang sudah tersedia.",
              ],
              [
                "2",
                "Periksa data dan biaya",
                "Pastikan data perjalanan dan perhitungan biaya sesuai rekap. Dokumen pendukung boleh ditambahkan jika diperlukan.",
              ],
              [
                "3",
                "Temukan dan ekspor rekap",
                "Pilih tahun, bidang, bulan, atau nama pegawai. Ekspor selalu mengikuti hasil filter atau pilihan arsip.",
              ],
            ].map(([n, title, body]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="note-box">
            <strong>Biaya dan kelengkapan</strong>
            <p>
              Nominal mengikuti realisasi pada arsip sumber. Biaya yang belum
              diketahui tetap kosong. Status lengkap mengikuti daftar dokumen
              wajib tiap perjalanan dan ketersediaan nominal realisasi.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              downloadTemplate().catch(() =>
                setToast("Unduhan template gagal."),
              )
            }
          >
            <Download /> Unduh template Excel
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YearSummary({ year, groups, trips, total, unknown }: {
  year: string; groups: ArchiveGroup[]; trips: Trip[]; total: number; unknown: number;
}) {
  const complete = groups.filter(group => group.complete).length;
  const draft = groups.length - complete;
  const people = new Set(trips.flatMap(t => t.participants.map(p => p.nip || p.name.toLowerCase()))).size;
  const known = trips.length - unknown;
  const scope = year === "all" ? "seluruh tahun" : `tahun ${year}`;
  const ratio = groups.length ? complete / groups.length : 0;
  return (
    <section className="ledger-summary" aria-label={`Ringkasan ${scope}`}>
      <div>
        <span className="ledger-summary-label">Realisasi biaya perjalanan {scope}</span>
        {known ? (
          <strong className="ledger-figure"><small>Rp</small>{total.toLocaleString("id-ID")}</strong>
        ) : (
          <strong className="ledger-figure is-empty">Belum ada nominal tercatat</strong>
        )}
        <div className="ledger-summary-facts">
          <span><strong>{groups.length}</strong> perjalanan</span>
          <span><strong>{trips.length}</strong> rekap</span>
          <span><strong>{people}</strong> pegawai</span>
          {unknown > 0 && <span className="is-warning"><strong>{unknown}</strong> rekap belum bernominal</span>}
        </div>
      </div>
      <div>
        <div className="ledger-summary-row">
          <span>Perjalanan lengkap</span>
          <strong>{complete} dari {groups.length}</strong>
        </div>
        <div className={`ledger-bar ${groups.length ? "" : "is-empty"}`} role="img"
          aria-label={`${complete} perjalanan lengkap, ${draft} masih draft`}>
          <span key={`${year}-${groups.length}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        <div className="ledger-legend">
          <span><i aria-hidden="true" /><strong>{complete}</strong> lengkap</span>
          <span><i className="draft" aria-hidden="true" /><strong>{draft}</strong> draft</span>
        </div>
      </div>
    </section>
  );
}

function Settings({
  departments,
  setDepartments,
  user,
  demo,
  onLogin,
  notify,
}: {
  departments: string[];
  setDepartments: (d: string[]) => void;
  user: User | null;
  demo: boolean;
  onLogin: () => void;
  notify: (s: string) => void;
}) {
  const [text, setText] = useState(departments.join("\n"));
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user?.role === "admin")
      api<User[]>("/api/users")
        .then(setUsers)
        .catch((e) => setError(e.message));
  }, [user?.role]);
  async function save() {
    setBusy(true);
    try {
      const list = text
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      await api("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departments: list }),
      });
      setDepartments(list);
      notify("Data bidang berhasil disimpan.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const added = await api<User>("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setUsers((u) => [...u, added]);
      setAdding(false);
      notify("Akun operator berhasil ditambahkan.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-layout">
      {demo && (
        <div className="office-banner">
          <div className="office-banner-icon">
            <Building2 size={26} />
          </div>
          <div>
            <h3>Siap mengisi arsip kantor?</h3>
            <p>
              Masuk untuk membuka ruang arsip kosong yang terpisah dari semua
              data contoh.
            </p>
          </div>
          <Button onClick={onLogin}>
            Masuk ke arsip kantor <ArrowRight />
          </Button>
        </div>
      )}
      <section className="archive-panel settings-panel">
        <h2>Identitas instansi</h2>
        <img
          className="settings-logo"
          src="/logo-jambi.svg"
          alt="Lambang Provinsi Jambi"
          width="100"
          height="104"
        />
        <dl className="metadata-list">
          <div>
            <dt>Instansi</dt>
            <dd>Dinas Energi dan Sumber Daya Mineral</dd>
          </div>
          <div>
            <dt>Wilayah</dt>
            <dd>Provinsi Jambi</dd>
          </div>
          <div>
            <dt>Ruang arsip</dt>
            <dd>{demo ? "Data contoh (fiktif)" : "Arsip kantor"}</dd>
          </div>
        </dl>
        <a
          href="https://esdm.jambiprov.go.id/"
          target="_blank"
          rel="noreferrer"
          className="source-link"
        >
          Identitas dari situs resmi dinas <ArrowUpRight size={14} />
        </a>
      </section>
      <section className="archive-panel settings-panel">
        <h2>Bidang / unit kerja</h2>
        <p>
          Nama bidang pada perjalanan lama tetap tersimpan meskipun daftar ini
          berubah.
        </p>
        <Field label="Satu bidang per baris">
          <textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={user?.role !== "admin"}
          />
        </Field>
        {user?.role === "admin" ? (
          <Button onClick={save} disabled={busy}>
            Simpan bidang
          </Button>
        ) : (
          <p className="field-hint">
            Pengaturan ini dikelola oleh administrator arsip kantor.
          </p>
        )}
      </section>
      {user?.role === "admin" && (
        <section className="archive-panel settings-panel">
          <div className="section-heading">
            <h2>Akun operator</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdding(!adding)}
            >
              <Plus /> Tambah operator
            </Button>
          </div>
          <p>
            Setiap operator dapat mengelola seluruh arsip dinas. Riwayat
            perubahan mencatat identitas masing-masing.
          </p>
          {adding && (
            <form className="account-form" onSubmit={addUser}>
              <Field label="Nama operator">
                <input name="name" required />
              </Field>
              <Field label="Email">
                <input type="email" name="email" required />
              </Field>
              <Field
                label="Kata sandi awal"
                hint="Minimal 12 karakter. Sampaikan secara pribadi kepada operator."
              >
                <input
                  type="password"
                  name="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
              </Field>
              <Button type="submit" disabled={busy}>
                Buat akun
              </Button>
            </form>
          )}
          <div className="operator-list">
            {users.map((u) => (
              <div key={u.id}>
                <div className="avatar sm">
                  {u.name.slice(0, 2).toUpperCase()}
                </div>
                <span>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </span>
                <span className="status-badge neutral">
                  {u.role === "admin" ? "Administrator" : "Operator"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <ErrorMessage message={error} />
    </div>
  );
}
export function OfficeLogin() {
  return <Login forced standalone onClose={() => {}} />;
}
function OfficialLetterhead({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`auth-kop ${compact ? "compact" : ""}`}>
      <span className="auth-crest">
        <img
          src="/logo-jambi.svg"
          alt="Lambang Provinsi Jambi"
          width="100"
          height="104"
        />
      </span>
      <div className="auth-kop-name">
        <span>Pemerintah Provinsi Jambi</span>
        <strong>Dinas Energi dan Sumber Daya Mineral</strong>
      </div>
    </div>
  );
}
function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    const message = takeSessionNotice();
    if (message) setNotice(message);
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      {notice && (
        <p className="auth-form-notice" role="status">
          {notice}
        </p>
      )}
      <Field label="Email operator">
        <input
          type="email"
          name="email"
          placeholder="nama@instansi.go.id"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>
      <Field label="Kata sandi">
        <span className="auth-password">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            aria-label={
              showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
            }
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </Field>
      <ErrorMessage message={error} />
      <Button className="auth-submit w-full" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : null}
        {busy ? "Memeriksa akun" : "Masuk"}
      </Button>
      <p className="auth-form-note">
        Akun disediakan oleh administrator arsip kantor.
      </p>
    </form>
  );
}
function Login({ forced, onClose, standalone = false }: { forced: boolean; onClose: () => void; standalone?: boolean }) {
  if (standalone) {
    return (
      <main className="auth-page">
        <section className="auth-brand" aria-label="Sambutan">
          <p className="auth-brand-tag">
            <span>Arsip perjalanan dinas</span>
          </p>
          <div className="auth-brand-hero">
            <h1>
              Arsip rapi,
              <br />
              laporan siap.
            </h1>
            <p>
              Surat tugas, rekap biaya, honorarium, dan dokumen perjalanan
              dinas tersimpan dalam satu ruang arsip kantor.
            </p>
          </div>
        </section>
        <section className="auth-side" aria-labelledby="auth-title">
          <div className="auth-brand-mark">
            <span className="auth-crest">
              <img
                src="/logo-jambi.svg"
                alt="Lambang Provinsi Jambi"
                width="100"
                height="104"
              />
            </span>
            <span className="auth-brand-label">
              <strong>Dinas ESDM</strong>
              <span>Provinsi Jambi</span>
            </span>
          </div>
          <div className="auth-panel">
            <h2 id="auth-title">Masuk</h2>
            <p>Masukkan email dan kata sandi operator untuk membuka arsip kantor.</p>
            <LoginForm />
          </div>
          <footer className="auth-foot">
            <span>© {new Date().getFullYear()} Dinas ESDM Provinsi Jambi</span>
            <span>Akses hanya untuk operator terdaftar</span>
          </footer>
        </section>
      </main>
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !forced) onClose();
      }}
    >
      <DialogContent className="login-dialog" showCloseButton={!forced}>
        <DialogHeader className="auth-dialog-head">
          <OfficialLetterhead compact />
          <DialogTitle className="text-lg font-semibold">
            Masuk ke arsip kantor
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Gunakan akun operator yang disediakan administrator.
          </DialogDescription>
        </DialogHeader>
        <LoginForm />
      </DialogContent>
    </Dialog>
  );
}

function ArchiveActions({
  trip,
  onAction,
}: {
  trip: Trip;
  onAction: (action: "detail" | "edit" | "delete") => void;
}) {
  const label = trip.lampiran6 ? trip.participants[0].name : trip.title;
  return (
    <div
      className="archive-actions"
      role="group"
      aria-label={`Tindakan ${label}`}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        title="Lihat detail"
        aria-label={`Detail ${label}`}
        onClick={() => onAction("detail")}
      >
        <Eye size={16} />
        <span>Detail</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Edit arsip"
        aria-label={`Edit ${label}`}
        onClick={() => onAction("edit")}
      >
        <Pencil size={16} />
        <span>Edit</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive"
        title="Hapus arsip"
        aria-label={`Hapus ${label}`}
        onClick={() => onAction("delete")}
      >
        <Trash2 size={16} />
        <span>Hapus</span>
      </Button>
    </div>
  );
}

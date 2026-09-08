"use client";
import { Combobox } from "./ui/combobox";
import { NavbarClock } from "./navbar-clock";
import { buildTripSuggestions } from "@/lib/trip-suggestions";
import { CustomSelect, SelectOption } from "./ui/select";
import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
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
  CalendarDays,
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
  money,
  dateText,
  isComplete,
  paymentLabel,
  docLabels,
} from "@/lib/model";
import { employeeMatches, employeeRankOptions, type Employee, type EmployeeInput } from "@/lib/employees";
import ArchiveGroups from "./archive-groups";
import EmployeeRegister from "./employee-register";
import type { Honorarium } from "@/lib/honorarium";
const HonorariumWorkspace = dynamic(() => import("./honorarium-workspace"));
import { groupArchives, filterArchiveGroups, archiveGroupsForYear, archivesForExport } from "@/lib/archive-groups";
import { exportTrips, downloadTemplate } from "@/lib/export";
const TaskLetters = dynamic(() => import("./task-letters"));
const TripForm = dynamic(() => import("./trip-form"));
const TripDetail = dynamic(() => import("./trip-detail"));
const ImportDialog = dynamic(() => import("./import-dialog"));
export type Section =
  "archives" | "taskLetters" | "reports" | "documents" | "people" | "settings" | "trash" | "honorarium";
const sectionNames: Record<Section, string> = {
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
}: {
  initialTrips: Trip[];
  initialEmployees: Employee[];
  departments: string[];
  user: User | null;
  demo: boolean;
  initialSection?: Section;
  initialHonorariums?: Honorarium[];
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [trips, setTrips] = useState(initialTrips);
  const [departments, setDepartments] = useState(initialDepartments);
  const [section, setSection] = useState<Section>(initialSection);
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
  const go = (s: Section) => {
    if (s === "honorarium" && section !== "honorarium") { window.location.assign("/honorarium"); return; }
    if (section === "honorarium" && s !== "honorarium") { window.location.assign(`/?section=${s}`); return; }
    setSection(s);
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
              src="/logo-esdm-jambi.png"
              alt="Lambang Provinsi Jambi"
              width="371"
              height="57"
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
        <div className="archive-tip">
          <div className="tip-icon">
            <FolderOpen size={19} />
          </div>
          <strong>Arsip lama, lebih tertata.</strong>
          <p>Satukan rekap Excel dan berkas perjalanan dalam satu tempat.</p>
          <button onClick={() => setHelp(true)}>
            Panduan singkat <ArrowUpRight size={14} />
          </button>
        </div>
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
                    window.location.assign("/");
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
              <img src="/logo-esdm-jambi.png" alt="Dinas ESDM Jambi" />
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
        <main className={`workspace-main ${section === "archives" ? "workspace-archives" : ""}`}>
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">Dinas ESDM Provinsi Jambi</div>
              <h1>{sectionNames[section]}</h1>
              <p>
                {section === "archives"
                  ? "Kelola Surat Tugas, rekap pegawai, dan dokumen pertanggungjawaban perjalanan dinas."
                  : section === "taskLetters"
                    ? "Lihat surat tugas, pegawai yang ditugaskan, dan total biaya perjalanannya."
                  : section === "honorarium"
                    ? "Rekap honor penerima, dasar SK, dan potongan pajak dalam satu tempat."
                  : section === "reports"
                    ? "Lihat kembali perjalanan dan realisasi biaya dari tahun ke tahun."
                    : section === "documents"
                      ? "Temukan lampiran digital dan lokasi berkas fisik perjalanan."
                      : section === "people"
                        ? "Kelola data pegawai dan telusuri riwayat perjalanannya."
                        : section === "trash"
                          ? "Arsip yang dihapus tetap tersedia untuk dipulihkan."
                          : "Kelola bidang dan akses operator arsip kantor."}
              </p>
            </div>
            {section === "archives" ? (
              <div className="page-actions">
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <Upload /> Impor Excel
                </Button>
                <Button onClick={() => setEditor("new")}>
                  <Plus /> Tambah arsip
                </Button>
              </div>
            ) : section === "reports" ? (
              <Button
                onClick={() => exportRows()}
                disabled={busy || !filtered.length}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Download />
                )}
                Ekspor laporan
              </Button>
            ) : null}
          </div>
          {["archives", "reports"].includes(section) && (
            <>
              <div className="period-toolbar">
                <div>
                  <CalendarDays size={16} />
                  <label htmlFor="year-filter">Tahun arsip</label>
                  <CustomSelect
                    id="year-filter"
                    value={filters.year}
                    onValueChange={(value) => patchFilters({ year: value })}
                  >
                    <SelectOption value="all">Semua tahun</SelectOption>
                    {years.map((y) => (
                      <SelectOption key={y}>{y}</SelectOption>
                    ))}
                  </CustomSelect>
                </div>
                <span>Berdasarkan tanggal perjalanan</span>
              </div>
              <div className="metrics-strip">
                <div className="metric">
                  <div className="metric-label">
                    <Archive size={15} /> {section === "archives" ? "Perjalanan dinas" : "Total rekap"}
                  </div>
                  <div className="metric-number">
                    {section === "archives" ? yearGroups.length : yearTrips.length}
                    <span>{section === "archives" ? "perjalanan" : "rekap"}</span>
                  </div>
                  <small>
                    {filters.year === "all"
                      ? "Seluruh tahun dalam arsip"
                      : `Dilaksanakan tahun ${filters.year}`}
                  </small>
                </div>
                <div className="metric">
                  <div className="metric-label">
                    <Wallet size={15} /> Total realisasi
                  </div>
                  <div className="metric-number money-number">
                    <span className="currency">Rp</span>
                    {total.toLocaleString("id-ID")}
                  </div>
                  <small>
                    {unknown
                      ? `${unknown} rekap belum memiliki nominal`
                      : "Dari biaya yang tercatat"}
                  </small>
                </div>
                <div className="metric">
                  <div className="metric-label">
                    <Users size={15} /> Pegawai tercatat
                  </div>
                  <div className="metric-number">
                    {
                      new Set(
                        yearTrips.flatMap((t) =>
                          t.participants.map(
                            (p) => p.nip || p.name.toLowerCase(),
                          ),
                        ),
                      ).size
                    }
                    <span>pegawai</span>
                  </div>
                  <small>Dari seluruh bidang</small>
                </div>
                <div className="metric">
                  <div className="metric-label">
                    <CheckCircle2 size={15} /> Rekap lengkap
                  </div>
                  <div className="metric-number">
                    {yearTrips.filter(isComplete).length}
                    <span>dari {yearTrips.length}</span>
                  </div>
                  <div className="mini-progress">
                    <span
                      style={{
                        width: `${yearTrips.length ? (yearTrips.filter(isComplete).length / yearTrips.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          {section === "archives" && (
            <section className="archive-panel">
              <div className="register-heading">
                <div>
                  <h2>
                    Register perjalanan dinas{" "}
                    <span className="count-badge">{filteredGroups.length}</span>
                  </h2>
                  <p>Dikelompokkan per Surat Tugas. Buka rincian untuk melihat uraian lengkap dan rekap setiap pegawai.</p>
                </div>
                <div className="register-tools">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || !filteredGroups.length}
                    onClick={() => exportRows()}
                  >
                    {busy ? <LoaderCircle className="animate-spin" /> : <Download />} Ekspor Excel
                  </Button>
                </div>
              </div>
              <div
                className="register-tabs"
                role="group"
                aria-label="Filter kelengkapan"
              >
                <button
                  aria-pressed={filters.status === "all"}
                  className={filters.status === "all" ? "active" : ""}
                  onClick={() => patchFilters({ status: "all" })}
                >
                  Semua <span>{statusGroups.length}</span>
                </button>
                <button
                  aria-pressed={filters.status === "incomplete"}
                  className={filters.status === "incomplete" ? "active" : ""}
                  onClick={() => patchFilters({ status: "incomplete" })}
                >
                  <span className="tab-dot amber" />
                  Draft{" "}
                  <span>{statusGroups.filter(group => !group.complete).length}</span>
                </button>
                <button
                  aria-pressed={filters.status === "complete"}
                  className={filters.status === "complete" ? "active" : ""}
                  onClick={() => patchFilters({ status: "complete" })}
                >
                  Lengkap <span>{statusGroups.filter(group => group.complete).length}</span>
                </button>
              </div>
              <div className="register-filters">
                <div className="register-search-field">
                  <label htmlFor="archive-search">Cari arsip</label>
                  <div className="search-control">
                    <Search size={17} aria-hidden="true" />
                    <input id="archive-search" ref={searchRef} aria-label="Cari arsip perjalanan" aria-keyshortcuts="/"
                      placeholder="Nomor surat, tujuan, atau nama pegawai…" value={filters.search}
                      onChange={event => patchFilters({ search: event.target.value })} />
                    {filters.search ? <button onClick={() => patchFilters({ search: "" })} aria-label="Hapus pencarian"><X size={15} /></button> : <kbd>/</kbd>}
                  </div>
                </div>
                <div>
                  <label htmlFor="archive-department">Bidang</label>
                  <CustomSelect id="archive-department" value={filters.department} onValueChange={value => patchFilters({ department: value })}>
                    <SelectOption value="all">Semua bidang</SelectOption>
                    {allDepartments.map(department => <SelectOption key={department}>{department}</SelectOption>)}
                  </CustomSelect>
                </div>
                <div>
                  <label htmlFor="archive-month">Bulan perjalanan</label>
                  <CustomSelect id="archive-month" value={filters.month} onValueChange={value => patchFilters({ month: value })}>
                    <SelectOption value="all">Semua bulan</SelectOption>
                    {monthNames.map((month, index) => <SelectOption key={month} value={String(index + 1).padStart(2, "0")}>{month}</SelectOption>)}
                  </CustomSelect>
                </div>
                {filterCount > 0 && <Button className="register-reset" variant="ghost" size="sm" onClick={() => patchFilters({ ...defaultFilters, year: filters.year })}>
                  <RotateCcw /> Hapus filter <span>({filterCount})</span>
                </Button>}
              </div>
              {selectedGroups.length > 0 && (
                <div className="selection-bar register-selection">
                  <span role="status">
                    <CheckCircle2 size={15} /> {selectedGroups.length} perjalanan dipilih · {selectedGroups.reduce((sum, group) => sum + group.trips.length, 0)} rekap
                  </span>
                  {selectedGroups.length < filteredGroups.length && <button onClick={() => setSelected(new Set(filteredGroups.map(group => group.key)))}>
                    Pilih semua {filteredGroups.length} hasil
                  </button>}
                  <button
                    onClick={() =>
                      exportRows(archivesForExport(filteredGroups, selected))
                    }
                    disabled={busy}
                  >
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} Ekspor pilihan
                  </button>
                  <button onClick={() => setSelected(new Set())}>
                    Batal pilih
                  </button>
                </div>
              )}
              <ArchiveGroups
                groups={filteredGroups}
                selected={selected}
                onSelectionChange={setSelected}
                renderActions={trip => <ArchiveActions trip={trip} onAction={action => openArchive(trip.id, action)} />}
                emptyState={
                  <Empty
                    icon={<FolderOpen size={30} />}
                    heading={active.length ? "Tidak ada perjalanan yang cocok" : "Mulai rapikan arsip perjalanan"}
                    description={active.length
                      ? "Coba kata kunci lain atau longgarkan filter pencarian."
                      : "Impor rekap Excel yang sudah ada, atau tambahkan perjalanan lama satu per satu."}
                    action={active.length ? (
                      <Button variant="outline" onClick={() => patchFilters(defaultFilters)}>
                        Reset semua filter
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
          )}
          {section === "taskLetters" && <TaskLetters trips={active} onOpen={(id) => openArchive(id)} />}
          {section === "honorarium" && <HonorariumWorkspace initialRecords={initialHonorariums} employees={people} onToast={setToast} />}
          {section === "reports" && (
            <Reports
              trips={filtered}
              departments={allDepartments}
              filters={filters}
              onFilter={patchFilters}
            />
          )}
          {section === "documents" && (
            <Documents trips={active} onOpen={(id) => openArchive(id)} />
          )}
          {section === "people" && (
            <People
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

function Reports({
  trips,
  departments,
  filters,
  onFilter,
}: {
  trips: Trip[];
  departments: string[];
  filters: Filters;
  onFilter: (f: Partial<Filters>) => void;
}) {
  const groups = departments
    .map((d) => {
      const items = trips.filter((t) => t.department === d);
      return {
        name: d,
        count: items.length,
        total: items.reduce((s, t) => s + (totalCost(t) ?? 0), 0),
        complete: items.filter(isComplete).length,
        unknown: items.filter((t) => totalCost(t) === null).length,
      };
    })
    .filter((g) => g.count);
  const max = Math.max(1, ...groups.map((g) => g.total));
  return (
    <>
      <div className="report-filters">
        <Field label="Bidang">
          <CustomSelect
            value={filters.department}
            onValueChange={(value) => onFilter({ department: value })}
          >
            <SelectOption value="all">Semua bidang</SelectOption>
            {departments.map((d) => (
              <SelectOption key={d}>{d}</SelectOption>
            ))}
          </CustomSelect>
        </Field>
        <Field label="Bulan">
          <CustomSelect
            value={filters.month}
            onValueChange={(value) => onFilter({ month: value })}
          >
            <SelectOption value="all">Semua bulan</SelectOption>
            {monthNames.map((m, i) => (
              <SelectOption value={String(i + 1).padStart(2, "0")} key={m}>
                {m}
              </SelectOption>
            ))}
          </CustomSelect>
        </Field>
        {(filters.search || filters.status !== "all") && (
          <Button
            variant="outline"
            onClick={() => onFilter({ search: "", status: "all" })}
          >
            Hapus filter daftar arsip
          </Button>
        )}
      </div>
      <section className="archive-panel report-panel">
        <div className="register-heading">
          <div>
            <h2>Realisasi per bidang</h2>
            <p>Total biaya perjalanan yang tercatat dalam periode terpilih.</p>
          </div>
          <span className="report-unit">Dalam rupiah</span>
        </div>
        {groups.length ? (
          <div className="report-bars">
            {groups.map((g) => (
              <div className="report-row" key={g.name}>
                <div>
                  <strong>{g.name}</strong>
                  <small>
                    {g.count} rekap · {g.complete} arsip lengkap
                    {g.unknown ? ` · ${g.unknown} biaya belum dicatat` : ""}
                  </small>
                </div>
                <div className="report-track">
                  <span style={{ width: `${(g.total / max) * 100}%` }} />
                </div>
                <b>{money(g.total)}</b>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={<BarChart3 size={28} />}
            heading="Belum ada rekap pada periode ini"
            description="Ubah filter atau tambahkan arsip perjalanan terlebih dahulu."
          />
        )}
      </section>
      <section className="archive-panel mt-5">
        <div className="register-heading">
          <div>
            <h2>Rekap bulanan</h2>
            <p>
              {filters.year === "all"
                ? "Gabungan bulan yang sama dari seluruh tahun."
                : `Perjalanan yang berangkat pada tahun ${filters.year}.`}
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Bulan</th>
                <th>Jumlah rekap</th>
                <th>Catatan pegawai</th>
                <th>Arsip lengkap</th>
                <th className="text-right">Total realisasi</th>
              </tr>
            </thead>
            <tbody>
              {monthNames.map((m, i) => {
                const ts = trips.filter(
                  (t) => Number(t.startDate.slice(5, 7)) === i + 1,
                );
                if (!ts.length) return null;
                return (
                  <tr key={m}>
                    <td>{m}</td>
                    <td>{ts.length}</td>
                    <td>
                      {ts.reduce((s, t) => s + t.participants.length, 0)}{" "}
                      catatan
                    </td>
                    <td>
                      {ts.filter(isComplete).length} / {ts.length}
                    </td>
                    <td className="text-right font-semibold">
                      {money(ts.reduce((s, t) => s + (totalCost(t) ?? 0), 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Documents({
  trips,
  onOpen,
}: {
  trips: Trip[];
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const docs = trips
    .flatMap((t) => t.documents.map((d) => ({ ...d, trip: t })))
    .filter(
      (d) =>
        (kind === "all" || d.kind === kind) &&
        [d.name, d.location, d.trip.title, d.trip.sptNo, docLabels[d.type]]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()),
    );
  return (
    <section className="archive-panel">
      <div className="filter-toolbar">
        <div className="search-control">
          <Search size={17} />
          <input
            aria-label="Cari dokumen"
            placeholder="Cari nama berkas, nomor surat, atau lokasi map…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <CustomSelect
          aria-label="Bentuk dokumen"
          value={kind}
          onValueChange={(value) => setKind(value)}
        >
          <SelectOption value="all">Digital & fisik</SelectOption>
          <SelectOption value="file">Dokumen digital</SelectOption>
          <SelectOption value="physical">Berkas fisik</SelectOption>
        </CustomSelect>
        <span className="muted text-xs">{docs.length} dokumen</span>
      </div>
      {docs.length ? (
        <div className="document-grid">
          {docs.map((d) => (
            <article key={d.id} className="document-card">
              <div>
                <div className={`file-icon ${d.kind}`}>
                  {d.kind === "file" ? (
                    <FileText size={23} />
                  ) : (
                    <FolderOpen size={23} />
                  )}
                </div>
                <span className="status-badge neutral">
                  {d.kind === "file" ? "Digital" : "Fisik"}
                </span>
              </div>
              <h3>{docLabels[d.type]}</h3>
              <p>{d.trip.title}</p>
              <span className="document-location">
                {d.kind === "file" ? d.name : d.location}
              </span>
              <footer>
                <span>{d.trip.startDate.slice(0, 4)}</span>
                <button onClick={() => onOpen(d.trip.id)}>
                  Lihat perjalanan <ArrowUpRight size={14} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<FileText size={28} />}
          heading="Belum ada dokumen yang cocok"
          description="Tambahkan dokumen melalui detail perjalanan, atau ubah pencarian."
        />
      )}
    </section>
  );
}
function People({ trips, people, onOpen, departments, onChange, notify }: {
  trips: Trip[];
  people: Employee[];
  onOpen: (id: string) => void;
  departments: string[];
  onChange: (employee: Employee) => void;
  notify: (message: string) => void;
}) {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("all");
  const [person, setPerson] = useState<Employee | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [editor, setEditor] = useState<Employee | "new" | null>(null);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const match = (p: Employee, t: Trip) => t.participants.some(x => employeeMatches(p, x));
  async function change(person: Employee, restore = false) {
    setBusy(true); setError("");
    try {
      const saved = await api<Employee>(`/api/employees/${person.id}`, {
        method: restore ? "PATCH" : "DELETE", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({version: person.version, ...(restore ? {action: "restore"} : {})}),
      });
      onChange(saved); setRemoving(null);
      notify(restore ? "Pegawai berhasil dipulihkan." : "Pegawai dihapus dari daftar aktif.");
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <EmployeeRegister people={people} trips={trips} query={q} onQueryChange={setQ}
        department={department} onDepartmentChange={setDepartment}
        showDeleted={showDeleted} onDeletedChange={value => {setShowDeleted(value); setError("");}}
        busy={busy} onCreate={() => setEditor("new")} onDetail={setPerson} onEdit={setEditor}
        onRemove={person => {setError(""); setRemoving(person);}} onRestore={person => change(person, true)}
        error={!removing && <ErrorMessage message={error} />} />
      {editor && <EmployeeForm key={editor === "new" ? "new" : editor.id} employee={editor === "new" ? null : editor} departments={departments} onClose={() => setEditor(null)} onSaved={p => {onChange(p); setEditor(null); setShowDeleted(false); setQ(""); setDepartment("all"); notify("Data pegawai berhasil disimpan.");}} />}
      <Dialog open={!!removing} onOpenChange={open => {if (!open && !busy) setRemoving(null);}}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader><DialogTitle>Hapus pegawai?</DialogTitle><DialogDescription>{removing?.name} akan dihapus dari daftar aktif. Arsip perjalanan tetap tersimpan. Pegawai dapat dipulihkan melalui daftar Pegawai terhapus.</DialogDescription></DialogHeader>
          <ErrorMessage message={error} />
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Batal</Button><Button variant="destructive" disabled={busy} onClick={() => removing && change(removing)}>{busy ? "Menghapus…" : "Hapus pegawai"}</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!person}
        onOpenChange={(open) => {
          if (!open) setPerson(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{person?.name}</DialogTitle>
            <DialogDescription>
              Riwayat perjalanan yang tersimpan dalam arsip.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="muted">NIP</dt><dd>{person?.nip || "Belum dicatat"}</dd></div>
            <div><dt className="muted">Jabatan</dt><dd>{person?.position || "Belum dicatat"}</dd></div>
            <div><dt className="muted">Golongan</dt><dd>{person?.rank || "Belum dicatat"}</dd></div>
            <div><dt className="muted">Bidang</dt><dd>{person?.department || "Belum dicatat"}</dd></div>
          </dl>
          {person && !trips.some(t => match(person, t)) && <p className="muted text-sm">Belum ada perjalanan tercatat.</p>}
          <div className="person-history">
            {person &&
              trips
                .filter((t) => match(person, t))
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setPerson(null);
                      onOpen(t.id);
                    }}
                  >
                    <span>
                      <strong>{t.title}</strong>
                      <small>
                        {dateText(t.startDate)} · {t.destination}
                      </small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function EmployeeForm({employee, departments, onClose, onSaved}: {
  employee: Employee | null; departments: string[]; onClose: () => void; onSaved: (p: Employee) => void;
}) {
  const [form, setForm] = useState<EmployeeInput>({name: employee?.name ?? "", nip: employee?.nip ?? "", position: employee?.position ?? "", department: employee?.department ?? "", rank: employee?.rank ?? ""});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const saved = await api<Employee>(employee ? `/api/employees/${employee.id}` : "/api/employees", {
        method: employee ? "PATCH" : "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({...form, ...(employee ? {version: employee.version} : {})}),
      });
      onSaved(saved);
    } catch(e) {setError((e as Error).message);}
    finally {setBusy(false);}
  }
  return <Dialog open onOpenChange={open => {if (!open && !busy) onClose();}}>
    <DialogContent className="employee-form-dialog" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{employee ? "Edit pegawai" : "Tambah pegawai"}</DialogTitle><DialogDescription>Data ini tersedia saat mengisi arsip baru. Identitas pada arsip lama tetap tersimpan.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="grid gap-4">
        <fieldset disabled={busy} className="grid gap-4">
          <Field label="Nama pegawai" required><input autoFocus required maxLength={250} value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></Field>
          <Field label="NIP" hint="Opsional. Masukkan sebagai teks agar angka awal tetap tersimpan."><input maxLength={250} value={form.nip} onChange={e => setForm({...form, nip: e.target.value})} /></Field>
          <Field label="Jabatan"><input maxLength={250} value={form.position} onChange={e => setForm({...form, position: e.target.value})} /></Field>
          <Field label="Golongan" hint="Pilih atau ketik sesuai data kepegawaian. Kosongkan untuk menghapus golongan.">
            <Combobox aria-label="Golongan pegawai" maxLength={1000} value={form.rank} onValueChange={rank => setForm({...form, rank})} options={employeeRankOptions} placeholder="Pilih atau ketik golongan" />
          </Field>
          <Field label="Bidang"><Combobox aria-label="Bidang pegawai" maxLength={250} value={form.department} onValueChange={value => setForm({...form, department: value})} options={departments.map(value => ({value}))} placeholder="Pilih atau ketik bidang" /></Field>
        </fieldset>
        <ErrorMessage message={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan pegawai"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
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
          src="/logo-esdm-jambi.png"
          alt="Logo resmi Dinas ESDM Provinsi Jambi"
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
function Login({ forced, onClose, standalone = false }: { forced: boolean; onClose: () => void; standalone?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      window.location.assign("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const Title = standalone ? "h1" : DialogTitle;
  const Description = standalone ? "p" : DialogDescription;
  const content = (
    <>
        <DialogHeader>
          <div className="login-icon">
            <LockKeyhole size={25} />
          </div>
          <Title className="text-lg font-semibold">Masuk ke arsip kantor</Title>
          <Description className="text-sm text-muted-foreground">
            Gunakan akun operator untuk mengelola arsip perjalanan dinas
            Dinas ESDM Provinsi Jambi.
          </Description>
        </DialogHeader>
        <form onSubmit={submit}>
          <Field label="Email operator">
            <input
              type="email"
              name="email"
              placeholder="Email akun operator"
              autoComplete="username"
              required
              autoFocus
            />
          </Field>
          <Field label="Kata sandi">
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <ErrorMessage message={error} />
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <LockKeyhole size={15} />
            )}
            Masuk
          </Button>
          <p className="field-hint text-center">
            Akun disediakan oleh administrator arsip kantor.
          </p>
        </form>
    </>
  );
  if (standalone) {
    return (
      <main className="office-login-page">
        <section className="office-login-card login-dialog" aria-label="Autentikasi kantor">
          {content}
        </section>
      </main>
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !forced && !busy) onClose();
      }}
    >
      <DialogContent className="login-dialog" showCloseButton={!forced}>
        {content}
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

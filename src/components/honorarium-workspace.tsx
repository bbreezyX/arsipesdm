"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Briefcase, Calculator, ClipboardList, Copy, Eye, FileSpreadsheet, FileText, HandCoins, LoaderCircle, MoreHorizontal, Pencil, Percent, Plus, RotateCcw, Search, Trash2, Wallet } from "lucide-react";
import { honorariumCategories, honorariumTotals, newHonorarium, type Honorarium, type HonorariumInput } from "@/lib/honorarium";
import type { Employee } from "@/lib/employees";
import { exportHonorariums } from "@/lib/honorarium-export";
import { money } from "@/lib/model";
import { api, Empty, ErrorMessage, Field } from "./fields";
import DataRegister from "./data-register";
import HonorariumForm from "./honorarium-form";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";

const getRowId = (record: Honorarium) => record.id;
// Same "Rp" treatment as the archive metric cards: muted currency, bold figure.
const SummaryMoney = ({ value }: { value: number }) => <strong className="money-number"><span className="currency">Rp</span>{value.toLocaleString("id-ID")}</strong>;
export default function HonorariumWorkspace({initialRecords, employees, onToast}: {
  initialRecords: Honorarium[]; employees: Employee[]; onToast: (message: string) => void;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [year, setYear] = useState("all");
  const [deleted, setDeleted] = useState(false);
  const [editor, setEditor] = useState<Honorarium | HonorariumInput | null>(null);
  const [detail, setDetail] = useState<Honorarium | null>(null);
  const [removing, setRemoving] = useState<Honorarium | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const years = [...new Set(records.map(record => record.year))].sort((a, b) => b - a);
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id");
    return records.filter(record => Boolean(record.deletedAt) === deleted && (category === "all" || record.category === category)
      && (year === "all" || String(record.year) === year)
      && [record.recipient, record.skName, record.skNumber, record.department, record.activity, record.program, record.subActivity, record.skPosition, record.recipientDepartment, record.notes]
        .join(" ").toLocaleLowerCase("id").includes(search));
  }, [records, category, year, query, deleted]);
  const totals = visible.reduce((sum, record) => { const value = honorariumTotals(record); return {gross: sum.gross + value.gross, tax: sum.tax + value.tax, net: sum.net + value.net}; }, {gross: 0, tax: 0, net: 0});
  function reset() { setQuery(""); setCategory("all"); setYear("all"); }
  const update = useCallback((record: Honorarium) => { setRecords(current => current.some(r => r.id === record.id) ? current.map(r => r.id === record.id ? record : r) : [record, ...current]); }, []);
  async function reload() {
    setBusy(true); setError("");
    try { setRecords(await api<Honorarium[]>("/api/honorariums", {cache: "no-store"})); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportRows() {
    setBusy(true); setError("");
    try { await exportHonorariums(visible, {year, category, deleted}); onToast(`${visible.length} rekap honorarium diekspor ke Excel.`); }
    catch { setError("Ekspor belum berhasil. Silakan coba lagi."); } finally { setBusy(false); }
  }
  const open = useCallback(async (record: Honorarium, action: "detail" | "edit" | "delete" | "copy") => {
    setBusy(true); setError("");
    try {
      const latest = await api<Honorarium>(`/api/honorariums/${record.id}`, {cache: "no-store"}); update(latest);
      if (action === "detail") setDetail(latest);
      else if (latest.deletedAt) setError("Data sudah dihapus. Buka daftar Terhapus untuk memulihkannya.");
      else if (action === "edit") setEditor(latest);
      else if (action === "delete") setRemoving(latest);
      else {
        setEditor({...newHonorarium(), category: latest.category, year: latest.year, skNumber: latest.skNumber,
          skName: latest.skName, department: latest.department, program: latest.program, activity: latest.activity, subActivity: latest.subActivity});
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [update]);
  const change = useCallback(async (record: Honorarium, restore: boolean) => {
    setBusy(true); setError("");
    try {
      update(await api<Honorarium>(`/api/honorariums/${record.id}`, {method: restore ? "PATCH" : "DELETE", headers: {"Content-Type": "application/json"}, body: JSON.stringify({version: record.version, ...(restore ? {action: "restore"} : {})})}));
      setRemoving(null); onToast(restore ? "Honorarium dipulihkan." : "Honorarium dipindahkan ke daftar Terhapus.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [update, onToast]);
  const actions = useCallback((record: Honorarium) => {
    return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Aksi honorarium ${record.recipient}`}><MoreHorizontal size={17} /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => open(record, "detail")}><Eye size={15} />Lihat detail</DropdownMenuItem>
        {record.deletedAt ? <DropdownMenuItem onSelect={() => change(record, true)}><RotateCcw size={15} />Pulihkan honorarium</DropdownMenuItem> : <>
          <DropdownMenuItem onSelect={() => open(record, "edit")}><Pencil size={15} />Edit honorarium</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open(record, "copy")}><Copy size={15} />Tambah penerima dengan SK ini</DropdownMenuItem>
          <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => open(record, "delete")}><Trash2 size={15} />Hapus honorarium</DropdownMenuItem>
        </>}
      </DropdownMenuContent></DropdownMenu>;
  }, [busy, open, change]);
  const columns = useMemo<ColumnDef<Honorarium>[]>(() => [
    {id: "recipient", accessorKey: "recipient", header: "Penerima honor", size: 240, enableHiding: false,
      cell: ({row}) => <div className="employee-register-identity"><button disabled={busy} className="register-reference" onClick={() => open(row.original, "detail")}>{row.original.recipient}</button><small className="register-cell-note">{row.original.skPosition}</small></div>},
    {id: "skNumber", accessorKey: "skNumber", header: "Dasar SK", size: 235,
      cell: ({row}) => <div className="honorarium-cell"><span>{row.original.skNumber || row.original.skName}</span><small className="register-cell-note">{honorariumCategories[row.original.category]}</small></div>},
    {id: "year", accessorKey: "year", header: "Tahun", size: 90},
    {id: "months", accessorKey: "months", header: "Perhitungan", size: 165, cell: ({row}) => <span className="honorarium-number">{money(row.original.monthlyAmount)} × {row.original.months} bln</span>},
    {id: "gross", accessorFn: r => honorariumTotals(r).gross, header: "Bruto", size: 150, cell: ({row}) => <span className="honorarium-number">{money(honorariumTotals(row.original).gross)}</span>},
    {id: "tax", accessorFn: r => honorariumTotals(r).tax, header: "Pajak", size: 135, cell: ({row}) => <span className="honorarium-number">{money(honorariumTotals(row.original).tax)}</span>},
    {id: "net", accessorFn: r => honorariumTotals(r).net, header: "Netto", size: 150, cell: ({row}) => <strong className="honorarium-number">{money(honorariumTotals(row.original).net)}</strong>},
    {id: "actions", header: "Aksi", size: 70, enableSorting: false, enableHiding: false, cell: ({row}) => actions(row.original)},
  ], [busy, open, actions]);
  const filtersActive = Boolean(query || category !== "all" || year !== "all");
  return <div className="honorarium-workspace">
    <section className="honorarium-summary" aria-label="Ringkasan honorarium sesuai filter"><div><span className="metric-label">{deleted ? <Trash2 size={15} /> : <ClipboardList size={15} />} {deleted ? "Rekap terhapus" : "Rekap sesuai filter"}</span><strong className="count-number">{visible.length}<span>rekap</span></strong><small>{deleted ? "Berada di daftar Terhapus" : year === "all" ? "Seluruh tahun anggaran" : `Tahun anggaran `}</small></div>
      <div><span className="metric-label"><Banknote size={15} /> Total bruto</span><SummaryMoney value={totals.gross} /><small>Sebelum potongan pajak</small></div><div><span className="metric-label"><Percent size={15} /> Total pajak</span><SummaryMoney value={totals.tax} /><small>Sesuai tarif atau nominal dokumen</small></div><div><span className="metric-label"><HandCoins size={15} /> Total netto</span><SummaryMoney value={totals.net} /><small>Diterima penerima honor</small></div>
    </section>
    <section className="archive-panel secondary-register-page honorarium-panel"><div className="register-heading"><div><h2>Daftar honorarium</h2><p>Kelola penerima, dasar SK, dan rincian honor sesuai Lampiran 3.</p></div><div className="honorarium-actions"><Button variant="outline" size="sm" disabled={busy} onClick={reload}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <RotateCcw size={15} />}Muat ulang</Button><Button variant="outline" size="sm" disabled={busy || !visible.length} onClick={exportRows}><FileSpreadsheet size={15} />Ekspor Excel</Button><Button size="sm" disabled={busy} onClick={() => {setError(""); setEditor(newHonorarium());}}><Plus size={15} />Tambah honorarium</Button></div></div>
      <div className="register-tabs" role="group" aria-label="Status honorarium"><button className={!deleted ? "active" : undefined} aria-pressed={!deleted} onClick={() => setDeleted(false)}>Aktif <span>{records.filter(r => !r.deletedAt).length}</span></button><button className={deleted ? "active" : undefined} aria-pressed={deleted} onClick={() => setDeleted(true)}>Terhapus <span>{records.filter(r => r.deletedAt).length}</span></button></div>
      <div className="register-filters honorarium-filters"><div className="register-search-field"><label htmlFor="honorarium-search">Cari honorarium</label><div className="search-control"><Search size={16} /><input id="honorarium-search" placeholder="Nama penerima, nomor SK, atau kegiatan…" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
        <Field label="Jenis honorarium"><CustomSelect value={category} onValueChange={setCategory}><SelectOption value="all">Semua jenis</SelectOption>{Object.entries(honorariumCategories).map(([key, name]) => <SelectOption key={key} value={key}>{name}</SelectOption>)}</CustomSelect></Field>
        <Field label="Tahun anggaran"><CustomSelect value={year} onValueChange={setYear}><SelectOption value="all">Semua tahun</SelectOption>{years.map(value => <SelectOption key={value} value={String(value)}>{value}</SelectOption>)}</CustomSelect></Field>
        {filtersActive && <Button variant="ghost" size="sm" onClick={reset}>Reset filter</Button>}
      </div>
      {!removing && <ErrorMessage message={error} />}
      <DataRegister data={visible} columns={columns} getRowId={getRowId} label="Daftar honorarium" unit="rekap" initialSorting={[{id: "recipient", desc: false}]}
        sortOptions={[{id: "recipient", asc: "Nama A–Z", desc: "Nama Z–A"}, {id: "year", asc: "Tahun terlama", desc: "Tahun terbaru"}, {id: "net", asc: "Netto terendah", desc: "Netto tertinggi"}]}
        emptyState={<Empty icon={<Wallet size={28} />} heading={filtersActive ? "Tidak ada honorarium yang cocok" : deleted ? "Belum ada honorarium terhapus" : "Mulai rekap honorarium"}
          description={filtersActive ? "Sesuaikan pencarian atau filter untuk melihat rekap lainnya." : deleted ? "Honorarium yang dihapus dapat dipulihkan melalui daftar ini." : "Tambahkan penerima pertama. Bruto dan netto akan dihitung dari rincian honor yang diisi."}
          action={<Button variant="outline" onClick={filtersActive ? reset : () => deleted ? setDeleted(false) : setEditor(newHonorarium())}>{filtersActive ? "Reset filter" : deleted ? "Lihat rekap aktif" : "Tambah honorarium pertama"}</Button>} />}
        renderMobile={({original: r}) => <><div className="employee-mobile-heading"><div><button className="register-reference" disabled={busy} onClick={() => open(r, "detail")}>{r.recipient}</button><small className="register-cell-note">{r.skPosition}</small></div>{actions(r)}</div><p className="honorarium-mobile-kind">{honorariumCategories[r.category]}</p><dl className="employee-mobile-meta"><div><dt>Nomor SK</dt><dd>{r.skNumber || "Belum dicatat"}</dd></div><div><dt>Tahun / bulan</dt><dd>{r.year} / {r.months} bulan</dd></div><div><dt>Bruto</dt><dd>{money(honorariumTotals(r).gross)}</dd></div><div><dt>Pajak</dt><dd>{money(honorariumTotals(r).tax)}</dd></div></dl><div className="register-mobile-bottom"><span>Honor netto</span><strong>{money(honorariumTotals(r).net)}</strong></div></>} />
    </section>
    {editor && <HonorariumForm initial={editor} employees={employees} onClose={() => setEditor(null)} onSaved={record => {update(record); setEditor(null); setDeleted(false); reset(); onToast("Honorarium tersimpan.");}} />}
    <Dialog open={Boolean(removing)} onOpenChange={value => { if (!value && !busy) {setRemoving(null); setError("");} }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Hapus honorarium?</DialogTitle><DialogDescription>Rekap {removing?.recipient} tahun {removing?.year} akan dipindahkan ke daftar Terhapus dan dapat dipulihkan.</DialogDescription></DialogHeader><ErrorMessage message={error} /><div className="honorarium-actions"><Button variant="outline" disabled={busy} onClick={() => {setRemoving(null); setError("");}}>Batal</Button><Button variant="destructive" disabled={busy} onClick={() => removing && change(removing, false)}>{busy ? "Menghapus…" : "Hapus honorarium"}</Button></div></DialogContent></Dialog>
    {detail && <Dialog open onOpenChange={value => {if (!value) setDetail(null);}}><DialogContent className="detail-dialog"><DialogHeader>
      <div className="dialog-kicker">{detail.skNumber || "Nomor SK belum dicatat"}<span className={`status-badge ${detail.deletedAt ? "incomplete" : "complete"}`}>{detail.deletedAt ? "Terhapus" : "Aktif"}</span></div>
      <DialogTitle>{detail.recipient}</DialogTitle><DialogDescription>{honorariumCategories[detail.category]} · Tahun {detail.year}{detail.skPosition ? ` · ${detail.skPosition}` : ""}</DialogDescription></DialogHeader>
      <div className="detail-scroll honorarium-detail-scroll">
        <div className="detail-facts">
          <div><FileText /><span>Dasar SK<strong>{detail.skName || "Belum dicatat"}</strong><small>{detail.department || "Unit kerja dalam SK belum dicatat"}</small></span></div>
          <div><Briefcase /><span>Jabatan dalam SK<strong>{detail.skPosition || "Belum dicatat"}</strong><small>{detail.recipientDepartment ? `Unit kerja ${detail.recipientDepartment}` : "Unit kerja penerima belum dicatat"}{detail.echelon ? ` · Eselon ${detail.echelon}` : ""}</small></span></div>
          <div><Calculator /><span>Perhitungan honor<strong>{money(detail.monthlyAmount)} × {detail.months} bulan</strong><small>Bruto {money(honorariumTotals(detail).gross)} · Pajak {money(honorariumTotals(detail).tax)}{detail.taxMode === "percent" ? ` (${detail.taxRate}%)` : ""}</small></span></div>
          <div><HandCoins /><span>Honor netto<strong>{money(honorariumTotals(detail).net)}</strong><small>Setelah potongan pajak</small></span></div>
        </div>
        <dl className="metadata-list">
          {[["Nomor SK", detail.skNumber], ["Nama SK", detail.skName], ["Unit kerja dalam SK", detail.department],
            ...(detail.category === "finance" ? [["Nama program", detail.program]] : []), ["Nama kegiatan", detail.activity],
            ...(detail.category === "finance" ? [["Nama subkegiatan", detail.subActivity], ["Pagu dana yang dikelola", detail.budget === null ? "" : money(detail.budget)]] : []),
            ["Jabatan struktural/fungsional", detail.position], ["Unit kerja penerima", detail.recipientDepartment], ["Eselon", detail.echelon],
            ["Honor per bulan", money(detail.monthlyAmount)], ["Jumlah bulan", String(detail.months)], ["Honor bruto", money(honorariumTotals(detail).gross)],
            ["Pajak", `${money(honorariumTotals(detail).tax)}${detail.taxMode === "percent" ? ` (${detail.taxRate}%)` : ""}`], ["Honor netto", money(honorariumTotals(detail).net)], ["Keterangan", detail.notes]]
            .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Belum dicatat"}</dd></div>)}
        </dl>
      </div>
      <div className="detail-footer"><span className="muted text-xs">Versi {detail.version} · Diperbarui {new Date(detail.updatedAt).toLocaleString("id-ID", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta"})} WIB</span>
        <div className="detail-action-buttons">
          {detail.deletedAt ? <Button variant="outline" disabled={busy} onClick={() => { const record = detail; setDetail(null); void change(record, true); }}><RotateCcw /> Pulihkan honorarium</Button> : <>
            <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => { const record = detail; setDetail(null); setRemoving(record); }}><Trash2 /> Hapus honorarium</Button>
            <Button disabled={busy} onClick={() => { const record = detail; setDetail(null); void open(record, "edit"); }}><Pencil /> Edit honorarium</Button></>}
        </div></div>
    </DialogContent></Dialog>}
  </div>;
}

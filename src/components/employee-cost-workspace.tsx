"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Search, ArrowLeft } from "lucide-react";
import { batchCostColumns, copyRecapAmount, prepareRecap, setRecapAmount, type BatchCostField, type BatchRow, type SharedJourney } from "@/lib/batch-recap";
import { applyDailyAllowance, automaticDailyAllowance } from "@/lib/daily-allowance";
import { changeLodgingMode, lodgingAllowanceDescription } from "@/lib/lodging-allowance";
import { tripDestinations } from "@/lib/destinations";
import { lampiranReview, type Lampiran6 } from "@/lib/lampiran6-schema";
import { money, totalCost, type TripInput } from "@/lib/model";
import { journeyDifferences, recapSectionStates, variedCostFields } from "@/lib/recap-visual-state";
import { RecapStatus } from "./recap-status";
import ArchiveDateInput from "./archive-date-input";
import { Field } from "./fields";
import { NumberField } from "./lampiran6-form";
import RecapCostDetails from "./recap-cost-details";
import AccountCodeField from "./account-code-field";
import type { TripSuggestions } from "@/lib/trip-suggestions";
import { Button } from "./ui/button";
import { CustomSelect, SelectOption } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

const sections = [["main", "Biaya utama"], ["hotel", "Penginapan"], ["vehicle", "Kendaraan / BBM"], ["flight", "Penerbangan"], ["additional", "Biaya lain"]] as const;
type Section = typeof sections[number][0];

export default function EmployeeCostWorkspace({ rows, onChange, onEditArchive, errorKey, activeKey, onActiveChange, onEditJourney, shared, suggestions }: {
  shared: SharedJourney;
  suggestions: TripSuggestions;
  rows: BatchRow[];
  onChange: (update: (rows: BatchRow[]) => BatchRow[]) => void;
  onEditArchive: (key: string) => void;
  onEditJourney: () => void;
  errorKey?: string;
  activeKey?: string;
  onActiveChange: (key: string) => void;
}) {
  const selected = rows.filter(row => row.selected);
  const active = selected.find(row => row.key === activeKey) ?? selected[0];
  const activeIndex = selected.findIndex(row => row.key === active?.key);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<Section>("main");
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState("");
  const [allowanceOpen, setAllowanceOpen] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const editorScroll = useRef<HTMLDivElement>(null);
  const listScroll = useRef<HTMLDivElement>(null);
  const shown = selected.filter(row => [row.input.participants[0].name, row.input.participants[0].nip, row.input.department].join(" ").toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")));
  if (!active) return <p className="cost-evidence-empty">Pilih pegawai pada bagian Perjalanan & pegawai terlebih dahulu.</p>;
  const input = active.input;
  const data = input.lampiran6!;
  const person = input.participants[0];
  const reviews = lampiranReview(data, input.startDate, input.endDate);
  const daily = automaticDailyAllowance(data, tripDestinations(input));
  const categoryStates = recapSectionStates(data);
  const differences = journeyDifferences(input, shared);
  const varied = variedCostFields(selected);
  const activeVaried = [...varied].filter(field => data[field] !== null).length;
  if (activeVaried) categoryStates.main = { ...categoryStates.main, tone: "different", label: `${activeVaried} nominal bervariasi`, description: "Ada nominal terisi yang berbeda antarpegawai terpilih. Perbedaan ini perlu diperiksa, bukan otomatis dianggap salah." };

  function patch(change: (input: TripInput) => TripInput) {
    onChange(current => current.map(row => row.key === active.key ? { ...row, input: change(row.input) } : row));
  }
  function patchData(changes: Partial<Lampiran6>) {
    patch(current => {
      let next = { ...current.lampiran6!, ...changes };
      if ("claimedDays" in changes) {
        if (next.dailyRateMode === "manual" && next.dailyRate !== null)
          next.dailyTotal = next.claimedDays === null ? null : next.dailyRate * next.claimedDays;
        if (next.representationRate !== null)
          next.representationTotal = next.claimedDays === null ? null : next.representationRate * next.claimedDays;
      }
      if ("claimedDays" in changes || "dailyRateMode" in changes) next = applyDailyAllowance(next, tripDestinations(current));
      return prepareRecap({ ...current, lampiran6: next });
    });
  }
  function choose(key: string, focusInput = false) {
    onActiveChange(key); setCopying(false); setNotice("");
    requestAnimationFrame(() => {
      editorHeading.current?.focus({ preventScroll: true });
      editorScroll.current?.scrollTo({ top: 0 });
      listScroll.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
      if (focusInput) Array.from(editorScroll.current?.querySelectorAll<HTMLInputElement>('input:not([disabled]):not([readonly]):not([type="hidden"])') ?? []).find(field => field.getClientRects().length > 0)?.focus({ preventScroll: true });
    });
  }
  function enterNext(event: React.KeyboardEvent) {
    const target = event.target;
    if (event.key !== "Enter" || !(target instanceof HTMLInputElement) || !["text", "number", "date"].includes(target.type) || target.getAttribute("role") === "combobox") return;
    event.preventDefault();
    const fields = Array.from(editorScroll.current?.querySelectorAll<HTMLInputElement>('input:not([disabled]):not([readonly]):not([type="hidden"]):not([type="checkbox"])') ?? []).filter(field => field.getClientRects().length > 0);
    const next = fields[fields.indexOf(target) + (event.shiftKey ? -1 : 1)];
    next?.focus();
  }

  return <div className="employee-cost-workspace">
    <aside className="cost-people-nav" aria-label="Pegawai yang diisi">
      <div className="cost-people-heading"><strong>Pegawai</strong><span>{selected.length} dipilih</span></div>
      <label className="cost-people-search"><Search size={14} /><input type="search" aria-label="Cari pegawai terpilih" placeholder="Cari pegawai…" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
      <div className="cost-people-list" ref={listScroll}>
        {shown.map(row => {
          const known = row.input.costs.length;
          const state = recapSectionStates(row.input.lampiran6!);
          const changes = journeyDifferences(row.input, shared);
          const details = state.hotel.count + state.vehicle.count + state.flight.count + state.additional.count;
          const pending = [state.hotel, state.vehicle, state.flight, state.additional].some(item => item.tone === "different");
          const variedCount = [...varied].filter(field => row.input.lampiran6![field] !== null).length;
          return <button type="button" key={row.key} aria-current={row.key === active.key ? "true" : undefined} data-error={errorKey === row.key} data-recap-tone={pending || changes.length || variedCount ? "different" : details ? "details" : known ? "filled" : "empty"} onClick={() => choose(row.key)}>
            <strong>{row.input.participants[0].name}</strong>
            <span className="cost-nav-total">{money(totalCost(row.input))}</span>
            <span className="recap-row-flags">
              {details > 0 && <RecapStatus tone={pending ? "different" : "details"}>{details} rincian{pending ? " · periksa total" : ""}</RecapStatus>}
              {variedCount > 0 && !changes.length && <RecapStatus tone="different">{variedCount} nominal bervariasi</RecapStatus>}
              {changes.length > 0 && <RecapStatus tone="different" description={`Berbeda dari perjalanan bersama: ${changes.join(", ")}`}>{changes.length} penyesuaian</RecapStatus>}
            </span>
            <small>{errorKey === row.key ? "Perlu diperiksa" : totalCost(row.input) === null ? "Biaya belum dicatat" : `${known} komponen biaya dicatat`}</small>
          </button>;
        })}
        {!shown.length && <p className="cost-search-empty">Nama tidak ditemukan. <button type="button" onClick={() => setSearch("")}>Tampilkan semua</button></p>}
      </div>
      <p className="cost-people-footnote">Isian tetap tersimpan di form saat berpindah pegawai.</p>
    </aside>
    {/* biome-ignore lint/a11y/noStaticElementInteractions: delegasi keydown dari isian di dalamnya, bukan elemen interaktif */}
    <div className="cost-person-editor" onKeyDown={enterNext}>
      <div className="cost-person-header">
        <div className="cost-person-identity"><span className="cost-person-position">Pegawai {activeIndex + 1} dari {selected.length}</span><h3 tabIndex={-1} ref={editorHeading}>{person.name}</h3><div className="cost-identity-meta"><span>{[data.rank, input.department].filter(Boolean).join(" · ")}</span><button type="button" onClick={() => onEditArchive(active.key)}>Identitas & arsip</button></div></div>
        <div className="cost-person-header-right"><span>Total pegawai<strong>{money(totalCost(input))}</strong></span><div className="cost-person-arrows">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Pegawai sebelumnya" disabled={activeIndex === 0} onClick={() => choose(selected[activeIndex - 1].key, true)}><ChevronLeft /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Pegawai berikutnya" disabled={activeIndex === selected.length - 1} onClick={() => choose(selected[activeIndex + 1].key, true)}><ChevronRight /></Button>
          <Button type="button" variant="outline" size="sm" disabled={selected.length < 2} onClick={() => { setCopying(value => !value); setNotice(""); }}>{copying ? <ArrowLeft size={14} /> : <Copy size={14} />}{copying ? "Kembali" : "Salin biaya"}</Button>
        </div></div>
      </div>
      <div className="cost-mobile-picker"><Field label="Pindah pegawai"><CustomSelect aria-label="Pindah pegawai" value={active.key} onValueChange={key => choose(key)}>{selected.map(row => { const states = recapSectionStates(row.input.lampiran6!); const count = states.hotel.count + states.vehicle.count + states.flight.count + states.additional.count; const changed = journeyDifferences(row.input, shared).length; return <SelectOption key={row.key} value={row.key}>{row.input.participants[0].name}{changed ? " · Penyesuaian" : count ? ` · ${count} rincian` : ""}</SelectOption>; })}</CustomSelect></Field></div>
      {differences.length > 0 && <div className="cost-person-differences"><RecapStatus tone="different">Berbeda dari perjalanan bersama</RecapStatus><span>{differences.join(" · ")}</span><button type="button" onClick={() => onEditArchive(active.key)}>Lihat penyesuaian</button></div>}
      {notice && <p className="cost-copy-notice" role="status">{notice}</p>}
      {copying ? <div className="cost-editor-scroll" ref={editorScroll}><CopyEmployeeCost key={active.key} rows={selected} sourceKey={active.key} onCopy={(field, targets) => {
        onChange(current => copyRecapAmount(current, active.key, field, targets));
        setCopying(false); setNotice(`${batchCostColumns.find(([key]) => key === field)![1]} diterapkan ke ${targets.length} pegawai.`);
      }} /></div> : <Tabs value={section} className="cost-category-tabs" onValueChange={value => { setSection(value as Section); editorScroll.current?.scrollTo({ top: 0 }); }}>
        <TabsList className="cost-category-list" aria-label="Bagian biaya pegawai">{sections.map(([key, label]) => <TabsTrigger key={key} value={key} data-recap-tone={categoryStates[key].tone}><span>{label}</span><RecapStatus tone={categoryStates[key].tone} description={categoryStates[key].description}>{categoryStates[key].label}</RecapStatus></TabsTrigger>)}</TabsList>
        <div className="cost-editor-scroll" ref={editorScroll} key={active.key}>
          <TabsContent value="main">
            <AccountCodeField value={input.account} options={suggestions.accounts} className="mb-4"
              onChange={account => patch(current => ({ ...current, account }))} />
            <div className="cost-sppd-fields"><Field label="Nomor SPPD"><input aria-label={`SPPD ${person.name}`} value={input.sppdNo} maxLength={250} placeholder="Isi nomor SPPD pegawai ini" onChange={event => { const sppdNo = event.target.value; patch(current => ({ ...current, sppdNo })); }} /></Field><Field label="Tanggal SPPD"><ArchiveDateInput value={data.sppdDate} onChange={sppdDate => patchData({ sppdDate })} /></Field></div>
            <div className="cost-amount-heading"><h4>Komponen biaya</h4><span>Rupiah · kosong = belum dicatat · 0 = nihil</span></div>
            <div className="cost-amount-grid">{batchCostColumns.map(([field, label]) => <div key={field} className="cost-amount-cell" data-recap-tone={data[field] === null ? "empty" : varied.has(field) ? "different" : "filled"}>
              <NumberField label={field === "landCost" ? "Transport darat / BBM" : field === "waterCost" ? "Transport air" : field === "airCost" ? "Transport udara" : label} readOnly={(field === "dailyTotal" && data.dailyRateMode !== "manual") || (field === "lodgingCost" && data.lodgingMode === "thirty-percent")} value={data[field]} onChange={amount => patch(current => setRecapAmount(current, field, amount))} />
              <span className="cost-amount-caption">{field === "lodgingCost" && data.lodgingMode === "thirty-percent" ? lodgingAllowanceDescription(data) : field === "dailyTotal" && data.dailyRateMode !== "manual" ? daily.rate === null ? daily.reason : data.claimedDays === null ? "Isi jumlah hari untuk menghitung total uang harian." : daily.rate === 0 ? daily.reason : `${money(daily.rate)} × ${data.claimedDays} hari` : data[field] === null ? "Belum dicatat" : money(data[field])}</span>
              {field === "lodgingCost" && <button type="button" className="cost-daily-setup" onClick={() => {
                patch(current => prepareRecap({ ...current, lampiran6: changeLodgingMode(current.lampiran6!, "thirty-percent") }));
                setSection("hotel");
              }}>{data.lodgingMode === "thirty-percent" ? "Atur penginapan 30%" : "Pakai penginapan 30%"}</button>}
              {data[field] !== null && <RecapStatus tone={varied.has(field) ? "different" : "filled"} description={varied.has(field) ? "Nominal terisi pada komponen ini bervariasi antarpegawai terpilih. Nilai kosong tidak dibandingkan." : undefined}>{varied.has(field) ? "Bervariasi antarpegawai" : data[field] === 0 ? "Nihil dicatat" : field === "dailyTotal" && data.dailyRateMode !== "manual" ? "Dihitung otomatis" : "Nominal dicatat"}</RecapStatus>}
              {field === "dailyTotal" && data.dailyRateMode !== "manual" && data.dailyTotal === null && <button className="cost-daily-setup" type="button" onClick={onEditJourney}>Atur perjalanan & kategori bersama</button>}
            </div>)}</div>
            <details className="cost-allowance-settings" open={allowanceOpen} onToggle={event => setAllowanceOpen(event.currentTarget.open)}><summary>Perhitungan uang harian <span>{data.dailyRateMode === "manual" ? "Manual" : data.dailyRateMode === "diklat" ? "Diklat" : data.dailyRateMode === "dalam-kota" ? "Dalam kota >8 jam" : data.dailyRateMode === "dalam-kota-singkat" ? "Dalam kota ≤8 jam" : "Otomatis"} · {data.claimedDays ?? "—"} hari</span></summary><div className="form-grid">
              <Field label="Cara menghitung"><CustomSelect value={data.dailyRateMode} onValueChange={dailyRateMode => patchData({ dailyRateMode: dailyRateMode as Lampiran6["dailyRateMode"] })}><SelectOption value="auto">Otomatis berdasarkan perjalanan</SelectOption><SelectOption value="dalam-kota">Dalam kota lebih dari 8 jam</SelectOption><SelectOption value="dalam-kota-singkat">Dalam kota sampai 8 jam · uang harian nihil</SelectOption><SelectOption value="diklat">Diklat</SelectOption><SelectOption value="manual">Manual sesuai arsip</SelectOption></CustomSelect></Field>
              <NumberField label="Jumlah hari pegawai ini" value={data.claimedDays} onChange={claimedDays => patchData({ claimedDays })} />
            </div><p className="field-hint">{data.dailyRateMode === "manual" ? "Isi total uang harian pada komponen biaya." : daily.reason || "Tarif mengikuti perhitungan perjalanan. Sesuaikan melalui mode manual bila diperlukan."}</p></details>
            <div className="cost-detail-shortcuts">{([["hotel", "Rincian hotel"], ["vehicle", "Kendaraan & BBM"], ["flight", "Tiket pesawat"], ["additional", "Biaya tambahan"]] as const).map(([key, label]) => <button type="button" key={key} data-recap-tone={categoryStates[key].tone} onClick={() => setSection(key)}>{label}<span><RecapStatus tone={categoryStates[key].tone} description={categoryStates[key].description}>{categoryStates[key].label}</RecapStatus><ChevronRight size={14} /></span></button>)}</div>
            {data.additionalCosts.length > 0 && <dl className="cost-additional-preview">{data.additionalCosts.map((cost, index) => <div key={index}><dt>{cost.label || "Biaya tambahan"}</dt><dd>{money(cost.amount)}</dd></div>)}</dl>}
          </TabsContent>
          {sections.filter(([key]) => key !== "main").map(([key]) => <TabsContent key={key} value={key}><RecapCostDetails data={data} personName={person.name} section={key as "hotel" | "vehicle" | "flight" | "additional"} onChange={patchData} /></TabsContent>)}
          {reviews.length > 0 && <details className="cost-review-hints"><summary>{reviews.length} catatan untuk diperiksa</summary><ul>{reviews.map(note => <li key={note}>{note}</li>)}</ul></details>}
        </div>
      </Tabs>}
      <div className="cost-person-bottom"><span>Tab / Enter untuk lanjut isian</span>{activeIndex < selected.length - 1 ? <Button type="button" variant="outline" size="sm" onClick={() => choose(selected[activeIndex + 1].key, true)}>Pegawai berikutnya<ChevronRight size={14} /></Button> : <span>Pegawai terakhir · lanjut ke Tinjau rekap</span>}</div>
    </div>
  </div>;
}

function CopyEmployeeCost({ rows, sourceKey, onCopy }: { rows: BatchRow[]; sourceKey: string; onCopy: (field: BatchCostField, targets: string[]) => void }) {
  const [field, setField] = useState<BatchCostField>("dailyTotal");
  const [targets, setTargets] = useState<string[]>([]);
  const source = rows.find(row => row.key === sourceKey)!;
  const candidates = rows.filter(row => row.key !== sourceKey);
  const amount = source.input.lampiran6![field];
  return <section className="cost-copy-editor">
    <h4>Salin satu komponen biaya</h4><p>Pilih penerima. Nominal komponen ini akan menggantikan nominal lama pada pegawai yang dicentang.</p>
    <Field label="Komponen yang disalin"><CustomSelect value={field} onValueChange={value => setField(value as BatchCostField)}>{batchCostColumns.map(([key, label]) => <SelectOption key={key} value={key}>{label}</SelectOption>)}</CustomSelect></Field>
    <div className="cost-copy-source"><span>Dari {source.input.participants[0].name}</span><strong>{money(amount)}</strong></div>
    {amount === null && <p className="field-hint">Sumber belum memiliki nominal. Isi biaya sumber terlebih dahulu.</p>}
    <label className="batch-select-all"><input type="checkbox" checked={candidates.length > 0 && candidates.every(row => targets.includes(row.key))} ref={node => { if (node) node.indeterminate = targets.length > 0 && !candidates.every(row => targets.includes(row.key)); }} onChange={event => setTargets(event.currentTarget.checked ? candidates.map(row => row.key) : [])} />Pilih semua penerima</label>
    <div className="cost-copy-recipients">{candidates.map(row => <label key={row.key}><input type="checkbox" checked={targets.includes(row.key)} onChange={event => { const checked = event.currentTarget.checked; setTargets(current => checked ? [...current, row.key] : current.filter(key => key !== row.key)); }} /><span><strong>{row.input.participants[0].name}</strong><small>Saat ini: {money(row.input.lampiran6![field])}</small></span></label>)}</div>
    <Button type="button" disabled={amount === null || targets.length === 0} onClick={() => onCopy(field, targets.filter(key => candidates.some(row => row.key === key)))}>Terapkan ke {targets.length} pegawai</Button>
  </section>;
}

"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { batchCostColumns, copyRecapAmount, setRecapAmount, type BatchCostField, type BatchRow, type SharedJourney } from "@/lib/batch-recap";
import { lodgingAllowanceDescription } from "@/lib/lodging-allowance";
import { money, totalCost } from "@/lib/model";
import { journeyDifferences, recapSectionStates, variedCostFields } from "@/lib/recap-visual-state";
import { RecapStatus } from "./recap-status";

/* Biaya beberapa pegawai sebagai tabel: satu baris per orang, satu kolom per
   komponen. Di ponsel setiap orang menjadi kartu dengan isian yang sama. */

type Row = BatchRow & { index: number };

function isLocked(row: BatchRow, field: BatchCostField) {
  const data = row.input.lampiran6!;
  return (field === "dailyTotal" && data.dailyRateMode !== "manual") || (field === "lodgingCost" && data.lodgingMode === "thirty-percent");
}

function lockNote(row: BatchRow, field: BatchCostField) {
  return field === "lodgingCost" ? lodgingAllowanceDescription(row.input.lampiran6!) : "Dihitung dari perjalanan bersama. Ubah lewat Rincian.";
}

function AmountInput({ value, label, readOnly, varied, title, onChange, ...position }: {
  value: number | null;
  label: string;
  readOnly: boolean;
  varied: boolean;
  title?: string;
  onChange: (value: number | null) => void;
  "data-row"?: number;
  "data-col"?: number;
}) {
  return <input
    className="grid-amount"
    inputMode="numeric"
    aria-label={label}
    title={title}
    readOnly={readOnly}
    data-varied={varied || undefined}
    value={value === null ? "" : value.toLocaleString("id-ID")}
    placeholder="—"
    {...position}
    onChange={event => {
      const input = event.currentTarget;
      const fromEnd = input.value.length - (input.selectionStart ?? input.value.length);
      const digits = input.value.replace(/\D/g, "");
      onChange(digits === "" ? null : Math.min(Number(digits), 1_000_000_000_000));
      // Titik ribuan menggeser panjang teks; kursor dijaga dari ujung kanan.
      requestAnimationFrame(() => {
        const at = Math.max(0, input.value.length - fromEnd);
        input.setSelectionRange(at, at);
      });
    }}
  />;
}

export default function BatchCostGrid({ rows, shared, errorKey, onChange, onDetails }: {
  rows: BatchRow[];
  shared: SharedJourney;
  errorKey?: string;
  onChange: (update: (rows: BatchRow[]) => BatchRow[]) => void;
  onDetails: (key: string) => void;
}) {
  const selected: Row[] = rows.filter(row => row.selected).map((row, index) => ({ ...row, index }));
  const varied = variedCostFields(rows);
  const known = selected.filter(row => totalCost(row.input) !== null);
  const grandTotal = known.length ? known.reduce((sum, row) => sum + (totalCost(row.input) ?? 0), 0) : null;
  const [notice, setNotice] = useState("");

  function setAmount(key: string, field: BatchCostField, amount: number | null) {
    setNotice("");
    onChange(current => current.map(row => row.key === key ? { ...row, input: setRecapAmount(row.input, field, amount) } : row));
  }
  function setSppd(key: string, sppdNo: string) {
    onChange(current => current.map(row => row.key === key ? { ...row, input: { ...row.input, sppdNo } } : row));
  }
  /** Samakan: nominal teratas yang terisi di kolom, untuk baris lain yang bisa diubah dan masih berbeda. */
  function fillPlan(field: BatchCostField) {
    const source = selected.find(row => row.input.lampiran6![field] !== null);
    if (!source) return null;
    const amount = source.input.lampiran6![field];
    const targets = selected.filter(row => row.key !== source.key && !isLocked(row, field) && row.input.lampiran6![field] !== amount);
    return targets.length ? { source, amount, targets } : null;
  }
  function fillColumn(field: BatchCostField, label: string) {
    const plan = fillPlan(field);
    if (!plan) return;
    onChange(current => copyRecapAmount(current, plan.source.key, field, plan.targets.map(row => row.key)));
    setNotice(`${label} ${money(plan.amount)} diterapkan ke ${plan.targets.length} orang.`);
  }
  // Enter turun ke baris berikutnya di kolom yang sama, seperti lembar kerja; formulir tidak ikut terkirim.
  function enterDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || target.tagName !== "INPUT") return;
    event.preventDefault();
    const row = Number(target.dataset.row), col = Number(target.dataset.col);
    const table = event.currentTarget;
    const below = table.querySelector<HTMLInputElement>(`input[data-row="${row + (event.shiftKey ? -1 : 1)}"][data-col="${col}"]`)
      ?? table.querySelector<HTMLInputElement>(`input[data-row="0"][data-col="${col + 1}"]`);
    below?.focus();
    below?.select();
  }

  function identity(row: Row) {
    const person = row.input.participants[0];
    const differences = journeyDifferences(row.input, shared);
    return <>
      <strong>{person.name}</strong>
      <small>{[row.input.lampiran6!.rank, row.input.department].filter(Boolean).join(" · ") || "Identitas belum lengkap"}</small>
      {(differences.length > 0 || errorKey === row.key) && <span className="recap-row-flags">
        {errorKey === row.key && <RecapStatus tone="different">Perlu diperiksa</RecapStatus>}
        {differences.length > 0 && <RecapStatus tone="different" description={`Berbeda dari perjalanan bersama: ${differences.join(", ")}`}>{differences.length} penyesuaian</RecapStatus>}
      </span>}
    </>;
  }
  function detailsButton(row: Row) {
    const states = recapSectionStates(row.input.lampiran6!);
    const count = states.hotel.count + states.vehicle.count + states.flight.count + states.additional.count;
    return <button type="button" className="grid-details" aria-label={`Rincian ${row.input.participants[0].name}`} data-rincian={row.key} onClick={() => onDetails(row.key)}>
      Rincian{count > 0 && <span>{count}</span>}<ChevronRight size={14} />
    </button>;
  }
  function amountCell(row: Row, field: BatchCostField, label: string, col: number) {
    const data = row.input.lampiran6!;
    const locked = isLocked(row, field);
    return <AmountInput value={data[field]} label={`${label} ${row.input.participants[0].name}`} readOnly={locked}
      title={locked ? lockNote(row, field) : undefined} varied={varied.has(field) && data[field] !== null}
      data-row={row.index} data-col={col} onChange={amount => setAmount(row.key, field, amount)} />;
  }

  if (!selected.length) return <p className="field-hint">Pilih peserta terlebih dahulu.</p>;
  return <div className="batch-cost-grid">
    {/* biome-ignore lint/a11y/noStaticElementInteractions: delegasi Enter dari isian di dalam tabel */}
    <div className="grid-scroll" onKeyDown={enterDown}>
      <table>
        <thead>
          <tr>
            <th scope="col">Pegawai</th>
            <th scope="col" className="grid-text-col">No. SPPD</th>
            {batchCostColumns.map(([field, label]) => {
              const plan = fillPlan(field);
              const describe = plan && `Isi ${plan.targets.length} baris lain dengan ${money(plan.amount)} (dari ${plan.source.input.participants[0].name})`;
              return <th scope="col" key={field}>
                {label}
                {plan ? <button type="button" aria-label={`${label}: ${describe}`} title={describe ?? undefined} onClick={() => fillColumn(field, label)}>Samakan</button>
                  : field === "dailyTotal" && selected.every(row => isLocked(row, field)) ? <small>otomatis</small>
                  // Penahan tempat agar tinggi kepala tabel tidak melompat saat tombol muncul.
                  : <small aria-hidden="true" className="grid-fill-empty">Samakan</small>}
              </th>;
            })}
            <th scope="col">Total</th>
            <th scope="col"><span className="sr-only">Rincian</span></th>
          </tr>
        </thead>
        <tbody>
          {selected.map(row => <tr key={row.key} data-error={errorKey === row.key || undefined}>
            <th scope="row">{identity(row)}</th>
            <td className="grid-text-col"><input className="grid-text" aria-label={`Nomor SPPD ${row.input.participants[0].name}`} value={row.input.sppdNo} maxLength={250}
              placeholder="—" data-row={row.index} data-col={0} onChange={event => setSppd(row.key, event.target.value)} /></td>
            {batchCostColumns.map(([field, label], col) => <td key={field}>{amountCell(row, field, label, col + 1)}</td>)}
            <td className="grid-total">{money(totalCost(row.input))}</td>
            <td>{detailsButton(row)}</td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{selected.length} orang</th>
            <td colSpan={batchCostColumns.length + 1} />
            <td className="grid-total">{money(grandTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
    <div className="grid-cards">
      {selected.map(row => <section key={row.key} className="grid-card" data-error={errorKey === row.key || undefined} aria-label={row.input.participants[0].name}>
        <header>
          <div>{identity(row)}</div>
          <strong className="grid-total">{money(totalCost(row.input))}</strong>
        </header>
        <div className="grid-card-fields">
          <label className="grid-card-wide"><span>No. SPPD</span><input className="grid-text" value={row.input.sppdNo} maxLength={250} placeholder="—" onChange={event => setSppd(row.key, event.target.value)} /></label>
          {batchCostColumns.map(([field, label]) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: isian ada di dalam AmountInput
            <label key={field}><span>{label}</span>
            <AmountInput value={row.input.lampiran6![field]} label={`${label} ${row.input.participants[0].name}`} readOnly={isLocked(row, field)} title={isLocked(row, field) ? lockNote(row, field) : undefined}
              varied={varied.has(field) && row.input.lampiran6![field] !== null} onChange={amount => setAmount(row.key, field, amount)} />
          </label>))}
        </div>
        {detailsButton(row)}
      </section>)}
    </div>
    {notice && <p className="grid-notice" role="status">{notice}</p>}
    <p className="field-hint">Rupiah. Kosong berarti belum dicatat, 0 berarti memang tidak ada. Tanggal SPPD, kode rekening, dan bukti hotel atau kendaraan ada di Rincian.</p>
  </div>;
}

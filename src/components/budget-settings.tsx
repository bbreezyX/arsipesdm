"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Budget } from "@/lib/budgets";
import { ErrorMessage, Field, api } from "./fields";
import { Button } from "./ui/button";

const empty: Budget = { program: "", activityName: "", subActivity: "" };

/** Daftar paket program & anggaran yang dipilih pada formulir rekap. Operator dan administrator dapat mengubahnya. */
export default function BudgetSettings({ budgets, setBudgets, editable, notify }: {
  budgets: Budget[];
  setBudgets: (budgets: Budget[]) => void;
  editable: boolean;
  notify: (message: string) => void;
}) {
  /** Nomor paket yang sedang diubah, "new" untuk paket baru. */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Budget>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(list: Budget[], message: string) {
    setBusy(true);
    setError("");
    try {
      setBudgets(await api<Budget[]>("/api/budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(list),
      }));
      setEditing(null);
      notify(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(index: number | "new") {
    setDraft(index === "new" ? empty : budgets[index]);
    setEditing(index);
    setError("");
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const list = editing === "new" ? [...budgets, draft] : budgets.map((budget, index) => index === editing ? draft : budget);
    save(list, editing === "new" ? "Paket anggaran ditambahkan." : "Paket anggaran diperbarui.");
  }

  const editor = <form className="budget-settings-form" onSubmit={submit}>
    <Field label="Nama program" required>
      <input required maxLength={1000} value={draft.program} onChange={e => setDraft({ ...draft, program: e.target.value })} />
    </Field>
    <Field label="Nama kegiatan anggaran">
      <input maxLength={1000} value={draft.activityName} onChange={e => setDraft({ ...draft, activityName: e.target.value })} />
    </Field>
    <Field label="Nama subkegiatan">
      <input maxLength={1000} value={draft.subActivity} onChange={e => setDraft({ ...draft, subActivity: e.target.value })} />
    </Field>
    <div className="budget-settings-actions">
      <Button type="submit" disabled={busy}>Simpan paket</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Batal</Button>
    </div>
  </form>;

  return <section className="archive-panel settings-panel">
    <div className="section-heading">
      <h2>Program &amp; anggaran</h2>
      {editable && editing === null && <Button variant="outline" size="sm" onClick={() => open("new")}><Plus /> Tambah paket</Button>}
    </div>
    <p>Setiap paket muncul sebagai pilihan pada formulir rekap. Rekap yang sudah tersimpan tidak berubah bila daftar ini diubah.</p>
    {editing === "new" && editor}
    <div className="budget-settings-list">
      {budgets.map((budget, index) => editing === index ? <div key="editing">{editor}</div> :
        <div key={`${budget.program}|${budget.activityName}|${budget.subActivity}`} className="budget-settings-row">
          <span>
            <strong>{budget.program}</strong>
            {budget.activityName && <span>{budget.activityName}</span>}
            {budget.subActivity && <small>{budget.subActivity}</small>}
          </span>
          {editable && editing === null && <span className="budget-settings-row-actions">
            <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${budget.program}`} onClick={() => open(index)}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Hapus ${budget.program}`} disabled={busy}
              onClick={() => save(budgets.filter((_, i) => i !== index), "Paket anggaran dihapus.")}><Trash2 /></Button>
          </span>}
        </div>)}
      {!budgets.length && editing !== "new" && <p className="budget-settings-empty">Belum ada paket anggaran.</p>}
    </div>
    <ErrorMessage message={error} />
  </section>;
}

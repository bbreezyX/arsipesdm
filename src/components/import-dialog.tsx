"use client";
import { OnboardingHint } from "./onboarding";
import { Combobox } from "./ui/combobox";
import { CustomSelect, SelectOption } from "./ui/select";
import { useMemo, useState } from "react";
import type { WorkBook } from "xlsx";
import {
  FileSpreadsheet,
  Upload,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Download,
  LoaderCircle,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Field, ErrorMessage, api } from "./fields";
import {
  importFields,
  suggestMapping,
  convertRows,
  detectHeaderRow,
  isSummaryRow,
  type Mapping,
} from "@/lib/import";
import { fingerprint, money, totalCost, type Trip } from "@/lib/model";
import { downloadTemplate } from "@/lib/export";
import {
  convertLampiran6,
  lampiranHeaderRow,
  lampiranDepartment,
} from "@/lib/lampiran6-import";
export default function ImportDialog({
  existing,
  onClose,
  onImported,
  departments,
}: {
  existing: Trip[];
  onClose: () => void;
  onImported: (trips: Trip[]) => void;
  departments: string[];
}) {
  const [book, setBook] = useState<WorkBook | null>(null);
  const [filename, setFilename] = useState("");
  const [sheet, setSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [grid, setGrid] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Mapping>(suggestMapping([]));
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [department, setDepartment] = useState("");
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const isLampiran = !!(book && sheet && lampiranHeaderRow(book.Sheets[sheet]));
  const [result, setResult] = useState<{
    added: Trip[];
    skipped: number;
  } | null>(null);
  const headers = useMemo(
    () => (grid[headerRow - 1] ?? []).map((x) => String(x ?? "").trim()),
    [grid, headerRow],
  );
  async function selectSheet(b: WorkBook, name: string, row?: number) {
    const XLSX = await import("xlsx");
    const data = XLSX.utils.sheet_to_json<unknown[]>(b.Sheets[name], {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true,
    });
    row ??= detectHeaderRow(data);
    setGrid(data);
    setSheet(name);
    setDepartment(lampiranDepartment(b.Sheets[name]));
    setReviewAccepted(false);
    setHeaderRow(row);
    setMapping(
      suggestMapping((data[row - 1] ?? []).map((x) => String(x ?? "").trim())),
    );
  }
  async function readFile(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Ukuran Excel maksimal 20 MB.");
      if (!/\.(xlsx|xls|csv)$/i.test(file.name))
        throw new Error("Pilih berkas .xlsx, .xls, atau .csv.");
      const XLSX = await import("xlsx");
      const b = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
        sheetRows: 10005,
      });
      if (!b.SheetNames.length)
        throw new Error("Tidak ditemukan lembar kerja.");
      setBook(b);
      setFilename(file.name);
      await selectSheet(
        b,
        b.SheetNames.find((name) => lampiranHeaderRow(b.Sheets[name])) ??
          (b.Sheets.Perjadin && b.Sheets.Perjalanan ? "Perjalanan" : undefined) ??
          b.SheetNames[0],
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = useMemo(
    () =>
      isLampiran && book
        ? convertLampiran6(book.Sheets[sheet], filename, sheet, department)
        : grid
            .slice(headerRow)
            .flatMap((cells, i) =>
              cells.some((x) => String(x ?? "").trim() !== "") &&
              !isSummaryRow(cells)
                ? convertRows(
                    [
                      Object.fromEntries(
                        headers.map((h, j) => [h, cells[j] ?? ""]),
                      ),
                    ],
                    mapping,
                    filename,
                    sheet,
                    headerRow + i + 1,
                  )
                : [],
            ),
    [
      grid,
      headers,
      mapping,
      headerRow,
      filename,
      sheet,
      isLampiran,
      book,
      department,
    ],
  );
  const seen = new Set(existing.filter((t) => !t.deletedAt).map(fingerprint));
  const duplicateRows = new Set<number>();
  for (const row of rows) {
    if (row.trip && !row.errors.length) {
      const key = fingerprint(row.trip);
      if (seen.has(key)) duplicateRows.add(row.row);
      else seen.add(key);
    }
  }
  const errors = rows.filter((r) => r.errors.length);
  const reviewRows = rows.filter((r) => r.warnings?.length);
  const ready = rows.filter(
    (r) => r.trip && !r.errors.length && !duplicateRows.has(r.row),
  );
  const mappingMissing = importFields.filter(
    ([k, , required]) => required && !mapping[k],
  );
  async function commit() {
    if (reviewRows.length && !reviewAccepted) {
      setError(
        "Periksa catatan pada pratinjau sebelum menyimpan nilai sumber.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ added: Trip[]; skipped: number }>(
        "/api/archives/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: rows
              .filter((r) => r.trip && !r.errors.length)
              .map((r) => ({ trip: r.trip, source: r.source })),
          }),
        },
      );
      setResult(res);
      onImported(res.added);
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const next = () => {
    setError("");
    if (!isLampiran && mappingMissing.length) {
      setError(
        "Hubungkan kolom: " +
          mappingMissing.map(([, label]) => label).join(", "),
      );
      return;
    }
    if (
      !isLampiran &&
      new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length
    ) {
      setError(
        "Ada nama kolom yang sama pada Excel. Ubah nama kolom agar unik sebelum mengimpor.",
      );
      return;
    }
    if (!rows.length || rows.length > 1000) {
      setError(
        "Pilih lembar berisi 1–1.000 perjalanan. Bagi berkas yang lebih besar terlebih dahulu.",
      );
      return;
    }
    setStep(2);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="import-dialog">
        <DialogHeader>
          <div className="dialog-kicker">
            <FileSpreadsheet size={16} /> Impor arsip lama
          </div>
          <DialogTitle>
            {step === 3 ? "Impor selesai" : "Pindahkan rekap Excel ke arsip"}
          </DialogTitle>
          <DialogDescription>
            Periksa isi dan kolomnya terlebih dahulu. Data disimpan setelah kamu
            konfirmasi.
          </DialogDescription>
        </DialogHeader>
        <div className="import-steps">
          {["Pilih file & kolom", "Periksa data", "Selesai"].map((t, i) => (
            <div
              className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
              key={t}
            >
              <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>
              {t}
            </div>
          ))}
        </div>
        <div className="import-scroll">
          {step === 1 && <OnboardingHint id="import-excel" />}
          {step === 1 && (
            <>
              <label
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0])
                    readFile(e.dataTransfer.files[0]);
                }}
              >
                <div className="excel-icon">
                  <FileSpreadsheet size={26} />
                </div>
                <strong>
                  {filename || "Pilih atau tarik file Excel ke sini"}
                </strong>
                <span>
                  {filename
                    ? "Klik untuk mengganti berkas"
                    : ".xlsx, .xls, atau .csv · Maksimal 20 MB"}
                </span>
                <input
                  aria-label="File Excel untuk diimpor"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files?.[0]) readFile(e.target.files[0]);
                  }}
                />
                {busy && <LoaderCircle className="animate-spin" />}
              </label>
              <div className="template-link">
                <span>Belum punya format rekap?</span>
                <button
                  type="button"
                  onClick={() =>
                    downloadTemplate().catch(() =>
                      setError("Template gagal diunduh. Coba lagi."),
                    )
                  }
                >
                  <Download size={14} /> Unduh template Excel
                </button>
              </div>
              {book && (
                <>
                  <div className="form-grid">
                    <Field label="Lembar kerja">
                      <CustomSelect
                        value={sheet}
                        onValueChange={(value) => selectSheet(book, value)}
                      >
                        {book.SheetNames.map((s) => (
                          <SelectOption key={s}>{s}</SelectOption>
                        ))}
                      </CustomSelect>
                    </Field>
                    {isLampiran ? (
                      <Field
                        label="Bidang / unit kerja"
                        required
                        hint="Diambil dari judul SKPD pada Excel; sesuaikan bila perlu."
                      >
                        <Combobox
                          aria-label="Bidang / unit kerja impor"
                          value={department}
                          onValueChange={(value) => {setDepartment(value); setReviewAccepted(false);}}
                          options={departments.map(value => ({value}))}
                          placeholder="Pilih atau ketik bidang"
                        />
                      </Field>
                    ) : (
                      <Field
                        label="Baris judul kolom"
                        hint="Misalnya 3 jika judul kolom ada di baris ketiga."
                      >
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={headerRow}
                          onChange={(e) => {
                            const n = Math.max(
                              1,
                              Math.min(50, Number(e.target.value) || 1),
                            );
                            setHeaderRow(n);
                            setMapping(
                              suggestMapping(
                                (grid[n - 1] ?? []).map((x) =>
                                  String(x ?? "").trim(),
                                ),
                              ),
                            );
                          }}
                        />
                      </Field>
                    )}
                  </div>
                  {isLampiran ? (
                    <div className="recognized-format">
                      <FileSpreadsheet size={21} />
                      <div>
                        <strong>Format rekap perjalanan dinas dikenali</strong>
                        <p>
                          {rows.length} entri pegawai · Luar daerah dalam
                          provinsi
                        </p>
                        <p>
                          Identitas, ST/SPPD, biaya, penginapan, dan
                          transportasi dibaca dari kolom aslinya. Sel gabungan
                          dan rincian lanjutan ikut ditangani.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mapping-heading">
                        <h3>Sesuaikan kolom</h3>
                        <span>{rows.length} baris ditemukan</span>
                      </div>
                      <p className="section-note">
                        Satu baris untuk satu perjalanan. Pisahkan nama pegawai
                        dengan titik koma (;).
                      </p>
                      <div className="column-mapping">
                        {importFields.map(([key, label, required]) => (
                          <Field key={key} label={label} required={required}>
                            <CustomSelect
                              value={mapping[key]}
                              onValueChange={(value) =>
                                setMapping((m) => ({
                                  ...m,
                                  [key]: value,
                                }))
                              }
                            >
                              <SelectOption value="">
                                {required
                                  ? "Pilih kolom Excel"
                                  : "Tidak tersedia"}
                              </SelectOption>
                              {headers.filter(Boolean).map((h, i) => (
                                <SelectOption key={i}>{h}</SelectOption>
                              ))}
                            </CustomSelect>
                          </Field>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="preview-summary">
                <div>
                  <strong>{ready.length}</strong>
                  <span>Siap diimpor</span>
                </div>
                <div>
                  <strong>{duplicateRows.size}</strong>
                  <span>Duplikat, akan dilewati</span>
                </div>
                <div className={errors.length ? "text-danger" : ""}>
                  <strong>{errors.length}</strong>
                  <span>Perlu diperbaiki</span>
                </div>
              </div>
              {isLampiran && (
                <div className="inline-note">
                  <AlertCircle size={16} />
                  <span>
                    Satu entri = satu pegawai dalam satu perjalanan. Jumlah
                    komponen biaya, total rincian sumber, dan total kuitansi
                    tetap terpisah. Total kuitansi tidak dianggap sebagai
                    pembayaran.
                  </span>
                </div>
              )}
              {reviewRows.length > 0 && (
                <div className="lampiran-review">
                  <strong>
                    {reviewRows.length} entri memiliki catatan pemeriksaan
                  </strong>
                  <p>
                    Buka catatan pada setiap baris. Nilai rincian dan kuitansi
                    sumber dipertahankan; rekap realisasi menggunakan jumlah
                    komponen biaya.
                  </p>
                </div>
              )}
              {errors.length > 0 && (
                <div className="error-message">
                  <AlertCircle size={17} />
                  <span>
                    Perbaiki baris bermasalah di Excel atau sesuaikan pemetaan
                    kolom, lalu periksa lagi.
                  </span>
                </div>
              )}
              <div className="import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>
                        {isLampiran ? "Pegawai / perjalanan" : "Perjalanan"}
                      </th>
                      <th>Tanggal</th>
                      <th className="text-right">
                        {isLampiran ? "Komponen biaya" : "Realisasi"}
                      </th>
                      <th>Hasil pemeriksaan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>
                          {isLampiran && r.trip && (
                            <strong>{r.trip.participants[0].name}</strong>
                          )}
                          <span className="preview-title">
                            {r.trip?.title || "Data belum valid"}
                          </span>
                          <small>{r.trip?.destination}</small>
                          {r.trip?.lampiran6 &&
                            r.trip.lampiran6.sourceRows.length > 1 && (
                              <small>
                                Dengan baris lanjutan{" "}
                                {r.trip.lampiran6.sourceRows
                                  .slice(1)
                                  .join(", ")}
                              </small>
                            )}
                        </td>
                        <td>{r.trip?.startDate || "—"}</td>
                        <td className="text-right">
                          {r.trip ? money(totalCost(r.trip)) : "—"}
                          {r.trip?.lampiran6 && (
                            <>
                              <small>
                                Rincian: {money(r.trip.lampiran6.recordedTotal)}
                              </small>
                              <small>
                                Kuitansi: {money(r.trip.lampiran6.receiptTotal)}
                              </small>
                            </>
                          )}
                        </td>
                        <td>
                          {r.errors.length ? (
                            <span className="preview-error">
                              {r.errors.join(" ")}
                            </span>
                          ) : duplicateRows.has(r.row) ? (
                            <span className="status-badge neutral">
                              Duplikat
                            </span>
                          ) : r.warnings?.length ? (
                            <details className="row-review">
                              <summary>{r.warnings.length} catatan</summary>
                              <ul>
                                {r.warnings.map((note, i) => (
                                  <li key={i}>{note}</li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <span className="status-badge complete">Siap</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reviewRows.length > 0 && (
                <label className="review-acceptance">
                  <input
                    type="checkbox"
                    checked={reviewAccepted}
                    onChange={(e) => setReviewAccepted(e.target.checked)}
                  />
                  <span>
                    Saya telah memeriksa catatan dan ingin menyimpan nilai
                    sumber beserta catatan pemeriksaannya.
                  </span>
                </label>
              )}
              <div className="inline-note">
                <AlertCircle size={16} />
                <span>
                  Lampiran ditambahkan setelah impor. Biaya kosong tetap
                  ditandai belum diketahui.
                </span>
              </div>
            </>
          )}
          {step === 3 && result && (
            <div className="import-success">
              <div>
                <CheckCircle2 size={38} />
              </div>
              <h3>
                {result.added.length}{" "}
                {isLampiran ? "entri pegawai" : "perjalanan"} berhasil
                diarsipkan
              </h3>
              <p>
                {result.skipped
                  ? `${result.skipped} perjalanan duplikat dilewati. `
                  : ""}
                Nama berkas, lembar kerja, dan nomor baris asal tersimpan pada
                setiap arsip.
              </p>
              <p className="muted">
                Dokumen pendukung opsional. Data dan biaya bisa direkap tanpa lampiran.
              </p>
            </div>
          )}
        </div>
        <div className="form-footer">
          <ErrorMessage message={error} />
          <div className="footer-actions">
            <Button
              variant="ghost"
              onClick={() => (step === 2 ? setStep(1) : onClose())}
              disabled={busy}
            >
              {step === 2 ? (
                <>
                  <ArrowLeft /> Kembali
                </>
              ) : (
                "Tutup"
              )}
            </Button>
            {step === 1 ? (
              <Button onClick={next} disabled={!book || busy}>
                Periksa data <ArrowRight />
              </Button>
            ) : step === 2 ? (
              <Button
                onClick={commit}
                disabled={
                  busy ||
                  !!errors.length ||
                  !ready.length ||
                  (!!reviewRows.length && !reviewAccepted)
                }
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
                {busy
                  ? "Mengimpor…"
                  : `Impor ${ready.length} ${isLampiran ? "entri pegawai" : "perjalanan"}`}
              </Button>
            ) : (
              <Button onClick={onClose}>
                Lihat arsip <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

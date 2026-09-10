"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";
import type { GroundTransport } from "@/lib/lampiran6-schema";
import { uniqueVehicles, vehicleKey, vehicleSchema, type SavedVehicle } from "@/lib/vehicles";
import { api, ErrorMessage, Field } from "./fields";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";

const vehicleSavedEvent = "archive-vehicle-saved";

export default function VehicleIdentityFields({ value, onChange }: {
  value: GroundTransport;
  onChange: (changes: Partial<GroundTransport>) => void;
}) {
  const [vehicles, setVehicles] = useState<SavedVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    let savedDuringLoad: SavedVehicle[] = [];
    function receive(event: Event) {
      const vehicle = (event as CustomEvent<SavedVehicle>).detail;
      savedDuringLoad = uniqueVehicles([vehicle, ...savedDuringLoad]);
      setVehicles(current => uniqueVehicles([vehicle, ...current]));
    }
    window.addEventListener(vehicleSavedEvent, receive);
    setLoading(true); setLoadError("");
    api<SavedVehicle[]>("/api/vehicles", { cache: "no-store" })
      .then(result => { if (active) setVehicles(uniqueVehicles([...savedDuringLoad, ...result])); })
      .catch(() => { if (active) setLoadError("Daftar kendaraan belum berhasil dimuat. Isian manual tetap dapat digunakan."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener(vehicleSavedEvent, receive); };
  }, [reload]);

  const parsed = vehicleSchema.safeParse(value);
  const existing = vehicles.find(vehicle => vehicleKey(vehicle.provider) === vehicleKey(value.provider));
  const unchanged = parsed.success && existing && JSON.stringify(existing) === JSON.stringify(parsed.data);
  async function save() {
    if (!parsed.success || saving) return;
    setSaving(true); setSaveError("");
    try {
      const saved = await api<SavedVehicle>("/api/vehicles", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      window.dispatchEvent(new CustomEvent(vehicleSavedEvent, { detail: saved }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kendaraan gagal disimpan. Coba lagi.");
    } finally { setSaving(false); }
  }

  return <>
    <Field label="Jenis transport darat">
      <Combobox aria-label="Jenis transport darat" value={value.mode} maxLength={1000}
        onValueChange={mode => onChange({ mode })}
        options={["Travel", "Bus", "Taksi", "Kendaraan pribadi", "Mobil pribadi", "Mobil dinas", "Kereta"].map(value => ({ value }))}
        placeholder="Pilih atau ketik jenis transport" />
    </Field>
    <Field label="Nama penyedia / pelat kendaraan">
      <Combobox aria-label="Nama penyedia / pelat kendaraan" value={value.provider} maxLength={1000}
        onValueChange={provider => onChange({ provider })}
        onOptionSelect={option => {
          const vehicle = vehicles.find(item => item.provider === option.value);
          if (vehicle) onChange(vehicle);
        }}
        options={vehicles.map(vehicle => ({ value: vehicle.provider, description: [vehicle.vehicleType, vehicle.mode, vehicle.fuelType].filter(Boolean).join(" · ") }))}
        placeholder="Pilih kendaraan atau ketik pelat baru"
        emptyMessage={loading ? "Memuat kendaraan…" : "Belum ada kendaraan yang cocok."} />
    </Field>
    <Field label="Jenis mobil">
      <Combobox aria-label="Jenis mobil" value={value.vehicleType} maxLength={1000}
        options={[...vehicles.map(vehicle => vehicle.vehicleType), "Toyota Avanza", "Toyota Innova", "Toyota Fortuner", "Toyota Hilux", "Daihatsu Xenia", "Mitsubishi Xpander", "Mitsubishi Pajero Sport", "Mitsubishi Triton", "Suzuki Ertiga"].map(value => ({ value }))}
        onValueChange={vehicleType => onChange({ vehicleType })} placeholder="Pilih atau ketik jenis / model mobil" />
    </Field>
    <Field label="Jenis BBM">
      <Combobox aria-label="Jenis BBM" value={value.fuelType} maxLength={1000}
        options={[...vehicles.map(vehicle => vehicle.fuelType).filter(Boolean), "Pertalite", "Pertamax", "Pertamax Turbo", "Solar", "Dexlite", "Pertamina Dex"].map(value => ({ value }))}
        onValueChange={fuelType => onChange({ fuelType })} placeholder="Pilih atau ketik jenis BBM" />
    </Field>
    <div className="vehicle-save-row span-2">
      <p className="field-hint">Simpan pelat, jenis mobil, dan BBM untuk dipilih pada rekap berikutnya.</p>
      <Button type="button" variant="outline" size="sm" onClick={save} disabled={!parsed.success || saving || Boolean(unchanged)}>
        {saving ? <LoaderCircle className="spin" /> : unchanged ? <Check /> : <Save />}
        {saving ? "Menyimpan…" : unchanged ? "Kendaraan tersimpan" : existing ? "Perbarui kendaraan" : "Simpan kendaraan"}
      </Button>
    </div>
    {loadError && <div className="span-2"><ErrorMessage message={loadError} /><Button type="button" variant="outline" size="sm" onClick={() => setReload(current => current + 1)}>Muat ulang kendaraan</Button></div>}
    {saveError && <div className="span-2"><ErrorMessage message={saveError} /></div>}
  </>;
}

"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

/** Konfirmasi di dalam aplikasi sebelum isian dibuang. window.confirm bisa diblokir
 *  peramban tanpa pesan dan selalu menjawab "tidak", sehingga formulir tidak bisa ditutup. */
export function useDiscardConfirm() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const ask = (action: () => void) => setPending(() => action);
  const dialog = <Dialog open={pending !== null} onOpenChange={open => { if (!open) setPending(null); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Batalkan perubahan?</DialogTitle><DialogDescription>Isian yang belum disimpan akan hilang.</DialogDescription></DialogHeader>
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="outline" onClick={() => setPending(null)}>Lanjutkan mengisi</Button>
        <Button variant="destructive" onClick={() => { const action = pending; setPending(null); action?.(); }}>Buang perubahan</Button>
      </div>
    </DialogContent>
  </Dialog>;
  return { ask, dialog };
}

"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LockKeyhole, LogOut, TimerReset } from "lucide-react";
import { IDLE_LIMIT_MS, WARNING_MS, type SessionInfo } from "@/lib/session-policy";
import {
  SESSION_ACTIVITY_EVENT,
  SESSION_EXPIRED_EVENT,
  SESSION_EXPIRED_MESSAGE,
  SESSION_LIMIT_MESSAGE,
  lockSession,
} from "@/lib/session-client";
import { sectionPaths } from "@/lib/workspace-navigation";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

/** Aktivitas pengguna memperpanjang idle di server paling cepat setiap interval ini. */
const ACTIVITY_TOUCH_MS = 2 * 60 * 1000;
/** Pemeriksaan status ke server setelah tenggat lewat tidak diulang lebih cepat dari ini. */
const VERIFY_RETRY_MS = 5 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "input", "scroll"] as const;

type Deadlines = { idle: number; absolute: number };
type Phase = "active" | "warning" | "expired";

/** Konversi waktu server ke jam browser; hanya untuk tampilan, bukan otorisasi. */
function toClientClock(info: SessionInfo): Deadlines {
  const offset = Date.now() - info.now;
  return { idle: info.idleExpiresAt + offset, absolute: info.absoluteExpiresAt + offset };
}
function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Pengendali sesi di browser: peringatan menjelang batas tidak aktif, tombol Lanjutkan bekerja,
 * dan penutupan tampilan setelah server menolak sesi. Server tetap penentu akses.
 */
export default function SessionGuard({ session }: { session: SessionInfo }) {
  const [deadlines, setDeadlines] = useState(() => toClientClock(session));
  const [phase, setPhase] = useState<Phase>("active");
  const [remaining, setRemaining] = useState(0);
  const [snoozed, setSnoozed] = useState(false);
  const [busy, setBusy] = useState(false);
  const phaseRef = useRef<Phase>("active");
  const lastTouch = useRef(Date.now());
  const nextVerify = useRef(0);
  const pending = useRef(false);
  const absoluteFirst = deadlines.absolute <= deadlines.idle;

  function lock(message?: string) {
    if (phaseRef.current === "expired") return;
    phaseRef.current = "expired";
    setPhase("expired");
    lockSession(message);
  }
  function apply(info: SessionInfo) {
    lastTouch.current = Date.now();
    const next = toClientClock(info);
    setDeadlines(next);
    if (phaseRef.current === "warning" && Math.min(next.idle, next.absolute) - Date.now() > WARNING_MS) {
      phaseRef.current = "active";
      setPhase("active");
      setSnoozed(false);
    }
  }
  async function call(method: "GET" | "PATCH") {
    if (pending.current) return;
    pending.current = true;
    try {
      const response = await fetch("/api/session", { method, cache: "no-store" });
      if (response.status === 401) {
        lock(absoluteFirst ? SESSION_LIMIT_MESSAGE : SESSION_EXPIRED_MESSAGE);
        return;
      }
      if (response.ok) apply((await response.json()) as SessionInfo);
    } catch {
      // Jaringan terputus: biarkan timer mencoba lagi; tanpa konfirmasi server tampilan tidak dibuka lebih lama.
    } finally {
      pending.current = false;
    }
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current === "expired") return;
      const now = Date.now();
      const left = Math.min(deadlines.idle, deadlines.absolute) - now;
      if (left <= 0) {
        setRemaining(0);
        if (now >= nextVerify.current) {
          nextVerify.current = now + VERIFY_RETRY_MS;
          void call("GET");
        }
        return;
      }
      if (left <= WARNING_MS) {
        setRemaining(left);
        if (phaseRef.current !== "warning") {
          phaseRef.current = "warning";
          setPhase("warning");
        }
      } else if (phaseRef.current === "warning") {
        phaseRef.current = "active";
        setPhase("active");
        setSnoozed(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadlines]);

  useEffect(() => {
    const onExpired = () => lock();
    const onApiActivity = () => {
      lastTouch.current = Date.now();
      setDeadlines((d) => ({ ...d, idle: Math.min(Date.now() + IDLE_LIMIT_MS, d.absolute) }));
    };
    const onUserActivity = () => {
      if (phaseRef.current !== "active" || document.visibilityState !== "visible") return;
      if (Date.now() - lastTouch.current < ACTIVITY_TOUCH_MS) return;
      lastTouch.current = Date.now();
      void call("PATCH");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener(SESSION_ACTIVITY_EVENT, onApiActivity);
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onUserActivity, { passive: true });
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener(SESSION_ACTIVITY_EVENT, onApiActivity);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onUserActivity);
    };
  }, []);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
    } finally {
      window.location.assign(sectionPaths.home);
    }
  }

  if (phase === "expired") {
    return (
      <div className="session-lock" role="alert" aria-live="assertive">
        <LockKeyhole size={22} />
        <p>{absoluteFirst ? SESSION_LIMIT_MESSAGE : SESSION_EXPIRED_MESSAGE}</p>
        <LoaderCircle className="animate-spin" size={18} />
      </div>
    );
  }
  return (
    <Dialog
      open={phase === "warning" && !snoozed}
      onOpenChange={(open) => {
        if (!open && absoluteFirst) setSnoozed(true);
      }}
    >
      <DialogContent showCloseButton={absoluteFirst}>
        <DialogHeader>
          <DialogTitle>Sesi akan berakhir</DialogTitle>
          <DialogDescription>
            {absoluteFirst
              ? `Batas waktu sesi tercapai dalam ${countdown(remaining)}. Simpan pekerjaan Anda, lalu masuk kembali untuk melanjutkan.`
              : `Sesi akan berakhir dalam ${countdown(remaining)} karena tidak ada aktivitas.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" disabled={busy} onClick={logout}>
            <LogOut /> Keluar
          </Button>
          {!absoluteFirst && (
            <Button
              autoFocus
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await call("PATCH");
                setBusy(false);
              }}
            >
              <TimerReset /> Lanjutkan bekerja
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

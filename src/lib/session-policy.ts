/**
 * Kebijakan waktu sesi. Server memegang keputusan akhir; angka di sini juga dikirim ke
 * browser hanya untuk menampilkan peringatan.
 * Rancangan: docs/research/session-policy-draft.md (Tahap 1).
 */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const ABSOLUTE_LIMIT_MS = 8 * 60 * 60 * 1000;
export const WARNING_MS = 2 * 60 * 1000;
/** Perpanjangan idle di database dilakukan paling cepat setiap interval ini. */
export const TOUCH_INTERVAL_MS = 60 * 1000;

export type SessionRow = { expires: number | string; last_activity: number | string | null };
export type SessionInfo = { now: number; idleExpiresAt: number; absoluteExpiresAt: number };

/**
 * Menilai baris sesi pada waktu `now`. Sesi lama tanpa `last_activity` dianggap habis
 * (kebijakan migrasi: pengguna diminta masuk kembali sekali).
 */
export function evaluateSession(row: SessionRow, now: number): SessionInfo | null {
  const absoluteExpiresAt = Number(row.expires);
  if (row.last_activity === null || row.last_activity === undefined) return null;
  const idleExpiresAt = Math.min(Number(row.last_activity) + IDLE_LIMIT_MS, absoluteExpiresAt);
  if (!(absoluteExpiresAt > now) || !(idleExpiresAt > now)) return null;
  return { now, idleExpiresAt, absoluteExpiresAt };
}

/** Perlu menulis `last_activity` baru? Dibatasi agar tidak setiap request menulis ke database. */
export function shouldTouch(row: SessionRow, now: number) {
  return now - Number(row.last_activity) >= TOUCH_INTERVAL_MS;
}

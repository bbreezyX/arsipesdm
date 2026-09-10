/** Penanganan sesi di browser: 401 terpusat dan pesan setelah sesi habis. Hanya dipakai di sisi klien. */
export const SESSION_EXPIRED_EVENT = "archive-session-expired";
export const SESSION_ACTIVITY_EVENT = "archive-session-activity";
export const SESSION_EXPIRED_MESSAGE =
  "Sesi berakhir karena tidak ada aktivitas. Masuk kembali untuk melanjutkan.";
export const SESSION_LIMIT_MESSAGE =
  "Batas waktu sesi tercapai. Masuk kembali untuk melanjutkan.";
const NOTICE_KEY = "archive-session-notice";

/**
 * Dipanggil setiap jalur fetch ke API bisnis. 401 berarti sesi ditolak server; respons sukses
 * berarti server baru saja memperpanjang batas tidak aktif. Endpoint sesi sendiri dikecualikan
 * karena 401 di sana bisa berarti kata sandi salah.
 */
export function reportSessionResponse(url: string, response: Response) {
  if (typeof window === "undefined" || url.startsWith("/api/session")) return;
  if (response.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  else if (response.ok) window.dispatchEvent(new Event(SESSION_ACTIVITY_EVENT));
}

/** Menutup tampilan: simpan alasan untuk halaman login, lalu muat ulang agar server merender login. */
export function lockSession(message = SESSION_EXPIRED_MESSAGE) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    // Penyimpanan tab tidak tersedia; login tetap ditampilkan tanpa pesan alasan.
  }
  window.location.reload();
}

/** Mengambil pesan alasan sekali pakai untuk ditampilkan di form login. */
export function takeSessionNotice() {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY) ?? "";
    sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return "";
  }
}

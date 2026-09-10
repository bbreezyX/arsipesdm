import { reportSessionResponse } from "./session-client";

/** The server checks export permission and loads the selected records from the user's workspace. */
export async function downloadArchiveExport(ids: string[], label: string) {
  const endpoint = "/api/archives/export";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, label }),
  });
  reportSessionResponse(endpoint, response);
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ekspor belum berhasil. Silakan coba lagi.");
  }
  const filename = response.headers.get("Content-Disposition")?.split("filename*=UTF-8''")[1];
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename ? decodeURIComponent(filename) : "REKAP ARSIP PERJALANAN.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

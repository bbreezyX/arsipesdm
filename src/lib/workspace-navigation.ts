export const sectionPaths = {
  home: "/",
  archives: "/arsip-perjalanan",
  taskLetters: "/surat-tugas",
  reports: "/rekap-laporan",
  documents: "/dokumen",
  people: "/pegawai",
  settings: "/pengaturan",
  trash: "/sampah",
  honorarium: "/honorarium",
} as const;

export type Section = keyof typeof sectionPaths;

export function isSection(value: string): value is Section {
  return Object.hasOwn(sectionPaths, value);
}

export function sectionFromPath(pathname: string): Section | undefined {
  return (Object.keys(sectionPaths) as Section[]).find(section => sectionPaths[section] === pathname);
}

/** Halaman rincian satu rekap: kode PD/2026/0062 menjadi /arsip-perjalanan/PD-2026-0062. */
export function archiveRecordPath(code: string) {
  return `${sectionPaths.archives}/${encodeURIComponent(code.replaceAll("/", "-"))}`;
}

/** Kode rekap dari alamat halaman rincian, atau undefined bila alamat itu bukan halaman rincian. */
export function archiveRecordFromPath(pathname: string): string | undefined {
  const prefix = `${sectionPaths.archives}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const segment = pathname.slice(prefix.length);
  if (!segment || segment.includes("/")) return undefined;
  return decodeURIComponent(segment).replaceAll("-", "/");
}

const legacyPaths: Record<string, Section> = {
  "/task-letters": "taskLetters", "/reports": "reports",
  "/documents": "documents", "/people": "people", "/settings": "settings", "/trash": "trash",
};

export function legacySectionFromPath(pathname: string): Section | undefined {
  return Object.hasOwn(legacyPaths, pathname) ? legacyPaths[pathname] : undefined;
}

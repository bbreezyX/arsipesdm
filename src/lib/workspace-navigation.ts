export const sectionPaths = {
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

const legacyPaths: Record<string, Section> = {
  "/": "archives", "/task-letters": "taskLetters", "/reports": "reports",
  "/documents": "documents", "/people": "people", "/settings": "settings", "/trash": "trash",
};

export function legacySectionFromPath(pathname: string): Section | undefined {
  return Object.hasOwn(legacyPaths, pathname) ? legacyPaths[pathname] : undefined;
}

export const sectionPaths = {
  archives: "/",
  taskLetters: "/task-letters",
  reports: "/reports",
  documents: "/documents",
  people: "/people",
  settings: "/settings",
  trash: "/trash",
  honorarium: "/honorarium",
} as const;

export type Section = keyof typeof sectionPaths;

export function isSection(value: string): value is Section {
  return Object.hasOwn(sectionPaths, value);
}

export function sectionFromPath(pathname: string): Section | undefined {
  return (Object.keys(sectionPaths) as Section[]).find(section => sectionPaths[section] === pathname);
}

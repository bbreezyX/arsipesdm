/** Plain nonnegative decimals: both Indonesian comma and dot are accepted. */
export function parseDecimalInput(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === "" || text === "," || text === ".") return null;
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return undefined;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

export function formatDecimalInput(value: number | null) {
  return value === null ? "" : String(value).replace(".", ",");
}

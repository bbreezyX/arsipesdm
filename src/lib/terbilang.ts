const small = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
const scales: [number, string][] = [[1e12, "triliun"], [1e9, "miliar"], [1e6, "juta"], [1e3, "ribu"]];

function words(n: number): string {
  if (n < 12) return small[n];
  if (n < 20) return `${words(n - 10)} belas`;
  if (n < 100) return join(words(Math.floor(n / 10)), "puluh", n % 10);
  if (n < 200) return join("", "seratus", n % 100);
  if (n < 1000) return join(words(Math.floor(n / 100)), "ratus", n % 100);
  if (n < 2000) return join("", "seribu", n % 1000);
  for (const [scale, name] of scales) {
    if (n >= scale) return join(words(Math.floor(n / scale)), name, n % scale);
  }
  return "";
}

function join(head: string, unit: string, rest: number) {
  const lead = head ? `${head} ${unit}` : unit;
  return rest ? `${lead} ${words(rest)}` : lead;
}

/** Nilai rupiah dalam kata, seperti baris "Terbilang" pada kuitansi: 1.500 → "Seribu lima ratus rupiah". */
export function terbilang(amount: number) {
  const whole = Math.floor(Math.abs(amount));
  const text = whole === 0 ? "nol" : words(whole);
  const signed = amount < 0 ? `minus ${text}` : text;
  return `${signed.charAt(0).toUpperCase()}${signed.slice(1)} rupiah`;
}

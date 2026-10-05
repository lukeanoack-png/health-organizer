/** Value normalization: dates, doses, frequencies. Pure functions, no domain judgment. */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Matches yyyy-mm-dd, mm/dd/yyyy, and "March 4, 2026"/"Mar 4 2026". */
export const DATE_PATTERN =
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b|\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;

export function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const all = findDates(s);
  return all.length ? all[0].iso : null;
}

export function findDates(s: string): { iso: string; index: number; raw: string }[] {
  const out: { iso: string; index: number; raw: string }[] = [];
  const re = new RegExp(DATE_PATTERN.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let v: string | null = null;
    if (m[1]) v = iso(+m[1], +m[2], +m[3]);
    else if (m[4]) v = iso(+m[6], +m[4], +m[5]);
    else if (m[7]) v = iso(+m[9], MONTHS[m[7].slice(0, 3).toLowerCase()], +m[8]);
    if (v) out.push({ iso: v, index: m.index, raw: m[0] });
  }
  return out;
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "Undated";
  const [y, m, d] = isoDate.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} ${d}, ${y}`;
}

const FREQUENCIES: [RegExp, string][] = [
  [/\b(twice daily|twice a day|bid|b\.i\.d\.|two times daily|every 12 hours|q12h)\b/i, "twice daily"],
  [/\b(three times daily|tid|t\.i\.d\.|every 8 hours|q8h)\b/i, "three times daily"],
  [/\b(nightly|at bedtime|qhs|q\.h\.s\.|every evening|in the evening)\b/i, "nightly"],
  [/\b(as needed|prn|p\.r\.n\.)\b/i, "as needed"],
  [/\b(weekly|once weekly|every week)\b/i, "weekly"],
  [/\b(once daily|daily|every day|qd|q\.d\.|every morning|qam|once a day)\b/i, "once daily"],
];

export function normalizeFrequency(s: string): string | undefined {
  for (const [re, label] of FREQUENCIES) if (re.test(s)) return label;
  return undefined;
}

export const DOSE_PATTERN = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|units?|ml|meq)\b/i;

export function parseDose(s: string): { amount: number; unit: string } | null {
  const m = s.match(DOSE_PATTERN);
  if (!m) return null;
  let unit = m[2].toLowerCase();
  if (unit === "unit") unit = "units";
  if (unit === "ml") unit = "mL";
  if (unit === "meq") unit = "mEq";
  return { amount: Number(m[1]), unit };
}

export function doseLabel(amount?: number, unit?: string, freq?: string): string | null {
  if (amount === undefined) return freq ?? null;
  return [`${amount} ${unit ?? ""}`.trim(), freq].filter(Boolean).join(" ");
}

/** Small stable hash for deterministic IDs (FNV-1a, base36). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

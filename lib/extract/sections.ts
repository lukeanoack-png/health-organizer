/**
 * Splits a document into sections and items, keeping character offsets for every item
 * so each extracted fact can point at its exact supporting passage.
 */

export type SectionKind =
  | "medications"
  | "allergies"
  | "conditions"
  | "labs"
  | "findings"
  | "exam"
  | "procedures"
  | "plan"
  | "narrative"
  | "other";

export interface Item {
  text: string;
  start: number;
  end: number;
  bullet: boolean;
}

export interface Section {
  title: string; // as written, e.g. "CURRENT MEDICATIONS"
  kind: SectionKind;
  items: Item[];
}

const KIND_RULES: [RegExp, SectionKind][] = [
  [/MEDICATION|\bMEDS\b|PRESCRIPTION/, "medications"],
  [/ALLERG/, "allergies"],
  [/PROBLEM|PAST MEDICAL|\bPMH\b|DIAGNOS|ACTIVE CONDITIONS/, "conditions"],
  [/\bLABS?\b|LABORATORY|RESULTS/, "labs"],
  [/FINDINGS/, "findings"],
  [/^EXAM$|STUDY|EXAMINATION PERFORMED/, "exam"],
  [/HEALTH MAINTENANCE|SURGICAL|PROCEDURE/, "procedures"],
  [/\bPLAN\b|RECOMMENDATION|ORDERS/, "plan"],
  [/HISTORY|COURSE|ASSESSMENT|IMPRESSION|INDICATION|REASON|COMPLAINT|SUBJECTIVE|SUMMARY|FOLLOW/, "narrative"],
];

export function sectionKind(title: string): SectionKind {
  const t = title.toUpperCase().trim();
  for (const [re, k] of KIND_RULES) if (re.test(t)) return k;
  return "other";
}

const SECTION_HEADER = /^([A-Z][A-Z0-9 /&()'\-]{2,60}):\s*(.*)$/;
const BULLET = /^\s*(?:[-•*·]|\d+[.)])\s+/;

/** Split a paragraph into sentences, keeping offsets. */
function sentences(text: string, base: number): Item[] {
  const out: Item[] = [];
  // A terminator only ends a sentence when followed by whitespace/end, so "7.4" stays whole.
  const re = /(?:[^.!?]|[.!?](?=\S))+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: base + m.index + lead, end: base + m.index + lead + t.length, bullet: false });
  }
  return out;
}

export function splitSections(text: string, headerEnd: number): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let offset = 0;
  for (const rawLine of text.split("\n")) {
    const lineStart = offset;
    offset += rawLine.length + 1;
    const line = rawLine.replace(/\r$/, "");
    if (lineStart < headerEnd || !line.trim()) continue;
    const h = line.match(SECTION_HEADER);
    if (h && h[1] === h[1].toUpperCase()) {
      current = { title: h[1].trim(), kind: sectionKind(h[1]), items: [] };
      sections.push(current);
      if (h[2].trim()) {
        const inlineStart = lineStart + line.indexOf(h[2], h[1].length);
        current.items.push(...sentences(h[2], inlineStart));
      }
      continue;
    }
    if (!current) {
      current = { title: "Body", kind: "narrative", items: [] };
      sections.push(current);
    }
    const b = line.match(BULLET);
    if (b) {
      const body = line.slice(b[0].length).trimEnd();
      const s = lineStart + b[0].length;
      current.items.push({ text: body, start: s, end: s + body.length, bullet: true });
    } else {
      const lead = line.length - line.trimStart().length;
      current.items.push(...sentences(line.trim(), lineStart + lead));
    }
  }
  return sections;
}

/** Minimal CSV row parser (handles quoted fields). */
export function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export interface CsvTable {
  columns: string[];
  rows: { cells: Record<string, string>; start: number; end: number; rowNumber: number }[];
}

export function parseCsv(text: string): CsvTable | null {
  let offset = 0;
  let columns: string[] | null = null;
  const rows: CsvTable["rows"] = [];
  for (const rawLine of text.split("\n")) {
    const start = offset;
    offset += rawLine.length + 1;
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!line.includes(",")) continue;
    const cells = parseCsvRow(line);
    if (!columns) {
      columns = cells.map((c) => c.toLowerCase().replace(/\s+/g, "_"));
      continue;
    }
    const rec: Record<string, string> = {};
    columns.forEach((c, i) => (rec[c] = cells[i] ?? ""));
    rows.push({ cells: rec, start, end: start + line.length, rowNumber: rows.length + 1 });
  }
  return columns ? { columns, rows } : null;
}

/**
 * Read-only aggregations for display. They group facts by normalized label but never
 * merge them: every row keeps the full list of underlying facts (and thus sources).
 */
import type { Conflict, Fact, FactCategory, RecordSet } from "./types";
import { displayName, factDate } from "./conflicts/detect";

export interface ItemSummary {
  key: string;
  display: string;
  facts: Fact[]; // chronological
  documentIds: string[];
  conflicts: Conflict[];
  firstDate: string;
  lastDate: string;
}

export function chronological(facts: Fact[]): Fact[] {
  return [...facts].sort(
    (a, b) =>
      factDate(a).localeCompare(factDate(b)) ||
      (a.source.recordDate ?? "").localeCompare(b.source.recordDate ?? "") ||
      a.source.charStart - b.source.charStart,
  );
}

export function summarize(rs: RecordSet, category: FactCategory): ItemSummary[] {
  const groups = new Map<string, Fact[]>();
  for (const f of rs.facts) if (f.category === category) groups.set(f.normalizedLabel, [...(groups.get(f.normalizedLabel) ?? []), f]);
  return [...groups].map(([key, fs]) => {
    const facts = chronological(fs);
    const ids = new Set(facts.map((f) => f.id));
    return {
      key,
      display: key === "no known drug allergies" ? "No known drug allergies (NKDA)" : displayName(key),
      facts,
      documentIds: [...new Set(facts.map((f) => f.source.documentId))],
      conflicts: rs.conflicts.filter((c) => c.factIds.some((id) => ids.has(id))),
      firstDate: factDate(facts[0]),
      lastDate: factDate(facts[facts.length - 1]),
    };
  });
}

/** Group a summary's facts by what they assert, e.g. "20 mg once daily · active". */
export function byAssertion(facts: Fact[], key: (f: Fact) => string): { label: string; facts: Fact[] }[] {
  const m = new Map<string, Fact[]>();
  for (const f of facts) m.set(key(f), [...(m.get(key(f)) ?? []), f]);
  return [...m].map(([label, fs]) => ({ label, facts: fs }));
}

/** Values a header field takes across documents — shown all together if they differ. */
export function demographicValues(rs: RecordSet, key: string): { value: string; facts: Fact[] }[] {
  const facts = rs.facts.filter((f) => f.category === "demographic" && f.normalizedLabel === key);
  return byAssertion(facts, (f) => f.value ?? "").map((g) => ({ value: g.label, facts: g.facts }));
}

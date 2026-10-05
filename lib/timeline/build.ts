/**
 * Builds chronological events from facts. Each event keeps the IDs of the facts behind
 * it, so clicking an event always leads back to source passages.
 */
import type { Fact, TimelineEvent, TimelineEventType } from "../types";
import { displayName, factDate } from "../conflicts/detect";
import { formatDate, hash } from "../normalize/values";

export const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  visit: "Office visit",
  hospitalization: "Hospitalization",
  medication_started: "Medication started / first listed",
  medication_changed: "Medication changed",
  medication_discontinued: "Medication discontinued",
  diagnosis_recorded: "Diagnosis recorded",
  lab: "Lab performed",
  imaging: "Imaging / test",
  procedure: "Procedure",
};

function ev(type: TimelineEventType, date: string, title: string, facts: Fact[], subtitle?: string): TimelineEvent {
  return {
    id: `e_${hash(type + date + title + facts.map((f) => f.id).join())}`,
    type,
    date,
    title,
    subtitle,
    factIds: facts.map((f) => f.id),
    documentIds: [...new Set(facts.map((f) => f.source.documentId))],
  };
}

export function buildTimeline(facts: Fact[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const dated = facts.filter((f) => factDate(f));

  for (const f of dated) {
    const d = factDate(f);
    if (f.category === "visit") out.push(ev("visit", d, f.value ?? "Visit", [f], `${f.source.facility} · ${f.source.provider}`));
    if (f.category === "hospitalization") {
      const [a, b] = (f.value ?? "").split(" to ");
      out.push(ev("hospitalization", d, "Hospital admission", [f], `${formatDate(a)} – ${formatDate(b)} · ${f.source.facility}`));
    }
    if (f.category === "medication") {
      const name = displayName(f.normalizedLabel);
      // Titles say what the source says: a "change" event exists only where a passage documents one.
      if (f.status === "started") out.push(ev("medication_started", d, `${name} start documented`, [f], f.value ?? undefined));
      if (f.status === "changed") out.push(ev("medication_changed", d, `${name} dose change documented`, [f], f.value ?? undefined));
      if (f.status === "discontinued" || f.status === "held")
        out.push(ev("medication_discontinued", d, `${name} ${f.status === "held" ? "hold documented" : f.source.section?.startsWith("Table") ? "listed as discontinued" : "discontinuation documented"}`, [f]));
    }
    if (f.category === "imaging" || f.category === "procedure") {
      const name = displayName(f.normalizedLabel);
      const type = f.category === "imaging" ? "imaging" : "procedure";
      out.push(ev(type, d, f.status === "referenced" ? `${name} (date as referenced)` : name, [f],
        f.status === "referenced" ? `Mentioned in ${f.source.documentType.toLowerCase()} of ${formatDate(f.source.recordDate)}` : undefined));
    }
  }

  // Medications with no explicit start: mark where they first appear in the records.
  const meds = dated.filter((f) => f.category === "medication");
  const byMed = new Map<string, Fact[]>();
  for (const f of meds) byMed.set(f.normalizedLabel, [...(byMed.get(f.normalizedLabel) ?? []), f]);
  for (const [key, fs] of byMed) {
    const sorted = [...fs].sort((a, b) => factDate(a).localeCompare(factDate(b)));
    if (sorted[0].status === "started" || sorted[0].status === "changed") continue;
    if (sorted[0].status !== "active") continue;
    out.push(ev("medication_started", factDate(sorted[0]), `${displayName(key)} first listed`, [sorted[0]], sorted[0].value ?? undefined));
  }

  // Diagnoses: first positive record of each condition.
  const conds = dated.filter((f) => f.category === "condition" && f.status !== "negated" && f.status !== "possible");
  const byCond = new Map<string, Fact[]>();
  for (const f of conds) byCond.set(f.normalizedLabel, [...(byCond.get(f.normalizedLabel) ?? []), f]);
  for (const [key, fs] of byCond) {
    const first = [...fs].sort((a, b) => factDate(a).localeCompare(factDate(b)))[0];
    out.push(ev("diagnosis_recorded", factDate(first), `${displayName(key)} recorded`, [first], `First appears in ${first.source.documentType.toLowerCase()}`));
  }

  // Labs: one event per collection date, listing the tests (from any source).
  const labs = dated.filter((f) => f.category === "lab");
  const byDate = new Map<string, Fact[]>();
  for (const f of labs) byDate.set(factDate(f), [...(byDate.get(factDate(f)) ?? []), f]);
  for (const [d, fs] of byDate) {
    const names = [...new Set(fs.map((f) => displayName(f.normalizedLabel)))];
    out.push(ev("lab", d, `Results dated ${formatDate(d)}`, fs, names.join(", ")));
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

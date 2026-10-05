/**
 * Stage 4 — conflict detection.
 *
 * Principles (enforced by tests/conflicts.test.ts):
 *   • A conflict references existing fact IDs. It never creates or edits a fact.
 *   • No source "wins". Newer is not assumed to be correct. Claims are grouped by what
 *     they assert and shown side by side.
 *   • Identical repeated facts are corroboration, not conflict.
 *   • Absence is not contradiction: a drug missing from one list is not flagged.
 *   • When a record explicitly documents a change (e.g. "increased from 10 mg to 20 mg")
 *     that falls between two differing claims, the conflict is labelled
 *     `documented_change` instead of `unexplained` — but it is still surfaced for a human.
 */
import type { Conflict, ConflictType, Fact } from "../types";
import {
  ALLERGENS, CONDITIONS, IMAGING, LABS, MEDICATIONS, MUTUALLY_EXCLUSIVE_CONDITIONS, PROCEDURES,
} from "../normalize/lexicon";
import { formatDate, hash } from "../normalize/values";

// ---------------------------------------------------------------- helpers

export function factDate(f: Fact): string {
  return f.eventDate ?? f.source.recordDate ?? "";
}

function chrono(a: Fact, b: Fact) {
  return (
    factDate(a).localeCompare(factDate(b)) ||
    (a.source.recordDate ?? "").localeCompare(b.source.recordDate ?? "") ||
    a.source.documentName.localeCompare(b.source.documentName) ||
    a.source.charStart - b.source.charStart
  );
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  return m;
}

const ALL_TABLES = [MEDICATIONS, CONDITIONS, ALLERGENS, LABS, IMAGING, PROCEDURES];

export function displayName(key: string): string {
  for (const t of ALL_TABLES) {
    const e = t.find((x) => x.key === key);
    if (e) return e.display;
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** "Cardiology Consultation (Mar 12, 2026)" — how a source is named in observations. */
export function sourceLabel(f: Fact): string {
  return `${f.source.documentType.toLowerCase()} dated ${formatDate(f.source.recordDate)}`;
}

function makeConflict(
  type: ConflictType, subject: string, title: string, explanation: string,
  groups: { label: string; facts: Fact[] }[], opts: { pattern?: Conflict["pattern"]; context?: Fact[]; observations?: string[] } = {},
): Conflict {
  const all = groups.flatMap((g) => g.facts).sort(chrono);
  return {
    id: `c_${hash(`${type}|${subject}`)}`,
    type,
    subject,
    title,
    explanation,
    pattern: opts.pattern ?? "unexplained",
    factIds: [...new Set(all.map((f) => f.id))],
    groups: groups.map((g) => ({ label: g.label, factIds: g.facts.sort(chrono).map((f) => f.id) })),
    observations: opts.observations ?? [],
    contextFactIds: (opts.context ?? []).sort(chrono).map((f) => f.id),
  };
}

// ---------------------------------------------------------------- medications

const doseSig = (f: Fact) => `${f.detail.doseAmount} ${f.detail.doseUnit ?? ""}`.trim();
const fullSig = (f: Fact) => [doseSig(f), f.detail.frequency].filter(Boolean).join(" ");

function sameDose(a: Fact, b: Fact) {
  return (
    a.detail.doseAmount === b.detail.doseAmount &&
    a.detail.doseUnit === b.detail.doseUnit &&
    (!a.detail.frequency || !b.detail.frequency || a.detail.frequency === b.detail.frequency)
  );
}

function clusterDoses(listings: Fact[]): Fact[][] {
  const clusters: Fact[][] = [];
  // Facts with a frequency first so frequency-less ones join a compatible cluster.
  const ordered = [...listings].sort((a, b) => Number(!a.detail.frequency) - Number(!b.detail.frequency));
  for (const f of ordered) {
    const c = clusters.find((cl) => cl.every((x) => sameDose(x, f)));
    if (c) c.push(f);
    else clusters.push([f]);
  }
  return clusters;
}

function medicationDoseConflict(key: string, group: Fact[]): Conflict | null {
  const listings = group
    .filter((f) => !f.detail.isChangeStatement && (f.status === "active" || f.status === "started") && f.detail.doseAmount !== undefined)
    .sort(chrono);
  const changes = group.filter((f) => f.detail.isChangeStatement).sort(chrono);
  const clusters = clusterDoses(listings);
  if (clusters.length < 2) return null;

  const name = displayName(key);
  const observations: string[] = [];
  let unexplained = false;
  let prev = listings[0];
  for (const curr of listings.slice(1)) {
    if (sameDose(prev, curr)) { prev = curr; continue; }
    const p = factDate(prev);
    const c = factDate(curr);
    const explaining = changes.find(
      (ch) =>
        ch.detail.doseAmount === curr.detail.doseAmount &&
        ch.detail.doseUnit === curr.detail.doseUnit &&
        factDate(ch) > p && factDate(ch) <= c,
    );
    const stale = changes.find(
      (ch) =>
        ch.detail.previousDoseAmount === curr.detail.doseAmount &&
        ch.detail.doseAmount === prev.detail.doseAmount &&
        factDate(ch) <= c,
    );
    const pair = `The ${sourceLabel(prev)} lists ${fullSig(prev)}; the ${sourceLabel(curr)} lists ${fullSig(curr)}.`;
    if (explaining) {
      observations.push(`${pair} The ${sourceLabel(explaining)} documents a change from ${explaining.detail.previousDoseAmount} ${explaining.detail.previousDoseUnit} to ${explaining.detail.doseAmount} ${explaining.detail.doseUnit}, which falls between these records.`);
    } else if (stale) {
      unexplained = true;
      observations.push(`${pair} The later record matches the dose from before the change documented in the ${sourceLabel(stale)}.`);
    } else {
      unexplained = true;
      observations.push(`${pair} ${p === c ? "Both records carry the same date." : "No record between these dates documents a dose change."}`);
    }
    prev = curr;
  }
  return makeConflict(
    "medication_dose",
    key,
    `${name} dose`,
    unexplained
      ? `Sources report different doses of ${name}. This may represent a medication change or a documentation discrepancy. No record is treated as more accurate than another.`
      : `Sources report different doses of ${name}. A record documents a dose change that may account for the difference. Confirm against the source documents.`,
    clusters.map((cl) => ({ label: fullSig(cl.find((f) => f.detail.frequency) ?? cl[0]), facts: cl })),
    { pattern: unexplained ? "unexplained" : "documented_change", context: changes, observations },
  );
}

function medicationStatusConflict(key: string, group: Fact[]): Conflict | null {
  const stops = group.filter((f) => f.status === "discontinued" || f.status === "held").sort(chrono);
  const actives = group.filter((f) => (f.status === "active" || f.status === "started") && !f.detail.isChangeStatement).sort(chrono);
  if (!stops.length || !actives.length) return null;
  const name = displayName(key);
  const firstStop = stops[0];
  const observations: string[] = [];
  let unexplained = false;
  for (const a of actives) {
    const stopBefore = [...stops].reverse().find((s) => factDate(s) < factDate(a));
    if (!stopBefore) continue;
    const restart = actives.find((s) => s.status === "started" && factDate(s) > factDate(stopBefore) && factDate(s) <= factDate(a));
    if (restart) {
      observations.push(`The ${sourceLabel(restart)} records ${name} as started again after the ${sourceLabel(stopBefore)} recorded it as ${stopBefore.status}.`);
      continue;
    }
    unexplained = true;
    observations.push(`The ${sourceLabel(a)} lists ${name} as current after the ${sourceLabel(stopBefore)} recorded it as ${stopBefore.status}.`);
  }
  const lastActiveBeforeStop = actives.filter((a) => factDate(a) <= factDate(firstStop)).pop();
  if (lastActiveBeforeStop) {
    observations.unshift(`${name} is listed as current up to the ${sourceLabel(lastActiveBeforeStop)}; the ${sourceLabel(firstStop)} records it as ${firstStop.status}.`);
  }
  return makeConflict(
    "medication_status",
    key,
    unexplained ? `${name}: listed as current and as discontinued` : `${name}: later recorded as discontinued`,
    unexplained
      ? `Some sources list ${name} as a current medication while another records it as discontinued, and the current listing is dated after the discontinuation. This may reflect a restart that was not documented, or a medication list that was carried forward.`
      : `${name} appears as current in earlier records and as discontinued in a later record. This is consistent with a documented discontinuation, but should be confirmed against the sources.`,
    [
      { label: "Listed as current", facts: actives },
      { label: "Recorded as discontinued / held", facts: stops },
    ],
    { pattern: unexplained ? "unexplained" : "documented_change", observations },
  );
}

// ---------------------------------------------------------------- allergies

const NKDA = "no known drug allergies";

function allergyConflicts(facts: Fact[]): Conflict[] {
  const out: Conflict[] = [];
  const allergies = facts.filter((f) => f.category === "allergy");
  const nkda = allergies.filter((f) => f.normalizedLabel === NKDA);
  for (const [key, group] of groupBy(allergies.filter((f) => f.normalizedLabel !== NKDA), (f) => f.normalizedLabel)) {
    const name = displayName(key);
    const positives = group.filter((f) => f.status === "active").sort(chrono);
    const negatives = [...group.filter((f) => f.status === "negated"), ...nkda].sort(chrono);
    if (positives.length && negatives.length) {
      const firstPos = factDate(positives[0]);
      const observations = negatives.map((n) =>
        factDate(n) < firstPos
          ? `The ${sourceLabel(n)} records no allergy here; this predates the first record of a ${name} allergy (${formatDate(firstPos)}). This may reflect a newly identified allergy or a documentation discrepancy.`
          : `The ${sourceLabel(n)} records no ${name} allergy, although an earlier record (${formatDate(firstPos)}) lists one.`,
      );
      out.push(makeConflict(
        "allergy", key, `${name} allergy`,
        `Some sources record a ${name} allergy and at least one source records no known allergies. Allergy information should be reviewed against the original documents.`,
        [
          { label: `${name} allergy recorded`, facts: positives },
          { label: "No known allergies / denied", facts: negatives },
        ],
        { observations },
      ));
    }
    const byReaction = groupBy(positives.filter((f) => f.detail.reaction), (f) => f.detail.reaction!);
    if (byReaction.size > 1) {
      out.push(makeConflict(
        "allergy_reaction", key, `${name} allergy: reaction differs`,
        `Sources agree that a ${name} allergy is recorded but describe the reaction differently. This may reflect different levels of detail or a documentation discrepancy.`,
        [...byReaction].map(([r, fs]) => ({ label: `Reaction: ${r}`, facts: fs })),
      ));
    }
  }
  return out;
}

// ---------------------------------------------------------------- conditions

const POSITIVE_CONDITION = new Set(["active", "historical", "recorded", "resolved"]);

function conditionConflicts(facts: Fact[]): Conflict[] {
  const out: Conflict[] = [];
  const conditions = facts.filter((f) => f.category === "condition");
  for (const [key, group] of groupBy(conditions, (f) => f.normalizedLabel)) {
    const pos = group.filter((f) => POSITIVE_CONDITION.has(f.status)).sort(chrono);
    const neg = group.filter((f) => f.status === "negated").sort(chrono);
    if (!pos.length || !neg.length) continue;
    const name = displayName(key);
    out.push(makeConflict(
      "condition", key, `${name}: recorded vs. denied`,
      `At least one source records ${name} and another explicitly states there is no history of it. Neither statement is treated as correct here.`,
      [
        { label: `${name} recorded`, facts: pos },
        { label: "Explicitly denied", facts: neg },
      ],
      {
        observations: neg.map((n) => {
          const earlier = pos.filter((p) => factDate(p) < factDate(n));
          return earlier.length
            ? `The ${sourceLabel(n)} denies ${name.toLowerCase()} after the ${sourceLabel(earlier[earlier.length - 1])} recorded it.`
            : `The ${sourceLabel(n)} denies ${name.toLowerCase()}; it is recorded in a later source.`;
        }),
      },
    ));
  }
  for (const set of MUTUALLY_EXCLUSIVE_CONDITIONS) {
    const present = set
      .map((key) => ({ key, facts: conditions.filter((f) => f.normalizedLabel === key && f.status === "active") }))
      .filter((x) => x.facts.length);
    if (present.length < 2) continue;
    const names = present.map((p) => displayName(p.key));
    out.push(makeConflict(
      "condition", set.join("+"), `Differing diagnoses: ${names.join(" vs. ")}`,
      `Different sources record ${names.join(" and ")} as current diagnoses. These are not normally recorded together. This may reflect a documentation discrepancy or different information available to each source.`,
      present.map((p) => ({ label: displayName(p.key), facts: p.facts })),
    ));
  }
  return out;
}

// ---------------------------------------------------------------- labs

function sameLabValue(a: Fact, b: Fact) {
  const x = a.detail.numericValue;
  const y = b.detail.numericValue;
  if ((a.units ?? "").toLowerCase() !== (b.units ?? "").toLowerCase() && a.units && b.units) return false;
  if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) return a.value === b.value;
  return Math.abs(x - y) <= 0.01 * Math.max(Math.abs(x), Math.abs(y));
}

function labConflicts(facts: Fact[]): Conflict[] {
  const out: Conflict[] = [];
  const labs = facts.filter((f) => f.category === "lab" && f.eventDate);
  for (const [k, group] of groupBy(labs, (f) => `${f.normalizedLabel}|${f.eventDate}`)) {
    const clusters: Fact[][] = [];
    for (const f of group) {
      const c = clusters.find((cl) => sameLabValue(cl[0], f));
      if (c) c.push(f);
      else clusters.push([f]);
    }
    if (clusters.length < 2) continue;
    const [key, date] = k.split("|");
    const name = displayName(key);
    out.push(makeConflict(
      "lab_value", `${key} ${date}`, `${name} on ${formatDate(date)}: values differ`,
      `Sources report different values for what appears to be the same test on the same date. This may be a transcription difference, a different specimen, or a unit difference.`,
      clusters.map((cl) => ({ label: `${cl[0].value}${cl[0].units ? ` ${cl[0].units}` : ""}`, facts: cl })),
    ));
  }
  return out;
}

// ---------------------------------------------------------------- dates of studies/procedures

const DATE_WINDOW_DAYS = 60;

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

function eventDateConflicts(facts: Fact[]): Conflict[] {
  const out: Conflict[] = [];
  const events = facts.filter((f) => (f.category === "imaging" || f.category === "procedure") && f.eventDate);
  for (const [key, group] of groupBy(events, (f) => f.normalizedLabel)) {
    const byDate = groupBy(group, (f) => f.eventDate!);
    if (byDate.size < 2) continue;
    const dates = [...byDate.keys()].sort();
    const involved = new Set<string>();
    for (let i = 0; i < dates.length; i++)
      for (let j = i + 1; j < dates.length; j++) {
        const a = byDate.get(dates[i])!;
        const b = byDate.get(dates[j])!;
        const differentDocs = a.some((x) => b.some((y) => y.source.documentId !== x.source.documentId));
        const referenced = [...a, ...b].some((f) => f.status === "referenced");
        if (daysBetween(dates[i], dates[j]) <= DATE_WINDOW_DAYS && differentDocs && referenced) {
          involved.add(dates[i]);
          involved.add(dates[j]);
        }
      }
    if (involved.size < 2) continue;
    const name = displayName(key);
    out.push(makeConflict(
      "event_date", key, `${name}: dates differ`,
      `Sources give different dates for a ${name.toLowerCase()} within ${DATE_WINDOW_DAYS} days of each other. This may be two separate studies or a date discrepancy in one record.`,
      [...involved].sort().map((d) => ({ label: formatDate(d), facts: byDate.get(d)! })),
    ));
  }
  return out;
}

// ---------------------------------------------------------------- demographics

function demographicConflicts(facts: Fact[]): Conflict[] {
  const out: Conflict[] = [];
  const demo = facts.filter((f) => f.category === "demographic");
  for (const [key, group] of groupBy(demo, (f) => f.normalizedLabel)) {
    const byValue = groupBy(group, (f) => (f.value ?? "").toLowerCase().replace(/[^a-z0-9-]/g, ""));
    if (byValue.size < 2) continue;
    const label = group[0].label;
    out.push(makeConflict(
      "demographic", key, `${label} differs between sources`,
      `Sources record different values for ${label.toLowerCase()}. This may be a data-entry discrepancy, or a sign that a document belongs to a different person. Review the source headers.`,
      [...byValue.values()].map((fs) => ({ label: key === "date of birth" ? formatDate(fs[0].value) : fs[0].value ?? "", facts: fs })),
    ));
  }
  return out;
}

// ---------------------------------------------------------------- entry point

const TYPE_ORDER: ConflictType[] = [
  "medication_dose", "medication_status", "allergy", "allergy_reaction", "condition",
  "lab_value", "event_date", "demographic",
];

export function detectConflicts(facts: Fact[]): Conflict[] {
  const out: Conflict[] = [];
  const meds = facts.filter((f) => f.category === "medication");
  for (const [key, group] of groupBy(meds, (f) => f.normalizedLabel)) {
    const dose = medicationDoseConflict(key, group);
    if (dose) out.push(dose);
    const status = medicationStatusConflict(key, group);
    if (status) out.push(status);
  }
  out.push(...allergyConflicts(facts), ...conditionConflicts(facts), ...labConflicts(facts),
    ...eventDateConflicts(facts), ...demographicConflicts(facts));
  return out.sort(
    (a, b) =>
      Number(a.pattern !== "unexplained") - Number(b.pattern !== "unexplained") ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}

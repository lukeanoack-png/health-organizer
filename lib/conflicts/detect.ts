/**
 * Stage 4 — conflict detection.
 *
 * Principles (enforced by tests/conflicts.test.ts):
 *   • A conflict references existing fact IDs. It never creates or edits a fact.
 *   • No source "wins". Newer is not assumed to be correct. Claims are grouped by what
 *     they assert and shown side by side.
 *   • Identical repeated facts are corroboration, not conflict.
 *   • Absence is not contradiction: a drug missing from one list is not flagged.
 *   • A documented change (e.g. "increased from 10 mg to 20 mg") is checked claim by claim
 *     against its date. It can explain some differing records without explaining all of
 *     them, and every note says which claims it is about.
 */
import type { Conflict, ConflictNote, ConflictType, Fact } from "../types";
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

/** "primary care note dated Mar 4, 2026" — how a source is named in notes. */
export function sourceLabel(f: Fact): string {
  return `${f.source.documentType.toLowerCase()} dated ${formatDate(f.source.recordDate)}`;
}

const shortDate = (iso: string) => formatDate(iso).replace(/, \d{4}$/, "");

/** "Jan 15 and Mar 4" / "Jan 15, Mar 4 and Apr 2" — unique record dates of some claims. */
function datesOf(fs: Fact[]): string {
  const ds = [...new Set(fs.sort(chrono).map((f) => shortDate(f.source.recordDate ?? factDate(f))))];
  return ds.length <= 1 ? ds.join("") : `${ds.slice(0, -1).join(", ")} and ${ds[ds.length - 1]}`;
}

function makeConflict(
  type: ConflictType, subject: string, title: string, explanation: string,
  groups: { label: string; facts: Fact[] }[],
  opts: { pattern?: Conflict["pattern"]; context?: Fact[]; notes?: ConflictNote[] } = {},
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
    observations: opts.notes ?? [],
    contextFactIds: (opts.context ?? []).sort(chrono).map((f) => f.id),
  };
}

const note = (kind: ConflictNote["kind"], text: string, facts: Fact[]): ConflictNote => ({ kind, text, factIds: facts.map((f) => f.id) });

/** Classify claims against documented changes: which fit, which don't. */
function patternFor(changes: Fact[], consistent: Fact[], inconsistent: Fact[]): Conflict["pattern"] {
  if (!changes.length) return "unexplained";
  if (!inconsistent.length) return "documented_change";
  return consistent.length ? "partially_explained" : "unexplained";
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
  return clusters.sort((a, b) => chrono(a.sort(chrono)[0], b.sort(chrono)[0]));
}

/** The dose the documented changes imply at a date, or null if none apply. */
function expectedDose(changes: Fact[], date: string): { amount?: number; unit?: string; change: Fact } | null {
  const before = changes.filter((c) => factDate(c) <= date);
  if (before.length) {
    const c = before[before.length - 1];
    return { amount: c.detail.doseAmount, unit: c.detail.doseUnit, change: c };
  }
  const after = changes.find((c) => factDate(c) > date);
  return after ? { amount: after.detail.previousDoseAmount, unit: after.detail.previousDoseUnit, change: after } : null;
}

function medicationDoseConflict(key: string, group: Fact[]): Conflict | null {
  const listings = group
    .filter((f) => !f.detail.isChangeStatement && (f.status === "active" || f.status === "started") && f.detail.doseAmount !== undefined)
    .sort(chrono);
  const changes = group.filter((f) => f.detail.isChangeStatement).sort(chrono);
  const clusters = clusterDoses(listings);
  if (clusters.length < 2) return null;

  const name = displayName(key);
  // Name clusters by dose alone unless they only differ by frequency.
  const byAmountOnly = new Set(clusters.map((cl) => doseSig(cl[0]))).size === clusters.length;
  const label = (cl: Fact[]) => (byAmountOnly ? doseSig(cl[0]) : fullSig(cl.find((f) => f.detail.frequency) ?? cl[0]));
  const notes: ConflictNote[] = [];
  let consistent: Fact[] = [];
  let inconsistent: Fact[] = [];

  if (!changes.length) {
    inconsistent = listings;
    let prev = listings[0];
    for (const curr of listings.slice(1)) {
      if (!sameDose(prev, curr)) {
        notes.push(note("unexplained",
          `The ${sourceLabel(prev)} records ${fullSig(prev)}; the ${sourceLabel(curr)} records ${fullSig(curr)}. ` +
          (factDate(prev) === factDate(curr) ? "Both carry the same date." : "No record documents a dose change between them."),
          [prev, curr]));
      }
      prev = curr;
    }
  } else {
    for (const c of changes) {
      notes.push(note("context", `The ${sourceLabel(c)} documents a change from ${c.detail.previousDoseAmount} ${c.detail.previousDoseUnit} to ${c.detail.doseAmount} ${c.detail.doseUnit}: “${c.source.excerpt.trim()}”`, [c]));
    }
    for (const l of listings) {
      const exp = expectedDose(changes, factDate(l));
      if (exp && exp.amount === l.detail.doseAmount && exp.unit === l.detail.doseUnit) consistent.push(l);
      else inconsistent.push(l);
    }
    const side = (f: Fact) => {
      const c = expectedDose(changes, factDate(f))!.change;
      return `${factDate(c) > factDate(f) ? "before" : "on or after"} ${shortDate(factDate(c))}`;
    };
    for (const [k, fs] of groupBy(consistent, (f) => `${doseSig(f)}|${side(f)}`)) {
      const [dose, when] = k.split("|");
      notes.push(note("explained", `Consistent with the documented change: ${dose} in records dated ${datesOf(fs)} (${when}).`, fs));
    }
    for (const l of inconsistent) {
      const exp = expectedDose(changes, factDate(l))!;
      const when = factDate(exp.change) > factDate(l) ? "before" : "after";
      notes.push(note("unexplained",
        when === "before"
          ? `The ${sourceLabel(l)} records ${doseSig(l)} before the change documented on ${shortDate(factDate(exp.change))}. That change does not explain this record.`
          : `The ${sourceLabel(l)} records ${doseSig(l)} after the change to ${exp.amount} ${exp.unit} documented on ${shortDate(factDate(exp.change))}. That change does not explain this record.`,
        [l]));
    }
  }

  const pattern = patternFor(changes, consistent, inconsistent);
  const explanation = {
    unexplained: `Sources record different ${name} doses. No source documents a dose change that accounts for the difference. This may reflect an undocumented change or a documentation discrepancy.`,
    partially_explained: `A source documents a ${name} dose change. It accounts for some of the differing records, but not all of them.`,
    documented_change: `A source documents a ${name} dose change that is consistent with every differing record. Confirm against the sources.`,
  }[pattern];

  return makeConflict(
    "medication_dose", key, `${name}: ${clusters.map(label).join(" vs ")}`, explanation,
    clusters.map((cl) => ({ label: label(cl), facts: cl })),
    { pattern, context: changes, notes },
  );
}

function medicationStatusConflict(key: string, group: Fact[]): Conflict | null {
  const stops = group.filter((f) => f.status === "discontinued" || f.status === "held").sort(chrono);
  const actives = group.filter((f) => (f.status === "active" || f.status === "started") && !f.detail.isChangeStatement).sort(chrono);
  if (!stops.length || !actives.length) return null;
  const name = displayName(key);
  const notes: ConflictNote[] = stops.map((s) =>
    note("context", `The ${sourceLabel(s)} records ${name} as ${s.status}: “${s.source.excerpt.trim()}”`, [s]));
  const consistent: Fact[] = [];
  const inconsistent: { a: Fact; stop: Fact }[] = [];
  for (const a of actives) {
    const stopBefore = [...stops].reverse().find((s) => factDate(s) < factDate(a));
    const restarted = stopBefore && actives.some((s) => s.status === "started" && factDate(s) > factDate(stopBefore) && factDate(s) <= factDate(a));
    if (!stopBefore || restarted) consistent.push(a);
    else inconsistent.push({ a, stop: stopBefore });
  }
  if (consistent.length)
    notes.push(note("explained", `Listed as current before the first recorded discontinuation (${shortDate(factDate(stops[0]))}): records dated ${datesOf(consistent)}.`, consistent));
  for (const { a, stop } of inconsistent)
    notes.push(note("unexplained", `The ${sourceLabel(a)} lists ${name} as current after the ${sourceLabel(stop)} recorded it as ${stop.status}. No record documents a restart.`, [a]));

  const pattern = patternFor(stops, consistent, inconsistent.map((x) => x.a));
  return makeConflict(
    "medication_status", key, `${name}: listed as current vs discontinued`,
    pattern === "documented_change"
      ? `${name} is listed as current in earlier records and recorded as discontinued later. This fits the recorded discontinuation; confirm against the sources.`
      : `A recorded discontinuation accounts for the earlier listings, but at least one later record still lists ${name} as current.`,
    [
      { label: "Listed as current", facts: actives },
      { label: "Recorded as discontinued", facts: stops },
    ],
    { pattern, notes },
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
      const notes = negatives.map((n) =>
        note("unexplained", factDate(n) < firstPos
          ? `The ${sourceLabel(n)} records no known allergies; the first record of a ${name} allergy is later (${shortDate(firstPos)}). This may be a newly identified allergy or a documentation discrepancy.`
          : `The ${sourceLabel(n)} records no ${name} allergy, although an earlier record (${shortDate(firstPos)}) lists one.`, [n]));
      const negLabel = negatives.every((n) => n.normalizedLabel === NKDA) ? "NKDA" : "denied";
      out.push(makeConflict(
        "allergy", key, `${name} allergy: recorded vs ${negLabel}`,
        `Some sources record a ${name} allergy and at least one source records no known drug allergies.`,
        [
          { label: `${name} allergy recorded`, facts: positives },
          { label: "No known drug allergies", facts: negatives },
        ],
        { notes },
      ));
    }
    const byReaction = groupBy(positives.filter((f) => f.detail.reaction), (f) => f.detail.reaction!);
    if (byReaction.size > 1) {
      out.push(makeConflict(
        "allergy_reaction", key, `${name} reaction: ${[...byReaction.keys()].join(" vs ")}`,
        `Sources agree a ${name} allergy is recorded but describe the reaction differently. This may reflect different levels of detail or a documentation discrepancy.`,
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
      "condition", key, `${name}: recorded vs denied`,
      `At least one source records ${name.toLowerCase()} and another states there is no history of it.`,
      [
        { label: `${name} recorded`, facts: pos },
        { label: "Explicitly denied", facts: neg },
      ],
      {
        notes: neg.map((n) => {
          const earlier = pos.filter((p) => factDate(p) < factDate(n));
          return note("unexplained", earlier.length
            ? `The ${sourceLabel(n)} denies ${name.toLowerCase()} after the ${sourceLabel(earlier[earlier.length - 1])} recorded it.`
            : `The ${sourceLabel(n)} denies ${name.toLowerCase()}; a later source records it.`, [n, ...earlier.slice(-1)]);
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
      "condition", set.join("+"), names.map((n, i) => (i ? n.toLowerCase() : n)).join(" vs "),
      `Different sources record ${names.join(" and ")} as current diagnoses. Each is kept as written; they are linked here because they are not normally recorded together.`,
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
    const val = (cl: Fact[]) => `${cl[0].value}${cl[0].units ? ` ${cl[0].units}` : ""}`;
    out.push(makeConflict(
      "lab_value", `${key} ${date}`, `${name} (${formatDate(date)}): ${clusters.map(val).join(" vs ")}`,
      `Sources report different values for what appears to be the same test on the same date. This may be a transcription difference, a different specimen, or a unit difference.`,
      clusters.map((cl) => ({ label: val(cl), facts: cl })),
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
    const ds = [...involved].sort();
    out.push(makeConflict(
      "event_date", key, `${name} date: ${ds.map(shortDate).join(" vs ")}`,
      `Sources give different dates for a ${name.toLowerCase()} within ${DATE_WINDOW_DAYS} days of each other. This may be two separate studies or a date discrepancy in one record.`,
      ds.map((d) => ({ label: formatDate(d), facts: byDate.get(d)! })),
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
    const show = (fs: Fact[]) => (key === "date of birth" ? formatDate(fs[0].value) : fs[0].value ?? "");
    const groups = [...byValue.values()].map((fs) => ({ label: show(fs), facts: fs }));
    out.push(makeConflict(
      "demographic", key, `${label}: ${groups.map((g) => g.label).join(" vs ")}`,
      `Sources record different values for ${label.toLowerCase()}. This may be a data-entry discrepancy, or a sign that a document belongs to a different person.`,
      groups,
    ));
  }
  return out;
}

// ---------------------------------------------------------------- entry point

const TYPE_ORDER: ConflictType[] = [
  "medication_dose", "medication_status", "allergy", "allergy_reaction", "condition",
  "lab_value", "event_date", "demographic",
];
const PATTERN_ORDER: Conflict["pattern"][] = ["unexplained", "partially_explained", "documented_change"];

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
      PATTERN_ORDER.indexOf(a.pattern) - PATTERN_ORDER.indexOf(b.pattern) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}

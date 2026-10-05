/**
 * "Ask Records" — answers organizational questions about the loaded synthetic records.
 *
 * Deterministic and local (no AI). Every statement carries citations to a fact or to a
 * passage in a source document. It:
 *   • refuses medical-advice questions (diagnosis, treatment, dosing, risk, triage);
 *   • says so when the records don't contain enough evidence;
 *   • states disagreements explicitly instead of picking one source.
 *
 * An LLM can later sit on top of this: give it only the cited statements produced here
 * and require it to keep every citation.
 */
import type { Fact, RecordSet } from "../types";
import { ALLERGENS, CONDITIONS, IMAGING, LABS, MEDICATIONS, PROCEDURES, findTerms, type LexEntry } from "../normalize/lexicon";
import { displayName, factDate, sourceLabel } from "../conflicts/detect";
import { formatDate } from "../normalize/values";

export interface Citation {
  documentId: string;
  start: number;
  end: number;
  factId?: string;
}

export interface Statement {
  text: string;
  citations: Citation[];
  disagreement?: boolean;
}

export interface Answer {
  kind: "answer" | "insufficient" | "out_of_scope";
  summary: string;
  statements: Statement[];
  conflictIds: string[];
}

const cite = (f: Fact): Citation => ({ documentId: f.source.documentId, start: f.source.charStart, end: f.source.charEnd, factId: f.id });

const OUT_OF_SCOPE =
  /\b(should (?:i|we|she|he|they|the patient)|what (?:dose|dosage|treatment|medication) should|recommend\w*|advice|advise|diagnose|is (?:it|this|that) (?:safe|dangerous|serious|normal)|safe to|risk|prognosis|predict\w*|likelihood|chance of|treat (?:it|this)|how to treat|cure|emergency|urgent|go to the er|call 911|do (?:i|they|she|he) have|will (?:i|she|he|they) (?:get|develop)|what is wrong)\b/i;

const REFUSAL =
  "This tool only organizes what the loaded synthetic documents say. It does not give diagnoses, treatment or medication advice, risk estimates, or triage. For questions like this, a qualified clinician would need to review the real records.";

const ALL_TABLES: [LexEntry[], Fact["category"]][] = [
  [MEDICATIONS, "medication"], [CONDITIONS, "condition"], [ALLERGENS, "allergy"],
  [LABS, "lab"], [IMAGING, "imaging"], [PROCEDURES, "procedure"],
];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const STOP = new Set(
  "what which when where who how does do did is are was were the a an of in on for to and or any all records record documents document mention mentions mentioned first appear appears appeared these those this that there their about with from list show me tell between changed change same patient source sources".split(" "),
);

function termsIn(q: string): { entry: LexEntry; category: Fact["category"] }[] {
  const out: { entry: LexEntry; category: Fact["category"] }[] = [];
  for (const [table, category] of ALL_TABLES)
    for (const m of findTerms(q, table))
      if (!out.some((o) => o.entry.key === m.entry.key)) out.push({ entry: m.entry, category });
  // Very short lab aliases (k, na, cr) cause false hits in ordinary questions.
  return out.filter((o) => !(o.category === "lab" && o.entry.aliases.every((a) => a.length <= 2)));
}

function freeTerm(q: string): string | null {
  const words = q.toLowerCase().replace(/[^a-z0-9\- ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  return words.length ? words.join(" ") : null;
}

/** Find passages in raw documents that contain any of the given strings. */
export function searchDocuments(rs: RecordSet, needles: string[]): Statement[] {
  const out: Statement[] = [];
  const res = needles.map((n) => new RegExp(`(?<![a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "gi"));
  for (const d of rs.documents) {
    const cites: Citation[] = [];
    for (const re of res) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(d.text))) {
        const ls = d.text.lastIndexOf("\n", m.index) + 1;
        const le = d.text.indexOf("\n", m.index);
        const end = le < 0 ? d.text.length : le;
        if (!cites.some((c) => c.start === ls)) cites.push({ documentId: d.id, start: ls, end });
      }
    }
    if (cites.length)
      out.push({
        text: `${d.meta.documentTypeLabel} — ${formatDate(d.meta.recordDate)} (${d.meta.facility}): ${cites.length} passage${cites.length > 1 ? "s" : ""}.`,
        citations: cites,
      });
  }
  return out;
}

function conflictsFor(rs: RecordSet, factIds: Set<string>) {
  return rs.conflicts.filter((c) => c.factIds.some((id) => factIds.has(id)));
}

// ---------------------------------------------------------------- intents

function listCategory(rs: RecordSet, category: Fact["category"], noun: string): Answer {
  const facts = rs.facts.filter((f) => f.category === category);
  if (!facts.length) return insufficient(`No ${noun} were found in the loaded records.`);
  const byKey = new Map<string, Fact[]>();
  for (const f of facts) byKey.set(f.normalizedLabel, [...(byKey.get(f.normalizedLabel) ?? []), f]);
  const statements: Statement[] = [];
  const conflictIds = new Set<string>();
  for (const [key, fs] of byKey) {
    if (key === "no known drug allergies") {
      statements.push({ text: `"No known drug allergies" is recorded in ${docCount(fs)}.`, citations: fs.map(cite), disagreement: conflictsFor(rs, new Set(fs.map((f) => f.id))).length > 0 });
      continue;
    }
    const conflicts = conflictsFor(rs, new Set(fs.map((f) => f.id)));
    conflicts.forEach((c) => conflictIds.add(c.id));
    const variants = [...new Set(fs.map((f) => describe(f)))];
    let text = `${displayName(key)} — appears in ${docCount(fs)}`;
    if (variants.length > 1) text += `. Recorded as: ${variants.join("; ")}`;
    else if (variants[0]) text += ` (${variants[0]})`;
    if (conflicts.length) text += `. Sources disagree — flagged for review: ${conflicts.map((c) => c.title).join("; ")}.`;
    statements.push({ text, citations: fs.map(cite), disagreement: conflicts.length > 0 });
  }
  return {
    kind: "answer",
    summary: `${byKey.size} ${noun} appear in the records. Each line cites the passages it comes from.${conflictIds.size ? " Where sources disagree, both versions are listed — none is chosen as correct." : ""}`,
    statements,
    conflictIds: [...conflictIds],
  };
}

function describe(f: Fact): string {
  if (f.category === "medication") return `${f.value ?? "dose not stated"}, ${f.status}`;
  if (f.category === "lab") return `${f.value}${f.units ? " " + f.units : ""} on ${formatDate(f.eventDate)}`;
  if (f.category === "allergy") return f.status === "negated" ? "denied" : `reaction: ${f.detail.reaction ?? "not stated"}`;
  if (f.category === "condition") return f.status === "negated" ? "explicitly denied" : f.status;
  if (f.category === "imaging" || f.category === "procedure") return `${formatDate(f.eventDate)}${f.status === "referenced" ? " (as referenced)" : ""}`;
  return f.value ?? "";
}

function docCount(fs: Fact[]) {
  const n = new Set(fs.map((f) => f.source.documentId)).size;
  return `${n} source document${n === 1 ? "" : "s"}`;
}

function insufficient(summary: string): Answer {
  return { kind: "insufficient", summary, statements: [], conflictIds: [] };
}

function firstMention(rs: RecordSet, q: string): Answer {
  const terms = termsIn(q);
  if (!terms.length) {
    const t = freeTerm(q.replace(/when (was|were|did)|first|mentioned|appear(ed)?|start(ed)?/gi, ""));
    if (!t) return insufficient("I couldn't tell which item to look for. Try naming it, e.g. “When was atorvastatin first mentioned?”");
    const hits = searchDocuments(rs, [t]);
    if (!hits.length) return insufficient(`“${t}” does not appear in the loaded records.`);
    const docs = rs.documents.filter((d) => hits.some((h) => h.citations[0].documentId === d.id)).sort((a, b) => (a.meta.recordDate ?? "").localeCompare(b.meta.recordDate ?? ""));
    const first = hits.find((h) => h.citations[0].documentId === docs[0].id)!;
    return { kind: "answer", summary: `The earliest-dated document mentioning “${t}” is dated ${formatDate(docs[0].meta.recordDate)}.`, statements: [first], conflictIds: [] };
  }
  const statements: Statement[] = [];
  for (const { entry } of terms) {
    const fs = rs.facts.filter((f) => f.normalizedLabel === entry.key);
    const hits = searchDocuments(rs, entry.aliases.filter((a) => a.length > 2));
    if (!fs.length && !hits.length) { statements.push({ text: `${entry.display} does not appear in the loaded records.`, citations: [] }); continue; }
    // By document date (when it was written) — and separately the earliest date a record assigns.
    const byDoc = [...fs].sort((a, b) => (a.source.recordDate ?? "").localeCompare(b.source.recordDate ?? ""));
    if (byDoc.length) {
      const f = byDoc[0];
      statements.push({ text: `${entry.display} first appears in the ${sourceLabel(f)} (${f.source.facility}): “${f.source.excerpt.trim()}”`, citations: [cite(f)] });
      const byEvent = [...fs].sort((a, b) => factDate(a).localeCompare(factDate(b)))[0];
      if (byEvent.id !== f.id && factDate(byEvent) < (f.source.recordDate ?? ""))
        statements.push({ text: `A later record refers to an earlier date (${formatDate(factDate(byEvent))}): “${byEvent.source.excerpt.trim()}”`, citations: [cite(byEvent)] });
    } else {
      statements.push({ ...hits[0], text: `${entry.display} is mentioned in: ${hits[0].text}` });
    }
  }
  return { kind: "answer", summary: "Based on document dates in the loaded records. Records may not be complete, so an earlier mention could exist elsewhere.", statements, conflictIds: [] };
}

function mentions(rs: RecordSet, q: string): Answer {
  const terms = termsIn(q);
  const needles = terms.length ? terms.flatMap((t) => t.entry.aliases.filter((a) => a.length > 2)) : [freeTerm(q.replace(/which|documents?|mention(s|ed)?|records?|contain/gi, "")) ?? ""].filter(Boolean);
  if (!needles.length) return insufficient("I couldn't tell what to search for. Try “Which documents mention hypertension?”");
  const statements = searchDocuments(rs, needles);
  const label = terms.length ? terms.map((t) => t.entry.display).join(", ") : `“${needles[0]}”`;
  if (!statements.length) return insufficient(`No loaded document mentions ${label}.`);
  const facts = rs.facts.filter((f) => terms.some((t) => t.entry.key === f.normalizedLabel));
  const conflicts = conflictsFor(rs, new Set(facts.map((f) => f.id)));
  if (conflicts.length)
    statements.push({ text: `Note: sources disagree about ${label} — ${conflicts.map((c) => c.title).join("; ")}. See the Conflicts panel.`, citations: conflicts.flatMap((c) => c.factIds).map((id) => cite(rs.facts.find((f) => f.id === id)!)), disagreement: true });
  return { kind: "answer", summary: `${statements.filter((s) => !s.disagreement).length} document(s) mention ${label}. Matches include synonyms and brand names.`, statements, conflictIds: conflicts.map((c) => c.id) };
}

function conflictQuery(rs: RecordSet, q: string): Answer {
  const ql = q.toLowerCase();
  const filters: [RegExp, string[]][] = [
    [/dose|dosage|medication|drug|med\b/, ["medication_dose", "medication_status"]],
    [/allerg/, ["allergy", "allergy_reaction"]],
    [/lab|result|value/, ["lab_value"]],
    [/diagnos|condition|problem/, ["condition"]],
    [/date|when/, ["event_date"]],
    [/birth|dob|demograph|name|sex/, ["demographic"]],
  ];
  const types = filters.filter(([re]) => re.test(ql)).flatMap(([, t]) => t);
  const list = rs.conflicts.filter((c) => !types.length || types.includes(c.type));
  if (!list.length) return { kind: "answer", summary: types.length ? "No conflicts of that kind were detected in the loaded records. (Detection is rule-based and may miss some.)" : "No conflicts were detected in the loaded records.", statements: [], conflictIds: [] };
  const statements = list.map((c) => {
    const facts = c.factIds.map((id) => rs.facts.find((f) => f.id === id)!).filter(Boolean);
    const sides = c.groups.map((g) => `${g.label} in ${g.factIds.map((id) => { const f = rs.facts.find((x) => x.id === id)!; return `${f.source.documentType.toLowerCase()} (${formatDate(f.source.recordDate)})`; }).join(", ")}`);
    const explained = {
      unexplained: " No record documents a change that accounts for this.",
      partially_explained: " A documented change accounts for some of these records, but not all.",
      documented_change: " A documented change is consistent with these records.",
    }[c.pattern];
    return {
      text: `${c.title}. ${sides.join("; versus ")}.${explained}`,
      citations: facts.map(cite),
      disagreement: true,
    };
  });
  const unexplained = list.filter((c) => c.pattern !== "documented_change").length;
  return {
    kind: "answer",
    summary: `Yes — ${list.length} possible conflict${list.length > 1 ? "s" : ""} (${unexplained} not fully explained by a documented change). The sources disagree; this tool does not decide which is correct.`,
    statements,
    conflictIds: list.map((c) => c.id),
  };
}

function monthOf(s: string): number | null {
  const i = MONTHS.findIndex((m) => s.toLowerCase().startsWith(m.slice(0, 3)));
  return i < 0 ? null : i + 1;
}

function changedBetween(rs: RecordSet, q: string): Answer {
  const found = [...q.toLowerCase().matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)].map((m) => monthOf(m[0])!);
  const dated = rs.documents.filter((d) => d.meta.recordDate);
  const monthKey = (iso: string) => iso.slice(0, 7);
  const available = [...new Set(dated.map((d) => monthKey(d.meta.recordDate!)))].sort();
  let a: string | undefined, b: string | undefined;
  if (found.length >= 2) {
    a = available.find((k) => +k.slice(5) === found[0]);
    b = available.find((k) => +k.slice(5) === found[1]);
  } else if (available.length >= 2) {
    [a, b] = available.slice(-2);
  }
  if (!a || !b) return insufficient(`I need records from both periods to compare. Records are available for: ${available.map((k) => formatDate(k + "-01").replace(/ 1,/, "")).join(", ") || "none"}.`);
  const inMonth = (k: string) => rs.facts.filter((f) => f.source.recordDate && monthKey(f.source.recordDate) === k);
  const A = inMonth(a), B = inMonth(b);
  const nameA = formatDate(a + "-01").replace(/ 1,/, ""), nameB = formatDate(b + "-01").replace(/ 1,/, "");
  const statements: Statement[] = [];

  const meds = (fs: Fact[]) => fs.filter((f) => f.category === "medication");
  const keys = new Set([...meds(A), ...meds(B)].map((f) => f.normalizedLabel));
  for (const k of keys) {
    const fa = meds(A).filter((f) => f.normalizedLabel === k);
    const fb = meds(B).filter((f) => f.normalizedLabel === k);
    const name = displayName(k);
    const va = [...new Set(fa.filter((f) => f.status === "active" || f.status === "started").map((f) => f.value ?? "dose not stated"))];
    const vb = [...new Set(fb.filter((f) => f.status === "active" || f.status === "started").map((f) => f.value ?? "dose not stated"))];
    const changes = fb.filter((f) => ["changed", "discontinued", "held", "started"].includes(f.status) && f.source.section && !f.source.section.startsWith("Table"));
    for (const c of changes)
      statements.push({ text: `${nameB}: the ${sourceLabel(c)} records ${name} as ${c.status}${c.value ? ` (${c.value})` : ""}.`, citations: [cite(c)] });
    if (!fa.length && vb.length) statements.push({ text: `${name} appears in ${nameB} records (${vb.join("; ")}) but not in ${nameA} records.`, citations: fb.map(cite) });
    else if (fa.length && !fb.length) statements.push({ text: `${name} appears in ${nameA} records but is not mentioned in ${nameB} records. Absence is not evidence it was stopped.`, citations: fa.map(cite) });
    else if (va.join() !== vb.join() && vb.length)
      statements.push({ text: `${name}: ${nameA} records list ${va.join(" / ") || "no current dose"}; ${nameB} records list ${vb.join(" / ")}.`, citations: [...fa, ...fb].map(cite), disagreement: vb.length > 1 || va.length > 1 });
    else if (vb.length > 1)
      statements.push({ text: `${name}: ${nameB} records disagree with each other (${vb.join(" vs. ")}).`, citations: fb.map(cite), disagreement: true });
  }
  const conds = (fs: Fact[]) => fs.filter((f) => f.category === "condition" && f.status !== "negated");
  for (const f of conds(B)) if (!conds(A).some((x) => x.normalizedLabel === f.normalizedLabel) && !statements.some((s) => s.text.includes(displayName(f.normalizedLabel) + " is first")))
    statements.push({ text: `${displayName(f.normalizedLabel)} is first recorded in the ${nameB} records (${sourceLabel(f)}), not in ${nameA}.`, citations: [cite(f)] });
  for (const f of B.filter((x) => x.category === "condition" && x.status === "negated"))
    statements.push({ text: `The ${sourceLabel(f)} explicitly denies ${displayName(f.normalizedLabel).toLowerCase()}.`, citations: [cite(f)], disagreement: rs.conflicts.some((c) => c.factIds.includes(f.id)) });
  for (const f of B.filter((x) => x.category === "allergy")) if (!A.some((x) => x.category === "allergy" && x.normalizedLabel === f.normalizedLabel && x.detail.reaction === f.detail.reaction))
    statements.push({ text: `Allergy entry in ${nameB} not matched in ${nameA}: ${f.value}${f.detail.reaction ? ` (${f.detail.reaction})` : ""} — ${sourceLabel(f)}.`, citations: [cite(f)] });
  if (!statements.length) return insufficient(`No differences in medications, conditions, or allergies were found between ${nameA} and ${nameB} records.`);
  return {
    kind: "answer",
    summary: `Comparing documents dated in ${nameA} (${new Set(A.map((f) => f.source.documentId)).size}) with documents dated in ${nameB} (${new Set(B.map((f) => f.source.documentId)).size}). These are differences between documents, not a judgement about what actually changed.`,
    statements,
    conflictIds: [],
  };
}

// ---------------------------------------------------------------- router

export const EXAMPLE_QUESTIONS = [
  "What medications appear in these records?",
  "When was atorvastatin first mentioned?",
  "Which documents mention hypertension?",
  "Are there conflicting medication doses?",
  "What changed between the March and April records?",
  "What allergies are recorded?",
];

export function ask(rs: RecordSet, question: string): Answer {
  const q = question.trim();
  if (!q) return insufficient("Type a question about the loaded records.");
  if (!rs.documents.length) return insufficient("No records are loaded yet. Load the demo records or upload synthetic files first.");
  if (OUT_OF_SCOPE.test(q)) return { kind: "out_of_scope", summary: REFUSAL, statements: [], conflictIds: [] };
  const ql = q.toLowerCase();

  if (/conflict|disagree|discrepan|inconsisten|contradict|mismatch/.test(ql)) return conflictQuery(rs, q);
  if (/what (has )?changed|changes? between|difference between|differ between/.test(ql)) return changedBetween(rs, q);
  if (/first (mention|appear|record|list|note)|when was|when were|when did/.test(ql)) return firstMention(rs, q);
  if (/which (documents?|records?|notes?|sources?)|mention/.test(ql)) return mentions(rs, q);
  if (/medication|medicine|\bmeds?\b|drugs?|prescri/.test(ql) && !termsIn(q).length) return listCategory(rs, "medication", "medications");
  if (/allerg/.test(ql) && !termsIn(q).length) return listCategory(rs, "allergy", "allergy entries");
  if (/condition|diagnos|problem list|problems/.test(ql) && !termsIn(q).length) return listCategory(rs, "condition", "conditions");
  if (/\blabs?\b|results?|tests?/.test(ql) && !termsIn(q).length) return listCategory(rs, "lab", "lab tests");
  if (/imaging|scan|echo|x-ray|procedure/.test(ql) && !termsIn(q).length) {
    const a = listCategory(rs, "imaging", "imaging studies");
    const b = listCategory(rs, "procedure", "procedures");
    return { ...a, kind: a.statements.length || b.statements.length ? "answer" : "insufficient", statements: [...a.statements, ...b.statements] };
  }
  if (/provider|doctor|physician|clinic|hospital|facilit|institution/.test(ql)) {
    const statements: Statement[] = rs.documents.map((d) => ({
      text: `${d.meta.provider} — ${d.meta.facility} — ${d.meta.documentTypeLabel}, ${formatDate(d.meta.recordDate)}`,
      citations: [{ documentId: d.id, start: 0, end: Math.min(d.text.length, d.text.indexOf("\n\n") > 0 ? d.text.indexOf("\n\n") : 200) }],
    }));
    return { kind: "answer", summary: `${new Set(rs.documents.map((d) => d.meta.facility)).size} fictional facilities appear across ${rs.documents.length} documents.`, statements, conflictIds: [] };
  }

  // A specific item was named: summarize every fact about it, with disagreements.
  const terms = termsIn(q);
  if (terms.length) {
    const statements: Statement[] = [];
    const conflictIds: string[] = [];
    for (const t of terms) {
      const fs = rs.facts.filter((f) => f.normalizedLabel === t.entry.key);
      if (!fs.length) { statements.push({ text: `${t.entry.display} does not appear in the extracted facts.`, citations: [] }); continue; }
      for (const f of fs.sort((a, b) => (a.source.recordDate ?? "").localeCompare(b.source.recordDate ?? "")))
        statements.push({ text: `${sourceLabel(f)}: ${describe(f)}`, citations: [cite(f)] });
      const cs = conflictsFor(rs, new Set(fs.map((f) => f.id)));
      cs.forEach((c) => { conflictIds.push(c.id); statements.push({ text: `Sources disagree: ${c.title}. ${c.explanation}`, citations: c.factIds.map((id) => cite(rs.facts.find((f) => f.id === id)!)), disagreement: true }); });
    }
    return { kind: "answer", summary: `Everything the records state about ${terms.map((t) => t.entry.display).join(", ")}, in document order.`, statements, conflictIds };
  }

  const t = freeTerm(q);
  if (t) {
    const hits = searchDocuments(rs, [t]);
    if (hits.length) return { kind: "answer", summary: `Passages containing “${t}”.`, statements: hits, conflictIds: [] };
  }
  return insufficient("The loaded records don't contain enough evidence to answer that. Try asking about medications, conditions, allergies, labs, dates, or conflicts.");
}

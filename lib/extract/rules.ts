/**
 * Stage 2 — rule-based extraction (no AI, no network).
 *
 * Reads a RawDocument and emits Facts. Each fact records the exact character range of
 * the line/sentence/table row it came from, so the UI can always show the evidence.
 * Confidence reflects how structured the source was:
 *   0.95 table row or header field · 0.9 list item matching the lexicon
 *   0.7 list item not in the lexicon · 0.65 sentence in free text
 *
 * To replace this with an LLM, implement the Extractor interface in ./index.ts; the
 * provenance check there rejects any fact whose excerpt is not literally in the document.
 */
import type { DocumentMeta, Fact, FactCategory, FactDetail, FactStatus, RawDocument } from "../types";
import { parseHeader } from "../ingest/header";
import {
  ALLERGENS, CONDITIONS, IMAGING, LABS, MEDICATIONS, PROCEDURES,
  fallbackKey, findTerms, lookup, type LexEntry,
} from "../normalize/lexicon";
import { doseLabel, findDates, hash, normalizeFrequency, parseDose } from "../normalize/values";
import { parseCsv, splitSections, type Item, type Section } from "./sections";

export const RULES_EXTRACTOR = "rules-v1";

interface Draft {
  category: FactCategory;
  label: string;
  normalizedLabel: string;
  value: string | null;
  units?: string | null;
  status: FactStatus;
  eventDate: string | null;
  detail?: FactDetail;
  section: string | null;
  start: number;
  end: number;
  confidence: number;
}

class FactSink {
  facts: Fact[] = [];
  constructor(private doc: RawDocument) {}

  add(d: Draft) {
    const doc = this.doc;
    const page = doc.pages?.find((p) => d.start >= p.start && d.start < p.end)?.page ?? null;
    const id = `f_${hash([doc.id, d.category, d.normalizedLabel, d.status, d.start, d.value ?? ""].join("|"))}`;
    if (this.facts.some((f) => f.id === id)) return;
    this.facts.push({
      id,
      category: d.category,
      label: d.label,
      normalizedLabel: d.normalizedLabel,
      value: d.value,
      units: d.units ?? null,
      status: d.status,
      eventDate: d.eventDate,
      detail: d.detail ?? {},
      source: {
        documentId: doc.id,
        documentName: doc.fileName,
        documentType: doc.meta.documentType,
        provider: doc.meta.provider,
        facility: doc.meta.facility,
        recordDate: doc.meta.recordDate,
        section: d.section,
        page,
        excerpt: doc.text.slice(d.start, d.end),
        charStart: d.start,
        charEnd: d.end,
      },
      confidence: d.confidence,
      extractor: RULES_EXTRACTOR,
    });
  }
}

// ---------------------------------------------------------------- medications

const CHANGE_RE = /\b(increased|decreased|reduced|changed|titrated|adjusted|uptitrated|lowered|raised)\b[^.;]*?\bfrom\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|units?)\s+to\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|units?)/i;
const DISCONTINUE_RE = /\b(discontinu\w*|stopp?(?:ed)?|d\/c'?d?|ceased)\b/i;
const START_RE = /\b(start(?:ed)?|initiat\w*|begin|began|new(?:ly)? prescribed|commence\w*)\b/i;
const HOLD_RE = /\b(hold|held|paused)\b/i;
const HISTORICAL_LEAD = /\b(after|since|before|prior to|following)\s+(?:\w+\s+)?$/i;

function medStatusFromListItem(text: string): FactStatus {
  if (DISCONTINUE_RE.test(text)) return "discontinued";
  if (HOLD_RE.test(text)) return "held";
  if (START_RE.test(text)) return "started";
  return "active";
}

function medDetail(rest: string): FactDetail {
  const dose = parseDose(rest);
  return { doseAmount: dose?.amount, doseUnit: dose?.unit, frequency: normalizeFrequency(rest) };
}

function medValue(d: FactDetail) {
  return doseLabel(d.doseAmount, d.doseUnit, d.frequency);
}

function medFromListItem(sink: FactSink, item: Item, section: Section, date: string | null) {
  const terms = findTerms(item.text, MEDICATIONS);
  let entry: LexEntry | null = terms[0]?.entry ?? null;
  let label: string;
  let after: string;
  if (terms[0]) {
    label = item.text.slice(terms[0].index, terms[0].index + terms[0].length);
    after = item.text.slice(terms[0].index + terms[0].length);
  } else {
    // Unknown drug name: take the words before the first number.
    const m = item.text.match(/^([A-Za-z][A-Za-z \-]{1,40}?)\s+\d/);
    if (!m) return;
    label = m[1].trim();
    after = item.text.slice(m[1].length);
    entry = null;
  }
  const change = item.text.match(CHANGE_RE);
  if (change) return medChange(sink, item, section, date, entry, label, change);
  const detail = medDetail(after);
  sink.add({
    category: "medication",
    label,
    normalizedLabel: entry?.key ?? fallbackKey(label),
    value: medValue(detail),
    status: medStatusFromListItem(item.text),
    eventDate: date,
    detail,
    section: section.title,
    start: item.start,
    end: item.end,
    confidence: entry ? 0.9 : 0.7,
  });
}

function medChange(
  sink: FactSink, item: Item, section: Section, date: string | null,
  entry: LexEntry | null, label: string, m: RegExpMatchArray,
) {
  const detail: FactDetail = {
    doseAmount: Number(m[4]),
    doseUnit: m[5].toLowerCase(),
    previousDoseAmount: Number(m[2]),
    previousDoseUnit: m[3].toLowerCase(),
    frequency: normalizeFrequency(item.text.slice((m.index ?? 0) + m[0].length)) ?? normalizeFrequency(item.text),
    isChangeStatement: true,
  };
  sink.add({
    category: "medication",
    label,
    normalizedLabel: entry?.key ?? fallbackKey(label),
    value: `${detail.previousDoseAmount} ${detail.previousDoseUnit} → ${medValue(detail)}`,
    status: "changed",
    eventDate: date,
    detail,
    section: section.title,
    start: item.start,
    end: item.end,
    confidence: entry ? 0.8 : 0.6,
  });
}

/** In free text, only record a medication when a verb says something happened to it. */
function medsFromSentence(sink: FactSink, item: Item, section: Section, date: string | null) {
  for (const t of findTerms(item.text, MEDICATIONS)) {
    const label = item.text.slice(t.index, t.index + t.length);
    const before = item.text.slice(Math.max(0, t.index - 40), t.index);
    const after = item.text.slice(t.index + t.length, t.index + t.length + 60);
    const local = before.slice(-25) + label + after;
    const change = local.match(CHANGE_RE);
    if (change) { medChange(sink, item, section, date, t.entry, label, change); continue; }
    let status: FactStatus | null = null;
    if (DISCONTINUE_RE.test(local)) status = "discontinued";
    else if (HOLD_RE.test(local)) status = "held";
    else if (START_RE.test(local)) {
      // "follow-up after starting atorvastatin" describes the past, not a new start.
      const verb = before.match(/(start(?:ed|ing)?|initiat\w*)\s*$/i);
      if (verb && HISTORICAL_LEAD.test(before.slice(0, before.length - verb[0].length))) continue;
      if (/starting/i.test(before.slice(-12))) continue;
      status = "started";
    }
    if (!status) continue;
    const detail = medDetail(after.split(/[.;]/)[0]);
    sink.add({
      category: "medication",
      label,
      normalizedLabel: t.entry.key,
      value: medValue(detail),
      status,
      eventDate: date,
      detail,
      section: section.title,
      start: item.start,
      end: item.end,
      confidence: 0.65,
    });
  }
}

// ---------------------------------------------------------------- allergies

const NKDA_RE = /\b(nkda|nka|no known (?:drug )?allergies|no known allergies)\b/i;

function allergyFromItem(sink: FactSink, item: Item, section: Section, date: string | null, confidence = 0.9) {
  if (NKDA_RE.test(item.text)) {
    sink.add({
      category: "allergy", label: item.text, normalizedLabel: "no known drug allergies",
      value: "No known drug allergies", status: "negated", eventDate: date,
      section: section.title, start: item.start, end: item.end, confidence,
    });
    return;
  }
  const negated = /^(no|denies|not)\b/i.test(item.text) || /\btolerat(es|ed)\b/i.test(item.text);
  const allergenPart = item.text.split(/\s*[(:—–]\s*|\s+-\s+/)[0].replace(/^(no|denies)\s+(allergy|allergies)\s+(to\s+)?/i, "").trim();
  if (!allergenPart) return;
  const entry = lookup(allergenPart, ALLERGENS);
  const reaction = item.text.match(/\(([^)]+)\)/)?.[1] ?? item.text.split(/\s+[-—–:]\s+/)[1];
  sink.add({
    category: "allergy",
    label: allergenPart,
    normalizedLabel: entry?.key ?? fallbackKey(allergenPart),
    value: entry?.display ?? allergenPart,
    status: negated ? "negated" : "active",
    eventDate: date,
    detail: { reaction: reaction?.trim().toLowerCase() },
    section: section.title,
    start: item.start,
    end: item.end,
    confidence: entry ? confidence : 0.7,
  });
}

// ---------------------------------------------------------------- conditions

const NEGATION_LEAD = /^(no|denies|negative for|no history of|no hx of|no prior|without|never had)\b/i;
const NARRATIVE_NEGATION = /\b(denies|no history of|no hx of|negative for|no prior history of|no known history of)\s+(?:[\w-]+\s+){0,2}$/i;
const NARRATIVE_ASSERT = /\b(diagnosed with|found to (?:be in|have)|new diagnosis of|history of|known)\s+(?:[\w-]+\s+){0,2}$/i;

function conditionStatus(text: string): FactStatus {
  if (NEGATION_LEAD.test(text)) return "negated";
  if (/\bresolved\b/i.test(text)) return "resolved";
  if (/\b(history of|hx of|remote|s\/p)\b/i.test(text)) return "historical";
  if (/\b(possible|probable|rule out|r\/o|suspected|questionable)\b/i.test(text)) return "possible";
  return "active";
}

function conditionFromItem(sink: FactSink, item: Item, section: Section, date: string | null) {
  const terms = findTerms(item.text, CONDITIONS);
  const status = conditionStatus(item.text);
  const label = terms[0]
    ? item.text.slice(terms[0].index, terms[0].index + terms[0].length)
    : item.text.replace(NEGATION_LEAD, "").replace(/\([^)]*\)/g, "").split(/\s+[-—–]\s+|,/)[0].trim();
  if (!label || label.length < 3) return;
  sink.add({
    category: "condition",
    label,
    normalizedLabel: terms[0]?.entry.key ?? fallbackKey(label),
    value: item.text.replace(/\s*\.$/, ""),
    status,
    eventDate: date,
    section: section.title,
    start: item.start,
    end: item.end,
    confidence: terms[0] ? 0.9 : 0.7,
  });
}

function conditionsFromSentence(sink: FactSink, item: Item, section: Section, date: string | null, findingsMode = false) {
  for (const t of findTerms(item.text, CONDITIONS)) {
    const before = item.text.slice(0, t.index);
    let status: FactStatus | null = null;
    if (NARRATIVE_NEGATION.test(before)) status = "negated";
    else if (NARRATIVE_ASSERT.test(before)) status = /history of\s/i.test(before.slice(-30)) ? "historical" : "active";
    else if (findingsMode && !/\bno\b/i.test(before)) status = "active";
    if (!status) continue;
    sink.add({
      category: "condition",
      label: item.text.slice(t.index, t.index + t.length),
      normalizedLabel: t.entry.key,
      value: item.text.replace(/\s*\.$/, ""),
      status,
      eventDate: date,
      section: section.title,
      start: item.start,
      end: item.end,
      confidence: findingsMode ? 0.7 : 0.65,
    });
  }
}

// ---------------------------------------------------------------- labs

const LAB_LINE = /^(.+?)(?:\s*[:=]\s*|\s+)([<>]?\d+(?:\.\d+)?)\s*(%|[A-Za-zµ]+(?:\/[A-Za-z0-9.^]+)*)?/;

function labFromItem(sink: FactSink, item: Item, section: Section, meta: DocumentMeta, requireLexicon: boolean) {
  const m = item.text.match(LAB_LINE);
  if (!m) return false;
  const name = m[1].replace(/\s*\(.*$/, "").trim();
  const entry = lookup(name, LABS) as (LexEntry & { units?: string }) | null;
  if (!entry && (requireLexicon || !m[3])) return false;
  if (entry && !entry.aliases.includes(name.toLowerCase()) && name.split(/\s+/).length > 4) return false;
  const value = m[2];
  const units = m[3] && !/^(collected|on|from|in)$/i.test(m[3]) ? m[3] : entry?.units ?? null;
  const dated = findDates(item.text)[0]?.iso;
  sink.add({
    category: "lab",
    label: name,
    normalizedLabel: entry?.key ?? fallbackKey(name),
    value,
    units,
    status: "recorded",
    eventDate: dated ?? meta.collectionDate ?? meta.recordDate,
    detail: { numericValue: Number(value.replace(/[<>]/, "")) },
    section: section.title,
    start: item.start,
    end: item.end,
    confidence: entry ? 0.9 : 0.7,
  });
  return true;
}

// ---------------------------------------------------------------- imaging & procedures

function studyFromText(
  sink: FactSink, item: Item, section: Section, doc: RawDocument, mode: "exam" | "list" | "sentence",
) {
  const tables: [LexEntry[], FactCategory][] = [[PROCEDURES, "procedure"], [IMAGING, "imaging"]];
  for (const [table, category] of tables) {
    for (const t of findTerms(item.text, table)) {
      const dated = findDates(item.text)[0]?.iso ?? null;
      let status: FactStatus = "performed";
      let date: string | null = dated;
      if (mode === "sentence") {
        if (/\b(ordered|scheduled|planned|recommend\w*|referr\w*|will)\b/i.test(item.text)) continue;
        const today = /\btoday\b/i.test(item.text);
        const happened = /\b(underwent|performed|showed|shows|revealed|demonstrated|completed)\b/i.test(item.text);
        if (!happened || (!dated && !today)) continue;
        date = dated ?? doc.meta.recordDate;
        if (category === "imaging" && !today) status = "referenced";
      } else if (mode === "exam") {
        date = doc.meta.recordDate;
      } else {
        date = dated ?? doc.meta.recordDate;
        if (/per patient report|reported|history of/i.test(item.text)) status = "referenced";
      }
      sink.add({
        category,
        label: item.text.slice(t.index, t.index + t.length),
        normalizedLabel: t.entry.key,
        value: t.entry.display,
        status,
        eventDate: date,
        section: section.title,
        start: item.start,
        end: item.end,
        confidence: mode === "sentence" ? 0.65 : status === "referenced" ? 0.75 : 0.9,
      });
    }
  }
}

// ---------------------------------------------------------------- header facts

function headerFacts(sink: FactSink, doc: RawDocument) {
  const fields = parseHeader(doc.text);
  const field = (k: string) => fields.find((f) => f.key === k);
  const add = (k: string, label: string, key: string, value: string | undefined) => {
    const f = field(k);
    if (!f || !value) return;
    sink.add({
      category: "demographic", label, normalizedLabel: key, value, status: "recorded",
      eventDate: doc.meta.recordDate, section: "Header", start: f.start, end: f.end, confidence: 0.95,
    });
  };
  add("patientName", "Patient name", "patient name", doc.meta.patientName?.replace(/\s*\(fictional\)\s*/i, "").trim());
  add("dob", "Date of birth", "date of birth", doc.meta.dob);
  add("sex", "Sex", "sex", doc.meta.sex);

  const typeLine = field("documentType") ?? field("recordDate");
  if (doc.meta.documentType === "Discharge summary" && (doc.meta.admissionDate || doc.meta.dischargeDate)) {
    const a = field("admissionDate");
    const d = field("dischargeDate");
    const start = Math.min(a?.start ?? Infinity, d?.start ?? Infinity);
    const end = Math.max(a?.end ?? 0, d?.end ?? 0);
    sink.add({
      category: "hospitalization",
      label: "Hospitalization",
      normalizedLabel: "hospitalization",
      value: `${doc.meta.admissionDate ?? "?"} to ${doc.meta.dischargeDate ?? "?"}`,
      status: "recorded",
      eventDate: doc.meta.admissionDate ?? doc.meta.dischargeDate ?? null,
      section: "Header",
      start, end, confidence: 0.95,
    });
  } else if (
    typeLine && doc.meta.recordDate &&
    ["Primary care note", "Specialist note", "Procedure note", "Other"].includes(doc.meta.documentType)
  ) {
    sink.add({
      category: "visit",
      label: doc.meta.documentTypeLabel,
      normalizedLabel: `visit ${doc.meta.recordDate}`,
      value: doc.meta.documentTypeLabel,
      status: "recorded",
      eventDate: doc.meta.recordDate,
      section: "Header",
      start: typeLine.start, end: typeLine.end, confidence: 0.95,
    });
  }
}

// ---------------------------------------------------------------- CSV tables

function pick(cells: Record<string, string>, names: string[]) {
  for (const n of names) if (cells[n] !== undefined && cells[n] !== "") return cells[n];
  return undefined;
}

function csvFacts(sink: FactSink, doc: RawDocument) {
  const table = parseCsv(doc.text);
  if (!table) return;
  const has = (names: string[]) => names.some((n) => table.columns.includes(n));
  for (const row of table.rows) {
    const c = row.cells;
    const section = `Table row ${row.rowNumber}`;
    const base = { section, start: row.start, end: row.end, confidence: 0.95 };
    if (has(["test", "analyte", "component", "test_name", "lab"]) && has(["result", "value"])) {
      const name = pick(c, ["test", "analyte", "component", "test_name", "lab"]) ?? "";
      const value = pick(c, ["result", "value"]) ?? "";
      const entry = lookup(name, LABS);
      sink.add({
        ...base,
        category: "lab",
        label: name,
        normalizedLabel: entry?.key ?? fallbackKey(name),
        value,
        units: pick(c, ["units", "unit"]) ?? null,
        status: "recorded",
        eventDate: findDates(pick(c, ["collected", "collection_date", "date"]) ?? "")[0]?.iso ?? doc.meta.collectionDate ?? doc.meta.recordDate,
        detail: {
          numericValue: Number(value.replace(/[<>]/, "")),
          referenceRange: pick(c, ["reference_range", "ref_range", "range"]),
          flag: pick(c, ["flag"]),
        },
      });
    } else if (has(["medication", "drug", "medication_name"])) {
      const name = pick(c, ["medication", "drug", "medication_name"]) ?? "";
      const entry = lookup(name, MEDICATIONS);
      const detail = medDetail(`${pick(c, ["dose", "strength"]) ?? ""} ${pick(c, ["frequency", "sig", "directions"]) ?? ""}`);
      const statusRaw = pick(c, ["status"]) ?? "active";
      sink.add({
        ...base,
        category: "medication",
        label: name,
        normalizedLabel: entry?.key ?? fallbackKey(name),
        value: medValue(detail),
        status: medStatusFromListItem(statusRaw),
        eventDate: doc.meta.recordDate,
        detail,
      });
    } else if (has(["allergen", "allergy"])) {
      const name = pick(c, ["allergen", "allergy"]) ?? "";
      const text = `${name}${c.reaction ? ` (${c.reaction})` : ""}`;
      allergyFromItem(sink, { text, start: row.start, end: row.end, bullet: true }, { title: section, kind: "allergies", items: [] }, doc.meta.recordDate, 0.95);
    } else if (has(["condition", "diagnosis", "problem"])) {
      const name = pick(c, ["condition", "diagnosis", "problem"]) ?? "";
      const status = (pick(c, ["status"]) ?? "").toLowerCase();
      const text = status === "denied" || status === "negated" ? `No history of ${name}` : name;
      conditionFromItem(sink, { text, start: row.start, end: row.end, bullet: true }, { title: section, kind: "conditions", items: [] }, doc.meta.recordDate);
    }
  }
}

// ---------------------------------------------------------------- entry point

function headerEnd(text: string): number {
  const blank = text.search(/\n\s*\n/);
  return blank < 0 ? 0 : blank;
}

export function extractWithRules(doc: RawDocument): Fact[] {
  const sink = new FactSink(doc);
  headerFacts(sink, doc);
  if (doc.format === "csv") {
    csvFacts(sink, doc);
    return sink.facts;
  }

  const date = doc.meta.recordDate;
  const isImagingDoc = doc.meta.documentType === "Imaging report";
  const sections = splitSections(doc.text, parseHeader(doc.text).length ? headerEnd(doc.text) : 0);

  for (const s of sections) {
    for (const item of s.items) {
      switch (s.kind) {
        case "medications":
          if (item.bullet || /\d/.test(item.text)) medFromListItem(sink, item, s, date);
          break;
        case "allergies":
          allergyFromItem(sink, item, s, date);
          break;
        case "conditions":
          if (item.bullet) conditionFromItem(sink, item, s, date);
          else conditionsFromSentence(sink, item, s, date);
          break;
        case "labs":
          labFromItem(sink, item, s, doc.meta, false);
          break;
        case "findings":
          labFromItem(sink, item, s, doc.meta, true);
          conditionsFromSentence(sink, item, s, date, true);
          break;
        case "exam":
          studyFromText(sink, item, s, doc, "exam");
          break;
        case "procedures":
          studyFromText(sink, item, s, doc, "list");
          break;
        case "plan":
        case "narrative":
        case "other":
          medsFromSentence(sink, item, s, date);
          conditionsFromSentence(sink, item, s, date);
          studyFromText(sink, item, s, doc, "sentence");
          break;
      }
    }
  }

  // An imaging report with no EXAM section: take the study from the document type line.
  if (isImagingDoc && !sink.facts.some((f) => f.category === "imaging")) {
    const typeField = parseHeader(doc.text).find((f) => f.key === "documentType");
    if (typeField) {
      studyFromText(sink, { text: doc.text.slice(typeField.start, typeField.end), start: typeField.start, end: typeField.end, bullet: false },
        { title: "Header", kind: "exam", items: [] }, doc, "exam");
    }
  }
  return sink.facts;
}

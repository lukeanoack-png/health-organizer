/**
 * Provenance-first data model.
 *
 *   RawDocument  — the uploaded/demo file's text, kept separately and never modified.
 *   Fact         — one extracted claim. It always points back to a RawDocument and to
 *                  the exact character range of its supporting excerpt.
 *   Conflict     — references Fact IDs. It never creates a replacement fact and never
 *                  picks a "winning" source.
 *   ConflictAnnotation — a human's organizational label for a conflict. Stored apart
 *                  from the evidence; changing it changes nothing else.
 */

export type DocumentType =
  | "Primary care note"
  | "Specialist note"
  | "Lab report"
  | "Medication list"
  | "Discharge summary"
  | "Imaging report"
  | "Procedure note"
  | "Other";

export interface PageSpan {
  page: number;
  start: number; // char offset in RawDocument.text (inclusive)
  end: number; // exclusive
}

export interface RawDocument {
  id: string;
  fileName: string;
  format: "txt" | "csv" | "docx" | "pdf";
  origin: "demo" | "upload";
  /** Full extracted text. Highlighting uses char offsets into this string. */
  text: string;
  pages?: PageSpan[];
  /** Metadata read from the document header (each with the line it came from). */
  meta: DocumentMeta;
  /** True if the text carries a SYNTHETIC marker. Uploads without one are flagged. */
  syntheticMarker: boolean;
  ingestNotes: string[];
}

export interface DocumentMeta {
  documentType: DocumentType;
  documentTypeLabel: string; // as written, e.g. "Cardiology Consultation"
  provider: string;
  facility: string;
  recordDate: string | null; // ISO yyyy-mm-dd
  patientName?: string;
  dob?: string;
  sex?: string;
  admissionDate?: string;
  dischargeDate?: string;
  collectionDate?: string;
}

export type FactCategory =
  | "demographic"
  | "condition"
  | "medication"
  | "allergy"
  | "lab"
  | "procedure"
  | "imaging"
  | "visit"
  | "hospitalization";

/**
 * Status vocabulary. "listed" means the source lists it as current; "negated" means
 * the source explicitly denies it (e.g. "NKDA", "no history of atrial fibrillation").
 */
export type FactStatus =
  | "active"
  | "started"
  | "changed"
  | "discontinued"
  | "held"
  | "historical"
  | "resolved"
  | "negated"
  | "possible"
  | "performed"
  | "referenced"
  | "recorded";

export interface SourceRef {
  documentId: string;
  documentName: string;
  documentType: DocumentType;
  provider: string;
  facility: string;
  recordDate: string | null;
  section: string | null;
  page: number | null;
  excerpt: string;
  charStart: number;
  charEnd: number;
}

export interface Fact {
  id: string;
  category: FactCategory;
  /** Text as written in the source, e.g. "Zestril". */
  label: string;
  /** Canonical comparison key, e.g. "lisinopril". */
  normalizedLabel: string;
  /** Display value, e.g. "10 mg once daily", "7.4", "Penicillin". */
  value: string | null;
  units: string | null;
  status: FactStatus;
  /** Date the fact refers to (collection date, start date, procedure date...). */
  eventDate: string | null;
  /** Structured detail used by conflict rules. Never shown without the source. */
  detail: FactDetail;
  source: SourceRef;
  /** 0–1. For rule extraction this reflects how structured the source line was. */
  confidence: number;
  extractor: string;
}

export interface FactDetail {
  doseAmount?: number;
  doseUnit?: string;
  frequency?: string;
  previousDoseAmount?: number;
  previousDoseUnit?: string;
  numericValue?: number;
  reaction?: string;
  referenceRange?: string;
  flag?: string;
  /** For medication facts that describe a change rather than a list entry. */
  isChangeStatement?: boolean;
}

export type ConflictType =
  | "medication_dose"
  | "medication_status"
  | "allergy"
  | "allergy_reaction"
  | "condition"
  | "lab_value"
  | "event_date"
  | "demographic";

/**
 * Explanation state — what the records themselves document, never a verdict:
 *   unexplained:          sources disagree and no record documents a change between them.
 *   partially_explained:  a record documents a change that accounts for some of the differing
 *                         claims, but other claims are inconsistent with it.
 *   documented_change:    a documented change is consistent with every differing claim.
 * All three are still shown and still need a human to review them.
 */
export type ConflictPattern = "unexplained" | "partially_explained" | "documented_change";

/**
 * A dated observation tied to the claims it is about.
 *   explained:   these claims are consistent with a documented change
 *   unexplained: these claims are not accounted for by anything in the records
 *   context:     a passage that documents a change (evidence, not a resolution)
 */
export interface ConflictNote {
  kind: "explained" | "unexplained" | "context";
  text: string;
  factIds: string[];
}

export interface Conflict {
  id: string;
  type: ConflictType;
  subject: string; // normalized label
  title: string;
  explanation: string; // neutral wording, never picks a side
  pattern: ConflictPattern;
  /** Every fact involved, chronological. */
  factIds: string[];
  /** The competing claims, grouped by what they assert, for side-by-side display. Not ranked. */
  groups: { label: string; factIds: string[] }[];
  /** Neutral, dated observations, each linked to the claims it concerns. */
  observations: ConflictNote[];
  /** Facts that document a change and may provide context (not "the answer"). */
  contextFactIds: string[];
}

export type ReviewStatus =
  | "unresolved"
  | "reviewed"
  | "explained_by_timeline"
  | "likely_documentation_error";

export interface ConflictAnnotation {
  conflictId: string;
  /** Hash of the fact IDs at the time of review, to notice when new evidence arrives. */
  evidenceKey: string;
  status: ReviewStatus;
  note: string;
  updatedAt: string;
}

export type TimelineEventType =
  | "visit"
  | "hospitalization"
  | "medication_started"
  | "medication_changed"
  | "medication_discontinued"
  | "diagnosis_recorded"
  | "lab"
  | "imaging"
  | "procedure";

export interface TimelineEvent {
  id: string;
  date: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  factIds: string[];
  documentIds: string[];
}

export interface RecordSet {
  documents: RawDocument[];
  facts: Fact[];
  conflicts: Conflict[];
  timeline: TimelineEvent[];
}

"use client";

import { createContext, useContext } from "react";
import type { AnnotationMap } from "@/lib/annotations";
import type { Conflict, Fact, RawDocument, RecordSet, ReviewStatus } from "@/lib/types";

export type View =
  | "overview" | "timeline" | "medications" | "conditions" | "allergies" | "labs"
  | "studies" | "visits" | "providers" | "conflicts" | "sources" | "ask";

/** What the evidence panel shows: one document plus the passages to highlight. */
export interface EvidenceTarget {
  documentId: string;
  ranges: { start: number; end: number }[];
  factIds: string[];
  heading?: string;
}

export interface RecordsCtx {
  rs: RecordSet;
  busy: boolean;
  doc: (id: string) => RawDocument | undefined;
  fact: (id: string) => Fact | undefined;
  /** Stable source ID per document in chronological order: A, B, C… */
  letter: (documentId: string) => string;
  /** Conflicts in which this fact is one of the competing claims (not mere context). */
  conflictsForFact: (factId: string) => Conflict[];
  /** Open the evidence panel for facts from one document (all passages highlighted). */
  openFacts: (factIds: string[], heading?: string) => void;
  openEvidence: (t: EvidenceTarget) => void;
  annotations: AnnotationMap;
  setReview: (c: Conflict, patch: { status?: ReviewStatus; note?: string }) => void;
  /** Navigate; optionally open a specific conflict's evidence on the Conflicts page. */
  go: (v: View, opts?: { conflictId?: string }) => void;
  focusConflictId: string | null;
}

export const Records = createContext<RecordsCtx | null>(null);

export function useRecords(): RecordsCtx {
  const c = useContext(Records);
  if (!c) throw new Error("useRecords outside provider");
  return c;
}

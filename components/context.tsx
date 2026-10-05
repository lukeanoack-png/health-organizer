"use client";

import { createContext, useContext } from "react";
import type { AnnotationMap } from "@/lib/annotations";
import type { Conflict, Fact, RawDocument, RecordSet, ReviewStatus } from "@/lib/types";

export type View =
  | "overview" | "timeline" | "medications" | "conditions" | "allergies" | "labs"
  | "studies" | "visits" | "providers" | "conflicts" | "sources" | "ask";

/** What the evidence drawer shows: a document plus the passages to highlight. */
export interface EvidenceTarget {
  documentId: string;
  ranges: { start: number; end: number }[];
  factIds: string[];
  heading?: string;
}

export interface RecordsCtx {
  rs: RecordSet;
  doc: (id: string) => RawDocument | undefined;
  fact: (id: string) => Fact | undefined;
  /** Stable letter per document in chronological order: A, B, C… */
  letter: (documentId: string) => string;
  conflictsForFact: (factId: string) => Conflict[];
  openFact: (factId: string, heading?: string) => void;
  openEvidence: (t: EvidenceTarget) => void;
  annotations: AnnotationMap;
  setReview: (c: Conflict, patch: { status?: ReviewStatus; note?: string }) => void;
  isOpen: (c: Conflict) => boolean;
  go: (v: View) => void;
}

export const Records = createContext<RecordsCtx | null>(null);

export function useRecords(): RecordsCtx {
  const c = useContext(Records);
  if (!c) throw new Error("useRecords outside provider");
  return c;
}

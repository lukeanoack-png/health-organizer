/**
 * Human review labels for conflicts. Stored separately from documents and facts (browser
 * localStorage, per viewer). Setting a label never changes, hides, or deletes evidence.
 */
import type { Conflict, ConflictAnnotation, ReviewStatus } from "./types";
import { hash } from "./normalize/values";

const KEY = "record-organizer.annotations.v1";

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  unresolved: "Unresolved",
  reviewed: "Reviewed",
  explained_by_timeline: "Explained by timeline",
  likely_documentation_error: "Likely documentation error",
};

export type AnnotationMap = Record<string, ConflictAnnotation>;

export function evidenceKey(c: Conflict): string {
  return hash([...c.factIds].sort().join(","));
}

export function loadAnnotations(): AnnotationMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AnnotationMap) : {};
  } catch {
    return {};
  }
}

export function saveAnnotations(map: AnnotationMap) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable: annotations last for this session only */
  }
}

export function annotate(map: AnnotationMap, c: Conflict, patch: Partial<Pick<ConflictAnnotation, "status" | "note">>): AnnotationMap {
  const prev = map[c.id];
  return {
    ...map,
    [c.id]: {
      conflictId: c.id,
      status: patch.status ?? prev?.status ?? "unresolved",
      note: patch.note ?? prev?.note ?? "",
      evidenceKey: evidenceKey(c),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function statusOf(map: AnnotationMap, c: Conflict): ReviewStatus {
  return map[c.id]?.status ?? "unresolved";
}

/** True if facts were added/removed since a human last labelled this conflict. */
export function evidenceChanged(map: AnnotationMap, c: Conflict): boolean {
  const a = map[c.id];
  return !!a && a.status !== "unresolved" && a.evidenceKey !== evidenceKey(c);
}

/**
 * The whole pipeline in one place:
 *
 *   files ──► ingest (lib/ingest) ──► RawDocument[]   (kept as-is, never modified)
 *                                         │
 *                                         ▼
 *                       extract (lib/extract, swappable Extractor)
 *                                         │
 *                       verifyProvenance  (drops facts whose quote isn't in the doc)
 *                                         │
 *                                         ▼
 *                                     Fact[] ──► detectConflicts (lib/conflicts)
 *                                         └────► buildTimeline   (lib/timeline)
 *
 * Normalization (lib/normalize) is used by extraction to produce comparison keys.
 * Presentation (components/) only reads the RecordSet returned here.
 */
import type { RawDocument, RecordSet } from "./types";
import { rulesExtractor, verifyProvenance, type Extractor } from "./extract";
import { detectConflicts } from "./conflicts/detect";
import { buildTimeline } from "./timeline/build";

export async function processDocuments(
  documents: RawDocument[],
  extractor: Extractor = rulesExtractor,
): Promise<RecordSet & { rejected: number }> {
  const raw = (await Promise.all(documents.map((d) => extractor.extract(d)))).flat();
  const { kept, rejected } = verifyProvenance(raw, documents);
  return {
    documents,
    facts: kept,
    conflicts: detectConflicts(kept),
    timeline: buildTimeline(kept),
    rejected: rejected.length,
  };
}

/**
 * Extraction stage contract. Anything that turns a RawDocument into Facts implements
 * `Extractor` — today the rules extractor, later an LLM (see ./llm.ts).
 *
 * `verifyProvenance` is the guard that makes swapping extractors safe: a fact survives
 * only if its excerpt is literally present at its stated offsets in the source text.
 * An LLM that paraphrases or invents a passage has that fact dropped, not displayed.
 */
import type { Fact, RawDocument } from "../types";
import { extractWithRules, RULES_EXTRACTOR } from "./rules";

export interface Extractor {
  name: string;
  extract(doc: RawDocument): Promise<Fact[]> | Fact[];
}

export const rulesExtractor: Extractor = {
  name: RULES_EXTRACTOR,
  extract: extractWithRules,
};

export interface ProvenanceReport {
  kept: Fact[];
  rejected: { fact: Fact; reason: string }[];
}

export function verifyProvenance(facts: Fact[], documents: RawDocument[]): ProvenanceReport {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const kept: Fact[] = [];
  const rejected: ProvenanceReport["rejected"] = [];
  for (const f of facts) {
    const doc = byId.get(f.source.documentId);
    if (!doc) { rejected.push({ fact: f, reason: "Source document not found." }); continue; }
    if (!f.source.excerpt.trim()) { rejected.push({ fact: f, reason: "Empty excerpt." }); continue; }
    if (doc.text.slice(f.source.charStart, f.source.charEnd) !== f.source.excerpt) {
      // Allow an extractor that only returns the excerpt: locate it and fix the offsets.
      const at = doc.text.indexOf(f.source.excerpt);
      if (at < 0) { rejected.push({ fact: f, reason: "Excerpt does not appear in the source document." }); continue; }
      kept.push({ ...f, source: { ...f.source, charStart: at, charEnd: at + f.source.excerpt.length } });
      continue;
    }
    kept.push(f);
  }
  return { kept, rejected };
}

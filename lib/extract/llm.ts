/**
 * PLACEHOLDER — LLM extractor (not used in the first version; no paid API required).
 *
 * How to plug one in later without touching the rest of the app:
 *   1. Implement `extract(doc)` below: send `doc.text` with EXTRACTION_INSTRUCTIONS to a
 *      server-side route (keep the API key on the server, never in the browser).
 *   2. Map each returned item to a `Fact` (see ../types.ts). `source.excerpt` must be a
 *      verbatim quote from `doc.text`; set `extractor` to the model name and `confidence`
 *      from the model's self-report.
 *   3. In lib/pipeline.ts pass `llmExtractor` instead of `rulesExtractor`.
 *
 * `verifyProvenance` (./index.ts) drops any fact whose quote is not in the document, so a
 * hallucinated or paraphrased fact can never reach the screen. Conflict detection,
 * timeline and search work unchanged because they only consume Facts.
 */
import type { Extractor } from "./index";

export const EXTRACTION_INSTRUCTIONS = `You organize SYNTHETIC health records. Extract only what the
document states. For every item return: category, label as written, status, value, units,
event_date, section, and an exact verbatim quote from the document that supports it.
Do not infer diagnoses, do not resolve disagreements, do not add facts that are not written.`;

export const llmExtractor: Extractor = {
  name: "llm-placeholder",
  extract() {
    throw new Error("LLM extraction is not configured in this prototype. Use the rules extractor.");
  },
};

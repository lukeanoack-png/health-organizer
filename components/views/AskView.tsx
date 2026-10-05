"use client";

import { useRef, useState } from "react";
import { ask, EXAMPLE_QUESTIONS, type Answer, type Citation } from "@/lib/query/ask";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "../context";
import { SourceId, TYPE_SHORT, shortDate } from "../ui";
import { IconArrowRight, IconInfo, IconSearch, IconUnresolved } from "../icons";

const STARTERS = EXAMPLE_QUESTIONS.slice(0, 3);
const MORE = [...EXAMPLE_QUESTIONS.slice(3), "Which documents mention apixaban?", "What procedures are recorded?", "Which providers appear in these records?"];

/** Citations grouped per document, styled like every other source chip. */
function Citations({ citations }: { citations: Citation[] }) {
  const { doc, letter, openEvidence } = useRecords();
  const byDoc = new Map<string, Citation[]>();
  for (const c of citations) byDoc.set(c.documentId, [...(byDoc.get(c.documentId) ?? []), c]);
  const docs = [...byDoc].sort(([a], [b]) => letter(a).localeCompare(letter(b)));
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {docs.map(([id, cs]) => {
        const d = doc(id);
        if (!d) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => openEvidence({ documentId: id, ranges: cs.map((c) => ({ start: c.start, end: c.end })), factIds: cs.flatMap((c) => (c.factId ? [c.factId] : [])), heading: "Cited in answer" })}
            aria-label={`Source ${letter(id)}: ${TYPE_SHORT[d.meta.documentType]}, ${formatDate(d.meta.recordDate)}. Open cited passage${cs.length > 1 ? "s" : ""}.`}
            title={cs.map((c) => `“${d.text.slice(c.start, c.end).trim()}”`).join("\n")}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface py-[3px] pl-[3px] pr-2 text-xs font-medium text-ink hover:border-ink/30 hover:bg-subtle"
          >
            <SourceId id={letter(id)} />
            {TYPE_SHORT[d.meta.documentType]} <span className="text-muted">· {shortDate(d.meta.recordDate)}</span>
            {cs.length > 1 && <span className="text-muted">×{cs.length}</span>}
          </button>
        );
      })}
    </span>
  );
}

const KIND_HEADING: Record<Answer["kind"], string> = {
  answer: "What the records say",
  insufficient: "No supporting evidence found",
  out_of_scope: "Outside what this tool answers",
};

function AnswerBlock({ q, a }: { q: string; a: Answer }) {
  const disagree = a.statements.some((s) => s.disagreement);
  return (
    <article className="card overflow-hidden">
      <header className="border-b border-line px-5 py-3.5">
        <p className="text-xs font-semibold text-muted">You asked</p>
        <p className="mt-0.5 font-semibold text-ink">{q}</p>
      </header>
      <div className="px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          {a.kind !== "answer" && <IconInfo size={16} />}
          {KIND_HEADING[a.kind]}
          {disagree && <span className="inline-flex items-center gap-1 text-xs font-semibold text-review"><IconUnresolved size={13} />Sources disagree</span>}
        </h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{a.summary}</p>
        {a.kind === "insufficient" && <p className="mt-2 text-sm text-muted">Try naming a medication, condition, lab test or month — or browse the sections in the sidebar.</p>}
        {a.statements.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {a.statements.map((s, j) => (
              <li key={j} className="py-3">
                <p className="text-sm leading-relaxed text-ink">
                  {s.disagreement && <span className="mr-1.5 font-semibold text-review">Conflicting claims:</span>}
                  {s.text}
                </p>
                {s.citations.length > 0
                  ? <div className="mt-2"><Citations citations={s.citations} /></div>
                  : <p className="mt-1 text-xs text-muted">No supporting passage.</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function AskView() {
  const { rs, busy } = useRecords();
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<{ q: string; a: Answer; n: number }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const submit = (question: string) => {
    if (!question.trim() || busy) return;
    setHistory((h) => [{ q: question, a: ask(rs, question), n: h.length }, ...h]);
    setQ("");
    input.current?.focus();
  };

  return (
    <div className="mx-auto max-w-reading">
      <header className="mb-6">
        <h1 tabIndex={-1} className="text-3xl font-bold tracking-tight text-ink">Ask about your records</h1>
        <p className="mt-2 text-base text-muted">Find what the documents say, with linked sources.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="card p-4" role="search">
        <label htmlFor="ask-input" className="sr-only">Question about the loaded records</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><IconSearch size={17} /></span>
            <input id="ask-input" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. When was atorvastatin first mentioned?" className="field py-2.5 pl-9 text-[15px]" />
          </div>
          <button className="btn btn-primary py-2.5" type="submit" disabled={busy || !q.trim()}>Ask <IconArrowRight size={16} /></button>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-muted">Try</p>
          <ul className="flex flex-col gap-1">
            {STARTERS.map((e) => (
              <li key={e}><button type="button" onClick={() => submit(e)} className="text-left text-sm font-medium text-brand hover:text-brand-hover hover:underline underline-offset-2">{e}</button></li>
            ))}
          </ul>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">More examples</summary>
            <ul className="mt-1.5 flex flex-col gap-1">
              {MORE.map((e) => (
                <li key={e}><button type="button" onClick={() => submit(e)} className="text-left text-sm font-medium text-brand hover:text-brand-hover hover:underline underline-offset-2">{e}</button></li>
              ))}
            </ul>
          </details>
        </div>
      </form>

      <details className="mt-3 px-1 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">How answers work</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Answers are assembled by fixed rules from the facts extracted from these documents and from the document text. No AI model is used.</li>
          <li>Everything runs in your browser. Uploaded files are read locally and are not sent to a server; reloading the page clears them.</li>
          <li>Every statement links to the passage it comes from. Where sources disagree, each version is shown — none is picked as correct.</li>
          <li>Questions asking for diagnosis, treatment, dosing, risk or urgency are declined. Detection is rule-based, so unusual wording may be missed.</li>
        </ul>
      </details>

      <div className="mt-6 space-y-4" aria-live="polite">
        {busy && <p className="card px-5 py-4 text-sm text-muted">Processing documents… answers will include them when this finishes.</p>}
        {!busy && history.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
            <p className="font-semibold text-ink">No questions yet</p>
            <p className="mt-1 text-sm text-muted">Answers quote the {rs.documents.length} loaded document{rs.documents.length === 1 ? "" : "s"} and link each statement to its source.</p>
          </div>
        )}
        {history.map(({ q, a, n }) => <AnswerBlock key={n} q={q} a={a} />)}
      </div>
    </div>
  );
}

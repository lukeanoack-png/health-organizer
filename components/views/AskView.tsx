"use client";

import { useState } from "react";
import { ask, EXAMPLE_QUESTIONS, type Answer, type Citation } from "@/lib/query/ask";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "../context";
import { Badge, Card, PageHeader, TYPE_SHORT } from "../ui";

function CitationChip({ c }: { c: Citation }) {
  const { doc, letter, openEvidence } = useRecords();
  const d = doc(c.documentId);
  if (!d) return null;
  return (
    <button
      type="button"
      onClick={() => openEvidence({ documentId: c.documentId, ranges: [{ start: c.start, end: c.end }], factIds: c.factId ? [c.factId] : [], heading: "Cited passage" })}
      title={`“${d.text.slice(c.start, c.end).trim()}”`}
      className="inline-flex items-center gap-1 rounded border border-line bg-white py-0.5 pl-0.5 pr-1.5 text-[11px] font-medium text-slate-700 hover:border-accent/50 hover:bg-accent-soft hover:text-accent"
    >
      <span className="grid h-4 w-4 place-items-center rounded-sm bg-slate-700 font-mono text-[10px] font-bold text-white">{letter(d.id)}</span>
      {TYPE_SHORT[d.meta.documentType]} · {formatDate(d.meta.recordDate).replace(/, \d{4}$/, "")}
    </button>
  );
}

export function AskView() {
  const { rs } = useRecords();
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<{ q: string; a: Answer }[]>([]);

  const submit = (question: string) => {
    if (!question.trim()) return;
    setHistory((h) => [{ q: question, a: ask(rs, question) }, ...h]);
    setQ("");
  };

  return (
    <>
      <PageHeader
        title="Ask Records"
        subtitle="Ask organizational questions about what these synthetic documents say. Every answer cites its sources. This feature does not answer general medical questions, and gives no diagnosis or treatment advice."
      />
      <Card className="mb-5">
        <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which documents mention hypertension?" className="flex-1 rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <button className="btn btn-primary" type="submit">Ask</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLE_QUESTIONS.map((e) => (
            <button key={e} onClick={() => submit(e)} className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-accent/40 hover:text-accent">{e}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Answers are assembled by rules from the extracted facts and document text — no AI model is used, and nothing leaves your browser.</p>
      </Card>

      <div className="space-y-4">
        {history.map(({ q, a }, i) => (
          <Card key={history.length - i} title={<span className="font-normal text-muted">Q: <span className="font-semibold text-ink">{q}</span></span>}
            action={a.kind === "out_of_scope" ? <Badge tone="synth">Outside this tool’s scope</Badge> : a.kind === "insufficient" ? <Badge>Insufficient evidence</Badge> : a.statements.some((s) => s.disagreement) ? <Badge tone="review">Sources disagree</Badge> : <Badge tone="accent">Cited answer</Badge>}>
            <p className="text-sm text-slate-800">{a.summary}</p>
            {a.statements.length > 0 && (
              <ul className="mt-3 space-y-2.5">
                {a.statements.map((s, j) => (
                  <li key={j} className={`rounded-md border px-3 py-2 ${s.disagreement ? "border-review-line bg-review-soft/50" : "border-line"}`}>
                    <div className="text-sm text-ink">{s.disagreement && <span className="mr-1 font-semibold text-review">◆ Sources disagree.</span>}{s.text}</div>
                    {s.citations.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">{s.citations.slice(0, 12).map((c, k) => <CitationChip key={k} c={c} />)}{s.citations.length > 12 && <span className="text-xs text-muted">+{s.citations.length - 12} more</span>}</div>
                    ) : <div className="mt-1 text-xs text-muted">No supporting passage.</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import type { Conflict, ConflictType, ReviewStatus } from "@/lib/types";
import { REVIEW_LABELS, evidenceChanged, statusOf } from "@/lib/annotations";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "./context";
import { Badge, SourceChip, TYPE_SHORT } from "./ui";

export const CONFLICT_TYPE_LABEL: Record<ConflictType, string> = {
  medication_dose: "Medication dose",
  medication_status: "Medication status",
  allergy: "Allergy",
  allergy_reaction: "Allergy reaction",
  condition: "Diagnosis / condition",
  lab_value: "Lab value",
  event_date: "Date",
  demographic: "Demographics",
};

export function PatternBadge({ c }: { c: Conflict }) {
  return c.pattern === "unexplained" ? (
    <Badge tone="review">No documented explanation</Badge>
  ) : (
    <Badge tone="change">A record documents a change</Badge>
  );
}

const STATUS_STYLE: Record<ReviewStatus, string> = {
  unresolved: "border-review-line bg-review-soft text-review",
  reviewed: "border-line bg-slate-50 text-slate-700",
  explained_by_timeline: "border-change-line bg-change-soft text-change",
  likely_documentation_error: "border-line bg-slate-50 text-slate-700",
};

export function ReviewSelect({ c }: { c: Conflict }) {
  const { annotations, setReview } = useRecords();
  const status = statusOf(annotations, c);
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      Review status
      <select
        value={status}
        onChange={(e) => setReview(c, { status: e.target.value as ReviewStatus })}
        className={`rounded-md border px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30 ${STATUS_STYLE[status]}`}
      >
        {(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((s) => <option key={s} value={s}>{REVIEW_LABELS[s]}</option>)}
      </select>
    </label>
  );
}

export function ConflictCard({ c }: { c: Conflict }) {
  const { fact, letter, openFact, annotations, setReview } = useRecords();
  const [note, setNote] = useState(annotations[c.id]?.note ?? "");
  const status = statusOf(annotations, c);
  const context = c.contextFactIds.map(fact).filter((f): f is NonNullable<typeof f> => !!f);
  const cols = c.groups.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2";

  return (
    <article id={c.id} className={`card overflow-hidden ${status === "unresolved" ? (c.pattern === "unexplained" ? "border-l-4 border-l-review" : "border-l-4 border-l-change") : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{CONFLICT_TYPE_LABEL[c.type]}</Badge>
            <PatternBadge c={c} />
            {evidenceChanged(annotations, c) && <Badge tone="synth">New evidence since review</Badge>}
          </div>
          <h3 className="mt-2 text-base font-semibold text-ink">Possible conflict: {c.title}</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-700">{c.explanation}</p>
        </div>
        <ReviewSelect c={c} />
      </header>

      <div className={`grid gap-px bg-line ${cols}`}>
        {c.groups.map((g, gi) => (
          <div key={gi} className="bg-white p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold text-ink">{g.label}</div>
              <div className="text-xs text-muted">{g.factIds.length} record{g.factIds.length > 1 ? "s" : ""}</div>
            </div>
            <ul className="space-y-2.5">
              {g.factIds.map((id) => {
                const f = fact(id);
                if (!f) return null;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => openFact(id, `Claim in conflict: ${c.title}`)}
                      className="w-full rounded-md border border-line p-3 text-left transition hover:border-accent/40 hover:bg-accent-soft/40"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="grid h-4 w-4 place-items-center rounded-sm bg-slate-700 font-mono text-[10px] font-bold text-white">{letter(f.source.documentId)}</span>
                        <span className="font-semibold text-ink">Record {letter(f.source.documentId)} — {TYPE_SHORT[f.source.documentType]} — {formatDate(f.source.recordDate)}</span>
                      </div>
                      <div className="mt-0.5 pl-6 text-xs text-muted">{f.source.facility} · {f.source.section}</div>
                      <blockquote className="mt-1.5 pl-6 text-sm text-slate-800">“{f.source.excerpt.trim()}”</blockquote>
                      <div className="mt-1 pl-6 text-xs font-medium text-accent">View in source →</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {(c.observations.length > 0 || context.length > 0) && (
        <div className="border-t border-line bg-slate-50/70 px-5 py-4">
          {c.observations.length > 0 && (
            <>
              <div className="h-section mb-2">How these records relate in time</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {c.observations.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </>
          )}
          {context.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs font-semibold text-muted">Change statements in the records (context, not a resolution):</span>
              {context.map((f) => <SourceChip key={f.id} fact={f} />)}
            </div>
          )}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (annotations[c.id]?.note ?? "") && setReview(c, { note })}
          placeholder="Reviewer note (optional)"
          className="min-w-[220px] flex-1 rounded-md border border-line px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <span className="text-xs text-muted">Status and notes are organizational annotations only. The source evidence is never changed.</span>
      </footer>
    </article>
  );
}

/** One-line version for the overview. */
export function ConflictRow({ c }: { c: Conflict }) {
  const { go, fact, annotations } = useRecords();
  const facts = c.factIds.map(fact).filter((f): f is NonNullable<typeof f> => !!f);
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div className="min-w-0">
        <button className="text-left text-sm font-semibold text-ink hover:text-accent" onClick={() => { go("conflicts"); setTimeout(() => document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
          {c.title}
        </button>
        <div className="mt-0.5 text-xs text-muted">{c.groups.map((g) => g.label).join("  vs.  ")}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">{facts.slice(0, 6).map((f) => <SourceChip key={f.id} fact={f} />)}{facts.length > 6 && <span className="text-xs text-muted">+{facts.length - 6}</span>}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PatternBadge c={c} />
        <span className="text-[11px] text-muted">{REVIEW_LABELS[statusOf(annotations, c)]}</span>
      </div>
    </li>
  );
}

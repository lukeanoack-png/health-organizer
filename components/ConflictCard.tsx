"use client";

import { useEffect, useId, useState } from "react";
import type { Conflict, ConflictType, Fact, ReviewStatus } from "@/lib/types";
import { REVIEW_LABELS, evidenceChanged, statusOf } from "@/lib/annotations";
import { formatDate } from "@/lib/normalize/values";
import { byDocument } from "@/lib/summaries";
import { useRecords } from "./context";
import { ExplanationTag, ReviewTag, SourceChips, SourceId, TYPE_SHORT } from "./ui";
import { IconArrowRight, IconChevronDown } from "./icons";

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

export const REVIEW_HELP: Record<ReviewStatus, string> = {
  unresolved: "Nobody has looked at this yet.",
  reviewed: "Someone looked at the evidence. This does not say which claim is true.",
  explained_by_timeline: "The reviewer judged the difference to reflect a change over time.",
  likely_documentation_error: "The reviewer judged one entry to be a likely recording error. No evidence is removed.",
};

export function ReviewSelect({ c }: { c: Conflict }) {
  const { annotations, setReview } = useRecords();
  const id = useId();
  const status = statusOf(annotations, c);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted">Review status</label>
      <select
        id={id}
        value={status}
        onChange={(e) => setReview(c, { status: e.target.value as ReviewStatus })}
        className="field w-auto min-w-[220px] py-1.5 font-semibold"
      >
        {(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((s) => <option key={s} value={s}>{REVIEW_LABELS[s]}</option>)}
      </select>
    </div>
  );
}

const sourceCount = (facts: Fact[]) => {
  const n = byDocument(facts).length;
  return `${n} source${n === 1 ? "" : "s"}`;
};

export function ConflictCard({ c, defaultOpen = false }: { c: Conflict; defaultOpen?: boolean }) {
  const { fact, letter, openFacts, annotations, setReview } = useRecords();
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState(annotations[c.id]?.note ?? "");
  const panelId = useId();
  const noteId = useId();
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

  const facts = (ids: string[]) => ids.map(fact).filter((f): f is Fact => !!f);
  const status = statusOf(annotations, c);
  const context = c.observations.filter((o) => o.kind === "context");
  const kindOf = new Map<string, "explained" | "unexplained">();
  if (c.pattern !== "unexplained")
    for (const o of c.observations) if (o.kind !== "context") for (const id of o.factIds) kindOf.set(id, o.kind);
  const passageCount = c.factIds.length;
  const cols = c.groups.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2";

  return (
    <article id={c.id} className="card scroll-mt-28 overflow-hidden" aria-labelledby={`${c.id}-title`}>
      <div className="px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{CONFLICT_TYPE_LABEL[c.type]}</p>
            <h3 id={`${c.id}-title`} className="mt-1 text-lg font-bold leading-snug text-ink">{c.title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <ReviewTag status={status} />
              <ExplanationTag pattern={c.pattern} />
              {evidenceChanged(annotations, c) && <span className="text-xs font-semibold text-review">New evidence added since review</span>}
            </div>
          </div>
          <ReviewSelect c={c} />
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{c.explanation}</p>
        {context.map((o, i) => {
          const f = facts(o.factIds)[0];
          if (!f) return null;
          return (
            <div key={i} className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-subtle px-3 py-2 text-sm">
              <span className="font-semibold text-ink">Documented in</span>
              <SourceChips facts={[f]} />
              <span className="text-ink">“{f.source.excerpt.trim()}”</span>
            </div>
          );
        })}
      </div>

      <div className={`grid border-t border-line ${cols} md:divide-x md:divide-line`}>
        {c.groups.map((g, gi) => {
          const gf = facts(g.factIds);
          return (
            <section key={gi} className="border-t border-line p-5 first:border-t-0 md:border-t-0" aria-label={`Claim: ${g.label}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-[15px] font-bold text-ink">{g.label}</h4>
                <span className="shrink-0 text-xs font-medium text-muted">{sourceCount(gf)}</span>
              </div>
              <div className="mt-2.5"><SourceChips facts={gf} /></div>
              {open && (
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {gf.map((f) => {
                    const k = kindOf.get(f.id);
                    return (
                      <li key={f.id} className="py-3">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                          <SourceId id={letter(f.source.documentId)} />
                          <span className="font-semibold text-ink">{TYPE_SHORT[f.source.documentType]} · {formatDate(f.source.recordDate)}</span>
                          <span>· {f.source.facility} · {f.source.section}</span>
                        </p>
                        <blockquote className="mt-1.5 text-sm leading-relaxed text-ink">“{f.source.excerpt.trim()}”</blockquote>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {k && (
                            <span className="text-xs font-medium text-muted">
                              {k === "explained" ? "✓ Fits the documented change" : "✕ Not explained by the documented change"}
                            </span>
                          )}
                          <button type="button" className="inline-flex items-center gap-1 text-xs link" onClick={() => openFacts([f.id], `Claim: ${c.title}`)}>
                            Open source <IconArrowRight size={13} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-hover">
          <IconChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Hide evidence" : `Show evidence (${passageCount} passage${passageCount === 1 ? "" : "s"})`}
        </button>
        <span className="text-xs text-muted">No claim is selected as correct. Newer records are not assumed to be right.</span>
      </div>

      <div id={panelId} hidden={!open}>
        {c.observations.filter((o) => o.kind !== "context").length > 0 && (
          <section className="border-t border-line bg-canvas px-5 py-4" aria-label="How these records relate in time">
            <h4 className="eyebrow mb-2.5">How these records relate in time</h4>
            <ul className="space-y-2.5">
              {c.observations.filter((o) => o.kind !== "context").map((o, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                  <span aria-hidden className="mt-px w-4 shrink-0 text-center font-semibold text-muted">{o.kind === "explained" ? "✓" : "✕"}</span>
                  <span className="min-w-0">
                    <span className="sr-only">{o.kind === "explained" ? "Explained: " : "Not explained: "}</span>
                    {o.text}
                    <span className="ml-2 inline-flex align-middle"><SourceChips facts={facts(o.factIds)} max={3} /></span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="border-t border-line px-5 py-4">
          <label htmlFor={noteId} className="text-xs font-semibold text-muted">Reviewer note</label>
          <input
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (annotations[c.id]?.note ?? "") && setReview(c, { note })}
            placeholder="Optional — e.g. what you checked"
            className="field mt-1"
          />
          <p className="mt-1.5 text-xs text-muted">{REVIEW_HELP[status]} Review status and notes are stored separately and never change the source evidence.</p>
        </div>
      </div>
    </article>
  );
}

/** Compact preview for the overview. */
export function ConflictPreview({ c }: { c: Conflict }) {
  const { go, fact, annotations } = useRecords();
  const all = c.factIds.map(fact).filter((f): f is Fact => !!f);
  return (
    <li className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow">{CONFLICT_TYPE_LABEL[c.type]}</p>
        <p className="mt-0.5 font-semibold text-ink">{c.title}</p>
        <p className="mt-1 text-sm text-muted">
          {c.groups.map((g) => `${g.label} (${byDocument(facts(g.factIds)).length})`).join("  ·  ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <ReviewTag status={statusOf(annotations, c)} />
          <SourceChips facts={all} max={2} />
        </div>
      </div>
      <button type="button" className="btn shrink-0 self-start" onClick={() => go("conflicts", { conflictId: c.id })} aria-label={`Inspect evidence: ${c.title}`}>
        Inspect evidence <IconArrowRight size={15} />
      </button>
    </li>
  );

  function facts(ids: string[]) { return ids.map(fact).filter((f): f is Fact => !!f); }
}

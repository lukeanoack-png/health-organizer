"use client";

import type { ReactNode } from "react";
import type { Conflict, ConflictPattern, DocumentType, Fact, FactStatus, ReviewStatus } from "@/lib/types";
import { formatDate } from "@/lib/normalize/values";
import { REVIEW_LABELS, statusOf } from "@/lib/annotations";
import { byDocument } from "@/lib/summaries";
import { useRecords } from "./context";
import { IconCheck, IconClock, IconDocError, IconUnresolved } from "./icons";

export const TYPE_SHORT: Record<DocumentType, string> = {
  "Primary care note": "Primary care",
  "Specialist note": "Specialist",
  "Lab report": "Lab report",
  "Medication list": "Med list",
  "Discharge summary": "Discharge",
  "Imaging report": "Imaging",
  "Procedure note": "Procedure",
  Other: "Document",
};

export function shortDate(iso: string | null | undefined) {
  return formatDate(iso).replace(/, \d{4}$/, "");
}

/** Small square source ID, e.g. [A]. */
export function SourceId({ id, className = "" }: { id: string; className?: string }) {
  return (
    <span className={`inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] bg-ink px-1 font-mono text-[10.5px] font-bold leading-none text-white ${className}`}>
      {id}
    </span>
  );
}

/**
 * The single source indicator: “[A] Primary care · Jan 15”. One chip per document;
 * if that document has several relevant passages, the evidence panel highlights all.
 */
export function SourceChip({ facts }: { facts: Fact[] }) {
  const { letter, openFacts } = useRecords();
  const s = facts[0].source;
  const label = `Source ${letter(s.documentId)}: ${TYPE_SHORT[s.documentType]}, ${formatDate(s.recordDate)}${facts.length > 1 ? `, ${facts.length} passages` : ""}. Open evidence.`;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openFacts(facts.map((f) => f.id)); }}
      aria-label={label}
      title={`${s.facility}\n${facts.map((f) => `“${f.source.excerpt.trim()}”`).join("\n")}`}
      className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface py-[3px] pl-[3px] pr-2 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-subtle"
    >
      <SourceId id={letter(s.documentId)} />
      <span className="truncate">{TYPE_SHORT[s.documentType]}</span>
      <span className="text-muted">· {shortDate(s.recordDate)}</span>
      {facts.length > 1 && <span className="text-muted">×{facts.length}</span>}
    </button>
  );
}

/** Deduplicated chips for a set of facts, optionally capped with “+N sources”. */
export function SourceChips({ facts, max }: { facts: Fact[]; max?: number }) {
  const groups = byDocument(facts);
  const shown = max ? groups.slice(0, max) : groups;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {shown.map((g) => <SourceChip key={g.documentId} facts={g.facts} />)}
      {max && groups.length > max && <span className="text-xs font-medium text-muted">+{groups.length - max} source{groups.length - max > 1 ? "s" : ""}</span>}
    </span>
  );
}

const REVIEW_ICON: Record<ReviewStatus, (p: { size?: number }) => React.JSX.Element> = {
  unresolved: IconUnresolved,
  reviewed: IconCheck,
  explained_by_timeline: IconClock,
  likely_documentation_error: IconDocError,
};

/** Review state: amber only for Unresolved, always with icon + text. */
export function ReviewTag({ status }: { status: ReviewStatus }) {
  const Icon = REVIEW_ICON[status];
  const tone = status === "unresolved" ? "border-review-line bg-review-soft text-review" : "border-line bg-subtle text-ink";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <Icon size={14} />
      {REVIEW_LABELS[status]}
    </span>
  );
}

export const PATTERN_LABEL: Record<ConflictPattern, string> = {
  unexplained: "No documented explanation",
  partially_explained: "Partly explained by a documented change",
  documented_change: "Documented change",
};

/** Explanation state: neutral, text-first (it describes the records, not urgency). */
export function ExplanationTag({ pattern }: { pattern: ConflictPattern }) {
  const mark = { unexplained: "○", partially_explained: "◐", documented_change: "●" }[pattern];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted">
      <span aria-hidden className="text-[11px] text-ink/60">{mark}</span>
      {PATTERN_LABEL[pattern]}
    </span>
  );
}

const STATUS_TEXT: Partial<Record<FactStatus, string>> = {
  active: "current", started: "started", changed: "change documented", discontinued: "discontinued",
  held: "held", negated: "denied", possible: "possible", referenced: "as referenced", performed: "performed",
  historical: "history of", resolved: "resolved",
};

export function StatusText({ status }: { status: FactStatus }) {
  return <span className="text-xs text-muted">{STATUS_TEXT[status] ?? status}</span>;
}

/** Link to the conflict(s) that involve these facts. Says what it is in words. */
export function ConflictLink({ conflicts }: { conflicts: Conflict[] }) {
  const { go, annotations } = useRecords();
  if (!conflicts.length) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="flex flex-col items-start gap-1.5">
      {conflicts.map((c) => {
        const status = statusOf(annotations, c);
        return (
          <button key={c.id} type="button" onClick={() => go("conflicts", { conflictId: c.id })} className="group flex flex-col items-start gap-1 text-left">
            <ReviewTag status={status} />
            <span className="text-xs font-medium text-ink underline-offset-2 group-hover:underline">{c.title}</span>
          </button>
        );
      })}
    </span>
  );
}

export function Card({ title, action, children, className = "", pad = true, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={`card ${className}`} aria-labelledby={id}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={id} className="text-[15px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 tabIndex={-1} className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function Confidence({ value, extractor }: { value: number; extractor: string }) {
  const label = value >= 0.85 ? "High" : value >= 0.7 ? "Medium" : "Low";
  return (
    <span className="text-xs text-muted" title={`Extractor: ${extractor}. Confidence reflects how structured the source passage was, not whether the fact is true.`}>
      {label} extraction confidence ({Math.round(value * 100)}%)
    </span>
  );
}

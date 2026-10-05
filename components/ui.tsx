"use client";

import type { ReactNode } from "react";
import type { Conflict, DocumentType, Fact, FactStatus } from "@/lib/types";
import { formatDate } from "@/lib/normalize/values";
import { REVIEW_LABELS, statusOf } from "@/lib/annotations";
import { useRecords } from "./context";

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

export function Badge({ children, tone = "slate", className = "" }: { children: ReactNode; tone?: "slate" | "review" | "change" | "synth" | "accent" | "green"; className?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    review: "bg-review-soft text-review ring-review-line",
    change: "bg-change-soft text-change ring-change-line",
    synth: "bg-synth-soft text-synth ring-synth-line",
    accent: "bg-accent-soft text-accent ring-accent/20",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}>{children}</span>;
}

const STATUS_TONE: Partial<Record<FactStatus, "slate" | "review" | "change" | "green" | "accent">> = {
  active: "green", started: "accent", changed: "change", discontinued: "slate", held: "slate",
  negated: "review", possible: "slate", referenced: "slate", performed: "accent",
};

export function StatusPill({ status }: { status: FactStatus }) {
  const label = status === "negated" ? "denied / none" : status;
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{label}</Badge>;
}

/** The source indicator attached to every displayed fact. Clicking opens the evidence. */
export function SourceChip({ fact, showDate = true }: { fact: Fact; showDate?: boolean }) {
  const { letter, openFact } = useRecords();
  const s = fact.source;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openFact(fact.id); }}
      title={`${s.documentName}\n${s.documentType} · ${s.facility} · ${s.provider}\n${s.section ?? ""}${s.page ? ` · page ${s.page}` : ""}\n“${s.excerpt}”`}
      className="group inline-flex items-center gap-1 rounded border border-line bg-white py-0.5 pl-0.5 pr-1.5 text-[11px] font-medium text-slate-700 transition hover:border-accent/50 hover:bg-accent-soft hover:text-accent"
    >
      <span className="grid h-4 w-4 place-items-center rounded-sm bg-slate-700 font-mono text-[10px] font-bold text-white group-hover:bg-accent">{letter(s.documentId)}</span>
      {TYPE_SHORT[s.documentType]}
      {showDate && <span className="text-muted">· {shortDate(s.recordDate)}</span>}
    </button>
  );
}

export function SourceChips({ facts }: { facts: Fact[] }) {
  const seen = new Set<string>();
  return (
    <span className="inline-flex flex-wrap gap-1">
      {facts.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true))).map((f) => <SourceChip key={f.id} fact={f} />)}
    </span>
  );
}

export function ConflictFlag({ conflicts }: { conflicts: Conflict[] }) {
  const { go, annotations } = useRecords();
  if (!conflicts.length) return null;
  const open = conflicts.filter((c) => statusOf(annotations, c) === "unresolved");
  const unexplained = conflicts.some((c) => c.pattern === "unexplained");
  return (
    <button type="button" onClick={() => go("conflicts")} title={conflicts.map((c) => `${c.title} — ${REVIEW_LABELS[statusOf(annotations, c)]}`).join("\n")}>
      <Badge tone={unexplained ? "review" : "change"}>
        <span aria-hidden>◆</span>
        {unexplained ? "Sources disagree" : "Documented change"}
        {open.length < conflicts.length && open.length === 0 ? " · reviewed" : ""}
      </Badge>
    </button>
  );
}

export function Card({ title, action, children, className = "", pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-h">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function Confidence({ value, extractor }: { value: number; extractor: string }) {
  const label = value >= 0.85 ? "High" : value >= 0.7 ? "Medium" : "Low";
  return (
    <span className="text-xs text-muted" title={`Extractor: ${extractor}. Confidence reflects how structured the source passage was, not whether the fact is true.`}>
      {label} extraction confidence ({Math.round(value * 100)}%)
    </span>
  );
}

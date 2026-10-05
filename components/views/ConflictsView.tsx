"use client";

import { useEffect, useState } from "react";
import type { Conflict, ReviewStatus } from "@/lib/types";
import { REVIEW_LABELS, statusOf } from "@/lib/annotations";
import { useRecords } from "../context";
import { ConflictCard, REVIEW_HELP } from "../ConflictCard";
import { Empty, PageHeader, ReviewTag } from "../ui";

const SECTIONS: { pattern: Conflict["pattern"]; title: string; help: string }[] = [
  { pattern: "unexplained", title: "No documented explanation", help: "No record documents a change that would account for these differences." },
  { pattern: "partially_explained", title: "Partly explained by a documented change", help: "A record documents a change. It accounts for some of the differing claims; the others are marked as not explained." },
  { pattern: "documented_change", title: "Consistent with a documented change", help: "A documented change fits every differing claim. Still listed so a person can confirm it." },
];

export function ConflictsView() {
  const { rs, annotations, focusConflictId } = useRecords();
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const list = rs.conflicts.filter((c) => filter === "all" || statusOf(annotations, c) === filter);
  const count = (s: ReviewStatus | "all") => rs.conflicts.filter((c) => s === "all" || statusOf(annotations, c) === s).length;

  useEffect(() => {
    if (!focusConflictId) return;
    setFilter("all");
    const t = setTimeout(() => {
      const el = document.getElementById(focusConflictId);
      el?.scrollIntoView({ block: "start" });
      el?.querySelector<HTMLElement>("h3")?.setAttribute("tabindex", "-1");
      el?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    }, 30);
    return () => clearTimeout(t);
  }, [focusConflictId]);

  return (
    <>
      <PageHeader
        title="Conflicts"
        subtitle="Places where sources disagree, with the competing claims side by side. Nothing is resolved automatically, and newer records are not assumed to be correct."
      />

      <details className="card mb-5 px-5 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">What review states mean</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((s) => (
            <div key={s}>
              <dt><ReviewTag status={s} /></dt>
              <dd className="mt-1 text-muted">{REVIEW_HELP[s]}</dd>
            </div>
          ))}
        </dl>
      </details>

      <div role="tablist" aria-label="Filter by review status" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {(["all", ...Object.keys(REVIEW_LABELS)] as (ReviewStatus | "all")[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            onClick={() => setFilter(s)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${filter === s ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {s === "all" ? "All" : REVIEW_LABELS[s]} <span className="font-medium opacity-75">{count(s)}</span>
          </button>
        ))}
      </div>

      {list.length === 0 && <Empty>{rs.conflicts.length ? "No conflicts with this review status." : "No conflicts were detected. Detection is rule-based and may miss some disagreements."}</Empty>}

      {SECTIONS.map(({ pattern, title, help }) => {
        const items = list.filter((c) => c.pattern === pattern);
        if (!items.length) return null;
        return (
          <section key={pattern} className="mb-10" aria-labelledby={`sec-${pattern}`}>
            <h2 id={`sec-${pattern}`} className="text-base font-bold text-ink">{title} <span className="font-medium text-muted">({items.length})</span></h2>
            <p className="mb-4 mt-0.5 text-sm text-muted">{help}</p>
            <div className="space-y-4">{items.map((c) => <ConflictCard key={c.id} c={c} defaultOpen={c.id === focusConflictId} />)}</div>
          </section>
        );
      })}
    </>
  );
}

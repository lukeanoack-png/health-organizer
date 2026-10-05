"use client";

import { useState } from "react";
import type { ReviewStatus } from "@/lib/types";
import { REVIEW_LABELS, statusOf } from "@/lib/annotations";
import { useRecords } from "../context";
import { ConflictCard } from "../ConflictCard";
import { Empty, PageHeader } from "../ui";

export function ConflictsView() {
  const { rs, annotations } = useRecords();
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const list = rs.conflicts.filter((c) => filter === "all" || statusOf(annotations, c) === filter);
  const unexplained = list.filter((c) => c.pattern === "unexplained");
  const documented = list.filter((c) => c.pattern === "documented_change");
  const count = (s: ReviewStatus | "all") => rs.conflicts.filter((c) => s === "all" || statusOf(annotations, c) === s).length;

  return (
    <>
      <PageHeader
        title="Conflicts requiring review"
        subtitle="Places where sources disagree. Competing claims are shown side by side with their original wording. The newer record is not assumed to be correct, and nothing is resolved automatically — a person decides."
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {(["all", ...Object.keys(REVIEW_LABELS)] as (ReviewStatus | "all")[]).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filter === s ? "border-ink bg-ink text-white" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}>
            {s === "all" ? "All" : REVIEW_LABELS[s]} <span className="opacity-70">{count(s)}</span>
          </button>
        ))}
      </div>

      {list.length === 0 && <Empty>{rs.conflicts.length ? "No conflicts with this review status." : "No conflicts were detected. Detection is rule-based and may miss some disagreements."}</Empty>}

      {unexplained.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold text-ink">Disagreements with no documented explanation <span className="text-muted">({unexplained.length})</span></h2>
          <p className="mb-3 text-xs text-muted">No record in the set documents a change that would account for these differences.</p>
          <div className="space-y-4">{unexplained.map((c) => <ConflictCard key={c.id} c={c} />)}</div>
        </section>
      )}
      {documented.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-ink">Differences where a record documents a change <span className="text-muted">({documented.length})</span></h2>
          <p className="mb-3 text-xs text-muted">A record states a change (e.g. “increased from 25 mg to 50 mg”) between the differing records. This is likely, but not confirmed, to explain the difference.</p>
          <div className="space-y-4">{documented.map((c) => <ConflictCard key={c.id} c={c} />)}</div>
        </section>
      )}
    </>
  );
}

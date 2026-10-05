"use client";

import { statusOf } from "@/lib/annotations";
import { byAssertion, summarize } from "@/lib/summaries";
import { formatDate } from "@/lib/normalize/values";
import { displayName } from "@/lib/conflicts/detect";
import { useRecords } from "../context";
import { ConflictRow } from "../ConflictCard";
import { TimelineList } from "./TimelineView";
import { Card, ConflictFlag, Empty, PageHeader, SourceChips } from "../ui";

function Stat({ label, value, sub, onClick, tone }: { label: string; value: string | number; sub?: string; onClick?: () => void; tone?: "review" }) {
  const C = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={`card p-4 text-left ${onClick ? "transition hover:border-accent/40" : ""} ${tone === "review" ? "border-review-line bg-review-soft/50" : ""}`}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "review" ? "text-review" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </C>
  );
}

export function OverviewView() {
  const { rs, annotations, go } = useRecords();
  const open = rs.conflicts.filter((c) => statusOf(annotations, c) === "unresolved");
  const openUnexplained = open.filter((c) => c.pattern === "unexplained");
  const dates = rs.documents.map((d) => d.meta.recordDate).filter(Boolean).sort() as string[];
  const meds = summarize(rs, "medication").sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  const conditions = summarize(rs, "condition").filter((c) => c.facts.some((f) => f.status === "active")).sort((a, b) => b.documentIds.length - a.documentIds.length);
  const labDates = [...new Set(rs.facts.filter((f) => f.category === "lab" && f.eventDate).map((f) => f.eventDate!))].sort().reverse().slice(0, 2);
  const recentLabs = rs.facts.filter((f) => f.category === "lab" && labDates.includes(f.eventDate!));
  const recentEvents = [...rs.timeline].reverse().slice(0, 8);

  return (
    <>
      <PageHeader title="Overview" subtitle="An organized view of the loaded synthetic documents. Every entry links to its source. This is not a definitive medical record: where sources disagree, both versions are kept." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Source documents" value={rs.documents.length} sub={`${new Set(rs.documents.map((d) => d.meta.facility)).size} fictional facilities`} onClick={() => go("sources")} />
        <Stat label="Facts extracted (all sourced)" value={rs.facts.length} sub="each tied to a passage" />
        <Stat label="Unresolved conflicts" value={open.length} sub={`${openUnexplained.length} with no documented explanation`} onClick={() => go("conflicts")} tone={open.length ? "review" : undefined} />
        <Stat label="Records span" value={dates.length ? `${formatDate(dates[0]).replace(/, \d{4}/, "")} – ${formatDate(dates[dates.length - 1]).replace(/, \d{4}/, "")}` : "—"} sub={dates.length ? dates[0].slice(0, 4) : undefined} onClick={() => go("timeline")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card title={<span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-review" />Conflicts requiring review</span>} action={<button className="text-xs font-semibold text-accent hover:underline" onClick={() => go("conflicts")}>Open conflicts panel →</button>}>
          {open.length ? (
            <ul className="-my-3 divide-y divide-line">{open.slice(0, 6).map((c) => <ConflictRow key={c.id} c={c} />)}</ul>
          ) : <Empty>No unresolved conflicts.</Empty>}
          {open.length > 6 && <div className="mt-3 text-xs text-muted">+{open.length - 6} more in the Conflicts panel</div>}
        </Card>

        <Card title="Recent timeline" action={<button className="text-xs font-semibold text-accent hover:underline" onClick={() => go("timeline")}>Full timeline →</button>}>
          {recentEvents.length ? <TimelineList events={recentEvents} compact /> : <Empty>No dated events.</Empty>}
        </Card>

        <Card title="Medications" action={<button className="text-xs font-semibold text-accent hover:underline" onClick={() => go("medications")}>All →</button>}>
          <ul className="divide-y divide-line">
            {meds.map((m) => (
              <li key={m.key} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.display}</span>
                  <ConflictFlag conflicts={m.conflicts} />
                </div>
                <ul className="mt-1 space-y-1">
                  {byAssertion(m.facts.filter((f) => !f.detail.isChangeStatement), (f) => `${f.value ?? "dose not stated"} — ${f.status}`).map((g) => (
                    <li key={g.label} className="flex flex-wrap items-center gap-2 text-sm text-slate-700"><span>{g.label}</span><SourceChips facts={g.facts} /></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Conditions" action={<button className="text-xs font-semibold text-accent hover:underline" onClick={() => go("conditions")}>All →</button>}>
            <ul className="space-y-2">
              {conditions.map((c) => (
                <li key={c.key} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{c.display}</span>
                  <span className="text-xs text-muted">{c.documentIds.length} source{c.documentIds.length > 1 ? "s" : ""}</span>
                  <ConflictFlag conflicts={c.conflicts} />
                  <span className="basis-full"><SourceChips facts={c.facts} /></span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Most recent results" action={<button className="text-xs font-semibold text-accent hover:underline" onClick={() => go("labs")}>All labs →</button>}>
            {recentLabs.length ? (
              <table className="table-base -my-2">
                <tbody>
                  {recentLabs.map((f) => (
                    <tr key={f.id}>
                      <td className="!px-0 text-sm font-medium">{displayName(f.normalizedLabel)}</td>
                      <td className="font-mono text-sm">{f.value} {f.units}</td>
                      <td className="text-xs text-muted">{formatDate(f.eventDate)}</td>
                      <td className="!pr-0 text-right"><SourceChips facts={[f]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No lab results.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}

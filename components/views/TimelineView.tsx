"use client";

import { useMemo, useState } from "react";
import type { TimelineEvent, TimelineEventType } from "@/lib/types";
import { EVENT_TYPE_LABELS } from "@/lib/timeline/build";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "../context";
import { Badge, Card, Empty, PageHeader, TYPE_SHORT } from "../ui";

const DOT: Record<TimelineEventType, string> = {
  visit: "bg-accent",
  hospitalization: "bg-slate-800",
  medication_started: "bg-emerald-600",
  medication_changed: "bg-change",
  medication_discontinued: "bg-slate-400",
  diagnosis_recorded: "bg-sky-600",
  lab: "bg-amber-500",
  imaging: "bg-indigo-500",
  procedure: "bg-rose-500",
};

export function TimelineList({ events, compact = false }: { events: TimelineEvent[]; compact?: boolean }) {
  const { openEvidence, fact, letter, conflictsForFact } = useRecords();
  const open = (e: TimelineEvent) => {
    const facts = e.factIds.map(fact).filter((f): f is NonNullable<typeof f> => !!f);
    const docId = facts[0]?.source.documentId ?? e.documentIds[0];
    openEvidence({
      documentId: docId,
      ranges: facts.filter((f) => f.source.documentId === docId).map((f) => ({ start: f.source.charStart, end: f.source.charEnd })),
      factIds: facts.filter((f) => f.source.documentId === docId).map((f) => f.id),
      heading: `Timeline event: ${e.title}`,
    });
  };
  let lastMonth = "";
  return (
    <ol className="relative">
      {events.map((e) => {
        const month = e.date.slice(0, 7);
        const showMonth = !compact && month !== lastMonth;
        lastMonth = month;
        const inConflict = e.factIds.some((id) => conflictsForFact(id).some((c) => c.pattern === "unexplained"));
        return (
          <li key={e.id}>
            {showMonth && <div className="h-section mb-2 mt-5 first:mt-0">{formatDate(month + "-01").replace(/ 1,/, "")}</div>}
            <button type="button" onClick={() => open(e)} className="group flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition hover:bg-slate-50">
              <span className="w-[86px] shrink-0 pt-0.5 text-xs tabular-nums text-muted">{formatDate(e.date)}</span>
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[e.type]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink group-hover:text-accent">{e.title}</span>
                  {!compact && <Badge>{EVENT_TYPE_LABELS[e.type]}</Badge>}
                  {inConflict && <Badge tone="review">◆ sources disagree</Badge>}
                </span>
                {e.subtitle && <span className="mt-0.5 block truncate text-xs text-muted">{e.subtitle}</span>}
              </span>
              <span className="flex shrink-0 gap-1">
                {e.documentIds.slice(0, 4).map((d) => (
                  <span key={d} title="Source document" className="grid h-4 w-4 place-items-center rounded-sm bg-slate-700 font-mono text-[10px] font-bold text-white">{letter(d)}</span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function TimelineView() {
  const { rs, letter } = useRecords();
  const types = Object.keys(EVENT_TYPE_LABELS) as TimelineEventType[];
  const [active, setActive] = useState<Set<TimelineEventType>>(new Set(types));
  const [source, setSource] = useState<string>("all");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const events = useMemo(() => {
    const list = rs.timeline.filter((e) => active.has(e.type) && (source === "all" || e.documentIds.includes(source)));
    return order === "asc" ? list : [...list].reverse();
  }, [rs.timeline, active, source, order]);
  const undated = rs.facts.filter((f) => !f.eventDate && !f.source.recordDate).length;

  const toggle = (t: TimelineEventType) => setActive((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <>
      <PageHeader title="Timeline" subtitle="Events from all documents in date order. Click any event to see the passage it came from. Dates are as written in each source; “as referenced” dates come from another document mentioning the event." />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card title="Filters" className="h-fit">
          <div className="space-y-1.5">
            {types.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={active.has(t)} onChange={() => toggle(t)} className="h-3.5 w-3.5 rounded border-slate-300" />
                <span className={`h-2 w-2 rounded-full ${DOT[t]}`} />
                {EVENT_TYPE_LABELS[t]}
                <span className="ml-auto text-xs text-muted">{rs.timeline.filter((e) => e.type === t).length}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2 text-xs">
            <button className="text-accent hover:underline" onClick={() => setActive(new Set(types))}>All</button>
            <button className="text-accent hover:underline" onClick={() => setActive(new Set())}>None</button>
          </div>
          <label className="mt-4 block text-xs font-semibold text-muted">Source document
            <select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm font-normal text-ink">
              <option value="all">All sources</option>
              {[...rs.documents].sort((a, b) => letter(a.id).localeCompare(letter(b.id))).map((d) => (
                <option key={d.id} value={d.id}>{letter(d.id)} — {TYPE_SHORT[d.meta.documentType]} · {formatDate(d.meta.recordDate)}</option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs font-semibold text-muted">Order
            <select value={order} onChange={(e) => setOrder(e.target.value as "asc" | "desc")} className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm font-normal text-ink">
              <option value="asc">Oldest first</option>
              <option value="desc">Newest first</option>
            </select>
          </label>
        </Card>
        <Card title={`${events.length} events`} action={undated ? <span className="text-xs text-muted">{undated} undated facts not shown</span> : null}>
          {events.length ? <TimelineList events={events} /> : <Empty>No events match these filters.</Empty>}
        </Card>
      </div>
    </>
  );
}

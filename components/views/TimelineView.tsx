"use client";

import { useMemo, useState } from "react";
import type { Fact, TimelineEvent, TimelineEventType } from "@/lib/types";
import { EVENT_TYPE_LABELS } from "@/lib/timeline/build";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "../context";
import { Card, Empty, PageHeader, SourceChips, TYPE_SHORT } from "../ui";
import {
  IconChange, IconDiagnosis, IconHospital, IconImaging, IconLab, IconProcedure, IconStart, IconStop, IconUnresolved, IconVisit,
} from "../icons";

const ICON: Record<TimelineEventType, (p: { size?: number }) => React.JSX.Element> = {
  visit: IconVisit,
  hospitalization: IconHospital,
  medication_started: IconStart,
  medication_changed: IconChange,
  medication_discontinued: IconStop,
  diagnosis_recorded: IconDiagnosis,
  lab: IconLab,
  imaging: IconImaging,
  procedure: IconProcedure,
};

export function TimelineList({ events, compact = false }: { events: TimelineEvent[]; compact?: boolean }) {
  const { openFacts, fact, conflictsForFact } = useRecords();
  let lastMonth = "";
  return (
    <ol className="space-y-0.5">
      {events.map((e) => {
        const facts = e.factIds.map(fact).filter((f): f is Fact => !!f);
        const month = e.date.slice(0, 7);
        const showMonth = !compact && month !== lastMonth;
        lastMonth = month;
        const inConflict = e.factIds.some((id) => conflictsForFact(id).length > 0);
        const Icon = ICON[e.type];
        return (
          <li key={e.id}>
            {showMonth && <h3 className="eyebrow mb-1.5 mt-6 first:mt-0">{formatDate(month + "-01").replace(/ 1,/, "")}</h3>}
            <div className="grid grid-cols-[64px_28px_minmax(0,1fr)] items-start gap-x-3 rounded-lg px-2 py-2.5 hover:bg-subtle/70 sm:grid-cols-[92px_28px_minmax(0,1fr)]">
              <time dateTime={e.date} className="pt-1 text-sm tabular-nums text-muted">{formatDate(e.date).replace(/, \d{4}$/, "")}</time>
              <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-muted"><Icon size={15} /></span>
              <div className="min-w-0">
                <button type="button" onClick={() => openFacts(e.factIds, `Timeline: ${e.title}`)} className="text-left text-sm font-semibold text-ink hover:text-brand hover:underline underline-offset-2">
                  {e.title}
                </button>
                {e.subtitle && <p className="mt-0.5 text-sm text-muted">{e.subtitle}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <SourceChips facts={facts} max={2} />
                  {!compact && <span className="text-xs text-muted">{EVENT_TYPE_LABELS[e.type]}</span>}
                  {inConflict && <span className="inline-flex items-center gap-1 text-xs font-semibold text-review"><IconUnresolved size={13} />Part of a conflict</span>}
                </div>
              </div>
            </div>
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

  const toggle = (t: TimelineEventType) => setActive((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <>
      <PageHeader title="Timeline" subtitle="Events from every document in date order. Select an event to see the passage it came from. Dates are as each source writes them." />
      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Card title="Filter" className="h-fit">
          <fieldset>
            <legend className="eyebrow mb-2">Event type</legend>
            <div className="space-y-1">
              {types.map((t) => {
                const Icon = ICON[t];
                return (
                  <label key={t} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-subtle">
                    <input type="checkbox" checked={active.has(t)} onChange={() => toggle(t)} className="h-4 w-4 accent-[#B42336]" />
                    <Icon size={15} />
                    <span className="flex-1">{EVENT_TYPE_LABELS[t]}</span>
                    <span className="text-xs tabular-nums text-muted">{rs.timeline.filter((e) => e.type === t).length}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <button type="button" className="link" onClick={() => setActive(new Set(types))}>Select all</button>
              <button type="button" className="link" onClick={() => setActive(new Set())}>Clear</button>
            </div>
          </fieldset>
          <label className="mt-5 block text-xs font-semibold text-muted">Source
            <select value={source} onChange={(e) => setSource(e.target.value)} className="field mt-1 font-normal">
              <option value="all">All sources</option>
              {[...rs.documents].sort((a, b) => letter(a.id).localeCompare(letter(b.id))).map((d) => (
                <option key={d.id} value={d.id}>[{letter(d.id)}] {TYPE_SHORT[d.meta.documentType]} · {formatDate(d.meta.recordDate)}</option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs font-semibold text-muted">Order
            <select value={order} onChange={(e) => setOrder(e.target.value as "asc" | "desc")} className="field mt-1 font-normal">
              <option value="asc">Oldest first</option>
              <option value="desc">Newest first</option>
            </select>
          </label>
        </Card>
        <Card title={`${events.length} event${events.length === 1 ? "" : "s"}`}>
          {events.length ? <TimelineList events={events} /> : <Empty>No events match these filters.</Empty>}
        </Card>
      </div>
    </>
  );
}

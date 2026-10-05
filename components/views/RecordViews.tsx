"use client";

import { useMemo, useState } from "react";
import type { Fact } from "@/lib/types";
import { byAssertion, chronological, summarize } from "@/lib/summaries";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "../context";
import { Badge, Card, ConflictFlag, Empty, PageHeader, SourceChip, SourceChips, StatusPill, TYPE_SHORT } from "../ui";
import { UploadPanel } from "../UploadPanel";

const ORDER_NOTE = "Rows list every source separately. Nothing is merged or chosen as the “current” value.";

function AssertionLines({ facts, keyFn }: { facts: Fact[]; keyFn: (f: Fact) => string }) {
  return (
    <ul className="space-y-1.5">
      {byAssertion(chronological(facts), keyFn).map((g) => (
        <li key={g.label} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">{g.label.split(" · ")[0] || <span className="text-muted">not stated</span>}</span>
          <StatusPill status={g.facts[0].status} />
          <SourceChips facts={g.facts} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- medications

export function MedicationsView() {
  const { rs } = useRecords();
  const meds = summarize(rs, "medication").sort((a, b) => a.display.localeCompare(b.display));
  return (
    <>
      <PageHeader title="Medications" subtitle={`Every medication mention, grouped by name (brand and generic names are matched). ${ORDER_NOTE}`} />
      <Card pad={false}>
        {meds.length === 0 ? <div className="p-4"><Empty>No medications extracted.</Empty></div> : (
          <table className="table-base">
            <thead><tr><th className="w-48">Medication</th><th>As recorded, by source</th><th className="w-32">Sources</th><th className="w-44">Review</th></tr></thead>
            <tbody>
              {meds.map((m) => (
                <tr key={m.key}>
                  <td className="font-semibold">{m.display}</td>
                  <td><AssertionLines facts={m.facts} keyFn={(f) => `${f.value ?? ""} · ${f.status}`} /></td>
                  <td className="text-sm text-muted">{m.documentIds.length} document{m.documentIds.length > 1 ? "s" : ""}<br /><span className="text-xs">{formatDate(m.firstDate)} – {formatDate(m.lastDate)}</span></td>
                  <td><ConflictFlag conflicts={m.conflicts} />{m.documentIds.length === 1 && <div className="mt-1 text-xs text-muted">Single source only</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- conditions

export function ConditionsView() {
  const { rs } = useRecords();
  const items = summarize(rs, "condition").sort((a, b) => b.documentIds.length - a.documentIds.length || a.display.localeCompare(b.display));
  return (
    <>
      <PageHeader title="Conditions / diagnoses" subtitle={`Conditions as written in problem lists, diagnoses, history and findings. Explicit denials (“no history of…”) are shown alongside. ${ORDER_NOTE}`} />
      <Card pad={false}>
        {items.length === 0 ? <div className="p-4"><Empty>No conditions extracted.</Empty></div> : (
          <table className="table-base">
            <thead><tr><th className="w-56">Condition</th><th>Recorded in</th><th>Explicitly denied in</th><th className="w-44">Review</th></tr></thead>
            <tbody>
              {items.map((c) => {
                const pos = c.facts.filter((f) => f.status !== "negated");
                const neg = c.facts.filter((f) => f.status === "negated");
                return (
                  <tr key={c.key}>
                    <td><div className="font-semibold">{c.display}</div><div className="text-xs text-muted">First: {formatDate(c.firstDate)}</div></td>
                    <td>{pos.length ? <SourceChips facts={pos} /> : <span className="text-xs text-muted">—</span>}</td>
                    <td>{neg.length ? <SourceChips facts={neg} /> : <span className="text-xs text-muted">—</span>}</td>
                    <td><ConflictFlag conflicts={c.conflicts} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- allergies

export function AllergiesView() {
  const { rs } = useRecords();
  const items = summarize(rs, "allergy");
  const nkda = items.find((i) => i.key === "no known drug allergies");
  return (
    <>
      <PageHeader title="Allergies" subtitle="Allergy entries and “no known drug allergies” statements, each with its source. Differences in reactions are kept as written." />
      <Card pad={false}>
        {items.length === 0 ? <div className="p-4"><Empty>No allergy information extracted.</Empty></div> : (
          <table className="table-base">
            <thead><tr><th className="w-56">Allergen</th><th>Reaction as recorded</th><th className="w-44">Review</th></tr></thead>
            <tbody>
              {items.filter((i) => i !== nkda).map((a) => (
                <tr key={a.key}>
                  <td className="font-semibold">{a.display}</td>
                  <td><AssertionLines facts={a.facts} keyFn={(f) => `${f.status === "negated" ? "Denied" : f.detail.reaction ?? ""} · ${f.status}`} /></td>
                  <td><ConflictFlag conflicts={a.conflicts} /></td>
                </tr>
              ))}
              {nkda && (
                <tr className="bg-review-soft/40">
                  <td className="font-semibold">{nkda.display}</td>
                  <td><SourceChips facts={nkda.facts} /></td>
                  <td><ConflictFlag conflicts={nkda.conflicts} /></td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- labs

export function LabsView() {
  const { rs } = useRecords();
  const tests = summarize(rs, "lab").sort((a, b) => a.display.localeCompare(b.display));
  return (
    <>
      <PageHeader title="Lab results" subtitle="Each value is listed with its collection date and the document reporting it. Values repeated in later notes appear as separate sources. No values are interpreted." />
      <Card pad={false}>
        {tests.length === 0 ? <div className="p-4"><Empty>No lab results extracted.</Empty></div> : (
          <table className="table-base">
            <thead><tr><th className="w-48">Test</th><th className="w-32">Date</th><th className="w-36">Value</th><th>Reported in</th><th className="w-44">Review</th></tr></thead>
            <tbody>
              {tests.flatMap((t) =>
                byAssertion(t.facts, (f) => `${f.eventDate}|${f.value}|${f.units ?? ""}`).map((g, i) => {
                  const f = g.facts[0];
                  const ids = new Set(g.facts.map((x) => x.id));
                  return (
                    <tr key={t.key + g.label}>
                      <td className="font-semibold">{i === 0 ? t.display : ""}</td>
                      <td className="text-sm">{formatDate(f.eventDate)}</td>
                      <td className="font-mono text-sm">{f.value} {f.units}{f.detail.flag ? <span className="ml-1 text-xs text-muted">({f.detail.flag})</span> : null}{f.detail.referenceRange && <div className="font-sans text-[11px] text-muted">ref {f.detail.referenceRange}</div>}</td>
                      <td><SourceChips facts={g.facts} /></td>
                      <td><ConflictFlag conflicts={t.conflicts.filter((c) => c.factIds.some((id) => ids.has(id)))} /></td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- imaging & procedures

export function StudiesView() {
  const { rs } = useRecords();
  const items = [...summarize(rs, "imaging").map((s) => ({ s, kind: "Imaging / test" })), ...summarize(rs, "procedure").map((s) => ({ s, kind: "Procedure" }))];
  return (
    <>
      <PageHeader title="Imaging, tests & procedures" subtitle="Studies and procedures with the dates each source gives. “As referenced” means a document mentions a study it did not itself report." />
      <Card pad={false}>
        {items.length === 0 ? <div className="p-4"><Empty>No imaging or procedures extracted.</Empty></div> : (
          <table className="table-base">
            <thead><tr><th className="w-64">Study / procedure</th><th>Dates as recorded</th><th className="w-44">Review</th></tr></thead>
            <tbody>
              {items.map(({ s, kind }) => (
                <tr key={kind + s.key}>
                  <td><div className="font-semibold">{s.display}</div><div className="text-xs text-muted">{kind}</div></td>
                  <td><AssertionLines facts={s.facts} keyFn={(f) => `${formatDate(f.eventDate)}${f.status === "referenced" ? " (as referenced)" : ""} · ${f.status}`} /></td>
                  <td><ConflictFlag conflicts={s.conflicts} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- visits

export function VisitsView() {
  const { rs } = useRecords();
  const visits = chronological(rs.facts.filter((f) => f.category === "visit" || f.category === "hospitalization"));
  return (
    <>
      <PageHeader title="Visits & hospitalizations" subtitle="Encounters described by each document's header." />
      <Card pad={false}>
        {visits.length === 0 ? <div className="p-4"><Empty>No encounters found.</Empty></div> : (
          <table className="table-base">
            <thead><tr><th className="w-36">Date</th><th>Encounter</th><th>Fictional provider / facility</th><th className="w-40">Source</th></tr></thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id}>
                  <td className="text-sm">{v.category === "hospitalization" ? `${formatDate(v.value?.split(" to ")[0])} – ${formatDate(v.value?.split(" to ")[1])}` : formatDate(v.eventDate)}</td>
                  <td><span className="font-semibold">{v.category === "hospitalization" ? "Hospitalization" : v.value}</span></td>
                  <td className="text-sm">{v.source.provider}<div className="text-xs text-muted">{v.source.facility}</div></td>
                  <td><SourceChip fact={v} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- providers

export function ProvidersView() {
  const { rs, letter, openEvidence } = useRecords();
  const byFacility = new Map<string, typeof rs.documents>();
  for (const d of rs.documents) byFacility.set(d.meta.facility, [...(byFacility.get(d.meta.facility) ?? []), d]);
  return (
    <>
      <PageHeader title="Providers & institutions" subtitle="All names are fictional. Grouped by the facility named in each document header." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...byFacility].map(([facility, docs]) => (
          <Card key={facility} title={facility}>
            <div className="mb-2 text-xs text-muted">{[...new Set(docs.map((d) => d.meta.provider))].join(" · ")}</div>
            <ul className="space-y-1.5">
              {docs.sort((a, b) => (a.meta.recordDate ?? "").localeCompare(b.meta.recordDate ?? "")).map((d) => (
                <li key={d.id}>
                  <button className="flex w-full items-center gap-2 text-left text-sm hover:text-accent" onClick={() => openEvidence({ documentId: d.id, ranges: [], factIds: [] })}>
                    <span className="grid h-4 w-4 place-items-center rounded-sm bg-slate-700 font-mono text-[10px] font-bold text-white">{letter(d.id)}</span>
                    <span className="truncate">{d.meta.documentTypeLabel}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">{formatDate(d.meta.recordDate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- sources

export function SourcesView({ onFiles, onDemo, onRemove, busy }: { onFiles: (f: File[]) => void; onDemo: () => void; onRemove: (id: string) => void; busy: boolean }) {
  const { rs, letter, openEvidence } = useRecords();
  const [q, setQ] = useState("");
  const docs = useMemo(
    () => [...rs.documents].sort((a, b) => letter(a.id).localeCompare(letter(b.id))).filter((d) => !q || d.text.toLowerCase().includes(q.toLowerCase()) || d.fileName.toLowerCase().includes(q.toLowerCase())),
    [rs.documents, q, letter],
  );
  return (
    <>
      <PageHeader title="Source documents" subtitle="The raw documents, stored separately from everything extracted from them. Open one to read it in full.">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter documents by text…" className="w-64 rounded-md border border-line px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </PageHeader>
      <Card pad={false} className="mb-6">
        <table className="table-base">
          <thead><tr><th className="w-10"></th><th>Document</th><th className="w-28">Type</th><th className="w-32">Record date</th><th>Fictional provider / facility</th><th className="w-24">Facts</th><th className="w-24"></th></tr></thead>
          <tbody>
            {docs.map((d) => {
              const n = rs.facts.filter((f) => f.source.documentId === d.id).length;
              return (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openEvidence({ documentId: d.id, ranges: q ? findAll(d.text, q) : [], factIds: [] })}>
                  <td><span className="grid h-5 w-5 place-items-center rounded-sm bg-slate-700 font-mono text-[11px] font-bold text-white">{letter(d.id)}</span></td>
                  <td>
                    <div className="font-semibold">{d.meta.documentTypeLabel}</div>
                    <div className="font-mono text-[11px] text-muted">{d.fileName} · {d.format.toUpperCase()}{d.pages ? ` · ${d.pages.length} page(s)` : ""}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.syntheticMarker ? <Badge tone="synth">SYNTHETIC marker</Badge> : <Badge tone="review">No SYNTHETIC marker</Badge>}
                      {d.origin === "demo" && <Badge>Demo</Badge>}
                    </div>
                    {d.ingestNotes.map((n) => <div key={n} className="mt-1 text-xs text-review">{n}</div>)}
                  </td>
                  <td className="text-sm">{TYPE_SHORT[d.meta.documentType]}</td>
                  <td className="text-sm">{formatDate(d.meta.recordDate)}</td>
                  <td className="text-sm">{d.meta.provider}<div className="text-xs text-muted">{d.meta.facility}</div></td>
                  <td className="text-sm">{n}</td>
                  <td><button className="text-xs text-muted hover:text-ink" onClick={(e) => { e.stopPropagation(); onRemove(d.id); }}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <h2 className="h-section mb-2">Add documents</h2>
      <UploadPanel onFiles={onFiles} onDemo={onDemo} busy={busy} />
    </>
  );
}

function findAll(text: string, q: string) {
  const out: { start: number; end: number }[] = [];
  const lower = text.toLowerCase();
  const n = q.toLowerCase();
  for (let i = lower.indexOf(n); i >= 0 && out.length < 50; i = lower.indexOf(n, i + n.length)) out.push({ start: i, end: i + n.length });
  return out;
}

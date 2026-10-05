"use client";

import { useMemo, useState } from "react";
import type { Fact } from "@/lib/types";
import { byAssertion, chronological, splitConditions, summarize, type ItemSummary } from "@/lib/summaries";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "../context";
import { Card, ConflictLink, Empty, PageHeader, SourceChip, SourceChips, SourceId, StatusText, TYPE_SHORT } from "../ui";
import { UploadPanel } from "../UploadPanel";

const KEEP_NOTE = "Every source is listed separately. Nothing is merged into a single “current” value.";

function TableCard({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className="card overflow-hidden" aria-label={label}>
      <div className="table-wrap" tabIndex={0} aria-label={`${label} (scrolls horizontally on small screens)`}>{children}</div>
    </section>
  );
}

/** “20 mg once daily · current  [D] Specialist · Mar 12  [F] Discharge · Apr 2” per distinct assertion. */
function AssertionLines({ facts, keyFn, label }: { facts: Fact[]; keyFn: (f: Fact) => string; label: (f: Fact) => React.ReactNode }) {
  return (
    <ul className="space-y-2">
      {byAssertion(chronological(facts), keyFn).map((g) => (
        <li key={g.label} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="text-sm font-medium text-ink">{label(g.facts[0])}</span>
          <StatusText status={g.facts[0].status} />
          <SourceChips facts={g.facts} />
        </li>
      ))}
    </ul>
  );
}

const docCount = (s: ItemSummary) => `${s.documentIds.length} source${s.documentIds.length === 1 ? "" : "s"}`;

// ---------------------------------------------------------------- medications

export function MedicationsView() {
  const { rs } = useRecords();
  const meds = summarize(rs, "medication").sort((a, b) => a.display.localeCompare(b.display));
  return (
    <>
      <PageHeader title="Medications" subtitle={`Every medication mention, grouped by name (brand and generic names are matched). ${KEEP_NOTE}`} />
      {meds.length === 0 ? <Empty>No medications extracted.</Empty> : (
        <TableCard label="Medications">
          <table className="table-base">
            <thead><tr><th scope="col" className="w-48">Medication</th><th scope="col">As recorded, by source</th><th scope="col" className="w-56">Review</th></tr></thead>
            <tbody>
              {meds.map((m) => (
                <tr key={m.key}>
                  <th scope="row">
                    {m.display}
                    <div className="mt-0.5 text-xs font-normal text-muted">{docCount(m)}{m.documentIds.length === 1 ? " only" : ""}</div>
                  </th>
                  <td><AssertionLines facts={m.facts} keyFn={(f) => `${f.value ?? ""}|${f.status}`} label={(f) => f.value ?? <span className="text-muted">dose not stated</span>} /></td>
                  <td><ConflictLink conflicts={m.conflicts} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}

// ---------------------------------------------------------------- conditions

export function ConditionsView() {
  const { rs } = useRecords();
  const { recorded, deniedOnly } = splitConditions(rs);
  recorded.sort((a, b) => b.documentIds.length - a.documentIds.length || a.display.localeCompare(b.display));
  const isFinding = (c: ItemSummary) => c.facts.filter((f) => f.status !== "negated").every((f) => /finding/i.test(f.source.section ?? ""));
  return (
    <>
      <PageHeader title="Conditions" subtitle="Conditions and findings as each source words them. Explicit denials (“no history of…”) appear beside the sources that record the condition." />
      {recorded.length === 0 ? <Empty>No conditions extracted.</Empty> : (
        <TableCard label="Conditions and findings">
          <table className="table-base">
            <thead>
              <tr><th scope="col" className="w-56">Condition or finding</th><th scope="col">Recorded in</th><th scope="col">Explicitly denied in</th><th scope="col" className="w-56">Review</th></tr>
            </thead>
            <tbody>
              {recorded.map((c) => {
                const pos = c.facts.filter((f) => f.status !== "negated");
                const neg = c.facts.filter((f) => f.status === "negated");
                return (
                  <tr key={c.key}>
                    <th scope="row">
                      {c.display}
                      <div className="mt-0.5 text-xs font-normal text-muted">{isFinding(c) ? "Imaging finding · " : ""}first {formatDate(c.firstDate)}</div>
                    </th>
                    <td><SourceChips facts={pos} /></td>
                    <td>{neg.length ? <SourceChips facts={neg} /> : <span className="text-xs text-muted">—</span>}</td>
                    <td><ConflictLink conflicts={c.conflicts} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {deniedOnly.length > 0 && (
        <section className="mt-8" aria-labelledby="denied-only">
          <h2 id="denied-only" className="text-base font-bold text-ink">Mentioned only in denials</h2>
          <p className="mb-3 mt-0.5 text-sm text-muted">No source records these as a diagnosis. They appear only in statements such as “denies chest pain”.</p>
          <TableCard label="Mentioned only in denials">
            <table className="table-base">
              <thead><tr><th scope="col" className="w-56">Condition</th><th scope="col">Denied in</th><th scope="col">Wording</th></tr></thead>
              <tbody>
                {deniedOnly.map((c) => (
                  <tr key={c.key}>
                    <th scope="row">{c.display}<div className="mt-0.5 text-xs font-normal text-muted">Denied only</div></th>
                    <td><SourceChips facts={c.facts} /></td>
                    <td className="text-sm text-ink">{[...new Set(c.facts.map((f) => `“${f.source.excerpt.trim()}”`))].join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- allergies

export function AllergiesView() {
  const { rs } = useRecords();
  const items = summarize(rs, "allergy");
  const nkda = items.find((i) => i.key === "no known drug allergies");
  const rest = items.filter((i) => i !== nkda);
  return (
    <>
      <PageHeader title="Allergies" subtitle="Allergy entries and “no known drug allergies” statements, each with its source. Reactions are kept as written." />
      {items.length === 0 ? <Empty>No allergy information extracted.</Empty> : (
        <TableCard label="Allergies">
          <table className="table-base">
            <thead><tr><th scope="col" className="w-56">Allergen</th><th scope="col">Reaction as recorded</th><th scope="col" className="w-56">Review</th></tr></thead>
            <tbody>
              {rest.map((a) => (
                <tr key={a.key}>
                  <th scope="row">{a.display}<div className="mt-0.5 text-xs font-normal text-muted">{docCount(a)}</div></th>
                  <td><AssertionLines facts={a.facts} keyFn={(f) => `${f.detail.reaction ?? ""}|${f.status}`} label={(f) => f.status === "negated" ? "No allergy" : f.detail.reaction ?? <span className="text-muted">reaction not stated</span>} /></td>
                  <td><ConflictLink conflicts={a.conflicts} /></td>
                </tr>
              ))}
              {nkda && (
                <tr>
                  <th scope="row">No known drug allergies<div className="mt-0.5 text-xs font-normal text-muted">{docCount(nkda)}</div></th>
                  <td><SourceChips facts={nkda.facts} /></td>
                  <td><ConflictLink conflicts={nkda.conflicts} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}

// ---------------------------------------------------------------- labs

export function LabsView() {
  const { rs } = useRecords();
  const tests = summarize(rs, "lab").sort((a, b) => a.display.localeCompare(b.display));
  return (
    <>
      <PageHeader title="Lab results" subtitle="Each value with its collection date and the documents reporting it. Values repeated in later notes are listed as additional sources. Values are not interpreted." />
      {tests.length === 0 ? <Empty>No lab results extracted.</Empty> : (
        <TableCard label="Lab results">
          <table className="table-base">
            <thead><tr><th scope="col" className="w-48">Test</th><th scope="col" className="w-32">Collected</th><th scope="col" className="w-40">Value</th><th scope="col">Reported in</th><th scope="col" className="w-56">Review</th></tr></thead>
            <tbody>
              {tests.flatMap((t) =>
                byAssertion(t.facts, (f) => `${f.eventDate}|${f.value}|${f.units ?? ""}`).map((g, i) => {
                  const f = g.facts[0];
                  const ids = new Set(g.facts.map((x) => x.id));
                  return (
                    <tr key={t.key + g.label}>
                      <th scope="row">{i === 0 ? t.display : <span className="sr-only">{t.display}</span>}</th>
                      <td className="tabular-nums">{formatDate(f.eventDate)}</td>
                      <td className="tabular-nums">
                        <span className="font-semibold">{f.value}</span> {f.units}
                        {f.detail.flag && <span className="ml-1 text-xs text-muted">flag {f.detail.flag}</span>}
                        {f.detail.referenceRange && <div className="text-xs text-muted">ref {f.detail.referenceRange}</div>}
                      </td>
                      <td><SourceChips facts={g.facts} /></td>
                      <td><ConflictLink conflicts={t.conflicts.filter((c) => c.factIds.some((id) => ids.has(id)))} /></td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}

// ---------------------------------------------------------------- imaging & procedures

export function StudiesView() {
  const { rs } = useRecords();
  const items = [...summarize(rs, "imaging").map((s) => ({ s, kind: "Imaging / test" })), ...summarize(rs, "procedure").map((s) => ({ s, kind: "Procedure" }))];
  return (
    <>
      <PageHeader title="Imaging & procedures" subtitle="Studies and procedures with the date each source gives. “As referenced” means a document mentions a study that it did not itself report." />
      {items.length === 0 ? <Empty>No imaging or procedures extracted.</Empty> : (
        <TableCard label="Imaging and procedures">
          <table className="table-base">
            <thead><tr><th scope="col" className="w-64">Study or procedure</th><th scope="col">Date as recorded</th><th scope="col" className="w-56">Review</th></tr></thead>
            <tbody>
              {items.map(({ s, kind }) => (
                <tr key={kind + s.key}>
                  <th scope="row">{s.display}<div className="mt-0.5 text-xs font-normal text-muted">{kind}</div></th>
                  <td><AssertionLines facts={s.facts} keyFn={(f) => `${f.eventDate}|${f.status}`} label={(f) => formatDate(f.eventDate)} /></td>
                  <td><ConflictLink conflicts={s.conflicts} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}

// ---------------------------------------------------------------- visits

export function VisitsView() {
  const { rs } = useRecords();
  const visits = chronological(rs.facts.filter((f) => f.category === "visit" || f.category === "hospitalization"));
  const range = (v: Fact) => v.value?.split(" to ") ?? [];
  return (
    <>
      <PageHeader title="Visits" subtitle="Encounters described in each document's header." />
      {visits.length === 0 ? <Empty>No encounters found.</Empty> : (
        <TableCard label="Visits and hospitalizations">
          <table className="table-base">
            <thead><tr><th scope="col" className="w-48">Date</th><th scope="col">Encounter</th><th scope="col">Fictional provider and facility</th><th scope="col" className="w-48">Source</th></tr></thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id}>
                  <td className="tabular-nums">{v.category === "hospitalization" ? `${formatDate(range(v)[0])} – ${formatDate(range(v)[1])}` : formatDate(v.eventDate)}</td>
                  <td className="font-semibold">{v.category === "hospitalization" ? "Hospitalization" : v.value}</td>
                  <td>{v.source.provider}<div className="text-xs text-muted">{v.source.facility}</div></td>
                  <td><SourceChip facts={[v]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
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
      <PageHeader title="Providers" subtitle="All names are fictional. Grouped by the facility named in each document header." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...byFacility].map(([facility, docs]) => (
          <Card key={facility} title={facility}>
            <p className="mb-3 text-sm text-muted">{[...new Set(docs.map((d) => d.meta.provider))].join(" · ")}</p>
            <ul className="space-y-1">
              {docs.sort((a, b) => (a.meta.recordDate ?? "").localeCompare(b.meta.recordDate ?? "")).map((d) => (
                <li key={d.id}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-subtle" onClick={() => openEvidence({ documentId: d.id, ranges: [], factIds: [] })}>
                    <SourceId id={letter(d.id)} />
                    <span className="min-w-0 flex-1 truncate">{d.meta.documentTypeLabel}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{formatDate(d.meta.recordDate)}</span>
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

export function SourcesView({ onFiles, onDemo, onRemove }: { onFiles: (f: File[]) => void; onDemo: () => void; onRemove: (id: string) => void }) {
  const { rs, letter, openEvidence, busy } = useRecords();
  const [q, setQ] = useState("");
  const docs = useMemo(
    () => [...rs.documents].sort((a, b) => letter(a.id).localeCompare(letter(b.id))).filter((d) => !q || d.text.toLowerCase().includes(q.toLowerCase()) || d.fileName.toLowerCase().includes(q.toLowerCase())),
    [rs.documents, q, letter],
  );
  return (
    <>
      <PageHeader title="Sources" subtitle="The original documents, stored separately from everything extracted from them. Open one to read it in full.">
        <label className="w-full sm:w-64">
          <span className="sr-only">Filter documents by text</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by text…" className="field" />
        </label>
      </PageHeader>
      <TableCard label="Source documents">
        <table className="table-base">
          <thead><tr><th scope="col" className="w-14">ID</th><th scope="col">Document</th><th scope="col" className="w-32">Date</th><th scope="col">Fictional provider and facility</th><th scope="col" className="w-20">Facts</th><th scope="col" className="w-28"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {docs.map((d) => {
              const n = rs.facts.filter((f) => f.source.documentId === d.id).length;
              return (
                <tr key={d.id}>
                  <td><SourceId id={letter(d.id)} /></td>
                  <td>
                    <div className="font-semibold">{d.meta.documentTypeLabel}</div>
                    <div className="mt-0.5 break-all font-mono text-[11px] text-muted">{d.fileName} · {d.format.toUpperCase()}{d.pages ? ` · ${d.pages.length} page(s)` : ""}{d.origin === "demo" ? " · demo" : ""}</div>
                    {!d.syntheticMarker && <div className="mt-1 text-xs font-semibold text-review">No SYNTHETIC marker found in this file</div>}
                    {d.ingestNotes.filter((x) => !/SYNTHETIC/.test(x)).map((x) => <div key={x} className="mt-1 text-xs text-muted">{x}</div>)}
                  </td>
                  <td className="tabular-nums">{formatDate(d.meta.recordDate)}</td>
                  <td>{d.meta.provider}<div className="text-xs text-muted">{d.meta.facility}</div></td>
                  <td className="tabular-nums">{n}</td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <button type="button" className="text-sm link" onClick={() => openEvidence({ documentId: d.id, ranges: q ? findAll(d.text, q) : [], factIds: [] })}>Open</button>
                      <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => onRemove(d.id)} aria-label={`Remove ${d.fileName}`}>Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableCard>
      <h2 id="add-documents" className="mb-3 mt-10 text-base font-bold text-ink">Add documents</h2>
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conflict, RawDocument, RecordSet, ReviewStatus } from "@/lib/types";
import { processDocuments } from "@/lib/pipeline";
import { ingestFile } from "@/lib/ingest/readers";
import { loadDemoDocuments } from "@/lib/demo/load";
import { annotate, loadAnnotations, saveAnnotations, statusOf, type AnnotationMap } from "@/lib/annotations";
import { demographicValues } from "@/lib/summaries";
import { formatDate } from "@/lib/normalize/values";
import { Records, type EvidenceTarget, type RecordsCtx, type View } from "./context";
import { SourceDrawer } from "./SourceDrawer";
import { UploadPanel } from "./UploadPanel";
import { Badge } from "./ui";
import { OverviewView } from "./views/OverviewView";
import { TimelineView } from "./views/TimelineView";
import { ConflictsView } from "./views/ConflictsView";
import { AskView } from "./views/AskView";
import {
  AllergiesView, ConditionsView, LabsView, MedicationsView, ProvidersView, SourcesView, StudiesView, VisitsView,
} from "./views/RecordViews";

const EMPTY: RecordSet = { documents: [], facts: [], conflicts: [], timeline: [] };

const NAV: { view: View; label: string; group?: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "timeline", label: "Timeline" },
  { view: "conflicts", label: "Conflicts" },
  { view: "medications", label: "Medications", group: "Record" },
  { view: "conditions", label: "Conditions" },
  { view: "allergies", label: "Allergies" },
  { view: "labs", label: "Labs" },
  { view: "studies", label: "Imaging & procedures" },
  { view: "visits", label: "Visits" },
  { view: "providers", label: "Providers" },
  { view: "sources", label: "Sources", group: "Evidence" },
  { view: "ask", label: "Ask Records" },
];

export function SafetyBanner() {
  return (
    <div className="border-b border-synth-line bg-synth-soft px-4 py-1.5 text-center text-xs font-medium text-[#5c3d00]" role="note">
      Educational prototype using synthetic data only. Not for diagnosis, treatment, or medical decision-making.
    </div>
  );
}

export function AppShell() {
  const [docs, setDocs] = useState<RawDocument[]>([]);
  const [rs, setRs] = useState<RecordSet>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [view, setView] = useState<View>("overview");
  const [target, setTarget] = useState<EvidenceTarget | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationMap>({});

  useEffect(() => setAnnotations(loadAnnotations()), []);

  useEffect(() => {
    let live = true;
    processDocuments(docs).then((r) => live && setRs(r));
    return () => { live = false; };
  }, [docs]);

  const addDocuments = useCallback((incoming: RawDocument[]) => {
    setDocs((prev) => {
      const ids = new Set(prev.map((d) => d.id));
      return [...prev, ...incoming.filter((d) => !ids.has(d.id))];
    });
  }, []);

  const onFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    const errs: string[] = [];
    const out: RawDocument[] = [];
    for (const f of files) {
      try {
        out.push(await ingestFile(f.name, new Uint8Array(await f.arrayBuffer()), "upload"));
      } catch (e) {
        errs.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    addDocuments(out);
    setErrors(errs);
    setBusy(false);
  }, [addDocuments]);

  const onDemo = useCallback(async () => {
    setBusy(true);
    try {
      const demo = await loadDemoDocuments();
      setDocs((prev) => [...prev.filter((d) => d.origin !== "demo"), ...demo]);
      setErrors([]);
      setView("overview");
    } catch (e) {
      setErrors([(e as Error).message]);
    }
    setBusy(false);
  }, []);

  const letters = useMemo(() => {
    const sorted = [...rs.documents].sort((a, b) => (a.meta.recordDate ?? "9999").localeCompare(b.meta.recordDate ?? "9999") || a.fileName.localeCompare(b.fileName));
    return new Map(sorted.map((d, i) => [d.id, i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`]));
  }, [rs.documents]);

  const ctx: RecordsCtx = useMemo(() => {
    const docMap = new Map(rs.documents.map((d) => [d.id, d]));
    const factMap = new Map(rs.facts.map((f) => [f.id, f]));
    const byFact = new Map<string, Conflict[]>();
    for (const c of rs.conflicts) for (const id of [...c.factIds, ...c.contextFactIds]) byFact.set(id, [...(byFact.get(id) ?? []), c]);
    return {
      rs,
      doc: (id) => docMap.get(id),
      fact: (id) => factMap.get(id),
      letter: (id) => letters.get(id) ?? "?",
      conflictsForFact: (id) => byFact.get(id) ?? [],
      openFact: (id, heading) => {
        const f = factMap.get(id);
        if (f) setTarget({ documentId: f.source.documentId, ranges: [{ start: f.source.charStart, end: f.source.charEnd }], factIds: [id], heading });
      },
      openEvidence: setTarget,
      annotations,
      setReview: (c, patch: { status?: ReviewStatus; note?: string }) =>
        setAnnotations((m) => { const n = annotate(m, c, patch); saveAnnotations(n); return n; }),
      isOpen: (c) => statusOf(annotations, c) === "unresolved",
      go: (v) => { setView(v); window.scrollTo({ top: 0 }); },
    };
  }, [rs, letters, annotations]);

  const unresolved = rs.conflicts.filter((c) => statusOf(annotations, c) === "unresolved").length;
  const names = demographicValues(rs, "patient name");
  const dobs = demographicValues(rs, "date of birth");
  const loaded = rs.documents.length > 0;

  const counts: Partial<Record<View, number>> = {
    conflicts: unresolved,
    medications: new Set(rs.facts.filter((f) => f.category === "medication").map((f) => f.normalizedLabel)).size,
    conditions: new Set(rs.facts.filter((f) => f.category === "condition").map((f) => f.normalizedLabel)).size,
    sources: rs.documents.length,
  };

  return (
    <Records.Provider value={ctx}>
      <div className="min-h-screen">
        <SafetyBanner />
        <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-ink text-sm font-bold text-white">R</div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">Record Organizer</div>
                <div className="text-[11px] text-muted">Provenance-first prototype</div>
              </div>
            </div>
            <div className="mx-1 hidden h-8 w-px bg-line md:block" />
            {loaded ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div>
                  <div className="text-[11px] text-muted">Fictional patient</div>
                  <div className="text-sm font-semibold">
                    {names.length === 0 ? "Not stated" : names[0].value}
                    {names.length > 1 && <span className="ml-1 text-xs font-medium text-review">(name differs across sources)</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Date of birth</div>
                  <div className="text-sm font-semibold">
                    {dobs.length === 0 ? "Not stated" : dobs.length === 1 ? formatDate(dobs[0].value) : (
                      <button className="text-review hover:underline" onClick={() => setView("conflicts")} title={dobs.map((d) => `${formatDate(d.value)} — ${d.facts.length} source(s)`).join("\n")}>
                        Differs across sources ({dobs.length} values)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : <div className="text-sm text-muted">No records loaded</div>}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Badge tone="synth" className="!text-xs">SYNTHETIC DATA</Badge>
              <Badge className="!text-xs">{rs.documents.length} source document{rs.documents.length === 1 ? "" : "s"}</Badge>
              <button onClick={() => setView("conflicts")}>
                <Badge tone={unresolved ? "review" : "slate"} className="!text-xs">◆ {unresolved} unresolved conflict{unresolved === 1 ? "" : "s"}</Badge>
              </button>
            </div>
          </div>
        </header>

        {errors.length > 0 && (
          <div className="border-b border-review-line bg-review-soft px-5 py-2 text-sm text-review">
            {errors.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}

        {!loaded ? (
          <main className="mx-auto max-w-4xl px-5 py-10">
            <h1 className="text-2xl font-semibold tracking-tight">Organize synthetic health records — and see where every fact came from</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Upload several fictional documents (visit notes, lab reports, medication lists, discharge summaries, imaging reports). The organizer extracts facts,
              keeps a link from each one to its source passage, builds a timeline, and flags where sources disagree — without deciding which source is right.
            </p>
            <div className="mt-6"><UploadPanel onFiles={onFiles} onDemo={onDemo} busy={busy} /></div>
            <div className="mt-8 grid gap-4 text-sm md:grid-cols-2">
              <div className="card p-4">
                <div className="h-section mb-2">What it does</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-700">
                  <li>Organizes facts into medications, conditions, allergies, labs, and a timeline</li>
                  <li>Links every fact to the document, section, and passage it came from</li>
                  <li>Surfaces conflicting information side by side for human review</li>
                  <li>Answers questions about the documents, with citations</li>
                </ul>
              </div>
              <div className="card p-4">
                <div className="h-section mb-2">What it does not do</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-700">
                  <li>No diagnoses, treatment or medication recommendations</li>
                  <li>No risk scores, predictions, or triage</li>
                  <li>No automatic reconciliation of conflicting information</li>
                  <li>No storage: reloading the page clears loaded documents</li>
                </ul>
              </div>
            </div>
          </main>
        ) : (
          <div className="flex">
            <nav className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 flex-col border-r border-line bg-white px-3 py-4 md:flex">
              {NAV.map((n) => (
                <div key={n.view}>
                  {n.group && <div className="h-section mb-1 mt-4 px-2 !text-[11px]">{n.group}</div>}
                  <button
                    onClick={() => setView(n.view)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${view === n.view ? "bg-accent-soft font-semibold text-accent" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    {n.label}
                    {counts[n.view] !== undefined && (
                      <span className={`rounded px-1.5 text-[11px] font-semibold ${n.view === "conflicts" && counts.conflicts ? "bg-review text-white" : "text-muted"}`}>{counts[n.view]}</span>
                    )}
                  </button>
                </div>
              ))}
              <div className="mt-auto space-y-2 border-t border-line pt-3">
                <button className="btn w-full justify-center" onClick={() => setView("sources")}>Add documents</button>
                <button className="w-full text-xs text-muted hover:text-ink" onClick={() => { setDocs([]); setView("overview"); }}>Clear all documents</button>
              </div>
            </nav>
            <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">
              <select className="mb-4 w-full rounded-md border border-line px-2 py-2 text-sm md:hidden" value={view} onChange={(e) => setView(e.target.value as View)}>
                {NAV.map((n) => <option key={n.view} value={n.view}>{n.label}</option>)}
              </select>
              {view === "overview" && <OverviewView />}
              {view === "timeline" && <TimelineView />}
              {view === "conflicts" && <ConflictsView />}
              {view === "medications" && <MedicationsView />}
              {view === "conditions" && <ConditionsView />}
              {view === "allergies" && <AllergiesView />}
              {view === "labs" && <LabsView />}
              {view === "studies" && <StudiesView />}
              {view === "visits" && <VisitsView />}
              {view === "providers" && <ProvidersView />}
              {view === "sources" && <SourcesView onFiles={onFiles} onDemo={onDemo} busy={busy} onRemove={(id) => setDocs((d) => d.filter((x) => x.id !== id))} />}
              {view === "ask" && <AskView />}
              <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
                Educational prototype using synthetic data only. Not for diagnosis, treatment, or medical decision-making. The application organizes evidence; humans interpret it.
              </footer>
            </main>
          </div>
        )}
        <SourceDrawer target={target} onClose={() => setTarget(null)} />
      </div>
    </Records.Provider>
  );
}

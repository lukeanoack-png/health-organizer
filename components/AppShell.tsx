"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conflict, RawDocument, RecordSet, ReviewStatus } from "@/lib/types";
import { processDocuments } from "@/lib/pipeline";
import { ingestFile } from "@/lib/ingest/readers";
import { loadDemoDocuments } from "@/lib/demo/load";
import { annotate, loadAnnotations, saveAnnotations, statusOf, type AnnotationMap } from "@/lib/annotations";
import { demographicValues } from "@/lib/summaries";
import { formatDate } from "@/lib/normalize/values";
import { Records, useRecords as useCtx, type EvidenceTarget, type RecordsCtx, type View } from "./context";
import { SourceDrawer } from "./SourceDrawer";
import { UploadPanel } from "./UploadPanel";
import { SourceChips } from "./ui";
import {
  IconAllergy, IconAsk, IconChevronDown, IconClose, IconCondition, IconConflict, IconImaging, IconLab, IconMenu,
  IconOverview, IconPill, IconPlus, IconProvider, IconSources, IconTimeline, IconVisit, LogoMark,
} from "./icons";
import { OverviewView } from "./views/OverviewView";
import { TimelineView } from "./views/TimelineView";
import { ConflictsView } from "./views/ConflictsView";
import { AskView } from "./views/AskView";
import {
  AllergiesView, ConditionsView, LabsView, MedicationsView, ProvidersView, SourcesView, StudiesView, VisitsView,
} from "./views/RecordViews";

const EMPTY: RecordSet = { documents: [], facts: [], conflicts: [], timeline: [] };

type NavItem = { view: View; label: string; Icon: (p: { size?: number }) => React.JSX.Element };
const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Review", items: [
    { view: "overview", label: "Overview", Icon: IconOverview },
    { view: "timeline", label: "Timeline", Icon: IconTimeline },
    { view: "conflicts", label: "Conflicts", Icon: IconConflict },
  ] },
  { label: "Record", items: [
    { view: "medications", label: "Medications", Icon: IconPill },
    { view: "conditions", label: "Conditions", Icon: IconCondition },
    { view: "allergies", label: "Allergies", Icon: IconAllergy },
    { view: "labs", label: "Labs", Icon: IconLab },
    { view: "studies", label: "Imaging & procedures", Icon: IconImaging },
    { view: "visits", label: "Visits", Icon: IconVisit },
    { view: "providers", label: "Providers", Icon: IconProvider },
  ] },
  { label: "Evidence", items: [
    { view: "sources", label: "Sources", Icon: IconSources },
    { view: "ask", label: "Ask Records", Icon: IconAsk },
  ] },
];
const ALL_NAV = NAV.flatMap((g) => g.items);

/** Small reusable modal with focus handling (used for About and the mobile nav). */
function useDialog(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("button, a[href], input, select");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key !== "Tab" || !ref.current) return;
      const f = ref.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea");
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener.current?.focus(); };
  }, [open, onClose, ref]);
}

function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="about-title" className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-raised">
        <div className="flex items-start justify-between gap-4">
          <h2 id="about-title" className="text-lg font-bold">About this prototype</h2>
          <button type="button" className="btn btn-ghost -mr-2 -mt-1 px-2" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink">
          <p><strong>Educational prototype using synthetic data only. Not for diagnosis, treatment, or medical decision-making.</strong></p>
          <p>It organizes fictional health documents, links every extracted fact to the passage it came from, and lists places where sources disagree. It never decides which source is correct. The app organizes evidence; people interpret it.</p>
          <p className="text-muted">It does not give diagnoses, treatment or medication recommendations, risk scores, predictions, or triage. Do not upload real medical records or personally identifiable information, including your own.</p>
          <p className="text-muted">Files are read in your browser and are not sent to a server. Loaded documents are cleared when the page reloads; only review labels are kept in this browser.</p>
        </div>
      </div>
    </div>
  );
}

function NavList({ view, onSelect, unresolved }: { view: View; onSelect: (v: View) => void; unresolved: number }) {
  return (
    <>
      {NAV.map((g, gi) => (
        <div key={g.label} className={gi ? "mt-3 border-t border-line pt-3" : ""} role="group" aria-label={g.label}>
          {g.items.map(({ view: v, label, Icon }) => {
            const active = v === view;
            return (
              <button
                key={v}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onSelect(v)}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active ? "bg-brand-soft font-semibold text-brand before:absolute before:left-0 before:top-1.5 before:h-[calc(100%-12px)] before:w-[3px] before:rounded-full before:bg-brand" : "text-ink hover:bg-subtle"
                }`}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {v === "conflicts" && unresolved > 0 && (
                  <span className={`rounded-md px-1.5 text-xs font-semibold tabular-nums ${active ? "bg-surface text-brand" : "bg-review-soft text-review"}`} aria-label={`${unresolved} to review`}>{unresolved}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function DobControl({ onReview }: { onReview: () => void }) {
  const { rs } = useCtx();
  const dobs = demographicValues(rs, "date of birth");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[role="dialog"]')) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!dobs.length) return <span className="text-muted">DOB not stated</span>;
  if (dobs.length === 1) return <span>DOB {formatDate(dobs[0].value)}</span>;
  return (
    <div ref={wrap} className="relative inline-block">
      <button type="button" aria-expanded={open} aria-controls="dob-popover" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 font-semibold text-review underline decoration-dotted underline-offset-2 hover:text-ink">
        DOB: {dobs.length} conflicting values <IconChevronDown size={14} />
      </button>
      {open && (
        <div id="dob-popover" className="fixed inset-x-3 top-[112px] z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-raised sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[360px]">
          <p className="text-sm font-semibold text-ink">Date of birth differs between sources</p>
          <ul className="mt-3 space-y-3">
            {dobs.map((d) => (
              <li key={d.value}>
                <p className="text-sm font-semibold">{formatDate(d.value)} <span className="font-normal text-muted">· {new Set(d.facts.map((f) => f.source.documentId)).size} source(s)</span></p>
                <div className="mt-1.5"><SourceChips facts={d.facts} max={4} /></div>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-4 text-sm link" onClick={() => { setOpen(false); onReview(); }}>Review this conflict</button>
        </div>
      )}
    </div>
  );
}


export function AppShell() {
  const [docs, setDocs] = useState<RawDocument[]>([]);
  const [rs, setRs] = useState<RecordSet>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [view, setView] = useState<View>("overview");
  const [focusConflictId, setFocusConflictId] = useState<string | null>(null);
  const [target, setTarget] = useState<EvidenceTarget | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationMap>({});
  const [about, setAbout] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const evidenceOpener = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => setAnnotations(loadAnnotations()), []);

  useEffect(() => {
    let live = true;
    setProcessing(true);
    processDocuments(docs).then((r) => { if (live) { setRs(r); setProcessing(false); } });
    return () => { live = false; };
  }, [docs]);

  const closeNav = useCallback(() => setNavOpen(false), []);
  useDialog(navOpen, closeNav, navRef);

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
      try { out.push(await ingestFile(f.name, new Uint8Array(await f.arrayBuffer()), "upload")); }
      catch (e) { errs.push(`${f.name}: ${(e as Error).message}`); }
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

  const go = useCallback((v: View, opts?: { conflictId?: string }) => {
    setView(v);
    setFocusConflictId(opts?.conflictId ?? null);
    setNavOpen(false);
    if (!opts?.conflictId) {
      window.scrollTo({ top: 0 });
      setTimeout(() => mainRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }), 0);
    }
  }, []);

  // Evidence panel: remember what opened it, give focus back when it closes.
  const openEvidence = useCallback((t: EvidenceTarget) => {
    evidenceOpener.current = document.activeElement as HTMLElement | null;
    setTarget(t);
  }, []);
  const closeEvidence = useCallback(() => {
    setTarget(null);
    const el = evidenceOpener.current;
    setTimeout(() => el?.isConnected && el.focus(), 0);
  }, []);

  const letters = useMemo(() => {
    const sorted = [...rs.documents].sort((a, b) => (a.meta.recordDate ?? "9999").localeCompare(b.meta.recordDate ?? "9999") || a.fileName.localeCompare(b.fileName));
    return new Map(sorted.map((d, i) => [d.id, i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`]));
  }, [rs.documents]);

  const ctx: RecordsCtx = useMemo(() => {
    const docMap = new Map(rs.documents.map((d) => [d.id, d]));
    const factMap = new Map(rs.facts.map((f) => [f.id, f]));
    const byFact = new Map<string, Conflict[]>();
    for (const c of rs.conflicts) for (const id of c.factIds) byFact.set(id, [...(byFact.get(id) ?? []), c]);
    return {
      rs,
      busy: busy || processing,
      doc: (id) => docMap.get(id),
      fact: (id) => factMap.get(id),
      letter: (id) => letters.get(id) ?? "?",
      conflictsForFact: (id) => byFact.get(id) ?? [],
      openFacts: (ids, heading) => {
        const facts = ids.map((id) => factMap.get(id)).filter((f): f is NonNullable<typeof f> => !!f);
        if (!facts.length) return;
        const docId = facts[0].source.documentId;
        const same = facts.filter((f) => f.source.documentId === docId);
        openEvidence({ documentId: docId, ranges: same.map((f) => ({ start: f.source.charStart, end: f.source.charEnd })), factIds: same.map((f) => f.id), heading });
      },
      openEvidence,
      annotations,
      setReview: (c, patch: { status?: ReviewStatus; note?: string }) =>
        setAnnotations((m) => { const n = annotate(m, c, patch); saveAnnotations(n); return n; }),
      go,
      focusConflictId,
    };
  }, [rs, letters, annotations, busy, processing, go, openEvidence, focusConflictId]);

  const unresolved = rs.conflicts.filter((c) => statusOf(annotations, c) === "unresolved").length;
  const names = demographicValues(rs, "patient name");
  const dates = rs.documents.map((d) => d.meta.recordDate).filter(Boolean).sort() as string[];
  const loaded = rs.documents.length > 0;
  const dobConflict = rs.conflicts.find((c) => c.type === "demographic" && c.subject === "date of birth");
  const addDocs = () => { go("sources"); setTimeout(() => document.getElementById("add-documents")?.scrollIntoView({ block: "start" }), 30); };

  return (
    <Records.Provider value={ctx}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised">Skip to content</a>
      <div className="min-h-screen">
        <div className="flex items-center justify-center gap-3 bg-ink px-4 py-1.5 text-center text-xs font-medium text-white" role="note">
          <span>Synthetic records only · Educational prototype · Not for clinical use.</span>
          <button type="button" onClick={() => setAbout(true)} className="underline underline-offset-2 hover:text-brand-line">About</button>
        </div>

        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="flex items-center gap-3 px-4 py-3 sm:gap-5 sm:px-5">
            {loaded && (
              <button type="button" className="btn btn-ghost -ml-1 px-2 md:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-expanded={navOpen} aria-controls="mobile-nav">
                <IconMenu size={20} />
              </button>
            )}
            <div className="flex shrink-0 items-center gap-2.5">
              <LogoMark size={32} />
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-bold text-ink">Record Organizer</div>
                <div className="text-xs text-muted">Synthetic health records</div>
              </div>
            </div>
            {loaded && (
              <>
                <div className="hidden h-9 w-px bg-line sm:block" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate text-base font-bold text-ink">{names[0]?.value ?? "Patient name not stated"}</span>
                    <span className="text-xs font-medium text-muted">Fictional patient</span>
                    {names.length > 1 && <span className="text-xs font-semibold text-review">· name differs across sources</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <DobControl onReview={() => go("conflicts", { conflictId: dobConflict?.id })} />
                    <span aria-hidden className="hidden sm:inline">·</span>
                    <span>{rs.documents.length} documents</span>
                    {dates.length > 0 && <><span aria-hidden className="hidden sm:inline">·</span><span className="hidden sm:inline">{formatDate(dates[0]).replace(/, \d{4}$/, "")} – {formatDate(dates[dates.length - 1])}</span></>}
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {errors.length > 0 && (
          <div className="border-b border-review-line bg-review-soft px-5 py-2 text-sm text-ink" role="alert">
            {errors.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}

        {!loaded ? (
          <main id="main" ref={mainRef} className="mx-auto max-w-4xl px-4 py-10 sm:px-5">
            <h1 tabIndex={-1} className="text-3xl font-bold tracking-tight text-ink">Organize synthetic health records — and see where every fact came from</h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
              Add several fictional documents — visit notes, lab reports, medication lists, discharge summaries, imaging reports. Each extracted fact keeps a link to its source passage, and places where sources disagree are listed for review without choosing which is right.
            </p>
            <div className="mt-7"><UploadPanel onFiles={onFiles} onDemo={onDemo} busy={busy} /></div>
            <button type="button" className="mt-6 text-sm link" onClick={() => setAbout(true)}>What this prototype does and does not do</button>
          </main>
        ) : (
          <div className="flex">
            <nav aria-label="Sections" className="sticky top-[66px] hidden h-[calc(100vh-66px)] w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
              <div className="scroll-thin flex-1 overflow-y-auto"><NavList view={view} onSelect={(v) => go(v)} unresolved={unresolved} /></div>
              <div className="border-t border-line pt-3">
                <button type="button" className="btn btn-primary w-full py-2.5" onClick={addDocs}><IconPlus size={16} />Add documents</button>
                <button type="button" className="mt-2 w-full rounded-md py-1 text-xs text-muted hover:text-ink" onClick={() => { setDocs([]); go("overview"); }}>Clear all documents</button>
              </div>
            </nav>

            {navOpen && (
              <div className="fixed inset-0 z-50 md:hidden">
                <div className="absolute inset-0 bg-ink/30" aria-hidden onClick={closeNav} />
                <div ref={navRef} id="mobile-nav" role="dialog" aria-modal="true" aria-label="Navigation" className="relative flex h-full w-[min(84vw,300px)] flex-col bg-surface px-3 py-4 shadow-raised">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2"><LogoMark size={26} /><span className="text-sm font-bold">Record Organizer</span></div>
                    <button type="button" className="btn btn-ghost px-2" onClick={closeNav} aria-label="Close navigation"><IconClose /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto"><NavList view={view} onSelect={(v) => go(v)} unresolved={unresolved} /></div>
                  <button type="button" className="btn btn-primary mt-3 w-full py-2.5" onClick={addDocs}><IconPlus size={16} />Add documents</button>
                </div>
              </div>
            )}

            <main id="main" ref={mainRef} className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <div className="mx-auto max-w-[1240px] [&_h1]:outline-none">
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
                {view === "sources" && <SourcesView onFiles={onFiles} onDemo={onDemo} onRemove={(id) => setDocs((d) => d.filter((x) => x.id !== id))} />}
                {view === "ask" && <AskView />}
              </div>
            </main>
          </div>
        )}
        <SourceDrawer target={target} onClose={closeEvidence} />
        <AboutDialog open={about} onClose={() => setAbout(false)} />
        <span className="sr-only" aria-live="polite">{loaded ? `${ALL_NAV.find((n) => n.view === view)?.label} view` : ""}</span>
      </div>
    </Records.Provider>
  );
}

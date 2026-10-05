"use client";

import { useEffect, useMemo, useRef } from "react";
import { formatDate } from "@/lib/normalize/values";
import { displayName } from "@/lib/conflicts/detect";
import { useRecords, type EvidenceTarget } from "./context";
import { Badge, ConflictFlag, Confidence, StatusPill } from "./ui";

function segments(text: string, ranges: { start: number; end: number }[]) {
  const rs = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: { text: string; mark: boolean; first: boolean }[] = [];
  let pos = 0;
  rs.forEach((r, i) => {
    const s = Math.max(r.start, pos);
    if (s > pos) out.push({ text: text.slice(pos, s), mark: false, first: false });
    if (r.end > s) out.push({ text: text.slice(s, r.end), mark: true, first: i === 0 });
    pos = Math.max(pos, r.end);
  });
  out.push({ text: text.slice(pos), mark: false, first: false });
  return out;
}

export function SourceDrawer({ target, onClose }: { target: EvidenceTarget | null; onClose: () => void }) {
  const { doc, fact, letter, conflictsForFact } = useRecords();
  const firstMark = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const d = target ? doc(target.documentId) : undefined;
  const facts = (target?.factIds ?? []).map(fact).filter((f): f is NonNullable<typeof f> => !!f);
  const segs = useMemo(() => (d && target ? segments(d.text, target.ranges) : []), [d, target]);

  useEffect(() => {
    // Centre the first highlighted passage inside the drawer's own scroll area.
    const t = setTimeout(() => {
      const box = scroller.current;
      const mark = firstMark.current;
      if (!box) return;
      if (!mark) { box.scrollTop = 0; return; }
      const offset = mark.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      box.scrollTop = Math.max(0, offset - box.clientHeight / 2);
    }, 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [target, onClose]);

  if (!target || !d) return null;
  const page = facts[0]?.source.page;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Source evidence">
      <button className="absolute inset-0 bg-slate-900/20" aria-label="Close evidence panel" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[720px] flex-col bg-white shadow-drawer">
        <header className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="h-section">Source evidence</div>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-slate-700 font-mono text-xs font-bold text-white">{letter(d.id)}</span>
                <span className="truncate">{d.meta.documentTypeLabel}</span>
              </h2>
            </div>
            <button className="btn" onClick={onClose}>Close <kbd className="text-[10px] text-muted">Esc</kbd></button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Record date</dt><dd className="font-medium">{formatDate(d.meta.recordDate)}</dd></div>
            <div><dt className="text-xs text-muted">Document type</dt><dd className="font-medium">{d.meta.documentType}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted">Fictional provider / institution</dt><dd className="font-medium">{d.meta.provider} · {d.meta.facility}</dd></div>
            <div className="col-span-2 sm:col-span-3"><dt className="text-xs text-muted">File</dt><dd className="truncate font-mono text-xs">{d.fileName}</dd></div>
            <div><dt className="text-xs text-muted">Section / page</dt><dd className="font-medium">{facts[0]?.source.section ?? "—"}{page ? ` · p. ${page}` : ""}</dd></div>
          </dl>
        </header>

        <div ref={scroller} className="scroll-thin flex-1 overflow-y-auto">
          {facts.length > 0 && (
            <div className="space-y-3 border-b border-line bg-slate-50/60 px-5 py-4">
              <div className="h-section">{target.heading ?? (facts.length > 1 ? "Extracted facts" : "Extracted fact")}</div>
              {facts.map((f) => (
                <div key={f.id} className="rounded-md border border-line bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{f.category}</Badge>
                    <span className="font-semibold">{displayName(f.normalizedLabel)}</span>
                    {f.value && <span className="text-sm text-slate-700">{f.value}{f.units ? ` ${f.units}` : ""}</span>}
                    <StatusPill status={f.status} />
                    <ConflictFlag conflicts={conflictsForFact(f.id)} />
                  </div>
                  <blockquote className="mt-2 border-l-2 border-amber-300 pl-3 text-sm italic text-slate-700">“{f.source.excerpt}”</blockquote>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>Written as: “{f.label}”</span>
                    {f.eventDate && <span>Event date: {formatDate(f.eventDate)}</span>}
                    <span>Section: {f.source.section ?? "—"}{f.source.page ? ` · page ${f.source.page}` : ""}</span>
                    <Confidence value={f.confidence} extractor={f.extractor} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="h-section">Original document (unmodified)</div>
              <Badge tone="synth">SYNTHETIC</Badge>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-line bg-white p-4 font-mono text-[12.5px] leading-relaxed text-slate-800">
              {segs.map((s, i) =>
                s.mark ? (
                  <mark key={i} ref={s.first ? firstMark : undefined} className="evidence">{s.text}</mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </pre>
          </div>
        </div>
      </aside>
    </div>
  );
}

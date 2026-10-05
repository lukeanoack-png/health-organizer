"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { formatDate } from "@/lib/normalize/values";
import { displayName } from "@/lib/conflicts/detect";
import { statusOf } from "@/lib/annotations";
import { useRecords, type EvidenceTarget } from "./context";
import { Confidence, ReviewTag, SourceId, StatusText } from "./ui";
import { IconClose } from "./icons";

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

/**
 * Accessible side panel (role="dialog"). Focus moves to the close button on open, Tab is
 * kept inside the panel, Esc closes, and the opener restores focus to the triggering
 * control (see AppShell).
 */
export function SourceDrawer({ target, onClose }: { target: EvidenceTarget | null; onClose: () => void }) {
  const { doc, fact, letter, conflictsForFact, annotations, go } = useRecords();
  const panel = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  const firstMark = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const d = target ? doc(target.documentId) : undefined;
  const facts = (target?.factIds ?? []).map(fact).filter((f): f is NonNullable<typeof f> => !!f);
  const segs = useMemo(() => (d && target ? segments(d.text, target.ranges) : []), [d, target]);

  const jumpToPassage = useCallback(() => {
    const box = scroller.current;
    const mark = firstMark.current;
    if (!box || !mark) return;
    const offset = mark.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, offset - box.clientHeight / 3);
  }, []);

  useEffect(() => {
    if (!target) return;
    closeBtn.current?.focus();
    const t = setTimeout(() => (firstMark.current ? jumpToPassage() : scroller.current && (scroller.current.scrollTop = 0)), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const focusables = panel.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [target, onClose, jumpToPassage]);

  if (!target || !d) return null;
  const titleId = "evidence-title";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/25" aria-hidden onClick={onClose} />
      <aside ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex h-full w-full max-w-[720px] flex-col bg-surface shadow-drawer">
        <header className="border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">{target.heading ?? "Source evidence"}</p>
              <h2 id={titleId} className="mt-1.5 flex items-center gap-2 text-lg font-bold text-ink">
                <SourceId id={letter(d.id)} className="h-6 min-w-[24px] text-xs" />
                <span className="min-w-0 break-words">{d.meta.documentTypeLabel}</span>
              </h2>
            </div>
            <button ref={closeBtn} type="button" className="btn btn-ghost -mr-2 px-2" onClick={onClose} aria-label="Close source panel">
              <IconClose />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_auto_1fr]">
            <div><dt className="text-xs text-muted">Source ID</dt><dd className="font-semibold">{letter(d.id)}</dd></div>
            <div><dt className="text-xs text-muted">Record date</dt><dd className="font-semibold">{formatDate(d.meta.recordDate)}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted">Fictional facility · provider</dt><dd className="break-words font-semibold">{d.meta.facility} · {d.meta.provider}</dd></div>
            <div className="sm:col-span-3"><dt className="text-xs text-muted">File</dt><dd className="break-all font-mono text-xs">{d.fileName}</dd></div>
          </dl>
        </header>

        <div ref={scroller} className="scroll-thin flex-1 overflow-y-auto">
          {facts.length > 0 && (
            <section aria-label="Relevant passages" className="border-b border-line px-5 py-5 sm:px-6">
              <h3 className="eyebrow mb-3">{facts.length > 1 ? `${facts.length} relevant passages` : "Relevant passage"}</h3>
              <ol className="space-y-4">
                {facts.map((f) => {
                  const conflicts = conflictsForFact(f.id);
                  return (
                    <li key={f.id} className="border-l-2 border-[#E9B949] pl-4">
                      <p className="text-xs font-medium text-muted">
                        {f.source.section ?? "—"}{f.source.page ? ` · page ${f.source.page}` : ""}
                      </p>
                      <blockquote className="mt-1 text-[15px] leading-relaxed text-ink">“{f.source.excerpt.trim()}”</blockquote>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>
                          Extracted as <span className="font-semibold text-ink">{displayName(f.normalizedLabel)}</span>
                          {f.value ? <> · {f.value}{f.units ? ` ${f.units}` : ""}</> : null} · <StatusText status={f.status} />
                        </span>
                        {f.eventDate && f.eventDate !== d.meta.recordDate && <span>Event date {formatDate(f.eventDate)}</span>}
                        <Confidence value={f.confidence} extractor={f.extractor} />
                      </p>
                      {conflicts.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {conflicts.map((c) => (
                            <button key={c.id} type="button" onClick={() => { onClose(); go("conflicts", { conflictId: c.id }); }} className="flex flex-wrap items-center gap-2 text-left text-xs">
                              <ReviewTag status={statusOf(annotations, c)} />
                              <span className="link">{c.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <section aria-label="Full document" className="px-5 py-5 sm:px-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="eyebrow">Full document · unmodified · synthetic</h3>
              {target.ranges.length > 0 && <button type="button" className="text-xs link" onClick={jumpToPassage}>Jump to highlighted text</button>}
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-4 font-mono text-[12.5px] leading-relaxed text-ink">
              {segs.map((s, i) =>
                s.mark ? <mark key={i} ref={s.first ? firstMark : undefined} className="evidence">{s.text}</mark> : <span key={i}>{s.text}</span>,
              )}
            </pre>
          </section>
        </div>
      </aside>
    </div>
  );
}

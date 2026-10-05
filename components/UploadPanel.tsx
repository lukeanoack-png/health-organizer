"use client";

import { useId, useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS } from "@/lib/ingest/readers";
import { IconInfo, IconUpload } from "./icons";

/** Permanent warning shown next to every upload control. */
export function SyntheticWarning() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-review-line bg-review-soft px-4 py-3 text-sm text-ink" role="note">
      <span className="mt-0.5 text-review"><IconInfo size={18} /></span>
      <p>
        <strong>Synthetic records only. Do not upload real medical records or personally identifiable health information.</strong>{" "}
        That includes your own. Files are read in your browser and are not sent to a server or saved.
      </p>
    </div>
  );
}

export function UploadPanel({ onFiles, onDemo, busy }: { onFiles: (files: File[]) => void; onDemo: () => void; busy: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const checkId = useId();

  const accept = (list: FileList | null) => {
    if (!list || !confirmed) return;
    onFiles([...list]);
  };

  return (
    <div className="space-y-3">
      <SyntheticWarning />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
        <div
          onDragOver={(e) => { e.preventDefault(); if (confirmed) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files); }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            !confirmed ? "border-line bg-subtle/60" : over ? "border-brand bg-brand-soft" : "border-[#C9CDD2] bg-surface"
          }`}
        >
          <span className="mb-2 text-muted"><IconUpload size={26} /></span>
          <p className="font-semibold text-ink">Drag synthetic documents here</p>
          <p className="mt-1 text-xs text-muted">{ACCEPTED_EXTENSIONS.join("  ·  ")} — scanned images are not read</p>
          <div className="mt-4 flex items-start gap-2 text-left text-sm text-ink">
            <input id={checkId} type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#B42336]" />
            <label htmlFor={checkId}>I confirm these files contain only synthetic, fictional data.</label>
          </div>
          <button type="button" className="btn mt-3" disabled={!confirmed || busy} onClick={() => input.current?.click()} aria-describedby={confirmed ? undefined : checkId}>
            Choose files…
          </button>
          {!confirmed && <p className="mt-1.5 text-xs text-muted">Confirm the checkbox to enable uploading.</p>}
          <input ref={input} type="file" multiple accept={ACCEPTED_EXTENSIONS.join(",")} className="hidden" onChange={(e) => { accept(e.target.files); e.target.value = ""; }} tabIndex={-1} aria-hidden />
        </div>
        <div className="flex flex-col justify-center rounded-xl border border-line bg-surface p-5">
          <p className="eyebrow">Demo mode</p>
          <p className="mt-1.5 text-sm text-muted">Nine fictional records from six fictional sources, with planted disagreements.</p>
          <button type="button" className="btn btn-primary mt-4 py-2.5" onClick={onDemo} disabled={busy}>
            {busy ? "Processing…" : "Load Demo Records"}
          </button>
        </div>
      </div>
    </div>
  );
}

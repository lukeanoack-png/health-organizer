"use client";

import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS } from "@/lib/ingest/readers";

export function SyntheticWarning() {
  return (
    <div className="flex items-start gap-3 rounded-md border border-synth-line bg-synth-soft px-4 py-3 text-sm text-[#5c3d00]" role="note">
      <span aria-hidden className="mt-0.5 font-bold">!</span>
      <p>
        <strong>Synthetic records only. Do not upload real medical records or personally identifiable health information.</strong>{" "}
        That includes your own records. Files are read in your browser and are not sent to a server or saved.
      </p>
    </div>
  );
}

export function UploadPanel({
  onFiles, onDemo, busy, compact = false,
}: { onFiles: (files: File[]) => void; onDemo: () => void; busy: boolean; compact?: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const accept = (list: FileList | null) => {
    if (!list || !confirmed) return;
    onFiles([...list]);
  };

  return (
    <div className="space-y-3">
      <SyntheticWarning />
      <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-[1fr_260px]"}`}>
        <div
          onDragOver={(e) => { e.preventDefault(); if (confirmed) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files); }}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
            !confirmed ? "border-line bg-slate-50 opacity-70" : over ? "border-accent bg-accent-soft" : "border-slate-300 bg-white"
          }`}
        >
          <svg aria-hidden width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mb-2 text-muted">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5" />
          </svg>
          <p className="text-sm font-medium text-ink">Drag synthetic documents here</p>
          <p className="mt-1 text-xs text-muted">{ACCEPTED_EXTENSIONS.join(" · ")} — scanned images are not read</p>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-left text-xs text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent" />
            I confirm these files contain only synthetic, fictional data.
          </label>
          <button type="button" className="btn mt-3" disabled={!confirmed || busy} onClick={() => input.current?.click()}>
            Choose files…
          </button>
          <input ref={input} type="file" multiple accept={ACCEPTED_EXTENSIONS.join(",")} className="hidden" onChange={(e) => { accept(e.target.files); e.target.value = ""; }} />
        </div>
        <div className="flex flex-col justify-center rounded-lg border border-line bg-white p-5">
          <p className="h-section">Demo mode</p>
          <p className="mt-1 text-sm text-muted">Nine fictional records from six fictional sources, with planted disagreements.</p>
          <button type="button" className="btn btn-primary mt-3 justify-center py-2" onClick={onDemo} disabled={busy}>
            {busy ? "Processing…" : "Load Demo Records"}
          </button>
        </div>
      </div>
    </div>
  );
}

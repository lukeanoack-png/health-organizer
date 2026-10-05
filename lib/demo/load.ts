/**
 * Demo mode. The demo dataset is just files in public/demo-records/ listed in
 * manifest.json. "Load Demo Records" fetches them and runs them through the exact same
 * ingestion pipeline as a drag-and-drop upload — there is no separate demo code path.
 *
 * To replace the dataset: put new files in public/demo-records/ and list them in
 * manifest.json. TXT, CSV, DOCX and PDF all work.
 */
import type { RawDocument } from "../types";
import { ingestFile } from "../ingest/readers";

export const DEMO_BASE = "/demo-records";

export interface DemoManifest {
  description?: string;
  files: string[];
}

export async function loadDemoDocuments(base = DEMO_BASE): Promise<RawDocument[]> {
  const res = await fetch(`${base}/manifest.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("Demo manifest not found (public/demo-records/manifest.json).");
  const manifest = (await res.json()) as DemoManifest;
  return Promise.all(
    manifest.files.map(async (name) => {
      const r = await fetch(`${base}/${encodeURIComponent(name)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Demo file missing: ${name}`);
      return ingestFile(name, new Uint8Array(await r.arrayBuffer()), "demo");
    }),
  );
}

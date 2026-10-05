import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestFile } from "../lib/ingest/readers";
import { processDocuments } from "../lib/pipeline";
import type { Fact, RawDocument } from "../lib/types";

export const DEMO_DIR = join(__dirname, "..", "public", "demo-records");

/** Load the demo dataset from disk through the same ingestion path the browser uses. */
export async function loadDemoFromDisk(): Promise<RawDocument[]> {
  const manifest = JSON.parse(readFileSync(join(DEMO_DIR, "manifest.json"), "utf8")) as { files: string[] };
  return Promise.all(
    manifest.files.map((f) => ingestFile(f, new Uint8Array(readFileSync(join(DEMO_DIR, f))), "demo")),
  );
}

export async function demoRecordSet() {
  return processDocuments(await loadDemoFromDisk());
}

/** Build a tiny synthetic text record for focused tests. */
export async function doc(name: string, date: string, body: string, type = "Primary Care Office Visit") {
  const text = `SYNTHETIC — NOT A REAL PATIENT
Document Type: ${type}
Facility: Test Clinic (fictional)
Provider: Test Provider, MD (fictional)
Date of Service: ${date}
Patient: Test Patient (fictional)

${body.trim()}
`;
  return ingestFile(name, new TextEncoder().encode(text), "upload");
}

export const by = (facts: Fact[], category: Fact["category"], key: string) =>
  facts.filter((f) => f.category === category && f.normalizedLabel === key);

import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestFile } from "../lib/ingest/readers";
import { processDocuments } from "../lib/pipeline";

/** Build a tiny one-page PDF with one text line per row (no external tools needed). */
function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const stream = `BT /F1 11 Tf 14 TL 50 780 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

test("PDF ingestion extracts text with page numbers, and facts carry the page", async () => {
  const pdf = makePdf([
    "SYNTHETIC - NOT A REAL PATIENT",
    "Document Type: Cardiology Consultation",
    "Provider: Test Provider, MD (fictional)",
    "Date of Service: 2026-03-12",
    "",
    "CURRENT MEDICATIONS:",
    "- Lisinopril 20 mg daily",
  ]);
  const d = await ingestFile("consult.pdf", pdf, "upload");
  assert.equal(d.format, "pdf");
  assert.equal(d.pages?.length, 1);
  assert.match(d.text, /Lisinopril 20 mg daily/);
  const rs = await processDocuments([d]);
  const f = rs.facts.find((x) => x.normalizedLabel === "lisinopril");
  assert.ok(f, `expected a lisinopril fact; text was:\n${d.text}`);
  assert.equal(f.source.page, 1);
});

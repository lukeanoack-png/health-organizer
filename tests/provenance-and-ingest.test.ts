import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { ingestFile } from "../lib/ingest/readers";
import { verifyProvenance } from "../lib/extract";
import { processDocuments } from "../lib/pipeline";
import { annotate, evidenceChanged, statusOf } from "../lib/annotations";
import { doc } from "./helpers";

/** Write a minimal .docx (zip with word/document.xml) so the DOCX reader can be tested. */
function makeDocx(paragraphs: string[]): Uint8Array {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs
    .map((p) => `<w:p><w:r><w:t>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`)
    .join("")}</w:body></w:document>`;
  const name = Buffer.from("word/document.xml");
  const data = deflateRawSync(Buffer.from(xml));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(xml.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(xml.length, 24); central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(cdOffset, 16);
  return new Uint8Array(Buffer.concat([local, name, data, central, name, end]));
}

test("DOCX ingestion reads text and the pipeline extracts sourced facts from it", async () => {
  const bytes = makeDocx([
    "SYNTHETIC — NOT A REAL PATIENT",
    "Document Type: Cardiology Consultation",
    "Provider: Test Provider, MD (fictional)",
    "Date of Service: 2026-03-12",
    "",
    "CURRENT MEDICATIONS:",
    "- Lisinopril 20 mg daily",
  ]);
  const d = await ingestFile("consult.docx", bytes, "upload");
  assert.equal(d.format, "docx");
  assert.equal(d.meta.recordDate, "2026-03-12");
  assert.equal(d.meta.documentType, "Specialist note");
  const rs = await processDocuments([d]);
  const f = rs.facts.find((x) => x.normalizedLabel === "lisinopril")!;
  assert.equal(f.value, "20 mg once daily");
  assert.equal(f.source.excerpt, "Lisinopril 20 mg daily");
});

test("CSV lab reports become one sourced fact per row", async () => {
  const csv = "# SYNTHETIC\n# Document Type: Laboratory Report\n# Report Date: 2026-01-16\ntest,result,units,collected\nHbA1c,7.4,%,2026-01-15\nLDL,162,mg/dL,2026-01-15\n";
  const d = await ingestFile("labs.csv", new TextEncoder().encode(csv), "upload");
  const rs = await processDocuments([d]);
  const labs = rs.facts.filter((f) => f.category === "lab");
  assert.deepEqual(labs.map((f) => f.normalizedLabel), ["hemoglobin a1c", "ldl cholesterol"]);
  assert.equal(labs[0].source.section, "Table row 1");
  assert.equal(labs[0].source.excerpt, "HbA1c,7.4,%,2026-01-15");
  assert.equal(labs[0].eventDate, "2026-01-15");
});

test("uploads without a SYNTHETIC marker are flagged", async () => {
  const d = await ingestFile("note.txt", new TextEncoder().encode("Document Type: Office Visit\nDate: 2026-01-01\n"), "upload");
  assert.equal(d.syntheticMarker, false);
  assert.ok(d.ingestNotes.some((n) => /SYNTHETIC/.test(n)));
});

test("unsupported formats are rejected with a clear message", async () => {
  await assert.rejects(() => ingestFile("scan.jpg", new Uint8Array([1, 2, 3]), "upload"), /Unsupported file type/);
});

test("verifyProvenance drops a fact whose quote is not in the document (e.g. an LLM paraphrase)", async () => {
  const d = await doc("a.txt", "2026-03-04", "CURRENT MEDICATIONS:\n- Lisinopril 10 mg daily");
  const rs = await processDocuments([d]);
  const real = rs.facts.find((f) => f.category === "medication")!;
  const invented = { ...real, id: "f_fake", source: { ...real.source, excerpt: "Lisinopril 40 mg daily", charStart: 0, charEnd: 5 } };
  const shifted = { ...real, id: "f_shift", source: { ...real.source, charStart: 0, charEnd: real.source.excerpt.length } };
  const out = verifyProvenance([real, invented, shifted], [d]);
  assert.deepEqual(out.kept.map((f) => f.id), [real.id, "f_shift"]);
  assert.equal(out.kept[1].source.charStart, real.source.charStart, "offsets are repaired from the verbatim quote");
  assert.equal(out.rejected[0].fact.id, "f_fake");
});

test("review annotations never modify evidence, and notice when new evidence arrives", async () => {
  const docs = [
    await doc("a.txt", "2026-03-04", "CURRENT MEDICATIONS:\n- Lisinopril 10 mg daily"),
    await doc("b.txt", "2026-03-12", "CURRENT MEDICATIONS:\n- Lisinopril 20 mg daily"),
  ];
  const rs = await processDocuments(docs);
  const before = JSON.stringify(rs);
  const c = rs.conflicts[0];
  const map = annotate({}, c, { status: "likely_documentation_error", note: "check with source" });
  assert.equal(statusOf(map, c), "likely_documentation_error");
  assert.equal(JSON.stringify(rs), before, "facts, conflicts and documents are untouched");

  const rs2 = await processDocuments([...docs, await doc("c.txt", "2026-04-01", "CURRENT MEDICATIONS:\n- Lisinopril 40 mg daily")]);
  const c2 = rs2.conflicts.find((x) => x.id === c.id)!;
  assert.ok(c2, "conflict IDs are stable when documents are added");
  assert.equal(evidenceChanged(map, c2), true);
});

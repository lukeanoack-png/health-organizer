/**
 * Checks on the placeholder demo dataset and on Ask Records.
 * When the final synthetic records replace the demo, update the EXPECTED block below.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ask } from "../lib/query/ask";
import { summarize } from "../lib/summaries";
import type { RecordSet } from "../lib/types";
import { demoRecordSet } from "./helpers";

const EXPECTED = {
  documents: 9,
  unexplainedConflictTitles: [
    "Penicillin allergy: recorded vs NKDA",
    "Sulfonamide antibiotics allergy: recorded vs NKDA",
    "Penicillin reaction: hives vs anaphylaxis",
    "Atrial fibrillation: recorded vs denied",
    "Type 2 diabetes mellitus vs prediabetes",
    "LDL cholesterol (Jan 15, 2026): 162 mg/dL vs 126 mg/dL",
    "Transthoracic echocardiogram date: Mar 2 vs Mar 20",
    "Date of birth: Jul 14, 1968 vs Apr 17, 1968",
  ],
  // A documented change explains some of these records but not all of them.
  partiallyExplainedTitles: ["Lisinopril: 10 mg vs 20 mg", "Atorvastatin: listed as current vs discontinued"],
  documentedChangeTitles: ["Metoprolol succinate: 25 mg vs 50 mg"],
};

let cached: RecordSet | null = null;
const rsP = async () => (cached ??= await demoRecordSet());

test("every demo file is marked SYNTHETIC and has a date, provider and facility", async () => {
  const rs = await rsP();
  assert.equal(rs.documents.length, EXPECTED.documents);
  for (const d of rs.documents) {
    assert.ok(d.syntheticMarker, `${d.fileName} must carry a SYNTHETIC marker`);
    assert.ok(d.meta.recordDate, `${d.fileName} has a record date`);
    assert.notEqual(d.meta.provider, "Unknown provider", d.fileName);
    assert.notEqual(d.meta.facility, "Unknown facility", d.fileName);
  }
});

test("demo dataset surfaces the planted conflicts", async () => {
  const rs = await rsP();
  const titles = (p: string) => rs.conflicts.filter((c) => c.pattern === p).map((c) => c.title);
  for (const t of EXPECTED.unexplainedConflictTitles) assert.ok(titles("unexplained").includes(t), `missing conflict: ${t}`);
  assert.deepEqual(titles("partially_explained").sort(), [...EXPECTED.partiallyExplainedTitles].sort());
  assert.deepEqual(titles("documented_change"), EXPECTED.documentedChangeTitles);
  // Metformin is listed identically by six sources: corroboration, not conflict.
  assert.ok(!rs.conflicts.some((c) => c.subject === "metformin"));
});

test("every displayed fact, event and summary row in the demo traces to a source passage", async () => {
  const rs = await rsP();
  const docs = new Map(rs.documents.map((d) => [d.id, d]));
  const facts = new Map(rs.facts.map((f) => [f.id, f]));
  for (const f of rs.facts) {
    const d = docs.get(f.source.documentId)!;
    assert.equal(d.text.slice(f.source.charStart, f.source.charEnd), f.source.excerpt);
    assert.ok(f.source.section, `${f.id} has a section`);
    assert.ok(f.confidence > 0 && f.confidence <= 1);
  }
  for (const e of rs.timeline) {
    assert.ok(e.factIds.length > 0, `event ${e.title} has evidence`);
    for (const id of e.factIds) assert.ok(facts.has(id));
  }
  for (const cat of ["medication", "condition", "allergy", "lab", "imaging", "procedure"] as const)
    for (const row of summarize(rs, cat)) assert.ok(row.facts.length > 0 && row.facts.every((f) => facts.has(f.id)));
});

test("Ask Records: answers cite valid sources", async () => {
  const rs = await rsP();
  for (const q of ["What medications appear in these records?", "Which documents mention hypertension?", "When was atorvastatin first mentioned?"]) {
    const a = ask(rs, q);
    assert.equal(a.kind, "answer", q);
    assert.ok(a.statements.length > 0, q);
    for (const s of a.statements)
      for (const c of s.citations) {
        const d = rs.documents.find((x) => x.id === c.documentId);
        assert.ok(d && c.end > c.start && c.end <= d.text.length, `citation in “${q}” points into a document`);
      }
  }
  const first = ask(rs, "When was atorvastatin first mentioned?");
  assert.match(first.statements[0].text, /Jan 15, 2026/);
  assert.equal(ask(rs, "Which documents mention hypertension?").statements.length, 5);
});

test("Ask Records: disagreements are stated, not resolved", async () => {
  const rs = await rsP();
  const a = ask(rs, "Are there conflicting medication doses?");
  assert.ok(a.statements.some((s) => s.disagreement && /^Lisinopril: 10 mg vs 20 mg\. 10 mg in .*; versus 20 mg in .*accounts for some of these records, but not all/.test(s.text)));
  assert.match(a.summary, /does not decide which is correct/);
  const meds = ask(rs, "What medications appear in these records?");
  const lis = meds.statements.find((s) => s.text.startsWith("Lisinopril"))!;
  assert.ok(lis.disagreement);
  assert.match(lis.text, /10 mg/);
  assert.match(lis.text, /20 mg/);
});

test("Ask Records: refuses medical advice and reports insufficient evidence", async () => {
  const rs = await rsP();
  for (const q of ["Should she stop taking lisinopril?", "What dose should she take?", "Is it safe to take apixaban with aspirin?", "What is her risk of stroke?"])
    assert.equal(ask(rs, q).kind, "out_of_scope", q);
  assert.equal(ask(rs, "What is her favorite color?").kind, "insufficient");
  assert.equal(ask(rs, "Which documents mention warfarin?").kind, "insufficient");
});

test("Ask Records: compares March and April records", async () => {
  const rs = await rsP();
  const a = ask(rs, "What changed between the March and April records?");
  assert.equal(a.kind, "answer");
  assert.ok(a.statements.some((s) => /Apixaban appears in Apr 2026 records/.test(s.text)));
  assert.ok(a.statements.some((s) => /Absence is not evidence it was stopped/.test(s.text)));
});

/**
 * Conflict detection — the seven required behaviours, each on small synthetic records
 * written inline so the test shows exactly what the sources say.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { processDocuments } from "../lib/pipeline";
import { by, doc } from "./helpers";

const meds = (lines: string) => `CURRENT MEDICATIONS:\n${lines}`;

test("1. two documents that agree on a medication produce no conflict", async () => {
  const rs = await processDocuments([
    await doc("a.txt", "2026-03-04", meds("- Lisinopril 10 mg once daily")),
    await doc("b.txt", "2026-03-12", meds("- Zestril 10 mg daily"), "Cardiology Consultation"),
  ]);
  const lis = by(rs.facts, "medication", "lisinopril");
  assert.equal(lis.length, 2, "brand and generic names normalize to one medication");
  assert.equal(new Set(lis.map((f) => f.source.documentId)).size, 2, "both sources are kept");
  assert.equal(rs.conflicts.length, 0);
});

test("2. two documents reporting different doses produce an unexplained dose conflict", async () => {
  const rs = await processDocuments([
    await doc("a.txt", "2026-03-04", meds("- Lisinopril 10 mg daily")),
    await doc("b.txt", "2026-03-12", meds("- Lisinopril 20 mg daily"), "Cardiology Consultation"),
  ]);
  assert.equal(rs.conflicts.length, 1);
  const c = rs.conflicts[0];
  assert.equal(c.type, "medication_dose");
  assert.equal(c.pattern, "unexplained");
  assert.equal(c.groups.length, 2, "both claims are shown side by side");
  assert.deepEqual(c.groups.map((g) => g.label), ["10 mg", "20 mg"]);
  assert.equal(c.title, "Lisinopril: 10 mg vs 20 mg", "title names the competing values");
  // Neutral: does not pick the newer source.
  assert.match(c.explanation, /No source documents a dose change/);
  assert.match(c.explanation, /undocumented change or a documentation discrepancy/);
  assert.doesNotMatch(c.explanation, /\b(correct dose is|should be|newer record is correct)\b/i);
});

test("3. active in one record and discontinued in a later record is a documented change, not a contradiction", async () => {
  const rs = await processDocuments([
    await doc("a.txt", "2026-03-04", meds("- Atorvastatin 20 mg nightly")),
    await doc("b.txt", "2026-04-02", "HOSPITAL COURSE:\nAtorvastatin discontinued due to myalgias.", "Hospital Discharge Summary"),
  ]);
  const c = rs.conflicts.find((x) => x.type === "medication_status");
  assert.ok(c, "the status difference is still surfaced for review");
  assert.equal(c.pattern, "documented_change");

  // Contrast: the same drug listed as current AFTER the discontinuation is unexplained.
  const rs2 = await processDocuments([
    await doc("a.txt", "2026-03-04", meds("- Atorvastatin 20 mg nightly")),
    await doc("b.txt", "2026-04-02", "HOSPITAL COURSE:\nAtorvastatin discontinued due to myalgias.", "Hospital Discharge Summary"),
    await doc("c.txt", "2026-04-15", meds("- Atorvastatin 20 mg nightly")),
  ]);
  const c2 = rs2.conflicts.find((x) => x.type === "medication_status")!;
  assert.equal(c2.pattern, "partially_explained", "the stop explains the earlier listing, not the later one");
  const later = rs2.facts.find((f) => f.source.documentName === "c.txt" && f.normalizedLabel === "atorvastatin")!;
  const earlier = rs2.facts.find((f) => f.source.documentName === "a.txt" && f.normalizedLabel === "atorvastatin")!;
  assert.ok(c2.observations.some((o) => o.kind === "unexplained" && o.factIds.includes(later.id) && /as current after/.test(o.text)));
  assert.ok(c2.observations.some((o) => o.kind === "explained" && o.factIds.includes(earlier.id)));
});

test("4. two sources disagreeing about an allergy produce an allergy conflict", async () => {
  const rs = await processDocuments([
    await doc("a.txt", "2026-01-15", "ALLERGIES:\n- Penicillin (hives)"),
    await doc("b.txt", "2026-03-12", "ALLERGIES:\n- NKDA", "Cardiology Consultation"),
    await doc("c.txt", "2026-04-02", "ALLERGIES:\n- PCN (anaphylaxis)", "Hospital Discharge Summary"),
  ]);
  const types = rs.conflicts.map((c) => c.type).sort();
  assert.deepEqual(types, ["allergy", "allergy_reaction"]);
  const a = rs.conflicts.find((c) => c.type === "allergy")!;
  assert.equal(a.subject, "penicillin");
  assert.equal(a.groups[0].factIds.length, 2, "PCN and Penicillin are recognized as the same allergen");
  assert.equal(a.groups[1].factIds.length, 1, "the NKDA statement is the competing claim");
});

test("5. repeated identical facts do not create a conflict", async () => {
  const body = `${meds("- Metformin 500 mg twice daily")}\n\nALLERGIES:\n- Penicillin (hives)\n\nPROBLEM LIST:\n- Hypertension\n\nRESULTS:\n- Hemoglobin A1c 7.4 % (01/15/2026)`;
  const rs = await processDocuments([
    await doc("a.txt", "2026-01-15", body),
    await doc("b.txt", "2026-03-04", body.replace("Metformin 500 mg twice daily", "Metformin 500 mg BID")),
    await doc("c.txt", "2026-04-15", body),
  ]);
  assert.equal(rs.conflicts.length, 0);
  assert.equal(by(rs.facts, "medication", "metformin").length, 3, "each repetition is kept as a separate sourced fact");
  assert.equal(by(rs.facts, "lab", "hemoglobin a1c").length, 3);
});

test("6. a documented later change is distinguishable from an unexplained contradiction", async () => {
  const documented = await processDocuments([
    await doc("a.txt", "2026-03-12", meds("- Metoprolol succinate 25 mg daily"), "Cardiology Consultation"),
    await doc("b.txt", "2026-04-02",
      "HOSPITAL COURSE:\nMetoprolol succinate increased from 25 mg to 50 mg daily.\n\nDISCHARGE MEDICATIONS:\n- Metoprolol succinate 50 mg daily",
      "Hospital Discharge Summary"),
  ]);
  const unexplained = await processDocuments([
    await doc("a.txt", "2026-03-12", meds("- Metoprolol succinate 25 mg daily"), "Cardiology Consultation"),
    await doc("b.txt", "2026-04-02", "DISCHARGE MEDICATIONS:\n- Metoprolol succinate 50 mg daily", "Hospital Discharge Summary"),
  ]);
  const d = documented.conflicts.find((c) => c.type === "medication_dose")!;
  const u = unexplained.conflicts.find((c) => c.type === "medication_dose")!;
  assert.equal(d.pattern, "documented_change");
  assert.equal(d.contextFactIds.length, 1, "the change statement is attached as context");
  assert.equal(u.pattern, "unexplained");
  assert.equal(u.contextFactIds.length, 0);

  // A record that reverts to the old dose after a documented change is NOT explained by it.
  const stale = await processDocuments([
    await doc("a.txt", "2026-03-04", meds("- Lisinopril 10 mg daily")),
    await doc("b.txt", "2026-04-02", "HOSPITAL COURSE:\nLisinopril increased from 10 mg to 20 mg daily.\n\nDISCHARGE MEDICATIONS:\n- Lisinopril 20 mg daily", "Hospital Discharge Summary"),
    await doc("c.txt", "2026-04-15", meds("- Lisinopril 10 mg daily")),
  ]);
  const s = stale.conflicts.find((c) => c.type === "medication_dose")!;
  assert.equal(s.pattern, "partially_explained");
  const apr15 = stale.facts.find((f) => f.source.documentName === "c.txt" && f.category === "medication")!;
  const unexplainedNote = s.observations.find((o) => o.kind === "unexplained")!;
  assert.deepEqual(unexplainedNote.factIds, [apr15.id], "the note is linked to exactly the claim it does not explain");
  assert.match(unexplainedNote.text, /after the change to 20 mg documented on Apr 2/);
});

test("7. every extracted fact and every conflict keeps its source reference", async () => {
  const docs = [
    await doc("a.txt", "2026-03-04", `${meds("- Lisinopril 10 mg daily")}\n\nALLERGIES:\n- Penicillin (hives)`),
    await doc("b.txt", "2026-03-12", `${meds("- Lisinopril 20 mg daily")}\n\nALLERGIES:\n- NKDA`, "Cardiology Consultation"),
  ];
  const rs = await processDocuments(docs);
  assert.ok(rs.facts.length > 0);
  for (const f of rs.facts) {
    const d = docs.find((x) => x.id === f.source.documentId);
    assert.ok(d, `${f.id} points to a loaded document`);
    assert.ok(f.source.excerpt.trim().length > 0);
    assert.equal(d.text.slice(f.source.charStart, f.source.charEnd), f.source.excerpt, "excerpt is the exact source text at the stated offsets");
    assert.equal(f.source.documentName, d.fileName);
    assert.equal(f.source.provider, d.meta.provider);
    assert.equal(f.source.recordDate, d.meta.recordDate);
  }
  const ids = new Set(rs.facts.map((f) => f.id));
  for (const c of rs.conflicts) for (const id of [...c.factIds, ...c.contextFactIds]) assert.ok(ids.has(id), "conflicts reference existing facts, never new ones");
});

test("conflicts never add, remove, or modify facts", async () => {
  const docs = [
    await doc("a.txt", "2026-03-04", meds("- Lisinopril 10 mg daily")),
    await doc("b.txt", "2026-03-12", meds("- Lisinopril 20 mg daily")),
  ];
  const { extractWithRules } = await import("../lib/extract/rules");
  const raw = docs.flatMap(extractWithRules);
  const rs = await processDocuments(docs);
  assert.deepEqual(rs.facts, raw);
});

test("conditions: a record denying what another asserts is flagged; mutually exclusive diagnoses are flagged", async () => {
  const rs = await processDocuments([
    await doc("a.txt", "2026-01-15", "PROBLEM LIST:\n- Type 2 diabetes mellitus"),
    await doc("b.txt", "2026-03-12", "PAST MEDICAL HISTORY:\n- Prediabetes", "Cardiology Consultation"),
    await doc("c.txt", "2026-04-02", "DISCHARGE DIAGNOSES:\n- Atrial fibrillation (new diagnosis)", "Hospital Discharge Summary"),
    await doc("d.txt", "2026-04-15", "PAST MEDICAL HISTORY:\n- No history of atrial fibrillation"),
  ]);
  const titles = rs.conflicts.map((c) => c.title);
  assert.ok(titles.includes("Atrial fibrillation: recorded vs denied"));
  assert.ok(titles.includes("Type 2 diabetes mellitus vs prediabetes"));
  // Both diagnoses stay distinct facts with their own wording; the conflict only links them.
  const ex = rs.conflicts.find((c) => c.title === "Type 2 diabetes mellitus vs prediabetes")!;
  assert.deepEqual(ex.groups.map((g) => g.label), ["Type 2 diabetes mellitus", "Prediabetes"]);
  assert.ok(rs.facts.some((f) => f.normalizedLabel === "prediabetes" && f.source.excerpt === "Prediabetes"));
});

test("labs: same test and date with different values conflicts; different dates do not", async () => {
  const rs = await processDocuments([
    await doc("a.txt", "2026-01-16", "RESULTS:\n- LDL cholesterol 162 mg/dL (01/15/2026)\n- Hemoglobin A1c 7.4 % (01/15/2026)", "Laboratory Report"),
    await doc("b.txt", "2026-03-12", "RECENT LABS:\n- LDL cholesterol 126 mg/dL (01/15/2026)", "Cardiology Consultation"),
    await doc("c.txt", "2026-04-10", "RESULTS:\n- Hemoglobin A1c 7.1 % (04/10/2026)", "Laboratory Report"),
  ]);
  assert.equal(rs.conflicts.length, 1);
  assert.equal(rs.conflicts[0].type, "lab_value");
  assert.match(rs.conflicts[0].title, /LDL cholesterol/);
});

test("demographics: differing dates of birth are flagged", async () => {
  const a = await doc("a.txt", "2026-01-15", "PLAN:\n- Return in 3 months.");
  const b = await doc("b.txt", "2026-03-12", "PLAN:\n- Return in 3 months.");
  const swap = (d: typeof a, dob: string) => ({ ...d, meta: { ...d.meta, dob }, text: d.text.replace("Patient: Test Patient (fictional)", `Patient: Test Patient (fictional)\nDOB: ${dob}`) });
  // Re-ingest so header offsets are recomputed from the edited text.
  const { ingestFile } = await import("../lib/ingest/readers");
  const enc = (d: typeof a) => new TextEncoder().encode(d.text);
  const rs = await processDocuments([
    await ingestFile("a.txt", enc(swap(a, "07/14/1968")), "upload"),
    await ingestFile("b.txt", enc(swap(b, "04/17/1968")), "upload"),
  ]);
  assert.equal(rs.conflicts.filter((c) => c.type === "demographic").length, 1);
});

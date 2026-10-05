/**
 * Focused checks for the redesign's logic changes:
 *   • documented changes are linked to the specific claims they do / don't explain
 *   • timeline wording only says "change" where a source documents one
 *   • one source chip per document, with every passage kept
 *   • a condition mentioned only in a denial is not presented as a diagnosis
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { processDocuments } from "../lib/pipeline";
import { byDocument, splitConditions, summarize } from "../lib/summaries";
import type { RecordSet } from "../lib/types";
import { demoRecordSet, doc } from "./helpers";

let cached: RecordSet | null = null;
const rsP = async () => (cached ??= await demoRecordSet());
const dateOf = (rs: RecordSet, id: string) => rs.facts.find((f) => f.id === id)!.source.recordDate;

test("demo: the documented lisinopril increase explains some claims and is linked to them", async () => {
  const rs = await rsP();
  const c = rs.conflicts.find((x) => x.title === "Lisinopril: 10 mg vs 20 mg")!;
  assert.equal(c.pattern, "partially_explained");

  const context = c.observations.find((o) => o.kind === "context")!;
  assert.equal(context.factIds.length, 1);
  assert.match(rs.facts.find((f) => f.id === context.factIds[0])!.source.excerpt, /increased from 10 mg to 20 mg/);

  const explained = c.observations.filter((o) => o.kind === "explained").flatMap((o) => o.factIds).map((id) => dateOf(rs, id)).sort();
  const unexplained = c.observations.filter((o) => o.kind === "unexplained").flatMap((o) => o.factIds).map((id) => dateOf(rs, id)).sort();
  assert.deepEqual(explained, ["2026-01-15", "2026-03-04", "2026-04-02", "2026-04-20"]);
  assert.deepEqual(unexplained, ["2026-03-12", "2026-04-15"], "20 mg before the increase and 10 mg after it stay unexplained");
});

test("demo: metoprolol stays a fully documented change, separate from unexplained discrepancies", async () => {
  const rs = await rsP();
  const c = rs.conflicts.find((x) => x.subject === "metoprolol succinate" && x.type === "medication_dose")!;
  assert.equal(c.pattern, "documented_change");
  assert.equal(c.observations.filter((o) => o.kind === "unexplained").length, 0);
  // Ordering keeps documented changes after the ones that still need explaining.
  assert.equal(rs.conflicts[rs.conflicts.length - 1].id, c.id);
});

test("no documented change → explanation says so and never claims a 'change'", async () => {
  const rs = await processDocuments([
    await doc("a.txt", "2026-03-04", "CURRENT MEDICATIONS:\n- Lisinopril 10 mg daily"),
    await doc("b.txt", "2026-03-12", "CURRENT MEDICATIONS:\n- Lisinopril 20 mg daily"),
  ]);
  const c = rs.conflicts[0];
  assert.equal(c.pattern, "unexplained");
  assert.equal(c.contextFactIds.length, 0);
  assert.ok(!rs.timeline.some((e) => /change/i.test(e.title)), "no timeline event invents a change");
});

test("timeline: change events exist only for passages that document a change, and say so", async () => {
  const rs = await rsP();
  const changes = rs.timeline.filter((e) => e.type === "medication_changed");
  assert.deepEqual(changes.map((e) => e.title).sort(), ["Lisinopril dose change documented", "Metoprolol succinate dose change documented"]);
  for (const e of changes) {
    const f = rs.facts.find((x) => x.id === e.factIds[0])!;
    assert.match(f.source.excerpt, /increased from \d+ mg to \d+ mg/, "linked to the passage establishing it");
  }
});

test("source chips: one per document, keeping every passage from that document", async () => {
  const rs = await rsP();
  const afib = summarize(rs, "condition").find((c) => c.key === "atrial fibrillation")!;
  const recorded = afib.facts.filter((f) => f.status !== "negated");
  assert.equal(recorded.length, 2, "discharge summary mentions it in two places");
  const groups = byDocument(recorded);
  assert.equal(groups.length, 1, "…but it gets one chip");
  assert.equal(groups[0].facts.length, 2, "…whose evidence keeps both passages");
});

test("conditions mentioned only in a denial are separated from recorded conditions", async () => {
  const rs = await rsP();
  const { recorded, deniedOnly } = splitConditions(rs);
  assert.deepEqual(deniedOnly.map((c) => c.key), ["chest pain"]);
  assert.ok(recorded.some((c) => c.key === "atrial fibrillation"), "recorded-and-denied stays with recorded (and is flagged)");
  assert.ok(!recorded.some((c) => c.key === "chest pain"));
  // Type 2 diabetes and prediabetes stay distinct rows, linked by one conflict.
  const t2 = recorded.find((c) => c.key === "type 2 diabetes mellitus")!;
  const pre = recorded.find((c) => c.key === "prediabetes")!;
  assert.ok(t2 && pre);
  assert.equal(t2.conflicts[0].id, pre.conflicts[0].id);
});

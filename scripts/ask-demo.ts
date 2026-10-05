/** Run example questions against the demo records: `npx tsx scripts/ask-demo.ts "question"`. */
import { demoRecordSet } from "../tests/helpers";
import { ask, EXAMPLE_QUESTIONS } from "../lib/query/ask";

(async () => {
  const rs = await demoRecordSet();
  const qs = process.argv.slice(2).length ? process.argv.slice(2) : [...EXAMPLE_QUESTIONS, "Should she stop taking lisinopril?", "What is her favorite color?"];
  for (const q of qs) {
    const a = ask(rs, q);
    console.log(`\nQ: ${q}\n[${a.kind}] ${a.summary}`);
    for (const s of a.statements) console.log(`  ${s.disagreement ? "⚠" : "•"} ${s.text}  [${s.citations.length} cite]`);
  }
})();

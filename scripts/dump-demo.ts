/**
 * Prints everything the pipeline extracts from the demo records. Useful when swapping in
 * the final synthetic dataset: `npm run dump`.
 */
import { demoRecordSet } from "../tests/helpers";

(async () => {
  const rs = await demoRecordSet();
  for (const d of rs.documents)
    console.log("DOC", d.fileName, "|", d.meta.documentType, d.meta.recordDate, "|", d.meta.provider, "|", d.meta.facility, d.ingestNotes.join(" "));
  console.log();
  for (const f of rs.facts)
    console.log(
      f.source.documentName.slice(0, 2), f.category.padEnd(15), f.status.padEnd(12), f.normalizedLabel.padEnd(30),
      String(f.value).padEnd(32), f.eventDate, "|", f.source.section,
    );
  console.log("\nfacts", rs.facts.length, "rejected", rs.rejected);
  for (const c of rs.conflicts) {
    console.log("\nCONFLICT", c.pattern, c.type, "—", c.title);
    c.groups.forEach((g) => console.log("   [", g.label, "]", g.factIds.length, "fact(s)"));
    c.observations.forEach((o) => console.log("    -", o));
  }
  console.log("\nTIMELINE");
  for (const e of rs.timeline) console.log(e.date, e.type.padEnd(24), e.title, "|", e.subtitle ?? "");
})();

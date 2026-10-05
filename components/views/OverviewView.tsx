"use client";

import { statusOf } from "@/lib/annotations";
import { formatDate } from "@/lib/normalize/values";
import { useRecords } from "../context";
import { ConflictPreview } from "../ConflictCard";
import { TimelineList } from "./TimelineView";
import { Card, Empty } from "../ui";
import { IconArrowRight, IconCheck, IconUnresolved } from "../icons";

/** Every number here is derived from the loaded records. */
export function OverviewView() {
  const { rs, annotations, go } = useRecords();
  const toReview = rs.conflicts.filter((c) => statusOf(annotations, c) === "unresolved");
  const dates = rs.documents.map((d) => d.meta.recordDate).filter(Boolean).sort() as string[];
  const facilities = new Set(rs.documents.map((d) => d.meta.facility)).size;
  const recent = [...rs.timeline].reverse().slice(0, 7);

  return (
    <>
      <h1 tabIndex={-1} className="sr-only">Overview</h1>
      <section aria-label="Next step" className={`card mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${toReview.length ? "border-brand-line bg-brand-soft/60" : ""}`}>
        <div className="flex items-start gap-3.5">
          <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toReview.length ? "bg-surface text-review" : "bg-subtle text-muted"}`}>
            {toReview.length ? <IconUnresolved size={22} /> : <IconCheck size={22} />}
          </span>
          <div>
            <p className="text-xl font-bold text-ink">
              {toReview.length ? `${toReview.length} conflict${toReview.length === 1 ? "" : "s"} to review` : "No conflicts waiting for review"}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {toReview.length
                ? "Sources disagree on these items. Compare the original passages and record your review — the app does not pick a winner."
                : rs.conflicts.length ? "Every detected conflict has a review status. You can revisit them at any time." : "No disagreements were detected between the loaded sources."}
            </p>
          </div>
        </div>
        {rs.conflicts.length > 0 && (
          <button type="button" className={`btn shrink-0 ${toReview.length ? "btn-primary" : ""}`} onClick={() => go("conflicts")}>
            Review conflicts <IconArrowRight size={16} />
          </button>
        )}
      </section>

      <dl className="mb-6 grid grid-cols-1 gap-x-8 gap-y-3 px-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Source documents</dt>
          <dd><button type="button" className="font-semibold text-ink hover:text-brand" onClick={() => go("sources")}>{rs.documents.length} from {facilities} fictional facilit{facilities === 1 ? "y" : "ies"}</button></dd>
        </div>
        <div>
          <dt className="text-muted">Extracted facts</dt>
          <dd className="font-semibold text-ink">{rs.facts.length} <span className="font-normal text-muted">— individual statements (a dose, a lab value, a diagnosis…), each linked to the sentence it came from</span></dd>
        </div>
        <div>
          <dt className="text-muted">Records span</dt>
          <dd><button type="button" className="font-semibold text-ink hover:text-brand" onClick={() => go("timeline")}>{dates.length ? `${formatDate(dates[0]).replace(/, \d{4}$/, "")} – ${formatDate(dates[dates.length - 1])}` : "No dated records"}</button></dd>
        </div>
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card id="ov-conflicts" title="Conflicts requiring review" action={rs.conflicts.length ? <button type="button" className="text-sm link" onClick={() => go("conflicts")}>All conflicts</button> : undefined}>
          {toReview.length ? (
            <ul className="divide-y divide-line">{toReview.slice(0, 5).map((c) => <ConflictPreview key={c.id} c={c} />)}</ul>
          ) : <Empty>Nothing waiting for review.</Empty>}
          {toReview.length > 5 && (
            <button type="button" className="mt-4 text-sm link" onClick={() => go("conflicts")}>{toReview.length - 5} more to review</button>
          )}
        </Card>

        <Card id="ov-activity" title="Recent record activity" action={<button type="button" className="text-sm link" onClick={() => go("timeline")}>Full timeline</button>}>
          {recent.length ? <TimelineList events={recent} compact /> : <Empty>No dated events.</Empty>}
        </Card>
      </div>
    </>
  );
}

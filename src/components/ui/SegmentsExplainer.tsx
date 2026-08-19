import { ExplainDrawer } from "@/components/ui/ExplainDrawer";
import { SEGMENT_COLOUR, SEGMENT_LABEL, count, segmentLadder } from "@/lib/metrics";

/**
 * "Explain segments". **OV-4 of the Build 5 review.**
 *
 * ── Where this used to live, and why it moved ──────────────────────────────
 *
 * The boundary rules sat at the foot of the segment grid, in a strip captioned
 * "Where the boundaries fall" with an info icon beside it. The review asked
 * either to move them above the table or to put them behind a button — and the
 * button wins. Above the table they are a definition nobody has needed yet,
 * read past on the way to the numbers. Behind a button in the panel header they
 * are there at the moment of doubt, which is the only moment anybody wants a
 * definition.
 *
 * ── One component, used on both pages ──────────────────────────────────────
 *
 * The same six buckets are the rows of the segment grid on Overview and the
 * rows of "What each segment actually buys" and "When each segment comes" on
 * Behaviour. Three panels, one definition. Written once here so a reader who
 * opens it on Behaviour gets the same words as a reader who opens it on
 * Overview — three copies of a definition is how two of them come to be wrong.
 *
 * ── The word stays "segments" ──────────────────────────────────────────────
 *
 * Not "cohorts", and the reason is on the page next door. A cohort in this
 * build is an intake month, and **people never leave the cohort they joined** —
 * that is what makes the retention triangle on Behaviour readable. These six
 * buckets are the opposite: people move between them every window, by design.
 * Calling both "cohorts" would collide on the one page where both appear. If
 * marketing needs a shared word, marketing aligns to "segments".
 */
export function SegmentsExplainer({
  lapsedDays, lapsedGuests,
}: {
  lapsedDays: number;
  lapsedGuests: number;
}) {
  const ladder = segmentLadder(lapsedDays);

  return (
    <ExplainDrawer
      label="Explain segments"
      title="The six lifecycle segments"
      triggerLabel="Explain segments"
      showing={
        <>
          <p>
            Six buckets, and every guest the build can classify sits in exactly one of them. They describe
            <strong> where a guest is in their life with this business</strong>, not how much they spend —
            a Regular with a small basket and an Established guest with a large one are in different rows
            for reasons that have nothing to do with money.
          </p>
          <p>
            <strong>People move between them every window.</strong> That is the difference between a
            segment and a cohort: the cohorts on Behaviour are intake months and nobody ever leaves the
            one they joined, whereas a Regular who stops coming becomes Slipping and then Lapsed.
          </p>
        </>
      }
      made={
        <>
          <p>
            <strong>Read top to bottom, first match wins.</strong>
          </p>
          <ol className="flex flex-col gap-1.5">
            {ladder.map((l, i) => (
              <li key={l.key} className="flex gap-2">
                <span className="tnum shrink-0 text-ink-muted">{i + 1}.</span>
                <span>
                  <strong style={{ color: SEGMENT_COLOUR[l.key] }}>{SEGMENT_LABEL[l.key]}</strong> —{" "}
                  {l.rule}
                </span>
              </li>
            ))}
          </ol>
          {/* The review flagged these definitions as "not mutually exclusive"
              and it is right that they overlap — but the overlap is the design,
              not a defect, and the ordering is what resolves it. Stating the
              exact collision is what stops a reader deriving a contradiction
              from two rules read out of order. */}
          <p>
            <strong>The rules overlap on purpose and the order settles it.</strong> At this merchant every
            one of the {count(lapsedGuests)} Lapsed people has exactly one visit, so read out of order they
            would be Seen once as well — and read against the three-visit minimum they would have no verdict
            at all. Rule 1 catches them first, because having stopped coming is the more important fact
            about somebody than how many times they came before they stopped.
          </p>
          <p>
            An inferred verdict needs <strong>three visits</strong>: with two you have exactly one gap, and
            a broken habit is not estimable from one observation. Slipping and Regulars are measured
            against <strong>each guest&apos;s own cadence</strong>, never a rule applied to everybody.
          </p>
          {/* This paragraph used to read "Only enrolled people are classified",
              which stopped being true when the classifier started running on
              both identity methods. A stale definition in a drawer is worse
              than one on the face, because nobody re-reads it. */}
          <p>
            Both identity methods carry a verdict now. On a guest recognised only by payment card,{" "}
            <strong>Lapsed and Slipping mean the card stopped appearing</strong> — a reissued card looks
            identical to somebody who stopped coming, so those two rows carry real false positives there.
            Regulars and Established do not: a reissue splits one person into two smaller ones, so it can
            only ever understate them.
          </p>
          {/* Moved off the face of the composition bars. Both sentences are
              drawing rules — how wide a band is, and what it is a share of —
              which is method by any reading, and they were a second paragraph
              under a chart that only needed the first. */}
          <p>
            <strong>The composition bars.</strong> Shares are of the same population as the grid and
            change with the same control. Bands are drawn to exact width with no minimum, so a segment
            worth a fraction of a percent renders as a hairline rather than being inflated to a readable
            one. Percentages label the bands wide enough to hold them; the rest are in the grid.
          </p>
        </>
      }
    />
  );
}

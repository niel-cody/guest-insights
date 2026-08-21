import Link from "next/link";
import { IconAlert, IconCheck } from "./Icons";
import type { Team } from "@/lib/types";

/**
 * What the per-person figures on this page were divided by.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * People Mapping used to be the first screen in Team, and it was placed there
 * so that nobody met the league table before they met the unproven matches
 * underneath it. That worked on one kind of reader: the one who arrives through
 * the nav and reads the section in order. **Most readers arrive through a link**
 * — a Slack message, a bookmark, a screenshot with a URL under it — and land on
 * Performance with no idea the queue exists.
 *
 * Adjacency was never the protection it looked like. This is, because it
 * travels: the chip is in the header of every report that divides POS trade by
 * rostered hours, it names the evidence those divisions rest on, and it links
 * to the queue where the evidence is worked.
 *
 * ── A proposal is amber, and that is the whole point ───────────────────────
 *
 * Twenty-four of Meat Flour Wine's thirty-six costed joins are proposals: one
 * employee at the venue carries this first name and nothing contradicts it. A
 * good bet, not a proof. `VERDICT_TONE` already refuses to colour those green
 * on the queue itself, and the same refusal has to survive the trip — a chip
 * reading "36 joins" in green would undo on every report the thing the queue
 * spends a screen establishing.
 *
 * So the chip leads with the proposals, not the total. The number a reader
 * needs is not how many joins exist, it is how many of the ones being divided
 * by are guesses.
 */
export function SpineChip({
  team, orgSlug, period,
}: {
  team: Team;
  orgSlug: string;
  period: string;
}) {
  // Nothing to qualify on an organisation with no workforce system: those pages
  // render the Unavailable screen, which is a longer version of this sentence.
  if (!team.available) return null;

  const c = team.integrity.counts;
  // The two verdicts the section is willing to cost. Everything else — conflict,
  // collision, unmatched — is excluded upstream and divides nothing, so counting
  // it here would inflate the denominator with rows that carry no figures.
  const costed = c.confirmed + c.proposed;
  if (costed === 0) return null;

  const proven = c.proposed === 0;
  const tone = proven ? "var(--good)" : "var(--warning)";

  return (
    <Link
      href={`/${orgSlug}/${period}/admin/people-mapping`}
      data-spine-chip=""
      title={
        proven
          ? "Every costed join is confirmed on more than a first name."
          : `${c.proposed} of ${costed} costed joins are first-name proposals. Open the queue to work them.`
      }
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
      style={{ borderColor: tone, color: tone }}
    >
      {proven ? (
        <IconCheck className="h-3.5 w-3.5" />
      ) : (
        <IconAlert className="h-3.5 w-3.5" />
      )}
      {proven
        ? `${costed} joins confirmed`
        : `${c.proposed} of ${costed} joins proposed`}
    </Link>
  );
}

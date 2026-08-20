import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Tile } from "@/components/ui/Primitives";
import { IconArrow } from "@/components/shell/Icons";
import { SegmentComposition } from "@/components/charts/SegmentCharts";
import { SegmentGrid, type PreviousPeriod } from "@/components/ui/SegmentGrid";
import { SelectionCorrection, ValuePanels } from "@/components/charts/ValuePanels";
import { Disclosure } from "@/components/ui/Disclosure";
import { ExplainDrawer } from "@/components/ui/ExplainDrawer";
import { Standfirst } from "@/components/shell/Standfirst";
import { SegmentsExplainer } from "@/components/ui/SegmentsExplainer";
import { GrowthView } from "@/components/charts/GrowthView";
import { IDENTITY_LABEL, TIER_LABEL } from "@/lib/lexicon";
import { getPeriods, getGuestRows, getSnapshot } from "@/lib/data";
import { previousReadable } from "@/lib/periods";
import { runChecks } from "@/lib/checks";
import {
  attributionPct, causalReading, count, coverageState,
  decompose, delta, excludedSingleVisitCards, money, monthLabel, opportunityPerVenueWeek, pct,
  priceMix, ratio,
  rollUpSegments, tileCount, valueClaims, visitBands, windowShort,
} from "@/lib/metrics";

export const dynamic = "force-static";

/** Named per page: the tab and every screenshot used to read "Guests". */
export const metadata = { title: "Overview" };

/**
 * Take-up rates the opportunity band is re-scaled to on the face.
 *
 * The band is the full confidence interval applied to the full trade of every
 * candidate, which arithmetically assumes **100% take-up** — every one of them
 * enrols. No enrolment campaign has ever done that, and the first finance
 * director to work it out in the meeting costs more credibility than stating it
 * costs.
 *
 * These are illustrations, not a forecast. No take-up rate has been measured at
 * this merchant, so none is assumed; the headline stays the ceiling and these
 * show what the ceiling is a ceiling over.
 */
const TAKE_UP_ILLUSTRATION = [0.1, 0.2] as const;

/**
 * The grid's row shape, from a roll-up.
 *
 * Written once rather than three times: the same mapping now runs for members,
 * for cards and for both together, and three copies of it is how the tiers come
 * to disagree about what a row is.
 */
function toRows(rows: { segment: string; label: string; guests: number; visits: number; spend: number }[]) {
  return rows.map((s) => ({
    segment: s.segment, label: s.label, guests: s.guests, visits: s.visits, spend: s.spend,
  }));
}

/**
 * Overview. §5.
 *
 * The order of the blocks is the argument, and it is deliberate top to bottom:
 * how many people you can actually see, what that population is made of, what a
 * member is worth, **what of that is caused by enrolling rather than merely
 * associated with it**, what the remaining opportunity is worth, and finally
 * what the whole thing is standing on.
 *
 * The one structural rule that governs this file: **the 4.9× never appears
 * without its correction on the same screen.** It is the number every
 * stakeholder wants, roughly 97% of it is selection rather than effect, and a
 * page that leads with it and buries the correction is worse than not shipping
 * the section. That is enforced twice — the tile in §5.2 refuses to render if
 * the §5.5 block cannot, and a layout test asserts the two share a viewport at
 * 1280px and 1920px.
 */
export default async function OverviewPage({
  params, searchParams,
}: {
  params: Promise<{ org: string; period: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org: slug, period } = await params;
  void (await searchParams);

  const snap = await getSnapshot(slug, period);
  const guests = await getGuestRows(slug, period);
  const periods = await getPeriods(slug);
  const current = periods.periods.find((p) => p.id === period)!;

  const { org, coverage, segments, members, decomposition } = snap;
  const cov = coverageState(org, coverage);
  const checks = runChecks(snap, guests);
  const w = org.window;
  const win = windowShort(w);

  const cs = members.crossSection;
  const identifiedPeople = cs.member.people + cs.nonMember.people;
  const memberLift = cs.lifts.spendPerPerson;
  const claims = valueClaims(members, org);
  const causal = causalReading(members);

  // Members only — a lifecycle verdict on a card is a claim we cannot support,
  // so the table is enrolled people and says so rather than quietly excluding.
  const stands = rollUpSegments(segments, "member");

  /**
   * The previous comparable period, where one exists.
   *
   * **Not the previous quarter.** `periods` holds one entry per unbroken run of
   * trustworthy card months, newest first, and those runs are not adjacent — the
   * months between them failed card capture and are not in the snapshot at all.
   * So this is the previous *readable* period, the gap is measured, and both
   * travel with the data into the grid so the column cannot be read as
   * quarter-on-quarter movement. Meat Flour Wine has one period and gets null,
   * which is why the comparison columns are absent there rather than empty.
   */
  const prevRun = previousReadable(periods, period);
  const previous: PreviousPeriod | null = prevRun
    ? {
        label: prevRun.label,
        gapMonths: prevRun.gapMonths,
        rows: rollUpSegments((await getSnapshot(slug, prevRun.period.id)).segments, "member"),
      }
    : null;

  const opp = members.opportunity;
  const perVenueWeek = opportunityPerVenueWeek(opp, org);

  const first = decomposition[0];
  const last = decomposition.at(-1);
  /**
   * The price/mix split runs before the decomposition because it changes what
   * the decomposition's fourth bar *is*: where it publishes, "average item
   * price" becomes a price bar and a mix bar, and the mix half is reclassified
   * as real trade. Where it refuses, it hands back the sentence saying why and
   * the four-bar version stands unchanged.
   */
  const split = first && last ? priceMix(snap.itemPrices, snap.items, first, last) : null;
  const growth = first && last && first !== last ? decompose(first, last, split) : null;

  return (
    <>
      <PageHeader
        org={org}
        periods={periods}
        period={current}
        title="Overview"
        coverage={cov}
        checks={checks}
      />
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
          {/* ── the question, and the answer in two sentences ────────────────
              This replaces a panel that carried the same sentence four scrolls
              lower, under an "About this" button, with nothing above it saying
              what the page was for. A reader met four KPI tiles cold and had to
              infer the argument from them.

              **The pitch is not decoration and it is not a summary.** It is the
              one comparison the whole build exists to make — what this report
              can put a name to, against what a loyalty CRM would have shown —
              and it is the sentence a merchant repeats back to you. It has been
              through two council sittings and was refused for cutting on 17
              August; it has not been cut, it has been moved to the top where it
              answers the question rather than restating it. */}
          <Standfirst
            question="How much of your trade can you put a name to — and are members worth more?"
            body={
              <>
                Over {win} you served {money(coverage.totals.revenue)} across{" "}
                {count(coverage.totals.orders)} orders, and this report can put{" "}
                <strong className="text-ink">{attributionPct(cov.identifiedRevenueShare)}</strong> of that
                revenue against {count(tileCount(identifiedPeople))} people you could recognise again —
                where a loyalty CRM, which only sees a scan, would show{" "}
                <strong className="text-ink">{attributionPct(cov.scannedRevenueShare)}</strong>.{" "}
                {causal.causal ? (
                  <>
                    On the second question the answer is <strong className="text-ink">yes</strong>: an
                    enrolled person is associated with {ratio(memberLift)} the spend, of which{" "}
                    {pct(causal.selectionShare ?? 0, 0)} was already there before they enrolled.
                  </>
                ) : (
                  <>
                    On the second question the answer is{" "}
                    <strong className="text-ink">not proven here</strong> — the gap this window shows
                    cannot be separated from the fact that the people who enrol were already your best
                    guests.
                  </>
                )}
              </>
            }
          />

          {/* ── §5.2 four tiles ──────────────────────────────────────────────
              Four lines and a button, in the same order on every tile: what it
              is, the figure, the one supporting figure, then tier and window.
              The method sits behind the button.

              **This reverses §8 rule 7**, which removed every info icon in the
              build after the prototype shipped four that rendered nothing at
              all. The reversal is conditional and the conditions are enforced in
              `InfoButton` rather than remembered: it is a real button so it
              works on touch and by keyboard, and its content is required so it
              cannot render empty. What has *not* moved is the grain, the window
              and the denominator — those are part of the figure, not an
              explanation of it, and a build whose contract is that every figure
              carries them cannot put them behind a click. */}
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Guests you can recognise"
              value={count(tileCount(identifiedPeople))}
              accent="var(--tier-card)"
              detail={
                <>
                  {count(tileCount(cs.member.people))} enrolled ·{" "}
                  {count(tileCount(cs.nonMember.people))} never enrolled
                </>
              }
              meta={<>Person grain · {win}</>}
              info={
                <>
                  <p>
                    Everybody identified by their <strong className="text-ink">payment card</strong> — the
                    one they paid with, not a loyalty card — whether or not they ever scanned. A card seen
                    on a scanned order belongs to that member on every other order it appears on, so a
                    member who forgets to scan is still the same person.
                  </p>
                  <p className="mt-1.5">
                    <strong className="text-ink">{IDENTITY_LABEL.card}</strong> is the method here.{" "}
                    <strong className="text-ink">{TIER_LABEL.card}</strong> is the population it finds and
                    the loyalty programme never did.
                  </p>
                  <p className="mt-1.5">
                    That inversion is why this figure is {count(tileCount(identifiedPeople))} rather than the{" "}
                    {count(tileCount(cs.member.people))} a loyalty CRM would show. It is person grain, not
                    customers served — how many people you served is unknowable.
                  </p>
                  <p className="mt-1.5">
                    Cost, published rather than hidden: a card shared between two members is attributed to
                    whichever used it more.
                  </p>
                </>
              }
            />
            <Tile
              label="Revenue you can attribute"
              value={attributionPct(cov.identifiedRevenueShare)}
              accent="var(--accent)"
              detail={
                <>
                  {attributionPct(cov.scannedRevenueShare)} scanned ·{" "}
                  {attributionPct(cov.identifiedRevenueShare - cov.scannedRevenueShare)} added by the card
                </>
              }
              meta={<>Revenue grain · {win} · of {money(coverage.totals.revenue)}</>}
              info={
                <>
                  <p>
                    The share of completed trade this build can put against a person.{" "}
                    <strong className="text-ink">Revenue grain</strong> is the primary coverage measure
                    because it is the one that says how much of the business the report describes; guest-grain
                    coverage is never computed, because there is no honest denominator for it.
                  </p>
                  <p className="mt-1.5">
                    The split matters more than the total. The scanned half is what a loyalty CRM sees. The
                    rest is what the card adds, and it is the argument for building on the card rather than on
                    the scan.
                  </p>
                </>
              }
            />
            {/* The hard rule in §5.2, enforced rather than remembered: this tile
                does not exist unless the correction below it does. */}
            {causal.causal ? (
              /* ── "is associated with", not "is worth" ────────────────────
                 The card was arguing with its own page: two scrolls down it
                 says 97% of this is selection and that you may not use it to
                 justify the programme. A screenshot of a KPI card travels
                 without its caption, and this one ends up in a board deck.

                 Leading with +11.1% instead was considered and rejected — a
                 6.5×-wide interval reads to a finance director as "we do not
                 know". Replacing the number with the trade at stake was also
                 rejected: it swaps one caveat-free screenshot-able number for a
                 larger one. Changing the verb is the smallest edit that stops
                 the card asserting causation, and it survives the screenshot. */
              <Tile
                label="A member is associated with"
                value={memberLift >= 1 ? ratio(memberLift) : delta(memberLift)}
                accent="var(--tier-member)"
                detail={
                  <>
                    {money(cs.member.spendPerPerson)} against {money(cs.nonMember.spendPerPerson)}
                  </>
                }
                meta={<>Person grain · {win}</>}
                info={
                  <>
                    <p>
                      Spend per enrolled person over the window, against spend per card-only person over the
                      same window. Both columns are the same grain — people identified by card — which is the
                      change that made this comparison expressible at all.
                    </p>
                    <p className="mt-1.5">
                      The verb is <strong className="text-ink">&quot;is associated with&quot;</strong> and not
                      &quot;is worth&quot; on purpose. A screenshot of a KPI card travels without its caption,
                      and this one ends up in a board deck.
                    </p>
                    {/* OV-1's compromise, and the half of it that moves. The
                        *size* of the selection share is method — it is the
                        output of the within-person design two blocks down. The
                        *fact* that this is association rather than effect is
                        not, and stays on the face below. */}
                    <p className="mt-1.5">
                      <strong className="text-ink">{pct(causal.selectionShare ?? 0, 0)} of this gap was
                      already there before anybody enrolled.</strong> The people who enrol were coming back
                      anyway; the within-person estimate below separates the two and is the only figure that
                      may be used to justify the programme.
                    </p>
                  </>
                }
                /* The caveat stays on the face. It is not method, and it is the
                   one sentence that stops this figure being misused. */
                /* Shortened to the sentence that does the work, so the four
                   tiles read as one row rather than one tile explaining itself
                   beside three that do not. What could not go is the claim
                   itself: it changes how 4.9× must be read, it took two council
                   sittings to get here, and a tile that loses it starts
                   asserting causation the moment somebody screenshots it. */
                footnote={
                  <span className="text-ink-muted">Association, not effect — see below.</span>
                }
              />
            ) : (
              /* ── The refused variant, and it is the same card ──────────────
                 It used to be a different shape entirely: a different label, no
                 button, and a five-line footnote where the other three tiles
                 have one. Switching organisation therefore changed the *design*
                 of the row and not only its figures, and the merchant whose
                 answer is "not proven" got a wall of text explaining itself
                 beside three tiles that did not.

                 Same label, same button, same one-line footnote. What differs
                 is the only thing that should: the figure is withheld, and the
                 reason is a click away rather than a paragraph. */
              <Tile
                label="A member is associated with"
                value={memberLift >= 1 ? ratio(memberLift) : delta(memberLift)}
                accent="var(--warning)"
                refused
                detail={
                  <>
                    {money(cs.member.spendPerPerson)} against {money(cs.nonMember.spendPerPerson)}
                  </>
                }
                meta={<>Person grain · {win}</>}
                info={
                  <>
                    <p>
                      Spend per enrolled person over the window, against spend per card-only person over
                      the same window. Both columns are the same grain — people identified by card.
                    </p>
                    <p className="mt-1.5">
                      <strong className="text-ink">The gap is shown quietly rather than as an answer.</strong>{" "}
                      Nothing in this window separates it from selection: the within-person estimate needs
                      more people who enrolled mid-window than this merchant has, so there is no way to tell
                      how much of the difference enrolling <em>caused</em> and how much was already there.
                    </p>
                    <p className="mt-1.5">
                      A gap that cannot be separated from selection is not a measure of what a member is
                      worth, and publishing it as one is how a loyalty programme gets justified by the
                      behaviour of the people who were always going to join it.
                    </p>
                  </>
                }
                footnote={
                  <span className="text-ink-muted">
                    Not separable from selection here — see below.
                  </span>
                }
              />
            )}
            {/* The denominator was doing real damage unstated. This rate is
                over the member orders the card bridge resolved (52,844), not
                over every member order on the page (62,107) — the same numerator
                against the latter reads 23.2%, and a reader had no way to know
                which they were looking at. Both are now on the face.

                "Fixable at the till" has gone. It is head office telling the
                floor whose fault it is, on a card an area manager sees. */}
            {/* The window comes off this one. It is the only tile of the four
                whose figure is a *rate* rather than a level, and a rate over the
                window reads as though it were accumulating — where what it
                actually describes is a property of the till, constant across the
                period. The denominator stays, because the denominator was doing
                real damage unstated: this rate is over the member orders the
                card bridge resolved, and the same numerator over every member
                order on the page is a different and smaller number. The second
                denominator is in the button. */}
            <Tile
              label="Members not recognised"
              value={pct(opp.unscanned.share, 0)}
              accent="var(--warning)"
              detail={
                <>
                  {count(opp.unscanned.orders)} orders · {money(opp.unscanned.revenue)}
                </>
              }
              meta={
                <>
                  Order grain · of {count(opp.unscanned.orders + members.linkage.scannedOrders)} bridged
                  member orders
                </>
              }
              info={
                <>
                  <p>
                    Orders placed by somebody this build knows is a member, on which{" "}
                    <strong className="text-ink">nobody scanned</strong>. The card identified them; the
                    loyalty programme did not. This is the size of the recognition gap, and it is only
                    measurable at all because membership is resolved through the card.
                  </p>
                  <p className="mt-1.5">
                    Against every member order on this page rather than only the bridged ones it is{" "}
                    {pct(opp.unscanned.orders / Math.max(coverage.totals.memberOrders, 1), 1)} of{" "}
                    {count(coverage.totals.memberOrders)}. Both denominators are real and they answer
                    different questions, so neither is presented alone.
                  </p>
                  <p className="mt-1.5">
                    It is <strong className="text-ink">not a scorecard for the floor.</strong> A shift that
                    never asks and a shift whose guests decline look identical here.
                  </p>
                </>
              }
            />
          </div>

          {/* ── §5.4 where your members stand ────────────────────────────────
              A grid and one chart, stacked, doing two different jobs. The grid
              answers *who is in each segment and what are they worth* — exact
              values, drill-through, columns the reader chooses. The chart
              answers the question the grid cannot: *how does each segment's
              importance change as you move from people, to behaviour, to
              money?* Neither duplicates the other, which is the test a second
              visual on the same data has to pass. */}
          {/* The heading and the population sentence moved apart, and had to.
              The heading is tier-neutral because the tier is now a control; the
              sentence beneath it is rendered by the grid, where it can change
              with the tier. Left as it was, a static "4,966 enrolled people" sat
              directly above a grid showing 19,940 cards — the caption
              contradicting the table it captions, which is the class of defect
              this build was rebuilt to remove. */}
          {/* OV-4. "Explain segments" is the first instance of the Task 0
              pattern, on the panel that needed it most — the boundary rules
              used to sit at the foot of the table, below the thing they define.
              The word stays "segments" and not "cohorts": a cohort on Behaviour
              is an intake month nobody ever leaves, and these six buckets are
              the opposite by design. See `SegmentsExplainer`. */}
          <Card
            title="Where your guests stand"
            explain={
              <SegmentsExplainer
                lapsedDays={org.calibration.lapsedDays}
                lapsedGuests={stands.find((s) => s.segment === "lapsed")?.guests ?? 0}
              />
            }
          >
            <div className="flex flex-col gap-7">
              <SegmentGrid
                lifecycleRows={{
                  member: toRows(stands),
                  card: toRows(rollUpSegments(segments, "card")),
                  all: toRows(rollUpSegments(segments)),
                }}
                orgSlug={org.slug}
                period={period}
                previous={previous}
                visitRows={{
                  member: visitBands(members, "member"),
                  card: visitBands(members, "card"),
                  all: visitBands(members, "all"),
                }}
                excludedCards={excludedSingleVisitCards(members)}
              />

              {/* Same three roll-ups the grid gets, so both objects in this
                  card answer to the one control in the filter bar. */}
              <SegmentComposition
                rowsByTier={{
                  member: toRows(stands),
                  card: toRows(rollUpSegments(segments, "card")),
                  all: toRows(rollUpSegments(segments)),
                }}
                windowLabel={win}
              />
            </div>
          </Card>

          {/* ── §5.5 are your members worth more? ────────────────────────────
              The six panels and the correction are one card and one scroll
              position on purpose. See SelectionCorrection. */}
          <Card
            title="Are your members worth more?"
            subtitle="The same question, six ways — and they disagree. The disagreement is the finding."
          >
            {/* ── OV-5: the verdict the six panels support ──────────────────
                The review rates this the strongest artefact in the build and
                calls the UI wrong, and the specific wrong is that six panels of
                unequal importance are given equal weight — so a reader scanning
                them takes away whichever number is largest.

                The fix is not to re-rank the panels. They are deliberately
                equal, because "these six answers disagree" is the finding and
                demoting the two that disagree would be answering the question
                the block exists to refuse to answer. What was missing is the
                **conclusion** the six support, stated once, above them.

                The other half of OV-5 — value labels on the two panels the log
                scale flattens — is already in `ValuePanels`, added when the
                scale was found to be erasing 0.93× and 1.04× against the
                reference line. Both are needed: the labels stop a near-null
                reading as nothing, and this line stops six equal panels reading
                as no answer at all. */}
            <div className="mb-4 rounded-lg border border-line bg-surface-sunken px-4 py-3">
              <p className="max-w-[95ch] text-[14px] leading-relaxed text-ink">
                <strong>
                  Yes per person, and no per visit — and the six panels below are how you tell.
                </strong>{" "}
                An enrolled person is worth {ratio(memberLift)} a non-enrolled one over {win}, and{" "}
                <strong>almost none of that is a bigger basket</strong>: they return{" "}
                {cs.member.avgVisits.toFixed(1)} times against {cs.nonMember.avgVisits.toFixed(1)}, while
                spending {delta(cs.lifts.spendPerVisit)} per visit. Frequency is the whole of the gap.
              </p>
              <p className="mt-1.5 max-w-[95ch] text-[12px] leading-relaxed text-ink-secondary">
                Two of the six panels say members are no better, and they are correct on their own
                denominators. That is why all six are shown at equal weight rather than the flattering one
                being promoted — and why the correction beneath them, not the {ratio(memberLift)}, is the
                figure that may be used to justify the programme.
              </p>
            </div>

            <ValuePanels claims={claims} />

            <div className="mt-5">
              <h3 className="text-[14px] font-semibold text-ink">
                How much of that gap is caused by enrolling?
              </h3>
              <p className="mt-1 mb-3 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                Both figures below are real and they answer different questions. The observed gap sizes the
                base you already have. The within-person figure is what signing somebody up is worth, and{" "}
                <strong className="text-ink">it is the only one you may use to justify the programme</strong>.
              </p>
              <SelectionCorrection
                association={memberLift}
                causal={causal.causal}
                selectionShare={causal.selectionShare}
                n={causal.causal?.n ?? 0}
                refusal={causal.refusal}
              />
              <p className="mt-3 max-w-[95ch] text-[12px] leading-relaxed text-ink-muted">
                <strong className="text-ink-secondary">Row one is also the answer to Loyalty Spend.</strong>{" "}
                That report leads with members spending less per order, and per order it is correct. It is a
                frequency effect, not a basket effect: members return{" "}
                {cs.member.avgVisits.toFixed(1)} times against {cs.nonMember.avgVisits.toFixed(1)} over the
                same {w.days} days. We explain it here and we do not change their screen.
              </p>
            </div>
          </Card>

          {/* ── §5.6 the opportunity, reduced (OV-6) ─────────────────────────
              Kept, and cut to about a third. It was the most caveat-heavy block
              on the page and it is the only one that turns the whole thesis
              into a number a merchant would act on — the CRO and the CFO both
              named it as the reason the analysis is worth funding. Cutting it
              leaves a report that explains itself beautifully and asks for
              nothing.

              **What stays on the face:** the population, the trade at stake,
              "this is trade at stake, not uplift", the per venue per week line,
              and the link to the actual people.

              **What moves into the drawer: the entire uplift band, with its
              confidence interval and its take-up working attached.** That is
              deliberate and it is the only shape that satisfies both the review
              and the stay-or-move rule. A confidence interval may never be
              filed away while its point estimate stays on the face — so the
              estimate goes in with it, rather than being stranded out here
              looking more certain than it is. The face loses a seven-figure
              number and keeps every number a merchant can act on. */}
          <Card
            title="The opportunity"
            subtitle={`Guests recognised by payment card, seen more than once, never enrolled. ${win}.`}
            explain={
              <ExplainDrawer
                label="What enrolling these guests would be worth"
                title="What enrolling them would be worth"
                triggerLabel="What it could be worth"
                showing={
                  opp.uplift ? (
                    <>
                      <p>
                        <strong className="tnum text-[17px]">
                          {money(opp.uplift.valueLo)} – {money(opp.uplift.valueHi)}
                        </strong>{" "}
                        a quarter, <strong>if every one of them enrolled</strong>.
                      </p>
                      <p>
                        A range and never a point estimate: the interval on the underlying lift runs{" "}
                        {delta(opp.uplift.lo, 1)} to {delta(opp.uplift.hi, 1)} around{" "}
                        {delta(opp.uplift.lift, 1)}, and a single number off that spread is false precision
                        dressed as a forecast.
                      </p>
                      <p>
                        <strong>
                          That figure assumes every one of the {count(opp.candidates.people)} enrols.
                        </strong>{" "}
                        At a take-up of{" "}
                        {TAKE_UP_ILLUSTRATION.map((t) => `${Math.round(t * 100)}%`).join(" and ")} it is{" "}
                        {TAKE_UP_ILLUSTRATION.map(
                          (t) => `${money(opp.uplift!.valueLo * t)}–${money(opp.uplift!.valueHi * t)}`,
                        ).join(" and ")}{" "}
                        respectively. No take-up rate is assumed, because none has been measured at this
                        merchant — the figure above is the ceiling, not the forecast.
                      </p>
                    </>
                  ) : (
                    <p>
                      <strong>Sized, but not valued.</strong> The population is real and countable. What
                      enrolling them would be worth is not, because the within-person estimate could not be
                      made in this window. The list is still the right list to work; the number attached to
                      it would be invented.
                    </p>
                  )
                }
                made={
                  <>
                    <p>
                      The population is every guest recognised by payment card with{" "}
                      <strong>two or more visits</strong> who has never scanned. One sighting is a
                      transaction, not a customer, and there is no cadence to place it against.
                    </p>
                    <p>
                      Any value is sized on the <strong>within-person</strong> uplift — the same guests
                      compared against themselves before and after their first scan — and never on the
                      observed gap. The observed gap would put this roughly twenty times higher and every
                      dollar of it would be selection rather than effect.
                    </p>
                    <p>
                      The two quantities on the face are different and are labelled as such:{" "}
                      <strong>trade at stake</strong> is the money these guests already bring, which
                      enrolling would put on a name; <strong>uplift</strong> is the additional spend
                      enrolling would cause. Adding them together would double-count.
                    </p>
                  </>
                }
              />
            }
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
              <Tile
                label="People"
                value={count(tileCount(opp.candidates.people))}
                accent="var(--tier-card)"
                footnote={
                  <>
                    two or more visits, never enrolled
                    <span className="mt-1 block text-ink-muted">{IDENTITY_LABEL.card} · {win}</span>
                  </>
                }
              />
              {/* "62% of non-member spend" was true only against *attributed*
                  non-member spend. Against every non-member dollar the business
                  took it is 48%. Both denominators are named, because a share
                  without its denominator is the thing this build exists not to
                  publish. */}
              <Tile
                label="Their trade in the window"
                value={money(opp.candidates.spend)}
                accent="var(--accent)"
                footnote={
                  <>
                    {pct(opp.candidates.spend / Math.max(cs.nonMember.spend, 1), 0)} of{" "}
                    <em>attributed</em> non-member spend ·{" "}
                    {pct(opp.candidates.spend / Math.max(coverage.totals.revenue - coverage.totals.memberRevenue, 1), 0)}{" "}
                    of all non-member trade
                    <span className="mt-1 block text-ink-muted">
                      This is trade at stake, not uplift
                    </span>
                  </>
                }
              />

              {/* Nobody can act on a seven-figure lottery number. A venue
                  manager can act on a weekly one for their own site — which is
                  why this line stays on the face while the estate-wide band
                  moves into the drawer. */}
              <div className="rounded-lg border border-line px-4 py-3.5">
                <p className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
                  Per venue, per week
                </p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span>
                    <span className="tnum text-[22px] font-semibold text-ink">
                      {money(perVenueWeek.trade)}
                    </span>
                    <span className="ml-2 text-[12px] text-ink-secondary">of trade at stake</span>
                  </span>
                  {opp.uplift && (
                    <span>
                      <span className="tnum text-[18px] font-semibold text-ink">
                        {money(perVenueWeek.upliftLo)} – {money(perVenueWeek.upliftHi)}
                      </span>
                      <span className="ml-2 text-[12px] text-ink-secondary">of uplift</span>
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">
                  Across {org.venues.length} venues and {perVenueWeek.weeks} weeks. Two different
                  quantities: the first is trade these guests already bring, the second is spend enrolling
                  would cause.
                </p>
              </div>
            </div>

            {!opp.uplift && (
              <div className="mt-4">
                <EmptyState
                  tone="warning"
                  title="Sized, but not valued"
                  body="The population is real and countable. What enrolling them would be worth is not, because the within-person estimate could not be made in this window. The list is still the right list to work; the number attached to it would be invented."
                />
              </div>
            )}

            <Link
              href={`/${org.slug}/${period}/guests?tier=card&minVisits=2`}
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
            >
              Open these {count(opp.candidates.people)} guests <IconArrow className="h-3.5 w-3.5" />
            </Link>
          </Card>

          {/* ── §5.7 the trust panel has gone from this page ──────────────────
              "What this report is standing on" was a full-width panel of method
              — the checks, the card capture month by month, the claim and its
              price — sitting between the opportunity and the two findings below
              it. It is the most rigorous thing in the build and it was in the
              wrong place: an operator opening Overview is answering *what is
              happening to my customers*, and a page that interrupts that with a
              diagnostics report teaches them to scroll past the middle of it,
              which is where the two most useful sections now sit.

              **The rigour is not gone, and none of it was load-bearing here.**
              The check badge is in the page header on every screen and links to
              the evidence. Every refusal on this page still states itself in
              place. The coverage chip still carries the window. What has gone is
              the second, longer telling of all three in the middle of the page.

              The disclosures below take its place, and they are **open by
              default** now rather than folded: they carry findings — where the
              revenue moved, and what the two groups actually buy — and a finding
              behind a click is a finding nobody reads. `Disclosure` still keeps
              its result line visible when closed, so the contract is unchanged;
              what has changed is which way it starts. */}

          {/* ── §5.8 the two findings, open ──────────────────────────────────
              **Caveats never collapse** — everything above this point stays
              open, and there is no simple/advanced toggle anywhere. What folds
              here is the working: the decomposition table and the basket index,
              not the conclusions they support. */}
          {/* ── OV-9 reversed: the basket block comes off this page ─────────
              It was moved *up* here on the argument that "members buy Breakfast
              Sweet at 1.37× the rate everybody else does" is the most
              immediately actionable line on Overview. That argument holds at one
              organisation and not at the other, which is the problem.

              The index needs {minLinesForIndex} product lines on each side
              before it will publish. At Coffee Guru 29 of 62 reporting groups
              clear it; at Meat Flour Wine 6 of 46 do. So the same panel is a
              finding at one merchant and forty rows of withheld index at the
              other — and a reader meeting the second version reasonably
              concludes the report is broken rather than that their menu is
              long and their sample is short.

              It is a basket question rather than an overview question, and it
              belongs on a surface about what people buy. Removed here rather
              than conditioned on which merchant is loaded, because a page whose
              sections appear and disappear per organisation cannot be reviewed
              or screenshotted consistently. */}

          {/* ── §5.8 where the change came from ──────────────────────────────
              **Caveats never collapse** — everything above this point stays
              open, and there is no simple/advanced toggle anywhere. What folds
              here is the working: the decomposition itself, not the conclusion
              it supports.

              Two views now (OV-8): what moved the quarter, and how the four
              factors have moved over the months inside the window. See
              `GrowthView` and `FactorTrend`. */}
          {growth && (
            <Disclosure
              defaultOpen
              summary="Where the change came from"
              result={
                <>
                  Revenue moved{" "}
                  <strong style={{ color: growth.revenueChange >= 0 ? "var(--good)" : "var(--loss)" }}>
                    {growth.revenueChange >= 0 ? "+" : "−"}{money(Math.abs(growth.revenueChange))}
                  </strong>{" "}
                  between {monthLabel(growth.from.month)} and {monthLabel(growth.to.month)}, and{" "}
                  {Math.abs(growth.real) > Math.abs(growth.price) ? "most of it is real trade" : "most of it is price"}.
                </>
              }
            >
              {/* ── OV-7, the question I asked, and the answer ───────────────
                  "Are we saying a product is now sold for a higher price than
                  it was before?" For a long time the honest answer was **no,
                  and the panel used to imply otherwise** — revenue over items
                  moves when a price goes up and moves identically when the mix
                  shifts toward pricier items, so a guest buying a large flat
                  white instead of a small one registered as a price rise.

                  OV-7 renamed the factor to what it measured and named the
                  split as the next step. This is that step: `itemPriceMonthly`
                  carries a price per product per month, `priceMix` separates a
                  like-for-like price move from a mix move, and the block below
                  prints whichever of the two it can support.

                  **The refusal has not been deleted, only conditioned.** Where
                  the coverage is thin, the menu churned, or the two effects
                  cancel, this says so in the same place the answer would have
                  been — see `PRICE_MIX` for the floors and what each protects. */}
              <div className="mb-4 rounded-lg border border-line bg-surface-sunken px-4 py-3">
                {growth.split?.ok ? (
                  /* ── OV-7 answered ────────────────────────────────────────
                     The question that opened OV-7 was "are we saying a product
                     is now sold for a higher price than it was before?" The
                     honest answer was **no, and the panel used to imply
                     otherwise**. It is now yes or no with the arithmetic behind
                     it, because the extract carries a price per product per
                     month and `priceMix` splits the bar on it. */
                  <>
                    <p className="max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                      <strong className="text-ink">
                        &quot;Average item price&quot; is split into the two things it is made of.
                      </strong>{" "}
                      Like for like — the same products, repriced — an item moved{" "}
                      <span className="tnum">
                        {growth.split.priceEffect >= 0 ? "+" : "−"}$
                        {Math.abs(growth.split.priceEffect).toFixed(2)}
                      </span>
                      . What guests chose to buy moved it a further{" "}
                      <span className="tnum">
                        {growth.split.mixEffect >= 0 ? "+" : "−"}$
                        {Math.abs(growth.split.mixEffect).toFixed(2)}
                      </span>
                      . <strong className="text-ink">Only the first is a price rise</strong> — the second is
                      a guest trading up or down, and it is counted as real trade.
                    </p>
                    {growth.split.movers.length > 0 && (
                      <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                        Biggest movers on price:{" "}
                        {growth.split.movers.slice(0, 3).map((m, i) => (
                          <span key={m.name}>
                            {i > 0 && "; "}
                            <strong className="text-ink">{m.name}</strong>{" "}
                            <span className="tnum">
                              ${m.from.toFixed(2)} → ${m.to.toFixed(2)}
                            </span>
                          </span>
                        ))}
                        .
                      </p>
                    )}
                    <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-muted">
                      Measured on product lines, which cover{" "}
                      <span className="tnum">{pct(growth.split.coverage, 0)}</span> of the revenue in the
                      thinner of the two months, and on the{" "}
                      <span className="tnum">{pct(growth.split.matchedLines, 0)}</span> of lines sold in
                      both. A product discounted for part of a month reads as cheaper here — the discount
                      sits on the order, not on the line.
                    </p>
                  </>
                ) : (
                  /* ── The refusal, naming itself where the figure would be ── */
                  <>
                    <p className="max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                      <strong className="text-ink">
                        &quot;Average item price&quot; is not the same as a price rise.
                      </strong>{" "}
                      It is revenue divided by items, and it moves the same amount whether you put prices
                      up or your guests shifted toward more expensive items. A large flat white instead of
                      a small one registers here identically to a price increase.
                    </p>
                    <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                      <strong className="text-ink">The two are not separated here</strong>
                      {growth.split ? <> — {growth.split.reason}.</> : "."} Splitting them needs a price per
                      product per month against that product&apos;s volumes, measured on the same guests as
                      the bars above.
                    </p>
                  </>
                )}
                <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                  The factors are multiplicative and the decomposition shares the movement across all of
                  them, so it is not that some are &quot;also&quot; driving the basket — each gets its
                  share and the shares sum to the total.
                </p>
              </div>

              <GrowthView d={growth} rows={decomposition} />
            </Disclosure>
          )}

          {/* ── the standing note ────────────────────────────────────────────
              One place, once, at the foot. Individual refusals still state
              themselves where the figure would have been — that rule has not
              moved — but a reader who has met two or three of them deserves to
              know it is a policy rather than a series of accidents, and that
              the same page will fill in as the evidence arrives. */}
          <p className="max-w-[100ch] border-t border-line pt-4 text-[12px] leading-relaxed text-ink-muted">
            <strong className="text-ink-secondary">Where the evidence is thin, this report says so
            instead of publishing.</strong>{" "}
            A figure is withheld when the window is too short to observe what it claims, when the sample
            behind it is too small to survive a different fortnight, or when a comparison cannot be
            separated from the reason those people are in it. Every refusal names itself where the number
            would have been, and says what would lift it — most of them lift on their own as the window
            grows.
          </p>
        </div>
      </Page>
    </>
  );
}

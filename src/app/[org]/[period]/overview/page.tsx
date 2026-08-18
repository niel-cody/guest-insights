import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Tile } from "@/components/ui/Primitives";
import { IconArrow } from "@/components/shell/Icons";
import { SegmentComposition } from "@/components/charts/SegmentCharts";
import { SegmentGrid, type PreviousPeriod } from "@/components/ui/SegmentGrid";
import { SelectionCorrection, ValuePanels } from "@/components/charts/ValuePanels";
import { Disclosure } from "@/components/ui/Disclosure";
import { GrowthWaterfall, RealVsPriceBar } from "@/components/charts/GrowthWaterfall";
import { BasketMix } from "@/components/ui/BasketMix";
import { getPeriods, getAllOrgs, getGuestRows, getSnapshot } from "@/lib/data";
import { previousReadable } from "@/lib/periods";
import { runChecks } from "@/lib/checks";
import {
  attributionPct, basketMix, basketStory, causalReading, count, coverageState,
  decompose, delta, excludedSingleVisitCards, money, monthLabel, opportunityPerVenueWeek, pct, ratio,
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
  const orgs = await getAllOrgs();
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
  const growth = first && last && first !== last ? decompose(first, last) : null;
  const mix = snap.items ? basketMix(snap.items) : null;
  const story = mix ? basketStory(mix) : null;

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        periods={periods}
        period={current}
        title="Overview"
        coverage={cov}
        checks={checks}
      />
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
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
              label="People you can name"
              value={count(tileCount(identifiedPeople))}
              accent="var(--tier-card)"
              detail={
                <>
                  {count(tileCount(cs.member.people))} enrolled · {count(tileCount(cs.nonMember.people))} card only
                </>
              }
              meta={<>Card tier · {win}</>}
              info={
                <>
                  <p>
                    Everybody identified by their <strong className="text-ink">payment card</strong>, whether
                    or not they ever scanned. A card seen on a scanned order belongs to that member on every
                    other order it appears on, so a member who forgets to scan is still the same person.
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
              meta={<>Revenue grain · {win} · of {money(coverage.totals.revenue)} trade</>}
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
                meta={<>Person grain · {win} · enrolled against card only</>}
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
                  </>
                }
                /* The caveat stays on the face. It is not method, and it is the
                   one sentence that stops this figure being misused. */
                footnote={
                  <span className="text-ink-muted">
                    Association, not effect. {pct(causal.selectionShare ?? 0, 0)} of this gap was already
                    there before anybody enrolled — see below.
                  </span>
                }
              />
            ) : (
              <Tile
                label="A member is worth"
                value={memberLift >= 1 ? ratio(memberLift) : delta(memberLift)}
                accent="var(--warning)"
                refused
                footnote={
                  <span className="text-ink-muted">
                    The observed gap is shown quietly rather than as an answer, because nothing in this
                    window separates it from selection — the within-person estimate needs more people who
                    enrolled mid-window than this merchant has. A gap that cannot be separated from
                    selection is not a measure of what a member is worth, and publishing it as one is how
                    a loyalty programme gets justified by the behaviour of the people who were always
                    going to join it.
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
                  Of {count(opp.unscanned.orders + members.linkage.scannedOrders)} member orders the card
                  bridge resolved
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

          {/* ── §5.3 one sentence, and how the four counts nest ──────────────
              The sentence is the only place on the page carrying the order
              count, which is the denominator of the recognition tile and the
              base of the whole Behaviour page, and the only place making the
              CRM comparison. It stays.

              The nesting note is new. Four population figures appear on this
              screen — 69,530, 24,906, 4,966 and 19,940 — and nothing told the
              reader how they sit inside each other. It reads as four unrelated
              counts, and a reader who cannot nest them cannot check any of
              them. It also quotes the same rounded figure the tile does: the
              sentence used to carry the exact 69,529 directly beneath a tile
              reading 69,530, which is the rounding contract producing a
              discrepancy in the reader's eye. */}
          <Card>
            <p className="max-w-[100ch] text-[15px] leading-relaxed text-ink">
              Over {win} you served {money(coverage.totals.revenue)} across {count(coverage.totals.orders)}{" "}
              orders, and can put <strong>{attributionPct(cov.identifiedRevenueShare)}</strong> of that
              revenue against {count(tileCount(identifiedPeople))} people you could recognise again — where
              a loyalty CRM, which only sees a scan, would show{" "}
              <strong>{attributionPct(cov.scannedRevenueShare)}</strong>.
            </p>
            <div className="mt-4 rounded-lg border border-line bg-surface-sunken px-4 py-3">
              <p className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
                How these four counts nest
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed text-ink-secondary">
                <li>
                  <strong className="tnum text-ink">{count(tileCount(identifiedPeople))}</strong> people
                  identified at all — everyone seen on a card, however briefly.
                </li>
                <li className="pl-4">
                  ↳ <strong className="tnum text-ink">{count(segments.population)}</strong> of them are
                  classifiable: enrolled, or seen on a card more than once. A card seen once is a
                  transaction, not yet a customer.
                </li>
                <li className="pl-8">
                  ↳ <strong className="tnum text-ink">{count(cs.member.people)}</strong> of those have
                  enrolled, and are the only people who carry a lifecycle verdict.
                </li>
                <li className="pl-8">
                  ↳ <strong className="tnum text-ink">{count(opp.candidates.people)}</strong> of those have
                  not, and are the enrolment opportunity below.
                </li>
              </ul>
              <p className="mt-2 text-[12px] text-ink-muted">
                Tiles round to the nearest ten; tables and the grid never round. The exact identified
                population is {count(identifiedPeople)}.
              </p>
            </div>
          </Card>

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
          <Card title="Where your guests stand">
            <div className="flex flex-col gap-7">
              <SegmentGrid
                lifecycleRows={{
                  member: toRows(stands),
                  card: toRows(rollUpSegments(segments, "card")),
                  all: toRows(rollUpSegments(segments)),
                }}
                orgSlug={org.slug}
                period={period}
                lapsedDays={org.calibration.lapsedDays}
                lapsedGuests={stands.find((s) => s.segment === "lapsed")?.guests ?? 0}
                previous={previous}
                visitRows={{
                  member: visitBands(members, "member"),
                  card: visitBands(members, "card"),
                  all: visitBands(members, "all"),
                }}
                excludedCards={excludedSingleVisitCards(members)}
              />

              <SegmentComposition
                rows={stands.map((s) => ({
                  segment: s.segment,
                  label: s.label,
                  guests: s.guests,
                  visits: s.visits,
                  spend: s.spend,
                }))}
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

          {/* ── §5.6 the opportunity ─────────────────────────────────────── */}
          <Card
            title="The opportunity"
            subtitle={`Card-recognised repeat guests who have never enrolled, ${win}.`}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <Tile
                  label="People"
                  value={count(tileCount(opp.candidates.people))}
                  accent="var(--tier-card)"
                  footnote={
                    <>
                      two or more visits, never enrolled
                      <span className="mt-1 block text-ink-muted">Card tier · {win}</span>
                    </>
                  }
                />
                {/* "62% of non-member spend" was true only against *attributed*
                    non-member spend. Against every non-member dollar the
                    business took, including the trade no card could be resolved
                    for, it is 48%. Both denominators are named, because a share
                    without its denominator is the thing this build exists not
                    to publish. */}
                <Tile
                  label="Their trade in the window"
                  value={money(opp.candidates.spend)}
                  accent="var(--accent)"
                  footnote={
                    <>
                      {pct(opp.candidates.spend / Math.max(cs.nonMember.spend, 1), 0)} of{" "}
                      <em>attributed</em> non-member spend · {pct(opp.candidates.spend / Math.max(coverage.totals.revenue - coverage.totals.memberRevenue, 1), 0)}{" "}
                      of all non-member trade
                      <span className="mt-1 block text-ink-muted">
                        This is trade at stake, not uplift
                      </span>
                    </>
                  }
                />
              </div>

              <div>
                {opp.uplift ? (
                  <>
                    <div className="rounded-lg border border-line bg-surface-sunken px-4 py-3.5">
                      <p className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
                        What enrolling them would be worth
                      </p>
                      {/* A range, never a point estimate. The interval runs
                          +3.0% to +19.3% and a single number off that spread is
                          false precision dressed as a forecast. */}
                      <p className="tnum mt-1 text-[26px] leading-none font-semibold text-ink">
                        {money(opp.uplift.valueLo)} – {money(opp.uplift.valueHi)}
                      </p>
                      <p className="mt-1.5 text-[12px] text-ink-muted">
                        a quarter, <strong className="text-ink-secondary">if every one of them enrolled</strong>{" "}
                        · 95% CI on a within-person lift of {delta(opp.uplift.lift, 1)} (
                        {delta(opp.uplift.lo, 1)} to {delta(opp.uplift.hi, 1)})
                      </p>
                      {/* The take-up assumption is on the face because it is the
                          first thing a finance director will work out, and
                          working it out for themselves in the meeting costs more
                          credibility than stating it costs. The band is the full
                          interval applied to the full trade of everybody in the
                          population — arithmetically it assumes 100% take-up,
                          which no enrolment campaign has ever achieved. */}
                      <div className="mt-2 rounded-lg border border-line bg-surface-raised px-3 py-2">
                        <p className="text-[12px] leading-relaxed text-ink-secondary">
                          <strong className="text-ink">That figure assumes every one of the{" "}
                          {count(opp.candidates.people)} enrols.</strong> At a take-up of{" "}
                          {TAKE_UP_ILLUSTRATION.map((t) => `${Math.round(t * 100)}%`).join(", ")} it is{" "}
                          {TAKE_UP_ILLUSTRATION.map(
                            (t) => `${money(opp.uplift!.valueLo * t)}–${money(opp.uplift!.valueHi * t)}`,
                          ).join(", ")}{" "}
                          respectively. No take-up rate is assumed here because none has been measured at
                          this merchant; the figure above is the ceiling, not the forecast.
                        </p>
                      </div>
                      <p className="mt-2.5 max-w-[70ch] text-[12px] leading-relaxed text-ink-secondary">
                        Sized on the within-person uplift, never on the observed gap. The observed gap would
                        put this roughly twenty times higher and every dollar of it would be selection.
                      </p>
                    </div>

                    {/* Nobody can act on a seven-figure lottery number. A venue
                        manager can act on a weekly one for their own site. */}
                    <div className="mt-4 rounded-lg border border-line px-4 py-3.5">
                      <p className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
                        Per venue, per week
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                        <span>
                          <span className="tnum text-[22px] font-semibold text-ink">
                            {money(perVenueWeek.trade)}
                          </span>
                          <span className="ml-2 text-[12px] text-ink-secondary">
                            of trade at stake
                          </span>
                        </span>
                        <span>
                          <span className="tnum text-[22px] font-semibold text-ink">
                            {money(perVenueWeek.upliftLo)} – {money(perVenueWeek.upliftHi)}
                          </span>
                          <span className="ml-2 text-[12px] text-ink-secondary">of uplift</span>
                        </span>
                      </div>
                      <p className="mt-2 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">
                        Across {org.venues.length} venues and {perVenueWeek.weeks} weeks. The two are
                        different quantities and are labelled as such: the first is the trade these guests
                        already bring and which enrolling would put on a name, the second is the additional
                        spend enrolling would cause.
                      </p>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    tone="warning"
                    title="Sized, but not valued"
                    body="The population is real and countable. What enrolling them would be worth is not, because the within-person estimate could not be made in this window. The list is still the right list to work; the number attached to it would be invented."
                  />
                )}

                <Link
                  href={`/${org.slug}/${period}/guests?tier=card&minVisits=2`}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
                >
                  Open these {count(opp.candidates.people)} guests <IconArrow className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
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
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <GrowthWaterfall d={growth} />
                <div>
                  <RealVsPriceBar d={growth} />
                  <table className="mt-4 w-full text-[13px]">
                    <tbody>
                      {growth.terms.map((t) => (
                        <tr key={t.key} className="border-b border-line last:border-b-0">
                          <th scope="row" className="py-2 text-left font-medium text-ink">
                            {t.label}
                            <span className="tnum ml-2 block text-[12px] font-normal text-ink-muted">
                              {t.operand}
                            </span>
                          </th>
                          <td
                            className="tnum py-2 text-right font-medium"
                            style={{ color: t.value >= 0 ? "var(--good)" : "var(--loss)" }}
                          >
                            {t.value >= 0 ? "+" : "−"}{money(Math.abs(t.value))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                    Symmetric Shapley, so the parts sum to the whole exactly and no residual bar is needed.
                    Each label states the direction the factor actually moved, not the direction its name
                    implies.
                  </p>
                </div>
              </div>
            </Disclosure>
          )}

          {mix && story && (
            <Disclosure
              defaultOpen
              summary="What members and everyone else actually buy"
              result={
                <>
                  Members buy <strong>{story.over.label}</strong> at{" "}
                  <strong>{story.over.index!.toFixed(2)}×</strong> the rate everybody else does, and{" "}
                  <strong>{story.under.label}</strong> at <strong>{story.under.index!.toFixed(2)}×</strong>.
                </>
              }
            >
              <p className="mb-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                {cs.lifts.spendPerVisit < 0 ? (
                  <>
                    This is the missing half of the {delta(cs.lifts.spendPerVisit)} per-visit gap above.
                    Standardising for daypart moved that gap by{" "}
                    {delta(members.standardisedBasket.lift - members.standardisedBasket.crude.lift, 1)}, so{" "}
                    <em>when</em> members come is not the reason their basket is smaller.{" "}
                    <strong className="text-ink">What they put in it is.</strong> This is association, not
                    effect: people who drink a coffee every morning are the people who enrol.
                  </>
                ) : (
                  <>
                    The two baskets differ by composition as well as by size, so a single per-visit average
                    describes neither side well. This is association, not effect.
                  </>
                )}
              </p>
              <BasketMix rows={mix} minLines={snap.items!.totals.minLinesForIndex} />
            </Disclosure>
          )}
        </div>
      </Page>
    </>
  );
}

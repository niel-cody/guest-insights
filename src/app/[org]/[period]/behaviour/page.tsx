import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Pill } from "@/components/ui/Primitives";
import { InfoButton } from "@/components/ui/InfoButton";
import { ExplainDrawer } from "@/components/ui/ExplainDrawer";
import { SegmentsExplainer } from "@/components/ui/SegmentsExplainer";
import { TIER_LABEL } from "@/lib/lexicon";
import { IconArrow } from "@/components/shell/Icons";
import { CohortLens } from "@/components/charts/CohortLens";
import { SegmentBasket, SegmentTiming } from "@/components/charts/SegmentBehaviour";
import { getPeriods, getAllOrgs, getSnapshot } from "@/lib/data";
import { previousReadable } from "@/lib/periods";
import {
  cohortWindow, count, coverageState, money, pct, rollUpSegments, tradingIdentity, windowShort,
  DAYPART_TRADE_FLOOR,
} from "@/lib/metrics";

export const dynamic = "force-static";

/** Named per page: the tab and every screenshot used to read "Guests". */
export const metadata = { title: "Behaviour" };

/**
 * Behaviour. §6. When and where they trade.
 *
 * The card-tier material runs top to bottom — trading identity, the heatmap,
 * where members are not, cross-venue — and then the member cohort lens sits
 * **behind a visible wall** at the foot, because it runs on a different
 * population over a different window and §4.3 forbids a figure that spans them.
 */
export default async function BehaviourPage({
  params, searchParams,
}: {
  params: Promise<{ org: string; period: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org: slug, period } = await params;
  void (await searchParams);

  const snap = await getSnapshot(slug, period);
  const orgs = await getAllOrgs();
  const periods = await getPeriods(slug);
  const current = periods.periods.find((p) => p.id === period)!;
  const { org, dayparts, venueCross, network, cohorts, segments, segmentBehaviour } = snap;
  // Enrolled people only, same roll-up and therefore the same numbers as the
  // segment grid on Overview. Two screens computing this twice is how they come
  // to disagree, so they call one function.
  const memberSegments = rollUpSegments(segments, "member");
  const cov = coverageState(org, snap.coverage);
  const identity = tradingIdentity(dayparts);
  const w = dayparts.window;
  const win = windowShort(w);

  const totalOrders = dayparts.periods.reduce((a, d) => a + d.orders, 0);
  const totalRevenue = dayparts.periods.reduce((a, d) => a + d.revenue, 0);
  const memberShareOverall = totalOrders
    ? dayparts.periods.reduce((a, d) => a + d.memberOrders, 0) / totalOrders
    : 0;

  // §8 rule 4: ink proportional to magnitude. A daypart with one order does not
  // get the same row height as one with 107,718 — the near-empty periods fold
  // into a single expandable line that states the combined total, so they are
  // neither given a full row each nor silently dropped.
  const carrying = dayparts.periods.filter((d) => d.orders / totalOrders >= DAYPART_TRADE_FLOOR);
  const negligible = dayparts.periods.filter((d) => d.orders / totalOrders < DAYPART_TRADE_FLOOR);
  const negligibleOrders = negligible.reduce((a, d) => a + d.orders, 0);
  const negligibleRevenue = negligible.reduce((a, d) => a + d.revenue, 0);

  // The daypart table is sorted by density (§6.2). The heatmap above it is not
  // and cannot be — it is a calendar.
  const byDensity = [...carrying].sort((a, b) => b.orders - a.orders);

  const MIN_ORDERS = Math.max(200, totalOrders * 0.02);
  const gaps = dayparts.periods
    .filter((d) => d.orders >= MIN_ORDERS && d.memberShare < memberShareOverall)
    .map((d) => ({
      ...d,
      shortfall: memberShareOverall - d.memberShare,
      shortfallOrders: Math.round(d.orders * (memberShareOverall - d.memberShare)),
    }))
    .sort((a, b) => b.shortfallOrders - a.shortfallOrders);

  /**
   * The previous readable period, for the density change column.
   *
   * Deliberately not called "last quarter" anywhere on the surface: consecutive
   * entries in `periods` are consecutive *readable runs*, and the months between
   * them are missing because card capture failed in them. The gap travels with
   * the figure so the column cannot be read as one period of movement.
   */
  const prevRun = previousReadable(periods, period);
  const prevDayparts = prevRun ? (await getSnapshot(slug, prevRun.period.id)).dayparts : null;
  const prevTotalOrders = prevDayparts
    ? prevDayparts.periods.reduce((a, d) => a + d.orders, 0)
    : 0;
  /** Density then against density now, so the column is share-of-trade, not volume. */
  const densityBefore = (key: string): number | null => {
    if (!prevDayparts || !prevTotalOrders) return null;
    const row = prevDayparts.periods.find((d) => d.key === key);
    return row ? row.orders / prevTotalOrders : null;
  };

  /**
   * C-5. The snapshot's `days` is the span between the first and last intake
   * months; the observation window runs to the close of the last intake's
   * month and is a month longer. Both were being printed as the same number.
   */
  const cw = cohorts ? cohortWindow(cohorts) : null;

  const cv = network.crossVenue;
  const bands = [1, 2, 3, 4].map((b) => {
    const rows = cv.byBand.filter((r) => (b === 4 ? r.venueBand >= 4 : r.venueBand === b));
    return { band: b, people: rows.reduce((a, r) => a + r.people, 0) };
  });
  const bandTotal = bands.reduce((a, b) => a + b.people, 0) || 1;

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        periods={periods}
        period={current}
        title="Behaviour"
        coverage={cov}
        // This page carries both tiers, so the chip must not assert the
        // card-tier figure over the member-tier section below the wall.
        coverageScope="mixed"
      />
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
          {/* ── §6.1 trading identity ────────────────────────────────────── */}
          <Card
            title="What kind of business this trades as"
            subtitle={`Derived from ${count(totalOrders)} orders, ${win}. Not declared — read off the density distribution.`}
            explain={
              <ExplainDrawer
                label="How the trading shape is derived"
                title="What kind of business this trades as"
                showing={
                  <>
                    <p>
                      One statement rather than a label. It names which parts of the day carry the trade and
                      how much, and whether the week is flat or weekend-shaped.
                    </p>
                    <p>
                      It is a fact about the density distribution, not a classification —{" "}
                      <strong>nothing here is a type this business has been assigned.</strong>
                    </p>
                  </>
                }
                made={
                  <>
                    {/* BH-3: the two grey lines under the grid move in here.
                        They are provenance — why there is no archetype label —
                        which is the definition of something that explains how a
                        statement was built rather than how to read it. */}
                    <p>
                      <strong>Stated as a fact rather than as an archetype.</strong> A single label for{" "}
                      {org.venues.length} venues across the states this estate trades in would describe none
                      of them well, and this report&apos;s own outlier detection says they are not alike. It
                      is useless at four mixed venues, useless at {org.venues.length}, and tautological at
                      one.
                    </p>
                    <p>
                      A confidence score used to sit beside it and was removed: it was undefined and
                      self-contradicting, and no denominator on the page yielded the number it printed.
                    </p>
                    <p>
                      <strong>Weekend share is a null result and is reported as one.</strong>{" "}
                      {pct(dayparts.weekendBaseline, 1)} against a {pct(2 / 7, 1)} calendar baseline is
                      no difference. It is stated in the sentence rather than given a card of its own,
                      because presenting no-difference at headline size teaches an owner to distrust the
                      figures beside it.
                    </p>
                    <p>
                      Density is share of orders, so a business that simply got busier everywhere does not
                      change shape here.
                    </p>
                  </>
                }
              />
            }
          >
            {/* ── Three cards became one statement ────────────────────────────
                **The archetype label has gone.** "High-Throughput Breakfast" was
                an unprovenanced framework name cited as authority on the face of
                a customer report, computed at organisation level across venues
                in three states that this build's own outlier detection says are
                not alike. The fact underneath it is true and worth stating, so
                the fact stays and the label goes. The reasoning moved into the
                drawer with BH-3; only the fact is on the face. */}
            <p className="max-w-[95ch] text-[15px] leading-relaxed text-ink">
              <strong>
                {identity.primary.map((d) => d.label).join(" and ")} together carry{" "}
                {pct(
                  identity.primary.reduce((a, d) => a + d.orders, 0) / Math.max(totalOrders, 1),
                  0,
                )}{" "}
                of all orders
              </strong>{" "}
              — {count(totalOrders)} orders across the{" "}
              {/* C-6. This read "5 periods this business actually trades in" above
                  a table that discloses 8, and a reader counting rows found a
                  contradiction that was really a definition. Both figures are now
                  in the sentence, so the claim and the table agree by
                  construction. */}
              {identity.tradingPeriods} of {dayparts.periods.length} periods in the day this business
              actually trades in, {win}. Weekend trade is {pct(dayparts.weekendBaseline, 1)} against a{" "}
              {pct(2 / 7, 1)} calendar baseline, so the week is flat: this is a weekday-shaped business,
              not a weekend-shaped one.
            </p>
          </Card>

          {/* ── §6.2 "The trading week" has been removed ──────────────────────
              It was a 7×8 grid of all trade by day of week and daypart, with a
              metric toggle. Nothing was wrong with it and it is not coming back
              here, because it answers a **product and operations** question —
              when is the venue busy, when should it roster — and this is the
              customer report. A sales report already carries that grid, and two
              reports drawing the same axes off two extracts is how they come to
              disagree in a meeting.

              The same axes cut **by who the guest is** do belong here, and they
              are now in "When each segment comes" below. That is the question
              only this report can answer: your regulars and your passing trade
              do not come at the same time, and a shift planned around one is
              being planned against the other. */}

          {/* ── the daypart table, the precision layer (§8 rule 6) ───────── */}
          {/* ── §6.2 the daypart table, the precision layer (§8 rule 6) ──────
              BH-2. Two things were missing and the note that found them was
              right on both counts.

              **It did not say which population it covers.** The table is all
              trade — every order, identified or not — and only one column was
              member-aware. A reader reasonably assumed "guests" meant the
              identified population, which is a different and much smaller
              number.

              **It carried a member share and nothing to compare it against.**
              Member share alone cannot tell a GM whether Lunch is genuinely
              quiet or merely unrecognised, which is exactly the question the
              section directly below it asks. So the orders now split three
              ways — members, recognised guests, and orders no card resolved —
              and the split is on the face rather than derivable from one
              percentage. It also closes the third of the three member-order
              figures in C-1: a reader reverse-computing member orders from a
              rounded share got a number 65 orders adrift, and now does not have
              to. */}
          <Card
            title="Dayparts, by density"
            subtitle={`Where the trade actually sits, sorted by density. All trade — every order, whether or not anybody was identified.${
              prevRun ? ` Change is against ${prevRun.label}.` : ""
            }`}
            padded={false}
            explain={
              <ExplainDrawer
                label="How the daypart table is built"
                title="Dayparts, by density"
                showing={
                  <>
                    <p>
                      Every order in the window, bucketed by the hour it was placed and sorted by how much
                      of the trade sits there. <strong>Density is share of orders</strong>, so a business
                      that got busier everywhere shows no movement — what moves is the shape of the
                      trading day.
                    </p>
                    <p>
                      The identity columns split those orders three ways:{" "}
                      <strong>{TIER_LABEL.member}</strong> placed by somebody enrolled,{" "}
                      <strong>{TIER_LABEL.card}</strong> placed by somebody identified only by their
                      payment card, and <strong>Unidentified</strong> where no card could be resolved at
                      all. The three sum to the order count on the same row.
                    </p>
                    <p>
                      The <strong>Guests →</strong> link on each row opens the guest grid filtered to that
                      daypart, across both identity methods — not members only.
                    </p>
                  </>
                }
                made={
                  <>
                    <p>
                      Dayparts are venue-local: the hour comes from the localised trading timestamp, never
                      from UTC, so a venue in a different state buckets against its own clock.
                    </p>
                    <p>
                      Periods carrying under {pct(DAYPART_TRADE_FLOOR, 1)} of orders are folded into one
                      line rather than given a row each. Two orders in three months across{" "}
                      {org.venues.length} venues is a mis-keyed till, not a dinner service, and a full row
                      would give it the same ink as a period carrying{" "}
                      {count(Math.max(...carrying.map((d) => d.orders)))}.
                    </p>
                    <p>
                      Member orders here sum to {count(snap.coverage.totals.memberOrders)}, which is every order
                      placed by an enrolled person. That is a larger figure than the bridged subset the
                      recognition tile on Overview is measured against, and the two are reconciled in that
                      tile&apos;s own drawer.
                    </p>
                  </>
                }
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="px-5 py-2.5 text-left font-medium">Daypart</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-3 py-2.5 text-right font-medium">Order density</th>
                    {prevRun && (
                      <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          Change
                          <InfoButton label="How the density change is computed" align="end">
                            <p>
                              This period&apos;s share of orders against{" "}
                              <strong className="text-ink">{prevRun.label}</strong>, in percentage points.
                              Both figures are shares, so a business that simply got busier everywhere shows
                              no change here — what moves is the <em>shape</em> of the trading day.
                            </p>
                            <p className="mt-1.5">
                              <strong className="text-ink">
                                That earlier period is not the previous quarter.
                              </strong>{" "}
                              <strong className="text-ink">{prevRun.gapMonths} months are missing between
                              the two.</strong> They are not in the snapshot at all, because card capture
                              failed in them, so a shift that took a year to happen arrives here looking
                              like one period of movement.
                            </p>
                          </InfoButton>
                        </span>
                      </th>
                    )}
                    <th className="px-3 py-2.5 text-right font-medium">Revenue density</th>
                    <th className="px-3 py-2.5 text-right font-medium">Weekend</th>
                    {/* BH-2: the split, not just the share. */}
                    <th className="px-3 py-2.5 text-right font-medium">{TIER_LABEL.member}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{TIER_LABEL.card}</th>
                    {/* The remainder, so the three identity columns add up to
                        the order count on the same row. Two columns that sum to
                        less than the total beside them is a reader doing
                        subtraction to find out whether something is missing. */}
                    <th className="px-3 py-2.5 text-right font-medium">Unidentified</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        Member share
                        <InfoButton label="What member share is a share of" align="end">
                          <p>
                            Member orders as a share of <strong className="text-ink">all</strong> orders in
                            that period, including the ones no card could be resolved for. It is not a share
                            of identified orders, which would run higher and describe a different thing.
                          </p>
                        </InfoButton>
                      </span>
                    </th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {byDensity.map((d) => (
                    <tr key={d.key} className="border-b border-line last:border-b-0 hover:bg-surface-hover">
                      <th scope="row" className="px-5 py-2 text-left font-medium text-ink">
                        {d.label}
                        <span className="tnum ml-2 text-[12px] font-normal text-ink-muted">
                          {String(d.from).padStart(2, "0")}:00–{String(d.to % 24).padStart(2, "0")}:00
                        </span>
                      </th>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">{count(d.orders)}</td>
                      <td className="tnum px-3 py-2 text-right font-medium text-ink">
                        {pct(d.orders / totalOrders, 1)}
                      </td>
                      {prevRun && (
                        <DensityChange now={d.orders / totalOrders} before={densityBefore(d.key)} />
                      )}
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">
                        {pct(d.revenue / totalRevenue, 1)}
                      </td>
                      <td
                        className="tnum px-3 py-2 text-right"
                        style={{
                          color: d.weekendShare > dayparts.weekendBaseline * 1.4 ? "var(--accent)" : "var(--ink-secondary)",
                        }}
                      >
                        {pct(d.weekendShare, 1)}
                      </td>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">
                        {count(d.memberOrders)}
                      </td>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">
                        {count(d.cardOrders)}
                      </td>
                      <td className="tnum px-3 py-2 text-right text-ink-muted">
                        {count(d.orders - d.memberOrders - d.cardOrders)}
                      </td>
                      <td
                        className="tnum px-3 py-2 text-right"
                        style={{ color: d.memberShare < memberShareOverall ? "var(--warning)" : "var(--ink-secondary)" }}
                      >
                        {pct(d.memberShare, 1)}
                      </td>
                      <td className="px-5 py-2 text-right">
                        <Link
                          href={`/${org.slug}/${period}/guests?daypart=${d.key}`}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                        >
                          All guests <IconArrow className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {/* Folded, not dropped. The combined total is stated on the
                      closed line so a reader knows exactly what is inside. */}
                  {negligible.length > 0 && (
                    <tr className="border-b border-line last:border-b-0">
                      <td colSpan={prevRun ? 11 : 10} className="px-5 py-2">
                        <details>
                          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-ink-secondary marker:hidden hover:text-ink">
                            <span className="text-ink-muted">›</span>
                            <span>
                              {negligible.map((d) => d.label).join(", ")} —{" "}
                              <span className="tnum font-medium text-ink">{count(negligibleOrders)} orders</span>{" "}
                              between them, {pct(negligibleOrders / totalOrders, 2)} of trade,{" "}
                              {money(negligibleRevenue)}
                            </span>
                          </summary>
                          <table className="mt-2 w-full text-[12px]">
                            <tbody>
                              {negligible.map((d) => (
                                <tr key={d.key} className="border-b border-line last:border-b-0">
                                  <th scope="row" className="py-1.5 text-left font-normal text-ink-secondary">
                                    {d.label}{" "}
                                    <span className="tnum text-ink-muted">
                                      {String(d.from).padStart(2, "0")}:00–{String(d.to % 24).padStart(2, "0")}:00
                                    </span>
                                  </th>
                                  <td className="tnum py-1.5 text-right text-ink-secondary">{count(d.orders)} orders</td>
                                  <td className="tnum py-1.5 text-right text-ink-muted">{money(d.revenue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-1.5 max-w-[90ch] text-[11px] leading-relaxed text-ink-muted">
                            Below {pct(DAYPART_TRADE_FLOOR, 1)} of orders a period is not a quiet trading
                            period, it is a period this business does not trade in. Two orders in three
                            months across {org.venues.length} venues is a mis-keyed till, not a dinner
                            service — and given a full row it would occupy the same ink as a period carrying{" "}
                            {count(Math.max(...carrying.map((d) => d.orders)))}.
                          </p>
                        </details>
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line-strong bg-surface-sunken text-ink">
                    <th scope="row" className="px-5 py-2.5 text-left font-semibold">All trade</th>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">{count(totalOrders)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">100.0%</td>
                    {/* Shares against shares: the total cannot move, and an
                        em-dash says that rather than a misleading 0.0pp. */}
                    {prevRun && <td className="px-3 py-2.5 text-right font-semibold text-ink-muted">—</td>}
                    <td className="tnum px-3 py-2.5 text-right font-semibold">100.0%</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">{pct(dayparts.weekendBaseline, 1)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">
                      {count(dayparts.periods.reduce((a, d) => a + d.memberOrders, 0))}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">
                      {count(dayparts.periods.reduce((a, d) => a + d.cardOrders, 0))}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold text-ink-muted">
                      {count(
                        dayparts.periods.reduce(
                          (a, d) => a + d.orders - d.memberOrders - d.cardOrders,
                          0,
                        ),
                      )}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">{pct(memberShareOverall, 1)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* ── §6.3 where your members are not ─────────────────────────── */}
          <Card
            title="Where your members are not"
            subtitle={`Periods running below the ${pct(memberShareOverall, 1)} member share the business averages, and how many orders behind that is.`}
          >
            {gaps.length === 0 ? (
              <p className="max-w-[90ch] text-[13px] leading-relaxed text-ink-secondary">
                No period with meaningful volume runs below the estate average. Member penetration is even
                across the trading day, which means enrolment is not being lost to a particular shift.
              </p>
            ) : (
              <>
                <table className="w-full max-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                      <th className="py-2 text-left font-medium">Period</th>
                      <th className="py-2 text-right font-medium">Member share</th>
                      <th className="py-2 text-right font-medium">Shortfall</th>
                      <th className="py-2 text-right font-medium">Orders behind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((g) => (
                      <tr key={g.key} className="border-b border-line last:border-b-0">
                        <th scope="row" className="py-2 text-left font-medium text-ink">{g.label}</th>
                        <td className="tnum py-2 text-right text-ink-secondary">{pct(g.memberShare, 1)}</td>
                        <td className="tnum py-2 text-right" style={{ color: "var(--warning)" }}>
                          −{pct(g.shortfall, 1)}
                        </td>
                        <td className="tnum py-2 text-right font-medium text-ink">{count(g.shortfallOrders)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                  &quot;Orders behind&quot; is how many more orders in that period would carry a member if it
                  ran at the business average. <strong className="text-ink">This is a gap in recognition,
                  not proof of a gap in loyalty.</strong> A shift that never asks is indistinguishable here
                  from a shift whose guests decline.
                </p>
              </>
            )}
          </Card>

          {/* ── §6.4 cross-venue: three views, and the single-venue case ─────
              BH-4. At one venue four blocks in this section are structurally
              empty: the stat block, the venues-per-guest distribution, the
              per-venue shared-base ranking, and the two-levels note. Nothing
              here was written for n=1, and single-site is the common case for
              the real product even though it is not the case in this dataset —
              the council rated the gap a defect rather than a scoping choice
              and that is the right reading.

              **An empty state rather than hiding the section.** Hiding is
              cheaper and would be honest, but a merchant considering a second
              site is exactly the merchant who should be able to see what this
              section would tell them. What is refused is any *figure*: a
              crossing rate at one venue is 0% by construction and drawing it
              would be reporting the estate shape as a customer behaviour. */}
          {org.venues.length < 2 ? (
            <Card title="Guests who use more than one venue">
              <EmptyState
                title={`${org.name} trades from one venue, so there is nothing to cross`}
                body={
                  <>
                    <p>
                      This section measures guests who use more than one of your sites — how many there
                      are, how many sites they use, and what share of each venue&apos;s own base is shared
                      with another. All four of those are undefined at a single venue, and a crossing rate
                      of 0% here would be a fact about your estate rather than about your guests.
                    </p>
                    <p className="mt-2">
                      <strong className="text-ink">It fills in the day a second venue opens.</strong> Guests
                      who use more than one site visit and spend materially more than guests who do not, at
                      every merchant this build has measured — so this is the section that tells you whether
                      a second site grew the business or split it.
                    </p>
                  </>
                }
              />
            </Card>
          ) : (
          <Card
            title="Guests who use more than one venue"
            subtitle={`Overlap, not a causal claim — and it partly reflects venue size and proximity. ${win}.`}
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {/* view 1 — the stat block */}
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-line px-4 py-3.5">
                  <p className="text-[15px] leading-relaxed text-ink">
                    <strong className="tnum text-[22px]">
                      1 in {Math.round(1 / Math.max(cv.multiShareOfPeople, 0.001))}
                    </strong>{" "}
                    of your countable guests use more than one venue.
                  </p>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-ink">
                    They visit{" "}
                    <strong>
                      {pct(cv.multi.visitsPerPerson / Math.max(cv.single.visitsPerPerson, 0.01) - 1, 0)} more
                      often
                    </strong>{" "}
                    — {cv.multi.visitsPerPerson.toFixed(2)} against {cv.single.visitsPerPerson.toFixed(2)}.
                  </p>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-ink">
                    They spend{" "}
                    <strong>
                      {pct(cv.multi.spendPerPerson / Math.max(cv.single.spendPerPerson, 0.01) - 1, 0)} more
                    </strong>{" "}
                    — {money(cv.multi.spendPerPerson)} against {money(cv.single.spendPerPerson)}.
                  </p>
                  <p className="mt-3 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">
                    <strong className="text-ink-secondary">The comparison is against guests who had the
                    opportunity</strong> — people with more than one visit. Measured against every card ever
                    seen this group looks far more valuable again, but most of that population was seen once
                    and <em>could not</em> have crossed, so the gap would be measuring visit frequency rather
                    than movement between venues.
                  </p>
                  <Link
                    href={`/${org.slug}/${period}/guests?minVenues=2`}
                    className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
                  >
                    Open these {count(cv.multi.people)} guests <IconArrow className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* view 2 — the distribution bar */}
                <div>
                  <h3 className="text-[13px] font-semibold text-ink">Venues used per guest</h3>
                  <p className="mt-0.5 text-[12px] text-ink-secondary">
                    Whether crossing is a fringe or a real segment, at a glance. {count(bandTotal)} countable
                    guests · {win}.
                  </p>
                  <div className="mt-2 flex h-8 overflow-hidden rounded-md">
                    {bands.map((b, i) => (
                      <div
                        key={b.band}
                        style={{
                          width: `${(b.people / bandTotal) * 100}%`,
                          background: `color-mix(in srgb, var(--brand-purple) ${25 + i * 25}%, transparent)`,
                        }}
                        aria-label={`${b.band === 4 ? "4 or more" : b.band} venues: ${count(b.people)} guests`}
                      />
                    ))}
                  </div>
                  <table className="mt-2 w-full text-[12px]">
                    <tbody>
                      {bands.map((b, i) => (
                        <tr key={b.band} className="border-b border-line last:border-b-0">
                          <th scope="row" className="flex items-center gap-2 py-1.5 text-left font-normal text-ink">
                            <span
                              className="h-2.5 w-2.5 rounded-[3px]"
                              style={{ background: `color-mix(in srgb, var(--brand-purple) ${25 + i * 25}%, transparent)` }}
                            />
                            {b.band === 4 ? "4 or more venues" : `${b.band} venue${b.band === 1 ? "" : "s"}`}
                          </th>
                          <td className="tnum py-1.5 text-right text-ink-secondary">{count(b.people)}</td>
                          <td className="tnum py-1.5 text-right text-ink-muted">{pct(b.people / bandTotal, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* view 3 — the ranked bar, the one a venue manager reads */}
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  How much of each venue&apos;s base is shared
                </h3>
                <p className="mt-0.5 max-w-[80ch] text-[12px] leading-relaxed text-ink-secondary">
                  For each venue, the share of <em>its own</em> guests who also use another. This is the view
                  that tells a venue manager whether they are an island or part of a cluster.{" "}
                  <strong className="text-ink">Expressed as a share, never a count</strong> — raw counts rank
                  by venue size, so the biggest venues would top the list for being big.
                </p>
                {/* Named rather than left for the reader to work out: this
                    ranking is substantially a map. A GM cannot move their venue
                    closer to other venues, so read as a league table it invites
                    an action nobody can take. The three states underneath are
                    what the row actually supports. */}
                <p className="mt-1.5 max-w-[80ch] text-[12px] leading-relaxed text-ink-muted">
                  <strong className="text-ink-secondary">This ranks geography more than performance.</strong>{" "}
                  A venue high on this list is near other venues; one at the bottom is not, and no manager
                  can move their site. Read it as three states — clustered, partly shared, island — rather
                  than as a league table.
                </p>
                {venueCross.length === 0 ? (
                  <div className="mt-3">
                    <EmptyState
                      title="No per-venue crossing in this snapshot"
                      body="Extracted separately from the cross-venue totals. This snapshot predates it."
                    />
                  </div>
                ) : (
                  <table className="mt-3 w-full text-[12px]">
                    <tbody>
                      {venueCross.map((v) => (
                        <tr key={v.storeId} className="border-b border-line last:border-b-0">
                          <th scope="row" className="w-[150px] py-1.5 pr-3 text-left font-normal text-ink">
                            {v.storeName}
                          </th>
                          <td className="py-1.5">
                            <div className="h-2.5 w-full rounded-sm bg-surface-sunken">
                              <div
                                className="h-full rounded-sm"
                                style={{ width: `${v.share * 100}%`, background: "var(--brand-purple)" }}
                              />
                            </div>
                          </td>
                          <td className="tnum w-[132px] py-1.5 pl-3 text-right whitespace-nowrap text-ink">
                            {pct(v.share, 1)}
                            <span className="ml-1.5 text-ink-muted">
                              {count(v.crossingGuests)}/{count(v.guests)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ── The second tier this report does not yet see ────────────────
                Stated here, on the only screen that reasons about where trade
                happens, because leaving it out is how this design fails to
                scale and the failure is silent.

                Oolio's hierarchy is two levels: **Venues**, and **Locations**
                inside them — sometimes called Stores — which exist so a
                merchant can split revenue within one site. This organisation
                uses one level, so every figure above is correct as drawn and
                nothing here is a caveat on it.

                It stops being correct the moment a merchant uses the second
                level. A venue with an inside bar, a courtyard and a function
                room is one row in every table on this page, and "guests who use
                more than one venue" would count somebody who moved from the
                courtyard to the bar as loyal to one site — or, if locations
                were naively treated as venues, would report a cross-venue rate
                that is mostly people walking twenty metres. Those are opposite
                errors and the data model cannot currently tell them apart,
                because revenue centres carry no type. */}
            <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-semibold text-ink">
                  This counts venues, and Oolio has two levels
                </h3>
                <Pill tone="neutral">Not a caveat here — a constraint on scaling</Pill>
              </div>
              <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                Oolio&apos;s structure is <strong className="text-ink">Venues</strong>, and{" "}
                <strong className="text-ink">Locations</strong> — sometimes called Stores — inside them, so a
                merchant can break revenue up within one site.{" "}
                <strong className="text-ink">{org.name} uses one level</strong>, so every figure above is
                measured on the thing it names and none of it is qualified by this.
              </p>
              <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                It matters for the next merchant. Give a venue an inside bar, a courtyard and a function
                room, and &quot;guests who use more than one venue&quot; breaks in one of two opposite
                directions: count locations as venues and the crossing rate is mostly people walking twenty
                metres; roll them up and a genuine multi-site guest is indistinguishable from someone who
                moved tables. <strong className="text-ink">Nothing in the data separates those cases</strong>{" "}
                — a revenue centre carries no type, so there is no field that says whether two ids are two
                businesses or two bars.
              </p>
              <p className="mt-2 max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
                Recorded rather than solved. Tagging revenue centres by type is the thing that would unlock
                it, and it is a data model change rather than a reporting one. Named here because a
                cross-venue measure that quietly changes meaning when a customer restructures their venue is
                worse than one that does not exist, and this is the page where somebody would find out.
              </p>
            </div>
          </Card>
          )}

          {/* ── §6.6 what each segment buys, and when they come ─────────────
              The two sections that replace "The trading week", and the reason
              it could go: this is the same material cut by customer rather than
              by till, which is the cut only this report can make. */}
          <Card
            title="What each segment actually buys"
            subtitle="The lifecycle buckets from Overview, read through the basket rather than the visit count. Enrolled people only."
            explain={
              <SegmentsExplainer
                lapsedDays={org.calibration.lapsedDays}
                lapsedGuests={memberSegments.find((r) => r.segment === "lapsed")?.guests ?? 0}
              />
            }
          >
            <SegmentBasket rows={memberSegments} windowLabel={win} />
            <p className="mt-4 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
              <strong className="text-ink">The ranking usually runs backwards from what people expect.</strong>{" "}
              The most frequent guests tend to have the <em>smallest</em> baskets — a daily coffee is a small
              transaction and an occasional visit is a large one — so a report that ranks segments by average
              spend concludes your best customers are your worst. Per head over the window, on Overview, is
              the figure that settles it, and frequency is what moves it.
            </p>
          </Card>

          {/* BH-6. The unit is in each table's heading and switchable; the
              method paragraph that used to close this block is in the drawer.
              See `SegmentTiming`. */}
          <Card
            title="When each segment comes"
            subtitle="Day of week and time of day, cut by who the guest is rather than by how busy the venue was. Enrolled people only."
            explain={
              <ExplainDrawer
                label="How the segment timing grids are built"
                title="When each segment comes"
                showing={
                  <>
                    <p>
                      Two grids over the same population: which days a segment comes, and what time of day.
                      Every cell is a share of <strong>that segment&apos;s own</strong> visits or revenue, so
                      each row totals 100%.
                    </p>
                    <p>
                      <strong>Read across a row, never down a column.</strong> The rows are wildly different
                      sizes, so a column comparison is mostly a comparison of segment populations — which is
                      already answered on Overview.
                    </p>
                    <p>
                      A segment with too few visits to support a weekly shape is listed and left unshaded
                      rather than drawn. Shading a row built from a few dozen people says &quot;this is a
                      pattern&quot; about noise.
                    </p>
                  </>
                }
                made={
                  <>
                    <p>
                      Whole population, {win}, enrolled people only. Both axes are{" "}
                      <strong>venue-local</strong>: day of week and daypart come from the localised trading
                      timestamp, never from UTC, so a venue in another state buckets against its own clock.
                    </p>
                    <p>
                      Shading runs on a single scale across both tables, so a segment with a flat week looks
                      flat rather than being normalised into looking peaked.
                    </p>
                    <p>
                      Dayparts carrying under 0.5% of visits are not shown — a period the business does not
                      trade in is not a fact about a segment.
                    </p>
                    <p>
                      It is measured in the warehouse on everybody, and deliberately{" "}
                      <strong>not</strong> derived from the guest list this product ships to the browser.
                      That set over-selects high spenders and its coverage varies by segment from 97% to
                      53%, so a timing profile taken from it would describe the guests who were sampled
                      rather than the guests who came.
                    </p>
                  </>
                }
              />
            }
          >
            {segmentBehaviour && segmentBehaviour.length > 0 ? (
              <SegmentTiming rows={segmentBehaviour} dayparts={org.dayparts} />
            ) : (
              <EmptyState
                title="Not in this snapshot"
                body={
                  <>
                    <p>
                      Segment by day of week and daypart is extracted as its own query at whole-population
                      grain, and this snapshot predates it. It is in the extract now and appears on the next
                      refresh.
                    </p>
                    <p className="mt-2">
                      It is deliberately not derived from the guest list this product already ships to the
                      browser. That set over-selects high spenders and its coverage varies by segment from
                      97% to 53%, so a timing profile taken from it would describe the guests who were
                      sampled rather than the guests who came.
                    </p>
                  </>
                }
              />
            )}
          </Card>

          {/* ── §6.5 the member cohort lens, walled off ────────────────────
              `data-member-tier` marks the wall so `member.tierScopeDeclared`
              can find it in the built HTML. A member-tier figure that loses its
              scope launders a 19%-coverage, self-selected sample into a general
              one — and this build's own analysis puts 97% of the member gap
              down to selection rather than effect.

              R-217 specified that check and it was never written; a doc comment
              asserted it was live, which is the same prose-instead-of-control
              failure the extract refuses to commit with a lifecycle verdict. */}
          <section
            className="rounded-xl border-2 border-dashed"
            style={{ borderColor: "var(--tier-member)" }}
            data-member-tier
          >
            <header
              className="border-b border-line px-5 py-3.5"
              style={{ background: "color-mix(in srgb, var(--tier-member) 7%, transparent)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-ink">
                    Member retention over {cw ? cw.cohortCount : 21} months
                  </h2>
                  <Pill tone="member">Loyalty identity · a different population</Pill>
                </div>
                {/* ── BH-7: the mountain of text moves, the corrections do not ──
                    Five paragraphs of preamble before the chart and three
                    sections after it. What moves in here is the reconciliation
                    between the two member counts and the render rule — both are
                    *how this is built*.

                    What deliberately stays on the face: the clock-change banner
                    directly below, because it changes how every figure in this
                    section must be read, and "What we cannot yet tell you"
                    inside the lens, because the chart is liked precisely for the
                    thing it does not prove. The stack goes up because enrolment
                    outran churn, not because retention improved, and that
                    correction sits with the chart rather than behind a click —
                    otherwise this reads as a success story it does not
                    support. */}
                {cohorts && cw && (
                  <ExplainDrawer
                    label="How the retention section is built"
                    title="Member retention"
                    showing={
                      <>
                        <p>
                          Each band is the members who first scanned in one month. Its thickness at any
                          point is how many of them were still visiting that month, so{" "}
                          <strong>a band that narrows is an intake burning down</strong> and one that holds
                          its width is an intake that stuck.
                        </p>
                        <p>
                          Read the bottom band left to right to follow the oldest group you have. New
                          intakes stack on top as they join.
                        </p>
                      </>
                    }
                    made={
                      <>
                        <p>
                          <strong>Why there are more members here than on Overview.</strong> Overview counts{" "}
                          {count(snap.members.crossSection.member.people)} enrolled people{" "}
                          <em>seen in the {snap.org.window.days}-day payment-card window</em>. The cohorts
                          here count{" "}
                          {count(cohorts.cohorts.reduce((a, c) => a + c.members, 0))} people who have{" "}
                          <em>ever scanned</em> across {count(cw.observationDays)} days, including everybody
                          who stopped coming before that window opened. Neither is wrong and neither is a
                          subset you can subtract from the other.
                        </p>
                        <p>
                          <strong>Two window figures, and they measure different things.</strong> The
                          intakes span {count(cw.intakeSpanDays)} days from the first cohort&apos;s month to
                          the last cohort&apos;s month — {cw.cohortCount} monthly intakes. The{" "}
                          <em>observation</em> window runs to the close of that last month, which is{" "}
                          {count(cw.observationDays)} days. The second is the one the render rule is tested
                          against.
                        </p>
                        <p>
                          <strong>Why retention renders here and refuses above.</strong> A lapse-dependent
                          figure needs a window at least twice the lapse threshold, so that both states are
                          observable: {cohorts.grading.thresholdDays} days of silence to say somebody
                          lapsed, and another {cohorts.grading.thresholdDays} watching them beforehand to
                          say they did not. That is {cohorts.grading.requiredDays} days.{" "}
                          <strong>
                            This section has {count(cw.observationDays)} and clears it; the payment-card
                            window has {snap.org.window.days} and does not.
                          </strong>
                        </p>
                        <p>
                          The window is the earliest month whose loyalty scanning passes grading, not the
                          month the business started, and it grows by a month every month — so this chart
                          gets longer and the claims it can carry get stronger with time.
                        </p>
                      </>
                    }
                  />
                )}
              </div>

              {/* The clock-change banner stays. It is the reason the wall exists
                  and it changes how every figure below it must be read. */}
              <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                <strong className="text-ink">Everything below this line runs on a different clock.</strong>{" "}
                The figures above identify people by payment card over {snap.org.window.days} days and cover{" "}
                {pct(cov.identifiedRevenueShare, 1)} of revenue. These identify people by loyalty scan over{" "}
                {cw ? count(cw.observationDays) : "—"} days and cover roughly{" "}
                {cohorts ? pct(cohorts.coverage.at(-1)?.coverage ?? 0, 0) : "—"} of orders. They are not the
                same guests, and <strong className="text-ink">no figure here may be combined with a figure
                above it</strong>.
              </p>
            </header>
            <div className="p-5">
              {cohorts ? (
                <CohortLens cohorts={cohorts} />
              ) : (
                <EmptyState
                  tone="warning"
                  title="No cohort data in this snapshot"
                  body="The member cohort set is extracted per organisation rather than per card period, and this organisation predates it."
                />
              )}
            </div>
          </section>
        </div>
      </Page>
    </>
  );
}

/**
 * One daypart's change in share of trade, in percentage points.
 *
 * ── Points, not percent ────────────────────────────────────────────────────
 *
 * A daypart moving from 8.3% to 9.1% of trade has gained **0.8 points**, and
 * calling that "+9.6%" is true, useless and reliably misread as the daypart
 * having grown by a tenth. Both figures are already shares, so points is the
 * only unit in which the column adds up: the points across every row sum to
 * zero by construction, which is what makes it a statement about the shape of
 * the trading day rather than about volume.
 *
 * A daypart absent from the earlier period renders as an em-dash. It is not a
 * gain of 100 points — it is a period that did not exist to be compared, and
 * the two are different facts.
 */
function DensityChange({ now, before }: { now: number; before: number | null }) {
  if (before === null) {
    return (
      <td className="px-3 py-2 text-right text-ink-muted" title="Not traded in the earlier period">
        —
      </td>
    );
  }
  const points = (now - before) * 100;
  // Under a tenth of a point is noise at this precision and is drawn as flat
  // rather than as a signed number the reader would try to interpret.
  const flat = Math.abs(points) < 0.1;
  return (
    <td
      className="tnum px-3 py-2 text-right whitespace-nowrap"
      style={{ color: flat ? "var(--ink-muted)" : points > 0 ? "var(--good)" : "var(--loss)" }}
      title={`${pct(before, 1)} then, ${pct(now, 1)} now`}
    >
      {flat ? "flat" : `${points > 0 ? "+" : "−"}${Math.abs(points).toFixed(1)}pp`}
    </td>
  );
}

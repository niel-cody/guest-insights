import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Pill, Tile } from "@/components/ui/Primitives";
import { IconArrow } from "@/components/shell/Icons";
import { DayMatrix, type MatrixCell } from "@/components/charts/DayMatrix";
import { CohortLens } from "@/components/charts/CohortLens";
import { getPeriods, getAllOrgs, getSnapshot } from "@/lib/data";
import {
  count, coverageState, money, pct, tradingIdentity, windowShort, DAYPART_TRADE_FLOOR,
} from "@/lib/metrics";
import type { DaypartRow } from "@/lib/types";

export const dynamic = "force-static";

/** The three shadings the one grid supports. Order matters: density first. */
const VIEWS = [
  { key: "orders", label: "Order density", hue: "var(--accent)" },
  { key: "revenue", label: "Revenue density", hue: "var(--tier-card)" },
  { key: "member", label: "Member share", hue: "var(--tier-member)" },
] as const;

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
  const { org, dayparts, dayGrid, venueCross, network, cohorts } = snap;
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
      />
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
          {/* ── §6.1 trading identity ────────────────────────────────────── */}
          <Card
            title="What kind of business this trades as"
            subtitle={`Derived from ${count(totalOrders)} orders, ${win}. Not declared — read off the density distribution.`}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <Tile
                label="Trading identity"
                value={identity.archetype}
                accent="var(--accent)"
                footnote={
                  <>
                    {identity.reason}
                    <span className="mt-1 block text-ink-muted">
                      Card tier · {win} · archetype set from the Trade Density Framework
                    </span>
                  </>
                }
              />
              <Tile
                label="Confidence"
                value={pct(identity.confidence, 0)}
                accent={identity.confidence > 0.6 ? "var(--good)" : "var(--warning)"}
                footnote={
                  <>
                    {identity.primary.length} primary period{identity.primary.length === 1 ? "" : "s"} of{" "}
                    {identity.tradingPeriods} that carry trade
                    {identity.emptyPeriods.length > 0 && (
                      <span className="mt-1 block text-ink-muted">
                        Measured against the periods this business actually trades in. Against all{" "}
                        {identity.emptyPeriods.length + identity.tradingPeriods} it would read{" "}
                        {pct(identity.confidenceAgainstAllPeriods, 0)} — flattering, because it benchmarks a
                        café against a day it could never trade.
                      </span>
                    )}
                  </>
                }
              />
              <Tile
                label="Weekend share of trade"
                value={pct(dayparts.weekendBaseline, 1)}
                accent="var(--ink-muted)"
                footnote={
                  <>
                    baseline for reading the grid below
                    <span className="mt-1 block text-ink-muted">
                      Two of seven days is 28.6%. Far above it is a weekend-shaped business.
                    </span>
                  </>
                }
              />
            </div>
          </Card>

          {/* ── §6.2 the heatmap, above the table ────────────────────────── */}
          <Card
            title="The trading week"
            subtitle="Day of week against daypart, both in venue-local time. Three shadings of one grid."
          >
            {dayGrid ? (
              <div className="flex flex-col gap-8">
                {VIEWS.map((v) => {
                  const cells = new Map<string, MatrixCell>();
                  let max = 0;
                  for (const c of dayGrid.cells) {
                    const value =
                      v.key === "orders" ? c.orders
                        : v.key === "revenue" ? c.revenue
                          : c.orders ? c.memberOrders / c.orders : 0;
                    max = Math.max(max, value);
                    cells.set(`${c.dow}|${c.daypart}`, {
                      value,
                      label:
                        v.key === "member"
                          ? `${pct(value, 1)} member share · ${count(c.orders)} orders`
                          : v.key === "revenue"
                            ? `${money(c.revenue)} · ${count(c.orders)} orders`
                            : `${count(c.orders)} orders · ${money(c.revenue)}`,
                    });
                  }
                  return (
                    <div key={v.key}>
                      <h3 className="mb-2 text-[13px] font-semibold text-ink">{v.label}</h3>
                      <DayMatrix
                        // All eight periods, in clock order. The three the
                        // business does not trade in stay as columns here even
                        // though they fold to one line in the table below: a
                        // calendar with days missing is not a calendar, and a
                        // column of dashed no-trade cells says something real —
                        // that this café closes before dinner. Ink stays
                        // proportional because a no-trade cell is drawn as an
                        // outline rather than as a filled one.
                        columns={org.dayparts.map((d) => ({
                          key: d.key,
                          label: d.label,
                          sublabel: `${String(d.from).padStart(2, "0")}–${String(d.to % 24).padStart(2, "0")}`,
                        }))}
                        cells={cells}
                        max={max}
                        hue={v.hue}
                        population={
                          v.key === "member"
                            ? `Member share of orders · estate average ${pct(memberShareOverall, 1)}`
                            : `${count(totalOrders)} orders · ${money(totalRevenue)}`
                        }
                        window={`${win} · venue-local time`}
                      />
                    </div>
                  );
                })}
                <p className="max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
                  <strong className="text-ink-secondary">Both axes are venue-local.</strong> Day of week and
                  daypart are derived from the localised trading timestamp, not from UTC — a UTC derivation
                  moves Australian early-morning trade straight out of the column carrying{" "}
                  {count(dayparts.periods.find((d) => d.key === "breakfast")?.orders ?? 0)} orders, and does
                  it silently. Dayparts run in clock order and are never sorted by value: this is a calendar,
                  not a ranking. The precision layer is the table below, which <em>is</em> sorted by density.
                </p>
              </div>
            ) : (
              <EmptyState
                title="No day grid in this snapshot"
                body="The day-of-week by daypart cells are extracted separately. This snapshot predates them."
              />
            )}
          </Card>

          {/* ── the daypart table, the precision layer (§8 rule 6) ───────── */}
          <Card
            title="Dayparts, by density"
            subtitle="The precision layer under the grid. Sorted by order density, which the calendar above cannot be."
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="px-5 py-2.5 text-left font-medium">Daypart</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-3 py-2.5 text-right font-medium">Order density</th>
                    <th className="px-3 py-2.5 text-right font-medium">Revenue density</th>
                    <th className="px-3 py-2.5 text-right font-medium">Weekend</th>
                    <th className="px-3 py-2.5 text-right font-medium">Member share</th>
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
                          Guests <IconArrow className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {/* Folded, not dropped. The combined total is stated on the
                      closed line so a reader knows exactly what is inside. */}
                  {negligible.length > 0 && (
                    <tr className="border-b border-line last:border-b-0">
                      <td colSpan={7} className="px-5 py-2">
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
                    <td className="tnum px-3 py-2.5 text-right font-semibold">100.0%</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">{pct(dayparts.weekendBaseline, 1)}</td>
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

          {/* ── §6.4 cross-venue: three views, and nothing else ──────────── */}
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
                          background: `color-mix(in srgb, var(--tier-card) ${25 + i * 25}%, transparent)`,
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
                              style={{ background: `color-mix(in srgb, var(--tier-card) ${25 + i * 25}%, transparent)` }}
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
                                style={{ width: `${v.share * 100}%`, background: "var(--tier-card)" }}
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
          </Card>

          {/* ── §6.5 the member cohort lens, walled off ──────────────────── */}
          <section
            className="rounded-xl border-2 border-dashed"
            style={{ borderColor: "var(--tier-member)" }}
          >
            <header
              className="border-b border-line px-5 py-3.5"
              style={{ background: "color-mix(in srgb, var(--tier-member) 7%, transparent)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-ink">Member retention over 21 months</h2>
                <Pill tone="member">Member tier · a different population</Pill>
              </div>
              <p className="mt-1 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                <strong className="text-ink">Everything below this line runs on a different clock.</strong>{" "}
                The figures above identify people by payment card over {snap.org.window.days} days and cover{" "}
                {pct(cov.identifiedRevenueShare, 1)} of revenue. These identify people by loyalty scan over{" "}
                {cohorts ? count(cohorts.grading.days) : "—"} days and cover roughly{" "}
                {cohorts ? pct(cohorts.coverage.at(-1)?.coverage ?? 0, 0) : "—"} of orders. They are not the
                same guests, and <strong className="text-ink">no figure here may be combined with a figure
                above it</strong>.
              </p>
              <p className="mt-1.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
                Retention renders here and refuses above for one reason: the render rule is keyed on the
                tier. {cohorts ? count(cohorts.grading.days) : "—"} days against an{" "}
                {cohorts?.grading.thresholdDays ?? 90}-day threshold clears the {cohorts?.grading.requiredDays ?? 180}{" "}
                it needs; the card tier&apos;s {snap.org.window.days} does not.
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

import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, Facts, Pill, Tile } from "@/components/ui/Primitives";
import { IconArrow } from "@/components/shell/Icons";
import { getAllOrgs, getSnapshot } from "@/lib/data";
import {
  count, coverageState, delta, densityTier, money, pct, tradingIdentity, windowShort,
} from "@/lib/metrics";
import type { DaypartRow } from "@/lib/types";

export const dynamic = "force-static";

const TIER_STYLE: Record<string, { bg: string; fg: string }> = {
  PRIMARY: { bg: "var(--accent)", fg: "#fff" },
  SECONDARY: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  TERTIARY: { bg: "var(--surface-sunken)", fg: "var(--ink-secondary)" },
  WEAK: { bg: "transparent", fg: "var(--ink-muted)" },
};

function DensityCell({ share }: { share: number }) {
  const tier = densityTier(share);
  const s = TIER_STYLE[tier];
  return (
    <td className="px-3 py-2 text-right">
      <span
        className="tnum inline-flex min-w-[62px] items-center justify-end rounded-md px-2 py-1 text-[13px] font-medium"
        style={{ background: s.bg, color: s.fg }}
        title={tier}
      >
        {pct(share, 1)}
      </span>
    </td>
  );
}

export default async function TradePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const snap = await getSnapshot(slug);
  const orgs = await getAllOrgs();
  const { org, dayparts, members } = snap;
  const cov = coverageState(org, snap.coverage);
  const identity = tradingIdentity(dayparts);
  const w = dayparts.window;

  const totalOrders = dayparts.periods.reduce((a, d) => a + d.orders, 0);
  const totalRevenue = dayparts.periods.reduce((a, d) => a + d.revenue, 0);
  const memberShareOverall = totalOrders
    ? dayparts.periods.reduce((a, d) => a + d.memberOrders, 0) / totalOrders
    : 0;

  // Where members are under-represented against the trade they could be part of.
  // Only periods carrying real volume — a 40-order period with no members is not
  // an opportunity, it is a rounding error with an opinion.
  const MIN_ORDERS = Math.max(200, totalOrders * 0.02);
  const gaps = dayparts.periods
    .filter((d) => d.orders >= MIN_ORDERS && d.memberShare < memberShareOverall)
    .map((d) => ({
      ...d,
      shortfallOrders: Math.round(d.orders * (memberShareOverall - d.memberShare)),
      shortfall: memberShareOverall - d.memberShare,
    }))
    .sort((a, b) => b.shortfallOrders - a.shortfallOrders);

  const basketGap = (d: DaypartRow) =>
    d.avgOrderCard > 0 && d.memberOrders > 0 ? d.avgOrderMember / d.avgOrderCard - 1 : null;

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Trade density"
        coverage={cov}
      />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <Card
            title="What kind of business this trades as"
            subtitle={`Derived from ${count(totalOrders)} orders across eight standard dayparts, ${windowShort(w)}.`}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <Tile
                label="Trading identity"
                value={identity.archetype}
                hint="Derived from the density distribution, not declared. The archetype set is the Trade Density Framework's."
                accent="var(--accent)"
                footnote={identity.reason}
              />
              <Tile
                label="Confidence"
                value={pct(identity.confidence, 0)}
                hint="How much of the shape the classification actually accounts for, discounted when two periods are near-equal."
                accent={identity.confidence > 0.6 ? "var(--good)" : "var(--warning)"}
                footnote={`${identity.primary.length} primary period${identity.primary.length === 1 ? "" : "s"}`}
              />
              <Tile
                label="Weekend share of trade"
                value={pct(dayparts.weekendBaseline, 1)}
                hint="Baseline for reading the weekend column below. Two of seven days is 28.6%; anything far above it is a weekend-shaped period."
                accent="var(--ink-muted)"
                footnote="baseline for the column below"
              />
            </div>
          </Card>

          <Card
            title="Density and who is in the room"
            subtitle="Order density, revenue density, and the member share of each period. Every row opens the guests behind it."
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="px-5 py-2.5 text-left font-medium">Daypart</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-3 py-2.5 text-right font-medium">Order density</th>
                    <th className="px-3 py-2.5 text-right font-medium">Revenue density</th>
                    <th className="px-3 py-2.5 text-right font-medium">Weekend</th>
                    <th className="px-3 py-2.5 text-right font-medium">Members</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Member basket
                      <span className="ml-1 font-normal normal-case text-ink-muted">vs non-member</span>
                    </th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {dayparts.periods.map((d) => {
                    const gap = basketGap(d);
                    return (
                      <tr key={d.key} className="border-b border-line last:border-b-0 hover:bg-surface-hover">
                        <th scope="row" className="px-5 py-2 text-left font-medium text-ink">
                          {d.label}
                          <span className="tnum ml-2 text-[12px] font-normal text-ink-muted">
                            {String(d.from).padStart(2, "0")}:00–{String(d.to % 24).padStart(2, "0")}:00
                          </span>
                        </th>
                        <td className="tnum px-3 py-2 text-right text-ink-secondary">{count(d.orders)}</td>
                        <DensityCell share={d.orders / totalOrders} />
                        <DensityCell share={d.revenue / totalRevenue} />
                        <td
                          className="tnum px-3 py-2 text-right"
                          style={{
                            color:
                              d.weekendShare > dayparts.weekendBaseline * 1.4
                                ? "var(--accent)"
                                : "var(--ink-secondary)",
                          }}
                        >
                          {pct(d.weekendShare, 1)}
                        </td>
                        <td className="tnum px-3 py-2 text-right text-ink-secondary">{pct(d.memberShare, 1)}</td>
                        <td className="tnum px-3 py-2 text-right">
                          {gap === null || d.memberOrders < 30 ? (
                            <span className="text-ink-muted" title="Too few member orders in this period to compare">
                              —
                            </span>
                          ) : (
                            <span className="text-ink">
                              {money(d.avgOrderMember)}{" "}
                              <span className="text-ink-muted">{delta(gap)}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2 text-right">
                          <Link
                            href={`/${org.slug}/guests?daypart=${d.key}`}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                          >
                            Guests <IconArrow className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line-strong bg-surface-sunken text-ink">
                    <th scope="row" className="px-5 py-2.5 text-left font-semibold">All trade</th>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">{count(totalOrders)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">100.0%</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">100.0%</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">{pct(dayparts.weekendBaseline, 1)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold">{pct(memberShareOverall, 1)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3 text-[12px] text-ink-secondary">
              <span className="font-medium text-ink">Density tiers</span>
              {(["PRIMARY", "SECONDARY", "TERTIARY", "WEAK"] as const).map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-[3px] border border-line"
                    style={{ background: TIER_STYLE[t].bg }}
                  />
                  {t} {t === "PRIMARY" ? "≥25%" : t === "SECONDARY" ? "15–24%" : t === "TERTIARY" ? "5–14%" : "<5%"}
                </span>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Where your members are not"
              subtitle={`Periods running below the ${pct(memberShareOverall, 1)} member share the business averages.`}
            >
              {gaps.length === 0 ? (
                <p className="text-[13px] leading-relaxed text-ink-secondary">
                  No period with meaningful volume runs below the estate average. Member penetration is even
                  across the trading day, which means enrolment is not being lost to a particular shift.
                </p>
              ) : (
                <>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                        <th className="py-2 text-left font-medium">Period</th>
                        <th className="py-2 text-right font-medium">Members</th>
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
                          <td className="tnum py-2 text-right text-ink">{count(g.shortfallOrders)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                    &quot;Orders behind&quot; is how many more orders in that period would carry a member if it
                    ran at the business average. It is a gap in <em>recognition</em>, not proof of a gap in
                    loyalty — a shift that never asks is indistinguishable here from a shift whose guests decline.
                    The Coverage screen names which one it is per venue.
                  </p>
                </>
              )}
            </Card>

            <Card
              title="Why a single member premium misleads"
              subtitle="The gap between members and everyone else is not constant across the day."
            >
              <Facts
                rows={[
                  [
                    "Crude basket gap",
                    <span key="c" className="tnum">{delta(members.standardisedBasket.crude.lift, 1)}</span>,
                  ],
                  [
                    "Standardised to a common daypart mix",
                    <span key="s" className="tnum">{delta(members.standardisedBasket.lift, 1)}</span>,
                  ],
                  [
                    "Difference the mix was hiding",
                    <span key="d" className="tnum">
                      {delta(members.standardisedBasket.lift - members.standardisedBasket.crude.lift, 1)}
                    </span>,
                  ],
                  [
                    "Trade the standardisation covers",
                    <span key="v" className="tnum">{pct(members.standardisedBasket.coverage, 1)}</span>,
                  ],
                ]}
              />
              <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                Members do not eat at the same times as everybody else, so a pooled average measures{" "}
                <em>when they come</em> as much as what they are worth. Re-weighting both groups to the same
                daypart mix removes that. The difference between the two figures is the size of the confound —
                small here, and worth showing precisely because it is small: it is evidence the headline is not
                a timing artefact.
              </p>
              {members.standardisedBasket.dropped.length > 0 && (
                <p className="mt-3 text-[12px] text-ink-muted">
                  {members.standardisedBasket.dropped.join(" and ")} excluded — too few orders on one side to
                  compare.
                </p>
              )}
            </Card>
          </div>

          <Card title="The vocabulary" subtitle="Eight periods, evaluated in venue local time.">
            <div className="flex flex-wrap gap-2">
              {org.dayparts.map((d) => (
                <Pill key={d.key}>
                  {d.label} · {String(d.from).padStart(2, "0")}:00–{String(d.to % 24).padStart(2, "0")}:00
                </Pill>
              ))}
            </div>
            <p className="mt-4 max-w-[85ch] text-[13px] leading-relaxed text-ink-secondary">
              These are the Trade Density Framework&apos;s standard periods and they are the common time
              vocabulary across Oolio reporting, not a local invention — which is the point of using them for a
              cafe and a restaurant that share nothing else. Windows are evaluated in each venue&apos;s local
              time; using the unlocalised timestamp shifts a Sydney dinner into Late Evening and does it silently.
            </p>
          </Card>
        </div>
      </Page>
    </>
  );
}

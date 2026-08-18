import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Pill, Tile } from "@/components/ui/Primitives";
import { ExplainDrawer } from "@/components/ui/ExplainDrawer";
import { TeamDrivers } from "@/components/charts/TeamDrivers";
import { getPeriods, getSnapshot } from "@/lib/data";
import { teamChecks } from "@/lib/checks";
import { count, money, pct, windowShort } from "@/lib/metrics";
import { WEEKDAYS } from "@/lib/weekdays";
import {
  MIN_DAYS_FOR_RATING, MIN_ORDERS_FOR_RATING, VERDICT_LABEL, VERDICT_TONE,
  ratedPeople, rateable, spread,
} from "@/lib/team";
import type { TeamPerson } from "@/lib/types";
import { Unavailable } from "../Unavailable";
import { Standfirst } from "../Standfirst";

export const dynamic = "force-static";
export const metadata = { title: "Performance" };

const num = (v: number | null, dp = 2) => (v == null ? "—" : v.toFixed(dp));

/**
 * Performance. Who is doing well, and — the part nobody else builds — **why**.
 *
 * ── The report refuses to lead with a total ────────────────────────────────
 *
 * The shipped Staff Scorecard league table ranks on net sales. That figure
 * measures the roster: the person at the top worked the most Saturday dinners.
 * It is the denominator problem, and it is the reason a staff report gets one
 * argument from one staff member and is never opened again.
 *
 * So every column here is a rate. Per cover, because that is what a server
 * actually influences at a table. Per labour hour, wherever the identity spine
 * can stand behind the join — which is what the whole People page exists to
 * establish, and which is the metric the market names and cannot compute.
 *
 * ── And it refuses to rank the people it cannot measure ────────────────────
 *
 * Anyone below the evidence floor is listed as **unrated**, never as last. A new
 * starter with four shifts ranked bottom is a report making a claim about
 * somebody's job that the data cannot support, and it is the single fastest way
 * to make a venue stop trusting the product.
 */
export default async function TeamPerformancePage({
  params,
}: {
  params: Promise<{ org: string; period: string }>;
}) {
  const { org: slug, period } = await params;
  const [snap, periods] = await Promise.all([getSnapshot(slug, period), getPeriods(slug)]);
  const { org, team } = snap;
  // The badge on a Team page counts the Team invariants, not the customer half's.
  // A register that travels between sections tells a reader that six checks pass
  // without saying six checks on what.
  const checks = teamChecks(snap);
  const current = periods.periods.find((p) => p.id === period)!;
  const header = (
    <PageHeader
      org={org}
      periods={periods}
      period={current}
      title="Performance"
      section="Team"
      checks={checks.length ? checks : undefined}
    />
  );

  if (!team) {
    return (
      <>
        {header}
        <Page>
          <EmptyState title="This snapshot predates the team extract" body="Re-run `npm run extract -- --team`." />
        </Page>
      </>
    );
  }
  if (!team.available) {
    return (
      <>
        {header}
        <Page>
          <Unavailable team={team} orgName={org.name} />
        </Page>
      </>
    );
  }

  const win = windowShort(team.window);
  const rated = ratedPeople(team);
  const sellers = [...rated].sort((a, b) => (b.netPerCover ?? 0) - (a.netPerCover ?? 0));
  const unrated = team.people.filter(
    (p) => p.verdict !== "not-a-person" && p.orders > 0 && !rateable(p),
  );
  const costed = rated.filter((p) => p.netPerHour != null);

  const attach = spread(rated, (p) => p.itemsPerCover);
  const tradeUp = spread(rated, (p) => p.avgItemValue);
  const perCover = spread(rated, (p) => p.netPerCover);
  const perHour = spread(costed, (p) => p.netPerHour);

  /** The one sentence the decomposition supports, derived rather than asserted. */
  const driver =
    attach && tradeUp && attach.ratio && tradeUp.ratio
      ? attach.ratio > tradeUp.ratio * 1.5
        ? "attachment"
        : tradeUp.ratio > attach.ratio * 1.5
          ? "trading up"
          : null
      : null;

  return (
    <>
      {header}
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
          <Standfirst
            question="How effectively is the team turning labour into sales?"
            body={
              <>
                {win}. Every column here is a rate, never a total — a total ranks people by the hours they
                were given. Below the figures, the decomposition says <em>which</em> of the two
                things a seller does differently, which is the part a manager can coach.
              </>
            }
          />

          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Rated"
              value={count(rated.length)}
              detail={`${count(unrated.length)} below the floor, listed unrated`}
              meta={`${MIN_ORDERS_FOR_RATING}+ orders across ${MIN_DAYS_FOR_RATING}+ days`}
              info={
                <p>
                  Both thresholds, because either alone is gamed by the shape of a roster: fifty
                  orders on one enormous Saturday is a single observation of a single shift, and five
                  days of two orders each measures nothing. Anyone below is listed and marked, never
                  ranked last.
                </p>
              }
            />
            <Tile
              label="Net per cover"
              value={perCover ? money(perCover.median) : "—"}
              detail={perCover ? `${money(perCover.lo)} to ${money(perCover.hi)} across the team` : undefined}
              meta="Median of the rated team — what one guest spends with them"
            />
            {/* The KPI carries the figure; the coverage carries the population.
                It used to carry a two-line footnote naming both, which made the
                least important sentence on the card the largest thing on it. The
                population stays on the face — it is part of the figure, not an
                explanation of it — but as line 4 in eight words rather than as a
                paragraph, and the reasoning moves behind the button. */}
            <Tile
              label="Sales per labour hour"
              value={perHour ? money(perHour.median) : "Not published"}
              accent="var(--accent)"
              refused={!perHour}
              detail={perHour ? `${money(perHour.lo)} to ${money(perHour.hi)} across the team` : undefined}
              meta={
                perHour
                  ? `Median of ${count(costed.length)} of ${count(rated.length)} rated people`
                  : "No identity link the spine can stand behind"
              }
              info={
                <>
                  <p>
                    One person&rsquo;s own net sales over their own worked hours. Available only
                    where the identity link is good enough to divide one system by the other —{" "}
                    {count(rated.length - costed.length)} rated people have no such link, and the{" "}
                    <strong>People</strong> report says which and why.
                  </p>
                  <p>
                    <strong>This is not the venue figure and does not compare to it.</strong> Margin
                    divides all net sales by <em>all</em> worked hours, kitchen included —{" "}
                    {money(team.totals.netPerHour)} across this window. A kitchen hand rings nothing,
                    so a per-person figure is necessarily the larger of the two. The venue figure is
                    what an hour of labour returns; this is what an hour of a given person&rsquo;s
                    labour returns while they are on the floor.
                  </p>
                </>
              }
            />
            <Tile
              label="Gross profit per person"
              value="—"
              refused
              accent="var(--warning)"
              meta={`Cost of goods recorded on ${pct(team.integrity.costCoverage)} of orders`}
              info={
                <p>
                  A margin per head struck against a field that is{" "}
                  {pct(1 - team.integrity.costCoverage)} empty would be confident and wrong, so it is
                  refused rather than approximated. This is a menu-costing problem, not a reporting
                  one.
                </p>
              }
            />
          </div>

          {/* ── the why ───────────────────────────────────────────────────── */}
          <Card
            title="Why one outperforms another"
            subtitle="Revenue per cover is items per cover multiplied by average item value. Only one of those two varies here."
            explain={
              <ExplainDrawer
                label="How the decomposition is built"
                title="Why one outperforms another"
                showing={
                  <>
                    <p>
                      Two axes, one point per rated person. Left to right is{" "}
                      <strong>attachment</strong> — how many things reach the table per guest. Bottom
                      to top is <strong>trading up</strong> — what each of those things is worth.
                      Multiply them and you have revenue per cover.
                    </p>
                    <p>
                      Both axes are scaled to the same proportional span around their own median, so
                      the two spreads can be compared by eye. A wide, flat cloud means the team
                      differs on attachment and not on price point.
                    </p>
                  </>
                }
                made={
                  <p>
                    Both terms are computed on the same covers: orders that recorded a party size,{" "}
                    {pct(
                      team.people.reduce((a, p) => a + p.ordersWithCovers, 0) /
                        Math.max(1, team.people.reduce((a, p) => a + p.orders, 0)),
                    )}{" "}
                    of trade here. Neither term is modelled and neither is adjusted — they multiply
                    back to net per cover exactly.
                  </p>
                }
              />
            }
          >
            {driver && attach && tradeUp && (
              <p className="mb-4 max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
                Across the {count(rated.length)} rated people, items per cover runs{" "}
                <strong className="text-ink">{num(attach.lo)} to {num(attach.hi)}</strong> — a factor
                of {attach.ratio!.toFixed(2)} — while average item value runs{" "}
                <strong className="text-ink">
                  {money(tradeUp.lo)} to {money(tradeUp.hi)}
                </strong>
                , a factor of {tradeUp.ratio!.toFixed(2)}.{" "}
                <strong className="text-ink">
                  The difference between sellers at {org.name} is {driver}, not{" "}
                  {driver === "attachment" ? "trading up" : "attachment"}.
                </strong>{" "}
                Everybody sells much the same things at much the same price; the spread is in how
                much of it reaches the table.
              </p>
            )}
            <TeamDrivers people={rated} />
          </Card>

          {/* ── the table ─────────────────────────────────────────────────── */}
          <Card
            title="The rated team"
            subtitle="Ordered on net sales per cover. Every column is a rate — no column here is a total, because a total ranks people by the hours they were given."
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="px-5 py-2.5 font-medium">Person</th>
                    <th className="px-3 py-2.5 font-medium">Section</th>
                    <th className="px-3 py-2.5 text-right font-medium">Net / cover</th>
                    <th className="px-3 py-2.5 text-right font-medium">Items / cover</th>
                    <th className="px-3 py-2.5 text-right font-medium">Avg item</th>
                    <th className="px-3 py-2.5 text-right font-medium">Covers / hr</th>
                    <th className="px-3 py-2.5 text-right font-medium">Net / labour hr</th>
                    <th className="px-5 py-2.5 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-b-0">
                      <td className="px-5 py-2.5">
                        <span className="font-medium text-ink">{p.label}</span>
                        <span className="block text-[12px] text-ink-muted">
                          {count(p.covers)} covers · {count(p.days)} days
                          {p.employmentType ? ` · ${p.employmentType}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-secondary">{p.section}</td>
                      <td className="tnum px-3 py-2.5 text-right font-medium text-ink">
                        {p.netPerCover == null ? "—" : money(p.netPerCover)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink">{num(p.itemsPerCover)}</td>
                      <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                        {p.avgItemValue == null ? "—" : money(p.avgItemValue)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                        {num(p.coversPerHour, 1)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink">
                        {p.netPerHour == null ? (
                          <span className="text-ink-muted">not costed</span>
                        ) : (
                          money(p.netPerHour)
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        <Pill tone={VERDICT_TONE[p.verdict]}>{VERDICT_LABEL[p.verdict]}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── when each person is strongest ─────────────────────────────── */}
          <PersonByDay people={sellers} />

          {/* ── the unrated ───────────────────────────────────────────────── */}
          {unrated.length > 0 && (
            <Card
              title="Below the evidence floor"
              subtitle={`Listed, not ranked. ${MIN_ORDERS_FOR_RATING} orders across ${MIN_DAYS_FOR_RATING} days is the minimum this build will draw a conclusion from.`}
            >
              <div className="flex flex-wrap gap-2">
                {unrated
                  .sort((a, b) => b.orders - a.orders)
                  .map((p) => (
                    <span
                      key={p.id}
                      className="rounded-lg border border-line bg-surface-sunken px-2.5 py-1.5 text-[12px] text-ink-secondary"
                    >
                      <span className="font-medium text-ink">{p.label}</span> · {count(p.orders)}{" "}
                      order{p.orders === 1 ? "" : "s"} · {count(p.days)} day{p.days === 1 ? "" : "s"}
                    </span>
                  ))}
              </div>
              <p className="mt-3 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                A new starter placed last on four shifts is a claim about their job that this data
                cannot support. They appear here so the roll is complete and so a manager can see
                who is still ramping, and they carry no score.
              </p>
            </Card>
          )}

          {/* ── the boundary of the claim ─────────────────────────────────── */}
          <Card title="What this report does not adjust for">
            <p className="max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              Every rate here is <strong className="text-ink">unnormalised</strong>. A dead Tuesday
              lunch and a full Saturday dinner count the same, and they are not the same job — the
              spread between two people on comparable shifts is smaller than the spread between two
              shifts for the same person. The honest reading of this table is{" "}
              <em>who differs, and on which term</em>, not a ranking of ability.
            </p>
            <p className="mt-2.5 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              Net per labour hour here is <strong className="text-ink">a person against their own
              hours</strong>, and it is not the venue&rsquo;s {money(team.totals.netPerHour)}. That
              figure divides all sales by all hours including a kitchen that rings none, so the two
              are different measures and one is not a share of the other. Comparing a server&rsquo;s
              figure to the venue&rsquo;s says only that servers ring orders and chefs do not.
            </p>
            <p className="mt-2.5 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              Comparing each person against what the shift they actually worked warranted needs a
              difficulty model, and that model needs a definition of shift difficulty this build does
              not have. Until it exists, the section below — which of their own shifts each person is
              strongest on — is the comparison that carries the least of this problem, because it
              compares a person only to themselves.
            </p>
          </Card>
        </div>
      </Page>
    </>
  );
}

/**
 * Each person against their own best day, never against each other's.
 *
 * ── Why this comparison and not a cross-person one ─────────────────────────
 *
 * "Your attachment is 3.9 at lunch and 3.1 at dinner" is a coaching sentence
 * that needs no difficulty model, no peer group and no normalisation, because
 * the person is the control. They already know how to do the higher number. It
 * is the strongest object on this page and the only one that survives the
 * caveat in the panel above it.
 *
 * It also answers the rostering question directly: if somebody is reliably
 * better on one service, that is a shift-assignment fact rather than a
 * performance verdict.
 */
function PersonByDay({ people }: { people: TeamPerson[] }) {
  const rows = people
    .map((p) => {
      const byDow = new Map<number, { covers: number; items: number; net: number }>();
      for (const [dow, , , net, items, covers] of p.grain) {
        const cur = byDow.get(dow) ?? { covers: 0, items: 0, net: 0 };
        cur.covers += covers; cur.items += items; cur.net += net;
        byDow.set(dow, cur);
      }
      // A day with a handful of covers produces a spectacular ratio and means
      // nothing. Twenty is the floor for drawing a cell at all.
      const cells = WEEKDAYS.map((d) => {
        const v = byDow.get(d.dow);
        return v && v.covers >= 20 ? { dow: d.dow, value: v.items / v.covers, covers: v.covers } : null;
      });
      const present = cells.filter((c): c is NonNullable<typeof c> => c != null);
      if (present.length < 3) return null;
      const best = present.reduce((a, b) => (b.value > a.value ? b : a));
      const worst = present.reduce((a, b) => (b.value < a.value ? b : a));
      return { p, cells, best, worst, gap: best.value - worst.value };
    })
    .filter((r): r is NonNullable<typeof r> => r != null)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 12);

  if (!rows.length) return null;

  /**
   * The colour scale is clamped to the 5th and 95th percentile, not to the
   * extremes.
   *
   * One cell on this grid reads 10.61 items per cover — a real Sunday where
   * large tables under-recorded their party size — against a body of values
   * between 2.4 and 4.7. Scaling to the maximum compresses every genuine
   * difference into the bottom fifth of the ramp and the grid becomes one flat
   * colour, which is the failure mode that makes a heat map decorative. Values
   * outside the clamp still render, at the end of the ramp; they are not hidden,
   * they just stop setting the scale for everybody else.
   */
  const all = rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c!.value)).sort((a, b) => a - b);
  const at = (q: number) => all[Math.min(all.length - 1, Math.max(0, Math.round(q * (all.length - 1))))];
  const lo = at(0.05);
  const hi = at(0.95);
  const shade = (v: number) =>
    0.12 + Math.min(1, Math.max(0, (v - lo) / Math.max(1e-9, hi - lo))) * 0.72;

  return (
    <Card
      title="Each person against their own week"
      subtitle="Items per cover by day of week. Read across a row, never down a column — this compares a person to themselves, which is the only comparison here that needs no difficulty model."
      padded={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
              <th className="px-5 py-2.5 text-left font-medium">Person</th>
              {WEEKDAYS.map((d) => (
                <th key={d.dow} className="px-2 py-2.5 text-center font-medium">{d.label}</th>
              ))}
              <th className="px-5 py-2.5 text-right font-medium">Own spread</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, cells, best, worst, gap }) => (
              <tr key={p.id} className="border-b border-line last:border-b-0">
                <td className="px-5 py-2 font-medium whitespace-nowrap text-ink">{p.label}</td>
                {cells.map((c, idx) => (
                  <td key={WEEKDAYS[idx].dow} className="px-2 py-2 text-center">
                    {c ? (
                      <span
                        className="tnum inline-block min-w-[46px] rounded-md px-1.5 py-1 text-[12px]"
                        style={{
                          background: `color-mix(in srgb, var(--accent) ${shade(c.value) * 100}%, transparent)`,
                          color: shade(c.value) > 0.5 ? "white" : "var(--ink)",
                        }}
                        title={`${c.covers} covers`}
                      >
                        {c.value.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-muted">·</span>
                    )}
                  </td>
                ))}
                <td className="tnum px-5 py-2 text-right text-ink-secondary">
                  +{gap.toFixed(2)}
                  <span className="block text-[11px] text-ink-muted">
                    {WEEKDAYS.find((d) => d.dow === best.dow)?.long} over{" "}
                    {WEEKDAYS.find((d) => d.dow === worst.dow)?.long}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[12px] leading-relaxed text-ink-secondary">
        Twelve people with the widest spread across their own week, and only days carrying at least
        20 covers are drawn — a Tuesday with four covers produces a spectacular ratio and means
        nothing. A dot is a day below that floor.
      </p>
    </Card>
  );
}

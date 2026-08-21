import { PageHeader, Page } from "@/components/shell/PageHeader";
import { SpineChip } from "@/components/shell/SpineChip";
import { Card, EmptyState, Facts, Pill, Tile } from "@/components/ui/Primitives";
import { ExplainDrawer } from "@/components/ui/ExplainDrawer";
import { getPeriods, getSnapshot } from "@/lib/data";
import { teamChecks } from "@/lib/checks";
import { count, dayLabel, money, monthLabel, pct, windowShort } from "@/lib/metrics";
import { WEEKDAYS } from "@/lib/weekdays";
import {
  MIN_INSTANCES_FOR_NORM, cellsFor, exceptions, totalCells, wageBand, weekdayNorms,
  type DayServiceCell,
} from "@/lib/team";
import type { Team, TeamMarginCell } from "@/lib/types";
import { MarginGrains, type Grain } from "./MarginGrains";
import { Unavailable } from "../Unavailable";
import { Standfirst } from "@/components/shell/Standfirst";

export const dynamic = "force-static";
export const metadata = { title: "Margin" };

/**
 * Margin. **Where the team is working efficiently, and when.**
 *
 * ── The order of the page is the argument ──────────────────────────────────
 *
 * Question, headline, comparison, attention, detail, method. The wage
 * percentage lands first because it is what an operator came for; the trading
 * week comes next because that single number conceals the thing that matters;
 * the exceptions come third because they are the only part anybody can act on
 * this week; and the method — why a clock hour carries no ratio — sits below the
 * detail, because it explains the page rather than being read from it.
 *
 * ── Margin here means margin after labour ──────────────────────────────────
 *
 * Not gross margin. Cost of goods is recorded on a fraction of orders, so there
 * is no food cost to subtract and no honest way to invent one. Every figure is
 * net sales minus wage cost, named in full wherever it appears rather than
 * shortened to "margin" and quietly misread as the other thing.
 *
 * **Whether the page should still be called Margin is a live question and is
 * not settled here** — see `docs/team-recommendations.md`. Renaming a report has
 * a URL, a nav item and a customer's muscle memory behind it, and that is not a
 * decision to take silently inside a refinement pass.
 */
export default async function TeamMarginPage({
  params,
}: {
  params: Promise<{ org: string; period: string }>;
}) {
  const { org: slug, period } = await params;
  const [snap, periods] = await Promise.all([getSnapshot(slug, period), getPeriods(slug)]);
  const { org, team } = snap;
  const checks = teamChecks(snap);
  const current = periods.periods.find((p) => p.id === period)!;

  const header = (
    <PageHeader
      org={org}
      periods={periods}
      period={current}
      title="Margin"
      section="Team"
      checks={checks.length ? checks : undefined}
      actions={team ? <SpineChip team={team} orgSlug={slug} period={period} /> : undefined}
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
  const t = team.totals;
  const all = <C extends TeamMarginCell>(cells: C[]): C[] => cellsFor(cells, "all");

  const groups = all(team.margin.service);
  const dayParts = all(team.margin.daypart);
  const serviceDow = all(team.margin.serviceDow);

  const grains: Grain[] = [
    { key: "daypart", label: "Day part", heading: "Day part", cells: dayParts, groups },
    {
      key: "dow",
      label: "Weekday",
      heading: "Weekday",
      cells: [...all(team.margin.dow)].sort(
        (a, b) => ((Number(a.key) + 6) % 7) - ((Number(b.key) + 6) % 7),
      ),
    },
    {
      key: "week",
      label: "Week",
      heading: "Week",
      cells: all(team.margin.week).map((c) => ({ ...c, label: `Week of ${dayLabel(c.key)}` })),
    },
    {
      key: "month",
      label: "Month",
      heading: "Month",
      cells: all(team.margin.month).map((c) => ({ ...c, label: monthLabel(`${c.key}-01`, true) })),
    },
    {
      key: "day",
      label: "Day",
      heading: "Trading day",
      cells: all(team.margin.day).map((c) => ({ ...c, label: dayLabel(c.key) })),
    },
  ];

  const worst = [...groups].sort((a, b) => (b.wagePct ?? 0) - (a.wagePct ?? 0))[0];
  const best = [...groups].sort((a, b) => (a.wagePct ?? 1) - (b.wagePct ?? 1))[0];

  const norms = weekdayNorms(all(team.margin.dayService) as DayServiceCell[]);
  const flagged = exceptions(norms);
  const overPlan = t.labour - t.plannedLabour;
  const band = wageBand(t.wagePct);
  const tone = band?.tone === "good" ? "good" : (band?.tone ?? "warning");

  return (
    <>
      {header}
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
          <Standfirst
            question="Where is the team working efficiently, and when?"
            body={
              <>
                Wage cost against the trade it produced, {win}. The window total is one number and it
                hides the answer — read the trading week under it, then the handful of days that
                fell outside what their own weekday normally does.
              </>
            }
          />

          {/* ── headline ──────────────────────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Wage percentage"
              value={pct(t.wagePct, 1)}
              accent={`var(--${tone})`}
              detail={`${money(t.labour)} labour · ${money(t.net)} net sales`}
              meta={`Leave excluded, ${win}`}
            />
            <Tile
              label="After labour"
              value={money(t.margin)}
              detail={`${pct(1 - t.wagePct, 1)} of net sales survives the wage bill`}
              meta="Wage cost only — no food cost subtracted"
            />
            <Tile
              label="Sales per labour hour"
              value={money(t.netPerHour)}
              detail={`${count(t.hours)} hours worked`}
              meta={`${count(org.venues.length)} venue${org.venues.length === 1 ? "" : "s"}`}
            />
            <Tile
              label="Against the roster"
              value={`${overPlan > 0 ? "+" : "−"}${money(Math.abs(overPlan))}`}
              accent={overPlan > 0 ? "var(--warning)" : "var(--good)"}
              detail={`${money(t.labour)} worked · ${money(t.plannedLabour)} planned`}
              meta={`${pct(Math.abs(overPlan) / Math.max(1, t.plannedLabour), 1)} ${overPlan > 0 ? "over" : "under"} plan`}
            />
          </div>

          {/* ── comparison ────────────────────────────────────────────────── */}
          {worst?.wagePct != null && best?.wagePct != null && (
            <TradingWeek
              cells={serviceDow}
              worst={worst}
              best={best}
              orgName={org.name}
              wagePct={t.wagePct}
            />
          )}

          {/* ── attention ─────────────────────────────────────────────────── */}
          <Exceptions flagged={flagged} norms={norms} total={all(team.margin.dayService).length} />

          {/* ── detail ────────────────────────────────────────────────────── */}
          <Card
            title="Cost against return"
            subtitle="The same window, cut five ways. Every grain reads the same sales and the same labour."
            padded={false}
            explain={
              <ExplainDrawer
                label="How the grain table is built"
                title="Cost against return"
                showing={
                  <>
                    <p>
                      <strong>Wage %</strong> is labour over net sales; <strong>after labour</strong>{" "}
                      is what is left once the wage bill is paid. The bar is scaled against a fixed
                      35% ceiling on every grain and every venue, so a bar length means the same thing
                      wherever you read it, and a row running past the end of its track is telling
                      you something true.
                    </p>
                    <p>
                      On the day part grain the <strong>ratio sits on the service row</strong>, not on
                      the day parts underneath it. Every figure on a service row is the sum of the
                      rows drawn beneath it.
                    </p>
                  </>
                }
                made={
                  <>
                    <p>
                      Net sales is ex-tax. Labour is award plus allowance; {money(t.leave)} of leave
                      is excluded because it is paid and not worked. Hours come from award segments
                      only — an allowance row mirrors the hours of the shift it hangs off, so counting
                      them again would inflate every per-hour figure.
                    </p>
                    <p>
                      A shift is apportioned to the minute across the day parts it spans, so a shift
                      from five to eleven is counted in both the hours it worked. Every grain sums to
                      the same window total; switching grain re-cuts the same money and never
                      re-measures it.
                    </p>
                    <p>
                      The total row divides summed labour by summed sales.{" "}
                      <strong>A wage percentage is never the average of wage percentages.</strong>
                    </p>
                  </>
                }
              />
            }
          >
            <MarginGrains grains={grains} initial="daypart" />
          </Card>

          <WageBill team={team} />

          {/* ── method ────────────────────────────────────────────────────── */}
          <ClockShape cells={dayParts} />
        </div>
      </Page>
    </>
  );
}

/**
 * The week as a grid: two services down, seven days across.
 *
 * The whole argument in one object. A flat wage target draws one line across
 * every cell; the grid shows the cells are not alike, and that the expensive
 * ones cluster — which is a rostering decision rather than a performance
 * problem.
 */
function TradingWeek({
  cells, worst, best, orgName, wagePct,
}: {
  cells: (TeamMarginCell & { dow: number; service: string })[];
  worst: TeamMarginCell;
  best: TeamMarginCell;
  orgName: string;
  wagePct: number;
}) {
  const order = ["daytime", "evening"];
  const services = [...new Set(cells.map((c) => c.service))].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
  const get = (dow: number, service: string) =>
    cells.find((c) => c.dow === dow && c.service === service);
  const ratio = best.wagePct ? (worst.wagePct ?? 0) / best.wagePct : null;

  return (
    <Card
      title="The trading week"
      subtitle="Wage percentage by service and weekday, pooled across the window."
      padded={false}
      explain={
        <ExplainDrawer
          label="How the trading week grid is built"
          title="The trading week"
          showing={
            <>
              <p>
                Each cell is one service on one weekday, pooled across every instance in the window —{" "}
                <strong>the pattern the week runs to, not any one Tuesday.</strong> The small figure
                is average net sales per instance of that shift.
              </p>
              <p>
                Colour is banded against the fixed thresholds used everywhere in this section: at or
                under 25%, 25 to 35%, over 35%. Read it as a shape rather than a score — the
                clustering is the finding.
              </p>
            </>
          }
          made={
            <p>
              A service is a union of day parts. <strong>Daytime</strong> is Pre-Dawn through
              Afternoon, 04:00 to 17:00; <strong>Evening</strong> is Dinner through Late Night. Both
              sides of the ratio are cut by the same clock, so every day part total nests exactly
              inside the service drawn over it.
            </p>
          }
        />
      }
    >
      <div className="px-5 pt-4">
        <p className="max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
          {orgName} runs at <strong className="text-ink">{pct(wagePct, 1)}</strong> across the
          window. Underneath it,{" "}
          <strong className="text-ink">
            {worst.label.toLowerCase()} costs {pct(worst.wagePct!, 1)}
          </strong>{" "}
          of what it takes while {best.label.toLowerCase()} costs {pct(best.wagePct!, 1)}
          {ratio ? ` — ${ratio.toFixed(1)}× apart` : ""}. One target for the whole business flags it
          all amber and names nothing anybody can change.
        </p>
      </div>
      <div className="overflow-x-auto p-5">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] tracking-wide text-ink-secondary uppercase">
              <th className="pr-3 pb-2 text-left font-medium">Service</th>
              {WEEKDAYS.map((d) => (
                <th key={d.dow} className="px-1.5 pb-2 text-center font-medium">{d.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service}>
                <th scope="row" className="py-1.5 pr-3 text-left font-medium whitespace-nowrap text-ink">
                  {service === "daytime" ? "Daytime" : "Evening"}
                </th>
                {WEEKDAYS.map((d) => {
                  const c = get(d.dow, service);
                  const band = wageBand(c?.wagePct ?? null);
                  const tone = band?.tone === "good" ? "good" : (band?.tone ?? "warning");
                  return (
                    <td key={d.dow} className="px-1.5 py-1.5">
                      {c && band ? (
                        <div
                          className="rounded-lg px-2 py-2.5 text-center"
                          style={{
                            background: `color-mix(in srgb, var(--${tone}) 16%, transparent)`,
                            border: `1px solid color-mix(in srgb, var(--${tone}) 45%, transparent)`,
                          }}
                          title={`${c.label}: ${money(c.labour)} labour on ${money(c.net)} net sales`}
                        >
                          <div
                            className="tnum text-[15px] leading-none font-semibold"
                            style={{ color: `var(--${tone})` }}
                          >
                            {pct(c.wagePct!, 0)}
                          </div>
                          <div className="mt-1 text-[11px] leading-none text-ink-muted">
                            {money(c.net / Math.max(1, c.tradingDays))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-line px-2 py-2.5 text-center text-[12px] text-ink-muted">
                          —
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * The days that fell outside what their own weekday normally does.
 *
 * ── Why this is not a list of everything above target ──────────────────────
 *
 * A venue-wide target flags Monday amber every week, and a manager told the same
 * thing every week stops reading the colour — then misses the Monday that is
 * genuinely wrong. Preparation happens whether or not anybody comes in, so a
 * slow day carries a fixed cost against a small denominator and runs hot by
 * construction. That is arithmetic about a Monday, not a finding.
 *
 * So each day is compared against **its own weekday's usual range**, and only
 * the days outside it appear. The panel is deliberately short. If it is empty,
 * that is the answer.
 */
function Exceptions({
  flagged, norms, total,
}: {
  flagged: ReturnType<typeof exceptions>;
  norms: ReturnType<typeof weekdayNorms>;
  total: number;
}) {
  const rated = norms.filter((n) => n.n >= MIN_INSTANCES_FOR_NORM);
  const thin = norms.length - rated.length;

  return (
    <Card
      title="Days outside their own normal range"
      subtitle="Each day against what its own weekday usually costs — not against one target for the whole business."
      explain={
        <ExplainDrawer
          label="How exceptions are chosen"
          title="Days outside their own normal range"
          showing={
            <>
              <p>
                <strong>Normally</strong> is the range the middle half of that weekday&rsquo;s own
                instances land in. A Monday that runs hot is only listed here if it ran hot{" "}
                <em>for a Monday</em>.
              </p>
              <p>
                The list is meant to be short. Most days stop being remarkable once they are compared
                against their own weekday, and that is the point — the few that remain are worth
                opening the roster for.
              </p>
            </>
          }
          made={
            <>
              <p>
                A day is listed when it falls a full band-width beyond the band <em>and</em> at least
                three percentage points outside it. Both conditions, because either alone misfires: a
                weekday whose instances cluster tightly would flag every ordinary wobble on the
                first, and a weekday that swings widely would swallow a real problem on the second.
              </p>
              <p>
                A weekday needs at least {MIN_INSTANCES_FOR_NORM} instances in the window before it
                has a normal range at all. {rated.length} of {norms.length} weekday-and-service
                combinations qualify here.
              </p>
            </>
          }
        />
      }
    >
      {flagged.length === 0 ? (
        <EmptyState
          title="Nothing fell outside its weekday's normal range"
          body={`All ${count(total)} trading periods landed where their own weekday usually lands. The venue-wide figure may still be above where you want it — that is a target conversation rather than an exception.`}
        />
      ) : (
        <>
          <p className="mb-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
            <strong className="text-ink">{count(flagged.length)}</strong> of {count(total)} trading
            periods fell outside the range their own weekday usually keeps.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-secondary uppercase">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="px-3 py-2 text-right font-medium">Wage %</th>
                  <th className="px-3 py-2 text-right font-medium">Normally</th>
                  <th className="px-3 py-2 text-right font-medium">Net sales</th>
                  <th className="px-3 py-2 text-right font-medium">Labour</th>
                  <th className="py-2 pl-3 font-medium">Reading</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((e) => (
                  <tr key={`${e.cell.date}|${e.cell.service}`} className="border-b border-line last:border-b-0">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-ink">
                      {dayLabel(e.cell.date)}
                      <span className="block text-[11px] text-ink-muted">{e.norm.label}</span>
                    </td>
                    <td
                      className="tnum px-3 py-2.5 text-right font-semibold"
                      style={{ color: e.direction === "over" ? "var(--critical)" : "var(--good)" }}
                    >
                      {pct(e.cell.wagePct!, 0)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                      {pct(e.norm.lo, 0)}–{pct(e.norm.hi, 0)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{money(e.cell.net)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{money(e.cell.labour)}</td>
                    {/* Points, not percent. The gap is a difference between two
                        percentages, and writing it as "140% more" states
                        something several times larger than the measurement. */}
                    <td className="py-2.5 pl-3 text-[12px] leading-relaxed text-ink-secondary">
                      {Math.round(e.gap * 100)} points {e.direction === "over" ? "above" : "below"}{" "}
                      what a {e.norm.label} usually costs
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {thin > 0 && (
        <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
          {thin} weekday-and-service combination{thin === 1 ? "" : "s"} had fewer than{" "}
          {MIN_INSTANCES_FOR_NORM} instances in this window and were not tested — a range drawn from
          three points moves every time one of them does.
        </p>
      )}
    </Card>
  );
}

/** Where the wage bill goes: sections, and what is paid above ordinary time. */
function WageBill({ team }: { team: Team }) {
  const t = team.totals;
  return (
    <Card
      title="Where the wage bill goes"
      subtitle="Rostering departments rolled up so two venues can be compared, and what is being paid above ordinary time."
      explain={
        <ExplainDrawer
          label="How sections and penalty time are derived"
          title="Where the wage bill goes"
          showing={
            <p>
              Sections group the venue&rsquo;s own rostering department names so the same job in two
              buildings lands in one row. Below them, the split between ordinary and non-ordinary
              hours is the award classification carried on every costed segment.
            </p>
          }
          made={
            <>
              <p>
                {team.integrity.departments} department names roll up to {team.sections.length}{" "}
                sections. The names collide on purpose across sites — the same job is called one thing
                in one building and another in the other — and grouping on the raw name means{" "}
                <strong>nothing rolls up</strong>, which is the whole point of a head-office view.
              </p>
              <p>
                Non-ordinary hours are what the award classifies as outside ordinary time. It is the
                difference between knowing the wage bill went up and knowing whether it went up
                because more hours were worked or because the same hours were paid at penalty — two
                different problems with two different fixes.
              </p>
            </>
          }
        />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-secondary uppercase">
              <th className="py-2 pr-3 font-medium">Section</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">People</th>
              <th className="py-2 pl-3 font-medium">Rolled up from</th>
            </tr>
          </thead>
          <tbody>
            {team.sections.map((s) => (
              <tr key={s.section} className="border-b border-line last:border-b-0">
                <td className="py-2 pr-3 font-medium whitespace-nowrap text-ink">{s.section}</td>
                <td className="tnum px-3 py-2 text-right text-ink">{count(s.hours)}</td>
                <td className="tnum px-3 py-2 text-right text-ink">{money(s.cost)}</td>
                <td className="tnum px-3 py-2 text-right text-ink-secondary">{count(s.people)}</td>
                <td className="py-2 pl-3 text-[12px] text-ink-secondary">
                  {s.departments.join(" · ") || <span className="text-ink-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-ink">Above ordinary time</h3>
          <Pill tone={t.penaltyCost / Math.max(1, t.labour) > 0.1 ? "warning" : "neutral"}>
            {pct(t.penaltyCost / Math.max(1, t.labour), 1)} of the wage bill
          </Pill>
        </div>
        <Facts
          rows={[
            ["Hours outside ordinary time", `${count(t.penaltyHours)} of ${count(t.hours)}`],
            ["What they cost", money(t.penaltyCost)],
            ["Effective rate on them", money(t.penaltyCost / Math.max(1, t.penaltyHours))],
            [
              "Effective rate on ordinary hours",
              money((t.labour - t.penaltyCost) / Math.max(1, t.hours - t.penaltyHours)),
            ],
            ["Leave paid in the window, excluded above", money(t.leave)],
          ]}
        />
      </div>
    </Card>
  );
}

/**
 * The clock, and the refusal it justifies.
 *
 * Sits last because it explains the page rather than being read from it. A
 * manager who never opens it still gets a correct report; a manager who asks why
 * there is no wage percentage per hour finds the answer here rather than in a
 * support ticket.
 */
function ClockShape({ cells }: { cells: TeamMarginCell[] }) {
  const drawn = cells.filter((c) => c.net > 0 || c.hours > 0);
  const t = totalCells(drawn);
  const max = Math.max(
    ...drawn.map((c) => Math.max(c.net / Math.max(1, t.net), c.hours / Math.max(1, t.hours))),
  );

  return (
    <Card
      title="Why there is no wage percentage per hour"
      subtitle="Where the labour sits against where the trade sits."
      explain={
        <ExplainDrawer
          label="How the clock comparison is built"
          title="Why there is no wage percentage per hour"
          showing={
            <p>
              Two shares, read against each other: how much of the window&rsquo;s trade landed in
              each day part, and how much of its worked hours did. Where the hours bar leads the
              trade bar, labour is being spent on a day part that banks its revenue somewhere else.
            </p>
          }
          made={
            <p>
              Both shares are of the window total, so each column sums to 100%. Labour is apportioned
              to the minute across the day parts a shift spans. The same trade and the same labour
              carry a ratio one level up, at service grain, where the denominator contains the work
              that earned it.
            </p>
          }
        />
      }
    >
      <p className="mb-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
        Labour leads trade in the morning and trails it at night, because a kitchen preps before
        service and a floor team clears after it.{" "}
        <strong className="text-ink">
          The hours either side of service bank almost no revenue against themselves
        </strong>
        , so a wage percentage per clock hour divides one day part&rsquo;s cost by another&rsquo;s
        takings.
      </p>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
            <th className="py-2 pr-3 text-left font-medium">Day part</th>
            <th className="px-3 py-2 text-left font-medium">Share of trade</th>
            <th className="px-3 py-2 text-left font-medium">Share of hours worked</th>
          </tr>
        </thead>
        <tbody>
          {drawn.map((c) => (
            <tr key={c.key} className="border-b border-line last:border-b-0">
              <td className="py-2 pr-3 whitespace-nowrap text-ink">{c.label}</td>
              <td className="px-3 py-2">
                <Bar value={c.net / Math.max(1, t.net)} max={max} colour="var(--accent)" />
              </td>
              <td className="px-3 py-2">
                <Bar value={c.hours / Math.max(1, t.hours)} max={max} colour="var(--tier-card)" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4">
        <EmptyState
          title="The ratio is absent from these rows, not hidden by a caption"
          body={
            <>
              Wage percentage, margin and sales per hour are{" "}
              <strong className="text-ink">null in the data</strong> at day part grain, so no chart,
              export or later change can reach past a warning and render one. The shipped Labour
              dashboard meets the same arithmetic by capping the axis at 100% and listing what it
              clipped — 7,720% at 11:30, 6,989% at 11:45. Capping hides the reading; removing the
              denominator fixes it.
            </>
          }
          tone="warning"
        />
      </div>
    </Card>
  );
}

function Bar({ value, max, colour }: { value: number; max: number; colour: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 rounded-sm bg-surface-sunken">
        <div
          className="h-full rounded-sm"
          style={{ width: `${max ? (value / max) * 100 : 0}%`, background: colour }}
        />
      </div>
      <span className="tnum w-[46px] text-right text-[12px] text-ink-secondary">{pct(value, 1)}</span>
    </div>
  );
}

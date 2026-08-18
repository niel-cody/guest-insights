import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Facts, Tile } from "@/components/ui/Primitives";
import { InfoButton } from "@/components/ui/InfoButton";
import { getPeriods, getSnapshot } from "@/lib/data";
import { teamChecks } from "@/lib/checks";
import { count, money, monthLabel, dayLabel, pct, windowShort } from "@/lib/metrics";
import { WEEKDAYS } from "@/lib/weekdays";
import { cellsFor, totalCells, wageBand } from "@/lib/team";
import type { TeamMarginCell } from "@/lib/types";
import { MarginGrains, type Grain } from "./MarginGrains";
import { Unavailable } from "../Unavailable";

export const dynamic = "force-static";
export const metadata = { title: "Margin" };

/**
 * Margin. What each stretch of trading returns against what it costs to staff.
 *
 * ── Margin here means margin after labour, and says so ─────────────────────
 *
 * Not gross margin. Cost of goods is recorded on a small fraction of orders at
 * both organisations, so there is no food cost to subtract and no honest way to
 * invent one. Every figure on this page is **net sales minus wage cost**, which
 * is a real and useful number — it is the money left to cover food, rent and
 * everything else — and it is named in full everywhere it appears rather than
 * abbreviated to "margin" and quietly misread as the other thing.
 *
 * ── The grain question, and the one grain that is refused ──────────────────
 *
 * The report answers at five resolutions: service block, day of week, day, week
 * and month. It does **not** answer per clock daypart, and that refusal is the
 * most considered thing on the page.
 *
 * Labour is not consumed in the hour it is paid in. A kitchen preps at ten for a
 * lunch that sells at twelve; a floor team clears at eleven for a dinner that
 * sold at seven. Apportion wage cost across the clock, divide by the revenue
 * banked in the same hour, and the arithmetic reports Late Evening at 348% and
 * Breakfast at 6,207%. Those numbers are correct and they are nonsense, and an
 * operator who acts on them cuts the pack-down shift.
 *
 * The service block is the same trade and the same labour with the boundary
 * drawn where the venue draws it — and the venue does draw it, in its own
 * rostering departments. The clock daypart is still published, as *shape*, with
 * its ratios structurally absent rather than merely captioned.
 */
export default async function TeamMarginPage({
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
      title="Margin"
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
  const t = team.totals;
  const all = <C extends TeamMarginCell>(cells: C[]): C[] => cellsFor(cells, "all");

  const grains: Grain[] = [
    {
      key: "service",
      label: "Service",
      hint: "Lunch and dinner, the block the venue rosters to",
      cells: all(team.margin.service),
    },
    {
      key: "serviceDow",
      label: "Service by day",
      hint: "The rostering question: which shift on which day",
      cells: [...all(team.margin.serviceDow)].sort(
        (a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || a.key.localeCompare(b.key),
      ),
    },
    {
      key: "dow",
      label: "Day of week",
      hint: "Pooled across the window — the pattern, not one instance",
      cells: [...all(team.margin.dow)].sort((a, b) => ((Number(a.key) + 6) % 7) - ((Number(b.key) + 6) % 7)),
    },
    {
      key: "week",
      label: "Week",
      hint: "Monday-first. The horizon a manager can still act on",
      cells: all(team.margin.week).map((c) => ({ ...c, label: `Week of ${dayLabel(c.key)}` })),
    },
    {
      key: "month",
      label: "Month",
      hint: "Whether the business is where it should be",
      cells: all(team.margin.month).map((c) => ({ ...c, label: monthLabel(`${c.key}-01`, true) })),
    },
    {
      key: "day",
      label: "Day",
      hint: "Every trading day in the window",
      cells: all(team.margin.day).map((c) => ({ ...c, label: dayLabel(c.key) })),
    },
  ];

  const services = all(team.margin.service);
  const worstService = [...services].sort((a, b) => (b.wagePct ?? 0) - (a.wagePct ?? 0))[0];
  const bestService = [...services].sort((a, b) => (a.wagePct ?? 1) - (b.wagePct ?? 1))[0];

  const serviceDow = all(team.margin.serviceDow).filter((c) => c.wagePct != null);
  const worstShift = [...serviceDow].sort((a, b) => (b.wagePct ?? 0) - (a.wagePct ?? 0))[0];
  const bestShift = [...serviceDow].sort((a, b) => (a.wagePct ?? 1) - (b.wagePct ?? 1))[0];

  const dayparts = all(team.margin.daypart).filter((c) => c.net > 0 || c.hours > 0);
  const maxDp = Math.max(...dayparts.map((c) => Math.max(c.net / Math.max(1, t.net), c.hours / Math.max(1, t.hours))));

  const band = wageBand(t.wagePct);
  const overPlan = t.labour - t.plannedLabour;

  return (
    <>
      {header}
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Wage percentage"
              value={pct(t.wagePct, 1)}
              accent={band ? `var(--${band.tone === "good" ? "good" : band.tone})` : undefined}
              detail={`${money(t.labour)} of labour on ${money(t.net)} of net sales`}
              meta={`Award and allowance, leave excluded, ${win}`}
              info={
                <p>
                  Net sales is ex-tax. Labour is award plus allowance; {money(t.leave)} of leave is
                  excluded because it is paid and not worked, and counting it would distort both this
                  figure and cost per hour. Hours come from award segments only — an allowance row
                  mirrors the hours of the shift it hangs off, so counting them again would inflate
                  every per-hour figure on this page.
                </p>
              }
            />
            <Tile
              label="Margin after labour"
              value={money(t.margin)}
              detail={`${pct(1 - t.wagePct, 1)} of net sales survives the wage bill`}
              meta="Not gross margin — no food cost is subtracted"
              footnote={
                <>
                  Cost of goods is recorded on {pct(team.integrity.costCoverage)} of orders, so gross
                  margin is not computable and is not shown anywhere in this section.
                </>
              }
            />
            <Tile
              label="Sales per labour hour"
              value={money(t.netPerHour)}
              detail={`${count(t.hours)} worked hours`}
              meta={`Across ${count(org.venues.length)} venue${org.venues.length === 1 ? "" : "s"}, ${win}`}
            />
            <Tile
              label="Against the plan"
              value={`${overPlan > 0 ? "+" : ""}${money(overPlan)}`}
              accent={overPlan > 0 ? "var(--warning)" : "var(--good)"}
              detail={`${money(t.labour)} actual against ${money(t.plannedLabour)} rostered`}
              meta={`${pct(Math.abs(overPlan) / Math.max(1, t.plannedLabour), 1)} ${overPlan > 0 ? "over" : "under"} the published roster`}
            />
          </div>

          {/* ── the finding ───────────────────────────────────────────────── */}
          {worstService && bestService && worstShift && bestShift && (
            <Card title="The wage percentage is not one number, and a flat target would hide this">
              <p className="max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
                Across the window {org.name} runs at{" "}
                <strong className="text-ink">{pct(t.wagePct, 1)}</strong>. Underneath that,{" "}
                <strong className="text-ink">
                  {worstService.label.toLowerCase()} costs {pct(worstService.wagePct!, 1)} of what it
                  takes
                </strong>{" "}
                while {bestService.label.toLowerCase()} costs {pct(bestService.wagePct!, 1)} — the
                same building, the same team, {(worstService.wagePct! / bestService.wagePct!).toFixed(1)}× apart.
              </p>
              <p className="mt-3 max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
                At shift grain the spread is wider still.{" "}
                <strong className="text-ink">
                  {worstShift.label} runs at {pct(worstShift.wagePct!, 1)}
                </strong>{" "}
                — {money(worstShift.labour)} of labour against {money(worstShift.net)} of trade —
                against {bestShift.label} at {pct(bestShift.wagePct!, 1)}. A single daily or weekly
                target flags the whole business amber and tells a manager nothing they can act on;
                the shift is where the decision actually gets made.
              </p>
            </Card>
          )}

          {/* ── the grain table ───────────────────────────────────────────── */}
          <Card
            title="Cost against return"
            subtitle={`Every grain reads the same ${money(t.net)} of net sales and ${money(t.labour)} of labour, cut a different way.`}
            padded={false}
            explain={
              <InfoButton label="About these grains" align="end">
                <p>
                  Labour is apportioned to the minute across the windows a shift spans, so a shift
                  from five to eleven is counted in both the hours it worked. Every grain sums to the
                  same window total; switching grain re-cuts the same money and never re-measures it.
                </p>
              </InfoButton>
            }
          >
            <MarginGrains grains={grains} initial="serviceDow" />
          </Card>

          {/* ── the shift grid ────────────────────────────────────────────── */}
          <ShiftGrid cells={all(team.margin.serviceDow)} />

          {/* ── the clock, and the refusal ────────────────────────────────── */}
          <Card
            title="Where the labour sits against where the trade sits"
            subtitle="The clock hour. Shape only — this is the grain whose ratios are not published, and this panel is why."
          >
            <p className="mb-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              Read the two bars against each other. Labour leads trade in the morning and trails it
              at night, because a kitchen preps before service and a floor team clears after it.
              That gap is the reason a wage percentage per clock hour is meaningless:{" "}
              <strong className="text-ink">
                the hours either side of service have almost no revenue banked against them
              </strong>
              , and dividing anyway reports the pack-down shift at several hundred percent.
            </p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                  <th className="py-2 pr-3 text-left font-medium">Hour of the day</th>
                  <th className="px-3 py-2 text-left font-medium">Share of trade</th>
                  <th className="px-3 py-2 text-left font-medium">Share of hours worked</th>
                  <th className="py-2 pl-3 text-right font-medium">Wage %</th>
                </tr>
              </thead>
              <tbody>
                {dayparts.map((c) => {
                  const netShare = c.net / Math.max(1, t.net);
                  const hourShare = c.hours / Math.max(1, t.hours);
                  return (
                    <tr key={c.key} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-ink">{c.label}</td>
                      <td className="px-3 py-2">
                        <Bar value={netShare} max={maxDp} colour="var(--accent)" />
                      </td>
                      <td className="px-3 py-2">
                        <Bar value={hourShare} max={maxDp} colour="var(--tier-card)" />
                      </td>
                      <td className="py-2 pl-3 text-right text-[12px] text-ink-muted">
                        not published
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-4">
              <EmptyState
                title="Wage percentage per clock hour is refused, not merely caveated"
                body={
                  <>
                    The three ratios are absent from these rows in the data itself, not hidden by a
                    caption — so no chart, export or later change can reach past a warning and render
                    one. The same trade and the same labour are measured at{" "}
                    <strong className="text-ink">service-block grain</strong> above, where the
                    boundary falls where the venue puts it: its own rostering departments are named
                    for lunch and dinner, and orders per hour collapse to a trough between them
                    before rising again.
                  </>
                }
                tone="warning"
              />
            </div>
          </Card>

          {/* ── sections ──────────────────────────────────────────────────── */}
          <Card
            title="Where the wage bill goes"
            subtitle="Rostering departments rolled up to one vocabulary, so two venues can be compared."
          >
            <p className="mb-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              {org.name} runs {count(team.integrity.departments)} rostering department names across{" "}
              {count(org.venues.length)} venues, and they collide on purpose — the same job is called
              one thing in one building and another in the other.{" "}
              <strong className="text-ink">
                Grouping on the raw name means nothing rolls up
              </strong>
              , which is the entire point of a head-office view. These are the{" "}
              {count(team.sections.length)} sections they collapse to.
            </p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                  <th className="py-2 pr-3 text-left font-medium">Section</th>
                  <th className="px-3 py-2 text-right font-medium">Hours</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">People</th>
                  <th className="py-2 pl-3 text-left font-medium">Rolled up from</th>
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
          </Card>

          {/* ── penalty exposure ──────────────────────────────────────────── */}
          <Card
            title="What is being paid above ordinary time"
            subtitle="Landing in the warehouse, and shown nowhere else in the product."
          >
            <Facts
              rows={[
                ["Hours worked outside ordinary hours", `${count(t.penaltyHours)} of ${count(t.hours)}`],
                ["Cost of those hours", money(t.penaltyCost)],
                ["Share of the wage bill", pct(t.penaltyCost / Math.max(1, t.labour), 1)],
                ["Effective rate on them", money(t.penaltyCost / Math.max(1, t.penaltyHours))],
                ["Effective rate on ordinary hours", money((t.labour - t.penaltyCost) / Math.max(1, t.hours - t.penaltyHours))],
                ["Leave paid in the window, excluded above", money(t.leave)],
              ]}
            />
            <p className="mt-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              The award classification is carried on every costed segment and has never been
              surfaced. It is the difference between knowing the wage bill went up and knowing
              whether it went up because more hours were worked or because the same hours were paid
              at penalty — which are two different problems with two different fixes.
            </p>
          </Card>
        </div>
      </Page>
    </>
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
      <span className="tnum w-[46px] text-right text-[12px] text-ink-secondary">
        {pct(value, 1)}
      </span>
    </div>
  );
}

/**
 * The week as a grid: two services down, seven days across.
 *
 * This is the shape of the whole argument in one object. A flat wage target
 * draws one line across every cell; the grid shows that the cells are not
 * remotely alike, and that the expensive ones cluster — which is a rostering
 * decision rather than a performance problem.
 */
type ShiftCell = TeamMarginCell & { dow: number; service: string };

/** Lunch before dinner. A trading day is read in the order it is worked. */
const SERVICE_ORDER = ["lunch-service", "dinner-service"];

function ShiftGrid({ cells }: { cells: ShiftCell[] }) {
  const services = [...new Set(cells.map((c) => c.service))].sort(
    (a, b) => SERVICE_ORDER.indexOf(a) - SERVICE_ORDER.indexOf(b),
  );
  if (!services.length) return null;
  const get = (dow: number, service: string) =>
    cells.find((c) => c.dow === dow && c.service === service);

  const total = totalCells(cells);

  return (
    <Card
      title="The trading week, by shift"
      subtitle="Wage percentage in each cell. The colour is banded against the same fixed thresholds everywhere in this section — under 25%, 25 to 35%, over 35%."
      padded={false}
    >
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
                <th scope="row" className="pr-3 py-1.5 text-left font-medium whitespace-nowrap text-ink">
                  {service === "lunch-service" ? "Lunch" : "Dinner"}
                </th>
                {WEEKDAYS.map((d) => {
                  const c = get(d.dow, service);
                  const band = wageBand(c?.wagePct ?? null);
                  return (
                    <td key={d.dow} className="px-1.5 py-1.5">
                      {c && band ? (
                        <div
                          className="rounded-lg px-2 py-2.5 text-center"
                          style={{
                            background: `color-mix(in srgb, var(--${band.tone === "good" ? "good" : band.tone}) 16%, transparent)`,
                            border: `1px solid color-mix(in srgb, var(--${band.tone === "good" ? "good" : band.tone}) 45%, transparent)`,
                          }}
                          title={`${c.label}: ${money(c.labour)} labour on ${money(c.net)} net sales`}
                        >
                          <div
                            className="tnum text-[15px] leading-none font-semibold"
                            style={{ color: `var(--${band.tone === "good" ? "good" : band.tone})` }}
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
        <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
          The small figure is average net sales per instance of that shift. Pooled across{" "}
          {count(total.orders)} orders in the window — this is the pattern the week runs to, not any
          one Tuesday.
        </p>
      </div>
    </Card>
  );
}

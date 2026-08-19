import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Facts, Pill, Tile } from "@/components/ui/Primitives";
import { ExplainDrawer } from "@/components/ui/ExplainDrawer";
import { getPeriods, getSnapshot } from "@/lib/data";
import { retentionChecks } from "@/lib/checks";
import { count, coverageState, dayLabel, monthLabel, pct } from "@/lib/metrics";
import {
  LAPSE_DOUBLED_DAYS, MIN_MATCHED_COHORTS, cardVerdict, monthlyFlow, retentionTrend,
} from "@/lib/retention";
import { Standfirst } from "../team/Standfirst";
import { BurnDown, ChurnFlowChart, RetentionTrendChart } from "./RetentionCharts";

export const dynamic = "force-static";
export const metadata = { title: "Retention and Churn" };

/**
 * Retention and Churn. **Are the people who came back still coming back?**
 *
 * ── Why this is its own page ───────────────────────────────────────────────
 *
 * The burn-down used to sit at the foot of Behaviour, behind a dashed wall,
 * after eleven other panels. It was the most-asked question in the build and it
 * was the last thing on a long page, walled off — which was right when it was a
 * caveat hanging off somebody else's argument and wrong now that it is the
 * argument.
 *
 * ── The claim this page makes that the build previously refused ────────────
 *
 * Whether retention is *improving*. The refusal was correct: scan coverage
 * climbed from 3% to 19% of orders across the run, so later intakes contained
 * marginal members the early ones never captured, and a falling line could not
 * be told apart from a programme recruiting more broadly.
 *
 * A programme ramps and then it plateaus. Once coverage is flat, intakes are
 * drawn from the same population and **are** comparable — so the trend is drawn
 * across the plateau only, and the ramp is excluded rather than adjusted. That
 * is the coverage-matched comparison the old refusal said was "not in this
 * build". It is now, in `lib/retention.ts`, and it costs the early history.
 *
 * ── Both tiers, and only one of them can answer ────────────────────────────
 *
 * The card tier is the spine of this build and it cannot carry a retention
 * figure at all, because retention is lapse-dependent and the card window is 92
 * days against the 180 a lapse-dependent figure needs. That is not a modelling
 * limitation — the payment reference stopped being written for ten to fourteen
 * consecutive months, and a guest seen either side of that gap cannot be told
 * from two guests. The page says so, and says the date it changes.
 */
export default async function RetentionPage({
  params,
}: {
  params: Promise<{ org: string; period: string }>;
}) {
  const { org: slug, period } = await params;
  const [snap, periods] = await Promise.all([getSnapshot(slug, period), getPeriods(slug)]);
  const { org, cohorts, coverage, members } = snap;
  const current = periods.periods.find((p) => p.id === period)!;
  const checks = retentionChecks(snap);

  const header = (
    <PageHeader
      org={org}
      periods={periods}
      period={current}
      title="Retention and Churn"
      section="Customers"
      coverage={coverageState(org, coverage)}
      coverageScope="mixed"
      checks={checks.length ? checks : undefined}
    />
  );

  const card = cardVerdict(org.cardTier.quality, org.window.days);

  if (!cohorts || !cohorts.grading.renders) {
    return (
      <>
        {header}
        <Page>
          <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
            <Standfirst
              question="Are the people who came back still coming back?"
              body="Neither identity this build holds can answer it yet at this organisation."
            />
            <NoTierCanAnswer cohorts={cohorts} card={card} orgName={org.name} />
          </div>
        </Page>
      </>
    );
  }

  const flow = monthlyFlow(cohorts);
  const trend3 = retentionTrend(cohorts, 3);
  const trend6 = retentionTrend(cohorts, 6);
  /** The longest horizon the plateau can actually support, preferred. */
  const trend = trend6 && !trend6.refusal ? trend6 : trend3;

  // Churn is read as a floor, not a point estimate — see `monthlyFlow`.
  const rated = flow.filter((m) => m.churnRate != null);
  const recent = rated.slice(-6);
  const medianChurn = median(recent.map((m) => m.churnRate!));
  const latest = flow.at(-1)!;

  const totalMembers = cohorts.cohorts.reduce((a, c) => a + c.members, 0);
  const medTenure = median(cohorts.cohorts.filter((c) => c.observableMonths >= 3).map((c) => c.medianTenureDays));

  return (
    <>
      {header}
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <Standfirst
            question="Are the people who came back still coming back — and is that getting better or worse?"
            body={
              <>
                Measured on the loyalty scan across {count(cohorts.window.days)} days, which is the only
                identity in this build with a window long enough to see somebody stop.{" "}
                <strong className="text-ink">The payment card cannot answer this yet</strong> — the reason,
                and the date it changes, are at the foot of the page.
              </>
            }
          />

          {/* ── headline ──────────────────────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-4">
            {trend && !trend.refusal ? (
              <>
                <Tile
                  label={`Retention at ${trend.horizon} months`}
                  value={pct(trend.pooled, 0)}
                  accent="var(--tier-member)"
                  detail={`of members are still coming ${trend.horizon} months after they join`}
                  meta={`${count(trend.points.length)} comparable intakes`}
                  info={
                    <p>
                      Pooled across every intake that joined while scan coverage was flat and has been
                      watched for {trend.horizon} full months — retained over joined, not the average of
                      each intake&rsquo;s rate. Intakes from the years when coverage was still climbing are
                      excluded, because they were recruited from a narrower population.
                    </p>
                  }
                />
                <Tile
                  label={`Churn by ${trend.horizon} months`}
                  value={pct(1 - trend.pooled, 0)}
                  accent="var(--critical)"
                  detail={`${count(trend.points.reduce((a, p) => a + p.members - p.retained, 0))} of ${count(trend.points.reduce((a, p) => a + p.members, 0))} stopped coming`}
                  meta="The same measurement, read the other way"
                />
                <Tile
                  label="Direction"
                  value={
                    trend.direction === "flat"
                      ? "Holding"
                      : `${trend.change > 0 ? "+" : "−"}${Math.abs(trend.change * 100).toFixed(0)} pts`
                  }
                  accent={
                    trend.direction === "improving"
                      ? "var(--good)"
                      : trend.direction === "declining"
                        ? "var(--critical)"
                        : "var(--ink-muted)"
                  }
                  detail={
                    trend.direction === "flat"
                      ? "No movement worth reading either way"
                      : `Later intakes retain ${trend.direction === "improving" ? "better" : "worse"} than earlier ones`
                  }
                  meta="Coverage-matched, so this is retention and not reach"
                />
              </>
            ) : (
              <>
                <Tile
                  label="Retention trend"
                  // The tile prints "Not published" itself when refused, so the
                  // value slot holds the figure that would have been there.
                  value="—"
                  refused
                  detail="Too few comparable intakes to draw a direction"
                  meta={`${trend?.points.length ?? 0} of ${MIN_MATCHED_COHORTS} needed`}
                  footnote={trend?.refusal}
                />
                <Tile
                  label="Members ever enrolled"
                  value={count(totalMembers)}
                  accent="var(--tier-member)"
                  detail={`across ${count(cohorts.cohorts.length)} monthly intakes`}
                  meta={`${monthLabel(cohorts.window.start)} to ${monthLabel(cohorts.window.end)}`}
                />
                <Tile
                  label="Active in the latest month"
                  value={count(latest.active)}
                  detail={`${count(latest.joined)} of them joined that month`}
                  meta={monthLabel(latest.month)}
                />
              </>
            )}
            <Tile
              label="Monthly churn"
              value={medianChurn == null ? "—" : pct(medianChurn, 0)}
              accent="var(--warning)"
              detail={`of the active base stops coming in a typical month`}
              meta={`Median of the last ${recent.length} months · read as a floor`}
              info={
                <p>
                  The snapshot carries a cohort triangle rather than a per-person ledger, so this compares
                  each intake&rsquo;s active count between consecutive months.{" "}
                  <strong>That understates churn wherever somebody returns after a month away</strong> — an
                  intake going 100, 80, 85 reports five gained rather than the ten who came back and the
                  five who left. Read it as a floor. The active count itself is measured directly and is
                  not affected.
                </p>
              }
            />
          </div>

          {/* ── the answer ────────────────────────────────────────────────── */}
          {trend && (
            <Card
              title="Is retention improving?"
              subtitle={`Members still coming ${trend.horizon} months after joining, one point per intake.`}
              explain={
                <ExplainDrawer
                  label="How the retention trend is built"
                  title="Is retention improving?"
                  showing={
                    <>
                      <p>
                        Each point is one month&rsquo;s intake, measured at <strong>the same age</strong> —
                        how many of them were still coming {trend.horizon} months after they joined. Points
                        are comparable to each other because both the age and the population they were
                        recruited from are held fixed.
                      </p>
                      <p>
                        The dashed line is the pooled rate across every intake shown. A point below it is an
                        intake that retained worse than the programme&rsquo;s own average.
                      </p>
                    </>
                  }
                  made={
                    <>
                      <p>
                        <strong>Why the early years are missing.</strong> Scan coverage climbed from{" "}
                        {pct(cohorts.coverage[0]?.coverage ?? 0, 1)} to{" "}
                        {pct(cohorts.coverage.at(-1)?.coverage ?? 0, 1)} of orders across the record. While
                        it was climbing, each intake was recruited from a broader population than the last,
                        and a falling line could not be told apart from a programme reaching further. Only
                        intakes from the plateau are drawn — {monthLabel(trend.run.from)} to{" "}
                        {monthLabel(trend.run.to)}, where coverage held between {pct(trend.run.lo, 1)} and{" "}
                        {pct(trend.run.hi, 1)}.
                      </p>
                      <p>
                        Coverage is called flat when it moves less than {pct(0.03, 0)} in absolute terms and
                        less than 1.3× in relative terms across the run. Both tests, because the absolute
                        one passes trivially at a venue whose coverage is near 5%.
                      </p>
                      <p>
                        An intake is only plotted once it has been watched for the full {trend.horizon}{" "}
                        months. Filling a younger intake from a shorter observation is how a censor boundary
                        gets read as a decline.
                      </p>
                    </>
                  }
                />
              }
            >
              {trend.refusal ? (
                <EmptyState
                  tone="warning"
                  title="Not enough comparable intakes to draw a direction"
                  body={trend.refusal}
                />
              ) : (
                <>
                  <p className="mb-4 max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
                    Across {count(trend.points.length)} intakes recruited while the programme&rsquo;s reach
                    was steady, {trend.horizon}-month retention went from{" "}
                    <strong className="text-ink">{pct(trend.points[0].rate, 0)}</strong> for the{" "}
                    {trend.points[0].label} intake to{" "}
                    <strong className="text-ink">{pct(trend.points.at(-1)!.rate, 0)}</strong> for{" "}
                    {trend.points.at(-1)!.label}.{" "}
                    {trend.direction === "flat" ? (
                      <>The programme is holding its retention as it recruits.</>
                    ) : (
                      <>
                        Later intakes retain{" "}
                        <strong style={{ color: trend.direction === "improving" ? "var(--good)" : "var(--critical)" }}>
                          {Math.abs(trend.change * 100).toFixed(0)} points{" "}
                          {trend.direction === "improving" ? "better" : "worse"}
                        </strong>{" "}
                        than earlier ones.
                      </>
                    )}{" "}
                    Because coverage was flat throughout, this is a statement about retention rather than
                    about how many people the programme reached.
                  </p>
                  <RetentionTrendChart trend={trend} />
                  {trend6 && trend3 && !trend6.refusal && (
                    <p className="mt-3 max-w-[95ch] text-[12px] leading-relaxed text-ink-muted">
                      At three months the same comparison reads {pct(trend3.pooled, 0)} pooled and{" "}
                      {trend3.direction === "flat"
                        ? "holds"
                        : `moves ${Math.abs(trend3.change * 100).toFixed(0)} points ${trend3.direction === "improving" ? "up" : "down"}`}
                      , across {count(trend3.points.length)} intakes. Six months is the stronger read where
                      both exist — three months of silence is this build&rsquo;s lapse threshold, so somebody
                      counted as retained at three months has cleared it by a day.
                    </p>
                  )}
                </>
              )}
            </Card>
          )}

          {/* ── the engine ────────────────────────────────────────────────── */}
          <Card
            title="What the base gains and loses each month"
            subtitle="Members joining above the line, members who stopped coming below it."
            explain={
              <ExplainDrawer
                label="How the monthly flow is built"
                title="What the base gains and loses each month"
                showing={
                  <p>
                    The two forces that set the size of the active base, drawn against each other. A base
                    that grows every month while losing more people every month is the most common way a
                    loyalty programme looks healthy on the way to stalling — which the burn-down below
                    cannot show, because it only draws the net result.
                  </p>
                }
                made={
                  <p>
                    Joined is the intake first scanning that month. Lost is the fall in each intake&rsquo;s
                    active count against the month before, summed. Because the snapshot holds a cohort
                    triangle rather than a per-person ledger, a member who misses a month and returns nets
                    off against somebody who left, so <strong>losses are a floor rather than a count</strong>.
                  </p>
                }
              />
            }
          >
            <p className="mb-4 max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
              In {monthLabel(latest.month)} the programme took on{" "}
              <strong className="text-ink">{count(latest.joined)}</strong> new members and at least{" "}
              <strong className="text-ink">{count(latest.lost)}</strong> stopped coming
              {latest.churnRate != null && <> — {pct(latest.churnRate, 0)} of the base it started with</>}.
            </p>
            <ChurnFlowChart flow={flow} />
          </Card>

          {/* ── composition ───────────────────────────────────────────────── */}
          <Card
            title="Where today's active members came from"
            subtitle="Every band is one month's intake. Its thickness is how many of them were still coming."
            explain={
              <ExplainDrawer
                label="How the burn-down is built"
                title="Where today's active members came from"
                showing={
                  <>
                    <p>
                      Each band is the members who first scanned in one month, and its thickness at any
                      point is how many of them were still visiting that month. So{" "}
                      <strong>a band that narrows is an intake burning down</strong> and one that holds its
                      width is an intake that stuck. New intakes stack on top as they join.
                    </p>
                    <p>
                      Read the bottom band left to right to follow the oldest group you have.
                    </p>
                  </>
                }
                made={
                  <>
                    <p>
                      Calendar time on the x-axis, so there is no censor boundary — every intake is observed
                      in every month it exists, up to the same window close. What that gives up is the
                      intake-to-intake comparison, which is why the panel above exists and draws it on a
                      fixed age instead.
                    </p>
                    <p>
                      <strong>The stack growing is not retention improving.</strong> It grows because
                      enrolment outran churn and because the programme itself broadened. Read this for
                      composition and shape; read the panel above for the rate.
                    </p>
                  </>
                }
              />
            }
          >
            <p className="mb-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              <strong className="text-ink">Member data starts in {monthLabel(cohorts.window.start)}</strong>{" "}
              — {cohorts.cohorts.length} monthly intakes to {monthLabel(cohorts.window.end)}. That is the
              first month whose loyalty scanning passes grading, not the month the business started.
            </p>
            <BurnDown cohorts={cohorts} />
            {/* This correction may not move into the drawer. The chart is liked
                precisely for the thing it does not prove: a stack that grows
                reads as a programme retaining better, and it is a programme
                enrolling faster than it loses people. The reader who most needs
                the sentence is the one screenshotting the shape. */}
            <div
              className="mt-4 rounded-lg border border-dashed px-4 py-3.5"
              style={{ borderColor: "var(--warning)" }}
            >
              <h3 className="text-[14px] font-semibold text-ink">
                What this chart still cannot tell you
              </h3>
              <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                The stack rising is{" "}
                <strong className="text-ink">enrolment outrunning churn, not retention improving</strong>.
                Read this for composition — which intakes today&rsquo;s active base is made of, and whether
                a given one thinned fast or held. The rate is the panel at the top of this page, and it is
                the only place on it where intakes are set against each other fairly.
              </p>
              <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                Nothing here describes guests who never scanned. Members are roughly{" "}
                {pct(cohorts.coverage.at(-1)?.coverage ?? 0, 0)} of orders and are heavily self-selected, so
                this is <strong className="text-ink">members measured against members over time</strong> —
                which flat coverage makes fair — and not members measured against everybody, which nothing
                on this page makes fair.
              </p>
            </div>
          </Card>

          {/* ── the other tier ────────────────────────────────────────────── */}
          <CardTier card={card} org={org} members={members} medTenure={medTenure} />
        </div>
      </Page>
    </>
  );
}

/**
 * The card tier's answer, which is a date.
 *
 * ── Why this is not an empty state ─────────────────────────────────────────
 *
 * "No data" is what an operator reads when a surface has nothing to say, and it
 * is the wrong reading here. The card tier has excellent data *right now* — 95%
 * capture, better than the loyalty scan has ever managed — and it still cannot
 * answer this question, because the question needs elapsed time and the clock
 * was reset by somebody else's outage. Those are completely different
 * situations and only one of them is anybody's fault.
 *
 * So the panel states the mechanism, the date, and what the card tier *can*
 * answer today, which is not nothing.
 */
function CardTier({
  card, org, members, medTenure,
}: {
  card: ReturnType<typeof cardVerdict>;
  org: Awaited<ReturnType<typeof getSnapshot>>["org"];
  members: Awaited<ReturnType<typeof getSnapshot>>["members"];
  medTenure: number | null;
}) {
  const nm = members.crossSection.nonMember;
  const m = members.crossSection.member;
  return (
    <Card
      title="The payment card cannot answer this yet"
      subtitle="It is the more complete identity in this build, and it is the one with the shorter clock."
      explain={
        <ExplainDrawer
          label="Why the card tier cannot carry a retention figure"
          title="The payment card cannot answer this yet"
          showing={
            <p>
              Retention and churn are <strong>lapse-dependent</strong>: to say somebody stopped coming you
              need the lapse threshold of silence, and to say somebody did not you need the same again
              watching them beforehand. That is {LAPSE_DOUBLED_DAYS} days. The card window holds{" "}
              {card.windowDays}.
            </p>
          }
          made={
            <p>
              The window is not short because the card is a weak identifier — it is the stronger one, on{" "}
              {pct(m.scanPerVisit, 0)} of member visits. It is short because the payment reference stopped
              being written for {card.blackoutMonths} complete months, so the snapshot holds one directory
              per unbroken run of trustworthy months and the current run started when capture resumed.
            </p>
          }
        />
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <p className="max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
            Retention needs {LAPSE_DOUBLED_DAYS} days and the card window holds{" "}
            <strong className="text-ink">{card.windowDays}</strong>. The reason is not the card: it is that
            the payment reference{" "}
            <strong className="text-ink">
              stopped being written for {card.blackoutMonths} complete months
            </strong>
            . A guest seen either side of that gap cannot be told apart from two guests, so retention across
            it is not difficult to compute — it is undefined.
          </p>
          {card.restoredFrom && card.unlocksOn && (
            <div
              className="mt-4 rounded-lg border border-dashed px-4 py-3.5"
              style={{ borderColor: "var(--good)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-semibold text-ink">
                  This unlocks on {dayLabel(card.unlocksOn)}
                </h3>
                <Pill tone="good">no work required</Pill>
              </div>
              <p className="mt-1.5 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                Capture resumed in {monthLabel(card.restoredFrom)} and has held above{" "}
                {pct(0.93, 0)} of transactions since. {LAPSE_DOUBLED_DAYS} days from there is{" "}
                {dayLabel(card.unlocksOn)} — the day the card tier can carry retention and churn for{" "}
                <strong className="text-ink">every guest</strong>, not the{" "}
                {pct(m.scanRate, 0)} of them who scan. Nothing needs building for that to happen; the clock
                only needs to run.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface-sunken p-4">
          <h3 className="text-[13px] font-semibold text-ink">What the card tier can say today</h3>
          <p className="mt-1 mb-3 text-[12px] leading-relaxed text-ink-secondary">
            Return behaviour inside the {org.window.days}-day window. These are not retention — none of them
            needs to observe somebody stopping.
          </p>
          <Facts
            rows={[
              ["Cards that returned at least once", pct(nm.repeatRate, 1)],
              ["Members that returned at least once", pct(m.repeatRate, 1)],
              [
                "Typical gap between visits",
                org.calibration.medianGapDays == null
                  ? "—"
                  : `${count(org.calibration.medianGapDays)} days`,
              ],
              ["Visits per card in the window", nm.avgVisits.toFixed(2)],
              ["Visits per member in the window", m.avgVisits.toFixed(2)],
              ["Median member tenure", medTenure == null ? "—" : `${count(medTenure)} days`],
            ]}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            A repeat rate over 92 days answers &ldquo;did they come back&rdquo;. Retention answers
            &ldquo;did they stop&rdquo;, and only the second one needs a clock this build does not yet have
            on the card.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Neither identity can answer. Rare, and it must not read as a broken page. */
function NoTierCanAnswer({
  cohorts, card, orgName,
}: {
  cohorts: Awaited<ReturnType<typeof getSnapshot>>["cohorts"];
  card: ReturnType<typeof cardVerdict>;
  orgName: string;
}) {
  return (
    <Card title={`Retention cannot be measured at ${orgName} yet`}>
      <p className="max-w-[95ch] text-[14px] leading-relaxed text-ink-secondary">
        Retention and churn are lapse-dependent, and both identities in this build are watching a window
        shorter than the {LAPSE_DOUBLED_DAYS} days that needs.
      </p>
      <div className="mt-4">
        <Facts
          rows={[
            [
              "Loyalty scan window",
              cohorts ? `${count(cohorts.grading.days)} days` : "no cohort data in this snapshot",
            ],
            ["Payment card window", `${count(card.windowDays)} days`],
            ["Needed", `${LAPSE_DOUBLED_DAYS} days`],
            ["Card capture unlocks", card.unlocksOn ? dayLabel(card.unlocksOn) : "—"],
          ]}
        />
      </div>
      <p className="mt-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
        This is a waiting problem rather than a building problem. Nothing here is estimated in the meantime,
        because a retention figure taken over half the required window reports everybody who has been quiet
        for a fortnight as churned.
      </p>
    </Card>
  );
}

function median(xs: number[]): number | null {
  const s = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

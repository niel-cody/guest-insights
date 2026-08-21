import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Facts, Pill, Tile } from "@/components/ui/Primitives";
import { ExplainDrawer } from "@/components/ui/ExplainDrawer";
import { getPeriods, getSnapshot } from "@/lib/data";
import { teamChecks } from "@/lib/checks";
import { count, money, pct, windowShort } from "@/lib/metrics";
import { VERDICT_LABEL, VERDICT_MEANING, VERDICT_TONE } from "@/lib/team";
import type { TeamVerdict } from "@/lib/types";
import { Unavailable } from "../../team/Unavailable";
import { Standfirst } from "@/components/shell/Standfirst";

export const dynamic = "force-static";
export const metadata = { title: "People Mapping" };

/** The order the queue is worked in: worst evidence first, not best. */
const ORDER: TeamVerdict[] = ["conflict", "collision", "proposed", "confirmed", "unmatched", "not-a-person"];

/**
 * People Mapping. The identity spine, and the thing the Team section divides by.
 *
 * ── It moved out of Team, and something had to move with it ────────────────
 *
 * This was the first screen in Team, placed there on the argument that a
 * reviewer who meets the league table before they meet the unproven matches
 * underneath it will believe the league table. That argument was right about
 * the risk and wrong about the fix: **this is not a report.** It is a review
 * queue a manager works through once and returns to when the roll changes, and
 * a queue sitting at the top of a reporting section is a chore in the path of
 * everybody who came to read something.
 *
 * So it lives in Admin, where configuration lives, and the caveat it used to
 * carry by adjacency now travels to the two reports that actually depend on it.
 * `SpineChip` sits in the header of Performance and Margin, states how many of
 * the joins beneath those figures are unproven, and links back here. The rule
 * this preserves is the one that mattered: **no reader reaches a per-person
 * figure without being told what it was divided by.**
 *
 * Everything downstream — sales per labour hour, cost per head, who to put on
 * Friday dinner — is a division of something the POS knows by something the
 * rostering system knows. The two systems have never been introduced: at Meat
 * Flour Wine the POS holds 53 identities, Tanda holds 83 employees, and **not
 * one id appears in both**. Five names match exactly.
 *
 * The queue is ordered worst-evidence-first, so the rows most likely to be
 * wrong are the rows a manager sees on arrival.
 *
 * ── The screen is a queue, not a result ────────────────────────────────────
 *
 * Matching at this quality of name data cannot be finished by an algorithm, and
 * pretending otherwise is how a wage figure ends up attached to the wrong human
 * being. The output is therefore a review list a manager can work through, with
 * the evidence for each row written out, sorted so the four rows most likely to
 * be wrong are the four rows they see first.
 */
export default async function TeamPeoplePage({
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
      title="People Mapping"
      section="Admin"
      checks={checks.length ? checks : undefined}
    />
  );

  if (!team) {
    return (
      <>
        {header}
        <Page>
          <EmptyState
            title="This snapshot predates the team extract"
            body="Re-run `npm run extract -- --team` to add it. Nothing is inferred in the meantime."
          />
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

  const i = team.integrity;
  const win = windowShort(team.window);
  const costable = i.counts.confirmed + i.counts.proposed;
  const people = i.posIdentities - i.counts["not-a-person"];
  const grouped = ORDER.map((v) => ({ verdict: v, rows: team.links.filter((l) => l.verdict === v) }))
    .filter((g) => g.rows.length);
  /**
   * Venue names carry the organisation's name as a prefix, and a column of
   * "Meat Flour Wine - Berwick" spends its width saying the same three words on
   * every row. Stripped from the org's own name rather than from a literal, so
   * the next organisation does not need a second rule.
   */
  const shortVenue = (name: string) =>
    name.startsWith(org.name) ? name.slice(org.name.length).replace(/^\s*[-–—]\s*/, "") || name : name;
  const notPeople = team.links.filter((l) => l.verdict === "not-a-person");
  const notPeopleNet = notPeople.reduce((a, l) => a + l.net, 0);

  return (
    <>
      {header}
      <Page>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
          <Standfirst
            question="Do the till and the rostering system agree who a person is?"
            body={
              <>
                They do not.{" "}
                <strong className="text-ink">
                  {count(i.idMatches)} of {count(i.posIdentities)} till logins appear in the{" "}
                  {i.vendor === "TANDA" ? "Tanda" : (i.vendor ?? "workforce")} employee roll by id
                </strong>{" "}
                — not few, none — and {count(i.exactNameMatches)} match on an exact name. Everything
                else in this section divides one system by the other, so this page decides what the
                rest of it is allowed to say. Work the queue from the top: it is ordered
                worst-evidence-first.
              </>
            }
          />

          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="On the till"
              value={count(i.posIdentities)}
              detail={`${count(people)} of them a person · ${count(i.counts["not-a-person"])} shared or system logins`}
              meta={`Rang at least one completed order, ${win}`}
            />
            <Tile
              label="On the roll"
              value={count(i.employees)}
              detail={`${count(i.waged)} waged · ${count(i.salaried)} salaried`}
              meta="Active employees only — the sync keeps no leavers"
              info={
                <p>
                  The vendor sync holds only currently-active employees, so anybody who left during
                  the window is absent from the roll and cannot be matched at all. That is a property
                  of the feed, not a failure of the matcher, and it is why{" "}
                  {count(i.orphanEmployees)} employee ids appear in the timesheet data with no roll
                  entry behind them.
                </p>
              }
            />
            <Tile
              label="Safe to cost"
              value={count(costable)}
              accent="var(--warning)"
              detail={`${count(i.counts.confirmed)} confirmed · ${count(i.counts.proposed)} proposed`}
              meta={`${pct(costable / Math.max(1, people))} of the people on the till`}
              footnote={
                <>
                  {count(i.counts.proposed)} of these {count(costable)} are{" "}
                  <strong className="text-ink">proposals, not proofs</strong> — a unique first name
                  at a venue with nothing contradicting it. They are costed and they are marked
                  everywhere they appear.
                </>
              }
            />
            <Tile
              label="Trade the spine can cost"
              value={money(i.costedNet)}
              detail={`${count(i.costedOrders)} orders`}
              meta={`${pct(i.costedNet / Math.max(1, team.totals.net))} of net sales, ${win}`}
              footnote={
                <>
                  The remaining {money(team.totals.net - i.costedNet)} was rung by a login that
                  cannot be tied to an employee. It is counted in every venue total on the Margin
                  report and attributed to nobody on Performance.
                </>
              }
            />
          </div>

          {/* ── the queue ─────────────────────────────────────────────────── */}
          <Card
            title="The review queue"
            subtitle="Worst evidence first. A manager working down this list from the top fixes the rows most likely to be wrong before touching the rows that are probably right."
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="px-5 py-2.5 font-medium">On the till</th>
                    <th className="px-3 py-2.5 font-medium">On the roll</th>
                    <th className="px-3 py-2.5 font-medium">Venue</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-3 py-2.5 text-right font-medium">Net sales</th>
                    <th className="px-5 py-2.5 font-medium">Evidence</th>
                  </tr>
                </thead>
                {grouped.map(({ verdict, rows }) => (
                  <tbody key={verdict}>
                    <tr className="border-b border-line bg-surface-sunken">
                      <td colSpan={6} className="px-5 py-2.5">
                        <div className="flex flex-wrap items-baseline gap-2.5">
                          <Pill tone={VERDICT_TONE[verdict]}>
                            {VERDICT_LABEL[verdict]} · {rows.length}
                          </Pill>
                          <span className="max-w-[95ch] text-[12px] leading-relaxed text-ink-secondary">
                            {VERDICT_MEANING[verdict]}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {rows.map((l) => (
                      <tr key={l.posId} className="border-b border-line last:border-b-0">
                        <td className="px-5 py-2.5 font-medium text-ink">{l.posLabel}</td>
                        <td className="px-3 py-2.5 text-ink-secondary">
                          {l.empLabel ?? <span className="text-ink-muted">—</span>}
                          {l.rivals.length > 0 && (
                            <span className="block text-[12px] text-ink-muted">
                              also on this employee: {l.rivals.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink-secondary">
                          {shortVenue(l.storeName)}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink">{count(l.orders)}</td>
                        <td className="tnum px-3 py-2.5 text-right text-ink">{money(l.net)}</td>
                        <td className="px-5 py-2.5 text-[12px] leading-relaxed text-ink-secondary">
                          {l.evidence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Card>

          {/* ── shared logins ─────────────────────────────────────────────── */}
          <Card
            title="Logins that are not a person"
            subtitle="Real trade, attributable to nobody. A finding, not a matching failure."
          >
            <p className="max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              {count(notPeople.length)} logins rang {money(notPeopleNet)} —{" "}
              {pct(notPeopleNet / Math.max(1, team.totals.net))} of net sales — and none of them is
              somebody whose performance can be discussed. A shared training login is used by
              whoever is training that night; a blank-named user is a till nobody claimed.
            </p>
            <p className="mt-2.5 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              This trade is <strong className="text-ink">counted in every venue total</strong> on the
              Margin report and <strong className="text-ink">attributed to nobody</strong> on
              Performance. Quietly folding it into a named person&rsquo;s figures is how a league
              table acquires a leader who does not exist.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="py-2 pr-3 font-medium">Login</th>
                    <th className="px-3 py-2 text-right font-medium">Orders</th>
                    <th className="px-3 py-2 text-right font-medium">Net sales</th>
                    <th className="px-3 py-2 text-right font-medium">Days used</th>
                    <th className="py-2 pl-3 font-medium">Venue</th>
                  </tr>
                </thead>
                <tbody>
                  {notPeople.map((l) => (
                    <tr key={l.posId} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3 font-medium text-ink">{l.posLabel}</td>
                      <td className="tnum px-3 py-2 text-right text-ink">{count(l.orders)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink">{money(l.net)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">{count(l.days)}</td>
                      <td className="py-2 pl-3 text-ink-secondary">
                        {shortVenue(l.storeName)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── the feed's own hygiene ────────────────────────────────────── */}
          <Card
            title="What the feed itself is missing"
            subtitle="Not defects in this report. Defects in the data underneath it, named so they can be fixed at source."
            explain={
              <ExplainDrawer
                label="How the feed quality figures are measured"
                title="What the feed itself is missing"
                showing={
                  <p>
                    Each row is a property of the data underneath this report, not of the report. The
                    two below the table are the ones that change what the section is allowed to
                    publish, which is why they are stated in full rather than left as counts.
                  </p>
                }
                made={
                  <p>
                    Every figure was measured over the same window as the rest of the report. None is
                    estimated and none is worked around silently — where one of these blocks a
                    calculation, the calculation is refused elsewhere in the section and this is the
                    reason why.
                  </p>
                }
              />
            }
          >
            <Facts
              rows={[
                [
                  "Employee ids in timesheets with no entry on the roll",
                  <span key="a">
                    {count(i.orphanEmployees)} · {money(i.orphanCost)} of wage cost
                  </span>,
                ],
                [
                  "Cost segments with no start time",
                  <span key="b">
                    {count(i.nullStartSegments)} · {money(i.nullStartCost)}
                  </span>,
                ],
                [
                  "Waged employees with no contracted weekly hours",
                  <span key="c">
                    {count(i.wagedWithoutContractedHours)} of {count(i.waged)}
                  </span>,
                ],
                [
                  "Rostering departments, and what they roll up to",
                  <span key="d">
                    {count(i.departments)} names → {count(i.sections)} sections
                  </span>,
                ],
                [
                  "Orders carrying a cost of goods",
                  <span key="e">{pct(i.costCoverage)}</span>,
                ],
              ]}
            />
            <div className="mt-4 flex flex-col gap-3">
              <EmptyState
                title={`${count(i.orphanEmployees)} people were paid and are not on the roll`}
                body={
                  <>
                    They carry {money(i.orphanCost)} of wage cost in this window and cannot be
                    matched to a till login, because the vendor sync retains only active employees.
                    Anyone who left during the window is invisible to the matcher by construction.
                    Their cost is still counted in every venue total — dropping it would understate
                    the wage bill — but their sales cannot be attributed to them.
                  </>
                }
                tone="warning"
              />
              <EmptyState
                title={`Cost of goods is recorded on ${pct(i.costCoverage)} of orders`}
                body={
                  <>
                    This is why nothing in this section says <em>gross</em> margin. Margin here means{" "}
                    <strong className="text-ink">net sales minus wage cost</strong>, and it is named
                    that on every screen. Gross profit per employee is not a reporting problem, it is
                    a menu-costing programme, and a figure derived from a field that is{" "}
                    {pct(1 - i.costCoverage)} empty would be confident and wrong.
                  </>
                }
                tone="warning"
              />
            </div>
          </Card>

          {/* ── the names ─────────────────────────────────────────────────── */}
          <Card
            title="About the names on this screen"
            explain={
              <ExplainDrawer
                label="How the names are generated"
                title="About the names on this screen"
                showing={
                  <p>
                    What you see is a synthetic pair that <strong>preserves the evidence</strong>.
                    Where a real surname initial agreed, the synthetic one agrees. Where the second
                    token told you nothing, it still tells you nothing. Section codes pass through
                    untouched, because they are half of why this join is hard.
                  </p>
                }
                made={
                  <p>
                    Every verdict, count and figure on this page was computed against the real names.
                    Names are then substituted through a salted hash whose salt is not committed, so
                    a name cannot be replayed against the warehouse. In production the same code
                    reads the real names directly and this substitution does not happen.
                  </p>
                }
              />
            }
          >
            <p className="max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              Employees are people and this snapshot lives in a repository, so{" "}
              <strong className="text-ink">no real name leaves the warehouse</strong> — the same rule
              the guest reports follow. The matching ran on the real strings; the names drawn above
              are synthetic stand-ins that keep the same evidence.
            </p>
          </Card>
        </div>
      </Page>
    </>
  );
}

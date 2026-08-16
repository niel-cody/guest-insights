import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, CheckBadge, EmptyState, Tile } from "@/components/ui/Primitives";
import { IconArrow } from "@/components/shell/Icons";
import { GuestFlowChart } from "@/components/charts/GuestFlowChart";
import { GrowthWaterfall, RealVsPriceBar } from "@/components/charts/GrowthWaterfall";
import { getAllOrgs, getGuests, getSnapshot } from "@/lib/data";
import { runChecks } from "@/lib/checks";
import { derivedFromDisplayed } from "@/lib/checks";
import {
  SEGMENT_LABEL, count, coverageState, decompose, delta, memberFlow, money, monthLabel,
  pct, ratio, rollUpSegments, tileCount, windowShort,
} from "@/lib/metrics";

export const dynamic = "force-static";

export default async function OverviewPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const snap = await getSnapshot(slug);
  const guests = await getGuests(slug);
  const orgs = await getAllOrgs();
  const { org, coverage, segments, members, decomposition } = snap;
  const cov = coverageState(org, snap.coverage);
  const checks = runChecks(snap, guests);
  const w = org.window;

  const flow = memberFlow(snap.lifecycle);
  const latest = flow.at(-1);

  // Every month in the snapshot is a complete month inside the honest window, so
  // a first-to-last comparison is like-for-like by construction.
  const first = decomposition[0];
  const last = decomposition.at(-1);
  const growth = first && last && first !== last ? decompose(first, last) : null;

  const cs = members.crossSection;
  const identifiedPeople = cs.member.people + cs.nonMember.people;
  const memberLift = cs.lifts.spendPerPerson;

  // Members only — a lifecycle verdict on a card is a claim we cannot support.
  const stands = rollUpSegments(segments, "member").filter((s) => s.guests > 0);
  const standsTotal = stands.reduce((a, s) => a + s.guests, 0);
  const standsSpend = stands.reduce((a, s) => a + s.spend, 0);

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Overview"
        coverage={cov}
        actions={
          <CheckBadge href={`/${org.slug}/coverage#checks`} checks={checks} />
        }
      />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          {/* ── where you sit ─────────────────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Revenue you can attribute"
              value={pct(cov.identifiedRevenueShare, 0)}
              hint={`Revenue grain, ${windowShort(w)}. Denominator is all completed trade in the window, including cash.`}
              accent="var(--accent)"
              footnote={
                <>
                  {pct(cov.scannedRevenueShare, 1)} scanned · {pct(cov.identifiedRevenueShare - cov.scannedRevenueShare, 1)} added
                  by the card
                </>
              }
            />
            <Tile
              label="People you can name"
              value={count(tileCount(identifiedPeople))}
              hint={`Distinct people identified by card or enrolment over ${w.days} days. Not the number of customers you served — that is unknowable.`}
              accent="var(--tier-card)"
              footnote={`${count(tileCount(cs.member.people))} enrolled · ${count(tileCount(cs.nonMember.people))} card only`}
            />
            <Tile
              label="A member is worth"
              value={memberLift >= 1 ? ratio(memberLift) : delta(memberLift)}
              hint="Per person over the window, against a card-recognised non-member. Association, not effect — the Members screen separates them."
              accent={memberLift >= 0 ? "var(--tier-member)" : "var(--warning)"}
              footnote={
                <>
                  {money(cs.member.spendPerPerson)} against {money(cs.nonMember.spendPerPerson)}
                </>
              }
            />
            <Tile
              label="Members not recognised"
              value={pct(members.opportunity.unscanned.share, 0)}
              hint="Share of known members' orders on which nobody scanned. Fixable at the till, with no programme and no budget."
              accent="var(--warning)"
              footnote={`${count(members.opportunity.unscanned.orders)} orders · ${money(members.opportunity.unscanned.revenue)}`}
            />
          </div>

          {/* ── the sentence ──────────────────────────────────────────────── */}
          <Card>
            <p className="max-w-[90ch] text-[15px] leading-relaxed text-ink">
              Over {windowShort(w)} you served {money(coverage.totals.revenue)} across{" "}
              {count(coverage.totals.orders)} orders. You can put{" "}
              <strong>{pct(cov.identifiedRevenueShare, 0)}</strong> of that revenue against a person you could
              recognise again — where a loyalty CRM, which only sees a scan, would show{" "}
              <strong>{pct(cov.scannedRevenueShare, 1)}</strong>.{" "}
              {memberLift > 0.15 ? (
                <>
                  Your {count(cs.member.people)} members are worth <strong>{ratio(memberLift)}</strong> a
                  recognised non-member, and the reason is frequency rather than basket: they return{" "}
                  {cs.member.avgVisits.toFixed(1)} times against {cs.nonMember.avgVisits.toFixed(1)} while
                  spending {delta(cs.lifts.spendPerVisit)} per visit.
                </>
              ) : (
                <>
                  Your {count(cs.member.people)} members return {delta(cs.lifts.visits)} more often than a
                  recognised non-member, but each visit is a smaller party, so over the window a member is worth{" "}
                  <strong>{delta(memberLift)}</strong> — the frequency is real and it is being cancelled by
                  party size.
                </>
              )}{" "}
              <Link href={`/${org.slug}/members`} className="font-medium text-accent hover:underline">
                The evidence, and what it will not claim →
              </Link>
            </p>
          </Card>

          {/* ── where everybody stands ────────────────────────────────────── */}
          <Card
            title="Where your members stand"
            subtitle={`${count(standsTotal)} enrolled people, classified against their own visit cadence. Every row opens the people behind it.`}
            padded={false}
          >
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                  <th className="px-5 py-2.5 text-left font-medium">Segment</th>
                  <th className="px-3 py-2.5 text-right font-medium">People</th>
                  <th className="px-3 py-2.5 text-right font-medium">Share</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spend</th>
                  <th className="px-3 py-2.5 text-right font-medium">Per head</th>
                  <th className="px-3 py-2.5 text-right font-medium">Share of spend</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {stands.map((s) => (
                  <tr key={s.segment} className="border-b border-line last:border-b-0 hover:bg-surface-hover">
                    <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">
                      {SEGMENT_LABEL[s.segment]}
                    </th>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{count(s.guests)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                      {pct(s.guests / standsTotal, 1)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-ink-secondary">{money(s.spend)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-medium text-ink">
                      {money(s.spend / Math.max(s.guests, 1))}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                      {pct(s.spend / Math.max(standsSpend, 1), 1)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link
                        href={`/${org.slug}/guests?segment=${s.segment}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                      >
                        Open <IconArrow className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-5 py-3 text-[12px] text-ink-muted">
              Only enrolled people are classified. A card cannot be told apart from a card that was reissued, so
              a lifecycle verdict on one would be a guess — the field is empty at source, not hidden here.
            </p>
          </Card>

          {/* ── flow ──────────────────────────────────────────────────────── */}
          <Card
            title="Members gained and lost"
            subtitle={`Enrolled members only — ${pct(cov.memberRevenueShare, 1)} of revenue. New and reactivated above the line, lapsed below it.`}
            right={
              latest && (
                <div className="text-right">
                  <div className="tnum text-[15px] font-semibold text-ink">
                    {(() => {
                      const net = derivedFromDisplayed(latest.gained, latest.lost, (a, b) => a - b);
                      return `${net >= 0 ? "+" : "−"}${count(Math.abs(net))}`;
                    })()}
                  </div>
                  <div className="text-[12px] text-ink-muted">
                    net in {monthLabel(latest.month)} · {count(tileCount(latest.gained))} gained,{" "}
                    {count(tileCount(latest.lost))} lost
                  </div>
                </div>
              )
            }
          >
            {flow.length >= 2 ? (
              <GuestFlowChart flow={flow} />
            ) : (
              <EmptyState
                title="Not enough months to draw a flow"
                body={`The honest window is ${w.months} complete months of trustworthy card data. A flow chart needs at least two.`}
              />
            )}
            <p className="mt-4 max-w-[90ch] text-[12px] text-ink-muted">
              A lapse is dated: a member lapses on the day their gap since the last visit crosses{" "}
              {org.calibration.lapsedDays} days
              {org.calibration.lapsedEstimable ? "" : ", the canonical threshold, because this window is too short to estimate one"}
              . Gained and lost are counted on the same threshold, so the net is a statement with a date on it
              rather than a snapshot artefact.
            </p>
          </Card>

          {/* ── growth ────────────────────────────────────────────────────── */}
          {growth ? (
            <Card
              title="Where the change came from"
              subtitle={`${monthLabel(growth.from.month)} to ${monthLabel(growth.to.month)}, across identified guests. Symmetric Shapley, so the parts sum to the whole exactly and no residual bar is needed.`}
              right={
                <span
                  className="tnum text-[15px] font-semibold"
                  style={{ color: growth.revenueChange >= 0 ? "var(--good)" : "var(--loss)" }}
                >
                  {growth.revenueChange >= 0 ? "+" : "−"}{money(Math.abs(growth.revenueChange))}
                </span>
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
                    Each label states the direction the factor actually moved, not the direction its name
                    implies. Price per item moved{" "}
                    {money(growth.to.pricePerItem - growth.from.pricePerItem)} — the bar beside it is that
                    movement&apos;s contribution to revenue, which is a different quantity and a much larger one.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card title="Where the change came from">
              <EmptyState
                title="Not enough complete months to decompose"
                body="A decomposition needs two complete months either side of the comparison. The honest window does not yet contain them."
              />
            </Card>
          )}
        </div>
      </Page>
    </>
  );
}

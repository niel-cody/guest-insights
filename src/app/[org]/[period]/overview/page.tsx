import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Tile } from "@/components/ui/Primitives";
import { IconArrow } from "@/components/shell/Icons";
import { SegmentScatter, SegmentTreemap } from "@/components/charts/SegmentCharts";
import { SelectionCorrection, ValuePanels } from "@/components/charts/ValuePanels";
import { TrustPanel } from "@/components/ui/TrustPanel";
import { Disclosure } from "@/components/ui/Disclosure";
import { GrowthWaterfall, RealVsPriceBar } from "@/components/charts/GrowthWaterfall";
import { BasketMix } from "@/components/ui/BasketMix";
import { getPeriods, getAllOrgs, getGuestRows, getSnapshot } from "@/lib/data";
import { runChecks } from "@/lib/checks";
import {
  SEGMENT_COLOUR, SEGMENT_LABEL, attributionPct, basketMix, basketStory, causalReading, count, coverageState,
  decompose, delta, money, monthLabel, opportunityPerVenueWeek, pct, ratio, rollUpSegments,
  tileCount, valueClaims, windowShort,
} from "@/lib/metrics";

export const dynamic = "force-static";

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

  const { org, coverage, segments, members, decomposition, scatter } = snap;
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
  const standsTotal = stands.reduce((a, s) => a + s.guests, 0);
  const standsSpend = stands.reduce((a, s) => a + s.spend, 0);
  const standsVisits = stands.reduce((a, s) => a + s.visits, 0);

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
              Every tile carries a subordinate line that is **always visible**.
              There are no info icons and no hover tooltips anywhere on this
              page (§8 rule 7): hover does not exist on touch, and a tile that
              needs a tooltip is not finished. The previous prototype shipped
              four icons that rendered nothing at all. */}
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="People you can name"
              value={count(tileCount(identifiedPeople))}
              accent="var(--tier-card)"
              footnote={
                <>
                  {count(tileCount(cs.member.people))} enrolled · {count(tileCount(cs.nonMember.people))} card only
                  <span className="mt-1 block text-ink-muted">
                    Card tier · {win} · identified by payment card, whether or not anybody scanned
                  </span>
                </>
              }
            />
            <Tile
              label="Revenue you can attribute"
              value={attributionPct(cov.identifiedRevenueShare)}
              accent="var(--accent)"
              footnote={
                <>
                  {attributionPct(cov.scannedRevenueShare)} scanned ·{" "}
                  {attributionPct(cov.identifiedRevenueShare - cov.scannedRevenueShare)} added by the card
                  <span className="mt-1 block text-ink-muted">
                    Revenue grain · {win} · of {money(coverage.totals.revenue)} completed trade
                  </span>
                </>
              }
            />
            {/* The hard rule in §5.2, enforced rather than remembered: this tile
                does not exist unless the correction below it does. */}
            {causal.causal ? (
              <Tile
                label="A member is worth"
                value={memberLift >= 1 ? ratio(memberLift) : delta(memberLift)}
                accent="var(--tier-member)"
                footnote={
                  <>
                    {money(cs.member.spendPerPerson)} against {money(cs.nonMember.spendPerPerson)}
                    <span className="mt-1 block text-ink-muted">
                      Association, not effect. {pct(causal.selectionShare ?? 0, 0)} of this gap was already
                      there — see below.
                    </span>
                  </>
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
                    <strong className="text-ink-secondary">Not published.</strong> The observed gap is
                    struck through rather than shown, because nothing in this window separates it from
                    selection — the within-person estimate needs more people who enrolled mid-window than
                    this merchant has. A gap that cannot be separated from selection is not a member value.
                  </span>
                }
              />
            )}
            <Tile
              label="Members not recognised"
              value={pct(opp.unscanned.share, 0)}
              accent="var(--warning)"
              footnote={
                <>
                  {count(opp.unscanned.orders)} orders · {money(opp.unscanned.revenue)}
                  <span className="mt-1 block text-ink-muted">
                    Known members&apos; orders with no scan · {win} · fixable at the till
                  </span>
                </>
              }
            />
          </div>

          {/* ── §5.3 one sentence ──────────────────────────────────────────── */}
          <Card>
            <p className="max-w-[100ch] text-[15px] leading-relaxed text-ink">
              Over {win} you served {money(coverage.totals.revenue)} across {count(coverage.totals.orders)}{" "}
              orders, and can put <strong>{attributionPct(cov.identifiedRevenueShare)}</strong> of that
              revenue against {count(identifiedPeople)} people you could recognise again — where a loyalty
              CRM, which only sees a scan, would show{" "}
              <strong>{attributionPct(cov.scannedRevenueShare)}</strong>.
            </p>
          </Card>

          {/* ── §5.4 where your members stand ────────────────────────────────
              Table and charts side by side. The charts are the visual language
              carried over from the report this replaces, because operators like
              them and read them quickly — rebuilt on the whole population rather
              than on the scanned sixth of it. */}
          <Card
            title="Where your members stand"
            subtitle={`${count(standsTotal)} enrolled people, classified against their own visit cadence. Every row opens the people behind it.`}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                      <th className="py-2 pr-3 text-left font-medium">Segment</th>
                      <th className="px-2 py-2 text-right font-medium">People</th>
                      <th className="px-2 py-2 text-right font-medium">Share</th>
                      <th className="px-2 py-2 text-right font-medium">Spend</th>
                      <th className="px-2 py-2 text-right font-medium">Per head</th>
                      <th className="px-2 py-2 text-right font-medium">Share of spend</th>
                      <th className="py-2 pl-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {stands.map((s) => (
                      <tr key={s.segment} className="border-b border-line last:border-b-0 hover:bg-surface-hover">
                        <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                              style={{ background: SEGMENT_COLOUR[s.segment] }}
                            />
                            {SEGMENT_LABEL[s.segment]}
                          </span>
                        </th>
                        <td className="tnum px-2 py-2 text-right text-ink">{count(s.guests)}</td>
                        <td className="tnum px-2 py-2 text-right text-ink-secondary">
                          {pct(s.guests / Math.max(standsTotal, 1), 1)}
                        </td>
                        <td className="tnum px-2 py-2 text-right text-ink-secondary">{money(s.spend)}</td>
                        <td className="tnum px-2 py-2 text-right font-medium text-ink">
                          {money(s.spend / Math.max(s.guests, 1))}
                        </td>
                        <td className="tnum px-2 py-2 text-right text-ink-secondary">
                          {pct(s.spend / Math.max(standsSpend, 1), 1)}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <Link
                            href={`/${org.slug}/${period}/guests?tier=member&segment=${s.segment}`}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                          >
                            Open <IconArrow className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* §4.5: the boundary rules render on the page. A GM will argue
                    with the first verdict that says one of their regulars has
                    gone, and "it is in the code" is not an answer. */}
                <div className="mt-4 rounded-lg border border-line bg-surface-sunken px-4 py-3">
                  <p className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
                    Where the boundaries fall
                  </p>
                  <dl className="mt-2 grid gap-x-5 gap-y-1.5 text-[12px] sm:grid-cols-2">
                    {[
                      ["Seen once", "exactly one visit in the window"],
                      ["New", "two visits — one gap is not a habit"],
                      [
                        "Regulars",
                        `ten or more visits, last seen within ${org.calibration.lapsedDays} days`,
                      ],
                      ["Established", "three to nine visits, still inside their own usual gap"],
                      ["Slipping", "more than twice their own usual gap since the last visit"],
                      ["Lapsed", `no visit for ${org.calibration.lapsedDays} days`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="shrink-0 font-medium text-ink">{k}</dt>
                        <dd className="text-ink-secondary">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2.5 max-w-[80ch] text-[12px] leading-relaxed text-ink-muted">
                    An inferred verdict needs <strong>three visits</strong> minimum: with two you have
                    exactly one gap, and a broken habit is not estimable from one observation. Slipping and
                    Lapsed are measured against{" "}
                    <strong>each guest&apos;s own cadence</strong>, not a rule applied to everybody. Only
                    enrolled people are classified — a card cannot be told apart from a card that was
                    reissued, so a lifecycle verdict on one would be a guess, and the field is empty at
                    source rather than hidden here.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {scatter ? (
                  <SegmentScatter scatter={scatter} windowLabel={win} />
                ) : (
                  <EmptyState
                    title="No scatter in this snapshot"
                    body="The per-person plot is extracted separately from the guest grid so it can draw the whole classifiable population. This snapshot predates it."
                  />
                )}

                {/* The pairing is the point: a segment that is large in traffic
                    and small in revenue is visible across two panels and
                    invisible in either alone. Same colour per segment in both. */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <SegmentTreemap
                    title="Who drives traffic?"
                    items={stands.map((s) => ({ key: s.segment, label: s.label, value: s.visits }))}
                    format={(v) => `${count(v)} visits`}
                    population={`${count(standsVisits)} visits by enrolled people`}
                    windowLabel={win}
                  />
                  <SegmentTreemap
                    title="Who delivers revenue?"
                    items={stands.map((s) => ({ key: s.segment, label: s.label, value: s.spend }))}
                    format={(v) => money(v)}
                    population={`${money(standsSpend)} from enrolled people`}
                    windowLabel={win}
                  />
                </div>
              </div>
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
                <Tile
                  label="Their trade in the window"
                  value={money(opp.candidates.spend)}
                  accent="var(--accent)"
                  footnote={
                    <>
                      {pct(opp.candidates.spend / Math.max(cs.nonMember.spend, 1), 0)} of non-member spend
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
                        a quarter · 95% CI on a within-person lift of {delta(opp.uplift.lift, 1)} (
                        {delta(opp.uplift.lo, 1)} to {delta(opp.uplift.hi, 1)})
                      </p>
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

          {/* ── §5.7 the trust panel. Coverage lives here, not as its own
                 report — a diagnostics page operators had to be told to open is
                 what it was before. */}
          <TrustPanel snap={snap} checks={checks} coverage={cov} />

          {/* ── §5.8 behind progressive disclosure ───────────────────────────
              The decomposition, the product mix and the method notes. **Caveats
              never collapse** — everything above this point stays open, and
              there is no simple/advanced toggle anywhere. */}
          {growth && (
            <Disclosure
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

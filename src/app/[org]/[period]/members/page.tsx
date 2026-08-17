import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { BasketMix } from "@/components/ui/BasketMix";
import { Card, EmptyState, Facts, Pill, Tile } from "@/components/ui/Primitives";
import { IconAlert, IconArrow, IconCheck, IconInfo } from "@/components/shell/Icons";
import { getPeriods, getAllOrgs, getSnapshot } from "@/lib/data";
import {
  causalReading, count, coverageState, delta, money, monthLabel, pct, ratio, valueClaims, windowShort, basketMix, basketStory, attributionPct, scanRatePct} from "@/lib/metrics";
import type { ValueClaim } from "@/lib/metrics";

export const dynamic = "force-static";

function formatClaim(v: number | null, unit: ValueClaim["unit"]): string {
  if (v === null) return "—";
  if (unit === "money") return money(v);
  if (unit === "rate") return pct(v, 0);
  return v.toFixed(2);
}

/**
 * One row of the value case.
 *
 * The lift is deliberately not colour-coded good/bad. Members spending less per
 * visit is not a failure, it is a fact about party size, and painting it red
 * teaches the reader to skip it — which is exactly how the category ends up
 * publishing only the flattering half of this table.
 */
function ClaimRow({ claim }: { claim: ValueClaim }) {
  const refused = claim.refusal !== null;
  return (
    <div className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="text-[14px] font-semibold text-ink">{claim.question}</h3>
        {!refused && (
          <div className="flex items-baseline gap-5">
            <span className="text-[13px] text-ink-secondary">
              non-member <span className="tnum font-medium text-ink">{formatClaim(claim.nonMember, claim.unit)}</span>
            </span>
            <span className="text-[13px] text-ink-secondary">
              member <span className="tnum font-medium text-ink">{formatClaim(claim.member, claim.unit)}</span>
            </span>
            <span
              className="tnum min-w-[68px] text-right text-[17px] font-semibold"
              style={{ color: claim.lift !== null && claim.lift >= 0 ? "var(--good)" : "var(--ink)" }}
            >
              {claim.lift === null ? "—" : claim.lift >= 1 ? ratio(claim.lift) : delta(claim.lift)}
            </span>
          </div>
        )}
        {refused && <Pill tone="warning">Not published</Pill>}
      </div>

      <p className="mt-1.5 text-[12px] text-ink-muted">{claim.basis}</p>

      {claim.note && !refused && (
        <p className="mt-2 max-w-[80ch] text-[13px] leading-relaxed text-ink-secondary">{claim.note}</p>
      )}
      {refused && (
        <div className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-3.5 py-3">
          <span style={{ color: "var(--warning)" }}><IconAlert className="h-4 w-4" /></span>
          <p className="max-w-[80ch] text-[13px] leading-relaxed text-ink-secondary">{claim.refusal}</p>
        </div>
      )}
    </div>
  );
}

export default async function MembersPage({ params }: { params: Promise<{ org: string; period: string }> }) {
  const { org: slug, period } = await params;
  const snap = await getSnapshot(slug, period);
  const orgs = await getAllOrgs();
  const periods = await getPeriods(slug);
  const current = periods.periods.find((p) => p.id === period)!;
  const { org, members: m } = snap;
  const cov = coverageState(org, snap.coverage);
  const claims = valueClaims(m, org);
  // Null on a snapshot extracted before item data existed, which is why every
  // consumer guards rather than assuming the file is there.
  const mix = snap.items ? basketMix(snap.items) : null;
  const story = mix ? basketStory(mix) : null;
  const causal = causalReading(m);
  const cs = m.crossSection;
  const w = m.window;

  const headline = claims.find((c) => c.key === "spendPerPerson")!;
  const identifiedPeople = cs.member.people + cs.nonMember.people;

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        periods={periods}
        period={current}
        title="Members"
        coverage={cov}
      />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          {/* ── the answer ────────────────────────────────────────────────── */}
          <Card
            title="Are your members worth more?"
            subtitle={`${count(identifiedPeople)} people identified by their payment card at ${org.name}, ${windowShort(w)}. ${count(cs.member.people)} of them have enrolled.`}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <Tile
                label="A member is worth"
                value={money(cs.member.spendPerPerson)}
                hint={`Mean spend per enrolled person across ${w.days} days. Not annualised — the window is ${w.months} months and the product does not extrapolate it.`}
                accent="var(--tier-member)"
                footnote={`over ${w.days} days · median ${money(cs.member.medianSpendPerPerson)}`}
              />
              <Tile
                label="Everyone else"
                value={money(cs.nonMember.spendPerPerson)}
                hint="Mean spend per person recognised by their payment card who has never enrolled. Same window, same venues, same grain."
                accent="var(--tier-card)"
                footnote={`over ${w.days} days · median ${money(cs.nonMember.medianSpendPerPerson)}`}
              />
              <Tile
                label="Difference"
                value={headline.lift === null ? "—" : headline.lift >= 1 ? ratio(headline.lift) : delta(headline.lift)}
                hint="Association, not effect. See the panel below."
                accent={headline.lift !== null && headline.lift >= 0 ? "var(--good)" : "var(--warning)"}
                footnote="per person, not per visit"
              />
            </div>

            <p className="mt-5 max-w-[85ch] text-[14px] leading-relaxed text-ink-secondary">
              {headline.lift !== null && headline.lift > 0.15 ? (
                <>
                  A member is worth <strong className="text-ink">{ratio(headline.lift)}</strong> a non-member
                  here, and <strong className="text-ink">almost none of that is basket size</strong> — members
                  spend {delta(cs.lifts.spendPerVisit)} per visit. The whole difference is that they come back:{" "}
                  {cs.member.avgVisits.toFixed(1)} visits against {cs.nonMember.avgVisits.toFixed(1)} over the
                  same {w.days} days.
                </>
              ) : (
                <>
                  Over {w.days} days a member is worth{" "}
                  <strong className="text-ink">{delta(headline.lift ?? 0)}</strong> a non-member here — which is
                  not the answer a loyalty programme wants, and it is not the whole answer either. Members
                  return {delta(cs.lifts.visits)} more often and repeat at{" "}
                  {ratio(m.detection.correctedRepeatLift)} the rate, but each visit is a much smaller table:{" "}
                  {(cs.member.itemsPerVisit).toFixed(1)} items against {cs.nonMember.itemsPerVisit.toFixed(1)}.
                  The frequency they bring is being cancelled by the party size they do not.
                </>
              )}
            </p>
          </Card>

          {/* ── the six claims ────────────────────────────────────────────── */}
          <Card
            title="The same question, six ways"
            subtitle="Each figure carries its own window, grain and denominator, because they disagree — and the disagreement is the finding."
            padded={false}
          >
            {claims.map((c) => <ClaimRow key={c.key} claim={c} />)}
          </Card>

          {/* ── what the two sides are actually buying ────────────────────────
              This sits directly under the six figures because it explains one
              of them. The per-visit spend gap has been published unexplained:
              standardising for daypart moved it by less than two points, so
              *when* members come is not the reason their basket is smaller.
              Category mix is. */}
          {mix && story && (
            <Card
              title="Members and everyone else are not buying the same things"
              subtitle={`Reporting group, ${windowShort(org.window)}. Both sides are person-grain identified trade, so a member who forgot to scan is still counted as a member.`}
            >
              <p className="mb-4 max-w-[92ch] text-[15px] leading-relaxed text-ink">
                Members buy <strong>{story.over.label}</strong> at{" "}
                <strong>{story.over.index!.toFixed(2)}×</strong> the rate everybody else does, and{" "}
                <strong>{story.under.label}</strong> at{" "}
                <strong>{story.under.index!.toFixed(2)}×</strong>.{" "}
                {cs.lifts.spendPerVisit < 0 ? (
                  <>
                    This is the missing half of the {delta(cs.lifts.spendPerVisit)} per-visit gap above.
                    Standardising for daypart moved that gap by{" "}
                    {delta(m.standardisedBasket.lift - m.standardisedBasket.crude.lift)}, so <em>when</em>{" "}
                    members come is not the reason their basket is smaller.{" "}
                    <strong>What they put in it is.</strong> A member is a coffee run; a non-member is more
                    often a coffee and something from the cabinet.
                  </>
                ) : (
                  <>
                    The two baskets differ by composition as well as by size, so a single per-visit average
                    describes neither side well.
                  </>
                )}
              </p>
              <BasketMix rows={mix} minLines={snap.items!.totals.minLinesForIndex} />
            </Card>
          )}

          {/* ── association vs effect ─────────────────────────────────────── */}
          <Card
            title="Does enrolling change anything, or do the loyal simply enrol?"
            subtitle="The question every loyalty report answers by accident."
          >
            {causal.causal ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Tile
                    label="Observed gap"
                    value={ratio(causal.association)}
                    hint="Cross-sectional. Members against non-members, as they are."
                    accent="var(--ink-muted)"
                    footnote="association"
                  />
                  <Tile
                    label="Caused by enrolling"
                    value={delta(causal.causal.lift, 1)}
                    hint={`Within-person: the same ${count(causal.causal.n)} guests compared against themselves, before and after their first scan.`}
                    accent="var(--good)"
                    footnote={`95% CI ${delta(causal.causal.lo, 1)} to ${delta(causal.causal.hi, 1)} · n=${count(causal.causal.n)}`}
                  />
                  <Tile
                    label="Was already there"
                    value={causal.selectionShare === null ? "—" : pct(causal.selectionShare, 0)}
                    hint="The share of the observed gap the within-person design does not explain — people who were already coming back, choosing to enrol."
                    accent="var(--warning)"
                    footnote="selection, not effect"
                  />
                </div>
                <p className="mt-5 max-w-[85ch] text-[14px] leading-relaxed text-ink-secondary">
                  Both numbers are real and they answer different questions. The observed gap sizes the base you
                  already have: your members are the {pct(cs.member.people / identifiedPeople, 0)} of recognised
                  guests who produce {pct(cs.member.spend / (cs.member.spend + cs.nonMember.spend), 0)} of
                  recognised revenue. The within-person figure is what signing somebody up is worth — much
                  smaller, and the only one of the two you may use to justify the programme.
                </p>
                <div className="mt-4 rounded-lg border border-line bg-surface-sunken px-4 py-3.5">
                  <p className="max-w-[85ch] text-[13px] leading-relaxed text-ink-secondary">
                    <strong className="text-ink">Method.</strong> {count(causal.causal.n)} guests were seen
                    anonymously on a card and later began scanning, with at least 21 days either side. Each is
                    compared against themselves, so selection into enrolment cannot produce the effect. Two
                    biases remain and both run downward: first scan is a proxy for enrolment, and the after-window
                    is closed by the window end rather than by a visit. The estimate is therefore conservative.
                  </p>
                </div>
              </>
            ) : (
              <EmptyState
                tone="warning"
                title="Not enough people changed state to answer this"
                body={
                  <>
                    <p>{causal.refusal}</p>
                    <p className="mt-2">
                      The cross-sectional gap of {delta(causal.association)} stays on the page above, labelled as
                      association. No opportunity value is published from it — applying a selection-driven gap to
                      an enrolment forecast is how a business talks itself into a programme that cannot pay for
                      itself.
                    </p>
                  </>
                }
              />
            )}
          </Card>

          {/* ── where the growth is ───────────────────────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Regulars you have not signed up"
              subtitle={`Card-recognised people with two or more visits who have never enrolled, ${windowShort(w)}.`}
            >
              <Facts
                rows={[
                  ["People", count(m.opportunity.candidates.people)],
                  ["Their spend in the window", money(m.opportunity.candidates.spend)],
                  [
                    "Share of non-member spend",
                    pct(m.opportunity.candidates.spend / Math.max(cs.nonMember.spend, 1), 0),
                  ],
                ]}
              />
              {m.opportunity.uplift ? (
                <div className="mt-4 rounded-lg border border-line bg-surface-sunken px-4 py-3.5">
                  <p className="text-[13px] leading-relaxed text-ink-secondary">
                    If every one of them enrolled and behaved the way switchers actually behaved, that is{" "}
                    <strong className="tnum text-ink">{money(m.opportunity.uplift.value)}</strong> a quarter
                    <span className="text-ink-muted">
                      {" "}({money(m.opportunity.uplift.valueLo)} – {money(m.opportunity.uplift.valueHi)})
                    </span>
                    . Sized on the within-person uplift of {delta(m.opportunity.uplift.lift, 1)}, never on the
                    observed gap — the observed gap would put this figure roughly twenty times higher and every
                    dollar of it would be selection.
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    tone="warning"
                    title="Sized, but not valued"
                    body="The population is real and countable. What enrolling them would be worth is not, because the within-person estimate above could not be made here. The list is still the right list to work; the number attached to it would be invented."
                  />
                </div>
              )}
              <Link
                href={`/${org.slug}/${period}/guests?tier=card&minVisits=2`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
              >
                Open in the guest list <IconArrow className="h-3.5 w-3.5" />
              </Link>
            </Card>

            <Card
              title="Members you did not recognise"
              subtitle="Trade from people you already know, on visits where nobody scanned."
            >
              <Facts
                rows={[
                  ["Unrecognised orders", count(m.opportunity.unscanned.orders)],
                  ["Revenue on them", money(m.opportunity.unscanned.revenue)],
                  ["Share of members' orders", pct(m.opportunity.unscanned.share, 0)],
                  ["Cards scanned on some visits only", count(m.linkage.cardsSometimesScanned)],
                ]}
              />
              <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                {count(m.opportunity.unscanned.orders)} orders were placed by people you already know, who simply
                did not scan. This is the one number on this page that needs no programme, no campaign and no
                budget to move — only the prompt at the till. It is also why the member figures above are
                measured through the card rather than the scan: a member who forgets is still the same person.
              </p>
              <p className="mt-3 text-[12px] text-ink-muted">
                Members scan on {scanRatePct(cs.member.scanPerVisit)} of visits. A loyalty CRM sees only those, which
                is why it reports {attributionPct(cov.scannedRevenueShare)} of revenue where the card shows{" "}
                {attributionPct(cov.memberRevenueShare)}.
              </p>
            </Card>
          </div>

          {/* ── what this page refuses ────────────────────────────────────── */}
          <Card
            title="What this page will not tell you"
            subtitle="Published so the claims that are made can be trusted."
          >
            <ul className="flex flex-col gap-3">
              {[
                m.enrolment.estimable
                  ? null
                  : "What enrolling somebody is worth here. The within-person design has too few switchers in this window.",
                m.coverBasis.member.coverage < 0.9
                  ? `Whether members spend more per head. Party size is recorded on ${pct(m.coverBasis.member.coverage, 0)} of member orders against ${pct(m.coverBasis.nonMember.coverage, 0)} of everyone else's, and not at random.`
                  : null,
                `Anything before ${monthLabel(w.start)}. Card recognition produced no usable data for ${org.cardTier.quality.filter((q) => q.reason === "no card capture").length} months before it, so there is no member history to trend and none is drawn.`,
                "Lifetime value. Three months of card data cannot support a lifetime, and a number that assumes one is a forecast wearing a measurement's clothes.",
                "Whether a member would have come anyway on any given visit. The within-person estimate is an average over a population, not a per-visit attribution.",
                cs.member.people < 500
                  ? `Anything at venue grain for members. ${count(cs.member.people)} members across ${org.venues.length} venues is too thin to split.`
                  : null,
              ]
                .filter(Boolean)
                .map((line) => (
                  <li key={line as string} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 text-ink-muted"><IconInfo /></span>
                    <span className="max-w-[85ch] text-[13px] leading-relaxed text-ink-secondary">{line}</span>
                  </li>
                ))}
            </ul>
          </Card>

          {/* ── how a person is resolved ──────────────────────────────────── */}
          <Card
            title="How a person is counted"
            subtitle="The change that made this comparison publishable."
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                  Both columns on this page are <strong className="text-ink">people identified by their payment
                  card</strong>. One group has enrolled. That is a like-for-like contrast — the earlier build set
                  enrolled humans against payment instruments, counting the same person twice when they scanned
                  once and paid anonymously the next time. It is a grain mismatch, and no statistical control
                  repairs one.
                </p>
                <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                  A card seen on a scanned order belongs to that member on every other order it appears on. That
                  is what lets a member&apos;s unscanned spend count toward them, and it is why membership is an
                  attribute of a person here rather than a rival identity tier.
                </p>
              </div>
              <Facts
                rows={[
                  ["Cards seen in the window", count(m.linkage.cards)],
                  ["Resolved to an enrolled member", count(m.linkage.cardsLinkedToMember)],
                  ["Visits with a scan", `${scanRatePct(cs.member.scanPerVisit)} of member visits`],
                  [
                    "Cards seen on more than one member",
                    <span key="c" className="flex items-center justify-end gap-1.5">
                      {count(m.linkage.cardsOnMultipleMembers)}
                      <span className="text-ink-muted">
                        ({pct(m.linkage.cardsOnMultipleMembers / Math.max(m.linkage.cards, 1), 2)})
                      </span>
                    </span>,
                  ],
                  [
                    "Detection correction applied",
                    <span key="d" className="flex items-center justify-end gap-1.5">
                      <IconCheck className="h-3.5 w-3.5" style={{ color: "var(--good)" }} />
                      {pct(m.detection.observedRepeatRate)} → {pct(m.detection.correctedRepeatRate)}
                    </span>,
                  ],
                ]}
              />
            </div>
            <p className="mt-4 text-[12px] text-ink-muted">
              A shared card is attributed to whichever member used it most. That affects{" "}
              {pct(m.linkage.cardsOnMultipleMembers / Math.max(m.linkage.cards, 1), 2)} of cards and is published
              rather than hidden.
            </p>
          </Card>
        </div>
      </Page>
    </>
  );
}

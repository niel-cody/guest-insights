import Link from "next/link";
import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, CheckBadge, EmptyState, Facts, Tile } from "@/components/ui/Primitives";
import { IconArrow, IconInfo } from "@/components/shell/Icons";
import { VenueNetwork } from "@/components/charts/VenueNetwork";
import { getAllOrgs, getGuests, getSnapshot } from "@/lib/data";
import { runChecks } from "@/lib/checks";
import { count, coverageState, delta, money, pct, windowShort } from "@/lib/metrics";

export const dynamic = "force-static";

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

export default async function VenuesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const snap = await getSnapshot(slug);
  const guests = await getGuests(slug);
  const orgs = await getAllOrgs();
  const { org, network } = snap;
  const cov = coverageState(org, snap.coverage);
  const checks = runChecks(snap, guests);
  const w = network.window;
  const cv = network.crossVenue;
  const byId = new Map(network.nodes.map((n) => [n.id, n]));
  const withResidual = network.edges.filter((e) => e.residual != null);
  const ranked = withResidual.slice(0, 8);
  const geocoded = network.nodes.filter((n) => n.lat != null).length;

  // The point that raw co-visitation ranks by venue size is worth making, but it
  // has to be made from the data rather than asserted — the ranks move whenever
  // the population definition does. Find the pair the two rankings disagree on
  // most, and let it speak for itself.
  const sharedOrder = [...withResidual].sort((a, b) => b.shared - a.shared);
  const reorder = (() => {
    let best: { a: string; b: string; shared: number; sharedRank: number; residualRank: number } | null = null;
    sharedOrder.forEach((e, i) => {
      const residualRank = withResidual.findIndex((r) => r.a === e.a && r.b === e.b) + 1;
      const drop = residualRank - (i + 1);
      if (i < 6 && (!best || drop > best.residualRank - best.sharedRank)) {
        best = { a: e.a, b: e.b, shared: e.shared, sharedRank: i + 1, residualRank };
      }
    });
    return best as { a: string; b: string; shared: number; sharedRank: number; residualRank: number } | null;
  })();

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Venues"
        coverage={cov}
        actions={<CheckBadge href={`/${org.slug}/coverage#checks`} checks={checks} />}
      />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Venues"
              value={count(network.nodes.length)}
              hint="Venues trading in the analysis window, resolved on store id."
              accent="var(--accent)"
              footnote={`${geocoded} geocoded`}
            />
            <Tile
              label="Guests who cross venues"
              value={pct(cv.multiShareOfPeople, 1)}
              hint={`Of the ${count(cv.single.people + cv.multi.people)} people this report counts — enrolled, or a card seen at least twice. A single-visit card cannot cross venues, so including those would measure visit frequency rather than movement.`}
              accent="var(--tier-card)"
              footnote={`${count(cv.multi.people)} people`}
            />
            <Tile
              label="They spend"
              value={delta(cv.spendLift)}
              hint="Per person against a countable guest who stays at one venue. Like-for-like: both groups have had the chance to visit a second venue."
              accent={cv.spendLift >= 0 ? "var(--good)" : "var(--warning)"}
              footnote={`${money(cv.multi.spendPerPerson)} against ${money(cv.single.spendPerPerson)}`}
            />
            <Tile
              label="Share of spend"
              value={pct(cv.multiShareOfSpend, 1)}
              hint="Their share of the counted population's spend, against their share of its headcount."
              accent="var(--tier-member)"
              footnote={`from ${pct(cv.multiShareOfPeople, 1)} of the people`}
            />
          </div>

          {network.decay.refusal ? (
            <Card title="The venue network" subtitle={`${org.name}, ${windowShort(w)}.`}>
              <EmptyState
                tone="warning"
                title="Not enough venues to model"
                body={
                  <>
                    <p>{network.decay.refusal}</p>
                    {network.edges.length === 1 && byId.get(network.edges[0].a) && (
                      <p className="mt-2">
                        What can be said is a sentence:{" "}
                        <strong>{count(network.edges[0].shared)} guests</strong> visited both{" "}
                        {byId.get(network.edges[0].a)!.name} and {byId.get(network.edges[0].b)!.name}, against{" "}
                        {count(network.edges[0].expected)} if the two were unrelated — a lift of{" "}
                        {network.edges[0].lift.toFixed(2)}× across {network.edges[0].km?.toFixed(1)} km. A
                        network of one edge is a sentence, and this is it.
                      </p>
                    )}
                  </>
                }
              />
            </Card>
          ) : (
            <>
              <Card
                title="Which venues share the same guests"
                subtitle={`Lines join venues that share more guests than the distance between them predicts. ${count(network.pairsTested)} pairs tested, ${count(network.edges.length)} carry enough shared guests to measure.`}
              >
                <VenueNetwork network={network} />
              </Card>

              <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
                <Card
                  title="Pairs that beat their distance"
                  subtitle="Ranked by how far each exceeds the fitted decay curve — not by shared guests, which would rank by venue size."
                  padded={false}
                >
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                        <th className="px-5 py-2.5 text-left font-medium">Pair</th>
                        <th className="px-3 py-2.5 text-right font-medium">Apart</th>
                        <th className="px-3 py-2.5 text-right font-medium">Shared</th>
                        <th className="px-3 py-2.5 text-right font-medium">Expected</th>
                        <th className="px-5 py-2.5 text-right font-medium">Beats distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((e) => (
                        <tr key={`${e.a}|${e.b}`} className="border-b border-line last:border-b-0">
                          <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">
                            {byId.get(e.a)?.name} – {byId.get(e.b)?.name}
                          </th>
                          <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                            {e.km?.toFixed(1)} km
                          </td>
                          <td className="tnum px-3 py-2.5 text-right text-ink-secondary">{count(e.shared)}</td>
                          <td className="tnum px-3 py-2.5 text-right text-ink-muted">{count(e.expected)}</td>
                          <td
                            className="tnum px-5 py-2.5 text-right font-semibold"
                            style={{ color: (e.residual ?? 0) >= 1.5 ? "var(--good)" : "var(--ink)" }}
                          >
                            {e.residual?.toFixed(1)}×
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted">
                    &quot;Expected&quot; is the shared guests you would see if visiting one venue said nothing
                    about visiting the other.{" "}
                    {reorder && (
                      <>
                        Normalising by it, and then by distance, is what reorders this table:{" "}
                        <strong className="text-ink-secondary">
                          {byId.get(reorder.a)?.name} – {byId.get(reorder.b)?.name}
                        </strong>{" "}
                        is {ordinal(reorder.sharedRank)} on shared guests with {count(reorder.shared)}, and{" "}
                        {ordinal(reorder.residualRank)} once size and distance are removed. A network drawn on
                        raw counts would rank by venue size and call the biggest venues the closest friends.
                      </>
                    )}
                  </p>
                </Card>

                <Card
                  title="Distance explains most of it"
                  subtitle="Which is what makes the exceptions worth reading."
                >
                  <Facts
                    rows={[
                      ["Pairs in the model", count(network.decay.n)],
                      ["Distance explains", pct(network.decay.r2, 0)],
                      ["Decay exponent", network.decay.slope.toFixed(2)],
                      ["Minimum shared guests", count(network.minShared)],
                      ["Pairs below that bar", count(network.pairsSuppressed)],
                    ]}
                  />
                  <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                    Co-visitation falls with distance almost exactly as a gravity model predicts, and distance
                    alone accounts for {pct(network.decay.r2, 0)} of the variation between pairs. That is the
                    reason this surface exists: once geography is taken out, what remains is a relationship
                    between two venues that geography does not explain — a commuter route, a corridor, a
                    catchment that straddles both.
                  </p>
                  {network.decay.extrapolatedPairs > 0 && (
                    <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-muted">
                      <span className="mt-0.5 shrink-0"><IconInfo /></span>
                      <span>
                        {network.decay.extrapolatedPairs} pairs closer than{" "}
                        {network.decay.supportFloorKm.toFixed(1)} km carry no residual. The curve runs to
                        infinity as distance runs to zero and too few pairs sit that close to constrain it, so
                        the model would report a confident number it cannot support.
                      </span>
                    </p>
                  )}
                </Card>
              </div>
            </>
          )}

          <Card
            title="The guest who crosses venues"
            subtitle={`Compared against a countable guest who stays at one venue, ${windowShort(w)}.`}
          >
            <div className="grid gap-6 md:grid-cols-2">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="py-2 text-left font-medium" />
                    <th className="py-2 text-right font-medium">One venue</th>
                    <th className="py-2 text-right font-medium">Two or more</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["People", count(cv.single.people), count(cv.multi.people)],
                    ["Visits per person", cv.single.visitsPerPerson.toFixed(2), cv.multi.visitsPerPerson.toFixed(2)],
                    ["Spend per person", money(cv.single.spendPerPerson), money(cv.multi.spendPerPerson)],
                    ["Total spend", money(cv.single.spend), money(cv.multi.spend)],
                  ].map(([k, a, b]) => (
                    <tr key={k} className="border-b border-line last:border-b-0">
                      <th scope="row" className="py-2 text-left font-medium text-ink">{k}</th>
                      <td className="tnum py-2 text-right text-ink-secondary">{a}</td>
                      <td className="tnum py-2 text-right font-medium text-ink">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div>
                <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                  A guest who uses more than one venue visits {delta(cv.visitLift)} more often and spends{" "}
                  {delta(cv.spendLift)} more than one who does not. They are{" "}
                  {pct(cv.multiShareOfPeople, 1)} of the counted population and{" "}
                  {pct(cv.multiShareOfSpend, 1)} of its spend.
                </p>
                <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                  <strong className="text-ink">The denominator matters here</strong> and it is easy to get
                  wrong. Measured against every card ever seen this group looks far more valuable again — but
                  most of that population was seen once and <em>could not</em> have visited a second venue, so
                  the gap would be measuring visit frequency rather than movement between venues. Comparing
                  only against guests who had the same opportunity gives {delta(cv.spendLift)}.
                </p>
                <Link
                  href={`/${org.slug}/guests?minVenues=2`}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
                >
                  Open these guests <IconArrow className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </Card>

          <Card title="What this map is not" subtitle="Published so what it does show can be trusted.">
            <ul className="flex flex-col gap-3">
              {[
                "Where your guests live. We know where they transact. A catchment drawn from transactions is a catchment of convenience, not of residence, and no heat surface is drawn over these points for that reason.",
                "Drive time. Distances are straight-line between venue coordinates. Two venues either side of a lake are closer here than any driver would agree.",
                network.ungeocoded.length
                  ? `${network.ungeocoded.length} of this org's venues have no coordinate and are absent from the map: ${network.ungeocoded.join(", ")}. Estate-wide only about a third of stores are geocoded.`
                  : "Every venue trading in this window carries a coordinate from the platform, so none are missing from the map.",
                `Anything about pairs sharing fewer than ${network.minShared} guests. ${count(network.pairsSuppressed)} pairs fall below that and are not drawn — at these volumes a handful of shared guests is coincidence.`,
                "A causal claim. Two venues sharing guests does not say the second took trade from the first. It says the same people use both, which is the beginning of that question and not the answer.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-ink-muted"><IconInfo /></span>
                  <span className="max-w-[85ch] text-[13px] leading-relaxed text-ink-secondary">{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Page>
    </>
  );
}

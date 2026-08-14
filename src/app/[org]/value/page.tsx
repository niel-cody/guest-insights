import { Page, PageHeader } from "@/components/shell/PageHeader";
import { Card, EmptyState, Pill, Tile } from "@/components/ui/Primitives";
import { getAllOrgs, getSnapshot } from "@/lib/data";
import { count, coverageState, money, pct, tileCount, valueBands } from "@/lib/metrics";

export default async function ValuePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [snap, orgs] = await Promise.all([getSnapshot(slug), getAllOrgs()]);
  const { org, coverage, segments, comparison } = snap;

  const cov = coverageState(org, coverage);
  const bands = valueBands(segments);
  const totalSpend = bands.reduce((a, b) => a + b.spend, 0);
  const totalGuests = bands.reduce((a, b) => a + b.guests, 0);
  const top = bands.at(-1);

  // MQ2 — members versus everyone else. The comparison the whole category
  // publishes badly.
  const byTier = (tier: "member" | "card") => {
    const rows = comparison.filter((r) => r.tier === tier);
    const orders = rows.reduce((a, r) => a + r.orders, 0);
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const items = rows.reduce((a, r) => a + r.avgItems * r.orders, 0);
    const withCovers = rows.reduce((a, r) => a + r.ordersWithCovers, 0);
    const covers = rows.reduce((a, r) => a + (r.avgCovers ?? 0) * r.ordersWithCovers, 0);
    const coveredRevenue = rows.reduce((a, r) => a + (r.spendPerCover ?? 0) * (r.avgCovers ?? 0) * r.ordersWithCovers, 0);
    return {
      orders, revenue,
      avgOrder: orders ? revenue / orders : 0,
      avgItems: orders ? items / orders : 0,
      coversShare: orders ? withCovers / orders : 0,
      avgCovers: withCovers ? covers / withCovers : 0,
      spendPerCover: covers ? coveredRevenue / covers : 0,
      /* Average order value on covered orders ONLY. Comparing a per-cover figure
         drawn from 38% of one group's orders against one drawn from 97% of the
         other's is not a controlled comparison — it is the same confound in a new
         hat. Everything in the controlled branch is measured on this basis. */
      avgOrderCovered: withCovers ? coveredRevenue / withCovers : 0,
    };
  };

  const m = byTier("member");
  const c = byTier("card");
  // A party-size control needs party size on enough orders to mean anything, AND
  // it needs party size to actually vary. In a takeaway cafe every recorded party
  // is one person: the control is present, reports nothing, and saying "controlled
  // for party size" would be true and misleading at the same time.
  const measured = m.coversShare >= 0.2 && c.coversShare >= 0.2;
  const partiesVary = Math.abs(m.avgCovers - c.avgCovers) > 0.05 || m.avgCovers > 1.05;
  const gap = c.avgOrder ? (m.avgOrder - c.avgOrder) / c.avgOrder : 0;
  const itemGap = c.avgItems ? (m.avgItems - c.avgItems) / c.avgItems : 0;
  const pricePerItem = { member: m.avgItems ? m.avgOrder / m.avgItems : 0, card: c.avgItems ? c.avgOrder / c.avgItems : 0 };
  const priceGap = pricePerItem.card ? (pricePerItem.member - pricePerItem.card) / pricePerItem.card : 0;
  // The like-for-like gap: per person at the table, on the covered subset only.
  const coveredGap = c.spendPerCover ? (m.spendPerCover - c.spendPerCover) / c.spendPerCover : 0;

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Value"
        coverage={cov}
      />
      <Page>
        <div className="mx-auto max-w-[1240px] space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label={`${org.labels.guests[0].toUpperCase()}${org.labels.guests.slice(1)} with a habit`}
              value={count(tileCount(totalGuests))}
              accent="var(--gain-returning)"
              hint="Person grain, excluding guests seen only once. Value bands are drawn only from this population."
            />
            <Tile
              label="Their spend"
              value={money(totalSpend)}
              accent="var(--good)"
              hint="Total attributed spend across the analysis window."
            />
            <Tile
              label="Top fifth's share"
              value={top ? pct(top.spend / (totalSpend || 1), 0) : "—"}
              accent="var(--tier-member)"
              hint="Share of attributed spend from the highest-value quintile."
              footnote={top ? <>{count(top.guests)} people</> : null}
            />
            <Tile
              label="Average per guest"
              value={money(totalSpend / (totalGuests || 1))}
              accent="var(--tier-card)"
              hint="Person grain — one human who paid for themselves. Never a per-card figure."
            />
          </div>

          <Card
            title="Value bands"
            subtitle="Quintiles of this business's own spend distribution, not fixed dollar cuts. Person grain."
            padded={false}
          >
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-secondary">
                  <th className="px-5 py-2 font-medium">Band</th>
                  <th className="px-3 py-2 text-right font-medium">{org.labels.guests}</th>
                  <th className="px-3 py-2 text-right font-medium">Spend range</th>
                  <th className="px-3 py-2 text-right font-medium">Total spend</th>
                  <th className="px-5 py-2 text-right font-medium">Share of spend</th>
                </tr>
              </thead>
              <tbody>
                {[...bands].reverse().map((b) => {
                  const share = b.spend / (totalSpend || 1);
                  return (
                    <tr key={b.band} className="border-b border-line last:border-0 hover:bg-surface-hover">
                      <td className="px-5 py-2 font-medium text-ink">
                        {["Lowest fifth", "Second", "Middle fifth", "Fourth", "Top fifth"][b.band - 1]}
                      </td>
                      <td className="tnum px-3 py-2 text-right">{count(b.guests)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">
                        {money(b.minSpend)} – {money(b.maxSpend)}
                      </td>
                      <td className="tnum px-3 py-2 text-right">{money(b.spend)}</td>
                      <td className="px-5 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
                            <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: "var(--tier-member)" }} />
                          </div>
                          <span className="tnum w-10 text-right font-medium">{pct(share, 0)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card
            title="Are members worth more?"
            subtitle="MQ2. The comparison every loyalty report publishes, and almost every one publishes wrong."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TierPanel label="Enrolled members" tone="member" d={m} org={org} />
              <TierPanel label="Recognised by card" tone="card" d={c} org={org} />
            </div>

            <div className="mt-5 border-t border-line pt-4">
              {measured && partiesVary ? (
                <>
                  <p className="text-[15px] leading-relaxed text-ink">
                    Taken across every order, members appear to spend{" "}
                    <strong style={{ color: gap >= 0 ? "var(--good)" : "var(--critical)" }}>
                      {pct(Math.abs(gap), 0)} {gap >= 0 ? "more" : "less"}
                    </strong>
                    . That comparison is not sound, and here is why.
                  </p>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink">
                    Restricted to orders that record a party size — the only orders where a
                    like-for-like comparison exists — members spend{" "}
                    <strong>{money(m.avgOrderCovered)}</strong> an order against{" "}
                    <strong>{money(c.avgOrderCovered)}</strong>, for{" "}
                    <strong>{m.avgCovers.toFixed(2)}</strong> people against{" "}
                    <strong>{c.avgCovers.toFixed(2)}</strong>. Per person at the table that is{" "}
                    <strong style={{ color: coveredGap >= 0 ? "var(--good)" : "var(--critical)" }}>
                      {money(m.spendPerCover)}
                    </strong>{" "}
                    against <strong>{money(c.spendPerCover)}</strong> —{" "}
                    <strong>{pct(Math.abs(coveredGap), 0)} {coveredGap >= 0 ? "more" : "less"}</strong>.
                  </p>
                  {Math.sign(coveredGap) !== Math.sign(gap) && (
                    <p className="mt-2 rounded-lg border px-3 py-2 text-[14px] leading-relaxed"
                       style={{ borderColor: "var(--warning)", color: "var(--ink)" }}>
                      <strong>The sign reverses.</strong> Judged on all orders members look{" "}
                      {gap >= 0 ? "better" : "worse"}; judged like-for-like they are{" "}
                      {coveredGap >= 0 ? "better" : "worse"}. Publishing the first number is how a
                      loyalty programme gets cut for the wrong reason.
                    </p>
                  )}
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                    Party size is recorded on {pct(m.coversShare, 0)} of member orders and{" "}
                    {pct(c.coversShare, 0)} of card orders. The controlled figures above are
                    measured on that covered subset for both groups, never one group&rsquo;s
                    covered orders against the other&rsquo;s total.
                    {m.coversShare < 0.8 && (
                      <> Getting party size onto the remaining {pct(1 - m.coversShare, 0)} of member
                      orders would make this the strongest comparison in the report.</>
                    )}
                  </p>
                </>
              ) : measured && !partiesVary ? (
                <>
                  <p className="text-[15px] leading-relaxed text-ink">
                    Members spend{" "}
                    <strong style={{ color: gap >= 0 ? "var(--good)" : "var(--critical)" }}>
                      {pct(Math.abs(gap), 0)} {gap >= 0 ? "more" : "less"}
                    </strong>{" "}
                    per order, and here that gap is real: every recorded party in this
                    business is one person, so it cannot be the group-size effect that
                    explains it almost everywhere else.
                  </p>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink">
                    They buy <strong>{m.avgItems.toFixed(2)}</strong> items against{" "}
                    <strong>{c.avgItems.toFixed(2)}</strong> — {pct(Math.abs(itemGap), 0)}{" "}
                    {itemGap >= 0 ? "more" : "fewer"} — at{" "}
                    <strong>{money(pricePerItem.member)}</strong> an item against{" "}
                    <strong>{money(pricePerItem.card)}</strong>. The difference is{" "}
                    {Math.abs(priceGap) > Math.abs(itemGap)
                      ? "mostly what they buy, not how much"
                      : "mostly how much they buy, not what"}
                    .
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                    Party size is recorded on {pct(m.coversShare, 0)} of member orders and{" "}
                    {pct(c.coversShare, 0)} of card orders and is 1.00 in both. The control was
                    applied and found nothing to control for — which is a result, not an
                    absence of one, and is different from never having checked.
                  </p>
                </>
              ) : (
                <EmptyState
                  tone="warning"
                  title="This comparison is not published"
                  body={
                    <>
                      <p>
                        Members average {money(m.avgOrder)} an order against {money(c.avgOrder)} —
                        a {pct(Math.abs(gap), 0)} {gap >= 0 ? "premium" : "shortfall"}. Publishing
                        that as a member-value finding would be wrong.
                      </p>
                      <p className="mt-2">
                        Party size is recorded on only {pct(m.coversShare, 0)} of member orders and{" "}
                        {pct(c.coversShare, 0)} of card orders. Without it there is no way to tell
                        whether one group spends more per <em>person</em> or simply buys for more
                        people, and that single confound reverses the sign in most hospitality
                        datasets. The product refuses the claim rather than qualifying it in a
                        footnote nobody reads.
                      </p>
                    </>
                  }
                />
              )}
            </div>
          </Card>

          <Card title="What this screen will not say" subtitle="The refusal list, on screen rather than in a design document.">
            <ul className="space-y-2 text-[13px] leading-relaxed text-ink-secondary">
              {[
                "A top-ten-by-spend list drawn from card records, because one card can pay for six people and the list would be ranking parties, not customers.",
                "Any member versus non-member comparison without a party-size control.",
                "An average spend per customer that is really an average per card.",
                "The word customer beside a payer record that may not be one person.",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--critical)" }} />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Page>
    </>
  );
}

function TierPanel({
  label, tone, d, org,
}: {
  label: string;
  tone: "member" | "card";
  d: { orders: number; avgOrder: number; avgItems: number; coversShare: number; avgCovers: number; spendPerCover: number };
  org: { labels: { visits: string } };
}) {
  return (
    <div className="rounded-xl border border-line p-4">
      <Pill tone={tone}>{label}</Pill>
      <dl className="mt-3 space-y-2 text-[13px]">
        {[
          ["Orders", count(d.orders)],
          ["Average order", money(d.avgOrder)],
          ["Items per order", d.avgItems.toFixed(2)],
          ["Party size recorded on", pct(d.coversShare, 0)],
          ["Average party", d.avgCovers ? d.avgCovers.toFixed(2) : "—"],
          ["Spend per person at table", d.spendPerCover ? money(d.spendPerCover) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-ink-secondary">{k}</dt>
            <dd className="tnum font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

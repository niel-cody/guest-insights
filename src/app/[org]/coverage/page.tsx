import { CoverageTrendChart } from "@/components/charts/CoverageTrendChart";
import { GapHistogram } from "@/components/charts/GapHistogram";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { Card, EmptyState, Facts, InvariantBadge, Pill, Tile } from "@/components/ui/Primitives";
import { getAllOrgs, getSnapshot } from "@/lib/data";
import { qualityFindings } from "@/lib/quality";
import { detectAnomalies, groupByVenue } from "@/lib/anomalies";
import {
  count, coverageState, dayLabel, invariants, money, monthLabel, pct,
} from "@/lib/metrics";

export default async function CoveragePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [snap, orgs] = await Promise.all([getSnapshot(slug), getAllOrgs()]);
  const { org, coverage, segments, lifecycle, linkage } = snap;

  const cov = coverageState(org, coverage);
  const checks = invariants(coverage, segments, null, lifecycle);
  const allOk = checks.every((c) => c.ok);
  const t = coverage.totals;
  const findings = qualityFindings(org, coverage, snap.comparison);
  const anomalies = detectAnomalies(snap.venueMonthly, org.cardTier.months, org.window.end);
  const grouped = groupByVenue(anomalies);

  const venues = [...coverage.byVenue]
    .map((v) => ({ ...v, identified: (v.memberRevenue + v.cardRevenue) / (v.revenue || 1) }))
    .sort((a, b) => a.identified - b.identified);

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Coverage"
        coverage={cov}
        actions={<InvariantBadge ok={allOk} count={checks.length} />}
      />
      <Page>
        <div className="mx-auto max-w-[1240px] space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Revenue we can attribute"
              value={pct(cov.identifiedRevenueShare, 0)}
              accent="var(--good)"
              hint="Share of revenue in the current card window traceable to a returning person."
              footnote={cov.currentWindow ? <>{monthLabel(cov.currentWindow.start)} – {monthLabel(cov.currentWindow.end)}</> : null}
            />
            <Tile
              label="From enrolment alone"
              value={pct(cov.memberRevenueShare, 0)}
              accent="var(--tier-member)"
              hint="What a loyalty CRM on its own would see."
              footnote={<>What every competitor is limited to</>}
            />
            <Tile
              label="Added by card recognition"
              value={pct(cov.cardRevenueShare, 0)}
              accent="var(--tier-card)"
              hint="Added by recognising the payment card, with no enrolment, app or scan."
              footnote={<>No app, no scan, no sign-up</>}
            />
            <Tile
              label="Card months available"
              value={`${cov.cardMonths.length} of ${org.cardTier.quality.length}`}
              accent={cov.cardTierComplete ? "var(--good)" : "var(--warning)"}
              hint="Months in the window where the payment reference is genuinely per-card."
              footnote={
                cov.cardTierComplete
                  ? <>Complete history</>
                  : <span style={{ color: "var(--warning)" }}>{cov.gaps.length} months unusable</span>
              }
            />
          </div>

          <Card
            title="What we could see, month by month"
            subtitle="Revenue grain. Hatched months are ones where card recognition was unavailable — not months when customers left."
          >
            <CoverageTrendChart coverage={coverage} org={org} />
          </Card>

          <Card
            title="Outside the bounds of normal"
            subtitle="Venues judged against their peers and against their own history. Median-based, so one bad venue cannot hide behind its own effect on the average."
            right={
              <span className="text-[12px] text-ink-muted">
                {anomalies.length} flagged of {org.venues.length} venues
              </span>
            }
            padded={false}
          >
            {grouped.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={
                    org.venues.length < 5
                      ? "Too few venues to compare against peers"
                      : "Nothing outside the bounds"
                  }
                  body={
                    org.venues.length < 5 ? (
                      <>
                        Peer comparison needs at least five venues before a median means
                        anything, and this business has {org.venues.length}. Each venue is still
                        tested against its own history, and nothing there is far enough out to
                        report.
                      </>
                    ) : (
                      <>
                        No venue sits more than 2.5 robust deviations from its peers or from its
                        own de-trended history on revenue per trading day, average order, scan
                        rate, party-size capture or discounting — and no move is large enough to
                        act on.
                      </>
                    )
                  }
                />
              </div>
            ) : (
              <ul>
                {grouped.map((g) => (
                  <li key={g.venue} className="border-b border-line px-5 py-4 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-ink">{g.venue}</h3>
                      {g.items.length > 1 && (
                        <Pill tone="critical">{g.items.length} signals</Pill>
                      )}
                      <span className="ml-auto text-[12px] text-ink-muted">
                        worst {g.worst.toFixed(1)}σ
                      </span>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {g.items.map((a) => (
                        <li key={a.id} className="flex gap-2.5">
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ background: a.severity === "high" ? "var(--critical)" : "var(--warning)" }}
                          />
                          <span className="text-[13px] leading-relaxed">
                            <span className="font-medium text-ink">
                              {a.kind === "peer" ? "Against the estate" : "Against its own history"}
                              {" — "}{a.metric}
                            </span>
                            <span className="text-ink-secondary"> · {a.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted">
              Flagged at a modified z-score of 2.5, computed from the median and median
              absolute deviation rather than the mean and standard deviation — with twenty
              venues, one outlier inflates a standard deviation enough to hide itself. A
              flag is a question worth asking, not a verdict.
            </p>
          </Card>

          <Card
            title="What to fix, and what it unlocks"
            subtitle="Every gap here is costing a specific answer. Ranked by what it blocks, not by how easy it is."
            right={
              <span className="text-[12px] text-ink-muted">
                {org.serviceModel === "table" ? "Table service" : "Counter service"}
              </span>
            }
            padded={false}
          >
            {findings.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Nothing is blocking an answer"
                  body="Every field this report depends on is being captured well enough to publish from."
                />
              </div>
            ) : (
              <ul>
                {findings.map((f) => (
                  <li key={f.id} className="border-b border-line px-5 py-4 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill
                        tone={
                          f.severity === "blocking" ? "critical"
                            : f.severity === "material" ? "warning" : "neutral"
                        }
                      >
                        {f.severity}
                      </Pill>
                      <h3 className="text-[14px] font-semibold text-ink">{f.title}</h3>
                      <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
                        {f.owner} fixes this
                      </span>
                    </div>
                    <p className="mt-1.5 max-w-[85ch] text-[13px] leading-relaxed text-ink-secondary">
                      {f.detail}
                    </p>
                    <p className="mt-1.5 max-w-[85ch] text-[13px] leading-relaxed">
                      <span className="font-medium text-ink">Unlocks: </span>
                      <span className="text-ink-secondary">{f.unlocks}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!cov.cardTierComplete && (
            <Card title="Why the card tier has gaps">
              <EmptyState
                tone="warning"
                title="The payment reference stopped being written, and nothing reported it"
                body={
                  <>
                    <p>
                      For {cov.gaps.filter((g) => g.reason === "no card capture").length} months
                      in this window, every card transaction at this merchant carried the{" "}
                      <em>same</em> payment reference — one value across hundreds of
                      thousands of payments. The field was never null, so the usual
                      coverage test (<code className="rounded bg-surface px-1 py-0.5 text-[12px]">COUNT(PAR)</code>)
                      scored it as fully covered.
                    </p>
                    <p className="mt-2">
                      A model that trusts presence rather than distinctness turns a month
                      of trade into a single fictional customer. This build tests the ratio
                      of distinct references to transactions and refuses the month instead.
                    </p>
                  </>
                }
              />

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-y border-line bg-surface-sunken text-left text-[12px] text-ink-secondary">
                      <th className="px-3 py-2 font-medium">Month</th>
                      <th className="px-3 py-2 text-right font-medium">Card payments</th>
                      <th className="px-3 py-2 text-right font-medium">Distinct cards</th>
                      <th className="px-3 py-2 text-right font-medium">Distinct per payment</th>
                      <th className="px-3 py-2 font-medium">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {org.cardTier.quality.map((q) => (
                      <tr key={q.month} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5 font-medium text-ink">{monthLabel(q.month)}</td>
                        <td className="tnum px-3 py-1.5 text-right">{count(q.txns)}</td>
                        <td className="tnum px-3 py-1.5 text-right">{count(q.distinctPar)}</td>
                        <td className="tnum px-3 py-1.5 text-right">{q.ratio.toFixed(3)}</td>
                        <td className="px-3 py-1.5">
                          {q.ok ? (
                            <Pill tone="good">usable</Pill>
                          ) : (
                            <Pill tone="warning">{q.reason}</Pill>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Coverage by venue"
              subtitle="Worst first. A venue well below the estate has a cause, and the cause is usually fixable."
              padded={false}
            >
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-ink-secondary">
                    <th className="px-5 py-2 font-medium">Venue</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2 text-right font-medium">Members</th>
                    <th className="px-5 py-2 text-right font-medium">Attributed</th>
                  </tr>
                </thead>
                <tbody>
                  {venues.map((v) => (
                    <tr key={v.storeId} className="border-b border-line last:border-0 hover:bg-surface-hover">
                      <td className="px-5 py-1.5 font-medium text-ink">{v.storeName}</td>
                      <td className="tnum px-3 py-1.5 text-right">{money(v.revenue)}</td>
                      <td className="tnum px-3 py-1.5 text-right text-ink-secondary">
                        {pct(v.memberRevenue / (v.revenue || 1), 0)}
                      </td>
                      <td className="px-5 py-1.5">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${v.identified * 100}%`, background: "var(--tier-member)" }}
                            />
                          </div>
                          <span className="tnum w-10 text-right font-medium">{pct(v.identified, 0)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="space-y-5">
              <Card title="How the numbers were built" subtitle="Every claim on every screen resolves to this.">
                <Facts
                  rows={[
                    ["Orders in window", count(t.orders)],
                    ["Revenue in window", money(t.revenue)],
                    ["Venues", String(org.venues.length)],
                    ["Payment terminals resolved", `${org.storeMap.terminals} across ${org.storeMap.venuesResolved} venues`],
                    ["Guests at person grain", count(segments.population)],
                    ["Median gap between visits", `${org.calibration.medianGapDays} days`],
                    ["Slipping threshold", `${org.calibration.slippingDays} days (calibrated)`],
                    ["Lapsed threshold", `${org.calibration.lapsedDays} days (calibrated, canonical ${org.calibration.canonicalLapsedDays})`],
                    ["Extracted", dayLabel(org.extractedAt.slice(0, 10))],
                  ]}
                />
                <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-secondary">
                  Payments are joined to orders on venue, order number and trading date.
                  Order number alone is unusable — it is reused 6.03 million times across
                  the estate — so the venue mapping is derived from the join itself and
                  collisions are dropped rather than counted.
                </p>
              </Card>

              <Card title="Reconciliation" subtitle="A failing check renders a failed state, never a wrong number.">
                <ul className="space-y-1.5">
                  {checks.map((c) => (
                    <li key={c.name} className="flex items-start justify-between gap-4 text-[13px]">
                      <span className="flex items-start gap-2">
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: c.ok ? "var(--good)" : "var(--critical)" }}
                        />
                        <span className="text-ink">{c.name}</span>
                      </span>
                      <span className="tnum shrink-0 text-ink-muted">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Why these thresholds"
              subtitle="Gaps between visits at this business, with the cuts drawn where its own data puts them."
            >
              <GapHistogram data={segments.gapHistogram} org={org} />
              <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-secondary">
                Half of all return visits here happen within{" "}
                <strong>{org.calibration.medianGapDays} days</strong>. A fixed 90-day lapse
                rule would call almost nobody lapsed at this business and almost everybody
                lapsed at a restaurant. Comparisons across businesses use the canonical{" "}
                {org.calibration.canonicalLapsedDays}-day rule and say so.
              </p>
            </Card>

            <Card
              title="Cards that belong to members"
              subtitle="Measured, not assumed — the foundation for card-to-member conversion."
            >
              <Facts
                rows={[
                  ["Distinct cards seen", count(linkage.cards)],
                  ["Also seen on an enrolled order", count(linkage.cardsLinkedToMember)],
                  ["Members who sometimes don't scan", count(linkage.cardsSometimesScanned)],
                  ["Their unscanned orders", count(linkage.unscannedOrdersOfKnownMembers)],
                  ["Cards used by more than one member", count(linkage.cardsOnMultipleMembers)],
                ]}
              />
              <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-secondary">
                {linkage.cardsSometimesScanned > 0 ? (
                  <>
                    <strong>{count(linkage.unscannedOrdersOfKnownMembers)}</strong> orders were
                    placed by people you already know, who simply did not scan. Those visits are
                    missing from every loyalty report you have ever run.
                  </>
                ) : (
                  <>No card in this window has been seen on both an enrolled and an anonymous order.</>
                )}
              </p>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}

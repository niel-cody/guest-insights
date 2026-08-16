import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, CheckBadge, EmptyState, Facts, Pill, Tile } from "@/components/ui/Primitives";
import { IconAlert, IconCheck, IconInfo } from "@/components/shell/Icons";
import { CoverageTrendChart } from "@/components/charts/CoverageTrendChart";
import { getAllOrgs, getGuests, getSnapshot } from "@/lib/data";
import { runChecks, type Check } from "@/lib/checks";
import { detectAnomalies, groupByVenue } from "@/lib/anomalies";
import { qualityFindings } from "@/lib/quality";
import { count, coverageState, dayLabel, money, monthLabel, pct, windowShort } from "@/lib/metrics";

export const dynamic = "force-static";

function CheckRow({ c }: { c: Check }) {
  const tone = c.ok ? "var(--good)" : c.severity === "warning" ? "var(--warning)" : "var(--critical)";
  return (
    <li className="border-b border-line px-5 py-3.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" style={{ color: tone }}>
          {c.ok ? <IconCheck className="h-4 w-4" /> : <IconAlert className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <code className="text-[12px] font-medium text-ink">{c.id}</code>
            {!c.ok && <Pill tone={c.severity === "warning" ? "warning" : "critical"}>
              {c.severity === "warning" ? "Review" : "Blocking"}
            </Pill>}
            {c.proof === "unit" && (
              <span className="text-[11px] text-ink-muted">proven in code, not by fixture</span>
            )}
          </div>
          <p className="mt-1 max-w-[90ch] text-[13px] leading-relaxed text-ink-secondary">{c.rule}</p>
          <p className="tnum mt-1 text-[12px] text-ink-muted">{c.detail}</p>
          <p className="mt-1.5 max-w-[90ch] text-[12px] leading-relaxed text-ink-muted">
            <span className="font-medium">Catches:</span> {c.catches}
          </p>
        </div>
      </div>
    </li>
  );
}

export default async function CoveragePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const snap = await getSnapshot(slug);
  const guests = await getGuests(slug);
  const orgs = await getAllOrgs();
  const { org, coverage, members, venueMonthly } = snap;
  const cov = coverageState(org, snap.coverage);
  const checks = runChecks(snap, guests);
  const findings = qualityFindings(org, coverage, members);
  const anomalies = detectAnomalies(venueMonthly, org.cardTier.months, org.window.end);
  const byVenue = groupByVenue(anomalies);
  const w = org.window;

  const passed = checks.filter((c) => c.ok).length;
  const dead = org.cardTier.quality.filter((q) => q.reason === "no card capture");
  const notTrading = org.cardTier.quality.filter((q) => q.reason === "not trading");
  const renamed = org.venues.filter((v) => v.formerNames.length > 0);

  const sevTone: Record<string, "critical" | "warning" | "neutral"> = {
    blocking: "critical", material: "warning", minor: "neutral",
  };

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Coverage"
        coverage={cov}
        actions={
          <CheckBadge href={`/${org.slug}/coverage#checks`} checks={checks} />
        }
      />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Revenue attributed"
              value={pct(cov.identifiedRevenueShare, 1)}
              hint={`Revenue grain — the primary measure. Denominator: ${money(coverage.totals.revenue)} of completed trade, ${windowShort(w)}.`}
              accent="var(--accent)"
              footnote={`of ${money(coverage.totals.revenue)}`}
            />
            <Tile
              label="Orders attributed"
              value={pct(cov.identifiedOrderShare, 1)}
              hint={`Transaction grain — the secondary measure, named because it differs. Denominator: ${count(coverage.totals.orders)} orders.`}
              accent="var(--tier-card)"
              footnote={`of ${count(coverage.totals.orders)} orders`}
            />
            <Tile
              label="Party size recorded"
              value={pct(cov.coversShare, 1)}
              hint={`Orders carrying a guest count, over all completed orders in the window. The Members screen uses a different denominator for the per-cover comparison and names it there.`}
              accent={org.serviceModel === "table" && cov.coversShare < 0.9 ? "var(--warning)" : "var(--ink-muted)"}
              footnote={`${count(coverage.totals.ordersWithCovers)} of ${count(coverage.totals.orders)} orders`}
            />
            <Tile
              label="Card capture usable"
              value={`${org.cardTier.allUsableMonths.length} of ${cov.monthsTested}`}
              hint="Months tested across the two-year discovery window, and the months that passed both the volume and the single-token test. The analysis window is the most recent unbroken run of complete months among them."
              accent={org.cardTier.allUsableMonths.length < cov.monthsTested / 2 ? "var(--warning)" : "var(--good)"}
              footnote={
                <>
                  {cov.monthsAdmitted} complete and contiguous, so in the window · {notTrading.length} before
                  trading · {dead.length} no capture
                </>
              }
            />
          </div>

          {/* ── card capture ──────────────────────────────────────────────── */}
          <Card
            title="Card recognition, month by month"
            subtitle="The test that catches a field which is populated and worthless."
          >
            <CoverageTrendChart coverage={coverage} org={org} />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="py-2 pr-3 text-left font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">Orders</th>
                    <th className="px-3 py-2 text-right font-medium">Card txns</th>
                    <th className="px-3 py-2 text-right font-medium">Distinct cards</th>
                    <th className="px-3 py-2 text-right font-medium">Distinct / txn</th>
                    <th className="px-3 py-2 text-right font-medium">Largest one token</th>
                    <th className="py-2 pl-3 text-left font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {org.cardTier.quality.map((q) => (
                    <tr
                      key={q.month}
                      className="border-b border-line last:border-b-0"
                      style={q.ok ? undefined : { opacity: 0.62 }}
                    >
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                        {monthLabel(q.month)}
                      </th>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">{count(q.orders)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">{count(q.txns)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">{count(q.distinctPar)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink-secondary">{q.ratio.toFixed(3)}</td>
                      <td
                        className="tnum px-3 py-2 text-right font-medium"
                        style={{ color: q.maxTokenShare >= 0.1 ? "var(--critical)" : "var(--ink-secondary)" }}
                      >
                        {pct(q.maxTokenShare, 1)}
                      </td>
                      <td className="py-2 pl-3 text-left">
                        {q.ok ? (
                          <Pill tone="good">In the window</Pill>
                        ) : (
                          <span className="text-[12px] text-ink-secondary">{q.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-lg border border-line bg-surface-sunken px-4 py-3.5">
              <p className="max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                <strong className="text-ink">Why the last column exists.</strong> The payment reference was never
                null, so every <code className="text-[12px]">COUNT(reference)</code> coverage test scored these
                months as fully covered. The only test that catches it is the share of a month&apos;s card
                transactions sitting on a single reference: the healthy months here top out at{" "}
                {pct(Math.max(...org.cardTier.quality.filter((q) => q.ok).map((q) => q.maxTokenShare), 0), 1)} and
                the broken ones sit at 100%. A month failing this is excluded from the window entirely rather
                than drawn as a fall in customers.
              </p>
            </div>
          </Card>

          {/* ── the checks ────────────────────────────────────────────────── */}
          <Card
            title="What has been checked"
            subtitle={`${passed} of ${checks.length} pass. Every one is demonstrated failing against a fixture corrupted the way it claims to catch — run npm run verify.`}
            padded={false}
          >
            <div id="checks" className="scroll-mt-6" />
            <ul>{checks.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
            <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted">
              The previous build shipped five checks that were internal identities — they compared a number to
              itself and could not fail. They were green on the day the card feed collapsed 403,600 transactions
              onto one token. A check with no failing fixture is excluded from the badge above.
            </p>
          </Card>

          {/* ── what to fix ───────────────────────────────────────────────── */}
          <Card
            title="What to fix, and what it unlocks"
            subtitle="Each gap names the fix, who owns it, and the question that stays unanswerable until it closes."
            padded={false}
          >
            {findings.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Nothing material is missing"
                  body="Every field this report depends on is being captured at a rate that supports the claims made from it."
                />
              </div>
            ) : (
              <ul>
                {findings.map((f) => (
                  <li key={f.id} className="border-b border-line px-5 py-4 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                      <h3 className="text-[14px] font-semibold text-ink">{f.title}</h3>
                      <div className="flex items-center gap-2">
                        <Pill tone={sevTone[f.severity]}>{f.severity}</Pill>
                        <Pill>{f.owner}</Pill>
                      </div>
                    </div>
                    <p className="mt-1.5 max-w-[90ch] text-[13px] leading-relaxed text-ink-secondary">{f.detail}</p>
                    <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-ink-secondary">
                      <span className="mt-0.5 shrink-0 text-ink-muted"><IconInfo /></span>
                      <span className="max-w-[90ch]">
                        <span className="font-medium text-ink">Unlocks:</span> {f.unlocks}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── anomalies ─────────────────────────────────────────────────── */}
          <Card
            title="Outside the bounds of normal"
            subtitle={`Venues tested against their peers and against their own history, on the median and median absolute deviation rather than the mean.`}
            padded={false}
          >
            {anomalies.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={`No venue is behaving unusually across ${org.venues.length} ${org.venues.length === 1 ? "venue" : "venues"}`}
                  body={
                    org.venues.length < 5
                      ? "Peer comparison needs at least five venues before a median means anything, so only the against-its-own-history test is running here."
                      : "Each venue was tested against its peers this month and against its own trailing history. Nothing cleared both the statistical and the materiality bar."
                  }
                />
              </div>
            ) : (
              <ul>
                {byVenue.map(({ venue, items }) => (
                  <li key={venue} className="border-b border-line px-5 py-4 last:border-b-0">
                    <h3 className="text-[14px] font-semibold text-ink">{venue}</h3>
                    <ul className="mt-2 flex flex-col gap-2">
                      {items.map((a) => (
                        <li key={a.id} className="flex items-start gap-2.5">
                          <span
                            className="mt-0.5 shrink-0"
                            style={{ color: a.severity === "high" ? "var(--critical)" : "var(--warning)" }}
                          >
                            <IconAlert className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-[13px] font-medium text-ink">{a.headline}</p>
                            <p className="mt-0.5 max-w-[85ch] text-[13px] leading-relaxed text-ink-secondary">
                              {a.detail}
                            </p>
                            <p className="tnum mt-0.5 text-[12px] text-ink-muted">
                              {a.kind === "peer" ? "against peers" : "against its own history"} · modified z{" "}
                              {a.z.toFixed(1)}
                              {a.month ? ` · ${monthLabel(a.month)}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── venues ────────────────────────────────────────────────────── */}
          <Card
            title="Venues"
            subtitle="Identity is the store id. The name is an attribute, and it changes."
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
                    <th className="px-5 py-2.5 text-left font-medium">Venue</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2.5 text-right font-medium">Attributed</th>
                    <th className="px-3 py-2.5 text-right font-medium">Members</th>
                    <th className="px-5 py-2.5 text-right font-medium">First traded</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.byVenue.map((v) => {
                    const venue = org.venues.find((x) => x.id === v.storeId);
                    return (
                      <tr key={v.storeId} className="border-b border-line last:border-b-0">
                        <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">
                          {v.storeName}
                          {venue && venue.formerNames.length > 0 && (
                            <span className="block text-[12px] font-normal text-ink-muted">
                              previously {venue.formerNames.join(", ")}
                            </span>
                          )}
                        </th>
                        <td className="tnum px-3 py-2.5 text-right text-ink-secondary">{count(v.orders)}</td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-secondary">{money(v.revenue)}</td>
                        <td className="tnum px-3 py-2.5 text-right text-ink">
                          {pct((v.memberRevenue + v.cardRevenue) / Math.max(v.revenue, 1), 1)}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                          {pct(v.memberRevenue / Math.max(v.revenue, 1), 1)}
                        </td>
                        <td className="tnum px-5 py-2.5 text-right text-ink-secondary">
                          {venue?.firstDay ? dayLabel(venue.firstDay) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {renamed.length > 0 && (
              <div className="border-t border-line px-5 py-3.5">
                <p className="max-w-[95ch] text-[12px] leading-relaxed text-ink-muted">
                  {renamed.length} {renamed.length === 1 ? "venue has" : "venues have"} traded under an earlier
                  name. Grouping trade by name rather than by id invents venues that never existed — at Meat
                  Flour Wine it produced a phantom third site with 6,799 orders, and dated Braeside&apos;s opening
                  to the day it was renamed rather than the day it opened. Every figure here resolves on the id
                  and displays the current name across all history.
                </p>
              </div>
            )}
          </Card>

          {/* ── the window ────────────────────────────────────────────────── */}
          <Card title="Why the window is this short" subtitle="And what that costs you.">
            <div className="grid gap-6 md:grid-cols-2">
              <Facts
                rows={[
                  ["Discovery window", `${dayLabel(org.discoveryWindow.start)} – ${dayLabel(org.discoveryWindow.end)}`],
                  ["Months tested", count(cov.monthsTested)],
                  ["Months usable", count(cov.monthsAdmitted)],
                  ["Analysis window", `${dayLabel(w.start)} – ${dayLabel(w.end)}`],
                  ["Complete months in it", count(w.months)],
                  ["Return curve horizon", `${org.calibration.horizonDays} days`],
                ]}
              />
              <div>
                <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                  Nothing in this product renders outside the window, because the window is not a filter applied
                  at the end — it is the only period in the snapshot. Two years of chrome over four months of
                  usable data is how eighteen figures came to contradict each other in the previous build.
                </p>
                <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">
                  {org.calibration.lapsedEstimable ? (
                    <>
                      It is just long enough to estimate a lapse threshold:{" "}
                      <strong className="text-ink">{org.calibration.lapsedDays} days</strong>, from{" "}
                      {count(org.calibration.episodes)} censored episodes. Note how far that sits from the{" "}
                      {org.calibration.medianGapDays}-day median return — a threshold taken from observed gaps
                      alone would have declared these guests lost months earlier.
                    </>
                  ) : (
                    <>
                      It is <strong className="text-ink">not</strong> long enough to estimate a lapse threshold.
                      The return curve still has {pct(org.calibration.floor, 0)} of guests yet to come back when
                      the window closes at {org.calibration.horizonDays} days, so any p90 taken from it would be
                      a statement about the window rather than about the guests. The canonical{" "}
                      {org.calibration.canonicalLapsedDays}-day rule is used instead, and labelled as canonical
                      wherever it appears.
                    </>
                  )}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </Page>
    </>
  );
}

import { GapHistogram } from "@/components/charts/GapHistogram";
import { GuestFlowChart } from "@/components/charts/GuestFlowChart";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { Card, EmptyState, Tile } from "@/components/ui/Primitives";
import { getAllOrgs, getSnapshot } from "@/lib/data";
import {
  completeMonths, count, coverageState, memberFlow, money, monthLabel, pct,
  rollUpSegments, sameMonthLastYear, tileCount,
} from "@/lib/metrics";

export default async function ComingBack({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [snap, orgs] = await Promise.all([getSnapshot(slug), getAllOrgs()]);
  const { org, coverage, lifecycle, segments } = snap;

  const cov = coverageState(org, coverage);
  const flow = memberFlow(lifecycle);
  const settled = completeMonths(flow, org.window.end);
  const latest = settled.at(-1);
  const lastYear = latest ? sameMonthLastYear(settled, latest.month) : undefined;

  const segs = rollUpSegments(segments, "member");
  const cardSegs = rollUpSegments(segments, "card");
  const known = segs.reduce((a, s) => a + s.guests, 0);
  const lapsed = segs.find((s) => s.segment === "lapsed")?.guests ?? 0;
  const oneVisit = segs.find((s) => s.segment === "one-visit")?.guests ?? 0;

  // Twelve-month net, which is the number that says whether the base is growing.
  const twelve = settled.slice(-12);
  const netYear = twelve.reduce((a, f) => a + f.net, 0);

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Coming back"
        coverage={cov}
      />
      <Page>
        <div className="mx-auto max-w-[1240px] space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label="Net over 12 months"
              value={`${netYear >= 0 ? "+" : "−"}${count(tileCount(Math.abs(netYear)))}`}
              accent={netYear >= 0 ? "var(--good)" : "var(--loss)"}
              hint="Gains minus losses across the last twelve complete months, member tier."
              footnote={<>{twelve.length} complete months</>}
            />
            <Tile
              label={latest ? `Active in ${monthLabel(latest.month)}` : "Active"}
              value={latest ? count(tileCount(latest.active)) : "—"}
              accent="var(--gain-returning)"
              hint="Members who visited at least once in the month."
              footnote={
                latest && lastYear && lastYear.active
                  ? <>{pct((latest.active - lastYear.active) / lastYear.active, 0)} on last year</>
                  : null
              }
            />
            <Tile
              label="Lapsed"
              value={count(tileCount(lapsed))}
              accent="var(--loss)"
              hint={`Members not seen for more than ${org.calibration.lapsedDays} days — this business's own calibrated threshold.`}
              footnote={<>{pct(lapsed / (known || 1), 0)} of known {org.labels.guests}</>}
            />
            <Tile
              label="Seen only once"
              value={count(tileCount(oneVisit))}
              accent="var(--warning)"
              hint="Never returned. The largest single group in almost every hospitality business, and the least designed for."
              footnote={<>{pct(oneVisit / (known || 1), 0)} of known {org.labels.guests}</>}
            />
          </div>

          <Card
            title={`Gained and lost, ${flow.length} months`}
            subtitle="Enrolled members. Gains above the line, losses below, with the same month last year marked."
          >
            {flow.length ? (
              <GuestFlowChart flow={flow} height={340} />
            ) : (
              <EmptyState title="No lifecycle history" body="No complete months of member trade in this window." />
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Where everybody stands" subtitle="Person grain, at the end of the window.">
              <ul className="space-y-3">
                {segs.map((s) => {
                  const share = s.guests / (known || 1);
                  const colour =
                    s.segment === "regular" ? "var(--gain-returning)"
                      : s.segment === "established" ? "var(--gain-new)"
                        : s.segment === "slipping" ? "var(--warning)"
                          : s.segment === "lapsed" ? "var(--loss)"
                            : "var(--tier-unattributed)";
                  return (
                    <li key={s.segment}>
                      <div className="flex items-baseline justify-between text-[13px]">
                        <span className="font-medium text-ink">{s.label}</span>
                        <span className="tnum text-ink-secondary">
                          {count(s.guests)} · {money(s.spend)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: colour }} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {cardSegs.some((s) => s.guests > 0) && (
                <div className="mt-5 rounded-lg border border-line bg-surface-sunken p-3">
                  <p className="text-[13px] font-medium text-ink">
                    Card-identified guests are counted, not judged
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                    {count(cardSegs.reduce((a, s) => a + s.guests, 0))} people are recognised by
                    card in this window. They get a count and a &ldquo;not seen since&rdquo; date,
                    but no lifecycle verdict: a bank reissuing a card looks exactly like a
                    customer who stopped coming, and until reissue rate is measured we cannot
                    tell the two apart.
                  </p>
                </div>
              )}
            </Card>

            <Card
              title="Why these thresholds"
              subtitle="Calibrated from this business's own gaps between visits, not from a rule of thumb."
            >
              <GapHistogram data={segments.gapHistogram} org={org} />
              <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-secondary">
                Half of return visits happen within <strong>{org.calibration.medianGapDays} days</strong>;
                three quarters within <strong>{Math.round(org.calibration.p75)}</strong>. Slipping is
                set at {org.calibration.slippingDays} days and lapsed at {org.calibration.lapsedDays}.
                Any comparison against another business uses the canonical{" "}
                {org.calibration.canonicalLapsedDays}-day rule instead, and says so on screen.
              </p>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}

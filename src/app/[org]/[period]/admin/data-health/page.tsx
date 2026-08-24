import { PageHeader, Page } from "@/components/shell/PageHeader";
import { Card, EmptyState, Pill } from "@/components/ui/Primitives";
import { Standfirst } from "@/components/shell/Standfirst";
import { getPeriods, getSnapshot } from "@/lib/data";
import { detectAnomalies, groupByVenue } from "@/lib/anomalies";
import { qualityFindings } from "@/lib/quality";
import { count, monthLabel, pct } from "@/lib/metrics";
import { IconAlert } from "@/components/shell/Icons";

export const dynamic = "force-static";
export const metadata = { title: "Data Health" };

/**
 * Data Health. The half of this product that tells an operator what to fix.
 *
 * ── Why this is a page now, and why that is not a reversal ─────────────────
 *
 * `qualityFindings` and `detectAnomalies` have been built, maintained and
 * covered by checks for the whole life of this build, and until now they
 * rendered **nowhere**. Their only consumer was `TrustPanel`, which was pulled
 * out of Overview when the trust material moved and was never given another
 * home. Two working engines, no reader.
 *
 * The reason they were pulled is still right: a diagnostics *report* an
 * operator has to be told to open is a report that exists for the team that
 * built it, and burying the price of a claim in a separate screen lets the
 * claim travel without it. That argument was about **caveats on figures**, and
 * caveats still live beside their figures — the coverage chip, the check
 * register, the spine chip, the labour note all travel with the numbers they
 * qualify.
 *
 * This is a different object. It is not a caveat on a reading; it is a **work
 * queue about the till**. "Brookwater stopped recording party size in February
 * 2025" is not something to weigh while interpreting a chart — it is something
 * to fix, by somebody who is not reading a chart at all. It belongs where
 * People Mapping belongs, for the same reason: **Admin is where the things you
 * act on live, and the reporting sections are where the things you read live.**
 *
 * ── The covers finding is why this could not wait ──────────────────────────
 *
 * Party size used to be judged over every order, which measured a venue's
 * takeaway share and reported it as a data problem. Coffee Guru read 20% and
 * was waved through as "expected for counter service" — while Brookwater rang
 * 7,184 seated orders in this window and recorded a party size on none of
 * them, and had recorded none since February 2025. Eighteen months, roughly
 * thirty-seven thousand seated orders, invisible.
 *
 * Judged against seated orders it is unmissable. Shipping that finding into a
 * component nothing renders would have been the same defect one level up.
 */
export default async function DataHealthPage({
  params,
}: {
  params: Promise<{ org: string; period: string }>;
}) {
  const { org: slug, period } = await params;
  const [snap, periods] = await Promise.all([getSnapshot(slug, period), getPeriods(slug)]);
  const { org, coverage, members, venueMonthly } = snap;
  const current = periods.periods.find((p) => p.id === period)!;

  const findings = qualityFindings(org, coverage, members);
  const anomalies = detectAnomalies(venueMonthly, org.cardTier.months, org.window.end);
  const byVenue = groupByVenue(anomalies);

  const sevTone: Record<string, "critical" | "warning" | "neutral"> = {
    blocking: "critical",
    material: "warning",
    minor: "neutral",
  };

  const seated = coverage.totals.ordersSeated;
  const seatedCovers = coverage.totals.seatedWithCovers;

  return (
    <>
      <PageHeader org={org} periods={periods} period={current} title="Data Health" section="Platform" surface="admin/data-health" />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <Standfirst
            question="What is the till not capturing, and what is it costing?"
            body={
              <>
                Every finding here names the fix, who owns it, and the specific question that stays
                unanswerable until it is fixed. They are derived from this window&rsquo;s data, so
                they disappear when the problem does — nothing on this page is a permanent notice.
                {seated > 0 && (
                  <>
                    {" "}
                    <strong className="text-ink">
                      {pct(seatedCovers / seated, 0)} of {count(seated)} seated orders record a
                      party size
                    </strong>{" "}
                    in this window. Takeaway is excluded throughout: it has no covers to record and
                    never did, and counting it was what made a business model look like a data
                    problem.
                  </>
                )}
              </>
            }
          />

          <Card
            title="What to fix, who owns it, and what it unlocks"
            subtitle="Ordered as found. Severity is what the missing field costs an answer, not how many rows carry it."
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
              <ul className="divide-y divide-line">
                {findings.map((f) => (
                  <li key={f.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                      <h3 className="text-[14px] font-semibold text-ink">{f.title}</h3>
                      <div className="flex items-center gap-2">
                        <Pill tone={sevTone[f.severity]}>{f.severity}</Pill>
                        <Pill>{f.owner}</Pill>
                      </div>
                    </div>
                    <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                      {f.detail}
                    </p>
                    <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                      <span className="font-medium text-ink">Unlocks:</span> {f.unlocks}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Venues outside the estate norm"
            subtitle="Each venue tested against its peers this month and against its own trailing history, on the median and median absolute deviation rather than the mean — so one bad venue cannot move the line it is being judged against."
            padded={false}
          >
            {anomalies.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={`No venue is behaving unusually across ${org.venues.length} venues`}
                  body="Each was tested against its peers this month and against its own trailing history. Nothing cleared both the statistical and the materiality bar — a venue has to be both an outlier and off by enough to matter."
                />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {byVenue.map(({ venue, items }) => (
                  <li key={venue} className="px-5 py-4">
                    <h3 className="text-[14px] font-semibold text-ink">{venue}</h3>
                    <ul className="mt-2 flex flex-col gap-2.5">
                      {items.map((a) => (
                        <li key={a.id} className="flex items-start gap-2">
                          <span
                            className="mt-0.5 shrink-0"
                            style={{
                              color: a.severity === "high" ? "var(--critical)" : "var(--warning)",
                            }}
                          >
                            <IconAlert className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="text-[13px] font-medium text-ink">{a.headline}</p>
                            <p className="max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                              {a.detail}
                            </p>
                            {/* The statistic, quietly. A reader who wants to argue with the
                                finding needs to see what it was struck against; a reader who
                                just wants to fix the till does not. */}
                            <p className="tnum mt-0.5 text-[11px] text-ink-muted">
                              {a.kind === "peer" ? "against peers" : "against its own history"} ·
                              modified z {a.z.toFixed(1)}
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
        </div>
      </Page>
    </>
  );
}

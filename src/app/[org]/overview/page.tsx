import Link from "next/link";
import { GuestFlowChart } from "@/components/charts/GuestFlowChart";
import { GrowthWaterfall, RealVsPriceBar } from "@/components/charts/GrowthWaterfall";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { IconArrow } from "@/components/shell/Icons";
import { Card, EmptyState, Pill, Tile } from "@/components/ui/Primitives";
import { getAllOrgs, getGuests, getSnapshot } from "@/lib/data";
import {
  completeMonths, count, coverageState, decompose, habit, memberFlow, money, monthLabel,
  namedLists, pct, rollUpSegments, sameMonthLastYear, tileCount,
} from "@/lib/metrics";

export default async function Overview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [snap, guests, orgs] = await Promise.all([getSnapshot(slug), getGuests(slug), getAllOrgs()]);
  const { org, coverage, lifecycle, decomposition, segments } = snap;

  const cov = coverageState(org, coverage);
  const flow = memberFlow(lifecycle);
  // Headline figures use complete months only; the chart may still show the
  // partial one because a chart has a shape to explain it and a tile does not.
  const settled = completeMonths(flow, org.window.end);
  const latest = settled.at(-1);
  const lastYear = latest ? sameMonthLastYear(settled, latest.month) : undefined;
  const lists = namedLists(guests, org);
  const segs = rollUpSegments(segments, "member");
  const regulars = segs.find((s) => s.segment === "regular")?.guests ?? 0;

  const dm = completeMonths(decomposition, org.window.end);
  const dec = dm.length >= 2 ? decompose(dm.at(-2)!, dm.at(-1)!) : null;

  return (
    <>
      <PageHeader org={org} orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))} title="Overview" coverage={cov} />
      <Page>
        <div className="mx-auto max-w-[1240px] space-y-5">
          {/* 1 — the owned count */}
          <div className="grid gap-4 md:grid-cols-3">
            <Tile
              label={`Your regulars`}
              value={count(tileCount(regulars))}
              accent="var(--gain-returning)"
              hint="Enrolled members with ten or more visits who are still inside their usual gap. Person grain."
              footnote={
                <>Of {count(tileCount(segs.reduce((a, s) => a + s.guests, 0)))} known {org.labels.guests} in total</>
              }
            />
            <Tile
              label={latest ? `Gained in ${monthLabel(latest.month)}` : "Gained"}
              value={latest ? count(tileCount(latest.gained)) : "—"}
              accent="var(--gain-new)"
              hint="New guests plus guests who came back after lapsing, in the most recent month."
              footnote={
                latest && lastYear ? (
                  <>
                    {lastYear.gained ? pct((latest.gained - lastYear.gained) / lastYear.gained, 0) : "—"} against{" "}
                    {monthLabel(lastYear.month)}
                  </>
                ) : null
              }
            />
            <Tile
              label={latest ? `Lost in ${monthLabel(latest.month)}` : "Lost"}
              value={latest ? count(tileCount(latest.lost)) : "—"}
              accent="var(--loss)"
              hint="Guests whose gap since their last visit crossed the lapse threshold during the month."
              footnote={
                latest ? (
                  <span style={{ color: latest.net < 0 ? "var(--critical)" : "var(--good)" }}>
                    Net {latest.net >= 0 ? "+" : "−"}{count(Math.abs(latest.net))}
                  </span>
                ) : null
              }
            />
          </div>

          {/* 2 — the sentence */}
          {latest && (
            <Card>
              <p className="text-[15px] leading-relaxed text-ink">
                <strong>{count(lists[0].total)}</strong> regulars have slipped past their usual gap.
                They normally come every <strong>{Math.round(org.calibration.medianGapDays)} days</strong>;
                these have not been seen for more than <strong>{org.calibration.slippingDays}</strong>.
                {lists[1].total > 0 && (
                  <>
                    {" "}A further <strong>{count(lists[1].total)}</strong> people visit at least eight
                    times and have never joined anything.
                  </>
                )}
              </p>
            </Card>
          )}

          {/* 3 — the action block */}
          <div className="grid gap-4 lg:grid-cols-3">
            {lists.map((list) => (
              <Card key={list.key} className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-ink">{list.title}</h3>
                  <span className="tnum shrink-0 text-[19px] font-semibold text-ink">
                    {count(list.total)}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">{list.why}</p>

                <ul className="mt-3 space-y-1.5">
                  {list.guests.slice(0, 3).map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="flex items-center gap-2 truncate">
                        <Pill tone={g.tier === "member" ? "member" : "card"}>
                          {g.tier === "member" ? "M" : "C"}
                        </Pill>
                        <span className="truncate font-medium text-ink">{g.name}</span>
                      </span>
                      <span className="tnum shrink-0 text-[12px] text-ink-muted">
                        {habit(g, org)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4">
                  <Link
                    href={`/${org.slug}/brief#${list.key}`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
                  >
                    {list.action}
                    <IconArrow className="h-4 w-4" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          {/* 4 — where growth came from */}
          {dec ? (
            <Card
              title="Where your growth came from"
              subtitle={`${monthLabel(dec.from.month, true)} to ${monthLabel(dec.to.month, true)}, symmetric Shapley allocation`}
              right={
                <div className="text-right">
                  <div className="tnum text-[19px] font-semibold" style={{ color: dec.revenueChange >= 0 ? "var(--good)" : "var(--critical)" }}>
                    {dec.revenueChange >= 0 ? "+" : "−"}{money(Math.abs(dec.revenueChange))}
                  </div>
                  <div className="text-[12px] text-ink-muted">change in revenue</div>
                </div>
              }
            >
              <GrowthWaterfall d={dec} />
              <div className="mt-4 border-t border-line pt-4">
                <RealVsPriceBar d={dec} />
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink">
                {dec.real >= 0 && dec.price >= 0 && (
                  <>
                    <strong>{money(Math.abs(dec.real))}</strong> of the change came from more trade and{" "}
                    <strong>{money(Math.abs(dec.price))}</strong> from charging more per item.
                  </>
                )}
                {dec.real < 0 && dec.price > 0 && (
                  <>
                    Prices added <strong>{money(dec.price)}</strong>, but trade fell by{" "}
                    <strong>{money(Math.abs(dec.real))}</strong>. You put prices up and it cost you volume.
                  </>
                )}
                {dec.real > 0 && dec.price < 0 && (
                  <>
                    Trade added <strong>{money(dec.real)}</strong> while average price fell by{" "}
                    <strong>{money(Math.abs(dec.price))}</strong>. Growth is real, not repricing.
                  </>
                )}
                {dec.real < 0 && dec.price < 0 && (
                  <>Both trade and price fell. <strong>{money(Math.abs(dec.real))}</strong> of the loss is fewer guests and less frequency.</>
                )}
              </p>
            </Card>
          ) : (
            <Card title="Where your growth came from">
              <EmptyState
                title="Not enough complete months yet"
                body="The decomposition needs two complete months of trade to compare."
              />
            </Card>
          )}

          {/* 5 — the 24-month trend */}
          <Card
            title={`Gained and lost, ${flow.length} months`}
            subtitle="Enrolled members. Gains above the line, losses below."
            right={
              <Link href={`/${org.slug}/coming-back`} className="text-[13px] font-medium text-accent hover:underline">
                Coming back →
              </Link>
            }
          >
            {flow.length ? (
              <>
                <GuestFlowChart flow={flow} />
                <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-secondary">
                  Lapse is dated: a guest lapses on the day their gap crosses{" "}
                  {org.calibration.lapsedDays} days, calibrated from this business&rsquo;s own
                  inter-visit distribution rather than a fixed 90-day rule.
                  {!cov.cardTierComplete && (
                    <>
                      {" "}Card-identified guests are excluded from this chart — see{" "}
                      <Link href={`/${org.slug}/coverage`} className="font-medium text-accent hover:underline">
                        Coverage
                      </Link>
                      .
                    </>
                  )}
                </p>
              </>
            ) : (
              <EmptyState title="No lifecycle history" body="No complete months of member trade in this window." />
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}

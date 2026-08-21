import Link from "next/link";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { Standfirst } from "@/components/shell/Standfirst";
import { Card, EmptyState, Pill } from "@/components/ui/Primitives";
import { IconAlert } from "@/components/shell/Icons";
import { getPeriods, getSnapshot } from "@/lib/data";
import { detectAnomalies } from "@/lib/anomalies";
import { qualityFindings } from "@/lib/quality";
import { dayLabel, monthLabel } from "@/lib/metrics";
import { SavedLists } from "./SavedLists";

export const dynamic = "force-static";
export const metadata = { title: "Home" };

/**
 * ═══ Home. The landing state, and the only surface that is about the reader ═══
 *
 * Every other surface in Insights answers a question about the business. This
 * one answers a question about the **person who just opened it**: what needs me
 * right now? That is why it is not one of the eight sections — it has no
 * subject, and filing it as section zero would start an argument about which of
 * its cards is "really" a Sales card.
 *
 * Three cards, and the order is the order of obligation: what is happening now,
 * what is wrong, what you asked to keep. Nothing else earns a place here. A
 * landing page that lists everything is a second navigation, and there is
 * already a navigation two hundred and sixty-eight pixels to the left.
 *
 * ── The first card refuses, and that is the point ──────────────────────────
 *
 * "Live trading" is the first thing an operator wants on a home screen and the
 * one thing this build cannot give them. **Every figure in this product comes
 * from a closed period extract**, graded and frozen — there is no live feed
 * behind any of it, and there is no runtime call on any page. The honest
 * distance between "as at 4:12pm" and "as at the end of a graded month" is not
 * a detail to soften; it is the difference between a service you can run a shift
 * on and a report you read afterwards.
 *
 * So the card states what it does not have and names the date it actually
 * stands at. The alternative — the tempting one — is a tile reading "Today"
 * populated from the last day of the extract, which would be **wrong by however
 * long ago the extract closed** and would look completely fine. That surface
 * ships silently and gets believed, which is exactly the failure this build
 * exists to refuse.
 *
 * ── The second card is the one that already worked, finally in front of somebody ─
 *
 * `qualityFindings` and `detectAnomalies` have been built, covered by checks and
 * maintained for the whole life of this build. Data Health gave them a page.
 * This gives them a **reader** — a queue an operator has to be told to open is a
 * queue that exists for the team that built it, and Home is the one screen
 * nobody has to be told to open.
 *
 * It is a summary and it says so. Only what is loud enough to interrupt somebody
 * lands here: blocking and material findings, and the high-severity anomalies.
 * Everything else stays on the page that owns it, one link away. A home screen
 * that reproduces a whole work queue is a work queue with a different name, and
 * the second copy is the one that goes stale.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ org: string; period: string }>;
}) {
  const { org: slug, period } = await params;
  const [snap, periods] = await Promise.all([getSnapshot(slug, period), getPeriods(slug)]);
  const { org, coverage, members, venueMonthly } = snap;
  const current = periods.periods.find((p) => p.id === period)!;

  const base = `/${slug}/${period}`;

  /**
   * The cut for "needs me now" is deliberately higher than the cut on the page
   * that owns each engine.
   *
   * Data Health shows every finding and every anomaly, because somebody working
   * a queue wants the whole queue. Home shows only what justifies interrupting
   * a person who came to look at something else. `minor` findings and `moderate`
   * anomalies are real and are not urgent, and a home screen that treats them as
   * urgent is a home screen that gets ignored inside a fortnight — the same
   * reason `detectAnomalies` cuts at a modified z of 3.5 rather than at anything
   * that moved.
   */
  const findings = qualityFindings(org, coverage, members).filter(
    (f) => f.severity === "blocking" || f.severity === "material",
  );
  const anomalies = detectAnomalies(venueMonthly, org.cardTier.months, org.window.end).filter(
    (a) => a.severity === "high",
  );
  const quiet = findings.length === 0 && anomalies.length === 0;

  return (
    <>
      {/* Home sits directly in Insights rather than in one of the eight, so the
          label beside the title names the product, not a section.

          `population={false}` drops Locations, Customers and Segment. None of
          the three cards below narrows by any of them, and a filter that
          changes the URL and nothing on screen is the defect §9.1 B2 exists to
          catch. The period control stays: it selects which extract every figure
          here was drawn from. */}
      <PageHeader
        org={org}
        periods={periods}
        period={current}
        title="Home"
        section="Insights"
        population={false}
      />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <Standfirst
            question="What needs me right now?"
            body={
              <>
                Everything below is drawn from the {org.periodLabel ?? "current"} extract, which
                closed on <strong className="text-ink">{dayLabel(org.window.end)}</strong>. Nothing
                on this screen updates during service — see the first card for why that is a
                statement rather than an apology.
              </>
            }
          />

          {/* ── 1. Live trading. The refusal. ──────────────────────────────── */}
          <Card
            title="Live trading"
            subtitle="What is happening in the venues right now."
            padded={false}
          >
            <div className="p-5">
              <EmptyState
                tone="warning"
                title="This build has no live feed, and will not imply one"
                body={
                  <>
                    Every figure in Insights comes from a closed period extract — graded, frozen,
                    and read from disk at build time. There is no runtime query behind any surface
                    here, so there is no honest way to show today&rsquo;s trade, this hour&rsquo;s
                    covers, or a venue that has just gone quiet.
                    <br />
                    <br />
                    The figures you can trust stand at{" "}
                    <strong className="text-ink">{dayLabel(org.window.end)}</strong>, the close of a{" "}
                    {org.window.days}-day window across{" "}
                    {org.venues.length === 1 ? "one venue" : `${org.venues.length} venues`}. A tile
                    on this card reading &ldquo;Today&rdquo; would be populated from the last day of
                    that extract and would be wrong by however long ago it closed — and it would
                    look completely fine, which is the problem. Live trading arrives when there is a
                    live source to put behind it.
                  </>
                }
              />
            </div>
          </Card>

          {/* ── 2. Alerts. The summary, never the queue. ────────────────────── */}
          <Card
            title="Needs attention"
            subtitle="Blocking and material data findings, and venues well outside the estate norm. The full queue, including everything below this bar, is on Data Health."
            padded={false}
            right={
              <Link
                href={`${base}/admin/data-health`}
                className="text-[13px] font-medium text-accent hover:underline"
              >
                Open Data Health
              </Link>
            }
          >
            {quiet ? (
              <div className="p-5">
                <EmptyState
                  title="Nothing is loud enough to interrupt you"
                  body={
                    <>
                      No blocking or material field is missing, and no venue cleared both the
                      statistical and the materiality bar against its peers or its own history.
                      Quieter findings may still be waiting on Data Health — this card is a
                      threshold, not a clean bill of health.
                    </>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {findings.map((f) => (
                  <li key={f.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                      <h3 className="text-[14px] font-semibold text-ink">{f.title}</h3>
                      <div className="flex items-center gap-2">
                        <Pill tone={f.severity === "blocking" ? "critical" : "warning"}>
                          {f.severity}
                        </Pill>
                        <Pill>{f.owner}</Pill>
                      </div>
                    </div>
                    <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                      {f.detail}
                    </p>
                    {/* What it costs an answer, not just what it is. A finding
                        with no consequence attached is a chore; a finding that
                        names the question it is blocking is a reason. */}
                    <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
                      <span className="font-medium text-ink">Unlocks:</span> {f.unlocks}
                    </p>
                  </li>
                ))}
                {anomalies.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 px-5 py-4">
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--critical)" }}>
                      <IconAlert className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <h3 className="text-[14px] font-semibold text-ink">{a.venue}</h3>
                      <p className="mt-0.5 text-[13px] font-medium text-ink">{a.headline}</p>
                      <p className="max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
                        {a.detail}
                      </p>
                      <p className="tnum mt-0.5 text-[11px] text-ink-muted">
                        {a.kind === "peer" ? "against peers" : "against its own history"} · modified
                        z {a.z.toFixed(1)}
                        {a.month ? ` · ${monthLabel(a.month)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── 3. Saved lists. The operator's own. ─────────────────────────── */}
          <Card
            title="Your saved lists"
            subtitle="Held in this browser only. A list is the rule that selects a population, evaluated fresh each time it is opened — so no size is shown here."
            padded={false}
            right={
              <Link
                href={`${base}/guests`}
                className="text-[13px] font-medium text-accent hover:underline"
              >
                Open Individuals
              </Link>
            }
          >
            <SavedLists orgSlug={slug} period={period} />
          </Card>
        </div>
      </Page>
    </>
  );
}

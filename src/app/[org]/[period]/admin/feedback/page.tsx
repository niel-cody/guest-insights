import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { Standfirst } from "@/components/shell/Standfirst";
import { Card, EmptyState } from "@/components/ui/Primitives";
import { getPeriods, getSnapshot } from "@/lib/data";
import { listFeedback, boardConfig } from "@/lib/board";
import { isStaff } from "@/lib/session";
import { FeedbackList } from "./FeedbackList";

/**
 * The inbox. Everything anybody said, and where they said it.
 *
 * ── The one dynamic page in the build ──────────────────────────────────────
 *
 * Every report is `force-static` and reads from disk, which is what lets this
 * deploy with no environment variable and no runtime call. This page is the
 * exception and has to be: an inbox rendered at build time is an inbox that
 * shows nothing anybody said after the build. The reports are untouched by it —
 * the cost is one dynamic route, not a dynamic product.
 *
 * ── Staff only, checked here and not merely hidden ─────────────────────────
 *
 * A merchant reviewer reading everyone's feedback would see the other
 * merchants' names, their organisation slugs and their opinions. This is the
 * one surface in the build where the cross-organisation wall is enforced by
 * refusing the page rather than by filtering the figures on it, and `notFound`
 * rather than a message is deliberate: "you may not see this" is itself an
 * answer to "does this exist".
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback" };

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ org: string; period: string }>;
}) {
  if (!(await isStaff())) notFound();

  const { org: slug, period } = await params;
  const [snap, periods, rows] = await Promise.all([
    getSnapshot(slug, period), getPeriods(slug), listFeedback(),
  ]);
  const current = periods.periods.find((p) => p.id === period);
  if (!current) notFound();

  const cfg = boardConfig();
  const open = rows.filter((r) => !r.resolved);

  return (
    <>
      <PageHeader
        org={snap.org}
        periods={periods}
        period={current}
        title="Feedback"
        section="Platform"
        population={false}
      />
      <Page>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <Standfirst
            question="What are people telling us, and about which page?"
            body={
              <>
                Every note carries the exact path it was written from, query string included — a
                report read with three filters applied is a different view from the same report
                unfiltered. {open.length === 0
                  ? "Nothing is outstanding."
                  : `${open.length} of ${rows.length} ${rows.length === 1 ? "note is" : "notes are"} still open.`}
              </>
            }
          />

          {!cfg.ok ? (
            <Card title="The board is not configured" padded={false}>
              <div className="p-5">
                <EmptyState
                  tone="warning"
                  title={cfg.reason}
                  body={
                    <>
                      Feedback and status are stored in Supabase, and this deployment cannot reach
                      it. Set <code className="font-mono text-[12px]">SUPABASE_URL</code> and{" "}
                      <code className="font-mono text-[12px]">SUPABASE_SERVICE_ROLE_KEY</code> in the
                      environment. The reports are unaffected — they read from disk and never
                      touched this.
                    </>
                  }
                />
              </div>
            </Card>
          ) : rows.length === 0 ? (
            <Card title="Nothing yet" padded={false}>
              <div className="p-5">
                <EmptyState
                  title="No feedback has been left"
                  body={
                    <>
                      The <strong className="text-ink">Give feedback</strong> button sits in the
                      header of every report. Notes arrive here with the page, the organisation and
                      who left them.
                    </>
                  }
                />
              </div>
            </Card>
          ) : (
            <FeedbackList rows={rows} />
          )}
        </div>
      </Page>
    </>
  );
}

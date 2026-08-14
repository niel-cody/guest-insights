import { Page, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Primitives";
import { getAllOrgs, getSnapshot } from "@/lib/data";
import { completeMonths, coverageState } from "@/lib/metrics";
import { GrowthClient } from "./GrowthClient";

export default async function GrowthPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [snap, orgs] = await Promise.all([getSnapshot(slug), getAllOrgs()]);
  const { org, coverage, decomposition } = snap;
  const cov = coverageState(org, coverage);
  const rows = completeMonths(decomposition, org.window.end);

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Growth"
        coverage={cov}
      />
      <Page>
        <div className="mx-auto max-w-[1240px] space-y-5">
          <GrowthClient rows={rows} />

          <Card title="How the split is calculated" subtitle="Because a buyer will ask, and the answer has to survive being asked twice.">
            <div className="space-y-3 text-[13px] leading-relaxed text-ink-secondary">
              <p>
                Revenue is modelled as{" "}
                <strong className="text-ink">
                  guests × visits per guest × items per visit × price per item
                </strong>
                . When revenue moves, each factor is credited with the average of its
                marginal contribution across every order in which the four factors could
                have changed — the symmetric Shapley value.
              </p>
              <p>
                Two properties matter here. The answer does not depend on the order an
                analyst happened to unwind the factors in, which a chained decomposition
                does. And the four parts sum to the change <em>exactly</em>, so there is no
                residual bar labelled &ldquo;other&rdquo; — the bar at which an operator
                stops believing the chart.
              </p>
              <p>
                The alternative under consideration is a log-mean (LMDI) split. It draws
                different bars on the same data, so the method is named here rather than
                left implicit, and can be swapped without changing anything upstream.
              </p>
              <p className="border-t border-line pt-3">
                Figures are attributed trade only — guests we can recognise. Unattributed
                revenue is excluded from the decomposition rather than being distributed
                across the terms by assumption.
              </p>
            </div>
          </Card>
        </div>
      </Page>
    </>
  );
}

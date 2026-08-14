import { Page, PageHeader } from "@/components/shell/PageHeader";
import { getAllOrgs, getGuests, getSnapshot } from "@/lib/data";
import { completeMonths, coverageState, memberFlow, namedLists, preShiftBrief } from "@/lib/metrics";
import { BriefClient } from "./BriefClient";
import { PrintSheet } from "./PrintSheet";

export default async function BriefPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [snap, guests, orgs] = await Promise.all([getSnapshot(slug), getGuests(slug), getAllOrgs()]);
  const { org, coverage, lifecycle } = snap;

  const cov = coverageState(org, coverage);
  const flow = completeMonths(memberFlow(lifecycle), org.window.end);
  const lists = namedLists(guests, org);
  const brief = preShiftBrief(org, lists, flow, cov);

  return (
    <>
      <div className="print:hidden contents">
        <PageHeader
          org={org}
          orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
          title="Brief"
          coverage={cov}
        />
        <Page>
          <BriefClient org={org} brief={brief} lists={lists} generatedFor={org.window.end} />
        </Page>
      </div>
      <PrintSheet org={org} brief={brief} lists={lists} />
    </>
  );
}

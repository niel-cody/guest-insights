import { Page, PageHeader } from "@/components/shell/PageHeader";
import { InvariantBadge, Tile } from "@/components/ui/Primitives";
import { getAllOrgs, getGuests, getSnapshot } from "@/lib/data";
import { count, coverageState, invariants, money, pct, rollUpSegments, tileCount } from "@/lib/metrics";
import { GuestGrid } from "./GuestGrid";

export default async function GuestsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [snap, guests, orgs] = await Promise.all([getSnapshot(slug), getGuests(slug), getAllOrgs()]);
  const { org, coverage, segments, lifecycle } = snap;

  const cov = coverageState(org, coverage);
  const checks = invariants(coverage, segments, guests, lifecycle);
  const all = rollUpSegments(segments);
  const members = rollUpSegments(segments, "member").reduce((a, s) => a + s.guests, 0);
  const cards = rollUpSegments(segments, "card").reduce((a, s) => a + s.guests, 0);
  const spend = all.reduce((a, s) => a + s.spend, 0);
  const oneVisit = all.find((s) => s.segment === "one-visit")?.guests ?? 0;

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        title="Guest list"
        coverage={cov}
        actions={<InvariantBadge ok={checks.every((c) => c.ok)} count={checks.length} />}
      />
      <Page>
        <div className="mx-auto max-w-[1240px] space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label={`Known ${org.labels.guests}`}
              value={count(tileCount(segments.population))}
              accent="var(--gain-returning)"
              hint="Person grain across both identity tiers, for the whole window."
            />
            <Tile
              label="Enrolled members"
              value={count(tileCount(members))}
              accent="var(--tier-member)"
              footnote={<>{pct(members / (segments.population || 1), 0)} of the base</>}
            />
            <Tile
              label="Recognised by card"
              value={count(tileCount(cards))}
              accent="var(--tier-card)"
              footnote={<>{pct(cards / (segments.population || 1), 0)} of the base, no enrolment</>}
            />
            <Tile
              label="Seen only once"
              value={count(tileCount(oneVisit))}
              accent="var(--warning)"
              hint="No second visit. The majority case in most hospitality businesses."
              footnote={<>{pct(oneVisit / (segments.population || 1), 0)} · {money(spend)} total spend</>}
            />
          </div>

          <GuestGrid guests={guests} org={org} />
        </div>
      </Page>
    </>
  );
}

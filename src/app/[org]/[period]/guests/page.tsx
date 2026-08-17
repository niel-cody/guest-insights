import { Suspense } from "react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { Tile } from "@/components/ui/Primitives";
import { getPeriods, getAllOrgs, getGuests, getSnapshot } from "@/lib/data";
import { count, coverageState, money, pct, tileCount, windowShort } from "@/lib/metrics";
import { GuestGrid, GROUPS, type GroupKey } from "./GuestGrid";
import { GridControls } from "./GridControls";

export const dynamic = "force-static";

/** Named per page: the tab and every screenshot used to read "Guests". */
export const metadata = { title: "Guests" };

/**
 * Guests. §7. The slice-and-dice surface.
 *
 * The tiles above the grid are computed on the **whole population**; the grid
 * itself runs on a bounded working set and says so in its own footer. Keeping
 * that distinction visible matters more than it sounds — the report this
 * replaces has a live defect where a chart's count disagrees with the table
 * beneath it, and the cause is a silent row cap.
 */
export default async function GuestsPage({
  params, searchParams,
}: {
  params: Promise<{ org: string; period: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org: slug, period } = await params;
  const sp = await searchParams;

  const [snap, guests, orgs] = await Promise.all([
    getSnapshot(slug, period), getGuests(slug, period), getAllOrgs(),
  ]);
  const periods = await getPeriods(slug);
  const current = periods.periods.find((p) => p.id === period)!;
  const { org, coverage, segments, members, network } = snap;

  const cov = coverageState(org, coverage);
  const cs = members.crossSection;
  const population = cs.member.people + cs.nonMember.people;

  const bands = members.opportunity.candidates.byBand;
  const seenOnce = bands.filter((b) => b.visitBand === 1);
  const onceGuests = seenOnce.reduce((a, b) => a + b.people, 0);
  const onceSpend = seenOnce.reduce((a, b) => a + b.spend, 0);

  const rawGroup = Array.isArray(sp.group) ? sp.group[0] : sp.group;
  const group: GroupKey = rawGroup && rawGroup in GROUPS ? (rawGroup as GroupKey) : "none";

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        periods={periods}
        period={current}
        title="Guests"
        coverage={cov}
        // §7.1's report-specific filters — value band and daypart — render
        // inside the shared bar rather than beside it. There is not a second
        // filter bar anywhere in the product.
        filters={<GridControls org={org} group={group} />}
      />
      <Page>
        <div className="mx-auto max-w-[1300px] space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label={`Known ${org.labels.guests}`}
              value={count(tileCount(population))}
              accent="var(--gain-returning)"
              footnote={
                <>
                  {count(segments.population)} classifiable — a card becomes a person on its second visit
                  <span className="mt-1 block text-ink-muted">
                    Person grain · {windowShort(org.window)} · not the number of customers served, which is
                    unknowable
                  </span>
                </>
              }
            />
            <Tile
              label="Enrolled members"
              value={count(tileCount(cs.member.people))}
              accent="var(--tier-member)"
              footnote={
                <>
                  {pct(cs.member.people / Math.max(population, 1), 0)} of the base
                  <span className="mt-1 block text-ink-muted">
                    Resolved through the card as well as the scan, so a member who forgot to scan is still
                    counted once
                  </span>
                </>
              }
            />
            <Tile
              label="Recognised by card"
              value={count(tileCount(cs.nonMember.people))}
              accent="var(--tier-card)"
              footnote={
                <>
                  {pct(cs.nonMember.people / Math.max(population, 1), 0)} of the base, never enrolled
                  <span className="mt-1 block text-ink-muted">
                    No name, email or phone exists for any of these people
                  </span>
                </>
              }
            />
            <Tile
              label="Seen only once"
              value={count(tileCount(onceGuests))}
              accent="var(--warning)"
              footnote={
                <>
                  {pct(onceGuests / Math.max(population, 1), 0)} of the base · {money(onceSpend)} between them
                  <span className="mt-1 block text-ink-muted">
                    No second visit inside the window. The majority case in most hospitality businesses
                  </span>
                </>
              }
            />
          </div>

          <Suspense fallback={null}>
            <GuestGrid
              guests={guests}
              org={org}
              items={snap.items}
              period={period}
              group={group}
              crossVenueShare={network.crossVenue.multiShareOfPeople}
            />
          </Suspense>
        </div>
      </Page>
    </>
  );
}


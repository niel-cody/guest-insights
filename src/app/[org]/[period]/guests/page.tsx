import { Suspense } from "react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { getPeriods, getGuests, getSnapshot } from "@/lib/data";
import { coverageState } from "@/lib/metrics";
import { GuestGrid, GROUPS, type GroupKey } from "./GuestGrid";
import { GridControls } from "./GridControls";

export const dynamic = "force-static";

/**
 * Named per page: the tab and every screenshot used to read "Guests".
 *
 * It reads **Individuals** now. The section is called Guests, and a report
 * called Guests inside a section called Guests reads as a mistake even when it
 * is not — but the better argument is that this was always the more accurate
 * name. Every other surface in the section computes over a population; this is
 * the only one that goes down to the person.
 *
 * The route stays `/guests`. Links to it are in circulation, and a shared link
 * that 404s is the defect Phase 0 spent its time removing.
 */
export const metadata = { title: "Individuals" };

/**
 * Individuals. §7. The slice-and-dice surface.
 *
 * Deliberately just the grid. Every statistic about the population lives on
 * Overview and Behaviour, which compute on the whole population; this page
 * carries no figures of its own, so there is nothing here that can silently
 * disagree with them. The grid's own bounded working set is stated in its
 * header rather than a footnote.
 */
export default async function GuestsPage({
  params, searchParams,
}: {
  params: Promise<{ org: string; period: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org: slug, period } = await params;
  const sp = await searchParams;

  const [snap, guests] = await Promise.all([
    getSnapshot(slug, period), getGuests(slug, period),
  ]);
  const periods = await getPeriods(slug);
  const current = periods.periods.find((p) => p.id === period)!;
  const { org, coverage, network } = snap;

  const cov = coverageState(org, coverage);

  const rawGroup = Array.isArray(sp.group) ? sp.group[0] : sp.group;
  const group: GroupKey = rawGroup && rawGroup in GROUPS ? (rawGroup as GroupKey) : "none";

  return (
    <>
      <PageHeader
        org={org}
        periods={periods}
        period={current}
        title="Individuals"
        section="Guests"
        surface="guests"
        coverage={cov}
        // §7.1's report-specific filters — value band and daypart — render
        // inside the shared bar rather than beside it. There is not a second
        // filter bar anywhere in the product.
        filters={<GridControls org={org} group={group} />}
      />
      <Page>
        <div className="mx-auto max-w-[1300px]">
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

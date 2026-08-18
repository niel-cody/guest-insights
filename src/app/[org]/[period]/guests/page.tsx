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
          {/* Same four-line-and-a-button pattern as Overview. See `Tile`: the
              method folds, the grain and window do not. */}
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label={`Known ${org.labels.guests}`}
              value={count(tileCount(population))}
              accent="var(--gain-returning)"
              detail={<>{count(segments.population)} of them classifiable</>}
              meta={<>Person grain · {windowShort(org.window)}</>}
              info={
                <>
                  <p>
                    Everybody identified by payment card in the window, enrolled or not.{" "}
                    <strong className="text-ink">
                      Not the number of customers you served, which is unknowable
                    </strong>{" "}
                    — cash and unbridged trade carry no identity at all.
                  </p>
                  <p className="mt-1.5">
                    &quot;Classifiable&quot; is the smaller number: enrolled, or seen on a card more than
                    once. A card seen once is a transaction, not yet a customer, and nothing about a habit
                    can be inferred from it.
                  </p>
                </>
              }
            />
            <Tile
              label="Enrolled members"
              value={count(tileCount(cs.member.people))}
              accent="var(--tier-member)"
              detail={<>{pct(cs.member.people / Math.max(population, 1), 0)} of the base</>}
              meta={<>Member tier · {windowShort(org.window)}</>}
              info={
                <>
                  <p>
                    People with a loyalty record. Resolved{" "}
                    <strong className="text-ink">through the card as well as the scan</strong>, so a member
                    who forgot to scan is still counted once rather than appearing twice — once as a member
                    and once as an anonymous card.
                  </p>
                  <p className="mt-1.5">
                    These are the only people who carry a name and the only people who carry a lifecycle
                    verdict.
                  </p>
                </>
              }
            />
            <Tile
              label="Recognised by card"
              value={count(tileCount(cs.nonMember.people))}
              accent="var(--tier-card)"
              detail={
                <>{pct(cs.nonMember.people / Math.max(population, 1), 0)} of the base, never enrolled</>
              }
              meta={<>Card tier · {windowShort(org.window)}</>}
              info={
                <>
                  <p>
                    A payment card seen more than once, belonging to somebody who has never enrolled. You can
                    recognise them at the counter.{" "}
                    <strong className="text-ink">You cannot contact them</strong> — no name, email or phone
                    exists for any of these people, which is why their rows carry a reference instead of a
                    name.
                  </p>
                  <p className="mt-1.5">
                    They carry no lifecycle verdict either: a reissued card is indistinguishable from a
                    customer who stopped coming.
                  </p>
                </>
              }
            />
            <Tile
              label="Seen only once"
              value={count(tileCount(onceGuests))}
              accent="var(--warning)"
              detail={
                <>
                  {pct(onceGuests / Math.max(population, 1), 0)} of the base · {money(onceSpend)} between them
                </>
              }
              meta={<>Person grain · {windowShort(org.window)}</>}
              info={
                <>
                  <p>
                    No second visit inside the window.{" "}
                    <strong className="text-ink">The majority case in most hospitality businesses</strong>,
                    and not a failure state — it is the normal shape of a customer base, which is why it is
                    not coloured as a problem elsewhere in this report.
                  </p>
                  <p className="mt-1.5">
                    It is a floor rather than a fact: somebody whose first visit fell in the last week of the
                    window has had no opportunity to return, and the window cannot tell them apart from
                    somebody who chose not to.
                  </p>
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


import { Suspense } from "react";
import { Page, PageHeader } from "@/components/shell/PageHeader";
import { CheckBadge, Tile } from "@/components/ui/Primitives";
import { getPeriods, getAllOrgs, getGuestRows, getGuests, getSnapshot } from "@/lib/data";
import { runChecks } from "@/lib/checks";
import { count, coverageState, money, pct, tileCount, windowShort } from "@/lib/metrics";
import { GuestGrid } from "./GuestGrid";

export const dynamic = "force-static";

export default async function GuestsPage({ params }: { params: Promise<{ org: string; period: string }> }) {
  const { org: slug, period } = await params;
  // Both shapes: the packed set goes to the client, which expands it there, and
  // the expanded rows stay on the server for the checks. Expanding here would
  // put the twenty-five field names back on the wire, which is the thing the
  // packing exists to avoid.
  const [snap, guests, guestRows, orgs] = await Promise.all([
    getSnapshot(slug, period), getGuests(slug, period), getGuestRows(slug, period), getAllOrgs(),
  ]);
  const periods = await getPeriods(slug);
  const current = periods.periods.find((p) => p.id === period)!;
  const { org, coverage, segments, members } = snap;

  const cov = coverageState(org, coverage);
  const checks = runChecks(snap, guestRows);
  const cs = members.crossSection;

  // Cohort figures come from the population source and are computed over that
  // cohort's own rows. The previous build captioned a seen-once tile with the
  // whole population's spend and overstated it sixfold.
  const bands = members.opportunity.candidates.byBand;
  const seenOnce = bands.filter((b) => b.visitBand === 1);
  const onceGuests = seenOnce.reduce((a, b) => a + b.people, 0);
  const onceSpend = seenOnce.reduce((a, b) => a + b.spend, 0);
  const population = cs.member.people + cs.nonMember.people;

  // Cross-venue share, measured rather than asserted — the drawer used to quote a
  // hardcoded 30.1% that belonged to a different population entirely.
  const crossVenue = (cs.member.multiVenue + cs.nonMember.multiVenue) / Math.max(population, 1);

  return (
    <>
      <PageHeader
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        periods={periods}
        period={current}
        title="Guest list"
        coverage={cov}
        actions={
          <CheckBadge href={`/${org.slug}/${period}/coverage#checks`} checks={checks} />
        }
      />
      <Page>
        <div className="mx-auto max-w-[1240px] space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Tile
              label={`Known ${org.labels.guests}`}
              value={count(tileCount(population))}
              accent="var(--gain-returning)"
              hint={`Person grain across both identity states, ${windowShort(org.window)}. Not the number of customers served — that is unknowable.`}
              footnote={`${count(segments.population)} classified — a card becomes a person on its second visit`}
            />
            <Tile
              label="Enrolled members"
              value={count(tileCount(cs.member.people))}
              accent="var(--tier-member)"
              footnote={<>{pct(cs.member.people / Math.max(population, 1), 0)} of the base</>}
              hint="Resolved through the card as well as the scan, so a member who forgot to scan is still counted once."
            />
            <Tile
              label="Recognised by card"
              value={count(tileCount(cs.nonMember.people))}
              accent="var(--tier-card)"
              footnote={<>{pct(cs.nonMember.people / Math.max(population, 1), 0)} of the base, never enrolled</>}
            />
            <Tile
              label="Seen only once"
              value={count(tileCount(onceGuests))}
              accent="var(--warning)"
              hint="No second visit inside the window. The majority case in most hospitality businesses."
              footnote={
                <>
                  {pct(onceGuests / Math.max(population, 1), 0)} of the base · {money(onceSpend)} between them
                </>
              }
            />
          </div>

          <Suspense fallback={null}>
            <GuestGrid guests={guests} org={org} items={snap.items} crossVenueShare={crossVenue} />
          </Suspense>
        </div>
      </Page>
    </>
  );
}

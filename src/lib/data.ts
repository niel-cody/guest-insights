/**
 * Snapshot access.
 *
 * The app reads extracted JSON from disk at build time. There is no database and
 * no request-time warehouse call — the demo cannot fail live, and Vercel needs no
 * Snowflake credentials (which is just as well: the analyst connection is SSO and
 * cannot run in a serverless function).
 *
 * When a key-pair service user exists, replace the body of these functions with a
 * warehouse call. Nothing above this file changes.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cache } from "react";
import type {
  Cohorts, Coverage, DayGrid, Dayparts, GuestRows, Guests, Items, Members, Network, Org,
  Scatter, Snapshot, VenueCrossRow,
} from "./types";
import { unpackGuests } from "./guest-columns";
import type { Periods } from "./periods";

const DATA = join(process.cwd(), "data");

/**
 * Every read is scoped to a period.
 *
 * The snapshot holds one directory per unbroken run of trustworthy months, so a
 * surface cannot accidentally read across a card-capture blackout — the months
 * it would need are not in the directory it is reading. That is the same
 * mechanism as the original single window, applied once per period.
 */
async function read<T>(slug: string, period: string, name: string): Promise<T> {
  return JSON.parse(await readFile(join(DATA, slug, period, `${name}.json`), "utf8")) as T;
}

export const ORG_SLUGS = ["coffee-guru", "meat-flour-wine"] as const;
export type OrgSlug = (typeof ORG_SLUGS)[number];

export const getPeriods = cache(
  async (slug: string): Promise<Periods> =>
    JSON.parse(await readFile(join(DATA, slug, "periods.json"), "utf8")) as Periods,
);

/** The period the product opens on: the most recent run. */
export async function defaultPeriod(slug: string): Promise<string> {
  return (await getPeriods(slug)).periods[0].id;
}

/** Every org and period combination, for static generation. */
export async function allOrgPeriods(): Promise<{ org: string; period: string }[]> {
  const out: { org: string; period: string }[] = [];
  for (const org of ORG_SLUGS) {
    for (const p of (await getPeriods(org)).periods) out.push({ org, period: p.id });
  }
  return out;
}

export const getOrg = cache(
  async (slug: string, period: string): Promise<Org> => read<Org>(slug, period, "org"),
);

export const getSnapshot = cache(async (slug: string, period: string): Promise<Snapshot> => {
  const [
    org, coverage, lifecycle, decomposition, segments, members, dayparts,
    dayGrid, venueCross, scatter, network, venueMonthly, items, cohorts,
  ] = await Promise.all([
    read<Snapshot["org"]>(slug, period, "org"),
    read<Snapshot["coverage"]>(slug, period, "coverage"),
    read<Snapshot["lifecycle"]>(slug, period, "lifecycle"),
    read<Snapshot["decomposition"]>(slug, period, "decomposition"),
    read<Snapshot["segments"]>(slug, period, "segments"),
    read<Snapshot["members"]>(slug, period, "members"),
    read<Snapshot["dayparts"]>(slug, period, "dayparts"),
    read<DayGrid>(slug, period, "dayGrid").catch(() => null),
    read<VenueCrossRow[]>(slug, period, "venueCross").catch(() => []),
    read<Scatter>(slug, period, "scatter").catch(() => null),
    read<Snapshot["network"]>(slug, period, "network"),
    read<Snapshot["venueMonthly"]>(slug, period, "venueMonthly"),
    read<Items>(slug, period, "items").catch(() => null),
    getCohorts(slug),
  ]);
  return {
    org, coverage, lifecycle, decomposition, segments, members, dayparts,
    dayGrid, venueCross, scatter, network, venueMonthly, items, cohorts,
  };
});

/**
 * The member cohort set. **Read from the org directory, not a period directory.**
 *
 * That is the §4.3 wall expressed as a file path: the member tier runs 21 months
 * on the loyalty scan and the card periods run 92 days on the payment reference,
 * so a cohort file filed under a card period would be one directory listing away
 * from being read as part of it. It is not in any of them.
 *
 * Null on an org extracted before the cohort lens existed, which is why every
 * consumer guards rather than assuming the file is there.
 */
export const getCohorts = cache(async (slug: string): Promise<Cohorts | null> => {
  try {
    return JSON.parse(await readFile(join(DATA, slug, "cohorts.json"), "utf8")) as Cohorts;
  } catch {
    return null;
  }
});

export const getMembers = cache(async (slug: string, period: string): Promise<Members> => read<Members>(slug, period, "members"));
export const getDayparts = cache(async (slug: string, period: string): Promise<Dayparts> => read<Dayparts>(slug, period, "dayparts"));
export const getNetwork = cache(async (slug: string, period: string): Promise<Network> => read<Network>(slug, period, "network"));

/**
 * Expanded rows, for anything that runs on the server — the checks in
 * particular. The client gets the packed form and expands it itself, because
 * expanding here would put the field names back on the wire.
 */
export const getGuestRows = cache(async (slug: string, period: string): Promise<GuestRows> => {
  const g = await getGuests(slug, period);
  return { sampled: g.sampled, population: g.population, rows: unpackGuests(g) };
});

/** Large; only the guest list and the Brief pull this. */
export const getGuests = cache(async (slug: string, period: string): Promise<Guests> => read<Guests>(slug, period, "guests"));

export const getCoverage = cache(async (slug: string, period: string): Promise<Coverage> => read<Coverage>(slug, period, "coverage"));

/** Every org at its own default period, for the organisation switcher. */
export async function getAllOrgs(): Promise<Org[]> {
  return Promise.all(ORG_SLUGS.map(async (s) => getOrg(s, await defaultPeriod(s))));
}

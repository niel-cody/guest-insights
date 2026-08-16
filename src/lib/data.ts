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
import type { Coverage, Dayparts, Guests, Members, Network, Org, Snapshot } from "./types";
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
  const [org, coverage, lifecycle, decomposition, segments, members, dayparts, network, venueMonthly] =
    await Promise.all([
      read<Snapshot["org"]>(slug, period, "org"),
      read<Snapshot["coverage"]>(slug, period, "coverage"),
      read<Snapshot["lifecycle"]>(slug, period, "lifecycle"),
      read<Snapshot["decomposition"]>(slug, period, "decomposition"),
      read<Snapshot["segments"]>(slug, period, "segments"),
      read<Snapshot["members"]>(slug, period, "members"),
      read<Snapshot["dayparts"]>(slug, period, "dayparts"),
      read<Snapshot["network"]>(slug, period, "network"),
      read<Snapshot["venueMonthly"]>(slug, period, "venueMonthly"),
    ]);
  return { org, coverage, lifecycle, decomposition, segments, members, dayparts, network, venueMonthly };
});

export const getMembers = cache(async (slug: string, period: string): Promise<Members> => read<Members>(slug, period, "members"));
export const getDayparts = cache(async (slug: string, period: string): Promise<Dayparts> => read<Dayparts>(slug, period, "dayparts"));
export const getNetwork = cache(async (slug: string, period: string): Promise<Network> => read<Network>(slug, period, "network"));

/** Large; only the guest list and the Brief pull this. */
export const getGuests = cache(async (slug: string, period: string): Promise<Guests> => read<Guests>(slug, period, "guests"));

export const getCoverage = cache(async (slug: string, period: string): Promise<Coverage> => read<Coverage>(slug, period, "coverage"));

/** Every org at its own default period, for the organisation switcher. */
export async function getAllOrgs(): Promise<Org[]> {
  return Promise.all(ORG_SLUGS.map(async (s) => getOrg(s, await defaultPeriod(s))));
}

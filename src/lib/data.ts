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
import type { Coverage, Dayparts, Guests, Members, Org, Snapshot } from "./types";

const DATA = join(process.cwd(), "data");

async function read<T>(slug: string, name: string): Promise<T> {
  return JSON.parse(await readFile(join(DATA, slug, `${name}.json`), "utf8")) as T;
}

export const ORG_SLUGS = ["coffee-guru", "meat-flour-wine"] as const;
export type OrgSlug = (typeof ORG_SLUGS)[number];

export const getOrg = cache(async (slug: string): Promise<Org> => read<Org>(slug, "org"));

export const getSnapshot = cache(async (slug: string): Promise<Snapshot> => {
  const [org, coverage, lifecycle, decomposition, segments, members, dayparts, venueMonthly] =
    await Promise.all([
      read<Snapshot["org"]>(slug, "org"),
      read<Snapshot["coverage"]>(slug, "coverage"),
      read<Snapshot["lifecycle"]>(slug, "lifecycle"),
      read<Snapshot["decomposition"]>(slug, "decomposition"),
      read<Snapshot["segments"]>(slug, "segments"),
      read<Snapshot["members"]>(slug, "members"),
      read<Snapshot["dayparts"]>(slug, "dayparts"),
      read<Snapshot["venueMonthly"]>(slug, "venueMonthly"),
    ]);
  return { org, coverage, lifecycle, decomposition, segments, members, dayparts, venueMonthly };
});

export const getMembers = cache(async (slug: string): Promise<Members> => read<Members>(slug, "members"));
export const getDayparts = cache(async (slug: string): Promise<Dayparts> => read<Dayparts>(slug, "dayparts"));

/** Large; only the guest list and the Brief pull this. */
export const getGuests = cache(async (slug: string): Promise<Guests> => read<Guests>(slug, "guests"));

export const getCoverage = cache(async (slug: string): Promise<Coverage> => read<Coverage>(slug, "coverage"));

export async function getAllOrgs(): Promise<Org[]> {
  return Promise.all(ORG_SLUGS.map((s) => getOrg(s)));
}

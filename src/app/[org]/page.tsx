import { redirect } from "next/navigation";
import { ORG_SLUGS, defaultPeriod } from "@/lib/data";

/**
 * An org URL with no period lands on the most recent run, at Home.
 *
 * It used to land on `/overview`, because Home did not exist and something had
 * to be first. Now that there is a landing state, an entry point that skips it
 * and drops the reader into the middle of the Guests section is a redirect that
 * has an opinion about what they came for.
 *
 * Kept rather than dropped because links to `/coffee-guru/overview` are already
 * in circulation, and a shared link that 404s is the defect this build spent
 * Phase 0 removing. Those links still resolve — this route only handles the
 * case where no period and no surface were named at all.
 */
export function generateStaticParams() {
  return ORG_SLUGS.map((org) => ({ org }));
}

export default async function OrgIndex({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  redirect(`/${org}/${await defaultPeriod(org)}`);
}

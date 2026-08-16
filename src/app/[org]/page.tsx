import { redirect } from "next/navigation";
import { ORG_SLUGS, defaultPeriod } from "@/lib/data";

/**
 * An org URL with no period lands on the most recent run.
 *
 * Kept rather than dropped because links to `/coffee-guru/overview` are already
 * in circulation, and a shared link that 404s is the defect this build spent
 * Phase 0 removing.
 */
export function generateStaticParams() {
  return ORG_SLUGS.map((org) => ({ org }));
}

export default async function OrgIndex({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  redirect(`/${org}/${await defaultPeriod(org)}/overview`);
}

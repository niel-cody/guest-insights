import { notFound } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { Instrumentation } from "@/components/shell/Instrumentation";
import { SpineBanner } from "@/components/shell/SpineBanner";
import { allOrgPeriods, getOrg, getPeriods } from "@/lib/data";

/**
 * The period is a route segment, not a filter.
 *
 * It changes every figure on the page, so it is navigation rather than
 * refinement — and making it a segment keeps all six surfaces statically
 * generated per period, which is what lets this build deploy with no
 * environment variable, no API key and no runtime call.
 */
export async function generateStaticParams() {
  return allOrgPeriods();
}

export const dynamicParams = false;

export default async function OrgLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string; period: string }>;
}) {
  const { org: slug, period } = await params;
  const all = await getPeriods(slug).catch(() => null);
  if (!all || !all.periods.some((p) => p.id === period)) notFound();
  const org = await getOrg(slug, period);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-sunken">
      <Instrumentation />
      <Sidebar orgSlug={org.slug} period={period} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Above the surface, not inside it: a member window changes the
            population every figure below is computed over, and no figure says
            so on its own face. */}
        <SpineBanner org={org} />
        {children}
      </main>
    </div>
  );
}

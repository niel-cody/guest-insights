import { notFound } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { Instrumentation } from "@/components/shell/Instrumentation";
import { ORG_SLUGS, getOrg } from "@/lib/data";

export function generateStaticParams() {
  return ORG_SLUGS.map((org) => ({ org }));
}

export default async function OrgLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  if (!ORG_SLUGS.includes(slug as never)) notFound();
  const org = await getOrg(slug);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-sunken">
      <Instrumentation />
      <Sidebar orgSlug={org.slug} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

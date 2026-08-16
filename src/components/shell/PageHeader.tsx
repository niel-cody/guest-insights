"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CoverageChip } from "@/components/ui/CoverageChip";
import type { CoverageState } from "@/lib/metrics";
import { dayLabel } from "@/lib/metrics";
import type { Org } from "@/lib/types";
import { IconChevron } from "./Icons";

/**
 * Page header and scope bar.
 *
 * Controls appear here only when the page can honour them. A venue selector on a
 * screen that cannot filter by venue is worse than no selector — the operator
 * believes a number that is not the number they asked for.
 */
export function PageHeader({
  org, orgs, title, coverage, controls, actions,
}: {
  org: Org;
  orgs: { slug: string; name: string }[];
  title: string;
  coverage?: CoverageState;
  controls?: ReactNode;
  actions?: ReactNode;
}) {
  const router = useRouter();

  return (
    <header className="shrink-0 border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold text-ink">{title}</h1>
          <span className="text-[13px] text-ink-muted">Guests</span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {coverage && <CoverageChip state={coverage} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <label className="relative flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] focus-within:border-accent">
          <span className="text-ink-muted">Organisation</span>
          <select
            value={org.slug}
            onChange={(e) => router.push(`/${e.target.value}/overview`)}
            className="cursor-pointer appearance-none bg-transparent pr-5 font-medium text-ink outline-none"
          >
            {orgs.map((o) => (
              <option key={o.slug} value={o.slug}>{o.name}</option>
            ))}
          </select>
          <IconChevron className="pointer-events-none absolute right-2 h-4 w-4 text-ink-muted" />
        </label>

        {/* Scope, not controls. These were bordered boxes styled exactly like the
            organisation <select> beside them, so they read as filters that did
            nothing. They are facts about the window, and now look like facts. */}
        <p className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <span className="tnum font-medium text-ink">
            {dayLabel(org.window.start)} – {dayLabel(org.window.end)}
          </span>
          <span className="text-ink-muted">·</span>
          <span>{org.window.months} complete months</span>
          <span className="text-ink-muted">·</span>
          <span>
            {org.venues.length} {org.venues.length === 1 ? "venue" : "venues"}
          </span>
        </p>

        {controls}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto p-6">{children}</div>;
}

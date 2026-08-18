"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseView, toQuery, type SearchParams } from "@/lib/url-state";

export type Tier = "member" | "card" | "all";

/**
 * The identity tier, read from the URL. **OV-3.**
 *
 * ── One control, and therefore one place that reads it ─────────────────────
 *
 * Overview used to carry two controls for this: the filter bar's `Customers`
 * and a local `TIER` control inside the segment grid, with nothing on the page
 * saying which won. It was worse than a duplicate — the page discarded its
 * `searchParams` entirely, so the *global* control did nothing here while the
 * local one worked.
 *
 * The grid now reads the bar. This hook exists because the moment a second
 * component on the page needed the same answer — the composition bars directly
 * beneath the grid — copying eleven lines of URL parsing into it would have
 * recreated the original defect one level down: two components deriving the
 * same state, free to disagree after any edit.
 *
 * Derived on every render and never copied into state, so there is no second
 * source to diverge from. `null` in the URL means no tier filter, which every
 * consumer draws as "All guests".
 */
export function useTier(): [Tier, (t: Tier) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tier: Tier = useMemo(
    () => parseView(Object.fromEntries(sp.entries()) as SearchParams).tier ?? "all",
    [sp],
  );

  const set = useCallback(
    (t: Tier) => {
      const view = parseView(Object.fromEntries(sp.entries()) as SearchParams);
      router.replace(`${pathname}${toQuery({ ...view, tier: t === "all" ? null : t, page: 1 })}`, {
        scroll: false,
      });
    },
    [sp, router, pathname],
  );

  return [tier, set];
}

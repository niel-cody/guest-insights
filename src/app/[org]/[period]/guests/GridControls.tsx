"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconChevron } from "@/components/shell/Icons";
import { BAND_LABEL } from "./GuestGrid";
import type { Org } from "@/lib/types";
import { parseView, toQuery, type SearchParams, type View } from "@/lib/url-state";
import { track } from "@/lib/instrument";

/**
 * The two report-specific filters, plus `Group`.
 *
 * §7.1 gives Guests five filters — Tier, Segment, Value band, Daypart and Venue.
 * Three of those are already in the shared bar as Customers, Segment and
 * Locations, so only two are added here. **They render inside the shared bar**,
 * passed through `PageHeader`'s `filters` prop, because §12 allows exactly one
 * filter bar in the product and a second cluster beside the first is a second
 * bar wearing a different name.
 *
 * `Group` is the production filter bar's grouping control, and it is wired here
 * rather than left inert: it drives the grid's row grouping, which is the
 * production grid's drag-to-group behaviour reached by a control instead of by a
 * drag. It lives in the URL like everything else, so a grouped view is a view
 * somebody can send.
 */
export function GridControls({ org, group }: { org: Org; group: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // The URL is the state, so this reads it directly rather than being handed a
  // view. That also lets it cross the server boundary as a plain node — a render
  // prop cannot.
  const view = parseView(Object.fromEntries(sp.entries()) as SearchParams);

  const set = (patch: Partial<View>) => {
    const next: View = { ...view, page: 1, ...patch };
    for (const key of Object.keys(patch)) track("filter.change", "guests", key);
    router.replace(`${pathname}${toQuery(next)}`, { scroll: false });
  };

  /**
   * `group` is a grid concern rather than a population filter, so it is not part
   * of the `View` contract — it is written straight to the query string and read
   * back on the server. Adding it to `View` would put a presentation setting in
   * the same object the route tests use to assert on a population.
   */
  function setGroup(next: string) {
    const params = new URLSearchParams(sp.toString());
    if (next === "none") params.delete("group");
    else params.set("group", next);
    track("filter.change", "guests", "group");
    const q = params.toString();
    router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
  }

  const dayparts = org.dayparts;

  return (
    <>
      <Select
        label="Value band"
        value={view.band == null ? "all" : String(view.band)}
        onChange={(v) => set({ band: v === "all" ? null : Number(v) })}
        options={[
          { value: "all", label: "All bands" },
          ...BAND_LABEL.map((l, i) => ({ value: String(i + 1), label: `${l} fifth` })),
        ]}
      />
      <Select
        label="Daypart"
        value={view.daypart ?? "all"}
        onChange={(v) => set({ daypart: v === "all" ? null : v })}
        options={[
          { value: "all", label: "All dayparts" },
          ...dayparts.map((d) => ({ value: d.key, label: d.label })),
        ]}
      />
      <Select
        label="Group"
        value={group}
        onChange={setGroup}
        options={[
          { value: "none", label: "None" },
          { value: "tier", label: "Tier" },
          { value: "segment", label: "Segment" },
          { value: "band", label: "Value band" },
          { value: "venue", label: "Home venue" },
        ]}
      />
    </>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] focus-within:border-accent">
      <span className="text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-medium text-ink outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <IconChevron className="pointer-events-none absolute right-2 h-4 w-4 text-ink-muted" />
    </label>
  );
}

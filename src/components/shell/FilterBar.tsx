"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PeriodPicker } from "@/components/ui/PeriodPicker";
import type { Period, Periods } from "@/lib/periods";
import type { Org } from "@/lib/types";
import { SEGMENT_LABEL, dayLabel } from "@/lib/metrics";
import {
  activeFilters, cleared, isFiltered, parseView, toQuery,
  type SearchParams, type View,
} from "@/lib/url-state";
import { track } from "@/lib/instrument";
import { IconChevron, IconX } from "./Icons";

/**
 * **The** filter bar. §4.7, §5.1.
 *
 * ── One bar, and there is not a second one anywhere ────────────────────────
 *
 * Every built report renders this and only this. The previous build grew a
 * second control cluster inside the guest grid's card header, which meant two
 * places to look for the same question and two implementations to keep in step.
 * Report-specific controls are passed in as `extra` and render **inside this
 * bar** rather than beside it — one row, one mental model.
 *
 * ── Why some controls are inert, and why they are here anyway ──────────────
 *
 * §4.7 asks for the production pattern — `View · Group · Date Range · Period ·
 * Locations · Channels · Customers · Clear` — because a reviewer who feels they
 * are looking at something other than Insights gives feedback about the chrome
 * instead of about the content.
 *
 * Four of those are real here: Date Range and Period are the card window,
 * Locations is the venue scope, Customers is the identity tier. **View, Group
 * and Channels are not wired**, so they render as marked, non-interactive
 * context rather than as selects that do nothing. That is the same treatment the
 * icon rail already gets, and it follows the standing rule in this codebase: a
 * control is wired or it is not a control. Build v1 shipped roughly twenty
 * affordances with no behaviour behind them and it cost the whole surface its
 * credibility.
 *
 * ── The state model ────────────────────────────────────────────────────────
 *
 * The view is derived from the URL on every render and never copied into state.
 * There is no local filter state here, so there is no second source to diverge
 * from — which is the whole of release blocker B2. See `lib/url-state.ts`.
 */
export function FilterBar({
  org, orgs, periods, period, extra, venuePersists = true,
}: {
  org: Org;
  orgs: { slug: string; name: string }[];
  periods: Periods;
  period: Period;
  /**
   * Report-specific controls. Rendered inside this bar, never beside it.
   *
   * A plain node rather than a render prop: `PageHeader` is a server component
   * and a function cannot cross that boundary. Each extra control is its own
   * client component reading the URL directly, which is the same contract the
   * rest of this file follows — the URL is the state, so nothing needs handing
   * down.
   */
  extra?: ReactNode;
  venuePersists?: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const view = useMemo(
    () => parseView(Object.fromEntries(sp.entries()) as SearchParams),
    [sp],
  );

  const set = useCallback(
    (patch: Partial<View>) => {
      const changesPopulation = Object.keys(patch).some(
        (k) => k !== "page" && k !== "guest" && k !== "sort" && k !== "dir" && k !== "tab",
      );
      const next: View = { ...view, ...(changesPopulation ? { page: 1 } : {}), ...patch };
      // R-189. The control that moved, never the value chosen — knowing the
      // Locations filter was used answers the question; knowing which venue
      // starts describing the operator's own estate back to whoever reads it.
      for (const key of Object.keys(patch)) track("filter.change", "filterbar", key);
      router.replace(`${pathname}${toQuery(next)}`, { scroll: false });
    },
    [view, router, pathname],
  );

  const chips = activeFilters(view);
  const venueName = (id: string) => org.venues.find((v) => v.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-2 px-6 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <Inert label="View" value="Standard" />
        <Inert label="Group" value="None" />

        {/* Date Range and Period are one control here, and deliberately not a
            date picker: the selectable ranges are the runs of months in which
            the card tier can be trusted, and an open calendar would offer
            periods the data cannot support. See PeriodPicker. */}
        <span className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px]">
          <span className="text-ink-muted">Date range</span>
          <span className="tnum font-medium text-ink">
            {dayLabel(org.window.start)} – {dayLabel(org.window.end)}
          </span>
        </span>

        <PeriodPicker all={periods} current={period} orgSlug={org.slug} />

        <Locations
          org={org}
          selected={view.venue}
          onChange={(venue) => set({ venue })}
          persists={venuePersists}
        />

        <Inert label="Channels" value="All" />

        <Select
          label="Customers"
          value={view.tier ?? "all"}
          onChange={(v) =>
            set({
              tier: v === "all" ? null : (v as View["tier"]),
              // A card cannot carry a lifecycle verdict, so a segment filter
              // held alongside a card-tier filter would select nobody and read
              // as an empty population rather than as a contradiction.
              segment: v === "card" ? null : view.segment,
            })
          }
          options={[
            { value: "all", label: "All customers" },
            { value: "member", label: "Members" },
            { value: "card", label: "Card only" },
          ]}
        />

        <Select
          label="Segment"
          value={view.segment ?? "all"}
          disabled={view.tier === "card"}
          note={view.tier === "card" ? "Only enrolled people carry a lifecycle verdict" : undefined}
          onChange={(v) => set({ segment: v === "all" ? null : (v as View["segment"]) })}
          options={[
            { value: "all", label: "All segments" },
            ...Object.entries(SEGMENT_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />

        {extra}

        {isFiltered(view) && (
          <button
            type="button"
            onClick={() => {
              track("filter.clear", "filterbar", "clear");
              router.replace(`${pathname}${toQuery(cleared(view))}`, { scroll: false });
            }}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-secondary hover:bg-surface-hover"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-[13px] text-ink-muted">
          {orgs.length > 1 && (
            <OrgSwitch org={org} orgs={orgs} />
          )}
        </span>
      </div>

      {/* What the reader is actually looking at, spelled out. A filtered report
          that looks like an unfiltered one is how somebody quotes a venue's
          number as the estate's. */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-ink-muted">Showing</span>
          {chips.map((c) => (
            <span
              key={String(c.key)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-2.5 py-0.5 text-[12px] text-ink-secondary"
            >
              <span className="text-ink-muted">{c.label}</span>
              <span className="font-medium text-ink">
                {c.key === "venue"
                  ? view.venue.map(venueName).join(", ")
                  : c.key === "segment"
                    ? SEGMENT_LABEL[c.value] ?? c.value
                    : c.value}
              </span>
              <button
                type="button"
                aria-label={`Remove ${c.label} filter`}
                onClick={() =>
                  set(
                    c.key === "venue"
                      ? { venue: [] }
                      : ({ [c.key]: c.key === "q" ? "" : null } as Partial<View>),
                  )
                }
                className="text-ink-muted hover:text-ink"
              >
                <IconX className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A production control this build does not implement.
 *
 * Rendered rather than omitted so the bar reads as Insights, and marked rather
 * than faked so nobody files feedback against a control that was never going to
 * respond. Not a button, not a select, and not focusable.
 */
function Inert({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-[13px] opacity-55"
      title="Not part of this proof of concept"
    >
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink-secondary">{value}</span>
      <span className="text-[10px] tracking-wide text-ink-muted uppercase">n/a</span>
    </span>
  );
}

function Select({
  label, value, onChange, options, disabled, note,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  note?: string;
}) {
  return (
    <label
      className={`relative flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] focus-within:border-accent ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <span className="text-ink-muted">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-medium text-ink outline-none disabled:cursor-not-allowed"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <IconChevron className="pointer-events-none absolute right-2 h-4 w-4 text-ink-muted" />
      {/* The reason, in always-visible type. §8 rule 7: no hover-only caveats —
          hover does not exist on touch, and a control that needs a tooltip to
          explain why it is disabled is not finished. */}
      {note && (
        <span className="absolute top-full left-0 mt-0.5 text-[11px] whitespace-nowrap text-ink-muted">
          {note}
        </span>
      )}
    </label>
  );
}

/**
 * `Locations` — the venue scope, and the one filter that follows you between
 * reports.
 *
 * Multi-select, because "how do my two airport sites compare with the rest" is
 * the question a multi-site operator actually has, and a single-venue dropdown
 * cannot express it.
 */
function Locations({
  org, selected, onChange, persists,
}: {
  org: Org;
  selected: string[];
  onChange: (ids: string[]) => void;
  persists: boolean;
}) {
  const all = selected.length === 0;
  const label = all
    ? `All ${org.venues.length} locations`
    : selected.length === 1
      ? org.venues.find((v) => v.id === selected[0])?.name ?? "1 location"
      : `${selected.length} locations`;

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] marker:hidden hover:bg-surface-hover">
        <span className="text-ink-muted">Locations</span>
        <span className="font-medium text-ink">{label}</span>
        <IconChevron className="h-4 w-4 text-ink-muted" />
      </summary>
      <div className="absolute top-full left-0 z-30 mt-1 max-h-[320px] w-[280px] overflow-y-auto rounded-xl border border-line bg-surface-raised p-2 shadow-lg">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
            all ? "bg-accent-soft font-semibold text-accent" : "text-ink-secondary hover:bg-surface-hover"
          }`}
        >
          All {org.venues.length} locations
        </button>
        {/* Venue identity is the store id, never the name. One store id with
            three successive names created a phantom venue of 6,799 orders in a
            previous build, so the value here is always the id and the name is
            only ever the label. */}
        {org.venues.map((v) => {
          const on = selected.includes(v.id);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(on ? selected.filter((s) => s !== v.id) : [...selected, v.id])}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                on ? "bg-accent-soft font-semibold text-accent" : "text-ink-secondary hover:bg-surface-hover"
              }`}
            >
              <span className="truncate">{v.name}</span>
              {on && <span className="shrink-0 text-[11px]">✓</span>}
            </button>
          );
        })}
        {persists && (
          <p className="border-t border-line px-2.5 pt-2 pb-1 text-[11px] leading-relaxed text-ink-muted">
            This scope follows you to Overview, Behaviour and Guests, and survives a reload.
          </p>
        )}
      </div>
    </details>
  );
}

function OrgSwitch({ org, orgs }: { org: Org; orgs: { slug: string; name: string }[] }) {
  const router = useRouter();
  return (
    <label className="relative flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] focus-within:border-accent">
      <span className="text-ink-muted">Organisation</span>
      <select
        value={org.slug}
        onChange={(e) => router.push(`/${e.target.value}`)}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-medium text-ink outline-none"
      >
        {orgs.map((o) => (
          <option key={o.slug} value={o.slug}>{o.name}</option>
        ))}
      </select>
      <IconChevron className="pointer-events-none absolute right-2 h-4 w-4 text-ink-muted" />
    </label>
  );
}

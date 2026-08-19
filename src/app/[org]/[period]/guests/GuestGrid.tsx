"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconSearch, IconX } from "@/components/shell/Icons";
import { Card, EmptyState, Pill } from "@/components/ui/Primitives";
import { GuestDrawer } from "./GuestDrawer";
import { SaveToList } from "@/components/ui/SaveToList";
import { SEGMENT_LABEL, count, money, pct, recencyShort } from "@/lib/metrics";
import type { Guest, Guests, Items, Org } from "@/lib/types";
import { unpackGuests } from "@/lib/guest-columns";
import { parseView, toQuery, type SearchParams, type View } from "@/lib/url-state";
import { track } from "@/lib/instrument";
import { TIER_LABEL } from "@/lib/lexicon";

const PAGE = 100;
const DEFAULT_SORT: SortKey = "spend";

type SortKey = "spend" | "visits" | "daysSince" | "firstSeen" | "venues";

export const BAND_LABEL = ["Lowest", "Second", "Middle", "Fourth", "Top"];

/**
 * The population a view selects, as a pure function.
 *
 * Exported because this is the thing the route tests assert on. The defect that
 * shipped was a parameter that survived in the URL and was then ignored, so a
 * test that checks the parameter round-trips proves nothing — **the assertion
 * has to be on the rendered population.** Keeping the selection here means the
 * test and the grid run identical code rather than similar code.
 *
 * `minVisits` and `minVenues` were being linked to from Overview and Behaviour
 * and were not implemented here at all, so both links landed on a larger
 * population than the figure the reader had just clicked.
 */
export function applyView(rows: Guest[], view: View): Guest[] {
  const needle = view.q.trim().toLowerCase();
  const sort = (view.sort ?? DEFAULT_SORT) as SortKey;
  const out = rows.filter(
    (g) =>
      (!view.tier || g.tier === view.tier) &&
      (!view.segment || g.segment === view.segment) &&
      (view.band == null || g.valueBand === view.band) &&
      (!view.daypart || g.homeDaypart === view.daypart) &&
      (view.minVisits == null || g.visits >= view.minVisits) &&
      (view.minVenues == null || g.venues >= view.minVenues) &&
      (!view.venue.length || view.venue.includes(g.homeStoreId)) &&
      (!needle || (g.name ?? "").toLowerCase().includes(needle) || g.id.includes(needle)),
  );
  return out.sort((a, b) => {
    const dir = view.dir === "asc" ? -1 : 1;
    if (sort === "firstSeen") return dir * (b.firstSeen ?? "").localeCompare(a.firstSeen ?? "");
    return dir * (Number(b[sort]) - Number(a[sort]));
  });
}

/** Names are masked by default. The reveal is role-gated and logged in production. */
export function mask(name: string): string {
  return name
    .split(" ")
    .map((p, i) => (i === 0 ? p : /^[A-Z0-9]{4}$/.test(p) ? p : `${p[0]}.`))
    .join(" ");
}

export const CARD_NOTE =
  "A payment card seen more than once. Oolio holds no name, email or phone for this person — " +
  "the reference is ours, generated from the card, and is not the card's number.";

/**
 * How a person is labelled.
 *
 * Members get a name because the business has one. **Card-recognised guests get
 * a reference, because it does not.** Rendering a first and last name against a
 * card makes the two rows read as the same kind of object, and an operator
 * scanning the grid concludes they can contact both. They can contact one.
 */
export function Identity({ g, unmasked }: { g: Guest; unmasked: boolean }) {
  if (g.tier === "member" && g.name) {
    return (
      <>
        <span className="font-medium text-ink">{unmasked ? g.name : mask(g.name)}</span>
        <code className="ml-2 text-[11px] text-ink-muted">{g.id.slice(0, 8)}</code>
      </>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[12px] text-ink-muted">Card</span>
      <code className="font-medium text-ink-secondary">·{g.id.slice(0, 4).toUpperCase()}</code>
      <code className="text-[11px] text-ink-muted">{g.id.slice(0, 8)}</code>
    </span>
  );
}

type ColKey =
  | "guest" | "tier" | "segment" | "band" | "visits" | "spend" | "lastSeen" | "daypart" | "venue";

type Column = { key: ColKey; label: string; fixed?: boolean; numeric?: boolean };

/**
 * §7.1's columns. `guest` is fixed — a grid whose identity column can be hidden
 * is a spreadsheet of numbers with no rows.
 */
const COLUMNS: Column[] = [
  { key: "guest", label: "Guest", fixed: true },
  { key: "tier", label: "Tier" },
  { key: "segment", label: "Segment" },
  { key: "band", label: "Value band" },
  { key: "visits", label: "Visits", numeric: true },
  { key: "spend", label: "Spend", numeric: true },
  { key: "lastSeen", label: "Last seen", numeric: true },
  { key: "daypart", label: "Usual time" },
  { key: "venue", label: "Home venue" },
];

/** What the `Group` control in the filter bar groups by. */
const GROUPS = {
  none: { label: "None", of: () => "" },
  tier: { label: "Identified by", of: (g: Guest) => (g.tier === "member" ? TIER_LABEL.member : TIER_LABEL.card) },
  segment: { label: "Segment", of: (g: Guest) => (g.segment ? SEGMENT_LABEL[g.segment] : "No verdict") },
  band: { label: "Value band", of: (g: Guest) => `${BAND_LABEL[g.valueBand - 1]} fifth` },
  venue: { label: "Home venue", of: (g: Guest) => g.homeStore },
} as const;

export type GroupKey = keyof typeof GROUPS;

export function GuestGrid({
  guests, org, items, period, crossVenueShare, group,
}: {
  guests: Guests;
  org: Org;
  items: Items | null;
  period: string;
  crossVenueShare: number;
  group: GroupKey;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * The view is derived from the URL on every render and never copied into
   * state. What shipped once was `useState(sp.get("tier") ?? "all")` — the URL
   * read at mount and then abandoned — which is two sources of truth reconciled
   * at exactly one moment, and why `?daypart=lunch` showed different populations
   * on a cold and a warm load. There is no local filter state below, so there is
   * no second source to diverge from.
   */
  const view = useMemo(() => parseView(Object.fromEntries(sp.entries()) as SearchParams), [sp]);

  const setView = useCallback(
    (patch: Partial<View>) => {
      const changesPopulation = Object.keys(patch).some(
        (k) => k !== "page" && k !== "guest" && k !== "sort" && k !== "dir" && k !== "tab",
      );
      const next: View = { ...view, ...(changesPopulation ? { page: 1 } : {}), ...patch };
      for (const key of Object.keys(patch)) {
        track(key === "guest" ? "drawer.open" : "filter.change", "guests", key);
      }
      router.replace(`${pathname}${toQuery(next)}`, { scroll: false });
    },
    [view, router, pathname],
  );

  /**
   * The reveal is deliberately not in the URL. Every other control here is
   * shareable because sharing a view is the point; unmasking is a privacy action
   * that is role-gated and audit-logged in production, and a link that silently
   * unmasked on somebody else's screen would make one person's authorisation
   * travel to another person's browser.
   */
  const [unmasked, setUnmasked] = useState(false);
  const [hidden, setHidden] = useState<Set<ColKey>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  const rows = useMemo(() => unpackGuests(guests), [guests]);
  const filtered = useMemo(() => applyView(rows, view), [rows, view]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(Math.max(view.page - 1, 0), pages - 1);
  const shown = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  const open = view.guest ? (filtered.find((g) => g.id === view.guest) ?? null) : null;
  const index = open ? filtered.findIndex((g) => g.id === open.id) : -1;

  const visible = COLUMNS.filter((c) => c.fixed || !hidden.has(c.key));

  // The SUM row is over **the whole filtered population**, not the page. A total
  // that silently describes 100 of 17,000 rows is the kind of number that gets
  // quoted in a meeting.
  const sums = useMemo(
    () => ({
      people: filtered.length,
      visits: filtered.reduce((a, g) => a + g.visits, 0),
      spend: filtered.reduce((a, g) => a + g.spend, 0),
    }),
    [filtered],
  );

  const grouped = useMemo(() => {
    if (group === "none") return null;
    const by = new Map<string, Guest[]>();
    for (const g of shown) {
      const k = GROUPS[group].of(g);
      by.set(k, [...(by.get(k) ?? []), g]);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown, group]);

  return (
    <>
      <Card
        title={`${org.labels.guests[0].toUpperCase()}${org.labels.guests.slice(1)}`}
        subtitle={`${count(filtered.length)} match · ${count(guests.sampled)} in the working set · ${count(guests.population)} classifiable in total`}
        padded={false}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
              <IconSearch className="h-4 w-4 text-ink-muted" />
              <input
                value={view.q}
                onChange={(e) => setView({ q: e.target.value })}
                placeholder="Name or id"
                className="w-28 bg-transparent text-[13px] outline-none placeholder:text-ink-muted"
              />
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-medium text-ink-secondary hover:bg-surface-hover"
              >
                Columns
                {hidden.size > 0 && <span className="ml-1.5 text-ink-muted">({visible.length})</span>}
              </button>
              {pickerOpen && (
                <div className="absolute top-full right-0 z-30 mt-1 w-[200px] rounded-xl border border-line bg-surface-raised p-2 shadow-lg">
                  {COLUMNS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      disabled={c.fixed}
                      onClick={() =>
                        setHidden((h) => {
                          const next = new Set(h);
                          if (next.has(c.key)) next.delete(c.key);
                          else next.add(c.key);
                          return next;
                        })
                      }
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                        c.fixed ? "opacity-45" : "text-ink-secondary hover:bg-surface-hover"
                      }`}
                    >
                      {c.label}
                      {(c.fixed || !hidden.has(c.key)) && <span className="text-[11px]">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <SaveToList view={view} rows={filtered} org={org} period={period} />

            {/* The prose footer that used to carry this went with the page's
                slimming down, but the caveat itself has not gone away: masking
                is applied in the browser, so the unmasked names are already in
                the page payload whether or not anyone presses this. The
                role-gated, audit-logged reveal in the spec is not built, and
                building it is a blocker on showing this screen outside Oolio. */}
            <button
              type="button"
              onClick={() => setUnmasked((v) => !v)}
              aria-pressed={unmasked}
              title="Masking is applied in the browser — the underlying names are present in the page. The role-gated, audit-logged reveal is not built yet."
              className="rounded-lg border px-2.5 py-1.5 text-[13px] font-medium"
              style={
                unmasked
                  ? { borderColor: "var(--warning)", background: "var(--surface-sunken)", color: "var(--ink)" }
                  : { borderColor: "var(--line)", color: "var(--ink-secondary)" }
              }
            >
              {unmasked ? "Names shown" : "Names masked"}
            </button>
          </div>
        }
      >
        {shown.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nobody matches" body="Loosen a filter, or clear the search." />
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-raised">
                <tr className="border-b border-line text-left text-[12px] text-ink-secondary">
                  {visible.map((c) => (
                    <th
                      key={c.key}
                      className={`px-3 py-2 font-medium ${c.numeric ? "text-right" : ""} ${
                        c.key === "guest" ? "pl-5" : ""
                      }`}
                    >
                      {c.label === "Visits" ? org.labels.visits : c.label}
                    </th>
                  ))}
                </tr>
              </thead>

              {grouped ? (
                grouped.map(([key, gs]) => (
                  <tbody key={key}>
                    <tr className="bg-surface-sunken">
                      <th
                        scope="colgroup"
                        colSpan={visible.length}
                        className="px-5 py-1.5 text-left text-[12px] font-semibold text-ink"
                      >
                        {key}
                        <span className="tnum ml-2 font-normal text-ink-muted">
                          {count(gs.length)} · {money(gs.reduce((a, g) => a + g.spend, 0))}
                        </span>
                      </th>
                    </tr>
                    {gs.map((g) => (
                      <Row key={g.id} g={g} org={org} visible={visible} unmasked={unmasked} onOpen={() => setView({ guest: g.id })} />
                    ))}
                  </tbody>
                ))
              ) : (
                <tbody>
                  {shown.map((g) => (
                    <Row key={g.id} g={g} org={org} visible={visible} unmasked={unmasked} onOpen={() => setView({ guest: g.id })} />
                  ))}
                </tbody>
              )}

              {/* The SUM row, over the whole filtered population. */}
              <tfoot className="sticky bottom-0 border-t border-line-strong bg-surface-sunken">
                <tr className="text-[13px] font-semibold text-ink">
                  {visible.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 ${c.numeric ? "tnum text-right" : ""} ${
                        c.key === "guest" ? "pl-5" : ""
                      }`}
                    >
                      {c.key === "guest"
                        ? `${count(sums.people)} ${org.labels.guests}`
                        : c.key === "visits"
                          ? count(sums.visits)
                          : c.key === "spend"
                            ? money(sums.spend)
                            : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Pagination only. The page carries no prose: the working set and the
            classifiable total are stated in the card subtitle, and every
            population figure lives on Overview and Behaviour. */}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            <button
              type="button" disabled={safePage === 0} onClick={() => setView({ page: safePage })}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-medium hover:bg-surface-hover disabled:opacity-40"
            >
              ←
            </button>
            <span className="tnum text-[12px] text-ink-secondary">{safePage + 1} of {pages}</span>
            <button
              type="button" disabled={safePage >= pages - 1} onClick={() => setView({ page: safePage + 2 })}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-medium hover:bg-surface-hover disabled:opacity-40"
            >
              →
            </button>
          </div>
        )}
      </Card>

      {open && (
        <GuestDrawer
          guest={open}
          org={org}
          items={items}
          tab={view.tab}
          onTab={(tab) => setView({ tab })}
          unmasked={unmasked}
          crossVenueShare={crossVenueShare}
          onClose={() => setView({ guest: null })}
          onPrev={index > 0 ? () => setView({ guest: filtered[index - 1].id }) : undefined}
          onNext={index >= 0 && index < filtered.length - 1 ? () => setView({ guest: filtered[index + 1].id }) : undefined}
        />
      )}
    </>
  );
}

function Row({
  g, org, visible, unmasked, onOpen,
}: {
  g: Guest;
  org: Org;
  visible: Column[];
  unmasked: boolean;
  onOpen: () => void;
}) {
  const cell: Record<ColKey, React.ReactNode> = {
    guest: <Identity g={g} unmasked={unmasked} />,
    tier: <Pill tone={g.tier === "member" ? "member" : "card"}>{g.tier === "member" ? "Member" : "Card"}</Pill>,
    // A card cannot be told apart from a card that was reissued, so no lifecycle
    // verdict is shown for one. The dash is the honest answer, not a gap.
    segment: g.segment ? SEGMENT_LABEL[g.segment] : <span className="text-ink-muted">—</span>,
    band: BAND_LABEL[g.valueBand - 1],
    visits: g.visits,
    spend: money(g.spend),
    lastSeen: recencyShort(g.daysSince, org.window),
    daypart: org.dayparts.find((d) => d.key === g.homeDaypart)?.label ?? "—",
    venue: (
      <>
        {g.homeStore}
        {g.venues > 1 && <span className="ml-1.5 text-[11px] text-ink-muted">+{g.venues - 1}</span>}
      </>
    ),
  };

  return (
    <tr onClick={onOpen} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-hover">
      {visible.map((c) => (
        <td
          key={c.key}
          className={`px-3 py-2 ${c.numeric ? "tnum text-right" : ""} ${
            c.key === "guest" ? "pl-5" : "text-ink-secondary"
          }`}
        >
          {cell[c.key]}
        </td>
      ))}
    </tr>
  );
}

export { GROUPS };
export function GroupOptions() {
  return Object.entries(GROUPS).map(([value, g]) => ({ value, label: g.label }));
}

export function shareOf(part: number, whole: number) {
  return pct(part / Math.max(whole, 1), 1);
}

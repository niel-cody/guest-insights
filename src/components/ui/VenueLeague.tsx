"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { attributionPct, count, dayLabel, money, pct } from "@/lib/metrics";
import { track } from "@/lib/instrument";
import { parseView, toQuery, type SearchParams } from "@/lib/url-state";
import type { Coverage, Org } from "@/lib/types";

/**
 * The venue league table.
 *
 * Phase 1 moves this off Coverage and onto Venues, above the map. PRD §6.1:
 * *"The single most-wanted artefact for a multi-site owner was at the bottom of
 * the diagnostics page."* Six of eight Operator Council seats manage by venue.
 *
 * ── The fifteen-second test decides the design ─────────────────────────────
 *
 * PRD §11: *"A multi-site operator finds their best and worst venue in under
 * fifteen seconds."* Two things follow, and they are the only design
 * constraints here — the columns are not redesigned.
 *
 * **The best and the worst are both put where they can be found**, which a
 * plain sort does not do: sorting descending buries the worst venue at the
 * bottom of nineteen rows, and an operator reading for the problem has to read
 * the middle to reach it. Both ends are marked, so the eye lands on them
 * without counting rows.
 *
 * **Every column is sortable**, because "best" is not one thing — best by
 * revenue and best by member share are different venues and the operator knows
 * which question they came with.
 *
 * Selecting a row sets the venue scope in the URL, which is the whole reason
 * this table and the scope contract land together.
 */

type Col = {
  key: string;
  label: string;
  /** The value to rank on. Higher is better unless `lowerIsBetter`. */
  value: (v: Row) => number;
  render: (v: Row) => string;
  lowerIsBetter?: boolean;
  numeric: boolean;
};

type Row = Coverage["byVenue"][number] & {
  attributedShare: number;
  memberShare: number;
  firstDay: string | null;
  formerNames: string[];
};

export function VenueLeague({ org, coverage }: { org: Org; coverage: Coverage }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = parseView(Object.fromEntries(sp.entries()) as SearchParams);

  const rows: Row[] = useMemo(
    () =>
      coverage.byVenue.map((v) => {
        const venue = org.venues.find((x) => x.id === v.storeId);
        return {
          ...v,
          attributedShare: (v.memberRevenue + v.cardRevenue) / Math.max(v.revenue, 1),
          memberShare: v.memberRevenue / Math.max(v.revenue, 1),
          firstDay: venue?.firstDay ?? null,
          formerNames: venue?.formerNames ?? [],
        };
      }),
    [coverage.byVenue, org.venues],
  );

  const cols: Col[] = [
    { key: "revenue", label: "Revenue", value: (v) => v.revenue, render: (v) => money(v.revenue), numeric: true },
    { key: "orders", label: "Orders", value: (v) => v.orders, render: (v) => count(v.orders), numeric: true },
    {
      key: "basket", label: "Per order",
      value: (v) => v.revenue / Math.max(v.orders, 1),
      render: (v) => money(v.revenue / Math.max(v.orders, 1)), numeric: true,
    },
    {
      key: "attributed", label: "Attributed",
      value: (v) => v.attributedShare, render: (v) => attributionPct(v.attributedShare), numeric: true,
    },
    {
      key: "members", label: "Member share",
      value: (v) => v.memberShare, render: (v) => attributionPct(v.memberShare), numeric: true,
    },
  ];

  const sortKey = view.sort && cols.some((c) => c.key === view.sort) ? view.sort : "revenue";
  const col = cols.find((c) => c.key === sortKey)!;
  const dir = view.dir;

  // Sorted by key rather than by the column object: the compiler cannot prove a
  // captured object is not mutated later, and a stable primitive dependency
  // lets it memoise this properly.
  const sorted = useMemo(() => {
    const rank = cols.find((c) => c.key === sortKey)!.value;
    const out = [...rows].sort((a, b) => rank(b) - rank(a));
    return dir === "asc" ? out.reverse() : out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, dir]);

  // Both ends of the *current* ranking, so the marks move with the sort rather
  // than permanently labelling whichever venue takes the most money.
  const bestId = sorted[dir === "asc" ? sorted.length - 1 : 0]?.storeId;
  const worstId = sorted[dir === "asc" ? 0 : sorted.length - 1]?.storeId;

  const go = (patch: Parameters<typeof toQuery>[0]) =>
    router.replace(`${pathname}${toQuery({ ...view, ...patch })}`, { scroll: false });

  const scoped = new Set(view.venue);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
            <th className="px-5 py-2.5 text-left font-medium">Venue</th>
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2.5 text-right font-medium">
                <button
                  type="button"
                  onClick={() => {
                    track("filter.change", "venues", `sort:${c.key}`);
                    go({ sort: c.key, dir: sortKey === c.key && dir === "desc" ? "asc" : "desc" });
                  }}
                  className={`inline-flex items-center gap-1 uppercase hover:text-ink ${
                    sortKey === c.key ? "text-ink" : ""
                  }`}
                  aria-sort={sortKey === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {c.label}
                  <span aria-hidden className={sortKey === c.key ? "" : "opacity-0"}>
                    {dir === "asc" ? "↑" : "↓"}
                  </span>
                </button>
              </th>
            ))}
            <th className="px-5 py-2.5 text-right font-medium">First traded</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((v) => {
            const isBest = v.storeId === bestId;
            const isWorst = v.storeId === worstId;
            const isScoped = scoped.has(v.storeId);
            return (
              <tr
                key={v.storeId}
                onClick={() => {
                  track("scope.change", "venues", "league-row");
                  go({ venue: isScoped ? [] : [v.storeId], page: 1 });
                }}
                aria-selected={isScoped}
                className={`cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-hover ${
                  isScoped ? "bg-accent-soft" : ""
                }`}
              >
                <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">
                  <span className="flex items-center gap-2">
                    {v.storeName}
                    {/* Marked rather than merely sorted: an operator reading for
                        the problem should not have to read nineteen rows to
                        reach it. */}
                    {isBest && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-white"
                        style={{ background: "var(--good)" }}
                      >
                        best {col.label.toLowerCase()}
                      </span>
                    )}
                    {isWorst && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-white"
                        style={{ background: "var(--warning)" }}
                      >
                        lowest {col.label.toLowerCase()}
                      </span>
                    )}
                  </span>
                  {v.formerNames.length > 0 && (
                    <span className="block text-[12px] font-normal text-ink-muted">
                      previously {v.formerNames.join(", ")}
                    </span>
                  )}
                </th>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`tnum px-3 py-2.5 text-right ${
                      c.key === sortKey ? "font-medium text-ink" : "text-ink-secondary"
                    }`}
                  >
                    {c.render(v)}
                  </td>
                ))}
                <td className="tnum px-5 py-2.5 text-right text-ink-secondary">
                  {v.firstDay ? dayLabel(v.firstDay) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted">
        Identity is the store id; the name is an attribute and it changes. Grouping trade by name invents
        venues that never existed — at Meat Flour Wine it produced a phantom third site with 6,799 orders and
        dated Braeside&apos;s opening to the day it was renamed. Selecting a row scopes this surface to that
        venue and writes it to the address bar, so the view can be sent.
        {view.venue.length > 0 && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => go({ venue: [] })}
              className="font-medium text-accent hover:underline"
            >
              Clear the venue scope
            </button>
            .
          </>
        )}
      </p>
    </div>
  );
}

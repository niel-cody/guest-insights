"use client";

import { useState } from "react";
import { DayMatrix, type MatrixCell } from "./DayMatrix";
import { count, money, pct } from "@/lib/metrics";
import type { DayGrid, Daypart } from "@/lib/types";

/**
 * The trading week. One grid, one ramp, a metric toggle.
 *
 * ── Why this stopped being three grids ────────────────────────────────────
 *
 * It rendered as three geometrically identical 7×8 grids stacked vertically, on
 * three different colour ramps. That asks the reader to compare across **the
 * weakest perceptual channel there is** — Cleveland and McGill rank position
 * first and colour hue and saturation last — and to do it three times, from
 * memory, with no shared scale between the panels.
 *
 * One grid with a toggle holds position constant. Flipping the metric changes
 * only the shading, so the comparison happens in the same cells rather than
 * across 400 pixels of scroll, which is where the comparison actually happens in
 * a reader's head anyway.
 *
 * ── The difference view ───────────────────────────────────────────────────
 *
 * Order density and revenue density carry nearly the same shape, because a busy
 * hour is a high-revenue hour almost by construction. Rendering both wastes the
 * grid on a near-duplicate. **The information is the difference** — where
 * revenue share runs ahead of order share, the basket is bigger; where it lags,
 * smaller. That is a diverging quantity with a real midpoint at zero, so it is
 * the one view here that earns a diverging ramp.
 */

const VIEWS = [
  { key: "orders", label: "Order density" },
  { key: "basket", label: "Revenue vs orders" },
  { key: "member", label: "Member share" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export function TradingWeek({
  dayGrid, dayparts, totalOrders, totalRevenue, memberShareOverall, windowLabel, breakfastOrders,
}: {
  dayGrid: DayGrid;
  dayparts: readonly Daypart[];
  totalOrders: number;
  totalRevenue: number;
  memberShareOverall: number;
  windowLabel: string;
  breakfastOrders: number;
}) {
  const [view, setView] = useState<ViewKey>("orders");

  const cells = new Map<string, MatrixCell>();
  let max = 0;

  for (const c of dayGrid.cells) {
    let value: number;
    let label: string;

    if (view === "orders") {
      value = c.orders;
      label = `${count(c.orders)} orders · ${money(c.revenue)}`;
    } else if (view === "member") {
      value = c.orders ? c.memberOrders / c.orders : 0;
      label = `${pct(value, 1)} member share · ${count(c.orders)} orders`;
    } else {
      // Revenue share minus order share, as a proportion of the order share —
      // i.e. how much bigger or smaller the basket is in this cell than the
      // estate average. Zero means the cell earns exactly its footfall.
      const orderShare = totalOrders ? c.orders / totalOrders : 0;
      const revenueShare = totalRevenue ? c.revenue / totalRevenue : 0;
      value = orderShare ? revenueShare / orderShare - 1 : 0;
      label =
        `${value >= 0 ? "+" : "−"}${(Math.abs(value) * 100).toFixed(0)}% basket against the estate average · ` +
        `${count(c.orders)} orders · ${money(c.revenue / Math.max(c.orders, 1))} an order`;
    }
    max = Math.max(max, Math.abs(value));
    cells.set(`${c.dow}|${c.daypart}`, { value, label });
  }

  const hue =
    view === "member" ? "var(--tier-member)" : view === "basket" ? "var(--good)" : "var(--accent)";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            aria-pressed={view === v.key}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
              view === v.key
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-ink-secondary hover:bg-surface-hover"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <DayMatrix
        // All eight periods, in clock order. The three the business does not
        // trade in stay as columns: a calendar with days missing is not a
        // calendar, and a column of no-trade cells says something real. They are
        // narrowed rather than dropped — at 0.04% of trade they were taking 38%
        // of the grid's width.
        columns={dayparts.map((d) => ({
          key: d.key,
          label: d.label,
          sublabel: `${String(d.from).padStart(2, "0")}–${String(d.to % 24).padStart(2, "0")}`,
          narrow: (dayGrid.cells
            .filter((c) => c.daypart === d.key)
            .reduce((a, c) => a + c.orders, 0) / Math.max(totalOrders, 1)) < 0.001,
        }))}
        cells={cells}
        max={max}
        hue={hue}
        diverging={view === "basket"}
        population={
          view === "member"
            ? `Member share of orders · estate average ${pct(memberShareOverall, 1)}`
            : view === "basket"
              ? `Basket size against the estate average of ${money(totalRevenue / Math.max(totalOrders, 1))} an order`
              : `${count(totalOrders)} orders · ${money(totalRevenue)}`
        }
        window={`${windowLabel} · venue-local time`}
      />

      <p className="mt-3 max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
        <strong className="text-ink-secondary">Both axes are venue-local.</strong> Day of week and daypart
        are derived from the localised trading timestamp, not from UTC — a UTC derivation moves Australian
        early-morning trade straight out of the column carrying {count(breakfastOrders)} orders, and does it
        silently. Dayparts run in clock order and are never sorted by value: this is a calendar, not a
        ranking. Switching the metric changes only the shading, so position stays constant and the
        comparison happens in the same cells. The precision layer is the table below, which <em>is</em>{" "}
        sorted by density.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { DecompositionRow } from "@/lib/types";
import { monthLabel } from "@/lib/metrics";
import { Grid, Legend, PLOT, TipRow, Tooltip, niceTicks, useTooltip } from "./chart-kit";

/**
 * The four factors over time. **OV-8 of the Build 5 review.**
 *
 * > "Give the user the option to plot this on a line chart. Each data point will
 * > have its own colour over a period of time, so you can see change."
 *
 * This is the strongest idea on the board, and the reason is that it is the only
 * thing on either page that would make a merchant open the report **next month**
 * rather than read it once. A waterfall says price carried growth this quarter.
 * Four lines say whether price has been carrying growth for one month or for
 * six, which is a different and more useful fact.
 *
 * ── The gap this does not plot ─────────────────────────────────────────────
 *
 * The review flagged a blocker: the previous comparable period ends thirteen
 * months back, because card capture failed in between, and a line drawn across
 * that gap would be plotting the outage rather than the business.
 *
 * That blocker is real and it is avoided rather than waited on. **This chart
 * runs only over the months inside the current window**, which are consecutive
 * by construction — the window *is* the most recent unbroken run of trustworthy
 * card months, so there is no gap inside it to draw across. It never reaches
 * back to the earlier run and there is no control that would let it.
 *
 * What that costs is honestly small and honestly stated: three points, not
 * eighteen. Enough to see a direction, not enough to call a trend, and the note
 * under the chart says exactly that rather than letting three points imply a
 * line. When card coverage is stable across consecutive months the same
 * component draws eighteen without changing.
 *
 * ── Indexed, not absolute ──────────────────────────────────────────────────
 *
 * The four factors are 16,631 guests, 2.92 visits, 1.95 items and $7.32. On one
 * absolute axis three of them are a flat line at the bottom. Indexing every
 * factor to 100 at the first month puts them on the one axis where they are
 * comparable — **percentage movement**, which is also the only axis on which
 * their contributions to revenue are comparable, because the model is
 * multiplicative.
 */

/**
 * An indexed value against its 100 baseline, in words the figure supports.
 *
 * One decimal place renders a factor that moved 0.02% as **"+0.0%"**, which is
 * the same defect OV-7 found in the decomposition table: a label stating a
 * direction its own digits do not show. This build already has an idiom for it
 * — the daypart density column prints "flat" below its resolution rather than a
 * signed number a reader would try to interpret — so this uses the same one.
 */
function indexDelta(v: number): string {
  const d = v - 100;
  if (Math.abs(d) < 0.05) return "flat";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`;
}

const FACTORS = [
  { key: "guests", label: "Guests", colour: "var(--gain-returning)" },
  { key: "visitsPerGuest", label: "Visits per guest", colour: "var(--gain-new)" },
  { key: "itemsPerVisit", label: "Items per visit", colour: "var(--segment-new)" },
  { key: "pricePerItem", label: "Average item price", colour: "var(--tier-card)" },
] as const;

export function FactorTrend({ rows, height = 280 }: { rows: DecompositionRow[]; height?: number }) {
  const { tip, show, hide, ref } = useTooltip();
  const [focus, setFocus] = useState<string | null>(null);
  const width = 760;

  // Two points is a before-and-after, which the waterfall already draws better.
  if (rows.length < 3) return null;

  const base = rows[0];
  /** Every factor as a percentage of its own first month. */
  const series = FACTORS.map((f) => ({
    ...f,
    points: rows.map((r) => {
      const b = Number(base[f.key]);
      return b ? (Number(r[f.key]) / b) * 100 : 100;
    }),
  }));

  const values = series.flatMap((s) => s.points);
  const lo = Math.min(...values, 100);
  const hi = Math.max(...values, 100);
  const pad = Math.max((hi - lo) * 0.25, 0.8);

  const plotH = height - PLOT.top - PLOT.bottom - 18;
  const plotW = width - PLOT.left - PLOT.right;
  const x = (i: number) => PLOT.left + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
  const y = (v: number) => PLOT.top + ((hi + pad - v) / (hi + pad - (lo - pad))) * plotH;
  const ticks = niceTicks(lo - pad, hi + pad, 4);

  return (
    <div>
      <div ref={ref} className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[600px]"
          role="img"
          aria-label={
            `Guests, visits per guest, items per visit and average item price, indexed to 100 at ` +
            `${monthLabel(rows[0].month)}, over ${rows.length} months`
          }
        >
          <Grid ticks={ticks} y={y} width={width} format={(v) => v.toFixed(1)} />

          {/* The 100 line is the comparison, so it is drawn as a reference
              rather than as another gridline. Everything above it grew. */}
          <line
            x1={PLOT.left}
            x2={width - PLOT.right}
            y1={y(100)}
            y2={y(100)}
            stroke="var(--ink-muted)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={width - PLOT.right}
            y={y(100) - 5}
            textAnchor="end"
            fontSize={10}
            fill="var(--ink-muted)"
          >
            {monthLabel(rows[0].month)} = 100
          </text>

          {series.map((s) => {
            const dim = focus !== null && focus !== s.key;
            return (
              <g key={s.key} opacity={dim ? 0.2 : 1}>
                <path
                  d={s.points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p)}`).join(" ")}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={dim ? 1.5 : 2.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.points.map((p, i) => (
                  <circle key={i} cx={x(i)} cy={y(p)} r={3.5} fill={s.colour} />
                ))}
              </g>
            );
          })}

          {/* One hit area per month, so the tooltip reads every factor at that
              point rather than whichever line the cursor happened to touch. A
              per-line hover would make the reader chase four hovers to compare
              four numbers at the same month. */}
          {rows.map((r, i) => (
            <rect
              key={r.month}
              x={x(i) - plotW / (rows.length - 1) / 2}
              y={PLOT.top}
              width={plotW / (rows.length - 1)}
              height={plotH}
              fill="transparent"
              onMouseMove={(e) =>
                show(e, (
                  <div>
                    <p className="mb-1 font-semibold text-ink">{monthLabel(r.month)}</p>
                    {series.map((s) => (
                      <TipRow
                        key={s.key}
                        label={s.label}
                        color={s.colour}
                        value={indexDelta(s.points[i])}
                      />
                    ))}
                  </div>
                ))
              }
              onMouseLeave={hide}
            />
          ))}

          {rows.map((r, i) => (
            <text
              key={r.month}
              x={x(i)}
              y={height - 14}
              textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--ink-secondary)"
            >
              {monthLabel(r.month)}
            </text>
          ))}
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>

      <div
        className="mt-3"
        onMouseLeave={() => setFocus(null)}
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              onMouseEnter={() => setFocus(s.key)}
              onFocus={() => setFocus(s.key)}
              onBlur={() => setFocus(null)}
              onClick={() => setFocus((f) => (f === s.key ? null : s.key))}
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] text-ink-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.colour }} />
              {s.label}
              <span className="tnum text-ink-muted">{indexDelta(s.points.at(-1)!)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* The limit, on the face rather than in the drawer. How many points a
          line is drawn through changes how the line should be read, which is
          the test for what stays visible. */}
      <p className="mt-3 max-w-[95ch] text-[12px] leading-relaxed text-ink-muted">
        <strong className="text-ink-secondary">
          {rows.length} consecutive months, and only the months inside this window.
        </strong>{" "}
        It does not reach back to the earlier readable period, because the months between the two failed
        card capture and a line drawn across them would be plotting the outage rather than the business.
        Three points show a direction; they are not enough to call a trend, and this chart will not say one
        until the window is longer.
      </p>
    </div>
  );
}

/** Legend re-exported for callers that render their own frame. */
export { Legend };

"use client";

import { useMemo } from "react";
import type { Flow } from "@/lib/metrics";
import { count, monthLabel } from "@/lib/metrics";
import { Grid, Legend, PLOT, TipRow, Tooltip, barPath, niceTicks, useTooltip } from "./chart-kit";

/**
 * The 24-month guest flow. Gains stack upward in one blue ramp, losses hang below
 * the zero line in red, and the net line rides on top.
 *
 * Divergence around zero is the point: an operator can see at a glance whether a
 * month added or removed customers, which a conventional stacked "active guests"
 * chart hides completely. The same-month-last-year marker answers the seasonality
 * question in the same glance.
 */
export function GuestFlowChart({
  flow, height = 300,
}: {
  flow: Flow[];
  height?: number;
}) {
  const { tip, show, hide, ref } = useTooltip();
  const width = 900;

  // Gains are new guests plus guests who came back. Guests who simply returned
  // within their usual gap are not a gain — they are the business continuing to
  // work — and stacking them here would make the chart disagree with the tiles.
  const { x, y, ticks, band } = useMemo(() => {
    const maxUp = Math.max(...flow.map((f) => f.gained), 1);
    const maxDown = Math.max(...flow.map((f) => f.lost), 1);
    const top = maxUp * 1.1;
    const bottom = -maxDown * 1.1;
    const plotH = height - PLOT.top - PLOT.bottom;
    const plotW = width - PLOT.left - PLOT.right;
    const bandW = plotW / flow.length;
    return {
      band: bandW,
      x: (i: number) => PLOT.left + i * bandW,
      y: (v: number) => PLOT.top + ((top - v) / (top - bottom)) * plotH,
      ticks: niceTicks(bottom, top, 5),
    };
  }, [flow, height]);

  const barW = Math.max(band - 6, 3);
  const zero = y(0);

  const series = [
    { key: "new" as const, label: "New", color: "var(--gain-new)" },
    { key: "reactivated" as const, label: "Came back", color: "var(--gain-reactivated)" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Legend
          items={[
            { label: "New", color: "var(--gain-new)" },
            { label: "Came back", color: "var(--gain-reactivated)" },
            { label: "Lost", color: "var(--loss)" },
          ]}
        />
        {/* The same-month-last-year marker is gone with the two-year chrome. The
            honest window is three months of trustworthy card data, and a
            year-on-year comparator drawn across the card outage would compare a
            measured month against a month in which nothing could be measured. */}
      </div>

      <div ref={ref} className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[680px]"
          role="img"
          aria-label={`Members gained and lost in each of the ${flow.length} months in the window`}
        >
          <Grid ticks={ticks} y={y} width={width} format={(v) => count(Math.abs(v))} />

          {flow.map((f, i) => {
            const bx = x(i) + (band - barW) / 2;

            // Gains stack up from zero, with a 2px surface gap between segments.
            let acc = 0;
            const stacked = series.map((s) => {
              const v = f[s.key];
              const y0 = y(acc);
              acc += v;
              const y1 = y(acc);
              return { ...s, value: v, top: y1, h: y0 - y1 };
            });

            return (
              <g
                key={f.month}
                onMouseMove={(e) =>
                  show(e, (
                    <div>
                      <p className="mb-1 font-semibold text-ink">{monthLabel(f.month, true)}</p>
                      <TipRow label="Returning" value={count(f.returning)} color="var(--gain-returning)" />
                      <TipRow label="New" value={count(f.new)} color="var(--gain-new)" />
                      <TipRow label="Came back" value={count(f.reactivated)} color="var(--gain-reactivated)" />
                      <TipRow label="Lost" value={count(f.lost)} color="var(--loss)" />
                      <div className="mt-1 border-t border-line pt-1">
                        <TipRow label="Net" value={`${f.net >= 0 ? "+" : ""}${count(f.net)}`} />
                      </div>
                    </div>
                  ))
                }
                onMouseLeave={hide}
              >
                <rect x={x(i)} y={PLOT.top} width={band} height={height - PLOT.top - PLOT.bottom} fill="transparent" />

                {stacked.map((s, si) => (
                  s.h > 0.5 && (
                    <path
                      key={s.key}
                      d={barPath(bx, s.top, barW, s.h - (si < stacked.length - 1 ? 0 : 0), si === stacked.length - 1 ? 4 : 0, true)}
                      fill={s.color}
                      stroke="var(--surface-raised)"
                      strokeWidth={2}
                    />
                  )
                ))}

                {f.lost > 0 && (
                  <path d={barPath(bx, zero, barW, y(-f.lost) - zero, 4, false)} fill="var(--loss)" />
                )}

              </g>
            );
          })}

          <line x1={PLOT.left} x2={width - PLOT.right} y1={zero} y2={zero} stroke="var(--line-strong)" strokeWidth={1.5} />

          {flow.map((f, i) =>
            i % 3 === 0 || i === flow.length - 1 ? (
              <text
                key={f.month} x={x(i) + band / 2} y={height - 8}
                textAnchor="middle" fontSize={11} fill="var(--ink-muted)"
              >
                {monthLabel(f.month).replace(" ", " ")}
              </text>
            ) : null,
          )}
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </div>
  );
}

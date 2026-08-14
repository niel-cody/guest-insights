"use client";

import { count } from "@/lib/metrics";
import type { Org } from "@/lib/types";
import { PLOT, TipRow, Tooltip, barPath, niceTicks, useTooltip } from "./chart-kit";

/**
 * The distribution of gaps between visits, with the calibrated cuts drawn on it.
 *
 * This is the chart that justifies the thresholds instead of asserting them. A
 * cafe whose guests return every three days and a restaurant whose guests return
 * every eighteen cannot share a definition of "slipping", and here that is
 * visible rather than argued.
 */
export function GapHistogram({
  data, org, height = 220,
}: {
  data: { days: number; n: number }[];
  org: Org;
  height?: number;
}) {
  const { tip, show, hide, ref } = useTooltip();
  const width = 760;
  const rows = data.filter((d) => d.days >= 1);
  const maxN = Math.max(...rows.map((d) => d.n), 1);
  const maxDay = Math.max(...rows.map((d) => d.days), 1);

  const plotH = height - PLOT.top - PLOT.bottom;
  const plotW = width - PLOT.left - PLOT.right;
  const x = (d: number) => PLOT.left + ((d - 1) / (maxDay - 1)) * plotW;
  const y = (v: number) => PLOT.top + (1 - v / maxN) * plotH;
  const barW = Math.max(plotW / rows.length - 1, 1.5);
  const ticks = niceTicks(0, maxN, 4);

  const cuts = [
    { at: org.calibration.slippingDays, label: "Slipping", colour: "var(--warning)" },
    { at: org.calibration.lapsedDays, label: "Lapsed", colour: "var(--loss)" },
    { at: org.calibration.canonicalLapsedDays, label: "Canonical 90d", colour: "var(--ink-muted)" },
  ].filter((c) => c.at <= maxDay);

  return (
    <div ref={ref} className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[560px]"
        role="img"
        aria-label="Distribution of days between visits, with the calibrated slipping and lapsed cuts"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PLOT.left} x2={width - PLOT.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PLOT.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tnum" fontSize={11} fill="var(--ink-muted)">
              {count(t)}
            </text>
          </g>
        ))}

        {rows.map((d) => {
          const past = d.days > org.calibration.lapsedDays;
          const slipping = d.days > org.calibration.slippingDays && !past;
          return (
            <path
              key={d.days}
              d={barPath(x(d.days), y(d.n), barW, plotH + PLOT.top - y(d.n), 2, true)}
              fill={past ? "var(--loss)" : slipping ? "var(--warning)" : "var(--gain-new)"}
              opacity={past || slipping ? 0.55 : 1}
              onMouseMove={(e) =>
                show(e, (
                  <div>
                    <p className="mb-1 font-semibold text-ink">
                      {d.days}{d.days === 120 ? "+" : ""} days between visits
                    </p>
                    <TipRow label="Gaps observed" value={count(d.n)} />
                  </div>
                ))
              }
              onMouseLeave={hide}
            />
          );
        })}

        {cuts.map((c, i) => (
          <g key={c.label}>
            <line
              x1={x(c.at)} x2={x(c.at)} y1={PLOT.top - 6} y2={PLOT.top + plotH}
              stroke={c.colour} strokeWidth={1.5} strokeDasharray="4 3"
            />
            <text
              x={x(c.at) + 5} y={PLOT.top + 4 + i * 13}
              fontSize={11} fontWeight={600} fill={c.colour}
            >
              {c.label} {c.at}d
            </text>
          </g>
        ))}

        {[1, 15, 30, 45, 60, 90, 120].filter((d) => d <= maxDay).map((d) => (
          <text key={d} x={x(d)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">
            {d}{d === 120 ? "+" : ""}
          </text>
        ))}
        <text x={PLOT.left + plotW / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="transparent">days</text>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import type { Coverage, Org } from "@/lib/types";
import { money, monthLabel, pct } from "@/lib/metrics";
import { Grid, Legend, PLOT, TipRow, Tooltip, barPath, niceTicks, useTooltip } from "./chart-kit";

/**
 * How much of each month's revenue we could attribute, and to which tier.
 *
 * Months where card capture failed are drawn hatched rather than as a collapse in
 * customers. That distinction is the whole reason this chart exists: without it,
 * the eleven months where the payment reference stopped being written look exactly
 * like eleven months in which every card customer disappeared.
 */
export function CoverageTrendChart({
  coverage, org, height = 260,
}: {
  coverage: Coverage;
  org: Org;
  height?: number;
}) {
  const { tip, show, hide, ref } = useTooltip();
  const width = 900;
  const rows = coverage.monthly;
  const bad = useMemo(
    () => new Map(org.cardTier.quality.filter((q) => !q.ok).map((q) => [q.month, q.reason ?? "unavailable"])),
    [org],
  );

  const plotH = height - PLOT.top - PLOT.bottom;
  const plotW = width - PLOT.left - PLOT.right;
  const band = plotW / rows.length;
  const barW = Math.max(band - 6, 3);
  const y = (v: number) => PLOT.top + (1 - v) * plotH;
  const ticks = niceTicks(0, 1, 4).filter((t) => t <= 1);

  return (
    <div>
      <div className="mb-3">
        <Legend
          items={[
            { label: "Enrolled members", color: "var(--tier-member)" },
            { label: "Recognised by card", color: "var(--tier-card)" },
            { label: "Not attributable", color: "var(--tier-unattributed)" },
          ]}
        />
      </div>

      <div ref={ref} className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[680px]"
          role="img"
          aria-label="Share of revenue attributable to a person, by month and identity tier"
        >
          <defs>
            <pattern id="cov-gap" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--tier-unattributed)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface-raised)" strokeWidth="2.5" />
            </pattern>
          </defs>

          <Grid ticks={ticks} y={y} width={width} format={(v) => pct(v, 0)} />

          {rows.map((m, i) => {
            const bx = PLOT.left + i * band + (band - barW) / 2;
            const mem = m.revenue ? m.memberRevenue / m.revenue : 0;
            const card = m.revenue ? m.cardRevenue / m.revenue : 0;
            const gapReason = bad.get(m.month);

            const segs = [
              { label: "Enrolled members", v: mem, fill: "var(--tier-member)" },
              { label: "Recognised by card", v: card, fill: "var(--tier-card)" },
              {
                label: gapReason ? `Not attributable — ${gapReason}` : "Not attributable",
                v: 1 - mem - card,
                fill: gapReason ? "url(#cov-gap)" : "var(--tier-unattributed)",
              },
            ];

            let acc = 0;
            return (
              <g
                key={m.month}
                onMouseMove={(e) =>
                  show(e, (
                    <div>
                      <p className="mb-1 font-semibold text-ink">{monthLabel(m.month, true)}</p>
                      <TipRow label="Members" value={pct(mem)} color="var(--tier-member)" />
                      <TipRow label="Card" value={pct(card)} color="var(--tier-card)" />
                      <TipRow label="Unattributed" value={pct(1 - mem - card)} color="var(--tier-unattributed)" />
                      <div className="mt-1 border-t border-line pt-1">
                        <TipRow label="Revenue" value={money(m.revenue)} />
                      </div>
                      {gapReason && (
                        <p className="mt-1.5 max-w-[200px] text-[11px] leading-snug text-[var(--warning)]">
                          Card recognition unavailable this month: {gapReason}. Not a fall in customers.
                        </p>
                      )}
                    </div>
                  ))
                }
                onMouseLeave={hide}
              >
                <rect x={PLOT.left + i * band} y={PLOT.top} width={band} height={plotH} fill="transparent" />
                {segs.map((s, si) => {
                  const y0 = y(acc);
                  acc += Math.max(s.v, 0);
                  const y1 = y(acc);
                  const h = y0 - y1;
                  if (h <= 0.5) return null;
                  return (
                    <path
                      key={s.label}
                      d={barPath(bx, y1, barW, h, si === segs.length - 1 ? 4 : 0, true)}
                      fill={s.fill}
                      stroke="var(--surface-raised)"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            );
          })}

          {rows.map((m, i) =>
            i % 3 === 0 || i === rows.length - 1 ? (
              <text
                key={m.month} x={PLOT.left + i * band + band / 2} y={height - 8}
                textAnchor="middle" fontSize={11} fill="var(--ink-muted)"
              >
                {monthLabel(m.month)}
              </text>
            ) : null,
          )}
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </div>
  );
}

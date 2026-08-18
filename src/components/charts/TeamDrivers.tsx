"use client";

import { Grid, PLOT, TipRow, Tooltip, niceTicks, useTooltip } from "./chart-kit";
import type { TeamPerson } from "@/lib/types";

const W = 900;
const H = 380;

/**
 * The decomposition, drawn so the answer is the shape rather than the caption.
 *
 * ── What this plot is for ──────────────────────────────────────────────────
 *
 * Revenue per cover = **items per cover × average item value**. Those are two
 * different jobs. The first is attachment: getting a side, a second round, a
 * dessert onto the table. The second is trading up: the same category at a
 * higher price point. A league table on revenue per cover tells a manager who is
 * ahead; it cannot tell them which of the two to coach, and they are not
 * remotely the same conversation.
 *
 * So both axes are drawn at once, **on scales that share a common ratio**, and
 * the finding falls out of the geometry: at Meat Flour Wine the cloud is wide
 * and flat. Items per cover spans nearly two to one across the rated team while
 * average item value spans well under one and a quarter. The team is not
 * separated by what they sell. It is separated by how much of it they sell to
 * the same table.
 *
 * ── Why both axes start at zero-relative, not at the data ──────────────────
 *
 * An axis cropped to its data makes a 4% spread look like a 400% one, which is
 * the single easiest way to make a chart lie in this exact situation. Both axes
 * are scaled to the same *proportional* span around their own median, so a
 * variable that genuinely varies twice as much looks twice as spread. If the two
 * clouds ever do have comparable spread, this plot will show that honestly too.
 */
export function TeamDrivers({ people }: { people: TeamPerson[] }) {
  const rows = people.filter(
    (p): p is TeamPerson & { itemsPerCover: number; avgItemValue: number } =>
      p.itemsPerCover != null && p.avgItemValue != null,
  );
  const { tip, show, hide, ref } = useTooltip();
  if (rows.length < 3) return null;

  const xs = rows.map((r) => r.itemsPerCover);
  const ys = rows.map((r) => r.avgItemValue);
  const mid = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const xMid = mid(xs);
  const yMid = mid(ys);

  // One proportional half-span, generous enough to hold both clouds, applied to
  // each axis around its own median. This is the whole trick: the axes are not
  // fitted independently, so the widths are comparable by eye.
  const spanOf = (v: number[], m: number) => Math.max(...v.map((x) => Math.abs(x / m - 1)));
  const half = Math.max(spanOf(xs, xMid), spanOf(ys, yMid)) * 1.15;

  const xMin = xMid * (1 - half);
  const xMax = xMid * (1 + half);
  const yMin = yMid * (1 - half);
  const yMax = yMid * (1 + half);

  const x = (v: number) => PLOT.left + ((v - xMin) / (xMax - xMin)) * (W - PLOT.left - PLOT.right);
  const y = (v: number) => H - PLOT.bottom - ((v - yMin) / (yMax - yMin)) * (H - PLOT.top - PLOT.bottom);

  const xTicks = niceTicks(xMin, xMax, 5);
  const yTicks = niceTicks(yMin, yMax, 5);

  const xSpread = Math.max(...xs) / Math.min(...xs);
  const ySpread = Math.max(...ys) / Math.min(...ys);

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Items per cover against average item value for ${rows.length} rated people. Items per cover spans ${xSpread.toFixed(2)} to one; average item value spans ${ySpread.toFixed(2)} to one.`}
      >
        <Grid ticks={yTicks} y={y} width={W} format={(v) => `$${v.toFixed(0)}`} />

        {/* The median cross. It is the reference the spread is read against. */}
        <line x1={x(xMid)} x2={x(xMid)} y1={PLOT.top} y2={H - PLOT.bottom}
          stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={PLOT.left} x2={W - PLOT.right} y1={y(yMid)} y2={y(yMid)}
          stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 3" />

        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - PLOT.bottom + 16} textAnchor="middle"
            className="tnum" fontSize={11} fill="var(--ink-muted)">
            {t.toFixed(1)}
          </text>
        ))}

        {rows.map((p) => (
          <circle
            key={p.id}
            cx={x(p.itemsPerCover)}
            cy={y(p.avgItemValue)}
            r={5}
            fill={p.verdict === "confirmed" ? "var(--accent)" : "var(--tier-card)"}
            fillOpacity={0.75}
            stroke="var(--surface-raised)"
            strokeWidth={1.5}
            onMouseEnter={(e) =>
              show(e, (
                <>
                  <div className="mb-1 font-medium text-ink">{p.label}</div>
                  <TipRow label="Items per cover" value={p.itemsPerCover.toFixed(2)} />
                  <TipRow label="Average item" value={`$${p.avgItemValue.toFixed(2)}`} />
                  <TipRow label="Net per cover" value={`$${(p.netPerCover ?? 0).toFixed(2)}`} />
                  <TipRow label="Covers served" value={p.covers.toLocaleString("en-AU")} />
                </>
              ))
            }
            onMouseLeave={hide}
          />
        ))}

        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--ink-secondary)">
          Items per cover — attachment
        </text>
        <text x={14} y={H / 2} textAnchor="middle" fontSize={11} fill="var(--ink-secondary)"
          transform={`rotate(-90 14 ${H / 2})`}>
          Average item value — trading up
        </text>
      </svg>
      <Tooltip tip={tip} width={W} />
      <p className="mt-2 text-[12px] leading-relaxed text-ink-secondary">
        Both axes are scaled to the same proportional span around their own median, so the widths can
        be compared by eye. Across {rows.length} rated people, attachment varies{" "}
        <strong className="text-ink">{xSpread.toFixed(2)}× top to bottom</strong> and average item
        value varies <strong className="text-ink">{ySpread.toFixed(2)}×</strong>.
      </p>
    </div>
  );
}

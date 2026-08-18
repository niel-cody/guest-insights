"use client";

import type { Decomposition } from "@/lib/metrics";
import { money, pct } from "@/lib/metrics";
import { PLOT, TipRow, Tooltip, barPath, niceTicks, useTooltip } from "./chart-kit";

/**
 * Where the revenue change came from. MQ9: "you put prices up — did anyone leave?"
 *
 * ── It is now actually a waterfall (OV-7) ──────────────────────────────────
 *
 * It was called one and drawn as four independent bars all sitting on zero.
 * That matters more than it sounds: the caption underneath claims **the parts
 * sum to the whole exactly**, and with every bar anchored at zero there is no
 * way for a reader to check that claim by eye. They either take it on trust or
 * they get out a calculator — and the one who got out a calculator found the
 * sum was $18 out, which is how this came to be reviewed at all.
 *
 * So the bars step. Each one starts where the last one finished, and the fifth
 * column is the total, drawn from zero. If the four steps land on the top of
 * the total bar, the decomposition sums; if they did not, it would be visible
 * without arithmetic. **An exactness claim the reader can verify earns the
 * trust that one they cannot verify spends.**
 *
 * The chart still plots the four *contributions* rather than the two revenue
 * totals. A waterfall between $694k and $703k would draw two enormous columns
 * with four hairlines between them, and the four hairlines are the whole
 * question. The totals are stated in words above the chart, where a number that
 * never changes shape belongs.
 */
export function GrowthWaterfall({ d, height = 280 }: { d: Decomposition; height?: number }) {
  const { tip, show, hide, ref } = useTooltip();
  const width = 760;

  const terms = d.terms;

  /**
   * The running total after each step, and the extremes it reaches.
   *
   * The axis has to cover the *path*, not just the bars: a factor worth −$6,191
   * takes the running total well below both endpoints, and an axis scaled only
   * to the endpoints would clip it. Symmetric-around-zero was the old choice and
   * it wastes half the plot when every step runs one way.
   */
  const steps = terms.reduce<{ from: number; to: number }[]>((acc, t) => {
    const from = acc.length ? acc[acc.length - 1].to : 0;
    return [...acc, { from, to: from + t.value }];
  }, []);
  const reached = [0, d.revenueChange, ...steps.flatMap((s) => [s.from, s.to])];
  const lo = Math.min(...reached);
  const hi = Math.max(...reached);
  const pad = Math.max((hi - lo) * 0.18, 1);

  const plotH = height - PLOT.top - PLOT.bottom - 16;
  const plotW = width - PLOT.left - PLOT.right;
  // Five columns: the four factors, then the total.
  const band = plotW / (terms.length + 1);
  const barW = Math.min(band - 30, 74);
  const y = (v: number) =>
    PLOT.top + ((hi + pad - v) / (hi + pad - (lo - pad))) * plotH;
  const ticks = niceTicks(lo - pad, hi + pad, 4);
  const zero = y(0);

  return (
    <div ref={ref} className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[680px]"
        role="img"
        aria-label={
          `Waterfall: guests, visit frequency, basket size and average item price stepping from zero to ` +
          `a modelled revenue change of ${money(d.revenueChange)}`
        }
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PLOT.left} x2={width - PLOT.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PLOT.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tnum" fontSize={11} fill="var(--ink-muted)">
              {t === 0 ? "0" : `${t > 0 ? "+" : "−"}${money(Math.abs(t)).replace(/\.00$/, "")}`}
            </text>
          </g>
        ))}

        {/* The connectors, drawn under the bars: each one runs from where a step
            finished to where the next one starts. They are the visual claim that
            nothing is added or lost between bars. */}
        {steps.slice(0, -1).map((s, i) => (
          <line
            key={`c${i}`}
            x1={PLOT.left + i * band + (band - barW) / 2 + barW}
            x2={PLOT.left + (i + 1) * band + (band - barW) / 2}
            y1={y(s.to)}
            y2={y(s.to)}
            stroke="var(--line-strong)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}
        {/* And one last connector from the final step across to the total, which
            is the whole point of the picture: they are at the same height. */}
        <line
          x1={PLOT.left + (terms.length - 1) * band + (band - barW) / 2 + barW}
          x2={PLOT.left + terms.length * band + (band - barW) / 2 + barW}
          y1={y(d.revenueChange)}
          y2={y(d.revenueChange)}
          stroke="var(--line-strong)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {terms.map((t, i) => {
          const s = steps[i];
          const bx = PLOT.left + i * band + (band - barW) / 2;
          const up = t.value >= 0;
          const top = y(Math.max(s.from, s.to));
          const h = Math.max(Math.abs(y(s.to) - y(s.from)), 2);
          // Price is the merchant's own decision; trade is the market's answer.
          // They get different colours because they lead to different actions.
          const fill = t.kind === "price" ? "var(--tier-card)" : up ? "var(--gain-new)" : "var(--loss)";

          return (
            <g
              key={t.key}
              onMouseMove={(e) =>
                show(e, (
                  <div>
                    <p className="mb-1 font-semibold text-ink">{t.label}</p>
                    <TipRow label="Contribution" value={`${up ? "+" : "−"}${money(Math.abs(t.value))}`} color={fill} />
                    <TipRow label="Running total" value={`${s.to >= 0 ? "+" : "−"}${money(Math.abs(s.to))}`} />
                    <TipRow label="Share of change" value={pct(t.value / (d.revenueChange || 1), 0)} />
                    <p className="mt-1 max-w-[210px] text-[11px] leading-snug text-ink-muted">
                      {t.kind === "price"
                        ? "The average item sold cost more. That is a price rise, a shift toward pricier items, or both — this build cannot yet separate them."
                        : "Real trade: more people, more often, or bigger baskets."}
                    </p>
                  </div>
                ))
              }
              onMouseLeave={hide}
            >
              <rect x={PLOT.left + i * band} y={PLOT.top} width={band} height={plotH} fill="transparent" />
              <path d={barPath(bx, top, barW, h, 4, up)} fill={fill} />
              <text
                x={bx + barW / 2}
                y={up ? top - 7 : top + h + 14}
                textAnchor="middle" className="tnum" fontSize={12} fontWeight={600} fill="var(--ink)"
              >
                {up ? "+" : "−"}{money(Math.abs(t.value)).replace(/\.00$/, "")}
              </text>
            </g>
          );
        })}

        {/* The total, from zero. Filled flat rather than in a factor colour —
            it is a sum, not a cause, and colouring it like one would invite the
            eye to add it to the four beside it. */}
        {(() => {
          const i = terms.length;
          const bx = PLOT.left + i * band + (band - barW) / 2;
          const up = d.revenueChange >= 0;
          const top = up ? y(d.revenueChange) : zero;
          const h = Math.max(Math.abs(y(d.revenueChange) - zero), 2);
          return (
            <g
              onMouseMove={(e) =>
                show(e, (
                  <div>
                    <p className="mb-1 font-semibold text-ink">Modelled change</p>
                    <TipRow
                      label="Sum of the four"
                      value={`${up ? "+" : "−"}${money(Math.abs(d.revenueChange))}`}
                    />
                    <TipRow
                      label="Recorded change"
                      value={`${d.recordedChange >= 0 ? "+" : "−"}${money(Math.abs(d.recordedChange))}`}
                    />
                    <p className="mt-1 max-w-[210px] text-[11px] leading-snug text-ink-muted">
                      The two differ by {money(Math.abs(d.reconciliation))} because the four factors are
                      stored rounded. The four bars sum to this one exactly.
                    </p>
                  </div>
                ))
              }
              onMouseLeave={hide}
            >
              <rect x={PLOT.left + i * band} y={PLOT.top} width={band} height={plotH} fill="transparent" />
              <path d={barPath(bx, top, barW, h, 4, up)} fill="var(--ink-secondary)" />
              <text
                x={bx + barW / 2}
                y={up ? top - 7 : top + h + 14}
                textAnchor="middle" className="tnum" fontSize={12} fontWeight={700} fill="var(--ink)"
              >
                {up ? "+" : "−"}{money(Math.abs(d.revenueChange)).replace(/\.00$/, "")}
              </text>
            </g>
          );
        })()}

        <line x1={PLOT.left} x2={width - PLOT.right} y1={zero} y2={zero} stroke="var(--line-strong)" strokeWidth={1.5} />

        {[...terms.map((t) => t.label), "Modelled change"].map((label, i) => (
          <text
            key={label}
            x={PLOT.left + i * band + band / 2}
            y={height - 12}
            textAnchor="middle"
            fontSize={11}
            fontWeight={i === terms.length ? 600 : 400}
            fill={i === terms.length ? "var(--ink)" : "var(--ink-secondary)"}
          >
            {label}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/**
 * The real-versus-price split bar. One row, two colours, and the sentence beneath
 * it — the object the PRD puts on the front page, because it is the answer to the
 * only question a buyer asks in the first thirty seconds.
 */
export function RealVsPriceBar({ d }: { d: Decomposition }) {
  const total = Math.abs(d.real) + Math.abs(d.price);
  if (!total) return null;
  const realShare = Math.abs(d.real) / total;

  return (
    <div>
      <div className="flex h-8 overflow-hidden rounded-lg">
        <div
          className="flex items-center justify-center text-[12px] font-semibold text-white"
          style={{ width: `${realShare * 100}%`, background: d.real >= 0 ? "var(--gain-new)" : "var(--loss)" }}
        >
          {realShare > 0.18 && `${d.real >= 0 ? "+" : "−"}${money(Math.abs(d.real))}`}
        </div>
        <div
          className="flex items-center justify-center text-[12px] font-semibold text-white"
          style={{ width: `${(1 - realShare) * 100}%`, background: "var(--tier-card)", marginLeft: 2 }}
        >
          {1 - realShare > 0.18 && `${d.price >= 0 ? "+" : "−"}${money(Math.abs(d.price))}`}
        </div>
      </div>
      <div className="mt-2 flex gap-4 text-[12px] text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: d.real >= 0 ? "var(--gain-new)" : "var(--loss)" }} />
          Real trade
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--tier-card)" }} />
          Average item price
        </span>
      </div>
    </div>
  );
}

"use client";

import type { Decomposition } from "@/lib/metrics";
import { money, pct } from "@/lib/metrics";
import { PLOT, TipRow, Tooltip, barPath, niceTicks, useTooltip } from "./chart-kit";

/**
 * Where the revenue change came from. MQ9: "you put prices up — did anyone leave?"
 *
 * The chart plots the four *contributions*, not the two revenue totals. A
 * conventional waterfall anchored at zero would draw two ~$715,000 columns beside
 * four ~$3,000 movements, and the four movements are the entire question. The
 * totals are stated in words above the chart, where a number that never changes
 * shape belongs.
 *
 * Terms are symmetric-Shapley allocated, so they sum to the change exactly and
 * there is no residual bar for an operator to lose confidence in.
 */
export function GrowthWaterfall({ d, height = 260 }: { d: Decomposition; height?: number }) {
  const { tip, show, hide, ref } = useTooltip();
  const width = 760;

  const terms = d.terms;
  const span = Math.max(...terms.map((t) => Math.abs(t.value)), Math.abs(d.revenueChange)) * 1.25;

  const plotH = height - PLOT.top - PLOT.bottom - 16;
  const plotW = width - PLOT.left - PLOT.right;
  const band = plotW / terms.length;
  const barW = Math.min(band - 34, 76);
  const y = (v: number) => PLOT.top + ((span - v) / (2 * span)) * plotH;
  const ticks = niceTicks(-span, span, 4);
  const zero = y(0);

  return (
    <div ref={ref} className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[600px]"
        role="img"
        aria-label="Contribution of guests, visit frequency, basket size and price to the change in revenue"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PLOT.left} x2={width - PLOT.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PLOT.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tnum" fontSize={11} fill="var(--ink-muted)">
              {t === 0 ? "0" : `${t > 0 ? "+" : "−"}${money(Math.abs(t)).replace(/\.00$/, "")}`}
            </text>
          </g>
        ))}

        {terms.map((t, i) => {
          const bx = PLOT.left + i * band + (band - barW) / 2;
          const up = t.value >= 0;
          const top = up ? y(t.value) : zero;
          const h = Math.max(Math.abs(y(t.value) - zero), 2);
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
                    <TipRow label="Share of change" value={pct(t.value / (d.revenueChange || 1), 0)} />
                    <p className="mt-1 max-w-[210px] text-[11px] leading-snug text-ink-muted">
                      {t.kind === "price"
                        ? "You charged more per item. This is your decision, not their behaviour."
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

        <line x1={PLOT.left} x2={width - PLOT.right} y1={zero} y2={zero} stroke="var(--line-strong)" strokeWidth={1.5} />

        {terms.map((t, i) => (
          <text
            key={t.key}
            x={PLOT.left + i * band + band / 2}
            y={height - 12}
            textAnchor="middle" fontSize={12} fill="var(--ink-secondary)"
          >
            {t.label}
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
          Price
        </span>
      </div>
    </div>
  );
}

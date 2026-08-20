"use client";

import type { Decomposition } from "@/lib/metrics";
import { money, monthLabel, pct } from "@/lib/metrics";
import { TipRow, Tooltip, barPath, niceTicks, useTooltip } from "./chart-kit";

/**
 * How revenue got from the first month of the window to the last. **OV-10.**
 *
 * ── It now bridges two real revenue figures, not two abstractions ──────────
 *
 * The previous version plotted the four *contributions* on an axis of change:
 * the first column was "guests, +$126" and the last was "modelled change,
 * +$8,669". Both are correct and neither is a thing an operator has ever said
 * out loud. What they say is **"we did $694k in May and $703k in July — what
 * happened?"**, and a chart that answers that question starts at $694k and
 * finishes at $703k.
 *
 * So the first column is May's revenue, the last is July's, and everything
 * between them is a step from one to the other. Same four factors, same
 * symmetric-Shapley arithmetic, same numbers to the cent — the axis moved, not
 * the model.
 *
 * ── The objection this used to carry, and why it was wrong ─────────────────
 *
 * The old note argued the endpoints could not be drawn: *"a waterfall between
 * $694k and $703k would draw two enormous columns with four hairlines between
 * them."* That is true only on an axis anchored at zero, and a bridge chart is
 * never drawn on one. Scaled to the path it plots — $688k to $703k here — the
 * steps get **exactly the same vertical resolution they had before**, because
 * the path is the same path, offset by $694k. The endpoint columns run off the
 * bottom of the axis, which is what the break mark at their base says.
 *
 * A truncated axis is the standard reading of a bridge and it is still a
 * truncated axis, so it is marked twice: the break glyph on each endpoint
 * column, and the sentence under the chart. **The two endpoint columns cannot
 * be compared by height and the chart says so rather than hoping nobody tries.**
 *
 * ── The rounding step is a column, not a footnote (C-2 made visible) ───────
 *
 * The four factors sum to the *modelled* change, which is $18.01 away from the
 * recorded change because the factors are stored rounded to four decimals.
 * That gap has been published in prose since C-2. It is now a bar: the bridge
 * closes on **recorded** July revenue, and the only way it can do that is with
 * the rounding term in the picture, hairline-thin and labelled.
 *
 * Giving a $18 term a whole column looks like a strange use of space until you
 * notice what it buys — a reader can now put a ruler on the chart and land on
 * the revenue figure printed at the top of the page. An exactness claim the
 * reader can check earns the trust one they cannot check spends.
 *
 * ── Two colour channels, doing two different jobs ──────────────────────────
 *
 * **Hue is direction**: green added revenue, red took it away. **Fill is kind**:
 * solid is real trade, outlined is average item price. Encoding both in hue was
 * the old scheme's mistake — a red "fewer visits" bar and an orange "price" bar
 * sit at ΔE 7.1 in normal vision, which is below the floor at which two fills
 * can be told apart at all, before colour-vision deficiency is considered. Green
 * against red clears that floor at ΔE 31, and direction is redundantly encoded
 * by which way the bar points and by the sign on its label.
 */

/**
 * Whole dollars for the chart's own labels. `money()` keeps cents below $1,000,
 * which prints "+$125.99" beside "+$14,412" and makes the smallest bar look like
 * the most precisely measured one. Cents stay in the table and the tooltip.
 */
const round = (v: number) => money(Math.round(v)).replace(/\.00$/, "");

/** Axis money: `$688k`, `$152.5k`. Six-figure ticks written in full crowd out the plot. */
function axisMoney(v: number): string {
  const k = v / 1000;
  if (Math.abs(v) >= 10_000) return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  return money(v);
}

/** Greedy two-line wrap, so "Average item price" fits under a 44px column. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

type Column = {
  key: string;
  /** What goes under the column. */
  name: string;
  sub: string | null;
  /** Where the bar starts and finishes on the revenue axis. */
  from: number;
  to: number;
  /** The number printed above the column. */
  value: number;
  role: "anchor" | "real" | "price" | "rounding";
  tip: React.ReactNode;
};

const PAD = { top: 30, right: 18, bottom: 54, left: 66 };

export function GrowthWaterfall({ d, height = 320 }: { d: Decomposition; height?: number }) {
  const { tip, show, hide, ref } = useTooltip();
  const width = 800;

  const start = d.from.revenue;
  const end = d.to.revenue;

  /**
   * The bridge, left to right. The running total carries through every step, so
   * the last one lands on recorded revenue by construction rather than by luck —
   * `start + Σ terms + reconciliation === to.revenue` is the definition of
   * `reconciliation`, not a coincidence this component is hoping for.
   */
  const columns: Column[] = [];
  columns.push({
    key: "start",
    name: monthLabel(d.from.month),
    sub: "Start",
    from: start,
    to: start,
    value: start,
    role: "anchor",
    tip: (
      <div>
        <p className="mb-1 font-semibold text-ink">{monthLabel(d.from.month, true)}</p>
        <TipRow label="Revenue" value={money(start)} />
        <TipRow label="Guests" value={d.from.guests.toLocaleString("en-AU")} />
        <p className="mt-1 max-w-[210px] text-[11px] leading-snug text-ink-muted">
          Where the window opens. The column is cut off at the bottom — the axis does not start at zero.
        </p>
      </div>
    ),
  });

  let run = start;
  for (const t of d.terms) {
    const from = run;
    run += t.value;
    const up = t.value >= 0;
    columns.push({
      key: t.key,
      name: t.name,
      sub: null,
      from,
      to: run,
      value: t.value,
      role: t.kind === "price" ? "price" : "real",
      tip: (
        <div>
          <p className="mb-1 font-semibold text-ink">{t.label}</p>
          <TipRow label="Moved" value={t.operand} />
          <TipRow label="Worth" value={`${up ? "+" : "−"}${money(Math.abs(t.value))}`} />
          <TipRow label="Running total" value={money(run)} />
          <TipRow label="Share of the change" value={pct(t.value / (d.revenueChange || 1), 0)} />
          <p className="mt-1 max-w-[210px] text-[11px] leading-snug text-ink-muted">
            {t.kind === "price"
              ? "The average item sold cost more. That is a price rise, a shift toward pricier items, or both — this build cannot yet separate them."
              : "Real trade: more people, coming more often, or buying more each time."}
          </p>
        </div>
      ),
    });
  }

  const roundFrom = run;
  run += d.reconciliation;
  columns.push({
    key: "rounding",
    name: "Rounding",
    sub: null,
    from: roundFrom,
    to: run,
    value: d.reconciliation,
    role: "rounding",
    tip: (
      <div>
        <p className="mb-1 font-semibold text-ink">Rounding</p>
        <TipRow
          label="Worth"
          value={`${d.reconciliation >= 0 ? "+" : "−"}${money(Math.abs(d.reconciliation))}`}
        />
        <p className="mt-1 max-w-[210px] text-[11px] leading-snug text-ink-muted">
          The four factors are stored rounded to four decimals, so their product is not quite the
          recorded revenue. This is that gap, and it is the only thing between the four bars and the
          figure on the right. It is not an unexplained residual.
        </p>
      </div>
    ),
  });

  columns.push({
    key: "end",
    name: monthLabel(d.to.month),
    sub: "End",
    from: end,
    to: end,
    value: end,
    role: "anchor",
    tip: (
      <div>
        <p className="mb-1 font-semibold text-ink">{monthLabel(d.to.month, true)}</p>
        <TipRow label="Revenue" value={money(end)} />
        <TipRow label="Guests" value={d.to.guests.toLocaleString("en-AU")} />
        <TipRow
          label="Change"
          value={`${d.recordedChange >= 0 ? "+" : "−"}${money(Math.abs(d.recordedChange))}`}
        />
        <p className="mt-1 max-w-[210px] text-[11px] leading-snug text-ink-muted">
          Recorded revenue, reached from the left-hand column by the steps between. The column is cut
          off at the bottom — the axis does not start at zero.
        </p>
      </div>
    ),
  });

  /**
   * The axis covers the path, not just the endpoints. A factor worth −$6,191
   * takes the running total below both months, and an axis scaled to the two
   * revenue figures alone would draw that step off the bottom of the plot.
   */
  const reached = columns.flatMap((c) => [c.from, c.to]);
  const lo = Math.min(...reached);
  const hi = Math.max(...reached);
  const span = Math.max(hi - lo, 1);
  const floor = lo - span * 0.22;
  const ceiling = hi + span * 0.12;

  const plotH = height - PAD.top - PAD.bottom;
  const plotW = width - PAD.left - PAD.right;
  const band = plotW / columns.length;
  const barW = Math.min(band - 30, 44);
  const y = (v: number) => PAD.top + ((ceiling - v) / (ceiling - floor)) * plotH;
  const base = y(floor);
  const ticks = niceTicks(floor, ceiling, 6).filter((t) => t > floor);

  /** Where the running total sits as it leaves each column. */
  const carry = columns.map((c) => (c.role === "anchor" ? c.value : c.to));
  const x = (i: number) => PAD.left + i * band + (band - barW) / 2;

  return (
    <div ref={ref} className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[700px]"
        role="img"
        aria-label={
          `Bridge chart. Revenue of ${money(start)} in ${monthLabel(d.from.month)} steps through ` +
          d.terms.map((t) => `${t.label}, ${t.value >= 0 ? "plus" : "minus"} ${money(Math.abs(t.value))}`).join("; ") +
          `; and rounding, ${d.reconciliation >= 0 ? "plus" : "minus"} ${money(Math.abs(d.reconciliation))}; ` +
          `to ${money(end)} in ${monthLabel(d.to.month)}. The vertical axis starts at ${axisMoney(floor)}, not zero.`
        }
      >
        {/* The truncated columns fade out toward their break mark. The break
            glyph says "cut off"; the fade stops the eye measuring them anyway,
            which is the failure mode a break mark on its own does not prevent. */}
        <defs>
          <linearGradient id="wf-cut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ink-secondary)" stopOpacity={0.16} />
            <stop offset="62%" stopColor="var(--ink-secondary)" stopOpacity={0.08} />
            <stop offset="100%" stopColor="var(--ink-secondary)" stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
              stroke="var(--grid)" strokeWidth={1}
            />
            <text
              x={PAD.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle"
              className="tnum" fontSize={10} fill="var(--ink-muted)"
            >
              {axisMoney(t)}
            </text>
          </g>
        ))}

        {/* The connectors, under the bars. Solid hairlines: a dashed rule reads as
            a projection or a threshold, and these are neither — they are the claim
            that nothing is added or lost between one column and the next. */}
        {carry.slice(0, -1).map((v, i) => (
          <line
            key={`carry-${i}`}
            x1={x(i) + barW}
            x2={x(i + 1)}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--line-strong)"
            strokeWidth={1}
          />
        ))}

        {columns.map((c, i) => {
          const bx = x(i);
          const anchor = c.role === "anchor";
          const up = anchor || c.to >= c.from;
          const top = anchor ? y(c.value) : y(Math.max(c.from, c.to));
          const h = anchor
            ? Math.max(base - y(c.value), 2)
            : Math.max(Math.abs(y(c.to) - y(c.from)), 3);

          // Hue is direction; fill is kind. See the note at the top of the file.
          const hue =
            c.role === "anchor" ? "var(--ink-secondary)"
            : c.role === "rounding" ? "var(--ink-muted)"
            : c.value >= 0 ? "var(--good)" : "var(--loss)";
          const open = c.role === "price" || c.role === "rounding";

          return (
            <g key={c.key} onMouseMove={(e) => show(e, c.tip)} onMouseLeave={hide}>
              <rect x={PAD.left + i * band} y={PAD.top} width={band} height={plotH} fill="transparent" />
              <path
                d={barPath(bx, top, barW, h, 2, up)}
                fill={anchor ? "url(#wf-cut)" : hue}
                fillOpacity={anchor ? 1 : open ? 0.16 : 1}
                stroke={anchor ? "none" : open ? hue : "none"}
                strokeWidth={1.5}
              />
              {/* The anchors get a solid cap so a 13%-opacity column still reads as
                  ending somewhere precise. */}
              {anchor && <rect x={bx} y={top} width={barW} height={2.5} fill={hue} rx={1} />}
              {/* And a break mark, because they are cut off at the bottom. */}
              {anchor && <AxisBreak x={bx} w={barW} y={base - 13} />}

              <text
                x={bx + barW / 2}
                y={up ? top - 8 : top + h + 15}
                textAnchor="middle"
                className="tnum"
                fontSize={anchor ? 12 : 11}
                fontWeight={anchor ? 600 : 500}
                fill={c.role === "rounding" ? "var(--ink-muted)" : "var(--ink)"}
              >
                {anchor
                  ? round(c.value)
                  : `${c.value >= 0 ? "+" : "−"}${round(Math.abs(c.value))}`}
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left} x2={width - PAD.right} y1={base} y2={base}
          stroke="var(--line-strong)" strokeWidth={1}
        />

        {columns.map((c, i) => {
          const cx = PAD.left + i * band + band / 2;
          const anchor = c.role === "anchor";
          const lines = anchor ? [c.name] : wrap(c.name, 13);
          return (
            <g key={`label-${c.key}`}>
              {lines.map((line, li) => (
                <text
                  key={line}
                  x={cx}
                  y={base + 18 + li * 13}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={anchor ? 600 : 400}
                  fill={anchor ? "var(--ink)" : "var(--ink-secondary)"}
                >
                  {line}
                </text>
              ))}
              {c.sub && (
                <text
                  x={cx}
                  y={base + 18 + lines.length * 13}
                  textAnchor="middle"
                  fontSize={9.5}
                  letterSpacing="0.06em"
                  fill="var(--ink-muted)"
                >
                  {c.sub.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/**
 * The break mark on a truncated column: two chevrons in the surface colour, so
 * the bar reads as continuing below the axis rather than as starting there.
 */
function AxisBreak({ x, w, y }: { x: number; w: number; y: number }) {
  const zig = (offset: number) =>
    `M${x - 1},${y + offset} L${x + w * 0.33},${y + offset - 3.5} ` +
    `L${x + w * 0.67},${y + offset + 3.5} L${x + w + 1},${y + offset}`;
  return (
    <g>
      <path d={zig(0)} stroke="var(--surface)" strokeWidth={3.5} fill="none" />
      <path d={zig(5)} stroke="var(--surface)" strokeWidth={3.5} fill="none" />
      <path d={zig(0)} stroke="var(--line-strong)" strokeWidth={1} fill="none" />
      <path d={zig(5)} stroke="var(--line-strong)" strokeWidth={1} fill="none" />
    </g>
  );
}

/**
 * The chart's two channels, said in words. Identity is never colour alone: every
 * column is directly labelled, and this names the second channel — the outline —
 * which no amount of staring at the bars would explain.
 */
export function WaterfallLegend({ priceLabel = "Average item price" }: { priceLabel?: string }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-secondary">
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--good)" }} />
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--loss)" }} />
        Real trade — added, or taken away
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-[2px] border-[1.5px]"
          style={{ borderColor: "var(--good)", background: "color-mix(in srgb, var(--good) 16%, transparent)" }}
        />
        {priceLabel} — outlined, either direction
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-[2px] border-[1.5px]"
          style={{ borderColor: "var(--ink-muted)", background: "transparent" }}
        />
        Rounding
      </li>
    </ul>
  );
}

/**
 * The real-versus-price split bar. One row, two segments, and the sentence
 * beneath it — the object the PRD puts on the front page, because it is the
 * answer to the only question a buyer asks in the first thirty seconds.
 *
 * It carries the **same two channels as the bridge above it**: hue for
 * direction, outline for price. It used to use a third scheme — blue for real,
 * orange for price, regardless of sign — so a reader who had just learnt the
 * waterfall's colours had to unlearn them one panel down, and neither scheme
 * showed that at Coffee Guru the two halves point in *opposite* directions.
 */
export function RealVsPriceBar({ d, priceLabel = "Average item price" }: { d: Decomposition; priceLabel?: string }) {
  const total = Math.abs(d.real) + Math.abs(d.price);
  if (!total) return null;
  const realShare = Math.abs(d.real) / total;
  const realHue = d.real >= 0 ? "var(--good)" : "var(--loss)";
  const priceHue = d.price >= 0 ? "var(--good)" : "var(--loss)";

  return (
    <div>
      <div className="flex h-8 gap-0.5">
        <div
          className="flex items-center justify-center rounded-l-md text-[12px] font-semibold text-white"
          style={{ width: `${realShare * 100}%`, background: realHue }}
        >
          {realShare > 0.2 && `${d.real >= 0 ? "+" : "−"}${money(Math.abs(d.real))}`}
        </div>
        <div
          className="tnum flex items-center justify-center rounded-r-md border-[1.5px] text-[12px] font-semibold"
          style={{
            width: `${(1 - realShare) * 100}%`,
            borderColor: priceHue,
            background: `color-mix(in srgb, ${priceHue} 16%, transparent)`,
            color: "var(--ink)",
          }}
        >
          {1 - realShare > 0.2 && `${d.price >= 0 ? "+" : "−"}${money(Math.abs(d.price))}`}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: realHue }} />
          Real trade
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[2px] border-[1.5px]"
            style={{ borderColor: priceHue, background: `color-mix(in srgb, ${priceHue} 16%, transparent)` }}
          />
          {priceLabel}
        </span>
        <span className="text-ink-muted">Width is size; colour is direction.</span>
      </div>
    </div>
  );
}

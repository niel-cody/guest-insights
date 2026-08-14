"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

/** Shared chart scaffolding: plot box, recessive axes, and a crosshair tooltip. */

export const PLOT = { top: 16, right: 20, bottom: 28, left: 52 };

export function niceTicks(min: number, max: number, n = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export function Grid({
  ticks, y, width, format,
}: {
  ticks: number[];
  y: (v: number) => number;
  width: number;
  format: (v: number) => string;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PLOT.left} x2={width - PLOT.right} y1={y(t)} y2={y(t)}
            stroke="var(--grid)" strokeWidth={1}
          />
          <text
            x={PLOT.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
            className="tnum" fontSize={11} fill="var(--ink-muted)"
          >
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Legend. Present whenever there are two or more series — identity is never colour alone. */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
          {i.dashed ? (
            <svg width="14" height="8" aria-hidden>
              <line x1="0" y1="4" x2="14" y2="4" stroke={i.color} strokeWidth="2" strokeDasharray="3 2" />
            </svg>
          ) : (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export type TooltipState = { x: number; y: number; content: ReactNode } | null;

export function useTooltip() {
  const [tip, setTip] = useState<TooltipState>(null);
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content });
  }, []);

  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide, ref };
}

export function Tooltip({ tip, width }: { tip: TooltipState; width: number }) {
  if (!tip) return null;
  const flip = tip.x > width * 0.6;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[160px] rounded-lg border border-line bg-surface-raised px-3 py-2 text-[12px] shadow-lg"
      style={{
        left: flip ? undefined : tip.x + 14,
        right: flip ? width - tip.x + 14 : undefined,
        top: Math.max(tip.y - 12, 4),
      }}
    >
      {tip.content}
    </div>
  );
}

export function TipRow({
  label, value, color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-ink-secondary">
        {color && <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />}
        {label}
      </span>
      <span className="tnum font-medium text-ink">{value}</span>
    </div>
  );
}

/** Rounded rectangle with only the data-end rounded, anchored to the baseline. */
export function barPath(x: number, y: number, w: number, h: number, r = 4, up = true): string {
  const rr = Math.min(r, w / 2, Math.abs(h));
  if (h <= 0.5) return "";
  return up
    ? `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
    : `M${x},${y} L${x},${y + h - rr} Q${x},${y + h} ${x + rr},${y + h} L${x + w - rr},${y + h} Q${x + w},${y + h} ${x + w},${y + h - rr} L${x + w},${y} Z`;
}

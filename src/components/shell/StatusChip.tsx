"use client";

import { STATUS_LABEL, STATUS_TONE, type ChipState } from "@/lib/status";

/**
 * How far a surface has got, in the nav.
 *
 * ── Why `todo` renders nothing ─────────────────────────────────────────────
 *
 * Forty-one items, and on a fresh board every one of them is "To do". Forty-one
 * identical chips is not information — it is a column of noise that makes the
 * three items which *have* moved harder to find, which is the exact opposite of
 * what a status column is for.
 *
 * So the default state is silence, and a chip means something happened. This is
 * the same rule as the coverage chip and the check register: chrome appears
 * when it has something to say.
 */
const TONE: Record<string, string> = {
  quiet: "border-line text-ink-muted",
  accent: "border-transparent bg-accent-soft text-accent",
  warning: "border-transparent text-white",
  good: "border-transparent text-white",
};

const BG: Record<string, string | undefined> = {
  warning: "var(--warning)",
  good: "var(--good)",
};

export function StatusChip({ state, className = "" }: { state: ChipState; className?: string }) {
  if (state === "todo") return null;
  const tone = STATUS_TONE[state];
  return (
    <span
      data-status-chip={state}
      className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium tracking-wide uppercase ${TONE[tone]} ${className}`}
      style={BG[tone] ? { background: BG[tone] } : undefined}
    >
      {STATUS_LABEL[state]}
    </span>
  );
}

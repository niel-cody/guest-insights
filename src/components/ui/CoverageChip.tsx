"use client";

import { useState } from "react";
import type { CoverageState } from "@/lib/metrics";
import { monthLabel, pct, attributionPct} from "@/lib/metrics";
import { IconChevron } from "../shell/Icons";

/**
 * The one always-visible honesty object, gain-framed.
 *
 * It says what we CAN see, not what we cannot, because a headline that leads with
 * a shortfall gets the product argued with instead of used. The shortfall is one
 * click away and never more than one click away.
 */
export function CoverageChip({ state }: { state: CoverageState }) {
  const [open, setOpen] = useState(false);
  const complete = state.gaps.length === 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] hover:bg-surface-hover"
      >
        <span className="flex h-2 w-2 rounded-full" style={{ background: complete ? "var(--good)" : "var(--warning)" }} />
        <span className="font-medium text-ink">
          Recognising {attributionPct(state.identifiedRevenueShare)} of revenue
        </span>
        <IconChevron className={`h-4 w-4 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-[420px] rounded-xl border border-line bg-surface-raised p-4 shadow-lg">
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            Of the trade taken in the window below, we can attribute this share of
            revenue to a returning person.
          </p>

          <div className="mt-3 space-y-2">
            <Bar label="Enrolled members" value={state.memberRevenueShare} color="var(--tier-member)" />
            <Bar label="Recognised by card" value={state.cardRevenueShare} color="var(--tier-card)" />
            <Bar
              label="Not attributable"
              value={1 - state.identifiedRevenueShare}
              color="var(--tier-unattributed)"
            />
          </div>

          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12px]">
            <Row k="Measured on">Revenue. Transaction-grain share is {attributionPct(state.identifiedOrderShare)} of orders.</Row>
            <Row k="Window">
              {monthLabel(state.window.start)} – {monthLabel(state.window.end)}
              {" "}({state.window.months} complete {state.window.months === 1 ? "month" : "months"})
            </Row>
            <Row k="As of">{monthLabel(state.asOf)}</Row>
          </dl>

          {!complete && (
            <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
              <p className="text-[12px] font-medium text-ink">
                Card recognition is not usable in {state.gaps.length} of the{" "}
                {state.monthsTested} months tested.
              </p>
              <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-[12px] text-ink-secondary">
                {state.gaps.map((g) => (
                  <li key={g.month} className="flex justify-between gap-4">
                    <span>{monthLabel(g.month)}</span>
                    <span className="text-ink-muted">{g.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-secondary">
                Those months are outside the analysis window entirely — not charted as a
                fall in customers, and not averaged into any figure on this screen.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[12px]">
        <span className="text-ink-secondary">{label}</span>
        <span className="tnum font-medium text-ink">{pct(Math.max(value, 0))}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full" style={{ width: `${Math.max(value, 0) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="shrink-0 text-ink-muted">{k}</dt>
      <dd className="text-right text-ink-secondary">{children}</dd>
    </div>
  );
}

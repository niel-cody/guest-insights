"use client";

import { useState } from "react";
import type { Decomposition } from "@/lib/metrics";
import type { DecompositionRow } from "@/lib/types";
import { money } from "@/lib/metrics";
import { GrowthWaterfall, RealVsPriceBar } from "./GrowthWaterfall";
import { FactorTrend } from "./FactorTrend";

/**
 * "Where the change came from", with the two views it now has. **OV-8.**
 *
 * The waterfall answers *what moved the quarter*. The trend answers *how long
 * it has been moving*, which is the question that brings a merchant back next
 * month. They are the same four factors and the same arithmetic, so they are
 * one panel with a control rather than two panels drifting apart — the same
 * decision the council reached for the old stacked heat maps.
 *
 * The waterfall is the default because it is the one that answers the panel's
 * own headline. The trend is one click away and stays selected while the reader
 * is on the page.
 */
export function GrowthView({ d, rows }: { d: Decomposition; rows: DecompositionRow[] }) {
  const canTrend = rows.length >= 3;
  const [view, setView] = useState<"waterfall" | "trend">("waterfall");
  const showing = canTrend ? view : "waterfall";

  return (
    <div>
      {canTrend && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[12px] font-medium tracking-wide text-ink-muted uppercase">View</span>
          <div role="group" aria-label="View" className="flex rounded-lg border border-line p-0.5">
            {([
              { key: "waterfall" as const, label: "What moved it" },
              { key: "trend" as const, label: "Over time" },
            ]).map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setView(o.key)}
                aria-pressed={showing === o.key}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  showing === o.key
                    ? "bg-surface-hover text-ink"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showing === "trend" ? (
        <FactorTrend rows={rows} />
      ) : (
        /* ── The waterfall runs full width now ────────────────────────────
           It used to sit in the 1.4fr column of a two-column grid, which was
           fine for four bars anchored at zero. Stepping it and adding the total
           column makes five, and at 1280px that column fell off the right-hand
           edge into a horizontal scroll — so the one bar the whole redraw
           exists to show was the one a reader had to go looking for.

           The chart takes the full width and the reading material sits beneath
           it. Nothing is lost: the split bar and the table were never meant to
           be read *while* looking at the chart. */
        <div className="flex flex-col gap-6">
          <GrowthWaterfall d={d} />
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <RealVsPriceBar d={d} />
            <div>
            <table className="w-full text-[13px]">
              <tbody>
                {d.terms.map((t) => (
                  <tr key={t.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-2 text-left font-medium text-ink">
                      {t.label}
                      <span className="tnum ml-2 block text-[12px] font-normal text-ink-muted">
                        {t.operand}
                      </span>
                    </th>
                    <td
                      className="tnum py-2 text-right font-medium"
                      style={{ color: t.value >= 0 ? "var(--good)" : "var(--loss)" }}
                    >
                      {t.value >= 0 ? "+" : "−"}{money(Math.abs(t.value))}
                    </td>
                  </tr>
                ))}
                {/* The sum, in the table as well as in the chart. A reader who
                    checks arithmetic checks it in a column of figures, not by
                    measuring bars. */}
                <tr className="border-t border-line-strong">
                  <th scope="row" className="py-2 text-left font-semibold text-ink">
                    Modelled change
                    <span className="tnum ml-2 block text-[12px] font-normal text-ink-muted">
                      the four above, added
                    </span>
                  </th>
                  <td className="tnum py-2 text-right font-semibold text-ink">
                    {d.revenueChange >= 0 ? "+" : "−"}{money(Math.abs(d.revenueChange))}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── C-2, stated rather than absorbed ───────────────────────────
                The old caption claimed the parts summed to the whole exactly
                while being $18 out, because it was comparing a sum of factor
                contributions against a *recorded* revenue change the factors
                cannot reproduce — they are stored rounded to four decimals.

                Both figures are now on the page and the difference between them
                is named. It is small, it is rounding, and saying so costs
                nothing next to a reader discovering it with a calculator. */}
            <div className="mt-3 rounded-lg border border-line bg-surface-sunken px-3 py-2.5">
              <p className="text-[12px] leading-relaxed text-ink-secondary">
                <strong className="text-ink">The four parts sum to the modelled change exactly</strong> —
                symmetric Shapley, so no residual bar is needed and none is hidden. Recorded revenue moved{" "}
                <span className="tnum">
                  {d.recordedChange >= 0 ? "+" : "−"}{money(Math.abs(d.recordedChange))}
                </span>
                , which is{" "}
                <span className="tnum">{money(Math.abs(d.reconciliation))}</span>{" "}
                {d.reconciliation >= 0 ? "more" : "less"} than the model. That difference is rounding in the
                four stored factors, not an unexplained residual.
              </p>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

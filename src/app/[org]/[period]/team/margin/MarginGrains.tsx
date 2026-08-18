"use client";

import { useState } from "react";
import { count, money, pct } from "@/lib/metrics";
import { totalCells, wageBand } from "@/lib/team";
import type { TeamMarginCell } from "@/lib/types";

export type Grain = { key: string; label: string; hint: string; cells: TeamMarginCell[] };

const TONE: Record<string, string> = {
  good: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
};

/**
 * The margin table, at whichever grain the reader picks.
 *
 * ── Why the grain is a control and not five stacked tables ─────────────────
 *
 * The same question — what does this cost against what it returns — is asked at
 * five resolutions, and an operator moves between them constantly: the month
 * says whether the business is where it should be, the week is the horizon they
 * can still act on, the day of week is where the pattern lives, and the service
 * block is where the decision actually gets made. Stacking all five makes the
 * reader scroll to compare, and comparison is the entire activity.
 *
 * ── The bar is drawn against a target, not against the biggest value ───────
 *
 * A bar scaled to the largest wage percentage in the set makes the worst row
 * look full and every other row look fine, and it re-scales every time the data
 * moves. These are scaled against a fixed 35% ceiling, so a row's length means
 * the same thing on every grain and on every venue — and a row that runs past
 * the end of its track is telling you something true.
 */
export function MarginGrains({ grains, initial }: { grains: Grain[]; initial?: string }) {
  const [key, setKey] = useState(initial ?? grains[0].key);
  const grain = grains.find((g) => g.key === key) ?? grains[0];
  const cells = grain.cells;
  const total = totalCells(cells);
  const CEILING = 0.35;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-3">
        {grains.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setKey(g.key)}
            aria-pressed={g.key === key}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              g.key === key
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-ink-secondary hover:bg-surface-hover"
            }`}
          >
            {g.label}
          </button>
        ))}
        <span className="ml-1 text-[12px] text-ink-secondary">{grain.hint}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
              <th className="px-5 py-2.5 text-left font-medium">{grain.label}</th>
              <th className="px-3 py-2.5 text-right font-medium">Net sales</th>
              <th className="px-3 py-2.5 text-right font-medium">Labour</th>
              <th className="px-3 py-2.5 text-right font-medium">Planned</th>
              <th className="px-3 py-2.5 text-right font-medium">Hours</th>
              <th className="px-3 py-2.5 text-right font-medium">Net / hr</th>
              <th className="w-[190px] px-3 py-2.5 text-left font-medium">Wage %</th>
              <th className="px-5 py-2.5 text-right font-medium">Margin after labour</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => {
              const band = wageBand(c.wagePct);
              const over = c.plannedLabour != null ? c.labour - c.plannedLabour : null;
              return (
                <tr key={`${c.key}|${c.storeId}`} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-2.5 whitespace-nowrap text-ink">
                    {c.label}
                    {c.tradingDays > 1 && (
                      <span className="block text-[11px] text-ink-muted">
                        {count(c.tradingDays)} trading days
                      </span>
                    )}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-ink">{money(c.net)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-ink">{money(c.labour)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                    {c.plannedLabour == null ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <>
                        {money(c.plannedLabour)}
                        {over != null && Math.abs(over) > 1 && (
                          <span
                            className="block text-[11px]"
                            style={{ color: over > 0 ? "var(--warning)" : "var(--ink-muted)" }}
                          >
                            {over > 0 ? "+" : ""}
                            {money(over)} vs plan
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                    {count(c.hours)}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-ink">
                    {c.netPerHour == null ? <span className="text-ink-muted">—</span> : money(c.netPerHour)}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.wagePct == null ? (
                      <span className="text-[12px] text-ink-muted">not published</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 flex-1 rounded-sm bg-surface-sunken">
                          <div
                            className="h-full rounded-sm"
                            style={{
                              width: `${Math.min(100, (c.wagePct / CEILING) * 100)}%`,
                              background: TONE[band!.tone],
                            }}
                          />
                        </div>
                        <span
                          className="tnum w-[52px] text-right font-medium"
                          style={{ color: TONE[band!.tone] }}
                        >
                          {pct(c.wagePct, 1)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="tnum px-5 py-2.5 text-right font-medium text-ink">
                    {c.margin == null ? <span className="text-ink-muted">—</span> : money(c.margin)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong bg-surface-sunken font-medium">
              <td className="px-5 py-2.5 text-ink">All {grain.label.toLowerCase()}</td>
              <td className="tnum px-3 py-2.5 text-right text-ink">{money(total.net)}</td>
              <td className="tnum px-3 py-2.5 text-right text-ink">{money(total.labour)}</td>
              <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                {total.plannedLabour == null ? "—" : money(total.plannedLabour)}
              </td>
              <td className="tnum px-3 py-2.5 text-right text-ink-secondary">{count(total.hours)}</td>
              <td className="tnum px-3 py-2.5 text-right text-ink">
                {total.netPerHour == null ? "—" : money(total.netPerHour)}
              </td>
              <td className="tnum px-3 py-2.5 text-ink">
                {total.wagePct == null ? "—" : pct(total.wagePct, 1)}
              </td>
              <td className="tnum px-5 py-2.5 text-right text-ink">{money(total.margin)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-5 py-3 text-[12px] leading-relaxed text-ink-secondary">
        The wage bar is scaled against a fixed 35% ceiling on every grain and every venue, so a row&rsquo;s
        length means the same thing wherever you read it. The total row divides summed labour by
        summed sales — <strong className="text-ink">a wage percentage is never the average of wage
        percentages</strong>.
      </p>
    </div>
  );
}

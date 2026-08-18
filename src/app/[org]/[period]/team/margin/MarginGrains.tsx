"use client";

import { useState } from "react";
import { count, money, pct } from "@/lib/metrics";
import { totalCells, wageBand } from "@/lib/team";
import type { TeamMarginCell } from "@/lib/types";

export type Grain = {
  key: string;
  label: string;
  /** The column heading for the first column. Usually the grain's own noun. */
  heading: string;
  cells: TeamMarginCell[];
  /** Subtotal rows the cells nest inside, drawn above each run. Day parts only. */
  groups?: TeamMarginCell[];
};

const TONE: Record<string, string> = {
  good: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
};

/** Scaled against a fixed ceiling on every grain, so a bar length means one thing. */
const CEILING = 0.35;

/**
 * One table, five grains, and a control to move between them.
 *
 * ── Why the grain is a control ─────────────────────────────────────────────
 *
 * The same question — what does this cost against what it returns — is asked at
 * five resolutions, and an operator moves between them constantly: the month
 * says whether the business is where it should be, the week is the horizon they
 * can still act on, the weekday is where the pattern lives, and the day part is
 * where the decision gets made. Stacking five tables makes the reader scroll to
 * compare, and comparison is the entire activity.
 *
 * ── The day part grain is nested, not flat ────────────────────────────────
 *
 * Day parts carry the trade shape and **no ratio**. The ratio belongs to the
 * group of day parts a service is made of, so that grain draws a subtotal row
 * per group with the ratio on it, and the day parts underneath it without one.
 * Every figure on a group row is the sum of the rows drawn beneath it, so the
 * reader can add up.
 */
export function MarginGrains({ grains, initial }: { grains: Grain[]; initial?: string }) {
  const [key, setKey] = useState(initial ?? grains[0].key);
  const grain = grains.find((g) => g.key === key) ?? grains[0];
  const total = totalCells(grain.groups ?? grain.cells);
  /**
   * The roster is published per date, so a grain the date cannot reach carries
   * no plan — and eight rows of an em dash under a heading is a column telling
   * the reader nothing at the cost of the width it takes. It is dropped rather
   * than drawn empty.
   */
  const hasPlan = [...(grain.groups ?? []), ...grain.cells].some((c) => c.plannedLabour != null);

  /** Rows in reading order: a group, then the cells that make it up. */
  const rows: { cell: TeamMarginCell; isGroup: boolean }[] = grain.groups
    ? grain.groups.flatMap((g) => [
        { cell: g, isGroup: true },
        ...grain.cells.filter((c) => c.group === g.key).map((c) => ({ cell: c, isGroup: false })),
      ])
    : grain.cells.map((c) => ({ cell: c, isGroup: false }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-3">
        <span className="mr-1 text-[12px] font-medium text-ink-secondary">Group by</span>
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
              <th className="px-5 py-2.5 text-left font-medium">{grain.heading}</th>
              <th className="px-3 py-2.5 text-right font-medium">Net sales</th>
              <th className="px-3 py-2.5 text-right font-medium">Labour</th>
              {hasPlan && <th className="px-3 py-2.5 text-right font-medium">vs plan</th>}
              <th className="px-3 py-2.5 text-right font-medium">Hours</th>
              <th className="px-3 py-2.5 text-right font-medium">Net / hr</th>
              <th className="w-[180px] px-3 py-2.5 text-left font-medium">Wage %</th>
              <th className="px-5 py-2.5 text-right font-medium">After labour</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cell: c, isGroup }) => {
              const band = wageBand(c.wagePct);
              const over = c.plannedLabour != null ? c.labour - c.plannedLabour : null;
              return (
                <tr
                  key={`${c.key}|${c.storeId}|${isGroup ? "g" : "c"}`}
                  className={`border-b border-line last:border-b-0 ${isGroup ? "bg-surface-sunken" : ""}`}
                >
                  <td className={`px-5 py-2.5 whitespace-nowrap ${isGroup ? "font-semibold text-ink" : "text-ink"}`}>
                    <span className={grain.groups && !isGroup ? "pl-4 text-ink-secondary" : ""}>
                      {c.label}
                    </span>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-ink">{money(c.net)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-ink">{money(c.labour)}</td>
                  {hasPlan && (
                    <td className="tnum px-3 py-2.5 text-right">
                      {over == null || Math.abs(over) < 1 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <span style={{ color: over > 0 ? "var(--warning)" : "var(--good)" }}>
                          {over > 0 ? "+" : "−"}
                          {money(Math.abs(over))}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="tnum px-3 py-2.5 text-right text-ink-secondary">{count(c.hours)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-ink">
                    {c.netPerHour == null ? <span className="text-ink-muted">—</span> : money(c.netPerHour)}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.wagePct == null ? (
                      <span className="text-[12px] text-ink-muted">
                        {grain.groups ? "see service above" : "not published"}
                      </span>
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
                          className="tnum w-[50px] text-right font-medium"
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
            <tr className="border-t-2 border-line-strong bg-surface-sunken font-semibold">
              <td className="px-5 py-2.5 text-ink">Window</td>
              <td className="tnum px-3 py-2.5 text-right text-ink">{money(total.net)}</td>
              <td className="tnum px-3 py-2.5 text-right text-ink">{money(total.labour)}</td>
              {hasPlan && (
                <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                  {total.plannedLabour == null ? "—" : money(total.labour - total.plannedLabour)}
                </td>
              )}
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
    </div>
  );
}

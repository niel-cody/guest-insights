import type { ReactNode } from "react";

/**
 * A 7-row grid of shaded cells. **Built once, used twice.**
 *
 * §6.2 renders it as day of week × daypart, shaded by order density, revenue
 * density or member share. §7.3 renders it as day of week × calendar week for a
 * single guest, shaded by that day's spend. They are the same object: seven rows
 * of weekday against a time axis, one cell per intersection, shaded on a shared
 * scale.
 *
 * Building it twice would have been the easy thing and it is how the two would
 * have drifted — different empty-cell treatment, different scale handling,
 * different week ordering. §12 asks for this to be verifiable in the diff, and
 * it is: there is one implementation and two call sites.
 *
 * ── Rules this component enforces rather than documents ────────────────────
 *
 * **Rows are Monday-first.** The warehouse emits Sunday as 0 because that is the
 * `DAYOFWEEK` convention; a trading week that starts on Sunday reads wrong to
 * everybody who runs a roster. The rotation happens here, once, at the boundary
 * between measurement and presentation.
 *
 * **Columns are never sorted by value.** §6.2: it is a calendar, not a ranking.
 * The caller supplies them in clock order and this component preserves it. There
 * is no sort prop, because a sort prop is how the calendar becomes a league
 * table one hurried afternoon.
 *
 * **The scale is shared across every cell** (§8 rule 1). One `max` for the whole
 * grid, so a quiet Tuesday looks quiet rather than being normalised into
 * looking busy.
 *
 * **A cell with no trade is blank, and a cell with a zero value is not.** Those
 * are different facts. Blank is "nothing happened here"; a pale cell is "this
 * happened and it was small".
 *
 * **Population and window render on the chart itself** (§8 rule 5), not in a
 * legend and not in the card header, because a screenshot of a chart travels
 * without its card.
 */

export type MatrixCell = {
  /** What drives the shading. Null means nothing happened — the cell is blank. */
  value: number | null;
  /** The full sentence for this cell. Read out by assistive tech and on focus. */
  label: string;
};

export type MatrixColumn = {
  key: string;
  label: string;
  sublabel?: string;
  /**
   * A period the business barely trades in. Kept as a column — a calendar with
   * days missing is not a calendar — but narrowed, because at a fraction of a
   * percent of trade the three dead dayparts were occupying 38% of the grid's
   * width. §8 rule 4: ink proportional to magnitude.
   */
  narrow?: boolean;
};

/** Monday-first, with the `DAYOFWEEK` index the warehouse actually emits. */
export const WEEKDAYS = [
  { dow: 1, label: "Mon", long: "Monday" },
  { dow: 2, label: "Tue", long: "Tuesday" },
  { dow: 3, label: "Wed", long: "Wednesday" },
  { dow: 4, label: "Thu", long: "Thursday" },
  { dow: 5, label: "Fri", long: "Friday" },
  { dow: 6, label: "Sat", long: "Saturday" },
  { dow: 0, label: "Sun", long: "Sunday" },
] as const;

/**
 * A single-hue sequential ramp.
 *
 * Sequential rather than diverging because these quantities have a floor and no
 * meaningful midpoint — there is no such thing as a negative Tuesday. A
 * diverging scale would invent one and invite the reader to find a middle that
 * does not exist.
 *
 * The floor is 0.08 rather than 0: a cell carrying real but tiny trade must stay
 * distinguishable from a cell carrying none, because that distinction is the
 * whole of the individual slip signal in §7.3.
 */
function shade(t: number, hue: string): string {
  const clamped = Math.max(0, Math.min(1, t));
  return `color-mix(in srgb, ${hue} ${(0.08 + clamped * 0.92) * 100}%, transparent)`;
}

/**
 * The diverging ramp, for the one view that has a real midpoint.
 *
 * Only used where zero means something — revenue share against order share,
 * where a cell earning exactly its footfall is genuinely neutral. Everywhere
 * else the quantity has a floor and no meaningful middle, and a diverging scale
 * would invent one.
 */
function shadeDiverging(t: number): string {
  const clamped = Math.max(-1, Math.min(1, t));
  const hue = clamped >= 0 ? "var(--good)" : "var(--warning)";
  return `color-mix(in srgb, ${hue} ${(0.06 + Math.abs(clamped) * 0.94) * 100}%, transparent)`;
}

export function DayMatrix({
  columns, cells, max, hue = "var(--accent)", population, window: win,
  rowLabelWidth = 44, cellHeight = 34, footer, compact = false, diverging = false,
}: {
  columns: MatrixColumn[];
  /** Use the diverging ramp. Only for quantities with a real midpoint at zero. */
  diverging?: boolean;
  /** Keyed `${dow}|${columnKey}`. Absent keys are blank cells, not zeroes. */
  cells: Map<string, MatrixCell>;
  /** The shared scale. One number for the whole grid — §8 rule 1. */
  max: number;
  hue?: string;
  /** Rendered on the chart, not in the card header — §8 rule 5. */
  population: string;
  window: string;
  rowLabelWidth?: number;
  cellHeight?: number;
  footer?: ReactNode;
  compact?: boolean;
}) {
  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <table
          className="w-full border-separate"
          style={{ borderSpacing: compact ? "2px" : "3px", minWidth: columns.length > 10 ? 640 : 520 }}
        >
          <caption className="sr-only">
            {population}. {win}.
          </caption>
          <thead>
            <tr>
              <th style={{ width: rowLabelWidth }} />
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`pb-1 text-[11px] leading-tight font-medium ${
                    c.narrow ? "text-ink-muted" : "text-ink-secondary"
                  }`}
                  style={c.narrow ? { width: 26 } : undefined}
                >
                  {/* A dead period keeps its column and loses its width. The
                      label rotates so it still says which period it is. */}
                  {c.narrow ? (
                    <span className="block text-[9px] whitespace-nowrap">{c.label.slice(0, 4)}</span>
                  ) : (
                    <>
                      {c.label}
                      {c.sublabel && (
                        <span className="tnum block text-[10px] font-normal text-ink-muted">
                          {c.sublabel}
                        </span>
                      )}
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((d) => (
              <tr key={d.dow}>
                <th
                  scope="row"
                  className="pr-2 text-right text-[11px] font-medium text-ink-secondary"
                  style={{ width: rowLabelWidth }}
                >
                  {d.label}
                </th>
                {columns.map((c) => {
                  const cell = cells.get(`${d.dow}|${c.key}`);
                  const empty = !cell || cell.value === null;
                  return (
                    <td key={c.key} className="p-0" style={c.narrow ? { width: 26 } : undefined}>
                      <div
                        // The whole sentence, on the element, so a screen reader
                        // gets the same figure a sighted reader gets from the
                        // shade rather than a colour it cannot see.
                        aria-label={empty ? `${d.long}, ${c.label}: no trade` : `${d.long}, ${c.label}: ${cell!.label}`}
                        title={empty ? `${d.long} · ${c.label} · no trade` : `${d.long} · ${c.label} · ${cell!.label}`}
                        className="rounded-[3px] border"
                        style={{
                          height: cellHeight,
                          // Blank and zero are different facts and are drawn
                          // differently: a dashed outline is "nothing happened",
                          // the palest fill is "something small happened".
                          background: empty
                            ? "transparent"
                            : diverging
                              ? shadeDiverging(max ? cell!.value! / max : 0)
                              : shade(max ? cell!.value! / max : 0, hue),
                          borderColor: empty ? "var(--line)" : "transparent",
                          borderStyle: empty ? "dashed" : "solid",
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-[12px] leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">{population}</span> · {win}
        </p>
        <Legend hue={hue} diverging={diverging} />
      </figcaption>
      {footer}
    </figure>
  );
}

/** The ramp, and the two things a reader has to be told apart. */
function Legend({ hue, diverging }: { hue: string; diverging: boolean }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span
          className="h-3 w-4 rounded-[3px] border border-dashed border-line"
          style={{ background: "transparent" }}
        />
        no trade
      </span>
      {diverging ? (
        <span className="flex items-center gap-1">
          smaller basket
          {[-1, -0.5, 0, 0.5, 1].map((t) => (
            <span key={t} className="h-3 w-4 rounded-[3px]" style={{ background: shadeDiverging(t) }} />
          ))}
          bigger
        </span>
      ) : (
        <span className="flex items-center gap-1">
          less
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className="h-3 w-4 rounded-[3px]" style={{ background: shade(t, hue) }} />
          ))}
          more
        </span>
      )}
    </div>
  );
}

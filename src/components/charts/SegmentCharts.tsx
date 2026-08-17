import { SEGMENT_COLOUR, SEGMENT_LABEL, count, money, pct } from "@/lib/metrics";

/**
 * What replaced three charts.
 *
 * ── What went, and why ────────────────────────────────────────────────────
 *
 * **The log-log scatter is gone.** Its own footnote admitted the legend counted
 * occupied pixels rather than people. It could not draw two of the six segments
 * at all, because Slipping and Lapsed are defined on time since the last visit,
 * which was on neither axis. And it plotted 24,906 people directly beside a
 * table of 4,966 under a single heading, which is an instruction to read them as
 * a pair when they are different populations. The segment table takes the width
 * it was competing for.
 *
 * **Both treemaps are gone.** They re-encoded two columns that were already
 * visible to the dollar in the table beside them, in a geometry that is worse at
 * the job — area is near the bottom of the perceptual ranking and rectangles of
 * different aspect ratios cannot be compared by eye at all. The revenue treemap
 * also drew four of six segments legibly while quoting an all-six total.
 *
 * **What replaces them is the thing neither of them showed.** The finding is not
 * that Regulars are large in traffic, or that Regulars are large in revenue. It
 * is the *gap* between those two shares — a segment that is 28% of your people
 * and 67% of your revenue is a different business problem from one that is 27%
 * of your people and 5% of your revenue. Two treemaps put that comparison across
 * two panels and made the reader hold one shape in their head while looking at
 * the other. One diverging bar puts it on a single position scale, which is the
 * channel people actually read accurately.
 */

type Row = {
  segment: string;
  label: string;
  guests: number;
  visits: number;
  spend: number;
};

/**
 * Share of traffic against share of revenue, per segment, on one axis.
 *
 * Bars run from the visit share to the revenue share. A bar pointing right is a
 * segment worth more than its footfall; pointing left, less. The length is the
 * size of the mismatch, which is the quantity worth acting on and the one
 * quantity neither treemap encoded.
 */
export function SegmentGap({
  rows, windowLabel,
}: {
  rows: Row[];
  windowLabel: string;
}) {
  const totalVisits = rows.reduce((a, r) => a + r.visits, 0) || 1;
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0) || 1;

  const points = rows.map((r) => ({
    ...r,
    visitShare: r.visits / totalVisits,
    spendShare: r.spend / totalSpend,
  }));

  // A shared scale across every bar (§8 rule 1). Independent scales would make
  // the smallest mismatch look like the largest.
  const max = Math.max(...points.map((p) => Math.max(p.visitShare, p.spendShare)), 0.05);

  const W = 420;
  const LABEL = 96;
  /**
   * Room reserved to the right of the plot for the value labels.
   *
   * Without it the largest segment's bar reaches the right edge and its own
   * label — the numbers that make the bar readable — renders outside the
   * viewBox and simply disappears. The segment with the biggest mismatch is the
   * one most worth reading, so it is exactly the wrong one to lose.
   */
  const LABEL_ROOM = 96;
  const plot = W - LABEL - 8;
  const x = (share: number) => LABEL + (share / max) * plot;

  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <h3 className="text-[14px] font-semibold text-ink">
          Who drives traffic, and who delivers revenue
        </h3>
        <p className="mt-0.5 max-w-[80ch] text-[12px] leading-relaxed text-ink-secondary">
          Each bar runs from a segment&apos;s share of <strong>visits</strong> to its share of{" "}
          <strong>revenue</strong>. Pointing right means worth more than its footfall; left, less. The
          length of the bar is the size of the mismatch, and the mismatch is the finding —{" "}
          {count(totalVisits)} visits and {money(totalSpend)} from enrolled people · {windowLabel}.
        </p>
      </figcaption>

      <svg viewBox={`0 0 ${W + LABEL_ROOM} ${points.length * 30 + 26}`} className="w-full" role="img"
        aria-label={points
          .map((p) => `${p.label}: ${pct(p.visitShare, 1)} of visits, ${pct(p.spendShare, 1)} of revenue`)
          .join(". ")}>
        {points.map((p, i) => {
          const y = i * 30 + 16;
          const from = x(p.visitShare);
          const to = x(p.spendShare);
          const right = to >= from;
          return (
            <g key={p.segment}>
              <text x={LABEL - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--ink)">
                {p.label}
              </text>
              <line x1={Math.min(from, to)} x2={Math.max(from, to)} y1={y} y2={y}
                stroke={right ? "var(--good)" : "var(--warning)"} strokeWidth={7} strokeLinecap="round"
                opacity={0.85} />
              {/* Visits: hollow. Revenue: filled. One mark is where they are,
                  the other is what they are worth. */}
              <circle cx={from} cy={y} r={4.5} fill="var(--surface-raised)"
                stroke={SEGMENT_COLOUR[p.segment] ?? "var(--ink-muted)"} strokeWidth={2} />
              <circle cx={to} cy={y} r={4.5} fill={SEGMENT_COLOUR[p.segment] ?? "var(--ink-muted)"} />
              <text x={Math.max(from, to) + 9} y={y + 4} fontSize={10} className="tnum"
                fill="var(--ink-secondary)">
                {pct(p.visitShare, 1)} → {pct(p.spendShare, 1)}
              </text>
            </g>
          );
        })}
        <line x1={LABEL} x2={LABEL} y1={4} y2={points.length * 30 + 4} stroke="var(--line)" />
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink-muted bg-transparent" />
          share of visits
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-muted" />
          share of revenue
        </span>
        <span>Shares are of enrolled people only — the same denominator as the table.</span>
      </figcaption>
    </figure>
  );
}

export { SEGMENT_LABEL };

import { SEGMENT_COLOUR, SEGMENT_LABEL, VISIT_BOUNDARIES, count, money, pct } from "@/lib/metrics";
import type { Scatter } from "@/lib/types";

/**
 * The three charts §5.4 carries over from the existing Customer Report, because
 * users like them — rebuilt rather than reproduced.
 *
 * All three are static SVG rendered on the server. No client JavaScript, no
 * hover state, and therefore **no tooltips** (§8 rule 7): every figure a reader
 * needs is drawn or written, because hover does not exist on touch and a chart
 * that needs a tooltip to be readable is not finished.
 */

// ── the scatter ─────────────────────────────────────────────────────────────

const W = 720;
const H = 340;
const PAD = { top: 14, right: 16, bottom: 40, left: 54 };

/** Log scales. `+1` so a guest with one visit or a dollar of spend still plots. */
const lg = (v: number) => Math.log10(Math.max(v, 0) + 1);

/**
 * Total spend against visit frequency, one mark per person.
 *
 * ── The two improvements over the chart this replaces ──────────────────────
 *
 * **It draws on the whole classifiable population, not a sample.** The report
 * this replaces plots 3,387 people because it identifies them by loyalty scan.
 * This plots every person the card spine can classify — and that difference is
 * the argument the whole build is making, so plotting it from the guest grid's
 * bounded working set would have quietly restated the defect. It reads a
 * dedicated three-numbers-per-person file for exactly this reason.
 *
 * **The segment boundaries render as lines**, so a reader can see where the cut
 * falls instead of being told a verdict. Only the two thresholds that are
 * genuinely on an axis are drawn — see `VISIT_BOUNDARIES`. Slipping and Lapsed
 * condition on recency against each guest's own cadence, which is neither axis,
 * and a line in the wrong place is worse than no line because it invites the
 * reader to measure against it. Those two are stated in the note instead.
 *
 * ── Why the spend axis is logarithmic ──────────────────────────────────────
 *
 * §5.4: linear compresses everyone into a smudge at the origin. Coffee Guru's
 * spend runs from a few dollars to several thousand and the mass sits under $50,
 * so on a linear axis 90% of the population occupies 2% of the width and the
 * chart shows one dark blob and a few dots. Both axes are logarithmic here and
 * the axis labels say so on the chart face.
 *
 * ── Why the marks are deduplicated ─────────────────────────────────────────
 *
 * 24,906 individual SVG nodes is a page that scrolls badly. Marks are rounded to
 * the pixel and drawn once per occupied pixel inside each segment, as a single
 * path per segment — seven nodes in total. Nothing is aggregated and no
 * population is sampled: two people landing on the same pixel were always going
 * to be one visible dot.
 */
export function SegmentScatter({ scatter, windowLabel }: { scatter: Scatter; windowLabel: string }) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxSpend = Math.max(...scatter.rows.map((r) => r[0]), 10);
  const maxVisits = Math.max(...scatter.rows.map((r) => r[1]), 2);

  const x = (spend: number) => PAD.left + (lg(spend) / lg(maxSpend)) * plotW;
  const y = (visits: number) => PAD.top + plotH - (lg(visits) / lg(maxVisits)) * plotH;

  // One path per segment, plus one for the card tier. Pixels are deduplicated
  // within a segment; overlapping segments still overprint, which is honest —
  // that is what the underlying data does.
  const byKey = new Map<number, Set<string>>();
  for (const [spend, visits, seg] of scatter.rows) {
    const px = Math.round(x(spend));
    const py = Math.round(y(visits));
    const set = byKey.get(seg) ?? new Set<string>();
    set.add(`${px},${py}`);
    byKey.set(seg, set);
  }

  const path = (set: Set<string>) =>
    [...set]
      .map((p) => {
        const [px, py] = p.split(",");
        return `M${px} ${py}h2v2h-2Z`;
      })
      .join("");

  const spendTicks = [1, 10, 100, 1000, 10_000].filter((t) => t <= maxSpend * 1.4);
  const visitTicks = [1, 3, 10, 30, 100].filter((t) => t <= maxVisits * 1.2);

  // The card tier is drawn first and palest: it is by far the largest group and
  // painting it last would bury every member segment underneath it.
  const drawOrder = [-1, ...scatter.segments.map((_, i) => i)];
  const cardCount = byKey.get(-1)?.size ?? 0;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Total spend against visits for ${count(scatter.population)} classifiable people, coloured by segment. Both axes logarithmic.`}>
        {/* gridlines */}
        {spendTicks.map((t) => (
          <line key={`x${t}`} x1={x(t)} x2={x(t)} y1={PAD.top} y2={PAD.top + plotH}
            stroke="var(--grid)" strokeWidth={1} />
        ))}
        {visitTicks.map((t) => (
          <line key={`y${t}`} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)}
            stroke="var(--grid)" strokeWidth={1} />
        ))}

        {drawOrder.map((seg) => {
          const set = byKey.get(seg);
          if (!set?.size) return null;
          const isCard = seg === -1;
          return (
            <path
              key={seg}
              d={path(set)}
              fill={isCard ? "var(--tier-unattributed)" : SEGMENT_COLOUR[scatter.segments[seg]]}
              opacity={isCard ? 0.5 : 0.78}
            />
          );
        })}

        {/* The boundaries that are genuinely on an axis. */}
        {VISIT_BOUNDARIES.filter((b) => b.visits <= maxVisits).map((b) => (
          <g key={b.visits}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(b.visits)} y2={y(b.visits)}
              stroke="var(--ink)" strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
            <text x={PAD.left + plotW} y={y(b.visits) - 4} textAnchor="end"
              fontSize={10} fill="var(--ink-secondary)">
              {b.visits} visits
            </text>
          </g>
        ))}

        {/* axes */}
        {spendTicks.map((t) => (
          <text key={`xl${t}`} x={x(t)} y={PAD.top + plotH + 14} textAnchor="middle"
            className="tnum" fontSize={10} fill="var(--ink-muted)">
            {money(t)}
          </text>
        ))}
        {visitTicks.map((t) => (
          <text key={`yl${t}`} x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
            className="tnum" fontSize={10} fill="var(--ink-muted)">
            {t}
          </text>
        ))}
        <text x={PAD.left + plotW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--ink-secondary)">
          Total spend in the window — logarithmic
        </text>
        <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" fontSize={11} fill="var(--ink-secondary)"
          transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}>
          Visits — logarithmic
        </text>

        {/* §8 rule 5: population and window on the chart, not only in the card. */}
        <text x={PAD.left + 4} y={PAD.top + 11} fontSize={10} fill="var(--ink-muted)">
          {count(scatter.population)} classifiable people · {windowLabel}
        </text>
      </svg>

      <figcaption className="mt-2 flex flex-col gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {scatter.segments.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEGMENT_COLOUR[s] }} />
              {SEGMENT_LABEL[s]}
              <span className="tnum text-ink-muted">{count(byKey.get(i)?.size ?? 0)}px</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--tier-unattributed)" }} />
            Card only — no lifecycle verdict
            <span className="tnum text-ink-muted">{count(cardCount)}px</span>
          </li>
        </ul>
        <p className="max-w-[92ch] text-[12px] leading-relaxed text-ink-muted">
          Two boundaries are drawn because two are genuinely on an axis. Slipping and Lapsed depend on
          how long it has been since a guest&apos;s last visit measured against{" "}
          <em>their own</em> usual gap, which is neither axis here — so they are not drawn rather than
          approximated onto it. Marks are rounded to the pixel, so the legend counts occupied pixels
          rather than people; the population above the plot is the real one.
        </p>
      </figcaption>
    </figure>
  );
}

// ── the treemaps ────────────────────────────────────────────────────────────

type TreeItem = { key: string; label: string; value: number };

/**
 * Squarified treemap layout.
 *
 * Slice-and-dice is simpler and produces slivers at these ratios — Regulars take
 * two thirds of revenue and Lapsed 0.2%, and a sliver two pixels wide cannot be
 * compared with anything. Squarified keeps aspect ratios near 1, which is the
 * only reason a reader can compare two rectangles by eye at all.
 */
function squarify(items: TreeItem[], w: number, h: number) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const scaled = items.map((i) => ({ ...i, area: (i.value / total) * w * h }));
  const out: (TreeItem & { x: number; y: number; w: number; h: number })[] = [];

  let x = 0, y = 0, rw = w, rh = h;
  let row: typeof scaled = [];
  const worst = (r: typeof scaled, side: number) => {
    const sum = r.reduce((a, i) => a + i.area, 0);
    if (!sum || !side) return Infinity;
    const max = Math.max(...r.map((i) => i.area));
    const min = Math.min(...r.map((i) => i.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };

  const flush = () => {
    const sum = row.reduce((a, i) => a + i.area, 0);
    const vertical = rw >= rh;
    const thickness = sum / (vertical ? rh : rw);
    let offset = 0;
    for (const item of row) {
      const length = item.area / (thickness || 1);
      out.push(
        vertical
          ? { ...item, x, y: y + offset, w: thickness, h: length }
          : { ...item, x: x + offset, y, w: length, h: thickness },
      );
      offset += length;
    }
    if (vertical) { x += thickness; rw -= thickness; } else { y += thickness; rh -= thickness; }
    row = [];
  };

  for (const item of scaled) {
    const side = Math.min(rw, rh);
    if (row.length && worst([...row, item], side) > worst(row, side)) flush();
    row.push(item);
  }
  if (row.length) flush();
  return out;
}

/**
 * One of the pair. **They ship side by side, with those exact questions as
 * titles, and the pairing is the point** — a segment that is large in traffic
 * and small in revenue is visible across two panels and invisible in either
 * alone. Same colour per segment in both, from `SEGMENT_COLOUR`.
 */
export function SegmentTreemap({
  title, items, format, population, windowLabel, height = 220,
}: {
  title: string;
  items: TreeItem[];
  format: (v: number) => string;
  population: string;
  windowLabel: string;
  height?: number;
}) {
  const width = 340;
  const laid = squarify(
    [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value),
    width,
    height,
  );
  const total = items.reduce((a, i) => a + i.value, 0) || 1;

  return (
    <figure className="m-0">
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full" role="img"
        aria-label={`${title} ${laid.map((l) => `${l.label} ${format(l.value)}`).join(", ")}`}>
        {laid.map((r) => {
          // A label only renders where it fits. A rectangle too small to carry
          // its own name is left to the legend rather than given four
          // overlapping characters — §8 rule 4, ink proportional to magnitude.
          const roomy = r.w > 58 && r.h > 30;
          return (
            <g key={r.key}>
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(r.w - 2, 0)} height={Math.max(r.h - 2, 0)}
                rx={3} fill={SEGMENT_COLOUR[r.key] ?? "var(--tier-unattributed)"} />
              {roomy && (
                <>
                  <text x={r.x + 8} y={r.y + 17} fontSize={11} fontWeight={600} fill="#fff" opacity={0.95}>
                    {r.label}
                  </text>
                  <text x={r.x + 8} y={r.y + 31} fontSize={11} fill="#fff" opacity={0.85} className="tnum">
                    {pct(r.value / total, 1)}
                  </text>
                  {r.h > 46 && (
                    <text x={r.x + 8} y={r.y + 45} fontSize={10} fill="#fff" opacity={0.72} className="tnum">
                      {format(r.value)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
        {population} · {windowLabel}
      </figcaption>
    </figure>
  );
}

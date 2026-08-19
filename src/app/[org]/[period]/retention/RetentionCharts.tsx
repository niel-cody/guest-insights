import { count, monthLabel, pct } from "@/lib/metrics";
import type { Cohorts } from "@/lib/types";
import type { FlowMonth, RetentionTrend } from "@/lib/retention";


/**
 * Anchor the first and last tick inward.
 *
 * A centred label at either end of the plot hangs half its width past the
 * viewBox and is clipped — which does not look broken, it looks like a shorter
 * label. "July 2026" rendered as "July 202" reads as a typo rather than as a
 * drawing bug, so nobody reports it.
 */
const anchorAt = (i: number, n: number) => (i === 0 ? "start" : i === n - 1 ? "end" : "middle");

/**
 * Whether to draw the tick at `i`.
 *
 * The last tick is always drawn, because a time axis whose right-hand end is
 * unlabelled makes the reader guess where the data stops. Everything else is
 * drawn every `every` steps — **unless it would land on top of that last one**,
 * which is what produced "June 2026July 2026" the moment the end label stopped
 * being clipped and became visible. A full step of clearance rather than half,
 * because half still overlapped at eleven characters of month name.
 */
const showTick = (i: number, n: number, every: number) =>
  i === n - 1 || (i % every === 0 && n - 1 - i >= Math.max(2, every));

const W = 760;
const H = 260;
const PAD = { top: 14, right: 16, bottom: 34, left: 46 };
const pw = W - PAD.left - PAD.right;
const ph = H - PAD.top - PAD.bottom;

/**
 * Retention at a fixed age, one point per comparable intake.
 *
 * ── Why this line is allowed to exist ──────────────────────────────────────
 *
 * The build has refused a retention trend since the cohort lens shipped, because
 * scan coverage was climbing and a falling line could not be told apart from a
 * programme recruiting a broader population. This draws only the intakes that
 * joined **while coverage was flat**, so the population they were drawn from is
 * the same one and the movement is retention rather than reach.
 *
 * Every point is measured at the same elapsed age. That is the other half of the
 * fairness: a cohort four months old and one fourteen months old are not
 * comparable on "how many are left", and comparing them is how a censor boundary
 * gets read as a decline.
 */
export function RetentionTrendChart({ trend }: { trend: RetentionTrend }) {
  const pts = trend.points;
  const max = Math.max(...pts.map((p) => p.rate), 0.05) * 1.15;
  const x = (i: number) => PAD.left + (pts.length === 1 ? pw / 2 : (i / (pts.length - 1)) * pw);
  const y = (v: number) => PAD.top + ph - (v / max) * ph;

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.rate).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const labelEvery = Math.ceil(pts.length / 9);
  const tone = trend.direction === "improving" ? "var(--good)" : trend.direction === "declining" ? "var(--critical)" : "var(--ink-secondary)";

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[540px]"
          role="img"
          aria-label={`Retention ${trend.horizon} months after joining, for ${pts.length} intakes recruited while coverage was flat. ${pts[0].label} at ${pct(pts[0].rate, 0)}, ${pts.at(-1)!.label} at ${pct(pts.at(-1)!.rate, 0)}.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + pw} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text
                x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle"
                fontSize={10} fill="var(--ink-muted)" className="tnum"
              >
                {pct(t, 0)}
              </text>
            </g>
          ))}

          {/* The pooled rate, so a reader can see which intakes sat either side
              of the average rather than only the shape of the line. */}
          <line
            x1={PAD.left} x2={PAD.left + pw} y1={y(trend.pooled)} y2={y(trend.pooled)}
            stroke="var(--ink-muted)" strokeDasharray="4 4"
          />
          <text x={PAD.left + pw} y={y(trend.pooled) - 5} textAnchor="end" fontSize={10} fill="var(--ink-muted)">
            pooled {pct(trend.pooled, 0)}
          </text>

          <path d={line} fill="none" stroke={tone} strokeWidth={2} strokeLinejoin="round" />
          {pts.map((p, i) => (
            <g key={p.cohort}>
              <circle cx={x(i)} cy={y(p.rate)} r={4} fill="var(--surface-raised)" stroke={tone} strokeWidth={2}>
                <title>
                  {p.label} intake — {count(p.retained)} of {count(p.members)} still coming{" "}
                  {trend.horizon} months later ({pct(p.rate, 1)})
                </title>
              </circle>
            </g>
          ))}

          {pts.map((p, i) =>
            showTick(i, pts.length, labelEvery) ? (
              <text
                key={p.cohort} x={x(i)} y={H - 14} textAnchor={anchorAt(i, pts.length)} fontSize={10}
                fill="var(--ink-muted)" className="tnum"
              >
                {p.label}
              </text>
            ) : null,
          )}
          <text x={PAD.left + pw / 2} y={H - 1} textAnchor="middle" fontSize={10} fill="var(--ink-secondary)">
            the month each group joined
          </text>
        </svg>
      </div>
    </figure>
  );
}

/**
 * The churn engine: who joined, who stayed, who stopped, month by month.
 *
 * Gains above the line and losses below it, because the question is not how
 * large the base is — the burn-down answers that — but **whether the programme
 * is filling faster than it leaks**. A base that grows every month while losing
 * more people every month is the single most common way a loyalty programme
 * looks healthy on the way to stalling.
 */
export function ChurnFlowChart({ flow }: { flow: FlowMonth[] }) {
  const rows = flow.slice(1);
  if (rows.length < 2) return null;

  const max = Math.max(...rows.map((m) => Math.max(m.joined, m.lost)), 1);
  const bw = Math.min(26, (pw / rows.length) * 0.38);
  const x = (i: number) => PAD.left + ((i + 0.5) / rows.length) * pw;
  const mid = PAD.top + ph / 2;
  const h = (v: number) => (v / max) * (ph / 2);
  const labelEvery = Math.ceil(rows.length / 9);

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[540px]"
          role="img"
          aria-label={`Members joining and lapsing each month across ${rows.length} months. Most recent month: ${count(rows.at(-1)!.joined)} joined, ${count(rows.at(-1)!.lost)} stopped coming.`}
        >
          <line x1={PAD.left} x2={PAD.left + pw} y1={mid} y2={mid} stroke="var(--line-strong)" />
          {[0.5, 1].map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={PAD.left + pw} y1={mid - h(max * t)} y2={mid - h(max * t)}
                stroke="var(--grid)"
              />
              <line
                x1={PAD.left} x2={PAD.left + pw} y1={mid + h(max * t)} y2={mid + h(max * t)}
                stroke="var(--grid)"
              />
              <text
                x={PAD.left - 6} y={mid - h(max * t)} textAnchor="end" dominantBaseline="middle"
                fontSize={10} fill="var(--ink-muted)" className="tnum"
              >
                {count(Math.round(max * t))}
              </text>
              <text
                x={PAD.left - 6} y={mid + h(max * t)} textAnchor="end" dominantBaseline="middle"
                fontSize={10} fill="var(--ink-muted)" className="tnum"
              >
                {count(Math.round(max * t))}
              </text>
            </g>
          ))}

          {rows.map((m, i) => (
            <g key={m.month}>
              <rect
                x={x(i) - bw / 2} y={mid - h(m.joined)} width={bw} height={Math.max(1, h(m.joined))}
                rx={2} fill="var(--tier-member)"
              >
                <title>{m.label} — {count(m.joined)} joined</title>
              </rect>
              <rect
                x={x(i) - bw / 2} y={mid} width={bw} height={Math.max(1, h(m.lost))}
                rx={2} fill="var(--critical)" opacity={0.75}
              >
                <title>
                  {m.label} — {count(m.lost)} stopped coming
                  {m.churnRate == null ? "" : ` (${pct(m.churnRate, 0)} of the active base)`}
                </title>
              </rect>
            </g>
          ))}

          {rows.map((m, i) =>
            showTick(i, rows.length, labelEvery) ? (
              <text
                key={m.month} x={x(i)} y={H - 14} textAnchor={anchorAt(i, rows.length)} fontSize={10}
                fill="var(--ink-muted)" className="tnum"
              >
                {m.label}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-[2px]" style={{ background: "var(--tier-member)" }} />
          joined, above the line
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-4 rounded-[2px]"
            style={{ background: "var(--critical)", opacity: 0.75 }}
          />
          stopped coming, below it
        </span>
      </p>
    </figure>
  );
}

/**
 * The burn-down, moved here from Behaviour.
 *
 * Bands are stacked oldest-first from the bottom, so a reader's eye follows one
 * cohort left to right along the bottom of the stack while newer intakes pile on
 * above it. Stacking newest-first would put every cohort on a moving baseline and
 * make thinning impossible to see, which is the one thing the chart is for.
 */
export function BurnDown({ cohorts }: { cohorts: Cohorts }) {
  const rows = cohorts.cohorts.filter((r) => r.members > 0);
  if (rows.length < 2) return null;

  const addMonths = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  };

  const months: string[] = [];
  for (let i = 0; ; i++) {
    const m = addMonths(cohorts.window.start, i);
    if (m > cohorts.window.end) break;
    months.push(m);
  }

  // Absent means the cohort does not exist yet, which is a structural zero —
  // nobody had joined — rather than a missing reading, so it is drawn as zero
  // rather than left as a hole.
  const active = rows.map((r) =>
    months.map((m) => {
      if (m < r.cohort) return 0;
      const k = months.indexOf(m) - months.indexOf(r.cohort);
      return cohorts.triangle.find((t) => t.cohort === r.cohort && t.monthsSince === k)?.active ?? 0;
    }),
  );

  const totals = months.map((_, mi) => active.reduce((a, band) => a + band[mi], 0));
  const max = Math.max(...totals, 1);
  const BH = 300;
  const bph = BH - PAD.top - 34;
  const x = (i: number) => PAD.left + (months.length === 1 ? 0 : (i / (months.length - 1)) * pw);
  const y = (v: number) => PAD.top + bph - (v / max) * bph;

  const upper: number[][] = [];
  for (let bi = 0; bi < active.length; bi++) {
    upper.push(months.map((_, mi) => (bi === 0 ? 0 : upper[bi - 1][mi]) + active[bi][mi]));
  }

  const band = (bi: number) => {
    const top = upper[bi];
    const bottom = bi === 0 ? months.map(() => 0) : upper[bi - 1];
    const fwd = top.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    const back = [...bottom]
      .map((v, i) => ({ v, i }))
      .reverse()
      .map((p) => `L${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`)
      .join(" ");
    return `${fwd} ${back} Z`;
  };

  // Oldest darkest. One hue, because these are ordered categories of the same
  // kind — a rainbow across twenty-one bands would read as twenty-one unrelated
  // things and could not be told apart anyway.
  const shade = (bi: number) => {
    const t = rows.length === 1 ? 1 : 1 - bi / (rows.length - 1);
    return `color-mix(in srgb, var(--tier-member) ${(0.22 + t * 0.78) * 100}%, transparent)`;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const labelEvery = Math.ceil(months.length / 8);

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${BH}`}
          className="w-full min-w-[560px]"
          role="img"
          aria-label={`Stacked burn-down of member intakes. ${count(totals[0])} members active in ${monthLabel(months[0])}, ${count(totals.at(-1)!)} in ${monthLabel(months.at(-1)!)} across ${rows.length} intakes.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + pw} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text
                x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle"
                fontSize={10} fill="var(--ink-muted)" className="tnum"
              >
                {count(t)}
              </text>
            </g>
          ))}

          {rows.map((r, bi) => (
            <path key={r.cohort} d={band(bi)} fill={shade(bi)} stroke="var(--surface-raised)" strokeWidth={0.5}>
              <title>
                {monthLabel(r.cohort)} intake — {count(r.members)} joined, {count(active[bi].at(-1)!)} still
                active at the window close
              </title>
            </path>
          ))}

          {months.map((m, i) =>
            showTick(i, months.length, labelEvery) ? (
              <text
                key={m} x={x(i)} y={BH - 14} textAnchor={anchorAt(i, months.length)} fontSize={10}
                fill="var(--ink-muted)" className="tnum"
              >
                {monthLabel(m)}
              </text>
            ) : null,
          )}
          <text x={PAD.left + pw / 2} y={BH - 1} textAnchor="middle" fontSize={10} fill="var(--ink-secondary)">
            calendar month
          </text>
        </svg>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-[2px]" style={{ background: shade(0) }} />
          {monthLabel(rows[0].cohort)} — the first intake
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-[2px]" style={{ background: shade(rows.length - 1) }} />
          {monthLabel(rows.at(-1)!.cohort)} — the most recent
        </span>
        <span>Darker is older.</span>
      </p>
    </figure>
  );
}

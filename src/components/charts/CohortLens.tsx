import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/Primitives";
import { count, monthLabel, pct, plural } from "@/lib/metrics";
import type { Cohorts } from "@/lib/types";

/**
 * §6.5. The member cohort lens.
 *
 * ── Everything here is members only, and that is in the titles ────────────
 *
 * Rule 1. **"Members only" goes in the chart title**, not in a footnote. Coverage
 * is roughly 19% of orders and this is a heavily self-selected group — our own
 * analysis says about 97% of the member value gap is selection rather than
 * effect. Labelled loosely, these charts launder a selected sample into a
 * general one, and a reader who takes a survival curve off this page as "our
 * customers" has been misled by the title alone.
 *
 * Rule 2. **The censor boundary is drawn on the chart.** Everything right of it
 * is the window, not behaviour: the 12-month column is only readable to cohorts
 * old enough to have been followed that far. Cells the window has not reached
 * are absent, never zero — a zero would render as total collapse.
 *
 * Rule 3. **The falling-cohort-quality trend is not published.** Six-month
 * survival falls sharply across the run, and coverage rose from about 4.8% to
 * 19% over the same period, so later cohorts include marginal members the early
 * ones never captured. The two effects are not separated here, so the trend line
 * is struck through with the reason rather than drawn.
 */

const CELL = 34;

export function CohortLens({ cohorts }: { cohorts: Cohorts }) {
  const { triangle, survival, grading } = cohorts;
  const rows = cohorts.cohorts;

  if (!grading.renders) {
    return (
      <EmptyState
        tone="warning"
        title="The member window is too short for a retention claim"
        body={`Retention needs an observation window at least twice the ${grading.thresholdDays}-day lapse threshold — ${grading.requiredDays} days. This snapshot holds ${count(grading.days)}.`}
      />
    );
  }

  const horizon = Math.max(...rows.map((r) => r.observableMonths), 0);
  // A column nobody can be observed in is not drawn at all. Capped so the
  // triangle stays readable rather than trailing twenty near-empty columns.
  const columns = Array.from({ length: Math.min(horizon + 1, 19) }, (_, i) => i);
  const cellOf = (cohort: string, k: number) =>
    triangle.find((t) => t.cohort === cohort && t.monthsSince === k);

  const maxTenure = Math.max(...rows.map((r) => r.avgTenureDays), 1);
  const firstCohort = rows[0];
  const lastFullyObserved = [...rows].reverse().find((r) => r.observableMonths >= 12);

  return (
    <div className="flex flex-col gap-6">
      {/* ── the triangle ───────────────────────────────────────────────── */}
      <figure className="m-0">
        <figcaption className="mb-2">
          <h3 className="text-[14px] font-semibold text-ink">
            Cohort retention — members only
          </h3>
          <p className="mt-0.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
            Each row is the month a member was first seen scanning; each column is months since. Shaded by
            the share of that cohort still active. {count(rows.reduce((a, r) => a + r.members, 0))} members
            across {rows.length} cohorts · {monthLabel(cohorts.window.start)} –{" "}
            {monthLabel(cohorts.window.end)} · loyalty scan, not payment card.
          </p>
        </figcaption>

        <div className="overflow-x-auto">
          <table className="border-separate text-[11px]" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="pr-2 text-right font-medium text-ink-secondary">Cohort</th>
                <th className="pr-2 text-right font-medium text-ink-secondary">Size</th>
                {columns.map((k) => (
                  <th key={k} className="pb-1 text-center font-medium text-ink-secondary" style={{ width: CELL }}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cohort}>
                  <th scope="row" className="pr-2 text-right font-medium whitespace-nowrap text-ink">
                    {monthLabel(r.cohort)}
                  </th>
                  <td className="tnum pr-2 text-right text-ink-secondary">{count(r.members)}</td>
                  {columns.map((k) => {
                    // Rule 2: past the boundary the cell is absent, not zero.
                    const observed = k <= r.observableMonths;
                    const cell = observed ? cellOf(r.cohort, k) : undefined;
                    const s = cell ? cell.active / r.members : null;
                    const isBoundary = k === r.observableMonths;
                    return (
                      <td key={k} className="p-0">
                        <div
                          className="flex items-center justify-center rounded-[3px]"
                          style={{
                            width: CELL,
                            height: 22,
                            background:
                              s === null
                                ? "transparent"
                                : `color-mix(in srgb, var(--tier-member) ${(0.1 + s * 0.9) * 100}%, transparent)`,
                            border: observed ? "1px solid transparent" : "1px dashed var(--line)",
                            // The censor boundary, drawn cell by cell so it
                            // steps down the triangle the way the calendar does.
                            borderRight: isBoundary ? "2px solid var(--critical)" : undefined,
                            color: s !== null && s > 0.55 ? "#fff" : "var(--ink-secondary)",
                          }}
                          aria-label={
                            observed
                              ? `${monthLabel(r.cohort)} cohort, ${k} months later: ${s === null ? "none active" : pct(s, 0)} active`
                              : `${monthLabel(r.cohort)} cohort, ${k} months later: not yet observable`
                          }
                        >
                          <span className="tnum text-[10px]">{s === null ? "" : pct(s, 0).replace("%", "")}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-[2px]" style={{ borderRight: "2px solid var(--critical)" }} />
            the censor boundary — the window ends here, the cohort does not
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-[2px] border border-dashed border-line" />
            not yet observable
          </span>
        </p>
        <p className="mt-1.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
          Everything right of the red edge is the length of the window, not the behaviour of the guests. The
          12-month column can only be read for cohorts formed before{" "}
          {lastFullyObserved ? monthLabel(lastFullyObserved.cohort) : "—"}; younger cohorts have not had a
          year yet, so their cells are absent rather than zero.
        </p>
      </figure>

      {/* ── tenure by cohort ───────────────────────────────────────────── */}
      <figure className="m-0">
        <figcaption className="mb-2">
          <h3 className="text-[14px] font-semibold text-ink">
            Average tenure by cohort — members only
          </h3>
          <p className="mt-0.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
            First seen to last seen, <strong>right-censored by the window close</strong>. This is a floor on
            the relationship, not an estimate of it: a member still coming in on the last day has a tenure
            that stopped being measured, not one that ended. Younger cohorts are shorter because they have
            had less time, which is why the bars are not a trend.
          </p>
        </figcaption>
        <table className="w-full text-[12px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.cohort} className="border-b border-line last:border-b-0">
                <th scope="row" className="w-[92px] py-1 pr-3 text-left font-normal whitespace-nowrap text-ink">
                  {monthLabel(r.cohort)}
                </th>
                <td className="py-1">
                  <div className="h-2.5 w-full rounded-sm bg-surface-sunken">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${(r.avgTenureDays / maxTenure) * 100}%`,
                        background: "var(--tier-member)",
                        // Opacity carries how much room the cohort has had, so
                        // a short bar that is simply young reads as young.
                        opacity: 0.45 + 0.55 * (r.observableMonths / Math.max(horizon, 1)),
                      }}
                    />
                  </div>
                </td>
                <td className="tnum w-[128px] py-1 pl-3 text-right whitespace-nowrap text-ink-secondary">
                  {plural(Math.round(r.avgTenureDays), "day")}
                  <span className="ml-1.5 text-ink-muted">n={count(r.members)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-ink-muted">
          Bars fade with how little of the window a cohort has had. The{" "}
          {firstCohort ? monthLabel(firstCohort.cohort) : "first"} cohort has been followed for{" "}
          {firstCohort?.observableMonths} months; the last has been followed for none.
        </p>
      </figure>

      {/* ── survival ───────────────────────────────────────────────────── */}
      <SurvivalCurve cohorts={cohorts} />

      {/* ── the inter-visit gap ────────────────────────────────────────── */}
      <GapDistribution cohorts={cohorts} />

      {/* ── rule 3: the trend that is not published ─────────────────────── */}
      <div className="rounded-lg border border-dashed px-4 py-3.5" style={{ borderColor: "var(--warning)" }}>
        <h3 className="text-[14px] font-semibold text-ink-muted line-through decoration-2">
          Cohort quality is falling
        </h3>
        <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
          <strong className="text-ink">Not published.</strong> Six-month survival does fall across the run.
          So does the meaning of the word &quot;member&quot;: scan coverage rose from{" "}
          {pct(cohorts.coverage.find((c) => c.month >= cohorts.window.start)?.coverage ?? 0, 1)} to{" "}
          {pct(cohorts.coverage.at(-1)?.coverage ?? 0, 1)} of orders over the same period, so later cohorts
          include marginal members the early ones never captured at all. A cohort that only enrolled its
          most committed guests will always out-survive one that enrolled everybody.
        </p>
        <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
          Those two effects are not separated in this data, and the trend line would be read as a programme
          getting worse when it is at least partly a programme getting broader. Separating them needs a
          coverage-matched comparison, which is not in this build.
        </p>
      </div>

      <Disclosure
        summary="How the member window was graded"
        result={
          <>
            {grading.monthsUsable} of {grading.monthsTested} complete months passed, giving an unbroken run
            of {count(grading.days)} days from {monthLabel(grading.from)} to {monthLabel(grading.to)}.
            Reproduced independently on {new Date(grading.reproducedAt).toISOString().slice(0, 10)}.
          </>
        }
      >
        <p className="max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
          Coverage is computed as <code className="text-[12px]">NULLIF(TRIM(CUSTOMER_ID), &apos;&apos;)</code>,
          never <code className="text-[12px]">COUNT()</code>. That is not a stylistic preference:{" "}
          <code className="text-[12px]">CUSTOMER_ID</code> is an empty string and never NULL, so a plain
          count returns 100.00% on a column that is entirely blank. Three tests run per month — coverage,
          the share of scans sitting on the single most frequent id (bar: 10%), and the month-on-month
          change in distinct ids against flat order volume (bar: 40%).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-[11px] tracking-wide text-ink-secondary uppercase">
                <th className="py-1.5 pr-3 text-left font-medium">Month</th>
                <th className="px-2 py-1.5 text-right font-medium">Orders</th>
                <th className="px-2 py-1.5 text-right font-medium">With member id</th>
                <th className="px-2 py-1.5 text-right font-medium">Coverage</th>
                <th className="px-2 py-1.5 text-right font-medium">Distinct members</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.coverage.map((m) => {
                const inWindow = m.month >= grading.from && m.month <= grading.to;
                return (
                  <tr key={m.month} className="border-b border-line last:border-b-0" style={inWindow ? undefined : { opacity: 0.55 }}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">{monthLabel(m.month)}</th>
                    <td className="tnum px-2 py-1.5 text-right text-ink-secondary">{count(m.orders)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink-secondary">{count(m.withMember)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink">{pct(m.coverage, 2)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink-secondary">{count(m.distinctMembers)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">
          Dimmed months sit outside the unbroken run and are not used. The full reproduction, including the
          estate-wide comparison and where it differs from the figures this build was specified against, is
          in <code className="text-[11px]">docs/build-log/10-member-grading.md</code>.
        </p>
      </Disclosure>
    </div>
  );
}

/**
 * The survival curve, right-censored.
 *
 * Each point pools only the cohorts the window has actually followed that far,
 * so the denominator shrinks as the curve runs right. The point where it starts
 * shrinking is drawn, because past it the curve is describing a different and
 * progressively older population rather than a longer relationship.
 */
function SurvivalCurve({ cohorts }: { cohorts: Cohorts }) {
  const pts = cohorts.survival;
  if (pts.length < 3) return null;

  const W = 640, H = 220, PAD = { top: 14, right: 16, bottom: 30, left: 44 };
  const pw = W - PAD.left - PAD.right, ph = H - PAD.top - PAD.bottom;
  const maxK = Math.max(...pts.map((p) => p.monthsSince), 1);
  const x = (k: number) => PAD.left + (k / maxK) * pw;
  const y = (s: number) => PAD.top + ph - s * ph;

  const full = pts[0].cohortsObserved;
  const censorAt = pts.find((p) => p.cohortsObserved < full)?.monthsSince ?? null;

  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.monthsSince).toFixed(1)} ${y(p.s).toFixed(1)}`).join(" ");

  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <h3 className="text-[14px] font-semibold text-ink">Survival curve — members only</h3>
        <p className="mt-0.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
          The share of a cohort still active k months after joining, pooled across every cohort the window
          has followed that far. Right-censored: the denominator shrinks as the curve runs right, and where
          it starts shrinking is marked.
        </p>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px]" role="img"
        aria-label={`Member survival curve from ${pct(pts[0].s, 0)} at month zero to ${pct(pts.at(-1)!.s, 0)} at month ${maxK}.`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + pw} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10}
              fill="var(--ink-muted)" className="tnum">{pct(t, 0)}</text>
          </g>
        ))}
        {censorAt !== null && (
          <g>
            <line x1={x(censorAt)} x2={x(censorAt)} y1={PAD.top} y2={PAD.top + ph}
              stroke="var(--critical)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x(censorAt) + 5} y={PAD.top + 10} fontSize={10} fill="var(--critical)">
              censoring begins
            </text>
          </g>
        )}
        <path d={d} fill="none" stroke="var(--tier-member)" strokeWidth={2} />
        {pts.map((p) => (
          <circle key={p.monthsSince} cx={x(p.monthsSince)} cy={y(p.s)} r={2.5} fill="var(--tier-member)" />
        ))}
        {pts.filter((_, i) => i % 3 === 0).map((p) => (
          <text key={p.monthsSince} x={x(p.monthsSince)} y={H - 12} textAnchor="middle" fontSize={10}
            fill="var(--ink-muted)" className="tnum">{p.monthsSince}</text>
        ))}
        <text x={PAD.left + pw / 2} y={H - 1} textAnchor="middle" fontSize={10} fill="var(--ink-secondary)">
          months since first scan
        </text>
      </svg>
      <p className="mt-1.5 max-w-[100ch] text-[11px] leading-relaxed text-ink-muted">
        {censorAt === null
          ? "Every cohort is observed across the whole curve."
          : `Left of the marker all ${full} cohorts contribute. Right of it the pool thins to ${pts.at(-1)!.cohortsObserved} — so the tail describes the oldest cohorts rather than a longer relationship, and it is not comparable with the head.`}
      </p>
    </figure>
  );
}

/**
 * The inter-visit gap, as a distribution.
 *
 * "Usual gap 1 day" is a median standing in for a distribution, and the spread
 * is what says whether a cadence is a habit or the average of two behaviours.
 * A mean over a bimodal gap distribution describes nobody in it.
 */
function GapDistribution({ cohorts }: { cohorts: Cohorts }) {
  const hist = cohorts.gapHistogram;
  if (!hist.length) return null;

  // Log-spaced buckets: the mass sits under a week and the tail runs to a year,
  // so equal-width buckets would be twenty empty columns after one tall one.
  const edges = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365];
  const buckets = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    return {
      lo, hi,
      label: hi - lo === 1 ? `${lo}` : `${lo}–${hi - 1}`,
      n: hist.filter((h) => h.days >= lo && h.days < hi).reduce((a, h) => a + h.n, 0),
    };
  });
  const total = buckets.reduce((a, b) => a + b.n, 0) || 1;
  const max = Math.max(...buckets.map((b) => b.n), 1);

  // The median, read off the cumulative distribution rather than assumed.
  let cum = 0;
  let median = 0;
  for (const h of [...hist].sort((a, b) => a.days - b.days)) {
    cum += h.n;
    if (cum >= total / 2) { median = h.days; break; }
  }

  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <h3 className="text-[14px] font-semibold text-ink">
          The gap between visits — members only
        </h3>
        <p className="mt-0.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
          {count(total)} gaps between consecutive member visits. Median{" "}
          <strong className="text-ink">{plural(median, "day")}</strong>. Shown as a distribution rather than
          a mean, because the shape is the answer: a single number here would describe a habit and an
          occasional return as if they were the same behaviour. Buckets widen with distance and gaps beyond{" "}
          {cohorts.gapCapDays} days are not counted.
        </p>
      </figcaption>
      <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
        {buckets.map((b) => (
          <div key={b.lo} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t-[2px]"
              style={{
                height: `${(b.n / max) * 96}px`,
                background: b.lo <= median && median < b.hi ? "var(--accent)" : "var(--tier-member)",
                opacity: b.lo <= median && median < b.hi ? 1 : 0.75,
              }}
              aria-label={`${b.label} days: ${count(b.n)} gaps, ${pct(b.n / total, 1)}`}
            />
            <span className="tnum text-[9px] whitespace-nowrap text-ink-muted">{b.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted">
        Days between visits. The highlighted bucket contains the median.
      </p>
    </figure>
  );
}

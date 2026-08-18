import { EmptyState } from "@/components/ui/Primitives";
import { count, monthLabel, pct } from "@/lib/metrics";
import type { Cohorts } from "@/lib/types";

/**
 * §6.5. The member cohort lens — one chart, and one thing it will not say.
 *
 * ── What was here, and why four charts became one ─────────────────────────
 *
 * This section shipped a cohort retention triangle, average tenure by cohort as
 * horizontal bars, a right-censored survival curve, and an inter-visit gap
 * distribution. Every one of them was correct. Together they were the wrong
 * section, for a reason worth writing down: **they were built for somebody
 * checking the analysis, and read by somebody running a cafe.**
 *
 * A retention triangle is the standard object in this space and it is genuinely
 * hard to read — twenty-one rows of stepped percentages with a censor boundary
 * running diagonally through them, where the reader has to hold "row is when
 * they joined, column is months after that, and the diagonal is today" in their
 * head before a single number means anything. A survival curve asks a hospitality
 * owner to reason about a pooled denominator that shrinks as the line runs right.
 * Neither is wrong. Both spend the reader's attention on the method.
 *
 * ── What replaced them ─────────────────────────────────────────────────────
 *
 * One stacked burn-down on **calendar time**, which is the axis an operator
 * already thinks in. Each band is the cohort that joined in a given month, and
 * the band's thickness at any point is how many of them were still coming that
 * month. New cohorts stack on top as they join; every band below thins as people
 * stop coming. The whole question — *did the people I signed up keep coming, and
 * is the base growing or churning underneath me* — is the shape of the stack.
 *
 * **Right-censoring disappears, and that is not a trick.** The triangle needed a
 * censor boundary because its x-axis was months-since-joining, so the right-hand
 * columns could only be read for cohorts old enough to have reached them. On
 * calendar time every cohort is observed in every month it exists, up to the same
 * window close. There is nothing to censor because nothing is being compared
 * across different amounts of elapsed time. What that costs is the cohort-to-
 * cohort comparison the triangle made, which is the comparison this build refuses
 * to publish anyway — see the panel at the foot.
 *
 * ── Members only, in the title, still ──────────────────────────────────────
 *
 * Unchanged and load-bearing. Coverage is roughly 19% of orders and this is a
 * heavily self-selected group — this build's own analysis puts about 97% of the
 * member value gap down to selection rather than effect. Labelled loosely, this
 * chart launders a selected sample into a general one. `member.tierScopeDeclared`
 * fails the build if a member figure renders without its scope.
 */

const BAND_MIN_MEMBERS = 0;

export function CohortLens({ cohorts }: { cohorts: Cohorts }) {
  const { grading } = cohorts;
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

  return (
    <div className="flex flex-col gap-6">
      {/* ── what the window actually covers, stated before the chart ────────
          The member record starts when loyalty scanning starts, not when the
          business started, and it grows a month every month. An owner who has
          traded for six years and meets a retention chart that opens in
          November 2024 needs to be told which of those two facts they are
          looking at *before* they read it, not in a footnote after. */}
      <div className="rounded-lg border border-line bg-surface-sunken px-4 py-3">
        <p className="text-[13px] leading-relaxed text-ink">
          <strong>
            Member data is available from {monthLabel(cohorts.window.start)}
          </strong>{" "}
          — {count(grading.days)} days, {rows.length} monthly cohorts, to{" "}
          {monthLabel(cohorts.window.end)}.
        </p>
        <p className="mt-1.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
          This is the earliest month whose loyalty scanning passes grading, not the month the business
          started. <strong className="text-ink-secondary">It grows by a month every month</strong>, so this
          chart gets longer and the claims it can carry get stronger with time. The next one it unlocks is a
          twenty-four month trend floor.
        </p>
      </div>

      <BurnDown cohorts={cohorts} />

      {/* ── rule 3: the trend that is not published ─────────────────────────
          Stated, not struck. A strikethrough is a deletion mark: it makes a
          reader wonder what the sentence said instead of reading why there
          isn't one. */}
      <div className="rounded-lg border border-dashed px-4 py-3.5" style={{ borderColor: "var(--warning)" }}>
        <h3 className="text-[14px] font-semibold text-ink">
          What we cannot yet tell you: whether retention is improving
        </h3>
        <p className="mt-1.5 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
          This is the question the section exists to answer eventually, and the honest answer today is that
          the data cannot separate it from a second thing moving at the same time. Six-month survival does
          fall across the run. So does the meaning of the word &quot;member&quot;: scan coverage rose from{" "}
          {pct(cohorts.coverage.find((c) => c.month >= cohorts.window.start)?.coverage ?? 0, 1)} to{" "}
          {pct(cohorts.coverage.at(-1)?.coverage ?? 0, 1)} of orders over the same period, so later cohorts
          include marginal members the early ones never captured at all. A cohort that only enrolled its most
          committed guests will always out-survive one that enrolled everybody.
        </p>
        <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
          The same confound sits underneath the chart above, and it is worth naming there too:{" "}
          <strong className="text-ink">the stack grows partly because the programme grew</strong>. What the
          chart can be read for is composition and shape — whether a cohort thins fast or holds, and how much
          of today&apos;s active base came from which intake. What it cannot be read for is a rate improving.
        </p>
        <p className="mt-2 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">
          Separating them needs a coverage-matched comparison, which is not in this build. Until then no
          trend line is drawn, because a trend line here would be read as a programme getting worse when it
          is at least partly a programme getting broader.
        </p>
      </div>
    </div>
  );
}

/**
 * The burn-down.
 *
 * Bands are stacked oldest-first from the bottom, so a reader's eye follows one
 * cohort left to right along the bottom of the stack while newer intakes pile on
 * above it. Stacking newest-first would put every cohort on a moving baseline and
 * make thinning impossible to see, which is the one thing the chart is for.
 */
function BurnDown({ cohorts }: { cohorts: Cohorts }) {
  const rows = cohorts.cohorts.filter((r) => r.members > BAND_MIN_MEMBERS);
  if (rows.length < 2) return null;

  const addMonths = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  };

  // Every calendar month the window covers, in order.
  const months: string[] = [];
  for (let i = 0; ; i++) {
    const m = addMonths(cohorts.window.start, i);
    if (m > cohorts.window.end) break;
    months.push(m);
  }

  // active[cohortIndex][monthIndex]. Absent means the cohort does not exist yet,
  // which is a structural zero — nobody had joined — rather than a missing
  // reading, so it is drawn as zero rather than left as a hole.
  const active = rows.map((r) =>
    months.map((m) => {
      if (m < r.cohort) return 0;
      const k = months.indexOf(m) - months.indexOf(r.cohort);
      return cohorts.triangle.find((t) => t.cohort === r.cohort && t.monthsSince === k)?.active ?? 0;
    }),
  );

  const totals = months.map((_, mi) => active.reduce((a, band) => a + band[mi], 0));
  const max = Math.max(...totals, 1);

  const W = 760, H = 300;
  const PAD = { top: 12, right: 14, bottom: 34, left: 48 };
  const pw = W - PAD.left - PAD.right, ph = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (months.length === 1 ? 0 : (i / (months.length - 1)) * pw);
  const y = (v: number) => PAD.top + ph - (v / max) * ph;

  // Cumulative upper edge per band, so each area is drawn between its own
  // baseline and the one below it.
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

  // Oldest cohorts darkest. One hue, because these are ordered categories of the
  // same kind — a rainbow across twenty-one bands would read as twenty-one
  // unrelated things and could not be told apart anyway.
  const shade = (bi: number) => {
    const t = rows.length === 1 ? 1 : 1 - bi / (rows.length - 1);
    return `color-mix(in srgb, var(--tier-member) ${(0.22 + t * 0.78) * 100}%, transparent)`;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const labelEvery = Math.ceil(months.length / 8);
  const first = totals[0];
  const last = totals.at(-1)!;
  const oldest = rows[0];
  const oldestLast = active[0].at(-1)!;

  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <h3 className="text-[14px] font-semibold text-ink">
          How many of each intake are still coming — members only
        </h3>
        <p className="mt-0.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
          Every band is the members who first scanned in one month. Its thickness is how many of them were
          still visiting in that later month, so a band that narrows is an intake burning down and a band
          that holds its width is one that stuck. New intakes stack on top.{" "}
          <strong className="text-ink">Read the bottom band left to right</strong> to follow the oldest group
          you have. {count(rows.reduce((a, r) => a + r.members, 0))} members across {rows.length} monthly
          intakes · loyalty scan, not payment card.
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[560px]"
          role="img"
          aria-label={`Stacked burn-down of member intakes. ${count(first)} members active in ${monthLabel(months[0])}, rising to ${count(last)} in ${monthLabel(months.at(-1)!)} across ${rows.length} intakes.`}
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
            i % labelEvery === 0 || i === months.length - 1 ? (
              <text
                key={m} x={x(i)} y={H - 14} textAnchor="middle" fontSize={10}
                fill="var(--ink-muted)" className="tnum"
              >
                {monthLabel(m)}
              </text>
            ) : null,
          )}
          <text x={PAD.left + pw / 2} y={H - 1} textAnchor="middle" fontSize={10} fill="var(--ink-secondary)">
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
        <span>Darker is older. One hue, because these are the same thing at different ages.</span>
      </p>

      <p className="mt-2 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
        The {monthLabel(oldest.cohort)} intake signed up {count(oldest.members)} people and{" "}
        <strong className="text-ink">{count(oldestLast)} of them</strong> were still coming{" "}
        {oldest.observableMonths} months later — {pct(oldestLast / Math.max(oldest.members, 1), 0)}. Across
        every intake the active base went from {count(first)} to {count(last)}.{" "}
        <strong className="text-ink">
          That growth is enrolment outrunning churn, not retention improving
        </strong>{" "}
        — the two are separable only with a coverage-matched comparison, which is the refusal below.
      </p>
    </figure>
  );
}

/**
 * Card-capture grading. One definition, used by both the tenant selection
 * (CI-023) and the extract itself.
 *
 * It is deliberately one module. A selection made on a different rule than the
 * load applies would pick a partner the load then rejects, and that is precisely
 * the class of mistake this build exists to make impossible.
 *
 * ── Why a row count is not a grading ───────────────────────────────────────
 *
 * `PAYMENT_ACCOUNT_REFERENCE` is never NULL. At Coffee Guru it ran correctly,
 * then for ten months returned a **single constant value across 403,600
 * transactions** — present, non-null, and worthless. Every `COUNT(reference)`
 * coverage test scored those months at 100%. The test that catches it is the
 * share of a month's carded transactions sitting on its single most frequent
 * reference: healthy months top out at 3.6%, broken ones start at 50.8%.
 *
 * This is the same class of error as `CUSTOMER_ID`, which is an empty string
 * rather than NULL, so `COUNT(CUSTOMER_ID)` returns 100.00% where the correct
 * test returns 14.41%. **A populated field is not a covered field.**
 *
 * ── The placeholder ────────────────────────────────────────────────────────
 *
 * Measured 16 August 2026 across the whole acquirer feed: the dominant token is
 * the **literal string `'N/A'`**, on 215,900,912 rows since June 2023. It is the
 * only reference value shorter than 20 characters in the entire table; every
 * real reference is a 28-or-29-character acquirer token.
 *
 * This is the origin of the "PAR present on 82.87% of 405,116,084 rows back to
 * April 2022, 97.9% median per-store recognition" figure that CI-023 was written
 * on. That figure is a non-null count, and most of what it counts is the string
 * `'N/A'`. Treating the placeholder as a card is what collapses a month onto one
 * phantom person, so it is nulled at the source in every query, and the share of
 * transactions carrying a *real* reference is published as coverage.
 */

/**
 * Reference values that are present, non-null, and not a card.
 *
 * Extend this list rather than adding a WHERE clause somewhere: the whole point
 * is that there is one definition of "this is a card" and every query reads it.
 */
export const PAR_PLACEHOLDERS = ["N/A"] as const;

/**
 * SQL that normalises a reference column to NULL unless it is a real card token.
 *
 * Both conditions are applied although either alone would do today, because they
 * fail differently: the placeholder list catches a known value, the length guard
 * catches the next placeholder somebody introduces.
 */
export function realParSql(col: string): string {
  const list = PAR_PLACEHOLDERS.map((p) => `'${p}'`).join(", ");
  return `IFF(TRIM(${col}) IN ('', ${list}) OR LENGTH(TRIM(${col})) < 20, NULL, TRIM(${col}))`;
}

/**
 * A card population never concentrates a tenth of a month's volume on one
 * reference. Calibrated against the observed separation rather than picked:
 * healthy months top out at 3.6% and broken months start at 50.8%, so anything
 * between separates them. The review's 1% is right for estate-wide volumes and
 * wrong for a two-venue merchant, where one twice-weekly regular clears it.
 */
export const MAX_TOKEN_SHARE = 0.1;

/** Distinct references per transaction. Below this the reference is not per-card. */
export const MIN_DISTINCT_RATIO = 0.1;

/** A month's card volume this far below the merchant's own median is a feed gap. */
export const MIN_VOLUME_SHARE_OF_MEDIAN = 0.3;

/** Fewer distinct references than this is not a degraded feed, it is no feed. */
export const MIN_DISTINCT_PAR = 3;

/**
 * The share of a month's transactions that must carry a real card reference.
 *
 * Partial coverage is not corruption, and the distinction is the whole finding.
 * Between July 2023 and April 2025 the estate ran at 27–65% coverage with
 * excellent quality among the covered rows — one token holding 0.005% to 0.024%,
 * two orders of magnitude inside the corruption bar. Those months are usable and
 * the first pass of this grading threw them away.
 *
 * Twenty per cent is the floor because identity is recovered with probability
 * `1 − (1 − p)^v` for a guest with v visits: at p = 0.2 a three-visit regular is
 * seen 49% of the time and a ten-visit regular 89%, which is enough to measure a
 * repeat population as long as the correction is applied and its size published.
 * Below that the single-visit tier is almost entirely invisible and no correction
 * rescues it. The build already carries this correction for scan rate; card
 * coverage is the same estimator with a different p.
 */
export const MIN_COVERAGE = 0.2;

export type GradeReason =
  | "not trading"
  | "payments incomplete"
  | "no card capture"
  | "one token dominates"
  | "degraded card capture"
  | "card capture partial";

export type MonthInput = {
  month: string;
  txns: number;
  distinctPar: number;
  withPar: number;
  maxTokenShare: number;
  orders: number;
  scannedOrders?: number;
  stores?: number;
  medianTxns: number;
};

export type MonthRow = {
  month: string;
  txns: number;
  orders: number;
  scannedOrders: number;
  stores: number;
  distinctPar: number;
  withPar: number;
  /** Distinct references per transaction carrying one. */
  ratio: number;
  /** Share of transactions carrying a real reference at all. */
  coverage: number;
  /** Share of the month's *real* references sitting on the most frequent one. */
  maxTokenShare: number;
  ok: boolean;
  reason: GradeReason | null;
};

/**
 * Grade one merchant-month.
 *
 * The order of the tests matters, and each one exists because a real month
 * failed it in a way the others missed.
 *
 *   not trading           the venue was not open. Told apart from a feed failure
 *                         first, because conflating the two is what turned
 *                         "12 of 25 months available" into an honest 4.
 *   payments incomplete   card volume collapsed against the merchant's own
 *                         median. The feed, not the trade.
 *   no card capture       almost no distinct references. The 2025 blackout:
 *                         14 to 37 real references across the entire estate
 *                         per month, on 13-18M transactions.
 *   one token dominates   references vary, but one holds ≥10%. The failure a
 *                         non-null count cannot see.
 *   degraded card capture references are not per-card — the same handful
 *                         recycled across a covered population.
 *   card capture partial  the references are real and clean, but too few
 *                         transactions carry one to recover a population.
 *
 * `coverage` and `ratio` are deliberately separate. A month at 33% coverage
 * whose covered rows are impeccable is usable with a correction; a month at 95%
 * coverage whose references are three recycled tokens is not usable at all.
 */
export function gradeMonth(m: MonthInput): MonthRow {
  const ratio = m.withPar ? Number((m.distinctPar / m.withPar).toFixed(4)) : 0;
  const coverage = m.txns ? Number((m.withPar / m.txns).toFixed(4)) : 0;
  const reason: GradeReason | null =
    m.orders === 0
      ? "not trading"
      : m.txns < m.medianTxns * MIN_VOLUME_SHARE_OF_MEDIAN
        ? "payments incomplete"
        : m.distinctPar <= MIN_DISTINCT_PAR
          ? "no card capture"
          : m.maxTokenShare >= MAX_TOKEN_SHARE
            ? "one token dominates"
            : ratio < MIN_DISTINCT_RATIO
              ? "degraded card capture"
              : coverage < MIN_COVERAGE
                ? "card capture partial"
                : null;

  return {
    month: m.month,
    txns: m.txns,
    orders: m.orders,
    scannedOrders: m.scannedOrders ?? 0,
    stores: m.stores ?? 0,
    distinctPar: m.distinctPar,
    withPar: m.withPar,
    ratio,
    coverage,
    maxTokenShare: m.maxTokenShare,
    ok: reason === null,
    reason,
  };
}

/**
 * The longest unbroken run of trustworthy months.
 *
 * Contiguous in calendar time, not merely consecutive in the array: a merchant
 * with a clean January and a clean March has two runs of one, not one run of
 * two. `not trading` months break a run like any other failure, because a
 * merchant that closed for six months cannot support a year-on-year comparison
 * across the gap either.
 */
export function longestRun(months: MonthRow[]): { start: string; end: string; months: number } | null {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const next = (m: string) => {
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  };

  let best: { start: string; end: string; months: number } | null = null;
  let runStart: string | null = null;
  let prev: string | null = null;

  for (const m of sorted) {
    if (!m.ok) {
      runStart = null;
      prev = null;
      continue;
    }
    if (runStart === null || prev === null || m.month !== next(prev)) runStart = m.month;
    prev = m.month;
    const count = monthsBetween(runStart, m.month);
    if (!best || count > best.months) best = { start: runStart, end: m.month, months: count };
  }
  return best;
}

/**
 * **Every** unbroken run of trustworthy months, most recent first — not just the
 * latest one.
 *
 * The product reported on the latest run because that is the one that describes
 * trade today. But Coffee Guru holds nine usable months in three separate runs,
 * and reporting on three of them while silently discarding six is the same class
 * of omission this build exists to prevent: the operator cannot ask a question
 * about a period they are not told exists.
 *
 * Each run becomes a selectable period. The gaps between them become the list of
 * periods that are *not* selectable, each with the reason — which is the more
 * useful half, because a merchant who can see "May–Dec 2025: no card capture"
 * has something to escalate.
 */
export function allRuns(months: MonthRow[]): { start: string; end: string; months: number }[] {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const next = (m: string) => {
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  };

  const runs: { start: string; end: string; months: number }[] = [];
  let start: string | null = null;
  let prev: string | null = null;

  const close = () => {
    if (start && prev) runs.push({ start, end: prev, months: monthsBetween(start, prev) });
    start = null;
    prev = null;
  };

  for (const m of sorted) {
    if (!m.ok) {
      close();
      continue;
    }
    if (start === null || prev === null || m.month !== next(prev)) {
      close();
      start = m.month;
    }
    prev = m.month;
  }
  close();

  return runs.reverse();
}

/** Inclusive month count. Thirteen months is one year-on-year comparison, not twelve. */
export function monthsBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
}

/**
 * What a window of this length entitles the surface to claim. **R-205.**
 *
 * Thirteen months is the floor for a growth claim because a year-on-year
 * comparison needs month M and month M−12, which is thirteen months inclusive —
 * twelve yields zero comparisons. Twenty-four is the floor for a trend claim,
 * because "growth is waning" needs three or more comparisons and thirteen months
 * gives exactly one.
 */
export type ClaimLevel = "none" | "growth" | "trend";

export function claimLevel(months: number): ClaimLevel {
  if (months >= 24) return "trend";
  if (months >= 13) return "growth";
  return "none";
}

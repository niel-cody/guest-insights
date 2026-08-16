/**
 * Selectable periods, and the periods that do not exist.
 *
 * ── Why this is not a date picker ──────────────────────────────────────────
 *
 * A free date range would let an operator select May to December 2025 and read
 * a report. There is no identity in those months — the Payment Account
 * Reference across the whole estate was 14 to 37 distinct values per month
 * against 13 to 18 million transactions — so the report would be a picture of
 * nobody, drawn confidently. Ninety days was never a product decision; it was
 * the length of the only unbroken run of trustworthy months.
 *
 * So the control offers **the runs that exist**, and publishes the stretches
 * that do not with the reason each one is missing. That second half is the more
 * useful one: a merchant who can see "May–Dec 2025 · no card capture" has
 * something to escalate, where a greyed-out calendar reads as a product
 * limitation and gets escalated at us instead.
 *
 * The period is a route segment rather than a filter, because it changes every
 * figure on the page and because it keeps the whole build statically generated —
 * which is what lets this deploy with no environment variable, no key and no
 * runtime call.
 */
import type { ClaimLevel } from "./types";

export type Period = {
  /** `2026-05_2026-07`. Stable, sortable, readable in a URL. */
  id: string;
  start: string;
  end: string;
  months: number;
  claim: ClaimLevel;
};

export type PeriodGap = {
  start: string;
  end: string;
  months: number;
  reason: string;
};

export type Periods = {
  slug: string;
  name: string;
  /** Most recent first. The first entry is what the product opens on. */
  periods: Period[];
  gaps: PeriodGap[];
  monthsTested: number;
  monthsUsable: number;
  gradedAt: string;
};

/**
 * Plain English for a grading verdict, for the reader who has to act on it.
 *
 * The grading's own vocabulary is precise and useless to an operator: "one token
 * dominates" describes the test, not the consequence. These describe the
 * consequence, and each one names who can do something about it.
 */
export const GAP_EXPLANATION: Record<string, { what: string; who: string }> = {
  "not trading": {
    what: "The venue had not opened yet. Not a data problem.",
    who: "Nobody — this is a business fact and it is here so it is not counted as a failure.",
  },
  "payments incomplete": {
    what: "The card feed carried a fraction of the month's transactions while the tills recorded a normal month.",
    who: "Platform — the acquirer feed, not the venue.",
  },
  "no card capture": {
    what: "Card references were absent estate-wide, so no payment can be attached to a person.",
    who: "Platform — CI-028. This is the May–December 2025 blackout.",
  },
  "one token dominates": {
    what: "References were present but one value covered a tenth or more of the month's card volume, so they do not identify individual cards.",
    who: "Platform — CI-028.",
  },
  "degraded card capture": {
    what: "The same handful of references repeated across the month rather than one per card.",
    who: "Platform — CI-028.",
  },
  "card capture partial": {
    what: "References were genuine but too few transactions carried one to recover a population.",
    who: "Platform — CI-028. Recovering coverage here would open the period.",
  },
};

export function explainGap(reason: string): { what: string; who: string } {
  return (
    GAP_EXPLANATION[reason] ?? {
      what: "This period did not pass the card-capture grading.",
      who: "Platform.",
    }
  );
}

/** The period a URL names, or the default. Never throws on a stale link. */
export function resolvePeriod(all: Periods, id: string | undefined): Period {
  return all.periods.find((p) => p.id === id) ?? all.periods[0];
}

/**
 * How far apart two periods are, in months, for the comparison affordance.
 *
 * Returns null where the two do not sit a whole number of months apart, which
 * cannot happen with month-aligned runs but keeps the caller honest.
 */
export function monthsApart(a: Period, b: Period): number {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  return (
    (d(b.start).getUTCFullYear() - d(a.start).getUTCFullYear()) * 12 +
    (d(b.start).getUTCMonth() - d(a.start).getUTCMonth())
  );
}

/**
 * Whether two periods are twelve months apart, and therefore comparable
 * year-on-year.
 *
 * Published because it is almost always false here, and the reason it is false
 * is the finding: the 2025 blackout sits exactly where the comparison months
 * would be.
 */
export function isYearOnYear(a: Period, b: Period): boolean {
  return Math.abs(monthsApart(a, b)) === 12;
}

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

/**
 * The previous readable period, and how far away it actually is.
 *
 * ── This is the whole reason "vs previous period" is not a free column ─────
 *
 * `periods` is one entry per unbroken run of trustworthy card months, newest
 * first. **Consecutive entries are not consecutive quarters.** At Coffee Guru
 * the current window opens May 2026 and the previous readable run ends April
 * 2025 — thirteen months earlier, because every month between them failed card
 * capture and is not in the snapshot at all.
 *
 * A change column computed across that and labelled "previous period" is a lie
 * of exactly the kind this build exists to refuse: it reads as one quarter of
 * movement and it is a year of it, most of which happened where nothing was
 * measured. So the gap comes back with the period and every surface that draws
 * a comparison is obliged to state it.
 *
 * Returns null where there is no earlier run, which is the Meat Flour Wine case
 * — one period, and therefore no comparison offered rather than an empty one.
 */
export function previousReadable(
  all: Periods,
  id: string,
): { period: Period; gapMonths: number; label: string; adjacent: boolean } | null {
  const i = all.periods.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const current = all.periods[i];
  // Newest first, so the next entry along is the previous run.
  const prev = all.periods[i + 1];
  if (!prev) return null;

  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const gapMonths =
    (d(current.start).getUTCFullYear() - d(prev.end).getUTCFullYear()) * 12 +
    (d(current.start).getUTCMonth() - d(prev.end).getUTCMonth());

  return {
    period: prev,
    gapMonths,
    label: `${monthName(prev.start)} – ${monthName(prev.end)}`,
    // A run that ends the month before this one opens is a true previous period.
    adjacent: gapMonths <= 1,
  };
}

function monthName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
}

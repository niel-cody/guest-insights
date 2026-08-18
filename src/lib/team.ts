/**
 * The team vocabulary, in one place.
 *
 * Verdict labels, the eligibility floor, and the two aggregations that more than
 * one surface needs. Everything here is shared by the pages *and* by the check
 * register, which is deliberate: a check that recomputes a figure its own way is
 * asserting against a second implementation rather than against the one on
 * screen, and the two drift.
 */
import type { Team, TeamMarginCell, TeamPerson, TeamVerdict } from "./types";

export const VERDICT_LABEL: Record<TeamVerdict, string> = {
  confirmed: "Confirmed",
  proposed: "Proposed",
  conflict: "Conflict",
  collision: "Collision",
  unmatched: "Unmatched",
  "not-a-person": "Not a person",
};

/**
 * The tone each verdict carries.
 *
 * A proposal is `warning` and not `good`, and that is the most important line in
 * this file. Twenty-four of Meat Flour Wine's thirty-five matches are proposals;
 * colouring them green would make a screen that is two-thirds unverified read as
 * a screen that is done.
 */
export const VERDICT_TONE: Record<TeamVerdict, "good" | "warning" | "critical" | "neutral"> = {
  confirmed: "good",
  proposed: "warning",
  conflict: "critical",
  collision: "critical",
  unmatched: "neutral",
  "not-a-person": "neutral",
};

export const VERDICT_MEANING: Record<TeamVerdict, string> = {
  confirmed:
    "Both systems agree on more than a first name — the surname matches, or the whole string does. Safe to cost.",
  proposed:
    "One employee at this venue carries this first name and nothing contradicts it. A good bet, not a proof. It is costed, and it is marked.",
  conflict:
    "The first name agrees and the surname evidence does not. Most likely two different people. Nothing is costed against it.",
  collision:
    "Two POS logins resolve to one employee. Either one person with two logins, or two people the roll cannot separate. Nothing is costed against it.",
  unmatched:
    "No employee on the current roll fits. Usually a leaver — the vendor sync keeps only active staff, so anyone who left during the window is unmatchable by construction.",
  "not-a-person":
    "A shared login, a device or a system account. Its trade is real and counted; its performance is nobody's.",
};

/**
 * The evidence floor for putting a person on a league table.
 *
 * Fifty orders, over at least five days. Both, because either alone is gameable
 * by the shape of a roster: fifty orders on one enormous Saturday is a single
 * observation of a single shift, and five days of two orders each is not a
 * measurement of anything. FairShift's published floors are `orders ≥ 50` and
 * `shifts ≥ 3`; this is that, with the shift count read off distinct trading
 * days because a POS shift is a till session and not a person's shift.
 *
 * Anyone below it is shown as **unrated**, never as a low score. A new starter
 * ranked last on four shifts is a report telling a manager something false about
 * somebody's job.
 */
export const MIN_ORDERS_FOR_RATING = 50;
export const MIN_DAYS_FOR_RATING = 5;

export function rateable(p: TeamPerson): boolean {
  return p.orders >= MIN_ORDERS_FOR_RATING && p.days >= MIN_DAYS_FOR_RATING;
}

/** People who rang trade and can be compared to one another. */
export function ratedPeople(team: Team): TeamPerson[] {
  return team.people.filter((p) => p.verdict !== "not-a-person" && rateable(p));
}

/**
 * Sum a set of margin cells the way the ratios must be recomputed.
 *
 * **A wage percentage is not the average of wage percentages.** Summing the two
 * sides and dividing once is the only correct roll-up, and writing it here once
 * stops a surface averaging a column because the column was right there.
 */
export function totalCells(cells: TeamMarginCell[]): {
  net: number; labour: number; hours: number; covers: number; orders: number;
  penaltyCost: number; penaltyHours: number; plannedLabour: number | null;
  wagePct: number | null; margin: number; netPerHour: number | null;
} {
  const sum = (f: (c: TeamMarginCell) => number) => cells.reduce((a, c) => a + f(c), 0);
  const net = sum((c) => c.net);
  const labour = sum((c) => c.labour);
  const hours = sum((c) => c.hours);
  const planned = cells.some((c) => c.plannedLabour != null)
    ? sum((c) => c.plannedLabour ?? 0)
    : null;
  return {
    net, labour, hours,
    covers: sum((c) => c.covers),
    orders: sum((c) => c.orders),
    penaltyCost: sum((c) => c.penaltyCost),
    penaltyHours: sum((c) => c.penaltyHours),
    plannedLabour: planned,
    wagePct: net > 0 ? labour / net : null,
    margin: net - labour,
    netPerHour: hours > 0 ? net / hours : null,
  };
}

/**
 * Cells for one venue, or the pre-computed roll-up across all of them.
 *
 * Generic over the cell, because the two-key grains carry their own dimensions
 * (`dow`, `service`) and a filter that widened them back to the base type would
 * make the caller reach for a cast — which is how a `dow` gets read off a grain
 * that has none.
 */
export const cellsFor = <C extends TeamMarginCell>(cells: C[], storeId: string): C[] =>
  cells.filter((c) => c.storeId === storeId);

/**
 * The decomposition, per the five levers.
 *
 * Revenue per cover is items per cover multiplied by average item value, and the
 * two terms are different jobs: one is attachment, the other is trading up. The
 * whole reason to publish the pair rather than the product is that **at Meat
 * Flour Wine only one of them varies** — average item value runs $24.08 to
 * $28.39 across the rated team while items per cover runs 2.36 to 4.38. A league
 * table on revenue per cover says Sam is better than Riley; this says Sam sells
 * more things to the same table, which is a sentence a manager can coach.
 */
export function spread(people: TeamPerson[], f: (p: TeamPerson) => number | null) {
  const vs = people.map(f).filter((v): v is number => v != null && Number.isFinite(v));
  if (!vs.length) return null;
  const sorted = [...vs].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  return { lo, hi, median, ratio: lo > 0 ? hi / lo : null, n: vs.length };
}

/** Where a wage percentage stops being a number and starts being a problem. */
export const WAGE_BANDS = [
  { max: 0.25, tone: "good" as const, label: "at or under 25%" },
  { max: 0.35, tone: "warning" as const, label: "25% to 35%" },
  { max: Infinity, tone: "critical" as const, label: "over 35%" },
];

export const wageBand = (pct: number | null) =>
  pct == null ? null : WAGE_BANDS.find((b) => pct <= b.max)!;

/**
 * Names that identify a till, a shared account or a training login.
 *
 * ── Why this lives here and not only in the extract ────────────────────────
 *
 * The extract classifies these and the check register asserts the
 * classification, and the two must not drift — a check that recomputes the rule
 * its own way is asserting against a second implementation. Keeping the pattern
 * in one place also makes the failure mode legible: if a venue invents a new
 * shared-login convention, this is the single line that has to learn it, and the
 * check will say so before the league table acquires a leader who does not
 * exist.
 */
export const SHARED_LOGIN = /^(|\(no name\)|trainee\b.*|qr tags?|unknown\b.*|oolio admin|meat wine|test\b.*|training\b.*|staff|counter|kiosk|online|pos \d*)$/i;

export const looksShared = (label: string) => SHARED_LOGIN.test(label.trim());

/**
 * The observation window, and what it entitles a surface to say.
 *
 * This file exists because of release blocker B1. The window is 92 days. The
 * calibrated lapse threshold is 89 days. A guest can therefore only be
 * classified Lost if they were last seen in the **first three days of the
 * window**, so the Lost series is near-zero by construction and the Net figure
 * beside it reads as retention performance. Every number involved was
 * arithmetically correct and the conclusion a reader drew from them was false.
 *
 * Two rules live here, and every surface reads them rather than restating them.
 *
 * **R-191.** No retention, churn, lapse or loss figure renders where the
 * observation window is shorter than twice the lapse threshold it depends on.
 * The surface states the constraint instead. Note *instead* — §9.1 offered
 * "state the scope on the chart face or pull the chart" and R-191 permits only
 * the second. A requirement in §8 is stricter than an option in §9.1 and wins.
 * Changing that is a Decision Register entry, not an engineering judgement.
 *
 * **R-205.** The surface states whether it is making a growth claim or a trend
 * claim, from the number of complete months actually loaded.
 *
 * Nothing here hardcodes 92 or 89. Both are properties of the loaded snapshot
 * and both move when the window moves — which is the entire point, because the
 * refusal is also the argument for fixing the data.
 */
import type { AnalysisWindow, ClaimLevel, Org } from "./types";
import { count, dayLabel } from "./metrics";

/**
 * The grading constants come from the module the extract and the tenant
 * selection both run, so the surface cannot state a floor the load did not
 * apply. `scripts/grade.ts` is pure — no warehouse, no Node built-ins — which is
 * what makes importing it here safe.
 */
export { MAX_TOKEN_SHARE, MIN_COVERAGE, MIN_DISTINCT_RATIO, claimLevel } from "../../scripts/grade";
import { claimLevel as claimLevelOf } from "../../scripts/grade";

/**
 * A figure's dependency on a calibrated threshold.
 *
 * A figure declares what it depends on; it does not decide whether it renders.
 * That separation is what stops a surface quietly opting itself out.
 */
export type ThresholdKind = "lapse" | "slipping";

export type WindowVerdict =
  | { renders: true; windowDays: number; thresholdDays: number; required: number }
  | {
      renders: false;
      windowDays: number;
      thresholdDays: number;
      required: number;
      /** The constraint, in the words the surface prints in place of the figure. */
      statement: string;
      /** The shortest form, for a table cell or a tile where prose will not fit. */
      short: string;
    };

/**
 * The rule: a threshold-dependent figure renders only where `W >= 2 × T`.
 *
 * Twice, because a lapse figure has to be able to observe both states. To say a
 * guest lapsed you need T days of silence, and to say they did *not* you need to
 * have watched them for T days before that. At W < 2T the two classes are not
 * symmetrically observable and the ratio between them is set by the window
 * rather than by the guests.
 */
/** "an 89-day", "a 56-day". A refusal that reads as a typo reads as carelessness. */
function article(n: number): string {
  return /^(8|11|18)/.test(String(n)) ? "an" : "a";
}

export function windowVerdict(
  w: AnalysisWindow,
  thresholdDays: number,
  kind: ThresholdKind = "lapse",
): WindowVerdict {
  const required = thresholdDays * 2;
  const windowDays = w.days;
  if (windowDays >= required) return { renders: true, windowDays, thresholdDays, required };

  const noun = kind === "lapse" ? "lapse" : "slipping";
  return {
    renders: false,
    windowDays,
    thresholdDays,
    required,
    statement:
      `Not published. This figure depends on ${article(thresholdDays)} ${thresholdDays}-day ${noun} ` +
      `threshold, and it can only be ` +
      `measured over a window at least twice that long — ${required} days. This snapshot holds ` +
      `${count(windowDays)}. A guest could only be counted as lost here if they were last seen in the ` +
      `first ${Math.max(windowDays - thresholdDays, 0)} days of it, so the figure would be set by the ` +
      `length of the window rather than by anybody's behaviour.`,
    short: `Needs ${required} days · window holds ${windowDays}`,
  };
}

/**
 * Both thresholds a snapshot carries, resolved against its own window.
 *
 * Read this once per surface rather than calling `windowVerdict` with a literal:
 * the thresholds are calibrated per organisation and the whole defect was a
 * number that had stopped matching the data behind it.
 */
export function windowRules(org: Org) {
  const cal = org.calibration;
  return {
    lapse: windowVerdict(org.window, cal.lapsedDays, "lapse"),
    slipping: windowVerdict(org.window, cal.slippingDays ?? cal.lapsedDays, "slipping"),
  };
}

// ── R-205: what the window entitles you to claim ────────────────────────────

export type { ClaimLevel } from "./types";

export type ClaimState = {
  level: ClaimLevel;
  months: number;
  /** The sentence the surface prints. Never omitted, including when it is good news. */
  statement: string;
  /** What is still out of reach, and how many months away it is. */
  next: string | null;
};

/**
 * Thirteen months is the floor for a growth claim, because a year-on-year
 * comparison needs month M and month M−12 — thirteen months inclusive. Twelve
 * yields zero comparisons, which is why the floor is not twelve.
 *
 * Twenty-four is the floor for a trend claim, because "growth is waning" needs
 * three or more comparisons and thirteen months gives exactly one.
 */
export function claimState(w: AnalysisWindow): ClaimState {
  const m = w.months;
  const level = claimLevelOf(m);
  if (level === "trend") {
    return {
      level: "trend",
      months: m,
      statement:
        `${m} complete months, so this surface can make a trend claim: it holds ${m - 12} ` +
        `year-on-year comparisons and can say whether growth is accelerating or waning.`,
      next: null,
    };
  }
  if (level === "growth") {
    return {
      level: "growth",
      months: m,
      statement:
        `${m} complete months, so this surface can make a growth claim — it holds ${m - 12} ` +
        `year-on-year comparison${m - 12 === 1 ? "" : "s"} — but not a trend claim. Whether growth is ` +
        `waning needs three comparisons and therefore 24 months.`,
      next: `${24 - m} more clean months for a trend claim`,
    };
  }
  return {
    level: "none",
    months: m,
    statement:
      `${m} complete month${m === 1 ? "" : "s"}. **This surface makes no growth claim and no trend claim.** ` +
      `A year-on-year comparison needs month M and month M−12, which is 13 months inclusive; ${m} months ` +
      `yields none. Nothing here should be read as an improvement or a decline against last year, because ` +
      `there is no last year in this data.`,
    next: `${13 - m} more clean months for a growth claim`,
  };
}

// ── C5: one window explanation, rendered wherever the window is stated ──────

export type WindowExplanation = {
  window: AnalysisWindow;
  claim: ClaimState;
  /** Why the window is this window, from the grading rather than from a constant. */
  reason: string;
  /** What the window costs. Enumerated, because a reader cannot miss what they cannot do. */
  costs: string[];
  /** Complete months inside the reported window. */
  monthsAdmitted: number;
  /** Complete months that passed the grading, anywhere in history. */
  monthsUsable: number;
  /** Usable months stranded on the far side of a break. */
  monthsStranded: number;
  /** Complete months graded. The partial month in progress is never counted. */
  monthsTested: number;
  rejected: { month: string; reason: string }[];
};

export function explainWindow(org: Org): WindowExplanation {
  // Complete months only, on both sides of the fraction. C1: the shipped tile
  // counted a partial August in the numerator and a full 25 in the denominator,
  // which is how "usable 4 of 25" was both flattering and unclosable.
  const q = org.cardTier.quality.filter((m) => m.month < currentMonth());
  const rejected = q
    .filter((m) => !m.ok)
    .map((m) => ({ month: m.month, reason: m.reason ?? "unavailable" }));
  const usable = q.length - rejected.length;
  const w = org.window;
  const claim = claimState(w);

  const costs: string[] = [];
  if (claim.level === "none") {
    costs.push("No year-on-year comparison. There is no month M−12 in this data.");
    costs.push("No cohort retention triangle — a cohort needs to be followed for longer than the window is.");
    costs.push("No lifetime value. A lifetime cannot be observed inside 92 days.");
    costs.push("No member history to trend. Enrolment dates outside the window are not loaded.");
  }
  const rules = windowRules(org);
  if (!rules.lapse.renders) {
    costs.push(
      `No retention, churn or loss figure: the ${org.calibration.lapsedDays}-day lapse threshold needs ` +
        `${rules.lapse.required} days of observation and the window holds ${w.days}.`,
    );
  }

  // The window is the most recent *unbroken* run, so it can be shorter than the
  // count of usable months — and where it is, that gap is the finding rather
  // than a rounding detail. Coffee Guru holds nine usable months and reports on
  // three, because an eight-month reference blackout sits between them.
  const stranded = usable - w.months;

  return {
    window: w,
    claim,
    reason:
      `The window is the most recent unbroken run of months in which the card tier can be trusted. ` +
      `Of ${q.length} complete months tested, ${usable} passed the card-capture grading and ` +
      `${rejected.length} were rejected and named. ` +
      (stranded > 0
        ? `Only ${w.months} of those ${usable} form an unbroken run reaching the present — the other ` +
          `${stranded} sit on the far side of a break and cannot be joined to it without averaging across ` +
          `a period the data does not support. `
        : "") +
      `The window is not a reporting preference — it is the period the data actually supports, and it runs ` +
      `${dayLabel(w.start)} to ${dayLabel(w.end)}.`,
    costs,
    monthsAdmitted: w.months,
    monthsUsable: usable,
    monthsStranded: stranded,
    monthsTested: q.length,
    rejected,
  };
}

/** The month in progress, which is never counted as tested or usable. */
function currentMonth(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

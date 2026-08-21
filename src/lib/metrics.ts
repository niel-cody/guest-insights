/**
 * Derived metrics. Every figure a screen shows comes from here, so two surfaces
 * cannot disagree — the failure that produced eighteen contradicting counts in
 * build v1.
 *
 * The rule that governs this file: **a figure never renders without its window,
 * its grain and its denominator.** Where one of the three is unavailable, the
 * function returns null and the surface declines to draw rather than publishing
 * a number nobody can reproduce.
 */
import type {
  Cohorts,
  AnalysisWindow, Coverage, DaypartRow, Dayparts, DecompositionRow, Guest, LifecycleRow,
  ItemPrices, Items, Members, Network, Org, SegmentRow, Segments,
} from "./types";

// ── formatting ──────────────────────────────────────────────────────────────

/** Tiles round to the nearest ten. Grids and exports never round. */
export const tileCount = (n: number) => Math.round(n / 10) * 10;

export const money = (n: number, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", {
    style: "currency", currency, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);

export const count = (n: number) => new Intl.NumberFormat("en-AU").format(Math.round(n));
export const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`;

/** A signed multiplier, for comparisons. `+41%`, `−4%`. */
export const delta = (n: number, dp = 0) =>
  `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toFixed(dp)}%`;

/** `2.9×` when the gap is large enough that a percentage stops reading. */
export const ratio = (n: number) => (n >= 1 ? `${(1 + n).toFixed(1)}×` : delta(n));

export const monthLabel = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    month: long ? "long" : "short", year: "numeric", timeZone: "UTC",
  });

export const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

/**
 * Recency, anchored to the thing it is actually measured from.
 *
 * `daysSince` is measured from the **end of the window**, which is the only
 * defensible anchor — a guest cannot be observed after the data stops. That was
 * invisible while the only window ended yesterday, and became a live defect the
 * moment historical periods became selectable: "last seen 1 days ago" on a
 * window that closed in December 2024 reads as *yesterday*, twenty months late,
 * and it is the reader who is wrong rather than the number.
 *
 * So recency states its anchor whenever the window is not current. This is the
 * same rule as everywhere else in this file — a figure never renders without
 * its basis — applied to a figure that had been getting away with it because
 * the basis happened to be today.
 */
export function recency(days: number, w: AnalysisWindow, today = new Date()): string {
  const endedDaysAgo = Math.round(
    (today.getTime() - Date.parse(`${w.end}T00:00:00Z`)) / 86_400_000,
  );
  const current = endedDaysAgo <= 7;
  // Zero is the common case for a daily regular and "0 days ago" is not a
  // sentence anybody writes.
  if (days === 0) return current ? "today" : "on the last day of the period";
  // A window that closed within the last week is "now" for a reader's purposes,
  // and spelling out the anchor there is noise rather than rigour.
  return current
    ? `${plural(days, "day")} ago`
    : `${plural(days, "day")} before this period closed`;
}

/** `1 day`, `2 days`. A figure that reads as a typo reads as carelessness. */
export const plural = (n: number, unit: string) => `${count(n)} ${unit}${n === 1 ? "" : "s"}`;

/** The compact form, for a grid cell. Still never bare when the window is historical. */
export function recencyShort(days: number, w: AnalysisWindow, today = new Date()): string {
  const endedDaysAgo = Math.round(
    (today.getTime() - Date.parse(`${w.end}T00:00:00Z`)) / 86_400_000,
  );
  return endedDaysAgo <= 7 ? `${days}d ago` : `${days}d before close`;
}

/** The window, spelled out. Attaches to every figure that is not self-evident. */
export const windowLabel = (w: AnalysisWindow) =>
  `${dayLabel(w.start)} – ${dayLabel(w.end)} · ${w.months} complete months`;

export const windowShort = (w: AnalysisWindow) =>
  `${monthLabel(w.start)}–${monthLabel(w.end)}`;

// ── coverage ────────────────────────────────────────────────────────────────

export type CoverageState = {
  /** Revenue grain is the primary measure. Transaction grain names its denominator. */
  identifiedRevenueShare: number;
  memberRevenueShare: number;
  /** The share a loyalty CRM would see: scanned orders only. */
  scannedRevenueShare: number;
  cardRevenueShare: number;
  identifiedOrderShare: number;
  memberOrderShare: number;
  coversShare: number;
  gaps: { month: string; reason: string }[];
  monthsAdmitted: number;
  monthsTested: number;
  window: AnalysisWindow;
  asOf: string;
};

/**
 * C2. One figure, one precision, everywhere.
 *
 * The shipped build rendered attribution three ways on a single screen: **82%**
 * on the chip, **81.9%** on Coverage, and **22.6 + 59.2 + 18.1** in the
 * breakdown. Every one was correct and the reader could not tell whether they
 * were looking at one measurement or three.
 *
 * One decimal place, and it is not an arbitrary choice: the parts are published
 * at one decimal and have to sum to 100.0, so rounding the whole to zero while
 * the parts keep their decimal *is* the defect. Anything that renders a
 * recognition share reads `attributionPct` rather than calling `pct` with its
 * own precision, which is what stops the drift returning.
 */
export const ATTRIBUTION_DP = 1;
export const attributionPct = (share: number) => pct(share, ATTRIBUTION_DP);

/**
 * The scan rate, held once because **Phase 4's second slider consumes it**.
 *
 * The build record carried 82% and PRD §5.3 carried 81% for the same tenant, and
 * the slider's worked arithmetic used p = 0.81. Neither number is hardcoded
 * anywhere now: the slider reads this function, so the base moves with the data
 * instead of with whichever document was open at the time.
 */
export const SCAN_RATE_DP = 0;
export const scanRatePct = (rate: number) => pct(rate, SCAN_RATE_DP);

export function coverageState(org: Org, coverage: Coverage): CoverageState {
  const t = coverage.totals;
  // Every month in the snapshot is inside the honest window by construction, so
  // there is no averaging across a repair here — the window *is* the run of
  // trustworthy months. v1 computed shares across three different regimes and
  // produced a figure that described none of them.
  return {
    identifiedRevenueShare: (t.memberRevenue + t.cardRevenue) / t.revenue,
    memberRevenueShare: t.memberRevenue / t.revenue,
    scannedRevenueShare: t.scannedRevenue / t.revenue,
    cardRevenueShare: t.cardRevenue / t.revenue,
    identifiedOrderShare: (t.memberOrders + t.cardOrders) / t.orders,
    memberOrderShare: t.memberOrders / t.orders,
    coversShare: t.ordersWithCovers / t.orders,
    gaps: org.cardTier.quality.filter((q) => !q.ok).map((q) => ({ month: q.month, reason: q.reason ?? "unavailable" })),
    monthsAdmitted: org.cardTier.months.length,
    monthsTested: org.cardTier.monthsTested,
    window: org.window,
    asOf: coverage.monthly.at(-1)?.month ?? org.window.end,
  };
}

// ── C3: the venue pair arithmetic, closed ───────────────────────────────────

/**
 * Every venue and every pair accounted for, so the numbers on the map add up.
 *
 * The shipped surface stated **143 pairs tested** beside **19 venues**, which
 * have 171 possible pairs, and drew 17 of them with no caption. Unexplained
 * arithmetic on the page carrying "What this map is not" undoes the rest of the
 * page, so the reconciliation is published rather than the discrepancy being
 * quietly closed.
 *
 * Both explanations the build pack offered turned out to be wrong for this
 * merchant. All 19 venues are geocoded, so geocode coverage is not it; and the
 * evidence floor accounts for the 143→71 step, not the 171→143 one. **The
 * missing 28 pairs share no guests at all** — a pair that never appears in the
 * co-visitation query is not a pair that failed a test, it is a pair with
 * nothing to test — and that is a finding about the estate rather than a gap in
 * the method: 93.5% of guests visit exactly one venue.
 */
export type PairArithmetic = {
  venues: number;
  venuesPlaced: number;
  venuesUngeocoded: number;
  /** n(n−1)/2. Every pair that could exist. */
  pairsPossible: number;
  /** Pairs sharing at least one guest, so there was something to measure. */
  pairsTested: number;
  /** Pairs sharing nobody. Not a failure — nothing to test. */
  pairsNoOverlap: number;
  /** Tested but below the evidence floor, so not drawn. */
  pairsSuppressed: number;
  /** Measurable, and drawn where the fit is not extrapolating. */
  pairsMeasurable: number;
  /** Measurable but inside the distance range the fit cannot constrain. */
  pairsExtrapolated: number;
  minShared: number;
  /** True when every venue and every pair is accounted for. Asserted by a check. */
  closes: boolean;
};

export function pairArithmetic(network: Network): PairArithmetic {
  const venues = network.nodes.length;
  const venuesUngeocoded = network.ungeocoded.length;
  const pairsPossible = (venues * (venues - 1)) / 2;
  const pairsTested = network.pairsTested;
  const pairsMeasurable = network.edges.length;
  return {
    venues,
    venuesPlaced: venues - venuesUngeocoded,
    venuesUngeocoded,
    pairsPossible,
    pairsTested,
    pairsNoOverlap: pairsPossible - pairsTested,
    pairsSuppressed: network.pairsSuppressed,
    pairsMeasurable,
    pairsExtrapolated: network.decay.extrapolatedPairs,
    minShared: network.minShared,
    // The real assertion, not a tautology: every tested pair is either below the
    // evidence floor or measurable, and no more pairs were tested than exist.
    closes: pairsTested === network.pairsSuppressed + pairsMeasurable && pairsTested <= pairsPossible,
  };
}

// ── the member value case ───────────────────────────────────────────────────

export type ValueClaim = {
  key: string;
  question: string;
  /** The figure, or null when the data cannot support the claim. */
  member: number | null;
  nonMember: number | null;
  lift: number | null;
  unit: "money" | "count" | "rate";
  /** Window, grain and denominator, always. */
  basis: string;
  /** Why this is not published, when it is not. */
  refusal: string | null;
  /** The claim this one exists to correct. */
  note?: string;
};

/**
 * The value case, as a set of claims each carrying its own basis.
 *
 * The order is the argument. Per-visit spend comes first *because it is the
 * figure that says members are worth less* — it is what the category publishes
 * and it is true. Frequency comes next and reverses the conclusion. Per-person
 * value resolves it. A report that leads with the flattering number and buries
 * the rest is the thing this product exists not to be.
 */
export function valueClaims(m: Members, org: Org): ValueClaim[] {
  const { member, nonMember } = m.crossSection;
  const w = m.window;
  const basis = `${windowShort(w)} · per person identified by card · ${count(member.people + nonMember.people)} people`;
  const lift = (a: number, b: number) => (a ? b / a - 1 : null);
  const perCover = m.coverBasis;
  const coverTrustworthy =
    perCover.member.coverage > 0.9 && perCover.nonMember.coverage > 0.9;

  return [
    {
      key: "spendPerVisit",
      question: "Do members spend more per visit?",
      member: member.spendPerVisit,
      nonMember: nonMember.spendPerVisit,
      lift: lift(nonMember.spendPerVisit, member.spendPerVisit),
      unit: "money",
      basis: `${windowShort(w)} · per visit · ${count(member.visits + nonMember.visits)} visits`,
      refusal: null,
      note:
        /* Was `serviceModel === "table"`, a label somebody typed. Derived now:
           where most trade is served at a table, a visit is a table and the
           per-visit comparison is measuring party size as much as spend. */
        org.seatedShare > 0.5
          ? "This is the figure that gets loyalty programmes cut. It is also the wrong denominator for a table-service business: a visit is a table, and members are not booking the same size table."
          : "This is the figure that gets loyalty programmes cut, and on its own it is true. It is not the whole answer.",
    },
    {
      key: "itemsPerVisit",
      question: "Do they buy more when they come?",
      member: member.itemsPerVisit,
      nonMember: nonMember.itemsPerVisit,
      lift: lift(nonMember.itemsPerVisit, member.itemsPerVisit),
      unit: "count",
      basis: `${windowShort(w)} · items per visit`,
      refusal: null,
    },
    {
      key: "spendPerCover",
      question: "Per head at the table, do members spend more?",
      member: coverTrustworthy ? perCover.member.spendPerCover : null,
      nonMember: coverTrustworthy ? perCover.nonMember.spendPerCover : null,
      lift:
        coverTrustworthy && perCover.nonMember.spendPerCover && perCover.member.spendPerCover
          ? lift(perCover.nonMember.spendPerCover, perCover.member.spendPerCover)
          : null,
      unit: "money",
      basis: `${windowShort(w)} · per cover · orders recording a party size only`,
      refusal: coverTrustworthy
        ? null
        : `Party size is recorded on ${pct(perCover.member.coverage, 0)} of member orders and ` +
          `${pct(perCover.nonMember.coverage, 0)} of everyone else's. The member orders that do record it average ` +
          `${money(perCover.member.avgOrderWithCovers)} against ${money(perCover.member.avgOrderWithoutCovers)} for those that do not, ` +
          `so restricting to them keeps the top of the member distribution and nearly all of the other. ` +
          `The missingness runs in the direction of the answer, so the comparison is not published.`,
    },
    {
      key: "visits",
      question: "Do they come back more often?",
      member: member.avgVisits,
      nonMember: nonMember.avgVisits,
      lift: lift(nonMember.avgVisits, member.avgVisits),
      unit: "count",
      basis: `${windowShort(w)} · visits per person over ${w.days} days`,
      refusal: null,
      note: "A visit is a person-day at a venue, not an order.",
    },
    {
      key: "repeatRate",
      question: "How many come back at all?",
      member: m.detection.correctedRepeatRate,
      nonMember: nonMember.repeatRate,
      lift: lift(nonMember.repeatRate, m.detection.correctedRepeatRate),
      unit: "rate",
      /**
       * ── C-3: the correction is on the face, not implied ─────────────────
       *
       * This panel publishes a **corrected** figure, and the correction moves
       * it more than five points — from an observed 72% to 68%. The old basis
       * line said only "corrected for scan detection", which names a procedure
       * without saying which way it went or by how much, and the explanation
       * lived in `note`, which this component did not render at all.
       *
       * That put a corrected rate on one screen against the *uncorrected* rate
       * the segment table on the same page derives from its own row counts,
       * five points apart, with nothing to reconcile them. Both figures are now
       * on the face and the direction is named; the mechanism is behind the
       * button, which is where a method belongs.
       */
      basis:
        `${windowShort(w)} · share of people with two or more visits · ` +
        `${pct(m.detection.observedRepeatRate)} observed, corrected down to ${pct(m.detection.correctedRepeatRate)}`,
      refusal: null,
      note:
        `Membership is only visible when somebody scans, and members scan on ${scanRatePct(m.detection.scanPerVisit)} of visits, ` +
        `so a member who came once and did not scan is missed entirely — which inflates the observed repeat rate, ` +
        `because the people most likely to be invisible are exactly the one-visit ones. The correction adds the members ` +
        `the scan rate implies were missed and re-bases on the larger population. ` +
        `The segment table elsewhere on this page counts rows rather than correcting them, so it carries the ` +
        `uncorrected ${pct(m.detection.observedRepeatRate)}; neither is wrong and they answer different questions.`,
    },
    {
      key: "spendPerPerson",
      question: "So what is a member worth?",
      member: member.spendPerPerson,
      nonMember: nonMember.spendPerPerson,
      lift: lift(nonMember.spendPerPerson, member.spendPerPerson),
      unit: "money",
      basis,
      refusal: null,
      note: "Frequency times basket. This is the number that answers the question.",
    },
  ];
}

/**
 * What the cross-sectional gap is, and what it is not.
 *
 * The gap is real and it is worth knowing — it sizes the base the business
 * already has. It is not the value of enrolling somebody, because the people who
 * enrol were already coming back. Only the within-person design separates them,
 * and where that design has too few people the product says so.
 */
export function causalReading(m: Members): {
  association: number;
  causal: { lift: number; lo: number; hi: number; n: number } | null;
  selectionShare: number | null;
  refusal: string | null;
} {
  const association = m.crossSection.lifts.spendPerPerson;
  if (!m.enrolment.estimable) {
    return { association, causal: null, selectionShare: null, refusal: m.enrolment.refusal };
  }
  const s = m.enrolment.spend;
  return {
    association,
    causal: { lift: s.lift, lo: s.liftLo, hi: s.liftHi, n: s.n },
    // How much of the observed gap the within-person design does not explain.
    selectionShare: association > 0 ? Math.max(0, 1 - s.lift / association) : null,
    refusal: null,
  };
}

// ── trade density ───────────────────────────────────────────────────────────

export type DensityTier = "PRIMARY" | "SECONDARY" | "TERTIARY" | "WEAK";

export function densityTier(share: number): DensityTier {
  if (share >= 0.25) return "PRIMARY";
  if (share >= 0.15) return "SECONDARY";
  if (share >= 0.05) return "TERTIARY";
  return "WEAK";
}

/**
 * C6. Below this share of orders a period is not a quiet trading period, it is a
 * period the business does not trade in.
 *
 * 0.1% is where the gap is, not a round number picked for tidiness: Coffee
 * Guru's smallest genuine period is Pre-Dawn at 0.17% — 424 orders, a café
 * opening early — and the next three down are Dinner at 0.043%, Late Evening at
 * 0.0008% and Late Night at 0.0004%. Two orders in three months across twenty
 * venues is a mis-keyed till, not a dinner service.
 */
export const DAYPART_TRADE_FLOOR = 0.001;

export type TradingIdentity = {
  archetype: string;
  reason: string;
  confidence: number;
  primary: DaypartRow[];
  /** Periods carrying trade, which is what confidence is measured against. */
  tradingPeriods: number;
  /** Periods the business does not trade in, excluded from the baseline. */
  emptyPeriods: DaypartRow[];
  /**
   * What the confidence would have been measured against a flat eight-period
   * day. Published beside the real figure because the difference is the finding.
   */
  confidenceAgainstAllPeriods: number;
};

/**
 * The trading identity, derived rather than declared.
 *
 * Confidence is the share of trade the classification actually accounts for,
 * discounted when the shape is ambiguous — two near-equal primaries describe a
 * business less well than one dominant one.
 *
 * ── C6: what was wrong with it ─────────────────────────────────────────────
 *
 * The concentration term measured the leader against **1/8**, a flat
 * eight-period day. Coffee Guru does not have eight trading periods — it has
 * five, and the other three hold 108, 2 and 1 orders across three months and
 * twenty venues. Benchmarking a café against a day it could never trade made
 * concentration look far better than it was, and **the published confidence of
 * 81% falls to 70% when the baseline is the number of periods the business
 * actually trades in**.
 *
 * That figure is a classification published to a customer, so the one that
 * renders is the one computed on buckets that carry trade, and the other is
 * shown beside it rather than quietly replaced.
 *
 * Phase 3 folds the empty rows and draws the heatmap. This changes the number
 * only.
 */
export function tradingIdentity(dp: Dayparts): TradingIdentity {
  const grandTotal = dp.periods.reduce((a, d) => a + d.orders, 0) || 1;
  const empty = dp.periods.filter((d) => d.orders / grandTotal < DAYPART_TRADE_FLOOR);
  const trading = dp.periods.filter((d) => d.orders / grandTotal >= DAYPART_TRADE_FLOOR);

  const periods = trading.length ? trading : dp.periods;
  const total = periods.reduce((a, d) => a + d.orders, 0) || 1;
  const ranked = [...periods].sort((a, b) => b.orders - a.orders);
  const shares = ranked.map((d) => d.orders / total);
  const primary = ranked.filter((_, i) => shares[i] >= 0.25);
  const top = shares[0] ?? 0;
  const second = shares[1] ?? 0;

  let archetype: string;
  let reason: string;
  if (primary.length === 1 && top >= 0.6) {
    archetype = `Daypart Specialist (${ranked[0].label})`;
    reason = `${pct(top, 0)} of orders fall in one period.`;
  } else if (primary.length >= 2) {
    archetype = `High-Throughput ${ranked[0].label.split(" ")[0]}`;
    reason = `${ranked.slice(0, primary.length).map((d) => d.label).join(" and ")} are both primary, together ${pct(shares.slice(0, primary.length).reduce((a, b) => a + b, 0), 0)} of orders.`;
  } else if (primary.length === 1) {
    archetype = `${ranked[0].label}-Led`;
    reason = `${ranked[0].label} is the only primary period at ${pct(top, 0)}.`;
  } else {
    archetype = "Distributed";
    reason = "No period reaches the 25% primary threshold.";
  }

  // Concentration against a flat distribution **over the periods the business
  // trades in**, tempered by how clearly the leader leads. The baseline is
  // 1/(trading periods), not 1/8 — see the note above.
  const separation = top > 0 ? Math.min(1, (top - second) / top + 0.5) : 0;
  const flat = 1 / Math.max(periods.length, 1);
  const score = (baseline: number) =>
    Math.max(0, Math.min(1, Math.min(1, (top - baseline) / 0.5 + 0.4) * separation));

  return {
    archetype,
    reason,
    confidence: score(flat),
    primary,
    tradingPeriods: periods.length,
    emptyPeriods: empty,
    confidenceAgainstAllPeriods: score(1 / Math.max(dp.periods.length, 1)),
  };
}

// ── guest flow ──────────────────────────────────────────────────────────────

export type Flow = {
  month: string;
  gained: number;
  lost: number;
  net: number;
  new: number;
  reactivated: number;
  returning: number;
  active: number;
};

/** Member flow. The card tier gets counts but no lapse judgement — reissue is
 *  unmeasured, so "lost" on a card is a claim we cannot support. */
export function memberFlow(lifecycle: LifecycleRow[]): Flow[] {
  return lifecycle
    .filter((r) => r.tier === "member")
    .map((r) => ({
      month: r.month,
      gained: r.new + r.reactivated,
      lost: r.lapsed,
      net: r.new + r.reactivated - r.lapsed,
      new: r.new,
      reactivated: r.reactivated,
      returning: r.returning,
      active: r.active,
    }));
}

/**
 * How this person actually behaves.
 *
 * Returns null rather than substituting the org median when the guest has no
 * established cadence. v1 described four guests at 9, 22, 22 and 22 days as all
 * "normally coming every 17 days", which was the org median wearing a personal
 * pronoun.
 */
export function habit(g: Guest, w: AnalysisWindow): string | null {
  if (g.cadenceDays == null || g.visits < 3) return null;
  return `usually every ${Math.round(g.cadenceDays)}d · last seen ${recencyShort(g.daysSince, w)}`;
}

/** How overdue this guest is against their own cadence, not a fixed rule. */
export function overdueRatio(g: Guest): number | null {
  if (g.cadenceDays == null || g.cadenceDays <= 0 || g.visits < 3) return null;
  return g.daysSince / g.cadenceDays;
}

// ── §7.3: the guest's own trading week ──────────────────────────────────────

export type VisitWeek = { key: string; label: string; sublabel?: string; start: string };

/**
 * The calendar weeks a window spans, Monday-aligned.
 *
 * §7.3's day grid is seven rows of weekday against these as columns, which for a
 * 92-day window is fourteen of them — enough to carry **every** visit a guest
 * made, so the old *"showing 60 of 118"* confession has nothing left to confess.
 *
 * Weeks start on Monday to match the grid rows. The first column is therefore
 * usually a partial week, and that is correct: the window opens on a real date,
 * not on a Monday, and padding it to a whole week would draw days the data does
 * not cover as though nobody came.
 */
export function visitWeeks(w: AnalysisWindow): VisitWeek[] {
  const start = new Date(`${w.start}T00:00:00Z`);
  const end = new Date(`${w.end}T00:00:00Z`);
  // Back up to the Monday on or before the window start.
  const firstMonday = new Date(start);
  const shift = (start.getUTCDay() + 6) % 7;
  firstMonday.setUTCDate(firstMonday.getUTCDate() - shift);

  const out: VisitWeek[] = [];
  for (let d = new Date(firstMonday); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    const iso = d.toISOString().slice(0, 10);
    out.push({
      key: iso,
      label: new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", {
        day: "numeric", month: "short", timeZone: "UTC",
      }),
      start: iso,
    });
  }
  return out;
}

/** Which week column and weekday row a day-offset from the window start falls in. */
export function placeVisit(
  offset: number,
  w: AnalysisWindow,
  weeks: VisitWeek[],
): { weekKey: string; dow: number; iso: string } | null {
  const d = new Date(`${w.start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  const iso = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  // The Monday of this day's week.
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - ((dow + 6) % 7));
  const weekKey = monday.toISOString().slice(0, 10);
  return weeks.some((x) => x.key === weekKey) ? { weekKey, dow, iso } : null;
}

/**
 * Whether a guest's rhythm is steady, widening or tightening.
 *
 * §7.3 asks for this as a sentence rather than a tile, and it is computed first
 * half against second half of their own visits — not against the org median,
 * which is how a previous build described four guests at 9, 22, 22 and 22 days
 * as all "normally coming every 17 days".
 *
 * Returns null below four visits: three gaps is the fewest that can be split
 * into two halves and still say anything, and two halves of one gap each is a
 * comparison between two numbers wearing the clothes of a trend.
 */
export function rhythmShift(
  /** Reads the day offset only, so tuple width is irrelevant to it. */
  history: readonly (readonly number[])[],
): { verdict: "steady" | "widening" | "tightening"; firstHalf: number; secondHalf: number } | null {
  if (history.length < 4) return null;
  // History arrives most-recent first; gaps are easier to read oldest first.
  const days = [...history].map((h) => h[0]).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
  if (gaps.length < 3) return null;

  const mid = Math.floor(gaps.length / 2);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const firstHalf = mean(gaps.slice(0, mid));
  const secondHalf = mean(gaps.slice(gaps.length - mid));

  /**
   * A verdict needs to clear **both** bars: a fifth in relative terms and a
   * whole day in absolute ones.
   *
   * The relative bar alone is not enough. A daily regular averaging 0.6 days
   * between visits and then 0.7 has moved 17% and has not changed their
   * behaviour by any amount a human could notice — but "their rhythm is
   * widening" is a sentence an operator will act on. The absolute bar is what
   * stops a tenth of a day being reported as a trend, and it is the reason this
   * returns "steady" far more often than a purely proportional test would.
   */
  const change = firstHalf ? secondHalf / firstHalf - 1 : 0;
  const material = Math.abs(change) >= 0.2 && Math.abs(secondHalf - firstHalf) >= 1;
  const verdict = !material ? "steady" : change > 0 ? "widening" : "tightening";
  return { verdict, firstHalf, secondHalf };
}

// ── revenue decomposition ───────────────────────────────────────────────────

/**
 * Symmetric Shapley decomposition of a multiplicative model.
 *
 * Revenue = guests × visits-per-guest × items-per-visit × price-per-item. Each
 * factor gets the average of its marginal contribution across every order in
 * which the factors could have changed. Unlike a chained split the answer does
 * not depend on the order the analyst picked, and unlike LMDI it needs no
 * residual term — which matters here because LMDI is undefined when a factor is
 * zero and this business has months with zero card volume. LMDI is decided
 * against, not under consideration.
 */
export function shapley(from: number[], to: number[]): number[] {
  const n = from.length;
  const fact = (k: number) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; };
  const weight = (s: number) => (fact(s) * fact(n - 1 - s)) / fact(n);

  return from.map((_, i) => {
    const d = to[i] - from[i];
    let acc = 0;
    const others = [...Array(n).keys()].filter((j) => j !== i);
    for (let mask = 0; mask < 1 << others.length; mask++) {
      let product = 1;
      let size = 0;
      others.forEach((j, bit) => {
        const moved = (mask >> bit) & 1;
        if (moved) size++;
        product *= moved ? to[j] : from[j];
      });
      acc += weight(size) * d * product;
    }
    return acc;
  });
}

export type Decomposition = {
  from: DecompositionRow;
  to: DecompositionRow;
  /** The modelled change — what the four factors explain, and what they sum to. */
  revenueChange: number;
  /** The change in recorded revenue, which the stored factors do not reproduce exactly. */
  recordedChange: number;
  /** Recorded minus modelled. Rounding in the four stored factors. */
  reconciliation: number;
  /**
   * `label` states the direction the factor moved and is what prose and the
   * table use. `name` is the factor's plain name, for the chart's x-axis where
   * the bar itself already shows the direction and a five-word label would not
   * fit under a 44px column.
   */
  terms: { key: string; label: string; name: string; value: number; kind: "real" | "price"; operand: string }[];
  /**
   * The price/mix split, or its refusal, or null where it was never attempted.
   * The surface prints the reason rather than going quiet.
   */
  split: PriceMix | null;
  real: number;
  price: number;
};

/**
 * ── "price per item" became "average item price" (OV-7) ────────────────────
 *
 * The old label asserted something the figure cannot support. Revenue divided
 * by items **moves when you raise a price, and moves identically when the mix
 * shifts toward more expensive items with no price change at all.** A guest
 * buying a large flat white instead of a small one registers here as a higher
 * "price per item", and the panel was naming that a price rise.
 *
 * The measure is unchanged and the name now describes it: the average price of
 * an item sold, which is a price effect and a mix effect added together. **This
 * build cannot separate the two** — that needs item-level price history against
 * item-level volumes, and the extract carries item counts but not a price per
 * SKU per month. Splitting it is the version worth having and it is named as
 * the next step rather than implied to be already done.
 */
const TERMS = [
  { key: "guests", name: "Guests", label: "guests", kind: "real" as const },
  { key: "visitsPerGuest", name: "Visits per guest", label: "visits per guest", kind: "real" as const },
  { key: "itemsPerVisit", name: "Items per visit", label: "items per visit", kind: "real" as const },
  { key: "pricePerItem", name: "Average item price", label: "average item price", kind: "price" as const },
];

// ── the price / mix split ───────────────────────────────────────────────────

/**
 * Floors the split has to clear before it will publish. **Provisional.**
 *
 * These are stated here rather than buried at their call sites because they are
 * the thing to argue with, and because **none of them has yet met real data** —
 * the query that feeds this landed with the maths, so the first extract is also
 * the first calibration. Each says what it is protecting against; if one turns
 * out to be wrong it should be moved deliberately and noted, not discovered by a
 * reader wondering why a bar disappeared.
 */
export const PRICE_MIX = {
  /** Product-line revenue as a share of the month's decomposition revenue. */
  MIN_REVENUE_COVERAGE: 0.9,
  /** Share of lines on products present in *both* months. A like-for-like claim needs a like. */
  MIN_MATCHED_LINES: 0.8,
  /**
   * How far outside the bar the split may push a part.
   *
   * The two effects can offset — prices up, mix down — and when they do, their
   * sum is small while each part is large. Rescaling that onto the Shapley bar
   * produces two enormous bars that cancel, which is arithmetically fine and
   * reads as a finding it is not. Beyond this the split refuses and the single
   * bar stands.
   */
  MAX_SHARE: 1.35,
  MIN_SHARE: -0.35,
} as const;

export type PriceMix =
  | {
      ok: true;
      /** Average product-line price in each month. Not `pricePerItem` — see `reason` on the refusal. */
      fromAvg: number;
      toAvg: number;
      /** Dollars per item, and they sum to `toAvg − fromAvg` exactly. */
      priceEffect: number;
      mixEffect: number;
      /** `priceEffect` over the total move. The share of the price bar that is a real price change. */
      priceShare: number;
      /** Line-weighted revenue coverage of the two months, worst first. */
      coverage: number;
      matchedLines: number;
      /** The products that moved the average most, price-wise. Empty without the dictionary. */
      movers: { name: string; from: number; to: number; change: number; lines: number; effect: number }[];
    }
  | { ok: false; reason: string };

/**
 * Did prices go up, or did guests buy dearer things? **The OV-7 refusal, lifted.**
 *
 * ── What it does ───────────────────────────────────────────────────────────
 *
 * Average product-line price is `A = Σ sₚ·uₚ` — each product's share of lines
 * times its price. Between two months both move, and the Bennet indicator splits
 * the difference into the two exactly:
 *
 *     ΔA = Σ (u₁−u₀)·(s₀+s₁)/2   ← price: the same basket, repriced
 *        + Σ (s₁−s₀)·(u₀+u₁)/2   ← mix:   the same prices, a different basket
 *
 * It is symmetric — neither month is the base — and it sums to `A₁ − A₀` with no
 * residual, which is the same property the four-factor Shapley has and the
 * reason it is used rather than a Laspeyres index with an interaction term
 * nobody can interpret.
 *
 * A product that appears in only one month has no price to compare, so its price
 * effect is zero by construction and its whole movement lands in mix. **A new
 * product arriving is a mix change, not a price change**, and treating it any
 * other way would let a menu launch read as a price rise.
 *
 * ── What it refuses, and why each refusal exists ───────────────────────────
 *
 * The split runs on **product lines**; the decomposition runs on the order
 * header's item count. They are close but not the same universe, so this is a
 * proportional split of a bar rather than a recomputation of it, and it declines
 * whenever that proportion cannot be trusted:
 *
 *   - **no file** — the snapshot predates the query;
 *   - **thin coverage** — product lines account for too little of the month's
 *     revenue, so the split would describe a corner of the trade;
 *   - **too much churn** — too few lines sit on products present in both months,
 *     so there is no like to compare like against;
 *   - **the two universes disagree** — product-line price moved one way and
 *     `pricePerItem` moved the other, which means the bar being split is not the
 *     quantity that was split;
 *   - **unstable rescale** — the parts offset, and projecting them onto the bar
 *     would draw two large cancelling columns.
 *
 * Every one of those returns a sentence, not a null, because the surface has to
 * say which it hit.
 */
export function priceMix(
  prices: ItemPrices | null,
  items: Items | null,
  from: DecompositionRow,
  to: DecompositionRow,
): PriceMix {
  if (!prices) {
    return { ok: false, reason: "this snapshot was extracted before per-product prices were collected" };
  }

  const monthRows = (m: string) => prices.rows.filter((r) => r.month === m);
  const a = monthRows(from.month);
  const b = monthRows(to.month);
  if (!a.length || !b.length) {
    return { ok: false, reason: "one of the two months carries no product-line data" };
  }

  const cover = (m: string) => prices.coverage.find((c) => c.month === m)?.revenueShare ?? 0;
  const coverage = Math.min(cover(from.month), cover(to.month));
  if (coverage < PRICE_MIX.MIN_REVENUE_COVERAGE) {
    return {
      ok: false,
      reason:
        `product lines account for ${pct(coverage, 0)} of one month's revenue, below the ` +
        `${pct(PRICE_MIX.MIN_REVENUE_COVERAGE, 0)} this needs`,
    };
  }

  const linesA = a.reduce((s, r) => s + r.lines, 0);
  const linesB = b.reduce((s, r) => s + r.lines, 0);
  if (!linesA || !linesB) return { ok: false, reason: "a month has no product lines to weigh" };

  const byProduct = new Map<number, { l0: number; r0: number; l1: number; r1: number }>();
  const slot = (p: number) => {
    const cur = byProduct.get(p) ?? { l0: 0, r0: 0, l1: 0, r1: 0 };
    byProduct.set(p, cur);
    return cur;
  };
  for (const r of a) { const c = slot(r.product); c.l0 += r.lines; c.r0 += r.revenue; }
  for (const r of b) { const c = slot(r.product); c.l1 += r.lines; c.r1 += r.revenue; }

  const matched = [...byProduct.values()].filter((c) => c.l0 > 0 && c.l1 > 0);
  const matchedLines =
    Math.min(
      matched.reduce((s, c) => s + c.l0, 0) / linesA,
      matched.reduce((s, c) => s + c.l1, 0) / linesB,
    );
  if (matchedLines < PRICE_MIX.MIN_MATCHED_LINES) {
    return {
      ok: false,
      reason:
        `only ${pct(matchedLines, 0)} of lines sit on products sold in both months, below the ` +
        `${pct(PRICE_MIX.MIN_MATCHED_LINES, 0)} a like-for-like comparison needs`,
    };
  }

  let priceEffect = 0;
  let mixEffect = 0;
  const movers: { index: number; from: number; to: number; change: number; lines: number; effect: number }[] = [];
  for (const [index, c] of byProduct) {
    const s0 = c.l0 / linesA;
    const s1 = c.l1 / linesB;
    // A product sold in one month only has no price to compare. Holding its
    // price constant sends its whole movement to mix, which is what a launch or
    // a delisting is.
    const u0 = c.l0 ? c.r0 / c.l0 : c.l1 ? c.r1 / c.l1 : 0;
    const u1 = c.l1 ? c.r1 / c.l1 : u0;
    const p = (u1 - u0) * ((s0 + s1) / 2);
    priceEffect += p;
    mixEffect += (s1 - s0) * ((u0 + u1) / 2);
    if (c.l0 > 0 && c.l1 > 0) {
      movers.push({ index, from: u0, to: u1, change: u1 - u0, lines: c.l0 + c.l1, effect: p });
    }
  }

  const fromAvg = a.reduce((s, r) => s + r.revenue, 0) / linesA;
  const toAvg = b.reduce((s, r) => s + r.revenue, 0) / linesB;
  const move = toAvg - fromAvg;
  const headline = to.pricePerItem - from.pricePerItem;

  if (move === 0) return { ok: false, reason: "average product-line price did not move at all" };
  if (headline !== 0 && Math.sign(move) !== Math.sign(headline)) {
    return {
      ok: false,
      reason:
        "product-line price and average item price moved in opposite directions, so the split " +
        "would not be a split of the bar it is drawn under",
    };
  }

  const priceShare = priceEffect / move;
  if (priceShare > PRICE_MIX.MAX_SHARE || priceShare < PRICE_MIX.MIN_SHARE) {
    return {
      ok: false,
      reason:
        "the price and mix effects largely cancel, so projecting them onto the bar would draw " +
        "two large columns that add to a small one",
    };
  }

  const names = items?.products ?? [];
  return {
    ok: true,
    fromAvg, toAvg, priceEffect, mixEffect, priceShare, coverage, matchedLines,
    movers: movers
      .filter((m) => names[m.index])
      .sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect))
      .slice(0, 6)
      .map((m) => ({
        name: names[m.index].name,
        from: m.from, to: m.to, change: m.change, lines: m.lines, effect: m.effect,
      })),
  };
}

/**
 * An operand pair printed at whatever precision makes the movement visible.
 *
 * Fixed two-decimal formatting rendered **"1.95 → 1.95"** under a label reading
 * "More items per visit" — a panel stating a direction its own figures do not
 * show, against this file's own rule that each label states the direction the
 * factor actually moved. The underlying move is 1.9514 to 1.9523, which is real
 * and worth $322 of the quarter, and the formatter was hiding it.
 *
 * So precision is chosen rather than fixed: start at two decimals and widen
 * until the two sides differ, up to the four the extract actually stores. A
 * pair that is still identical at four decimals genuinely did not move, and
 * prints as an equals sign instead of an arrow.
 */
function operandPair(a: number, b: number, isCount: boolean): string {
  if (isCount) return `${count(a)} → ${count(b)}`;
  for (const dp of [2, 3, 4]) {
    if (a.toFixed(dp) !== b.toFixed(dp)) return `${a.toFixed(dp)} → ${b.toFixed(dp)}`;
  }
  return `${a.toFixed(2)} = ${b.toFixed(2)}`;
}

/**
 * Labels state the *direction the factor moved*, never the direction its name
 * implies. v1 rendered `Visiting more often` against −$2,913 and `Paying more
 * per item` against −$287.83, because the labels were hard-coded to the positive
 * sense of the factor.
 */
export function decompose(
  from: DecompositionRow,
  to: DecompositionRow,
  /**
   * The price/mix split, when it publishes. The four-factor Shapley does not
   * change: its `average item price` term is *divided* in the ratio the split
   * found, so the bars still sum to the same modelled change and the bridge
   * still closes on the same figure.
   */
  split: PriceMix | null = null,
): Decomposition {
  const keys = TERMS.map((t) => t.key) as (keyof DecompositionRow)[];
  const a = keys.map((k) => Number(from[k]));
  const b = keys.map((k) => Number(to[k]));
  const values = shapley(a, b);
  const terms = TERMS.map((t, i) => {
    const moved = b[i] - a[i];
    // A factor that did not move gets a neutral label. "More" against an
    // unchanged figure is the OV-7 defect in words rather than in formatting.
    const dir = moved === 0 ? "Unchanged" : moved > 0 ? "More" : "Fewer";
    const priceDir = moved === 0 ? "Unchanged" : moved > 0 ? "Higher" : "Lower";
    const label =
      moved === 0
        ? `${t.label} unchanged`
        : t.kind === "price"
          ? `${priceDir} ${t.label}`
          : `${dir} ${t.label}`;
    return {
      ...t,
      label,
      value: values[i],
      operand: operandPair(a[i], b[i], t.key === "guests"),
    };
  });

  /**
   * ── The parts sum to the modelled change, not to the recorded one (C-2) ──
   *
   * The caption under this table has always claimed the parts sum to the whole
   * exactly. **They did not.** The four Shapley terms come to +$8,669.48 while
   * the headline read +$8,651.47 — $18.01 out, under a sentence asserting there
   * is no residual, with two of the four parts shown to the cent.
   *
   * Nothing is wrong with the decomposition. Shapley on a multiplicative model
   * sums exactly to the difference of the products, and it does here to the
   * cent. What it does *not* sum to is `to.revenue − from.revenue`, because the
   * four factors are stored rounded to four decimals and their product is
   * therefore not quite the recorded revenue: $694,164.34 modelled against
   * $694,163.65 recorded at the start, $702,833.82 against $702,815.12 at the
   * end.
   *
   * So the headline becomes the **modelled** change, which is the quantity the
   * four bars actually explain, and the gap to the recorded change is published
   * beside it rather than absorbed silently into whichever bar is largest. An
   * exactness claim a reader cannot check spends trust it has not earned; one
   * they can check, and which reconciles, earns it back.
   */
  const modelledChange = values.reduce((s, v) => s + v, 0);
  const recordedChange = to.revenue - from.revenue;

  /**
   * ── The price bar becomes two bars, when the evidence allows ─────────────
   *
   * `average item price` has always been two things added together: a price
   * change and a mix change. Naming it honestly was OV-7; separating it needs
   * per-product monthly prices, and `priceMix` does the separating and states
   * when it will not.
   *
   * The Shapley term is **divided**, not recomputed. Its two parts sum to it
   * exactly, so every figure downstream — the modelled change, the bridge, the
   * reconciliation — is untouched by whether the split published.
   *
   * The `kind` on each part is the payoff, and it corrects a misclassification
   * the single bar could not avoid: a like-for-like price rise is the merchant's
   * own decision and is **price**; a guest choosing the large flat white is that
   * guest's decision and is **real trade**. The whole bar used to be filed as
   * price, so the front-page "most of it is price" sentence was crediting
   * guests' trading up to the price list.
   */
  const final = split?.ok
    ? terms.flatMap((t) => {
        if (t.kind !== "price") return [t];
        const priceValue = t.value * split.priceShare;
        const mixValue = t.value - priceValue;
        const moved = split.toAvg - split.fromAvg;
        const money2 = (v: number) => `$${v.toFixed(2)}`;
        return [
          {
            key: "priceLevel",
            name: "Price changes",
            label:
              moved === 0 ? "prices unchanged" : moved > 0 ? "Higher prices" : "Lower prices",
            value: priceValue,
            kind: "price" as const,
            operand: `${money2(split.fromAvg)} → ${money2(split.fromAvg + split.priceEffect)} like for like`,
          },
          {
            key: "itemMix",
            name: "Item mix",
            label:
              split.mixEffect === 0 ? "mix unchanged" : split.mixEffect > 0 ? "Traded up" : "Traded down",
            value: mixValue,
            // A guest choosing a dearer item is that guest's behaviour, not the
            // merchant's price list. This is the reclassification the split buys.
            kind: "real" as const,
            operand: `${money2(split.mixEffect)} per item from what they chose`,
          },
        ];
      })
    : terms;

  return {
    from, to,
    revenueChange: modelledChange,
    recordedChange,
    /** Recorded minus modelled. Rounding in the stored factors, nothing else. */
    reconciliation: recordedChange - modelledChange,
    terms: final,
    split,
    real: final.filter((t) => t.kind === "real").reduce((s, t) => s + t.value, 0),
    price: final.filter((t) => t.kind === "price").reduce((s, t) => s + t.value, 0),
  };
}

/**
 * What the cohort window actually spans. **C-5.**
 *
 * ── Two different numbers were being printed as one ────────────────────────
 *
 * The snapshot stores `days: 607`, and it is correct for what it measures: the
 * span from the **first cohort's month to the last cohort's month**, 1 November
 * 2024 to 1 July 2026. Twenty-one monthly intakes fall in that span, which is
 * also correct.
 *
 * The page then printed 607 as the length of the **observation window** — "these
 * identify people by loyalty scan over 607 days" — and that is a different
 * quantity. Members who joined in July 2026 are observed to the end of July, so
 * the window runs to 31 July 2026: **638 days**, not 607. The render rule
 * compared the wrong one of the two against its threshold as well.
 *
 * Both figures are real and both are now named for what they are. Nothing about
 * the data changes; what changes is that the sentence and the arithmetic agree.
 */
export function cohortWindow(c: Cohorts): {
  /** First intake month to last intake month. The snapshot's own `days`. */
  intakeSpanDays: number;
  /** First intake month to the close of the last intake's month. */
  observationDays: number;
  cohortCount: number;
} {
  const start = new Date(`${c.window.start}T00:00:00Z`);
  const lastMonth = new Date(`${c.window.end}T00:00:00Z`);
  // The close of the month the last cohort joined in.
  const close = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0));
  const day = 86_400_000;
  return {
    intakeSpanDays: Math.round((lastMonth.getTime() - start.getTime()) / day),
    // Inclusive of both endpoints: a window covering one day is one day long.
    observationDays: Math.round((close.getTime() - start.getTime()) / day) + 1,
    cohortCount: c.cohorts.length,
  };
}

// ── segments ────────────────────────────────────────────────────────────────

export const SEGMENT_LABEL: Record<string, string> = {
  regular: "Regulars",
  established: "Established",
  slipping: "Slipping",
  lapsed: "Lapsed",
  new: "New",
  "one-visit": "Seen once",
};

export const SEGMENT_ORDER = ["regular", "established", "slipping", "lapsed", "new", "one-visit"] as const;

/**
 * One colour per segment, declared once.
 *
 * §5.4's composition bars put the same six segments in three stacked bars and
 * ask the reader to carry a colour from one bar to the next — that is the whole
 * mechanism by which "28% of people, 73% of visits" becomes visible. It only
 * works if the ramp holds together as a set, so it is declared once here and
 * every surface reads it.
 *
 * ── The ramp is on brand, and that is a deliberate exception ───────────────
 *
 * Chart colours elsewhere in this build are a validated data-visualisation
 * palette rather than brand colours, because brand colours are chosen to look
 * like a company and chart colours have to be told apart by someone who cannot
 * see red. This ramp is the exception: it is the one set an operator meets on
 * every screen, it is nominal rather than sequential, and six categories is
 * inside the budget where brand hues can be separated safely.
 *
 * **Regulars and Established are two steps of Oolio deep purple**, because they
 * are the same kind of customer at two depths — a hue change between them would
 * read as a change of category rather than a change of degree. **New is brand
 * green**: it is the only segment that is unambiguously good news, and green is
 * the one colour an operator reads that way without being told. The at-risk
 * pair stay warm, and **Seen once stays neutral** because it is not a failure
 * state — it is the largest group in most hospitality businesses and colouring
 * it red would editorialise the single most common fact about the estate.
 */
export const SEGMENT_COLOUR: Record<string, string> = {
  regular: "var(--segment-regular)",
  established: "var(--segment-established)",
  slipping: "var(--segment-slipping)",
  lapsed: "var(--segment-lapsed)",
  new: "var(--segment-new)",
  "one-visit": "var(--segment-once)",
};

/**
 * Text that stays legible on each segment's fill.
 *
 * The composition bars put a percentage label *inside* the band, which is the
 * only way to label six segments across three bars without a legend the eye has
 * to keep travelling to. Two of the six fills are light enough that white text
 * on them is unreadable, so the pairing is declared rather than guessed at.
 */
export const SEGMENT_INK: Record<string, string> = {
  regular: "#ffffff",
  established: "var(--ink)",
  slipping: "#ffffff",
  lapsed: "#ffffff",
  new: "#ffffff",
  "one-visit": "var(--ink)",
};

/**
 * The lifecycle ladder, as data.
 *
 * §4.5 renders these on the page because a GM will argue with the first verdict
 * that says one of their regulars has gone, and "it is in the code" is not an
 * answer. It lives here rather than inline in the page because the boundaries
 * popover and the segment grid both state it, and two copies of a definition is
 * how they come to disagree.
 *
 * **The order is load-bearing.** These are not six independent definitions —
 * they are a first-match ladder, and two of them genuinely overlap. Somebody
 * seen exactly once, a long time ago, satisfies both "Seen once" and "Lapsed";
 * the ladder puts them in Lapsed. Published as six unordered rules that is a
 * contradiction a reader can find and we cannot answer. Published as a numbered
 * ladder it is a definition.
 */
export function segmentLadder(lapsedDays: number): { key: string; rule: string }[] {
  return [
    { key: "lapsed", rule: `no visit for ${lapsedDays} days, whatever else is true of them` },
    { key: "one-visit", rule: "exactly one visit, and it was recent enough not to be Lapsed" },
    { key: "new", rule: "two visits — one gap is not yet a habit" },
    { key: "slipping", rule: "three or more visits, and more than twice their own usual gap since the last one" },
    { key: "regular", rule: "ten or more visits, still inside their own usual gap" },
    { key: "established", rule: "everybody else with three or more visits" },
  ];
}

/**
 * The two visit thresholds that are actually drawable on a spend-against-visits
 * plot, and their names.
 *
 * The other boundaries — slipping, lapsed — condition on recency against the
 * guest's *own* cadence, which is not either axis of that chart. §5.4 asks for
 * the boundaries to render as lines so a reader can see where the cut falls, and
 * these two can honestly be drawn. The rest are stated beside the chart instead
 * of being approximated onto it, because a line in the wrong place is worse than
 * no line: it invites the reader to measure against it.
 */
export const VISIT_BOUNDARIES = [
  { visits: 3, label: "3 visits — below this no lifecycle verdict is given" },
  { visits: 10, label: "10 visits — Regulars" },
] as const;

type SegmentTotals = {
  guests: number;
  visits: number;
  spend: number;
  multiVenue: number;
  /**
   * Null where the snapshot predates the columns, never zero.
   *
   * A zero here would divide into a spend-per-order of infinity or, worse,
   * render as a real basket of nothing. The surfaces that consume these check
   * for null and decline to draw the panel, which is the same contract every
   * other optional measure in this build follows.
   */
  orders: number | null;
  items: number | null;
};

const EMPTY: SegmentTotals = {
  guests: 0, visits: 0, spend: 0, multiVenue: 0, orders: null, items: null,
};

/** The accumulator starts at zero; null is reached only by meeting a row without them. */
const ZERO: SegmentTotals = {
  guests: 0, visits: 0, spend: 0, multiVenue: 0, orders: 0, items: 0,
};

export function rollUpSegments(segments: Segments, tier?: "member" | "card") {
  const rows = tier ? segments.rows.filter((r) => r.tier === tier) : segments.rows;
  const by = new Map<string, SegmentTotals>();
  for (const r of rows) {
    const key = r.segment ?? "unclassified";
    const cur = by.get(key) ?? ZERO;
    by.set(key, {
      guests: cur.guests + r.guests,
      visits: cur.visits + r.visits,
      spend: cur.spend + r.spend,
      multiVenue: cur.multiVenue + r.multiVenue,
      // One missing constituent row poisons the whole segment rather than
      // being treated as a zero, because a partial sum here is a plausible
      // wrong number and an absent one is a visible refusal.
      orders: r.orders == null || cur.orders === null ? null : cur.orders + r.orders,
      items: r.items == null || cur.items === null ? null : cur.items + r.items,
    });
  }
  return SEGMENT_ORDER.map((s) => ({
    segment: s,
    label: SEGMENT_LABEL[s],
    ...(by.get(s) ?? EMPTY),
  })).filter((s) => s.guests > 0);
}

/**
 * Visit bands, for either tier — the axis a members-against-cards comparison can
 * actually be made on.
 *
 * ── Why not the lifecycle segments ────────────────────────────────────────
 *
 * Because cards do not have one. `segment` is null at source for anyone not
 * enrolled, and deliberately: a reissued card is indistinguishable from a
 * customer who stopped coming, so "Lapsed" on a card is a guess. That rule is
 * not being worked around here. Visit count is the thing both tiers genuinely
 * carry, and frequency is most of what the lifecycle was measuring anyway.
 *
 * ── The band-1 asymmetry is the point, not an oversight ───────────────────
 *
 * A member is a person from the moment they enrol, so their single-visit band
 * counts. **A card is not a person until its second visit** — one sighting is a
 * transaction we can see, not a customer we can count, which is
 * `CARD_PERSON_FILTER` in the extract and the reason the card tier is 19,940
 * rather than 64,563.
 *
 * So band 1 is included for members and excluded for cards, and the two
 * totals then reconcile exactly with every other population figure in the
 * product: 4,966 members, 19,940 cards, 24,906 classifiable between them. The
 * 44,623 one-visit cards are **stated on the surface** rather than dropped
 * quietly — see the note the grid renders under a card or combined view.
 */
export type VisitBandRow = {
  segment: string;
  label: string;
  band: number;
  guests: number;
  visits: number;
  spend: number;
  orders: number;
};

/** A card is only a person on its second visit. A member is one from enrolment. */
export const CARD_MIN_VISITS = 2;

export function visitBands(members: Members, tier: "member" | "card" | "all"): VisitBandRow[] {
  const src = members.opportunity.candidates.byBand;
  const wanted = (r: { isMember: boolean; visitBand: number }) => {
    if (r.isMember) return tier === "member" || tier === "all";
    if (tier === "member") return false;
    return r.visitBand >= CARD_MIN_VISITS;
  };

  const by = new Map<number, VisitBandRow>();
  for (const r of src) {
    if (!wanted(r)) continue;
    const cur = by.get(r.visitBand) ?? {
      segment: `visits-${r.visitBand}`,
      label: r.visitBand >= 10 ? "10 or more" : plural(r.visitBand, "visit"),
      band: r.visitBand,
      guests: 0, visits: 0, spend: 0, orders: 0,
    };
    by.set(r.visitBand, {
      ...cur,
      guests: cur.guests + r.people,
      visits: cur.visits + r.visits,
      spend: cur.spend + r.spend,
      orders: cur.orders + r.orders,
    });
  }
  return [...by.values()].sort((a, b) => a.band - b.band);
}

/** The one-visit cards a card view excludes, so the exclusion can be stated. */
export function excludedSingleVisitCards(members: Members) {
  const r = members.opportunity.candidates.byBand.find(
    (x) => !x.isMember && x.visitBand === 1,
  );
  return { people: r?.people ?? 0, spend: r?.spend ?? 0 };
}

export function valueBands(segments: Segments, tier?: "member" | "card") {
  const rows = tier ? segments.rows.filter((r) => r.tier === tier) : segments.rows;
  const by = new Map<number, SegmentRow[]>();
  for (const r of rows) by.set(r.valueBand, [...(by.get(r.valueBand) ?? []), r]);
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([band, rs]) => ({
      band,
      guests: rs.reduce((a, r) => a + r.guests, 0),
      spend: rs.reduce((a, r) => a + r.spend, 0),
      minSpend: Math.min(...rs.map((r) => r.minSpend)),
      maxSpend: Math.max(...rs.map((r) => r.maxSpend)),
    }));
}

// ── §5.6: the opportunity, at a size somebody can act on ────────────────────

/**
 * The enrolment opportunity per venue per week.
 *
 * **Nobody can act on a $1.3m estate-wide lottery figure.** A venue manager can
 * act on a number for their own site this week, and that is the only form of
 * this figure that ever changes what anyone does on a Tuesday.
 *
 * Two quantities come back and they are **never merged**, because they are
 * different things and the difference is roughly nine to one:
 *
 * - `trade` is what these guests already spend. It is what is at stake — the
 *   revenue that would come onto a name if they enrolled — and it is the figure
 *   §5.6 quotes at about $5,270.
 * - `upliftLo`/`upliftHi` are the *additional* spend enrolling would cause,
 *   sized on the within-person estimate and carried as an interval because a
 *   point estimate off a +3.0% to +19.3% spread is false precision.
 *
 * Publishing the trade alone invites it to be read as uplift, which would
 * overstate the prize by about nine times. Publishing the uplift alone loses the
 * thing a manager can actually see on their own floor. Both, labelled.
 */
export function opportunityPerVenueWeek(
  opp: Members["opportunity"],
  org: Org,
): { trade: number; upliftLo: number; upliftHi: number; weeks: number; venues: number } {
  const venues = Math.max(org.venues.length, 1);
  const weeks = Math.max(Math.round(org.window.days / 7), 1);
  const per = (v: number) => v / venues / weeks;
  return {
    trade: per(opp.candidates.spend),
    upliftLo: per(opp.uplift?.valueLo ?? 0),
    upliftHi: per(opp.uplift?.valueHi ?? 0),
    weeks,
    venues,
  };
}

// ── the basket: what each tier is actually buying ───────────────────────────

export type MixRow = {
  key: string;
  label: string;
  memberLines: number;
  nonMemberLines: number;
  memberShare: number;
  nonMemberShare: number;
  memberRevenue: number;
  nonMemberRevenue: number;
  /** Member share over non-member share. Null below the evidence floor. */
  index: number | null;
  lines: number;
};

/**
 * The member and non-member basket, side by side, rolled up to the reporting
 * group.
 *
 * ── Why the rollup, and why the index ──────────────────────────────────────
 *
 * Coffee Guru carries 62 categories and 33 of them fall below the evidence
 * floor, so a category-grain table is mostly suppressed rows. The reporting
 * group is the level the question is actually asked at — *are members buying
 * food or coffee* — and it is the level the answer survives at.
 *
 * The **index** is the object with information in it, not the top list. A top
 * list of what regulars buy is the top list of what everybody buys, because
 * popular things are popular; the operator already knows it and it tells them
 * nothing. What they cannot see without this is that members buy wraps at
 * **0.47×** the rate everybody else does.
 *
 * Shares are of each tier's own product lines, so a tier that simply buys more
 * does not index above 1.0 on everything.
 *
 * **This is association, not effect.** People who drink a coffee every morning
 * are the people who enrol; the mix does not say enrolment changed anyone's
 * basket. It is the same distinction as the 4.9× cross-sectional gap, and it
 * travels with the same caveat.
 */
export function basketMix(items: Items, level: "type" | "category" = "type"): MixRow[] {
  const by = new Map<string, { label: string; m: number; n: number; mr: number; nr: number }>();
  for (const c of items.categoryMix) {
    const key = level === "type" ? (c.type ?? "(no reporting group)") : c.categoryId;
    const label = level === "type" ? (c.type ?? "No reporting group") : c.category;
    const g = by.get(key) ?? { label, m: 0, n: 0, mr: 0, nr: 0 };
    g.m += c.member.lines;
    g.n += c.nonMember.lines;
    g.mr += c.member.revenue;
    g.nr += c.nonMember.revenue;
    by.set(key, g);
  }
  const M = items.totals.memberProductLines || 1;
  const N = items.totals.nonMemberProductLines || 1;
  const floor = items.totals.minLinesForIndex;

  return [...by.entries()]
    .map(([key, g]) => {
      const memberShare = g.m / M;
      const nonMemberShare = g.n / N;
      return {
        key,
        label: g.label,
        memberLines: g.m,
        nonMemberLines: g.n,
        memberShare,
        nonMemberShare,
        memberRevenue: g.mr,
        nonMemberRevenue: g.nr,
        // Withheld rather than guessed below the floor, in the same pattern as
        // a venue pair below the shared-guest bar.
        index: g.m >= floor && g.n >= floor && nonMemberShare > 0 ? memberShare / nonMemberShare : null,
        lines: g.m + g.n,
      };
    })
    .sort((a, b) => b.lines - a.lines);
}

/**
 * The sentence the mix supports, or null when it does not support one.
 *
 * The build's standing rule is that a claim carries its basis, so the headline
 * is generated from the measured extremes rather than written once and left to
 * drift away from the data behind it.
 */
export function basketStory(
  mix: MixRow[],
): { over: MixRow; under: MixRow; spread: number } | null {
  const ranked = mix.filter((r) => r.index != null).sort((a, b) => b.index! - a.index!);
  if (ranked.length < 3) return null;
  const over = ranked[0];
  const under = ranked[ranked.length - 1];
  // A spread this small is two tiers buying the same things, which is a real
  // and publishable answer — but it is not the sentence below.
  if (over.index! / under.index! < 1.3) return null;
  return { over, under, spread: over.index! / under.index! };
}

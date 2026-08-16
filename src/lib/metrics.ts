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
  AnalysisWindow, Coverage, DaypartRow, Dayparts, DecompositionRow, Guest, LifecycleRow,
  Members, Network, Org, SegmentRow, Segments,
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
        org.serviceModel === "table"
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
      basis: `${windowShort(w)} · share of people with two or more visits · corrected for scan detection`,
      refusal: null,
      note:
        `Membership is only visible when somebody scans, and members scan on ${scanRatePct(m.detection.scanPerVisit)} of visits, ` +
        `so members who came once are the ones most likely to be missed entirely. Uncorrected this reads ` +
        `${pct(m.detection.observedRepeatRate)}; the figure shown is the corrected one.`,
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
export function habit(g: Guest): string | null {
  if (g.cadenceDays == null || g.visits < 3) return null;
  return `usually every ${Math.round(g.cadenceDays)}d · last seen ${g.daysSince}d ago`;
}

/** How overdue this guest is against their own cadence, not a fixed rule. */
export function overdueRatio(g: Guest): number | null {
  if (g.cadenceDays == null || g.cadenceDays <= 0 || g.visits < 3) return null;
  return g.daysSince / g.cadenceDays;
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
  revenueChange: number;
  terms: { key: string; label: string; value: number; kind: "real" | "price"; operand: string }[];
  real: number;
  price: number;
};

const TERMS = [
  { key: "guests", label: "guests", kind: "real" as const },
  { key: "visitsPerGuest", label: "visits per guest", kind: "real" as const },
  { key: "itemsPerVisit", label: "items per visit", kind: "real" as const },
  { key: "pricePerItem", label: "price per item", kind: "price" as const },
];

/**
 * Labels state the *direction the factor moved*, never the direction its name
 * implies. v1 rendered `Visiting more often` against −$2,913 and `Paying more
 * per item` against −$287.83, because the labels were hard-coded to the positive
 * sense of the factor.
 */
export function decompose(from: DecompositionRow, to: DecompositionRow): Decomposition {
  const keys = TERMS.map((t) => t.key) as (keyof DecompositionRow)[];
  const a = keys.map((k) => Number(from[k]));
  const b = keys.map((k) => Number(to[k]));
  const values = shapley(a, b);
  const terms = TERMS.map((t, i) => {
    const moved = b[i] - a[i];
    const dir = moved >= 0 ? "More" : "Fewer";
    const priceDir = moved >= 0 ? "Higher" : "Lower";
    const label = t.kind === "price" ? `${priceDir} ${t.label}` : `${dir} ${t.label}`;
    const fmt = (v: number) => (t.key === "guests" ? count(v) : v.toFixed(2));
    return { ...t, label, value: values[i], operand: `${fmt(a[i])} → ${fmt(b[i])}` };
  });
  return {
    from, to,
    revenueChange: to.revenue - from.revenue,
    terms,
    real: terms.filter((t) => t.kind === "real").reduce((s, t) => s + t.value, 0),
    price: terms.filter((t) => t.kind === "price").reduce((s, t) => s + t.value, 0),
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

export function rollUpSegments(segments: Segments, tier?: "member" | "card") {
  const rows = tier ? segments.rows.filter((r) => r.tier === tier) : segments.rows;
  const by = new Map<string, { guests: number; visits: number; spend: number; multiVenue: number }>();
  for (const r of rows) {
    const key = r.segment ?? "unclassified";
    const cur = by.get(key) ?? { guests: 0, visits: 0, spend: 0, multiVenue: 0 };
    by.set(key, {
      guests: cur.guests + r.guests,
      visits: cur.visits + r.visits,
      spend: cur.spend + r.spend,
      multiVenue: cur.multiVenue + r.multiVenue,
    });
  }
  return SEGMENT_ORDER.map((s) => ({
    segment: s,
    label: SEGMENT_LABEL[s],
    ...(by.get(s) ?? { guests: 0, visits: 0, spend: 0, multiVenue: 0 }),
  })).filter((s) => s.guests > 0);
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

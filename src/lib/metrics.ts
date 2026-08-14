/**
 * Derived metrics. Every figure a screen shows comes from here, so two surfaces
 * cannot disagree — the failure the live Customer Report ships today, where the
 * chart says 761 and the table says 758.
 */
import type {
  Coverage, DecompositionRow, Guest, Guests, LifecycleRow, Org, SegmentRow, Segments,
} from "./types";

// ── formatting ──────────────────────────────────────────────────────────────

/** Tiles round to the nearest ten. Grids and exports never round. */
export const tileCount = (n: number) => Math.round(n / 10) * 10;

export const money = (n: number, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", {
    style: "currency", currency, maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);

export const count = (n: number) => new Intl.NumberFormat("en-AU").format(Math.round(n));
export const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`;

export const monthLabel = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    month: long ? "long" : "short", year: "numeric", timeZone: "UTC",
  });

export const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

// ── coverage, and the honesty it requires ───────────────────────────────────

export type CoverageState = {
  /** Revenue grain is the primary measure. Transaction grain names its denominator. */
  identifiedRevenueShare: number;
  memberRevenueShare: number;
  cardRevenueShare: number;
  identifiedOrderShare: number;
  memberOrderShare: number;
  /** The months the card tier can be trusted, most recent last. */
  cardMonths: string[];
  /** The most recent unbroken run of trustworthy card months. */
  currentWindow: { start: string; end: string; months: number } | null;
  /** Months excluded, with the reason, so a gap in a chart is explained not hidden. */
  gaps: { month: string; reason: string }[];
  /** True when the card tier covers the whole analysis window. */
  cardTierComplete: boolean;
  asOf: string;
};

export function coverageState(org: Org, coverage: Coverage): CoverageState {
  const t = coverage.totals;
  const cardMonths = [...org.cardTier.months].sort();
  const gaps = org.cardTier.quality
    .filter((q) => !q.ok)
    .map((q) => ({ month: q.month, reason: q.reason ?? "unavailable" }));

  // Walk back from the most recent month while the months stay contiguous.
  let currentWindow: CoverageState["currentWindow"] = null;
  if (cardMonths.length) {
    const step = (m: string, back: number) => {
      const d = new Date(`${m}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - back);
      return d.toISOString().slice(0, 10);
    };
    let i = cardMonths.length - 1;
    while (i > 0 && cardMonths[i - 1] === step(cardMonths[i], 1)) i--;
    currentWindow = {
      start: cardMonths[i],
      end: cardMonths[cardMonths.length - 1],
      months: cardMonths.length - i,
    };
  }

  // Shares are measured over the *current* card window, not over every month that
  // ever worked. Coffee Guru's card capture ran, broke for ten months, and was
  // repaired; averaging the three periods produces a number that describes none of
  // them and understates what the merchant would get today. The history is in the
  // chip, one click away.
  const live = new Set(
    currentWindow
      ? cardMonths.filter((m) => m >= currentWindow!.start && m <= currentWindow!.end)
      : cardMonths,
  );
  const liveMonths = coverage.monthly.filter((m) => live.has(m.month));
  const liveRevenue = liveMonths.reduce((a, m) => a + m.revenue, 0) || t.revenue;
  const liveMember = liveMonths.reduce((a, m) => a + m.memberRevenue, 0);
  const liveCard = liveMonths.reduce((a, m) => a + m.cardRevenue, 0);

  // Transaction grain is the secondary measure and names its own denominator, so
  // it is counted over the same window rather than inferred from the revenue share.
  const liveOrders = liveMonths.reduce((a, m) => a + m.orders, 0) || t.orders;
  const liveIdentifiedOrders = liveMonths.length
    ? liveMonths.reduce((a, m) => a + m.memberOrders + m.cardOrders, 0)
    : t.memberOrders + t.cardOrders;

  return {
    identifiedRevenueShare: (liveMember + liveCard) / liveRevenue,
    memberRevenueShare: liveMember / liveRevenue,
    cardRevenueShare: liveCard / liveRevenue,
    identifiedOrderShare: liveIdentifiedOrders / liveOrders,
    memberOrderShare: t.memberOrders / t.orders,
    cardMonths,
    currentWindow,
    gaps,
    cardTierComplete: gaps.length === 0,
    asOf: coverage.monthly.at(-1)?.month ?? org.window.end,
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

/** Member-tier flow. The card tier gets counts but no lapse judgement — reissue
 *  is unmeasured, so "lost" on a card is a claim we cannot support. */
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
 * Drop a trailing partial month.
 *
 * The extract runs mid-month, so the last row is a fortnight of trade. Comparing
 * it to a full month makes growth look like collapse, which is the single easiest
 * way to lose a room. Charts may show it; headline figures never do.
 */
export function completeMonths<T extends { month: string }>(rows: T[], windowEnd: string): T[] {
  if (!rows.length) return rows;
  const end = new Date(`${windowEnd}T00:00:00Z`);
  const lastDayOfEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const partial = end.getUTCDate() < lastDayOfEndMonth;
  const endMonth = `${windowEnd.slice(0, 7)}-01`;
  return partial ? rows.filter((r) => r.month !== endMonth) : rows;
}

/** How this person actually behaves, in the words an operator would use. */
export function habit(g: Guest, org: Org): string {
  const cadence = Math.round(g.cadenceDays ?? org.calibration.medianGapDays);
  return `usually every ${cadence}d · ${g.daysSince}d ago`;
}

/** Same month last year, for the reference line the trend needs to be readable. */
export function sameMonthLastYear<T extends { month: string }>(rows: T[], month: string): T | undefined {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return rows.find((r) => r.month === d.toISOString().slice(0, 10));
}

// ── revenue decomposition ───────────────────────────────────────────────────

/**
 * Symmetric Shapley decomposition of a multiplicative model.
 *
 * Revenue = guests × visits-per-guest × items-per-visit × price-per-item. When
 * revenue moves, each factor gets the average of its marginal contribution across
 * every order in which the factors could have changed. Unlike a sequential
 * (chained) split, the answer does not depend on the order the analyst happened to
 * pick, and unlike a log/LMDI split it needs no residual term: the parts sum to
 * the whole exactly. That is what lets the waterfall be drawn without a
 * "everything else" bar, which is the bar an operator stops trusting the chart at.
 */
export function shapley(from: number[], to: number[]): number[] {
  const n = from.length;
  const fact = (k: number) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; };
  const weight = (s: number) => (fact(s) * fact(n - 1 - s)) / fact(n);

  return from.map((_, i) => {
    const delta = to[i] - from[i];
    let acc = 0;
    // Enumerate every subset of the other factors already moved to period 1.
    const others = [...Array(n).keys()].filter((j) => j !== i);
    for (let mask = 0; mask < 1 << others.length; mask++) {
      let product = 1;
      let size = 0;
      others.forEach((j, bit) => {
        const moved = (mask >> bit) & 1;
        if (moved) size++;
        product *= moved ? to[j] : from[j];
      });
      acc += weight(size) * delta * product;
    }
    return acc;
  });
}

export type Decomposition = {
  from: DecompositionRow;
  to: DecompositionRow;
  revenueChange: number;
  terms: { key: string; label: string; value: number; kind: "real" | "price" }[];
  /** Growth attributable to more trade, versus growth attributable to charging more. */
  real: number;
  price: number;
};

const TERMS = [
  { key: "guests", label: "More guests", kind: "real" as const },
  { key: "visitsPerGuest", label: "Visiting more often", kind: "real" as const },
  { key: "itemsPerVisit", label: "Buying more per visit", kind: "real" as const },
  { key: "pricePerItem", label: "Paying more per item", kind: "price" as const },
];

export function decompose(from: DecompositionRow, to: DecompositionRow): Decomposition {
  const keys = TERMS.map((t) => t.key) as (keyof DecompositionRow)[];
  const a = keys.map((k) => Number(from[k]));
  const b = keys.map((k) => Number(to[k]));
  const values = shapley(a, b);
  const terms = TERMS.map((t, i) => ({ ...t, value: values[i] }));
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
  "one-visit": "Seen once",
};

export const SEGMENT_ORDER = ["regular", "established", "slipping", "lapsed", "one-visit"] as const;

export function rollUpSegments(segments: Segments, tier?: "member" | "card") {
  const rows = tier ? segments.rows.filter((r) => r.tier === tier) : segments.rows;
  const by = new Map<string, { guests: number; visits: number; spend: number; multiVenue: number }>();
  for (const r of rows) {
    const cur = by.get(r.segment) ?? { guests: 0, visits: 0, spend: 0, multiVenue: 0 };
    by.set(r.segment, {
      guests: cur.guests + r.guests,
      visits: cur.visits + r.visits,
      spend: cur.spend + r.spend,
      multiVenue: cur.multiVenue + r.multiVenue,
    });
  }
  return SEGMENT_ORDER.map((s) => ({ segment: s, label: SEGMENT_LABEL[s], ...(by.get(s) ?? { guests: 0, visits: 0, spend: 0, multiVenue: 0 }) }));
}

export function valueBands(segments: Segments, tier?: "member" | "card") {
  const rows = (tier ? segments.rows.filter((r) => r.tier === tier) : segments.rows)
    .filter((r) => r.segment !== "one-visit");
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

// ── the named lists ─────────────────────────────────────────────────────────

export type NamedList = {
  key: string;
  title: string;
  /** What the operator is meant to do, and when. Never a list without an action. */
  action: string;
  why: string;
  guests: Guest[];
  /** True population size; the list itself is capped for a human to act on. */
  total: number;
  valueAtRisk?: number;
};

/**
 * The three lists the front page promises. Each is a group of named people with
 * one thing to do, because a dashboard that ends in a number ends the loop.
 */
/** What this guest is worth over a quarter, at the rate they have actually traded. */
const quarterlyValue = (g: Guest) => (g.spend / Math.max(g.tenureDays, 30)) * 90;

export function namedLists(guests: Guests, org: Org): NamedList[] {
  const rows = guests.rows;

  // A daily customer is "overdue" after three days, which is true and useless.
  // The absence has to be long enough that a phone call is not absurd, so the
  // list takes the later of their own cadence and a week.
  const slipping = rows
    .filter(
      (g) =>
        g.tier === "member" &&
        g.segment === "slipping" &&
        // Eight visits is where a per-day value estimate stops being noise. Below
        // it, one big Saturday makes somebody look like the most valuable guest
        // in the business.
        g.visits >= 8 &&
        g.daysSince >= 7,
    )
    .sort((a, b) => quarterlyValue(b) - quarterlyValue(a));

  const unknownRegulars = rows
    .filter((g) => g.tier === "card" && g.visits >= 8 && g.daysSince <= org.calibration.lapsedDays)
    .sort((a, b) => b.visits - a.visits);

  const secondVisit = rows
    .filter((g) => g.visits === 1 && g.daysSince <= 21)
    .sort((a, b) => b.spend - a.spend);

  return [
    {
      key: "slipping",
      title: "Slipping regulars",
      action: "Call or text them this week",
      why: `Members with a settled habit who are now well past their own usual gap — not a fixed rule applied to everybody.`,
      guests: slipping.slice(0, 25),
      total: slipping.length,
      valueAtRisk: slipping.reduce((a, g) => a + quarterlyValue(g), 0),
    },
    {
      key: "unknown-regulars",
      title: "Regulars we don't know",
      action: "Ask them to join when you recognise the card",
      why: "Card-identified guests visiting at least eight times who have never enrolled. The single largest enrolment opportunity you have.",
      guests: unknownRegulars.slice(0, 25),
      total: unknownRegulars.length,
    },
    {
      key: "second-visit",
      title: "Second-visit candidates",
      action: "Give them a reason to come back inside a fortnight",
      why: "Seen once in the last three weeks. Converting a first visit to a second is where retention is actually won.",
      guests: secondVisit.slice(0, 25),
      total: secondVisit.length,
    },
  ];
}

// ── the Brief ───────────────────────────────────────────────────────────────

export type Brief = {
  /** True when there is genuinely nothing worth saying. The silence state is the
   *  retention model: a brief that always speaks is one nobody reads. */
  silent: boolean;
  headline: string;
  lines: string[];
  names: { name: string; fact: string }[];
  action: string | null;
  wordCount: number;
};

export function preShiftBrief(
  org: Org, lists: NamedList[], flow: Flow[], cov: CoverageState,
): Brief {
  const slipping = lists.find((l) => l.key === "slipping")!;
  const latest = flow.at(-1);
  const names = slipping.guests.slice(0, 5).map((g) => ({
    name: g.name,
    fact: `${g.visits} ${org.labels.visits}, usually every ${Math.round(g.cadenceDays ?? org.calibration.medianGapDays)} days, not seen for ${g.daysSince}`,
  }));

  if (!names.length) {
    return {
      silent: true,
      headline: "Nothing to chase today",
      lines: ["No regular has slipped past their usual gap since the last brief. Good week."],
      names: [],
      action: null,
      wordCount: 0,
    };
  }

  const lines = [
    `${count(slipping.total)} regulars have slipped past their usual gap.`,
    latest && latest.net < 0
      ? `You lost ${count(latest.lost)} and gained ${count(latest.gained)} in ${monthLabel(latest.month)}.`
      : latest
        ? `You gained ${count(latest.gained)} and lost ${count(latest.lost)} in ${monthLabel(latest.month)}.`
        : "",
    `Five worth a word today:`,
  ].filter(Boolean);

  const wordCount = [...lines, ...names.map((n) => `${n.name} ${n.fact}`)]
    .join(" ").split(/\s+/).filter(Boolean).length;

  return {
    silent: false,
    headline: `${count(slipping.total)} regulars slipping`,
    lines,
    names,
    action: slipping.action,
    wordCount,
  };
}

// ── reconciliation ──────────────────────────────────────────────────────────

export type Invariant = { name: string; ok: boolean; detail: string };

/**
 * Reconciliation invariants are a build gate, not a test suite. If one fails the
 * surface renders a failed state rather than a wrong number.
 */
export function invariants(
  coverage: Coverage, segments: Segments, guests: Guests | null, lifecycle: LifecycleRow[],
): Invariant[] {
  const t = coverage.totals;
  const tierSum = t.memberOrders + t.cardOrders + t.unattributedOrders;
  const venueSum = coverage.byVenue.reduce((a, v) => a + v.orders, 0);
  const segSum = segments.rows.reduce((a, r) => a + r.guests, 0);
  const monthlySum = coverage.monthly.reduce((a, m) => a + m.orders, 0);

  const out: Invariant[] = [
    {
      name: "Identity tiers partition every order",
      ok: tierSum === t.orders,
      detail: `${count(tierSum)} of ${count(t.orders)}`,
    },
    {
      name: "Venue totals reconcile to the estate",
      ok: venueSum === t.orders,
      detail: `${count(venueSum)} of ${count(t.orders)}`,
    },
    {
      name: "Monthly totals reconcile to the estate",
      ok: monthlySum === t.orders,
      detail: `${count(monthlySum)} of ${count(t.orders)}`,
    },
    {
      name: "Segment population matches the guest population",
      ok: segSum === segments.population,
      detail: `${count(segSum)} of ${count(segments.population)}`,
    },
    {
      name: "No month reports more lapses than it had active guests",
      ok: lifecycle.every((r) => r.lapsed <= r.active + r.lapsed),
      detail: `${lifecycle.length} months checked`,
    },
  ];

  if (guests) {
    out.push({
      name: "Guest grid is a subset of the true population",
      ok: guests.sampled <= guests.population,
      detail: `${count(guests.sampled)} shown of ${count(guests.population)}`,
    });
  }
  return out;
}

/**
 * Anomaly detection.
 *
 * Two questions, and they are genuinely different:
 *
 *   Cross-sectional — is this venue unlike its peers *right now*?
 *   Longitudinal    — is this venue unlike *itself* this month?
 *
 * A venue can be perfectly normal against the estate and have fallen off a cliff
 * against its own history, and the second is usually the one worth a phone call.
 *
 * Both use the median and the median absolute deviation rather than the mean and
 * standard deviation. With twenty venues, one outlier drags the mean toward itself
 * and inflates the deviation, so the test stops finding the thing that broke it —
 * the classic masking failure. MAD has a breakdown point of 50%: half the venues
 * would have to be wrong before it stops working.
 *
 * The cut is a modified z-score of 3.5, which is the conventional threshold and,
 * more usefully, is roughly "this would happen by chance about once in a
 * thousand months". Anything less is noise dressed as a finding, and a panel that
 * cries wolf gets switched off in a fortnight.
 */
import type { VenueMonth } from "./types";
import { completeMonths, monthLabel, money, pct } from "./metrics";

export type Anomaly = {
  id: string;
  kind: "peer" | "history";
  severity: "high" | "moderate";
  /** Modified z-score. Negative means below the norm. */
  z: number;
  venue: string;
  metric: string;
  month?: string;
  headline: string;
  detail: string;
};

// ── robust statistics ───────────────────────────────────────────────────────

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation, scaled to be comparable with a standard deviation. */
export function mad(xs: number[], med = median(xs)): number {
  if (!xs.length) return 0;
  return median(xs.map((x) => Math.abs(x - med)));
}

/**
 * Iglewicz–Hoaglin modified z-score. Returns 0 when the series has no spread,
 * which correctly reports "nothing is unusual" rather than dividing by zero and
 * declaring everything infinitely abnormal.
 */
export function modifiedZ(x: number, xs: number[]): number {
  const med = median(xs);
  const d = mad(xs, med);
  if (d === 0) {
    // Every value identical: only a different value is anomalous at all.
    return x === med ? 0 : Math.sign(x - med) * 4;
  }
  return (0.6745 * (x - med)) / d;
}

const CUT_HIGH = 3.5;
const CUT_MODERATE = 2.5;

// ── the metrics we watch ────────────────────────────────────────────────────

type Metric = {
  key: string;
  label: string;
  /** Null when the month cannot support the metric, so it is skipped not zeroed. */
  get: (v: VenueMonth) => number | null;
  format: (n: number) => string;
  /** Only flag falls, only rises, or both. */
  direction: "below" | "above" | "both";
  /** Minimum orders for the figure to be worth testing. */
  minOrders: number;
  /**
   * Minimum relative change worth reporting.
   *
   * Statistical significance and operational significance are different things. A
   * venue that is normally so steady that a 2% move is three deviations out is a
   * well-run venue, not a problem, and putting it top of the list teaches the
   * operator to ignore the list. Both tests have to pass: unusual *and* big enough
   * that somebody would do something about it.
   */
  minEffect: number;
};

const METRICS: Metric[] = [
  {
    key: "revenue-per-day",
    minEffect: 0.12,
    label: "revenue per trading day",
    get: (v) => (v.tradingDays ? v.revenue / v.tradingDays : null),
    format: money,
    direction: "both",
    minOrders: 100,
  },
  {
    key: "avg-order",
    minEffect: 0.08,
    label: "average order value",
    get: (v) => (v.orders ? v.revenue / v.orders : null),
    format: money,
    direction: "both",
    minOrders: 100,
  },
  {
    key: "member-rate",
    minEffect: 0.15,
    label: "member scan rate",
    get: (v) => (v.orders ? v.memberOrders / v.orders : null),
    format: (n) => pct(n, 1),
    direction: "below",
    minOrders: 200,
  },
  {
    key: "covers-rate",
    minEffect: 0.15,
    label: "party size recorded",
    get: (v) => (v.orders ? v.ordersWithCovers / v.orders : null),
    format: (n) => pct(n, 1),
    direction: "below",
    minOrders: 200,
  },
  {
    key: "discount-rate",
    minEffect: 0.25,
    label: "discount rate",
    get: (v) => (v.revenue ? v.discount / (v.revenue + v.discount) : null),
    format: (n) => pct(n, 1),
    direction: "above",
    minOrders: 200,
  },
];

const flagged = (z: number, dir: Metric["direction"], cut: number) =>
  dir === "below" ? z <= -cut : dir === "above" ? z >= cut : Math.abs(z) >= cut;

// ── detection ───────────────────────────────────────────────────────────────

export function detectAnomalies(
  rows: VenueMonth[],
  cardMonths: string[],
  windowEnd: string,
): Anomaly[] {
  if (!rows.length) return [];
  const out: Anomaly[] = [];
  const all = [...new Set(rows.map((r) => r.month))].sort();
  // Test the last *complete* month. A fortnight of trade fails almost every test
  // for the wrong reason, and a panel whose top finding is "the month is not over"
  // is a panel nobody opens twice.
  const months = completeMonths(all.map((m) => ({ month: m })), windowEnd).map((m) => m.month);
  const latest = months.at(-1);
  if (!latest) return [];
  const card = new Set(cardMonths);

  // ── cross-sectional: this venue against its peers, in the latest month ────
  const latestRows = rows.filter((r) => r.month === latest);
  for (const m of METRICS) {
    const peers = latestRows
      .filter((r) => r.orders >= m.minOrders)
      .map((r) => ({ row: r, value: m.get(r) }))
      .filter((p): p is { row: VenueMonth; value: number } => p.value !== null);
    if (peers.length < 5) continue;

    const values = peers.map((p) => p.value);
    const med = median(values);

    for (const p of peers) {
      const z = modifiedZ(p.value, values);
      if (!flagged(z, m.direction, CUT_MODERATE)) continue;
      if (!med || Math.abs(p.value - med) / med < m.minEffect) continue;
      out.push({
        id: `peer-${m.key}-${p.row.storeId}`,
        kind: "peer",
        severity: Math.abs(z) >= CUT_HIGH ? "high" : "moderate",
        z,
        venue: p.row.storeName,
        metric: m.label,
        month: latest,
        headline: `${p.row.storeName}: ${m.label} is ${z < 0 ? "well below" : "well above"} every other venue`,
        detail:
          `${m.format(p.value)} in ${monthLabel(latest)} against an estate median of ${m.format(med)} — ` +
          `${Math.abs(z).toFixed(1)} robust deviations from the middle of the estate. Far enough out ` +
          `that it reflects how the venue operates or how it is set up, not ordinary variation.`,
      });
    }
  }

  // ── longitudinal: this venue against its own history, de-trended ─────────
  //
  // Testing a venue's raw series against itself flags every venue at once when
  // the whole estate moves — a price rise, a quiet January, a school holiday.
  // What we actually want is divergence from peers, so each month's value is
  // expressed as a ratio to the estate median for that same month before the test
  // runs. An estate-wide move cancels; a venue-specific one survives.
  const byVenue = new Map<string, VenueMonth[]>();
  for (const r of rows) byVenue.set(r.storeId, [...(byVenue.get(r.storeId) ?? []), r]);

  const estateMedian = new Map<string, Map<string, number>>();
  for (const m of METRICS) {
    const perMonth = new Map<string, number>();
    for (const month of months) {
      const vals = rows
        .filter((r) => r.month === month && r.orders >= m.minOrders)
        .map((r) => m.get(r))
        .filter((v): v is number => v !== null);
      if (vals.length >= 3) perMonth.set(month, median(vals));
    }
    estateMedian.set(m.key, perMonth);
  }

  for (const [, series] of byVenue) {
    const sorted = series
      .filter((r) => months.includes(r.month))
      .sort((a, b) => a.month.localeCompare(b.month));
    const current = sorted.at(-1);
    if (!current || current.month !== latest || sorted.length < 6) continue;

    for (const m of METRICS) {
      const norm = estateMedian.get(m.key)!;
      // Card-dependent months are only comparable where capture actually worked.
      const usable = (r: VenueMonth) =>
        r.orders >= m.minOrders && norm.has(r.month) && (m.key !== "card-rate" || card.has(r.month));

      const ratio = (r: VenueMonth) => {
        const v = m.get(r);
        const n = norm.get(r.month);
        return v === null || !n ? null : v / n;
      };

      const past = sorted
        .slice(0, -1)
        .filter(usable)
        .map(ratio)
        .filter((v): v is number => v !== null);
      const now = usable(current) ? ratio(current) : null;
      if (now === null || past.length < 5) continue;

      const z = modifiedZ(now, past);
      if (!flagged(z, m.direction, CUT_MODERATE)) continue;

      const raw = m.get(current)!;
      const rawPast = median(
        sorted.slice(0, -1).filter(usable).map((r) => m.get(r)).filter((v): v is number => v !== null),
      );
      const estateNow = norm.get(latest)!;
      const change = rawPast ? (raw - rawPast) / rawPast : 0;
      if (Math.abs(change) < m.minEffect) continue;

      out.push({
        id: `hist-${m.key}-${current.storeId}`,
        kind: "history",
        severity: Math.abs(z) >= CUT_HIGH ? "high" : "moderate",
        z,
        venue: current.storeName,
        metric: m.label,
        month: latest,
        headline: `${current.storeName}: ${m.label} ${z < 0 ? "fell away from" : "pulled ahead of"} the estate`,
        detail:
          `${m.format(raw)} in ${monthLabel(latest)} against ${m.format(rawPast)} over the previous ` +
          `${past.length} months (${pct(Math.abs(change), 0)} ${change < 0 ? "down" : "up"}). ` +
          `Measured relative to the estate — which sat at ${m.format(estateNow)} this month — so a ` +
          `move the whole business made would not appear here. This one is the venue's own, at ` +
          `${Math.abs(z).toFixed(1)} robust deviations.`,
      });
    }
  }

  // Worst first, and a venue that trips several tests should lead.
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/** Venues tripping more than one test are usually one problem, not several. */
export function groupByVenue(anomalies: Anomaly[]) {
  const by = new Map<string, Anomaly[]>();
  for (const a of anomalies) by.set(a.venue, [...(by.get(a.venue) ?? []), a]);
  return [...by.entries()]
    .map(([venue, items]) => ({ venue, items, worst: Math.max(...items.map((i) => Math.abs(i.z))) }))
    .sort((a, b) => b.items.length - a.items.length || b.worst - a.worst);
}

/**
 * Data quality as a product surface, not a caveat.
 *
 * A reporting product that only reports is worth less than one that tells the
 * operator which missing field is costing them an answer. Every finding here names
 * the fix, who owns it, and — the part that makes it act-on-able — the specific
 * question that stays unanswerable until it is fixed.
 *
 * Findings are derived from the data, never hardcoded, so they disappear when the
 * problem does.
 */
import type { ComparisonRow, Coverage, Org } from "./types";
import { pct } from "./metrics";

export type Finding = {
  id: string;
  severity: "blocking" | "material" | "minor";
  title: string;
  detail: string;
  /** The question that cannot be answered until this is fixed. */
  unlocks: string;
  owner: "Venue" | "Oolio";
};

export function qualityFindings(
  org: Org,
  coverage: Coverage,
  comparison: ComparisonRow[],
): Finding[] {
  const out: Finding[] = [];
  const t = coverage.totals;

  // ── party size ────────────────────────────────────────────────────────────
  const identified = comparison.reduce((a, r) => a + r.orders, 0);
  const withCovers = comparison.reduce((a, r) => a + r.ordersWithCovers, 0);
  const coversShare = identified ? withCovers / identified : 0;

  if (org.serviceModel === "table" && coversShare < 0.9) {
    out.push({
      id: "covers",
      severity: coversShare < 0.5 ? "blocking" : "material",
      title: `Party size is missing on ${pct(1 - coversShare, 0)} of orders`,
      detail:
        `This is a table-service business, so every order should carry a cover count. ` +
        `It is recorded on ${pct(coversShare, 0)}. Staff skipping the guest-count prompt is the ` +
        `usual cause, and it is a thirty-second fix at the terminal.`,
      unlocks:
        "Whether members are genuinely worth more, or simply arrive in larger groups. Without party size the comparison cannot be published at all.",
      owner: "Venue",
    });
  }

  if (org.serviceModel === "counter" && coversShare > 0.05 && coversShare < 0.9) {
    out.push({
      id: "covers-counter",
      severity: "minor",
      title: `Party size is recorded on ${pct(coversShare, 0)} of orders and is always one`,
      detail:
        "For counter service that is expected, and it is why per-person value comparisons " +
        "here rest on item mix rather than on covers.",
      unlocks: "Nothing further — this is the correct state for counter service.",
      owner: "Venue",
    });
  }

  // ── enrolment ─────────────────────────────────────────────────────────────
  const memberShare = t.orders ? t.memberOrders / t.orders : 0;
  if (memberShare < 0.25) {
    out.push({
      id: "enrolment",
      severity: memberShare < 0.05 ? "material" : "minor",
      title: `Only ${pct(memberShare, 0)} of orders are scanned to a member`,
      detail:
        `Card recognition covers most of the gap, but a card cannot be emailed. ` +
        `Everything that needs contact details — a message, an offer, a booking reminder — ` +
        `is limited to this ${pct(memberShare, 0)}.`,
      unlocks:
        "Reaching a guest between visits. The card tier can tell you who to recognise at the counter, but only enrolment lets you contact them.",
      owner: "Venue",
    });
  }

  // ── card capture ──────────────────────────────────────────────────────────
  const dead = org.cardTier.quality.filter((q) => q.reason === "no card capture");
  const degraded = org.cardTier.quality.filter((q) => q.reason === "degraded card capture");
  if (dead.length) {
    out.push({
      id: "par",
      severity: "blocking",
      title: `Card recognition produced no usable data for ${dead.length} months`,
      detail:
        `Between ${dead[0].month.slice(0, 7)} and ${dead[dead.length - 1].month.slice(0, 7)}, ` +
        `every card payment carried the same reference — one value across ` +
        `${dead.reduce((a, q) => a + q.txns, 0).toLocaleString("en-AU")} transactions. ` +
        `The field was populated, so no existing coverage check would have caught it.`,
      unlocks:
        "Any card-tier history: the 24-month trend, cohort retention, and whether card guests are returning at all before the repair date.",
      owner: "Oolio",
    });
  }
  if (degraded.length) {
    out.push({
      id: "par-degraded",
      severity: "material",
      title: `Card recognition was partial in ${degraded.length} month${degraded.length > 1 ? "s" : ""}`,
      detail: "Some terminals wrote a per-card reference and others did not, so those months undercount card guests rather than missing them entirely.",
      unlocks: "A continuous card-tier series across the repair boundary.",
      owner: "Oolio",
    });
  }

  const missingPayments = org.cardTier.quality.filter((q) => q.reason === "payments incomplete");
  if (missingPayments.length) {
    out.push({
      id: "payments-gap",
      severity: "material",
      title: `Payment records are incomplete for ${missingPayments.length} month${missingPayments.length > 1 ? "s" : ""}`,
      detail:
        `${missingPayments.map((q) => q.month.slice(0, 7)).join(", ")} carry a small fraction of the expected ` +
        `transaction volume. This is an ingestion gap, not a trading one — order records for those months are intact.`,
      unlocks: "Complete revenue attribution for the affected months.",
      owner: "Oolio",
    });
  }

  // ── venue outliers ────────────────────────────────────────────────────────
  const rates = coverage.byVenue
    .filter((v) => v.orders > 500)
    .map((v) => ({ name: v.storeName, rate: (v.memberOrders + v.cardOrders) / (v.orders || 1) }));
  if (rates.length > 2) {
    const median = [...rates].sort((a, b) => a.rate - b.rate)[Math.floor(rates.length / 2)].rate;
    const laggards = rates.filter((r) => r.rate < median - 0.15).sort((a, b) => a.rate - b.rate);
    if (laggards.length) {
      out.push({
        id: "venue-gap",
        severity: "material",
        title: `${laggards.length} venue${laggards.length > 1 ? "s are" : " is"} well below the rest on recognition`,
        detail:
          `${laggards.slice(0, 3).map((l) => `${l.name} (${pct(l.rate, 0)})`).join(", ")} against a ` +
          `median of ${pct(median, 0)}. A single venue this far below the others usually means a ` +
          `terminal not on Oolio Pay, or an unmapped one — both are fixable in a day.`,
        unlocks: "Estate-wide comparisons that are not distorted by one venue's plumbing.",
        owner: "Oolio",
      });
    }
  }

  const order = { blocking: 0, material: 1, minor: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

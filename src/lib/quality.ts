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
import type { Coverage, Members, Org } from "./types";
import { count, pct } from "./metrics";

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
  members: Members,
): Finding[] {
  const out: Finding[] = [];
  const t = coverage.totals;

  /**
   * ── Party size, judged where it was actually owed ────────────────────────
   *
   * The rule, and it holds across every venue in this dataset without
   * exception: **a party size is expected where a table was attached, and
   * nowhere else.** A takeaway coffee has no covers to record. Every Takeaway,
   * Pickup and Delivery order at all three organisations carries no table and
   * no party size; every Dine In order carries a table.
   *
   * Judging against *all* orders is what this used to do, and it produced two
   * wrong answers at once. Coffee Guru read 20% and was waved through as
   * "expected for counter service" — while its Brookwater venue rang 7,184
   * seated orders and recorded a party size on none of them, which is a real
   * gap costing a real answer. Meanwhile Jamison, Vincentia and Wagga Wagga
   * were recording covers on essentially every seated order and getting no
   * credit for it, because the organisation carried a `serviceModel: "counter"`
   * label that routed the whole merchant away from per-cover analysis.
   *
   * One denominator change separates a business model from a data problem.
   */
  const cb = members.coverBasis;
  const seated = cb.member.ordersSeated + cb.nonMember.ordersSeated;
  const seatedWithCovers = cb.member.seatedWithCovers + cb.nonMember.seatedWithCovers;
  const seatedCoverage = seated ? seatedWithCovers / seated : 0;
  const identified = cb.member.orders + cb.nonMember.orders;
  const seatedShare = identified ? seated / identified : 0;

  /**
   * The venues that are actually missing it, named.
   *
   * An organisation-level share hides the shape: one venue at 0% and eleven at
   * 100% averages to something that looks like a mild, general sloppiness
   * nobody owns. Naming the venue makes it a thirty-second fix at one terminal
   * rather than a policy conversation.
   */
  const offenders = coverage.byVenue
    .filter((v) => v.ordersSeated >= 200 && v.seatedWithCovers / v.ordersSeated < 0.9)
    .map((v) => ({
      name: v.storeName,
      share: v.seatedWithCovers / v.ordersSeated,
      seated: v.ordersSeated,
    }))
    .sort((a, b) => a.share - b.share);

  if (seated > 0 && seatedCoverage < 0.9) {
    out.push({
      id: "covers",
      severity: seatedCoverage < 0.5 ? "blocking" : "material",
      title:
        offenders.length === 1
          ? `${offenders[0].name} is not recording party size on its seated orders`
          : `Party size is missing on ${pct(1 - seatedCoverage, 0)} of seated orders`,
      detail:
        `${pct(seatedShare, 0)} of identified trade here is served at a table, and a party size ` +
        `is recorded on ${pct(seatedCoverage, 0)} of it. Takeaway is excluded — it has no covers ` +
        `to record and never did.` +
        (offenders.length
          ? ` ${offenders
              .slice(0, 4)
              .map((o) => `${o.name} records it on ${pct(o.share, 0)} of ${count(o.seated)} seated orders`)
              .join("; ")}.` +
            (offenders.length > 4 ? ` And ${offenders.length - 4} more.` : "") +
            ` Staff skipping the guest-count prompt is the usual cause, and it is a ` +
            `thirty-second fix at those terminals.`
          : ""),
      unlocks:
        `Whether members are genuinely worth more per head, or simply arrive in smaller groups. ` +
        `Party size sits on ${pct(cb.member.seatedCoverage, 0)} of members' seated orders against ` +
        `${pct(cb.nonMember.seatedCoverage, 0)} of everyone else's, and the member orders that record it ` +
        `average ${Math.round((cb.member.avgOrderWithCovers / Math.max(cb.member.avgOrderWithoutCovers, 1)) * 10) / 10}× those that do not — ` +
        `so the missing share is not missing at random and the comparison cannot be published at all.`,
      owner: "Venue",
    });
  }

  /**
   * A business with almost no seated trade is not missing anything.
   *
   * Reported as a minor finding rather than silently, because the absence of
   * per-cover figures on such a page is otherwise unexplained — and an operator
   * who cannot see why a section is missing assumes it is broken.
   */
  if (seated > 0 && seatedShare < 0.05) {
    out.push({
      id: "covers-counter",
      severity: "minor",
      title: `${pct(seatedShare, 0)} of orders here are served at a table`,
      detail:
        "Almost everything is takeaway, which carries no party size by nature. Per-head " +
        "comparisons on this page therefore rest on item mix rather than on covers.",
      unlocks: "Nothing further — this is the correct state for a counter business.",
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
        "Reaching a guest between visits. Payment identity can tell you who to recognise at the counter, but only enrolment lets you contact them.",
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
        "Any payment-identity history: the 24-month trend, cohort retention, and whether recognised guests are returning at all before the repair date.",
      owner: "Oolio",
    });
  }
  if (degraded.length) {
    out.push({
      id: "par-degraded",
      severity: "material",
      title: `Card recognition was partial in ${degraded.length} month${degraded.length > 1 ? "s" : ""}`,
      detail: "Some terminals wrote a per-card reference and others did not, so those months undercount recognised guests rather than missing them entirely.",
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

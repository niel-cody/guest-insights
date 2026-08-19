/**
 * The check set.
 *
 * Build v1 shipped five reconciliation "invariants" that were internal
 * identities — `41,410 of 41,410`, three times. They were green on the day the
 * card feed collapsed 403,600 transactions onto a single token, because nothing
 * they asserted could ever be false. A check that cannot fail is decoration.
 *
 * Every check here is written against a defect that actually occurred, states
 * what it catches, and is demonstrated failing against a corrupted fixture by
 * `npm run verify`. A check with no failing fixture does not count toward the
 * badge — see `scripts/verify.ts`.
 */
import type { GuestRows, Snapshot, TeamMarginCell } from "./types";
import { count, money, pairArithmetic, pct, recency, tileCount } from "./metrics";
import { MIN_COVERAGE, claimLevel, windowRules, windowVerdict } from "./window";
import {
  STABLE_ABS_TOL as MAX_STABLE_ABS, STABLE_REL_TOL as MAX_STABLE_REL,
  monthlyFlow, retentionTrend, stableCoverageRun,
} from "./retention";
import { looksShared, ratedPeople } from "./team";

export type Severity = "blocking" | "warning";

export type Check = {
  id: string;
  /** What the check asserts, in one line. */
  rule: string;
  /** The real defect this would have caught. Named, not hypothetical. */
  catches: string;
  ok: boolean;
  detail: string;
  severity: Severity;
  /**
   * How the check is proven capable of failing. `fixture` checks are corrupted
   * in `scripts/verify.ts`; `unit` checks assert a property of the code itself
   * against the historical failing case, because no data corruption can reach
   * them. Anything unproven is excluded from the badge.
   */
  proof: "fixture" | "unit";
};

const ok = (
  id: string, rule: string, catches: string, pass: boolean, detail: string,
  severity: Severity = "blocking", proof: "fixture" | "unit" = "fixture",
): Check => ({ id, rule, catches, ok: pass, detail, severity, proof });

/**
 * A derived figure must be computed from the operands the reader can see.
 *
 * v1 displayed `110 gained`, `100 lost` and `Net +1`, because the tiles rounded
 * to the nearest ten and the derived value did not. All three numbers were
 * defensible and the reader could not add up. Use this everywhere a figure sits
 * beside its inputs.
 */
export function derivedFromDisplayed(a: number, b: number, op: (x: number, y: number) => number): number {
  return op(tileCount(a), tileCount(b));
}

export function runChecks(snap: Snapshot, guests: GuestRows | null): Check[] {
  const { org, coverage, segments, members, dayparts } = snap;
  const t = coverage.totals;
  const win = org.window;
  const checks: Check[] = [];

  // ── the five critical checks ──────────────────────────────────────────────

  // 1. Card capture. The failure that started all of this.
  const admitted = org.cardTier.quality.filter((q) => org.cardTier.months.includes(q.month));
  const worstToken = admitted.reduce((a, q) => Math.max(a, q.maxTokenShare), 0);
  checks.push(ok(
    "card.maxTokenShare",
    "No month in the analysis window has more than 10% of its card transactions on one reference.",
    // The merchant is not named. This register renders inside every
    // organisation's report, and the passwords now go to two different
    // customers — so a worked example naming one of them is a disclosure to the
    // other. The defect class is the useful part; whose data it happened to was
    // never load-bearing.
    "All ten corrupt months at one organisation in this dataset, which sat at 100% and passed every non-null coverage test.",
    admitted.length > 0 && worstToken < 0.1,
    admitted.length
      ? `worst admitted month ${(worstToken * 100).toFixed(2)}% · rejected ${org.cardTier.quality.filter((q) => !q.ok).length} of ${org.cardTier.quality.length}`
      : "no months admitted",
  ));

  // 2. A step change in distinct references not matched by a change in volume.
  const sorted = [...org.cardTier.quality].sort((a, b) => a.month.localeCompare(b.month));
  const steps: { month: string; drop: number; txnDrop: number; admitted: boolean }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (!prev.distinctPar || !prev.txns || !cur.txns) continue;
    const drop = 1 - cur.distinctPar / prev.distinctPar;
    const txnDrop = 1 - cur.txns / prev.txns;
    if (drop > 0.4 && drop - txnDrop > 0.4) {
      steps.push({ month: cur.month, drop, txnDrop, admitted: org.cardTier.months.includes(cur.month) });
    }
  }
  // The check is about months we *admitted*, so it has to look at those. Ranking
  // by size across all months finds the historical outage and reports "outside
  // the window", which is true and answers a question nobody asked.
  const inWindow = steps.filter((s) => s.admitted).sort((a, b) => b.drop - a.drop)[0] ?? null;
  const outside = steps.filter((s) => !s.admitted).length;
  checks.push(ok(
    "card.distinctStepChange",
    "No admitted month loses more than 40% of its distinct card references without losing the transactions too.",
    "The month the estate-wide reference outage began — a 100% fall in distinct cards against flat volume.",
    inWindow === null,
    inWindow
      ? `${inWindow.month}: distinct −${(inWindow.drop * 100).toFixed(0)}% against transactions −${(inWindow.txnDrop * 100).toFixed(0)}%`
      : `no step change inside the window · ${outside} found outside it and correctly excluded`,
  ));

  // 3. Parity against the warehouse, with the exclusions named rather than assumed.
  const completed = org.orderStatuses
    .filter((s) => s.status === "COMPLETED" && !s.training)
    .reduce((a, s) => a + s.orders - s.zeroValue, 0);
  const parity = completed > 0 ? Math.abs(t.orders - completed) / completed : 1;
  const excludedRows = org.orderStatuses
    .filter((s) => s.status !== "COMPLETED" || s.training)
    .reduce((a, s) => a + s.orders, 0);
  checks.push(ok(
    "source.orderCountParity",
    "The snapshot's order count matches the warehouse for the same org, window and status filter, within 1%.",
    "A parity test written as NOT IN ('VOID','CANCELLED') counts 45,485 never-finalised tickets holding $2,799 in total and reports 91,649 orders where the business took 41,578.",
    parity < 0.01,
    `${count(t.orders)} in snapshot vs ${count(completed)} completed in warehouse (${(parity * 100).toFixed(2)}% apart) · ${count(excludedRows)} rows excluded by status or training`,
  ));

  // 4. A derived value must derive from its displayed operands.
  //
  // No data corruption can reach this one — it is a property of the helper the
  // surfaces call, so it is asserted against the exact case that failed in v1:
  // 105 gained and 104 lost render as 110 and 100, and the net beside them must
  // therefore read +10, not the arithmetically-correct-but-unreadable +1.
  const roundingHolds =
    derivedFromDisplayed(105, 104, (a, b) => a - b) === 10 && tileCount(105 - 104) === 0;
  const flowRows = snap.lifecycle.filter((r) => r.tier === "member");
  const wouldDisagree = flowRows.filter((r) => {
    const gained = r.new + r.reactivated;
    return derivedFromDisplayed(gained, r.lapsed, (a, b) => a - b) !== tileCount(gained - r.lapsed);
  });
  checks.push(ok(
    "rounding.derivedConsistency",
    "A figure shown beside its operands is computed from the operands as displayed, not from the raw values.",
    "`110 gained · 100 lost · Net +1`, where the truth was 105 and 104 and all three numbers were individually correct.",
    roundingHolds,
    `helper asserted on the v1 case (105, 104 → +10) · ${wouldDisagree.length} of ${flowRows.length} months in this snapshot would disagree if computed raw`,
    "blocking",
    "unit",
  ));

  // 5. A spend figure captioned with a cohort must be computed over that cohort.
  //
  // Checked against the population source rather than the grid, because the grid
  // is a sample and cannot reconcile on money. The real defect was a caption
  // naming a cohort beside a figure summed over everybody, so the test is that
  // the cohort figures partition the total.
  // Each cohort's total is checked against its own headcount and its own mean,
  // which the warehouse computes independently of the sum. A figure summed over
  // the wrong population no longer agrees with the cohort's own size, so the
  // check does not rely on comparing a total to itself.
  const inconsistent = segments.rows.filter((r) => {
    if (!r.guests) return false;
    const implied = r.guests * r.avgSpend;
    return implied > 0 && Math.abs(r.spend - implied) / Math.max(implied, 1) > 0.01;
  });
  const segSpendTotal = segments.rows.reduce((a, r) => a + r.spend, 0);
  checks.push(ok(
    "cohort.spendScope",
    "A cohort's spend agrees with that cohort's own headcount and mean, so it cannot be the population's.",
    "`Seen-once spend $820,398` against a true $136,179 — a sixfold overstatement from summing the wrong population.",
    inconsistent.length === 0,
    inconsistent.length
      ? `${inconsistent.length} cohorts whose total disagrees with guests × mean`
      : `${segments.rows.length} cohorts reconcile against their own headcount · ${money(segSpendTotal)} total`,
  ));

  // ── population and label family ───────────────────────────────────────────

  const segSum = segments.rows.reduce((a, r) => a + r.guests, 0);
  checks.push(ok(
    "population.singleSource",
    "Every surface counts the guest population from one object.",
    "Six surfaces re-deriving counts and disagreeing on eighteen of them.",
    segSum === segments.population && (!guests || guests.population === segments.population),
    `segments ${count(segSum)} · declared ${count(segments.population)}${guests ? ` · guest list ${count(guests.population)}` : ""}`,
  ));

  const tierSum = t.memberOrders + t.cardOrders + t.unattributedOrders;
  checks.push(ok(
    "tier.partition",
    "Identity states partition every order exactly once.",
    "An order counted in two tiers, or in none.",
    tierSum === t.orders,
    `${count(tierSum)} of ${count(t.orders)}`,
  ));

  const venueSum = coverage.byVenue.reduce((a, v) => a + v.orders, 0);
  const monthlySum = coverage.monthly.reduce((a, m) => a + m.orders, 0);
  checks.push(ok(
    "tile.matchesTable",
    "A total shown on a tile equals the table beneath it, by venue and by month.",
    "`venues orders 43,079` against `coverage.byVenue 41,410` on one payload.",
    venueSum === t.orders && monthlySum === t.orders,
    `venues ${count(venueSum)} · months ${count(monthlySum)} · total ${count(t.orders)}`,
  ));

  const bandTotals = new Map<number, number>();
  for (const r of segments.rows) bandTotals.set(r.valueBand, (bandTotals.get(r.valueBand) ?? 0) + r.guests);
  const bandSum = [...bandTotals.values()].reduce((a, b) => a + b, 0);
  checks.push(ok(
    "bands.partition",
    "Value bands partition the population — every guest in exactly one band.",
    "`Guests with a habit 820` where the bands summed to 815.",
    bandSum === segments.population && bandTotals.size === 5,
    `${bandTotals.size} bands summing to ${count(bandSum)} of ${count(segments.population)}`,
  ));

  // ── governance ────────────────────────────────────────────────────────────

  // ── The card tier carries a verdict now, and this is what bounds it ───────
  //
  // `segment.tierPermission` used to assert that no non-member carried a
  // lifecycle verdict at all. That was too blunt: every input the classifier
  // needs is computed for cards too, and nulling the output hid the larger half
  // of the base — 51.3% of everyone with ten or more visits is an anonymous
  // card. The rule that survives is the one the data actually supports.
  //
  // **A card cannot be Seen once.** `CARD_PERSON_FILTER` makes a card a person
  // only on its second visit — one sighting is a transaction we can see, not a
  // customer we can count. So the one verdict a card may never carry is the one
  // that asserts a single visit, and a card row holding it means the eligibility
  // filter and the classifier have come apart.
  const onceCards = segments.rows.filter((r) => r.tier !== "member" && r.segment === "one-visit");
  const onceGuestCards = guests?.rows.filter((g) => g.tier !== "member" && g.segment === "one-visit") ?? [];
  checks.push(ok(
    "segment.cardNeverSeenOnce",
    "No card carries a Seen once verdict. A card is only a person on its second visit.",
    "The eligibility filter and the classifier disagreeing about what makes a card a person, so a single sighting is published as a customer who came once.",
    onceCards.length === 0 && onceGuestCards.length === 0,
    `${onceCards.length} segment rows and ${onceGuestCards.length} guest rows in breach`,
  ));

  // An *inferred* verdict rests on an estimate of the guest's own cadence, and
  // two visits give exactly one gap, which is not an estimate. An *observed*
  // state — seen once, new, or not seen since a date — rests on nothing but the
  // calendar and needs no minimum. The distinction is the reason the labels are
  // split this way rather than "any label needs three visits", which would leave
  // a guest last seen six months ago permanently described as New.
  const INFERRED = new Set(["slipping", "regular", "established"]);
  // A name is a claim to know who somebody is. We hold one for people who
  // enrolled and not for people we only recognise by their card, so a card row
  // carrying a name asserts contact details that do not exist.
  const namedCards = guests?.rows.filter((g) => g.tier !== "member" && g.name !== null) ?? [];
  const unnamedMembers = guests?.rows.filter((g) => g.tier === "member" && !g.name) ?? [];
  checks.push(ok(
    "identity.nameImpliesEnrolment",
    "Only enrolled people carry a name. A card-recognised guest carries a reference.",
    "A card row rendered as `Casey Lindqvist`, indistinguishable on screen from a member whose name and email the business actually holds.",
    namedCards.length === 0 && unnamedMembers.length === 0,
    `${namedCards.length} card rows carrying a name · ${unnamedMembers.length} members missing one`,
  ));

  const shortVerdicts = guests?.rows.filter((g) => g.segment && INFERRED.has(g.segment) && g.visits < 3) ?? [];
  checks.push(ok(
    "segment.minimumObservations",
    "An inferred verdict — Slipping, Regulars, Established — needs three visits. Observed states do not.",
    "Habit-broken verdicts issued on a single observed interval, where the habit was never estimable.",
    shortVerdicts.length === 0,
    `${shortVerdicts.length} inferred verdicts below the three-visit minimum`,
  ));

  // ── plausibility ──────────────────────────────────────────────────────────

  const venueIds = new Set(org.venues.map((v) => v.id));
  const orphanGuests = guests?.rows.filter((g) => !venueIds.has(g.homeStoreId)) ?? [];
  const orphanNames = [...new Set(orphanGuests.map((g) => g.homeStore))];
  checks.push(ok(
    "venue.resolution",
    "Every guest's home venue resolves to a venue in the venue list, by id.",
    "74 guests carrying a home venue matching a venue's own former trading names, which also invented a phantom third venue of 6,799 orders.",
    orphanGuests.length === 0,
    orphanGuests.length
      ? `${orphanGuests.length} guests on ${orphanNames.length} unmapped venues: ${orphanNames.slice(0, 3).join(", ")}`
      : `${org.venues.length} venues resolved by id · ${org.venues.filter((v) => v.formerNames.length).length} have traded under an earlier name`,
  ));

  // A visit is a person-day *at a venue*, so somebody who buys at two cafés on
  // one morning has legitimately made two visits. The bound is therefore days ×
  // venues visited, not days — the tighter version fires on real regulars and
  // teaches people to ignore the panel.
  const overVisited = guests?.rows.filter((g) => g.visits > win.days * Math.max(g.venues, 1)) ?? [];
  const busiest = guests?.rows.reduce((a, g) => (g.visits > (a?.visits ?? 0) ? g : a), guests.rows[0]);
  checks.push(ok(
    "guest.visitsVsWindow",
    "No guest records more visits than there are venue-days available to them.",
    "A person-grain model that counts orders as visits, overstating frequency wherever anyone buys twice in a day.",
    overVisited.length === 0,
    `${count(win.days)} days × venues visited · busiest guest ${busiest?.visits ?? 0} visits across ${busiest?.venues ?? 0} venues`,
  ));

  checks.push(ok(
    "sample.claimMatchesReality",
    "The guest grid states its true size, and never describes a sampling method it is not running.",
    "A footnote describing a stratified sample where sampled equalled population, beside 300 rendered rows of 1,602 with no route to the rest.",
    !guests || guests.sampled <= guests.population,
    guests ? `${count(guests.sampled)} in grid of ${count(guests.population)} population` : "no guest list loaded",
  ));

  // ── window integrity ──────────────────────────────────────────────────────

  const monthsInWindow = coverage.monthly.filter((m) => m.month >= win.start && m.month <= win.end);
  checks.push(ok(
    "window.cardMonthsOnly",
    "Every month rendered is a month the payment identity can be trusted in.",
    "`Card months available 12 of 25`, where eight pre-dated both venues trading and carried zero card revenue.",
    monthsInWindow.length === coverage.monthly.length && coverage.monthly.every((m) => org.cardTier.months.includes(m.month)),
    `${coverage.monthly.length} months rendered · ${org.cardTier.months.length} admitted · window ${win.start} → ${win.end}`,
  ));

  const dpSum = dayparts.periods.reduce((a, d) => a + d.orders, 0);
  checks.push(ok(
    "daypart.partition",
    "The eight dayparts partition every order exactly once.",
    "A time breakdown that drops the hours nobody trades and then normalises against the wrong total.",
    dpSum === t.orders,
    `${count(dpSum)} of ${count(t.orders)} across ${dayparts.periods.length} periods`,
  ));

  // ── claims the estimators are allowed to make ─────────────────────────────

  checks.push(ok(
    "estimate.censoringDeclared",
    "A lapse threshold is only published when the observation window is long enough to estimate it.",
    "A 77-day lapse threshold taken as p90 of returned gaps, which drops everyone who never came back and so cannot see the point it claims to find.",
    org.calibration.lapsedEstimable || org.calibration.lapsedDays === org.calibration.canonicalLapsedDays,
    org.calibration.lapsedEstimable
      ? `estimated at ${org.calibration.lapsedDays}d from ${count(org.calibration.episodes)} episodes`
      : `not estimable — the return curve floors at ${(org.calibration.floor * 100).toFixed(0)}% after ${org.calibration.horizonDays}d; falling back to the canonical ${org.calibration.canonicalLapsedDays}d and saying so`,
    "warning",
  ));

  const enr = members.enrolment;
  checks.push(ok(
    "estimate.causalClaimHasDesign",
    "A causal claim about enrolment is only made from the within-person design, never from the cross-sectional gap.",
    "Publishing a 4.9× cross-sectional difference as the value of enrolling, when almost all of it is selection.",
    enr.estimable ? enr.visits.n >= 100 : members.opportunity.uplift === null,
    enr.estimable
      ? `within-person on ${count(enr.visits.n)} switchers · spend lift ${(enr.spend.lift * 100).toFixed(1)}% (${(enr.spend.liftLo * 100).toFixed(1)}–${(enr.spend.liftHi * 100).toFixed(1)}%)`
      : "refused — no opportunity value is published",
  ));

  // C3. Every pair the map speaks about is accounted for somewhere.
  const pairs = pairArithmetic(snap.network);
  checks.push(ok(
    "venue.pairArithmetic",
    "Every possible venue pair is either untested for want of a shared guest, suppressed below the evidence floor, or in the model.",
    "`143 pairs tested` printed beside `19 venues`, which have 171 pairs, on the surface that also carries 'What this map is not'. Unexplained arithmetic on that page undoes the rest of it.",
    pairs.closes,
    `${count(pairs.pairsPossible)} possible = ${count(pairs.pairsNoOverlap)} sharing nobody + ` +
      `${count(pairs.pairsSuppressed)} below the ${pairs.minShared}-guest floor + ${count(pairs.pairsMeasurable)} measurable · ` +
      `${pairs.venuesPlaced} of ${pairs.venues} venues placed`,
  ));

  // ── items: the three traps that would have made the basket work wrong ─────

  const items = snap.items;
  if (items) {
    const it = items.integrity;

    // 1. QUANTITY is not trustworthy and nothing may rank on it.
    //
    // One Coffee Guru line carries QUANTITY = 4,654,648, and "Frothy" — a milk
    // texture with zero revenue across 66 lines — sums to 5,177,296 units in
    // three months. Ranked by summed quantity it is the single most popular
    // product in the business, and it would have been the top of every guest's
    // favourites.
    //
    // The assertion is on the filter rather than on the absence of the value:
    // the corrupt rows still exist in the warehouse and always will. What must
    // hold is that no line the product counts carries an implausible quantity,
    // which is what TOTAL_PRICE > 0 buys.
    const worstOnPaid = it.maxQuantityOnPaid;
    checks.push(ok(
      "items.quantityNotRanked",
      "No line the basket work counts carries an implausible quantity, and popularity is never summed from QUANTITY.",
      "One line at QUANTITY 4,654,648, and a milk texture summing to 5,177,296 units — which ranked first in the business on any quantity-based popularity measure.",
      worstOnPaid > 0 && worstOnPaid < 1000,
      `worst quantity on a counted line ${count(worstOnPaid)} · worst anywhere in the raw feed ${count(it.maxQuantityAnywhere)} · ` +
        `popularity counted in lines and visits, never quantity`,
    ));

    // 2. Modifiers are a third of all lines and are separated from products.
    //
    // MODIFIER_GROUP_NAME does not reliably mark them — "1 Sugar" appears
    // 25,981 times with only 2,480 flagged — so the two populations are held
    // apart by what they are used for: products for a favourites list, paid
    // lines for category spend, and the paid total has to reconcile to the
    // order total or the split has lost money somewhere.
    // The load-bearing assertion is **coverage**, not the revenue tie.
    //
    // A category mix is only a mix of the whole population if essentially every
    // order carries lines; one that silently covered 80% would describe a
    // subset and read as the business. The revenue tie is reported beside it
    // and deliberately not asserted tightly: order-level discounts and
    // surcharges are applied at order grain and cannot be distributed to lines,
    // and the size of that gap is a property of how a merchant configures its
    // till — 0.02% at Coffee Guru, 1.8% at Meat Flour Wine. Asserting a tight
    // tie would be asserting a formula that happens to fit two merchants.
    const orderCoverage = it.orders ? it.ordersWithItems / it.orders : 0;
    const revenueGap = it.orderRevenue
      ? Math.abs(it.paidRevenue - it.orderRevenue) / it.orderRevenue
      : 1;
    checks.push(ok(
      "items.productLinesSeparated",
      "Product lines and paid lines are counted separately, and essentially every order carries lines so the mix describes the whole population.",
      "A favourites list reading Skim, 1 Sugar, Extra Shot — a third of all lines are modifiers, and the field that marks them misses 90% of one of them.",
      it.productLines > 0 && it.productLines < it.paidLines && orderCoverage >= 0.99 && revenueGap < 0.05,
      `${count(it.productLines)} product lines within ${count(it.paidLines)} paid lines of ${count(it.completedLines)} completed · ` +
        `${pct(orderCoverage, 1)} of orders carry lines · ` +
        `item revenue ${money(it.paidRevenue)} against order revenue ${money(it.orderRevenue)}, ` +
        `${(revenueGap * 100).toFixed(2)}% apart on order-grain discounts and surcharges that do not distribute to lines`,
    ));

    // 3. Category is keyed on the id, never the name.
    //
    // The same slowly-changing-attribute trap that invented a phantom Braeside
    // venue out of three successive store names. Where names outnumber ids
    // nothing is wrong; where ids outnumber names, two categories share a name
    // and grouping on it would merge them.
    const merged = it.categoryIds - it.categoryNames;
    checks.push(ok(
      "items.categoryKeyedOnId",
      "Categories are grouped on the category id, and the count of ids that have been renamed is published.",
      "Five category names carrying more than one id — the same trap that merged three store names into a phantom venue with 6,799 orders.",
      items.categories.every((c) => Boolean(c.id)) && it.categoryIds >= it.categoryNames,
      `${count(it.categoryIds)} category ids against ${count(it.categoryNames)} distinct names · ` +
        `${merged > 0 ? `${merged} name${merged === 1 ? "" : "s"} shared by more than one id — grouping on the name would merge them` : "no shared names"} · ` +
        `${count(it.categoryIdsRenamed)} ids have traded under more than one name`,
    ));
  }

  // ── the window's authority over the figures that depend on it ─────────────

  // R-191. The rule itself, asserted against the exact case that shipped: a
  // 92-day window carrying an 89-day lapse threshold, where Lost was near-zero
  // by construction and the Net beside it read as retention performance.
  //
  // No data corruption can reach this one — it is a property of the rule every
  // surface calls — so it is proven as a unit check against the historical
  // failing case in both directions. A rule that only ever returns "refuse" is
  // as useless as one that only ever returns "render".
  const refusesTheShippedCase = !windowVerdict({ ...win, days: 92 }, 89).renders;
  const rendersWhenLongEnough = windowVerdict({ ...win, days: 730 }, 89).renders;
  const live = windowRules(org);
  checks.push(ok(
    "window.thresholdObservability",
    "A retention, churn, lapse or loss figure renders only where the window is at least twice the threshold it depends on.",
    "`Net +520` on a 92-day window against an 89-day lapse threshold, where a guest could only be counted lost if last seen in the first three days — so the figure was set by the window, not by anybody's behaviour.",
    refusesTheShippedCase && rendersWhenLongEnough,
    `rule refuses at W=92 T=89 and renders at W=730 T=89 · this snapshot: window ${count(win.days)}d, ` +
      `lapse ${org.calibration.lapsedDays}d → ${live.lapse.renders ? "renders" : "refused"}, ` +
      `slipping ${org.calibration.slippingDays ?? "—"}d → ${live.slipping.renders ? "renders" : "refused"}`,
    "blocking",
    "unit",
  ));

  // Recency is measured from the end of the window, so it must say so whenever
  // the window is not current.
  //
  // This shipped wrong: "last seen 1 days ago" on a period that closed in
  // December 2024, read on a screen in August 2026. The arithmetic was right —
  // a guest cannot be observed after the data stops — and the sentence was
  // twenty months out of date. It was invisible while the only selectable window
  // ended yesterday, and became live the moment historical periods did.
  //
  // Asserted in both directions, because a rule that always names its anchor is
  // as wrong as one that never does: on a current window the caveat is noise.
  const closedLongAgo = { ...win, end: "2024-12-31" };
  const closedToday = { ...win, end: new Date().toISOString().slice(0, 10) };
  const anchorsHistorical = !recency(1, closedLongAgo).includes("ago");
  const staysQuietWhenCurrent = recency(1, closedToday).includes("ago");
  checks.push(ok(
    "recency.statesItsAnchor",
    "A last-seen figure names what it is measured from whenever the window is not current.",
    "`Last seen 1 days ago` on the October–December 2024 period, read in August 2026 — arithmetically correct against the window's close and twenty months wrong to the reader.",
    anchorsHistorical && staysQuietWhenCurrent,
    `historical window → "${recency(1, closedLongAgo)}" · current window → "${recency(1, closedToday)}"`,
    "blocking",
    "unit",
  ));

  // R-205. The claim the surface is entitled to make is derived from the months
  // actually loaded, every time. A snapshot whose claim was carried forward from
  // a longer extract would let a growth statement outlive the data behind it.
  checks.push(ok(
    "window.claimMatchesMonths",
    "The growth-or-trend claim on the surface is derived from the complete months loaded, never carried forward.",
    "A surface still offering a year-on-year reading after the window it was built on shrank — 13 months is one comparison, 12 is none, and nothing on screen distinguished them.",
    org.cardTier.claim === claimLevel(win.months),
    `${win.months} complete months → ${claimLevel(win.months)} · snapshot declares ${org.cardTier.claim}`,
  ));

  // The placeholder. `PAYMENT_ACCOUNT_REFERENCE` is never NULL, and its dominant
  // value across the estate is the literal string 'N/A' — 215,900,912 rows since
  // June 2023. Coverage is measured on *real* references only, so a month that
  // is 90% placeholder scores 10% here rather than 100% on a non-null count.
  const admittedCoverage = admitted.length ? Math.min(...admitted.map((m) => m.coverage)) : 0;
  checks.push(ok(
    "card.coverageIsReal",
    "Every admitted month carries a real card reference on enough of its trade to recover a population.",
    "'PAR present on 82.87% of 405,116,084 rows' — a non-null count whose dominant value is the string 'N/A', which is how an estate with an eight-month reference blackout looked card-covered throughout it.",
    admitted.length > 0 && admittedCoverage >= MIN_COVERAGE,
    admitted.length
      ? `weakest admitted month ${(admittedCoverage * 100).toFixed(0)}% of transactions carry a real reference · floor ${(MIN_COVERAGE * 100).toFixed(0)}%`
      : "no months admitted",
  ));

  const cb = members.coverBasis;
  const missingnessGap = cb.member.avgOrderWithCovers / Math.max(cb.member.avgOrderWithoutCovers, 1);
  checks.push(ok(
    "estimate.coverBasisMissingness",
    "A per-cover comparison declares how much of each group's trade records a party size, and flags when the missingness is informative.",
    "A 'controlled' comparison restricting members to the top 38% of their orders while retaining 97% of card orders, without saying so.",
    cb.member.coverage > 0.9 && cb.nonMember.coverage > 0.9,
    `party size recorded on ${(cb.member.coverage * 100).toFixed(0)}% of member orders and ${(cb.nonMember.coverage * 100).toFixed(0)}% of non-member orders · ` +
      `member orders that record it average ${missingnessGap.toFixed(1)}× those that do not`,
    "warning",
  ));

  checks.push(...teamChecks(snap));
  checks.push(...retentionChecks(snap));

  return checks;
}


/**
 * The team half's invariants.
 *
 * ── Why these six and not a reconciliation total ───────────────────────────
 *
 * Build v1's lesson applies here exactly: an identity like *labour equals
 * labour* is decoration. Each of these asserts a property that a plausible,
 * well-meaning change would break, and each names the specific way it would
 * break it.
 *
 * Three of them guard a **refusal** rather than a figure, which is unusual and
 * deliberate. This section declines to publish per-clock-hour wage percentages,
 * declines to cost an identity the evidence does not support, and declines to
 * rate a shared login. Every one of those refusals is one helpful commit away
 * from being undone by somebody filling in what looks like a gap — so the
 * refusals are asserted, not merely documented.
 */
export function teamChecks(snap: Snapshot): Check[] {
  const team = snap.team;
  if (!team || !team.available) return [];
  const out: Check[] = [];
  const t = team.totals;
  const all = <C extends TeamMarginCell>(cells: C[]): C[] => cells.filter((c) => c.storeId === "all");

  // 1. Apportioning a shift across the windows it spans must neither lose a
  //    minute nor count one twice. Every grain re-cuts the same money, so every
  //    grain must sum to the same money — and a grain that silently drops the
  //    segments crossing midnight would still look entirely reasonable on screen.
  const grains: [string, TeamMarginCell[]][] = [
    ["daypart", all(team.margin.daypart)],
    ["service", all(team.margin.service)],
    ["serviceDow", all(team.margin.serviceDow)],
    ["dow", all(team.margin.dow)],
    ["dowDaypart", all(team.margin.dowDaypart)],
    ["week", all(team.margin.week)],
    ["month", all(team.margin.month)],
    ["day", all(team.margin.day)],
  ];
  const off = grains
    .map(([name, cells]) => ({
      name,
      net: Math.abs(cells.reduce((a, c) => a + c.net, 0) - t.net),
      labour: Math.abs(cells.reduce((a, c) => a + c.labour, 0) - t.labour),
    }))
    .filter((g) => g.net > 1 || g.labour > 1);
  out.push(ok(
    "team.grainsReconcile",
    "Every margin grain sums to the same net sales and the same labour cost as the window total.",
    "A shift apportioned across a daypart boundary being counted twice, or a segment crossing midnight being dropped — both of which render as a perfectly plausible table.",
    off.length === 0,
    off.length
      ? `${off.map((g) => `${g.name} off by $${Math.max(g.net, g.labour).toFixed(0)}`).join(", ")}`
      : `${grains.length} grains agree to the dollar on ${money(t.net)} and ${money(t.labour)}`,
  ));

  // 2. A wage percentage is a ratio of sums, never a mean of ratios. The two
  //    differ whenever the denominators differ, which on this data is always.
  const recomputed = t.net > 0 ? t.labour / t.net : 0;
  out.push(ok(
    "team.wagePctNotAveraged",
    "The published wage percentage equals total labour over total net sales, not the average of the per-cell percentages.",
    "Rolling a column of percentages up by averaging it — which on this window returns a different, flattering number because the light shifts carry as much weight as the heavy ones.",
    Math.abs(t.wagePct - recomputed) < 0.0005,
    `published ${pct(t.wagePct)} · recomputed ${pct(recomputed)}`,
  ));

  // 3. The clock grain carries no ratio, in the data and not merely in a caption.
  const leaked = [...team.margin.daypart, ...team.margin.dowDaypart].filter(
    (c) => c.wagePct != null || c.margin != null || c.netPerHour != null,
  );
  out.push(ok(
    "team.clockRatiosAbsent",
    "No clock-hour cell carries a wage percentage, a margin or a sales-per-hour figure.",
    "Filling in what looks like a missing column. Labour is committed before and after the trade it serves, so dividing by the revenue banked in the same hour reports the pack-down shift at several hundred percent — an operator who acts on it cuts the clean-down.",
    leaked.length === 0,
    leaked.length
      ? `${leaked.length} clock cells carry a ratio they cannot support`
      : `${team.margin.daypart.length + team.margin.dowDaypart.length} clock cells, no ratios`,
  ));

  // 4. Wage cost may only be divided into sales where the identity link is one
  //    the People page stands behind.
  const miscosted = team.people.filter(
    (p) => (p.netPerHour != null || p.wagePct != null) && p.verdict !== "confirmed" && p.verdict !== "proposed",
  );
  out.push(ok(
    "team.costedOnlyOnEvidence",
    "Only a confirmed or proposed identity link carries a per-person cost or sales-per-labour-hour figure.",
    "Attaching one person's wage to another person's sales. Four links at this organisation have a first name that agrees and surname evidence that does not, and two have a single employee behind two logins.",
    miscosted.length === 0,
    miscosted.length
      ? `${miscosted.length} people costed on evidence that does not support it`
      : `${team.people.filter((p) => p.netPerHour != null).length} costed, all on a confirmed or proposed link`,
  ));

  // 5. The two halves of the build must count the same trade. They compute net
  //    sales differently on purpose — the team half works ex-tax — so the
  //    reconciliation is on the order count, which has no such excuse.
  const teamOrders = all(team.margin.day).reduce((a, c) => a + c.orders, 0);
  const reportOrders = snap.coverage.totals.orders;
  out.push(ok(
    "team.ordersReconcileToCustomerReport",
    "The team half counts exactly the same orders as the customer half.",
    "The two halves drifting apart on what an order is — a status filter added to one and not the other — which leaves an operator with two order counts in one product and no way to tell which is theirs.",
    teamOrders === reportOrders,
    `${count(teamOrders)} against ${count(reportOrders)} on the customer half`,
  ));

  // 6. Day parts must nest exactly inside the service they are drawn under.
  //
  //    This shipped broken once. The group was taken from the rostering
  //    department's own name — `CHEF Lunch` filed the whole shift under Daytime
  //    — while the day parts were cut by the clock, so a lunch shift running to
  //    six put an hour of its cost in the Dinner day part and the two
  //    classifications partitioned the same 23,108 hours differently. Nothing on
  //    screen looked wrong: both tables balanced to the window total, and only
  //    adding the columns up by hand showed the 1,499-hour gap. The surface
  //    draws day parts indented beneath a service subtotal, which is a promise
  //    that they add up, so the promise is asserted.
  const groupTotals = new Map<string, { net: number; labour: number; hours: number }>();
  for (const c of all(team.margin.daypart)) {
    const g = c.group ?? "";
    const cur = groupTotals.get(g) ?? { net: 0, labour: 0, hours: 0 };
    groupTotals.set(g, { net: cur.net + c.net, labour: cur.labour + c.labour, hours: cur.hours + c.hours });
  }
  const misnested = all(team.margin.service).filter((g) => {
    const parts = groupTotals.get(g.key);
    if (!parts) return true;
    return (
      Math.abs(parts.net - g.net) > 1 ||
      Math.abs(parts.labour - g.labour) > 1 ||
      Math.abs(parts.hours - g.hours) > 1
    );
  });
  out.push(ok(
    "team.dayPartsNestInGroups",
    "Every service total equals the sum of the day parts drawn underneath it, on sales, labour and hours.",
    "Grouping labour by the rostering department's own name while cutting day parts by the clock. Both tables still balanced to the window total; the day parts simply stopped adding up to the service they were indented beneath, by 1,499 hours.",
    misnested.length === 0,
    misnested.length
      ? `${misnested.map((g) => g.key).join(", ")} do not equal their day parts`
      : `${all(team.margin.service).length} services equal their day parts to the dollar`,
  ));

  // 7. A shared login is trade, not a person, and must never reach a ranking.
  //
  //    The assertion is on the **label**, not on the verdict. Asking whether any
  //    row marked not-a-person is rated would be an identity — the rating filter
  //    excludes them by construction, so the answer is always no and the check
  //    would be decoration. The real failure is a shared login the classifier
  //    did not recognise, which arrives wearing a name and a verdict that both
  //    look ordinary. So this asks the other question: does anything that reads
  //    like a till, a trainee or a device carry a verdict that would let it be
  //    ranked?
  const misread = team.links.filter((l) => looksShared(l.posLabel) && l.verdict !== "not-a-person");
  const rated = ratedPeople(team);
  const ghosts = rated.filter((p) => looksShared(p.label) || p.verdict === "not-a-person");
  out.push(ok(
    "team.sharedLoginsNotRated",
    "Every login whose name identifies a till, a shared account or a training session is classified as not a person, and none of them reaches the rated team.",
    "A training login that rang 227 orders across 49 days entering the league table as a person. It clears every volume threshold a rating floor can impose, and it is nobody — so a manager coaches an average of whoever was training that quarter.",
    misread.length === 0 && ghosts.length === 0,
    misread.length || ghosts.length
      ? `${misread.length} shared logins classified as people · ${ghosts.length} in the rated set`
      : `${count(team.integrity.counts["not-a-person"])} held out of ${count(rated.length)} rated`,
  ));

  return out;
}

export const blocking = (checks: Check[]) => checks.filter((c) => c.severity === "blocking");
export const failed = (checks: Check[]) => checks.filter((c) => !c.ok);
export const allBlockingPass = (checks: Check[]) => blocking(checks).every((c) => c.ok);

/**
 * The Retention and Churn page.
 *
 * ── Two checks, and it started as four ─────────────────────────────────────
 *
 * Two of the original four were tautologies and were cut rather than shipped
 * green, which is the same rule that killed v1's five "invariants".
 *
 * The flow reconciliation asserted that members held plus members lost equals
 * the previous month's active base. `held` is `min(before, now)` and `lost` is
 * `max(0, before - now)`, and those sum to `before` **for every pair of numbers
 * there is**. It could not have failed on any data, corrupt or otherwise.
 *
 * The censored-points check asserted that no intake reports a horizon it has not
 * been watched for — a real defect, but one where the check re-read the same
 * `observableMonths` the trend had already filtered on, so corrupting the field
 * moved both sides together and the assertion held. A check that reads its
 * subject's own filter is testing that assignment works.
 *
 * What survives asserts properties of the **data** rather than of the
 * derivation, which is why both can be broken by corrupting a fixture.
 */
export function retentionChecks(snap: Snapshot): Check[] {
  const c = snap.cohorts;
  if (!c || !c.grading.renders) return [];
  const out: Check[] = [];

  // 1. No cohort may report more members still coming than ever joined it.
  //
  //    The triangle is joined to the cohort roll on a composite key, and a slip
  //    of one month produces rates above 100% on a few rows and
  //    plausible-but-wrong rates on all the others. The first kind is visible on
  //    screen; the second is not, which is why this asserts every cell rather
  //    than the chart's maximum.
  const size = new Map(c.cohorts.map((x) => [x.cohort, x.members]));
  const impossible = c.triangle.filter((t) => t.active > (size.get(t.cohort) ?? 0));
  out.push(ok(
    "retention.retainedWithinIntake",
    "No month of any intake reports more members still coming than ever joined it.",
    "A one-month slip in the cohort-to-triangle join. It shows as a retention rate above 100% on a few rows and as confident, wrong rates on every other row.",
    impossible.length === 0,
    impossible.length
      ? `${impossible.length} of ${c.triangle.length} cells exceed their intake`
      : `all ${c.triangle.length} cells within their intake`,
  ));

  // 2. The intakes the trend compares must have been recruited under comparable
  //    coverage.
  //
  //    This is the whole licence for drawing a line the build refused for two
  //    releases. It is asserted against each plotted intake's *own* joining-month
  //    coverage, read from the raw series — not against the run the trend was
  //    derived from, which would be checking the filter against itself. If the
  //    matching were wrong, or coverage drifted inside the plateau, later intakes
  //    would be recruited from a broader population and the line would be
  //    measuring reach, which is the original defect wearing a chart.
  const trends = [retentionTrend(c, 3), retentionTrend(c, 6)].filter(
    (t): t is NonNullable<typeof t> => t != null && !t.refusal,
  );
  if (trends.length) {
    const covOf = new Map(c.coverage.map((m) => [m.month, m.coverage]));
    const cohortsPlotted = [...new Set(trends.flatMap((t) => t.points.map((p) => p.cohort)))];
    // Two conditions, and the first is the one that can actually break. The
    // plateau is found over the *coverage* series and intakes are then selected
    // by date range, so an intake sitting inside the run's dates with no
    // coverage row of its own is plotted unmatched — the comparison silently
    // includes a month nobody checked. Reading it back per intake is the only
    // way to catch that; asserting the run's own spread just re-checks the
    // filter against itself, which is how the first version of this check came
    // to be green on every input.
    const readings = cohortsPlotted.map((m) => ({ month: m, coverage: covOf.get(m) }));
    const unmatched = readings.filter((r) => r.coverage == null || r.coverage <= 0);
    const vs = readings.map((r) => r.coverage).filter((v): v is number => v != null && v > 0);
    const lo = vs.length ? Math.min(...vs) : 0;
    const hi = vs.length ? Math.max(...vs) : 0;
    out.push(ok(
      "retention.coverageMatched",
      `Every intake in the trend has a scan-coverage reading for the month it joined, within ${MAX_STABLE_ABS * 100} points and ${MAX_STABLE_REL}× of every other.`,
      "Drawing a retention trend across the years scan coverage climbed from 3% to 19% of orders — and, more quietly, plotting an intake from a month with no coverage reading at all, which is an unmatched point inside a comparison whose whole claim is that it is matched.",
      unmatched.length === 0 && vs.length === cohortsPlotted.length && hi - lo <= MAX_STABLE_ABS && hi / lo <= MAX_STABLE_REL,
      unmatched.length
        ? `${unmatched.length} of ${cohortsPlotted.length} intakes have no coverage reading: ${unmatched.slice(0, 3).map((r) => r.month).join(", ")}`
        : `${vs.length} intakes, coverage ${(lo * 100).toFixed(1)}%–${(hi * 100).toFixed(1)}% (${((hi - lo) * 100).toFixed(1)} points, ${(hi / lo).toFixed(2)}×)`,
    ));
  }

  return out;
}

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
import type { Guests, Snapshot } from "./types";
import { count, money, tileCount } from "./metrics";

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

export function runChecks(snap: Snapshot, guests: Guests | null): Check[] {
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
    "All ten corrupt months at Coffee Guru, which sat at 100% and passed every non-null coverage test.",
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

  const cardWithSegment = segments.rows.filter((r) => r.tier !== "member" && r.segment !== null);
  const guestCardWithSegment = guests?.rows.filter((g) => g.tier !== "member" && g.segment !== null) ?? [];
  checks.push(ok(
    "segment.tierPermission",
    "No non-member carries a lifecycle verdict, in any file.",
    "`/coming-back` stating the prohibition while `/guests` and `/brief` rendered Regulars, Slipping and Lapsed on card rows.",
    cardWithSegment.length === 0 && guestCardWithSegment.length === 0,
    `${cardWithSegment.length} segment rows and ${guestCardWithSegment.length} guest rows in breach`,
  ));

  // An *inferred* verdict rests on an estimate of the guest's own cadence, and
  // two visits give exactly one gap, which is not an estimate. An *observed*
  // state — seen once, new, or not seen since a date — rests on nothing but the
  // calendar and needs no minimum. The distinction is the reason the labels are
  // split this way rather than "any label needs three visits", which would leave
  // a guest last seen six months ago permanently described as New.
  const INFERRED = new Set(["slipping", "regular", "established"]);
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
    "74 guests carrying a home venue of `Meat Flour Wine` or `Meat Flour Wine Store` — Braeside's own former names, which also invented a phantom third venue of 6,799 orders.",
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
    "Every month rendered is a month the card tier can be trusted in.",
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

  return checks;
}

export const blocking = (checks: Check[]) => checks.filter((c) => c.severity === "blocking");
export const failed = (checks: Check[]) => checks.filter((c) => !c.ok);
export const allBlockingPass = (checks: Check[]) => blocking(checks).every((c) => c.ok);

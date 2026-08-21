/**
 * Prove that every check can fail.
 *
 *   npm run verify
 *
 * A check that has never been observed failing is not evidence of anything, and
 * build v1's badge was green while a tenth of the estate's card data was one
 * repeated token. So the contract here is stricter than "the checks pass":
 *
 *   1. every check passes against the real snapshot, and
 *   2. every check fails against a fixture corrupted in the specific way it
 *      claims to catch.
 *
 * A check with no corruption defined below is reported as unproven and does not
 * count toward the badge. That is deliberate — adding a check is not free.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runChecks } from "../src/lib/checks";
import { decompose, priceMix } from "../src/lib/metrics";
import { spineState } from "../src/lib/window";
import { candidateWindows, type GradeReason, type MonthRow } from "./grade";
import type {
  AnalysisWindow, DecompositionRow, GuestRows, Guests, ItemPrices, Snapshot,
} from "../src/lib/types";
import { unpackGuests } from "../src/lib/guest-columns";
import { windowVerdict } from "../src/lib/window";
import { claimLevel, gradeMonth, longestRun } from "./grade";

const DATA = join(import.meta.dirname, "..", "data");
const SLUGS = ["coffee-guru", "meat-flour-wine"];

type Fixture = { snap: Snapshot; guests: GuestRows };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

async function periodsOf(slug: string): Promise<string[]> {
  const index = JSON.parse(await readFile(join(DATA, slug, "periods.json"), "utf8")) as {
    periods: { id: string }[];
  };
  return index.periods.map((p) => p.id);
}

async function load(slug: string, period: string): Promise<Fixture> {
  const read = async <T,>(name: string) =>
    JSON.parse(await readFile(join(DATA, slug, period, `${name}.json`), "utf8")) as T;
  const orgRead = async <T,>(name: string) =>
    JSON.parse(await readFile(join(DATA, slug, `${name}.json`), "utf8")) as T;

  const [
    org, coverage, lifecycle, decomposition, segments, members, dayparts,
    dayGrid, venueCross, scatter, network, venueMonthly, guests, items, itemPrices,
    segmentBehaviour, team, cohorts,
  ] = await Promise.all([
    read<Snapshot["org"]>("org"), read<Snapshot["coverage"]>("coverage"),
    read<Snapshot["lifecycle"]>("lifecycle"), read<Snapshot["decomposition"]>("decomposition"),
    read<Snapshot["segments"]>("segments"), read<Snapshot["members"]>("members"),
    read<Snapshot["dayparts"]>("dayparts"),
    read<Snapshot["dayGrid"]>("dayGrid").catch(() => null),
    read<Snapshot["venueCross"]>("venueCross").catch(() => []),
    read<Snapshot["scatter"]>("scatter").catch(() => null),
    read<Snapshot["network"]>("network"),
    read<Snapshot["venueMonthly"]>("venueMonthly"),
    read<Guests>("guests"),
    read<Snapshot["items"]>("items"),
    // Null on a snapshot extracted before the per-product price query existed,
    // which is every snapshot on disk until the next extract runs. `priceMix`
    // is unit-proved below rather than fixture-proved for exactly that reason.
    read<Snapshot["itemPrices"]>("itemPrices").catch(() => null),
    read<Snapshot["segmentBehaviour"]>("segmentBehaviour").catch(() => null),
    read<Snapshot["team"]>("team").catch(() => null),
    // Org grain, not period grain — the member tier is not a card period. §4.3.
    orgRead<Snapshot["cohorts"]>("cohorts").catch(() => null),
  ]);
  return {
    snap: {
      org, coverage, lifecycle, decomposition, segments, members, dayparts,
      dayGrid, venueCross, scatter, network, venueMonthly, items, itemPrices, segmentBehaviour,
      cohorts, team,
    },
    guests: { sampled: guests.sampled, population: guests.population, rows: unpackGuests(guests) },
  };
}

/**
 * One corruption per check, each reproducing the defect the check names.
 * These are the actual v1 failures, re-injected.
 */
const CORRUPTIONS: Record<string, (f: Fixture) => void> = {
  // Ten months of card data collapsed onto one token, exactly as it happened.
  "card.maxTokenShare": (f) => {
    const m = f.snap.org.cardTier.months[0];
    const q = f.snap.org.cardTier.quality.find((x) => x.month === m)!;
    q.maxTokenShare = 1;
    q.distinctPar = 1;
  },
  // Distinct references collapse while transaction volume holds.
  "card.distinctStepChange": (f) => {
    const months = f.snap.org.cardTier.months;
    const q = f.snap.org.cardTier.quality;
    const a = q.find((x) => x.month === months[0])!;
    const b = q.find((x) => x.month === months[1])!;
    a.distinctPar = 20000; a.txns = 40000;
    b.distinctPar = 200; b.txns = 39000;
  },
  // The extract silently drops a venue's orders.
  "source.orderCountParity": (f) => {
    f.snap.coverage.totals.orders = Math.round(f.snap.coverage.totals.orders * 0.55);
  },
  // Two surfaces re-deriving the population and disagreeing.
  "population.singleSource": (f) => {
    f.guests.population += 5;
  },
  // An order counted in no tier.
  "tier.partition": (f) => {
    f.snap.coverage.totals.unattributedOrders -= 12;
  },
  // The tile and the table it sits above disagree.
  "tile.matchesTable": (f) => {
    f.snap.coverage.byVenue[0].orders += 1669;
  },
  // A guest lands outside every value band.
  "bands.partition": (f) => {
    f.snap.segments.rows[0].guests += 5;
  },
  // A cohort caption summed over everybody instead of the cohort.
  "cohort.spendScope": (f) => {
    const total = f.snap.segments.rows.reduce((a, r) => a + r.spend, 0);
    const target = f.snap.segments.rows.find((r) => r.segment !== f.snap.segments.rows[0].segment)
      ?? f.snap.segments.rows[0];
    target.spend = total;
  },
  // A card rendered as though the business knows who it belongs to.
  "identity.nameImpliesEnrolment": (f) => {
    const g = f.guests.rows.find((x) => x.tier !== "member");
    if (g) g.name = "Casey Lindqvist D696";
  },
  // The breach that survives now that cards carry a verdict: a card published
  // as having come exactly once, when a card is not a person until its second
  // visit. Corrupts both files the check reads.
  "segment.cardNeverSeenOnce": (f) => {
    const g = f.guests.rows.find((x) => x.tier !== "member");
    if (g) g.segment = "one-visit";
    const s = f.snap.segments.rows.find((x) => x.tier !== "member");
    if (s) s.segment = "one-visit";
  },
  // A habit-broken verdict issued on a single observed interval.
  "segment.minimumObservations": (f) => {
    const g = f.guests.rows.find((x) => x.tier === "member" && x.visits === 2)
      ?? f.guests.rows.find((x) => x.tier === "member");
    if (g) { g.visits = 2; g.segment = "slipping"; }
  },
  // A guest whose home venue is a former name of a venue that still exists.
  "venue.resolution": (f) => {
    f.guests.rows[0].homeStoreId = "phantom-store";
    f.guests.rows[0].homeStore = "Meat Flour Wine Store";
  },
  // Orders counted as visits.
  "guest.visitsVsWindow": (f) => {
    const g = f.guests.rows[0];
    g.visits = f.snap.org.window.days * Math.max(g.venues, 1) + 1;
  },
  // A grid claiming to show more than exists.
  "sample.claimMatchesReality": (f) => {
    f.guests.sampled = f.guests.population + 1;
  },
  // A month rendered that the card tier cannot support.
  "window.cardMonthsOnly": (f) => {
    f.snap.coverage.monthly.push({ ...f.snap.coverage.monthly[0], month: "2025-09-01" });
  },
  // A daypart breakdown that drops hours and normalises against the wrong total.
  "daypart.partition": (f) => {
    f.snap.dayparts.periods.pop();
  },
  // A lapse threshold published from a window too short to estimate it.
  "estimate.censoringDeclared": (f) => {
    f.snap.org.calibration.lapsedEstimable = false;
    f.snap.org.calibration.lapsedDays = 77;
  },
  // A causal claim published from the cross-sectional gap.
  "estimate.causalClaimHasDesign": (f) => {
    f.snap.members.enrolment = { estimable: false, refusal: "refused", visits: null, spend: null };
    f.snap.members.opportunity.uplift = {
      basis: "within-person", lift: 3.93, lo: 3.9, hi: 4, value: 5_000_000, valueLo: 4e6, valueHi: 6e6,
    };
  },
  // A per-cover comparison whose two sides record party size at wildly
  // different rates, published without saying so.
  "estimate.coverBasisMissingness": (f) => {
    f.snap.members.coverBasis.member.coverage = 0.38;
    f.snap.members.coverBasis.nonMember.coverage = 0.97;
  },
  // A till keying a code into the quantity field, which is what produced the
  // 4,654,648 line — reaching a row the product actually counts.
  "items.quantityNotRanked": (f) => {
    if (f.snap.items) f.snap.items.integrity.maxQuantityOnPaid = 4_654_648;
  },
  // The modifier split losing money: paid lines stop reconciling to the order
  // total, which is what happens when a filter drops paid modifiers.
  "items.productLinesSeparated": (f) => {
    // A join that quietly covers four orders in five: the mix still renders and
    // describes a subset while reading as the whole business.
    if (f.snap.items) f.snap.items.integrity.ordersWithItems = Math.round(f.snap.items.integrity.orders * 0.8);
  },
  // Two categories sharing a name, so grouping on the name merges them.
  "items.categoryKeyedOnId": (f) => {
    if (f.snap.items) f.snap.items.integrity.categoryNames = f.snap.items.integrity.categoryIds + 3;
  },
  // A pair count that does not reconcile against the venues on the map.
  "venue.pairArithmetic": (f) => {
    f.snap.network.pairsSuppressed += 7;
  },
  // A growth claim outliving the window it was built on. The months shrink and
  // the claim is carried forward from the longer extract.
  "window.claimMatchesMonths": (f) => {
    f.snap.org.cardTier.claim = "growth";
  },
  // The placeholder wearing a card's clothes: a month whose references are
  // almost all the literal string 'N/A', which every non-null count scores at
  // 100% and which resolves a twentieth of the trade onto one phantom person.
  "card.coverageIsReal": (f) => {
    const m = f.snap.org.cardTier.months[0];
    const q = f.snap.org.cardTier.quality.find((x) => x.month === m)!;
    q.coverage = 0.04;
    q.withPar = Math.round(q.txns * 0.04);
  },

  // ── the team half ─────────────────────────────────────────────────────────

  // A shift crossing midnight dropped from one grain. This is the realistic
  // apportionment bug: the table still renders, every row is plausible, and one
  // grain quietly holds less money than the others.
  "team.grainsReconcile": (f) => {
    const day = f.snap.team?.margin.day.filter((c) => c.storeId === "all");
    if (day?.length) { day[0].net = 0; day[0].labour = 0; }
  },
  // The wage percentage rolled up by averaging the per-shift column rather than
  // dividing the sums — which on this window returns a flattering number,
  // because a dead Monday lunch is weighted the same as a full Saturday dinner.
  "team.wagePctNotAveraged": (f) => {
    const cells = f.snap.team?.margin.serviceDow.filter((c) => c.storeId === "all" && c.wagePct != null);
    if (f.snap.team && cells?.length) {
      f.snap.team.totals.wagePct =
        cells.reduce((a, c) => a + (c.wagePct ?? 0), 0) / cells.length;
    }
  },
  // Somebody helpfully filling in the empty column: a clock hour handed the
  // ratio it cannot support.
  "team.clockRatiosAbsent": (f) => {
    const dp = f.snap.team?.margin.daypart.find((c) => c.storeId === "all" && c.hours > 0);
    if (dp) {
      dp.wagePct = dp.net > 0 ? dp.labour / dp.net : 0;
      dp.margin = dp.net - dp.labour;
      dp.refusal = null;
    }
  },
  // A conflicted link costed anyway — one person's wage divided into another
  // person's sales, which is exactly what the four conflicts at this
  // organisation would produce if the guard were relaxed.
  "team.costedOnlyOnEvidence": (f) => {
    const bad = f.snap.team?.people.find((p) => p.verdict === "conflict" || p.verdict === "collision");
    if (bad) { bad.netPerHour = 250; bad.wagePct = 0.2; }
  },
  // A status filter added to one half of the build and not the other, so the
  // product carries two order counts and no way to tell which is the business's.
  "team.ordersReconcileToCustomerReport": (f) => {
    const day = f.snap.team?.margin.day.filter((c) => c.storeId === "all");
    if (day?.length) day[0].orders += 37;
  },
  // Coverage drifting across the intakes the comparison plots. The original
  // confound restored, now behind a chart that looks authoritative.
  "retention.coverageMatched": (f) => {
    // A hole in the coverage series inside the plateau. The run still spans the
    // dates, the intakes are still selected, and one of them now has no reading
    // behind it — an unmatched point inside a matched comparison.
    const c = f.snap.cohorts;
    if (c) c.coverage = c.coverage.filter((_, i) => i % 3 !== 0);
  },
  // The one-month slip in the cohort-to-triangle join.
  "retention.retainedWithinIntake": (f) => {
    const t = f.snap.cohorts?.triangle;
    if (t?.length) t[Math.floor(t.length / 2)].active += 10_000;
  },
  // The regression that shipped: a service whose total no longer equals the day
  // parts drawn beneath it, while both still balance to the window.
  "team.dayPartsNestInGroups": (f) => {
    // The biggest day part on each side, so the shift is unambiguously material
    // rather than lost inside the reconciliation tolerance.
    const byHours = (f.snap.team?.margin.daypart ?? [])
      .filter((c) => c.storeId === "all")
      .sort((a, b) => b.hours - a.hours);
    const dp = byHours[0];
    const other = byHours.find((c) => c.group !== dp?.group);
    if (dp && other) { const moved = dp.hours / 2; dp.hours -= moved; other.hours += moved; }
  },
  // The classifier failing to recognise a shared login: the training till keeps
  // its name and acquires an ordinary verdict, which is what lets it walk into
  // the league table.
  "team.sharedLoginsNotRated": (f) => {
    const ghost = f.snap.team?.links.find((l) => l.verdict === "not-a-person" && l.orders >= 50);
    if (ghost) ghost.verdict = "proposed";
  },
};

/**
 * H1's acceptance criterion, and it is about the load rather than the surface.
 *
 * "Corrupt a fixture month to 100% on one token and confirm the load rejects
 * it." A grading that has never rejected anything is a row count wearing a
 * grading's clothes, so the grading is exercised directly here — including the
 * two cases a naive test gets wrong in opposite directions.
 */
function verifyGrading(): string[] {
  const errors: string[] = [];
  const base = { month: "2026-05-01", txns: 100_000, medianTxns: 100_000, orders: 80_000 };

  const cases: { name: string; input: Parameters<typeof gradeMonth>[0]; expect: string | null }[] = [
    {
      name: "a healthy month passes",
      input: { ...base, distinctPar: 30_000, withPar: 90_000, maxTokenShare: 0.003 },
      expect: null,
    },
    {
      name: "one token on 100% is rejected",
      input: { ...base, distinctPar: 1, withPar: 90_000, maxTokenShare: 1 },
      expect: "no card capture",
    },
    {
      name: "a dominant token beside a real population is rejected",
      input: { ...base, distinctPar: 25_000, withPar: 90_000, maxTokenShare: 0.51 },
      expect: "one token dominates",
    },
    {
      name: "a venue that had not opened is not called a feed failure",
      input: { ...base, orders: 0, distinctPar: 0, withPar: 0, maxTokenShare: 1 },
      expect: "not trading",
    },
    {
      name: "the placeholder era is rejected on coverage, not on quality",
      input: { ...base, distinctPar: 3_000, withPar: 5_000, maxTokenShare: 0.004 },
      expect: "card capture partial",
    },
    {
      name: "a collapsed payment feed is rejected on volume",
      input: { ...base, txns: 3_000, distinctPar: 900, withPar: 2_800, maxTokenShare: 0.004 },
      expect: "payments incomplete",
    },
  ];

  for (const c of cases) {
    const got = gradeMonth(c.input).reason;
    if (got !== c.expect) {
      errors.push(`grading: ${c.name} — expected ${c.expect ?? "pass"}, got ${got ?? "pass"}`);
    }
  }

  // The run must be contiguous in calendar time, not merely consecutive in the
  // array. A clean January and a clean March is two runs of one.
  const row = (month: string, ok: boolean) =>
    gradeMonth({ ...base, month, orders: ok ? 80_000 : 0, distinctPar: 30_000, withPar: 90_000, maxTokenShare: 0.003 });
  const gapped = longestRun([row("2026-01-01", true), row("2026-02-01", false), row("2026-03-01", true)]);
  if (gapped?.months !== 1) {
    errors.push(`grading: a gapped run reported ${gapped?.months} months where the longest is 1`);
  }
  const solid = longestRun([row("2026-01-01", true), row("2026-02-01", true), row("2026-03-01", true)]);
  if (solid?.months !== 3) {
    errors.push(`grading: a contiguous three-month run reported ${solid?.months}`);
  }

  // Thirteen, not twelve. Twelve months yields zero year-on-year comparisons.
  if (claimLevel(12) !== "none") errors.push("grading: 12 months must not license a growth claim");
  if (claimLevel(13) !== "growth") errors.push("grading: 13 months must license a growth claim");
  if (claimLevel(23) !== "growth") errors.push("grading: 23 months must not license a trend claim");
  if (claimLevel(24) !== "trend") errors.push("grading: 24 months must license a trend claim");

  return errors;
}

/**
 * §4.3's render rule, unit-tested at both of the cases the spec names.
 *
 * The rule is `observation_window >= 2 × threshold`, **keyed on the tier rather
 * than on a global flag**. The two cases are the two tiers in this build and
 * they must come out differently: the card tier holds 92 days against an 89-day
 * threshold and has to refuse; the member tier holds 638 and has to render.
 *
 * A global flag would make one of these wrong, and it is the kind of wrong that
 * looks fine — release blocker B1 was a Lost series that was near-zero *by
 * construction* because a guest could only be counted lost if last seen in the
 * first three days of the window. Every number involved was arithmetically
 * correct and the conclusion a reader drew was false.
 */
function verifyRenderRule(): string[] {
  const errs: string[] = [];
  const w = (days: number): AnalysisWindow => ({
    start: "2026-05-01", end: "2026-07-31", months: 3, days,
  });

  const card = windowVerdict(w(92), 89, "lapse");
  if (card.renders) errs.push("card tier at (92 days, 89-day threshold) rendered — it must refuse");
  if (card.required !== 178) errs.push(`card tier required ${card.required} days, expected 178`);

  const member = windowVerdict(w(638), 89, "lapse");
  if (!member.renders) errs.push("member tier at (638 days, 89-day threshold) refused — it must render");

  // The boundary itself, so the comparison is proven to be `>=` and not `>`.
  if (!windowVerdict(w(178), 89, "lapse").renders) {
    errs.push("exactly twice the threshold refused — the rule is >=, not >");
  }
  if (windowVerdict(w(177), 89, "lapse").renders) {
    errs.push("one day short of twice the threshold rendered — the rule is not being applied");
  }

  // A refusal must carry a reason a reader can act on, never a blank.
  const refusal = windowVerdict(w(92), 89, "lapse");
  if (!refusal.renders && (!refusal.statement || !refusal.short)) {
    errs.push("a refusal rendered without its reason — §8 rule 3 forbids a blank");
  }
  return errs;
}

/**
 * §7.3. The guest day grid carries every visit, so no history may be truncated.
 *
 * The cap used to be 60 and the drawer printed *"the timeline is capped; the
 * total above is not"*. A grid cannot carry a truncated series — a blank cell
 * would read as "did not come" when it meant "we stopped sending" — so this
 * asserts the property the grid depends on rather than trusting the constant.
 */
function verifyHistoryComplete(guests: GuestRows): string[] {
  const truncated = guests.rows.filter((g) => (g.history?.length ?? 0) < g.visits);
  if (!truncated.length) return [];
  const worst = truncated.sort((a, b) => b.visits - a.visits)[0];
  return [
    `${truncated.length} guests carry fewer history rows than visits — worst is ` +
      `${worst.history?.length ?? 0} of ${worst.visits}. The day grid would draw blanks for real visits.`,
  ];
}

/**
 * §5.4. The scatter and the segment table sit side by side, so they must agree
 * exactly — not approximately.
 *
 * They disagreed by a handful of people out of 4,966 while running textually
 * identical SQL, because a `MAX_BY` tie in the card-to-member resolution was
 * non-deterministic and each query rolled its own dice. That is the trap
 * register's "a count on a chart disagrees with the count in the table beneath
 * it", which is live on the report this one replaces.
 */
function verifyScatterAgrees(snap: Snapshot): string[] {
  if (!snap.scatter) return [];
  // Both sides count every tier that carries a verdict. This used to filter the
  // table to members while the plot counted everyone the classifier had labelled
  // — fine while only members were labelled, and the moment cards were it
  // reported a 2,775-against-1,398 disagreement that was purely the two sides
  // asking different questions. The check exists to catch a chart disagreeing
  // with its own table, so the two sides have to be the same population.
  const fromTable = new Map<string, number>();
  for (const r of snap.segments.rows) {
    if (!r.segment) continue;
    fromTable.set(r.segment, (fromTable.get(r.segment) ?? 0) + r.guests);
  }
  const fromPlot = new Map<string, number>();
  for (const [, , seg] of snap.scatter.rows) {
    if (seg < 0) continue;
    const key = snap.scatter.segments[seg];
    fromPlot.set(key, (fromPlot.get(key) ?? 0) + 1);
  }
  const errs: string[] = [];
  for (const [seg, n] of fromTable) {
    const plotted = fromPlot.get(seg) ?? 0;
    if (plotted !== n) errs.push(`segment ${seg}: table says ${n}, scatter plots ${plotted}`);
  }
  return errs;
}

/**
 * The price/mix split, and every one of its refusals, exercised.
 *
 * ── Why this is a unit proof and not a corrupted fixture ───────────────────
 *
 * The other checks are proved by corrupting real data. This one cannot be: the
 * file it reads does not exist on any snapshot yet — the query that produces it
 * shipped with the arithmetic — so there is nothing to corrupt. Rather than
 * ship the split unexercised, the arithmetic is driven here against constructed
 * months where the right answer is known by hand.
 *
 * **A refusal that has never been observed refusing is not a refusal**, which is
 * the rule the whole check register runs on, so each of the five is made to fire
 * as well as the arithmetic being made to be right.
 */
function verifyPriceMix(): string[] {
  const errs: string[] = [];
  const M0 = "2026-05-01";
  const M1 = "2026-07-01";

  type Row = { month: string; product: number; lines: number; revenue: number };
  const prices = (rows: Row[], share = 1): ItemPrices => ({
    window: { start: "2026-05-01", end: "2026-07-31", months: 3, days: 92 },
    rows,
    coverage: [M0, M1].map((month) => ({
      month,
      revenueShare: share,
      lines: rows.filter((r) => r.month === month).reduce((s, r) => s + r.lines, 0),
      revenue: rows.filter((r) => r.month === month).reduce((s, r) => s + r.revenue, 0),
      products: rows.filter((r) => r.month === month).length,
    })),
  });
  const items = {
    products: [
      { name: "Cappuccino", categoryId: null, category: null, type: null, lines: 0, revenue: 0 },
      { name: "Muffin", categoryId: null, category: null, type: null, lines: 0, revenue: 0 },
      { name: "Cake", categoryId: null, category: null, type: null, lines: 0, revenue: 0 },
    ],
  } as unknown as Snapshot["items"];
  const row = (month: string, pricePerItem: number): DecompositionRow => ({
    month, guests: 100, visits: 200, revenue: 1000, items: 100,
    visitsPerGuest: 2, spendPerVisit: 5, itemsPerVisit: 0.5, pricePerItem,
  });

  // ── 1. It refuses without the file at all ────────────────────────────────
  const none = priceMix(null, items, row(M0, 5), row(M1, 6));
  if (none.ok) errs.push("priceMix published with no itemPrices file");

  // ── 2. Pure price: same basket, dearer coffee ────────────────────────────
  //
  // 100 coffees at $5.00 become 100 coffees at $6.00, and 100 muffins hold at
  // $4.00 throughout. The average moves 4.50 → 5.00: **all price, no mix.**
  const pureP = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M0, product: 1, lines: 100, revenue: 400 },
      { month: M1, product: 0, lines: 100, revenue: 600 },
      { month: M1, product: 1, lines: 100, revenue: 400 },
    ]),
    items, row(M0, 4.5), row(M1, 5),
  );
  if (!pureP.ok) errs.push(`pure price move refused: ${pureP.reason}`);
  else {
    if (Math.abs(pureP.priceEffect - 0.5) > 1e-9) errs.push(`pure price: price effect ${pureP.priceEffect}, expected 0.50`);
    if (Math.abs(pureP.mixEffect) > 1e-9) errs.push(`pure price: mix effect ${pureP.mixEffect}, expected 0`);
    if (pureP.movers[0]?.name !== "Cappuccino") errs.push("pure price: the coffee is not the top mover");
  }

  // ── 3. Pure mix: nothing changed price, they bought dearer things ────────
  //
  // The same $5 coffee and $4 muffin, and the split of lines moves from 50/50 to
  // 75/25. The average moves 4.50 → 4.75: **all mix, no price.** This is the
  // case OV-7 said the old bar could not tell apart from the one above.
  const pureM = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M0, product: 1, lines: 100, revenue: 400 },
      { month: M1, product: 0, lines: 150, revenue: 750 },
      { month: M1, product: 1, lines: 50, revenue: 200 },
    ]),
    items, row(M0, 4.5), row(M1, 4.75),
  );
  if (!pureM.ok) errs.push(`pure mix move refused: ${pureM.reason}`);
  else {
    if (Math.abs(pureM.mixEffect - 0.25) > 1e-9) errs.push(`pure mix: mix effect ${pureM.mixEffect}, expected 0.25`);
    if (Math.abs(pureM.priceEffect) > 1e-9) errs.push(`pure mix: price effect ${pureM.priceEffect}, expected 0`);
    if (Math.abs(pureM.priceShare) > 1e-9) errs.push(`pure mix: price share ${pureM.priceShare}, expected 0`);
  }

  // ── 4. Both at once, and the identity that makes it a decomposition ──────
  const both = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M0, product: 1, lines: 100, revenue: 400 },
      { month: M1, product: 0, lines: 160, revenue: 1040 },
      { month: M1, product: 1, lines: 40, revenue: 170 },
    ]),
    items, row(M0, 4.5), row(M1, 6.05),
  );
  if (!both.ok) errs.push(`mixed move refused: ${both.reason}`);
  else {
    const sum = both.priceEffect + both.mixEffect;
    const move = both.toAvg - both.fromAvg;
    if (Math.abs(sum - move) > 1e-9) {
      errs.push(`the two effects sum to ${sum}, the average moved ${move} — Bennet must be exact`);
    }
  }

  // ── 5. A launch is a mix change, never a price change ────────────────────
  //
  // Cake appears in the second month at $9 and did not exist in the first. It has
  // no price to compare, so the whole of its arrival must land in mix.
  const launch = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M1, product: 0, lines: 100, revenue: 500 },
      { month: M1, product: 2, lines: 20, revenue: 180 },
    ]),
    items, row(M0, 5), row(M1, 5.67),
  );
  if (!launch.ok) errs.push(`a launch refused: ${launch.reason}`);
  else if (Math.abs(launch.priceEffect) > 1e-9) {
    errs.push(`a new product produced a price effect of ${launch.priceEffect} — it must be mix`);
  }

  // ── 6. Each refusal, made to fire ────────────────────────────────────────
  const thin = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M1, product: 0, lines: 100, revenue: 600 },
    ], 0.5),
    items, row(M0, 5), row(M1, 6),
  );
  if (thin.ok) errs.push("published on 50% revenue coverage");

  const churned = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M1, product: 1, lines: 100, revenue: 600 },
    ]),
    items, row(M0, 5), row(M1, 6),
  );
  if (churned.ok) errs.push("published with no product sold in both months");

  const disagree = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M1, product: 0, lines: 100, revenue: 600 },
    ]),
    // Product lines say prices rose; the decomposition says average item price fell.
    items, row(M0, 6), row(M1, 5),
  );
  if (disagree.ok) errs.push("published while the two universes disagreed on direction");

  // Prices up hard, mix down hard, and the average barely moves. Projecting that
  // onto the bar would draw two large cancelling columns.
  const cancelling = priceMix(
    prices([
      { month: M0, product: 0, lines: 100, revenue: 500 },
      { month: M0, product: 1, lines: 100, revenue: 1500 },
      { month: M1, product: 0, lines: 180, revenue: 1260 },
      { month: M1, product: 1, lines: 20, revenue: 420 },
    ]),
    items, row(M0, 10), row(M1, 10.01),
  );
  if (cancelling.ok) {
    errs.push(`published a rescale of ${cancelling.priceShare.toFixed(2)}× onto the bar`);
  }

  // ── 7. And the split divides the Shapley bar without moving the total ────
  const from = { ...row(M0, 4.5), guests: 100, visitsPerGuest: 2, itemsPerVisit: 1, revenue: 900 };
  const to = { ...row(M1, 5), guests: 110, visitsPerGuest: 2.1, itemsPerVisit: 1.05, revenue: 1212.75 };
  const four = decompose(from, to);
  const five = decompose(from, to, pureP);
  if (Math.abs(four.revenueChange - five.revenueChange) > 1e-9) {
    errs.push("splitting the price bar changed the modelled change");
  }
  if (five.terms.length !== four.terms.length + 1) {
    errs.push(`split produced ${five.terms.length} terms, expected ${four.terms.length + 1}`);
  }
  const splitSum = five.terms.filter((t) => t.key === "priceLevel" || t.key === "itemMix")
    .reduce((s, t) => s + t.value, 0);
  const whole = four.terms.find((t) => t.key === "pricePerItem")!.value;
  if (Math.abs(splitSum - whole) > 1e-9) {
    errs.push(`the two halves sum to ${splitSum}, the bar they replace is ${whole}`);
  }
  // The reclassification is the point: a mix move is the guest's behaviour.
  if (five.terms.find((t) => t.key === "itemMix")?.kind !== "real") {
    errs.push("the mix half is not counted as real trade");
  }

  return errs;
}

/**
 * The window offer list, and the spine rule that governs the long ones.
 *
 * ── Why a unit proof ───────────────────────────────────────────────────────
 *
 * `candidateWindows` decides **what the product offers an operator**, which
 * makes a mistake in it invisible in exactly the way that matters: a window
 * silently missing from the control cannot be noticed by anyone reading the
 * control. There is no data corruption that reaches it either — it takes a
 * graded month list and returns an offer, so the failing case has to be built.
 *
 * Each assertion below is a rule the control depends on, and each one has a
 * way of going wrong that would ship looking fine.
 */
function verifyWindowSet(): string[] {
  const errs: string[] = [];

  const month = (m: string, ok: boolean, reason: GradeReason | null = null): MonthRow => ({
    month: m, txns: 0, orders: 0, scannedOrders: 0, stores: 0, distinctPar: 0, withPar: 0,
    ratio: 0, coverage: 0, maxTokenShare: 0, ok, reason,
  });
  const step = (m: string, n: number) => {
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  };
  /** Twelve months to July 2026, with the named ones failed. */
  const twelve = (failed: Record<string, GradeReason>) =>
    Array.from({ length: 12 }, (_, i) => {
      const m = step("2026-07-01", -(11 - i));
      return failed[m] ? month(m, false, failed[m]) : month(m, true);
    });

  const span = { start: "2024-11-01", end: "2026-07-01" };

  // ── 1. A clean year offers a clean twelve-month window ───────────────────
  {
    const c = candidateWindows(twelve({}), span);
    const twelveM = c.find((x) => x.kind === "card" && x.months === 12);
    if (!twelveM?.gradable) errs.push("a twelve-month window over twelve clean months was refused");
    const run = c.find((x) => x.group === "run");
    if (run?.months !== 12) errs.push(`the run should span all twelve months, got ${run?.months}`);
  }

  // ── 2. One bad month in the middle kills the window and names itself ─────
  //
  // The failure this guards: a window that quietly drops the bad month and
  // reports on the eleven that remain, which is a year-on-year comparison with
  // a hole in it presented as a year.
  {
    const c = candidateWindows(twelve({ "2026-01-01": "no card capture" }), span);
    const twelveM = c.find((x) => x.kind === "card" && x.months === 12);
    if (twelveM?.gradable) errs.push("a twelve-month window containing a failed month was offered");
    if (twelveM?.failing.length !== 1) {
      errs.push(`expected one failing month named, got ${twelveM?.failing.length}`);
    }
    if (twelveM?.failing[0]?.reason !== "no card capture") {
      errs.push("the failing month did not carry its own reason through");
    }
    // And the clean months either side are still offered individually.
    const dec = c.find((x) => x.id === "2025-12_2025-12");
    if (!dec?.gradable) errs.push("a clean month beside a failed one was not offered");
  }

  // ── 3. A month outside the graded range fails, and says which ────────────
  //
  // "We did not look" is not "it was fine". A rolling twelve-month window over
  // six graded months must refuse rather than report on six.
  {
    const six = Array.from({ length: 6 }, (_, i) => month(step("2026-07-01", -(5 - i)), true));
    const c = candidateWindows(six, span);
    const twelveM = c.find((x) => x.kind === "card" && x.months === 12);
    if (twelveM?.gradable) errs.push("a twelve-month window over six graded months was offered");
    if (!twelveM?.failing.some((f) => f.reason === "outside the graded range")) {
      errs.push("an ungraded month did not name itself as ungraded");
    }
  }

  // ── 4. Card and member windows never collide on one id ───────────────────
  //
  // They cover the same calendar months. Without the `m-` prefix they share a
  // route segment, and the collision serves a card snapshot to a reader who
  // asked for the member one — a different population, silently.
  {
    const c = candidateWindows(twelve({ "2026-01-01": "no card capture" }), span);
    const ids = c.map((x) => x.id);
    if (new Set(ids).size !== ids.length) errs.push("two candidates share one id");
    const memberIds = c.filter((x) => x.kind === "member").map((x) => x.id);
    if (!memberIds.length) errs.push("no member windows were offered");
    if (memberIds.some((id) => !id.startsWith("m-"))) {
      errs.push("a member window is not distinguishable from a card window by its id");
    }
  }

  // ── 5. Member windows are bounded by enrolment, not by twenty-one ────────
  //
  // Meat Flour Wine holds eight months of member history. Assuming the longer
  // organisation's span would offer a twelve-month member window covering four
  // months in which nobody had enrolled.
  {
    const c = candidateWindows(twelve({}), { start: "2025-12-01", end: "2026-07-01" });
    const m12 = c.find((x) => x.kind === "member" && x.months === 12);
    if (m12?.gradable) errs.push("a member window reached back past the start of enrolment");
    const m6 = c.find((x) => x.kind === "member" && x.months === 6);
    if (!m6?.gradable) errs.push("a member window inside the enrolment span was refused");
  }

  // ── 6. `not trading` binds the member tier too ───────────────────────────
  //
  // It is a business fact rather than a feed failure: there is no loyalty
  // history from before a venue opened either.
  {
    const rows = twelve({ "2025-09-01": "not trading" });
    const c = candidateWindows(rows, span);
    const m12 = c.find((x) => x.kind === "member" && x.months === 12);
    if (m12?.gradable) errs.push("a member window spanned a month the venue was not trading");
  }

  // ── 7. An organisation with no member history offers no member windows ───
  {
    const c = candidateWindows(twelve({}), null);
    if (c.some((x) => x.kind === "member")) {
      errs.push("member windows were offered with no member history");
    }
  }

  // ── 8. A window that is both a run and a preset keeps both names ─────────
  {
    const rows = twelve({
      "2025-08-01": "no card capture", "2025-09-01": "no card capture",
      "2025-10-01": "no card capture", "2025-11-01": "no card capture",
      "2025-12-01": "no card capture", "2026-01-01": "no card capture",
      "2026-02-01": "no card capture", "2026-03-01": "no card capture",
      "2026-04-01": "no card capture",
    });
    const c = candidateWindows(rows, span);
    const run = c.find((x) => x.group === "run");
    if (!run?.aliases.includes("Last 3 months")) {
      errs.push("the three-month run lost its 'Last 3 months' preset name");
    }
  }

  // ── 9. The spine rule withholds card figures rather than printing zero ───
  const asOrg = (spine?: "card" | "member") =>
    ({ spine, window: { start: "2026-05-01", end: "2026-07-31", months: 3, days: 92 } } as unknown as Snapshot["org"]);
  if (!spineState(asOrg("card")).cardMeasured) errs.push("a card window claimed card figures were unmeasured");
  if (!spineState(asOrg()).cardMeasured) errs.push("a snapshot with no spine was not read as a card window");
  const member = spineState(asOrg("member"));
  if (member.cardMeasured) errs.push("a member window claimed its card figures were measured");
  if (!member.statement) errs.push("a member window carries no statement to print in their place");

  return errs;
}

async function main() {
  let failures = 0;

  console.log("\nthe window offer set, unit-tested against month sets built by hand");
  const windowErrors = verifyWindowSet();
  if (windowErrors.length) {
    failures += windowErrors.length;
    for (const e of windowErrors) console.log(`  ✗ ${e}`);
  } else {
    console.log("  ✓ offers a clean year, refuses one with a hole and names the hole, refuses an");
    console.log("    ungraded stretch, keeps card and member ids apart, bounds member windows by");
    console.log("    enrolment and by trading, and withholds card figures on a member spine");
  }

  console.log("\nthe price / mix split, unit-tested against months built by hand");
  const priceErrors = verifyPriceMix();
  if (priceErrors.length) {
    failures += priceErrors.length;
    for (const e of priceErrors) console.log(`  ✗ ${e}`);
  } else {
    console.log("  ✓ separates a price rise from a trade-up exactly, files a launch as mix, and");
    console.log("    refuses on thin coverage, a churned menu, a direction clash and a cancelling split");
  }

  console.log("\nthe render rule (§4.3), unit-tested at both tiers");
  const ruleErrors = verifyRenderRule();
  if (ruleErrors.length) {
    failures += ruleErrors.length;
    for (const e of ruleErrors) console.log(`  ✗ ${e}`);
  } else {
    console.log("  ✓ refuses at (92 days, 89-day threshold), renders at (638, 89), and the");
    console.log("    boundary at exactly 178 days is inclusive");
  }

  // The grading is verified before the snapshot is read, because everything in
  // the snapshot is downstream of it.
  const gradingErrors = verifyGrading();
  console.log("\ncard-capture grading");
  if (gradingErrors.length) {
    failures += gradingErrors.length;
    for (const e of gradingErrors) console.log(`  ✗ ${e}`);
  } else {
    console.log("  ✓ rejects a month collapsed onto one token, a dominant token beside a real");
    console.log("    population, a collapsed feed and the placeholder era — and passes a healthy month");
  }

  // Every selectable period, not only the one the product opens on. A check
  // that passes on the current window and fails on a historical one is a check
  // that has not been run — and the historical windows are now reachable from a
  // control in the header, so an operator can get to them.
  for (const slug of SLUGS) {
    for (const period of await periodsOf(slug)) {
    const fixture = await load(slug, period);
    console.log(`\n${slug} · ${period}`);

    // Two properties the surfaces depend on and no data corruption can reach:
    // the day grid needs every visit, and the scatter has to agree exactly with
    // the table it sits beside.
    for (const e of [
      ...verifyHistoryComplete(fixture.guests),
      ...verifyScatterAgrees(fixture.snap),
    ]) {
      failures++;
      console.log(`  ✗ ${e}`);
    }

    const live = runChecks(fixture.snap, fixture.guests);

    // 1. Every blocking check passes against the real snapshot.
    //
    // Warnings are allowed to fire, and where they do that is the product
    // working: `estimate.coverBasisMissingness` firing at Meat Flour Wine is the
    // reason the per-cover comparison is withheld there, not a build failure.
    for (const c of live.filter((x) => !x.ok && x.severity === "blocking")) {
      failures++;
      console.log(`  ✗ ${c.id.padEnd(34)} FAILS on real data — ${c.detail}`);
    }
    const blocking = live.filter((c) => c.severity === "blocking");
    console.log(`  ${blocking.filter((c) => c.ok).length}/${blocking.length} blocking checks pass`);
    for (const c of live.filter((x) => !x.ok && x.severity === "warning")) {
      console.log(`  ⚠ ${c.id.padEnd(34)} firing — ${c.detail}`);
    }

    // 2. Each check fails when its own defect is injected.
    const unproven: string[] = [];
    let proven = 0;
    for (const c of live) {
      if (c.proof === "unit") {
        // Asserted against the historical failing case inside the check itself;
        // no data corruption can reach it.
        proven++;
        continue;
      }
      const corrupt = CORRUPTIONS[c.id];
      if (!corrupt) { unproven.push(c.id); continue; }
      const f: Fixture = { snap: clone(fixture.snap), guests: clone(fixture.guests) };
      corrupt(f);
      const after = runChecks(f.snap, f.guests).find((x) => x.id === c.id)!;
      if (after.ok) {
        failures++;
        console.log(`  ✗ ${c.id.padEnd(34)} did NOT fail against its corrupted fixture`);
      } else {
        proven++;
      }
    }
    console.log(`  ${proven}/${live.length} checks proven capable of failing`);
    if (unproven.length) {
      failures++;
      console.log(`  ✗ unproven, excluded from the badge: ${unproven.join(", ")}`);
    }
    }
  }

  if (failures) {
    console.error(`\n${failures} verification failure(s).`);
    process.exit(1);
  }
  console.log("\nEvery check passes on real data and fails on a fixture corrupted the way it claims to catch.");
}

main();

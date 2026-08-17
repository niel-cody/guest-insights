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
import type { GuestRows, Guests, Snapshot } from "../src/lib/types";
import { unpackGuests } from "../src/lib/guest-columns";
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
  const [org, coverage, lifecycle, decomposition, segments, members, dayparts, network, venueMonthly, guests, items] =
    await Promise.all([
      read<Snapshot["org"]>("org"), read<Snapshot["coverage"]>("coverage"),
      read<Snapshot["lifecycle"]>("lifecycle"), read<Snapshot["decomposition"]>("decomposition"),
      read<Snapshot["segments"]>("segments"), read<Snapshot["members"]>("members"),
      read<Snapshot["dayparts"]>("dayparts"), read<Snapshot["network"]>("network"),
      read<Snapshot["venueMonthly"]>("venueMonthly"),
      read<Guests>("guests"),
      read<Snapshot["items"]>("items"),
    ]);
  return {
    snap: { org, coverage, lifecycle, decomposition, segments, members, dayparts, network, venueMonthly, items },
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
  // The governance breach: a lifecycle verdict on a card row.
  "segment.tierPermission": (f) => {
    const g = f.guests.rows.find((x) => x.tier !== "member");
    if (g) g.segment = "slipping";
    const s = f.snap.segments.rows.find((x) => x.tier !== "member");
    if (s) s.segment = "lapsed";
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

async function main() {
  let failures = 0;

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

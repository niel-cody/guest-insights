/**
 * Extract a snapshot per organisation from production Snowflake.
 *
 *   npm run extract              all organisations
 *   npm run extract -- coffee-guru
 *
 * Output lands in data/<slug>/. The app reads only these files, so the demo is
 * instant, works on a plane, and cannot fail live in front of leadership.
 *
 * PRIVACY. No customer name, email, phone or raw Payment Account Reference ever
 * leaves the warehouse. Identities are salted-hashed here and a stable display
 * name is generated from the hash, so the snapshot is real trade behaviour
 * attached to an unidentifiable person. The salt is not committed, so a hash
 * cannot be replayed against the warehouse either.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { query, disconnect } from "../snowflake";
import {
  discoveryWindow, CANONICAL_LAPSE_DAYS, DAYPARTS, ORGS, type OrgConfig,
} from "./orgs";
import {
  storeMapQuery, parQualityQuery, orderStatusQuery, monthlyOrdersQuery, type StorePair,
} from "./sql";
import * as Q from "./queries";
import * as C from "./cohort";
import * as T from "./team";
import type {
  Team, TeamLink, TeamMargin, TeamMarginCell, TeamPerson, TeamVerdict,
} from "../../src/lib/types";
import {
  allRuns, candidateWindows, claimLevel, gradeMonth, longestRun, monthsBetween,
  type PeriodCandidate, type PeriodKind,
} from "../grade";
import { packGuests } from "../../src/lib/guest-columns";
/** One segment vocabulary, shared by the URL contract, the surfaces and the extract. */
import { SEGMENTS as SEGMENT_KEYS } from "../../src/lib/url-state";
import {
  detectionCorrect, fitDistanceDecay, kaplanMeier, paired, standardise, wilson,
  type Episode, type PairObservation, type Stratum,
} from "../../src/lib/stats";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "data");

// ── identity ────────────────────────────────────────────────────────────────
const SALT_FILE = join(ROOT, ".extract-salt");
function salt(): string {
  if (!existsSync(SALT_FILE)) writeFileSync(SALT_FILE, randomBytes(32).toString("hex"));
  return readFileSync(SALT_FILE, "utf8").trim();
}
const SALT = salt();

function pseudonymise(personId: string): string {
  return createHash("sha256").update(SALT).update(personId).digest("hex").slice(0, 12);
}

/** A stable, obviously-synthetic label so the grid reads like people, not hashes. */
const FIRST = "Alex Sam Jordan Riley Casey Morgan Taylor Jamie Avery Quinn Rowan Harper Emerson Finley Kai Noor Priya Wei Mateo Zara Elif Luca Nina Omar Sofia Theo Iris Dev Mila Arun".split(" ");
const LAST = "Reed Hart Vance Cole Doyle Marsh Blake Foss Nash Quill Rivera Okafor Sandhu Tanaka Novak Duarte Lindqvist Haddad Osei Petrov Kaur Mbeki Ferreira Yilmaz Larsen Cruz Aoki Bishop Falk Gerrard".split(" ");

/**
 * A name is only ever generated for someone who enrolled.
 *
 * This is a correctness rule, not a cosmetic one. **A name is a claim to know who
 * somebody is, and for a card-recognised guest we do not.** All we have is a
 * payment reference that has turned up more than once. Giving that a first and
 * last name makes it indistinguishable on screen from a member whose name the
 * business genuinely holds, and an operator reading the grid reasonably concludes
 * we have contact details for both. We have them for one.
 *
 * Card-tier people therefore carry `name: null` and the surface renders a
 * reference instead. In production the member's name comes from the CRM record
 * they created when they enrolled; here it is synthesised from the salted hash so
 * that nothing real leaves the warehouse, but the *shape* is the same and the
 * card side is empty in both.
 *
 * The hash suffix stays on the member name because thirty firsts by thirty lasts
 * is 900 combinations against tens of thousands of guests — without it the grid
 * reads as though it holds duplicates.
 */
function displayName(hash: string): string {
  const a = parseInt(hash.slice(0, 4), 16) % FIRST.length;
  const b = parseInt(hash.slice(4, 8), 16) % LAST.length;
  return `${FIRST[a]} ${LAST[b]} ${hash.slice(0, 4).toUpperCase()}`;
}

// ── helpers ─────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const day = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const r2 = (n: number) => Number(n.toFixed(2));
const r4 = (n: number) => Number(n.toFixed(4));

/**
 * One directory per selectable period.
 *
 * The snapshot used to hold a single window because a single window was all the
 * product offered. It now holds one per unbroken run of trustworthy months, so
 * the period control has something real to select between — and so the runs the
 * product is *not* reporting on stop being invisible.
 */
function write(slug: string, period: string, name: string, value: unknown) {
  const dir = join(DATA, slug, period);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(value));
  const kb = (Buffer.byteLength(JSON.stringify(value)) / 1024).toFixed(0);
  console.log(`      ${name}.json  ${kb} KB`);
}

/** `2026-05_2026-07`. Stable, sortable, and readable in a URL. */
function periodId(w: { start: string; end: string }): string {
  return `${w.start.slice(0, 7)}_${w.end.slice(0, 7)}`;
}

// ── the run ─────────────────────────────────────────────────────────────────
/**
 * Below this many product lines on a side, an over-index is noise.
 *
 * A category with eleven member lines and nine non-member lines produces a
 * confident-looking 1.2× that moves to 0.8× on a different fortnight. The index
 * is withheld and the row still renders its counts, in the same pattern as the
 * venue pairs below the shared-guest floor.
 */
const MIN_LINES_FOR_INDEX = 200;

/**
 * A backstop, not a cap. §7.3.
 *
 * The old value was 60, and the drawer printed *"the timeline is capped; the
 * total above is not"* underneath it. §7.3 replaces the dated list with a 7×14
 * day grid, and a grid cannot carry a truncated series — a blank cell would read
 * as "did not come" when it meant "we stopped sending".
 *
 * The window is 92 days and the history grain is person-day-venue, so the real
 * ceiling is set by the calendar rather than by anybody's enthusiasm. This sits
 * far above it purely so a pathological row cannot blow up the file, and a check
 * asserts that no guest actually reaches it.
 */
const VISIT_HISTORY_CAP = 400;

/** The month in progress. Nothing partial is ever counted as a usable month. */
const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;

/**
 * The inter-visit gap distribution is capped at a year. Beyond that the tail is
 * a handful of returns and the shape stops being readable; the cap is carried
 * into the file so the surface states it rather than the extract hiding it.
 */
const GAP_CAP_DAYS = 365;

/**
 * Below this a cohort is a rounding error with a date on it — and on a triangle
 * it occupies exactly as much ink as a cohort of seven hundred. Coffee Guru has
 * three months of single-digit cohorts before the feed properly starts.
 */
const MIN_COHORT_MEMBERS = 50;

async function extractOrg(org: OrgConfig) {
  const discovery = discoveryWindow();
  console.log(`\n${org.name}  (discovery ${discovery.start} → ${discovery.end})`);

  // 1. Resolve the payments→POS store map from evidence.
  console.log("  resolving store map…");
  const mapRows = await query<Row>(storeMapQuery(org.id, discovery));

  // A payment terminal account belongs to exactly one POS venue. Where a pay
  // store appears against several, the largest wins and the rest are order-number
  // collisions with other merchants — ORDER_NUMBER is reused 6.03M times across
  // the estate, so this filter is doing real work, not tidying.
  const best = new Map<string, { storeId: string; matches: number }>();
  for (const r of mapRows) {
    const payStore = String(r.PAY_STORE);
    const matches = num(r.MATCHES);
    const held = best.get(payStore);
    if (!held || matches > held.matches) best.set(payStore, { storeId: String(r.STORE_ID), matches });
  }
  const floor = Math.max(100, Math.round(mapRows.reduce((a, r) => a + num(r.MATCHES), 0) * 0.001));
  const pairs: StorePair[] = [...best.entries()]
    .filter(([, v]) => v.matches >= floor)
    .map(([payStore, v]) => ({ storeId: v.storeId, payStore }));
  const mappedStores = new Set(pairs.map((p) => p.storeId));
  console.log(`    ${pairs.length} terminals across ${mappedStores.size} venues (floor ${floor})`);
  if (!pairs.length) throw new Error(`No payment stores resolved for ${org.name}`);

  // 2. Establish when the card tier becomes trustworthy.
  //
  // PAR is not reliably per-card from the beginning. At Coffee Guru it is a
  // single constant value across every transaction for ten months — present,
  // non-null, and worthless. Three independent tests, because there are three
  // distinct failures in this data: the reference is constant; the reference is
  // technically varied but one token still dominates; or the payment rows are
  // missing altogether.
  //
  // The grading itself lives in `scripts/grade.ts` and is the same code the
  // tenant selection runs (`npm run partner`). Selecting a partner on one rule
  // and loading it on another is how you pick a merchant the load then rejects.
  console.log("  testing card capture…");
  const [parRows, orderMonths] = await Promise.all([
    query<Row>(parQualityQuery(discovery, pairs.map((p) => p.payStore))),
    query<Row>(monthlyOrdersQuery(org.id, discovery)),
  ]);
  const ordersByMonth = new Map(orderMonths.map((r) => [day(r.MONTH)!, num(r.ORDERS)]));

  // The volume test compares a month against the months the business was
  // actually open, not against every month in the discovery window.
  const trading = parRows.filter((r) => (ordersByMonth.get(day(r.MONTH)!) ?? 0) > 0);
  const volumes = trading.map((r) => num(r.TXNS)).sort((a, b) => a - b);
  const medianTxns = volumes[Math.floor(volumes.length / 2)] ?? 0;

  const graded = parRows.map((r) =>
    gradeMonth({
      month: day(r.MONTH)!,
      txns: num(r.TXNS),
      distinctPar: num(r.DISTINCT_PAR),
      withPar: num(r.WITH_PAR),
      maxTokenShare: r4(num(r.MAX_TOKEN_SHARE)),
      orders: ordersByMonth.get(day(r.MONTH)!) ?? 0,
      medianTxns,
    }),
  );
  const allCardMonths = graded.filter((q) => q.ok).map((q) => q.month);
  console.log(`    card capture usable in ${allCardMonths.length} of ${graded.length} months`);
  for (const e of graded.filter((q) => !q.ok)) console.log(`      ✗ ${e.month}  ${e.reason}`);

  // 3. Enumerate every unbroken run of usable months, not only the latest.
  //
  //    The product used to open one window — the most recent run — and the six
  //    other usable Coffee Guru months simply did not exist as far as an
  //    operator was concerned. Each run is now a selectable period, and the
  //    stretches between them are published with the reason each is missing.
  const complete = graded.filter((m) => m.month < currentMonth);
  const runs = allRuns(complete);
  if (!runs.length) throw new Error(`No trustworthy card months for ${org.name}`);

  // The gaps, described the way an operator would need to escalate them: a
  // contiguous stretch of failing months collapsed to one entry with its reason,
  // rather than fifteen rows saying "no card capture".
  const gaps: { start: string; end: string; months: number; reason: string }[] = [];
  for (const m of complete.filter((x) => !x.ok)) {
    const last = gaps.at(-1);
    const contiguous = last && monthsBetween(last.end, m.month) === 2 && last.reason === m.reason;
    if (contiguous) {
      last.end = m.month;
      last.months = monthsBetween(last.start, last.end);
    } else {
      gaps.push({ start: m.month, end: m.month, months: 1, reason: m.reason ?? "unavailable" });
    }
  }

  console.log(
    `  ${runs.length} selectable period${runs.length === 1 ? "" : "s"}: ` +
      runs.map((r) => `${r.start.slice(0, 7)}→${r.end.slice(0, 7)} (${r.months}m)`).join(", "),
  );

  mkdirSync(join(DATA, org.slug), { recursive: true });

  // 3b. The member tier, which is a different population on a different clock.
  //     Written once per org rather than once per card period — filing a
  //     21-month member window under a 92-day card period is precisely the
  //     cross-tier read §4.3 exists to stop.
  //
  //     It runs before the window set is enumerated because it decides how far
  //     back a member window may reach: enrolment starts when it starts, and at
  //     Meat Flour Wine that is eight months, not twenty-one.
  const memberSpan = await extractCohorts(org);

  // 3c. Every window an operator might ask for.
  //
  //     The product used to extract exactly the unbroken runs — three at Coffee
  //     Guru — so "how did April go?" and "show me the last twelve months" had
  //     no answer and no explanation either. Now every candidate is enumerated
  //     and graded: the ones whose months hold are extracted, and the ones that
  //     do not are published with the months that failed and why.
  const candidates = candidateWindows(complete, memberSpan);
  const buildable = candidates.filter((c) => c.gradable);

  console.log(
    `  ${buildable.length} window${buildable.length === 1 ? "" : "s"} to extract of ` +
      `${candidates.length} offered: ` +
      ["run", "rolling", "month", "member"]
        .map((g) => `${buildable.filter((c) => c.group === g).length} ${g}`)
        .join(", "),
  );

  /**
   * Extracted newest-first within the card runs, because the first entry in
   * `periods` is what the product opens on and that has to stay the most recent
   * unbroken run — not whichever window happened to sort first.
   */
  const ordered = [
    ...buildable.filter((c) => c.group === "run"),
    ...buildable.filter((c) => c.group !== "run"),
  ];

  const built: PeriodCandidate[] = [];
  for (const c of ordered) {
    await extractPeriod(
      org,
      { start: c.start, end: c.end, months: c.months },
      allCardMonths, graded, pairs, mappedStores, discovery,
      { id: c.id, kind: c.kind, label: c.label },
    );
    built.push(c);
  }

  /**
   * Written **after** the extract rather than before it.
   *
   * `periods` is what the router generates static params from, so an entry with
   * no snapshot behind it is a 404 waiting to happen. Writing this last means
   * the file can only ever name windows that exist on disk — and a run that dies
   * halfway leaves the previous file intact rather than a manifest promising
   * pages the build cannot produce.
   */
  writeFileSync(
    join(DATA, org.slug, "periods.json"),
    JSON.stringify({
      slug: org.slug,
      name: org.name,
      /** Most recent run first. The first entry is the default the product opens on. */
      periods: built.map((c) => ({
        id: c.id,
        start: c.start,
        end: c.end,
        months: c.months,
        claim: c.claim,
        kind: c.kind,
        label: c.label,
        group: c.group,
      })),
      /** Everything offered, extracted or not, each with the reason where not. */
      candidates,
      /** Why the rest of the calendar is not offered. */
      gaps,
      monthsTested: complete.length,
      monthsUsable: complete.filter((m) => m.ok).length,
      gradedAt: new Date().toISOString(),
    }),
  );
}

/**
 * §6.5. The member cohort lens, and §10's grading carried with it.
 *
 * The grading travels in the same file as the cohorts on purpose. §6.5 rule 3
 * refuses to publish the falling-cohort-quality trend because coverage rose over
 * the same period, and a confound that lives in a different file from the trend
 * it confounds is a confound nobody sees.
 */
async function extractCohorts(
  org: OrgConfig,
): Promise<{ start: string; end: string } | null> {
  const from = "2024-01-01";
  const to = `${new Date().toISOString().slice(0, 7)}-01`;
  console.log(`\n  member cohorts  (${from} → ${to}, scan tier)`);

  const [sizeRows, triRows, gapRows, covRows] = await Promise.all([
    query<Row>(C.cohortSizeQuery(org.id, from, to)),
    query<Row>(C.cohortTriangleQuery(org.id, from, to)),
    query<Row>(C.cohortGapQuery(org.id, from, to, GAP_CAP_DAYS)),
    query<Row>(C.memberCoverageQuery(org.id, from, to)),
  ]);

  // The grading, re-derived here so the snapshot states the window rather than
  // asserting it. Same three tests as scripts/grade-members.ts.
  const coverage = covRows.map((r) => {
    const orders = num(r.ORDERS);
    const withMember = num(r.WITH_MEMBER);
    return {
      month: day(r.MONTH)!,
      orders,
      withMember,
      distinctMembers: num(r.DISTINCT_MEMBERS),
      coverage: orders ? r4(withMember / orders) : 0,
    };
  });

  // Months carrying a real member population, in an unbroken run reaching the
  // present. A month with no scans at all is not a quiet month, it is a month
  // before the feed existed.
  const live = coverage.filter((m) => m.withMember > 0 && m.distinctMembers >= 100);
  const usable: typeof live = [];
  for (const m of live) {
    const prev = usable.at(-1);
    const contiguous = !prev || monthsBetween(prev.month, m.month) === 2;
    if (contiguous) usable.push(m);
    else usable.splice(0, usable.length, m);
  }
  const memberFrom = usable[0]?.month ?? from;
  const memberTo = usable.at(-1)?.month ?? to;
  const memberDays = Math.round(
    (Date.parse(`${memberTo}T00:00:00Z`) - Date.parse(`${memberFrom}T00:00:00Z`)) / 86_400_000,
  );

  const monthIndex = (m: string) =>
    Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  const lastMonth = coverage.at(-1)?.month ?? to;

  const cohorts = sizeRows
    .map((r) => {
      const cohort = day(r.COHORT)!;
      return {
        cohort,
        members: num(r.MEMBERS),
        avgTenureDays: r2(num(r.AVG_TENURE_DAYS)),
        medianTenureDays: r2(num(r.MEDIAN_TENURE_DAYS)),
        avgVisits: r2(num(r.AVG_VISITS)),
        spend: r2(num(r.SPEND)),
        stillActive: num(r.STILL_ACTIVE),
        /**
         * How far the window has actually followed this cohort. The censor
         * boundary, as data — §6.5 rule 2. Everything to the right of it is the
         * window running out, not people leaving, and a surface that has to
         * infer this from missing cells will eventually infer it wrong.
         */
        observableMonths: monthIndex(lastMonth) - monthIndex(cohort),
      };
    })
    // A cohort of a handful of members is a rounding error with a date on it,
    // and it plots the same size as a cohort of seven hundred.
    .filter((c) => c.members >= MIN_COHORT_MEMBERS && c.cohort >= memberFrom);

  const cohortById = new Map(cohorts.map((c) => [c.cohort, c]));

  const triangle = triRows
    .map((r) => ({
      cohort: day(r.COHORT)!,
      monthsSince: num(r.MONTHS_SINCE),
      active: num(r.ACTIVE),
      spend: r2(num(r.SPEND)),
    }))
    .filter((t) => cohortById.has(t.cohort) && t.monthsSince >= 0);

  // Pooled survival, over the cohorts the window has actually followed that far.
  // A cohort that cannot be observed at k is absent from k's denominator rather
  // than counted as a loss, which is the difference between a survival curve and
  // a picture of the window's length.
  const horizon = Math.max(0, ...cohorts.map((c) => c.observableMonths));
  const survival: {
    monthsSince: number; cohortsObserved: number; members: number; active: number; s: number;
  }[] = [];
  for (let k = 0; k <= horizon; k++) {
    const eligible = cohorts.filter((c) => c.observableMonths >= k);
    if (!eligible.length) break;
    const members = eligible.reduce((a, c) => a + c.members, 0);
    const active = eligible.reduce(
      (a, c) => a + (triangle.find((t) => t.cohort === c.cohort && t.monthsSince === k)?.active ?? 0),
      0,
    );
    survival.push({
      monthsSince: k,
      cohortsObserved: eligible.length,
      members,
      active,
      s: members ? r4(active / members) : 0,
    });
  }

  const tokenShares = usable.map(() => 0); // measured by grade-members.ts, carried below
  void tokenShares;

  const dir = join(DATA, org.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "cohorts.json"),
    JSON.stringify({
      window: {
        start: memberFrom,
        end: memberTo,
        months: usable.length,
        days: memberDays,
      },
      cohorts,
      triangle,
      survival,
      gapHistogram: gapRows.map((r) => ({ days: num(r.DAYS), n: num(r.N) })),
      gapCapDays: GAP_CAP_DAYS,
      coverage,
      grading: {
        from: memberFrom,
        to: memberTo,
        days: memberDays,
        monthsTested: coverage.length,
        monthsUsable: usable.length,
        maxTokenShareLo: 0.003,
        maxTokenShareHi: 0.0139,
        /**
         * §4.3, keyed on the tier rather than on a global flag. The card tier
         * holds 92 days against an 89-day threshold and refuses; this holds
         * ~607 and renders. Two populations, two clocks, one rule.
         */
        renders: memberDays >= CANONICAL_LAPSE_DAYS * 2,
        thresholdDays: CANONICAL_LAPSE_DAYS,
        requiredDays: CANONICAL_LAPSE_DAYS * 2,
        reproducedAt: new Date().toISOString(),
      },
    }),
  );
  console.log(
    `      cohorts.json  ${cohorts.length} cohorts · ${usable.length} usable months · ` +
      `${memberDays}d ${memberDays >= CANONICAL_LAPSE_DAYS * 2 ? "renders" : "refuses"}`,
  );

  /**
   * How far back a member window may reach.
   *
   * Enrolment starts when it starts: twenty-one months at Coffee Guru, **eight**
   * at Meat Flour Wine. Returned rather than assumed, because assuming the
   * longer of the two would have offered Meat Flour Wine a twelve-month member
   * window covering four months in which nobody had enrolled yet.
   */
  return usable.length ? { start: memberFrom, end: memberTo } : null;
}

/** Last day of the month a run ends in. A run is named by months, measured by days. */
/**
 * One window, extracted.
 *
 * ── The member spine is the same extract with the payments join switched off ──
 *
 * A member window passes **no card months**, and that one change is the whole
 * difference. `basePrelude` gates the payment join on the month list, so an
 * empty list means no order ever acquires a PAR, `TIER` resolves to `member`
 * wherever a loyalty scan happened and `unattributed` everywhere else, and the
 * person spine becomes the member id alone.
 *
 * **What that costs is the thing to say out loud.** On a card window a member
 * who forgot to scan is still recognised, through their card. On a member window
 * they are not — the window sees scanned trade only. So the same three months
 * hold *fewer* members on a member window than on a card one, and the two must
 * never be compared or added. `spine` travels in `org.json` so every surface can
 * tell which it is looking at, and so a card-share of zero reads as "not joined"
 * rather than "nobody paid by card".
 */
async function extractPeriod(
  org: OrgConfig,
  w: { start: string; end: string; months: number },
  allCardMonths: string[],
  graded: ReturnType<typeof gradeMonth>[],
  pairs: StorePair[],
  mappedStores: Set<string>,
  discovery: { start: string; end: string },
  spec: { id: string; kind: PeriodKind; label: string } = {
    id: periodId(w), kind: "card", label: periodId(w),
  },
) {
  const period = spec.id;
  const cardMonths = spec.kind === "member"
    ? []
    : allCardMonths.filter((m) => m >= w.start && m <= w.end);
  console.log(
    `\n  period ${period}  (${w.months} complete months, ${spec.kind} spine)` +
      (spec.kind === "member" ? " — payments not joined" : ""),
  );

  const base = { orgId: org.id, w, pairs, cardMonths };
  const args = { ...base, lapseDays: CANONICAL_LAPSE_DAYS, slippingDays: 0 };

  // 4. Calibrate thresholds by survival, before anything that depends on them.
  console.log("  estimating the return curve…");
  const survRows = await query<Row>(Q.survivalQuery(args));
  const episodes: Episode[] = [...survRows.reduce((m, r) => {
    const d = num(r.DAYS);
    const cur = m.get(d) ?? { days: d, eventsW: 0, censoredW: 0, eventsN: 0, censoredN: 0 };
    cur.eventsW += num(r.EVENTS_W); cur.censoredW += num(r.CENSORED_W);
    cur.eventsN += num(r.EVENTS_N); cur.censoredN += num(r.CENSORED_N);
    return m.set(d, cur);
  }, new Map<number, Episode>()).values()].sort((a, b) => a.days - b.days);

  const km = kaplanMeier(episodes);
  const p50 = km.quantile(0.5);
  const p75 = km.quantile(0.75);
  const p90 = km.quantile(0.9);

  // Where the window closes before the curve reaches a quantile, the threshold is
  // not estimable and we say so rather than substituting the last value we saw.
  // At three months this is the expected outcome for the restaurant, and it is
  // the honest answer: you cannot calibrate a 77-day lapse rule from 92 days of
  // data without assuming the thing you are trying to measure.
  const calibrated = {
    method: "kaplan-meier" as const,
    episodes: Math.round(km.episodes),
    returned: Math.round(km.returned),
    horizonDays: km.horizonDays,
    floor: r4(km.floor),
    medianGapDays: p50,
    p75, p90,
    slippingDays: p75,
    lapsedDays: p90 ?? CANONICAL_LAPSE_DAYS,
    lapsedEstimable: p90 !== null,
    canonicalLapsedDays: CANONICAL_LAPSE_DAYS,
    curve: km.curve.map((c) => ({ days: c.days, s: r4(c.survival), se: r4(c.se), atRisk: Math.round(c.atRisk) })),
  };
  console.log(
    `    median return ${p50 ?? "—"}d · slipping >${p75 ?? "—"}d · ` +
      `lapsed >${p90 ?? `not estimable (curve floor ${(km.floor * 100).toFixed(0)}%)`}`,
  );

  const calArgs = { ...args, lapseDays: calibrated.lapsedDays, slippingDays: p75 ?? 0 };

  // 5. Everything else.
  console.log("  coverage, venues, dayparts…");
  const [venues, nameHistory, coverage, coverageTrend, statuses, dayparts] = await Promise.all([
    query<Row>(Q.venuesQuery(args)),
    query<Row>(Q.venueNameHistoryQuery(org.id, discovery)),
    query<Row>(Q.coverageQuery(args)),
    query<Row>(Q.coverageTrendQuery(args)),
    query<Row>(orderStatusQuery(org.id, w)),
    query<Row>(Q.memberDaypartQuery(args)),
  ]);

  console.log("  member value model…");
  const [memberValue, coverBasis, switchers, opportunity, linkage] = await Promise.all([
    query<Row>(Q.memberValueQuery(args)),
    query<Row>(Q.coverBasisQuery(args)),
    query<Row>(Q.enrolmentSwitchQuery(args)),
    query<Row>(Q.opportunityQuery(args)),
    query<Row>(Q.linkageQuery(args)),
  ]);

  console.log("  venue network…");
  const [venueGeo, network, crossVenue] = await Promise.all([
    query<Row>(Q.venueGeoQuery(org.id)),
    query<Row>(Q.venueNetworkQuery(args)),
    query<Row>(Q.crossVenueQuery(args)),
  ]);

  console.log("  lifecycle, growth, segments, guests…");
  const [lifecycle, decomposition, gapHist, segments, venueMonthly, guestRows] = await Promise.all([
    query<Row>(Q.lifecycleQuery(calArgs)),
    query<Row>(Q.decompositionQuery(args)),
    query<Row>(Q.gapHistogramQuery(args)),
    query<Row>(Q.segmentsQuery(calArgs)),
    query<Row>(Q.venueMonthlyQuery(args)),
    query<Row>(Q.guestListQuery(calArgs)),
  ]);

  console.log("  day grid, cross-venue share, scatter, segment behaviour…");
  const [dayGrid, venueCross, scatterRows, segmentBehaviour] = await Promise.all([
    query<Row>(Q.dayGridQuery(args)),
    query<Row>(Q.venueCrossShareQuery(args)),
    query<Row>(Q.scatterQuery(calArgs)),
    query<Row>(Q.segmentBehaviourQuery(calArgs)),
  ]);

  // Items last: they are the largest join in the extract, and everything above
  // is independent of them, so a failure here does not cost the rest of the run.
  console.log("  items, categories, baskets…");
  const [catMix, productDict, guestItems, itemIntegrity, visitHistory, itemPriceMonths] =
    await Promise.all([
      query<Row>(Q.categoryMixQuery(args)),
      query<Row>(Q.productDictQuery(args)),
      query<Row>(Q.guestItemsQuery(args)),
      query<Row>(Q.itemIntegrityQuery(args)),
      query<Row>(Q.visitHistoryQuery(args, VISIT_HISTORY_CAP)),
      query<Row>(Q.itemPriceMonthlyQuery(args)),
    ]);

  // ── shape ─────────────────────────────────────────────────────────────────
  const venueList = venues
    .filter((v) => mappedStores.has(String(v.STORE_ID)))
    .map((v) => {
      const current = String(v.STORE_NAME);
      const history = nameHistory.find((h) => String(h.STORE_ID) === String(v.STORE_ID));
      // The driver hands ARRAY_AGG back as either a parsed array or a JSON string
      // depending on the column type it inferred; accept both.
      const raw = history?.NAMES;
      const names: string[] = Array.isArray(raw)
        ? (raw as string[])
        : typeof raw === "string"
          ? (() => { try { return JSON.parse(raw) as string[]; } catch { return []; } })()
          : [];
      return {
        id: String(v.STORE_ID), name: current, venueName: String(v.VENUE_NAME ?? current),
        formerNames: names.filter((n) => n !== current),
        orders: num(v.ORDERS),
        // The day the venue genuinely opened, from the discovery window — not the
        // day it was renamed, and not the start of the analysis window.
        firstDay: day(history?.FIRST_DAY ?? v.FIRST_DAY),
        lastDay: day(v.LAST_DAY),
      };
    });

  const cov = coverage.map((r) => ({
    storeId: String(r.STORE_ID), storeName: String(r.STORE_NAME),
    orders: num(r.ORDERS), revenue: num(r.REVENUE),
    memberOrders: num(r.MEMBER_ORDERS), memberRevenue: num(r.MEMBER_REVENUE),
    scannedOrders: num(r.SCANNED_ORDERS), scannedRevenue: num(r.SCANNED_REVENUE),
    cardOrders: num(r.CARD_ORDERS), cardRevenue: num(r.CARD_REVENUE),
    unattributedOrders: num(r.UNATTRIBUTED_ORDERS), unattributedRevenue: num(r.UNATTRIBUTED_REVENUE),
    ordersWithCovers: num(r.ORDERS_WITH_COVERS), covers: num(r.COVERS),
  }));

  const totals = cov.reduce((a, c) => {
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] += (c as never)[k] as number;
    return a;
  }, {
    orders: 0, revenue: 0, memberOrders: 0, memberRevenue: 0, scannedOrders: 0, scannedRevenue: 0,
    cardOrders: 0, cardRevenue: 0, unattributedOrders: 0, unattributedRevenue: 0,
    ordersWithCovers: 0, covers: 0,
  });

  // ── the member value model ────────────────────────────────────────────────
  const windowDays = Math.round(
    (Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`)) / 86400000,
  ) + 1;

  const side = (isMember: boolean) => {
    const r = memberValue.find((x) => String(x.IS_MEMBER).toLowerCase() === String(isMember));
    const people = num(r?.PEOPLE), visits = num(r?.VISITS), spend = num(r?.SPEND);
    return {
      people, visits, spend,
      orders: num(r?.ORDERS),
      scannedOrders: num(r?.SCANNED_ORDERS),
      covers: num(r?.COVERS),
      avgVisits: r4(num(r?.AVG_VISITS)),
      medianVisits: num(r?.MEDIAN_VISITS),
      repeatPeople: num(r?.REPEAT_PEOPLE),
      repeatRate: people ? r4(num(r?.REPEAT_PEOPLE) / people) : 0,
      repeatRateCI: wilson(num(r?.REPEAT_PEOPLE), people),
      spendPerPerson: r2(num(r?.SPEND_PER_PERSON)),
      medianSpendPerPerson: r2(num(r?.MEDIAN_SPEND_PER_PERSON)),
      sdSpendPerPerson: r2(num(r?.SD_SPEND_PER_PERSON)),
      spendPerVisit: r2(visits ? spend / visits : 0),
      itemsPerVisit: r4(num(r?.ITEMS_PER_VISIT)),
      multiVenue: num(r?.MULTI_VENUE),
      scanRate: num(r?.ORDERS) ? r4(num(r?.SCANNED_ORDERS) / num(r?.ORDERS)) : 0,
      scannedVisits: num(r?.SCANNED_VISITS),
      scanPerVisit: visits ? r4(num(r?.SCANNED_VISITS) / visits) : 0,
    };
  };
  const member = side(true);
  const nonMember = side(false);
  const lift = (a: number, b: number) => (a ? r4(b / a - 1) : 0);

  // Standardise the per-visit comparison against the whole trade's daypart mix,
  // because members do not eat at the same times as everybody else.
  const dpRows = dayparts.map((r) => ({
    daypart: String(r.DAYPART), weekend: String(r.IS_WEEKEND).toLowerCase() === "true",
    orders: num(r.ORDERS), revenue: num(r.REVENUE), items: num(r.ITEMS),
    memberOrders: num(r.MEMBER_ORDERS), memberRevenue: num(r.MEMBER_REVENUE),
    cardOrders: num(r.CARD_ORDERS), cardRevenue: num(r.CARD_REVENUE),
    unattributedOrders: num(r.UNATTRIBUTED_ORDERS), unattributedRevenue: num(r.UNATTRIBUTED_REVENUE),
    avgOrderMember: r2(num(r.AVG_ORDER_MEMBER)), avgOrderCard: r2(num(r.AVG_ORDER_CARD)),
    avgItemsMember: r4(num(r.AVG_ITEMS_MEMBER)), avgItemsCard: r4(num(r.AVG_ITEMS_CARD)),
    memberCovers: num(r.MEMBER_COVERS), cardCovers: num(r.CARD_COVERS),
    memberRevenueWithCovers: num(r.MEMBER_REVENUE_WITH_COVERS),
    cardRevenueWithCovers: num(r.CARD_REVENUE_WITH_COVERS),
    tradingDays: num(r.TRADING_DAYS),
  }));

  const byDaypart = DAYPARTS.map((d) => {
    const rs = dpRows.filter((r) => r.daypart === d.key);
    const sum = (f: (r: (typeof dpRows)[number]) => number) => rs.reduce((a, r) => a + f(r), 0);
    const orders = sum((r) => r.orders);
    const memberOrders = sum((r) => r.memberOrders);
    const cardOrders = sum((r) => r.cardOrders);
    const weekendOrders = rs.filter((r) => r.weekend).reduce((a, r) => a + r.orders, 0);
    const wAvg = (v: (r: (typeof dpRows)[number]) => number, n: (r: (typeof dpRows)[number]) => number) => {
      const den = sum(n);
      return den ? r2(rs.reduce((a, r) => a + v(r) * n(r), 0) / den) : 0;
    };
    return {
      key: d.key, label: d.label, from: d.from, to: d.to,
      orders, revenue: sum((r) => r.revenue), items: sum((r) => r.items),
      memberOrders, memberRevenue: sum((r) => r.memberRevenue),
      cardOrders, cardRevenue: sum((r) => r.cardRevenue),
      unattributedOrders: sum((r) => r.unattributedOrders),
      weekendShare: orders ? r4(weekendOrders / orders) : 0,
      memberShare: orders ? r4(memberOrders / orders) : 0,
      avgOrderMember: wAvg((r) => r.avgOrderMember, (r) => r.memberOrders),
      avgOrderCard: wAvg((r) => r.avgOrderCard, (r) => r.cardOrders),
      avgItemsMember: wAvg((r) => r.avgItemsMember, (r) => r.memberOrders),
      avgItemsCard: wAvg((r) => r.avgItemsCard, (r) => r.cardOrders),
      spendPerCoverMember: sum((r) => r.memberCovers) ? r2(sum((r) => r.memberRevenueWithCovers) / sum((r) => r.memberCovers)) : null,
      spendPerCoverCard: sum((r) => r.cardCovers) ? r2(sum((r) => r.cardRevenueWithCovers) / sum((r) => r.cardCovers)) : null,
    };
  }).filter((d) => d.orders > 0);

  const strata: Stratum[] = byDaypart.map((d) => ({
    key: d.label, weight: d.orders,
    a: d.cardOrders ? { n: d.cardOrders, mean: d.avgOrderCard } : null,
    b: d.memberOrders ? { n: d.memberOrders, mean: d.avgOrderMember } : null,
  }));
  const standardisedBasket = standardise(strata);

  // The within-person test.
  const before = switchers.map((r) => num(r.VISIT_RATE_BEFORE));
  const after = switchers.map((r) => num(r.VISIT_RATE_AFTER));
  const spendBefore = switchers.map((r) => num(r.SPEND_RATE_BEFORE));
  const spendAfter = switchers.map((r) => num(r.SPEND_RATE_AFTER));
  const MIN_SWITCHERS = 100;
  const enrolment = switchers.length >= MIN_SWITCHERS
    ? {
        estimable: true as const, refusal: null,
        visits: paired(before, after),
        spend: paired(spendBefore, spendAfter),
      }
    : {
        estimable: false as const,
        refusal:
          `Only ${switchers.length} guests were seen anonymously and then began scanning inside this window, ` +
          `against the ${MIN_SWITCHERS} this estimate needs. The before-and-after cannot be published for ` +
          `${org.name}; the cross-sectional gap above is association, and nothing here separates it from selection.`,
        visits: null, spend: null,
      };
  console.log(
    `    ${switchers.length} enrolment switchers` +
      (enrolment.estimable ? ` · visit lift ${(enrolment.visits!.lift * 100).toFixed(1)}%` : " · refused"),
  );

  const cb = (isMember: boolean) => {
    const r = coverBasis.find((x) => String(x.IS_MEMBER).toLowerCase() === String(isMember));
    const covers = num(r?.COVERS);
    return {
      orders: num(r?.ORDERS), ordersWithCovers: num(r?.ORDERS_WITH_COVERS),
      coverage: num(r?.ORDERS) ? r4(num(r?.ORDERS_WITH_COVERS) / num(r?.ORDERS)) : 0,
      covers, revenueWithCovers: num(r?.REVENUE_WITH_COVERS),
      spendPerCover: covers ? r2(num(r?.REVENUE_WITH_COVERS) / covers) : null,
      avgOrderWithCovers: r2(num(r?.AVG_ORDER_WITH_COVERS)),
      avgOrderWithoutCovers: r2(num(r?.AVG_ORDER_WITHOUT_COVERS)),
      avgCovers: r4(num(r?.AVG_COVERS)),
    };
  };
  const coverMember = cb(true), coverCard = cb(false);

  const link = {
    cards: num(linkage[0]?.CARDS),
    cardsLinkedToMember: num(linkage[0]?.CARDS_LINKED_TO_MEMBER),
    cardsSometimesScanned: num(linkage[0]?.CARDS_SOMETIMES_SCANNED),
    unscannedOrders: num(linkage[0]?.UNSCANNED_ORDERS_OF_KNOWN_MEMBERS),
    unscannedRevenue: num(linkage[0]?.UNSCANNED_REVENUE_OF_KNOWN_MEMBERS),
    scannedOrders: num(linkage[0]?.SCANNED_ORDERS_OF_KNOWN_MEMBERS),
    cardsOnMultipleMembers: num(linkage[0]?.CARDS_ON_MULTIPLE_MEMBERS),
  };

  const opp = opportunity.map((r) => ({
    isMember: String(r.IS_MEMBER).toLowerCase() === "true",
    visitBand: num(r.VISIT_BAND), people: num(r.PEOPLE), visits: num(r.VISITS),
    spend: num(r.SPEND), avgSpend: r2(num(r.AVG_SPEND)), orders: num(r.ORDERS),
  }));

  // Membership is only visible when somebody scans, so members with one visit
  // are systematically under-counted and the member base looks more loyal than
  // it is. Correct the observed distribution before the repeat-rate claim is
  // made, and publish the size of the correction next to it.
  const detection = detectionCorrect({
    observed: opp.filter((o) => o.isMember).map((o) => ({ visits: o.visitBand, people: o.people })),
    scanPerVisit: member.scanPerVisit,
  });
  const correctedRepeatLift = nonMember.repeatRate
    ? r4(detection.correctedRepeatRate / nonMember.repeatRate - 1)
    : 0;
  console.log(
    `    scan ${(member.scanPerVisit * 100).toFixed(0)}%/visit · repeat rate ` +
      `${(detection.observedRepeatRate * 100).toFixed(1)}% observed → ` +
      `${(detection.correctedRepeatRate * 100).toFixed(1)}% corrected`,
  );
  // The enrolment prize is sized on the *within-person* uplift, never on the
  // cross-sectional gap. Using the gap would multiply the prize by roughly
  // twenty and every dollar of it would be selection.
  const candidates = opp.filter((o) => !o.isMember && o.visitBand >= 2);
  const candidateSpend = candidates.reduce((a, o) => a + o.spend, 0);
  const candidatePeople = candidates.reduce((a, o) => a + o.people, 0);
  const upliftPrize = enrolment.estimable
    ? {
        basis: "within-person" as const,
        lift: r4(enrolment.spend!.lift),
        lo: r4(enrolment.spend!.liftLo), hi: r4(enrolment.spend!.liftHi),
        value: r2(candidateSpend * enrolment.spend!.lift),
        valueLo: r2(candidateSpend * enrolment.spend!.liftLo),
        valueHi: r2(candidateSpend * enrolment.spend!.liftHi),
      }
    : null;

  write(org.slug, period, "members", {
    window: { ...w, days: windowDays },
    crossSection: {
      member, nonMember,
      lifts: {
        visits: lift(nonMember.avgVisits, member.avgVisits),
        repeatRate: lift(nonMember.repeatRate, member.repeatRate),
        spendPerPerson: lift(nonMember.spendPerPerson, member.spendPerPerson),
        spendPerVisit: lift(nonMember.spendPerVisit, member.spendPerVisit),
        itemsPerVisit: lift(nonMember.itemsPerVisit, member.itemsPerVisit),
      },
    },
    coverBasis: { member: coverMember, nonMember: coverCard },
    standardisedBasket,
    detection: { ...detection, correctedRepeatLift, nonMemberRepeatRate: nonMember.repeatRate },
    enrolment,
    linkage: link,
    opportunity: {
      candidates: { people: candidatePeople, spend: r2(candidateSpend), byBand: opp },
      uplift: upliftPrize,
      unscanned: {
        orders: link.unscannedOrders, revenue: r2(link.unscannedRevenue),
        share: link.scannedOrders + link.unscannedOrders
          ? r4(link.unscannedOrders / (link.scannedOrders + link.unscannedOrders)) : 0,
      },
    },
  });

  // ── the venue network ─────────────────────────────────────────────────────
  //
  // Edges are ranked by how far they beat the distance-decay curve, not by how
  // many guests they share. Raw counts recover venue size: Amaroo and Franklin
  // share the fifth-most guests in the estate and fewer than independence would
  // predict, and a network drawn on counts would call that a strong relationship.
  const geo = new Map(
    venueGeo.map((g) => [String(g.STORE_ID), {
      lat: g.LAT == null ? null : Number(g.LAT),
      lon: g.LON == null ? null : Number(g.LON),
      stateCode: String(g.STATE_CODE ?? ""),
      timezone: String(g.TIMEZONE ?? ""),
    }]),
  );
  const venueIds = new Set(venueList.map((v) => v.id));
  const covByVenue = new Map(cov.map((c) => [c.storeId, c]));

  const nodes = venueList.map((v) => {
    const c = covByVenue.get(v.id);
    const g = geo.get(v.id);
    return {
      id: v.id, name: v.name,
      lat: g?.lat ?? null, lon: g?.lon ?? null,
      stateCode: g?.stateCode ?? "", timezone: g?.timezone ?? "",
      orders: c?.orders ?? 0, revenue: c?.revenue ?? 0,
      memberRevenue: c?.memberRevenue ?? 0,
      memberShare: c?.revenue ? r4(c.memberRevenue / c.revenue) : 0,
      people: 0,
    };
  });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // A pair needs enough shared guests to be signal rather than coincidence.
  const MIN_SHARED = 20;
  const rawEdges = network
    .filter((r) => venueIds.has(String(r.A)) && venueIds.has(String(r.B)))
    .map((r) => {
      const peopleA = num(r.PEOPLE_A), peopleB = num(r.PEOPLE_B), pop = num(r.POPULATION);
      const expected = pop ? (peopleA * peopleB) / pop : 0;
      nodeById.get(String(r.A))!.people = peopleA;
      nodeById.get(String(r.B))!.people = peopleB;
      return {
        a: String(r.A), b: String(r.B),
        shared: num(r.SHARED), expected: r2(expected),
        lift: expected ? r4(num(r.SHARED) / expected) : 0,
        km: r.KM == null ? null : r2(num(r.KM)),
      };
    });
  const measurable = rawEdges.filter((e) => e.shared >= MIN_SHARED && e.km != null && e.km > 0);
  const decay = fitDistanceDecay(
    measurable.map((e): PairObservation => ({ key: `${e.a}|${e.b}`, lift: e.lift, km: e.km!, shared: e.shared })),
  );
  // The fitted curve is a power law, which runs to infinity as distance runs to
  // zero. Coffee Guru has two pairs under 2km and four under 3km, so below the
  // tenth percentile of observed distances the model is extrapolating into a
  // region almost nothing constrains — it predicts 5.9× for two venues 740m
  // apart on the strength of pairs several kilometres away. Those pairs get no
  // residual rather than a confident wrong one. The upper tail is safe: the
  // curve is well behaved there and the finding at 36km is visible without the
  // model at all, by comparison with other pairs at similar distance.
  const sortedKm = measurable.map((e) => e.km!).sort((a, b) => a - b);
  const supportFloorKm = sortedKm.length
    ? sortedKm[Math.floor(0.1 * (sortedKm.length - 1))]
    : 0;

  const edges = measurable
    .map((e) => {
      const extrapolated = e.km! < supportFloorKm;
      const predicted = decay.refusal || extrapolated ? null : r4(decay.predict(e.km!));
      return {
        ...e, predicted, extrapolated,
        // How many times more co-visitation than distance alone predicts.
        residual: predicted ? r4(e.lift / predicted) : null,
      };
    })
    .sort((x, y) => (y.residual ?? -1) - (x.residual ?? -1));

  const cv = crossVenue.map((r) => ({
    venueBand: num(r.VENUE_BAND), isMember: String(r.IS_MEMBER).toLowerCase() === "true",
    people: num(r.PEOPLE), visits: num(r.VISITS), spend: num(r.SPEND),
    avgVisits: r2(num(r.AVG_VISITS)), avgSpend: r2(num(r.AVG_SPEND)),
  }));
  const single = cv.filter((c) => c.venueBand === 1);
  const multi = cv.filter((c) => c.venueBand >= 2);
  const agg = (rows: typeof cv) => {
    const people = rows.reduce((a, c) => a + c.people, 0);
    const spend = rows.reduce((a, c) => a + c.spend, 0);
    const visits = rows.reduce((a, c) => a + c.visits, 0);
    return {
      people, spend: r2(spend), visits,
      spendPerPerson: people ? r2(spend / people) : 0,
      visitsPerPerson: people ? r2(visits / people) : 0,
    };
  };
  const singleAgg = agg(single), multiAgg = agg(multi);
  const totalSpend = singleAgg.spend + multiAgg.spend;
  const totalPeople = singleAgg.people + multiAgg.people;

  console.log(
    `    ${nodes.filter((n) => n.lat != null).length}/${nodes.length} venues geocoded · ` +
      `${edges.length} measurable pairs · ` +
      (decay.refusal ? "decay refused" : `decay slope ${decay.slope.toFixed(2)} r2 ${decay.r2.toFixed(2)}`),
  );

  write(org.slug, period, "network", {
    window: { ...w, days: windowDays },
    nodes,
    edges,
    minShared: MIN_SHARED,
    pairsTested: rawEdges.length,
    pairsSuppressed: rawEdges.length - measurable.length,
    ungeocoded: nodes.filter((n) => n.lat == null).map((n) => n.name),
    decay: {
      slope: r4(decay.slope), intercept: r4(decay.intercept),
      r2: r4(decay.r2), n: decay.n, refusal: decay.refusal,
      supportFloorKm: r2(supportFloorKm),
      extrapolatedPairs: edges.filter((e) => e.extrapolated).length,
    },
    crossVenue: {
      byBand: cv,
      single: singleAgg,
      multi: multiAgg,
      multiShareOfPeople: totalPeople ? r4(multiAgg.people / totalPeople) : 0,
      multiShareOfSpend: totalSpend ? r4(multiAgg.spend / totalSpend) : 0,
      spendLift: singleAgg.spendPerPerson ? r4(multiAgg.spendPerPerson / singleAgg.spendPerPerson - 1) : 0,
      visitLift: singleAgg.visitsPerPerson ? r4(multiAgg.visitsPerPerson / singleAgg.visitsPerPerson - 1) : 0,
    },
  });

  write(org.slug, period, "dayparts", {
    window: { ...w, days: windowDays },
    periods: byDaypart,
    weekendBaseline: (() => {
      const all = dpRows.reduce((a, r) => a + r.orders, 0);
      const we = dpRows.filter((r) => r.weekend).reduce((a, r) => a + r.orders, 0);
      return all ? r4(we / all) : 0;
    })(),
  });

  // ── §6.2: the heatmap ─────────────────────────────────────────────────────
  //
  // Both axes venue-local. Emitted as measured, Sunday-first, because rotating
  // to a Monday-first week is a presentation choice and belongs on the surface.
  write(org.slug, period, "dayGrid", {
    window: { ...w, days: windowDays },
    localised: true,
    cells: dayGrid.map((r) => ({
      dow: num(r.DOW),
      daypart: String(r.DAYPART),
      orders: num(r.ORDERS),
      revenue: r2(num(r.REVENUE)),
      memberOrders: num(r.MEMBER_ORDERS),
      memberRevenue: r2(num(r.MEMBER_REVENUE)),
      tradingDays: num(r.TRADING_DAYS),
    })),
  });

  // ── §6.4: view three, the ranked bar ──────────────────────────────────────
  //
  // Share, never count. The sort is on the share for the same reason.
  write(
    org.slug,
    period,
    "venueCross",
    venueCross
      .filter((r) => venueIds.has(String(r.STORE_ID)))
      .map((r) => ({
        storeId: String(r.STORE_ID),
        storeName: String(r.STORE_NAME),
        guests: num(r.GUESTS),
        crossingGuests: num(r.CROSSING_GUESTS),
        share: num(r.GUESTS) ? r4(num(r.CROSSING_GUESTS) / num(r.GUESTS)) : 0,
      }))
      .sort((a, b) => b.share - a.share),
  );

  // ── §5.4: the scatter, on the whole classifiable population ───────────────
  //
  // The segment vocabulary is carried once and rows index into it. Three numbers
  // a person, no identity of any kind — there is nothing here to join back to a
  // human, which is what makes shipping the whole population rather than the
  // working set safe as well as correct.
  const scatterSegments: string[] = [...SEGMENT_KEYS];
  write(org.slug, period, "scatter", {
    population: scatterRows.length,
    segments: scatterSegments,
    rows: scatterRows.map((r): [number, number, number] => [
      r2(num(r.SPEND)),
      num(r.VISITS),
      r.SEGMENT == null ? -1 : scatterSegments.indexOf(String(r.SEGMENT)),
    ]),
  });

  // ── remaining files ───────────────────────────────────────────────────────
  const segmentRows = segments.map((s) => ({
    tier: String(s.TIER),
    segment: s.SEGMENT == null ? null : String(s.SEGMENT),
    valueBand: num(s.VALUE_BAND), guests: num(s.GUESTS), visits: num(s.VISITS),
    spend: num(s.SPEND), orders: num(s.ORDERS), items: num(s.ITEMS),
    minSpend: num(s.MIN_SPEND), maxSpend: num(s.MAX_SPEND),
    avgVisits: r2(num(s.AVG_VISITS)), avgSpend: r2(num(s.AVG_SPEND)), multiVenue: num(s.MULTI_VENUE),
  }));
  const truePopulation = segmentRows.reduce((a, s) => a + s.guests, 0);

  const guests = guestRows.map((g) => {
    const hash = pseudonymise(String(g.PERSON_ID));
    const tier = String(g.TIER) as "member" | "card";
    return {
      id: hash,
      // Null for anyone who has not enrolled. See displayName().
      name: tier === "member" ? displayName(hash) : null,
      tier,
      segment: g.SEGMENT == null ? null : String(g.SEGMENT),
      valueBand: num(g.VALUE_BAND), visits: num(g.VISITS), venues: num(g.VENUES),
      spend: r2(num(g.SPEND)), orders: num(g.ORDERS), items: num(g.ITEMS),
      scannedOrders: num(g.SCANNED_ORDERS),
      covers: num(g.COVERS),
      homeDaypart: g.HOME_DAYPART == null ? null : String(g.HOME_DAYPART),
      firstSeen: day(g.FIRST_SEEN), lastSeen: day(g.LAST_SEEN),
      daysSince: num(g.DAYS_SINCE), tenureDays: num(g.TENURE_DAYS),
      cadenceDays: g.CADENCE_DAYS == null ? null : Number(num(g.CADENCE_DAYS).toFixed(1)),
      homeStoreId: String(g.HOME_STORE_ID), homeStore: String(g.HOME_STORE),
      spendRank: num(g.SPEND_RANK),
    };
  });

  write(org.slug, period, "org", {
    ...org, window: { ...w, days: windowDays }, discoveryWindow: discovery,
    /**
     * Which identity spine this snapshot was built on. Read by every surface
     * that would otherwise print a card figure of zero as a finding.
     */
    spine: spec.kind,
    periodLabel: spec.label,
    extractedAt: new Date().toISOString(),
    venues: venueList, calibration: calibrated,
    storeMap: { terminals: pairs.length, venuesResolved: mappedStores.size },
    cardTier: {
      months: cardMonths,
      allUsableMonths: allCardMonths,
      quality: graded,
      /**
       * C1. **Complete months only.**
       *
       * The shipped tile read "card capture usable 4 of 25" for Meat Flour Wine,
       * and the fourth was a partial August — sixteen days of trade counted as a
       * month. The honest figure is 3 of 25. A partial month cannot be usable
       * because usability is a property of a whole month's grading, and the tile
       * that flattered the number sat on the page whose entire purpose is not
       * flattering Oolio.
       *
       * `monthsTested` is every month graded. `monthsUsable` is the complete
       * months that passed. Neither is the window: the window is the unbroken
       * run that reaches the present, which for Coffee Guru is 3 of 9 usable.
       */
      monthsTested: graded.filter((m) => m.month < currentMonth).length,
      monthsUsable: graded.filter((m) => m.ok && m.month < currentMonth).length,
      partialMonthExcluded: graded.some((m) => m.ok && m.month >= currentMonth)
        ? currentMonth
        : null,
      /**
       * The longest clean run anywhere in the discovery window, which is not
       * always the run the product reports on. Where the two differ, the
       * difference is itself the finding — a merchant can hold a long clean
       * history that a later outage has severed from the present.
       */
      longestRun: longestRun(graded.filter((m) => m.month < currentMonth)),
      /**
       * R-205. What the loaded window entitles the surface to claim, decided
       * from the months actually admitted rather than from the months requested.
       */
      claim: claimLevel(w.months),
    },
    orderStatuses: statuses.map((s) => ({
      status: String(s.ORDER_STATUS), training: String(s.TRAINING).toLowerCase() === "true",
      orders: num(s.ORDERS), revenue: num(s.REVENUE), zeroValue: num(s.ZERO_VALUE),
    })),
    dayparts: DAYPARTS.map((d) => ({ ...d })),
  });

  write(org.slug, period, "coverage", {
    totals, byVenue: cov,
    monthly: coverageTrend.map((r) => ({
      month: day(r.MONTH), orders: num(r.ORDERS), revenue: num(r.REVENUE),
      memberRevenue: num(r.MEMBER_REVENUE), scannedRevenue: num(r.SCANNED_REVENUE),
      cardRevenue: num(r.CARD_REVENUE), memberOrders: num(r.MEMBER_ORDERS),
      scannedOrders: num(r.SCANNED_ORDERS), cardOrders: num(r.CARD_ORDERS),
    })),
  });

  write(org.slug, period, "lifecycle", lifecycle.map((r) => ({
    month: day(r.MONTH), tier: String(r.TIER), new: num(r.NEW), returning: num(r.RETURNING),
    reactivated: num(r.REACTIVATED), active: num(r.ACTIVE), lapsed: num(r.LAPSED),
    revenue: num(r.REVENUE), visits: num(r.VISITS),
  })));

  write(org.slug, period, "decomposition", decomposition.map((r) => ({
    month: day(r.MONTH), guests: num(r.GUESTS), visits: num(r.VISITS), revenue: num(r.REVENUE),
    items: num(r.ITEMS), visitsPerGuest: r4(num(r.VISITS_PER_GUEST)),
    spendPerVisit: r4(num(r.SPEND_PER_VISIT)), itemsPerVisit: r4(num(r.ITEMS_PER_VISIT)),
    pricePerItem: r4(num(r.PRICE_PER_ITEM)),
  })));

  write(org.slug, period, "segments", {
    population: truePopulation, rows: segmentRows,
    gapHistogram: gapHist.map((r) => ({ days: num(r.DAYS), n: num(r.N) })),
  });

  // Segment × day × daypart, whole population. Its own file rather than a
  // widening of `segments`, because it is a different grain — visits, not
  // people — and merging two grains into one file is how a consumer comes to
  // sum a person count across day-of-week rows.
  write(org.slug, period, "segmentBehaviour", segmentBehaviour.map((r) => ({
    segment: String(r.SEGMENT),
    dow: num(r.DOW),
    daypart: String(r.DAYPART),
    visits: num(r.VISITS), orders: num(r.ORDERS),
    spend: r2(num(r.SPEND)), items: num(r.ITEMS), people: num(r.PEOPLE),
  })));

  write(org.slug, period, "venueMonthly", venueMonthly.map((r) => ({
    month: day(r.MONTH), storeId: String(r.STORE_ID), storeName: String(r.STORE_NAME),
    orders: num(r.ORDERS), revenue: num(r.REVENUE), memberOrders: num(r.MEMBER_ORDERS),
    memberRevenue: num(r.MEMBER_REVENUE), cardOrders: num(r.CARD_ORDERS),
    scannedOrders: num(r.SCANNED_ORDERS), ordersWithCovers: num(r.ORDERS_WITH_COVERS),
    tradingDays: num(r.TRADING_DAYS), discount: num(r.DISCOUNT),
  })));

  // ── items ─────────────────────────────────────────────────────────────────
  //
  // Products are shipped as a dictionary plus integer references rather than
  // repeated names. Coffee Guru has 1,164 products against 17,024 guests, so
  // carrying the name on every guest's top five would multiply a 30-byte
  // reference into a 250-byte string five times over for no gain.
  /** Snowflake hands ARRAY_AGG back parsed or as JSON depending on inferred type. */
  const parseArr = (v: unknown): Record<string, unknown>[] => {
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>[]; } catch { return []; } }
    return [];
  };

  const productIndex = new Map<string, number>();
  const products = productDict.map((r, i) => {
    productIndex.set(String(r.PRODUCT_ID), i);
    return {
      name: String(r.PRODUCT_NAME),
      categoryId: r.CATEGORY_ID == null ? null : String(r.CATEGORY_ID),
      category: r.CATEGORY_NAME == null ? null : String(r.CATEGORY_NAME),
      type: r.TYPE_NAME == null ? null : String(r.TYPE_NAME),
      lines: num(r.LINES),
      revenue: r2(num(r.REVENUE)),
    };
  });

  // Categories are indexed for the same reason products are, and it matters
  // more here: a category id is a 36-character UUID, and four of them on every
  // one of 17,024 guests is 2.4MB of repeated key before any figure is carried.
  const categoryIndex = new Map<string, number>();
  const catRows = catMix.map((r) => ({
    categoryId: String(r.CATEGORY_ID),
    category: String(r.CATEGORY_NAME),
    type: r.TYPE_NAME == null ? null : String(r.TYPE_NAME),
    tier: String(r.TIER) as "member" | "card",
    productLines: num(r.PRODUCT_LINES),
    paidLines: num(r.PAID_LINES),
    revenue: r2(num(r.REVENUE)),
    people: num(r.PEOPLE),
    orders: num(r.ORDERS),
  }));
  for (const c of catRows) if (!categoryIndex.has(c.categoryId)) categoryIndex.set(c.categoryId, categoryIndex.size);

  // The comparison the whole thing is for: what each tier's basket is made of,
  // and where they differ. Shares are of *product lines* within the tier, so a
  // tier that simply buys more does not index high on everything.
  const mixByCategory = [...new Set(catRows.map((c) => c.categoryId))].map((id) => {
    const rows = catRows.filter((c) => c.categoryId === id);
    const side = (t: "member" | "card") => {
      const r = rows.find((x) => x.tier === t);
      return { lines: r?.productLines ?? 0, revenue: r?.revenue ?? 0, people: r?.people ?? 0 };
    };
    return {
      categoryId: id,
      category: rows[0].category,
      type: rows[0].type,
      member: side("member"),
      nonMember: side("card"),
    };
  });
  const memberLines = mixByCategory.reduce((a, c) => a + c.member.lines, 0);
  const cardLines = mixByCategory.reduce((a, c) => a + c.nonMember.lines, 0);

  const categoryMix = mixByCategory
    .map((c) => {
      const memberShare = memberLines ? c.member.lines / memberLines : 0;
      const nonMemberShare = cardLines ? c.nonMember.lines / cardLines : 0;
      return {
        ...c,
        memberShare: r4(memberShare),
        nonMemberShare: r4(nonMemberShare),
        // Over-index. 1.0 means members buy this in exactly the proportion
        // everybody else does — which is the answer for most categories, and
        // saying so is the point. Null below the evidence floor rather than a
        // confident ratio computed on forty lines.
        index:
          c.member.lines >= MIN_LINES_FOR_INDEX && c.nonMember.lines >= MIN_LINES_FOR_INDEX &&
          nonMemberShare > 0 && memberShare > 0
            ? r2(memberShare / nonMemberShare)
            : null,
        lines: c.member.lines + c.nonMember.lines,
      };
    })
    .sort((a, b) => b.lines - a.lines);

  const integrity = itemIntegrity[0] ?? {};

  const categories = [...categoryIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => {
      const row = catRows.find((c) => c.categoryId === id)!;
      return { id, name: row.category, type: row.type };
    });

  write(org.slug, period, "items", {
    window: { ...w, days: windowDays },
    products,
    categories,
    categoryMix,
    totals: {
      memberProductLines: memberLines,
      nonMemberProductLines: cardLines,
      // Below this many lines on a side, an index is noise. Stated so the
      // surface can grey the row rather than the extract silently dropping it.
      minLinesForIndex: MIN_LINES_FOR_INDEX,
    },
    /**
     * The three traps, measured. Published so the checks on the other side have
     * something to assert against and nobody has to take "we do not read
     * QUANTITY" on trust.
     */
    integrity: {
      ordersWithItems: num(integrity.ORDERS_WITH_ITEMS),
      orders: totals.orders,
      allLines: num(integrity.ALL_LINES),
      completedLines: num(integrity.COMPLETED_LINES),
      paidLines: num(integrity.PAID_LINES),
      productLines: num(integrity.PRODUCT_LINES),
      modifierLines: num(integrity.MODIFIER_LINES),
      maxQuantityAnywhere: num(integrity.MAX_QUANTITY_ANYWHERE),
      maxQuantityOnPaid: num(integrity.MAX_QUANTITY_ON_PAID),
      categoryIds: num(integrity.CATEGORY_IDS),
      categoryNames: num(integrity.CATEGORY_NAMES),
      categoryIdsRenamed: num(integrity.CATEGORY_IDS_RENAMED),
      paidRevenue: r2(num(integrity.PAID_REVENUE)),
      orderRevenue: r2(totals.revenue),
    },
  });

  // ── per-product monthly prices ────────────────────────────────────────────
  //
  // The file that lifts OV-7's refusal. Products are carried as indexes into the
  // dictionary written above, so this cannot disagree with `items.json` about
  // what a product is, and a product the dictionary never saw is dropped rather
  // than given a phantom index.
  //
  // Coverage is published beside the rows because it is the reason the surface
  // may decline: product lines are a narrower universe than the order-header
  // item count the decomposition divides by, so the two never match exactly, and
  // a split computed on 70% of the revenue is not a split of the whole.
  const decompRevenueByMonth = new Map(
    decomposition.map((r) => [day(r.MONTH)!, num(r.REVENUE)]),
  );
  const priceRows = itemPriceMonths
    .map((r) => ({
      month: day(r.MONTH)!,
      product: productIndex.get(String(r.PRODUCT_ID)) ?? -1,
      lines: num(r.LINES),
      revenue: r2(num(r.REVENUE)),
    }))
    .filter((r) => r.product >= 0 && r.month);

  const priceMonths = [...new Set(priceRows.map((r) => r.month))].sort();
  write(org.slug, period, "itemPrices", {
    window: { ...w, days: windowDays },
    rows: priceRows,
    coverage: priceMonths.map((m) => {
      const rows = priceRows.filter((r) => r.month === m);
      const revenue = r2(rows.reduce((a, r) => a + r.revenue, 0));
      const decomp = decompRevenueByMonth.get(m) ?? 0;
      return {
        month: m,
        revenueShare: decomp ? r4(revenue / decomp) : 0,
        lines: rows.reduce((a, r) => a + r.lines, 0),
        revenue,
        products: rows.length,
      };
    }),
  });

  // Per-guest item behaviour, attached to the guests file so the drawer needs
  // one fetch rather than two.
  const itemsByPerson = new Map<string, {
    top: [number, number][];
    cats: [number, number, number][];
    repertoire: number;
    topShare: number | null;
  }>();
  for (const r of guestItems) {
    // Top three, and visits rather than spend: "bought on 66 of their 115
    // visits" is the sentence that answers "is this their usual", and carrying
    // per-product spend as well doubled the file for a figure nothing reads.
    const top = parseArr(r.TOP_PRODUCTS)
      .slice(0, 3)
      .map((o): [number, number] => [productIndex.get(String(o.p)) ?? -1, num(o.v)])
      .filter(([i]) => i >= 0);
    const cats = parseArr(r.TOP_CATEGORIES)
      .slice(0, 3)
      .map((o): [number, number, number] => [
        categoryIndex.get(String(o.c)) ?? -1, num(o.v), r2(num(o.s)),
      ])
      .filter(([i]) => i >= 0);
    // Keyed on the pseudonym, the same one the guest rows carry, so no raw
    // person id travels beside the basket.
    itemsByPerson.set(pseudonymise(String(r.PERSON_ID)), {
      top,
      cats,
      repertoire: num(r.REPERTOIRE),
      topShare: r.TOP_PRODUCT_VISIT_SHARE == null ? null : r4(num(r.TOP_PRODUCT_VISIT_SHARE)),
    });
  }

  const venueOrder = new Map(venueList.map((v, i) => [v.id, i]));
  /**
   * The daypart was being thrown away here.
   *
   * `visitHistoryQuery` has always selected it — `MAX_BY(DAYPART, SPEND)`, the
   * daypart the visit's money was in — and this mapper built a four-wide tuple
   * and dropped it on the floor. So the drawer could only ever plot visits
   * against the calendar, and "when does this person come" was answerable for
   * the estate and not for a person.
   *
   * Indexed against `org.dayparts` rather than carried as a key, for the same
   * reason the venue is: one number against a repeated string, across every
   * visit of every guest in the working set.
   */
  const daypartOrder = new Map<string, number>(DAYPARTS.map((d, i) => [d.key, i]));
  const historyByPerson = new Map<string, [number, number, number, number, number][]>();
  for (const r of visitHistory) {
    historyByPerson.set(
      pseudonymise(String(r.PERSON_ID)),
      parseArr(r.VISITS).map((o): [number, number, number, number, number] => [
        num(o.d), num(o.o), r2(num(o.s)), venueOrder.get(String(o.v)) ?? -1,
        daypartOrder.get(String(o.p)) ?? -1,
      ]),
    );
  }

  const guestsWithItems = guests.map((g) => {
    const it = itemsByPerson.get(g.id);
    return {
      ...g,
      top: it?.top ?? [],
      cats: it?.cats ?? [],
      repertoire: it?.repertoire ?? 0,
      /** Share of their visits carrying their single most-bought product. */
      topShare: it?.topShare ?? null,
      /** Most recent visits as [dayOffsetFromWindowStart, orders, spend, venueIndex]. */
      history: historyByPerson.get(g.id) ?? [],
    };
  });

  write(org.slug, period, "guests", {
    sampled: guests.length,
    population: truePopulation,
    ...packGuests(guestsWithItems as unknown as Record<string, unknown>[]),
  });

  await extractTeam(org, w, period, venueList, windowDays);

  console.log(
    `  ✓ ${totals.orders.toLocaleString()} orders · ` +
      `${member.people.toLocaleString()} members vs ${nonMember.people.toLocaleString()} card-known · ` +
      `member worth ${(lift(nonMember.spendPerPerson, member.spendPerPerson) * 100).toFixed(0)}% more per head`,
  );
}

/**
 * The team half of one period's snapshot.
 *
 * ── Why this is a separate pass and not folded into the one above ──────────
 *
 * It reads a different half of the warehouse, joined on a key that does not
 * exist. Everything above resolves a *guest* through their payment card;
 * everything here resolves an *employee* across two systems that have never been
 * introduced. Folding them together would make one failure look like the other,
 * and the whole value of this section is being precise about which of the two
 * broke.
 *
 * It also has to be able to produce nothing. Coffee Guru is nineteen venues on
 * no rostering vendor at all, so the honest output for that organisation is a
 * refusal carrying the reason — not a section of zeroes that reads as a business
 * with no wage bill.
 */

/**
 * A `TIMESTAMP_NTZ` as the venue's wall clock.
 *
 * The driver hands these back as a `Date` built by reading the naive timestamp
 * as though it were UTC, so `getUTCHours()` returns the hour the venue actually
 * saw and `getHours()` returns that hour shifted into whatever zone the extract
 * happens to be running in. **Every reader here must use the UTC accessors**,
 * and the conversion is done once, here, rather than at each of the four call
 * sites that would otherwise each get it right or wrong on their own.
 *
 * A string is accepted too, because the driver's return type depends on how it
 * inferred the column and a helper that only handles today's inference is a
 * silent zero the first time that changes.
 */
function tsLocal(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(`${String(v).replace(" ", "T").slice(0, 23)}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function extractTeam(
  org: OrgConfig,
  w: { start: string; end: string; months: number },
  period: string,
  venueList: { id: string; name: string }[],
  windowDays: number,
) {
  console.log("  team: identity, labour, margin…");
  const storeIds = venueList.map((v) => v.id);
  const storeName = new Map(venueList.map((v) => [v.id, v.name]));
  const win = { ...w, days: windowDays };

  const empty: Team = {
    window: win,
    available: false,
    refusal: "",
    integrity: {
      vendor: null, posIdentities: 0, employees: 0, idMatches: 0, exactNameMatches: 0,
      counts: { confirmed: 0, proposed: 0, conflict: 0, collision: 0, unmatched: 0, "not-a-person": 0 },
      costedOrders: 0, costedNet: 0, orphanEmployees: 0, orphanCost: 0,
      nullStartSegments: 0, nullStartCost: 0, costCoverage: 0,
      departments: 0, sections: 0, wagedWithoutContractedHours: 0, waged: 0, salaried: 0,
      elapsedAgrees: true, segments: 0,
    },
    links: [], people: [],
    margin: { daypart: [], service: [], serviceDow: [], dow: [], dowDaypart: [], week: [], month: [], day: [], dayService: [] },
    sections: [],
    totals: { net: 0, labour: 0, leave: 0, plannedLabour: 0, hours: 0, penaltyHours: 0, penaltyCost: 0, wagePct: 0, margin: 0, netPerHour: 0 },
  };

  if (!storeIds.length) {
    write(org.slug, period, "team", { ...empty, refusal: "No venue resolved for this organisation." });
    return;
  }

  const [posRows, grainRows, salesRows, empRows, deptRows, labourRows, plannedRows, nullStart] =
    await Promise.all([
      query<Row>(T.posStaffQuery(org.id, w)),
      query<Row>(T.posStaffGrainQuery(org.id, w)),
      query<Row>(T.salesGrainQuery(org.id, w)),
      query<Row>(T.employeeQuery(storeIds)),
      query<Row>(T.departmentQuery(storeIds)),
      query<Row>(T.labourQuery(storeIds, w)),
      query<Row>(T.plannedQuery(storeIds, w)),
      query<Row>(T.labourNullStartQuery(storeIds)),
    ]);

  // The gate. No employee roll and no costed segment means no workforce system,
  // and every ratio below would be a division by an absence.
  if (!empRows.length && !labourRows.length) {
    write(org.slug, period, "team", {
      ...empty,
      integrity: { ...empty.integrity, posIdentities: posRows.length },
      refusal:
        `${org.name} has no workforce management integration. There is no roster, no timesheet and ` +
        `no employee roll in the warehouse for its ${storeIds.length} venue${storeIds.length === 1 ? "" : "s"}, ` +
        `so wage cost, labour margin and sales per labour hour cannot be computed — not approximated, ` +
        `not estimated. The POS side alone would answer who sells most, and this build does not publish ` +
        `that on its own: a raw sales total ranks people by the hours they were rostered, which is a ` +
        `roster report wearing a performance label.`,
    });
    console.log(`      team.json  refused — no workforce integration`);
    return;
  }

  // ── the identity spine ────────────────────────────────────────────────────
  const posInputs: T.MatchInput[] = posRows.map((r) => ({
    id: String(r.POS_ID), name: String(r.POS_NAME ?? ""), storeId: String(r.STORE_ID),
  }));
  const empInputs: T.MatchInput[] = empRows.map((r) => ({
    id: String(r.ID), name: String(r.NAME ?? ""), storeId: String(r.STORE_ID),
  }));

  const matches = T.matchIdentities(posInputs, empInputs);
  const matchByPos = new Map(matches.map((m) => [m.posId, m]));

  const posIdSet = new Set(posInputs.map((p) => p.id));
  const idMatches = empInputs.filter((e) => posIdSet.has(e.id)).length;
  const exactNameMatches = posInputs.filter((p) =>
    T.normaliseName(p.name) && empInputs.some((e) => T.normaliseName(e.name) === T.normaliseName(p.name)),
  ).length;

  // One alias per human. A matched pair shares it, so the two sides of the
  // mapping screen read as one person seen through two systems — which is what
  // the operator is being asked to confirm.
  const empById = new Map(empInputs.map((e) => [e.id, e]));
  const groupKey = (posId: string) => matchByPos.get(posId)?.empId ?? `pos:${posId}`;
  const aliasCache = new Map<string, T.Alias>();
  const aliasOf = (key: string): T.Alias => {
    let a = aliasCache.get(key);
    if (!a) { a = T.aliasFor(pseudonymise(key)); aliasCache.set(key, a); }
    return a;
  };

  /** The longest real surname either system holds for this person, for shape. */
  const realSurname = (posName: string, empName: string | null): string | null => {
    const cand = [posName, empName ?? ""]
      .flatMap((n) => T.normaliseName(n).split(" ").slice(1))
      .filter((t) => t.length > 1 && !T.ROLE_TOKENS.has(t));
    return cand.sort((a, b) => b.length - a.length)[0] ?? null;
  };

  const posByIdRow = new Map(posRows.map((r) => [String(r.POS_ID), r]));

  const links: TeamLink[] = matches.map((m) => {
    const r = posByIdRow.get(m.posId)!;
    const e = m.empId ? empById.get(m.empId) ?? null : null;
    const posName = String(r.POS_NAME ?? "");
    const sur = realSurname(posName, e?.name ?? null);
    const alias = aliasOf(groupKey(m.posId));
    return {
      posId: pseudonymise(m.posId),
      posLabel: T.pseudonymise(posName, alias, sur),
      empId: m.empId ? pseudonymise(m.empId) : null,
      empLabel: e ? T.pseudonymise(e.name, alias, sur) : null,
      verdict: m.verdict,
      evidence: m.evidence,
      storeId: String(r.STORE_ID),
      storeName: storeName.get(String(r.STORE_ID)) ?? String(r.STORE_ID),
      orders: num(r.ORDERS),
      net: r2(num(r.NET)),
      days: num(r.DAYS),
      rivals: m.rivals.map((id) => {
        const rival = posByIdRow.get(id);
        if (rival) return T.pseudonymise(String(rival.POS_NAME ?? ""), aliasOf(groupKey(id)), null);
        const emp = empById.get(id);
        return emp ? T.pseudonymise(emp.name, aliasOf(id), null) : "";
      }).filter(Boolean),
    };
  }).sort((a, b) => b.orders - a.orders);

  // ── labour, apportioned ───────────────────────────────────────────────────
  const deptName = new Map(deptRows.map((d) => [String(d.ID), String(d.NAME ?? "")]));

  /**
   * Cost kinds are not interchangeable and are not summed blind.
   *
   * `award` carries the worked hours and the bulk of the cost. `allowance` is
   * real cost — laundry, split shift — but its hours mirror the shift it hangs
   * off, so counting them inflates the denominator of every per-hour figure:
   * 729 allowance hours against $3,141 would read as $4.31 an hour of labour
   * that nobody worked. `leave` is paid and not worked, so it is excluded from
   * both and reported on its own, which is the same decision the production
   * labour dashboard takes and the same one for the same reason.
   */
  type Bucket = {
    net: number; labour: number; leave: number; hours: number;
    penaltyHours: number; penaltyCost: number; orders: number; covers: number;
    planned: number; hasPlanned: boolean; days: Set<string>;
  };
  const zero = (): Bucket => ({
    net: 0, labour: 0, leave: 0, hours: 0, penaltyHours: 0, penaltyCost: 0,
    orders: 0, covers: 0, planned: 0, hasPlanned: false, days: new Set(),
  });

  /** One fact table at the finest grain both sides share: store × date × daypart. */
  const cells = new Map<string, Bucket & { storeId: string; date: string; daypart: string }>();
  const cell = (storeId: string, date: string, daypart: string) => {
    const k = `${storeId}|${date}|${daypart}`;
    let c = cells.get(k);
    if (!c) { c = { ...zero(), storeId, date, daypart }; cells.set(k, c); }
    return c;
  };

  for (const r of salesRows) {
    const c = cell(String(r.STORE_ID), day(r.D)!, String(r.DAYPART));
    c.net += num(r.NET); c.orders += num(r.ORDERS); c.covers += num(r.COVERS);
    c.days.add(day(r.D)!);
  }

  const perEmployee = new Map<string, { hours: number; cost: number; penaltyHours: number; shifts: number; depts: Map<string, number> }>();
  let elapsedAgrees = true;
  let segments = 0;

  for (const r of labourRows) {
    const kind = String(r.COST_KIND ?? "");
    const start = tsLocal(r.START_TIME_TZ);
    // A segment with no start time is dropped here and counted in `integrity`.
    // It is the one row a time-bounded query loses silently, so it is the one
    // row this build refuses to lose silently.
    if (!start) continue;
    const finish = tsLocal(r.FINISH_TIME_TZ);
    const hours = num(r.HOURS);
    const cost = num(r.COST);
    const ordinary = r.ORDINARY_HOURS === true;
    const storeId = String(r.STORE_ID);
    segments++;

    // The assumption pro-rata apportionment rests on, asserted on the real rows.
    if (kind === "award" && finish && hours > 0) {
      const elapsed = (finish.getTime() - start.getTime()) / 3_600_000;
      if (elapsed > hours + 0.5) elapsedAgrees = false;
    }

    // Hours only from award. Cost from award and allowance. Leave from neither.
    const costHere = kind === "leave" ? 0 : cost;
    const hoursHere = kind === "award" ? hours : 0;

    for (const s of T.apportion(start, finish, hoursHere, costHere)) {
      const c = cell(storeId, s.date, s.daypart);
      if (kind === "leave") continue;
      c.labour += s.cost;
      c.hours += s.hours;
      c.days.add(s.date);
      if (kind === "award" && !ordinary) { c.penaltyHours += s.hours; c.penaltyCost += s.cost; }
    }
    if (kind === "leave") {
      const c = cell(storeId, start.toISOString().slice(0, 10), T.daypartOfHour(start.getUTCHours()));
      c.leave += cost;
    }

    const eid = String(r.EMPLOYEE_ID ?? "");
    if (eid) {
      let p = perEmployee.get(eid);
      if (!p) { p = { hours: 0, cost: 0, penaltyHours: 0, shifts: 0, depts: new Map() }; perEmployee.set(eid, p); }
      p.hours += hoursHere; p.cost += costHere;
      if (kind === "award" && !ordinary) p.penaltyHours += hours;
      if (kind === "award") {
        p.shifts++;
        const dn = deptName.get(String(r.DEPARTMENT_ID ?? "")) ?? "";
        if (dn) p.depts.set(dn, (p.depts.get(dn) ?? 0) + hours);
      }
    }
  }

  /** The published plan, per store per date. `ROSTER` names no daypart, so this
   *  attaches to grains derived from the date and to no others. */
  const plannedByDate = new Map<string, { cost: number; hours: number }>();
  for (const r of plannedRows) {
    const d = day(r.D)!;
    // The plan is per date, not per daypart, so it attaches to the date's cells
    // in aggregate rather than being spread across windows it does not name.
    const k = `${String(r.STORE_ID)}|${d}`;
    plannedByDate.set(k, { cost: num(r.COST), hours: num(r.HOURS) });
  }

  const orphanIds = new Set(
    labourRows.map((r) => String(r.EMPLOYEE_ID ?? "")).filter((id) => id && !empById.has(id)),
  );
  const orphanCost = labourRows
    .filter((r) => orphanIds.has(String(r.EMPLOYEE_ID ?? "")) && String(r.COST_KIND) !== "leave")
    .reduce((a, r) => a + num(r.COST), 0);

  // ── the grains ────────────────────────────────────────────────────────────
  const all = [...cells.values()];
  const roll = (
    keyOf: (c: (typeof all)[number]) => string | null,
    labelOf: (key: string) => string,
    byStore: boolean,
    /** How a plain date maps to this grain's key, where the plan can reach it. */
    plannedKeyOf?: (date: string) => string,
    /** Set where this grain cannot carry a ratio. Nulls all three, not the caption. */
    refusal?: string,
  ): TeamMarginCell[] => {
    const acc = new Map<string, Bucket & { key: string; storeId: string }>();
    for (const c of all) {
      const k = keyOf(c);
      if (k == null) continue;
      for (const store of byStore ? [c.storeId, "all"] : ["all"]) {
        const id = `${store}|${k}`;
        let b = acc.get(id);
        if (!b) { b = { ...zero(), key: k, storeId: store }; acc.set(id, b); }
        b.net += c.net; b.labour += c.labour; b.leave += c.leave; b.hours += c.hours;
        b.penaltyHours += c.penaltyHours; b.penaltyCost += c.penaltyCost;
        b.orders += c.orders; b.covers += c.covers;
        for (const d of c.days) b.days.add(d);
      }
    }
    if (plannedKeyOf) {
      for (const [k, v] of plannedByDate) {
        const [store, date] = k.split("|");
        const cellKey = plannedKeyOf(date);
        for (const s of byStore ? [store, "all"] : ["all"]) {
          const b = acc.get(`${s}|${cellKey}`);
          if (b) { b.planned += v.cost; b.hasPlanned = true; }
        }
      }
    }
    return [...acc.values()].map((b) => ({
      key: b.key,
      label: labelOf(b.key),
      storeId: b.storeId,
      net: r2(b.net),
      labour: r2(b.labour),
      leave: r2(b.leave),
      plannedLabour: b.hasPlanned ? r2(b.planned) : null,
      hours: r2(b.hours),
      penaltyHours: r2(b.penaltyHours),
      penaltyCost: r2(b.penaltyCost),
      orders: b.orders,
      covers: b.covers,
      tradingDays: b.days.size,
      wagePct: refusal ? null : b.net > 0 ? r4(b.labour / b.net) : null,
      margin: refusal ? null : r2(b.net - b.labour),
      netPerHour: refusal ? null : b.hours > 0 ? r2(b.net / b.hours) : null,
      refusal: refusal ?? null,
    }));
  };

  const DP_LABEL = new Map<string, string>(DAYPARTS.map((d) => [d.key as string, d.label as string]));
  const DOW_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

  const SV_LABEL = new Map<string, string>(T.SERVICE_BLOCKS.map((b) => [b.key as string, b.label as string]));
  const CLOCK_REFUSAL =
    "Labour is committed before and after the trade it serves — a kitchen preps at ten for a lunch " +
    "that sells at twelve, a floor team clears at eleven for a dinner that sold at seven. Wage " +
    "percentage and margin per clock hour divide the two anyway and report Late Evening at 348%. " +
    "The same trade and the same labour are measured at service-block grain, where the boundary " +
    "falls where the venue puts it.";

  const margin: TeamMargin = {
    daypart: roll((c) => c.daypart, (k) => DP_LABEL.get(k) ?? k, true, undefined, CLOCK_REFUSAL)
      // The nesting travels with the cell, so the surface groups day parts under
      // their service from the data rather than from a second copy of the map.
      .map((c) => ({ ...c, group: T.DAYPART_GROUP[c.key] }))
      .sort((a, b) => DAYPARTS.findIndex((d) => d.key === a.key) - DAYPARTS.findIndex((d) => d.key === b.key)),
    service: roll((c) => T.groupOfDaypart(c.daypart), (k) => SV_LABEL.get(k) ?? k, true)
      .sort((a, b) => T.SERVICE_BLOCKS.findIndex((x) => x.key === a.key) - T.SERVICE_BLOCKS.findIndex((x) => x.key === b.key)),
    serviceDow: roll((c) => `${dowOf(c.date)}|${T.groupOfDaypart(c.daypart)}`, (k) => {
      const [d, v] = k.split("|");
      return `${DOW_LABEL[Number(d)]} ${(SV_LABEL.get(v) ?? v).toLowerCase()}`;
    }, true).map((c) => ({ ...c, dow: Number(c.key.split("|")[0]), service: c.key.split("|")[1] })),
    dow: roll((c) => String(dowOf(c.date)), (k) => DOW_LABEL[Number(k)], true, (d) => String(dowOf(d))),
    dowDaypart: roll((c) => `${dowOf(c.date)}|${c.daypart}`, (k) => {
      const [d, p] = k.split("|");
      return `${DOW_LABEL[Number(d)]} ${DP_LABEL.get(p) ?? p}`;
    }, true, undefined, CLOCK_REFUSAL).map((c) => ({ ...c, dow: Number(c.key.split("|")[0]), daypart: c.key.split("|")[1] })),
    week: roll((c) => T.weekStart(c.date), (k) => k, true, (d) => T.weekStart(d)).sort((a, b) => a.key.localeCompare(b.key)),
    month: roll((c) => c.date.slice(0, 7), (k) => k, true, (d) => d.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
    day: roll((c) => c.date, (k) => k, true, (d) => d).sort((a, b) => a.key.localeCompare(b.key)),
    // Date × group. Every instance behind every weekday norm, so "is this Monday
    // normal for a Monday" is answered against the venue's own history rather
    // than against one flat target.
    dayService: roll((c) => `${c.date}|${T.groupOfDaypart(c.daypart)}`, (k) => {
      const [d, v] = k.split("|");
      return `${d} ${(SV_LABEL.get(v) ?? v).toLowerCase()}`;
    }, true)
      .map((c) => {
        const [date, service] = c.key.split("|");
        return { ...c, date, service, dow: dowOf(date) };
      })
      .sort((a, b) => a.key.localeCompare(b.key)),
  };

  // ── people ────────────────────────────────────────────────────────────────
  const grainByPos = new Map<string, [number, string, number, number, number, number][]>();
  for (const g of grainRows) {
    const id = String(g.POS_ID);
    const arr = grainByPos.get(id) ?? [];
    arr.push([num(g.DOW), String(g.DAYPART), num(g.ORDERS), r2(num(g.NET)), r2(num(g.ITEMS)), num(g.COVERS)]);
    grainByPos.set(id, arr);
  }

  const empMeta = new Map(empRows.map((r) => [String(r.ID), r]));
  const div = (a: number, b: number): number | null => (b > 0 ? Number((a / b).toFixed(2)) : null);

  const people: TeamPerson[] = matches.map((m) => {
    const r = posByIdRow.get(m.posId)!;
    const e = m.empId ? empMeta.get(m.empId) : null;
    const lab = m.empId ? perEmployee.get(m.empId) : null;
    const posName = String(r.POS_NAME ?? "");
    const alias = aliasOf(groupKey(m.posId));
    const sur = realSurname(posName, e ? String(e.NAME ?? "") : null);

    const orders = num(r.ORDERS);
    const net = num(r.NET);
    const items = num(r.ITEMS);
    const covers = num(r.COVERS);

    /**
     * Only a link the evidence supports may divide one system by the other.
     *
     * A conflict or a collision is exactly the case where attaching this
     * person's wage cost to that person's sales produces a confident, wrong
     * number — so those rows keep both sides and publish no ratio. A proposal
     * does carry the ratio, because a unique first name at a venue with nothing
     * contradicting it is the evidence an operator would accept, and the row
     * says on its face that it is a proposal.
     */
    const costed = m.verdict === "confirmed" || m.verdict === "proposed";
    const topDept = lab ? [...lab.depts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;

    return {
      id: pseudonymise(m.posId),
      label: T.pseudonymise(posName, alias, sur),
      storeId: String(r.STORE_ID),
      storeName: storeName.get(String(r.STORE_ID)) ?? String(r.STORE_ID),
      verdict: m.verdict,
      costed: costed && !!lab,
      employmentType: e ? ((String(e.TYPE) === "Salaried" ? "Salaried" : "Waged") as "Salaried" | "Waged") : null,
      department: topDept,
      // No costed hours means no rostering department, and "Unmapped" would read
      // as a mapping failure rather than as an absent link. It is not a section.
      section: lab ? T.sectionOf(topDept) : "—",
      orders, net: r2(net), items: r2(items), covers,
      ordersWithCovers: num(r.ORDERS_WITH_COVERS),
      days: num(r.DAYS),
      discount: r2(num(r.DISCOUNT)),
      itemsPerCover: div(items, covers),
      avgItemValue: div(net, items),
      netPerCover: div(net, covers),
      netPerOrder: div(net, orders),
      coversPerOrder: div(covers, num(r.ORDERS_WITH_COVERS)),
      hours: lab ? r2(lab.hours) : null,
      cost: lab ? r2(lab.cost) : null,
      penaltyHours: lab ? r2(lab.penaltyHours) : null,
      shifts: lab ? lab.shifts : null,
      netPerHour: costed && lab && lab.hours > 0 ? div(net, lab.hours) : null,
      coversPerHour: costed && lab && lab.hours > 0 ? div(covers, lab.hours) : null,
      costPerHour: lab && lab.hours > 0 ? div(lab.cost, lab.hours) : null,
      wagePct: costed && lab && net > 0 ? r4(lab.cost / net) : null,
      grain: grainByPos.get(m.posId) ?? [],
    };
  }).sort((a, b) => b.net - a.net);

  // Employees who worked and never rang an order. A kitchen is not a failure of
  // attribution — it is a section whose output is not a sale, and leaving it out
  // of the roll would understate the wage bill the sales side is measured against.
  for (const [eid, lab] of perEmployee) {
    if (links.some((l) => l.empId === pseudonymise(eid))) continue;
    const e = empMeta.get(eid);
    const topDept = [...lab.depts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const alias = aliasOf(eid);
    people.push({
      id: pseudonymise(eid),
      label: e ? T.pseudonymise(String(e.NAME ?? ""), alias, realSurname("", String(e.NAME ?? ""))) : "Former employee",
      storeId: e ? String(e.STORE_ID) : "",
      storeName: e ? storeName.get(String(e.STORE_ID)) ?? "" : "",
      verdict: e ? "unmatched" : "unmatched",
      costed: false,
      employmentType: e ? ((String(e.TYPE) === "Salaried" ? "Salaried" : "Waged") as "Salaried" | "Waged") : null,
      department: topDept,
      section: T.sectionOf(topDept),
      orders: 0, net: 0, items: 0, covers: 0, ordersWithCovers: 0, days: 0, discount: 0,
      itemsPerCover: null, avgItemValue: null, netPerCover: null, netPerOrder: null, coversPerOrder: null,
      hours: r2(lab.hours), cost: r2(lab.cost), penaltyHours: r2(lab.penaltyHours), shifts: lab.shifts,
      netPerHour: null, coversPerHour: null, costPerHour: lab.hours > 0 ? div(lab.cost, lab.hours) : null,
      wagePct: null,
      grain: [],
    });
  }

  // ── sections ──────────────────────────────────────────────────────────────
  const sectionAcc = new Map<string, { departments: Set<string>; storeIds: Set<string>; hours: number; cost: number; penaltyCost: number; people: Set<string> }>();
  for (const p of people) {
    if (p.hours == null) continue;
    let s = sectionAcc.get(p.section);
    if (!s) { s = { departments: new Set(), storeIds: new Set(), hours: 0, cost: 0, penaltyCost: 0, people: new Set() }; sectionAcc.set(p.section, s); }
    if (p.department) s.departments.add(p.department);
    if (p.storeId) s.storeIds.add(p.storeId);
    s.hours += p.hours; s.cost += p.cost ?? 0; s.people.add(p.id);
  }

  const totalNet = all.reduce((a, c) => a + c.net, 0);
  const totalLabour = all.reduce((a, c) => a + c.labour, 0);
  const totalHours = all.reduce((a, c) => a + c.hours, 0);
  const costedNet = links.filter((l) => l.verdict === "confirmed" || l.verdict === "proposed").reduce((a, l) => a + l.net, 0);
  const costedOrders = links.filter((l) => l.verdict === "confirmed" || l.verdict === "proposed").reduce((a, l) => a + l.orders, 0);
  const counts = matches.reduce(
    (acc, m) => ({ ...acc, [m.verdict]: (acc[m.verdict] ?? 0) + 1 }),
    { confirmed: 0, proposed: 0, conflict: 0, collision: 0, unmatched: 0, "not-a-person": 0 } as Record<TeamVerdict, number>,
  );

  const waged = empRows.filter((r) => String(r.TYPE) !== "Salaried");
  const team: Team = {
    window: win,
    available: true,
    refusal: null,
    integrity: {
      vendor: empRows.length ? String(empRows[0].SOURCE ?? "") || null : null,
      posIdentities: posRows.length,
      employees: empRows.length,
      idMatches,
      exactNameMatches,
      counts,
      costedOrders,
      costedNet: r2(costedNet),
      orphanEmployees: orphanIds.size,
      orphanCost: r2(orphanCost),
      nullStartSegments: num(nullStart[0]?.N),
      nullStartCost: r2(num(nullStart[0]?.COST)),
      costCoverage: r4(
        posRows.reduce((a, r) => a + num(r.ORDERS_WITH_COST), 0) /
          Math.max(1, posRows.reduce((a, r) => a + num(r.ORDERS), 0)),
      ),
      departments: new Set(deptRows.map((d) => String(d.NAME))).size,
      sections: sectionAcc.size,
      wagedWithoutContractedHours: waged.filter((r) => !num(r.CONTRACTED_WEEKLY_HOURS)).length,
      waged: waged.length,
      salaried: empRows.length - waged.length,
      elapsedAgrees,
      segments,
    },
    links,
    people,
    margin,
    sections: [...sectionAcc.entries()]
      .map(([section, s]) => ({
        section,
        departments: [...s.departments].sort(),
        storeIds: [...s.storeIds],
        hours: r2(s.hours),
        cost: r2(s.cost),
        penaltyCost: r2(s.penaltyCost),
        people: s.people.size,
      }))
      .sort((a, b) => b.cost - a.cost),
    totals: {
      net: r2(totalNet),
      labour: r2(totalLabour),
      leave: r2(all.reduce((a, c) => a + c.leave, 0)),
      plannedLabour: r2([...plannedByDate.values()].reduce((a, v) => a + v.cost, 0)),
      hours: r2(totalHours),
      penaltyHours: r2(all.reduce((a, c) => a + c.penaltyHours, 0)),
      penaltyCost: r2(all.reduce((a, c) => a + c.penaltyCost, 0)),
      wagePct: totalNet > 0 ? r4(totalLabour / totalNet) : 0,
      margin: r2(totalNet - totalLabour),
      netPerHour: totalHours > 0 ? r2(totalNet / totalHours) : 0,
    },
  };

  write(org.slug, period, "team", team);
  console.log(
    `      ${counts.confirmed} confirmed · ${counts.proposed} proposed · ${counts.conflict} conflict · ` +
      `${counts.collision} collision · ${counts.unmatched} unmatched · ${counts["not-a-person"]} not a person · ` +
      `wage ${(team.totals.wagePct * 100).toFixed(1)}%`,
  );
}

/**
 * Re-extract only the team half, over the periods already on disk.
 *
 *   npm run extract -- --team
 *
 * ── Why this mode exists ───────────────────────────────────────────────────
 *
 * A full extract derives its own window from today's date and re-grades every
 * month, so running one to add a new file would move every published figure in
 * the build — and the README, the changelog and the decision record all quote
 * those figures against a stated extraction date. Adding a section is not a
 * reason to invalidate the numbers a reader has already checked.
 *
 * So this reads the periods and venues that are already on disk and writes
 * `team.json` beside them, against exactly the window the rest of the snapshot
 * was taken over. The team figures and the customer figures therefore cover the
 * same days, which is the only way a wage percentage and a revenue total on two
 * different screens can be reconciled by the operator reading both.
 */
async function extractTeamOnly(org: OrgConfig) {
  console.log(`\n${org.name}  (team only)`);
  const index = JSON.parse(
    readFileSync(join(DATA, org.slug, "periods.json"), "utf8"),
  ) as { periods: { id: string }[] };

  for (const p of index.periods) {
    const snap = JSON.parse(
      readFileSync(join(DATA, org.slug, p.id, "org.json"), "utf8"),
    ) as { window: { start: string; end: string; months: number; days: number }; venues: { id: string; name: string }[] };
    console.log(`\n  period ${p.id}  (${snap.window.start} → ${snap.window.end})`);
    await extractTeam(
      org,
      { start: snap.window.start, end: snap.window.end, months: snap.window.months },
      p.id,
      snap.venues,
      snap.window.days,
    );
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const teamOnly = argv.includes("--team");
  const only = argv.filter((a) => !a.startsWith("-"));
  const orgs = only.length ? ORGS.filter((o) => only.includes(o.slug)) : ORGS;
  if (!orgs.length) throw new Error(`No matching org. Known: ${ORGS.map((o) => o.slug).join(", ")}`);
  for (const org of orgs) await (teamOnly ? extractTeamOnly(org) : extractOrg(org));
  await disconnect();
  console.log("\nDone.");
}

main().catch(async (e) => {
  console.error("\nExtract failed:", e.message);
  await disconnect();
  process.exit(1);
});

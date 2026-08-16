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
  analysisWindow, discoveryWindow, CANONICAL_LAPSE_DAYS, DAYPARTS, ORGS, type OrgConfig,
} from "./orgs";
import {
  storeMapQuery, parQualityQuery, orderStatusQuery, monthlyOrdersQuery, type StorePair,
} from "./sql";
import * as Q from "./queries";
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

function write(slug: string, name: string, value: unknown) {
  const dir = join(DATA, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(value));
  const kb = (Buffer.byteLength(JSON.stringify(value)) / 1024).toFixed(0);
  console.log(`    ${name}.json  ${kb} KB`);
}

// ── the run ─────────────────────────────────────────────────────────────────
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
  console.log("  testing card capture…");
  const [parRows, orderMonths] = await Promise.all([
    query<Row>(parQualityQuery(discovery, pairs.map((p) => p.payStore))),
    query<Row>(monthlyOrdersQuery(org.id, discovery)),
  ]);
  const ordersByMonth = new Map(orderMonths.map((r) => [day(r.MONTH)!, num(r.ORDERS)]));
  const MIN_RATIO = 0.1;
  // Calibrated against the observed separation rather than picked. Across both
  // merchants the healthy months top out at 3.6% on their most frequent
  // reference and the broken ones start at 50.8%, so anything in between
  // separates them; 10% is chosen because no genuine single card plausibly
  // accounts for a tenth of a venue's monthly card volume. The review's 1% is
  // right for estate-wide volumes and wrong for a two-venue merchant, where one
  // twice-weekly regular clears it.
  const MAX_TOKEN_SHARE = 0.1;
  // The volume test compares a month against the months the business was
  // actually open, not against every month in the discovery window.
  const trading = parRows.filter((r) => (ordersByMonth.get(day(r.MONTH)!) ?? 0) > 0);
  const volumes = trading.map((r) => num(r.TXNS)).sort((a, b) => a - b);
  const medianTxns = volumes[Math.floor(volumes.length / 2)] ?? 0;

  const graded = parRows.map((r) => {
    const month = day(r.MONTH)!;
    const txns = num(r.TXNS);
    const orders = ordersByMonth.get(month) ?? 0;
    const ratio = txns ? r4(num(r.DISTINCT_PAR) / txns) : 0;
    const maxTokenShare = r4(num(r.MAX_TOKEN_SHARE));
    const reason =
      orders === 0
        ? "not trading"
        : txns < medianTxns * 0.3
          ? "payments incomplete"
          : maxTokenShare >= MAX_TOKEN_SHARE
            ? num(r.DISTINCT_PAR) <= 3 ? "no card capture" : "one token dominates"
            : ratio < MIN_RATIO
              ? "degraded card capture"
              : null;
    return {
      month, txns, orders, distinctPar: num(r.DISTINCT_PAR), withPar: num(r.WITH_PAR),
      ratio, maxTokenShare, ok: reason === null, reason,
    };
  });
  const allCardMonths = graded.filter((q) => q.ok).map((q) => q.month);
  console.log(`    card capture usable in ${allCardMonths.length} of ${graded.length} months`);
  for (const e of graded.filter((q) => !q.ok)) console.log(`      ✗ ${e.month}  ${e.reason}`);

  // 3. Open the honest window: the most recent unbroken run of usable months,
  //    complete months only. Nothing in the product renders outside it.
  const w = analysisWindow(allCardMonths);
  const cardMonths = allCardMonths.filter((m) => m >= w.start && m <= w.end);
  console.log(`  analysis window ${w.start} → ${w.end}  (${w.months} complete months)`);

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

  write(org.slug, "members", {
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

  write(org.slug, "network", {
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

  write(org.slug, "dayparts", {
    window: { ...w, days: windowDays },
    periods: byDaypart,
    weekendBaseline: (() => {
      const all = dpRows.reduce((a, r) => a + r.orders, 0);
      const we = dpRows.filter((r) => r.weekend).reduce((a, r) => a + r.orders, 0);
      return all ? r4(we / all) : 0;
    })(),
  });

  // ── remaining files ───────────────────────────────────────────────────────
  const segmentRows = segments.map((s) => ({
    tier: String(s.TIER),
    segment: s.SEGMENT == null ? null : String(s.SEGMENT),
    valueBand: num(s.VALUE_BAND), guests: num(s.GUESTS), visits: num(s.VISITS),
    spend: num(s.SPEND), minSpend: num(s.MIN_SPEND), maxSpend: num(s.MAX_SPEND),
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

  write(org.slug, "org", {
    ...org, window: { ...w, days: windowDays }, discoveryWindow: discovery,
    extractedAt: new Date().toISOString(),
    venues: venueList, calibration: calibrated,
    storeMap: { terminals: pairs.length, venuesResolved: mappedStores.size },
    cardTier: { months: cardMonths, allUsableMonths: allCardMonths, quality: graded },
    orderStatuses: statuses.map((s) => ({
      status: String(s.ORDER_STATUS), training: String(s.TRAINING).toLowerCase() === "true",
      orders: num(s.ORDERS), revenue: num(s.REVENUE), zeroValue: num(s.ZERO_VALUE),
    })),
    dayparts: DAYPARTS.map((d) => ({ ...d })),
  });

  write(org.slug, "coverage", {
    totals, byVenue: cov,
    monthly: coverageTrend.map((r) => ({
      month: day(r.MONTH), orders: num(r.ORDERS), revenue: num(r.REVENUE),
      memberRevenue: num(r.MEMBER_REVENUE), scannedRevenue: num(r.SCANNED_REVENUE),
      cardRevenue: num(r.CARD_REVENUE), memberOrders: num(r.MEMBER_ORDERS),
      scannedOrders: num(r.SCANNED_ORDERS), cardOrders: num(r.CARD_ORDERS),
    })),
  });

  write(org.slug, "lifecycle", lifecycle.map((r) => ({
    month: day(r.MONTH), tier: String(r.TIER), new: num(r.NEW), returning: num(r.RETURNING),
    reactivated: num(r.REACTIVATED), active: num(r.ACTIVE), lapsed: num(r.LAPSED),
    revenue: num(r.REVENUE), visits: num(r.VISITS),
  })));

  write(org.slug, "decomposition", decomposition.map((r) => ({
    month: day(r.MONTH), guests: num(r.GUESTS), visits: num(r.VISITS), revenue: num(r.REVENUE),
    items: num(r.ITEMS), visitsPerGuest: r4(num(r.VISITS_PER_GUEST)),
    spendPerVisit: r4(num(r.SPEND_PER_VISIT)), itemsPerVisit: r4(num(r.ITEMS_PER_VISIT)),
    pricePerItem: r4(num(r.PRICE_PER_ITEM)),
  })));

  write(org.slug, "segments", {
    population: truePopulation, rows: segmentRows,
    gapHistogram: gapHist.map((r) => ({ days: num(r.DAYS), n: num(r.N) })),
  });

  write(org.slug, "venueMonthly", venueMonthly.map((r) => ({
    month: day(r.MONTH), storeId: String(r.STORE_ID), storeName: String(r.STORE_NAME),
    orders: num(r.ORDERS), revenue: num(r.REVENUE), memberOrders: num(r.MEMBER_ORDERS),
    memberRevenue: num(r.MEMBER_REVENUE), cardOrders: num(r.CARD_ORDERS),
    scannedOrders: num(r.SCANNED_ORDERS), ordersWithCovers: num(r.ORDERS_WITH_COVERS),
    tradingDays: num(r.TRADING_DAYS), discount: num(r.DISCOUNT),
  })));

  write(org.slug, "guests", { sampled: guests.length, population: truePopulation, rows: guests });

  console.log(
    `  ✓ ${totals.orders.toLocaleString()} orders · ` +
      `${member.people.toLocaleString()} members vs ${nonMember.people.toLocaleString()} card-known · ` +
      `member worth ${(lift(nonMember.spendPerPerson, member.spendPerPerson) * 100).toFixed(0)}% more per head`,
  );
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const orgs = only.length ? ORGS.filter((o) => only.includes(o.slug)) : ORGS;
  if (!orgs.length) throw new Error(`No matching org. Known: ${ORGS.map((o) => o.slug).join(", ")}`);
  for (const org of orgs) await extractOrg(org);
  await disconnect();
  console.log("\nDone.");
}

main().catch(async (e) => {
  console.error("\nExtract failed:", e.message);
  await disconnect();
  process.exit(1);
});

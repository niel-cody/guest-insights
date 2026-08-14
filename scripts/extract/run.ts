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
import { analysisWindow, CANONICAL_LAPSE_DAYS, ORGS, type OrgConfig } from "./orgs";
import { storeMapQuery, parQualityQuery, type StorePair } from "./sql";
import * as Q from "./queries";

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
function displayName(hash: string): string {
  const a = parseInt(hash.slice(0, 4), 16) % FIRST.length;
  const b = parseInt(hash.slice(4, 8), 16) % LAST.length;
  return `${FIRST[a]} ${LAST[b]}`;
}

// ── helpers ─────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const day = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

function write(slug: string, name: string, value: unknown) {
  const dir = join(DATA, slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(value));
  const kb = (Buffer.byteLength(JSON.stringify(value)) / 1024).toFixed(0);
  console.log(`    ${name}.json  ${kb} KB`);
}

// ── the run ─────────────────────────────────────────────────────────────────
async function extractOrg(org: OrgConfig) {
  const w = analysisWindow();
  console.log(`\n${org.name}  (${w.start} → ${w.end})`);

  // 1. Resolve the payments→POS store map from evidence.
  console.log("  resolving store map…");
  const mapRows = await query<Row>(storeMapQuery(org.id, w));

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
  console.log(
    `    ${pairs.length} terminals across ${mappedStores.size} venues ` +
      `(${mapRows.length - pairs.length} collisions dropped, floor ${floor})`,
  );
  if (!pairs.length) throw new Error(`No payment stores resolved for ${org.name}`);

  // 1b. Establish when the card tier becomes trustworthy for this merchant.
  //
  // PAR is not reliably per-card from the beginning of the window. At Coffee Guru
  // it is a single constant value across every transaction until early 2026 —
  // present, non-null, and worthless. A model that trusts it turns eight thousand
  // transactions a month into one customer. We find the first month where
  // distinct references reach a plausible share of transactions and hold, and the
  // card tier starts there. Everything before is unattributed, and the UI says so.
  console.log("  testing PAR quality…");
  const parRows = await query<Row>(parQualityQuery(w, pairs.map((p) => p.payStore)));
  const parQuality = parRows.map((r) => {
    const txns = num(r.TXNS);
    return {
      month: day(r.MONTH)!,
      txns,
      distinctPar: num(r.DISTINCT_PAR),
      withPar: num(r.WITH_PAR),
      /** Distinct references per transaction. Real card trade sits well above 0.15. */
      ratio: txns ? Number((num(r.DISTINCT_PAR) / txns).toFixed(4)) : 0,
    };
  });
  // Two independent tests, because there are two distinct failures in this data.
  //   ratio  — PAR present but constant. Ten months of it at Coffee Guru.
  //   volume — payment rows themselves missing for the month, an ingestion gap.
  // A month has to pass both to carry a card tier.
  const MIN_RATIO = 0.1;
  const volumes = parQuality.map((q) => q.txns).sort((a, b) => a - b);
  const medianTxns = volumes[Math.floor(volumes.length / 2)] ?? 0;
  const graded = parQuality.map((q) => ({
    ...q,
    ok: q.ratio >= MIN_RATIO && q.txns >= medianTxns * 0.3,
    reason:
      q.ratio < MIN_RATIO
        ? q.distinctPar <= 3
          ? "no card capture"
          : "degraded card capture"
        : q.txns < medianTxns * 0.3
          ? "payments incomplete"
          : null,
  }));
  const cardMonths = graded.filter((q) => q.ok).map((q) => q.month);
  const excluded = graded.filter((q) => !q.ok);
  console.log(`    card tier valid in ${cardMonths.length} of ${graded.length} months`);
  for (const e of excluded) console.log(`      ✗ ${e.month}  ${e.reason}`);

  const args = { orgId: org.id, w, pairs, lapseDays: CANONICAL_LAPSE_DAYS, cardMonths };

  // 2. Calibrate the thresholds from this org's own inter-visit distribution
  //    before anything that depends on them is computed.
  console.log("  calibrating thresholds…");
  const [cal] = await query<Row>(Q.calibrationQuery(args));
  const calibrated = {
    n: num(cal?.N),
    medianGapDays: num(cal?.P50),
    p75: num(cal?.P75),
    p90: num(cal?.P90),
    p95: num(cal?.P95),
    meanGapDays: Number(num(cal?.MEAN).toFixed(1)),
    /** Slipping and lapsed cuts recommended by the data, per D3. */
    slippingDays: Math.max(7, Math.round(num(cal?.P75))),
    lapsedDays: Math.max(21, Math.round(num(cal?.P90))),
    canonicalLapsedDays: CANONICAL_LAPSE_DAYS,
  };
  const calArgs = { ...args, lapseDays: calibrated.lapsedDays };
  console.log(
    `    median gap ${calibrated.medianGapDays}d · slipping >${calibrated.slippingDays}d · lapsed >${calibrated.lapsedDays}d`,
  );

  // 3. Everything else.
  console.log("  venues, coverage…");
  const [venues, coverage, coverageTrend] = await Promise.all([
    query<Row>(Q.venuesQuery(args)),
    query<Row>(Q.coverageQuery(args)),
    query<Row>(Q.coverageTrendQuery(args)),
  ]);

  console.log("  lifecycle, decomposition, gaps…");
  const [lifecycle, decomposition, gapHist] = await Promise.all([
    query<Row>(Q.lifecycleQuery(calArgs)),
    query<Row>(Q.decompositionQuery(args)),
    query<Row>(Q.gapHistogramQuery(args)),
  ]);

  console.log("  segments, linkage, member comparison…");
  const [segments, linkage, comparison] = await Promise.all([
    query<Row>(Q.segmentsQuery(calArgs)),
    query<Row>(Q.linkageQuery(args)),
    query<Row>(Q.memberComparisonQuery(args)),
  ]);

  console.log("  venue by month…");
  const venueMonthly = await query<Row>(Q.venueMonthlyQuery(args));

  console.log("  guest list…");
  const guestRows = await query<Row>(Q.guestListQuery(calArgs));

  // ── shape and write ───────────────────────────────────────────────────────
  const venueList = venues
    .filter((v) => mappedStores.has(String(v.STORE_ID)))
    .map((v) => ({
      id: String(v.STORE_ID),
      name: String(v.STORE_NAME),
      venueName: String(v.VENUE_NAME ?? v.STORE_NAME),
      orders: num(v.ORDERS),
      firstDay: day(v.FIRST_DAY),
      lastDay: day(v.LAST_DAY),
    }));

  const cov = coverage.map((r) => ({
    storeId: String(r.STORE_ID),
    storeName: String(r.STORE_NAME),
    orders: num(r.ORDERS),
    revenue: num(r.REVENUE),
    memberOrders: num(r.MEMBER_ORDERS),
    memberRevenue: num(r.MEMBER_REVENUE),
    cardOrders: num(r.CARD_ORDERS),
    cardRevenue: num(r.CARD_REVENUE),
    unattributedOrders: num(r.UNATTRIBUTED_ORDERS),
    unattributedRevenue: num(r.UNATTRIBUTED_REVENUE),
    ordersWithCovers: num(r.ORDERS_WITH_COVERS),
    covers: num(r.COVERS),
  }));

  const guests = guestRows.map((g) => {
    const hash = pseudonymise(String(g.PERSON_ID));
    return {
      id: hash,
      name: displayName(hash),
      tier: String(g.TIER) as "member" | "card",
      segment: String(g.SEGMENT),
      valueBand: num(g.VALUE_BAND),
      visits: num(g.VISITS),
      venues: num(g.VENUES),
      spend: Number(num(g.SPEND).toFixed(2)),
      orders: num(g.ORDERS),
      items: num(g.ITEMS),
      firstSeen: day(g.FIRST_SEEN),
      lastSeen: day(g.LAST_SEEN),
      daysSince: num(g.DAYS_SINCE),
      tenureDays: num(g.TENURE_DAYS),
      cadenceDays: g.CADENCE_DAYS == null ? null : Number(num(g.CADENCE_DAYS).toFixed(1)),
      homeStoreId: String(g.HOME_STORE_ID),
      homeStore: String(g.HOME_STORE),
    };
  });

  const totals = cov.reduce(
    (a, c) => ({
      orders: a.orders + c.orders,
      revenue: a.revenue + c.revenue,
      memberOrders: a.memberOrders + c.memberOrders,
      memberRevenue: a.memberRevenue + c.memberRevenue,
      cardOrders: a.cardOrders + c.cardOrders,
      cardRevenue: a.cardRevenue + c.cardRevenue,
      unattributedOrders: a.unattributedOrders + c.unattributedOrders,
      unattributedRevenue: a.unattributedRevenue + c.unattributedRevenue,
      ordersWithCovers: a.ordersWithCovers + c.ordersWithCovers,
      covers: a.covers + c.covers,
    }),
    {
      orders: 0, revenue: 0, memberOrders: 0, memberRevenue: 0, cardOrders: 0,
      cardRevenue: 0, unattributedOrders: 0, unattributedRevenue: 0,
      ordersWithCovers: 0, covers: 0,
    },
  );

  const segmentRows = segments.map((s) => ({
    tier: String(s.TIER),
    segment: String(s.SEGMENT),
    valueBand: num(s.VALUE_BAND),
    guests: num(s.GUESTS),
    visits: num(s.VISITS),
    spend: num(s.SPEND),
    minSpend: num(s.MIN_SPEND),
    maxSpend: num(s.MAX_SPEND),
    avgVisits: Number(num(s.AVG_VISITS).toFixed(2)),
    avgSpend: Number(num(s.AVG_SPEND).toFixed(2)),
    multiVenue: num(s.MULTI_VENUE),
  }));

  const truePopulation = segmentRows.reduce((a, s) => a + s.guests, 0);

  write(org.slug, "org", {
    ...org,
    window: w,
    extractedAt: new Date().toISOString(),
    venues: venueList,
    calibration: calibrated,
    storeMap: { terminals: pairs.length, venuesResolved: mappedStores.size },
    cardTier: { months: cardMonths, quality: graded },
  });

  write(org.slug, "coverage", { totals, byVenue: cov, monthly: coverageTrend.map((r) => ({
    month: day(r.MONTH),
    orders: num(r.ORDERS),
    revenue: num(r.REVENUE),
    memberRevenue: num(r.MEMBER_REVENUE),
    cardRevenue: num(r.CARD_REVENUE),
    memberOrders: num(r.MEMBER_ORDERS),
    cardOrders: num(r.CARD_ORDERS),
  })) });

  write(org.slug, "lifecycle", lifecycle.map((r) => ({
    month: day(r.MONTH),
    tier: String(r.TIER),
    new: num(r.NEW),
    returning: num(r.RETURNING),
    reactivated: num(r.REACTIVATED),
    active: num(r.ACTIVE),
    lapsed: num(r.LAPSED),
    revenue: num(r.REVENUE),
    visits: num(r.VISITS),
  })));

  write(org.slug, "decomposition", decomposition.map((r) => ({
    month: day(r.MONTH),
    guests: num(r.GUESTS),
    visits: num(r.VISITS),
    revenue: num(r.REVENUE),
    items: num(r.ITEMS),
    visitsPerGuest: Number(num(r.VISITS_PER_GUEST).toFixed(4)),
    spendPerVisit: Number(num(r.SPEND_PER_VISIT).toFixed(4)),
    itemsPerVisit: Number(num(r.ITEMS_PER_VISIT).toFixed(4)),
    pricePerItem: Number(num(r.PRICE_PER_ITEM).toFixed(4)),
  })));

  write(org.slug, "segments", {
    population: truePopulation,
    rows: segmentRows,
    gapHistogram: gapHist.map((r) => ({ days: num(r.DAYS), n: num(r.N) })),
  });

  write(org.slug, "comparison", comparison.map((r) => ({
    tier: String(r.TIER),
    channel: String(r.CHANNEL),
    orderType: String(r.ORDER_TYPE_NAME ?? ""),
    orders: num(r.ORDERS),
    revenue: num(r.REVENUE),
    avgOrder: Number(num(r.AVG_ORDER).toFixed(2)),
    avgItems: Number(num(r.AVG_ITEMS).toFixed(3)),
    avgCovers: r.AVG_COVERS == null ? null : Number(num(r.AVG_COVERS).toFixed(3)),
    ordersWithCovers: num(r.ORDERS_WITH_COVERS),
    spendPerCover: r.SPEND_PER_COVER == null ? null : Number(num(r.SPEND_PER_COVER).toFixed(2)),
  })));

  write(org.slug, "linkage", {
    cards: num(linkage[0]?.CARDS),
    cardsLinkedToMember: num(linkage[0]?.CARDS_LINKED_TO_MEMBER),
    cardsSometimesScanned: num(linkage[0]?.CARDS_SOMETIMES_SCANNED),
    unscannedOrdersOfKnownMembers: num(linkage[0]?.UNSCANNED_ORDERS_OF_KNOWN_MEMBERS),
    cardsOnMultipleMembers: num(linkage[0]?.CARDS_ON_MULTIPLE_MEMBERS),
  });

  write(org.slug, "venueMonthly", venueMonthly.map((r) => ({
    month: day(r.MONTH),
    storeId: String(r.STORE_ID),
    storeName: String(r.STORE_NAME),
    orders: num(r.ORDERS),
    revenue: num(r.REVENUE),
    memberOrders: num(r.MEMBER_ORDERS),
    cardOrders: num(r.CARD_ORDERS),
    ordersWithCovers: num(r.ORDERS_WITH_COVERS),
    tradingDays: num(r.TRADING_DAYS),
    discount: num(r.DISCOUNT),
  })));

  write(org.slug, "guests", { sampled: guests.length, population: truePopulation, rows: guests });

  console.log(
    `  ✓ ${totals.orders.toLocaleString()} orders · ` +
      `member ${((totals.memberRevenue / totals.revenue) * 100).toFixed(1)}% → ` +
      `+card ${(((totals.memberRevenue + totals.cardRevenue) / totals.revenue) * 100).toFixed(1)}% of revenue · ` +
      `${truePopulation.toLocaleString()} guests`,
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

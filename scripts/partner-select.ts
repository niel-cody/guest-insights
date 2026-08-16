/**
 * CI-023 — which tenants have a clean unbroken run of card capture of at least
 * 13 months, and which reach 24?
 *
 *   npm run partner
 *
 * This is the gate on POC 3. The three-month window everyone has been designing
 * around is a property of Coffee Guru and Meat Flour Wine, not of Oolio's data.
 * This script runs the card-capture grading the extract already applies to one
 * merchant across every merchant whose payment terminals can be resolved, and
 * ranks them by longest unbroken run of trustworthy months.
 *
 * The grading is the same four tests the extract uses, deliberately — a
 * selection made on a different rule than the load would select a partner the
 * load then rejects:
 *
 *   not trading            the venue was not open. Not a feed failure.
 *   payments incomplete    volume collapsed against the merchant's own median.
 *   one token dominates    the reference is varied but one token holds ≥10%.
 *   no card capture        ≤3 distinct references in the month.
 *   degraded card capture  distinct-reference ratio under 10%.
 *
 * The third test is the load-bearing one. **PAYMENT_ACCOUNT_REFERENCE is never
 * NULL**, so COUNT(reference) scores a broken month as fully covered — which is
 * exactly how ten months of Coffee Guru, carrying 403,600 transactions on a
 * single token, passed every coverage test anyone ran.
 *
 * Output: `data/_partners.json`, plus a ranked table on stdout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { query, disconnect } from "./snowflake";
import {
  MAX_TOKEN_SHARE, MIN_COVERAGE, MIN_DISTINCT_RATIO, claimLevel, gradeMonth, longestRun,
  realParSql, type MonthRow,
} from "./grade";

const ROOT = join(import.meta.dirname, "..");
const ORDERS = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS";
const PAYMENTS = "OOLIO_PAY_ACQUIRERS.PUBLIC.OOLIO_TRANSACTIONS";
const STORES = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.DT_STORES";
const ORDER_PAYMENTS = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDER_PAYMENTS";

type Row = Record<string, unknown>;
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const day = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const r4 = (n: number) => Number(n.toFixed(4));

/**
 * The estate's payments→POS map, from the dimension rather than from evidence.
 *
 * The extract derives this per merchant by joining on (STORE, ORDER_NUMBER,
 * TRADING_DATE), which is exact but far too expensive to run across 2,540
 * stores. `DT_STORES.INSTORE_PAY_REF` and `ONLINE_PAY_REF` give it directly —
 * for the minority of stores that carry one. That shortfall is itself a finding
 * and is reported, because a tenant we cannot map is a tenant we cannot select.
 */
const REFS = `refs AS (
  SELECT ID AS STORE_ID, ORG_ID, INSTORE_PAY_REF AS REF FROM ${STORES} WHERE NULLIF(INSTORE_PAY_REF, '') IS NOT NULL
  UNION ALL
  SELECT ID, ORG_ID, ONLINE_PAY_REF FROM ${STORES} WHERE NULLIF(ONLINE_PAY_REF, '') IS NOT NULL
)`;

/** Candidate merchants: multi-venue, still trading, enough card volume to grade. */
function candidatesQuery(minStores: number, maxStores: number, minTxns: number) {
  return `WITH ${REFS},
paystore AS (
  SELECT STORE, COUNT(*) AS TXNS, MAX(TRADING_DATE) AS LAST_TXN
  FROM ${PAYMENTS} WHERE AMOUNT > 0 AND NULLIF(STORE, '') IS NOT NULL GROUP BY 1
),
mapped AS (
  SELECT r.ORG_ID, COUNT(DISTINCT r.STORE_ID) AS STORES_MAPPED, COUNT(DISTINCT p.STORE) AS TERMINALS,
         SUM(p.TXNS) AS TXNS, MAX(p.LAST_TXN) AS LAST_TXN
  FROM refs r JOIN paystore p ON p.STORE = r.REF GROUP BY 1
),
estate AS (
  SELECT ORG_ID, COUNT(*) AS STORES_TOTAL, COUNT_IF(GEOCODE IS NOT NULL) AS GEOCODED
  FROM ${STORES} WHERE COALESCE(IS_DELETED, FALSE) = FALSE GROUP BY 1
),
named AS (
  SELECT ORGANIZATION_ID, MAX_BY(ORGANIZATION_NAME, CREATED_AT_TZ) AS ORG_NAME, COUNT(*) AS ORDERS
  FROM ${ORDERS}
  WHERE CREATED_AT_TZ >= DATEADD(month, -30, CURRENT_DATE())
    AND ORDER_STATUS = 'COMPLETED' AND COALESCE(IS_TRAINING, FALSE) = FALSE AND TOTAL_PRICE > 0
  GROUP BY 1
)
SELECT m.ORG_ID, n.ORG_NAME, m.STORES_MAPPED, m.TERMINALS, m.TXNS, n.ORDERS,
       e.STORES_TOTAL, e.GEOCODED
FROM mapped m
JOIN estate e ON e.ORG_ID = m.ORG_ID
JOIN named n ON n.ORGANIZATION_ID = m.ORG_ID
WHERE m.STORES_MAPPED BETWEEN ${minStores} AND ${maxStores}
  AND m.TXNS >= ${minTxns}
  AND m.LAST_TXN >= DATEADD(month, -2, CURRENT_DATE())
ORDER BY m.TXNS DESC`;
}

/**
 * Monthly card-capture quality for every candidate at once.
 *
 * MAX_TOKEN_SHARE is computed per org-month: the share of that month's carded
 * transactions sitting on its single most frequent reference. Healthy merchant
 * months top out around 3.6%; the broken ones sit at 50.8% and above.
 */
function parQualityQuery(orgIds: string[]) {
  const inList = orgIds.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
  return `WITH ${REFS},
org_store AS (SELECT DISTINCT ORG_ID, REF FROM refs WHERE ORG_ID IN (${inList})),
txn AS (
  SELECT o.ORG_ID, DATE_TRUNC('month', p.TRADING_DATE)::DATE AS MONTH,
         ${realParSql("p.PAYMENT_ACCOUNT_REFERENCE")} AS PAR
  FROM ${PAYMENTS} p JOIN org_store o ON o.REF = p.STORE
  WHERE p.AMOUNT > 0
),
volume AS (
  SELECT ORG_ID, MONTH, COUNT(*) AS TXNS, COUNT(DISTINCT PAR) AS DISTINCT_PAR,
         COUNT_IF(PAR IS NOT NULL) AS WITH_PAR
  FROM txn GROUP BY 1, 2
),
token AS (
  SELECT ORG_ID, MONTH, MAX(N) / NULLIF(SUM(N), 0) AS MAX_TOKEN_SHARE
  FROM (SELECT ORG_ID, MONTH, PAR, COUNT(*) AS N FROM txn WHERE PAR IS NOT NULL GROUP BY 1, 2, 3)
  GROUP BY 1, 2
)
SELECT v.ORG_ID, v.MONTH, v.TXNS, v.DISTINCT_PAR, v.WITH_PAR,
       COALESCE(t.MAX_TOKEN_SHARE, 1) AS MAX_TOKEN_SHARE
FROM volume v LEFT JOIN token t ON t.ORG_ID = v.ORG_ID AND t.MONTH = v.MONTH
ORDER BY 1, 2`;
}

/** Orders per org-month, so "the feed broke" is told apart from "not open yet". */
function monthlyOrdersQuery(orgIds: string[]) {
  const inList = orgIds.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
  return `SELECT ORGANIZATION_ID AS ORG_ID, DATE_TRUNC('month', CREATED_AT_TZ)::DATE AS MONTH,
  COUNT(*) AS ORDERS, COUNT(DISTINCT STORE_ID) AS STORES,
  COUNT_IF(NULLIF(CUSTOMER_ID, '') IS NOT NULL) AS SCANNED_ORDERS
FROM ${ORDERS}
WHERE ORGANIZATION_ID IN (${inList})
  AND ORDER_STATUS = 'COMPLETED' AND COALESCE(IS_TRAINING, FALSE) = FALSE AND TOTAL_PRICE > 0
GROUP BY 1, 2 ORDER BY 1, 2`;
}

/**
 * Cash share, on the POS side. The acquirer feed only sees card, so a merchant
 * whose trade is half cash looks card-complete and is not: every cash visit is a
 * guest the identity spine never sees. CI-023 sets the bar at the 12.8% estate
 * median.
 */
function cashShareQuery(orgIds: string[]) {
  const inList = orgIds.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
  return `SELECT ORGANIZATION_ID AS ORG_ID,
  SUM(AMOUNT) AS TAKEN,
  SUM(IFF(LOWER(PAYMENT_TYPE_NAME) LIKE '%cash%', AMOUNT, 0)) AS CASH
FROM ${ORDER_PAYMENTS}
WHERE ORGANIZATION_ID IN (${inList})
  AND COMPLETED_AT_TZ >= DATEADD(month, -13, CURRENT_DATE())
  AND AMOUNT > 0
GROUP BY 1`;
}

async function main() {
  console.log("CI-023 — ranking tenants by unbroken card-capture run\n");

  const cands = await query<Row>(candidatesQuery(3, 40, 50_000));
  console.log(`  ${cands.length} candidate merchants: 3-40 mapped venues, 50k+ card transactions, still trading`);
  const orgIds = cands.map((c) => String(c.ORG_ID));

  console.log("  grading every month…");
  const [parRows, orderRows, cashRows] = await Promise.all([
    query<Row>(parQualityQuery(orgIds)),
    query<Row>(monthlyOrdersQuery(orgIds)),
    query<Row>(cashShareQuery(orgIds)),
  ]);

  const ordersByOrgMonth = new Map<string, { orders: number; stores: number; scanned: number }>();
  for (const r of orderRows) {
    ordersByOrgMonth.set(`${r.ORG_ID}|${day(r.MONTH)}`, {
      orders: num(r.ORDERS), stores: num(r.STORES), scanned: num(r.SCANNED_ORDERS),
    });
  }
  const cashByOrg = new Map(
    cashRows.map((r) => [String(r.ORG_ID), num(r.TAKEN) ? r4(num(r.CASH) / num(r.TAKEN)) : 0]),
  );

  // The current month is partial and can never be the end of a claimed run.
  const now = new Date();
  const lastComplete = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString().slice(0, 10);

  const parByOrg = new Map<string, Row[]>();
  for (const r of parRows) {
    const k = String(r.ORG_ID);
    if (!parByOrg.has(k)) parByOrg.set(k, []);
    parByOrg.get(k)!.push(r);
  }

  const results = cands.map((c) => {
    const orgId = String(c.ORG_ID);
    const rows = parByOrg.get(orgId) ?? [];

    // The volume test compares a month against the months the merchant actually
    // traded, not against every month in the feed.
    const trading = rows.filter((r) => (ordersByOrgMonth.get(`${orgId}|${day(r.MONTH)}`)?.orders ?? 0) > 0);
    const volumes = trading.map((r) => num(r.TXNS)).sort((a, b) => a - b);
    const medianTxns = volumes[Math.floor(volumes.length / 2)] ?? 0;

    const months: MonthRow[] = rows.map((r) => {
      const month = day(r.MONTH);
      const o = ordersByOrgMonth.get(`${orgId}|${month}`);
      return gradeMonth({
        month,
        txns: num(r.TXNS),
        distinctPar: num(r.DISTINCT_PAR),
        withPar: num(r.WITH_PAR),
        maxTokenShare: Number(num(r.MAX_TOKEN_SHARE).toFixed(4)),
        orders: o?.orders ?? 0,
        scannedOrders: o?.scanned ?? 0,
        stores: o?.stores ?? 0,
        medianTxns,
      });
    });

    const complete = months.filter((m) => m.month <= lastComplete);
    const run = longestRun(complete);
    const inRun = complete.filter((m) => run && m.month >= run.start && m.month <= run.end);
    const scanned = inRun.reduce((a, m) => a + m.scannedOrders, 0);
    const ordersInRun = inRun.reduce((a, m) => a + m.orders, 0);
    const txnsInRun = inRun.reduce((a, m) => a + m.txns, 0);
    const parInRun = inRun.reduce((a, m) => a + m.withPar, 0);

    // The most recent run, which is not always the longest. A merchant may hold
    // 22 clean months that stop sixteen months ago and three that reach today,
    // and which of those is the better partner is a product question, not an
    // arithmetic one — so both are reported rather than one being chosen here.
    const okMonths = complete.filter((m) => m.ok).map((m) => m.month).sort();
    const latest = okMonths.length
      ? longestRun(complete.filter((m) => m.month >= trailingRunStart(okMonths)))
      : null;

    return {
      orgId,
      name: String(c.ORG_NAME),
      storesMapped: num(c.STORES_MAPPED),
      storesTotal: num(c.STORES_TOTAL),
      geocoded: num(c.GEOCODED),
      geocodeShare: num(c.STORES_TOTAL) ? r4(num(c.GEOCODED) / num(c.STORES_TOTAL)) : 0,
      terminals: num(c.TERMINALS),
      cardTxns: num(c.TXNS),
      orders: num(c.ORDERS),
      cashShare: cashByOrg.get(orgId) ?? null,
      run: run ?? { start: null, end: null, months: 0 },
      latestRun: latest ?? { start: null, end: null, months: 0 },
      claim: claimLevel(run?.months ?? 0),
      /** Enrolment is what makes the member/non-member comparison expressible. */
      scanRateInRun: ordersInRun ? r4(scanned / ordersInRun) : 0,
      /** Share of card transactions in the run carrying a real reference. */
      coverageInRun: txnsInRun ? r4(parInRun / txnsInRun) : 0,
      ordersInRun,
      months,
    };
  });

  // Longest run first, per CI-023. Ties break on card volume, because a longer
  // history of a merchant nobody visits does not make a better demo.
  results.sort((a, b) => b.run.months - a.run.months || b.cardTxns - a.cardTxns);

  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(
    join(ROOT, "data", "_partners.json"),
    JSON.stringify(
      {
        gradedAt: new Date().toISOString(),
        rule: {
          maxTokenShare: MAX_TOKEN_SHARE,
          minDistinctRatio: MIN_DISTINCT_RATIO,
          minCoverage: MIN_COVERAGE,
        },
        floorMonths: 13,
        targetMonths: 24,
        lastCompleteMonth: lastComplete,
        candidates: results,
      },
      null,
      1,
    ),
  );

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  const rpad = (s: string, n: number) => s.padStart(n);
  console.log(
    `\n  ${pad("merchant", 28)} ${rpad("run", 4)}  ${pad("longest window", 18)} ${rpad("cov", 5)} ` +
      `${rpad("recent", 7)} ${rpad("ven", 4)} ${rpad("cash", 6)} ${rpad("geo", 5)} ${rpad("scan", 5)}`,
  );
  console.log(`  ${"─".repeat(94)}`);
  for (const r of results) {
    const w = r.run.start ? `${r.run.start.slice(0, 7)} → ${r.run.end!.slice(0, 7)}` : "—";
    const flag = r.claim === "trend" ? "  ★ trend" : r.claim === "growth" ? "  ✓ growth" : "";
    console.log(
      `  ${pad(r.name, 28)} ${rpad(String(r.run.months), 4)}  ${pad(w, 18)} ` +
        `${rpad(`${(r.coverageInRun * 100).toFixed(0)}%`, 5)} ` +
        `${rpad(`${r.latestRun.months}m`, 7)} ${rpad(String(r.storesMapped), 4)} ` +
        `${rpad(r.cashShare == null ? "—" : `${(r.cashShare * 100).toFixed(1)}%`, 6)} ` +
        `${rpad(`${(r.geocodeShare * 100).toFixed(0)}%`, 5)} ` +
        `${rpad(`${(r.scanRateInRun * 100).toFixed(0)}%`, 5)}${flag}`,
    );
  }

  const clears = results.filter((r) => r.run.months >= 13);
  const trend = results.filter((r) => r.run.months >= 24);
  console.log(
    `\n  ${clears.length} of ${results.length} candidates clear the 13-month growth floor; ` +
      `${trend.length} reach the 24-month trend floor.`,
  );

  // "run" is the longest run anywhere in history; "recent" is the run that
  // reaches the present. A partner whose long run does not reach the present
  // cannot be demoed as current trade, and that has to be said out loud rather
  // than discovered in the room.
  const currentAndLong = clears.filter((r) => r.latestRun.months >= 13);
  if (!clears.length) {
    console.log(
      "\n  Nothing clears 13 months anywhere in history. POC 3 proceeds on Coffee Guru,\n" +
        "  makes no growth claim, and this becomes a platform-remediation ask.",
    );
  } else if (!currentAndLong.length) {
    console.log(
      `\n  ${clears.length} merchant(s) hold 13+ clean months, but none of those runs reaches\n` +
        "  the present. The choice is a historical window or a current one, and the surface\n" +
        "  must state which it is showing. This is a decision, not an arithmetic result.",
    );
  }
  console.log("\n  data/_partners.json written.");
  await disconnect();
}

/**
 * The start of the run of clean months that reaches the most recent clean month.
 * Walks back while the months stay contiguous.
 */
function trailingRunStart(okMonths: string[]): string {
  const prev = (m: string) => {
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  };
  let i = okMonths.length - 1;
  while (i > 0 && okMonths[i - 1] === prev(okMonths[i])) i--;
  return okMonths[i];
}

main().catch(async (e) => {
  console.error("\npartner-select failed:", e.message);
  await disconnect();
  process.exit(1);
});

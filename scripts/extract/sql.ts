/**
 * The warehouse models behind every figure in the POC.
 *
 * There is exactly one definition of an order, one of a bridged card payment and
 * one of a person. Every screen reads these, so a number cannot disagree with
 * itself between two surfaces — the failure the live Customer Report ships today.
 */
import { CANONICAL_LAPSE_DAYS, NON_GUEST_VISITS_PER_DAY } from "./orgs";

const ORDERS = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS";
const PAYMENTS = "OOLIO_PAY_ACQUIRERS.PUBLIC.OOLIO_TRANSACTIONS";

export type Window = { start: string; end: string };

/**
 * Clean order grain. Completed, non-training, positive value.
 * Refunds and voids are excluded rather than netted — the POC counts trade, not
 * ledger movement, and says so.
 */
export function ordersCte(orgId: string, w: Window) {
  return `ord AS (
  SELECT
    ORDER_ID, ORDER_NUMBER, STORE_ID, STORE_NAME, VENUE_NAME,
    CREATED_AT_TZ AS TS,
    CREATED_AT_TZ::DATE AS D,
    TOTAL_PRICE, ITEMS_COUNT, COALESCE(TOTAL_DISCOUNT, 0) AS TOTAL_DISCOUNT,
    NULLIF(TABLE_GUEST_COUNT, 0) AS COVERS,
    NULLIF(SALES_CHANNEL_NAME, '') AS CHANNEL,
    ORDER_TYPE_NAME,
    NULLIF(CUSTOMER_ID, '') AS MEMBER_ID
  FROM ${ORDERS}
  WHERE ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
    AND ORDER_STATUS = 'COMPLETED'
    AND COALESCE(IS_TRAINING, FALSE) = FALSE
    AND TOTAL_PRICE > 0
)`;
}

/**
 * Discovering the payments→POS store map, which is the gate the PRD leaves open
 * (§6.4 item 7: 38 of 3,190 resolved). We do not resolve it from a dimension
 * table — we derive it from the evidence, by joining on the natural key and
 * keeping the pairs that fire often enough not to be an order-number collision.
 *
 * ORDER_NUMBER alone is unusable (6.03M of 6.79M distinct values are reused), so
 * the key is (STORE, ORDER_NUMBER, TRADING_DATE) throughout.
 */
export function storeMapQuery(orgId: string, w: Window) {
  return `WITH ${ordersCte(orgId, w)},
pay AS (
  SELECT ORDER_NUMBER, STORE, TRADING_DATE
  FROM ${PAYMENTS}
  WHERE TRADING_DATE BETWEEN '${w.start}' AND '${w.end}'
    AND STORE <> ''
)
SELECT o.STORE_ID, o.STORE_NAME, p.STORE AS PAY_STORE, COUNT(*) AS MATCHES
FROM ord o
JOIN pay p ON p.ORDER_NUMBER = o.ORDER_NUMBER AND p.TRADING_DATE = o.D
GROUP BY 1, 2, 3
HAVING COUNT(*) >= 25
ORDER BY MATCHES DESC`;
}

/**
 * Order grain with identity attached — the single object every screen sits on.
 *
 * The identity ladder, in priority order:
 *   member        the order carries a CUSTOMER_ID (they enrolled and were scanned)
 *   card          the order bridges to a payment carrying a PAR
 *   unattributed  neither. Never a person, never counted as one.
 *
 * Card identity does not override member identity. A member who forgot to scan
 * appears in the card tier; how often that happens is measured separately as
 * PAR→member linkage rather than silently corrected.
 */
export type StorePair = { storeId: string; payStore: string };

/**
 * Monthly quality of the Payment Account Reference, per merchant.
 *
 * PAR is not simply present or absent. For long stretches it is a single constant
 * value repeated across every transaction at a venue — non-null, so the usual
 * COUNT(PAR) coverage test scores it as fully covered, and a naive model turns
 * eight thousand transactions a month into one customer. This measures the ratio
 * of distinct references to transactions, which is the only test that catches it.
 */
export function parQualityQuery(w: Window, payStores: string[]) {
  const inList = [...new Set(payStores)].map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
  return `SELECT
  DATE_TRUNC('month', TRADING_DATE)::DATE AS MONTH,
  COUNT(*) AS TXNS,
  COUNT(DISTINCT NULLIF(TRIM(PAYMENT_ACCOUNT_REFERENCE), '')) AS DISTINCT_PAR,
  COUNT_IF(NULLIF(TRIM(PAYMENT_ACCOUNT_REFERENCE), '') IS NOT NULL) AS WITH_PAR
FROM ${PAYMENTS}
WHERE TRADING_DATE BETWEEN '${w.start}' AND '${w.end}'
  AND STORE IN (${inList})
  AND AMOUNT > 0
GROUP BY 1 ORDER BY 1`;
}

/**
 * @param cardMonths  the months in which PAR is trustworthy for this merchant, as
 *   month-start dates. Card capture is not a switch that flips once — at Coffee
 *   Guru it ran correctly, stopped dead for ten months, and resumed. Outside these
 *   months a card payment is real trade we can see but cannot attribute to a
 *   person, so it counts as unattributed rather than being quietly folded in or,
 *   worse, collapsed into one enormous fictional customer.
 */
export function basePrelude(orgId: string, w: Window, pairs: StorePair[], cardMonths: string[]) {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const inList = [...new Set(pairs.map((p) => p.payStore))].map(q).join(",");
  const mapValues = pairs.map((p) => `(${q(p.storeId)}, ${q(p.payStore)})`).join(",");
  const monthList = cardMonths.length ? cardMonths.map((m) => `${q(m)}::DATE`).join(",") : "NULL";
  return `${ordersCte(orgId, w)},
pay AS (
  SELECT ORDER_NUMBER, STORE, TRADING_DATE, NULLIF(TRIM(PAYMENT_ACCOUNT_REFERENCE), '') AS PAR
  FROM ${PAYMENTS}
  WHERE TRADING_DATE BETWEEN '${w.start}' AND '${w.end}'
    AND DATE_TRUNC('month', TRADING_DATE) IN (${monthList})
    AND STORE IN (${inList})
    AND NULLIF(TRIM(PAYMENT_ACCOUNT_REFERENCE), '') IS NOT NULL
    AND AMOUNT > 0
),
map AS (
  SELECT * FROM VALUES ${mapValues} AS t(STORE_ID, PAY_STORE)
),
/* One payment row per order. Split bills produce several; we take the first PAR
   by transaction reference so an order maps to exactly one payer. Orders paid on
   two cards are the Payer-grain caveat named on screen. */
bridged AS (
  SELECT o.ORDER_ID, MIN(p.PAR) AS PAR, COUNT(DISTINCT p.PAR) AS PAR_COUNT
  FROM ord o
  JOIN map m ON m.STORE_ID = o.STORE_ID
  JOIN pay p ON p.STORE = m.PAY_STORE
            AND p.ORDER_NUMBER = o.ORDER_NUMBER
            AND p.TRADING_DATE = o.D
  GROUP BY 1
),
/* The non-guest exclusion. Buying coffee twice in a day is a person; doing it
   three or more times at the same venue on five or more separate days is a staff
   card, a house account or a terminal test. Applied in the model, never
   downstream, so no screen can accidentally count one as a customer. */
heavy_days AS (
  SELECT b.PAR, o.D, o.STORE_ID
  FROM bridged b JOIN ord o ON o.ORDER_ID = b.ORDER_ID
  GROUP BY 1, 2, 3
  HAVING COUNT(*) > ${NON_GUEST_VISITS_PER_DAY + 1}
),
non_guest AS (
  SELECT PAR FROM heavy_days GROUP BY PAR HAVING COUNT(*) >= 5
),
guest_payments AS (
  SELECT b.ORDER_ID, b.PAR
  FROM bridged b
  LEFT JOIN non_guest n ON n.PAR = b.PAR
  WHERE n.PAR IS NULL
),
base AS (
  SELECT
    o.*,
    g.PAR,
    CASE
      WHEN o.MEMBER_ID IS NOT NULL THEN 'member'
      WHEN g.PAR IS NOT NULL THEN 'card'
      ELSE 'unattributed'
    END AS TIER
  FROM ord o
  LEFT JOIN guest_payments g ON g.ORDER_ID = o.ORDER_ID
),
/* Person grain. A visit is a person-day at a venue, not an order — two coffees
   bought an hour apart is one visit, and counting it as two is how the live
   report overstates frequency. */
person_orders AS (
  SELECT
    COALESCE(MEMBER_ID, 'card:' || PAR) AS PERSON_ID,
    TIER, STORE_ID, STORE_NAME, D, TS, TOTAL_PRICE, ITEMS_COUNT, COVERS, CHANNEL, ORDER_ID
  FROM base
  WHERE TIER <> 'unattributed'
),
visits AS (
  SELECT PERSON_ID, ANY_VALUE(TIER) AS TIER, D, STORE_ID, ANY_VALUE(STORE_NAME) AS STORE_NAME,
         SUM(TOTAL_PRICE) AS SPEND, SUM(ITEMS_COUNT) AS ITEMS,
         SUM(COVERS) AS COVERS, COUNT(*) AS ORDERS
  FROM person_orders
  GROUP BY PERSON_ID, D, STORE_ID
),
person AS (
  SELECT
    PERSON_ID,
    ANY_VALUE(TIER) AS TIER,
    COUNT(*) AS VISITS,
    COUNT(DISTINCT STORE_ID) AS VENUES,
    SUM(SPEND) AS SPEND,
    SUM(ITEMS) AS ITEMS,
    SUM(ORDERS) AS ORDERS,
    MIN(D) AS FIRST_SEEN,
    MAX(D) AS LAST_SEEN,
    DATEDIFF(day, MIN(D), MAX(D)) AS TENURE_DAYS,
    MAX_BY(STORE_ID, D) AS HOME_STORE_ID,
    MAX_BY(STORE_NAME, D) AS HOME_STORE
  FROM visits
  GROUP BY PERSON_ID
)`;
}

/**
 * The card tier is only a person once it has been seen twice. A single-visit card
 * is a transaction we can see, not a customer we can count — the POC pack's
 * non-negotiable, and the reason the tier can carry a count without claiming a
 * relationship.
 */
export const CARD_PERSON_FILTER = `(TIER = 'member' OR VISITS >= 2)`;

export { CANONICAL_LAPSE_DAYS };

/**
 * The warehouse models behind every figure in the POC.
 *
 * There is exactly one definition of an order, one of a bridged card payment and
 * one of a person. Every screen reads these, so a number cannot disagree with
 * itself between two surfaces.
 *
 * ── What changed in v2 ─────────────────────────────────────────────────────
 *
 * v1 ranked identity: member beats card beats unattributed. That made the same
 * human two different objects — a member who scanned, and a card that did not —
 * and it is the reason the member-versus-card comparison could not be published
 * (1,030 enrolled humans in one column, 7,824 payment instruments in the other).
 *
 * v2 inverts it. **The card is the spine and membership is an attribute of the
 * person, not a rival tier.** Measured over the honest window, 92% of member
 * orders at Meat Flour Wine and 85% at Coffee Guru also carry a payment
 * reference, so the card is the more complete identifier of the two. Resolving a
 * person through their card and then attaching the member flag means:
 *
 *   - a member who forgets to scan stays the same person, and their unscanned
 *     spend counts toward their value instead of being lost to the card tier;
 *   - member and non-member are the same grain, so the comparison the operator
 *     actually wants becomes expressible and defensible;
 *   - scan rate becomes a measurable member property rather than an invisible one.
 *
 * This is the answer to open decision #1 in the handover: two axes, and the card
 * is the spine.
 */
import { CANONICAL_LAPSE_DAYS, NON_GUEST_VISITS_PER_DAY, daypartCase } from "./orgs";
import { realParSql } from "../grade";

const ORDERS = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS";
const PAYMENTS = "OOLIO_PAY_ACQUIRERS.PUBLIC.OOLIO_TRANSACTIONS";

export type Window = { start: string; end: string };

/**
 * Clean order grain. Completed, non-training, positive value.
 *
 * The status filter is load-bearing and is stated rather than assumed. Meat Flour
 * Wine carries 45,485 rows in `CREATED` across the discovery window holding
 * $2,799 of value in total — tickets opened on a terminal and never finalised.
 * A parity check written as `ORDER_STATUS NOT IN ('VOID','CANCELLED')` counts
 * them and reports 91,649 orders where the business took 41,578. Both numbers are
 * arithmetically correct; only one of them is trade. See `source.orderCountParity`.
 */
export function ordersCte(orgId: string, w: Window) {
  return `ord_raw AS (
  SELECT
    ORDER_ID, ORDER_NUMBER, STORE_ID, STORE_NAME,
    CREATED_AT_TZ AS TS,
    CREATED_AT_TZ::DATE AS D,
    TOTAL_PRICE, ITEMS_COUNT, COALESCE(TOTAL_DISCOUNT, 0) AS TOTAL_DISCOUNT,
    NULLIF(TABLE_GUEST_COUNT, 0) AS COVERS,
    /*
      Whether this order was served at a table.
    
      The covers framework rests on this one column. Across three organisations
      and twenty-five venues the rule holds without exception: every Takeaway,
      Pickup and Delivery order carries no table and no party size, and every
      Dine In order carries a table. **A party size is therefore expected where
      a table is attached and nowhere else** — a takeaway coffee has no covers
      to record and never did.
    
      This replaces asking whether the *organisation* is table service, which is
      a property of a merchant and not of an order. Coffee Guru is configured
      "counter" and its Jamison venue rings 6,224 dine-in orders against 55
      takeaway, all recording covers. The label was denying it a measurement its
      data supports.
    
      Read off the table reference rather than off ORDER_TYPE_NAME, because the
      type is a merchant-configurable string — three organisations already spell
      their four types identically, and the fourth will not. Backticks are also
      unavailable in here: this comment lives inside a template literal.
    */
    NULLIF(TRIM(TABLE_NAME), '') AS TABLE_REF,
    NULLIF(SALES_CHANNEL_NAME, '') AS CHANNEL,
    ORDER_TYPE_NAME,
    NULLIF(CUSTOMER_ID, '') AS MEMBER_ID,
    ${daypartCase("CREATED_AT_TZ")} AS DAYPART,
    IFF(DAYOFWEEK(CREATED_AT_TZ) IN (0, 6), TRUE, FALSE) AS IS_WEEKEND
  FROM ${ORDERS}
  WHERE ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
    AND ORDER_STATUS = 'COMPLETED'
    AND COALESCE(IS_TRAINING, FALSE) = FALSE
    AND TOTAL_PRICE > 0
),
/* Venue identity is the store id. The *name* is a slowly-changing attribute and
   must never be used as a key: Meat Flour Wine's Braeside venue traded under
   'Meat Flour Wine Store', then 'Meat Flour Wine', then 'Meat Flour Wine -
   Braeside'. Grouping by name invents a third venue with 6,799 orders that never
   existed, and dates Braeside's opening to the day it was renamed. Three Coffee
   Guru stores have the same problem. We resolve one current name per store and
   apply it to all history, which is also what leaves 74 guests in v1 with a home
   venue the venue list has never heard of. */
venue AS (
  SELECT STORE_ID, MAX_BY(STORE_NAME, TS) AS STORE_NAME, COUNT(DISTINCT STORE_NAME) AS NAMES_SEEN
  FROM ord_raw GROUP BY STORE_ID
),
ord AS (
  SELECT o.* EXCLUDE STORE_NAME, v.STORE_NAME
  FROM ord_raw o JOIN venue v ON v.STORE_ID = o.STORE_ID
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

export type StorePair = { storeId: string; payStore: string };

/**
 * Monthly quality of the Payment Account Reference, per merchant.
 *
 * PAR is not simply present or absent. For long stretches it is a single constant
 * value repeated across every transaction at a venue — non-null, so the usual
 * COUNT(PAR) coverage test scores it as fully covered, and a naive model turns
 * eight thousand transactions a month into one customer. This measures the ratio
 * of distinct references to transactions, which is the only test that catches it.
 *
 * The reference is normalised through `realParSql` first, which nulls the
 * literal string `'N/A'`. That placeholder sits on 215,900,912 rows since June
 * 2023 and is the single largest reason the estate looks card-covered and is
 * not. Before it was nulled here, roughly 5% of Coffee Guru's admitted trade
 * resolved to one phantom person; it survived only because the non-guest
 * exclusion happened to catch it, which is luck rather than a control.
 */
export function parQualityQuery(w: Window, payStores: string[]) {
  const inList = [...new Set(payStores)].map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
  return `WITH txn AS (
  SELECT DATE_TRUNC('month', TRADING_DATE)::DATE AS MONTH,
    ${realParSql("PAYMENT_ACCOUNT_REFERENCE")} AS PAR
  FROM ${PAYMENTS}
  WHERE TRADING_DATE BETWEEN '${w.start}' AND '${w.end}'
    AND STORE IN (${inList})
    AND AMOUNT > 0
),
volume AS (
  SELECT MONTH, COUNT(*) AS TXNS, COUNT(DISTINCT PAR) AS DISTINCT_PAR,
         COUNT_IF(PAR IS NOT NULL) AS WITH_PAR
  FROM txn GROUP BY 1
),
/* The share of a month's carded transactions sitting on its single most frequent
   reference. This is the test that catches the failure a non-null count cannot:
   a real card population never has one token above a fraction of a percent, and
   the ten broken months sit at 100%. */
token AS (
  SELECT MONTH, MAX(N) / NULLIF(SUM(N), 0) AS MAX_TOKEN_SHARE
  FROM (SELECT MONTH, PAR, COUNT(*) AS N FROM txn WHERE PAR IS NOT NULL GROUP BY 1, 2)
  GROUP BY 1
)
SELECT v.MONTH, v.TXNS, v.DISTINCT_PAR, v.WITH_PAR, COALESCE(t.MAX_TOKEN_SHARE, 1) AS MAX_TOKEN_SHARE
FROM volume v LEFT JOIN token t ON t.MONTH = v.MONTH
ORDER BY v.MONTH`;
}

/**
 * Orders per month, so card-capture grading can tell "the payment feed is
 * broken" apart from "the venue was not open yet". v1 marked eight months usable
 * that pre-dated both Meat Flour Wine venues trading, which is how "card months
 * available 12 of 25" came to describe four.
 */
export function monthlyOrdersQuery(orgId: string, w: Window) {
  return `SELECT DATE_TRUNC('month', CREATED_AT_TZ)::DATE AS MONTH, COUNT(*) AS ORDERS
FROM ${ORDERS}
WHERE ORGANIZATION_ID = '${orgId}'
  AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
  AND ORDER_STATUS = 'COMPLETED' AND COALESCE(IS_TRAINING, FALSE) = FALSE AND TOTAL_PRICE > 0
GROUP BY 1 ORDER BY 1`;
}

/**
 * Order counts by status, so the parity check can state what it excludes and why
 * rather than asserting a number and hoping.
 */
export function orderStatusQuery(orgId: string, w: Window) {
  return `SELECT ORDER_STATUS, COALESCE(IS_TRAINING, FALSE) AS TRAINING,
  COUNT(*) AS ORDERS, SUM(TOTAL_PRICE) AS REVENUE, COUNT_IF(TOTAL_PRICE <= 0) AS ZERO_VALUE
FROM ${ORDERS}
WHERE ORGANIZATION_ID = '${orgId}'
  AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
GROUP BY 1, 2 ORDER BY ORDERS DESC`;
}

/**
 * The identity spine.
 *
 * @param cardMonths the months in which PAR is trustworthy for this merchant.
 *   Card capture is not a switch that flips once — at Coffee Guru it ran
 *   correctly, stopped dead for ten months, and resumed. Outside these months a
 *   card payment is real trade we can see but cannot attribute to a person.
 */
export function basePrelude(orgId: string, w: Window, pairs: StorePair[], cardMonths: string[]) {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const inList = [...new Set(pairs.map((p) => p.payStore))].map(q).join(",");
  const mapValues = pairs.map((p) => `(${q(p.storeId)}, ${q(p.payStore)})`).join(",");
  const monthList = cardMonths.length ? cardMonths.map((m) => `${q(m)}::DATE`).join(",") : "NULL";
  return `${ordersCte(orgId, w)},
pay AS (
  SELECT ORDER_NUMBER, STORE, TRADING_DATE, ${realParSql("PAYMENT_ACCOUNT_REFERENCE")} AS PAR
  FROM ${PAYMENTS}
  WHERE TRADING_DATE BETWEEN '${w.start}' AND '${w.end}'
    AND DATE_TRUNC('month', TRADING_DATE) IN (${monthList})
    AND STORE IN (${inList})
    AND ${realParSql("PAYMENT_ACCOUNT_REFERENCE")} IS NOT NULL
    AND AMOUNT > 0
),
map AS (
  SELECT * FROM VALUES ${mapValues} AS t(STORE_ID, PAY_STORE)
),
/* One payment row per order. Split bills produce several; we take the first PAR
   by reference so an order maps to exactly one payer. Orders paid on two cards
   are the Payer-grain caveat named on screen. */
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
carded AS (
  SELECT o.*, g.PAR
  FROM ord o LEFT JOIN guest_payments g ON g.ORDER_ID = o.ORDER_ID
),
/* Card → member resolution. A card that has ever been seen on a scanned order
   belongs to that member on every other order it appears on. This is what makes
   a member's unscanned spend count toward the member rather than falling into an
   anonymous card, and it is the single change that makes member value
   measurable. Where one card has served several members the dominant one wins;
   the count of contested cards is published, not hidden. */
link AS (
  SELECT PAR, MEMBER_ID, COUNT(*) AS N
  FROM carded WHERE PAR IS NOT NULL AND MEMBER_ID IS NOT NULL
  GROUP BY 1, 2
),
/* ── Ties are broken on the member id, and that is load-bearing ─────────────
   This was MAX_BY(MEMBER_ID, N), which is non-deterministic when a card has
   served two members the same number of times. 292 of Coffee Guru's cards sit on
   more than one member, so on every run a handful of them resolved to a
   different person — and PERSON_ID is the spine, so a flip moved that human's
   visits, spend and lifecycle verdict wholesale.

   It surfaced as the segment table and the segment scatter disagreeing by a few
   people out of 4,966 while running identical SQL: two queries, two independent
   evaluations, two different coin flips. That is the trap register's "a count on
   a chart disagrees with the count in the table beneath it", arriving by a route
   nobody was looking down, and it also meant no two extracts of the same window
   were reproducible.

   ORDER BY N DESC, MEMBER_ID makes the dominant member win as before and makes
   the tie resolve the same way every time, everywhere. */
par_member AS (
  SELECT PAR, MEMBER_ID, MEMBERS_ON_CARD
  FROM (
    SELECT PAR, MEMBER_ID,
           COUNT(*) OVER (PARTITION BY PAR) AS MEMBERS_ON_CARD,
           ROW_NUMBER() OVER (PARTITION BY PAR ORDER BY N DESC, MEMBER_ID) AS RN
    FROM link
  )
  WHERE RN = 1
),
base AS (
  SELECT
    c.*,
    COALESCE(c.MEMBER_ID, pm.MEMBER_ID) AS PERSON_MEMBER_ID,
    IFF(c.MEMBER_ID IS NOT NULL, TRUE, FALSE) AS SCANNED,
    CASE
      WHEN COALESCE(c.MEMBER_ID, pm.MEMBER_ID) IS NOT NULL THEN 'member'
      WHEN c.PAR IS NOT NULL THEN 'card'
      ELSE 'unattributed'
    END AS TIER
  FROM carded c LEFT JOIN par_member pm ON pm.PAR = c.PAR
),
/* Person grain. A visit is a person-day at a venue, not an order — two coffees
   bought an hour apart is one visit, and counting it as two is how the live
   report overstates frequency.
   The person id resolves through the member where one is known and through the
   card otherwise, so the two populations are the same kind of object. */
person_orders AS (
  SELECT
    COALESCE(PERSON_MEMBER_ID, 'card:' || PAR) AS PERSON_ID,
    TIER, SCANNED, STORE_ID, STORE_NAME, D, TS, DAYPART, IS_WEEKEND,
    TOTAL_PRICE, ITEMS_COUNT, COVERS, CHANNEL, ORDER_ID
  FROM base
  WHERE TIER <> 'unattributed'
),
/* Every argmax below breaks ties on a stable key. See the note on par_member:
   an unbroken tie makes the snapshot unreproducible, and these ones drive the
   daypart and venue filters that the route tests assert a population against. A
   flaky filter is a flaky test, and a flaky test gets deleted. */
visits AS (
  SELECT PERSON_ID, ANY_VALUE(TIER) AS TIER, D, STORE_ID,
         ANY_VALUE(STORE_NAME) AS STORE_NAME,
         MAX_BY(DAYPART, TOTAL_PRICE * 1000 + HASH(DAYPART) % 1000) AS DAYPART,
         BOOLOR_AGG(IS_WEEKEND) AS IS_WEEKEND,
         SUM(TOTAL_PRICE) AS SPEND, SUM(ITEMS_COUNT) AS ITEMS,
         SUM(COVERS) AS COVERS, COUNT(*) AS ORDERS,
         COUNT_IF(SCANNED) AS SCANNED_ORDERS
  FROM person_orders
  GROUP BY PERSON_ID, D, STORE_ID
),
/* Home venue and home daypart, resolved deterministically.
   MAX_BY(STORE_ID, D) picked whichever venue a guest used on their last day,
   with the tie between two venues on the same day broken arbitrarily; MODE
   did the same for the daypart. Both feed filters, so both are settled here on
   an explicit ordering rather than on evaluation order. */
home AS (
  SELECT PERSON_ID, STORE_ID AS HOME_STORE_ID, STORE_NAME AS HOME_STORE
  FROM (
    SELECT PERSON_ID, STORE_ID, ANY_VALUE(STORE_NAME) AS STORE_NAME,
           ROW_NUMBER() OVER (
             PARTITION BY PERSON_ID ORDER BY COUNT(*) DESC, MAX(D) DESC, STORE_ID
           ) AS RN
    FROM visits GROUP BY PERSON_ID, STORE_ID
  )
  WHERE RN = 1
),
home_daypart AS (
  SELECT PERSON_ID, DAYPART AS HOME_DAYPART
  FROM (
    SELECT PERSON_ID, DAYPART,
           ROW_NUMBER() OVER (PARTITION BY PERSON_ID ORDER BY COUNT(*) DESC, DAYPART) AS RN
    FROM visits GROUP BY PERSON_ID, DAYPART
  )
  WHERE RN = 1
),
person_agg AS (
  SELECT
    PERSON_ID,
    ANY_VALUE(TIER) AS TIER,
    COUNT(*) AS VISITS,
    COUNT(DISTINCT STORE_ID) AS VENUES,
    SUM(SPEND) AS SPEND,
    SUM(ITEMS) AS ITEMS,
    SUM(ORDERS) AS ORDERS,
    SUM(SCANNED_ORDERS) AS SCANNED_ORDERS,
    /* Visits on which the guest scanned at least once. This is the quantity the
       detection correction needs: membership is only observable when somebody
       scans, so the per-visit scan probability sets how many members with one
       visit we never see at all. */
    COUNT_IF(SCANNED_ORDERS > 0) AS SCANNED_VISITS,
    SUM(COVERS) AS COVERS,
    MIN(D) AS FIRST_SEEN,
    MAX(D) AS LAST_SEEN,
    DATEDIFF(day, MIN(D), MAX(D)) AS TENURE_DAYS
  FROM visits
  GROUP BY PERSON_ID
),
person AS (
  SELECT pa.*, h.HOME_STORE_ID, h.HOME_STORE, hd.HOME_DAYPART
  FROM person_agg pa
  JOIN home h ON h.PERSON_ID = pa.PERSON_ID
  JOIN home_daypart hd ON hd.PERSON_ID = pa.PERSON_ID
)`;
}

/**
 * The card tier is only a person once it has been seen twice. A single-visit card
 * is a transaction we can see, not a customer we can count — the POC pack's
 * non-negotiable, and the reason the tier can carry a count without claiming a
 * relationship. Members are people from the moment they enrol.
 */
export const CARD_PERSON_FILTER = `(TIER = 'member' OR VISITS >= 2)`;

export { CANONICAL_LAPSE_DAYS };

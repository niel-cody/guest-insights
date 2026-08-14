/**
 * The output queries. Each one returns a compact result that becomes one file in
 * the snapshot. Everything expensive happens in the warehouse; nothing is
 * recomputed in the browser, which is the whole point of the exercise.
 */
import { basePrelude, CARD_PERSON_FILTER, type StorePair, type Window } from "./sql";

type Args = {
  orgId: string;
  w: Window;
  pairs: StorePair[];
  lapseDays: number;
  /** Months in which the card tier is trustworthy for this merchant. */
  cardMonths: string[];
};

/** Person-day grain plus the eligibility filter, shared by most of the below. */
const PEOPLE = `pv AS (
  SELECT PERSON_ID, ANY_VALUE(TIER) AS TIER, D FROM visits GROUP BY PERSON_ID, D
),
eligible AS (
  SELECT PERSON_ID FROM person WHERE ${CARD_PERSON_FILTER}
)`;

/**
 * Coverage. Revenue grain is the primary measure and transaction grain is
 * secondary — both name their denominator. Guest-grain coverage is not computed
 * anywhere, because it cannot be honest.
 */
export function coverageQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  STORE_ID, ANY_VALUE(STORE_NAME) AS STORE_NAME,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE) AS REVENUE,
  COUNT_IF(TIER = 'member') AS MEMBER_ORDERS,
  SUM(IFF(TIER = 'member', TOTAL_PRICE, 0)) AS MEMBER_REVENUE,
  COUNT_IF(TIER = 'card') AS CARD_ORDERS,
  SUM(IFF(TIER = 'card', TOTAL_PRICE, 0)) AS CARD_REVENUE,
  COUNT_IF(TIER = 'unattributed') AS UNATTRIBUTED_ORDERS,
  SUM(IFF(TIER = 'unattributed', TOTAL_PRICE, 0)) AS UNATTRIBUTED_REVENUE,
  COUNT_IF(COVERS IS NOT NULL) AS ORDERS_WITH_COVERS,
  SUM(COVERS) AS COVERS
FROM base
GROUP BY STORE_ID
ORDER BY REVENUE DESC`;
}

/** Coverage over time, so the chip can show whether recognition is holding up. */
export function coverageTrendQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  DATE_TRUNC('month', D)::DATE AS MONTH,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE) AS REVENUE,
  SUM(IFF(TIER = 'member', TOTAL_PRICE, 0)) AS MEMBER_REVENUE,
  SUM(IFF(TIER = 'card', TOTAL_PRICE, 0)) AS CARD_REVENUE,
  COUNT_IF(TIER = 'member') AS MEMBER_ORDERS,
  COUNT_IF(TIER = 'card') AS CARD_ORDERS
FROM base GROUP BY 1 ORDER BY 1`;
}

/**
 * The 24-month lifecycle trend — MQ7, and the chart nobody else in the market
 * ships. New / returning / reactivated per month, plus lapse events.
 *
 * Lapse is a dated event, not a status: a person lapses on the day their gap
 * since last visit crosses the threshold. That makes "lost 96 this month" a
 * statement with a date attached rather than a snapshot artefact.
 */
export function lifecycleQuery({ orgId, w, pairs, lapseDays, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
seq AS (
  SELECT pv.PERSON_ID, pv.TIER, pv.D,
    LAG(pv.D)  OVER (PARTITION BY pv.PERSON_ID ORDER BY pv.D) AS PREV_D,
    LEAD(pv.D) OVER (PARTITION BY pv.PERSON_ID ORDER BY pv.D) AS NEXT_D
  FROM pv JOIN eligible e ON e.PERSON_ID = pv.PERSON_ID
),
states AS (
  SELECT PERSON_ID, TIER, DATE_TRUNC('month', D)::DATE AS MONTH,
    CASE
      WHEN PREV_D IS NULL THEN 'new'
      WHEN DATEDIFF(day, PREV_D, D) <= ${lapseDays} THEN 'returning'
      ELSE 'reactivated'
    END AS STATE,
    ROW_NUMBER() OVER (PARTITION BY PERSON_ID, DATE_TRUNC('month', D) ORDER BY D) AS RN
  FROM seq
),
lapses AS (
  SELECT TIER, DATE_TRUNC('month', DATEADD(day, ${lapseDays}, D))::DATE AS MONTH, COUNT(*) AS LAPSED
  FROM seq
  WHERE (NEXT_D IS NULL OR DATEDIFF(day, D, NEXT_D) > ${lapseDays})
    AND DATEADD(day, ${lapseDays}, D) <= '${w.end}'
  GROUP BY 1, 2
),
active AS (
  SELECT TIER, MONTH,
    COUNT_IF(STATE = 'new') AS NEW,
    COUNT_IF(STATE = 'returning') AS RETURNING,
    COUNT_IF(STATE = 'reactivated') AS REACTIVATED,
    COUNT(*) AS ACTIVE
  FROM states WHERE RN = 1 GROUP BY 1, 2
),
money AS (
  SELECT ANY_VALUE(p.TIER) AS TIER, DATE_TRUNC('month', v.D)::DATE AS MONTH,
         SUM(v.SPEND) AS REVENUE, SUM(v.ORDERS) AS ORDERS, COUNT(*) AS VISITS
  FROM visits v JOIN eligible e ON e.PERSON_ID = v.PERSON_ID
  JOIN person p ON p.PERSON_ID = v.PERSON_ID
  GROUP BY v.PERSON_ID, DATE_TRUNC('month', v.D)
)
SELECT a.MONTH, a.TIER, a.NEW, a.RETURNING, a.REACTIVATED, a.ACTIVE,
       COALESCE(l.LAPSED, 0) AS LAPSED,
       COALESCE(m.REVENUE, 0) AS REVENUE, COALESCE(m.VISITS, 0) AS VISITS
FROM active a
LEFT JOIN lapses l ON l.MONTH = a.MONTH AND l.TIER = a.TIER
LEFT JOIN (
  SELECT TIER, MONTH, SUM(REVENUE) AS REVENUE, SUM(VISITS) AS VISITS FROM money GROUP BY 1, 2
) m ON m.MONTH = a.MONTH AND m.TIER = a.TIER
ORDER BY a.MONTH, a.TIER`;
}

/**
 * Threshold calibration — the Emarsys pattern, and the answer to D3. Each venue's
 * own inter-visit distribution recommends its slipping and lapsed cuts, so a
 * daily-trade cafe and a monthly-trade restaurant are not judged on one number.
 */
export function calibrationQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
gaps AS (
  SELECT pv.PERSON_ID, DATEDIFF(day, LAG(pv.D) OVER (PARTITION BY pv.PERSON_ID ORDER BY pv.D), pv.D) AS GAP
  FROM pv JOIN eligible e ON e.PERSON_ID = pv.PERSON_ID
)
SELECT
  COUNT(*) AS N,
  MEDIAN(GAP) AS P50,
  APPROX_PERCENTILE(GAP, 0.75) AS P75,
  APPROX_PERCENTILE(GAP, 0.90) AS P90,
  APPROX_PERCENTILE(GAP, 0.95) AS P95,
  AVG(GAP) AS MEAN
FROM gaps WHERE GAP IS NOT NULL AND GAP > 0`;
}

/** The gap histogram behind the calibration, so the chart can justify the cut. */
export function gapHistogramQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
gaps AS (
  SELECT DATEDIFF(day, LAG(pv.D) OVER (PARTITION BY pv.PERSON_ID ORDER BY pv.D), pv.D) AS GAP
  FROM pv JOIN eligible e ON e.PERSON_ID = pv.PERSON_ID
)
SELECT LEAST(GAP, 120) AS DAYS, COUNT(*) AS N
FROM gaps WHERE GAP IS NOT NULL AND GAP > 0 GROUP BY 1 ORDER BY 1`;
}

/**
 * Segment and value-band composition at Person grain. Bands are calibrated
 * quintiles of the org's own spend distribution, not fixed dollar cuts.
 */
export function segmentsQuery({ orgId, w, pairs, lapseDays, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
p AS (
  SELECT person.*, DATEDIFF(day, LAST_SEEN, '${w.end}') AS DAYS_SINCE,
         NTILE(5) OVER (ORDER BY SPEND) AS VALUE_BAND,
         CASE WHEN VISITS > 1 THEN TENURE_DAYS / (VISITS - 1) END AS CADENCE_DAYS
  FROM person JOIN eligible e ON e.PERSON_ID = person.PERSON_ID
),
c AS (
  SELECT *,
    CASE
      WHEN VISITS = 1 THEN 'one-visit'
      WHEN DAYS_SINCE > ${lapseDays} THEN 'lapsed'
      WHEN CADENCE_DAYS IS NOT NULL AND DAYS_SINCE > CADENCE_DAYS * 2 THEN 'slipping'
      WHEN VISITS >= 10 THEN 'regular'
      ELSE 'established'
    END AS SEGMENT
  FROM p
)
SELECT TIER, SEGMENT, VALUE_BAND,
  COUNT(*) AS GUESTS, SUM(VISITS) AS VISITS, SUM(SPEND) AS SPEND,
  MIN(SPEND) AS MIN_SPEND, MAX(SPEND) AS MAX_SPEND,
  AVG(VISITS) AS AVG_VISITS, AVG(SPEND) AS AVG_SPEND,
  COUNT_IF(VENUES > 1) AS MULTI_VENUE
FROM c GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
}

/**
 * The bounded guest list. The tiles always show true population figures; this is
 * the grid's working set, and the UI says so rather than implying it is everyone.
 *
 * Stratified deterministically: the top of the value distribution in full, plus a
 * hash-ordered sample of the tail, so the grid looks like the real population
 * instead of a leaderboard.
 */
export function guestListQuery({ orgId, w, pairs, lapseDays, cardMonths }: Args, limit = 20000) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
p AS (
  SELECT person.*, DATEDIFF(day, LAST_SEEN, '${w.end}') AS DAYS_SINCE,
         NTILE(5) OVER (ORDER BY SPEND) AS VALUE_BAND,
         CASE WHEN VISITS > 1 THEN TENURE_DAYS / (VISITS - 1) END AS CADENCE_DAYS
  FROM person JOIN eligible e ON e.PERSON_ID = person.PERSON_ID
),
c AS (
  SELECT *,
    CASE
      WHEN VISITS = 1 THEN 'one-visit'
      WHEN DAYS_SINCE > ${lapseDays} THEN 'lapsed'
      WHEN CADENCE_DAYS IS NOT NULL AND DAYS_SINCE > CADENCE_DAYS * 2 THEN 'slipping'
      WHEN VISITS >= 10 THEN 'regular'
      ELSE 'established'
    END AS SEGMENT,
    ROW_NUMBER() OVER (ORDER BY SPEND DESC) AS SPEND_RANK,
    ROW_NUMBER() OVER (ORDER BY HASH(PERSON_ID)) AS SAMPLE_RANK
  FROM p
)
SELECT PERSON_ID, TIER, SEGMENT, VALUE_BAND, VISITS, VENUES, SPEND, ORDERS, ITEMS,
       FIRST_SEEN, LAST_SEEN, DAYS_SINCE, TENURE_DAYS, CADENCE_DAYS,
       HOME_STORE_ID, HOME_STORE, SPEND_RANK
FROM c
WHERE SPEND_RANK <= ${Math.floor(limit / 4)} OR SAMPLE_RANK <= ${limit - Math.floor(limit / 4)}
ORDER BY SPEND DESC`;
}

/**
 * PAR→member linkage. Cards that have also been seen on an enrolled order tell us
 * how much of the card tier is really known members forgetting to scan — the
 * measurement behind R-154, and a fact no competitor can produce.
 */
export function linkageQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
par_seen AS (
  SELECT PAR, COUNT_IF(MEMBER_ID IS NOT NULL) AS MEMBER_ORDERS,
         COUNT_IF(MEMBER_ID IS NULL) AS ANON_ORDERS,
         COUNT(DISTINCT MEMBER_ID) AS MEMBERS
  FROM base WHERE PAR IS NOT NULL GROUP BY PAR
)
SELECT
  COUNT(*) AS CARDS,
  COUNT_IF(MEMBER_ORDERS > 0) AS CARDS_LINKED_TO_MEMBER,
  COUNT_IF(MEMBER_ORDERS > 0 AND ANON_ORDERS > 0) AS CARDS_SOMETIMES_SCANNED,
  SUM(IFF(MEMBER_ORDERS > 0, ANON_ORDERS, 0)) AS UNSCANNED_ORDERS_OF_KNOWN_MEMBERS,
  COUNT_IF(MEMBERS > 1) AS CARDS_ON_MULTIPLE_MEMBERS
FROM par_seen`;
}

/**
 * Member versus everyone else, controlled for party size. The comparison the
 * whole category publishes badly: members appear to spend less per order, and
 * the reason is that they buy for one. Published only with the control attached.
 */
export function memberComparisonQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  TIER, COALESCE(CHANNEL, 'Unknown') AS CHANNEL, ORDER_TYPE_NAME,
  COUNT(*) AS ORDERS, SUM(TOTAL_PRICE) AS REVENUE,
  AVG(TOTAL_PRICE) AS AVG_ORDER, AVG(ITEMS_COUNT) AS AVG_ITEMS,
  AVG(COVERS) AS AVG_COVERS, COUNT_IF(COVERS IS NOT NULL) AS ORDERS_WITH_COVERS,
  SUM(IFF(COVERS IS NOT NULL, TOTAL_PRICE, 0)) / NULLIF(SUM(COVERS), 0) AS SPEND_PER_COVER
FROM base WHERE TIER <> 'unattributed'
GROUP BY 1, 2, 3 ORDER BY ORDERS DESC`;
}

/**
 * Revenue decomposition for MQ9 — "you put prices up, did anyone leave?".
 * Monthly guests, visit frequency and average spend per visit, from which the
 * symmetric-Shapley split of revenue change is computed in the app.
 */
export function decompositionQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
m AS (
  SELECT DATE_TRUNC('month', v.D)::DATE AS MONTH, v.PERSON_ID,
         COUNT(*) AS VISITS, SUM(v.SPEND) AS SPEND, SUM(v.ITEMS) AS ITEMS
  FROM visits v JOIN eligible e ON e.PERSON_ID = v.PERSON_ID
  GROUP BY 1, 2
)
SELECT MONTH,
  COUNT(*) AS GUESTS,
  SUM(VISITS) AS VISITS,
  SUM(SPEND) AS REVENUE,
  SUM(ITEMS) AS ITEMS,
  SUM(VISITS) / NULLIF(COUNT(*), 0) AS VISITS_PER_GUEST,
  SUM(SPEND) / NULLIF(SUM(VISITS), 0) AS SPEND_PER_VISIT,
  SUM(ITEMS) / NULLIF(SUM(VISITS), 0) AS ITEMS_PER_VISIT,
  SUM(SPEND) / NULLIF(SUM(ITEMS), 0) AS PRICE_PER_ITEM
FROM m GROUP BY 1 ORDER BY 1`;
}

/** Venue list with trading dates, for the scope bar. */
export function venuesQuery({ orgId, w }: Args) {
  return `SELECT STORE_ID, ANY_VALUE(STORE_NAME) AS STORE_NAME, ANY_VALUE(VENUE_NAME) AS VENUE_NAME,
       COUNT(*) AS ORDERS, MIN(CREATED_AT_TZ)::DATE AS FIRST_DAY, MAX(CREATED_AT_TZ)::DATE AS LAST_DAY
FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
WHERE ORGANIZATION_ID = '${orgId}'
  AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
  AND ORDER_STATUS = 'COMPLETED' AND COALESCE(IS_TRAINING, FALSE) = FALSE
GROUP BY STORE_ID
HAVING COUNT(*) > 100
ORDER BY ORDERS DESC`;
}

/**
 * Venue by month. The grain anomaly detection needs: a venue can only be judged
 * an outlier against its own history and against its peers, and neither is
 * visible in an estate total.
 */
export function venueMonthlyQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  DATE_TRUNC('month', D)::DATE AS MONTH,
  STORE_ID, ANY_VALUE(STORE_NAME) AS STORE_NAME,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE) AS REVENUE,
  COUNT_IF(TIER = 'member') AS MEMBER_ORDERS,
  COUNT_IF(TIER = 'card') AS CARD_ORDERS,
  COUNT_IF(COVERS IS NOT NULL) AS ORDERS_WITH_COVERS,
  COUNT(DISTINCT D) AS TRADING_DAYS,
  SUM(TOTAL_DISCOUNT) AS DISCOUNT
FROM base
GROUP BY 1, 2
HAVING COUNT(*) >= 50
ORDER BY 1, 2`;
}

/**
 * The output queries. Each returns a compact result that becomes one file in the
 * snapshot. Everything expensive happens in the warehouse; nothing is recomputed
 * in the browser, which is the whole point of the exercise.
 */
import { basePrelude, CARD_PERSON_FILTER, type StorePair, type Window } from "./sql";
import { MIN_VISITS_FOR_LIFECYCLE } from "./orgs";

type Args = {
  orgId: string;
  w: Window;
  pairs: StorePair[];
  lapseDays: number;
  slippingDays: number;
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
 * Lifecycle classification, as a reusable fragment.
 *
 * Two rules that v1 stated in prose and did not enforce:
 *   - a verdict needs three visits, because with two you have one gap and a
 *     broken-habit claim is not estimable from one observation;
 *   - the classification conditions on the guest's *own* cadence, and says so.
 */
function segmentCase(lapseDays: number) {
  return `CASE
      WHEN VISITS < ${MIN_VISITS_FOR_LIFECYCLE} AND DAYS_SINCE > ${lapseDays} THEN 'lapsed'
      WHEN VISITS = 1 THEN 'one-visit'
      WHEN VISITS < ${MIN_VISITS_FOR_LIFECYCLE} THEN 'new'
      WHEN DAYS_SINCE > ${lapseDays} THEN 'lapsed'
      WHEN CADENCE_DAYS IS NOT NULL AND DAYS_SINCE > CADENCE_DAYS * 2 THEN 'slipping'
      WHEN VISITS >= 10 THEN 'regular'
      ELSE 'established'
    END`;
}

// ── coverage ────────────────────────────────────────────────────────────────

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
  COUNT_IF(TIER = 'member' AND SCANNED) AS SCANNED_ORDERS,
  SUM(IFF(TIER = 'member' AND SCANNED, TOTAL_PRICE, 0)) AS SCANNED_REVENUE,
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
  SUM(IFF(TIER = 'member' AND SCANNED, TOTAL_PRICE, 0)) AS SCANNED_REVENUE,
  SUM(IFF(TIER = 'card', TOTAL_PRICE, 0)) AS CARD_REVENUE,
  COUNT_IF(TIER = 'member') AS MEMBER_ORDERS,
  COUNT_IF(TIER = 'member' AND SCANNED) AS SCANNED_ORDERS,
  COUNT_IF(TIER = 'card') AS CARD_ORDERS
FROM base GROUP BY 1 ORDER BY 1`;
}

// ── the member value model ──────────────────────────────────────────────────

/**
 * Member versus non-member, at person grain, over the honest window.
 *
 * This is the comparison build v1 could not publish and the review was right to
 * hold. What makes it publishable now is the spine: both columns are people
 * identified by their payment card, over the same window, at the same venues.
 * One group has enrolled. That is a like-for-like contrast; 1,030 humans against
 * 7,824 payment instruments was not.
 *
 * It deliberately reports four different value measures, because they disagree
 * and the disagreement is the finding: members buy slightly *less* per visit and
 * come back a great deal more often, so any report that publishes only average
 * order value concludes that loyalty destroys value. Most of them do.
 */
export function memberValueQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
p AS (
  SELECT person.*, IFF(TIER = 'member', TRUE, FALSE) AS IS_MEMBER,
         DATEDIFF(day, '${w.start}', '${w.end}') AS WINDOW_DAYS
  FROM person
)
SELECT
  IS_MEMBER,
  COUNT(*)                                   AS PEOPLE,
  SUM(VISITS)                                AS VISITS,
  AVG(VISITS)                                AS AVG_VISITS,
  MEDIAN(VISITS)                             AS MEDIAN_VISITS,
  COUNT_IF(VISITS >= 2)                      AS REPEAT_PEOPLE,
  SUM(SPEND)                                 AS SPEND,
  AVG(SPEND)                                 AS SPEND_PER_PERSON,
  MEDIAN(SPEND)                              AS MEDIAN_SPEND_PER_PERSON,
  STDDEV(SPEND)                              AS SD_SPEND_PER_PERSON,
  SUM(SPEND) / NULLIF(SUM(VISITS), 0)        AS SPEND_PER_VISIT,
  SUM(ITEMS) / NULLIF(SUM(VISITS), 0)        AS ITEMS_PER_VISIT,
  SUM(ORDERS)                                AS ORDERS,
  SUM(SCANNED_ORDERS)                        AS SCANNED_ORDERS,
  SUM(SCANNED_VISITS)                        AS SCANNED_VISITS,
  SUM(COVERS)                                AS COVERS,
  COUNT_IF(VENUES > 1)                       AS MULTI_VENUE,
  ANY_VALUE(WINDOW_DAYS)                     AS WINDOW_DAYS
FROM p GROUP BY 1 ORDER BY 1`;
}

/**
 * Spend per cover, computed only over orders that record one.
 *
 * Kept separate from the headline because the missingness is not at random and
 * the review proved it: at Meat Flour Wine, member orders that record a party
 * size average four times the member orders that do not. Restricting both sides
 * to covers-recorded orders is a like-for-like basis for *those orders* and
 * nothing more, so it is published as its own measure with its own denominator
 * rather than being folded into the value headline.
 */
export function coverBasisQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  IFF(TIER = 'member', TRUE, FALSE) AS IS_MEMBER,
  COUNT(*) AS ORDERS,
  COUNT_IF(COVERS IS NOT NULL) AS ORDERS_WITH_COVERS,
  SUM(IFF(COVERS IS NOT NULL, TOTAL_PRICE, 0)) AS REVENUE_WITH_COVERS,
  SUM(COVERS) AS COVERS,
  AVG(IFF(COVERS IS NOT NULL, TOTAL_PRICE, NULL)) AS AVG_ORDER_WITH_COVERS,
  AVG(IFF(COVERS IS NULL, TOTAL_PRICE, NULL)) AS AVG_ORDER_WITHOUT_COVERS,
  AVG(COVERS) AS AVG_COVERS
FROM base WHERE TIER <> 'unattributed'
GROUP BY 1 ORDER BY 1`;
}

/**
 * Member value by daypart, at person-visit grain.
 *
 * The premium is not constant across the day — at Meat Flour Wine the review
 * measured a member advantage five times larger in the afternoon than at dinner.
 * A pooled figure therefore measures *when members come* as much as what they
 * are worth. These cells let the app standardise the comparison against a common
 * daypart mix, which removes that confound instead of footnoting it.
 */
export function memberDaypartQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  DAYPART,
  IS_WEEKEND,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE) AS REVENUE,
  SUM(ITEMS_COUNT) AS ITEMS,
  COUNT_IF(TIER = 'member') AS MEMBER_ORDERS,
  SUM(IFF(TIER = 'member', TOTAL_PRICE, 0)) AS MEMBER_REVENUE,
  COUNT_IF(TIER = 'card') AS CARD_ORDERS,
  SUM(IFF(TIER = 'card', TOTAL_PRICE, 0)) AS CARD_REVENUE,
  COUNT_IF(TIER = 'unattributed') AS UNATTRIBUTED_ORDERS,
  SUM(IFF(TIER = 'unattributed', TOTAL_PRICE, 0)) AS UNATTRIBUTED_REVENUE,
  AVG(IFF(TIER = 'member', TOTAL_PRICE, NULL)) AS AVG_ORDER_MEMBER,
  AVG(IFF(TIER = 'card', TOTAL_PRICE, NULL)) AS AVG_ORDER_CARD,
  AVG(IFF(TIER = 'member', ITEMS_COUNT, NULL)) AS AVG_ITEMS_MEMBER,
  AVG(IFF(TIER = 'card', ITEMS_COUNT, NULL)) AS AVG_ITEMS_CARD,
  SUM(IFF(TIER = 'member', COVERS, 0)) AS MEMBER_COVERS,
  SUM(IFF(TIER = 'card', COVERS, 0)) AS CARD_COVERS,
  SUM(IFF(TIER = 'member' AND COVERS IS NOT NULL, TOTAL_PRICE, 0)) AS MEMBER_REVENUE_WITH_COVERS,
  SUM(IFF(TIER = 'card' AND COVERS IS NOT NULL, TOTAL_PRICE, 0)) AS CARD_REVENUE_WITH_COVERS,
  COUNT(DISTINCT D) AS TRADING_DAYS
FROM base
GROUP BY 1, 2 ORDER BY 1, 2`;
}

/**
 * The within-person test: does enrolling change behaviour, or do the people who
 * were already coming back simply enrol?
 *
 * Every cross-sectional loyalty comparison ever published answers the first
 * question with evidence for the second. The design here is the only one the
 * data supports: find people first seen anonymously on a card who later start
 * scanning, and compare that same person's visit and spend *rate* either side of
 * their first scan. The person is their own control, so selection into enrolment
 * cannot produce the effect.
 *
 * Two honest caveats, both stated on screen:
 *   - first scan is a proxy for enrolment; someone may have enrolled earlier and
 *     scanned late, which biases the estimate toward zero;
 *   - the after-window is closed by the window end rather than by a visit, while
 *     the before-window is closed by the scan, which also biases it down.
 * Both point the same way, so the estimate is conservative.
 *
 * Returns one row per switcher so the app can compute a paired interval rather
 * than publish a point estimate with no band.
 */
export function enrolmentSwitchQuery({ orgId, w, pairs, cardMonths }: Args, minExposure = 21) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
carded_people AS (
  SELECT PAR,
    MIN(D) AS FIRST_SEEN,
    MAX(D) AS LAST_SEEN,
    MIN(IFF(SCANNED, D, NULL)) AS FIRST_SCAN
  FROM base WHERE PAR IS NOT NULL AND TIER <> 'unattributed'
  GROUP BY PAR
),
switchers AS (
  SELECT * FROM carded_people
  WHERE FIRST_SCAN IS NOT NULL
    AND FIRST_SCAN > FIRST_SEEN
    AND DATEDIFF(day, FIRST_SEEN, FIRST_SCAN) >= ${minExposure}
    AND DATEDIFF(day, FIRST_SCAN, '${w.end}') >= ${minExposure}
),
sides AS (
  SELECT
    s.PAR,
    DATEDIFF(day, s.FIRST_SEEN, s.FIRST_SCAN) AS DAYS_BEFORE,
    DATEDIFF(day, s.FIRST_SCAN, '${w.end}')   AS DAYS_AFTER,
    COUNT(DISTINCT IFF(b.D <  s.FIRST_SCAN, b.D, NULL)) AS VISITS_BEFORE,
    COUNT(DISTINCT IFF(b.D >= s.FIRST_SCAN, b.D, NULL)) AS VISITS_AFTER,
    SUM(IFF(b.D <  s.FIRST_SCAN, b.TOTAL_PRICE, 0)) AS SPEND_BEFORE,
    SUM(IFF(b.D >= s.FIRST_SCAN, b.TOTAL_PRICE, 0)) AS SPEND_AFTER
  FROM switchers s JOIN base b ON b.PAR = s.PAR
  GROUP BY 1, 2, 3
)
SELECT
  DAYS_BEFORE, DAYS_AFTER, VISITS_BEFORE, VISITS_AFTER, SPEND_BEFORE, SPEND_AFTER,
  28.0 * VISITS_BEFORE / NULLIF(DAYS_BEFORE, 0) AS VISIT_RATE_BEFORE,
  28.0 * VISITS_AFTER  / NULLIF(DAYS_AFTER, 0)  AS VISIT_RATE_AFTER,
  28.0 * SPEND_BEFORE  / NULLIF(DAYS_BEFORE, 0) AS SPEND_RATE_BEFORE,
  28.0 * SPEND_AFTER   / NULLIF(DAYS_AFTER, 0)  AS SPEND_RATE_AFTER
FROM sides`;
}

/**
 * The enrolment opportunity, sized from the population rather than asserted.
 *
 * Card-identified people who come back but have never enrolled, banded by how
 * often they visit. The app applies the *within-person* uplift to this base, not
 * the cross-sectional gap, because the cross-sectional gap is mostly selection
 * and using it would overstate the prize by an order of magnitude.
 */
export function opportunityQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  IFF(TIER = 'member', TRUE, FALSE) AS IS_MEMBER,
  LEAST(VISITS, 10) AS VISIT_BAND,
  COUNT(*) AS PEOPLE,
  SUM(VISITS) AS VISITS,
  SUM(SPEND) AS SPEND,
  AVG(SPEND) AS AVG_SPEND,
  SUM(ORDERS) AS ORDERS,
  SUM(SCANNED_ORDERS) AS SCANNED_ORDERS,
  SUM(SCANNED_VISITS) AS SCANNED_VISITS
FROM person
GROUP BY 1, 2 ORDER BY 1, 2`;
}

/**
 * Scan discipline and card→member linkage.
 *
 * Under the spine this stops being a curiosity and becomes the measurement that
 * sizes the largest fixable gap in the report: revenue from people the business
 * already knows, on visits it did not recognise at the time.
 */
export function linkageQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
par_seen AS (
  SELECT PAR,
    COUNT_IF(SCANNED) AS SCANNED_ORDERS,
    COUNT_IF(NOT SCANNED) AS UNSCANNED_ORDERS,
    SUM(IFF(NOT SCANNED, TOTAL_PRICE, 0)) AS UNSCANNED_REVENUE,
    MAX(IFF(PERSON_MEMBER_ID IS NOT NULL, 1, 0)) AS IS_MEMBER,
    COUNT(DISTINCT MEMBER_ID) AS MEMBERS
  FROM base WHERE PAR IS NOT NULL GROUP BY PAR
)
SELECT
  COUNT(*) AS CARDS,
  COUNT_IF(IS_MEMBER = 1) AS CARDS_LINKED_TO_MEMBER,
  COUNT_IF(IS_MEMBER = 1 AND UNSCANNED_ORDERS > 0) AS CARDS_SOMETIMES_SCANNED,
  SUM(IFF(IS_MEMBER = 1, UNSCANNED_ORDERS, 0)) AS UNSCANNED_ORDERS_OF_KNOWN_MEMBERS,
  SUM(IFF(IS_MEMBER = 1, UNSCANNED_REVENUE, 0)) AS UNSCANNED_REVENUE_OF_KNOWN_MEMBERS,
  SUM(IFF(IS_MEMBER = 1, SCANNED_ORDERS, 0)) AS SCANNED_ORDERS_OF_KNOWN_MEMBERS,
  COUNT_IF(MEMBERS > 1) AS CARDS_ON_MULTIPLE_MEMBERS
FROM par_seen`;
}

// ── survival, thresholds, lifecycle ─────────────────────────────────────────

/**
 * Time-to-next-visit episodes, for a Kaplan-Meier estimate of the return curve.
 *
 * v1 took percentiles of *observed* gaps, which only exist for people who came
 * back. Everybody who left forever was silently dropped, so p90 of returned gaps
 * sat well below the point at which return actually becomes unlikely, and the
 * product declared people lapsed who would have returned. Read plainly, v1's
 * p75 = 42d meant a quarter of all successful returns happened after the guest
 * was called at risk.
 *
 * Here every visit opens an episode. It closes as an *event* on the next visit,
 * or is *right-censored* at the window end if there is no next visit — which is
 * exactly the information v1 threw away. Episodes are weighted 1/n per guest, so
 * the estimate is per guest rather than per gap and a twice-daily regular no
 * longer outvotes two hundred occasional ones.
 */
export function survivalQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
seq AS (
  SELECT pv.PERSON_ID, pv.TIER, pv.D,
    LEAD(pv.D) OVER (PARTITION BY pv.PERSON_ID ORDER BY pv.D) AS NEXT_D
  FROM pv JOIN eligible e ON e.PERSON_ID = pv.PERSON_ID
),
episodes AS (
  SELECT PERSON_ID, TIER,
    IFF(NEXT_D IS NULL, DATEDIFF(day, D, '${w.end}'), DATEDIFF(day, D, NEXT_D)) AS T,
    IFF(NEXT_D IS NULL, FALSE, TRUE) AS EVENT
  FROM seq
),
weighted AS (
  SELECT e.*, 1.0 / COUNT(*) OVER (PARTITION BY PERSON_ID) AS W
  FROM episodes e WHERE T > 0
)
SELECT T AS DAYS, TIER,
  SUM(IFF(EVENT, W, 0)) AS EVENTS_W,
  SUM(IFF(EVENT, 0, W)) AS CENSORED_W,
  COUNT_IF(EVENT) AS EVENTS_N,
  COUNT_IF(NOT EVENT) AS CENSORED_N
FROM weighted GROUP BY 1, 2 ORDER BY 1, 2`;
}

/** The raw gap histogram, kept for the shape of the distribution only. */
export function gapHistogramQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
gaps AS (
  SELECT DATEDIFF(day, LAG(pv.D) OVER (PARTITION BY pv.PERSON_ID ORDER BY pv.D), pv.D) AS GAP
  FROM pv JOIN eligible e ON e.PERSON_ID = pv.PERSON_ID
)
SELECT GAP AS DAYS, COUNT(*) AS N
FROM gaps WHERE GAP IS NOT NULL AND GAP > 0 GROUP BY 1 ORDER BY 1`;
}

/**
 * The lifecycle trend. New / returning / reactivated per month, plus lapse
 * events. Lapse is a dated event, not a status: a person lapses on the day their
 * gap since last visit crosses the threshold.
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

// ── segments, guests ────────────────────────────────────────────────────────

/**
 * Segment and value-band composition at person grain. Bands are calibrated
 * quintiles of the org's own spend distribution, not fixed dollar cuts.
 *
 * The lifecycle label is nulled for non-member people **here, at source**. v1
 * stated the prohibition in prose on one screen and violated it on two others; a
 * rule stated in prose and unenforced in the data is not a control. Card reissue
 * is unmeasured and looks identical to churn, so "lapsed" on a card is a claim
 * we cannot support.
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
  SELECT *, IFF(TIER = 'member', ${segmentCase(lapseDays)}, NULL) AS SEGMENT FROM p
)
SELECT TIER, SEGMENT, VALUE_BAND,
  COUNT(*) AS GUESTS, SUM(VISITS) AS VISITS, SUM(SPEND) AS SPEND,
  MIN(SPEND) AS MIN_SPEND, MAX(SPEND) AS MAX_SPEND,
  AVG(VISITS) AS AVG_VISITS, AVG(SPEND) AS AVG_SPEND,
  COUNT_IF(VENUES > 1) AS MULTI_VENUE
FROM c GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
}

/**
 * The bounded guest list, stratified deterministically: the top of the value
 * distribution in full, plus a hash-ordered sample of the tail, so the grid looks
 * like the real population instead of a leaderboard. The UI paginates it and says
 * what it is.
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
    IFF(TIER = 'member', ${segmentCase(lapseDays)}, NULL) AS SEGMENT,
    ROW_NUMBER() OVER (ORDER BY SPEND DESC) AS SPEND_RANK,
    ROW_NUMBER() OVER (ORDER BY HASH(PERSON_ID)) AS SAMPLE_RANK
  FROM p
)
SELECT PERSON_ID, TIER, SEGMENT, VALUE_BAND, VISITS, VENUES, SPEND, ORDERS, ITEMS,
       SCANNED_ORDERS, COVERS, HOME_DAYPART,
       FIRST_SEEN, LAST_SEEN, DAYS_SINCE, TENURE_DAYS, CADENCE_DAYS,
       HOME_STORE_ID, HOME_STORE, SPEND_RANK
FROM c
WHERE SPEND_RANK <= ${Math.floor(limit / 4)} OR SAMPLE_RANK <= ${limit - Math.floor(limit / 4)}
ORDER BY SPEND DESC`;
}

// ── growth, venues ──────────────────────────────────────────────────────────

/**
 * Revenue decomposition. Monthly guests, visit frequency and average spend per
 * visit, from which the symmetric-Shapley split of revenue change is computed in
 * the app.
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

/** Venue list for the analysis window, resolved on store id. */
export function venuesQuery({ orgId, w }: Args) {
  return `WITH r AS (
  SELECT STORE_ID, STORE_NAME, VENUE_NAME, CREATED_AT_TZ AS TS
  FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
  WHERE ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
    AND ORDER_STATUS = 'COMPLETED' AND COALESCE(IS_TRAINING, FALSE) = FALSE
)
SELECT STORE_ID,
  MAX_BY(STORE_NAME, TS) AS STORE_NAME,
  MAX_BY(VENUE_NAME, TS) AS VENUE_NAME,
  COUNT(*) AS ORDERS, MIN(TS)::DATE AS FIRST_DAY, MAX(TS)::DATE AS LAST_DAY
FROM r
GROUP BY STORE_ID
HAVING COUNT(*) > 100
ORDER BY ORDERS DESC`;
}

/**
 * Every name a store has traded under, and the day it genuinely opened.
 *
 * Run over the *discovery* window rather than the analysis window, because a
 * rename that happened last year is invisible inside three months — and it is
 * exactly the history that produced a phantom venue and 74 orphaned guests when
 * the name was treated as the key. The current name is applied to all history;
 * the earlier ones are published so an operator who remembers the old name can
 * find the venue.
 */
export function venueNameHistoryQuery(orgId: string, w: Window) {
  return `SELECT STORE_ID,
  ARRAY_AGG(DISTINCT STORE_NAME) AS NAMES,
  COUNT(DISTINCT STORE_NAME) AS NAMES_SEEN,
  MIN(CREATED_AT_TZ)::DATE AS FIRST_DAY
FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS
WHERE ORGANIZATION_ID = '${orgId}'
  AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
  AND ORDER_STATUS = 'COMPLETED' AND COALESCE(IS_TRAINING, FALSE) = FALSE
GROUP BY STORE_ID`;
}

/** Venue by month, the grain the anomaly detection needs. */
export function venueMonthlyQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  DATE_TRUNC('month', D)::DATE AS MONTH,
  STORE_ID, ANY_VALUE(STORE_NAME) AS STORE_NAME,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE) AS REVENUE,
  COUNT_IF(TIER = 'member') AS MEMBER_ORDERS,
  SUM(IFF(TIER = 'member', TOTAL_PRICE, 0)) AS MEMBER_REVENUE,
  COUNT_IF(TIER = 'card') AS CARD_ORDERS,
  COUNT_IF(TIER = 'member' AND SCANNED) AS SCANNED_ORDERS,
  COUNT_IF(COVERS IS NOT NULL) AS ORDERS_WITH_COVERS,
  COUNT(DISTINCT D) AS TRADING_DAYS,
  SUM(TOTAL_DISCOUNT) AS DISCOUNT
FROM base
GROUP BY 1, 2
HAVING COUNT(*) >= 50
ORDER BY 1, 2`;
}

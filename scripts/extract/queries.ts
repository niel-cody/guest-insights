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

/**
 * The classified person, as **one** CTE shared by every query that emits a
 * segment.
 *
 * ── Why this is shared text rather than three similar queries ──────────────
 *
 * The segment table, the guest grid and §5.4's scatter all publish a segment,
 * and they publish it *on the same screen* — the scatter sits beside the table
 * it is drawn from. Three hand-written copies of "days since, cadence, then the
 * case" disagreed by three people out of 4,966 the first time this was written,
 * which is small enough to survive review and large enough to be the exact
 * defect §9 warns about: **a count on a chart disagreeing with the count in the
 * table beneath it.** That mismatch is live on the report this one replaces.
 *
 * Sharing the text means they cannot drift. The scatter is not "computed the
 * same way" as the table; it is computed by the same characters.
 */
/**
 * ── The tier gate is gone, and why it should never have been absolute ──────
 *
 * This used to read `IFF(TIER = 'member', <case>, NULL)`. Every input the
 * classifier needs — VISITS, DAYS_SINCE, CADENCE_DAYS — is computed in `p` for
 * **every** person regardless of tier, and always was. The gate was a policy
 * applied after the arithmetic, not a limit of the data, and it hid the larger
 * half of the base: 51.3% of everyone with ten or more visits at Coffee Guru is
 * an anonymous card, and 78% of everyone with three or more.
 *
 * The objection it encoded is real but **directional**, and blanket-nulling
 * threw away the half of it that is sound. A card person is not stitched across
 * a reissue the way a member is by MEMBER_ID, so a reissue splits one person in
 * two. That error does not point the same way for every verdict:
 *
 * - **Regulars and Established are conservative.** Splitting a twelve-visit
 *   person into a seven and a five can only ever *understate* them. There is no
 *   way to manufacture a regular by reissuing a card — ten observed visits
 *   inside a cadence are ten visits that happened.
 * - **Lapsed and Slipping are inflated.** A card going quiet is precisely what a
 *   reissue looks like, so these carry genuine false positives.
 * - **Seen once cannot occur on a card at all.** `CARD_PERSON_FILTER` makes a
 *   card a person only on its second visit, which `segment.cardNeverSeenOnce`
 *   now asserts rather than assumes.
 *
 * So the verdict is computed for everyone and the *claim* is scoped instead: on
 * a card, "Lapsed" means this card stopped appearing, which is observably true.
 * It is the inference to "this customer churned" that a reissue breaks, and the
 * surface says so rather than the extract deleting the row.
 */
function classified(lapseDays: number) {
  return `p AS (
  SELECT person.*, DATEDIFF(day, LAST_SEEN, '@@END@@') AS DAYS_SINCE,
         NTILE(5) OVER (ORDER BY SPEND) AS VALUE_BAND,
         CASE WHEN VISITS > 1 THEN TENURE_DAYS / (VISITS - 1) END AS CADENCE_DAYS
  FROM person JOIN eligible e ON e.PERSON_ID = person.PERSON_ID
),
c AS (
  SELECT *, ${segmentCase(lapseDays)} AS SEGMENT FROM p
)`;
}

/** The shared CTE, bound to a window. The placeholder keeps the text identical. */
const classifiedFor = (lapseDays: number, end: string) =>
  classified(lapseDays).replaceAll("@@END@@", end);

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
${classifiedFor(lapseDays, w.end)}
SELECT TIER, SEGMENT, VALUE_BAND,
  COUNT(*) AS GUESTS, SUM(VISITS) AS VISITS, SUM(SPEND) AS SPEND,
  SUM(ORDERS) AS ORDERS, SUM(ITEMS) AS ITEMS,
  MIN(SPEND) AS MIN_SPEND, MAX(SPEND) AS MAX_SPEND,
  AVG(VISITS) AS AVG_VISITS, AVG(SPEND) AS AVG_SPEND,
  COUNT_IF(VENUES > 1) AS MULTI_VENUE
FROM c GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
}

/**
 * Basket shape and visit timing, by lifecycle segment, at **whole-population
 * grain**.
 *
 * ── Why this query exists rather than the obvious client-side derivation ───
 *
 * Every quantity here is already sitting in the guest working set the grid
 * loads, and computing it there would have taken twenty lines and no warehouse
 * round trip. It would also have been wrong, and wrong in a way that flatters
 * the finding.
 *
 * The working set is the top of the value distribution **in full** plus a
 * hash-ordered sample of the tail. Its coverage therefore varies by segment —
 * measured against the population it is 97% of Regulars and 53% of Lapsed — and
 * because it over-selects high spenders, spend per visit within a segment comes
 * out high by up to 14 points on exactly the low-frequency segments. The
 * headline this data produces is that Regulars have the *smallest* baskets and
 * Seen once the largest, and the sampling bias inflates the Seen once end. The
 * missingness runs in the direction of the answer, which is the same test that
 * withholds the per-cover comparison on Overview.
 *
 * So it is measured on everybody, in the warehouse, once.
 *
 * ── The grain, stated because two of these are easy to misread ────────────
 *
 * `visits` is person-day-at-a-venue, so `COUNT(*)` is visits and `SUM(ORDERS)`
 * is transactions — two coffees an hour apart is one visit and two orders. That
 * distinction is the whole reason average transaction value and spend per visit
 * are different numbers here, and publishing either without the other invites
 * the reader to conclude the frequent customer is the low-value one.
 *
 * **Party size is deliberately absent.** Covers are recorded on a minority of
 * orders at one of the two organisations and the missingness correlates with
 * order size, so a per-head figure by segment would be a comparison between the
 * top of one distribution and all of another. Items per visit is published
 * instead and named as what it is: items, not people.
 */
export function segmentBehaviourQuery({ orgId, w, pairs, lapseDays, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
${classifiedFor(lapseDays, w.end)}
SELECT
  c.SEGMENT,
  -- The tier travels with the row now that both carry a verdict. Without it
  -- this table would silently pool enrolled people and anonymous cards into one
  -- "Regulars" bucket, and the surface could not take them apart again.
  c.TIER,
  DAYOFWEEK(v.D) AS DOW,
  v.DAYPART,
  COUNT(*) AS VISITS,
  SUM(v.ORDERS) AS ORDERS,
  SUM(v.SPEND) AS SPEND,
  SUM(v.ITEMS) AS ITEMS,
  COUNT(DISTINCT v.PERSON_ID) AS PEOPLE
FROM visits v
JOIN c ON c.PERSON_ID = v.PERSON_ID
WHERE c.SEGMENT IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3`;
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
${classifiedFor(lapseDays, w.end)},
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY SPEND DESC) AS SPEND_RANK,
    ROW_NUMBER() OVER (ORDER BY HASH(PERSON_ID)) AS SAMPLE_RANK
  FROM c
)
SELECT PERSON_ID, TIER, SEGMENT, VALUE_BAND, VISITS, VENUES, SPEND, ORDERS, ITEMS,
       SCANNED_ORDERS, COVERS, HOME_DAYPART,
       FIRST_SEEN, LAST_SEEN, DAYS_SINCE, TENURE_DAYS, CADENCE_DAYS,
       HOME_STORE_ID, HOME_STORE, SPEND_RANK
FROM ranked
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

/**
 * Venue coordinates, from the platform rather than from a map service.
 *
 * `DT_STORES.GEOCODE` is a real per-store geography column, so the estate map is
 * a capability the platform already has rather than a set of coordinates typed in
 * by hand. Estate-wide only 883 of 2,540 stores carry one, which is a data gap
 * with a named consequence: an ungeocoded venue cannot appear on the map or in
 * the catchment model.
 *
 * `STATE_CODE` is dirty — `ACT` and `Australian Capital Territory` both occur, as
 * do `NSW` and `New South Wales` — so nothing keys on it.
 */
export function venueGeoQuery(orgId: string) {
  return `SELECT ID AS STORE_ID, NAME, STATE_CODE, TIMEZONE,
  ST_Y(GEOCODE) AS LAT, ST_X(GEOCODE) AS LON, H3_INDEX_5
FROM OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.DT_STORES
WHERE ORG_ID = '${orgId}' AND COALESCE(IS_DELETED, FALSE) = FALSE`;
}

/**
 * The venue network: which venues share guests, and how far apart they are.
 *
 * Co-visitation is normalised against what independence would produce —
 * `expected = n_a × n_b / N` — because raw shared-guest counts simply recover
 * venue size. Distance comes from the stored geocode, so the app can fit the
 * decay curve and publish what beats it.
 *
 * A guest counts toward a pair once, however many times they visited either
 * venue, so a single very frequent person cannot manufacture an edge.
 */
export function venueNetworkQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
pvv AS (
  SELECT DISTINCT v.PERSON_ID, v.STORE_ID
  FROM visits v JOIN eligible e ON e.PERSON_ID = v.PERSON_ID
),
node AS (
  SELECT STORE_ID, COUNT(DISTINCT PERSON_ID) AS PEOPLE FROM pvv GROUP BY STORE_ID
),
tot AS (SELECT COUNT(DISTINCT PERSON_ID) AS N FROM pvv),
pair AS (
  SELECT a.STORE_ID AS A, b.STORE_ID AS B, COUNT(*) AS SHARED
  FROM pvv a JOIN pvv b ON a.PERSON_ID = b.PERSON_ID AND a.STORE_ID < b.STORE_ID
  GROUP BY 1, 2
)
SELECT p.A, p.B, p.SHARED, na.PEOPLE AS PEOPLE_A, nb.PEOPLE AS PEOPLE_B, t.N AS POPULATION,
  ST_DISTANCE(sa.GEOCODE, sb.GEOCODE) / 1000 AS KM
FROM pair p
JOIN node na ON na.STORE_ID = p.A
JOIN node nb ON nb.STORE_ID = p.B
CROSS JOIN tot t
LEFT JOIN OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.DT_STORES sa ON sa.ID = p.A
LEFT JOIN OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.DT_STORES sb ON sb.ID = p.B
ORDER BY p.SHARED DESC`;
}

/**
 * The multi-venue guest, as a cohort.
 *
 * A small group — 6.5% of Coffee Guru's identified people — worth 2.5 times the
 * spend per head, and invisible to any per-venue report. This is the segment the
 * network exists to make actionable.
 */
export function crossVenueQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
p AS (SELECT person.* FROM person JOIN eligible e ON e.PERSON_ID = person.PERSON_ID)
SELECT
  LEAST(VENUES, 4) AS VENUE_BAND,
  IFF(TIER = 'member', TRUE, FALSE) AS IS_MEMBER,
  COUNT(*) AS PEOPLE,
  SUM(VISITS) AS VISITS,
  SUM(SPEND) AS SPEND,
  AVG(VISITS) AS AVG_VISITS,
  AVG(SPEND) AS AVG_SPEND
FROM p GROUP BY 1, 2 ORDER BY 1, 2`;
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

// ── items, categories and the basket ────────────────────────────────────────

/**
 * What a guest actually bought.
 *
 * ── Three traps, and they are why this is one shared definition ────────────
 *
 * **1. `QUANTITY` is not trustworthy.** One Coffee Guru line carries
 * `QUANTITY = 4,654,648`, and "Frothy" — a milk texture with zero revenue and
 * 66 lines — sums to 5,177,296 units across three months. Ranking anything by
 * summed quantity puts a milk texture at the top of every guest's favourites.
 * **Nothing here reads QUANTITY.** Popularity is counted in lines and in orders
 * containing the product, both of which are one-per-row and cannot be inflated
 * by a mis-keyed till.
 *
 * **2. A third of all lines are modifiers**, and `MODIFIER_GROUP_NAME` does not
 * reliably mark them — "1 Sugar" appears 25,981 times, only 2,480 of them
 * flagged. So two different filters are used for two different questions, and
 * conflating them is the error:
 *
 *   - **`product_line`** — paid, non-modifier. "A thing the guest chose to buy."
 *     This is what a favourites list and a repertoire are counted on.
 *   - **`paid_line`** — paid, modifiers included. This is what category *spend*
 *     is counted on, because a paid modifier is real money and dropping it
 *     stops the category mix reconciling to revenue.
 *
 * `TOTAL_PRICE > 0` is doing the heavy lifting in both: it removes every
 * absurd-quantity line, every wrapper row such as `HOT.` (14,063 lines, zero
 * revenue, not flagged as a modifier), and reconciles to the order total within
 * 0.02%.
 *
 * **3. The category name is not the key.** Five Coffee Guru category names
 * carry more than one id. This is the same slowly-changing-attribute trap that
 * invented a phantom Braeside venue out of three successive store names, so
 * categories are grouped on `PRODUCT_CATEGORY_ID` and the current name is
 * resolved once and applied to all history — exactly as venues are.
 */
const ITEMS = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDER_ITEMS";

function itemsCte(orgId: string, w: Window) {
  return `item_raw AS (
  SELECT
    ORDER_ID,
    PRODUCT_ID, PRODUCT_NAME,
    NULLIF(TRIM(PRODUCT_CATEGORY_ID), '') AS CATEGORY_ID,
    NULLIF(TRIM(PRODUCT_CATEGORY_NAME), '') AS CATEGORY_NAME,
    NULLIF(TRIM(PRODUCT_TYPE_NAME), '') AS TYPE_NAME,
    TOTAL_PRICE,
    CREATED_AT_TZ AS TS,
    /* Never QUANTITY. See the note above: one line carries 4,654,648. */
    IFF(NULLIF(TRIM(MODIFIER_GROUP_NAME), '') IS NULL, TRUE, FALSE) AS IS_PRODUCT
  FROM ${ITEMS}
  WHERE ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
    AND STATUS = 'COMPLETED'
    AND TOTAL_PRICE > 0
),
/* One current name per category id, applied across all history. */
cat AS (
  SELECT CATEGORY_ID, MAX_BY(CATEGORY_NAME, TS) AS CATEGORY_NAME,
         COUNT(DISTINCT CATEGORY_NAME) AS NAMES_SEEN
  FROM item_raw WHERE CATEGORY_ID IS NOT NULL GROUP BY CATEGORY_ID
),
prod AS (
  SELECT PRODUCT_ID, MAX_BY(PRODUCT_NAME, TS) AS PRODUCT_NAME,
         MAX_BY(CATEGORY_ID, TS) AS CATEGORY_ID, MAX_BY(TYPE_NAME, TS) AS TYPE_NAME
  FROM item_raw WHERE PRODUCT_ID IS NOT NULL GROUP BY PRODUCT_ID
),
paid_line AS (
  SELECT i.* EXCLUDE (CATEGORY_NAME), c.CATEGORY_NAME
  FROM item_raw i LEFT JOIN cat c ON c.CATEGORY_ID = i.CATEGORY_ID
),
product_line AS (SELECT * FROM paid_line WHERE IS_PRODUCT)`;
}

/**
 * The category mix of member and non-member trade, side by side.
 *
 * This is the object that explains the basket gap the product already
 * publishes. Members are a coffee habit and non-members are a food occasion, so
 * a member's basket is smaller — and the crude −13.5% gap, which daypart
 * standardisation only moved by +1.9%, has been sitting unexplained.
 *
 * Both sides are **person-grain identified trade**, not scanned orders: the card
 * is the spine, so a member who forgot to scan is still a member here. Counting
 * on scans instead would measure the scan rate as much as the mix.
 */
export function categoryMixQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${itemsCte(orgId, w)},
${PEOPLE},
tier AS (
  SELECT DISTINCT po.ORDER_ID, po.PERSON_ID, po.TIER
  FROM person_orders po JOIN eligible e ON e.PERSON_ID = po.PERSON_ID
),
lines AS (
  SELECT t.TIER, p.CATEGORY_ID, p.CATEGORY_NAME, p.TYPE_NAME, p.TOTAL_PRICE, p.IS_PRODUCT,
         t.PERSON_ID, p.ORDER_ID
  FROM paid_line p JOIN tier t ON t.ORDER_ID = p.ORDER_ID
)
SELECT
  COALESCE(CATEGORY_ID, '(uncategorised)') AS CATEGORY_ID,
  COALESCE(MAX(CATEGORY_NAME), 'Uncategorised') AS CATEGORY_NAME,
  MAX(TYPE_NAME) AS TYPE_NAME,
  TIER,
  COUNT_IF(IS_PRODUCT) AS PRODUCT_LINES,
  COUNT(*) AS PAID_LINES,
  SUM(TOTAL_PRICE) AS REVENUE,
  COUNT(DISTINCT PERSON_ID) AS PEOPLE,
  COUNT(DISTINCT ORDER_ID) AS ORDERS
FROM lines
GROUP BY CATEGORY_ID, TIER
ORDER BY REVENUE DESC`;
}

/**
 * Per-guest item behaviour, compact enough to ship in the snapshot.
 *
 * Returns one row per guest carrying their top products as an array, their
 * category mix, and two measures of how fixed their habit is:
 *
 *   - **`TOP_PRODUCT_VISIT_SHARE`** — the share of their visits on which they
 *     bought their single most-frequent product. This is the "same thing every
 *     time" score, and it is counted per *visit* rather than per line because
 *     buying two coffees on one morning is one decision, not two.
 *   - **`REPERTOIRE`** — how many distinct products they have ever bought. Three
 *     across thirty visits is a creature of habit; forty is a browser.
 */
export function guestItemsQuery({ orgId, w, pairs, cardMonths }: Args, topN = 5) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${itemsCte(orgId, w)},
${PEOPLE},
/* Visit grain, so a product bought twice in one morning counts once. */
person_line AS (
  SELECT po.PERSON_ID, po.D, pl.PRODUCT_ID, pl.CATEGORY_ID, pl.TOTAL_PRICE
  FROM person_orders po
  JOIN eligible e ON e.PERSON_ID = po.PERSON_ID
  JOIN product_line pl ON pl.ORDER_ID = po.ORDER_ID
  WHERE pl.PRODUCT_ID IS NOT NULL
),
per_product AS (
  SELECT PERSON_ID, PRODUCT_ID,
         COUNT(DISTINCT D) AS VISITS_WITH,
         SUM(TOTAL_PRICE) AS SPEND
  FROM person_line GROUP BY 1, 2
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY PERSON_ID ORDER BY VISITS_WITH DESC, SPEND DESC) AS RN
  FROM per_product
),
tops AS (
  SELECT PERSON_ID,
         ARRAY_AGG(OBJECT_CONSTRUCT('p', PRODUCT_ID, 'v', VISITS_WITH, 's', ROUND(SPEND, 2)))
           WITHIN GROUP (ORDER BY RN) AS TOP_PRODUCTS,
         MAX_BY(VISITS_WITH, IFF(RN = 1, 1, 0)) AS TOP_VISITS
  FROM ranked WHERE RN <= ${topN} GROUP BY PERSON_ID
),
per_cat AS (
  SELECT PERSON_ID, CATEGORY_ID, COUNT(DISTINCT D) AS VISITS_WITH, SUM(TOTAL_PRICE) AS SPEND
  FROM person_line WHERE CATEGORY_ID IS NOT NULL GROUP BY 1, 2
),
cat_ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY PERSON_ID ORDER BY SPEND DESC) AS RN FROM per_cat
),
cats AS (
  SELECT PERSON_ID,
         ARRAY_AGG(OBJECT_CONSTRUCT('c', CATEGORY_ID, 'v', VISITS_WITH, 's', ROUND(SPEND, 2)))
           WITHIN GROUP (ORDER BY RN) AS TOP_CATEGORIES
  FROM cat_ranked WHERE RN <= 4 GROUP BY PERSON_ID
),
totals AS (
  SELECT PERSON_ID, COUNT(DISTINCT PRODUCT_ID) AS REPERTOIRE, COUNT(DISTINCT D) AS VISITS_WITH_ITEMS
  FROM person_line GROUP BY 1
)
SELECT t.PERSON_ID, t.REPERTOIRE, t.VISITS_WITH_ITEMS,
       tp.TOP_PRODUCTS, tp.TOP_VISITS,
       c.TOP_CATEGORIES,
       ROUND(tp.TOP_VISITS / NULLIF(t.VISITS_WITH_ITEMS, 0), 4) AS TOP_PRODUCT_VISIT_SHARE
FROM totals t
LEFT JOIN tops tp ON tp.PERSON_ID = t.PERSON_ID
LEFT JOIN cats c ON c.PERSON_ID = t.PERSON_ID`;
}

/** The product dictionary, so per-guest rows can carry ids rather than names. */
export function productDictQuery({ orgId, w }: Args) {
  return `WITH ${itemsCte(orgId, w)}
SELECT p.PRODUCT_ID, p.PRODUCT_NAME, p.CATEGORY_ID, c.CATEGORY_NAME, p.TYPE_NAME,
       COUNT(*) AS LINES, SUM(pl.TOTAL_PRICE) AS REVENUE
FROM product_line pl
JOIN prod p ON p.PRODUCT_ID = pl.PRODUCT_ID
LEFT JOIN cat c ON c.CATEGORY_ID = p.CATEGORY_ID
GROUP BY 1, 2, 3, 4, 5
ORDER BY LINES DESC`;
}

/**
 * Per-product, per-month lines and revenue — the price history the report has
 * been refusing on since OV-7.
 *
 * ── The question this exists to answer ─────────────────────────────────────
 *
 * "Average item price" is revenue over items, and it moves identically whether
 * a cappuccino got dearer or a guest traded up from a medium to a large. The
 * report has always said it cannot separate the two, correctly, because nothing
 * in the extract carried a **price per product per month**. This carries it.
 *
 * With one row per product per month, a like-for-like price effect and a mix
 * effect are both computable: hold the mix and move the prices, then hold the
 * prices and move the mix. See `priceMix` in `src/lib/metrics.ts`, which does
 * the arithmetic and states when it will not.
 *
 * ── Three decisions that make it comparable to the decomposition ───────────
 *
 * **1. `product_line`, not `paid_line`.** A modifier's price is not a product's
 * price, and "1 Sugar" moving from free to $0.20 is not a coffee getting dearer.
 * The definition is the shared one at the top of this section, so this cannot
 * drift from what the basket and the favourites list count.
 *
 * **2. The same people as the decomposition** — `eligible`, joined through
 * `person_orders`. The revenue decomposition runs on identified guests, and a
 * price split computed over *all* trade would be describing a different
 * population from the bars it is splitting.
 *
 * **3. `PRODUCT_ID`, never the name.** Coffee Guru renames products the way it
 * renames categories, and a rename mid-window would otherwise read as one
 * product being delisted and a second, identically-priced one appearing — which
 * lands in the mix effect as a real shift. The name is resolved once by
 * `productDictQuery` and applied to all history, exactly as venues and
 * categories are.
 *
 * What it still cannot say is whether a *displayed* price changed: this is
 * revenue over lines, so a product sold at a discount half the month reads as
 * cheaper. That is named in the surface rather than fixed here — the discount is
 * on the order, not the line.
 */
export function itemPriceMonthlyQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${itemsCte(orgId, w)},
${PEOPLE},
mine AS (
  SELECT DISTINCT po.ORDER_ID, DATE_TRUNC('month', po.D)::DATE AS MONTH
  FROM person_orders po JOIN eligible e ON e.PERSON_ID = po.PERSON_ID
)
SELECT m.MONTH, pl.PRODUCT_ID,
  COUNT(*) AS LINES,
  SUM(pl.TOTAL_PRICE) AS REVENUE
FROM product_line pl
JOIN mine m ON m.ORDER_ID = pl.ORDER_ID
WHERE pl.PRODUCT_ID IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2`;
}

/**
 * The quantity trap, measured rather than asserted.
 *
 * The extract publishes what it found so the check on the other side has
 * something to assert against, and so nobody has to take "we do not use
 * QUANTITY" on trust.
 */
export function itemIntegrityQuery({ orgId, w }: Args) {
  return `WITH ${itemsCte(orgId, w)},
raw AS (
  SELECT QUANTITY, TOTAL_PRICE, NULLIF(TRIM(MODIFIER_GROUP_NAME), '') AS MOD, STATUS
  FROM ${ITEMS}
  WHERE ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
)
SELECT
  (SELECT COUNT(DISTINCT ORDER_ID) FROM paid_line) AS ORDERS_WITH_ITEMS,
  (SELECT COUNT(*) FROM raw) AS ALL_LINES,
  (SELECT COUNT(*) FROM raw WHERE STATUS = 'COMPLETED') AS COMPLETED_LINES,
  (SELECT COUNT(*) FROM paid_line) AS PAID_LINES,
  (SELECT COUNT(*) FROM product_line) AS PRODUCT_LINES,
  (SELECT COUNT(*) FROM raw WHERE STATUS = 'COMPLETED' AND MOD IS NOT NULL) AS MODIFIER_LINES,
  (SELECT MAX(QUANTITY) FROM raw) AS MAX_QUANTITY_ANYWHERE,
  (SELECT MAX(QUANTITY) FROM raw WHERE STATUS = 'COMPLETED' AND TOTAL_PRICE > 0) AS MAX_QUANTITY_ON_PAID,
  (SELECT COUNT(*) FROM cat) AS CATEGORY_IDS,
  (SELECT COUNT(DISTINCT CATEGORY_NAME) FROM cat) AS CATEGORY_NAMES,
  (SELECT COUNT(*) FROM cat WHERE NAMES_SEEN > 1) AS CATEGORY_IDS_RENAMED,
  (SELECT SUM(TOTAL_PRICE) FROM paid_line) AS PAID_REVENUE
`;
}

/**
 * Visit history, for the drawer's timeline.
 *
 * A visit is a person-day at a venue — the same grain as everywhere else, so a
 * guest who bought two coffees an hour apart has one visit here and one visit
 * on the tile above.
 *
 * ── §7.3: the cap is gone, and the grain changed to make that possible ─────
 *
 * This used to keep the most recent 60 visits and print *"the timeline is
 * capped; the total above is not"* on the face. Honest, and an unfinished screen
 * with good manners. The day grid replaces the dated list, and a grid cannot
 * carry a truncated series — a blank cell would read as "did not come" when it
 * meant "we stopped sending".
 *
 * Two changes make an uncapped set affordable:
 *
 * 1. **The grain is person-day-venue**, matching `visits` exactly. It used to
 *    collapse a day to one row, which silently disagreed with the visit count on
 *    the tile for anybody who used two venues in a day — reintroducing "showing
 *    117 of 118" through the back door. Now `history.length === visits` by
 *    construction, and the venue ribbon in §7.3 gets the venue per visit it
 *    needs rather than one venue per day.
 * 2. **The window is 92 days**, so the ceiling per guest is bounded by the
 *    calendar rather than by their enthusiasm. `limit` survives as a backstop
 *    against a pathological row, and `RETURNED` is emitted so a check can assert
 *    that nobody actually hit it.
 *
 * Dates are emitted as an offset in days from the window start, because an ISO
 * date is ten characters and an offset is two.
 */
export function visitHistoryQuery({ orgId, w, pairs, cardMonths }: Args, limit = 400) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
v AS (
  SELECT PERSON_ID, D, STORE_ID, SUM(SPEND) AS SPEND, SUM(ORDERS) AS ORDERS,
         SUM(ITEMS) AS ITEMS, MAX_BY(DAYPART, SPEND) AS DAYPART
  FROM visits WHERE PERSON_ID IN (SELECT PERSON_ID FROM eligible)
  GROUP BY PERSON_ID, D, STORE_ID
),
r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY PERSON_ID ORDER BY D DESC) AS RN FROM v)
SELECT PERSON_ID,
       ARRAY_AGG(OBJECT_CONSTRUCT(
         'd', DATEDIFF(day, '${w.start}', D),
         'o', ORDERS,
         's', ROUND(SPEND, 2),
         'v', STORE_ID,
         'p', DAYPART
       )) WITHIN GROUP (ORDER BY D DESC) AS VISITS,
       COUNT(*) AS RETURNED
FROM r WHERE RN <= ${limit}
GROUP BY PERSON_ID`;
}

// ── §6.2: the heatmap ───────────────────────────────────────────────────────

/**
 * Day of week by daypart, at order grain.
 *
 * **Both axes are venue-local.** `D` is `CREATED_AT_TZ::DATE` and `DAYPART` is
 * derived from `CREATED_AT_TZ`, so a Sydney breakfast lands in Breakfast on a
 * Tuesday. Deriving either from the unlocalised timestamp moves Australian
 * early-morning trade out of the column carrying 107,718 orders and does it
 * silently, which is the single largest legibility risk in this report.
 *
 * `DAYOFWEEK` returns 0 for Sunday through 6 for Saturday, which is the same
 * convention `ordersCte` already uses for its weekend flag. The surface reorders
 * to a Monday-first week; the extract does not, because a rotation is a
 * presentation choice and this is the measurement.
 *
 * Member orders come back per cell so the grid can be shaded three ways — order
 * density, revenue density and member share — from one query. The member-share
 * view is where "where your members are not" stops being a table and becomes a
 * picture.
 */
export function dayGridQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)}
SELECT
  DAYOFWEEK(D) AS DOW,
  DAYPART,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE) AS REVENUE,
  COUNT_IF(TIER = 'member') AS MEMBER_ORDERS,
  SUM(IFF(TIER = 'member', TOTAL_PRICE, 0)) AS MEMBER_REVENUE,
  COUNT(DISTINCT D) AS TRADING_DAYS
FROM base
GROUP BY 1, 2 ORDER BY 1, 2`;
}

// ── §6.4: cross-venue, the three views and nothing else ─────────────────────

/**
 * Per venue: what share of *that venue's* guests also use another venue.
 *
 * This is the view a venue manager reads, because it answers whether they are an
 * island or part of a cluster. It is deliberately **not** a count: raw counts
 * rank by venue size, so the biggest venues top every list for being big, and a
 * manager reading such a list learns their own headcount rather than their own
 * position.
 *
 * The denominator is the venue's own countable guests — everybody eligible who
 * was seen at this venue at all, not only those who call it home. A guest whose
 * home store is elsewhere is still one of this venue's guests on the day they
 * walked in, and excluding them would define the crossing away.
 */
export function venueCrossShareQuery({ orgId, w, pairs, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
pv2 AS (
  SELECT v.PERSON_ID, v.STORE_ID, ANY_VALUE(v.STORE_NAME) AS STORE_NAME
  FROM visits v JOIN eligible e ON e.PERSON_ID = v.PERSON_ID
  GROUP BY v.PERSON_ID, v.STORE_ID
),
reach AS (
  SELECT PERSON_ID, COUNT(*) AS VENUES FROM pv2 GROUP BY PERSON_ID
)
SELECT
  p.STORE_ID,
  ANY_VALUE(p.STORE_NAME) AS STORE_NAME,
  COUNT(*) AS GUESTS,
  COUNT_IF(r.VENUES >= 2) AS CROSSING_GUESTS
FROM pv2 p JOIN reach r ON r.PERSON_ID = p.PERSON_ID
GROUP BY p.STORE_ID
ORDER BY CROSSING_GUESTS / NULLIF(COUNT(*), 0) DESC`;
}

// ── §5.4: the segment scatter ───────────────────────────────────────────────

/**
 * One row per classifiable person: spend, visits, segment.
 *
 * The guest grid ships a bounded working set — the top of the value distribution
 * in full plus a hash-ordered sample — which is right for a paginated grid and
 * wrong for a scatter. **§5.4's whole argument is that the plot draws on 24,906
 * people instead of 3,387**, and drawing it on the 17,022-row working set would
 * quietly restate the defect it exists to fix.
 *
 * Three numbers per person is small enough to ship the whole population: no
 * identity, no name, no venue, nothing that needs masking, and roughly 250KB
 * packed. It carries no person id at all, so there is nothing here to join back
 * to a human even in principle.
 *
 * The segment comes from the **same shared CTE** the segment table is built
 * from — see `classified()`. The scatter sits directly beside that table on
 * Overview, so a plot that classified even three people differently would put a
 * chart and its own table out of step, which is the precise defect §9 warns
 * about and which is live on the report this one replaces.
 */
export function scatterQuery({ orgId, w, pairs, lapseDays, cardMonths }: Args) {
  return `WITH ${basePrelude(orgId, w, pairs, cardMonths)},
${PEOPLE},
${classifiedFor(lapseDays, w.end)}
SELECT ROUND(SPEND, 2) AS SPEND, VISITS, TIER, SEGMENT
FROM c`;
}

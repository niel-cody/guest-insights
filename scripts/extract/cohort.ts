/**
 * The member-tier cohort lens. §6.5.
 *
 * ── Why this is a separate module ──────────────────────────────────────────
 *
 * Everything else in the extract hangs off the card spine and the 92-day card
 * window. This does not. It runs on the loyalty scan, over 21 months, and it is
 * **a different population on a different clock** — which is exactly why §4.3
 * forbids a figure that spans the two, and why this is a separate file writing a
 * separate snapshot rather than another query bolted onto `queries.ts`.
 *
 * The output is written once per org, not once per card period, because the
 * member window is not a card period and filing it under one would invite
 * precisely the cross-tier read the rule exists to stop.
 *
 * ── What "survival" means here, stated once ────────────────────────────────
 *
 * A cohort is the calendar month a member is **first seen scanning**. A member
 * is *active in month m* if they have at least one scanned order in that month.
 * Survival at k months is active-at-k over cohort size.
 *
 * There is no second definition anywhere. The triangle, the curve and the tenure
 * bars are three renderings of this one object, so they cannot disagree — the
 * failure that produced eighteen contradicting counts in build v1.
 *
 * ── The censor boundary is a first-class output, not a caption ─────────────
 *
 * A cohort formed in Jun 2026 cannot be observed at 12 months, because 12 months
 * have not happened. Its cell is **absent**, never zero. `observableMonths` per
 * cohort is emitted so the surface can draw the boundary rather than describe it,
 * which is §6.5 rule 2 and the reason this is data rather than prose.
 */
import { CANONICAL_LAPSE_DAYS } from "./orgs";

const ORDERS = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS";

/**
 * The member spine. Scans only, and `NULLIF(TRIM(CUSTOMER_ID), '')` — never
 * `COUNT()`, which returns 100.00% on a column that is an empty string and never
 * NULL. That trap has cost this project a rebuild once already.
 *
 * A visit is a member-day, matching the card tier's person-day grain, so "visits"
 * means the same thing on both sides of the wall even though the populations do
 * not overlap.
 */
function memberPrelude(orgId: string, from: string, to: string) {
  return `ord AS (
  SELECT
    NULLIF(TRIM(CUSTOMER_ID), '') AS MEMBER_ID,
    CREATED_AT_TZ::DATE AS D,
    STORE_ID,
    TOTAL_PRICE
  FROM ${ORDERS}
  WHERE ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${from}' AND CREATED_AT_TZ < '${to}'
    AND ORDER_STATUS = 'COMPLETED'
    AND COALESCE(IS_TRAINING, FALSE) = FALSE
    AND TOTAL_PRICE > 0
    AND NULLIF(TRIM(CUSTOMER_ID), '') IS NOT NULL
),
mv AS (
  SELECT MEMBER_ID, D, SUM(TOTAL_PRICE) AS SPEND, COUNT(*) AS ORDERS
  FROM ord GROUP BY 1, 2
),
mp AS (
  SELECT MEMBER_ID,
         MIN(D) AS FIRST_SEEN,
         MAX(D) AS LAST_SEEN,
         DATEDIFF(day, MIN(D), MAX(D)) AS TENURE_DAYS,
         COUNT(*) AS VISITS,
         SUM(SPEND) AS SPEND
  FROM mv GROUP BY 1
)`;
}

/**
 * The triangle. One row per (cohort, months since first seen).
 *
 * `ACTIVE` counts distinct members of that cohort seen in that month. Cells the
 * window has not reached simply do not appear — they are never emitted as zero,
 * because a zero here would render as total collapse rather than as the calendar
 * running out.
 */
export function cohortTriangleQuery(orgId: string, from: string, to: string) {
  return `WITH ${memberPrelude(orgId, from, to)}
SELECT
  DATE_TRUNC('month', mp.FIRST_SEEN)::DATE AS COHORT,
  DATEDIFF(month, DATE_TRUNC('month', mp.FIRST_SEEN), DATE_TRUNC('month', mv.D)) AS MONTHS_SINCE,
  COUNT(DISTINCT mv.MEMBER_ID) AS ACTIVE,
  SUM(mv.SPEND) AS SPEND
FROM mv JOIN mp ON mp.MEMBER_ID = mv.MEMBER_ID
GROUP BY 1, 2
ORDER BY 1, 2`;
}

/**
 * Cohort sizes and tenure.
 *
 * Tenure is first-seen to last-seen and is **right-censored by the window end**,
 * so it is a floor on the real relationship rather than an estimate of it. A
 * member still coming in on the last day of the window has a tenure that stopped
 * being measured, not a relationship that ended, and the surface says so.
 */
export function cohortSizeQuery(orgId: string, from: string, to: string) {
  return `WITH ${memberPrelude(orgId, from, to)}
SELECT
  DATE_TRUNC('month', FIRST_SEEN)::DATE AS COHORT,
  COUNT(*) AS MEMBERS,
  AVG(TENURE_DAYS) AS AVG_TENURE_DAYS,
  MEDIAN(TENURE_DAYS) AS MEDIAN_TENURE_DAYS,
  AVG(VISITS) AS AVG_VISITS,
  SUM(SPEND) AS SPEND,
  /* Still coming at the window's close, so their tenure is censored rather than
     complete. Published beside the average because an average tenure computed
     over a population that is 40% censored is a different quantity from one that
     is not. */
  COUNT_IF(DATEDIFF(day, LAST_SEEN, '${to}') <= ${CANONICAL_LAPSE_DAYS}) AS STILL_ACTIVE
FROM mp
GROUP BY 1 ORDER BY 1`;
}

/**
 * The inter-visit gap, as a distribution rather than a mean.
 *
 * "Usual gap 1 day" is a median standing in for a distribution, and the spread is
 * what says whether a cadence is a habit or the average of two behaviours. The
 * mean of a bimodal gap distribution describes nobody in it.
 *
 * Capped at a year: beyond that the tail is a handful of returns and the shape is
 * unreadable. The cap is emitted so the surface can state it.
 */
export function cohortGapQuery(orgId: string, from: string, to: string, capDays = 365) {
  return `WITH ${memberPrelude(orgId, from, to)},
gaps AS (
  SELECT DATEDIFF(day, LAG(D) OVER (PARTITION BY MEMBER_ID ORDER BY D), D) AS G
  FROM mv
)
SELECT G AS DAYS, COUNT(*) AS N
FROM gaps WHERE G IS NOT NULL AND G <= ${capDays}
GROUP BY 1 ORDER BY 1`;
}

/**
 * Monthly member coverage, carried into the cohort file on purpose.
 *
 * §6.5 rule 3 forbids publishing the falling-cohort-quality trend, because
 * six-month survival falls across the run **while coverage rises over the same
 * period** — so later cohorts include marginal members the early ones never
 * captured, and the two effects are not separated. The surface strikes the trend
 * through and shows the reason, which means the reason has to be in the same file
 * as the trend. A confound named in a comment is a confound nobody sees.
 */
export function memberCoverageQuery(orgId: string, from: string, to: string) {
  return `WITH o AS (
  SELECT DATE_TRUNC('month', CREATED_AT_TZ)::DATE AS MONTH,
         NULLIF(TRIM(CUSTOMER_ID), '') AS MEMBER_ID
  FROM ${ORDERS}
  WHERE ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${from}' AND CREATED_AT_TZ < '${to}'
    AND ORDER_STATUS = 'COMPLETED'
    AND COALESCE(IS_TRAINING, FALSE) = FALSE
    AND TOTAL_PRICE > 0
)
SELECT MONTH,
  COUNT(*) AS ORDERS,
  COUNT_IF(MEMBER_ID IS NOT NULL) AS WITH_MEMBER,
  COUNT(DISTINCT MEMBER_ID) AS DISTINCT_MEMBERS
FROM o GROUP BY 1 ORDER BY 1`;
}

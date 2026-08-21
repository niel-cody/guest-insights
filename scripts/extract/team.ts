/**
 * The team half of the snapshot: who works, what they cost, what they produce.
 *
 * ── The one thing this file exists to solve ────────────────────────────────
 *
 * `ORDERS` is keyed on the POS user id. `ROSTER_COSTS` is keyed on the
 * workforce vendor's employee id. **Nothing joins them.** At Meat Flour Wine
 * there are 53 POS identities and 83 Tanda employee records and the intersection
 * on id is empty — not sparse, empty. Every question worth asking of this data
 * — what does this person cost against what they produce, who should work Friday
 * dinner, what is the return on this labour hour — sits behind that one join.
 *
 * So the first thing in here is a matcher, and the second thing is an honest
 * account of what the matcher could not do. The product is the review queue, not
 * a merged table presented as though the merge were free.
 *
 * ── What is deliberately not computed ──────────────────────────────────────
 *
 * **Gross profit per person.** `TOTAL_COST_PRICE` is above zero on 296 of 9,410
 * Meat Flour Wine orders — 3.1%. Margin here therefore means *margin after
 * labour*, which is net sales minus wage cost, and it is named that everywhere
 * it appears. Asking for gross margin per employee today is asking for a
 * menu-costing programme, and dividing by a denominator that is 97% absent
 * produces a confident number about nothing.
 *
 * ── Names ──────────────────────────────────────────────────────────────────
 *
 * Employees are people, and this snapshot is committed to a repository. So the
 * same rule the guest extract follows applies here: **no real name leaves the
 * warehouse.** Names are pseudonymised through the salted hash, and the
 * substitution is *shape-preserving* — the matcher runs on the real strings, and
 * the synthetic pair carries the same evidence the real pair carried. A real
 * "Chloe H" against "Chloe Hardwick" becomes a synthetic pair whose surname
 * initial also agrees; a real "Kenisha M" against "Kenisha SW" becomes a pair
 * whose second token still tells you nothing. Role codes (`SW`, `FR`, `Chef`,
 * `Bar`) are not personal data and pass through verbatim, because they are half
 * of why the join is hard and hiding them would hide the finding.
 */
import { DAYPARTS, daypartCase } from "./orgs";
import { itemsCte } from "./queries";

const P = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC";
const ORDERS = `${P}.ORDERS`;

export type Window = { start: string; end: string };

const list = (xs: string[]) => xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");

/**
 * Clean order grain, restated for the team half.
 *
 * Identical filters to `ordersCte` — completed, non-training, positive value —
 * because a staff figure that counts a different set of orders than the customer
 * report is a figure the operator cannot reconcile against their own sales
 * report, and that is the fastest way to lose them.
 *
 * `TOTAL_PRICE - TOTAL_TAX` is net sales. The customer half of this build works
 * in `TOTAL_PRICE` because it is comparing people to people and the tax cancels;
 * wage percentage does not cancel, and every published labour ratio in the
 * industry is struck against ex-tax net sales.
 */
function orderBase(orgId: string, w: Window) {
  return `ORGANIZATION_ID = '${orgId}'
    AND CREATED_AT_TZ >= '${w.start}' AND CREATED_AT_TZ < DATEADD(day, 1, '${w.end}')
    AND ORDER_STATUS = 'COMPLETED'
    AND COALESCE(IS_TRAINING, FALSE) = FALSE
    AND TOTAL_PRICE > 0`;
}

/**
 * One row per POS identity, keyed on **who the sale belonged to**.
 *
 * ── It is `ASSIGNED_TO_ID`, and it used to be `CREATED_BY_ID` ──────────────
 *
 * `CREATED_BY_ID` names whoever opened the order. `ASSIGNED_TO_ID` names the
 * person it was assigned to — the server who owns the table. They disagree on
 * 1.5% of orders at a counter business, 16% at one restaurant and 58% at
 * another, because a host or a manager opens a table and the section's server
 * works it.
 *
 * Every rate on the Performance report — net per cover, items per cover,
 * average item value — was therefore being attached to the wrong human being on
 * a sixth of one merchant's trade and more than half of another's. That is the
 * same defect as ranking on net sales, one level down: **a figure that measures
 * who opens orders and is read as a measure of who sells.**
 *
 * The column is populated on every completed order at all three organisations
 * and draws from the same identity pool — one id at each appears as an assignee
 * and never as a creator, which is inside the noise the spine already reports.
 *
 * A blank assignee name is a shared terminal, a kiosk or a training login.
 * `SHARED_LOGIN` already classifies those as not-a-person and holds them out of
 * every rate; here they simply arrive with no name, exactly as they did before.
 */
export function posStaffQuery(orgId: string, w: Window) {
  return `SELECT
  ASSIGNED_TO_ID AS POS_ID,
  MAX_BY(ASSIGNED_TO_NAME, CREATED_AT_TZ) AS POS_NAME,
  MAX_BY(STORE_ID, CREATED_AT_TZ) AS STORE_ID,
  COUNT(DISTINCT STORE_ID) AS STORES,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE - COALESCE(TOTAL_TAX, 0)) AS NET,
  SUM(ITEMS_COUNT) AS ITEMS,
  SUM(COALESCE(NULLIF(TABLE_GUEST_COUNT, 0), 0)) AS COVERS,
  COUNT_IF(NULLIF(TABLE_GUEST_COUNT, 0) IS NOT NULL) AS ORDERS_WITH_COVERS,
  /*
    Seated orders — the only ones a party size was ever owed on.

    Per-cover rates are struck over these rather than over every order, because
    a server's takeaway coffees have no covers to divide by and dragging them
    into the denominator understates the rate of anyone who works a counter
    shift. It is the same restriction the covers framework applies everywhere
    else, expressed per person.
  */
  COUNT_IF(NULLIF(TRIM(TABLE_NAME), '') IS NOT NULL) AS ORDERS_SEATED,
  SUM(IFF(NULLIF(TRIM(TABLE_NAME), '') IS NOT NULL, TOTAL_PRICE - COALESCE(TOTAL_TAX, 0), 0)) AS SEATED_NET,
  SUM(IFF(NULLIF(TRIM(TABLE_NAME), '') IS NOT NULL, ITEMS_COUNT, 0)) AS SEATED_ITEMS,
  SUM(COALESCE(TOTAL_DISCOUNT, 0)) AS DISCOUNT,
  COUNT(DISTINCT CREATED_AT_TZ::DATE) AS DAYS,
  COUNT_IF(TOTAL_COST_PRICE > 0) AS ORDERS_WITH_COST
FROM ${ORDERS}
WHERE ${orderBase(orgId, w)} AND ASSIGNED_TO_ID IS NOT NULL
GROUP BY 1`;
}

/** Per identity, per weekday, per daypart. Question 2: are they better at different times? */
export function posStaffGrainQuery(orgId: string, w: Window) {
  return `SELECT
  ASSIGNED_TO_ID AS POS_ID,
  DAYOFWEEK(CREATED_AT_TZ) AS DOW,
  ${daypartCase("CREATED_AT_TZ")} AS DAYPART,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE - COALESCE(TOTAL_TAX, 0)) AS NET,
  SUM(ITEMS_COUNT) AS ITEMS,
  SUM(COALESCE(NULLIF(TABLE_GUEST_COUNT, 0), 0)) AS COVERS
FROM ${ORDERS}
WHERE ${orderBase(orgId, w)} AND ASSIGNED_TO_ID IS NOT NULL
GROUP BY 1, 2, 3`;
}

/**
 * What each POS identity actually sold, by category.
 *
 * ── The question this answers, and the one it cannot ───────────────────────
 *
 * Performance already decomposes net per cover into items per cover times
 * average item value, and says which of the two is moving. This is the level
 * below: **average item value is a mix.** A server with a high average item
 * value is selling steak and wine; one with a high items-per-cover is selling
 * sides and desserts. Both can arrive at the same revenue per cover, and they
 * are not the same person to coach.
 *
 * The join is `ORDER_ITEMS.ORDER_ID` to `ORDERS.ORDER_ID`, and the staff
 * identity comes off the order header — but **not from `CREATED_BY_ID`**, which
 * is where this started and was wrong.
 *
 * `CREATED_BY_ID` is whoever opened the order. At Meat Flour Wine that is a
 * different person from the one the order is assigned to on 1,512 of 9,410
 * orders, and at Amalfi on 15,689 of 27,114 — a manager or host opens the
 * table, the section's server owns it. Crediting the opener would have ranked
 * **who opens tables**, which is a roster fact wearing a skill label and the
 * exact defect this report was built to refuse.
 *
 * `ASSIGNED_TO_ID` is the order's owner. It is populated on every completed
 * order at all three organisations and it draws from the same identity pool —
 * one id at each org appears as an assignee and never as a creator. At Coffee
 * Guru, a counter business, the two columns agree on 98.5% of orders, which is
 * what a correct column looks like where one person really does ring and own
 * the sale.
 *
 * ── What this attribution does and does not claim ──────────────────────────
 *
 * It credits a **whole basket to the server the order was assigned to**. That
 * is how a venue credits a sale and how a server would expect to be measured.
 * It is *not* a claim about who physically keyed each line, and nothing here
 * should be worded as though it were: line-level authorship is not in the
 * warehouse at all — `ORDER_ITEMS` carries no creator column, only `ORDER_ID`,
 * product, price and a timestamp.
 *
 * Reads the shared `itemsCte` rather than restating the filters. The three
 * traps documented there — the mis-keyed quantity, the unreliable modifier
 * flag, the category name that is not the key — apply here identically, and a
 * second copy of that logic would drift from the customer half's category mix
 * and leave two answers to "how much dessert did this venue sell".
 */
export function posStaffMixQuery(orgId: string, w: Window) {
  return `WITH ${itemsCte(orgId, w)},
staff_order AS (
  SELECT ORDER_ID, ASSIGNED_TO_ID AS POS_ID
  FROM ${ORDERS}
  WHERE ${orderBase(orgId, w)} AND ASSIGNED_TO_ID IS NOT NULL
),
lines AS (
  SELECT s.POS_ID, p.CATEGORY_ID, p.CATEGORY_NAME, p.TYPE_NAME,
         p.TOTAL_PRICE, p.IS_PRODUCT, p.ORDER_ID
  FROM paid_line p JOIN staff_order s ON s.ORDER_ID = p.ORDER_ID
)
SELECT
  POS_ID,
  COALESCE(CATEGORY_ID, '(uncategorised)') AS CATEGORY_ID,
  COALESCE(MAX(CATEGORY_NAME), 'Uncategorised') AS CATEGORY_NAME,
  MAX(TYPE_NAME) AS TYPE_NAME,
  COUNT_IF(IS_PRODUCT) AS PRODUCT_LINES,
  COUNT(*) AS PAID_LINES,
  SUM(TOTAL_PRICE) AS REVENUE,
  COUNT(DISTINCT ORDER_ID) AS ORDERS
FROM lines
GROUP BY POS_ID, CATEGORY_ID`;
}

/**
 * Which of the order header's two staff columns is the seller?
 *
 * ── This replaced a probe that asked the wrong question ────────────────────
 *
 * The first version compared each item line's timestamp to its order's, on the
 * theory that lines rung long after the order opened belonged to somebody else.
 * It returned an alarming result — 23.5% of paid lines at Meat Flour Wine
 * appeared to *predate* the order they sat on — and the alarm was an artefact
 * of the question. The header sits inside its own line span on 84% of orders
 * and within the same clock hour as its first line on 99% of them, so the
 * timing tells you a long table is a long table and nothing about authorship.
 *
 * Authorship was never a timing question. It is a column question, and the
 * column exists: `ASSIGNED_TO_ID` names the order's owner where
 * `CREATED_BY_ID` names whoever opened it.
 *
 * What this measures is whether that column can be leant on:
 *
 *   - **Coverage.** An order with no assignee is credited to nobody and drops
 *     out of every per-person figure. At Amalfi roughly a third of orders sit
 *     on an unnamed login, which the shared-login rule already classifies as
 *     not a person — that is a finding about how the venue rings, not a fault.
 *   - **Disagreement.** How often the assignee differs from the creator. Near
 *     zero at a counter and high in table service is the column behaving; the
 *     reverse would mean it is not what it appears to be.
 *   - **Pool.** Assignee ids that never appear as a creator are people the
 *     identity spine has never seen, and their trade cannot be costed.
 */
export function posAttributionProbeQuery(orgId: string, w: Window) {
  return `SELECT
  COUNT(*) AS ORDERS,
  COUNT_IF(ASSIGNED_TO_ID IS NOT NULL) AS ORDERS_ASSIGNED,
  COUNT_IF(CREATED_BY_ID IS NOT NULL) AS ORDERS_CREATED,
  COUNT_IF(ASSIGNED_TO_ID IS NOT NULL AND ASSIGNED_TO_ID <> CREATED_BY_ID) AS ASSIGNED_DIFFERS,
  /* A blank name is a shared terminal, a kiosk or a training login. The
     shared-login rule already holds those out of every per-person figure; they
     are counted here so the share of trade nobody owns is visible rather than
     silently missing from the bottom of a league table. */
  COUNT_IF(NULLIF(TRIM(ASSIGNED_TO_NAME), '') IS NULL) AS ORDERS_ASSIGNED_UNNAMED,
  SUM(IFF(NULLIF(TRIM(ASSIGNED_TO_NAME), '') IS NULL, TOTAL_PRICE - COALESCE(TOTAL_TAX, 0), 0)) AS UNNAMED_NET,
  SUM(TOTAL_PRICE - COALESCE(TOTAL_TAX, 0)) AS NET,
  COUNT(DISTINCT CREATED_BY_ID) AS CREATED_IDENTITIES,
  COUNT(DISTINCT ASSIGNED_TO_ID) AS ASSIGNED_IDENTITIES
FROM ${ORDERS}
WHERE ${orderBase(orgId, w)}`;
}

/**
 * Can a paid modifier be told from a product at this organisation?
 *
 * ── The attachment rate is not published until this says yes ───────────────
 *
 * "Which staff have the highest paid-modifier attachment rate" is the sharpest
 * question in the brief and the one the data is least ready for. The only
 * marker available is `MODIFIER_GROUP_NAME`, and `itemsCte` already records it
 * failing at Coffee Guru: "1 Sugar" appears 25,981 times and is flagged on
 * 2,480 of them. A rate computed on a marker that catches a tenth of its
 * subject is not a measurement.
 *
 * Worse, the error would not be random. Whether a modifier gets flagged depends
 * on how the item was configured and how it was rung — which varies by person,
 * by venue and by till. **The noise would sit on exactly the axis the report
 * claims to measure**, so a staff ranking built on it would be confidently
 * ranking keying habits and calling it upselling.
 *
 * The test is the ambiguous name: a product name that appears both flagged and
 * unflagged is the marker failing on its own terms, because the same thing
 * cannot be a modifier on one line and a product on the next. Two numbers come
 * back — how many names, and how much money sits on them. A handful of names
 * carrying a rounding error is survivable; a tenth of revenue is not.
 */
export function modifierFlagProbeQuery(orgId: string, w: Window) {
  return `WITH ${itemsCte(orgId, w)},
by_name AS (
  SELECT
    PRODUCT_NAME,
    COUNT(*) AS LINES,
    SUM(TOTAL_PRICE) AS REVENUE,
    COUNT_IF(IS_PRODUCT) AS AS_PRODUCT,
    COUNT_IF(NOT IS_PRODUCT) AS AS_MODIFIER
  FROM paid_line
  WHERE PRODUCT_NAME IS NOT NULL
  GROUP BY PRODUCT_NAME
)
SELECT
  COUNT(*) AS NAMES,
  COUNT_IF(AS_PRODUCT > 0 AND AS_MODIFIER > 0) AS AMBIGUOUS_NAMES,
  SUM(LINES) AS PAID_LINES,
  SUM(IFF(AS_PRODUCT > 0 AND AS_MODIFIER > 0, LINES, 0)) AS AMBIGUOUS_LINES,
  SUM(REVENUE) AS PAID_REVENUE,
  SUM(IFF(AS_PRODUCT > 0 AND AS_MODIFIER > 0, REVENUE, 0)) AS AMBIGUOUS_REVENUE,
  SUM(IFF(NOT (AS_PRODUCT > 0 AND AS_MODIFIER > 0) AND AS_MODIFIER > 0, LINES, 0)) AS CLEAN_MODIFIER_LINES
FROM by_name`;
}

/**
 * Venue trade at the finest grain both sides of the ratio share.
 *
 * One time key. The day part is the primitive; the group a wage percentage is
 * struck against is a union of day parts and is derived from it, so there is no
 * second classification here to fall out of step with the first.
 */
export function salesGrainQuery(orgId: string, w: Window) {
  return `SELECT
  STORE_ID,
  CREATED_AT_TZ::DATE AS D,
  ${daypartCase("CREATED_AT_TZ")} AS DAYPART,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE - COALESCE(TOTAL_TAX, 0)) AS NET,
  SUM(ITEMS_COUNT) AS ITEMS,
  SUM(COALESCE(NULLIF(TABLE_GUEST_COUNT, 0), 0)) AS COVERS
FROM ${ORDERS}
WHERE ${orderBase(orgId, w)}
GROUP BY 1, 2, 3`;
}

/**
 * The workforce roll. `ACTIVE` is the whole table — the vendor sync does not
 * retain leavers, which is why anyone who left mid-window is unmatchable by
 * construction rather than by failure of the matcher. The extract measures that
 * rather than absorbing it.
 */
export function employeeQuery(storeIds: string[]) {
  return `SELECT ID, NAME, TYPE, STORE_ID, ACTIVE, HOURLY_RATE, CONTRACTED_WEEKLY_HOURS, SOURCE
FROM ${P}.EMPLOYEE
WHERE STORE_ID IN (${list(storeIds)})`;
}

export function departmentQuery(storeIds: string[]) {
  return `SELECT ID, NAME, STORE_ID FROM ${P}.DEPARTMENT WHERE STORE_ID IN (${list(storeIds)})`;
}

/**
 * Costed timesheet segments — the actual, as opposed to the plan.
 *
 * `IS_DELETED` is filtered because a deleted segment is a retraction and
 * counting it double-counts a corrected shift. The null-start segments are *not*
 * filtered here: they are counted, reported, and then dropped at apportionment,
 * because a row that silently disappears from a time-bounded query is exactly
 * the class of defect this build exists to make visible. At Meat Flour Wine
 * there are 103 of them and they carry $0, which is worth knowing and is not
 * knowable from a query that never sees them.
 */
export function labourQuery(storeIds: string[], w: Window) {
  return `SELECT
  EMPLOYEE_ID, STORE_ID, DEPARTMENT_ID,
  START_TIME_TZ, FINISH_TIME_TZ,
  HOURS, COST, COST_KIND, ORDINARY_HOURS, STATUS
FROM ${P}.ROSTER_COSTS
WHERE STORE_ID IN (${list(storeIds)})
  AND COALESCE(IS_DELETED, FALSE) = FALSE
  AND START_TIME_TZ >= '${w.start}' AND START_TIME_TZ < DATEADD(day, 1, '${w.end}')`;
}

/** Segments with no start time at all, at any date. Counted so they can be named. */
export function labourNullStartQuery(storeIds: string[]) {
  return `SELECT COUNT(*) AS N, SUM(COALESCE(COST, 0)) AS COST
FROM ${P}.ROSTER_COSTS
WHERE STORE_ID IN (${list(storeIds)})
  AND COALESCE(IS_DELETED, FALSE) = FALSE
  AND START_TIME_TZ IS NULL`;
}

/** The published plan, for planned-against-actual. */
export function plannedQuery(storeIds: string[], w: Window) {
  return `SELECT STORE_ID, DATE AS D, SUM(COALESCE(COST, 0)) AS COST, SUM(COALESCE(TOTAL_TIME, 0)) AS HOURS
FROM ${P}.ROSTER
WHERE STORE_ID IN (${list(storeIds)})
  AND COALESCE(IS_DELETED, FALSE) = FALSE
  AND DATE >= '${w.start}' AND DATE <= '${w.end}'
GROUP BY 1, 2`;
}

// ── the matcher ─────────────────────────────────────────────────────────────

/**
 * Tokens that describe a job, not a human.
 *
 * The workforce system at Meat Flour Wine carries "Alanna FR", "Kenisha SW",
 * "Cedric Chef", "Luis C PIZ" — a first name and a section code, because that is
 * what a roster needs to read at a glance. The POS carries "Alanna
 * Gomez-Scriven". Treating `FR` as a surname is how a matcher concludes that
 * Alanna FR and Alanna Gomez-Scriven are different people, so the vocabulary is
 * declared rather than inferred.
 */
const ROLE_TOKENS = new Set(
  ("sw fr foh boh bar chef chefs piz pizza kh host pass runner runners apprentice " +
    "admin manager management kitchen hand lunch dinner").split(" "),
);

/**
 * Labels that are not a person at all.
 *
 * A shared training login rang 227 orders and $48,975 of trade across 49 days at
 * Meat Flour Wine; a blank-named user rang 238 across 76. Neither is somebody
 * whose performance can be discussed, and both would otherwise sit in the
 * unmatched pile looking like a matching failure rather than a **captured
 * finding**. `OC-5046` is the same class of thing on the production Shift
 * Summary. These are classified, not discarded — their trade is real and it has
 * to reconcile.
 */
const NOT_A_PERSON = /^(|trainee.*|qr tags?|unknown.*|oolio admin|meat wine|test.*|training.*|staff|counter|kiosk|online|pos \d*)$/i;

export const normaliseName = (s: string): string =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();

const tokens = (s: string) => normaliseName(s).split(" ").filter(Boolean);

/** Everything after the first token that is not a job description. */
const surnameTokens = (s: string) => tokens(s).slice(1).filter((t) => !ROLE_TOKENS.has(t));

export type Verdict =
  | "confirmed"
  | "proposed"
  | "conflict"
  | "collision"
  | "unmatched"
  | "not-a-person";

export type MatchInput = { id: string; name: string; storeId: string };

export type MatchResult = {
  posId: string;
  empId: string | null;
  verdict: Verdict;
  /** Why the matcher reached this verdict, in the operator's language. */
  evidence: string;
  /** Other POS identities the matcher put on the same employee. */
  rivals: string[];
};

/**
 * Match POS identities to workforce employees.
 *
 * ── Why this is a queue and not an answer ──────────────────────────────────
 *
 * Nothing here is certain, and the design says so in the type. A **confirmed**
 * match has corroborating evidence beyond the first name — the surname agrees,
 * or the whole string does. A **proposed** match has a unique first name at the
 * venue and nothing contradicting it, which is a good bet and is not proof. A
 * **conflict** has a first name that agrees and surname evidence that does not,
 * which is the pair most likely to be two different people and is the one a
 * human must look at first. A **collision** is two POS identities landing on one
 * employee, which is either one person with two logins or two people with one
 * name, and only the venue knows which.
 *
 * The temptation is to collapse confirmed and proposed and report one match
 * rate. That number would be 79% at Meat Flour Wine and it would be a claim the
 * evidence does not support for two thirds of the rows underneath it.
 */
export function matchIdentities(pos: MatchInput[], emp: MatchInput[]): MatchResult[] {
  const out: MatchResult[] = [];

  for (const p of pos) {
    if (NOT_A_PERSON.test(normaliseName(p.name))) {
      out.push({
        posId: p.id, empId: null, verdict: "not-a-person",
        evidence: "Shared login, device or system account — not an individual",
        rivals: [],
      });
      continue;
    }

    const first = tokens(p.name)[0] ?? "";
    if (!first) {
      out.push({ posId: p.id, empId: null, verdict: "not-a-person", evidence: "No name recorded", rivals: [] });
      continue;
    }

    const byFirst = emp.filter((e) => tokens(e.name)[0] === first);
    // The venue narrows before the name does: two Matildas across two sites are
    // resolved by which site each rang orders at, and that is stronger evidence
    // than anything in the string.
    const sameStore = byFirst.filter((e) => e.storeId === p.storeId);
    const pool = sameStore.length ? sameStore : byFirst;

    if (!pool.length) {
      out.push({
        posId: p.id, empId: null, verdict: "unmatched",
        evidence: byFirst.length
          ? "First name matches only at the other venue"
          : "No employee on the current roll carries this first name — most likely a leaver",
        rivals: [],
      });
      continue;
    }

    const pSur = surnameTokens(p.name);
    /**
     * Every surname token on both sides is tested, not just the first.
     *
     * A till login is free text and people type what they like into it: one
     * identity at Meat Flour Wine is stored as "renato aka the don C". Reading
     * only the token after the first name takes "aka" as the surname, finds it
     * does not match "Chilelli", and reports a conflict — on a row where the
     * evidence, three tokens later, agrees. Testing the whole tail costs
     * nothing and turns a false conflict into a confirmed match.
     *
     * A single letter matches a full token by prefix in either direction, which
     * is what links a till's "H" to a roster's "Hardwick".
     */
    const scored = pool.map((e) => {
      const eSur = surnameTokens(e.name);
      if (!pSur.length || !eSur.length) return { e, agree: null as boolean | null };
      const agree = eSur.some((t) =>
        pSur.some((q) => t === q || (q.length === 1 && t.startsWith(q)) || (t.length === 1 && q.startsWith(t))),
      );
      return { e, agree };
    });

    const agreeing = scored.filter((s) => s.agree === true);
    const contradicting = scored.filter((s) => s.agree === false);

    if (agreeing.length === 1) {
      out.push({
        posId: p.id, empId: agreeing[0].e.id, verdict: "confirmed",
        evidence: normaliseName(p.name) === normaliseName(agreeing[0].e.name)
          ? "Both systems carry the same full name"
          : "First name and surname evidence agree",
        rivals: [],
      });
    } else if (pool.length === 1 && contradicting.length === 1) {
      out.push({
        posId: p.id, empId: pool[0].id, verdict: "conflict",
        evidence: "First name is unique at this venue, but the surname evidence disagrees",
        rivals: [],
      });
    } else if (pool.length === 1) {
      out.push({
        posId: p.id, empId: pool[0].id, verdict: "proposed",
        evidence: "Only one employee at this venue carries this first name, and nothing contradicts it",
        rivals: [],
      });
    } else {
      out.push({
        posId: p.id, empId: null, verdict: "unmatched",
        evidence: `${pool.length} employees at this venue share this first name and nothing separates them`,
        rivals: pool.map((e) => e.id),
      });
    }
  }

  // Two POS identities landing on one employee. Neither is wrong on its own
  // evidence, so neither is demoted silently — both are re-flagged, because the
  // question "is this one person with two logins" is the venue's to answer and
  // attaching one person's wage cost to two sets of sales is how a per-head
  // figure quietly doubles.
  const byEmp = new Map<string, MatchResult[]>();
  for (const m of out) if (m.empId) byEmp.set(m.empId, [...(byEmp.get(m.empId) ?? []), m]);
  for (const [, group] of byEmp) {
    if (group.length < 2) continue;
    for (const m of group) {
      m.verdict = "collision";
      m.evidence = `${group.length} POS logins resolve to this one employee — one person with two logins, or two people the roll cannot tell apart`;
      m.rivals = group.filter((g) => g !== m).map((g) => g.posId);
    }
  }

  return out;
}

// ── the daypart apportionment ───────────────────────────────────────────────

/**
 * Boundaries of the standard daypart vocabulary, in venue-local hours.
 *
 * The eight windows tile 0–24 exactly, which is what makes apportionment
 * possible without a residual bucket.
 */
const BOUNDS = [...new Set([0, 24, ...DAYPARTS.flatMap((d) => [d.from, d.to])])].sort((a, b) => a - b);

export function daypartOfHour(h: number): string {
  const d = DAYPARTS.find((x) => x.key !== "late-night" && h >= x.from && h < x.to);
  return d ? d.key : "late-night";
}

export type Slice = { date: string; dow: number; daypart: string; hours: number; cost: number; minutes: number };

/**
 * Split one costed segment across the dayparts it actually spans.
 *
 * ── Why pro-rata, and what that assumes ────────────────────────────────────
 *
 * A shift from 17:00 to 23:00 is four hours of Dinner and two of Late Evening,
 * and a report that files all six under the daypart the shift *started* in tells
 * an operator their late evening is free. So cost and hours are apportioned by
 * elapsed minutes in each window.
 *
 * That is pro-rata, and pro-rata assumes the pay rate is flat across the shift.
 * It is not always: a penalty rate can start at a clock time inside a segment.
 * The assumption is safe here because the vendor already splits at the rate
 * change — Meat Flour Wine's 5,819 award segments in the window average 3.97
 * hours, and **on none of them does elapsed time exceed recorded hours by more
 * than half an hour**, so a segment is one continuous paid stretch at one rate.
 * The extract asserts that rather than assuming it; see `elapsedAgrees`.
 *
 * Every minute is filed under its own local calendar date, so a segment
 * crossing midnight lands partly on each day — the same rule the sales side
 * follows, because both are keyed on the local timestamp of the thing itself.
 */
export function apportion(start: Date, finish: Date | null, hours: number, cost: number): Slice[] {
  if (!finish || !(finish > start)) {
    const d = iso(start);
    return [{ date: d, dow: start.getUTCDay(), daypart: daypartOfHour(start.getUTCHours()), hours, cost, minutes: 0 }];
  }
  const total = (finish.getTime() - start.getTime()) / 60000;
  const out: Slice[] = [];
  let cursor = new Date(start);

  // A guard, not a loop bound: 31 days of half-hour boundaries is far beyond any
  // real shift, and an unbounded while over dirty timestamps is a hung extract.
  for (let guard = 0; cursor < finish && guard < 4000; guard++) {
    const next = nextBoundary(cursor, finish);
    const minutes = (next.getTime() - cursor.getTime()) / 60000;
    if (minutes > 0) {
      out.push({
        date: iso(cursor),
        dow: cursor.getUTCDay(),
        daypart: daypartOfHour(cursor.getUTCHours()),
        hours: hours * (minutes / total),
        cost: cost * (minutes / total),
        minutes,
      });
    }
    cursor = next;
  }
  return out.length ? out : [{ date: iso(start), dow: start.getUTCDay(), daypart: daypartOfHour(start.getUTCHours()), hours, cost, minutes: total }];
}

function nextBoundary(from: Date, limit: Date): Date {
  const h = from.getUTCHours();
  const nextHour = BOUNDS.find((b) => b > h) ?? 24;
  const b = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0));
  b.setUTCHours(nextHour);
  return b < limit ? b : limit;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday-first week start, as a date, for the weekly grain. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return iso(d);
}

// ── the department taxonomy ─────────────────────────────────────────────────

/**
 * One section vocabulary above the vendor's department names.
 *
 * Meat Flour Wine runs two sites whose department names collide on purpose:
 * `CHEF Lunch` and `CHEF LUNCH - BERW`, `CHEF Dinner` and `DINNER CHEF - BERW`,
 * `Pizza Chef` and `PIZZA - BERW`. They are the same job in two buildings, and
 * grouping on the raw name means **nothing rolls Berwick's kitchen up against
 * Braeside's** — which is the entire point of a head-office view, and the reason
 * a two-site operator opens the report at all.
 *
 * The order matters: kitchen hand is tested before kitchen, and pizza before
 * chef, because the raw names overlap and first-match-wins on a list read top to
 * bottom is easier to audit than a scored classifier nobody can predict.
 */
const SECTIONS: { section: string; test: RegExp }[] = [
  { section: "Kitchen hand", test: /kitchen\s*hand|\bkh\b/i },
  { section: "Pizza", test: /pizza|\bpiz\b/i },
  { section: "Kitchen", test: /chef|kitchen|cook/i },
  { section: "Bar", test: /\bbar\b/i },
  { section: "Runners", test: /runner|pass/i },
  { section: "Host", test: /host|reception/i },
  { section: "Front of house", test: /foh|front|floor|\bsw\b|\bfr\b|service|wait/i },
  { section: "Management", test: /manage|admin|office/i },
];

export function sectionOf(department: string | null): string {
  if (!department) return "Unmapped";
  if (/uncategor/i.test(department)) return "Unmapped";
  return SECTIONS.find((s) => s.test.test(department))?.section ?? "Other";
}

// ── pseudonymisation ────────────────────────────────────────────────────────

const FIRST = "Alex Sam Jordan Riley Casey Morgan Taylor Jamie Avery Quinn Rowan Harper Emerson Finley Kai Noor Priya Wei Mateo Zara Elif Luca Nina Omar Sofia Theo Iris Dev Mila Arun Reza Tovah Bo Ines Yuki".split(" ");
const LAST = "Reed Hart Vance Cole Doyle Marsh Blake Foss Nash Quill Rivera Okafor Sandhu Tanaka Novak Duarte Lindqvist Haddad Osei Petrov Kaur Mbeki Ferreira Yilmaz Larsen Cruz Aoki Bishop Falk Gerrard Whitlock Ansari Bergman Cato Devane".split(" ");

export type Alias = { first: string; last: string };

export function aliasFor(hash: string): Alias {
  return {
    first: FIRST[parseInt(hash.slice(0, 4), 16) % FIRST.length],
    last: LAST[parseInt(hash.slice(4, 8), 16) % LAST.length],
  };
}

/**
 * Rewrite one real label into its synthetic equivalent, preserving the shape.
 *
 * The matcher has already run on the real strings, so this cannot change a
 * verdict. What it must not do is destroy the *evidence* a reader needs to judge
 * the verdict: if the real POS token was the employee's surname initial, the
 * synthetic one is the synthetic surname's initial, and if it was some other
 * letter it stays that letter. A role code passes through — it names a job, not
 * a person, and it is half of why the join is hard.
 *
 * A label that is not a person is returned untouched. "Trainee T" and "QR Tags"
 * identify nobody, and replacing them with a plausible human name would hide the
 * single most useful thing on the mapping screen.
 */
export function pseudonymise(real: string, alias: Alias, realSurname: string | null): string {
  if (NOT_A_PERSON.test(normaliseName(real))) return real.trim() || "(no name)";

  const raw = real.trim().split(/\s+/).filter(Boolean);
  const surnameInitial = realSurname ? realSurname[0]?.toLowerCase() : null;
  // A person has one surname however many words the till stored it in. Without
  // this, a login recorded as "renato aka the don C" emits the synthetic
  // surname once per word and reads as a bug rather than as the messy free-text
  // field it faithfully represents.
  let surnameUsed = false;

  return raw
    .map((tok, i) => {
      if (i === 0) return alias.first;
      const norm = tok.toLowerCase().replace(/[^a-z]/g, "");
      if (!norm) return tok;
      if (ROLE_TOKENS.has(norm)) return tok;
      if (norm.length === 1) {
        // A single letter is either the surname's initial — evidence — or an
        // unrelated marker. Both are preserved for what they are.
        return surnameInitial && norm === surnameInitial ? alias.last[0] : tok;
      }
      if (surnameUsed) return null;
      surnameUsed = true;
      return alias.last;
    })
    .filter(Boolean)
    .join(" ");
}

export { NOT_A_PERSON, ROLE_TOKENS };

// ── day part groups ────────────────────────────────────────────────────────

/**
 * The grain at which a wage percentage is actually meaningful.
 *
 * ── This is not a new concept. It is the day parts, grouped ────────────────
 *
 * The eight standard day parts are the shared time vocabulary across Oolio
 * reporting, and labour has no business inventing a rival one. But a wage
 * percentage cannot be struck against a single day part, for a reason that is
 * about kitchens rather than about data: **labour is not consumed in the hour it
 * is paid in.** A kitchen preps at ten for a lunch that sells at twelve; a floor
 * team clears at eleven for a dinner that sold at seven. Divide the cost
 * apportioned to a clock hour by the revenue banked in the same clock hour and
 * the arithmetic reports Late Evening at 348% and Breakfast at 6,207%.
 *
 * That is not a hypothetical. The shipped Labour dashboard prints a banner
 * reading *"Labour % capped at 100% for following: 7,720% at 11:30, 6,989% at
 * 11:45, 703% at 12:00"* — the same failure, met by clamping the axis rather
 * than by fixing the denominator.
 *
 * So the day parts stay exactly as they are, and the **ratio** is struck one
 * level up, against a group of them:
 *
 *   **Daytime** — Pre-Dawn, Breakfast, Mid-Morning, Lunch, Afternoon (04:00–17:00)
 *   **Evening** — Dinner, Late Evening, Late Night (17:00–04:00)
 *
 * ── Why the boundary is 17:00 ──────────────────────────────────────────────
 *
 * Because it is a day part boundary. An earlier cut used 16:00, chosen from the
 * empirical trough in orders per hour, and it was wrong in a way worth naming:
 * it split the Afternoon day part down the middle, so the groups were not unions
 * of day parts and the two vocabularies could not be reconciled on screen. A
 * grouping that does not nest inside the concept it claims to group **is** the
 * competing concept it was meant to avoid.
 *
 * 17:00 costs almost nothing in fidelity — 94 of 9,410 orders at Meat Flour Wine
 * fall in the 16:00 hour — and it buys exact nesting. The venue agrees with it
 * too: its rostering departments are named `CHEF Lunch` and `CHEF Dinner`, `Bar
 * Lunch` and `Bar Dinner`, and where a department names its service that naming
 * is used in preference to the clock.
 */
export const SERVICE_CUTOVER_HOUR = 17;

/** Below this hour an order belongs to the previous night's evening service. */
export const SERVICE_DAWN_HOUR = 4;

export const SERVICE_BLOCKS = [
  { key: "daytime", label: "Daytime", hours: "04:00–17:00" },
  { key: "evening", label: "Evening", hours: "17:00–04:00" },
] as const;

/** Which group each standard day part belongs to. The nesting, stated once. */
export const DAYPART_GROUP: Record<string, string> = {
  "pre-dawn": "daytime",
  breakfast: "daytime",
  "mid-morning": "daytime",
  lunch: "daytime",
  afternoon: "daytime",
  dinner: "evening",
  "late-evening": "evening",
  "late-night": "evening",
};

/**
 * The group a day part belongs to. **The only grouping rule there is.**
 *
 * ── Why the venue's own department names are not used for this ─────────────
 *
 * They were, briefly, and it was wrong. Meat Flour Wine names its rostering
 * departments `CHEF Lunch` and `CHEF Dinner`, so taking the group from the
 * department looked like reading the operator's own intent rather than imposing
 * a clock on them.
 *
 * It does not survive contact with the day parts. A shift the venue calls lunch
 * that runs to six in the evening puts an hour of its cost in the Dinner day
 * part while the department files the whole shift under Daytime — so the day
 * part totals and the group totals **partition the same labour differently**,
 * and the day parts stop nesting inside the groups they are drawn inside. At
 * this venue that gap is 1,499 hours. A grouping that does not nest inside the
 * concept it groups is the competing concept it was supposed to avoid.
 *
 * So both sides of the ratio are cut by the same clock, the rule is one
 * sentence — everything from 04:00 to 17:00 is Daytime — and every figure on a
 * group row is the sum of the day part rows drawn underneath it. The cost is
 * small and it is named: a lunch chef's last hour counts as Evening.
 */
export const groupOfDaypart = (daypart: string): string => DAYPART_GROUP[daypart] ?? "daytime";

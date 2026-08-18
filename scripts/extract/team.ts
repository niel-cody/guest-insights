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

/** One row per POS identity. The id is the key; the name is a display attribute. */
export function posStaffQuery(orgId: string, w: Window) {
  return `SELECT
  CREATED_BY_ID AS POS_ID,
  MAX_BY(CREATED_BY_NAME, CREATED_AT_TZ) AS POS_NAME,
  MAX_BY(STORE_ID, CREATED_AT_TZ) AS STORE_ID,
  COUNT(DISTINCT STORE_ID) AS STORES,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE - COALESCE(TOTAL_TAX, 0)) AS NET,
  SUM(ITEMS_COUNT) AS ITEMS,
  SUM(COALESCE(NULLIF(TABLE_GUEST_COUNT, 0), 0)) AS COVERS,
  COUNT_IF(NULLIF(TABLE_GUEST_COUNT, 0) IS NOT NULL) AS ORDERS_WITH_COVERS,
  SUM(COALESCE(TOTAL_DISCOUNT, 0)) AS DISCOUNT,
  COUNT(DISTINCT CREATED_AT_TZ::DATE) AS DAYS,
  COUNT_IF(TOTAL_COST_PRICE > 0) AS ORDERS_WITH_COST
FROM ${ORDERS}
WHERE ${orderBase(orgId, w)}
GROUP BY 1`;
}

/** Per identity, per weekday, per daypart. Question 2: are they better at different times? */
export function posStaffGrainQuery(orgId: string, w: Window) {
  return `SELECT
  CREATED_BY_ID AS POS_ID,
  DAYOFWEEK(CREATED_AT_TZ) AS DOW,
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
 * Venue trade at the finest grain both sides of the ratio share.
 *
 * Two time keys, deliberately. `DAYPART` is the clock, and is what the trade
 * *shape* is read from. `SERVICE` is the block the trade belongs to, and is the
 * only one of the two a wage percentage may be struck against — see
 * `serviceOfShift` for why the clock cannot carry it.
 */
export function salesGrainQuery(orgId: string, w: Window) {
  return `SELECT
  STORE_ID,
  CREATED_AT_TZ::DATE AS D,
  ${daypartCase("CREATED_AT_TZ")} AS DAYPART,
  IFF(HOUR(CREATED_AT_TZ) >= ${SERVICE_CUTOVER_HOUR} OR HOUR(CREATED_AT_TZ) < ${SERVICE_DAWN_HOUR},
      'dinner-service', 'lunch-service') AS SERVICE,
  COUNT(*) AS ORDERS,
  SUM(TOTAL_PRICE - COALESCE(TOTAL_TAX, 0)) AS NET,
  SUM(ITEMS_COUNT) AS ITEMS,
  SUM(COALESCE(NULLIF(TABLE_GUEST_COUNT, 0), 0)) AS COVERS
FROM ${ORDERS}
WHERE ${orderBase(orgId, w)}
GROUP BY 1, 2, 3, 4`;
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

// ── service blocks ──────────────────────────────────────────────────────────

/**
 * The grain at which a wage percentage is actually meaningful.
 *
 * ── The problem with a clock daypart ───────────────────────────────────────
 *
 * Labour is not consumed in the hour it is paid in. A kitchen starts prepping at
 * ten for a lunch that sells at twelve, and a floor team is still clearing at
 * eleven for a dinner that sold at seven. Apportioning wage cost across the
 * clock and dividing by the revenue recorded in the same hour therefore produces
 * arithmetic that is correct and nonsense: at Meat Flour Wine it reports Late
 * Evening at 348% wage and Breakfast at 6,207%, because the trade those hours
 * exist to serve was rung earlier in the evening and earlier in the day.
 *
 * **A number like that is not a caveat, it is a wrong answer**, and an operator
 * who acts on it cuts the pack-down shift and finds the restaurant filthy on
 * Saturday morning.
 *
 * ── What is used instead ───────────────────────────────────────────────────
 *
 * The service block: the whole span of committed labour, and the whole span of
 * trade, that belong to one service. Two things make it defensible here rather
 * than being a modelling convenience.
 *
 * **The venue already declares it.** Meat Flour Wine's rostering departments are
 * named `CHEF Lunch` and `CHEF Dinner`, `Lunch FOH` and `Dinner FOH`, `Bar
 * Lunch` and `Bar Dinner`. The operator has already told the workforce system
 * which service each shift belongs to, so the classification is read, not
 * invented, wherever the name carries it.
 *
 * **The trade agrees.** Orders per hour across the window run 595 at one o'clock,
 * fall to 73 at three and 94 at four, then rise to 1,392 at five. The boundary is
 * an empirical trough, not a round number chosen for tidiness.
 *
 * Where a department does not name its service — `Kitchen Hand`, `Pizza Chef`,
 * `Management` — the segment falls back to its own start time against the same
 * boundary, which is a per-shift decision rather than a per-department average
 * and so gets the shifts either side of the boundary right.
 */
export const SERVICE_CUTOVER_HOUR = 16;

/** Below this hour an order belongs to the previous night's dinner, not to lunch. */
export const SERVICE_DAWN_HOUR = 5;

export const SERVICE_BLOCKS = [
  { key: "lunch-service", label: "Lunch service" },
  { key: "dinner-service", label: "Dinner service" },
] as const;

/** A costed segment's service: what the venue called it, else when it started. */
export function serviceOfShift(department: string | null, startHour: number): string {
  if (department) {
    if (/lunch|breakfast|day/i.test(department)) return "lunch-service";
    if (/dinner|evening|night/i.test(department)) return "dinner-service";
  }
  return startHour >= SERVICE_CUTOVER_HOUR || startHour < SERVICE_DAWN_HOUR
    ? "dinner-service"
    : "lunch-service";
}

/** An order's service. One boundary, applied to both sides of the ratio. */
export function serviceOfOrderHour(hour: number): string {
  return hour >= SERVICE_CUTOVER_HOUR || hour < SERVICE_DAWN_HOUR ? "dinner-service" : "lunch-service";
}

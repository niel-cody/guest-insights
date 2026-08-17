/**
 * §10. The member-tier grading, reproduced.
 *
 *   npm run grade:members
 *
 * The 21-month member window was measured in a single session on 17 August 2026.
 * **Nothing in the cohort section is drawn on it until this script has been run
 * independently and its output written to the build log.** That is not ceremony:
 * a non-null count reporting 82.87% coverage got into a spec once and survived
 * two reviews, and this is the check that would have caught it.
 *
 * Three tests, because there are three distinct ways this feed fails.
 *
 * 1. **Coverage.** `CUSTOMER_ID` is an empty string, never NULL, so `COUNT()`
 *    returns 100.00% on a column that is entirely blank. The only correct test is
 *    `NULLIF(TRIM(CUSTOMER_ID), '')`.
 * 2. **Largest one token.** A month can be well covered and worthless if the
 *    covered rows are three recycled ids. The bar is 10%; a real member
 *    population never comes close to it.
 * 3. **Distinct step change.** A month that loses more than 40% of its distinct
 *    ids against flat order volume is a break in the feed, not a change in
 *    behaviour.
 *
 * Run estate-wide *and* for Coffee Guru. The estate is where a platform event is
 * visible; the merchant is where it either did or did not bite. There is one
 * estate-wide step **up** in Jul 2025 which is a platform event rather than a
 * break, and Coffee Guru is expected to be smooth through it — so the step test
 * reports direction rather than magnitude alone.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { query, disconnect } from "./snowflake";
import { ORGS } from "./extract/orgs";

const ORDERS = "OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC.ORDERS";

/** The bar for the single-most-frequent id. Above this the month is not usable. */
export const MAX_MEMBER_TOKEN_SHARE = 0.1;

/** A month losing more than this share of distinct ids against flat volume is a break. */
export const MAX_DISTINCT_DROP = 0.4;

/** Volume is "flat" when it moves less than this. Below it a distinct drop is a feed break. */
const FLAT_VOLUME_BAND = 0.25;

const FROM = "2024-01-01";

type Row = Record<string, unknown>;
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const day = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

/**
 * The clean order grain, matching `sql.ts` exactly.
 *
 * Not `NOT IN ('VOID','CANCELLED')` — that counts 45,485 never-finalised tickets
 * and the two numbers are both arithmetically correct. Only one of them is trade.
 */
function monthlyQuery(orgId: string | null, to: string) {
  const orgFilter = orgId ? `AND ORGANIZATION_ID = '${orgId}'` : "";
  return `WITH ord AS (
  SELECT
    DATE_TRUNC('month', CREATED_AT_TZ)::DATE AS MONTH,
    NULLIF(TRIM(CUSTOMER_ID), '') AS MEMBER_ID
  FROM ${ORDERS}
  WHERE CREATED_AT_TZ >= '${FROM}' AND CREATED_AT_TZ < '${to}'
    AND ORDER_STATUS = 'COMPLETED'
    AND COALESCE(IS_TRAINING, FALSE) = FALSE
    AND TOTAL_PRICE > 0
    ${orgFilter}
),
volume AS (
  SELECT MONTH,
    COUNT(*) AS ORDERS,
    /* COUNT_IF on the trimmed value. COUNT(CUSTOMER_ID) returns 100.00% here
       because the column is an empty string and never NULL. */
    COUNT_IF(MEMBER_ID IS NOT NULL) AS WITH_MEMBER,
    COUNT(DISTINCT MEMBER_ID) AS DISTINCT_MEMBERS
  FROM ord GROUP BY 1
),
token AS (
  SELECT MONTH, MAX(N) / NULLIF(SUM(N), 0) AS MAX_TOKEN_SHARE
  FROM (SELECT MONTH, MEMBER_ID, COUNT(*) AS N FROM ord WHERE MEMBER_ID IS NOT NULL GROUP BY 1, 2)
  GROUP BY 1
)
SELECT v.MONTH, v.ORDERS, v.WITH_MEMBER, v.DISTINCT_MEMBERS,
       COALESCE(t.MAX_TOKEN_SHARE, 0) AS MAX_TOKEN_SHARE
FROM volume v LEFT JOIN token t ON t.MONTH = v.MONTH
ORDER BY v.MONTH`;
}

/**
 * Cohort survival on the member tier.
 *
 * A cohort is the month a member first appears. "Still active" means they were
 * seen at least once on or after the twelve-month anniversary of that first
 * appearance — not "seen in the twelfth month", which would measure a single
 * month's trade rather than survival.
 *
 * Tenure is first-seen to last-seen, right-censored by the window end. It is a
 * floor on the real relationship, never an estimate of it.
 */
function cohortQuery(orgId: string, to: string) {
  return `WITH ord AS (
  SELECT NULLIF(TRIM(CUSTOMER_ID), '') AS MEMBER_ID, CREATED_AT_TZ::DATE AS D
  FROM ${ORDERS}
  WHERE CREATED_AT_TZ >= '${FROM}' AND CREATED_AT_TZ < '${to}'
    AND ORDER_STATUS = 'COMPLETED'
    AND COALESCE(IS_TRAINING, FALSE) = FALSE
    AND TOTAL_PRICE > 0
    AND ORGANIZATION_ID = '${orgId}'
    AND NULLIF(TRIM(CUSTOMER_ID), '') IS NOT NULL
),
person AS (
  SELECT MEMBER_ID, MIN(D) AS FIRST_SEEN, MAX(D) AS LAST_SEEN,
         DATEDIFF(day, MIN(D), MAX(D)) AS TENURE_DAYS
  FROM ord GROUP BY 1
)
SELECT
  DATE_TRUNC('month', FIRST_SEEN)::DATE AS COHORT,
  COUNT(*) AS MEMBERS,
  AVG(TENURE_DAYS) AS AVG_TENURE_DAYS,
  /* Still active a year on: last seen at or beyond the 12-month anniversary.
     Only computed where the window is long enough to have observed it. */
  COUNT_IF(LAST_SEEN >= DATEADD(month, 12, FIRST_SEEN)) AS ACTIVE_12M,
  COUNT_IF(DATEADD(month, 12, FIRST_SEEN) < '${to}') AS OBSERVABLE_12M
FROM person GROUP BY 1 ORDER BY 1`;
}

type Graded = {
  month: string;
  orders: number;
  withMember: number;
  coverage: number;
  distinctMembers: number;
  maxTokenShare: number;
  /** Distinct ids lost against the month before, as a share. Negative is a gain. */
  distinctDrop: number | null;
  /** Order volume movement against the month before. A drop is only a break on flat volume. */
  volumeMove: number | null;
  ok: boolean;
  reason: string | null;
};

function grade(rows: Row[]): Graded[] {
  const raw = rows.map((r) => ({
    month: day(r.MONTH),
    orders: num(r.ORDERS),
    withMember: num(r.WITH_MEMBER),
    distinctMembers: num(r.DISTINCT_MEMBERS),
    maxTokenShare: num(r.MAX_TOKEN_SHARE),
  }));

  return raw.map((m, i) => {
    const prev = raw[i - 1];
    const distinctDrop =
      prev && prev.distinctMembers > 0 ? 1 - m.distinctMembers / prev.distinctMembers : null;
    const volumeMove = prev && prev.orders > 0 ? m.orders / prev.orders - 1 : null;
    const coverage = m.orders ? m.withMember / m.orders : 0;

    // A distinct drop only indicts the feed where volume held. A month that lost
    // half its orders and half its members lost trade, not data.
    const flatVolume = volumeMove === null || Math.abs(volumeMove) < FLAT_VOLUME_BAND;
    const stepBreak = distinctDrop !== null && distinctDrop > MAX_DISTINCT_DROP && flatVolume;

    let reason: string | null = null;
    if (m.orders === 0) reason = "not trading";
    else if (m.withMember === 0) reason = "no member capture";
    else if (m.maxTokenShare >= MAX_MEMBER_TOKEN_SHARE)
      reason = `one id carries ${(m.maxTokenShare * 100).toFixed(1)}% of scanned orders`;
    else if (stepBreak)
      reason = `distinct ids fell ${(distinctDrop! * 100).toFixed(0)}% on flat volume`;

    return {
      ...m,
      coverage: Number(coverage.toFixed(4)),
      maxTokenShare: Number(m.maxTokenShare.toFixed(4)),
      distinctDrop: distinctDrop === null ? null : Number(distinctDrop.toFixed(4)),
      volumeMove: volumeMove === null ? null : Number(volumeMove.toFixed(4)),
      ok: reason === null,
      reason,
    };
  });
}

const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;
const int = (n: number) => n.toLocaleString("en-AU");

function table(rows: Graded[]): string {
  const head = "| Month | Orders | With member ID | Coverage | Distinct | Max token | Δ distinct | Verdict |";
  const rule = "|---|---:|---:|---:|---:|---:|---:|---|";
  const body = rows.map(
    (r) =>
      `| ${r.month.slice(0, 7)} | ${int(r.orders)} | ${int(r.withMember)} | ${pct(r.coverage)} | ` +
      `${int(r.distinctMembers)} | ${pct(r.maxTokenShare)} | ` +
      `${r.distinctDrop === null ? "—" : (r.distinctDrop > 0 ? "−" : "+") + pct(Math.abs(r.distinctDrop), 1)} | ` +
      `${r.ok ? "ok" : `**${r.reason}**`} |`,
  );
  return [head, rule, ...body].join("\n");
}

/**
 * The figures §10 publishes, so a difference is visible rather than discovered
 * later. Named `expected` rather than `assert` deliberately — a mismatch is
 * something to raise, not something this script silently corrects for.
 */
const EXPECTED: Record<string, { orders: number; withMember: number; distinct: number }> = {
  "2024-11": { orders: 20015, withMember: 956, distinct: 436 },
  "2025-02": { orders: 78151, withMember: 9148, distinct: 1889 },
  "2025-08": { orders: 88860, withMember: 15860, distinct: 2911 },
  "2026-02": { orders: 78117, withMember: 14869, distinct: 3084 },
  "2026-07": { orders: 84108, withMember: 15907, distinct: 3326 },
};

/** Within a fraction of a percent is a reproduction. Anything more is a finding. */
const TOLERANCE = 0.005;

async function main() {
  // The month in progress is never graded — a partial month is not a month.
  const to = `${new Date().toISOString().slice(0, 7)}-01`;
  const cg = ORGS.find((o) => o.slug === "coffee-guru")!;

  console.log(`§10 member-tier grading · ${FROM} → ${to} (exclusive)\n`);

  const [estateRows, cgRows, cohortRows] = await Promise.all([
    query<Row>(monthlyQuery(null, to)),
    query<Row>(monthlyQuery(cg.id, to)),
    query<Row>(cohortQuery(cg.id, to)),
  ]);

  const estate = grade(estateRows);
  const coffee = grade(cgRows);

  // ── the five published months, compared ───────────────────────────────────
  const checks: { month: string; field: string; expected: number; got: number; delta: number }[] = [];
  for (const [month, exp] of Object.entries(EXPECTED)) {
    const got = coffee.find((r) => r.month.slice(0, 7) === month);
    if (!got) {
      checks.push({ month, field: "month", expected: 1, got: 0, delta: 1 });
      continue;
    }
    const pairs: [string, number, number][] = [
      ["orders", exp.orders, got.orders],
      ["withMember", exp.withMember, got.withMember],
      ["distinct", exp.distinct, got.distinctMembers],
    ];
    for (const [field, e, g] of pairs) {
      const delta = e ? Math.abs(g - e) / e : g ? 1 : 0;
      if (delta > TOLERANCE) checks.push({ month, field, expected: e, got: g, delta });
    }
  }

  // ── cohorts ───────────────────────────────────────────────────────────────
  const cohorts = cohortRows.map((r) => ({
    cohort: day(r.COHORT),
    members: num(r.MEMBERS),
    avgTenureDays: Number(num(r.AVG_TENURE_DAYS).toFixed(1)),
    active12m: num(r.ACTIVE_12M),
    observable12m: num(r.OBSERVABLE_12M),
    survival12m: num(r.OBSERVABLE_12M) ? num(r.ACTIVE_12M) / num(r.OBSERVABLE_12M) : null,
  }));
  const nov24 = cohorts.find((c) => c.cohort.startsWith("2024-11"));

  const usable = coffee.filter((m) => m.ok);
  const first = usable[0]?.month ?? null;
  const last = usable.at(-1)?.month ?? null;
  const spanDays =
    first && last
      ? Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000)
      : 0;

  // ── report ────────────────────────────────────────────────────────────────
  const out: string[] = [];
  out.push("# §10 — member-tier grading, reproduced");
  out.push("");
  out.push(`Run ${new Date().toISOString()} · window ${FROM} → ${to} (exclusive) · complete months only.`);
  out.push("");
  out.push(
    `Coverage is \`NULLIF(TRIM(CUSTOMER_ID), '')\`, never \`COUNT()\`. ` +
      `The bar for the largest single id is ${pct(MAX_MEMBER_TOKEN_SHARE, 0)}; ` +
      `a month losing more than ${pct(MAX_DISTINCT_DROP, 0)} of its distinct ids on flat volume is a break.`,
  );
  out.push("");

  out.push("## Coffee Guru");
  out.push("");
  out.push(table(coffee));
  out.push("");

  out.push("## Estate-wide");
  out.push("");
  out.push(table(estate));
  out.push("");

  out.push("## The five published months");
  out.push("");
  if (checks.length === 0) {
    out.push(
      `All five reproduce within ${pct(TOLERANCE, 1)}. The 17 August figures stand and the cohort ` +
        `section may be built on this window.`,
    );
  } else {
    out.push(`**${checks.length} figure(s) differ by more than ${pct(TOLERANCE, 1)}. Raise before building §6.5.**`);
    out.push("");
    out.push("| Month | Field | Spec | Reproduced | Δ |");
    out.push("|---|---|---:|---:|---:|");
    for (const c of checks) {
      out.push(`| ${c.month} | ${c.field} | ${int(c.expected)} | ${int(c.got)} | ${pct(c.delta, 1)} |`);
    }
  }
  out.push("");

  out.push("## The window this entitles");
  out.push("");
  out.push(`- Usable months: **${usable.length} of ${coffee.length}** graded.`);
  out.push(`- Run: **${first ?? "—"} → ${last ?? "—"}**, ${int(spanDays)} days.`);
  out.push(
    `- Render rule (§4.3): ${spanDays} days against a 89-day threshold needs 178. ` +
      `**${spanDays >= 178 ? "Renders." : "Refuses."}**`,
  );
  out.push(
    `- Largest one-token share across usable months: ` +
      `${pct(Math.min(...usable.map((m) => m.maxTokenShare)), 2)} – ` +
      `${pct(Math.max(...usable.map((m) => m.maxTokenShare)), 2)} (bar ${pct(MAX_MEMBER_TOKEN_SHARE, 0)}).`,
  );
  out.push("");

  out.push("## Cohorts, Coffee Guru");
  out.push("");
  out.push("| Cohort | Members | Avg tenure (days) | Observable at 12m | Still active | Survival |");
  out.push("|---|---:|---:|---:|---:|---:|");
  for (const c of cohorts) {
    out.push(
      `| ${c.cohort.slice(0, 7)} | ${int(c.members)} | ${c.avgTenureDays} | ${int(c.observable12m)} | ` +
        `${int(c.active12m)} | ${c.survival12m === null ? "—" : pct(c.survival12m, 1)} |`,
    );
  }
  out.push("");
  out.push(
    `Nov 2024 cohort: spec says **66.7% still active 12+ months later, average tenure 411 days**. ` +
      `Reproduced: **${nov24?.survival12m === null || nov24 === undefined ? "—" : pct(nov24.survival12m!, 1)}** ` +
      `and **${nov24?.avgTenureDays ?? "—"} days**.`,
  );
  out.push("");
  out.push(
    `Later cohorts have less room to run before the window closes, so their survival is censored rather ` +
      `than lower. §6.5 draws the censor boundary on the chart for exactly this reason, and the ` +
      `falling-cohort-quality trend is not published: coverage rose over the same period, so later ` +
      `cohorts include marginal members the early ones never captured.`,
  );
  out.push("");

  const path = join(import.meta.dirname, "..", "docs", "build-log", "10-member-grading.md");
  writeFileSync(path, out.join("\n"));

  console.log(out.join("\n"));
  console.log(`\nWritten to ${path}`);

  if (checks.length) {
    console.error(`\n${checks.length} figure(s) differ from §10. Raise this — do not adjust the spec to fit.`);
    process.exitCode = 2;
  }

  await disconnect();
}

main().catch(async (e) => {
  console.error("\nGrading failed:", e.message);
  await disconnect();
  process.exit(1);
});

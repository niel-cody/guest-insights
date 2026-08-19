/**
 * Retention and churn, and the one comparison that makes them mean anything.
 *
 * ── The problem this module exists to solve ────────────────────────────────
 *
 * "Is retention improving?" is the question every operator asks of a loyalty
 * programme and the one this build has refused to answer since the cohort lens
 * shipped. The refusal was correct and the reason is worth restating, because
 * everything below is built to get around it honestly rather than to drop it:
 *
 * > Six-month survival falls across the run. So does the meaning of the word
 * > "member": scan coverage rose from 3% to 19% of orders over the same period,
 * > so later cohorts include marginal members the early ones never captured at
 * > all. A cohort that only enrolled its most committed guests will always
 * > out-survive one that enrolled everybody.
 *
 * Two things move together and a falling line cannot be attributed to either. A
 * trend drawn through that is read as a programme getting worse when it is at
 * least partly a programme getting broader.
 *
 * ── The coverage-matched comparison ────────────────────────────────────────
 *
 * The confound is not permanent. A programme ramps and then it plateaus, and
 * **once coverage is flat, cohorts joining under it are recruited from the same
 * population and are comparable to each other.** Coffee Guru's scan coverage
 * climbs from 0.3% to 17% over ten months and then sits between 17.1% and 19.4%
 * for the following twelve. Cohorts joining inside that plateau can be set
 * against one another; cohorts from the ramp cannot, and are excluded rather
 * than adjusted.
 *
 * That is the whole method. It buys the answer at the cost of the early history,
 * which is the right trade — the early history is exactly the part that cannot
 * be compared.
 *
 * ── What it still does not fix ─────────────────────────────────────────────
 *
 * Coverage being flat does not make the sample representative. Members are
 * roughly a fifth of orders and heavily self-selected, and this build's own
 * analysis puts most of the member value gap down to selection. The comparison
 * below is **members against members over time**, which the plateau makes fair.
 * It is not members against everybody, which nothing here makes fair.
 */
import type { Cohorts } from "./types";
import { monthLabel } from "./metrics";

/**
 * How flat coverage has to be before two cohorts under it are comparable.
 *
 * Both conditions, and they catch different failures. The absolute tolerance
 * stops a programme drifting three points across a long run and calling itself
 * stable. The relative one stops a small-coverage venue — Meat Flour Wine sits
 * near 5% — passing the absolute test trivially while its reach doubles.
 */
export const STABLE_ABS_TOL = 0.03;
export const STABLE_REL_TOL = 1.3;

/**
 * The horizon retention is measured at.
 *
 * Three months, because it is the shortest horizon that is a real verdict and
 * the longest that most cohorts in a plateau have reached. Six is offered where
 * the data supports it, and is the more honest number when it exists: three
 * months of silence is this build's lapse threshold, so a member counted as
 * retained at three months has cleared it by exactly one day.
 */
export const HORIZONS = [3, 6] as const;

/**
 * Below this many comparable intakes there is no trend, only points.
 *
 * Four is not a statistical threshold, it is a drawing threshold: three points
 * make a line that any reader will extend, and a line drawn through three
 * cohorts of a few hundred people each is a shape rather than a finding.
 */
export const MIN_MATCHED_COHORTS = 4;

export type StableRun = {
  from: string;
  to: string;
  months: number;
  lo: number;
  hi: number;
};

/**
 * The longest run of consecutive months whose scan coverage stays flat.
 *
 * Longest rather than most recent, because the comparison wants as many
 * comparable intakes as it can get, and a plateau that ended is still a
 * plateau — a programme whose reach was stable for a year and then jumped is
 * best compared across that year, not across the jump.
 */
export function stableCoverageRun(cohorts: Cohorts): StableRun | null {
  const cov = cohorts.coverage.filter((c) => c.coverage > 0);
  let best: typeof cov = [];
  for (let i = 0; i < cov.length; i++) {
    for (let j = i + 1; j <= cov.length; j++) {
      const seg = cov.slice(i, j);
      const vs = seg.map((c) => c.coverage);
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      if (lo <= 0) continue;
      if (hi - lo <= STABLE_ABS_TOL && hi / lo <= STABLE_REL_TOL && seg.length > best.length) best = seg;
    }
  }
  if (best.length < 2) return null;
  const vs = best.map((c) => c.coverage);
  return {
    from: best[0].month,
    to: best.at(-1)!.month,
    months: best.length,
    lo: Math.min(...vs),
    hi: Math.max(...vs),
  };
}

export type MatchedPoint = {
  cohort: string;
  label: string;
  members: number;
  retained: number;
  rate: number;
};

export type RetentionTrend = {
  horizon: number;
  run: StableRun;
  points: MatchedPoint[];
  /** Pooled across the matched intakes. The headline, not an average of rates. */
  pooled: number;
  /** Mean rate of the earlier half against the later half, in points. */
  change: number;
  direction: "improving" | "declining" | "flat";
  /** Set when the comparison cannot be drawn, with the reason. */
  refusal: string | null;
};

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Retention at a fixed horizon, across intakes recruited under flat coverage.
 *
 * Every point is one intake measured at **the same elapsed age**, which is what
 * makes them comparable at all — the cohort lens's calendar-time view
 * deliberately gives that up in exchange for being readable, and this gives it
 * back for the one question that needs it.
 */
export function retentionTrend(cohorts: Cohorts, horizon: number): RetentionTrend | null {
  const run = stableCoverageRun(cohorts);
  if (!run) return null;

  const active = new Map(cohorts.triangle.map((t) => [`${t.cohort}|${t.monthsSince}`, t.active]));
  const points: MatchedPoint[] = [];
  for (const c of cohorts.cohorts) {
    if (c.cohort < run.from || c.cohort > run.to) continue;
    // The intake must have been watched for the full horizon. A cohort three
    // months old cannot report a six-month figure, and filling it from a shorter
    // observation is how a censor boundary becomes a downward trend.
    if (c.observableMonths < horizon) continue;
    const retained = active.get(`${c.cohort}|${horizon}`);
    if (retained == null || c.members <= 0) continue;
    points.push({
      cohort: c.cohort,
      label: monthLabel(c.cohort),
      members: c.members,
      retained,
      rate: retained / c.members,
    });
  }
  points.sort((a, b) => a.cohort.localeCompare(b.cohort));

  const base: Omit<RetentionTrend, "refusal"> = {
    horizon,
    run,
    points,
    pooled:
      points.reduce((a, p) => a + p.retained, 0) / Math.max(1, points.reduce((a, p) => a + p.members, 0)),
    change: 0,
    direction: "flat",
  };

  if (points.length < MIN_MATCHED_COHORTS) {
    return {
      ...base,
      refusal:
        `Only ${points.length} intake${points.length === 1 ? "" : "s"} joined while coverage was flat and ` +
        `have been watched for ${horizon} months. ${MIN_MATCHED_COHORTS} is the floor for drawing a ` +
        `direction — three points make a line any reader will extend, and this one would be extended ` +
        `through a few hundred people.`,
    };
  }

  const half = Math.floor(points.length / 2);
  const early = points.slice(0, half);
  const late = points.slice(points.length - half);
  const mean = (xs: MatchedPoint[]) => xs.reduce((a, p) => a + p.rate, 0) / Math.max(1, xs.length);
  const change = mean(late) - mean(early);

  return {
    ...base,
    change,
    // A point of retention either side is movement inside the noise of intakes
    // this size, and calling it a direction invites a manager to explain it.
    direction: Math.abs(change) < 0.01 ? "flat" : change > 0 ? "improving" : "declining",
    refusal: null,
  };
}

/** Both horizons, best first, with whatever each can support. */
export function retentionTrends(cohorts: Cohorts): RetentionTrend[] {
  return HORIZONS.map((h) => retentionTrend(cohorts, h)).filter((t): t is RetentionTrend => t != null);
}

// ── the active base, month by month ─────────────────────────────────────────

export type FlowMonth = {
  month: string;
  label: string;
  /** Members active this month, across every intake. */
  active: number;
  /** Members whose first-ever scan was this month. */
  joined: number;
  /** Active last month and active this month. */
  held: number;
  /** Active last month and not this month. */
  lost: number;
  net: number;
  /** Lost over last month's active base. Null in the first month. */
  churnRate: number | null;
};

/**
 * The active base as a flow: who joined, who stayed, who stopped.
 *
 * ── Why this is derived and not measured ───────────────────────────────────
 *
 * The snapshot carries a cohort triangle, not a per-person month-by-month
 * ledger, so `held` and `lost` are computed by comparing each cohort's active
 * count in consecutive months. That is exact for a cohort that only ever loses
 * people, and it **understates churn wherever somebody returns after a month
 * away** — a cohort that goes 100, 80, 85 reports five gained rather than the
 * ten who came back and the five who left.
 *
 * The understatement is real and is stated on the surface rather than buried
 * here. It does not affect `active`, which is measured directly, and reading the
 * churn rate as a floor rather than a point estimate is the correct treatment.
 */
export function monthlyFlow(cohorts: Cohorts): FlowMonth[] {
  const months: string[] = [];
  for (let i = 0; ; i++) {
    const m = addMonths(cohorts.window.start, i);
    if (m > cohorts.window.end) break;
    months.push(m);
  }

  const active = new Map(cohorts.triangle.map((t) => [`${t.cohort}|${t.monthsSince}`, t.active]));
  const at = (cohort: string, month: string) => {
    if (month < cohort) return 0;
    const since = months.indexOf(month) - months.indexOf(cohort);
    return active.get(`${cohort}|${since}`) ?? 0;
  };
  const joinedIn = new Map(cohorts.cohorts.map((c) => [c.cohort, c.members]));

  return months.map((m, i) => {
    const total = cohorts.cohorts.reduce((a, c) => a + at(c.cohort, m), 0);
    const joined = joinedIn.get(m) ?? 0;
    let held = 0;
    let lost = 0;
    if (i > 0) {
      const prev = months[i - 1];
      for (const c of cohorts.cohorts) {
        if (c.cohort > prev) continue;
        const before = at(c.cohort, prev);
        const now = at(c.cohort, m);
        held += Math.min(before, now);
        lost += Math.max(0, before - now);
      }
    }
    const priorActive = held + lost;
    return {
      month: m,
      label: monthLabel(m),
      active: total,
      joined,
      held,
      lost,
      net: total - (i > 0 ? cohorts.cohorts.reduce((a, c) => a + at(c.cohort, months[i - 1]), 0) : 0),
      churnRate: i > 0 && priorActive > 0 ? lost / priorActive : null,
    };
  });
}

// ── the card tier ───────────────────────────────────────────────────────────

export type CardVerdict = {
  /** Whether a lapse-dependent claim can be made on the card window at all. */
  renders: boolean;
  windowDays: number;
  requiredDays: number;
  /** The month card capture was restored, where it was ever lost. */
  restoredFrom: string | null;
  /** Complete months lost to a capture failure, anywhere in the graded history. */
  blackoutMonths: number;
  /** The date the current run reaches the threshold. Null if it already has. */
  unlocksOn: string | null;
  reason: string;
};

/** Days of silence before this build calls somebody lapsed, doubled. */
export const LAPSE_DOUBLED_DAYS = 180;

/**
 * What the card tier can say about retention, and when it will be able to.
 *
 * ── Why the answer is "not yet", precisely ─────────────────────────────────
 *
 * Retention and churn are lapse-dependent: to say somebody stopped coming you
 * need the lapse threshold of silence, and to say somebody did *not* you need
 * the same again watching them beforehand. That is 180 days, and it is the same
 * rule the member tier clears and the card tier does not.
 *
 * The card window is short for a reason that is not the card's fault and is
 * worth putting in front of an operator: **the payment reference stopped being
 * written for months at a time.** Coffee Guru lost fourteen consecutive months
 * of it. A guest seen either side of that gap cannot be told from two guests, so
 * retention across it is not hard to compute — it is not defined.
 *
 * The useful output is therefore a date. Capture resumed, the clock restarted,
 * and this returns the day the current run becomes long enough.
 */
export function cardVerdict(
  quality: { month: string; ok: boolean; reason: string | null }[],
  windowDays: number,
): CardVerdict {
  const complete = [...quality].sort((a, b) => a.month.localeCompare(b.month));
  const blackout = complete.filter((m) => !m.ok && /capture/i.test(m.reason ?? ""));

  // The start of the current unbroken run of usable months, walking back from
  // the most recent one. That is the day the clock restarted.
  let restoredFrom: string | null = null;
  for (let i = complete.length - 1; i >= 0; i--) {
    if (!complete[i].ok) break;
    restoredFrom = complete[i].month;
  }

  const renders = windowDays >= LAPSE_DOUBLED_DAYS;
  let unlocksOn: string | null = null;
  if (!renders && restoredFrom) {
    const d = new Date(`${restoredFrom}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + LAPSE_DOUBLED_DAYS);
    unlocksOn = d.toISOString().slice(0, 10);
  }

  return {
    renders,
    windowDays,
    requiredDays: LAPSE_DOUBLED_DAYS,
    restoredFrom,
    blackoutMonths: blackout.length,
    unlocksOn,
    reason: renders
      ? `The card window holds ${windowDays} days, which clears the ${LAPSE_DOUBLED_DAYS} a lapse-dependent figure needs.`
      : `The card window holds ${windowDays} days and a lapse-dependent figure needs ${LAPSE_DOUBLED_DAYS}.`,
  };
}

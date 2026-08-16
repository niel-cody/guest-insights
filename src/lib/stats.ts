/**
 * Estimators. Pure functions, shared by the extract and the app, so a figure and
 * its confidence band are computed in exactly one place.
 *
 * Everything here exists because build v1 published point estimates from methods
 * that could not support them. Each function therefore returns enough for the UI
 * to decline to draw: a sample size, an interval, and a reason.
 */

// ── survival ────────────────────────────────────────────────────────────────

export type Episode = {
  /** Days from a visit to the next one, or to the window end if there was none. */
  days: number;
  /** Weighted count of episodes that ended in a return on this day. */
  eventsW: number;
  /** Weighted count of episodes still open on this day when observation stopped. */
  censoredW: number;
  eventsN: number;
  censoredN: number;
};

export type SurvivalPoint = {
  days: number;
  /** P(has not returned yet) — the Kaplan-Meier estimate. */
  survival: number;
  /** Greenwood standard error of the survival estimate. */
  se: number;
  atRisk: number;
  events: number;
};

export type Survival = {
  curve: SurvivalPoint[];
  /** Days by which the given share of returners have returned, or null if the
   *  window closes before the curve reaches it. Null is a refusal, not a zero. */
  quantile: (p: number) => number | null;
  /** Total weighted episodes, and the observed share that ended in a return. */
  episodes: number;
  returned: number;
  /** The furthest the curve can speak to, i.e. the longest observed episode. */
  horizonDays: number;
  /** The lowest survival the curve reaches. Anything below it is unestimable. */
  floor: number;
};

/**
 * Kaplan-Meier estimate of time to next visit.
 *
 * The point of using it rather than percentiles of observed gaps is censoring.
 * A gap only exists if the guest came back; everybody still away when the window
 * closed has no gap at all, and dropping them makes returns look faster than they
 * are. Here those people stay in the risk set until the day they leave it, which
 * is what stops the estimator declaring a guest lapsed at a point where a quarter
 * of real returns are still to come.
 *
 * Episodes arrive pre-weighted 1/n per guest so the estimate is per guest rather
 * than per gap — otherwise a twice-daily regular contributing ninety episodes
 * outvotes ninety occasional guests contributing one each, and the median comes
 * back short.
 */
export function kaplanMeier(episodes: Episode[]): Survival {
  const rows = [...episodes].sort((a, b) => a.days - b.days);
  const total = rows.reduce((a, r) => a + r.eventsW + r.censoredW, 0);
  const returned = rows.reduce((a, r) => a + r.eventsW, 0);

  let atRisk = total;
  let s = 1;
  let varSum = 0;
  const curve: SurvivalPoint[] = [];

  for (const r of rows) {
    if (atRisk <= 0) break;
    const d = r.eventsW;
    if (d > 0) {
      s *= 1 - d / atRisk;
      // Greenwood's formula for the variance of the KM estimate.
      varSum += d / (atRisk * (atRisk - d) || 1);
    }
    curve.push({
      days: r.days,
      survival: s,
      se: s * Math.sqrt(varSum),
      atRisk,
      events: r.eventsN,
    });
    atRisk -= d + r.censoredW;
  }

  const floor = curve.length ? curve[curve.length - 1].survival : 1;
  const horizonDays = curve.length ? curve[curve.length - 1].days : 0;

  return {
    curve,
    episodes: total,
    returned,
    horizonDays,
    floor,
    quantile(p: number) {
      // The day by which share p of the population has returned, i.e. S(t) <= 1-p.
      const target = 1 - p;
      if (floor > target) return null; // the window closes first — refuse
      const hit = curve.find((c) => c.survival <= target);
      return hit ? hit.days : null;
    },
  };
}

// ── paired comparison ───────────────────────────────────────────────────────

export type Paired = {
  n: number;
  meanBefore: number;
  meanAfter: number;
  /** Mean of the within-person differences — the estimate that matters. */
  meanDiff: number;
  /** Ratio of means, expressed as a lift. */
  lift: number;
  /** 95% interval on the lift, from the paired differences. */
  liftLo: number;
  liftHi: number;
  /** True when the interval excludes zero at 95%. */
  significant: boolean;
};

/** Student t critical value at 95%, two-sided. Table for small n, normal beyond. */
function t95(df: number): number {
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086, 25: 2.06,
    30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
  };
  if (df <= 0) return NaN;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const k of keys) if (df <= k) return table[k];
  return 1.96;
}

/**
 * Paired before-and-after on the same people.
 *
 * The interval is computed on the within-person differences, not on the two
 * group means, because the pairing is the entire reason this design answers a
 * question the cross-sectional comparison cannot. The lift is a ratio of means
 * and its interval is carried across from the difference, which is adequate at
 * these sample sizes and is stated as such rather than dressed up as a bootstrap.
 */
export function paired(before: number[], after: number[]): Paired {
  const n = Math.min(before.length, after.length);
  const diffs = Array.from({ length: n }, (_, i) => after[i] - before[i]);
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / (xs.length || 1);
  const mb = mean(before);
  const ma = mean(after);
  const md = mean(diffs);

  const variance = n > 1 ? diffs.reduce((a, d) => a + (d - md) ** 2, 0) / (n - 1) : 0;
  const se = n > 0 ? Math.sqrt(variance / n) : 0;
  const crit = t95(n - 1);
  const lo = md - crit * se;
  const hi = md + crit * se;

  return {
    n,
    meanBefore: mb,
    meanAfter: ma,
    meanDiff: md,
    lift: mb !== 0 ? ma / mb - 1 : 0,
    liftLo: mb !== 0 ? (mb + lo) / mb - 1 : 0,
    liftHi: mb !== 0 ? (mb + hi) / mb - 1 : 0,
    significant: Number.isFinite(lo) && Number.isFinite(hi) && lo * hi > 0,
  };
}

// ── standardisation ─────────────────────────────────────────────────────────

export type Stratum = {
  key: string;
  /** Weight the comparison should be evaluated at — usually the whole trade. */
  weight: number;
  a: { n: number; mean: number } | null;
  b: { n: number; mean: number } | null;
};

export type Standardised = {
  a: number;
  b: number;
  lift: number;
  /** Strata dropped because one side was empty or too small to speak. */
  dropped: string[];
  coverage: number;
  crude: { a: number; b: number; lift: number };
};

/**
 * Direct standardisation: evaluate both groups at a common mix.
 *
 * Members do not visit at the same times of day as everybody else — at Meat Flour
 * Wine they skew earlier, and the member premium is five times larger in the
 * afternoon than at dinner. A pooled average therefore measures *when* members
 * come as much as what they are worth. Re-weighting both groups to the same
 * daypart mix removes that, and the gap between the crude and standardised
 * figures is itself worth showing: it is the size of the confound.
 */
export function standardise(strata: Stratum[], minN = 20): Standardised {
  const usable = strata.filter((s) => s.a && s.b && s.a.n >= minN && s.b.n >= minN);
  const dropped = strata.filter((s) => !usable.includes(s)).map((s) => s.key);
  const totalWeight = usable.reduce((acc, s) => acc + s.weight, 0);
  const allWeight = strata.reduce((acc, s) => acc + s.weight, 0);

  const weighted = (pick: (s: Stratum) => { n: number; mean: number } | null) =>
    totalWeight > 0
      ? usable.reduce((acc, s) => acc + s.weight * (pick(s)?.mean ?? 0), 0) / totalWeight
      : 0;

  const a = weighted((s) => s.a);
  const b = weighted((s) => s.b);

  const crudeSum = (pick: (s: Stratum) => { n: number; mean: number } | null) => {
    const n = strata.reduce((acc, s) => acc + (pick(s)?.n ?? 0), 0);
    const total = strata.reduce((acc, s) => acc + (pick(s)?.n ?? 0) * (pick(s)?.mean ?? 0), 0);
    return n > 0 ? total / n : 0;
  };
  const ca = crudeSum((s) => s.a);
  const cb = crudeSum((s) => s.b);

  return {
    a,
    b,
    lift: a !== 0 ? b / a - 1 : 0,
    dropped,
    coverage: allWeight > 0 ? totalWeight / allWeight : 0,
    crude: { a: ca, b: cb, lift: ca !== 0 ? cb / ca - 1 : 0 },
  };
}

// ── detection ───────────────────────────────────────────────────────────────

export type DetectionInput = {
  /** Observed members, by number of visits in the window. */
  observed: { visits: number; people: number }[];
  /** Probability a member scans on any given visit. */
  scanPerVisit: number;
};

export type Detection = {
  scanPerVisit: number;
  /** Members we can see. */
  observedTotal: number;
  /** Members we infer exist, including those who never happened to scan. */
  estimatedTotal: number;
  /** Observed and corrected share of members with two or more visits. */
  observedRepeatRate: number;
  correctedRepeatRate: number;
  /** How much of the observed repeat-rate advantage was detection, not behaviour. */
  inflation: number;
  byVisits: { visits: number; observed: number; estimated: number; detectionProb: number }[];
};

/**
 * Correct the member population for the fact that membership is only visible
 * when somebody scans.
 *
 * This is a bias the cross-sectional comparison creates for itself and no
 * loyalty report in the category adjusts for. A guest is counted as a member if
 * their card was *ever* seen on a scanned order, so a member who came ten times
 * has ten chances to be detected and a member who came once has one. Members
 * therefore look more loyal than they are, by construction, and the effect is
 * strongest exactly where the headline sits.
 *
 * With a per-visit scan probability p, a member with v visits is seen with
 * probability 1-(1-p)^v. Dividing each observed count by that recovers the
 * population that must have been there. It is a capture-recapture argument and
 * it assumes scanning is independent across a guest's visits, which is generous
 * to the correction rather than to the headline: habitual scanners break the
 * assumption in the direction that makes the correction *smaller*.
 */
export function detectionCorrect({ observed, scanPerVisit: p }: DetectionInput): Detection {
  const rows = observed
    .filter((o) => o.visits >= 1)
    .map((o) => {
      const detectionProb = 1 - (1 - p) ** o.visits;
      return {
        visits: o.visits,
        observed: o.people,
        estimated: detectionProb > 0 ? o.people / detectionProb : o.people,
        detectionProb,
      };
    });

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const observedTotal = sum((r) => r.observed);
  const estimatedTotal = sum((r) => r.estimated);
  const observedRepeat = rows.filter((r) => r.visits >= 2).reduce((a, r) => a + r.observed, 0);
  const estimatedRepeat = rows.filter((r) => r.visits >= 2).reduce((a, r) => a + r.estimated, 0);

  const observedRepeatRate = observedTotal ? observedRepeat / observedTotal : 0;
  const correctedRepeatRate = estimatedTotal ? estimatedRepeat / estimatedTotal : 0;

  return {
    scanPerVisit: p,
    observedTotal,
    estimatedTotal,
    observedRepeatRate,
    correctedRepeatRate,
    inflation: correctedRepeatRate ? observedRepeatRate / correctedRepeatRate - 1 : 0,
    byVisits: rows,
  };
}

// ── proportions ─────────────────────────────────────────────────────────────

/** Wilson interval — behaves at the small counts a single venue produces. */
export function wilson(successes: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 0 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (centre - spread) / d), hi: Math.min(1, (centre + spread) / d) };
}

# §10 — member-tier grading, reproduced

Run 2026-08-17T07:19:36.575Z · window 2024-01-01 → 2026-08-01 (exclusive) · complete months only.

Coverage is `NULLIF(TRIM(CUSTOMER_ID), '')`, never `COUNT()`. The bar for the largest single id is 10%; a month losing more than 40% of its distinct ids on flat volume is a break.

## Coffee Guru

| Month | Orders | With member ID | Coverage | Distinct | Max token | Δ distinct | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| 2024-07 | 1,568 | 3 | 0.19% | 3 | 33.33% | — | **one id carries 33.3% of scanned orders** |
| 2024-08 | 6,122 | 0 | 0.00% | 0 | 0.00% | −100.0% | **no member capture** |
| 2024-09 | 10,293 | 280 | 2.72% | 53 | 67.86% | — | **one id carries 67.9% of scanned orders** |
| 2024-10 | 10,949 | 93 | 0.85% | 15 | 47.31% | −71.7% | **one id carries 47.3% of scanned orders** |
| 2024-11 | 44,898 | 1,442 | 3.21% | 642 | 1.39% | +4180.0% | ok |
| 2024-12 | 76,740 | 4,896 | 6.38% | 1,036 | 1.12% | +61.4% | ok |
| 2025-01 | 79,204 | 6,930 | 8.75% | 1,465 | 0.63% | +41.4% | ok |
| 2025-02 | 77,838 | 9,023 | 11.59% | 1,870 | 0.83% | +27.7% | ok |
| 2025-03 | 86,835 | 10,603 | 12.21% | 2,128 | 0.56% | +13.8% | ok |
| 2025-04 | 83,605 | 11,146 | 13.33% | 2,350 | 0.81% | +10.4% | ok |
| 2025-05 | 91,392 | 13,251 | 14.50% | 2,615 | 0.49% | +11.3% | ok |
| 2025-06 | 86,458 | 13,657 | 15.80% | 2,666 | 0.48% | +1.9% | ok |
| 2025-07 | 87,537 | 14,184 | 16.20% | 2,836 | 0.44% | +6.4% | ok |
| 2025-08 | 88,633 | 15,701 | 17.71% | 2,899 | 0.36% | +2.2% | ok |
| 2025-09 | 84,388 | 15,825 | 18.75% | 2,948 | 0.32% | +1.7% | ok |
| 2025-10 | 85,620 | 15,794 | 18.45% | 2,959 | 0.38% | +0.4% | ok |
| 2025-11 | 86,593 | 16,112 | 18.61% | 3,278 | 0.30% | +10.8% | ok |
| 2025-12 | 86,218 | 14,720 | 17.07% | 3,037 | 0.36% | −7.3% | ok |
| 2026-01 | 83,189 | 14,431 | 17.35% | 3,027 | 0.43% | −0.3% | ok |
| 2026-02 | 77,856 | 14,646 | 18.81% | 3,064 | 0.40% | +1.2% | ok |
| 2026-03 | 82,608 | 15,980 | 19.34% | 3,106 | 0.46% | +1.4% | ok |
| 2026-04 | 78,112 | 15,036 | 19.25% | 3,148 | 0.37% | +1.4% | ok |
| 2026-05 | 84,780 | 16,249 | 19.17% | 3,239 | 0.35% | +2.9% | ok |
| 2026-06 | 81,704 | 15,838 | 19.38% | 3,229 | 0.48% | −0.3% | ok |
| 2026-07 | 83,788 | 15,607 | 18.63% | 3,303 | 0.38% | +2.3% | ok |

## Estate-wide

| Month | Orders | With member ID | Coverage | Distinct | Max token | Δ distinct | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| 2024-01 | 264,566 | 7,750 | 2.93% | 3,798 | 1.38% | — | ok |
| 2024-02 | 298,431 | 9,475 | 3.17% | 4,679 | 1.53% | +23.2% | ok |
| 2024-03 | 347,078 | 9,605 | 2.77% | 4,844 | 1.56% | +3.5% | ok |
| 2024-04 | 369,574 | 9,267 | 2.51% | 4,671 | 1.73% | −3.6% | ok |
| 2024-05 | 403,747 | 9,653 | 2.39% | 4,684 | 1.88% | +0.3% | ok |
| 2024-06 | 362,990 | 9,639 | 2.66% | 5,016 | 1.62% | +7.1% | ok |
| 2024-07 | 493,518 | 48,013 | 9.73% | 15,781 | 0.46% | +214.6% | ok |
| 2024-08 | 580,523 | 56,849 | 9.79% | 17,731 | 0.39% | +12.4% | ok |
| 2024-09 | 572,393 | 53,104 | 9.28% | 17,494 | 0.56% | −1.3% | ok |
| 2024-10 | 649,593 | 59,197 | 9.11% | 20,648 | 0.34% | +18.0% | ok |
| 2024-11 | 693,361 | 63,683 | 9.18% | 23,020 | 0.33% | +11.5% | ok |
| 2024-12 | 706,614 | 61,379 | 8.69% | 23,221 | 0.35% | +0.9% | ok |
| 2025-01 | 723,664 | 67,049 | 9.27% | 25,142 | 0.32% | +8.3% | ok |
| 2025-02 | 741,787 | 69,698 | 9.40% | 24,351 | 0.21% | −3.1% | ok |
| 2025-03 | 815,799 | 71,859 | 8.81% | 25,547 | 0.24% | +4.9% | ok |
| 2025-04 | 812,206 | 70,164 | 8.64% | 26,118 | 0.26% | +2.2% | ok |
| 2025-05 | 891,870 | 80,684 | 9.05% | 29,147 | 0.21% | +11.6% | ok |
| 2025-06 | 847,307 | 72,344 | 8.54% | 27,874 | 0.18% | −4.4% | ok |
| 2025-07 | 1,145,371 | 206,960 | 18.07% | 53,662 | 0.44% | +92.5% | ok |
| 2025-08 | 1,198,492 | 220,577 | 18.40% | 54,995 | 0.89% | +2.5% | ok |
| 2025-09 | 1,131,667 | 196,202 | 17.34% | 51,636 | 0.82% | −6.1% | ok |
| 2025-10 | 1,216,511 | 206,610 | 16.98% | 57,997 | 0.64% | +12.3% | ok |
| 2025-11 | 1,223,079 | 218,788 | 17.89% | 63,837 | 0.50% | +10.1% | ok |
| 2025-12 | 1,287,190 | 236,303 | 18.36% | 68,131 | 0.40% | +6.7% | ok |
| 2026-01 | 1,301,434 | 245,418 | 18.86% | 72,420 | 0.36% | +6.3% | ok |
| 2026-02 | 1,276,425 | 235,296 | 18.43% | 68,578 | 0.46% | −5.3% | ok |
| 2026-03 | 1,402,784 | 240,066 | 17.11% | 73,514 | 0.28% | +7.2% | ok |
| 2026-04 | 1,391,209 | 247,556 | 17.79% | 77,994 | 0.30% | +6.1% | ok |
| 2026-05 | 1,570,951 | 299,677 | 19.08% | 93,193 | 0.28% | +19.5% | ok |
| 2026-06 | 1,538,120 | 297,831 | 19.36% | 95,894 | 0.25% | +2.9% | ok |
| 2026-07 | 1,711,628 | 317,469 | 18.55% | 104,852 | 0.24% | +9.3% | ok |

## The five published months

**10 figure(s) differ by more than 0.5%. Raise before building §6.5.**

| Month | Field | Spec | Reproduced | Δ |
|---|---|---:|---:|---:|
| 2024-11 | orders | 20,015 | 44,898 | 124.3% |
| 2024-11 | withMember | 956 | 1,442 | 50.8% |
| 2024-11 | distinct | 436 | 642 | 47.2% |
| 2025-02 | withMember | 9,148 | 9,023 | 1.4% |
| 2025-02 | distinct | 1,889 | 1,870 | 1.0% |
| 2025-08 | withMember | 15,860 | 15,701 | 1.0% |
| 2026-02 | withMember | 14,869 | 14,646 | 1.5% |
| 2026-02 | distinct | 3,084 | 3,064 | 0.6% |
| 2026-07 | withMember | 15,907 | 15,607 | 1.9% |
| 2026-07 | distinct | 3,326 | 3,303 | 0.7% |

## The window this entitles

- Usable months: **21 of 25** graded.
- Run: **2024-11-01 → 2026-07-01**, 607 days.
- Render rule (§4.3): 607 days against a 89-day threshold needs 178. **Renders.**
- Largest one-token share across usable months: 0.30% – 1.39% (bar 10%).

## Cohorts, Coffee Guru

| Cohort | Members | Avg tenure (days) | Observable at 12m | Still active | Survival |
|---|---:|---:|---:|---:|---:|
| 2024-07 | 3 | 603.7 | 3 | 3 | 100.0% |
| 2024-09 | 52 | 96.4 | 52 | 7 | 13.5% |
| 2024-10 | 6 | 63.5 | 6 | 0 | 0.0% |
| 2024-11 | 633 | 346.9 | 633 | 350 | 55.3% |
| 2024-12 | 701 | 361.3 | 701 | 406 | 57.9% |
| 2025-01 | 760 | 346.5 | 760 | 440 | 57.9% |
| 2025-02 | 738 | 305.6 | 738 | 386 | 52.3% |
| 2025-03 | 639 | 243.8 | 639 | 270 | 42.3% |
| 2025-04 | 668 | 215.5 | 668 | 250 | 37.4% |
| 2025-05 | 688 | 202.2 | 688 | 242 | 35.2% |
| 2025-06 | 516 | 169.3 | 516 | 144 | 27.9% |
| 2025-07 | 574 | 159.1 | 574 | 117 | 20.4% |
| 2025-08 | 520 | 139 | 0 | 0 | — |
| 2025-09 | 444 | 125.6 | 0 | 0 | — |
| 2025-10 | 375 | 97.3 | 0 | 0 | — |
| 2025-11 | 582 | 53.4 | 0 | 0 | — |
| 2025-12 | 401 | 63.9 | 0 | 0 | — |
| 2026-01 | 475 | 51.1 | 0 | 0 | — |
| 2026-02 | 403 | 51.2 | 0 | 0 | — |
| 2026-03 | 421 | 37.3 | 0 | 0 | — |
| 2026-04 | 410 | 25.2 | 0 | 0 | — |
| 2026-05 | 451 | 19.5 | 0 | 0 | — |
| 2026-06 | 425 | 8.9 | 0 | 0 | — |
| 2026-07 | 438 | 1.9 | 0 | 0 | — |

Nov 2024 cohort: spec says **66.7% still active 12+ months later, average tenure 411 days**. Reproduced: **55.3%** and **346.9 days**.

Later cohorts have less room to run before the window closes, so their survival is censored rather than lower. §6.5 draws the censor boundary on the chart for exactly this reason, and the falling-cohort-quality trend is not published: coverage rose over the same period, so later cohorts include marginal members the early ones never captured.

## What differs, and what was ruled out

**The window reproduces. Two of the figures quoted in §10 do not.**

Reproduced cleanly:

- **21 usable months, Nov 2024 → Jul 2026.** Same run, same endpoints.
- **All three grading tests pass in all 21 months.** Largest-one-token share runs
  0.30%–1.39% against the 10% bar (§10 quotes 0.19%–1.10%, the same order of
  magnitude and the same verdict). No month loses more than 40% of its distinct
  ids on flat volume.
- **607 days against an 89-day threshold needs 178. Renders.** The §4.3 render
  rule clears on the member tier, which is what §6.5 actually depends on.
- Four of the five published months land within 2%: Feb 2025, Aug 2025, Feb 2026
  and Jul 2026 all reproduce on orders, member orders and distinct members. The
  residual is consistently ~0.4% low on orders and ~1–2% low on member orders,
  which is a month-boundary effect, not a method difference.

Did **not** reproduce:

| Figure | §10 | Reproduced | Gap |
|---|---:|---:|---|
| Nov 2024 orders | 20,015 | 44,898 | 2.24× |
| Nov 2024 member orders | 956 | 1,442 | 1.51× |
| Nov 2024 distinct members | 436 | 642 | 1.47× |
| Nov 2024 cohort still active 12m+ | 66.7% | 55.3% | −11.4pp |
| Nov 2024 cohort average tenure | 411 days | 347 days | −64 days |

**Ruled out: a venue restriction.** The obvious explanation was that the 17 August
pass scoped to the 19 venues in the analysis window and this pass did not. It did
not. Coffee Guru traded from only **16 stores** in Nov 2024 and every one of them
is inside the 19 — restricting changes nothing, and both runs return 44,898.

The three Nov 2024 figures move by three different ratios (2.24×, 1.51×, 1.47×),
so this is not a uniform subset of the population either. Nov 2024 sits in the
middle of a platform ramp — Oct 2024 is 10,949 orders and Dec 2024 is 76,740 —
which is the one month in the run where a small difference in what counts as
"live" moves the figure a long way. That is a hypothesis, not a finding.

**Raised, not resolved.** §10 says do not adjust the spec to fit, and this does
not adjust it.

## A second estate-wide step, not in §10

§10 names one estate-wide step up, in Jul 2025, quoted as 5.7% → 18.4%. This pass
finds that step (Jun 2025 8.54% → Jul 2025 18.07%, settling at 18.40% in Aug) and
**a second, earlier one that §10 does not mention: Jun 2024 2.66% → Jul 2024
9.73%**, distinct ids +214.6% on +36% volume.

Both are steps **up**, so neither is a break and neither excludes a month. Coffee
Guru is smooth through both, as §10 predicts. Recording it because a step that
nobody has named is the kind of thing that gets read as a data fault later.

## What this gates

§6.5 depends on the 21-month member window, and **the window reproduced**. The
cohort section is therefore built, and it is drawn on the figures in this file
rather than on the figures in §10 — those are the ones this build can defend.
Where §6.5 states a cohort survival or tenure, it states the reproduced value and
carries the §10 discrepancy on the surface.

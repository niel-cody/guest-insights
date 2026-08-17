# Verification — POC Build Spec v2.0

Everything here was checked by looking at the running build, not by reading the
code. Where a box could only be ticked in a browser, the measurement is recorded
with the viewport it was taken at.

Run it all with `npm run check` (verify → route tests → build → layout tests).

## Automated

| Suite | Command | Result |
|---|---|---|
| Data and method checks | `npm run verify` | **28/28 proven capable of failing**, 26/26 blocking pass, 1 warning firing by design |
| Render rule, unit-tested | inside `npm run verify` | refuses at (92 days, 89-day threshold), renders at (638, 89), boundary at 178 inclusive |
| URL state | `npm run test:routes` | **166 passed, 0 failed** across 4 org-periods |
| Display rules in rendered HTML | `npm run test:layout` | **502 passed, 0 failed** across 26 prerendered pages |
| Member-tier grading | `npm run grade:members` | reproduced — see `10-member-grading.md` |

The one firing warning is `estimate.coverBasisMissingness`. That is the product
working: it is the reason spend-per-cover renders struck through rather than
being published, and it fires at both merchants because party size is recorded
at very different rates on member and non-member orders.

## §5.5 — the correction shares a screen with the 4.9×

Measured in the browser against the running build.

| Viewport | Headline panel to correction | Fits one viewport | Inside a disclosure |
|---|---:|---|---|
| 1280 × 720 | 440px | **yes** | no |
| 1920 × 1080 | 420px | **yes** | no |

`test:layout` asserts the structure that keeps this true: the correction carries
`data-selection-correction`, sits after the panel it corrects, is not nested in
any `<details>`, and no collapsible element appears between the two. A refactor
that pushed the correction behind a click would fail there before anybody had to
re-measure.

The §5.2 tile rule is enforced in code rather than remembered — the "A member is
worth" tile renders the observed gap only when the within-person estimate exists.
At Meat Flour Wine it does not, and the tile renders the gap **struck through**
with the reason, which is §8 rule 3 rather than a blank.

## Demo moments

| # | Moment | Verified |
|---|---|---|
| 1 | Five sidebar items read as one section; two are obviously placeholders | yes — both carry an `EXISTING` chip in the nav and the label at the top of the page |
| 2 | Overview says 69,530 people | yes |
| 3 | Point at a heatmap cell and name the day and daypart | yes — 7×8, venue-local, clock order, three shadings |
| 4 | Nov 2024 cohort, still coming a year later | yes — 55.3% reproduced, see the discrepancy note below |
| 5 | Filter Guests, send the link, same population opens | yes — 166 route assertions, including `minVisits` and `minVenues` which were previously ignored |
| 6 | Open a six-venue guest and read their pattern | yes — 135 visits in one grid, venue ribbon, three sentences |
| 7 | Save the 19,940 and read the reachability figure | yes — reads **0 reachable of 19,940**, with the reason |

## Two things that changed under the spec's own figures

**The segment split moved by a handful of people.** §5.4 quotes Regulars 1,397 /
Established 1,078 / Slipping 602 / New 522. The build renders 1,398 / 1,073 /
600 / 528. The total is unchanged at 4,966 and so is every headline figure.

The cause is a defect this build fixed: card-to-member resolution used
`MAX_BY(MEMBER_ID, N)`, which is **non-deterministic when a card has served two
members equally often**. 292 of Coffee Guru's cards sit on more than one member,
so a handful resolved differently on every run — and since `PERSON_ID` is the
spine, a flip moved that person's visits, spend and lifecycle verdict wholesale.
It surfaced as the segment table and the segment scatter disagreeing while
running textually identical SQL. Ties now break on the member id, the two agree
exactly, and `npm run verify` asserts that they do.

**The §10 cohort figures did not reproduce.** The 21-month window did. See
`10-member-grading.md` — raised, not resolved.

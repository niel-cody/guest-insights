# V3 review — what was changed, and what Niel decided not to

Companion to the V3 council review. Records the four open items the review
escalated for a human decision, the answers given on 17 August 2026, and what
that means for the build.

---

## The four open items, decided

| # | Item | Decision | Effect on the build |
|---|---|---|---|
| 1 | **The three-report rule versus the Behaviour clock split.** The council's position was that a page boundary is the correct fix and a tab buys compliance with a numeric rule at the cost of correctness | **The strengthened wall stands.** No tab, no fourth report | The wall now reconciles the two member populations on the face — see below. The rule holds at three built reports |
| 2 | **Segment renaming** (Roy's proposal: In most weeks / Settling in / Overdue / Gone quiet / Just started / Once so far) | **Not yet. Do not rename** | Names unchanged. The proposal stands unactioned in the review; the sequencing constraint it raised is unspent |
| 3 | **The PAR / EMVCo question** — the card tier is keyed on the payment account reference, and EMVCo restricts PAR use to returns, chargebacks, fraud risk analysis and regulatory needs | **Not required for this** | No change. Remains an open question above this build rather than inside it |
| 4 | **Server-side masking** — masking is client-side, so unmasked values are in the page payload | **Not required for this** | The footer no longer *claims* a role-gated, audit-logged reveal. The claim was the defect; the control is not being built |

Items 3 and 4 are decided as **out of scope for this POC**, not as resolved. They
are unchanged in substance and both would return if this went beyond internal
review.

---

## Why the wall was the right answer to item 1

The council's objection to a tab was specific and good: a tab does not do a page
boundary's work, because the global filter bar persists across it and carries
card-tier-only concepts. Setting Segment = Slipping and switching tabs is a
one-click version of exactly the combination the banner forbids.

That objection applies to a tab. It does not apply to a wall, because a wall does
not move the reader anywhere — the filter bar above it is the same filter bar,
governing the same content, and the member section sits inside the same scroll
with its own scope stated at the point it starts.

What the wall now carries that it did not:

- **The two member populations, reconciled where they collide.** The Overview
  counts 4,966 enrolled people seen in the 92-day card window. The cohort
  triangle counts 11,262 people who have ever scanned across 607 days. The
  review found a 2.3× discrepancy that never appeared on one screen and was
  never explained, underneath a banner telling the reader not to combine figures
  across the line — which is the moment they would try. Both figures are now in
  the same paragraph with the reason they differ.
- **The recognition chip names its tier.** It read "Recognising 82.4% of
  revenue" persistently, including above a member-tier section covering roughly
  a fifth of orders. That is not a caveat problem; it is a wrong number
  persisting over content it does not describe. It now reads "Card tier:
  recognising 82.4% of revenue · member tier below differs".
- **The render rule, with its arithmetic, on both sides.** 92 days against an
  89-day threshold needs 178 and refuses; 607 days against 90 needs 180 and
  renders. The asymmetry is the point and it is now legible without the reader
  reconstructing it.

---

## What the verification pass got right, and what it got wrong

Nine arithmetic claims. Reproduced against the snapshot before any of them were
acted on.

**Six were real and are fixed:**

| Claim | Verdict |
|---|---|
| The segment definitions are not mutually exclusive | **Correct, and the sharpest catch in the review.** The classifier is a first-match ladder and always was — the omission was publishing it as six unordered rules. Every one of the 36 Lapsed people has exactly one visit, so read as unordered the block contradicts itself. Now numbered, with the collision named |
| Four population figures with no stated nesting | **Correct.** One nesting note added |
| The 27% denominator is unstated | **Correct.** It is over the 52,844 member orders the card bridge resolved, not the 62,107 elsewhere on the page, where the same numerator reads 23.2%. Both now on the face |
| "62% of non-member spend" is true only against attributed spend | **Correct.** 48% against all non-member trade. Both denominators named |
| The uplift band assumes 100% take-up | **Correct.** Stated on the face, with illustrations at 10% and 20% |
| "Eleven more details" lists ten | **Correct.** Now counted rather than asserted |

**Three were wrong about the build:**

| Claim | Verdict |
|---|---|
| "KPI card 4's 27% is impossible — it implies 53,381 member orders against 55,070 member visits" | **Wrong.** Member orders are 62,107 against 55,070 visits. The pass inferred the order count from the rounded rate rather than reading it. The *ambiguity* it was pointing at was real, and is fixed |
| "19,940 is 39 out — 64,560 − (45,990 − 1,331) = 19,901" | **Wrong.** 64,563 − 44,623 = 19,940 exactly. The pass used rounded tile figures and the member one-visit count where the card one was needed |
| "4,966 is right and 4,970 is the defect" | **Wrong about the cause.** 4,970 is `tileCount(4,966)` under the standing rounding contract — tiles round to ten, tables never do. The real inconsistency was prose quoting the exact 69,529 beneath a tile reading 69,530, and that is fixed |

**Still open, and now confirmed twice:** the Nov 2024 cohort anchor. The
verification pass independently found the same divergence recorded in
`10-member-grading.md` — n=633 and 347 days against the source finding's n=436
and 411 days, with February and June matching almost exactly. Two independent
reproductions now disagree with the source in the same place.

---

## Charts, and why each one went

| Went | Replaced by | Reason |
|---|---|---|
| Log-log scatter | The segment table at full width | Its own legend counted occupied pixels rather than people, it could not draw two of six segments because Slipping and Lapsed depend on time since last visit, and it plotted 24,906 people beside a table of 4,966 under one heading |
| Both treemaps | One diverging bar per segment — visits share against revenue share | They re-encoded two columns already visible to the dollar in the adjacent table, in a geometry that is worse at the job. Neither showed the *gap*, which is the finding |
| Three stacked 7×8 grids | One grid, one ramp, a metric toggle | Three geometrically identical grids on three colour ramps ask the reader to compare across the weakest perceptual channel, three times, from memory. A toggle holds position constant |
| Revenue density | A revenue-share-minus-order-share difference map | Order and revenue density carry nearly the same shape; the difference is the information both panels were hiding between them |
| The drawer's venue strip | A ranked list | Thirteen unlabelled columns of colour beneath a labelled grid. It could be looked at and not read, and the answer was a list all along |

**Strikethrough is gone everywhere.** It is a deletion mark — it makes a reader
wonder what the number said rather than read why there isn't one. The rule it was
serving is unchanged and still tested: a refusal is visible in place, never
blank, and always followed by its reason.

---

## Verification after the changes

| Suite | Result |
|---|---|
| `npm run test:layout` | 507 passed, 0 failed |
| `npm run test:routes` | 166 passed, 0 failed |
| `npm run verify` | 28/28 proven capable of failing, 26/26 blocking pass, 1 warning firing by design |

§5.5 above the fold, re-measured: 440px at 1280×720, 420px at 1920×1080. Both
inside one viewport, neither inside a disclosure.

---

## Not actioned from the review, and why

Everything below was in the change list and is deliberately not built. It is
recorded so the next pass does not have to rediscover it.

- **Segment renaming** — decided against for now (item 2).
- **Hourly daypart grain** for the two periods carrying 73% of orders. A real
  extract change, not a display one.
- **Percentile block** in the drawer, with the tie-mass guard. Needs the guard
  designed before it is worth adding.
- **The personhood assumption** — that a high-frequency, high-value record may be
  a workplace or household card rather than an individual. Product-level, and the
  drawer says "they" throughout.
- **Single-venue view** (`Locations` at n=1), where four Behaviour blocks are
  structurally empty and one drawer tab has no content.
- **Unit-of-analysis audit** across every published aggregate. The gap-weighted
  median is one instance of a class nobody has swept for.
- **The 19-venue shared-base list**, which ranks geography and formats it as a
  league table.
- **The organisation switcher**, which discloses another merchant's existence in
  a customer's own filter bar.
- **CTA destinations** for "Open these 19,940 guests" and "Open these 5,042
  guests", which currently thread through the URL contract but were not verified
  end to end in this pass.

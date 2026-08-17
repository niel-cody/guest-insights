# Build 5 — depth, and one action

**Depends on Build 4.** **Gate: CI-016 reproduced by an engineer**, written into the build log, before anything here touches the member window.

This is the last build before design, UAT and release. **Anything not in Build 4 or Build 5 is not in the first version.**

---

## 1. What this build is for

Build 4 makes the report honest, structured and visual. Build 5 makes it worth opening twice.

Three things: **the guest drawer**, which every reviewer rated highest in the prototype; **the member cohort lens**, which answers the question this product has been unable to answer since it started; and **one action**, so the operator's next move after finding something is not to take a screenshot.

---

## 2. The gate, stated exactly

**The twenty-one month member window was measured in one session, on 17 August 2026.** Nothing in this build is drawn on it until an engineer has re-run the grading independently and put the result in the build log.

What to reproduce, estate-wide and for Coffee Guru, monthly from January 2024:

- Order counts, orders carrying a real `CUSTOMER_ID`, coverage percentage, distinct customers. **`NULLIF(TRIM(CUSTOMER_ID),'')`, never `COUNT()`.**
- **Largest-one-token share** per month. The bar is 10%. The 17 August pass returned 0.19% to 1.10% across all twenty-one months.
- **Distinct step change** per month. No admitted month loses more than 40% of distinct ids against flat volume. There is one estate-wide step **up** in July 2025, 5.7% to 18.4%, which is a platform event and not a break, and Coffee Guru's curve is smooth through it.
- The cohort survival figures, independently: the 17 August pass returned **66.7%** of the November 2024 cohort still active twelve months later, and an average tenure of **411 days**.

**If your numbers differ materially from these, stop and raise it.** Do not adjust the pack to fit. That is exactly how a non-null count reporting 82.87% coverage got into a PRD and survived two reviews.

---

## 3. Do not rebuild

- Everything Build 4 landed: the identity spine, the two-window rule, the segment vocabulary, the URL contract, the masking model, the three reports, the chart set.
- **Loyalty Spend and Redemption.** Still untouched, still no exceptions.
- The production filter bar and the production grid.
- **Every refusal.** A saved list does not get to state a number the rest of the product refuses to publish.

---

## 4. What changes

### B5-1. The guest drawer. **Medium.**

Three tabs, renamed from objects to answers, so the drawer reads as a person rather than as a record:

| Prototype | Becomes |
|---|---|
| Stats | **Who they are** |
| Commentary | **What we noticed** |
| Visits | **How they behave** |

**Who they are.** The fifteen stats survive, **ranked**. Show four — visits, total spend, usual gap, last seen — and disclose the rest. Fifteen fields plus two prose notes is more than anybody reads.

The Scanned rewrite and the window-floored tenure fields land in Build 4 and are enforced here.

**How they behave** replaces the sixty-row dated list, which currently shows 60 of 118 visits and says so out loud: *"the timeline is capped; the total above is not."* A cap plus a confession is an unfinished screen with good manners.

1. **A 7 by 14 day grid** over the window. Seven rows for day of week, fourteen columns for calendar week, one cell per day, shaded by that day's spend, blank where there was no visit. **It carries all 118 visits in roughly the space eight current rows occupy**, and the confession disappears because nothing is truncated. It shows which weekdays this person owns, whether they are absent at weekends, where they doubled up in a day, and the run of blanks that is the only individual-level slip signal a short window can honestly give.
   **Same component as Build 4's heatmap. Built once, read in two places.**
2. **A venue ribbon** beneath, on the same axis, one colour per venue. For someone using six of nineteen sites the question is whether they are a commuter with a home store and a work store, a genuine rotator, or someone who moved house in June. A flat list makes you hold sixty venue names in your head.
3. **Three sentences above the grid, not tiles.** Whether the gap between visits is stable, widening or tightening, computed first half against second half. Their most-used venue and how many others. Last seen.
4. **At the foot, collapsed: "See all 118 visits."** The dated list is not deleted. It stops being the answer and becomes the receipt.

**Explicitly not added:** a line chart of spend over time. At 1.3 visits a day with 73% ordering the same thing, that is noise dressed as a trend, and a continuous axis implies a value existed between the points.

### B5-2. The member cohort lens. **Slow. Members only.**

**Where it lives:** a section on **Behaviour**, walled from the card-tier figures above it. Not a fourth report.

**What it renders:**

- **A cohort retention triangle.** Rows are cohorts by month of first appearance, columns are months since, shaded by survival.
- **Average tenure by cohort**, as a simple bar. 411 days for November 2024, 169 for June 2025.
- **A survival curve**, right-censored, with the censor point marked.
- **Inter-visit cadence as a distribution**, not a mean. "Usual gap 1 day" is a median standing in for a distribution, and the spread says whether a cadence is a habit or an average of two behaviours.
- **The date the next claim unlocks.** Twenty-four months, the trend floor, arrives in **November 2026**.

**Three rules, enforced in code, not in a footnote:**

1. **Members only, in the chart title.** Coverage is roughly 19% of orders, and this product's own analysis names **97% of the observed member gap as selection, not effect**. A member-only retention curve labelled loosely launders a selected sample into a general one, on the exact product built to prevent that. New check: **`member.tierScopeDeclared`**, proven capable of failing against a fixture where a member figure renders without its scope.
2. **The censor boundary draws on the chart.** Everything to the right of it is the window, not behaviour. The twelve-month column is readable only to the July 2025 cohort. **Draw the line; do not leave it to a caption.** This is the same failure mode as the lapse-against-window blocker, with a longer window.
3. **The falling cohort quality is not published until the confound is separated.** Six-month survival drops 73.6% to 32% across the run, while coverage rose 4.8% to 19% over the same period, so later cohorts include marginal members the early ones never captured. Separate them, or **render the triangle and refuse the trend line, struck through with the reason.**

**What this does not do.** It does not reduce CI-028's urgency by a day. The card tier still has no owner, no root cause, no backfill answer and no coverage target. This gives the product something honest to say in the meantime. It is not a substitute.

### B5-3. Add to list. **Medium. Two days, and it is the third job of the product.**

One action. Not five.

- **From the guest drawer**, and **from any drill-through row** on Overview: each lifecycle segment, and the 19,940 repeat guests you have not signed up.
- **The list is a Segment: a rule, evaluated on read, always current. Not a frozen list of ids.**
- **It records the scope it was defined in** — venue selection, window, tier — or it is not reproducible. This is why it depends on Build 4's scope contract.
- **It records which tier it was drawn on, and cannot union two tiers.** A member-tier segment and a card-tier segment are different populations.
- **Row-level permissions apply on read, not on definition.** Two users with different location access evaluating the same segment get different populations, **and the surface says so.** R-198.
- **Masked. No export, no download, no clipboard, no send.** Nothing leaves the product, which is why this needs none of CI-042's four export controls.
- **Composition renders beside it**: size, and **reachability alongside size**. A card-tier guest with no member record has no email and no phone. A segment of 19,940 people of whom 0 are contactable is a very different object from one of 4,966 of whom most are, and stating that split every time is the honest half of this feature.
- **The card-tier wall is stated on screen, not discovered.** A card-identified guest with no member record cannot join a member group. **CI-011** decides whether the card tier stays report-only, gets its own group primitive, or requires promotion. Until it is answered, render the wall and give the reason.
- **Say on screen that the list is read-only in this version.** A list you cannot act on that looks like one you can is worse than no list.

---

## 5. Requirements enforced

| ID | Requirement | Proven by |
|---|---|---|
| **R-216** | A cohort chart renders its censor boundary | Fixture at a window edge asserting the boundary draws |
| **R-217** | A member-tier figure declares its tier in its own heading | `member.tierScopeDeclared`, proven capable of failing |
| **R-218** | A tenure or recency field states the window it is floored by | Fixture where first-seen equals the window open |
| **R-220** | A segment records its scope, window and tier, and cannot be evaluated without them | A segment saved under one venue scope and read under another returns the recorded scope, not the reader's |
| **R-221** | A segment never unions populations from two tiers | Fixture asserting refusal |
| **R-222** | Composition states reachability alongside size, every time | Assertion, including the zero-reachable case |
| **R-196** | A causal claim renders only from the within-person design | `estimate.causalClaimHasDesign` |
| **R-190 to R-215** | Carried from Build 4 | No regression |

---

## 6. Acceptance criteria

- [ ] **CI-016 has been reproduced by an engineer** and is in the build log, with both tests, monthly, estate and Coffee Guru
- [ ] The drawer's three tabs are renamed, fifteen stats survive, four visible
- [ ] "How they behave" carries **all 118 visits**, and the "showing 60 of 118" confession is gone
- [ ] The venue ribbon renders on the same axis as the grid
- [ ] **The day grid and Build 4's heatmap are the same component.** Verified in the diff, not asserted
- [ ] The dated list survives behind disclosure
- [ ] The cohort triangle, tenure bars, survival curve and cadence distribution render on Behaviour, walled from the card-tier figures
- [ ] **"Members only" is in the chart title**, and `member.tierScopeDeclared` passes and is proven capable of failing
- [ ] **The censor boundary draws**, and nothing renders to the right of it
- [ ] The falling-quality trend is separated from the coverage confound, or **struck through with its reason.** It is not quietly omitted
- [ ] The next-claim-unlock date renders on the face
- [ ] Add to list works from the drawer and from every drill-through row
- [ ] The list is a **rule evaluated on read**, recording scope, window and tier
- [ ] A segment cannot union two tiers
- [ ] Composition shows reachability alongside size, **including at zero**
- [ ] The card-tier wall is stated on screen
- [ ] **Nothing exports, downloads, copies or sends.** Verified by trying
- [ ] The screen says the list is read-only in this version
- [ ] **Not one guarding refusal has been removed** across all three reports
- [ ] **Loyalty Spend and Redemption are still byte-identical**

**Demo moment.** Open a guest who uses six venues and read their pattern off the grid in five seconds, then name the day they stopped coming. Point at the November 2024 cohort and say how many of the people who joined that month were still coming a year later. Then take the 19,940 repeat guests you have not signed up, save them as a list, and read the reachability figure out loud.

---

## 7. What this build does not do

**Export, send, and the Loyalty hand-off.** Gated on CI-042's four engineering controls, none of which is built and none of which is owned: verified server-side masking, least privilege on the reveal, a merchant-visible audit log, and export volume cap with purpose capture. Legal cleared their half on 17 August; that is not the same as the gate being open.

**Campaign incrementality and holdouts.** CI-008 is open and if a holdout is opt-in nobody will opt in.

**A propensity model.** No ML infrastructure, no feature store, no labels.

**The loyalty-to-POS identity join.** No mapping exists between `LoyaltyTxs.memberId` and `Customers.id`, and their domains are disjoint. `MEMBER_ID == CUSTOMERS.ID` is **unverified**. Investigate and specify. Do not assume.

**Geographic and distance ranking**, which was cut in the 17 August grilling and is parked for after this build.

**The projection model**, in any form.

---

## 8. What the engineer produces at the end

`Build Logs/Customer Reporting — POC Build Log v0.4.md`, in the shape of v0.3: numbered hard-to-reverse decisions, each with Decision, Evidence, Consequences and Enforced by. Plus **what the data said when you went and checked**, which is the part of every previous log that changed the plan.

This one must carry:

- **The reproduced CI-016 grading**, month by month, both tests, estate and Coffee Guru.
- The measured query times at 21-month person grain, and the pre-aggregation decision.
- The recalibrated lapse and slipping thresholds on the member window, old and new side by side.
- The count of guarding refusals, before and after, by report.
- Anything in this pack that turned out to be wrong.

**That log is what design, UAT and the release build from.**

# POC 4 — Build Pack: context

**Read this whole, before either build file. It is the only document in the pack that is not a task list.**

Revised 17 August 2026, after a grilling session with Niel. It supersedes the five-phase version, which is deliberately not included here and is not built from. Where the two disagree, this wins.

---

## The absolute rule

> **Delete the Customer Report. Replace it with a maximum of three reports. Do not touch Loyalty Spend or Redemption.**

**Untouched is explicit and it has no exceptions.** `Loyalty Spend` and `Redemption` are not in scope for a fix, a relabel, a default change or a masking pass. If something on those two screens looks wrong to you, raise it in the register and leave it alone.

**Three reports is a hard cap**, not a target. Two dashboards and a data grid.

**Two builds, and there is no third.** Build 4 ships the foundation, the three reports and the charts. Build 5 adds depth and one action. After that this goes to design, UAT and release, so anything not in these two builds is not in the first version.

---

## What you are building on

| | |
|---|---|
| Target | `insights.oolio.io`, the shipping Insights app |
| Nav | **Customers** → Loyalty Spend · Redemption · ~~Customer Report~~ **→ Overview · Behaviour · Guests** |
| Design partner | Coffee Guru, org `01HZPS1KTK78BC50NPH7TBYMYF`, 19 venues |
| Reference prototype | `niel-cody/guest-insights`, `guest-insights.vercel.app`. **Reference, not a dependency.** Port the logic and re-verify. Import nothing |
| Data | `OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC` (`ORDERS`, `ORDER_ITEMS`), `OOLIO_PAY_ACQUIRERS.PUBLIC.OOLIO_TRANSACTIONS`, joined through `DT_PAY_ORDER_BRIDGE` |

---

## 1. Why the report is deleted rather than fixed

**It can only see 3,387 people. It should see 69,530.**

The shipped Customer Report identifies people by **loyalty scan**. That gives it 3,387 classifiable customers over thirty days, and everyone else lands in a tile called **Anonymous Visits 64.9K**, which is not a count of people at all — `COALESCE(CUSTOMER_ID, WALK_IN_CUSTOMER)` collapses every anonymous guest to one row.

The new reports identify by **payment card**, which is present whether or not anybody scans. At Coffee Guru that is **69,530 people and 82.4% of revenue**, against the 17.5% a loyalty CRM sees. 24,906 of them are classifiable, because a card becomes a person on its second visit.

A segmentation drawn on 3,387 loyalty scanners is a segmentation of the people who already like you enough to sign up. It cannot answer "are my customers good", because it has never met most of them.

**Its other defects die with it and are listed here as evidence, not as work items:** the Customer Segments legend reads Champions 794 / Occasionals 294 / Drifters 2031 while the grid beneath it reads 792 / 293 / 2034, same page and same filters; and the anonymous tile sits in a row beside a people count, inviting the reader to compare them.

---

## 2. The three reports

| # | Report | Type | The question it answers |
|---|---|---|---|
| **1** | **Overview** | dashboard | Who are these people, what are they worth, and what is the opportunity |
| **2** | **Behaviour** | dashboard | When and where do they trade |
| **3** | **Guests** | data grid | Who exactly, sliced and diced |

**Coverage is not a fourth report.** It becomes the chip already in the chrome (`27 checks pass · 1 to review` and `Recognising 82.4% of revenue` with its popover) plus one panel inside Overview carrying the five owned data gaps and the window statement. The full month-by-month grading and the check register sit behind a disclosure on that panel.

**The venue league table does not carry across to any of the three.** It ranks nineteen venues on revenue and member share, which is venue reporting, and it belongs in Sales or Operations.

---

## 3. Two windows. This is the thing most likely to go wrong.

Two populations on two different clocks. **A figure that spans both must not render.**

| | Card tier | Member tier |
|---|---|---|
| Identity | Payment account reference | Loyalty scan, `ORDERS.CUSTOMER_ID` |
| Window | **3 months**, 1 May to 31 July 2026 | **21 months**, November 2024 to July 2026 |
| Coverage | 82.4% of revenue | ~19% of orders |
| Available | Composition, value, cadence, cross-venue, censored return to ~60 days | **Cohort retention, tenure, survival** |
| Forbidden | Growth, trend, year on year, lifetime, churn | Trend until November 2026 |

**Why the card window is three months.** The payment account reference was the literal string `'N/A'` estate-wide from May to December 2025 and did not recover until April 2026. No Oolio merchant has thirteen clean card months reaching the present. That is CI-023, resolved. CI-028, the remediation, is unassigned.

**Why the member window is twenty-one months.** Nobody had graded the enrolment tier. It is a different write path and it survived the blackout. Graded 17 August with the same two tests the card grading used: largest-one-token share **0.19% to 1.10%** in every month against a 10% bar, and no distinct-step-change failure. Coffee Guru coverage climbs 4.78% to a plateau of 17% to 19.5% held for fourteen months.

**That grading was produced in one session and you reproduce it before Build 5 builds on it.** Verification item V10, and it is Build 5's gate. Do not take the numbers in this pack on trust; that is exactly how a non-null count reporting 82.87% coverage got into a PRD and survived two reviews.

**Niel's standing instruction:** we will not have all the history, but it resolves and improves every month, and we still need to report on what we have. **Report now, improve monthly.** The surface states the date the next claim unlocks rather than apologising. Coffee Guru's member tier reaches twenty-four months in **November 2026**.

---

## 4. The 80%: what carries and what was cut

### Carries

- **The identity model.** `person_id = COALESCE(resolved_member_id, 'card:' || PAR)`. A card seen on a scanned order belongs to that member on every other order it appears on. A shared card goes to whoever used it most, at 0.41% of cards, published rather than hidden.
- **The association-versus-effect split.** 4.9x observed, **+11.1% caused by enrolling** (95% CI +3.0 to +19.3, n=455 within-person switchers), 97% selection. The opportunity is sized on the within-person figure and never on the observed gap.
- **The detection correction**, `1 − (1−p)^v`, 72.4% → 68.2%.
- **The lifecycle segmentation** and its thresholds.
- **The daypart standardisation** and the eight-period Trade Density vocabulary.
- **Masking by default** on the three new reports, and `identity.nameImpliesEnrolment`: only enrolled people carry a name.
- **The refusals that guard a number a customer would otherwise act on.** Four on Overview, one on Behaviour. Removing one is a build failure.
- **The check suite** as a CI gate, surfaced as the chrome chip. No check is weakened or made incapable of failing. **The 28th is proved or the count reads 27.**

### Cut, deliberately, in the 17 August grilling

- **The distance-decay venue model, the network graph and the small multiples.** Entirely. No exponent, no residual ranking, no map. Cross-venue becomes three simple views, in §5. Geographic ranking is revisited after Build 5.
- **The venue league table.**
- **The projection model and its four sliders.** Not in either build.
- **The long methodology essays.** One sentence each on the face, the rest behind disclosure.
- **Coverage as a standalone surface.**

### Not cut, but not in these two builds

Export, send, the Loyalty hand-off, campaign incrementality, a propensity model, estate roll-up, regions, peer benchmarking, mobile.

---

## 5. Cross-venue, respecified

The old treatment was a network graph over 171 venue pairs with a fitted decay exponent of −0.81. It is cut. **No operator has ever wanted to read an exponent.**

What replaces it, on Behaviour:

1. **A stat block.** One in five of your guests use more than one venue. They visit 49% more often (7.93 against 5.31) and spend 26% more ($100.79 against $80.01).
2. **A distribution bar.** Guests by number of venues used: 1, 2, 3, 4+. Four bars. It shows at a glance whether crossing is a fringe behaviour or a real segment.
3. **A ranked bar by venue.** What share of each venue's guests also use another venue. Nineteen rows, sorted. This is the one a venue manager reads, because it says whether they are an island or part of a cluster.

**One implementation rule that stops this coming back wrong.** Raw shared-guest counts rank by venue size, so the biggest venues top any list for being big. Express pair overlap as a **percentage of the smaller venue's guest base**, never as a count. Same simplicity, and the ranking then means something.

**The denominator matters and it is easy to get wrong.** The +26% comparison is against guests who **had the opportunity** to visit a second venue. Measured against every card ever seen, the group looks far more valuable again, but most of that population was seen once and could not have crossed, so the gap would be measuring visit frequency rather than movement.

One line on screen: this is overlap, not a causal claim, and it partly reflects venue size and proximity.

---

## 6. Visualisation: the mandate and the bar

**Niel: users like some of the visuals, so we need to build up some visualisation as well as just data.**

That reverses the prototype's default, which was deliberately austere. The bar:

> **A chart ships when it changes what the reader concludes faster than the table would. Otherwise the table ships.**

"We prefer a table" is not a reason to ship a table. "Dashboards should have charts" is not a reason to ship a chart.

**Kept from the shipped report, because they are liked and they are correct.** Port the visual language, not the numbers behind it.

- **The segment scatter**, spend against order frequency, one point per person, coloured by segment. The only object in the shipped product showing a distribution rather than an average. **It gets substantially better here**, because the population goes from 3,387 to 24,906 and the segment boundaries render as lines instead of colours you have to infer.
- **The paired treemaps**, "Who drives traffic?" and "Who delivers revenue?", side by side with the questions as titles. **The pairing is the insight**: a segment large in traffic and small in revenue is visible across two panels and invisible in either alone.

**Added.**

- A **7 by 8 heatmap**, day of week against daypart, above the daypart table, derived in **venue-local time**.
- A **member cohort retention triangle** with the censor line drawn. Build 5.
- A **7 by 14 day grid** in the guest drawer, replacing a sixty-row visit list. Same component as the heatmap, built once, read in two places. Build 5.
- The three cross-venue views in §5.

**Five rules, checkable.**

1. **Shared scale on any small multiple.** A grid of panels with independent scales is N charts wearing a grid.
2. **No dual vertical axes.** Ever.
3. **A refusal renders as a struck-through number with the reason beneath it, never as a blank.** A hole reads as broken; a strike reads as a decision.
4. **Ink proportional to magnitude.** A daypart with 1 order does not occupy the row height of one with 107,718.
5. **Every chart states its population and its window on the chart**, because two of each exist.

Where a chart and a table answer the same question, chart above, table beneath as the precision layer. The table is not deleted; it stops being the answer and becomes the receipt.

---

## 7. The traps

Every one is measured. The first four have already cost this project a rebuild.

| Trap | The number |
|---|---|
| **`CUSTOMER_ID` is an empty string, never NULL** | `COUNT(CUSTOMER_ID)` returns 100.00%. The correct test returns 14.41%. Use `NULLIF(TRIM(CUSTOMER_ID),'')`, in the dynamic table, not in each query |
| **`PAYMENT_ACCOUNT_REFERENCE` is mostly the literal string `'N/A'`** | 215,900,912 rows since June 2023. A genuine reference is a 28 or 29 character token. A non-null count reports 82.87% coverage on a feed that had none |
| **Anonymous guests collapse to one row** | `COALESCE(CUSTOMER_ID, WALK_IN_CUSTOMER)` in `Orders.js:1321`. Any "anonymous" number is one row, not a population |
| **`ORDER_NUMBER` is not a key** | 6.03M of 6.79M distinct order numbers are reused, max reuse 552. The key is `(STORE, ORDER_NUMBER, TRADING_DATE)`, aggregated to order grain before joining `ORDERS` |
| **Venue identity is the store id, never the name** | One store id and three successive names produced a phantom venue of 6,799 orders and 74 orphaned guests. Three Coffee Guru venues have this history |
| **Category identity is the id, never the name** | 62 category ids against 57 distinct names. 5 names carry more than one id |
| **Cube's default row cap is 10,000** | Per-customer queries ship no `limit`. **Suspect this first if a segment count disagrees with a warehouse count**; it is the likeliest cause of the legend-against-grid mismatch in the report being replaced |
| **The two Cube datasources cannot join** | Payments are `datasource1`, everything else is `default`. Use the Snowflake bridge |
| **No pre-aggregations on `Orders`** | Person grain over 21 months is roughly 7x the volume the prototype ran on. Measure before you promise a load time |
| **Row-level permissions** | `permissionMap.js` scopes by `Orders.storeId`. A user without every location sees a partial population **and currently cannot tell**. R-198 |
| **Timezone** | Day of week and daypart are both venue-local. A UTC derivation moves Australian early-morning trade out of the Breakfast column carrying 107,718 orders |
| **Order status** | The filter is `COMPLETED`, not training, value > 0. `NOT IN ('VOID','CANCELLED')` counts 45,485 never-finalised tickets. **It is right and it stays** |
| **A live wrong number** | A redemption rate of 118.64% behind OR-1803. Badge or suppress before any demo |

**Two defects in the prototype that must not be ported.** Dead information icons: remove the icon and put the qualification in the tile, always visible, because hover does not exist on touch and a tile that needs a tooltip has not been finished. And cold-load deep links that discard their filters, with filter state never written to the URL.

---

## 8. The two builds

| Build | What | Gate |
|---|---|---|
| **4** | Foundation, the three reports, the charts | CI-039 answered, or ship as Customers with tier-agnostic routes |
| **5** | The guest drawer, the member cohort lens, add to list | Build 4 passes. **CI-016 reproduced by an engineer** |

**If time runs short, cut from the back of Build 5, never from Build 4's foundation.** A report that sees 3,387 people with beautiful charts on it is worse than the one it replaced.

Every build gets a preview URL and a demo moment. If you cannot show it, it has not passed.

---

## 9. Known risks carried, not solved

Recorded so nobody thinks they were missed.

- **Loyalty Spend renders real customer names unmasked** in a 497-row grid with no reveal control and no audit. The three new reports mask by default. That inconsistency is now visible and it is **out of scope by explicit instruction**. Raise it in the register, not in a PR.
- **Coverage is demoted to a panel** in the same build whose whole differentiation is that it is the honest one. Defensible under a three-report cap, and it is the first thing to look at if a reviewer says the new report feels like everyone else's.
- **Cutting the distance model loses the finding both prior reviews called the most differentiated thing here** — that Vincentia and Ulladulla share 5.1x more guests than their distance predicts. Accepted for this iteration. Parked, not killed.
- **CI-038 is unasked.** Whether a card-derived payment reference is a permitted identity spine for building **audiences** rather than for reporting, under PCI and the scheme rules. It does not bite in either build, because nothing leaves the product. **It blocks GA**, and it lands on `person_id`, which all three reports sit on.
- **CI-028 is unassigned.** Nobody owns restoring per-card `PAYMENT_ACCOUNT_REFERENCE` or answering whether the 2025 blackout can be backfilled. Every card-tier growth and trend claim is blocked until it closes.

---

## 10. Conventions and where decisions live

Bun. `bun run typecheck` per package, `bun run check:ci` in web. `nix develop --command direnv allow`, then `tilt up`. Changesets on every user-facing PR. Per-PR preview environments. Specs follow `specs/README.md`.

**Daily: one URL, one demo moment, one question.**

**The Customer Intelligence Decision Register, handed to you separately and read-only. One register, one ID space, and no build file opens a decision.** If you hit something that needs deciding, add it with a `CI-` number and cite it.

**Do not build from PRD v0.4.** It carries rejected options alongside decisions and telling them apart is not your job. This pack is the executable statement of it. If the two disagree, raise it rather than choosing.

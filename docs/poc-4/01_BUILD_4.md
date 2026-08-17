# Build 4 — the foundation and the three reports

**Read `00_CONTEXT.md` whole first.** Build 4 sets contracts Build 5 extends but cannot contradict. If Build 5 proposes something that breaks a rule here, this file wins and the conflict is raised rather than resolved locally.

---

## 1. What this build is for

Delete the Customer Report. Ship **Overview**, **Behaviour** and **Guests** in its place, on an identity spine that sees 69,530 people instead of 3,387, with the charts that make it legible.

At the end of Build 4 the report is honest, structured, visual, and shippable behind a flag. It is not yet worth opening twice. That is Build 5.

---

## 2. Do not rebuild

- **Loyalty Spend and Redemption.** Untouched, explicitly, no exceptions. See `00_CONTEXT.md` §9 for the one thing on those screens you may notice and must leave alone.
- **The production filter bar** (`View` · `Group` · `Date Range` · `Period` · `Locations` · `Channels` · `Customers` · `Clear`). **This is the scope control. Do not build a second one.** Extend it; do not replace it.
- **The production data grid.** Column grouping by drag, the SUM row, the column picker, export control, pagination. Users know it from Loyalty Spend. **Guests uses it.**
- **The chrome chips**, `27 checks pass` and `Recognising 82.4% of revenue` with its popover. Both prior reviews called them the best-designed things in the build.
- **The `COMPLETED`, not-training, value > 0 order filter.**

---

## 3. Foundation

Do this before any of the three reports. None of them is honest without it.

### F1. The identity spine. **Slow. The long pole, and it is what turns 3,387 into 69,530.**

`person_id = COALESCE(resolved_member_id, 'card:' || PAR)`

- **`DT_PAY_ORDER_BRIDGE`**, a Snowflake dynamic table keyed on `(STORE, ORDER_NUMBER, TRADING_DATE)`, aggregated to order grain before joining `ORDERS`. **Not a Cube join**: payments are `datasource1` and everything else is `default`. CI-017.
- **The `'N/A'` filter lives in the dynamic table.** A genuine reference is 28 or 29 characters. Never a non-null count.
- **The `CUSTOMER_ID` empty-string rule lives in the dynamic table.** `NULLIF(TRIM(CUSTOMER_ID),'')`.
- A card seen on a scanned order belongs to that member on every other order it appears on. A card seen on more than one member goes to whichever used it most, and **that cost is published**: 0.41% of cards at Coffee Guru.
- **CI-017's residual closes here:** where the model lives and what its refresh lag is.

### F2. Two windows, enforced by a render rule. **Medium.**

- Every figure declares its tier and its window. **A figure spanning both tiers does not render.**
- **R-191 keys on the tier, not on the build.** No retention, churn, lapse or loss figure renders where the observation window is shorter than twice the threshold it depends on. On the card tier (92 days against an 89-day threshold) that refuses. On the member tier (638 days) it renders.
- **`Date Range` declares its tier.** Selecting a range longer than the card window scopes to the member tier and says so. **It never silently returns a shorter period than the one selected.**
- The window statement is **one component, used once**, not prose repeated across reports.
- It states the date the next claim unlocks. Coffee Guru's member tier reaches twenty-four months in **November 2026**.

### F3. Masking. **Fast.**

On the three new reports. Not retrofitted to Loyalty Spend.

- Names masked by default. **`identity.nameImpliesEnrolment`: only enrolled people carry a name.** A card-recognised guest carries a reference, never a synthesised name.
- **Export carries the same control as the screen.** A masked grid with an unmasked CSV is not masked.
- Reveal, if built at all in Build 4, is role-gated and audit-logged. Otherwise it is not built. **CI-037.**

### F4. One segment vocabulary. **Medium.**

The production vocabulary (Champions / Regulars / Occasionals / Drifters) dies with the report it lives on. The new one is the six-bucket lifecycle: **Regulars, Established, Slipping, Lapsed, New, Seen once**.

- **The boundary rules render on the page**, not only in code. A GM will argue with the segment the first time it says one of their regulars has gone, and "it is in the code" is not an answer.
- **One name, one meaning, across all three reports.** The prototype uses "Regulars" twice, once as a lifecycle bucket of 1,397 and once as plain English for 19,940 repeat card guests. The second becomes **"repeat guests you have not signed up"**.
- Only enrolled people carry a lifecycle verdict. A card cannot be told apart from a card that was reissued, so a lifecycle verdict on one would be a guess. **`segment.tierPermission`.**

### F5. The URL contract. **Medium.**

- Every filter, the scope selection and the drawer state are written to the URL, and read on **hard** navigation as well as soft.
- **Route-level round-trip tests, one per report per parameter, asserting on the rendered population.** The tests are the fix, not the router change.

A link that silently answers a different question for the recipient destroys confidence faster than an obvious error.

### F6. Permissions are visible. **Medium.**

`permissionMap.js` scopes rows by `Orders.storeId`. A user without every location sees a partial population and **cannot currently tell**. The scope control states what the current user can and cannot see wherever the population is partial. **R-198.**

---

## 4. Report 1 — Overview

A dashboard. Order matters: an owner reads it top to bottom once, then reads the top of it forever.

**a. Tile row.** Four tiles. Each states its population and window on its face, and carries its qualification in visible subordinate type rather than in an icon.

- **People you can name** — 69,530, `4,970 enrolled · 64,560 card only`. **This tile is the release.** It replaces `Total Identified Customers 3.4K`.
- **Revenue you can attribute** — 82.4%, `17.5% scanned · 64.9% added by the card`.
- **A member is worth** — 4.9x, `$160.14 against $32.41`. **Never renders without the selection line beneath it.**
- **Members not recognised** — 27%, `14,413 orders · $181,809`. The one number on the page that needs no programme, no campaign and no budget to move, only the prompt at the till.

**b. One sentence.** Not a paragraph. Period, revenue, attributable share. The prototype's prose block restates the tiles above it; do not port that.

**c. Where your members stand.** The lifecycle table: people, share, spend, per head, share of spend. **Every row opens Guests filtered to it.** Beside it, the **segment scatter** and the **paired treemaps**, per §5.

**d. Are your members worth more.** Two hard rules here and neither is negotiable:

- **Every figure states its population and window on its face.** The tiles above count 69,530 known people; this section counts 4,966 enrolled. Two denominators on one screen without a wall between them is how a 4.9x reaches a board pack beside a revenue number it does not divide into.
- **The +11.1% causal correction never collapses and never falls below the fold.** A page that leads with 4.9x and buries the 97%-selection statement is worse than not shipping the section.

Keep **"the same question, six ways"**: per visit −7%, items per visit +4%, per cover **not published**, visits per person 5.3x, share returning 2.2x detection-corrected, value per person 4.9x. Render it as six small panels sharing a reference line at 1.0x. It is the strongest object in the prototype and as a list the disagreement between framings, **which is the finding**, is narrated rather than shown.

**This section also resolves the apparent contradiction with Loyalty Spend**, which reports −7% per order as its headline. Both are true at different grains. The new report explains the old one rather than arguing with it. **Do not change the old one.**

**e. The opportunity.** 19,940 card-recognised repeat guests who never enrolled, $1,302,346 of trade in the window.

- **As a range, roughly $39k to $252k a quarter. Never as a point estimate**, because the interval runs +3.0% to +19.3%.
- **And per venue per week**, alongside the total. An owner cannot work a $1.3m lottery figure; a venue manager can work $5,270.

**f. The trust panel.** Coverage, folded in. The five owned data gaps, each with severity, owner and the question it unlocks. The window statement. The outlier list. **The claim comes before the price paid for it**: state what the report can say, then what it costs. The month-by-month grading and the check register sit behind a disclosure on this panel.

**g. Behind progressive disclosure:** the Shapley decomposition under its one-sentence result, the product-mix index, the method blocks. **Caveats never collapse.** There is no simple/advanced toggle; that was rejected and stays rejected.

---

## 5. Report 2 — Behaviour

A dashboard. When and where they trade.

**a. Trading identity.** What kind of business this trades as, with its confidence, measured against the periods that carry trade rather than all eight.

**b. The 7 by 8 heatmap.** Day of week against daypart, **derived in venue-local time from `TRADING_DATE` and `DT_ORGANIZATIONS`**.

- Eight dayparts in **clock order, never sorted by value.** This is a calendar, not a ranking.
- Shade by order density, with revenue density and **member share** as toggles on the same grid. The member-share view is where "where your members are not" becomes a picture instead of a shortfall table.
- **The daypart table survives beneath it** as the precision layer, sorted by density.
- The three structurally empty dayparts (Dinner 108, Late Evening 2, Late Night 1) **fold into one line stating the combined total**. They do not get eight equal rows and they do not silently disappear.

**c. Where your members are not.** The shortfall table: periods running below the business's average member share, and how many orders behind that is. One line stating it is a gap in recognition, not proof of a gap in loyalty.

**d. Why a single member premium misleads.** Crude basket gap −13.5%, standardised to a common daypart mix −11.6%, the confound +1.9%. Small, and worth showing precisely because it is small: it is the evidence that the headline is not a timing artefact.

**e. Cross-venue, three views.** Per `00_CONTEXT.md` §5, and nothing else.

1. **The stat block.** 1 in 5 use more than one venue; they visit 49% more often and spend 26% more.
2. **The distribution bar.** Guests by number of venues used: 1, 2, 3, 4+.
3. **The ranked bar by venue.** Share of each venue's guests who also use another venue, nineteen rows, sorted.

**No network graph. No small multiples. No decay exponent. No map.** Pair overlap, where shown at all, is a **percentage of the smaller venue's guest base**, never a count. One line: this is overlap, not a causal claim, and it partly reflects venue size and proximity.

---

## 6. Report 3 — Guests

The data grid. **On the production grid component, not a bespoke one.**

- Column grouping by drag, the SUM row, the column picker, export, pagination. Users already know it from Loyalty Spend.
- Filters: **Tier, Segment, Value band, Daypart, Venue**, plus the shared scope bar. This is the slice-and-dice surface and the filters are the product.
- **Masked by default.** Card-tier rows carry a reference and never a name.
- **The grid states its true size and its true sampling method.** If it works on a subset, it names which subset and why, and every figure above it is computed on the whole population.
- A row opens a read-only panel with the stats. **The full drawer is Build 5.**

**One rewrite lands here and it is small and high value.** `Scanned 74 of 355 orders` becomes:

> You saw their card on 74 of their 355 orders (21%). Their true spend is likely higher than $4,474.

It is not a fact about the guest. It is the error bar on every number beside it, and the person reading it is about to make a decision on that number.

**Tenure fields declare their window.** "Known for 91 days", "First seen", "Last seen" cannot mean what a reader assumes when the card window opens on 1 May. Floor them visibly. An owner who knows a customer has come in every weekday for six years, and reads a tenure of weeks, does not conclude the window is short. They conclude the system does not know their business.

---

## 7. Requirements enforced

| ID | Requirement | Proven by |
|---|---|---|
| **R-190** | Every filter and scope selection is written to the URL and read on hard navigation | Route-level round-trip tests asserting on the rendered population |
| **R-191** | No threshold-dependent figure renders where `W < 2 × T`, **evaluated per tier** | Unit tests at (92, 89) asserting refusal and (638, 89) asserting render |
| **R-198** | A partial population is declared on the face | Test with a location-scoped user |
| **R-205** | The report states whether it makes a growth or trend claim, per tier | Assertion per report |
| **R-206** | A tile's figure equals the table beneath it, by venue and by month | `tile.matchesTable`, proven capable of failing |
| **R-207** | Only enrolled people carry a name; masking is default and export inherits it | `identity.nameImpliesEnrolment` plus an export test |
| **R-209** | A date range longer than the tier's window scopes to the tier that supports it and says so. It never silently shortens | Test at a 12-month selection on the card tier |
| **R-210** | The causal correction renders above the fold and cannot be collapsed | DOM assertion, not a review |
| **R-211** | Any small-multiple grid shares one scale, stated once | Visual regression fixture with one extreme panel |
| **R-212** | No chart carries two vertical axes | Lint rule over the chart config |
| **R-213** | A refused figure renders struck through with its reason, never as a blank | Assertion per refusal site |
| **R-214** | Row height and mark size are proportional where magnitudes differ by more than 10x | Fixture with a 1000:1 ratio |
| **R-215** | Every chart states its population and window on the chart | Assertion per chart |

---

## 8. Acceptance criteria

Tick a box by looking at the running build. **A box ticked from a code review does not count.**

**Foundation**

- [ ] Overview's first tile reads **69,530**, not 3.4K
- [ ] The `'N/A'` and empty-string rules live in the dynamic table, not in queries
- [ ] Shared-card attribution cost is published on the face
- [ ] No figure spans both tiers. R-191 refuses at (92, 89) and renders at (638, 89), both unit-tested
- [ ] A 12-month date selection on the card tier scopes and says so, and does not silently shorten
- [ ] Names masked by default on all three reports, **and the export is masked identically. Verified by downloading it**
- [ ] Segment boundary rules render on the page
- [ ] No non-enrolled person carries a lifecycle verdict, in any file
- [ ] **A filtered link opened in a fresh browser session shows the filtered population.** Verified by opening it, not by reading the router
- [ ] A location-scoped user sees a statement of what they cannot see

**The three reports**

- [ ] Exactly three reports exist under Customers, alongside the untouched Loyalty Spend and Redemption
- [ ] **The scope bar is the production filter bar, extended. There is not a second one anywhere**
- [ ] Venue scope persists across all three and survives a hard reload
- [ ] Every tile states its population and window on its face
- [ ] **4.9x and the 97%-selection line are within one screen of each other, and the correction cannot be collapsed.** Verified at 1280px and 1920px
- [ ] The opportunity renders as a range and as a per-venue-per-week figure
- [ ] The trust panel is inside Overview. There is no fourth report
- [ ] The heatmap renders above the daypart table, **dayparts in clock order, venue-local time**
- [ ] The three empty dayparts fold to one line and are not silently dropped
- [ ] **No network graph, no small multiples, no decay exponent, no map exists anywhere in the product**
- [ ] Cross-venue is the three views, and pair overlap is a percentage of the smaller venue's base
- [ ] Guests uses the production grid component, masked, stating its true size
- [ ] The Scanned line is rewritten and sits above the stats it qualifies
- [ ] Every tenure and recency field declares the window it is floored by

**Cross-cutting**

- [ ] **Zero dual-axis charts**
- [ ] **Zero refusals rendered as blanks.** Every one is struck through with its reason
- [ ] Every chart states its population and window on the chart
- [ ] **Not one guarding refusal has been removed.** Count them: four on Overview, one on Behaviour
- [ ] The chrome chip's count equals the count proven capable of failing. **The 28th is proved or it reads 27**
- [ ] **Loyalty Spend and Redemption are byte-identical to before this build**
- [ ] Each chart is justified in its PR against the bar: it changes what the reader concludes faster than the table would
- [ ] The build is instrumented: page views and time per report, scroll depth, filter interactions, chart interactions, and whether anyone reaches the method sections. **R-189**

**Demo moment.** Open Overview: it says 69,530 people, not 3.4K. Point at a heatmap cell on Behaviour and name the day and daypart you would change a roster for. Filter Guests to Slipping regulars at one venue, send the link to somebody, and watch them open the same population.

---

## 9. What this build does not do

The full guest drawer, the member cohort lens and add-to-list are **Build 5**. The projection model is in neither. Export, send and the Loyalty hand-off are in neither.

And it does not touch Loyalty Spend or Redemption, in any way, for any reason.

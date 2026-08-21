# Changelog

Where this build is, and how it got here.

**Current: `v0.11.0`** — the version and commit render in the app header on every
screen, so a screenshot can always be traced back to the tree that produced it.

Entries are newest first. Each one says what changed and, where it matters, what
was wrong before — a changelog that only lists additions cannot be used to work
out why a number moved.

---

## v0.11.0 — the interface answers the press, and the drawers arrive from somewhere

Four and a half thousand lines of components carried **sixteen transitions**,
every one of them a bare Tailwind default — 150ms on an ease-in-out curve. That
curve starts slow, and the moment it starts slow is the moment the reader is
watching most closely, so every state change in the product landed a beat behind
the click that caused it. Nothing had a press state. The three drawers appeared
at full size instantly and vanished the same way.

None of that is a bug a check can catch. It is the difference between an
artefact that reads as a product and one that reads as a prototype, and this
build is shown to buyers.

The vocabulary comes from [emilkowalski/skills](https://github.com/emilkowalski/skills),
installed under `.claude/skills` so the next session works from the same rules
rather than re-deriving them.

### Three curves and five durations, defined once

`--ease-out` for arriving and leaving, `--ease-in-out` for moving on screen,
`--ease-drawer` for the sheets. They live in `@theme`, so `var(--ease-out)` in
hand-written CSS and the `ease-out` utility in a className are the same curve —
declaring them twice is how a design system ends up with two vocabularies that
drift, and the drift is invisible until somebody screenshots both.

**Exits are faster than enters** everywhere. The reader has already decided; the
system is getting out of the way.

### Nothing a reader touches forty times a shift animates

The frequency rule is the whole of the restraint. The sidebar, the period
picker, the report tabs and every chart get press feedback and nothing else.
**No chart animates.** Data a reader is trying to act on does not move for
style, and an entrance animation on a functional graph is a tax charged on every
visit to a page people open all day.

### One drawer, where there were three

The explain drawer, the check register and the guest detail each had their own
copy of the scrim, the panel, the escape handler and the scroll lock — and had
already drifted into three different close behaviours. There is now one
`Drawer`, and the scrim click restores focus to the trigger like the other two
paths always did. Tab is trapped inside a panel that has been claiming
`aria-modal` for months without it.

They enter from the right over 320ms and leave the same edge over 200ms.
**Enter and exit share a path**, so a panel never tells the reader it went
somewhere other than where it came from.

The panels are not kept mounted to do it. Every closed drawer's prose would
otherwise land in the prerendered HTML that `npm run test:layout` slices to
prove two blocks are adjacent — a closed drawer inside one of those slices would
break assertions that have nothing to do with drawers.

### Popovers grow from the control that opened them

All five had `transform-origin: center`, so each grew out of its own middle and
left the reader to infer which control it belonged to. Nothing starts from
`scale(0)`; nothing in the world appears from nothing.

The info popovers now wait 250ms on hover and open instantly on click or focus.
Four tiles across a report header carry four of them, and with no delay, moving
the pointer across that row popped three panels open on the way past — the
interface reacting to a movement never aimed at it.

### Elevation is two weights, and tracking is a function of size

A 200px column menu and a 740px period picker both cast `shadow-lg`, so nothing
on screen said which was the bigger thing. `--shadow-pop` for menus and
tooltips, `--shadow-panel` for surfaces that cover a real part of the page, and
a third for the drawers, which are the only things spanning the viewport.

Every one of fifteen type sizes ran at the font's default letter-spacing. **A
single tracking value is wrong somewhere by definition** — letters read too far
apart as they grow and too tight as they shrink. The table runs from −0.025em at
30px to +0.014em at 9px, applied by size rather than by editing 462 call sites,
with a named scale in `@theme` for new work that declares size, leading and
tracking as one decision.

### The divider under the header is drawn on evidence now

It was a 1px rule whether or not there was anything beneath to divide. A
zero-height sticky sentinel fades a soft edge in over the first 24px of scroll,
so the separation appears exactly when content starts passing under the chrome.
CSS scroll-driven, so no scroll listener and no client boundary on a page that
is otherwise entirely server-rendered.

### Reduced motion means gentler, not nothing

Movement drops; the fades and colour changes that tell a reader the state
changed at all stay. `prefers-reduced-transparency` makes the scrim solid and
`prefers-contrast: more` gives floating surfaces a defined border.

### One regression, caught before it shipped

The first version of the press rule was unlayered. Unlayered CSS beats every
Tailwind utility regardless of specificity, so it had silently killed
`transition-colors` on every button in the product — the exact class of defect
this build exists to argue against, introduced by the change meant to fix it. It
is in `@layer base` with the colour longhands alongside `transform`, and the
nine now-redundant utilities are gone.

All 1,769 assertions in `npm run check` pass unchanged.

---

## v0.10.0 — the period control offers everything, and grades rather than filters

The control offered exactly the unbroken runs of trustworthy card months —
three at Coffee Guru, one at Meat Flour Wine. An operator asking *"how did April
go?"* or *"show me the last twelve months"* had no way to learn whether the
answer was **"the product cannot do that"** or **"your payment feed was down for
eight months"**. Those are different sentences with different owners, and only
one of them is actionable.

Every window a reasonable person might ask for is now enumerated and **graded
rather than filtered**: a single calendar month, an unbroken run, the last 3, 6
or 12 months. The ones whose months hold are extracted. The ones that do not are
still offered, and name the months that stopped them.

Coffee Guru: **32 windows offered, 15 answerable.** Meat Flour Wine: **30
offered, 6 answerable.** Both numbers are the product working.

### Twelve months does not exist on the card tier, and now says so

There is no contiguous run of trustworthy card months longer than three at
either organisation. That was never a product cap — it is all the clean card
data there is. "Last 12 months" now appears in the control reading *9 of 12
months failed · no card capture, card capture partial, and 1 more*, which is a
sentence a merchant can escalate.

### So the long windows run on the loyalty scan instead

The scan never failed. It reaches back twenty-one months at Coffee Guru and
eight at Meat Flour Wine, and it is the only way a twelve-month question gets an
answer in this dataset. A **member window** is the same extract with the
payments join switched off — `basePrelude` already gates that join on the month
list, so passing no card months is the entire change.

**It is not the same report over more months, and everything says so.** A member
window joins no payments, so a person exists in it only where they scanned: on a
card window the card spine recovers a member who forgot, and here it cannot. The
population is smaller and differently selected.

- Member windows carry an `m-` id prefix. Without it they share a route segment
  with the card window over the same months, and the collision would serve one
  population to a reader who asked for the other.
- `spineState` withholds card-tier figures rather than printing them. **A card
  share of 0% is the most dangerous figure this build can produce** — confident,
  well-formatted, and a false answer to "how many of your guests pay by card"
  when the truth is that nothing was joined.
- A standing banner sits in the layout rather than on each page, because a
  member window changes the population every figure below is computed over and
  **no figure says so on its own face**.

### The offer list can be refreshed without the warehouse

`npm run periods` regenerates it from grading already on disk. Which windows are
answerable is decided entirely by the per-month card verdicts, and those are
already recorded — so the second half of the control is correct on a laptop with
no credentials. It calls the same `candidateWindows` the extract does, so the
two cannot drift into offering different things.

### Weeks are deliberately not offered

The shortest window is a calendar month. R-191 requires an observation window of
at least twice the lapse threshold — 178 days at Coffee Guru — so a week would
render a page of withheld retention, churn and lifecycle figures. Offering a
preset that produces mostly refusals is not honesty, it is a bad preset.

### Nine assertions, each one a way this could ship looking fine

`npm run verify` drives the offer set against month sets built by hand: a clean
year offers a clean year; one bad month in the middle kills the window and names
itself; an ungraded stretch refuses rather than reporting on what it has; card
and member ids never collide; member windows are bounded by enrolment and by
trading rather than by a constant; an organisation with no member history is
offered none; and a run that is also a preset keeps both names.

A mistake in this function is invisible in the way that matters — **a window
silently missing from the control cannot be noticed by anyone reading the
control.**

### What is live now, and what waits on an extract

The control, the offer list, the grading and every refusal are live. **The new
windows are not built yet**: each one is a full query run, so `npm run extract`
produces them, and until then they show as *answerable — will open at the next
data refresh*. Nothing that was selectable before has changed.

---

## v0.9.4 — the change chart starts and ends at a revenue figure, and the price question gets an answer

*"Where the change came from"* plotted the four factors as contributions on an
axis of change: the first column was **guests, +$126** and the last was
**modelled change, +$8,669**. Both correct, and neither is a sentence an operator
has ever said. What they say is *"we did $694k in May and $703k in July — what
happened?"*

The chart now answers that question in its own shape. **The first column is the
first month's recorded revenue and the last is the last month's**, with every
factor as a step between them.

### The objection the old chart carried was wrong

Its note argued the endpoints could not be drawn — *"a waterfall between $694k
and $703k would draw two enormous columns with four hairlines between them."*
That is true only on an axis anchored at zero, and a bridge chart is never drawn
on one. Scaled to the path it plots, **the steps get exactly the same vertical
resolution they had before**, because it is the same path offset by $694k.

The endpoint columns run off the bottom, so the truncation is marked three times
rather than assumed: a break glyph at the base of each, a fade into it, and a
sentence saying **their heights cannot be compared**.

### Rounding is a bar now, not only a paragraph

C-2 put the modelled-versus-recorded gap into prose: the four factors are stored
rounded to four decimals, so they sum to $8,669.48 where recorded revenue moved
$8,651.47. That $18.01 is now its own hairline column and its own table row, and
**the bridge closes on recorded July revenue** — a reader can put a ruler on the
chart and land on the figure printed at the top of the page. An exactness claim
the reader can check earns the trust one they cannot check spends.

### Two colour channels instead of one overloaded one

Hue was carrying direction *and* kind: a red "fewer visits" bar against an orange
"average item price" bar. Those two fills sit at **ΔE 7.1 in normal vision** —
below the floor at which two colours can be told apart at all, before
colour-vision deficiency is considered.

They are now separate channels. **Hue is direction** — green added revenue, red
took it away, ΔE 31 apart — and **fill is kind**: solid for real trade, outlined
for average item price. The real-versus-price split bar beneath the chart uses
the same two channels rather than a third scheme of its own, and now shows what
neither version did: at Coffee Guru the two halves point in **opposite**
directions.

### What has not changed about the chart

The model. Same factors, same symmetric-Shapley arithmetic, same figures to the
cent. The axis moved; the decomposition did not.

### The price question — the other half of this release

OV-7 renamed *"price per item"* to *"average item price"* because the figure
moves identically whether a cappuccino got dearer or a guest traded up from a
medium to a large, and named separating the two as the next step. **This is that
step**, in two halves that land at different times.

### The extract now carries a price per product per month

`itemPriceMonthlyQuery` returns one row per product per month: lines and
revenue, on **product lines** — a paid modifier is not a product's price — and
over the **same identified guests** the revenue decomposition runs on, so a split
of a bar is measured on the population that drew the bar. Products key on
`PRODUCT_ID`, never the name, because a rename mid-window would otherwise read as
one product delisting and a second identically-priced one launching, and land in
the mix effect as a real shift.

### `priceMix` splits the bar, exactly, and says when it will not

Average product-line price is `A = Σ sₚ·uₚ`. The Bennet indicator separates a
move in it into a **price** half — the same basket, repriced — and a **mix**
half — the same prices, a different basket — and the two sum to `A₁ − A₀` with no
residual. A product sold in only one month has no price to compare, so its whole
movement is mix: **a menu launch is not a price rise.**

The Shapley bar is then *divided* in that ratio rather than recomputed, so the
modelled change, the bridge and the reconciliation are all untouched by whether
the split published.

**The reclassification is the point.** A like-for-like price rise is the
merchant's own decision and is price. A guest choosing the large flat white is
that guest's decision and is **real trade** — where the whole bar used to be
filed as price, so the front-page *"most of it is price"* sentence was crediting
guests' trading up to the price list.

### Five named refusals, each one exercised

The split declines, in the place the answer would have been and with the reason
attached, when there is no file, when product lines cover too little of the
month's revenue, when too few lines sit on products sold in both months, when the
two universes disagree about which way price moved, or when the two effects
largely cancel and projecting them onto the bar would draw two big columns that
add to a small one. The floors are named constants in `PRICE_MIX` and are
**provisional** — the query shipped with the arithmetic, so the first extract is
also the first calibration.

`npm run verify` drives all five until they fire, and drives the arithmetic
against months built by hand where the right answer is known: a pure price move,
a pure trade-up, both at once, and a launch. It is a **unit** proof rather than a
corrupted fixture because there is no snapshot to corrupt yet.

### Until an extract runs, nothing changes on screen

Every snapshot on disk predates the query, so `itemPrices` is null, the split
refuses with *"this snapshot was extracted before per-product prices were
collected"*, and the four-bar decomposition stands exactly as it did. Run
`npm run extract` and the fifth and sixth columns appear on their own.

---

## v0.9.3 — three reports, one opening

Behaviour was the last of the three to open on a framed component. Overview and
Retention state their question in plain text above the figures; Behaviour opened
on a `Card` titled *"What kind of business this trades as"* — a heading rather
than a question — so a reader moving between the three met a different shape on
each and had to work out every page separately.

All three now open the same way, with the same element at the same weight:

| | Question |
|---|---|
| **Overview** | How much of your trade can you put a name to — and are members worth more? |
| **Behaviour** | When do your guests come, where, and how does that differ between them? |
| **Retention** | Are the people who came back still coming back — and is that getting better or worse? |

**The trading-identity fact has not changed a word.** It has stopped being the
body of a card and become the answer to a question. Its working — why there is no
archetype label, why weekend share is reported as a null result — moved onto the
daypart table, which is the object it is read off and where a reader asking "how
do you know that" is already looking.

### The retention hand-off card has gone

When retention moved out, Behaviour kept a card pointing at it and restating the
clock change. Both halves have outlived their reason. The signpost duplicates the
sidebar, where Retention and Churn sits directly below Behaviour; and the clock
warning was a property of the **old** layout, where member-tier figures sat under
card-tier ones on one page and could be added together by mistake.

**There is no second clock on Behaviour any more.** Everything on it identifies
people by payment card over one window.

### The assertion that guarded it moved rather than being deleted

`behaviour still declares the clock change` would now be pinning a caveat to a
page with nothing to caveat, so it was replaced by the property that actually
matters: **Behaviour draws one identity.** If member-window content ever returns
to that page the check fails, and the warning has to return with it.

The statement itself is asserted on Retention, which is the page that genuinely
runs two identities against each other and therefore the one that has to name
which it is measured on.

---

## v0.9.2 — Overview says what it is for, and says it once

The page opened on four KPI tiles with nothing above them saying what it was
for, and carried the sentence that *is* the argument four scrolls lower behind
an "About this" button. A reader met the figures cold and had to infer the point.

### The question, at the top

> **How much of your trade can you put a name to — and are members worth more?**

Then two sentences: what you took, what this report can put a name to against
what a loyalty CRM would have shown, and the verdict on members. The verdict is
read from the data rather than written — Coffee Guru gets *yes, 4.9×, of which
97% was there before anybody enrolled*; Meat Flour Wine gets *not proven here*.

**The commentary panel that carried that sentence is gone.** It was not cut —
the council refused to cut it on 17 August and that has not changed. It moved to
the top, where it answers the question instead of restating it.

### The third KPI is the same card at both merchants

It was two different cards. Where the within-person estimate can be made the tile
had a label, a figure and a button; where it cannot, it had a *different* label,
no button, and a five-line footnote where the other three tiles have one.
Switching organisation changed the design of the row and not only its figures,
and the merchant whose answer is "not proven" got a wall of text explaining
itself beside three tiles that did not.

Same label, same button, same one-line footnote. What differs is the only thing
that should: the figure is withheld and the reason is a click away.

### Three paragraphs under the table became one

The segment grid stacked three notes beneath it — the previous period not being
last quarter, reissued cards faking a lapse, single-visit cards being excluded —
and all three were correct. Together they were a wall, and a wall under a table
is read by nobody, which made three real caveats functionally invisible.

One paragraph now carries all three facts, because each changes what a row
*means*. The reasoning moved into **Explain segments**, which is where a reader
looking at those rows already is. The composition bars lost their second
paragraph the same way: the finding stayed, the drawing rules went into the
drawer.

### The basket block comes off this page

"Members buy Breakfast Sweet at 1.37× the rate everybody else does" is a real
finding and it was moved *onto* Overview on that basis. The argument holds at one
merchant and not the other: the index needs 200 product lines a side before it
publishes, and **Coffee Guru clears it on 29 of 62 reporting groups where Meat
Flour Wine clears it on 6 of 46.** The same panel is a finding at one and forty
rows of withheld index at the other, and a reader meeting the second version
concludes the report is broken rather than that their menu is long.

Removed rather than conditioned on which merchant is loaded — a page whose
sections appear and disappear per organisation cannot be reviewed or
screenshotted consistently. It is a basket question and belongs on a surface
about what people buy.

### One standing note about refusals

At the foot, once: figures are withheld when the window is too short to observe
what they claim, when the sample would not survive a different fortnight, or when
a comparison cannot be separated from the reason those people are in it. Every
individual refusal still states itself where the number would have been — that
rule has not moved — but a reader who has met two or three of them deserves to
know it is a policy rather than a run of accidents.

### The layout test caught the tile change

Unifying the two tiles broke an assertion that keyed on the *label* to decide
which merchant it was looking at. It keys on the caveat instead — a published gap
says it is association, a withheld one says it could not be separated from
selection, and silence satisfies neither. Stronger than the test it replaced,
because it now covers the merchant that previously fell outside it.

---

## v0.9.1 — members or cards, and which one is actually leaking

The review asked the obvious next question: is retention different between
members and cards, and which of the two are we churning? Two lines on the trend
chart, one per tier.

**The two lines cannot be drawn, and the reason is already on the page.**
Retention is lapse-dependent, the card window is 92 days against the 180 that
needs, and the payment reference stopped being written for the better part of a
year. A card line would be invented rather than measured.

One horizon down it is real, and it is measured rather than modelled. Both tiers
resolve through the same payment card, over the same window, with the same
denominators — because in this build the card is the spine and membership is an
attribute of a person rather than a rival identity. So *did they come back at
all* is a fair comparison, and it turns out to be the interesting one.

### The answer, at Coffee Guru

| Over 92 days | Members | Cards |
|---|---:|---:|
| People | 4,966 | 64,563 |
| **Came back at all** | **68.3%** | **30.9%** |
| Visits per person | 11.09 | 2.09 |
| Median visits | 4 | 1 |
| Returning share, July 2026 | 83% | 86% |

Members come back **2.2× more often**. But month to month the two are almost
identical — 83% against 86% returning — and the cards are marginally ahead. **The
member advantage is in how often somebody comes back, not in whether this
month's crowd had been seen before.** Which of the two is leaking, at monthly
grain, is neither.

The member figure is **detection-corrected**: a member who pays without scanning
looks like an absence, so the raw 72.5% flatters them against a tier with no such
blind spot. Correcting for a scan rate of 81% per visit gives 68.3%.

### Colour means one thing per page now

The flow chart was drawing its joiners in `--tier-member`, which was fine until a
panel on the same page started drawing members against cards. Blue is the member
tier and orange is the card tier — the same two colours the badges use on
Guests — and direction of travel is green and red. Two panels on one page were
about to use the same blue for two unrelated ideas.

### No chart beside the table, on purpose

The split is only measurable over the 92-day card window: three months, one of
which is the month the window opened, where everybody is new by construction.
**Two informative months is a table.** A line through two points takes the shape
of whatever the second one does, and the page says so where the chart would have
been. When the card tier reaches the same horizon, this becomes the second line
on the retention chart rather than a table beside it.

---

## v0.9.0 — Retention and Churn, and a refusal that finally lifted

Retention moved out of Behaviour into its own report between Behaviour and
Guests. It had been the last panel on a long page, fenced behind a dashed
border — which was right while it was a caveat hanging off somebody else's
argument, and wrong once it was the argument.

### The claim this build refused for two releases

**Whether retention is improving.** The old refusal was correct and is worth
restating, because the new answer is built to get around it rather than to drop
it: six-month survival falls across the run, and so does the meaning of the word
"member" — scan coverage climbed from 3% to 19% of orders over the same period,
so later intakes contained marginal members the early ones never captured. Two
things moved together and a falling line could not be attributed to either.

A programme ramps and then it plateaus. **Coffee Guru's coverage has sat between
17.1% and 19.4% since September 2025** — twelve months of flat reach. Intakes
recruited inside that plateau were drawn from the same population and are
comparable to each other. So the trend is drawn across the plateau only, at a
fixed age, and the ramp years are excluded rather than adjusted.

The answer is not a happy one:

| | |
|---|---|
| Six-month retention, pooled over 6 comparable intakes | **20%** |
| Aug 2025 intake → Jan 2026 intake | 28% → 15% |
| Direction | **10 points worse** |

Because coverage was flat throughout, that is retention moving and not reach.

**Meat Flour Wine refuses it**: only three intakes joined under flat coverage and
reached the horizon, against a floor of four. Three points make a line any reader
will extend, and this one would be extended through a few hundred people.

### The card tier's answer is a date

The card is the spine of this build and it is the tier that **cannot** carry
retention, because retention is lapse-dependent — the lapse threshold of silence
to say somebody stopped, and the same again beforehand to say they did not, which
is 180 days against the card window's 92.

The reason is not the card. The payment reference **stopped being written for
nine to fourteen consecutive months**, and a guest seen either side of that gap
cannot be told from two guests, so retention across it is not difficult to
compute — it is undefined. Capture resumed on 1 May 2026 above 93%, so the page
prints the day the clock catches up: **28 October 2026**, no work required.

Beside it, what the card tier *can* say inside 92 days — repeat rate, visit
frequency, typical gap — labelled as return behaviour rather than retention,
because none of those needs to observe somebody stopping.

### Three charts, each answering a different question

- **Is retention improving?** — one point per comparable intake, at a fixed age.
- **What the base gains and loses each month** — joiners above the line, leavers
  below it. A base that grows while losing more people every month is the most
  common way a programme looks healthy on the way to stalling.
- **Where today's active members came from** — the burn-down, moved from
  Behaviour unchanged.

Monthly churn is published as **a floor, not a point estimate**, and says so on
the card: the snapshot holds a cohort triangle rather than a per-person ledger,
so somebody returning after a month away nets off against somebody leaving.

### Two checks, and it started as four

Two of the four new checks were tautologies and were cut rather than shipped
green — the same rule that killed v1's five "invariants".

The flow reconciliation asserted that members held plus members lost equals last
month's active base. `held` is `min(before, now)` and `lost` is `max(0, before −
now)`, and **those sum to `before` for every pair of numbers there is.** The
censored-points check re-read the same `observableMonths` field the trend had
already filtered on, so corrupting it moved both sides together.

What survives asserts properties of the data rather than of the derivation:

- `retention.retainedWithinIntake` — no month of any intake reports more members
  still coming than ever joined it, catching a one-month slip in the
  cohort-to-triangle join.
- `retention.coverageMatched` — every plotted intake has a coverage reading for
  the month it joined, within tolerance of every other. The second condition is
  the licence for the whole page; the first is the one that can actually break,
  because the plateau is found over the coverage series while intakes are
  selected by date, so an intake inside the dates with no reading of its own is
  an unmatched point inside a matched comparison.

### Also

- The layout tests caught the burn-down's correction going missing when the
  chart moved. **"The stack rising is enrolment outrunning churn, not retention
  improving"** is back on the face of the panel, where the stay-or-move rule puts
  it — the chart is liked precisely for the thing it does not prove.
- Axis labels no longer clip or collide at the right-hand end. "July 2026"
  rendered as "July 202" reads as a typo rather than a drawing bug, so nobody
  reports it.

---

## v0.8.1 — the Team pages, refined

A review pass over `v0.8.0`, against the shipped Labour dashboard and the
patterns the Customer pages already use. Nothing was redesigned; the changes are
about clarity, consistency and telling a story down the page.

### Day parts are the primitive, and services are unions of them

`v0.8.0` introduced a "service block" and called the two blocks Lunch and
Dinner. That was a competing concept, and it was **wrong in a way that mattered
rather than a way that was untidy**.

The blocks were derived from the venue's own rostering department names — `CHEF
Lunch` files a shift under lunch — while the day parts were cut by the clock. A
lunch shift running to six put an hour of its cost in the Dinner day part while
its whole cost sat under Lunch, so the two classifications **partitioned the same
23,108 hours differently, by 1,499 hours**. Both tables balanced to the window
total. Only adding a column up by hand showed it.

Now there is one rule. The eight standard day parts are the primitive; the two
groups are unions of them:

| Group | Day parts | Clock |
|---|---|---|
| **Daytime** | Pre-Dawn, Breakfast, Mid-Morning, Lunch, Afternoon | 04:00–17:00 |
| **Evening** | Dinner, Late Evening, Late Night | 17:00–04:00 |

The boundary moved from 16:00 to 17:00 to land on a day part boundary. The
earlier 16:00 came from the empirical trough in orders per hour, which was a
good reason for a cut that did not have to nest inside anything, and it split
Afternoon down the middle. 17:00 costs 94 of 9,410 orders and buys exact
nesting. `team.dayPartsNestInGroups` asserts it and is proven to fail against
the regression that shipped.

The grain control now reads **Day part · Weekday · Week · Month · Day**, and the
day part grain draws the day parts indented beneath their service subtotal —
which carries the ratio, because they cannot.

**The figures moved slightly** and the finding did not: Daytime now runs 51.1%
against Evening at 20.9%, where the department-derived cut said 58.9% and 18.3%.

### Is this Monday normal for a Monday?

The new **Days outside their own normal range** panel replaces "everything above
target". A venue-wide target flags Monday amber every week — preparation happens
whether or not anybody comes in, so a slow day carries fixed cost against a small
denominator and runs hot by construction. A manager told the same thing every
week stops reading the colour, and then misses the Monday that is genuinely
wrong.

Each trading period is now compared against **the range its own weekday usually
keeps** — the middle half of that weekday's own instances. Ten of 184 periods at
Meat Flour Wine fall outside it. Saturday daytime normally runs 51–82%; on 18
July it ran 222%.

A weekday needs six instances before it has a normal range at all, and the panel
says how many combinations were held back for want of them.

### About this, reused

Six panels across the three pages now carry the **`About this` drawer** from the
Customer pages rather than an inline paragraph or a bare info button. Method,
provenance, grain and the working behind a figure moved into it.

The drawer's own stay-or-move rule was respected rather than bent: **refusals,
population constraints, confidence intervals and data-quality warnings stayed on
the page.** A roomy container invites a tired author to sweep a caveat into it,
and that is the one thing it is not for.

### KPI cards lost their paragraphs

The card the review named:

> Sales per labour hour — *available for 23 of 30 rated people*

was a two-line footnote that made the least important sentence the largest thing
on the card. The population is part of the figure and stays on the face, but as
line 4 in eight words — *"Median of 23 of 30 rated people"* — with the reasoning
behind the button. Every Margin tile lost its footnote the same way.

**The warnings that affect trust did not move.** The People page still states in
full that 24 of 35 links are proposals rather than proofs, and that $400,709 of
trade was rung by a login no employee can be attached to.

### Every page opens with its question

- **People** — *Do the till and the rostering system agree who a person is?*
- **Performance** — *How effectively is the team turning labour into sales?*
- **Margin** — *Where is the team working efficiently, and when?*

Set as a plain heading and a sentence, deliberately **not** inside a panel: a
framed box reads as content to consider, which is wrong for copy meant to be
absorbed on the way past.

Each page then runs question → headline → comparison → attention → detail →
method. On Margin that moved the clock-hour explanation to the foot: it explains
the page rather than being read from it.

### Also

- The `vs plan` column is dropped on grains the roster cannot reach, rather than
  drawn as eight rows of em dash.
- Exception copy states **points, not percent** — a gap between two percentages
  written as "140% more" claims something several times larger than the
  measurement.
- `docs/team-recommendations.md` records the five decisions this pass
  deliberately did **not** take alone, with reasons: renaming Margin to
  Efficiency, making day part groups configurable per venue, decoupling the
  weekday norm from the reporting period, adding real targets, and the two
  things only new data can unlock.

---

## v0.8.0 — Staff becomes Team, and the two systems are introduced

The sidebar group called **Staff** is now called **Team**, and it has three
reports under it. The rename is not cosmetic: *staff* names a cost line, *team*
names the people the cost line is made of, and the whole argument of the section
is that the lever is raising what a committed hour returns rather than cutting
the hour.

### The problem the section exists to solve

`ORDERS` is keyed on the POS user id. `ROSTER_COSTS` is keyed on the workforce
vendor's employee id. **Nothing joins them.** At Meat Flour Wine there are 53
POS identities and 83 Tanda employees and the intersection on id is *empty* —
not sparse, empty. Five names match exactly. Everything worth asking — what does
this person cost against what they produce, who should work Friday dinner —
sits behind that one join.

**People** (`/team/people`) is therefore the first screen, and it is a review
queue rather than a result. The matcher blocks on first name within a venue,
then looks for corroborating surname evidence, and reports one of six verdicts:

| Verdict | MFW | What it means |
|---|---:|---|
| Confirmed | 12 | Surname evidence agrees, or the whole string does. Costed. |
| Proposed | 24 | Unique first name at the venue, nothing contradicting. Costed, and marked. |
| Conflict | 3 | First name agrees, surname evidence disagrees. **Not costed.** |
| Collision | 2 | Two logins, one employee. **Not costed.** |
| Unmatched | 9 | No fit on the current roll — the vendor sync keeps no leavers. |
| Not a person | 3 | Shared, training or system login. Trade counted, performance nobody's. |

The temptation was to collapse the first two and report a 70% match rate. That
number would be a claim the evidence does not support for two thirds of the rows
underneath it, so the queue is sorted **worst evidence first** and the section
divides by nothing it cannot stand behind.

### Margin, and the grain that is refused

**Margin** (`/team/margin`) answers at five grains — service, service by day,
day of week, week, month, day. It does **not** answer per clock daypart, and
that refusal is the most considered thing in the release.

Labour is not consumed in the hour it is paid in. A kitchen preps at ten for a
lunch that sells at twelve; a floor team clears at eleven for a dinner that sold
at seven. Apportion wage cost across the clock and divide by the revenue banked
in the same hour and the arithmetic reports **Late Evening at 348% and Breakfast
at 6,207%**. Both are correct and both are nonsense, and an operator who acts on
them cuts the pack-down shift.

So the ratios are **absent from those cells in the data**, not hidden behind a
caption — `wagePct`, `margin` and `netPerHour` are null and a `refusal` string
says why. No chart, export or later change can reach past a warning and render
one. The clock grain still publishes the *shape*: Dinner is 74.1% of trade on
43.6% of hours, Afternoon is 3.7% of trade on 16.5%, and that gap is the
argument made visible.

What replaces it is the **service block**, defensible on two grounds. The venue
already declares it — its rostering departments are named `CHEF Lunch` and
`CHEF Dinner`, `Bar Lunch` and `Bar Dinner`. And the trade agrees: orders per
hour run 595 at one o'clock, fall to 73 at three and 94 at four, then rise to
1,392 at five. The boundary is an empirical trough, not a round number.

### What that grain shows

Meat Flour Wine runs at **28.4%** wage across the window. Underneath it:

| | Lunch service | Dinner service |
|---|---:|---:|
| Net sales | $629,377 | $2,023,106 |
| Labour | $344,724 | $409,353 |
| Wage % | **54.8%** | **20.2%** |
| Sales per labour hour | $60 | $160 |

And at shift grain, **Monday lunch runs at 95.6%** — $41,964 of labour against
$43,875 of trade — against **Sunday dinner at 16.9%**. A single daily or weekly
target flags the whole business amber and tells a manager nothing they can act
on. Lunch is the problem, and Saturday lunch at 66% beside Saturday dinner at
18% is the sharpest instance of it.

### Performance, and why the league table is not a total

**Performance** (`/team/performance`) publishes rates, never totals. The shipped
Staff Scorecard ranks on net sales, and that figure measures the *roster* — the
person at the top worked the most Saturday dinners.

The decomposition is the part nobody else builds. Revenue per cover is items per
cover × average item value, and those are two different jobs: attachment, and
trading up. Across the 30 rated people at Meat Flour Wine, **items per cover
spans 1.86× top to bottom while average item value spans 1.38×**. The team is
not separated by *what* they sell. It is separated by how much of it reaches the
table — which is a sentence a manager can coach.

Anyone below **50 orders across 5 days** is listed as unrated, never ranked
last. Both thresholds, because either alone is gamed by the shape of a roster.

### Three things this build refuses to compute

- **Gross profit per person.** `TOTAL_COST_PRICE` is above zero on 296 of 9,410
  orders — 3.1%. Margin here means *margin after labour* and is named that
  everywhere. A per-head margin struck against a 96.9%-empty field would be
  confident and wrong.
- **Wage percentage per clock hour.** Above.
- **Anything at all for Coffee Guru.** Nineteen venues, no rostering vendor. The
  section renders the refusal, the list of questions connecting one would
  answer, and an explicit statement that the sales side is *not* published on
  its own — because a raw sales total ranks people by the hours they were given.

### Six new checks, all proven capable of failing

Three of them guard a refusal rather than a figure, which is unusual and
deliberate — each refusal is one helpful commit away from being undone by
somebody filling in what looks like a gap.

- `team.grainsReconcile` — all eight grains sum to the same net and labour.
  Catches a shift crossing midnight being dropped, or a daypart boundary
  double-counting one.
- `team.wagePctNotAveraged` — the published ratio is sums divided once, never
  the mean of the per-cell percentages.
- `team.clockRatiosAbsent` — no clock cell carries a ratio it cannot support.
- `team.costedOnlyOnEvidence` — only a confirmed or proposed link is costed.
- `team.ordersReconcileToCustomerReport` — the team half counts exactly the
  orders the customer half counts. The two compute net sales differently on
  purpose (the team half is ex-tax), so the reconciliation is on the count.
- `team.sharedLoginsNotRated` — asserted on the **label**, not the verdict. The
  first attempt asked whether any row marked not-a-person was rated, which the
  rating filter excludes by construction: it could not fail, and `npm run
  verify` caught it. It now asks whether anything reading like a till or a
  trainee carries a verdict that would let it be ranked.

### Data hygiene the section surfaces rather than absorbs

- **31 employee ids** appear in timesheets with no entry on the roll, carrying
  $35,854 of wage cost. The vendor sync retains only active employees, so anyone
  who left mid-window is unmatchable by construction.
- **103 cost segments have no start time.** They carry $0 and they drop out of
  every time-bounded query silently, which is why they are counted before they
  are dropped.
- **46 of 56 waged employees** have no contracted weekly hours recorded.
- **16 rostering department names** across two venues, colliding on purpose
  (`CHEF Lunch` / `CHEF LUNCH - BERW`). They roll up to 8 sections, without
  which nothing compares Berwick's kitchen to Braeside's.

### Names

Employees are people and this snapshot lives in a repository, so the guest
extract's rule applies here too: **no real name leaves the warehouse.** The
matcher runs on the real strings and the verdicts are computed against them;
what ships is a synthetic pair that *preserves the evidence*. Where a real
surname initial agreed, the synthetic one agrees. Section codes pass through
untouched, because they are half of why the join is hard.

### Also

- `PageHeader` and `Placeholder` take a `section` prop. Both hard-coded the
  string "Customers", which was right by coincidence until there was a second
  section.
- `npm run extract -- --team` re-extracts only the team half over the periods
  already on disk. A full extract derives its own window from today's date, so
  running one to add a file would move every published figure in the build.
- The layout test that enumerated five nav items and rejected a sixth now
  asserts the property that matters — no nav item points somewhere the build did
  not render — because a fixed list is a test that must be edited every time the
  product grows.
- Staff Scorecard and Attendance appear as marked production placeholders, so
  the section reads whole. The Attendance stand-in states the finding it
  embodies: it reads the till's clock, staff clock in on the rostering system,
  and the product has taken no decision about which is authoritative.

---

## v0.7.0 — the access gate, and two customers who must not see each other

The report is going to lighthouse customers. One password opens Coffee Guru, one
opens Meat Flour Wine, one opens both for Oolio.

**That is not "keep strangers out". It is tenant isolation between two merchants
who compete in the same market**, and the design follows from one rule:

> Entitlement is enforced on the request path in `src/proxy.ts`, before any page
> renders. Everywhere else it appears is convenience.

### Why it cannot be a React check

Every report page is `force-static`. The guest rows, segment totals and cohort
figures are prerendered into HTML at build time, so a check in a layout or a
client component decides whether to *display* a document that already contains
the data — available in view-source, in the RSC payload, and to anything that
speaks HTTP but not JavaScript. Proxy runs before Next.js serves anything,
including a prerendered page off the CDN.

It is `proxy.ts` and not `middleware.ts`: **`middleware` is deprecated in
Next.js 16** and renamed. Same behaviour, different file and export.

### What was found on the way

Two leaks that only an end-to-end check would catch. Neither exposed a figure;
both exposed **that the other customer exists**, which is its own kind of
confidential.

- **The organisation switcher rendered every org server-side** and hid the wrong
  ones after hydration. `view-source` on a Meat Flour Wine page named Coffee Guru.
  The prerendered HTML now contains only the organisation whose page it is;
  anything else this session may open is added from the session cookie after
  mount.
- **The check register named a merchant in three of its worked examples** — "all
  ten corrupt months at Coffee Guru" shipped inside Meat Flour Wine's report. The
  defect class was the useful part; whose data it happened to was never
  load-bearing.

`scripts/layout-tests.ts` now asserts no organisation's prerendered HTML names
another, and it is proven to catch both. It checks names, slugs and multi-word
venue names; single-word venue names are **logged as not asserted**, because
"Casey" is both a Coffee Guru venue and the first name of three Meat Flour Wine
guests, and a test that cries wolf gets deleted.

### The properties that matter

- **It fails closed.** Missing, malformed or weak configuration denies every
  request with a 503 naming the problem. A gate that waves traffic through when
  its own config is unreadable is worse than no gate, because the deploy looks
  healthy.
- **Sessions are signed, not merely set.** A cookie reading `authed=true` is a
  cookie anybody can type into devtools.
- **Rotation actually rotates.** The signed session carries a fingerprint of the
  whole grant — label, password and organisations — so changing a password *or
  narrowing which orgs it opens* invalidates every session already issued.
- **Comparisons are constant-time**, over equal-length digests, and iterate every
  grant without an early exit so response time does not reveal which password
  was close.
- **No open redirect.** `?next=` is accepted only as an in-site path, and only
  when the grant is entitled to it.
- Two grants sharing a password is refused at boot rather than resolved by list
  order.

`npm run test:gate` — 53 assertions, refusals first. Three deliberate breaks were
introduced to prove they fail: prefix-matching entitlement, a fingerprint that
ignores `orgs`, and `grantAllows` returning true.

### Configuration

`SITE_ACCESS` (JSON grants) and `SESSION_SECRET`. See `.env.example`. JSON rather
than a delimited string because a password is arbitrary text and
`coffee-guru:p@ss,word` has no unambiguous parse — a format that can be mis-split
is a format that eventually grants the wrong organisation.

---

## v0.6.0 — the review pass on Overview and Behaviour

Fifteen sticky notes from the Build 5 whiteboard, blended with the eleven
arithmetic defects the Operator Council found on 17 and 18 August. Guests is
deliberately out of scope. Six of the eleven defects sat on these two pages and
all six are closed here.

### The vocabulary changed, and every screen inherits it

**"Card" meant payment card everywhere in this build, and a loyalty member also
carries a card.** So "card guest" read as "loyalty card guest" to exactly the
audience the product is for, and "known versus unknown members" was the confusion
that came back from demos — the only item on the board sourced from real people
rather than from the team or the council.

| Concept | Was | Is now |
|---|---|---|
| Anyone the product can recognise again | Known guest | **Guest** |
| Recognised by payment card, never enrolled | Card | **Recognised** |
| Enrolled in the loyalty programme | Member | **Member**, unchanged |
| Identity by payment instrument | Card tier | **Payment identity** |
| Identity by loyalty scan | Member tier | **Loyalty identity** |

Declared once in `lib/lexicon.ts` and read from there, because the words are on
the nav, both header chips, the Customers filter, the tier control, four KPI
cards, the segment definitions and the guest grid's Tier column — and a rename
done nine times is a rename that misses two.

**Internal keys did not change.** `tier === "card"` is still `"card"` in the URL
contract, the extract and every snapshot on disk. A data migration to fix a
labelling problem would invalidate every saved link for no gain a reader can see.

### One drawer pattern, replacing five requests for the same thing

Five notes independently asked for explanatory prose to move off the panel face
and into a side drawer. Built once as `ExplainDrawer`, with two sections — *what
this is showing* and *how it is made* — and one rule that decides what may go in:

> **Anything that changes how a number should be read stays visible. Anything
> that explains how the number was built moves into the drawer.**

So refusals, confidence intervals, selection warnings and population constraints
never move. A drawer is roomy, and a roomy container invites a tired author to
sweep a caveat into it.

Applied to: the nesting block, the segment boundary rules ("Explain segments"),
the opportunity's take-up working, the basket index method, the trading-shape
provenance, the daypart construction, the segment-timing method, and the cohort
reconciliation and render rule.

### Corrections

- **The Shapley parts did not sum to the whole**, under a caption claiming they
  did. The four terms came to **+$8,669.48** against a headline of **+$8,651.47**
  — $18.01 out, with two parts shown to the cent. Nothing was wrong with the
  decomposition: it sums exactly to the difference of the *factor products*, and
  the recorded revenue change is a different quantity because the four factors are
  stored rounded to four decimals. The headline is now the modelled change, and
  the gap to recorded revenue is published beside it.
- **It is drawn as an actual waterfall now.** Four bars all anchored at zero meant
  a reader could not check the sum claim by eye. The bars step, and a fifth column
  carries the total.
- **"Price per item" became "average item price."** Revenue over items moves when
  you raise a price and moves identically when the mix shifts toward pricier
  items. The old name asserted the first. This build cannot separate the two — it
  needs item-level price history the extract does not carry — and now says so.
- **"More items per visit" read `1.95 → 1.95`**, a label stating a direction its
  own digits did not show. Operand precision is chosen rather than fixed.
- **The check badge linked to `#checks`, which existed on no page.** The anchor's
  host section was removed from Overview and is rendered nowhere. It was the first
  thing a technical buyer clicks, and it went nowhere for several builds while a
  layout test asserting the badge "is a link" passed the whole time. The register
  now travels with the chip. **A new test asserts every in-page anchor resolves**,
  because the failure was not that this anchor broke — it was that nothing was
  watching any of them.
- **The previous-period gap was off by one.** Apr 2025 against May 2026 reported
  13 missing months; the missing months are May 2025 to Apr 2026, which is **12**.
  It appeared on the segment grid and in the density-change note.
- **The cohort window carried two different numbers as one.** 607 days is the span
  from the first intake month to the last; the *observation* window runs to the
  close of that month and is **638 days**. The render rule was tested against the
  wrong one.
- **"5 periods this business trades in" sat above a table disclosing 8.** Both
  figures are now in the sentence.
- **Three member-order figures appeared with nothing reconciling them** — 62,107
  orders, 52,844 bridged, 55,070 visits, 17% apart. They are nested in the drawer,
  and the daypart table now carries member, recognised and unidentified order
  counts that sum to the row, so nobody has to reverse one out of a rounded share.
- **The basket footnote described ten groups the table did not render.** They are
  rendered, with counts and without an index.
- **The repeat-rate panel published a corrected figure with the method nowhere.**
  The correction moves it five points against the uncorrected rate the segment
  table on the same page implies. Both figures are on the face now.

### Overview

- **The KPI row is uniform.** The 97% selection share moved into the tooltip; the
  sentence "Association, not effect — see below" stays on the face, because it is
  what stops the 4.9× being misused and a screenshot travels without its caption.
- **One control for one concept.** Overview discarded its `searchParams`, so the
  filter bar's `Customers` did nothing on this page while the grid's own `TIER`
  control worked. The grid's control is gone and both the grid and the composition
  bars beneath it now follow the bar.
- **"Are your members worth more?" gets a verdict line** above the six panels,
  stating the conclusion they support. The panels stay at equal weight —
  demoting the two that disagree would answer the question the block exists to
  refuse to answer.
- **"The opportunity" is about a third of its former length.** The uplift band
  moved into the drawer *with its confidence interval and take-up working
  attached*, rather than stranding a range away from its estimate.
- **"Where the change came from" has a second view**: the four factors indexed
  and plotted over the months inside the window. It does not reach back to the
  earlier readable period, because the months between failed card capture and a
  line across them would be plotting the outage.
- **The basket block moved up and out of its fold.** It is the most immediately
  actionable thing on the page and it was last on the longest page in the build.

### Behaviour

- **The daypart table says which population it covers** and splits orders by
  member, recognised and unidentified.
- **"What each segment actually buys" replaced a duplicate panel.** Spend per
  visit and average transaction value told the same story with the same ranking.
  The demoted one is now **orders per visit** — the quantity the two differed by,
  shown nowhere else, and the number that says which segments come back twice in
  a day.
- **"When each segment comes" says whether it is visits or revenue**, and it is a
  toggle rather than a second table. The Lapsed row — 36 people across two days —
  is listed unshaded rather than drawn as a pattern.
- **The cross-venue section has a single-venue state.** Four blocks there are
  structurally empty at one venue, which is the common case for the real product
  even though it is not the case in this dataset.
- **The cross-venue bars are Oolio purple.** They were the only orange-ramp chart
  on either page, reading an identity-tier token for something that is not an
  identity fact.
- **The retention section lost its mountain of text** and kept every correction.
  The clock-change banner, the refusal, and "that growth is enrolment outrunning
  churn, not retention improving" all stay on the face — the chart is liked
  precisely for the thing it does not prove.

### Decisions recorded

- **Segments, not cohorts.** A cohort here is an intake month nobody ever leaves;
  these six buckets are the opposite by design, and both appear on one page.
- The nesting block and the commentary sentence were both kept; only the method
  moved.

---

## v0.5.0 — the review pass, and the card tier gets a verdict

The largest change since the card became the identity spine. Two things happened
that are worth separating: a round of review feedback on how the surfaces read,
and one correction to what the product was willing to publish.

### The correction: cards are classified now

The lifecycle verdict used to be **null at source for anyone not enrolled**. That
was wrong, and the argument against it was simple enough that it should have been
made earlier: every input the classifier needs — visits, days since last visit,
the guest's own cadence — was already computed for cards. `IFF(TIER = 'member',
…, NULL)` was a policy applied *after* the arithmetic, not a limit of the data.

It was hiding the larger half of the base. **1,377 of the 2,775 people at Coffee
Guru who qualify as Regulars are anonymous cards.** Established runs 6,291 cards
against 1,073 members.

The objection it encoded — a reissued card looks identical to a customer who
stopped coming — is real but **directional**, and the blanket null threw away the
half of it that was sound:

| Verdict | What a reissue does | Standing |
|---|---|---|
| Regulars, Established | Splits one person into two smaller ones | **Understates.** A floor, publishable |
| Lapsed, Slipping | A quiet card looks exactly like a reissue | **Inflates.** Labelled as card-observations |
| Seen once | — | Impossible: a card is not a person until visit two |

So the claim is scoped rather than the row deleted: on a card, *Lapsed* means
**this card stopped appearing**, which is observably true. The inference to "this
customer churned" is what a reissue breaks, and the surface says so beside the
rows.

- `segment.tierPermission` (no non-member may carry a verdict) is replaced by
  **`segment.cardNeverSeenOnce`**, the boundary the data actually supports.
- `segmentBehaviourQuery` carries `TIER`, or it would pool enrolled people and
  anonymous cards into one Regulars bucket with no way back.

### Overview

- **KPI cards** are four lines and a button — name, figure, one supporting
  figure, then tier and window. Method behind the button. The grain, window and
  denominator did **not** move behind it: those are part of the figure.
- This reverses the old §8 rule 7, which banned info icons after a prototype
  shipped four that rendered nothing. The reversal is conditional and the
  conditions are enforced in `InfoButton`: a real button, so it works on touch
  and by keyboard, and content is required so it cannot open empty.
- **Where your guests stand** is a data grid with a column picker, a
  **Members / Cards / All** tier control, and a **Lifecycle / Visits** row
  control. Lifecycle is offered where the snapshot can express it.
- The dumbbell chart is replaced by **three aligned 100% composition bars** —
  Members → Visits → Spend, same colour per segment in each. Not a Sankey: these
  are three compositions of one population, not a flow.
- Segment colours moved to brand: Oolio deep purple at two depths for Regulars
  and Established, brand green for New.
- Dropped *What this report is standing on*; auto-expanded the two findings.

### Behaviour

- Dropped **the trading week** — a venue question the sales report already owns.
- **Dayparts** gained a change column in percentage points.
- Retention: the triangle, tenure bars, survival curve and grading table are
  replaced by **one burn-down on calendar time**, where right-censoring
  disappears because every cohort is observed in every month it exists.
- Added *What each segment buys* and *When each segment comes*.
- Recorded the **Venues vs Locations** gap — Oolio has two levels and this data
  set only has one, which will not scale up silently.

### Guests

- The drawer's heatmap runs **weekday against daypart** — the same two axes the
  trading grid uses, so a person can be read against the business. The per-visit
  daypart was always queried and was being discarded at pack time.
- Cells are **equal squares** with no header row. A stretching column made a busy
  lunch a wide rectangle and encoded area, which means nothing here — the shade
  is the only quantity. The daypart moved into a tooltip that opens on hover,
  focus and tap: *"Lunch · Monday · 8 visits · 27 orders · $308.60"*.

### Enforcement

- **`member.tierScopeDeclared` now exists.** It was specified in the build pack,
  asserted live in a doc comment, and never written — a member-only chart could
  have lost its scope and no build step would have noticed. It lives in
  `layout-tests.ts`, because it is a rule about rendered output.
- `verifyScatterAgrees` compared unlike things once cards were classified — it
  filtered its table side to members while counting every labelled person on the
  plot side, reporting *"table says 1,398, scatter plots 2,775"*. Both sides now
  count every tier that carries a verdict.
- **26 blocking checks, 28 proven capable of failing**, 166 route tests, 641
  layout assertions, both organisations.

### Snapshots

Re-extracted from Snowflake on 18 August 2026. The headline figures moved a
little against v0.4 and the README is updated to match; the within-person lift at
Coffee Guru is now **+11.1% (95% CI +3.0 – +19.3)** on 455 switchers.

---

## v0.4.0 — the Customers section, whole

Six surfaces became five sidebar items and three reports: Overview, Behaviour,
Guests, with the two existing loyalty reports as labelled placeholders. Members
folded into Overview, Trade density became Behaviour, Coverage became a panel
rather than the report nobody opened. The venue network graph, the map, the
distance-decay model and the league table were cut rather than carried.

**A tie was deciding who somebody was.** Card-to-member resolution used
`MAX_BY(MEMBER_ID, N)`, which is non-deterministic when a card has served two
members equally often. 292 of Coffee Guru's cards do, and `PERSON_ID` is the
spine, so a flip moved that human's visits, spend and lifecycle verdict
wholesale. Ties now break on the member id.

Then a verification pass found nine arithmetic defects, six of them real. The
sharpest: **the segment rules were published as six independent definitions and
they are not independent** — they are a first-match ladder, and somebody seen
once long ago satisfies both *Seen once* and *Lapsed*. Now numbered, with the
collision stated.

## v0.3.0 — the period becomes a control

The 90-day window was not a lock, it was the length of the only unbroken run of
trustworthy card months. Coffee Guru turned out to hold **nine usable months in
three runs**, six of which existed in the warehouse the whole time and were
invisible because the product opened one window and never asked.

The selector offers the runs that exist and **publishes the ones that do not**,
each with what happened and who owns it. Consecutive entries are consecutive
*readable runs*, not consecutive quarters — which is why every comparison in the
product states its gap.

Also: item and basket analysis at person grain, and three defects under it —
`QUANTITY` is not trustworthy (one line carries 4,654,648), a third of all lines
are modifiers and the modifier flag misses most of them, and category is keyed on
the id because five Coffee Guru names carry more than one.

## v0.2.0 — the card is the spine

v1 ranked identity: member beats card beats unattributed. The same human was two
different objects — a member when they scanned, an anonymous card when they did
not — and no statistical control repairs a grain mismatch.

**Over the honest window, 92% of member orders at Meat Flour Wine and 85% at
Coffee Guru also carry a payment reference.** The card is the more complete
identifier, so it becomes the person and membership becomes an attribute of that
person. A member who forgets to scan stays the same person, the two columns
become the same grain, and scan rate becomes measurable.

Also landed: **a name is only generated for someone who enrolled**. v1 rendered
every guest row with a human name including card-recognised ones, which made a
payment token indistinguishable from a customer whose email the business holds.

## v0.1.0 — the first POC

Seven screens on real Oolio Pay trade for two organisations. Found the
**`PAYMENT_ACCOUNT_REFERENCE` outage**: the field was written as a single
constant value estate-wide for roughly eleven months, never null, so every
`COUNT(PAR)` coverage test scored it 100% covered.

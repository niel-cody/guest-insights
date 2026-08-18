# Changelog

Where this build is, and how it got here.

**Current: `v0.7.0`** — the version and commit render in the app header on every
screen, so a screenshot can always be traced back to the tree that produced it.

Entries are newest first. Each one says what changed and, where it matters, what
was wrong before — a changelog that only lists additions cannot be used to work
out why a number moved.

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

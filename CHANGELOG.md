# Changelog

Where this build is, and how it got here.

**Current: `v0.5.0`** — the version and commit render in the app header on every
screen, so a screenshot can always be traced back to the tree that produced it.

Entries are newest first. Each one says what changed and, where it matters, what
was wrong before — a changelog that only lists additions cannot be used to work
out why a number moved.

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

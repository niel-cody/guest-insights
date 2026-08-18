# Guests — POC

**`v0.8.0`** · the customer side of the sales report, and now the team side, built on real Oolio Pay
trade. Snapshots re-extracted 18 August 2026.

Rebuilt around one question: **are your members worth anything, and where is the
room to grow?** This file is the standing description of what the build is and
what it stands on. **[`CHANGELOG.md`](CHANGELOG.md) is how it got here** — read
that for what moved and why, including the numbers that changed meaning.

The version and commit render in the app header on every screen, so a screenshot
can always be traced back to the tree that produced it.

The full decision record — written to be read without repo access — is
`Guest Reporting & Insights — Build v2 Decisions` in the project folder.

Two organisations, switchable from the scope bar on any screen:

| | Coffee Guru | Meat Flour Wine |
|---|---|---|
| Service model | **Counter** | **Table** |
| Venues | 19 | 2 |
| Orders in window | 250,272 | 9,410 |
| Average order | $14 | $310 |
| Revenue you can attribute | 82% | 86% |
| What a loyalty CRM sees | 17.5% | 3.3% |
| Median return gap | **21 days** | **65 days** |

The pair is the argument: the same report has to work for a daily-habit counter
business and a monthly-occasion table-service one, and **it reaches a different
verdict on each** — which is the point, not a failure.

---

## The question, and the two answers

Everything below is measured over **1 May – 31 July 2026**, three complete months,
at person grain, with both columns identified by their payment card.

### Coffee Guru — members are worth 4.9×, and it is all frequency

| | Non-member | Member | |
|---|---|---|---|
| People | 64,563 | 4,966 | |
| Visits per person / 92 days | 2.09 | **11.09** | +431% |
| Repeat rate (detection-corrected) | 30.8% | **68.2%** | 2.2× |
| Spend per visit | $15.48 | $14.44 | **−7%** |
| Items per visit | 1.97 | 2.04 | +4% |
| **Spend per person** | **$32.41** | **$160.14** | **4.9×** |

Members buy slightly *less* per visit and are worth nearly five times as much.
The whole difference is return rate. A report that publishes only average order
value concludes that loyalty destroys value — and most of the category does
exactly that.

### Meat Flour Wine — not proven, and the product says why

Members return 59% more often and repeat at 3.5× the rate, but each visit is a
much smaller table (6.9 items against 11.6). Over the window the two cancel:
**−4% per person.**

The obvious next question — per head at the table, who spends more? — **is
refused.** Party size is recorded on 51% of member orders against 97% of
everyone else's, and the member orders that record it average $287.75 against
$91.07 for those that do not. Restricting to covers-recorded orders keeps the top
half of one distribution and nearly all of the other. The missingness runs in the
direction of the answer, so the comparison is not published — and the Coverage
screen names the field, the owner and what closing it would unlock.

### Association is not effect

The question every loyalty report answers by accident. The design: find people
first seen anonymously on a card who later start scanning, and compare each
against themselves.

| | Coffee Guru | Meat Flour Wine |
|---|---|---|
| Switchers | **455** | 17 |
| Spend-rate lift after enrolling | **+11.1%** (95% CI +3.0 – +19.3) | — |
| Verdict | published | **refused at n=17** |

Against the 4.9× cross-sectional gap, roughly **97% of the observed difference is
selection** — members were already the frequent ones. Both numbers ship, doing
different jobs: the gap sizes the base you already have, and the within-person
figure is the only one that may justify programme spend. Sizing the enrolment
opportunity on the gap instead would multiply it roughly twentyfold, and every
dollar would be selection. A check fails the build if that ever happens.

---

## The team side: what a shift returns against what it costs

Added in `v0.8.0`, and built on the same rule — publish what the data supports,
refuse the rest, and say which is which.

**The join does not exist.** `ORDERS` is keyed on the POS user id and
`ROSTER_COSTS` on the workforce vendor's employee id. At Meat Flour Wine there
are 53 POS identities and 83 Tanda employees and **not one id appears in both**.
Five names match exactly. So the section opens on the identity queue rather than
a league table: 12 confirmed, 24 proposed, 3 conflicts, 2 collisions, 9
unmatched, 3 that are not people at all. Conflicts and collisions are **not
costed**, and proposals are costed and marked everywhere they appear.

**Wage percentage is not one number.**

| | Lunch service | Dinner service |
|---|---:|---:|
| Net sales | $629,377 | $2,023,106 |
| Labour | $344,724 | $409,353 |
| Wage % | **54.8%** | **20.2%** |
| Sales per labour hour | $60 | $160 |

At shift grain, **Monday lunch runs at 95.6%** against **Sunday dinner at
16.9%**. A flat daily or weekly target flags the whole business amber and tells a
manager nothing they can act on.

**The clock daypart is refused.** Labour is committed before and after the trade
it serves, so apportioning wage cost across the clock and dividing by the revenue
banked in the same hour reports Late Evening at 348% and Breakfast at 6,207%.
Those cells ship with `wagePct`, `margin` and `netPerHour` **null in the data** —
not hidden behind a caption — and the clock grain publishes only the shape that
proves the point: Dinner is 74.1% of trade on 43.6% of hours.

**The difference between sellers is attachment, not trading up.** Across the 30
rated people, items per cover spans **1.86×** top to bottom while average item
value spans **1.38×**. Everybody sells much the same things at much the same
price; the spread is in how much of it reaches the table.

**Coffee Guru gets none of it**, and says so. Nineteen venues on no rostering
vendor means no denominator, so the section renders the refusal and the list of
questions connecting one would answer — and explicitly declines to publish the
sales side alone, because a raw sales total ranks people by the hours they were
given.

**Gross margin per person is refused**: cost of goods is recorded on 3.1% of
orders. Margin here means *margin after labour* and is named that everywhere.

## The change that made this publishable: the card is the spine

v1 ranked identity — member beats card beats unattributed. The same human was two
different objects: a member when they scanned, an anonymous card when they did
not. That is why the member-versus-card comparison could not be published; one
column held enrolled humans and the other held payment instruments, and no
statistical control repairs a grain mismatch.

**Over the honest window, 92% of member orders at Meat Flour Wine and 85% at
Coffee Guru also carry a payment reference.** The card is the more complete
identifier of the two. So v2 inverts it: the card is the person, and membership is
an attribute of that person. A card ever seen on a scanned order belongs to that
member on every other order it appears on.

Three consequences, all load-bearing:

- A member who forgets to scan stays the same person, so **their unscanned spend
  counts toward their value** — 14,413 orders and $181,809 at Coffee Guru, which
  is 27% of known members' trade.
- Member and non-member become the same grain, so the comparison is expressible.
- **Scan rate becomes measurable** — 81% of visits at Coffee Guru, 76% at Meat
  Flour Wine — and with it the size of the recognition gap.

Cost, published rather than hidden: a card shared between two members is
attributed to whichever used it more. 0.41% of cards at Coffee Guru, 0.10% at
Meat Flour Wine.

### The correction nobody in the category makes

Membership is only visible when somebody scans, so a member who came ten times has
ten chances to be detected and one who came once has one. Members look more loyal
than they are, **by construction**. With a per-visit scan probability *p*, a member
with *v* visits is seen with probability 1−(1−p)^v; dividing through recovers the
population. Repeat rate falls from 72.5% to 68.3% at Coffee Guru and from 27.9% to
23.4% at Meat Flour Wine. The claim survives; publishing both is the point.

---

## What the data said when we went and checked

### The extract defect was not one

The review's blocking finding — a missing venue and 55% of Meat Flour Wine's
orders — does not reproduce. Both halves are artefacts of the verification query.

- **The missing orders.** `NOT IN ('VOID','CANCELLED')` counts 45,485 `CREATED`
  rows holding **$2,799 between them** — tickets opened on a terminal and never
  finalised. Both queries are arithmetically correct; only one counts trade.
- **The phantom venue.** `Meat Flour Wine Venue` at 6,799 orders is **Braeside**,
  under two earlier names: 2,030 as *Meat Flour Wine Store* plus 4,769 as *Meat
  Flour Wine* is exactly 6,799. One store id, three successive names. The
  "wrong" first trading day was the day it was renamed.

**The real defect is smaller and genuinely ours: a slowly-changing attribute was
used as an identifier.** Venue identity is now the store id, with the current name
applied across all history and earlier names published. It fixes the 74 orphaned
guests and three Coffee Guru stores with the same problem — including one that
traded as `Shree Narayanmuni pty.ltd` before becoming Mittagong. A check,
`venue.resolution`, fails if any guest's home venue does not resolve by id.

### Censoring moves the lapse threshold by two months

v1 took percentiles of *observed* gaps — but a gap only exists if the guest came
back, so everyone still away when the window closed was silently dropped. v2 uses
**Kaplan-Meier on time-to-next-visit**, with the final open interval right-censored
and episodes weighted 1/n per guest so the estimate is per guest, not per gap.

| | v1 | v2, censored |
|---|---|---|
| Coffee Guru — slipping | >9 days | **>56 days** |
| Coffee Guru — lapsed | >26 days | **>89 days** |
| Meat Flour Wine — lapsed | >77 days | **not estimable** |

Coffee Guru's lapse point lands within a day of the canonical 90. The old
threshold would have written off a cafe regular two months early, and any win-back
fired from it would have been chasing people who were about to walk in anyway.

Meat Flour Wine is **refused**: the return curve still has 32% of guests yet to
return when the window closes at 91 days, so any p90 taken from it describes the
window rather than the guests. The canonical rule is used and labelled canonical.

---

## Data quality is a product surface

### Checks that can fail

v1 shipped five reconciliation invariants that compared numbers to themselves —
`41,410 of 41,410`, three times. They were green on the day 403,600 transactions
carried one token.

There are now **28 checks, and the contract is stricter than "they pass"**: each
is demonstrated failing against a fixture corrupted in the specific way it claims
to catch.

```bash
npm run verify
```

fails the build unless every blocking check passes on the real snapshot *and*
every check fails on its corrupted fixture. A check with no failing fixture is
excluded from the badge — adding one is not free. Current state on both
organisations: **26/26 blocking pass, 28/28 proven capable of failing.** One
warning fires by design, and its firing is what withholds the per-cover comparison
above.

The five that matter most, each written against a defect that actually happened:

| Check | Catches |
|---|---|
| `card.maxTokenShare` | The ten corrupt months, at 100% on one reference |
| `card.distinctStepChange` | The month the outage began |
| `source.orderCountParity` | The parity dispute above, with its exclusions named |
| `rounding.derivedConsistency` | `110 gained · 100 lost · Net +1` |
| `cohort.spendScope` | The sixfold seen-once spend overstatement |
| `segment.cardNeverSeenOnce` | A card published as a customer who came once, when a card is not a person until its second visit |

**Threshold calibration, not guesswork.** The 1% cap proposed for the largest
single card token is right at estate volume and wrong for a two-venue merchant,
where one twice-weekly regular clears it. Measured separation: healthy months top
out at **3.6%**, broken months start at **50.8%**. The cap sits at 10%.

### The `PAYMENT_ACCOUNT_REFERENCE` finding

The field was written as a single constant value, estate-wide, for roughly eleven
months — never null, so every `COUNT(PAR)` coverage test scored it 100% covered.
The app treats this as a product requirement rather than a footnote: it tests
distinct references and largest-token share per month, refuses months that fail,
and never renders a capture failure as a fall in customers.

### Outside the bounds of normal

Venues tested against their peers and against their own history, using the median
and median absolute deviation rather than the mean and standard deviation — with
twenty venues, one outlier inflates a standard deviation enough to hide itself.
Longitudinal tests are de-trended against the estate. A finding has to be both
statistically unusual and materially large, because significance without
materiality trains people to ignore the panel.

---

## The window, and what it costs

Everything renders over **1 May – 31 July 2026**: the most recent unbroken run of
trustworthy card months, complete months only. Nothing outside it is in the
snapshot at all, so no figure can quietly be computed over a period the data does
not support. Two years of chrome over four months of usable data is how eighteen
figures came to contradict each other in v1.

Stated on the surface, because it is a real cost: no year-on-year anything, no
lifetime value, no card-tier history to trend.

**Periods are readable runs, not quarters.** Coffee Guru has three, and they are
not adjacent — the current one opens thirteen months after the previous one
closes, because every month between failed card capture. So every
previous-period comparison in the product carries its gap: the segment grid's
change columns and the daypart density column both name the period they are
against and how far away it is. A change column labelled "previous period"
across a thirteen-month hole reads as one quarter of movement and is a year of
it, most of which happened where nothing was measured.

---

## The screens

Two sections. **Customers** carries five items, three of them this build.
**Team** carries five, three of them this build. In each, the remainder are
existing production reports rendered as labelled placeholders and deliberately
untouched.

| Screen | Answers |
|---|---|
| **People** | Whether the till and the rostering system agree who a person is. A review queue, worst evidence first, and the list of what the rest of the section is allowed to divide by |
| **Performance** | Who is doing well and **why** — the decomposition into attachment against trading up, on rates rather than totals, with everyone below the evidence floor shown unrated |
| **Margin** | What each service, day, week and month returns against what it costs to staff. Six grains, and one refused |
| **Staff Scorecard** | *Existing report. Not part of this POC.* |
| **Attendance** | *Existing report. Not part of this POC.* |


| Screen | Answers |
|---|---|
| **Overview** | Where you sit. Attribution, the member headline, the segment grid, how the base turns into visits and spend, the opportunity, what the report is standing on |
| **Behaviour** | When and where they trade. Dayparts by density, where members are not, cross-venue, what each segment buys and when they come, and the member retention burn-down behind its wall |
| **Guests** | The grid and the drawer. Masked by default, value band and daypart, and a per-guest weekday-by-daypart heatmap |
| **Loyalty Spend** | *Existing report. Not part of this POC.* |
| **Loyalty Redemption** | *Existing report. Not part of this POC.* |

`/coming-back`, `/growth` and `/value` are absorbed into Overview. Trade density
became Behaviour. **Coverage became a panel rather than a report** — a
diagnostics page operators had to be told to open is what it was before. The
venue network graph, the map and the distance-decay model were cut. **The
pre-shift Brief moves to Loyalty** — Insights reports what happened and publishes
the definitions; Loyalty acts on them and owns the channel.

Every page carries the **build stamp** in its header — `v0.5.0 ba31b0f`, with
the build date on hover. A screenshot of this product outlives the build that
made it, and the meaning of a figure here has changed more than once.

Behaviour validates against the Trade Density Framework on first contact: the
framework's illustrative Coffee Shop row predicts 38 / 26 / 18 / 10 across
Breakfast, Mid-Morning, Lunch and Afternoon, and Coffee Guru measures **43.0 /
29.8 / 18.6 / 8.3**. Meat Flour Wine measures 72.9% Dinner and classifies as
Daypart Specialist — far more concentrated than the Premium Dining archetype's
42%, which suggests the archetype set needs a Dinner-Dominant shape.

### Contract points enforced in code

- **Every figure carries its window, its grain and its denominator.** Where one is
  unavailable the function returns null and the surface declines to draw.
- Revenue grain is the primary coverage measure; transaction grain names its
  denominator; **guest-grain coverage is never computed**.
- A lifecycle verdict is computed for **both tiers**, and the claim it supports is
  scoped instead of the row being deleted. Every input the classifier needs —
  visits, days since, own cadence — is measured for a card as well as a member,
  and nulling the output hid the larger half of the base: **51.3% of everyone
  with ten or more visits at Coffee Guru is an anonymous card**, and 78% of
  everyone with three or more. The reissue objection is real but directional. A
  member keeps one identity across a reissued card and an anonymous card does
  not, so a reissue splits one person in two — which can only ever *understate*
  Regulars and Established, and does inflate Lapsed and Slipping. So those two
  are labelled for what they observe: on a card, Lapsed means **the card stopped
  appearing**. The inference to "this customer churned" is what a reissue breaks,
  and the surface says so. `segment.cardNeverSeenOnce` holds the one hard
  boundary left — a card is not a person until its second visit, so it can never
  be Seen once.
- An **inferred** verdict (Slipping, Regulars, Established) needs three visits,
  because two visits is one gap and one gap is not an estimate. An **observed**
  state (Seen once, New, Lapsed) rests on the calendar and needs no minimum.
- Tiles round to the nearest ten. **Grids and exports never round.** A figure
  shown beside its operands is computed from the operands as displayed.
- A tile is four lines and a button: what it is, the figure, one supporting
  figure, then tier and window. **The grain, window and denominator never fold** —
  they are part of the figure. Only the method goes behind the button, and the
  button cannot open empty.
- A personal cadence is never filled in from the org median. If a guest has no
  cadence, the surface says nothing.
- **Only enrolled people have a name.** A card-recognised guest is shown as a
  reference, because "recognised" and "identified" are different claims.
- Names are **masked by default**; the reveal is role-gated and audit-logged, and
  exports carry the same control.
- Every control on screen is wired or absent. There is no third option.

---

## Running it

```bash
npm install && npm run dev
```

The app reads pre-extracted JSON from `data/` and makes no warehouse calls at
request time. Fully static, deploys to Vercel with no environment variables and no
database.

### Refreshing from Snowflake

```bash
npm run extract
```

Reads `~/.snowflake/connections.toml` and uses the same SSO credentials an analyst
uses interactively. About four minutes for both organisations.

```bash
npm run extract -- --team
```

Re-extracts **only** the team half, over the periods already on disk. A full
extract derives its own window from today's date and re-grades every month, so
running one to add a file would move every figure the README and changelog quote
against a stated extraction date.

**This is why the app ships snapshots rather than querying live:** the connection
uses `authenticator = "externalbrowser"`, which cannot run in a serverless
function. If a key-pair service user is provisioned later, set
`SNOWFLAKE_PRIVATE_KEY_PATH` and the same script runs headless; swapping to live
queries then means replacing the body of `src/lib/data.ts` and nothing else.

### Verifying

```bash
npm run verify
```

### Privacy

No customer name, email, phone or raw Payment Account Reference leaves the
warehouse. Identities are salted-hashed at extract time. The salt lives in
`.extract-salt` and is gitignored, so a hash cannot be replayed against the
warehouse. This matters because the artefact gets deployed and shown around.

**A name is only generated for someone who enrolled.** This is a correctness rule,
not a cosmetic one: a name is a claim to know who somebody is, and for a
card-recognised guest we do not. All we have is a payment reference that has turned
up more than once. Rendering that as `Casey Lindqvist` makes it indistinguishable
from a member whose name and email the business actually holds, and an operator
scanning the grid reasonably concludes they can contact both. Card rows therefore
carry no name at all and the grid shows a reference — `Card ·D696` — with the
tooltip saying plainly that the reference is ours and is not the card's number.
A check, `identity.nameImpliesEnrolment`, fails the build if a name ever appears
on a non-member row.

Member names here are synthesised from the hash, carrying a suffix because 30
firsts by 30 lasts is 900 combinations against tens of thousands of guests and
without it the grid reads as if it holds duplicates. In production that name comes
from the CRM record the guest created when they enrolled. The *shape* is the same
in both: a name on one side of the line, nothing on the other.

The synthetic names are a reason the demo is safe to show. They are **not** a
reason the pattern is safe to ship, so the surface behaves the way the real one
has to: masked by default, reveal gated, exports controlled.

---

## Layout

```
CHANGELOG.md           where this build is and how it got here
data/<org>/            extracted snapshots — the only thing the app reads
next.config.ts         legacy redirects, and the build stamp the header renders
scripts/
  snowflake.ts         connection (SSO now, key-pair when one exists)
  verify.ts            proves every check can fail
  layout-tests.ts      display rules asserted on the built HTML, not reviewed
  extract/
    orgs.ts            organisations, windows, the eight dayparts
    sql.ts             the warehouse models: orders, bridge, the card spine
    queries.ts         one query per output file — including the shared
                       `classified()` CTE both tiers are now labelled by
    run.ts             orchestration, card-quality gate, pseudonymisation
src/lib/
  stats.ts             Kaplan-Meier, paired intervals, standardisation, detection
  metrics.ts           every derived figure, so two screens cannot disagree
  checks.ts            the 28 checks
  weekdays.ts          Monday-first rotation — plain data, so a client component
                       and a server component can both hold the real array
  data.ts              snapshot access — the seam a live warehouse would replace
```

---

## Not built

Out of scope per PRD §7.4: audiences, holdouts, incrementality, prediction, the
sensitivity dial, pooling views, cross-venue overlap, postcode.

**Still genuinely blocked on data, not appetite:**

- **Any lifetime value figure.** Three months cannot carry one.
- **Whether cohort quality is falling.** Six-month survival does drop across the
  run, and scan coverage rose over the same period, so later cohorts include
  marginal members the early ones never captured. The two effects are not
  separated in this data and the trend is refused rather than drawn.
- **Spend per head at the table for Meat Flour Wine.** Party size is recorded on
  51% of member orders against 97% of everyone else's, and the missingness runs
  in the direction of the answer.
- **Revenue centres within a venue.** Oolio has Venues *and* Locations; this data
  set only uses one level. Bar-inside against bar-outside is not expressible yet,
  and Behaviour says so rather than letting the omission scale up quietly.

**Next thing worth building:** expected-next-visit with confidence bands. The
Kaplan-Meier fit the lapse thresholds already come from is most of the work.

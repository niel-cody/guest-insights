# Guests — POC, build v2

The customer side of the sales report, built on real Oolio Pay trade.

Build v1 was shown to the Product Council and to UAT. This is what came back from
that, rebuilt around one question: **are your members worth anything, and where is
the room to grow?** The full decision record — written to be read without repo
access — is `Guest Reporting & Insights — Build v2 Decisions` in the project
folder.

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
| People | 64,211 | 4,966 | |
| Visits per person / 92 days | 2.09 | **11.07** | +430% |
| Repeat rate (detection-corrected) | 30.8% | **68.2%** | 2.2× |
| Spend per visit | $15.48 | $14.42 | **−7%** |
| Items per visit | 1.97 | 2.04 | +4% |
| **Spend per person** | **$32.35** | **$159.60** | **4.9×** |

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
| Switchers | **451** | 17 |
| Spend-rate lift after enrolling | **+12.7%** (95% CI +4.5 – +21.0) | — |
| Verdict | published | **refused at n=17** |

Against the 4.9× cross-sectional gap, roughly **97% of the observed difference is
selection** — members were already the frequent ones. Both numbers ship, doing
different jobs: the gap sizes the base you already have, and the within-person
figure is the only one that may justify programme spend. Sizing the enrolment
opportunity on the gap instead would multiply it roughly twentyfold, and every
dollar would be selection. A check fails the build if that ever happens.

---

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
  counts toward their value** — 14,239 orders and $179,166 at Coffee Guru, which
  is 27% of known members' trade.
- Member and non-member become the same grain, so the comparison is expressible.
- **Scan rate becomes measurable** — 82% of visits at Coffee Guru, 76% at Meat
  Flour Wine — and with it the size of the recognition gap.

Cost, published rather than hidden: a card shared between two members is
attributed to whichever used it more. 0.41% of cards at Coffee Guru, 0.10% at
Meat Flour Wine.

### The correction nobody in the category makes

Membership is only visible when somebody scans, so a member who came ten times has
ten chances to be detected and one who came once has one. Members look more loyal
than they are, **by construction**. With a per-visit scan probability *p*, a member
with *v* visits is seen with probability 1−(1−p)^v; dividing through recovers the
population. Repeat rate falls from 72.4% to 68.2% at Coffee Guru and from 27.9% to
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

There are now **24 checks, and the contract is stricter than "they pass"**: each
is demonstrated failing against a fixture corrupted in the specific way it claims
to catch.

```bash
npm run verify
```

fails the build unless every blocking check passes on the real snapshot *and*
every check fails on its corrupted fixture. A check with no failing fixture is
excluded from the badge — adding one is not free. Current state on both
organisations: **17/17 blocking pass, 19/19 proven capable of failing.** One
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
cohort retention triangle, no lifetime value, no member history to trend.

---

## The screens

Seven surfaces became five.

| Screen | Answers |
|---|---|
| **Overview** | Where you sit. Attribution, the member headline, where members stand, flow, growth |
| **Members** | The value case: six ways, association against effect, the opportunities, the refusals |
| **Guest list** | Grid and drawer. Masked by default, paginated, value band and daypart |
| **Trade density** | Eight dayparts, trading identity, member penetration, daypart standardisation |
| **Coverage** | The checks, card capture month by month, what to fix and what it unlocks |

`/coming-back` and `/growth` are absorbed into Overview. `/value` becomes
Members. **The pre-shift Brief moves to Loyalty** — Insights reports what
happened and publishes the definitions; Loyalty acts on them and owns the channel.

Trade density validates against the Trade Density Framework on first contact: the
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
- A lifecycle verdict is **null at source** for anyone not enrolled — card reissue
  is unmeasured and looks identical to churn. A rule stated in prose and
  unenforced in the data is not a control.
- An **inferred** verdict (Slipping, Regulars, Established) needs three visits,
  because two visits is one gap and one gap is not an estimate. An **observed**
  state (Seen once, New, Lapsed) rests on the calendar and needs no minimum.
- Tiles round to the nearest ten. **Grids and exports never round.** A figure
  shown beside its operands is computed from the operands as displayed.
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
data/<org>/            extracted snapshots — the only thing the app reads
scripts/
  snowflake.ts         connection (SSO now, key-pair when one exists)
  verify.ts            proves every check can fail
  extract/
    orgs.ts            organisations, windows, the eight dayparts
    sql.ts             the warehouse models: orders, bridge, the card spine
    queries.ts         one query per output file
    run.ts             orchestration, card-quality gate, pseudonymisation
src/lib/
  stats.ts             Kaplan-Meier, paired intervals, standardisation, detection
  metrics.ts           every derived figure, so two screens cannot disagree
  checks.ts            the 24 checks
  data.ts              snapshot access — the seam a live warehouse would replace
```

---

## Not built

Out of scope per PRD §7.4: audiences, holdouts, incrementality, prediction, the
sensitivity dial, pooling views, cross-venue overlap, postcode.

Held for want of data, not appetite: cohort retention curves and any lifetime
value figure — three months cannot carry either. Expected-next-visit with
confidence bands is the next thing worth building, and the survival curve the
thresholds now come from is most of the work.

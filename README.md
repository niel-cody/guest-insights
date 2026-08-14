# Guests — POC

The customer side of the sales report, built on real Oolio Pay trade.

A proof-of-concept for [Customer Reporting PRD v1.0](https://oolio.atlassian.net/wiki/spaces/in),
to be shown to the VPC, the Market Council and leadership. Not a prototype of the
product — the proof that the product is worth building.

Two organisations, switchable from the scope bar on any screen:

| | Coffee Guru | Meat Flour Wine |
|---|---|---|
| Service model | **Counter** | **Table** |
| Venues | 20 | 2 |
| Orders in window | 1.78M | 41k |
| Average order | $14 | $267 |
| Party size recorded | 1.00, on 24% of orders | **3.4, on 97% of card orders** |
| Median gap between visits | **3 days** | **17 days** |
| Member scan rate | 18% of orders | 3% of orders |

The pair is the argument: the same report has to work for a daily-habit counter
business and a monthly-occasion table-service one, and the thresholds, the
questions it can answer, and the comparisons it is allowed to publish all differ
between them. Coffee Guru is the base mark; Meat Flour Wine is the contrast.

---

## What the data says

Everything below was measured against production Snowflake, not assumed.

### The demo moment is real, and current

Over the current card window (**May – Aug 2026**), Coffee Guru:

| | Share of revenue |
|---|---|
| Enrolled members — what a loyalty CRM sees | **18%** |
| Added by recognising the payment card | **64%** |
| **Total attributable to a returning person** | **82%** |

18% → 82% with no enrolment, no app and no scan. The 18% matches Coffee Guru's
live Customer Report exactly, so the starting point is checkable.

### The finding that changes the leadership pitch

**`PAYMENT_ACCOUNT_REFERENCE` was written as a single constant value, estate-wide,
for eleven months** — roughly May 2025 to March 2026, across ~130M transactions and
~1,900 stores. The field was never null, so every `COUNT(PAR)` coverage test scored
it as 100% covered.

| Period (estate-wide, ≥200 txn store-months) | `PAR IS NOT NULL` | PAR actually usable |
|---|---|---|
| Feb – Apr 2025 | 100% | 92–95% |
| **May 2025 – Mar 2026** | **100%** | **0.0%** |
| Apr – Aug 2026 | 100% | **99.6–99.9%** |

Two consequences, and they point in opposite directions:

1. **The current position is better than the PRD claims.** Usable card recognition
   today is ~99.7% of card transactions, not the 82.87% in PRD §2. That figure is a
   non-null count spanning the outage.
2. **The history is much worse.** There is no usable card history before roughly
   April 2026, so no card-tier longitudinal claim — 24-month trend, cohort
   retention, card-tier churn — can be made from data older than that. The PRD's
   8.25M distinct guests over May–Jul 2026 is post-repair and stands.

This is the same class of defect as the `CUSTOMER_ID` empty-string trap already
documented in the build-a-thon run sheet, one column over. It is worth confirming
before §2 goes in front of leadership, and worth an alert so it cannot recur
silently.

The app treats this as a product requirement rather than a footnote: it tests
distinct-references-per-transaction per month, refuses months that fail, draws them
hatched, and never renders a capture failure as a fall in customers.

### Other measured facts

- **The payments→POS store map can be derived from evidence.** PRD §6.4 item 7
  leaves it unresolved (38 of 3,190). Joining on `(STORE, ORDER_NUMBER,
  TRADING_DATE)` and keeping dominant pairs resolves **20 of 20** Coffee Guru
  venues across 37 terminals. Order number alone is unusable — reused 6.03M times.
- **Thresholds must be calibrated per business.** Coffee Guru's median gap between
  visits is **3 days**; Meat Flour Wine's is **17**. A fixed 90-day lapse rule
  calls almost nobody lapsed at the cafe. Calibrated cuts: Coffee Guru slipping >9d
  / lapsed >26d; Meat Flour Wine >42d / >77d.
- **The loyalty paradox reproduces on real data, and the control reverses it.** At
  Meat Flour Wine, members appear to spend **38% less** per order ($199 against
  $319). Restricted to orders that record a party size — the only like-for-like
  basis — members spend **$372 an order against $325**, for 3.42 people against
  3.35, which is **$108.97 a head against $96.95: 12% more**. The sign flips.
  Publishing the naive figure is how a loyalty programme gets cut for the wrong
  reason, and it is what almost every loyalty report in the category does.
- **The same comparison is refused at Coffee Guru**, because party size there is
  1.00 on every order it is recorded on. Counter service cannot support the
  control, so the product says so instead of qualifying the claim in a footnote.

---

## Running it

```bash
npm install && npm run dev
```

The app reads pre-extracted JSON from `data/` and makes no warehouse calls at
request time. It is fully static and deploys to Vercel with no environment
variables and no database.

### Refreshing from Snowflake

```bash
npm run extract
```

Reads `~/.snowflake/connections.toml` and uses the same SSO credentials an analyst
uses interactively. Runs in about two minutes for both organisations.

**This is why the app ships snapshots rather than querying live:** the connection
uses `authenticator = "externalbrowser"`, which cannot run in a serverless
function. If a key-pair service user is provisioned later, set
`SNOWFLAKE_PRIVATE_KEY_PATH` and the same script runs headless; swapping the app to
live queries then means replacing the body of `src/lib/data.ts` and nothing else.

### Privacy

No customer name, email, phone or raw Payment Account Reference leaves the
warehouse. Identities are salted-hashed at extract time and given a stable,
obviously synthetic display name, so the snapshot is real trade behaviour attached
to an unidentifiable person. The salt lives in `.extract-salt` and is gitignored,
so a hash cannot be replayed against the warehouse. This matters because the
artefact gets deployed and shown around.

---

### Data quality is a product surface, not a caveat

Two panels on **Coverage** exist because a reporting product that only reports is
worth less than one that tells the operator which missing field is costing them an
answer:

- **Outside the bounds of normal.** Venues tested against their peers and against
  their own history, using the median and median absolute deviation rather than the
  mean and standard deviation — with twenty venues, one outlier inflates a standard
  deviation enough to hide itself. Longitudinal tests are de-trended against the
  estate, so an estate-wide price rise does not flag every venue at once. A finding
  has to be both statistically unusual (modified z ≥ 2.5) **and** materially large
  (8–25% depending on the metric), because significance without materiality trains
  people to ignore the panel. Coffee Guru: 2 findings across 20 venues.
- **What to fix, and what it unlocks.** Each gap names the fix, who owns it, and
  the specific question that stays unanswerable until it is closed — e.g. party
  size missing on 62% of Meat Flour Wine's member orders is what stops the
  members-versus-everyone comparison being the strongest claim in the report.

## The screens

| Screen | Answers | PRD |
|---|---|---|
| **Overview** | The ninety-second test: owned count → gained/lost → action block → growth split | §5 |
| **Brief** | The product. Pre-shift card, printed staff sheet, return tap, silence state | §7.1, R-135 |
| **Coming back** | MQ4–MQ7. 24-month flow, lifecycle, calibrated thresholds | §5 |
| **Growth** | MQ9 — "you put prices up, did anyone leave?" | §5 |
| **Value** | MQ1–MQ3, and the refusal list | §6.2 |
| **Guest list** | Grid, drawer, the one-visit case | §5 |
| **Coverage** | The honesty system, reconciliation, the PAR finding | §7.1 |

### Decisions taken to unblock, flagged for reversal

PRD §6.4 leaves three items open that block design. Rather than stall, each has a
default, visible on screen and swappable in one place:

1. **Symmetric Shapley** for the growth decomposition (open #1). Order-independent
   and sums exactly, so the waterfall needs no residual bar. LMDI draws different
   bars; the method is named on the Growth screen. → `shapley()` in `src/lib/metrics.ts`
2. **MQ2 on the covered subset**, with the control and what it found stated on
   screen (open #2). → `src/app/[org]/value/page.tsx`
3. **Card tier needs 2+ visits to be a person** (adjacent to open #3). →
   `CARD_PERSON_FILTER` in `scripts/extract/sql.ts`

### Contract points enforced in code

- Revenue grain is the primary coverage measure; transaction grain names its
  denominator; **guest-grain coverage is never computed**.
- Card tier gets counts and a "last seen" date, **never a lifecycle verdict** —
  card reissue is unmeasured and looks identical to churn.
- **Tiles round to the nearest ten. Grids and exports never round.**
- Reconciliation invariants are a build gate, shown in the header on Coverage and
  Guest list.
- Every control on screen is wired or absent. There is no third option.
- Headline figures never use the trailing partial month.

---

## Layout

```
data/<org>/            extracted snapshots — the only thing the app reads
scripts/
  snowflake.ts         connection (SSO now, key-pair when one exists)
  extract/
    orgs.ts            organisations, window, canonical thresholds
    sql.ts             the warehouse models: orders, bridge, person grain
    queries.ts         one query per output file
    run.ts             orchestration, PAR quality gate, pseudonymisation
src/lib/
  metrics.ts           every derived figure, so two screens cannot disagree
  data.ts              snapshot access — the seam a live warehouse would replace
```

---

## Not built

Deliberately out of scope per PRD §7.4: audiences, holdouts, incrementality,
prediction, the sensitivity dial, pooling views, cross-venue overlap, postcode.

Not yet built and worth doing next: the cohort retention triangle, the weekly
digest as an actual email artefact, and the designed states for a brand-new venue
and a cash-heavy venue.

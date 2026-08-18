# Team reporting — recommendations not taken in the refinement pass

**19 August 2026.** Written against `v0.8.1`.

The refinement brief asked for clarity, consistency and progressive disclosure,
and drew a line: *for larger product decisions such as page renaming, major
information-architecture changes or entirely new visualisations, document the
recommendation rather than silently making the decision.*

This file is that documentation. Everything here is a recommendation with a
reason and a cost. Nothing here has been done.

---

## R1 — "Margin" is the wrong name for the page

**Recommendation: rename to `Efficiency`. Do not do it in a refinement pass.**

The page answers *where is the team working efficiently, and when*. It carries
wage percentage, sales per labour hour, planned-against-actual, the trading
week, the weekday exceptions, section costs and penalty exposure. Exactly one of
its figures is a margin, and that margin is **margin after labour** — net sales
minus wage cost, with no cost of goods in it, because cost of goods is recorded
on 3.1% of orders.

Three things are wrong with the current name.

1. **It promises gross margin.** Every operator reading "Margin" expects food
   cost to be in it. The page says otherwise in four places, and a page that has
   to correct its own title four times has the wrong title.
2. **It undersells the page.** The interesting content is not the margin line,
   it is the pattern — Daytime at 51% against Evening at 21%, and the ten days
   that fell outside their own weekday's range.
3. **It collides with a real future page.** When COGS becomes reliable there
   will be a genuine margin report, and the name will already be taken by
   something that is not one.

**Why not just do it.** A rename changes a nav item, a URL, a page title, four
layout-test assertions and — the part that actually costs — a customer's muscle
memory. `Efficiency` is the strongest candidate; `Labour efficiency` is more
explicit and less elegant. **This should be decided alongside the equivalent
rename in the production `insights` app**, not separately here, or the POC and
the product will disagree about what the page is called at the moment somebody
is comparing them.

---

## R2 — The service concept should be settled at product level, not per report

**Recommendation: adopt "day part group" as a product-level concept, with the
two default groups configurable per venue.**

This build now derives **Daytime** (04:00–17:00) and **Evening** (17:00–04:00)
as unions of the eight standard day parts. That was the right call for this
data — see the note in `scripts/extract/team.ts` for why the boundary is a day
part boundary and not the empirical trough — but it is a *default*, and it is
currently hard-coded.

A venue that trades breakfast, or one that runs a single continuous service,
gets a grouping that does not describe it. The Labour Settings page already has
a per-venue configuration model (labour groups, thresholds, buffers); day part
groups belong beside them.

**Cost:** a settings surface, a migration for venues already live, and a
decision about whether groups may differ per venue inside one organisation —
which they must, or a two-site operator with a café and a restaurant cannot use
either.

---

## R3 — The weekday norm wants a longer window than a card period gives it

**Recommendation: compute weekday norms over a rolling window that is
independent of the selected period.**

The exceptions panel compares each day against the middle half of its own
weekday's instances. Over this three-month window that is 12–14 instances per
weekday and service, which is enough. Over a one-month period it would be four,
and a band drawn from four points moves every time one of them does — which is
why `MIN_INSTANCES_FOR_NORM` holds the panel back rather than drawing a band it
cannot support.

The honest fix is to decouple the norm from the reporting period: show the
selected period's days, judged against a norm built from the last twelve weeks
regardless of what is selected. That is how an operator thinks about it — *is
this Monday normal* means normal lately, not normal within the arbitrary window
currently on screen.

**Cost:** the snapshot is currently one directory per period with nothing
crossing between them, deliberately, so that a surface cannot read across a
data-quality blackout. A norm that spans periods is the first thing in this
build that would. It needs its own grading, exactly as the member cohort lens
did.

---

## R4 — Targets should exist, and should be per weekday and service

**Recommendation: let a venue set a target band per weekday and service, and
show the norm beside it.**

The build currently has **no target at all**. The colour bands (25% / 35%) are
fixed constants, and the exceptions panel deliberately compares a day to its own
history rather than to a target, because comparing every period to one number is
what produces the false alarms the brief describes.

That is the right default, and it is not the whole answer. A venue *does* have a
commercial target, and the useful screen shows both: **what this weekday
normally costs, and what you want it to cost.** A Monday daytime that normally
runs 76–146% against a target of 30% is not an exception — it is a business
model question, and the report should be able to say so plainly instead of
staying silent about targets.

**Cost:** a settings surface, and a decision about who sets the target — head
office or venue — which is the same governance question as R2.

---

## R5 — Two things this build refuses that only new data can unlock

Neither is a design decision. Both are named so nobody re-proposes them.

**Gross margin per person.** Needs `COST_PRICE` populated. At 3.1% coverage this
is a menu-costing programme, not a reporting task.

**Difficulty-adjusted performance.** The Performance page compares people on raw
rates and says so — a dead Tuesday lunch and a full Saturday dinner count the
same, and the spread between two shifts for one person is wider than the spread
between two people. Fixing it needs a shift-difficulty model. Until that exists,
the strongest honest comparison is a person against their own week, which is
what the page draws.

---

## What was done instead

For the record, so this file is not read as the whole response to the brief:

- Day parts are the primitive; services are unions of them and nest exactly.
- The grain control offers Day part, Weekday, Week, Month and Day.
- `About this` drawers carry method and provenance on six panels.
- KPI cards lost their footnotes; population moved to line 4, reasoning behind
  the button, refusals and data-quality warnings stayed on the face.
- Every page opens with the question it answers.
- The exceptions panel replaced "everything above target" with "outside its own
  weekday's range" — ten rows out of 184 rather than a wall of amber.

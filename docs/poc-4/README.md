# POC 4 — Build Pack

**What engineering builds next, in the shipping product.**

POCs 1 to 3 were prototypes on Vercel. **This lands in `insights.oolio.io`**, in the nav the customer already uses, replacing a report they already open.

**Revised 17 August 2026** after a grilling session with Niel: three reports rather than five surfaces, two builds rather than five phases, and the venue network cut. The earlier five-phase version is superseded, is deliberately not included here, and is not built from.

---

## Read in this order

| # | File | What it is |
|---|---|---|
| 1 | **`00_CONTEXT.md`** | **Read this whole, first.** The absolute rule, why the report is deleted rather than fixed, the three reports, the two windows, what carries and what was cut, the cross-venue respecification, the visualisation mandate, the traps, and the risks carried rather than solved |
| 2 | `01_BUILD_4.md` | The foundation and the three reports |
| 3 | `02_BUILD_5.md` | The guest drawer, the member cohort lens, and one action |

Each build file carries its own acceptance criteria. There is no separate acceptance document.

**Build 4 is load-bearing.** It sets contracts Build 5 extends but cannot contradict. If Build 5 proposes something that breaks a Build 4 rule, Build 4 wins and you raise it rather than resolving it locally.

---

## The four sentences that matter most

1. **Delete the Customer Report. Replace it with three reports: Overview, Behaviour, Guests.** Two dashboards and a data grid.
2. **Do not touch Loyalty Spend or Redemption. Explicit, no exceptions.** If something on those screens looks wrong, raise it in the register and leave it alone.
3. **The report can currently see 3,387 people. It should see 69,530.** That is the whole reason to delete rather than patch, and it is Build 4's long pole.
4. **Users like the charts. Build visualisation, not just tables.** A chart ships when it changes what the reader concludes faster than the table would.

---

## Two builds, and there is no third

| Build | What | Gate |
|---|---|---|
| **4** | Foundation, the three reports, the charts | CI-039, or ship as Customers with tier-agnostic routes |
| **5** | Guest drawer, member cohort lens, add to list | Build 4 passes. **CI-016 reproduced by an engineer** |

After Build 5 this goes to design, UAT and release. **Anything not in these two builds is not in the first version.**

If time runs short, cut from the back of Build 5, never from Build 4's foundation. A report that sees 3,387 people with beautiful charts on it is worse than the one it replaced.

---

## Not in this pack

The projection model and its sliders, in either build. The venue network graph, the distance-decay model and any map, cut on 17 August and parked. Export, send and the Loyalty hand-off, gated on CI-042. Campaign incrementality. A propensity model. Estate roll-up, regions, peer benchmarking, mobile.

---

## Where decisions live

**The Customer Intelligence Decision Register, handed to you separately and read-only. One register, one ID space, and no build file opens a decision.** If you hit something that needs deciding, add it with a `CI-` number and cite it. Do not decide it in a build.

The ones that touch this pack: **CI-011** the card-tier wall · **CI-016** the member window · **CI-017** the bridge model's home and refresh lag · **CI-037** who can unmask · **CI-038** the PCI position on the identity spine · **CI-039** Loyalty agreeing the noun · **CI-042** the four export controls · **CI-028** the card-tier remediation, unassigned.

**Do not build from PRD v0.4.** It carries rejected options alongside decisions and telling them apart is not your job. This pack is the executable statement of it. If the two disagree, raise it.

---

*Produced 17 August 2026 from the V3 council record, the shipped production UI walked the same day, and the grilling record of 17 August.*

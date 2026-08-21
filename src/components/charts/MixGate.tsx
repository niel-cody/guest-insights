import { Card, EmptyState, Facts } from "@/components/ui/Primitives";
import { count, pct } from "@/lib/metrics";
import type { Team } from "@/lib/types";

/**
 * What each person sells — and, first, whether that sentence is allowed.
 *
 * ── Why the gate is a panel and not a silent branch ────────────────────────
 *
 * The next layer of this report is the mix: average item value decomposes into
 * *what* somebody sold, so "who sells the most desserts" and "who is trading
 * people up" are the same question asked twice. Two things have to be true
 * before either can name a person, and both are properties of the warehouse
 * rather than of the analysis:
 *
 *   1. **The order's creator has to be the person who sold what is on it.**
 *      `CREATED_BY_ID` is whoever opened the order. In table service somebody
 *      seats and opens, drinks go on, mains go on, and dessert is rung two
 *      hours later by whoever is still standing. Attribute all of it to the
 *      opener and the dessert ranking measures **who opens tables** — a roster
 *      fact wearing a skill label, which is the exact failure this whole report
 *      was built to refuse.
 *
 *   2. **A paid modifier has to be distinguishable from a product.** Otherwise
 *      there is no attachment rate, because there is no denominator anybody can
 *      defend.
 *
 * Both are measured at extract time and land here as verdicts. This panel
 * renders the answer either way, because **the measurement is the finding**: an
 * operator who learns that their till stamps every line with the order's own
 * timestamp has learned something they can act on with their POS vendor, and
 * they learn nothing at all from a section that quietly does not appear.
 *
 * The alternative — branch silently, show the mix when it works, show nothing
 * when it does not — produces a report that is different on different venues
 * for reasons nobody can see. That is how a reader stops trusting a product:
 * not by being told no, but by not being told anything.
 */
export function MixGate({ team, orgName }: { team: Team; orgName: string }) {
  const mix = team.mix;

  /**
   * No mix object at all means the snapshot predates the queries.
   *
   * Deliberately not phrased as a refusal. Nothing has been measured and found
   * wanting; the question has not been asked yet, and saying "we cannot tell
   * you" would be claiming a finding this build has not earned.
   */
  if (!mix) {
    return (
      <Card
        title="What each person sells"
        subtitle="The layer below average item value: not how much a basket was worth, but what was in it."
      >
        <EmptyState
          title="This snapshot predates the mix extract"
          body={
            <>
              Three queries were added to the team pass — the per-person category mix, and two
              probes that decide whether it may name an individual. Re-run{" "}
              <code>npm run extract -- --team</code> to answer them. Nothing is inferred in the
              meantime, and no partial version of this panel is drawn from the data already here.
            </>
          }
        />
      </Card>
    );
  }

  const a = mix.attribution;
  const m = mix.modifierFlag;
  const late = a.lines ? (a.within30min + a.beyond30min) / a.lines : 0;

  /** The evidence, stated the same way whichever verdict it produced. */
  const evidence = (
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div>
        <h3 className="text-[12px] font-semibold tracking-wide text-ink-secondary uppercase">
          When lines were rung, against when the order opened
        </h3>
        <div className="mt-2">
          <Facts
            rows={[
              ["Paid lines measured", count(a.lines)],
              ["Landing with the order", pct(a.lines ? a.atOrder / a.lines : 0)],
              ["Within five minutes", pct(a.lines ? a.within5min / a.lines : 0)],
              ["Five to thirty minutes", pct(a.lines ? a.within30min / a.lines : 0)],
              ["Beyond thirty minutes", pct(a.lines ? a.beyond30min / a.lines : 0)],
              [
                "Orders whose lines carry more than one timestamp",
                `${count(a.ordersWithSpread)} of ${count(a.orders)}`,
              ],
              [
                "Median lag",
                a.medianLagSec == null ? "—" : `${Math.round(a.medianLagSec)}s`,
              ],
            ]}
          />
        </div>
        {a.beforeOrder > 0 && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            {count(a.beforeOrder)} lines carry a timestamp earlier than the order they sit on. A
            line cannot precede its own order, so this is a warehouse fault rather than a service
            pattern, and it is named here rather than absorbed into a bucket.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-[12px] font-semibold tracking-wide text-ink-secondary uppercase">
          Whether a paid modifier can be told from a product
        </h3>
        <div className="mt-2">
          <Facts
            rows={[
              ["Distinct product names", count(m.names)],
              [
                "Names appearing both as product and as modifier",
                `${count(m.ambiguousNames)} of ${count(m.names)}`,
              ],
              ["Paid lines on those names", pct(m.ambiguousLineShare)],
              ["Revenue on those names", pct(m.paidRevenue ? m.ambiguousRevenue / m.paidRevenue : 0)],
              ["Cleanly-marked paid modifier lines", count(m.cleanModifierLines)],
            ]}
          />
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          The same thing cannot be a modifier on one line and a product on the next. A name that
          appears as both is the marker failing on its own terms, and the share of lines sitting on
          those names is the error bar any attachment rate would carry.
        </p>
      </div>
    </div>
  );

  const attributionRefused = a.verdict !== "sole-author";

  return (
    <Card
      title="What each person sells"
      subtitle="The layer below average item value: not how much a basket was worth, but what was in it."
    >
      {a.verdict === "unknown" && (
        <EmptyState
          tone="warning"
          title="The till does not record when each line was rung, so this is not attributed to anyone"
          body={
            <>
              Every paid line at {orgName} carries its order&rsquo;s own timestamp and no order
              anywhere shows a spread across its lines. That is what a column stamped once at write
              time looks like, and it is indistinguishable from a service where every basket really
              was rung in one moment — <strong className="text-ink">so nothing here separates the
              two</strong>, and a per-person mix built on it would be a guess about who was standing
              at the till.
              <br />
              <br />
              This is a question for the POS vendor rather than a limit of the analysis. Line-level
              timestamps would make every figure below attributable.
            </>
          }
        />
      )}

      {a.verdict === "spread" && (
        <EmptyState
          tone="warning"
          title="Lines arrive through the service, so the mix belongs to a shift and not to a person"
          body={
            <>
              {pct(late)} of paid lines are rung more than five minutes after their order opened,
              and {count(a.ordersWithSpread)} of {count(a.orders)} orders carry lines at more than
              one moment. At {orgName} an order is a service rather than a transaction: somebody
              seats and opens it, and whoever is on rings the next course.
              <br />
              <br />
              <strong className="text-ink">
                Attributing the whole basket to whoever opened it would rank who opens tables, not
                who sells.
              </strong>{" "}
              That is the same defect as ranking on net sales — a roster fact wearing a skill label
              — and this report refuses it in one place for the same reason it refuses it in the
              other. The mix is real at venue and shift level and will be published there.
            </>
          }
        />
      )}

      {!attributionRefused && !m.usable && (
        <EmptyState
          tone="warning"
          title="No attachment rate is published, because a paid modifier cannot reliably be told from a product"
          body={
            <>
              {count(m.ambiguousNames)} product names appear both flagged as a modifier and not,
              carrying {pct(m.ambiguousLineShare)} of paid lines — above the {pct(0.02)} this build
              will compute a rate on.
              <br />
              <br />
              The error is not random, which is what makes it disqualifying rather than merely
              annoying. Whether a modifier gets flagged depends on how the item was configured and
              how it was rung, and both vary by person —{" "}
              <strong className="text-ink">
                so the noise sits on exactly the axis an attachment rate claims to measure
              </strong>
              . A ranking built on it would order people by their keying habits and call it
              upselling. The category mix below is unaffected: it counts what was sold, not how it
              was classified.
            </>
          }
        />
      )}

      {!attributionRefused && (
        <div className={m.usable ? "" : "mt-5"}>
          <EmptyState
            title="The mix panels arrive at the next data refresh"
            body={
              <>
                Attribution holds at {orgName}:{" "}
                {pct(a.lines ? (a.atOrder + a.within5min) / a.lines : 0)} of paid lines are rung
                within five minutes of their order opening, so the person who opened it is the
                person who sold it. The per-person category mix has been extracted and the panels
                that read it are being built against these numbers rather than ahead of them.
              </>
            }
          />
        </div>
      )}

      {evidence}
    </Card>
  );
}

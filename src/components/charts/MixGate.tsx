import { Card, EmptyState, Facts } from "@/components/ui/Primitives";
import { count, money, pct } from "@/lib/metrics";
import type { Team } from "@/lib/types";

/**
 * What each person sells — and, first, whose sale it was.
 *
 * ── Why the gate is a panel and not a silent branch ────────────────────────
 *
 * The next layer of this report is the mix: average item value decomposes into
 * *what* somebody sold, so "who sells the most desserts" and "who is trading
 * people up" are the same question asked twice. Two things have to be true
 * before either can name a person, and both are properties of the warehouse
 * rather than of the analysis:
 *
 *   1. **The order has to be credited to the right person.** The header
 *      carries two staff columns and they disagree — on 16% of Meat Flour
 *      Wine's orders and 58% of Amalfi's. A manager or host opens the table
 *      and the section's server owns it, so crediting the opener would rank
 *      **who opens tables**, a roster fact wearing a skill label. The mix is
 *      credited to the assignee.
 *
 *   2. **A paid modifier has to be distinguishable from a product.** Otherwise
 *      there is no attachment rate, because there is no denominator anybody can
 *      defend.
 *
 * Both are measured at extract time and land here as verdicts. This panel
 * renders the answer either way, because **the measurement is the finding**: an
 * operator who learns that a third of their trade is rung on unnamed logins has
 * learned something they can fix this week, and they learn nothing at all from
 * a section that quietly does not appear.
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
  const unnamedShare = a.net ? a.unnamedNet / a.net : 0;
  const differsShare = a.orders ? a.assignedDiffers / a.orders : 0;

  /** The evidence, stated the same way whichever verdict it produced. */
  const evidence = (
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div>
        <h3 className="text-[12px] font-semibold tracking-wide text-ink-secondary uppercase">
          Whose sale it was
        </h3>
        <div className="mt-2">
          <Facts
            rows={[
              ["Completed orders", count(a.orders)],
              ["Carrying an assignee", pct(a.orders ? a.ordersAssigned / a.orders : 0)],
              ["Assignee is not the person who opened it", pct(differsShare)],
              [
                "Assigned to an unnamed login",
                `${count(a.ordersAssignedUnnamed)} orders · ${money(a.unnamedNet)}`,
              ],
              ["Share of net sales nobody owns", pct(unnamedShare)],
              [
                "Identities seen",
                `${count(a.assignedIdentities)} assigned · ${count(a.createdIdentities)} opening`,
              ],
            ]}
          />
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          An unnamed login is a shared terminal, a kiosk or a training session. Its trade is real
          and counted at venue level; it is nobody&rsquo;s mix, and it is named here rather than
          going quietly missing from the bottom of a league table.
        </p>
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
              [
                "Revenue on those names",
                pct(m.paidRevenue ? m.ambiguousRevenue / m.paidRevenue : 0),
              ],
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

  return (
    <Card
      title="What each person sells"
      subtitle="The layer below average item value: not how much a basket was worth, but what was in it."
    >
      {a.verdict === "absent" && (
        <EmptyState
          tone="warning"
          title="No order at this organisation records who it belonged to, so nothing here is attributed to a person"
          body={
            <>
              {pct(a.orders ? a.ordersAssigned / a.orders : 0)} of completed orders carry an
              assignee. The mix is real at venue and shift level and will be published there, but a
              per-person figure would be crediting sales to whoever happened to open the order —
              which ranks who opens orders, not who sells.
            </>
          }
        />
      )}

      {a.verdict === "thin" && (
        <EmptyState
          tone="warning"
          title={`${pct(unnamedShare)} of net sales here is rung on logins with no name attached`}
          body={
            <>
              {count(a.ordersAssignedUnnamed)} orders worth {money(a.unnamedNet)} are assigned to a
              shared terminal, a kiosk or a training session rather than to a person. Those are held
              out of everything below, so the per-person mix describes{" "}
              <strong className="text-ink">{pct(1 - unnamedShare)} of {orgName}&rsquo;s trade
              </strong>{" "}
              and not all of it.
              <br />
              <br />
              It is published on that basis rather than withheld, because the gap is nameable and
              fixable: every one of those orders would be attributable if the till asked who was
              ringing it. What is refused is the version that shows the ranking without the
              sentence you have just read.
            </>
          }
        />
      )}

      {!m.usable && a.verdict !== "absent" && (
        <div className={a.verdict === "thin" ? "mt-5" : ""}>
          <EmptyState
            tone="warning"
            title="No attachment rate is published, because a paid modifier cannot reliably be told from a product"
            body={
              <>
                {count(m.ambiguousNames)} product names appear both flagged as a modifier and not,
                carrying {pct(m.ambiguousLineShare)} of paid lines — above the {pct(0.02)} this
                build will compute a rate on.
                <br />
                <br />
                The error is not random, which is what makes it disqualifying rather than merely
                annoying. Whether a modifier gets flagged depends on how the item was configured and
                how it was rung, and both vary by person —{" "}
                <strong className="text-ink">
                  so the noise sits on exactly the axis an attachment rate claims to measure
                </strong>
                . A ranking built on it would order people by their keying habits and call it
                upselling. The category mix is unaffected: it counts what was sold, not how it was
                classified.
              </>
            }
          />
        </div>
      )}

      {a.verdict !== "absent" && (
        <div className={a.verdict === "thin" || !m.usable ? "mt-5" : ""}>
          <EmptyState
            title="The mix panels arrive at the next data refresh"
            body={
              <>
                Sales are credited to the server the order was assigned to, which is how a venue
                credits a sale — not a claim about who keyed each line, which the warehouse does not
                record. At {orgName} the assignee differs from whoever opened the order on{" "}
                {pct(differsShare)} of orders, so the distinction is doing real work rather than
                being a technicality.
                <br />
                <br />
                {count(mix.rows.length)} person-and-category rows across{" "}
                {count(mix.categories.length)} categories
                have been extracted. The panels that read them are being built against these numbers
                rather than ahead of them.
              </>
            }
          />
        </div>
      )}

      {evidence}
    </Card>
  );
}

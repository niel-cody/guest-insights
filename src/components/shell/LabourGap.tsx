import { EmptyState } from "@/components/ui/Primitives";
import { money, pct } from "@/lib/metrics";
import type { Team } from "@/lib/types";

/**
 * When the timesheets start later than the trade.
 *
 * ── Adoption is a timeline, not a defect ───────────────────────────────────
 *
 * A customer trades on the POS for six months and switches timesheets on in
 * month three. That is not broken data — it is the ordinary shape of getting
 * better at the product, and a report that blanks four of five windows for it
 * is punishing somebody for adopting a feature late.
 *
 * The first version of this refused the whole window, which was the wrong
 * correction to a real problem. Amalfi's five windows published wage
 * percentages of 24.4%, 8.3%, 6.2%, 0.0% and 0.0% — and the fault in the 6.2%
 * was never that the window was long. It was that the numerator covered one
 * month while the denominator covered five.
 *
 * So both halves are restricted to the months the timesheets cover, and this
 * says which months those are. The operator gets July's true 24.4% rather than
 * a diluted 6.2% or a blank.
 *
 * ── Why the sentence has to be next to the number ──────────────────────────
 *
 * A wage percentage that is too *low* is the only error in this section nobody
 * reports: it is good news, plausible to anyone who does not run a kitchen, and
 * an operator who acts on it rosters up. So the sub-window is stated where the
 * figure is read, not in a drawer.
 */
export function LabourGap({ team, orgName }: { team: Team; orgName: string }) {
  const lab = team.labour;
  if (lab.complete) return null;

  const monthName = (m: string) =>
    new Date(`${m}T00:00:00Z`).toLocaleDateString("en-AU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

  const none = lab.monthsWithCost.length === 0;

  return (
    <EmptyState
      tone="warning"
      title={
        none
          ? `No timesheet in this window carries a cost, so ${orgName}'s labour figures are not computed`
          : `Labour figures here cover ${lab.monthsWithCost.map(monthName).join(", ")} — ${lab.monthsWithCost.length} of the ${lab.monthsInWindow.length} months this report spans`
      }
      body={
        <>
          {lab.note}
          {!none && lab.wagePct != null && (
            <>
              <br />
              <br />
              Over those months {orgName} traded{" "}
              <strong className="text-ink">{money(lab.net)}</strong> and its wage percentage is{" "}
              <strong className="text-ink">{pct(lab.wagePct)}</strong>. Selecting a single covered
              month in the period control gives the same figure over a window with no gap in it at
              all.
            </>
          )}
        </>
      }
    />
  );
}

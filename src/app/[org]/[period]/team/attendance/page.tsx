import { FlatPanel, FlatTile, Placeholder } from "@/components/shell/Placeholder";

export const dynamic = "force-static";
export const metadata = { title: "Attendance" };

/**
 * Attendance. **Production. Not built, not changed, not fixed here.**
 *
 * ── The one thing worth knowing ────────────────────────────────────────────
 *
 * This report reads POS clock-in and clock-out — Oolio's own time capture — and
 * at the venues that have a rostering integration it is **empty**. Meat Flour
 * Wine carries three worklog rows in total against thousands of costed Tanda
 * timesheet segments. The staff clock in on the rostering system, not the till.
 *
 * That is not a fault in this screen. It is the same fact from the other side:
 * **there are two sources of the same truth and only one of them is being
 * used.** Every hour figure in this build's Team section comes from the vendor
 * timesheet, because that is where the hours actually are — and which of the two
 * clocks is authoritative is a decision the product has not taken.
 *
 * A venue on neither Tanda nor Deputy has only this screen, and it is the reason
 * the question matters rather than being a curiosity.
 */
export default function AttendancePage() {
  return (
    <Placeholder
      title="Attendance"
      section="Team"
      standfirst="Attendance ships today and is unchanged by this proof of concept. It is here so the Team section reads whole when you click down the sidebar."
      note={
        <div className="rounded-xl border border-line bg-surface-sunken px-5 py-4">
          <h2 className="text-[14px] font-semibold text-ink">
            This screen is empty here, and that is the finding
          </h2>
          <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            Attendance reads clock-in and clock-out from the till. At venues with a rostering
            integration, staff clock in on <strong className="text-ink">that</strong> system instead,
            so this report has almost nothing to show — while the same hours sit, costed and
            complete, in the timesheet feed that Margin and Performance read.
          </p>
          <p className="mt-2 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            <strong className="text-ink">Two sources of one fact, and no decision about which is
            authoritative.</strong> It does not bite while a venue has a rostering vendor connected.
            It bites immediately for a venue that has not, because then this is the only clock there
            is — and it is the only route by which those venues ever get a labour figure at all.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-4">
          <FlatTile label="Clock-in records" value="3" sub="in the window" />
          <FlatTile label="Hours captured" value="—" sub="no complete shift pairs" />
          <FlatTile label="Breaks recorded" value="0" sub="" />
          <FlatTile label="Team members seen" value="2" sub="of 53 ringing trade" />
        </div>
        <FlatPanel title="Hours by team member" subtitle="Clock-in to clock-out, from the till">
          <p className="py-6 text-center text-[13px] text-ink-muted">
            No attendance records for this period.
          </p>
        </FlatPanel>
      </div>
    </Placeholder>
  );
}

import { FlatBars, FlatPanel, FlatTile, Placeholder } from "@/components/shell/Placeholder";

export const dynamic = "force-static";
export const metadata = { title: "Staff Scorecard" };

/**
 * Staff Scorecard. **Production. Not built, not changed, not fixed here.**
 *
 * ── The one thing worth knowing, so nobody tries to "fix" it ───────────────
 *
 * The League Table ranks on **net sales**, and the figures below are the real
 * shape of it. That is not a bug and the team that owns it is not wrong to show
 * it: a manager genuinely does want to know what the till took under each login,
 * and this report answers that question correctly.
 *
 * It is the wrong denominator for the question people *ask* of it. Ranked on a
 * total, the person at the top is whoever worked the most Saturday dinners —
 * the metric measures the roster, not the person. Performance in this build
 * publishes the same population on rates instead, and the two disagree about who
 * is best, which is the finding rather than a defect.
 *
 * **We do not change their screen.** The correction belongs where the per-person
 * claim is being made, and that is Performance.
 */
export default function StaffScorecardPage() {
  return (
    <Placeholder
      title="Staff Scorecard"
      section="Team"
      standfirst="The Staff Scorecard ships today and is unchanged by this proof of concept. It is here so the Team section reads whole when you click down the sidebar."
      note={
        <div className="rounded-xl border border-line bg-surface-sunken px-5 py-4">
          <h2 className="text-[14px] font-semibold text-ink">
            This table is correct, and it is ranking on the wrong axis
          </h2>
          <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            <strong className="text-ink">Net sales per person is a real measurement</strong> and this
            report is right to publish it. It is not a performance ranking: ordered on a total, the
            top of the list is whoever was given the most hours on the busiest shifts. Two people
            with identical skill and different rosters are separated by the roster.
          </p>
          <p className="mt-2 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            <strong className="text-ink">Performance</strong> publishes the same people on rates —
            per cover, per labour hour — and decomposes the difference into attachment against
            trading up. That screen carries the correction; this one is not being changed to carry
            it.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-4">
          <FlatTile label="Team members" value="53" sub="logins ringing trade" />
          <FlatTile label="Net sales" value="$2.65M" sub="attributed to a login" />
          <FlatTile label="Average sale" value="$282" sub="per order" />
          <FlatTile label="Refund rate" value="0.6%" sub="per 100 orders" />
        </div>

        <FlatPanel title="League table" subtitle="Team members ranked by net sales">
          <FlatBars
            max={225_893}
            rows={[
              { label: "Kenisha M", value: 225_893, display: "$225,893" },
              { label: "Penny M", value: 200_159, display: "$200,159" },
              { label: "Anastasia T", value: 164_437, display: "$164,437" },
              { label: "Natalie L", value: 163_762, display: "$163,762" },
              { label: "Aleksandra M", value: 151_567, display: "$151,567" },
            ]}
          />
        </FlatPanel>

        <FlatPanel title="Trading period × weekday" subtitle="Where each team member's sales land">
          <FlatBars
            max={2_023_106}
            colour="var(--tier-card)"
            rows={[
              { label: "Dinner", value: 2_023_106, display: "$2,023,106" },
              { label: "Lunch", value: 629_377, display: "$629,377" },
            ]}
          />
        </FlatPanel>
      </div>
    </Placeholder>
  );
}

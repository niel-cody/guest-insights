import { Card, EmptyState } from "@/components/ui/Primitives";
import { Facts } from "@/components/ui/Primitives";
import { count } from "@/lib/metrics";
import type { Team } from "@/lib/types";

/**
 * What the Team section says to an organisation that has no workforce system.
 *
 * ── Why this is a page and not an empty state ──────────────────────────────
 *
 * Coffee Guru is nineteen venues, 250,272 orders and no rostering vendor. Every
 * figure in this section divides something the POS knows by something only a
 * workforce system knows, so there is nothing here to render and no amount of
 * cleverness changes that.
 *
 * The lazy version is a grey panel reading "No data available", which an
 * operator reads as *the report is broken* and a reviewer reads as *the build is
 * unfinished*. Neither is true. The correct statement is **"you have not
 * connected a rostering system, here is the list of questions that unlocks, and
 * here is what we can already see without it"** — which is a commercial
 * conversation rather than an error message.
 *
 * It also carries the POS-side count, because that is the honest half: Coffee
 * Guru does have staff identities ringing orders, and what it lacks is the cost
 * side to divide them by. Publishing the sales side alone is refused for the
 * reason stated below, and the refusal is the same one the Performance page
 * makes for a different reason — a raw sales total ranks people by how many
 * hours they were rostered.
 */
export function Unavailable({ team, orgName }: { team: Team; orgName: string }) {
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <Card title={`${orgName} has no workforce management integration`}>
        <p className="max-w-[92ch] text-[14px] leading-relaxed text-ink-secondary">{team.refusal}</p>
      </Card>

      <Card
        title="What connecting one would answer"
        subtitle="Each of these is one join away, and none of them is answerable without it."
      >
        <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-secondary">
          {[
            ["Wage percentage by service, day, week and month", "The cost side does not exist, so there is no denominator to divide trade by."],
            ["Sales per labour hour, by venue and by person", "Hours worked are held by the rostering system, not the till."],
            ["Planned against actual labour", "There is no roster to compare the outcome against."],
            ["Penalty and overtime exposure", "Ordinary against non-ordinary hours is an award classification the POS never sees."],
            ["Which shifts return the least against what they cost", "Requires both halves at once."],
          ].map(([q, why]) => (
            <li key={q} className="border-l-2 border-line pl-3">
              <span className="font-medium text-ink">{q}</span>
              <br />
              {why}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="What is here without it">
        <Facts
          rows={[
            ["POS identities ringing trade in this window", count(team.integrity.posIdentities)],
            ["Employees on a workforce roll", "none"],
            ["Costed timesheet segments", "none"],
            ["Published roster", "none"],
          ]}
        />
        <div className="mt-4">
          <EmptyState
            title="The sales side alone is not published as performance"
            body={
              <>
                We could rank these {count(team.integrity.posIdentities)} identities by what they
                rang. We do not, and the reason is the same one that governs the Performance report
                for the organisation that <em>does</em> have the integration:{" "}
                <strong className="text-ink">
                  a raw sales total ranks people by the hours they were given
                </strong>
                . The person at the top of that table is whoever worked the most Saturdays. It is a
                roster report wearing a performance label, and publishing it teaches an operator to
                trust a number that cannot survive its first argument with a staff member.
              </>
            }
          />
        </div>
      </Card>
    </div>
  );
}

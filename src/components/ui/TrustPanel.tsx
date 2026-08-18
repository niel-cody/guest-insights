import { Card, EmptyState, Pill } from "@/components/ui/Primitives";
import { Disclosure } from "@/components/ui/Disclosure";
import { IconAlert, IconCheck } from "@/components/shell/Icons";
import { detectAnomalies, groupByVenue } from "@/lib/anomalies";
import { qualityFindings } from "@/lib/quality";
import { explainWindow } from "@/lib/window";
import type { Check } from "@/lib/checks";
import type { CoverageState } from "@/lib/metrics";
import { count, dayLabel, monthLabel, pct, attributionPct } from "@/lib/metrics";
import type { Snapshot } from "@/lib/types";
import { IDENTITY_LABEL } from "@/lib/lexicon";

/**
 * §5.7. The trust panel — **a panel inside Overview, not a report.**
 *
 * ── Why this is not the sixth sidebar item it used to be ───────────────────
 *
 * Coverage shipped as its own screen and it was the screen nobody opened. A
 * diagnostics report that an operator has to be told about is a report that
 * exists for the team that built it. Folding it into Overview means the reader
 * meets the price at the moment they have just read the claims, which is the
 * only moment it changes what they do with them.
 *
 * ── The order is the rule ──────────────────────────────────────────────────
 *
 * **State the claim before the price paid for it.** What this report can tell
 * you, then what it cannot. Leading with the shortfall gets the product argued
 * with rather than used; leading with the claim and following immediately with
 * its cost gets it trusted. The cost is never more than one screen away and
 * never behind a click.
 *
 * The month-by-month grading and the check register **are** behind a disclosure,
 * because they are evidence rather than caveats — the finding they support is
 * stated in the open above them.
 */
export function TrustPanel({
  snap, checks, coverage: cov,
}: {
  snap: Snapshot;
  checks: Check[];
  coverage: CoverageState;
}) {
  const { org, coverage, members, venueMonthly, cohorts } = snap;
  const findings = qualityFindings(org, coverage, members);
  const anomalies = detectAnomalies(venueMonthly, org.cardTier.months, org.window.end);
  const byVenue = groupByVenue(anomalies);
  const explain = explainWindow(org);
  const passed = checks.filter((c) => c.ok).length;
  const warnings = checks.filter((c) => !c.ok && c.severity === "warning").length;

  const sevTone: Record<string, "critical" | "warning" | "neutral"> = {
    blocking: "critical", material: "warning", minor: "neutral",
  };

  return (
    <Card
      title="What this report is standing on"
      subtitle="The claims it can make, the price paid for them, and the evidence underneath."
    >
      {/* ── the claim, then the price ─────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border px-4 py-3.5" style={{ borderColor: "var(--good)" }}>
          <h3 className="text-[13px] font-semibold text-ink">What this report can tell you</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink-secondary">
            {[
              `Who your ${count(members.crossSection.member.people + members.crossSection.nonMember.people)} identifiable people are, what they are worth, and how often they come — ${attributionPct(cov.identifiedRevenueShare)} of revenue, against the ${attributionPct(cov.scannedRevenueShare)} a loyalty CRM sees.`,
              "Where your members are and are not, by day and daypart, in venue-local time.",
              "Which guests cross venues, and how much more they are worth than guests who had the same opportunity and did not.",
              "What enrolling somebody is actually worth, separated from what was already true of the people who enrol.",
              cohorts?.grading.renders
                ? `On the loyalty identity only, over ${count(cohorts.grading.days)} days: cohort retention, tenure and survival.`
                : null,
            ]
              .filter(Boolean)
              .map((line) => (
                <li key={line as string} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--good)" }}>
                    <IconCheck className="h-3.5 w-3.5" />
                  </span>
                  <span className="max-w-[60ch]">{line}</span>
                </li>
              ))}
          </ul>
        </div>

        <div className="rounded-lg border px-4 py-3.5" style={{ borderColor: "var(--warning)" }}>
          <h3 className="text-[13px] font-semibold text-ink">And what it cannot</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink-secondary">
            {[
              ...explain.costs,
              "Lifetime value. A lifetime cannot be observed inside 92 days, and a number that assumes one is a forecast wearing a measurement's clothes.",
              "Anything about people who paid cash and never scanned. They are real trade and they are not in the identified population.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0" style={{ color: "var(--warning)" }}>
                  <IconAlert className="h-3.5 w-3.5" />
                </span>
                <span className="max-w-[60ch]">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── the two windows, side by side, with the wall between them ────── */}
      <div className="mt-5 rounded-lg border border-line bg-surface-sunken px-4 py-3.5">
        <h3 className="text-[13px] font-semibold text-ink">Two populations, two clocks</h3>
        <p className="mt-1 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
          Nothing in this product renders across both. A figure that spanned them would be averaging a
          payment card over 92 days against a loyalty scan over 21 months and calling the result one number.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <WindowCard
            title={IDENTITY_LABEL.card}
            identity="payment card"
            window={`${dayLabel(org.window.start)} – ${dayLabel(org.window.end)}`}
            days={org.window.days}
            coverage={`${attributionPct(cov.identifiedRevenueShare)} of revenue`}
            renders={false}
            thresholdDays={org.calibration.lapsedDays}
            can="who they are, what they are worth, cadence, cross-venue"
            cannot="growth, trend, year-on-year, lifetime, churn"
          />
          <WindowCard
            title={IDENTITY_LABEL.member}
            identity="loyalty scan"
            window={
              cohorts
                ? `${monthLabel(cohorts.window.start)} – ${monthLabel(cohorts.window.end)}`
                : "not loaded"
            }
            days={cohorts?.grading.days ?? 0}
            coverage={
              cohorts
                ? `${pct(
                    cohorts.coverage.at(-1)!.coverage,
                    1,
                  )} of orders in the latest month`
                : "—"
            }
            renders={cohorts?.grading.renders ?? false}
            thresholdDays={cohorts?.grading.thresholdDays ?? org.calibration.lapsedDays}
            can="cohort retention, tenure, survival"
            cannot="trend, until Nov 2026"
          />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
          The card window is three months because the payment reference was the literal string{" "}
          <code className="text-[11px]">&apos;N/A&apos;</code> estate-wide from May to December 2025. It is
          not a reporting preference — it is the period the data supports.{" "}
          <strong className="text-ink-secondary">
            The next claim unlocks in November 2026
          </strong>
          , when the loyalty identity reaches 24 complete months and a trend claim becomes available.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          Selecting a range longer than a tier supports scopes the answer to the tier that does support it
          and says so, rather than silently returning a shorter period than you asked for. The period
          control offers only the runs of months that pass the grading, so there is no calendar here
          offering a window the data cannot fill.
        </p>
      </div>

      {/* ── the owned gaps ───────────────────────────────────────────────── */}
      <div className="mt-5">
        <h3 className="text-[13px] font-semibold text-ink">
          What to fix, who owns it, and what it unlocks
        </h3>
        {findings.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              title="Nothing material is missing"
              body="Every field this report depends on is being captured at a rate that supports the claims made from it."
            />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {findings.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                  <h4 className="text-[13px] font-semibold text-ink">{f.title}</h4>
                  <div className="flex items-center gap-2">
                    <Pill tone={sevTone[f.severity]}>{f.severity}</Pill>
                    <Pill>{f.owner}</Pill>
                  </div>
                </div>
                <p className="mt-1 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">{f.detail}</p>
                <p className="mt-1 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
                  <span className="font-medium text-ink">Unlocks:</span> {f.unlocks}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── venues outside the norm ──────────────────────────────────────── */}
      <div className="mt-5">
        <h3 className="text-[13px] font-semibold text-ink">Venues outside the estate norm</h3>
        <p className="mt-1 text-[12px] text-ink-secondary">
          Each venue tested against its peers and against its own history, on the median and median absolute
          deviation rather than the mean.
        </p>
        {anomalies.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              title={`No venue is behaving unusually across ${org.venues.length} venues`}
              body="Each was tested against its peers this month and against its own trailing history. Nothing cleared both the statistical and the materiality bar."
            />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {byVenue.map(({ venue, items }) => (
              <li key={venue} className="px-4 py-3">
                <h4 className="text-[13px] font-semibold text-ink">{venue}</h4>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {items.map((a) => (
                    <li key={a.id} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 shrink-0"
                        style={{ color: a.severity === "high" ? "var(--critical)" : "var(--warning)" }}
                      >
                        <IconAlert className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-[13px] font-medium text-ink">{a.headline}</p>
                        <p className="max-w-[95ch] text-[12px] leading-relaxed text-ink-secondary">{a.detail}</p>
                        <p className="tnum text-[11px] text-ink-muted">
                          {a.kind === "peer" ? "against peers" : "against its own history"} · modified z{" "}
                          {a.z.toFixed(1)}
                          {a.month ? ` · ${monthLabel(a.month)}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── the evidence ─────────────────────────────────────────────────── */}
      <div className="mt-5">
        <Disclosure
          summary="See the evidence"
          result={
            <>
              <strong>{passed} of {checks.length} checks pass</strong>
              {warnings > 0 && <> · {warnings} to review</>}. Card capture was graded across{" "}
              {org.cardTier.monthsTested} complete months and {org.cardTier.monthsUsable} passed. Every check
              here is demonstrated failing against a fixture corrupted the way it claims to catch.
            </>
          }
        >
          <h4 className="text-[13px] font-semibold text-ink">Card recognition, month by month</h4>
          <p className="mt-1 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
            The payment reference was never null, so every <code className="text-[11px]">COUNT(reference)</code>{" "}
            coverage test scored the dead months as fully covered. The only test that catches it is the last
            column: the share of a month&apos;s card transactions sitting on a single reference. Healthy
            months here top out around{" "}
            {pct(
              Math.max(...org.cardTier.quality.filter((q) => q.ok).map((q) => q.maxTokenShare), 0),
              1,
            )}{" "}
            and the broken ones sit at 100%.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-[11px] tracking-wide text-ink-secondary uppercase">
                  <th className="py-1.5 pr-3 text-left font-medium">Month</th>
                  <th className="px-2 py-1.5 text-right font-medium">Orders</th>
                  <th className="px-2 py-1.5 text-right font-medium">Card txns</th>
                  <th className="px-2 py-1.5 text-right font-medium">Distinct cards</th>
                  <th className="px-2 py-1.5 text-right font-medium">Distinct / txn</th>
                  <th className="px-2 py-1.5 text-right font-medium">Largest one token</th>
                  <th className="py-1.5 pl-2 text-left font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {org.cardTier.quality.map((q) => (
                  <tr key={q.month} className="border-b border-line last:border-b-0" style={q.ok ? undefined : { opacity: 0.62 }}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">{monthLabel(q.month)}</th>
                    <td className="tnum px-2 py-1.5 text-right text-ink-secondary">{count(q.orders)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink-secondary">{count(q.txns)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink-secondary">{count(q.distinctPar)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-ink-secondary">{q.ratio.toFixed(3)}</td>
                    <td
                      className="tnum px-2 py-1.5 text-right font-medium"
                      style={{ color: q.maxTokenShare >= 0.1 ? "var(--critical)" : "var(--ink-secondary)" }}
                    >
                      {pct(q.maxTokenShare, 1)}
                    </td>
                    <td className="py-1.5 pl-2 text-left">
                      {q.ok ? <Pill tone="good">In the window</Pill> : <span className="text-[11px] text-ink-secondary">{q.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="mt-6 text-[13px] font-semibold text-ink">The check register</h4>
          <p className="mt-1 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">
            A previous build shipped five checks that were internal identities — they compared a number to
            itself and could not fail. They were green on the day the card feed collapsed 403,600
            transactions onto one token. A check with no failing fixture is excluded from the badge.
          </p>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line" id="checks">
            {checks.map((c) => (
              <li key={c.id} className="px-4 py-2.5">
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 shrink-0"
                    style={{ color: c.ok ? "var(--good)" : c.severity === "warning" ? "var(--warning)" : "var(--critical)" }}
                  >
                    {c.ok ? <IconCheck className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <code className="text-[11px] font-medium text-ink">{c.id}</code>
                      {!c.ok && (
                        <Pill tone={c.severity === "warning" ? "warning" : "critical"}>
                          {c.severity === "warning" ? "Review" : "Blocking"}
                        </Pill>
                      )}
                      {c.proof === "unit" && (
                        <span className="text-[10px] text-ink-muted">proven in code, not by fixture</span>
                      )}
                    </div>
                    <p className="mt-0.5 max-w-[100ch] text-[12px] leading-relaxed text-ink-secondary">{c.rule}</p>
                    <p className="tnum text-[11px] text-ink-muted">{c.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </Card>
  );
}

function WindowCard({
  title, identity, window: win, days, coverage, renders, thresholdDays, can, cannot,
}: {
  title: string;
  identity: string;
  window: string;
  days: number;
  coverage: string;
  renders: boolean;
  thresholdDays: number;
  can: string;
  cannot: string;
}) {
  const required = thresholdDays * 2;
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-ink">{title}</h4>
        <span className="text-[11px] text-ink-muted">identified by {identity}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
        <dt className="text-ink-muted">Window</dt>
        <dd className="tnum text-right text-ink">{win}</dd>
        <dt className="text-ink-muted">Observed</dt>
        <dd className="tnum text-right text-ink">{count(days)} days</dd>
        <dt className="text-ink-muted">Coverage</dt>
        <dd className="text-right text-ink">{coverage}</dd>
        <dt className="text-ink-muted">Can show</dt>
        <dd className="text-right text-ink-secondary">{can}</dd>
        <dt className="text-ink-muted">Cannot show</dt>
        <dd className="text-right text-ink-secondary">{cannot}</dd>
      </dl>
      {/* §4.3's render rule, keyed on the tier rather than on a global flag, and
          stated with its arithmetic so the refusal is checkable rather than
          asserted. */}
      <p
        className="tnum mt-2 border-t border-line pt-2 text-[11px] leading-relaxed"
        style={{ color: renders ? "var(--good)" : "var(--warning)" }}
      >
        Retention, churn and lapse figures: {count(days)} days against a {thresholdDays}-day threshold needs{" "}
        {required}. <strong>{renders ? "Renders." : "Refuses."}</strong>
      </p>
    </div>
  );
}

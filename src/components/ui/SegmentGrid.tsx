"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrow, IconChevron } from "@/components/shell/Icons";
import { InfoButton } from "@/components/ui/InfoButton";
import { SEGMENT_COLOUR, count, delta, money, pct, segmentLadder, SEGMENT_LABEL } from "@/lib/metrics";

/**
 * §5.4. Where your members stand — as a grid rather than a table.
 *
 * ── Why this one gets columns you can turn off ─────────────────────────────
 *
 * Most tables in this build are fixed, and that is right: a table whose columns
 * are negotiable is a table nobody can screenshot and refer to. This one is the
 * exception because it is the **only** object on Overview that is genuinely a
 * grid — six rows the reader is going to interrogate, against nine quantities
 * that different readers want in different combinations. A GM wants people and
 * per head. A finance director wants share of spend and the previous period. An
 * area manager wants visits. Shipping all nine at once is a fourteen-column
 * table nobody reads; shipping the union of what three people asked for and
 * calling it the default is how the report this replaces got to eighteen
 * columns.
 *
 * So the columns are toggles, with a default that answers the page's own
 * question — how many, and what are they worth — and the rest one click away.
 *
 * ── The rows are never toggleable ──────────────────────────────────────────
 *
 * There are exactly six lifecycle segments and every one of them is a fact
 * about the business. A control that hides Lapsed is a control that lets
 * somebody produce a screenshot in which Lapsed does not exist, and the shares
 * in the remaining rows would silently re-base against a smaller denominator.
 * Columns are a view. Rows are the population.
 */

type Row = {
  segment: string;
  label: string;
  guests: number;
  visits: number;
  spend: number;
};

/**
 * The previous comparable period.
 *
 * **Not "last quarter".** The snapshot holds one directory per unbroken run of
 * trustworthy card months, and those runs are not adjacent — at this merchant
 * the previous usable period ends thirteen months before this one starts,
 * because the months between failed card capture. Naming it "previous period"
 * without saying which is how a reader concludes they are looking at
 * quarter-on-quarter movement. The label carries the actual dates and the gap.
 */
export type PreviousPeriod = {
  label: string;
  gapMonths: number;
  rows: Row[];
};

type ColumnKey =
  | "people" | "peopleShare" | "visits" | "visitShare"
  | "spend" | "spendShare" | "perHead" | "peopleChange" | "perHeadChange";

const COLUMNS: { key: ColumnKey; label: string; needsPrevious?: boolean; note: string }[] = [
  { key: "people", label: "People", note: "Enrolled people in this segment. The denominator of every per-head figure on the row." },
  { key: "peopleShare", label: "Share of people", note: "This segment as a share of all enrolled people." },
  { key: "visits", label: "Visits", note: "Visits by this segment. A visit is a day at a venue, not a transaction." },
  { key: "visitShare", label: "Share of visits", note: "This segment as a share of all enrolled visits." },
  { key: "spend", label: "Spend", note: "Total trade from this segment inside the window." },
  { key: "spendShare", label: "Share of spend", note: "This segment as a share of all enrolled spend. Read against share of people — the gap is the finding." },
  { key: "perHead", label: "Per head", note: "Spend divided by the people count on the same row, over the window. Not annualised." },
  { key: "peopleChange", label: "People vs previous", needsPrevious: true, note: "Change in the number of people in this segment against the previous comparable period." },
  { key: "perHeadChange", label: "Per head vs previous", needsPrevious: true, note: "Change in spend per head against the previous comparable period. Both periods are the same length, so this is not a rate artefact." },
];

const DEFAULT_ON: ColumnKey[] = ["people", "peopleShare", "spend", "spendShare", "perHead"];

export function SegmentGrid({
  rows, orgSlug, period, lapsedDays, lapsedGuests, previous,
}: {
  rows: Row[];
  orgSlug: string;
  period: string;
  lapsedDays: number;
  lapsedGuests: number;
  previous: PreviousPeriod | null;
}) {
  const [on, setOn] = useState<Set<ColumnKey>>(new Set(DEFAULT_ON));
  const [picking, setPicking] = useState(false);

  const available = COLUMNS.filter((c) => !c.needsPrevious || previous);
  const shown = available.filter((c) => on.has(c.key));

  const totals = {
    guests: rows.reduce((a, r) => a + r.guests, 0) || 1,
    visits: rows.reduce((a, r) => a + r.visits, 0) || 1,
    spend: rows.reduce((a, r) => a + r.spend, 0) || 1,
  };

  const prevOf = (segment: string) => previous?.rows.find((r) => r.segment === segment) ?? null;

  /** A change is null rather than zero where the previous period had nobody. */
  function change(now: number, before: number | null | undefined): number | null {
    if (before == null || before === 0) return null;
    return now / before - 1;
  }

  function cell(r: Row, key: ColumnKey) {
    const prev = prevOf(r.segment);
    switch (key) {
      case "people":
        return { v: count(r.guests), strong: true };
      case "peopleShare":
        return { v: pct(r.guests / totals.guests, 1) };
      case "visits":
        return { v: count(r.visits) };
      case "visitShare":
        return { v: pct(r.visits / totals.visits, 1) };
      case "spend":
        return { v: money(r.spend) };
      case "spendShare":
        return { v: pct(r.spend / totals.spend, 1) };
      case "perHead":
        return { v: money(r.spend / Math.max(r.guests, 1)), strong: true };
      case "peopleChange":
        return changeCell(change(r.guests, prev?.guests));
      case "perHeadChange":
        return changeCell(
          change(
            r.spend / Math.max(r.guests, 1),
            prev ? prev.spend / Math.max(prev.guests, 1) : null,
          ),
        );
    }
  }

  function changeCell(c: number | null) {
    if (c === null) return { v: "—", muted: true };
    return { v: delta(c, 1), tone: c >= 0 ? "var(--good)" : "var(--loss)" };
  }

  const ladder = segmentLadder(lapsedDays);

  return (
    <div className="flex flex-col gap-4">
      {/* ── the column picker ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">
          {shown.length} of {available.length} columns shown
          {previous && (
            <>
              {" "}· previous period is <strong className="text-ink-secondary">{previous.label}</strong>
            </>
          )}
        </p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-secondary hover:bg-surface-hover"
          >
            Columns
            <IconChevron className={`h-3.5 w-3.5 transition-transform ${picking ? "rotate-180" : ""}`} />
          </button>
          {picking && (
            <div className="absolute right-0 z-20 mt-1 w-[280px] rounded-lg border border-line-strong bg-surface-raised p-2 shadow-lg">
              {available.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-surface-hover"
                >
                  <input
                    type="checkbox"
                    checked={on.has(c.key)}
                    onChange={() =>
                      setOn((s) => {
                        const next = new Set(s);
                        if (next.has(c.key)) next.delete(c.key);
                        else next.add(c.key);
                        return next;
                      })
                    }
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <span className="font-medium text-ink">{c.label}</span>
                    <span className="mt-0.5 block leading-relaxed text-ink-muted">{c.note}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
              <th className="py-2 pr-3 text-left font-medium">Segment</th>
              {shown.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.segment} className="border-b border-line last:border-b-0 hover:bg-surface-hover">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: SEGMENT_COLOUR[r.segment] }}
                    />
                    {SEGMENT_LABEL[r.segment]}
                  </span>
                </th>
                {shown.map((c) => {
                  const { v, strong, tone, muted } = cell(r, c.key) as {
                    v: string; strong?: boolean; tone?: string; muted?: boolean;
                  };
                  return (
                    <td
                      key={c.key}
                      className={`tnum px-2 py-2 text-right whitespace-nowrap ${
                        strong ? "font-medium text-ink" : muted ? "text-ink-muted" : "text-ink-secondary"
                      }`}
                      style={tone ? { color: tone } : undefined}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="py-2 pl-2 text-right">
                  <Link
                    href={`/${orgSlug}/${period}/guests?tier=member&segment=${r.segment}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium whitespace-nowrap text-accent hover:underline"
                  >
                    Open <IconArrow className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previous && (
        <p className="max-w-[95ch] text-[12px] leading-relaxed text-ink-muted">
          <strong className="text-ink-secondary">
            The previous period is not last quarter, and the comparison says so.
          </strong>{" "}
          It is {previous.label} — the most recent earlier run of months whose card capture this build will
          read, which ends {previous.gapMonths} months before this window opens. The months in between are
          not absent from the chart; they are absent from the snapshot, because card capture failed in them
          and a figure drawn across that gap would be measuring the outage. A segment somebody moved into
          during those months arrives here looking like a change that happened over one period.
        </p>
      )}

      {/* ── §4.5 the boundary rules, behind a button ────────────────────────
          These used to sit open beneath the table as a numbered list plus a
          paragraph — roughly 150 words of definition under a six-row table,
          every time anybody loaded the page. It is reference material: read
          once, argued with once, and then never needed again by the same
          person. What it is *not* is a caveat, so it is allowed to fold. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-sunken px-4 py-2.5">
        <span className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
          Where the boundaries fall
        </span>
        <InfoButton label="How the lifecycle segments are defined">
          <strong className="block text-[12px] text-ink">Read top to bottom, first match wins.</strong>
          <ol className="mt-1.5 flex flex-col gap-1">
            {ladder.map((l, i) => (
              <li key={l.key} className="flex gap-1.5">
                <span className="tnum shrink-0 text-ink-muted">{i + 1}.</span>
                <span>
                  <strong className="text-ink" style={{ color: SEGMENT_COLOUR[l.key] }}>
                    {SEGMENT_LABEL[l.key]}
                  </strong>{" "}
                  — {l.rule}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2">
            The rules overlap on purpose and the order settles it — at this merchant every one of the{" "}
            {count(lapsedGuests)} Lapsed people has exactly one visit, so without the ordering they would be
            Seen once as well.
          </p>
          <p className="mt-1.5">
            An inferred verdict needs <strong className="text-ink">three visits</strong>: with two you have
            exactly one gap, and a broken habit is not estimable from one observation. Slipping and Regulars
            are measured against <strong className="text-ink">each guest&apos;s own cadence</strong>, never a
            rule applied to everybody.
          </p>
          <p className="mt-1.5">
            Only enrolled people are classified. A card cannot be told apart from a card that was reissued,
            so a lifecycle verdict on one would be a guess — the field is empty at source rather than hidden
            here.
          </p>
        </InfoButton>
        <span className="text-[12px] text-ink-muted">
          six segments, first match wins — {SEGMENT_LABEL.regular} is ten or more visits and still inside
          their own usual gap
        </span>
      </div>
    </div>
  );
}

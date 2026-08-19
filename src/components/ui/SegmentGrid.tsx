"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrow, IconChevron } from "@/components/shell/Icons";
import { TIER_LABEL } from "@/lib/lexicon";
import { useTier, type Tier } from "@/lib/use-tier";
import {
  SEGMENT_COLOUR, count, delta, money, pct, SEGMENT_LABEL, type VisitBandRow,
} from "@/lib/metrics";

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
 *
 * ── The tier control lives in the filter bar, not here (OV-3) ──────────────
 *
 * This grid used to own a local `TIER: Members / Cards / All` control, and the
 * filter bar upstairs owned `Customers: All / Members / Recognised`. **Two
 * controls for the same concept on one screen, and nothing said which won.**
 * The same defect was raised against the old Group control in the 17 August
 * review; it had simply moved to a new place.
 *
 * It was worse than a duplicate. Overview discarded its `searchParams`
 * entirely, so the *global* control — the one in the bar, the one that looks
 * authoritative, the one every other report obeys — did nothing at all on this
 * page, while the local one worked. A reader who set Customers to Members and
 * saw the grid not move had been told something false about the product.
 *
 * So there is now one control, in the bar, and this grid reads it from the URL.
 * The rows, the subtitle, the denominators and the drill-through links all
 * follow it. `Rows: Lifecycle / Visits` stays local, and correctly so: it is
 * not a population filter, it is a choice of axis over whatever population the
 * bar has selected.
 *
 * ── Why the tier changes what the rows can be ──────────────────────────────
 *
 * Cards are the bigger half of this business — 19,940 people and $1.3m against
 * 4,966 and $795k — and until now the grid could not show them at all. It still
 * cannot show them **by lifecycle**: `segment` is null at source for anyone not
 * enrolled, because a reissued card is indistinguishable from a customer who
 * stopped coming. That rule is not worked around here.
 *
 * So switching to Cards or All switches the rows to **visit bands**, which both
 * tiers genuinely carry and which is most of what the lifecycle was measuring
 * anyway. Lifecycle stays selectable on Members, and is disabled with its reason
 * elsewhere — the same pattern the filter bar already uses when tier is set to
 * card. The default is unchanged: Members, by lifecycle.
 *
 * What this exposes is worth the control on its own. At Meat Flour Wine the
 * card tier out-earns members 2.2x per head, the exact inverse of Coffee Guru,
 * and a members-only grid could not show it.
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
  /** Months missing between the two runs. Zero means a true previous period. */
  gapMonths: number;
  rows: Row[];
};

type Group = "lifecycle" | "visits";

type ColumnKey =
  | "people" | "peopleShare" | "visits" | "visitShare"
  | "spend" | "spendShare" | "perHead" | "peopleChange" | "perHeadChange";

const COLUMNS: { key: ColumnKey; label: string; needsPrevious?: boolean; note: string }[] = [
  { key: "people", label: "People", note: "People in this row. The denominator of every per-head figure beside it." },
  { key: "peopleShare", label: "Share of people", note: "This row as a share of the people in the selected tier." },
  { key: "visits", label: "Visits", note: "Visits by this row. A visit is a day at a venue, not a transaction." },
  { key: "visitShare", label: "Share of visits", note: "This row as a share of visits in the selected tier." },
  { key: "spend", label: "Spend", note: "Total trade from this row inside the window." },
  { key: "spendShare", label: "Share of spend", note: "This row as a share of spend in the selected tier. Read against share of people — the gap is the finding." },
  { key: "perHead", label: "Per head", note: "Spend divided by the people count on the same row, over the window. Not annualised." },
  { key: "peopleChange", label: "People vs previous", needsPrevious: true, note: "Change in the number of people against the previous comparable period. Lifecycle rows only — the previous period is held per segment, not per visit band." },
  { key: "perHeadChange", label: "Per head vs previous", needsPrevious: true, note: "Change in spend per head against the previous comparable period. Both periods are the same length, so this is not a rate artefact. Lifecycle rows only." },
];

const DEFAULT_ON: ColumnKey[] = ["people", "peopleShare", "spend", "spendShare", "perHead"];

export function SegmentGrid({
  lifecycleRows, visitRows, excludedCards, orgSlug, period, previous,
}: {
  /**
   * Lifecycle rows per tier.
   *
   * Empty for a tier the snapshot cannot classify. Card verdicts arrived with a
   * change to the extract, so a snapshot taken before it carries none and the
   * control says so rather than offering an option that renders nothing.
   */
  lifecycleRows: Record<Tier, Row[]>;
  /** Visit-band rows per tier — the axis both tiers can be compared on. */
  visitRows: Record<Tier, VisitBandRow[]>;
  /** One-visit cards, excluded from the card tier and therefore stated. */
  excludedCards: { people: number; spend: number };
  orgSlug: string;
  period: string;
  previous: PreviousPeriod | null;
}) {
  const [on, setOn] = useState<Set<ColumnKey>>(new Set(DEFAULT_ON));
  const [picking, setPicking] = useState(false);
  const [group, setGroup] = useState<Group>("lifecycle");

  /**
   * The tier comes from the URL, which is where the filter bar writes it.
   * Shared with the composition bars below through `useTier`, so the two
   * cannot end up describing different populations under one heading.
   */
  const [tier, setTier] = useTier();

  // Lifecycle is offered where the snapshot can actually express it. It is not
  // a tier rule any more — the classifier runs on cards too — but an older
  // snapshot carries no card verdicts, so the control falls back and states why
  // rather than offering an option that renders an empty table.
  const rows = lifecycleRows[tier];
  const canLifecycle = rows.length > 0;
  const effectiveGroup: Group = canLifecycle ? group : "visits";
  const body: (Row | VisitBandRow)[] = effectiveGroup === "lifecycle" ? rows : visitRows[tier];

  // The previous period is held per lifecycle segment, so those two columns are
  // unavailable on a visit-band view rather than silently reading "—".
  const available = COLUMNS.filter(
    (c) => !c.needsPrevious || (previous !== null && effectiveGroup === "lifecycle"),
  );
  const shown = available.filter((c) => on.has(c.key));

  const totals = {
    guests: body.reduce((a, r) => a + r.guests, 0) || 1,
    visits: body.reduce((a, r) => a + r.visits, 0) || 1,
    spend: body.reduce((a, r) => a + r.spend, 0) || 1,
  };

  const prevOf = (segment: string) => previous?.rows.find((r) => r.segment === segment) ?? null;

  /** A change is null rather than zero where the previous period had nobody. */
  function change(now: number, before: number | null | undefined): number | null {
    if (before == null || before === 0) return null;
    return now / before - 1;
  }

  function cell(r: Row | VisitBandRow, key: ColumnKey) {
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

  /** Where a row sends the reader, on whichever axis is showing. */
  function drillTo(r: Row | VisitBandRow): string {
    const q = new URLSearchParams();
    if (effectiveGroup === "lifecycle") {
      // The tier was hardcoded to member here, from when lifecycle was the
      // member tier by definition. It is not any more, and a Cards row linking
      // to `tier=member&segment=regular` sends the reader to a different
      // population than the one they clicked — the exact drill-through lie this
      // grid exists to avoid.
      if (tier !== "all") q.set("tier", tier);
      q.set("segment", r.segment);
    } else {
      // "All" is the absence of a tier filter, not a third value the grid
      // understands — the guest grid has no such option and inventing one in a
      // link would produce a URL that silently drops it.
      if (tier !== "all") q.set("tier", tier);
      q.set("minVisits", String((r as VisitBandRow).band));
    }
    return `/${orgSlug}/${period}/guests?${q.toString()}`;
  }

  /** Which of the three reading notes apply. Decided once, read once. */
  const hasPrevNote = !!previous && effectiveGroup === "lifecycle";
  const hasCardNote = tier !== "member" && effectiveGroup === "lifecycle";
  const hasExcludedNote = tier !== "member" && excludedCards.people > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── what the rows can be, and which population they are drawn on ─────
          There is no tier control here any more. It is the `Customers` control
          in the filter bar, which this grid now reads and writes — one control
          for one concept, on a screen that used to carry two.

          What stays is the statement of which population is showing, because
          removing the control must not remove the answer: a reader looking at
          this table has to be able to see what it covers without scrolling back
          up to the bar to check. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 text-[12px] text-ink-secondary">
          <span className="tracking-wide uppercase">Showing</span>
          <span className="rounded-md border border-line bg-surface-sunken px-2 py-1 font-medium text-ink">
            {TIER_LABEL[tier]}
          </span>
          <span className="text-ink-muted">
            — set by <strong className="font-medium text-ink-secondary">Customers</strong> in the filter bar
          </span>
          {tier !== "all" && (
            <button
              type="button"
              onClick={() => setTier("all")}
              className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-surface-hover"
            >
              show all
            </button>
          )}
        </span>
        <Segmented
          legend="Rows"
          value={effectiveGroup}
          options={[
            { key: "lifecycle" as Group, label: "Lifecycle", disabled: !canLifecycle },
            { key: "visits" as Group, label: "Visits" },
          ]}
          onChange={(g) => setGroup(g)}
        />
        {!canLifecycle && (
          <span className="text-[12px] text-ink-muted">
            This snapshot carries no lifecycle verdict for{" "}
            {tier === "card" ? "recognised guests" : "this population"} — the classifier now runs on both
            identity methods, and the figures arrive on the next extract.
          </span>
        )}
      </div>

      <p className="text-[13px] text-ink-secondary">
        <strong className="tnum text-ink">{count(totals.guests)}</strong>{" "}
        {tier === "member"
          ? "enrolled people"
          : tier === "card"
            ? "people recognised by payment card and never enrolled"
            : "people, enrolled and recognised together"}
        {effectiveGroup === "lifecycle"
          ? ", classified against their own visit cadence."
          : ", grouped by how many times they came."}{" "}
        <span className="text-ink-muted">
          {money(totals.spend)} between them · every row opens the people behind it.
        </span>
      </p>

      {/* ── the column picker ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">
          {shown.length} of {available.length} columns shown
          {previous && effectiveGroup === "lifecycle" && (
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
              <th className="py-2 pr-3 text-left font-medium">
                {effectiveGroup === "lifecycle" ? "Segment" : "Visits"}
              </th>
              {shown.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {body.map((r) => (
              <tr key={r.segment} className="border-b border-line last:border-b-0 hover:bg-surface-hover">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    {effectiveGroup === "lifecycle" ? (
                      <>
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ background: SEGMENT_COLOUR[r.segment] }}
                        />
                        {SEGMENT_LABEL[r.segment]}
                      </>
                    ) : (
                      /* No swatch. The segment colours mean lifecycle, and
                         reusing them on a visit band would say Regulars about a
                         row that is a visit count. */
                      (r as VisitBandRow).label
                    )}
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
                    href={drillTo(r)}
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

      {/* ── one note, not three ──────────────────────────────────────────────
          This was three stacked paragraphs under the table — the previous period
          not being last quarter, reissued cards faking a lapse, and single-visit
          cards being excluded — and all three were correct. Read together they
          were a wall, and a wall under a table is read by nobody, which made
          three real caveats functionally invisible.

          **The facts stay and the working moves.** Each clause below changes
          what a row in this table means, which is the test for staying on the
          face. Why, in each case, is in "Explain segments" — which is where a
          reader looking at these rows already is. */}
      {(hasPrevNote || hasCardNote || hasExcludedNote) && (
        <p className="max-w-[95ch] text-[12px] leading-relaxed text-ink-muted">
          <strong className="text-ink-secondary">Reading these rows.</strong>{" "}
          {hasPrevNote && (
            <>
              The comparison column is {previous!.label}, not last quarter, and {previous!.gapMonths}{" "}
              months are missing between the two.{" "}
            </>
          )}
          {hasCardNote && (
            <>
              Lapsed and Slipping carry real false positives here — a reissued card looks identical to
              somebody who stopped coming — while Regulars and Established can only be understated, so
              those two are a floor.{" "}
            </>
          )}
          {hasExcludedNote && (
            <>
              {count(excludedCards.people)} cards seen exactly once sit outside this view,{" "}
              {money(excludedCards.spend)} between them, because one sighting is a transaction rather
              than a customer.{" "}
            </>
          )}
          <span className="opacity-80">The reasoning behind each is in Explain segments.</span>
        </p>
      )}


      {/* ── §4.5 the boundary rules have moved to the panel header ─────────
          They are now "Explain segments" in this card's header, rendered by
          `SegmentsExplainer` — OV-4, and the first instance of the Task 0
          drawer pattern. They used to sit here at the foot of the table as a
          strip with an info icon, which put a definition below the thing it
          defines and gave this one panel an affordance no other panel had.

          Written once and used on both pages: the same six buckets are the rows
          of two panels on Behaviour, and three copies of a definition is how
          two of them come to be wrong. */}
    </div>
  );
}

/**
 * A small segmented control.
 *
 * A disabled option keeps its slot rather than disappearing, for the same reason
 * a refused figure does: its absence would change how the remaining options
 * read. Somebody who never sees "Lifecycle" offered for recognised guests concludes
 * the grid cannot do it at all, rather than that this tier cannot.
 */
function Segmented<T extends string>({
  legend, value, options, onChange,
}: {
  legend: string;
  value: T;
  options: { key: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-medium tracking-wide text-ink-muted uppercase">{legend}</span>
      <div role="group" aria-label={legend} className="flex rounded-lg border border-line p-0.5">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={o.disabled}
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
              value === o.key
                ? "bg-accent-soft text-accent"
                : o.disabled
                  ? "cursor-not-allowed text-ink-muted opacity-50"
                  : "text-ink-secondary hover:bg-surface-hover"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { IconChevron, IconAlert } from "../shell/Icons";
import { count, monthLabel } from "@/lib/metrics";
import {
  explainGap, pickerRows, spineOf, type Period, type Periods, type PickerRow,
} from "@/lib/periods";
import { track } from "@/lib/instrument";

/**
 * The period control.
 *
 * ── It offers everything, and grades rather than filters ───────────────────
 *
 * It used to offer exactly the unbroken runs of trustworthy card months —
 * three at Coffee Guru, one at Meat Flour Wine — and nothing else. An operator
 * asking *"how did April go?"* or *"show me the last twelve months"* had no way
 * to find out whether the answer was **"the product cannot do that"** or
 * **"your payment feed was down for eight months"**. Those are different
 * sentences with different owners, and only one of them is actionable.
 *
 * So every window a reasonable person might ask for is listed, and each one
 * either resolves or names the months that stopped it. That is the same
 * argument the old gap list made, widened from "the stretches between runs" to
 * "anything you might ask for" — and it is still the reason this is not a free
 * date picker. A calendar with half the days greyed out says *the product is
 * limited*. This says *these nine months are yours, these fifteen failed, here
 * is which and here is who owns it.*
 *
 * ── Two columns, because there are two clocks ──────────────────────────────
 *
 * The left column is the card tier: people recognised by payment reference,
 * bounded by card-capture grading, and at Coffee Guru that ceiling is three
 * months no matter what anyone builds.
 *
 * The right column is the loyalty scan, which never failed and reaches back
 * twenty-one months. **It is not a longer version of the left column.** A
 * member window joins no payments at all, so it sees scanned trade only — a
 * member who paid but did not scan is invisible in it, where the card spine
 * would have recovered them. The population is smaller and different, the two
 * must never be added together, and the column says so rather than leaving a
 * reader to discover it by comparing two numbers that should have matched.
 */
export function PeriodPicker({
  all, current, orgSlug,
}: {
  all: Periods;
  current: Period;
  orgSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // The surface the operator is on, so switching period keeps them there rather
  // than dropping them back on Overview.
  const surface = pathname.split("/").filter(Boolean).slice(2).join("/") || "overview";

  const go = (id: string) => {
    track("scope.change", surface, "period");
    setOpen(false);
    router.push(`/${orgSlug}/${id}/${surface}`);
  };

  const label = (p: Period) =>
    p.label ?? `${monthLabel(p.start)} – ${monthLabel(p.end)}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] hover:bg-surface-hover"
      >
        <span className="text-ink-muted">Period</span>
        <span className="tnum font-medium text-ink">{label(current)}</span>
        <span className="text-ink-muted">· {current.months}m</span>
        {/* Which clock, on the closed control. A screenshot of a member window
            that does not say so is a screenshot of a smaller population than the
            reader will assume. */}
        {spineOf(current) === "member" && (
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
            members
          </span>
        )}
        <IconChevron className="h-4 w-4 text-ink-muted" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <PeriodMenu all={all} current={current.id} onPick={go} />
        </>
      )}
    </div>
  );
}

/**
 * The open panel, with no router and no state of its own.
 *
 * Split out from the control because a menu that can only exist inside a
 * `useState` and a `useRouter` cannot be rendered anywhere it can be looked at
 * — and this one has four groups, two failure modes per row and a whole second
 * column, which is more surface than anybody should review by clicking.
 */
export function PeriodMenu({
  all, current, onPick,
}: {
  all: Periods;
  current: string;
  onPick: (id: string) => void;
}) {
  const groups = pickerRows(all);
  const column = (keys: string[]) => groups.filter((g) => keys.includes(g.group));
  const cardGroups = column(["run", "rolling", "month"]);
  const memberGroups = column(["member"]);
  const rows = groups.flatMap((g) => g.rows);
  const selectable = rows.filter((r) => r.selectable).length;

  return (
    <div className="absolute left-0 z-30 mt-1.5 w-[740px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface-raised shadow-lg">
            {/* One scroll area rather than one per column: two independently
                scrolling halves put the reason for a refusal and the refusal
                itself at different heights, which is the one pairing this panel
                exists to keep together. */}
            <div className="grid max-h-[64vh] gap-0 overflow-y-auto sm:grid-cols-[1.25fr_1fr]">
              {/* ── the card tier ───────────────────────────────────────── */}
              <div className="p-1.5">
                <ColumnHead
                  title="Everyone who paid"
                  sub="Recognised by payment card. Bounded by card-capture grading."
                />
                {cardGroups.map((g) => (
                  <Group key={g.group} group={g} current={current} onPick={onPick} />
                ))}
              </div>

              {/* ── the scan tier ───────────────────────────────────────── */}
              <div className="border-line p-1.5 sm:border-l">
                <ColumnHead
                  title="Members only"
                  sub="Recognised by loyalty scan, which never failed. Reaches back further."
                />
                {memberGroups.map((g) => (
                  <Group key={g.group} group={g} current={current} onPick={onPick} showTitle={false} />
                ))}

                {/* The cost of the longer reach, stated where the longer reach
                    is offered rather than in a footnote somewhere else. */}
                <p className="mt-2 rounded-lg bg-surface-sunken px-2.5 py-2 text-[12px] leading-relaxed text-ink-secondary">
                  <strong className="text-ink">These see scanned trade only.</strong> A member who
                  paid but did not scan is not recognised in them, where a card window would have
                  found them through the card. The population is smaller and different —{" "}
                  <strong className="text-ink">never add a member window to a card one.</strong>
                </p>

                {all.gaps.length > 0 && (
                  <>
                    <GroupHead>Why the rest is missing</GroupHead>
                    <p className="px-2.5 pb-1.5 text-[12px] leading-relaxed text-ink-muted">
                      Of {all.monthsTested} complete months tested, {all.monthsUsable} passed the
                      card-capture grading.
                    </p>
                    <ul className="px-1">
                      {all.gaps.map((g) => {
                        const e = explainGap(g.reason);
                        const platform = e.who.startsWith("Platform");
                        return (
                          <li key={`${g.start}-${g.reason}`} className="rounded-lg px-1.5 py-1.5">
                            <p className="flex items-baseline gap-2 text-[13px]">
                              <span style={{ color: platform ? "var(--warning)" : "var(--ink-muted)" }}>
                                <IconAlert className="h-3.5 w-3.5" />
                              </span>
                              <span className="font-medium text-ink">
                                {g.months === 1
                                  ? monthLabel(g.start)
                                  : `${monthLabel(g.start)} – ${monthLabel(g.end)}`}
                              </span>
                              <span className="text-[12px] text-ink-muted">
                                {count(g.months)} month{g.months === 1 ? "" : "s"}
                              </span>
                            </p>
                            <p className="mt-0.5 pl-[22px] text-[12px] leading-relaxed text-ink-secondary">
                              {e.what}
                            </p>
                            <p className="pl-[22px] text-[12px] text-ink-muted">{e.who}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <p className="border-t border-line px-3 py-2 text-[12px] text-ink-muted">
              {selectable} of {rows.length} windows can be reported on. The rest are listed with the
              months that stopped them, because &quot;your feed was down&quot; and &quot;the product
              cannot&quot; are different problems with different owners.
            </p>
          </div>
  );
}

/**
 * One group of windows, with its refusals handled in the two ways they differ.
 *
 * **A window that failed grading** keeps its reason inline, because there the
 * refusal *is* the answer to the question the row asks — "can I have the last
 * twelve months?" — no, and here is which months stopped it.
 *
 * **A window that passed but has not been built** says so once for the whole
 * group. It is the same fact about every such row, it is temporary, and printing
 * it twelve times buries the nine month names a reader came to find.
 *
 * The month group additionally collapses its *failures* to a count, because
 * twenty-four rows with three repeated reasons is a wall — and their full
 * explanation is already opposite, where the gap list says what each one means
 * and who owns it.
 */
function Group({
  group, current, onPick, showTitle = true,
}: {
  group: { group: string; title: string; rows: PickerRow[] };
  current: string;
  onPick: (id: string) => void;
  showTitle?: boolean;
}) {
  const collapse = group.group === "month";
  const shown = collapse ? group.rows.filter((r) => r.gradable) : group.rows;
  const failed = group.rows.length - shown.length;
  const pending = shown.filter((r) => r.unavailable === "not-extracted").length;

  return (
    <section>
      {showTitle && <GroupHead>{group.title}</GroupHead>}
      {shown.map((r) => (
        <Row key={r.id} row={r} current={current} onPick={onPick} />
      ))}
      {collapse && shown.length === 0 && (
        <p className="px-2.5 py-1.5 text-[12px] leading-snug text-ink-muted">
          No single month passed grading on its own.
        </p>
      )}
      {collapse && failed > 0 && (
        <p className="px-2.5 py-1.5 text-[12px] leading-snug text-ink-muted">
          {failed} other month{failed === 1 ? "" : "s"} did not pass card-capture grading — the
          reasons are listed opposite.
        </p>
      )}
      {pending > 0 && (
        <p className="mt-1 rounded-lg bg-surface-sunken px-2.5 py-1.5 text-[12px] leading-snug text-ink-secondary">
          {pending === shown.length ? (pending === 1 ? "This one is" : "These are") : `${pending} of these are`}{" "}
          answerable and will open at the next data refresh.
        </p>
      )}
    </section>
  );
}


function ColumnHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-2.5 pt-2 pb-1">
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      <p className="text-[12px] leading-snug text-ink-muted">{sub}</p>
    </div>
  );
}

function GroupHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 border-t border-line px-2.5 pt-2 pb-1 text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
      {children}
    </p>
  );
}

/**
 * One window. Either a button that goes somewhere, or a statement of why not.
 *
 * The unavailable rows are **not disabled buttons**. A disabled control invites
 * a reader to click it and learn nothing; these carry their reason as visible
 * text, which is the same rule every refusal in this build follows — the
 * sentence goes where the figure would have been.
 */
function Row({
  row, current, onPick,
}: {
  row: PickerRow;
  current: string;
  onPick: (id: string) => void;
}) {
  const isCurrent = row.id === current;
  const aliases = row.aliases.length ? ` · ${row.aliases.join(", ")}` : "";

  if (!row.selectable) {
    // Several months failing for several reasons collapses to the distinct
    // reasons, capped: twelve rows saying "no card capture" is not more
    // informative than one, and a reason list long enough to wrap buries the
    // month that failed differently.
    const reasons = [...new Set(row.failing.map((f) => f.reason))];
    const shown = reasons.slice(0, 2).join(", ");
    const more = reasons.length > 2 ? `, and ${reasons.length - 2} more` : "";
    // A window awaiting a build carries no per-row sentence. Twelve rows each
    // saying "awaiting the next data refresh" is one fact printed twelve times;
    // the group says it once, and the rows keep their names.
    const pending = row.unavailable === "not-extracted";
    const detail = pending
      ? null
      : row.months === 1
        ? reasons[0]
        : `${row.failing.length} of ${row.months} months failed · ${shown}${more}`;

    return (
      <div className="rounded-lg px-2.5 py-1.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-ink-muted">{row.label}</span>
          <span className="shrink-0 text-[12px] text-ink-muted">{row.months}m</span>
        </div>
        {detail && <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{detail}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPick(row.id)}
      aria-current={isCurrent ? "true" : undefined}
      className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-hover ${
        isCurrent ? "bg-accent-soft" : ""
      }`}
    >
      <span className={isCurrent ? "font-semibold text-accent" : "text-ink"}>
        {row.label}
        {aliases && <span className="text-[12px] font-normal text-ink-muted">{aliases}</span>}
      </span>
      <span className="shrink-0 text-[12px] text-ink-muted">
        {row.months}m{row.claim === "none" ? "" : ` · ${row.claim}`}
      </span>
    </button>
  );
}

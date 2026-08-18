"use client";

import { useState } from "react";
import { IconX } from "@/components/shell/Icons";
import { EmptyState, Pill } from "@/components/ui/Primitives";
import { GuestBasket } from "@/components/ui/GuestBasket";
import { DayMatrix, type MatrixCell } from "@/components/charts/DayMatrix";
import { WEEKDAYS } from "@/lib/weekdays";
import { BAND_LABEL, CARD_NOTE, mask } from "./GuestGrid";
import {
  SEGMENT_LABEL, count, dayLabel, money, overdueRatio, pct, placeVisit, plural, recency,
  rhythmShift, visitWeeks,
} from "@/lib/metrics";
import type { Guest, Items, Org } from "@/lib/types";

type Tab = "who" | "noticed" | "behave";

/**
 * The guest drawer. §7.2 and §7.3.
 *
 * ── The tabs are named as answers, not as objects ──────────────────────────
 *
 * Stats / Commentary / Visits became **Who they are / What we noticed / When and
 * where they visit**, so the drawer reads as a person rather than as a record.
 * The URL keys moved with the names: a link carrying `tab=stats` after the tab
 * stopped being called Stats is a small lie that outlives everybody who knew
 * about it.
 *
 * The third tab was "How they behave", which was one label over two different
 * questions — *when* somebody comes and *where* they go — presented as one
 * undifferentiated scroll. The label now names both, and each has its own
 * heading below.
 */
export function GuestDrawer({
  guest: g, org, items, unmasked, crossVenueShare, tab, onTab, onClose, onPrev, onNext,
}: {
  guest: Guest;
  org: Org;
  items: Items | null;
  unmasked: boolean;
  crossVenueShare: number;
  tab: Tab;
  onTab: (t: Tab) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1 bg-black/25" />
      <aside className="flex w-[520px] max-w-full flex-col overflow-y-auto border-l border-line bg-surface-raised">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-semibold text-ink">
                {g.tier === "member" && g.name ? (
                  unmasked ? g.name : mask(g.name)
                ) : (
                  <>
                    <span className="text-ink-secondary">Card </span>
                    <code>·{g.id.slice(0, 4).toUpperCase()}</code>
                  </>
                )}
              </h2>
              <Pill tone={g.tier === "member" ? "member" : "card"}>
                {g.tier === "member" ? "Member" : "Card"}
              </Pill>
            </div>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              <code>{g.id}</code> · {g.homeStore}
              {g.segment ? ` · ${SEGMENT_LABEL[g.segment]}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover">
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-line px-3" role="tablist">
          {/* "How they behave" was one tab holding two answers that were never
              distinguished — a heatmap of *when* somebody comes and a bar list
              of *where* they go, stacked with nothing to say they were separate
              questions. The tab now names both, and the content below carries a
              heading for each. Same two visuals, both kept: the heatmap was
              right (weekday down the side, time across) and the venue bars were
              right; what was missing was the sentence saying they answer
              different things. */}
          {([
            ["who", "Who they are"],
            ["noticed", "What we noticed"],
            ["behave", "When and where they visit"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTab(key)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] font-medium ${
                tab === key ? "border-accent text-accent" : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-5 p-5">
          {tab === "who" && <WhoTheyAre g={g} org={org} items={items} />}
          {tab === "noticed" && <WhatWeNoticed g={g} org={org} crossVenueShare={crossVenueShare} />}
          {tab === "behave" && <HowTheyBehave g={g} org={org} />}
        </div>

        <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 border-t border-line bg-surface-raised px-5 py-3">
          <button
            type="button" onClick={onPrev} disabled={!onPrev}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-surface-hover disabled:opacity-40"
          >
            ← Previous
          </button>
          <button
            type="button" onClick={onNext} disabled={!onNext}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-surface-hover disabled:opacity-40"
          >
            Next →
          </button>
        </footer>
      </aside>
    </div>
  );
}

/**
 * §7.2. The fifteen fields, ranked — four shown, the rest disclosed.
 *
 * ── The scan line is not a stat, so it does not sit among them ─────────────
 *
 * *"Scanned 74 of 355 orders"* used to be the fourteenth row of a fifteen-row
 * table. It is not a fact about the guest. **It is the error bar on every number
 * next to it**, and the person reading is about to make a decision on one of
 * those numbers — so it is rewritten as a sentence and moved above everything it
 * qualifies.
 *
 * ── Every tenure and recency field declares its window ─────────────────────
 *
 * "Known for 91 days" and "First seen 1 May" cannot mean what a reader assumes
 * when the window itself opens on 1 May. An owner who knows a customer has come
 * in every weekday for six years, and reads a tenure of weeks, does not conclude
 * the window is short — they conclude the system does not know their business.
 * So these are floored visibly: the figure, then what it is measured from.
 */
function WhoTheyAre({ g, org, items }: { g: Guest; org: Org; items: Items | null }) {
  const [more, setMore] = useState(false);
  // Their first visit sits on the window's opening day, so the true first visit
  // is unknown and everything derived from it is a floor rather than a fact.
  const clipped = g.firstSeen != null && g.firstSeen <= org.window.start;

  const primary: [string, React.ReactNode][] = [
    [org.labels.visits[0].toUpperCase() + org.labels.visits.slice(1), String(g.visits)],
    ["Total spend", money(g.spend)],
    [
      "Usual gap",
      g.cadenceDays && g.visits >= 3 ? plural(Math.round(g.cadenceDays), "day") : "not yet estimable",
    ],
    [
      "Last seen",
      <>
        {dayLabel(g.lastSeen ?? org.window.end)}
        <span className="block text-[11px] font-normal text-ink-muted">
          {recency(g.daysSince, org.window)}
        </span>
      </>,
    ],
  ];

  const rest: [string, React.ReactNode][] = [
    // The visit-to-order ratio was undefined anywhere in the product, and a 3×
    // gap on the flagship record reads as an error rather than as two different
    // units. It is defined here, where both numbers sit.
    [
      "Orders",
      <>
        {count(g.orders)}
        <span className="block text-[11px] font-normal text-ink-muted">
          across {count(g.visits)} {org.labels.visits} — a visit is a day at a venue, an order is a
          transaction, so {(g.orders / Math.max(g.visits, 1)).toFixed(1)} orders a visit
        </span>
      </>,
    ],
    ["Items", String(g.items)],
    ["Average per visit", money(g.spend / Math.max(g.visits, 1))],
    [
      "First seen",
      <>
        {g.firstSeen ? dayLabel(g.firstSeen) : "—"}
        <span className="block text-[11px] font-normal text-ink-muted">
          {clipped
            ? "the first day of the window — they were here before it, and we cannot see how long"
            : `inside the window, which opens ${dayLabel(org.window.start)}`}
        </span>
      </>,
    ],
    [
      "Known for",
      <>
        {clipped ? `at least ${plural(g.tenureDays, "day")}` : plural(g.tenureDays, "day")}
        <span className="block text-[11px] font-normal text-ink-muted">
          measured inside a {org.window.days}-day window, so this is a floor and not a total
        </span>
      </>,
    ],
    ["Venues visited", `${g.venues} of ${org.venues.length}`],
    ["Usual time of day", org.dayparts.find((d) => d.key === g.homeDaypart)?.label ?? "—"],
    ["Value band", `${BAND_LABEL[g.valueBand - 1]} fifth of all spend`],
    [
      "Scanned",
      g.tier === "member"
        ? `${count(g.scannedOrders)} of ${count(g.orders)} orders`
        : "never — recognised by card only",
    ],
  ];

  return (
    <>
      {/* The error bar, above the numbers it qualifies. */}
      {/* ── The scan line, rewritten to say one thing ────────────────────────
          It read "You saw their card on 74 of their 347 orders" while the detail
          row below labelled the same 74 as "Scanned". **Those are different
          events**, and the sentence named the wrong one: 74 is the count of
          orders they *scanned* on, not the count we saw their card on — we saw
          the card on all 347, which is exactly how this build knows about the
          other 273. Written the old way the number contradicts the visit count
          directly beneath it, because visits are derived from card sightings and
          cannot exceed them.

          The second paragraph then said the opposite of the first. One sentence,
          one event, and the floor stated as a floor. */}
      {g.tier === "member" && g.orders > 0 && g.scannedOrders < g.orders && (
        <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--warning)" }}>
          <p className="text-[13px] leading-relaxed text-ink">
            They scanned on <strong>{count(g.scannedOrders)} of {count(g.orders)} orders</strong> (
            {pct(g.scannedOrders / g.orders, 0)}). You still see the other{" "}
            {count(g.orders - g.scannedOrders)} through their card, so{" "}
            <strong>{money(g.spend)} is a floor</strong> — what is missing is only what they paid for
            another way.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            A loyalty CRM would show you {pct(g.scannedOrders / g.orders, 0)} of this person. That gap is
            the whole reason this report is built on the card rather than on the scan.
          </p>
        </div>
      )}
      {g.tier === "card" && (
        <div className="rounded-lg border border-line bg-surface-sunken px-4 py-3">
          <p className="text-[13px] leading-relaxed text-ink">
            This person has <strong>never scanned</strong>. Everything below is what their payment card did,
            and it is a floor: anything they bought with cash or another card is invisible here.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
        {primary.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-medium tracking-wide text-ink-secondary uppercase">{k}</dt>
            <dd className="tnum mt-0.5 text-[17px] leading-tight font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <details open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
        {/* Counted, not asserted. It said "Eleven" and listed ten, which is the
            kind of defect that makes a reader check everything else on the
            screen — and they should. */}
        <summary className="cursor-pointer list-none text-[13px] font-medium text-accent marker:hidden hover:underline">
          {more ? "Fewer details" : `${rest.length} more details`}
        </summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
          {rest.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-secondary">{k}</dt>
              <dd className="tnum text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </details>

      <GuestBasket g={g} items={items} org={org} />
    </>
  );
}

/** §7.2. The two prose notes, unchanged in wording and moved intact. */
function WhatWeNoticed({
  g, org, crossVenueShare,
}: {
  g: Guest;
  org: Org;
  crossVenueShare: number;
}) {
  const overdue = overdueRatio(g);
  const notes: React.ReactNode[] = [];

  if (g.visits === 1) {
    notes.push(
      <EmptyState
        key="once"
        title="Seen once"
        body={
          <>
            <p>
              Came in on {g.firstSeen ? dayLabel(g.firstSeen) : "—"}, spent {money(g.spend)}, and has not been
              back in {count(g.daysSince)} days.
            </p>
            <p className="mt-2">
              There is no habit here to be early or late against, so no lifecycle verdict is shown and no
              usual gap is invented. This is the largest single group in the business and the only useful
              question about it is whether a second visit can be caused.
            </p>
          </>
        }
      />,
    );
  }

  if (g.visits === 2) {
    notes.push(
      <Note key="two" title="Two visits, one gap">
        A single observed interval is not enough to say whether a habit has formed or broken, so no verdict
        is shown. A third visit makes them classifiable.
      </Note>,
    );
  }

  if (g.cadenceDays && g.visits >= 3 && overdue !== null && overdue > 1.5) {
    notes.push(
      <Note key="overdue" title="Overdue against their own rhythm" tone="var(--warning)">
        They usually come every {Math.round(g.cadenceDays)} days and it has been {count(g.daysSince)} —{" "}
        <strong>{overdue.toFixed(1)}× their own usual gap</strong>. Measured against this person&apos;s
        cadence over {g.visits} {org.labels.visits}, not against a rule applied to everybody.
      </Note>,
    );
  }

  if (g.tier === "card") {
    notes.push(
      <Note key="card" title="Recognised, not identified">
        {CARD_NOTE} There is <strong>no name, email or phone</strong> — which is why this row carries a
        reference rather than a name, and no lifecycle verdict, because a reissued card looks exactly like a
        customer who stopped coming. What you can do is recognise them at the counter and ask them to join.
        That is the whole enrolment opportunity, one guest at a time.
      </Note>,
    );
  }

  if (g.venues > 1) {
    notes.push(
      <Note key="venues" title="Uses more than one of your venues">
        Visits <strong>{g.venues}</strong> of your {org.venues.length}. Guests who cross venues are{" "}
        {pct(crossVenueShare, 1)} of the countable population here, and they are invisible to a per-venue
        report.
      </Note>,
    );
  }

  return notes.length ? (
    <>{notes}</>
  ) : (
    <EmptyState
      title="Nothing stands out"
      body="No lifecycle flag, no unusual rhythm, no cross-venue pattern. That is a finding rather than an absence — most guests are unremarkable and the ones who are not are worth the attention."
    />
  );
}

function Note({ title, tone, children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-3.5 py-3" style={{ borderColor: tone ?? "var(--line)" }}>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{children}</p>
    </div>
  );
}

/**
 * §7.3. "How they behave" — the day grid that replaces the visit list.
 *
 * ── What was wrong with the list ───────────────────────────────────────────
 *
 * It showed the most recent 60 of 118 visits and said so on the face: *"the
 * timeline is capped; the total above is not."* Honest, and an unfinished screen
 * with good manners.
 *
 * **The grid carries every visit** in roughly the space eight of those rows took,
 * so the confession has nothing left to confess. It shows which weekdays this
 * person owns, whether they vanish at weekends, where they doubled up in a day,
 * and the run of blanks that is the only individual slip signal a 92-day window
 * can honestly give.
 *
 * **It is the same component as the heatmap on Behaviour** — seven rows of
 * weekday against a time axis, one shared scale, blank where nothing happened.
 * Built once, used twice.
 *
 * ── What is deliberately not here ──────────────────────────────────────────
 *
 * A line chart of spend over time. At this cadence, with most guests ordering
 * the same thing most visits, that is noise dressed as a trend — and a
 * continuous axis implies a value existed between the points, when what exists
 * between two visits is nothing at all.
 */
function HowTheyBehave({ g, org }: { g: Guest; org: Org }) {
  const [showList, setShowList] = useState(false);
  const history = g.history ?? [];

  if (!history.length) {
    return (
      <EmptyState
        title="No visit detail"
        body="Baskets and visits are resolved through the same identity spine as everything else, so an order that could not be attributed to a person carries no visit here either."
      />
    );
  }

  const weeks = visitWeeks(org.window);

  /**
   * ── Weekday against daypart, not weekday against calendar week ────────────
   *
   * The calendar version answered "has this person's pattern changed" — the run
   * of blanks. It is a real question and it is **already answered in words**
   * directly above the grid, by the rhythm sentence, which computes first half
   * against second half and says steady, widening or tightening. A reader does
   * not have to count gaps in a 7×14 grid to get it.
   *
   * What no sentence gives them is *when* — Thursday mornings, or Saturday
   * dinner. That is the shape of the person, it is stable enough over 92 days to
   * be worth drawing, and it is the same pair of axes the estate heatmap uses,
   * so the drawer and the report finally read the same way.
   *
   * The column count also stops depending on the window: fourteen weeks became
   * a horizontal scrollbar inside a 520px drawer, and eight dayparts do not.
   */
  const byDaypart = history.some((h) => h.length > 4 && h[4]! >= 0);

  const cells = new Map<string, MatrixCell>();
  /**
   * Visits, orders and spend per cell, accumulated properly.
   *
   * The order count used to be recovered by parsing it back off the front of
   * the label string — `Number(prev.label.split(" ")[0])` — which worked only
   * for as long as nothing was ever prefixed to that label. The tooltip needed
   * a visit count too, and a second value parsed out of prose is a second thing
   * that silently returns NaN the day the wording changes.
   */
  const tally = new Map<string, { visits: number; orders: number; spend: number }>();
  let max = 0;

  for (const h of history) {
    const [offset, orders, spend] = h;
    const at = placeVisit(offset, org.window, weeks);
    if (!at) continue;
    const dp = h.length > 4 ? h[4]! : -1;
    // A visit whose daypart did not resolve is dropped from a daypart grid
    // rather than pooled into a column it may not belong to. Filling it from
    // `homeDaypart` would put every visit of every guest in one column and call
    // the result a finding.
    if (byDaypart && dp < 0) continue;
    const column = byDaypart ? org.dayparts[dp]?.key : at.weekKey;
    if (!column) continue;

    const key = `${at.dow}|${column}`;
    const t = tally.get(key) ?? { visits: 0, orders: 0, spend: 0 };
    t.visits += 1;
    t.orders += orders;
    t.spend += spend;
    tally.set(key, t);
    max = Math.max(max, t.spend);
    cells.set(key, {
      value: t.spend,
      // The column already carries the daypart and `DayMatrix` prefixes it to
      // this string, so repeating it here reads back as
      // "Pre-Dawn · Monday · 12 orders · $151.20 · Pre-Dawn".
      label:
        `${plural(t.visits, org.labels.visits.replace(/s$/, ""))} · ` +
        `${t.orders} order${t.orders === 1 ? "" : "s"} · ${money(t.spend)}` +
        (byDaypart ? "" : ` · ${dayLabel(at.iso)}`),
    });
  }

  const drawn = [...tally.values()].reduce((a, t) => a + t.orders, 0);

  const rhythm = rhythmShift(history);
  const venuesUsed = [...new Set(history.map((h) => h[3]).filter((i) => i >= 0))];
  const homeShare = history.filter((h) => org.venues[h[3]]?.id === g.homeStoreId).length / history.length;
  const venueSplit = venuesUsed
    .map((index) => ({ index, visits: history.filter((h) => h[3] === index).length }))
    .sort((a, b) => b.visits - a.visits);

  return (
    <>
      {/* Three sentences, not tiles. */}
      <div className="space-y-2 text-[14px] leading-relaxed text-ink">
        <p>
          {rhythm ? (
            <>
              Their gap between visits is <strong>{rhythm.verdict}</strong> — averaging{" "}
              {rhythm.firstHalf.toFixed(1)} days across the first half of the window and{" "}
              {rhythm.secondHalf.toFixed(1)} across the second.
            </>
          ) : (
            <>
              Too few visits to say whether their rhythm is steady, widening or tightening — that needs four,
              and they have {g.visits}.
            </>
          )}
        </p>
        <p>
          {venuesUsed.length === 1 ? (
            <>
              They use <strong>one venue</strong>, {g.homeStore}, and nothing else.
            </>
          ) : (
            <>
              Mostly <strong>{g.homeStore}</strong> — {pct(homeShare, 0)} of their visits — plus{" "}
              {venuesUsed.length - 1} other{venuesUsed.length === 2 ? "" : "s"}.
            </>
          )}
        </p>
        <p>
          Last seen <strong>{dayLabel(g.lastSeen ?? org.window.end)}</strong>,{" "}
          {recency(g.daysSince, org.window)}.
        </p>
      </div>

      {/* ── when ────────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
          When they visit
        </h3>
        <p className="mt-0.5 mb-2 text-[12px] leading-relaxed text-ink-muted">
          {byDaypart ? (
            <>
              Weekday down the side, daypart across, shaded by what they spent — the same two axes the
              trading grid on Behaviour uses, so this person can be read against the business. Each cell
              pools every visit they made in that slot across the {org.window.days} days.
            </>
          ) : (
            <>
              Weekday down the side, calendar week across, one cell per day, shaded by what they spent.{" "}
              <strong className="text-ink-secondary">This snapshot predates the per-visit daypart</strong>,
              so the grid runs on the calendar until the next extract; the daypart is queried and was
              discarded at pack time.
            </>
          )}
        </p>
        <DayMatrix
          columns={
            byDaypart
              ? org.dayparts.map((d) => ({
                  key: d.key,
                  label: d.label,
                  sublabel: `${String(d.from).padStart(2, "0")}–${String(d.to % 24).padStart(2, "0")}`,
                  // A period this person never uses keeps its column and loses
                  // its width, exactly as the estate grid treats a period the
                  // business does not trade in. Dropping it would make one
                  // guest's axis differ from another's and from the report's.
                  narrow: !WEEKDAYS.some((wd) => cells.has(`${wd.dow}|${d.key}`)),
                }))
              : weeks.map((wk) => ({ key: wk.key, label: wk.label }))
          }
          cells={cells}
          max={max}
          hue={g.tier === "member" ? "var(--tier-member)" : "var(--tier-card)"}
          population={
            drawn === g.orders
              ? `all ${count(g.visits)} ${org.labels.visits}, none omitted`
              : `${count(drawn)} of ${count(g.orders)} orders — the rest carry no daypart`
          }
          window={
            byDaypart
              ? `${dayLabel(org.window.start)} – ${dayLabel(org.window.end)} · venue-local · shaded by spend`
              : `${dayLabel(org.window.start)} – ${dayLabel(org.window.end)} · shaded by that day's spend`
          }
          cellSize={26}
          rowLabelWidth={36}
          // The column titles come off here and the tooltip carries the daypart
          // instead. Eight titles across a 520px drawer is most of the width
          // spent on labels the reader needs once.
          showHeader={false}
          compact
        />
      </div>

      {/* ── The venue mix, as text ───────────────────────────────────────────
          This was a thirteen-column strip of coloured blocks with no axis, no
          labels and no numbers, sitting directly beneath a labelled and readable
          grid. It could be looked at and not read: to answer "is this person a
          commuter with a home store and a work store, a rotator, or somebody who
          moved house in June" you had to decode five colours across thirteen
          unlabelled columns, and the answer was one sentence all along.

          So it is one sentence. The grid above already carries the time axis,
          and this carries the venue split, which is a ranking rather than a
          shape — and a ranking of five things is a list. */}
      {venuesUsed.length > 1 && (
        <div>
          <h3 className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
            Where they visit
          </h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
            The split across your sites, longest bar first. This is a ranking rather than a shape, which is
            why it is bars and not a second grid — the time axis is already above.
          </p>
          <table className="mt-1.5 w-full text-[12px]">
            <tbody>
              {venueSplit.map((v) => (
                <tr key={v.index} className="border-b border-line last:border-b-0">
                  <th scope="row" className="w-[140px] py-1.5 pr-3 text-left font-normal text-ink">
                    {org.venues[v.index]?.name ?? "—"}
                    {org.venues[v.index]?.id === g.homeStoreId && (
                      <span className="ml-1.5 text-[10px] text-ink-muted">home</span>
                    )}
                  </th>
                  <td className="py-1.5">
                    <div className="h-2 w-full rounded-sm bg-surface-sunken">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${(v.visits / Math.max(history.length, 1)) * 100}%`,
                          background: g.tier === "member" ? "var(--tier-member)" : "var(--tier-card)",
                        }}
                      />
                    </div>
                  </td>
                  <td className="tnum w-[96px] py-1.5 pl-3 text-right whitespace-nowrap text-ink-secondary">
                    {count(v.visits)} · {pct(v.visits / Math.max(history.length, 1), 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The dated list is not deleted. It stops being the answer and becomes
          the receipt. */}
      <details open={showList} onToggle={(e) => setShowList((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer list-none text-[13px] font-medium text-accent marker:hidden hover:underline">
          {showList ? "Hide the list" : `See all ${count(g.visits)} ${org.labels.visits}`}
        </summary>
        <ol className="mt-3 flex flex-col gap-1.5">
          {[...history]
            .sort((a, b) => b[0] - a[0])
            .map(([offset, orders, spend, venueIdx], i) => {
              const at = placeVisit(offset, org.window, weeks);
              return (
                <li
                  key={`${offset}-${venueIdx}-${i}`}
                  className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[12px] last:border-b-0"
                >
                  <span className="tnum text-ink">{at ? dayLabel(at.iso) : "—"}</span>
                  <span className="text-ink-muted">{org.venues[venueIdx]?.name ?? "—"}</span>
                  <span className="tnum text-ink-secondary">
                    {orders} {orders === 1 ? "order" : "orders"} · {money(spend)}
                  </span>
                </li>
              );
            })}
        </ol>
      </details>
    </>
  );
}


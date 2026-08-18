"use client";

import { SEGMENT_COLOUR, SEGMENT_INK, SEGMENT_LABEL, count, money, pct } from "@/lib/metrics";
import { TIER_LABEL } from "@/lib/lexicon";
import { useTier, type Tier } from "@/lib/use-tier";

/**
 * What replaced the dumbbell, and what the dumbbell replaced.
 *
 * ── The history, because it explains the shape ─────────────────────────────
 *
 * **A log-log scatter and two treemaps went first.** The scatter's own footnote
 * admitted its legend counted occupied pixels rather than people, and it could
 * not draw two of the six segments at all — Slipping and Lapsed are defined on
 * time since the last visit, which was on neither axis. The treemaps re-encoded
 * two columns that were already visible to the dollar in the table beside them,
 * in a geometry that is worse at the job: area is near the bottom of the
 * perceptual ranking and rectangles of different aspect ratios cannot be
 * compared by eye at all.
 *
 * **Then a dumbbell replaced them**, running each segment's bar from its share
 * of visits to its share of revenue. That was right about the finding — the
 * *gap* between two shares is the thing worth acting on — and wrong about two
 * things. It dropped the population entirely, so the reader could see that
 * Regulars take 73% of visits and 68% of spend without ever learning they are
 * 28% of the people, which is the fact that makes the other two interesting.
 * And a bar running left-to-right between two points reads as movement: it
 * invited "72.9% *became* 67.6%", which is not what the data says. These are
 * three separate compositions of the same population, not a flow.
 *
 * ── Three aligned 100% bars ────────────────────────────────────────────────
 *
 * Members → Visits → Spend, each totalling 100%, same colour per segment in
 * each. The question the table answers is *who is in each segment and what are
 * they worth*. The question this answers is different and is the reason it
 * earns the space: **how does each segment's importance change as you move from
 * people, to behaviour, to money?**
 *
 * The comparison happens on position along a shared axis, which is the channel
 * people read accurately, and it happens between bars that are stacked directly
 * above each other so the eye travels vertically rather than across a legend.
 *
 * ── Not a Sankey, deliberately ─────────────────────────────────────────────
 *
 * Members → Visits → Spend is tempting to draw as a flow and it is not one.
 * These are not the same units moving between states: a person is not converted
 * into a visit, and a visit is not converted into a dollar in any sense a
 * ribbon would be honest about. A Sankey would assert causal movement the data
 * does not contain. Three aligned compositions give the comparison without
 * making the claim.
 *
 * ── Bands are exact, and small ones are hairlines ──────────────────────────
 *
 * No minimum band width. A floor would be the honest choice on a heatmap cell,
 * where the question is *did anything happen here* — but these bars total 100%
 * by construction and a floored band would make them total more, which breaks
 * the one promise the chart makes. A segment at 0.1% of visits renders as a
 * hairline, which is what 0.1% looks like. The exact figures are in the grid
 * directly above.
 */

type Row = {
  segment: string;
  label: string;
  guests: number;
  visits: number;
  spend: number;
};

/** The inline percentage only renders where the band can hold it. */
const LABEL_FLOOR = 0.06;

/**
 * ── It follows the same control as the grid above it (OV-3) ────────────────
 *
 * This used to be handed member-tier rows and nothing else, which was correct
 * while the grid was members-only too. It stopped being correct the moment the
 * grid started following the filter bar: the two objects sit inside one card,
 * under one heading, and a reader switching Customers to *All guests* would
 * have seen a 24,906-person table above a 4,966-person chart with nothing
 * saying they were different populations.
 *
 * Two objects in one card that disagree about who they describe is the exact
 * class of defect this build exists to remove, so both read `useTier` and both
 * relabel with it.
 */
export function SegmentComposition({
  rowsByTier, windowLabel,
}: {
  rowsByTier: Record<Tier, Row[]>;
  windowLabel: string;
}) {
  const [tier] = useTier();
  const rows = rowsByTier[tier];

  /** The population noun, so every label below changes with the control. */
  const people =
    tier === "member" ? "enrolled people"
    : tier === "card" ? "recognised people"
    : "identified people";

  // A tier the snapshot cannot classify by lifecycle draws nothing rather than
  // an empty set of bars. The grid above states the reason in place.
  if (!rows || rows.length === 0) return null;

  const totals = {
    guests: rows.reduce((a, r) => a + r.guests, 0) || 1,
    visits: rows.reduce((a, r) => a + r.visits, 0) || 1,
    spend: rows.reduce((a, r) => a + r.spend, 0) || 1,
  };

  const bars = [
    {
      key: "guests" as const,
      label: TIER_LABEL[tier],
      note: `${count(totals.guests)} ${people}`,
    },
    {
      key: "visits" as const,
      label: "Visits",
      note: `${count(totals.visits)} visits`,
    },
    {
      key: "spend" as const,
      label: "Spend",
      note: money(totals.spend),
    },
  ];

  const share = (r: Row, key: "guests" | "visits" | "spend") => r[key] / totals[key];

  // The reading line is computed, never written. It names whichever segment has
  // the largest gap between its share of people and its share of visits, in
  // whichever direction — so it stays true on a merchant whose shape is the
  // opposite of this one's.
  const carrying = [...rows].sort(
    (a, b) => (share(b, "visits") - share(b, "guests")) - (share(a, "visits") - share(a, "guests")),
  );
  const most = carrying[0];
  const least = carrying.at(-1);

  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <h3 className="text-[14px] font-semibold text-ink">
          How this base turns into visits and spend
        </h3>
        <p className="mt-0.5 max-w-[85ch] text-[12px] leading-relaxed text-ink-secondary">
          Each segment&apos;s share of {people}, of visits and of spend, over {windowLabel}. Every
          bar totals 100%. <strong className="text-ink">These are three compositions of the same people,
          not a movement between them</strong> — nobody turns into a visit.
        </p>
      </figcaption>

      <div className="flex flex-col gap-3">
        {bars.map((bar) => (
          <div key={bar.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium text-ink">{bar.label}</span>
              <span className="tnum text-[11px] text-ink-muted">{bar.note}</span>
            </div>
            <div className="flex h-9 w-full overflow-hidden rounded-md">
              {rows.map((r) => {
                const s = share(r, bar.key);
                if (s <= 0) return null;
                return (
                  <div
                    key={r.segment}
                    className="flex items-center justify-center overflow-hidden"
                    style={{
                      width: `${s * 100}%`,
                      background: SEGMENT_COLOUR[r.segment] ?? "var(--ink-muted)",
                      color: SEGMENT_INK[r.segment] ?? "#ffffff",
                    }}
                    title={`${r.label} · ${pct(s, 1)} of ${bar.label.toLowerCase()}`}
                    aria-label={`${r.label}: ${pct(s, 1)} of ${bar.label.toLowerCase()}`}
                  >
                    {s >= LABEL_FLOOR && (
                      <span className="tnum text-[11px] font-medium">{pct(s, 0)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {rows.map((r) => (
          <span key={r.segment} className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ background: SEGMENT_COLOUR[r.segment] ?? "var(--ink-muted)" }}
            />
            {r.label}
          </span>
        ))}
      </figcaption>

      {most && least && most !== least && (
        <p className="mt-2.5 max-w-[85ch] text-[12px] leading-relaxed text-ink-secondary">
          <strong className="text-ink">{most.label}</strong> are {pct(share(most, "guests"), 1)} of your{" "}
          {people} and {pct(share(most, "visits"), 1)} of your visits — they are carrying the
          programme. <strong className="text-ink">{least.label}</strong> are{" "}
          {pct(share(least, "guests"), 1)} of the people and {pct(share(least, "visits"), 1)} of the visits.
          The distance between those two pairs is the shape of the opportunity, and it is the reason a single
          average member is not a useful object.
        </p>
      )}
      <p className="mt-1.5 max-w-[85ch] text-[11px] leading-relaxed text-ink-muted">
        Shares are of {people} — the same denominator as the grid above, and it changes with the same
        control. Bands are drawn to
        exact width with no minimum, so a segment worth a fraction of a percent renders as a hairline rather
        than being inflated to a readable one. Percentages label the bands that can hold them; the rest are
        in the grid.
      </p>
    </figure>
  );
}

export { SEGMENT_LABEL };

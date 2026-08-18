import { EmptyState } from "@/components/ui/Primitives";
import { WEEKDAYS } from "@/lib/weekdays";
import { SEGMENT_COLOUR, SEGMENT_LABEL, count, money, pct } from "@/lib/metrics";
import type { Daypart, SegmentBehaviourRow } from "@/lib/types";

/**
 * §6.6. What each segment buys, and when they come.
 *
 * ── Buckets, not visit counts ──────────────────────────────────────────────
 *
 * The analysis this replaces grouped by raw visit count — one visit, two, three,
 * four, six or more — which is a bucketing the rest of the product does not use
 * and cannot drill into. The lifecycle segments already are that bucketing, done
 * properly: they condition on each guest's own cadence rather than on a bare
 * count, they are the vocabulary every other screen speaks, and every bar here
 * opens the same population the segment grid on Overview opens. Re-deriving a
 * parallel set of buckets would have produced a second, slightly different
 * answer to the same question on an adjacent page, which is the defect this
 * build was commissioned to remove.
 *
 * ── Why these are on the whole population and not the guest working set ────
 *
 * Every number here is available in the guest list the grid already loads, and
 * taking it from there would have been free and wrong. That set is the top of
 * the value distribution in full plus a hash sample of the tail, so its coverage
 * runs from 97% of Regulars down to 53% of Lapsed, and it overstates spend per
 * visit by up to fourteen points on exactly the low-frequency segments. The
 * finding these charts carry is that the most frequent guests have the
 * *smallest* baskets — and the bias inflates the other end of precisely that
 * comparison. So it is measured in the warehouse, on everybody.
 */

type Bucket = {
  segment: string;
  label: string;
  guests: number;
  visits: number;
  spend: number;
  orders: number | null;
  items: number | null;
};

/**
 * Three small multiples: what a visit is worth, what a transaction is worth, and
 * how much is in the bag.
 *
 * They are three panels rather than one grouped chart because the three
 * quantities are in different units and a shared axis would either compress two
 * of them into nothing or imply they are comparable. Each panel has its own
 * scale, and each says so — the comparison the reader is meant to make is
 * *between segments within a panel*, never across panels.
 */
export function SegmentBasket({ rows, windowLabel }: { rows: Bucket[]; windowLabel: string }) {
  const usable = rows.filter((r) => r.visits > 0);
  if (!usable.length) return null;

  const hasOrders = usable.every((r) => r.orders != null && r.orders > 0);
  const hasItems = usable.every((r) => r.items != null);

  const panels = [
    {
      key: "perVisit",
      title: "Spend per visit",
      note: "What one visit is worth. A visit is a day at a venue, not a transaction.",
      value: (r: Bucket) => r.spend / r.visits,
      format: (v: number) => money(v),
      available: true,
    },
    {
      key: "atv",
      title: "Average transaction value",
      note: "What the till sees. Diverges from spend per visit wherever a guest buys more than once a day.",
      value: (r: Bucket) => r.spend / (r.orders ?? 1),
      format: (v: number) => money(v),
      available: hasOrders,
    },
    {
      key: "items",
      title: "Items per visit",
      note: "Items, not people. Party size is recorded too unevenly to publish a per-head figure.",
      value: (r: Bucket) => (r.items ?? 0) / r.visits,
      format: (v: number) => v.toFixed(2),
      available: hasItems,
    },
  ];

  const drawable = panels.filter((p) => p.available);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-6 md:grid-cols-3">
        {drawable.map((p) => {
          const max = Math.max(...usable.map((r) => p.value(r)), 0.01);
          return (
            <figure key={p.key} className="m-0">
              <figcaption className="mb-2">
                <h4 className="text-[13px] font-semibold text-ink">{p.title}</h4>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{p.note}</p>
              </figcaption>
              <table className="w-full text-[12px]">
                <tbody>
                  {usable.map((r) => (
                    <tr key={r.segment} className="border-b border-line last:border-b-0">
                      <th
                        scope="row"
                        className="w-[86px] py-1.5 pr-2 text-left font-normal whitespace-nowrap text-ink"
                      >
                        {r.label}
                      </th>
                      <td className="py-1.5">
                        <div className="h-2.5 w-full rounded-sm bg-surface-sunken">
                          <div
                            className="h-full rounded-sm"
                            style={{
                              width: `${(p.value(r) / max) * 100}%`,
                              background: SEGMENT_COLOUR[r.segment] ?? "var(--ink-muted)",
                            }}
                          />
                        </div>
                      </td>
                      <td className="tnum w-[54px] py-1.5 pl-2 text-right whitespace-nowrap text-ink-secondary">
                        {p.format(p.value(r))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          );
        })}
      </div>

      {!hasOrders && (
        <EmptyState
          tone="warning"
          title="Average transaction value and items per visit are not drawn"
          body={
            <>
              <p>
                Both need order and item counts summed per segment across the whole population, and this
                snapshot predates those columns. They are in the extract now; the panels appear on the next
                refresh.
              </p>
              <p className="mt-2">
                The obvious shortcut — computing them from the guest list this product already ships to the
                browser — is <strong>refused</strong>. That set over-selects high spenders, its coverage runs
                from 97% of Regulars to 53% of Lapsed, and it overstates spend per visit by up to fourteen
                points on the low-frequency segments. The bias runs in the direction of the finding, which is
                the same test that withholds the per-cover comparison on Overview.
              </p>
            </>
          }
        />
      )}

      <p className="max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
        Whole population, {windowLabel}, enrolled people only —{" "}
        {count(usable.reduce((a, r) => a + r.guests, 0))} people across{" "}
        {count(usable.reduce((a, r) => a + r.visits, 0))} visits. Each panel has its own scale, so bars are
        comparable <strong className="text-ink-secondary">down a panel and never across them</strong>.
      </p>
    </div>
  );
}

/**
 * When each segment comes — day of week, and time of day.
 *
 * ── This is customer analysis, which is why it survives when the trading
 *    week did not ─────────────────────────────────────────────────────────
 *
 * A day-of-week by daypart heatmap of *all trade* answers a question about the
 * venue: when is it busy, when should it roster. That is product and operations
 * analysis and it belongs on a sales report, which is why "The trading week"
 * came off this page. The same axes cut *by who the guest is* answer a different
 * question that only this report can answer: **your best customers and your
 * passing trade do not come at the same time**, and any shift you plan around
 * one of them is being planned against the other.
 *
 * ── Shares down a segment, never across ────────────────────────────────────
 *
 * Each row sums to 100% of that segment's own visits. Absolute counts would rank
 * every row by segment size and say nothing but "Regulars visit a lot", which is
 * already on the page three times. The comparison the reader is invited to make
 * is between the *shapes* of two rows.
 */
export function SegmentTiming({
  rows, dayparts, windowLabel,
}: {
  rows: SegmentBehaviourRow[];
  dayparts: readonly Daypart[];
  windowLabel: string;
}) {
  const segments = [...new Set(rows.map((r) => r.segment))].sort(
    (a, b) =>
      rows.filter((r) => r.segment === b).reduce((x, r) => x + r.visits, 0) -
      rows.filter((r) => r.segment === a).reduce((x, r) => x + r.visits, 0),
  );

  // A daypart the business barely trades in is not a finding about a segment.
  const daypartTotals = new Map<string, number>();
  for (const r of rows) daypartTotals.set(r.daypart, (daypartTotals.get(r.daypart) ?? 0) + r.visits);
  const allVisits = [...daypartTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const carrying = dayparts.filter((d) => (daypartTotals.get(d.key) ?? 0) / allVisits >= 0.005);

  const views = [
    {
      key: "dow" as const,
      title: "Which days they come",
      columns: WEEKDAYS.map((d) => ({ key: String(d.dow), label: d.label, long: d.long })),
      bucket: (r: SegmentBehaviourRow) => String(r.dow),
    },
    {
      key: "daypart" as const,
      title: "What time they come",
      columns: carrying.map((d) => ({ key: d.key, label: d.label, long: d.label })),
      bucket: (r: SegmentBehaviourRow) => r.daypart,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {views.map((view) => {
        // share[segment][columnKey] of that segment's own visits.
        const table = segments.map((seg) => {
          const mine = rows.filter((r) => r.segment === seg);
          const total = mine.reduce((a, r) => a + r.visits, 0) || 1;
          const cells = view.columns.map((c) => ({
            key: c.key,
            label: c.label,
            long: c.long,
            visits: mine.filter((r) => view.bucket(r) === c.key).reduce((a, r) => a + r.visits, 0),
          }));
          return { seg, total, cells: cells.map((c) => ({ ...c, share: c.visits / total })) };
        });
        const max = Math.max(...table.flatMap((t) => t.cells.map((c) => c.share)), 0.01);

        return (
          <figure key={view.key} className="m-0">
            <figcaption className="mb-2">
              <h4 className="text-[13px] font-semibold text-ink">{view.title}</h4>
              <p className="mt-0.5 max-w-[95ch] text-[11px] leading-relaxed text-ink-muted">
                Each row is one segment&apos;s own visits, split across the week and totalling 100%. Read
                across a row for that segment&apos;s shape;{" "}
                <strong className="text-ink-secondary">do not read down a column</strong>, because the rows
                are different sizes.
              </p>
            </figcaption>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate text-[11px]" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="w-[92px]" />
                    {view.columns.map((c) => (
                      <th key={c.key} scope="col" className="pb-1 text-center font-medium text-ink-secondary">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.map((row) => (
                    <tr key={row.seg}>
                      <th
                        scope="row"
                        className="pr-2 text-right text-[11px] font-medium whitespace-nowrap text-ink"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ background: SEGMENT_COLOUR[row.seg] }}
                          />
                          {SEGMENT_LABEL[row.seg] ?? row.seg}
                        </span>
                      </th>
                      {row.cells.map((c) => (
                        <td key={c.key} className="p-0">
                          <div
                            className="flex h-7 items-center justify-center rounded-[3px]"
                            style={{
                              background:
                                c.visits === 0
                                  ? "transparent"
                                  : `color-mix(in srgb, ${SEGMENT_COLOUR[row.seg]} ${(0.1 + (c.share / max) * 0.9) * 100}%, transparent)`,
                              border: c.visits === 0 ? "1px dashed var(--line)" : "1px solid transparent",
                            }}
                            title={`${SEGMENT_LABEL[row.seg] ?? row.seg} · ${c.long} · ${pct(c.share, 1)} of their visits (${count(c.visits)})`}
                            aria-label={`${SEGMENT_LABEL[row.seg] ?? row.seg}, ${c.long}: ${pct(c.share, 1)} of their visits`}
                          >
                            <span className="tnum text-[10px] text-ink">{pct(c.share, 0).replace("%", "")}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>
        );
      })}

      <p className="max-w-[100ch] text-[12px] leading-relaxed text-ink-muted">
        Whole population, enrolled people only, {windowLabel}. Both axes are venue-local: day of week and
        daypart come from the localised trading timestamp, never from UTC. Shading is on a single scale
        across both tables, so a segment with a flat week looks flat rather than being normalised into
        looking peaked. Dayparts carrying under 0.5% of visits are not shown — a period the business does
        not trade in is not a fact about a segment.
      </p>
    </div>
  );
}

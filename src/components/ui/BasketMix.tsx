import { count, money, pct } from "@/lib/metrics";
import type { MixRow } from "@/lib/metrics";

/**
 * What members buy that everybody else does not.
 *
 * ── The design follows from what the reader already knows ──────────────────
 *
 * A top-ten of what members buy is the top-ten of what everybody buys, because
 * popular things are popular. The operator knows their best seller. What they
 * cannot see is that members buy wraps at **0.47×** the rate everybody else
 * does, and that is the column this table exists for.
 *
 * So the index is the primary axis and the shares are the evidence beside it,
 * rather than the other way round. Rows sort by index — the two ends are the
 * finding and the middle is the reassurance that most of the menu is the same.
 *
 * A row below the evidence floor keeps its counts and loses its index. A
 * confident 1.2× computed on eleven lines against nine is the sort of figure
 * that moves to 0.8× on a different fortnight, and this product does not
 * publish those.
 */
export function BasketMix({
  rows, minLines, limit = 8,
}: {
  rows: MixRow[];
  minLines: number;
  limit?: number;
}) {
  const measured = rows.filter((r) => r.index != null).sort((a, b) => b.index! - a.index!);
  const suppressed = rows.filter((r) => r.index == null);

  // Both ends, because the finding is the spread. Taking the top N by index
  // alone would show only what members over-index on, and the under-indexed
  // tail is the half that explains the basket gap.
  const show =
    measured.length <= limit
      ? measured
      : [...measured.slice(0, Math.ceil(limit / 2)), ...measured.slice(-Math.floor(limit / 2))];
  const hiddenMiddle = measured.length - show.length;
  const maxIndex = Math.max(...measured.map((r) => r.index!), 1.2);

  return (
    <div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-[12px] tracking-wide text-ink-secondary uppercase">
            <th className="py-2 pr-3 text-left font-medium">Reporting group</th>
            <th className="px-3 py-2 text-right font-medium">Members</th>
            <th className="px-3 py-2 text-right font-medium">Everyone else</th>
            <th className="py-2 pl-3 text-left font-medium">
              Members buy this
              <span className="ml-1 font-normal normal-case text-ink-muted">relative to everyone else</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {show.map((r, i) => {
            const over = r.index! >= 1;
            // The bar runs both ways from a centre line at 1.0, so "buys less
            // of this" reads as less at a glance rather than as a shorter bar
            // that still points the same way.
            const magnitude = Math.min(Math.abs(r.index! - 1) / (maxIndex - 1 || 1), 1);
            const insertGap = hiddenMiddle > 0 && i === Math.ceil(show.length / 2);
            return (
              <tr key={r.key} className={`border-b border-line last:border-b-0 ${insertGap ? "border-t-2 border-t-line-strong" : ""}`}>
                <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                  {r.label}
                  <span className="block text-[11px] font-normal text-ink-muted">
                    {count(r.lines)} lines · {money(r.memberRevenue + r.nonMemberRevenue)}
                  </span>
                </th>
                <td className="tnum px-3 py-2 text-right text-ink-secondary">{pct(r.memberShare, 1)}</td>
                <td className="tnum px-3 py-2 text-right text-ink-secondary">{pct(r.nonMemberShare, 1)}</td>
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <div className="relative h-3 w-[120px] shrink-0 rounded-sm bg-surface-sunken">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                      <span
                        className="absolute inset-y-0 rounded-sm"
                        style={{
                          background: over ? "var(--tier-member)" : "var(--warning)",
                          left: over ? "50%" : `${50 - magnitude * 50}%`,
                          width: `${magnitude * 50}%`,
                        }}
                      />
                    </div>
                    <span
                      className="tnum text-[13px] font-medium"
                      style={{ color: over ? "var(--tier-member)" : "var(--warning)" }}
                    >
                      {r.index!.toFixed(2)}×
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 max-w-[92ch] text-[12px] leading-relaxed text-ink-muted">
        {hiddenMiddle > 0 && (
          <>
            {hiddenMiddle} groups between the two ends sit near 1.0× and are not shown — most of the menu is
            bought in much the same proportion by both, which is the expected result and the reason the ends
            are worth reading.{" "}
          </>
        )}
        Shares are of each side&apos;s own product lines, so a group does not index high merely because
        members buy more overall. {suppressed.length > 0 && (
          <>
            {suppressed.length} group{suppressed.length === 1 ? "" : "s"} carry fewer than {count(minLines)}{" "}
            lines on one side and are shown without an index rather than with a confident one — a ratio
            computed on a handful of lines moves on the next fortnight.{" "}
          </>
        )}
        <strong className="font-medium text-ink-secondary">
          This is association, not effect.
        </strong>{" "}
        People who buy a coffee every morning are the people who enrol. Nothing here says enrolment changed
        anybody&apos;s basket — that claim needs the within-person design the Members screen uses for value.
      </p>
    </div>
  );
}

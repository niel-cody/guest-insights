import { count, dayLabel, money, pct } from "@/lib/metrics";
import type { Guest, Items, Org } from "@/lib/types";

/**
 * What one guest buys, and how fixed the habit is.
 *
 * ── The two figures worth arguing for ──────────────────────────────────────
 *
 * A top-three list is what was asked for and it is the least interesting thing
 * here, because the answer for most guests at a café is a coffee. The figures
 * that say something a name and a spend total do not are:
 *
 * **The same-thing score** — the share of their visits carrying their single
 * most-bought product. Counted per *visit*, not per line: buying two coffees on
 * one morning is one decision. Ninety per cent is a person with an order, not a
 * person with a preference, and that is a different conversation at the
 * counter.
 *
 * **The repertoire** — how many distinct products they have ever bought. Three
 * across thirty visits is a creature of habit; forty is somebody still working
 * out what they like, and the second is the one worth a recommendation.
 *
 * Both are withheld below three visits rather than computed. One visit gives a
 * same-thing score of 100%, which is arithmetically true and describes nothing.
 */
const MIN_VISITS_FOR_HABIT = 3;

export function GuestBasket({ g, items, org }: { g: Guest; items: Items | null; org: Org }) {
  if (!items || !g.top?.length) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-muted">
        No item detail for this guest in this period. Baskets are resolved through the same identity spine as
        everything else, so an order that could not be attributed to a person carries no basket either.
      </p>
    );
  }

  const product = (i: number) => items.products[i];
  const category = (i: number) => items.categories[i];
  const habitual = g.visits >= MIN_VISITS_FOR_HABIT && g.topShare != null;
  const catTotal = (g.cats ?? []).reduce((a, c) => a + c[2], 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
          What they buy
        </h3>
        <table className="mt-2 w-full text-[13px]">
          <tbody>
            {g.top.map(([pi, visitsWith], rank) => {
              const p = product(pi);
              if (!p) return null;
              return (
                <tr key={pi} className="border-b border-line last:border-b-0">
                  <td className="py-2 pr-2 align-top text-[12px] text-ink-muted">{rank + 1}</td>
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                    {p.name}
                    {p.category && (
                      <span className="block text-[11px] font-normal text-ink-muted">{p.category}</span>
                    )}
                  </th>
                  <td className="tnum py-2 text-right text-ink-secondary whitespace-nowrap">
                    {/* Visits rather than units: "on 66 of their 115 visits" is
                        the sentence that answers "is this their usual", and
                        QUANTITY is not a field this build trusts. */}
                    {count(visitsWith)} of {count(g.visits)} {org.labels.visits}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {habitual && (
        <div className="rounded-lg border border-line p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-ink">
              {g.topShare! >= 0.7
                ? "Orders the same thing"
                : g.topShare! >= 0.35
                  ? "Has a usual, but varies it"
                  : "Buys across the menu"}
            </p>
            <span className="tnum text-[15px] font-semibold text-ink">{pct(g.topShare!, 0)}</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(g.topShare! * 100, 100)}%`, background: "var(--tier-member)" }}
            />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            Their most-bought product appears on {pct(g.topShare!, 0)} of their {count(g.visits)}{" "}
            {org.labels.visits}, and they have bought <strong>{count(g.repertoire)}</strong> different
            products in all. Counted per visit, not per line — two coffees on one morning is one decision.
          </p>
        </div>
      )}

      {!habitual && g.visits < MIN_VISITS_FOR_HABIT && (
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Below {MIN_VISITS_FOR_HABIT} {org.labels.visits} no habit score is shown. One visit gives a
          same-thing score of 100%, which is arithmetically true and describes nothing.
        </p>
      )}

      {(g.cats?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
            Where their spend goes
          </h3>
          <table className="mt-2 w-full text-[13px]">
            <tbody>
              {g.cats.map(([ci, visitsWith, spend]) => {
                const c = category(ci);
                if (!c) return null;
                const share = catTotal ? spend / catTotal : 0;
                return (
                  <tr key={ci} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                      {c.name}
                      {c.type && (
                        <span className="block text-[11px] text-ink-muted">{c.type}</span>
                      )}
                    </th>
                    <td className="w-[90px] py-2">
                      <div className="h-2 w-full rounded-sm bg-surface-sunken">
                        <div
                          className="h-full rounded-sm"
                          style={{ width: `${share * 100}%`, background: "var(--tier-card)" }}
                        />
                      </div>
                    </td>
                    <td className="tnum py-2 pl-3 text-right whitespace-nowrap text-ink-secondary">
                      {money(spend)}
                      <span className="ml-1 text-[11px] text-ink-muted">
                        {count(visitsWith)} {org.labels.visits}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-ink-muted">
            Top {g.cats.length} categories by spend, keyed on the category id rather than its name — five
            Coffee Guru names carry more than one id, and grouping on the name merges them.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The visit timeline.
 *
 * Dates come back as an offset in days from the window start, so a date is two
 * characters on the wire instead of ten. The series is capped at the most
 * recent sixty visits and **says so**, beside a total that is never capped —
 * a truncated series that looks complete is the defect this build exists to
 * avoid.
 */
export function GuestHistory({ g, org }: { g: Guest; org: Org }) {
  const history = g.history ?? [];
  if (!history.length) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-muted">
        No visit detail for this guest in this period.
      </p>
    );
  }

  const dayFrom = (offset: number) => {
    const d = new Date(`${org.window.start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const maxSpend = Math.max(...history.map((h) => h[2]), 1);
  const truncated = g.visits > history.length;

  return (
    <div>
      {truncated && (
        <p className="mb-3 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-secondary">
          Showing their most recent <strong>{count(history.length)}</strong> {org.labels.visits} of{" "}
          <strong>{count(g.visits)}</strong>. The timeline is capped; the total above is not.
        </p>
      )}
      <ol className="relative">
        {history.map(([offset, orders, spend, venueIdx], i) => {
          const iso = dayFrom(offset);
          const prev = history[i - 1];
          const gapDays = prev ? prev[0] - offset : null;
          const venue = venueIdx >= 0 ? org.venues[venueIdx] : null;
          return (
            <li key={`${offset}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: "var(--tier-member)" }}
                />
                {i < history.length - 1 && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="tnum text-[13px] font-medium text-ink">{dayLabel(iso)}</span>
                  <span className="tnum text-[13px] text-ink">{money(spend)}</span>
                </div>
                <div className="mt-1 h-1 w-full rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(spend / maxSpend) * 100}%`, background: "var(--tier-card)" }}
                  />
                </div>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {count(orders)} {orders === 1 ? "order" : "orders"}
                  {venue ? ` · ${venue.name}` : ""}
                  {gapDays != null && gapDays > 0 && ` · ${count(gapDays)}d after the visit before`}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

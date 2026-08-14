"use client";

import { useState } from "react";
import { GrowthWaterfall, RealVsPriceBar } from "@/components/charts/GrowthWaterfall";
import { Card } from "@/components/ui/Primitives";
import { decompose, money, monthLabel, pct } from "@/lib/metrics";
import type { DecompositionRow } from "@/lib/types";

/**
 * Growth, with the comparator chosen by the operator rather than assumed.
 *
 * The PRD is explicit that the comparator must be named on screen: "up 8%" against
 * last month and against last year are different claims, and a chart that does not
 * say which one it made is not evidence.
 */
export function GrowthClient({ rows }: { rows: DecompositionRow[] }) {
  const [toMonth, setToMonth] = useState(rows.at(-1)?.month ?? "");
  const [mode, setMode] = useState<"previous" | "year">("previous");

  const to = rows.find((r) => r.month === toMonth) ?? rows.at(-1)!;
  const toIndex = rows.indexOf(to);
  const yearAgo = (() => {
    const d = new Date(`${to.month}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return rows.find((r) => r.month === d.toISOString().slice(0, 10));
  })();
  const from = mode === "year" ? yearAgo : rows[toIndex - 1];

  if (!from) {
    return (
      <Card title="Where your growth came from">
        <p className="text-[13px] text-ink-secondary">
          No comparator available for {monthLabel(to.month, true)} on this basis.
        </p>
      </Card>
    );
  }

  const d = decompose(from, to);
  const changePct = from.revenue ? d.revenueChange / from.revenue : 0;

  return (
    <div className="space-y-5">
      <Card
        title="Where your growth came from"
        subtitle={`${monthLabel(d.from.month, true)} → ${monthLabel(d.to.month, true)} · symmetric Shapley allocation, no residual`}
        right={
          <div className="flex items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "previous" | "year")}
              className="cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium outline-none"
            >
              <option value="previous">vs previous month</option>
              <option value="year">vs same month last year</option>
            </select>
            <select
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              className="cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium outline-none"
            >
              {rows.map((r) => (
                <option key={r.month} value={r.month}>{monthLabel(r.month)}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <span
              className="tnum text-[28px] leading-none font-semibold"
              style={{ color: d.revenueChange >= 0 ? "var(--good)" : "var(--critical)" }}
            >
              {d.revenueChange >= 0 ? "+" : "−"}{money(Math.abs(d.revenueChange))}
            </span>
            <span className="ml-2 text-[13px] text-ink-secondary">
              {pct(changePct, 1)} against {monthLabel(d.from.month)}
            </span>
          </div>
        </div>

        <GrowthWaterfall d={d} height={280} />

        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-3 text-[13px] font-medium text-ink">Real trade versus price</p>
          <RealVsPriceBar d={d} />
          <p className="mt-3 text-[15px] leading-relaxed text-ink">
            {d.real >= 0 && d.price >= 0 && (
              <>
                <strong>{money(d.real)}</strong> came from more trade and{" "}
                <strong>{money(d.price)}</strong> from charging more per item. Growth is
                {d.real >= d.price ? " mostly real" : " mostly repricing"}.
              </>
            )}
            {d.real < 0 && d.price >= 0 && (
              <>
                Prices added <strong>{money(d.price)}</strong> while trade fell{" "}
                <strong>{money(Math.abs(d.real))}</strong>.{" "}
                {d.terms[0].value < 0 ? (
                  <>You lost guests: fewer people accounts for {money(Math.abs(d.terms[0].value))} of it.</>
                ) : (
                  <>Guest numbers held; the fall is in how often they come and what they buy.</>
                )}
              </>
            )}
            {d.real >= 0 && d.price < 0 && (
              <>
                Trade added <strong>{money(d.real)}</strong> while average price fell{" "}
                <strong>{money(Math.abs(d.price))}</strong>. You are busier and cheaper.
              </>
            )}
            {d.real < 0 && d.price < 0 && (
              <>Trade and price both fell. <strong>{money(Math.abs(d.real))}</strong> of the loss is fewer guests, less often, or smaller baskets.</>
            )}
          </p>
        </div>
      </Card>

      <Card
        title="Month by month"
        subtitle="Every term, every month, so a claim can be checked rather than believed."
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-secondary">
                <th className="px-5 py-2 font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">Change</th>
                <th className="px-3 py-2 text-right font-medium">Guests</th>
                <th className="px-3 py-2 text-right font-medium">Frequency</th>
                <th className="px-3 py-2 text-right font-medium">Basket</th>
                <th className="px-5 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const prev = rows[i - 1];
                const dd = prev ? decompose(prev, r) : null;
                return (
                  <tr
                    key={r.month}
                    className={`border-b border-line last:border-0 hover:bg-surface-hover ${
                      r.month === toMonth ? "bg-accent-soft/40" : ""
                    }`}
                  >
                    <td className="px-5 py-1.5 font-medium text-ink">{monthLabel(r.month)}</td>
                    <td className="tnum px-3 py-1.5 text-right">{money(r.revenue)}</td>
                    <td className="tnum px-3 py-1.5 text-right" style={{ color: dd ? (dd.revenueChange >= 0 ? "var(--good)" : "var(--critical)") : undefined }}>
                      {dd ? `${dd.revenueChange >= 0 ? "+" : "−"}${money(Math.abs(dd.revenueChange))}` : "—"}
                    </td>
                    {dd
                      ? dd.terms.map((t) => (
                          <td key={t.key} className="tnum px-3 py-1.5 text-right text-ink-secondary">
                            {t.value >= 0 ? "+" : "−"}{money(Math.abs(t.value))}
                          </td>
                        ))
                      : ["—", "—", "—", "—"].map((v, j) => (
                          <td key={j} className="px-3 py-1.5 text-right text-ink-muted">{v}</td>
                        ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

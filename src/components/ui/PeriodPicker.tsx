"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { IconChevron, IconAlert } from "../shell/Icons";
import { count, monthLabel } from "@/lib/metrics";
import { explainGap, type Period, type Periods } from "@/lib/periods";
import { track } from "@/lib/instrument";

/**
 * The period control.
 *
 * It offers the runs of trustworthy months that exist and **publishes the ones
 * that do not, with the reason each is missing**. That second list is the more
 * valuable half and it is the reason this is not a date picker: a free range
 * would let an operator select May to December 2025 and read a confident report
 * about nobody, because card references across the whole estate were 14 to 37
 * distinct values a month against 13 to 18 million transactions.
 *
 * A greyed-out calendar would say "this product cannot do that". This says
 * "your payment feed was down for eight months, here is the month it started
 * and here is who owns it" — which is a thing an operator can act on, and it
 * points the escalation at the platform rather than at the report.
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
    `${monthLabel(p.start)} – ${monthLabel(p.end)}`;

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
          <div className="absolute left-0 z-30 mt-1.5 w-[440px] rounded-xl border border-line bg-surface-raised p-1.5 shadow-lg">
            <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
              {all.periods.length} period{all.periods.length === 1 ? "" : "s"} you can report on
            </p>
            {all.periods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => go(p.id)}
                className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-surface-hover ${
                  p.id === current.id ? "bg-accent-soft" : ""
                }`}
              >
                <span className={p.id === current.id ? "font-semibold text-accent" : "text-ink"}>
                  {label(p)}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {p.months} complete months
                  {p.claim === "none" && " · no growth claim"}
                </span>
              </button>
            ))}

            {all.gaps.length > 0 && (
              <>
                <p className="mt-2 border-t border-line px-2.5 pt-2.5 pb-1 text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
                  Periods you cannot report on
                </p>
                <p className="px-2.5 pb-1.5 text-[12px] leading-relaxed text-ink-muted">
                  Of {all.monthsTested} complete months tested, {all.monthsUsable} passed the card-capture
                  grading. These did not, and they are the reason there is no year-on-year comparison.
                </p>
                <ul className="max-h-[240px] overflow-y-auto px-1">
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
                            {count(g.months)} month{g.months === 1 ? "" : "s"} · {g.reason}
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
        </>
      )}
    </div>
  );
}

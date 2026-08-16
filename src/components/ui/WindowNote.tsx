import type { ReactNode } from "react";
import { IconAlert, IconInfo } from "../shell/Icons";
import { count, dayLabel, monthLabel } from "@/lib/metrics";
import type { ClaimState, WindowExplanation, WindowVerdict } from "@/lib/window";
import type { Org } from "@/lib/types";
import { explainWindow } from "@/lib/window";

/**
 * C5. One window explanation, rendered wherever the window is stated.
 *
 * The window was printed on every page and explained on exactly one. A reader
 * who lands on Members sees "3 complete months" and has no way to learn that
 * this is not a reporting preference but the length of the run the card data
 * actually supports — so they read it as a choice somebody made, and choices
 * are negotiable in a way that constraints are not.
 *
 * Everything below is read from the snapshot's own grading. There is no constant
 * in this file, which is what makes the refusal move the day the data does.
 */
export function WindowNote({
  org, variant = "full",
}: {
  org: Org;
  variant?: "full" | "inline";
}) {
  const x = explainWindow(org);

  if (variant === "inline") {
    return (
      <p className="text-[12px] leading-relaxed text-ink-muted">
        {dayLabel(x.window.start)} – {dayLabel(x.window.end)}, {x.window.months} complete months.{" "}
        {x.claim.level === "none" ? (
          <strong className="font-medium text-ink-secondary">
            No growth claim and no trend claim: there is no month M−12 in this data.
          </strong>
        ) : (
          x.claim.statement
        )}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface-sunken px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-ink-muted">
          <IconInfo />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-ink">
            Why the window is {x.window.months} complete month{x.window.months === 1 ? "" : "s"}
          </h3>
          <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">{x.reason}</p>

          <ClaimLine claim={x.claim} />

          {x.costs.length > 0 && (
            <>
              <p className="mt-3 text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
                What this window costs
              </p>
              <ul className="mt-1.5 space-y-1">
                {x.costs.map((c) => (
                  <li key={c} className="flex gap-2 text-[13px] leading-relaxed text-ink-secondary">
                    <span aria-hidden className="text-ink-muted">
                      —
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <RejectedMonths x={x} />
        </div>
      </div>
    </div>
  );
}

/**
 * R-205. Which claim the surface is entitled to make.
 *
 * Stated even when the answer is "neither", and especially then — the whole
 * failure mode is a reader assuming a comparison exists because a chart has a
 * time axis on it.
 */
export function ClaimLine({ claim }: { claim: ClaimState }) {
  const tone =
    claim.level === "trend" ? "var(--good)" : claim.level === "growth" ? "var(--accent)" : "var(--warning)";
  return (
    <p
      className="mt-3 border-l-2 pl-3 text-[13px] leading-relaxed text-ink-secondary"
      style={{ borderColor: tone }}
    >
      <span className="font-medium text-ink">
        {claim.level === "trend"
          ? "Trend claim available."
          : claim.level === "growth"
            ? "Growth claim available. Trend claim not available."
            : "No growth claim. No trend claim."}
      </span>{" "}
      {claim.statement.replace(/\*\*/g, "")}
      {claim.next && <span className="text-ink-muted"> Needs {claim.next}.</span>}
    </p>
  );
}

function RejectedMonths({ x }: { x: WindowExplanation }) {
  if (!x.rejected.length) return null;
  // R-204. A month that failed is named with its verdict, never averaged in and
  // never drawn as a fall in customers. Phase 1 adds the owner column.
  const shown = x.rejected.slice(0, 4);
  const rest = x.rejected.length - shown.length;
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-accent hover:underline">
        {x.rejected.length} of {x.monthsTested} months rejected and named
        <span className="ml-1 font-normal text-ink-muted group-open:hidden">
          — {shown.map((r) => monthLabel(r.month)).join(", ")}
          {rest > 0 ? ` and ${rest} more` : ""}
        </span>
      </summary>
      <ul className="mt-2 space-y-1">
        {x.rejected.map((r) => (
          <li key={r.month} className="tnum flex justify-between gap-4 text-[12px] text-ink-secondary">
            <span>{monthLabel(r.month)}</span>
            <span className="text-ink-muted">{r.reason}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 max-w-[80ch] text-[12px] leading-relaxed text-ink-muted">
        A rejected month does not render, is not averaged into any figure, and is never drawn as a fall in
        customers. &ldquo;Not trading&rdquo; means the venue had not opened — a business fact, not a feed
        failure — and it is separated from the rest so the count of real gaps stays honest.
      </p>
    </details>
  );
}

/**
 * R-191. What renders in place of a threshold-dependent figure that cannot be
 * measured over this window.
 *
 * Deliberately not a caption on a chart. §9.1 offered "state the scope on the
 * chart face or pull the chart" and R-191 permits only the second, because a
 * figure with a caption is still a figure and gets quoted without its caption in
 * the very next meeting.
 */
export function Constraint({
  verdict, label, children,
}: {
  verdict: Extract<WindowVerdict, { renders: false }>;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface-sunken px-4 py-4">
      <div className="flex items-start gap-3">
        <span style={{ color: "var(--warning)" }}>
          <IconAlert />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">{label} — not published</p>
          <p className="mt-1 max-w-[86ch] text-[13px] leading-relaxed text-ink-secondary">
            {verdict.statement}
          </p>
          <p className="tnum mt-2 text-[12px] text-ink-muted">
            Window {count(verdict.windowDays)} days · threshold {verdict.thresholdDays} days · needs{" "}
            {count(verdict.required)} days
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

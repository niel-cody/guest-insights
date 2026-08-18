import Link from "next/link";
import type { ReactNode } from "react";
import { IconAlert, IconCheck, IconInfo } from "../shell/Icons";
import { InfoButton } from "./InfoButton";

export function Card({
  title, subtitle, right, children, className = "", padded = true,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-line bg-surface-raised ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-secondary">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/**
 * A headline figure. Tiles round to the nearest ten by contract — a front page
 * that reads 412 invites an argument about the 2, and the 2 is never the point.
 *
 * ── Four lines, and the fifth is behind a button ───────────────────────────
 *
 * The tile is deliberately short, in a fixed order, because four of these sit
 * across the top of a page and a reader takes them in as a row rather than one
 * at a time:
 *
 *   1. `label`    — what this is
 *   2. `value`    — the figure
 *   3. `detail`   — the one supporting figure that makes it readable
 *   4. `meta`     — tier and window: which population, over what
 *   5. `info`     — the method, behind a button
 *
 * Lines 3 and 4 stay on the face because they are **part of the figure, not an
 * explanation of it**: the grain, the window and the denominator are what stop
 * a number being ambiguous, and a build whose contract is that every figure
 * carries them cannot put them behind a click.
 *
 * Line 5 is the method — the thing a reader asks once and never again — and it
 * is the only thing that folds. See `InfoButton` for why the mechanism came
 * back and what conditions it came back under. **A caveat or a refusal is never
 * line 5**; those go in `footnote`, which is always visible.
 */
export function Tile({
  label, value, accent = "var(--accent)", detail, meta, info, footnote, refused = false,
}: {
  label: string;
  value: string;
  accent?: string;
  /** Line 3. The one supporting figure — a split, a share, a comparison. */
  detail?: ReactNode;
  /** Line 4. Tier and window. Which population this counts, and over what. */
  meta?: ReactNode;
  /** Line 5, behind a button beside the label. Method and provenance only. */
  info?: ReactNode;
  /** Always visible, below everything. Caveats and refusal reasons live here. */
  footnote?: ReactNode;
  /**
   * A figure this build declines to publish.
   *
   * **A refusal is never a blank** — a blank reads as broken and gets raised as
   * a bug, and its absence would change how the tiles beside it read. So the
   * tile keeps its slot and says so.
   *
   * It is also **not struck through**, which is where this landed first.
   * Strikethrough is a deletion mark: in every document a reader has ever seen
   * it means "this was here and we took it away", which invites them to squint
   * at the number and wonder what it said rather than read why there isn't one.
   * It is a scar where a sentence belongs. The figure is shown in a quieter
   * weight, labelled "Not published", with the reason in the footnote.
   */
  refused?: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-line bg-surface-raised px-5 py-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">{label}</span>
        {info && <InfoButton label={`About ${label.toLowerCase()}`} align="end">{info}</InfoButton>}
      </div>
      {refused && (
        <div className="mt-1.5 text-[13px] font-semibold text-ink-secondary">Not published</div>
      )}
      <div
        className={`tnum leading-none font-semibold ${
          refused ? "mt-1 text-[20px] text-ink-muted" : "mt-1.5 text-[30px] text-ink"
        }`}
      >
        {value}
      </div>
      {detail && <div className="mt-2 text-[12px] leading-relaxed text-ink-secondary">{detail}</div>}
      {meta && <div className="mt-1 text-[12px] leading-relaxed text-ink-muted">{meta}</div>}
      {footnote && <div className="mt-2 text-[12px] leading-relaxed text-ink-secondary">{footnote}</div>}
    </div>
  );
}

export function Pill({
  children, tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical" | "member" | "card";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-sunken text-ink-secondary border-line",
    good: "text-white border-transparent",
    warning: "text-white border-transparent",
    critical: "text-white border-transparent",
    member: "text-white border-transparent",
    card: "text-white border-transparent",
  };
  const bg: Record<string, string | undefined> = {
    good: "var(--good)",
    warning: "var(--warning)",
    critical: "var(--critical)",
    member: "var(--tier-member)",
    card: "var(--tier-card)",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${tones[tone]}`}
      style={bg[tone] ? { background: bg[tone] } : undefined}
    >
      {children}
    </span>
  );
}

/** A designed empty state. Never a blank panel — the reason is the content. */
export function EmptyState({
  title, body, tone = "info",
}: {
  title: string;
  body: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-4 py-4">
      <span style={{ color: tone === "warning" ? "var(--warning)" : "var(--ink-muted)" }}>
        {tone === "warning" ? <IconAlert /> : <IconInfo />}
      </span>
      <div>
        <p className="text-[14px] font-medium text-ink">{title}</p>
        <div className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{body}</div>
      </div>
    </div>
  );
}

/**
 * The badge names and links its constituents.
 *
 * v1 shipped this as a static span reading "5 checks pass", above five checks
 * that could not fail. A badge that cannot be opened is a claim; this one is a
 * link to the evidence, and it counts only checks proven capable of failing.
 */
export function CheckBadge({
  href, checks,
}: {
  href: string;
  checks: { ok: boolean; severity: "blocking" | "warning" }[];
}) {
  const blockingFailed = checks.filter((c) => !c.ok && c.severity === "blocking").length;
  const warnings = checks.filter((c) => !c.ok && c.severity === "warning").length;
  // A firing warning is the product working, not the build failing: it is how the
  // page knows to withhold a comparison. Only a blocking failure means a number
  // on screen cannot be trusted, and only that turns the badge red.
  const tone = blockingFailed > 0 ? "var(--critical)" : warnings > 0 ? "var(--warning)" : "var(--good)";
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-80"
      style={{ borderColor: tone, color: tone }}
    >
      {blockingFailed > 0 ? <IconAlert className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
      {blockingFailed > 0
        ? `${blockingFailed} of ${checks.length} checks failing`
        : `${checks.length - warnings} checks pass`}
      {warnings > 0 && <span className="opacity-75">· {warnings} to review</span>}
    </Link>
  );
}

/** Two-column definition list used by drawers and the method notes. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-secondary">{k}</dt>
          <dd className="tnum text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

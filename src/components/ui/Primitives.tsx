import Link from "next/link";
import type { ReactNode } from "react";
import { IconAlert, IconCheck, IconInfo } from "../shell/Icons";

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
 * ── There is no `hint` prop, and that is deliberate ────────────────────────
 *
 * This used to take a `hint` string and render an info icon with a `title`
 * attribute. §8 rule 7 removes the whole mechanism: **hover does not exist on
 * touch**, a caveat nobody can reach is a caveat nobody reads, and a tile that
 * needs a tooltip to be understood is not finished. The prototype this replaces
 * shipped four info icons that rendered nothing at all when clicked.
 *
 * Everything a reader needs is in `footnote`, in smaller always-visible type.
 * That is not a downgrade — it is the caveat arriving without being asked for,
 * which is the only way it reaches the reader who is in a hurry.
 */
export function Tile({
  label, value, accent = "var(--accent)", footnote, refused = false,
}: {
  label: string;
  value: string;
  accent?: string;
  /** Always visible. Population, window and denominator live here. */
  footnote?: ReactNode;
  /**
   * §8 rule 3. **A refused figure renders as a struck-through number with the
   * reason under it, never as a blank.**
   *
   * A blank reads as broken and gets raised as a bug; a strike reads as a
   * decision and gets read. This lives on the component rather than at each
   * call site because the one place it was done by hand — the member-value tile
   * at a merchant where the within-person estimate is not estimable — rendered
   * the words "not published" in the same weight as a real figure, which is
   * neither a blank nor a strike but a third thing that looks like an answer.
   */
  refused?: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-line bg-surface-raised px-5 py-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <span className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">{label}</span>
      <div
        className={`tnum mt-1.5 leading-none font-semibold ${
          refused ? "text-[22px] text-ink-muted line-through decoration-2" : "text-[30px] text-ink"
        }`}
      >
        {value}
      </div>
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

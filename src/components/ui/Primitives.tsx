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
 */
export function Tile({
  label, value, hint, accent = "var(--accent)", footnote,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  footnote?: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-line bg-surface-raised px-5 py-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">{label}</span>
        {hint && (
          <span title={hint} className="cursor-help text-ink-muted">
            <IconInfo />
          </span>
        )}
      </div>
      <div className="tnum mt-1.5 text-[30px] leading-none font-semibold text-ink">{value}</div>
      {footnote && <div className="mt-2 text-[12px] text-ink-secondary">{footnote}</div>}
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

export function InvariantBadge({ ok, count }: { ok: boolean; count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
      style={{
        borderColor: ok ? "var(--good)" : "var(--critical)",
        color: ok ? "var(--good)" : "var(--critical)",
      }}
    >
      {ok ? <IconCheck className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />}
      {ok ? `${count} checks pass` : "Reconciliation failed"}
    </span>
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

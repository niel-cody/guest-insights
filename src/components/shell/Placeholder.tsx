import type { ReactNode } from "react";

/**
 * A stand-in for a report that already exists in production.
 *
 * ── What this is, and what it must never become ────────────────────────────
 *
 * Loyalty Spend and Loyalty Redemption ship today. **They are not being built,
 * changed or fixed here.** They appear in this POC for one reason: so a reviewer
 * clicking down the sidebar sees the whole Customers section and can tell us
 * whether the shape is right, rather than reacting to three reports floating on
 * their own.
 *
 * So this component reads nothing. **No snapshot, no filters, no interactivity,
 * no queries.** Everything below is a flat rendering with its figures written
 * into the page. If a future change finds itself wanting a `getSnapshot` call in
 * here, that is the signal it has started building one of these, and the answer
 * is to stop.
 *
 * The label is not a courtesy. A static rendering that reads as live is the worst
 * of both — a reviewer files feedback against numbers nobody is maintaining, and
 * an engineer later treats a mock as a contract.
 */
export function Placeholder({
  title, section = "Customers", standfirst, children, note,
}: {
  title: string;
  /** The section this stand-in sits in. Not always Customers any more. */
  section?: string;
  standfirst: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line bg-surface px-6 pt-4 pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold text-ink">{title}</h1>
          <span className="text-[13px] text-ink-muted">{section}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          {/* The label, at the top, before anything that could be mistaken for
              a finding. */}
          <div
            className="rounded-xl border border-dashed px-5 py-4"
            style={{ borderColor: "var(--warning)", background: "var(--surface-sunken)" }}
          >
            <p className="text-[15px] font-semibold text-ink">
              Existing report. Not part of this POC.
            </p>
            <p className="mt-1 max-w-[95ch] text-[13px] leading-relaxed text-ink-secondary">
              {standfirst}
            </p>
            <p className="mt-2 max-w-[95ch] text-[12px] leading-relaxed text-ink-muted">
              What you see below is a flat, non-interactive stand-in so the section reads whole. It
              queries nothing, filters nothing and is not being maintained. Feedback on this screen
              belongs to the team that owns the live report, not to this build.
            </p>
          </div>

          {/* aria-hidden: this is scenery. A screen reader walking it as a real
              report would be told figures nobody is standing behind. */}
          <div className="pointer-events-none select-none opacity-[0.72]" aria-hidden="true">
            {children}
          </div>

          {note}
        </div>
      </div>
    </div>
  );
}

/** A flat tile. No hint, no icon, no behaviour — this is a picture of a tile. */
export function FlatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised px-5 py-4">
      <div className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">{label}</div>
      <div className="tnum mt-1.5 text-[28px] leading-none font-semibold text-ink">{value}</div>
      {sub && <div className="mt-2 text-[12px] text-ink-secondary">{sub}</div>}
    </div>
  );
}

/** A flat panel with a title bar, so the stand-in reads as the product it mimics. */
export function FlatPanel({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <header className="border-b border-line px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-secondary">{subtitle}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** A flat bar row, for the shapes these two reports are mostly made of. */
export function FlatBars({
  rows, max, colour = "var(--accent)",
}: {
  rows: { label: string; value: number; display: string }[];
  max: number;
  colour?: string;
}) {
  return (
    <table className="w-full text-[13px]">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-line last:border-b-0">
            <th scope="row" className="w-[180px] py-2 pr-3 text-left font-normal text-ink">{r.label}</th>
            <td className="py-2">
              <div className="h-2.5 w-full rounded-sm bg-surface-sunken">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${max ? (r.value / max) * 100 : 0}%`, background: colour }}
                />
              </div>
            </td>
            <td className="tnum w-[110px] py-2 pl-3 text-right font-medium whitespace-nowrap text-ink">
              {r.display}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

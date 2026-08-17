import type { ReactNode } from "react";

/**
 * Progressive disclosure. §5.8.
 *
 * ── What may go behind this, and what may not ──────────────────────────────
 *
 * **The result is always visible; only the working folds away.** That is the
 * whole contract. A reader who never opens one of these has still been told
 * every conclusion the section reaches — they have been spared the
 * decomposition table, not the finding it produces.
 *
 * **Caveats never collapse.** Not a refusal, not a confidence interval, not a
 * selection warning, not a window constraint. Those live in the open above,
 * because a caveat behind a click is a caveat nobody reads, and the one reader
 * who most needs it is the one in a hurry quoting the headline.
 *
 * **There is no simple/advanced toggle**, here or anywhere. A global toggle
 * makes rigour a mode the reader can leave, and the moment it exists somebody
 * screenshots the simple version.
 *
 * Built on `<details>` so it works without JavaScript, is keyboard-operable and
 * is findable by in-page search when open.
 */
export function Disclosure({
  summary, result, children, defaultOpen = false,
}: {
  summary: string;
  /** The conclusion. Rendered outside the fold — this is never hidden. */
  result: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink">{summary}</h2>
        <p className="mt-1 max-w-[100ch] text-[13px] leading-relaxed text-ink-secondary">{result}</p>
      </div>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-accent marker:hidden hover:bg-surface-hover">
          <span className="transition-transform group-open:rotate-90">›</span>
          <span className="group-open:hidden">Show the working</span>
          <span className="hidden group-open:inline">Hide the working</span>
        </summary>
        <div className="border-t border-line p-5">{children}</div>
      </details>
    </section>
  );
}

import type { ReactNode } from "react";

/**
 * The question a page answers, above the figures that answer it.
 *
 * ── Why this is not a panel ────────────────────────────────────────────────
 *
 * A reader arriving on a report has to work out what it is for before they can
 * read a single number, and four KPI tiles do not tell them — they tell them
 * what was measured, not what it was measured for. Two sentences at the top do,
 * and they cost less vertical space than the paragraph each tile would otherwise
 * be carrying.
 *
 * It is deliberately **not** wrapped in a `Card`. A framed box reads as a piece
 * of content the reader must consider, which is exactly wrong for orienting
 * copy: it should be absorbed on the way past and never come back. Framing every
 * region of a page is how a report ends up looking like a form.
 *
 * The question is a real question, in the operator's words, and it is the one
 * the page is designed around. If a page cannot state one, that is a finding
 * about the page rather than a reason to leave this off it.
 */
export function Standfirst({ question, body }: { question: string; body: ReactNode }) {
  return (
    <div className="max-w-[95ch]">
      <h2 className="text-[17px] leading-snug font-semibold text-ink">{question}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-secondary">{body}</p>
    </div>
  );
}

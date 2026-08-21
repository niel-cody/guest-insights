import type { Org } from "@/lib/types";
import { spineState } from "@/lib/window";

/**
 * The standing warning on a member window.
 *
 * ── Why this is in the layout and not on each page ─────────────────────────
 *
 * A member window reaches back twelve or twenty-one months where the card tier
 * caps at three, and that is the whole reason it exists. What it costs is a
 * different, smaller population — scanned trade only — and **the cost is
 * invisible in every figure it changes.** Guests, revenue, visits and segments
 * all render normally; they are simply computed over fewer people, and nothing
 * on the face of any of them says so.
 *
 * That is exactly the failure mode this build exists to prevent, so the notice
 * sits in the layout: it is on every surface, it cannot be collapsed, and a
 * screenshot of any page in a member window carries it. Individual surfaces
 * still withhold their own card-tier figures where those would print as a
 * confident zero — this is the sentence that explains why, not a substitute for
 * doing it.
 *
 * On a card window it renders nothing at all.
 */
export function SpineBanner({ org }: { org: Org }) {
  const s = spineState(org);
  if (s.cardMeasured) return null;

  return (
    <div
      role="note"
      className="border-b border-line bg-accent-soft px-6 py-2.5"
    >
      <p className="max-w-[110ch] text-[12px] leading-relaxed text-ink-secondary">
        <strong className="text-ink">Members only — measured on the loyalty scan.</strong>{" "}
        {s.statement}
      </p>
    </div>
  );
}

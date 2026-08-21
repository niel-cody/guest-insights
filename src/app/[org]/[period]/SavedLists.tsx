"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PENDING, listsServerSnapshot, listsSnapshot, subscribeLists } from "@/lib/lists";
import { toQuery } from "@/lib/url-state";
import { dayLabel } from "@/lib/metrics";
import { EmptyState, Pill } from "@/components/ui/Primitives";

/**
 * Home's third card: what this operator saved.
 *
 * ── Why it shows the rule and not a count ──────────────────────────────────
 *
 * A saved list is a **rule**, evaluated against the current rows every time it
 * is opened — see `@/lib/lists`. Home does not have the rows: it is a static
 * page that reads `localStorage` after hydration and holds no guest data at
 * all. It could fetch them, and it deliberately does not.
 *
 * So this card cannot say "1,204 people" and must not try. A size rendered here
 * would be a number computed somewhere other than the surface that owns the
 * population, which is the one way two figures in this product are allowed to
 * disagree. It shows the rule, the scope it was written in, and a link to the
 * grid that can actually evaluate it.
 *
 * ── Why lists from another scope are shown, and marked ─────────────────────
 *
 * The store is one browser-local list across every organisation and period. A
 * rule saved against Coffee Guru's June window means nothing on Amalfi, and
 * hiding those would be worse than marking them: an operator who saved six
 * lists and sees two is looking at a bug, and will not know it. They are shown,
 * dimmed, and labelled with the scope they belong to — and their link carries
 * that scope, so following one lands where the rule is meaningful rather than
 * silently re-evaluating it here.
 */
export function SavedLists({ orgSlug, period }: { orgSlug: string; period: string }) {
  /**
   * `PENDING` until the browser has actually been asked, and rendered as
   * nothing rather than as "no lists".
   *
   * The store is only readable in the browser, so the server pass and the first
   * hydration pass both see zero. Painting the empty state in that gap tells an
   * operator with four saved lists that they have none, for one frame, on every
   * single load — a lie that is brief is still the first thing they see. See
   * `@/lib/lists` for why the pending state is a distinct identity rather than
   * an empty array.
   *
   * Subscribing rather than reading once also means a list saved on Individuals
   * in another tab appears here without a reload.
   */
  const lists = useSyncExternalStore(subscribeLists, listsSnapshot, listsServerSnapshot);

  if (lists === PENDING) return <div className="h-[76px]" aria-hidden />;

  if (lists.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          title="You have not saved a list yet"
          body={
            <>
              A list is a rule — the filters that selected a population — not a frozen set of
              people. Build one on{" "}
              <Link href={`/${orgSlug}/${period}/guests`} className="underline">
                Individuals
              </Link>{" "}
              and it will appear here. Lists are held in this browser only; nothing leaves.
            </>
          }
        />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {lists.map((l) => {
        const foreign = l.scope.org !== orgSlug || l.scope.period !== period;
        // The link goes to the scope the rule was written in, never the one
        // being viewed. A rule re-pointed at another org is not the same rule.
        const href = `/${l.scope.org}/${l.scope.period}/guests${toQuery(l.rule)}`;
        return (
          <li key={l.id} className={`px-5 py-3.5 ${foreign ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
              <Link href={href} className="text-[14px] font-semibold text-ink hover:underline">
                {l.name}
              </Link>
              <div className="flex items-center gap-2">
                <Pill tone={l.scope.tier === "member" ? "member" : "card"}>{l.scope.tier}</Pill>
                {foreign && <Pill>another scope</Pill>}
              </div>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {l.scope.org} · {l.scope.venues.length === 0 ? "all venues" : l.scope.venues.join(", ")}{" "}
              · {dayLabel(l.scope.windowStart)} to {dayLabel(l.scope.windowEnd)} · saved{" "}
              {dayLabel(l.createdAt.slice(0, 10))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

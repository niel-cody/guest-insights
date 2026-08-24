"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { useScope } from "@/lib/use-scope";
import { IconExit } from "./Icons";

/**
 * The session, in the rail: who you are, which organisation, and the way out.
 *
 * ── Why it moved out of the filter bar and the page header ─────────────────
 *
 * The organisation control sat in the filter bar, beside Locations, Customers
 * and Segment. **It is not a filter.** Those three narrow the population inside
 * one organisation's data; this one replaces the dataset entirely and navigates
 * to a different URL. Putting a navigation control in a row of filters teaches
 * the reader that everything in that row is the same kind of thing, and the one
 * that is not is the one that changes every figure on the page.
 *
 * Sign out sat in the page header, next to the coverage and check chips —
 * chrome that qualifies the numbers. An account action has nothing to do with
 * qualifying a number, and it was the only control up there that could lose
 * somebody's place.
 *
 * Both belong to the session rather than to the report, so both are in the
 * rail, which is the only part of the shell that does not change when you
 * navigate.
 *
 * ── `<details>` rather than a popover with an effect ───────────────────────
 *
 * Same mechanism as `Locations` in the filter bar: the browser handles the open
 * state, Escape, and the click that closes it. A hand-rolled popover here would
 * be a `useEffect`, a document listener and a ref, to reproduce behaviour that
 * already exists and is already keyboard-accessible.
 */
export function AccountMenu() {
  const router = useRouter();
  const scope = useScope();

  /**
   * Before the scope cookie is read this renders as the plain product mark.
   *
   * Every page is `force-static`, so the server has no session to render from
   * and the first client pass has not read the cookie yet. Rendering a menu
   * button that opens onto nothing would be a control that is broken for one
   * frame on every load; rendering the mark is what this looked like anyway.
   */
  const orgs = scope?.orgs ?? [];

  if (!scope) {
    return (
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-[15px] font-bold text-white">
        N
      </div>
    );
  }

  return (
    <details className="relative mb-3">
      <summary
        title={`Signed in as ${scope.label}`}
        className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-[10px] bg-brand text-[15px] font-bold text-white marker:hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        N
      </summary>

      <div className="absolute top-0 left-full z-40 ml-2 w-[240px] rounded-xl border border-line bg-surface-raised p-2 shadow-pop">
        {/* Who, before which. Three passwords go to two merchants and to
            Oolio, and those three read pages that differ only in the figures on
            them — a reviewer who does not know which they are looking at cannot
            give useful feedback about it, or quotes a number back believing it
            is theirs. */}
        <div className="px-2.5 pt-1.5 pb-2">
          <p className="text-[11px] tracking-wide text-ink-muted uppercase">Signed in as</p>
          <p className="mt-0.5 text-[13px] font-semibold text-ink">{scope.label}</p>
        </div>

        <div className="border-t border-line pt-2">
          {/* One organisation is a label, not a control. A menu with a single
              option is a control that cannot do anything, and this shell has a
              rule against those. */}
          {orgs.length <= 1 ? (
            <p className="px-2.5 py-1.5 text-[13px] text-ink-secondary">
              {orgs[0]?.name ?? "One organisation"}
            </p>
          ) : (
            <>
              <p className="px-2.5 pb-1 text-[11px] tracking-wide text-ink-muted uppercase">
                Organisation
              </p>
              {orgs.map((o) => (
                <button
                  key={o.slug}
                  type="button"
                  /* To the org root, not to the current path with the slug
                     swapped. Periods are per-organisation, so carrying this
                     one across lands on a window the other org may not have —
                     the org index resolves its own most recent run. */
                  onClick={() => router.push(`/${o.slug}`)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-secondary hover:bg-surface-hover"
                >
                  {o.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </details>
  );
}

/**
 * Sign out, at the foot of the rail.
 *
 * Deliberately the last thing in the column and deliberately not beside the
 * organisation switcher, which is one click away from it in the menu above.
 * Adjacent destructive and navigational controls is how somebody switching
 * customer ends up signing out instead.
 */
export function SignOut() {
  const scope = useScope();
  if (!scope) return null;

  return (
    <form action={signOut} className="mt-auto">
      <button
        type="submit"
        title={`Sign out of ${scope.label}`}
        className="flex w-[60px] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <IconExit />
        <span className="leading-none">Sign out</span>
      </button>
    </form>
  );
}

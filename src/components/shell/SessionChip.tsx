"use client";

import { useScope } from "@/lib/use-scope";
import { signOut } from "@/app/login/actions";

/**
 * Who you are signed in as, and the way out.
 *
 * ── Why it earns space in the header ───────────────────────────────────────
 *
 * The passwords go to two different merchants and to Oolio. Three audiences
 * look at pages that are identical apart from the figures on them, and a
 * reviewer who does not know which report they are in cannot give useful
 * feedback about it — or worse, quotes a number back believing it is theirs.
 *
 * The internal grant sees both organisations and switches between them, which
 * is exactly the session most likely to lose track.
 *
 * Renders nothing until the scope cookie is read, because the page is
 * prerendered and the server has no session to render from.
 */
export function SessionChip() {
  const scope = useScope();
  if (!scope) return null;

  return (
    <span className="flex items-center gap-2 rounded-full border border-line px-2.5 py-1 text-[12px]">
      <span className="text-ink-muted">Signed in as</span>
      <span className="font-medium text-ink">{scope.label}</span>
      <form action={signOut} className="contents">
        <button
          type="submit"
          className="rounded-md px-1 text-ink-secondary underline-offset-2 hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          Sign out
        </button>
      </form>
    </span>
  );
}

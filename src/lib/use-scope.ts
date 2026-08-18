"use client";

import { useSyncExternalStore } from "react";
import { SCOPE_COOKIE } from "@/lib/gate";

export type ScopeOrg = { slug: string; name: string };
export type Scope = { label: string; orgs: ScopeOrg[] };

/**
 * Who is signed in, for display only.
 *
 * ── Why a cookie and not a prop ────────────────────────────────────────────
 *
 * Every report page is `force-static`. Reading the session server-side would
 * mean calling `headers()` or `cookies()` in the page, which makes it dynamic
 * and throws away the prerendering the whole build is designed around. So the
 * one piece of per-session state the chrome needs — the grant's label and which
 * organisations to offer — travels in a plain, unsigned cookie the client reads.
 *
 * ── This is not a security boundary and must never become one ──────────────
 *
 * `gi_scope` has no signature and is readable and writable by anything running
 * on the page. Editing it changes which options a `<select>` offers. It grants
 * nothing: `proxy.ts` re-derives the real entitlement from the signed, HttpOnly
 * session cookie on every request and refuses anything outside it.
 *
 * If you are ever tempted to make a decision here that matters, the decision
 * belongs in the proxy instead.
 *
 * ── `useSyncExternalStore`, not `useEffect` ────────────────────────────────
 *
 * A cookie is an external store, and this is the hook for reading one without a
 * hydration mismatch: `getServerSnapshot` returns null, so the prerendered HTML
 * contains no session detail at all — which is also what stops the *other*
 * customer's name being baked into a static page.
 *
 * Reading in an effect and calling `setState` would work, but it renders twice
 * on every page and trips `react-hooks/set-state-in-effect`. The snapshot is
 * memoised on the raw cookie string because `getSnapshot` must be referentially
 * stable — parsing fresh JSON each call returns a new object, and React would
 * spin forever comparing them.
 */

let cachedRaw: string | null = null;
let cachedScope: Scope | null = null;

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${SCOPE_COOKIE}=`))
      ?.slice(SCOPE_COOKIE.length + 1) ?? null
  );
}

function getSnapshot(): Scope | null {
  const raw = readCookie();
  if (raw === cachedRaw) return cachedScope;
  cachedRaw = raw;
  cachedScope = null;

  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<Scope>;
      if (typeof parsed?.label === "string" && Array.isArray(parsed?.orgs)) {
        cachedScope = {
          label: parsed.label,
          orgs: parsed.orgs.filter(
            (o): o is ScopeOrg =>
              !!o && typeof o.slug === "string" && typeof o.name === "string",
          ),
        };
      }
    } catch {
      // A malformed cookie is not worth surfacing. The switcher falls back to a
      // plain label, and the proxy still refuses whatever it should.
    }
  }
  return cachedScope;
}

/** The server has no session to render from, and deliberately renders none. */
function getServerSnapshot(): Scope | null {
  return null;
}

/** Cookies do not emit change events; a sign-out navigates rather than mutates. */
function subscribe(): () => void {
  return () => {};
}

export function useScope(): Scope | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Whether the scope permits an org. Display only — see the note above. */
export function scopeAllows(scope: Scope | null, slug: string): boolean {
  if (!scope) return true; // Pre-hydration: show what the server rendered.
  return scope.orgs.some((o) => o.slug === slug);
}

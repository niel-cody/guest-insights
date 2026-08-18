import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE, gateConfig, grantAllows, homeFor, orgFromPath, readSession,
} from "@/lib/gate";
import { ORG_SLUGS } from "@/lib/data";

/**
 * The gate, at the only place it can be enforced.
 *
 * ── It is `proxy.ts`, not `middleware.ts` ──────────────────────────────────
 *
 * `middleware.js` is **deprecated in Next.js 16** and renamed to `proxy.js`.
 * Same behaviour, different file and export name. It sits in `src/` because
 * this app keeps `app/` under `src/`, and the convention is same level as `app`.
 *
 * ── Two checks, in order, and both are load-bearing ────────────────────────
 *
 * 1. **Are you signed in at all?** No valid session → the login page.
 * 2. **May this session see this organisation?** The first path segment is the
 *    org slug, and it is compared against the grant. A Coffee Guru password
 *    asking for `/meat-flour-wine/...` is refused here, before Next.js renders
 *    anything.
 *
 * The second check is the one that matters now that passwords are going to two
 * different merchants. Everything in the UI that hides the other customer — the
 * organisation switcher, the landing redirect — is convenience. **This is the
 * control.** The URL is guessable by construction: there are two slugs and they
 * are both in the address bar.
 *
 * ── The refusal is a redirect, not a 403 ───────────────────────────────────
 *
 * A signed-in reviewer who mistypes a URL, or follows a stale link from an
 * email, gets sent to their own report rather than a dead end. A 403 would also
 * be an answer to "does this other organisation exist?", which is a question a
 * customer's login has no business being able to ask.
 */

export const config = {
  /**
   * Everything except the login page, compiled assets and the favicon.
   *
   * The matcher must be a build-time constant, and getting it wrong in the
   * permissive direction is the whole risk — so `scripts/gate-tests.ts` asserts
   * the pattern against a list of paths that must be gated and a list that must
   * not be.
   *
   * `_next/static` and `_next/image` stay open: they are compiled JS, CSS and
   * images carrying no snapshot data, and gating them would break the login
   * page's own styling. **RSC payloads are not in that set** — they are fetched
   * against the page's own path with `?_rsc=`, so they are gated with the page.
   */
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};

export function proxy(request: NextRequest) {
  const cfg = gateConfig();

  /**
   * Fail closed, and name the problem.
   *
   * The realistic failure is not an attack — it is the code shipping while the
   * environment variable does not, and nobody noticing that two customers' data
   * is public. A 503 is loud. Serving the report is silent.
   */
  if (!cfg.ok) {
    return new NextResponse(
      `This deployment is not configured.\n\n${cfg.reason}\n\n` +
        `Set SITE_ACCESS and SESSION_SECRET in the environment and redeploy. ` +
        `Nothing is served until both are valid.\n`,
      {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      },
    );
  }

  const { pathname, search } = request.nextUrl;
  const grant = readSession(request.cookies.get(SESSION_COOKIE)?.value, cfg.grants, cfg.secret);

  // ── 1. Signed in? ────────────────────────────────────────────────────────
  if (!grant) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const from = pathname + search;
    if (from && from !== "/") url.searchParams.set("next", from);
    const res = NextResponse.redirect(url);
    res.headers.set("cache-control", "no-store");
    return res;
  }

  // ── 2. Entitled to this organisation? ────────────────────────────────────
  const org = orgFromPath(pathname);
  if (org !== null && ORG_SLUGS.includes(org as (typeof ORG_SLUGS)[number]) && !grantAllows(grant, org)) {
    const url = request.nextUrl.clone();
    url.pathname = homeFor(grant, [...ORG_SLUGS]);
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("cache-control", "private, no-store");
    return res;
  }

  /**
   * The index has no organisation in it, so it is sent to the one this grant
   * owns rather than to a hard-coded slug. The app's own root redirect points
   * at Coffee Guru, which for a Meat Flour Wine reviewer would be a bounce
   * through somebody else's URL — refused a moment later, but still the wrong
   * shape of thing to do with a customer's link.
   */
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = homeFor(grant, [...ORG_SLUGS]);
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("cache-control", "private, no-store");
    return res;
  }

  const res = NextResponse.next();
  // This response is personal to this session. Without it a shared cache in
  // front of the app could hand one customer's page to the other.
  res.headers.set("cache-control", "private, no-store");
  // The grant travels to the app so the org switcher and the header can show
  // only what this session owns. It is **not** the control — the control is the
  // check above. Signed cookie in, derived header out; the app never re-decides.
  res.headers.set("x-gate-orgs", grant.orgs.join(","));
  res.headers.set("x-gate-label", encodeURIComponent(grant.label));
  return res;
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SCOPE_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, gateConfig, grantAllows, grantForPassword,
  homeFor, issueSession, orgFromPath, safeNext,
} from "@/lib/gate";
import { ORG_SLUGS, getAllOrgs } from "@/lib/data";

/**
 * Sign in. One password, no username — and the password decides which
 * organisation you land in.
 *
 * ── Why a Server Action ────────────────────────────────────────────────────
 *
 * The password is compared and discarded **on the server**. It is never in a
 * client bundle, never in a URL, never in `localStorage`. A client-side
 * comparison would ship every customer's password to everyone who loads the
 * login page, which is the most common way a gate like this turns out to be
 * decorative.
 *
 * ── The delay ──────────────────────────────────────────────────────────────
 *
 * Proxy is documented as something that may run at the CDN edge and must not
 * rely on shared globals, so a counter in module scope is not a rate limiter —
 * it is a rate limiter on one instance that resets whenever the platform
 * recycles it. Rather than ship that and call it protection, every failed
 * attempt costs a fixed second. The real defence is the twelve-character
 * minimum enforced in `gateConfig`.
 */
const FAILED_ATTEMPT_DELAY_MS = 1000;

export type LoginState = { error: string | null };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const cfg = gateConfig();
  if (!cfg.ok) {
    return { error: "This deployment is not configured. Set SITE_ACCESS and SESSION_SECRET." };
  }

  const submitted = String(formData.get("password") ?? "");
  const grant = grantForPassword(submitted, cfg.grants);

  if (!grant) {
    await new Promise((r) => setTimeout(r, FAILED_ATTEMPT_DELAY_MS));
    // One message for every failure. There are no usernames, so there is
    // nothing a more specific error could usefully distinguish — and anything
    // more specific starts confirming which passwords are close.
    return { error: "That password is not right." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, issueSession(grant, cfg.secret), {
    httpOnly: true,           // Script cannot read it, so injected script cannot steal it.
    sameSite: "lax",          // Not sent on cross-site POSTs; survives an ordinary link in.
    secure: process.env.NODE_ENV === "production", // localhost has no TLS to require.
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  /**
   * A second cookie, for display only, and deliberately readable by script.
   *
   * The report pages are `force-static`, so they cannot call `headers()` to
   * find out who is signed in — that would make every one of them dynamic and
   * throw away the prerendering the whole build is designed around. The
   * organisation switcher therefore reads this.
   *
   * **It is not a credential and it is not a control.** It carries a label and
   * a list of slugs, no secret and no signature. Editing it in devtools changes
   * which options a menu offers and nothing else: the proxy re-checks the real
   * grant against the signed session on every single request, and refuses. It
   * is `httpOnly: false` precisely because it holds nothing worth stealing.
   */
  const everyOrg = await getAllOrgs();
  const visibleOrgs = everyOrg
    .filter((o) => grantAllows(grant, o.slug))
    .map((o) => ({ slug: o.slug, name: o.name }));

  jar.set(SCOPE_COOKIE, JSON.stringify({ label: grant.label, orgs: visibleOrgs }), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  /**
   * Where they asked to go — but only if this grant is entitled to it.
   *
   * `?next=` arrives from the URL, so it is attacker-controlled in the sense
   * that anybody can construct a link. Sending a Coffee Guru reviewer to
   * `/meat-flour-wine/...` would be refused by the proxy on the next request,
   * so nothing leaks either way; checking here means they land somewhere useful
   * instead of bouncing. **This is the convenience copy of the rule. The proxy
   * holds the real one.**
   */
  const wanted = safeNext(String(formData.get("next") ?? ""));
  const wantedOrg = wanted ? orgFromPath(wanted) : null;
  const entitled =
    wanted !== null &&
    (wantedOrg === null || !ORG_SLUGS.includes(wantedOrg as (typeof ORG_SLUGS)[number]) || grantAllows(grant, wantedOrg));

  redirect(entitled && wanted ? wanted : homeFor(grant, [...ORG_SLUGS]));
}

/** Sign out: drop the cookie, land back on the login page. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(SCOPE_COOKIE);
  redirect("/login");
}

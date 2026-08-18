import { createHmac, timingSafeEqual, createHash } from "node:crypto";

/**
 * The access gate. One password per audience, and a password decides **which
 * organisation you can see**.
 *
 * ── What changed, and why the bar moved ────────────────────────────────────
 *
 * This started as "stop strangers stumbling across the preview" — one shared
 * password, one operator. It is now **tenant isolation between two real
 * merchants** who trade in the same market: a Coffee Guru password must never
 * render a Meat Flour Wine figure, and the reverse. That is not a UX
 * preference. Those are two customers' commercial data, and mixing them is an
 * incident rather than a bug.
 *
 * The consequence for the design is one rule, and everything here follows from
 * it:
 *
 *   **Entitlement is enforced on the request path in `proxy.ts`, before any
 *   page renders. Every other place it appears is convenience.**
 *
 * Hiding the other organisation from the switcher is good manners. It is not a
 * control, because the URL is `/(org)/(period)/(page)` and anybody can type it.
 * So the proxy compares the first path segment against the session's grant and
 * refuses on mismatch. If the menu filtering were deleted tomorrow, the data
 * would still be safe; if the proxy check were deleted, nothing else would
 * catch it.
 *
 * ── Why the check cannot live in the app ───────────────────────────────────
 *
 * Every report page is `force-static`. The guest rows and segment totals are
 * prerendered into HTML at build time, so a layout-level check would be
 * deciding whether to *display* a document that has already been serialised
 * with the data in it. Proxy runs before Next.js serves anything, including a
 * prerendered page coming off the CDN.
 *
 * ── The configuration ──────────────────────────────────────────────────────
 *
 * `SITE_ACCESS` is JSON: a list of grants, each with a label, a password and
 * the organisations it opens. `"*"` grants every organisation, which is the
 * internal one.
 *
 *   [
 *     { "label": "Coffee Guru",      "password": "…", "orgs": ["coffee-guru"] },
 *     { "label": "Meat Flour Wine",  "password": "…", "orgs": ["meat-flour-wine"] },
 *     { "label": "Oolio",            "password": "…", "orgs": ["*"] }
 *   ]
 *
 * JSON rather than a delimited string on purpose: a password is arbitrary text
 * and `coffee-guru:p@ss,word` has no unambiguous parse. A format that can be
 * mis-split is a format that will eventually grant the wrong organisation.
 */

export const SESSION_COOKIE = "gi_session";

/**
 * A display-only companion to the session cookie.
 *
 * Carries the grant's label and org slugs so the organisation switcher can
 * render the right options from a **statically prerendered** page, which cannot
 * call `headers()` without becoming dynamic.
 *
 * **Not a credential.** No secret, no signature, readable and writable by
 * script on purpose. Forging it changes which options a menu shows; it grants
 * nothing, because `proxy.ts` re-derives the real grant from the signed session
 * on every request.
 */
export const SCOPE_COOKIE = "gi_scope";

/** Eight hours — a working day, and a forgotten laptop expires overnight. */
export const SESSION_MAX_AGE = 60 * 60 * 8;

const MIN_PASSWORD_LENGTH = 12;
const MIN_SECRET_LENGTH = 32;

export type Grant = {
  /** Shown after sign-in, so a reviewer can see whose report they are in. */
  label: string;
  password: string;
  /** Org slugs, or `["*"]` for every organisation. */
  orgs: string[];
};

export type GateConfig =
  | { ok: true; grants: Grant[]; secret: string }
  | { ok: false; reason: string };

/**
 * Reads and validates `SITE_ACCESS` and `SESSION_SECRET`.
 *
 * Returns a reason rather than throwing, so `proxy.ts` can render a 503 naming
 * the problem. **Every validation failure denies every request.** A gate that
 * waves traffic through when its own configuration is unreadable is worse than
 * no gate, because the deployment looks healthy — and "the environment variable
 * didn't get set" is how that actually happens.
 */
export function gateConfig(): GateConfig {
  const secret = process.env.SESSION_SECRET ?? "";
  if (!secret) return { ok: false, reason: "SESSION_SECRET is not set." };
  if (secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, reason: `SESSION_SECRET is shorter than ${MIN_SECRET_LENGTH} characters.` };
  }

  const raw = process.env.SITE_ACCESS ?? "";
  if (!raw) return { ok: false, reason: "SITE_ACCESS is not set." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "SITE_ACCESS is not valid JSON." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, reason: "SITE_ACCESS must be a non-empty JSON array of grants." };
  }

  const grants: Grant[] = [];
  for (const [i, entry] of parsed.entries()) {
    const e = entry as Partial<Grant>;
    const where = `SITE_ACCESS[${i}]`;
    if (typeof e?.label !== "string" || !e.label.trim()) {
      return { ok: false, reason: `${where} has no label.` };
    }
    if (typeof e?.password !== "string" || e.password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, reason: `${where} ("${e.label}") has a password shorter than ${MIN_PASSWORD_LENGTH} characters.` };
    }
    if (!Array.isArray(e?.orgs) || e.orgs.length === 0 || e.orgs.some((o) => typeof o !== "string" || !o)) {
      return { ok: false, reason: `${where} ("${e.label}") has no organisations.` };
    }
    grants.push({ label: e.label, password: e.password, orgs: e.orgs });
  }

  /**
   * Two grants sharing a password would make entitlement depend on iteration
   * order — the same secret silently opening a different customer's report
   * depending on how the list happens to be written. Refused rather than
   * resolved.
   */
  const seen = new Set<string>();
  for (const g of grants) {
    const fp = createHash("sha256").update(g.password).digest("hex");
    if (seen.has(fp)) {
      return { ok: false, reason: `Two grants in SITE_ACCESS share a password ("${g.label}").` };
    }
    seen.add(fp);
  }

  return { ok: true, grants, secret };
}

/** Equal-length, constant-time comparison of two secrets of any length. */
function sameSecret(a: string, b: string): boolean {
  // Hashing first equalises length, so `timingSafeEqual` cannot throw on a
  // mismatch and the comparison cannot leak length through an early return.
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * A grant's identity inside a signed session: a fingerprint over the label, the
 * password and the organisations it opens.
 *
 * All three, deliberately. Fingerprinting the password alone would let a grant
 * keep working after its `orgs` list was edited — so widening or narrowing a
 * customer's access would not take effect for anybody already signed in, which
 * is the one moment you are changing it for.
 */
function grantFingerprint(grant: Grant, secret: string): string {
  const material = JSON.stringify([grant.label, grant.password, [...grant.orgs].sort()]);
  return createHmac("sha256", secret).update(`grant:${material}`).digest("hex").slice(0, 16);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `v2.<expiry>.<grant fingerprint>.<signature>` */
export function issueSession(grant: Grant, secret: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_MAX_AGE;
  const payload = `v2.${exp}.${grantFingerprint(grant, secret)}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Resolves a session cookie back to the grant that issued it, or null.
 *
 * Returning the **grant** rather than a boolean is the point: the caller needs
 * to know which organisations this request may see, and a boolean would tempt
 * every call site into deciding that for itself.
 */
export function readSession(
  value: string | undefined,
  grants: Grant[],
  secret: string,
  now = Date.now(),
): Grant | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [version, expRaw, fp, signature] = parts;
  if (version !== "v2") return null;

  const payload = `${version}.${expRaw}.${fp}`;
  // Signature first: nothing in the payload means anything until it is proven
  // to be ours.
  if (!sameSecret(signature, sign(payload, secret))) return null;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;

  // Constant-time over every grant rather than a short-circuiting find, so the
  // response time does not indicate which grant a cookie belongs to.
  let matched: Grant | null = null;
  for (const g of grants) {
    if (sameSecret(fp, grantFingerprint(g, secret))) matched = g;
  }
  return matched;
}

/** The grant for a submitted password, or null. Constant-time across all grants. */
export function grantForPassword(submitted: string, grants: Grant[]): Grant | null {
  let matched: Grant | null = null;
  for (const g of grants) {
    // No `break`: an early exit would make a near-miss measurably faster than a
    // miss on the last grant, which leaks the order of the list.
    if (sameSecret(submitted, g.password)) matched = g;
  }
  return matched;
}

/**
 * **The isolation rule.** Whether a grant may see an organisation.
 *
 * Exact slug match or the `"*"` wildcard. No prefix matching, no
 * case-insensitivity, no "starts with" — `coffee-guru` must not open
 * `coffee-guru-staging`, and a comparison loose enough to allow that is how one
 * customer ends up inside another's report.
 */
export function grantAllows(grant: Grant, orgSlug: string): boolean {
  return grant.orgs.includes("*") || grant.orgs.includes(orgSlug);
}

/**
 * The organisation a request is for, from its path, or null if the path does
 * not address one.
 *
 * Paths are `/<org>/<period>/<page>`. A path with no first segment (the index)
 * is not org-scoped and is handled by the caller rather than defaulted here —
 * defaulting is how a route quietly becomes exempt.
 */
export function orgFromPath(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ?? null;
}

/** Where a grant should land when it has not asked for anywhere in particular. */
export function homeFor(grant: Grant, allOrgs: string[]): string {
  const first = grant.orgs.includes("*") ? allOrgs[0] : grant.orgs[0];
  return first ? `/${first}` : "/login";
}

/**
 * Where to send somebody after they sign in.
 *
 * **Only ever a path on this site.** An unvalidated `?next=` is an open
 * redirect: our own login page bouncing to somewhere else after a successful
 * sign-in is a credible phishing pattern. Protocol-relative `//evil.example` is
 * rejected alongside absolute URLs — it is a URL wearing a path's clothes.
 *
 * Note this does **not** check entitlement. It cannot: it is a string function.
 * The proxy re-checks the org on the redirected request, which is the only
 * place that check is worth anything.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  return raw;
}

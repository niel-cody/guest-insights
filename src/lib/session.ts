import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, gateConfig, readSession, type Grant } from "./gate";

/**
 * The grant behind the current request, derived from the signed session.
 *
 * Every write in this build attributes itself to a person, and this is the only
 * trustworthy source for who that is. The other candidate — the `gi_scope`
 * cookie the chrome reads — is unsigned and writable by anything running on the
 * page: it exists to decide which options a menu offers, and `use-scope` says
 * in as many words that a decision which matters does not belong there.
 *
 * Attribution on a feedback note is a decision that matters. A reviewer reading
 * the inbox weighs "Meat Flour Wine said this is wrong" differently from
 * "somebody said this is wrong", and a label anybody can forge in devtools is
 * not attribution.
 */
export async function currentGrant(): Promise<Grant | null> {
  const cfg = gateConfig();
  if (!cfg.ok) return null;
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value, cfg.grants, cfg.secret);
}

/**
 * Whether this session may move a surface's status or read the inbox.
 *
 * The internal grant is the one that reaches every organisation. A merchant
 * grant reaches exactly one, so `orgs` is the discriminator and there is no
 * separate flag to keep in sync with it.
 *
 * **This is the interim rule and it is deliberately conservative.** It rides on
 * the shape of the existing grants rather than on a role anybody administers,
 * which is precisely what the `profiles` table exists to replace.
 */
export async function isStaff(): Promise<boolean> {
  const grant = await currentGrant();
  return grant !== null && (grant.orgs.includes("*") || grant.orgs.length > 1);
}

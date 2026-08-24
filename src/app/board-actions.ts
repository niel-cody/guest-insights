"use server";

import { revalidatePath } from "next/cache";
import { addFeedback, resolveFeedback, setStatus } from "@/lib/board";
import { currentGrant, isStaff } from "@/lib/session";
import { isSentiment, isStatus } from "@/lib/status";

/**
 * Writes to the board, and the only way anything reaches the database.
 *
 * ── Every action re-checks entitlement here ────────────────────────────────
 *
 * `proxy.ts` already refuses an unauthenticated request, so in the ordinary
 * course nothing unauthenticated arrives. That is not a reason to skip the
 * check. **A Server Action is a public POST endpoint** — it is reachable by its
 * own id without ever loading the page that renders its button — so a control
 * that is hidden from a viewer's screen is not a control they cannot invoke.
 * Hiding the status dropdown is presentation; this is the rule.
 */

export type ActionResult = { ok: boolean; error?: string };

/**
 * Move a surface's working state.
 *
 * Staff only. A merchant reviewer may say a page confused them — that is the
 * whole point of sharing it with them — but "reviewing" and "approved" are
 * claims about *this build's* progress, and letting the audience being reviewed
 * set them would make the nav report on itself.
 */
export async function updateStatus(formData: FormData): Promise<ActionResult> {
  if (!(await isStaff())) return { ok: false, error: "Not allowed." };

  const surface = String(formData.get("surface") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!surface) return { ok: false, error: "No surface named." };
  if (!isStatus(status)) return { ok: false, error: "Not one of the five states." };

  const grant = await currentGrant();
  const result = await setStatus(surface, status, grant?.label ?? null);
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/[org]/[period]", "layout");
  return { ok: true };
}

/**
 * Leave feedback. Anybody signed in, which is the point.
 *
 * The path is taken from the form rather than from headers, because a Server
 * Action's own request carries the action's URL and not the page the reader was
 * looking at. It is stored whole, query string included: feedback about a
 * report read with three filters applied is about a different view than the
 * same report unfiltered, and dropping the query loses which one they meant.
 */
export async function submitFeedback(formData: FormData): Promise<ActionResult> {
  const grant = await currentGrant();
  if (!grant) return { ok: false, error: "Sign in first." };

  const sentiment = String(formData.get("sentiment") ?? "");
  if (!isSentiment(sentiment)) return { ok: false, error: "Pick one of the four." };

  const path = String(formData.get("path") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "") || null;

  /**
   * A merchant grant can only file against its own organisation.
   *
   * Not because filing elsewhere would leak anything — it would not — but
   * because an inbox where the organisation field is self-declared is an inbox
   * whose organisation field cannot be used to sort by.
   */
  if (orgSlug && !grant.orgs.includes("*") && !grant.orgs.includes(orgSlug)) {
    return { ok: false, error: "That is not your organisation." };
  }

  const result = await addFeedback({
    surface: String(formData.get("surface") ?? "") || "unknown",
    path,
    orgSlug,
    period: String(formData.get("period") ?? "") || null,
    sentiment,
    body: String(formData.get("body") ?? ""),
    authorLabel: grant.label,
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/[org]/[period]/admin/feedback", "page");
  return { ok: true };
}

/** Mark a note handled, or put it back. Staff only, and nothing is ever deleted. */
export async function toggleResolved(formData: FormData): Promise<ActionResult> {
  if (!(await isStaff())) return { ok: false, error: "Not allowed." };
  const id = String(formData.get("id") ?? "");
  const resolved = String(formData.get("resolved") ?? "") === "true";
  if (!id) return { ok: false, error: "No note named." };

  const result = await resolveFeedback(id, resolved);
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/[org]/[period]/admin/feedback", "page");
  return { ok: true };
}

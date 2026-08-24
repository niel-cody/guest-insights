import { NextResponse } from "next/server";
import { getStatuses } from "@/lib/board";
import { currentGrant, isStaff } from "@/lib/session";

/**
 * What the chrome needs to know that a prerendered page cannot carry.
 *
 * Every report is `force-static`, so the sidebar's status chips and the header's
 * status control cannot be rendered from the database — the HTML was written at
 * build time. They fetch this instead, once, after hydration.
 *
 * ── It is gated, and not by this file ──────────────────────────────────────
 *
 * `proxy.ts` matches everything except `/login`, `_next/static`, `_next/image`
 * and the favicon, so this route is behind the session gate by default rather
 * than by remembering to guard it. The `currentGrant` check below is the second
 * lock, for the same reason the Server Actions carry one: a route handler is a
 * public URL and the matcher is one edit away from being wrong.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const grant = await currentGrant();
  if (!grant) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  return NextResponse.json(
    { statuses: await getStatuses(), staff: await isStaff() },
    // Per-session and changes the moment somebody moves a chip. A shared cache
    // here would serve one reviewer's staff flag to another reviewer.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

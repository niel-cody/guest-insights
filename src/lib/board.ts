import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isSentiment, isStatus, type Sentiment, type Status } from "./status";

/**
 * ═══ The POC's own database, reached only from the server ══════════════════
 *
 * ── Why there is no Supabase client in the browser ─────────────────────────
 *
 * **This repository is public.** A publishable key in the client bundle is a
 * key anybody can read off GitHub, and from that point the only thing standing
 * between a stranger and this data is whether every RLS policy is right. That
 * is a real boundary and it can be made to work — but it is a boundary that has
 * to be re-argued every time a policy changes, on a proof of concept whose
 * schema is going to move weekly.
 *
 * So no key reaches the browser at all. RLS grants `anon` and `authenticated`
 * nothing, anywhere; the service role bypasses RLS and lives only in a
 * server-side environment variable. Every read and write on this page goes
 * through a Server Action or a Route Handler, both of which sit behind
 * `proxy.ts` and therefore behind the existing session gate.
 *
 * The `profiles` table is already in place for the move to Supabase Auth. When
 * that lands, the policies waiting there start doing the work and this file
 * gets smaller.
 *
 * ── `server-only` is load-bearing ──────────────────────────────────────────
 *
 * The import at the top makes it a build error for any client component to
 * import this module, however indirectly. Without it, one careless `import`
 * from a `"use client"` file would bundle the service-role key into the page
 * and publish it. That is not a mistake to rely on code review to catch.
 */

export type BoardConfig =
  | { ok: true; url: string; key: string }
  | { ok: false; reason: string };

/**
 * Read at call time rather than at module scope.
 *
 * Every report page is prerendered at build time, and a module-scope throw on a
 * missing variable would fail the build of three hundred and forty-five static
 * pages that do not need this at all. The board is an addition to the product;
 * it is not allowed to be able to take the reports down.
 */
export function boardConfig(): BoardConfig {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url) return { ok: false, reason: "SUPABASE_URL is not set." };
  if (!key) return { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY is not set." };
  return { ok: true, url, key };
}

function client(cfg: Extract<BoardConfig, { ok: true }>) {
  return createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── surface status ─────────────────────────────────────────────────────────

export type SurfaceStatus = {
  surface: string;
  status: Status;
  note: string | null;
  updatedAt: string;
  updatedByLabel: string | null;
};

/**
 * Every surface somebody has moved. Absent means `todo`.
 *
 * Returns an empty map rather than throwing when the board is unconfigured or
 * unreachable. **A reporting build does not go dark because a side-car is
 * down** — the nav renders every chip as "To do", which is wrong in the same
 * direction as showing nothing and is at least legible.
 */
export async function getStatuses(): Promise<Record<string, SurfaceStatus>> {
  const cfg = boardConfig();
  if (!cfg.ok) return {};
  const { data, error } = await client(cfg)
    .from("surface_status")
    .select("surface, status, note, updated_at, updated_by_label");
  if (error || !data) return {};

  const out: Record<string, SurfaceStatus> = {};
  for (const row of data) {
    if (!isStatus(row.status)) continue;
    out[row.surface] = {
      surface: row.surface,
      status: row.status,
      note: row.note,
      updatedAt: row.updated_at,
      updatedByLabel: row.updated_by_label,
    };
  }
  return out;
}

export async function setStatus(
  surface: string,
  status: Status,
  byLabel: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const cfg = boardConfig();
  if (!cfg.ok) return { ok: false, reason: cfg.reason };
  const { error } = await client(cfg).from("surface_status").upsert(
    {
      surface,
      status,
      updated_at: new Date().toISOString(),
      updated_by_label: byLabel,
    },
    { onConflict: "surface" },
  );
  return error ? { ok: false, reason: error.message } : { ok: true };
}

// ── feedback ───────────────────────────────────────────────────────────────

export type FeedbackRow = {
  id: string;
  surface: string;
  path: string;
  orgSlug: string | null;
  period: string | null;
  sentiment: Sentiment;
  body: string;
  authorLabel: string | null;
  resolved: boolean;
  createdAt: string;
};

export async function addFeedback(input: {
  surface: string;
  path: string;
  orgSlug: string | null;
  period: string | null;
  sentiment: Sentiment;
  body: string;
  authorLabel: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const cfg = boardConfig();
  if (!cfg.ok) return { ok: false, reason: cfg.reason };

  const body = input.body.trim();
  if (!body) return { ok: false, reason: "Say something first." };
  if (body.length > 4000) return { ok: false, reason: "That is longer than 4,000 characters." };
  if (!isSentiment(input.sentiment)) return { ok: false, reason: "Pick one of the four." };

  const { error } = await client(cfg).from("feedback").insert({
    surface: input.surface,
    path: input.path,
    org_slug: input.orgSlug,
    period: input.period,
    sentiment: input.sentiment,
    body,
    author_label: input.authorLabel,
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

export async function listFeedback(): Promise<FeedbackRow[]> {
  const cfg = boardConfig();
  if (!cfg.ok) return [];
  const { data, error } = await client(cfg)
    .from("feedback")
    .select("id, surface, path, org_slug, period, sentiment, body, author_label, resolved, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];

  return data.flatMap((r) =>
    isSentiment(r.sentiment)
      ? [{
          id: r.id,
          surface: r.surface,
          path: r.path,
          orgSlug: r.org_slug,
          period: r.period,
          sentiment: r.sentiment,
          body: r.body,
          authorLabel: r.author_label,
          resolved: r.resolved,
          createdAt: r.created_at,
        }]
      : [],
  );
}

export async function resolveFeedback(id: string, resolved: boolean) {
  const cfg = boardConfig();
  if (!cfg.ok) return { ok: false, reason: cfg.reason };
  const { error } = await client(cfg).from("feedback").update({ resolved }).eq("id", id);
  return error ? { ok: false, reason: error.message } : { ok: true };
}

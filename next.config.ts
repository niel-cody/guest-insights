import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * The build stamp the header renders.
 *
 * ── Why a commit, and not just the version ────────────────────────────────
 *
 * This artefact gets screenshotted and the screenshots travel — into decks,
 * into chat, into a review three weeks later. A screenshot with no build on it
 * cannot be argued with: "the grid showed 4,966 there" is unanswerable when
 * nobody can say which build "there" was, and this repo has changed the meaning
 * of that number more than once.
 *
 * So the stamp is the version *and* the commit. The version says which phase of
 * the plan you are looking at; the commit says exactly which tree produced it,
 * which is the only part that can be checked out and re-run.
 *
 * Vercel supplies the SHA in the environment because there is no git directory
 * in its build container. Locally we ask git. If both fail the stamp says
 * `local` rather than a wrong or stale hash — an unknown build is a fact, and a
 * confidently incorrect one is a trap.
 */
function buildStamp() {
  const version = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version;
  let commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  if (!commit) {
    try {
      commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      commit = "local";
    }
  }
  return { version, commit, date: new Date().toISOString().slice(0, 10) };
}

/**
 * Links minted before the period became a route segment still resolve.
 *
 * `/coffee-guru/overview` was a real, shareable URL and copies of it are in
 * circulation — in chat, in documents, in somebody's bookmarks. Phase 0 was
 * spent making shared links show the right population; a shared link that 404s
 * a week later is the same broken promise arriving by a different route.
 *
 * The redirects are generated from the snapshot at build time rather than
 * hardcoded, so an org whose default period moves keeps working without anyone
 * remembering this file exists. Permanent, because the period-scoped URL is now
 * the canonical one.
 */
const SURFACES = ["overview", "members", "guests", "trade", "venues", "coverage"];

function legacyRedirects() {
  const data = join(process.cwd(), "data");
  const out: { source: string; destination: string; permanent: boolean }[] = [];

  for (const slug of readdirSync(data, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    try {
      const index = JSON.parse(readFileSync(join(data, slug, "periods.json"), "utf8")) as {
        periods: { id: string }[];
      };
      const fallback = index.periods[0]?.id;
      if (!fallback) continue;
      for (const surface of SURFACES) {
        out.push({
          source: `/${slug}/${surface}`,
          destination: `/${slug}/${fallback}/${surface}`,
          permanent: true,
        });
      }
    } catch {
      // A slug with no period index is not deployable anyway; the build will
      // fail on it elsewhere with a better message than this loop could give.
    }
  }
  return out;
}

const stamp = buildStamp();

const nextConfig: NextConfig = {
  // Inlined at build time, which is the only time it can be right — every page
  // here is `force-static`, so there is no request to read it on.
  env: {
    NEXT_PUBLIC_VERSION: stamp.version,
    NEXT_PUBLIC_COMMIT: stamp.commit,
    NEXT_PUBLIC_BUILD_DATE: stamp.date,
  },
  async redirects() {
    return legacyRedirects();
  },
};

export default nextConfig;

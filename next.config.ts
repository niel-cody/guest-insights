import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  async redirects() {
    return legacyRedirects();
  },
};

export default nextConfig;

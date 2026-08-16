/**
 * B2a. Route-level tests for URL state.
 *
 *   npm run test:routes
 *
 * PRD §9.1 B2, verbatim: *"Add route-level test coverage, because the real
 * finding is that a V2 shipped without a test that would have caught it."*
 *
 * ── What these assert, and why it is not the parameter string ──────────────
 *
 * The defect was a parameter that **survived in the URL and was then ignored**.
 * A test asserting that `?daypart=lunch` round-trips through the router would
 * have passed on the broken build. So every assertion here is on the **rendered
 * population** — the rows the surface would actually draw — reached through the
 * same `parseView` and `applyView` the grid itself calls.
 *
 * The round-trip test is the important one: set a view, serialise it the way a
 * user copying the address bar would, parse it back the way a cold load does,
 * and assert the same population. A parameter that survives and is then ignored
 * fails that test, which is the whole point.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { applyView } from "../src/app/[org]/guests/GuestGrid";
import { DEFAULT_VIEW, parseView, toQuery, type View } from "../src/lib/url-state";
import type { Guest, Guests, Org } from "../src/lib/types";

const DATA = join(import.meta.dirname, "..", "data");
const SLUGS = ["coffee-guru", "meat-flour-wine"];

let failures = 0;
let passes = 0;

function check(name: string, pass: boolean, detail = "") {
  if (pass) {
    passes++;
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A cold load: nothing but the query string, exactly as a fresh browser has it. */
function coldLoad(query: string): View {
  const sp = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const values = sp.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }
  return parseView(record);
}

async function main() {
  for (const slug of SLUGS) {
    const [guests, org] = await Promise.all([
      readFile(join(DATA, slug, "guests.json"), "utf8").then((t) => JSON.parse(t) as Guests),
      readFile(join(DATA, slug, "org.json"), "utf8").then((t) => JSON.parse(t) as Org),
    ]);
    const rows = guests.rows;
    console.log(`\n${slug}`);

    const all = applyView(rows, DEFAULT_VIEW);
    check("default view renders the whole working set", all.length === rows.length,
      `${all.length} of ${rows.length}`);

    // ── one test per parameter, asserting the population actually narrows ────
    //
    // Each case is built from the snapshot rather than from a literal, so a
    // merchant with no dinner trade does not fail a test about dayparts.
    const cases: { param: string; query: string; predicate: (g: Guest) => boolean }[] = [];

    cases.push({ param: "tier", query: "tier=member", predicate: (g) => g.tier === "member" });
    cases.push({ param: "tier", query: "tier=card", predicate: (g) => g.tier === "card" });

    const segment = rows.find((g) => g.segment)?.segment;
    if (segment) {
      cases.push({ param: "segment", query: `segment=${segment}`, predicate: (g) => g.segment === segment });
    }

    const band = rows[0]?.valueBand;
    if (band) cases.push({ param: "band", query: `band=${band}`, predicate: (g) => g.valueBand === band });

    // The daypart case is the one that shipped broken. `?daypart=lunch` showed
    // Daypart = All and 17,015 matches on a cold load.
    const daypart = org.dayparts.map((d) => d.key).find((k) => rows.some((g) => g.homeDaypart === k));
    if (daypart) {
      cases.push({ param: "daypart", query: `daypart=${daypart}`, predicate: (g) => g.homeDaypart === daypart });
    }

    const venue = org.venues.find((v) => rows.some((g) => g.homeStoreId === v.id))?.id;
    if (venue) {
      cases.push({ param: "venue", query: `venue=${venue}`, predicate: (g) => g.homeStoreId === venue });
    }

    for (const c of cases) {
      const got = applyView(rows, coldLoad(c.query));
      const want = rows.filter(c.predicate);
      check(
        `cold load of ?${c.query} renders the filtered population`,
        got.length === want.length && got.length > 0 && got.every(c.predicate),
        `${got.length} rendered, ${want.length} expected`,
      );
      check(
        `?${c.query} actually narrows the population`,
        got.length < rows.length,
        `${got.length} of ${rows.length} — the filter changed nothing`,
      );
    }

    // ── the round trip ──────────────────────────────────────────────────────
    //
    // Set state, read the URL, open that URL cold, assert the same population.
    // This is the test the shipped build did not have.
    const composed: View = {
      ...DEFAULT_VIEW,
      tier: "member",
      band: band ?? null,
      daypart: daypart ?? null,
      sort: "visits",
    };
    const inSession = applyView(rows, composed);
    const afterCopyPaste = applyView(rows, coldLoad(toQuery(composed)));
    check(
      "three filters survive a copy-paste into a fresh browser",
      inSession.length === afterCopyPaste.length &&
        inSession.every((g, i) => g.id === afterCopyPaste[i].id),
      `${inSession.length} in session, ${afterCopyPaste.length} after cold load`,
    );
    check("the composed view is not the whole population", inSession.length < rows.length,
      `${inSession.length} of ${rows.length}`);

    // Sort order is part of what the reader sees, so it round-trips too.
    const byVisits = applyView(rows, coldLoad("sort=visits"));
    check("sort survives a cold load",
      byVisits.length > 1 && byVisits[0].visits >= byVisits[1].visits);

    // ── the drawer ──────────────────────────────────────────────────────────
    const someone = inSession[0];
    if (someone) {
      const withDrawer = coldLoad(toQuery({ ...composed, guest: someone.id }));
      const population = applyView(rows, withDrawer);
      check("a drawer opens from a cold-loaded URL",
        withDrawer.guest === someone.id && population.some((g) => g.id === someone.id));
      check("the drawer's filters survive with it", population.length === inSession.length);
    }

    // ── degradation ─────────────────────────────────────────────────────────
    //
    // A link that has been through a mail client must show the default report,
    // not a stack trace and not a silently wrong population.
    for (const junk of [
      "segment=not-a-segment", "band=99", "band=abc", "tier=MEMBER", "page=-4",
      "page=notanumber", "dir=sideways", "guest=", "venue=&venue=", "%zz=1",
    ]) {
      let threw: string | null = null;
      let n = -1;
      try {
        n = applyView(rows, coldLoad(junk)).length;
      } catch (e) {
        threw = (e as Error).message;
      }
      check(`?${junk} degrades to the default view without throwing`,
        threw === null && n === rows.length, threw ?? `rendered ${n} of ${rows.length}`);
    }

    // An unknown parameter is ignored rather than treated as a filter.
    check("an unknown parameter does not change the population",
      applyView(rows, coldLoad("utm_source=slack&fbclid=x")).length === rows.length);

    // ── the contract's own invariants ───────────────────────────────────────
    check("a defaulted view serialises to an empty query", toQuery(DEFAULT_VIEW) === "");
    check("page 1 is not written to the URL", !toQuery({ ...DEFAULT_VIEW, page: 1 }).includes("page"));
    check("page 2 is written to the URL", toQuery({ ...DEFAULT_VIEW, page: 2 }).includes("page=2"));
    check("multiple venues round-trip as repeated parameters",
      coldLoad(toQuery({ ...DEFAULT_VIEW, venue: ["a", "b"] })).venue.join() === "a,b");
  }

  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures) {
    console.error("Route state is not being honoured on cold load. This is release blocker B2.");
    process.exit(1);
  }
  console.log("Every filter, the sort, the page and the drawer survive a cold load and a copy-paste.");
}

main();

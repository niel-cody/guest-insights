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
import { applyView } from "../src/app/[org]/[period]/guests/GuestGrid";
import { DEFAULT_VIEW, parseView, toQuery, type View } from "../src/lib/url-state";
import type { Guest, Guests, Org } from "../src/lib/types";
import { unpackGuests } from "../src/lib/guest-columns";

const DATA = join(import.meta.dirname, "..", "data");
const SLUGS = ["coffee-guru", "meat-flour-wine", "amalfi"];

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
    // Every selectable period is exercised, not only the default — a filter that
    // works on the current window and drops on a historical one is the same
    // defect wearing a different date.
    const index = JSON.parse(
      await readFile(join(DATA, slug, "periods.json"), "utf8"),
    ) as { periods: { id: string }[] };
    for (const period of index.periods.map((p) => p.id)) {
    const [guests, org] = await Promise.all([
      readFile(join(DATA, slug, period, "guests.json"), "utf8").then((t) => JSON.parse(t) as Guests),
      readFile(join(DATA, slug, period, "org.json"), "utf8").then((t) => JSON.parse(t) as Org),
    ]);
    const rows: Guest[] = unpackGuests(guests);
    console.log(`\n${slug} · ${period}`);

    const all = applyView(rows, DEFAULT_VIEW);
    check("default view renders the whole working set", all.length === rows.length,
      `${all.length} of ${rows.length}`);

    // ── one test per parameter, asserting the population actually narrows ────
    //
    // Each case is built from the snapshot rather than from a literal, so a
    // merchant with no dinner trade does not fail a test about dayparts.
    const cases: { param: string; query: string; predicate: (g: Guest) => boolean }[] = [];

    /**
     * A tier is only worth filtering on where the window has both of them.
     *
     * These two were the only literals in a list the comment above promises is
     * built from the snapshot, and a member-spine window is where that caught
     * up with them: it joins no payments, so every row in it is a member.
     * `tier=member` narrows nothing because there is nothing to narrow, and
     * `tier=card` renders an empty page — both correct, and both read as
     * failures against an assertion that assumes two populations.
     *
     * Amalfi is the first organisation to offer such a window, which is why
     * this surfaced now rather than when member windows were built.
     */
    for (const tier of ["member", "card"] as const) {
      const present = rows.some((g) => g.tier === tier);
      const other = rows.some((g) => g.tier !== tier);
      if (present && other) {
        cases.push({ param: "tier", query: `tier=${tier}`, predicate: (g) => g.tier === tier });
      }
    }

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

    // ── the two parameters that were linked to and never implemented ────────
    //
    // Overview's enrolment opportunity links to `?tier=card&minVisits=2` and
    // the cross-venue panel to `?minVenues=2`. Neither was parsed, so the first
    // quietly dropped half its predicate and the second filtered nothing at
    // all — both landed on a population larger than the figure just clicked,
    // with nothing on screen looking wrong. These two cases exist so that
    // cannot happen again silently.
    if (rows.some((g) => g.visits >= 2)) {
      cases.push({ param: "minVisits", query: "minVisits=2", predicate: (g) => g.visits >= 2 });
    }
    if (rows.some((g) => g.venues >= 2)) {
      cases.push({ param: "minVenues", query: "minVenues=2", predicate: (g) => g.venues >= 2 });
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

    // ── the venue scope, which persists across all three reports ────────────
    //
    // §12: the scope survives a hard reload and follows the reader between
    // reports. The mechanism is that it lives in the URL and nowhere else, so
    // the assertion is that a scope-only URL round-trips and selects the same
    // population regardless of which report constructed it.
    if (venue) {
      const scoped = coldLoad(`venue=${venue}`);
      const reloaded = coldLoad(toQuery(scoped));
      check(
        "the Locations scope survives a hard reload",
        applyView(rows, scoped).length === applyView(rows, reloaded).length &&
          reloaded.venue.join() === scoped.venue.join(),
      );
      const twoVenues = org.venues.slice(0, 2).map((v) => v.id);
      if (twoVenues.length === 2) {
        const multi = coldLoad(toQuery({ ...DEFAULT_VIEW, venue: twoVenues }));
        const got = applyView(rows, multi);
        check(
          "a multi-venue scope selects the union, not the intersection",
          got.every((g) => twoVenues.includes(g.homeStoreId)) &&
            got.length >= applyView(rows, coldLoad(`venue=${twoVenues[0]}`)).length,
        );
      }
    }

    // ── the drawer tabs were renamed, and the keys moved with them ──────────
    check("the drawer opens on Who they are by default", coldLoad("guest=abc").tab === "who");
    check("a named tab survives a cold load", coldLoad("guest=abc&tab=behave").tab === "behave");
    check("a retired tab key degrades to the default rather than throwing",
      coldLoad("guest=abc&tab=stats").tab === "who");

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
  }

  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures) {
    console.error("Route state is not being honoured on cold load. This is release blocker B2.");
    process.exit(1);
  }
  console.log("Every filter, the sort, the page and the drawer survive a cold load and a copy-paste.");
}

main();
